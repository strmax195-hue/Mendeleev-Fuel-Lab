import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree as ET
from engine.discovery_solver import (
    advance,
    catalogue,
    check_state,
    frontier,
    identity,
    new_state,
    record_vector,
    run,
    select_batch,
)
from engine.elements_db import ELEMENTS, MICROEMULSION, PPM
from engine.fuel_simulator import ROOT
from engine.svg_dashboard import fuel_map
from scripts.milestones import reconcile


class Discovery(unittest.TestCase):
    def test_curated_map_and_catalogue(self):
        self.assertEqual(len(ELEMENTS), 118)
        self.assertEqual(len({(e["row"], e["col"]) for e in ELEMENTS}), 118)
        self.assertEqual(len(PPM), 17)
        cat = catalogue()
        self.assertEqual(len(cat), 1000)
        self.assertTrue(all(sum(p.values()) == 100 and identity(p) == i for i, p in cat.items()))
        self.assertIn(identity(MICROEMULSION), cat)

    def test_reproducible_seed_and_offspring(self):
        seed = json.loads(
            (ROOT / "docs/seed.js").read_text().split("=", 1)[1].strip().removesuffix(";")
        )
        state = new_state()
        advance(state, 24)
        self.assertEqual(state["model"], seed["model"])
        self.assertEqual([r["id"] for r in state["results"]], [r["id"] for r in seed["results"]])
        for a, b in zip(state["results"], seed["results"]):
            self.assertAlmostEqual(a["range"], b["range"], places=6)
        rows = state["results"]
        picks = select_batch(rows, 24, 1)
        self.assertEqual(len(picks), 24)
        self.assertTrue(set(map(identity, picks)).isdisjoint(r["id"] for r in rows))

        def distance(a, b):
            return sum(abs(a.get(k, 0) - b.get(k, 0)) for k in a.keys() | b.keys())

        self.assertTrue(any(distance(p, r["parts"]) == 2 for p in picks for r in rows))
        self.assertEqual(picks, select_batch(rows, 24, 1))
        corrupt = copy.deepcopy(state)
        corrupt["tested"] += 1
        with self.assertRaises(ValueError):
            check_state(corrupt)

    def test_complete_survey_and_terminal_idempotence(self):
        state = new_state()
        self.assertIn("0.0%", fuel_map(state))
        advance(state, 1000)
        check_state(state)
        self.assertEqual(state["tested"], 1000)
        self.assertIn("100.0%", fuel_map(state))
        before = json.dumps(state)
        self.assertEqual(advance(state, 24), [])
        self.assertEqual(before, json.dumps(state))

    def test_batch_artifacts_and_deduplication(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            s = run(out, 15)
            self.assertEqual(json.loads((out / "data/state.json").read_text())["tested"], 15)
            for name in ("mendeleev-fuel", "pareto"):
                ET.parse(out / "assets" / f"{name}.svg")
            for event in s["records"]:
                path = out / event["dossier"]
                self.assertIn("--verify", path.read_text())
                self.assertIn("crank_deg", path.with_suffix(".csv").read_text())
            s = run(out, 4)
            self.assertEqual(s["tested"], 19)
            markers = [
                {"body": f'<!-- fuel-lab {s["model"]} {e["kind"]} {e["id"]} -->\nreviewed'}
                for e in s["records"]
            ]
            with patch("scripts.milestones.gh", return_value=markers) as gh:
                reconcile(s, "owner/repo")
                self.assertEqual(gh.call_count, 1)

    def test_pareto_tradeoffs(self):
        data = [
            dict(id="a", index=50, range=500),
            dict(id="b", index=55, range=400),
            dict(id="c", index=49, range=490),
            dict(id="d", index=50, range=500),
        ]
        self.assertEqual({r["id"] for r in frontier(data, record_vector)}, {"a", "b"})
