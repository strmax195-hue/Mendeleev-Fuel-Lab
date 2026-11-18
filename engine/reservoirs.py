"""Representative elemental mass ppm in three distinct reservoirs, with source boundaries in STAGE4.md."""

# Dry air at a stated 420 ppmv CO2 reference composition (NOAA/NASA).
DRY_AIR_MOLAR_MASS = 28.965
AIR_PPM = {
    "N": 1e6 * 0.7808 * 28.0134 / DRY_AIR_MOLAR_MASS,
    "O": 1e6 * (0.2095 + 0.000420) * 31.9988 / DRY_AIR_MOLAR_MASS,
    "C": 420 * 12.0107 / DRY_AIR_MOLAR_MASS,
    "Ar": 1e6 * 0.00934 * 39.948 / DRY_AIR_MOLAR_MASS,
}
# Reference seawater, salinity 35 g/kg. H and O here count solvent water only.
OCEAN_PPM = {
    "H": 965000 * 2.01588 / 18.01528,
    "O": 965000 * 15.9994 / 18.01528,
    "Na": 10780,
    "Mg": 1280,
    "Ca": 412,
    "K": 399,
    "Cl": 19350,
    "C": 2.0 * 12.0107,  # illustrative 2.0 mmol dissolved inorganic C / kg
}
# End-to-end biomass light capture and downstream energy yields are explicit scenarios.
CROP_LIGHT_EFFICIENCY = 0.015
ETHANOL_RECOVERY = 0.52
SOLAR_PROCESS_EFFICIENCY = 0.20
