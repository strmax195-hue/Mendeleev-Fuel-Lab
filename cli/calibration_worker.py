"""Portable Stage 3 projections. Only the publisher can advance a Stage 2 survivor."""

from copy import deepcopy
import hmac

from engine.discovery_solver import catalogue
from engine.stage2_survival import ROOT
from engine.stage3_calibration import admitted
from engine.stage3_publish import digest, model_hash, projection


def compute(start=None, count=1, candidate=None):
    if candidate is not None:
        if start is not None or count != 1 or not isinstance(candidate, str):
            raise ValueError("Choose one candidate or one contiguous sector")
        admitted(candidate)
        keys = [candidate]
    else:
        registry = sorted(catalogue())
        if (
            type(start) is not int
            or type(count) is not int
            or not 1 <= count <= 8
            or not 0 <= start <= len(registry) - count
        ):
            raise ValueError("Choose a complete 1–8 candidate calibration sector in 0–999")
        keys = registry[start : start + count]
    payload = {
        "schema": 3,
        "model": model_hash(),
        "start": start,
        "count": count,
        "candidate": candidate,
        "results": {k: deepcopy(projection(k)) for k in keys},
    }
    return {"payload": payload, "sha256": digest(payload)}


def verify(bundle):
    if not isinstance(bundle, dict) or set(bundle) != {"payload", "sha256"}:
        raise ValueError("Invalid calibration bundle")
    p = bundle["payload"]
    if not isinstance(p, dict) or p.get("schema") != 3 or p.get("model") != model_hash():
        raise ValueError("Different Stage 3 model")
    checksum = bundle["sha256"]
    if (
        not isinstance(checksum, str)
        or not checksum.isascii()
        or not hmac.compare_digest(checksum, digest(p))
    ):
        raise ValueError("Calibration SHA-256 mismatch")
    replay = compute(p.get("start"), p.get("count"), p.get("candidate"))
    if not hmac.compare_digest(checksum, replay["sha256"]):
        raise ValueError("Independent calibration replay disagrees")
    return p["results"]


def contributed(wanted, folder=None):
    from .local_worker import read_bundle

    accepted = {}
    for path in sorted((folder or ROOT / "contributions").glob("calibration-*.json")):
        value = read_bundle(path)
        data = value["payload"]
        if data["model"] == model_hash() and wanted.intersection(data["results"]):
            accepted.update({k: v for k, v in verify(value).items() if k in wanted})
    return accepted
