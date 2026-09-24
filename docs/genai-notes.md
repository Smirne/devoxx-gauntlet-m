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
