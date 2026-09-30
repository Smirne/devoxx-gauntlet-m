# The promo video

A 29-second trailer, built from the game itself: every frame comes from the real 3D build
(`3d.html`, `q=high`, 1920×1080), and every gameplay frame comes from the tests' own scripted run.
None of it is posed or composited into the scene. The only additions are the text cards and the
transitions.

| Time | What |
|---|---|
| 0–3 s | The splash: the DEVOXX wordmark over Antwerp at night |
| 3–7 s | The opening: the crates open, and Voxxy, Droid and Biggy come out |
| 7–19 s | Gameplay: the dark corridor, Voxxy's beam on the expo booths, all three robots at the technical room, the front doors letting the crowd in, the lunch-rush stairs, Room 8 raked, the stage, the `#DEVOXX` letters and the cake |
| 19–26 s | How we made it: three cards |
| 26–29 s | End card: the repo, the licence, the music credit |

Music: "Heroic Motif" by Ronny Shamano (the opening's track) for the first 12 s, then the game's
own procedural scores (the expo's, then the keynote's), rendered offline by
`tools/render-audio/`.

## Rebuilding it

You need Playwright with Chromium (it is not a dependency of the game: `npm i -g playwright`, or
set `PLAYWRIGHT=/path/to/playwright/index.mjs`) and ffmpeg. It is shot on the real GPU; headless
Chromium on an Apple M-series gets about 50 fps at `high`.

```bash
pnpm dev --port 5287 --host 127.0.0.1                       # in another shell
node tools/promo/scout.mjs /tmp/promo/scout 1               # optional: a frame a second, named by sim step
node tools/promo/capture.mjs /tmp/promo/frames              # splash, end, opening, the gameplay windows
for n in 2 4; do node tools/render-audio/render.mjs --out /tmp/promo/audio --name score$n \
  --seconds 12 --opening-score $n --mute bed,cues; done
node tools/promo/cut.mjs /tmp/promo/frames /tmp/promo/audio dist-promo/after-dark-promo.mp4
```

- `scout.mjs` plays the full run (the choreography from `tests/full-run.test.ts`) and saves a
  frame every N seconds, named by sim step, so you can make a contact sheet and pick shots.
- `capture.mjs` plays the same run again (it is deterministic for the seed in `common.mjs`) and
  renders every sim step inside the windows listed in `SHOTS`. Before each window it renders
  45 frames without keeping them, so the follow camera settles the way it does in play.
- `cut.mjs` holds the edit (`EDIT`): the segments, the card over each one, and the transition
  into each one. It renders the cards from `cards.html` as transparent PNGs, and it refuses to
  write a cut longer than 30 s.

## How we made it (for the video description)

> **After Dark** is a lights-and-locks puzzle game set in the real Kinepolis Antwerp, made for the
> Devoxx Robot Games 2026. It is the night before Devoxx, the power is out, and Voxxy, Droid and
> Biggy have until the doors open to get the keynote ready.
>
> Every line of code, test and note was written by Claude, in Claude Code. One human, Michele,
> decided what the game is, playtested every build, and supplied the floor plans, the robot model
> sheets and the venue photos. The game was built in nine days using a "gauntlet" loop: a builder
> makes each piece, then a critic starting from fresh context judges the running build without
> seeing the diff, then a human plays it. A single headless 2D simulation is the only source of
> truth, and both renderers (the 3D build and the 2.5D diorama) only read it. More than 900 tests
> guard it, including tests that freeze the physics constants. Only the human changed those
> constants, twice. The venue is measured off the real Devoxx floor plans. There are no 3D or
> sound-effect asset files: every mesh, texture and sound is generated in code. The only exception
> is the opening track, "Heroic Motif" by Ronny Shamano.
>
> MIT licensed. The full GenAI log is in `docs/genai-notes.md`.
