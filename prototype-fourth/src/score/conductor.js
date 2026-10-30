// ─────────────────────────────────────────────────────────────
// CONDUCTOR — plays the score through the existing store/engine.
//
// It adds no audio nodes. It only (1) writes sequencer rows at bar boundaries,
// (2) moves the three macros ~30 times a second and writes the result through
// macrosToState(), and (3) performs the BREAK. Every write goes through
// store.set(), so the engine's own smoothing applies and nothing jumps.
//
// Bar events are scheduled on the Transport ONE 16th EARLY (at step 16 of the
// previous bar), so a row written for bar n is already in place when bar n's
// first step is scheduled.
//
// Macro value = score + the performer's hand offset (limited to ±OFFSET_MAX).
// When the hand lets go, the offset returns to zero over RETURN_SECONDS.
// ─────────────────────────────────────────────────────────────
import * as Tone from "tone";
import { macrosToState, TUNE } from "../audio/macros.js";
import { createBed } from "../audio/bed.js";
import { createMusic } from "../audio/music.js";
import { createVoice } from "../audio/voice.js";
import { synthPattern, drumRow } from "../state/schema.js";
import { loadPreset, OPENING_PRESET } from "../state/presets.js";
import * as S from "./score.js";
import { seeded } from "../audio/clock.js";

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function createConductor({ store, engine }) {
  const transport = Tone.getTransport();
  let B = S.B_AUTO;
  let running = false;
  let ended = false;
  let pressed = false;
  let fading = false;
  let endedAt = 0;
  let eventId = null;
  let loopId = null;
  let mask = new Set(); // state paths the score owns for a while (not written by the macros)
  let lastValue = {};
  let lastRow = {};
  let hasRun = false;
  let bed = null;
  let music = null;
  let voice = null;

  const hand = { offset: [0, 0, 0], down: [false, false, false], from: [0, 0, 0], since: [0, 0, 0] };

  const time = () => (running ? transport.seconds : ended ? endedAt : 0);
  const base = (T = time()) => S.macroBase(T, B);
  const effective = (T = time()) => base(T).map((v, i) => clamp(v + hand.offset[i]));

  // ── writing ────────────────────────────────────────────────
  function setValue(path, v) {
    if (store.get(path) !== v) store.set(path, v);
  }
  function setRow(key, make, data) {
    const j = JSON.stringify(data);
    if (lastRow[key] === j) return;
    lastRow[key] = j;
    store.setTree(key, make(data));
  }
  const pulseRow = (spec) => setRow("synth1.pattern", synthPattern, spec);
  const frictionRow = (spec) => setRow("synth2.pattern", synthPattern, spec);
  const clangRow = (steps) => setRow("drums.clang.steps", drumRow, steps);
  const tickRow = (steps) => setRow("drums.tick.steps", drumRow, steps);
  const thudRow = (steps) => setRow("drums.thud.steps", drumRow, steps);
  const crackRow = (steps) => setRow("drums.crack.steps", drumRow, steps);

  function applyMacros(m) {
    const state = macrosToState(m[0], m[1], m[2]);
    for (const [path, v] of Object.entries(state)) {
      if (mask.has(path)) continue;
      if (Math.abs(v - (lastValue[path] ?? Infinity)) > 1e-4) {
        lastValue[path] = v;
        store.set(path, v);
      }
    }
  }

  // ── the 30 Hz loop: macros, hand, final fade ───────────────
  function update() {
    if (!running) return;
    const now = performance.now();
    for (let i = 0; i < 3; i++) {
      if (!hand.down[i] && hand.offset[i] !== 0) {
        const u = (now - hand.since[i]) / 1000 / S.RETURN_SECONDS;
        hand.offset[i] = u >= 1 ? 0 : hand.from[i] * (1 - u);
      }
    }
    const T = time();
    applyMacros(effective(T));
    if (bed && music) {
      const [lv, depth] = S.bedAt(T, B);
      if (lv <= 0.001) bed.set(-80, 0);
      else bed.set(TUNE.bed + 20 * Math.log10(lv), depth * (TUNE.throb / 0.6));
      const [pad, lead, bright] = S.mixAt(T, B);
      const db = (x, trim) => (x <= 0.001 ? -80 : trim + 20 * Math.log10(x));
      const C = effective(T)[1];
      music.setLevels(db(pad, TUNE.pad), db(lead, TUNE.lead + (C - 0.5) * 6), 300 + 700 * bright, 500 + (TUNE.leadBright - 500) * bright);
      music.setWall(TUNE.wall);
      const [riff, open] = S.riffMix(T, B);
      music.setRiff(db(riff, TUNE.riff), 220 + (TUNE.riffBright - 220) * open * open);
    }
    engine.muffle.frequency.rampTo(TUNE.muffle, 0.1);
    // Dynamics: the master level eases DOWN through the build and jumps UP for the catharsis,
    // so the release is louder and fuller than anything before it (the limiter caps the peaks).
    const tb = B * S.BAR;
    const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
    const master = T < tb ? 0.88 - 0.2 * sm((T - 30) / 80) : 0.68 + 0.19 * sm((T - tb) / 1.5);
    setValue("master.level", Math.round(master * 200) / 200);
  }

  // ── bar events ─────────────────────────────────────────────
  function onBar(time) {
    const bar = Math.floor(transport.getTicksAtTime(time) / (transport.PPQ * 4)) + 1; // the bar about to begin
    const step = Tone.Time("16n").toSeconds();
    const rel = bar - B;

    if (rel < S.CLIMAX_BARS) { // build, then catharsis: both are just rows for the bar
      const p = S.patternsForBar(bar, effective()[1], B);
      pulseRow(p.synth1);
      frictionRow(p.synth2);
      clangRow(p.clang);
      tickRow(p.tick);
      thudRow(p.thud);
      crackRow(p.crack);
      setValue("synth1.pitch", S.bassAt(bar, B)); // the pulse follows the harmony
      return;
    }
    if (rel === S.CLIMAX_BARS) return cutAll(time + step);
    if (rel === endRel - 2) return bed.humFall(time + step, 2 * S.BAR); // the hum fades over the last two bars
    if (rel >= endRel) return finish();
  }
  const endRel = 12;

  // The cut: at the bar line, in the same instant, everything stops — drums, bass, bed, pad, lead,
  // reverb and echo tails. Then ~1 s of nothing, and the hum rises on its own.
  function cutAll(t) {
    pulseRow({}); frictionRow({}); tickRow([]); clangRow([]); thudRow([]); crackRow([]);
    const g = engine.presetFade.gain;
    g.cancelScheduledValues(Tone.now());
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0, t + 0.012);
    bed.cutAt(t);
    bed.humRise(t, 1.1, 5, TUNE.hum);
    if (voice) voice.play(S.FINAL_LINE, t + S.FINAL_LINE.after, TUNE); // the forward line, dry, after a moment of nothing
  }

  function finish() {
    endedAt = transport.seconds;
    running = false;
    ended = true;
    clearInterval(loopId);
    transport.clear(eventId);
    engine.stop();
    engine.musicStep = null;
    if (music) music.silence();
    if (bed) bed.silence(0.5);
  }

  // Pitched instruments: called by the clock on every 16th step (bar = score bar, step = 0..15).
  function onMusicStep(bar, step, time) {
    if (!running || !music) return;
    if (step === 0) {
      const ps = S.padStart(bar, B);
      if (ps) music.padChord(ps.notes, ps.seconds, time);
      if (S.chordAt(bar, B)) bed.setRoot(S.bassAt(bar, B), 0.6);
    }
    const [, C, I] = effective();
    const vc = voice && S.voiceAt(bar, step + 1);
    if (vc) voice.play(vc, time, TUNE);
    const rf = S.riffAt(bar, step + 1, B);
    if (rf) music.riffNote(rf, time);
    const ev = S.leadAt(bar, step + 1, B, C);
    if (ev) music.leadNote(ev.midi, ev.dur, time, ev.vel * 0.7, ev.cents ?? (seeded(bar, step + 99) - 0.5) * 160 * I, ev.glide || 0);
  }

  // ── transport of the piece ─────────────────────────────────
  async function reset() {
    clearInterval(loopId);
    if (eventId !== null) transport.clear(eventId);
    eventId = null;
    if (bed) { bed.silence(0.1); bed.reset(); }
    if (music) music.silence();
    if (voice) voice.stop();
    if (engine.started && hasRun) {
      await engine.cut(); // stops the clock too, and flushes delay / reverb tails
    }
    running = false; ended = false; pressed = false; fading = false; endedAt = 0;
    B = S.B_AUTO;
    mask = new Set(); lastValue = {}; lastRow = {};
    for (let i = 0; i < 3; i++) { hand.offset[i] = 0; hand.down[i] = false; }
    if (engine.started) await engine.fadeForPreset(() => store.replace(loadPreset(OPENING_PRESET)));
    else store.replace(loadPreset(OPENING_PRESET));
  }

  /** One action: audio on, opening preset, silence, then the piece. */
  async function start(at = 0) {
    if (running) return;
    await engine.start();
    await reset();
    if (!bed) { bed = createBed(engine); music = createMusic(engine, bed); await music.ready; voice = await createVoice(engine, bed); }
    engine.musicStep = onMusicStep;
    at = Math.max(0, Math.min(at, (B - 2) * S.BAR)); // jumping in is allowed before the break only
    hasRun = true;
    running = true;
    if (at > 0) {
      transport.seconds = at;
      const bar0 = Math.floor(at / S.BAR) + 1; // the bar that is already sounding
      const p = S.patternsForBar(bar0, effective(at)[1], B);
      pulseRow(p.synth1); frictionRow(p.synth2); clangRow(p.clang); tickRow(p.tick); thudRow(p.thud); crackRow(p.crack);
    }
    applyMacros(effective(at));
    eventId = transport.scheduleRepeat(onBar, "1m", "0:3:3"); // last 16th of each bar
    loopId = setInterval(update, 33);
    engine.play(at > 0 ? at : undefined);
  }

  // ── the performer ──────────────────────────────────────────
  function touch(i, value) {
    if (!running) return;
    hand.down[i] = true;
    hand.offset[i] = clamp(value - base()[i], -S.OFFSET_MAX, S.OFFSET_MAX);
  }
  function release(i) {
    if (!hand.down[i]) return;
    hand.down[i] = false;
    hand.from[i] = hand.offset[i];
    hand.since[i] = performance.now();
  }

  /** The catharsis can be called from bar 42 (S.B_ARM). Pressing fires it at the next bar start. */
  function pressBreak() {
    const T = time();
    if (!running || pressed || T < S.B_ARM * S.BAR || T >= B * S.BAR - 0.3) return false;
    B = Math.max(Math.floor((T + 0.3) / S.BAR) + 1, S.B_ARM + 1);
    pressed = true;
    return true;
  }
  function breakState() {
    const T = time();
    if (!running && !ended) return "locked";
    if (T >= B * S.BAR) return "fired";
    if (pressed) return "pending";
    return T >= S.B_ARM * S.BAR ? "armed" : "locked";
  }

  function status() {
    const T = time();
    return {
      running, ended, T, B,
      base: base(T), macros: effective(T),
      touched: hand.down.map((d, i) => d || Math.abs(hand.offset[i]) > 0.002),
      offset: hand.offset.slice(),
      breakState: breakState(),
      breakAt: B * S.BAR,
      endAt: S.endTime(B),
      cue: running || ended ? S.cueAt(T, B) : "",
    };
  }

  /** After a TUNE change: write every macro-owned value again on the next tick. */
  function refresh() { lastValue = {}; }

  return { start, reset, touch, release, pressBreak, status, refresh };
}
