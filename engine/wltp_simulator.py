"""WLTC Class 3b wheel, engine, catalyst and sump balances on the official 1 Hz trace."""

import csv
from functools import lru_cache
import math
from pathlib import Path

from .elements_db import VEHICLES
from .stage3_calibration import ENGINES, RPMS, fuel

PHASES = (("Low", 589), ("Medium", 1022), ("High", 1477), ("Extra-high", 1800))
TRACE = Path(__file__).with_name("data") / "wltc_class3b.csv"
GEARS = (3.75, 2.14, 1.48, 1.12, 0.89, 0.72)
AMBIENT_C = 23.0
TRANSMISSION = 0.91
AUX_KW = 0.70
OIL_CAP_KM = 10000
# 4 kg sump; mass fractions of water, fuel, and reserve depletion in equivalent g KOH.
SUMP_LIMITS_G = (8.0, 120.0, 8.0)


@lru_cache(maxsize=1)
def speeds():
    with TRACE.open(encoding="ascii", newline="") as f:
        rows = list(csv.DictReader(f))
    if [int(r["second"]) for r in rows] != list(range(1801)):
        raise ValueError("Expected all 1,801 WLTC Class 3b speed samples")
    return tuple(float(r["km_h"]) for r in rows)


def wheel_step(before_kmh, after_kmh):
    """Joules and metres over one second of linear speed interpolation."""
    u, v = before_kmh / 3.6, after_kmh / 3.6
    m, cda, crr = VEHICLES["Sedan"]
    distance = (u + v) / 2
    rho = 101325 / (287.05 * (AMBIENT_C + 273.15))
    aero = 0.5 * rho * cda * (u**3 + u * u * v + u * v * v + v**3) / 4
    roll = crr * m * 9.80665 * distance
    kinetic = 0.5 * m * 1.04 * (v * v - u * u)
    net = aero + roll + kinetic
    return distance, aero, roll, kinetic, max(net, 0), max(-net, 0)


def blend(a, b, f):
    return a + (b - a) * f


class BrakeMap:
    """Interpolate brake torque and chemical power, then choose a feasible gear."""

    def __init__(self, calibration, spec, e):
        self.e = e
        self.idle_kw = (4.6 if e.diesel else 5.9) * (e.litres / 2) ** 0.65
        self.lines = []
        for row in calibration["cells"]:
            self.lines.append(
                [
                    (
                        None
                        if c is None or c["torqueNm"] <= 0
                        else (
                            c["torqueNm"],
                            c["fuelMg"] * 1e-6 * spec["lhv"],
                            bool(c["reasons"] or c["lspiReview"]),
                            c["lambda"],
                        )
                    )
                    for c in row
                ]
            )

    def points(self, rpm):
        base = min(
            len(RPMS) - 2,
            next((i for i in range(len(RPMS) - 1) if rpm <= RPMS[i + 1]), len(RPMS) - 2),
        )
        f = max(0, min(1, (rpm - RPMS[base]) / (RPMS[base + 1] - RPMS[base])))
        pts = []
        for a, b in zip(self.lines[base], self.lines[base + 1]):
            if a is not None and b is not None:
                torque = blend(a[0], b[0], f)
                fuel_kw = blend(a[1], b[1], f) * 4 * rpm / 120 / 1000
                flagged = (a[2] and f < 1) or (b[2] and f > 0)
                pts.append((torque, fuel_kw, flagged, blend(a[3], b[3], f)))
        return sorted(pts)

    def operate(self, speed, shaft_kw, cut):
        if speed < 1e-8:
            return 800, self.idle_kw + shaft_kw / 0.25, shaft_kw, False, 2 if self.e.diesel else 1
        wheel_rpm = speed / (2 * math.pi * 0.31) * 60
        gears = [
            (wheel_rpm * 3.8 * g, i)
            for i, g in reversed(list(enumerate(GEARS)))
            if 1000 <= wheel_rpm * 3.8 * g <= 4000
        ]
        if not gears:
            gears = [(max(1000, min(4000, wheel_rpm * 3.8 * GEARS[0])), 0)]
        best = None
        for rpm, _ in gears:
            if cut:
                return rpm, 0.0, 0.0, False, 1.0
            pts = self.points(rpm)
            if not pts:
                continue
            omega = rpm * math.pi / 30
            torque = shaft_kw * 1000 / omega
            prev = (0, self.idle_kw * (0.65 + 0.35 * rpm / 800), False, pts[0][3])
            for curr in pts:
                if torque <= curr[0]:
                    f = (torque - prev[0]) / (curr[0] - prev[0]) if curr[0] > prev[0] else 0
                    return (
                        rpm,
                        blend(prev[1], curr[1], f),
                        shaft_kw,
                        (prev[2] and f < 1) or (curr[2] and f > 0),
                        blend(prev[3], curr[3], f),
                    )
                prev = curr
            available = prev[0] * omega / 1000
            if best is None or available > best[2]:
                best = rpm, prev[1], available, True, prev[3]
        return best or (1000, self.idle_kw, 0.0, True, 1.0)


def thermal_step(temp, source_kw, conductance, capacity):
    """Exact one-second constant-source lumped balance, °C, kW/K and kJ/K."""
    equilibrium = AMBIENT_C + source_kw / conductance
    decay = math.exp(-conductance / capacity)
    return equilibrium + (temp - equilibrium) * decay


def oil_interval(transforms, distance_km, kms):
    """First threshold under repeated cold cycles, including within-cycle peaks."""
    if distance_km <= 0:
        raise ValueError("Positive cycle distance required")
    last = transforms[-1]

    def start_mass(cycles, a, b):
        if cycles == 0:
            return 0.0
        if a == 0:
            return b
        return b * cycles if a == 1 else b * (-math.expm1(cycles * math.log(a))) / (1 - a)

    def crossing(n):
        initial = [start_mass(n, a, b) for a, b in last]
        for j, coeffs in enumerate(transforms):
            for k, (a, b) in enumerate(coeffs):
                if a * initial[k] + b >= SUMP_LIMITS_G[k]:
                    return n * distance_km + kms[j], ("water", "fuel dilution", "acid reserve")[k]
        return None

    lo, hi = 0, math.ceil(OIL_CAP_KM / distance_km)
    if crossing(hi) is None:
        return OIL_CAP_KM, "scenario service cap"
    while lo < hi:
        mid = (lo + hi) // 2
        if crossing(mid) is None:
            lo = mid + 1
        else:
            hi = mid
    km, reason = crossing(lo)
    return (math.floor(km), reason) if km < OIL_CAP_KM else (OIL_CAP_KM, "scenario service cap")


def simulate(key, cal):
    if not cal["cells"]:
        return None
    e = ENGINES[cal["architecture"]]
    s = fuel(key)
    grid = BrakeMap(cal, s, e)
    trace = speeds()
    phases = []
    curve = [[0, trace[0], AMBIENT_C, AMBIENT_C]]
    temp = oil_temp = AMBIENT_C
    coeffs = [(1.0, 0.0)] * 3
    transforms = []
    kms = []
    km = 0.0
    light = None
    phase = 0
    names = (
        "distanceM",
        "aeroJ",
        "rollJ",
        "kineticJ",
        "tractionJ",
        "brakeJ",
        "fuelJ",
        "shaftJ",
        "exhaustJ",
        "coolingJ",
        "transmissionLossJ",
        "accessoryJ",
        "frictionBrakeJ",
        "unmetWheelJ",
        "unmetAuxJ",
        "fuelCutS",
        "limitedS",
    )
    total = dict.fromkeys(names, 0.0)
    part = total.copy()
    for t, (v0, v1) in enumerate(zip(trace, trace[1:]), 1):
        dist, aero, roll, kin, tr, br = wheel_step(v0, v1)
        speed = (v0 + v1) / 7.2
        recovery = min(br * TRANSMISSION, AUX_KW * 1000) if speed > 5 else 0
        # At launch the clutch transmits wheel torque at a lower shaft speed.
        first_gear_rpm = speed / (2 * math.pi * 0.31) * 60 * 3.8 * GEARS[0]
        drive_eff = TRANSMISSION * min(1, first_gear_rpm / RPMS[0]) if tr else TRANSMISSION
        demand = tr / drive_eff + AUX_KW * 1000 - recovery
        rpm, fuel_kw, shaft_kw, flagged, lam = grid.operate(speed, demand / 1000, demand < 1e-8)
        # Cold friction/wall losses decay with sump temperature.
        fuel_kw *= 1 + 0.16 * max(0, min(1, (80 - oil_temp) / (80 - AMBIENT_C)))
        shaft = shaft_kw * 1000
        fuel_j = fuel_kw * 1000
        unused = fuel_j - shaft
        if unused < -1e-6:
            raise ArithmeticError("Brake work exceeded fuel energy")
        exhaust = 0.54 * unused
        cooling = unused - exhaust
        fuel_kg = fuel_j / s["lhv"]
        aux_need = AUX_KW * 1000 - recovery
        supplied = min(tr, max(0, shaft - aux_need) * drive_eff)
        lost = supplied * (1 / drive_eff - 1) + recovery * (1 / TRANSMISSION - 1)
        # Air continues through the engine on overrun. Steady exhaust enthalpy feeds a brick.
        mass_flow = fuel_kg * (1 + s["afr"] * lam) if fuel_kg else 0.004 * (rpm / 1000)
        ua_ex = 0.62 * mass_flow * 1.09
        prev = temp
        temp = thermal_step(temp, 0.62 * exhaust / 1000, 0.005 + ua_ex, 0.95)
        if light is None and prev < 300 <= temp:
            light = t - 1 + (300 - prev) / (temp - prev)
        oil_ua = 0.012 + 0.075 * max(0, min(1, (oil_temp - 82) / 15))
        oil_temp = thermal_step(oil_temp, 0.25 * cooling / 1000, oil_ua, 24)
        cold = max(0, min(1, (85 - oil_temp) / 62))
        blowby = 0.004 * (1 + 0.6 * cold)
        gas_water = fuel_kg * s["waterProduct"] * 1000 * blowby
        water = gas_water * (0.012 + 0.16 * max(0, min(1, (65 - oil_temp) / 42)))
        dilution = (
            fuel_kg
            * 1000
            * (0.00020 + 0.0018 * cold)
            * (1.5 if cal["architecture"] == "gdi" else 1)
        )
        # Upper sulfur scenario 10 mg/kg; 2 mol KOH equivalents per mol sulfur oxidised.
        acid = fuel_kg * 0.010 * (2 * 56.105 / 32.06) * blowby + 0.0008 * water
        added = (water, dilution, acid)
        rates = (
            0.00056 * math.exp((oil_temp - 60) / 15),
            0.000045 * math.exp((oil_temp - 60) / 30),
            0.0,
        )
        coeffs = [
            (a * math.exp(-k), b * math.exp(-k) + inc * (-math.expm1(-k) / k if k else 1))
            for (a, b), inc, k in zip(coeffs, added, rates)
        ]
        km += dist / 1000
        kms.append(km)
        transforms.append(coeffs)
        vals = (
            dist,
            aero,
            roll,
            kin,
            tr,
            br,
            fuel_j,
            shaft,
            exhaust,
            cooling,
            lost,
            AUX_KW * 1000,
            br - recovery / TRANSMISSION,
            tr - supplied,
            max(0, aux_need - shaft),
            float(fuel_kw == 0),
            float(flagged),
        )
        for name, value in zip(names, vals):
            total[name] += value
            part[name] += value
        if t % 5 == 0 or t == PHASES[phase][1]:
            curve.append([t, v1, round(temp, 2), round(oil_temp, 2)])
        if t == PHASES[phase][1]:
            phases.append(
                {
                    "name": PHASES[phase][0],
                    "endS": t,
                    **{k: round(v, 3) for k, v in part.items()},
                    "litres100": (
                        round(part["fuelJ"] / s["lhv"] / s["rho"] * 100000 / part["distanceM"], 4)
                        if part["unmetWheelJ"] + part["unmetAuxJ"] <= 1
                        else None
                    ),
                }
            )
            phase += 1
            part = dict.fromkeys(names, 0.0)
    followed = total["unmetWheelJ"] + total["unmetAuxJ"] <= 1
    service, reason = oil_interval(transforms, km, kms) if followed else (None, "unmet cycle duty")
    return {
        "traceFollowed": followed,
        "trace": "WLTC Class 3b",
        "seconds": 1800,
        "km": round(km, 6),
        "litres100": (
            round(total["fuelJ"] / s["lhv"] / s["rho"] * 100 / km, 4) if followed else None
        ),
        "lightOffS": None if light is None else round(light, 2),
        "catalyst": "DOC" if e.diesel else "TWC",
        "phases": phases,
        "totals": {k: round(v, 3) for k, v in total.items()},
        "curve": curve,
        "oil": {
            "retainedWaterG": round(coeffs[0][1], 6),
            "retainedFuelG": round(coeffs[1][1], 6),
            "acidGkoh": round(coeffs[2][1], 7),
            "modelDrainKm": service,
            "limiting": reason,
            "vehicleApprovedKm": None,
        },
    }
