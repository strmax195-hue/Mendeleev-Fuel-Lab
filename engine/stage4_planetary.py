"""Fleet demand, elemental abundance and independent deterministic Stage 4 replay."""

import hashlib
import math
from functools import lru_cache
from .biosphere_cycle import WEIGHTS, amounts, atom_ledger, audit, q
from .elements_db import PPM, STOCKS
from .reservoirs import (
    AIR_PPM,
    OCEAN_PPM,
    CROP_LIGHT_EFFICIENCY,
    ETHANOL_RECOVERY,
    SOLAR_PROCESS_EFFICIENCY,
)
from .stage2_survival import ROOT, lower_heat
from .stage3_calibration import ENGINES, admitted, fuel
from .stage3_publish import digest, model_hash as calibration_hash, projection

FLEET = 1_000_000_000
KM_YEAR = 12_000
FRESH_KG_YEAR = 43_000 * 1e12  # runoff and recharge, not seawater inventory
NPP_C_KG_YEAR = 60e12  # net terrestrial primary production, not harvestable surplus
ATM_KG = 5.1e18
OCEAN_WATER_KG = 1.338e9 * 1e12
# Illustrative incremental allocation ceilings, with strict inequalities.
WATER_SHARE = 0.001
NPP_SHARE = 0.01


@lru_cache(maxsize=1)
def model_hash():
    h = hashlib.sha256(calibration_hash().encode("ascii"))
    for file in (
        "stage4_planetary.py",
        "biosphere_cycle.py",
        "reservoirs.py",
        "pathway_baselines.py",
    ):
        h.update((ROOT / "engine" / file).read_text(encoding="utf-8").encode())
    return h.hexdigest()


def ceiling(demand, limit):
    if not math.isfinite(demand) or demand < 0 or not math.isfinite(limit) or limit <= 0:
        raise ValueError("Expected finite physical demand and a positive annual allocation")
    return {
        "kgYear": round(demand, 4),
        "limitKgYear": limit,
        "usePct": round(100 * demand / limit, 6),
        "within": demand < limit,
    }


def resources(parts, dose, litres100, fleet=FLEET, km_year=KM_YEAR):
    if (
        isinstance(fleet, bool)
        or not isinstance(fleet, int)
        or fleet <= 0
        or not all(math.isfinite(v) and v > 0 for v in (litres100, km_year))
    ):
        raise ValueError("Expected a positive fleet, annual distance and WLTC consumption")
    litres = fleet * km_year * litres100 / 100
    kg, mol = amounts(parts, dose)
    _, _, oxygen, products = atom_ledger(mol)
    carbon = {
        k: float(n * q(STOCKS[k]["atoms"].get("C", 0)) * WEIGHTS["C"] / 1000) * litres
        for k, n in mol.items()
    }
    # One count of each source. Waste oil has its own throughput requirement.
    biomass_c = (
        carbon.get("eth", 0) * 1.5
    )  # theoretical minimum fermentable carbon: glucose -> 2 ethanol + 2 CO2
    bound_water = float(products["H2O"] * (2 * WEIGHTS["H"] + WEIGHTS["O"]) / 1000) * litres
    elements = {
        e: round(
            float(sum(n * q(STOCKS[k]["atoms"].get(e, 0)) for k, n in mol.items()) * w / 1000)
            * litres,
            4,
        )
        for e, w in WEIGHTS.items()
    }
    elements.update({k: 0 for k in ("Fe", "Si", "Na", "Ca", "Mg")})  # direct fuel inventory only
    abundance = {
        e: {"crust": PPM.get(e), "atmosphere": AIR_PPM.get(e), "ocean": OCEAN_PPM.get(e)}
        for e in sorted(set(elements) | {"Fe", "Si", "Mg", "Na", "Ca"})
    }
    water = ceiling(bound_water, FRESH_KG_YEAR * WATER_SHARE)
    crop = ceiling(biomass_c, NPP_C_KG_YEAR * NPP_SHARE)
    air_n2 = float(products["N2"] * 2 * WEIGHTS["N"] / 1000) * litres
    co2_kg = sum(carbon.values()) * float((WEIGHTS["C"] + 2 * WEIGHTS["O"]) / WEIGHTS["C"])
    air_co2_stock = ATM_KG * 0.000420 * 44.0095 / 28.965
    mj = sum(float(n) * lower_heat(k) for k, n in mol.items())
    synthesis = sum(float(m) * STOCKS[k]["synthesisMjKg"] for k, m in kg.items())
    solar = None
    if all(STOCKS[k]["solarRoute"] for k in kg):
        photons = synthesis / SOLAR_PROCESS_EFFICIENCY
        if "eth" in mol:
            photons += (
                float(mol["eth"]) * lower_heat("eth") / (CROP_LIGHT_EFFICIENCY * ETHANOL_RECOVERY)
            )
        solar = round(100 * mj / photons, 7)
    return {
        "vehicles": fleet,
        "kmPerVehicleYear": km_year,
        "litresYear": round(litres, 3),
        "elementKgYear": elements,
        "abundanceMassPpm": abundance,
        "annualWaterEquivalent": water,
        "annualCropCarbon": crop,
        "wasteEsterKgYear": round(float(kg.get("b100", 0)) * litres, 3),
        "annualCarbonByStockKg": {k: round(v, 3) for k, v in carbon.items()},
        "annualN2ThroughputKg": round(air_n2, 3),
        "netIdealNitrogenDrawKg": 0,
        "annualO2ThroughputKg": round(float(oxygen * 2 * WEIGHTS["O"] / 1000) * litres, 3),
        "co2ReturnKgYear": round(co2_kg, 3),
        "co2ReturnPctAtmosphericStock": round(100 * co2_kg / air_co2_stock, 7),
        "waterEquivalentPctOceanStock": round(100 * bound_water / OCEAN_WATER_KG, 10),
        "netEnergyReturn": round(mj / synthesis, 7),
        "solarToTankPct": solar,
        "comparisonSolarPct": round(
            100 * mj / sum(float(n) * STOCKS[k]["comparisonSolarMjMol"] for k, n in mol.items()), 7
        ),
        "comparisonRoutes": sorted({STOCKS[k]["comparisonRoute"] for k in mol}),
        "fuelEnergyMjYear": round(mj * litres),
        "synthesisMjYear": round(synthesis * litres),
        "resourceStatus": "review" if water["within"] and crop["within"] else "exceeds",
        "unverified": [
            "Regional water withdrawals and ecosystem flows",
            "Supply-chain mineral and catalyst losses",
            "Feedstock provenance, competing uses and sustainable annual supply",
        ],
    }


@lru_cache(maxsize=96)
def compute(key, arch):
    parts = admitted(key)
    if arch not in ENGINES:
        raise ValueError("Unknown engine architecture")
    run = projection(key)["architectures"][arch]
    w = run["wltc"]
    if not w or not w["traceFollowed"] or w["litres100"] is None:
        raise ValueError("A followed Stage 3 WLTC trace is required")
    dose = fuel(key)["doseVolPct"] / 100
    cycle = audit(parts, dose)
    fleet = resources(parts, dose, w["litres100"])
    gates = {
        "resourceSupply": fleet["resourceStatus"],
        "atomConservation": "passed",
        "actualMaterialRecovery": "review" if cycle["measuredReturnPct"] != 100 else "passed",
        "soilAndWater": cycle["spill"]["persistentSoilWaterToxicity"],
        "ozone": cycle["wholePathOzoneDepletion"],
        "greenhouseByproducts": cycle["zeroGreenhouseByproducts"],
    }
    verdict = (
        "failed"
        if any(v in {"failed", "exceeds"} for v in gates.values())
        else "passed" if all(v == "passed" for v in gates.values()) else "review"
    )
    payload = {
        "schema": 4,
        "model": model_hash(),
        "stage3Model": calibration_hash(),
        "candidate": key,
        "architecture": arch,
        "stage3Status": run["status"],
        "litres100": w["litres100"],
        "resources": fleet,
        "biosphere": cycle,
        "gates": gates,
        "outcome": verdict,
    }
    return {"payload": payload, "sha256": digest(payload)}


def verify(bundle):
    if not isinstance(bundle, dict) or set(bundle) != {"payload", "sha256"}:
        raise ValueError("Invalid Stage 4 envelope")
    p = bundle["payload"]
    if not isinstance(p, dict) or p.get("schema") != 4 or p.get("model") != model_hash():
        raise ValueError("Different Stage 4 model")
    if not isinstance(bundle["sha256"], str) or digest(p) != bundle["sha256"]:
        raise ValueError("Stage 4 SHA-256 mismatch")
    expected = compute(p["candidate"], p["architecture"])
    if expected["sha256"] != bundle["sha256"]:
        raise ValueError("Independent planetary replay disagrees")
    return expected


def submission(bundle):
    p = bundle["payload"]
    return " ".join(
        ("fuel-lab-replay-v1", p["candidate"], p["architecture"], p["model"], bundle["sha256"])
    )
