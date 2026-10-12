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

export class Clock {
  constructor(engine) {
    this.engine = engine;
    this.transport = Tone.getTransport();
    this.eventId = this.transport.scheduleRepeat((time) => this._tick(time), "16n", 0);
  }

  play() {
    if (this.transport.state === "started") return; // ignore repeated presses
    this.transport.start("+0.05");
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

    for (const id of ["synth1", "synth2"]) {
      const voice = engine[id];
      const v = s[id];
      if (v.mode === "drone") {
        if (!voice.droneOpen) voice.openDrone(time);
      } else {
        if (voice.droneOpen) voice.closeDrone(time);
        const st = v.pattern[step];
        if (st.on) voice.trigger(time, st, stepSeconds);
      }
    }

    for (const id of DRUM_IDS) {
      if (s.drums[id].steps[step]) engine.drums[id].trigger(time);
    }

    Tone.getDraw().schedule(() => engine.onStep(step), time);
  }

  dispose() {
    this.transport.clear(this.eventId);
  }
}
