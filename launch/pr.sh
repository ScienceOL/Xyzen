#!/usr/bin/env bash
set -euo pipefail

# =============================================
# Auto push + create PR
# =============================================
# Usage:
#   pr.sh [target]    target = test (default) or main

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "${SCRIPT_DIR}/colors.sh"

TARGET="${1:-test}"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ "$BRANCH" == "main" || "$BRANCH" == "test" ]]; then
  echo -e "${BRIGHT_RED}Error: Cannot create PR from '${BRANCH}'. Switch to a feature branch first.${RESET}"
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo -e "${BRIGHT_RED}Error: GitHub CLI (gh) is required. Install: https://cli.github.com${RESET}"
  exit 1
fi

# Push branch to remote
echo -e "${BRIGHT_CYAN}Pushing ${BRANCH} to origin...${RESET}"
git push -u origin "$BRANCH"

# Check if PR already exists
EXISTING_PR=$(gh pr list --head "$BRANCH" --base "$TARGET" --json number,url --jq '.[0].url // empty' 2>/dev/null || true)
if [[ -n "$EXISTING_PR" ]]; then
  echo -e "${BRIGHT_GREEN}PR already exists: ${EXISTING_PR}${RESET}"
  echo -e "Pushed latest commits."
  exit 0
fi

# Generate title from branch name: feat/add-login → feat: add login
TITLE=$(echo "$BRANCH" | sed -E 's|^([a-z]+)/|\1: |; s/-/ /g')

# Collect commits relative to target branch
COMMITS=$(git log --reverse --format="- %s" "origin/${TARGET}..HEAD" 2>/dev/null || echo "- Initial commit")

# Build PR body
BODY=$(cat <<EOF
## Changes

${COMMITS}

## Checklist

- [x] Tested locally
- [x] Code style checked via pre-commit hooks
EOF
)

echo -e "${BRIGHT_CYAN}Creating PR: ${BRANCH} → ${TARGET}${RESET}"
PR_URL=$(gh pr create \
  --base "$TARGET" \
  --head "$BRANCH" \
  --title "$TITLE" \
  --body "$BODY")

echo -e "${BRIGHT_GREEN}PR created: ${PR_URL}${RESET}"
