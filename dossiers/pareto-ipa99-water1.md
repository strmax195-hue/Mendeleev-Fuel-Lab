# Candidate discovery dossier · IPA 99 / Water 1

Generation 7 · model `ab1c8d57d86fc396` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.97 H 7.94 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Synthesis MJ/kg | Synthesis MJ/mol blend |
|---|---:|---:|---:|---:|
| Recovered-carbon isopropanol | 99 | -318.100 | 16.7600 | 0.997121 |
| Water | 1 | -285.830 | 0.0086 | 0.000002 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.28 kPa against 101.325 kPa ambient. The ideal normal bubble point is 355.5 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -317.777 kJ/mol blend. LHV is 1810.997 kJ/mol, or 30.348 MJ/kg and 23.717 MJ/L. The stoichiometric AFR is 10.252 kg air/kg blend. The atmospheric adiabatic solution is 2220.43 K with residual 9.78e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.22 | 0.45345 | 821197.18 | 12865.65 | 7165.5 | 9.22e-08 |
| Diesel | 50.87 | 0.50146 | 908139.65 | 20585.04 | 5390.3 | 1.71e-08 |

The Otto sedan at 110 km/h covers 597.0 km per 50 L. Upstream synthesis requires 109.36 MJ/100 km. Carbon balance gives 143.4 g CO₂/km. The pathway scenario gives 52.7 g CO₂e/km.

Physical performance index **50.85/100**. Component scores (0–1): energy 0.203, abundance 0.553, lifecycle 0.794, no 0.548, recovery 0.000, infrastructure 0.669.

[Download both P–V traces](pareto-ipa99-water1.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify ipa99-water1
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and pathway energy require separate validation.

<!-- fuel-lab stage2 begin -->
## Stage 2 survival certificate

Computational outcome **REJECTED** on the −35 to +50 °C grid. Stock material verdict **Minor Seal Swap (EPDM/PTFE O-rings)**. Full-envelope installation **Minor Seal Swap (EPDM/PTFE O-rings)** (EPDM). Laboratory and OEM validation are outstanding.

| Screen | Result |
|---|---|
| Liquid–liquid split / solid or cloud risk | 0 / 0 of 86 temperatures |
| Four-volume RVP proxy at 37.8 °C | 12.76 kPa |
| −35 °C ambient SI lean-limit index | 0.029 |
| −35 °C first firing · Enriched GDI | feasible at 1.00× warm dose, vapour φ 0.650 |
| +50 °C rail / inlet margins | 325.28 / 61.60 kPa |
| Ambient dynamic viscosity at +20 °C | 2.409 mPa·s |
| Estimated wear before / after | 670 / 670 µm |
| Added bio-ester | 0.0% of final liquid volume |
| Wheel energy / invested primary energy at +15 °C | 50.17 / 113.95 MJ per 100 km |
| Wheel EROI / upstream primary energy at +15 °C | 0.440 / 113.95 MJ per 100 km |
| Primary energy at −35 / +50 °C, engine running | 130.12 / 105.60 MJ per 100 km |
| Synthesis electricity at +15 °C | 5.22 kWh per 100 km |

**Failed gates** · Wear proxy exceeds pump screen, Wheel EROI below 1, Upstream primary energy exceeds AI-95.

**Further evidence** · Pathway / ester supply needs capacity evidence.

Stage 1 `ab1c8d57d86fc396` · Stage 2 SHA-256 `f7fe3597dc5289a0c27bbce1c8a21f8b9c8786d888329b2f0235ca628d501abb`.

Reproduce the physical sector with `python cli/local_worker.py --start 998 --count 1`. [Read all 86 temperatures](../data/weather/ipa99-water1.json) · [Find the source revision](../data/stage2-manifest.json).
<!-- fuel-lab stage2 end -->
