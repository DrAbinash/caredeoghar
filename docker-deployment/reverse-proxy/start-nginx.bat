@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Start Nginx Reverse Proxy
echo.
echo ╔════════════════════════════════════════════════════════════════════╗
echo ║         Optional Nginx Reverse Proxy — Start                       ║
echo ║  Only needed for custom domains, HTTPS, or remote access.       ║
echo ║  Local use: http://localhost:8081/ is enough.                     ║
echo ╚═════════════════════════════════════════════════════════════════════╝
echo.

:: Check main ERP is running
docker ps | findstr "care-diagnostics-backend" >nul
if %errorlevel% neq 0 (
    echo WARNING: Main ERP backend is not running!
    echo Start the main ERP first by running start.bat in the parent folder.
    echo.
    set /p CONTINUE="Continue anyway? (y/n): "
    if /I not "%CONTINUE%"=="y" (
        echo Cancelled.
        pause
        exit /b 1
    )
    echo.
)

:: Start nginx
echo Starting nginx reverse proxy...
docker compose -f docker-compose.nginx.yml up -d

if %errorlevel% equ 0 (
    echo.
    echo ╔════════════════════════════════════════════════════════════════════╗
echo ║  NGINX REVERSE PROXY IS RUNNING!                                  ║
echo ╚════════════════════════════════════════════════════════════════════╝
    echo.
    echo Access the ERP through nginx:
    echo   http://localhost/           ← Clinic website (patients)
    echo   http://localhost/erp/       ← Staff ERP
    echo   http://localhost/super-admin-portal/ ← Super Admin
    echo.
    echo Direct access still works:
    echo   http://localhost:8081/erp/  ← (bypasses nginx)
) else (
    echo ERROR: Failed to start nginx. Check docker-compose.nginx.yml
)

echo.
pause
