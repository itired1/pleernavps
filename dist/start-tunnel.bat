@echo off
chcp 65001 >nul
title iTired Music - Cloudflare Tunnel

echo.
echo  ===========================================
echo       iTired Music - Cloudflare Tunnel
echo  ===========================================
echo.

:: Check if cloudflared exists
where cloudflared >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Cloudflare не найден!
    echo.
    echo Установите Cloudflare:
    echo   winget install Cloudflare.cloudflared
    echo.
    echo Или скачайте: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    echo.
    pause
    exit /b 1
)

:: Kill old processes
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1

:: Start Flask server in background
echo [*] Запуск сервера...
start /b python app.py
timeout /t 3 /nobreak >nul

echo [*] Запуск Cloudflare туннеля...
echo [*] Подождите 5-10 секунд...
echo.

:: Run cloudflared and capture URL
for /f "delims=" %%i in ('cloudflared tunnel --url http://localhost:5001 2^>^&1') do (
    echo %%i | findstr /i "trycloudflare" >nul
    if not errorlevel 1 (
        for /f "tokens=3" %%u in ("%%i") do (
            set "TUNNEL_URL=%%u"
            goto :got_url
        )
    )
)

:got_url

if "%TUNNEL_URL%"=="" (
    echo.
    echo [ERROR] Не удалось получить URL туннеля
    echo.
    echo Попробуйте вручную:
    echo   cloudflared tunnel --url http://localhost:5001
    echo.
    pause
    exit /b 1
)

echo.
echo  ===========================================
echo.
echo    GOTOVO! SSYLKA SKOPIROVANA!
echo.
echo    %TUNNEL_URL%
echo.
echo    Otpravte etu ssylku drugam!
echo.
echo  ===========================================
echo.

:: Copy to clipboard
echo %TUNNEL_URL% | clip

:: Open in browser
start %TUNNEL_URL%

echo [*] Server zapushen. Ne zakryvajte eto okno!
echo [*] Nazhmite Ctrl+C dlja ostanovki
echo [*] Ili prosto zakrojte okno
echo.

:: Wait for user
pause
