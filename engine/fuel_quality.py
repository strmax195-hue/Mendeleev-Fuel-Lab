"""Knock quality and reference laminar burning velocities shared by engine and renderer."""

# RON, cetane, stoichiometric laminar speed at 298 K and 1 atm (m/s).
# Screening priors, with unknown chemistry left unparameterised. See STAGE3.md.
QUALITY = {
    "ai95": (95, None, 0.35),
    "diesel": (None, 51, None),
    "eth": (109, 8, 0.40),
    "ipa": (112, 12, 0.35),
    "dmc": (101, None, 0.29),
    "oct": (None, 38, None),
    "b100": (None, 52, None),
}
