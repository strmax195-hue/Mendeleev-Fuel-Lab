"""Whitelisted liquid feedstocks, phase groups, economic scenarios and map data."""

import json
from pathlib import Path

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
    dict(z=z, symbol=s, name=n, row=r, col=c, ppm=PPM.get(s), role=ROLES.get(s))
    for z, s, n, r, c in json.loads((DATA / "periodic.json").read_text())
]


# density kg/L, melting/normal boiling K, latent heat J/mol and costs in USD/kg.
# See SOURCES.md for phase, pathway, cost and surrogate choices.
def fluid(
    label,
    short,
    source,
    rho,
    melt,
    boil,
    latent,
    price,
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
        price=price,
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
        18.5 * 1.10 * 26.8 / 1000,
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
        0.57,
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
        0.001,
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
        0.845,
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
        7.0,
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
        18.5 * 1.10 * 37.3 / 1000,
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
        12 * 1.10 * 44.3 / 1000,
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
        11 * 1.10 * 43 / 1000,
        105.76,
        1,
        "Diesel",
    ),
}
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
    version="1.0.0",
    cea=CEA,
    nasa=NASA7,
    stocks=STOCKS,
    elements=ELEMENTS,
    families=FAMILIES,
    microemulsion=MICROEMULSION,
    refs=REFERENCES,
    vehicles=VEHICLES,
    weights={"C": 12.0107, "H": 1.00794, "O": 15.9994, "N": 14.0067},
    abundance=PPM,
    speeds=[90, 110],
)
