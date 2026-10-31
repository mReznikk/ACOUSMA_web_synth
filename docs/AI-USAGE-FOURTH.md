# How AI was used in the FOURTH prototype

**Tool:** Claude (Anthropic), in a long working session. The student directed; Claude wrote and tested code.

## What the student did
- Set the concept and the sound: industrial, dark, atonal; a throbbing bed; a catharsis, a hard cut, then a low hum; a bass in the style of the KMFDM "Megalomaniac" synth; Lynch-style reversed speech.
- Chose the references and gave feedback after every listen ("too harsh", "too synthwave", "melody too present", "needs a darker, muted feel"). Each of these changed the sound.
- Recorded and supplied all voice material herself (three reversed questions and the final phrase) and wrote their text.
- Chose the visual ideas: questions forming out of grain on the waveform, backwards time during the reversed lines, the red dot after the cut, drifting slider names, the changing browser tab.
- Decided what to remove (the Studio view, the small grey labels, the time counter) and what to keep.

## What Claude did
- Wrote the score, the conductor that plays it, the rubber-bass instrument, the voice playback with filtering, and the Perform interface (waveform, grain text, sequencer strip, Tune panel).
- Turned each of her comments into concrete code changes, and cleaned out the unused original-instrument code from this prototype.
- Tested it in a headless browser: recorded the audio, measured levels, took screenshots, and checked there were no page errors.

## Limits
- Claude cannot hear audio. Every claim about the sound comes from measurements and from the student's listening.
- Claude could not open the YouTube/Stack Exchange links; the student pasted the text she wanted used.
- Nothing was pushed to GitHub by Claude. The student pushes this folder herself.
