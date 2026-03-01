#!/bin/bash

# =============================================
# AI Coding Assistant Rules Setup
# =============================================

set -e

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source colors
source "$SCRIPT_DIR/colors.sh"

# =============================================
# Tool definitions (compatible with bash 3.x)
# =============================================

get_tool_name() {
    case "$1" in
        1) echo "Cursor" ;;
        2) echo "Windsurf" ;;
        3) echo "GitHub Copilot" ;;
        4) echo "Cline/Roo Code" ;;
        5) echo "AGENTS.md (generic)" ;;
        *) echo "" ;;
    esac
}

get_tool_target() {
    case "$1" in
        1) echo ".cursorrules" ;;
        2) echo ".windsurfrules" ;;
        3) echo ".github/copilot-instructions.md" ;;
        4) echo ".clinerules" ;;
        5) echo "AGENTS.md" ;;
        *) echo "" ;;
    esac
}

# =============================================
# Print Banner
# =============================================

print_banner() {
    echo ""
    echo -e "${BRIGHT_CYAN}╔════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BRIGHT_CYAN}║${RESET}         ${BOLD}AI Coding Assistant Rules Setup${RESET}                    ${BRIGHT_CYAN}║${RESET}"
    echo -e "${BRIGHT_CYAN}║${RESET}         Link CLAUDE.md to other AI tool config files       ${BRIGHT_CYAN}║${RESET}"
    echo -e "${BRIGHT_CYAN}╚════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
}

# =============================================
# Check source file exists
# =============================================

check_source() {
    if [[ ! -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
        echo -e "${RED}Error: CLAUDE.md not found in project root${RESET}"
        exit 1
    fi
}

# =============================================
# Create symlink
# =============================================

create_link() {
    local target="$1"
    local target_path="$PROJECT_ROOT/$target"
    local target_dir=$(dirname "$target_path")

    # Create parent directory if needed
    if [[ ! -d "$target_dir" ]]; then
        mkdir -p "$target_dir"
    fi

    # Remove existing file/link
    if [[ -e "$target_path" ]] || [[ -L "$target_path" ]]; then
        rm -f "$target_path"
    fi

    # Create relative symlink
    local rel_path="CLAUDE.md"
    if [[ "$target_dir" != "$PROJECT_ROOT" ]]; then
        # Calculate relative path for nested targets
        local depth=$(echo "$target" | tr -cd '/' | wc -c | tr -d ' ')
        rel_path=""
        for ((i=0; i<depth; i++)); do
            rel_path="../$rel_path"
        done
        rel_path="${rel_path}CLAUDE.md"
    fi

    ln -s "$rel_path" "$target_path"

    echo -e "${GREEN}✓${RESET} Created: $target → CLAUDE.md"
}

# =============================================
# Interactive menu
# =============================================

show_menu() {
    echo -e "${BOLD}Select AI tools to create symlinks for:${RESET}"
    echo ""

    for i in 1 2 3 4 5; do
        local name=$(get_tool_name $i)
        echo -e "  ${CYAN}$i)${RESET} $name"
    done

    echo ""
    echo -e "  ${CYAN}a)${RESET} All of the above"
    echo -e "  ${CYAN}q)${RESET} Quit"
    echo ""
}

# =============================================
# Process selection
# =============================================

process_selection() {
    local selection="$1"
    local created=0

    if [[ "$selection" == "q" ]] || [[ "$selection" == "Q" ]]; then
        echo "Cancelled."
        exit 0
    fi

    if [[ "$selection" == "a" ]] || [[ "$selection" == "A" ]]; then
        selection="1 2 3 4 5"
    fi

    # Parse comma/space separated selections
    selection=$(echo "$selection" | tr ',' ' ')

    echo ""
    for choice in $selection; do
        choice=$(echo "$choice" | tr -d ' ')
        local target=$(get_tool_target "$choice")
        if [[ -n "$target" ]]; then
            create_link "$target"
            ((created++)) || true
        elif [[ -n "$choice" ]]; then
            echo -e "${YELLOW}⚠${RESET} Invalid option: $choice"
        fi
    done

    echo ""
    if [[ $created -gt 0 ]]; then
        echo -e "${GREEN}${BOLD}Done!${RESET} Created $created symlink(s)."
        echo ""
        echo -e "${DIM}Tip: Edit CLAUDE.md to update all tool configs at once.${RESET}"
    else
        echo -e "${YELLOW}No symlinks created.${RESET}"
    fi
}

# =============================================
# Show current status
# =============================================

show_status() {
    echo -e "${BOLD}Current status:${RESET}"
    echo ""

    # Show source file
    if [[ -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
        echo -e "  ${GREEN}★${RESET} CLAUDE.md (source of truth)"
    fi
    echo ""

    for i in 1 2 3 4 5; do
        local target=$(get_tool_target $i)
        local target_path="$PROJECT_ROOT/$target"
        local name=$(get_tool_name $i)

        if [[ -L "$target_path" ]]; then
            local link_target=$(readlink "$target_path")
            echo -e "  ${GREEN}●${RESET} $name: $target → $link_target"
        elif [[ -f "$target_path" ]]; then
            echo -e "  ${YELLOW}●${RESET} $name: $target (file exists, not a symlink)"
        else
            echo -e "  ${DIM}○${RESET} $name: $target (not configured)"
        fi
    done
    echo ""
}

# =============================================
# Main
# =============================================

main() {
    print_banner
    check_source
    show_status
    show_menu

    echo "Enter your choice (e.g., 1,2 or 1 2 or a for all):"
    read -p "> " selection

    process_selection "$selection"
}

main "$@"
