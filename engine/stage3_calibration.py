"""Crank-angle combustion and relative ECU maps for three declared research engines."""

from dataclasses import dataclass
from functools import lru_cache
import math

from .discovery_solver import catalogue, identity
from .elements_db import CEA, REFERENCES, STOCKS
from .fuel_quality import QUALITY
from .stage2_survival import inventory, normalized, screen

RPMS = (1000, 1500, 2000, 3000, 4000)
LOADS = (0.2, 0.4, 0.6, 0.8, 1.0)
AIR_R = 287.05
ATM = 101325.0


@dataclass(frozen=True)
class Engine:
    name: str
    ref: str
    cr: float
    litres: float
    stroke: float
    gauge_bar: float
    flow_mg_ms: float  # reference effective flow at fixed injector pressure drop
    dead_ms: float
    injection_window: float  # usable crank degrees per four-stroke cycle
    peak_limit_bar: float

    @property
    def diesel(self):
        return self.ref == "diesel"


ENGINES = {
    "mpi": Engine("Naturally aspirated MPI", "ai95", 10.5, 2.0, 0.086, 0, 3.6, 0.70, 540, 120),
    "gdi": Engine("Downsized GDI turbo", "ai95", 10.0, 1.4, 0.080, 1.8, 13.0, 0.30, 270, 155),
    "diesel": Engine("Common-rail diesel", "diesel", 16.5, 2.0, 0.090, 0.8, 35.0, 0.22, 60, 190),
}


def admitted(key):
    if key in catalogue():
        return catalogue()[key]
    for ref in REFERENCES:
        if key == identity({ref: 100}):
            return {ref: 100}
    raise ValueError("Candidate or reference is outside the registered catalogue")


@lru_cache(maxsize=128)
def fuel(key):
    parts = admitted(key)
    weather = screen(parts)
    mixture = inventory(parts, weather["doseVolPct"] / 100)
    atoms = {
        e: sum(n * STOCKS[k]["atoms"].get(e, 0) for k, n in mixture["mol"].items())
        for e in ("C", "H", "O")
    }
    oxygen = atoms["C"] + atoms["H"] / 4 - atoms["O"] / 2
    mass = sum(mixture["kg"].values())
    air = oxygen * (CEA["O2"]["molar_mass"] + 3.76 * CEA["N2"]["molar_mass"]) / 1000
    energy = sum(mixture["mj"].values())
    # Preserve the full additive inventory. A small uncharacterised ester fraction
    # permits a parent-kinetics projection but prevents model qualification.
    combustible = normalized({k: v for k, v in mixture["volume"].items() if k != "water"})

    def blend_value(column):
        known = {k: v for k, v in combustible.items() if QUALITY[k][column] is not None}
        if sum(known.values()) < 0.98 - 1e-12:
            return None
        return sum(v * QUALITY[k][column] for k, v in normalized(known).items())

    return {
        "id": key,
        "rho": mass,
        "lhv": energy / mass * 1e6,
        "afr": air / mass,
        "ron": blend_value(0),
        "cn": blend_value(1),
        "sl": blend_value(2),
        "water": mixture["kg"].get("water", 0) / mass,
        "waterProduct": atoms["H"] / 2 * CEA["H2O"]["molar_mass"] / 1000 / mass,
        "latent": sum(n * STOCKS[k]["latent"] for k, n in mixture["mol"].items()) / mass,
        "massFractions": normalized(mixture["kg"]),
        "doseVolPct": weather["doseVolPct"],
        "coldWeather": weather["weather"][5],
    }


def si_delay(temperature, pressure_pa, octane):
    """Douaud–Eyzat implementation in seconds, with pressure in atmospheres."""
    if min(temperature, pressure_pa, octane) <= 0:
        raise ValueError("Positive absolute temperature, pressure and octane required")
    return (
        0.01768
        * (octane / 100) ** 3.402
        * (pressure_pa / ATM) ** -1.7
        * math.exp(3800 / temperature)
    )


def ci_delay(temperature, pressure_pa, cn, rpm, stroke):
    """Hardenberg–Hase pressure-rise delay converted from crank degrees to seconds."""
    bar = pressure_pa / 1e5
    if min(temperature, pressure_pa, cn, rpm, stroke) <= 0:
        raise ValueError("Positive diesel ignition inputs required")
    if bar <= 12.4:
        return math.inf
    activation = 618840 / (cn + 25)
    log_factor = (
        activation * (1 / (8.31446 * temperature) - 1 / 17190) + (21.2 / (bar - 12.4)) ** 0.63
    )
    if log_factor > 700:
        return math.inf
    piston_speed = 2 * stroke * rpm / 60
    return (0.36 + 0.22 * piston_speed) * math.exp(log_factor) / (6 * rpm)


def livengood_wu(samples, rpm):
    """Trapezoidal integral of dt/tau; locate unity under a linearly varying rate."""
    if rpm <= 0:
        raise ValueError("Positive crank speed required")
    integral, onset, previous = 0.0, None, None
    for theta, tau in samples:
        if not math.isfinite(theta) or not tau > 0:
            raise ValueError("Invalid ignition delay sample")
        rate = 1 / tau
        if previous is not None:
            angle, old_rate = previous
            span = theta - angle
            if span <= 0:
                raise ValueError("Crank angles must increase")
            dt = span / (6 * rpm)
            gain = dt * (old_rate + rate) / 2
            if onset is None and integral + gain >= 1:
                target = (1 - integral) / dt
                # Stable root of old_rate*f + (rate-old_rate)*f²/2 = target.
                f = (
                    2
                    * target
                    / (old_rate + math.sqrt(max(0, old_rate**2 + 2 * (rate - old_rate) * target)))
                )
                onset = angle + span * f
            integral += gain
        previous = theta, rate
    return integral, onset


def laminar_speed(s, temperature, pressure_pa, phi):
    if s["sl"] is None or not 0.65 <= phi <= 1.45:
        return None
    shape = max(0.0, 1 - 2.4 * (phi - 1.08) ** 2) / (1 - 2.4 * 0.08**2)
    return (
        s["sl"]
        * shape
        * (temperature / 298.15) ** (2.18 - 0.8 * (phi - 1))
        * (pressure_pa / ATM) ** (-0.16 + 0.22 * (phi - 1))
        * math.exp(-2.2 * s["water"])
    )


def volume(e, theta):
    r = math.radians(theta)
    swept = e.litres * 0.001 / 4
    return swept * (
        1 / (e.cr - 1) + (1 - math.cos(r) + 3.5 - math.sqrt(3.5**2 - math.sin(r) ** 2)) / 2
    )


@lru_cache(maxsize=6)
def geometry(e):
    return [(t, volume(e, t)) for t in range(-150, 151, 2)]


def inlet(e, load, s):
    if e.diesel:
        pressure, lam = ATM + 1e5 * e.gauge_bar * load, 1.40 / load**0.65
    else:
        wide_open = ATM + 1e5 * e.gauge_bar if e.gauge_bar else 0.98 * ATM
        pressure, lam = 0.25 * ATM + (wide_open - 0.25 * ATM) * load, 1.0
    boost_ratio = max(1, pressure / ATM)
    after_cooler = 302 * (1 + 0.30 * (boost_ratio**0.286 - 1) / 0.72)
    evaporated = 0.0 if e.diesel else 0.45 if e.gauge_bar else 0.27
    temp = max(250, after_cooler - evaporated * s["latent"] / (1006 * s["afr"] * lam))
    air = pressure * (e.litres * 0.001 / 4) * 0.92 / (AIR_R * temp)
    return pressure, temp, lam, air


def active_pulse_ms(s, e, air_kg, lam):
    # Orifice mass flow for the same effective area, Cd and pressure drop scales as √rho.
    rho_ref = STOCKS[e.ref]["rho"]
    return air_kg / (s["afr"] * lam) * 1e6 / (e.flow_mg_ms * math.sqrt(s["rho"] / rho_ref))


def cold_start(s, e):
    phase, bubble, lean, _ = s["coldWeather"]
    if phase & 3:
        return {"factor": None, "status": "Split or solid at −30 °C"}
    if e.diesel:
        if s["cn"] is None or s["cn"] < 20:
            return {"factor": None, "status": "Cetane input outside the diesel delay domain"}
        inlet_k = 243.15
        points = [
            (
                a,
                ci_delay(
                    inlet_k * (volume(e, -150) / v) ** 0.28,
                    ATM * (volume(e, -150) / v) ** 1.28,
                    s["cn"],
                    200,
                    e.stroke,
                ),
            )
            for a, v in geometry(e)
            if -10 <= a <= 30
        ]
        _, onset = livengood_wu(points, 200)
        if onset is None or onset > 15:
            return {"factor": None, "status": "No timely unheated compression ignition"}
        return {"factor": round(1 / 0.86, 4), "status": "Scenario for 14% cold wall loss"}
    if lean is None or lean < 1:
        return {"factor": None, "status": "Saturated charge below lean ignition limit"}
    # First-order vapor release from a cold wall film during two cranking revolutions.
    film = 0.35 if e.gauge_bar else 0.55
    release = 1 - math.exp(-0.60 * bubble / 20)
    return {
        "factor": round(1 / (1 - film + film * release), 4),
        "status": "Unheated wall-film scenario",
    }


def ignition_and_burn(s, e, rpm, advance, pulse, p0, t0, lam):
    swept = e.litres * 0.001 / 4
    v0 = geometry(e)[0][1]
    start = -advance
    if e.diesel:
        ts = [(start, volume(e, start))] + [(a, v) for a, v in geometry(e) if start < a <= 48]
        _, onset = livengood_wu(
            (
                (a, ci_delay(t0 * (v0 / v) ** 0.35, p0 * (v0 / v) ** 1.35, s["cn"], rpm, e.stroke))
                for a, v in ts
            ),
            rpm,
        )
        if onset is None:
            return None
        return onset, max(12, pulse * 0.006 * rpm + 10), None, onset - start
    ratio = v0 / volume(e, start)
    sl = laminar_speed(s, t0 * ratio**0.35, p0 * ratio**1.35, 1 / lam)
    if not sl:
        return None
    bore = math.sqrt(4 * swept / (math.pi * e.stroke))
    piston = 2 * e.stroke * rpm / 60
    turbulent = sl + 0.90 * piston * math.sqrt(sl / 0.65)
    duration = 6 * rpm * 0.48 * bore / turbulent
    return start, duration, sl, None


def crank_cell(s, e, rpm, load, advance):
    p0, t0, lam, air = inlet(e, load, s)
    pulse = active_pulse_ms(s, e, air, lam)
    burn = ignition_and_burn(s, e, rpm, advance, pulse, p0, t0, lam)
    if burn is None:
        return None
    start, span, sl, lag = burn

    # Bounded Wiebe heat release; span is CA99, followed by exhaust blowdown.
    def fraction(theta):
        u = max(0, min(1, (theta - start) / span))
        return -math.expm1(-4.60517 * u**3) / 0.99

    def angle(f):
        return start + span * (-math.log(1 - 0.99 * f) / 4.60517) ** (1 / 3)

    ca50, ca90 = angle(0.5), angle(0.9)
    fuel_kg = air / (s["afr"] * lam)
    heat = fuel_kg * s["lhv"]
    g = 1.35
    grid = geometry(e)
    _, vlast = grid[0]
    p, peak, work, last_fraction = p0, p0, 0.0, 0.0
    delay_samples = []
    # Include the exact end-gas extinction angle for the knock integral.
    limit = angle(0.98)
    prev_theta = grid[0][0]
    if not e.diesel:
        delay_samples.append((prev_theta, si_delay(t0, p0, s["ron"])))
    for theta, v in grid[1:]:
        burned = fraction(theta)
        # A midpoint heat impulse between two polytropic half steps.
        vm = math.sqrt(v * vlast)
        pn = (
            p * (vlast / v) ** g
            + (g - 1) * 0.89 * heat * (burned - last_fraction) / vm * (vm / v) ** g
        )
        work += (p + pn) / 2 * (v - vlast)
        if not e.diesel and prev_theta < limit:
            end = min(theta, limit)
            pe = p + (pn - p) * (end - prev_theta) / (theta - prev_theta)
            tu = t0 * (pe / p0) ** ((g - 1) / g)
            delay_samples.append((end, si_delay(tu, pe, s["ron"])))
        peak = max(peak, pn)
        p, vlast, last_fraction, prev_theta = pn, v, burned, theta
    integral, onset = livengood_wu(delay_samples, rpm)
    swept = e.litres * 0.001 / 4
    pumping = (max(ATM, p0) * 1.04 - p0) * swept
    friction = (0.65 + 0.00012 * rpm) * 1e5 * swept
    brake = work - pumping - friction
    bmep = brake / swept / 1e5
    reasons = []
    if not e.diesel and integral >= 1:
        reasons.append("End-gas autoignition")
    if e.diesel and (lag > 25 or start > 12):
        reasons.append("Delayed compression ignition")
    if ca90 > 45:
        reasons.append("Late heat release")
    if peak / 1e5 > e.peak_limit_bar:
        reasons.append("Cylinder-pressure ceiling")
    delivered_fraction = min(1, e.injection_window / (pulse * 0.006 * rpm))
    actual_phi = delivered_fraction / lam
    if delivered_fraction < 1:
        reasons.append("Injector window exceeded")
    if not e.diesel and actual_phi < 0.75:
        reasons.append("Lean misfire margin exhausted")
    if brake <= 0:
        reasons.append("No positive brake work")
    lspi = bool(not e.diesel and e.gauge_bar and rpm <= 2000 and bmep >= 14)
    return {
        "btdc": advance,
        "lambda": lam,
        "achievablePhi": actual_phi,
        "pulseMs": pulse + e.dead_ms,
        "effectiveMs": pulse,
        "airMg": air * 1e6,
        "fuelMg": fuel_kg * 1e6,
        "ca50": ca50,
        "ca90": ca90,
        "peakBar": peak / 1e5,
        "lw": None if e.diesel else integral,
        "knockAt": onset,
        "delayDeg": lag,
        "flameSpeedMps": sl,
        "bmepBar": bmep,
        "torqueNm": 4 * brake / (4 * math.pi),
        "efficiency": max(0, brake / heat),
        "lspiReview": lspi,
        "reasons": reasons,
    }


def optimised_cell(s, e, rpm, load):
    # Target CA50 near 8° ATDC. An earlier candidate is accepted only inside all limits.
    if e.diesel:
        timings = range(2, 29, 2)
    else:
        p, t, lam, air = inlet(e, load, s)
        ms = active_pulse_ms(s, e, air, lam)
        burn = ignition_and_burn(s, e, rpm, 12, ms, p, t, lam)
        ideal = round((burn[1] * 0.53 - 8) / 2) * 2
        timings = list(
            dict.fromkeys(
                [max(-4, min(36, ideal + d)) for d in (0, 2, 4, -2, -4, -6, -8, -12, -16)]
                + [0, -2, -4]
            )
        )
    cells = [c for a in timings if (c := crank_cell(s, e, rpm, load, a)) is not None]
    if not cells:
        return None
    return min(
        cells,
        key=lambda c: (
            bool(c["reasons"]),
            len(c["reasons"]),
            max(0, (c["lw"] or 0) - 1),
            abs(c["ca50"] - 8),
            -c["efficiency"],
        ),
    )


@lru_cache(maxsize=6)
def reference_cells(arch):
    e = ENGINES[arch]
    s = fuel(identity({e.ref: 100}))
    return [[optimised_cell(s, e, r, l) for l in LOADS] for r in RPMS]


def calibration(key, arch):
    e, s = ENGINES[arch], fuel(key)
    cold = cold_start(s, e)
    out = {
        "architecture": arch,
        "reference": identity({e.ref: 100}),
        "cold": cold,
        "rpms": list(RPMS),
        "loads": list(LOADS),
        "cells": [],
    }
    if (e.diesel and (s["cn"] is None or s["cn"] < 20)) or (
        not e.diesel and (s["ron"] is None or s["sl"] is None)
    ):
        out.update(
            status="unsupported", reasons=["Missing or out-of-domain ignition-quality inputs"]
        )
        return out
    reference = reference_cells(arch)
    reasons = set()
    if not e.diesel and s["doseVolPct"]:
        reasons.add("Trace ester SI kinetics need blend measurements")
    for i, rpm in enumerate(RPMS):
        row = []
        for j, load in enumerate(LOADS):
            ref = reference[i][j]
            c = ref if key == out["reference"] else optimised_cell(s, e, rpm, load)
            if c is None:
                reasons.add("No ignition in the integration window")
                row.append(None)
                continue
            if ref is None:
                reasons.add("Reference ignition unavailable")
            reasons.update(c["reasons"])
            if c["lspiReview"]:
                reasons.add("Low-speed pre-ignition needs a lubricated-engine test")
            cell = {
                **c,
                "pulsePct": 100 * c["pulseMs"] / ref["pulseMs"] if ref else None,
                "offsetDeg": c["btdc"] - ref["btdc"] if ref else None,
            }
            row.append({k: round(v, 6) if isinstance(v, float) else v for k, v in cell.items()})
        out["cells"].append(row)
    if cold["factor"] is None:
        reasons.add(cold["status"])
    out.update(status="screened" if not reasons else "limited", reasons=sorted(reasons))
    return out
