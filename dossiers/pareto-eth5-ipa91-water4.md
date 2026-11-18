# Candidate discovery dossier · EtOH 5 / IPA 91 / Water 4

Generation 5 · model `557c04fef7a3e4d2` · record `historical re-evaluation`.

Per mole of blend, the mean elemental inventory is **C 2.83 H 7.66 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Synthesis MJ/kg | Synthesis MJ/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 5 | -277.510 | 14.7280 | 0.033925 |
| Recovered-carbon isopropanol | 91 | -318.100 | 16.7600 | 0.916545 |
| Water | 4 | -285.830 | 0.0086 | 0.000006 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.31 kPa against 101.325 kPa ambient. The ideal normal bubble point is 355.7 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -314.780 kJ/mol blend. LHV is 1725.047 kJ/mol, or 29.891 MJ/kg and 23.413 MJ/L. The stoichiometric AFR is 10.101 kg air/kg blend. The atmospheric adiabatic solution is 2216.83 K with residual 5.82e-10 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.29 | 0.45392 | 783026.62 | 12301.65 | 7075.7 | 7.7e-08 |
| Diesel | 50.87 | 0.50163 | 865331.57 | 19682.64 | 5342.8 | 1.9e-08 |

The Otto sedan at 110 km/h covers 590.0 km per 50 L. Upstream synthesis requires 109.33 MJ/100 km. Carbon balance gives 143.3 g CO₂/km. The pathway scenario gives 53.8 g CO₂e/km.

Physical performance index **50.87/100**. Component scores (0–1): energy 0.203, abundance 0.558, lifecycle 0.790, no 0.551, recovery 0.000, infrastructure 0.672.

[Download both P–V traces](pareto-eth5-ipa91-water4.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth5-ipa91-water4
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and pathway energy require separate validation.
