@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   AniXOS - Deploy (Double-Click)
echo ========================================
echo.

set /p MSG="Commit message (or press Enter for auto): "

if "%MSG%"=="" (
    powershell -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
) else (
    powershell -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -Message "%MSG%"
)

if errorlevel 1 (
    echo.
    echo [FAILED] Deploy failed. Check the output above.
) else (
    echo.
    echo [DONE] Deploy completed successfully.
)

echo.
pause