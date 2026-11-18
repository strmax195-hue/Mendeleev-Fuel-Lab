"""Exercise real Git orphan bootstrap and fast-forward continuation without GitHub."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from engine.fuel_simulator import ROOT


@unittest.skipUnless((ROOT / ".git").exists(), "The publication test needs a Git checkout")
class Publication(unittest.TestCase):
    def test_data_branch_has_its_own_root_and_resumes(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            checkout, origin = work / "checkout", work / "mirror.git"

            def git(*args, cwd=work):
                return subprocess.check_output(["git", *map(str, args)], cwd=cwd, text=True).strip()

            git("clone", "--quiet", "--no-local", ROOT, checkout)
            git("init", "--quiet", "--bare", origin)
            git("remote", "set-url", "origin", origin, cwd=checkout)
            git("push", "--quiet", "origin", "HEAD:main", cwd=checkout)
            # Isolate the issue API. This test exercises the actual Git state transitions.
            gh = work / "gh"
            gh.write_text(
                '#!/bin/sh\ncase "$*" in *--input*) echo \'{"number":1}\';; *) echo "[]";; esac\n'
            )
            gh.chmod(0o755)
            env = dict(
                os.environ,
                PATH=str(work) + os.pathsep + os.environ["PATH"],
                LAB_BATCH="1",
                GITHUB_REPOSITORY="example/lab",
            )
            for expected in (1, 2):
                subprocess.run(
                    ["bash", str(ROOT / "scripts/publish.sh")],
                    cwd=checkout,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True,
                )
                state = json.loads(git("show", "lab-data:data/state.json", cwd=origin))
                self.assertEqual(state["tested"], expected)
            self.assertEqual(git("rev-list", "--count", "lab-data", cwd=origin), "2")
            self.assertNotEqual(
                git("rev-list", "--max-parents=0", "lab-data", cwd=origin),
                git("rev-list", "--max-parents=0", "main", cwd=origin),
            )
            tree = git("ls-tree", "--name-only", "lab-data", cwd=origin).splitlines()
            self.assertTrue({"assets", "badges", "data"} <= set(tree))
            self.assertNotIn("engine", tree)
