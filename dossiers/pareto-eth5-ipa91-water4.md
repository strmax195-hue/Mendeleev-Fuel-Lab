# Candidate discovery dossier · EtOH 5 / IPA 91 / Water 4

Generation 2 · model `7550aae150609a34` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.83 H 7.66 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Production USD/kg | USD/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 5 | -277.510 | 0.5454 | 0.001256 |
| Recovered-carbon isopropanol | 91 | -318.100 | 0.5700 | 0.031171 |
| Water | 4 | -285.830 | 0.0010 | 0.000001 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.31 kPa against 101.325 kPa ambient. The ideal normal bubble point is 355.7 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -314.780 kJ/mol blend. LHV is 1725.047 kJ/mol, or 29.891 MJ/kg and 23.413 MJ/L. The stoichiometric AFR is 10.101 kg air/kg blend. The atmospheric adiabatic solution is 2216.83 K with residual 5.82e-10 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.29 | 0.45392 | 783026.62 | 12301.65 | 7075.7 | 7.7e-08 |
| Diesel | 50.87 | 0.50163 | 865331.57 | 19682.64 | 5342.8 | 1.9e-08 |

The Otto sedan at 110 km/h covers 590.0 km per 50 L. Production cost is $3.73/100 km. Carbon balance gives 143.3 g CO₂/km. The pathway scenario gives 53.8 g CO₂e/km.

Eco-Affordability Index **58.33/100**. Component scores (0–1): cost 0.416, abundance 0.558, lifecycle 0.790, no 0.551, recovery 0.000, infrastructure 0.672.

[Download both P–V traces](pareto-eth5-ipa91-water4.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth5-ipa91-water4
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and costs require separate validation.
