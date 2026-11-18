# Candidate discovery dossier · EtOH 1 / IPA 96 / Water 3

Generation 5 · model `557c04fef7a3e4d2` · record `pareto`.

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

<!-- fuel-lab stage2 begin -->
## Stage 2 survival certificate

Computational outcome **REJECTED** on the −35 to +50 °C grid. Stock material verdict **Minor Seal Swap (EPDM/PTFE O-rings)**. Laboratory and OEM validation are outstanding.

| Screen | Result |
|---|---|
| Liquid–liquid split / solid or cloud risk | 0 / 0 of 86 temperatures |
| Four-volume RVP proxy at 37.8 °C | 13.08 kPa |
| −35 °C cold-cranking index | 0.028 |
| +50 °C rail / inlet margins | 324.73 / 61.06 kPa |
| Ambient dynamic viscosity at +20 °C | 2.350 mPa·s |
| Estimated wear before / after | 670 / 670 µm |
| Added bio-ester | 0.0% of final liquid volume |
| Wheel energy / invested primary energy at +15 °C | 50.17 / 113.97 MJ per 100 km |
| Wheel EROI / upstream primary energy at +15 °C | 0.440 / 113.97 MJ per 100 km |
| Primary energy at −35 / +50 °C, engine running | 130.15 / 105.63 MJ per 100 km |
| Synthesis electricity at +15 °C | 5.20 kWh per 100 km |

**Failed gates** · Insufficient −35 °C cranking volatility, Wear proxy exceeds pump screen, Wheel EROI below 1, Upstream primary energy exceeds AI-95.

**Further evidence** · Pathway / ester supply needs capacity evidence.

Stage 1 `557c04fef7a3e4d2` · Stage 2 SHA-256 `aa92dd4178d595636e47e5934658ce72e9152b4d423a6c9a433f9b91ca0eb07b`.

Reproduce the physical sector with `python cli/local_worker.py --start 104 --count 1`. [Read all 86 temperatures](../data/weather/eth1-ipa96-water3.json) · [Find the source revision](../data/stage2-manifest.json).
<!-- fuel-lab stage2 end -->
