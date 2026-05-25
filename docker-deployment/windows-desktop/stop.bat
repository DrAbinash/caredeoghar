@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Stop
echo.
echo Stopping Care Diagnostics ERP containers...
echo.

cd /d "%~dp0"
docker compose down

if %errorlevel% equ 0 (
    echo.
    echo All containers stopped. Your data is safely preserved in Docker volumes.
) else (
    echo.
    echo There was an error stopping the containers.
    echo Try running: docker compose down
)

pause
