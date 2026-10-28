#!/usr/bin/env bash
# Sync the four guide workspaces into this repo and push it to GitHub Pages.
#
#   ./publish.sh                  sync, check, show the diff, ask, commit, push
#   ./publish.sh --dry-run        sync and check into a temporary copy, show the diff; this repo is left as it is
#   ./publish.sh --build <folder> sync and check into <folder> (new or empty), to look at the site before publishing
#
# Sources are the sibling folders in ~/personal/study-guides. They are only read, never written.
set -euo pipefail

SITE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(dirname "$SITE")"
MODE=publish
case "${1:-}" in
  "") ;;
  --dry-run) MODE=dry ;;
  --build) MODE=build; OUT="${2:?usage: publish.sh --build <folder>}" ;;
  *) echo "usage: publish.sh [--dry-run | --build <folder>]" >&2; exit 2 ;;
esac

# Where the site is assembled: this repo for a publish, otherwise a copy of its last commit.
DEST="$SITE"
if [[ $MODE == build ]]; then
  if [[ -e "$OUT" && -n "$(ls -A "$OUT")" ]]; then
    echo "refusing to build into $OUT: it isn't empty" >&2
    exit 1
  fi
  DEST="$OUT"
elif [[ $MODE == dry ]]; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  DEST="$TMP/site"
fi
if [[ $DEST != "$SITE" ]]; then
  mkdir -p "$DEST"
  git -C "$SITE" archive HEAD | tar -x -C "$DEST"
fi

sync() { rsync -a --delete --exclude .DS_Store "$@"; }

echo "check: every guide has a current flowchart in all three workspaces"
for ws in interview-prep system-design-school resume-mastery; do
  python3 "$SRC/$ws/build_flowcharts.py" --check --require-all || {
    echo "flowcharts in $ws are stale or missing; draw any missing flows/NNNN.flow, run python3 build_flowcharts.py there, then publish again" >&2
    exit 1
  }
done
python3 "$SITE/tools/flow_privacy.py" "$SRC/resume-mastery"

echo "check: sde2-plan card rules and tests"
(cd "$SRC/sde2-plan" && .githooks/pre-commit) || {
  echo "sde2-plan checks failed; fix them there, then publish again" >&2
  exit 1
}

echo "sync: interview-prep, system-design-school, resume-mastery"
sync --exclude README.md --exclude docs/ --exclude flows/ --exclude '*.py' --exclude .superpowers/ --exclude .git/ --exclude .gitignore "$SRC/interview-prep/" "$DEST/interview-prep/"
for course in system-design-school resume-mastery; do
  for dir in lessons reference assets; do
    mkdir -p "$DEST/$course"
    sync "$SRC/$course/$dir/" "$DEST/$course/$dir/"
  done
done

echo "sync: sde2-plan"
sync "$SRC/sde2-plan/site/" "$DEST/sde2-plan/"

python3 "$SITE/tools/check.py" "$DEST"

if [[ $MODE == build ]]; then
  echo "Built $DEST"
  exit 0
fi

# A dry run compares the copy with the last publish through a scratch index, so this repo's index and files stay as
# they are.
if [[ $MODE == dry ]]; then
  export GIT_INDEX_FILE="$TMP/index"
  git -C "$SITE" --work-tree="$DEST" add -A
  if git -C "$SITE" diff --cached --quiet; then
    echo "Nothing changed since the last publish."
  else
    git -C "$SITE" diff --cached --stat | tail -25
    echo "Dry run: nothing committed."
  fi
  unset GIT_INDEX_FILE
  [[ -z "$(git -C "$SITE" status --porcelain)" ]] || echo "Note: this repo has uncommitted changes; the dry run left them out, a publish would include them."
  exit 0
fi

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
