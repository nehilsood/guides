#!/usr/bin/env bash
# Sync the three guide workspaces into this repo and push it to GitHub Pages.
#
#   ./publish.sh            sync, check, show the diff, ask, commit, push
#   ./publish.sh --dry-run  sync and check only; nothing is committed
#
# Sources are the sibling folders in ~/personal. They are only read, never written.
set -euo pipefail

SITE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(dirname "$SITE")"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

sync() { rsync -a --delete --exclude .DS_Store "$@"; }

echo "check: every guide has a current flowchart in all three workspaces"
for ws in interview-prep system-design-school resume-mastery; do
  python3 "$SRC/$ws/build_flowcharts.py" --check --require-all || {
    echo "flowcharts in $ws are stale or missing; draw any missing flows/NNNN.flow, run python3 build_flowcharts.py there, then publish again" >&2
    exit 1
  }
done
python3 "$SITE/tools/flow_privacy.py" "$SRC/resume-mastery"

echo "sync: interview-prep, system-design-school, resume-mastery"
sync --exclude README.md --exclude docs/ --exclude flows/ --exclude '*.py' --exclude .superpowers/ --exclude .git/ --exclude .gitignore "$SRC/interview-prep/" "$SITE/interview-prep/"
for course in system-design-school resume-mastery; do
  for dir in lessons reference assets; do
    mkdir -p "$SITE/$course"
    sync "$SRC/$course/$dir/" "$SITE/$course/$dir/"
  done
done

python3 "$SITE/tools/check.py" "$SITE"

cd "$SITE"
email="$(git config user.email || true)"
if [[ -z "$email" || "$email" == *@cloudsufi.com ]]; then
  echo "refusing to commit as '${email:-<unset>}': expected the personal identity from ~/.gitconfig-personal" >&2
  exit 1
fi

unstage() { git reset -q 2>/dev/null || git rm -rq --cached . ; }

git add -A
if git diff --cached --quiet; then
  echo "Nothing changed since the last publish."
  exit 0
fi
git diff --cached --stat | tail -25

if (( DRY )); then
  unstage
  echo "Dry run: nothing committed."
  exit 0
fi

read -r -p "Publish these changes as $email? [y/N] " answer
if [[ "$answer" != [yY] ]]; then
  unstage
  echo "Aborted."
  exit 1
fi

git commit -q -m "Publish $(date +%F)"
git push -q origin main

owner="$(git remote get-url origin | sed -E 's#.*github\.com[:/]([^/]+)/.*#\1#')"
echo "Pushed. Live in about a minute at https://$owner.github.io/guides/"
