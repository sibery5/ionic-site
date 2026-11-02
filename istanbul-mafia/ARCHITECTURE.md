# İstanbul Mafya — Mimari ve Kurallar

Three.js r160 + Electron 30. Kaynak: `src/`, derleme: `node scripts/build.js` (veya `--dev`) -> `app/`.
Masaüstü: `npx electron .` · Windows kurulum: `npm run dist:win`.

## Kurallar
- HİÇBİR hazır varlık (model, doku, ikon, ses) yok. Her şey kodla üretilir (canvas dokular, BufferGeometry, WebAudio).
- Ağdan varlık yükleme yok; oyun çevrimdışı çalışır.
- Arayüz metinleri ve yorumlar Türkçe.
- Performans: InstancedMesh / birleştirilmiş geometri tercih et, her karede bellek ayırma yapma, draw call sayısını düşük tut.
- Koordinatlar: Y yukarı, -Z kuzey. Yön açısı θ için ileri = (sin θ, cos θ). Sağ = (-cos θ, sin θ) yani (-fz, fx).
- Modeller +Z'ye bakar şekilde kurulur; `rotation.y = heading`.

## Modüller
- `core/` util, input, audio (prosedürel), textures (canvas), particles
- `world/` map (yerleşim, yol grafiği, semtler), physics (AABB ızgarası, raycast), city (zemin, binalar, sokak eşyası), landmarks, sky (gün/gece/hava), animals
- `entities/` character (insan modeli + animasyon), actor (can/silah), player, npc (+NPCManager), vehicles (+VehicleManager, trafik AI)
- Araçlar: `entities/vehicles.js` (şablon/gövde, sürüş, süspansiyon, cam, hasar, patlama), `two_wheelers.js` (bisiklet/motosiklet), `military_vehicles.js` (tank, zırhlı, kamyon + `spawnWorldVehicles`), `aircraft.js` (helikopter, taarruz helikopteri, jet), `boats.js`. Yolcu API: `v.seats`, `v.addPassenger(actor)`, `v.removePassenger(actor)` (actor.passengerOf iken NPC YZ'si atlanmalı); `v.riderPose`.
- `game/` weapons, combat, pickups, wanted, missions, interiors, economy, save
- Hikâye dalgası: `game/social.js` (sevgili + ödül avı + J kısayolu; main yalnız `social.update/prompt` çağırır),
  `game/romance.js` (Defne/Selin: flört, kalp ölçeri, randevu sahnesi, el ele/sarılma/öpüşme, yolcu koltuğu),
  `game/bounties.js` (aranan suçlular), `ui/journal.js` (J: telefon görünümlü görev defteri).
  Kapkaç: `side_missions.js` ('mugging' olayı + `prompt()`). Telefon çağrısı: `dialogue.ring(caller, onAnswer, t, {lines, ring})`.
  Ek harita işaretçileri: `missions.addMarkerSet({list, version})`; işaretçi alanları `blink, icon, label, area, mmHide`.
- Çift pozu: `actor.couple = {kind:'hand'|'hug'|'kiss', side:±1}` (character.js katman 5b). Ayak kilidi: duruştaki ayak
  dünyada sabit; animasyon hızı kökün gerçek hareketinden ölçülür (duvara yürürken yerinde koşmaz).
- Mekanik tepki: `actor.knockdown(dx, dz, sn)` (yere savrulma, `kdT`; model `knockdown/hitZone`), `npc.onNearMiss(saldırgan, d)`
  (combat.nearMiss her atışta bir kez çağırır), `combat.trafficPanic` (silah sesinde sürücüler), `animals.onBullet`.
  Kolluk/asker `engageRange` etkili menzilinin ötesinde ateş etmez; `npc._face` ayarlıyken yol bulma tehdide dönük yürütür.
- `ui/` ui (HUD, menüler, dükkânlar), icons (SVG)
- `main.js` Game sınıfı: tüm sistemleri bağlar; `game.updateGame(dt,t)` her kare.

## Game nesnesi API (sık kullanılanlar)
`game.scene, camera, map, physics, city, env, particles, audio, ui, player, npcs, vehicles, combat, pickups, wanted, missions, interiors, state, settings`
`game.activeScene()`, `game.allActors()`, `game.cameraShake(k)`, `game.setGps(x,z)`, `game.enterVehicle(v)`, `game.state.money` ...

## Test
Bkz. `scripts/test/README.md`.
