@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

set FRONT_PORT=5173
set BACK_PORT=8788
set BACK_URL=http://127.0.0.1:%BACK_PORT%

if "%1"=="" goto START
if /I "%1"=="start" goto START
if /I "%1"=="stop" goto STOP
if /I "%1"=="restart" goto RESTART

echo Usage: %~n0 ^<start^|stop^|restart^>
exit /b 1

:RESTART
call "%~f0" stop
timeout /t 1 >nul
call "%~f0" start
exit /b 0

:STOP
echo ========================================
echo Stopping FitFocus DEV...
echo ========================================

REM Try kill by window title (if exists)
taskkill /FI "WINDOWTITLE eq FitFocus Backend" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq FitFocus Frontend" /T /F >nul 2>nul

REM Fallback: kill anything on ports
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%FRONT_PORT% ^| findstr LISTENING') do (
  taskkill /PID %%a /F >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%BACK_PORT% ^| findstr LISTENING') do (
  taskkill /PID %%a /F >nul 2>nul
)

echo Done.
exit /b 0

:START
echo ========================================
echo Starting FitFocus DEV...
echo ========================================
echo Backend: %BACK_URL%
echo Frontend: http://localhost:%FRONT_PORT%
echo ========================================

REM Install deps if needed
if not exist node_modules (
  echo Installing dependencies...
  npm install
)

REM Windows fix: ensure rollup native exists
echo Ensuring rollup native for Windows...
npm i -D @rollup/rollup-win32-x64-msvc >nul 2>nul

REM Ensure dist exists for Pages dev (fast build)
if not exist dist (
  echo Building frontend (to create dist)...
  npm run build
)

REM Start backend (Wrangler Pages dev)
start "FitFocus Backend" cmd /k ^
  "title FitFocus Backend && cd /d %cd% && npx wrangler pages dev dist --ip 127.0.0.1 --port %BACK_PORT%"

REM Start frontend (Vite dev)
start "FitFocus Frontend" cmd /k ^
  "title FitFocus Frontend && cd /d %cd% && npm run dev"

echo ========================================
echo Started. Use: %~n0 stop  /  %~n0 restart
echo ========================================
exit /b 0
