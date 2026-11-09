# ============================================================================
# deploy.ps1 - AniXOS Deploy Script (FORCE MODE) - FINAL v3
# ============================================================================

param(
    [string]$Message = "",
    [switch]$NoPush
)

$ErrorActionPreference = "Continue"
$RepoRoot = "C:\Users\cherm\Music\AI-Projects\AniXOS"

function Write-Step { param($msg) Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "OK $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "!! $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "XX $msg" -ForegroundColor Red }

# ✅ الدالة الجديدة: تنفيذ git بأمر نصي واحد
function Git-Exec {
    param([string]$Command)
    $output = Invoke-Expression "git $Command" 2>&1
    $code = $LASTEXITCODE
    return @{ Output = $output; Code = $code }
}

Set-Location $RepoRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  AniXOS - Deploy Script (FORCE MODE)" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# --- 1. Nettoyage ---
Write-Step "Cleaning up any previous rebase/merge..."
Git-Exec "rebase --abort" | Out-Null
Git-Exec "merge --abort" | Out-Null
Write-Ok "Cleanup done."

# --- 2. Vérification de l'état ---
Write-Step "Checking git status..."
$statusResult = Git-Exec "status --porcelain"
if ($statusResult.Code -ne 0) {
    Write-Err "git status failed:"
    $statusResult.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
$status = @($statusResult.Output | Where-Object { $_ -and $_.Trim() -ne "" })

if ($status.Count -eq 0) {
    Write-Warn "No local changes detected. Nothing to push."
    if (-not $NoPush) {
        Write-Step "Forcing push to remote (even if no local changes)..."
        $pushResult = Git-Exec "push origin main --force"
        $pushResult.Output | Out-Host
        if ($pushResult.Code -eq 0) { Write-Ok "Force push successful." }
    }
    exit 0
}

Write-Host "Detected local changes:" -ForegroundColor Gray
$status | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host ""

# --- 3. Ajout de TOUS les fichiers locaux ---
Write-Step "Adding all local files (including deleted, modified, untracked)..."
$addResult = Git-Exec "add -A"
if ($addResult.Code -ne 0) {
    Write-Err "git add -A failed:"
    $addResult.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
Write-Ok "All files staged."

# --- 4. Création du commit ---
if (-not $Message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "deploy: force update from local (Cursor) - $timestamp"
}

Write-Step "Creating commit..."
$commitResult = Git-Exec "commit -m `"$Message`""
$commitResult.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
if ($commitResult.Code -ne 0) {
    if ($commitResult.Output -match "nothing to commit") {
        Write-Warn "No changes to commit (maybe already committed)."
    } else {
        Write-Err "Commit failed."
        exit 1
    }
} else {
    Write-Ok "Commit created."
}

# --- 5. Force Push ---
if ($NoPush) {
    Write-Warn "Push skipped (-NoPush)."
    Write-Host "To push later: git push origin main --force" -ForegroundColor Yellow
    exit 0
}

Write-Step "Force pushing to GitHub (overriding remote)..."
Write-Host "This will replace the remote branch with your local version." -ForegroundColor Yellow
$confirm = Read-Host "Are you sure? (y/N)"
if ($confirm -ne "y") {
    Write-Err "Cancelled by user."
    exit 1
}

$pushResult = Git-Exec "push origin main --force"
$pushResult.Output | Out-Host

if ($pushResult.Code -ne 0) {
    Write-Err "Force push failed."
    Write-Host "Check your internet connection or GitHub permissions." -ForegroundColor Yellow
    exit 1
}

Write-Ok "Force push successful."

# --- 6. Nettoyage final ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deploy Successful! (Force Mode)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

$logResult = Git-Exec "log -1 --oneline"
$latestCommit = ($logResult.Output | Select-Object -First 1)
Write-Host "Latest commit: $latestCommit" -ForegroundColor Gray
Write-Host ""
Write-Host "Vercel will build the new deployment automatically." -ForegroundColor Cyan
Write-Host ""

Start-Sleep -Seconds 2
$open = Read-Host "Open Vercel Dashboard? (y/N)"
if ($open -eq "y") {
    Start-Process "https://vercel.com/dashboard"
}

Write-Ok "Done."