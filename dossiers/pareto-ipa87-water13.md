# Candidate discovery dossier · IPA 87 / Water 13

Generation 3 · model `7550aae150609a34` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.61 H 7.22 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Production USD/kg | USD/mol blend |
|---|---:|---:|---:|---:|
| Recovered-carbon isopropanol | 87 | -318.100 | 0.5700 | 0.029801 |
| Water | 13 | -285.830 | 0.0010 | 0.000002 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 4.98 kPa against 101.325 kPa ambient. The ideal normal bubble point is 357.0 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -313.905 kJ/mol blend. LHV is 1586.148 kJ/mol, or 29.037 MJ/kg and 22.891 MJ/L. The stoichiometric AFR is 9.843 kg air/kg blend. The atmospheric adiabatic solution is 2207.23 K with residual 4.74e-08 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 122.96 | 0.45486 | 721477.45 | 11048.20 | 6861.2 | 5.72e-08 |
| Diesel | 50.86 | 0.50215 | 796483.98 | 17677.11 | 5231.8 | 2.41e-08 |

The Otto sedan at 110 km/h covers 578.0 km per 50 L. Production cost is $3.72/100 km. Carbon balance gives 143.4 g CO₂/km. The pathway scenario gives 52.7 g CO₂e/km.

Eco-Affordability Index **58.39/100**. Component scores (0–1): cost 0.416, abundance 0.567, lifecycle 0.794, no 0.558, recovery 0.000, infrastructure 0.658.

[Download both P–V traces](pareto-ipa87-water13.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify ipa87-water13
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and costs require separate validation.

<!-- fuel-lab stage2 begin -->
## Stage 2 survival certificate

Computational outcome **REJECTED** on the −35 to +50 °C grid. Stock material verdict **Incompatible**. Laboratory and OEM validation are outstanding.

| Screen | Result |
|---|---|
| Liquid–liquid split / solid or cloud risk | 0 / 0 of 86 temperatures |
| Four-volume RVP proxy at 37.8 °C | 13.88 kPa |
| −35 °C cold-cranking index | 0.026 |
| +50 °C rail / inlet margins | 323.40 / 59.72 kPa |
| Ambient dynamic viscosity at +20 °C | 2.166 mPa·s |
| Estimated wear before / after | 668 / 668 µm |
| Added bio-ester | 0.0% of final liquid volume |
| Wheel energy / invested primary energy at +15 °C | 50.17 / 114.17 MJ per 100 km |
| Wheel EROI / delivered fuel cost at +15 °C | 0.439 / $3.99 per 100 km |
| Delivered cost at −35 / +50 °C, engine running | $4.56 / $3.70 per 100 km |
| Synthesis electricity at +15 °C (included in fuel cost) | 5.22 kWh, $0.63 per 100 km |

**Failed gates** · Insufficient −35 °C cranking volatility, Stock wetted metals or seal system unsuitable / unqualified, Wear proxy exceeds pump screen, Wheel EROI below 1, Delivered cost exceeds AI-95.

**Further evidence** · Pathway / ester supply needs capacity evidence.

Stage 1 `7550aae150609a34` · Stage 2 SHA-256 `1b255ec6773aabf7fe440e8c9271f9f88d52751eff11c270691e0ab5429427a1`.

Reproduce the physical sector with `python cli/local_worker.py --start 986 --count 1`. [Read all 86 temperatures](../data/weather/ipa87-water13.json) · [Find the source revision](../data/stage2-manifest.json).
<!-- fuel-lab stage2 end -->
