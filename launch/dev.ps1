# =============================================
# Control script for building development environment container services (PowerShell version)
# =============================================
param (
    [switch]$d,
    [switch]$h,
    [switch]$e,
    [switch]$s
)
# -------------------------------
# Global Configuration
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
    Write-Host "  -d     Start containers in daemon mode (run in background)" -ForegroundColor Yellow
    Write-Host "  -e     Stop and remove all containers" -ForegroundColor Yellow
    Write-Host "  -s     Quickly stop containers (without removing)" -ForegroundColor Yellow
    Write-Host "`nExamples:" -ForegroundColor Green
    Write-Host "  # Start development service in foreground"
    Write-Host "  ./dev.ps1"
    Write-Host "  # Start development service in background"
    Write-Host "  ./dev.ps1 -d"
    Write-Host "  # Quickly stop containers"
    Write-Host "  ./dev.ps1 -s"
    Write-Host "  # Stop and remove containers"
    Write-Host "  ./dev.ps1 -e"
    Write-Host "  # Show help information"
    Write-Host "  ./dev.ps1 -h`n"
    exit
}

# -------------------------------
# Argument Parsing
# -------------------------------
if ($h) {
    Show-Help
}

# =============================================
# Main Execution Flow
# =============================================

# -------------------------------
# Environment Pre-check
# -------------------------------
Write-Host "`n[+] Checking Docker environment..." -ForegroundColor Magenta
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Error: Docker installation not detected" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Docker is ready" -ForegroundColor Green

# Check if .env.dev file exists, if not, create it from .env.example
if (-not (Test-Path $EnvFile)) {
    Write-Host "[WARN] .env.dev file not found, creating from .env.example..." -ForegroundColor Yellow
    Copy-Item -Path $EnvExampleFile -Destination $EnvFile
    Write-Host "[OK] .env.dev file created" -ForegroundColor Green
}

# -------------------------------
# Service Start and Management
# -------------------------------
# Development service Docker Compose arguments
$DevComposeArgs = @(
    "-f", "$ProjectDir\docker\docker-compose.base.yaml",
    "-f", "$ProjectDir\docker\docker-compose.dev.yaml",
    "--env-file", $EnvFile
)
# Middleware service Docker Compose arguments
$InfraComposeArgs = @(
    "-p", "sciol-infra",
    "-f", "$ProjectDir\docker\docker-compose.infra.yaml",
    "--env-file", $EnvFile
)

# Handle stop and remove containers command
if ($e) {
    Write-Host "-> Stopping and removing development service containers..." -ForegroundColor Yellow
    docker compose @DevComposeArgs down
    Write-Host "-> Stopping and removing middleware service containers..." -ForegroundColor Yellow
    docker compose @InfraComposeArgs down
    exit
}

# Handle stop containers command
if ($s) {
    Write-Host "-> Stopping development service containers..." -ForegroundColor Yellow
    docker compose @DevComposeArgs stop
    Write-Host "-> Stopping middleware service containers..." -ForegroundColor Yellow
    docker compose @InfraComposeArgs stop
    exit
}

# Check and start middleware services
Write-Host "`n[+] Checking infrastructure services status..." -ForegroundColor Cyan
$RunningInfraServices = docker compose @InfraComposeArgs ps --status=running -q
if ($RunningInfraServices) {
    Write-Host "[OK] Infrastructure services are already running." -ForegroundColor Green
} else {
    Write-Host "-> Infrastructure services are not running, starting in background..." -ForegroundColor Yellow
    docker compose @InfraComposeArgs up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] Failed to start infrastructure services." -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] Infrastructure services started successfully." -ForegroundColor Green
}

# Start development services
Write-Host "`n==> Starting development container services..." -ForegroundColor Blue
if ($d) {
    Write-Host "-> Starting in daemon mode" -ForegroundColor Yellow
    docker compose @DevComposeArgs up -d
} else {
    Write-Host "-> Starting in foreground mode" -ForegroundColor Yellow
    docker compose @DevComposeArgs up
}
