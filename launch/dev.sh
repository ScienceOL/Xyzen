#!/bin/bash

# =============================================
# 构建开发环境容器服务控制脚本
# =============================================

# -------------------------------
# 全局配置
# -------------------------------
SCRIPT_DIR=$(dirname "$0")
PROJECT_DIR=$(dirname "${SCRIPT_DIR}")
ENV_FILE="${PROJECT_DIR}/docker/.env.dev"
# 定义 sciol 全局虚拟虚拟环境的路径
SCIOL_VENV_PATH="${HOME}/.sciol/venv"
PYTHON_VERSION="3.14"

# -------------------------------
# 颜色配置
# -------------------------------
source "${SCRIPT_DIR}/colors.sh"

# -------------------------------
# 品牌显示
# -------------------------------
print_icon() {
  source "${SCRIPT_DIR}/branch.sh" && print_icon
}

# -------------------------------
# 帮助信息
# -------------------------------
print_help() {
  echo -e "${BRIGHT_GREEN}使用说明：${RESET}"
  echo -e "  dev.sh [选项]"
  echo
  echo -e "${BRIGHT_GREEN}选项说明：${RESET}"
  echo -e "  ${YELLOW}-h${RESET}   显示帮助信息"
  echo -e "  ${YELLOW}-d${RESET}   以守护进程模式启动容器（后台运行）"
  echo -e "  ${YELLOW}-e${RESET}   关闭并移除所有容器"
  echo -e "  ${YELLOW}-s${RESET}   快速停止容器（不移除）"
  echo
  echo -e "${BRIGHT_GREEN}示例：${RESET}"
  echo -e "  # 前台启动开发服务"
  echo -e "  $ ./dev.sh\n"
  echo -e "  # 后台启动开发服务"
  echo -e "  $ ./dev.sh -d\n"
  echo -e "  # 快速停止容器"
  echo -e "  $ ./dev.sh -s\n"
  echo -e "  # 关闭并移除容器"
  echo -e "  $ ./dev.sh -e\n"
  echo -e "  # 显示帮助信息"
  echo -e "  $ ./dev.sh -h"
  exit 0
}

# -------------------------------
# 开发环境配置
# -------------------------------

# 步骤 1: 检查 Docker 和 .env 文件
check_basics() {
  echo -e "${BRIGHT_MAGENTA}\n[1/3] ⚙️  检查基础环境...${RESET}"
  # Docker check
  if ! command -v docker &> /dev/null; then
    echo -e "${BRIGHT_RED}❌ 错误：未检测到 Docker 安装${RESET}"
    exit 1
  fi

  # .env.dev check
  if [ ! -f "${ENV_FILE}" ]; then
    echo -e "${BRIGHT_YELLOW}未找到 .env.dev 文件，正在从 .env.example 创建...${RESET}"
    cp "${PROJECT_DIR}/docker/.env.example" "${ENV_FILE}"
  fi

  # Casdoor init_data.json check
  CASDOOR_INIT_DATA="${PROJECT_DIR}/infra/casdoor/init_data.json"
  CASDOOR_INIT_EXAMPLE="${PROJECT_DIR}/infra/casdoor/init_data.example.json"
  if [ ! -f "${CASDOOR_INIT_DATA}" ]; then
    if [ -f "${CASDOOR_INIT_EXAMPLE}" ]; then
      echo -e "${BRIGHT_YELLOW}未找到 Casdoor init_data.json，正在从 init_data.example.json 创建...${RESET}"
      cp "${CASDOOR_INIT_EXAMPLE}" "${CASDOOR_INIT_DATA}"
    else
      echo -e "${BRIGHT_RED}❌ 错误：未找到 Casdoor init_data.example.json${RESET}"
      exit 1
    fi
  fi

  echo -e "${BRIGHT_GREEN}✓ Docker 和配置文件已就绪。${RESET}"
}

# 步骤 2: 配置 Sciol 虚拟环境和 pre-commit
setup_sciol_env() {
  # 检查 uv 是否安装
  if ! command -v uv &> /dev/null; then
    echo -e "${BRIGHT_RED}❌ 错误：本项目使用 uv 管理 pre-commit，但未检测到 uv 安装。${RESET}"
    echo -e "${YELLOW}请参考 https://github.com/astral-sh/uv 进行安装。${RESET}"
    exit 1
  fi

  # 首次运行检测
  if [ ! -f "${SCIOL_VENV_PATH}/bin/python" ]; then
    echo -e "${BRIGHT_MAGENTA}\n[2/3] 🚀 首次配置 Sciol 虚拟环境...${RESET}"
    echo -e "${BRIGHT_CYAN}▶ 正在创建 Python ${PYTHON_VERSION} 虚拟环境于 ${SCIOL_VENV_PATH}...${RESET}"
    mkdir -p "$(dirname "${SCIOL_VENV_PATH}")"
    uv venv "${SCIOL_VENV_PATH}" --python ${PYTHON_VERSION}
    if [ $? -ne 0 ]; then
      echo -e "${BRIGHT_RED}❌ 虚拟环境创建失败。${RESET}"
      exit 1
    fi

    echo -e "${BRIGHT_CYAN}▶ 正在安装 pre-commit...${RESET}"
    uv pip install --python "${SCIOL_VENV_PATH}/bin/python" pre-commit
    if [ $? -ne 0 ]; then
      echo -e "${BRIGHT_RED}❌ pre-commit 安装失败。${RESET}"
      exit 1
    fi

    echo -e "${BRIGHT_CYAN}▶ 正在安装 Git 钩子...${RESET}"
    (cd "${PROJECT_DIR}" && "${SCIOL_VENV_PATH}/bin/pre-commit" install)
    echo -e "${BRIGHT_GREEN}✓ Sciol 虚拟环境配置完成。${RESET}"
  else
    echo -e "${BRIGHT_MAGENTA}\n[2/3] 🚀 验证 Sciol 虚拟环境...${RESET}"
    # 后续运行时，静默确保 pre-commit 和钩子都已安装
    if [ ! -f "${SCIOL_VENV_PATH}/bin/pre-commit" ]; then
      uv pip install --python "${SCIOL_VENV_PATH}/bin/python" pre-commit > /dev/null 2>&1
    fi
    (cd "${PROJECT_DIR}" && "${SCIOL_VENV_PATH}/bin/pre-commit" install) > /dev/null 2>&1
    echo -e "${BRIGHT_GREEN}✓ Sciol 环境 (${CYAN}${SCIOL_VENV_PATH}${BRIGHT_GREEN}) 已配置。${RESET}"
  fi
}

# 步骤 3: 配置 VS Code 工作区
setup_vscode_workspace() {
  # 首次运行检测 (只要有一个配置文件缺失就认为是首次)
  if [ ! -f "${PROJECT_DIR}/.vscode/settings.json" ] || [ ! -f "${PROJECT_DIR}/.vscode/extensions.json" ]; then
    echo -e "${BRIGHT_MAGENTA}\n[3/3] 📝 首次配置 VS Code 工作区...${RESET}"
    mkdir -p "${PROJECT_DIR}/.vscode"

    # 处理 settings.json
    if [ ! -f "${PROJECT_DIR}/.vscode/settings.json" ] && [ -f "${PROJECT_DIR}/.vscode/settings.example.json" ]; then
      echo -e "${BRIGHT_CYAN}▶ 正在从 settings.example.json 创建 settings.json...${RESET}"
      cp "${PROJECT_DIR}/.vscode/settings.example.json" "${PROJECT_DIR}/.vscode/settings.json"
    fi

    # 处理 extensions.json
    if [ ! -f "${PROJECT_DIR}/.vscode/extensions.json" ] && [ -f "${PROJECT_DIR}/.vscode/extensions.example.json" ]; then
      echo -e "${BRIGHT_CYAN}▶ 正在从 extensions.example.json 创建 extensions.json...${RESET}"
      cp "${PROJECT_DIR}/.vscode/extensions.example.json" "${PROJECT_DIR}/.vscode/extensions.json"
      echo -e "${BRIGHT_YELLOW}   请在 VS Code 中安装推荐的插件。${RESET}"
    fi
    echo -e "${BRIGHT_GREEN}✓ VS Code 工作区配置完成。${RESET}"
  else
    echo -e "${BRIGHT_MAGENTA}\n[3/3] 📝 验证 VS Code 工作区...${RESET}"
    echo -e "${BRIGHT_GREEN}✓ VS Code 配置文件已就绪。${RESET}"
  fi
}

# =============================================
# 参数解析
# =============================================
BACKGROUND_MODE=0
EXIT_COMMAND=0
STOP_COMMAND=0

# 解析命令行参数
while getopts "hdes" opt; do
  case $opt in
    e)
      EXIT_COMMAND=1
      ;;
    h)
      print_icon
      print_help
      ;;
    d)
      BACKGROUND_MODE=1
      ;;
    s)
      STOP_COMMAND=1
      ;;
    \?)
      echo -e "${BRIGHT_RRED}错误：无效的选项 -$OPTARG${RESET}" >&2
      exit 1
      ;;
  esac
done

# =============================================
# 主执行流程
# =============================================

# 显示品牌图标
print_icon

# -------------------------------
# 开发环境配置
# -------------------------------
echo -e "${BRIGHT_BLUE}\n🔧 配置开发环境...${RESET}"
check_basics
setup_sciol_env
setup_vscode_workspace

# -------------------------------
# 服务启动与管理
# -------------------------------
# 开发服务 Docker Compose 参数
CMD_ARGS=(
  -f "${PROJECT_DIR}/docker/docker-compose.base.yaml"
  -f "${PROJECT_DIR}/docker/docker-compose.dev.yaml"
  --env-file "${ENV_FILE}"
)
# 中间件服务 Docker Compose 参数
MID_CMD_ARGS=(
  -p "sciol-infra"
  -f "${PROJECT_DIR}/docker/docker-compose.infra.yaml"
  --env-file "${ENV_FILE}"
)

# 处理关闭并移除容器的命令
if [ "${EXIT_COMMAND}" -eq 1 ]; then
  echo -e "${BRIGHT_YELLOW}▶  关闭并移除开发服务容器...${RESET}"
  docker compose "${CMD_ARGS[@]}" down
  echo -e "${BRIGHT_YELLOW}▶  关闭并移除中间件服务容器...${RESET}"
  docker compose "${MID_CMD_ARGS[@]}" down
  exit
fi

# 处理停止容器的命令
if [ "${STOP_COMMAND}" -eq 1 ]; then
  echo -e "${BRIGHT_YELLOW}▶  停止开发服务容器...${RESET}"
  docker compose "${CMD_ARGS[@]}" stop
  echo -e "${BRIGHT_YELLOW}▶  停止中间件服务容器...${RESET}"
  docker compose "${MID_CMD_ARGS[@]}" stop
  exit
fi

# 检查并启动中间件服务
echo -e "${BRIGHT_CYAN}\n🔧 检查基础设施服务状态...${RESET}"
RUNNING_MID_SERVICES=$(docker compose "${MID_CMD_ARGS[@]}" ps --status=running -q)
if [ -n "$RUNNING_MID_SERVICES" ]; then
  echo -e "${BRIGHT_GREEN}✓ 基础设施服务已在运行中。${RESET}"
else
  echo -e "${BRIGHT_YELLOW}▶ 基础设施服务未运行，正在后台启动...${RESET}"
  docker compose "${MID_CMD_ARGS[@]}" up -d
  if [ $? -ne 0 ]; then
    echo -e "${BRIGHT_RED}❌ 基础设施服务启动失败。${RESET}"
    exit 1
  fi
  echo -e "${BRIGHT_GREEN}✓ 基础设施服务启动成功。${RESET}"
fi

# 启动开发服务
echo -e "${BRIGHT_BLUE}\n🚀 启动开发容器服务...${RESET}"
if [ "${BACKGROUND_MODE}" -eq 1 ]; then
  echo -e "${BRIGHT_YELLOW}▶ 以守护进程模式启动${RESET}"
  docker compose "${CMD_ARGS[@]}" up -d
else
  echo -e "${BRIGHT_YELLOW}▶ 以前台模式启动${RESET}"
  docker compose "${CMD_ARGS[@]}" up
fi
