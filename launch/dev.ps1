# =============================================
# 构建开发环境容器服务控制脚本 (PowerShell 版本)
# =============================================
param (
    [switch]$d, # 以守护进程模式启动容器（后台运行）
    [switch]$h, # 显示帮助信息
    [switch]$e, # 关闭并移除所有容器
    [switch]$s  # 快速停止容器（不移除）
)

# -------------------------------
# 全局配置
# -------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir
$EnvFile = Join-Path $ProjectDir "docker\.env.dev"
$EnvExampleFile = Join-Path $ProjectDir "docker\.env.example"

# -------------------------------
# 帮助信息
# -------------------------------
function Show-Help {
    Write-Host "`n使用说明：" -ForegroundColor Green
    Write-Host "  dev.ps1 [选项]"
    Write-Host "`n选项说明：" -ForegroundColor Green
    Write-Host "  -h     显示帮助信息" -ForegroundColor Yellow
    Write-Host "  -d     以守护进程模式启动容器（后台运行）" -ForegroundColor Yellow
    Write-Host "  -e     关闭并移除所有容器" -ForegroundColor Yellow
    Write-Host "  -s     快速停止容器（不移除）" -ForegroundColor Yellow
    Write-Host "`n示例：" -ForegroundColor Green
    Write-Host "  ./dev.ps1"
    Write-Host "  ./dev.ps1 -d"
    Write-Host "  ./dev.ps1 -s"
    Write-Host "  ./dev.ps1 -e"
    Write-Host "  ./dev.ps1 -h`n"
    exit
}

# -------------------------------
# 参数解析
# -------------------------------
if ($h) {
    Show-Help
}

# -------------------------------
# 环境预检
# -------------------------------
Write-Host "`n⚙  检查 Docker 环境..." -ForegroundColor Magenta
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误：未检测到 Docker 安装" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Docker 已就绪" -ForegroundColor Green

# 检查 .env.dev 文件是否存在，不存在则从 .env.example 创建
if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExampleFile) {
        Write-Host "⚠️  未找到 .env.dev 文件，将从 .env.example 创建..." -ForegroundColor Yellow
        Copy-Item -Path $EnvExampleFile -Destination $EnvFile
        Write-Host "✓ .env.dev 文件已创建" -ForegroundColor Green
    } else {
        Write-Host "❌ 错误: .env.example 文件未找到，无法创建 .env.dev" -ForegroundColor Red
        exit 1
    }
}

# -------------------------------
# 检查 pre-commit
# -------------------------------
function Check-Precommit {
    Write-Host "`n🔍 检查 pre-commit 钩子..." -ForegroundColor Magenta

    # 检查 pre-commit 命令是否存在
    if (-not (Get-Command pre-commit -ErrorAction SilentlyContinue)) {
        Write-Host "⚠️  未检测到 pre-commit 安装" -ForegroundColor Yellow
        Write-Host "▶ 正在安装 pre-commit..." -ForegroundColor Cyan
        pip install pre-commit
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ pre-commit 安装失败" -ForegroundColor Red
            Write-Host "请手动安装: pip install pre-commit" -ForegroundColor Yellow
            return 1 # Indicate failure
        }
        Write-Host "✓ pre-commit 安装成功" -ForegroundColor Green
    } else {
        Write-Host "✓ pre-commit 已安装" -ForegroundColor Green
    }

    # 检查 pre-commit 钩子是否已安装在当前项目
    $HookFile = Join-Path $ProjectDir ".git\hooks\pre-commit"
    if (-not (Test-Path $HookFile) -or !(Select-String -Path $HookFile -Pattern "pre-commit" -Quiet)) {
        Write-Host "⚠️  pre-commit 钩子未安装在本项目" -ForegroundColor Yellow
        Write-Host "▶ 正在安装 pre-commit 钩子..." -ForegroundColor Cyan
        try {
            Push-Location $ProjectDir
            uv run --frozen pre-commit install
            if ($LASTEXITCODE -ne 0) {
                throw "pre-commit hook installation failed."
            }
            Write-Host "✓ pre-commit 钩子安装成功" -ForegroundColor Green
        } catch {
            Write-Host "❌ pre-commit 钩子安装失败" -ForegroundColor Red
            return 1 # Indicate failure
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "✓ pre-commit 钩子已启用" -ForegroundColor Green
    }
    return 0 # Indicate success
}

Check-Precommit

# -------------------------------
# 服务启动
# -------------------------------
Write-Host "`n🚀 启动开发容器服务..." -ForegroundColor Cyan
$ComposeFiles = @(
    "-f", "$ProjectDir\docker\docker-compose.base.yaml",
    "-f", "$ProjectDir\docker\docker-compose.dev.yaml",
    "--env-file", "$EnvFile"
)

if ($e) {
    Write-Host "▶  关闭并移除容器" -ForegroundColor Yellow
    docker compose @ComposeFiles down
    exit
}

if ($s) {
    Write-Host "▶  停止容器" -ForegroundColor Yellow
    docker compose @ComposeFiles stop
    exit
}

if ($d) {
    Write-Host "▶ 以守护进程模式启动" -ForegroundColor Yellow
    docker compose @ComposeFiles up -d
} else {
    Write-Host "▶ 以前台模式启动" -ForegroundColor Yellow
    docker compose @ComposeFiles up
}
