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
