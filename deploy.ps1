# ============================================================================
# deploy.ps1 - AniXOS Deploy Script
# ============================================================================
# Usage:
#   .\deploy.ps1                    -> auto message
#   .\deploy.ps1 -Message "fix"     -> custom message
#   .\deploy.ps1 -NoPush            -> commit only
# ============================================================================

param(
    [string]$Message = "",
    [switch]$NoPush
)

# مهم: نخليو Continue ونعتمد على $LASTEXITCODE باش نتحكمو في الأخطاء
$ErrorActionPreference = "Continue"
$RepoRoot = "C:\Users\cherm\Music\AI-Projects\AniXOS"

function Write-Step { param($msg) Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "OK $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "!! $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "XX $msg" -ForegroundColor Red }

# Helper: ينادي git بلا ما يموت على warnings
function Invoke-Git {
    param(
        [Parameter(ValueFromRemainingArguments=$true)]
        [string[]]$Args
    )
    $output = & git @Args 2>&1
    $code = $LASTEXITCODE
    return @{ Output = $output; Code = $code }
}

Set-Location $RepoRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  AniXOS - Deploy Script" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# --- 1. Check status ---
Write-Step "Checking git status..."
$statusResult = Invoke-Git status --porcelain
if ($statusResult.Code -ne 0) {
    Write-Err "git status failed:"
    $statusResult.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
$status = @($statusResult.Output | Where-Object { $_ -and $_.Trim() -ne "" })

if ($status.Count -eq 0) {
    Write-Warn "No changes detected. Nothing to deploy."
    exit 0
}

Write-Host "Detected changes:" -ForegroundColor Gray
$status | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host ""

# --- 2. Warn about build files ---
$dangerousFiles = @(
    "vercel.json",
    ".github/workflows/ci.yml",
    "apps/web/package.json",
    "package.json",
    "capacitor.config.ts",
    "src-tauri/tauri.conf.json",
    ".gitignore"
)

$stagedDangerous = @()
foreach ($line in $status) {
    # صيغة porcelain: "XY path" -> ناخذو من العمود 4
    if ($line.Length -lt 4) { continue }
    $filePath = $line.Substring(3).Trim().Trim('"')
    foreach ($danger in $dangerousFiles) {
        if ($filePath -eq $danger) {
            $stagedDangerous += $filePath
            break
        }
    }
}

if ($stagedDangerous.Count -gt 0) {
    Write-Warn "You are about to modify build/deploy files:"
    $stagedDangerous | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Write-Host ""
    $confirm = Read-Host "Are you sure? (y/N)"
    if ($confirm -ne "y") {
        Write-Err "Cancelled."
        exit 1
    }
}

# --- 3. Add safe files ---
Write-Step "Adding src, public, supabase..."

$safePaths = @(
    "apps/web/src",
    "apps/web/public",
    "supabase"
)

foreach ($path in $safePaths) {
    if (Test-Path $path) {
        # 2>&1 + Out-Null = نبلعو stderr بلا ما نطيحو السكربت
        $r = Invoke-Git add $path
        if ($r.Code -ne 0) {
            Write-Err "git add $path failed:"
            $r.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            exit 1
        }
    }
}

# Add any other files except dangerous ones
foreach ($line in $status) {
    if ($line.Length -lt 4) { continue }
    $filePath = $line.Substring(3).Trim().Trim('"')
    $isDangerous = $false
    foreach ($danger in $dangerousFiles) {
        if ($filePath -eq $danger) { $isDangerous = $true; break }
    }
    if (-not $isDangerous) {
        $r = Invoke-Git add $filePath
        if ($r.Code -ne 0) {
            Write-Err "git add $filePath failed:"
            $r.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            exit 1
        }
    }
}

$stagedResult = Invoke-Git diff --cached --name-only
if ($stagedResult.Code -ne 0) {
    Write-Err "git diff failed:"
    $stagedResult.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
$staged = @($stagedResult.Output | Where-Object { $_ -and $_.Trim() -ne "" })

if ($staged.Count -eq 0) {
    Write-Warn "No files staged."
    exit 0
}

Write-Host "Staged files:" -ForegroundColor Gray
$staged | ForEach-Object { Write-Host "  + $_" -ForegroundColor Gray }
Write-Host ""

# --- 4. Commit ---
if (-not $Message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "chore: update source files ($timestamp)"
}

Write-Step "Creating commit..."
$commitResult = Invoke-Git commit -m $Message
$commitResult.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
if ($commitResult.Code -ne 0) {
    Write-Err "Commit failed."
    exit 1
}
Write-Ok "Commit created."

# --- 5. Pull with rebase ---
Write-Step "Pulling latest changes from GitHub..."
$pullResult = Invoke-Git pull --rebase origin main
$pullResult.Output | Out-Host

if ($pullResult.Code -ne 0) {
    Write-Err "Rebase failed. Conflict detected."
    Write-Host ""
    Write-Host "Resolution steps:" -ForegroundColor Yellow
    Write-Host "  1. Open conflicted files in VS Code" -ForegroundColor Yellow
    Write-Host "  2. Click 'Accept Incoming Change'" -ForegroundColor Yellow
    Write-Host "  3. Run: git add <file>" -ForegroundColor Yellow
    Write-Host "  4. Run: git rebase --continue" -ForegroundColor Yellow
    Write-Host "  5. Run this script again" -ForegroundColor Yellow
    exit 1
}

Write-Ok "Rebase successful."

# --- 6. Push ---
if ($NoPush) {
    Write-Warn "Push skipped (-NoPush)."
    Write-Host "To push later: git push origin main" -ForegroundColor Yellow
    exit 0
}

Write-Step "Pushing to GitHub..."
$pushResult = Invoke-Git push origin main
$pushResult.Output | Out-Host

if ($pushResult.Code -ne 0) {
    Write-Err "Push failed."
    Write-Host "Try: git push origin main --force-with-lease" -ForegroundColor Yellow
    exit 1
}

Write-Ok "Push successful."

# --- 7. Final info ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deploy Successful!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

$logResult = Invoke-Git log -1 --oneline
$latestCommit = ($logResult.Output | Select-Object -First 1)
Write-Host "Latest commit: $latestCommit" -ForegroundColor Gray
Write-Host ""

Write-Host "Vercel will build the new deployment automatically in ~30 seconds." -ForegroundColor Cyan
Write-Host ""
Write-Host "Monitor deployment at:" -ForegroundColor Cyan
Write-Host "  https://vercel.com/dashboard" -ForegroundColor Blue
Write-Host ""

Start-Sleep -Seconds 3

$open = Read-Host "Open Vercel Dashboard? (y/N)"
if ($open -eq "y") {
    Start-Process "https://vercel.com/dashboard"
}

Write-Ok "Done."