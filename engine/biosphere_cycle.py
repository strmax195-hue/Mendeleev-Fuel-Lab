"""Exact combustion/ideal return ledger and compartment-specific spill evidence."""

from fractions import Fraction
from .elements_db import MODEL, STOCKS
from .fuel_simulator import validate
from .stage2_inputs import DOSES


def q(value):
    return Fraction(str(value))


WEIGHTS = {e: q(w) for e, w in MODEL["weights"].items()}  # g/mol
AIR_N2_O2 = q(3.76)
# Aquifer microcosm range, see STAGE4.md. No transfer to field soil or surface water.
AQUIFER_DT50_D = {"eth": (3.0, 7.0)}


def amounts(parts, dose=0):
    """Exact mol and kg per final additive-volume litre at reference density."""
    validate(parts, reference=True)
    if dose and (dose not in DOSES or not parts.keys() <= {"eth", "ipa"}):
        raise ValueError("Unregistered auxiliary ester fraction")
    masses = {
        k: sum(WEIGHTS[e] * q(n) for e, n in STOCKS[k]["atoms"].items()) / 1000 for k in parts
    }
    volumes = {k: x * masses[k] / q(STOCKS[k]["rho"]) for k, x in parts.items()}
    total = sum(volumes.values())
    kg = {k: v / total * (1 - q(dose)) * q(STOCKS[k]["rho"]) for k, v in volumes.items()}
    if dose:
        kg["b100"] = q(dose) * q(STOCKS["b100"]["rho"])
        masses["b100"] = sum(WEIGHTS[e] * q(n) for e, n in STOCKS["b100"]["atoms"].items()) / 1000
    return kg, {k: mass / masses[k] for k, mass in kg.items()}


def atom_ledger(mol):
    fuel = {e: sum(n * q(STOCKS[k]["atoms"].get(e, 0)) for k, n in mol.items()) for e in WEIGHTS}
    oxygen = fuel["C"] + fuel["H"] / 4 - fuel["O"] / 2
    nitrogen = oxygen * AIR_N2_O2
    inputs = {**fuel, "O": fuel["O"] + 2 * oxygen, "N": fuel["N"] + 2 * nitrogen}
    products = {"CO2": fuel["C"], "H2O": fuel["H"] / 2, "N2": nitrogen + fuel["N"] / 2}
    outputs = {
        "C": products["CO2"],
        "H": 2 * products["H2O"],
        "N": 2 * products["N2"],
        "O": 2 * products["CO2"] + products["H2O"],
    }
    if inputs != outputs or oxygen < 0:
        raise ValueError("Elemental ledger failed closure")
    return inputs, outputs, oxygen, products


def spill(kg, oxygen):
    total = sum(kg.values())
    organic = {k: v for k, v in kg.items() if k != "water"}
    known = {k: v for k, v in organic.items() if k in AQUIFER_DT50_D}
    unknown = sum(organic.values()) - sum(known.values())

    def remainder(day, side):
        return sum(
            float(v / total) * 2 ** (-day / AQUIFER_DT50_D[k][side]) for k, v in known.items()
        )

    half = list(AQUIFER_DT50_D["eth"]) if set(organic) == {"eth"} else None
    return {
        "aquiferOrganicDt50Days": half,
        "soilDt50Days": None,
        "surfaceWaterDt50Days": None,
        "aquiferOrganicKgPerKgAt28Days": [
            round(remainder(28, 0), 8),
            round(remainder(28, 1) + float(unknown / total), 8),
        ],
        "knownKineticsOrganicMassFraction": round(
            float(sum(known.values()) / sum(organic.values())), 7
        ),
        "theoreticalOxygenDemandKgPerKg": round(float(oxygen * 2 * WEIGHTS["O"] / 1000 / total), 8),
        "persistentSoilWaterToxicity": "unverified",
        "evidenceNeeded": [
            "Field soil and aquatic fate, metabolites and chronic mixture endpoints",
            "Receiving-water dilution, oxygen demand and reaeration",
        ],
    }


def audit(parts, dose=0):
    kg, mol = amounts(parts, dose)
    before, after, oxygen, products = atom_ledger(mol)
    # Reconstruct each admitted stock by reducing CO2 + H2O, including oxygen bound in that stock.
    returned = {e: Fraction() for e in WEIGHTS}
    fixed_co2 = fixed_water = released_o2 = Fraction()
    for k, n in mol.items():
        formula = {e: q(v) for e, v in STOCKS[k]["atoms"].items()}
        carbon, water = n * formula.get("C", 0), n * formula.get("H", 0) / 2
        fixed_co2 += carbon
        fixed_water += water
        released_o2 += (2 * carbon + water - n * formula.get("O", 0)) / 2
        for e, v in formula.items():
            returned[e] += n * v
    returned["O"] += 2 * released_o2
    returned["N"] += 2 * products["N2"]
    if returned != before or fixed_co2 != products["CO2"] or fixed_water != products["H2O"]:
        raise ValueError("Ideal feedstock regeneration failed atomic closure")
    # Store exact rational strings; all material inputs include combustion air.
    exact = lambda values: {k: str(v) for k, v in values.items()}
    co2 = products["CO2"] * (WEIGHTS["C"] + 2 * WEIGHTS["O"]) / 1000
    halogens = sum(
        n * q(STOCKS[k]["atoms"].get(e, 0)) for k, n in mol.items() for e in ("F", "Cl", "Br", "I")
    )
    return {
        "basis": "1 final litre at 25 C; stoichiometric complete oxidation",
        "reactantAtomsMol": exact(before),
        "productAtomsMol": exact(after),
        "regeneratedAtomsMol": exact(returned),
        "idealReverseO2Mol": str(released_o2),
        "productsMol": exact(products),
        "massResidualKg": str(sum((before[k] - after[k]) * w / 1000 for k, w in WEIGHTS.items())),
        "atomsAccountedPct": 100,
        "measuredReturnPct": None,
        "grossCo2KgPerL": round(float(co2), 9),
        "zeroGreenhouseByproducts": "failed" if co2 > 0 else "unverified",
        "halogenAtomMolPerL": str(halogens),
        "wholePathOzoneDepletion": "unverified",
        "traceGasEvidence": "CH4, N2O and incomplete combustion require measured speciation",
        "spill": spill(kg, oxygen),
    }
