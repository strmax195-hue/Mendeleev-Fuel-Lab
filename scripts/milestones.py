"""Reconcile the committed record ledger with open and closed milestone issues."""

import json
import os
import subprocess
import sys
from pathlib import Path

from engine.stage2_publish import block


def gh(*args, data=None):
    p = subprocess.run(
        ["gh", "api", *args],
        input=json.dumps(data) if data else None,
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(p.stdout)


def all_items(endpoint):
    page = 1
    while True:
        items = gh(f"{endpoint}&per_page=100&page={page}")
        yield from items
        if len(items) < 100:
            return
        page += 1


def issue_certificate(record, repo, dossier):
    gate, road = record["gate"], record["road"]
    return (
        "### Stage 2 survival certificate\n\n"
        f"**{gate['status'].upper()}** over −35 to +50 °C. Stock material verdict "
        f"**{record['screen']['retrofit']['stock']}**. Wheel EROI is {road['eroi']:.3f} "
        f"and delivered fuel costs ${road['wtwUsd100']:.2f}/100 km at +15 °C.\n\n"
        + (", ".join(gate["failures"]) or "No modeled gates failed")
        + ".\n\n"
        f"Stage 2 model `{record['model'][:16]}`. "
        f"[Review the computational certificate, assumptions and reproduction command]"
        f"(https://github.com/{repo}/blob/lab-data/{dossier}#stage-2-survival-certificate)."
    )


def reconcile(state, repo, certificates=None):
    if not state["records"]:
        return
    issues = all_items(f"repos/{repo}/issues?state=all")
    created = {
        issue["body"].splitlines()[0]: issue
        for issue in issues
        if issue.get("body") and "pull_request" not in issue
    }
    rows = {r["id"]: r for r in state["results"]}
    milestone = None
    for e in state["records"]:
        marker = f'<!-- fuel-lab {state["model"]} {e["kind"]} {e["id"]} -->'
        cert = (
            issue_certificate(certificates[e["id"]], repo, e["dossier"])
            if certificates is not None
            else None
        )
        if marker in created:
            existing = created[marker]
            if cert:
                updated = block(existing["body"], cert)
                if updated.rstrip() != existing["body"].rstrip():
                    gh(
                        f"repos/{repo}/issues/{existing['number']}",
                        "--method",
                        "PATCH",
                        "--input",
                        "-",
                        data={"body": updated},
                    )
            continue
        if milestone is None:
            title = f'Liquid survey · {state["model"]}'
            milestones = all_items(f"repos/{repo}/milestones?state=all")
            milestone = next((m["number"] for m in milestones if m["title"] == title), None)
            if milestone is None:
                milestone = gh(f"repos/{repo}/milestones", "--input", "-", data={"title": title})[
                    "number"
                ]
        r = rows[e["id"]]
        title = (
            "Zero-tailpipe-carbon range record"
            if e["kind"] == "zero-tailpipe"
            else "Eco-affordability and range record"
        )
        body = (
            f'{marker}\nGeneration {e["generation"]} recorded **{r["name"]}**. At 110 km/h, the 50 L sedan '
            f'projects **{r["range"]:.0f} km**, **${r["cost"]:.2f}/100 km** in production cost and '
            f'**{r["climate"]:.1f} g CO₂e/km** under the documented pathway assumptions. '
            f'The Eco-Affordability Index is **{r["index"]:.1f}/100**.\n\n'
            f'[Review the balance, P–V data and reproduction command](https://github.com/{repo}/blob/lab-data/{e["dossier"]}).'
        )
        if cert:
            body = block(body, cert)
        created[marker] = gh(
            f"repos/{repo}/issues",
            "--input",
            "-",
            data={"title": f"{title} · {r['name']}", "body": body, "milestone": milestone},
        )


if __name__ == "__main__":
    checkpoint = Path(sys.argv[1])
    state = json.loads(checkpoint.read_text())
    certificates = {
        e["id"]: json.loads((checkpoint.parent / "weather" / (e["id"] + ".json")).read_text())
        for e in state["records"]
    }
    reconcile(state, os.environ["GITHUB_REPOSITORY"], certificates)
