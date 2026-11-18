"""Portable Stage 2 numerical screen. No subprocess, network, or third-party modules."""

import hashlib
import json
import math
from functools import lru_cache
from itertools import combinations
from pathlib import Path

from .elements_db import CEA, MODEL, STOCKS
from .fuel_simulator import validate
from .materials_db import (
    HARDWARE,
    MATERIALS,
    INCOMPATIBLE,
    at_temperature,
    chemical_ratings,
    retrofit,
)
from .stage2_inputs import (
    DELIVERY_MJ,
    DELIVERY_USD,
    DOSES,
    GRID_PRIMARY,
    INLET_LOSS,
    MIN_EROI,
    PAIRS,
    POWER_PRICE,
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
ROAD_COLUMNS = ("wtwUsd100", "electricityUsd100", "eroi", "litres100")
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
        "engine/elements_db.py",
        "engine/fuel_simulator.py",
        "engine/discovery_solver.py",
        "engine/data/cea.json",
        "docs/thermo.js",
        "engine/stage2_publish.py",
        "cli/local_worker.py",
    ):
        # Universal newlines also allow independent replay in Windows working trees.
        digest.update((ROOT / file).read_text(encoding="utf-8").encode())
    return digest.hexdigest()


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
    for t in TEMPS:
        kelvin = t + 273.15
        gamma = activity(x, interactions, kelvin)
        phase = phase_mask(x, gamma, t, boundary, bool(dose))
        if phase & (SPLIT | SOLID):
            weather.append([phase, None, None, None])
            continue
        partial = {k: xi * gamma[k] * saturation(k, kelvin) for k, xi in x.items()}
        # Le Chatelier sum over combustible vapours in air; 1 is the lean limit.
        cold = (
            sum(
                p / PRESSURE * 100 / PROPERTIES[k].lfl
                for k, p in partial.items()
                if PROPERTIES[k].lfl
            )
            if not ci
            else None
        )
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
    price = sum(m * STOCKS[k]["price"] for k, m in mix["kg"].items())
    return {
        "weather": weather,
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
        "gateUsdL": round(price, 9),
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
        "electricityUsd100": round(electricity * POWER_PRICE, 5),
        "wtwUsd100": round(litres * s["gateUsdL"] + mass * DELIVERY_USD, 5),
    }


def road_profile(s, row):
    ledgers = [road_account(s, row, t) for t in TEMPS]
    reference = ledgers[ROAD_REFERENCE_C - min(TEMPS)]
    return {**reference, "weather": [[a[k] for k in ROAD_COLUMNS] for a in ledgers]}


def gate(s, account, reference_cost, weather_limits=None):
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
    if s["cycle"] == "Otto":
        if cold[2] is None:
            reviews.append("Cranking volatility unavailable in the cold phase state")
        elif cold[2] < 1:
            fails.append("Insufficient −35 °C cranking volatility")
    else:
        reviews.append("Compression ignition needs cold-soak and filterability tests")
    if hot[1] is None:
        reviews.append("Hot pressure margin unavailable in the selected phase state")
    elif min(RAIL_PRESSURE, PRESSURE - INLET_LOSS) <= hot[1]:
        fails.append("Hot fuel supply has no positive pressure margin")
    if s["retrofit"]["stock"] == INCOMPATIBLE:
        fails.append("Stock wetted metals or seal system unsuitable / unqualified")
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
    over_budget = account["wtwUsd100"] > reference_cost
    if weather_limits is not None:
        if len(weather) != len(TEMPS) or len(weather_limits) != len(TEMPS):
            raise ValueError("Economic gate requires matching temperature grids")
        over_budget = any(w[0] > limit for w, limit in zip(weather, weather_limits))
    if over_budget:
        fails.append("Delivered cost exceeds AI-95")
    if s["supplyReview"] or s["doseVolPct"]:
        reviews.append("Pathway / ester supply needs capacity evidence")
    return {
        "status": "rejected" if fails else "review" if reviews else "passed",
        "failures": fails,
        "reviews": reviews,
    }
