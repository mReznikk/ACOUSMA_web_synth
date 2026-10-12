# Automated audio checks for ULTRA (headless Chromium via Playwright).
# Usage:  npm run build && npm run preview   (in one terminal)
#         pip install playwright && python -m playwright install chromium
#         python tests/verify.py http://localhost:4173/
import asyncio, json, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
OUT = "./test-output/"
import os; os.makedirs(OUT, exist_ok=True)

HELPERS = r"""
window.T = {
  sample(ids, ms) {
    const { engine } = window.__ULTRA__;
    const max = Object.fromEntries(ids.map(i => [i, 0]));
    return new Promise(res => {
      const iv = setInterval(() => {
        for (const id of ids) {
          let v = engine.meters[id].getValue(); if (Array.isArray(v)) v = Math.max(...v);
          max[id] = Math.max(max[id], v);
        }
      }, 10);
      setTimeout(() => { clearInterval(iv); res(max); }, ms);
    }).then(r => r);
  },
  async sampleFresh(ids, ms) {
    // flush peak-hold memory of the meters first
    const { engine } = window.__ULTRA__;
    for (let i = 0; i < 40; i++) { ids.forEach(id => engine.meters[id].getValue()); await T.wait(10); }
    return T._sample(ids, ms);
  },
  _sample(ids, ms) {
    const { engine } = window.__ULTRA__;
    const max = Object.fromEntries(ids.map(i => [i, 0]));
    return new Promise(res => {
      const iv = setInterval(() => {
        for (const id of ids) {
          let v = engine.meters[id].getValue(); if (Array.isArray(v)) v = Math.max(...v);
          max[id] = Math.max(max[id], v);
        }
      }, 10);
      setTimeout(() => { clearInterval(iv); res(max); }, ms);
    });
  },
  wait: ms => new Promise(r => setTimeout(r, ms)),
};
"""

results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("  — " + str(detail) if detail else ""))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        page = await b.new_page(viewport={"width": 1366, "height": 900})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(URL)
        await page.wait_for_selector(".topbar")
        await page.screenshot(path=OUT + "desktop_before.png", full_page=True)
        await page.evaluate(HELPERS)

        # Start audio twice — must not build twice
        await page.click(".btn.start")
        await page.wait_for_function("window.__ULTRA__.engine.started")
        await page.evaluate("window.__ULTRA__.engine.start()")
        ev0 = await page.evaluate("Object.keys(window.__ULTRA__.engine.clock.transport._scheduledEvents).length")
        check("Start Audio is idempotent", await page.evaluate("window.__ULTRA__.engine.started === true"))

        await page.click(".btn.play")
        await page.wait_for_timeout(400)
        src = ["synth1", "synth2", "thud", "crack", "tick", "clang"]
        m = await page.evaluate(f"T.sampleFresh({json.dumps(src)}, 2500)")
        check("INIT: PULSE, FRICTION, THUD, CRACK, TICK audible", all(m[i] > 0.005 for i in src[:5]), m)
        check("INIT: CLANG silent (no steps)", m["clang"] < 0.001, m["clang"])

        # Synth independence via mute
        await page.evaluate("window.__ULTRA__.store.set('synth1.mute', true)")
        await page.wait_for_timeout(200)
        m = await page.evaluate("T.sampleFresh(['synth1','synth2'], 1800)")
        check("Mute PULSE → FRICTION still sounds", m["synth1"] < 0.002 and m["synth2"] > 0.01, m)
        await page.evaluate("window.__ULTRA__.store.set('synth1.mute', false); window.__ULTRA__.store.set('synth2.mute', true)")
        await page.wait_for_timeout(200)
        m = await page.evaluate("T.sampleFresh(['synth1','synth2'], 1800)")
        check("Mute FRICTION → PULSE still sounds", m["synth2"] < 0.002 and m["synth1"] > 0.01, m)
        await page.evaluate("window.__ULTRA__.store.set('synth2.mute', false)")

        # Parameter independence: changing PULSE wave doesn't touch FRICTION
        r = await page.evaluate("""(() => { const {store, engine} = window.__ULTRA__;
           store.set('synth1.wave','sine'); store.set('synth1.pitch', 200);
           return [engine.synth1.osc.type, engine.synth2.osc.type, engine.synth2.basePitch]; })()""")
        check("PULSE edits leave FRICTION untouched", r[0] == "sine" and r[1] == "sawtooth" and abs(r[2] - 740) < 1e-6, r)
        await page.evaluate("(() => { const {store} = window.__ULTRA__; store.set('synth1.wave','square'); store.set('synth1.pitch', 52); })()")

        # Every drum on its own channel: fill clang, solo each drum in turn
        await page.evaluate("(() => { const {store} = window.__ULTRA__; store.setTree('drums.clang.steps', Array(16).fill(false).map((_, i) => i % 4 === 2)); })()")
        drums = ["thud", "crack", "tick", "clang"]
        for d in drums:
            await page.evaluate(f"window.__ULTRA__.store.set('drums.{d}.solo', true)")
            await page.wait_for_timeout(500)
            m = await page.evaluate(f"T.sampleFresh({json.dumps(drums + ['synth1'])}, 2300)")
            others = [o for o in drums + ["synth1"] if o != d]
            check(f"Solo {d.upper()} → only its channel sounds", m[d] > 0.01 and all(m[o] < 0.002 for o in others), {k: round(v, 4) for k, v in m.items()})
            await page.evaluate(f"window.__ULTRA__.store.set('drums.{d}.solo', false)")
        ids = await page.evaluate("Object.keys(window.__ULTRA__.engine.ch)")
        check("Six independent source channels", ids == ["synth1", "synth2", "thud", "crack", "tick", "clang"], ids)

        # Bus FX independence
        r = await page.evaluate("""(() => { const {store, engine} = window.__ULTRA__;
           store.set('fx.synth.delay.bypass', false); store.set('fx.synth.delay.delayFeedback', 0.8);
           store.set('fx.synth.delay.division', '4n'); store.set('fx.synth.crush.bits', 3);
           return new Promise(res => setTimeout(() => res({
             sameNode: engine.rack.synth === engine.rack.drum,
             synthFb: engine.rack.synth.delayNode.feedback.value, drumFb: engine.rack.drum.delayNode.feedback.value,
             synthBits: engine.rack.synth.crusher.bits.value, drumBits: engine.rack.drum.crusher.bits.value,
             drumDelayWet: engine.rack.drum.delay.wetGain.gain.value,
             drumState: store.state.fx.drum.delay }), 300)); })()""")
        check("FX racks are separate instances with separate settings",
              (not r["sameNode"]) and abs(r["synthFb"] - 0.8) < 0.01 and abs(r["drumFb"] - 0.25) < 0.01 and r["synthBits"] == 3 and r["drumBits"] == 10, r)
        await page.click("text=Drum bus")
        await page.click("text=Synth bus")
        r2 = await page.evaluate("window.__ULTRA__.store.state.fx.synth.delay.delayFeedback")
        check("Switching rack view preserves settings", abs(r2 - 0.8) < 1e-9, r2)

        # Feedback clamp
        r = await page.evaluate("""(() => { const {store, engine} = window.__ULTRA__; store.set('fx.synth.delay.delayFeedback', 5);
           return new Promise(res => setTimeout(() => res(engine.rack.synth.delayNode.feedback.value), 200)); })()""")
        check("Delay feedback is clamped ≤ 0.85", r <= 0.8501, r)
        await page.evaluate("window.__ULTRA__.store.set('fx.synth.delay.delayFeedback', 0.8)")

        # Tempo sync: log trigger times from every source, change tempo mid-play
        await page.evaluate("""(() => { const {engine} = window.__ULTRA__; window.LOG = [];
          const wrap = (obj, name, tag) => { const f = obj[name].bind(obj); obj[name] = (t, ...a) => { LOG.push([tag, t]); return f(t, ...a); }; };
          wrap(engine.synth1, 'trigger', 'synth1'); wrap(engine.synth2, 'trigger', 'synth2');
          for (const d of ['thud','crack','tick','clang']) wrap(engine.drums[d], 'trigger', d);
          // put every source on every 4th step so they should coincide
          const s = window.__ULTRA__.store;
          for (const v of ['synth1','synth2']) s.setTree(v + '.pattern', Array.from({length:16}, (_, i) => ({on: i % 4 === 0, offset: 0, gate: 0.3, accent: false})));
          for (const d of ['thud','crack','tick','clang']) s.setTree('drums.' + d + '.steps', Array.from({length:16}, (_, i) => i % 4 === 0));
        })()""")
        await page.wait_for_timeout(1500)
        await page.evaluate("window.__ULTRA__.store.set('tempo', 173)")
        await page.wait_for_timeout(1500)
        await page.evaluate("window.__ULTRA__.store.set('tempo', 61)")
        await page.wait_for_timeout(2000)
        r = await page.evaluate("""(() => { const by = {}; for (const [tag, t] of LOG) (by[t.toFixed(6)] ||= new Set()).add(tag);
           const groups = Object.values(by).map(s => s.size); return { events: LOG.length, groups: groups.length, sizes: [...new Set(groups)] }; })()""")
        check("Tempo changes: all six sources fire at identical audio times", r["sizes"] == [6] and r["groups"] >= 6, r)

        # Repeated Play / Stop must not duplicate events
        await page.evaluate("""(async () => { const {engine} = window.__ULTRA__;
          for (let i = 0; i < 8; i++) { engine.play(); engine.play(); engine.stop(); engine.play(); } })()""")
        await page.evaluate("LOG = []")
        await page.wait_for_timeout(2500)
        r = await page.evaluate("""(() => { const {engine} = window.__ULTRA__; const tr = engine.clock.transport;
           const per = {}; for (const [tag, t] of LOG) { const k = tag + '@' + t.toFixed(6); per[k] = (per[k] || 0) + 1; }
           return { maxPerSourcePerTime: Math.max(0, ...Object.values(per)), scheduled: Object.keys(tr._scheduledEvents).length, playing: engine.playing }; })()""")
        check("Repeated Play/Stop: one trigger per source per step, one clock event", r["maxPerSourcePerTime"] == 1 and r["scheduled"] == ev0, {**r, "eventsAtStart": ev0})

        # CUT silences feedback tails
        await page.evaluate("""(() => { const {store} = window.__ULTRA__; store.set('tempo', 100);
          store.set('fx.synth.delay.mix', 0.7); store.set('fx.synth.delay.delayFeedback', 0.85);
          store.set('fx.synth.reverb.bypass', false); store.set('fx.synth.reverb.decay', 8); store.set('fx.synth.reverb.mix', 0.6);
          store.set('fx.drum.delay.bypass', false); store.set('fx.drum.delay.mix', 0.7); store.set('fx.drum.delay.delayFeedback', 0.85); })()""")
        await page.wait_for_timeout(2500)
        await page.evaluate("window.__ULTRA__.engine.stop()")
        await page.wait_for_timeout(300)
        tail = await page.evaluate("T.sampleFresh(['master'], 400)")
        check("After Stop, effect tails keep ringing (Stop ≠ CUT)", tail["master"] > 0.01, tail)
        g0 = await page.evaluate("(async () => { const e = window.__ULTRA__.engine; e.cut(); await new Promise(r => setTimeout(r, 15)); return e.cutGate.gain.value; })()")
        check("CUT: output gate closed within 15 ms", g0 < 0.001, g0)
        after = await page.evaluate("T.sampleFresh(['master','synthBus','drumBus'], 400)")
        await page.wait_for_timeout(600)
        later = await page.evaluate("T.sampleFresh(['master','synthBus','drumBus'], 1500)")
        gate = await page.evaluate("window.__ULTRA__.engine.cutGate.gain.value")
        check("CUT: silent immediately", after["master"] < 0.003, after)
        check("CUT: tails gone after output re-opens (racks rebuilt)", later["master"] < 0.003 and later["synthBus"] < 0.003 and gate > 0.99, {"later": later, "gate": gate})
        r = await page.evaluate("[window.__ULTRA__.engine.rack.synth.delayNode.feedback.value, window.__ULTRA__.store.state.fx.synth.delay.delayFeedback]")
        check("CUT keeps the user's settings in the rebuilt racks", abs(r[0] - 0.85) < 0.01, r)

        # Bypass does not double the signal: steady drone through synth bus
        await page.evaluate("""(() => { const {store} = window.__ULTRA__; const s = store;
           s.set('synth2.mute', true); for (const d of ['thud','crack','tick','clang']) s.set('drums.' + d + '.mute', true);
           s.set('synth1.mode', 'drone'); s.set('synth1.wave', 'sine'); s.set('synth1.attack', 0.01); s.set('synth1.pitch', 110); s.set('synth1.tone', 1);
           for (const fx of ['dist','crush','delay','reverb']) s.set('fx.synth.' + fx + '.bypass', true);
           s.set('fx.synth.reverb.decay', 1.5); s.set('fx.synth.delay.delayFeedback', 0.3);
           window.__ULTRA__.engine.play(); })()""")
        await page.wait_for_timeout(800)
        levels = {}
        levels["all bypassed"] = (await page.evaluate("T.sampleFresh(['synthBus'], 800)"))["synthBus"]
        for fx in ["delay", "reverb", "crush", "dist"]:
            await page.evaluate(f"(() => {{ const s = window.__ULTRA__.store; s.set('fx.synth.{fx}.mix', 0.5); s.set('fx.synth.crush.bits', 8); s.set('fx.synth.{fx}.bypass', false); }})()")
            await page.wait_for_timeout(900)
            await page.evaluate("window.__ULTRA__.engine.rack.synth.ready")
            await page.wait_for_timeout(1200 if fx == "reverb" else 0)
            on = (await page.evaluate("T.sampleFresh(['synthBus'], 800)"))["synthBus"]
            await page.evaluate(f"window.__ULTRA__.store.set('fx.synth.{fx}.bypass', true)")
            await page.wait_for_timeout(700)
            off = (await page.evaluate("T.sampleFresh(['synthBus'], 800)"))["synthBus"]
            import math
            levels[fx] = (round(20 * math.log10(on / off), 2) if on > 0 and off > 0 else None)
        # Doubling the signal would read about +6 dB. Reverb can read a few dB lower
        # because its wet half is diffuse (the impulse response is random noise).
        ok = all(v is not None and -8 < v < 4.5 for k, v in levels.items() if k != "all bypassed")
        check("Engaging an effect at 50% mix: no doubling (< +4.5 dB), no big drop (> −8 dB)", ok, levels)

        # Instability: bounded and never louder
        await page.evaluate("""(() => { const s = window.__ULTRA__.store; s.set('synth1.mute', true); s.set('synth2.mute', false);
          s.set('synth2.mode','drone'); s.set('synth2.noiseMix', 0); s.set('synth2.instability', 0); s.set('synth2.attack', 0.01); })()""")
        await page.wait_for_timeout(1200)
        steady = (await page.evaluate("T.sampleFresh(['synth2'], 1500)"))["synth2"]
        await page.evaluate("window.__ULTRA__.store.set('synth2.instability', 1)")
        await page.wait_for_timeout(300)
        r = await page.evaluate("""new Promise(res => { const {engine} = window.__ULTRA__; const vals = []; const det = [];
          const iv = setInterval(() => { vals.push(engine.meters.synth2.getValue()); det.push(engine.synth2.instabilityAmp.gain.getValueAtTime(engine.synth2.instabilityAmp.context.currentTime)); }, 25);
          setTimeout(() => { clearInterval(iv); res({max: Math.max(...vals), min: Math.min(...vals)}); }, 4000); })""")
        check("Instability: varies level but never exceeds steady level", r["max"] <= steady * 1.08 and r["min"] < r["max"] * 0.9, {"steady": steady, **r})

        # Presets load completely
        for name in ["ISOLATION", "INTERFERENCE", "ASSEMBLY"]:
            await page.select_option("#preset", name)
            await page.wait_for_timeout(400)
            st = await page.evaluate("window.__ULTRA__.store.state")
            check(f"Preset {name} loads complete state", st["name"] == name and len(st["synth1"]["pattern"]) == 16 and "fx" in st and st["fx"]["drum"]["reverb"]["decay"] > 0)
        await page.evaluate("window.__ULTRA__.engine.stop()")

        # Loudness of presets (relative)
        loud = {}
        for name in ["ISOLATION", "INTERFERENCE", "ASSEMBLY"]:
            await page.select_option("#preset", name)
            await page.wait_for_timeout(500)
            await page.evaluate("window.__ULTRA__.engine.play()")
            await page.wait_for_timeout(2500)
            loud[name] = (await page.evaluate("T.sampleFresh(['master'], 4000)"))["master"]
            await page.evaluate("window.__ULTRA__.engine.stop()")
            await page.wait_for_timeout(300)
            await page.evaluate("window.__ULTRA__.engine.cut()")
            await page.wait_for_timeout(500)
        check("Presets differ in loudness (ISOLATION quietest, ASSEMBLY loudest)", loud["ISOLATION"] < loud["INTERFERENCE"] <= loud["ASSEMBLY"] * 1.05, loud)

        # Playing screenshot
        await page.select_option("#preset", "ASSEMBLY")
        await page.wait_for_timeout(400)
        await page.evaluate("window.__ULTRA__.engine.play()")
        await page.wait_for_timeout(1300)
        await page.screenshot(path=OUT + "desktop_playing.png", full_page=True)

        mob = await b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await mob.goto(URL)
        await mob.wait_for_selector(".topbar")
        await mob.screenshot(path=OUT + "mobile.png", full_page=True)
        overflow = await mob.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        check("Mobile: no horizontal scroll", not overflow)
        small = await mob.evaluate("""[...document.querySelectorAll('button.step')].filter(b => b.getBoundingClientRect().height < 40).length""")
        check("Mobile: step buttons ≥ 40 px tall", small == 0, small)

        check("No console errors", not errors, errors[:5])
        await b.close()
    fails = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
    json.dump([{"check": n, "pass": ok, "detail": str(d)} for n, ok, d in results], open(OUT + "verify.json", "w"), indent=1)

asyncio.run(main())
