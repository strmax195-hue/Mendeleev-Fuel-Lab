"""Original material screening rules for three declared fuel-system assemblies.

SAE J1681 describes test fluids and J1748 describes polymer exposure testing.
Grade, water, surface treatment and temperature matter. See STAGE2.md.
"""

DROP_IN = "100% Drop-In Stock Tank"
SWAP = "Minor Seal Swap (EPDM/PTFE O-rings)"
STAINLESS_SWAP = "Minor Seal Swap (EPDM/PTFE + Stainless)"
INCOMPATIBLE = "Incompatible"
# Material names and lower working temperatures of the assumed seal grades (°C).
# Metal ductility and mechanical design are outside the chemical screen.
MATERIALS = {
    "steel": ("Carbon steel", None),
    "ss304": ("Stainless steel 304", None),
    "ss316": ("Stainless steel 316", None),
    "al6061": ("Aluminum 6061", None),
    "brass": ("Brass / copper", None),
    "nbr": ("NBR · nitrile rubber", -40),
    "fkm": ("FKM · fluorocarbon", -20),
    "epdm": ("EPDM", -45),
    "ptfe": ("PTFE", -100),
}
# Wetted metal parts, installed seals. Replacement assumes a qualified static gland.
HARDWARE = {
    "stock": ("Steel tank / NBR", ("steel", "ss304", "al6061"), ("nbr",)),
    "legacy": ("Copper fittings / NBR", ("steel", "brass"), ("nbr",)),
    "stainless": ("Stainless circuit / FKM", ("ss304", "ss316"), ("fkm",)),
}


def chemical_ratings(volume):
    """Volume fractions of a screened composition. Codes apply to the assumed grades."""
    ratings = dict.fromkeys(MATERIALS, "suitable")
    petroleum = volume.get("ai95", 0) + volume.get("diesel", 0)
    alcohol = sum(volume.get(k, 0) for k in ("eth", "ipa", "oct"))
    ester = volume.get("b100", 0)
    if petroleum or volume.get("oct", 0) or ester:
        ratings["epdm"] = "avoid"
    if alcohol > 0.20 or ester > 0.20:
        ratings["nbr"] = "review"
    if ester > 0.05:
        ratings["brass"] = "avoid"  # Copper catalyses FAME oxidation.
    if volume.get("water", 0) > 0.03:
        for code in ("steel", "al6061", "brass"):
            ratings[code] = "review"  # Fuel quality, dwell time and coatings matter.
    if volume.get("eth", 0) > 0.5 and volume.get("water", 0) < 0.0001:
        ratings["al6061"] = "review"  # Dry ethanol attack depends on oxide film and grade.
    if volume.get("dmc", 0):
        for code in ("al6061", "brass", "nbr", "fkm", "epdm"):
            ratings[code] = "review"
    if volume.get("eth", 0) + volume.get("ipa", 0) > 0.5:
        ratings["fkm"] = "review"  # Formulation-specific swelling in oxygenates.
    return ratings


def at_temperature(chemical, celsius):
    return {
        key: ("avoid" if MATERIALS[key][1] is not None and celsius < MATERIALS[key][1] else value)
        for key, value in chemical.items()
    }


def retrofit(ratings, hardware="stock"):
    _, metals, seals = HARDWARE[hardware]
    if any(ratings[k] != "suitable" for k in metals):
        return INCOMPATIBLE
    if all(ratings[k] == "suitable" for k in seals):
        return DROP_IN
    if any(ratings[k] == "suitable" for k in ("epdm", "ptfe")):
        return SWAP
    return INCOMPATIBLE


def qualified_installation(chemical, temperatures):
    """Choose one set of wetted parts that survives the entire temperature envelope."""
    ratings = [at_temperature(chemical, t) for t in temperatures]
    for name in ("stock", "stainless"):
        _, metals, installed = HARDWARE[name]

        def suitable(parts):
            return all(row[k] == "suitable" for row in ratings for k in parts)

        if not suitable(metals):
            continue
        for seals in (installed, ("epdm",), ("ptfe",)):
            if suitable(seals):
                verdict = (
                    STAINLESS_SWAP
                    if name == "stainless"
                    else DROP_IN if seals == installed else SWAP
                )
                return {"assembly": name, "seals": list(seals), "verdict": verdict}
    return {"assembly": None, "seals": [], "verdict": INCOMPATIBLE}
