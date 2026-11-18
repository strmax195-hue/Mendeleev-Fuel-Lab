"""Planetary quantities, exact ideal cycling, public schemas and independent IssueOps gates."""

import copy
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from engine.biosphere_cycle import amounts, atom_ledger, audit, WEIGHTS
from engine.discovery_solver import catalogue, run
from engine.elements_db import MODEL
from engine.fuel_simulator import ROOT
from engine.reservoirs import AIR_PPM, OCEAN_PPM
from engine.stage3_publish import bytes_for, digest, projection
from engine.stage4_planetary import (
    ceiling,
    compute,
    FRESH_KG_YEAR,
    NPP_C_KG_YEAR,
    resources,
    submission,
    verify,
)
from engine import stage4_publish as public
from scripts.peer_verify import external, collect


def seed(name):
    return json.loads(
        (ROOT / "docs" / name).read_text(encoding="utf-8").partition("=")[2].strip()[:-1]
    )


class PlanetaryPhysics(unittest.TestCase):
    def test_all_formulas_conserve_every_atom_forward_and_back(self):
        for parts in [*catalogue().values(), {"ai95": 100}, {"diesel": 100}]:
            a = audit(parts)
            self.assertEqual(a["reactantAtomsMol"], a["productAtomsMol"])
            self.assertEqual(a["productAtomsMol"], a["regeneratedAtomsMol"])
            self.assertEqual(a["massResidualKg"], "0")
            self.assertEqual(a["halogenAtomMolPerL"], "0")
            self.assertIsNone(a["measuredReturnPct"])
            self.assertEqual(a["zeroGreenhouseByproducts"], "failed")
        kg, mol = amounts({"eth": 100}, 0.015)
        self.assertEqual(kg["b100"], Fraction("0.015") * Fraction("0.88"))
        react, out, o2, products = atom_ledger(mol)
        self.assertEqual(
            sum(kg.values()) + (2 * o2 * WEIGHTS["O"] + 2 * products["N2"] * WEIGHTS["N"]) / 1000,
            sum(amt * WEIGHTS[e] for e, amt in out.items()) / 1000,
        )
        self.assertEqual(o2, Fraction(audit({"eth": 100}, 0.015)["idealReverseO2Mol"]))
        with self.assertRaises(ValueError):
            amounts({"diesel": 100}, 0.02)

    def test_reservoir_mass_units_strict_flux_ceiling_and_scaling(self):
        self.assertAlmostEqual(AIR_PPM["C"], 420 * 12.0107 / 28.965)
        self.assertAlmostEqual(OCEAN_PPM["H"] + OCEAN_PPM["O"], 965000)
        self.assertTrue(all(0 < v <= 1e6 for v in (*AIR_PPM.values(), *OCEAN_PPM.values())))
        for v, expected in [(9.999, True), (10, False), (10.001, False)]:
            self.assertEqual(ceiling(v, 10)["within"], expected)
        for val in [-1, math.inf, math.nan]:
            with self.assertRaises(ValueError):
                ceiling(val, 10)
        x = resources({"eth": 100}, 0, 5)
        self.assertEqual(x["litresYear"], 6e11)
        self.assertEqual(x["annualWaterEquivalent"]["limitKgYear"], FRESH_KG_YEAR * 0.001)
        self.assertEqual(x["annualCropCarbon"]["limitKgYear"], NPP_C_KG_YEAR * 0.01)
        self.assertAlmostEqual(
            x["annualCropCarbon"]["kgYear"], 1.5 * x["elementKgYear"]["C"], delta=0.01
        )
        self.assertAlmostEqual(
            x["co2ReturnKgYear"], x["elementKgYear"]["C"] * 44.0095 / 12.0107, delta=0.01
        )
        self.assertEqual(x["elementKgYear"]["Si"], 0)
        self.assertGreater(x["abundanceMassPpm"]["Si"]["crust"], 1e5)
        self.assertEqual(x["resourceStatus"], "review")
        f = resources({"eth": 100}, 0, 5, fleet=10**12)
        self.assertEqual(f["resourceStatus"], "exceeds")
        self.assertAlmostEqual(f["co2ReturnKgYear"] / x["co2ReturnKgYear"], 1000)
        self.assertEqual(f["netIdealNitrogenDrawKg"], 0)
        self.assertGreater(f["annualN2ThroughputKg"], 0)

    def test_solar_and_synthesis_ledgers_match_browser_inputs(self):
        state = seed("seed.js")
        for r in state["results"] + state["baselines"]:
            x = resources(r["parts"], 0, 5)
            self.assertAlmostEqual(x["netEnergyReturn"], r["mjKg"] / r["synthesisMjKg"], places=6)
            if r["solarToTankPct"] is None:
                self.assertIsNone(x["solarToTankPct"])
            else:
                self.assertAlmostEqual(x["solarToTankPct"], r["solarToTankPct"], places=6)
                self.assertTrue(0 < x["solarToTankPct"] <= 100)
        self.assertIsNone(resources({"eth": 100}, 0.015, 5)["solarToTankPct"])
        self.assertIsNone(resources({"ai95": 100}, 0, 5)["solarToTankPct"])

    def test_spill_half_life_compartments_and_oxygen_demand(self):
        eth = audit({"eth": 100})["spill"]
        self.assertEqual(eth["aquiferOrganicDt50Days"], [3, 7])
        self.assertAlmostEqual(eth["aquiferOrganicKgPerKgAt28Days"][1], 0.0625)
        self.assertAlmostEqual(eth["theoreticalOxygenDemandKgPerKg"], 96 / 46.069, places=3)
        mixture = audit({"eth": 50, "ipa": 50})["spill"]
        self.assertIsNone(mixture["aquiferOrganicDt50Days"])
        self.assertIsNone(mixture["surfaceWaterDt50Days"])
        self.assertIsNone(mixture["soilDt50Days"])
        self.assertGreater(mixture["aquiferOrganicKgPerKgAt28Days"][1], 0.5)
        self.assertEqual(mixture["persistentSoilWaterToxicity"], "unverified")

    def test_no_financial_dependencies_in_code_or_published_schemas(self):
        forbidden = re.compile(
            r"\b(?:costs?|prices?|affordability|currency|dollars?|USD|EUR)\b|\b\w*(?:Usd(?:100|Kg|L)|Affordability|_PRICE)\w*|\$\s*\d",
            re.I,
        )
        for directory, ext in [
            ("engine", "*.py"),
            ("cli", "*.py"),
            ("scripts", "*.py"),
            ("docs", "*.js"),
            ("docs", "*.html"),
            ("assets", "*.svg"),
        ]:
            for path in (ROOT / directory).glob(ext):
                self.assertIsNone(forbidden.search(path.read_text(encoding="utf-8")), str(path))
        published = [
            MODEL,
            seed("seed.js"),
            seed("weather-seed.js"),
            seed("calibration-seed.js"),
            seed("planetary-seed.js"),
        ]
        for obj in published:
            self.assertIsNone(forbidden.search(json.dumps(obj)))


class ReplayPublication(unittest.TestCase):
    def test_seed_files_match_conservation_and_no_reference_can_qualify(self):
        state = seed("seed.js")
        third = seed("calibration-seed.js")["report"]
        index, rows = public.build(state, third)
        expected = seed("planetary-seed.js")
        self.assertEqual(index, expected["report"])
        self.assertEqual(rows, expected["rows"])
        self.assertEqual(index["finalists"], {})
        self.assertEqual(index["verified"], [])
        for case, b in rows.items():
            self.assertEqual(hashlib.sha256(bytes_for(b)).hexdigest(), index["entries"][case])
            self.assertEqual(b, verify(b))
            self.assertIsNone(public.verify_claim(submission(b), index))
        bad = copy.deepcopy(third)
        bad["generation"] += 1
        with self.assertRaises(ValueError):
            public.build(state, bad)
        bad = copy.deepcopy(third)
        bad["champions"] = {"ai95100": ["mpi"]}
        with self.assertRaises(ValueError):
            public.build(state, bad)

    def test_peer_receipt_must_replay_current_external_finalist(self):
        key, arch = "eth90-water10", "mpi"
        case = key + "/" + arch
        state = seed("seed.js")
        third = copy.deepcopy(seed("calibration-seed.js")["report"])
        record = copy.deepcopy(projection(key))
        record["architectures"][arch]["status"] = "passed"
        packet = copy.deepcopy(compute(key, arch))
        packet["payload"]["stage3Status"] = "passed"
        packet["sha256"] = digest(packet["payload"])
        third.update(eligible=[key], champions={key: [arch]})
        third["entries"][key] = digest(record)

        def source(k, a):
            return packet if (k, a) == (key, arch) else compute(k, a)

        with patch.object(public, "projection", return_value=record), patch.object(
            public, "compute", side_effect=source
        ):
            idx, rows = public.build(state, third)
            self.assertIn(case, rows)
            self.assertEqual(idx["verified"], [])  # gross CO2 independently fails the ecology gate
            msg = submission(packet)
            self.assertEqual(public.verify_claim(msg, idx), (case, packet["sha256"]))
            for bad in [
                msg + " extra",
                msg.replace("mpi", "gdi"),
                msg.replace(key, "ai95100"),
                msg[:-10],
                "a" * 500,
            ]:
                self.assertIsNone(public.verify_claim(bad, idx))
            with tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp)
                (out / "data").mkdir()
                path = out / "claims.json"
                path.write_text(json.dumps([msg, msg]))
                with patch.dict(os.environ, FUEL_LAB_PEER_CLAIMS=str(path)):
                    live = public.publish(out, state, third)
                self.assertEqual(live["peerReproduced"], {case: packet["sha256"]})
                self.assertEqual(public.publish(out, state, third), live)
                orphan = copy.deepcopy(third)
                orphan["champions"] = {}
                self.assertEqual(public.publish(out, state, orphan)["peerReproduced"], {})
        user = {"user": {"type": "User"}, "author_association": "NONE", "body": msg}
        self.assertTrue(external(user))
        self.assertFalse(external(dict(user, author_association="OWNER")))
        self.assertFalse(external(dict(user, user={"type": "Bot"})))
        with patch(
            "scripts.peer_verify.all_items",
            return_value=[user, dict(user, body="x"), dict(user, author_association="MEMBER")],
        ):
            self.assertEqual(collect("owner/repo"), [msg])

    def test_issueops_label_requires_external_author_and_verified_receipt(self):
        from scripts import peer_verify as worker
        import contextlib
        import io

        with tempfile.TemporaryDirectory() as tmp:
            event = Path(tmp) / "event.json"
            index = Path(tmp) / "index.json"
            index.write_text("{}")
            issue = {
                "number": 81,
                "user": {"type": "User", "id": 101},
                "author_association": "NONE",
                "body": "receipt",
                "labels": [],
            }

            def submit(sender, accepted):
                event.write_text(json.dumps({"issue": issue, "sender": {"id": sender}}))
                with patch.dict(
                    os.environ, GITHUB_REPOSITORY="example/lab", GITHUB_EVENT_PATH=str(event)
                ), patch.object(
                    sys, "argv", ["peer_verify", "--checkpoint", str(index)]
                ), patch.object(
                    worker, "verify_claim", return_value=accepted
                ), patch.object(
                    worker.subprocess, "run"
                ) as api, contextlib.redirect_stdout(
                    io.StringIO()
                ):
                    worker.main()
                return [call.args[0] for call in api.call_args_list]

            self.assertEqual(submit(202, True), [])
            self.assertEqual(submit(101, False), [])
            calls = submit(101, True)
            self.assertEqual(len(calls), 2)
            self.assertIn("repos/example/lab/issues/81/labels", calls[1])
            issue["labels"] = [{"name": worker.LABEL}]
            self.assertEqual(submit(101, True), [])
            self.assertIn("DELETE", submit(101, False)[0])

    def test_python_only_worker_and_rehashed_forgery(self):
        bundle = copy.deepcopy(compute("ai95100", "mpi"))
        bundle["payload"]["resources"]["litresYear"] += 1
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            verify(bundle)
        bundle["sha256"] = digest(bundle["payload"])
        with self.assertRaisesRegex(ValueError, "replay"):
            verify(bundle)
        with tempfile.TemporaryDirectory() as tmp:
            cmd = [sys.executable, "-I", str(ROOT / "cli/local_worker.py")]
            env = dict(os.environ, PATH=tmp)
            subprocess.run(
                [
                    *cmd,
                    "--stage",
                    "4",
                    "--candidate",
                    "ai95100",
                    "--architecture",
                    "mpi",
                    "--output",
                    "audit.json",
                ],
                cwd=tmp,
                env=env,
                check=True,
                capture_output=True,
            )
            reply = subprocess.check_output(
                [*cmd, "--verify", "audit.json"], cwd=tmp, env=env, text=True
            )
            self.assertIn(submission(compute("ai95100", "mpi")), reply)

    def test_known_checkpoint_replays_exact_membership_and_dossiers(self):
        state = seed("seed.js")
        keys = [r["id"] for r in state["results"][:12]]
        legacy = {
            "schema": 1,
            "model": "7550aae150609a34",
            "tested": len(keys),
            "total": 1000,
            "generation": 7,
            "results": [{"id": k} for k in keys],
            "records": [{"id": "eth100", "kind": "pareto", "dossier": "dossiers/pareto-eth100.md"}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            (out / "data").mkdir()
            (out / "data/state.json").write_text(json.dumps(legacy))
            s = run(out, 2)
            self.assertEqual(s["tested"], 14)
            self.assertEqual(s["generation"], 8)
            self.assertTrue(set(keys) <= {r["id"] for r in s["results"]})
            self.assertTrue(all("netEnergyReturn" in r for r in s["results"]))
            archive = (out / "dossiers/pareto-eth100.md").read_text(encoding="utf-8")
            self.assertIn("historical re-evaluation", archive)
            self.assertEqual(json.loads((out / "data/stage4.json").read_bytes())["generation"], 8)


if __name__ == "__main__":
    unittest.main()
