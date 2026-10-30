// ─────────────────────────────────────────────────────────────
// Effects rack. One instance per bus (FX / SYNTH and FX / DRUM),
// each with its own nodes and settings.
//
// Fixed chain:  input → DISTORTION → BITCRUSHER → DELAY → REVERB → output
//
// Every effect sits in an FxSlot:
//
//          ┌──────────── dryGain ─────────────┐
//   in ────┤                                  ├──→ out
//          └─→ effect (100 % wet) ── wetGain ─┘
//
// Two mix laws (see mixGains):
//  • "equalPower" (distortion, bitcrusher — the wet signal is a
//    reshaped copy of the dry, so the two must trade off):
//      dry = cos(mix·π/2), wet = sin(mix·π/2)
//  • "dryHold" (delay, reverb — the wet signal is echoes/space that
//    come AFTER the dry sound): dry stays at 1 up to Mix 50 %, then
//    falls; wet rises as sin(mix·π/2). At 50 % you hear the full dry
//    sound plus the tail, instead of a 3 dB dip.
// Bypass ramps to dry = 1, wet = 0. The dry path is always present
// and never added twice, so engaging bypass causes no level jump.
// ─────────────────────────────────────────────────────────────
import * as Tone from "tone";
import { drivePreGain, driveMakeup } from "./mappings.js";
import { RANGES } from "../state/schema.js";

const SMOOTH = 0.04;
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

export function mixGains(mix, law) {
  const wet = Math.sin((mix * Math.PI) / 2);
  const dry = law === "dryHold" ? (mix <= 0.5 ? 1 : Math.cos((mix - 0.5) * Math.PI)) : Math.cos((mix * Math.PI) / 2);
  return [dry, wet];
}

class FxSlot {
  constructor(effectIn, effectOut, law = "equalPower") {
    this.law = law;
    this.input = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1);
    this.wetGain = new Tone.Gain(0);
    this.output = new Tone.Gain(1);
    this.input.connect(this.dryGain);
    this.input.connect(effectIn);
    effectOut.connect(this.wetGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.mix = 0;
    this.bypass = true;
  }
  update(mix, bypass) {
    this.mix = mix;
    this.bypass = bypass;
    const [dry, wet] = bypass ? [1, 0] : mixGains(mix, this.law);
    this.dryGain.gain.rampTo(dry, SMOOTH);
    this.wetGain.gain.rampTo(wet, SMOOTH);
  }
  dispose() {
    [this.input, this.dryGain, this.wetGain, this.output].forEach((n) => n.dispose());
  }
}

export class FxRack {
  /**
   * @param {object} fx  state for this rack: { dist, crush, delay, reverb }
   */
  constructor(fx) {
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // DISTORTION: pre-gain → tanh waveshaper (2× oversampled) → make-up gain
    this.distPre = new Tone.Gain(drivePreGain(fx.dist.drive));
    this.distShaper = new Tone.WaveShaper((x) => Math.tanh(x), 4096);
    this.distShaper.oversample = "2x";
    this.distPost = new Tone.Gain(driveMakeup(fx.dist.drive));
    this.distPre.chain(this.distShaper, this.distPost);
    this.dist = new FxSlot(this.distPre, this.distPost);

    // BITCRUSHER: real bit-depth quantisation (Tone's AudioWorklet):
    //   step = 2^-(bits-1);  y = step · round(x / step)
    // No sample-rate reduction is applied.
    this.crusher = new Tone.BitCrusher({ bits: fx.crush.bits, wet: 1 });
    this.crush = new FxSlot(this.crusher, this.crusher);

    // DELAY: tempo-synced feedback delay. Feedback is clamped to 0.85.
    this.delayNode = new Tone.FeedbackDelay({
      delayTime: Tone.Time(fx.delay.division).toSeconds(),
      feedback: clamp(fx.delay.delayFeedback, RANGES.delayFeedback),
      maxDelay: 3,
      wet: 1,
    });
    this.delay = new FxSlot(this.delayNode, this.delayNode, "dryHold");

    // REVERB: convolution with a generated noise-decay impulse response
    this.reverbNode = new Tone.Reverb({ decay: fx.reverb.decay, preDelay: 0.01, wet: 1 });
    this.reverb = new FxSlot(this.reverbNode, this.reverbNode, "dryHold");

    this.input.chain(this.dist.input);
    this.dist.output.connect(this.crush.input);
    this.crush.output.connect(this.delay.input);
    this.delay.output.connect(this.reverb.input);
    this.reverb.output.connect(this.output);

    this.division = fx.delay.division;
    this.applyAll(fx);
  }

  /** Resolves once async parts (reverb IR, worklet) are ready. */
  get ready() {
    return this.reverbNode.ready;
  }

  applyAll(fx) {
    this.set("dist", fx.dist);
    this.set("crush", fx.crush);
    this.set("delay", fx.delay);
    this.set("reverb", fx.reverb);
  }

  /** Apply one effect's settings (any subset of its keys). */
  set(effect, p) {
    switch (effect) {
      case "dist":
        this.distPre.gain.rampTo(drivePreGain(p.drive), SMOOTH);
        this.distPost.gain.rampTo(driveMakeup(p.drive), SMOOTH);
        this.dist.update(p.mix, p.bypass);
        break;
      case "crush":
        this.crusher.bits.value = clamp(Math.round(p.bits), RANGES.bits);
        this.crush.update(p.mix, p.bypass);
        break;
      case "delay":
        this.division = p.division;
        this.delayNode.delayTime.rampTo(Tone.Time(p.division).toSeconds(), 0.08);
        this.delayNode.feedback.rampTo(clamp(p.delayFeedback, RANGES.delayFeedback), SMOOTH);
        this.delay.update(p.mix, p.bypass);
        break;
      case "reverb":
        if (Math.abs(this.reverbNode.decay - p.decay) > 0.01) this.reverbNode.decay = p.decay;
        this.reverb.update(p.mix, p.bypass);
        break;
    }
  }

  /** Re-sync the delay time after a tempo change. */
  retime() {
    this.delayNode.delayTime.rampTo(Tone.Time(this.division).toSeconds(), 0.08);
  }

  dispose() {
    [
      this.input, this.output, this.distPre, this.distShaper, this.distPost, this.crusher,
      this.delayNode, this.reverbNode,
    ].forEach((n) => n.dispose());
    [this.dist, this.crush, this.delay, this.reverb].forEach((s) => s.dispose());
  }
}
