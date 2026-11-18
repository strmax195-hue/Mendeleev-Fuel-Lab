# Automotive survival screening

Stage 2 asks whether an admitted ambient-pressure liquid could serve the same 1,500 kg sedan through a cold soak and a hot day. Each published formula and both road controls have an 86-point profile, one point per integer degree from −35 to +50 °C. A failed physical or economic gate rejects a nomination. Unresolved phase, component or supply evidence sends an otherwise successful nomination to review. A pass means all model gates cleared under the specified assumptions. Independent vehicle, material and fuel-batch testing is necessary for engineering release.

## Liquid stability and cold flow

We use an excess-Gibbs activity-coefficient proxy. For mole fractions `x`, dimensionless `gᴱ/RT = (298.15/T) Σ Aij xi xj`. Its partial molar derivatives give the activity coefficients for both phase and vapour calculations. The symmetric pair energies in [the numerical inputs](engine/stage2_inputs.py) are screening assumptions. In particular, the water–octanol–ethanol interaction is constrained to admit the experimentally observed neutral composition at 25 °C. The model has limited resolving power for asymmetric mutual solubilities and aggregate structure. The published single-phase observation at one temperature supplies no winter tie-lines. [Measured ternary point](https://doi.org/10.1021/acscentsci.6b00116) · [NIST water–octanol solubility measurements](https://www.nist.gov/publications/solubility-water-1-octanol-2-degc-96-degc)

For each candidate the solver searches the simplex at 5 mol% intervals including pure trial phases, then tests small composition exchanges around the feed. A trial phase `y` can form spontaneously when its tangent-plane distance is negative. With this excess-energy model, the distance is the relative entropy `Σ yi ln(yi/xi)` plus `(298.15/T) Σ Aij(yi−xi)(yj−xj)`. This gives a temperature threshold for each witness. An undiscovered small miscibility gap remains possible between the trials. The screen identifies the onset of instability without computing amounts of separated phases.

The independent crystallisation test compares `ln(xi γi)` with `−ΔHfus/R × (1/T−1/Tm)` under the pure-solid approximation. Neat biodiesel and the distillate surrogate instead use their declared bulk cold-flow scenarios (+15 and about −23 °C). Actual cloud point and filter plugging vary by grade, feedstock and season. The display suppresses homogeneous-liquid viscosity, vapour pressure and start estimates when either a split or solid risk appears. [Carbonate fusion calorimetry](https://doi.org/10.1021/je034134e) · [1-octanol fusion data](https://webbook.nist.gov/cgi/cbook.cgi?ID=C111875&Mask=4) · [DOE biodiesel handling guide](https://afdc.energy.gov/files/u/publication/biodiesel_handling_use_guide.pdf)

## Volatility and starting

Partial pressures obey `pi = xi γi Pi,sat(T)`. The saturation curve integrates Clausius–Clapeyron with the original per-component latent heat and a rounded pure-liquid pressure anchor at 25 °C. Bulk fuel surrogates without that anchor use their normal boiling point. The **RVP proxy** depletes a one-litre liquid inventory into a four-litre headspace at 37.8 °C and iterates the resulting partial pressures and inventories to convergence. It reports condensable pressure in kPa. Reid and mini-method instruments have prescribed conditioning and air corrections. A regulatory RVP or DVPE requires a sample measurement. [DMC vapour-pressure measurements](https://doi.org/10.1021/je970102d) · [ASTM D5191 scope](https://store.astm.org/d5191-22.html) · [ASTM D323 scope](https://store.astm.org/d0323-20a.html)

For spark ignition the **cranking index** is the sum of the combustible partial vapour fractions divided by their respective lean limits in air. A value below one at −35 °C fails the unheated scenario. Droplets, cranking speed, battery voltage, wall wetting, injection and transient enrichment require a vehicle test even above one. Bulk B100 and diesel receive a compression-ignition cold-soak and filterability review. The gasoline control uses the Stage 1 isooctane surrogate and does not represent the light ends of commercial winter gasoline. [DOE seasonal ethanol-fuel specification](https://afdc.energy.gov/fuels/ethanol-e85-specs) · [NIOSH isopropanol](https://www.cdc.gov/niosh/npg/npgd0359.html) · [NOAA isooctane](https://cameochemicals.noaa.gov/report?key=CH941)

Hot-feed checks subtract blend bubble pressure at +50 °C from **350 kPa absolute** in the low-pressure supply rail and **86.325 kPa absolute** at the pump inlet. The second figure assumes 101.325 kPa tank headspace minus a 15 kPa line loss. Either nonpositive margin fails. These are sea-level design scenarios with fuel at the selected ambient temperature. Underhood soak above ambient, altitude, return heat and the high-pressure injection system need vehicle-specific data.

## Wetted materials and retrofit verdicts

The matrix in [materials_db.py](engine/materials_db.py) is an original, conservative engineering rubric. SAE J1681 describes surrogate test fluids, and SAE J1748 describes physical testing of exposed polymer specimens. Neither publication certifies a blend or supplies the ratings displayed here. Compound swelling, compression set, permeation, dwell time, metal surface condition, galvanic couples and tank coatings all affect an actual assembly. [SAE J1681](https://doi.org/10.4271/J1681_202305) · [SAE J1748](https://doi.org/10.4271/J1748_201808)

| Material | Screening treatment |
|---|---|
| Carbon steel | Review above the scenario's 3 vol% water threshold for corrosion and fuel quality. |
| Stainless 304 and 316 | Considered suitable within the clean, neutral registered fuel families. Both grades appear separately in each reading. |
| Aluminum 6061 | Review very dry ethanol-rich fuel, elevated water and carbonate exposure. Alloy, passive film and contaminants affect the result. |
| Brass / copper | Avoid above 5 vol% FAME due to catalytic oxidation. Review hydrous and carbonate service. |
| NBR | Review above 20 vol% combined alcohol content or FAME, and with DMC. The assumed low-temperature grade has a −40 °C lower limit. |
| FKM | Review alcohol-rich and carbonate exposure for the installed compound. The assumed standard grade has a −20 °C lower limit. |
| EPDM | Eligible in compatible aqueous/alcohol service. Petroleum, octanol and ester service are conservatively excluded. Assumed lower limit −45 °C. |
| PTFE | Chemically suitable in the registry. Replacement requires a compatible static gland and a suitable energising design. Assumed lower limit −100 °C. |

Volume thresholds and service-temperature limits describe the project's screening grades. “Review” denotes missing qualification evidence. Untested metallic combinations receive the conservative “Incompatible” retrofit verdict with the review badge still visible. [ORNL aluminum–ethanol study](https://www.ornl.gov/publication/susceptibility-aluminum-alloys-corrosion-simulated-fuel-blends-containing-ethanol) · [Parker O-Ring Handbook](https://www.parker.com/Literature/O-Ring%20Division%20Literature/ORD%205700.pdf) · [DOE biodiesel handling guide](https://afdc.energy.gov/files/u/publication/biodiesel_handling_use_guide.pdf)

The stock system contains carbon steel, 304, 6061 and NBR. The legacy system has carbon steel, copper fittings and NBR. The stainless circuit has 304/316 and FKM. **100% Drop-In Stock Tank** describes the modeled wetted assembly when all installed grades qualify. **Minor Seal Swap (EPDM/PTFE O-rings)** requires qualified metals and a suitable replacement grade and gland. **Incompatible** blocks the modeled retrofit. The dossier uses the stock assembly across the full envelope. The slider recalculates the selected assembly at the chosen temperature. Ignition and economics have their own gates.

## Pump wear, dosing and balances

Pure dynamic viscosities are parameterised at 20 and 40 °C. An Andrade line in `ln μ` versus `1/T` gives each pure viscosity, then a mole-weighted logarithmic rule gives the blend in mPa·s. Low-temperature extrapolation, excess viscosity and shear effects introduce uncertainty. A 30 mPa·s cold-pump ceiling is a circuit scenario. Diesel receives a 40 °C kinematic-viscosity check using the reference liquid density, 1.9–4.1 mm²/s for road distillate or 1.9–6.0 for neat biodiesel. [DMC mixture viscosity measurements](https://trc.nist.gov/ThermoML/10.1021/je049895b.html) · [DOE biodiesel specifications and cold-flow context](https://afdc.energy.gov/files/u/publication/biodiesel_handling_use_guide.pdf)

HFRR wear scar is empirical. The screen interpolates per-stock endpoints by undosed volume fraction. Neat ethanol is anchored at approximately 700 µm from a published ethanol study. Other endpoints and the dose response in [stage2_inputs.py](engine/stage2_inputs.py) are scenario parameters. ASTM D6079 concerns diesel fuels. The 520 µm US diesel comparison is also used as a conservative comparative pump screen for the other liquids. The cross-fuel extrapolation and an SI injector's actual wear require testing. [Ethanol HFRR study](https://doi.org/10.4271/2016-01-2260) · [ASTM D6079](https://store.astm.org/d6079-18.html) · [NREL biodiesel lubricity measurements](https://docs.nrel.gov/docs/fy04osti/36240.pdf)

For a dry ethanol/isopropanol parent over the wear threshold, the solver tries 0.5, 1.0, 1.5 and 2.0 vol% of the whitelisted waste-oil B100. An exponential interpolation toward its 300 µm scenario endpoint uses a characteristic dose of 1.3 vol%. The first clearing dose becomes the screened composition. Every dosed case receives a phase and wear evidence flag. A dry or hydrous parent outside this auxiliary family keeps its original composition. The original discovery catalogue, controls and mole-grid identities stay traceable. The dose is a **simulation of a candidate retrofit**, and the B100 response measured in diesel has substantial transfer uncertainty in alcohols. [Measured biodiesel/ethanol/water equilibria](https://doi.org/10.1021/je301028r)

The inventory displaces base liquid to make exactly one final litre under additive reference volumes. Component masses follow from density, moles from molecular weight, and available chemical energy from liquid formation enthalpies and gaseous combustion products. Liquid water therefore carries an evaporation penalty. A dosed screen recomputes liquid inventory, phase, wear, materials and cost while holding the parent vehicle's fuel-energy demand and cycle efficiency fixed. The archived Stage 1 cycle remains the parent's trace.

## Well-to-wheel energy and cost

The common duty is 100 km at 110 km/h. Litres consumed equal the original road model's tank energy demand divided by the final blend's MJ/L. Wheel output equals distance times aerodynamic plus rolling resistance. Accessory load contributes to tank demand and is outside the tractive output numerator. **Wheel EROI** divides this useful road work by external primary energy for farming or recovery, processing, purchased electricity and distribution. The chemical energy content of the harvested or extracted feedstock is outside the investment denominator. This choice matters when interpreting comparisons to published fuel-gate EROI. No coproduct credit is added by Stage 2. [Argonne well-to-wheels boundary](https://greet.anl.gov/greet/gettingstarted/wtw.html)

| Stock | Synthesis electricity, kWh/kg | Other invested primary energy, MJ/kg |
|---|---:|---:|
| Bioethanol | 0.24 | 13.0 |
| Recovered-carbon isopropanol | 0.80 | 11.0 |
| Water | 0.0005 | 0.005 |
| 1-Octanol | 1.20 | 28.0 |
| Dimethyl carbonate | 0.65 | 12.0 |
| Waste-oil biodiesel | 0.34 | 5.5 |
| Gasoline / diesel controls | 0.14 / 0.12 | 5.2 / 5.0 |

These are fixed comparison inventories. Ethanol electricity approximates a US dry-mill survey (0.70 kWh/US gallon). Biodiesel uses an electricity class proxy from a waste-oil study. Other pathway intensities are explicit hypotheses awaiting plant-specific inventories, and limited-feedstock pathways require capacity evidence. The numbers span different production systems and give no procurement or scalability guarantee. [US dry-mill survey](https://www.energy.gov/sites/prod/files/2014/04/f14/anl_ethanol_analysis_2007.pdf) · [Waste-oil biodiesel study](https://agris.fao.org/search/en/providers/122436/records/6970e665bd789e57df2e387c) · [USDA ethanol energy balance](https://www.usda.gov/sites/default/files/documents/2015EnergyBalanceCornEthanol.pdf)

Purchased power uses 2.0 primary MJ per delivered electrical MJ and $0.12/kWh. Distribution adds 0.70 primary MJ/kg and $0.04/kg. **Delivered USD/100 km** adds the distribution charge to the mass-weighted Stage 1 plant-gate cost. The dashboard shows the estimated synthesis electricity share already inside that plant price. The economic gate requires wheel EROI ≥1 and delivered cost no higher than the same-duty AI-95 reference. Vehicle ownership, taxes, heater energy, retrofits and seasonal price changes are outside this comparison.

## Publication and independent replay

The orphan branch stores the unchanged Stage 1 checkpoint, a small `data/stage2.json` index, `data/stage2-manifest.json` with the source revision, and one SHA-256-addressed profile per tested ID under `data/weather/`. The shortlist retains each frontier nomination since Stage 2 began plus every recorded discovery dossier. Road controls and previews for other formulas are outside the funnel denominator. One Git commit publishes both stages. The dashboard checks generation, model and per-file SHA-256 before showing newly downloaded weather data.

From a checkout on Windows or Linux, use Python 3.10 or newer. Each sector contains 1–50 contiguous IDs in sorted catalogue order starting at zero. A sector can cover formulas still to be visited by Stage 1. Their road economy joins at the first published thermodynamic evaluation.

```sh
python cli/local_worker.py --start 100 --count 10 --output contributions/sector-0100-10.json
python cli/local_worker.py --verify contributions/sector-0100-10.json
```

A PR can contain the resulting JSON file alone. The payload contains the model and catalogue fingerprints, physical profiles and input sector. SHA-256 checks content integrity. Independent deterministic replay catches edited numbers even if someone recomputes the digest. Authorship is outside this protocol. Overlapping current-model sectors yield the same per-ID records. A new model fingerprint starts a new numerical comparison. The worker records no timestamps, hostnames, usernames or contact fields and makes no network requests.
