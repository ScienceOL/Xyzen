# =============================================
# ����������������������ƽű���PowerShell �汾��
# =============================================
param (
    [switch]$d,
    [switch]$h
)
# -------------------------------
# ȫ������
# -------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir
$EnvFile = Join-Path $ProjectDir "docker\.env.dev"

# -------------------------------
# ������Ϣ
# -------------------------------
function Show-Help {
    Write-Host "`nʹ��˵����" -ForegroundColor Green
    Write-Host "  dev.ps1 [ѡ��]"
    Write-Host "`nѡ��˵����" -ForegroundColor Green
    Write-Host "  -h     ��ʾ������Ϣ" -ForegroundColor Yellow
    Write-Host "  -d     ���ػ�����ģʽ������������̨���У�" -ForegroundColor Yellow
    Write-Host "`nʾ����" -ForegroundColor Green
    Write-Host "  ./dev.ps1"
    Write-Host "  ./dev.ps1 -d"
    Write-Host "  ./dev.ps1 -h`n"
    exit
}

# -------------------------------
# ��������
# -------------------------------
$BackgroundMode = $false

param (
    [switch]$d,
    [switch]$h
)

if ($h) {
    Show-Help
}

if ($d) {
    $BackgroundMode = $true
}

# -------------------------------
# ����Ԥ��
# -------------------------------
Write-Host "`n?  ��� Docker ����..." -ForegroundColor Magenta
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "? ����δ��⵽ Docker ��װ" -ForegroundColor Red
    exit 1
}
Write-Host "? Docker �Ѿ���" -ForegroundColor Green

# -------------------------------
# ��������
# -------------------------------
Write-Host "`n? ����������������..." -ForegroundColor Cyan
$ComposeFiles = @(
    "-f", "$ProjectDir\docker\docker-compose.base.yaml",
    "-f", "$ProjectDir\docker\docker-compose.dev.yaml",
    "--env-file", "$EnvFile"
)

if ($BackgroundMode) {
    Write-Host "? ���ػ�����ģʽ����" -ForegroundColor Yellow
    docker compose @ComposeFiles up -d
} else {
    Write-Host "? ��ǰ̨ģʽ����" -ForegroundColor Yellow
    docker compose @ComposeFiles up
}
