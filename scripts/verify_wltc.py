"""Extract the 1 Hz Class 3b speed schedule from the official EU legal text."""

import argparse
from decimal import Decimal
from pathlib import Path
import re

DEST = Path(__file__).resolve().parents[1] / "engine/data/wltc_class3b.csv"


def official_csv(html):
    speeds = {}
    for table in (7, 9, 11, 12):
        block = html.split(f">Table A1/{table}</span>", 1)[1].split("</table>", 1)[0]
        cells = re.findall(r'<p class="oj-tbl-txt">\s*([0-9.,]+)\s*</p>', block)
        for stamp, speed in zip(cells[::2], cells[1::2], strict=True):
            t, v = int(stamp), Decimal(speed.replace(",", "."))
            if t in speeds and speeds[t] != v:
                raise ValueError(f"Conflicting phase boundary at {t}")
            speeds[t] = v
    if sorted(speeds) != list(range(1801)):
        raise ValueError("Incomplete Class 3b trace")
    return "second,km_h\n" + "".join(f"{t},{speeds[t]:.1f}\n" for t in range(1801))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("official_xhtml", type=Path)
    a = p.parse_args()
    if official_csv(a.official_xhtml.read_text(encoding="utf-8")) != DEST.read_text(
        encoding="ascii"
    ):
        p.exit(1, "Trace differs from the official tables.\n")
    print("All 1,801 statutory speed points match.")
