"""Phase, material, energy, persistence and replay invariants of the Stage 2 screen."""

import copy
import json
import hashlib
import os
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from cli.local_worker import compute, digest, verify
from engine.discovery_solver import catalogue
from engine.elements_db import CEA, MICROEMULSION, STOCKS
from engine.materials_db import (
    DROP_IN,
    INCOMPATIBLE,
    MATERIALS,
    SWAP,
    at_temperature,
    chemical_ratings,
    retrofit,
)
from engine.stage2_publish import BEGIN, block, build, certificate, contributions
from engine.stage2_survival import (
    DELIVERY_MJ,
    DOSES,
    GRID_PRIMARY,
    PHASE_REVIEW,
    ROOT,
    SOLID,
    SPLIT,
    TEMPS,
    WEAR_LIMIT,
    activity,
    flash_pressure,
    gate,
    inventory,
    lower_heat,
    model_hash,
    molecular_mass,
    normalized,
    pairs,
    parent_volumes,
    road_account,
    road_profile,
    saturation,
    screen,
    split_below,
    wear_proxy,
)
from scripts.milestones import issue_certificate, reconcile


def seed():
    seed_file = (ROOT / "docs/seed.js").read_text(encoding="utf-8")
    return json.loads(seed_file.split("=", 1)[1].strip().removesuffix(";"))


class SurvivalPhysics(unittest.TestCase):
    def test_cold_split_and_independent_solid_flags(self):
        s = screen(MICROEMULSION)
        self.assertEqual(s["weather"][25 - min(TEMPS)][0], 0)  # Published neutral point.
        self.assertTrue(s["weather"][0][0] & SPLIT)
        self.assertTrue(s["weather"][0][0] & SOLID)
        self.assertEqual(s["weather"][0][1:], [None, None, None])
        self.assertEqual(s["weather"][-1][0], PHASE_REVIEW)
        dmc = screen({"dmc": 100})
        self.assertEqual(dmc["weather"][0][0], SOLID)
        self.assertEqual(dmc["weather"][60][0], 0)
        self.assertFalse(any(w[0] & SPLIT for w in screen({"eth": 80, "water": 20})["weather"]))

    def test_tangent_plane_against_symmetric_binary_critical_point(self):
        x = {"eth": 0.5, "water": 0.5}
        interaction = [("eth", "water", 2.0)]
        self.assertAlmostEqual(split_below(x, interaction), 298.15, delta=0.002)
        gamma = activity(x, interaction, 298.15)
        self.assertAlmostEqual(gamma["eth"], math.exp(0.5))
        self.assertEqual(split_below(x, [("eth", "water", 0)]), 0)

    def test_four_volume_flash_and_temperature_monotonicity(self):
        test = screen({"eth": 85, "water": 15})
        pressures = [r[1] for r in test["weather"]]
        self.assertEqual(len(pressures), 86)
        self.assertTrue(all(a < b for a, b in zip(pressures, pressures[1:])))
        self.assertLess(test["weather"][0][2], 1)
        inv = inventory({"eth": 85, "water": 15})
        x = normalized(inv["mol"])
        gamma = activity(x, pairs(x), 310.95)
        bubble = sum(x[k] * gamma[k] * saturation(k, 310.95) for k in x)
        self.assertLess(test["rvpKpa"], bubble)
        self.assertAlmostEqual(
            flash_pressure(inventory({"eth": 100})["mol"], []), saturation("eth", 310.95), places=9
        )
        self.assertIsNone(screen({"diesel": 100})["weather"][-1][2])

    def test_materials_retrofit_and_temperature_rules(self):
        self.assertEqual(len(MATERIALS), 9)
        diesel = chemical_ratings({"diesel": 1})
        self.assertEqual(retrofit(diesel), DROP_IN)
        self.assertEqual(diesel["epdm"], "avoid")
        self.assertEqual(retrofit(chemical_ratings({"ipa": 1})), SWAP)
        self.assertEqual(retrofit(chemical_ratings({"eth": 1})), INCOMPATIBLE)
        fame = chemical_ratings({"b100": 1})
        self.assertEqual(fame["brass"], "avoid")
        self.assertEqual(retrofit(fame, "legacy"), INCOMPATIBLE)
        self.assertEqual(retrofit(diesel, "stainless"), DROP_IN)
        self.assertEqual(retrofit(at_temperature(diesel, -35), "stainless"), SWAP)
        self.assertEqual(retrofit(at_temperature(diesel, -20), "stainless"), DROP_IN)
        for parts in (MICROEMULSION, {"diesel": 100}, {"ipa": 100}):
            s = screen(parts)
            for name, bands in s["assemblies"].items():
                for t in TEMPS:
                    verdict = [v for start, v in bands if start <= t][-1]
                    self.assertEqual(verdict, retrofit(at_temperature(s["chemical"], t), name))

    def test_dose_is_minimum_and_stays_in_auxiliary_whitelist(self):
        s = screen({"eth": 64, "ipa": 36})
        v = parent_volumes({"eth": 64, "ipa": 36})
        fraction = s["doseVolPct"] / 100
        self.assertIn(fraction, DOSES)
        self.assertGreater(s["wearBeforeUm"], WEAR_LIMIT)
        self.assertLessEqual(s["wearUm"], WEAR_LIMIT)
        self.assertTrue(all(wear_proxy(v, d) > WEAR_LIMIT for d in DOSES if d < fraction))
        self.assertEqual(s["volumes"]["b100"], fraction)
        self.assertTrue(all(row[0] & PHASE_REVIEW for row in s["weather"]))
        for parts in ({"eth": 99, "water": 1}, {"b100": 100}, {"diesel": 100}, {"dmc": 100}):
            self.assertEqual(screen(parts)["doseVolPct"], 0)
            with self.assertRaises(ValueError):
                inventory(parts, 0.01)
        for parts in ({"eth": 98, "b100": 2}, {"ammonia": 100}, {"eth": -2, "water": 102}):
            with self.assertRaises(ValueError):
                screen(parts)

    def test_mass_atoms_and_enthalpy_conserved_after_displacement(self):
        parts = {"eth": 64, "ipa": 36}
        for dose in (0, *DOSES):
            mix = inventory(parts, dose)
            self.assertAlmostEqual(sum(mix["volume"].values()), 1)
            self.assertAlmostEqual(mix["volume"].get("b100", 0), dose)
            self.assertAlmostEqual(mix["mol"]["eth"] / mix["mol"]["ipa"], 64 / 36)
            for k in mix["mol"]:
                self.assertAlmostEqual(mix["mol"][k] * molecular_mass(k), mix["kg"][k])
            atoms = {
                el: sum(mix["mol"][k] * STOCKS[k]["atoms"].get(el, 0) for k in mix["mol"])
                for el in ("C", "H", "O")
            }
            o2 = atoms["C"] + atoms["H"] / 4 - atoms["O"] / 2
            products_kg = (
                atoms["C"] * CEA["CO2"]["molar_mass"] + atoms["H"] / 2 * CEA["H2O"]["molar_mass"]
            ) / 1000
            self.assertAlmostEqual(
                sum(mix["kg"].values()) + o2 * CEA["O2"]["molar_mass"] / 1000, products_kg
            )
            products_h = (
                atoms["C"] * CEA["CO2"]["hf_j_mol"] + atoms["H"] / 2 * CEA["H2O"]["hf_j_mol"]
            )
            reactants_h = sum(STOCKS[k]["hf"] * n for k, n in mix["mol"].items())
            self.assertAlmostEqual(sum(mix["mj"].values()), (reactants_h - products_h) / 1e6)
        self.assertLess(lower_heat("water"), 0)

    def test_weather_changes_drag_wheel_work_and_primary_energy(self):
        row = seed()["baselines"][0]
        physical = screen(row["parts"])
        ledger = road_profile(physical, row)
        cold, warm = road_account(physical, row, -35), road_account(physical, row, 50)
        self.assertGreater(cold["investedMj100"], warm["investedMj100"])
        self.assertGreater(cold["litres100"], warm["litres100"])
        self.assertEqual(ledger["weather"][50][0], ledger["investedMj100"])
        predicted_delta = row["dragN"] * 288.15 * (1 / 238.15 - 1 / 323.15) / 10
        self.assertAlmostEqual(cold["wheelMj100"] - warm["wheelMj100"], predicted_delta, places=4)
        self.assertAlmostEqual(
            (cold["fuelMj100"] - warm["fuelMj100"]) * row["eta"], predicted_delta, places=4
        )
        limits = [w[0] + 0.01 for w in ledger["weather"]]
        self.assertNotIn(
            "Upstream primary energy exceeds AI-95", gate(physical, ledger, 99, limits)["failures"]
        )
        limits[0] -= 0.02
        self.assertIn(
            "Upstream primary energy exceeds AI-95", gate(physical, ledger, 99, limits)["failures"]
        )

    def test_road_work_upstream_energy_ledgers(self):
        state = seed()
        for row in state["baselines"] + state["results"]:
            s = screen(row["parts"])
            a = road_account(s, row)
            litres = row["mjKm"] * 100 / s["mjL"]
            self.assertAlmostEqual(a["litres100"], litres, places=5)
            self.assertAlmostEqual(litres * s["mjL"], row["mjKm"] * 100, delta=0.0003)
            self.assertAlmostEqual(a["wheelMj100"], (row["dragN"] + row["rollN"]) / 10, places=5)
            self.assertAlmostEqual(
                a["investedMj100"],
                litres
                * (s["upstreamMjL"] + s["kwhL"] * 3.6 * GRID_PRIMARY + s["kgL"] * DELIVERY_MJ),
                delta=0.0003,
            )
            self.assertAlmostEqual(a["eroi"], a["wheelMj100"] / a["investedMj100"], places=5)
            self.assertAlmostEqual(a["synthesisKwh100"], litres * s["kwhL"], places=5)
            self.assertAlmostEqual(a["fuelMj100"], litres * s["mjL"], places=5)
            if not s["doseVolPct"]:
                self.assertAlmostEqual(s["mjL"], row["mjL"], places=7)
                self.assertAlmostEqual(
                    a["investedMj100"],
                    row["synthesisMj100"] + 100 * row["kgKm"] * DELIVERY_MJ,
                    places=5,
                )
        s = screen({"dmc": 100})
        g = gate(s, {"eroi": 0.5, "investedMj100": 9}, 3)
        self.assertEqual(g["status"], "rejected")
        self.assertIn("Wheel EROI below 1", g["failures"])
        self.assertIn("Upstream primary energy exceeds AI-95", g["failures"])


class PublicationAndWorker(unittest.TestCase):
    def test_index_retains_earlier_nominations_and_counts_only_shortlist(self):
        state = seed()
        report, rows = build(state)
        self.assertEqual(set(rows), {r["id"] for r in state["baselines"] + state["results"]})
        self.assertTrue(set(state["frontier"]) <= set(report["nominated"]))
        self.assertEqual(sum(report["funnel"].values()), len(report["nominated"]))
        self.assertNotIn("ai95100", report["nominated"])
        extra = next(r for r in rows if r not in report["nominated"] and r in catalogue())
        report["nominated"].append(extra)
        again, _ = build(state, report)
        self.assertIn(extra, again["nominated"])
        event = state["records"][0]
        cert = certificate(rows[event["id"]], state["model"])
        self.assertIn("--start", cert)
        self.assertIn("Laboratory and OEM validation", cert)
        text = block("Peer review\n", cert) + "\nHuman annotation"
        self.assertEqual(block(text, cert), text)

    def test_existing_issue_enriched_once_preserving_reviewer_notes(self):
        state = seed()
        _, rows = build(state)
        e = state["records"][0]
        state["records"] = [e]
        marker = f'<!-- fuel-lab {state["model"]} {e["kind"]} {e["id"]} -->'
        issue = {"number": 31, "body": marker + "\nHuman review notes."}
        with patch("scripts.milestones.gh", side_effect=[[issue], {}]) as api:
            reconcile(state, "owner/lab", rows)
            updated = api.call_args.kwargs["data"]["body"]
            self.assertIn("Human review notes.", updated)
            self.assertEqual(updated.count(BEGIN), 1)
            self.assertIn(issue_certificate(rows[e["id"]], "owner/lab", e["dossier"]), updated)
        with patch("scripts.milestones.gh", return_value=[dict(issue, body=updated)]) as api:
            reconcile(state, "owner/lab", rows)
            self.assertEqual(api.call_count, 1)

    def test_legacy_checkpoint_migrates_once_and_repairs_a_missing_profile(self):
        from engine.svg_progress import write_products

        state = seed()
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            checkpoint = out / "data/state.json"
            checkpoint.parent.mkdir()
            original = json.dumps(state).encode()
            checkpoint.write_bytes(original)
            for event in state["records"]:
                dossier = out / event["dossier"]
                dossier.parent.mkdir(exist_ok=True)
                dossier.write_text("Archived Stage 1 record.\n", encoding="utf-8")
            write_products(out, state)
            index = (out / "data/stage2.json").read_bytes()
            report = json.loads(index)
            profile = out / "data/weather/eth100.json"
            self.assertEqual(
                hashlib.sha256(profile.read_bytes()).hexdigest(), report["entries"]["eth100"]
            )
            dossier = out / state["records"][0]["dossier"]
            reviewed = dossier.read_text(encoding="utf-8") + "\nPeer annotation."
            dossier.write_text(reviewed, encoding="utf-8")
            profile.unlink()
            write_products(out, state)
            self.assertEqual(checkpoint.read_bytes(), original)
            self.assertEqual((out / "data/stage2.json").read_bytes(), index)
            self.assertEqual(dossier.read_text(encoding="utf-8"), reviewed)
            self.assertEqual(
                hashlib.sha256(profile.read_bytes()).hexdigest(), report["entries"]["eth100"]
            )

    def test_worker_replay_integrity_and_bounds(self):
        bundle = compute(992, 8)
        self.assertEqual(set(verify(bundle)), set(sorted(catalogue())[-8:]))
        self.assertEqual(bundle, compute(992, 8))
        corrupt = copy.deepcopy(bundle)
        first = next(iter(corrupt["payload"]["results"].values()))
        first["wearUm"] = 0
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            verify(corrupt)
        corrupt["sha256"] = digest(corrupt["payload"])
        with self.assertRaisesRegex(ValueError, "replay"):
            verify(corrupt)
        for start, count in ((-1, 1), (999, 2), (0, 0), (0, 51), (True, 1)):
            with self.assertRaises(ValueError):
                compute(start, count)

    def test_worker_runs_outside_checkout_without_node(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "example.json"
            cmd = [sys.executable, "-I", str(ROOT / "cli/local_worker.py")]

            env = dict(os.environ, PATH=str(Path(temp)))
            subprocess.run(
                [*cmd, "--start", "7", "--count", "2", "--output", str(path)],
                cwd=temp,
                env=env,
                capture_output=True,
                check=True,
            )
            result = subprocess.run(
                [*cmd, "--verify", str(path)],
                cwd=temp,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("replay verified", result.stdout)

    def test_seed_weather_is_reproducible_and_submitted_sectors_replay(self):
        report, rows = build(seed())
        packed = json.loads(
            (ROOT / "docs/weather-seed.js").read_text().split("=", 1)[1].strip()[:-1]
        )
        self.assertEqual(packed["report"]["model"], model_hash())
        self.assertEqual(packed["report"]["entries"], report["entries"])
        self.assertEqual(rows, packed["rows"])
        for key, value in contributions().items():
            self.assertEqual(value, screen(catalogue()[key]))
