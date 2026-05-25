@echo off
chcp 65001 >nul
title Care Diagnostics ERP — View Logs
echo.
echo ╔════════════════════════════════════════════════════════─═════════════════════╗
echo ║              Recent Logs — Last 50 Lines                         ║
echo ╚═════════════════════════════════════════════════════════─═════════════════════╝
echo.

echo ─── BACKEND LOGS (last 50 lines) ───
docker compose logs --tail=50 backend 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [Could not fetch backend logs. Are the containers running?]
)

echo.
echo ─── DATABASE LOGS (last 50 lines) ───
docker compose logs --tail=50 postgres 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [Could not fetch database logs. Are the containers running?]
)

echo.
echo ─── CONTAINER STATUS ───
docker compose ps

echo.
echo Tip: Run live-logs.bat to watch logs in real-time.
echo.
pause
