# ============================================================================
# AniXOS - Build DESKTOP (EXE + Installeurs)
# ============================================================================
# Genere : release\desktop\*  (tout)
# ============================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AniXOS - Build DESKTOP (Complet)" -ForegroundColor Cyan
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

    # 2. Build Tauri complet (avec bundles)
    Write-Host "[2/3] Compilation + Bundling (3-5 min)..." -ForegroundColor Yellow
    npx tauri build
    if ($LASTEXITCODE -ne 0) { throw "Build Tauri echoue" }

    # 3. Copie tout
    Write-Host "[3/3] Copie des artefacts..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "release\desktop" -Force | Out-Null

    # EXE portable
    Copy-Item "src-tauri\target\release\anixos.exe" "release\desktop\AniXOS.exe" -Force

    # Installeurs
    Copy-Item "src-tauri\target\release\bundle\nsis\*.exe" "release\desktop\" -Force -ErrorAction SilentlyContinue
    Copy-Item "src-tauri\target\release\bundle\msi\*.msi" "release\desktop\" -Force -ErrorAction SilentlyContinue

    # Resume
    $elapsed = (Get-Date) - $startTime

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD DESKTOP COMPLET REUSSI" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Fichiers :" -ForegroundColor White
    Get-ChildItem "release\desktop" -File | ForEach-Object {
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