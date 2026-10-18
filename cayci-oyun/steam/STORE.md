# ÇAYCI: Steam Mağaza ve Yayın Kiti

Bu klasördeki her şey Steamworks paneline girilecek malzemedir. Görseller ve başarım listesi koddan üretilir:

| Dosya | Ne işe yarar | Nasıl yeniden üretilir |
|---|---|---|
| `capsules/*.png` | Mağaza ve kütüphane kapakları (Steam'in istediği boyutlarda) | `node scripts/capsules.mjs` |
| `screenshots/tr/*.png`, `screenshots/en/*.png` | 1920×1080 mağaza ekran görüntüleri | `W=1920 H=1080 node scripts/demo.mjs` |
| `achievements.json` / `achievements.csv` | 21 başarım (API adları koddakiyle birebir aynı) | `npx tsx scripts/steam-kit.ts` |
| `achievement-icons/*.png` | Başarım ikonları, 256×256, açık ve `_locked` sürümü | `python3 scripts/achievement-icons.py` |

Kapak boyutları: header 920×430, small 462×174, main 1232×706, vertical 748×896, library capsule 600×900, library hero 3840×1240 (yazısız), library logo 1280×720 (şeffaf PNG).

---

## Kısa açıklama

**TR:** İstanbul'da eski bir handa çaycı çırağısın. Askılı tepside çay taşıyorsun ve tepsi gerçek bir sarkaç gibi sallanıyor. Ne kadar çok bardak, o kadar çok bahşiş, ama kule devrilirse kavanozdaki bütün para gider. Kaç bardağa cesaret edersin?

**EN:** You are the tea boy of an old Istanbul han. You carry tea on a hanging tray that swings like a real pendulum. More glasses mean bigger tips, but if the tower falls, your whole tip jar goes with it. How many glasses do you dare to carry?

## Uzun açıklama (TR)

**Askılı tepsiyle, tek damla dökmeden.**

Rıza Usta kırk yıl bu tepsiyle çay taşıdı, şimdi tepsiyi sana bırakıyor. Han altı kat: giriş salonu, kalabalık zemin kat, Gülsüm Abla'nın sildiği ıslak koridorlar, ayağına dolanan han kedisi Paşa, elektriği kesilen üçüncü kat ve rüzgârlı teras. Bir de hanı satın alıp yerine otopark yapmak isteyen bir şirket var. Doğru siparişleri götürürsen müşteriler konuşur, dedikoduları toplarsın ve hanın kaderine sen karar verirsin.

- **Gerçek sarkaç fiziği.** Tepsi elinde sallanır, çay bardakta dalgalanır. Ani duruş döker, yumuşak kalkış korur. Hiçbir şey hazır animasyon değil.
- **Açgözlülük döngüsü.** Bahşişler tepsideki kavanoza girer, ancak ocağa dönünce kasaya geçer. Bir tur daha mı, yoksa şimdi bozdurmak mı?
- **Fırıldak.** Tepsiyi tek tuşla başının üstünden çevir. Zamanlama tutarsa sonraki teslim iki kat öder. Tutmazsa bardaklar havada.
- **Kule.** 6 bardaktan sonra ara tepsiyle ikinci kat başlar. Parmak ucunda yürü, yavaş dön, nefesini tut.
- **6 mekânlı kariyer.** Her katın kendi engeli, iki görevi, üç yıldızı ve yenmen gereken rakipleri var.
- **Günlük Mücadele.** Herkes aynı gün aynı vardiyayı oynar. Her gün üç yeni görev ve ödülleri.
- **21 başarım, 30 seviye, rütbeler ve dolap.** Fes, kasket, aşçı şapkası, bakır ve laleli tepsiler, yaldızlı bardaklar.
- **İki dil.** Türkçe ve İngilizce arayüz.

## Long description (EN)

**A hanging tray. Not a single drop.**

Master Rıza carried tea on this tray for forty years, and now he is handing it to you. Six floors: the entrance hall, the crowded ground floor, wet corridors freshly mopped by Gülsüm, Paşa the han cat weaving between your feet, a third floor with a blown fuse and a windy rooftop terrace. And a company that wants to buy the han and turn it into a parking lot. Serve the right orders, the customers start talking, you collect the gossip, and you decide the fate of the han.

- **Real pendulum physics.** The tray swings in your hand and the tea sloshes in the glass. Sudden stops spill, gentle starts save you. Nothing is canned animation.
- **A greed loop.** Tips go into the jar on your tray and are only banked back at the stove. One more round, or cash in now?
- **The Spin.** Swing the tray over your head with one button. Nail the timing and your next delivery pays double. Miss it and the glasses fly.
- **Towers.** After 6 glasses a second layer goes on a plate. Tiptoe, turn slowly, hold your breath.
- **A 6-venue career.** Every floor has its own hazard, two objectives, three stars and rivals to beat.
- **Daily Challenge.** Everyone plays the same shift on the same day. Three new daily missions with rewards.
- **21 achievements, 30 levels, ranks and a wardrobe.** Fez, flat cap, chef hat, copper and tulip trays, gilded glasses.
- **Two languages.** Turkish and English interface.

## Etiketler (Steam tags)

Casual, Physics, Funny, Arcade, Simulation, Singleplayer, Cute, Colorful, Stylized, 3D, Third Person, Score Attack, Indie, Family Friendly, Short, Cozy, Comedy, Controller

## Sistem gereksinimleri (en düşük, tahmini)

- İşletim sistemi: Windows 10 64-bit (Linux/SteamOS derlemesi de alınabilir)
- İşlemci: 2 çekirdek, 2 GHz
- Bellek: 4 GB RAM
- Ekran kartı: WebGL 2 destekleyen tümleşik grafik (Intel UHD 620 ve üstü)
- Depolama: 400 MB boş alan

Gerçek bir donanımda ölçülmedi. Ayarlar menüsündeki "Düşük" grafik kalitesi gölgeleri kapatır ve çözünürlüğü düşürür.

## Önerilen fiyat

2,99 – 4,99 USD (bölgesel fiyatlandırmada Türkiye için Steam'in önerdiği kur). İlk haftada %10–20 çıkış indirimi.

---

## Steamworks ayarları

- **Başarımlar:** `achievements.csv` içindeki 21 satır. API adı (`FIRST_TEA` vb.) oyun koduyla birebir aynı olmalı. `END_*` başarımları gizli (sürpriz) işaretlenmeli.
- **Steam Cloud:** "Steam Cloud" açılmalı, dosya `cayci-save.json`, kota 1 MB, 1 dosya. Masaüstü sarmalayıcı açılışta buluttaki kaydı okur ve yereldeki kayıttan daha ilerideyse (daha çok XP) onu kullanır.
- **Oyun kolu:** Xbox düzeni (A teslim/demli, X açık çay, B Fırıldak, Y tepsiyi kaldır, LB parmak ucu, RB koşu, Start duraklat). Steam'de "kısmi destek" olarak işaretlenmeli. Steam Deck'te denenmedi.
- **Diller:** Türkçe ve İngilizce arayüz (seslendirme yok; karakterler anlamsız mırıltıyla konuşur).
- **Sıralama:** Şu an yalnızca cihazdaki yerel sıralama var (rakipler hanın sakinleri). Kullanılan `steamworks.js 0.4` kütüphanesinde Steam Leaderboards desteği yok. Çevrimiçi sıralama için ya leaderboard destekleyen başka bir köprü (örneğin Greenworks) ya da küçük bir sunucu gerekir.
- **İçerik anketi (Content Survey):** Oyunun kodu, 3B modelleri, dokuları, müzikleri ve metinleri yapay zekâ yardımıyla üretildi. Steam bunu "AI-generated content" bölümünde açıklamanı istiyor; oyunda çalışma anında üretilen yapay zekâ içeriği yok. Ayrıntılı açıklama yazılmalı.

## Yayın kontrol listesi

1. Steamworks hesabı aç, Steam Direct ücretini öde (uygulama başına 100 USD; oyun 1.000 USD brüt gelire ulaşınca geri ödenir).
2. Ücreti ödedikten sonra ilk oyununu yayınlamadan önce 30 gün beklemen gerekir. Bu süreyi mağaza sayfası ve test için kullan.
3. App ID'yi `desktop/steam_appid.txt` dosyasına yaz.
4. Mağaza sayfasını bu dosyadaki metinler ve görsellerle doldur, "Coming Soon" olarak en az 2 hafta önce yayına al (istek listesi toplamak için).
5. `npm run build` → `cd desktop && npm install && npm run dist` ile Windows/Linux derlemesini al. **Bu adım bu ortamda denenmedi** (Electron indirmesi engelliydi). Kendi bilgisayarında dene.
6. SteamPipe ile derlemeyi yükle, Steam istemcisinde başarımları, bulut kaydını ve oyun kolunu dene.
7. Derleme ve mağaza incelemesine gönder (genellikle birkaç iş günü).
8. Fragman: oyun içinden 30–60 saniyelik kayıt (açılış: kule + Fırıldak + kavanoz kaybı).
