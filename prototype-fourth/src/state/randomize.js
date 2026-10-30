// ─────────────────────────────────────────────────────────────
// Restrained randomization. Only touches pattern data — never
// levels, master volume or effect feedback. Results are sparse
// and anchored to the beat so they work as starting points.
// ─────────────────────────────────────────────────────────────
import { STEPS, step } from "./schema.js";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

// Offsets lean on the root, octaves and a few "machine" intervals.
const PULSE_OFFSETS = [0, 0, 0, 0, 12, -12, 7, -5, 3];
const FRICTION_OFFSETS = [0, 0, 0, 5, -7, 12, 1, -1];

/** voice: "synth1" | "synth2" */
export function randomSynthPattern(voice) {
  const offsets = voice === "synth1" ? PULSE_OFFSETS : FRICTION_OFFSETS;
  const density = voice === "synth1" ? 0.32 : 0.22;
  const pattern = Array.from({ length: STEPS }, (_, i) => {
    const onBeat = i % 4 === 0;
    const p = onBeat ? density + 0.25 : density * 0.7;
    if (!chance(p)) return step();
    return step(true, pick(offsets), 0.2 + Math.random() * 0.5, chance(onBeat ? 0.35 : 0.1));
  });
  // Never return an empty bar: anchor step 1 if nothing landed.
  if (!pattern.some((s) => s.on)) pattern[0] = step(true, 0, 0.5, true);
  return pattern;
}

const DRUM_PROFILE = {
  thud: { beats: 0.75, offbeats: 0.08, other: 0.05, anchor: 0 },
  crack: { beats: 0.0, offbeats: 0.0, other: 0.06, backbeat: 0.7 },
  tick: { beats: 0.05, offbeats: 0.55, other: 0.15 },
  clang: { beats: 0.0, offbeats: 0.05, other: 0.06 },
};

/** id: "thud" | "crack" | "tick" | "clang" */
export function randomDrumRow(id) {
  const p = DRUM_PROFILE[id];
  const row = Array.from({ length: STEPS }, (_, i) => {
    if (p.backbeat && (i === 4 || i === 12)) return chance(p.backbeat);
    if (i % 4 === 0) return chance(p.beats);
    if (i % 4 === 2) return chance(p.offbeats);
    return chance(p.other);
  });
  if (p.anchor !== undefined) row[p.anchor] = true;
  return row;
}
