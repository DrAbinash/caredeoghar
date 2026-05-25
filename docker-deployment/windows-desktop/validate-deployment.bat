@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Validate Deployment
echo.
echo ╔═════════════════════════════════════════════════════════════════════╗
echo ║         Care Diagnostics ERP — Deployment Validation             ║
echo ╚═════════════════════════════════════════════════════════════════════╝
echo.

set /a FAILURES=0

:: =============================================================================
:: 1. Check Docker is installed
:: =============================================================================
echo [1/10] Checking Docker installation...
powershell -Command "try { $v = docker --version 2>$null; if (-not $v) { throw } Write-Host 'OK: ' $v -ForegroundColor Green } catch { Write-Host 'FAIL: Docker is not installed or not in PATH.' -ForegroundColor Red; exit 1 }"
if %errorlevel% neq 0 (set /a FAILURES+=1)

:: =============================================================================
:: 2. Check Docker Desktop is running
:: =============================================================================
echo.
echo [2/10] Checking Docker Desktop daemon...
powershell -Command "try { $i = docker info 2>$null; if (-not $i) { throw } Write-Host 'OK: Docker daemon is running.' -ForegroundColor Green } catch { Write-Host 'FAIL: Docker Desktop is not running. Start it and wait for the whale icon.' -ForegroundColor Red; exit 1 }"
if %errorlevel% neq 0 (set /a FAILURES+=1)

:: =============================================================================
:: 3. Check Docker Compose is available
:: =============================================================================
echo.
echo [3/10] Checking Docker Compose...
powershell -Command "try { $v = docker compose version 2>$null; if (-not $v) { throw } Write-Host 'OK: ' $v -ForegroundColor Green } catch { Write-Host 'FAIL: docker compose is not available. Update Docker Desktop.' -ForegroundColor Red; exit 1 }"
if %errorlevel% neq 0 (set /a FAILURES+=1)

:: =============================================================================
:: 4. Check .env file exists
:: =============================================================================
echo.
echo [4/10] Checking .env file...
if exist .env (
    echo OK: .env file found.
    powershell -Command "Write-Host 'OK: .env file found.' -ForegroundColor Green"
) else (
    echo FAIL: .env file is missing!
    echo.
    echo Please create .env from the template:
    echo   copy .env.example .env
    echo   notepad .env
    echo.
    set /a FAILURES+=1
)

:: =============================================================================
:: 5. Check required environment variables in .env
:: =============================================================================
echo.
echo [5/10] Checking required environment variables...
if exist .env (
    powershell -Command "
        $content = Get-Content '.env' -Raw;
        $errors = @();
        if ($content -notmatch 'DB_PASSWORD\s*=\s*(\S+)') { $errors += 'DB_PASSWORD is missing or empty' }
        elseif ($content -match 'DB_PASSWORD\s*=\s*CHANGE_ME') { $errors += 'DB_PASSWORD is still set to the default placeholder' }
        if ($content -notmatch 'SESSION_SECRET\s*=\s*(\S+)') { $errors += 'SESSION_SECRET is missing or empty' }
        elseif ($content -match 'SESSION_SECRET\s*=\s*change-me') { $errors += 'SESSION_SECRET is still set to the default placeholder' }
        if ($errors.Count -gt 0) {
            Write-Host 'FAIL:' -ForegroundColor Red;
            $errors | ForEach-Object { Write-Host '  - ' $_ -ForegroundColor Yellow }
            exit 1
        } else {
            Write-Host 'OK: DB_PASSWORD and SESSION_SECRET are set.' -ForegroundColor Green
        }
    "
    if %errorlevel% neq 0 (set /a FAILURES+=1)
) else (
    echo SKIPPED (no .env file to check)
)

:: =============================================================================
:: 6. Check required port 8081 is free
:: =============================================================================
echo.
echo [6/10] Checking port 8081 (ERP web port)...
powershell -Command "try { $conn = Test-NetConnection -ComputerName localhost -Port 8081 -WarningAction SilentlyContinue; if ($conn.TcpTestSucceeded) { Write-Host 'FAIL: Port 8081 is already in use. Another program may be running.' -ForegroundColor Red; exit 1 } else { Write-Host 'OK: Port 8081 is free.' -ForegroundColor Green } } catch { Write-Host 'OK: Port 8081 is free.' -ForegroundColor Green }"
if %errorlevel% neq 0 (set /a FAILURES+=1)

:: =============================================================================
:: 7. Check required folders exist
:: =============================================================================
echo.
echo [7/10] Checking required folders...
set /a FOLDER_ERRORS=0
if not exist uploads (
    echo Creating uploads folder...
    mkdir uploads
)
if not exist backups (
    echo Creating backups folder...
    mkdir backups
)
if not exist logs (
    echo Creating logs folder...
    mkdir logs
)
if not exist dicom-storage (
    echo Creating dicom-storage folder...
    mkdir dicom-storage
)
if not exist init-scripts (
    echo Creating init-scripts folder...
    mkdir init-scripts
)
powershell -Command "Write-Host 'OK: All required folders exist (uploads, backups, logs, dicom-storage, init-scripts).' -ForegroundColor Green"

:: =============================================================================
:: 8. Check docker-compose.yml exists
:: =============================================================================
echo.
echo [8/10] Checking docker-compose.yml...
if exist docker-compose.yml (
    powershell -Command "Write-Host 'OK: docker-compose.yml found.' -ForegroundColor Green"
) else (
    echo FAIL: docker-compose.yml is missing!
    set /a FAILURES+=1
)

:: =============================================================================
:: 9. Check Dockerfile.backend exists
:: =============================================================================
echo.
echo [9/10] Checking Dockerfile.backend...
if exist Dockerfile.backend (
    powershell -Command "Write-Host 'OK: Dockerfile.backend found.' -ForegroundColor Green"
) else (
    echo FAIL: Dockerfile.backend is missing!
    set /a FAILURES+=1
)

:: =============================================================================
:: 10. Check available RAM
:: =============================================================================
echo.
echo [10/10] Checking available system RAM...
powershell -Command "
    $totalMB = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property capacity -Sum).sum / 1MB;
    $availMB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB;
    Write-Host ('Total RAM: ' + [math]::Round($totalMB) + ' MB') -ForegroundColor Cyan;
    Write-Host ('Available RAM: ' + [math]::Round($availMB) + ' MB') -ForegroundColor Cyan;
    if ($availMB -lt 4096) {
        Write-Host 'WARN: Less than 4GB free RAM. Docker may be slow or fail.' -ForegroundColor Yellow;
        Write-Host '      Recommended: at least 6GB free for this ERP.' -ForegroundColor Yellow;
    } else {
        Write-Host 'OK: Sufficient RAM available for Docker containers.' -ForegroundColor Green;
    }
"

:: =============================================================================
:: SUMMARY
:: =============================================================================
echo.
echo ╔═════════════════════════════════════════════════════════════════════╗
if %FAILURES%==0 (
    echo ║  VALIDATION PASSED — Ready to start the ERP!                      ║
    echo ╚═════════════════════════════════════════════════════════════════════╝
    echo.
    echo Next step: double-click start.bat
) else (
    echo ║  VALIDATION FAILED — %FAILURES% check(s) failed.                      ║
    echo ║  Fix the errors above, then run validate-deployment.bat again.       ║
    echo ╚═════════════════════════════════════════════════════════════════════╝
)
echo.
pause
