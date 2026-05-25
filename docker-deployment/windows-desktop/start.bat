@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Start
echo.
echo ╔═════════════════════════════════════════════════════════════════════╗
echo ║         Care Diagnostics ERP — Docker Production Start            ║
echo ╚═════════════════════════════════════════════════════════════════════╝
echo.

:: =============================================================================
:: Check if Docker Desktop is running
:: =============================================================================
powershell -Command "try { $c = docker info 2>$null; if (-not $c) { throw } } catch { Write-Host 'ERROR: Docker Desktop is not running. Please start Docker Desktop first.' -ForegroundColor Red; exit 1 }"
if %errorlevel% neq 0 (
    echo.
    echo Please start Docker Desktop and wait for the whale icon to turn green.
    echo Then run this file again.
    pause
    exit /b 1
)

:: =============================================================================
:: Check .env exists
:: =============================================================================
if not exist .env (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and set your passwords.
    echo.
    echo   copy .env.example .env
    echo.
    pause
    exit /b 1
)

:: =============================================================================
:: Validate required environment variables
:: =============================================================================
echo [Pre-check] Validating .env configuration...
powershell -Command "
    $content = Get-Content '.env' -Raw;
    $warnings = @();
    if ($content -match 'DB_PASSWORD\s*=\s*CHANGE_ME') { $warnings += 'DB_PASSWORD is still the default placeholder' }
    if ($content -match 'SESSION_SECRET\s*=\s*change-me') { $warnings += 'SESSION_SECRET is still the default placeholder' }
    if ($warnings.Count -gt 0) {
        Write-Host 'WARN: ' -ForegroundColor Yellow -NoNewline;
        Write-Host ($warnings -join '; ') -ForegroundColor Yellow;
        Write-Host '  → Edit .env and replace default values before using in production.' -ForegroundColor DarkYellow;
    } else {
        Write-Host 'OK: DB_PASSWORD and SESSION_SECRET appear to be customized.' -ForegroundColor Green;
    }
"

:: =============================================================================
:: Create required folders
:: =============================================================================
if not exist uploads     mkdir uploads
if not exist backups    mkdir backups
if not exist logs       mkdir logs
if not exist dicom-storage  mkdir dicom-storage
if not exist init-scripts   mkdir init-scripts

:: =============================================================================
:: Pull latest images and build
:: =============================================================================
echo.
echo [1/4] Pulling PostgreSQL image...
docker compose pull postgres

echo.
echo [2/4] Building Care Diagnostics ERP... This may take 5-10 minutes on first run.
docker compose up -d --build

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Docker build failed. Check the error message above.
    echo Run validate-deployment.bat to check your setup.
    pause
    exit /b 1
)

:: =============================================================================
:: Wait for PostgreSQL to be healthy (backend depends_on condition waits too)
:: =============================================================================
echo.
echo [3/4] Waiting for PostgreSQL to be ready...
set /a pgRetries=0
:pgwaitloop
docker compose ps | findstr "care-diagnostics-db" | findstr "healthy" >nul
if %errorlevel% equ 0 (
    echo PostgreSQL is healthy.
    goto pgready
)
set /a pgRetries+=1
if %pgRetries% gtr 60 (
    echo.
    echo WARNING: PostgreSQL did not become healthy within 5 minutes.
    echo Check logs: docker compose logs postgres
    pause
    exit /b 1
)
powershell -Command "Write-Host '.' -NoNewline -ForegroundColor Cyan"
timeout /t 5 /nobreak >nul
goto pgwaitloop
:pgready

:: =============================================================================
:: Health check loop for backend API
:: =============================================================================
echo.
echo [4/4] Waiting for backend API to become ready...
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
    echo.
    echo Troubleshooting:
    echo   • Run view-logs.bat
    echo   • Run validate-deployment.bat
    echo   • Check TROUBLESHOOTING.md
    pause
    exit /b 1
)
powershell -Command "Write-Host '.' -NoNewline -ForegroundColor Cyan"
timeout /t 5 /nobreak >nul
goto healthloop

:healthy
:: =============================================================================
:: STARTUP BANNER
:: =============================================================================
echo.
echo.
echo ╔═════════════════════════════════════════════════════════════════════╗
echo ║            CARE DIAGNOSTICS ERP IS RUNNING!                       ║
echo ╚═════════════════════════════════════════════════════════════════════╝
echo.
echo ┌─────────────────────────────────────────────────────────────────────┐
echo │  ACCESS POINTS                                                    │
echo │  ───────────────────────────────────────────────────────────────────────────────│
echo │  Clinic Website (patients):   http://localhost:8081/               │
echo │  Staff ERP:                   http://localhost:8081/erp/          │
echo │  Super Admin Portal:          http://localhost:8081/super-admin-portal/ │
echo │  Health API:                  http://localhost:8081/api/healthz    │
echo │                                                                    │
echo │  STATUS                                                           │
echo │  ───────────────────────────────────────────────────────────────────────────────│
echo │  PostgreSQL:                  Healthy (internal port 5432)         │
echo │  Backend API:                 Healthy (port 8080 → 8081)           │
echo │  Containers:                   Auto-restart on reboot enabled         │
echo │                                                                    │
echo │  DATA FOLDERS                                                     │
echo │  ───────────────────────────────────────────────────────────────────────────────│
echo │  Uploads:     .\uploads\     (reports, photos, website media)       │
echo │  Backups:     .\backups\    (database .sql dumps)                   │
echo │  Logs:        .\logs\      (application logs)                       │
echo │  DICOM:       .\dicom-storage\  (future PACS imaging files)        │
echo │  Init scripts:.\init-scripts\    (future database extensions)       │
echo └─────────────────────────────────────────────────────────────────────┘
echo.
echo Press any key to close this window. The server keeps running in Docker.
echo (Auto-restart is enabled — containers will restart after PC reboot.)
pause >nul
