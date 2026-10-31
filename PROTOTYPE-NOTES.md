# FOURTH — prototype (concept/test phase, not final)
Separate copy of ACOUSMA. Nothing here is pushed or published.
Run: `python3 -m http.server 8000` in this folder → open http://localhost:8000/ (Perform view).
New: src/score/{score,conductor}.js, src/audio/macros.js, src/ui/perform.js.
Small edits to existing files: schema.js (feel), clock.js (late 4th pulse / jitter), presets.js (FOURTH), main.js (views), styles.css (appended).
Known: console warning from Tone "events scheduled inside scheduled callbacks" (harmless, to clean); levels measured headless (peak −5.4 dBFS); no listening test on laptop speakers yet.
