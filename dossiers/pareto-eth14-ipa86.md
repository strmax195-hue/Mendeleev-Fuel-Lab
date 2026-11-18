# Candidate discovery dossier · EtOH 14 / IPA 86

Generation 5 · model `557c04fef7a3e4d2` · record `historical re-evaluation`.

Per mole of blend, the mean elemental inventory is **C 2.86 H 7.72 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Synthesis MJ/kg | Synthesis MJ/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 14 | -277.510 | 14.7280 | 0.094989 |
| Recovered-carbon isopropanol | 86 | -318.100 | 16.7600 | 0.866186 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.61 kPa against 101.325 kPa ambient. The ideal normal bubble point is 354.8 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -312.417 kJ/mol blend. LHV is 1746.470 kJ/mol, or 30.044 MJ/kg and 23.477 MJ/L. The stoichiometric AFR is 10.135 kg air/kg blend. The atmospheric adiabatic solution is 2219.88 K with residual 8.09e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.61 | 0.45373 | 792432.20 | 12718.14 | 7136.7 | 7.84e-08 |
| Diesel | 50.88 | 0.50143 | 875740.08 | 20349.02 | 5372.7 | 1.83e-08 |

The Otto sedan at 110 km/h covers 591.4 km per 50 L. Upstream synthesis requires 109.25 MJ/100 km. Carbon balance gives 143.1 g CO₂/km. The pathway scenario gives 55.8 g CO₂e/km.

Physical performance index **50.88/100**. Component scores (0–1): energy 0.203, abundance 0.557, lifecycle 0.784, no 0.549, recovery 0.000, infrastructure 0.687.

[Download both P–V traces](pareto-eth14-ipa86.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth14-ipa86
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and pathway energy require separate validation.
