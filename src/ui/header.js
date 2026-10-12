// Identity, preset, tempo and transport.
import { el, slider, fmt } from "./controls.js";
import { PRESET_NAMES } from "../state/presets.js";
import { RANGES } from "../state/schema.js";

const MOTIF =
  '<svg width="64" height="14" viewBox="0 0 64 14" aria-hidden="true"><path d="M0 7H6L8 3L10 11L12 7H18L20 3L22 11L24 7H27M36 6L37 9L38 4L39 10L40 5L41 9L42 3L43 11L44 6L46 8L48 5L50 9L52 7H64"/></svg>';

export function header(store, actions) {
  const startBtn = el("button", { type: "button", class: "btn start", onclick: actions.startAudio }, "Start audio");
  const playBtn = el("button", { type: "button", class: "btn play", "aria-pressed": "false", onclick: actions.togglePlay }, "▶ Play");
  const cutBtn = el("button", { type: "button", class: "btn cut", onclick: actions.cut, title: "Silence everything, including echoes and reverb" }, "Cut");
  const preset = el("select", { id: "preset", onchange: () => actions.loadPreset(preset.value) }, PRESET_NAMES.map((n) => el("option", { value: n }, n)));
  const mark = el("span", { class: "motif" });
  mark.innerHTML = MOTIF;

  const bar = el(
    "header",
    { class: "topbar" },
    el("div", { class: "identity" }, el("h1", {}, "ACOUSMA"), mark),
    el("div", { class: "select preset" }, el("label", { for: "preset" }, "Preset"), preset),
    el("div", { class: "tempo" }, slider({ store, path: "tempo", label: "Tempo", min: RANGES.tempo[0], max: RANGES.tempo[1], step: 1, format: fmt.bpm })),
    el("div", { class: "transport" }, startBtn, playBtn, cutBtn)
  );

  return {
    el: bar,
    setAudioOn(on) {
      startBtn.disabled = on;
      startBtn.textContent = on ? "Audio on" : "Start audio";
    },
    setPlaying(p) {
      playBtn.setAttribute("aria-pressed", String(p));
      playBtn.textContent = p ? "■ Stop" : "▶ Play";
    },
    setPreset: (name) => (preset.value = name),
  };
}
