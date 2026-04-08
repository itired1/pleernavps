@echo off
chcp 65001 >nul 2>&1
title iTired Music - Serveo

echo.
echo  ===========================================
echo       iTired Music - Serveo Tunnel
echo  ===========================================
echo.

echo [*] Stopping old processes...
taskkill /f /im python.exe >nul 2>&1

echo [*] Starting Flask server...
start /b cmd /c "python app.py"
timeout /t 3 /nobreak >nul

echo [*] Starting Serveo tunnel...
echo [*] Wait 5 seconds...
echo.

for /f "tokens=*" %%a in ('ssh -o StrictHostKeyChecking=no -R 80:localhost:5001 serveo.net 2^>^&1') do (
    echo %%a
    echo %%a | findstr "serveousercontent.com" >nul
    if not errorlevel 1 (
        for /f "tokens=5" %%u in ("%%a") do (
            set "TUNNEL_URL=%%u"
        )
    )
)

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
echo     READY!
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

taskkill /f /im python.exe >nul 2>&1
