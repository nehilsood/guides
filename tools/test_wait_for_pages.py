"""wait_for_pages.sh against a fake gh that reports one Actions run state."""
import os
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "wait_for_pages.sh"


def wait(tmp_path, state, tries="3"):
    gh = tmp_path / "gh"
    gh.write_text(f'#!/bin/sh\n[ "$1" = auth ] && echo token && exit 0\necho "{state}"\n')
    gh.chmod(0o755)
    env = dict(os.environ, PATH=f"{tmp_path}:{os.environ['PATH']}", PAGES_WAIT_TRIES=tries, PAGES_WAIT_SECONDS="0")
    return subprocess.run([str(SCRIPT), "nehilsood", "guides", "abc1234def"], capture_output=True, text=True, env=env)


def test_a_finished_deploy_says_live(tmp_path):
    r = wait(tmp_path, "completed success")
    assert r.returncode == 0 and "Live at https://nehilsood.github.io/guides/" in r.stdout


def test_a_failed_deploy_prints_the_fresh_build_command(tmp_path):
    r = wait(tmp_path, "completed failure")
    assert r.returncode == 1 and "failed" in r.stdout and "gh api -X POST repos/nehilsood/guides/pages/builds" in r.stdout


def test_a_stuck_deploy_gives_up_with_the_same_command(tmp_path):
    r = wait(tmp_path, "queued null", tries="2")
    assert r.returncode == 1 and "still not done" in r.stdout and "pages/builds" in r.stdout
