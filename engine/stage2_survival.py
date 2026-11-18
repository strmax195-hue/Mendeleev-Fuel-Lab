"""Portable Stage 2 numerical screen. No subprocess, network, or third-party modules."""

import hashlib
import json
import math
from functools import lru_cache
from itertools import combinations
from pathlib import Path

from .elements_db import CEA, MODEL, STOCKS
from .fuel_simulator import validate
from .fuel_quality import QUALITY
from .ignition import ENGINES, ci_delay, livengood_wu, relative_volume
from .materials_db import (
    HARDWARE,
    MATERIALS,
    INCOMPATIBLE,
    at_temperature,
    chemical_ratings,
    retrofit,
    qualified_installation,
)
from .stage2_inputs import (
    DELIVERY_MJ,
    DOSES,
    GRID_PRIMARY,
    INLET_LOSS,
    GDI_FILM,
    GLOW_TIP_K,
    LIQUID_CP,
    START_DOSES,
    MIN_EROI,
    PAIRS,
    PRESSURE,
    PROPERTIES,
    RAIL_PRESSURE,
    SUPPLY_REVIEW,
    WEAR_LIMIT,
)

R = 8.314462618
TREF = 298.15
TEMPS = range(-35, 51)
SPLIT, SOLID, PHASE_REVIEW = 1, 2, 4
ROAD_REFERENCE_C = 15
ROAD_COLUMNS = ("investedMj100", "synthesisKwh100", "eroi", "litres100")
WEATHER_COLUMNS = ("phaseMask", "bubbleKpa", "coldIndex", "viscosityMpas")
ROOT = Path(__file__).resolve().parents[1]


def canonical(value):
    return json.dumps(
        value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False
    )


@lru_cache(maxsize=1)
def model_hash():
    digest = hashlib.sha256(canonical(MODEL["stocks"]).encode())
    digest.update(canonical(MODEL["weights"]).encode())
    for file in (
        "engine/stage2_survival.py",
        "engine/stage2_inputs.py",
        "engine/materials_db.py",
        "engine/fuel_quality.py",
        "engine/ignition.py",
        "engine/elements_db.py",
        "engine/fuel_simulator.py",
        "engine/discovery_solver.py",
        "engine/data/cea.json",
        "docs/thermo.js",
        "engine/stage2_publish.py",
    ):
        # Universal newlines also allow independent replay in Windows working trees.
        digest.update((ROOT / file).read_text(encoding="utf-8").encode())
    scientific_id = digest.hexdigest()
    # Preserve the published scientific identity across the CLI-only migration.
    aliases = json.loads((ROOT / "engine/data/stage2-identities.json").read_text(encoding="ascii"))
    return aliases.get(scientific_id, scientific_id)


def molecular_mass(key):
    """kg/mol, using the same atom inventory as the primary solver."""
    return sum(MODEL["weights"][a] * n for a, n in STOCKS[key]["atoms"].items()) / 1000


def lower_heat(key):
    """Net MJ/mol released to gaseous product water at 298.15 K (Hess's law)."""
    s = STOCKS[key]
    return (
        s["hf"]
        - s["atoms"].get("C", 0) * CEA["CO2"]["hf_j_mol"]
        - s["atoms"].get("H", 0) * CEA["H2O"]["hf_j_mol"] / 2
    ) / 1e6


def normalized(amounts):
    total = sum(amounts.values())
    return {k: v / total for k, v in sorted(amounts.items()) if v > 0}


def parent_volumes(parts):
    return normalized({k: n * molecular_mass(k) / STOCKS[k]["rho"] for k, n in parts.items()})


def wear_proxy(volumes, dose=0.0):
    dry = sum(v * PROPERTIES[k].wear for k, v in volumes.items())
    return PROPERTIES["b100"].wear + (dry - PROPERTIES["b100"].wear) * math.exp(-dose / 0.013)


def select_dose(volumes):
    # Only dry registered C2/C3 alcohols get this separate additive scenario.
    if volumes.keys() <= {"eth", "ipa"} and wear_proxy(volumes) > WEAR_LIMIT:
        for dose in DOSES:
            if wear_proxy(volumes, dose) <= WEAR_LIMIT:
                return dose
    return 0.0


def inventory(parts, dose=0.0):
    """Component mass, moles, energy and volume on a final 1 L basis at 25 °C."""
    validate(parts, reference=True)
    volume = parent_volumes(parts)
    if dose:
        if dose not in DOSES or not volume.keys() <= {"eth", "ipa"}:
            raise ValueError("Unregistered auxiliary ester scenario")
        volume = {k: v * (1 - dose) for k, v in volume.items()}
        volume["b100"] = dose
    kg = {k: v * STOCKS[k]["rho"] for k, v in volume.items()}
    mol = {k: m / molecular_mass(k) for k, m in kg.items()}
    mj = {k: n * lower_heat(k) for k, n in mol.items()}
    return {"volume": volume, "kg": kg, "mol": mol, "mj": mj}


def pairs(keys):
    return [(i, j, PAIRS[tuple(sorted((i, j)))]) for i, j in combinations(keys, 2)]


def activity(x, interactions, kelvin):
    """Activity coefficients from the partial molar derivative of the excess Gibbs function."""
    scale = TREF / kelvin
    excess = sum(a * x[i] * x[j] for i, j, a in interactions)
    log_gamma = dict.fromkeys(x, -excess)
    for i, j, a in interactions:
        log_gamma[i] += a * x[j]
        log_gamma[j] += a * x[i]
    return {k: math.exp(scale * value) for k, value in log_gamma.items()}


@lru_cache(maxsize=3)
def trial_phases(size):
    # Feasible compositions on the closed simplex, including edges and vertices.
    n = 20
    if size == 2:
        return tuple((i / n, (n - i) / n) for i in range(n + 1))
    return tuple((i / n, j / n, (n - i - j) / n) for i in range(n + 1) for j in range(n - i + 1))


def split_below(x, interactions):
    """Highest T (K) with a sampled negative tangent-plane-distance witness below it.

    For a symmetric Margules model TPD/RT = KL(y||x) + (298.15/T) Σ Aij Δi Δj.
    Evaluating the temperature threshold once avoids repeating the simplex search.
    """
    if not interactions:
        return 0.0
    keys = tuple(x)
    z = tuple(x.values())
    ij = [(keys.index(i), keys.index(j), a) for i, j, a in interactions]
    # Include local directions to detect spinodal instability between mesh points.
    trials = list(trial_phases(len(x)))
    for i, j, _ in ij:
        for src, dst in ((i, j), (j, i)):
            trial = list(z)
            eps = min(0.001, z[src] / 2)
            trial[src] -= eps
            trial[dst] += eps
            trials.append(trial)
    highest = 0.0
    for y in trials:
        kl = sum(v * math.log(v / zi) for v, zi in zip(y, z) if v)
        if kl > 1e-12:
            curvature = sum(a * (y[i] - z[i]) * (y[j] - z[j]) for i, j, a in ij)
            highest = max(highest, -TREF * curvature / kl)
    return highest


def phase_mask(x, gamma, temperature, boundary, dosed=False):
    kelvin = temperature + 273.15
    mask = SPLIT if kelvin < boundary else 0
    for k, xi in x.items():
        fusion = PROPERTIES[k].fusion
        tm = STOCKS[k]["melt"]
        if fusion is None:
            # Cloud-point scenario only for neat bulk references, never a pure FAME Tm.
            if xi == 1 and kelvin <= tm:
                mask |= SOLID
        elif kelvin <= tm and math.log(xi * gamma[k]) >= -fusion / R * (1 / kelvin - 1 / tm):
            mask |= SOLID
    if dosed or ("oct" in x and "water" in x and temperature != 25):
        mask |= PHASE_REVIEW
    return mask


@lru_cache(maxsize=1024)
def saturation(key, kelvin):
    s, props = STOCKS[key], PROPERTIES[key]
    t0, p0 = (TREF, props.psat25) if props.psat25 else (s["boil"], PRESSURE)
    return p0 * math.exp(-s["latent"] / R * (1 / kelvin - 1 / t0))


@lru_cache(maxsize=1024)
def log_viscosity(key, kelvin):
    p = PROPERTIES[key]
    slope = math.log(p.mu20 / p.mu40) / (1 / 293.15 - 1 / 313.15)
    return math.log(p.mu20) + slope * (1 / kelvin - 1 / 293.15)


def flash_pressure(moles, interactions):
    """Condensable partial pressure at 37.8 °C, equilibrated with 4 L headspace per L sampled."""
    kelvin = 310.95
    remaining = dict(moles)
    for _ in range(80):
        x = normalized(remaining)
        gamma = activity(x, interactions, kelvin)
        partial = {k: xi * gamma[k] * saturation(k, kelvin) for k, xi in x.items()}
        target = {k: n - partial[k] * 4 / (R * kelvin) for k, n in moles.items()}
        if any(v <= 0 for v in target.values()):
            raise ArithmeticError("Flash exceeded available inventory")
        if max(abs(target[k] - remaining[k]) for k in x) < 1e-11:
            return sum(partial.values())
        remaining = {k: (remaining[k] + target[k]) / 2 for k in x}
    raise ArithmeticError("Headspace flash did not converge")


def cranking_index(partial):
    """Le Chatelier sum of combustible partial pressures relative to the lean limits."""
    return sum(
        p / PRESSURE * 100 / PROPERTIES[k].lfl for k, p in partial.items() if PROPERTIES[k].lfl
    )


def oxygen_demand(key):
    atoms = STOCKS[key]["atoms"]
    return atoms.get("C", 0) + atoms["H"] / 4 - atoms.get("O", 0) / 2


def spray_vapour(feed, coefficients):
    """Isochoric finite-feed flash. coefficients are γ Psat V / RT, in moles."""
    if sum(n / coefficients[k] for k, n in feed.items()) <= 1:
        return feed.copy()
    low, high = 0.0, sum(feed.values())
    for _ in range(34):
        liquid = (low + high) / 2
        if sum(n / (liquid + coefficients[k]) for k, n in feed.items()) > 1:
            low = liquid
        else:
            high = liquid
    liquid = (low + high) / 2
    return {k: n * coefficients[k] / (liquid + coefficients[k]) for k, n in feed.items()}


def spark_charge(x, celsius, factor):
    """One mol of dry air at spark. Bound vapour by injected inventory and compression heat."""
    if not 1 <= factor <= START_DOSES[-1]:
        raise ValueError("Cranking dose outside the declared injector scenario")
    ambient = celsius + 273.15
    cr = ENGINES["gdi"].cr
    ratio = relative_volume(cr, -150) / relative_volume(cr, -10)
    volume_l = R * ambient / PRESSURE / ratio
    dry_k = ambient * ratio**0.28
    stoich = 1 / (4.76 * sum(n * oxygen_demand(k) for k, n in x.items()))
    feed = {k: n * stoich * factor * (1 - GDI_FILM) for k, n in x.items()}
    liquid_capacity = sum(n * liquid_cp(k) for k, n in feed.items())
    cv_air = 2.5 * R
    interactions = pairs(x)

    def balance(kelvin):
        # Hold activity coefficients at the injected composition, while solving the
        # remaining liquid mole fractions and the finite vapour inventory.
        gamma = activity(x, interactions, kelvin)
        coefficients = {k: gamma[k] * saturation(k, kelvin) * volume_l / (R * kelvin) for k in x}
        vapour = spray_vapour(feed, coefficients)
        vaporisation = sum(n * (STOCKS[k]["latent"] - R * kelvin) for k, n in vapour.items())
        return (
            cv_air * (dry_k - kelvin) - liquid_capacity * (kelvin - ambient) - vaporisation,
            vapour,
        )

    low, high = ambient, dry_k
    for _ in range(32):
        t = (low + high) / 2
        if balance(t)[0] > 0:
            low = t
        else:
            high = t
    t = (low + high) / 2
    residual, vapour = balance(t)
    gas_mol = 1 + sum(vapour.values())
    lean = sum(
        100 * n / (gas_mol * PROPERTIES[k].lfl) for k, n in vapour.items() if PROPERTIES[k].lfl
    )
    phi = 4.76 * sum(n * oxygen_demand(k) for k, n in vapour.items())
    return {
        "status": (
            "feasible"
            if lean >= 1 - 1e-10 and 0.65 - 1e-10 <= phi <= 1.45 + 1e-10
            else "insufficient"
        ),
        "factor": factor,
        "leanIndex": round(lean, 6),
        "phi": round(phi, 6),
        "chargeK": round(t, 4),
        "chargeKpa": round(gas_mol * R * t / volume_l, 4),
        "energyResidualJ": round(residual, 8),
    }


def liquid_cp(key):
    # Bulk distillate and FAME are surrogates with an assumed 2.0 kJ/(kg K).
    if key in {"b100", "diesel"}:
        return 2000 * molecular_mass(key)
    return LIQUID_CP[key]


def glow_start(x, celsius, tip_k=GLOW_TIP_K):
    """Local pilot parcel by a heated plug in the 16.5:1 compression-ignition engine."""
    # Currently only the two registered bulk CI stocks have cold-flow inputs.
    if len(x) != 1 or next(iter(x)) not in {"diesel", "b100"}:
        return {"status": "unsupported", "factor": None}
    key = next(iter(x))
    cn = QUALITY[key][1]
    ambient = celsius + 273.15
    # Of a 0.25 mg per-hole pilot, this scenario entrains 15% into 1 mg of adjacent air.
    air_kg = 1e-6
    fuel_mol = 0.25e-6 * 0.15 / molecular_mass(key)
    air_mol = air_kg / 0.028965
    phi = fuel_mol * 4.76 * oxygen_demand(key) / air_mol
    gas_fraction = fuel_mol / (fuel_mol + air_mol)
    heat_capacity = air_kg * 1100
    conductance = 1000 * 40e-6  # h A, W/K, on the plug-facing pilot parcel
    cp_fuel = fuel_mol * liquid_cp(key)
    samples = []
    peak_k = 0.0
    engine = ENGINES["diesel"]
    for a in range(-10, 16):
        compression = relative_volume(engine.cr, -150) / relative_volume(engine.cr, a)
        bulk_k = ambient * compression**0.28
        pressure = PRESSURE * compression**1.28
        exposure_s = (a + 10) / (6 * 200)
        warm = -math.expm1(-conductance * exposure_s / heat_capacity)
        dry_k = bulk_k + warm * max(0.0, tip_k - bulk_k)
        # Debit the entire local pilot's sensible and latent enthalpy before declaring ignition.
        local_k = (heat_capacity * dry_k + cp_fuel * ambient - fuel_mol * STOCKS[key]["latent"]) / (
            heat_capacity + cp_fuel
        )
        peak_k = max(peak_k, local_k)
        delay = math.inf
        if (
            local_k >= 686.15
            and phi >= 0.35
            and gas_fraction * pressure <= saturation(key, local_k)
        ):
            delay = ci_delay(local_k, pressure * 1000, cn, 200, engine.stroke)
        samples.append((a, delay))
    integral, onset = livengood_wu(samples, 200)
    return {
        "status": "feasible" if onset is not None else "insufficient",
        "factor": round(1 / 0.86, 4) if onset is not None else None,
        "tipK": tip_k,
        "peakLocalK": round(peak_k, 4),
        "phi": round(phi, 6),
        "delayIntegral": round(integral, 6),
        "onsetAtdc": None if onset is None else round(onset, 5),
    }


def assisted_start(x, celsius, phase, ci):
    method = "glow-ci" if ci else "enriched-gdi"
    if phase & (SPLIT | SOLID):
        return {"method": method, "status": "phase-blocked", "factor": None}
    if ci:
        return {"method": method, **glow_start(x, celsius)}
    best = None
    for factor in START_DOSES:
        trial = spark_charge(x, celsius, factor)
        if trial["status"] == "feasible":
            return {"method": method, **trial}
        if best is None or abs(trial["phi"] - 1) < abs(best["phi"] - 1):
            best = trial
    return {"method": method, **best, "testedFactor": best["factor"], "factor": None}


def dry_cold_index(parts, *, check_phase):
    """One-temperature dry-carbonate pre-screen for prioritising Stage 1 visits."""
    if parts.keys() != {"eth", "ipa", "dmc"}:
        raise ValueError("Expected a dry alcohol-carbonate ternary")
    validate(parts)
    x = {k: n / 100 for k, n in parts.items()}
    t = min(TEMPS)
    kelvin = t + 273.15
    interactions = pairs(x)
    gamma = activity(x, interactions, kelvin)
    if check_phase and phase_mask(x, gamma, t, split_below(x, interactions)) & (SPLIT | SOLID):
        return None
    return cranking_index({k: x[k] * gamma[k] * saturation(k, kelvin) for k in x})


@lru_cache(maxsize=1)
def dry_cold_bound():
    """Optimistic maximum over the entire 1 mol% simplex before solid/LLE exclusion."""
    points = 0
    best, best_parts = 0.0, {}
    for dmc in range(1, 99):
        for ipa in range(1, 100 - dmc):
            p = {"eth": 100 - dmc - ipa, "ipa": ipa, "dmc": dmc}
            points += 1
            value = dry_cold_index(p, check_phase=False)
            if value > best:
                best, best_parts = value, p
    return {"gridPoints": points, "upperIndex": round(best, 7), "parts": best_parts}


def screen(parts):
    """Temperature profile, compatibility and energy inventory, independent of a road cycle."""
    validate(parts, reference=True)
    parent = parent_volumes(parts)
    dose = select_dose(parent)
    mix = inventory(parts, dose)
    x = normalized(mix["mol"])
    interactions = pairs(x)
    boundary = split_below(x, interactions)
    ci = any(k in parts for k in ("diesel", "b100"))
    weather = []
    starts = {}
    for t in TEMPS:
        kelvin = t + 273.15
        gamma = activity(x, interactions, kelvin)
        phase = phase_mask(x, gamma, t, boundary, bool(dose))
        if t in (-35, -30) or (ci and t <= 0):
            starts[str(t)] = assisted_start(x, t, phase, ci)
        if phase & (SPLIT | SOLID):
            weather.append([phase, None, None, None])
            continue
        partial = {k: xi * gamma[k] * saturation(k, kelvin) for k, xi in x.items()}
        cold = None if ci else cranking_index(partial)
        mu = math.exp(sum(xi * log_viscosity(k, kelvin) for k, xi in x.items()))
        weather.append(
            [
                phase,
                round(sum(partial.values()), 5),
                None if cold is None else round(cold, 5),
                round(mu, 5),
            ]
        )
    flash_phase = phase_mask(x, activity(x, interactions, 310.95), 37.8, boundary, bool(dose))
    rvp = (
        None
        if flash_phase & (SPLIT | SOLID)
        else round(flash_pressure(mix["mol"], interactions), 5)
    )
    chem = chemical_ratings(mix["volume"])
    breaks = sorted({min(TEMPS)} | {low for _, low in MATERIALS.values() if low in TEMPS})
    assemblies = {}
    for name in HARDWARE:
        bands = []
        for t in breaks:
            verdict = retrofit(at_temperature(chem, t), name)
            if not bands or verdict != bands[-1][1]:
                bands.append([t, verdict])
        assemblies[name] = bands
    total_mass, net_mj = sum(mix["kg"].values()), sum(mix["mj"].values())
    kwh = sum(m * PROPERTIES[k].kwh for k, m in mix["kg"].items())
    other = sum(m * PROPERTIES[k].other_mj for k, m in mix["kg"].items())
    return {
        "weather": weather,
        "coldStart": starts,
        "cycle": "Diesel" if ci else "Otto",
        "rvpKpa": rvp,
        "doseVolPct": 100 * dose,
        "wearBeforeUm": round(wear_proxy(parent), 2),
        "wearUm": round(wear_proxy(parent, dose), 2),
        "chemical": chem,
        "assemblies": assemblies,
        "retrofit": {p: retrofit(at_temperature(chem, min(TEMPS)), p) for p in HARDWARE},
        "volumes": {k: round(v, 9) for k, v in mix["volume"].items()},
        "kgL": round(total_mass, 9),
        "mjL": round(net_mj, 9),
        "kwhL": round(kwh, 9),
        "upstreamMjL": round(other, 9),
        "supplyReview": bool(parts.keys() & SUPPLY_REVIEW),
    }


def road_account(s, row, celsius=ROAD_REFERENCE_C):
    """Steady 100 km, fixed pressure and warmed powertrain, with ambient-density drag."""
    density_ratio = (273.15 + ROAD_REFERENCE_C) / (273.15 + celsius)
    drag = row["dragN"] * density_ratio
    wheel_delta = (drag - row["dragN"]) / 10  # MJ at the wheels over 100 km
    tank_mj = row["mjKm"] * 100 + wheel_delta / row["eta"]
    litres = tank_mj / s["mjL"]
    mass = s["kgL"] * litres
    electricity = litres * s["kwhL"]
    external = litres * s["upstreamMjL"] + electricity * 3.6 * GRID_PRIMARY + mass * DELIVERY_MJ
    wheel = (drag + row["rollN"]) / 10
    return {
        "litres100": round(litres, 5),
        "fuelMj100": round(tank_mj, 5),
        "wheelMj100": round(wheel, 5),
        "investedMj100": round(external, 5),
        "eroi": round(wheel / external, 5),
        "synthesisKwh100": round(electricity, 5),
    }


def road_profile(s, row):
    ledgers = [road_account(s, row, t) for t in TEMPS]
    reference = ledgers[ROAD_REFERENCE_C - min(TEMPS)]
    return {**reference, "weather": [[a[k] for k in ROAD_COLUMNS] for a in ledgers]}


def gate(s, account, reference_mj, weather_limits=None):
    """A fail blocks advancement; assumptions requiring measurement remain visible."""
    fails, reviews = [], []
    flags = [w[0] for w in s["weather"]]
    cold, hot = s["weather"][0], s["weather"][-1]
    if any(f & SPLIT for f in flags):
        fails.append("Liquid–liquid split")
    if any(f & SOLID for f in flags):
        fails.append("Crystallisation / cloud point")
    if any(f & PHASE_REVIEW for f in flags):
        reviews.append("Phase envelope needs bench data")
    assisted = s["coldStart"][str(min(TEMPS))]["status"]
    if assisted == "unsupported":
        reviews.append("Cold-start ignition quality outside the modeled domain")
    elif assisted == "insufficient":
        if s["cycle"] == "Diesel":
            fails.append("No timely −35 °C glow-assisted pilot ignition")
        elif cold[2] is None or cold[2] < 1:
            fails.append("Insufficient −35 °C vapour at ambient or enriched GDI spark conditions")
    # A hot plug cannot remedy cold filter plugging. The two bulk CI stocks lack grade-specific CFPP.
    if s["cycle"] == "Diesel":
        reviews.append("Cold filterability needs a measured fuel-grade CFPP")
    if hot[1] is None:
        reviews.append("Hot pressure margin unavailable in the selected phase state")
    elif min(RAIL_PRESSURE, PRESSURE - INLET_LOSS) <= hot[1]:
        fails.append("Hot fuel supply has no positive pressure margin")
    installation = qualified_installation(s["chemical"], TEMPS)
    if installation["verdict"] == INCOMPATIBLE:
        fails.append("No qualified metal and seal assembly across the temperature envelope")
    if cold[3] is not None and cold[3] > 30.0:
        fails.append("Cold pump viscosity exceeds the 30 mPa·s circuit scenario")
    if s["cycle"] == "Diesel":
        mu40 = s["weather"][40 - min(TEMPS)][3]
        upper = 6.0 if "b100" in s["volumes"] else 4.1
        if mu40 is None or not 1.9 <= mu40 / s["kgL"] <= upper:
            fails.append("40 °C kinematic viscosity outside the selected diesel band")
    if s["wearUm"] > WEAR_LIMIT:
        fails.append("Wear proxy exceeds pump screen")
    if s["doseVolPct"]:
        reviews.append("Ester wear response in alcohol needs measurement")
    weather = account.get("weather", [])
    lowest_eroi = min((w[2] for w in weather), default=account["eroi"])
    if lowest_eroi < MIN_EROI:
        fails.append("Wheel EROI below 1")
    exceeds_reference = account["investedMj100"] > reference_mj
    if weather_limits is not None:
        if len(weather) != len(TEMPS) or len(weather_limits) != len(TEMPS):
            raise ValueError("Energy gate requires matching temperature grids")
        exceeds_reference = any(w[0] > limit for w, limit in zip(weather, weather_limits))
    if exceeds_reference:
        fails.append("Upstream primary energy exceeds AI-95")
    if s["supplyReview"] or s["doseVolPct"]:
        reviews.append("Pathway / ester supply needs capacity evidence")
    return {
        "status": "rejected" if fails else "review" if reviews else "passed",
        "installation": installation,
        "failures": fails,
        "reviews": reviews,
    }
