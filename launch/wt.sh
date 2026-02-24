#!/usr/bin/env bash
set -euo pipefail

# =============================================
# Git Worktree Manager for parallel development
# =============================================
# Usage:
#   wt.sh create <branch>     Create worktree + allocate port
#   wt.sh list                List active worktrees
#   wt.sh rm <branch>         Remove worktree + free port
#   wt.sh port <branch>       Show port for a worktree

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "${SCRIPT_DIR}/colors.sh"

# Resolve the main repo root (works from both main repo and worktrees)
GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null)
if [ -z "$GIT_COMMON_DIR" ]; then
  echo -e "${BRIGHT_RED}Error: not inside a git repository.${RESET}"
  exit 1
fi
MAIN_REPO=$(cd "$GIT_COMMON_DIR/.." && pwd)
WORKTREE_DIR="${MAIN_REPO}/.worktrees"
PORT_REGISTRY="${WORKTREE_DIR}/.ports"
PORT_BASE=8001

# Sanitize branch name to directory-safe slug
sanitize() {
  echo "$1" | sed 's|/|-|g; s|[^a-zA-Z0-9._-]|-|g'
}

# Find the next available port
next_port() {
  if [ ! -f "$PORT_REGISTRY" ]; then
    echo "$PORT_BASE"
    return
  fi
  local port=$PORT_BASE
  while grep -q "^[^:]*:${port}$" "$PORT_REGISTRY" 2>/dev/null; do
    port=$((port + 1))
  done
  echo "$port"
}

# =============================================
# Commands
# =============================================

cmd_create() {
  local branch="$1"
  local slug
  slug=$(sanitize "$branch")
  local wt_path="${WORKTREE_DIR}/${slug}"

  if [ -d "$wt_path" ]; then
    echo -e "${BRIGHT_YELLOW}Worktree already exists: ${wt_path}${RESET}"
    local port
    port=$(grep "^${slug}:" "$PORT_REGISTRY" 2>/dev/null | cut -d: -f2)
    echo -e "${BRIGHT_CYAN}Dev port: ${port}${RESET}"
    exit 0
  fi

  # Allocate port
  mkdir -p "$WORKTREE_DIR"
  local port
  port=$(next_port)

  # Create git worktree (create branch if it doesn't exist)
  echo -e "${BRIGHT_CYAN}Creating worktree for branch '${branch}'...${RESET}"
  if git rev-parse --verify "$branch" &>/dev/null; then
    git worktree add "$wt_path" "$branch"
  else
    git worktree add -b "$branch" "$wt_path"
  fi

  # Register port
  echo "${slug}:${port}" >> "$PORT_REGISTRY"

  # Write port file for dev.sh detection
  echo "$port" > "${wt_path}/.worktree-port"

  # Symlink shared config files that are gitignored
  local main_env="${MAIN_REPO}/docker/.env.dev"
  local wt_env="${wt_path}/docker/.env.dev"
  if [ -f "$main_env" ] && [ ! -e "$wt_env" ]; then
    ln -s "$main_env" "$wt_env"
    echo -e "${BRIGHT_GREEN}Symlinked .env.dev from main repo.${RESET}"
  fi

  # Symlink .vscode settings if present
  local main_vscode="${MAIN_REPO}/.vscode"
  local wt_vscode="${wt_path}/.vscode"
  if [ -d "$main_vscode" ] && [ ! -e "$wt_vscode" ]; then
    ln -s "$main_vscode" "$wt_vscode"
  fi

  echo ""
  echo -e "${BRIGHT_GREEN}Worktree created:${RESET}"
  echo -e "  Path:   ${CYAN}${wt_path}${RESET}"
  echo -e "  Branch: ${CYAN}${branch}${RESET}"
  echo -e "  Port:   ${CYAN}${port}${RESET} (http://localhost:${port})"
  echo ""
  echo -e "${BRIGHT_BLUE}To start developing:${RESET}"
  echo -e "  cd ${wt_path}"
  echo -e "  just dev"
}

cmd_list() {
  if [ ! -f "$PORT_REGISTRY" ] || [ ! -s "$PORT_REGISTRY" ]; then
    echo -e "${BRIGHT_YELLOW}No active worktrees.${RESET}"
    exit 0
  fi

  echo -e "${BRIGHT_BLUE}Active worktrees:${RESET}"
  echo ""
  printf "  ${BRIGHT_WHITE}%-30s %-8s %s${RESET}\n" "BRANCH" "PORT" "PATH"
  while IFS=: read -r slug port; do
    local wt_path="${WORKTREE_DIR}/${slug}"
    local branch
    if [ -d "$wt_path" ]; then
      branch=$(cd "$wt_path" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "$slug")
      printf "  %-30s %-8s %s\n" "$branch" "$port" "$wt_path"
    else
      printf "  %-30s %-8s %s\n" "$slug (missing)" "$port" "$wt_path"
    fi
  done < "$PORT_REGISTRY"
  echo ""
}

cmd_rm() {
  local branch="$1"
  local slug
  slug=$(sanitize "$branch")
  local wt_path="${WORKTREE_DIR}/${slug}"

  if [ ! -d "$wt_path" ]; then
    echo -e "${BRIGHT_RED}Worktree not found: ${wt_path}${RESET}"
    exit 1
  fi

  # Stop any running containers for this worktree
  local project_name="sciol-xyzen-${slug}"
  echo -e "${BRIGHT_YELLOW}Stopping containers for ${project_name}...${RESET}"
  docker compose -p "$project_name" down 2>/dev/null || true

  # Remove git worktree
  echo -e "${BRIGHT_YELLOW}Removing worktree...${RESET}"
  git worktree remove "$wt_path" --force

  # Remove from port registry
  if [ -f "$PORT_REGISTRY" ]; then
    local tmp="${PORT_REGISTRY}.tmp"
    grep -v "^${slug}:" "$PORT_REGISTRY" > "$tmp" 2>/dev/null || true
    mv "$tmp" "$PORT_REGISTRY"
  fi

  echo -e "${BRIGHT_GREEN}Worktree '${branch}' removed.${RESET}"
}

cmd_port() {
  local branch="$1"
  local slug
  slug=$(sanitize "$branch")
  if [ -f "$PORT_REGISTRY" ]; then
    grep "^${slug}:" "$PORT_REGISTRY" | cut -d: -f2
  else
    echo -e "${BRIGHT_RED}No port found for '${branch}'.${RESET}"
    exit 1
  fi
}

# =============================================
# Main
# =============================================

case "${1:-}" in
  create)
    [ -z "${2:-}" ] && echo "Usage: wt.sh create <branch>" && exit 1
    cmd_create "$2"
    ;;
  list|ls)
    cmd_list
    ;;
  rm|remove)
    [ -z "${2:-}" ] && echo "Usage: wt.sh rm <branch>" && exit 1
    cmd_rm "$2"
    ;;
  port)
    [ -z "${2:-}" ] && echo "Usage: wt.sh port <branch>" && exit 1
    cmd_port "$2"
    ;;
  *)
    echo "Usage: wt.sh {create|list|rm|port} [branch]"
    exit 1
    ;;
esac
