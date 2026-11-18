# Candidate discovery dossier · EtOH 30 / OctOH 25 / Water 45

Generation 5 · model `557c04fef7a3e4d2` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.60 H 7.20 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Synthesis MJ/kg | Synthesis MJ/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 30 | -277.510 | 14.7280 | 0.203549 |
| 1-Octanol | 25 | -426.600 | 36.6400 | 1.192888 |
| Water | 45 | -285.830 | 0.0086 | 0.000070 |

Phase classification: Measured reverse microemulsion. At 298.15 K the ideal bubble pressure is 3.53 kPa against 101.325 kPa ambient. The ideal normal bubble point is 369.4 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -318.526 kJ/mol blend. LHV is 1575.173 kJ/mol, or 28.911 MJ/kg and 24.141 MJ/L. The stoichiometric AFR is 9.830 kg air/kg blend. The atmospheric adiabatic solution is 2202.88 K with residual 1e-07 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 121.57 | 0.45447 | 715869.14 | 9506.47 | 6798.9 | 5.4e-08 |
| Diesel | 50.80 | 0.50220 | 791057.53 | 15210.36 | 5223.7 | 2.48e-08 |

The Otto sedan at 110 km/h covers 609.1 km per 50 L. Upstream synthesis requires 175.70 MJ/100 km. Carbon balance gives 144.0 g CO₂/km. The pathway scenario gives 253.4 g CO₂e/km.

Physical performance index **38.13/100**. Component scores (0–1): energy 0.136, abundance 0.567, lifecycle 0.444, no 0.561, recovery 0.000, infrastructure 0.658.

[Download both P–V traces](pareto-eth30-oct25-water45.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth30-oct25-water45
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and pathway energy require separate validation.

<!-- fuel-lab stage2 begin -->
## Stage 2 survival certificate

Computational outcome **REJECTED** on the −35 to +50 °C grid. Stock material verdict **Incompatible**. Laboratory and OEM validation are outstanding.

| Screen | Result |
|---|---|
| Liquid–liquid split / solid or cloud risk | 36 / 17 of 86 temperatures |
| Four-volume RVP proxy at 37.8 °C | 10.26 kPa |
| −35 °C cold-cranking index | unavailable |
| +50 °C rail / inlet margins | 330.89 / 67.22 kPa |
| Ambient dynamic viscosity at +20 °C | 1.789 mPa·s |
| Estimated wear before / after | 506 / 506 µm |
| Added bio-ester | 0.0% of final liquid volume |
| Wheel energy / invested primary energy at +15 °C | 50.17 / 180.50 MJ per 100 km |
| Wheel EROI / upstream primary energy at +15 °C | 0.278 / 180.50 MJ per 100 km |
| Primary energy at −35 / +50 °C, engine running | 206.12 / 167.29 MJ per 100 km |
| Synthesis electricity at +15 °C | 5.33 kWh per 100 km |

**Failed gates** · Liquid–liquid split, Crystallisation / cloud point, Stock wetted metals or seal system unsuitable / unqualified, Wheel EROI below 1, Upstream primary energy exceeds AI-95.

**Further evidence** · Phase envelope needs bench data, Cranking volatility unavailable in the cold phase state, Pathway / ester supply needs capacity evidence.

Stage 1 `557c04fef7a3e4d2` · Stage 2 SHA-256 `aa92dd4178d595636e47e5934658ce72e9152b4d423a6c9a433f9b91ca0eb07b`.

Reproduce the physical sector with `python cli/local_worker.py --start 328 --count 1`. [Read all 86 temperatures](../data/weather/eth30-oct25-water45.json) · [Find the source revision](../data/stage2-manifest.json).
<!-- fuel-lab stage2 end -->
