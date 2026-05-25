@echo off
chcp 65001 >nul
title Care Diagnostics ERP — Live Logs Streaming
echo.
echo ╔════════════════════════════════════════════════════════─═════════════════════╗
echo ║            Live Logs — Press Ctrl+C to stop                       ║
echo ╚═════════════════════════════════════════════════════════─═════════════════════╝
echo.

docker compose logs -f --tail=20

echo.
echo Log streaming stopped. Press any key to close.
pause >nul
