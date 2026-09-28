# GenAI notes

How "After Dark" is being made with generative AI: the tools, the method, and a log with one entry
per working session — what the agent did, what a human decided, and what was rejected and why.

The competition asks entrants to document their use of generative AI, and scores it (5 of 100). This
file is that documentation, kept as the build goes rather than reconstructed at the end, because the
interesting part is not "an AI wrote it" — it is which decisions stayed human, and what had to be
put in place before an agent could be trusted with the rest.

## In one page

*The rest of this file is the log: one entry per session, 5,000 lines of it. This is the summary.*

**What was built, by whom.** Every line of code, test and document was written by a coding agent
working in the repository: about 56,000 lines of TypeScript under `src/`, 19,000 of tests (782
acceptance tests), and 274 commits between 21 and 28 September 2026. One human, Michele, did three
things the agent never did:

- **decided** — what the game is, which way to lean when two goals pulled apart, when a rule could be
  broken;
- **looked** — every playtest note that changed the game came from a person playing it;
- **supplied the world** — the floor plans, the model sheets, and photographs of the venue and of
  the people in it.

**The method that made an agent trustworthy on this.**

- *The simulation is the only truth, and the tests are written against it.* The 2D sim is headless
  and tested, and both renderers (the 2.5D diorama and the 3D build) only read it. So "the robot
  walked through a wall" is a failing test, not an argument. The test in `tests/colliders.test.ts`
  that rejects anything drawn without a collider caught the agent's own mistakes several times,
  down to an inflatable Duke's arm.
- *Images are the specification.* Plans and model sheets go to the agent as images, measured in
  pixels and asserted in tests. When the prose and the drawing disagreed, the drawing won (the
  staircases were moved for that).
- *Builder, then critic on fresh context* ([`GAUNTLET.md`](../GAUNTLET.md)). The critic never sees
  the diff, only the running build. In the 3D phase the agent critiqued its own renders before
  asking for a human's eye, and wrote down what it found, fixed and left.
- *Frozen physics constants*, asserted by tests. They were unfrozen exactly once, by the human,
  after a playtest.

**What the human decided that the agent would not have.**

- "I vote funny, robots must be recognizable."
- Leaving the stairs where the drawing puts them, not where the notes said.
- Rescaling every speed by 0.25 after the first playtest.
- Going 3D.
- Putting real people from the Devoxx community in, by first name, from photographs.
- Giving speakers a teal lanyard and the keynote a multicolour one.

**What was rejected, and why.**

- The first sculpted Stephan was "a beanie with some stuff on top". The fix was a head whose
  hair is its own surface.
- A camera that could end up inside the robot's head.
- An attendee-grey lanyard the agent chose for the famous speakers to protect a puzzle; the human
  reversed it with a better rule.
- Many "it is solvable in the tests but not by a person" puzzles, each fixed by making the sim say
  *why* a robot is blocked, in that robot's voice.

**Honest limits.**

- YouTube could not be reached from the agent's sandbox, so music was described to it, not heard.
- Every render the agent judged was a headless software-GPU screenshot. Frame rate and feel on real
  hardware came only from the human.

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

---

## Session — 22 Sep 2026, gauntlet round 4: three critics on the running build, one fix agent

Three critics ran on fresh context against the built-and-served tree (`vite build` + `vite preview`,
headless Chromium/SwiftShader at 1600x900) and never saw a diff. Their shots are the `r2c-*` files in
`tools/progress/shots/`; the fix pass's re-verification shots are `r2fix-*`. Verdicts: floor-plan
fidelity **fail** on the factual overlay, robot appearance **fail** on Biggy, craft/playability
**fail** on composition (its four gate items all passed).

### What the critics caught, and what a measurement showed

The floor-plan critic did something previous rounds had not: it removed the global aspect as a
confound. It derived the build's own anisotropic sim↔plan mapping, anchored it on the room-5/8 outer
walls and the corridor centreline, and then measured *only per-room error*. That turned a vague "the
rooms look a bit off" into two numbers nobody could argue with — the build's outer wall is dead
straight at sim y = 64.1 and y = 634.1 at **every one of 51 sampled columns**, where the plan's four
auditorium pairs are four different depths (207 / 251 / 298 / 251 plan px, room 7 at 201); and room
6/7, which the plan makes the venue's *second largest* pair, was built 18% narrower than 4/9.

The robot critic did the same thing to Biggy: row-scan bounding boxes on the render against the
sheet's own front panel. Visible hip-and-leg zone 12.8% of body height against the sheet's ~26%;
visor band reduced to a 6 px sliver with a continuous amber hairline across it instead of two eyes.

The craft critic measured luminance histograms: the scene band (HUD excluded) is 88.9% pure black in
chapter 1, and in three of four chapters the robot the player is driving could not be found in the
opening frame at all.

### What a human decided

**Michele decides the sim rect.** The floor-plan critic's fourth finding is that the whole first
floor is stretched ~2.3x along the corridor, inverting every auditorium's footprint aspect: the
plan's numbered-room block is essentially square (728 x 745 plan px), the build's is 1270 x 560. The
cause is `W = 1900, H = 700`, inherited verbatim from `reference/poc/10-after-dark-kinepolis.html`.
CLAUDE.md says parity with the prototype beats improvements; GAUNTLET.md section 0 says `plans/*.png`
is ground truth for proportions. **Those two rules conflict here and a builder must not pick.** The
choice is (a) keep 1900x700 and accept the ribbon proportion, fixing only the *relative* room sizes —
which is what this round did — or (b) take H to ~1150, which re-runs every ported choreography and
every cable-length and fog-radius number. Not changed on a builder's initiative.

### What changed

- **`src/sim/geometry.ts` — per-room depth.** This is the one file the fix brief says to be
  suspicious about, and the suspicion was checked first: `floor1Walls()` already builds each room's
  side and back walls from `r.y`/`r.h`, and the renderer builds from the same data, so the renderer
  was reading the module correctly. The module itself held a single `ROOM_D = 230` for all thirteen
  rooms. A `DEPTH` table now carries the plan's own depths scaled so room 4/9 stays on `ROOM_D`;
  rooms 5 and 8 bulge, 3/10 are shallow, 7 is shallowest, and 6 and 7 differ from each other exactly
  as the plan draws them.
- **Room widths redistributed** by the plan's ratios (0.2014 / 0.2417 / 0.3111 / 0.2458), so 6/7 is
  the second-widest pair rather than the second-narrowest.
- **Corridor 100 → 130 sim px.** Plan ratio corridor:room-4-depth is 0.586; the build was at 0.435.
  `CY0/CY1` are not in the frozen-constants table, and the jammed-door (70 px/s) and roller-door
  (270 px/s) thresholds are speeds, so they survive a geometry change untouched — the ported
  choreographies re-ran green without edits.
- **Main staircase 64 x 88 → 150 x 118**, which is what the plan's footprint scales to and what
  `media/other-images/image-1790032674926.webp` shows filling the corridor's end.
- **Hall right wall**: four unequal holes → six regular pier/leaf bays, which is the door bank the
  exhibition plan actually draws.
- **Biggy**, whose three blocker items were his own checklist's: the visor band is now a *cylinder
  standing in the gap* between the belly's shoulder and the helmet rim rather than a cone hugging
  the belly (the old one was 4-25 mm proud of a sphere that then occluded it); the full-width
  emissive arc is gone and there are two discrete amber eyes; the belly's underside rises from 0.13
  to 0.30 m so there are real legs, a blue-gray hip skirt and a ribbed bellows knee under it; belly
  base colour moved from `#d9772a` toward the sheet's weathered `#9b675a`; arms rebuilt as tapered
  capsules under domed pauldrons with an explicit wrist between forearm and claw; the antenna cut
  from 0.5 m to 0.1 m.
- **Voxxy**: the chest emblem is a cat face again (one white silhouette, ears out of the top corners,
  dark dot eyes, orange nose) instead of a white square with grey ear-shaped boxes *inside* it — and
  the reason it read as "a torn white card" was that the whole badge sat 18 mm **inside** the lathe's
  surface, so only the ear tips and the eye dots poked out. Legs shortened from 18.6% of height to
  ~14% with an orange thigh; head raised from 29% to ~33%; the waist seam ring removed and the lathe
  profile made monotone, so the body is one teardrop.
- **Droid**: shoulder span 0.334 → 0.45 of height; the pauldron emblem conformed to the shell instead
  of standing off it on a ring, and aimed more frontally so both shoulders show one; the two copper
  slabs that hung below each shoulder (read by the critic as "a loose paperclip") and the long thigh
  streak deleted, which is most of the 3.6% → ~1.1% copper coverage the sheet wants.
- **The robot you are driving is now findable.** The active robot gets an **x-ray silhouette** — a
  capsule in its own lamp colour drawn with `depthFunc: GreaterDepth`, so it is invisible in the open
  and a coloured ghost of the right size in the right place when a pillar or a crate is in front of
  it. The per-chapter focus windows tightened by ~20%. Chapter 1's three robots were spawned in a
  column along the camera's depth axis and are now spread along the corridor.
- **Clue markers.** `GameSnapshot.clues` was already in the contract and nothing drew it. Each clue
  is now a breathing floor pip in the *mix's own* averaged colours — it says "something here", which
  is all a light-mixing puzzle should give away — and turns green when found.
- **Speech bubbles.** The per-robot blocked lines are the best writing in the build and were being
  delivered in an 18 px row at the bottom edge. A line whose text starts `Voxxy:` / `Droid:` /
  `Biggy:` now becomes a bubble with a tail over that robot's head, positioned from a new
  `DioramaScene.project()`. Impersonal lines keep the stack.
- **The briefing folds.** 60-84 words across the top of every frame for the whole chapter; it now
  folds to one line after 13 s of play, and a click pins it open or shut.
- **Light reads as light.** The sim's visibility polygon has a hard angular boundary by definition,
  so a cone's side edges stepped from black to 64% brightness across one pixel. The drawn triangles
  now taper over the outer 17% of the rim and the radial falloff is smoothstepped, and the additive
  sum is scaled by a `MIX_HEADROOM` so orange + green resolves to a yellow rather than clipping every
  channel to 255. **The polygon itself is untouched**, so every clue test in `src/sim/lights.ts` is
  unchanged — this is shading, not geometry.
- **Chapter 3 has daylight.** Its sun was already casting; its shadow camera was an 18 m box around
  the robot while the framed window is 30 m wide, so the shadows landed outside the frame. Box 30 m
  on a 2048 map, sun 2.6 → 3.6, ambient 0.45 → 0.28 and hemi 0.75 → 0.50, with a warm ground / cool
  sky split instead of one grey.
- **Chapter 1 has practicals.** Emergency exit lighting is exactly what stays on when the power is
  out; five green fittings now sit on the *first floor* (the existing exit lights were all ground
  floor and gated on `onGround`).
- **Visitors collide.** The chapter-3 crowd walked a lane grid and never asked the wall list
  anything. `pushOutOfWalls` is the same shallowest-axis push-out `src/sim/bot.ts` does for the
  robots, minus the bounce. Pawns also gained a contact shadow and a deterministic 8% height wobble.

### What was rejected, and why

- **"Tab cycles robots backwards."** It does not. `src/sim/game.ts` line 565 is
  `cur = (cur + 1) % bots.length`, and `tests/chapters.test.ts` asserts `Digit3` → 2, `Tab` → 0. The
  critic observed 0 → 2 → 1 → 0, which is exactly what two dispatches per press produces — their
  harness dispatched the same `KeyboardEvent` on both `document` and `window`, and the second one
  bubbles into the single `window` listener. Harness artifact, not a bug. (The same accusation was
  raised and rejected for a different reason a round ago, which is worth saying out loud: a critic
  driving the game through a synthetic harness is measuring the harness too.)
- **The 2.3x corridor stretch** — escalated to Michele, above. Not a builder's call.
- **The hall's chamfered corner** (minor, same finding as the scalloped wall). The repeated-bay door
  bank landed; stepping the wall back at the plan's diagonal corner is renderer work in
  `src/render/venue/ground.ts` and was not a one-liner, so it is logged rather than half-done.
- Nothing else. **"Unexplained flat cream ellipses at head height"** (minor) looked like a
  candidate for rejection and turned out to be exactly right: re-shooting chapter 1 put them in the
  same corner the critic photographed, and they are `pendant()` in `src/render/venue/props.ts` — a
  bare 0.14 m cylinder over the foyer bar, hung at 2.5 m from nothing, with no drop rod and nothing
  to shade. It is now a domed shade on a rod up to the ceiling with a warm emissive mouth, so a
  lamp looks like a lamp. Worth recording as a method note: this finding was one line long and had
  no measurement attached, and it was still a real defect.
- **Weakening a test.** None was weakened. Four assertions were *corrected*: `tests/geometry.test.ts`
  asserted `r.h === ROOM_D` for every room and `CY1 - CY0 === 100`, which only asserted that the
  prototype's numbers had not moved — it is now replaced by per-room depth ratios and width shares
  measured off `plans/devoxx-rooms-stairs-annotated.png`, plus a check that no room leaves the sim
  rect. `tests/venue.smoke.test.ts` hard-coded `300`/`400` for the corridor band in two places and
  now imports `CY0`/`CY1`. The suite went 168 → 170 and is green.

### Deferred, with reasons

Four minors were left rather than half-done, and they are listed so the next round does not have to
rediscover them: the hall's **chamfered corner** (renderer work in `src/render/venue/ground.ts`, not
a one-liner, and the repeated-bay door bank it shares a finding with did land); **emissive bloom on
the robots' eyes** (needs a post-processing pass, which is a piece of its own rather than a fix);
**Droid's helmet shape and forward hunch** (his silhouette otherwise passed, and re-proportioning a
head that reads correctly is how a passing robot becomes a failing one); and the **foreground
bracketing** half of the composition blocker — a vignette and a tighter frame are not the same thing
as a pipe or a railing in the near ground, and pretending otherwise would be the scope creep the
brief warns about.

### Still open

Craft judgment against Machinarium was reached this round for the first time and it is unsparing:
*"ours are camera positions, not compositions."* The framing critique — foreground bracketing, the
floor plate running off-frame at an arbitrary diagonal, empty quadrants — is only partly answered by
zooming in, and is the biggest remaining gap. Neither first-class check is marked passing here; an
independent critic decides that next.

**Addendum — measuring the "88.9% black" finding instead of arguing with it.**

The craft critic's darkness number is the only finding in this round that a fix can be checked
against directly, so it was: the same luminance histogram (L < 12 over the scene band, HUD excluded)
was re-run on the verification shot after each attempt. Two things came out of that loop that were
not obvious beforehand.

1. **A vignette makes the picture better and the metric worse.** Fading the floor plate's edge is
   exactly what the critic asked for — "cut or fade the floor plate at a deliberate edge instead of
   letting it run out into black" — but a gradient that reaches near-black at the corners *adds*
   pure-black pixels. The vignette's darkest stop was pulled back from 78% to 52% opacity and its
   clear radius widened, which keeps the framing read without manufacturing the very thing the
   measurement is counting.
2. **Ambient was the wrong knob; the hemisphere's GROUND colour was the right one.** An
   `AmbientLight` lifts every surface equally, so raising it washes the lit pools out as fast as it
   reveals the walls. A `HemisphereLight` shades a vertical surface with the midpoint of its sky and
   ground colours — and chapter 1's ground colour was `#05060a`, near-black, so the venue's own
   `#33363c` walls were being shaded *down* toward invisibility by the very light meant to reveal
   them. At `#12171f` the corridor's walls, columns and vaults read as dark shapes without touching
   the lamps' contrast.

The number went 88.9% → 83.2%, which is honest progress and not a pass: the frames are still mostly
dark, by design and by material. What changed is that the dark part is now *legibly a building*.

Chapter 3 answered its own measurement more cleanly. The critic sampled the floor below a booth at
x = 800, y = 672..706 and got `60` eight times — no shadow anywhere. The same sample on the
verification shot reads `62, 62, 62, 62, 22, 22, 22`: a cast shadow with an edge in it. The open
floor at y = 600 reads 59-66 across the same span that used to be a constant 60.

---

## Round 3 — floor-plan fidelity, the signage half

**What the critic actually failed us on.** Geometry, proportions, doors, both staircases, hall and
lobby had passed. The numbered Zaal signage — an explicit Stage 1 pass condition — had not: numerals
clipped by the corridor soffit, room 7 lost behind the tensile canopy, and the four near-wall panels
built facing away from the fixed camera.

**What the agent did.**

1. Replaced the eyeball check with a measurement. Before touching any geometry it raycast every
   numeral panel toward the camera, in node, through the same `buildVenue()` the game uses. That
   printed the fault list in one pass and named each blocker: `overhead` (the vault) on 7/8/9/10,
   `rake-10` and `rake-7` (seat rows laid out *through* the corridor wall in the plan's three shallow
   houses), `stair-main` on 7, and `zaal-sign-N` on 3/4/5/6 — the near panels were occluded by their
   own backing slab because they had been built facing -z.
2. Fixed the causes rather than nudging the panels. The corridor vault was a 0.9 x 0.96 m bar
   floating at head height a metre out into the corridor; it is now a plate springing off the far
   wall head and raking up at 0.75 rad, which is steeper than the steepest chapter's sight line, so a
   ray leaving a panel's top edge can never catch it again. The seat-row constant now clamps to the
   room's own depth. Room 7's panel moved to the other side of its door, off the staircase.
3. Cut the near corridor wall down to a 1.15 m parapet with a painted section cap. That is what makes
   the near-side panels readable at all, and it is also why the main staircase — the venue's
   signature image, and until now visible only in the top-down debug view — is in the chapter 4 frame.
4. Wrote the assertion down. `tests/venue.smoke.test.ts` now checks, for all eight rooms and at every
   chapter pitch, that the numeral faces the camera and that a grid of rays across its face leaves
   the venue unobstructed, plus that nothing overhead intersects the panel's box and that the panel's
   frontal area beats the poster box beside it by 1.5x. 170 tests -> 179, none weakened.

**A human decision this round did not get to make on its own.** The near rooms' numerals cannot be
mounted on the corridor face and also be seen: the diorama camera is fixed on the +z side, so that
face is structurally invisible. The agent chose the sectional-model convention — mount them on the
camera-facing return of the same panel — rather than inventing a second camera or a rotating view,
because GAUNTLET.md fixes the diorama camera per chapter and the prototype has no answer either.
That choice is documented at the top of `src/render/venue/signage.ts` and is the one place here where
world-truth was traded for legibility.

**Rejected.** Raising the vault straight up: it clears the panels but then eats a band out of the far
rooms' interiors at every pitch, and re-introduces the clipping at 33 degrees where the sight line
climbs faster than a gently raked plate. Fading the near wall dynamically when it occludes: a
standard trick, but a hard cut costs no per-frame work and reads the same from a camera that never
moves. Shrinking the numerals to fit under the old soffit: that is the loosening the brief forbids —
it would have made the test pass and the picture worse.

## Round 3 — robot appearance fidelity (Voxxy and Biggy)

**The critic's verdict this round was a factual fail on two of the three robots**, measured off
flood-filled silhouettes of the model sheets against the in-game portraits: Voxxy 30% too tall for
his width (sheet 1.54, build 2.01), a neck 4.5x too long, arms tapering the wrong way, a visor
wrapped edge-to-edge over the side ports; Biggy's belly down to 0.70 of his height where the sheet
is 0.98, a dome 27% too wide to be overhung by it, missing paired rivet ports, arms that had taken
the belly's bulk, and two geometry defects in the lower body. Droid passed.

**What the agent did.** Re-derived every proportion from the sheets by measuring the panels rather
than by eye — cropping `robots/*.png`, flood-filling each front view and reading a per-row width
profile — and then rebuilt `voxxy.ts` and `biggy.ts` to those numbers, holding the frozen
`ROBOT_HEIGHT_M`: Voxxy's head went to 0.58 of his height across and his neck to a 0.038 m stub, his
arms became bowling pins widest at 78% of their length with the white bands wrapping the club, the
visor became a rounded-oval panel inset in the front face (a new `ovalPatch` primitive in `rig.ts`)
with a dot-matrix screen and two large glowing bar-eyes on it, and the lower leg's palette was
turned back the right way round. Biggy's belly became a 1.35 m lathe — 0.93 of his height, widest
low — under a 1.03 m dome, 0.76 of it; his arms became low-profile slabs whose outer face lands
exactly on the belly's widest point; the meridian panelling became latitude seams; the boots became
the darkest thing on him. Droid got only what the critic asked: the helmet's banding stripes and the
rectangular brow shelf are gone, replaced by one smooth oval faceplate with the eyes set into it.

**Two real bugs fell out of the measuring**, both of which had been shipping unseen:

1. `latheProfile` wound its triangles in the order the points arrived, so a profile written top-down
   produced an inside-out shell. Back-face culling threw the surface away and the camera saw the
   inside of the far wall — which for a convex limb looks almost right, and is why Voxxy's white arm
   bands had been invisible inside his arms. `latheProfile` now normalises the point order.
2. `gait.ts` applied its crouch in metres. Voxxy's hip-to-ankle is 0.13 m and his profile's crouch is
   0.045, so a third of his leg: the two-bone IK folded the knee past pi and the smoke test caught
   it as a 4.6 rad thigh. The crouch is now capped at a fraction of the robot's own leg length.

**The portrait camera was fixed too**, because a side-by-side check is only fair if the frames are.
It now fits by projecting the rig's own surface (not a bounding box, whose corners left a fifth of
the frame empty), recentres so the margin is even top and bottom, keeps the camera's eye at the
robot's face height, uses a 16-degree lens instead of 30 so the shot is near-orthographic and what a
critic measures is the model rather than the lens, and re-fits for the first two seconds while the
gait settles the rig into its stance — a 0.1 m crouch was 5% of Droid's frame and was most of why he
looked smaller than the other two. All three now fill 93% of the frame height.

**A human decision, kept.** Biggy has two amber eyes inside his visor band; the sheet's band is blank
in all nine views. Michele's call is that gameplay legibility wins — the player has to see which way
the heaviest robot is facing — and the reason is written at the deviation in `biggy.ts`.

**Measured after the fix**, the same way the critic measures (flood-fill against the flat page
background, per-row min/max x, aerial excluded): Voxxy 533 x 836 px, aspect 1.57 against the sheet's
1.54; Biggy's belly 744 px against 802 px of body height, 0.93, and his dome 571 px, 0.77 of the
belly. Tests 170 -> 181, none weakened: the new ones assert Voxxy's aspect, his neck as a fraction of
head width, the direction his arms taper, and both of Biggy's mass ratios, so this cannot drift back.

**Rejected.** Making Biggy's belly 0.98 of his height to match the critic's headline number exactly:
that number is the sheet's whole silhouette including the arms, and the sheet's own belly measures
0.82 — 0.93 with the arms tucked inside it is the honest reading of both. Keeping the arms clear of
the body so they always show: the sheet's arms disappear behind the gut at its widest, and that is
precisely what makes the gut read as the silhouette.

## Session — "The network closet", chapter 2 (builder agent)

**What a human decided.** Michele approved `docs/gameplay-additions.md` §2 on paper — the WiFi
password beat, built on Biggy's inertia and Droid's brace rather than on a second light-mixing
puzzle — and asked to see it running. He also set the two hard constraints the agent worked
inside: `src/sim/constants.ts` stays frozen, and the badge printer gains a third prerequisite
rather than losing the two it had.

**What the agent did.** Added the cam-lock wheel on a router cabinet in the technical room
(`GF.cabinet`, `src/sim/chapters/ch2-expo.ts`), rendered the cabinet as venue geometry and the
turning wheel from the snapshot, rewired the printer to power + cable + router, and added six
tests. No new physics constant: the beat is assembled entirely out of numbers that were already
frozen — Biggy's mass and 0.35 drag, `BRACED_MASS`, Voxxy's 0.38 rad cone — plus fourteen
chapter-local tuning values that describe one prop in one room.

**What was rejected, and why.**

1. **A horizontal capstan wheel** was the physically cleanest reading of "a robot turns a wheel":
   the rim is a circle in the 2D sim and the tangential component of the impact spins it. It was
   dropped because it breaks the rule the brief is explicit about — a robot *running past* a
   capstan spins it, and chapter 1 already fixed exactly that bug for the jammed door by
   projecting onto the speed *into* the target. The wheel is therefore vertical, on the face the
   diorama camera looks at, and the torque is `speed into the face x lever arm off the hub`.

2. **Letting the wheel simply coast to a stop** was the obvious first implementation and it was
   wrong. Measured: a wheel that decays to rest lands on a uniformly-distributed angle, so a solo
   Biggy opens the cabinet by luck roughly one ram in twenty-five and then waits half a minute to
   find out. "Realistically cannot" was not good enough — the beat needed to be structurally
   impossible alone. The fix is a detail every valve wheel actually has: a **sprung detent pawl**,
   with its eight rest positions offset half a step from the eight index marks. A wheel nobody is
   holding always walks itself to a detent, and a detent is 22.5 deg from the nearest mark against
   a 9.2 deg tolerance. `tests/chapters.test.ts` asserts it over ten different run-ups: zero
   openings, and every resting angle is a detent.

3. **A three-robot success condition** — requiring Voxxy's beam to be on the mark at the instant
   the cam seats — was considered and dropped as a hidden rule. The light gates *information*
   instead: the mark's angle is simply unreadable in the HUD and unlit in the scene until Voxxy's
   cone finds it, which is the same constraint expressed as something the player can see.

4. **A password the player types, or carries as an item**, was ruled out by Michele in the design
   doc and stayed ruled out. It is a card, once, with the joke on it.

**What is known to be weak.** One clean brace window per heave for a passive player, and a ~19 s
coast to get there. Tap-braking (E on, E off) is the answer and the game currently only hints at
it in a toast. See the builder's report.

---

## 2026-09-22 — the ground-floor lobby, rebuilt from Michele's plot (+ the swallowed keypress)

**What a human decided.** Michele playtested round 3, said reception, the coatroom, the BOF rooms
and the toilets did not match the floor plan, and then plotted every block himself on a calibrated
tool rather than letting another agent re-read the plan. Those numbers
(`docs/ground-floor-lobby-fix.md`) are the input to this session; three of his findings could not
have come out of a measurement at all:

1. **The hall's right edge is not a "scalloped wall with four openings".** That was the
   prototype's invention and it had survived into the build unquestioned — including one round
   that "improved" it into six regular door bays. The real edge is a concrete wall across the
   upper stretch and the small staircase across the lower one, and that staircase is the ONLY way
   between hall and lobby.
2. **There is a level change**: about 0.5 m, 5-7 shallow risers. Nothing in the game modelled
   ground-floor height before.
3. **Only the left-hand doors are open for Devoxx**, so the crowd enters on a 136 px front next
   to reception — not along the whole glazed wall, and not off the canvas edge.

**What the agent did.** Moved every lobby rect in `src/sim/geometry.ts` onto the plotted numbers
(coatroom, reception desk below it, main staircase, the left-hand doors, the small stairs, the
concrete wall, BOF, toilets); replaced `GF.openings`' four fictional gaps with the one stepped
threshold; built each lobby block's walls INSIDE its own measured footprint so nothing spills over
the plot; added `LOBBY_RISE_M` and `groundRiseM()` and built the exhibition level as two levels
with the flight between them (`src/render/venue/ground.ts`); moved Stephan, the soup drop and the
chapter-3 crowd to the new entrance, and rewrote their tests to assert the new route. Also fixed a
deterministic input bug an independent verifier root-caused: `game.key()` dismissed a chapter card
and returned, so the first real keypress of chapters 2, 3 and 4 was silently swallowed (pressing
`2` for Droid did nothing, every time, on every seed) and the end card's own "R to play again"
needed two presses.

**What was rejected, and why.**

1. **Keeping the six-bay door bank as dressing over the new solid wall** — it looked good and it
   was a lie. Michele's plot and `plans/exhibition-floor.jpg` both draw a run of long steps there
   and a thick wall above it; the door bank went, and with it a whole rendering function.
2. **Modelling the 0.5 m as a height field the sim reads.** The sim is 2D and parity with its own
   tests is the acceptance criterion, so the threshold stays an *opening* in the hall's right edge
   and the rise is venue data the renderer reads (`groundRiseM`). This is a diorama, not a
   platformer.
3. **The wheelchair ramp** the plan labels beside the steps. Michele's concrete wall occupies the
   stretch it was drawn in, and his plot wins over our reading of the plan, so the invented ramp
   rect was deleted rather than nudged somewhere plausible.
4. **Loosening the chapter-2 cable bounds.** The run to the printer got shorter (~1208 px against
   the frozen 1480 reel, where ours measured 1345) purely because reception moved 280 px down the
   lobby. The lower bound stayed at 1200 and the upper bound was *tightened* from 93% of the reel
   to 85%, with the reason written into the test: the reel is frozen, the venue is not.
5. **One shared route for the crowd.** The first version walked all 36 visitors through the same
   waypoints, and "do not walk into the back of the person in front" turned the single threshold
   into a stationary conga line — 26 of 36 still in the lobby after 45 s. Each arrival now takes
   its own lane across the 22 m flight.

**What is known to be weak.** `src/render/scene.ts` still draws robots, people and chapter props
on one flat floor plane per storey, so anything standing in the LOBBY is drawn half a metre low.
The data it needs is exported and documented (`groundRiseM`); applying it is a one-line change in
a file this session was not allowed to touch.

---

## Session — robot appearance fidelity, round 4 (first-class check #2)

**Brief.** Check #2 (robot appearance) was the last red gate. An independent verifier had
flood-filled both the model sheets and the in-game portraits and listed six measured failures —
two on Biggy, four on Voxxy — and reported that part of what the previous round claimed to have
fixed was measured as still broken. The instruction for this round was therefore to verify by
measuring, not by believing an edit landed.

**What the agent did.** Rebuilt the verifier's measurement rather than trusting the eye: a
flood-fill of the flat page background, largest-blob selection, per-row min/max x, and colour
segmentation of the visor and the eyes. Run against `robots/*.png` first, so every target below is
a number off the sheet and not a taste.

1. **Biggy's ankle bellows** — the previous round moved them to the ankle pivot and they were
   still detached. The real cause was two files away: `gait.ts` capped the standing crouch as a
   fraction of leg length, and 15% of a 0.30 m leg folds a two-bone knee **63 degrees**. Biggy
   stood permanently in a deep crouch, and rings on a shin swung that far out of the leg's line
   photograph as a crescent hanging off nothing. Replaced with `standBend`, a maximum knee ANGLE
   converted back to a sag by the law of cosines — exact at any proportions — blended back to the
   full crouch as the robot starts walking, because a straight leg cannot stride.
2. **Biggy's far arm** — the gut was 0.93 of his height. Measured off the sheet it is **0.82**;
   0.97 is the figure's TOTAL width, where the ARMS are outside the gut. A belly of revolution
   1.35 m across swallows anything hanging inside its radius, so the far arm vanished into it. Gut
   narrowed to the sheet's ratio, arms moved out and forward, dome narrowed with it to hold the
   sheet's dome/belly of 0.80.
3. **Voxxy's ears** — one was white shell, the other plain orange. The right ear's cap was yawed
   by `PI + 0.45` instead of `+0.45`, swinging it to the back of the head. Rebuilt as a cap of
   revolution tilted outward, which has no azimuth left to get wrong.
4. **Voxxy's visor, eyes and neck** — visor 0.583/0.579 of the head box against the sheet's
   0.683/0.655, eyes at aspect 2.4 against 1.5, neck 6.3% of the head width against 4.6%.

**Measured after, the same way (portrait at warm=120):** visor **0.693 / 0.689** (sheet
0.683/0.655), eye aspect **1.5-1.9** (sheet 1.5-1.6), neck **4.3%** (sheet 4.6%), ears **17.4% vs
19.9%** near-white (was 1.3% vs 81.8%). Biggy: both arms complete limbs and both bellows sleeves
joined to shin and boot at warm 0, 60 and 120.

**Tests.** 186 -> 211, none deleted or loosened. New: every bone's shell must touch the shell of
the bone it hangs from (catches detached geometry); each side's subtree must be the other's mirror
in mesh count, materials AND world position (catches the ear — same meshes, same materials, wrong
transform); each arm must clear the gut *as the 34-degree portrait camera projects it*, which is
the projection that hid the far arm; Voxxy's visor and neck as fractions of the head box.

**What a human decided.** Michele's standing calls were kept: Biggy keeps the two amber eyes the
sheet does not have, and the frozen physics constants were not touched.

**What was rejected, and why.**

1. **Pushing Biggy's arms out far enough to clear a 1.35 m gut.** It needs 1.65 m of shoulder
   span — grotesque, and it would have made the arms the silhouette. The sheet says the gut is
   narrower than we had it; the sheet won.
2. **Leaving the smoke test's `belly / height > 0.9`.** It was written from a misreading of the
   sheet (total width taken for the gut's) and it was actively holding the bug in place. Rewritten
   to the flood-filled numbers and made **two-sided** — 0.78-0.88 for the gut, 0.93-1.04 for the
   whole figure — so neither the old 0.70 build nor the 0.93 one would pass now.
3. **Restructuring Droid**, which passes. Only the craft note was taken: the copper at hips and
   elbows was a bright saturated pad, so the cap went back to graphite and the copper is the thin
   ring round its edge, darker and rougher.
4. **Zeroing Voxxy's idle head sweep for the portrait.** Rejected as special-casing the judge's
   camera; the amplitude was halved instead (0.6 rad had his face 34 degrees off camera for most
   of the idle, costing a third of the visor's apparent width), which is a real improvement in
   play as well.

**What is known to be weak.** Biggy's boots still read as a block on a flat tray rather than the
sheet's moulded sole, and the eye glow is stepped geometry — four ovals and a lit-dot halo — not a
bloom pass, so at very close range the steps are findable.

---

## Round 5 — the likeness gate went to the human

**Why it was escalated.** `GAUNTLET.md` says the two first-class pieces do not get to cap out
while still factually failing, so after a fourth failing round the robot-appearance gate went to
Michele instead of being shipped or quietly passed. He was given the three model sheets beside the
three in-game portraits, captured headless from the published build, and asked to rule.

**What a human decided.** Not a pass. His words: *"They are all similar to the model, but need much
polish. I want them more adherent to the model sheet. That might come later, but is important."*
He also set the quality bar explicitly — the organisers' own reference demo at
`game.devoxx.be/references/?robot=...` — and accepted that some divergence from the sheet is fine
there too, so the target is **comparable craft**, not pixel identity.

His defect list, in his priority order, which supersedes the automated findings as the brief for
this round:

| robot | what he wants fixed, most important first |
| --- | --- |
| Voxxy | hands, eyes; then details, legs, general polish |
| Droid | shoulder, face, torso |
| Biggy | belly, helmet, arms, trousers |

Worth recording that the automated gate and the human agreed on exactly one item — Voxxy's eyes —
and that the human's list is otherwise wider and softer than anything the checker was measuring.
Four rounds of a numeric check never once flagged Voxxy's hands, because nobody had written a
measurement for them. That is the honest limit of the method: it verifies what it was told to
verify, and a human eye on the render is what finds the rest.

**A process failure this round exposed.** Round 4's verifier could not reproduce the sheet targets
it had been handed — round 3 reported Voxxy's sheet eye height as ~43% of the visor, round 4 got
19-31% at every threshold it tried. Each round had been re-measuring the *render* while inheriting
the previous round's *sheet* numbers, so at least one fixer spent a round tuning to a figure that
does not exist in the reference art. Fixed by re-deriving every sheet target from scratch with an
agent forbidden to read the code, the game, or any prior round's numbers, and required to report
each ratio as a range across a threshold sweep and to mark anything that swings too much
UNUSABLE rather than quote it.

---

## Round 5 continued — three craft passes, and what the human's eye caught that no check did

**What the agent did.** One agent per robot, one file each, briefed from Michele's own defect list
first and the measured targets second. Then two follow-up passes when he looked at the results:
Droid's face rebuilt from our sheet, Voxxy's surface detail, Biggy's helmet/arms/legs.

**What a human decided.**

1. *"I vote funny, robots must be recognizable."* Recorded in `CLAUDE.md` as a standing call,
   because it settles which way to lean every time a measured ratio and a character read pull
   apart, and an agent that does not know it optimises the wrong one.
2. The organisers' demo is **the bar for quality**; the model sheets remain **the authority on
   appearance**. Where they disagree the sheet wins.
3. Droid keeps the hoop shoulders — invented for the demo, absent from the sheet, and Michele likes
   them — while his face goes back to the sheet's skull. Fun in the silhouette, recognisable in the
   face.

**What was rejected, and why.**

1. *A whip antenna and a flared cone brim on Biggy.* Both came from the demo via a brief of mine
   that described the demo instead of our sheet. Removing 0.17 m of cone-and-gasket is what let the
   dome read correctly — it had been the right width all along.
2. *Pauldron caps, ring joints and lens discs on Biggy's arms.* Same origin. The sheet has one
   smooth slab and a cuff; the correction was to make the arm **simpler**, not busier.
3. *Voxxy's visor dot-matrix.* It **is** on the sheet — an earlier note in this file claiming we
   invented it was wrong — but at play scale it read as orange speckle and flattened the glass.
4. *Eye area as a fidelity target.* Formally unusable: a soft glow's measured area sweeps 0.004 to
   0.081 on threshold alone. Replaced by centre-to-centre distance, stable to ±0.003.

**Four of my own briefs were corrected by measurement, which is the honest headline.**

| I asserted | the measurement said |
| --- | --- |
| Droid's sheet eyes sit high, in the upper third | 0.535 of head height below the crown — the hero panel only looks higher because the head is pitched forward |
| Voxxy's ears are too small | 0.188 of head width against the sheet's 0.185, already inside the band |
| Biggy's dome is too narrow | already the right width and aspect; the problem was the brim hanging beneath it |
| Biggy's legs are a quarter of his height | 13% — I had measured to the drop shadow rather than the sole |

Each was caught because the brief said *"if a measurement disagrees with your edit, believe the
measurement"* and each agent was told to report disagreements rather than split the difference. The
pattern in all four is the same: asserting from a glance at a sheet instead of measuring it. The
method that fixed it is cheap and worth stating — **the person writing the brief is not exempt from
the rule the brief imposes.**

**What the human caught that no automated check did.** Michele's list named Voxxy's *hands* first.
Four rounds of numeric checking had never flagged them, because nobody had written a measurement
for hands. A checker verifies what it was told to verify; the gap between that and "does this look
right" is exactly the gap a human eye fills. The same is true of his reading of Droid — *"more
similar to the 3d view than to the Model Sheet"* — which no ratio in the table would ever have
expressed.

**Bugs found by looking, that no test could catch.**

- Voxxy's **left head pod tapered the wrong way**: geometry built with a hard-coded rotation inside
  a mirrored loop. Both bounding boxes mirror while the shapes differ, so the mirror-symmetry test
  passes. This class is invisible to every test we have.
- Biggy's **knee sawtooth** had two causes, and the second — a knee ball whose radius exactly
  equalled the shin cone's radius there, so two tessellations of one surface z-fought — would have
  survived the reshape that fixed the first.
- `rig.ts`'s **`weather()` brightens dark materials**: it writes vertex colour as a ratio against
  the material's own colour, so a rust tint on a near-black part divides a light colour by a dark
  base and "wear" comes out as white flakes.

**What is known to be weak.** Voxxy's detail pass is honest that at 25-60 px in the chapters almost
none of it resolves — roughly 4,100 triangles buy a better portrait and close to nothing in play.
Biggy's lower body is a standing workaround for a belly that is a true sphere where the sheet's
tucks in below the equator. And Droid's own green floor lamp blows his face out completely in
chapter 1, so the features of a whole round are invisible in the chapter where he is the
protagonist — which is a lighting problem, not a model one, and is being handled separately.

## Round 6 — the frozen physics constants were unfrozen, once, on the evidence of a playtest

**What a human decided.** Everything that matters here. Michele played chapter 1 and wrote three
complaints in his own words — Voxxy "too fast, it's almost hard to control"; "it's really hard to
stop a character pointing the light in the right direction"; "droid is pushing Biggy just by coming
close, with no contacts". He was then offered the choice of fixing them separately or rescaling the
world, and picked **"Full rescale: speeds and radii."** He also set the target band (Voxxy 4–6 m/s)
and the constraint that the chapters must not turn into a walking simulator. The agent chose the
factor inside that band and did the arithmetic; it did not choose to open the constants.

**What the agent did.** Applied one factor, `SPEED_SCALE = 0.25`, to every px/s quantity in
`src/sim` and to nothing else: the three `max` values, the two door thresholds, the stop-snap and
heading floors, the mount speed, the push and crate forces (an acceleration is a velocity per
second), the cutscene walk, the crowd's walking pace, and seven chapter-local thresholds nobody had
listed. Measured the three collision radii off the rigs the renderer actually builds, instead of
inheriting a guess. Deleted `HUD_PX_PER_MPS`.

**The discovery that changed the shape of the job.** The brief framed the rescale as a pure unit
change — "only the unit changed, so every choreography is preserved exactly". It is not, and the
measurement said so within an hour: **lengths did not move.** Rooms are the same size, so dividing
every speed by four multiplies every traversal time by four, and anything the game measures as a
*clock against distance travelled* silently changes difficulty. Four of them were load-bearing: the
soup's 150 s cooling timer, the keynote crowd's 14 s + 80 s arrival, the Regex Racing 5 s lap, and
the window a catering queue stands aside in. Left alone, the Regex Racing swag becomes unwinnable
and chapter 4 becomes unfinishable — a silent difficulty change dressed up as a unit conversion.
They now carry `TRAVEL_TIME_SCALE = 1 / SPEED_SCALE`, which is the same rescale seen from the time
axis rather than a second free parameter.

**The brief's headline claim was falsified by running it.** "`tests/chapters.test.ts` must all still
pass without being touched. If one fails, your `k` broke a relationship — find it rather than
editing the test." Six failed, and none of them was a broken relationship. Five were the *pilot*:
lines like `heaveWheel(g, x, steps = 50)` and `steps(g, 70)` are distances written in the old top
speeds, and a robot that is four times slower does not reach the wall it is supposed to hit. One was
a robot hand-placed 22 px from Biggy, which the old 1.04 m + 1.36 m radii plus 12 px of mount slack
counted as "next to him" from half a metre away. The right answer was to recalibrate the pilot and
say so loudly, not to pretend the suite was untouched — every `expect` is the one it was, with a
single documented exception, and the header of each test file now says what moved and why.

**The one assertion that genuinely changed, and it changed because the fix worked.** The chapter-2
cable run is measured along the path Voxxy *walks*. At 290 px/s she overshot every corner the test
pilot steered her round; at 72.5 she tracks them, and the identical route measures 1161 px instead
of 1194. The lower bound moved from 1200 to 1140 — which is a *tighter* margin under the measured
run than the old bound was, because the old run wandered. That is Michele's complaint about aiming,
visible as a number.

**What the agent got wrong before measuring.** It assumed the radii would collide with
`tests/robots.smoke.test.ts`'s demand that Biggy's silhouette be 0.93 of his height — the brief
warned about it explicitly. Measured: Biggy's widest point about his own axis is 0.722 m, the
silhouette test needs a half-width past 0.674 m, and the collision radius is now 0.72 m. The two
constraints are the same arm corner and they agree. No assertion had to be loosened, and the warning
in the brief was about a conflict that does not exist.

**What is still weak.** `gaitSpeed` in `src/render/robots/index.ts` exists for the same reason
`HUD_PX_PER_MPS` did — it saturates the leg cycle so a 23 m/s robot does not look like a blur.
At 5.8 m/s it is barely doing anything any more and is probably now removable, but the rigs belonged
to another agent this round and were left alone. The cutscene walk speed constant is dead: a
concurrent change made cutscenes duration-driven, which is the better answer, so `CUT_WALK_SPEED`
is now scaled, asserted and unused.

## 23 Sep 2026 — chapter 2's playtest batch: nine notes, one recurring cause

**What the human did.** Played chapter 2 and filed nine short notes, reproduced verbatim in
`docs/playtest-notes.md`. Three of them named a specific object ("cable rack", "the breaker",
"this yellow thing"), two named a feeling ("gets darker, not lighter", "something is flickering")
and one was a question ("I don't get how to enter the reception"). Nothing was diagnosed for the
agent, and one of the diagnoses he *did* offer turned out to be half right in a way that mattered.

**What the agent did.** Measured before touching anything, in three ways.

*A flood fill, for "robots can go through staircase and objects".* The brief said not to guess, and
guessing would have found the staircases and stopped. A throwaway probe (`tests/probe-*.test.ts`,
gitignored, excluded from the suite) flooded the walkable area from the chapter's own start position
and reported the fraction of every drawn footprint a robot centre can occupy. **100%** for both
secondary staircases, eighteen structural roof columns, four lobby columns, two planters and the
network rack — thirty-seven objects, not two. Every one of them was built inside
`src/render/venue/ground.ts`'s own loops, which the sim never sees. The fix is architectural rather
than local: the geometry moved into `src/sim/geometry.ts` and the renderer now draws the sim's wall
list, so there is no second copy to drift. This is the third round in a row that this exact shape of
bug has produced a playtest note (chapter 1's seat rows, chapter 1's cinema barriers, now the hall),
which is itself the finding.

*Pixel values, for "after switching the room gets darker".* The measurement was a driven build
shot twice, breakers out and breakers in: mean scene luminance **12.5 → 5.1**, 90th percentile
**42 → 8.8**. The switch really did make the hall three quarters darker. The same two shots on the
fixed build read **9.3 → 24.0** and **8.8 → 58.3** — the same measurement, used twice, once to find
the bug and once to prove the fix.

*The camera, for "cable rack is not visible at all".* Not a missing object. At chapter 2's 31°
pitch, the technical room's south side is 3.8 m of building shell standing four metres in front of a
1.95 m cabinet; the rack's head cleared the wall top by 13 cm. The number is what chose the fix
(a 0.4 m plinth) over the alternatives.

**Where the human's own diagnosis was half right, and where that matters.** He guessed the darkness
was "the robot's light being switched off". It was — `ch2-expo.ts` stopped casting light polygons
the instant `power` went true, and the renderer drives each robot's spotlight *and* its key light
from that list, so nine lights went out at once. But that was only half: nothing on the renderer's
side had ever heard of the breakers, so no house light came up either. Fixing only the half he named
would have left the hall no brighter than before the switch. Both halves are fixed and the note is
recorded that way.

**What was rejected.** (a) Flipping the secondary staircases' climb direction was nearly skipped as
"not what he complained about" — the plan settles it: the doors are in the shaft's north end and the
ascent arrow runs away from them, so an enclosure with the doors on the far side would have been a
knowingly mirrored staircase. It was flipped, and the chapter's start position moved out of the
doors with it. (b) Making the rope-line stanchions colliders: a velvet rope on a 26 cm post is not
something a player expects to be stopped by, and a 4 px collider in the middle of the concourse is
an invisible snag rather than an obstacle. Left walk-through, on the record. (c) Redesigning the way
into the reception: a flood fill showed the route was always there and always the only one, so the
change is a sign over the steps, not a new door.

**What it cost, measured rather than assumed.** `buildLights` is ~95% of a chapter-2 sim step and
scales as (lights x rays x walls). This change took the hall from 63 walls to 100 and a concurrent
change took every robot from one light to two: **0.9 → 1.83 → 2.63 ms per cast**. Two headless pilot
tests needed their wall-clock budgets raised as a result. That is a real regression, it is nobody's
bug, and it is written down where the next agent will find it before adding a third thing to that
path.

**Four test edits, all declared.** Four assertions in `tests/chapters.test.ts` were *not* touched;
what moved was the pilot — two hand-written waypoints that are now inside a collider, and two
wall-clock timeouts. The rule the previous round arrived at held up: recalibrate the pilot loudly,
never the expectation quietly.

## 2026-09-23 — two moments that were too quick to read (agent, from Michele's chapter-1 playtest)

Michele, playing chapter 1: *"ah when biggy pushes the door in chapter 1 there should be some kind
of animation. Shutter, or slide open or something. Also the animation in the chapter 1-2 passage is
too fast and too dark, and I'd zoom more."*

**The door did not open, it ceased to exist.** `onHit` set `jamBroken` and called `removeWall(jam)`
in the same frame, and `props()` then stopped emitting the door at all — so the biggest physical
thing the player does in the chapter was a door that blinked out between two frames. The sim now
keeps the door in the prop list with a clock on it: `Prop.progress`, a normalised 0..1 documented as
"how far through its own transition this prop is", ticked by `JAM_FALL_TIME = 0.55 s` in
`ch1-night.ts`. The **collider still goes on the frame of the hit** — the player earned the passage,
and a door that is visually open but physically shut is a worse bug than the one being fixed.

*Human decision to make, not the agent's:* which animation. Michele offered a shutter, a slide or a
swing. The agent measured the alternatives against the diorama camera and chose none of them: cinema
E is on the bottom row, so its doorway FACES the camera, and a leaf on a vertical hinge is broadside
at 0° and an edge-on sliver at 90° — the same trap `drawCabinet` already stops its leaf at 58° to
avoid. A shutter or a slide keeps the leaf upright, which reads as *opened*, not as *hit*. It now
tears off its bottom hinge and slams flat into the cinema, skewed and skidded, with one rattle: the
largest change of silhouette this camera can show, and it leaves the leaf lying on the floor as a
trophy. `camera.shake()` — written, documented and never called by anything since — is wired to the
impact, as is the `crash` sound, which was in the same state.

**"Too dark" was not the fades and not the ambient.** Measured, rather than guessed: a frame in the
middle of the transition had a scene-band mean luminance of **7.09/255, 66% pure black, p90 6.94**
— and from t=0.99 s to t=3.63 s those numbers did not move (7.09 → 6.76, p90/p99/max identical to
two decimals). Three robots walking 250 px across the shot changed the picture by a tenth of a
luminance level. Two causes, neither of them the fade (which was already at 0) and neither of them
the chapter ambient (already boosted 3.5× with the fog mask already eased to nothing):

1. **The robots' lamps stayed behind.** The cutscene runner walks the robots itself and never calls
   `ChapterRuntime.update`, which is where chapter 1 rebuilds its light polygons — so for the whole
   transition the three lamps went on shining on the keypad while their owners walked off down a
   blacked-out corridor. A `relight()` hook on `ChapterRuntime`, called once a frame by the walk
   stage, fixes it: **mean 7.0 → 25.3, p90 6.9 → 108.3.**
2. **The shot was 72 m wide.** Cutscenes took `WIDE_MAX` (900×660 sim px). Chapter 1's is now
   430×315 and tracks the middle of the group rather than whichever robot was last driven.

**"Too fast" had been made worse by a concurrent change, and the measurement said so.** The
transition Michele saw ran 3.73 s. By the time this was picked up, the speed rescale landed in the
same tree and `CUT_WALK_MAX = 8` — a safety hatch, not a pace — was truncating the walk with Droid
still mid-corridor. The runner is now driven by a DURATION (`CUT_WALK_TIME = 4.6 s`): each robot's
pace is its own route length divided by the length of the shot, so no px/s constant is left in the
cutscene code and the next rescale cannot retune the cinematography by accident. `CUT_WALK_SPEED`
is now unused. With a longer black beat, a slower reveal, a hold on the final pose and a slower
closing fade, both transitions run **7.2 s**. `tests/chapters.test.ts` passes untouched.

**A latent bug the lockstep exposed.** `done` was set from "every robot reached *a* waypoint", not
"every robot finished its route", so the leg ended on the frame all three touched the same corner —
which is every corner once they walk at the same pace. The chapter 3→4 cutscene was stopping a third
of the way up the main staircase.

**What was rejected.** Brightening anything: the ambient table and the fade timings were both
measured first and both exonerated. Zooming chapter 3's transition: it climbs the main staircase, and
`placeRobots` has no elevation for a robot on a flight — `groundRiseM` exists in `sim/geometry.ts`
for exactly this and says in its own comment that the renderer reads it, and nothing does — so the
robots walk at hall height while the treads climb to 5 m over them. Zooming in would only frame that
better. Chapter 3's cutscene keeps the wide shot until robot elevation is fixed, and the reason is
written where the next person will look.

## 2026-09-23 — the third round of "I walked through that", and the test that ends it (agent)

**The brief was the class, not the bug.** Michele had now reported the same shape of fault three
times — chapter 1's seat rows, chapter 2's thirty-seven ground-floor objects, and, on the newest
build, *"this cube is walk-through"* and *"Entrance walls are still walkable"*. Each had been fixed
where it was found. The instruction this round was to find every remaining case, fix them the same
way, and then **make the class impossible to reintroduce**.

**Enumerate, do not audit.** The probe walks the venue **as built** — both `THREE.Group`s, every
mesh, instanced meshes expanded per instance — takes each mesh's world-space AABB, converts it back
to sim pixels, and asks two questions: is any cell of that footprint uncovered by a sim wall, and
can a robot centre reach it by walking from where the chapter starts? It found walk-through meshes
in **thirteen families** across both floors — 23 of them reachable in chapter 1, 195 in chapter 4,
43 in chapter 2 and 50 in chapter 3, counted after the three declared exceptions are taken out:
all eleven dressed auditoriums' seating and screens, the corridor's twenty columns, the foyer bar and its stools, the booth totems and
flight cases, the hall's red panels, the entrance's four mullions and three open door leaves, the
BOF slat walls and tables, the toilet partitions, the store's back wall, the forecourt's nine
bollards and planters, and — in chapter 3 only — the roller door and the router cabinet, which had
been chapter-2-only colliders all along. The full table is in `docs/playtest-notes.md`.

**The fix is the architecture rule, applied.** Every one moved into `src/sim/geometry.ts`; the
renderer draws the sim's wall list. `floor1.ts` lost the seating plan, the screens, the columns and
the bar; `ground.ts` lost the totems, the panels, the partitions, the entrance frames and the
forecourt. The renderer keeps what it is for — heights, materials, a turned stool, a cloth skirt —
and no longer owns a single plan coordinate that a robot can collide with.

**The deliverable is `tests/colliders.test.ts`.** Written against structures, not names: it measures
whatever the venue builds, so a new column in a grid is a new column that must be a collider. Its
flood fill **opens the gates a chapter opens** — a wall with an `onHit` handler, or a lock, a jam, a
roller door, a cam-locked cabinet — because behind a gate is where a missing collider hides longest;
that alone turned up cinema E's screen, 2.4 m of it, in the room the end of chapter 1 is played in.
Verified by mutation in both directions — and the mutation is what found the test's own hole. A box
added to the chapter-1 corridor went unreported, because the stair exception list mixed both floors
and the two levels share one 1900x700 plan, so a ground-floor stairwell was excusing first-floor
geometry standing over it. Per-floor now, and the mutant is reported by name, rect and the cell a
robot can stand in.

*Judgement calls the agent made and would defend:*

- **Three exceptions, all explicit.** Staircases (a flight and its landing are floor), the
  auditorium rake (the room's own stepped floor; the seats on it are the collider) and the rope-line
  stanchions (Michele's decision from the chapter-2 round). The stanchions moved into the sim as
  `LOBBY_STANCHIONS` — a list of rectangles that are deliberately *not* walls — so the decision and
  the exception are the same four rectangles, and the test asserts it both ways so nobody can
  quietly "fix" it.
- **The cinema screens are `glass`, not solid.** They stop a robot and pass light, because in room E
  the screen is the MIRROR chapter 1 bounces orange and green off: seating a secondary source 4 px
  from an occluding screen would have swallowed the bounce and broken clue 4 in silence.
- **The seats are `low`,** like every other seat row, table, counter and desk in the game — light
  crosses them. That is what keeps a dark auditorium readable, and it is why Biggy can still flood
  clue 3 over the seat backs from the concourse while Droid threads the aisle.

**The debt the last round wrote down came due, and was paid.** `docs/playtest-notes.md` had recorded
that `buildLights` is lights x rays x walls, had gone 0.9 -> 2.63 ms per cast over two rounds, and
that *"if a third change lands on that path it is worth range-culling walls inside buildLights
before adding to it"*. This was the third change. Chapter 1's wall list went from **98 to 179** (81 occluders
to 95), which took the suite from 58 s to 71 s and tripped a vitest worker RPC timeout; culling
occluders to the lamp's own reach — which cannot change a polygon, since every ray is clipped at
`range` already — took it to **20 s**, faster than before any of this. A note written for the next person turned out to be a note written for the
next agent.

**Measured, not assumed, twice more.** A new collider can break a puzzle without breaking a test, so
both chapters that could suffer were swept: every chapter-1 clue is still lightable from hundreds of
*reachable* spots by each robot that has to light it, and chapter 3's crowd — which at first was not
getting in at all, because visitors aimed at any point across a 136 px opening that now has frames
in it — comes in through the three door bays.

**The kiosk, and why "identify it before changing it" was the whole instruction.** Michele twice
asked for "the black block" to go, guessing it was a bench. It was not. Shot, cropped and traced to
its mesh, it was the kiosk's own **fascia**: `floor1.ts` drew it as a 60 x 60 px plate laid flat at
2.15 m — a LID over the whole kiosk, 4.8 m square, unlit, seen from a 30-degree camera.

The first explanation written down for it was still wrong, and an A/B said so. The claim was that
the lid covers the clue; at this pitch its projection actually falls north of the ring. What it does
is **shade** it. Three builds of the same tree, one variable each, mean luminance of the 100 x 80 px
box around the ring: **43.5 with neither lid nor counter, 39.1 with the lid back (brightest arc
pixels 174.1 -> 128.8), 43.8 with the counter back** — the counter, the "bench", costs nothing
measurable, because it sits south of the ring and was invisible in an unlit kiosk, which is
presumably why the guess carried a question mark. So: four 3 px fascia bands, top open, counter
deleted because he asked for it, and the glazing untouched — it was already `glass: true`.

And the honest part: his build measured **5.8** in that box against 43.5 now, and most of that climb
is NOT this change. Another agent's clue-marker and lighting work landed in the same tree during
this session; the kiosk's own share, isolated by A/B, is the 39.1 -> 43.5 and the 128.8 -> 174.1.
A before/after screenshot across a shared worktree is not an attribution.

**What the agent got wrong, on the record.** Two `git checkout <file>` calls to undo a mutation test
discarded the whole of that session's work on `floor1.ts` and `ground.ts` — both files had to be
rebuilt from the transcript. A `git stash`/`stash pop` earlier in the same session was worse
judgement: this repo is a shared worktree with other agents live in it, and stashing moved someone
else's in-flight `biggy.ts` out from under them. Neither is a tooling problem; copy the file to the
scratchpad and copy it back.

## 2026-09-24 — four lighting notes, and the two causes the human's brief got wrong (agent)

**What the agent was asked to do.** Michele's playtest produced four notes about light: a solved
clue's digit washing out, the selected robot going "lighted and a bit ethereal, in particular
droid", Droid's light "oddly pointing somewhere else", and floor blowing out to flat colour in his
screenshots. The brief named a prime suspect — the light skirt added hours earlier — and, to its
credit, said **"measure before you change anything… if it is not, say that instead — I would rather
be wrong early."**

**What a human decided.** That the skirt is not to be deleted: *"the problem it solved (hard to
light up the clues, even if the robots are next) was real and his, and is not to be reintroduced."*
And that the selection highlight should read off the ring and the robot's own projected light rather
than off its body — Michele's own suggestion, taken as written.

**What the measurement said, and where it disagreed with the brief.** The agent built the game with
a runtime toggle on each suspect, staged identical frames through the debug handle
(`__afterdark.game.debug.place`) and sampled pixels off a PNG decoder written for the purpose.

- The skirt **was** guilty of the digit and of the flat floor: clipped-channel pixels around two
  robots on a clue went **6.4% -> 28.4%** with it on, and the numeral's contrast inside its own ring
  fell from 65 to 16 of 255.
- But it was **not** the main cause of the ethereal robot, and the brief's mechanism for that ("it
  lights the robot itself from below") was wrong in detail: an additive floor decal cannot light a
  robot standing on it. What lit the robot was the skirt's *volumetric wedge* — a 1.9 m-rim cone
  from a lamp 1.95 m up, i.e. a tent pitched over the body.
- And the **bigger** cause of the ethereal robot was not the skirt at all: it was the x-ray ghost,
  which had been drawing over the robot it marks for two rounds. Ghost off vs on, Droid alone:
  torso **L=109 -> 149**, shins **57 -> 93**. The cause is a three.js fact rather than a typo — the
  renderer draws every opaque mesh before any transparent one, so `renderOrder` cannot put a
  transparent ghost *before* an opaque robot, which is exactly what the code's own comment claimed
  it did. Making the ghost material opaque fixes it and, as a side effect, gives Michele the flat
  silhouette he asked for two rounds ago instead of an x-ray of the rig's insides.
- "Droid's light points somewhere else" is the mounted case, and it is a drawing bug: `syncMount`
  offsets a riding Droid six sim px north as the prototype's flat-canvas way of saying "up", and
  this renderer already draws that as height, so the offset was counted twice and Droid was drawn
  0.48 m behind his own pool.

**What was rejected, and why.** Moving the mounted lamp in `buildLights` to Droid's own position —
the obvious sim-side fix — was rejected outright: it would move the polygon `clueLit` tests, and
the brief ring-fenced the clue rule. The renderer takes the offset back out instead. Deleting the
skirt was rejected for the reason the brief gives. Lowering the skirt's intensity flat was rejected
in favour of reshaping it: an annulus keeps the light where a neighbouring clue is (it is **2.8x**
brighter there than the old profile) and removes it only from the robot's own 0.58 m footprint,
which is both where the numeral is and where the body was catching the wedge. And brightening the
selected robot's `SpotLight` was rejected in favour of brightening only its additive floor pool,
because the spotlight is the thing that lights the robot's shell and the note was a request to stop
lighting the robot.

**The sim was touched once, on purpose, and it is a label.** `LightSource.skirt` carries no rule:
same range, same rays, same polygon, so `clueLitBy` and `clueLit` cannot see it and
`tests/chapters.test.ts` passes unchanged. Every actual change is in `src/render`. That is the
CLAUDE.md line working — the temptation was to fix a *look* by moving a light in the sim, and the
architecture made the cost of that obvious enough to refuse.

---

## 23 Sep 2026 — wiring the tow bar, and three things the port got wrong

**What the human decided.** Michele, having played chapter 2: *"the big thing: pushing biggy is
really really hard, It tends to go sideways, and hitting a good speed is a very hard task."* He did
not ask for a tuning pass. He pointed at `welldsagl/devoxx-game-experiments`, a parallel 2D port
where the same problem had already been met and solved, and handed over its grab design rather than
have the agent rediscover one. The eight-direction quantisation is his team's call, not this
project's.

**What the agent did.** `src/sim/tow.ts` had been sitting in the tree, ported and committed but
never connected to anything. This session bound it to Space in `game.ts`, stepped it inside
`stepAll` before the physics step (so the velocity it sets is the one Biggy carries through his own
wall resolution) and re-placed the holder after it, drew the bar and a floor lane strip in
`scene.ts`, and wrote `tests/tow.test.ts`.

**Wiring it up proved three things wrong with the port, and none of them would have shown up in a
review.** All three were found by driving the thing, not by reading it:

1. **The speed cap was nonsense in our units.** The experiment's literal was 210, carried through as
   `210 * SPEED_SCALE` = 52.5 px/s. Biggy's own top speed is 58.75 and the roller door — the one
   gate in the game that demands a straight run — needs 67.5. A "tow" capped at 52.5 is slower than
   Biggy walking and could never have opened the door it exists to open. The docstring shipped with
   the literal claimed it was "above his own top speed ... but below `ROLLER_DOOR_SPEED`", which is
   not a description of 52.5 and is not a coherent design either. It is derived now — you cannot
   drag Biggy faster than you can run — which needs no new frozen number and puts Voxxy above the
   door and Droid below it, so chapter 2's gate still names the robot it always named.
2. **`stepBot` undid the whole thing every frame**, clamping Biggy back to his own `max` on the next
   line of the same tick. `boostCap` is the existing hole in that clamp; `pushBiggy` opens it the
   same way.
3. **The eight directions were cosmetic after the first steer.** Walking the holder round advances
   `aim` continuously, and the drive reads `aim`, not `dir` — so one re-aim and the "lane" was a
   fiction, with the drift the bar exists to remove quietly back. The file's own header calls the
   quantisation "the load-bearing choice", and the code had stopped honouring it. The bar now
   settles into the nearest eighth when the swing stops and re-projects Biggy's momentum onto it.

A fourth, smaller: `towSnap` returned `-1` for every northward direction, because `%` in JavaScript
keeps the sign of its left operand. Nothing in the sim read `dir`, so it surfaced only when the
renderer started drawing the bar.

**The acceptance criterion is the complaint, measured.** Not "the code runs" — the first test in
`tests/tow.test.ts` starts the pusher off the centre line by the amount a player misses by when
lining up by eye, and compares:

| pusher off the line | free push: drift / top speed | tow: drift / top speed |
| --- | --- | --- |
| 0 px | 0.00 px / 78.8 | 0.00 px / 71.7 |
| 2 px | 49.4 px / 38.8 | 0.00 px / 71.7 |
| 4 px | 41.7 px / 24.2 | 0.00 px / 71.7 |

Two pixels is a sixth of Voxxy's diameter, and it is the difference between opening the roller door
and not reaching half its threshold. That table is the test, so anyone who retunes the bar back into
a shove fails it.

**One test of my own was wrong and failed honestly.** It asserted that swinging the bar cuts Biggy's
forward speed. The bleed never claimed that — he is a coasting mass and the bar is not a brake. What
it promises is that his velocity stays *along* the bar. Rewriting the assertion to say that is what
turned up finding 3 above: the invariant only holds once the lane settles, and nothing was settling
it.

**Rejected.** Making Space grab for Droid *and* climb for Droid: E already climbs, and overloading
one key with two ways of riding Biggy left the holder welded to his flank mid-climb. Taking the
mount out instead was rejected as scope; `toggleMount` drops the bar. Also rejected: releasing the
grab when the holder is pushed into a wall. The bar is a straight line and the venue is not, so a
corridor run clips the holder into a door reveal for a frame or two and the tow would fail exactly
where a player most needs it — the holder is pushed out instead, and only a wall that genuinely
separates the pair ends the grab.

---

## 2026-09-23 — chapter 2: the cam-lock wheel comes out, the WiFi password goes in

**Michele's call, in one line: *"Remove the wheel, too complicated."*** A builder session followed
it. This is a reversal of `docs/gameplay-additions.md` §2 — that section *was* the wheel — and §2
has been rewritten in place to say so rather than left standing as a second source of truth.

**What the human decided, and what was left to the agent.** He decided the wheel goes and that the
`DevoxxForever` beat replaces it, with three ways in: typed from memory, read off a poster by
Voxxy's narrow cone, or read off the router's own label by Droid standing on Biggy. He kept his
three standing constraints from the earlier conversation: **not** thirteen letters scattered round
the venue, **not** a second helping of chapter 1's light mix, and now **not** the wheel. The agent
decided everything below the line: where the poster hangs, how forgiving the typing is, who owns
the keyboard while a prompt is open, and what the refusals say.

**Deleted:** the wheel's entire state machine — `WHEEL_*`, `PAWL_*`, the detent pawl, the angular
integrator, `cabinet.onHit`, the 'cam-wheel' and 'cam-mark' props, and their two builders and two
draw functions in `src/render/scene.ts`. None of it was in `tests/frozen-constants.test.ts`; it was
all chapter-local tuning, which is where it belonged and why it could go cleanly.

**The one structural change.** A chapter can now say it has the keyboard —
`ChapterRuntime.typing()`, surfaced as `GameSnapshot.typing`. `game.ts` asks before it reads `R` as
restart; `src/main.ts` asks before it reads `WASD` as a stick. This is not decoration:
`DevoxxForever` has a `D` in it and two `R`s, so without it the first letter of the password drives
the robot out of reach of the terminal it is being typed into, and the seventh restarts the chapter.
Found by reasoning about the string, then confirmed in the browser — the headless run asserts that
Voxxy moves 0.00 px while the password is typed on real key events.

**What "simpler" was taken to mean.** A wrong key does not go in *and does not throw away what is
already there*; Backspace takes one back; case never enters into it, because `KeyboardEvent.code`
is `KeyD` whether or not shift was down; the field and its count are in the HUD's live line the
whole time. Thirteen presses is about four seconds, and routes 2 and 3 turn the whole thing into a
single `E`.

**Rejected.** (a) Making the terminal a minigame — a dial, a scramble, a sequence: every one of them
is the wheel again under another name. (b) Accepting a prefix of the password to save keystrokes:
it saves two seconds and costs the joke, which is the entire point of the beat. (c) Leaving the
cam-wheel draw code in `src/render/scene.ts` as dead code for props that no longer exist — a critic
reading the file would find it, and it was deleted instead. (d) Having the password auto-enter the
moment a robot reads it: knowing it and entering it are two different acts, and the walk back to
the technical room is what makes reading it feel like finding something.

**Known weak, and said plainly.** The wheel was the one object in chapter 2 where all three robots
were needed *at once*. Three alternative routes cannot be that by construction: Biggy is on every
route (he is the only one who can swing the cabinet door, and the terminal is inside it) and route 3
needs Droid on Biggy, but a player who reads the chapter card uses Biggy and then types. Chapter 2
as a whole still needs all three — breakers, cable, roller door — so the 10-point "all three robots"
criterion is carried by the chapter rather than by this one object. That is a real loss against the
wheel and it is the price of the instruction.

---

## 23 Sep 2026 — "OutOfMemory, yes build it": the beer delivery in chapter 3

**The human decision.** Michele had held approval on `docs/gameplay-additions.md` §3 until he could
play something. Today he gave it in one word: *"OutOfMemory, yes build it."* The design was already
written — Biggy stacks beer crates, each one costs mass and acceleration, the crate past the limit
throws a `java.lang.OutOfMemoryError` and he drops the lot — together with its own kill condition,
which became the acceptance criterion: *"if the restart reads as punishment rather than comedy, it
is a bad beat regardless of how good the joke is."*

**What the agent decided, and what it had to re-decide.** The design doc predates the story rewrite:
it says chapter 3 is lunch and leans on Wednesday-evening beers, and chapter 3 is breakfast now.
Rather than drop the signage joke, the framing moved: the crates are a **delivery**, dropped off at
eight in the morning for tonight. That is when a brewery actually turns up, nobody is drinking at
breakfast, and the pallet standing in the arrivals aisle gives Stephan a third condition to be
unreasonable about — soup, keynote speaker, and *"that beer off my floor"*. The shrink-wrap label
still reads "Belgian beers may cause hangovers and OutOfMemoryErrors", which is Devoxx's own line.
The tone Michele set for the tomato soup (*"it's odder in the morning but i found it fun"*) is the
tone this matches.

**Frozen constants, and the one structural fix the beat forced.** The beat changes Biggy's `mass`
and `accel` at run time, which is exactly what the frozen table exists to prevent. The distinction
is now written down in `src/sim/crates.ts`: `DEFS` is the robots' frozen IDENTITY and is never
written; what a robot is carrying is a MODIFIER on the mutable copy `mkBot` makes, recomputed from
`DEFS` every time rather than accumulated, so putting the crates down restores the frozen numbers
exactly and not approximately. `tests/frozen-constants.test.ts` passes untouched.

That left one real hole: a load applied in chapter 3 outlived chapter 3. Skip the chapter mid-carry
and chapter 4 got a Biggy still carrying four crates that no longer existed; press `R` and chapter 1
did. `game.ts` now restores every robot's frozen identity at the head of `startChapter`, which is the
one door every chapter comes through, and a test drives both escapes.

**The numbers, measured rather than asserted.** Each crate is +1.5 mass and x0.82 acceleration,
compounding; four — the safe stack — take Biggy from mass 7 to 13 and from `accel` 0.6 s^-1 to
0.271. Over a 200 px (16 m) straight from a standing start that is 4.98 s empty against 6.44 s
loaded, +29%. Six crates are delivered and the fifth pickup throws, so four-then-two is the honest
line and one crate under the limit is the optimum, which is the design's whole point: greed is
punished by physics rather than by a rule.

**What is honestly weaker than the design claims.** The design says a heavier Biggy is harder to
shift and that *"the push and the new tow bar already express"* it. They do not: `pushBiggy` adds
`force * dt` straight to his velocity and `stepTow` drives him with the holder's own force, and
neither divides by mass. Only `botsCollide` reads it. So the felt half of the trade is the
acceleration, and the mass shows up in contacts, not in being pushed or towed. Making the push and
the tow mass-aware is a change to frozen physics that would retune chapter 2's roller door, so it is
a human decision and not a builder's — flagged rather than done.

**Rejected.** A HUD heap meter: `collectMeters` in `src/render/hud.ts` would take a new `case`
happily, but the brief put the crate count, the penalty and the distance to the limit on the
objective and progress lines, and one more agent in one more shared render file this week is not
worth a second bar. Rejected too: a full-screen crash dump on *every* heap error. The first one gets
the card, because a stack trace is worth reading; every one after it is a toast, because a modal
that interrupts the fourth attempt is how a joke turns into a penalty — which is the design's own
kill condition, read literally.

**Found while verifying, not caused by this work.** `chapter 3 — breakfast > brings the crowd in
through the left-hand doors` times out at clean `HEAD` in this container: it simulates 5,600 frames
of a 36-body crowd and vitest's default budget is 5 s. It now carries an explicit 30 s timeout,
because a wall-clock budget on a headless sim is a property of the machine and not of the game.

## 24 Sep 2026 — the booth games move to chapter 3, because chapter 2's hall is shut

**The human decision.** Michele, playing chapter 2: *"Minigames should be in chapter 3."* His
reason came in the same message — *"the hall is still closed at the moment."* He is right, and it
is not a placement quibble: the premise of a booth game is a booth with somebody standing at it,
and chapter 2's exhibition hall is dark, empty, unpowered and an hour from opening. Nobody is there
to start a stopwatch, nobody is there to hand over a giant rubber duck, and the sponsor who would
is asleep. Chapter 3 is breakfast with the doors open and thirty-six visitors on the floor, which
is the only reading of "win some swag at a stand" that holds up.

**What the agent moved.** Three games, not the two the brief guessed at: the duck shuffleboard, the
top-shelf sticker and the Regex Racing lap. `MinigameState`, `Minigames` and `setupMinigames` left
`src/sim/chapters/ch2-expo.ts` for `src/sim/chapters/ch3-breakfast.ts` unchanged in mechanics —
same reaches, same forces, same `RACE_LIMIT`, same `TRAVEL_TIME_SCALE` on the lap clock. Chapter 3
was *already* calling `setupMinigames` (it imported it from chapter 2), so this is chapter 2 losing
them rather than chapter 3 gaining them: what actually changed hands is the code's home, chapter
2's briefing, and every prop chapter 2 was drawing at booths nobody could reach.

**What legitimately changed with the move, and nothing else.** The lines. The sticker's refusal was
one sentence with the robot's name swapped into it; CLAUDE.md says every gate speaks in that
robot's voice, so Voxxy and Biggy now have their own, and each of them now has somebody behind the
counter enjoying not fetching the stool. The win line credits the Sticker Mine crew, because there
is a crew now. The duck's payout line already read *"Rubber Duck Inc hands over a giant duck"* —
written for a staffed booth, and it has finally got one. Chapter 2's objective dropped "Booth games
on the way are optional swag"; chapter 3's gained a sentence saying the booths are open and running
their games, its keys line gained "play a booth game", and its progress line gained a `swag n/3`
tail that only appears once something has been won, so an optional beat never reads as a task.

**Nothing was cut.** All three games survive intact. None of them depended on the hall being shut;
all three depended on it being open and were quietly wrong for four chapters' worth of playtests.

**What was deliberately left alone.** `mkBody` — the loose-body helper the crates, the crowd, the
cake crate and the duck are all built from — stays exported from `ch2-expo.ts` even though chapter
2 no longer uses it, because chapters 3 and 4 both import it from there and moving it would mean
editing a file another agent was writing in the same tree. Flagged as a wart, not fixed. Also left
alone: the Regex Racing lap can be started by Voxxy brushing marker 1 on an unrelated errand and
then reset with a toast twenty seconds later. That is pre-existing behaviour and the move did not
make it worse, so touching it would have been a rewrite disguised as a move.

**Rejected.** Splitting the three games across chapters 3 and 4, or gating them behind Stephan's
three jobs. Both make optional swag feel like homework, and the decision was about *where a booth
game is plausible*, not about pacing.

**Verification.** A throwaway `git worktree` at clean `HEAD` with only the three changed files
copied in: `tsc --noEmit` clean, 260 tests green (255 before this work, 259 at the checkpoint
commit), `vite build` clean. Then the built page driven headlessly on chapters 2 and 3, and all
three games *actually played* in their new home rather than read: Voxxy and Biggy refused the
sticker in two different voices, Droid took it, the duck was shoved into the circle with the stick
and stopped there, the lap paid out, the progress line reached `swag 3/3` and `document.title` read
`After Dark · ERRORS:0` on both chapters. One thing worth recording for the next agent who drives
this build: under swiftshader this scene draws at **one to two frames a second**, so a harness that
waits on `requestAnimationFrame` for every step of a minigame hangs. The sim is stepped directly
with `game.update(DT_MAX)` while the page's own loop keeps drawing, and real frames are awaited at
every checkpoint — and a second browser tab is fatal, because a background tab's RAF is throttled
to a standstill.

## 23 Sep 2026 — the third aiming complaint, and a refusal that was right for a reason it did not give (agent)

Two control notes from Michele's latest chapter-1 playthrough, both raised before, both handed to a
builder agent with one condition attached: **reproduce it headlessly before changing anything.**
Closing a note by reading the code instead of testing it is a mistake already on the record in this
file, and he caught it, so the brief made measurement the first deliverable rather than the fix.

### 1. *"Pointing the light in a direction and stopping is still painful. Robots tend to turn up when u release / short press down."*

**What the agent measured, before touching anything.** A throwaway probe drove each robot with the
stick held in each of the eight directions, released, stepped until it stopped, and recorded the
heading at release against the heading at rest — in free space, inside a box of walls, and in the
real chapter-1 rooms through `createGame`.

| situation | heading error at rest |
|---|---|
| free space, any hold length | 0.0 deg — the aim was never *drifting* |
| inside a box of walls, all 8 directions, all 3 robots | **exactly 180 deg** |
| chapter 1, driven 3 s from Voxxy's start | 180 deg in seven of eight directions |
| one-frame press of a new direction at a run | Voxxy 64, Droid 82, Biggy 89 deg off the stick |
| ragged release of a diagonal, 1-8 frame key skew | 14-43 deg, always toward the axis released last |

**The cause, and it was not drift.** `face` was read off the *velocity*. A wall bounce reverses the
normal component of the velocity, so the last frames of a coast point back the way the robot came:
drive down into the seat rows, let go, and the robot turns round to face up the room. That is the
"turn up", and it is 180 deg, not a wobble. The "short press" is the same mistake from the other
end — the velocity has barely begun to turn, so a tap aims somewhere between the old heading and
the new one. And a diagonal is two keys and two fingers that never lift together, so "let go of
up-right" arrives at the sim as a real *up* for a frame or three.

**What the agent changed.** Under the stick, the heading *is* the stick. Off the stick, it does not
move. Unless the body is speeding up while nobody is steering it — a tow, a shove, a kick — in
which case the world is moving it and the old velocity rule is right again, which is what keeps a
towed Biggy and chapter 3's duck pointing the way they actually travel. All three measurements
above now read 0.0 deg.

**What that is and is not, against the freeze.** It changes what the heading is derived *from*. It
retunes nothing: `FACE_MIN_SPEED` still reads `1 * SPEED_SCALE`, still gates the gait phase, still
decides the heading of a body nobody is steering, and `tests/frozen-constants.test.ts` was not
touched. One new constant was added, `AIM_SETTLE` (0.1 s), explicitly **not** frozen: a stick that
has only *dropped* an axis is treated as a possible fumbled release and has to outlast the window,
while a stick that presses something new is believed instantly, because aiming staying instant is
the entire complaint.

### 2. *"I had some trouble climbing on biggy (Droid must be next to a standing biggy - the exact situation i was in)."*

He was quoting the game's own refusal back at it, and the honest answer is that **the refusal was
correct and the message was a lie of omission.**

| question the brief asked | measurement |
|---|---|
| is `MOUNT_REACH` honest? | yes — a 32 cm shell of daylight round a 1.44 m body, identical at all 16 angles swept |
| can Droid get inside it? | yes, from the frame the two bodies touch |
| how long is Biggy unclimbable after a small push? | **2.61 s** |
| ...after being driven at his top speed? | **7.03 s** (drag 0.35 s^-1, the lowest in the game) |

The trap is that **Droid does it to himself**: walking up to a parked Biggy knocks him to 1.0 m/s,
which is 2.6 s of refusals, by the end of which Biggy has also rolled out of reach — so the next
refusal is the *other* clause of the same sentence. Biggy was not standing, and the only reason he
was not standing is that Droid had arrived.

**What the agent changed.** Three answers instead of one, each naming what is actually wrong, in
Droid's voice and with the distance or the speed in metres. And the middle one acts rather than
scolds: a Droid already touching a slowly rolling Biggy plants his feet and stops him — the same
braced-robot idea the rest of the game runs on, capped at Droid's own top speed on the grounds that
he can only catch what he could have kept up with. The 2.61 s wait becomes one more keypress.

**Nothing frozen moved here either.** A moving Biggy is still not climbable; `MOUNT_REACH` is still
4 px and `MOUNT_BIGGY_MAX_SPEED` still `20 * BIGGY_SPEED_SCALE`.

### What a human still has to decide

The steadying is a **new mechanic**, not a bug fix, and it is flagged for Michele rather than
presented as one. If he would rather Droid simply waited, deleting it leaves the corrected messages
behind and the complaint half-answered. Raising `MOUNT_BIGGY_MAX_SPEED` so the knock never matters
would answer it outright — and that is a frozen constant, so it is his call and not a builder's.

### Rejected

- **Retuning `FACE_MIN_SPEED`.** It is frozen, it is asserted, and the measurement showed it was
  not the problem: the aim was not noisy, it was reading the wrong quantity.
- **A turn-rate limit on the heading.** It would have smoothed the 180 deg flip into a slower 180
  deg flip, and it costs aim response, which is the thing being complained about.
- **Reverting the aim to the committed heading with a visible snap-back on release.** Waiting the
  fumble out before believing it does the same job with nothing to see.
- **Declaring the mount refusal a plain bug and widening the reach.** The reach measured honest at
  every angle; widening it would have fixed the complaint by breaking the part that worked.

### Verification

A throwaway `git worktree` at the session's own commits, `node_modules` symlinked, three other
agents left alone in the shared tree: `tsc --noEmit` clean, **281 of 282 tests green**, `vite build`
clean. The one failure is chapter 3's crowd choreography timing out at 60 s; it passes in 17.4 s at
clean `HEAD` and 20.7 s with this work when run on its own, so it is a slow test losing a race on a
loaded box rather than a regression — recorded here because the next agent will see it too. Then
the built page driven headlessly (`?chapter=1&warm=2&nofog=1&topdown=1`), stepping the sim directly
with `game.update(DT_MAX)` rather than trusting `requestAnimationFrame`: Voxxy driven south for 3 s
and released ended facing south to the last digit, Droid walked into Biggy and was up him on the
frame after contact, `document.title` read `After Dark · ERRORS:0` and no console errors at all.

---

## Session — 25 Sep 2026 — chapter 2's puzzle chain, the password field and the input bug

**Agent:** builder, scope `src/sim/chapters/ch2-expo.ts`, `src/render/hud.ts`, `tests/ch2-chain.test.ts`
and the chapter-2 block of `tests/chapters.test.ts`, plus the three additive lines that carry a new
snapshot field (`src/sim/types.ts`, `src/sim/chapters/index.ts`, `src/sim/game.ts`). Four other
agents were live in the same working tree throughout.

### What a human decided

Everything structural in this session is Michele's, taken from two rounds of notes on his chapter-2
playthrough, and the agent built what he asked for rather than what it would have preferred:

- **The chain.** *"The breaker lighted all up, with no need to activate the router. I thought they
  were linked. How I'd do that? Breaker give energy, and a transformer/router lights up in the
  cabinet. It needs authorization. First you need to open the door (biggy) than type."*
- **Who types.** He was asked whether Voxxy or Droid should enter the password and answered
  *"both are ok... what is excluding droid? Fingers too long?"* — so **both type**. The agent had
  drafted a Voxxy-only version with a "too tall to reach into the bay" joke for Droid and threw it
  away: inventing a disqualification to make the roles tidy is exactly what he said not to do.
- **The intro.** *"yes, change the intro, the wifi password can't be there."*
- **Where the password lives.** *"I'd put it here, spray painted, with a wifi symbol and '(And no,
  you can't change it)'"* — against a photo of a dark hall wall — plus his own two objections to
  his own idea, *"it's a bit far from the entrance, and all is dark"*.
- **The store door.** *"Door should have Halo, Name on the side (shirts and gadget) and be
  mentioned on the intro... (and put crates, shirts and gadgets inside)... But the devoxx shirt is
  a tradition."*
- **The field.** *"I'd display an input text at center screen on e to make it easier."*

### What the agent did

- Turned three independent flags into one chain. The breakers give a **supply** and the hall stays
  dark; the transformer/router in the cabinet wakes on that supply; the terminal is a dead screen
  until it does and says so in each robot's own voice; the password closes the lighting circuit.
  `src/render` was not touched for any of it — the renderer learns "the hall is lit" off the
  `breaker` prop's own `state`, which now has three values instead of two.
- Added `GameSnapshot.prompt` (`TextPrompt`) and drew it as a centred field in `hud.ts`: one cell
  per character, a caret on the next, and a red flash on a key the sim refused. The sim decides
  every one of those; the HUD formats.
- Reproduced the input bug in the built page over CDP (below), and fixed the half of it that lives
  in the sim.
- Moved the password from small print on a sponsor's banner to a spray tag on the hall's top wall,
  at the **west** head of the run-up lane — close to the stairwell the robots come out of, which is
  his "too far" objection answered rather than inherited.
- Signposted both ends of the cable run in the world (blue wayfinding panels at the steps and the
  desk, a lit pad on the counter) and rewrote the line he could not parse.
- Gave the store door a halo, a name, crates of t-shirts behind it and a hail that names the lost
  keys.

### The input bug, and what was actually wrong

He could not say what had happened — *"I don't know what was happening, but i kept typing and it
never took it right."* Driven in the **built page** with real `Input.dispatchKeyEvent` events, the
password matched under every keyboard variation tried: plain lowercase, Caps Lock, Shift held,
overlapping keydowns, and auto-repeat. `KeyboardEvent.code` is `KeyD` however the key is shifted,
so case genuinely never enters into it.

What did reproduce is a **stale stick**. `src/main.ts` stops pushing the movement stick the moment
the sim takes the keyboard, but it never clears it: a keydown suppressed while typing is not
recorded as held, so nothing balances it, and the last stick value stays latched. Tap `E` without
letting go of the key you drove up on and the robot keeps walking with the prompt open — measured
at 25 px of drift in 1.4 s against a 54 px `TERMINAL_REACH`. Walk past the reach and the prompt
closes silently, with no field on screen to show that it has, and every letter of `DevoxxForever`
becomes a control again: `D` drives, `E` says "nothing to plug in here", and **`R` restarts the run
into chapter 1**.

Fixed in the sim, which is where "may this robot move" belongs: a robot at an open prompt is
pinned. The browser-side half — clearing `held` when `snapshot().typing` goes true — is a one-line
patch in `src/main.ts`, which belongs to another agent this session and is in the handover report.

### Rejected

- **Making Voxxy the only typist.** Tidier, and it would have put all three robots at the cabinet
  for the climax, which is worth rubric points. Michele asked what excludes Droid and the honest
  answer is nothing, so nothing does.
- **Keeping the sponsor-banner poster as a second place to read the password.** Two places to find
  one answer is not two routes, it is a muddy one.
- **Letting `Enter` submit a free-typed buffer.** The forgiving prefix match was never the problem;
  the silence was. With a field on screen it reads correctly, and the existing choreography that
  asserts the forgiveness stays true.
- **A red halo as its own prop kind.** It needs two lines in `PROPS` in `src/render/scene.ts`,
  which is another agent's file this session. The halo ships as a lit floor plate built from prop
  kinds the renderer already draws, and the patch that makes it a first-class `halo` kind — the
  start of one visual language for "this is interactive" rather than a one-off — is in the report.

### Verification

A throwaway `git worktree` at this session's own commits with `node_modules` symlinked, four other
agents left alone in the shared tree: `tsc --noEmit` clean, `tests/ch2-chain.test.ts` 14/14 and
`tests/chapters.test.ts` 41/41 green, `vite build` clean. `tests/aisle.test.ts` fails 2 at the
commit this branched from and is another agent's geometry work in flight, not this session's.

## 24 Sep 2026 — cinema E: he could not solve a room every test said was solvable (agent)

**Michele, on the chapter-1 build:** *"I'd try the aisle room on the opposite way, for better
interaction. I no longer see the hint in that room, i wasn't able to solve it."* Plus, of the same
room, *"Robots still pass through that wall"* and *"The room door is still big and walked on."*

**What the agent was asked to do first: look, not fix.** Drive chapter 1 headlessly into cinema E
at the zoom the game is played at, take real frames, and report what they show before changing
anything. That instruction is the reason this session found the cause instead of another symptom.

**The frames.** With Droid parked at the foot of the aisle, cinema E rendered as a black floor, a
dark slab and nothing else: the exit alcove read as a 12-pixel green sliver and the clue marker as
a four-pixel grey dot. Ray-cast against the fixed diorama camera, the numbers behind the picture:
of the ground within 90 px of the alcove clue — the aisle's foot, the walk across, the alcove
itself — **only 35% was in shot**; the entire front of house was hidden outright; and the clue
itself sat in a **15 px keyhole**, one robot-width either side of which it disappeared. It is 68%
now, with the alcove and the bay in front of it at 100%, and the room as a whole 67% -> 75%.

**The cause, and it was ours.** Three separate things stood between the camera and that room, and
the biggest was a duplicate: `ch1-night.ts` emitted a `screen` prop on top of the screen
`buildVenue()` already draws for every auditorium. Drawn from the renderer's `PROPS` table it is
**5.2 m tall** against the real screen's 2.75, wider than it, and — because only the middle two
thirds of it had a sim wall under it — **you could walk through both ends**. That is Michele's
"robots still pass through that wall", in the room his screenshot is of. The room's own 2.45 m
front wall hid the rest.

**What a human decided.** Mirroring the room was Michele's own proposal and it was taken: the aisle
now runs up the RIGHT of cinema E with the exit alcove at its foot, so the gate, the route and the
prize are one picture instead of two ends of a dark room. `plans/` fixes where rooms are, not which
side a chapter dresses an aisle on, so this is not a venue change.

**What else changed.** The alcove moved up out of the camera's blind strip and became venue
geometry (`cinemaEExit`), because nothing in `src/render` reads `snapshot().walls` — as chapter
walls its two slabs were invisible and a robot stopped dead against thin air. The alcove is 52 px
deep rather than a tidy 40 for a measured reason: the mirror bounce carries `MIRROR_MIN_RANGE`
whatever else happens, and a pocket ending 87 px from the screen sits inside that floor from every
angle, where a 40-deep one at 103 px cut Biggy's reachable lighting positions from 539 to 73. The
keypad got a collider and stopped being a 1.9 m-deep box parked in the corridor; door leaves are
drawn 0.48 m thick instead of 0.96; and each closed cinema's joke stopped being a 2.2 m
floor-standing hoarding planted across its doorway with nothing under it and became a hung
`poster`. Biggy now says so, once, the first time his flood throws a bounce off the screen —
because the only feedback a robot locked out of a room gives you is a refusal.

**The tests, which is the real finding.** `tests/aisle.test.ts` was green throughout: it measured
REACHABILITY — 539 positions from which Biggy could light that clue — and called it playability. It
now ray-casts from the clue, from a robot standing at it and from every cell of the alcove and its
bay toward the camera, the way `venue.smoke.test.ts` already does for the Zaal numerals, and it
asserts the gate where the gate actually lives: **Biggy has no route into the alcove at all**. The
first cut of the mirrored layout let him walk round the seating into it and every test in the file
stayed green, because they were all about the aisle. `tests/colliders.test.ts` had the same shape
of blind spot one level up — it measures `buildVenue()`, so nothing a CHAPTER draws was ever swept,
which is exactly where the screen slab, the keypad and five joke hoardings were hiding. It now
sweeps chapter props too.

**Rejected.** Cutting cinema E's front wall down to a parapet, which is the one change that would
put the last 30% of the room in shot — `wallStyle` already does it for the near CORRIDOR wall, for
this exact reason. It is `src/render/venue/floor1.ts`, another agent's territory this session, so
the patch is in the report rather than in the tree. Also rejected: fixing chapters 2 to 4's
walk-through props, found by the new sweep (a duck and a crate are things you PUSH, a spotlight may
well be meant to be stepped over — those are design calls in other people's files). They are frozen
as a list that may not grow.

## Voxxy's jump, and one key doing two jobs — 24 Sep 2026

**What the human decided.** Twice, and the second time settled the design. First the scope:
*"just for one quiz. And for jumping around for fun."* Then, after a playthrough where he went
looking for it: *"Voxxy jump: let's make it. I'd keep E, when no other action is available."* That
second sentence is not about the jump at all — it is the answer to a different note of his from
the same round, *"Why space and not e for catching? I'd keep it to one key"* — and it is what
made the feature cheap: one rule, `E` falls through, and both the hop and taking hold of Biggy
arrive on the key he wanted them on.

**What the agent did.** The arc is derived, not tuned. `JUMP_RISE_M = 0.3` is the only number
anybody picked; the airtime is `2*sqrt(2H/g) = 0.49 s` and the height through the hop is the
parabola `4H·u(1−u)`, which is what `src/render/scene.ts` draws. There is no easing curve and no
second set of numbers for the renderer to keep in step with the sim — the rule in CLAUDE.md is
that render reads and does not decide, and a hand-drawn arc beside a sim clock is exactly the kind
of drift that breaks it. Being airborne means precisely one thing in the sim: `low` walls — the
seat rows, the sponsor tables, the counters, the walls light already crosses — are not there for
that body. Everything else is still a wall in the air, and `tests/jump.test.ts` holds that.

Measured, at her frozen top speed: **2.9 m of ground per hop**. Chapter 1's seat rows are 0.72 m
deep at 1.9 m spacing, so a hop timed at the row clears it and lands in the gap. Chapter 4's seat
BLOCKS are 7.2 m deep, so the same hop lands her in the seats and the usual push-out returns her
to the side she came from — with the block's own `why` line, *"seats. Use the aisles"*. That is
not a failure case that needed designing around; it is the room telling her the truth.

The cooldown is one airtime counted from take-off, so mashing `E` gives a 50% duty cycle: a run of
hops with a footfall between each, never a hover. Droid and Biggy refuse in their own voices, per
CLAUDE.md, and the refusals are true rather than decorative — Droid's one weakness is leaving the
floor, and he is the one who goes up by climbing.

**The part that took the thought.** `E` already means use / climb / brace / lift / play inside the
chapters, so folding two more verbs onto it is an ordering problem, not a rename. `ChapterRuntime.key`
now returns `boolean | void`, and `game.ts` spends the key on the hop or the grab **only on a flat
`false`** — the chapter saying "I looked at `E` and it means nothing where you are standing".
A chapter that has not been taught to answer returns `void`, which means "no answer", and the
fall-through does not fire. Silence is deliberately not consent: every chapter's `E` branch ends
in a `ctx.flash('nothing to reach here')`, which is very much using the key, and reading that as
permission would have the robot hop and complain in the same frame. So this arrives one chapter at
a time. **Chapter 4 is taught; chapters 1, 2 and 3 are not yet**, because all three of those files
were held by other agents this round — the jump is live in the keynote room and lands in the other
three as the files come free.

**Rejected.** Detecting "the chapter did nothing" by watching whether it raised a toast. It would
have worked today, with no chapter edits at all, and it couples the key routing to a chapter's
choice of whether to say something — the first silent branch anybody writes breaks it, and it
would break by making a robot hop, which is the hardest kind of bug to attribute. Also rejected:
gating the jump behind a puzzle before it exists as a verb. He asked for both halves and the
for-fun half is the one that gets found.

**Also recorded, not built.** *"ah Another thing to handle later. Biggy should really roll, at
least when he's pushed!"* — he flagged it as later himself. It is in `docs/playtest-notes.md` with
the split that matters: wheel spin keyed off his own speed is a render change and cheap; rolling
resistance instead of the flat drag he shares with the other two is a frozen constant, and
therefore his call a second time.

### …and chapters 1 and 2 were taught it the same night

The commit above shipped the `E` fall-through with only chapter 4 opting in, because the other
three files were held by other agents mid-round. Two of them came free an hour later, so:

**Chapter 1** — the room Michele was actually thinking of. Its seat rows are `low` walls 0.72 m
deep at 1.9 m spacing, which is exactly what one hop crosses, and Voxxy's `E` in that chapter had
never meant anything: everything in it is typed at a keypad, and the climb belongs to Droid. The
climb, the projector panel and the panel's own "too high, even for me" refusal all still claim the
key; nothing else does.

**Chapter 2** — only **Voxxy's** dead end hands the key back, and that is the whole point.
`'Voxxy: nothing to plug in here'` is gone, replaced by a hop in open floor and by taking hold of
Biggy when she is against him — which is Michele's *"Why space and not e for catching? I'd keep it
to one key"*, answered by ordering rather than by a rename. Droid and Biggy keep their own last
words (`'nothing to reach here'`, `"I don't do buttons. I do doors."`), because in that room those
say more than a refusal to jump would, and neither of them can jump anyway.

Chapter 3 is still owed; its file was in another agent's hands both times.

**The tests were driven against the old code before they were kept.** Three of the six new
fall-through cases fail against the untaught chapters and three pass either way — the three that
assert the chapter KEEPS the key, which it always did. That split is the point: a test that cannot
fail is not describing the change.

102 of 102 green across `chapters`, `aisle`, `tow`, `keypad`, `ch2-chain` and `jump`.

---

## Session — 23 Sep 2026 — where the beer actually goes (agent)

**Agent:** builder, scope `src/sim/chapters/ch3-breakfast.ts`, `src/sim/crates.ts`, the new
`tests/beer-bar.test.ts`, and three additive lines in another agent's `tests/prop-geometry.ts`.
Four other agents were live in the same working tree throughout.

### What a human decided

Michele, on the proposal that Biggy stack the crates behind the catering counter:

> *"ok but remember biggy can't reach the soup without voxxy's help. So it should be a different
> path, with clear hints. (glowing halo, taps ready, belgian beer glassess)."*

and, earlier, on the crates themselves:

> *"the beer joke / game is fine, keep it. But where should biggy take 'em? Of course they'll need
> to look like beer crates, with funny names."*

Both are design calls, and the build follows them rather than arguing: the drop is a **bar**, it
stands outside the catering block, it is signposted with a glowing halo, and every crate carries an
invented Belgian brewery.

### What the agent measured before it moved anything

The brief's own instruction was *"Measure it — flood-fill Biggy's reachable ground with the crowd
standing where it stands"*, and the measurement contradicted the brief's premise, which is why it
was worth taking. A flood fill of the exhibition hall at Biggy's frozen 9 px radius, treating every
person in a catering queue as a solid disc:

- the **old** drop (`BEER_STACK` at 346,112, hard against the catering block's east flank) was
  already reachable from the pallet without touching a queue — a 244 px route straight down the
  north aisle. The beat was not charging the soup's gate twice, whatever it looked like on screen;
- what was actually wrong with it was legibility and room. It sat in an 11 px slot between the
  catering block's east wall and a roof column, read as part of catering, and was "a marked patch
  of floor" rather than a destination;
- and the same fill found something nobody had asked about: **the soup's gate leaks.** A catering
  doorway is 44 px wide, the queue standing in it is two files 10 px apart, and at Biggy's radius
  that leaves about **11 px of clear centre line** beside the people — he can drive in without
  Voxxy saying a word. Clearing the queue widens that window to 27 px, so the mechanic does
  something, but it does not do what the chapter's text claims.

That last one is **recorded, not fixed**: the soup gate belongs to another beat and tightening it
would re-tune somebody else's chapter mid-round. `tests/beer-bar.test.ts` therefore asserts the
true thing (clearing the queue *widens* the doorway) and says in a comment why it does not assert
the sealing a reader would expect — a test that claimed it would be a false pass. The one-line fix
when somebody wants it: stand the queue's two files across the doorway's width rather than 10 px
apart, or give the front rank the full gap when `open` is 0.

### What was built

**The Finally Block** — a bar counter built for tonight in the open north aisle, its back to the
hall wall, immediately east of the catering block. 92 x 14 px, a `low` wall (light crosses it,
robots do not) pushed by the chapter rather than by `groundWalls()`, because it is not the building.
Three taps and four Belgian glasses stand on it; the delivery stacks at its cellar end, beside the
taps, instead of growing under the player's feet on the mark. The measured route from the pallet is
**228 px with all three queues standing — a straight run west along the north aisle, +16 px of
spare clearance at its tightest point, and never closer than 70 px to anybody in a queue against
the 15 px at which they would touch**. It never enters the catering block at all. The whole
two-trip delivery is 30.5 s of driving, and the greedy line — five crates, heap error, scatter,
pick the load back up — is 28 s.

**The halo.** `halo(rect, state)` lays four thin `dropzone` strips round any rectangle. It needs no
render code: `STATE_EMISSIVE` already lights an `active` prop amber and a `done` one green, so the
ring speaks the state colours the rest of the game is already using. Chapter 3 wears it three times
— the pallet the crates start on, the bar they go to, and the spot the soup goes to — which is the
point: Michele has asked for *"a red halo to signal it's interactive"* twice, and the prize is one
visual language for "you can use this" rather than one beer decoration.

**Six breweries** (`CRATE_BREWS`), in the register of the sponsor list next door: Brouwerij
Dubbel-Checked, Lambiek Lambda, Tripel Equals, Gueuze Collector, Saison Stacktrace, Abdij van de
Heap. Every one invented — `Dubbel`, `Tripel`, `Lambiek`, `Gueuze`, `Saison` and `Abdij` are beer
styles and ordinary Dutch words, not anybody's trademark, which is the whole reason the list is
built out of them. Biggy reads the name off every crate he lifts, and Droid and Voxxy name the one
they cannot.

### Rejected

- **Moving the drop to the concourse south of the catering block**, which is where a bar would go
  if the plan allowed it. Measured: a 564 px route that squeezes round the catering block's
  south-east corner with zero clearance to spare, into a 44 px corridor between the block and a
  stair shaft. Four legs of that is a hike, and the brief's own warning applies — *"if the route is
  tedious to drive, it will be worse for him"*.
- **Putting the bar in the lane at x 336..395**, the only north-south connection on that side of
  the hall. A 7 m counter there cuts the hall in two.
- **Lighting both the drop plate and its halo.** Two signals for one promise; the plate now behaves
  exactly as the soup's always has and the ring carries the glow.
- **Editing `src/render/scene.ts`.** Another agent held it. The three new prop kinds therefore draw
  as `PROP_FALLBACK` boxes today — the counter reads, the taps and glasses sit inside it and are
  invisible — and the four-line `PROPS` patch that finishes them is in the handback rather than in
  the tree.

### Verification

A throwaway `git worktree` at the session's own commits with `node_modules` symlinked, four other
agents left alone in the shared tree: `tsc --noEmit` clean, `vite build` clean, the new file green
four runs in a row, and the chapter-3 block of `tests/chapters.test.ts` green. The full suite on
the loaded box reports its usual timeouts under four concurrent agents; the two real failures at
that moment were the collider sweep's *"classifies every kind"* (this session's three new prop
kinds — fixed here by classifying them) and chapter 2's `sign`/`crate` walk-through, which
reproduces at clean `HEAD` without this work and belongs to whoever holds `ch2-expo.ts`.

Then the built page driven headlessly on `?chapter=3&warm=2&nofog=1&topdown=1&seed=7`, stepping the
sim with `game.update(DT_MAX)` in real time rather than trusting `requestAnimationFrame`: both
trips driven, four crates then two, the toasts naming the breweries, `beer ✓ (The Finally Block is
stocked)` on the progress line, Biggy's mass and acceleration back at the frozen 7 / 0.6, the halo
strips going from `active` to `done`, and `document.title` reading `After Dark · ERRORS:0` with an
empty error list.

And one change came out of *looking* at that build rather than out of a test: the first screenshot
put the counter in the last twenty pixels of the diorama frame, at the very top of the hall. It
came 6 px off the wall and grew to two metres deep — counter plus back bar — so the mark in front
of it lands clear of the frame edge, and the taps and the glassware moved to the counter's front
lip, which is the face the camera is on. The back face still leaves only 6 px to the wall, which is
deliberate: any wider and there is a pocket behind the bar for a robot to get stuck in.

---

## 2026-09-24 — three lighting notes, and the one bug behind two of them (agent)

**What the agent was asked to do.** Three complaints from Michele's chapter-1 playthrough, all
about what the player can SEE, all in `src/render`, none allowed to touch the sim: *"Droid now has
no flashlight but a bigger halo… The other two lost the halo"*, *"Sometime a small light ray seems
to be active?"*, and *"I don't know if it's me, but green and blue on the hints are too similar."*
The brief said to measure first and named the light skirt's annulus as a suspect. It was right, and
it was right about more than it knew: notes one and two are the same bug.

### The annulus was a profile with no geometry to carry it

`SKIRT_RANGE` is a 24 px pool of a robot's own colour at its own feet, reshaped last round into an
annulus so it would stop washing out a solved clue's numeral. The reshape was written as a radial
profile evaluated **at the vertices an ordinary pool already has** — the fan's apex and the sim
polygon's rim. A triangle fan interpolates linearly between those two rings, the annulus profile is
zero at the apex (the hole) and zero at the rim (the falloff's end), and zero to zero is zero
across every pixel in between. On open floor every skirt ray runs its full 24 px, so every rim
vertex sat at the profile's far zero and **the skirt drew nothing at all**. Droid kept a halo
because his LAMP is a pool — a real fan with a bright apex. Voxxy and Biggy carry cones, so the
skirt was the only thing they had at their feet, and they lost it. That is note one, exactly as he
reported it.

Note two falls out of the same arithmetic. A ray stopped early by a wall lands at an interior value
of the profile, where it is NOT zero — so the only part of the skirt that ever drew was the handful
of rays that hit something. Swept over chapter 1's free floor on a 10 px grid, 4349 positions per
robot, counting how many of the skirt's eighteen rays carry any light:

| | 0 rays (no halo at all) | 1–6 rays (an isolated wedge) | more than 6 |
|---|---|---|---|
| Voxxy, as shipped | 2806 (64.5%) | **1229 (28.3%)** | 314 |
| Droid, as shipped | 2795 (64.3%) | **1239 (28.5%)** | 315 |
| Biggy, as shipped | 2741 (63.0%) | **1279 (29.4%)** | 329 |
| any robot, now | 50–120 (1–3%) | **0** | 4229–4299 |

Two thirds of the time nothing; a bit under a third of the time a narrow wedge of the robot's own
colour pointing at whatever clipped it. *"Sometime a small light ray seems to be active?"* is that
wedge, and it needed no separate fix: it is note one seen from the other side.

**The fix is vertices, not numbers.** A profile with a peak in the middle needs a ring of vertices
in the middle. Each floor mesh now carries three concentric rings of the sim's polygon — hole, peak,
rim — and a second index block joining them, and a skirt draws that block instead of the fan. Radii
are pulled in to each ray's own occluder and the peak fades with how far the ray got, so a wall
still cuts the skirt exactly where it cuts the sim's polygon. Nothing about the sim's polygon, or
`clueLit`, moved.

Measured on staged frames, the annulus band (sim radius 10–22 px, sampled away from the cone) with
the bare floor just outside it as a control:

| | mean L | p90 L | the lamp's own colour | band RGB |
|---|---|---|---|---|
| Voxxy | 16.1 → **59.9** | 28.6 → 89.8 | 22.7 → **112.9** | (13,16,24) → (97,52,32) |
| Biggy | 16.8 → **53.3** | 32.6 → 79.7 | 32.8 → **127.6** | (13,17,26) → (32,54,111) |
| Droid | 151.5 → 189.7 | 180.4 → 221.4 | 222.4 → 287.7 | (61,182,112) → (89,223,160) |

The RGB column is the point. What Voxxy and Biggy had at their feet before was not a dim halo, it
was the white key light and the spotlight's floor wash — **neutral**, and in Biggy's case slightly
blue only because his own spot is blue. Now it is their lamp colour. The bare floor at 34–46 px is
unchanged to two decimals (4.84 / 4.88), so the skirt kept its reach.

**And it did not go back on the robots or on the numeral.** A fixed box over each robot's body,
sized in metres so it is the same box at any capture resolution: p90 luminance 162.91 → 162.91
(Voxxy), 115.27 → 115.27 (Biggy), 159.15 → 159.61 (Droid) — at most 0.3%. For the numeral, the
worst case is a robot standing exactly at the annulus's brightest radius, 1.12 m from a solved
clue, beside it rather than on it: the floor inside the clue's ring rises 71.2 → 84.8 of 255 and
the numeral's contrast falls 112.7 → **104.1, a 7.7% cost**. The un-holed disc this replaced cost
that contrast 65 → 16, a 75% cost. At the skirt's rim (1.92 m) the numeral is *better* than before
(128.0 → 136.5), and at 4.4 m it is much better (68.5 → 105.5) — for a reason that belongs to the
third note.

**Measuring a robot standing ON a clue turned out to be meaningless**, and the screenshot says why:
from an isometric camera Biggy's body covers the marker completely. That case was quietly dropped
rather than reported as a number about a numeral nobody can see.

### Green and blue: the perceptual metric says hue was never the problem

The brief asked for the two arcs' distance in a perceptual space. Measured over three frames of the
marker's own pulse, at the zoom the game is played at, **CIEDE2000 between the two rendered colours
was already 32.65** — an enormous distance; anything over about 5 is "obviously different". The fix
moves it to 33.31, which is nothing. Reporting that honestly is the point: hue distance is not what
failed.

What failed is size and adjacency. At the diorama's zoom a metre is 34 px across and half that down
the screen, so the old ring's 0.2 m thickness is **three pixels**, and the two arcs shared one
circle — mean sample radii 6.77 and 6.19 sim px, a radial separation of **0.79 screen px**. Two
three-pixel slivers of a small ellipse, touching, at 60–90% opacity, over a floor that can be
anything from black to a green wash.

So each robot now owns a **slot at its own radius**, drawn as a whole ring rather than an arc of a
shared one: Voxxy inner (0.38–0.56 m), Droid middle (0.64–0.82), Biggy outer (0.90–1.08) — smallest
robot, smallest ring. A slot a clue does not need is simply not drawn, so the recipe still reads.
Under the slots is a near-opaque dark backing ring, because the marker is drawn over the additive
floor pools and a 0.6-opacity colour composited over a three-lamp wash is no longer the colour it
is trying to name.

| | before | after |
|---|---|---|
| ΔE00 (green, blue) | 32.65 | 33.31 |
| green rendered RGB | (101,151,124) | (117,175,144) |
| blue rendered RGB | (78,99,138) | (95,122,167) |
| radial separation, screen px at 1280x720 | **1.6** | **8.9** |
| sampled area, green / blue | 9610 / 14225 | 19748 / 25547 |

Five and a half times the separation, twice the area, and the colours land closer to their own lamp
values because the backing stopped the floor eating them. The dark backing is also why the numeral
got easier to read at distance: it darkens the floor inside the marker by 15–46 of 255.

### What was rejected, and why

- **Changing the lamp colours.** `DEFS` is frozen, the colours are the robots' identity in
  CLAUDE.md, and the whole light-mixing puzzle is built on them.
- **Suppressing Droid's mirror bounce.** A sweep of the whole first floor on a 12 px grid found
  exactly one directional light the sim ever gives Droid — the cinema-E screen's reflection, 119
  grid positions, all inside room E, all `primary: false`, range 90. That is the designed mirror
  mechanic and it is what lets a robot light the alcove clue at all. It is not the stray ray, and
  the stray ray was not suppressed either: it was the skirt, and it is gone because the skirt now
  draws properly rather than only where a wall clipped it.
- **Raising `SKIRT_PEAK` to compensate.** It went 0.30 → 0.34 and no further; the annulus was never
  dim, it was absent, and the numeral's 7.7% is the budget.
- **Touching `src/sim`.** Nothing in this round did. `tests/lights.test.ts` and the chapter
  choreographies pass unchanged — 260 of 260.

### Two things about measuring this build that cost most of the round

**The camera eases in SIM time, and the sim was running at a tenth of a frame a second.** Ten other
headless chromiums were on the box; swiftshader gave this page one rendered frame every eight to
twelve seconds. `updateFocus` eases at 6 s⁻¹ of game time, so a three-second wall-clock hold bought
a tenth of a sim second and every "settled" frame was mid-pan — one of them was framed 94 sim px
away from where the harness thought it was, which is how the first round of numbers came out
nonsense. The fix is not to wait longer: `updateFocus` **cuts** instead of panning when the target
jumps more than `FOCUS_CUT_PX`, so every pose is now staged by parking the robot in a far corner
first. Two cuts, both instant, framed correctly within two rendered frames however slowly they
arrive.

**A debug `place()` is not a placement.** The sim resolves collisions afterwards, and a robot parked
inside geometry gets shoved a little further every tick — Biggy, mass 7 and drag 0.35, ended up 500
px off the map and a "halo" frame was a photograph of an empty corridor. Every staged pose now
records where the robot actually IS and retries until it is within 2 px of where it was asked to be,
and the projection is computed from the recorded position rather than the requested one. The
projection itself is derived from `camera.ts` — azimuth, elevation, the focus rect clamped to the
view, the reserved HUD band — and checked on every frame against the clue marker's own pixel
centroid: **1.0 to 1.2 px** of error.

## 2026-09-24 — the robots themselves: Biggy's lower body, a wear bug, frenetic arms, a jump pose (agent)

Michele, tonight: *"Polishing the graphic, making people and stands real etc."* Two other agents had
the venue stands and the crowd; this half was `src/render/robots/` and nothing else. Everything
below is off `docs/playtest-notes.md`'s "Looks — deferred by him" and "Structural" tables, and every
number in it is measured rather than asserted. **`src/sim` was not touched.**

### 1. `weather()` was clamping per channel, so rust on a dark panel came out pale

The function writes vertex colour as a *ratio* against the material's own colour and clamped each
channel at 6 independently. Clamping channels one at a time throws the tint's **hue** away — the
channel carrying the rust saturates first — so what came out on a near-black panel was a brightened
copy of the base colour: the "white flakes" the structural table had been carrying.

Measured before the change, on the brightest vertex of every mesh, as a gain over that mesh's own
panel luminance:

| robot | meshes over 1.05x | over 2.5x | 4x or more | peak | vertices pinned at the channel clamp |
| --- | --- | --- | --- | --- | --- |
| Voxxy | 0 | 0 | 0 | 1.00x | 0 |
| Droid | 82 | 28 | 15 | 6.00x | 53, in 11 meshes |
| Biggy | 41 | 7 | 0 | 3.33x | 18, in 3 meshes |

So the backlog's guess — *"Voxxy and Droid almost certainly have it"* — is **half right, and the
wrong half was the one everyone had been looking at.** Droid has it badly; Voxxy does not have it at
all, because every one of her wear calls lands on orange or white.

Fixed in the function, not with a third local workaround: cap the patch's linear luminance at 2x the
panel's own and scale all three channels by the same factor, so the tint keeps its hue exactly and
only its brightness is held down. After: peak 2.00x on both, nothing pinned, and every mid-tone
panel (all under 1.5x) untouched. `tests/robot-motion-and-wear.test.ts` asserts both halves.

Biggy's local `darkWear` stays and is re-documented as what it now is: an art choice (rubber and
work gloves collect soot, not the rust that eats painted steel), not a patch over this bug.

### 2. Biggy's lower body — *"a bit better, but still squarish"*

Three separate things, and only one of them was the one in the note.

**The belt plate** was a `roundedBox` pinned at a constant z. Fine while the trousers were a box; on
a sweep that runs from 0.42 m of radius at the waist to 0.30 m at the hem, its flat back face stood
**70 mm off the shell at its bottom edge**. It is a `revolvePatch` now — new in `rig.ts`,
`ovalPatch`'s sibling for a lathe — generated ON the profile, so it cannot have that failure by
construction.

**The sawtooth where the undercut meets the right leg** is not the undercut and not one leg. Found
by bisection: a temporary global handle on Biggy's root, then hiding one mesh at a time in a live
headless build and shooting each. `bellows()` opens on a *waist*, so the concertina's top ring is
0.089 while the plain cylinder above it ended at 0.104 — a 15 mm annulus of that cylinder's own
**downward-facing** cap showing all round the top of each leg, unlit, with a 20-gon on one edge and
a 28-gon on the other. The dark band's width beat between the two facet counts and drew a row of
black triangles. The cylinder now closes on the bellows' own radius at the bellows' own segment
count.

**The proportions were inverted**, which is most of why it read as a grey mass with a skirt under
it. On the FRONT VIEW panel at 283 px/m: gut lip 0.417 m, orange from 0.353, hem 0.223 — a **64 mm**
dark band over a **130 mm** orange one, and a block that narrows 5% from waist to hem. Ours was
**137 over 85**, with a hem at 0.68 of the waist. Two causes: the undercut's 60 mm skirt was 5 mm
*wider* than the trousers, so it stood in front of the orange rather than behind it; and the trouser
profile took a third of the width out over 0.145 m. After: 77 over 145, and a barrel with a rolled
hem.

The hem at the sheet's width also fixed something nobody had connected to it: the legs used to leave
through the *side* of the sweep and through the flat side faces of the old dark slab, at
x = ±0.275 against legs at ±0.255. They now leave through a flat bottom cap — one circle at one
height per leg, nothing to alias.

His widest point about his own axis is **0.7220 m at y = 0.326, before and after to four decimals**,
so `DEFS.biggy.r` is untouched. Cost: +1 mesh and +1544 triangles on Biggy alone.

### 3. *"Voxxy's arms are frenetic at speed"* — and the tanh behind it went too

Measured off the bone: her shoulder was running at **30.3 rad/s, 1735 degrees per second**, because
0.85 rad of swing has to be covered inside a 0.179 s cycle. The cadence was already bounded and the
swing was not. Arms now carry the limit an actuator has — a peak angular rate, 12 rad/s — and
because it is a *rate* it binds only on the robot that was breaking it: Voxxy 30.3 → 12.0 at
5.8 m/s, **Droid 3.4 and Biggy 6.4 untouched**, and Voxxy's own walk at 1 m/s untouched at 9.3.

The brief asked whether `gaitSpeed`'s `tanh` compression still does anything and to delete it if not.
Measured with and without, driving each rig at a steady speed for 5 s at 480 Hz:

| case | leg cadence | arm peak rate | knee fold | stance foot travel |
| --- | --- | --- | --- | --- |
| Voxxy 5.8 m/s, on | 5.60 Hz | 30.3 rad/s | 2.36 rad | **2.69 m/s** |
| Voxxy 5.8 m/s, off | 5.60 Hz | 30.3 rad/s | 2.35 rad | **5.80 m/s** |
| Biggy 4.7, on / off | 5.00 / 5.60 Hz | 5.7 / 6.4 | 1.86 / 1.83 | 2.67 / 4.74 |
| Droid 2.3, on / off | 2.00 / 2.60 Hz | 2.7 / 3.4 | 1.31 / 1.30 | 1.94 / 2.37 |

**It was not preventing the thing it existed to prevent.** At Voxxy's top speed the cadence, the arm
rate and the knee angle are identical either way, because `MAX_STEP_FREQ` and the over-striding rule
bind first and bind the same way. What it *was* doing is breaking the promise `gait.ts`'s own header
makes: a planted stance foot travels backward at exactly the body's speed. With it, Voxxy's foot
travelled at 2.69 m/s while she moved at 5.80 — she skated forward at 3.1 m/s, and so did the other
two. Without it, foot travel equals body speed on all three. Deleted. One fewer fudge in a
submission scored on physics realism.

### 4. Voxxy's hop has a pose

`updateRobot`'s options take an optional **`hop?: number`** — 0 on the ground, 0..1 across the
airtime, i.e. exactly `hopPhase(bot)` from `src/sim/bot.ts`. It defaults to 0, so every existing call
site is byte-identical (asserted). The pose is built from two shapes of that one number, so it is
continuous at take-off and landing with no blend parameter to keep in step: knees up and heels back
on the way up, the leg straightening and the toes coming up on the way down, **both long arms thrown
up and out at the top** — the arms are the longest thing on her and the part of the sheet that makes
her *her* — then swung forward to catch. The antenna nub is whipped by the same term. Contact is
cleared for the whole arc, so `src/main.ts` stops firing footstep audio at a robot 30 cm off the
floor. `src/render/scene.ts` still owns the height and was not edited — it is another agent's file
this round.

### 5. Droid on Biggy, and `boltRing`'s rivets

*"Droid sitting on Biggy reads well only from some angles."* This game has one camera, so that means
the one that matters, sometimes. Shot from it, the failure is specific: **nothing of his legs
appeared outside Biggy's outline.** Hips rolled 0.58 and thighs 0.52 forward put both knees inside a
dome 0.88 m across, so what the camera got was a torso and a head standing out of a ball with two
blue flecks where his shins surfaced through the shell. The legs are posed to make a silhouette now
— hips to 0.92 takes each knee past the dome's 0.44 m flank, the thigh comes further forward, the
shin folds back hard so the foot tucks against the helmet rather than hanging into the gut below it
— and both hands come down onto the crown instead of being held out sideways like a scarecrow.
*Partly* fixed: his thighs still pass through the dome shell rather than over it, which is a
`mountLift` question as much as a pose one.

`boltRing`'s `aimFrom` is a sphere's normal. On Biggy's dome ring the helmet's own profile runs at
dr/dy = −0.56, so the true normal stands **29 degrees** above horizontal while `aimFrom` pointed the
rivets at **41**. New `aimSlope` takes the profile's dr/dy and is exact for any surface of
revolution.

### What was rejected, and why

- **Deleting `gaitSpeed` outright.** It is the identity now, but `src/main.ts` derives footstep
  audio from it and that file belongs to another agent this round. It stays as `max(0, mps)` with
  the measurement written into its doc comment, and the note that the call site can inline it.
- **A third local workaround for `weather()`.** The brief asked for the function to be fixed and it
  was; Biggy's `darkWear` survives only because it turned out to be a defensible art choice.
- **Promoting the other three helper sets into `rig.ts`.** `voxxy.ts` carries twelve of them —
  `profileSampler`, `onRevolve`, `revolveLoop`, `revolveArc`, `seam`, `revolveStud`,
  `ellipsoidMount`, `bandRing`, `revolveMount`, `uvPatch`, `squirclePatch`, `glossMaterial`. The
  move is mechanical and would be a real reduction, but it is only allowed if it changes no
  silhouette and that has to be proved frame by frame, which is a round of its own. `revolvePatch`
  and `boltRing`'s `aimSlope` are the two pieces of it that this round's own work needed.
- **Re-tuning anything in `src/sim`.** Nothing did. The frozen constants and the collision radii are
  untouched, and Biggy's widest point is unchanged to four decimals.

### One thing worth knowing for the next round

**`revolvePatch`'s winding is silent when it is wrong.** The first cut of Biggy's belt plate and dark
centre shipped completely invisible, and the build reported no errors: the index order was
backwards, `computeVertexNormals` flipped the normals with it, and back-face culling threw both
patches away. It cost a full build-and-shoot cycle to notice, on a machine where that is four
minutes. The winding rule is now written out in the function.

**The mount-pose change is in the `fix(biggy)` commit** rather than in the gait commit before it —
it was made after the gait commit and swept up by the next `git add`. The commit message does not
mention it; this entry is the record.

## 2026-09-24 — the twelve sponsor stands (agent)

### What Michele asked for

*"Polishing the graphic, making people and stands real etc."* Two agents split it; this one took
the **stands** — the twelve sponsor booths on the exhibition-hall floor. The people were somebody
else's half and were not touched.

Two earlier notes of his bore on it, both already in `docs/playtest-notes.md`: *"the orange thing
and the big black thing with halo (is it a booth? in the middle of the stairs?)"*, and his standing
call for when looks and precision pull apart, *"I vote funny, robots must be recognizable"* — read
here as: a stand that is instantly a stand beats one measured off a photograph.

### The state it was in

`SPONSORS` has carried twelve names in `src/sim/geometry.ts` since the ground floor was built, and
the "why am I blocked" lines speak them. **None of the twelve was on screen anywhere.** Six built
booths were one `boothWall` slab across the whole 100 x 70 px rect with a 3 px LED stripe laid on
the back edge; six half tables were a single purple cloth over the same rect — eight metres by five
and a half of it. From the diorama camera the trade-show floor was twelve boxes.

### What the agent built

Off `media/other-images/image-1790032630885 / -637969 / -650288 / -655131.webp`, in the order you
actually read a stand at that show, and that order is the design:

1. **a flat panel of one brand colour with the name on it** — read from across the hall;
2. **a slim lit totem out in the lane** — read at head height when the panel is behind a crowd, and
   the hall shot is full of them;
3. **a carpet tile with a white taped edge** — separates a stand from an aisle more cheaply than any
   furniture, and it is the single most effective thing in the whole change;
4. only then furniture: counter, black metal high tables, white tub stools, planter, giveaway bowl.

Built stands are **enclosed** — back wall 3.0 m, two side returns, a counter across the front —
because the sim says a built booth is solid across its whole rect and drawing an open stand you can
see into would call that a lie. The counter is 0.95 m rather than the venue's usual `LOW_H` 0.78: in
this game 0.78 is the height of the `low` walls Voxxy can jump, and a stand front is not one of
them. Half tables keep the full-rect cloth (that rect *is* what Voxxy goes under) and carry their
name on a printed cloth over the top, a roll-up banner standing on the table and a printed valance
across the open side, with half a metre of the crawl gap still showing under it.

The named jokes land: Sticker Mine's **three shelves at 0.62 / 1.24 / 1.92 m**, which is chapter 3's
Droid-only reach gate drawn instead of narrated; Rubber Duck Inc stacked with ducks; Regex Racing's
chequered apron; The Coffee Sponsor's queue of cups; Legacy Systems SA's beige boxes; Monolith
GmbH's one deployable, which does not fit on the table and which they brought anyway.

Everything is procedural: `three` primitives plus canvas textures, no external asset files. The
lettering lives in `signage.ts` with the venue's other lettering and shares its one painter and its
one `dispose()`; `ground.ts` says only where a panel hangs.

### Human decisions this round

- Michele's, in advance and standing: **funny and recognisable beats measured.** Applied to the
  straplines (`/^(a+)+$/ — do not run this`, `your flight will resolve shortly`, `COBOL support since
  before you`) and to the decision to print a table's *top*, which no real stand builder does, because
  the top is most of what a 31-degree camera sees of a table and it was the only surface big enough to
  carry the name.
- Michele's, earlier and unactioned here: *"staircase should be clear of booths in general."* The fix
  is in `geometry.ts`, which another agent held this round. See the handover below.

### What was rejected, and why

- **A truss arch over the aisles.** It is in three of the four reference frames and it is the most
  characteristic thing in the hall. At 3.2 m over an aisle, under a fixed 31-degree orthographic
  camera, it lands squarely in front of the stands behind it. A diorama pays for overhead structure
  in occlusion, and this one could not afford it.
- **Opening the built stands' fronts**, which is what the photographs show. The sim collides the
  whole rect; an open front invites the player to walk into something they cannot.
- **Shrinking the half tables to table size** and dressing the rest of the footprint as a stand
  behind them. It would look far better, and Voxxy is allowed through that whole rect — she would
  walk through the dressing. The cloth stays the size of the rect the sim gives her.
- **A new floor-standing prop anywhere in an aisle.** That needs a sim collider, which needs
  `geometry.ts`, which was held. Nothing new stands outside the booth, totem and crate rects.
- **`sponsorFascia` and `boothSlide`**, two painters written and then deleted: the stands ended up
  carrying their names on a back wall and a roll-up, and unused art is dead weight.

### Two things worth knowing for the next round

**Merging across objects breaks the collider sweep.** The first cut merged each stand's geometry
into one mesh *including its totem*, which stands out in the lane. `tests/colliders.test.ts`
measures bounding boxes, so one box spanning the stand and the totem swallowed the aisle between
them and the sweep reported six drawn solids with no collider — correctly. Per-booth merges are
fine; anything reaching outside the booth rect gets its own mesh.

**Emissive ignores the fog of war.** Re-using printed art as an emissive map at the 0.5 a corridor
lightbox gets lit the entire exhibition floor straight through chapter 2's blackout, and the
visibility polygon does not touch it. The levels are standby now (0.05 cloth, 0.08 back wall, 0.18
banner, 0.22 totem) and were tuned on measured pixels — the Kube Kettle panel goes 129 to 75 in
blue — rather than on how the crop looked. Anything else in this venue that wants to be visible in
chapter 2 will hit the same wall.

## The staircase, cleared — and a minigame that was played on it

**What the human decided.** Michele filed this twice, from two directions. A screenshot first:
*"the orange thing and the big black thing with halo (is it a booth? in the middle of the
stairs?)"* — and when I asked which object he meant rather than guessing, he answered with the
rule instead of the object: *"staircase should be clear of booths in geenral"*.

**Two separate faults in that one corner, and the dressing round exposed both.** Sponsor column 3
ran 880..980 against `GF.smallStairs.x = 952` — 28 px inside the stairwell, three booths deep —
and `boothTotem()` put a lit totem at 967..977, entirely inside it. That totem is the orange
thing. It survived rounds of review because an undressed booth is a grey block; the moment the
stands were given names it started announcing **Async Airlines** from the middle of a flight of
stairs. Dressing the stands made the fault easier to see, not harder, which is the argument for
doing the looks work at all.

The second fault was worse and nobody had reported it: **chapter 3's shuffleboard was played on
the staircase.** The duck and its target were laid out east of the Rubber Duck stand, which put
both inside `GF.smallStairs` and drew the target decal across the treads.

**What the agent did.** End-of-row stands are 60 px instead of 100, which ends column 3 at 940
with 12 px of daylight and moves the totem to 927..937. The 160 x 140 pitch does not move, because
`HALL_COLUMNS` is derived from these rects and the column grid phases against the bays — measured
before and after, the grid is identical, eighteen columns at the same eighteen positions.

**The duck lane took three goes, and the two failures are the part worth keeping.**

1. The 60 px aisle immediately west of the stand: both **ends** of the lane measured clear, and a
   roof column at x 853..867, y 333..347 sits squarely in the middle of it. Checking a route's
   endpoints and calling it clear is the exact mistake `aisle.test.ts` was rewritten to stop
   making, and it was caught here the same way — by a test that walks the whole lane, written
   before the fix rather than after it.
2. The aisle further north, at y 170: lane clear, target clear, **and Voxxy could not play it.**
   She lines up 22 px behind the duck, and behind it was x 902 — inside `GF.store` (x 900..1040).
   She was pushed out of the wall every shot and the duck never moved. A lane is not just where
   the puck goes; it is also where the player has to stand to hit it. The trace is in the notes
   because "the test passed and the game was unplayable" is the failure mode this repo keeps
   finding.

The scan that produced the shipped lane requires all four: the shove spot at 22, 30 and 40 px
back, every point of the 95 px lane at 10 px of duck clearance, the 22 px target ring, and 30 px
of run-off past it so a hard shove does not bury the duck in a wall. 91 positions survive; the
duck now sits in the aisle directly in front of its own stand.

**One thing the narrowing broke, and the test that caught it.** `The Coffee Sponsor`'s eight cups
were placed at a literal `r.x + 52`, which at w 60 put them in mid-air over a walking lane with no
collider under them. `tests/booths.test.ts` — written by the stands agent the same night —
reported it by position and size. They are anchored to the stand's right edge now.

**New: `tests/staircase-clear.test.ts`.** Five tests. No sponsor stand in the stairwell, none of
the booths' own furniture either (the totem named separately, because a stand can be clear while
the lit sign beside it is not), a real 6 px gap rather than a shared edge, the column grid pinned
at eighteen known positions so the next person to resize a stand finds out in a second instead of
in a screenshot, and the shuffleboard lane walked end to end. Nothing had ever asked whether an
object had been put somewhere absurd — every test in the repo asked whether a robot could walk
somewhere.

Full suite: 362 passed, 19 files, 0 failed.

## Chapter 3 was the last one taught, and it was reported from the other end

The `E` fall-through landed chapter by chapter as the files came free. Chapter 3 was last, and
nobody noticed it was missing by pressing `E` — the rig round found it while building Voxxy's hop
pose and could not get her off the ground anywhere in that chapter. The cause is worth recording:
**every branch of chapter 3's `key()` ends in a line of dialogue, and a line of dialogue was
claiming the key.**

So the rule that decides which branches hand it back is not "did anything happen" — it is whether
the chapter gave the player an ANSWER. *"No ladle. Droid, the shelf!"*, *"I am three crates deep"*,
*"That weighs more than I do. Considerably more. BIGGY!"* — those keep the key, because hopping
instead of saying one of them would be a worse game. Only the two genuine dead ends hand it back:
Voxxy with nobody to talk to, and Biggy with nothing to pick up. Two tests hold both halves, and
the second one is the one that matters: a refusal that names a reason must NOT hop.

`updateRobot` also takes the hop now, passed the same `hopPhase(bot)` the lift is drawn from, so
the pose and the height are two readings of one number rather than two animations that can drift.
The rig's own arc clears `st.contact` for the whole hop, which stops `main.ts` firing footstep
audio at a robot 30 cm off the floor — a bug that only exists once the feature does.

All four chapters are taught. 364 passed, 19 files, 0 failed.

## "This hint is flickering" — the clue plate was lying *in* the kiosk floor

Michele, chapter 1, with a screenshot: the marker's rings read as dashed arcs. The obvious
suspects were all wrong. The breathing pulse is smooth (`0.78 + 0.22 * pulse`, a 3 s sine), the
markers are drawn at renderOrder 19-21 above the fog mask and above every additive light pool so
nothing composites over them, the orthographic camera's depth range (0.5 .. 420 m) has 2.5e-5 m of
resolution to spare, and `surfaceY` is flat 0 on the first floor, so no stair steps under the
plate either.

The cause was measured off the built scene graph rather than guessed. The marker root sat at
`surfaceY + 0.02`, and `src/render/venue/floor1.ts` builds the glass kiosk's own floor as
`floorSlab(F1.kiosk, 0.02, …)` — an opaque, depth-writing box whose **top face is at y = 0.0200**,
4.48 m square. Chapter 1's clue 2 is at the kiosk's centre, so the dark backing disc and all three
slot rings, 2.16 m across, were *exactly coplanar* with it, to the last bit. Which of the ring's
pixels pass the depth test is then decided by float rounding in the rasteriser — and re-decided
every frame, because `updateFocus` eases the framing and slides the camera by a fraction of a
pixel. Arcs that break, and breaks that crawl.

Reproduced in a headless build, robot parked on the clue, nothing in the world moving but a
quarter-of-a-sim-pixel camera crawl between frames. Pixels of the marker's blue slot ring, six
consecutive frames: **292, 199, 268, 158, 219, 0** — the ring loses up to all of itself. The foyer
clue in the same frame, whose floor tops out at y = 0.0000 and which therefore has 20 mm of
clearance, renders whole throughout.

The same 0.02 had also buried clue 4 outright: the exit alcove is a `flat` prop, and `drawProp`
puts a flat prop's top face at `surface + h + 0.01` = 0.06 — four centimetres **above** the plate,
covering all of it. Same capture at that clue: **0, 0, 0** ring pixels on the old build against
**258, 258, 253** on the fixed one. That marker was not dashed, it was gone, and nobody had
reported it because a marker you have never seen is not a marker you miss.

Fix: one constant, `CLUE_PLATE_LIFT_M = 0.09`, which clears the kiosk plate by 70 mm and the
tallest flat prop plate by 30 mm. Same capture on the fixed build: **278, 286, 278, 285, 285,
284** — spread 8 px against 292, and the residual is the approved pulse's own edge antialiasing.
The plate is still a decal (70 mm is about two screen pixels at the diorama's 30° pitch) and it
still depth-tests, so a robot standing on a clue still hides the part he is standing on.

Rejected: switching the plate's materials to `depthTest: false`, which would have fixed the
flicker and thrown away the robot occlusion that an earlier round specifically added; and
`polygonOffset`, which fixes exact coplanarity but does nothing about the alcove plate four
centimetres overhead. One lift fixes both.

`tests/clue-plate.test.ts` is the acceptance criterion and it measures rather than restates: it
builds the real venue, asks the real sim for chapter 1's clues, finds the highest opaque floor
surface under each one, and reads the lift **off the call site** in `updateClues` so a named
constant nothing uses cannot pass. Against the old code it fails with
`clue "orange + blue" at sim(138, 440) lies on "kiosk", top y=0.0200; a plate at 0.02 is 0.0000 m
clear and needs 0.02`. Full suite at the time of the change: 398 passed, 20 files, 0 failed.

## "Still a walkthrough object on the doorway" — the fire door, and the state no sweep had ever looked at

Michele, playtesting chapter 1, with a screenshot: **"still a walkthrough object on the doorway,
add an animation + sound when it opens."** Biggy standing squarely in the fire doorway, his blue
flood pooled under him, a flat slab through his chest running from the left wall to him.

**Identified by reproduction, not by reading.** The HEAD bundle was built into a throwaway
worktree, served, and driven through CDP: park Biggy at the keypad, read the chapter's own code
out of `debug.chapter()`, type it, then put him at **607,350** — the middle of the drawn leaf.
He stayed there, `vx = vy = 0`, and the live wall list had **nothing** covering
`600..614 x 285..415`. The top-down shot shows the rust slab still spanning the whole corridor
with the robots standing in it. It is chapter 1's `firedoor`: `done()` called
`ctx.removeWall(fire)` on the whole 14 x 130 px corridor cross-section while `props()` went on
publishing a `firedoor` prop at that same rect, which `scene.ts` drew from its `PROPS` table as a
2.1 m solid whatever `state` said. Under Biggy's cyan flood its 0x8d3b2a rust reads grey, which is
why the screenshot looked like the chapter 2 roller.

**Why `tests/colliders.test.ts` came back green through all of it.** Its chapter sweep ticks
**four frames from the chapter's start**. At frame four the fire door is shut and its wall is
there, so the only state that sweep has ever measured is the state that was right. Every gate in
the game has the same shape — a drawn thing whose collider changes when the player solves
something — and that whole half of every chapter was invisible to it. (The venue's own static
`fire-door` slab in `src/render/venue/floor1.ts` was the same slab a second time, and was excused
for the same reason.)

**The fix is the rule CLAUDE.md already has.** `src/render/fire-door.ts` poses the door from the
chapter's live wall list and the sim's own swing clock, and `scene.ts` draws what it returns:
a leaf is only ever drawn where the sim has something solid, and a leaf the sim has no wall for is
not drawn at all. Walk-through stops being a bug that can come back and becomes a shape the code
cannot express. The venue's static slab is handed over to the chapter for as long as the chapter
publishes the prop (chapter 4, which seals the section again and publishes none, keeps it).

**Human decision (Michele, this round):** the sim half is his patch, in `src/sim/chapters/
ch1-night.ts` — the agent was told not to touch that file and handed the patch as text instead.
It turns the door from a slab across the corridor into what a fire screen across a 10.4 m corridor
actually is: a fixed `firescreen` panel either side, a 4.48 m clear opening with a pair of leaves
in it, and two `fireleaf` walls pushed where the leaves come to rest a quarter turn west. The
opening is free from the frame the code is accepted; the leaves are solid where they end up.

**One thing the round found by building it.** The first version started the swing and the exit
cutscene on the same frame — and `CUT_FADE` is 0.35 s, so the screen was black before the door had
moved. The animation existed and nobody would ever have seen it. The chapter now holds the
corridor, in `play`, for `FIRE_SWING_TIME + FIRE_CUT_DELAY` and hands over afterwards: you type the
last digit, the magnetic lock lets go, the leaves swing in front of you, and then the camera takes
over.

**Sound:** one new `SoundId`, `door-open`, synthesised like everything else — a highpassed noise
snap plus a short sine thud for the magnetic lock releasing, a slow band sweeping 940 -> 250 Hz for
the air round a heavy leaf, a narrow high-Q sawtooth glide for the hinge pin, and a low knock at
0.92 s for the leaf reaching its stop. Deliberately the opposite shape to `crash`: `crash` is an
impact with debris falling away from it, this arrives somewhere.

**Rejected:** dropping the prop from `props()` when the door opens, which is what cinema B's
`lock` does and what the jammed door used to do — it fixes walk-through by making the biggest
thing the player has just achieved cease to exist, the exact complaint that put `progress` on the
jammed door in the first place. Also rejected: keeping the leaf drawn and giving the *whole*
cross-section a collider again, which would have left the corridor sealed after the code went in.

`tests/fire-door.test.ts` is the acceptance criterion and it measures the renderer's own geometry
rather than restating it. Against HEAD's rendering rule it fails with `the OPEN fire door is drawn
at 600,285 14x130 px and a robot can stand at 600,322`.

## 25 Sep 2026 — three robots, one key: Biggy rolls and Droid stretches

**Michele asked:** *"Could we add a basic action to each robot on E? Voxxy jumps, Biggy rolls,
Droid? Stretches? Not needed for gameplay."* Until this round `E` with nothing else on it was
Voxxy's hop, and the other two were handed a line of flavour text and nothing happened.

**What the agent built.** Both flourishes go through the hop's own machinery rather than a second
one: a cosmetic clock on `Bot` (`flair`, `flairDur`), a phase accessor `flairPhase` sitting next to
`hopPhase`, one number 0..1 passed to the rig as `flair` beside `hop`, and the pose itself in
`gait.ts` — Biggy rocking his whole gut over and back a turn and a half like a weeble, arms
trailing counter to the body and the tin lid trying to stay level; Droid coming up out of his
standing crouch with both long arms overhead and an arch through the back, the way somebody stands
up after four hours at a desk. The rest (`hopRest`) is the same pocket all three tricks come out
of, so `E` cannot be mashed, and it was already zeroed in the two places a robot's history stops
mattering.

**The specification was the last clause.** *"Not needed for gameplay"* is enforced rather than
trusted: the flourish writes a clock and nothing else — no position, no velocity, no heading — and
the test asserts **zero** displacement against a wall placed one pixel away, not "a small amount".
A roll that moved Biggy would be gameplay: it would push whatever it reached, and the speed it
pushed at would have to be a frozen number. Reaching for the stick cancels a flourish, which is
what makes "it never moves anything" a property of the trick and not of the frames nobody steered
through. New constants (`BIGGY_ROLL_DUR`, `BIGGY_ROLL_ROCKS`, `DROID_STRETCH_DUR`,
`FLAIR_REST_FACTOR`) are documented as cosmetic timings and are deliberately NOT in
`tests/frozen-constants.test.ts`: a future round may retime a flourish because it reads badly on
screen, which is exactly the argument that may never be made about a physics constant.

**Every refusal speaks.** Five gates, each a true sentence in that robot's own voice: carried,
planted, already performing, still catching its breath, and — Biggy only — with Droid on his
shoulders, which is the one thing a robot cannot check about itself and the reason `partyTrick`
takes the whole cast. The old *"I go up by climbing, not by leaping"* and *"I could. The floor
would rather I did not"* survive inside the two new success lines.

**Chapters had to hand the key back.** With one trick, one dead end per chapter was enough; with
three it was not. Chapter 2 answered Droid with "nothing to reach here" and Biggy with "I don't do
buttons, I do doors", and chapter 3 answered Droid with the same — all three written when the only
thing behind them was *a refusal to jump*, which those lines beat. Against a robot rocking his own
gut they do not, so those three dead ends now return `false`. Every refusal that names a REASON
still claims the key.

**Left open, for the human who owns that file:** chapter 1 spends every Droid `E` on
`ctx.toggleMount()`, so he is the one robot with a room he cannot show off in. Nothing is
swallowed — he gets the climb's refusal in his own voice — but closing it is a one-line change in
`ch1-night.ts`, which the agent was told not to touch.

**Rejected:** moving Biggy — a displacing roll is gameplay by definition, and the frozen constants
would have had to grow a speed for it. Also rejected: letting `game.ts` fall through to the party
trick when a mount is refused, which would have reached chapter 1's Droid but killed the
"X m of daylight — come round beside him" line that exists because Michele could not climb on Biggy.

`tests/jump.test.ts` is now `tests/party-tricks.test.ts`, because the choreographies that were
about the hop are about a family. Every new expectation in it fails against HEAD.

## Round — the secondary staircases, measured off the plans (24 Sep 2026)

**What Michele reported:** *"The stairs position on the upper wall haven't been fixed."* — the
third time he has filed these. The first two are still open in `docs/playtest-notes.md`: *"The
secondary staircases are in the wrong place... they are lateral in the real hallway"* and note 18,
*"they seem fit for biggy to pass, make the passage more narrow"*. "Upper wall" is ambiguous
between the first floor's top corridor wall and the exhibition hall's two shafts, so both were
measured.

**What the agent did:** read the plan PNGs as pixels rather than by eye, and put every measurement
that produced a number into the doc comment beside it, as the rest of `src/sim/geometry.ts`
already does.

*Ground floor — wrong, and fixed.* On `plans/exhibition-floor-stairs-annotated.png` (900 x 1141)
both shafts run from a head wall at plan y **165** to a foot wall at plan y **323**; the west one
is plan x 222..269, the east one plan x 421..469. Through Michele's own calibrated mapping in
`docs/ground-floor-lobby-fix.md` (re-checked here against the small staircase and the toilets) that
is world `{144.6, 306.6, 226.4, 45.0}` and `{144.6, 494.1, 226.4, 44.1}`. The build had
`{150, 300, 200, 60}` and `{150, 430, 200, 60}`: the **top** shaft was almost exactly on centre
(329 against 330) but 15 px too deep and 25 px too short, and the **bot** shaft was **64 px too far
toward the middle of the hall**, which halved the gap between them — 70 px of hall where the plan
leaves 142. Michele's own rough read in the brief (y 262..331 and y 469..533) is **half right**:
the gap-halving and the bottom shaft are confirmed, the top shaft's centre is refuted.

*First floor — note 18 fixed, the position ESCALATED.* Measured on
`plans/devoxx-rooms-stairs-annotated.png`: the corridor is plan x 503..650 (147 px) and each flight
is a 20 x 64 plan-px rectangle hard against a corridor wall — left x 507..527, right x 627..647,
**both** at plan y 884..947, so the plan does put them exactly opposite each other. 20/147 of a
130 px corridor is **17.7 sim px = 1.41 m**, and Biggy is 1.44 m across: the real stair excludes
him by a centimetre, which is exactly what note 18 asked for. The mouth is now that, the well
behind it stays 40 px (a landing is wider than its door, as the ground-floor shafts already are),
and the renderer draws a 17.7 px flight with landings either side instead of steps the full width
of the well.

**What was NOT done, and why it is a human decision.** Plan y 884..947 is **63..126 plan px into
room 4/9's own 174 of length** — world x 1006..1113, about 150 px further along the corridor than
the build puts it, and not in the 3|4 or 10|9 gap at all. CLAUDE.md and GAUNTLET.md Stage 1 both
say *"secondary staircases between rooms 3|4 and 10|9"* and call it non-negotiable; Michele's own
`plans/README.md` says the same. So two things Michele wrote disagree, and a builder does not break
that tie. Moving the stairs to the plan's station also costs two things no measurement settles:
the well lands across rooms 4 and 9's **centred doorways** (the plan draws their doors flanking the
stair instead, world x ~976 and ~1135), and it walks past the descent waypoint chapter 1's closing
cutscene hard-codes as `nicheBot.x + 20, nicheBot.y + 30` — in a round where `ch1-night.ts` belongs
to another agent. Escalated to Michele with the numbers rather than shipped on the agent's reading.

**Also moved, as a consequence:** `SHAFT_DOOR` 34 -> 24, because a 45 px shaft less two 6 px walls
is 33 px of clear width and a 34 px door in it produced negative-height jambs; and `GF.laneX[0]`
370 -> 385, because at their measured length the shafts now end at x 371 and a chapter-3 visitor
snapped to a lane node inside a wall could never arrive.

**Tests.** `tests/geometry.test.ts` gains *"the staircases against the plan pixels"*: eight
choreographies that pin both floors to the plan measurements rather than to each other, which is
why the old ones kept passing while the build was wrong. Four of the eight fail against the
previous numbers, checked by putting them back. Nothing was loosened; the corridor-gap assertion
was rewritten to assert the narrowed mouth, which is the stronger claim.

## Round — the projector got a shape (24 Sep 2026)

**Michele, after his playtest: *"The projector still needs a shape."*** He was right in the
strongest possible way: chapter 1 names the projector in four places — cinema B's lock (*"the
release is way up by the projector window"*), cinema C's joke (*"projector says NO SIGNAL"*), the
`projector-panel` door override and the README's *"the projectors are cold"* — and the venue drew
**no projector at all**. Not a crude one. None. `grep -ri projector src/render` returned the
`PROPS` entry for the wall panel and nothing else.

**What was built.** `src/render/venue/projector.ts`: a projection booth over each auditorium's
door, carried on brackets off the corridor wall head, with a 35 mm machine standing on it — plinth,
head with an access door and two handwheels, lamphouse with vents, rear door and a pilot lamp, a
cooling stack with an elbow and a duct back into the wall, a stepped lens barrel with a brass focus
ring looking through a glazed projection port, feed and take-up reels on a spindle arm, conduit and
a sagging feed cable, and a rewind bench with a film can on it. It is venue fabric, not a chapter
prop, so it is wired from `buildFloor1`'s room loop and needs nothing from the sim — every mesh
sits above 1.24 m, which is why the collider sweep does not ask it for a collider.

**Four measurements decided the geometry, and two of them corrected the first cut.**

*The angle it is seen from.* The diorama camera looks along (0.21, 0.50, 0.84) and the machine
looks at the screen, which in a near-row house is on the camera's side: the player sees it nearly
down its own barrel, and the reels — the part that says "projector" — sit in a plane seen ~20 deg
from edge-on. The first cut put the bay on the left of the door, which yaws the machine **+12 deg**
and takes the dot product of a reel face with the camera from 0.21 to **0.03**: the reels rendered
as bars, which the screenshot showed plainly. The bay moved to the other side of the door (yaw
-12 to -21 deg, dot 0.38) and the reels became reels — a dark web, three spokes, a hub and a bright
rim, because a rim is a circle from any angle.

*Contrast, not colour.* Every chapter here is dark, and metals with no environment map go black
under ambient and hemisphere light alone: in the first build the machine was `mullion` and
`chafingSteel` and read as a black lump. The mass is now non-metallic mid-grey (`sectionCut`) with
pale accents (`concrete`), which is what makes the silhouette against Biggy's blue flood in cinema
D the shot that proves the round.

*Where it can be seen at all.* Raycast from a booth-height point toward the camera at all four
diorama pitches: over the **far** row the corridor vault swallows everything under 2.25-2.70 m, so
those decks sit on the rear wall's own head at 2.45 m; the near row is clear from 2.0 m up.

*What it must not stand in front of.* **This one failed a test first.** A bay 40 px left of the
door landed inside the sight line to zaal 6's numeral — `tests/venue.smoke.test.ts`, "leaves a
clear line from every Zaal numeral to the camera", the Stage 1 guarantee — because room 6 is the
one near-row room whose numeral hangs on that side. The fix is not a side preference but a
computation: `bayOffsetPx()` reads the numeral, poster box and talk strip spans out of
`signage.ts`'s own exported positions and stands outboard of all of them, **plus the sideways drift
of the sight line itself** — `tan(14 deg)` = 0.25 m of corridor per metre travelled toward the
camera, which is a third of a metre over the bay's depth. Clearing the panel in plan is not
clearing it on screen: the second attempt was 2 px clear of zaal 3's panel and still 30 cm inside
its sight line. Both failures were caught by the test, not by eye.

**Also renamed:** the bay's group was called `booth`, which is the word `geometry.ts` and
`tests/booths.test.ts` already own for the twelve sponsor stands downstairs. It is
`projection-room` now, so a failure message names the right object.

**Not done, and left for a human:** nothing in the sim changed — no footprint, no collider, no new
prop kind — so `src/sim/chapters/ch1-night.ts` was not touched. The far row's machines top out at
4.01 m, 11 cm above the camera's guaranteed band, and are seen from behind; if that ever reads
wrong the fix is to shorten the stack rather than to move the deck.

## "Still a walkthrough object on the doorway" — the *other* door: chapter 2's roller shutter

Michele's screenshot showed a mid-grey slab through a robot's chest. Chapter 1's fire door was
fixed in the same session; this is the second object with the same shape of bug, and the grey is
`PROPS.roller`'s own `0x7d8792`.

**The agent reproduced it on the built page before changing anything**, driving the real chapter
through the real break — Voxxy takes hold of Biggy on the top lane (`Space`) and runs him into the
shutter above `ROLLER_DOOR_SPEED`:

```
roller prop after the break: {"kind":"roller","x":894,"y":130,"w":6,"h":60,"state":"broken"}
walls still covering that rect: []
biggy placed at 897,160 (r=9) -> settles at 897.0,160.0   <- dead centre of the drawn leaf
```

`ch2-expo.ts` removes the `roller` wall on the frame of the hit and goes on publishing the prop;
`scene.ts` drew that rect from its `PROPS` table as a 2.6 m box whatever the state said. Worse than
the fire door, in fact: `venue/ground.ts` builds a *static* slatted shutter at the same rect in
every chapter, so after the break there were **two** doors standing in a doorway the sim had
already given up. The label was the same mistake in words — it still read `roller door — down`
about a door that had just been smashed open.

**The fix is the shape the fire door got, because it is the shape CLAUDE.md already prescribes.**
`src/render/roller-door.ts` poses the curtain from the chapter's live wall list and the sim's own
rise clock. No `roller` wall across the opening means no slat is drawn in the opening — whatever
the prop says, including a prop that has forgotten it was broken. Walk-through is not a bug that
can come back here, it is a shape the code cannot express, and `tests/roller-door.test.ts`
measures the module `scene.ts` itself draws from.

**A shutter does not swing, it goes up.** The sim gained one duration, `ROLLER_RISE_TIME = 0.42 s`
(a duration, not a speed, so the frozen rescale leaves it alone), published as `Prop.progress`. The
curtain is torn upward front-loaded, rattles in its guides on the way, and jams bunched and bulged
**into** the store — the way Biggy was going. It settles entirely above `ROLLER_CLEAR_M = 2.25 m`,
clear of Droid at 2.1 m, so the honest answer to "what is in the doorway now" is *nothing* and the
chapter needs no new collider. One new synthesised cue, `shutter`: the dead thud of the hit, five
bursts accelerating over the 0.42 s, and an inharmonic clang as it jams.

**Two decisions worth recording.** The glow is one: chapter 2's hall is in a blackout and the
robots' lamps are at floor level, so a curtain travelling up past head height leaves the only light
in the room — the first build's animation happened in the dark and read as the shutter simply
vanishing. It is now hot torn steel, cooling to nothing by the time it jams, off at both ends of
the clock. The other is that the venue's static shutter is hidden for as long as a chapter
publishes the prop, the way `fire-door.ts` already does with the venue's fire leaf.

### And the sweep that could not see either of them

`tests/colliders.test.ts`'s chapter sweep ticked **four frames from the chapter's start**, so every
gate in the game had its post-gate half unmeasured — the only state it ever measured was the one
before anything had happened, which is always the one that is right. It also did
`if (p.state === 'broken') continue;`, which is the exact line that excused this door twice over.

The sweep now runs a second pass **after each chapter's gate has been opened by playing it** — the
four digits typed at the keypad in chapter 1, the towed run-up into the shutter in chapter 2 — and
`broken` is no longer a free pass: a smashed door that is drawn standing fails. The post-gate pass
measures props against the *same* game's walls, which is also the first time anything has measured
the inside of the store, because the store is only reachable once Biggy has been through the door.
Both chapters come back clean and neither known-walk-through list grew.

**Flagged, not fixed:** chapter 3's registration gate is the next instance of this exact bug.
`ch3-breakfast.ts` calls `ctx.removeWall(gate)` in `done()` and goes on publishing a `gate` prop,
which `PROPS.gate` draws as a 1.1 m box across the foot of the main staircase. It is not driven by
the sweep because `done()` opens it and immediately starts the cutscene that ends the chapter, so
reaching it costs a full playthrough; `GATE_RUNS` in the sweep names every chapter and says why the
two it does not drive are not driven, and a chapter added later fails rather than quietly getting
the old half-measured treatment.

### Two more cues, for the party tricks that shipped silent

`roll` and `stretch`, specified by the agent that landed `E` and written here because `audio.ts`
was in one pair of hands: a low hollow knock at each of Biggy's three rock apexes over a sub-bass
groan, and a slow servo whine for Droid that rises, holds, clicks at the top and sighs on the
settle. Both are executed by `tests/audio-cues.test.ts` — headless Chromium has no audio device, so
being executed at all is the only check available before a human hears them — and both are fired
from `flairPhase` in `main.ts`, which is the sim's own clock, never a timer in render code.

## Round — the staircases moved, because the drawing outranks the prose (24 Sep 2026)

**The human decision, and it is the durable half of this round.** The previous round measured the
first-floor flights, found that the plan and the prose disagreed about where they are, and
escalated rather than shipping its own reading. Michele answered twice: **"Follow the plan — move
them"**, then, in his own words, **"follow the devoxx plant, not the plan.md"**. So the annotated
Devoxx drawing beats CLAUDE.md, GAUNTLET.md and `plans/README.md`, all three of which called the
old position non-negotiable, and all three of which are now corrected — along with `README.md`,
`docs/after-dark-full-design.md`, `docs/brief-and-references.md`, chapter 1's own progress line and
two module headers. The rule is written down where the next builder will hit it: *where a drawing
in `plans/` and a `.md` disagree, re-measure the PNG, move the geometry, and fix the prose in the
same change.*

**The measurement, re-done rather than trusted.** `plans/devoxx-rooms-stairs-annotated.png`
(996 x 1498), read as pixels: the corridor's two wall lines are plan x 504..505 and 649 (clear span
503..650 = 147); each flight is mid-grey (RGB 150,150,152) against the corridor's 209, the left one
plan x 506..527 and the right one 627..647, and **both** run plan y **884..947** — 64 rows, with a
seven-row gap at 912..918 that the unannotated `devoxx-rooms-plain.png` shows is a **landing
halfway down the flight**, not the annotation arrow lying across it. The plain drawing (1142 x 1420,
`plain_y = annot_y * 0.9943 - 26.3`) agrees to a pixel and adds what the black annotation hides:
the treads run *along* the corridor, so a flight is 1.41 m wide and 109 sim px long, and rooms 4
and 9 have a single-leaf door at plan y 925..933 (world x ~1137) with the vestibule they share with
rooms 3 and 5 at either end. The plan's "doors at ~976 and ~1135" from last round is half right:
1135 is a real door, 976 is a free-standing rectangle in the corridor, not an opening.

**What moved.** `F1.nicheTop/nicheBot` go from `{858, CY0-57, 40, 57}` — a pocket cut into the
corridor wall in the gap between rooms 10|9 and 3|4 — to `{1005.5, CY0, 109.2, 17.7}` and
`{1005.5, CY1-17.7, 109.2, 17.7}`: **148 px along the corridor, and out of the wall into the
corridor**, which is where the drawing puts them and the second half of the fault Michele reported
three times. `world_x = 898 + (plan_y - 821) * 297/174` is the whole arithmetic, anchored on room
4/9 exactly as the rest of the module is. Depth into the corridor is the flight's own width —
20/147 of the corridor, 17.7 sim px — so `NICHE_MOUTH` is now used twice from one measurement, and
Biggy still misses the stairs by a centimetre. The corridor wall behind the flight is now unbroken
(the staircase is not a hole in it any more); the mouth is the landing the plan draws dead centre;
the two runs either side are walls, in the robots' own voices, like the ground floor's `stair-foot`.

**The two consequences the last round declined to ship, both now done.** Rooms 4 and 9's centred
doorway would have opened into the flight, so `roomDoor` now centres a door on `roomFrontage(r)` —
the part of a room's frontage no staircase is standing across. For six of the eight Devoxx rooms
that is the whole room and nothing moves; for 4 and 9 it is the 107.5 px west of the flight, so
their door is at world x 951.8 instead of 1046.5. And chapter 1's closing descent, hard-coded as
`nicheBot.x + 20, nicheBot.y + 30`, lands 12 px through the corridor wall against a 17.7-deep
flight: it is now `nicheBot` centre, which is the middle of the mouth, derived so it cannot go
stale the next time the flight moves. All three robots finish the cutscene on the landing, and
`tests/chapters.test.ts` measures the last frame of the walk rather than the first.

**One ripple worth naming.** The numeral panel is 30.25 px wide and rooms 4/9 leave exactly 30.75
px of wall between the doorway and the head of the stairs, so at the standard 42 px offset room 4's
`zaal 4` hung over the stairwell. `signage.ts` already had `zaalSignSide` for the same problem at
the main staircase; it now also has `onFrontage`, which keeps a sign beside its doorway and off the
flight, and lets a panel as wide as the wall it is given centre on that wall rather than pick an
end to overhang. That is what the Kinepolis corridor looks like beside a stair anyway.

**What was NOT done, and is flagged rather than hidden.** The layout still leaves 40 px of dead
frontage between rooms 3|4 and 10|9, reserved for the staircases back when they were believed to
live there. Closing it means redistributing all four room pairs across 1270 px instead of 1230,
which moves every Devoxx room, all its signage and chapter 4's stage — a round of its own, not a
rider on this one. It is not meaningless in the meantime: the plan's own vestibule between rooms 3
and 4 lands inside it, at world x ~882. The doc comment beside the widths says so.

**Tests.** Nine new assertions, and all of them fail against the old numbers (checked by putting
`{858, CY0-57, 40, 57}` back in a scratch copy and running: 8 failures across four files, including
*"voxxy ends through the corridor wall: expected 439.9 to be less than 415"*). `geometry.test.ts`
pins the along-corridor position against the plan's own pixels through the room-4 anchor — the one
thing nothing asserted before, which is exactly why the build kept passing while being 148 px
wrong. `staircase-clear.test.ts` gains the first-floor half of the question it was written for:
nothing — corridor column, doorway, chapter prop — stands in either flight, Biggy can still drive
the length of the corridor past both of them (flood fill, not arithmetic), and Droid fits on the
landing where Biggy does not. `venue.smoke.test.ts` asserts the same of the thing on screen and
adds that neither the numeral panel nor the poster box hangs over a stairwell. 435 green.

---

## 2026-09-25 — every door in the game opens, and the floor has a height

**Michele, mid-playtest, for the second time: "And an animation for the door opening."** The fire
door and the store shutter had already been done that night, so the first job was an honest audit
rather than another fix: every `removeWall` in `src/sim/chapters`, every door-ish kind in
`PROPS`. Seven doors, three of them still popping from shut to open in a single frame.

**Cinema B's magnetic lock** (`ch1-night.ts`) was the worst of the three and the least visible:
`key` removed the `lock` wall on the frame Droid reached the projector panel and `props()` stopped
publishing the prop in the same frame, so the payoff of the whole mount beat was a door that did
not open — it ceased to exist, silently. **The router cabinet** (`ch2-expo.ts`) cut straight to a
single 4.32 m leaf standing at 58°, which is not a door anybody has opened and which lay 3.7 m out
across the technical room with no collider under a square centimetre of it. **The registration gate
at the foot of the main staircase** (`ch3-breakfast.ts`) was known bad and had been left for
somebody else during the roller round: un-animated, walk-through, AND drawn twice, because
`buildVenue()` builds a static gate in the same doorway.

All three now follow the shape `src/render/fire-door.ts` and `src/render/roller-door.ts` settled,
and `src/render/doors.ts` says so at the top so the next one does not invent a fourth: the sim owns
the clock (`LOCK_SWING_TIME` 0.7 s, `CABINET_SWING_TIME` 1.2 s, `GATE_SWING_TIME` 1.5 s — durations,
never speeds, so the 23 Sep rescale leaves them alone), the leaf is posed from the chapter's LIVE
wall list plus that clock, and an open door is a collider where it ENDS UP. Cinema B's leaf lies
against the inside of its auditorium wall; the cabinet's two doors — two, now, because a 5 m
equipment cabinet has a pair and because a single 4.3 m leaf sealed off its own terminal — stop at
58° with a wall under each; the gate swings back along the flight's west cheek, where a stair gate
is pinned back when a building is open. Three new synthesised cues in the house idiom: `maglock`
(an electric strike, not a hold-open magnet), `cabinet` (the only cue in the game whose middle is
louder than its ends — hinges that have not moved since 2019), `gate` (a hook off an eye; nothing
in it hits, asserted against `crash` and `shutter` in `tests/audio-cues.test.ts`).

**The trap that had already cost a round, caught again.** Chapter 3's `done()` opened the gate and
started the cutscene that ends the chapter in the same statement, and `CUT_FADE` is 0.35 s — the
screen would have been black before the barrier moved a degree. It now holds the hall for
`GATE_SWING_TIME + GATE_CUT_DELAY`, the way `FIRE_CUT_DELAY` made chapter 1 do. Driven on the built
page, the swing runs 0 → 1 with `phase: 'play'` and `fade: 0` the whole way.

**"We are still walking through the crashed door. The shape is fine, as long as robot walk on it,
not through."** Michele's second note, about the leaf Biggy knocks off cinema E. Not a wall — the
whole beat is that he went through that doorway — a **surface**. That is the same question
`docs/playtest-notes.md` has carried for three rounds about the raised lobby and the main flight:
`groundRiseM` existed for it, said in its own doc that the renderer read it, and nothing read it.
So one answer, in the sim: `Plate`, `GameSnapshot.plates`, `riseAt` (`src/sim/surface.ts`), and
`surfaceY` in `scene.ts` as the one line of drawing code that asks. The ground floor publishes the
lobby, its six steps and the main flight; chapter 1 publishes the fallen leaf. **Michele's "the
shape is fine" is kept**: the only change to the leaf is `rotation.order = 'YXZ'`, so the skew is a
yaw of a leaf lying down instead of a roll of one still standing — under the old `XYZ` it came to
rest propped on nothing, one edge 0.78 m in the air and its face running downhill by 0.62 m, which
is a thing you cannot stand on. Flat, it is a 0.48 m plate, and a robot stands on it; Droid's mount
lift composes on top of it. Closing the logged item also un-blocked chapter 3's transition, which
used to walk the three of them *through* a flight climbing to 5 m over their heads, so it gets the
close `CUT_FRAME` chapter 1 has.

**A physics-realism bug, filed as a pacing note.** *"The walk is long and they are running a bit
too fast."* Measured frame by frame through chapter 1's transition: Voxxy 109.2 px/s (151% of her
max), **Droid 263% of his**, Biggy 176%. The gait is driven by that speed, so his legs were being
run at a rate the rig was never tuned for. The cause was arithmetic — `pace = routeLength /
CUT_WALK_TIME`, and the 24 Sep staircase move made chapter 1's route 180 px longer. The route is
what shrinks, not the clock and not the pace: `trimRoute` in `game.ts` cuts the run-up back from the
destination until the leg fits `CUT_WALK_FRACTION` of the **slowest robot's own max**, so the shot
re-sizes itself the next time a waypoint moves. Both transitions now walk at 28.2 px/s (2.26 m/s);
chapter 3's was over too, at 112% of Droid's max, and nobody had measured it.

**Tests: 435 → 460, and every new one was run against the old code first.** Putting `trimRoute`
back out reproduces Michele's own numbers to the decimal (109.2 px/s, 151%). `tests/doors.test.ts`
measures all three new doors in both settled states; `tests/surface.test.ts` reads the fallen leaf's
Euler order out of `scene.ts` itself, so the picture and the plate cannot part company;
`tests/cutscene-pace.test.ts` asserts no robot is ever moved faster than its own `max` during a
cutscene, and names which chapters run one so a new transition cannot arrive unmeasured. And
`GATE_RUNS[3]` in `tests/colliders.test.ts` — written off last round as costing a full playthrough
— is now that playthrough: soup, speaker and the beer delivery, shared with `tests/doors.test.ts`
through the new `tests/pilot.ts`, so chapter 3's post-gate half is swept for the first time.
Frame strips captured through all three openings and through a robot standing on the leaf.

---

## 24 Sep 2026 (evening) — the two featureless boxes Michele filed with screenshots

**Human input.** Two notes, both with a screenshot. On the chapter-1 keypad: *"the keypad also
needs a shape. Big numbers?"* On a Zaal numeral panel: *"This orange thing. I don't know if it's
supposed to be a projector or what, but it misses a shape."* One standing call applied to both,
his: *"I vote funny, robots must be recognizable"* — read here as **readable at the game's zoom
beats accurate in close-up**.

**The Zaal panel.** The floor-to-ceiling height was NOT the fault and was left alone —
`media/other-images/image-1790032674926.webp` shows the real thing as a full-height orange panel
beside the auditorium entrance with the numeral high on it, and the built geometry matched
(`zaal-sign-3`, 0.00..3.62 m, numeral face 1.30..3.50). What was missing was everything that makes
a panel not a box: our version was one `signOrange` slab carrying one textured quad, so the whole
top, both flanks and the bottom 1.3 m of the front were bare orange — and this game's camera is a
high isometric, so the naked lid was in frame. Four things off the photograph were added, in
`signage.ts` and `materials.ts`: a **coping** (lighter orange, standing proud on the flanks, with a
dark reveal line under it), a **returned edge** (the flanks a plane darker), a **shadow gap** at the
foot, and the **header fascia** the photograph makes a "T" of. The block itself is now backlit like
the numeral on it (`signOrange` gained an emissive) — the real complaint was a lit quad floating on
a body that had gone black in the venue's own darkness.

Two things were tried and taken out, both because a test said so, not because they looked wrong: a
dark reveal all *round* the panel (invisible against a charcoal wall), and a coping proud on every
face — 4 cm of overhang put room 4's panel over the stairwell and `tests/venue.smoke.test.ts`
caught it, which is the fault that test exists for. The assembly now occupies exactly the envelope
the old single slab did.

**The keypad.** It was `PROPS.keypad = { h: 1.25, color: 0x2c3340 }` drawn by the generic
`drawProp` as one box, in the chapter whose entire plot is the four digits that go into it — and it
had been publishing `label: entered.padEnd(4, '_')` all along with nothing drawing it. New
`src/render/keypad.ts` poses a modelled unit from the prop, the way the fire door and the roller
door already do: mounting plate held off the wall, housing with a hood, a recessed four-cell
readout in **seven-segment** digits (a 2 px bar glyph survives a 16 px cell where a 700-weight
numeral does not), a painted 3x4 key grid whose **1-2-3 row is drawn dead** because `ch1-night.ts`
takes 4 to 9 and nothing else, and a status lamp that goes red to green when the magnetic lock lets
go. The housing also carries a standby glow, for the reason `projector-panel` and `terminal` carry
one: the thing the player is looking FOR is by definition still idle, and chapter 1 is a blackout.
It also stops the venue's own static keypad being drawn on top of the chapter's — two keypads in
one doorway, the same duplicate the breaker panel was caught doing.

**What was measured, and the one thing handed to a human.** The keypad's published rect is 8 px
wide by 24 px deep — 0.64 m of frontage running 1.9 m ACROSS the corridor. The diorama camera is 14
deg off that axis, so the 1.9 m ran away from the lens and four digits had 0.64 m to live in, about
8 screen pixels each. Drawn in magenta in the running build it came to **760 visible pixels** at
play zoom, most of them behind Voxxy's own head. Turning the same collider to run ALONG the
corridor (19 x 12 px, still against the door's face, half the depth) gives 1.52 m of frontage and
digits that read — the "64" in `scratchpad/pad/keypad-after-close-two-digits.png` against
`keypad-after-close-unpatched-rect.png`. That is a sim change, so it was NOT made: it is
`scratchpad/pad/keypad-rect.patch`, `git apply --check` clean, suite green with it applied, for a
human to take or leave. The 19 px is not arbitrary either — `floor1Walls()` stands a
`corridor-column` at x 565..581, and a wider rect would hang behind it. The renderer reads the rect
either way, so both pictures are honest.

**Tests.** 460 green. `tests/prop-geometry.ts` now reads the keypad's height from
`KEYPAD_TOP_M` in the renderer's own module rather than re-typing it, so that transcription cannot
drift; the footprint it reports is unchanged, which is the only thing the collider sweep asks about.

## 24 Sep 2026 — "this still needs a shape": the seat rows

**Michele's note.** A screenshot of chapter 1's cinema — Droid up on Biggy, his green pool across
the rows behind them — and one line: *"This still needs a shape."*

**The diagnosis, measured before anything was written.** `src/render/scene.ts` registered
`seatrow` and `seatblock` in `PROPS` as `{ h: 0.55, color: 0x3c2f3a, tl: true }`, and the generic
`drawProp` path drew exactly that: **one flat-topped cuboid per published rect**. Cinema E's six
rows were six anthracite slabs, the longest of them 10 m. Meanwhile the game already knew how to
draw a seat — `seatGeometry()` in `src/render/venue/props.ts` (cushion, back, legs, facing +z) —
and `seating()` in `src/render/venue/floor1.ts` lays a whole auditorium out as a single
`InstancedMesh`, 1900 seats in 26 draw calls. So the venue's cinema D, one wall away, had modelled
seats in it and cinema E did not: two answers to "what does a seat row look like", and the chapters
had the bad one. `scratchpad/seats-round/before-crop.png` is Michele's shot reproduced; the small
blue grid at its top-left is cinema D's proper seating, for scale.

**What was built.** `src/render/seats.ts`: one `InstancedMesh` for every seat every chapter
publishes, built from the venue's own `seatGeometry` at the **sim's** own `SEAT_PITCH_PX` (14) and
`ROW_PITCH_PX` (18), facing the room's screen via the sim's `screenEdge()`. Cinema E is 57 seats in
one draw call. Two rules it is built around: nothing is drawn outside the published rect (a row
shallower than the row pitch — chapter 1's are 9 px — gets shallower seats, not seats that overhang
the gap a robot walks down), and the pitch is read from `src/sim/geometry.ts` rather than invented.

**No sim change.** The rects, the `low` walls under them and the light that crosses them are
untouched; `tests/aisle.test.ts` still reads the same `seatrow` props and `tests/colliders.test.ts`
still finds a collider under every drawn solid. `SEAT_TOP_M` (0.87 m, the top of the seat back) is
exported from the seat model and **imported** by both `PROPS` and `tests/prop-geometry.ts`, so that
transcription cannot drift from what is drawn — the same cure the keypad's `KEYPAD_TOP_M` got.

**What the round found and fixed on the evidence, not on a hunch.** Chapter 4 publishes `seatrow`
props over room 8's seat blocks, and `buildVenue()` has *already* seated room 8 from the same
`roomSeating()` plan — with a rake under it that the sim has no plate for, so the chapter's rects
sit flat beneath it. As slabs that did not show; as seats it did. The before/after strip
`scratchpad/seats-round/ch4-ab-front.png` caught a **second, half-height row of seats coming up
through the gap between every raked row**. So `venueAlreadySeats()` stands the chapter's copy down
wherever the venue's seating already covers the rect — by overlap, not by room name, so a chapter
that seats a corner the venue's plan does not reach still gets seats. `venueSeatsRoom()` is now
exported from `floor1.ts` and used by both drawers: one answer to "whose floor is this".

**The clue case, checked rather than eyeballed.** A seat back is 32 cm taller than the slab it
replaces, and chapter 1's clue 4 sits in cinema E's exit alcove with seating between it and the
camera. `tests/seats.test.ts` casts a ray from every chapter-1 clue along `dioramaToCameraAtDeg(30)`
and fails if it passes through any seat box. At a 30 deg pitch a 0.87 m back only occludes within
1.46 m of depth behind it, and the nearest row is 3.76 m away.

**Tests.** 472 green in 27 files (was 461 in 26). New `tests/seats.test.ts`, 11 cases. Two of them
fail against the old plain-box renderer, and were run against it to prove it:
`PROPS.seatrow is a 0.55 m box, not a seat: expected 0.55 to be close to 0.87` and
`seat props still fall through to drawProp: expected 'function drawDressing…' to match /SEAT_KINDS\.has\(p\.kind\)/`.

**Deliberately not changed.** Chapter 4 goes on publishing seat props over a room the venue already
seats — that is a sim-side duplicate and a human's call, not a builder's; the renderer just stops
drawing it twice. Cinema E's chapter seats are **not** raked: the venue's rake is renderer-only
decoration with no plate behind it, and adding one under rects that are colliders in the 0.15..0.6 m
band is a different round's change. The 14 px seat pitch is about twice a real cinema seat; it is the
venue's own choice and the brief was explicit about not inventing a new one.

## 24 Sep 2026 — the opening sequence's crates (`src/render/crates.ts`)

**Human decisions this round.** Michele asked for an opening beat before chapter 1: the three robots
stand frontal on pallets, *imballati*, they light up, get down, and play begins. He approved the
lettering in his own words — *"Yes put the crates with 'Devoxx' 'For Stephan' 'Highly Fragile'
'Bulky' and stuff like that"*, then *"crate labels are good. Highly fragile on Biggy is good."*, then
*"the antwerpen sticker could strech between the 3 crates instead of being repeated?"*, then *"keep
both bulky and highly fragile on biggy"*. The settled spec is `docs/playtest-notes.md`, "Crate
stencils — agreed 24 Sep". The agent built the crates only; the choreography, camera move and
instructions panel are a parallel piece.

**What the agent did.** A self-contained renderer module: `buildCrates()` returns a group of three
crates, each with a named removable front panel, a stand anchor, `setLamp(0..1)` and `setOpen(0..1)`.
Rough sawn timber — plank walls with depth jitter and roll, a darker sawn frame of corner battens and
rails, a pallet under each — built through `mergeSimple` and the venue palette (`venueSpec('wood')`
mixed toward deal) rather than a fourth parallel set of helpers. The stencils are painted through the
existing `SignPainter`, not a new text facility. No game logic, no colliders, no lights, no external
assets, and no frozen constant touched.

**The finding worth keeping.** Michele's "exactly two letters per crate" has a geometric consequence
nobody had written down. A word reads as one word when its tracking is constant; two letters per
crate at constant pitch puts the pair centres `2p` apart, so the crate centres must be `2p` apart
too, so `2p = (wᵢ + wᵢ₊₁)/2 + GAP` for **every** adjacent pair. Solve them and (1) adjacent crates
must be equal width, and (2) the tightest reachable tracking is exactly `GAP + 2·INK_MARGIN`. So
Voxxy's and Droid's crates share a width and differ in height and depth, and Biggy's is the oversize
one with its pair pushed to its left margin so the surplus falls at the end of the word where nobody
can see it. `tests/crates.test.ts` asserts the constant tracking rather than just the seam
clearances, because constant tracking is the formal statement of "the word does not skew" and it is
the thing that breaks first if someone re-sizes a crate.

**Rejected, and why.** Justifying the second line by character count — eight glyphs of `N · T.A.`,
five of them punctuation, filled the same 1.28 m as eight letters of `ANTWERPE` and the middle crate
came out spaced like a ransom note; it is split by width now, off a Helvetica advance table.
Bridging every stencil glyph — the two X's came back looking like hazard chevrons, so only letters
with a counter are tied. Stretching every glyph to its cell — an `E` as wide as a `D`; a stencil is
monospaced in its cells, not in its letterforms. `ZAAL 8` stays dropped.

**Two bugs the screenshots caught that the tests could not.** The crates were centred on z, so each
front face stood at its own `+depth/2` and Biggy's was 0.31 m nearer the camera than Droid's — at the
diorama's 14 deg azimuth that ate 0.44 m of his neighbour's face and hid half the letters the
spanning word exists for. The notes say **coplanar**; that is now a number and a test. And the small
type used the big band's ink margin, which is narrower than the corner battens, so the first and last
character of every small line was drawn under a batten.

**Legibility, measured.** Front-on, screen px per metre: `DEVOXX` reads from 14 and is comfortable at
20; `ANTWERPEN · T.A.V. STEPHAN` needs 34 and is comfortable at 45; the per-crate corner blocks need
46 and are comfortable at 60. At the diorama's own pitch add about 15 %. Chapter 1's play zoom is
about 44 px/m, so at play zoom the two spanning bands read and the corner blocks do not; ~65 px/m
reads everything.

**Tests.** `tests/crates.test.ts`, 26 cases, green. The suite as a whole had 4 reds this round in
`geometry`, `staircase-clear`, `chapters` and `ch2-chain` — all in a parallel agent's in-flight
staircase and chapter rewrite, none reachable from this module, which nothing in `src/` imports yet.

---

## 24 Sep 2026 — the green cube that opens the door

**Michele's note.** A screenshot of chapter 1's mount beat, Droid up on Biggy's shoulders in the
blacked-out corridor: *"the part that needs a shape is the green Cube that opens the door"*. The
`projector-panel` prop — cinema B's door override, the payoff of the whole climb — was a `PROPS`
table entry drawn by the generic `drawProp`: one lit cuboid, amber on `idle` and green on `done`.

**What the agent did.** Modelled it in its own module, `src/render/release-panel.ts`, posed from the
prop the way `src/render/keypad.ts` and `src/render/fire-door.ts` are: a back plate on four standoffs
with a shadow gap, a hooded housing 0.24 m deep with a lit face plate, a pull lever, a mushroom
release under a guard ring, a key switch, an engraved Dutch plate (`DEURONTGRENDELING · ZAAL B ·
ZAALVERLICHTING`) with a hazard flash, a lamp with a `VERGRENDELD` / `ONTGRENDELD` legend, a cable
tray with a conduit drop, and two stays up to the corridor vault. Four things answer `Prop.state`,
not one: the lever stands up, the key turns, the mushroom goes in, the lamp and its legend go from
red-held to green-released. `scene.ts` gets six small hunks — an import, the `PROPS` entry reading
`PANEL_H_M`/`PANEL_LIFT_M` off the module, the build, `drawReleasePanel`, the dispatch and the
dispose. `tests/prop-geometry.ts` imports the same two constants instead of retyping them, which is
the `KEYPAD_TOP_M` pattern.

**The measurement that explains the note.** The diorama camera looks along (0.210, 0.500, 0.840). Of
a solid box on the published rect it sees 1.44 × 0.840 = 1.21 m² of front and 3.07 × 0.500 =
**1.54 m² of lid**: the largest surface on screen was the top of the box. "A big flat cube" is not a
figure of speech, it is that ratio. `tests/release-panel.test.ts` asserts face ÷ lid > 2 and reads
**0.79** against the old renderer.

**The fault the model uncovered.** Two corridor columns (`corridorColumns()`, sim x 365..385,
y 288..304, 3.3 m shafts) stand across the back half of that rect. The box only cleared them by
being 1.92 m deep — its lid stuck out past them, which is *why* the lid was what the player saw. A
unit drawn at the honest depth at the rect's rear is 70 % hidden and partly inside a column
(`scratchpad/panel-round/dbg-close.png`, magenta-face probe). So `mountZ` slides the unit forward
inside its own rect until it is clear of any column in its x range and no further — the move
`venue/projector.ts` already makes with `bayOffsetPx`, a drawing position computed from the geometry
it has to stand clear of. Nothing the sim owns moves.

**A human decision is pending.** The rect patch is written and **not applied**:
`scratchpad/panel-round/panel-rect.patch`. It cuts the depth from 24 px to 6 px and takes `panelAt`
off its hard-coded half-extents; starting the rect at `CY0 + 19` keeps its centre at (367, 307)
exactly, so `PANEL_REACH` and the mount beat are unmoved and the unit lands within 2 cm of where it
draws today. It is the sim and a collider, so it goes to Michele.

**Rejected, and why.** Pushing the rect back against the wall — `floor1.ts` springs the corridor
vault off the far wall head at 2.95 m and rakes it at 0.75 rad, which is why `signage.ts` caps the
far wall's readable band at `FAR_Y1 = 2.6 m`; a unit at 2.5–3.4 m hard against `CY0` is behind the
soffit and invisible. The rect's distance from the wall was right; only its depth was wrong. A
polished trim hood — the first cut made it 0.36 m deep in the same metal that carries the standby
glow, and photographed at play zoom it was a gold awning over a dark box, the cube's own mistake one
tenth the size; the hood and sill are dark shelves with one bright lip now, and the brightest thing
on the unit is its face. Bright stays — 1.2 m of amber-glowing trim read as brass poles, so they got
their own cold steel. Raising the release out of reach to match the dialogue's *"about a metre above
my reach"*: measured off the rigs, Droid's hand tops out at ~2.80 m and `mountLift` is 0.30 m, so the
mount buys 3.10 m and the controls sit at 3.10 m — the metre is rhetoric, the sign of it is not.

**A false comment corrected.** `src/render/venue/projector.ts`'s header asserted that the
`projector-panel` prop *"is the door override, a different object, and it already has one"* — a
shape. It did not. The note now says so and points at the new module.

**Tests.** `tests/release-panel.test.ts`, 10 cases, green; 9 of the 10 fail against the pre-change
renderer, reconstructed in a worktree at 82ca20b with the old `drawProp` box as a stand-in module.
Full suite at hand-off: **513 tests, 29 files, green**, `npx tsc --noEmit` clean. Mid-round it
carried 4 reds in `geometry`, `staircase-clear`, `chapters` and `ch2-chain` from a parallel agent's
in-flight staircase rewrite in `src/sim/geometry.ts` — they passed at committed HEAD throughout,
nothing in this change reaches them, and that agent's work went green before the end of the round.

---

## 24 Sep 2026 (evening) — the secondary staircases, read off the drawings a second time

**The human decision.** Michele sent three images back (`plans/michele-notes/`): the plan symbol
for a secondary staircase enlarged, a photo of the real stair with the balustrade ringed in red,
and a crop of the ground-floor shaft with its direction arrow. His words, in full, are the whole
brief for this round:

> the stairs are not yet fine. But i can understand the error here. This makes it look like there's
> a center, and 2 descent. I think it's a mid plane between two ramps of stairs. In this picture
> stairs go south to north. There's a protection on West and North, as you can see on the second
> picture. / stair entrance is where the arrow is, going down North. / On ground floor, your stairs
> are good. Floor 1 is directly above, so they should match. / Just a correction: you put the
> opening north, but it's on the sides (WEST, EAST). Worth a fix.

Four separate rulings, and the standing rule of 24 Sep — *"follow the devoxx plant, not the
plan.md"* — meant each one had to be re-measured on the PNGs rather than taken from him or from a
comment. All four checked out.

**What the agent measured.** On `devoxx-rooms-plain.png`, the first-floor flight runs plain
y 853..914 with its treads at a steady pitch and **one tread-free band at 879..887** — a
half-landing at 13% of the run, not a landing you step onto. On `exhibition-floor-simple.png` the
same object at that plan's scale: flights over ~199 px with a tread-free band 31 long. One
staircase, two ramps, a mid-plane; the build had a walkable square in the middle with a run falling
away either side, which is exactly the "center, and 2 descent" he named. The two drawings also
agree on aspect ratio (3.2:1 against 3.36:1), which is what proves they are the same staircase seen
from its two ends.

The doors were counted rather than eyeballed: thresholding the drawing's green door symbols inside
each shaft's own bands gives **0** on both short ends of both shafts and 200–280 px on all four
long faces. Landing, first riser, half-landing and doors then came off the plan at
y 165 / 170..205 / 234 / 276..292 / 323, mapped through this repo's existing calibration.

**The thing the agent got wrong and the drawings corrected.** The coordinator's reading of
"openings on the WEST and EAST faces" was that they are the shaft rect's two SHORT ends, since the
rect is 226 × 45. It is the opposite: the module rotates the plan 90°, so the building's west and
east faces are the rect's two LONG (±y) faces. Both statements describe the same two doors. That
distinction is now written at the top of `stairDoors`, because it is the kind of thing that will be
misread again.

**What a driven test caught that no flood fill could.** Moving the first-floor way-on from the
middle of the flight to its east end quietly removed the pinch that has kept Biggy off the
secondary stairs since playtest note 18 — with walls on only one side, he drove straight onto the
top step. Every existing test in the area asks whether a cell is walkable, and those cells were
walkable before and after. `tests/stairs-driven.test.ts` drives a robot with the stick and reads
where it stops; it caught this in one run. The fix is the balustrade Michele's photo already
showed: `NICHE_RAIL` makes the guard a collider across the head, so the head is a 1.30 m pocket
entered by turning in off the corridor. Droid rests 0.9 px from its centre, Biggy 14 px short.

**Rejected.** Two attempts to give the first-floor well a full-height guard at its head were backed
out. Room 9's numeral panel is 30.25 px of sign in 30.75 px of wall, clamped against that very
edge, with its bottom 0.30 m off the floor; traced at every diorama pitch the sight line from its
bottom corner crosses the guard's line between 0.63 m and 1.11 m, so **no** handrail height clears
it. Moving the numeral was tried and backed out too: the wall on the other side of room 9's door is
the same width and has a corridor column in front of its first 5 px, so the panel would overhang
the door lintel. The head of each well carries a 0.40 m upstand and a newel instead, and that is
logged as a compromise rather than a solution — the honest fix needs Michele to say whether the
numeral may move.

**Also found, not fixed:** the technical room's north wall leaves **15.8 px** between it and the
bot shaft's south door. Biggy is 18 across, so he cannot use that door. `GF.tech` came from the
prototype and has never been measured off the plan; flagged rather than moved.

**Tests.** `tests/stairs-driven.test.ts` new (3 driven cases). `tests/geometry.test.ts` and
`tests/staircase-clear.test.ts` had three cases rewritten onto the corrected geometry — none
loosened: "one doorway in the west end" became "both short ends solid, a doorway in each long
face", and the descent-waypoint check gained a second assertion that the middle of the flight is
now wall. Suite at hand-off: **516 tests, 30 files, green**, `npx tsc --noEmit` clean,
`document.title` = `After Dark · ERRORS:0` on every shot.

## 2026-09-24 — one list behind the meter, the checklist and the hints (chapters 2, 3, 4)

**What a human decided.** Michele asked for an instructions panel carrying "the main mission
(getting Devoxx ready to start!), the chapter mission, command reminder and eventually checklist /
hints", a meter on the HUD ("x of y things done") in place of the bottom objective bar, and hints
"just on demand, for desperate player. arrow last is good". He also fixed the architecture of it:
all three read ONE list so they cannot drift apart — `Task` in `src/sim/types.ts`, published per
chapter as `ChapterRuntime.tasks()`, with chapter 1 already written as the worked example.

**What the agent did.** Wrote `tasks()` for chapters 2, 3 and 4, reading the same locals each
chapter's `progress()` already reads — no new state, no recomputation, and no behaviour change:
every one of the three diffs is additive apart from one `import type` line. Four rows for the expo
(power, router, cable, store), five for breakfast (ladle, soup, speaker, beer, stairs) and four for
the keynote (cake, banner, spotlights, stage).

**Three judgements worth recording.**

- *The router is one row, not four.* Cabinet shut → open and dead → wanting the password → online
  are four states of one object in one place; four checklist rows would claim the chapter has four
  times the network jobs it has. The row's tail says which step it is at, which is the sentence
  `progress()` already writes. While the terminal's prompt is open the row publishes **no** `at`:
  the password is typed, not walked to, and an arrow would point at the robot's own feet.
- *The swag is not in the list at all.* The three booth games are optional (`OBJECTIVE` says so and
  `progress()` refuses to let them lead), so counting them would tell a player who has done
  everything asked of them that they are 5 of 8 done. `tests/tasks.test.ts` plays chapter 3 to the
  gate, wins a sticker on the way, and asserts the list is still five rows.
- *Chapter 4's clock is not a row.* The crowd arriving is a deadline, not a thing to do: nobody can
  tick it off, and a meter counting it down would read "3 of 5" for a stage that is finished. It
  stays where a countdown belongs — the `crowd` prop and the progress line.

**Rejected.** Pointing the arrow at the keynote speaker's hiding place. Which booth they are behind
is that errand's answer, and the chapter deliberately does not even publish the person until Voxxy
is close enough to have spotted them; the row carries no `at` until they are following her, and
then it points at Stephan. Also rejected: putting the WiFi password or a keypad digit in a hint —
the hints name the two places the password is written down and never a letter of it.

**Found, not fixed.** Chapter 1's `code` row points its arrow at the keypad's own rect, which is a
pad ON the corridor wall, so the target is inside the slab rather than the floor in front of it.
Harmless for an arrow and left alone (chapter 1 was not this change's to edit); `wellFormed` in the
new test allows 34 px of slack for exactly this case and asserts chapters 2–4 need none of it.

**What `Task` still cannot say,** flagged for whoever builds the panel: *optional* (the swag), *who
it needs when that is more than one robot* (chapter 1 picks `need[0]`; chapter 4's stage needs all
three), and *blocked by* (the router while the breakers are down).

**Tests.** `tests/tasks.test.ts` new — 15 cases, every chapter including 1, and almost nothing
asserted at setup: ids unique and unchanged across real state changes, `done` flipping under the
shared A* pilot and the existing choreographies, `n ≤ of`, every `at` reachable after play as well
as before, and no line containing the chapter's own generated secret (chapter 1's code read from
`NightState`, chapter 2's password read from the terminal's own buffer, chapter 3's hiding booth).
Suite at hand-off: **534 tests, 32 files, green**, `npx tsc --noEmit` clean.

---

## 24 Sep 2026 — the opening's three complaints (intro-light round)

**What a human decided.** Michele, having played the opening: *"the left crate is half black.
Robots are still black. In the intro I'll show them fully, even if it's dark. It's their
presentation."* And, proposing a restaging: *"Why not placing the crates on the west wall and using
a single transition? Start: cinematic on the crate, light on robots, each one exits and is
presented. Transition to the corridor, **different camera angle**, robots ready to start."* He also
ruled the boundary for the fix: no `THREE.Light` near the crates (the venue's lighting is the sim's
visibility polygons and a second lighting model is not on the table), `src/sim` untouched, and the
diagnosis before the change.

**The half-black crate is not a rendering bug.** The agent reproduced it first and instrumented it
rather than guessing: a run-time bounding-box sweep of everything in the scene that intersects
Voxxy's crate found a `venue/corridorColumn` — 3.3 m of `#1b1e24` with no emissive, which in a
blacked-out corridor is exactly black — at sim x 59..75, y 288..304, overlapping her crate's
65.9..83.1 by **9.1 px of its 17.25 px width, 53%**. The confirming shot paints every corridor
column magenta at run time and the magenta lands precisely on the black half
(`scratchpad/intro-light/02-halfblack-diagnosis-magenta.png`). **Voxxy's crate is standing inside a
structural column**, and because the crate footprints are published as walls, so is the sim.
Candidates ruled out by that measurement, not by argument: the shared-vs-per-crate `setLit`
materials, a shadow, the visibility polygon, the fallen panel and a winding problem.

It cannot be fixed by sliding the row: scanning the corridor's west half a pixel at a time there is
**no** row centre where all three crates clear both the columns and the auditorium door leaves (the
two usable column gaps, 75..169 and 245..365, each have a door in the middle of them). Michele's own
restaging is the fix — quarter-turned against the west wall, face line x 29, row centre y 350, the
whole thing clears with room to spare. The row's position lives in `src/sim/opening.ts`, which was
out of this agent's scope, so the change was handed back as a hunk and the geometry is guarded by
`crateFootprints()` / `crateRowFouls()` in `src/render/crates.ts` and five cases in
`tests/intro-light.test.ts`.

**The presentation light** is `presentationLight(rig, v)` in `src/render/robots/rig.ts`: a per-rig
emissive lift, 0..1, no light of any kind. Each panel is re-exposed in **its own colour**, to linear
luminance `0.1 + 0.44 * sqrt(lum)` — the square root is what keeps Droid's graphite darker than
Voxxy's orange instead of flattening all three to the same grey. Two things are deliberately left
alone: everything in `rig.glow` (eyes, visors, ports are already emissive at 1.8 with tone mapping
off, and lifting one gives a robot two white holes in its face) and any material whose own colour is
black (Voxxy's glass highlights).

**Rejected, twice over, and both by a shot.** First cut lifted `mat.color` for every material. In
node that looks right; in a browser Biggy's belly and dome carry all of their colour in a canvas
texture and sit on `color: '#ffffff'`, so his whole gut came out **flat white**. The fix is the rule
`crates.ts` already records for its painted faces — a mapped material lifts its `emissiveMap`, so
the orange glows orange and the worn-through grey stays grey. Also deliberately avoided: the
`weather()` trap in `docs/playtest-notes.md`. Nothing here touches a vertex colour, and three's
standard shader multiplies `vColor` into the diffuse term only, so the white-flake bug cannot come
back through this door.

**The second camera angle** is `DioramaCamera.setAzimuth(rad?)` beside `setChapter`, re-framing the
last rect exactly as a pitch change does; calling it with nothing restores `DIORAMA_AZIMUTH_RAD`.
Default behaviour is bit-for-bit unchanged, asserted by comparing the full camera state of an
untouched camera against one that has been swung and given back. The recommended intro angle is
**`OPENING_AZIMUTH_RAD = 68 deg`**, chosen off a six-shot strip (14/45/56/68/80/90) rather than
guessed: 14 reads the spanning `DEVOXX` as three slivers, 90 is a flat elevation, and 68 keeps a
visible flank on all three crates while every one of the six stencil letters and both red corner
blocks stay legible.

**Flagged, not changed.** `DIORAMA_AZIMUTH_RAD` is baked into the facing and occlusion rules in
`src/render/venue/signage.ts`, `src/render/keypad.ts`, `src/render/venue/projector.ts` and
`src/render/venue/floor1.ts`, and asserted at that one angle by `tests/venue.smoke.test.ts`,
`tests/seats.test.ts`, `tests/aisle.test.ts` and `tests/release-panel.test.ts`. A shot staged far
off the play azimuth will show some of the set from behind — fine for an opening that frames three
crates in an empty corridor, and the reason this is a shot override rather than a second setting.

**Tests.** `tests/intro-light.test.ts` new — 27 cases: the column overlap pinned with its own
numbers against a frozen copy of the row as diagnosed, the "no clear x along the north wall" scan,
the west-wall row clearing everything, coplanar faces at both yaws; per robot, an exact restore at
`v = 0`, a lift on every panel with the glow materials untouched, hue preserved and monotonicity in
`v`; the painted-panel rule; and the camera's default-identical framing, exact restore, re-frame on
change and the untouched module-level sight-line vector. Suite at hand-off: **568 tests, 34 files,
green**, `npx tsc --noEmit` clean, `document.title` `After Dark · ERRORS:0` on the opening and in
play.

## 26 Sep 2026 — chapter 2: the breakers land, the modem, and the cabinet's pilot lamp

**Michele's note.** *"Some comments on chapter2: the braker activation seems to do nothing, apart
from the message. A 56k like sound for the modem and a light on a cabinet to signal you should go
there?"*

**What was actually wrong.** Not the design. `ch2-expo.ts` already says beside the last breaker that
*"a supply is not a lit room: what the player gets for the breakers is a noise behind a door, and a
reason to go and open it"* — and the noise and the pointer had never been built. Throwing a handle
set a flag, moved a lever a few pixels up a wall in a blacked-out room, and printed a toast. There
was no sound at all: the `breaker` cue existed in `audio.ts` and was played in exactly one place,
`setAmbient`, as a chapter-2 opening stinger, so the only time a player ever heard it was before
touching anything.

**Built (agent).** Three things, all of them decided in `src/sim` and only drawn in `src/render`.

1. *The strike.* A new duration, `BREAKER_STRIKE_TIME = 0.45 s`, published as `Prop.progress` on the
   breaker panel — 1 on the frame a handle goes up, decaying to 0. A count (`v`) has no edges in it;
   this does, so every handle gets a flash and a cue, not just the third. `drawBreaker` flares the
   supply lamp to white and catches the handles in it. Each handle also now names the circuit it
   fed, and the middle one is **HALL LIGHTING** — fed, contactor still open, nothing to close it —
   which answers in the fiction the question Michele asked in the first place (*"I thought they were
   linked"*).
2. *The modem.* A new cue, `modem`, ~2.0 s, synthesised like everything else: DTMF dialling
   (697/770/941 × 1209/1336/1477), the 2100 Hz V.8 answer tone with a 3 Hz beat partner, the two
   V.21 channels keyed against each other (980/1180 and 1650/1850) as **one oscillator per channel
   stepping between its mark and space tone**, the scrambled training sequence as noise, and the
   drop into the connected hiss. Everything inside the 300–3400 Hz telephone band, which is why a
   modem sounds like a modem. A sibling cue `busbar` carries the supply landing: contactor,
   overhead relay, and the board settling into a 100 Hz hum — twice the Belgian 50 Hz mains, which
   is what a transformer core actually does — with nothing bright in it, because the hall stays
   dark.
3. *The pilot lamp.* A new `pilot` prop, an annunciator strip across the top of the cabinet, keyed
   to the **supply** and nothing else: dark with no volts (shut or open — a lit lamp on a dead
   cabinet is a lie a player only falls for once), amber and breathing once the board takes load,
   green when the router is on the air. The technical room's threshold plate and name sign gained
   the same middle state, so the supply landing is visible from out in the hall as well as from the
   panel.

**Human decisions carried.** The chain itself (Michele, 25 Sep) is untouched and re-guarded: the
breakers still do not light the hall, and `tests/ch2-power.test.ts` restates that where the new lamp
is. *Recognisable beats precise* decided the modem's dial tones — a venue router has no phone line,
and the joke and the physics happen to agree, because a real handshake's frequencies are exactly
what makes it recognisable.

**Rejected.** A standby glow on the pilot lamp, the convention every other findable prop here
follows (`projector-panel`, `terminal`, `keypad`, `poster`): those are idle objects, this one is an
electrical indicator, and giving it a glow would have it claiming a supply it has not got. Also
rejected: suppressing the two `terminal` props while the cabinet is shut. Their standby glow does
read faintly through the shut doors, which is a real cosmetic bug, but a prop that stops existing
mid-chapter is the exact failure this repo has already logged twice (cinema B's door, the roller
door) — flagged for the renderer instead.

**Found and fixed on the way.** `MAX_VOICES` was 14 and counts voices from creation, not from when
they sound; a cue schedules its whole timeline up front, so `victory` alone books 11 slots for 2.5 s
and a Biggy footstep landing on it (3 voices) was silently dropped. Raised to 24.

**Tests.** `tests/ch2-power.test.ts` new — 7 cases: the strike on every handle and its decay, the
circuits named, the pilot lamp's five-state table including both dead states, the hall staying dark,
the threshold plate, and the new kind being classified for the collider sweep. `tests/audio-cues.ts`
extended — the stub now records every oscillator frequency and every envelope peak, so the two new
cues are asserted by their carriers (2100 / 980 / 1180 / 1650 / 1850, DTMF rows and columns), by the
telephone band, by duration, and by a conservative rectangle bound on the summed envelope
(`modem` 0.151, `busbar` 0.334 at the destination — nothing clips). All 9 new cases were written
first and run red against the old code. Suite at hand-off: **586 tests, 36 files, green**,
`npx tsc --noEmit` clean, `document.title` `After Dark · ERRORS:0` across seven chapter-2 probes.

## Session — 24 Sep 2026, night (agent, with two sub-agents)

**What Michele decided.** *"the antwerpen sticker could stretch between the 3 crates"*; *"keep both
bulky and highly fragile on biggy"*; the staircase reading (*"a mid plane between two ramps"*, *"the
opening is on the sides (WEST, EAST) — that's for ground 2"*); on the first cut of the opening,
*"the intermediate scene i don't get it… I vote 1"*, then *"the left crate is half black. Robots are
still black. In the intro I'll show them fully, even if it's dark. It's their presentation"* and the
restaging itself — *"Why not placing the crates on the west wall and using a single transition?
Start: cinematic on the crate, light on robots, each one exits and is presented. Transition to the
corridor, different camera angle, robots ready to start."* Then, late: *"sometimes the toast are
multiple and not all are visible"*; *"the stair, reception and wardrobe appearence still need fix.
Am I putting too much thing together on the backlog?"*; *"where is the wifi password graffiti? It
should be visible!"*; *"chapter 2 ends abruptly… give some seconds for animation"*; and *"Keep
building tonight, I'll stop here."*

**The honest answer to his backlog question was yes**, and it is recorded in
`docs/playtest-notes.md`: fifteen items open, and the session before this one went on crates, the
intro and bubbles, none of them on the priority 1 he had stated on 24 Sep (*"staircase and reception
right is priority 1"*). Saying so and then burning the venue block was the right order.

**What the agent did.** Fixed the speech bubbles (two causes: a shared keyframe ending on
`transform:none` with `fill-mode: both`, which permanently cancelled each bubble's
`translate(-50%,-100%)` anchor; and no separation at all between two bubbles whose boxes crossed).
Reworked the reception block to his 24 Sep spec — a hollow L of two counter runs, the printer on the
south run, the wardrobe handing out west instead of south into the back of the desk. Painted the
wifi spray tag, which existed only in the sim because the `poster` prop style draws every poster as
a pale lightbox; found on the way that the printed WiFi notice had been hanging at y 371, **inside
`GF.coatroom`** — a sign nailed up in a closed room. Landed both sub-agents' work, wired their cues
and hunks. Gave chapter 2 a three-second curtain. Built the run sheet (`I`), the meter and the
escalating nudge (`H`).

**What was measured rather than argued.** Voxxy's crate stood inside `corridor-column` — 9.1 px of a
17.25 px crate, 53%, of a pure-black 3.3 m column — and a pixel scan of x 40..400 proved no row
centre on that wall clears both the columns and the auditorium door leaves. The main staircase's
orientation was settled off `plans/exhibition-floor-stairs-annotated.png` (entered from the entrance
side, climbing away) and then **deferred with the measurement written down**, because it drags
`ch3-breakfast.ts`'s gate swing and Stephan's post with it. The crate row's quarter-turn sign was
found by sweeping the scene graph's bounding boxes over Voxxy's own rect — twice now that has been
the only way to identify a dark shape in a screenshot, so `DioramaScene.debugRoot()` is kept.

**What a human decided that a builder would have got wrong.** The restaging. Moving the crates to
the west wall was Michele's idea for compositional reasons, and it turned out to be the only
position that works at all — the agent had been trying to slide the row along the north wall.

**Rejected.** Weakening `tests/aim.test.ts` when the new start marks broke it. The marks are a
north-south line now, so driving north is Voxxy shoving Biggy, and a shoved robot facing its actual
travel is `stepAim`'s documented rule, not the wall-rebound bug that case exists for — so the case
clears the lane and says why, instead of quietly asserting the opposite of the design. Also
rejected: guessing at *"Reception signal points the wrong way"* and *"this element before reception
is not needed"*. Both candidate signs measure as pointing correctly, so the note is about something
the agent cannot identify from the words alone; queued as a question rather than a change.

**Tests.** `tests/reception.test.ts` (7) and `tests/tasks-panel.test.ts` (21) new; `tests/aim.test.ts`,
`tests/party-tricks.test.ts`, `tests/opening.test.ts`, `tests/venue.smoke.test.ts` and
`tests/ch2-chain.test.ts` extended or turned with the staging. Suite: **609 tests, 37 files, green**,
`tsc --noEmit` clean, `After Dark · ERRORS:0` across all four chapters and the intro on the built
bundle.

---

## 25 Sep 2026 (night) — the overnight pass: his list, in his order

**What a human decided.** Michele played chapters 1–3 and filed, in three bursts, about twenty
separate notes — half of them with screenshots and two with circles drawn on them. He also gave the
answer to a problem the agent had been circling for two rounds: *"If we want to handle the light
change, we could do this. There's a light on the crates, robot exit fully visible. Light (emergency
light?) flickers and stops, robots light up -> transition to game."* That is the whole intro beat,
and it fixed the one dishonest thing in the sequence — the corridor is a blackout with no fitting
anywhere near the crates, so the robots were visible because the renderer re-exposed them and for no
reason inside the fiction. Now there is a bulkhead on the wall, it is what the presentation is lit
by, and it gives out on cue.

Two more of his calls that a builder would not have made: *"if the soup is spilled, you can come
back and take a new batch"* — deleting a full-screen `R to try again` twenty seconds from the end of
chapter 3, for a mistake whose fix in the fiction is walking back to a counter with a vat on it; and
*"you should be able to 'talk' with stephan"*, which turned the man the whole chapter is about from
a figure in a hat into somebody who tells you what he is still waiting for.

**What the agent did.** Chapter 1's exit cutscene now goes round the balustrade instead of through
it (reported twice). `Task.hint` became a list so `H` can walk a gate before the task behind it.
Toasts render their markup — the chapters have always written `<b>` into them and `pushLine` set
`textContent`. `standOff()` made the standing people solid: the three staff you ask for directions,
Stephan and the keynote speaker were drawn and nothing else. Chapter 2's task 1 says *"power up the
technical room"*, which is what the three handles actually do; the rack rides the supply and has its
own link lights, so the cable's start is a lit thing in a dark room; the badge printer is a badge
printer (`src/render/printer.ts`) instead of a pale grey cuboid. The bar on the hall wall is called
The Finally Block on a fascia over its own taps, and the wifi graffiti moved out from behind it. The
crab sandwich is in the building, with its own BROODJE KRAB sign and a line from each robot.

**What was measured rather than argued.**
- *"Pic5 there's still that big strange wooden thing."* Screenshotted the reception from the game's
  own camera, swept the venue's meshes for long thin brown boxes, and found the reference
  photograph's orange ceiling soffit hung at 3 m on `overhead` — over a floor this diorama draws no
  ceiling for. It is a fascia on the wardrobe wall now. It was a free-standing gantry for ten
  minutes until `tests/colliders.test.ts` pointed out that a post touching the floor is a collider,
  and `tests/chapters.test.ts` showed what two new colliders beside the desk do to three thousand
  people walking past: 15 of 33 still queueing when the doors shut.
- *"Biggy route to the modem room is a bit long. Is this column strictly needed?"* Measured every
  column against every block: the booth aisles are 60 px and leave Biggy 20 and 26, but two columns
  on the x 213 line stood 13 px off the technical room and 7 px off a stair shaft — 1.04 m and 0.57 m
  against his 1.44 — and both are on the route the chapter sends *him* down. The rule that drops
  them is general and it costs two of eighteen.
- *"Pic2: droid looks inside the breaker."* `GF.panel` is 26 × 16 px and the 16 is the REACH zone, so
  drawing the enclosure to the rect made a 1.28 m-deep board with its handles out where the robot
  stands. Same diagnosis `release-panel.ts` opens with.
- The new printer model landed on top of the venue's own static printer slab — two printers in one
  footprint — which the venue/chapter hand-off lines exist for and this one had not been given.

**Rejected / deferred.** The second flicker report (a tall element by the stairs) could not be
reproduced: the venue has no coplanar face pair anywhere near it, the camera is orthographic with
linear depth over 420 m, and the two decal classes that could fight were fixed. It is written down
as needing a live repro rather than guessed at. Music is still queued.

**Tests.** `tests/toast-markup.test.ts` and `tests/people-solid.test.ts` new; `staircase-clear`,
`opening`, `chapters`, `tasks`, `tasks-panel`, `venue.smoke`, `crates` and `colliders` extended or
turned with the changes. Suite: **653 tests, 40 files, green**, `tsc --noEmit` clean, `After Dark ·
ERRORS:0` on the built bundle in chapters 2 and 3 and the intro.

## 25 Sep 2026 — music

**What a human asked for.** One word, queued for two sessions: *"music"*.

**What the agent did.** `src/render/music.ts`: a four-bar score per chapter, played by oscillators
on the `AudioContext` `audio.ts` already owns. No file could be loaded even if one existed —
CLAUDE.md forbids external audio assets — so the music is written as data and synthesised, the same
way every sound effect in the game already was.

The line the module is built on is the one the repo draws everywhere else: the score is pure data
and pure functions (`SCORES`, `barNotes()`, `chordNote()`), and the player below it is graph
plumbing. That split is what lets a test say something true about music in an environment with no
sound card — `tests/music.test.ts` asserts that no part ever plays a note outside its chapter's key
over three times round the loop, that the patterns are whole bars, that the build-up parts arrive on
the bar they claim, and that the loudest instant of the fullest bar leaves the sound effects room on
top of it. Whether it is any *good* is Michele's call and no test pretends otherwise.

Four scores, and they carry the story rather than decorate it:
- **Chapter 1** A minor, 68 bpm, **no percussion at all** — the one chapter with nothing keeping
  time. Am9 / Fmaj7 / Dm7 / Esus never resolves, so the loop comes round without sounding finished.
- **Chapter 2** the same key, because it is the same night; everything else changes. 100 bpm, a
  sixteenth bass pulse, Am / C / F / G climbing instead of circling — and the drums are not in the
  first loop at all. `from: 2` brings the kick in, `from: 4` the hats, `from: 6` the rim: the music
  comes up the way the building does.
- **Chapter 3** the first daylight in the game, so the first major key. C, 112 bpm, shaker instead
  of hats, sevenths on everything. Cmaj7 / Am7 / Dm7 / G7 is the most ordinary progression there is,
  which is the point — nothing is broken yet.
- **Chapter 4** C major, 84 bpm, and the only progression in the game that lands on its tonic,
  because this is the one chapter that is allowed to arrive somewhere.

**Decisions with a reason.**
- **A deck per score, not a score on a shared bus.** Notes are scheduled up to `LOOKAHEAD` seconds
  ahead, so at a chapter change the old chapter still has nearly two bars booked. Swapping the score
  on one gain node would have played chapter 1's A minor over chapter 3's C major for two seconds.
  Each score gets its own fader and the outgoing one fades out with everything already hanging off
  it — the same trick `fadeOutBed()` plays for the ambient beds.
- **A 1.9 s lookahead, not the 0.2 s every tutorial uses.** A hidden tab has its timers clamped to
  about a second; a short lookahead drops the beat the moment a judge tabs away to read the README.
  For the same reason the pump is a `setInterval` and not the render loop: `requestAnimationFrame`
  does not fire at all in a hidden tab, and the music would stop dead instead of carrying on.
- **`N` mutes the music alone**, on top of `M`. A score is a preference in a way a breaking door is
  not. The scheduler keeps running under the mute so the bar clock stays with the game — turning it
  back on drops you where the music would have been, not at the start of its build-up.
- **`setMusic` is separate from `setAmbient`** although `main.ts` calls both on the same edge. A bed
  is the room and a score is the mood, and they are allowed to disagree: chapter 2's hall keeps its
  empty-room tone all the way through while the score underneath it grows a drum kit.

**What was measured rather than argued.** The build-ups were first written at `from: 6` and
`from: 10`. Probing the built bundle with a wrapped `AudioContext.prototype.createOscillator` showed
that at 100 bpm that put chapter 2's hats 14 seconds in and the rim at 24 — patient to the point of
never arriving for most players. Pulled to 4 and 6, re-probed, and the noise voices now appear
inside the first loop. `scratchpad/intro-light/shot.mjs` gained `--autoplay-policy=no-user-gesture-
required` so a probe exercises the audio at all instead of silently skipping a suspended context.

**Verified.** All four chapters and all three chapter swaps driven in the built bundle: `After Dark
· ERRORS:0`, empty `window.__afterdark.errors`, 177 oscillator and 41 noise voices scheduled over
16 seconds of chapter 2. Suite: **682 tests, 40 files, green**; `tsc --noEmit` clean.

**Still open.** The second flicker report (a tall element by the stairs) still needs a live repro —
unchanged from the last session, and still not guessed at.

## 24 Sep 2026 — a full-3D proof of concept of chapter 1, aimed at Cyberpunk 2077's look (agent, overnight)

**What a human asked.** Michele: a quick POC of a *full 3D* version, chapter 1 or part of it, on its
own branch, "graphic level on par with Cyberpunk 2077", looping and comparing against screenshots of
the game. He was going to bed; questions could wait for the morning.

**What the agent decided without asking.** `main` held only reference files, so the fork point was
the 2.5D branch (`claude/blissful-faraday-3ymwwa`) — the work he meant by "main" — so the tested sim
and the sheet-matched robots could be reused rather than rewritten. The 3D build is a second page
(`3d.html`) and a second renderer (`src/render3d/`) over the *same* sim; `src/sim` is untouched, so
every rule, constant and test still applies.

**What the agent did.** Built an HDR pipeline in three.js WebGL2 (planar reflections, GTAO,
single-scattering volumetric fog raymarched through each lamp's own shadow map, a COD-style bloom
chain, AgX and a grade), GPU-baked every texture from shaders, raised the closed section to full
height from `floor1Walls()`, gave it a third-person camera, and then iterated on screenshots: about
fifteen rounds, four canonical shots each. See `docs/3d-poc.md` for the file map.

**What the loop caught that reasoning had not.**
- The first frame was black: physically based light units with guessed intensities. Neon sources
  went up ~6x before anything read.
- Two long RectAreaLights along the coves filled every lit surface with sparkle noise; switching
  them off in the harness proved it, and they became point lights.
- The corridor's coved ceiling was invisible: both cove strips were wound backwards and culled.
- Droid rendered bone-white: his pool lamp sat 15 cm above his shoulders (1000+ lux). Lifted to a
  virtual source 1.4 m up; his graphite came back.
- The city outside the new foyer windows was hidden by a 56 m sheet of plaster: a wall was classified
  as "faces the corridor" once, at its midpoint. Faces are now classified in 10 px runs.
- The fog only ever saw the first ten emitters; it now takes the sixteen nearest the camera.
- A scripted playtest (Playwright holding keys) found the camera's auto-follow turning strafes into
  circles; it now follows forward runs only.
- Posters had been placed in two doorways and behind a column; placements now come from the sim's
  door and column positions.

**Rejected.** WebGPU/TSL post-processing (not available in the headless browser the loop depends
on); a physics engine or imported models (CLAUDE.md); raking the cinema floors (the sim is flat, so
robots would float over or sink into the rows); screen-space reflections (the planar mirror keeps
off-screen neon); copying anything from the reference game.

**Blocked.** The egress policy denied every host with Cyberpunk screenshots, so "compare with
screenshots from the game" became comparison against a written checklist of its visual signature.

**For Michele to decide.** The deviations listed in `docs/3d-poc.md` (terrazzo floor, glazed foyer,
emergency lighting, the lifted pool lamp), whether the 3D look is worth pursuing for the entry at
all given the brief's "a sharp 2D game beats a vague 3D one", and which GPU to judge performance on.

**Verification.** `tsc --noEmit` clean; `vite build` clean; the test suite at 275/282 with the same
seven failures as the fork point (chapter 2 was mid-change there); headless runs with zero console
errors; a scripted playtest of movement, strafing, robot switching and camera follow.

**Later rounds, same night.** Each of these was found by looking at a frame, not by reading code:
- Coloured blobs floating on every glossy surface were the one environment capture reflected as if
  infinitely far away. The fix is the one shipped games use: box-projected (parallax-corrected)
  reflections inside the corridor, and the capture's specular turned down outside it.
- Two "magenta rectangles" chased through the foyer screenshots were the canonical camera standing
  inside the glass kiosk, then inside a wall. A raycast from the pixel settled it. The camera moved;
  no rendering code changed.
- The robots were ~600 of the scene's ~900 meshes and every mesh is drawn up to six times a frame.
  Merging static geometry per material, and each rig per bone, halved the draw calls; a pool of 14
  real point lights serving the venue's 28 halved the forward shader's light loop. Both measured
  with `renderer.info`, since frame times from a software renderer mean nothing.
- The scripted finale run (type the real code at the keypad, watch the shutter, the walk-out and
  the end card) was first invalidated by the dev server hot-reloading under it. Long checks now run
  against a frozen production build.
- ANGLE rejected three's empty shadow texture whenever cinema E's mirror bounces pushed a shadowed
  lamp out of the fog's light list, and skipped the draw. Unused slots now get a real depth texture.
- `pkill -f <script>` twice killed the agent's own shell, whose command line contained the pattern.
  Noted so the next session matches on `^node <script>` instead.

**Added on the way:** a title over a camera dolly with rack focus, photo-mode depth of field, the
corridor carried past the fire door to both secondary staircases (the Devoxx half lit, carpeted as
in the photos), the foyer back bar, lacquered wall panels, headlamp glare, and cinema E's screen as
a real mirror, which makes the puzzle's key object explain itself. Six hero screenshots are in
`docs/3d-poc/`. The playable build was republished to the same private artifact after each round.

### 24 Sep 2026 (morning) — 3D POC: two polish rounds

**Human decisions.** Michele confirmed the fork base (the 2.5D branch), kept the design deviations
and the "is 3D worth it" question for himself, opened network access for reference screenshots,
and asked for "a couple rounds" of polish. The access change had not reached this session's
container (the egress proxy still refused nvidia.com, steampowered.com and wikimedia.org), so the
rounds were judged against the written checklist of Cyberpunk 2077's look again, not against pictures.

**What the agent found, frame by frame:**
- *Every procedural material had been rendering with black albedo.* `fromSet()` cloned each baked
  render-target texture to set its repeat; a clone of a render-target texture is a Texture with no
  image behind it, and three uploads it as black. So albedo was 0, roughness 0 (hence mirror floors
  that no roughness tweak could soften) and the normal map was garbage. Last night's lighting was
  tuned against that: lights raised 6×, exposure 1.35, a strong ambient. Found by tinting the
  ceiling red to prove it was drawn, lighting it with a 300 cd test lamp that did nothing, swapping
  its maps out one at a time, then reading the texture's pixels back on the GPU. Fix: use the baked
  textures as they are (all repeats were 1). Exposure then fell to 0.32; env and ambient came down.
- The composite's contrast was a linear stretch around mid-grey, which clipped everything below
  ~0.03 to pure black. It is now a power curve around mid-grey.
- Blurred coloured blobs in the foyer were the corridor's environment probe box-projected onto the
  floor: three overwrites `envMapIntensity` with `scene.environmentIntensity` whenever the env comes
  from `scene.environment`, so zeroing it on the floor material never worked. Planar-reflective
  materials now switch env specular off with a shader define.
- Robot lamp flares were being mirrored into the floor; they are hidden from the reflection pass.
- Rough floor reflections now smear vertically (the long neon streaks of a wet night floor), and
  reflectivity is patchy. Neon signs got a dim halo and a distinct tube and core so the letters
  survive bloom. The back bar got frosted backlit glass and 66 bottles. The corridor soffit got
  linear slot fixtures, most of them dead.

**Rejected:** guessing at the flat, over-bright look with more grading before finding the cause.
Two exposure passes (0.8, 0.62) barely moved it, because AgX compresses in log space. That was the
hint that the scene itself was 2–3 stops too hot.

**Third round, after Michele's look at version 7** ("better! still a bit offy and with some
flickering light"; he asked for MAS and the Port House in the night view, with his own photos as
reference):
- Flicker had three sources. Two failing-tube effects blinked many times a second, all the time.
  They now stay steady and stutter briefly every twenty-odd seconds. The light pool and the fog's
  light list both cut at a fixed size, so a light losing its slot switched off in one frame. Both
  now fade lights out as they approach the cut.
- The window's skyline now has the Port House (glass ship with diagrid, white pedestal, the old
  fire station under it) and MAS (red sandstone boxes, glass galleries swapping sides), both drawn
  from his photos. They sit where they are from Kinepolis, south-west, and scaled as buildings
  two kilometres off. At full size they filled the window.
- "Offy" was not specific enough to act on beyond this, so it went back to him as a question.

**Playtest of version 8 (Michele, 24 Sep, afternoon).** He played chapter 1 in 3D and sent
screenshots. What each report turned out to be:
- *"It crashed while crashing the door; the game went still for a while."* The door breaking lets
  light reach cinema E's mirror, and the sim adds a mirror-bounce light. The 3D side showed it by
  flipping a SpotLight's `visible`, which changes three's light count and recompiles every
  material. Reproduced headlessly: an 11 s frame at the smash. The bounce lights now stay in the
  scene at intensity 0, and the smash frame costs the same as its neighbours.
- *"Biggy's body eats Droid's legs."* `MOUNT_OFFSET_Y` is a 2.5D picture offset ("up" on screen).
  Read as a world offset, it put Droid half a metre off-centre. The 3D rider now sits on Biggy's
  centre; the sim constant is untouched.
- *"Clue 3: I don't know where I should reach."* The projector panel shares its plan position with
  a corridor column, and in 3D it sat inside the column, invisible. It now hangs on the column's
  face, with a pulsing frame and a parking ring on the floor below.
- *"Biggy's light not reaching?"* The sim lights a clue anywhere in the cone out to 22–24 m. The 3D
  lamps fell off with the inverse square and pointed down, so they were invisible past ~5 m. Beam
  lamps now use linear falloff and a shallow tilt, and the venue's own lighting is dimmer ("too
  much light for a part that is supposed to be dark").
- *Walls coming back:* the camera's collision ray let it stay in the corridor whenever the
  robot-to-camera line went out through a doorway. The camera now stays inside the active robot's
  room.
- Also: the note on door E hung in mid-air after the door fell; the kiosk hatch was 0.9 m for a
  1.15 m Voxxy; a hologram stood in the shutter's face; a glowing arrow graffiti read as a hint;
  the ad screen stood on a column; solved clues now leave their digit painted on the floor, as
  the 2.5D build does.

**Human decision:** he keeps polishing gameplay on the 2.5D branch. The 3D renderer only reads the
sim, so his work is merged into this branch rather than ported. The first merge (46 commits)
conflicted only in this file, typechecked, and brought the suite to 460/460.

**Playtest of version 9 (Michele, 24 Sep, evening).** Most of it turned out to be the 3D renderer
not yet reading what the merged 2.5D sim now says:
- *Actions on E showed a toast and no animation.* The 3D side never passed the sim's `hopPhase`
  and `flairPhase` to the rigs. It does now, as the 2.5D renderer does. Droid's climb on and off
  Biggy is eased over 0.55 s instead of snapping. A reach gesture plays when Droid throws the
  projector panel and when a digit goes into the keypad.
- *Cinema B's door did not open and could be walked through.* The sim now keeps the door in its
  prop list with `state: 'open'` and a `progress` clock; the 3D side ignored both. The leaves were
  also hinged at the middle of the doorway. They now hinge at the frame and swing on the sim's
  clock, and the door's notice goes with its leaf.
- *"A passage you can't go through" beside the fire door.* The sim's fire door is now an opening
  with fixed `firescreen` walls either side, and 3D drew only the opening. The screens are drawn.
- *Clue 4 would not light.* A headless search placed Biggy at every spot he can actually reach in
  cinema E. Many work, all just inside the smashed door with his flood aimed at the screen's
  right-hand end. In 3D, though, the seat rows cast shadows from his lamp, so the alcove looked
  unlit when the sim counted it lit. The seats no longer cast shadows, matching the sim, where
  seat rows are `low` and light crosses them.
- *"The keynote poster is still flickering."* It z-fought with its own frame: the poster plane sat
  on the frame's front face. It now sits 3.5 cm off the wall. The ad screen also lost a 600-line
  scanline pattern that shimmered at a distance.
- Also: switching robot resets the camera behind the new one; Droid's camera looks up (his
  puzzles are high); cinema E's screen is a white screen again (the bounce stays, drawn from the
  sim's secondary lights); wall battens skip the Zaal panels and posters.

**Human decisions:** the misplaced staircases get fixed in 2.5D first, then merged. A demo comes
later. After that, on Michele's go, a parity pass on the 3D side against everything the 2.5D build
has gained, reading the logs of the merge.

**Not reproduced:** "Droid can't walk in the hint zone" (clue 3, cinema B). Driven headlessly, the
sim lets him walk up the aisle and across the clue, and the 3D seats are built from the same
`roomSeating()` as the sim's walls. The message the game shows when he stops would identify the
wall.

**Same evening, more of the same playtest:**
- *Steering:* "the camera should follow the direction the droid is facing". WASD was
  camera-relative, and a camera that followed the heading fed back into "right" (the robots-in-
  circles bug of 23 Sep), so it only followed a robot running away from it. The controls are now
  chase-camera: W along the heading, A/D turn it, S back. The camera follows the heading and swings
  behind on a switch. Droid's look-up was halved: it cost too much floor.
- *Hint 3's panel turned green too soon.* It now waits for the reach to make contact (0.6 s).
- *"Still can't walk inside the hint 4 area."* The 3D wall pass skipped every plan wall with a
  `kind`; the merge gave cinema E's exit-alcove walls `kind: 'alcove'`, so they were solid and
  invisible. Now drawn. The staircase walls (three new kinds) are the same case, but the stairs
  are moving in 2.5D first.
- *Voxxy's light on the ring did not count.* The sim tests a patch of `CLUE_SPOT` = 5 px (0.4 m)
  round each clue; the 3D ring was 1.5 m across. Michele: "I would be more generous with the
  light / hint match." `CLUE_SPOT` is now 10 px (0.8 m), and the 3D ring is drawn at exactly that
  radius. This is a SIM change; the 2.5D branch needs the same one line. The suite stayed 460/460.
- *"I lost hint 3."* Unsolved rings were lit-only and went black in the dark front of cinema B.
  They now have the 2.5D plates' slow standby pulse.
- *The fire door's open leaves.* Michele kept the 3D roll-up shutter ("the rolling shutter is
  cool") and chose to leave the sim's swinging leaves alone. Each `fireleaf` wall the sim pushes
  when the door opens is drawn as a folded-back steel barrier. It is hinged at the door end, swings
  out as the shutter lifts, and fills the rectangle the sim collides against. Checked by typing the
  real code headlessly: both leaf walls appear and both barriers are built.
- *Camera, reverted.* After a day of camera changes (stay inside the robot's room, reset behind
  on a switch, Droid looking up, then chase-camera steering), Michele: "still hard with the camera.
  Can we reset it as in the first tries? The only needed change is probably droid view being a bit
  higher." The camera and WASD are back to the first build's, camera-relative with a drift behind
  a robot running away from it, and the only change kept is Droid's orbit centre raised from 0.8
  to 0.95 of his height. Rejected on the way, and why: every change fixed one screenshot and made
  steering harder. The room clamp pulled the camera in close; the switch reset and the chase
  steering changed what "forward" meant under the player's fingers.
- *"Pressing left makes it go ahead and left; I expect it only to turn, if not already moving."*
  Camera-relative A is "walk left", and the sim runs any stick at full speed, so there was no way
  to turn on the spot. The sim gained `Game.turn(rad)`: it turns the driven robot without moving
  it, only while standing (under 8 px/s). It is gameplay input (it aims a lamp without walking),
  so it lives in the sim; only the 3D build calls it, and the 2.5D controls are unchanged unless
  Michele wires it in there. In 3D, A/D alone from standing turn in place, and the camera swings
  behind so that W then goes the way the robot faces. Under way, A/D steer as before.
- *"Going straight with W, then reversing with S, the camera still faces W."* The original camera
  only follows a robot running away from it, and S is "towards the camera", so a camera that
  followed would have turned S round again. S is now an about-face: the first S frame locks the
  direction away from the camera, the robot walks it, and the camera swings behind. Scripted
  W → S → W: 180° turn, camera behind (0°), W continues the new way.
- *"That black box is a bit odd"*, and separately *"in that corridor there is a candy shop, a
  self-service shelf — another Devoxx flavour"*. The bare boxes were the sim's knee-high
  column feet left over when the holograms were cut to one in three. They are now lounge armchairs
  (the venue's red velvet) and low coffee tables with a closed laptop, a sticker and two cups, in
  the same footprint. The plan pairs some feet 4 px apart; one piece is drawn per pair. The candy
  wall is a 2.6 m pick-and-mix shelf, 0.3 m deep and flush to the wall, placed on the widest clear
  stretch in the closed section (beside Zaal D). It has twenty bins of sweets and a pink "pick &
  mix" neon.

### 3D candidate — second merge of the 2.5D branch (25 Sep 2026)

**What Michele asked.** *"2.5D has made lots of improvement. Can you try a 'rebase' and see if it all
fits? This is also promoted from POC to candidate. Focus on the intro, interface and chapter 1."*

**What the agent did.**
- *Merged, not rebased.* 40 commits of the 2.5D branch came in with one merge commit. The 3D renderer only
  reads `src/sim`, so no gameplay had to be ported. Conflicts were confined to `docs/` and the build
  config. The two-page Vite build broke the single-file publish (`tools/inline-build.mjs`), because a
  page built alongside another one imports a shared chunk. `PAGE=main|3d` now builds one page at a time,
  and `tools/publish-build.sh` produces both `dist/index.html` and `dist-3d/3d.html` as self-contained
  files.
- *Intro.* The old 3D title and dolly are retired. The 3D build now plays the 2.5D opening from
  `snap.opening`: the three crates on the dark stage, the emergency bulkhead light, a key light on the
  robot being introduced, then the walk out. The camera eases from the crates to each carded robot and
  settles behind the stand-at point. Title, cards and skip come from the shared HUD.
- *Interface.* The run sheet (I), the escalating hint (H) and the off-screen arrow are the 2.5D
  `createHud`. The arrow gets a 3D `project` hook that points the right way even for targets behind
  the camera. The audio edges (`main.ts`'s `updateAudio`) moved verbatim into `src/render/cues.ts`, so
  the 3D build gets the new keypad voice, the per-chapter score and every other cue without keeping a
  copy. `main.ts` is untouched and could switch to it.
- *Chapter 1.*
  - The secondary staircases now stand in the corridor, where the plans put them. They are real flights
    in 3D: two ramps with a half-landing, a balustrade and step lights, down to the ground floor.
  - Plates lift the robots.
  - Voxxy hops, and the party tricks play in 3D.
  - Cinema B's maglocked door swings open on the sim's clock.
  - R restarts the chapter: the 3D props now follow it back. Doors shut and are walls again for the
    camera, the projector panel forgets it was thrown, found clues go back to the standby ring, and the
    fire door's barrier leaves fold away.

**What was deferred.** Chapters 2–4 in 3D (*"We'll do the others later"*). The 2.5D side is still
working on a couple of things; the next merge is the same one-command operation.
- *Clue patch, two sizes.* The agent had raised `CLUE_SPOT` from 5 to 10 px in the shared sim for
  the 3D build and proposed the same change on the 2.5D branch. Michele: *"we can keep them different
  if it's not a problem. In 2D it works well. Maybe less dimensions?"* It is not a problem, and the
  reason holds up. From above, the whole lamp pool and the clue are on screen together. From behind
  the robot, the floor is foreshortened, and a pool that looks as if it covers the ring can fall
  short of it. `CLUE_SPOT` is back to 5, the 2.5D branch's value, so the next merge has nothing to
  reconcile. `GameOptions.clueSpot` lets a build pass its own size, and the 3D build passes 10
  (`CLUE_SPOT_3D`, the radius its floor ring is drawn at).
- *The 3D intro, second pass.* Michele: *"too slow and static... add actions (voxxy exits and
  jumps...)"*, *"when the crate opens, robots are on the side. Why?"*, and a first playable frame
  that was all crate. What the agent found:
  - The camera sat off axis, 40% of the way toward the middle of the row, so a robot standing a
    stride in front of its crate appeared beside it.
  - The follow camera took over at its usual pitch a stride behind the robots, which put it inside
    the crates.

  The fix is in the 3D renderer only; the sim's opening and its timings are unchanged.
  - The camera is square on to each robot, follows it out of its crate and dollies in.
  - Each robot does its own `E` trick as soon as it is out: Voxxy hops twice, Droid stretches,
    Biggy rolls. The camera holds between two robots while one trick overlaps the next crate
    opening.
  - The hand-off looks down over the crates and settles to the usual pitch once the robot walks.
    The crates are now camera colliders.
  - The lamp flare was a 1.2 m star that covered Biggy's face whenever a robot faced the camera,
    which the intro makes them do. It is now small and tight.

  Shortening the timings themselves was not done, because the 2.5D build plays the same opening.
- *Splash screen / menu.* The old 3D title ("Full-3D proof of concept · Press any key") is switched
  off, not deleted. The agent proposed bringing it back as a menu (Start, Continue, Credits, Controls).
  Michele: *"keep it out for the moment. Starting with the intro is cool."* The page starts on the
  crates intro, and the dormant code stays in `main3d.ts` in case a menu is wanted later.

## 25 Sep 2026 — the main staircase, and the briefing that spoiled itself

**What a human asked for.** Two lines, mid-session. *"You really don't wanna fix that main stairs,
eh?"* — fair; it had been measured and deferred for a session and a half. And, on the panel that
opens with each chapter: *"I'll hide this from the starting splash page, it's a kind of spoiler.
Could show the meter? and a key to expand to this?"*

**What the agent did — the staircase.** Re-measured it from the drawing rather than trusting the
note, which turned out to agree: on `plans/exhibition-floor-stairs-annotated.png` the stair's tread
lines run plan-east–west across x 308..511 over a 70 px depth, and the ascent arrow stands at
x 410 with its head at y 976 — pointing plan-NORTH, away from the Main Entrance at the plan's
bottom edge. This repo turns the plan a quarter turn (plan north → world west, confirmed against
three landmarks: the entrance, the BOF rooms and the polo store), so the flight climbs **west** and
is entered from the **east**, facing the doors. Ours climbed north, across its own treads.

The footprint did not move a pixel; the axis did. `groundPlates()`'s main flight became `axis: 'x'`,
`GF.gate` became a north–south rect on the east face, `stairFlight`'s `dir` went `'+z'` to `'+x'`,
Stephan moved to the opening in the barrier, and the exit cutscene climbs west through it.

**The turn changed what the gate is, and that was not a choice.** There are 55 px — 4.4 m — of
concourse between the new gate line and the glazed entrance wall, and the barrier across the foot
of the flight is 197 px. A leaf that long had nowhere to swing that was not inside the glass or
buried two metres up the treads. So the building settled it: nobody hangs a 15.7 m barrier on one
hinge, a stair that wide is closed by a run of posts with **one gate in it**, and that is exactly
what Stephan has been unhooking in the chapter's own text since it was written. `GATE_MOUTH` is the
opening, `gateDraw` reads the rect's long side for which way the run lies rather than carrying two
hard-coded orientations, and the barrier either side of the mouth stays standing.

**What was measured rather than argued.** The stair's step count. The run is 8.96 m now instead of
15.76, and the 16 steps it had gave a 31 cm riser — 24 gives 21 cm, which is a staircase people walk
up. Also the leaf's landing: swung right back it stops 11 px short of the glazing, which is why the
mouth is 44 px and not 48.

**A bug the change surfaced.** The two standing barrier runs were first pushed as `kind: 'gate'`
walls, which is what they look like. `openness()` in `src/render/doors.ts` reads the wall list for a
`gate` to decide whether the barrier is still sealed, so the renderer concluded the gate had never
opened and drew the leaf shut across its own opening — with nothing in the sim behind it.
`tests/colliders.test.ts` caught it as 40 cells of barrier you could walk through. They are
`gatebar` now, and the comment says why.

**What the agent did — the briefing.** The panel was doing two jobs with one layout. Opened *by the
chapter* it is a briefing and should set the scene; listing "light the orange + green mix" before
the player has seen a lamp hands them the answer to a puzzle they have not met. Opened *by `I`* it
is a run sheet, asked for, and then the rows are the whole point. So it has two states: the
briefing carries the objective, the count and the key that expands it; `I` turns it into the rows.

Screenshotting it turned up the other half of his note — the briefing was opening *on top of the
chapter card*, two panels saying the same thing through each other. It now waits for the card to be
dismissed. Card, then briefing, then play.

**Tests.** `geometry`, `surface`, `chapters` and `venue.smoke` turned to the new orientation rather
than relaxed — `surface` gained an assertion that height does not change across the width of the
stair, which is the thing that tells the two axes apart and is what was wrong before, and
`venue.smoke` now measures the drawn flight's own treads west against east instead of only looking
at where the gate is. Suite: **682 tests, 40 files, green**; `tsc --noEmit` clean; `After Dark ·
ERRORS:0` on the built bundle.

## 25 Sep 2026 — the crate that could eat a run, and the people

**What a human asked for.** *"Yes fine"* to two things offered off the backlog: the chapter-3
soft-lock, and then the people.

### The crate

`beerDone` needs all six crates on the bar, and a crate is a 0.32 m body in a hall built for 0.72 m
robots — so there are places a crate fits and Biggy does not. The note said *"nothing prevents one
ending up shoved under a booth"*, which is a guess; so the first thing was to stop guessing. A sweep
of every cell of the ground floor against both radii found **exactly one** such place: the 15 px
slot between the sandwich counter and the coffee counter, open at its south end and backed by the
hall's north wall. Five cells out of 61,218.

Then a second measurement narrowed it again. The slot is 30 px deep and `CRATE_REACH` is 26, so a
crate in the MOUTH is still something Biggy can lean in and take from the open floor outside — at
y 112 there is exactly one standing spot left, dead ahead at 25 px. Only past about y 108 does the
last of them go. The test is aimed at the back of the slot for that reason, and says so.

The guard is general rather than a plug in that one slot: the slot is a consequence of two counters
standing a metre apart, any future prop can make another, and a chapter that can eat a crate is a
chapter that can eat a run. It costs nothing per frame — a crate can only become stranded by coming
to rest, so the check runs on the frame its velocity hits zero and never otherwise. `crateReachable`
and `crateRescueSpot` live in `src/sim/crates.ts` rather than as closures inside `setup()`, because
a closure is a thing no test can ask a question of.

**A bug found on the way.** The first version pushed the standing barrier runs as `kind: 'gate'`
walls, which is what they look like. `openness()` reads the wall list for a `gate` to decide whether
the barrier is still sealed, so the renderer concluded the gate had never opened and drew the leaf
shut across its own opening. `tests/colliders.test.ts` caught it as 40 cells of barrier you could
walk through.

### The people

They were a cylinder with a sphere on top — no arms, no legs, nothing that moved — and there are
thirty-six of them walking chapter 3 and eighty-four filling Room 8, so they are in almost every
frame of the back half of the game. Ten points are "sense of place", and a venue full of chess pawns
does not have one.

**The sim had to change first, and that is the interesting part.** A body needs three things a
position cannot give it: **identity**, because a body has to be the same body every frame; a
**heading**, because a figure with a front has to have one; and a **speed**, because legs swing in
proportion to it. All three are facts about a person rather than about a picture, so all three are
the sim's — `Person.seed`, `Person.face`, `Person.speed` in `src/sim/types.ts`, with the chapters
handing out seeds from a counter that only ever goes up.

`seed` fixed a live bug nobody had reported. The old height jitter was derived from `x` and `y`, so
a visitor **changed height as they walked** — the comment above it claimed the opposite, and was
true only of people standing still. `tests/people.test.ts` now holds that: the same person in two
places is the same height, two seeds in one place are not.

**The gait is stateless, and that is a design choice rather than a shortcut.** There is no
per-person phase kept anywhere: the phase is `t * cadence + seed` and the AMPLITUDE is what `speed`
scales. A person who stops has their legs come to rest instead of freezing mid-stride, a person who
starts walking picks up wherever the clock is, and the renderer never has to match a person in this
frame to a person in the last one — which is just as well, because `snap.people` is rebuilt every
frame and a visitor who sits down takes everybody's index with them.

**Two things were measured rather than eyeballed.**
- **The hair was a sweatband.** The sphere geometry has radius 0.5, so a scale of `k` is a radius of
  `k/2`; the first pass centred the cap low enough that its top came out *below* the crown. Centred
  at `H - 0.55 r` it sits on the top 44% of the skull, which is a hairline.
- **Seated height.** A seated figure that keeps its standing hip is a standing figure with its knees
  bent, and Room 8 read as a row of people hovering. Dropped to a hip of 0.62 m — 17 cm above where
  a chair actually puts one, and deliberate: at the true height the seat backs cut the audience off
  at the neck and a hall of floating heads reads as emptier than a hall of people. CLAUDE.md's
  *"recognisable beats precise"*, applied to a crowd.

**Cost, measured against the previous build rather than guessed.** Twelve meshes a figure, with
every geometry and every material but the clothes shared. Headless Chromium on SwiftShader renders
chapter 3 at 2 fps — and rendered it at 2 fps on `dbaee3e` too, with the old pawns, so the software
rasteriser is the floor and the figures are not measurably on top of it.

**Tests.** `tests/crate-rescue.test.ts` (4) and `tests/people.test.ts` (8) new. The people tests
call `updateMatrixWorld` before every measurement, with a comment saying why: `Box3.setFromObject`
only refreshes the object handed to it, not the chain above, and a figure that has never been
rendered measures as its own local box — which would have made every pose look identical, the exact
wrong way for that file to be wrong. Suite: **694 tests, 42 files, green**; `tsc --noEmit` clean;
`After Dark · ERRORS:0` in all four chapters of the built bundle.

## 25 Sep 2026 — sixty visitors, and the deadlock that was hiding behind thirty-six

**What a human asked for.** *"Raise a bit, 60?"* — after the figures got bodies, and after the
agent pointed out that the hall simulates thirty-six people while the chapter card claims three
thousand walk in.

**What the agent did.** `VISITORS` 36 → 60, and `SPAWN_EVERY` 0.9 → 0.55 with it, so the hall still
*fills* in the same thirty-odd seconds rather than spending a minute half empty — the second number
is part of the first change, not a separate opinion.

**What that turned up, which is the whole of this entry.** Counting how many visitors actually
reached the hall across five seeds gave 45 to 53 of 60, never all of them, and a cluster of thirteen
standing at **exactly zero speed** at the top of the six steps. Tracking it over time showed it was
not traffic: seventeen people knotted there from frame 3,500 to the end of the chapter and never
moved again.

`stepVisitor`'s rule was *"do not walk into the back of the person in front"*, implemented as
`spd = blocked ? 0 : a.walk` — and nothing anywhere to start them again. A stands in front of B, B
stands in front of A, and both are still there when the chapter ends. Then the number that mattered:
**seven of the sixty were moving at all.** The hall was not a crowd with a jam in it, it was a room
of statues with seven people walking through them — and it had been, at thirty-six, since the crowd
was written. The old test's `>= 33 of 36` had been covering for it.

The fix is what a pedestrian actually does: not stop, sidestep. A blocked visitor steers onto the
perpendicular that leads away from whoever is in the way, at a little over half speed. Two people
meeting head-on each see the other a touch off-centre and pass; dead level, `Person.seed` gives
everybody a consistent hand to favour, which is what a corridor full of people settles into anyway.
That seed exists because the renderer needed stable identity — it turned out to be the cheapest way
to break a symmetry in the sim as well.

Measured after: **60 of 60 in the hall, 0 stuck, 55–58 of 60 moving**, on six seeds.

**What was NOT done.** The threshold in `tests/chapters.test.ts` was raised to 55 first, which
passed on the default seed and would have gone red the moment anybody changed it. Checking five
seeds is what turned a tuned number into a bug report. The assertion is `toBe(60)` now — everybody —
because that is what the behaviour actually is once it works.

**Cost.** The crowd's only quadratic term is each visitor's pass over the others: 3,600 distance
checks a frame at sixty, against the 2,900 meshes the hall already draws. Headless Chromium renders
chapter 3 at the same 2 fps it did at thirty-six and at the same 2 fps it did with the old pawns —
the software rasteriser is the floor in all three.

**Tests.** `tests/chapters.test.ts` gains "keeps the crowd walking instead of deadlocking it two
abreast" — three seeds, more than forty of sixty moving, nobody parked in the doorway — with a
comment drawing the line between dwelling (up to two seconds at a lane node, by design) and being
frozen for good. Suite: **695 tests, 42 files, green**; `tsc --noEmit` clean; `After Dark ·
ERRORS:0`.

## 25 Sep 2026 — Biggy rolls when he is pushed, and the gate that decides it

**What Michele asked for**, on 24 Sep and then deferred himself: *"ah Another thing to handle later.
Biggy should really roll, at least when he's pushed!"* It had been sitting in
`docs/playtest-notes.md` under "mechanics still owed" ever since. He said *"Ok next task?"* and this
is the one he had named himself, so the agent took it without asking.

**What the rig would not allow.** The obvious reading is to spin the gut. `buildBiggy` parents the
belly shell, the hatches, the bumper, the shorts, the belt, the vents, the seam ring **and** the
neck, the helmet and both shoulders to `torso` — so a literally rotating gut means re-parenting a
model Michele has already signed off, to draw a thing that lasts two seconds. Instead the roll
borrows the vocabulary of the party trick that already exists: `applyFlairBody` tips his whole body
about the floor between his boots, and the pivot maths came out of it into `tipBiggy(rig, th,
standH, axis, rise)` so both use one function. The shove tips him forward and back on `x` where the
flourish rocks him sideways on `z`; the lid fails to stay level by about half, and the stubby arms
trail, because it is the same lid on the same ball.

The angle is integrated from **distance**, not from the clock: `v dt / (height * 0.415)` is what a
ball that size turns through while it travels, so speeding him up makes him roll faster instead of
flapping faster. That is the same rule the step cycle two hundred lines up already follows, and it
is the difference between physics and an animation.

**The part that was actually hard was the gate**, and it is the second time this week that a
cosmetic task turned into a bug report. "Being pushed" first read as *the stick is empty and the
smoothed acceleration is positive* — you cannot speed up under your own steam with nothing on the
stick, so it looked airtight. It is not: `GaitState.accel` is a 1/6 s low-pass, so for a few frames
after every release the stick is empty **and** the acceleration is still positive. Driven for a
third of a second and let go, Biggy rolled at **0.61 of a full shove** and took a second to settle —
exactly the "he lurches every time you let go" that the threshold had been added to prevent.

Measured properly, driving the sim at `DT_MAX`:

| case | peak accel | spurious roll |
|---|---|---|
| Voxxy shoving, contact resolved | 6.6 m/s² | — |
| Droid shoving | 3.4 m/s² | — |
| Biggy driving himself | 2.2 m/s² | none (stick held) |
| 0.1 / 0.2 / 0.35 / 0.5 / 1.0 s tap, then release | — | **0.30 / 0.56 / 0.61 / 0.56 / 0.37** |

So the threshold could not be rescued by raising it: a weak shove and a tap-and-release sit in the
same band. **The sim already had the right answer and was keeping it private.** `stepAim` in
`src/sim/bot.ts` maintains `driven` precisely to decide whether a let-go robot's heading follows its
stick or its velocity — its own comment says *"a body that speeds up while nobody is steering it is
being towed, shoved or knocked"* — and it has no filter to lag: `coast` ratchets down to the running
minimum speed, so a shove trips it on the frame it lands and a coast, which can only ever slow down,
never trips it at all. That is published as `worldMoved(bot)` (a read of existing state; no sim
behaviour changed) and `scene.ts` asks it instead of guessing. `PUSH_ACC` and the whole asymmetric
coast-fade went with it: the roll now dies with `amp`, which is the speed, so he stops rolling
because he has stopped.

**A comment that had to be retracted.** The old line in `scene.ts` read *"The sim does not have a
flag for it and does not need one."* It did have one. Both that comment and the `shoved` doc in
`robots/index.ts` now say what the wrong question cost, so the next person does not re-derive it.

**Tests.** `tests/shove-roll.test.ts`, nine cases. The rig ones run one sim and feed the identical
stream of speeds and headings to two rigs, one with `shoved` wired up and one holding it at 0, then
measure the difference — the lean, the stride and the idle twitches are common to both and cancel,
so what is left is the roll alone. A real shove swings the pelvis both ways and keeps rolling
through the slide; driving himself, tapping the stick at five different hold times, and a wall
bounce mid-coast all measure **exactly zero** difference; Voxxy and Droid measure zero when knocked,
because a shoved Droid standing there offended is the right picture for Droid. The tap case was
checked against the old derivation and fails on it, so it is not a vacuous zero.

**Also closed: chapter 1, note 14** — *"lighting on south room is odd. I should be able to see the
seats"*. The note had guessed this was already fixed by note 3 (the seats were missing geometry, not
dim geometry) and it was: parked in cinema E, five rows read clearly under all three lamps and the
clue ring. No lighting change was needed, and none was made — worth saying, because "adjust the
lighting" was the obvious thing to do and would have been a change to something that was not broken.

Suite **704 tests, 43 files, green**; `tsc --noEmit` clean; `After Dark · ERRORS:0` on the built
bundle in chapter 2, with the shove driven through the real key handler.

## 25 Sep 2026 — the audit that found a one-in-six soft-lock

He asked what else there was to go on with, so the agent went through
`docs/playtest-notes.md` row by row against the code rather than picking a feature.
That file is what he reads to decide what is left, and it had drifted badly: **nine
rows claimed open work that had already shipped.** Chapter 1's notes 9, 10, 11 and
12 were still "in flight" days after the speed rescale and the falling-leaf
animation had landed; four structural rows described code that has since been
fixed — `weather()`'s white flakes (`MAX_WEAR_LUM_GAIN`), `buildLights`' missing
range cull (`castPoly` filters occluders now), `gaitSpeed`'s `tanh` (removed, with
the measurement that showed it was making all three robots skate), and the four
helper sets that wanted promoting to `rig.ts` (promoted, rivet aim and all). Every
row now carries the evidence rather than a status word, and the rows that are still
true say **re-checked, and when**.

Note 13 is the one that did not close: the transition's pace is fixed and held by a
test, the zoom is fixed (`CUT_FRAME`), and *"too dark"* is untouched on purpose —
chapter 1 is a dark building by design and it had a whole light pass after that
note, so it is a mood decision and his. The cutscene was driven and re-shot on the
V37 build so he judges the current one, not the one he played.

**Then the audit turned up a real bug**, in a row that read like a footnote: *"`E`
precedence at the Sticker Mine … the chapter-3 end-to-end test already works around
it by clearing the sticker first."* A test working around something is worth
opening, and underneath it was this. The keynote speaker's hiding place and the
Sticker Mine's top-shelf swag are both derived as `inFrontOf(booth)`. When the
chapter's RNG picked the Sticker Mine as the hiding booth, the two were **the same
point** — and the minigames get `E` before the chapter does, so Voxxy pressing `E`
at the speaker got the sticker's "I am 38 cm of robot" refusal, which consumes the
key. Chapter 3 cannot be finished without the speaker, and nothing tells the player
that walking Droid over for a sticker is what unblocks it.

Measured over 200 seeds: **35 of them. One run in six.** Two test files had been
papering over it — `tests/chapters.test.ts` and `tests/pilot.ts` both cleared the
sticker first, and `pilot.ts`'s comment even stated the symptom (*"a run that skips
it ends up collecting a sticker instead of a keynote speaker"*) without anyone
treating it as a bug.

**What was NOT done.** The obvious fix is to reorder the handlers so the chapter's
own beats get `E` first. That is wrong here: Michele's rule for this chapter is that
a refusal which names a reason keeps the key, because those refusals are answers and
hopping instead would be a worse game. The second-obvious fix is to name the Sticker
Mine as forbidden, which fixes today's collision and none of tomorrow's. What went in
instead is the general shape: `Minigames.keySpots()` publishes the circles where the
optional content will swallow a key, and the chapter's spine keeps `SPEAKER_CLEAR`
out of them when it picks a hiding place. Either beat can move now and it stays
correct.

`tests/speaker-spot.test.ts`, two tests at two altitudes across sixty seeds each:
the spots are apart, and Voxxy can collect the speaker **with the sticker still on
its shelf** — the state the old code could not survive. Both go red on the old
derivation. The two workarounds are gone: `chapters.test.ts` runs the errand with
the collision live, and `pilot.ts` takes the sticker after the speaker instead of
before, which keeps its swag count identical while exercising the fix.

Suite **706 tests, 44 files, green**; `tsc --noEmit` clean.

## 25 Sep 2026 — his decisions, and the line that finally had an address

Michele went through the open list and settled nine of them. Three needed building.

**The flicker, found because he gave a location.** *"Chapter 2/3 the passage between
the reception zone and the main hall. There's a line that flicker when the robot is
walking."* It had been on the list since 24 Sep as "queued, not yet reproduced" —
three of his reports over three days are the same fault, and none of them survived a
screenshot, because z-fighting sits perfectly still until a light crosses it. A robot
walking past with a lamp is what makes it move.

Measured off the built scene rather than looked for by eye: the raised lobby plate
started 6 px west of `LOBBY_X` and the threshold's top tread ended there, both top
faces at **y = -5.0000 exactly**, sharing a 0.48 m ribbon down the flight's whole
22.6 m — plus the concrete riser caps above and below the flight, which the lip
covered outright. The plate stops at `LOBBY_X` now. Abutting is fine; overlapping is
not.

The test is the class, not the instance: `tests/coplanar.test.ts` walks the built
venue, takes every mesh's top face, and fails on any pair sharing a height to within
a millimetre and overlapping in plan — but only in the height bands a robot walks in,
because a dozen wall tops meet at corners by construction and a speckle at 2.4 m is
not what anybody sees. It immediately turned up **a second one nobody had reported**:
the first floor's corridor carpet ran straight over the main staircase's head,
12.46 m² at y = 0.0000. Reverting the first fix makes the test report 23.04 m² of
ribbon across three pairs, so it is not a vacuous pass.

**The fire door's arc push**, which he chose over a shutter. For the one second of
`FIRE_SWING_TIME` the `firedoor` collider has gone and the leaves' resting walls are
not in yet, so a robot standing in the arc was passed straight through — and that
robot is Voxxy nine times in ten, because the keypad she has just used is **on the
door**. `sweepFireDoor` finds the closest point on each leaf's centre line, puts the
robot out along the leaf's own normal, and gives it the leaf's speed at that radius:
a point `r` along a leaf turning at `w` travels at `w r`, so the tip throws harder
than the hinge, out of the arithmetic rather than out of a special case.

Two things were wrong first and both were found by measuring:

- The push direction was "whichever side of the leaf she is on". A robot standing
  exactly on the line has no side, so the sign came out of rounding noise, and Voxxy
  in the doorway was thrown **east**, deeper into the opening she was meant to be
  cleared out of. A door pushes one way.
- The first tests compared the **peak** speed from two radii and got 53.8 against
  52.8 — which is not the push being flat, it is the robot sliding outward along the
  leaf until both ride the tip. The measurement that means something is first
  contact, and there it is exact: **31.3 px/s measured against the leaf edge's
  31.26**. Two more test setups had to be thrown away before that: the subject cannot
  be the robot that types (`g.key` goes to the driven robot and the code is only
  accepted at the pad — the door never opened, `fireSwing` stayed 0.000 for forty
  frames), and it cannot stand in the north leaf's quarter, because the keypad
  housing ejects it before the swing starts and all three radii came back from
  `place` at one corner, leaving an experiment with no radius in it.

**The toilets**, *"cover the toilets"*: sealed rather than moved. One unbroken south
face with a pair of shut leaves drawn in it and the pictogram over them; the two
internal partitions went with the doorway. Nothing in any chapter happens in there,
and a room nobody can walk into is a room whose position against the plan nobody can
check — which is what he was asking for when he said it was not an important detail.
`tests/geometry.test.ts` asserted one doorway; it now asserts the face is unbroken
and that the shut door speaks in three voices.

**Closed with no code**, on his word: the two clue spots that sit near each other and
chapter 1's number hunt (*"keep as is"*), six beer crates rather than five
(*"six is fine"*), the OutOfMemoryError at five crates (*"that's fine"*), and
`pushBiggy`/`stepTow` ignoring Biggy's mass (*"fine as is I'd say"*) — the last of
which would have retuned chapter 2's roller door, so it stays frozen.

**Still his**, and he is replaying tonight for them: the two reception objects he
would have to point at, chapter 1's mirror puzzle playing off camera, the crowd radii,
chapter 3's leaking catering gate (measured again and drawn to scale this round — 11
px of the doorway's 44 fit Biggy's centre with the queue standing, 27 px once Voxxy
clears it, and he can already get within 25 px of the soup against a `POT_REACH` of
70), the intermediate-challenge beat, and chapter 4's six minutes.

Suite **711 tests, 45 files, green**; `tsc --noEmit` clean; `ERRORS:0` in all four
chapters on the built bundle.
- *Third merge of the 2.5D branch (10 commits).* In 3D only chapter 1 and the robots needed
  anything.
  - Biggy's roll when shoved: the gait now takes `shoved: worldMoved(b)`.
  - The fire door's arc push. Michele had chosen, on the 2.5D side, that the swinging leaves shove
    whatever is in their arc (*"arc push"*, over a shutter). The 3D build still drew the roll-up
    shutter he had kept earlier, so in 3D a robot would have been pushed by nothing visible. Asked
    which door 3D should have, he chose swinging leaves. The 3D door is now the sim's double door:
    red steel leaves hinged at the jambs, posed from the door's `progress`, under a steel transom.
    The folding barriers that stood in for the swung leaves are gone, because the leaves are now
    the door itself.
  - The ground-floor changes (main staircase turned, toilets sealed, the lobby z-fight) and
    chapter 3's crowd are outside what the 3D build draws.
- *The shutter goes to chapter 2.* Michele: *"Keep the [shutter] design for chap2."* The roll-up
  shutter that was chapter 1's 3D fire door is saved as `src/render3d/shutter.ts`
  (`rollerShutter`, `poseShutter`) for the store's roller door in chapter 2. Nothing builds it until
  the 3D build has that chapter.
- *Intro and panel feedback (25 Sep, evening).*
  - *"When the crate is open robots are still on the side, then they turn. I'd keep them
    frontal."* In the crates the sim turns the robots south, toward the 2.5D diorama's camera. The
    3D intro looks from the east, so they stood side-on. In 3D they now face east for the whole
    opening.
  - *"A little more time before the camera movement for Biggy's movement."* The pull-back starts
    0.7 s later and still lands on the hand-off pose when the opening ends.
  - *"The crate's panel on the ground does not look fine... a part disappears, like it's
    absorbed."* The 2.5D model tips the front out flat and rolls it face up to spell the word, which
    works from above. At eye level it was a board sinking into the floor at the robots' feet. In 3D
    the front now swings open like a door, hinged at its outer edge.
  - *"'do not bend' should also be in red."* All three crates' warning stamps are now oxide red.
    This is in the shared crate model, so 2.5D gets it too.
  - *"We lost the main story. Stephan lost the keys... keep a general objective + chapter briefing
    in the I panel."* The crate opening had replaced the title card, which was the only place the
    premise was told. The premise now lives in `src/sim/story.ts`, which the title card reads. The
    run sheet (shared HUD, so both builds) opens with "The night" (the premise and the run's goal)
    above "This chapter" (the briefing).
  - *"How do I close the start-of-chapter panel? I thought any key would do."* In 3D any key now
    closes it except I, H and the view keys (M, N, P, Q). A movement key closes it and moves.
    `main.ts` still closes it only with Escape or I; the 2.5D side may want the same change.
- *Evening playtest round (25 Sep).*
  - *Clue 2 "too easy... rotated Voxxy, hint solved".* A probe over every heading from the three
    starting marks lit the kiosk clue at any tolerance, 2.5D's 5 px included. Since the crates moved
    to the west end, the robots start 9 m from a kiosk with glass on all four sides. Fixed in the sim:
    the kiosk's back (menu board) and its counter front either side of the hatch are now solid, with
    glass on the south and east. The probe now finds no heading from the marks that lights it, and
    the puzzle is the one it was written as: Voxxy in through the hatch, Biggy's flood through the
    glass. Moving the clue out of the kiosk was rejected, because that would lose the hatch puzzle.
    The 2.5D renderer will now draw those two sides with its generic solid-wall code; left for the
    2.5D side to style.
  - *Tolerance.* `CLUE_SPOT_3D` is now 7 px: at 10, clue 4 went without Voxxy ever entering the
    alcove.
  - *Droid's "eyes" behind his head.* His skull mesh was wound inward. From behind, its back was
    culled and the eye beads showed through. It is now wound outward, in the shared rig, so 2.5D
    gets the fix too.
  - *Droid sinking into Biggy.* In 3D he now rides 10 cm above the crown.
  - *"Where's the keypad?"* The 3D pad still had its keys on its narrow west end, although the sim
    had turned it to face the corridor. It now faces the corridor, has a backlit bezel that pulses
    until the code is in, and a lamp in front of it.
  - *"A floating camera + wall part".* The CCTV at x 60 and the north cable tray. From the high
    hand-off camera both hung in mid-air in the first frame; the CCTV moved and the tray is gone.
  - *Crate fronts.* *"I liked the way they opened and started falling, the problem is the final
    part."* 3D keeps the fall and drops the roll: the front lies flat and stays on the floor.
  - *The exit.* *"The cutscene camera should show the 3 characters from above/behind."* 3D now has a
    cutscene camera that jumps under the sim's black fade and drifts behind the three as they walk.
    The fade itself, 0.45 s after the leaves finish swinging, is the sim's and was left as is.

### 3D chapter 2, first pass (26 Sep 2026)

**What Michele asked.** *"Can we start chapter 2 next? Anything pending on one? I can play it later."*

**What the agent did.** A first playable pass of the exhibition hall in 3D, built the way chapter 1
was: everything solid comes from the sim (`groundWallsFor(2)`, `groundPlates()`, `GF`), and the
renderer only reads the chapter's props.
- `src/render3d/ground3d.ts` builds the ground floor:
  - floors at the sim's heights: the hall at 0, the lobby 0.5 m up with its steps, the main flight
    to the cinema level;
  - walls by kind: booth totems, columns, stair shafts as rooms, the back-of-house, the glass
    entrance front;
  - a trussed ceiling, exit signs, a coloured floor tile per stand, and a name board over each
    sponsor's stand;
  - a grid of high bays that strike across the hall when the sim's `breaker` prop reaches `done`,
    which in this chapter means the router has closed the circuit.
- `src/render3d/props-ground.ts` draws the chapter's chain from the props:
  - the breaker board, high up for Droid;
  - the rack and its link lights;
  - the router cabinet, whose leaves swing on the sim's clock, and its pilot lamp;
  - the router and password terminals, with the typed fraction filling in;
  - the DevoxxForever spray tag, faint until a beam finds it;
  - the cable run, as a tube following the sim's points;
  - the badge printer;
  - the lit floor plates and wayfinding signs;
  - Biggy's roller door, which uses the shutter kept from chapter 1 for exactly this;
  - the t-shirt pallets and the registration gate.
- `world.ts` switches floors on the chapter change: which floor is shown, fog box, reflections,
  environment capture, and a props set per floor. `main3d.ts` now plays chapter 2 and ends after it.

**Not done yet.** No playtest of the full chain in 3D. The dark hall before the power comes on may
be too dark to steer by. There is no lobby or reception dressing beyond the walls, and nothing
of chapter 3 yet.
- *Evening round, 26 Sep.*
  - *Kiosk.* *"White walls are too anonymous... a full stencil for a popcorn booth?"* A funfair
    stencil first; then *"not aligned with the rest of the style... keep the neon, more cyberpunk"*:
    black metal panels, the bucket as magenta tubes, kernels as amber rings, POPCORN as a
    magenta/cyan glitch double, and a hazard kick band.
  - *Run sheet.* *"The panel with both is too big / too much to read... switch between main text
    and chapters with arrow left/right?"* It now has two pages, the night and this chapter. The run
    opens on the night, and ← → turn the page while it is open, in both builds.
  - *Droid riding.* *"Legs too open in this view... should be pressed on Biggy?"* The rig's
    mounted pose throws the knees wide for the 2.5D camera above. The 3D build overrides it: the
    legs go out to the dome's flanks and hang down its sides.
  - *"The intro was slower."* Its timings are the sim's and did not change. Most likely it was the
    machine; noted in case it recurs.

### 3D chapter 3, first pass (26 Sep 2026)

**What Michele asked.** *"Push on to 3."*

**What the agent did.**
- *The crowd:* `people3d.ts` pools the 2.5D build's own figures (`buildPerson`, posed from
  seed, heading and speed), placed on the sim's floor plates. No new model; the same people in both
  builds.
- *Props, in `props-ground.ts`:*
  - the tomato soup station under a neon word;
  - the ladle on its high shelf, gone once Droid has it;
  - the pot and the soup riding on Biggy's lid;
  - the broodje krab;
  - Stephan's gate, whose glass flaps fold away on the sim's swing;
  - The Finally Block (a black bar with a neon name, taps, and four Belgian glass shapes by `v`);
  - beer crates, stacking on Biggy by layer;
  - the booth games: the rubber duck, its target, the race markers and the top-shelf sticker.
- *Stable identities:* props that move (the pot, the duck, a named crate) get a stable key instead
  of their position. Whatever the snapshot stops carrying hides, so chapter 2's shutter and
  pallets are gone in chapter 3.
- *Morning:* the hall is lit from the start, with bays over the lobby too. The walls chapter 3 has
  that chapter 2 drew as props appear in chapter 3. The end card now follows chapter 3.

**A bug worth recording.** The hall stayed dark in chapter 3. "Circuit open" was stored as a start
time of -1, and "lit from the start" set the start time 60 s in the past, which is also negative in
the first minute of a session. It is now an explicit null. Found by exposing the ground floor to
the page and calling it directly: it lit when called by hand, so the fault was in how the world
drove it.

**Not done yet.** No playthrough of chapter 3 in 3D. The ceiling and the far walls are dark even
when lit. There is no daylight through the entrance glass. Stephan and the speaker are drawn as
ordinary figures with their role colours.
- *Droid riding, second pass.* *"Pressed is fine, but they should not disappear into Biggy's
  body!"* Hand-tuned angles had put the shins inside the ball. The pose is now solved once against
  Biggy's real shape: his belly is a 0.6 m sphere at 0.735 m (`biggy.ts`) and his lid a dome above
  it. A small search over hip roll, thigh and shin angles keeps knee, mid-shin and ankle just
  outside the body, as close to it as they get, and prefers legs hanging down the flank to legs
  sticking out. It is solved at the final riding height rather than mid-climb.
- *Kiosk hatch passes light (27 Sep).* *"The hint is triggered only if Biggy goes by the glass
  window. His light should pass also from the opening I guess?"* The hatch is an invisible collider,
  so that only Voxxy fits through, and the light code treated every wall that was neither glass nor
  low as opaque. The sim's `Wall` gained `open`: stops robots, passes light. It is set on the hatch.
  Probed: Biggy standing outside the hatch now lights the clue, and no heading from the three
  starting marks does, at either tolerance.
- *"The main corridor seems closed, it's not!"* (27 Sep). The 3D build ended in a wall at x 1190,
  just past the secondary stairs. The corridor now runs to its real end, the main staircase
  between rooms 6 and 7 (`CORRIDOR_END`, from `F1.mainStair`), with a full-width flight down.
  Rooms 4–9 stay unbuilt but have shut double doors; the corridor gets its floor, coves, ribs,
  columns, emergency lights and a line of warm downlights. Michele also passed the chapter 1 fire
  door and staircase animations: *"fine"*.
- *Batch of 28 Sep, from a playthrough.* Eight asks, one change each.
  - *Feet in the crates.* "Robot's feet are drowning in the wood." Robots were placed at floor
    level inside the crate and on the fallen panels. The world now gives the renderer the surface
    under each robot (the crate's inner floor, or the top of a fallen panel), and the rig stands on it.
  - *Slow intro.* "Looks like a performance issue." It was one. The sim takes at most 1/30 s per
    step, and the page used to clamp each frame to one step, so below 30 fps the whole game ran in
    slow motion. It now takes as many steps as the frame needs (up to 0.1 s), so a slow machine
    drops frames rather than slowing down.
  - *Music in the opening.* A new score for chapter 0: 92 bpm, A minor, a pad, a pulsing bass, an
    arpeggio, with drums and a bell joining over four bars. Two bugs were found while adding it:
    the music player and the audio shell both treated chapter 0 as "nothing asked yet", so a
    chapter 0 score could never have played. Both now start from -1. The test that used chapter
    0 as its unscored example now uses 9.
  - *A gate before the opening.* Browsers only allow sound after a key or click, and the first key
    used to skip the opening. A black "AFTER DARK · press any key" screen now takes that key, and
    the opening plays from its first frame with music. Michele had just said the splash should come
    back "later"; this is not that splash, only the smallest gate that lets audio start.
  - *Briefing.* "Make the main briefing bigger and just the story. Any key or → move to current
    briefing." The story page is wider, set larger, and shows only the night and the goal. Any key
    that does not act on the panel turns to the chapter page, and the key does nothing else. ←
    returns to the story. Same in the 2.5D build, through the shared HUD.
  - *Walking backwards.* "What if pressing down arrow could cause the robot to walk backwards?
    keeping the camera and orientation." This replaces the 24 Sep about-face. It needed the sim:
    the heading is sim state (the lamp's aim), so `setStick` takes an optional heading that the
    driven robot keeps while it moves. S locks the current heading, and S with A/D backs away at a
    diagonal. Speeds, inertia and every frozen constant are unchanged; it is input. The gait mirrors
    its stride when a robot moves against its heading, so it steps back rather than moonwalking.
  - *Camera on switch.* "The camera shouldn't reset to frontal when switching robot?" Read as a
    request: switching now swings the camera round behind the new robot, and moving the mouse
    cancels the swing. It used to keep its yaw, so a robot facing the old camera came up face-on
    and W walked it the wrong way.
  - *Floating clue number.* "Where's the floating number? ... make it 3d and slowly rotating." The
    found digit was a flat billboard 1.35 m up, often out of frame from a close, steep camera. It is
    now a solid pixel-font digit, extruded, 1.2 m up, turning slowly, with its "POSITION n" tag kept
    as a small billboard underneath.
  - *Biggy less bouncy with Droid on top.* The rider sits at a fixed height, so Biggy's full walking
    bob under him read as a trampoline. Laden, Biggy's gait keeps a quarter of its bob, sway and
    twist, and 40% of its lean. This is presentation only: the collision bounce is a frozen
    constant and was not touched.
  - *"The door eats the foot in some places."* The sim publishes the fallen leaf of cinema E's door
    as a plate, placed where the 2.5D leaf lands: skidded, skewed, 0.48 m thick. The 3D leaf falls
    straight and thin, so the plate lifted robots in some places and left them sunk in others. In
    3D, robots now ignore that plate and stand on the drawn leaf, found by a downward ray against it.
    The 2.5D build keeps the plate.
- *Second batch, 28 Sep.*
  - *Splash.* "Could we add the Devoxx logo? And the Antwerp view maybe?", then "could we fit
    some robot element on the logo? the original is just an inspiration." The press-any-key gate
    became the splash. Everything is drawn in code, with no asset files and no copy of the real
    logo. A DEVOXX wordmark is lit the way the conference's opening video lights it: white-hot
    strokes, with the D and XX filled by a seeded gold pixel mosaic. The O is Voxxy's orange lens,
    with her ears on top. Under it: Antwerp at night over the Scheldt (the cathedral spire, the
    Boerentoren, the MAS, Het Steen, and cranes to the north where Kinepolis is), with gold dust
    drifting up. A canvas shadow blur drew a rectangle behind every letter on the software GL we
    render with, so the glow is a CSS drop-shadow on the canvas.
  - *Key mashing.* For 1.5 s after the gate, and for any auto-repeat, keys do not skip the opening.
  - *Opening score, second pass.* "More captivating, rhythmic, percussions, on par with the
    scenes. Crates open: boom." The tempo is now the scene's: one bar is exactly one robot's
    `SLOT` (2.9 s, about 82.8 bpm), and the score starts on the first slot. The kit arrives with
    the robots: a heartbeat under a ticking hat for Voxxy, backbeat and shaker for Droid, then
    four on the floor, a sixteenth-note arpeggio and snare fills for Biggy, and a bell over the
    pull-back. A new `snare` voice. The boom is a cue, not a note (`crate`: a sub drop, a plywood
    slap and dust), fired when each front actually lands, so it is always on its frame. It is
    scaled by crate size.
  - *Clue digits.* "Both show 5 but one is a 4." The sim's first intro frame carries a different
    draw of digits from the chapter that is actually played. The 3D clue objects were keyed by slot
    and built on that frame, so they kept the stale digit. They now swap their digit when the
    sim's changes. The pooled light is kept, because the light pool has already taken it. Probed
    headless: `6785` on frame 0, `7576` from frame 1.
  - *Mirrored digit.* A solid digit spinning a full turn reads mirrored from behind, and a
    mirrored 5 looks like a 2 (the same screenshot). It now faces the camera and sways ±35°, which
    shows its depth without turning its back.
  - *Controls, again.* "Sometimes it loses the frontal view, and I didn't change it. Usually when
    moving and rotating?" Root cause: WASD was camera-relative, so the camera could only follow a
    robot heading within about 55° of the view; otherwise it would chase its own stick into
    circles. D while walking pushed the robot out of that cone, and the camera stopped. The stick
    now steers the robot's own heading: W and S move along it, A and D turn it (in place when
    standing, steering while moving). Only the first W from standing takes the camera's direction.
    With the stick independent of the camera, the camera always settles behind. `ThirdPersonCamera
    .stick` is gone.
  - *Camera at chapter start.* A new chapter, or the end of a cutscene, cuts the camera behind the
    selected robot. The opening's own hand-off is left alone.
  - *Stairwells.* "From here I should see the stairs going up." The sim's `stair-foot` wall was
    drawn as a 3.6 m slab across the shaft. It is now the flight the 2.5D build draws (the shared
    `stairFlight`): two ramps climbing east with a level half-landing between them, up into a slab
    of the floor above. Shaft walls go to the roof. Each doorway (one in each long face, per the
    plan) has a lintel, a pair of leaves open square to the wall, and a green exit plate.
  - *Sign in the wall.* The TECHNICAL sign stood 0.24 m off a wall thicker than that. A sign whose
    footprint is within 22 px of a wall now becomes a blade sign, square to the wall and clear of it.
  - *Backlog from this batch (not done):* the breaker panel is a flat slab with three blocks and
    needs a real distribution board and a lever animation. Droid's chapter 1 lever: the arm should
    reach the lever, and the door should start opening only after the lever is pulled. The router
    cabinet should get noise and blinking lights as the modem starts up. Chapter 2 needs a general
    polish pass (Michele offers venue photos). Moving the spray tag onto the route to the cabinet
    is waiting on him to confirm which wall.
- *Third batch, 28 Sep.*
  - *Wordmark.* Michele sent the official Devoxx lettering ("use this lettering for the white
    part. The pointed ears should better be a robot's head"). The strokes are now thin and even,
    with a round-cornered D and a wide O, full-width E arms, and the second X overlapping the
    first. The O is a robot's head: ear pads, an antenna with an orange tip, and the lens. The
    mosaic cells shrank to suit the thinner strokes.
  - *Cabinet.* "It could contain a rack and a big screen", "an old 56k modem would be
    appreciated", "some noise and light in the cabinet, to indicate the modem starting up." The
    carcass is hollow now. Behind the leaves are a 19-inch rack of randomly blinking link lights, one
    big screen, and a beige 56K modem on a shelf with its eight front lamps (MR/TR steady, SD/RD
    chattering, CD on once online). The screen carries both of the sim's terminals, router status
    and password prompt, which used to be two separate screens ("doesn't work split on 2"). A new
    `modem-boot` cue plays after the supply lands: relay clack, fan spin-up, self-test chirps and a
    dial tone. The existing 56k handshake stays the payoff when the password goes in. Not checked
    in a render: the debug handle cannot power the sim, so this needs a playtest.
  - *Cable rack.* "Should be more evident and hint at interaction." A reel of blue cable stands in
    front of the rack, with a pulsing ring in Voxxy's orange and a "CABLE · VOXXY" tag. All three
    go away once the cable is picked up.
  - *Flavour toasts.* "We should distinguish between game-related toast and informational": room E
    and B orange, room D grey, and "column, actions... everything not related to progressing the
    game" grey. `Toast` and `Wall` gained `flavour`. Every venue wall is flavour except the few that
    are part of a puzzle (the kiosk hatch, the patch rack, the router cabinet, the roller door).
    So are chapter walls that only describe (closed cinemas, seat rows, open leaves, gate posts),
    and every action line: party tricks, climbing, gripping or pushing Biggy. The HUD draws flavour
    lines grey; everything else keeps its robot's colour.
  - *Chapter 2 start.* "Place the robots with the stairs at their back, like they just finished
    descending. Voxxy first, near the doors." They face west on the landing, Voxxy by the doors and
    Biggy still at the foot of the flight. One test bound moved with it: the spray tag must be
    within 540 px of the start, not 500, because Voxxy's mark is 56 px further west. The walk is
    the same. Flagged to Michele.
  - *Stairwell door leaves.* "It's in the way." The leaves stood square to the wall 1.2 m out into
    the path. They now fold flat against the wall, both on the east side of the opening, because
    west of it there is only 0.6 m of wall before the shaft's corner.
- *Fourth batch, 28 Sep, from Michele's full chapter 2 run.*
  - *Cable.* "At a certain point the cable vanished, while crossing the stairs." The tube ran at 0
    or 0.5 m, so inside the small staircase it was under the treads. It is now resampled every
    ~0.25 m and follows each tread at the height `stepsFor` draws it.
    "When reaching the dropzone, cable should be automatically attached (animation would be
    welcome) without pressing E." The sim plugs in when Voxxy is within reach; E still works. The
    printer socket becomes the run's last point, and in 3D that last stretch grows up the desk into
    the printer over 0.7 s.
  - *Printer.* The desk stands on the 0.5 m lobby, so its top is at 1.55 m, and the old printer box
    at 1.05 m sat inside the counter. It is now a card printer on the desk top: an LCD reading NO
    LINK / LINK UP / PRINTING, a hopper of blank cards, and badges (orange DEVOXX stripe,
    ATTENDEE) sliding out of the slot every 1.1 s onto a stack once it is online.
  - *Stairwells.* The walls are black moquette ("stairs wall might be black moquette"). The start
    moved Voxxy three steps back from the west wall, so her lamp no longer paints a halo on it.
  - *Sign, again.* "Still in the wall." The blade guessed the wall's face. A sign near a wall is now
    mounted flat on the sim wall rect's own face, 3 cm proud, with no post.
  - *Spray tag.* Michele chose the wall: "Legacy Systems' West wall". `WIFI_TAG` gained a facing
    (`nx, ny`), and chapter 2's prop rect, the 2.5D painter and the 3D painter all orient from it.
    The paint narrows from 88 to 64 px to fit a 70 px booth side. Voxxy's line now says where it
    is. The tests that pinned the old wall (placement, reading, the bar-overlap check) now derive
    from the facing instead of the old north wall.
  - *R during the password.* "I was typing the password and the chapter restarted... I think that
    was the R in DevoxxForever, that maybe I retyped. Keep a tolerance on keypress here too." The
    password ends in R, and the last letter closes the prompt, so one R too many was a restart. For
    2 s after any keystroke typed into a prompt, R is swallowed. A new test types the password,
    presses R at once (no restart), then again after 2.2 s (restart).
  - *Not done yet:* the booth stands ("unfinished, it should be clear when you're passing under
    them") and a rock intro score ("rock guitar, stomping, energy").
- *Intro, third score, and a clip.* "Music is still too ambient for the intro. I want something
  impacting. Rock guitar, stomping, energy!" Rewritten as rock at the same scene-locked tempo (one
  bar per robot, 82.8 bpm, which is also the tempo stomp-stomp-clap is always played at). Stomp,
  stomp, CLAP from the first crate. A distorted guitar: five detuned saws for root, fifth and
  octave, through a tanh waveshaper and a cabinet's worth of filtering. It starts as palm-muted
  eighths and opens into power chords on the pushes when Biggy's crate lands, with bass, crash,
  snare and hats joining a robot at a time. New voices: `guitar`, `chug`, `clap`, `crash`. The
  crate boom now has a crash cymbal on it.
  "How long is the starting sequence? Can you extract it in a movie?" It runs 12.4 s: 1.6 s dark,
  two 2.9 s slots, Biggy's 2.4 s, a 0.8 s hold, the 1.05 s flicker and 0.75 s dark. The clip is
  rendered headless and deterministic: the page's AudioContext is swapped for an
  OfflineAudioContext that pauses at every video frame. At each pause the game steps one frame
  (firing the score and the cues at exactly that sim time) and a screenshot is taken. The frames
  and the rendered audio are then muxed with ffmpeg. The picture and the synthesised sound are in
  sync without anything playing in real time.
- *Fifth batch, 28 Sep.*
  - *Music reference.* Michele pointed at the official Devoxx 2026 video ("the music near the end
    is a good fit"). YouTube is blocked from the build container, and the agent cannot hear audio
    anyway, so it asked for a description instead of guessing.
  - *Printer sounds.* "Add a sound when the printer is connected, and when it prints a badge." A
    `plug` cue (latch click and a two-note ready chirp) plays when the cable goes in. A `badge` cue
    (thermal head whirr, the card sliding out and landing) plays six times, 1.1 s apart, in step
    with the six badges the 3D printer ejects.
  - *Lamps in a lit hall.* "After the lights are back, reduce the robots' light." Once the hall is
    powered, the lamps and their spill ease to a quarter of their blackout strength. This is
    render only: the sim's cones, which decide what a lamp can light, are unchanged.
  - *The soup pot.* "Grab that thing!" The sim carries it at Biggy's north edge, where his dome has
    already curved away, so it floated beside his head. In 3D it now sits centred on his lid, on
    the rig's own position, so it rides with him.
  - *Cable reel.* "Should not disappear when Voxxy takes it (but roll)." The reel stays and turns
    with every metre paid out, and its coil thins toward empty.
- *Sixth batch, 28 Sep: stands, breakers, the lever, chapter 2 polish.*
  - *Stands.* "Stands are unfinished, it should be clear when you're passing under them." Built
    booths were their footprint extruded in concrete to the 7.2 m roof. They are now 2.6 m sponsor
    pods printed on every side in the 2.5D build's `BOOTH_SCHEMES` (name, strapline, DEVOXX
    BELGIUM), with a header strip that lights with the hall. The face carrying the spray tag is
    left bare. Half tables were a solid 1.05 m box that 1.15 m Voxxy drove through. They are now
    1.3 m tables on legs, with a cloth valance, a laptop and a sticker bowl, open underneath. While
    the robot being driven is under one, its top fades to 15% and a steel rim stays solid, so the
    table still reads.
  - *The lever.* "The arm should reach the lever, the door should start opening only after the
    lever is pulled." Sim: cinema B's leaf waits `LEVER_REACH_TIME` (0.75 s) after the panel is
    thrown; two door tests now wait for it too. 3D: during a reach, Droid turns to the target and
    his shoulder pitches to its height. The panel's lever throws on contact over 0.2 s.
  - *Breaker board.* Was a rusty slab with three blocks, floating 0.64 m off the wall. It is now a
    grey distribution board on the wall: door swung open with a 400 V warning, three rows of DIN
    breakers, conduits to the ceiling, and three red main isolators. Each is thrown up through the
    front as Droid's hand arrives, flashing as it lands, and his reach is aimed at that handle.
  - *Chapter 2 survey.* Rendered five viewpoints of the lit hall. The reception now has a lit
    orange REGISTRATION banner hung over the desk, so the cable run's goal reads from the hall. The
    technical room has its own fluorescent batten, which strikes and flickers on when the supply
    lands.

## 26 Sep 2026 — the crowd he photographed, the wall on the stairs, and a gate that is now a gate

Four screenshots came back from his replay, one line each, and every one of them was
a bug report with a picture attached. The agent's job this session was to find what
each picture was actually showing, which in three cases out of four was not what the
line said.

**"Some seem to walk backward or have the backpack on front."** They did — all sixty
of them. `Visitor extends Bot`, `mkBot` sets `face` to 0, and `stepVisitor` never
touched it again, so the whole crowd pointed due east however it walked. Invisible
while the crowd were pawns; visible the frame the renderer gave a person a front, a
back and a rucksack. One line of sim, and a test that reads 9 of 40 facing their
travel with the line removed and 40 of 40 with it in.

**"The small stair between reception and main hall seem to block them."** It is not
the stair: the crossing carries no walls at all, measured. Three faults behind that
one picture, and the third is the interesting one.

- Nothing depenetrated the crowd from itself — two visitors stood at exactly
  (945, 453), one body drawn twice. A pair parts now, half the overlap, moving only
  the body whose step it is, so the wall push-out can still catch it. The first
  version moved both and walked people **through** the stair wall under crowd
  pressure: measured, one at y 594, twenty px past the steps' own edge.
- A visitor who had sidestepped off the lane grid clipped the end-of-row booth
  beside the stairwell and crawled its face. Grazing drops the leg being walked now —
  but only after half a second of touching without gaining ground, because threading
  a door bay grazes a leaf too, and dropping on first touch stranded eight of sixty
  inside the doorway.
- And the one nobody would have guessed: a visitor who ran out of route east of the
  hall was handed a **hall** lane node, so they walked west into `GF.gate` — Stephan's
  barrier — and stood on its east face. Ten of sixty in a 10 px-spaced line at
  x 1428, at a full walking speed on the clock, for a hundred seconds. `speed` said
  they were walking briskly, which is why the durable test measures **ground covered**
  instead: the crowd's own floor is 240 px over forty seconds, against the crawlers'
  nothing.

**"Stairs are great, but there's a wall!"** — and there was: a 15.7 m slab 1.55 m
tall with nine posts on its face. It already opened at the end of chapter 3; what was
wrong was that it read as the edge of the building rather than as something one man
unhooks. `barrierRun` builds what stands at the foot of a staircase on a conference
morning — 2 m barriers hooked together, waist high, feet on the floor, rails you can
see the treads through — and chapter 3's prop is posed out of the same kit, so the
thing that opens is the thing that was standing there.

**"The printer in particular, it should be clear it's the objective of a task."** The
recognisable printer — hopper, feed slot, screen, lamp, lanyard spool — has existed
since his earlier *"printer should be recognizable"*, and it was only ever chapter 2's
prop. Every other chapter drew a white slab. It is the same model everywhere now, and
it turned out to be **floating**: `printer.ts` guessed a 1.02 m counter while the desk
is a `low` wall the renderer draws at 0.78, so the machine hovered 24 cm over its own
desk. Two modules with a number for the same surface, only one of them drawing it.

**"Increase the queue but just the minimun needed."** One person per queue. The front
rank stands two abreast 11 px either side of the centre line, where each body blocks
Biggy's centre within 15 px, and the pair covers a 44 px doorway with 4 px to spare at
each jamb. Measured on the beer test's own fill, from where Biggy actually stands:
136 px from the soup with the queues standing and not one reachable cell inside the
court, 24 px once Voxxy clears the queue, against a `POT_REACH` of 70. `beer-bar.test.ts`
asserts that now instead of carrying a comment explaining why it could not. The scan
line it used to measure went with it — three pixels outside the wall is open floor in
both states, which is why it read 11 px through the leaking gate and 7 through the
sealed one.

**The fresh-clone check** he asked for: cloned from the remote into an empty
directory, `corepack enable`, `pnpm install` (1.4 s on a warm store), `pnpm test`
**712 passing in 45 files**, `pnpm build` clean, `pnpm dev` serves, and all four
chapters run from the built bundle with `ERRORS:0`. One finding: `.git` is **83 MB**
because `tools/progress/shots` (53 MB) is in history. The working tree without it is
4 MB. Pruning is still his call.

Human decisions this session: the four screenshot findings above, *"increase the queue
but just the minimun needed"*, *"a temporary barrier is fine"*, and *"do the check"*.
Rejected: nothing of his; the agent threw away two of its own fixes (moving both bodies
in the depenetration, dropping a route leg on first contact) after measuring what they
did to the crowd.

## 26 Sep 2026, later — the physics view, and 53 MB of screenshots

**`P`, the physics view.** Michele: *"Add the physics view."* The point of it is
scoring: physics realism is twenty of the hundred points and every bit of it was
invisible, because a judge watching the game sees robots moving, not a seven-to-one
mass ratio. It draws each robot's collision circle at its own frozen radius, its
velocity as an arrow scaled against that robot's own top speed, and every contact
of the frame as a splash on the contact normal sized by the impulse — with the
numbers beside it, including the restitution constants that make Biggy bounce off a
wall where the other two do not.

The agent's one real decision here was **not to derive anything in drawing code**.
The circles and arrows are already on the snapshot (`Bot.r`, `Bot.vx/vy`), but the
impulse is not — and re-deriving it in the renderer would have been the fault this
repo keeps catching itself in, with the added sting that the readout would drift
from the solver it claims to be showing, which is worthless for the points it
exists for. So the solver publishes what it applied: `src/sim/contacts.ts`,
written by the three places that resolve a contact, cleared by `game.update` at the
top of every frame. It is telemetry and nothing reads it back, and
`tests/contacts.test.ts` plays the same seed twice — once with the log being read,
once without — to prove the game does not change because somebody pressed `P`.

Two things the measurement corrected on the way:

- the overlay first went into `renderTopDown` rather than the play camera, because
  the two render paths share the same two lines above the insertion point. A probe
  that read the geometry's draw range found 4096 zeroes where the rings should be.
- the first test counted vertices by scanning the buffer for non-zeroes, which
  *passed* for the wrong reason: the buffer is preallocated and never cleared, so a
  splash that had expired was still sitting in it. `drawRange` is what the GPU is
  told to read and is therefore what a test about drawing should ask.

**The shots.** *"Yes prune the shots."* `tools/progress/shots` was 53 MB of 285
PNGs and `pieces.json` references ten of them; the rest are gone and the page
regenerates unchanged. The working tree is 4 MB now. The agent did **not** rewrite
history to get them out of `.git` (still 83 MB): that is a force-push of every
branch on a public submission repo four days from the deadline, which is a human's
call to make and not a builder's, and it is the one thing in this session that was
deliberately left undone.

## 26 Sep 2026 — bodies cast shadows, and the rig that proves it (chapter 5)

**Human decision.** Michele, on the two darkness puzzles the agent had proposed: *"A puzzle needing
darkness, with biggy obstucting a lamp is fine, but where would you place it?"* and then *"Can you
make a poc / demonstration for the two no light games?"*

**What the agent did.**

- Taught `src/sim/lights.ts` to occlude on **bodies** as well as walls: `rayCircle` clips each ray of
  a visibility fan against a list of circles, so a robot standing in a beam casts a real umbra. It is
  **opt-in per cast** — `buildLights(bots, walls, mirrors)` still means exactly what it meant, because
  chapters 1 and 2 were measured and playtested against light that only walls could stop.
- Built the rig as **chapter 5**, reachable only from `?chapter=5` and deliberately outside
  `CHAPTER_COUNT`, so Skip chapter and the end of chapter 4 can never land on it.
- **Station A — the photocell pair.** Two cells and a sign in a row, 70 px out from the work lamp
  (Droid, parked on a pad). Both cells dark, sign still lit. One body cannot do it: a disc that
  touches both outer rays from that distance also covers the middle one. It takes two, and each has
  to stand back far enough that its shadow is a stripe rather than a curtain.
- **Station B — the wide sensor bar.** 80 px of sensor, all of it dark at once. A body of radius `r`
  at distance `d` shadows a half-angle `asin(r/d)`, and `d` can never be less than the two radii
  added together — so every robot has a *widest possible shadow*. Voxxy's tops out 6.5 px short of
  the bar's end from anywhere in the building; Biggy's clears it, pressed against the lamp. That is
  Michele's "Biggy obstructing a lamp", made arithmetic.

**Answer to "where would you place it?"** — the closed cinema section's own corridor, chapter 1's
ground and the only part of the building that is dark by architecture rather than by the hour. No new
venue, no new floor, no new kind of light source.

**What was tried and rejected.**

- *A static "work lamp" light source.* `LightSource.owner` is a `RobotKind`, and widening it ripples
  through the renderer and the clue-colour code. Parking Droid on a marked pad gives the same fixed
  geometry for nothing.
- *Colour-blind photocells.* Voxxy and Biggy carry headlights that point where they last moved, so a
  cell that counted any colour would be lit by the very robot sent to shade it. The cells read the
  work lamp's green, which is also just what a photocell is.
- *Clipping rays against bodies and stopping there.* This is the bug worth writing down. A pool is 72
  rays over the full circle — 5° apart — and a robot 11 px from the lamp subtends 50° of it, so the
  polygon had one vertex at 6 px next to one at 95 px and the straight EDGE between them swept 8 px
  of floor at the far end, cutting out a whole sector of LIT floor. Measured, not guessed: Voxxy
  parked on the axis darkened all 17 of station B's samples, including ones 44° off an axis her 25°
  shadow cannot reach — the sweep caught it as a false solve. The fix is a vertex PAIR at each umbra
  edge (`POLY_EXTRA`), which also meant growing the renderer's fan buffers, since a truncated polygon
  is not drawn wrong, it is drawn closed across the room.

**Tests.** `tests/dark-rig.test.ts` (10) sweeps the corridor rather than asserting one pose: station B
is proved impossible for Voxxy from ~900 positions, station A impossible for one body from ~1,600,
and both are proved possible from the poses the notes claim. Suite 736 green.

## 26 Sep 2026 — the cheap extras, 5 · 6 · 7

**Human decision.** Michele, of the seven small additions the agent had listed: *"The cheap gain are
ok"* and *"Let's try 5 6 7 too."*

- **5 · the rubber duck listens.** `E` at the Rubber Duck Inc stand: the robot says the problem out
  loud, the duck says nothing, and the robot "works it out" — the answer being the chapter's own
  hint for whatever is still open, picked for the robot standing there so it is never a hint about
  somebody else's job. It reads `tasks()`, so it can never drift from what `H` would have said. It
  only listens while the duck is still ON its stand: once shoved down the lane it is a puck, which
  also keeps its `keySpots` circle fixed so the chapter's own beats can be kept out of it.
- **6 · lanyard colours mean something.** `src/sim/lanyards.ts`: crew red, speaker teal, attendee
  grey-blue, chair orange, on `Person.lanyard` and painted by the renderer. It is a fact about a
  person and not a render flourish, which is why it lives in the sim — the reason you can pick the
  keynote speaker out of three thousand people is the ribbon round their neck, and chapter 3's middle
  act is doing exactly that. The speaker hint now says so.
- **7 · "GC pause" when Biggy stops.** `src/sim/quips.ts`, ticked by `game.ts` after the chapter, so
  it is true in all four rather than being one chapter's joke. It needs a real run-up (1.2 s above
  55% of his top speed) and fires **once a chapter**, and it waits for a clear screen: the first cut
  of the test ran him down the exhibition hall, he hit a sponsor table, and the toast explaining
  what he walked into is not a screen a joke may talk over. That became the rule and the test.

**Still open from the same list:** 1 (colour legend as an in-world AV rider), 2 (wrong-name badge
from the printer), 3 (the CFP rejection wall under Voxxy's beam). 4 (speaker in the wrong room) is
**withdrawn** — Michele: *"the speaker is the keynote? Rooms are on a separate floor."* He is right
on both counts: chapter 3's speaker IS the keynote speaker, and rooms 4 and 8 are on floor 1 while
the hall is on the ground floor, so the gag as written could not happen. If it comes back it will be
a TRACK speaker in chapter 4's floor-1 corridor, outside the wrong door — which is a different joke.

**Tests.** `tests/extras.test.ts` (6): the ribbons are four distinct colours and everybody in the
hall wears one with Stephan the only chair; the duck answers at its stand and refuses once shoved;
the GC pause fires after a run and never twice in a chapter. Suite 742 green.

## 26 Sep 2026 — the cheap extras, 1 · 2 · 3

**Human decision.** Michele: *"The cheap gain are ok."*

- **1 · the colour legend, as an in-world AV rider.** A laminated sheet taped to the closed
  corridor's north wall, a few strides east of the opening marks: *"house rig: Voxxy orange spot ·
  Droid green wash · Biggy blue flood. A mark lights when every colour it is written for is on it at
  the same time."* Any robot walking past reads it, once — it is a legend, not a puzzle, and it is in
  chapter 1 because that is the chapter that teaches the mix. An AV rider is the document a touring
  show sends the venue, so the legend is something the building would really have.
- **2 · the wrong-name badge.** The first thing a badge printer does when it comes up is print one
  test badge, and the first thing it gets wrong is a name: `VOXY`, one X. It lands `BADGE_WARMUP`
  seconds after the printer comes online, and that delay is load-bearing — without it the joke
  replaces "cable in — the run is made", which is the line that tells the player the job worked. When
  the store and the printer finish on the same frame, the curtain line carries the badge instead.
- **3 · the CFP rejection wall.** Six rejected talk slips pinned up past cinema D's door, readable
  only under **Voxxy's cone** inside 70 px and with her skirt filtered out — the same rule chapter
  2's spray tag is read under, so the beam is doing the reading rather than the standing. One slip
  every 3.5 s, cycling. They are jokes about the shape of a programme, never about a real talk or a
  real person.

**Tests.** `tests/extras.test.ts` is now 9: the rider's toast names all three colours, Biggy's flood
on the CFP wall gets nothing while Voxxy's cone gets a slip, and the badge is measured by playing
chapter 2's chain to the printer and then checking that "Cable in" survived and `VOXY` arrived after
it. Suite 745 green.

## 27 Sep 2026 — «Nastri»: the stair barrier, and the wall it was guarding

**Human decision, twice in one day.** Michele, looking at the shut barrier in chapter 3:
*"Stephan is powerful, but i don't think he can remove a wall. I'd use something simpler, like
«Nastri»"*. The agent drew him a diagram of what the barrier then did (a 15.76 m run of steel with
a 3.52 m gate hung in the middle, of which only the gate moved), and he ruled: *"Nastri is fine. We
could also have some kind of scene/effect where stephan pull one spot and the 8 nastri retract one
by one."* Eight is his number, and the implementation uses it: **nine posts, eight belts**.

**What the agent built.** `src/sim/nastri.ts` — post positions, belt spans, release order and each
belt's own retraction, all in the sim, because the belts are *colliders* as well as a picture and
`src/render` may read `src/sim` but never the reverse. `gateDraw` in `src/render/doors.ts` is now a
thin read of it; the swing, the hinge and `GATE_MOUTH` are gone. Stephan takes the clip in front of
him (`pullT = 0.5`, which is where he stands) and the release ranks by distance from his hand, so
the wave alternates outward — 3, 4, 2, 5, 1, 6, 0, 7 — and no two belts let go on the same frame.
Each belt winds into the post *farther* from him, so the gap opens at his end and grows away.
`ch3-breakfast.ts` pushes nine post walls and eight belt walls when he opens up and drops each belt
wall on the frame `beltUp` turns false; the renderer stops drawing it on that same frame, off the
same number.

**What it cost, and what it found.**

- **The stair's shell still opened SOUTH.** `shellOf` opens the south face of whatever it is given,
  which was right while the main staircase ran north–south. The flight took a quarter turn on
  25 Sep and `GF.gate` turned with it to the east face — the foot — and the shell did not. So the
  foot of the flight was walled along its whole length and the open face was the south cheek, three
  metres up: **Stephan's barrier was guarding a wall**, and the exit cutscene walked three robots
  through a balustrade. Found by a new test asking whether Biggy fits between two posts, which is
  the question the nastri made worth asking. Fixed in `groundWalls()`; 753 tests green after it.
- **A one-frame pop in every door in the game.** `openness()` treated "clock at zero and state
  open" as fully open. The frame `done()` fires is exactly that, so the barrier was drawn fully
  retracted for one frame with all eight belts still walls in the sim. "No clock" now means
  `progress === undefined`, which is what the sentence always meant.
- **The crowd-barrier kit is gone** from `venue/props.ts` (`barrierPanelGeometry`, `barrierRun`) and
  a belt-post kit replaces it: a weighted disc, a chrome column, a cassette head, and 7 cm of
  webbing in Devoxx orange. The two colours live in the palette so the chapter's prop and the
  venue's static line cannot drift apart when they swap places at a chapter boundary. Post chrome is
  `metalness: 0.5` on purpose — real chrome at 0.9 is black in a room with no environment map, and
  every room in this game is that room.

**Tests.** `tests/nastri.test.ts`, six: the line is nine posts and eight belts and all of it is
inside `GF.gate`; the release runs outward from Stephan one belt at a time; every belt finishes by
the end of the wave and no two land together; **through the whole wave, frame by frame, a belt is
drawn if and only if the sim has a wall under it**; the widest robot fits through every gap; and the
exit cutscene walks the three of them out *between* the posts — measured on the robots' own
positions, because a cutscene ignores walls and no collider test can catch that. Suite 753 green.

**Rejected.** Keeping the posts out of the collider list so the flight would be one clean opening.
It would have made the gaps a lie: a chrome post is a thing you steer around, and the cutscene
would have been free to walk through one. The lanes moved instead — nine posts across a 15.76 m
line puts a post exactly on the centre, and the old middle lane walked Droid straight through it.

## 28 Sep 2026 — the day's second round: the roll, the soup, the bar and the rig

**What he asked for.** Fourteen playtest notes in one sitting. Seven went into the previous commit
(the crowd, the badge desk, Stephan's clothes, the keynote speaker, the soup's drop mark); this is
the rest, plus two from the same pass that had been carried — the cake and a flicker by room 7.

**What the agent did.**

- **Biggy rolls when he runs.** `src/render/robots/gait.ts`. The roll existed and was gated on
  `worldMoved` — somebody else pushing him. Michele had asked four times why he could not make it
  happen and the fourth time said how: *"I tried running."* The gate is SPEED now (`st.roll` is a
  smoothstep on it, and the walk is switched off at the source — `moving` and `amp` both scale by
  `1 - roll`), and `shoved` only chooses the window: 1.5–3 m/s for a shove, 2.2–3.4 m/s for a run
  under his own power, nothing at all with the soup pot in his hands (`GaitParams.carrying`, read
  off the published `pot` prop rather than a new sim flag — the pot is only published while
  somebody is carrying it, so it already IS the flag).
- **The soup is drawn.** `drawLadle`, `drawPot`, `drawSpill` in `src/render/scene.ts`, and stains in
  `src/sim/chapters/ch3-breakfast.ts`. The sim keeps the puddles because they are facts about the
  run — where the body was, how much came out — and the list is bounded at fourteen.
- **The bar pays off.** One clock in the chapter (`beerAt`) drives everything: `pour` 0→1 across
  3.4 s after a 0.7 s beat, published on each tap's `v`; the glassware fills off the same number;
  Biggy's flourish is set directly rather than through `partyTrick`, because the toast is the
  chapter's and not the player's — it does not check the stick, the rest timer or Droid's feet, and
  it does not speak his `E` line. Three kegs stand inside the `bar-counter` rect, which is a `low`
  wall, so nothing can walk where they are and they need no collider.
- **The shadow rig says where to stand.** Two painted lanes from each lamp pad to its sensors, red
  cells while lit, and a sensor bar that lights from its own supply.

**What it cost, and what it found.**

- **The drive threshold could not come off `DEFS.biggy.max`.** The first cut used 2.6–3.8 m/s,
  reasoning from his 4.7 m/s top speed. A headless probe then drove him flat out across the
  exhibition hall: he reaches the far wall at **2.88 m/s**. Rooms are shorter than top speeds, so
  the window is 2.2–3.4 and the number is in the comment beside it.
- **The ladle was the walk-through prop chapter 3 carried.** `KNOWN_WALKTHROUGH[3]` had listed
  `ladle` since the sweep was written: the renderer drew it as a 0.9 m slab standing on the floor
  under the shelf, with no collider, because nobody had ever drawn the shelf. Putting the ladle ON
  the 1.35 m shelf took it off both lists, and the sweep's own "this list cannot go stale"
  assertion is what forced the edit.
- **The pot disappeared behind the robot carrying it.** First cut put it in front along his
  heading, which is correct and invisible: this camera is fixed on the +z side, so a robot walking
  north carries the pot behind his own lid. It is biased half a heading plus one camera-ward unit
  now — in front when he walks at you, round to the near side when he walks away.
- **Headless probes of chapter 3 run at about one frame a second.** Sixty visitors in swiftshader,
  and the game's clock is the rAF loop, so a probe that sleeps for the pour measures nothing. The
  beer probe polls the STATE instead of the clock. (Chrome also stops producing frames when the page
  is static, so a probe that waits on a still scene waits for ever — the robot has to be moving, or
  the sim is not running at all.)

**Tests.** `tests/soup.test.ts` (4, new): the ladle prop is the shelf rect and empties when Droid
takes it; the pot is published at the carrier's own centre and follows him; a splash leaves a puddle
where the body was, and six ruined pots stay under the bound. `tests/beer-bar.test.ts` (+4): the
taps are shut until the delivery is finished, all three run on one clock, Biggy raises one glass
once and puts it down, and every keg is inside the counter's rect. `tests/shove-roll.test.ts` (+3):
a manoeuvre walks, a run tucks (thigh past -1.3 rad, pelvis turning through whole revolutions), and
the pot forbids both. `tests/dark-rig.test.ts` (+2): each station paints a lane from its pad to its
own sensors, and a lit cell is red. `tests/colliders.test.ts`, `tests/prop-geometry.ts`: four new
kinds classified (`spill`, `keg`, `toast`, and the ladle's new band). Suite **769 green**.

**Rejected.** Hanging a `sign` prop over each station of the shadow rig to name it. A chapter's
`sign` is a blue panel and nothing paints text on one — only the venue's own `SignPainter` does — so
two more would have been two blank boards over a rig that was already hard to read. The lanes and
the red cells carry it instead.

## 28 Sep 2026, V46 round — the feet, the speaker, the cake and the spotlights

**What he asked for.** Four notes on V46, one of them reversing a decision from the build before it.

**What the agent did.**

- **Biggy's feet go away, and the roll goes back to shoves.** `src/render/robots/gait.ts`. Two
  changes in one line of feedback: *"Biggy should retreat his feet while rolling. And maybe it's
  better to reserve it for when he's pushed to high speed."* The tuck folded the legs, which puts
  the knees inside the gut and the boots outside it; `tuckLegs` now SCALES each thigh (and with it
  the shin and the boot hanging off it) to a fifth of its length, so the leg ends up entirely inside
  a 1.2 m ball. It is written every frame, including at zero and including while a party trick
  plays, because a pose made of scale is the one kind that cannot survive a frame that forgets it.
  The gate went back to `shoved && speed`: `DRIVE_ROLL_*` is deleted.
- **The speaker is handed to Stephan.** `ch3-breakfast.ts`: the stage rect is gone, `speakerSpot` is
  a mark beside the soup's, `speaker.onStage` is `speaker.withStephan`, and a 38 px handover lets
  Stephan claim them without anybody threading a box.
- **The cake is a trolley, not a billiard ball.** `ch4-keynote.ts`: `CAKE_STEER` (0.7) blends the
  push direction from the contact normal towards Biggy's own stick, and `CAKE_SCRUB` (10 s^-1)
  decays the component of the board's velocity across the push while he is pushing. Both are what a
  wheeled board does and neither is what two discs do.
- **The spotlights do something.** `src/render/scene.ts`: each is a floor can on a base, aimed at the
  stage prop the chapter publishes, with an additive beam and a warm pool when the sim says it is
  lit and a standby glow on the one that is next. No `THREE.Light` — this renderer has never had
  one, and four shadow-casting spots would cost the frame.
- **The beer crates are crates.** A case with a lip, a pale band, and twelve caps in one instanced
  draw per crate — ninety cylinders across a full stack, which is no place for ninety draw calls.

**What it cost, and what it found.**

- **A shared material painted six crates the same colour.** The first cut gave every crate one
  `MeshStandardMaterial`, and the six of them are in four different states at once (loose, carried,
  the one that will throw the heap error, stacked): whichever was drawn last won. Each pooled crate
  owns its case material now, the way each pooled person owns a collar.
- **Two marks 4 px apart broke a test that was measuring loosely.** `beer-bar.test.ts` counted the
  ring round the soup's mark by taking every unlabelled `dropzone` within 8 px of it, which is fine
  with one mark in the area and answers 7 with two. The gap is 12 px now AND the test matches each
  ring to the rect it belongs to, so the chapter can put three marks at a man's feet if it wants to.
- **The cake's numbers were tuned against a measurement, not an opinion.** 0.45/6 left a 6 px
  off-centre push 18 px off line over 3 s; 0.7/10 brings it under 14 while a corner shove still
  turns the board by more than 3 px, which is the test that stops the fix from welding it to an axis.

**Tests.** `tests/cake-push.test.ts` (4, new): straight east–west from dead behind and from 6 px off
either side, straight north up the aisle, and a corner shove that still steers. `tests/shove-roll.
test.ts`: the drive-roll block is replaced by four that assert the pose — a self-driven sprint at
4.3 m/s stays a walk, a shove balls him up AND scales the legs to under a third, the legs come back
when the roll ends, and the soup pot forbids the whole thing. `tests/chapters.test.ts`, `pilot.ts`,
`speaker-spot.test.ts`: the speaker's destination is Stephan's own mark, asserted by distance to the
man rather than by a rect. Suite **774 green**.

**Rejected.** Making the spotlights real `THREE.Light`s. The whole lighting model in this game is
drawn geometry (`src/render/lighting.ts` draws the robots' lamps as meshes off the sim's visibility
polygons); four spots with shadow maps would have been the only real lights in the build, would not
have matched the room around them, and would have cost more than the entire rest of the frame.
- *Merging the 2.5D branch into the 3D one, 28 Sep.* Eighteen commits: the chapter 3 playtest
  round (crowd, desk, Stephan, the speaker going to Stephan, Celestino on the desk, the soup
  drawn and spilt, the bar's pour and toast), the belt-post stair line, Biggy's roll, lanyards,
  quips, the cheap extras, the physics view, the dark test rig, and chapter 4's opening video. Two
  conflicts, both resolved toward what each side meant: `clueLit` keeps the 3D build's tolerance
  parameter, and the chapter 3 gate is the 2.5D side's belt posts with the 3D side's flavour flag.
  Typecheck clean and 780 tests green before any 3D work.
  - *What 3D had to draw.* The chapter 3 gate is now the belt-post line from the same
    `nastriRun`: chrome posts, red webbing, each belt winding into its post in turn (`beltU`).
    Also new: soup spills as puddles, kegs behind the bar, the tap handle pulled and a thread of
    beer while it pours, and the glass Biggy raises (`toast`), lifted off his lid. Biggy's gait
    gets `carrying`, so he never rolls with the pot. People already wear what the sim gives them
    (Stephan's olive polo, Celestino's orange raglan, lanyards), because 3D uses the shared figure
    builder.
  - *The extras, and where they live.* Michele: "evaluate where to put them, chapter 1 has already
    some nice idea (posters, holograms), don't remove them. We can move the CFP wall to the hall
    maybe?" The AV rider (the light-mix rules) stays in chapter 1, the chapter that teaches them.
    In 3D it is drawn as a spec sheet with the three lamp colours and the rule, taped at robot eye
    height under Zaal A's panel (at 1.45 m it covered the panel), and its toast is flavour. The CFP
    wall's chapter 1 spot was exactly where the 3D build's animated ad hangs. Asked, Michele chose
    the hall near registration. It is now `CFP_WALL`, on the south face of the concrete wall
    between hall and lobby: a real wall 8 m from the desk, so it adds no collider to the cable run.
    It is read in chapter 2 under the same rule (Voxxy's cone, 5.6 m, a slip every 3.5 s) and its
    toasts are grey. Drawn as a framed corkboard of six stamped slips. The prop comes after the
    spray tag in chapter 2's list, because `find('poster')` means the tag everywhere else. Tests
    moved with it.
  - *Not done.* Stephan and Celestino are caricatured from photos Michele sent the 2.5D session;
    the 3D build has not seen them, and they are asked for again to make the pair recognisable at
    3D distance. `P` stays photo mode in 3D (it is the physics view in 2.5D).
  - *Stephan, up close.* Michele reposted the photographs: Stephan on stage, and the Devoxx
    Belgium polo. The shared figure draws him for the 2.5D camera, with glasses as a bar, the mic
    as a line and the collar as one band. At 3D distance a face shows, so `people3d.ts` adds a
    close-up layer on the figure the sim marks `stephan`, sized off its own head:
    - amber tortoiseshell rectangular frames with temples, eyes behind them;
    - short salt-and-pepper hair, fuller on top; grey stubble on the jaw; a grin;
    - a skin-coloured headset boom along his left cheek, as in the photo, and a light tan skin;
    - the polo as photographed: the collar tipped orange / grey / white / grey, orange piping
      inside the neck, three dark buttons, and DEVOXX embroidered in white on his left chest.
    The far-camera stand-ins hide while it shows. Celestino is still the 2.5D caricature, waiting
    on his photo.
  - *Celestino, and Stephan's hair.* From Michele's photo of Celestino: short dark hair, fair
    skin, clean-shaven, and the crew T-shirt, white with orange raglan sleeves, orange neck trim
    and the joke printed across the chest in orange ("Hey, Event Organizer / do Open Source / and
    save Big Money"). He is the NPC the sim names `Celestino`, so the close-up layer keys off the
    name. He keeps the crew-red lanyard, because ribbon colours mean something in the game. A
    pooled figure that stops being him gets its torso material back. "Can you do Stephan's hair?"
    It was a smooth cap. It is now a low grey cap with forty short seeded tufts over the crown,
    brushed up and forward, grey at the sides and darker on top as in the photo. The first
    attempt was too tall and punk; the second is short and tousled.
  - *"Stephan looks like he has a beanie with some stuff on top."* The agent agreed with the
    diagnosis: a cap is a hat, whatever its colour, because its edge circles the head at one
    height. Hair is now the head's own surface. Each close-up head is one sculpted sphere
    (`sculptHead`):
    - a hairline that is high at the forehead, recedes at the temples, is cropped over the ears
      and drops at the nape;
    - vertices above the hairline pushed out by a textured thickness and coloured as hair, with
      salt specks;
    - beard shadow painted onto the jaw;
    - a narrower, longer face with a nose.
    Every figure in 3D is also softened: rounded torso and limbs, a neck, and shoes. The 2.5D
    figure code is unchanged.
  - *Mario, Venkat, Josh.* Michele sent a photo of each: "Mario Fusco somewhere in the hall (the
    second photo is older, the hair are short now)", "and Venkat (no shoes!)", then "Josh Long".
    They are three talkable NPCs on the chapter 3 hall floor, first names only, each with one
    line in character. The spots were measured clear of every wall by 22 px and of every person
    by 45 px. The 3D close-ups:
    - Mario: short dark hair greying at the sides, dark frames, a long grey-white beard under a
      dark moustache, a black track jacket with red piping over a maroon tee with a lightning
      bolt, arms folded.
    - Venkat: wire frames, a thick moustache, a headset, a dark grey polo with a small emblem, and
      bare feet. Everyone else got shoes so that the bare feet read.
    - Josh: receding brown hair, black frames, a gingery beard, a grin, arms folded, and a light
      grey tee with a green leaf and his word "bootiful". It is not the product logo, following
      the "nothing that needs permission" rule.
    All three wear the attendee ribbon, not speaker teal. Teal is the one colour in the hall that
    means the missing keynote speaker, and three famous faces in teal would be three wrong
    answers to chapter 3. The agent decided this; Michele can overrule it.
- **Polish round on the ground floor, then chapter 4 in 3D** (28 Sep 2026). Michele: "Make a
  round of polish on the ground floor and chapter 2/3. Critics, then go ahead with chapter 4."
  - *The critique.* The agent rendered a survey from the gameplay camera: chapter 2 dark, chapter
    2 powered, chapter 3. Its findings, worst first:
    1. The follow camera could end up inside Voxxy's head. With something right behind her, the
       wall ray allowed it to come within 0.5 m of the pivot, and the frame was all orange
       shell.
    2. The booth floors read as flat, saturated plastic slabs.
    3. Chapter 3's "morning" hall was chapter 2's hall with the power on, dim between the high
       bays. It was already on the backlog as "hall renders dark".
    4. The lobby counters are plain boxes that blow out white under a robot lamp.
    5. The dark chapter 2 hall is close to a void apart from the exit signs.
    Items 1–3 were fixed; 4 and 5 are left on the backlog.
    - When boxed in, the camera now tries steeper pitches and looks down over the obstacle,
      eased in and out. It never comes nearer the pivot than the robot's own shell.
    - Stand floors are the hall's baked carpet, tinted each sponsor's colour, pulled toward grey,
      on an aluminium edge trim.
    - Chapter 3's fill light is roughly twice chapter 2's.
  - *Chapter 4, Room 8.* The 3D build stopped at chapter 3 with a "3D build ends here" card.
    Room 8 lies past chapter 1's build line, so `keynote3d.ts` builds its interior the first time
    chapter 4 is shown:
    - carpet, a lit ceiling, and a drape behind the stage;
    - the stage as a 5 cm dais with an LED edge, with a lectern at stage left;
    - the sim's seat blocks: seven rows each, with a seat on every sim seat so the audience sits
      in chairs;
    - Droid's two hooks as wall brackets at 3.1 m, with a beacon until each end is hung. With one
      end hung, the banner lies on the floor from that hook; with both, "HAPPY DEVOXX" sags
      across the stage;
    - Voxxy's four spotlights as floor PAR cans. The next one wears a pulsing ring, and a lit
      one throws a real beam at its own quarter of the stage. Four beams on one point washed out
      the banner, which the agent caught on the first render;
    - the cake as a wheeled board with a three-tier cake and three candles in the robots'
      colours, on a glow-tape mark that turns green;
    - a house screen with a Devoxx holding slide, showing the sim's crowd clock (the speaker
      reads "TBA"). When the robots reach the stage, the screen plays the opening video from
      `snap.reel`, and the camera eases back to watch it from the rows.
    Room 8's closed door leaf opens, chapter 1's props hide, and the robot lamps dim for the
    lit room. Stephan and the speaker wear their chapter 3 outfits (polo, glasses, mic; teal
    hoodie). Before this change they were a beige figure and a cream one.
- **Faces: Stephan and Josh, then the whole crowd** (28 Sep 2026). Michele: "Can we work on
  Stephan and Josh face shape? The other seem fine, a general improvement on graphics would be
  welcome." (He also asked what the session needed from Google Drive. The answer was nothing:
  the agent had only passed on a notice that the connector is not authorised.)
  - *The diagnosis.* Every close-up head was a ball with features glued to the front: glasses
    floating at a fixed depth, eyes like two marbles on the surface, a slit for a mouth, and no
    bone structure.
  - *The sculpt* (`sculptHead`, `FaceShape`) gained parameters for bone structure:
    - brow ridge, eye sockets and cheekbones;
    - a jaw with separate taper and corner width, and a forward chin;
    - a nose with its own width, and a flatter crown;
    - painted socket shade, warm cheeks and nose, and beard shadow on the upper lip;
    - ear size and splay.
  - *Features sit on the face.* The mesh carries `surf(x, y)`, its real depth found by a ray, so
    each feature is placed against the face itself:
    - the eyes are sunk into their sockets, with an upper lid in the skin and a catchlight;
    - the brows rest on the ridge;
    - the glasses clear the nose bridge, the lenses wrap slightly, and the temples run back to
      the ears;
    - the mouth is a crescent laid onto the face's curve, with the corners raised, teeth, and a
      lower lip.
  - *Stephan* has a long face with high cheekbones lifted by the grin, a tapering jaw, a definite
    chin, a straight nose, and grey stubble up to the lip. His frames are slimmer and his eyes
    narrowed by the smile.
  - *Josh* has a broad, square jaw, full rosy cheeks, a high forehead, ears that stand out, and a
    ginger beard shadow over the lip and jaw with a big grin.
  - The others kept their proportions but got the new eyes, brows and mouths.
  - *The crowd*, which is every other figure:
    - hair is now a shell with a hairline, high at the forehead and low at the nape, with a
      ragged fringe. It had been the same "beanie" cap Stephan's first head had;
    - every figure has hands that swing with its arms, and two eyes.

## 28 Sep 2026 — the intro's soundtrack, from the conference's own track

- *The ask.* Michele uploaded the MP3 of the Devoxx Belgium 2026 ticket trailer: "The part from
  2.30 is what I'm looking for (vocal excluded). Can we use this (it's generated too!) or create
  something similar? It should fit also with crate opening and current sounds (but you can also
  adapt the animation timing to the music)."
- *Rejected: shipping the file.* CLAUDE.md forbids audio assets, and the repo is MIT: putting the
  track in it would mean licensing Devoxx's audio, AI-generated or not, which is "something that
  needs permission". So the file was analysed, and the score was written from scratch to match
  what the analysis measured. No note of its melody is used.
- *Rejected: stem separation.* Demucs could have split the vocals off for a cleaner analysis, but
  its model host is blocked by the build container's network policy. The analysis used plain signal
  processing instead (librosa, scipy), which was enough.
- *What the analysis found.* 95.75 bpm in four, with driving eighths; standard tuning; G
  mixolydian (a G major with an F natural: spectral peaks on a 49 Hz sub G, stacked G/D/B, and
  F); a two-bar riff that sits on G and dips to F; snare on 2 and 4 over a pushed kick. The
  section from 2:30 is a build and a drop: a bar of eighth-note kicks, then a bar where the kick
  drops out under a sixteenth-note snare roll, then everything on the downbeat at 2:34.6. It ends
  with the highs cut and a last low hit.
- *The bug under every "too ambient".* The opening's own score had never played. The opening runs
  on top of chapter 1, so `snap.chapter` reads 1 under the crates, and the cues picked the score
  from it. Every intro Michele heard was chapter 1's quiet night score, and both the percussive
  and the rock rewrites were written and never heard. `scoreFor()` in `cues.ts` now picks score 0
  while the opening runs, in both pages. A test walks a real game through its opening and checks
  which scores get asked for, and when.
- *An offline renderer* (`tools/render-audio/`): the real sim, cues and audio code on an
  `OfflineAudioContext` in headless Chromium, stepped frame by frame. Its timers run on the render's
  own clock, so any machine renders the same file. Michele asked "can you extract the current track
  so i can listen to it?" and got three renders: the intro as shipped, the unheard rock score in
  the same mix, and the rock score alone. It also measured why the rock score would have been
  buried anyway: -35.6 LUFS, under chapter 1's room hum at -32. His verdict on the rock version:
  "a little better, but we can do more."
- *Timing adapted to the music, as he offered.* `SLOT` 2.9 s became 2.5 s, one bar at 96 bpm.
  `PANEL_DELAY` 0.5 became 0.55, so a lamp comes on on beat 3 and its crate front lands on the
  downbeat. `HOLD` is now derived, so the walk starts on the next downbeat. The flicker became
  1.25 s (two beats), with its strikes on sixteenths. The opening is 12.35 s (was 12.38).
- *The score.* One bar per robot:
  - title: a boom and a swell;
  - Voxxy: the groove arrives;
  - Droid: the build, on F;
  - Biggy: his crate is the drop, with a wall of double-tracked guitars, a sub, and a new hook;
  - the walk: home on G.

  The crate booms stay cues, and the score leaves its kick off those three downbeats, so the crate
  is the kick. The music then cuts out exactly while the emergency light does (its gates are the
  light's own strikes), and on the strike the light does not come back from, the band loses its
  power in a tape-stop dive. New voices: rock kick, open hat, toms, lead guitar, riser,
  reverse-cymbal swell, the dive. A generated reverb room, stereo placement, and held envelopes
  so a power chord is a wall, not a pluck.
- *Measured, not heard.* The rendered booms land within 12 ms of the score's downbeats, and the
  gates fall exactly inside the light's dark windows. The loudness climbs from -34.5 to -33.0,
  -30.7 and -26.9 LUFS (title, Voxxy, Droid, drop), against -35.6 for the old score. The loudest
  instant is 0.2375 of full scale, inside the test's quarter-scale budget. Against the reference,
  the drop is still about 3 dB lighter in the sub and 10 dB heavier in the mids. That was kept on
  purpose, because most people will hear it on laptop speakers, which have no sub. Michele's ear
  decides.
- *Tests.* The "builds up when it says it does" check is now per part: it is stricter, and it
  understands parts that leave. New checks: crates land on downbeats, the walk starts on a
  downbeat, the gates cut only while the light is out, the dive starts on the light's death, the
  score plays once, and which score the game asks for.

## 28 Sep 2026, V47 round — the ladle's journey, the grip, and the reel that was never there

**What the human decided.** Three notes, all of them about a thing the game claimed was happening
and was not: *"The ladle thing: I think droid should take it and drop it in the soup. Otherwise the
action is a bit pointless."* · *"GRAB that thing :D"*, with a screenshot of the soup pot flying
along beside Biggy's head · *"the cable roll should not disappear when taken."*

**What the agent did.**

- **Turned the ladle into an object with a journey.** It was a boolean: press `E` under the shelf,
  `ladle = true`, and the pot unlocked. It is a three-state union now — `shelf` → `carried` → `in`
  — with a press at each end of the walk, and it is `in` that Biggy's fill is gated on. Everything
  downstream reads the union rather than a flag: the run-sheet row is a 2-step counter whose "go
  here" mark moves from the shelf to the counter, Biggy has one refusal for "nobody has the ladle"
  and another for "it is in your hand, Droid", Stephan has a line for the middle state, and the
  prop is published at three positions so a player who cannot find the ladle can follow it.
- **Gave Biggy hands.** A carry pose in `gait.ts` (both shoulders up and in, forearms folded,
  blended on and off with the same exponential the roll uses) plus a pot positioned off the rig's
  `handL`/`handR` world positions instead of off the body. The old code aimed the pot half along
  his heading and half at the camera to stop it hiding behind him, which is why it looked like it
  was flying.
- **Modelled the cable reel.** Two flanges on a spindle over a frame, at the rack, drawn in every
  state chapter 2 can be in, with a wound web whose radius is the length still on the drum.

**What it cost, and what it found.**

- **A boolean that had leaked into nine places.** Widening `ladle` to a union broke `pilot.ts` and
  with it seven test files that had never mentioned the ladle — the shared chapter-3 choreography
  runs through one helper. That is the good version of the problem: one edit to the choreography
  and the rest followed, and a union would have been the right type from the start.
- **Measuring the grip beat looking at it.** Headless screenshots of the food court kept catching
  the selected robot's x-ray ghost, or the briefing panel, or a counter between the camera and the
  robot. Reading the rig's own hand bones out of the live scene graph through `__afterdark.debugRoot()`
  answered it in one run: hands 1.58 m apart on the first cut of the pose (arms out, pot in the
  gap), 0.68 m after flipping the shoulder roll, around a 0.52 m pot. The screenshots were the
  slow way to learn the sign of an angle.
- **The reel's own numbers, measured the same way.** Drum at the rack before and after the cable is
  taken, not one millimetre of travel, web winding from 0.30 m to 0.211 m over the first 697 px of
  1480 paid out.

**Tests.** `tests/soup.test.ts` grows the three-place ladle: the prop is the shelf rect, then a box
on Droid himself, then a box on whoever holds the pot, and Biggy cannot fill the pot until it is
`in`. `tests/tasks.test.ts` asserts the 2-step row counts the shelf without ticking.
`tests/ch2-chain.test.ts` (new): the reel is published before, during and after the run and never
moves off the rack. `tests/prop-geometry.ts` gives `cable` the drum's real box, and the collider
sweep accepts it because the rack it stands in is already solid. Suite **776 green**.

**Rejected.** Giving Droid the same two-handed carry pose for the ladle. A ladle hangs from one
hand; posing him as if he were carrying a pot to hold a 0.5 m spoon would have been a worse lie
than the one being fixed.

## 28 Sep 2026 — the curtain call: giving the ending something to look at

**What the human decided.** *"Where are we with the ending video/animation? Could we start that?"*
The answer to the first half was: the video shipped on 26 Sep and the animation was never built.
The answer to the second half is this section.

**What the agent did.** Wrote a stage act that plays in front of the opening video, entirely out of
verbs the game already had — `partyTrick` (Voxxy's jump, Biggy's roll, Droid's stretch), the climb,
and the ordinary physics step. Three robots take marks on the apron, turn to the house, solo in
turn, and finish as the tower, held to the last card. The room applauds: a new `Person.cheer`, 0 to
1, that the sim raises over three seconds and the renderer turns into arms.

**What it cost, and what it found.**

- **`ctx.stepAll` hands the stick to whoever the player last selected.** The first cut set an input
  vector per robot and called `stepAll`, which promptly overwrote all three — two robots zeroed and
  one driven by a stick nobody was holding. The act runs `stepBot` per robot instead, plus
  `syncMount` and the pairwise collide that `stepAll` does after it. Same physics, no stick.
- **Bang-bang steering orbits a heavy robot.** Full stick at the mark until the last pixel is fine
  for Voxxy and hopeless for Biggy — 130 kg, `accel` 0.6, drag that takes a second to bite. He
  circled his mark for the whole video and was therefore never still enough for `toggleMount` to
  let anyone climb him. The stick now steers at the velocity ERROR against a target speed that eases
  to nothing inside 14 px, which brakes him into the mark; on it, the velocity is cleared, the same
  thing `cutUpdate`'s hold already does.
- **Marks nailed to roles make robots walk through each other, which they cannot do.** Voxxy stage
  left, Biggy centre, Droid stage right is the obvious layout and it is wrong, because the player
  leaves them in any order: Biggy walked from stage right straight into Droid and the two shoved
  each other for twenty seconds. The three marks are dealt to whoever is nearest — the cheapest of
  the four orderings that keep Droid beside Biggy — so the assignment has no crossings by
  construction.
- **Arm's length is not close enough when both ends have slack.** Droid aimed at a point one arm
  from Biggy's mark, `driveTo` gave up 3 px short, Biggy was allowed 3 px on his own mark, and the
  gap landed outside `MOUNT_REACH` with Droid standing there for the rest of the video with his hand
  out. He now aims a pixel INSIDE Biggy, read off where Biggy actually is; `botsCollide` is what
  stops him, which is the honest version of "close enough to climb".

**Tests.** `tests/curtain-call.test.ts` (4, new): every beat fires and in order (jump, roll, unfold,
climb) with the whole act inside the shortest reel the game can cut; nobody leaves the stage rect
and they finish in a line with real daylight between them; the room comes up to applause and only
the people sitting down are clapping; and a skipped video stops the act dead rather than leaving a
robot walking behind the final card. Every frame of the act is also checked against each robot's
own `max`, the same guard `tests/cutscene-pace.test.ts` puts on the chapter transitions. Suite
**780 green**.

Two framing changes went with it. `VIEW_REEL` was cut from 310x210 to 250x160 — the screen's own
width (`roomScreen(R(8))` is x 1271.6..1501.4) plus ten pixels of air, because a cropped card is
worse than a small robot, and the height is what that width gives at the canvas aspect; the old
rect ran to y 216 and spent half the frame on empty seating. And `drawSpotlight` aims three
quarters of the way downstage rather than at the stage's centre, which is where the act lines up.

**Rejected.** Driving the act through `startCut`, the existing cutscene machinery. It fades to
black, teleports everyone to the head of a route and walks them at a pace derived from the shot
length — all three of which are exactly wrong here: the video is already playing, the player is
watching the robots they just parked, and a teleport under a screen that is mid-card is a jump cut
in the middle of a scene nobody asked to leave.

## 28 Sep 2026 — the two endings nobody could reach

**What the human decided.** *"Can you show me an example video? What happens if I have no
'bloopers' (skipping scenes, or not dropping any soup)?"* — a question, not a change request. The
answer needed the four degenerate reels printed out, and printing them out showed that both ends of
the range were broken.

**What the agent did.** Dumped `buildReel` for a clean run, a normal run, a disaster and a skipped
run (it is a pure function of the score bag, so this costs one throwaway test and no browser), then
fixed what the dump showed:

- **The flawless card was unreachable by playing well.** The cable blooper fired on any `cable > 0`,
  and chapter 2 writes `score.cable` on the frame the run connects — so every completed run had a
  blooper. It is gated on two thirds of `CABLE_MAX` now: the signposted route comes in a little over
  half the reel, so a tidy run is under it and a wander is over. The card also reads in metres.
- **The flawless card WAS reachable by skipping everything**, because `defaultScore` fills a skipped
  chapter in as a clean one. `ChapterCtx` carries `skipped` now, `buildReel` takes it, and it is the
  first blooper on the reel.

**What it found.** That a "pure function of the run" is only as honest as the counters it reads, and
two of those counters lie in opposite directions: `cable` is written by a chapter that cannot be
finished without writing it (so it is never zero on a real run), and the chapter-3 and chapter-4
counters are written by `defaultScore` as *perfect* when the chapter never ran (so they are never
bad on a skipped run). Neither is visible from inside `reel.ts`, and neither showed up in four
rounds of tests, because every test handed it a hand-written score bag.

**Tests.** `tests/reel.test.ts` +3: a clean run that ran the cable the short way gets the flawless
card and no bloopers reel at all; a 112 m cable run still gets called out and is not flawless;
skipping names the chapters, singular and plural, and is never flawless. Suite **783 green**.

**Also made.** A standalone preview page that plays the real reel — the same card text, holds,
fades and black beats, with the logic ported line for line from `src/sim/reel.ts` and five runs to
pick between. It exists so the ending can be judged without playing ten minutes to reach it; it is
not part of the game and not in the repo.

## 28 Sep 2026 — a full room stops being a game over, and chapter 4's length becomes a number

**What the human decided.** Michele, on the backlog: *"Game does not end if room is full, but some
rumors from the crowd?"* and, on the chapter's length, *"measure your run. I'd say 3 minutes?"*.
Also *"robots should end on stage by the tasks (voxxy excluded)"*, and that he is reworking Droid's
task in a separate session — so the agent left that code alone.

**What the agent did.**

- Deleted chapter 4's `ctx.fail(...)` on a full room and replaced it with a restlessness clock:
  the objective line rewrites itself once the room is full, and six escalating crowd lines cycle
  every 9 s. The cost moved onto the score bag (`late`, `lateT`) and onto the opening video.
- Wrote `tests/chapter4-length.test.ts`, which is the interesting one. It refuses every shortcut
  the other chapter tests take: no `debug.place`, no ignoring walls, one stick at a time (because
  `stepAll` hands the stick to the selected robot and zeroes the other two), the room's one door,
  and the two real aisles. It prints the per-leg timings and fails if the total outgrows a 150 s
  budget — half Michele's own three-minute figure, so a player gets the other half to think in.

**What it found, by being made to drive rather than teleport.** Five separate things that only a
real drive can see, each of which would have been invisible to a test that placed robots where it
wanted them: room 8 has a single doorway, so everything costs a trip to it; the seat blocks are
walls, so the room is two aisles and a strip, not open floor; `HOOK_REACH` is 45 px and the front
strip is 38 px from the hooks, so Droid has to stand *under* a hook and not merely level with it;
the stance for pushing the cake has to be two radii out or `botsCollide` spends the chapter shoving
Biggy back out of the crate; and the apron has about 80 clear pixels on it, between the cake parked
on its mark at one end and Stephan and the speaker standing at the other.

**What was rejected.** The first driver steered flat at the target and the heavy robots orbited
their marks forever — replaced with the velocity-error servo the curtain call already uses. The
first set of stage marks was nailed to roles, and two of the three sat on top of a person or the
cake. And the driver's last leg had to learn that the chapter ends *under its own feet*: the third
robot onto the stage starts the video, the curtain call takes the sticks away, and a driver that
kept pushing was reporting a stuck robot when what it had actually done was win.

**Also.** README's "Status" section was stale — it still listed the ending as missing — and three
`.DS_Store` files were tracked despite being gitignored since before the repo was public. Both
fixed. Suite **787 green**, `tsc --noEmit` clean.

## 28 Sep 2026 — the ship gate finds a soft-lock nobody had hit

**What the human decided.** Michele approved backlog item 1: *"one clean full run, chapter 1 →
final card, measured and recorded"* — `GAUNTLET.md` Stage 3's own gate, and the last one the build
had not passed.

**What the agent did.** Wrote `tests/full-run.test.ts`: one `createGame`, no `startChapter`, no
`skipChapter`, chapter 1 solved and each chapter arriving on its own to the score card.

**What it found on its first run, which is the whole argument for the gate.** The keynote speaker
could not be delivered, on twelve of fourteen seeds. The follower walked at wherever Voxxy was
*standing* and pushed itself out of any wall it ended up inside — a beeline with a shove on it. She
is nearly twice their pace, so she always reaches the mark first, and the moment she stands on it
they aim at the mark themselves and walk into the nearest booth. Every existing chapter-3 test
starts chapter 3 on a fresh RNG, which happens to hide the speaker at the one booth with clear line
of sight to Stephan. Nothing else in 787 tests could see it, because nothing else played the game.

**The fix, and why this one.** The speaker follows Voxxy's *route* rather than Voxxy: her positions
are dropped behind her as breadcrumbs and taken in order. Considered and rejected: giving the
speaker the crowd's lane grid (correct, but the lane grid is built for arrivals coming in through
the doors, and the speaker starts behind a booth in the middle of the hall); and A* for one NPC (a
second router in the sim, to solve a problem a breadcrumb solves). The breadcrumb also has the
better reading — being led looks like walking where the leader walked. One guard: a crumb is only
dropped where the *speaker* could stand, because Voxxy is the one robot that fits under the sponsor
tables.

**Two more, both in the test pilot.** `driveTo` had a fixed 400-frame budget per waypoint, which
reports a real 920 px leg as an impossible route; it is a floor now, with the leg's own length
added. And the router only knows about walls, so it routed a leg straight through the JUG leader,
who is a person standing in a lane, and an eight-way stick held dead at the waypoint pinned Voxxy
against his standoff forever. The pilot steps round now, which is what a player does.

**Tests.** `tests/full-run.test.ts` (1), `tests/speaker-follow.test.ts` (2, sweeping all five
booths the chapter can hide the speaker at). Suite **790 green**, `tsc --noEmit` clean.

## 28 Sep 2026 — the #DEVOXX letters replace Droid's banner

**What the human decided.** Michele, with a photograph taken from behind the giant letters on the
keynote stage: *"Another puzzle we could add, but maybe it's too late. There are always those 3d
letters in Devoxx, used for the keynote and the closing. They could be hidden around and be brought
on stage by the robot? Maybe we can change Voxxy or Droid's task?"* The agent answered first, without
building: yes to the letters, no to hiding them around the venue, and Droid rather than Voxxy. Then
Michele, one line: *"Droid swap. Droid is already slow, so don't scatter the letters around."*

**The case the agent made, and what it rested on.**

- *The letters are the real thing and the banner was not.* `media/venue-photos/54836008506_68c9fc5562_k.jpg`
  — the photo this project has always captioned "the stage ← chapter 4" — has `#DEVOXX` standing on
  Room 8's stage, white, the last X in Devoxx orange. The "HAPPY DEVOXX" banner was invented. So the
  change is a sense-of-place gain before it is a gameplay one.
- *Droid, not Voxxy.* The banner was the thinnest job in the room (two presses of `E` at two hooks),
  and the letters are the same thing done for real — the stage's Devoxx branding — so swapping one
  for the other keeps one job per robot. Voxxy's spotlights had got their beams that same day, from
  Michele's V46 note, and were worth keeping.
- *Not scattered.* Michele's own ruling of 22 Sep on the WiFi password (`docs/gameplay-additions.md`
  §2): not "find 13 letters scattered around the venue" — letter-collection is busywork. Chapter 4
  was also already the longest chapter (his open note, "about six minutes").

**What the agent did.**

- *Merged the three live branches first* onto `claude/nice-wright-ms1qmg` — the 3D line, the 2.5D
  line's curtain call and reel endings, and the intro score — because chapter 4 had been changed on
  two of them that day and the letters had to land on all of it. Only the GenAI notes conflicted
  (both sides appended); 799 tests green on the merge.
- *The sim* (`src/sim/letters.ts`, `ch4-keynote.ts`). `#DEV` stands; the O, X and orange X lean in
  one stash in the east wing. Droid lifts one with `E` and sets it into its own gap with `E`, so the
  sign spells itself and there is no wrong order. Only at its gap, never onto a robot standing in it;
  Voxxy (*"it's as big as I am. I can carry it or see where I'm going, not both"*) and Biggy (*"these
  hands are for pots. An X has no handle"*) refuse in their own voices and keep the key. Carrying is a
  load exactly like Biggy's crates: mass + 0.7, acceleration scaled by the mass ratio — the same
  force on more mass, which turns out to be exactly what the crate factor already was (7 / 8.5 =
  0.82) — and `DEFS` untouched. Every standing letter stands on its own collider.
- *Both renderers.* `src/render/letters.ts` cuts `#`, `D`, `E`, `V`, `O` and `X` as extruded shapes
  — no font file, no asset — shared by the 2.5D and 3D builds. 2.5D draws amber tape in the empty
  gaps, so the stage reads `#DEV___` exactly like the progress line; 3D draws a faint ghost of each
  missing letter standing in its gap. Droid carries with the gait's existing carry pose (Biggy's pot),
  the letter in his hands. A placed letter plays the `clue` cue and the finished sign the `chime`.

**What it cost, measured.**

- *The first layout was bad and the numbers said so.* Driven from the top of the stairs by the test
  pilot, the sign took **94 s** against **31 s** for the two hooks walked the same way — the opposite
  of "Droid is already slow". Leg timings showed why: with Stephan and the speaker mid-stage the only
  lane to the gaps was 4 px wide, and the router went down one aisle, across the room and up the
  other, 17 s a trip. Standing the two hosts beside the sign, where presenters stand, opened the whole
  front of the stage: **43 s**. Moving the stash from the room's east wall to the wing's back wall,
  70 px nearer the gaps: **39.5 s**. The honest figure is about **40 s against 25–31 s** for the
  banner's two hooks walked the same way (31 with the hosts where they used to stand, which the
  pilot bumps into; 25 with them moved) — ten to fifteen seconds more, nearly all of it the three
  carries, which are the job. The 2.5D line's own one-stick driver (`tests/chapter4-length.test.ts`,
  merged in afterwards, and it drives the sign now) agrees: Droid's leg **20.1 s → 30.7 s**, the whole
  chapter **92.3 s → 101.3 s**, against its 150 s budget and Michele's three-minute figure.
- *The 2.5D stage ate the letters.* It was drawn as a 0.45 m box while the sim's stage is floor, so
  the robots had always stood sunk to the shins in it; with letters on it, the bottom 45 cm of every
  glyph vanished and the orange X read as a Y. It is a 5 cm dais now, as the 3D build had already
  decided for the same reason, and `stage` came off the collider sweep's walk-through list with it.
- *A test pilot that walked through people.* `tests/pilot.ts` routed Droid straight through Stephan,
  who is solid through `standOff` rather than a wall. The router takes obstacles now.

**Rejected.** Hiding the letters around the Devoxx floor (Michele's own busywork rule, and minutes on
the longest chapter); Voxxy carrying them (it would have deleted the spotlights built that day, and
she is only as tall as a letter); an order puzzle on the stage (everybody knows how DEVOXX is spelt,
so it would be a chore, not a puzzle); letting Droid carry two at once (it halves the trips, but costs
a second carried-state and a two-handed pose on the last day).

**Tests.** `tests/letters.test.ts` (12, new): one stash within 3 m and every letter within 12 m of its
gap; only Droid lifts, and the other two keep the key; the load and its exact removal; felt in the
first 0.4 s, same top speed; its own gap only, with the right words when it is not; never through a
robot; solid; no room behind the sign; the stage waits for the sign; driven from the stairs in under
50 s; `R` gives Droid his weight back; the arrow is always within reach of a letter. The banner tests
in `chapters`, `tasks`, `party-tricks` and `curtain-call` were rewritten against the sign, never
loosened. Mutation check: with the letters' colliders removed, three tests fail, the collider sweep
among them. Suite **812 green**, build clean.

**Then both live branches moved again, and were merged under the letters.** The 2.5D line's full
room, one-stick chapter-4 length and ship-gate run (its Droid legs ported to the sign), and the 3D
line's front row of hall speakers, README and venue photos. One seam that was not a conflict: the
front row was published seated but without the curtain call's `cheer`, so five famous faces sat still
while the room applauded; `tests/curtain-call.test.ts` caught it and they clap now. **820 green**.

- **Venue photos, Duke, Lize and Aurélie, and speaker lanyards** (28 Sep 2026). Michele sent five
  venue photos: the main stairs from the side; the Devoxx sign with ceiling ducts, box truss and
  disc pendants; two of Stephan ("remember the MIC"); Duke on the keynote screen ("should appear
  somewhere"); and the entrance. He then added "We should add Lize Raes" and "Aurélie Vache",
  and "they should have speakers badge, and the keynote another color, maybe multicolor?"
  - *Stephan*: hair cropped short and grey all over, receding at the temples; lighter skin;
    thinner amber frames; the mic is now a slim skin-tone boom hooked over his left ear with a
    small capsule at the corner of his mouth, as in every photo. The polo has short sleeves
    with tipped cuffs, hung on the arm pivots so they swing.
  - *Lanyards (a sim change, decided by Michele):*
    - a fifth ribbon, `LANYARD.keynote`, multicolour, worn only by the missing keynote speaker
      in chapter 3 and on stage in chapter 4;
    - every named speaker (Mario, Venkat, Josh, Lize, Aurélie) now wears speaker teal. This
      reverses the agent's earlier choice of attendee grey, which it had only made to protect
      teal's meaning;
    - the chapter 3 hint now says "multicolour lanyard and teal hoodie";
    - renderers paint that ribbon's key as rainbow bands;
    - the distinct-colours test now counts five ribbons, and a new check requires exactly one
      keynote ribbon.
  - *Lize and Aurélie*, as NPCs on the hall's south strip. The sculpt gained `longHair`, a hair
    curtain from the crown that frames the face, closes as it falls, drapes over the shoulders,
    waves, and flares or flicks at the ends.
    - Lize: long wavy auburn hair, blue eyes, a wide smile, a cheek mic, and a red wrap dress
      with a V-neck, sash and skirt.
    - Aurélie: dark jaw-length hair with a fringe and flicked ends, thin violet frames, a
      closed smile, and a navy tee with a scoop neck.
  - *Duke* (the artwork is BSD-licensed): a 2.9 m inflatable in the lobby south of the main stair,
    facing the doors, swaying, one arm waving, under a display spot. He is solid in the sim
    (`DUKE`, a `duke` wall with its own blocked line for Biggy), so nothing walks through him.
    His first shape was a sharp cone that read as a gnome, and the dome fixed it. He also waves
    from the corner of Room 8's holding slide.
  - *Entrance*: the facade is glass in slim white frames, with mullions every 1.5 m, a transom,
    glazed side screens where the sim has reveals (they had been solid white fins), open glass
    leaves with push bars, and green exit signs over the bays. Outside is a sky-and-trees
    backdrop, bright in chapter 3 and a dim street in chapter 2.
  - *Hall ceiling*: black, with aluminium box truss (four chords, laced), two runs of spiral
    duct with seams, drops and diffusers, and the high bays redrawn as the photo's large disc
    pendants with a warm orange rim.
  - *Main stair*: white stepped side panels, with a glass balustrade on steel posts and a
    handrail following the pitch. The first pass z-fought the treads into stripes; the panels
    now stand just outside the footprint.
  - A sponsor table top that burnt white under a pendant is now matt grey.
- **Mouths, and Stephan's pointy hair** (28 Sep 2026). Michele: "Lize is good, but her mouth and
  stephan's are odd. Stephan hair should be pointy!"
  - *Mouths*: the first was a thin black lens with pointed corners and a sliver of teeth, which
    read as a grimace. A grin is now a D: an almost level upper edge lifting at rounded corners,
    a deep round lower curve, a row of upper teeth over a dark red mouth, and soft lips (a thin
    upper, a fuller lower). The pieces are bands tessellated in rows, so their middles follow
    the face; the flat outline shape had cut chords through the cheeks. A closed smile is a lip
    line with the lower lip under it.
  - *Stephan's hair*: 260 short cones, 1.3–2.1 cm each at his scale, leaning up and slightly
    forward, salt-and-pepper, over the crown and front and kept off the forehead, ears and nape.
    They are short on purpose: the first tall tufts, days ago, read as punk.

## 28 Sep 2026 — Voxxy's route is not everybody's route, and the ending stops freezing

**What the human decided.** Michele read the breadcrumb fix and answered it with the one thing it
had got wrong: *"remember that voxxy can go under the tables!"* And on backlog item 5, he asked for
a recommendation and then approved it: *"ok go on"*.

**What the agent got wrong and he caught.** The sponsor half tables are `low: true` with
`skipFor: voxxy`, and the crumb guard was written as "any wall that is not low" — so it was dropping
crumbs under the tablecloths, which is exactly the route only Voxxy can walk. The probe is the
speaker's own body against every wall now. Checking that also surfaced an older fault the guard had
been hiding: the speaker's wall push-out skipped `low` walls as well, so the keynote speaker glided
through the sponsor tables and the BOF workshop tables. A person walking through a draped table is
the kind of thing a judge sees in three seconds.

**The test was wrong too, twice, and both are worth recording.** The first version sampled one seed
and passed against the *unfixed* code, because that seed's route happened to miss every table — so
it sweeps all fourteen now, and with the old code it names seeds 3 and 12 walking through The
Coffee Sponsor. The second version tested the speaker's body against the booth's expanded bounding
box, which reports a corner the speaker cleanly rounds as a table they walked through; it uses the
circle-to-rect test the sim resolves the contact with. A regression test that passes against the
bug is worse than no test, and the only way to know is to put the bug back and watch it fail.

**The ending.** Rejected: cutting the video into several shots — most work, most likely to
disorient on a fixed isometric camera, and it competes with the curtain call, which is the content
of the shot. What the freeze actually was: `game.ts` stops the sim while a card is showing, which
no chapter could see or override. `ChapterRuntime.behindCard` is the opt-in, called only while the
phase is `done` and a card is up; chapter 4 keeps its framing, keeps the crowd walking, holds the
applause at full and runs the curtain call on a clock started where the video ended. A skipped
video still stops dead, because the act was skipped with it.

**Tests.** `tests/speaker-follow.test.ts` sweeps the tables across all seeds;
`tests/curtain-call.test.ts` +1 — the card lands on the same shot, the tower is still up, the room
is still clapping, somebody is still moving and Voxxy is still jumping, and the card is not
rewritten behind itself. Suite **791 green**, `tsc --noEmit` clean.
