"""Publish hash-addressed planetary audits for Stage 3 champions and road controls."""

import json
import os
import re
from pathlib import Path
from .stage3_publish import (
    CONTROLS,
    bytes_for,
    digest,
    model_hash as calibration_hash,
    projection,
    source_revision,
)
from .stage4_planetary import compute, model_hash

REFERENCES = {"ai95100": ["mpi", "gdi"], "diesel100": ["diesel"]}
COMMAND = re.compile(
    r"fuel-lab-replay-v1 ([a-z0-9-]{1,64}) (mpi|gdi|diesel) ([a-f0-9]{64}) ([a-f0-9]{64})"
)


def verify_claim(body, index):
    if not isinstance(body, str) or len(body) > 256:
        return None
    match = COMMAND.fullmatch(body.strip())
    if not match:
        return None
    key, arch, model, checksum = match.groups()
    case = key + "/" + arch
    if (
        model != index["model"]
        or model != model_hash()
        or key in CONTROLS
        or arch not in index["finalists"].get(key, [])
        or index["physicsHashes"].get(case) != checksum
    ):
        return None
    replay = compute(key, arch)
    if replay["payload"]["stage3Status"] != "passed" or replay["sha256"] != checksum:
        return None
    return case, checksum


def build(state, third):
    if (
        third["generation"] != state["generation"]
        or third["stage1Model"] != state["model"]
        or third["model"] != calibration_hash()
        or third["tested"] != state["tested"]
    ):
        raise ValueError("Stage 3 checkpoint and planetary audit disagree")
    finalists = third["champions"]
    tested = {r["id"] for r in state["results"]}
    cases = dict(REFERENCES)
    for key, arches in finalists.items():
        if (
            key in CONTROLS
            or key not in tested
            or key not in third["eligible"]
            or not arches
            or len(set(arches)) != len(arches)
        ):
            raise ValueError("Invalid Stage 3 champion")
        upstream = projection(key)
        if digest(upstream) != third["entries"][key] or sorted(arches) != sorted(
            a for a, r in upstream["architectures"].items() if r["status"] == "passed"
        ):
            raise ValueError("Unverified Stage 3 architecture")
        cases[key] = arches
    rows = {k + "/" + a: compute(k, a) for k, arches in cases.items() for a in arches}
    approved = [
        k
        for k, arches in finalists.items()
        if any(rows[k + "/" + a]["payload"]["outcome"] == "passed" for a in arches)
    ]
    return {
        "schema": 4,
        "model": model_hash(),
        "stage3Model": third["model"],
        "stage1Model": state["model"],
        "generation": state["generation"],
        "tested": state["tested"],
        "controls": REFERENCES,
        "finalists": finalists,
        "verified": sorted(approved),
        "peerReproduced": {},
        "physicsHashes": {c: b["sha256"] for c, b in rows.items()},
        "entries": {c: digest(b) for c, b in rows.items()},
    }, rows


def publish(output, state, third):
    data = output / "data"
    index, rows = build(state, third)
    for case, bundle in rows.items():
        path = data / "planetary" / (case + ".json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(bytes_for(bundle))
    old = data / "stage4.json"
    # Retain prior accepted reproductions only for the exact same model, gate and physics.
    if old.is_file():
        prior = json.loads(old.read_bytes())
        if prior["model"] == index["model"]:
            for case, checksum in prior["peerReproduced"].items():
                key, arch = case.split("/")
                if (
                    arch in index["finalists"].get(key, [])
                    and index["physicsHashes"].get(case) == checksum
                ):
                    index["peerReproduced"][case] = checksum
    path = os.environ.get("FUEL_LAB_PEER_CLAIMS")
    if path:
        for claim in json.loads(Path(path).read_text(encoding="utf-8")):
            accepted = verify_claim(claim, index)
            if accepted:
                case, checksum = accepted
                index["peerReproduced"][case] = checksum
    manifest = data / "stage4-manifest.json"
    if not manifest.exists() or json.loads(manifest.read_bytes())["model"] != index["model"]:
        manifest.write_bytes(
            bytes_for(
                {
                    "model": index["model"],
                    "stage3Model": third["model"],
                    "sourceCommit": source_revision(),
                    "methods": "STAGE4.md",
                    "verification": "python cli/local_worker.py --verify audit.json",
                }
            )
        )
    old.write_bytes(bytes_for(index))
    return index
