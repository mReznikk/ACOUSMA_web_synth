// PERFORM view — the whole piece on one 16:9 screen (built for screen recording).
//
// Display layers, bottom to top:
//   trace   the real output signal, written by a head that sweeps one bar (as in display.js)
//   veil    a page-coloured band on the late fourth pulse; width follows Proximity;
//           lifts only during the break
//   ghost   after the break, the last full bar stays as a faint afterimage — drawn
//           OVER the veil: the veil hides the live sound, not the memory of it
//   fresh   the newest 0.4 s of the line, in red, only while something sounds
//   frame   baseline and ticks, in front of everything (the frame continues behind the veil)
import { el } from "./controls.js";
import { BAR, WORD_CUES, FINAL_LINE, CLIMAX_BARS } from "../score/score.js";
import { createWords } from "./words.js";

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => t * t * (3 - 2 * t);

const GAIN = 3.2; // display gain for the output signal (the audio peaks near -5 dBFS)
const SAMPLES_PER_PX = 6;
const GAP = 14; // px erased ahead of the head
const RED_SPAN = 0.125; // fraction of the bar drawn red behind the head (≈ 0.4 s)

const MOTIF =
  '<svg width="64" height="14" viewBox="0 0 64 14" aria-hidden="true"><path d="M0 7H6L8 3L10 11L12 7H18L20 3L22 11L24 7H27M36 6L37 9L38 4L39 10L40 5L41 9L42 3L43 11L44 6L46 8L48 5L50 9L52 7H64"/></svg>';

// The names rewrite themselves while nobody touches the slider (and snap back when you do).
const MACROS = [
  { name: "Proximity", alt: ["ytimixorP", "Is it near?", "In you", "Yтimixorp"] },
  { name: "Coherence", alt: ["ecnereho C", "Is it real?", "Memory", "Cohereиce"] },
  { name: "Instability", alt: ["ytilibatsnI", "Who moves it?", "Static", "Instab1lity"] },
];
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function performView({ conductor, engine, store }) {
  // ── DOM ──
  const layer = (cls) => el("canvas", { class: cls });
  const words = layer("pv-words");
  const trace = layer("pv-trace");
  const ghost = layer("pv-ghost");
  const fresh = layer("pv-fresh");
  const veil = el("i", { class: "pv-veil" });
  const baseline = el("i", { class: "pv-baseline" });
  const ticks = el("div", { class: "pv-ticks", "aria-hidden": "true" }, Array.from({ length: 16 }, () => el("i")));
  const head = el("i", { class: "pv-head", hidden: true });
  const dot = el("i", { class: "pv-dot" });
  const disp = el("section", { class: "pv-disp", "aria-label": "Output signal trace" },
    el("div", { class: "pv-flip" }, trace, veil), words,
    el("div", { class: "pv-flip" }, ghost, fresh, baseline, ticks, head), dot);

  const cue = el("div", { class: "pv-cue" });
  const wordsLayer = createWords(words, WORD_CUES, [{ lines: FINAL_LINE.words }]);
  const stopBtn = el("button", { type: "button", class: "pv-btn pv-stop", title: "Stop and silence everything, including echoes and reverb" }, "Stop");
  const goBtn = el("button", { type: "button", class: "pv-btn pv-go" }, "Start");
  const mark = el("span", { class: "pv-motif" });
  mark.innerHTML = MOTIF;

  const top = el("header", { class: "pv-top" },
    el("div", { class: "pv-identity" }, el("h1", {}, "ACOUSMA"), mark),
    cue, stopBtn, goBtn);

  // ── SEQUENCER: what the score is playing this bar (read-only; the score rewrites it each bar) ──
  const ROWS = [
    ["Pulse", "synth1.pattern", (v) => v.map((x) => !!x.on)],
    ["Friction", "synth2.pattern", (v) => v.map((x) => !!x.on)],
    ["Kick", "drums.thud.steps", (v) => v],
    ["Snare", "drums.crack.steps", (v) => v],
    ["Hat", "drums.tick.steps", (v) => v],
    ["Metal", "drums.clang.steps", (v) => v],
  ].map(([name, path, read]) => {
    const cells = Array.from({ length: 16 }, () => el("i"));
    const paint = () => { const on = read(store.get(path) || []); cells.forEach((c, i) => c.classList.toggle("on", !!on[i])); };
    const row = el("div", { class: "pv-seqrow" }, el("span", { class: "pv-label" }, name),
      el("div", { class: "pv-cells" }, [0, 1, 2, 3].map((b) => el("div", { class: "pv-beat" }, cells.slice(b * 4, b * 4 + 4)))));
    paint();
    return { row, cells, path, paint };
  });
  const seq = el("section", { class: "pv-seq", "aria-label": "Sequencer" }, ...ROWS.map((r) => r.row));
  store.subscribe((path) => { for (const r of ROWS) if (path === "*" || path.startsWith(r.path) || r.path.startsWith(path)) r.paint(); });
  engine.onStep = (step) => { for (const r of ROWS) r.cells.forEach((c, i) => c.classList.toggle("now", i === step)); };

  const done = el("i", { class: "pv-done" });
  const gap = el("i", { class: "pv-gap" });
  const rule = el("div", { class: "pv-rule" }, el("i", { class: "pv-all" }), done, gap);

  const macroEls = MACROS.map((m, i) => {
    const fill = el("i", { class: "pv-fill" });
    const tether = el("i", { class: "pv-tether" });
    const auto = el("i", { class: "pv-auto" });
    const handEl = el("i", { class: "pv-hand" });
    const track = el("div", { class: "pv-track", role: "slider", "aria-label": m.name, tabindex: "0" }, el("i", { class: "pv-line" }), fill, tether, auto, handEl);
    const val = el("span", { class: "pv-val" });
    const nameEl = el("span", { class: "pv-label" }, m.name);
    const posOf = (e) => { const r = track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width); };
    track.addEventListener("pointerdown", (e) => { track.setPointerCapture(e.pointerId); conductor.touch(i, posOf(e)); });
    track.addEventListener("pointermove", (e) => { if (e.buttons) conductor.touch(i, posOf(e)); });
    const up = () => conductor.release(i);
    track.addEventListener("pointerup", up);
    track.addEventListener("pointercancel", up);
    const root = el("div", { class: "pv-macro" },
      el("div", { class: "pv-mhead" }, nameEl, val),
      track);
    return { root, fill, tether, auto, handEl, track, val, nameEl };
  });

  const breakBtn = el("button", { type: "button", class: "pv-breakbtn" }, "Catharsis");
  const breakEl = el("div", { class: "pv-break pv-locked" }, breakBtn);
  breakBtn.addEventListener("click", () => conductor.pressBreak());

  const perform = el("section", { class: "pv-perform" }, ...macroEls.map((m) => m.root), breakEl);

  const root = el("div", { class: "pv-wrap" }, el("div", { class: "pv" }, top, disp, seq, rule, perform));

  // ── scale to any window: reference frame 1440 × 810 ──
  const fit = () => {
    const u = Math.min(window.innerWidth / 1440, window.innerHeight / 810);
    root.style.setProperty("--u", String(u));
    root.style.height = 810 * u + "px";
  };
  window.addEventListener("resize", fit);
  fit();

  // ── canvases ──
  let W = 0, H = 0, dpr = 1;
  let ys = new Float32Array(0);
  let lastX = null, lastY = 0;
  let ghostTaken = false;
  let redLevel = 0;
  let dotLevel = 0, dotShow = 0;
  const icon = document.querySelector('link[rel="icon"]');
  const iconHome = icon ? icon.href : "";
  const iconDot = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='5' fill='#e4261b'/></svg>");
  const ctxT = trace.getContext("2d");
  const ctxG = ghost.getContext("2d");
  const ctxF = fresh.getContext("2d");

  const sizeCanvases = () => {
    dpr = window.devicePixelRatio || 1;
    W = trace.clientWidth; H = trace.clientHeight;
    for (const c of [trace, ghost, fresh]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0); }
    ys = new Float32Array(Math.max(1, Math.ceil(W) + 2)).fill(NaN);
    lastX = null; ghostTaken = false;
  };
  new ResizeObserver(sizeCanvases).observe(trace);

  const yOf = (v) => H / 2 - Math.tanh(v * GAIN) * (H / 2 - 18 * (W / 1440));
  const lw = () => 1.5 * (W / 1440) + 0.5;

  function clearAll() {
    ctxT.clearRect(0, 0, W, H); ctxG.clearRect(0, 0, W, H); ctxF.clearRect(0, 0, W, H);
    ys.fill(NaN); lastX = null; ghostTaken = false; redLevel = 0;
  }

  // The write head: same idea as display.js — a short slice of the current output at the head,
  // a small gap erased ahead of it, the previous sweep left in place until overwritten.
  function writeTrace(pos, wave, s) {
    const x = pos * W;
    if (lastX === null || Math.abs(x - lastX) > W / 2) {
      if (lastX !== null && !ghostTaken && s.running && Math.round(s.T / BAR) === s.B) {
        // the head just wrapped into the break bar: the canvas holds the last full pre-break bar
        ctxG.clearRect(0, 0, W, H); ctxG.drawImage(trace, 0, 0, W, H); ghostTaken = true;
      }
      lastX = x; lastY = H / 2;
      if (x < 2) { ctxT.clearRect(0, 0, GAP, H); ys.fill(NaN, 0, GAP); }
      return;
    }
    if (x <= lastX) return;
    ctxT.clearRect(lastX + 1, 0, x - lastX + GAP, H);
    ys.fill(NaN, Math.max(0, Math.floor(lastX + 1)), Math.min(ys.length, Math.ceil(x + GAP)));
    ctxT.strokeStyle = "#000"; ctxT.lineWidth = lw(); ctxT.lineJoin = "round";
    ctxT.beginPath(); ctxT.moveTo(lastX, lastY);
    for (let px = Math.floor(lastX) + 1, k = 0; px <= x; px++, k += SAMPLES_PER_PX) {
      lastY = yOf(wave[Math.min(k, wave.length - 1)] || 0);
      ctxT.lineTo(px, lastY);
      if (px < ys.length) ys[px] = lastY;
    }
    ctxT.stroke();
    lastX = x;
  }

  function drawFresh(pos, sounding) {
    ctxF.clearRect(0, 0, W, H);
    redLevel += ((sounding ? 1 : 0) - redLevel) * 0.2;
    if (redLevel < 0.02) return;
    const hx = pos * W, x0 = Math.max(0, hx - RED_SPAN * W);
    ctxF.save(); ctxF.globalAlpha = redLevel; ctxF.strokeStyle = "#e4261b"; ctxF.lineWidth = lw() + 0.5; ctxF.beginPath();
    let pen = false;
    for (let x = Math.floor(x0); x <= hx && x < ys.length; x++) {
      const y = ys[x];
      if (Number.isNaN(y)) { pen = false; continue; }
      if (!pen) { ctxF.moveTo(x, y); pen = true; } else ctxF.lineTo(x, y);
    }
    ctxF.stroke(); ctxF.restore();
  }

  // ── per-frame update ──
  function frame() {
    const s = conductor.status();
    const live = engine.started && (s.running || s.ended);

    // display
    if (!s.running && !s.ended) {
      if (lastX !== null) clearAll();
      head.hidden = true;
    } else if (engine.started && W > 0) {
      const playing = s.running;
      head.hidden = !playing;
      if (playing) {
        const pos = engine.clock.progress();
        writeTrace(pos, engine.scope.getValue(), s);
        const m = engine.meters.master.getValue();
        const level = Array.isArray(m) ? Math.max(...m) : m || 0;
        const sounding = level > 0.003;
        drawFresh(pos, sounding);
        head.style.left = pos * 100 + "%";
        head.classList.toggle("on", redLevel > 0.5);
      } else {
        ctxF.clearRect(0, 0, W, H);
      }
    }

    // the questions, formed out of grain (only while the piece runs)
    const cutT = s.breakAt + CLIMAX_BARS * BAR, finalAt = cutT + FINAL_LINE.after;
    const mm = engine.started ? engine.meters.master.getValue() : 0;
    const lv = Array.isArray(mm) ? Math.max(...mm) : mm || 0;
    // the grain IS the sound: its density follows the real output level (flooding at the catharsis, gone at the cut)
    if (s.running) wordsLayer.draw(s.T, s.macros[1], s.macros[2], [
      { t0: finalAt, t1: finalAt + FINAL_LINE.dur - 0.4, fin: 0.7, fout: 1.5 },
    ], lv); else wordsLayer.clear();
    // time runs backwards while a reversed question is heard: the trace is mirrored
    const backwards = s.running && WORD_CUES.some((c) => s.T >= c.t0 && s.T < c.t0 + c.dur + 0.4);
    disp.classList.toggle("pv-back", backwards);
    // the browser tab hallucinates too: the questions are typed into the title, backwards; the icon becomes the dot
    {
      let t = "ACOUSMA";
      const typed = (txt, t0) => txt.slice(0, Math.max(0, Math.floor((s.T - t0) * 7)));
      const c = s.running && WORD_CUES.find((q) => s.T >= q.t0 && s.T < q.t0 + q.dur + 1);
      if (c) t = typed(c.lines.join(" "), c.t0) || "…";
      else if (s.running && s.T >= finalAt && s.T < finalAt + FINAL_LINE.dur + 1) t = typed(FINAL_LINE.words.join(" "), finalAt) || "…";
      else if (s.running && s.T >= cutT) t = "…";
      if (document.title !== t) document.title = t;
      if (icon) { const want = s.running && s.T >= cutT + 0.4 ? iconDot : iconHome; if (icon.href !== want) icon.href = want; }
    }
    // the dot: after the cut, one red point breathes with the hum (hidden while the last phrase is on screen)
    {
      dotLevel += (lv - dotLevel) * 0.12;
      const gone = !s.running || s.T < cutT + 0.4 || (s.T > finalAt - 0.6 && s.T < finalAt + FINAL_LINE.dur + 1.2);
      dotShow += ((gone ? 0 : 1) - dotShow) * 0.08;
      const r = 5 + 170 * dotLevel + 1.2 * Math.sin(s.T * 1.6);
      dot.style.opacity = String(dotShow);
      dot.style.width = dot.style.height = r * 2 + "px";
    }

    // veil: sits on the late fourth pulse; narrows as the source comes closer
    const [P, C, I] = s.macros;
    const tb = s.breakAt;
    let w = 0.06 + 0.34 * (1 - P);
    if (live && s.T >= tb) {
      const lift = smooth(clamp(s.T - tb)) * (1 - smooth(clamp((s.T - (tb + 4 * BAR)) / 1)));
      w *= 1 - lift;
    }
    const cx = (13 + 0.8 * I) / 16;
    veil.style.left = (cx - w / 2) * 100 + "%";
    veil.style.width = w * 100 + "%";
    ghost.style.opacity = String(0.22 * (1 - 0.45 * clamp((s.T - tb) / (s.endAt - tb))));

    // header
    cue.textContent = s.cue;
    const idle = !s.running && !s.ended;
    goBtn.textContent = idle ? "Start" : "Restart";

    // progress rule: one gap, at the break
    done.style.width = clamp(s.T / s.endAt) * 100 + "%";
    gap.style.left = (tb / s.endAt) * 100 + "%";

    // macros: black bar = the score, red bar = the hand
    macroEls.forEach((m, i) => {
      const b = s.base[i], v = s.macros[i];
      m.fill.style.width = b * 100 + "%";
      m.auto.style.left = b * 100 + "%";
      m.track.classList.toggle("pv-touched", s.touched[i]);
      if (s.touched[i]) {
        m.handEl.style.left = v * 100 + "%";
        m.tether.style.left = Math.min(b, v) * 100 + "%";
        m.tether.style.width = Math.abs(v - b) * 100 + "%";
      }
      m.val.textContent = v.toFixed(2);
      // the name: normal about half the time, otherwise one of its other faces; changes every 6 s
      const slot = Math.floor(s.T / 6) + i * 7, h = hash(slot);
      const nm = !s.running || s.touched[i] || h < 0.5 ? MACROS[i].name : MACROS[i].alt[Math.floor(hash(slot + 1) * MACROS[i].alt.length)];
      if (m.nameEl.textContent !== nm) m.nameEl.textContent = nm;
      m.track.setAttribute("aria-valuenow", v.toFixed(2));
    });

    // BREAK: dashed = locked, heavy outline = armed / pending, filled = released
    breakEl.className = "pv-break pv-" + s.breakState;

    requestAnimationFrame(frame);
  }

  let starting = false;
  stopBtn.addEventListener("click", () => conductor.reset());
  goBtn.addEventListener("click", async () => {
    const s = conductor.status();
    if (starting) return;
    starting = true;
    goBtn.disabled = true;
    try {
      if (s.running || s.ended) await conductor.reset();
      await conductor.start(0);
    } finally { starting = false; goBtn.disabled = false; }
  });

  requestAnimationFrame(frame);
  return { el: root };
}
