# Candidate discovery dossier · IPA 98 / Water 2

Generation 6 · model `ab1c8d57d86fc396` · record `pareto`.

Per mole of blend, the mean elemental inventory is **C 2.94 H 7.88 O 1.00**. All fractions below are molar.

| Component | mol% | Source ΔfH, liquid, kJ/mol | Synthesis MJ/kg | Synthesis MJ/mol blend |
|---|---:|---:|---:|---:|
| Recovered-carbon isopropanol | 98 | -318.100 | 16.7600 | 0.987049 |
| Water | 2 | -285.830 | 0.0086 | 0.000003 |

Phase classification: Liquid. At 298.15 K the ideal bubble pressure is 5.25 kPa against 101.325 kPa ambient. The ideal normal bubble point is 355.6 K. Activity coefficients, phase separation and cold flow require measurement.

Crustal abundance in ppm by mass: C 200, H 1,400, O 464,000.

Liquid reactant formation enthalpy is -317.455 kJ/mol blend. LHV is 1792.259 kJ/mol, or 30.247 MJ/kg and 23.654 MJ/L. The stoichiometric AFR is 10.221 kg air/kg blend. The atmospheric adiabatic solution is 2219.45 K with residual 4.31e-09 J/mol.

| Cycle | Peak bar | Indicated η | Net indicated J/mol | Evaporation J/mol | Hot NO ppm | Energy residual J/mol |
|---|---:|---:|---:|---:|---:|---:|
| Otto | 123.20 | 0.45355 | 812886.50 | 12712.04 | 7142.7 | 9.76e-08 |
| Diesel | 50.87 | 0.50151 | 898834.49 | 20339.27 | 5378.5 | 1.78e-08 |

The Otto sedan at 110 km/h covers 595.6 km per 50 L. Upstream synthesis requires 109.37 MJ/100 km. Carbon balance gives 143.4 g CO₂/km. The pathway scenario gives 52.7 g CO₂e/km.

Physical performance index **50.85/100**. Component scores (0–1): energy 0.203, abundance 0.554, lifecycle 0.794, no 0.548, recovery 0.000, infrastructure 0.668.

[Download both P–V traces](pareto-ipa98-water2.csv). Volume is scaled to 500 cm³ swept per cylinder. Temperatures at intermediate ideal Diesel isobar points are unreported.

## Reproduction

Run from the main-branch source matching the model fingerprint. Source revision and input citations are in the [run manifest](../data/manifest.json).

```sh
python3 -m engine.discovery_solver --verify ipa98-water2
```

A simulation record warrants independent verification. Fuel compatibility, in-cylinder kinetics, engine-out and aftertreatment emissions, phase behaviour and pathway energy require separate validation.

<!-- fuel-lab stage2 begin -->
## Stage 2 survival certificate

Computational outcome **REJECTED** on the −35 to +50 °C grid. Stock material verdict **Minor Seal Swap (EPDM/PTFE O-rings)**. Full-envelope installation **Minor Seal Swap (EPDM/PTFE O-rings)** (EPDM). Laboratory and OEM validation are outstanding.

| Screen | Result |
|---|---|
| Liquid–liquid split / solid or cloud risk | 0 / 0 of 86 temperatures |
| Four-volume RVP proxy at 37.8 °C | 12.91 kPa |
| −35 °C ambient SI lean-limit index | 0.028 |
| −35 °C first firing · Enriched GDI | feasible at 1.00× warm dose, vapour φ 0.650 |
| +50 °C rail / inlet margins | 325.03 / 61.36 kPa |
| Ambient dynamic viscosity at +20 °C | 2.387 mPa·s |
| Estimated wear before / after | 670 / 670 µm |
| Added bio-ester | 0.0% of final liquid volume |
| Wheel energy / invested primary energy at +15 °C | 50.17 / 113.96 MJ per 100 km |
| Wheel EROI / upstream primary energy at +15 °C | 0.440 / 113.96 MJ per 100 km |
| Primary energy at −35 / +50 °C, engine running | 130.13 / 105.62 MJ per 100 km |
| Synthesis electricity at +15 °C | 5.22 kWh per 100 km |

**Failed gates** · Wear proxy exceeds pump screen, Wheel EROI below 1, Upstream primary energy exceeds AI-95.

**Further evidence** · Pathway / ester supply needs capacity evidence.

Stage 1 `ab1c8d57d86fc396` · Stage 2 SHA-256 `f7fe3597dc5289a0c27bbce1c8a21f8b9c8786d888329b2f0235ca628d501abb`.

Reproduce the physical sector with `python cli/local_worker.py --start 997 --count 1`. [Read all 86 temperatures](../data/weather/ipa98-water2.json) · [Find the source revision](../data/stage2-manifest.json).
<!-- fuel-lab stage2 end -->
