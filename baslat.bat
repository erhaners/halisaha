@echo off
cls
cd /d "%~dp0"

:internetKontrol
ping -n 1 8.8.8.8 >nul
if errorlevel 1 (
    echo Internet baglantisi bekleniyor...
    timeout /t 5 /nobreak >nul
    goto internetKontrol
)

echo Bot baslatiliyor...
node whatsapp-bot.js
pause
