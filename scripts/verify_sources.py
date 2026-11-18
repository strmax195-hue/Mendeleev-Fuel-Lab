"""Verify the vendored numerical subset against two unmodified upstream files."""

import argparse
import ast
import hashlib
import json
from pathlib import Path
import re

DATA = Path(__file__).resolve().parents[1] / "engine/data"
DIGESTS = (
    "fa7746572952d74e249e818a82a35c113829742fb421a308e167185528884363",
    "4de6199d65d2d3db782e30573720c723130953707336add59713b02d8667e4db",
)


def verify(cea_path, nasa7_path):
    for f, expected in zip((cea_path, nasa7_path), DIGESTS):
        if hashlib.sha256(f.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Unexpected upstream file digest for {f.name}")
    lines = cea_path.read_text().splitlines()
    for key, record in json.loads((DATA / "cea.json").read_text()).items():
        i = next(i for i, l in enumerate(lines) if l[:18].strip() == key)
        row = lines[i + 1]
        atoms = {
            k.title(): int(float(n))
            for k, n in re.findall(r"([A-Z]{1,2})\s+([0-9]+\.\d+)", row[10:50])
        }
        if (atoms, float(row.split()[-2]), float(row.split()[-1])) != (
            record["atoms"],
            record["molar_mass"],
            record["hf_j_mol"],
        ):
            raise ValueError(f"CEA record mismatch for {key}")
    source = nasa7_path.read_text()
    for name, arrays in json.loads((DATA / "nasa7.json").read_text()).items():
        block = source.split(f"- name: {name}\n", 1)[1].split("\n- name:", 1)[0]
        if (
            "model: NASA7" not in block
            or "temperature-ranges: [200.0, 1000.0, 6000.0]" not in block
        ):
            raise ValueError(f"Incorrect polynomial domain for {name}")
        found = [ast.literal_eval(s) for s in re.findall(r"^    - (\[[^\]]+\])", block, re.M)]
        if found != arrays:
            raise ValueError(f"NASA-7 coefficient mismatch for {name}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("cea", type=Path)
    p.add_argument("nasa7", type=Path)
    args = p.parse_args()
    verify(args.cea, args.nasa7)
    print(
        "Verified all stored CEA records and NASA-7 coefficients against the pinned upstream files."
    )
