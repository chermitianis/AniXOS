# ============================================================================
# AniXOS - Build DESKTOP (EXE portable)
# ============================================================================
# Genere : release\desktop\AniXOS.exe
# ============================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AniXOS - Build DESKTOP (EXE)" -ForegroundColor Cyan
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

    # 2. Build Tauri (juste le binaire)
    Write-Host "[2/3] Compilation Rust (2-5 min)..." -ForegroundColor Yellow
    npx tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "Build Tauri echoue" }

    # 3. Copie
    Write-Host "[3/3] Copie EXE..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "release\desktop" -Force | Out-Null
    Copy-Item "src-tauri\target\release\anixos.exe" "release\desktop\AniXOS.exe" -Force

    # Resume
    $elapsed = (Get-Date) - $startTime
    $size = [math]::Round((Get-Item "release\desktop\AniXOS.exe").Length / 1MB, 2)

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD EXE REUSSI" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Fichier : release\desktop\AniXOS.exe" -ForegroundColor White
    Write-Host "  Taille  : $size MB" -ForegroundColor White
    Write-Host "  Duree   : $([math]::Round($elapsed.TotalMinutes, 1)) min" -ForegroundColor White
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