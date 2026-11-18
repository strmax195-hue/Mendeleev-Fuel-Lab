# Inputs, equations and evidence

## Thermodynamic inputs

The unit of analysis is **one mole of liquid mixture at 298.15 K**. Species names, atom counts and SI formation enthalpies in `engine/data/cea.json` come from selected records in NASA CEA revision `2f79a647e85737742fb08a127da00d1ea1d069da`. Seven-coefficient gas fits in `engine/data/nasa7.json` come from NASA TM-4513 as distributed in Cantera 3.1.0, revision `6e0027548cf295bd478b8acfe34816f2db6dd58b`. These are two distinct sources and polynomial formats. The runtime uses seven-coefficient fits only. [CEA input](https://github.com/nasa/cea/blob/2f79a647e85737742fb08a127da00d1ea1d069da/data/thermo.inp) · [NASA TM-4513](https://ntrs.nasa.gov/citations/19940013151) · [Pinned NASA-7 inputs](https://github.com/Cantera/cantera/blob/6e0027548cf295bd478b8acfe34816f2db6dd58b/data/nasa_gas.yaml)

| Liquid input | Thermochemistry and phase treatment |
|---|---|
| Ethanol and water | Liquid and gas CEA records at 298.15 K supply formation and vaporisation enthalpies. Rounded liquid densities are 0.785 and 0.997 kg/L. Normal boiling points are 351.5 and 373.15 K. [Ethanol](https://webbook.nist.gov/cgi/cbook.cgi?ID=C64175&Mask=4) · [Water](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=4) |
| Isopropanol | CEA gas record `C3H8O,2propanol` minus 45.4 kJ/mol vaporisation gives the liquid formation enthalpy. Density 0.781 kg/L and boiling point 355.4 K. [Phase data](https://webbook.nist.gov/cgi/cbook.cgi?ID=C67630&Mask=4) |
| Dimethyl carbonate | The liquid formation enthalpy is −609.6 kJ/mol, with 38.02 kJ/mol vaporisation. DMC uses independent calorimetry in place of a missing CEA liquid record. [Thermochemistry](https://doi.org/10.1021/acs.jpca.7b00544) · [NIST phase data](https://webbook.nist.gov/cgi/cbook.cgi?ID=C616386&Mask=4) |
| 1-Octanol | Liquid formation enthalpy −426.6 kJ/mol and rounded standard vaporisation enthalpy 71.1 kJ/mol. Density 0.824 kg/L and normal boiling point 468.3 K. [Calorimetry and phase data](https://webbook.nist.gov/cgi/cbook.cgi?ID=C111875&Mask=6) |
| Waste-oil biodiesel | The CEA `Biodiesel` record is a bulk C₂₀H₄₀O₂ surrogate. Density is 0.88 kg/L. Effective volatility inputs use 620 K and 95 kJ/mol as heavy-ester assumptions. The 288.15 K cold-flow screen is a conservative model setting. Actual ester distributions and cloud points depend on feedstock. [DOE biodiesel handling guide](https://afdc.energy.gov/files/u/publication/biodiesel_handling_use_guide.pdf) · [Heavy-ester phase data](https://webbook.nist.gov/cgi/cbook.cgi?ID=C112629&Mask=4) |
| AI-95 and diesel controls | Liquid isooctane and CEA `Jet-A(L)` approximate gasoline and middle-distillate chemistry. Gas–liquid enthalpy differences come from their corresponding CEA pairs. Representative road-fuel densities are 0.745 and 0.835 kg/L. The diesel boiling and low-temperature thresholds are effective reference values for a distillate. Retail AI-95 and diesel vary in composition and volatility. [DOE fuel property comparison](https://afdc.energy.gov/fuels/properties) |

To check every stored CEA atom count, molar mass and enthalpy and all 98 polynomial coefficients, download the two pinned upstream raw files above and run the verifier. It first checks SHA-256 over each entire, unmodified upstream file.

```sh
python3 scripts/verify_sources.py /path/to/thermo.inp /path/to/nasa_gas.yaml
```

## Liquid and emulsion envelope

Positive family membership precedes each calculation. Ethanol and isopropanol are water-miscible alcohols. The ordinary hydrous grid has at most 20 mol% water. The dry carbonate family contains ethanol and DMC. DMC with water has a miscibility gap. The registered reverse-microemulsion point has **30 mol% ethanol, 25 mol% 1-octanol and 45 mol% water**. These fractions follow the published neutral, oil-rich simulation counts (3,600, 3,000 and 5,400 molecules) compared with scattering. It is a single benchmark point at 25 °C. The adjacent grid receives no emulsion classification. [Alcohol–water measurements](https://doi.org/10.1021/acs.jced.1c00327) · [Carbonate–ethanol VLE](https://doi.org/10.1021/je0002639) · [Reverse-microemulsion study](https://doi.org/10.1021/acscentsci.6b00116)

The pressure screen uses pure normal boiling anchors and constant latent heats in Clausius–Clapeyron. Raoult's law gives ideal bubble pressure and a root at one atmosphere gives the ideal bubble temperature. Non-ideal activity, azeotropes, droplets, surfactant kinetics and storage ageing require measurements. Pressure alone cannot establish single-phase or microemulsion stability. All admitted components pass the declared ambient liquid bounds. Reactive metallic, ammoniacal and unqualified ether formulations have no input record.

## Numerical model

For a mole with elemental counts C, H and O, the stoichiometric oxygen demand is `C + H/4 − O/2`. Dry model air supplies 3.76 mol N₂ per mol O₂. The LHV follows from liquid reactant formation enthalpy minus the enthalpy of complete products with gaseous H₂O. Water entering as a diluent consumes latent heat. Ideal molar volumes are additive. Enthalpies of mixing and changes of partial molar volume are neglected.

For the active temperature interval (200–1,000 or 1,000–6,000 K), `Cp/R = a1 + a2·T + a3·T² + a4·T³ + a5·T⁴`. The analytic integrals give H and S with the sixth and seventh constants. A constant shift gives H its CEA 298.15 K datum consistently in enthalpy and Gibbs-energy calculations. All seven gases use the same standard pressure of 101,325 Pa. [NASA-7 formulation](https://cantera.org/stable/reference/thermo/species-thermo.html)

The hot ideal gas contains CO₂, CO, H₂O, H₂, O₂, N₂ and NO. For each trial temperature the code forms equilibrium constants from standard Gibbs energies, solves oxygen partial pressure and conserves C, H, O and N. A safeguarded Newton iteration closes H at fixed pressure or U at fixed volume. The atmospheric flame uses stoichiometric air. The cylinder calculation uses its own inlet energy, air excess and pressure. This reduced equilibrium omits radical species, NO₂ and reaction times. Hot NO in ppm is an in-cylinder tendency. The tailpipe carbon balance assumes complete eventual oxidation. Lifecycle accounting has its own boundary.

Intake cooling draws the potential vapour load from each component's saturation partial pressure and inventory. A root equates the charge-air sensible enthalpy drop with evaporated latent heat. The same energy enters the fuel stream at combustion. Fuel admission is lumped at the end of dry-air compression. This approximation omits fuel-vapour displacement during compression. Compression ratios are **10.5** and **17**, with air excess factors **1.0** and **1.6** for Otto and Diesel. The model solves variable-Cp isentropes for each slider–crank volume, uses a rod/crank ratio of 3.5, and integrates pressure work in 2° increments. Otto heat release is isochoric. The Diesel cutoff follows the enthalpy-balanced isobar. Expansion freezes the hot composition. Blowdown closes the loop at fixed volume. P–V files scale the volume to 500 cm³ swept displacement. Peak pressures describe these idealised heat-release models.

The temperature-based knock proxy is `T_end_compression / T_ambient`. Increasing values indicate greater compression heating. The thermal stress score is `min(100, 100 × T_peak / 3500 K)`. Both are comparative indicators. The score does not predict metal temperature or a research octane number.

| Vehicle | Mass, kg | CdA, m² | Crr |
|---|---:|---:|---:|
| Sedan | 1,500 | 0.62 | 0.010 |
| SUV | 2,200 | 0.91 | 0.012 |
| Heavy truck | 18,000 | 5.80 | 0.0065 |

These are explicit vehicle-class scenarios. Air density is 1.225 kg/m³, level-road gravity is 9.80665 m/s² and accessory load is 0.7 kW wheel-equivalent. Representative heat-transfer, pumping and mechanical loss factors multiply ideal indicated efficiency by 0.64 (Otto) or 0.72 (Diesel), then by 0.91 for the driveline. Fixed factors simplify the load and speed dependence of a measured brake-efficiency map. A 50 L *usable* tank is compared at 90 and 110 km/h with no wind, grades, traffic or transients. [Road-load measurement context](https://www.ecfr.gov/current/title-40/chapter-I/subchapter-U/part-1066/subpart-D)

## Economic and environmental boundary

Costs are plant-gate engineering scenarios. We multiply each component's USD/kg by its mass consumed per 100 km. The reference EUR-to-USD conversion is **1.10** as a fixed comparison assumption. The inputs span different study years, locations and production scales. Inflation, taxes, financing harmonisation, retail margins and vehicle conversion costs can change the ordering.

| Component | Production cost basis | Lifecycle basis |
|---|---|---|
| AI-95 / diesel | European comparison values 12 / 11 EUR/GJ, multiplied by reference mass LHVs 44.3 / 43.0 MJ/kg | CARB lookup comparators 100.60 / 105.76 g CO₂e/MJ, used as road-fuel proxies. [EU transport assessment](https://op.europa.eu/en/publication-detail/-/publication/fd62065c-7a0b-11ea-b75f-01aa75ed71a1) · [CARB lookup](https://ww2.arb.ca.gov/sites/default/files/barcu/regact/2024/lcfs2024/atta1.pdf) |
| Bioethanol | Midpoint of 15–22 EUR/GJ, using 26.8 MJ/kg | RED II maize ethanol with natural-gas CHP, typical 42.5 g CO₂e/MJ. [EU cost basis](https://op.europa.eu/en/publication-detail/-/publication/fd62065c-7a0b-11ea-b75f-01aa75ed71a1) · [RED II Annex V](https://eur-lex.europa.eu/eli/dir/2018/2001/2018-12-21) |
| Waste-oil biodiesel | Midpoint of 16–21 EUR/GJ, using 37.3 MJ/kg, a biodiesel class cost proxy | RED II waste cooking oil biodiesel typical 11.2 g CO₂e/MJ. [EU cost basis](https://op.europa.eu/en/publication-detail/-/publication/fd62065c-7a0b-11ea-b75f-01aa75ed71a1) · [RED II Annex V](https://eur-lex.europa.eu/eli/dir/2018/2001/2018-12-21) |
| Recovered-carbon isopropanol | Steel-off-gas process design, USD 0.57/kg coproduct-average production cost | −1.42 kg CO₂e/kg upstream under the paper's avoided-emissions allocation, plus all stoichiometric exhaust CO₂. Allocation matters materially. [Process study](https://doi.org/10.69997/sct.167278) |
| Dimethyl carbonate | USD 0.845/kg plant break-even price used as a cost proxy | 0.39 kg CO₂e/kg upstream from a separate direct-carbon-utilisation case, plus all stoichiometric exhaust CO₂. This pairs published scenario inputs across two plants. [Process economics](https://doi.org/10.3303/CET1439261) · [Upstream footprint](https://doi.org/10.1039/D0GC03349A) |
| 1-Octanol | USD 7/kg, historical fed-batch alkane-conversion estimate | 2.97 kg CO₂e/kg upstream from a petrochemical fatty-alcohol class proxy, plus fossil exhaust carbon. This broad cost/CI proxy limits economic interpretation of the emulsion benchmark. [Octanol process economics](https://pubmed.ncbi.nlm.nih.gov/10397885/) · [Fatty-alcohol LCA](https://doi.org/10.1007/s11743-016-1867-y) |
| Water | Assumed utility rate USD 1/m³, rounded density 1 kg/L for the tariff | Assumed treatment footprint 0.3 kg CO₂e/m³. No carbon atoms. |

For gate-only fuel pathways, a declared transport allowance of 0.03 kg CO₂e/kg fuel completes the illustrative distribution boundary. Full pathway CI values already include use. The model multiplies emissions by fuel consumption once. It assigns zero closed-loop exhaust recovery to all current liquids. Waste feedstock credit is already embedded in the relevant lifecycle pathway.

The index is an expressed research preference. The weights are 35% production cost, 10% crustal abundance, 30% lifecycle CO₂e/km, 8% hot NO, 2% recoverable exhaust and 15% infrastructure. Cost, lifecycle and NO use `1 / (1 + value / AI95_value)`. The abundance term mass-weights `log10(1 + crustal ppm)/6`. Crustal occurrence is an accessibility proxy. Fuel production economics are supplied independently. Infrastructure gives 40% credit for an ambient liquid tank, then 60% for a mole-weighted engine-adaptability rubric. Reference road fuels score 1.00 on that rubric, B100 0.75, ethanol 0.65, IPA 0.45, DMC/octanol 0.40 and water 0.30. Blend approvals vary by market and manufacturer. [USGS crustal abundance, table 20](https://pubs.usgs.gov/pp/0440d/report.pdf) · [PubChem element identifiers](https://pubchem.ncbi.nlm.nih.gov/periodic-table/)

## Engineering survival validation

Stage 2 adds the independently versioned winter phase, volatility, pump wear, wetted-material and well-to-wheel screens. Numerical inputs, uncertainty, material test practices and sources are documented with their equations. [Stage 2 methods and sources](STAGE2.md)

## Dynamic engine and WLTC validation

The Stage 3 calibration methods, original kinetic correlations, official EU driving trace, injector assumptions and durability evidence are documented together. [Stage 3 methods and source register](STAGE3.md)

## Reproducibility and rights

The survey includes all admitted pure inputs and binary grid points, the published microemulsion point, and an evenly spread integer-index selection of hydrous ternary interiors. There are five neat fuels, 238 binaries and 757 ternaries. The grid is ordered by composition, with a coprime traversal stride and a bounded one-point mutation step. Changing the model or catalogue changes its fingerprint. Existing checkpoints reject mismatched results. The orphan branch history and the source commit in each run manifest identify the experiment.

The repository contains original implementation, original diagrams and selected attributed numerical facts. The MIT licence covers this project's original material. Consult each cited publication for its own terms and for uncertainty in the underlying data. The model contains no synthesis or handling instructions.
