# Görev V — Oyuncunun villası

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w8-villa` (dal `w8-villa`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` §2 ve §7–§8, `docs/PLAN-1.5.md` §4 "Ekip V" (V1–V4 kabul kriterleri orada).

## Neden
Oyunun sahibi: "Villamız olsun: havuzlu, 10 dönüm arazili, içinde lüks spor arabalar, 2 helikopter (biri normal, biri saldırı helikopteri ve ateş edebilsin),
çitlerle çevrili, çimleri olan, mimar tasarımı, korumaları olan. Villa hem Boğaz kıyısında hem de ormanda olsun. Her şey güzel, kaliteli olsun."

## Yorum (baş mühendis kararı)
Tek malikâne: **Boğaz kıyısında, koruluğun içinde**. Arka ve yanlar sık ağaçlı koru, ön taraf denize açılır; özel iskele ve tekne bağlama yeri.

## İşler (bu sırayla; her biri bitince commit)
1. **Parsel ve yerleşim.** ≈ 100 × 100 m (9,5–10,5 bin m²), dünyayı en az bozan Boğaz kıyısı parseli (mevcut yol ağına bağlanan özel yol).
   Çevre duvarı + ferforje çit, otomatik kapı, bekçi kulübesi, araç yolu ve fıskiyeli döner alan, koru (sık ağaç kuşağı), çim, bahçe aydınlatması, özel iskele.
   Haritada "Villan" işareti. Görünen her nesnenin çarpışması var (altın kural 3).
2. **Ana bina (mimar tasarımı).** Modern-klasik, 3 katlı: geniş cam cepheler, sütunlu giriş, teraslar, denize bakan balkon. İçeri girilir:
   salon, yatak odası (yatak = kayıt), gardırop, ofis. Gece içeriden sıcak ışık.
3. **Havuz.** Denize bakan sonsuzluk havuzu (yüzülür), havuz evi, şezlonglar, şemsiyeler.
4. **Galeri ve araçlar.** 6 araçlık cam galeri; içinde 4 kurgusal lüks spor araba (mevcut araç türlerinden; oyuncunun malı, binip çıkılır).
5. **Helikopterler.** 2 pist: sivil helikopter ve saldırı helikopteri. Mevcut uçuş sistemini kullan (`entities/aircraft.js`); saldırı helikopteri oyuncu kullanırken
   top (sol tık) ve roket (sağ tık ya da ayrı tuş) atar, hedefe hasar verir. Uçuş kontrolü zaten varsa dokunma, yalnız silahı ekle.
6. **Korumalar.** 8 koruma (kapı 2, çevre 4, bina 2), koyu takım; oyuncuyu "Hoş geldin patron" diye karşılar; villaya saldıranla çatışır.
7. **Sahiplik.** Villa hikâyenin uygun noktasında (ya da başlangıçta, kararını gerekçesiyle yaz) oyuncunun olur; güvenli ev gibi çalışır.

## Kalite ve hazır içerik
- İnsanlar gerçekçi model (CC0 MakeHuman, `charMH.js`): korumalar için mevcut görünüş sistemini kullan (takım elbise → `suit`).
- Mobilya ve bahçe için CC0 Poly Haven modelleri kullanılabilir (`scripts/assets/pack-props.py` tablosuna satır eklenir, GLB `assets/props/` altına gelir,
  `src/core/props.js` yükler; `api.polyhaven.com` ve `dl.polyhaven.org` erişilebilir). Örnek adaylar: koltuk, yatak, masa, şezlong, saksı bitkisi, iskele.
  **Kurulum dosyası sınırı:** yeni varlıkların toplamı ≤ 3 MB (model başına ≤ 250 KB: ağı sadeleştir, doku 512). Sınırı aşacaksan kodla üret.
- Bina, duvar, havuz, pist kodla üretilir; şehir doku setleri (`src/core/textures.js` içindeki fotoğraf dokuları: sıva, taş, çim, kiremit) kullanılır.
- Her yeni modeli görüntüleyip bak (atölye ya da oyun içi görüntü; kareyi çizdiğin görevde `toDataURL` ile oku). "Kod çalışıyor" kabul değildir.

## Kısıtlar
- Kare içinde bellek ayırma yok; statik geometri birleştirilir/örneklenir; villa uzaktayken ucuz (uzaklık düzeyi ya da görünürlük kapısı).
- FPS: villa bölgesinde çizim çağrısı artışı ≤ 120; ölç ve raporla.
- Sahip olduğun dosyalar: yeni `src/world/villa.js`, yeni `src/game/villa.js`, harita/dünya kurulumunda tek kanca, `aircraft.js` içinde yalnız silah ekleme.
  Çatışma hissi, karakter modeli, ses ve intro koduna dokunma (başka ekipler değiştirdi).

## Test (bellek dar: aynı anda tek test, düşük kalite)
- `pgrep -f "scripts/test/play.js"` doluysa bekle. Tarayıcı süreçlerini öldürme. "Target crashed" bellek çökmesidir: bir kez tekrar et.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- `villa-steps.js`: kapıdan gir, galeriden araç al, havuzda yüz, yatakta kayıt, helikoptere bin ve kalk, saldırı helikopteri hedefe hasar verir,
  korumalar saldırana tepki verir, parsel alanı, çarpışma denetimi. 4 ekran görüntüsü al ve Read ile bak (genel, bina, havuz, galeri/pist).
- Sonda birer kez: smoke, villa, collision (`AUDIT_ONLY=1`), bridge.

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~180 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku.

## Son rapor (kısa, madde madde)
Her iş: durum, ne değişti, test kanıtı. Villanın koordinatı ve oyuncunun oraya nasıl gideceği. Görüntülerde hâlâ zayıf kalanlar. Doğrulayamadıkların.
