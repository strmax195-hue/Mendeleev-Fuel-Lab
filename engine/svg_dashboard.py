"""Accessible SVG primitives, adaptive plotting colours and a periodic fuel map."""

from html import escape
from .elements_db import ELEMENTS

STYLE = """svg{--bg:#f7f7ed;--fg:#18332b;--line:#aebbb0;--soft:#dfe6da;--accent:#b44624;--hot:#ffc398;--live:#b7e17b}
@media(prefers-color-scheme:dark){svg{--bg:#172822;--fg:#f0f3df;--line:#597269;--soft:#263c32;--accent:#ff9869;--hot:#693b2c;--live:#647f40}}
.bg{fill:var(--bg)}.fg,text{fill:var(--fg)}.soft{fill:var(--soft)}.grid{stroke:var(--line);fill:none}
.accent{fill:var(--accent)}.hot{fill:var(--hot)}.live{fill:var(--live)}
text{font-family:Arial,sans-serif}.mono{font-family:monospace}.bold{font-weight:700}"""


def txt(x, y, value, size=14, cls="", extra=""):
    return f'<text x="{x}" y="{y}" font-size="{size}" class="{cls}" {extra}>{escape(str(value))}</text>'


def rect(x, y, w, h, cls, rx=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" class="{cls}"/>'


def frame(title, desc, body, w, h):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" '
        f'aria-labelledby="ttl desc"><title id="ttl">{escape(title)}</title><desc id="desc">'
        f'{escape(desc)}</desc><style>{STYLE}</style>{rect(0,0,w,h,"bg",12)}{"".join(body)}</svg>\n'
    )


def fuel_map(state, stage2=None, stage3=None, stage4=None):
    pct = 100 * state["tested"] / state["total"]
    b = [
        txt(26, 33, "MENDELEEV  /  FUEL LAB", 16, "mono bold"),
        txt(26, 61, "Periodic fuel map", 25, "bold"),
        txt(764, 54, f"{pct:.1f}%", 30, "mono bold", 'text-anchor="end"'),
        txt(764, 76, "Periodic Space Explored", 13, "", 'text-anchor="end"'),
        rect(26, 91, 738, 10, "soft", 5),
        rect(26, 91, 738 * pct / 100, 10, "accent", 5),
    ]
    for e in ELEMENTS:
        x, y = 26 + (e["col"] - 1) * 41, 117 + (e["row"] - 1) * 28
        tested = sum(bool(r["atoms"].get(e["symbol"])) for r in state["results"])
        fill = "live" if tested else "hot" if e["ppm"] is not None else "soft"
        b.extend(
            [
                f'<g><title>{escape(e["name"])} · {tested} tested fuel compositions</title>',
                rect(x, y, 38, 25, fill, 2),
                txt(x + 19, y + 17, e["symbol"], 12, "mono", 'text-anchor="middle"'),
                "</g>",
            ]
        )
    b.extend(
        [
            txt(
                26,
                392,
                f'{state["tested"]:,} / {state["total"]:,} liquid candidates',
                15,
                "mono bold",
            ),
            txt(755, 392, f'Generation {state["generation"]}', 14, "mono", 'text-anchor="end"'),
        ]
    )
    if state["results"]:
        r = max(state["results"], key=lambda x: x["index"])
        b.append(
            txt(
                26,
                423,
                f'Index leader   {r["name"]}   ·   {r["range"]:.0f} km   ·   {r["netEnergyReturn"]:.2f}× energy return   ·   {r["climate"]:.0f} g CO₂e/km',
                14,
            )
        )
    if stage2 is not None:
        cold = stage2.get("coldScreen")
        count = len(stage2["nominated"])
        passed = stage2["funnel"]["passed"]
        b.extend(
            [
                txt(26, 465, "Stage 1 · Thermodynamic synergy", 17, "bold"),
                txt(
                    764,
                    465,
                    f'{state["tested"]:,} / {state["total"]:,} tested',
                    14,
                    "mono",
                    'text-anchor="end"',
                ),
                rect(26, 478, 738, 7, "soft", 3),
                rect(26, 478, 738 * pct / 100, 7, "accent", 3),
                txt(26, 518, "Stage 2 · Weather and material survival", 17, "bold"),
                txt(764, 518, f"{passed} / {count} model passes", 14, "mono", 'text-anchor="end"'),
                rect(26, 531, 738, 7, "soft", 3),
                rect(26, 531, 738 * passed / max(1, count), 7, "accent", 3),
                txt(
                    26,
                    562,
                    (
                        f'−35 °C  ·  Ambient SI {cold["aboveLeanLimit"]}/{cold["evaluatedSI"]}  ·  GDI charge {cold["gdiFeasible"]}/{cold["evaluatedSI"]}  ·  Glow CI {cold["glowFeasible"]}/{cold["ciCandidates"]} ready'
                        if cold and "gdiFeasible" in cold
                        else f'−35 to +50 °C  ·  {count} shortlisted  ·  {stage2["funnel"]["review"]} in review'
                    ),
                    13,
                    "mono",
                ),
            ]
        )
    if stage3 is not None:
        n = len(stage3["eligible"])
        gold = len(stage3["champions"])
        b.extend(
            [
                txt(26, 603, "Stage 3 · Knock, ECU and WLTC Class 3b", 17, "bold"),
                txt(764, 603, f"{gold} golden candidates", 14, "mono", 'text-anchor="end"'),
                rect(26, 616, 738, 7, "soft", 3),
                rect(26, 616, 738 * gold / max(1, n), 7, "accent", 3),
                txt(
                    26,
                    649,
                    f"{n} Stage 2 survivors  ·  3 architectures  ·  Computational qualification",
                    13,
                    "mono",
                ),
            ]
        )
    if stage4 is not None:
        count, passed = len(stage4["finalists"]), len(stage4["verified"])
        b.extend(
            [
                txt(26, 687, "Stage 4 · Planetary abundance and biosphere", 17, "bold"),
                txt(764, 687, f"{passed} / {count} verified", 14, "mono", 'text-anchor="end"'),
                rect(26, 700, 738, 7, "soft", 3),
                rect(26, 700, 738 * passed / max(1, count), 7, "accent", 3),
                txt(
                    26,
                    733,
                    f"1 billion vehicles  ·  Annual resource flows  ·  {len(stage4['peerReproduced'])} peer-reproduced runs",
                    13,
                    "mono",
                ),
            ]
        )
    return frame(
        "Periodic Table Fuel Map",
        "Thermodynamic catalogue coverage and shortlisted engineering survival screens.",
        b,
        790,
        (
            753
            if stage4 is not None
            else 669 if stage3 is not None else 582 if stage2 is not None else 442
        ),
    )
