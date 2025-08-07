# =============================================
# Development environment container service control script (PowerShell version)
# =============================================
param (
    [switch]$d, # Start containers in detached mode (background)
    [switch]$h, # Show help information
    [switch]$e, # Stop and remove all containers
    [switch]$s  # Stop containers without removing them
)

# -------------------------------
# Global Configurations
# -------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir
$EnvFile = Join-Path $ProjectDir "docker\.env.dev"
$EnvExampleFile = Join-Path $ProjectDir "docker\.env.example"

# -------------------------------
# Help Information
# -------------------------------
function Show-Help {
    Write-Host "`nUsage:" -ForegroundColor Green
    Write-Host "  dev.ps1 [options]"
    Write-Host "`nOptions:" -ForegroundColor Green
    Write-Host "  -h     Show help information" -ForegroundColor Yellow
    Write-Host "  -d     Start containers in detached mode (background)" -ForegroundColor Yellow
    Write-Host "  -e     Stop and remove all containers" -ForegroundColor Yellow
    Write-Host "  -s     Stop containers without removing them" -ForegroundColor Yellow
    Write-Host "`nExamples:" -ForegroundColor Green
    Write-Host "  ./dev.ps1"
    Write-Host "  ./dev.ps1 -d"
    Write-Host "  ./dev.ps1 -s"
    Write-Host "  ./dev.ps1 -e"
    Write-Host "  ./dev.ps1 -h`n"
    exit
}

# -------------------------------
# Parse Arguments
# -------------------------------
if ($h) {
    Show-Help
}

# -------------------------------
# Environment Pre-check
# -------------------------------
Write-Host "`n[+] Checking Docker environment..." -ForegroundColor Magenta
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[-] Error: Docker is not installed." -ForegroundColor Red
    exit 1
}
Write-Host "[+] Docker is ready." -ForegroundColor Green

# Check if .env.dev exists, create from .env.example if not.
if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExampleFile) {
        Write-Host "[!] .env.dev not found, creating from .env.example..." -ForegroundColor Yellow
        Copy-Item -Path $EnvExampleFile -Destination $EnvFile
        Write-Host "[+] .env.dev created successfully." -ForegroundColor Green
    } else {
        Write-Host "[-] Error: .env.example not found, cannot create .env.dev" -ForegroundColor Red
        exit 1
    }
}

# -------------------------------
# Check pre-commit
# -------------------------------
function Check-Precommit {
    Write-Host "`n[+] Checking pre-commit hooks..." -ForegroundColor Magenta

    # Check if pre-commit command exists
    if (-not (Get-Command pre-commit -ErrorAction SilentlyContinue)) {
        Write-Host "[!] pre-commit is not installed." -ForegroundColor Yellow
        Write-Host "--> Installing pre-commit..." -ForegroundColor Cyan
        pip install pre-commit
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[-] pre-commit installation failed." -ForegroundColor Red
            Write-Host "Please install it manually: pip install pre-commit" -ForegroundColor Yellow
            return 1 # Indicate failure
        }
        Write-Host "[+] pre-commit installed successfully." -ForegroundColor Green
    } else {
        Write-Host "[+] pre-commit is already installed." -ForegroundColor Green
    }

    # Check if pre-commit hooks are installed in this project
    $HookFile = Join-Path $ProjectDir ".git\hooks\pre-commit"
    if (-not (Test-Path $HookFile) -or !(Select-String -Path $HookFile -Pattern "pre-commit" -Quiet)) {
        Write-Host "[!] pre-commit hooks are not installed in this project." -ForegroundColor Yellow
        Write-Host "--> Installing pre-commit hooks..." -ForegroundColor Cyan
        try {
            Push-Location $ProjectDir
            uv run --frozen pre-commit install
            if ($LASTEXITCODE -ne 0) {
                throw "pre-commit hook installation failed."
            }
            Write-Host "[+] pre-commit hooks installed successfully." -ForegroundColor Green
        } catch {
            Write-Host "[-] pre-commit hooks installation failed." -ForegroundColor Red
            return 1 # Indicate failure
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "[+] pre-commit hooks are enabled." -ForegroundColor Green
    }
    return 0 # Indicate success
}

Check-Precommit

# -------------------------------
# Start services
# -------------------------------
Write-Host "`n[+] Starting development container services..." -ForegroundColor Cyan
$ComposeFiles = @(
    "-f", "$ProjectDir\docker\docker-compose.base.yaml",
    "-f", "$ProjectDir\docker\docker-compose.dev.yaml",
    "--env-file", "$EnvFile"
)

if ($e) {
    Write-Host "--> Stopping and removing containers..." -ForegroundColor Yellow
    docker compose @ComposeFiles down
    exit
}

if ($s) {
    Write-Host "--> Stopping containers..." -ForegroundColor Yellow
    docker compose @ComposeFiles stop
    exit
}

if ($d) {
    Write-Host "--> Starting in detached mode..." -ForegroundColor Yellow
    docker compose @ComposeFiles up -d
} else {
    Write-Host "--> Starting in foreground mode..." -ForegroundColor Yellow
    docker compose @ComposeFiles up
}
