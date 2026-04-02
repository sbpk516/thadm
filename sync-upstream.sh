#!/bin/bash
# sync-upstream.sh — Pull latest screenpipe changes into thadm branch
# Usage: ./sync-upstream.sh

set -e

BRANCH="thadm"
UPSTREAM="upstream"
REMOTE="origin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Thadm Upstream Sync ===${NC}"
echo ""

# Ensure we're on the thadm branch
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$BRANCH" ]; then
    echo -e "${YELLOW}Switching to $BRANCH branch...${NC}"
    git checkout "$BRANCH"
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo -e "${RED}ERROR: You have uncommitted changes. Commit or stash them first.${NC}"
    git status --short
    exit 1
fi

# Fetch latest upstream
echo -e "${YELLOW}Fetching upstream (screenpipe)...${NC}"
git fetch "$UPSTREAM"

# Count new commits
BEHIND=$(git rev-list HEAD.."$UPSTREAM/main" --count)
if [ "$BEHIND" -eq 0 ]; then
    echo -e "${GREEN}Already up to date with upstream!${NC}"
    exit 0
fi

echo -e "${YELLOW}$BEHIND new commits from upstream. Rebasing...${NC}"
echo ""

# Attempt rebase
if git rebase "$UPSTREAM/main"; then
    echo ""
    echo -e "${GREEN}Rebase successful! $BEHIND commits applied cleanly.${NC}"

    # Re-remove ee/ if upstream re-added files there
    if [ -d "ee/" ]; then
        echo -e "${YELLOW}Removing ee/ directory (proprietary, not for thadm)...${NC}"
        rm -rf ee/
        git add -A
        git commit -m "chore: re-remove proprietary ee/ after upstream sync"
    fi

    echo ""
    echo -e "${GREEN}Done! To push:${NC}"
    echo "  git push $REMOTE $BRANCH --force-with-lease"
else
    echo ""
    echo -e "${RED}=== CONFLICTS DETECTED ===${NC}"
    echo ""
    echo "Conflicting files:"
    git diff --name-only --diff-filter=U
    echo ""
    echo -e "${YELLOW}Fix the conflicts, then:${NC}"
    echo "  1. Edit the conflicting files"
    echo "  2. git add <fixed-files>"
    echo "  3. git rebase --continue"
    echo "  4. git push $REMOTE $BRANCH --force-with-lease"
    echo ""
    echo -e "${YELLOW}Or abort with:${NC}  git rebase --abort"
fi
