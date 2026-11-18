"""Join weather profiles to road-cycle results and publish a resumable Stage 2 funnel."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from cli.local_worker import read_bundle, verify
from .discovery_solver import catalogue, check_state, run as run_stage1
from .materials_db import HARDWARE, MATERIALS
from .stage2_inputs import INLET_LOSS, PRESSURE, RAIL_PRESSURE
from .stage2_survival import (
    ROOT,
    TEMPS,
    WEATHER_COLUMNS,
    canonical,
    gate,
    model_hash,
    road_account,
    screen,
)

BEGIN = "<!-- fuel-lab stage2 begin -->"
END = "<!-- fuel-lab stage2 end -->"


def sha(body):
    return hashlib.sha256(body.encode("ascii")).hexdigest()


def block(body, addition):
    """Replace only the bounded automation section, preserving external annotations."""
    section = f"{BEGIN}\n{addition.rstrip()}\n{END}"
    before, start, rest = body.partition(BEGIN)
    if not start:
        return body.rstrip() + "\n\n" + section + "\n"
    _, finish, after = rest.partition(END)
    if not finish:
        raise ValueError("Incomplete Stage 2 section")
    return before + section + after


def contributions():
    accepted = {}
    for path in sorted((ROOT / "contributions").glob("sector-*.json")):
        bundle = read_bundle(path)
        # Prior models remain reproducible from their source revision.
        if bundle.get("payload", {}).get("model") == model_hash():
            accepted.update(verify(bundle))
    return accepted


def build(state, previous=None, load_row=None, supplied=None):
    """Return a small index and individual weather rows. Historical nominations persist."""
    check_state(state)
    previous = previous or {}
    compatible = (
        previous.get("model") == model_hash() and previous.get("stage1Model") == state["model"]
    )
    # The shortlist is historical even when newer scientific inputs require a rescreen.
    known = {r["id"] for r in state["results"]}
    retained = (
        previous.get("nominated", []) if previous.get("stage1Model") == state["model"] else []
    )
    nominated = sorted(
        (set(retained) & known) | set(state["frontier"]) | {e["id"] for e in state["records"]}
    )
    reference = next(r for r in state["baselines"] if r["id"] == "ai95100")
    limit = road_account(screen(reference["parts"]), reference)["wtwUsd100"]
    rows, hashes = {}, {}
    for row in state["baselines"] + state["results"]:
        key = row["id"]
        cached = None
        if compatible and load_row and key in previous["entries"]:
            cached = load_row(key, previous["entries"][key])
        phys = cached["screen"] if cached else (supplied or {}).get(key)
        if phys is None:
            phys = screen(row["parts"])
        account = road_account(phys, row)
        record = {
            "id": key,
            "model": model_hash(),
            "screen": phys,
            "road": account,
            "gate": gate(phys, account, limit),
        }
        rows[key] = record
        hashes[key] = sha(canonical(record) + "\n")
    counts = {
        status: sum(rows[k]["gate"]["status"] == status for k in nominated)
        for status in ("passed", "review", "rejected")
    }
    report = {
        "schema": 1,
        "model": model_hash(),
        "stage1Model": state["model"],
        "generation": state["generation"],
        "tested": state["tested"],
        "nominated": nominated,
        "funnel": counts,
        "entries": hashes,
        "minC": min(TEMPS),
        "maxC": max(TEMPS),
        "columns": WEATHER_COLUMNS,
        "materials": MATERIALS,
        "hardware": HARDWARE,
        "railKpa": RAIL_PRESSURE,
        "inletKpa": PRESSURE - INLET_LOSS,
        "referenceUsd100": limit,
    }
    return report, rows


def reading(value, digits=2):
    return "unavailable" if value is None else f"{value:.{digits}f}"


def certificate(record, stage1_model):
    s, g, a = record["screen"], record["gate"], record["road"]
    cold, hot = s["weather"][0], s["weather"][-1]
    margin = None if hot[1] is None else RAIL_PRESSURE - hot[1]
    suction = None if hot[1] is None else PRESSURE - INLET_LOSS - hot[1]
    starts = (
        "compression-ignition soak test required" if s["cycle"] == "Diesel" else reading(cold[2], 3)
    )
    stock = s["retrofit"]["stock"]
    sector = sorted(catalogue()).index(record["id"])
    return "\n".join(
        [
            "## Stage 2 survival certificate",
            "",
            f"Computational outcome **{g['status'].upper()}** on the −35 to +50 °C grid. "
            f"Stock material verdict **{stock}**. Laboratory and OEM validation are outstanding.",
            "",
            "| Screen | Result |",
            "|---|---|",
            f"| Liquid–liquid split / solid or cloud risk | {sum(bool(w[0]&1) for w in s['weather'])} / {sum(bool(w[0]&2) for w in s['weather'])} of 86 temperatures |",
            f"| Four-volume RVP proxy at 37.8 °C | {reading(s['rvpKpa'])} kPa |",
            f"| −35 °C cold-cranking index | {starts} |",
            f"| +50 °C rail / inlet margins | {reading(margin)} / {reading(suction)} kPa |",
            f"| Ambient dynamic viscosity at +20 °C | {reading(s['weather'][55][3], 3)} mPa·s |",
            f"| Estimated wear before / after | {s['wearBeforeUm']:.0f} / {s['wearUm']:.0f} µm |",
            f"| Added bio-ester | {s['doseVolPct']:.1f}% of final liquid volume |",
            f"| Wheel energy / invested primary energy | {a['wheelMj100']:.2f} / {a['investedMj100']:.2f} MJ per 100 km |",
            f"| Wheel EROI / delivered fuel cost | {a['eroi']:.3f} / ${a['wtwUsd100']:.2f} per 100 km |",
            f"| Synthesis electricity (included in fuel cost) | {a['synthesisKwh100']:.2f} kWh, ${a['electricityUsd100']:.2f} per 100 km |",
            "",
            "**Failed gates** · " + (", ".join(g["failures"]) or "None") + ".",
            "",
            "**Further evidence** · "
            + (", ".join(g["reviews"]) or "Vehicle and bench validation")
            + ".",
            "",
            f"Stage 1 `{stage1_model}` · Stage 2 SHA-256 `{record['model']}`.",
            "",
            f"Reproduce the physical sector with `python cli/local_worker.py --start {sector} --count 1`. "
            f"[Read all 86 temperatures](../data/weather/{record['id']}.json) · [Find the source revision](../data/stage2-manifest.json).",
        ]
    )


def publish(output, state):
    data = output / "data"
    weather = data / "weather"
    weather.mkdir(parents=True, exist_ok=True)
    index = data / "stage2.json"
    previous = json.loads(index.read_text(encoding="ascii")) if index.exists() else {}

    def load_row(key, expected):
        path = weather / (key + ".json")
        if path.is_file():
            body = path.read_text(encoding="ascii")
            if sha(body) == expected:
                return json.loads(body)
        return None

    report, rows = build(state, previous, load_row, contributions())
    for key, row in rows.items():
        path = weather / (key + ".json")
        body = canonical(row) + "\n"
        if not path.is_file() or path.read_text(encoding="ascii") != body:
            path.write_bytes(body.encode("ascii"))
    for event in state["records"]:
        path = output / event["dossier"]
        updated = block(
            path.read_text(encoding="utf-8"), certificate(rows[event["id"]], state["model"])
        )
        path.write_text(updated, encoding="utf-8")
    manifest = data / "stage2-manifest.json"
    if not manifest.exists() or json.loads(manifest.read_text()).get("model") != model_hash():
        sha1 = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True
        )
        dirty = subprocess.run(
            ["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True
        )
        rev = (
            sha1.stdout.strip()
            if sha1.returncode == dirty.returncode == 0 and not dirty.stdout
            else None
        )
        manifest.write_text(
            canonical(
                {
                    "model": model_hash(),
                    "stage1Model": state["model"],
                    "sourceCommit": rev,
                    "methods": "STAGE2.md",
                }
            )
            + "\n"
        )
    # The data worktree is published as one fast-forward Git commit.
    index.write_bytes((canonical(report) + "\n").encode("ascii"))
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, default=Path(".lab"))
    p.add_argument("--batch", type=int, default=24)
    args = p.parse_args()
    checkpoint = args.output / "data/state.json"
    before = json.loads(checkpoint.read_text())["tested"] if checkpoint.exists() else 0
    state = run_stage1(args.output, args.batch)
    if state["tested"] == before:
        # A saturated Stage 1 must still migrate, repair or rescreen after model changes.
        from .svg_progress import write_products

        write_products(args.output, state)
    print(
        f"Generation {state['generation']} · {state['tested']} thermodynamic results · Stage 2 {model_hash()}"
    )


if __name__ == "__main__":
    main()
