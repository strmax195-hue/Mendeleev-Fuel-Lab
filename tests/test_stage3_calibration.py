"""Conservation, calibration bounds, real trace and admission/dossier lifecycle."""

import copy
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from cli import calibration_worker as worker
from cli.local_worker import read_bundle
from engine import stage3_publish as publisher
from engine.bench_protocol import markdown, protocol
from engine.stage2_publish import build as weather_index
from engine.stage2_survival import ROOT, model_hash as survival_hash
from engine.stage3_calibration import (
    ENGINES,
    RPMS,
    active_pulse_ms,
    calibration,
    ci_delay,
    cold_start,
    crank_cell,
    fuel,
    inlet,
    laminar_speed,
    livengood_wu,
    si_delay,
    volume,
)
from engine.wltp_simulator import (
    PHASES,
    TRACE,
    oil_interval,
    simulate,
    speeds,
    thermal_step,
    wheel_step,
)
from scripts.milestones import reconcile_calibrations


def seed():
    return json.loads(
        (ROOT / "docs/seed.js").read_text(encoding="utf-8").split("=", 1)[1].strip()[:-1]
    )


class CalibrationPhysics(unittest.TestCase):
    def test_integral_analytic_bounds_and_interpolated_onset(self):
        # 600 rpm gives 3600 degrees/s. A constant 5 ms delay ignites at 18°.
        I, onset = livengood_wu([(0, 0.005), (9, 0.005), (30, 0.005)], 600)
        self.assertAlmostEqual(I, 30 / 18)
        self.assertAlmostEqual(onset, 18)
        self.assertEqual(livengood_wu([(0, math.inf), (30, math.inf)], 600), (0.0, None))
        I, t = livengood_wu([(0, 1 / 100), (36, 1 / 300)], 600)
        self.assertAlmostEqual(I, 2)
        self.assertAlmostEqual(t, 36 * (math.sqrt(5) - 1) / 2)
        self.assertIsNone(livengood_wu([(0, 0.005), (10, 0.005)], 1200)[1])
        for points, rpm in (([(0, 1), (0, 1)], 600), ([(0, 0)], 600), ([(0, 1)], 0)):
            with self.assertRaises(ValueError):
                livengood_wu(points, rpm)

    def test_ignition_quality_pressure_temperature_and_speed(self):
        self.assertLess(si_delay(950, 3e6, 95), si_delay(800, 3e6, 95))
        self.assertLess(si_delay(850, 5e6, 95), si_delay(850, 3e6, 95))
        self.assertGreater(si_delay(850, 3e6, 109), si_delay(850, 3e6, 95))
        self.assertTrue(math.isinf(ci_delay(700, 1.2e6, 51, 1600, 0.09)))
        self.assertLess(ci_delay(800, 4e6, 51, 1600, 0.09), ci_delay(800, 4e6, 30, 1600, 0.09))
        self.assertLess(ci_delay(900, 4e6, 51, 1600, 0.09), ci_delay(800, 4e6, 51, 1600, 0.09))
        s = fuel("ai95100")
        self.assertIsNone(laminar_speed(s, 600, 1e6, 0.60))
        self.assertGreater(laminar_speed(s, 650, 1e6, 1), laminar_speed(s, 500, 1e6, 1))
        self.assertLess(laminar_speed(s, 650, 2e6, 1), laminar_speed(s, 650, 1e6, 1))

    def test_geometry_ecu_mass_stoichiometry_and_relative_tables(self):
        rows = seed()["baselines"]
        for arch, e in ENGINES.items():
            key = e.ref + "100"
            s = fuel(key)
            self.assertAlmostEqual(volume(e, 180) / volume(e, 0), e.cr)
            self.assertAlmostEqual(
                s["afr"], next(r["afr"] for r in rows if r["id"] == key), places=8
            )
            m = calibration(key, arch)
            self.assertEqual(m["rpms"], list(RPMS))
            for i, gridrow in enumerate(m["cells"]):
                for j, c in enumerate(gridrow):
                    self.assertIsNotNone(c)
                    self.assertEqual(c["pulsePct"], 100)
                    self.assertEqual(c["offsetDeg"], 0)
                    self.assertAlmostEqual(
                        c["airMg"] / c["fuelMg"], s["afr"] * c["lambda"], places=4
                    )
                    self.assertAlmostEqual(
                        c["effectiveMs"] * e.flow_mg_ms, c["fuelMg"], delta=0.00003
                    )
                    self.assertEqual(c["delayDeg"] is None, not e.diesel)
                    self.assertLess(c["efficiency"], 1)
        self.assertAlmostEqual(inlet(ENGINES["gdi"], 1, fuel("ai95100"))[0] - 101325, 180000)
        # Oxygenated test formulation must have a physically distinct calibration.
        k = "eth90-water10"
        alt = calibration(k, "mpi")
        mass = fuel(k)
        c = alt["cells"][2][2]
        stored = calibration("ai95100", "mpi")["cells"][2][2]
        e = ENGINES["mpi"]
        _, _, lam, air = inlet(e, 0.6, mass)
        pulse = active_pulse_ms(mass, e, air, lam)
        self.assertAlmostEqual(
            c["pulsePct"], 100 * (pulse + e.dead_ms) / stored["pulseMs"], places=4
        )
        self.assertGreater(c["pulsePct"], 120)
        self.assertAlmostEqual(c["offsetDeg"], c["btdc"] - stored["btdc"])
        self.assertAlmostEqual(
            pulse * e.flow_mg_ms * math.sqrt(mass["rho"] / fuel("ai95100")["rho"]),
            air / (mass["afr"] * lam) * 1e6,
        )

    def test_cold_screen_is_replayed_only_on_matching_hardware(self):
        s = fuel("eth44-ipa56")
        self.assertEqual(cold_start(s, ENGINES["gdi"])["factor"], s["coldAssisted"]["factor"])
        self.assertIsNotNone(s["coldAssisted"]["factor"])
        self.assertIsNone(cold_start(s, ENGINES["mpi"])["factor"])
        blocked = fuel("diesel100")
        self.assertIsNone(cold_start(blocked, ENGINES["diesel"])["factor"])

    def test_mechanism_specific_outcomes_and_cold_start(self):
        diesel = publisher.projection("diesel100")["architectures"]
        self.assertEqual(diesel["mpi"]["status"], "unsupported")
        self.assertIsNone(diesel["mpi"]["wltc"])
        self.assertEqual(diesel["diesel"]["wltc"]["catalyst"], "DOC")
        gas = publisher.projection("ai95100")["architectures"]
        self.assertEqual(gas["mpi"]["wltc"]["catalyst"], "TWC")
        self.assertIsNone(gas["diesel"]["wltc"])
        gdi = [c for row in gas["gdi"]["map"]["cells"] for c in row if c]
        self.assertTrue(any(c["lspiReview"] for c in gdi))
        self.assertTrue(any(c["lw"] >= 1 and c["knockAt"] is not None for c in gdi))
        self.assertTrue(all(c["lw"] < 1 for c in gdi if c["knockAt"] is None))
        self.assertIsNone(cold_start(fuel("ai95100"), ENGINES["mpi"])["factor"])
        self.assertIsNone(cold_start(fuel("diesel100"), ENGINES["diesel"])["factor"])
        self.assertGreater(
            cold_start(dict(fuel("ai95100"), coldWeather=[0, 15, 1.5, 1]), ENGINES["mpi"])[
                "factor"
            ],
            1,
        )
        self.assertIn(
            "Trace ester SI kinetics need blend measurements",
            calibration("eth100", "mpi")["reasons"],
        )
        with self.assertRaises(ValueError):
            publisher.projection("unregistered100")

    def test_statutory_trace_phase_distances_and_work(self):
        self.assertEqual(
            hashlib.sha256(TRACE.read_bytes()).hexdigest(),
            "8a93d7212b7569f0b900a4a75acd661bdd2b78ca1e56409789587f832a9cf417",
        )
        v = speeds()
        self.assertEqual((len(v), max(v)), (1801, 131.3))
        start = 0
        for (_, end), known in zip(PHASES, (3094.528, 4755.889, 7161.722, 8254.139)):
            distance = sum(wheel_step(v[t], v[t + 1])[0] for t in range(start, end))
            self.assertAlmostEqual(distance, known, delta=0.001)
            self.assertEqual(v[end], 0)
            start = end
        for u, w in ((0, 15), (56, 56), (121, 105), (31, 0), (0, 0)):
            _, a, r, k, tr, br = wheel_step(u, w)
            self.assertAlmostEqual(tr - br, a + r + k, places=8)

    def test_wltc_first_law_each_phase_and_whole_cycle(self):
        for arch, e in ENGINES.items():
            k = e.ref + "100"
            w = publisher.projection(k)["architectures"][arch]["wltc"]
            self.assertAlmostEqual(w["km"], 23.266278, places=6)
            self.assertEqual(w["curve"][0], [0, 0.0, 23.0, 23.0])
            self.assertEqual(w["curve"][-1][0], 1800)
            self.assertIn(589, [x[0] for x in w["curve"]])
            for a in [w["totals"], *w["phases"]]:
                self.assertAlmostEqual(
                    a["fuelJ"], a["shaftJ"] + a["exhaustJ"] + a["coolingJ"], delta=0.003
                )
                self.assertAlmostEqual(
                    a["tractionJ"] - a["brakeJ"],
                    a["aeroJ"] + a["rollJ"] + a["kineticJ"],
                    delta=0.003,
                )
                self.assertAlmostEqual(
                    a["shaftJ"] + a["unmetWheelJ"] + a["unmetAuxJ"],
                    a["aeroJ"]
                    + a["rollJ"]
                    + a["kineticJ"]
                    + a["frictionBrakeJ"]
                    + a["transmissionLossJ"]
                    + a["accessoryJ"],
                    delta=0.005,
                )
            self.assertAlmostEqual(
                sum(p["fuelJ"] for p in w["phases"]), w["totals"]["fuelJ"], delta=0.004
            )
            self.assertAlmostEqual(
                w["litres100"],
                w["totals"]["fuelJ"] / fuel(k)["lhv"] / fuel(k)["rho"] * 100 / w["km"],
                places=4,
            )
            if w["lightOffS"] is not None:
                self.assertGreater(w["lightOffS"], 0)
                previous = next(p for p in reversed(w["curve"]) if p[0] <= w["lightOffS"])
                following = next(p for p in w["curve"] if p[0] >= w["lightOffS"])
                self.assertLessEqual(previous[2], 300.01)
                self.assertGreaterEqual(following[2], 299.99)
            self.assertIsNone(w["oil"]["vehicleApprovedKm"])
        self.assertEqual(thermal_step(23, 0, 0.01, 2), 23)
        self.assertLess(thermal_step(400, 0, 0.01, 2), 400)

    def test_underpowered_map_cannot_claim_completed_trace_consumption(self):
        m = copy.deepcopy(calibration("ai95100", "mpi"))
        for row in m["cells"]:
            for cell in row:
                cell["torqueNm"] *= 0.05
        w = simulate("ai95100", m)
        self.assertFalse(w["traceFollowed"])
        self.assertGreater(w["totals"]["unmetWheelJ"], 1000)
        self.assertIsNone(w["litres100"])
        self.assertIsNone(w["oil"]["modelDrainKm"])
        self.assertTrue(any(p["litres100"] is None for p in w["phases"]))

    def test_oil_budget_tracks_within_cycle_peak_and_service_cap(self):
        safe = [[(1, 0)] * 3]
        self.assertEqual(oil_interval(safe, 1, [1]), (10000, "scenario service cap"))
        repeated = [[(1, 2), (1, 0), (1, 0)]]
        self.assertEqual(oil_interval(repeated, 10, [10]), (40, "water"))
        self.assertEqual(oil_interval([[(0, 0)] * 3], 1, [1]), (10000, "scenario service cap"))
        spike = [[(1, 9), (1, 0), (1, 0)], [(0.01, 0.09), (1, 0), (1, 0)]]
        self.assertEqual(oil_interval(spike, 10, [3, 10]), (3, "water"))


class ResearchLoop(unittest.TestCase):
    def test_seed_and_real_empty_funnel_preserve_existing_stage2_id(self):
        state = seed()
        second, rows = weather_index(state)
        historical = json.loads((ROOT / "engine/data/stage2-identities.json").read_text())
        self.assertIn(
            "1b255ec6773aabf7fe440e8c9271f9f88d52751eff11c270691e0ab5429427a1", historical.values()
        )
        self.assertEqual(survival_hash(), second["model"])
        index, profiles = publisher.build(state, second, rows.__getitem__)
        self.assertEqual(index["eligible"], [])
        self.assertEqual(index["champions"], {})
        self.assertEqual(set(profiles), set(publisher.CONTROLS))
        generated = json.loads(
            (ROOT / "docs/calibration-seed.js").read_text().split("=", 1)[1].strip()[:-1]
        )
        self.assertEqual(index, generated["report"])
        self.assertEqual(profiles, generated["rows"])
        bad = copy.deepcopy(second)
        bad["generation"] += 1
        with self.assertRaises(ValueError):
            publisher.build(state, bad, rows.__getitem__)
        bad = copy.deepcopy(second)
        bad["entries"][bad["nominated"][0]] = "0" * 64
        with self.assertRaises(ValueError):
            publisher.build(state, bad, rows.__getitem__)

    def test_champion_artifacts_replay_and_gravimetric_mass(self):
        # Exercise future publication with explicit gate fixtures on registered chemistry.
        # All ECU values, speed data and gravimetric masses remain genuine computations.
        state = seed()
        second, rows = weather_index(state)
        key = "eth100"
        second["nominated"] = sorted(set(second["nominated"]) | {key})
        rows[key]["gate"]["status"] = "passed"
        second["entries"][key] = publisher.digest(rows[key])
        second["funnel"] = {
            status: sum(rows[k]["gate"]["status"] == status for k in second["nominated"])
            for status in ("passed", "review", "rejected")
        }
        real = publisher.projection
        entry = copy.deepcopy(real(key))
        entry["architectures"]["mpi"]["status"] = "passed"
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            folder = out / "data/weather"
            folder.mkdir(parents=True)
            for k in second["nominated"]:
                (folder / (k + ".json")).write_bytes(publisher.bytes_for(rows[k]))
            with patch.object(
                publisher, "projection", side_effect=lambda k: entry if k == key else real(k)
            ):
                idx = publisher.publish(out, state, second)
                self.assertEqual(idx["champions"], {key: ["mpi"]})
                d = out / idx["protocols"][key]["path"]
                p = json.loads((d / "protocol.json").read_bytes())
                self.assertEqual(sum(q["mg"] for q in p["components"]), 1000000)
                self.assertIn("b100", {q["stock"] for q in p["components"]})
                self.assertEqual((d / "protocol.md").read_text(encoding="utf-8"), markdown(p))
                self.assertEqual(
                    hashlib.sha256((d / "protocol.md").read_bytes()).hexdigest(),
                    idx["protocols"][key]["mdSha256"],
                )
                self.assertEqual(json.loads((d / "results.json").read_bytes()), entry)
                self.assertEqual(set(p["targets"]["mpi"]), {"baseline", "candidate", "control"})
                self.assertIn("ai95100", markdown(p))
                publisher.publish(out, state, second)
            events = json.loads((out / "data/stage3-events.json").read_bytes())
            self.assertEqual(len(events), 1)
            with patch("scripts.milestones.gh", side_effect=[[], {"number": 711}]) as api:
                reconcile_calibrations(events, "example/lab")
                data = api.call_args.kwargs["data"]
            self.assertTrue(data["title"].startswith("[STAGE-3 CERTIFIED]"))
            with patch(
                "scripts.milestones.gh", return_value=[{"body": data["body"], "state": "closed"}]
            ) as api:
                reconcile_calibrations(events, "example/lab")
                self.assertEqual(api.call_count, 1)
            with patch("scripts.milestones.gh") as api:
                reconcile_calibrations([], "example/lab")
                api.assert_not_called()
        with self.assertRaises(ValueError):
            protocol(real("ai95100"), ["mpi"], {})
        with self.assertRaises(ValueError):
            protocol(real(key), ["mpi"], {})

    def test_worker_sector_replay_and_forgery(self):
        bundle = worker.compute(0, 2)
        self.assertEqual(worker.verify(bundle), bundle["payload"]["results"])
        bad = copy.deepcopy(bundle)
        first = next(iter(bad["payload"]["results"].values()))
        first["id"] = "invented"
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            worker.verify(bad)
        bad["sha256"] = publisher.digest(bad["payload"])
        with self.assertRaisesRegex(ValueError, "replay"):
            worker.verify(bad)
        for start, count in ((-1, 1), (999, 2), (0, 9), (0, 0)):
            with self.assertRaises(ValueError):
                worker.compute(start, count)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "calibration-control.json"
            cmd = [sys.executable, "-I", str(ROOT / "cli/local_worker.py")]
            env = {**os.environ, "PATH": tmp}
            subprocess.run(
                [*cmd, "--stage", "3", "--candidate", "diesel100", "--output", str(path)],
                env=env,
                check=True,
                capture_output=True,
            )
            subprocess.run([*cmd, "--verify", str(path)], env=env, check=True, capture_output=True)
            self.assertEqual(
                worker.verify(read_bundle(path)), {"diesel100": publisher.projection("diesel100")}
            )

    def test_contributed_calibration_packets(self):
        for p in (ROOT / "contributions").glob("calibration-*.json"):
            bundle = read_bundle(p)
            if bundle["payload"]["model"] == publisher.model_hash():
                worker.verify(bundle)
