@echo off
cd /d "%~dp0"

echo === PulseCore - Instalowanie zależności frontendu ===
call npm install
if %errorlevel% neq 0 (
    echo BLAD: npm install nie powiodlo sie
    pause
    exit /b 1
)

echo === PulseCore - Uruchamianie aplikacji ===
echo Tryb deweloperski: npm run tauri dev
echo Aby zbudowac: npm run tauri build
echo.

npm run tauri dev

pause
