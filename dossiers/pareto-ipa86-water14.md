# Candidate discovery dossier · IPA 86 / Water 14

Generation 2 · model `7550aae150609a34` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.58 H 7.16 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Production USD/kg | USD/mol blend |
|---|---:|---:|---:|---:|
| Recovered-carbon isopropanol | 86 | -318.100 | 0.5700 | 0.029459 |
| Water | 14 | -285.830 | 0.0010 | 0.000003 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 4.96 kPa against 101.325 kPa ambient. The ideal normal bubble point is 357.1 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -313.582 kJ/mol blend. LHV is 1567.411 kJ/mol, or 28.917 MJ/kg and 22.814 MJ/L. The stoichiometric AFR is 9.805 kg air/kg blend. The atmospheric adiabatic solution is 2205.96 K with residual 5.42e-08 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 122.94 | 0.45500 | 713168.14 | 10899.35 | 6832.5 | 5.23e-08 |
| Diesel | 50.86 | 0.50222 | 787179.54 | 17438.96 | 5216.8 | 2.51e-08 |

The Otto sedan at 110 km/h covers 576.2 km per 50 L. Production cost is $3.72/100 km. Carbon balance gives 143.4 g CO₂/km. The pathway scenario gives 52.7 g CO₂e/km.

Eco-Affordability Index **58.40/100**. Component scores (0–1): cost 0.416, abundance 0.568, lifecycle 0.794, no 0.559, recovery 0.000, infrastructure 0.657.

[Download both P–V traces](pareto-ipa86-water14.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify ipa86-water14
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and costs require separate validation.
