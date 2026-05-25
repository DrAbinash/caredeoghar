@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Health Check
echo.
echo ╔═════════════════════════════════════════════════════════════════════╗
echo ║           Care Diagnostics ERP — System Health Check               ║
echo ╚═════════════════════════════════════════════════════════════════════╝
echo.

set /a FAILURES=0

:: =============================================================================
:: 1. PostgreSQL container status
:: =============================================================================
echo [1/8] PostgreSQL container...
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Health}}" | findstr "care-diagnostics-db" >nul
if %errorlevel% equ 0 (
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Health}}" | findstr "care-diagnostics-db"
    powershell -Command "Write-Host 'OK: PostgreSQL container is running.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'FAIL: PostgreSQL container (care-diagnostics-db) is not running!' -ForegroundColor Red"
    set /a FAILURES+=1
)

:: =============================================================================
:: 2. Backend container status
:: =============================================================================
echo.
echo [2/8] Backend container...
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Health}}" | findstr "care-diagnostics-backend" >nul
if %errorlevel% equ 0 (
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Health}}" | findstr "care-diagnostics-backend"
    powershell -Command "Write-Host 'OK: Backend container is running.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'FAIL: Backend container (care-diagnostics-backend) is not running!' -ForegroundColor Red"
    set /a FAILURES+=1
)

:: =============================================================================
:: 3. API health endpoint
:: =============================================================================
echo.
echo [3/8] API health endpoint (http://localhost:8081/api/healthz)...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8081/api/healthz' -UseBasicParsing -TimeoutSec 8; if ($r.StatusCode -eq 200 -and $r.Content -match 'ok') { Write-Host 'OK: API health check passed.' -ForegroundColor Green } else { Write-Host ('FAIL: API returned status ' + $r.StatusCode + ' but body was unexpected.') -ForegroundColor Red; exit 1 } } catch { Write-Host 'FAIL: Cannot reach API health endpoint. Is the backend running?' -ForegroundColor Red; exit 1 }"
if %errorlevel% neq 0 (set /a FAILURES+=1)

:: =============================================================================
:: 4. ERP web page reachable
:: =============================================================================
echo.
echo [4/8] Staff ERP page (http://localhost:8081/erp/)...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8081/erp/' -UseBasicParsing -TimeoutSec 8; if ($r.StatusCode -eq 200) { Write-Host 'OK: Staff ERP page is reachable.' -ForegroundColor Green } else { Write-Host ('WARN: ERP page returned status ' + $r.StatusCode) -ForegroundColor Yellow } } catch { Write-Host 'FAIL: Cannot reach ERP page. Is the backend running?' -ForegroundColor Red; exit 1 }"
if %errorlevel% neq 0 (set /a FAILURES+=1)

:: =============================================================================
:: 5. Database connection (via pg_isready from inside container)
:: =============================================================================
echo.
echo [5/8] Database connection inside container...
docker compose exec -T postgres pg_isready -U postgres -d HospERP >nul 2>&1
if %errorlevel% equ 0 (
    powershell -Command "Write-Host 'OK: PostgreSQL is accepting connections.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'FAIL: PostgreSQL is not accepting connections.' -ForegroundColor Red"
    set /a FAILURES+=1
)

:: =============================================================================
:: 6. Uploads folder mount
:: =============================================================================
echo.
echo [6/8] Uploads folder mount...
docker compose exec -T backend ls -la /home/runner/workspace/data/uploads >nul 2>&1
if %errorlevel% equ 0 (
    powershell -Command "Write-Host 'OK: Uploads folder is mounted inside backend container.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'WARN: Could not verify uploads mount. Check docker-compose.yml volumes.' -ForegroundColor Yellow"
)

:: =============================================================================
:: 7. Backups folder mount
:: =============================================================================
echo.
echo [7/8] Backups folder mount...
docker compose exec -T backend ls -la /home/runner/workspace/backups >nul 2>&1
if %errorlevel% equ 0 (
    powershell -Command "Write-Host 'OK: Backups folder is mounted inside backend container.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'WARN: Could not verify backups mount. Check docker-compose.yml volumes.' -ForegroundColor Yellow"
)

:: =============================================================================
:: 8. Logs folder mount
:: =============================================================================
echo.
echo [8/8] Logs folder mount...
docker compose exec -T backend ls -la /home/runner/workspace/logs >nul 2>&1
if %errorlevel% equ 0 (
    powershell -Command "Write-Host 'OK: Logs folder is mounted inside backend container.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'WARN: Could not verify logs mount. Check docker-compose.yml volumes.' -ForegroundColor Yellow"
)

:: =============================================================================
:: SUMMARY
:: =============================================================================
echo.
echo ╔══════════════════════════════════════════════════════════════─═════════════════════╗
if %FAILURES%==0 (
    echo ║  ALL HEALTH CHECKS PASSED — System is healthy!                    ║
    echo ╚═════════════════════════════════════════════════════════════════════╝
    echo.
    echo Access points:
    echo   Clinic website:   http://localhost:8081/
    echo   Staff ERP:        http://localhost:8081/erp/
    echo   Super Admin:      http://localhost:8081/super-admin-portal/
    echo   Health API:       http://localhost:8081/api/healthz
) else (
    echo ║  %FAILURES% HEALTH CHECK(S) FAILED — Review errors above.              ║
    echo ╚═════════════════════════════─═════════════════════════════════════════════╝
    echo.
    echo Troubleshooting steps:
    echo   1. Run view-logs.bat to see recent errors
    echo   2. Run start.bat if containers are not running
    echo   3. Check TROUBLESHOOTING.md for common problems
)
echo.
pause
