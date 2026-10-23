# DramaSeason Android Uygulaması

DramaSeason sitesini telefonda tam ekran açan, Android Studio'da doğrudan açılıp derlenebilen bir Android projesi.

Uygulama siteyi kendi içinde (WebView) gösteriyor. Bu yüzden **tasarım sitenizin tasarımıyla birebir aynı**: anasayfa, dizi detay, player, üye sayfaları, üye girişi, kayıt ve kripto ile ödeme sitede nasıl çalışıyorsa uygulamada da öyle çalışır. Sitede yaptığınız her değişiklik, uygulamayı güncellemeye gerek kalmadan uygulamaya da yansır.

## Uygulamanın yaptıkları

| Özellik | Nasıl |
|---|---|
| Admin paneli yok | `/admin`, `/admin.php`, `/yonetim/...` gibi adresler uygulamada açılmaz, sayfalardaki admin linkleri gizlenir. Liste `gradle.properties` içinde. |
| Üye girişi / kayıt | Site formları kullanılır. Oturum çerezleri kaydedilir, uygulama kapatılıp açılınca üye çıkış yapmış olmaz. |
| Kripto ödeme | Ödeme sağlayıcısının sayfası (NOWPayments, CoinPayments, Coinbase Commerce, Cryptomus, Plisio, OxaPay, CoinGate, Binance Pay, CryptoCloud, Heleket) uygulamanın içinde açılır, böylece ödemeden sonra siteye dönüldüğünde üye oturumu açık kalır. `bitcoin:`, `ethereum:`, `tron:`, `wc:` (WalletConnect), `metamask:`, `trust:` ve `intent:` linkleri telefondaki cüzdan uygulamasını açar. "Adresi kopyala" butonları WebView'de de çalışır. |
| Player | Tam ekran video yatay moda geçer, sistem çubuklarını gizler, video oynarken ekran kapanmaz. Geri tuşu tam ekrandan çıkar. |
| Görünüm | Durum çubuğu ve alt çubuk, sitenin `<meta name="theme-color">` rengini (yoksa sayfanın arka plan rengini) otomatik olarak alır. Klavye açılınca giriş/kayıt formları klavyenin altında kalmaz. |
| Diğer | Profil resmi gibi dosya yüklemeleri, geri tuşuyla sitede geri gitme, bağlantı yoksa "Tekrar Dene" ekranı, açılış ekranı, başka sitelere giden linklerin telefonun tarayıcısında açılması. |

## Kurulum: Android Studio'da açma

1. Bu `DramaSeasonApp` klasörünü bilgisayarınıza kopyalayın (örneğin `C:\Projeler\DramaSeasonApp`).
2. Android Studio > **File > Open** > `DramaSeasonApp` klasörünü seçin.
3. Gradle senkronizasyonunun bitmesini bekleyin. İlk seferde Gradle, Android eklentisi ve Android 16 (API 36) SDK'sı indirilir. SDK eksik derse çıkan **Install** linkine tıklayın.
4. `gradle.properties` dosyasındaki ayarları düzenleyin (aşağıda).
5. Üstteki cihaz listesinden bir emülatör seçip yeşil ▶ **Run** butonuna basın.

## Ayarlar (`gradle.properties`)

```properties
# Android Studio'dan Run ile açılan (debug) sürümün göstereceği adres
dramaseason.siteUrl.debug=http://10.0.2.2/DramaSeason_R27_NEW/DramaSeason/

# APK/AAB olarak yayınlanacak sürümün açacağı canlı site (https)
dramaseason.siteUrl.release=https://www.SITENIZ.com/

# Uygulamada engellenecek admin klasör/dosya adları
dramaseason.adminPaths=admin,yonetim,panel,administrator

# Uygulamanın içinde açılacak kripto ödeme sayfaları
dramaseason.inAppHosts=nowpayments.io,coinpayments.net,...
```

- **Admin klasörünüzün adı farklıysa** (örneğin `/ds-admin/`), `dramaseason.adminPaths` listesine ekleyin. Sitede `admin` kelimesini dizi adresinde kullanan bir sayfa varsa listeden çıkarın.
- **Ödeme sağlayıcınız listede yoksa** ödeme sayfasının alan adını (`odeme.ornek.com` gibi) `dramaseason.inAppHosts` listesine ekleyin. Eklemezseniz ödeme sayfası telefonun tarayıcısında açılır. Ödeme yine tamamlanır (sağlayıcı sitenize IPN/callback gönderir), ama tarayıcıda üye oturumu olmaz.
- Değişiklikten sonra Android Studio'daki **Sync Now** uyarısına tıklayın.

### Renkler ve ikon

- `app/src/main/res/values/colors.xml`: `ds_background` rengini sitenizin arka plan rengiyle, `ds_accent` rengini ana vurgu renginizle (buton, yükleme çubuğu) değiştirin.
- Uygulama adı: `app/src/main/res/values/strings.xml` > `app_name`.
- Logo: `app/src/main/res` klasörüne sağ tıklayın > **New > Image Asset** > logonuzu seçin. Mevcut geçici "oynat" ikonunun yerine geçer.

## Bilgisayardaki WAMP sitesiyle test etme

WAMP açıkken emülatör, bilgisayarınızdaki `localhost` adresine **`10.0.2.2`** üzerinden ulaşır. Varsayılan debug adresi bu yüzden `http://10.0.2.2/DramaSeason_R27_NEW/DramaSeason/`.

**Sayfa açılıyor ama CSS/resimler gelmiyorsa ya da linkler `localhost`'a gidiyorsa** sitenizin ayar dosyasında site adresi `http://localhost/...` diye sabit yazılmıştır. İki çözüm var:

1. Sitenin ayarında adresi sabit yazmak yerine gelen istekten üretin:
   ```php
   $site_url = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
             . '://' . $_SERVER['HTTP_HOST'] . '/DramaSeason_R27_NEW/DramaSeason/';
   ```
2. Ya da `dramaseason.siteUrl.debug=http://localhost/DramaSeason_R27_NEW/DramaSeason/` yapın ve emülatör açıkken bir terminalde şunu çalıştırın (emülatör her açıldığında bir kez):
   ```
   adb reverse tcp:80 tcp:80
   ```
   `adb`, Android SDK'nın `platform-tools` klasöründedir (genelde `%LOCALAPPDATA%\Android\Sdk\platform-tools`). Android Studio'nun alt kısmındaki **Terminal** sekmesinden de çalıştırabilirsiniz.

**Gerçek telefonda test:** Telefon ve bilgisayar aynı Wi-Fi'da olsun. Debug adresine bilgisayarın yerel IP'sini yazın (`ipconfig` > IPv4, örneğin `http://192.168.1.20/DramaSeason_R27_NEW/DramaSeason/`). WAMP menüsünden **Put Online** yapın, Windows Güvenlik Duvarı'nda Apache'ye izin verin. USB ile bağlıysanız yukarıdaki `adb reverse` yöntemi de çalışır.

**Hata ayıklama:** Debug sürümünde Chrome'da `chrome://inspect` adresini açıp uygulamadaki sayfayı bilgisayardan inceleyebilirsiniz (konsol hataları, ağ istekleri). Bağlantı hata ekranında debug sürümü hatanın ayrıntısını da gösterir.

## Sunucu tarafında uygulamayı tanıma

Uygulama her isteğin User-Agent bilgisine `DramaSeasonApp/1.0.0` ekler. PHP'de uygulamaya özel bir şey göstermek ya da gizlemek için (örneğin "Uygulamayı indir" bannerını uygulamada gizlemek):

```php
$isApp = strpos($_SERVER['HTTP_USER_AGENT'] ?? '', 'DramaSeasonApp') !== false;
```

Admin panelini sunucu tarafında da uygulamaya kapatmak isterseniz admin girişinin başına `if ($isApp) { header('Location: /'); exit; }` ekleyebilirsiniz. Asıl güvenlik zaten admin şifresinde; uygulamadaki engel, adminin uygulamada görünmemesi içindir.

## Yayınlama (APK / AAB)

1. `dramaseason.siteUrl.release` değerine canlı sitenizin `https://` adresini yazın. Bu değer `SITENIZ` olarak kaldıkça release derlemesi bilerek hata verir.
2. Canlı sitenizde SSL (https) olmalı. Yayın sürümü güvenlik için şifresiz `http` trafiğine izin vermez.
3. Android Studio > **Build > Generate Signed App Bundle or APK**:
   - Sitenizden dağıtmak için **APK**, Google Play için **Android App Bundle**.
   - İlk seferde **Create new...** ile bir imza anahtarı (keystore) oluşturun. **Bu dosyayı ve şifresini kaybetmeyin**, uygulamanın sonraki her güncellemesi aynı anahtarla imzalanmalı.
4. Sürüm güncellerken `app/build.gradle.kts` içindeki `versionCode` değerini 1 artırın, `versionName` değerini değiştirin.
5. Paket adı `com.dramaseason.app`. Değiştirmek isterseniz `app/build.gradle.kts` içindeki `applicationId` satırını ilk yayından **önce** değiştirin.

### Google Play hakkında önemli not

Google Play, uygulama içinde satılan dijital içerik ve üyelikler için **Google Play Faturalandırma** sistemini zorunlu tutuyor. Uygulama içinden kripto ile üyelik satmak bu kurala aykırı ve Play'de reddedilme ya da kaldırılma sebebi olabilir. Seçenekler:

- APK'yı kendi sitenizden indirilebilir şekilde dağıtmak (kullanıcı "bilinmeyen kaynaklara izin ver" der). Bu durumda kripto ödeme sorunsuz çalışır.
- Play'de yayınlayacaksanız ödeme sayfalarını uygulamada gizlemek (`$isApp` kontrolüyle) ve üyeliği sitede satmak.

Play'e yüklenen dizi/film içeriklerinin yayın haklarının sizde olması da gerekiyor, aksi halde uygulama telif şikayetiyle kaldırılabilir.

## Sorun giderme

- **"This version of the Android Gradle plugin requires a newer Android Studio"**: Android Studio'yu güncelleyin (Help > Check for Updates).
- **"Unsupported class file major version"** veya Gradle'ın Java sürümünden şikayet etmesi: File > Settings > Build, Execution, Deployment > Build Tools > Gradle > **Gradle JDK** = 17 veya 21 seçin.
- **Android Studio Gradle eklentisini güncellemeyi önerirse** (AGP Upgrade Assistant), kabul edebilirsiniz.
- **Beyaz/boş ekran**: WAMP açık mı, debug adresi tarayıcıda (`http://localhost/DramaSeason_R27_NEW/DramaSeason/`) açılıyor mu, kontrol edin.

## Proje yapısı

```
DramaSeasonApp/
├── gradle.properties                    ← site adresi, admin yolları, ödeme siteleri
├── app/build.gradle.kts                 ← sürüm numarası, paket adı
└── app/src/
    ├── main/java/com/dramaseason/app/
    │   ├── MainActivity.kt              ← WebView ekranı, tam ekran player, geri tuşu, dosya yükleme
    │   ├── UrlPolicy.kt                 ← hangi link uygulamada / tarayıcıda / cüzdanda açılır, admin engeli
    │   └── PageScripts.kt               ← sayfaya eklenen JS (kopyala butonu, tema rengi, admin linki gizleme)
    ├── main/res/                        ← renkler, metinler, ikon, ekran düzeni
    ├── debug/res/xml/                   ← debug'da WAMP'a http ile bağlanma izni
    └── test/                            ← link kuralları için unit testler (Run 'Tests in app')
```

Teknik bilgiler: Kotlin, minSdk 26 (Android 8.0+), targetSdk 36 (Android 16), Android Gradle Plugin 8.9.1, Gradle 8.14.3. Uygulama yalnızca Android'in kendi bileşenlerini kullanıyor, ek kütüphane yok.
