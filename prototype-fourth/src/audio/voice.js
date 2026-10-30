// ─────────────────────────────────────────────────────────────
// VOICE — the psychiatrist's questions.
//   Lines 1, 2 and 8 arrive ALREADY REVERSED (recorded that way); they are not reversed again here.
//   They are filtered to sit inside the music rather than on top of it: a high-pass to take
//   away the body, a steep low-pass ("from another room"), a long reverb, slightly slowed down,
//   and they are sent through the bed's throb so they pump with the pad.
//   Line 11 (the last phrase, forward) plays after the cut: lowered and slowed, a little grit,
//   a dark close room, and — just before it — a quiet reversed copy of itself that swells in
//   and lands exactly where the line begins (a reverse-echo), so it seems to rise out of the silence.
// Files: assets/voice/NN.mp3 (or base64 in window.__VOICE_DATA when the page is a single file).
// ─────────────────────────────────────────────────────────────
import * as Tone from "tone";

const FILES = { 1: "assets/voice/01.mp3", 2: "assets/voice/02.mp3", 8: "assets/voice/08.mp3", 11: "assets/voice/11.mp3" };

async function loadBytes(id) {
  const inline = window.__VOICE_DATA?.[id];
  if (inline) {
    const bin = atob(inline);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  const res = await fetch(FILES[id]);
  if (!res.ok) throw new Error("voice file missing: " + FILES[id]);
  return res.arrayBuffer();
}

/** First and last moment where the line is louder than −45 dB under its peak (seconds). */
function speechSpan(buf) {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i += 8) peak = Math.max(peak, Math.abs(d[i]));
  const thr = peak * 0.0056;
  let a = 0, b = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < thr) a++;
  while (b > a && Math.abs(d[b]) < thr) b--;
  return [Math.max(0, a / buf.sampleRate - 0.05), Math.min(buf.duration, b / buf.sampleRate + 0.15)];
}

export async function createVoice(engine, bed) {
  // the shared "other room": hp → lp → reverb → level → bed throb
  // (Not through the throb: that chopped the words. They go to the bus, which still obeys the cut.)
  const hp = new Tone.Filter({ type: "highpass", frequency: 180, Q: 0.5, rolloff: -24 });
  const lp = new Tone.Filter({ type: "lowpass", frequency: 2400, Q: 0.5, rolloff: -24 });
  const verb = new Tone.Reverb({ decay: 4, preDelay: 0.03, wet: 0.4 });
  const level = new Tone.Gain(0);
  hp.chain(lp, verb, level, bed.bus);

  // the last phrase and its halo go straight to the protection stage: they play AFTER the cut gate closes
  const grit = new Tone.Distortion({ distortion: 0.18, wet: 0.35 });
  const body = new Tone.Filter({ type: "lowshelf", frequency: 220, gain: 4 });
  const dry = new Tone.Gain(0);
  grit.chain(body, dry, engine.protection);
  const darkRoom = new Tone.Reverb({ decay: 6.5, preDelay: 0.02, wet: 1 });
  const roomGain = new Tone.Gain(0.35);
  grit.chain(darkRoom, roomGain, engine.protection);
  const haloHp = new Tone.Filter({ type: "highpass", frequency: 200, Q: 0.5 });
  const haloLp = new Tone.Filter({ type: "lowpass", frequency: 1500, Q: 0.5, rolloff: -24 });
  const haloVerb = new Tone.Reverb({ decay: 7, preDelay: 0.02, wet: 0.7 });
  const haloGain = new Tone.Gain(0);
  haloHp.chain(haloLp, haloVerb, haloGain, engine.protection);

  const ctx = Tone.getContext().rawContext;
  const lines = {};
  for (const id of Object.keys(FILES)) {
    try {
      const ab = await loadBytes(id);
      const audio = await ctx.decodeAudioData(ab);
      const player = new Tone.Player({ url: new Tone.ToneAudioBuffer(audio) });
      const [from, to] = speechSpan(audio);
      lines[id] = { player, from, to, dur: to - from };
      // every line blooms out of the music and dissolves back into it (no hard edges)
      if (Number(id) === 11) { player.fadeIn = 0.25; player.fadeOut = 0.9; }
      else { player.fadeIn = 1.1; player.fadeOut = 1.8; }
      if (Number(id) === 11) {
        player.connect(grit);
        // a reversed copy for the halo
        const rev = ctx.createBuffer(audio.numberOfChannels, audio.length, audio.sampleRate);
        for (let c = 0; c < audio.numberOfChannels; c++) { const src = audio.getChannelData(c), dst = rev.getChannelData(c); for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i]; }
        const halo = new Tone.Player({ url: new Tone.ToneAudioBuffer(rev) });
        halo.connect(haloHp);
        lines[id].halo = halo;
        lines[id].haloFrom = audio.duration - to; // the same span, counted from the other end
      } else player.connect(hp);
    } catch (e) {
      console.warn("voice line", id, "not loaded:", e.message);
    }
  }
  await Promise.all([verb.ready, darkRoom.ready, haloVerb.ready]);

  return {
    /** cue: { id, dB, room (Hz), rate }; time: audio time. */
    play(cue, time, tune) {
      const l = lines[cue.id];
      if (!l) return;
      if (cue.id === 11) { // the last phrase: slowed and lowered, with its reversed halo arriving just before it
        const rate = 0.92;
        const len = l.dur / rate;
        dry.gain.cancelScheduledValues(time);
        dry.gain.setValueAtTime(Tone.dbToGain(tune.voiceEnd), time);
        roomGain.gain.setValueAtTime(0.35, time);
        l.player.playbackRate = rate;
        l.player.start(time, l.from, l.dur);
        const haloAt = Math.max(Tone.now() + 0.05, time - len); // ends exactly where the line begins
        haloGain.gain.cancelScheduledValues(haloAt);
        haloGain.gain.setValueAtTime(Tone.dbToGain(tune.voiceEnd - 9), haloAt);
        l.halo.playbackRate = rate;
        l.halo.start(haloAt, l.haloFrom, l.dur);
        return;
      }
      level.gain.setValueAtTime(Tone.dbToGain(tune.voice + (cue.dB || 0)), time);
      lp.frequency.setValueAtTime(Math.max(300, tune.voiceRoom * (cue.room || 1)), time);
      l.player.playbackRate = cue.rate || 0.95;
      l.player.start(time, l.from, l.dur);
    },
    stop() { for (const l of Object.values(lines)) { try { l.player.stop(); l.halo?.stop(); } catch {} } },
    dispose() { for (const l of Object.values(lines)) l.player.dispose(); for (const n of [hp, lp, verb, level, dry, grit, body, darkRoom, roomGain, haloHp, haloLp, haloVerb, haloGain]) { try { n.dispose(); } catch {} } },
  };
}
