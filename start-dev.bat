@echo off
title FitFocus Dev Mode

echo ============================
echo Starting FitFocus DEV
echo ============================

start cmd /k "wrangler dev --remote"
timeout /t 3 > nul
start cmd /k "cd frontend && npm run dev"

echo.
echo Frontend: http://localhost:5173
echo Backend: Cloudflare Worker (remote)
echo.
pause
