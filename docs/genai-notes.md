# GenAI notes

How "After Dark" is being made with generative AI: the tools, the method, and a log with one entry
per working session — what the agent did, what a human decided, and what was rejected and why.

The competition asks entrants to document their use of generative AI, and scores it (5 of 100). This
file is that documentation, kept as the build goes rather than reconstructed at the end, because the
interesting part is not "an AI wrote it" — it is which decisions stayed human, and what had to be
put in place before an agent could be trusted with the rest.

## Tools

| Tool | Used for |
|---|---|
| Claude (Opus 5), via Claude Code in the repo | all production code, tests, docs and tooling; run as waves of **builder** agents plus **critic** agents on fresh context |
| Claude, conversationally (10–16 Sep 2026) | the design exploration: ten browser prototypes in `reference/poc/`, kept in `docs/ideas-history.md` |

Nothing else. No image generation, no 3D-model generation, no audio generation, no asset packs: the
build forbids external art, model, texture and audio files outright, so the robots are procedural
primitives on a bone rig, the venue is extruded from the floor plans, and every sound is synthesised
with Web Audio at runtime. The only binaries in the repository are the organisers' own reference
material (`robots/`, `plans/`, `media/`), which is read by humans and agents and never shipped.

## The method: the gauntlet loop

Full rules in [`GAUNTLET.md`](../GAUNTLET.md). In short: the game is cut into pieces, each piece is
built by a **builder**, then torn apart by a **critic** that gets fresh context every round, never
sees the builder's diff or self-report, and only ever judges the running build. A piece is done when
the critic says a stranger would mistake our version for the professionally-shipped game — or when it
caps out at three rounds and gets logged as capped. Two pieces (floor-plan fidelity and robot
appearance) carry a measurable pass condition instead of a vibe and escalate to a human rather than
shipping wrong.

### The prompting technique, specifically

This is the part worth copying.

1. **Images are the specification, prose is the gloss.** Builders and critics are handed
   `robots/*.png` (multi-view model sheets) and `plans/*-stairs-annotated.png` (floor plans with the
   staircases marked) as images. "Tall, weathered graphite panels" produces a generic humanoid; the
   model sheet produces Droid. Everywhere the two disagree, the image wins.
2. **The critic never sees the diff.** It launches the actual build, screenshots it, and compares
   blind. An agent shown its own patch grades the patch; an agent shown only the screen grades the
   game. This is the single change that most improved output quality.
3. **Factual check before aesthetic judgment.** For the two first-class pieces the critic first
   overlays a top-down render on the annotated plan (room count, proportions, door positions, both
   staircases) or places the robot at a three-quarter angle beside its model sheet. Fail there and
   the round is over — no discussion of mood, materials or lighting. It stops the loop from polishing
   something that is factually the wrong building.
4. **Freeze the numbers in code, not in the prompt.** The prototype's physics constants live in
   `src/sim/constants.ts` and are asserted by `tests/frozen-constants.test.ts`. An agent cannot
   quietly re-tune a threshold to make its own scene work; changing one is a human decision.
5. **Port the acceptance tests, do not invent them.** The tests come from the prototype's verified
   Playwright run, so "done" means the same thing it meant for the thing we know is fun, rather than
   whatever the agent found convenient to assert.
6. **Explicit file ownership for parallel agents.** Each builder in a wave gets a list of files it
   may touch; the shared contract (`types.ts`, `constants.ts`, `units.ts`) belongs to nobody. Without
   that, parallel agents "helpfully" refactor each other's work mid-flight.
7. **An architecture rule stated as a prohibition.** "`src/sim` is the only source of truth;
   `src/render` reads it and contains no game logic, ever." A rule phrased as a ban survives being
   passed through twenty prompts; a rule phrased as a preference does not.
8. **Ask before deviating.** Parity with the prototype beats any improvement the agent thinks of.
   Agents are told to raise a question rather than quietly improve the design — the good ideas are
   still raised, but a human decides.

---

## Session log

### 2026-09-21 — session 1: scaffold, contract, venue geometry, first build wave

**What the agent did**

- Scaffolded the project: pnpm, Vite, TypeScript strict, vitest, three (`f9f500c`), and wrote the
  contract every later piece codes against — `src/sim/types.ts` (state shapes), `src/sim/constants.ts`
  (the frozen physics numbers, ported verbatim from the prototype) and `src/sim/units.ts`
  (`PX_PER_M = 12.5`, the one place pixels become metres).
- Ported the venue from the annotated plans into `src/sim/geometry.ts` — first-floor rooms 3–10 plus
  the closed cinema section, the exhibition hall and lobby, both secondary staircases and the main
  staircase — and defined the facade the renderer reads (`4a83217`).
- Captioned eighteen new venue stills into `media/other-images/CAPTIONS.md`, with the corrections
  they force on corridor proportions and on the Zaal signage (`fdff2f5`).
- Ran the first parallel build wave: the per-robot sim step and light/visibility model
  (`src/sim/bot.ts`, `src/sim/lights.ts`), the procedural robot meshes and gait
  (`src/render/robots/`), the venue, prop and signage geometry (`src/render/venue/`), the diorama
  camera, the lighting pass, the DOM HUD and the synthesised audio — plus this progress tooling,
  the README and this file. At the end of the session the suite was 144 tests across 6 files, green.

**What a human (Michele) decided**

- **The gauntlet loop is the build methodology**, not a polish pass at the end: every piece gets a
  critic on fresh context, and the critic judges the running build rather than the diff.
- **Floor-plan fidelity and robot appearance are first-class pass/fail gates**, measured by overlay
  and by model sheet, not by opinion — and they escalate to him rather than shipping failing.
- **Parity with the prototype beats improvement.** The prototype is fun and verified; the port's job
  is to look like a shipped game, not to redesign one.
- **Procedural robots, not imported models** — which also keeps the repository asset-free and the
  clone instant for judges.
- **A fixed diorama camera per chapter**, not a free 3D camera: it shows the robots' designed faces
  and fronts (which a top-down view cannot) while keeping the sharpness of a 2D game.
- The sim stays in prototype pixels for now; only the renderer converts to metres.

**What was rejected, and why**

- **Copying the organisers' robot-demo code** — explicitly disallowed by the brief. Their published
  *technique* (procedural primitives, motion numbers) is read as a craft bar and cited in
  `docs/organisers-3d-demo-notes.md`; none of their code is used.
- **Importing GLB/glTF robot models** — no rigging toolchain in a build this short, and no external
  3D/audio asset files are allowed in this repository at all. Procedural primitives on a bone rig
  instead.
- **A free-flying 3D camera** — the organisers' own guidance is that "a sharp 2D game beats a vague
  3D one". A free camera would have meant framing, occlusion and readability problems in every room,
  for no gameplay gain.
- **Re-tuning the frozen physics constants to feel better in 3D** — parity is the acceptance test, so
  the numbers are asserted by tests. The absolute-scale retune sketched in `docs/scale-and-units.md`
  is deliberately deferred to a human decision, not taken by an agent mid-build.
- **Machinarium's art and assets** — used purely as an atmosphere and animation craft bar in critic
  rounds, never copied.
- **Real names and likenesses beyond what is safe** — Devoxx flavour stays at first names and
  caricature (Stephan), a keynote speaker listed as "TBA", tomato soup, the queues and the
  OutOfMemoryError beer joke. Nothing that would need permission.

**Left open for the human**

- The absolute-scale retune (metres-per-second speeds, room sizes) is still deferred; the sim runs at
  the prototype's arcade speeds.
- `Space` and `E` are both documented as action keys in the README. The prototype only had `E`;
  if the port keeps them distinct, the README table needs the distinction spelled out.
- `public/progress.html` links its screenshots relatively into `tools/progress/shots/`, so the page
  must stay inside the repository to show them.
