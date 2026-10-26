# Headless test

    cd app && python3 -m http.server 8766 &
    node scripts/test/play.js http://localhost:8766/index.html /tmp/out ./scripts/test/your-steps.js

- Chromium uses SwiftShader (software GPU): real rendering is ~1-2 FPS, so do NOT judge FPS here.
- Use `harness.js`: `H.start(p)` begins a new game, `H.install(p)` adds page helpers
  `sim(seconds, fn)` (steps game logic at 30 Hz without rendering), `press(code)`, `hold(code,on)`, `info()`.
- `H.shot(p, path)` renders one frame and screenshots (takes ~10 s).

Hikâye/YZ testi (ilk 3 görev, 1→5 yıldız, barikat, SWAT, 3★ hayatta kalma, kışla, sokak olayı):

    node scripts/test/play.js file://$PWD/app/index.html /tmp/out $PWD/scripts/test/story-steps.js
