# ============================================================================
# AniXOS - BUILD ALL (Toutes les versions)
# ============================================================================
# Genere : Web + Android + Desktop (tous les formats)
# ============================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

$totalStart = Get-Date

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  AniXOS - BUILD ALL" -ForegroundColor Magenta
Write-Host "  (Web + Android + Desktop)" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Duree estimee : 8-15 minutes" -ForegroundColor Yellow
Write-Host "  Ne fermez pas cette fenetre." -ForegroundColor Yellow
Write-Host ""

$results = @()

# ---------------------------------------------------------------------------
# 1. WEB
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[1/4] WEB..." -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor DarkGray

$webStart = Get-Date
$webOK = $false
try {
    Remove-Item "apps\web\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Push-Location "apps\web"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build Vite echoue" }
    Pop-Location

    Remove-Item "release\web" -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path "release\web" -Force | Out-Null
    Copy-Item "apps\web\dist\*" "release\web\" -Recurse -Force

    Remove-Item "release\web-dist.zip" -Force -ErrorAction SilentlyContinue
    Compress-Archive -Path "release\web\*" -DestinationPath "release\web-dist.zip" -Force
    $webOK = $true
    Write-Host "OK  Web : release\web-dist.zip" -ForegroundColor Green
}
catch {
    Write-Host "XX  Web : $($_.Exception.Message)" -ForegroundColor Red
}

$results += @{
    Name = "Web"
    OK = $webOK
    Time = (Get-Date) - $webStart
}

# ---------------------------------------------------------------------------
# 2. ANDROID
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[2/4] ANDROID..." -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor DarkGray

$androidStart = Get-Date
$androidOK = $false
try {
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw "Sync echoue" }

    Push-Location "android"
    & .\gradlew.bat assembleRelease
    $gradleExit = $LASTEXITCODE
    Pop-Location
    if ($gradleExit -ne 0) { throw "Gradle echoue" }

    New-Item -ItemType Directory -Path "release\android" -Force | Out-Null
    $apk = Get-ChildItem "android\app\build\outputs\apk\release\*.apk" | Select-Object -First 1
    if (-not $apk) { throw "APK introuvable" }
    Copy-Item $apk.FullName "release\android\AniXOS.apk" -Force
    $androidOK = $true
    Write-Host "OK  Android : release\android\AniXOS.apk" -ForegroundColor Green
}
catch {
    Write-Host "XX  Android : $($_.Exception.Message)" -ForegroundColor Red
}

$results += @{
    Name = "Android"
    OK = $androidOK
    Time = (Get-Date) - $androidStart
}

# ---------------------------------------------------------------------------
# 3. DESKTOP
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[3/4] DESKTOP..." -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor DarkGray

$desktopStart = Get-Date
$desktopOK = $false
try {
    npx tauri build
    if ($LASTEXITCODE -ne 0) { throw "Build Tauri echoue" }

    New-Item -ItemType Directory -Path "release\desktop" -Force | Out-Null
    Copy-Item "src-tauri\target\release\anixos.exe" "release\desktop\AniXOS.exe" -Force
    Copy-Item "src-tauri\target\release\bundle\nsis\*.exe" "release\desktop\" -Force -ErrorAction SilentlyContinue
    Copy-Item "src-tauri\target\release\bundle\msi\*.msi" "release\desktop\" -Force -ErrorAction SilentlyContinue
    $desktopOK = $true
    Write-Host "OK  Desktop : release\desktop\*" -ForegroundColor Green
}
catch {
    Write-Host "XX  Desktop : $($_.Exception.Message)" -ForegroundColor Red
}

$results += @{
    Name = "Desktop"
    OK = $desktopOK
    Time = (Get-Date) - $desktopStart
}

# ---------------------------------------------------------------------------
# 4. RESUME FINAL
# ---------------------------------------------------------------------------
$totalElapsed = (Get-Date) - $totalStart

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  RESUME FINAL" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

foreach ($r in $results) {
    $icon = if ($r.OK) { "[OK]" } else { "[XX]" }
    $color = if ($r.OK) { "Green" } else { "Red" }
    Write-Host "  $icon $($r.Name.PadRight(12)) $([math]::Round($r.Time.TotalMinutes, 1)) min" -ForegroundColor $color
}

Write-Host ""
Write-Host "  Duree totale : $([math]::Round($totalElapsed.TotalMinutes, 1)) min" -ForegroundColor White
Write-Host ""

# Lister tous les artefacts
Write-Host "  Artefacts generes :" -ForegroundColor Cyan
Get-ChildItem "release" -Recurse -File | Where-Object { 
    $_.Extension -in @(".zip", ".apk", ".exe", ".msi")
} | ForEach-Object {
    $rel = $_.FullName.Replace("$root\release\", "")
    $size = [math]::Round($_.Length / 1MB, 2)
    Write-Host "    $rel ($size MB)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  BUILD ALL TERMINE" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

# Ouvrir le dossier release
Start-Process "release"

if ($results | Where-Object { -not $_.OK }) {
    Write-Host "Certaines builds ont echoue. Verifiez ci-dessus." -ForegroundColor Yellow
    Read-Host "Appuyez sur Entree pour fermer"
    exit 1
}