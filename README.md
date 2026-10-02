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
./publish.sh --dry-run   # sync + check, nothing committed
./publish.sh             # sync + check, show the diff, confirm, commit, push
```

`tools/check.py` runs on every publish. It turns links to private drafts into plain text,
refuses to publish local paths or work email addresses, and fails on any broken relative link.

GitHub Pages serves `main` from the repo root. `.nojekyll` keeps it from processing anything.
