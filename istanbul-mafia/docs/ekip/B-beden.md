# Görev B — Beden: araçta model değişimi, yumruk dövüşü, bıçak tutuşu, yürüyüş, tırmanma/zıplama, nişangâh

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w16-beden` (dal `w16-beden`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md` (altın kural 1), `BEYIN.md` (§2, §3.1, §3.3, §8, 1.6 ve 1.11 dersleri — özellikle A/B görüntüleme), `/home/user/ionic-site/istanbul-mafia/docs/PLAN-3.0.md` (B1–B5).

## Neden (oyunun sahibinin sözleri)
- "Motosiklete ya da arabaya binince karakterlerin 3B modeli değişiyor (benim karakterim ve NPC'ler)."
- "Yumruk dövüşünde karakterim de NPC'ler de yumruk atmıyor, hasar vermiyor."
- "Bıçağı orta parmaklarının arasında tutuyor; sapından tutsun."
- "Yürüyüşü sarhoş gibi, düşecekmiş gibi yürüyor."
- "Nişangâhı, duvara tırmanmayı, zıplamayı geliştir."

## Bilinen durum (ipuçları)
- Gövde CC0 MakeHuman (`src/entities/charMH.js`, `charParts.js`), iskelet 27 kemik, poz kodla (`src/entities/character.js`).
- LOD: `character.js` ≈ 213–461 (`LOD_D = [14, 38]`, uzaklık kameradan). Araçta kamera uzak ve arkada: sürücü/yolcu LOD 1–2'ye düşüp
  başka (seyreltilmiş ya da kodla üretilen yedek) gövdeye geçiyor olabilir; motor sürücü pozu ≈ 1484. Önce kanıtla: atölye `--gorunus` ile LOD 0/1/2 yan yana,
  oyunda arabaya binmeden/binince `forceLod`, `R.mh`, geometri anahtarı (`lookKey`) değişiyor mu. Kök nedeni bul; araçtaki karakter yakın kameradayken LOD 0 olmalı,
  LOD geçişleri aynı gövdeyi (yalnız üçgen azaltılmış) göstermeli.
- Yakın dövüş: `src/game/combat.js` `melee()` ≈ 745 (menzil, `minDot`, `|Δy| > 1.2` ise vurmuyor). Vuruş anı `character.js` ≈ 754 (`meleeKind`, `meleeDur`).
  Kontrol et: oyuncunun yumruk tuşu `melee()`'yi gerçekten çağırıyor mu, isabet karesi animasyonla eş mi, heading kamerayla mı; NPC yumruk YZ'si (npc.js) saldırıyı başlatıyor mu.
- Bıçak tutuşu: `character.js` ≈ 1039 (bilek/dirsek açıları), silah soketi `SOCK` (MH gövde), atölye `tutus:bicak`, `tutus2:knife`, `--tutus` ölçümü.
- Yürüyüş: `character.js` ≈ 872–975 yürüyüş tablosu (`sway`, `roll`, `lean`, `bob`, `width`) — yanal salınım/yuvarlanma fazla olabilir; kalça-omuz karşıt dönüşü, ayak basışı.
- Tırmanma/zıplama: `src/entities/player.js` (askerî duvar sınırı 3,25 m — sahibinin onayıyla, koru). Nişangâh: `src/ui/` HUD.

## İşler (bu sırayla; her biri bitince commit)
1. **Araçta model değişimi (B1).** Kök nedeni bul ve düzelt; oyuncu ve NPC sürücü/yolcu/motorcu araca binmeden önceki gövde, giysi, saç ile aynı.
   Kabul: yeni `scripts/test/seatlook-steps.js` — arabaya ve motora binen oyuncu + bir NPC için binmeden/binince `lookKey`, MH gövde varlığı, üçgen sayısı oranı; aynı görünüş;
   atölye/oyun içi önce/sonra karesi.
2. **Yumruk dövüşü (B2).** Oyuncu yumruğu (sol tık silahsız) isabet karesinde hasar verir, hedef sarsılır/geri seker; 3–5 yumrukta sivil yere düşer.
   NPC'ler (çete, kavgacı sivil) yumrukla saldırır, oyuncu hasar alır, oyuncu blok/kaçınma (sağ tık blok ya da geri adım). Kombo (sağ-sol-kroşe).
   Kabul: yeni `scripts/test/fist-steps.js` — oyuncu 10 yumrukta ≥ 8 isabet, hedef canı düşer; NPC 10 sn içinde oyuncuya ≥ 2 isabet; `combat` geçer.
3. **Bıçak sapından tutulur (B3).** Ağız başparmak tarafından ileri (dürtme) ya da ters tutuş tutarlı; parmaklar sapı sarar; atölyede `tutus:bicak` yakın kare + oyunda yürürken/saldırırken.
   Kabul: `--tutus` ölçümü — sap merkezi avuç merkezine ≤ 1,5 cm, ağız parmaklarla kesişmiyor.
4. **Doğal yürüyüş (B4).** Yanal salınım ve gövde yuvarlanması gerçek yürüyüş aralığında (pelvis yanal ≤ 3 cm, gövde yuvarlanma ≤ 4°), başı sabit; koşu ve yürüme geçişi yumuşak.
   Kabul: yürüyüş döngüsünde bu değerlerin ölçümü (yeni ya da mevcut `character-steps.js` genişletmesi) + önden/yandan 2 kare.
5. **Tırmanma, zıplama, nişangâh (B5).** Zıplama: hazırlık (diz bükme), yükselme, iniş esneme; koşarken uzun atlama. Tırmanma: elle tutunma, çekinme, diz atma; 3,25 m sınırı korunur.
   Nişangâh: ince, silaha göre (tabanca nokta+çizgi, tüfek artı, pompalı halka), ateşte açılıp toplanır, isabette küçük çarpı işareti (hitmarker), hedef düşmansa kırmızı.
   Kabul: `footstep`/`collision` ve hareket testleri geçer; nişangâh 3 silah için kare.

## Kısıtlar ve sahiplik
- Sahip olduğun dosyalar: `src/entities/character.js`, `src/entities/charParts.js`, `src/entities/charMH.js`, `src/entities/player.js`, `src/game/combat.js` içinde yalnız `melee()` ve yakın dövüş yardımcıları,
  `src/entities/npc.js` içinde yalnız yakın dövüş YZ'si (`[B]` etiketi), HUD nişangâhı (`src/ui/`).
- Dokunma: `src/game/wanted.js`, `military.js`, görev dosyaları, `src/ui/guide.js` (O ekibinin), araç fiziği, villa, ses motoru, şehir kurulumu.
- Karakter başına animasyon ≤ 0,1 ms (`charperf-steps.js`); kare içinde bellek ayırma yok. CSS'te sürekli `transform` animasyonu yok.

## Test (bellek dar: aynı anda tek tarayıcı; atölye de tarayıcıdır; O ekibi de test koşuyor)
- Her tarayıcı işinden önce `pgrep -f "play.js|atolye"` boş olana kadar bekle. "Target crashed" bir kez tekrar.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- Atölye: `node scripts/atolye.js <id> --gorunus q,f,s,el,silah [--tutus]`.
- Sonda birer kez: smoke, character, charperf, combat, body, footstep, collision, yeni testlerin.

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok. Kota kesilirse yarım işi hemen "ARA:" commit'i.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~200 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku. Ekran görüntüsü madde başına ≤ 2.
- `docs/galeri/b-*` önce/sonra görüntüleri (her biri ≤ 200 KB).

## Son rapor (kısa, madde madde)
Her iş: durum, ne değişti, ölçüm/görüntü kanıtı, doğrulayamadıkların, sahibinin oyunda bakması gerekenler.
