# The promo video

A 60-second trailer ("contains spoilers"), built from the game itself: every frame comes from the
real 3D build (`3d.html`, `q=high`, 1920×1080). The only additions are the text cards and the
transitions.

Published: [youtube.com/watch?v=BdS6FYy0NqI](https://www.youtube.com/watch?v=BdS6FYy0NqI).

| Time | What |
|---|---|
| 0–2.5 s | The splash, tagged *Contains spoilers* |
| 2–14 s | The opening, uncut: the crates open, and Voxxy, Droid and Biggy come out |
| 14–19 s | Light is the mechanic: Voxxy's orange alone shows a "?", then Droid's green joins it and the 9 rises |
| 18.5–25.7 s | Droid can't reach the lever: he stretches right under it, still short; then, already up on Biggy, Biggy creeps straight at the panel and stops dead facing it, and Droid pulls it |
| 26.5–30 s | Biggy's roll through the shutter door (chapter 2) |
| 29.5–32 s | The exhibition hall's booths: the real Kinepolis, from the Devoxx plans |
| 31.5–39 s | Stephan comes in through the front doors and pats Voxxy, then opens the stairs |
| 38.5–42.5 s | The cameo: Michele's backpack, then Michele and Claude at the high table |
| 42–49 s | Chapter 4: Droid carries the last X in one straight line, `#DEVOXX` goes up, the camera rises to the house screen |
| 48.5–58.5 s | How we made it: three cards on black, the screen fading out into them |
| 58–61 s | End card: play URL, repo, licence, music credit |

Every gameplay shot carries the game's own sound effects for its frames (footsteps, the clue's
chime, the lever, the shutter). The capture records one snapshot per frame, and
`renderSnapshots` in `tools/render-audio/harness.ts` plays those snapshots back through the real
cue player on an offline audio context.

Music: "Heroic Motif" by Ronny Shamano, synced to the opening, then the game's own chapter scores,
rendered offline by `tools/render-audio/`.

## Rebuilding it

You need Playwright with Chromium (it is not a dependency of the game: `npm i -g playwright`, or
set `PLAYWRIGHT=/path/to/playwright/index.mjs`) and ffmpeg. It is shot on the real GPU; headless
Chromium on an Apple M-series gets about 50 fps at `high`.

```bash
pnpm dev --port 5287 --host 127.0.0.1                       # in another shell
node tools/promo/capture.mjs /tmp/promo/frames              # splash, end, opening, run windows, staged shots
node tools/render-audio/render.mjs --out /tmp/promo/audio --name opening --seconds 14 --mute bed,cues
node tools/render-audio/render.mjs --out /tmp/promo/audio --name bed --seconds 6 --mute music,cues
for n in 1 2 3 4; do node tools/render-audio/render.mjs --out /tmp/promo/audio --name score$n \
  --seconds 30 --opening-score $n --mute bed,cues; done
node tools/promo/cut.mjs /tmp/promo/frames /tmp/promo/audio dist-promo/after-dark-trailer-contains-spoilers.mp4 \
  --play devoxx-after-dark.vercel.app --url github.com/Smirne/devoxx-gauntlet-m --pocs devoxx-game-pocs.vercel.app
```

- When a URL changes, only the last command needs to run again: the cards are re-rendered from
  `cards.html` with the new `--play`, `--url` or `--pocs` values.
- `capture.mjs <out> [what…]` takes `splash`, `end`, `opening`, `run`, `staged`, or a single
  staged shot by name (`light`, `lever`, `printer`, `cameo`, `keynote`). `printer` (not in the current cut) and `keynote` first
  replay the tests' run, unfilmed, to the moment they pick up from (`PRELUDE`). The `run` windows (`SHOTS`) replay the tests'
  deterministic full run. The staged shots (`STAGED`) set a chapter up with the debug API and
  script the robots and the camera one frame at a time.
- `STAGED_PATCH` rewrites a game module for one staged shot, in what the dev server sends that
  page only; the repo's code is untouched. The lever uses it: in the game, E right under the
  panel is "too high", and Droid only stretches 4 m away from it.
- `cut.mjs` holds the edit (`EDIT`): the segments, the card over each one, and the transition and
  sound act for each one. It refuses to write a cut longer than `--max` seconds (63 by default). A segment can `hold` one frame
  still instead of playing from `from`, and `dim` it under a card.

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
