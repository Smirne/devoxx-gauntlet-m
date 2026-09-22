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

---

## Session — integration: the app itself (`src/main.ts`, `src/render/scene.ts`, `src/style.css`)

Seven builders had landed the sim, the four chapters, the robots, the venue, lighting, camera, HUD
and audio in parallel, and `tsc` and 160 vitest tests were green — but there was no entry point, so
nothing had ever run in a browser. This session wired them together and ran it.

**What the agent did**

- `src/render/scene.ts` — the seam: one `WebGLRenderer`, the venue from `buildVenue()`, one
  `RobotRig` per robot, the `LightLayer` and the diorama camera. Per frame it reads a
  `GameSnapshot` and never writes to it: picks the storey, shows only that floor's group, frames
  the chapter's `ViewRect`, places each rig from sim pixels via `PX_PER_M`, drives the gait from
  the robot's speed in m/s, lifts a mounted Droid by `ROBOT_HEIGHT_M.biggy`, and feeds the light
  layer. Two extra cameras for the Stage 1 fidelity checks: a plan view letterboxed to the sim
  rect's own 19:7, and a front three-quarter robot portrait on a plinth.
- A small dressing layer in the same file draws `GameSnapshot.props` and `.people` from pooled
  boxes, plates and figures, plus the chapter-2 cable as a polyline. Nobody had built one, and
  without it the lunch chapter renders with no queue and no Stephan.
- `src/main.ts` — game, scene, HUD, audio, keyboard, one rAF loop with `dt` clamped to `DT_MAX`,
  and the debug URL API the critics drive the build through (`?chapter ?topdown ?nofog ?seed
  ?warm ?pose ?nohud`). Footsteps are derived from the gait's own step frequency rather than
  scripted, so the sim never learns that audio exists.
- Error reporting is installed first: `window.onerror`, `onunhandledrejection` and a
  `console.error` wrapper (which still forwards to the real console) append to
  `<pre id="console-log" hidden>` and write the count into `document.title`, so GAUNTLET.md's
  "no console errors" is readable straight out of `--dump-dom`.

**Repairs made at seams the builders left open**

- `src/render/lighting.ts` — the fog-of-war material used `MultiplyBlending` without
  `premultipliedAlpha`, which three only implements for premultiplied source colour. It logged one
  `console.error` per draw call: 131 errors in the first four seconds of chapter 1. Added the flag;
  the mask texture is fully opaque, so the two agree.
- `src/render/lighting.ts` — added `setFogEnabled()` and `setEnabled()` to `LightLayer`, which the
  `?nofog=1` switch and the two debug cameras need.
- `src/sim/chapters/ch2-expo.ts` — chapter 2 returned no `lights()`, so the snapshot carried no
  light sources, the renderer created no lamps, and the exhibition hall drew as a black rectangle
  with the robots invisible in it. The prototype's `expoDraw` punches a hole in an 80 % mask around
  each robot until the breakers go in; the port now casts real visibility polygons for the same
  window. Nothing in chapter 2 reads them — no light-mix enigma there — so this only adds snapshot
  data to draw.
- `src/main.ts` — `?warm=N` dismisses a chapter's opening card before stepping. Chapters 2-4 open
  on a card and `Game.update` returns early while one is up, so without this the warm-up advanced
  nothing and every settled screenshot was a photograph of a modal.

**What a human still has to decide**

- **The night chapters photograph almost black.** Chapters 1, 2 and 4 come out at mean luma 8-11
  with 94-97 % of pixels in the darkest sixteenth. The robots' lamps and the light mixing read
  well, and the Room 8 stage wash reads, but the venue around them does not. `?nofog=1` moves mean
  luma by less than 0.1, because the chapter ambient in `MOODS` (0.05 night, 0.07 hall) is itself
  near-black — the fog mask is multiplying an already-black image. The prototype got away with
  these numbers because it drew flat 2D shapes; 3D geometry has nothing to catch. Whether the 3D
  venue needs a higher ambient floor than the 2D prototype is a look decision, not a builder's, so
  it is logged rather than taken. The agent did revert the renderer to `NoToneMapping`, which is
  what `lighting.ts` was calibrated against, and that recovered some of it.
- Chapter 3 is the daylight chapter (`sun: 1`) but reads as flat grey with no sun direction; worth
  a lighting round.

**What was rejected, and why**

- **Re-tuning `MOODS` in `lighting.ts` to brighten the screenshots** — those numbers are cited as
  the prototype's own (0.95 / 0.8 darkness) and belong to the lighting builder and to a human's
  look call. An integrator quietly brightening another piece's calibration would hide the problem
  rather than surface it.
- **Weakening or skipping a test to make something pass** — nothing needed it; the suite stayed at
  160/160 through every repair.
- **Adding Playwright or any other dependency** for the browser runs. The headless Chromium already
  on the box, driven with `--screenshot --dump-dom`, is enough, and the error count in the page
  title is what makes it enough.

## Session — 22 Sep 2026, gauntlet round 3: three critics, one fix agent

**What the builders had produced.** A complete, driveable four-chapter build: 160 green tests,
`tsc --noEmit` and `vite build` clean, zero console errors on every chapter, both cutscenes and a
real end card. Three critics then judged the *running* build on fresh context, never the diff —
floor-plan fidelity, robot appearance and full-run stability.

**What the critics caught.** All three failed it, and two of the three failures were the same
mistake in different places: **geometry buried inside other geometry**. Biggy's dark visor band was
a cylinder of radius 0.44 sitting inside a belly sphere of radius 0.52, so the orange shell rendered
in front of it and Biggy had no face; Droid's pauldron emblem was placed at x 0.082 on a pauldron
whose surface is at 0.122, so both shoulders rendered as bare domes. Neither is visible in a diff and
neither is caught by a test — only a critic holding the render next to the model sheet finds them.
That is the loop doing exactly what GAUNTLET.md says it is for.

The third failure was the camera: the diorama framed each chapter's whole `ViewRect` (chapter 1's is
72 x 50 metres), so the robots rendered fifteen pixels tall and none of the appearance work reached
the player at all.

**What was changed this round.**

- **Camera.** `src/render/scene.ts` now frames a room-sized window on the driven robot, clamped
  inside the chapter's rect, instead of the whole storey. Fixed angle, fixed zoom — still one
  viewpoint per chapter, just pointed at the room the player is in. Robots went from ~15 px to
  50-95 px. A ground ring in the robot's own lamp colour marks the one being driven.
- **A per-robot key light** (`src/render/lighting.ts`). A robot's lamp points *away* from it, so in
  the dark chapters each robot stood in the middle of its own pool as an unlit black silhouette.
  Each now carries a short-range practical in front of it, on the camera's side, spent about a metre
  past its own feet.
- **Biggy, rebuilt to measurement, not to eye.** The model sheet's FRONT VIEW was measured
  pixel-by-pixel (265 px/m): belly 1.15 m across and 1.10 m tall, helmet 0.94 m, legs 0.13 m. The
  belly now hangs low enough to swallow the knees, the helmet is a cap on top of it at the sheet's
  1.22:1 ratio, the visor band is a near-black collar that stands *proud* of the belly with amber
  eyes seated in it, the arms are dark (as on the sheet) and tucked inside the belly's silhouette,
  and the emblem has its own cream material instead of being embossed orange-on-orange.
- **Droid.** The pauldron emblem is now parented to the pauldron and placed at 1.06x its ellipsoid
  surface along its own normal, so it cannot sink into the shell again. The five saturated orange
  "noodles" per shoulder became a worn copper joint ring and two rust patches; the unreferenced
  bright green sternum LED is gone.
- **Amber, not lemon.** All three robots' eyes clipped their green channel to 255 at the old
  emissive intensities and photographed as pure yellow. Lower intensity, more saturated base.
- **The lobby band.** A quarter of the ground floor — sim x 1560 to the east wall — was bare deck.
  The BOF rooms and the toilets moved to the far-right/top quadrant the plan actually puts them in,
  the BOF block is subdivided into three rooms with their own doorways, and the renderer now builds
  the entrance door row, the glazed facade, the rope-line stanchions, the dark blue columns, the
  wheelchair ramp and the toilet block.
- **The scalloped wall is a door bank.** The plan draws the hall's right wall as a dozen door-swing
  arcs; it was a flat slab modulated by six sim units. It is now recessed glazed leaves between
  mullions, with the sim's four openings drawn as bays whose leaves stand open.
- **The floor-1 main staircase** got a blue-carpet head at corridor level, a shallower flight, three
  runs split by tubular handrails and its white tensile canopy.
- **Playability.** Every chapter now publishes a live `progress` line (the sim owns it; the HUD only
  formats it). The keypad measures its reach from the robot's *edge*, so Biggy can reach it, and a
  digit pressed out of range says why instead of vanishing. Identical toasts refresh instead of
  stacking. The fire door, the lock, both gates and the roller door speak one line per robot. Skip
  on the end card no longer records a fifth chapter. The speed gauge quotes one unit, on a
  display-only scale from `docs/scale-and-units.md` (Voxxy 4.0 m/s, not 23.2).

**A human decision reversed, deliberately.** The previous session *rejected* re-tuning `MOODS` in
`lighting.ts`, on the grounds that the darkness was the lighting builder's calibration and a human's
look call. This round a critic measured chapter 2 at **98.8 % black** and called the result
unreadable, which moves it from taste to legibility. The chapter ambients were lifted (night
0.05 → 0.11, hall 0.07 → 0.16, keynote 0.30 → 0.36) and two house lights added at the corridor's
east end, where chapter 4 actually opens. Flagged here rather than buried: **Michele should look at
whether this is still dark enough.** The light-mix mechanic is unaffected — clue detection lives in
`src/sim/lights.ts` and never reads a render brightness.

**What was rejected, and why.**

- **Re-proportioning the four auditorium pairs** to the plan's 1 : 1.31 : 1.81 : 1.27 width ratios.
  A critic measured the rendered spread as flattened (1 : 1.25 : 1.47 : 1.03) and it is a fair
  reading of the plan. But `src/sim/geometry.ts` is the ported prototype, chapter 4's keynote logic
  is written against room 8's exact rect and its aisle fractions, and CLAUDE.md is explicit that
  parity with the prototype beats an improvement. Logged as a minor for a human to take, not taken
  by a builder.
- **Moving reception, the main staircase or the registration gate** to their plan positions. The
  plan puts reception low and the main staircase further east than the prototype does, but chapters
  2 and 3 are written against those rects (the cable's target, Stephan's post, the gate). The BOF
  rooms and toilets moved because *nothing* keys off them; these did not.
- **"Tab does nothing."** Tab was already bound, and a test has covered it since the chapter port.
  What actually happened is that the critic's harness dispatched synthetic `KeyboardEvent`s carrying
  only `key`, not `code`. `src/main.ts` now falls back to deriving a code from `key`, so a scripted
  key press behaves like a real one — but the finding was a harness artifact, not a bug, and the
  README's advertised `Shift` (run) and `Space` (interact), which really *were* unimplemented, were
  removed from the controls table instead.
- **Weakening a test.** None needed it; the suite went 160 → 168, with the new assertions pinning
  the lobby band, the door bank, the keypad routing, the per-robot voices and the progress lines.

**Still open for the next round.** Craft judgment on the dark chapters was never reached (both
first-class checks failed first), Voxxy's torso is still two lobes with a visible seam rather than
one teardrop, his chest emblem is not yet the sheet's cat-face glyph, and the auditorium width
spread is logged above for a human.

**Addendum — three more bugs the verification screenshots turned up.**

Re-shooting after each fix found three defects no critic had named, all of the same family as the
two they did: *something invisible standing in front of something that matters.*

1. **The corridor columns ate the robots.** `corridorDressing` put a 3.3 m dark column on *both*
   sides of the corridor. The diorama camera sits on the +z side, so the near-side columns stand
   between the camera and the corridor floor — and because they are render-only dressing rather
   than sim colliders, a robot walks straight behind one and vanishes. Chapter 1's opening frame had
   Voxxy, Droid and the active-robot ring all behind one. The far-side shafts stay (they are what
   gives the corridor depth); the near side is now a knee-high plinth.
2. **The key light was calibrated in the wrong units.** three's lights have been physically based
   since r155, so a PointLight's intensity is in candela: the "2.6" that reads as a dim fill is
   about a twelfth of what the robots' own lamps run at. At 7.5 with a 2.0 m range it does the job
   without blowing out three robots standing on top of each other.
3. **The active-robot ring now draws over everything** (`depthTest: false`). Chapter 1 starts the
   three robots stacked 26 sim px apart along the camera's depth axis, tallest in front of
   smallest, so the marker for the robot you are driving was the first thing hidden — which is the
   one thing it exists not to be.

Also added, from `media/other-images/CAPTIONS.md` rather than from a critic: the exhibition hall's
**track spots on the ceiling beams**. Raising a chapter's ambient cannot produce the reference
photograph of the dark hall — a `#33363c` wall under 10% ambient is black, correctly — because what
makes that photograph readable is fixtures, not ambience.
