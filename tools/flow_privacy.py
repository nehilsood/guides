"""Refuse Résumé Mastery chart text that only the private material says.

    python3 flow_privacy.py <resume-mastery folder>
    python3 flow_privacy.py --selftest

A chart is published twice, in its chapter and on the collected sheet with every
ask answer open. A chapter's private blocks (<div class="ledger">, <div class="ask">
and the ledger note) are stripped before publishing, and LEDGER.md and NOTES.md are
never published at all. A chart that repeats their wording would publish what they
hide, and check.py only catches the word "ledger". So any run of five words in a
spec's title or quoted text that appears in that private material, but nowhere in
the chapter's public text, fails here, and so does the word "ledger".

Reads the workspace only; run it before syncing.
"""
from __future__ import annotations

import html
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check  # noqa: E402  drop_divs, PRIVATE_DIVS, PRIVATE_NOTE

RUN = 5
PRIVATE_FILES = ("LEDGER.md", "NOTES.md")
CHART = re.compile(r"<!-- flowchart:start.*?<!-- flowchart:end -->", re.S)
QUOTED = re.compile(r'"([^"]+)"')
TITLE = re.compile(r"^title\s+(.*)$", re.M)


def words(text: str) -> list[str]:
    text = html.unescape(re.sub(r"<[^>]+>", " ", text)).lower().replace("’", "'")
    return re.findall(r"[a-z0-9%.×']+", text)


def runs(text: str) -> set[str]:
    ws = words(text)
    return {" ".join(ws[i:i + RUN]) for i in range(len(ws) - RUN + 1)}


def leaks(workspace: Path) -> list[str]:
    extra = runs(" ".join((workspace / f).read_text(encoding="utf-8")
                          for f in PRIVATE_FILES if (workspace / f).is_file()))
    problems = []
    for spec in sorted((workspace / "flows").glob("*.flow")):
        source = spec.read_text(encoding="utf-8")
        where = f"resume-mastery/flows/{spec.name}"
        if re.search(r"ledger", source, re.I):
            problems.append(f"{where}: says \"ledger\"")
        chapters = sorted((workspace / "lessons").glob(f"{spec.stem}-*.html"))
        if not chapters:
            problems.append(f"{where}: no chapter lessons/{spec.stem}-*.html to check it against")
            continue
        page = CHART.sub("", chapters[0].read_text(encoding="utf-8"))
        public = check.drop_divs(check.drop_divs(page, check.PRIVATE_DIVS), check.PRIVATE_NOTE)
        chart = runs(" ".join(QUOTED.findall(source) + TITLE.findall(source)))
        private = (chart & (runs(page) | extra)) - runs(public)
        problems += [f"{where}: \"{r}\" is said only in private material" for r in sorted(private)]
    return problems


def selftest() -> int:
    chapter = ('<p>The gateway streams tokens to the browser as they arrive.</p>\n'
               '<div class="ledger"><p>Honestly the retry path was never load tested at all.</p></div>\n')
    cases = [
        ("public wording", 'title Gateway\nstep a "The gateway streams tokens to the browser."\n', "", 0),
        ("private div wording", 'step a "The retry path was never load tested."\n', "", 1),
        ("private wording in the title", 'title The retry path was never load tested\n', "", 1),
        ("LEDGER.md wording", 'step a "Fallback only fires after three slow calls."\n',
         "The fallback only fires after three slow calls.", 1),
        ("the word ledger", '# from the ledger\nstep a "Short."\n', "", 1),
    ]
    failed = 0
    for name, spec, ledger_md, want in cases:
        with tempfile.TemporaryDirectory() as tmp:
            ws = Path(tmp)
            (ws / "flows").mkdir()
            (ws / "lessons").mkdir()
            (ws / "lessons" / "0001-x.html").write_text(chapter, encoding="utf-8")
            (ws / "flows" / "0001.flow").write_text(spec, encoding="utf-8")
            if ledger_md:
                (ws / "LEDGER.md").write_text(ledger_md, encoding="utf-8")
            got = len(leaks(ws))
        if (got > 0) != (want > 0):
            failed += 1
            print(f"FAIL {name}: {got} problem(s), wanted {'some' if want else 'none'}")
    print(f"selftest: {len(cases) - failed} passed, {failed} failed")
    return 1 if failed else 0


def main() -> int:
    if sys.argv[1:] == ["--selftest"]:
        return selftest()
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    problems = leaks(Path(sys.argv[1]).resolve())
    for p in problems:
        print(f"  {p}", file=sys.stderr)
    if problems:
        print(f"flow privacy: {len(problems)} problem(s); nothing will be published", file=sys.stderr)
        return 1
    print("flow privacy: no chart repeats private wording")
    return 0


if __name__ == "__main__":
    sys.exit(main())
