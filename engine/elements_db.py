"""Whitelisted liquid feedstocks, phase groups, energy pathways and map data."""

import json
from pathlib import Path

from .fuel_quality import QUALITY
from .stage2_inputs import PROPERTIES, GRID_PRIMARY
from .reservoirs import (
    AIR_PPM,
    OCEAN_PPM,
    CROP_LIGHT_EFFICIENCY,
    ETHANOL_RECOVERY,
    SOLAR_PROCESS_EFFICIENCY,
)

DATA = Path(__file__).with_name("data")
CEA = json.loads((DATA / "cea.json").read_text())
NASA7 = json.loads((DATA / "nasa7.json").read_text())
# Continental-crust ppm in USGS PP 440-D, table 20. Hydrogen uses the Mason column.
PPM = dict(
    H=1400,
    Li=20,
    B=12,
    C=200,
    N=20,
    O=464000,
    Na=23600,
    Mg=23300,
    Al=82300,
    Si=281500,
    P=1050,
    S=260,
    K=20900,
    Ca=41500,
    Ti=5700,
    Fe=56300,
    Zn=70,
)
ROLES = {
    "H": "Energy carrier in alcohols, esters and hydrocarbons.",
    "C": "Organic fuel backbone and source of tailpipe carbon dioxide.",
    "O": "Bound oxygen in oxygenates and water. Air supplies the remaining oxygen demand.",
    "N": "Intake-air constituent and source of thermal nitric oxide.",
    "Li": "Battery electrode materials.",
    "B": "Glass and alloying constituent.",
    "Na": "Process salts and automotive glass.",
    "Mg": "Lightweight vehicle alloys.",
    "Al": "Castings, structures and recyclable tank materials.",
    "Si": "Alloys and semiconductor controls.",
    "P": "Phosphates in batteries and coatings.",
    "S": "Fuel-quality and catalyst compatibility.",
    "K": "Process salts in renewable fuel supply chains.",
    "Ca": "Lubricant additives and processing media.",
    "Ti": "Corrosion-resistant components.",
    "Fe": "Steel structures and oxide recovery research.",
    "Zn": "Corrosion protection on vehicle bodywork.",
}
ELEMENTS = [
    dict(
        z=z,
        symbol=s,
        name=n,
        row=r,
        col=c,
        ppm=PPM.get(s),
        airPpm=AIR_PPM.get(s),
        oceanPpm=OCEAN_PPM.get(s),
        role=ROLES.get(s),
    )
    for z, s, n, r, c in json.loads((DATA / "periodic.json").read_text())
]


# density kg/L, melting/normal boiling K, latent heat J/mol on the liquid reference basis.
# See SOURCES.md for phase, pathway and surrogate choices.
def fluid(
    label,
    short,
    source,
    rho,
    melt,
    boil,
    latent,
    ci,
    infrastructure,
    cycle="Otto",
    hf=None,
    formula=None,
    gate_kg=None,
):
    ref = CEA[source] if source else {}
    return dict(
        name=label,
        short=short,
        atoms=formula or ref.get("atoms"),
        hf=ref.get("hf_j_mol") if hf is None else hf,
        rho=rho,
        melt=melt,
        boil=boil,
        latent=latent,
        ci=ci,
        gateKg=gate_kg,
        infra=infrastructure,
        cycle=cycle,
        source=source or "Liquid calorimetry",
    )


def vapor_gap(gas, liquid):
    return CEA[gas]["hf_j_mol"] - CEA[liquid]["hf_j_mol"]


STOCKS = {
    "eth": fluid(
        "Bioethanol",
        "EtOH",
        "C2H5OH(L)",
        0.785,
        159,
        351.5,
        vapor_gap("C2H5OH", "C2H5OH(L)"),
        42.5,
        0.65,
    ),
    "ipa": fluid(
        "Recovered-carbon isopropanol",
        "IPA",
        "C3H8O,2propanol",
        0.781,
        185,
        355.4,
        45400,
        None,
        0.45,
        hf=CEA["C3H8O,2propanol"]["hf_j_mol"] - 45400,
        gate_kg=-1.42,
    ),
    "water": fluid(
        "Water",
        "Water",
        "H2O(L)",
        0.997,
        273.15,
        373.15,
        vapor_gap("H2O", "H2O(L)"),
        None,
        0.30,
        gate_kg=0.0003,
    ),
    "dmc": fluid(
        "Dimethyl carbonate",
        "DMC",
        None,
        1.064,
        277.2,
        363.4,
        38020,
        None,
        0.40,
        hf=-609600,
        formula={"C": 3, "H": 6, "O": 3},
        gate_kg=0.39,
    ),
    "oct": fluid(
        "1-Octanol",
        "OctOH",
        None,
        0.824,
        257,
        468.3,
        71100,
        None,
        0.40,
        hf=-426600,
        formula={"C": 8, "H": 18, "O": 1},
        gate_kg=2.97,
    ),
    "b100": fluid(
        "Waste-oil biodiesel",
        "B100",
        "Biodiesel",
        0.88,
        288.15,
        620,
        95000,
        11.2,
        0.75,
        "Diesel",
    ),
    "ai95": fluid(
        "AI-95 gasoline",
        "AI-95",
        "C8H18(L),isooct",
        0.745,
        165.8,
        372.4,
        vapor_gap("C8H18,isooctane", "C8H18(L),isooct"),
        100.6,
        1,
    ),
    "diesel": fluid(
        "Road diesel",
        "Diesel",
        "Jet-A(L)",
        0.835,
        250,
        490,
        vapor_gap("Jet-A(g)", "Jet-A(L)"),
        105.76,
        1,
        "Diesel",
    ),
}
for key, stock in STOCKS.items():
    route = PROPERTIES[key]
    stock["synthesisMjKg"] = route.other_mj + 3.6 * GRID_PRIMARY * route.kwh
    # Solar origin is attributable only for the declared crop route and treatment water.
    stock["solarRoute"] = {"eth": "crop", "water": "treatment"}.get(key)

REFERENCES = ("ai95", "diesel")
FAMILIES = [("eth", "ipa", "water"), ("eth", "dmc"), ("b100",), ("oct",)]
# Neutral reverse-aggregate point in ACS Central Science, DOI 10.1021/acscentsci.6b00116.
MICROEMULSION = {"eth": 30, "oct": 25, "water": 45}
VEHICLES = {
    "Sedan": [1500, 0.62, 0.010],
    "SUV": [2200, 0.91, 0.012],
    "Heavy Truck": [18000, 5.8, 0.0065],
}
MODEL = dict(
    version="2.0.0",
    solar=dict(
        crop=CROP_LIGHT_EFFICIENCY, recovery=ETHANOL_RECOVERY, process=SOLAR_PROCESS_EFFICIENCY
    ),
    cea=CEA,
    nasa=NASA7,
    stocks=STOCKS,
    laminarMps={k: v[2] for k, v in QUALITY.items()},
    elements=ELEMENTS,
    families=FAMILIES,
    microemulsion=MICROEMULSION,
    refs=REFERENCES,
    vehicles=VEHICLES,
    weights={"C": 12.0107, "H": 1.00794, "O": 15.9994, "N": 14.0067},
    abundance=PPM,
    speeds=[90, 110],
)
