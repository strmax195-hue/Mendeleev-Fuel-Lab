"""Parse an external researcher's exact IssueOps receipt and replay trusted local physics."""

import argparse
import json
import os
from pathlib import Path
import subprocess
from engine.stage4_publish import COMMAND, verify_claim
from .milestones import all_items

LABEL = "[PEER-REPRODUCED]"


def external(issue):
    return (
        "pull_request" not in issue
        and (issue.get("user") or {}).get("type") == "User"
        and issue.get("author_association")
        in {"NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER"}
    )


def collect(repo):
    # Keep only exact numerical receipts. No GitHub account fields enter the data branch.
    from urllib.parse import quote

    return [
        i["body"].strip()
        for i in all_items(f"repos/{repo}/issues?state=all&labels={quote(LABEL)}")
        if external(i)
        and isinstance(i.get("body"), str)
        and len(i["body"]) <= 256
        and COMMAND.fullmatch(i["body"].strip())
    ]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--collect", type=Path)
    mode.add_argument("--checkpoint", type=Path)
    args = p.parse_args()
    repo = os.environ["GITHUB_REPOSITORY"]
    if args.collect:
        args.collect.write_text(json.dumps(collect(repo)), encoding="utf-8")
        return
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_bytes())
    item = event["issue"]
    number = item["number"]
    if type(number) is not int or number <= 0:
        raise ValueError("Invalid issue number")
    awarded = any(label["name"] == LABEL for label in item.get("labels", []))
    valid = external(item) and verify_claim(
        item.get("body"), json.loads(args.checkpoint.read_bytes())
    )
    if not valid:
        if awarded:
            from urllib.parse import quote

            subprocess.run(
                [
                    "gh",
                    "api",
                    "--method",
                    "DELETE",
                    f"repos/{repo}/issues/{number}/labels/{quote(LABEL)}",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
        print("No matching current finalist and physics replay.")
        return
    if item["user"]["id"] != event["sender"]["id"] or awarded:
        return
    subprocess.run(
        [
            "gh",
            "label",
            "create",
            LABEL,
            "--repo",
            repo,
            "--color",
            "37684D",
            "--description",
            "External numerical replay of a published planetary finalist",
            "--force",
        ],
        check=True,
    )
    subprocess.run(
        ["gh", "api", f"repos/{repo}/issues/{number}/labels", "--input", "-"],
        input=json.dumps({"labels": [LABEL]}),
        text=True,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    print("Independent physics receipt verified. The next survey run publishes the badge.")


if __name__ == "__main__":
    main()
