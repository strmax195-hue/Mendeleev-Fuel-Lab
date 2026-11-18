# Planetary abundance and closed-loop biosphere audit

Stage 4 follows the architecture that actually cleared Stage 3. The declared fleet has **one billion passenger cars driving 12,000 km each per year**. A finalist is a Stage 3 champion on a named engine. Its ecological outcome can be failed, awaiting evidence, or verified. Calculation controls make the scale and the equations inspectable at every generation. [Live audit](https://strmax195-hue.github.io/Mendeleev-Fuel-Lab/#planetary) · [Machine-readable checkpoint](https://raw.githubusercontent.com/strmax195-hue/Mendeleev-Fuel-Lab/lab-data/data/stage4.json)

## Energy and light

**Tank energy return** is liquid lower heating value divided by external synthesis primary energy, in MJ/MJ. Per-component synthesis input equals the non-electrical upstream inventory plus 3.6 times electrical kWh times the primary-energy factor of 2. Energy already stored in a feedstock is outside this denominator. Stage 2 adds 0.70 MJ/kg for distribution, uses actual warmed road duty at each temperature and separately reports wheel work divided by total external primary energy. Both boundaries and their denominators travel with the results. [Per-pathway numerical inputs](STAGE2.md)

Solar-to-tank efficiency divides the final fuel LHV by attributed incident solar energy. The explicit crop-ethanol scenario assigns 1.5% sunlight-to-harvested-biomass efficiency and 52% biomass-energy recovery into ethanol. Required process-primary MJ are supplied at an assumed 20% solar conversion. For treatment water only this last term applies. A blend sums the incident-energy requirements of its components before dividing. Water's latent energy penalty remains in the output numerator. These efficiencies are comparison assumptions. The current waste ester, fossil, industrial off-gas and unspecified routes have incomplete solar attribution. Their value is null, including after an ester dose. [Photosynthesis and photovoltaic energy conversion](https://doi.org/10.1126/science.1200165) · [Pathway model](engine/reservoirs.py)

## Stocks, flows and competing uses

Multiply WLTC litres per 100 km by annual fleet distance divided by 100. For each litre, the audit recomputes the final Stage 2 component volumes, including any ester displacement, mass and atoms. The planetary inputs distinguish elemental **mass ppm** from atmospheric **mole ppm**, and the mass of a reservoir from its annual replenishment.

| Quantity | Reference and use |
|---|---|
| Continental-crust elements | USGS table 20 gives typical abundance. Fe and Si can be abundant in the crust while their incorporation and recovery in plant hardware remain unquantified. [USGS PP 440-D](https://pubs.usgs.gov/pp/0440d/report.pdf) |
| Dry atmosphere | The scenario uses 5.1 × 10¹⁸ kg, 78.08 mol% N₂, 20.95 mol% O₂ and 420 ppmv CO₂. Multiply mole fraction by elemental molar mass contribution divided by 28.965 to obtain mass fraction. Burning a CHO fuel circulates air nitrogen in the ideal ledger. Trace NOx and crop fertiliser are outside that ideal return. [NASA Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html) · [NOAA composition](https://www.noaa.gov/jetstream/atmosphere) |
| Seawater | Ocean water volume is 1.338 × 10⁹ km³. Its freshwater-equivalent mass uses 1,000 kg/m³. Representative elemental concentrations are for salinity 35 g/kg. H and O count the water solvent. Dissolved inorganic carbon is represented at 2 mmol/kg. Unreported concentrations are unknown. [USGS global water distribution](https://www.usgs.gov/water-science-school/science/how-much-water-there-earth) · [NOAA reference seawater, table 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Chapter5.pdf) |
| Renewable water | FAO estimates 43,000 km³/year of runoff and recharge. The scenario sets aside 0.1% of this global flow. The fuel hydrogen expressed as water is a stoichiometric regeneration requirement. Measured withdrawals require basin, rainfall, irrigation and process-water inventories. [FAO AQUASTAT](https://www.fao.org/aquastat/en/overview/methodology/water-use/) |
| Crop and recovered feedstock | The scenario allocates 1% of an estimated 60 Pg C/year of global terrestrial net primary production. Ethanol requires at least 1.5 kg fermentable carbon per kg fuel carbon from glucose → 2 ethanol + 2 CO₂. Waste ester throughput and carbon from other sources are reported separately. Food, soils and ecosystems already use much of this flow. [IPCC terrestrial carbon cycle](https://www.ipcc.ch/site/assets/uploads/2018/02/TAR-03.pdf) |

The annual scenarios require demand strictly below each allocation. Reaching a limit fails the screen. Staying below an illustrative allocation leaves sustainable resource supply under review pending regional inventories, competing uses, refinery inputs, catalyst losses and scarce-mineral sourcing. Stock percentages describe one year's material turnover. They do not establish an extraction entitlement. [Fleet calculation](engine/stage4_planetary.py)

## Matter, spills and greenhouse products

Each stock enters on a one-litre final-blend basis with exact rational coefficients. For CₓHᵧO𝓏, oxidation consumes x + y/4 − z/2 moles of O₂ and produces x CO₂ + y/2 H₂O with spectator N₂. The reverse ledger independently reconstructs each stock from its required CO₂ and H₂O and returns molecular oxygen. Exact input, exhaust and ideal regeneration atom vectors are stored as rational strings. Atmospheric capture, photosynthesis, separation losses, residence times and actual recovered fractions require separate measurements. An exact mass residual of zero can coexist with positive greenhouse discharge. [Mass and fate calculation](engine/biosphere_cycle.py)

All current fuels contain carbon. Their gross combustion CO₂ fails the requested zero-greenhouse-byproduct gate even for routes with biogenic uptake. Lifecycle CO₂e is retained as a separate physical measure. Absence of halogens in these stock formulas is directly testable. Whole-path ozone depletion, nitrous oxide, methane, partial oxidation products and actual closed-loop recovery require evidence.

The spill audit reports theoretical oxygen demand and remaining organic mass in a bounded 28-day aquifer scenario. Ethanol aquifer microcosm half-lives of 3–7 days parameterise first-order decay. For unknown organics the lower bound permits complete loss and the upper bound retains the entire unknown fraction. Bulk-mixture half-life, field soil and surface-water endpoints remain unreported where evidence is missing. Oxygen depletion, metabolites, dose and ecosystem exposure can matter even for a rapidly degraded stock. Chronic ecotoxicity and measured material recovery must clear their own gates. [LLNL aquifer microcosms](https://www.osti.gov/servlets/purl/15016025) · [OECD biodegradability guidance](https://doi.org/10.1787/9789264070349-en)

## Crank-angle cutaway

One local Three.js renderer displays two engines at the same crank angle. The candidate uses the active blend-lab recipe or a surveyed formula. The matched AI-95 or diesel control uses the same ideal cycle. The piston crown follows indicator volume divided by bore area. Pressure and temperature interpolate the actual crank-angle indicator trace. During gas exchange only geometry and nominal manifold pressure are available. Intermediate ideal-diesel cutoff temperature is displayed as unreported. Thermal tint follows the available gas temperature.

For premixed ignition the displayed laminar speed follows the Stage 3 pressure, temperature, equivalence-ratio and dilution correlation, evaluated at the compressed unburned charge. The expanding surface uses that speed plus the Stage 3 mean-piston-speed turbulence estimate at 2,000 rpm. Missing kinetics suppress the wave. Diesel displays a mixing-controlled front scaled by the isobaric volume change. Spray and flame geometry illustrate a reduced-order model. Spatial CFD, turbulence fields, droplet breakup and directly measured flame fronts require additional data. Animation follows the display refresh with a 60 fps design target, pauses offscreen and honours reduced motion. Numerical controls also work without WebGL. The vendored Three.js r160 build runs locally under MIT. [Three.js release](https://github.com/mrdoob/three.js/releases/tag/r160) · [Dependency licence](docs/vendor/THREE-LICENSE.txt)

## Independent numerical reproduction

Use Python 3.10+ on the source revision whose seed model matches the public Stage 4 index. The worker recomputes Stage 3, the fleet scenario, atom flows and all fate gates from the whitelisted formula. The manifest records the checkout commit for each model. [Stage 4 source manifest](https://raw.githubusercontent.com/strmax195-hue/Mendeleev-Fuel-Lab/lab-data/data/stage4-manifest.json)

A reference replay runs locally with these commands.

```sh
python cli/local_worker.py --stage 4 --candidate ai95100 --architecture mpi --output audit.json
python cli/local_worker.py --verify audit.json
```

For an actual finalist, use its ID and qualifying architecture from the dashboard. Copy the single `fuel-lab-replay-v1 …` line printed by verification into the body of a new GitHub Issue. The IssueOps workflow reads an exact, bounded receipt, checks the current published finalist, reruns the calculation on trusted main-branch code and compares both SHA-256 values before adding `[PEER-REPRODUCED]`. The scheduled publisher independently reruns accepted receipts. Dashboard badges are keyed to the exact candidate, engine, model and physics digest. A reference or an unsupported architecture cannot receive a badge.

The receipt attests external numerical agreement. A public hash is copyable and does not establish a person's identity, an independent scientific implementation, or the result of a physical experiment. GitHub handles the public issue and checks the submitting account's repository relationship. Only numerical receipts enter the lab's data branch. [Verification workflow](.github/workflows/issueops-verify.yml)
