#!/usr/bin/env bash
# Wait for GitHub Pages to deploy a pushed commit, and say whether it is live.
#
#   tools/wait_for_pages.sh <owner> <repo> <sha>
#
# Watches the Actions run for <sha> (the Pages build API can say "building" after the deploy has failed). Exits 0
# once that run succeeds; exits 1 if it fails, or is still not done after about 10 minutes, and prints the command
# that starts a fresh build of the same commit (it fixed a 500 and a stuck re-run on 5 Nov 2026).
set -uo pipefail
owner="$1" repo="$2" sha="$3"
export GH_TOKEN="${GH_TOKEN:-$(gh auth token --user "$owner" 2>/dev/null)}"
rebuild="GH_TOKEN=\$(gh auth token --user $owner) gh api -X POST repos/$owner/$repo/pages/builds"
tries="${PAGES_WAIT_TRIES:-60}"
state=""
for ((i = 1; i <= tries; i++)); do
  state="$(gh api "repos/$owner/$repo/actions/runs?head_sha=$sha" \
    --jq '.workflow_runs[0] | "\(.status) \(.conclusion)"' 2>/dev/null)"
  case "$state" in
    "completed success") echo "Live at https://$owner.github.io/$repo/"; exit 0 ;;
    completed*) printf 'The Pages deploy for %s failed (%s). Start a fresh build of the same commit:\n  %s\n' \
                  "${sha:0:7}" "$state" "$rebuild"; exit 1 ;;
  esac
  sleep "${PAGES_WAIT_SECONDS:-10}"
done
printf 'The Pages deploy for %s is still not done after %s checks (last: %s). If it is stuck, start a fresh build:\n  %s\n' \
  "${sha:0:7}" "$tries" "${state:-no run yet}" "$rebuild"
exit 1
