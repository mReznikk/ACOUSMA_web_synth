// ─────────────────────────────────────────────────────────────
// The three performance macros → instrument state.
//
//   PROXIMITY  (0..1)  how near the hidden source feels
//   COHERENCE  (0..1)  how clearly the pulse separates from the noise
//   INSTABILITY(0..1)  how much timing and pitch fall apart
//
// One pure function, one owner: every path below is written ONLY from here
// (the conductor may mask a path while a section needs to own it). Nothing
// here touches audio nodes — it returns { "state.path": value }, and the
// store/engine do the rest, with their usual smoothing.
//
// Level paths use the same law as mappings.js: dB = 40·log10(level).
// ─────────────────────────────────────────────────────────────
import { expMap } from "./mappings.js";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const dbToLevel = (db) => Math.pow(10, db / 40);

/** Overall gain trim for the two synth voices (dB). Set by measuring the piece's peak. */
export const TRIM_DB = 0;

/** Live tuning knobs (the TUNE panel in the Perform view writes these). Defaults = current sound. */
export const TUNE = {
  bed: -20, // dB, the throbbing background (saws)
  pad: -12, // dB, the chord pad
  lead: -18, // dB, the melody (a quiet, internal texture)
  wall: 420, // Hz, how muffled the melody is (lower = further away, another room)
  leadBright: 600, // Hz, the lead's brightest filter setting
  riff: -11, // dB, the rubber bass that emerges after ~1:30
  riffBright: 900, // Hz, the bass filter at full (a low cutoff with high resonance: "just below the middle of the range")
  throb: 0.6, // 0..1 depth of the pulse in bed and pad
  bright: 0.5, // top of the pulse tone sweep (0.39 = dark … 0.83 = bright)
  drums: -2.5, // dB trim on all drums
  voice: -5, // dB, the reversed questions (filtered and in a room, but clear enough to follow)
  voiceRoom: 2400, // Hz, how muffled the reversed voice is (lower = further away)
  voiceEnd: -2, // dB, the last phrase after the cut (lowered, gritty, dark room)
  hum: -24, // dB, the low hum after the cut
  muffle: 3600, // Hz, low-pass over the whole piece (lower = darker, more muted)
  grit: 1.25, // 0..1.5 distortion / crush amount on everything
};

export function macrosToState(P, C, I) {
  P = clamp(P); C = clamp(C); I = clamp(I);
  return {
    // ── PROXIMITY ──
    "synth1.tone": lerp(0.39, TUNE.bright, P), // low-pass 400 Hz → 3.5 kHz
    "synth1.attack": expMap(P, 0.03, 0.008), // 25 ms → 3 ms
    "synth1.level": dbToLevel(TRIM_DB + lerp(-12, -1, P) + lerp(-3, 3, C)),
    "synth2.level": dbToLevel(TRIM_DB + lerp(-16, -5, P) + lerp(3, -3, C)),
    "fx.synth.reverb.mix": lerp(0.55, 0.1, P),
    "fx.drum.reverb.mix": lerp(0.3, 0.1, P),
    "drums.thud.level": dbToLevel(TRIM_DB + TUNE.drums + lerp(-15, -7, P)),
    "drums.crack.level": dbToLevel(TRIM_DB + TUNE.drums + lerp(-18, -9, P)),
    "drums.tick.level": dbToLevel(TRIM_DB + TUNE.drums + lerp(-30, -18, P)),
    "fx.drum.dist.drive": (0.2 + 0.3 * P + 0.15 * I * I) * TUNE.grit,
    "fx.drum.dist.mix": clamp((0.15 + 0.3 * P + 0.12 * I) * TUNE.grit, 0, 1),
    // ── COHERENCE ──
    "synth2.noiseMix": lerp(0.9, 0.2, C),
    "fx.synth.crush.mix": clamp((lerp(0.3, 0, C) + 0.15 * I * I) * TUNE.grit, 0, 0.5),
    // ── INSTABILITY ──
    "feel.late": 0.8 * I, // extra steps the 4th pulse slides later (on top of its one-step offset in the pattern)
    "feel.jitter": 0.045 * I, // seconds, one-sided, seeded
    "synth2.instability": lerp(0.05, 0.85, I),
    "fx.synth.dist.drive": (0.05 + 0.15 * I * I) * TUNE.grit,
    "fx.synth.dist.mix": clamp((0.1 + 0.25 * I) * TUNE.grit, 0, 1),
  };
}

/** Plain-unit readouts for the interface — same maths as above, so what you read is what the engine does. */
export function describe(P, C, I) {
  const cutoff = 60 * Math.pow(8000 / 60, lerp(0.39, 0.83, P));
  const wet = Math.sin((lerp(0.55, 0.1, P) * Math.PI) / 2);
  const bal = lerp(-6, 6, C);
  return [
    `tone ${cutoff >= 1000 ? (cutoff / 1000).toFixed(1) + " kHz" : Math.round(cutoff) + " Hz"} · reverb ${Math.round(wet * 100)}%`,
    `melody notes kept ${Math.round((0.55 + 0.45 * C) * 100)}% · pulse ${bal >= 0 ? "+" : "−"}${Math.abs(bal).toFixed(1)} dB`,
    `late +${(0.8 * I).toFixed(2)} step · drag ${Math.round(45 * I)} ms · drive ${Math.round((0.05 + 0.15 * I * I) * TUNE.grit * 100)}%`,
  ];
}
