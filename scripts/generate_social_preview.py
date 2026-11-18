"""Render a 1280 × 640 PNG from the checked-in scientific seed. Requires Pillow."""

import argparse
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.fuel_simulator import simulate


def font(name, size):
    choices = {
        "regular": ["DejaVuSans.ttf", "Arial.ttf"],
        "bold": ["DejaVuSans-Bold.ttf", "Arial Bold.ttf"],
        "serif": ["LiberationSerif-Italic.ttf", "DejaVuSerif-Italic.ttf"],
        "mono": ["DejaVuSansMono.ttf", "Courier New.ttf"],
    }
    for path in choices[name]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def render(dest):
    seed = json.loads(
        (ROOT / "docs/seed.js").read_text().split("=", 1)[1].strip().removesuffix(";")
    )
    gas = simulate([{"ai95": 100}], reference=True, trace=True)[0]
    trace = gas["cycles"]["Otto"]["pv"]
    image = Image.new("RGB", (1280, 640), "#19392d")
    d = ImageDraw.Draw(image)
    cream, lime, muted = "#f5f2df", "#d3eba6", "#b6cebc"

    def words(x, y, value, size, style="regular", color=cream):
        d.text((x, y), value, font=font(style, size), fill=color)

    d.rounded_rectangle((44, 34, 90, 80), 4, fill=lime)
    words(52, 38, "M", 29, "bold", "#19392d")
    words(103, 39, "Mendeleev Fuel Lab", 26, "bold")
    words(48, 122, "AUTOMOTIVE THERMODYNAMICS", 17, "mono", muted)
    words(40, 165, "Liquid fuel", 83, "bold")
    words(44, 247, "observatory.", 99, "serif", lime)
    words(49, 395, "Range, climate and energy return", 28)
    words(49, 435, "in a 50-litre tank.", 28)
    left, top, right, bottom = 725, 175, 1200, 425
    d.rounded_rectangle((683, 121, 1234, 485), 9, fill="#213f32", outline="#5d7b66", width=2)
    words(705, 137, "AI-95  /  OTTO INDICATOR", 15, "mono", lime)
    for i in range(6):
        x = left + (right - left) * i / 5
        d.line((x, top, x, bottom), fill="#486655")
        y = top + (bottom - top) * i / 5
        d.line((left, y, right, y), fill="#486655")
    line = [
        (left + v / 600 * (right - left), bottom - p / 140 * (bottom - top)) for _, v, p, _ in trace
    ]
    d.polygon(line, fill="#445d41")
    d.line(line, fill=lime, width=4)
    words(730, 443, "Volume (cm³)", 15, "mono", muted)
    words(1005, 443, f'{gas["cycles"]["Otto"]["peakBar"]:.1f} bar peak', 15, "mono", muted)
    d.rectangle((0, 532, 1280, 640), fill=cream)
    for x, number, label in [
        (48, "1,000", "catalogue entries"),
        (442, "1 mol%", "composition grid"),
        (882, str(seed["tested"]), "seed evaluations"),
    ]:
        words(x, 546, number, 30, "bold", "#203b2d")
        words(x, 593, label, 15, "mono", "#506153")
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest, "PNG", optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "assets/social-preview.png")
    render(parser.parse_args().output)
