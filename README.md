# Study Guides

Interview prep, system design and résumé deep-dives, published as a static site.

| Shelf | Start page |
|---|---|
| Interview Prep | [`interview-prep/index.html`](interview-prep/index.html) |
| System Design School | [`system-design-school/lessons/index.html`](system-design-school/lessons/index.html) |
| Résumé Mastery | [`resume-mastery/lessons/index.html`](resume-mastery/lessons/index.html) |

## Publishing

The pages are written in sibling workspaces under `~/personal` and copied in here. Don't edit
the course folders in this repo by hand; the next publish overwrites them.

```bash
./publish.sh --dry-run          # sync + check into a temporary copy, show the diff; this repo is untouched
./publish.sh --build <folder>   # sync + check into a new or empty folder, to look at the site first
./publish.sh                    # sync + check, show the diff, confirm, commit, push
```

`uv run --with pytest pytest -q tools/` checks that a dry run and a build leave this repo as they found it.

`tools/check.py` runs on every publish. It turns links to private drafts into plain text,
refuses to publish local paths or work email addresses, and fails on any broken relative link.

GitHub Pages serves `main` from the repo root. `.nojekyll` keeps it from processing anything.
