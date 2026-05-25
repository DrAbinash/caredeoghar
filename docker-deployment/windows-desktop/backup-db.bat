@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Database Backup
echo.
echo Creating database backup...
echo.

:: Create backups folder
if not exist backups mkdir backups

:: Generate timestamped filename
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do set mydate=%%c-%%a-%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set mytime=%%a%%b
set BACKUP_FILE=care-diagnostics-backup-%mydate%_%mytime%.sql

echo Backup file: backups\%BACKUP_FILE%
echo.

:: Run pg_dump inside the postgres container
docker compose exec -T postgres pg_dump -U postgres -d HospERP > "backups\%BACKUP_FILE%"

if %errorlevel% equ 0 (
    echo.
    echo SUCCESS! Backup saved to: backups\%BACKUP_FILE%
    echo.
    echo File size:
    dir "backups\%BACKUP_FILE%" | find "%BACKUP_FILE%"
    echo.
    echo Tip: Copy this file to a USB drive or cloud storage for safety.
) else (
    echo.
    echo ERROR: Backup failed. Make sure the system is running (start.bat first).
)

pause
