// ─────────────────────────────────────────────────────────────
// Audio engine and routing.
//
//  PULSE voice ──→ ch.synth1 ─┐
//  FRICTION voice → ch.synth2 ┴→ synthBus → FX / SYNTH rack → synthBusLevel ─┐
//  THUD  ─→ ch.thud  ─┐                                                     │
//  CRACK ─→ ch.crack ─┤                                                     ├→ masterLevel → presetFade → cutGate
//  TICK  ─→ ch.tick  ─┼→ drumBus → FX / DRUM rack → drumBusLevel ───────────┘        → protection (comp + limiter) → speakers
//  CLANG ─→ ch.clang ─┘
//
// Every source has its own Tone.Channel (level, pan, mute, solo)
// BEFORE bus summing. Mute/solo act there, upstream of the effects,
// so echoes and reverb tails already in the rack decay naturally.
//
// The engine is a singleton: start() is idempotent, so pressing
// Start Audio / Play repeatedly never builds a second graph.
// ─────────────────────────────────────────────────────────────
import * as Tone from "tone";
import { PulseVoice, FrictionVoice } from "./voices.js";
import { createDrumBuffers, DrumVoice } from "./drums.js";
import { FxRack } from "./fxRack.js";
import { Clock } from "./clock.js";
import { levelToDb } from "./mappings.js";
import { DRUM_IDS, RANGES } from "../state/schema.js";

const SMOOTH = 0.04;

export class Engine {
  constructor(store) {
    this.store = store;
    this.started = false;
    this._starting = null;
    this.onStep = () => {};
  }

  /** Must be called from a user gesture (click/tap). Safe to call repeatedly. */
  start() {
    if (this.started) return Promise.resolve();
    if (this._starting) return this._starting;
    this._starting = (async () => {
      await Tone.start();
      // A slightly longer look-ahead keeps scheduling steady on busy phones.
      Tone.getContext().lookAhead = 0.08;
      this._build(this.store.state);
      await Promise.all([this.rack.synth.ready, this.rack.drum.ready]);
      this.started = true;
      this.store.subscribe((path, value, state) => this._onChange(path, value, state));
    })();
    return this._starting;
  }

  _build(s) {
    // ── Master section ──
    this.protection = new Tone.Compressor({ threshold: -10, ratio: 4, attack: 0.003, release: 0.15 });
    this.limiter = new Tone.Limiter(-1);
    this.cutGate = new Tone.Gain(1); // CUT closes this instantly
    this.presetFade = new Tone.Gain(1); // short dip when presets change
    this.masterLevel = new Tone.Gain(Tone.dbToGain(levelToDb(s.master.level)));
    this.masterLevel.chain(this.presetFade, this.cutGate, this.protection, this.limiter, Tone.getDestination());

    // ── Buses ──
    this.synthBus = new Tone.Gain(1);
    this.drumBus = new Tone.Gain(1);
    this.synthBusLevel = new Tone.Gain(Tone.dbToGain(levelToDb(s.bus.synthLevel)));
    this.drumBusLevel = new Tone.Gain(Tone.dbToGain(levelToDb(s.bus.drumLevel)));
    this.synthBusLevel.connect(this.masterLevel);
    this.drumBusLevel.connect(this.masterLevel);

    this.rack = {};
    this._buildRack("synth", s.fx.synth);
    this._buildRack("drum", s.fx.drum);

    // ── Channels: one per source ──
    this.ch = {};
    const mk = (id, src, bus) => {
      const c = new Tone.Channel({ volume: levelToDb(src.level), pan: src.pan ?? 0 });
      // Mute/solo gate: our own smoothed gain (Tone's built-in mute
      // jumps instantly, which clicks).
      c.gate = new Tone.Gain(1);
      c.connect(c.gate);
      c.gate.connect(bus);
      this.ch[id] = c;
    };
    mk("synth1", s.synth1, this.synthBus);
    mk("synth2", s.synth2, this.synthBus);
    DRUM_IDS.forEach((id) => mk(id, s.drums[id], this.drumBus));
    this._updateGates(s);

    // ── Voices ──
    this.synth1 = new PulseVoice(this.ch.synth1, s.synth1);
    this.synth2 = new FrictionVoice(this.ch.synth2, s.synth2);
    const buffers = createDrumBuffers();
    this.drums = {};
    DRUM_IDS.forEach((id) => (this.drums[id] = new DrumVoice(buffers[id], this.ch[id], s.drums[id].rate)));

    // ── Metering & display (read by the UI only) ──
    this.meters = {};
    const meter = (id, node) => {
      const m = new Tone.Meter({ smoothing: 0.7, normalRange: true });
      node.connect(m);
      this.meters[id] = m;
    };
    Object.entries(this.ch).forEach(([id, c]) => meter(id, c.gate));
    meter("synthBus", this.synthBusLevel);
    meter("drumBus", this.drumBusLevel);
    meter("master", this.limiter);
    this.scope = new Tone.Waveform(512);
    this.limiter.connect(this.scope);

    // ── Clock ──
    Tone.getTransport().bpm.value = s.tempo;
    this.clock = new Clock(this);
  }

  _buildRack(bus, fx) {
    const rack = new FxRack(fx);
    const input = bus === "synth" ? this.synthBus : this.drumBus;
    const output = bus === "synth" ? this.synthBusLevel : this.drumBusLevel;
    input.connect(rack.input);
    rack.output.connect(output);
    this.rack[bus] = rack;
    return rack;
  }

  // ── Transport ────────────────────────────────────────────────
  play() {
    this.clock.play();
  }

  stop() {
    this.clock.stop();
    this.releaseAll();
  }

  get playing() {
    return this.started && Tone.getTransport().state === "started";
  }

  /** Stop: let envelopes release; cut any drum hits scheduled ahead. */
  releaseAll() {
    this.synth1.release();
    this.synth2.release();
    Object.values(this.drums).forEach((d) => d.stopAll());
  }

  /**
   * CUT: immediate silence of sources AND effect tails.
   * 1. Close the cut gate within 5 ms.
   * 2. Stop the transport, kill voice envelopes, stop drum hits.
   * 3. Throw away both FX racks (their delay lines and reverb hold
   *    the tails) and build fresh ones from the current state.
   * 4. Re-open the gate once the new racks are ready.
   */
  async cut() {
    if (!this.started) return;
    const now = Tone.now();
    this.cutGate.gain.cancelScheduledValues(now);
    this.cutGate.gain.setValueAtTime(this.cutGate.gain.getValueAtTime(now), now);
    this.cutGate.gain.linearRampToValueAtTime(0, now + 0.005);

    this.clock.stop();
    this.synth1.kill();
    this.synth2.kill();
    Object.values(this.drums).forEach((d) => d.stopAll());

    const token = (this._cutToken = Symbol("cut"));
    await new Promise((r) => setTimeout(r, 30));
    for (const bus of ["synth", "drum"]) {
      const old = this.rack[bus];
      old.dispose();
      this._buildRack(bus, this.store.state.fx[bus]);
    }
    await Promise.all([this.rack.synth.ready, this.rack.drum.ready]);
    await new Promise((r) => setTimeout(r, 30));
    if (token !== this._cutToken) return; // a newer CUT is in charge
    const t = Tone.now();
    this.cutGate.gain.cancelScheduledValues(t);
    this.cutGate.gain.setValueAtTime(0, t);
    this.cutGate.gain.linearRampToValueAtTime(1, t + 0.02);
  }

  /** Smooth preset change: dip output, swap state, come back up. */
  async fadeForPreset(applyFn) {
    if (!this.started) return applyFn();
    const now = Tone.now();
    this.presetFade.gain.cancelScheduledValues(now);
    this.presetFade.gain.setValueAtTime(this.presetFade.gain.getValueAtTime(now), now);
    this.presetFade.gain.linearRampToValueAtTime(0, now + 0.08);
    await new Promise((r) => setTimeout(r, 100));
    applyFn();
    await Promise.all([this.rack.synth.ready, this.rack.drum.ready]);
    const t = Tone.now();
    this.presetFade.gain.cancelScheduledValues(t);
    this.presetFade.gain.setValueAtTime(0, t);
    this.presetFade.gain.linearRampToValueAtTime(1, t + 0.25);
  }

  // ── State → audio ────────────────────────────────────────────
  _onChange(path, value, state) {
    if (path === "*") return this._applyAll(state);
    const [head, ...rest] = path.split(".");
    const key = rest[rest.length - 1];

    if (head === "tempo") {
      Tone.getTransport().bpm.value = Math.min(RANGES.tempo[1], Math.max(RANGES.tempo[0], value));
      this.rack.synth.retime();
      this.rack.drum.retime();
      return;
    }
    if (head === "master") return this.masterLevel.gain.rampTo(Tone.dbToGain(levelToDb(value)), SMOOTH);
    if (head === "bus") {
      const node = key === "synthLevel" ? this.synthBusLevel : this.drumBusLevel;
      return node.gain.rampTo(Tone.dbToGain(levelToDb(value)), SMOOTH);
    }
    if (head === "synth1" || head === "synth2") {
      if (rest[0] === "pattern") return; // read by the clock at step time
      return this._applyVoiceParam(head, key, value);
    }
    if (head === "drums") {
      const id = rest[0];
      if (rest[1] === "steps") return;
      return this._applyChannelParam(id, key, value, () => {
        if (key === "rate") this.drums[id].setRate(value);
      });
    }
    if (head === "fx") {
      const [bus, effect] = rest;
      const fx = state.fx[bus][effect];
      if (effect === "reverb" && key === "decay") {
        // Regenerating the impulse response is costly — debounce it.
        clearTimeout(this._reverbTimer?.[bus]);
        this._reverbTimer = this._reverbTimer || {};
        this._reverbTimer[bus] = setTimeout(() => this.rack[bus].set("reverb", state.fx[bus].reverb), 150);
        return;
      }
      return this.rack[bus].set(effect, fx);
    }
  }

  _applyChannelParam(id, key, value, otherwise) {
    const c = this.ch[id];
    if (key === "level") c.volume.rampTo(levelToDb(value), SMOOTH);
    else if (key === "pan") c.pan.rampTo(value, SMOOTH);
    else if (key === "mute" || key === "solo") this._updateGates(this.store.state);
    else otherwise?.();
  }

  /**
   * Mute/solo logic, applied as a short exponential glide (τ = 5 ms) per channel:
   * a channel is audible when it is not muted AND (nothing is soloed
   * OR it is soloed itself).
   */
  _updateGates(s) {
    const src = { synth1: s.synth1, synth2: s.synth2, ...s.drums };
    const anySolo = Object.values(src).some((x) => x.solo);
    for (const [id, x] of Object.entries(src)) {
      const open = !x.mute && (!anySolo || x.solo);
      const g = this.ch[id].gate.gain;
      const t = Tone.immediate();
      g.cancelAndHoldAtTime(t);
      g.setTargetAtTime(open ? 1 : 0, t, 0.005); // ~15 ms to settle, no click

    }
  }

  _applyVoiceParam(id, key, value) {
    const v = this[id];
    this._applyChannelParam(id, key, value, () => {
      switch (key) {
        case "wave": return v.setWave(value);
        case "pitch": return v.setPitch(value);
        case "attack": return v.setAttack(value);
        case "release": return v.setRelease(value);
        case "tone": return v.setTone(value);
        case "noiseType": return v.setNoiseType(value);
        case "noiseMix": return v.setNoiseMix(value);
        case "instability": return v.setInstability(value);
        case "mode": return; // the clock opens/closes drones on the next step
      }
    });
  }

  _applyAll(s) {
    Tone.getTransport().bpm.value = s.tempo;
    this.masterLevel.gain.rampTo(Tone.dbToGain(levelToDb(s.master.level)), SMOOTH);
    this.synthBusLevel.gain.rampTo(Tone.dbToGain(levelToDb(s.bus.synthLevel)), SMOOTH);
    this.drumBusLevel.gain.rampTo(Tone.dbToGain(levelToDb(s.bus.drumLevel)), SMOOTH);
    for (const id of ["synth1", "synth2"]) {
      for (const [k, val] of Object.entries(s[id])) if (k !== "pattern") this._applyVoiceParam(id, k, val);
    }
    for (const id of DRUM_IDS) {
      for (const k of ["level", "mute", "solo", "rate"]) {
        this._applyChannelParam(id, k, s.drums[id][k], () => k === "rate" && this.drums[id].setRate(s.drums[id].rate));
      }
    }
    this.rack.synth.applyAll(s.fx.synth);
    this.rack.drum.applyAll(s.fx.drum);
    this.rack.synth.retime();
    this.rack.drum.retime();
    // Drones re-open on the next step with the new pitch if still in drone mode
    if (this.synth1.droneOpen) this.synth1.release();
    if (this.synth2.droneOpen) this.synth2.release();
  }
}
