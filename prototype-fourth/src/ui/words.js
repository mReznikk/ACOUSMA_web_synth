// WORDS — the questions, formed out of grain along the waveform's baseline.
//
// A stochastic dither: every pixel has a random number r in [0,1). A text pixel is drawn when
// r < a, where a (0..1) blends from a blurred smear (a loose cloud) to the sharp letter as the
// sentence forms. Pixels with r near 1 are drawn as pure noise. Rows are torn sideways in
// glitch bands; Instability makes the tearing worse and Coherence sets how sharp it can get.
// Colours: ink and the red of the rest of the interface, nothing else.
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const INK = 0xff161616; // ABGR
const RED = 0xff1b26e4;

export function createWords(canvas, cues, finals) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let W = 0, H = 0, N = 0;
  let rnd = new Float32Array(0);
  let img = null, px = null;
  let masks = []; // per cue: { sharp, blur } Uint8Array alpha
  let bands = [], bandsAt = 0;
  let dirty = false;

  function size() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = W; canvas.height = H;
    N = W * H;
    rnd = new Float32Array(N); for (let i = 0; i < N; i++) rnd[i] = Math.random();
    img = ctx.createImageData(W, H); px = new Uint32Array(img.data.buffer);
    masks = [...cues.map((c) => buildMasks(c.lines)), ...finals.map((c) => buildMasks(c.lines))];
    dirty = false;
  }

  function buildMasks(lines) {
    const off = document.createElement("canvas"); off.width = W; off.height = H;
    const o = off.getContext("2d", { willReadFrequently: true });
    const fontSize = Math.min(H * 0.36, 92 * (W / 1344)) * (lines.length > 2 ? 0.72 : 1);
    const draw = (shadow) => {
      o.clearRect(0, 0, W, H);
      o.font = `700 ${fontSize}px "Times New Roman", Times, serif`;
      o.textAlign = "center"; o.textBaseline = "middle";
      const widest = Math.max(...lines.map((t) => o.measureText(t).width));
      const sx = Math.min(0.82, (W * 0.9) / widest);
      o.save(); o.translate(W / 2, H / 2); o.scale(sx, 1);
      lines.forEach((t, i) => {
        const y = (i - (lines.length - 1) / 2) * fontSize * 1.02;
        if (shadow) { // draw only the soft shadow, far off to the side
          o.shadowColor = "#000"; o.shadowBlur = fontSize * 0.34; o.shadowOffsetX = W * 3; o.fillStyle = "#000";
          for (let k = 0; k < 2; k++) o.fillText(t, -W * 3 / sx, y);
        } else { o.fillStyle = "#000"; o.fillText(t, 0, y); }
      });
      o.restore();
      const d = o.getImageData(0, 0, W, H).data, a = new Uint8Array(N);
      for (let i = 0; i < N; i++) a[i] = d[i * 4 + 3];
      return a;
    };
    return { sharp: draw(false), blur: draw(true) };
  }

  const clear = () => { if (dirty && W) { ctx.clearRect(0, 0, W, H); dirty = false; } };

  /** T = score time (s); C = coherence, I = instability (0..1). */
  function draw(T, C, I, wins, level = 0) {
    if (!W) size();
    if (!W) return;
    // which cue is active?
    let k = -1, f = 0, noise = 0, clean = false;
    // clean windows (no grain): the stack at the climax, the last phrase after the cut
    for (let n = 0; n < finals.length; n++) {
      const w = wins[n];
      if (!w || T < w.t0 || T >= w.t1 + w.fout) continue;
      k = cues.length + n; clean = true;
      f = smooth((T - w.t0) / w.fin) * (T < w.t1 ? 1 : 1 - smooth((T - w.t1) / w.fout));
      break;
    }
    for (let n = 0; n < cues.length && !clean; n++) {
      const c = cues[n];
      const pre = smooth((T - (c.t0 - 1.6)) / 1.6);
      const post = 1 - smooth((T - (c.t0 + c.dur + 1.2)) / 1.2);
      if (pre > 0 && post > 0) {
        const form = smooth((T - c.t0) / 1.8);
        const dis = smooth((T - (c.t0 + c.dur - 1.0)) / 2.4);
        k = n; f = form * (1 - dis); noise = pre * post; break;
      }
    }
    const bg = Math.min(0.17, level * 0.3); // grain that follows the real sound level
    if (k < 0) {
      if (bg < 0.004) return clear();
      const off0 = (Math.random() * N) | 0;
      px.fill(0);
      for (let i = 0; i < N; i++) { let j = i + off0; if (j >= N) j -= N; if (rnd[j] > 1 - bg) px[i] = INK; }
      ctx.putImageData(img, 0, 0); dirty = true;
      return;
    }
    const fmax = clean ? 1 : 0.78 + 0.22 * C;
    f *= fmax;
    const sharpK = clean ? 1 : smooth(f / 1.2);
    const glitch = clean ? 0 : Math.min(1, 0.28 + I * 0.7 + (1 - f) * 0.35) * (f > 0.02 ? 1 : 0.3);
    const speck = clean ? 0 : Math.max(bg, noise * (0.05 + 0.1 * (1 - f))); // grain density
    // glitch bands: re-rolled about every 110 ms
    const now = performance.now();
    if (now - bandsAt > 110) {
      bandsAt = now; bands = [];
      const count = Math.round(1 + glitch * 7);
      for (let b = 0; b < count; b++) {
        const h = 3 + Math.random() * 22 * (0.4 + glitch);
        bands.push({ y0: Math.floor(Math.random() * H), h, dx: Math.round((Math.random() - 0.5) * 2 * (6 + 70 * glitch)) });
      }
    }
    const shift = new Int16Array(H);
    for (const b of bands) for (let y = b.y0; y < Math.min(H, b.y0 + b.h); y++) shift[y] = b.dx;
    const m = masks[k], sharp = m.sharp, blur = m.blur;
    const off = (Math.random() * N) | 0;
    px.fill(0);
    for (let y = 0; y < H; y++) {
      const sh = shift[y], row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        let j = i + off; if (j >= N) j -= N;
        const r = rnd[j];
        let sx = x - sh; if (sx < 0) sx = 0; else if (sx >= W) sx = W - 1;
        const si = row + sx;
        const a = ((blur[si] * (1 - sharpK) + sharp[si] * sharpK) / 255) * (clean ? f : Math.min(1, f * 1.25 + 0.04));
        if (r < a) px[i] = INK;
        else if (r > 1 - speck) px[i] = INK;
        else if (sh !== 0) { // the torn rows leave a faint red double
          let gx = x - sh - 26; if (gx < 0) gx = 0; else if (gx >= W) gx = W - 1;
          if (r < (sharp[row + gx] / 255) * f * 0.55) px[i] = RED;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    dirty = true;
  }

  new ResizeObserver(() => { W = 0; }).observe(canvas); // rebuild on next draw
  return { draw, clear };
}
