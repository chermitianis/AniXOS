# ============================================================================
# AniXOS - Build DESKTOP (Installeurs)
# ============================================================================
# Genere : release\desktop\AniXOS_*_setup.exe + AniXOS_*.msi
# ============================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AniXOS - Build DESKTOP (Installeurs)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

try {
    # 1. Build web
    Write-Host "[1/3] Build web..." -ForegroundColor Yellow
    Push-Location "apps\web"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build web echoue" }
    Pop-Location

    # 2. Build Tauri avec bundles
    Write-Host "[2/3] Compilation + Bundling (3-5 min)..." -ForegroundColor Yellow
    npx tauri build
    if ($LASTEXITCODE -ne 0) { throw "Build Tauri echoue" }

    # 3. Copie
    Write-Host "[3/3] Copie installeurs..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "release\desktop" -Force | Out-Null
    Copy-Item "src-tauri\target\release\bundle\nsis\*.exe" "release\desktop\" -Force -ErrorAction SilentlyContinue
    Copy-Item "src-tauri\target\release\bundle\msi\*.msi" "release\desktop\" -Force -ErrorAction SilentlyContinue

    # Resume
    $elapsed = (Get-Date) - $startTime

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD INSTALLEURS REUSSI" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Fichiers :" -ForegroundColor White
    Get-ChildItem "release\desktop" -Filter "AniXOS_*" | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 2)
        Write-Host "    $($_.Name) ($size MB)" -ForegroundColor Gray
    }
    Write-Host "  Duree : $([math]::Round($elapsed.TotalMinutes, 1)) min" -ForegroundColor White
    Write-Host ""

    Start-Process "release\desktop"
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