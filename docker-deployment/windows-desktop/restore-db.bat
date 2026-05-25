@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Database Restore
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║              DATABASE RESTORE — WARNING!                     ║
echo ║  This will REPLACE all current data with the backup file.    ║
echo ║  Make sure you have a fresh backup first!                    ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: List available backups
echo Available backup files in backups\ folder:
echo.
dir /b backups\*.sql 2>nul
if %errorlevel% neq 0 (
    echo No .sql backup files found in the backups folder.
    pause
    exit /b 1
)
echo.

set /p BACKUP_NAME="Enter the backup filename (including .sql extension): "

if not exist "backups\%BACKUP_NAME%" (
    echo ERROR: File not found: backups\%BACKUP_NAME%
    pause
    exit /b 1
)

echo.
echo You are about to restore: backups\%BACKUP_NAME%
echo.
set /p CONFIRM="Type YES to proceed: "

if /I not "%CONFIRM%"=="YES" (
    echo Restore cancelled.
    pause
    exit /b 0
)

echo.
echo Stopping backend to prevent data corruption...
docker compose stop backend

echo.
echo Restoring database... This may take a few minutes.
docker compose exec -T postgres psql -U postgres -d HospERP < "backups\%BACKUP_NAME%"

if %errorlevel% equ 0 (
    echo.
    echo SUCCESS! Database restored from: %BACKUP_NAME%
    echo Restarting backend...
    docker compose start backend
    echo.
    echo Restore complete. The ERP is available again.
) else (
    echo.
    echo ERROR: Restore failed. Check the error message above.
    docker compose start backend
)

pause
