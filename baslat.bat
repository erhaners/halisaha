@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference = 'Stop'; try { $scriptPath = [System.IO.Path]::GetFullPath('%~dp0whatsapp-bot.js'); $running = Get-CimInstance Win32_Process -Filter ""Name='node.exe'"" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($scriptPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }; if ($running) { exit 0 } else { exit 1 } } catch { exit 2 }"
if errorlevel 2 (
    echo Bot surecleri kontrol edilemedi. Guvenli baslangic icin islem durduruldu.
    exit /b 1
)
if errorlevel 1 goto internetKontrol

echo WhatsApp botu zaten calisiyor.
exit /b 0

:internetKontrol
ping -n 1 8.8.8.8 >nul
if errorlevel 1 (
    echo ⏳ İnternet bağlantısı bekleniyor (Modem açılıyor olabilir)...
    timeout /t 5 /nobreak >nul
    goto internetKontrol
)

node "%~dp0whatsapp-bot.js"
