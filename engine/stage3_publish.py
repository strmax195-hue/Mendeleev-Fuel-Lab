"""Independent Stage 3 model, survivor ledger, reference fixtures and bench dossiers."""

import hashlib
import json
import subprocess
from functools import lru_cache

from .bench_protocol import markdown, protocol
from .discovery_solver import fingerprint
from .stage2_survival import ROOT, canonical, model_hash as stage2_hash
from .stage3_calibration import ENGINES, admitted, calibration
from .wltp_simulator import simulate

CONTROLS = ("ai95100", "diesel100")
MIN_DRAIN_KM = 3000  # declared research durability target


@lru_cache(maxsize=1)
def model_hash():
    h = hashlib.sha256((fingerprint() + stage2_hash()).encode("ascii"))
    for file in (
        "engine/stage3_calibration.py",
        "engine/wltp_simulator.py",
        "engine/bench_protocol.py",
        "engine/stage3_publish.py",
        "engine/data/wltc_class3b.csv",
    ):
        h.update((ROOT / file).read_text(encoding="utf-8").encode("utf-8"))
    return h.hexdigest()


def bytes_for(value):
    return (canonical(value) + "\n").encode("ascii")


def digest(value):
    return hashlib.sha256(bytes_for(value)).hexdigest()


@lru_cache(maxsize=96)
def projection(key):
    admitted(key)
    architectures = {}
    for arch in ENGINES:
        m = calibration(key, arch)
        w = simulate(key, m)
        reasons = m["reasons"].copy()
        if w:
            if w["totals"]["unmetWheelJ"] + w["totals"]["unmetAuxJ"] > 1:
                reasons.append("Available torque cannot follow the drive cycle")
            if w["totals"]["limitedS"]:
                reasons.append("Cycle traverses a flagged map cell")
            if w["lightOffS"] is None:
                reasons.append("Catalyst never reaches 300 °C")
            if w["oil"]["modelDrainKm"] is None or w["oil"]["modelDrainKm"] < MIN_DRAIN_KM:
                reasons.append("Oil budget below the 3,000 km scenario")
        status = "unsupported" if w is None else "limited" if reasons else "passed"
        architectures[arch] = {"map": m, "wltc": w, "status": status, "reasons": reasons}
    return {"schema": 1, "id": key, "model": model_hash(), "architectures": architectures}


def survivors(state, second, get_weather):
    if (
        state["model"] != fingerprint()
        or second["stage1Model"] != state["model"]
        or second["model"] != stage2_hash()
        or second["generation"] != state["generation"]
        or second["tested"] != state["tested"]
    ):
        raise ValueError("Stage 2 checkpoint does not match this generation")
    known = {r["id"] for r in state["results"]}
    nominees = second["nominated"]
    if len(set(nominees)) != len(nominees):
        raise ValueError("Duplicate Stage 2 nomination")
    tallies = dict.fromkeys(("passed", "review", "rejected"), 0)
    passed = []
    for key in nominees:
        if key not in known or key in CONTROLS:
            raise ValueError("Invalid Stage 2 nomination")
        row = get_weather(key)
        if (
            row["id"] != key
            or row["model"] != second["model"]
            or digest(row) != second["entries"][key]
        ):
            raise ValueError("Invalid upstream weather profile")
        status = row["gate"]["status"]
        if status not in tallies:
            raise ValueError("Unknown Stage 2 gate outcome")
        tallies[status] += 1
        if status == "passed":
            passed.append(key)
    if tallies != second["funnel"]:
        raise ValueError("Stage 2 pass count does not reconcile")
    return sorted(passed)


def build(state, second, get_weather, contribution_source=None):
    eligible = survivors(state, second, get_weather)
    supplied = contribution_source(set(eligible)) if contribution_source and eligible else {}
    entries = {key: projection(key) for key in CONTROLS}
    for key in eligible:
        entries[key] = supplied.get(key) or projection(key)
    champions = {
        k: [a for a, v in entries[k]["architectures"].items() if v["status"] == "passed"]
        for k in eligible
    }
    champions = {k: a for k, a in champions.items() if a}
    index = {
        "schema": 1,
        "model": model_hash(),
        "stage1Model": state["model"],
        "stage2Model": second["model"],
        "generation": state["generation"],
        "tested": state["tested"],
        "eligible": eligible,
        "champions": champions,
        "controls": list(CONTROLS),
        "entries": {k: digest(v) for k, v in entries.items()},
        "protocols": {},
    }
    return index, entries


def publish(output, state, second):
    from cli.calibration_worker import contributed

    data = output / "data"

    def weather(key):
        return json.loads((data / "weather" / (key + ".json")).read_bytes())

    index, entries = build(state, second, weather, contributed)
    folder = data / "calibration"
    folder.mkdir(exist_ok=True)
    for key, v in entries.items():
        (folder / (key + ".json")).write_bytes(bytes_for(v))
    # The current index exposes only this model's champions. Historical packets
    # and existing issue links remain available under their model-qualified paths.
    for key, arches in index["champions"].items():
        dossier = output / "dossiers" / "stage3" / model_hash() / key
        dossier.mkdir(parents=True, exist_ok=True)
        p = protocol(entries[key], arches, entries)
        md = markdown(p).encode("utf-8")
        (dossier / "protocol.json").write_bytes(bytes_for(p))
        (dossier / "protocol.md").write_bytes(md)
        (dossier / "results.json").write_bytes(bytes_for(entries[key]))
        path = dossier.relative_to(output).as_posix()
        index["protocols"][key] = {
            "path": path,
            "jsonSha256": digest(p),
            "mdSha256": hashlib.sha256(md).hexdigest(),
        }
    ledger = data / "stage3-events.json"
    events = json.loads(ledger.read_bytes()) if ledger.exists() else []
    known = {(v["model"], v["id"]) for v in events}
    for key, arches in index["champions"].items():
        if (model_hash(), key) not in known:
            events.append(
                {
                    "model": model_hash(),
                    "id": key,
                    "architectures": arches,
                    "generation": state["generation"],
                    "path": index["protocols"][key]["path"],
                }
            )
    ledger.write_bytes(bytes_for(events))
    manifest = data / "stage3-manifest.json"
    if not manifest.exists() or json.loads(manifest.read_bytes())["model"] != model_hash():
        rev = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True)
        dirty = subprocess.run(
            ["git", "status", "--porcelain"], cwd=ROOT, text=True, capture_output=True
        )
        commit = (
            rev.stdout.strip()
            if rev.returncode == dirty.returncode == 0 and not dirty.stdout
            else None
        )
        manifest.write_bytes(
            bytes_for(
                {
                    "model": model_hash(),
                    "sourceCommit": commit,
                    "methods": "STAGE3.md",
                    "stage1Model": state["model"],
                    "stage2Model": second["model"],
                }
            )
        )
    if index["champions"]:
        (output / "dossiers" / "stage3" / model_hash() / "manifest.json").write_bytes(
            manifest.read_bytes()
        )
    (data / "stage3.json").write_bytes(bytes_for(index))
    return index
