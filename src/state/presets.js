// ─────────────────────────────────────────────────────────────
// Starting presets. Each preset is resolved into a COMPLETE
// instrument state (patterns, voice modes, mixer, both FX racks)
// by layering its settings over baseState(). Nothing is left to
// whatever happened to be loaded before.
//
// Pattern notation: synthPattern({ step: [offset, gate, accent] })
// drumRow([step numbers]). Step numbers are 1–16.
// ─────────────────────────────────────────────────────────────
import { baseState, merge, synthPattern, drumRow } from "./schema.js";

const PRESET_SPECS = {
  // Default load: a short dark square pulse with moderate distortion
  // downstream and a mostly-noise FRICTION layer with a faint
  // unstable tone underneath.
  INIT: {
    tempo: 108,
    synth1: {
      wave: "square",
      pitch: 52,
      attack: 0.002,
      release: 0.12,
      tone: 0.28,
      level: 0.7,
      mode: "sequence",
      pattern: synthPattern({ 1: [0, 0.45, true], 4: [0, 0.3], 7: [0, 0.3], 9: [0, 0.45, true], 11: [12, 0.25], 14: [0, 0.3] }),
    },
    synth2: {
      wave: "sawtooth",
      noiseType: "pink",
      noiseMix: 0.82,
      pitch: 740,
      attack: 0.003,
      release: 0.18,
      tone: 0.55,
      instability: 0.45,
      level: 0.5,
      pan: 0.15,
      mode: "sequence",
      pattern: synthPattern({ 6: [0, 0.6], 15: [5, 0.35, true] }),
    },
    drums: {
      thud: { steps: drumRow([1, 9, 11]), level: 0.8, rate: 1 },
      crack: { steps: drumRow([5, 13]), level: 0.55, rate: 1 },
      tick: { steps: drumRow([3, 7, 11, 15]), level: 0.4, rate: 1 },
      clang: { steps: drumRow([]), level: 0.4, rate: 1 },
    },
    bus: { synthLevel: 0.8, drumLevel: 0.8 },
    master: { level: 0.6 },
    fx: {
      synth: {
        dist: { drive: 0.4, mix: 0.55, bypass: false },
        crush: { bits: 8, mix: 0.3, bypass: true },
        delay: { division: "8n.", delayFeedback: 0.3, mix: 0.2, bypass: true },
        reverb: { decay: 1.8, mix: 0.15, bypass: false },
      },
      drum: {
        dist: { drive: 0.25, mix: 0.3, bypass: true },
        crush: { bits: 10, mix: 0.25, bypass: true },
        delay: { division: "16n", delayFeedback: 0.25, mix: 0.15, bypass: true },
        reverb: { decay: 1.2, mix: 0.12, bypass: false },
      },
    },
  },

  // Sparse drone, unstable high tone, one metallic impact per bar,
  // lots of empty space. Quiet, almost no distortion.
  ISOLATION: {
    tempo: 52,
    synth1: {
      wave: "sine",
      pitch: 41,
      attack: 1.6,
      release: 3.2,
      tone: 0.22,
      level: 0.62,
      pan: -0.1,
      mode: "drone",
      pattern: synthPattern({ 1: [0, 1], 9: [-5, 0.8] }),
    },
    synth2: {
      wave: "sine",
      noiseType: "pink",
      noiseMix: 0.38,
      pitch: 1318,
      attack: 2,
      release: 3.5,
      tone: 0.48,
      instability: 0.75,
      level: 0.32,
      pan: 0.25,
      mode: "drone",
      pattern: synthPattern({ 5: [0, 1], 13: [1, 1] }),
    },
    drums: {
      thud: { steps: drumRow([]), level: 0.5, rate: 0.8 },
      crack: { steps: drumRow([]), level: 0.4, rate: 1 },
      tick: { steps: drumRow([]), level: 0.3, rate: 1 },
      clang: { steps: drumRow([11]), level: 0.42, rate: 0.62 },
    },
    bus: { synthLevel: 0.75, drumLevel: 0.7 },
    master: { level: 0.55 },
    fx: {
      synth: {
        dist: { drive: 0.15, mix: 0.2, bypass: true },
        crush: { bits: 11, mix: 0.15, bypass: true },
        delay: { division: "4n", delayFeedback: 0.35, mix: 0.18, bypass: false },
        reverb: { decay: 7, mix: 0.42, bypass: false },
      },
      drum: {
        dist: { drive: 0.2, mix: 0.2, bypass: true },
        crush: { bits: 9, mix: 0.2, bypass: true },
        delay: { division: "8n.", delayFeedback: 0.45, mix: 0.3, bypass: false },
        reverb: { decay: 6, mix: 0.5, bypass: false },
      },
    },
  },

  // Irregular noise bursts, a restrained repeating pulse, short dirty
  // echoes. Medium density, crushed rather than heavily driven.
  INTERFERENCE: {
    tempo: 96,
    synth1: {
      wave: "triangle",
      pitch: 55,
      attack: 0.003,
      release: 0.11,
      tone: 0.34,
      level: 0.55,
      mode: "sequence",
      pattern: synthPattern({ 1: [0, 0.5, true], 7: [0, 0.35], 9: [0, 0.5], 15: [-5, 0.35] }),
    },
    synth2: {
      wave: "sawtooth",
      noiseType: "white",
      noiseMix: 0.86,
      pitch: 640,
      attack: 0.002,
      release: 0.08,
      tone: 0.68,
      instability: 0.6,
      level: 0.5,
      pan: 0.2,
      mode: "sequence",
      pattern: synthPattern({
        3: [0, 0.25, true],
        4: [7, 0.15],
        6: [0, 0.8],
        11: [-3, 0.2],
        12: [0, 0.15, true],
        14: [12, 0.45],
      }),
    },
    drums: {
      thud: { steps: drumRow([1, 10]), level: 0.6, rate: 1.05 },
      crack: { steps: drumRow([13]), level: 0.45, rate: 1.2 },
      tick: { steps: drumRow([3, 6, 10, 13, 16]), level: 0.35, rate: 1.3 },
      clang: { steps: drumRow([8]), level: 0.28, rate: 1.4 },
    },
    bus: { synthLevel: 0.8, drumLevel: 0.7 },
    master: { level: 0.58 },
    fx: {
      synth: {
        dist: { drive: 0.3, mix: 0.45, bypass: false },
        crush: { bits: 6, mix: 0.4, bypass: false },
        delay: { division: "16n", delayFeedback: 0.42, mix: 0.32, bypass: false },
        reverb: { decay: 1.4, mix: 0.14, bypass: false },
      },
      drum: {
        dist: { drive: 0.2, mix: 0.25, bypass: true },
        crush: { bits: 7, mix: 0.35, bypass: false },
        delay: { division: "16n.", delayFeedback: 0.3, mix: 0.22, bypass: false },
        reverb: { decay: 1, mix: 0.1, bypass: true },
      },
    },
  },

  // Driving drum pattern, repetitive distorted bass, short noise
  // accents. The loudest and densest preset — on purpose.
  ASSEMBLY: {
    tempo: 128,
    synth1: {
      wave: "square",
      pitch: 49,
      attack: 0.002,
      release: 0.09,
      tone: 0.42,
      level: 0.66,
      mode: "sequence",
      pattern: synthPattern({
        1: [0, 0.5, true],
        3: [0, 0.4],
        4: [12, 0.3],
        5: [0, 0.5, true],
        7: [0, 0.4],
        9: [0, 0.5, true],
        11: [0, 0.4],
        12: [12, 0.3],
        13: [0, 0.5, true],
        15: [3, 0.4],
      }),
    },
    synth2: {
      wave: "square",
      noiseType: "white",
      noiseMix: 0.95,
      pitch: 1900,
      attack: 0.001,
      release: 0.05,
      tone: 0.8,
      instability: 0.2,
      level: 0.42,
      pan: -0.2,
      mode: "sequence",
      pattern: synthPattern({ 4: [0, 0.2], 8: [0, 0.3, true], 12: [0, 0.2], 16: [0, 0.5, true] }),
    },
    drums: {
      thud: { steps: drumRow([1, 5, 9, 13, 16]), level: 0.85, rate: 1 },
      crack: { steps: drumRow([5, 13]), level: 0.6, rate: 0.95 },
      tick: { steps: drumRow([3, 7, 8, 11, 15]), level: 0.42, rate: 1.1 },
      clang: { steps: drumRow([10]), level: 0.3, rate: 1.2 },
    },
    bus: { synthLevel: 0.78, drumLevel: 0.82 },
    master: { level: 0.6 },
    fx: {
      synth: {
        dist: { drive: 0.6, mix: 0.7, bypass: false },
        crush: { bits: 10, mix: 0.2, bypass: false },
        delay: { division: "8n", delayFeedback: 0.18, mix: 0.1, bypass: true },
        reverb: { decay: 1.1, mix: 0.1, bypass: false },
      },
      drum: {
        dist: { drive: 0.42, mix: 0.4, bypass: false },
        crush: { bits: 9, mix: 0.2, bypass: true },
        delay: { division: "16n", delayFeedback: 0.2, mix: 0.12, bypass: true },
        reverb: { decay: 0.9, mix: 0.1, bypass: false },
      },
    },
  },
};

export const PRESET_NAMES = Object.keys(PRESET_SPECS);

/** Returns a fresh, complete instrument state for a preset name. */
export function loadPreset(name) {
  const state = baseState();
  merge(state, PRESET_SPECS[name]);
  state.name = name;
  return state;
}
