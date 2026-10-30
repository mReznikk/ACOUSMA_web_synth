// ─────────────────────────────────────────────────────────────
// BED — the throbbing, hazy background under the piece.
// Two slightly detuned saws (a beat of ~0.45 Hz between them), low-passed
// into warmth, with a tempo-synced amplitude throb and a slow filter drift.
// No noise at all (an earlier haze layer sounded like breathing and was removed).
// The saws follow the chord root (setRoot). The PAD plays into the same throb
// (`input`), so chords pump with the bed. Enters the master directly, so CUT silences it.
// Controlled through set(): level in dB, throb depth 0..1.
// ─────────────────────────────────────────────────────────────
import * as Tone from "tone";

export function createBed(engine) {
  const out = new Tone.Gain(0);
  const throb = new Tone.Gain(0); // the LFO supplies 0..1
  const lp = new Tone.Filter({ type: "lowpass", frequency: 200, Q: 0.6, rolloff: -24 });
  const o1 = new Tone.Oscillator({ type: "sawtooth", frequency: 55 });
  const o2 = new Tone.Oscillator({ type: "sawtooth", frequency: 55.45 });
  const sub = new Tone.Oscillator({ type: "sine", frequency: 27.5 });
  const subGain = new Tone.Gain(0.9);
  const oscGain = new Tone.Gain(0.22);

  const lfoThrob = new Tone.LFO({ frequency: "4n", min: 0.25, max: 1, type: "sine" }); // one throb per beat
  const lfoFilter = new Tone.LFO({ frequency: "1m", min: 130, max: 330, type: "sine" });
  const lfoDetune = new Tone.LFO({ frequency: 0.07, min: -9, max: 9, type: "sine" });

  o1.connect(oscGain); o2.connect(oscGain); oscGain.connect(lp);
  sub.connect(subGain); subGain.connect(throb);
  lp.connect(throb);
  throb.connect(out);
  // bus: everything pitched (bed, pad, lead) passes here, so ONE precise gate can cut it
  const bus = new Tone.Gain(1);
  out.connect(bus);
  bus.connect(engine.protection);

  lfoThrob.connect(throb.gain);
  lfoFilter.connect(lp.frequency);
  lfoDetune.connect(o2.detune);

  // ── HUM: the low sound that begins after the cut. 55 Hz and its octave, a slightly
  //    detuned twin (beating at 0.4 Hz), a little low-passed saw for body. It goes straight
  //    to the protection stage, so the cut gate does not touch it.
  const humGain = new Tone.Gain(0);
  const hA = new Tone.Oscillator({ type: "sine", frequency: 55 });
  const hB = new Tone.Oscillator({ type: "sine", frequency: 55.4 });
  const hC = new Tone.Oscillator({ type: "sine", frequency: 110 });
  const hCg = new Tone.Gain(0.3);
  const hS = new Tone.Oscillator({ type: "sawtooth", frequency: 55 });
  const hSlp = new Tone.Filter({ type: "lowpass", frequency: 150, Q: 0.5 });
  const hSg = new Tone.Gain(0.22);
  const humTrem = new Tone.LFO({ frequency: 0.11, min: 0.72, max: 1, type: "sine" });
  const humMix = new Tone.Gain(0);
  hA.connect(humMix); hB.connect(humMix); hC.connect(hCg); hCg.connect(humMix);
  hS.connect(hSlp); hSlp.connect(hSg); hSg.connect(humMix);
  humMix.connect(humGain); humTrem.connect(humMix.gain);
  humGain.connect(engine.protection);
  let humOn = false;
  let humLevel = 0;

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    for (const n of [o1, o2, sub]) n.start();
    for (const l of [lfoThrob, lfoFilter, lfoDetune]) l.start();
  };

  return {
    start,
    /** db: bed level; depth 0..1: how deep the throb goes; hazeAmt 0..1 */
    set(db, depth) {
      start();
      out.gain.rampTo(db <= -60 ? 0 : Tone.dbToGain(db), 0.25);
      lfoThrob.min = 1 - 0.85 * Math.min(1, Math.max(0, depth));
    },
    /** Move the saws and the sub to a new chord root (Hz). */
    setRoot(hz, glide = 0.5) {
      o1.frequency.rampTo(hz, glide);
      o2.frequency.rampTo(hz * 1.0082, glide);
      sub.frequency.rampTo(hz / 2, glide);
    },
    /** Pad and other voices connect here to share the throb. */
    input: throb,
    /** Gate for bed, pad and lead together: closes in 12 ms at audio time t. */
    cutAt(t) {
      const g = bus.gain;
      g.cancelScheduledValues(Tone.now());
      g.setValueAtTime(1, t);
      g.linearRampToValueAtTime(0, t + 0.012);
    },
    /** Hum: silent from t, then rises to `db` over `rise` seconds starting `delay` seconds later. */
    humRise(t, delay, rise, db) {
      if (!humOn) { humOn = true; for (const n of [hA, hB, hC, hS]) n.start(); humTrem.start(); }
      humLevel = Tone.dbToGain(db);
      const g = humGain.gain;
      g.cancelScheduledValues(Tone.now());
      g.setValueAtTime(0, t);
      g.setValueAtTime(0, t + delay);
      g.linearRampToValueAtTime(humLevel, t + delay + rise);
    },
    humFall(t, seconds) {
      const g = humGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(humLevel, t);
      g.linearRampToValueAtTime(0, t + seconds);
    },
    /** Back to the start: gates open, hum off. */
    reset() {
      bus.gain.cancelScheduledValues(0); bus.gain.value = 1;
      humGain.gain.cancelScheduledValues(0); humGain.gain.value = 0;
    },
    bus,
    silence(seconds = 0.3) { out.gain.rampTo(0, seconds); },
    dispose() { for (const n of [out, throb, lp, o1, o2, sub, subGain, oscGain, lfoThrob, lfoFilter, lfoDetune]) { try { n.dispose(); } catch {} } },
  };
}
