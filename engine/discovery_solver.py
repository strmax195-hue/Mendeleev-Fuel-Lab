"""A finite 1 mol% survey with deterministic frontier mutation and grid coverage."""

import argparse
import hashlib
import json
import os
import subprocess
from collections import deque
from functools import lru_cache
from pathlib import Path

from .elements_db import FAMILIES, MICROEMULSION, REFERENCES
from .fuel_simulator import ROOT, model_script, simulate, validate

TOTAL = 1000


def identity(parts):
    return "-".join(f"{k}{v}" for k, v in sorted(parts.items()))


@lru_cache(maxsize=1)
def catalogue():
    possible = []
    for water in range(21):
        for ipa in range(101 - water):
            p = {"eth": 100 - ipa - water, "ipa": ipa, "water": water}
            possible.append({k: v for k, v in p.items() if v})
    for dmc in range(1, 101):
        possible.append({k: v for k, v in {"eth": 100 - dmc, "dmc": dmc}.items() if v})
    possible.extend([{"b100": 100}, {"oct": 100}])
    edges = [p for p in possible if len(p) < 3] + [MICROEMULSION]
    interior = [p for p in possible if len(p) == 3]
    needed = TOTAL - len(edges)
    selected = edges + [interior[i * (len(interior) - 1) // (needed - 1)] for i in range(needed)]
    for p in selected:
        validate(p)
    catalog = {identity(p): p for p in selected}
    if len(catalog) != TOTAL:
        raise RuntimeError("Duplicate composition in survey")
    return catalog


@lru_cache(maxsize=1)
def fingerprint():
    h = hashlib.sha256(model_script().encode())
    for path in ("docs/thermo.js", "engine/discovery_solver.py"):
        h.update((ROOT / path).read_bytes())
    h.update("\n".join(catalogue()).encode())
    return h.hexdigest()[:16]


def dominates(a, b):
    return all(x >= y for x, y in zip(a, b)) and any(x > y for x, y in zip(a, b))


def frontier(rows, vector):
    """Incrementally retain the nondominated rows, resolving displayed ties by stable ID."""
    kept = {}
    for r in sorted(rows, key=lambda v: v["id"]):
        v = vector(r)
        if v in kept or any(dominates(k, v) for k in kept):
            continue
        kept = {k: x for k, x in kept.items() if not dominates(v, k)}
        kept[v] = r
    return list(kept.values())


def objectives(r):
    return (round(r["range"], 3), -round(r["cost"], 6), -round(r["climate"], 4))


def record_vector(r):
    return (round(r["index"], 1), round(r["range"]))


def select_batch(rows, batch, generation):
    catalog = catalogue()
    done = {r["id"] for r in rows}
    keys = list(catalog)
    # A coprime grid stride traverses the entire survey without a random seed.
    grid = (keys[(i * 383) % TOTAL] for i in range(TOTAL))
    picks = {}

    def add(key):
        if key in catalog and key not in done and len(picks) < batch:
            picks.setdefault(key, catalog[key])

    if not rows:
        for p in (
            {"eth": 100},
            {"ipa": 100},
            {"dmc": 100},
            {"b100": 100},
            {"eth": 90, "water": 10},
            {"eth": 80, "dmc": 20},
            {"eth": 80, "ipa": 20},
            {"oct": 100},
            MICROEMULSION,
        ):
            add(identity(p))
    else:
        parents = frontier([r for r in rows if len(r["parts"]) > 1], objectives)
        parents.sort(key=lambda r: (-r["index"], r["id"]))
        queue = deque(parents)
        queue.rotate(-generation)
        for parent in queue:
            p = parent["parts"]
            for family in FAMILIES:
                if not p.keys() <= set(family):
                    continue
                for donor in sorted(p):
                    for receiver in family:
                        if donor == receiver or len(picks) >= batch // 2:
                            continue
                        child = p.copy()
                        child[donor] -= 1
                        child[receiver] = child.get(receiver, 0) + 1
                        add(identity({k: v for k, v in child.items() if v}))
            if len(picks) >= batch // 2:
                break
    for key in grid:
        add(key)
        if len(picks) == batch:
            break
    return list(picks.values())


def new_state():
    return dict(
        schema=1,
        model=fingerprint(),
        generation=0,
        total=TOTAL,
        tested=0,
        results=[],
        baselines=simulate([{k: 100} for k in REFERENCES], reference=True),
        records=[],
        frontier=[],
        synergies=[],
    )


def check_state(state):
    if state["model"] != fingerprint() or state["schema"] != 1:
        raise ValueError("Stored run uses a different scientific model or survey")
    ids = [r["id"] for r in state["results"]]
    if (
        state["total"] != TOTAL
        or len(ids) != state["tested"]
        or len(ids) != len(set(ids))
        or any(
            r["id"] not in catalogue() or r["parts"] != catalogue()[r["id"]]
            for r in state["results"]
        )
    ):
        raise ValueError("Invalid discovery checkpoint")


def synergy(row, baselines, pures):
    """Strict dominance over both road references and the energy-weighted dry parents."""
    if len(row["parts"]) < 2:
        return False
    eta = row["cycles"][row["preferred"]]["eta"]
    if not all(
        eta > b["cycles"][b["preferred"]]["eta"]
        and row["cost"] < b["cost"]
        and row["climate"] < b["climate"]
        and row["carbon"] < b["carbon"]
        for b in baselines
    ):
        return False
    parents = [
        (x / 100 * pures[k]["lhvJ"], pures[k]) for k, x in row["parts"].items() if k != "water"
    ]
    linear = sum(q * p["cycles"][row["preferred"]]["eta"] for q, p in parents) / sum(
        q for q, p in parents
    )
    return eta > linear + 1e-6


def advance(state, batch):
    if batch < 1 or batch > TOTAL:
        raise ValueError("Batch size must be between 1 and 1000")
    check_state(state)
    picks = select_batch(state["results"], batch, state["generation"])
    if not picks:
        return []
    new = simulate(picks)
    old = state["results"]
    generation = state["generation"] + 1

    def blends(rows):
        return [r for r in rows if len(r["parts"]) > 1]

    old_front = frontier(blends(old), record_vector)
    all_rows = old + new
    current = frontier(blends(all_rows), record_vector)
    new_ids = {r["id"] for r in new}
    records = [
        (r, "pareto")
        for r in current
        if r["id"] in new_ids and all(record_vector(r) != record_vector(p) for p in old_front)
    ]
    best_zero = max((r["range"] for r in old if r["atoms"]["C"] == 0), default=0)
    for r in new:
        if r["atoms"]["C"] == 0 and r["range"] > best_zero:
            records.append((r, "zero-tailpipe"))
            best_zero = r["range"]
    for r, kind in records:
        state["records"].append(
            dict(
                id=r["id"],
                kind=kind,
                generation=generation,
                dossier=f"dossiers/{kind}-{r['id']}.md",
            )
        )
    pareto = frontier(all_rows, objectives)
    pures = {next(iter(r["parts"])): r for r in all_rows if len(r["parts"]) == 1}
    # Small user-selected batches may evaluate a blend before its neat parent.
    missing = {k for r in pareto for k in r["parts"] if k != "water" and k not in pures}
    for r in simulate([{k: 100} for k in sorted(missing)]):
        pures[next(iter(r["parts"]))] = r
    state.update(
        results=all_rows,
        generation=generation,
        tested=len(all_rows),
        frontier=[r["id"] for r in pareto],
        synergies=[r["id"] for r in pareto if synergy(r, state["baselines"], pures)],
    )
    return state["records"][-len(records) :] if records else []


def run(output, batch):
    from .svg_progress import write_products
    from .dossier import write_dossiers

    checkpoint = output / "data/state.json"
    state = json.loads(checkpoint.read_text()) if checkpoint.exists() else new_state()
    previous = state["tested"]
    events = advance(state, batch)
    if state["tested"] != previous:
        write_dossiers(output, state, events)
        write_products(output, state)
        checkpoint.parent.mkdir(parents=True, exist_ok=True)
        manifest = checkpoint.with_name("manifest.json")
        if not manifest.exists():
            rev = subprocess.run(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True
            )
            dirty = subprocess.run(
                ["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True
            )
            sha = rev.stdout.strip() if rev.returncode == 0 and not dirty.stdout.strip() else None
            repo = os.environ.get("GITHUB_REPOSITORY", "strmax195-hue/Mendeleev-Fuel-Lab")
            manifest.write_text(
                json.dumps(
                    dict(
                        model=state["model"],
                        source_commit=sha,
                        sources=f"https://github.com/{repo}/blob/{sha or 'main'}/SOURCES.md",
                        verification=f"git checkout {sha}" if sha else "Local working tree",
                    ),
                    indent=2,
                )
                + "\n"
            )
        temp = checkpoint.with_suffix(".tmp")
        temp.write_text(json.dumps(state, separators=(",", ":"), allow_nan=False) + "\n")
        temp.replace(checkpoint)
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(".lab"))
    parser.add_argument("--batch", type=int, default=24)
    parser.add_argument("--verify", metavar="CANDIDATE_ID")
    args = parser.parse_args()
    if args.verify:
        if args.verify not in catalogue():
            parser.error("Unknown candidate ID")
        print(json.dumps(simulate([catalogue()[args.verify]], trace=True)[0], indent=2))
    else:
        s = run(args.output, args.batch)
        print(
            f"Generation {s['generation']} | {s['tested']}/{s['total']} verified | model {s['model']}"
        )


if __name__ == "__main__":
    main()
