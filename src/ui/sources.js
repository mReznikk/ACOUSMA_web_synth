// SOURCES — A: PULSE (synth1) and B: FRICTION (synth2).
import { el, slider, options, section, traceGlyph, fmt } from "./controls.js";
import { RANGES } from "../state/schema.js";
import { pulseCutoff, frictionCutoff, INSTABILITY } from "../audio/mappings.js";

const WAVES = [["sine", "Sin"], ["triangle", "Tri"], ["sawtooth", "Saw"], ["square", "Sqr"]];
const row = (cls, ...kids) => el("div", { class: "row " + cls }, kids);

function voice(store, id, title, rows) {
  const s = (path, label, o = {}) => slider({ store, path: `${id}.${path}`, label, ...o });
  return el(
    "div",
    { class: "voice" },
    el("div", { class: "voice-head" }, traceGlyph(), el("h3", {}, title), options({ store, path: `${id}.mode`, items: [["sequence", "Seq"], ["drone", "Drone"]] })),
    ...rows(s),
    row(
      "four secondary",
      s("attack", "Attack", { min: RANGES.attack[0], max: RANGES.attack[1], scale: "exp", format: fmt.time }),
      s("release", "Release", { min: RANGES.release[0], max: RANGES.release[1], scale: "exp", format: fmt.time }),
      s("level", "Level"),
      s("pan", "Pan", { min: -1, max: 1, step: 0.01, format: fmt.pan })
    )
  );
}

export function sources(store) {
  const root = section("Sources", "Two monophonic voices");
  const wave = (id) => options({ store, path: `${id}.wave`, label: "Wave", items: WAVES });
  root.append(
    el(
      "div",
      { class: "voices" },
      voice(store, "synth1", "A — Pulse", (s) => [
        row("two", wave("synth1")),
        row(
          "two",
          s("pitch", "Pitch", { min: RANGES.pulsePitch[0], max: RANGES.pulsePitch[1], scale: "exp", format: fmt.hz }),
          s("tone", "Tone", { format: (v) => fmt.khz(pulseCutoff(v)) })
        ),
      ]),
      voice(store, "synth2", "B — Friction", (s) => [
        row("two", wave("synth2"), options({ store, path: "synth2.noiseType", label: "Noise", items: [["white", "White"], ["pink", "Pink"]] })),
        row(
          "two",
          s("pitch", "Pitch", { min: RANGES.frictionPitch[0], max: RANGES.frictionPitch[1], scale: "exp", format: fmt.hz }),
          s("tone", "Tone", { format: (v) => fmt.khz(frictionCutoff(v)) })
        ),
        row(
          "two",
          s("noiseMix", "Noise Mix", { format: (v) => `T${Math.round((1 - v) * 100)} · N${Math.round(v * 100)}` }),
          s("instability", "Instability", { format: (v) => `±${Math.round(v * INSTABILITY.pitchCents)} ct` })
        ),
      ])
    )
  );
  return root;
}
