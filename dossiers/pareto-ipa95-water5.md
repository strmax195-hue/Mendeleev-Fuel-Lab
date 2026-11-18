# Candidate discovery dossier · IPA 95 / Water 5

Generation 5 · model `7550aae150609a34` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.85 H 7.70 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Production USD/kg | USD/mol blend |
|---|---:|---:|---:|---:|
| Recovered-carbon isopropanol | 95 | -318.100 | 0.5700 | 0.032541 |
| Water | 5 | -285.830 | 0.0010 | 0.000001 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.18 kPa against 101.325 kPa ambient. The ideal normal bubble point is 356.0 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -316.486 kJ/mol blend. LHV is 1736.047 kJ/mol, or 29.936 MJ/kg and 23.459 MJ/L. The stoichiometric AFR is 10.124 kg air/kg blend. The atmospheric adiabatic solution is 2216.40 K with residual 7.86e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.14 | 0.45388 | 787955.32 | 12253.53 | 7071.6 | 7.52e-08 |
| Diesel | 50.87 | 0.50167 | 870919.61 | 19605.65 | 5341.6 | 1.97e-08 |

The Otto sedan at 110 km/h covers 591.1 km per 50 L. Production cost is $3.72/100 km. Carbon balance gives 143.4 g CO₂/km. The pathway scenario gives 52.7 g CO₂e/km.

Eco-Affordability Index **58.35/100**. Component scores (0–1): cost 0.417, abundance 0.557, lifecycle 0.794, no 0.551, recovery 0.000, infrastructure 0.665.

[Download both P–V traces](pareto-ipa95-water5.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify ipa95-water5
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and costs require separate validation.

<!-- fuel-lab stage2 begin -->
## Stage 2 survival certificate

Computational outcome **REJECTED** on the −35 to +50 °C grid. Stock material verdict **Minor Seal Swap (EPDM/PTFE O-rings)**. Laboratory and OEM validation are outstanding.

| Screen | Result |
|---|---|
| Liquid–liquid split / solid or cloud risk | 0 / 0 of 86 temperatures |
| Four-volume RVP proxy at 37.8 °C | 13.28 kPa |
| −35 °C cold-cranking index | 0.028 |
| +50 °C rail / inlet margins | 324.41 / 60.73 kPa |
| Ambient dynamic viscosity at +20 °C | 2.325 mPa·s |
| Estimated wear before / after | 669 / 669 µm |
| Added bio-ester | 0.0% of final liquid volume |
| Wheel energy / invested primary energy at +15 °C | 50.17 / 114.01 MJ per 100 km |
| Wheel EROI / delivered fuel cost at +15 °C | 0.440 / $3.98 per 100 km |
| Delivered cost at −35 / +50 °C, engine running | $4.55 / $3.69 per 100 km |
| Synthesis electricity at +15 °C (included in fuel cost) | 5.22 kWh, $0.63 per 100 km |

**Failed gates** · Insufficient −35 °C cranking volatility, Wear proxy exceeds pump screen, Wheel EROI below 1, Delivered cost exceeds AI-95.

**Further evidence** · Pathway / ester supply needs capacity evidence.

Stage 1 `7550aae150609a34` · Stage 2 SHA-256 `1b255ec6773aabf7fe440e8c9271f9f88d52751eff11c270691e0ab5429427a1`.

Reproduce the physical sector with `python cli/local_worker.py --start 994 --count 1`. [Read all 86 temperatures](../data/weather/ipa95-water5.json) · [Find the source revision](../data/stage2-manifest.json).
<!-- fuel-lab stage2 end -->
