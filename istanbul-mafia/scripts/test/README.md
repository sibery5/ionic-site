# Headless test

    cd app && python3 -m http.server 8766 &
    node scripts/test/play.js http://localhost:8766/index.html /tmp/out ./scripts/test/your-steps.js

- Chromium uses SwiftShader (software GPU): real rendering is ~1-2 FPS, so do NOT judge FPS here.
- Use `harness.js`: `H.start(p)` begins a new game, `H.install(p)` adds page helpers
  `sim(seconds, fn)` (steps game logic at 30 Hz without rendering), `press(code)`, `hold(code,on)`, `info()`.
- `H.shot(p, path)` renders one frame and screenshots (takes ~10 s).

Hikâye/YZ testi (ilk 3 görev, 1→5 yıldız, barikat, SWAT, 3★ hayatta kalma, kışla, sokak olayı):

    node scripts/test/play.js file://$PWD/app/index.html /tmp/out $PWD/scripts/test/story-steps.js

Hikâye dalgası (görev defteri, Reis çağrısı, kovalamaca görevi, sevgili, ödül avı, kapkaç, silahçı, hayvanlar):

    node scripts/test/play.js file://$PWD/app/index.html .testout/sw $PWD/scripts/test/storywave-steps.js

Yürüme geçişlerinde ayak kayması (başla/yürü/koş/dur/dönüş/çömel/zıpla):

    node scripts/test/play.js file://$PWD/app/index.html .testout/g $PWD/scripts/test/gait-steps.js

Mekanik tepkiler (her karakter türünde baş/kol/bacak tepkisi, patlama/araç ile yere savrulma, oyuncu kontrol kilidi,
topallama, sivil çömel-kaç, trafik paniği, hayvan ürkmesi):

    SETTINGS='{"quality":"low"}' NOSHOT=1 node scripts/test/play.js file://$PWD/app/index.html .testout/mech $PWD/scripts/test/mech-steps.js

Hikâye 1.4 (perdeler, görev sonu çağrı + konak sahnesi, güven/şüphe, eski kayıt, yeni görevler, harita, telefon, açılış süresi;
SHOTS=1 ile cinematic/map/phone ekran görüntüleri):

    SETTINGS='{"quality":"low"}' SHOTS=1 node scripts/test/play.js file://$PWD/app/index.html .testout/s2 $PWD/scripts/test/story2-steps.js

Ses (B2): önemli sesleri çevrimdışı WAV'a yazar (`.testout/audio/`: siren geçişleri, megafon/helikopter anonsları,
silah başına atış, yakın/uzak/iç mekân, patlama, ayak sesleri, kapı, ambiyans, arayüz, 20 sn menü teması);
NaN / 0 dBFS kırpma / 200 ses sonrası düğüm sızıntısı ve oyun içi konumlu siren denetimi:

    SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/a2 $PWD/scripts/test/audio2-steps.js

Şehir hayatı (B3): semt başına bakkal/market, AVM (katlar, yemek katı, ilerleyen kasa sırası, yürüyen merdiven, asansör,
çizim çağrısı), kafe terasları (yol/kaldırım dışı, çiftler), kanepeye oturma / yatağa uzanma; SHOTS=1 ile ekran görüntüleri:

    SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/city $PWD/scripts/test/city-steps.js
Bellek sondası (B1): 90 sn karışık oynanış (sürüş, 3★ çatışma, patlama), her dilimde renderer.info, ses düğümü
sayacı, JS yığını ve Chromium süreç RSS'i (renderer/gpu/browser). `MEM_ONLY=drive|fight|boom`, `MEM_SEC`,
`MEM_RENDER` (kaç adımda bir kare), `MEM_MUTE=1` (ses tamamen kapalı), `EXTRA_ARGS` (Chromium bayrakları):

    SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/mem $PWD/scripts/test/mem-steps.js

Bulgu (1.4 B1): headless SwiftShader'da kare çizilirken renderer RSS'i saniyede yüzlerce MB artabilir ve
cgroup OOM ile ölür; ancak oyunun denetlediği her şey düz kalır (JS yığını, geometri/doku sayısı, program
sayısı, ses düğümleri; ses tamamen kapalıyken de aynı büyüme). Büyüme browser süreciyle birlikte artıp azalır,
OOM ayırması renderer'ın Compositor iş parçacığından gelir: headless kare/IPC birikimi. Uzun testlerde
`sim()` ile mantığı ilerletin, kare çizimini seyrek tutun. Sürüş CPU kare süresi: `driveperf-steps.js`,
sürüş hissi ölçümleri: `drivefeel-steps.js`.
