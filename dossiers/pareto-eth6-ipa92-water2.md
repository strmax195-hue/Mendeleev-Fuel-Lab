# Candidate discovery dossier · EtOH 6 / IPA 92 / Water 2

Generation 5 · model `557c04fef7a3e4d2` · record `historical re-evaluation`.

Per mole of blend, the mean elemental inventory is **C 2.88 H 7.76 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Synthesis MJ/kg | Synthesis MJ/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 6 | -277.510 | 14.7280 | 0.040710 |
| Recovered-carbon isopropanol | 92 | -318.100 | 16.7600 | 0.926617 |
| Water | 2 | -285.830 | 0.0086 | 0.000003 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.38 kPa against 101.325 kPa ambient. The ideal normal bubble point is 355.4 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -315.019 kJ/mol blend. LHV is 1756.574 kJ/mol, or 30.072 MJ/kg and 23.524 MJ/L. The stoichiometric AFR is 10.157 kg air/kg blend. The atmospheric adiabatic solution is 2218.77 K with residual 3.03e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.36 | 0.45372 | 797000.37 | 12587.09 | 7119.9 | 8.67e-08 |
| Diesel | 50.88 | 0.50152 | 880962.85 | 20139.34 | 5365.5 | 1.81e-08 |

The Otto sedan at 110 km/h covers 592.5 km per 50 L. Upstream synthesis requires 109.32 MJ/100 km. Carbon balance gives 143.2 g CO₂/km. The pathway scenario gives 54.0 g CO₂e/km.

Physical performance index **50.87/100**. Component scores (0–1): energy 0.203, abundance 0.556, lifecycle 0.790, no 0.549, recovery 0.000, infrastructure 0.675.

[Download both P–V traces](pareto-eth6-ipa92-water2.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth6-ipa92-water2
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and pathway energy require separate validation.
