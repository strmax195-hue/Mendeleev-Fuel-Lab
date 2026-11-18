"""Build deterministic first-load data and README preview figures."""

import json
from engine.discovery_solver import advance, new_state
from engine.fuel_simulator import ROOT, model_script
from engine.svg_progress import pareto_plot
from engine.svg_dashboard import fuel_map
from engine.stage2_publish import build
from engine.stage3_publish import build as build_calibration
from engine.stage2_survival import canonical


def main():
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
    (ROOT / "assets/mendeleev-fuel.svg").write_text(
        fuel_map(state, report, third), encoding="utf-8"
    )
    (ROOT / "assets/pareto.svg").write_text(pareto_plot(state))


if __name__ == "__main__":
    main()
