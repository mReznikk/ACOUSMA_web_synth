// MIXER (one channel per source, buses, master) and EFFECTS (one rack per bus).
import { el, slider, toggle, select, options, bind, section, traceGlyph, fmt } from "./controls.js";
import { DRUM_IDS, DELAY_DIVISIONS, RANGES } from "../state/schema.js";

const meters = []; // { id, fill }
/** Called each animation frame with a function that reads a meter (0..1). */
export function updateMeters(read) {
  for (const m of meters) {
    const v = read(m.id);
    const db = v > 0 ? 20 * Math.log10(v) : -Infinity;
    m.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, (db + 60) / 60))})`;
  }
}
const meter = (id) => {
  const fill = el("i");
  meters.push({ id, fill });
  return el("span", { class: "meter", "aria-hidden": "true" }, fill);
};

function channel(store, id, name, base) {
  const mute = `${base}.mute`;
  const row = el(
    "div",
    { class: "channel" },
    traceGlyph(),
    el("strong", {}, name),
    meter(id),
    slider({ store, path: `${base}.level`, label: "Level" }),
    toggle({ store, path: mute, text: "M", cls: "ms", title: `Mute ${name}` }),
    toggle({ store, path: `${base}.solo`, text: "S", cls: "ms", title: `Solo ${name}` })
  );
  const refresh = () => row.classList.toggle("muted", store.get(mute));
  bind(mute, refresh);
  refresh();
  return row;
}

const bus = (store, id, name, path) => el("div", { class: "channel bus" }, traceGlyph(), el("strong", {}, name), meter(id), slider({ store, path, label: "Level" }));

export function mixer(store) {
  const root = section("Mixer", "Before bus");
  root.append(
    el("span", { class: "group" }, "→ Synth bus"),
    channel(store, "synth1", "Pulse", "synth1"),
    channel(store, "synth2", "Friction", "synth2"),
    el("span", { class: "group" }, "→ Drum bus"),
    ...DRUM_IDS.map((d) => channel(store, d, d, `drums.${d}`)),
    el("span", { class: "group" }, "→ Output"),
    bus(store, "synthBus", "Synth bus", "bus.synthLevel"),
    bus(store, "drumBus", "Drum bus", "bus.drumLevel"),
    bus(store, "master", "Master", "master.level")
  );
  return root;
}

function unit(store, base, name, controls) {
  const bypass = `${base}.bypass`;
  const u = el(
    "div",
    { class: "unit" },
    el("div", { class: "unit-head" }, el("strong", {}, name), toggle({ store, path: bypass, invert: true, onText: "On", offText: "Bypass", cls: "switch", title: `${name} on / bypass` })),
    el("div", { class: "unit-body" }, controls)
  );
  const refresh = () => u.classList.toggle("bypassed", store.get(bypass));
  bind(bypass, refresh);
  refresh();
  return u;
}

function rack(store, bus) {
  const p = (fx, k) => `fx.${bus}.${fx}.${k}`;
  const s = (fx, k, label, o = {}) => slider({ store, path: p(fx, k), label, ...o });
  return el(
    "div",
    { class: "chain" },
    unit(store, `fx.${bus}.dist`, "Distortion", [s("dist", "drive", "Drive"), s("dist", "mix", "Mix")]),
    unit(store, `fx.${bus}.crush`, "→ Bitcrusher", [s("crush", "bits", "Bit Depth", { min: RANGES.bits[0], max: RANGES.bits[1], step: 1, format: fmt.bits }), s("crush", "mix", "Mix")]),
    unit(store, `fx.${bus}.delay`, "→ Delay", [
      select({ store, path: p("delay", "division"), label: "Time", items: DELAY_DIVISIONS.map((d) => [d, d]) }),
      s("delay", "delayFeedback", "Feedback", { min: RANGES.delayFeedback[0], max: RANGES.delayFeedback[1] }),
      s("delay", "mix", "Mix"),
    ]),
    unit(store, `fx.${bus}.reverb`, "→ Reverb", [s("reverb", "decay", "Decay", { min: RANGES.reverbDecay[0], max: RANGES.reverbDecay[1], scale: "exp", format: fmt.time }), s("reverb", "mix", "Mix")])
  );
}

/** Both racks stay in the page; the bus selector only shows one, so neither loses its settings. */
export function effects(store, ui) {
  const racks = { synth: rack(store, "synth"), drum: rack(store, "drum") };
  const root = section("Effects", "Fixed order", options({ store: ui, path: "fxView", label: "", items: [["synth", "Synth bus"], ["drum", "Drum bus"]] }));
  root.append(racks.synth, racks.drum);
  const show = () => Object.entries(racks).forEach(([k, r]) => (r.hidden = ui.get("fxView") !== k));
  ui.subscribe(show);
  show();
  return root;
}
