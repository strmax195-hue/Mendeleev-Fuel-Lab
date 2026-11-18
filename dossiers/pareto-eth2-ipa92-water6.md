# Candidate discovery dossier · EtOH 2 / IPA 92 / Water 6

Generation 4 · model `7550aae150609a34` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.80 H 7.60 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Production USD/kg | USD/mol blend |
|---|---:|---:|---:|---:|
| Bioethanol | 2 | -277.510 | 0.5454 | 0.000502 |
| Recovered-carbon isopropanol | 92 | -318.100 | 0.5700 | 0.031514 |
| Water | 6 | -285.830 | 0.0010 | 0.000001 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.20 kPa against 101.325 kPa ambient. The ideal normal bubble point is 356.0 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -315.352 kJ/mol blend. LHV is 1705.415 kJ/mol, or 29.768 MJ/kg and 23.346 MJ/L. The stoichiometric AFR is 10.068 kg air/kg blend. The atmospheric adiabatic solution is 2215.07 K with residual 5.36e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.17 | 0.45405 | 774349.80 | 12060.10 | 7038.6 | 7.39e-08 |
| Diesel | 50.87 | 0.50173 | 855657.91 | 19296.16 | 5324.1 | 2.03e-08 |

The Otto sedan at 110 km/h covers 588.5 km per 50 L. Production cost is $3.72/100 km. Carbon balance gives 143.3 g CO₂/km. The pathway scenario gives 53.1 g CO₂e/km.

Eco-Affordability Index **58.35/100**. Component scores (0–1): cost 0.416, abundance 0.559, lifecycle 0.792, no 0.552, recovery 0.000, infrastructure 0.667.

[Download both P–V traces](pareto-eth2-ipa92-water6.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify eth2-ipa92-water6
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and costs require separate validation.

<!-- fuel-lab stage2 begin -->
## Stage 2 survival certificate

Computational outcome **REJECTED** on the −35 to +50 °C grid. Stock material verdict **Minor Seal Swap (EPDM/PTFE O-rings)**. Laboratory and OEM validation are outstanding.

| Screen | Result |
|---|---|
| Liquid–liquid split / solid or cloud risk | 0 / 0 of 86 temperatures |
| Four-volume RVP proxy at 37.8 °C | 13.46 kPa |
| −35 °C cold-cranking index | 0.028 |
| +50 °C rail / inlet margins | 324.10 / 60.43 kPa |
| Ambient dynamic viscosity at +20 °C | 2.272 mPa·s |
| Estimated wear before / after | 669 / 669 µm |
| Added bio-ester | 0.0% of final liquid volume |
| Wheel energy / invested primary energy at +15 °C | 50.17 / 114.02 MJ per 100 km |
| Wheel EROI / delivered fuel cost at +15 °C | 0.440 / $3.99 per 100 km |
| Delivered cost at −35 / +50 °C, engine running | $4.56 / $3.70 per 100 km |
| Synthesis electricity at +15 °C (included in fuel cost) | 5.17 kWh, $0.62 per 100 km |

**Failed gates** · Insufficient −35 °C cranking volatility, Wear proxy exceeds pump screen, Wheel EROI below 1, Delivered cost exceeds AI-95.

**Further evidence** · Pathway / ester supply needs capacity evidence.

Stage 1 `7550aae150609a34` · Stage 2 SHA-256 `1b255ec6773aabf7fe440e8c9271f9f88d52751eff11c270691e0ab5429427a1`.

Reproduce the physical sector with `python cli/local_worker.py --start 212 --count 1`. [Read all 86 temperatures](../data/weather/eth2-ipa92-water6.json) · [Find the source revision](../data/stage2-manifest.json).
<!-- fuel-lab stage2 end -->
