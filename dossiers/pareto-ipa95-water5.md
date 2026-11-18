# Candidate discovery dossier · IPA 95 / Water 5

Generation 5 · model `557c04fef7a3e4d2` · record `historical re-evaluation`.

Per mole of blend, the mean elemental inventory is **C 2.85 H 7.70 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Synthesis MJ/kg | Synthesis MJ/mol blend |
|---|---:|---:|---:|---:|
| Recovered-carbon isopropanol | 95 | -318.100 | 16.7600 | 0.956833 |
| Water | 5 | -285.830 | 0.0086 | 0.000008 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.18 kPa against 101.325 kPa ambient. The ideal normal bubble point is 356.0 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -316.486 kJ/mol blend. LHV is 1736.047 kJ/mol, or 29.936 MJ/kg and 23.459 MJ/L. The stoichiometric AFR is 10.124 kg air/kg blend. The atmospheric adiabatic solution is 2216.40 K with residual 7.86e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.14 | 0.45388 | 787955.32 | 12253.53 | 7071.6 | 7.52e-08 |
| Diesel | 50.87 | 0.50167 | 870919.61 | 19605.65 | 5341.6 | 1.97e-08 |

The Otto sedan at 110 km/h covers 591.1 km per 50 L. Upstream synthesis requires 109.37 MJ/100 km. Carbon balance gives 143.4 g CO₂/km. The pathway scenario gives 52.7 g CO₂e/km.

Physical performance index **50.86/100**. Component scores (0–1): energy 0.203, abundance 0.557, lifecycle 0.794, no 0.551, recovery 0.000, infrastructure 0.665.

[Download both P–V traces](pareto-ipa95-water5.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify ipa95-water5
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and pathway energy require separate validation.
