"""Reproducible record dossiers with full indicator data."""

import csv
from .elements_db import STOCKS, PPM, MODEL
from .fuel_simulator import simulate


def write_dossiers(output, state, events):
    lookup = {r["id"]: r for r in state["results"]}
    for event in events:
        r = simulate([lookup[event["id"]]["parts"]], trace=True)[0]
        path = output / event["dossier"]
        path.parent.mkdir(parents=True, exist_ok=True)
        curve = path.with_suffix(".csv")
        with curve.open("w", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(
                ["cycle", "crank_deg", "volume_cm3", "pressure_bar_absolute", "temperature_K"]
            )
            for kind, cycle in r["cycles"].items():
                writer.writerows([[kind, *point] for point in cycle["pv"]])
        fml = " ".join(f"{k} {v:.2f}" for k, v in r["atoms"].items() if v)
        lines = [
            f'# Candidate discovery dossier · {r["name"]}',
            "",
            f'Generation {event["generation"]} · model `{state["model"]}` · record `{event["kind"]}`.',
            "",
            f"Per mole of blend, the mean elemental inventory is **{fml}**. All fractions below are molar.",
            "",
            "| Component | mol% | Source ΔfH, liquid, kJ/mol | Production USD/kg | USD/mol blend |",
            "|---|---:|---:|---:|---:|",
        ]
        for k, v in r["parts"].items():
            s = STOCKS[k]
            mass = sum(MODEL["weights"][e] * n for e, n in s["atoms"].items()) / 1000
            lines.append(
                f'| {s["name"]} | {v} | {s["hf"]/1000:.3f} | {s["price"]:.4f} | {mass*s["price"]*v/100:.6f} |'
            )
        lines += [
            "",
            f'Phase classification: {r["phase"]}. At 298.15 K the ideal bubble pressure is {r["vaporKpa"]:.2f} kPa against 101.325 kPa ambient. '
            f'The ideal normal bubble point is {r["bubbleK"]:.1f} K. Activity coefficients, phase separation and cold flow require measurement.',
            "",
            f"Crustal abundance in ppm by mass: "
            + ", ".join(f"{e} {PPM[e]:,}" for e, n in r["atoms"].items() if n)
            + ".",
            "",
            f'Liquid reactant formation enthalpy is {r["hfJ"]/1000:.3f} kJ/mol blend. '
            f'LHV is {r["lhvJ"]/1000:.3f} kJ/mol, or {r["mjKg"]:.3f} MJ/kg and {r["mjL"]:.3f} MJ/L. '
            f'The stoichiometric AFR is {r["afr"]:.3f} kg air/kg blend. '
            f'The atmospheric adiabatic solution is {r["flameK"]:.2f} K with residual {r["flameResidualJ"]:.3g} J/mol.',
            "",
            "| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ]
        for kind, c in r["cycles"].items():
            lines.append(
                f'| {kind} | {c["peakBar"]:.2f} | {c["eta"]:.5f} | {c["workJ"]:.2f} | {c["evapJ"]:.2f} | {c["noPpm"]:.1f} | {c["burnResidualJ"]:.3g} |'
            )
        lines += [
            "",
            f'The {r["preferred"]} sedan at 110 km/h covers {r["range"]:.1f} km per 50 L. Production cost is '
            f'${r["cost"]:.2f}/100 km. Carbon balance gives {r["carbon"]:.1f} g CO₂/km. The pathway scenario gives {r["climate"]:.1f} g CO₂e/km.',
            "",
            f'Eco-Affordability Index **{r["index"]:.2f}/100**. Component scores (0–1): '
            + ", ".join(f"{k} {v:.3f}" for k, v in r["scoreParts"].items())
            + ".",
            "",
            f"[Download both P–V traces]({curve.name}). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.",
            "",
            "## Reproduction",
            "",
            f"Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).",
            "",
            "\x60\x60\x60sh",
            f'python3 -m engine.discovery_solver --verify {r["id"]}',
            "\x60\x60\x60",
            "",
            "A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and costs require separate validation.",
            "",
        ]
        path.write_text("\n".join(lines))
