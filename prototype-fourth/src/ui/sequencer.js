// SEQUENCE (two synth rows + one shared step editor) and IMPACT (four drum rows).
// Steps are positions in time, numbered 1–16 in four beat groups. Pitch is a
// numeric offset per step, never a keyboard or vertical grid.
import { el, slider, toggle, bind, section, traceGlyph, fmt } from "./controls.js";
import { STEPS, DRUM_IDS, RANGES } from "../state/schema.js";
import { randomSynthPattern, randomDrumRow } from "../state/randomize.js";

const NAMES = { synth1: "PULSE", synth2: "FRICTION" };
const DRUMS = { thud: "Kick", crack: "Snare", tick: "Hat", clang: "Metal" };
const pad = (n) => String(n).padStart(2, "0");
const offsetText = (o) => (o === 0 ? "0" : (o > 0 ? "+" : "−") + Math.abs(o));

// Every row registers its 16 cells so the playhead can mark them.
const playheadRows = [];
export function setPlayhead(step) {
  for (const cells of playheadRows) cells.forEach((c, i) => c.classList.toggle("now", i === step));
}

const beats = (cells) => el("div", { class: "steps" }, [0, 1, 2, 3].map((b) => el("div", { class: "beat" }, cells.slice(b * 4, b * 4 + 4))));
const line = (cls, label, cells, tail) => el("div", { class: "line " + cls }, el("div", { class: "line-label" }, label), beats(cells), el("div", { class: "line-tail" }, tail));
const quiet = (text, onclick) => el("button", { type: "button", class: "quiet", onclick }, text);

function ruler() {
  const cells = Array.from({ length: STEPS }, (_, i) => el("span", { class: "num" }, String(i + 1)));
  playheadRows.push(cells);
  return line("ruler", el("span", { class: "label" }, "Step"), cells);
}

export function sequence(store) {
  const sel = { voice: "synth1", index: 0 };
  const redraw = {};
  const stepPath = () => `${sel.voice}.pattern.${sel.index}`;

  function choose(voice, index) {
    Object.assign(sel, { voice, index });
    redraw.synth1();
    redraw.synth2();
    refreshEditor();
  }

  function synthRow(id, sub) {
    const pat = `${id}.pattern`;
    const cols = Array.from({ length: STEPS }, (_, i) => {
      const btn = el("button", { type: "button", class: "step", "aria-pressed": "false", "aria-label": `${NAMES[id]} step ${i + 1}`, onclick: () => { store.set(`${pat}.${i}.on`, !store.get(`${pat}.${i}.on`)); choose(id, i); } }, pad(i + 1));
      const tab = el("button", { type: "button", class: "tab", "aria-label": `Edit ${NAMES[id]} step ${i + 1}`, onclick: () => choose(id, i) });
      return { col: el("div", { class: "col" }, btn, tab), btn, tab };
    });
    playheadRows.push(cols.map((c) => c.col));
    const subEl = el("small", {}, sub);
    redraw[id] = () => {
      store.get(pat).forEach((s, i) => {
        cols[i].btn.setAttribute("aria-pressed", String(s.on));
        cols[i].btn.classList.toggle("accent", s.on && s.accent);
        cols[i].tab.textContent = s.on ? offsetText(s.offset) : "·";
        cols[i].tab.setAttribute("aria-pressed", String(sel.voice === id && sel.index === i));
      });
      subEl.textContent = store.get(`${id}.mode`) === "drone" ? "Drone · paused" : sub;
    };
    bind(pat, redraw[id]);
    bind(`${id}.mode`, redraw[id]);
    redraw[id]();
    return line("synth", [el("strong", {}, NAMES[id]), subEl], cols.map((c) => c.col), [
      quiet("Clr", () => store.setTree(pat, store.get(pat).map((s) => ({ ...s, on: false })))),
      quiet("Rnd", () => store.setTree(pat, randomSynthPattern(id))),
    ]);
  }

  // Shared step editor: follows whichever synth step was chosen last.
  const title = el("span", { class: "value" });
  const result = el("span", { class: "value" });
  const offset = slider({ store, path: () => stepPath() + ".offset", watch: null, label: "Offset", min: RANGES.offset[0], max: RANGES.offset[1], step: 1, format: fmt.semis });
  const gate = slider({ store, path: () => stepPath() + ".gate", watch: null, label: "Gate", min: RANGES.gate[0], max: RANGES.gate[1], step: 0.05, format: fmt.pct });
  const accent = toggle({ store, path: () => stepPath() + ".accent", watch: null, text: "Accent", cls: "opt" });
  function refreshEditor() {
    const s = store.get(stepPath());
    title.textContent = `${NAMES[sel.voice]} · ${pad(sel.index + 1)}`;
    result.textContent = fmt.hz(store.get(`${sel.voice}.pitch`) * 2 ** (s.offset / 12));
    [offset, gate, accent].forEach((c) => c.refresh());
  }
  store.subscribe((path) => (path === "*" || path.startsWith("synth")) && refreshEditor());

  const root = section("Sequence", "1 bar · 16 steps");
  root.append(
    ruler(),
    synthRow("synth1", "Source A"),
    synthRow("synth2", "Source B"),
    el(
      "div",
      { class: "line editor" },
      el("div", { class: "line-label" }, el("span", { class: "label" }, "Edit"), title),
      el("div", { class: "fields" }, el("div", { class: "result" }, el("span", { class: "label" }, "Result"), result), offset, gate, accent)
    )
  );
  refreshEditor();
  return root;
}

function drumRow(store, id) {
  const stepsPath = `drums.${id}.steps`;
  const cells = Array.from({ length: STEPS }, (_, i) =>
    el("button", { type: "button", class: "step", "aria-pressed": "false", "aria-label": `${id.toUpperCase()} step ${i + 1}`, onclick: () => store.set(`${stepsPath}.${i}`, !store.get(`${stepsPath}.${i}`)) }, pad(i + 1))
  );
  playheadRows.push(cells);
  const row = line("drum", [el("strong", {}, traceGlyph(), id.toUpperCase()), el("small", {}, DRUMS[id])], cells, [
    slider({ store, path: `drums.${id}.level`, label: "Level" }),
    slider({ store, path: `drums.${id}.rate`, label: "Rate", min: RANGES.rate[0], max: RANGES.rate[1], scale: "exp", format: fmt.rate }),
    toggle({ store, path: `drums.${id}.mute`, text: "M", cls: "ms", title: `Mute ${id.toUpperCase()}` }),
  ]);
  const refresh = () => {
    store.get(stepsPath).forEach((on, i) => cells[i].setAttribute("aria-pressed", String(on)));
    row.classList.toggle("muted", store.get(`drums.${id}.mute`));
  };
  bind(`drums.${id}`, refresh);
  refresh();
  return row;
}

export function impact(store) {
  const root = section(
    "Impact",
    "Four drum channels",
    quiet("Clr", () => DRUM_IDS.forEach((id) => store.setTree(`drums.${id}.steps`, Array(STEPS).fill(false)))),
    quiet("Rnd", () => DRUM_IDS.forEach((id) => store.setTree(`drums.${id}.steps`, randomDrumRow(id))))
  );
  root.append(ruler(), ...DRUM_IDS.map((id) => drumRow(store, id)));
  return root;
}
