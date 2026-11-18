"""Batch access to the same deterministic kernel executed by the observatory."""

import json
import subprocess
from pathlib import Path
from .elements_db import FAMILIES, MICROEMULSION, MODEL, REFERENCES, STOCKS
from .nasa_thermo import check_combustion

ROOT = Path(__file__).resolve().parents[1]


def model_script():
    return (
        "globalThis.FUEL_MODEL="
        + json.dumps(MODEL, separators=(",", ":"), ensure_ascii=False)
        + ";\n"
    )


def validate(parts, reference=False):
    if not isinstance(parts, dict) or not 1 <= len(parts) <= 3:
        raise ValueError("Expected one to three registered liquids")
    if any(k not in STOCKS or type(v) is not int or v <= 0 for k, v in parts.items()):
        raise ValueError("Invalid liquid code or molar fraction")
    if parts == MICROEMULSION:
        return
    if sum(parts.values()) != 100 or parts.get("water", 0) > 20:
        raise ValueError("Composition outside the molar survey bounds")
    if reference and len(parts) == 1 and next(iter(parts)) in REFERENCES:
        return
    if not any(parts.keys() <= set(group) for group in FAMILIES):
        raise ValueError("Unregistered liquid family")


def simulate(blends, *, reference=False, trace=False, step=2):
    if step not in (1, 2, 4):
        raise ValueError("Supported crank-angle increments are 1, 2 and 4 degrees")
    jobs = []
    for parts in blends:
        validate(parts, reference)
        jobs.append(dict(parts=parts, reference=reference, trace=trace, step=step))
    if not jobs:
        return []
    if (ROOT / "docs/model.js").read_text() != model_script():
        raise RuntimeError("Stale model data. Run python -m scripts.build_assets.")
    process = subprocess.run(
        ["node", str(ROOT / "scripts/run_model.cjs")],
        input=json.dumps(jobs),
        capture_output=True,
        text=True,
        check=False,
    )
    if process.returncode:
        raise RuntimeError(process.stderr)
    rows = json.loads(process.stdout)
    for row in rows:
        check_combustion(row)
    return rows
