# Candidate discovery dossier · EtOH 14 / IPA 86

Generation 3 · model `7550aae150609a34` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.86 H 7.72 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Production USD/kg | USD/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 14 | -277.510 | 0.5454 | 0.003517 |
| Recovered-carbon isopropanol | 86 | -318.100 | 0.5700 | 0.029459 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.61 kPa against 101.325 kPa ambient. The ideal normal bubble point is 354.8 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -312.417 kJ/mol blend. LHV is 1746.470 kJ/mol, or 30.044 MJ/kg and 23.477 MJ/L. The stoichiometric AFR is 10.135 kg air/kg blend. The atmospheric adiabatic solution is 2219.88 K with residual 8.09e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.61 | 0.45373 | 792432.20 | 12718.14 | 7136.7 | 7.84e-08 |
| Diesel | 50.88 | 0.50143 | 875740.08 | 20349.02 | 5372.7 | 1.83e-08 |

The Otto sedan at 110 km/h covers 591.4 km per 50 L. Production cost is $3.75/100 km. Carbon balance gives 143.1 g CO₂/km. The pathway scenario gives 55.8 g CO₂e/km.

Eco-Affordability Index **58.30/100**. Component scores (0–1): cost 0.415, abundance 0.557, lifecycle 0.784, no 0.549, recovery 0.000, infrastructure 0.687.

[Download both P–V traces](pareto-eth14-ipa86.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth14-ipa86
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and costs require separate validation.

<!-- fuel-lab stage2 begin -->
## Stage 2 survival certificate

Computational outcome **REJECTED** on the −35 to +50 °C grid. Stock material verdict **Minor Seal Swap (EPDM/PTFE O-rings)**. Laboratory and OEM validation are outstanding.

| Screen | Result |
|---|---|
| Liquid–liquid split / solid or cloud risk | 0 / 0 of 86 temperatures |
| Four-volume RVP proxy at 37.8 °C | 13.23 kPa |
| −35 °C cold-cranking index | 0.030 |
| +50 °C rail / inlet margins | 324.53 / 60.86 kPa |
| Ambient dynamic viscosity at +20 °C | 2.206 mPa·s |
| Estimated wear before / after | 673 / 473 µm |
| Added bio-ester | 1.0% of final liquid volume |
| Wheel energy / invested primary energy | 50.17 / 112.93 MJ per 100 km |
| Wheel EROI / delivered fuel cost | 0.444 / $4.02 per 100 km |
| Synthesis electricity (included in fuel cost) | 4.83 kWh, $0.58 per 100 km |

**Failed gates** · Insufficient −35 °C cranking volatility, Wheel EROI below 1, Delivered cost exceeds AI-95.

**Further evidence** · Phase envelope needs bench data, Ester wear response in alcohol needs measurement, Pathway / ester supply needs capacity evidence.

Stage 1 `7550aae150609a34` · Stage 2 SHA-256 `9e9f06ab4bcbfeed9671bccc0e09ac08426ea1a9e10cb94996f74c4b728d0cc0`.

Reproduce the physical sector with `python cli/local_worker.py --start 153 --count 1`. [Read all 86 temperatures](../data/weather/eth14-ipa86.json) · [Find the source revision](../data/stage2-manifest.json).
<!-- fuel-lab stage2 end -->
