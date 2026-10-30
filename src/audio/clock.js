// ─────────────────────────────────────────────────────────────
// Clock and scheduling.
//
// ONE repeating 16th-note event on Tone's Transport drives every
// pattern (both synths + four drum rows), so tempo changes can never
// pull them apart. The event is registered exactly once, when the
// engine is built — Play just starts the Transport — so repeated
// Play/Stop never stacks duplicate callbacks.
//
// Sound is scheduled at the audio-clock `time` passed into the
// callback. The playhead is drawn with Tone.Draw, which fires the
// UI update on the animation frame closest to that audio time.
// ─────────────────────────────────────────────────────────────
import * as Tone from "tone";
import { STEPS, DRUM_IDS } from "../state/schema.js";

/** Deterministic 0..1 value for (bar, step): the same take every time. */
export function seeded(bar, step) {
  const x = Math.sin(bar * 12.9898 + step * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export class Clock {
  constructor(engine) {
    this.engine = engine;
    this.transport = Tone.getTransport();
    this.eventId = this.transport.scheduleRepeat((time) => this._tick(time), "16n", 0);
  }

  play(offset) {
    if (this.transport.state === "started") return; // ignore repeated presses
    this.transport.start("+0.05", offset);
  }

  stop() {
    if (this.transport.state !== "stopped") this.transport.stop();
    Tone.getDraw().cancel(0);
    this.engine.onStep(-1);
  }

  /** Position inside the current bar, 0..1 (used by the signal display). */
  progress() {
    const bar = this.transport.PPQ * 4;
    return (this.transport.ticks % bar) / bar;
  }

  /** Which of the 16 steps a given audio time falls on. */
  _stepAt(time) {
    const ticksPerStep = this.transport.PPQ / 4;
    return Math.round(this.transport.getTicksAtTime(time) / ticksPerStep) % STEPS;
  }

  _tick(time) {
    const { engine } = this;
    const s = engine.store.state;
    const step = this._stepAt(time);
    const stepSeconds = Tone.Time("16n").toSeconds();

    const bar = Math.floor(this.transport.getTicksAtTime(time) / (this.transport.PPQ * 4));
    const f = s.feel;

    for (const id of ["synth1", "synth2"]) {
      const voice = engine[id];
      const v = s[id];
      if (v.mode === "drone") {
        if (!voice.droneOpen) voice.openDrone(time);
      } else {
        if (voice.droneOpen) voice.closeDrone(time);
        const st = v.pattern[step];
        if (st.on) {
          // PULSE micro-timing. Offsets are only ever LATER (the audio clock cannot
          // schedule into the past), so the pulse drags, it never rushes. Step 0 is the anchor.
          let dt = 0;
          if (id === "synth1" && f) {
            if (step === f.lateStep) dt += f.late * stepSeconds;
            if (step !== 0) dt += f.jitter * seeded(bar, step);
          }
          voice.trigger(time + dt, st, stepSeconds);
        }
      }
    }

    for (const id of DRUM_IDS) {
      if (s.drums[id].steps[step]) engine.drums[id].trigger(time);
    }

    engine.musicStep?.(bar, step, time, stepSeconds);
    Tone.getDraw().schedule(() => engine.onStep(step), time);
  }

  dispose() {
    this.transport.clear(this.eventId);
  }
}
