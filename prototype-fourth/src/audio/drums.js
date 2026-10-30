// ─────────────────────────────────────────────────────────────
// DRUMS / IMPACT — buffers and playback.
//
// All four one-shots are synthesised in code at load time (seeded,
// so they are identical every session). No files to download, no
// third-party sample licensing.
//
//   THUD  – sine body with a fast pitch drop (150→45 Hz), a 2–4 ms
//           click for definition, gentle saturation. ~0.55 s.
//   CRACK – high-passed noise burst + short 185 Hz body, hard
//           tanh-clipped for a dry, distorted snare. ~0.3 s.
//   TICK  – twice-differentiated white noise (very bright), 12 ms
//           decay. ~0.09 s.
//   CLANG – seven inharmonic partials, each with its own decay,
//           ring-modulated at 97 Hz + a strike transient. ~1.3 s.
// ─────────────────────────────────────────────────────────────
import * as Tone from "tone";

/** Small deterministic PRNG so every session gets identical drums. */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(data, peak) {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  const k = max > 0 ? peak / max : 1;
  for (let i = 0; i < data.length; i++) data[i] *= k;
  return data;
}

function fadeTail(data, sr, ms = 15) {
  const n = Math.min(data.length, Math.floor((sr * ms) / 1000));
  for (let i = 0; i < n; i++) data[data.length - 1 - i] *= i / n;
  return data;
}

const RENDER = {
  thud(sr) {
    const rand = mulberry32(11);
    const len = Math.floor(sr * 0.55);
    const out = new Float32Array(len);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = 45 + 105 * Math.exp(-t / 0.032);
      phase += (2 * Math.PI * f) / sr;
      const body = Math.sin(phase) * Math.exp(-t / 0.2);
      const click = (rand() * 2 - 1) * Math.exp(-t / 0.0022) * 0.45 + Math.sin(2 * Math.PI * 1300 * t) * Math.exp(-t / 0.004) * 0.3;
      out[i] = Math.tanh(1.6 * (body + click)) / Math.tanh(1.6);
    }
    return fadeTail(normalize(out, 0.9), sr);
  },

  crack(sr) {
    const rand = mulberry32(23);
    const len = Math.floor(sr * 0.3);
    const out = new Float32Array(len);
    let prevIn = 0;
    let hp = 0;
    const a = Math.exp((-2 * Math.PI * 1200) / sr); // one-pole high-pass coefficient
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const n = rand() * 2 - 1;
      hp = a * (hp + n - prevIn);
      prevIn = n;
      const noise = hp * Math.exp(-t / 0.075);
      const body = Math.sin(2 * Math.PI * 185 * t + 0.6 * Math.sin(2 * Math.PI * 330 * t)) * Math.exp(-t / 0.035);
      out[i] = Math.tanh(3 * (noise * 1.1 + body * 0.7)) / Math.tanh(3);
    }
    return fadeTail(normalize(out, 0.8), sr);
  },

  tick(sr) {
    const rand = mulberry32(37);
    const len = Math.floor(sr * 0.09);
    const out = new Float32Array(len);
    let p1 = 0;
    let p2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const n = rand() * 2 - 1;
      const d1 = n - p1; // first difference (high-pass)
      const d2 = d1 - p2; // second difference (brighter still)
      p1 = n;
      p2 = d1;
      const env = Math.min(1, t / 0.0005) * Math.exp(-t / 0.012);
      out[i] = d2 * env;
    }
    return fadeTail(normalize(out, 0.6), sr, 5);
  },

  clang(sr) {
    const rand = mulberry32(53);
    const len = Math.floor(sr * 1.3);
    const out = new Float32Array(len);
    const base = 311;
    const partials = [
      [1.0, 1.0, 0.65],
      [1.483, 0.8, 0.5],
      [1.932, 0.7, 0.55],
      [2.546, 0.55, 0.32],
      [3.117, 0.45, 0.25],
      [4.237, 0.35, 0.18],
      [5.06, 0.25, 0.11],
    ]; // [ratio, amplitude, decay seconds]
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let s = 0;
      for (const [r, amp, tau] of partials) s += amp * Math.sin(2 * Math.PI * base * r * t) * Math.exp(-t / tau);
      const ring = 0.55 + 0.45 * Math.sin(2 * Math.PI * 97 * t);
      const strike = (rand() * 2 - 1) * Math.exp(-t / 0.006) * 1.2;
      out[i] = Math.tanh(1.2 * (s * ring + strike));
    }
    return fadeTail(normalize(out, 0.7), sr, 40);
  },
};

/** Render all four buffers for the running audio context. */
export function createDrumBuffers() {
  const sr = Tone.getContext().sampleRate;
  const buffers = {};
  for (const id of Object.keys(RENDER)) {
    buffers[id] = Tone.ToneAudioBuffer.fromArray(RENDER[id](sr));
  }
  return buffers;
}

/**
 * One drum row's playback. Each hit is a fresh ToneBufferSource
 * (one-shot nodes are cheap and meant to be disposable). A new hit
 * chokes the previous one with a short fade, so fast patterns stay
 * tight and voices never pile up.
 */
export class DrumVoice {
  constructor(buffer, output, rate = 1) {
    this.buffer = buffer;
    this.output = output;
    this.rate = rate;
    this.active = new Set();
  }

  trigger(time) {
    this.active.forEach((src) => src.stop(time)); // choke
    const src = new Tone.ToneBufferSource({
      url: this.buffer,
      playbackRate: this.rate,
      fadeOut: 0.004,
      onended: () => {
        this.active.delete(src);
        src.dispose();
      },
    }).connect(this.output);
    src.start(time);
    this.active.add(src);
  }

  setRate(rate) {
    this.rate = rate; // applies from the next hit
  }

  /** Stop/CUT: stop everything that is playing or scheduled. */
  stopAll() {
    const now = Tone.now();
    this.active.forEach((src) => {
      try {
        src.stop(now);
      } catch {
        /* already stopped */
      }
    });
  }
}
