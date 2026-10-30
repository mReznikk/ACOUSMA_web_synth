// ACOUSMA — bootstrap.
// store → engine, and the score's conductor drives both. The interface never touches audio
// nodes; the engine only sends back display data (meters, scope, playhead).
import { createStore } from "./state/store.js";
import { loadPreset } from "./state/presets.js";
import { Engine } from "./audio/engine.js";
import { createConductor } from "./score/conductor.js";
import * as Score from "./score/score.js";
import { performView } from "./ui/perform.js";

const store = createStore(loadPreset("INIT"));
const engine = new Engine(store);
Score.config.drums = new URLSearchParams(location.search).get("drums") !== "0";
const conductor = createConductor({ store, engine });

document.body.classList.add("is-perform");
document.getElementById("app").replaceChildren(performView({ conductor, engine, store }).el);

window.__ULTRA__ = { store, engine, conductor }; // handle for automated checks
