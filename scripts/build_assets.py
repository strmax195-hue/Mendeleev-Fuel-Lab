"""Build deterministic first-load data and README preview figures."""

import json
from engine.discovery_solver import advance, new_state
from engine.fuel_simulator import ROOT, model_script
from engine.svg_progress import pareto_plot
from engine.svg_dashboard import fuel_map


def main():
    (ROOT / "docs/model.js").write_text(model_script())
    state = new_state()
    advance(state, 24)
    (ROOT / "docs/seed.js").write_text(
        "globalThis.FUEL_SEED=" + json.dumps(state, separators=(",", ":"), allow_nan=False) + ";\n"
    )
    (ROOT / "assets/mendeleev-fuel.svg").write_text(fuel_map(state))
    (ROOT / "assets/pareto.svg").write_text(pareto_plot(state))


if __name__ == "__main__":
    main()
