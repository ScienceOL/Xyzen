#!/bin/bash

# =============================================
# AI Coding Assistant Rules Setup
# AI 编程助手规则配置
# =============================================

set -e

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source colors
source "$SCRIPT_DIR/colors.sh"

# =============================================
# Language Detection / 语言检测
# =============================================

detect_language() {
    local lang="${LANG:-en_US}"
    if [[ "$lang" == zh_CN* ]] || [[ "$lang" == zh_TW* ]] || [[ "$lang" == zh_HK* ]]; then
        echo "zh"
    else
        echo "en"
    fi
}

LANGUAGE=$(detect_language)

# =============================================
# Bilingual Messages / 双语消息
# =============================================

msg() {
    local en="$1"
    local zh="$2"
    if [[ "$LANGUAGE" == "zh" ]]; then
        echo -e "$zh"
    else
        echo -e "$en"
    fi
}

# =============================================
# Tool definitions (compatible with bash 3.x)
# =============================================

get_tool_name() {
    case "$1" in
        1) echo "Claude Code" ;;
        2) echo "Cursor" ;;
        3) echo "Windsurf" ;;
        4) echo "GitHub Copilot" ;;
        5) echo "Cline/Roo Code" ;;
        *) echo "" ;;
    esac
}

get_tool_target() {
    case "$1" in
        1) echo "CLAUDE.md" ;;
        2) echo ".cursorrules" ;;
        3) echo ".windsurfrules" ;;
        4) echo ".github/copilot-instructions.md" ;;
        5) echo ".clinerules" ;;
        *) echo "" ;;
    esac
}

# =============================================
# Print Banner
# =============================================

print_banner() {
    echo ""
    echo -e "${BRIGHT_CYAN}╔════════════════════════════════════════════════════════════╗${RESET}"
    if [[ "$LANGUAGE" == "zh" ]]; then
        echo -e "${BRIGHT_CYAN}║${RESET}         ${BOLD}AI 编程助手规则配置工具${RESET}                          ${BRIGHT_CYAN}║${RESET}"
        echo -e "${BRIGHT_CYAN}║${RESET}         将 AGENTS.md 链接到各个 AI 工具的配置文件           ${BRIGHT_CYAN}║${RESET}"
    else
        echo -e "${BRIGHT_CYAN}║${RESET}         ${BOLD}AI Coding Assistant Rules Setup${RESET}                    ${BRIGHT_CYAN}║${RESET}"
        echo -e "${BRIGHT_CYAN}║${RESET}         Link AGENTS.md to AI tool config files              ${BRIGHT_CYAN}║${RESET}"
    fi
    echo -e "${BRIGHT_CYAN}╚════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
}

# =============================================
# Check source file exists
# =============================================

check_source() {
    if [[ ! -f "$PROJECT_ROOT/AGENTS.md" ]]; then
        msg "${RED}Error: AGENTS.md not found in project root${RESET}" \
            "${RED}错误: 项目根目录未找到 AGENTS.md${RESET}"
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
    local rel_path="AGENTS.md"
    if [[ "$target_dir" != "$PROJECT_ROOT" ]]; then
        # Calculate relative path for nested targets
        local depth=$(echo "$target" | tr -cd '/' | wc -c | tr -d ' ')
        rel_path=""
        for ((i=0; i<depth; i++)); do
            rel_path="../$rel_path"
        done
        rel_path="${rel_path}AGENTS.md"
    fi

    ln -s "$rel_path" "$target_path"

    msg "${GREEN}✓${RESET} Created: $target → AGENTS.md" \
        "${GREEN}✓${RESET} 已创建: $target → AGENTS.md"
}

# =============================================
# Interactive menu
# =============================================

show_menu() {
    msg "${BOLD}Select AI tools you are using:${RESET}" \
        "${BOLD}选择你正在使用的 AI 工具:${RESET}"
    echo ""

    for i in 1 2 3 4 5; do
        local name=$(get_tool_name $i)
        echo -e "  ${CYAN}$i)${RESET} $name"
    done

    echo ""
    msg "  ${CYAN}a)${RESET} All of the above" \
        "  ${CYAN}a)${RESET} 以上全部"
    msg "  ${CYAN}q)${RESET} Quit" \
        "  ${CYAN}q)${RESET} 退出"
    echo ""
}

# =============================================
# Process selection
# =============================================

process_selection() {
    local selection="$1"
    local created=0

    if [[ "$selection" == "q" ]] || [[ "$selection" == "Q" ]]; then
        msg "Cancelled." "已取消。"
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
            msg "${YELLOW}⚠${RESET} Invalid option: $choice" \
                "${YELLOW}⚠${RESET} 无效选项: $choice"
        fi
    done

    echo ""
    if [[ $created -gt 0 ]]; then
        msg "${GREEN}${BOLD}Done!${RESET} Created $created symlink(s)." \
            "${GREEN}${BOLD}完成!${RESET} 已创建 $created 个符号链接。"
        echo ""
        msg "${DIM}Tip: Edit AGENTS.md to update all tool configs at once.${RESET}" \
            "${DIM}提示: 编辑 AGENTS.md 即可同时更新所有工具的配置。${RESET}"
    else
        msg "${YELLOW}No symlinks created.${RESET}" \
            "${YELLOW}未创建任何符号链接。${RESET}"
    fi
}

# =============================================
# Show current status
# =============================================

show_status() {
    msg "${BOLD}Current status:${RESET}" \
        "${BOLD}当前状态:${RESET}"
    echo ""

    for i in 1 2 3 4 5; do
        local target=$(get_tool_target $i)
        local target_path="$PROJECT_ROOT/$target"
        local name=$(get_tool_name $i)

        if [[ -L "$target_path" ]]; then
            local link_target=$(readlink "$target_path")
            echo -e "  ${GREEN}●${RESET} $name: $target → $link_target"
        elif [[ -f "$target_path" ]]; then
            msg "  ${YELLOW}●${RESET} $name: $target (file exists, not a symlink)" \
                "  ${YELLOW}●${RESET} $name: $target (文件存在，非符号链接)"
        else
            msg "  ${DIM}○${RESET} $name: $target (not configured)" \
                "  ${DIM}○${RESET} $name: $target (未配置)"
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

    msg "Enter your choice (e.g., 1,2 or 1 2 or a for all):" \
        "请输入选择 (如: 1,2 或 1 2 或 a 表示全部):"
    read -p "> " selection

    process_selection "$selection"
}

main "$@"
