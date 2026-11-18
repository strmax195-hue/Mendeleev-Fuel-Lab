"""Build deterministic first-load data and README preview figures."""

from dataclasses import asdict
import json
from engine.discovery_solver import advance, new_state
from engine.fuel_simulator import ROOT, model_script
from engine.svg_progress import pareto_plot
from engine.svg_dashboard import fuel_map
from engine.stage2_publish import build
from engine.stage4_publish import build as build_planetary
from engine.stage3_publish import build as build_calibration
from engine.stage2_survival import canonical
from engine.stage2_inputs import DOSES, PROPERTIES, WEAR_LIMIT
from engine.fuel_quality import QUALITY
from engine.stage3_calibration import ENGINES


def cutaway_inputs():
    return {
        "engines": {key: asdict(engine) for key, engine in ENGINES.items()},
        "quality": QUALITY,
        "wear": {key: stock.wear for key, stock in PROPERTIES.items()},
        "wearLimit": WEAR_LIMIT,
        "doses": DOSES,
    }


def main():
    (ROOT / "docs/cylinder-inputs.js").write_bytes(
        ("globalThis.CYLINDER_INPUTS=" + canonical(cutaway_inputs()) + ";\n").encode("ascii")
    )
    (ROOT / "docs/model.js").write_text(model_script())
    state = new_state()
    advance(state, 24)
    (ROOT / "docs/seed.js").write_text(
        "globalThis.FUEL_SEED=" + json.dumps(state, separators=(",", ":"), allow_nan=False) + ";\n"
    )
    report, rows = build(state)
    (ROOT / "docs/weather-seed.js").write_text(
        "globalThis.FUEL_WEATHER=" + canonical({"report": report, "rows": rows}) + ";\n",
        encoding="ascii",
    )
    third, calibration = build_calibration(state, report, rows.__getitem__)
    (ROOT / "docs/calibration-seed.js").write_bytes(
        (
            "globalThis.FUEL_CALIBRATION="
            + canonical({"report": third, "rows": calibration})
            + ";\n"
        ).encode("ascii")
    )
    fourth, audits = build_planetary(state, third)
    (ROOT / "docs/planetary-seed.js").write_bytes(
        (
            "globalThis.FUEL_PLANETARY=" + canonical({"report": fourth, "rows": audits}) + ";\n"
        ).encode("ascii")
    )
    (ROOT / "assets/mendeleev-fuel.svg").write_text(
        fuel_map(state, report, third, fourth), encoding="utf-8"
    )
    (ROOT / "assets/pareto.svg").write_text(pareto_plot(state))


if __name__ == "__main__":
    main()
