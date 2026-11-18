# Candidate discovery dossier · EtOH 5 / IPA 90 / Water 5

Generation 5 · model `557c04fef7a3e4d2` · record `historical re-evaluation`.

Per mole of blend, the mean elemental inventory is **C 2.80 H 7.60 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Synthesis MJ/kg | Synthesis MJ/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 5 | -277.510 | 14.7280 | 0.033925 |
| Recovered-carbon isopropanol | 90 | -318.100 | 16.7600 | 0.906473 |
| Water | 5 | -285.830 | 0.0086 | 0.000008 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.29 kPa against 101.325 kPa ambient. The ideal normal bubble point is 355.8 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -314.457 kJ/mol blend. LHV is 1706.310 kJ/mol, or 29.784 MJ/kg and 23.346 MJ/L. The stoichiometric AFR is 10.068 kg air/kg blend. The atmospheric adiabatic solution is 2215.76 K with residual 8.61e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.27 | 0.45403 | 774715.85 | 12148.82 | 7051.0 | 8.15e-08 |
| Diesel | 50.87 | 0.50168 | 856026.67 | 19438.11 | 5329.9 | 1.98e-08 |

The Otto sedan at 110 km/h covers 588.4 km per 50 L. Upstream synthesis requires 109.33 MJ/100 km. Carbon balance gives 143.3 g CO₂/km. The pathway scenario gives 53.8 g CO₂e/km.

Physical performance index **50.87/100**. Component scores (0–1): energy 0.203, abundance 0.559, lifecycle 0.790, no 0.552, recovery 0.000, infrastructure 0.671.

[Download both P–V traces](pareto-eth5-ipa90-water5.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth5-ipa90-water5
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and pathway energy require separate validation.
