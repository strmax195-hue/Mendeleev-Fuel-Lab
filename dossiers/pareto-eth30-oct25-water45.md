# Candidate discovery dossier · EtOH 30 / OctOH 25 / Water 45

Generation 1 · model `7550aae150609a34` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.60 H 7.20 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Production USD/kg | USD/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 30 | -277.510 | 0.5454 | 0.007537 |
| 1-Octanol | 25 | -426.600 | 7.0000 | 0.227899 |
| Water | 45 | -285.830 | 0.0010 | 0.000008 |

Phase classification: Measured reverse microemulsion. At 298.15 K the ideal bubble pressure is 3.53 kPa against 101.325 kPa ambient. The ideal normal bubble point is 369.4 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -318.526 kJ/mol blend. LHV is 1575.173 kJ/mol, or 28.911 MJ/kg and 24.141 MJ/L. The stoichiometric AFR is 9.830 kg air/kg blend. The atmospheric adiabatic solution is 2202.88 K with residual 1e-07 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 121.57 | 0.45447 | 715869.14 | 9506.47 | 6798.9 | 5.4e-08 |
| Diesel | 50.80 | 0.50220 | 791057.53 | 15210.36 | 5223.7 | 2.48e-08 |

The Otto sedan at 110 km/h covers 609.1 km per 50 L. Production cost is $29.62/100 km. Carbon balance gives 144.0 g CO₂/km. The pathway scenario gives 253.4 g CO₂e/km.

Eco-Affordability Index **36.23/100**. Component scores (0–1): cost 0.082, abundance 0.567, lifecycle 0.444, no 0.561, recovery 0.000, infrastructure 0.658.

[Download both P–V traces](pareto-eth30-oct25-water45.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth30-oct25-water45
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and costs require separate validation.
