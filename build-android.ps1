# ============================================================================
# AniXOS - Build ANDROID (APK)
# ============================================================================
# Genere : release\android\AniXOS.apk
# ============================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AniXOS - Build ANDROID (APK)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

try {
    # 1. Build web d'abord
    Write-Host "[1/4] Build web..." -ForegroundColor Yellow
    Push-Location "apps\web"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build web echoue" }
    Pop-Location

    # 2. Sync Capacitor
    Write-Host "[2/4] Sync Capacitor..." -ForegroundColor Yellow
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw "Capacitor sync echoue" }

    # 3. Gradle assembleRelease
    Write-Host "[3/4] Compilation APK (2-3 min)..." -ForegroundColor Yellow
    Push-Location "android"
    & .\gradlew.bat assembleRelease
    $gradleExit = $LASTEXITCODE
    Pop-Location
    if ($gradleExit -ne 0) { throw "Gradle echoue" }

    # 4. Copie vers release
    Write-Host "[4/4] Copie APK..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "release\android" -Force | Out-Null
    $apk = Get-ChildItem "android\app\build\outputs\apk\release\*.apk" | Select-Object -First 1
    if (-not $apk) { throw "APK introuvable" }
    Copy-Item $apk.FullName "release\android\AniXOS.apk" -Force

    # Resume
    $elapsed = (Get-Date) - $startTime
    $size = [math]::Round((Get-Item "release\android\AniXOS.apk").Length / 1MB, 2)

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD ANDROID REUSSI" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Fichier : release\android\AniXOS.apk" -ForegroundColor White
    Write-Host "  Taille  : $size MB" -ForegroundColor White
    Write-Host "  Duree   : $([math]::Round($elapsed.TotalMinutes, 1)) min" -ForegroundColor White
    Write-Host ""

    Start-Process "release\android"
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