// ─────────────────────────────────────────────────────────────
// Fixed, documented mappings from 0–1 control values to audio
// parameters. The interface uses the same functions to display
// real units, so what you read is what the engine does.
// ─────────────────────────────────────────────────────────────

/** Exponential mapping between lo and hi for x in 0..1. */
export const expMap = (x, lo, hi) => lo * Math.pow(hi / lo, x);
export const expUnmap = (v, lo, hi) => Math.log(v / lo) / Math.log(hi / lo);

/** PULSE Tone: low-pass cutoff 60 Hz … 8 kHz. */
export const pulseCutoff = (tone) => expMap(tone, 60, 8000);
/** FRICTION Tone: low-pass cutoff 250 Hz … 16 kHz. */
export const frictionCutoff = (tone) => expMap(tone, 250, 16000);

/** Fader level 0..1 → decibels. Squared-law fader with silence at 0. */
export const levelToDb = (level) => (level <= 0.0001 ? -Infinity : 40 * Math.log10(level));

/**
 * Per-waveform trim so switching waves changes timbre, not loudness.
 * Square and saw carry far more energy than sine.
 */
export const WAVE_TRIM = { sine: 1, triangle: 0.92, sawtooth: 0.62, square: 0.5 };

/** Noise trims (pink noise is generated with lower RMS than white). */
export const NOISE_TRIM = { white: 0.5, pink: 0.85 };

/**
 * Noise Mix → [toneGain, noiseGain] using an equal-power curve,
 * so the blend keeps a steady perceived level.
 */
export const noiseMixGains = (mix) => [Math.cos((mix * Math.PI) / 2), Math.sin((mix * Math.PI) / 2)];

/**
 * INSTABILITY MAPPING (fixed):
 *   modulation signal m(t) is bounded to −1…+1 and smoothed (< ~3 Hz)
 *   pitch deviation  = m(t) × instability × 150 cents   (max ±1.5 semitones)
 *   amplitude factor = 1 − 0.3·I + 0.3·I·m(t)           (range 1−0.6·I … 1)
 * The amplitude factor never exceeds 1, so instability can only
 * dip the level, never push it up unexpectedly.
 */
export const INSTABILITY = { pitchCents: 150, ampDepth: 0.3 };

/**
 * Distortion Drive → pre-gain into a tanh shaper (×1 … ×40) and a
 * make-up gain of 1/√pre so heavier drive doesn't simply mean louder.
 */
export const drivePreGain = (drive) => Math.pow(10, drive * 1.6);
export const driveMakeup = (drive) => 1 / Math.sqrt(drivePreGain(drive));
