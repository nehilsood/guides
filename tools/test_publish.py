"""publish.sh without a publish: a dry run and a build leave this repo as they found it.

Run from the repo root: uv run --with pytest pytest -q tools/ (about a minute: each run checks every workspace).
"""
import subprocess
from pathlib import Path

import pytest

SITE = Path(__file__).resolve().parent.parent


def run(*args):
    return subprocess.run([str(SITE / "publish.sh"), *args], capture_output=True, text=True, stdin=subprocess.DEVNULL)


def status():
    return subprocess.run(["git", "-C", str(SITE), "status", "--porcelain"], capture_output=True, text=True).stdout


@pytest.fixture(autouse=True)
def clean_repo():
    assert status() == "", "commit or set aside local changes first: these tests check the repo is left untouched"
    yield
    assert status() == ""


def test_unknown_option_stops_before_anything():
    r = run("--dry")
    assert r.returncode == 2
    assert "usage" in r.stderr


def test_dry_run_shows_the_diff_and_leaves_the_repo_alone():
    r = run("--dry-run")
    assert r.returncode == 0, r.stderr
    assert "Dry run: nothing committed." in r.stdout


def test_build_writes_the_site_to_a_new_folder(tmp_path):
    out = tmp_path / "site"
    r = run("--build", str(out))
    assert r.returncode == 0, r.stderr
    for page in ["index.html", "sde2-plan/index.html", "system-design-school/lessons/index.html", "interview-prep/index.html", "resume-mastery/lessons/index.html"]:
        assert (out / page).is_file(), page
    assert not (out / ".git").exists()
    assert "check: " in r.stdout and "pages clean" in r.stdout


def test_build_refuses_a_folder_with_files_in_it(tmp_path):
    keep = tmp_path / "notes.txt"
    keep.write_text("mine")
    r = run("--build", str(tmp_path))
    assert r.returncode == 1
    assert "isn't empty" in r.stderr
    assert keep.read_text() == "mine" and len(list(tmp_path.iterdir())) == 1
