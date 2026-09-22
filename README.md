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
audio — is generated in code at startup.

## Controls

| Key | What it does |
|---|---|
| `W` `A` `S` `D` or arrow keys | Move the selected robot |
| `Shift` (hold) | Run |
| `1` `2` `3` | Switch to Voxxy / Droid / Biggy |
| `E` | Act — fix, carry, take, and mount Biggy when Droid stands beside him |
| `Space` | Interact with whatever you are standing at |
| number keys | Type the code at the fire-door keypad |
| **Skip chapter ▸** (button, top right) | Jump to the next chapter if you are stuck, or to see the later ones |

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
staircases (between rooms 3|4 and 10|9) and the main staircase (between 6 and 7) are placed from the
published plans; the Zaal numerals and the blue Dutch wayfinding signs are the venue's own.

## Technologies

TypeScript (strict), Vite, Three.js r186 and vitest — and nothing else. No game engine, no physics
library, no 3D models, no texture or audio files. `src/sim` is a headless, tested 2D simulation and
is the only source of truth for game state; `src/render` is Three.js and only ever reads it. The
robots are procedural primitives on a bone rig with a procedurally animated gait, the venue is built
from the floor plans, and every sound is synthesised with the Web Audio API at runtime.

Built with generative AI, deliberately and with the process written down:
**[docs/genai-notes.md](docs/genai-notes.md)**. How the build itself is run — builder, then a critic
on fresh context who never sees the diff — is in [GAUNTLET.md](GAUNTLET.md), and the game as designed
is in [docs/after-dark-full-design.md](docs/after-dark-full-design.md).

## Status

In active development for the 30 September 2026 deadline; this README describes the game as designed
and built so far.

- **Playable now:** the simulation (movement, collisions, pushes, the door and cable thresholds), the
  light and shadow model, the venue geometry for both floors, the three robot models, the HUD and the
  synthesised audio — with the test suite green (`pnpm test`).
- **Landing right now:** the browser entry point (`src/main.ts`) that binds those pieces into a
  playable loop, the four chapters' scripted beats, the two cutscenes and the optional booth
  mini-games. If `pnpm dev` serves an empty page, that entry point is what is still missing;
  `pnpm test` is the honest measure of what works today.
- Progress per piece, with critic verdicts and screenshots, is regenerated by `pnpm progress` into
  `public/progress.html`.

## Licence

MIT — see [LICENSE](LICENSE). It covers the code and the generated content, which is all of the game:
no third-party art, models, textures or audio ship in the build. The robot model sheets (`robots/`),
floor plans (`plans/`) and venue photographs (`media/`) are the organisers' own reference material
from <https://game.devoxx.be/references.html>, kept here only as build references.
