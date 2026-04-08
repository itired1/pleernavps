@echo off
chcp 65001 >nul 2>&1
title iTired Music - Cloudflare

echo.
echo  ===========================================
echo       iTired Music - Cloudflare Tunnel
echo  ===========================================
echo.

set SCRIPT_DIR=%~dp0

if not exist "%SCRIPT_DIR%cloudflared.exe" (
    echo [ERROR] cloudflared.exe not found!
    echo.
    echo Put cloudflared.exe in same folder as this bat file
    echo.
    pause
    exit /b 1
)

echo [*] Stopping old processes...
taskkill /f /im python.exe >nul 2>&1

echo [*] Starting Flask server...
start /b cmd /c "cd /d %SCRIPT_DIR% && python app.py"
timeout /t 3 /nobreak >nul

echo [*] Starting Cloudflare tunnel...
echo [*] Wait 5-10 seconds...
echo.

for /f "delims=" %%i in ('"%SCRIPT_DIR%cloudflared.exe" tunnel --url http://localhost:5001 2^>^&1') do (
    echo %%i | findstr "trycloudflare.com" >nul
    if not errorlevel 1 (
        for /f "tokens=5" %%u in ("%%i") do (
            set "TUNNEL_URL=%%u"
            goto :got_url
        )
    )
)

:got_url

if "%TUNNEL_URL%"=="" (
    echo.
    echo [ERROR] Failed to get tunnel URL
    echo.
    pause
    exit /b 1
)

echo.
echo  ===========================================
echo.
echo     READY! URL COPIED TO CLIPBOARD!
echo.
echo     %TUNNEL_URL%
echo.
echo     Send this URL to your friends!
echo.
echo  ===========================================
echo.

echo %TUNNEL_URL% | clip
start %TUNNEL_URL%

echo [*] Server is running. Keep this window open!
echo [*] Press Enter to stop
echo.

pause

taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
