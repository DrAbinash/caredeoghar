@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Cleanup Old Backups
echo.
echo ╔════════════════════════════════════════════════════════─═════════════════════╗
echo ║        Automatic Backup Cleanup (keeps last 30 days)              ║
echo ║  The MOST RECENT backup is ALWAYS kept, regardless of age.        ║
echo ╚═════════════════════════════════════════════════════════─═════════════════════╝
echo.

if not exist backups (
    echo No backups folder found. Nothing to clean.
    pause
    exit /b 0
)

:: Count current backups
for /f %%a in ('dir /b backups\*.sql 2^>nul ^| find /c /v ""') do set TOTAL=%%a
echo Found %TOTAL% backup file(s) in backups\ folder.

:: Find and list backups older than 30 days
echo.
echo Scanning for backups older than 30 days...
powershell -Command "
    $cutoff = (Get-Date).AddDays(-30);
    $backups = Get-ChildItem 'backups\*.sql' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending;
    if ($backups.Count -eq 0) {
        Write-Host 'No .sql backup files found.' -ForegroundColor Yellow;
        exit 0;
    }
    $mostRecent = $backups[0];
    $toDelete = $backups | Where-Object { $_.LastWriteTime -lt $cutoff -and $_.FullName -ne $mostRecent.FullName };
    $toKeep = $backups | Where-Object { $_.LastWriteTime -ge $cutoff -or $_.FullName -eq $mostRecent.FullName };
    Write-Host ('Keeping:  ' + $toKeep.Count + ' backup(s)') -ForegroundColor Green;
    foreach ($f in $toKeep) {
        $star = if ($f.FullName -eq $mostRecent.FullName) { ' [MOST RECENT — protected]' } else { '' };
        Write-Host ('  + ' + $f.Name + ' (' + $f.LastWriteTime.ToString('yyyy-MM-dd') + ')' + $star) -ForegroundColor DarkGreen;
    }
    if ($toDelete.Count -gt 0) {
        Write-Host ('Deleting: ' + $toDelete.Count + ' backup(s) older than 30 days') -ForegroundColor Red;
        foreach ($f in $toDelete) {
            Write-Host ('  - ' + $f.Name + ' (' + $f.LastWriteTime.ToString('yyyy-MM-dd') + ')') -ForegroundColor DarkRed;
        }
        $confirm = Read-Host 'Type DELETE to remove these files permanently';
        if ($confirm -eq 'DELETE') {
            foreach ($f in $toDelete) {
                Remove-Item $f.FullName -Force;
                Write-Host ('Deleted: ' + $f.Name) -ForegroundColor DarkGray;
            }
            Write-Host ('Cleanup complete. ' + $toDelete.Count + ' old backup(s) removed.') -ForegroundColor Green;
        } else {
            Write-Host 'Cleanup cancelled. No files were deleted.' -ForegroundColor Yellow;
        }
    } else {
        Write-Host 'No backups are older than 30 days. Nothing to delete.' -ForegroundColor Green;
    }
"

echo.
pause
