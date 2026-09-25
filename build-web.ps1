# ============================================================================
# AniXOS - Build WEB
# ============================================================================
# Genere : release\web-dist.zip
# ============================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AniXOS - Build WEB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

try {
    # 1. Nettoyage leger
    Write-Host "[1/3] Preparation..." -ForegroundColor Yellow
    Remove-Item "apps\web\dist" -Recurse -Force -ErrorAction SilentlyContinue

    # 2. Build
    Write-Host "[2/3] Compilation..." -ForegroundColor Yellow
    Push-Location "apps\web"
    npm run build
    $buildExit = $LASTEXITCODE
    Pop-Location

    if ($buildExit -ne 0) {
        throw "Build Vite echoue"
    }

    # 3. Copie vers release
    Write-Host "[3/3] Copie des artefacts..." -ForegroundColor Yellow
    Remove-Item "release\web" -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path "release\web" -Force | Out-Null
    Copy-Item "apps\web\dist\*" "release\web\" -Recurse -Force

    # Archive
    Remove-Item "release\web-dist.zip" -Force -ErrorAction SilentlyContinue
    Compress-Archive -Path "release\web\*" -DestinationPath "release\web-dist.zip" -Force

    # Resume
    $elapsed = (Get-Date) - $startTime
    $size = [math]::Round((Get-Item "release\web-dist.zip").Length / 1MB, 2)

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD WEB REUSSI" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Fichier : release\web-dist.zip" -ForegroundColor White
    Write-Host "  Taille  : $size MB" -ForegroundColor White
    Write-Host "  Duree   : $([math]::Round($elapsed.TotalSeconds, 1)) s" -ForegroundColor White
    Write-Host ""

    Start-Process "release"
    Start-Sleep -Seconds 1
}
catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ECHEC : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Read-Host "Appuyez sur Entree pour fermer"
    exit 1
}