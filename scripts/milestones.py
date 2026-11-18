"""Reconcile the committed record ledger with open and closed milestone issues."""

import json
import os
import subprocess
import sys
from pathlib import Path


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


def reconcile(state, repo):
    if not state["records"]:
        return
    issues = all_items(f"repos/{repo}/issues?state=all")
    created = {
        issue["body"].splitlines()[0]
        for issue in issues
        if issue.get("body") and "pull_request" not in issue
    }
    rows = {r["id"]: r for r in state["results"]}
    milestone = None
    for e in state["records"]:
        marker = f'<!-- fuel-lab {state["model"]} {e["kind"]} {e["id"]} -->'
        if marker in created:
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
        gh(
            f"repos/{repo}/issues",
            "--input",
            "-",
            data={"title": f"{title} · {r['name']}", "body": body, "milestone": milestone},
        )
        created.add(marker)


if __name__ == "__main__":
    reconcile(json.loads(Path(sys.argv[1]).read_text()), os.environ["GITHUB_REPOSITORY"])
