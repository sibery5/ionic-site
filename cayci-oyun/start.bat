@echo off
chcp 65001 >nul
title CAYCI
cd /d "%~dp0"

rem Node.js yoksa: hazir tek dosyalik oyunu ac (internet ve kurulum gerekmez)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi, hazir oyun dosyasi aciliyor: oyna\CAYCI.html
  echo Gelistirme modu icin Node.js 20 veya ustunu kur: https://nodejs.org
  start "" "%~dp0oyna\CAYCI.html"
  timeout /t 5 >nul
  exit /b 0
)

rem Ilk calistirmada paketleri kur
if not exist node_modules (
  echo Ilk calistirma: paketler kuruluyor, bir dakika surebilir...
  call npm install
  if errorlevel 1 (
    echo Paketler kurulamadi. Internet baglantini kontrol et.
    pause
    exit /b 1
  )
)

echo Oyun baslatiliyor. Tarayici kendiliginden acilacak.
echo Kapatmak icin bu pencereyi kapat.
call npm run dev -- --open
pause
