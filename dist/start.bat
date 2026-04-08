@echo off
chcp 65001 >nul
title iTired Music

echo.
echo  ===========================================
echo       iTired Music - Server Launcher
echo  ===========================================
echo.

:: Check ngrok exists
where ngrok >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Ngrok not found!
    echo.
    echo 1. Download: https://ngrok.com
    echo 2. Extract to this folder
    echo.
    pause
    exit
)

:: First time setup
ngrok config check >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [!] FIRST TIME: Setup Ngrok
    echo.
    echo  1. Sign up: https://ngrok.com
    echo  2. Copy token from Dashboard
    echo.
    set /p T="Paste token: "
    if not "%T%"=="" ngrok config add-authtoken %T%
)

:: Kill old
taskkill /f /im ngrok.exe >nul 2>&1

echo [*] Starting ngrok...
start /b ngrok http 5001

echo [*] Waiting...
timeout /t 5 /nobreak >nul

:: Get URL
for /f "tokens=1" %%a in ('powershell -c "$r=Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 10;$r.tunnels[0].public_url"') do set URL=%%a

if "%URL%"=="" (
    echo [!] Error! Make sure 'python app.py' is running.
    pause
    exit
)

:: Copy to clipboard
echo %URL% | clip

echo.
echo  ===========================================
echo.
echo   URL COPIED TO CLIPBOARD!
echo.
echo   %URL%
echo.
echo   Send this to your friends!
echo.
echo  ===========================================
echo.

start %URL%
start iTired.exe

pause
