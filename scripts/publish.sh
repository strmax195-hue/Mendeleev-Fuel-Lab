#!/usr/bin/env bash
set -euo pipefail
root=$(git rev-parse --show-toplevel)
output=$(mktemp -d)
trap 'git -C "$root" worktree remove --force "$output" >/dev/null 2>&1 || true' EXIT
ref=$(git ls-remote --heads origin refs/heads/lab-data)
if [[ -n "$ref" ]]; then
  git fetch --quiet --no-tags origin refs/heads/lab-data
  git worktree add --quiet --detach "$output" FETCH_HEAD
else
  git worktree add --quiet --detach "$output" HEAD
  git -C "$output" checkout --quiet --orphan "lab-bootstrap-${GITHUB_RUN_ID:-local}"
  git -C "$output" rm -rq -- .
fi
python3 -m engine.discovery_solver --output "$output" --batch "${LAB_BATCH:-24}"
git -C "$output" add -- data assets badges
if [[ -d "$output/dossiers" ]]; then git -C "$output" add -- dossiers; fi
if ! git -C "$output" diff --cached --quiet; then
  git -C "$output" -c user.name="Fuel Lab Automation" -c user.email="lab@users.noreply.github.com" commit --quiet -m "Publish verified liquid-fuel generation"
  git -C "$output" push --quiet origin HEAD:refs/heads/lab-data
fi
# The committed ledger is reconciled even after a partial issue-publication failure.
python3 -m scripts.milestones "$output/data/state.json"
