"""Generate a gravimetric university test-cell worksheet for an admitted champion."""

from decimal import Decimal
from .elements_db import STOCKS
from .stage3_calibration import ENGINES, fuel

SAFETY = [
    "Use the institution's authorised fuel test cell, supplier SDS, trained operators, compatible closed vessels, bonding, ventilation and fire interlocks.",
    "Document stock identity, purity, lot moisture and the balance and instrument calibration. Record no personal identifiers in the submission.",
    "Inspect for separation after conditioning. Complete material, vapor pressure, lubricity and cold-flow sample tests before running pumps or injectors.",
    "Retain production ECU safeguards. Apply facility and OEM limits for knock, pressure-rise rate, rail pressure, exhaust and oil temperature. Abort on leaks, misfire, LSPI or an interlock trip.",
]


def protocol(record, champions, controls):
    key = record["id"]
    if not champions or key in ("ai95100", "diesel100"):
        raise ValueError(
            "Only a candidate with a qualifying architecture receives a bench protocol"
        )
    if any(record["architectures"][a]["status"] != "passed" for a in champions):
        raise ValueError("Architecture has not passed its model gates")
    s = fuel(key)
    # Allocate integer milligrams by largest remainder so a 1,000 g batch closes exactly.
    amounts = {k: Decimal(str(v)) * 1000000 for k, v in s["massFractions"].items()}
    mg = {k: int(v) for k, v in amounts.items()}
    for k in sorted(mg, key=lambda k: (-(amounts[k] - mg[k]), k))[: 1000000 - sum(mg.values())]:
        mg[k] += 1
    targets = {}
    for arch in champions:
        a = record["architectures"][arch]
        ref = controls[a["map"]["reference"]]["architectures"][arch]

        def target(result):
            c = result["map"]["cells"][2][2]
            w = result["wltc"]
            return {
                "rpm": 2000,
                "loadFraction": 0.6,
                "peakBar": c["peakBar"],
                "ca50Atdc": c["ca50"],
                "lambda": c["lambda"],
                "wltcL100": w["litres100"],
                "lightOffS": w["lightOffS"],
            }

        targets[arch] = {
            "control": a["map"]["reference"],
            "baseline": target(ref),
            "candidate": target(a),
        }
    return {
        "schema": 1,
        "candidate": key,
        "model": record["model"],
        "batchG": 1000,
        "components": [{"stock": k, "name": STOCKS[k]["name"], "mg": mg[k]} for k in sorted(mg)],
        "esterFinalVolPct": s["doseVolPct"],
        "targets": targets,
        "safety": SAFETY,
        "sequence": [
            "Use a balance readable to 1 mg. Record actual component masses, sealed final mass and uncertainty against the worksheet.",
            "Run the matching certified reference fuel first. Measure torque, air and fuel flow, wideband lambda, crank-resolved cylinder pressure and heat release on a stabilised cell.",
            "Instrument each RPM/load point with pressure and knock acquisition. Repeat runs, record cycle dispersion and confidence intervals, and subject GDI low-speed/high-load points to a dedicated LSPI assessment.",
            "Cold-soak under the facility protocol. Separately test −30 °C starting and the 23 °C Class 3b drive cycle. Record the first 300 °C brick crossing and measured exhaust conversion.",
            "Record fresh and used oil fuel dilution, water, acid and base numbers, viscosity and OEM limits. Verify the drain interval with repeat sampling before vehicle use.",
        ],
        "verification": f"python cli/local_worker.py --stage 3 --candidate {key} --output calibration.json",
        "claim": "Computational qualification. Vehicle-specific hardware validation and regulatory type approval require independent tests.",
    }


def markdown(p):
    lines = [
        f"# University dyno bench protocol · {p['candidate']}",
        "",
        p["claim"],
        "",
        f"Model SHA-256 `{p['model']}`. Target batch **1,000.000 g**. The final ester dose is {p['esterFinalVolPct']:.2f} vol%.",
        "",
        "| Whitelisted stock | Target mass, g |",
        "|---|---:|",
    ]
    lines += [f"| {v['name']} | {v['mg']/1000:.3f} |" for v in p["components"]]
    lines += [
        "",
        "## Safety checks",
        "",
        *["- " + v for v in p["safety"]],
        "",
        "## Dyno targets",
        "",
        "| Architecture and fuel | rpm / load | Peak bar | CA50 °ATDC | λ | WLTC L/100 km | 300 °C, s |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for arch, t in p["targets"].items():
        for label in ("baseline", "candidate"):
            x = t[label]
            light = "unreached" if x["lightOffS"] is None else str(x["lightOffS"])
            lines.append(
                f"| {ENGINES[arch].name} · {t['control'] if label=='baseline' else p['candidate']} | 2000 / 60% | {x['peakBar']:.2f} | {x['ca50Atdc']:.2f} | {x['lambda']:.2f} | {x['wltcL100']:.3f} | {light} |"
            )
    lines += [
        "",
        "## Test sequence",
        "",
        *[f"{i}. {v}" for i, v in enumerate(p["sequence"], 1)],
        "",
        "## Model replay",
        "",
        f"`{p['verification']}`",
        "",
        "Record measured departures and measurement uncertainty alongside each prediction.",
        "",
    ]
    return "\n".join(lines)
