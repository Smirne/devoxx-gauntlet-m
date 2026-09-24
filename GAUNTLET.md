# GAUNTLET.md — how "After Dark" gets built

The gauntlet loop is the build methodology, not a polish pass bolted on at the end. Every piece of
this game is produced by a **builder**, then torn apart by a **critic on fresh context** who never
sees the builder's diff, only the running build. A piece is done when the critic says our version
would be mistaken for the professionally-shipped game — or when it caps out and gets logged.

Deadline: **30 Sep 2026, 23:59 CEST.** No round may run past 28 Sep evening; the last ~36 h are
README, GenAI notes, MIT licence check, submission form, buffer.

---

## 0. Sources of truth (read these, nothing else)

| File | What it is ground truth for |
|---|---|
| `docs/after-dark-full-design.md` | the game as designed: maps, 4 chapters, doors, cutscenes |
| `docs/lights-and-locks-rules.md` | the light-mixing mechanic's exact rules |
| `docs/brief-and-references.md` | competition brief, 100-point rubric, robot bios, venue facts |
| `docs/organisers-3d-demo-notes.md` | the organisers' procedural-robot technique and motion numbers |
| `docs/scale-and-units.md` | pixel/metre conversion for the 3D port |
| `reference/poc/10-after-dark-kinepolis.html` | the gameplay **ideas** and the mechanics' numbers — a proof of concept, not law |
| `plans/*.png` | **room layout** — adjacency, proportions, stair positions |
| `robots/*.png` | **appearance** — silhouette, proportions, palette, signature details |
| `media/venue-photos/*.jpg` | material, lighting and mood reference, captioned by chapter |
| `media/other-images/CAPTIONS.md` | **corridor, main staircase, Zaal numeral signage and the dark empty hall** — captioned, with the corrections they force |

`docs/DESIGN.md` ("Room Service") and `KICKOFF-PROMPT-M1.md` from the old planning folder were
deliberately not brought into this repo. They are superseded by this file. Do not look for them.

Never copy Machinarium's art or assets. Never copy game.devoxx.be's robot-demo code. Both are
craft bars only.

---

## 1. Architecture

```
src/sim/      2D, headless, tested. The only source of truth for game state.
src/render/   Three.js. Reads sim state. No game logic in render code, ever.
tests/        vitest. The acceptance criteria.
tools/        progress page generator, fidelity-check harness.
```

The renderer is a **diorama**: a fixed orthographic/isometric camera per room and chapter, not a
free 3D camera. That is what makes it read as a sharp game to judges (the brief's own "a sharp 2D
game beats a vague 3D one") while still showing the robots' designed appearance, which a top-down
camera cannot.

Robots are **procedural primitives** — Box, Cylinder, Sphere, Lathe, Extrude, Torus — with a
hierarchical bone rig and a procedurally animated gait. No GLB import, no rigging pipeline, no
external 3D or audio asset files. The organisers went procedural themselves, which validates the
approach for a short build.

Environment geometry is built from the annotated floor plans at correct proportions and adjacency,
with simple primitives and materials informed by the venue photos. Legible over decorative.

### Frozen physics constants

Ported from the prototype into `src/sim/constants.ts` and asserted by
`tests/frozen-constants.test.ts`. Changing one is a human decision, never a builder's.

**They were unfrozen exactly once — 23 Sep 2026, by Michele.** His chapter-1 playtest
(`docs/playtest-notes.md`) filed three complaints with one cause: read through the venue's own
geometry scale, the prototype's arcade numbers made Voxxy a 23 m/s robot with a 0.72 m radius on
screen and a 1.36 m radius in the sim. He authorised a **full rescale of speeds and radii**; see
`docs/scale-and-units.md` for the decision and the measurements. They are frozen again behind it,
and the rule is unchanged: the next change is another human decision.

| | Voxxy | Droid | Biggy |
|---|---|---|---|
| radius (sim px) | 4.75 | 6.25 | 9 |
| radius (m) — measured off the rig | 0.38 | 0.50 | 0.72 |
| accel (s⁻¹) — unscaled | 12 | 4 | 0.6 |
| top speed (px/s) | 72.5 | 28.75 | 58.75 |
| top speed (m/s) | 5.8 | 2.3 | 4.7 |
| drag (s⁻¹) — unscaled | 9 | 7 | 0.35 |
| mass — unscaled | 1 | 3 | 7 |
| lamp — unscaled | cone 0.38 rad, range 280, orange | pool range 95, green | cone 1.0 rad, range 300, blue |

Every px/s quantity is the prototype's number × `SPEED_SCALE = 0.25`, and that is the only thing the
rescale did to speeds — the prototype's own values are still read out of the POC and checked against
the factor in `tests/frozen-constants.test.ts`, so "one factor, no exceptions" is a test and not a
claim. Lengths did not move, so a clock a robot has to travel against scales the other way, by
`TRAVEL_TIME_SCALE = 4`.

Also frozen: wall restitution 0.45 for Biggy and 0.05 for the others; robot–robot restitution 0.3;
push force 42.5 (Voxxy) / 30 (Droid) with lean ≥ 0.3; `boostCap = speed × 1.05` decaying at
1.5 s⁻¹; jammed-door threshold **17.5 px/s on the speed into the door**; roller-door threshold
**67.5 px/s** (above Biggy's own 58.75 — that relationship is asserted, not just the values); cable
length **1480 px** (a length: unscaled); `PUSH_REACH` 1 px and `MOUNT_REACH` 4 px; mount requires
Biggy below 5 px/s and widens Droid's pool ×1.6; blocked-message throttle 2.5 s; `dt` clamped to
0.033 s.

Rates in s⁻¹, masses and restitutions as ratios, and thresholds compared against the robots' own
caps all survive a rescale unchanged — which is what made the rescale a change of unit rather than a
re-tune. There is now one scale for the whole project, `PX_PER_M = 12.5`: the sim computes in pixels
and converts on the way out, for the renderer and for anything the game says out loud to the player.

---

## 2. Stages

### Stage 0 — scaffold
pnpm, Vite, TypeScript strict, vitest, three. `src/sim/types.ts`, `src/sim/constants.ts` and
`src/sim/units.ts` are the contract every other piece codes against. Done.

### Stage 1 — the two first-class pieces

These two get gauntleted **first and hardest**, with a measurable pass condition rather than a
vibe. They do not get to cap out while still factually failing. If three rounds cannot fix them,
they escalate to Michele rather than shipping wrong.

**1. Floor-plan fidelity** — sense of place, 10 pts, and "does this look like Kinepolis".
Pass condition: a critic takes a top-down debug screenshot of the rendered map and overlays it on
`plans/devoxx-rooms-stairs-annotated.png` and `plans/exhibition-floor-stairs-annotated.png`.
Room count, relative proportions, door positions and **both** staircase positions must match —
the two secondary staircases **standing in the corridor against its two walls, level with rooms 4
and 9** (plan y 884–947, 20 plan px deep, hard against the room walls), main staircase at the
corridor's end between **6 and 7**. This file used to say the secondary staircases were between
rooms 3|4 and 10|9; they are not, and Michele's ruling of 24 Sep 2026 — *"follow the devoxx plant,
not the plan.md"* — is the standing rule: **where a drawing in `plans/` and a `.md` disagree, the
drawing is the authority**, and the prose gets corrected in the same change. Numbered Zaal signage must be visible in-scene, in the venue's own style — a large orange
panel carrying one big white numeral beside each auditorium entrance, plus the blue Dutch
wayfinding signs (`uitgang zaal 6/7`, `info`); see `media/other-images/CAPTIONS.md`. Craft polish
(materials, lighting mood against the venue photos) is only judged once the overlay passes.

**2. Robot appearance fidelity** — all three robots, and "does this look like OUR robot".
Pass condition: for each robot a critic places the in-game model at an angle showing its face and
front — **not** top-down — next to its model sheet and checks silhouette, proportions, palette and
the signature details:

- **Voxxy** — glossy orange, wide ellipsoid head, big black visor with two glowing amber bar-eyes,
  a white/silver disc port on each side of the head, two small rounded ears plus an antenna nub,
  pear-shaped body with a small white emblem, very long tapered arms with a white band near the
  wrist, small dark grippers, short stubby legs.
- **Droid** — tall, lanky, weathered graphite panels, exposed cylindrical joints at shoulder,
  elbow, hip and knee, small amber eyes in a narrow dark face under a domed helmet, round shoulder
  pauldrons with a circular emblem, copper weathering at the shoulders and hips, long forearms,
  articulated hands, flat blocky feet.
- **Biggy** — a huge spherical weathered-orange belly with a circular emblem, a blue-gray armoured
  dome helmet fused to the top with rivet ports and a whip antenna, a dark visor band beneath the
  rim, short stubby dark arms with small clawed hands, very short thick legs with ribbed knees and
  wide flat boots.

A robot that reads as a generic humanoid rather than as **this** robot fails, however well it
animates.

### Stage 2 — the rubric pieces
Everything else, each tracing to the rubric (40 originality / 20 physics realism / 15 playability /
10 all three robots / 10 sense of place / 5 GenAI notes): per-robot animation and idle personality
(walk, run, squeeze, reach, force-fix, the "nope" bounce) anchored on the organisers' motion
numbers; light and shadow rendering (cones, glass, mirror reflection, fog of war); cutscenes and
chapter transitions; HUD, feedback and "why am I blocked" legibility; audio synthesised in code
(footsteps per robot, fix chime, nope buzz, ambient hum, victory fanfare); Devoxx-flavour beats
(tomato soup, queues, the OutOfMemoryError beer joke, Stephan); and a full-run stability pass.

### Stage 3 — integration
After each wave, one fresh agent plays all four chapters end to end, or runs the ported Playwright
choreography, and smooths tone and seam mismatches the parallel builders introduced. **Nothing
ships without at least one clean full run.**

### Stage 4 — submission
README that runs from a fresh clone, GenAI notes, MIT licence check, submission form.

---

## 3. The loop

**Builders** work one piece at a time. Every handoff must still pass the test suite, and for the
two first-class pieces the overlay and model-sheet checks above.

**Critics** get fresh context every round, no exception. A critic:

1. Launches the **actual current build** through browser automation and screenshots or records it.
   Never reads the builder's diff, PR description or self-report.
2. For the two first-class pieces, runs the factual overlay or model-sheet check first and fails
   the round outright if it does not pass, before any aesthetic judgment.
3. Compares blind, side by side, against Machinarium footage purely as an atmosphere, animation
   and lighting craft bar — which one a stranger would believe is the professionally-shipped game,
   and why — plus the rubric criterion the piece maps to.
4. Gives an explicit verdict: which is better, the single biggest gap, and which rubric point or
   fidelity check it costs.
5. Caps at 3 rounds or ~3 hours per piece — except the two first-class pieces, which escalate
   rather than ship failing.

If our version wins or ties on craft **and** passes the factual checks, the piece is done.

### Publish the playable build after every round

Michele plays it; that is worth more than another critic. **After every significant round —
every time a fix pass lands and the build is green — republish the playable build and give him
the link.**

- Always update **the same artifact**, never publish a new one:
  **https://claude.ai/artifact/RnHqA2fXkAyGSfEjGybV4R**
  From a conversation that did not publish it, pass that URL as `url`; publishing without it
  creates a second artifact and the link Michele has bookmarked goes stale.
- Build from the **committed** state, never the working tree — parallel agents are usually
  mid-write. `tools/publish-build.sh` does this: it builds `HEAD` in a throwaway git worktree
  and prints the `dist/` path to publish.
- Say in the message which commit it is, and what is *known to be wrong* in it. A build posted
  without its caveats invites Michele to re-report things the round already knows about.
- The debug URL API is the useful part for review, so repeat it: `?chapter=N`, `?topdown=1`,
  `?pose=voxxy|droid|biggy`, `?nofog=1`, `?warm=N`, `?seed=N`, `?nohud=1`.
- It is keyboard-only and needs WebGL2, so it will not play on a phone. Say so.

---

## 4. Tests are the acceptance criteria

The prototype's own verified choreographies are the starting set, not a ceiling — the prototype
is a proof of concept and anything that can be improved should be. What a test must never do is
get weaker: when a mechanic is improved, the choreography is rewritten to assert the *better*
behaviour, never deleted or loosened to let a regression through. The prototype's own
verified run (Playwright test27) is the bar:

- four clues including the kiosk one;
- the jammed door breaks for Biggy alone at ~103 px/s and not below 70;
- the roller door: Biggy alone fails at the door, pushed by Voxxy breaks it at ~282;
- the cable measures 1270–1311 px on the straight route and over 1480 on the lane route;
- the sticker minigame, queue, ladle, pot, speaker and delivery all fire;
- both cutscenes reach the next chapter;
- keynote jobs, crowd and all three robots on stage;
- **no console errors.**

---

## 5. Progress page

`tools/progress/` regenerates a static page after every round: every piece, its round count, the
latest critic verdict with before/after screenshots, pass/fail on the two factual checks, and days
remaining to 30 Sep. Michele watches the game evolve there.

---

## 6. Per-session housekeeping

Append to `docs/genai-notes.md` every session: what the agent did, what a human decided, what was
rejected and why. It is the 5-point GenAI section of the submission — it is scored, so it is not
optional.

**Done** means: the floor-plan and robot-appearance checks both pass factually; every other
rubric-relevant piece is either wowed or logged-and-capped; a full run has zero console errors; the
README runs from a fresh clone; `docs/genai-notes.md` has an entry per session; and at least ~36 h
of buffer remain before 30 Sep 23:59 CEST.
