// Interface building blocks. Every control is bound to ONE state path:
// it writes with store.set() and redraws when that path changes.
// A path may be a function (the step editor follows a selection).
import { expMap, expUnmap } from "../audio/mappings.js";

/** el("div", { class: "x", onclick }, child, "text") */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

// ── Bindings: redraw controls when their state path changes ──
const bindings = [];
export const bind = (path, refresh) => path && bindings.push({ path, refresh });
export function refreshBindings(changed) {
  for (const b of bindings) {
    if (changed === "*" || b.path === changed || b.path.startsWith(changed + ".") || changed.startsWith(b.path + ".")) b.refresh();
  }
}
const getter = (p) => (typeof p === "function" ? p : () => p);
let uid = 0;

// ── Formatting ──
export const fmt = {
  hz: (v) => (v < 100 ? v.toFixed(1) : Math.round(v)) + " Hz",
  khz: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + " kHz" : Math.round(v) + " Hz"),
  time: (v) => (v < 1 ? Math.round(v * 1000) + " ms" : v.toFixed(2) + " s"),
  pct: (v) => Math.round(v * 100) + "%",
  pan: (v) => (Math.abs(v) < 0.02 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100)),
  semis: (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v) + " st",
  rate: (v) => "×" + v.toFixed(2),
  bits: (v) => Math.round(v) + " bit",
  bpm: (v) => Math.round(v) + " BPM",
};

/** Horizontal slider. scale "exp" for frequencies and times. watch = path to redraw on (default: path). */
export function slider({ store, path, watch = path, label, min = 0, max = 1, step = 0, scale = "lin", format = fmt.pct }) {
  const P = getter(path);
  const id = "c" + ++uid;
  const RES = 1000;
  const toPos = (v) => RES * (scale === "exp" ? expUnmap(v, min, max) : (v - min) / (max - min));
  const fromPos = (p) => {
    let v = scale === "exp" ? expMap(p / RES, min, max) : min + (p / RES) * (max - min);
    if (step) v = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, +v.toFixed(6)));
  };
  const input = el("input", { type: "range", id, min: 0, max: RES, step: 1 });
  const out = el("output", { for: id });
  const show = (v) => {
    out.textContent = format(v);
    input.style.setProperty("--p", (input.value / RES) * 100 + "%");
  };
  input.addEventListener("input", () => {
    const v = fromPos(+input.value);
    store.set(P(), v);
    show(v);
  });
  const refresh = () => {
    const v = store.get(P());
    input.value = toPos(v);
    show(v);
  };
  bind(typeof watch === "string" ? watch : null, refresh);
  refresh();
  return Object.assign(el("div", { class: "slider" }, el("label", { for: id }, label), out, input), { refresh });
}

/** A row of mutually exclusive options (wave, mode, noise, bus). */
export function options({ store, path, label, items }) {
  const buttons = items.map(([value, text]) =>
    el("button", { type: "button", class: "opt", "aria-pressed": "false", onclick: () => store.set(path, value) }, text)
  );
  const refresh = () => buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(items[i][0] === store.get(path))));
  bind(path, refresh);
  refresh();
  return el("div", { class: "options", role: "group", "aria-label": label }, label && el("span", { class: "label" }, label), el("div", { class: "opt-row" }, buttons));
}

/** On/off button. invert: pressed when the value is false (effects store `bypass`). */
export function toggle({ store, path, watch = path, text, onText = text, offText = text, cls = "", title = text, invert = false }) {
  const P = getter(path);
  const b = el("button", { type: "button", class: "tog " + cls, title, "aria-pressed": "false", onclick: () => store.set(P(), !store.get(P())) });
  const refresh = () => {
    const pressed = invert ? !store.get(P()) : !!store.get(P());
    b.setAttribute("aria-pressed", String(pressed));
    b.textContent = pressed ? onText : offText;
  };
  bind(typeof watch === "string" ? watch : null, refresh);
  refresh();
  return Object.assign(b, { refresh });
}

/** Native select bound to a path. */
export function select({ store, path, label, items, id = "s" + ++uid }) {
  const s = el("select", { id, onchange: () => store.set(path, s.value) }, items.map(([v, t]) => el("option", { value: v }, t)));
  bind(path, () => (s.value = store.get(path)));
  s.value = store.get(path);
  return el("div", { class: "select" }, el("label", { for: id }, label), s);
}

/** Section with a heading rule that has one small break in it (the ACOUSMA motif). */
export function section(title, meta, ...extra) {
  return el(
    "section",
    { class: "sec", "aria-label": title },
    el("header", { class: "sec-head" }, el("h2", {}, title), el("i", { class: "rule" }), el("i", { class: "rule short" }), meta && el("span", { class: "meta" }, meta), ...extra)
  );
}

/** Small trace glyph beside channel names. Cut when muted. */
export function traceGlyph() {
  const span = el("span", { class: "glyph", "aria-hidden": "true" });
  span.innerHTML =
    '<svg width="28" height="12" viewBox="0 0 28 12"><path class="g-a" d="M0 6H5L7 2L9 10L11 6"/><path class="g-b" d="M11 6H15L17 3L19 9L21 6"/><path class="g-a" d="M21 6H28"/></svg>';
  return span;
}
