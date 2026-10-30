// ─────────────────────────────────────────────────────────────
// MUSIC — the two pitched instruments the piece needed:
//   PAD   a soft chord instrument (three detuned saws per note, low-passed, slow attack).
//         It plays through the bed's throb, so chords breathe with the beat.
//   RIFF  the rubber bass: one saw, very low, bent notes, that emerges in the last third of the build
//   LEAD  a warm, slow-swelling melodic voice (now a quiet, internal texture)
//   (the old description: a warm, plucked melodic voice (triangle + soft saw) with a dotted-eighth echo
//         and a short room. The melody, the arpeggios and the final release are played on it.
// Neither makes noise or metal; both are plain tuned oscillators.
// Control: setLevels(), padChord(), leadNote(), silence().
// ─────────────────────────────────────────────────────────────
import * as Tone from "tone";

export function createMusic(engine, bed) {
  // ── PAD ──
  const padFilter = new Tone.Filter({ type: "lowpass", frequency: 500, Q: 0.5, rolloff: -24 });
  const padGain = new Tone.Gain(0);
  const pad = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 8,
    oscillator: { type: "fatsawtooth", count: 3, spread: 34 }, // wide spread = it beats against itself, slightly out of tune
    envelope: { attack: 1.8, decay: 0.5, sustain: 1, release: 3.2 },
  });
  pad.volume.value = -6;
  pad.chain(padFilter, padGain, bed.input);

  // ── LEAD ──
  const leadFilter = new Tone.Filter({ type: "lowpass", frequency: 1800, Q: 0.7, rolloff: -24 });
  const leadGain = new Tone.Gain(0);
  const lead = new Tone.Synth({
    oscillator: { type: "fattriangle", count: 3, spread: 26 }, // hollow, nasal, chorused out of tune
    envelope: { attack: 0.28, decay: 0.8, sustain: 0.5, release: 2.6 }, // slow swell: texture, not a tune
    portamento: 0,
  });
  const grit = new Tone.Distortion({ distortion: 0.3, wet: 0.2 });
  const echo = new Tone.FeedbackDelay({ delayTime: "4n", feedback: 0.5, wet: 0.45 });
  const room = new Tone.Reverb({ decay: 8, preDelay: 0.08, wet: 0.7 });
  // "Another room": a steep low-pass after the reverb, so even the echoes and the room itself
  // arrive dull, as if heard through a wall.
  const wall = new Tone.Filter({ type: "lowpass", frequency: 420, Q: 0.4, rolloff: -24 });
  lead.chain(grit, leadFilter, leadGain, echo, room, wall, bed.bus);

  // ── RIFF: the rubber bass ──
  //    One sawtooth voice, played very low (A1 down to ~D0). Low-pass with a LOT of resonance and a
  //    modest cutoff (this is also the "emergence": closed it is submerged, open it bites), overdrive,
  //    a little bit-crush for the ringing edge, lows lifted and mids scooped, and a small reverb on
  //    the TOP END ONLY. The character comes from the BENDS: each note starts higher and falls into
  //    place, and the long ones fall so low that you can hear the oscillation rate change.
  const riffSynth = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.004, decay: 0.12, sustain: 0.7, release: 0.09 },
  });
  const riffCrush = new Tone.BitCrusher(9);
  const riffDist = new Tone.Distortion({ distortion: 0.5, wet: 1 });
  const riffLp = new Tone.Filter({ type: "lowpass", frequency: 300, Q: 6, rolloff: -24 });
  const riffLow = new Tone.Filter({ type: "lowshelf", frequency: 110, gain: 5 });
  const riffScoop = new Tone.Filter({ type: "peaking", frequency: 850, Q: 0.8, gain: -5 });
  const riffGain = new Tone.Gain(0);
  const riffTop = new Tone.Filter({ type: "highpass", frequency: 2600, Q: 0.5 });
  const riffVerb = new Tone.Reverb({ decay: 2.6, preDelay: 0.01, wet: 1 });
  const riffVerbGain = new Tone.Gain(0.45);
  riffSynth.chain(riffDist, riffCrush, riffLp, riffLow, riffScoop, riffGain, bed.bus);
  riffGain.chain(riffTop, riffVerb, riffVerbGain, bed.bus); // the high band only, in a small room

  return {
    ready: room.ready,
    setWall(hz) { wall.frequency.rampTo(hz, 0.2); },
    setRiff(db, cutoff) {
      riffGain.gain.rampTo(db <= -60 ? 0 : Tone.dbToGain(db), 0.3);
      riffLp.frequency.rampTo(cutoff, 0.4);
    },
    /** ev: { midi, from?, bend?, dur, vel }: the note starts at `from` (MIDI) and falls to `midi` over `bend` s. */
    riffNote(ev, time) {
      const f = (m) => Tone.Frequency(m, "midi").toFrequency();
      riffSynth.triggerAttackRelease(f(ev.midi), ev.dur, time, ev.vel);
      if (ev.from != null && ev.bend) {
        riffSynth.frequency.cancelScheduledValues(time);
        riffSynth.frequency.setValueAtTime(f(ev.from), time);
        riffSynth.frequency.exponentialRampToValueAtTime(f(ev.midi), time + ev.bend);
      }
    },
    /** db: pad / lead level; padCutoff, leadCutoff in Hz */
    setLevels(padDb, leadDb, padCutoff, leadCutoff) {
      padGain.gain.rampTo(padDb <= -60 ? 0 : Tone.dbToGain(padDb), 0.3);
      leadGain.gain.rampTo(leadDb <= -60 ? 0 : Tone.dbToGain(leadDb), 0.15);
      padFilter.frequency.rampTo(padCutoff, 0.4);
      leadFilter.frequency.rampTo(leadCutoff, 0.2);
    },
    padChord(notes, seconds, time) {
      pad.triggerAttackRelease(notes, seconds, time, 0.7);
    },
    /** midi: note number; seconds: length; cents: detune for this note (the Instability macro) */
    leadNote(midi, seconds, time, velocity = 0.8, cents = 0, glide = 0) {
      seconds = Math.max(seconds, 1.4); // long overlapping swells: a texture
      lead.portamento = glide;
      lead.detune.setValueAtTime(cents, time);
      lead.triggerAttackRelease(Tone.Frequency(midi, "midi").toFrequency(), seconds, time, velocity);
    },
    silence() {
      pad.releaseAll();
      padGain.gain.rampTo(0, 0.2);
      leadGain.gain.rampTo(0, 0.2);
      riffGain.gain.rampTo(0, 0.2);
    },
    dispose() { for (const n of [pad, padFilter, padGain, lead, grit, wall, riffSynth, riffCrush, riffDist, riffLow, riffScoop, riffTop, riffVerb, riffVerbGain, riffLp, riffGain, leadFilter, leadGain, echo, room]) { try { n.dispose(); } catch {} } },
  };
}
