@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Stop Nginx Reverse Proxy
echo.
echo Stopping nginx reverse proxy...
docker compose -f docker-compose.nginx.yml down
if %errorlevel% equ 0 (
    echo.
    echo Nginx stopped. The main ERP on http://localhost:8081/ still runs.
) else (
    echo.
    echo There was an error stopping nginx.
)
pause
