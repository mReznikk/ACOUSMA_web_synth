// ─────────────────────────────────────────────────────────────
// Instrument state schema.
// Plain data only — no audio nodes live here. The audio engine
// reads this state; the interface edits it through the store.
// ─────────────────────────────────────────────────────────────

export const STEPS = 16;
export const WAVES = ["sine", "triangle", "sawtooth", "square"];
export const NOISE_TYPES = ["white", "pink"];
export const MODES = ["sequence", "drone"];
export const DRUM_IDS = ["thud", "crack", "tick", "clang"];
export const DELAY_DIVISIONS = ["32n", "16n", "16n.", "8n", "8n.", "4n", "4n."];

// Numeric ranges used by both the interface and the engine.
export const RANGES = {
  tempo: [40, 180],
  pulsePitch: [30, 400], // Hz
  frictionPitch: [60, 3000], // Hz
  attack: [0.001, 2], // s
  release: [0.01, 4], // s
  offset: [-12, 12], // semitones
  gate: [0.1, 1], // fraction of one step
  rate: [0.25, 2], // drum playback rate
  drive: [0, 1],
  bits: [1, 16],
  delayFeedback: [0, 0.85], // hard ceiling keeps echoes from running away
  reverbDecay: [0.3, 10], // s
};

/** One sequencer step for a synth voice. */
export const step = (on = false, offset = 0, gate = 0.5, accent = false) => ({
  on,
  offset,
  gate,
  accent,
});

/**
 * Build a 16-step synth pattern from a compact description:
 * { 1: [offset, gate, accent], 5: [0], ... } — keys are 1-based step numbers.
 */
export function synthPattern(spec = {}) {
  return Array.from({ length: STEPS }, (_, i) => {
    const s = spec[i + 1];
    return s ? step(true, s[0] ?? 0, s[1] ?? 0.5, !!s[2]) : step();
  });
}

/** Build a 16-step drum row from a list of 1-based step numbers. */
export const drumRow = (on = []) =>
  Array.from({ length: STEPS }, (_, i) => on.includes(i + 1));

const fxDefaults = () => ({
  dist: { drive: 0.3, mix: 0.5, bypass: true },
  crush: { bits: 8, mix: 0.4, bypass: true },
  delay: { division: "8n", delayFeedback: 0.3, mix: 0.25, bypass: true },
  reverb: { decay: 2, mix: 0.2, bypass: true },
});

/** A complete instrument state. Presets override parts of it. */
export function baseState() {
  return {
    name: "INIT",
    tempo: 110,
    synth1: {
      wave: "square",
      pitch: 55,
      attack: 0.002,
      release: 0.14,
      tone: 0.3,
      level: 0.7,
      pan: 0,
      mute: false,
      solo: false,
      mode: "sequence",
      pattern: synthPattern(),
    },
    synth2: {
      wave: "sawtooth",
      noiseType: "pink",
      noiseMix: 0.8,
      pitch: 880,
      attack: 0.004,
      release: 0.2,
      tone: 0.6,
      instability: 0.4,
      level: 0.55,
      pan: 0,
      mute: false,
      solo: false,
      mode: "sequence",
      pattern: synthPattern(),
    },
    drums: {
      thud: { steps: drumRow(), level: 0.8, rate: 1, mute: false, solo: false },
      crack: { steps: drumRow(), level: 0.6, rate: 1, mute: false, solo: false },
      tick: { steps: drumRow(), level: 0.45, rate: 1, mute: false, solo: false },
      clang: { steps: drumRow(), level: 0.45, rate: 1, mute: false, solo: false },
    },
    bus: { synthLevel: 0.8, drumLevel: 0.8 },
    master: { level: 0.6 },
    fx: { synth: fxDefaults(), drum: fxDefaults() },
  };
}

/** Deep merge used to apply a partial preset on top of baseState(). */
export function merge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof target[k] === "object") {
      merge(target[k], v);
    } else {
      target[k] = structuredClone(v);
    }
  }
  return target;
}
