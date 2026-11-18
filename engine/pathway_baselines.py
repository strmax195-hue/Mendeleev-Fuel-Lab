"""Comparable solar input and compartment screening priors. Source boundaries in STAGE4.md."""

from .reservoirs import CROP_LIGHT_EFFICIENCY, ETHANOL_RECOVERY, SOLAR_PROCESS_EFFICIENCY

# Bulk soil and aerobic water DT50 in days. These are screening/literature analogues.
DT50_DAYS = {
    "eth": (30, 15),
    "ipa": (30, 15),
    "dmc": (30, 15),
    "oct": (300, 150),
    "b100": (round(10**2.13, 6), round(10**1.32, 6)),
    "diesel": (round(10**2.25, 6), round(10**1.85, 6)),
    "ai95": (78, 78),
    "water": None,  # inorganic diluent, excluded from the organic mass denominator
}
SOLAR_ROUTES = {
    "eth": "crop ethanol",
    "water": "water treatment",
    "ipa": "biomethanol carbon equivalent",
    "dmc": "biomethanol carbon equivalent",
    "oct": "biomethanol carbon equivalent",
    "b100": "rapeseed FAME comparator",
    "ai95": "wood-to-FT comparator",
    "diesel": "wood-to-FT comparator",
}


def solar_input(key, carbon_atoms, net_mj, process_mj):
    """Incident MJ per mole on one stated comparison route per family."""
    process_light = process_mj / SOLAR_PROCESS_EFFICIENCY
    if key == "water":
        return process_light
    if key == "eth":
        return net_mj / (CROP_LIGHT_EFFICIENCY * ETHANOL_RECOVERY) + process_light
    if key in ("ai95", "diesel"):
        # Biomass-to-finished hydrocarbon yield includes plant losses.
        return net_mj / (CROP_LIGHT_EFFICIENCY * 0.45)
    if key == "b100":
        # 38,910.6 MJ FAME/ha/y; declared irradiation 1,200 kWh/m²/y.
        land_light = 1200 * 3.6 * 10000
        return net_mj * land_light / 38910.6 + process_light
    # One mole of biomethanol per mole of product carbon, 60% biomass-to-methanol LHV.
    c1_mj = carbon_atoms * 0.03204 * 19.9
    return c1_mj / (CROP_LIGHT_EFFICIENCY * 0.60) + process_light


def mixture_dt50(kg, compartment):
    rates = [(float(m), DT50_DAYS[k][compartment]) for k, m in kg.items() if DT50_DAYS[k]]
    if not rates:
        return None
    target = sum(m for m, _ in rates) / 2
    lo, hi = min(d for _, d in rates), max(d for _, d in rates)
    for _ in range(50):
        mid = (lo + hi) / 2
        if sum(m * 2 ** (-mid / d) for m, d in rates) > target:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2, 6)
