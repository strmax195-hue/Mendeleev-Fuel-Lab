# Candidate discovery dossier · EtOH 5 / IPA 90 / Water 5

Generation 1 · model `7550aae150609a34` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.80 H 7.60 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Production USD/kg | USD/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 5 | -277.510 | 0.5454 | 0.001256 |
| Recovered-carbon isopropanol | 90 | -318.100 | 0.5700 | 0.030829 |
| Water | 5 | -285.830 | 0.0010 | 0.000001 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.29 kPa against 101.325 kPa ambient. The ideal normal bubble point is 355.8 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -314.457 kJ/mol blend. LHV is 1706.310 kJ/mol, or 29.784 MJ/kg and 23.346 MJ/L. The stoichiometric AFR is 10.068 kg air/kg blend. The atmospheric adiabatic solution is 2215.76 K with residual 8.61e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.27 | 0.45403 | 774715.85 | 12148.82 | 7051.0 | 8.15e-08 |
| Diesel | 50.87 | 0.50168 | 856026.67 | 19438.11 | 5329.9 | 1.98e-08 |

The Otto sedan at 110 km/h covers 588.4 km per 50 L. Production cost is $3.73/100 km. Carbon balance gives 143.3 g CO₂/km. The pathway scenario gives 53.8 g CO₂e/km.

Eco-Affordability Index **58.34/100**. Component scores (0–1): cost 0.416, abundance 0.559, lifecycle 0.790, no 0.552, recovery 0.000, infrastructure 0.671.

[Download both P–V traces](pareto-eth5-ipa90-water5.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth5-ipa90-water5
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and costs require separate validation.

<!-- fuel-lab stage2 begin -->
## Stage 2 survival certificate

Computational outcome **REJECTED** on the −35 to +50 °C grid. Stock material verdict **Minor Seal Swap (EPDM/PTFE O-rings)**. Laboratory and OEM validation are outstanding.

| Screen | Result |
|---|---|
| Liquid–liquid split / solid or cloud risk | 0 / 0 of 86 temperatures |
| Four-volume RVP proxy at 37.8 °C | 13.48 kPa |
| −35 °C cold-cranking index | 0.028 |
| +50 °C rail / inlet margins | 324.08 / 60.40 kPa |
| Ambient dynamic viscosity at +20 °C | 2.244 mPa·s |
| Estimated wear before / after | 670 / 670 µm |
| Added bio-ester | 0.0% of final liquid volume |
| Wheel energy / invested primary energy at +15 °C | 50.17 / 113.99 MJ per 100 km |
| Wheel EROI / delivered fuel cost at +15 °C | 0.440 / $4.00 per 100 km |
| Delivered cost at −35 / +50 °C, engine running | $4.56 / $3.70 per 100 km |
| Synthesis electricity at +15 °C (included in fuel cost) | 5.09 kWh, $0.61 per 100 km |

**Failed gates** · Insufficient −35 °C cranking volatility, Wear proxy exceeds pump screen, Wheel EROI below 1, Delivered cost exceeds AI-95.

**Further evidence** · Pathway / ester supply needs capacity evidence.

Stage 1 `7550aae150609a34` · Stage 2 SHA-256 `1b255ec6773aabf7fe440e8c9271f9f88d52751eff11c270691e0ab5429427a1`.

Reproduce the physical sector with `python cli/local_worker.py --start 527 --count 1`. [Read all 86 temperatures](../data/weather/eth5-ipa90-water5.json) · [Find the source revision](../data/stage2-manifest.json).
<!-- fuel-lab stage2 end -->
