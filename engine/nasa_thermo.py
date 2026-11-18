"""Independent SI thermodynamic checks for the browser/Node combustion kernel."""

import math
from .elements_db import CEA, NASA7

R, T_REF = 8.31446261815324, 298.15


def properties(species, temperature):
    """Molar Cp, H and S. Enthalpy is anchored to the CEA value at 298.15 K."""
    if not 200 <= temperature <= 6000:
        raise ValueError("NASA-7 temperature out of range")

    def polynomial(a, t):
        cp = sum(a[i] * t**i for i in range(5))
        h = a[5] + sum(a[i] * t ** (i + 1) / (i + 1) for i in range(5))
        s = a[0] * math.log(t) + a[6] + sum(a[i] * t**i / i for i in range(1, 5))
        return R * cp, R * h, R * s

    low, high = NASA7[species]
    cp, h, s = polynomial(low if temperature < 1000 else high, temperature)
    return cp, h - polynomial(low, T_REF)[1] + CEA[species]["hf_j_mol"], s


def check_combustion(row):
    """Reconstruct atom totals and first-law residual from unrounded output."""
    c, h, o = (row["atoms"][key] for key in ("C", "H", "O"))
    oxygen = c + h / 4 - o / 2
    for kind, cycle in row["cycles"].items():
        hot = cycle["hot"]
        expected = {
            "C": c,
            "H": h,
            "O": o + 2 * oxygen * cycle["lambda"],
            "N": 2 * 3.76 * oxygen * cycle["lambda"],
        }
        for element, value in expected.items():
            actual = sum(n * CEA[s]["atoms"].get(element, 0) for s, n in hot.items())
            if not math.isclose(actual, value, abs_tol=1e-9) or min(hot.values()) < -1e-10:
                raise ArithmeticError(f"Failed {element} balance")
        t = cycle["peakK"]
        energy = sum(n * properties(s, t)[1] for s, n in hot.items())
        if kind == "Otto":
            energy -= sum(hot.values()) * R * t
        if abs(energy - cycle["targetJ"]) > 0.002 or abs(row["flameResidualJ"]) > 0.002:
            raise ArithmeticError("Combustion energy residual exceeds 2 mJ/mol")
