#!/bin/sh
# Mac / Linux: oyunu geliştirme modunda başlatır (Node.js 20+ gerekir). Node.js yoksa hazır dosyayı açar.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı, hazır oyun açılıyor: oyna/CAYCI.html"
  (open oyna/CAYCI.html 2>/dev/null || xdg-open oyna/CAYCI.html) && exit 0
fi
[ -d node_modules ] || npm install || exit 1
npm run dev -- --open
