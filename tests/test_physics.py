import math
import unittest
from engine.elements_db import CEA, MICROEMULSION, NASA7
from engine.fuel_simulator import simulate, validate
from engine.nasa_thermo import R, properties


class Thermodynamics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = simulate(
            [
                {"eth": 100},
                {"ai95": 100},
                {"diesel": 100},
                {"eth": 70, "ipa": 20, "water": 10},
                MICROEMULSION,
            ],
            reference=True,
            trace=True,
        )

    def test_nasa_derivatives_and_reference_state(self):
        for s in NASA7:
            self.assertAlmostEqual(properties(s, 298.15)[1], CEA[s]["hf_j_mol"], places=7)
            for t in (298.15, 950, 1400, 3200):
                cp, h, entropy = properties(s, t)
                a, b = properties(s, t - 0.01), properties(s, t + 0.01)
                self.assertAlmostEqual((b[1] - a[1]) / 0.02, cp, places=5)
                self.assertAlmostEqual((b[2] - a[2]) / 0.02, cp / t, places=7)
                self.assertGreater(cp, R)
        with self.assertRaises(ValueError):
            properties("CO2", 6100)

    def test_liquid_reference_energy_and_stoichiometry(self):
        eth = self.rows[0]
        self.assertAlmostEqual(eth["lhvJ"], 1234990, delta=80)
        self.assertAlmostEqual(eth["afr"], 8.94, delta=0.04)
        self.assertAlmostEqual(eth["mjL"], 21.1, delta=0.15)
        for row in self.rows:
            self.assertAlmostEqual(sum(row["exhaust"].values()), row["afr"] + 1, places=9)
            self.assertEqual(row["exhaust"]["solidOxides"], 0)
            self.assertGreater(row["flameK"], 2050)
            self.assertLess(row["flameK"], 2420)
            self.assertGreater(row["vaporKpa"], 0)
            self.assertLess(row["vaporKpa"], 101.325)
            self.assertGreater(row["bubbleK"], 298.15)

    def test_flame_dissociation_and_whole_cycle_first_law(self):
        for row in self.rows:
            carbon, h, o = (row["atoms"][k] for k in ("C", "H", "O"))
            air = carbon + h / 4 - o / 2
            # A complete, frozen product composition at the equilibrium flame T retains
            # less energy than reactants. The difference is energy in dissociated species.
            frozen = sum(
                n * properties(s, row["flameK"])[1]
                for s, n in [("CO2", carbon), ("H2O", h / 2), ("N2", 3.76 * air)]
            )
            self.assertGreater(row["hfJ"] - frozen, 1000)
            for cy in row["cycles"].values():
                intake, exit_temp = cy["chargeK"], cy["pv"][-2][3]
                air_in = {"N2": 3.76 * air * cy["lambda"], "O2": air * cy["lambda"]}
                u1 = sum(n * (properties(s, intake)[1] - R * intake) for s, n in air_in.items())
                u4 = sum(
                    n * (properties(s, exit_temp)[1] - R * exit_temp) for s, n in cy["hot"].items()
                )
                self.assertAlmostEqual(
                    cy["workJ"] / (u1 + row["hfJ"] + cy["evapJ"] - u4), 1, delta=0.001
                )
                q_air = sum(
                    n * (properties(s, 298.15)[1] - properties(s, intake)[1])
                    for s, n in air_in.items()
                )
                self.assertAlmostEqual(q_air, cy["evapJ"], delta=0.001)
                self.assertGreater(cy["evapJ"], 0)
                self.assertGreater(cy["hot"]["NO"], 0)
                self.assertGreater(cy["hot"]["CO"], 0)
                self.assertAlmostEqual(cy["peakBar"], max(p[2] for p in cy["pv"]), places=6)
                self.assertEqual(cy["pv"][0][1], cy["pv"][-1][1])
                self.assertAlmostEqual(cy["pv"][0][2], cy["pv"][-1][2], places=8)

    def test_exhaust_blowdown_and_open_system_first_law(self):
        for row in self.rows:
            for cycle in row["cycles"].values():
                e = cycle["exhaust"]
                path = e["path"]
                self.assertEqual([q[0] for q in path], list(range(180, 361)))
                self.assertEqual(path[0][3], cycle["pv"][-2][3])
                self.assertAlmostEqual(path[0][2], cycle["pv"][-2][2], places=10)
                self.assertGreater(path[0][2], 2 * path[90][2])
                self.assertTrue(path[0][3] > path[90][3] > path[-1][3] > e["wallK"])
                self.assertGreater(e["wallJ"], 0)
                for _, cc, bar, kelvin, mol in path:
                    self.assertAlmostEqual(bar * 1e5 * cc * 1e-6, mol * R * kelvin, places=8)
                self.assertAlmostEqual(
                    path[0][4] - e["expelledMol"] + e["returnedMol"], path[-1][4]
                )
                n_total = sum(cycle["hot"].values())

                def energy(q):
                    return q[4] * (
                        sum(n / n_total * properties(k, q[3])[1] for k, n in cycle["hot"].items())
                        - R * q[3]
                    )

                self.assertAlmostEqual(
                    energy(path[0]) - energy(path[-1]),
                    e["workJ"] + e["wallJ"] + e["outflowEnthalpyJ"],
                    delta=0.001,
                )
                self.assertLess(abs(e["energyResidualJ"]), 0.001)
        plain, traced = simulate([self.rows[0]["parts"]])[0], self.rows[0]
        for kind in ("Otto", "Diesel"):
            self.assertEqual(plain["cycles"][kind]["workJ"], traced["cycles"][kind]["workJ"])
            self.assertEqual(plain["cycles"][kind]["eta"], traced["cycles"][kind]["eta"])
            self.assertNotIn("exhaust", plain["cycles"][kind])

    def test_independent_mass_action_quotients(self):
        for r in self.rows:
            for c in r["cycles"].values():
                t = c["peakK"]
                n = c["hot"]
                p = {s: v / sum(n.values()) * c["peakBar"] / 1.01325 for s, v in n.items()}
                for nu in (
                    {"CO2": -1, "CO": 1, "O2": 0.5},
                    {"H2O": -1, "H2": 1, "O2": 0.5},
                    {"N2": -1, "O2": -1, "NO": 2},
                ):
                    dg = 0
                    for s, v in nu.items():
                        _, h, entropy = properties(s, t)
                        dg += v * (h - t * entropy)
                    self.assertAlmostEqual(
                        sum(v * math.log(p[s]) for s, v in nu.items()), -dg / (R * t), places=8
                    )

    def test_grid_refinement_and_road_load(self):
        other = simulate([{"eth": 100}], step=1)[0]
        for k in ("Otto", "Diesel"):
            self.assertLess(
                abs(self.rows[0]["cycles"][k]["eta"] - other["cycles"][k]["eta"]), 0.0003
            )
        for row in self.rows:
            self.assertAlmostEqual(row["dragN"], 0.5 * 1.225 * 0.62 * (110 / 3.6) ** 2)
            self.assertAlmostEqual(row["rollN"], 1500 * 9.80665 * 0.010)
            self.assertAlmostEqual(row["range"] * row["mjKm"], 50 * row["mjL"])
            self.assertAlmostEqual(row["synthesisMj100"], 100 * row["kgKm"] * row["synthesisMjKg"])
            self.assertAlmostEqual(row["climate"], row["ci"] * row["mjKm"])

    def test_policy_and_phase_bounds(self):
        for p in [
            {"water": 100},
            {"water": 21, "eth": 79},
            {"dmc": 50, "water": 50},
            {"eth": -1, "ipa": 101},
            {"eth": 99.5, "ipa": 0.5},
            {"eth": True, "ipa": 99},
            {"b100": 70, "water": 30},
            {"oct": 24, "water": 45, "eth": 31},
            {"unknown": 100},
            {"ai95": 100},
            {},
        ]:
            with self.subTest(p=p), self.assertRaises(ValueError):
                validate(p)
        validate({"eth": 80, "water": 20})
        self.assertEqual(self.rows[-1]["phase"], "Measured reverse microemulsion")
        self.assertEqual(self.rows[3]["phase"], "Liquid")
        self.assertAlmostEqual(self.rows[0]["bubbleK"], 351.5, places=5)
        self.assertTrue(6 < self.rows[0]["vaporKpa"] < 9)
