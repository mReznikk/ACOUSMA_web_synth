// ─────────────────────────────────────────────────────────────
// A tiny observable store for instrument state.
//
// Paths are dot strings: "synth2.noiseMix", "fx.drum.delay.mix",
// "synth1.pattern.4.offset", "drums.thud.steps.0".
// Listeners receive (path, value). replace() swaps the whole state
// (presets) and notifies with path "*".
// ─────────────────────────────────────────────────────────────

export function createStore(initial) {
  let state = structuredClone(initial);
  const listeners = new Set();

  const resolve = (path) => {
    const keys = path.split(".");
    const last = keys.pop();
    let obj = state;
    for (const k of keys) obj = obj[k];
    return [obj, last];
  };

  return {
    get state() {
      return state;
    },
    get(path) {
      const [obj, key] = resolve(path);
      return obj[key];
    },
    set(path, value) {
      const [obj, key] = resolve(path);
      if (obj[key] === value) return;
      obj[key] = value;
      listeners.forEach((fn) => fn(path, value, state));
    },
    /** Replace a sub-tree (e.g. a whole pattern) and notify once. */
    setTree(path, value) {
      const [obj, key] = resolve(path);
      obj[key] = structuredClone(value);
      listeners.forEach((fn) => fn(path, obj[key], state));
    },
    replace(next) {
      state = structuredClone(next);
      listeners.forEach((fn) => fn("*", state, state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
