# Auto-Element Fuel Lab

An autonomous, static observatory for **affordable, lower-carbon automotive liquids**. It screens a finite catalogue of 1,000 pure liquids and blends at 1 mol% resolution. Each result has an atom balance, an energy balance, two pressure–volume cycles and a highway road-load calculation. A second stage subjects the thermodynamic frontier to winter starting, summer vapour lock, pump wear, material and delivered-cost screens.

**[Open the interactive observatory](https://strmax195-hue.github.io/Mendeleev-Fuel-Lab/)** · [Live results](https://raw.githubusercontent.com/strmax195-hue/Mendeleev-Fuel-Lab/lab-data/data/state.json) · [Discovery dossiers](https://github.com/strmax195-hue/Mendeleev-Fuel-Lab/tree/lab-data/dossiers) · [Methods and sources](SOURCES.md)

![Survey coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fstrmax195-hue%2FMendeleev-Fuel-Lab%2Flab-data%2Fbadges%2Fcoverage.json&cacheSeconds=300)
![Discovery generation](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fstrmax195-hue%2FMendeleev-Fuel-Lab%2Flab-data%2Fbadges%2Fgeneration.json&cacheSeconds=300)
![Three-objective frontier](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fstrmax195-hue%2FMendeleev-Fuel-Lab%2Flab-data%2Fbadges%2Ffrontier.json&cacheSeconds=300)

![Stage 2 survival](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fstrmax195-hue%2FMendeleev-Fuel-Lab%2Flab-data%2Fbadges%2Fsurvival.json&cacheSeconds=300)

![Live two-stage fuel map and master survey progress](https://raw.githubusercontent.com/strmax195-hue/Mendeleev-Fuel-Lab/lab-data/assets/mendeleev-fuel.svg)

**Periodic Space Explored** counts distinct members of the declared liquid catalogue that passed both conservation checks. The full periodic table supplies context. Green cells occur in tested fuel inventories. The progress denominator is 1,000 compositions.

## Two-stage discovery funnel

Stage 1 ranks the 1,000-liquid catalogue by range, production cost and lifecycle emissions. Every tested formula gets a Stage 2 weather profile. The Pareto frontier and recorded discoveries enter the engineering shortlist automatically. Its second progress bar counts **full-envelope model passes / shortlisted candidates**. A candidate can lead on range and still fail at −35 °C. Both failed gates and unresolved evidence appear in its dossier. [Live Stage 2 index](https://raw.githubusercontent.com/strmax195-hue/Mendeleev-Fuel-Lab/lab-data/data/stage2.json)

The **car weather tester** reads 86 temperature points per fuel, reports liquid separation and freezing independently, and compares three fuel-system assemblies. Select a formula to inspect seal ratings, the four-volume RVP estimate, cranking volatility, hot-rail and inlet margins, bio-ester dose, wheel EROI and delivered cost. “Drop-In” is a material-screen verdict for the selected assembly. Chemical and vehicle qualification require physical tests. [Open the weather tester](https://strmax195-hue.github.io/Mendeleev-Fuel-Lab/#weather) · [Engineering assumptions and validation methods](STAGE2.md)

## What a 50-litre tank buys

Selected first-generation alternatives, ordered by Eco-Affordability Index. The sedan weighs 1,500 kg and travels at 110 km/h on level ground. The observatory updates the full leaderboard with every generation.

| Fuel | Index / 100 | MJ/L | Range, km | Production USD/100 km | Lifecycle g CO₂e/km |
|---|---:|---:|---:|---:|---:|
| Waste-oil biodiesel | 65.2 | 32.70 | 1,017 | 3.28 | 18.0 |
| Recovered-carbon isopropanol | 58.3 | 23.78 | 598 | 3.72 | 52.7 |
| Bioethanol | 57.5 | 21.04 | 533 | 4.01 | 83.8 |
| Dimethyl carbonate | 41.0 | 15.31 | 385 | 11.67 | 260.5 |
| **AI-95 gasoline reference** | **55.6** | **33.04** | **820** | **2.66** | **202.6** |
| **Road diesel reference** | **60.0** | **35.93** | **1,114** | **1.95** | **170.6** |

Waste-oil biodiesel has the lowest lifecycle estimate in this comparison. Its production cost exceeds both road references. The fuels use different production pathways and the calculations use historical plant-cost scenarios. Retail taxes, margins and local pump prices are outside the cost boundary.

![Live range, cost and climate Pareto frontier](https://raw.githubusercontent.com/strmax195-hue/Mendeleev-Fuel-Lab/lab-data/assets/pareto.svg)

## Using the observatory

- **Periodic fuel map.** Click any of the 118 elements. The 17 curated entries describe constituent, air or vehicle-material roles. For a constituent, select a tested blend to inspect energy per litre relative to both road fuels and the balanced exhaust inventory.
- **Pareto frontier explorer.** Inspect cost against range. Colour represents lifecycle greenhouse gases. The frontier contains points for which improving one objective entails a trade-off in another.
- **Liquid blend laboratory.** Adjust two independent fractions in the alcohol–water ternary or select an admitted binary, pure liquid or measured microemulsion. The local solver calculates the charge temperature, adiabatic flame temperature, bubble pressure, peak cylinder pressure, indicated efficiency and P–V trace.
- **50 L tank race.** Compare two references, surveyed candidates or the current bench blend in a sedan, SUV or heavy truck at 90 or 110 km/h. All three vehicles use the same usable 50 L for a controlled comparison.

## Scientific scope

The registry admits bioethanol, isopropanol, dimethyl carbonate, waste-oil biodiesel, 1-octanol and water within specific phase families. The alcohol–water grid has a 20 mol% water ceiling. A separate, experimentally characterised octanol–ethanol–water point represents a reverse microemulsion. Its precise composition has a dedicated admission rule. The primary engine classifies admission at 298.15 K. Stage 2 separately screens phase stability across the weather envelope. [Phase evidence](https://doi.org/10.1021/acscentsci.6b00116)

Fuel admission uses a **positive whitelist** of identified substances and compatible families. Cryogenic and pressurised fuels, metallic slurries, reactive metal carriers, ammonia, peroxide-forming ethers, explosives, acute toxins and radioactive feedstocks have no fuel entry. Road gasoline and diesel are fixed surrogate controls. Ordinary automotive liquids are flammable. Results are for numerical research. Vehicle compatibility, measured octane, cold-start behaviour and regulated emissions require independent tests.

| Calculation | Model |
|---|---|
| Fuel inventory and energy | Exact elemental counts per mole of mixture, liquid formation enthalpies and Hess's law with gaseous product water. Ideal additive component volumes. |
| Gas properties and flame | Seven-coefficient NASA polynomials for Cp, H and S. A bracketed Newton solver closes the enthalpy balance with pressure-dependent dissociation and NO equilibrium. |
| Intake and engine | An evaporation energy balance cools the incoming charge. Angle-resolved slider–crank geometry, variable-Cp isentropes, constant-volume Otto or constant-pressure Diesel combustion and numerical integration of ∮P dV give indicated work. |
| Road range | Aerodynamic force ½ρCdAv² plus rolling force Crr·mg, accessory demand, explicit shaft and driveline losses, then usable tank energy divided by MJ/km. |
| Costs and climate | Per-component production and pathway inventory, actual modelled fuel consumed per kilometre, separate tailpipe carbon and lifecycle CO₂e. |
| NO and knock | Ideal hot-gas equilibrium NO and end-compression temperature ratios are screening proxies. NOx after aftertreatment and fuel octane need kinetics and measurements. |

## Autonomous discovery and records

GitHub Actions requests a run at minutes **07, 27 and 47 UTC** of each hour. Schedules are best-effort. Each generation evaluates up to 24 unseen compositions. Mutations transfer one mole percent between the components of a promising blend. A deterministic grid traversal fills the remaining places and guarantees coverage. A model fingerprint identifies the scientific inputs, numerical solver and survey definition.

A separate orphan branch, **lab-data**, holds the checkpoint, SVGs, Shields endpoints, source manifest and dossiers. Publishing uses a serial concurrency group, a fast-forward push and a ledger of issued records. A retry can finish issue publication after a successful data commit. Completion at 100% leaves the checkpoint stable. The Pages application ships 24 real calculations for the first load and reads the generated branch directly. It requests a fresh feed every 20 minutes. Badges request a five-minute cache lifetime. GitHub and its image proxies control the actual HTTP cache headers.

The public frontier compares **range, production cost and lifecycle emissions** across all alternatives. A milestone recognises a blend extending the **Eco-Affordability Index versus range** frontier among blends at generation close, at 0.1 index point and 1 km reporting resolution. A zero-tailpipe-carbon range record has a separate ledger event. All current energy-bearing candidates contain carbon. A *nonlinear synergy anomaly* must reach the three-objective frontier, improve indicated efficiency, tailpipe carbon, lifecycle carbon and cost against **both** road references, and exceed the energy-weighted indicated efficiency of its combustible pure parents. An empty anomaly set is a valid result.

## Run and verify

Python 3.10+ and Node.js 18+ run the numerical lab using standard libraries. The dashboard uses the same JavaScript kernel in the browser. A separate Python implementation checks atom totals and thermodynamic residuals. Open `docs/index.html` for offline seed exploration.

```sh
python3 -m unittest discover -s tests -v
python3 -m engine.stage2_publish --output .lab --batch 24
python3 -m engine.discovery_solver --verify eth80-ipa20
python3 -m scripts.build_assets
```

The Python-only citizen worker computes new Stage 2 sectors offline on Windows and Linux. It needs no Node.js, package install or account. An independently replayable JSON bundle can be submitted under `contributions/` in a PR.

```sh
python cli/local_worker.py --start 100 --count 10 --output contributions/sector-0100-10.json
python cli/local_worker.py --verify contributions/sector-0100-10.json
```

The Stage 1 verification command emits both crank-angle traces. Volume is in cm³, pressure in absolute bar and temperature in kelvin. To render the 1280 × 640 social card, run `python3 scripts/generate_social_preview.py` in an environment with Pillow. Molecular data and all thermodynamic calculations work offline. [Input verification and reproducibility](SOURCES.md)

The original software, artwork and documentation use the repository's MIT licence. The application has no accounts, analytics, cookies, free-text inputs or personal-data store. Live mode requests public GitHub data. GitHub Pages, GitHub Actions and Shields handle their own infrastructure traffic. [MIT licence](LICENSE)
