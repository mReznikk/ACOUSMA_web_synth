// Signal display: one thin trace written across the bar by a write head
// that follows the transport. Each frame draws a short slice of the
// current output waveform at the head and erases a small gap ahead of
// it, so the previous sweep stays visible until it is overwritten.
// A periodic sound leaves a smooth wave; noise leaves a dense scribble.
import { el, section } from "./controls.js";

const ERASE = 14; // px cleared ahead of the head
const SAMPLES_PER_PX = 6;

export function signalDisplay() {
  const canvas = el("canvas", { class: "trace", "aria-label": "Output signal trace", role: "img" });
  const head = el("i", { class: "head", hidden: true });
  const ticks = el("div", { class: "ticks", "aria-hidden": "true" }, Array.from({ length: 16 }, () => el("i")));
  const root = section("Signal", "1 bar · 16 steps");
  root.append(el("div", { class: "plot" }, el("i", { class: "baseline" }), canvas, head, ticks));

  const ctx = canvas.getContext("2d");
  let last = null;
  let lastY = 0;

  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    last = null;
  };
  new ResizeObserver(fit).observe(canvas);

  /** Called every animation frame. pos = position in the bar (0..1). */
  function frame(playing, pos, wave) {
    head.hidden = !playing;
    if (!playing) return void (last = null);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const x = pos * W;
    head.style.left = pos * 100 + "%";
    if (last === null || Math.abs(x - last) > W / 2) {
      last = x; // first frame, or the bar wrapped: start a new stroke
      lastY = H / 2;
      if (x < 2) ctx.clearRect(0, 0, ERASE, H);
      return;
    }
    if (x <= last) return;

    ctx.clearRect(last + 1, 0, x - last + ERASE, H);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(last, lastY);
    for (let px = last + 1, k = 0; px <= x; px++, k += SAMPLES_PER_PX) {
      const v = wave[Math.min(k, wave.length - 1)] || 0;
      lastY = H / 2 - Math.max(-1, Math.min(1, v * 3)) * (H / 2 - 4);
      ctx.lineTo(px, lastY);
    }
    ctx.stroke();
    last = x;
  }

  return { el: root, frame };
}
