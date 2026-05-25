@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Clean Rebuild
echo.
echo ╔═════════════════════════════════════════════════════════════════════╗
echo ║         Care Diagnostics ERP — Clean Rebuild                       ║
echo ║  This will rebuild the backend WITHOUT deleting your database.    ║
echo ║  Your data in postgres_data, uploads, and backups is SAFE.        ║
echo ╚═════════════════════════════════════════════════════════════════════╝
echo.

set /p CONFIRM="Type REBUILD to proceed (this stops the ERP for 5-10 minutes): "
if /I not "%CONFIRM%"=="REBUILD" (
    echo Rebuild cancelled.
    pause
    exit /b 0
)

:: =============================================================================
:: Step 1: Stop containers
:: =============================================================================
echo.
echo [1/4] Stopping containers...
docker compose down
if %errorlevel% neq 0 (
    echo WARNING: docker compose down had issues, continuing anyway...
)

:: =============================================================================
:: Step 2: Clean old backend image (keep postgres image — it doesn't change)
:: =============================================================================
echo.
echo [2/4] Removing old backend image for clean rebuild...
docker rmi care-diagnostics-backend 2>nul
docker rmi docker-deployment-windows-desktop-backend 2>nul
for /f "tokens=*" %%i in ('docker images -q -f "dangling=true"') do docker rmi %%i 2>nul
echo Old images cleaned.

:: =============================================================================
:: Step 3: Rebuild and start
:: =============================================================================
echo.
echo [3/4] Rebuilding backend image... This may take 5-10 minutes.
docker compose up -d --build
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Rebuild failed. Check the error message above.
    pause
    exit /b 1
)

:: =============================================================================
:: Step 4: Wait for health check
:: =============================================================================
echo.
echo [4/4] Waiting for services to become healthy...
set /a retries=0
:healthloop
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8081/api/healthz' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200 -and $r.Content -match 'ok') { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel% equ 0 (
    goto healthy
)
set /a retries+=1
if %retries% gtr 36 (
    echo.
    echo WARNING: Server did not become healthy within 3 minutes.
    echo Run view-logs.bat to check what went wrong.
    pause
    exit /b 1
)
powershell -Command "Write-Host '.' -NoNewline -ForegroundColor Cyan"
timeout /t 5 /nobreak >nul
goto healthloop

:healthy
echo.
echo.
echo ╔════════════════════════════════════════════════════════─═════════════════════╗
echo ║  REBUILD COMPLETE — ERP is running!                              ║
echo ╚═════════════════════════════════════════════════════════─═════════════════════╝
echo.
echo Your database, uploads, and backups were NOT touched.
echo.
echo Access points:
echo   Clinic website:   http://localhost:8081/
echo   Staff ERP:        http://localhost:8081/erp/
echo   Super Admin:      http://localhost:8081/super-admin-portal/
echo.
pause
