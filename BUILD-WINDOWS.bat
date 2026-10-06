@echo off
cd /d "%~dp0"
echo KASA PRO V19 Windows uygulamasi derleniyor...
echo.
npm install
if errorlevel 1 goto :error
npm run tauri:build
if errorlevel 1 goto :error
echo.
echo BASARILI. Kurulum dosyalari:
echo src-tauri\target\release\bundle\nsis
echo src-tauri\target\release\bundle\msi
pause
exit /b 0
:error
echo.
echo BUILD BASARISIZ. Yukaridaki hatayi kontrol edin.
pause
exit /b 1
