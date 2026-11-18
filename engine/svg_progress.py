"""Static artifacts on the generated branch, including Shields endpoint JSON."""

import json
from .svg_dashboard import frame, txt, fuel_map


def pareto_plot(state):
    rows = state["results"] + state["baselines"]
    xmax = max((r["cost"] for r in rows), default=1) * 1.1
    ymax = max((r["range"] for r in rows), default=1) * 1.12
    b = [
        txt(26, 35, "Range and production cost", 24, "bold"),
        txt(26, 58, "50 L  /  sedan  /  110 km/h", 14, "mono"),
    ]
    for i in range(5):
        y = 224 - 134 * i / 4
        b.extend(
            [
                f'<path d="M72 {y} H744" class="grid" opacity=".45"/>',
                txt(61, y + 4, f"{ymax*i/4:.0f}", 12, "mono", 'text-anchor="end"'),
            ]
        )
        x = 72 + 672 * i / 4
        b.append(txt(x, 245, f"{xmax*i/4:.1f}", 12, "mono", 'text-anchor="middle"'))
    b.extend(
        [
            txt(26, 83, "km", 12, "mono"),
            txt(402, 269, "Production cost (USD / 100 km)", 13, "", 'text-anchor="middle"'),
        ]
    )
    for r in sorted(rows, key=lambda r: r["id"] in state["frontier"]):
        x = 72 + 672 * r["cost"] / xmax
        y = 224 - 134 * r["range"] / ymax
        cls = (
            "accent"
            if r["id"] in state["frontier"]
            else "fg" if r in state["baselines"] else "grid"
        )
        b.append(
            f'<circle cx="{x:.2f}" cy="{y:.2f}" r="4" class="{cls}"><title>{r["name"]} · {r["climate"]:.1f} g CO₂e/km</title></circle>'
        )
    b.append(
        txt(
            26,
            293,
            "Orange: three-objective frontier   ·   Dark: road references   ·   Open: other tested blends",
            13,
        )
    )
    return frame(
        "Pareto frontier",
        "Maximise range, minimise production cost and lifecycle greenhouse gas emissions.",
        b,
        790,
        312,
    )


def write_products(output, state):
    from .stage2_publish import publish

    from .stage3_publish import publish as publish_calibration

    stage2 = publish(output, state)
    stage3 = publish_calibration(output, state, stage2)
    assets = output / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    (assets / "mendeleev-fuel.svg").write_text(fuel_map(state, stage2, stage3), encoding="utf-8")
    (assets / "pareto.svg").write_text(pareto_plot(state), encoding="utf-8")
    badges = output / "badges"
    badges.mkdir(exist_ok=True)
    for name, label, msg in [
        (
            "survival",
            "Stage 2 model passes",
            f'{stage2["funnel"]["passed"]}/{len(stage2["nominated"])}',
        ),
        ("calibration", "Stage 3 model champions", str(len(stage3["champions"]))),
        ("coverage", "survey", f'{100*state["tested"]/state["total"]:.1f}%'),
        ("generation", "generation", str(state["generation"])),
        ("frontier", "Pareto frontier", str(len(state["frontier"]))),
    ]:
        (badges / (name + ".json")).write_text(
            json.dumps(
                dict(schemaVersion=1, label=label, message=msg, color="37684d", cacheSeconds=300)
            )
            + "\n"
        )
