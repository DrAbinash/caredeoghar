@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Start
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║         Care Diagnostics ERP — Docker Start                  ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Check if Docker Desktop is running
powershell -Command "try { $c = docker info 2>$null; if (-not $c) { throw } } catch { Write-Host 'ERROR: Docker Desktop is not running. Please start Docker Desktop first.' -ForegroundColor Red; exit 1 }"
if %errorlevel% neq 0 (
    echo.
    echo Please start Docker Desktop and wait for the whale icon to turn green.
    echo Then run this file again.
    pause
    exit /b 1
)

:: Check .env exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and set your passwords.
    echo.
    echo   copy .env.example .env
    echo.
    pause
    exit /b 1
)

:: Create backups folder if missing
if not exist backups mkdir backups

:: Pull latest images and build
echo [1/4] Pulling PostgreSQL image...
docker compose pull postgres

echo.
echo [2/4] Building Care Diagnostics ERP... This may take 5-10 minutes on first run.
docker compose up -d --build

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Docker build failed. Check the error message above.
    pause
    exit /b 1
)

echo.
echo [3/4] Waiting for services to start...
timeout /t 5 /nobreak >nul

:: Health check loop
set /a retries=0
:healthloop
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8081/api/healthz' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200 -and $r.Content -match 'ok') { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel% equ 0 (
    goto healthy
)
set /a retries+=1
if %retries% gtr 24 (
    echo.
    echo WARNING: Server did not become healthy within 2 minutes.
    echo Check logs: docker compose logs backend
    pause
    exit /b 1
)
powershell -Command "Write-Host '.' -NoNewline"
timeout /t 5 /nobreak >nul
goto healthloop

:healthy
echo.
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                 ERP IS RUNNING!                               ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo Clinic Website (patients):  http://localhost:8081/
echo Staff ERP:                  http://localhost:8081/erp/
echo Super Admin Portal:         http://localhost:8081/super-admin-portal/
echo.
echo Health check:               http://localhost:8081/api/healthz
echo.
echo Press any key to close this window. The server keeps running in Docker.
pause >nul
