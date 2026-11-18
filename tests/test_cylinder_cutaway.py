"""Cross-check the Pages cutaway with independently computed Stage 3 cells."""

import json
from pathlib import Path
import shutil
import subprocess
import unittest

from engine.stage2_survival import canonical
from engine.stage3_calibration import ENGINES, admitted, fuel, optimised_cell
from scripts.build_assets import cutaway_inputs


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


class CutawayInputs(unittest.TestCase):
    def test_browser_inputs_match_current_scientific_sources(self):
        source = (ROOT / "docs/cylinder-inputs.js").read_text(encoding="ascii")
        self.assertEqual(
            source, "globalThis.CYLINDER_INPUTS=" + canonical(cutaway_inputs()) + ";\n"
        )


@unittest.skipUnless(NODE, "Node.js is used to exercise the browser physics")
class CutawayPhysics(unittest.TestCase):
    def javascript(self, scenario, data=None):
        run = subprocess.run(
            [NODE, str(ROOT / "tests/cylinder_cutaway.cjs"), scenario],
            input=json.dumps(data),
            capture_output=True,
            text=True,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        return run.stdout

    def test_cam_envelopes_valve_overlap_and_conrod_length(self):
        self.javascript("geometry")

    def test_ignition_knock_optics_and_open_cylinder_energy_balance(self):
        self.javascript("combustion")

    def test_burned_front_matches_independent_chamber_volume_integral(self):
        self.javascript("front")

    def test_signed_port_tracers_follow_donor_volume_and_valve_closure(self):
        self.javascript("ports")

    def test_three_geometry_and_shader_uniforms_follow_calculated_events(self):
        self.javascript("rig")

    def test_browser_matches_python_for_blends_and_controls(self):
        rows = [
            ("ai95100", "mpi", 60),
            ("ai95100", "gdi", 2000),
            ("diesel100", "diesel", 800),
            ("b100100", "diesel", 2000),
            ("eth100", "gdi", 800),
            ("dmc100", "mpi", 2000),
            ("eth94-ipa5-water1", "mpi", 2000),
        ]
        cases = [dict(parts=admitted(key), arch=arch, mode=mode) for key, arch, mode in rows]
        browser = json.loads(self.javascript("calibration", cases))
        for (key, arch, mode), result in zip(rows, browser, strict=True):
            with self.subTest(fuel=key, engine=arch, mode=mode):
                stock = fuel(key)
                cell = optimised_cell(
                    stock, ENGINES[arch], 800 if mode == 800 else 2000, 0.2 if mode == 800 else 1
                )
                self.assertIsNotNone(cell)
                self.assertAlmostEqual(result["rho"], stock["rho"])
                self.assertAlmostEqual(result["dose"] * 100, stock["doseVolPct"])
                for js, py in [
                    ("advance", "btdc"),
                    ("peak", "peakBar"),
                    ("pulse", "effectiveMs"),
                    ("lw", "lw"),
                    ("onset", "knockAt"),
                    ("sl", "flameSpeedMps"),
                    ("lag", "delayDeg"),
                ]:
                    if cell[py] is None:
                        self.assertIsNone(result[js])
                    else:
                        self.assertAlmostEqual(result[js], cell[py], places=7)
                self.assertAlmostEqual(result["start"], -cell["btdc"] + (cell["delayDeg"] or 0))
