
@echo off
setlocal
title Project Structure Generator
cd /d "%~dp0"

echo.
echo ========================================
echo       PROJECT STRUCTURE GENERATOR
echo ========================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "& { try { $root = (Get-Location).Path; $lines = [System.Collections.Generic.List[string]]::new(); $lines.Add((Split-Path $root -Leaf)); function Add-Tree([string]$Path,[string]$Prefix) { $items = @(Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop | Where-Object { $_.Name -notin @('node_modules','.git','.next','dist','build') } | Sort-Object @{Expression={-not $_.PSIsContainer}}, Name); for ($i=0; $i -lt $items.Count; $i++) { $item = $items[$i]; $last = ($i -eq $items.Count - 1); if ($last) { $branch = '\---'; $next = $Prefix + '    ' } else { $branch = '+---'; $next = $Prefix + '|   ' }; $lines.Add($Prefix + $branch + $item.Name); if ($item.PSIsContainer) { Add-Tree $item.FullName $next } } }; Add-Tree $root ''; [IO.File]::WriteAllLines((Join-Path $root 'structure.txt'), $lines, [Text.UTF8Encoding]::new($true)); Write-Host 'SUCCESS: structure.txt created!' -ForegroundColor Green } catch { Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 } }"

if errorlevel 1 (
    echo.
    echo GENERATION FAILED!
) else (
    echo.
    echo File saved in project folder.
)

echo.
pause
