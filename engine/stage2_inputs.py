"""Numerical inputs and declared Stage 2 engineering scenarios. Units in STAGE2.md."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Property:
    # Pure-liquid dynamic viscosity at 20/40 °C (mPa s); fusion enthalpy J/mol.
    mu20: float
    mu40: float
    fusion: float | None
    # Vol % lower flammability limit in air; screening wear-scar endpoint in µm.
    lfl: float | None
    wear: float
    # Purchased synthesis electricity kWh/kg and other upstream primary energy MJ/kg.
    kwh: float
    other_mj: float
    # Rounded observed P_sat at 25 °C, kPa; bulk fuel surrogates use the boiling anchor.
    psat25: float | None


PROPERTIES = {
    "eth": Property(1.20, 0.83, 5020, 3.3, 700, 0.24, 13.0, 7.87),
    "ipa": Property(2.43, 1.36, 5410, 2.0, 670, 0.80, 11.0, 5.93),
    "water": Property(1.002, 0.653, 6010, None, 600, 0.0005, 0.005, 3.17),
    "oct": Property(8.2, 4.45, 25240, 0.8, 400, 1.20, 28.0, 0.0106),
    "dmc": Property(0.63, 0.48, 11580, 4.2, 620, 0.65, 12.0, 7.4),
    "b100": Property(6.2, 3.8, None, None, 300, 0.34, 5.5, None),
    "ai95": Property(0.52, 0.40, 9212, 1.1, 720, 0.14, 5.2, 6.6),
    "diesel": Property(3.6, 2.35, None, None, 440, 0.12, 5.0, None),
}

# Dimensionless two-suffix Margules pair energies at 298.15 K. Screening priors
# for the allowed families only. The ternary benchmark constrains the octanol pair.
PAIRS = {
    ("eth", "ipa"): 0.10,
    ("eth", "water"): 1.10,
    ("ipa", "water"): 1.55,
    ("dmc", "eth"): 0.55,
    ("eth", "oct"): 0.45,
    ("oct", "water"): 2.65,
    ("b100", "eth"): 1.60,
    ("b100", "ipa"): 1.15,
}
DOSES = (0.005, 0.010, 0.015, 0.020)
WEAR_LIMIT = 520.0
PRESSURE = 101.325  # kPa absolute at sea level
RAIL_PRESSURE = 350.0  # kPa absolute, low-pressure supply circuit
INLET_LOSS = 15.0  # kPa from tank to low-pressure pump inlet
GRID_PRIMARY = 2.0  # MJ primary per MJ delivered electricity
DELIVERY_MJ = 0.70  # primary MJ/kg distributed fuel
MIN_EROI = 1.0  # tractive wheel energy / external invested primary energy
# Evidence for scalable supply of the specific upstream pathway.
SUPPLY_REVIEW = {"ipa", "oct", "dmc", "b100"}
