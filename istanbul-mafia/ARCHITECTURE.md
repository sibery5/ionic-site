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
- `game/` weapons, combat, pickups, wanted, missions, interiors, economy, save
- `ui/` ui (HUD, menüler, dükkânlar), icons (SVG)
- `main.js` Game sınıfı: tüm sistemleri bağlar; `game.updateGame(dt,t)` her kare.

## Game nesnesi API (sık kullanılanlar)
`game.scene, camera, map, physics, city, env, particles, audio, ui, player, npcs, vehicles, combat, pickups, wanted, missions, interiors, state, settings`
`game.activeScene()`, `game.allActors()`, `game.cameraShake(k)`, `game.setGps(x,z)`, `game.enterVehicle(v)`, `game.state.money` ...

## Test
Bkz. `scripts/test/README.md`.
