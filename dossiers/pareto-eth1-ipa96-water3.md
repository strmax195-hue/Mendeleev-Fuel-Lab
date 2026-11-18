# Candidate discovery dossier · EtOH 1 / IPA 96 / Water 3

Generation 6 · model `ab1c8d57d86fc396` · record `historical re-evaluation`.

Per mole of blend, the mean elemental inventory is **C 2.90 H 7.80 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Synthesis MJ/kg | Synthesis MJ/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 1 | -277.510 | 14.7280 | 0.006785 |
| Recovered-carbon isopropanol | 96 | -318.100 | 16.7600 | 0.966905 |
| Water | 3 | -285.830 | 0.0086 | 0.000005 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.25 kPa against 101.325 kPa ambient. The ideal normal bubble point is 355.7 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -316.726 kJ/mol blend. LHV is 1767.574 kJ/mol, or 30.116 MJ/kg and 23.568 MJ/L. The stoichiometric AFR is 10.178 kg air/kg blend. The atmospheric adiabatic solution is 2218.34 K with residual 7.63e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.20 | 0.45369 | 801928.68 | 12538.47 | 7115.5 | 9.04e-08 |
| Diesel | 50.87 | 0.50156 | 886551.03 | 20061.55 | 5364.2 | 1.84e-08 |

The Otto sedan at 110 km/h covers 593.6 km per 50 L. Upstream synthesis requires 109.36 MJ/100 km. Carbon balance gives 143.3 g CO₂/km. The pathway scenario gives 52.9 g CO₂e/km.

Physical performance index **50.86/100**. Component scores (0–1): energy 0.203, abundance 0.555, lifecycle 0.793, no 0.549, recovery 0.000, infrastructure 0.669.

[Download both P–V traces](pareto-eth1-ipa96-water3.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth1-ipa96-water3
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and pathway energy require separate validation.
