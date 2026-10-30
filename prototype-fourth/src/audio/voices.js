// ─────────────────────────────────────────────────────────────
// Voice creation: SYNTH 01 / PULSE and SYNTH 02 / FRICTION.
//
// Both are monophonic. Their oscillators (and FRICTION's noise)
// run continuously once audio starts; an amplitude envelope opens
// and closes them. That keeps triggering sample-accurate and avoids
// creating/destroying nodes on every step.
//
//   PULSE:    osc → waveTrim → envelope → tone(LPF) → voiceGain → [channel]
//   FRICTION: osc → toneGain ─┐
//             noise → noiseGain┴→ envelope → instabilityAmp → tone(LPF) → voiceGain → [channel]
// ─────────────────────────────────────────────────────────────
import * as Tone from "tone";
import {
  pulseCutoff,
  frictionCutoff,
  WAVE_TRIM,
  NOISE_TRIM,
  noiseMixGains,
  INSTABILITY,
} from "./mappings.js";

const SMOOTH = 0.03; // seconds — ramp time for continuous parameter changes
const ACCENT_VELOCITY = 1;
const NORMAL_VELOCITY = 0.6;

/** Shared monophonic voice behaviour (sequence triggering + drone). */
class MonoVoice {
  constructor() {
    this.droneOpen = false;
    this.basePitch = 100;
  }

  /** Called by the clock for every sequence step that is switched on. */
  trigger(time, stepData, stepSeconds) {
    const freq = this.basePitch * Math.pow(2, stepData.offset / 12);
    this.osc.frequency.setValueAtTime(freq, time);
    const duration = Math.max(0.01, stepData.gate * stepSeconds);
    this.env.triggerAttackRelease(duration, time, stepData.accent ? ACCENT_VELOCITY : NORMAL_VELOCITY);
  }

  openDrone(time) {
    this.osc.frequency.setValueAtTime(this.basePitch, time);
    this.env.triggerAttack(time, 0.8);
    this.droneOpen = true;
  }

  closeDrone(time) {
    this.env.triggerRelease(time);
    this.droneOpen = false;
  }

  /** Stop: cancel anything scheduled ahead and let the release run. */
  release() {
    const now = Tone.now();
    this.env.cancel(now);
    this.env.triggerRelease(now);
    this.droneOpen = false;
  }

  /** CUT: cancel everything and close the envelope within ~5 ms. */
  kill() {
    const now = Tone.now();
    const keep = this.env.release;
    this.env.cancel(now);
    this.env.release = 0.005;
    this.env.triggerRelease(now);
    this.env.release = keep;
    this.droneOpen = false;
  }

  setPitch(hz) {
    this.basePitch = hz;
    // In drone mode follow the slider smoothly; sequenced steps set
    // their own pitch at trigger time.
    if (this.droneOpen) this.osc.frequency.rampTo(hz, SMOOTH);
  }

  setAttack(s) {
    this.env.attack = s;
  }

  setRelease(s) {
    this.env.release = s;
  }
}

// ── SYNTH 01 / PULSE ─────────────────────────────────────────
export class PulseVoice extends MonoVoice {
  constructor(output, s) {
    super();
    this.osc = new Tone.Oscillator({ type: s.wave, frequency: s.pitch });
    this.waveTrim = new Tone.Gain(WAVE_TRIM[s.wave]);
    this.env = new Tone.AmplitudeEnvelope({
      attack: s.attack,
      decay: 0.01,
      sustain: 1,
      release: s.release,
    });
    // The one "simple Tone control": a gentle 12 dB/oct low-pass.
    this.tone = new Tone.Filter({ type: "lowpass", rolloff: -12, Q: 0.6, frequency: pulseCutoff(s.tone) });
    this.voiceGain = new Tone.Gain(0.55); // headroom before the channel
    this.osc.chain(this.waveTrim, this.env, this.tone, this.voiceGain, output);
    this.basePitch = s.pitch;
    this.osc.start();
  }

  setWave(wave) {
    this.osc.type = wave;
    this.waveTrim.gain.rampTo(WAVE_TRIM[wave], SMOOTH);
  }

  setTone(x) {
    this.tone.frequency.rampTo(pulseCutoff(x), SMOOTH);
  }

  dispose() {
    [this.osc, this.waveTrim, this.env, this.tone, this.voiceGain].forEach((n) => n.dispose());
  }
}

// ── SYNTH 02 / FRICTION ──────────────────────────────────────
export class FrictionVoice extends MonoVoice {
  constructor(output, s) {
    super();
    // Tonal component
    this.osc = new Tone.Oscillator({ type: s.wave, frequency: s.pitch });
    this.waveTrim = new Tone.Gain(WAVE_TRIM[s.wave]);
    this.toneGain = new Tone.Gain(0);
    // Noise component — a separate source, not an oscillator waveform
    this.noise = new Tone.Noise({ type: s.noiseType });
    this.noiseGain = new Tone.Gain(0);
    // Shared envelope gates BOTH components
    this.sum = new Tone.Gain(1);
    this.env = new Tone.AmplitudeEnvelope({
      attack: s.attack,
      decay: 0.01,
      sustain: 1,
      release: s.release,
    });
    this.instabilityAmp = new Tone.Gain(1);
    this.tone = new Tone.Filter({ type: "lowpass", rolloff: -12, Q: 0.6, frequency: frictionCutoff(s.tone) });
    this.voiceGain = new Tone.Gain(0.9);

    this.osc.chain(this.waveTrim, this.toneGain, this.sum);
    this.noise.chain(this.noiseGain, this.sum);
    this.sum.chain(this.env, this.instabilityAmp, this.tone, this.voiceGain, output);

    this._buildInstability();

    this.noiseType = s.noiseType;
    this.noiseMix = s.noiseMix;
    this.basePitch = s.pitch;
    this.setNoiseMix(s.noiseMix);
    this.setInstability(s.instability);

    this.osc.start();
    this.noise.start();
  }

  /**
   * Instability source: a bounded, smoothed, irregular control signal.
   * Two slow LFOs at non-related rates + very slow filtered noise,
   * summed with weights 0.4 / 0.35 / 0.25 so the total stays in −1…+1.
   */
  _buildInstability() {
    this.lfoA = new Tone.LFO({ frequency: 0.23, min: -1, max: 1, type: "sine" });
    this.lfoB = new Tone.LFO({ frequency: 0.71, min: -1, max: 1, type: "triangle" });
    this.jitterNoise = new Tone.Noise("white");
    this.jitterSmooth = new Tone.Filter({ type: "lowpass", frequency: 2.5, rolloff: -24 });
    this.jitterBoost = new Tone.Gain(60);
    // Soft-limit to exactly ±1 (inputs beyond ±1 clamp to the curve ends)
    this.jitterLimit = new Tone.WaveShaper((x) => Math.tanh(3 * x) / Math.tanh(3), 1024);

    this.modSum = new Tone.Gain(1);
    this.wA = new Tone.Gain(0.4);
    this.wB = new Tone.Gain(0.35);
    this.wJ = new Tone.Gain(0.25);

    this.lfoA.chain(this.wA, this.modSum);
    this.lfoB.chain(this.wB, this.modSum);
    this.jitterNoise.chain(this.jitterSmooth, this.jitterBoost, this.jitterLimit, this.wJ, this.modSum);

    // Depth stages (set from the Instability control)
    this.pitchDepth = new Tone.Gain(0);
    this.ampDepth = new Tone.Gain(0);
    this.modSum.connect(this.pitchDepth);
    this.modSum.connect(this.ampDepth);
    this.pitchDepth.connect(this.osc.detune); // cents
    this.ampDepth.connect(this.instabilityAmp.gain); // adds to the base gain

    this.lfoA.start();
    this.lfoB.start();
    this.jitterNoise.start();
  }

  setInstability(i) {
    this.pitchDepth.gain.rampTo(i * INSTABILITY.pitchCents, SMOOTH);
    this.ampDepth.gain.rampTo(i * INSTABILITY.ampDepth, SMOOTH);
    this.instabilityAmp.gain.rampTo(1 - i * INSTABILITY.ampDepth, SMOOTH);
  }

  setNoiseMix(mix) {
    this.noiseMix = mix;
    const [t, n] = noiseMixGains(mix);
    this.toneGain.gain.rampTo(t, SMOOTH);
    this.noiseGain.gain.rampTo(n * NOISE_TRIM[this.noiseType], SMOOTH);
  }

  setNoiseType(type) {
    this.noiseType = type;
    this.noise.type = type;
    this.setNoiseMix(this.noiseMix);
  }

  setWave(wave) {
    this.osc.type = wave;
    this.waveTrim.gain.rampTo(WAVE_TRIM[wave], SMOOTH);
  }

  setTone(x) {
    this.tone.frequency.rampTo(frictionCutoff(x), SMOOTH);
  }

  dispose() {
    [
      this.osc, this.waveTrim, this.toneGain, this.noise, this.noiseGain, this.sum, this.env,
      this.instabilityAmp, this.tone, this.voiceGain, this.lfoA, this.lfoB, this.jitterNoise,
      this.jitterSmooth, this.jitterBoost, this.jitterLimit, this.modSum, this.wA, this.wB,
      this.wJ, this.pitchDepth, this.ampDepth,
    ].forEach((n) => n.dispose());
  }
}
