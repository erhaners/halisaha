@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

wmic process where "name='node.exe'" get commandline 2>nul | find /I "whatsapp-bot.js" >nul
if not errorlevel 1 (
    echo WhatsApp botu zaten calisiyor.
    timeout /t 3 /nobreak >nul
    exit /b 0
)

:internetKontrol
ping -n 1 8.8.8.8 >nul
if errorlevel 1 (
    echo ⏳ İnternet bağlantısı bekleniyor (Modem açılıyor olabilir)...
    timeout /t 5 /nobreak >nul
    goto internetKontrol
)

node "%~dp0whatsapp-bot.js"
pause
