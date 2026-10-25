# Steam'e yükleme

Oyun Steam'de yayınlanmaya hazır bir masaüstü (Electron) uygulamasıdır. Steam'de satış için:

1. https://partner.steamgames.com adresinden Steamworks hesabı aç ve "Steam Direct" ücretini öde (uygulama başına 100 USD).
2. Uygulama (App ID) ve Depot (Depot ID) oluştur; `app_build.vdf` ve `depot_build.vdf` içindeki `APP_ID` / `DEPOT_ID` değerlerini değiştir.
3. `npm run dist:win` ile derle; `dist/win-unpacked/` klasörü Steam depot içeriğidir (Steam kendi kurucusunu kullanır, NSIS gerekmez).
4. Steamworks SDK içindeki `steamcmd` ile yükle:
   `steamcmd +login <kullanici> +run_app_build ../steam/app_build.vdf +quit`
5. Mağaza sayfası, ekran görüntüleri, yaş derecelendirmesi (şiddet içerir) ve fiyatı Steamworks panelinden ayarla.
6. Başarımlar / bulut kayıt için `steamworks.js` (npm) eklenip `electron/main.js` içinde başlatılabilir; şu an kayıtlar `%APPDATA%/Istanbul Mafya/saves` altındadır, Steam Cloud bu klasöre yönlendirilebilir.
