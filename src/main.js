// ACOUSMA — bootstrap.
// store → interface and store → engine. The interface never touches audio
// nodes; the engine only sends back display data (meters, scope, playhead).
import { createStore } from "./state/store.js";
import { loadPreset } from "./state/presets.js";
import { Engine } from "./audio/engine.js";
import { el, refreshBindings } from "./ui/controls.js";
import { header } from "./ui/header.js";
import { signalDisplay } from "./ui/display.js";
import { sources } from "./ui/sources.js";
import { sequence, impact, setPlayhead } from "./ui/sequencer.js";
import { mixer, effects, updateMeters } from "./ui/output.js";

const store = createStore(loadPreset("INIT"));
const ui = createStore({ fxView: "synth" }); // view-only state
const engine = new Engine(store);

async function startAudio() {
  await engine.start();
  top.setAudioOn(true);
  loop();
}
async function togglePlay() {
  await startAudio();
  engine.playing ? engine.stop() : engine.play();
  top.setPlaying(engine.playing);
}
function cut() {
  engine.cut();
  top.setPlaying(false);
}
const changePreset = (name) => engine.fadeForPreset(() => store.replace(loadPreset(name)));

const top = header(store, { startAudio, togglePlay, cut, loadPreset: changePreset });
const display = signalDisplay();
document.getElementById("app").replaceChildren(
  el(
    "main",
    { class: "device" },
    top.el,
    display.el,
    sources(store),
    sequence(store),
    impact(store),
    el("div", { class: "output" }, mixer(store), effects(store, ui)),
    el("footer", { class: "foot" }, el("span", {}, "Space — play / stop    Cut — silence everything, including tails"), el("span", {}, "ACOUSMA 0.1"))
  )
);

store.subscribe((path, _v, state) => {
  refreshBindings(path);
  if (path === "*") top.setPreset(state.name);
});
ui.subscribe(refreshBindings);
engine.onStep = setPlayhead;

// Screen loop: meters, trace and transport label. Audio timing never depends on it.
let looping = false;
function loop() {
  if (looping) return;
  looping = true;
  const frame = () => {
    updateMeters((id) => {
      const v = engine.meters[id]?.getValue();
      return Array.isArray(v) ? Math.max(...v) : v || 0;
    });
    display.frame(engine.playing, engine.clock.progress(), engine.scope.getValue());
    top.setPlaying(engine.playing);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || e.target.closest("input, select, textarea, button")) return;
  e.preventDefault();
  togglePlay();
});

window.__ULTRA__ = { store, engine }; // handle for automated checks
