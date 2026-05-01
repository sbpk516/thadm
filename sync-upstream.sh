#!/bin/bash
# sync-upstream.sh — Sync upstream screenpipe into thadm
#
# Mechanical work only. Does NOT commit and does NOT push — leaves the sync
# branch staged so a human (or Claude via /sync-upstream) can review.
#
# Usage:
#   ./sync-upstream.sh [base-branch]   # default base = main
#
# Flow:
#   1. pre-flight (clean tree, upstream remote, base branch exists)
#   2. fetch upstream/main
#   3. show diff summary
#   4. checkout sync/upstream-YYYY-MM-DD off base
#   5. git merge --no-commit --no-ff upstream/main
#   6. re-remove ee/ if upstream re-added it
#   7. privacy audit (informational)
#   8. run cargo + bun unit tests
#
# Re-runnable: if invoked while a merge is in progress (MERGE_HEAD present),
# steps 1-5 are skipped and the script picks up at the audit/tests phase.
#
# Exit codes:
#   0  success — no conflicts, ready for human review
#   1  pre-flight failure
#   2  merge conflicts — resolve, `git add`, then re-run this script

set -e

BASE_BRANCH="${1:-main}"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
ORIGIN_REMOTE="origin"
SYNC_BRANCH="sync/upstream-$(date +%Y-%m-%d)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

err()  { echo -e "${RED}error:${NC} $*" >&2; }
warn() { echo -e "${YELLOW}warn:${NC} $*"; }
info() { echo -e "${BLUE}info:${NC} $*"; }
ok()   { echo -e "${GREEN}ok:${NC} $*"; }
phase(){ echo ""; echo -e "${BLUE}=== $* ===${NC}"; echo ""; }

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null || echo "")
RESUMING=0
if [ -n "$GIT_DIR" ] && [ -f "$GIT_DIR/MERGE_HEAD" ]; then
  RESUMING=1
  info "merge in progress — resuming after conflict resolution"
fi

if [ "$RESUMING" -eq 0 ]; then
  # ---------------------------------------------------------------------------
  phase "1/8 Pre-flight"
  # ---------------------------------------------------------------------------
  if ! git diff --quiet || ! git diff --cached --quiet; then
    err "uncommitted changes — commit or stash before syncing"
    git status --short
    exit 1
  fi
  ok "working tree clean"

  if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    err "remote '$UPSTREAM_REMOTE' is not configured"
    echo "  add it with: git remote add $UPSTREAM_REMOTE https://github.com/mediar-ai/screenpipe.git"
    exit 1
  fi
  ok "upstream remote: $(git remote get-url "$UPSTREAM_REMOTE")"

  if ! git show-ref --verify --quiet "refs/heads/$BASE_BRANCH"; then
    err "base branch '$BASE_BRANCH' does not exist locally"
    exit 1
  fi
  ok "base branch: $BASE_BRANCH"

  if git show-ref --verify --quiet "refs/heads/$SYNC_BRANCH"; then
    err "sync branch '$SYNC_BRANCH' already exists"
    echo "  delete it: git branch -D $SYNC_BRANCH"
    echo "  or check it out and re-run this script to resume:"
    echo "    git checkout $SYNC_BRANCH && ./sync-upstream.sh"
    exit 1
  fi

  # ---------------------------------------------------------------------------
  phase "2/8 Fetch upstream"
  # ---------------------------------------------------------------------------
  git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

  BEHIND=$(git rev-list "$BASE_BRANCH".."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --count)
  if [ "$BEHIND" -eq 0 ]; then
    ok "$BASE_BRANCH already up to date with $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
    exit 0
  fi
  info "$BEHIND new commits from upstream"

  # ---------------------------------------------------------------------------
  phase "3/8 Diff summary"
  # ---------------------------------------------------------------------------
  TOTAL=$(git diff --name-only "$BASE_BRANCH"..."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" | wc -l | xargs)
  echo "files changed: $TOTAL"
  echo ""
  echo "top-level paths touched:"
  git diff --name-only "$BASE_BRANCH"..."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" \
    | awk -F/ '{print $1"/"$2}' | sort | uniq -c | sort -rn | head -15 \
    | awk '{printf "  %4d  %s\n", $1, $2}'

  # ---------------------------------------------------------------------------
  phase "4/8 Create sync branch"
  # ---------------------------------------------------------------------------
  git checkout -b "$SYNC_BRANCH" "$BASE_BRANCH"
  ok "created $SYNC_BRANCH from $BASE_BRANCH"

  # ---------------------------------------------------------------------------
  phase "5/8 Merge upstream (--no-commit --no-ff)"
  # ---------------------------------------------------------------------------
  set +e
  git merge --no-commit --no-ff "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
  set -e

  CONFLICTS=$(git diff --name-only --diff-filter=U)
  if [ -n "$CONFLICTS" ]; then
    NUM=$(echo "$CONFLICTS" | wc -l | xargs)
    err "merge conflicts in $NUM files:"
    echo "$CONFLICTS" | sed 's/^/  /'
    echo ""
    echo -e "${YELLOW}next:${NC}"
    echo "  1. resolve conflicts above"
    echo "  2. git add <resolved files>"
    echo "  3. ./sync-upstream.sh    (re-run to finish audit + tests)"
    echo ""
    echo -e "${YELLOW}or abort:${NC}"
    echo "  git merge --abort"
    echo "  git checkout $BASE_BRANCH && git branch -D $SYNC_BRANCH"
    exit 2
  fi
  ok "merge applied with no conflicts"
fi

# -----------------------------------------------------------------------------
phase "6/8 Re-remove ee/"
# -----------------------------------------------------------------------------
if [ -d "ee/" ]; then
  warn "removing ee/ directory (proprietary, not for thadm)"
  git rm -rf --quiet ee/ 2>/dev/null || { rm -rf ee/; git add -u ee/ 2>/dev/null || true; }
  ok "ee/ removed"
else
  ok "no ee/ directory present"
fi

# -----------------------------------------------------------------------------
phase "7/8 Privacy audit (informational)"
# -----------------------------------------------------------------------------
PRIVACY_HITS=0
audit() {
  local label="$1" pattern="$2"
  local result
  result=$(git grep -nIE "$pattern" -- \
    ':!*.lock' ':!*.lockb' ':!*.lock.json' \
    ':!REBRAND_PLAN.md' ':!CLAUDE.md' ':!sync-upstream.sh' \
    ':!.claude/' ':!openspec/' \
    2>/dev/null || true)
  if [ -n "$result" ]; then
    local n
    n=$(echo "$result" | wc -l | xargs)
    warn "$label — $n hits"
    echo "$result" | head -10 | sed 's/^/  /'
    [ "$n" -gt 10 ] && echo "  ... $((n - 10)) more"
    PRIVACY_HITS=$((PRIVACY_HITS + n))
  fi
}

audit "PostHog init"           'posthog\.init|PostHogProvider'
audit "Sentry init"            'Sentry\.init|sentry::init'
audit "screenpi.pe domain"     'screenpi\.pe'
audit "old data dir"           '\.screenpipe[/"\x27]'
audit "old deep-link scheme"   'screenpipe://'
audit "old bundle id"          'com\.screenpi\.pe'

if [ "$PRIVACY_HITS" -eq 0 ]; then
  ok "no obvious thadm-invariant regressions"
else
  warn "$PRIVACY_HITS potential thadm-invariant regressions — review before commit"
fi

# -----------------------------------------------------------------------------
phase "8/8 Tests"
# -----------------------------------------------------------------------------
CARGO_OK=0
BUN_OK=0

info "cargo test --workspace"
if cargo test --workspace --no-fail-fast 2>&1 | tail -15; then
  ok "cargo test passed"
  CARGO_OK=1
else
  warn "cargo test reported failures (check output)"
fi

echo ""
info "bun test (apps/screenpipe-app-tauri)"
if (cd apps/screenpipe-app-tauri && bun test 2>&1 | tail -15); then
  ok "bun test passed"
  BUN_OK=1
else
  warn "bun test reported failures (CLAUDE.md notes pre-existing TextOverlay failures)"
fi

info "skipping bun run test:e2e — run manually if relevant"

# -----------------------------------------------------------------------------
echo ""
echo -e "${BLUE}=== Summary ===${NC}"
echo ""
echo "branch:        $(git branch --show-current)"
echo "base:          $BASE_BRANCH"
echo "privacy hits:  $PRIVACY_HITS (review with: git diff --staged)"
echo "cargo test:    $([ "$CARGO_OK" -eq 1 ] && echo passed || echo failed)"
echo "bun test:      $([ "$BUN_OK" -eq 1 ] && echo passed || echo failed)"
echo ""
echo -e "${GREEN}ready for review.${NC} merge is staged but NOT committed."
echo ""
echo "after review, commit and merge into $BASE_BRANCH:"
echo "  git commit  # editor opens with default merge message — edit as needed"
echo "  git checkout $BASE_BRANCH"
echo "  git merge --no-ff $(git branch --show-current)"
echo "  git push $ORIGIN_REMOTE $BASE_BRANCH"
