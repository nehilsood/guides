"""Prepare the synced site copy for publishing.

Run by publish.sh after the rsync. Three passes over the site's HTML:

1. rewrite  - links to private claude.ai artifacts become site links or plain text;
              in Résumé Mastery, the defensibility ledgers and the editorial .ask
              notes (verdicts on the résumé's own wording) are removed
2. guard    - fail on anything that should never be public
3. links    - fail on any local href/src that doesn't resolve to a file

Only the site copy is touched; the source workspaces are never written.
"""

import re
import sys
from pathlib import Path

CONTENT = ["index.html", "interview-prep", "system-design-school", "resume-mastery"]

# Artifacts that have a page on this site. Anything else is unwrapped to text.
ARTIFACT_PAGES = {
    "8eaa49f4-b373-4598-a9db-e914b22446b2": "0001-the-max-iteration-trap.html",
}

BADGE = re.compile(r'<span><a href="https://claude\.ai/[^"]*">published</a></span>')
ARTIFACT_LINK = re.compile(r'<a href="https://claude\.ai/[^"]*?([0-9a-f-]{36})?"[^>]*>(.*?)</a>', re.S)

# Résumé Mastery: the claim audit stays local. Whole blocks go by class or label;
# the guard below fails on any "ledger" left over, so new mentions can't slip through.
PRIVATE_DIVS = re.compile(r'<div class="(?:ledger|ask)"[^>]*>')
PRIVATE_NOTE = re.compile(r'<div class="note">\s*<span class="callout-label">The ledger, and why it is there')
PRIVATE_ENTRY = re.compile(r'[ \t]*<li>(?:(?!</li>).)*?href="\.\./LEDGER\.md".*?</li>\n?', re.S)
PRIVATE_PHRASES = [
    (" And <strong>a defensibility ledger</strong>: what an interviewer can check, "
     "what the code actually shows, and the sentence to say first.", ""),
    (" No repository survives any of it, so every ledger row is a claim you hold the proof for.", ""),
    (" The ledger is not study material at all &#8212; it is the to-do list.", ""),
    ("the trap, the ledger sentences and the redraw checklist", "the trap and the redraw checklist"),
    ("the walk-through, the ledger sentences and the redraw checklist",
     "the walk-through and the redraw checklist"),
    ("go deeper, the 80 ledger sentences, and\n  the diagram checklist", "go deeper, and\n  the diagram checklist"),
    ("reduced to the six things", "reduced to the five things"),
]

# Wording that points at the private copies, which this site replaces.
SITE_PHRASES = [
    (" The guides also live as published pages, linked from each row above, for reading on a phone.", ""),
]

FORBIDDEN = [
    ("claude.ai link", re.compile(r"claude\.ai/")),
    ("local path", re.compile(r"/Users/|file://")),
    ("page without an icon", re.compile(r"\A(?![\s\S]*rel=\"icon\")[\s\S]*<html", re.I)),
    ("work email", re.compile(r"[\w.+-]+@cloudsufi\.com", re.I)),
]
RESUME_FORBIDDEN = ("résumé ledger", re.compile(r"ledger", re.I))

# GitHub Pages serves no /favicon.ico for a project site, so every page asks for one and
# logs a 404. An inline icon answers the request without another file to keep in sync.
ICON = ('<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 '
        'viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%277%27 fill=%27%23243b55%27/%3E'
        '%3Cpath d=%27M9 9h6a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H9zM23 9h-6a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h7z%27 '
        'fill=%27none%27 stroke=%27%23fff%27 stroke-width=%271.6%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E">')
CHARSET = re.compile(r'<meta charset="[^"]*">\n?', re.I)

REF = re.compile(r'(?:href|src)\s*=\s*"([^"]*)"')
EXTERNAL = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|#)", re.I)


def files(site: Path, pattern: str):
    for name in CONTENT:
        root = site / name
        if root.is_file():
            if root.match(pattern):
                yield root
        elif root.is_dir():
            yield from sorted(root.rglob(pattern))


def drop_divs(text: str, opening: re.Pattern) -> str:
    """Remove every <div> whose start tag matches `opening`, nested divs included."""
    while m := opening.search(text):
        depth = 0
        for tag in re.finditer(r"<(/?)div\b[^>]*>", text[m.start():]):
            depth += -1 if tag.group(1) else 1
            if depth == 0:
                end = m.start() + tag.end()
                break
        else:
            raise ValueError(f"unclosed <div> at offset {m.start()}")
        start = text.rfind("\n", 0, m.start()) + 1
        if text[start:m.start()].strip():
            start = m.start()
        if text[end:end + 1] == "\n":
            end += 1
        text = text[:start] + text[end:]
    return text


def is_resume(page: Path) -> bool:
    return "resume-mastery" in page.parts


def rewrite(page: Path) -> bool:
    text = page.read_text(encoding="utf-8")
    new = BADGE.sub("", text)

    def link(m: re.Match) -> str:
        target = ARTIFACT_PAGES.get(m.group(1) or "")
        return f'<a href="{target}">{m.group(2)}</a>' if target else m.group(2)

    new = ARTIFACT_LINK.sub(link, new)
    for old, replacement in SITE_PHRASES:
        new = new.replace(old, replacement)
    if 'rel="icon"' not in new:
        new = CHARSET.sub(lambda m: m.group(0).rstrip("\n") + "\n" + ICON + "\n", new, count=1)
    if is_resume(page):
        new = drop_divs(drop_divs(new, PRIVATE_DIVS), PRIVATE_NOTE)
        new = PRIVATE_ENTRY.sub("", new)
        for old, replacement in PRIVATE_PHRASES:
            new = new.replace(old, replacement)
    if new != text:
        page.write_text(new, encoding="utf-8")
        return True
    return False


def guard(site: Path) -> list[str]:
    problems = []
    for path in files(site, "*"):
        if not path.is_file() or path.suffix not in {".html", ".js", ".css", ".md", ".json", ".svg"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        rules = FORBIDDEN + ([RESUME_FORBIDDEN] if is_resume(path) and path.suffix == ".html" else [])
        for label, pattern in rules:
            for m in pattern.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                problems.append(f"{path.relative_to(site)}:{line}: {label}: {m.group(0)[:60]}")
    return problems


def links(site: Path) -> list[str]:
    problems = []
    for page in files(site, "*.html"):
        text = page.read_text(encoding="utf-8")
        for m in REF.finditer(text):
            ref = m.group(1).strip()
            if not ref or EXTERNAL.match(ref):
                continue
            target = (page.parent / re.split(r"[?#]", ref)[0]).resolve()
            if target.is_dir():
                target = target / "index.html"
            if not target.exists():
                line = text.count("\n", 0, m.start()) + 1
                problems.append(f"{page.relative_to(site)}:{line}: broken link: {ref}")
    return problems


def main() -> int:
    site = Path(sys.argv[1]).resolve()
    changed = [p for p in files(site, "*.html") if rewrite(p)]
    print(f"rewrite: {len(changed)} page(s) rewritten for publishing")

    failures = guard(site) + links(site)
    for f in failures:
        print(f"  {f}", file=sys.stderr)
    if failures:
        print(f"check: {len(failures)} problem(s); nothing will be published", file=sys.stderr)
        return 1
    print(f"check: {sum(1 for _ in files(site, '*.html'))} pages clean, all local links resolve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
