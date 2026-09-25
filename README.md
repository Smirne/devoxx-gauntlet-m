# After Dark

The cleaners have gone home, the projectors are cold, and Devoxx opens in six hours. **After Dark**
is a lights-and-locks puzzle game set in the real Kinepolis Antwerp: you play Voxxy, Droid and Biggy,
the three Devoxx robots, working the night shift over four chapters — the dark cinema floor, the
unlit exhibition hall, the lunch rush and the keynote. The building is pitch black, and each robot
carries a different lamp: Voxxy a narrow orange beam, Droid a small green pool, Biggy a wide blue
flood. Light is the mechanic. Where two colours overlap you can read what is written there, and the
only way through a locked door is to put the right robots in the right places at the same time.

## Run it

Node 20 or newer (developed on Node 22) and [pnpm](https://pnpm.io) 10 — `corepack enable` gives you
the pinned version.

```bash
pnpm install
pnpm dev        # Vite dev server, then open http://localhost:5173
```

```bash
pnpm test       # vitest — the sim's acceptance tests, including the frozen physics constants
pnpm build      # typecheck + production bundle into dist/
pnpm preview    # serve the production bundle
```

No API keys, no asset downloads, no native build step: everything — geometry, robots, lighting and
audio, music included — is generated in code at startup.

## Controls

| Key | What it does |
|---|---|
| `W` `A` `S` `D` or arrow keys | Move the selected robot |
| `1` `2` `3` | Switch to Voxxy / Droid / Biggy |
| `Tab` | Cycle to the next robot |
| `E` | Act — fix, carry, take, and mount Biggy when Droid stands beside him |
| number keys | Type the code, **standing at the fire-door keypad**. Away from the pad, `1` `2` `3` still switch robot |
| `M` | Mute everything |
| `N` | Music on / off, leaving the sound effects alone |
| `R` | Restart the run |
| **Skip chapter ▸** (button, top right) | Jump to the next chapter if you are stuck, or to see the later ones |
| **the briefing** (top of the screen) | Folds itself to one line a few seconds in, so it is not sitting over the diorama all chapter. Click it to unfold or refold |

A ring on the floor, in that robot's lamp colour, marks the one you are driving. The line across the
bottom of the screen is the live objective — what is done and what is left, refreshed every frame.

Whenever a robot cannot get through something, it says why, in its own voice. That message is the
puzzle hint — read it rather than pushing harder.

## What you are playing

Four chapters, each in one part of the building, each seen from a fixed diorama camera:

1. **Night** — the closed cinema section behind the fire door. Four things in the dark need reading
   before the door will open.
2. **Expo** — the exhibition hall with the power off. Breakers, a cable run that is measured to the
   pixel, and a roller door that will not care how hard you ask it politely.
3. **Lunch** — doors open, visitors arrive, the soup queue forms, and a speaker is missing fifteen
   minutes before their talk.
4. **Keynote** — Room 8. Cake, a banner, spotlights, a filling room, and three robots who have to be
   on that stage when the lights come up.

Every chapter is solved with the three robots' *physical* differences, never with an inventory. No
combat, no timers you can fail hard, and a skip button so a judge with ten minutes can see all four.

## The three robots

| | Physically | Lamp |
|---|---|---|
| **Voxxy** | small and quick, fits through Voxxy-sized gaps and under sponsor tables, light enough to shove Biggy up to speed | narrow orange beam, long throw |
| **Droid** | tall, deliberate, steps over ropes and reaches high panels, too tall for low passages; climbs onto Biggy to become a tower | small green pool at head height |
| **Biggy** | heavy, slow to start and hard to stop, barges jammed doors at speed, too wide for narrow aisles | wide blue flood, the longest reach |

They are simulated, not scripted: acceleration, drag, mass, restitution and the impulses they trade
when they collide come from one 2D physics step shared by every chapter, and the door and push
thresholds are compared against each robot's own top speed. Biggy breaks the jammed door because he
is heavy and can get up to speed in a corridor — not because the script says so.

## Built for the Devoxx Belgium Robot Games

An entry for the [Devoxx Belgium Robot Games](https://game.devoxx.be/), using the organisers' three
robots and the real Kinepolis Antwerp floor plans. Room adjacency, the corridor, both secondary
staircases (standing in the corridor against its two walls, level with rooms 4 and 9) and the main
staircase (at the corridor's end between 6 and 7) are placed from the published plans, measured in
plan pixels and asserted in `tests/geometry.test.ts`; the Zaal numerals and the blue Dutch
wayfinding signs are the venue's own.

## Technologies

TypeScript (strict), Vite, Three.js r186 and vitest — and nothing else. No game engine, no physics
library, no 3D models, no texture or audio files. `src/sim` is a headless, tested 2D simulation and
is the only source of truth for game state; `src/render` is Three.js and only ever reads it. The
robots are procedural primitives on a bone rig with a procedurally animated gait, the venue is built
from the floor plans, and every sound is synthesised with the Web Audio API at runtime — including
the music, which is a four-bar score per chapter played by oscillators rather than a file.

Built with generative AI, deliberately and with the process written down:
**[docs/genai-notes.md](docs/genai-notes.md)**. How the build itself is run — builder, then a critic
on fresh context who never sees the diff — is in [GAUNTLET.md](GAUNTLET.md), and the game as designed
is in [docs/after-dark-full-design.md](docs/after-dark-full-design.md).

## Status

In active development for the 30 September 2026 deadline; this README describes the game as designed
and built so far.

- **Playable now, end to end:** all four chapters, both cutscenes, the optional booth mini-games, the
  simulation (movement, collisions, pushes, the door and cable thresholds), the light and shadow
  model, the venue geometry for both floors, the three robot models, the HUD and the synthesised
  audio — with the test suite green (`pnpm test`) and zero console errors on a full run.
- **Still being gauntleted:** craft polish on the dark chapters' lighting, per-robot idle
  personality, and the auditorium width spread on the first floor (see the notes below).
- Progress per piece, with critic verdicts and screenshots, is regenerated by `pnpm progress` into
  `public/progress.html`.

## Debug URLs (how the build is judged)

Every critic in the gauntlet drives the running build through the address bar, so a fidelity
screenshot is deterministic and needs no automation client:

| Query | What it does |
|---|---|
| `?chapter=N` | Start in chapter 1..4, skipping the title card |
| `?topdown=1` | Flat plan-view debug camera of the current floor, north up, flat lit, no fog. The sim rect `0,0..1900,700` is drawn at its own 19:7 aspect **anchored to the top-left of the canvas**, so a plan overlay needs no offset |
| `?nofog=1` | Drop the fog-of-war mask only |
| `?seed=N` | Seed the sim RNG, so clue digits and crowds replay exactly |
| `?warm=N` | Advance the sim N fixed steps before the first drawn frame |
| `?pose=voxxy\|droid\|biggy` | Robot portrait: that robot alone on a plinth, front three-quarter, lit for the model-sheet check |
| `?nohud=1` | Hide the DOM overlay |

`document.title` always reads `After Dark · ERRORS:<count>` and `<pre id="console-log">` carries the
lines, so "no console errors" can be read straight out of `--dump-dom`.

## Licence

MIT — see [LICENSE](LICENSE). It covers the code and the generated content, which is all of the game:
no third-party art, models, textures or audio ship in the build. The robot model sheets (`robots/`),
floor plans (`plans/`) and venue photographs (`media/`) are the organisers' own reference material
from <https://game.devoxx.be/references.html>, kept here only as build references.
