"""Compute or independently replay a portable Stage 2 / Stage 3 sector with Python 3.10+."""

import argparse
import hashlib
import hmac
import json
from pathlib import Path
import sys
import tempfile

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.discovery_solver import catalogue
from engine.stage2_survival import canonical, model_hash, screen

MAX_COUNT = 50


def digest(value):
    return hashlib.sha256(canonical(value).encode("ascii")).hexdigest()


def compute(start, count):
    keys = sorted(catalogue())
    if (
        type(start) is not int
        or type(count) is not int
        or not 1 <= count <= MAX_COUNT
        or not 0 <= start <= len(keys) - count
    ):
        raise ValueError("Choose a complete 1–50 candidate sector within indices 0–999")
    payload = {
        "schema": 1,
        "model": model_hash(),
        "start": start,
        "count": count,
        "catalogueSha256": digest(keys),
        "results": {k: screen(catalogue()[k]) for k in keys[start : start + count]},
    }
    return {"payload": payload, "sha256": digest(payload)}


def verify(bundle):
    if not isinstance(bundle, dict) or set(bundle) != {"payload", "sha256"}:
        raise ValueError("Invalid bundle envelope")
    p = bundle["payload"]
    if not isinstance(p, dict) or p.get("model") != model_hash():
        raise ValueError("Different Stage 2 model")
    checksum = bundle["sha256"]
    if (
        not isinstance(checksum, str)
        or not checksum.isascii()
        or not hmac.compare_digest(digest(p), checksum)
    ):
        raise ValueError("Bundle SHA-256 mismatch")
    expected = compute(p.get("start"), p.get("count"))
    if not hmac.compare_digest(expected["sha256"], bundle["sha256"]):
        raise ValueError("Independent numerical replay disagrees")
    return p["results"]


def read_bundle(path):
    if path.stat().st_size > 2_000_000:
        raise ValueError("Sector file exceeds the 50-candidate size ceiling")
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--start", type=int, help="Zero-based index in sorted catalogue order")
    mode.add_argument("--candidate", help="Stage 3 catalogue ID or ai95100 / diesel100 control")
    mode.add_argument("--verify", type=Path, metavar="BUNDLE")
    parser.add_argument("--stage", type=int, choices=(2, 3), default=None)
    parser.add_argument("--count", type=int)
    parser.add_argument("--output", type=Path, help="Default: sector-START-COUNT.json")
    args = parser.parse_args()
    try:
        if args.verify:
            value = read_bundle(args.verify)
            stage = (
                3
                if isinstance(value, dict)
                and isinstance(value.get("payload"), dict)
                and value["payload"].get("schema") == 3
                else 2
            )
            if args.stage is not None and args.stage != stage:
                raise ValueError("Requested stage disagrees with the bundle")
            if stage == 3:
                from cli.calibration_worker import verify as verify_stage3

                verify_stage3(value)
            else:
                verify(value)
            print("SHA-256 and independent numerical replay verified.")
            return
        if args.stage == 3:
            from cli.calibration_worker import compute as compute_stage3

            count = 1 if args.count is None else args.count
            bundle = compute_stage3(args.start, count, args.candidate)
            label = args.candidate or f"{args.start:04d}-{count:02d}"
            output = args.output or Path(f"calibration-{label}.json")
        else:
            if args.candidate:
                raise ValueError("--candidate requires --stage 3")
            count = 10 if args.count is None else args.count
            bundle = compute(args.start, count)
            output = args.output or Path(f"sector-{args.start:04d}-{count:02d}.json")
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=output.parent, delete=False, mode="w", encoding="ascii", newline="\n"
        ) as temp:
            temp.write(canonical(bundle) + "\n")
        Path(temp.name).replace(output)
        print(f"{output}  {bundle['sha256']}")
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
