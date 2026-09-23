# Michele's playtest notes, and what happened to each

The gauntlet's automated critics check what they were told to check. This file is the other half:
what a human found by playing the thing. It is kept because the pattern in it is the useful part —
almost everything here was invisible to a passing test suite, and several items had been passing a
green check for four rounds.

Status key: **done** shipped and pushed · **open** not started · **waiting** needs a decision ·
**in flight** an agent has it now · **answered** the note was a question, and the answer is in the
right-hand column — sometimes with a small change beside it, sometimes with none.

## Chapter 1

| # | What he found | Status | What it actually was |
| --- | --- | --- | --- |
| 1 | "you can pass though the barrier. First room I meet on the north side" | done | Cinemas A, C and D had a joke sign saying *closed* and no wall behind it. Only B and E were gated, because those two are the puzzle. |
| 2 | "the circle around the selected chars shouldn't cover the robot" | done | The ring drew with depth testing off, deliberately, so a robot in front could not hide it. Now a depth-tested ring plus a ghost that only shows through what occludes it. |
| 3 | "seats are missing in the room. Biggy is blocked but it's not clear by what" | done | Seat rows existed only as walls a chapter pushes at runtime; the venue draws static geometry and never saw them. Room E is also the one auditorium left undressed *because* "room E dresses itself in chapter 1". |
| 4 | "droid on biggy is floating. Sitting on the helmet should be it?" | done | The lift was Biggy's full height, correct only if Droid's soles touch down — but the mounted pose tucked his knees up. He sits astride now. |
| 5 | "I had trouble finding the projector... It could be a control panel, door override" | done | A 0.6 m grey box on the floor of a blacked-out corridor, unlit, for a control the fiction puts above Droid's reach. Props can now be wall-mounted and carry a standby glow. |
| 6 | "I didn't notice the circle nor that the number was found" | done | A toast was the only record and it scrolled away. The digit now appears in the ring and stays. |
| 7 | "Light points should give hints on the needed light" | done | The ring was a single circle in the *average* of the needed colours — orange + green averages to a yellow that names no robot. Now one arc per required colour. |
| 8 | "when a robot is behind an object, show the silhuette, not this thing" | done | It was a capsule and a sphere. Now the rig's own geometry, as a child sharing each mesh, so it follows every bone with no second animation path. |
| 9 | "Voxxy feels too fast, it's almost hard to control" | in flight | Frozen constants. See below. |
| 10 | "it's really hard to stop a character pointing the light in the right direction" | in flight | Not rotation — the aim is instant. Voxxy coasts ~2.6 m after you release. Same cause as #9. |
| 11 | "droid is pushing Biggy just by coming close, with no contacts" | in flight | Sim radii are "deliberately generous": Biggy is 1.36 m in the sim against 0.72 m on screen, plus 0.96 m of push slack. Same cause as #9. |
| 12 | "when biggy pushes the door there should be some kind of animation" | in flight | The door does not open, it ceases to exist — `removeWall` in the same frame as the hit. |
| 13 | "the animation in the chapter 1-2 passage is too fast and too dark, and I'd zoom more" | in flight | |
| 14 | "lighting on south room is odd. I should be able to see the seats" | open | Same room as #3; may already be fixed by drawing the seats. Needs a re-look. |
| 15 | "reduce the black block, make it into a glass wall or something to show the circle better" · and again: "the black bench(?) has to go, for a glass wall as suggested before" | done | Not a bench. The kiosk's own **fascia**: `floor1.ts` drew it as a 60 x 60 px plate laid flat at 2.15 m — a LID over the whole kiosk, 4.8 m square, and unlit from a 30 deg camera that is exactly what a black block looks like. It does not stand between the camera and the clue, it **shades** it: A/B on one build, the ring's box measures mean 39.1 with the lid and 43.5 without, brightest arc pixels 128.8 against 174.1. The counter he guessed at costs 43.8 vs 43.5 — nothing — and is gone anyway because he asked for it. Four 3 px fascia bands now, top open. The glazing was already `glass: true` in the sim and needed no change. **Not all of the ring's improvement is this change**: his build measured 5.8 mean in that box, and most of the climb from there is the concurrent clue-and-lighting work in the same tree, not the kiosk. |
| 16 | "those two are maybe too near to each other?" | open | Two clue spots. |
| 17 | "I put all three robots in the room... needed different tries before finding the number" | waiting | His call: try the new arc markers first before adding more help. |
| 18 | "they seem fit for biggy to pass, make the passage more narrow" | open | The secondary-staircase niche is 3.2 m wide. Must be sized *after* the radius rescale, which halves Biggy's sim width. |

## Chapter 2

Played 23 Sep 2026, on the build that already carried the speed rescale. Nine notes;
the pattern in them is the same one chapter 1 kept producing — **the renderer knows
about things the sim does not**, plus two cases of a control being drawn as a
featureless box.

| # | What he found | Status | What it actually was |
| --- | --- | --- | --- |
| 1 | "robots can go through staircase and objects" | done | The sim had never heard of most of the hall's furniture. A throwaway flood-fill probe (`tests/probe-*.test.ts`, gitignored) measured **100% of every footprint walkable** for: both secondary staircases, all 18 structural roof columns, 4 lobby columns, 2 planters and the network rack — every one of them drawn by `src/render/venue/ground.ts` out of its own loops. They are `GF`/`groundWalls()` geometry now, so the picture and the collider are the same object. Same bug as note 3 above, one floor down. |
| 2 | "In devoxx the stairs are not open but look like rooms" | done | They are rooms — `plans/exhibition-floor-simple.png` draws each secondary stair as a **walled shaft** with double doors in its plan-north end and the ascent arrow running away from them. Ours were open flights climbing the wrong way. Now: shell, doorway in the west face, a walkable landing behind it, and the flight east of that. The chapter's start moved out of the doors with them. |
| 3 | "After switching the room gets darker, not lighter (i think is the robot's light being switched off?)" | done | **His guess was right, and it was only half of it.** `ch2-expo.ts` stopped casting light polygons the instant `power` went true, which switched off all three lamps *and* all three key lights; and nothing on the renderer's side had ever heard of the breakers, so no house light came up. Measured on his build: mean scene luminance **12.5 → 5.1**, p90 **42 → 8.8**. The chapter casts its lamps the whole way through now and the last breaker eases the hall into `MOOD_EXPO_LIT` — fog mask off, ambient up, track spots driven as house lighting, lamps damped to 0.4 the way chapter 3's daylight damps them. Same measurement after the fix, same two shots: **9.3 → 24.0** mean, p90 **8.8 → 58.3**, and the share of the frame under L=8 goes 89% → 45%. |
| 4 | "The breaker should be graphical of course" | done | Two objects in one place, neither of them a breaker panel: a static slab at 1.45 m in `ground.ts`, and chapter 2's own `breaker` prop drawn from the generic `PROPS` table as a **1.5 m box standing on the floor** — the coloured crate in the corner. Split the way chapter 1's door override was: enclosure, its recessed door and the conduit down to the floor are venue fabric; three handles that visibly flip and a supply lamp are drawn from the sim's own `Prop.v`. |
| 5 | "Cable rack is not visible at all" | done | Not a missing object — an occluded one. Chapter 2's camera pitch is 31°, and the technical room's south side is 3.8 m of building shell standing 4 m in front of a 1.95 m cabinet: the rack's head cleared the wall top by **13 cm**. It stands on a 0.4 m plinth now (clears by half a metre) and is a collider, so it reads as a cabinet rather than as a decal. |
| 6 | "When cable ends, Voxxy should be stopped and only further going would release it" | done | It simply ran out — one frame under `CABLE_MAX`, the next the plug was back on the rack. The reel has three states now: slack, **taut** (Voxxy held on the circle of what is left, outward velocity cancelled, the drawn cable turns red) and pulled out, which needs `CABLE_PULL_OUT` of continued lean. Sim-side, in `stepCable`. |
| 7 | "Something is flickering at the entrance" | done | Z-fighting, twice over. The lobby's raised plate ran the full width of the canvas and the forecourt paving was laid on top of it — **400 sim px of overlap with both top faces at exactly `RISE`**. Second one on the same wall: the facade mullions were exactly as tall as the glass they frame, so every cap was coplanar with its pane. The plate stops at the building line now and the mullions stand 4 cm proud, which is what a curtain wall looks like anyway. |
| 8 | "I can push this yellow thing around. Does it have a purpose?" | answered | It is the **rubber duck**, and it does: shuffleboard for Rubber Duck Inc, one of the three optional booth games, worth swag. What he could not see is the thing that explains it — the target circle is an unlit floor decal in a blacked-out hall, the exact failure that made him miss the projector panel in chapter 1. It carries a `glow` now, like that panel does. The duck is not a leftover and is meant to be pushable. |
| 9 | "I don't get how to enter the reception" | answered + one change | There **is** a way and exactly one: the stepped threshold in the hall's right-hand wall (world y 285..568), which is the only opening in that edge by Michele's own plot. A flood fill confirms the lobby, reception, BOF rooms and toilets are all reachable through it and through nothing else. What was missing was that anything said so — every other door in the building is signed and this one had emergency greens and concrete. A "RECEPTION · badges · wardrobe · up the steps" plate now hangs on the concrete directly over the head of the steps, facing the hall. **No redesign; the route was always there.** |

### What this round cost, and who should know

`buildLights` is ~95% of a chapter-2 sim step, and its cost is (lights x rays x
walls). Two changes landed the same day and both push on it: the hall's furniture
becoming colliders (63 walls -> 100, note 1 above) and every robot gaining a skirt
pool (3 lights -> 6, from chapter 1's "spread a bit of light around the character").
Measured: **0.9 -> 1.83 -> 2.63 ms per cast**. Nothing is broken by it — the
in-browser budget at 60 fps is 16.7 ms — but two headless pilot tests needed their
wall-clock budgets raised, and if a third change lands on that path it is worth
range-culling walls inside `buildLights` before adding to it.

Checked while the colliders went in, because it is the obvious way this change
breaks something nobody was looking at: chapter 3's thirty-six visitors walk a lane
grid that runs 10-18 px from the new column feet. Over 60 s of sim after the crowd
has settled, **0 of 21 visitors moved less than 6 px** — nothing jams on a column.

One thing NOT changed, on purpose: the rope-line stanchions in the lobby are still
walk-through. A velvet rope on a 26 cm post is not something a player expects to be
stopped by, and a 4 px collider in the middle of the concourse would be an invisible
snag rather than an obstacle.

## Chapter 3 of the same bug — and the end of it

Played 23 Sep 2026, on the build that carried the thirty-seven ground-floor colliders. Two notes,
and they are the same note a third time: **"this cube is walk-through"** (a screenshot with a robot
standing on top of a block) and **"Entrance walls are still walkable"**.

Each of the three rounds was fixed where it was found; the CLASS was not, so the class kept coming
back. This round closed the class instead. The method is the chapter-2 one, generalised: a
throwaway probe (`tests/probe-*.test.ts`, gitignored) walks the **built** venue for both floors,
takes every mesh's world-space footprint, and asks whether a robot centre can stand in it. Nothing
is enumerated by hand — the scene graph is the list.

A drawn mesh counts as an obstacle if its underside is below 0.6 m (it is standing on the floor,
not hung on a wall or laid on a counter) and it fails if any cell of its footprint is both FREE (no
sim wall rect covers it) and REACHABLE (some robot can walk its centre there, `skipFor` honoured).

**Reachability has to open the gates.** Measured from the chapter's start alone, the sweep only ever
sees the rooms that are open on frame one — and behind a gate is exactly where a missing collider
hides longest. Cinema B is locked until Droid reaches the projector panel from Biggy's shoulders,
cinema E is jammed until Biggy charges it, the store is behind a roller door and the router cabinet
is cam-locked. The flood fill treats a wall with an `onHit` handler, or one of the gate kinds, as
open. That change alone turned up cinema E's screen — 2.4 m of it, no collider, in the one room a
player spends the end of chapter 1 in.

### What the sweep found, before

| Where | What | How many |
| --- | --- | --- |
| F1, all rooms but E | auditorium **seat rows** — the same bug as note 3, in the other eleven rooms | 179 seat instances measured walk-through in chapter 4 alone, plus cinema B's, which the probe cannot see from a chapter's start because its door is locked until the projector panel is thrown |
| F1, all rooms but E | the **cinema screens**, 2.4 m tall, standing 4 px off the end wall | 13 |
| F1, corridor | the **square corridor columns** and their knee-high plinths | 20 |
| F1, foyer | the **bar counter** and its three stools | 4 |
| F1, kiosk | the dark **counter slab** | 1 |
| GF, hall | sponsor-booth **totems** (2.1 m) and **flight cases** (1.05 m) — his "cube" | 12 |
| GF, hall | the **red accent panels**, 2 m tall, standing 1 px proud of the wall | 8 |
| GF, hall | the store's **wood back wall** and, in chapter 3 only, the **roller door** and the **router cabinet** (both were chapter-2-only colliders) | 4 |
| GF, lobby | the entrance's **door-bay mullions** and the three **leaves standing open** in them — his "entrance walls" | 7 |
| GF, lobby | the **BOF rooms' slat walls** (2.45 m) and their six workshop **tables** | 9 |
| GF, lobby | the **toilet partitions** | 2 |
| GF, forecourt | seven **bollards** and two **planters**, out through the open doors | 9 |
| F1, cinema E | the **screen** the chapter-1 mirror bounces off — found only once the sweep started opening the gates a chapter opens (see below) | 1 |

**After: zero** on both floors and all four chapters, bar the three declared exceptions below.

Every one of them was fixed the same way and it is the way CLAUDE.md already prescribes: the
geometry moved into `src/sim/geometry.ts`, and `src/render/venue/*.ts` draws the sim's wall list.
`floor1.ts` no longer owns the seating plan (`roomSeating()`), the screens (`roomScreen()`), the
corridor columns or the bar; `ground.ts` no longer owns the totems, the panels, the partitions, the
entrance frames or the forecourt. There is no second copy left to drift.

### The test that should make this the last round

`tests/colliders.test.ts` — **a drawn solid must be a collider**, checked against the venue's own
structures rather than a list of names, so adding a column to a grid adds a column that has to be a
collider. It is the deliverable, not the fixes: a fourth playtest should find none of these because
the suite does. Proved by mutation: a box added to `floor1.ts` out of the renderer's own numbers is
reported by name, position and the cell a robot can stand in.

Three exceptions, each explicit and each read out of `src/sim/geometry.ts` rather than typed into
the test:

- **staircases** — a flight, its landing, treads, nosings, cheek walls, handrails and well edging
  are floor you walk on. The sim's answer to "nothing in this game climbs" is a `stair-foot` wall
  across the bottom riser, not a solid staircase. Held **per floor**: the two levels share one
  1900x700 plan, and a single list quietly excused anything upstairs that stood over a stairwell
  downstairs — which a mutation caught before this shipped.
- **the auditorium rake** — the stepped floor under a seat block is the room's own floor; the seats
  on it are the collider, and the aisles are cut through both.
- **the rope-line stanchions** — Michele's own call from the chapter-2 round, now recorded as
  `LOBBY_STANCHIONS` beside the walls rather than as a comment in the renderer. The test asserts it
  **both ways**: if somebody ever gives them colliders, it says so, so the exception cannot go stale.

Still walk-through and knowingly so, under the first of those: the **door leaves standing open in
the two stair shafts**. They are inside the shaft footprint, which is why the exception covers them;
a robot on the landing can walk through a leaf. Worth a look next round, and not worth a 5 px
collider in a doorway this one.

### What this cost, and the debt it paid

`buildLights` is lights x rays x walls, and the wall lists nearly doubled — chapter 1 goes from
**98 walls to 179**, and its occluders (the solid ones, the only ones a ray is cast against) from
81 to 95. The note at the end of the chapter-2 round called this exactly: *"if a third change
lands on that path it is worth range-culling walls inside `buildLights` before adding to it"*. This
was the third change, it did land there, and the cull went in: `castPoly` now keeps only the walls
within the lamp's own reach, which cannot change a polygon because every ray is already clipped at
`range`. The suite went **58 s -> 20 s** — faster than before the colliders existed, and the
chapter tests pass untouched. One test-side helper needed the same treatment: `canWalk` in
`tests/geometry.test.ts` was cells x walls (9.6M distance checks a call at the new wall count) and
tipped over vitest's 5 s default on a loaded machine; it rasterises each wall once now, same answer.

Two gameplay checks, because a new collider can break a puzzle in silence:

- **chapter 1 stays solvable.** Every clue, every robot that has to light it, swept over reachable
  standing spots and twelve facings each: clue 1 orange 3121 / green 1182 spots, clue 2 orange 3411
  / blue 2964, clue 3 green 470 / blue 1102, clue 4 orange 204 / green 180 / blue 147. Room B's
  seats now mean Droid threads the aisle (he can: 470 spots inside) and Biggy floods over the seat
  backs from the concourse, which is exactly the hint the seat rows are supposed to give.
- **chapter 3's crowd still gets in.** It did not, at first: the entrance is one opening in the plot
  and three bays on the ground, and visitors aimed at any point across the 136 px run stood in a
  mullion for the whole chapter. They pick a bay now (`entranceBayGaps()`).

## Light and readability, 24 Sep 2026

Four notes, from screenshots rather than from one room. The brief that went out with them named a
prime suspect — the light skirt added a few hours earlier — and told the agent to measure it before
trusting it. Half right: the skirt owns notes 1 and 4, and the mechanism named in the brief ("it
lights the robot itself from below") was wrong, because an additive floor decal cannot light a robot
standing on it. The thing that was lighting the robot had been in the build for two rounds and
nobody had suspected it at all. Every number below is a pixel measurement off the build he played,
staged headlessly through `__afterdark.game.debug.place` and sampled with a PNG decoder, two builds
differing only in the change under test.

| # | What he found | Status | What it actually was |
| --- | --- | --- | --- |
| 1 | "Light is sometimes too much (3 is no longer legible)" | done | **The clue markers were drawn UNDER the light.** Arcs, pip and numeral are floor decals at `renderOrder` 0; `lighting.ts` draws its additive floor pools at 12. So every lamp in the room composited on top of the numeral, and the dark rim that carries the glyph was lifted to the same value as the glyph. Measured on the "3" with two robots standing on it: darkest pixel inside the numeral **L=214 of 255** — the rim was simply gone — for a Michelson contrast of **0.087**. The markers draw at 20/21 now, above the pools and above the fog mask, so they read the same on a black floor and under three lamps: **0.488**, and the two arcs are legibly orange and green again instead of white. The skirt (below) was making it worse, but it was not the cause: even with the skirt off the rim only came back to L=160. |
| 2 | "The selected characters becomes lighted and a bit ethereal, in particular droid. Maybe we can find an alternative highlight?" | done | **The x-ray ghost was painting the robot it marks.** The ghost is the rig's own geometry at `renderOrder` 1 with `depthFunc: GreaterDepth`, the robot's meshes at 2, which was supposed to mean "the ghost draws after the room and before the robot". It never did: three splits the draw into an opaque pass and a transparent pass and draws **every** opaque mesh before **any** transparent one — `renderOrder` only sorts within a pass — so a `transparent: true` ghost always drew last, and each part's ghost appeared wherever any nearer part of the same robot had written depth. Droid alone in a corridor, ghost off vs on: torso **L=109 -> 149**, shins **57 -> 93**, and the "cinema · closed tonight" sign four metres behind him read straight through his legs. Fixed by making the ghost material **opaque**: the pass order then does the work by itself, the ghost appears only where the venue is in front, and with no blending it composites to one flat silhouette — which is what he asked for two rounds ago ("show the silhuette, not this thing"). Same bug, same fix, on the active ring's ghost, which was painting a third of its colour across the feet of the robot it circles. |
| 3 | "Droid light is oddly pointing somewhere else?" | done | **Only while he is riding Biggy, and it is the drawing, not the lamp.** Not a stale `face` — his lamp is a pool and a pool has no direction. `syncMount` puts a mounted Droid at `bg.y - MOUNT_OFFSET_Y`, six sim px **north** of his carrier: the prototype's flat-canvas way of drawing "up on the shoulders". This renderer already draws that in the axis it belongs in (`mountLift()` metres of height), so the offset was counted twice and Droid was drawn **0.48 m behind his own light** — ~30 screen px at chapter 1's zoom, on a pool that is meant to be centred under him. Measured: rig at sim y **394**, lamp at **400**. `buildLights` emits a mounted lamp at the carrier's position and that is untouchable (it would move the polygon the clue rule tests), so the renderer adds the offset back out where it introduced it. He also sits on Biggy's axis now rather than half a metre back, which is the same line. |
| 4 | Whole areas of floor blowing out to flat colour (implicit in the screenshots) | done | **The light skirt, and this one was the suspect.** `SKIRT_RANGE` is a 1.9 m pool of a robot's own colour at its own feet, added so he could light a clue he was standing next to — a real fix for a real complaint. But it was *drawn* like any other lamp: a full-strength additive floor pool with its hot spot exactly on the floor the robot stands on, and a volumetric wedge whose apex is the robot's own lamp 1.95 m up — at a 1.9 m rim that wedge is a tent pitched over the robot's body. Measured around two robots on a clue: clipped-channel pixels **6.4% -> 28.4%** with the skirt on; Droid's chest **L=126 -> 172** with green at **208 of 255**. The skirt now has **no wedge at all** and its floor pool is an **annulus** — dark under the robot's own footprint, full at 58% of its range. Same area after: **1.0% clipped** at the same mean scene luminance (93.7 -> 93.5). |

### What the skirt kept, and why it is not a nerf

The sim side of the skirt is untouched: same 24 px range, same 18 rays, same polygon, so `clueLitBy`
and `clueLit` cannot tell that anything happened and `tests/chapters.test.ts` passes unchanged. The
only sim-side edit is a `skirt: true` label on the `LightSource` so the renderer can tell a spill at
a robot's feet from a beam thrown across a room.

What changed is the *drawn* radial profile, and it is brighter, not dimmer, everywhere a
neighbouring clue actually is. At the clue in his own screenshot — 20 sim px from each robot, 83% of
the skirt's range — the annulus is **2.8x** the old value, because the old smooth falloff had spent
nearly all of itself by then while the annulus is still on its way down from full. It is darker only
inside 0.58 m, which is the robot's own footprint: the patch where the numeral is written and where
its own shell was catching the bounce.

### Still weak, on the record

- **The three-lamp overlap still clips.** Chapter 1's opening frame has all three cones crossing in
  the corridor and that patch is still a white hole. It is `MIX_HEADROOM`'s job, not the skirt's,
  and it was not in these four notes — but it is the one place left where "light is too much" is
  still true.
- **The chapter-opening frames are too noisy to measure with.** Three captures of the *same* build
  at `?chapter=2&warm=60` gave mean scene luminance 7.5, 12.0 and 13.4: `--virtual-time-budget`
  does not pin the number of frames, and chapter 2's mood ease and the fog-of-war memory both run
  on elapsed time. Every claim above therefore comes from a staged scene with the robots placed and
  the camera settled, not from an opening shot. Anyone quoting a luminance off a `warm=60` frame
  should capture it three times first.
- **A robot behind a solid wall now shows a solid silhouette** rather than a half-transparent one.
  It only ever happens to the robot you are driving, which the camera is following, so in practice
  you see it through pillars and signs rather than through walls — but it is louder than it was.
- **`syncMount`'s six-pixel offset is still a trap.** The renderer takes it back out now, but a 2D
  "up" expressed as a y offset in a 3D game will catch the next person who reads `bot.y` for a
  mounted Droid. It belongs in `bot.ts` as a flag rather than as a displacement.

### Also fixed on the way past

Building the ghost used to stamp `renderOrder = 2` onto **every** mesh in the rig, transparent
overlays included — so the first time you drove Voxxy, her additive eye glow lost the order
`voxxy.ts` sets for it deliberately ("`renderOrder` puts it after the glass it floats 6 mm in front
of"). The ghost is built from opaque shell meshes only now, so the glows keep their own order.


## Ideas he raised

- **Voxxy as the only robot that can jump.** Not yet decided. There is an obvious home for it: the
  seat rows in cinema E are already `low` walls that light crosses but robots cannot. Voxxy hopping
  them would explain the aisle and give her a verb of her own, alongside Droid's climb and Biggy's
  charge.
- **A fourth light colour for the clue mixes** — raised and rejected by him in the same breath
  ("that's too much"). The arc ring solved it without one.

## The decision that unblocked three of them

Notes 9, 10 and 11 are three different complaints with one cause: the frozen physics constants
describe a bigger, faster world than the one on screen. `units.ts` carried a second scale,
`HUD_PX_PER_MPS`, whose only job was to stop the HUD quoting Voxxy at 23 m/s. Asked to choose,
Michele authorised a **full rescale of speeds and radii** — the first time the frozen constants have
been opened, and on the evidence of a playtest rather than a preference.

**Done, 23 Sep 2026.** `SPEED_SCALE = 0.25` on every px/s quantity in `src/sim` — Voxxy 5.8 m/s,
Droid 2.3, Biggy 4.7 — and the collision radii measured off the rigs the renderer builds: 0.38 /
0.50 / 0.72 m against 0.72 / 1.04 / 1.36. `PUSH_REACH` went from 0.96 m of empty floor to 8 cm of
contact. `HUD_PX_PER_MPS` is gone: there is one scale now, and the HUD reads the same metre the
walls are built in. Her coast after the stick lets go is 0.55 m instead of 2.60 m, which is note 10.
Details and the traversal cost in `docs/scale-and-units.md`.

Note 18 is now unblocked and still open: the secondary-staircase niche was to be sized *after* the
radius rescale, and the rescale has happened — Biggy is 1.44 m across in the sim now, not 2.72, so
a 3.2 m passage has more slack than Michele wanted, not less.

---

# The backlog

Michele, 24 Sep 2026: *"Are you keeping track of all those 'later' polish?"* Partially, and not well
enough — deferrals were living in chat replies and in agents' own "still weak" lists rather than in
one place. This is that place. Nothing here blocks a playthrough; everything here was either
deferred by him, deferred by me with a reason, or reported by an agent as knowingly incomplete.

His standing priority, 23 Sep: **"Priority is making it playable and finishing all chapters"** —
so anything marked *looks* waits behind anything marked *plays*.

## Plays — mechanics still owed

| item | who raised it | note |
| --- | --- | --- |
| Wire the tow bar into chapter 2 | Michele — *"pushing biggy is really really hard"* | `src/sim/tow.ts` is written, tested and committed **unwired**. Needs a key binding, the chapter hookup, and a visual for the bar — the 2D experiment it was ported from has no debug rendering of the grab either, so that part is invented. |
| Replace the cam-lock wheel with the WiFi password beat | Michele — *"too cryptic... I'd switch for a simpler password game"* | Agreed design: Biggy throws the breaker, a terminal asks for the password, and it can be typed from memory (**DevoxxForever**), read off a poster by Voxxy's narrow beam, or read off the router by Droid standing on Biggy. Removing the wheel removes its choreography tests with it — expect the test count to fall, and that is correct. |
| Narrow the cinema-E aisle so Biggy genuinely does not fit | Michele — *"Biggy can now walk the aisle... the whole point was he cannot"* | **Caused by my rescale**: his collision radius went 1.36 m -> 0.72 m and the aisle was sized against the old one. He asked for the geometry to match the rule rather than the rule to be re-asserted. |
| The keypad will not take digits from Voxxy or Droid | Michele — *"I don't seem to be able to activate it. imanaged with biggy"* | I read the code, saw digits route to the pad when a robot is parked there, and **declared it fine without testing it**. He then hit it again. Drive it headlessly, do not read it. |
| Move the minigames from chapter 2 to chapter 3 | Michele — *"the hall is still closed at the moment"* | Correct: the booth games are in a hall nobody has opened yet. |
| Voxxy's jump | Michele's idea, scoped down by him to *"just for one quiz. And for jumping around for fun"* | Natural home: hopping the cinema-E seat rows, which are `low` walls light already crosses. Gives her a verb of her own next to Droid's climb and Biggy's charge. |
| The OutOfMemoryError beat | designed, never built | He asked to see it before approving. Design in `docs/gameplay-additions.md`. |
| Robots do not stand on the ground floor's raised lobby or its stairs | agent, cutscene round | `groundRiseM(x)` exists in `geometry.ts` *for this*, its own doc says the renderer reads it, and **nothing reads it** — so a robot on the lobby plate stands half a metre inside it and one on the main flight is swallowed. This is why chapter 3's transition walks into a staircase. |

## Looks — deferred by him, explicitly

| item | who | note |
| --- | --- | --- |
| Climbing and descending animations | Michele — *"keep them for next rounds / if we have time"* | |
| Door opening animation when the code is entered, then the transition | Michele — *"this also can wait, but keep track"* | The jammed door already falls; this is the fire door. |
| A better-looking breaker enclosure | Michele — *"fine for now... Maybe with red halo to signal it's interactive"* | His idea generalises: **one visual language for interactive props** would replace the projector panel, the duck target, the cam-lock and the keypad all being individually hacked into visibility. |
| Biggy's lower body is still squarish | Michele — *"a bit better, but still squarish. We can address it later"* | Trousers and undercut are now swept lathes; the belt plate is still a flat slab and there is a sawtooth where the undercut meets the right leg. |
| Droid sitting on Biggy reads well only from some angles | Michele | |
| Voxxy's arms are frenetic at speed | Michele | Gait amplitude, not speed — she is at the speed he approved. |
| The HUD stays up through cutscenes | agent | The objective paragraph, three robot chips and a live speed meter sit over a shot meant to be a beat. |
| The secondary staircases are in the wrong place | Michele, with drone footage | They are lateral in the real hallway; he marked the descent direction on the photo. |

## Structural — nobody asked, but they will bite

| item | note |
| --- | --- |
| `rig.ts`'s `weather()` brightens dark materials | It writes vertex colour as a *ratio* against the material's own colour, so a rust tint on a near-black part divides a light colour by a dark base and "wear" comes out as white flakes. Biggy works around it locally; **Voxxy and Droid almost certainly have it on their dark parts**. |
| `buildLights` is ~95% of a chapter-2 sim step | 0.9 -> 2.63 ms per cast across today's two changes (colliders, and the skirt doubling the light count). Fine against a 16.7 ms frame, but the next change to that path should cull walls outside a light's range first. |
| Four helper sets want promoting to `rig.ts` | Three agents independently wrote their own: a UV-carrying patch, a clearcoat material, a surface kit (seams, bolts, revolve mounts), a bellows. `rig.ts`'s `boltRing` also aims rivets with a sphere's normal, which tilts them visibly on a lathe. |
| `gaitSpeed`'s `tanh` compression | The surviving cousin of the deleted `HUD_PX_PER_MPS`: it existed so a 23 m/s robot's legs did not blur. At 5.8 m/s it barely does anything and is probably removable — one more fudge out of the submission. |
| `CUT_WALK_SPEED` is dead | The cutscene rewrite made walks duration-driven. Still exported, scaled and asserted; nothing reads it. |
| Crowd and prop radii are the generous ones now | A conference-goer is 0.8-1.28 m wide and the cake crate is 1.36 m, sized when the robots were twice their current width. |
| Chapter 4 runs about six minutes | Correct preservation of its difficulty through the rescale, possibly the wrong *shot*. The fix if playtesting says so is a run key or a smaller room, not re-tuning the clock back. |
| `tools/progress/shots/` is 50+ MB | Prune before submission. |
