// ─────────────────────────────────────────────────────────────
// THE SCORE (working title: FOURTH) — plain data and pure functions.
// No audio, no store, no timers: the conductor reads this and acts on it.
//
// 75 BPM → one 16th step = 0.2 s, one bar = 3.2 s = one sweep of the display.
// Everything is placed on the bar grid. B is the CATHARSIS bar (default 44; the
// performer can bring it earlier once it is armed at bar 42).
//
//   bar  0        silence
//   bar  1–3      one pulse, two, three           (steps 1, 5, 9)
//   bar  4        + first exhale
//   bar  5        the late fourth pulse (step 14) — the motif is complete
//   bar 10        CLANG ghost    bar 20  TICK (the only "mechanism" cue)
//   bar 24        destabilisation: macros climb
//   bar 28        the exhale moves BEFORE the fourth pulse
//   bar 33        dropouts       bar 36  the fourth pulse doubles
//   bar 37        BREAK armed    bar B   BREAK (drones + one CLANG, veil lifts)
//   B+6  drones released into silence     B+8   residue: three slow pulses, no fourth
//   B+13 exhale alone                     B+15  attackless swell, B+16.5 fade, B+17 end
// ─────────────────────────────────────────────────────────────
import { seeded } from "../audio/clock.js";

export const BAR = 3.2; // seconds, at 75 BPM
export const B_ARM = 42;
export const B_AUTO = 44;
export const OFFSET_MAX = 0.25; // how far the hand may push a macro away from the score
export const RETURN_SECONDS = 8; // how long the score takes to win control back
export const config = { drums: true }; // ?drums=0 plays the drumless version

export const CLIMAX_BARS = 4; // the catharsis lasts four bars, then everything is cut
export const endBar = (B) => B + 12; // …followed by eight bars of hum

export const endTime = (B) => endBar(B) * BAR;

// [seconds, Proximity, Coherence, Instability] — linear in between
const KEYS = [
  [0, 0.15, 0.15, 0],
  [32, 0.3, 0.4, 0.05],
  [77, 0.5, 0.85, 0.1],
  [90, 0.58, 0.9, 0.3],
  [105, 0.66, 0.7, 0.6],
  [115, 0.72, 0.4, 0.95], // the build stays BELOW the top, so the catharsis has somewhere to go
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => t * t * (3 - 2 * t);

/** [P, C, I] the score asks for at time T (seconds), given the break bar B. */
export function macroBase(T, B) {
  const tb = B * BAR;
  if (T >= tb) {
    if (T >= (B + CLIMAX_BARS) * BAR) return [0.05, 0.1, 0.05]; // after the cut: nothing left to control
    const u = smooth(clamp(T - tb)); // catharsis: everything at the top, the tension released into force
    return [lerp(0.72, 1, u), lerp(0.4, 0.75, u), lerp(0.95, 0.9, u)];
  }
  if (T <= 0) return KEYS[0].slice(1);
  for (let k = 1; k < KEYS.length; k++) {
    if (T <= KEYS[k][0]) {
      const a = KEYS[k - 1];
      const b = KEYS[k];
      const t = (T - a[0]) / (b[0] - a[0]);
      return [1, 2, 3].map((i) => lerp(a[i], b[i], t));
    }
  }
  return KEYS[KEYS.length - 1].slice(1);
}

/**
 * What the sequencer rows should hold for a bar BEFORE the break.
 * Step numbers are 1-based, as in the sequencer. `C` is the effective Coherence,
 * which decides (with a fixed seed) whether pulses 2–3 are present in a bar.
 */
export function patternsForBar(bar, C, B = B_AUTO) {
  if (bar >= B) { // CATHARSIS: eighth-note bass drive, four-on-the-floor, heavy backbeat; last bar a fill
    const rel = bar - B;
    const drive = {};
    for (const st of [1, 3, 5, 7, 9, 11, 13, 15]) drive[st] = [0, 0.25, st === 1];
    const last = rel === CLIMAX_BARS - 1;
    return {
      synth1: drive, synth2: {}, clang: [], tick: [3, 7, 11, 15],
      thud: last ? [1, 5, 9, 11, 13] : [1, 5, 9, 13],
      crack: last ? [5, 9, 11, 13, 15, 16] : [5, 13],
    };
  }
  const GATE = 0.35;
  const pulse = {};
  const n = bar < 1 ? 0 : Math.min(3, bar);
  [1, 5, 9].slice(0, n).forEach((step, k) => {
    if (k > 0 && seeded(bar, 20 + k) > 0.6 + 0.4 * C) return; // low Coherence loses pulses 2–3
    if (k === 2 && bar >= 33 && seeded(bar, 31) < 0.55) return; // dropout
    pulse[step] = [0, GATE, step === 1];
  });
  if (bar >= 5) pulse[14] = [0, GATE, false]; // the late fourth pulse: one step after where a regular beat falls (13)
  if (bar >= 36) pulse[15] = [0, 0.2, false]; // …and it doubles

  const exhale = {}; // (the breath-like noise voice was removed: it sounded like blowing into something)

  // ── DRUMS: a hard, mechanical rhythm that carries the build and is cut dead at the break ──
  //   bar 12  kick alone      bar 14  + snare on the backbeat     bar 16  the groove (kick 1, 11)
  //   bar 24  syncopation: extra kicks, the 14th-step kick doubles the late pulse
  //   bar 28  16th hats, ghost snares      bar 36  fills every 4th bar      bar B-1  roll into the cut
  let thud = [], crack = [], tick = [];
  if (config.drums) {
    if (bar >= 12) thud = [1];
    if (bar >= 14) crack = [9];
    if (bar >= 16) { thud = [1, 11]; tick = [7, 15]; }
    if (bar >= 24) { thud = [1, 4, 11, 14]; crack = [9, 16]; }
    if (bar >= 28) { thud = [1, 4, 7, 11, 14]; crack = [9, 16]; tick = [3, 7, 11, 15]; }
    if (bar >= 33 && seeded(bar, 41) < 0.4) thud = thud.filter((x) => x !== 7); // dropout: the groove loses a hit
    if (bar >= 36 && bar % 4 === 0) { crack = [9, 13, 15, 16]; thud = [1, 4, 11]; }
    if (bar === B - 1) { thud = [1]; crack = [9, 11, 13, 14, 15, 16]; tick = []; } // the roll, then nothing
  }

  return {
    synth1: pulse,
    synth2: exhale,
    clang: [], // (the metallic ghost hit was removed)
    tick,
    thud,
    crack,
  };
}

/** Name of the section, for display. */
export function cueAt(T, B) {
  if (T < BAR) return "";
  if (T < 10 * BAR) return "Emergence";
  if (T < 24 * BAR) return "Recognition";
  if (T < B * BAR) return T >= B_ARM * BAR ? "Destabilisation · armed" : "Destabilisation";
  if (T < (B + CLIMAX_BARS) * BAR) return "Catharsis";
  if (T < endTime(B)) return "Hum";
  return "";
}

/**
 * The bed (throbbing background): [level 0..1, throb depth 0..1] at time T.
 * Fades in from bar 5, deepens with the build, is at full strength in the catharsis,
 * and is cut with everything else. The hum afterwards is a separate voice.
 */
export function bedAt(T, B) {
  const tb = B * BAR;
  const [P, , I] = macroBase(Math.min(T, tb - 0.01), B);
  if (T < tb) return [smooth(clamp((T - 5 * BAR) / (14 * BAR))) * (0.55 + 0.45 * P), 0.3 + 0.7 * I];
  if (T < (B + CLIMAX_BARS) * BAR) return [1, 0.45]; // full
  return [0, 0]; // cut
}

// ─────────────────────────────────────────────────────────────
// HARMONY and MELODY — a progression of TENSION, not of pretty chords.
// Everything is built on one pedal note, A (55 Hz), and the intervals around it.
//
//   bars  0–11   hollow: A and E only (an open fifth, no third: neither major nor minor)
//   bars 12–17   + a minor second (Bb) rubbing against the root
//   bars 18–23   the fifth is replaced by a tritone (Eb): nothing left to rest on
//   bars 24–29   a cluster A–Bb–B
//   bars 30–33   the floor slips a semitone (G#): the whole thing sags
//   bars 34–35   …and climbs (Bb), then (from bar 36) B: a chromatic crawl upward
//   B …B+3      CATHARSIS: the cluster collapses into one huge A: octaves and a bare fifth,
//                eighth-note bass drive, four-on-the-floor, the lead holding A4 then A5.
//                No third, no major bloom: force, not sweetness. The tension is released by
//                everyone finally agreeing on one note.
//   B+4          everything is CUT in the same instant (a hard gate, tails included).
//   B+4 …        silence for a moment, then only a low hum (55 Hz and its octave) rises,
//                and slowly fades out over the last two bars.
//
// MOTIF (lead, low register): root – minor second – root – … and, late, the tritone.
// Intervals are semitones above the chord's `root` (MIDI). Instability bends it out of tune.
// ─────────────────────────────────────────────────────────────
const CH = {
  hollow: { id: "hollow", bass: 55, root: 57, pad: ["A1", "E2", "A2"] },
  m2: { id: "m2", bass: 55, root: 57, pad: ["A1", "E2", "A2", "Bb2"] },
  tri: { id: "tri", bass: 55, root: 57, pad: ["A1", "Eb2", "A2", "Bb2"] },
  cluster: { id: "cluster", bass: 55, root: 57, pad: ["A1", "Eb2", "A2", "Bb2", "B2"] },
  slip: { id: "slip", bass: 51.91, root: 56, pad: ["G#1", "D2", "A2", "Bb2", "B2"] },
  climb: { id: "climb", bass: 58.27, root: 58, pad: ["Bb1", "E2", "B2", "C3", "C#3"] },
  peak: { id: "peak", bass: 61.74, root: 59, pad: ["B1", "F2", "B2", "C3", "C#3", "D3"] },
  power: { id: "power", bass: 55, root: 57, pad: ["A1", "A2", "E3", "A3", "A4"] },
};

/** The harmony sounding in a bar (null = silence). */
export function chordAt(bar, B) {
  if (bar >= B) return bar - B < CLIMAX_BARS ? CH.power : null;
  if (bar < 12) return CH.hollow;
  if (bar < 18) return CH.m2;
  if (bar < 24) return CH.tri;
  if (bar < 30) return CH.cluster;
  if (bar < 34) return CH.slip;
  if (bar < 36) return CH.climb;
  return CH.peak;
}

/** Notes for the pad when the harmony changes in `bar`: null if nothing starts there. */
export function padStart(bar, B) {
  const c = chordAt(bar, B);
  if (!c || bar < 6) return null;
  const prev = bar === 6 ? null : chordAt(bar - 1, B);
  if (prev && prev.id === c.id) return null;
  let n = 1;
  while (n < 12 && chordAt(bar + n, B)?.id === c.id) n++;
  return { notes: c.pad, seconds: n * BAR + 0.4 };
}

/** One lead note on a 1-based step of `bar`: { midi, dur, vel, cents?, glide? } or null. C = Coherence. */
export function leadAt(bar, step, B, C) {
  const c = chordAt(bar, B);
  if (!c) return null;
  const keep = (anchor) => anchor || seeded(bar, step + 60) < 0.55 + 0.45 * C;
  const r = c.root;

  if (bar >= B) { // the catharsis: long, full notes, all on A
    const rel = bar - B;
    if (rel === 0 && step === 1) return { midi: r + 12, dur: 6.2, vel: 0.95 };
    if (rel === 2 && step === 1) return { midi: r + 24, dur: 6.2, vel: 0.9 };
    return null;
  }
  if (bar < 8) return null;
  if (bar < 12) return step === 1 || step === 9 ? (keep(step === 1) ? { midi: r, dur: 1.4, vel: 0.45 } : null) : null;
  if (bar < 24) { // the motif: root, m2, root … late tritone
    const k = [1, 5, 9].indexOf(step);
    if (k >= 0) return keep(k === 0) ? { midi: r + [0, 1, 0][k], dur: 1.1, vel: k === 1 ? 0.5 : 0.45 } : null;
    if (step === 14) return keep(false) ? { midi: r + 6, dur: 0.9, vel: 0.45 } : null;
    return null;
  }
  if (bar >= B - 3) { // the siren: a chromatic run that crawls upward, three octaves over three bars
    const n = (bar - (B - 3)) * 16 + (step - 1);
    return { midi: r + 12 + Math.floor(n * 0.75), dur: 0.22, vel: 0.45 + 0.4 * (n / 47), glide: 0.05 };
  }
  const k = [1, 4, 7, 10, 13].indexOf(step); // stuttering cell, syncopated against the kick
  if (k < 0) return null;
  const cell = [[0, 1, 0, 6, 1], [0, 6, 1, 0, 6], [1, 0, 6, 1, 0]][bar % 3];
  return keep(k === 0) ? { midi: r + (bar >= 30 ? 12 : 0) + cell[k], dur: 0.4, vel: k === 0 ? 0.75 : 0.5 } : null;
}

/** Bass root (Hz) for the pulse and the bed while the harmony moves. */
export const bassAt = (bar, B) => chordAt(bar, B)?.bass ?? 55;

/** [pad level 0..1, lead level 0..1, brightness 0..1] at time T. */
export function mixAt(T, B) {
  const tb = B * BAR;
  if (T < tb) {
    const [P] = macroBase(T, B);
    return [smooth(clamp((T - 6 * BAR) / (10 * BAR))) * (0.6 + 0.4 * P), smooth(clamp((T - 7 * BAR) / (4 * BAR))), P];
  }
  if (T < (B + CLIMAX_BARS) * BAR) return [1.25, 0.95, 1]; // full force, filter wide
  return [0, 0, 0];
}

// ─────────────────────────────────────────────────────────────
// RIFF — the instrument that emerges: a rubber bass (one low sawtooth, resonant low-pass,
// overdrive, bent notes). It starts submerged and muffled around bar 28 (1:30), opens up as the
// build goes on so it is clearly present by about 2:00 (bar 37), and drives the catharsis as
// power-chord eighths. Its figure is the piece's motif, played as chugs: root, root, a minor
// second above, and — late in the bar — the tritone.
// Returns { midi: [..], dur, vel } for a 1-based step, or null.
// ─────────────────────────────────────────────────────────────
export function riffAt(bar, step, B) {
  const c = chordAt(bar, B);
  if (!c || bar < 28) return null;
  const r = c.root - 24; // A1 (55 Hz): the "C0 to C2" range of a real bassline
  if (bar >= B) { // catharsis: straight eighths on the root, each snapping down from an octave above; the last bar dives
    const last = bar - B === CLIMAX_BARS - 1;
    if (last && step === 13) return { midi: r - 19, from: r + 12, bend: 0.5, dur: 0.8, vel: 1 }; // falls to ~18 Hz
    if (!(last || step % 2 === 1)) return null;
    return { midi: r, from: r + 12, bend: step === 1 ? 0.14 : 0.07, dur: 0.17, vel: step === 1 ? 1 : 0.85 };
  }
  // The figure: chugs that bend into place. Step 5 sits a minor second up; step 13 starts on the
  // tritone and falls away to a note so low that its oscillations can almost be counted.
  const fig = {
    1: { midi: r, from: r + 12, bend: 0.09, dur: 0.2, vel: 0.95 },
    4: { midi: r, from: r + 7, bend: 0.06, dur: 0.12, vel: 0.7 },
    5: { midi: r + 1, from: r + 8, bend: 0.06, dur: 0.14, vel: 0.75 },
    7: { midi: r, from: r + 5, bend: 0.05, dur: 0.12, vel: 0.7 },
    9: { midi: r, from: r + 12, bend: 0.09, dur: 0.2, vel: 0.95 },
    10: { midi: r, dur: 0.1, vel: 0.65 },
    12: { midi: r, from: r + 7, bend: 0.05, dur: 0.1, vel: 0.7 },
    13: { midi: r - 19, from: r + 6, bend: 0.38, dur: 0.55, vel: 0.9 },
  };
  if (bar % 4 === 3 && step > 8) return null; // every fourth bar the line breathes: the second half drops out
  if (bar >= 36 && (step === 15 || step === 16)) return { midi: r, from: r + 3, bend: 0.04, dur: 0.07, vel: 0.6 }; // late stuttering chugs
  return fig[step] ?? null;
}

/** [level 0..1, openness 0..1] of the riff voice at time T: submerged → present → full. */
export function riffMix(T, B) {
  const tb = B * BAR;
  if (T < 88) return [0, 0];
  if (T < tb) {
    const e = smooth(clamp((T - 88) / 32)); // 1:28 → 2:00
    const late = smooth(clamp((T - 120) / (tb - 120)));
    return [0.1 + 0.45 * e + 0.2 * late, 0.08 + 0.4 * e + 0.15 * late];
  }
  if (T < (B + CLIMAX_BARS) * BAR) return [1, 1];
  return [0, 0];
}

// ─────────────────────────────────────────────────────────────
// VOICE CUES — the psychiatrist. Each question comes closer: further away and duller first,
// then nearer. They sit where the late fourth pulse would be, at the start of a bar.
// Lines 1, 2, 8 are reversed recordings (used as they are). Line 11 is forward, after the cut.
// ─────────────────────────────────────────────────────────────
const VOICE_CUES = [
  { bar: 14, id: 1, dB: -3, room: 0.8, rate: 0.98, words: ["?detrats ti nehw", "em llet uoy naC"], dur: 4.6 }, // "Can you tell me when it started?" backwards, as the recording says it
  { bar: 22, id: 2, dB: 0, room: 1.0, rate: 0.99, words: ["?uoy ni ro ,moor eht", "ni dnuos eht sI"], dur: 7.4 },
  { bar: 32, id: 8, dB: 3, room: 1.4, rate: 1, words: ["?enola era uoy", "nehw reduol ti sI"], dur: 6.0 }, // nearer, brighter
];
/** The questions as text on screen: they form out of grain while the (reversed) voice plays.
 *  t0 = when the text starts to form, dur = how long the voice lasts. */
export const WORD_CUES = VOICE_CUES.map((c) => ({ t0: c.bar * BAR + 0.3, dur: c.dur, lines: c.words }));
export const voiceAt = (bar, step) => (step === 1 ? VOICE_CUES.find((c) => c.bar === bar) ?? null : null);
/** The last phrase (forward) plays this many seconds after the cut. */
// words: the last phrase, printed clean (no grain) while it plays — the only text that reads forwards.
export const FINAL_LINE = { id: 11, after: 3.7, words: ["Where does it go", "when it stops?"], dur: 4.8 }; // the reversed halo fills the silence before it
