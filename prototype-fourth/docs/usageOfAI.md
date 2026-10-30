# ACOUSMA

Мною был использован Claude AI.

Сначала я самостоятельно разработала концепт составила структуру и приблизительное техническое сопоставления. На основе моих набросков касательно голосов, ударных, эффектов и маршрутизации Claude помог сопоставить каждую часть с узлами Web Audio API и настроить единую систему именования для разделов и идентификаторов в коде.

Что было в набросках:
1. Два голоса, представляющие как бужто два полюса. Концепция строится на переходе от узнаваемости к неопределенности, поэтому я разделил звук между двумя синтезаторами по одному на каждый условный полюс:

SYN 1 периодический, узнаваемый слой с классическими формами волны.
SYN 2 слой неопределенности; включает белый и розовый шум. 

2. Закосу под индастриал шум необходим механический пульс, поэтому я добавила 16-шаговый секвенсор с четырьмя звуками. 

3. Эффекты, подобранные на основе собственного анализа звука. Я выбрала эффекты, каждый из которых  по моему мнению создает одно из тревожных ощущений:

GRIND для дисторшна; ROUGH кольцевой модулятор, настроенный на диапазон 30–150 Гц для «шероховатости» звука; DROPOUT  для внезапных пауз ; FILTER перестраиваемый фильтр низких частот. ECHO и SPACE для создания эффектов дилея и реверберации.

Их я разделила по функциональному назначению: первые четыре работают как инсерты (меняют сам звук), а echo и reverb как общие посылы, помещающие звук в пространство.

4. Маршрутизация и дисплей с граф линией. Каждый источник получил собственный канал с параметрами LEVEL, PAN, MUTE и SEND; все сигналы поступают на мастер-канал. Мастер-сигнал также проходит через анализатор, данные с которого выводятся на дисплей. Благодаря этому график на экране отображает реальный сигнал, что важно для  моей концепции

5. Я рассматривал эту структуру как предварительный набросок. В процессе проектирования и разработки я ее упростила, а именно, голоса стали называться PULSE и FRICTION, ударные - IMPACT, количество эффектов сократилось с шести до четырех, а каналы были объединены в две шины, каждая со своими эффектами. Общая концепция в целом очень даже сохранилась.
---

Работа в фигме: Я самостоятельно разработала компоненты и дизайн экрана для десктопной версии. Потом передала Claude черновик с описанием структуры и дизайн из фигмы, и он помог превратить их в рабочий инструмент на JavaScript с использованием Tone.js.
Claude написал аудиомодули:
engine.js - для шести каналов, двух шин, мастер-канала и лимитера, а также функции CUT;
voices.js - для PULSE и FRICTION;
drums.js - здесь звуки THUD, CRACK, TICK и CLANG синтезируются программно, а не загружаются как сэмплы;
fxRack.js - для цепочки из четырех эффектов с возможностью включения и обхода;
clock.js - единый 16-шаговый тактовый генератор(clock), синхронизирующий все паттерны.
---

Ниже, мой супер гигантский промт (естественно на английском):

Create a functional proof of concept web-based industrial noise synthesizer and sequencer.
The instrument should let someone without musical training create disturbing drones, abrasive textures, repetitive bass patterns, and mechanical percussion. 
1. Core concept and musical direction
The concept is “noise as a material with grain, weight, and movement.”
The player combines three elements:
A repetitive electronic pulse.
An unstable layer of noise.
A mechanical drum pattern.
Use my three listed artist references as creative directions:
Atrax Morgue: claustrophobic electronic textures, exposed oscillators, uncomfortable sustained tones, sparse movement, and controlled instability.
Throbbing Gristle: raw experimentation, primitive repetition, interference, contrasting textures, and unsettling empty space.
Early KMFDM: insistent machine rhythms, distorted bass repetition, sharp percussion, and physical momentum.
Do not reproduce particular tracks. The instrument should support both sparse noise exploration and rhythm-driven industrial patterns. 
2. Non-negotiable scope
Include:
Two independently controlled monophonic synth voices.
A separate four-part drum/sample sequencer.
Separate audio channels for both synths and every drum part.
Four functioning effects: distortion, bitcrusher, delay, and reverb.
A mixer, shared transport, and working parameter controls.
An explanation of the code and signal flow.
DO NOT CREATE A PIANO, PIANO KEYBOARD, INDIVIDUAL NOTE KEYS, OR PIANO ROLL.
Use numbered time-step buttons, sliders, switches, and numeric pitch controls. Step buttons represent positions in time, not piano keys.
DO NOT ADD TO MY STUCTURE COMPLEX OR FANCY FILTERS. Allow only a simple Tone control where needed. No filter-design graphs, multimode filter banks, modular patching interface, or modulation matrix.
Keep the project focused on a playable instrument rather than a complete DAW.
3. Synth 1 - PULSE
Role: low electronic foundation, repetitive bass, throbbing machinery, and blunt rhythmic patterns.
Provide:
Waveform selector: sine, triangle, sawtooth, square.
Base pitch, approximately 30–400 Hz.
Attack and Release.
One simple Tone control mapped to low-pass cutoff.
Level and pan.
Sequence / Drone mode.
Make the waveform choices audibly distinct: sine is rounded, triangle has a restrained edge, sawtooth is buzzy, and square is hollow and assertive.
In Sequence mode, trigger the voice from its own 16-step pattern. In Drone mode, sustain its base pitch while the transport runs.
Default to a short, dark square-wave pulse with moderate distortion downstream.
4. Synth 2 - FRICTION
Role: electrical hiss, unstable tones, abrasive drones, and bursts of interference.
Provide:
Tonal waveform selector: sine, triangle, sawtooth, square.
Noise type selector: white or pink.
Noise Mix, blending the tonal oscillator and noise source.
Base pitch, approximately 60–3000 Hz, affecting the tonal component.
Attack and Release.
One simple Tone control.
Instability.
Level and pan.
Sequence / Drone mode.
Noise is a separate source inside this voice, not an oscillator waveform option.
Instability should introduce bounded, smoothed irregular modulation of pitch and amplitude. Use a fixed, documented mapping that stays understandable. It must create audible variation without unpredictable jumps in output level.
In Sequence mode, the envelope gates both noise and tone. In Drone mode, both sustain while transport runs.
Default to a mostly noisy texture with a faint unstable tone underneath.
5. Drum section - IMPACT
Create four clearly labeled sample-sequencer rows:
THUD: short, heavy kick.
CRACK: dry, distorted snare.
TICK: tight noise-based hat.
CLANG: metallic impact.
Each row needs 16 steps, Level, Mute, and sample playback-rate control.
Supply original generated one-shot buffers or appropriately licensed bundled samples. The first playback must work without uploading files or finding external sample packs.
Give the drums different frequency and decay characteristics. Preserve the kick’s weight and enough transient definition for the beat to remain readable through distortion.
6. Sequencer and transport
Use one shared clock for both synth patterns and all drum rows:
Start Audio.
Play / Stop.
Tempo: 40–180 BPM.
One bar of 16 sixteenth-note steps.
Visible beat groups of four.
Synchronized playhead.
Each synth sequence has one horizontal row of step toggles. Selecting a step exposes a compact editor with:
Pitch offset: −12 to +12 semitones from the base pitch.
Gate length.
Accent.

Provide Clear and restrained Randomize actions per pattern. Randomize should produce sparse, usable starting points and should not change master volume or effect feedback.
Stop must stop scheduling and release active voices. A separate CUT button must immediately silence sources and effect tails.

7. Audio routing and effects
Build this explicit audio structure:
PULSE source to envelope to simple tone stage to PULSE channel to SYNTH bus.
FRICTION sources to shared envelope to simple tone stage to FRICTION channel to SYNTH bus.
THUD, CRACK, TICK, CLANG to four individual channels to DRUM bus.
SYNTH bus to its own effects rack to master.
DRUM bus to its own effects rack to master.
Master to output protection to speakers.
Each bus has independent effect instances and settings. A bus selector may show one rack at a time to reduce visual clutter, but switching the view must preserve both racks’ state.

Use a fixed chain:Distortion to Bitcrusher to Delay to Reverb.
Expose only the essential controls:
Distortion: Drive and Mix.
Bitcrusher: Bit Depth and Mix.
Delay: synchronized division, Feedback, and Mix.
Reverb: Decay and Mix.
Bypass for every effect.
Implement real bit-depth reduction rather than substituting distortion and calling it a bitcrusher. Document any additional sample-rate reduction separately.

For delay and reverb, retain a properly mixed dry path. Bypass must not double the signal or create a large gain jump.
“Separate channels” means independent internal mixer paths, not placing one synth only in the left speaker and the other only in the right. Each source must remain independently controllable before bus summing.
Include source mute/solo, synth-bus and drum-bus levels, and master level. Mute source input before the effects so existing tails can decay; CUT must silence everything immediately.

8. Arrange the interface in signal-flow order:
Name, preset selection, transport, tempo, and CUT.
PULSE and FRICTION voice modules.
Synth sequences and IMPACT drum grid.
Mixer and selected bus effects rack.
Support desktop and mobile. Keep controls comfortably touchable and preserve the sequence’s time order at narrow widths.

9. Labels and code structure
Use consistent visible module names:
SYNTH 01 / PULSE
SYNTH 02 / FRICTION
DRUMS / IMPACT
FX / SYNTH
FX / DRUM
MASTER
Use conventional parameter names such as Pitch, Attack, Release, Drive, and Feedback. Explain unfamiliar terms with short accessible help text.
Organize implementation into clear responsibilities:
Audio engine and routing.
Voice creation.
Drum buffers and playback.
Clock and scheduling.
Effects racks.
Instrument state and presets.
Interface components.
Use readable identifiers such as synth1, synth2, drumBus, synthBus, noiseMix, and delayFeedback. Every visible control must map to a real state value and audible function.

10. Browser implementation requirements
Use JavaScript and Web Audio API, with Tone.js if it simplifies reliable implementation. Verify the chosen library’s current API and pin the version.
Initialize or resume audio after an explicit user gesture. Schedule sound against the audio clock; use screen animation only to display the playhead.
Smooth parameter changes to prevent accidental clicks. Bound feedback, leave mixing headroom, and start with a conservative master level. Avoid creating duplicate audio engines or stacked sequencer events when Play is pressed repeatedly.
Keep UI state separate from audio nodes. Clean up sources, connections, and scheduled events correctly. If custom DSP requires an AudioWorklet, implement and explain it rather than leaving a placeholder.

11. Starting presets
Include my three original, immediately playable presets which i described earlier:
ISOLATION: a sparse drone, unstable high tone, occasional metallic impact, and substantial empty space.
INTERFERENCE: irregular noise bursts, a restrained repeating pulse, and short dirty echoes.
ASSEMBLY: a driving drum pattern, repetitive distorted bass, and short noise accents.
Store the complete instrument state in each preset, including patterns, voice modes, mixer levels, and effects. Preset changes should avoid abrupt output jumps.

12. References and deliverables
Study these references:
Ableton Learning Music for immediate, beginner-friendly musical interaction.
ADC Melody Sequencer.
ADC Sample Sequencer.
ZakharDay synth-controls for potential reusable controls.
Inspect their actual implementation and licensing before reusing code. If a reference is inaccessible, state that and do not invent its API. The no-piano and simple-filter requirements take precedence over reference examples.

Deliver:
An audio-routing diagram.
A functional browser proof of concept.
Design based on my prototype
Complete source code and setup instructions.
Verify that both synths work independently, every drum has its own channel, bus effects remain independent, tempo changes keep all patterns synchronized, repeated Play/Stop does not duplicate audio, and CUT silences feedback tails.
The proof of concept is successful when a beginner can start a pattern, distinguish the two synth voices, shape a noise texture, and move between a sparse disturbing atmosphere and a mechanical industrial groove without using a piano interface.
