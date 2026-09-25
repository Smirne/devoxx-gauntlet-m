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
| 14 | "lighting on south room is odd. I should be able to see the seats" | done | Fixed by #3, as suspected: the seats were not dim, they were **not drawn**. Re-looked 25 Sep 2026 with the three robots parked in cinema E (`scratchpad/shove/roomE.png`) — five rows read clearly under all three lamps and the clue ring, with the row edges catching each colour. No lighting change was needed or made. |
| 15 | "reduce the black block, make it into a glass wall or something to show the circle better" · and again: "the black bench(?) has to go, for a glass wall as suggested before" | done | Not a bench. The kiosk's own **fascia**: `floor1.ts` drew it as a 60 x 60 px plate laid flat at 2.15 m — a LID over the whole kiosk, 4.8 m square, and unlit from a 30 deg camera that is exactly what a black block looks like. It does not stand between the camera and the clue, it **shades** it: A/B on one build, the ring's box measures mean 39.1 with the lid and 43.5 without, brightest arc pixels 128.8 against 174.1. The counter he guessed at costs 43.8 vs 43.5 — nothing — and is gone anyway because he asked for it. Four 3 px fascia bands now, top open. The glazing was already `glass: true` in the sim and needed no change. **Not all of the ring's improvement is this change**: his build measured 5.8 mean in that box, and most of the climb from there is the concurrent clue-and-lighting work in the same tree, not the kiosk. |
| 16 | "those two are maybe too near to each other?" | open | Two clue spots. |
| 17 | "I put all three robots in the room... needed different tries before finding the number" | waiting | His call: try the new arc markers first before adding more help. |
| 18 | "they seem fit for biggy to pass, make the passage more narrow" | done | The plan decided how narrow. `plans/devoxx-rooms-stairs-annotated.png` draws the flight 20 plan px wide against the corridor's 147, i.e. 17.7 sim px = **1.41 m** (`NICHE_MOUTH`). Biggy is 1.44 m across, so the real stair excludes him by a centimetre. **Re-cut 24 Sep 2026 (evening).** The flight turned out to be one staircase with a half-landing rather than a landing with a descent either side, so the way on moved from the middle of its long face to its east END, and the old pinch — two runs 17.7 px apart — went with it. What keeps Biggy off now is the balustrade the plan and Michele's photo put along the open face (`NICHE_RAIL`): the head is a pocket 16.2 px = **1.30 m** clear between the corridor wall and the rail, entered by turning in off the corridor. A driven probe caught the gap between the two (`tests/stairs-driven.test.ts`); the flood fills did not. |

## Chapter 2

Played 23 Sep 2026, on the build that already carried the speed rescale. Nine notes;
the pattern in them is the same one chapter 1 kept producing — **the renderer knows
about things the sim does not**, plus two cases of a control being drawn as a
featureless box.

| # | What he found | Status | What it actually was |
| --- | --- | --- | --- |
| 1 | "robots can go through staircase and objects" | done | The sim had never heard of most of the hall's furniture. A throwaway flood-fill probe (`tests/probe-*.test.ts`, gitignored) measured **100% of every footprint walkable** for: both secondary staircases, all 18 structural roof columns, 4 lobby columns, 2 planters and the network rack — every one of them drawn by `src/render/venue/ground.ts` out of its own loops. They are `GF`/`groundWalls()` geometry now, so the picture and the collider are the same object. Same bug as note 3 above, one floor down. |
| 2 | "In devoxx the stairs are not open but look like rooms" | done | They are rooms — `plans/exhibition-floor-simple.png` draws each secondary stair as a **walled shaft** with the ascent arrow running away down the middle. Ours were open flights climbing the wrong way. Now: shell, a deep walkable landing at the plan-north (world west) end, and the flight east of that. **Corrected 24 Sep 2026 (evening)**, on *"you put the opening north, but it's on the sides (WEST, EAST). Worth a fix."* — the doors are a pair of double doors in EACH of the shaft's two LONG faces beside that landing, and neither short end carries a door symbol at all (counted face by face on the drawing, see `stairDoors`). The building's west and east are the rect's long faces because this floor is rotated 90°. The flight is also two ramps with a half-landing, not one run. The chapter's start moved onto the landing with them. |
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
is shut until Biggy shoulders it open. The flood fill treats a wall with an `onHit` handler, or one of the gate kinds, as
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
| Voxxy's jump | Michele's idea, scoped down by him to *"just for one quiz. And for jumping around for fun"*, then approved outright on 24 Sep: *"Voxxy jump: let's make it. I'd keep E, when no other action is available."* | Natural home: hopping the cinema-E seat rows, which are `low` walls light already crosses. Gives her a verb of her own next to Droid's climb and Biggy's charge. His `E` ruling settles the other open key question too — *"Why space and not e for catching? I'd keep it to one key"* — because both the jump and the tow grab become the same fallback: the chapter's own `key()` gets first refusal, and what it does not consume falls through to grab-or-jump. |
| ~~Biggy should roll~~ **done, narrow read** | Michele, 24 Sep — *"ah Another thing to handle later. Biggy should really roll, at least when he's pushed!"* | Built 25 Sep as the narrow read, render-side only: `applyShove` in `gait.ts` tips his whole body about the floor between his boots, with the lid and the stubby arms lagging behind it, and the angle integrated from DISTANCE so it has one period per revolution of a ball his size rather than a period per second. **The rig could not spin the gut itself**: `torso` parents the belly shell, the hatches, the bumper, the shorts, the belt, the vents, the seam ring *and* the neck and helmet, so a literally rotating gut means re-parenting a signed-off model. The wide read — rolling resistance instead of the flat `drag` he shares with the others — is still a frozen constant and still his call. What this round actually cost was the **gate** — deciding when he is being pushed at all. The first version read "the stick is empty plus a positive acceleration"; measured, a 0.35 s tap and release fired **61% of a full roll** and took a second to fade, because the gait's acceleration is a 1/6 s low-pass and stays positive after the stick drops. The sim already knew the answer and kept it private (`stepAim`'s `driven`), so it is published as `worldMoved` and the renderer asks instead of guessing. `tests/shove-roll.test.ts` fails on the old derivation. |
| Chapter 1's mirror puzzle plays off camera | Michele — *"since the 3 color room mechanic is reflecting on the screen, but the screen is not visible in this angulation, could we move the puzzle on the upper line?"* | **This was living in chat only and was nearly lost.** The bounce off cinema E's screen is the feedback for the whole puzzle and the fixed camera does not show the screen. Moving the puzzle to a top-row room turns the screen toward the camera; the alternative is re-pitching that one room's camera. His suggestion is the cheaper of the two. |
| Robots do not stand on the ground floor's raised lobby or its stairs | agent, cutscene round | `groundRiseM(x)` exists in `geometry.ts` *for this*, its own doc says the renderer reads it, and **nothing reads it** — so a robot on the lobby plate stands half a metre inside it and one on the main flight is swallowed. This is why chapter 3's transition walks into a staircase. |

## Measured, and waiting on Michele

Two findings from the beer-bar round, 24 Sep. Both are measurements rather than opinions, and
both change something he has already ruled on, so neither was acted on.

| finding | the measurement | why it was not fixed |
| --- | --- | --- |
| **Chapter 3's catering gate leaks.** He said of the queue blocking Biggy from the soup: *"That is a good gate and it stays."* It stays — but it is not the gate the chapter's own text describes. | Flood fill at Biggy's frozen `r = 9`, every queue person a solid disc: the catering doorway is 44 px, so his centre may be anywhere in a 26 px band. The two files of the queue stand 10 px apart, leaving **11 px of clear centre line beside them with the queue shut** — enough for him to drive straight in. Clearing a queue widens that to 27 px. Nearest reachable floor to the soup station with the queues standing: **25 px, against a `POT_REACH` of 70**. He can fill the pot without Voxxy saying a word. | The one-line fix is to stand the queue's two files across the doorway's width instead of 10 px apart. That changes the soup's difficulty, which is his call, and the chapter-3 choreography in `chapters.test.ts` is tuned around the current spacing. `tests/beer-bar.test.ts` asserts the true thing — clearing a queue *widens* the doorway — and says in a comment why it does not assert the sealing a reader expects. |
| **`beerDone` needs all six crates.** | A heap error scatters the crates 12–15 px, so in every driven run they have all been recoverable. Nothing prevents one ending up shoved under a booth, and then the chapter cannot be finished without finding it. | Either the gate drops to five, or a stranded crate gets a way back. Both are design choices. |
| **Chapter 1's clue-4 marker, in cinema E's alcove, is invisible on screen.** Only the floating pip shows. | Checked against the pre-change baseline: it was already invisible, so this is pre-existing and not a regression from the halo round. The marker rings are occluded by the alcove's own geometry, and the skirt does not rescue it either — Voxxy wedged in a 3.2 m pocket has nearly every ray clipped, so the halo collapses. The sim's light still reaches the clue; only the feedback is missing. | This is **the one clue Michele said he could not solve**. It wants a round of its own, not a patch. |
| **The clue marker is now 2.16 m across**, up from 1.24 m. | It fits the alcove with 0.36 m of clearance and reads well at distance and at play zoom in the frames taken. | It is a noticeably bigger piece of floor UI and a human should look at it before it is called done. |
| **Droid's halo is 25% brighter** in the 10–22 px band. | A side effect of his skirt finally drawing at all — his lamp is a pool, so he was the only robot who had a halo before, and now he has both. | He had blessed the previous look. `SKIRT_PEAK` is the single knob if it now reads as too much. |

## Plays — closed since this list was written

### The tow bar is wired (23 Sep)

Space takes hold of Biggy and lets go again, everywhere, in all four chapters. The bar snaps to
one of eight compass directions; stick along it drives, stick across it walks the holder round to
re-aim, pulling back for 0.2 s lets go. The renderer draws the bar between the pair and a lane
strip on the floor ahead of Biggy, in the holder's lamp colour.

Measured on the chapter-2 roller-door lane, with the pusher started off the centre line by the
amount a player misses by when lining up by eye:

| pusher off the line | free push: drift / top speed | tow: drift / top speed |
| --- | --- | --- |
| 0 px | 0.00 px / 78.8 | 0.00 px / 71.7 |
| 2 px | 49.4 px / 38.8 | 0.00 px / 71.7 |
| 4 px | 41.7 px / 24.2 | 0.00 px / 71.7 |

Two pixels — a sixth of Voxxy's diameter — is the difference between opening the roller door and
not reaching half its threshold. Wiring it up found three things wrong with the ported file, all
recorded in `src/sim/tow.ts`'s own comments: the ported speed cap was slower than Biggy walking,
`stepBot`'s clamp undid the tow every frame, and the eight-direction quantisation stopped applying
after the first re-aim. Tests: `tests/tow.test.ts`.

**Left open deliberately.** The grab direction is decided by where the holder is standing, and
beyond about 6 px off the line it snaps to the next eighth — a diagonal — rather than the lane the
player probably meant. The lane strip shows this before the run starts, so it is readable rather
than surprising, but if it reads as fighting the player in a real playthrough the fix is to aim the
bar with the stick at the moment of grabbing instead.

### Four more closed, 24 Sep

Michele, this round: *"Remove the wheel, too complicated."* and *"OutOfMemory, yes build it."*

| what | outcome |
| --- | --- |
| The cam-lock wheel | Gone, and the WiFi password beat is in its place. Biggy shoulders the router cabinet open; the password is typed from memory, read off a sponsor poster by Voxxy's narrow beam, or read off the router's own label by Droid on Biggy's shoulders. |
| The OutOfMemoryError beat | Built, as a morning beer delivery for that evening's party rather than drinking at breakfast. Four crates is Biggy's stack; the fifth throws a JVM trace and scatters the lot at his feet. Recovery measured at 5.8 s, which is a joke rather than a punishment. |
| The chapter-1 keypad | Fixed at the root. The code's alphabet is 4-9 now, so no key it needs can also be the robot switcher — which is what made it read as dead just outside reach, and why Biggy (biggest radius, biggest reach) was the one it worked with. Backspace added; the rejection speaks in the robot's voice. |
| Cinema E's aisle | 2.4 m -> 1.2 m. Droid keeps 10 cm either side, Biggy is 24 cm too wide. Measured: driven down the lane with a 3 px aim error, Voxxy and Droid reach the screen and Biggy stops at the back rows. |

**And one thing that fell out of narrowing the aisle.** The end-to-end chapter-1 solve had Biggy
teleported beside the alcove — a spot no player could walk to once the aisle was a real aisle.
The test was green and describing an unplayable solution. It now places him at the front of the
house, pointing his flood at the SCREEN: cinema E's screen is the chapter's mirror, and the bounce
is how blue reaches a clue Biggy can never stand next to. That is the beat the room was designed
around and no test had ever described it. `tests/aisle.test.ts` now measures clues against
*reachable* ground rather than placed poses.

### The booth games are in chapter 3 (24 Sep)

Michele: *"Minigames should be in chapter 3"* — *"the hall is still closed at the moment."*

There were **three**, not two: the duck shuffleboard, the top-shelf sticker, and a Regex Racing
lap. And chapter 3 was already running them — it imported the whole set from chapter 2 and called
it. So what actually changed is that **chapter 2 lost them**: no booth props, no swag, and `E` at
the dark Sticker Mine is now an ordinary nothing-here. Nothing was cut. None of the three depended
on the hall being shut; all three depended on it being open, which is his point exactly.

Two seams closed on the way in: the sticker refusal was one sentence with the name swapped, and is
now two lines in two voices; and a Regex lap the player never meant to start now expires in
silence. Brushing marker 1 on an unrelated errand started the clock and announced the failure
twenty seconds later — one marker is a brush, two is a decision, so the toast is gated on the
second.

`mkBody` moved to `src/sim/bot.ts` at the same time. It had lived in `ch2-expo.ts` only because
chapter 2 happened to need a loose body first; once the games left, chapter 2 stopped using it
altogether and two other chapters were importing a physics helper across a chapter boundary from
a chapter that did not use it.

## The ground floor against the plan — Michele, 24 Sep, queued

His chapter-2 playthrough was mostly a **sense-of-place** audit of the lobby, and every point below checks
out against `plans/exhibition-floor-stairs-annotated.png`. **His priority, given 24 Sep: *"YEs staircase and reception right is priority 1. BOF can come later or be
accepted."*** So the order is (1) the main staircase facing the entrance and reception's shape and sign,
(2) everything else, (3) BOF last, and BOF may simply be accepted as it stands. Queued rather than in
flight because `src/sim/geometry.ts` is held by another agent this round. Ten points of the score are sense of place,
and the venue is one of the two things `CLAUDE.md` says may not drift.

| his note | what the plan says |
| --- | --- |
| *"Stairs should be facing the entrance. As i enter i see stairs going straight up."* | Correct. The main staircase sits directly inside the main entrance and runs away from it. Ours does not face the door. |
| *"Coat room / Wardrobe opening should be west."* | To be set against the plan's reception block when the rework starts. |
| *"Reception i don't get it. There's a wood panel longer than the room. If it's the counter it should be lower, a half square, two sides (west and south): and it should be hollow inside. The printer might be on the reception counter, so no need to enter?"* | The counter is drawn as one long slab. He wants an L of two runs, hollow, at counter height, with the printer ON it — which also removes a reason to walk inside. |
| *"Reception signal points the wrong way."* | The plan marks reception WEST of the main staircase; our sign points the other way. |
| *"I think BOF is a single room and a bit longer, check the plan."* | Correct — the plan draws BOF as one room, east of the staircase. Ours is split. He will accept two rooms if one is too big a change, but not the current shape. *"There's the wood thing also here, so probably it's not the counter? This one is flickering."* — z-fighting to fix either way. |
| *"Toilets are just on the west side, but it's not an important details. Cover it up."* | Plus a beat he offered: *"Wow, no queue"* in chapter 2, an actual queue and unreachable toilets in chapter 3. |
| *"Main door should be closed, no going out in chapter 2. Not necessary in chapter 3 either, but we can keep it for flavour."* | Closes the forecourt, which an agent already flagged: robots can walk out into nothing at night. |
| *"Robots light should go off when light is on."* | Once the hall is lit, the lamps are pointless and the mixing puzzle is over. |
| *"this element before reception is not needed."* | The dark slab in front of the counter in his screenshot. |

## Michele, 24 Sep late — the night list

| his note | state |
| --- | --- |
| *"sometimes the toast are multiple and not all are visible. Assure they do not superimpose."* | **Done** (`0f72c59`). Two faults: the shared `ad-rise` keyframe ended on `transform:none` with `fill-mode: both`, which permanently cancelled a bubble's `translate(-50%,-100%)` anchor — every bubble jumped half its width right and its whole height down once it settled — and nothing separated two bubbles whose boxes crossed. Bubbles now have their own keyframes, and `placeBubbles` lifts each box clear of the ones already placed, lowest first. |
| *"the stair, reception and wardrobe appearence still need fix"* | **All three done.** Reception and wardrobe in `e4c1abe`; the staircase on 25 Sep 2026 — see "the main staircase faces the wrong way" below. |
| *"where is the wifi password graffiti? It should be visible!"* | **Done** (`1366d1f`). It was sim-only: chapter 2 publishes it as a `poster` prop and the prop style draws every poster as a pale cream lightbox, so no paint existed. The venue paints it now, at the prop's own x, low-glow orange on a dark ground. Found on the way: the printed WiFi notice hung at y 371, **inside `GF.coatroom`** (262..384) — a sign nailed up in a closed room. Moved onto the reception counter's west run. |
| *"when all actions are done, chapter 2 ends abruptly. I just finished the biggy run, i expected to see the animation and the inside of the gadget room. Since u can finish in different orders, give some seconds for animation / see what happens before the chap 3 screen."* | **Done.** It called `startChapter(3)` on the frame the second of the two conditions flipped, so the shutter was still 0.42 s from the top of its housing when the card came down over it — whichever task you finished last, you never saw it finish. The chapter now stays live for `CURTAIN` = 3 s after the last one lands, and **play is not taken away**: the robots keep their keys, the hall is lit, the store is open and standing there. *"See the inside of the gadget room"* means being allowed to look, which a fade could not have given him. The clock starts on the frame BOTH are true, so it is the same three seconds in either order, and the curtain line names whichever task ended it. `tests/ch2-chain.test.ts` drives both orders. |
| *"some flickering lights (hard to show on screenshot)"* | **Queued**, not yet reproduced. Two known causes in this repo are coplanar surfaces (the entrance flicker, `lobby()`) and dashed arcs that crawl; a third to check is the new `riseForBody` blend at a plate seam. |
| *"Am I putting too much thing together on the backlog?"* | Fairly asked, and the honest answer was yes: fifteen items open, and the session before this one went on crates, the intro and bubbles — none of them on his stated priority 1. |

### The main staircase faces the wrong way — DONE 25 Sep 2026

Michele: *"Stairs should be facing the entrance. As i enter i see stairs going straight up."*
`plans/exhibition-floor-stairs-annotated.png` settles it: the main staircase is drawn **directly
inside the main entrance**, its treads running across the width of the block and one arrow climbing
**away** from the doors, with reception above-left of it and the BOF rooms to its right. Both of
those we already have right — reception IS west of the staircase in our plot, which is what his
*"Reception signal points the wrong way"* note is about (the sign, not the block).

What is wrong is the face you enter from. Ours climbs **north over its 197 px length**, entered
through a 112 px gate on its SOUTH face. The plan has it entered from the **entrance side — world
EAST** — climbing **west** over its 112 px depth, 197 px wide. So the footprint stays exactly where
it is; the flight's axis and its open face turn 90 degrees.

Deferred once, then done in one commit on 25 Sep 2026 — Michele: *"You really don't wanna fix that
main stairs, eh?"* Fair. Re-measured from scratch off the same drawing before touching anything:
the tread lines run plan-east–west across x 308..511 over a 70 px depth, the ascent arrow sits at
x 410 with its head at y 976, pointing plan-NORTH, away from the Main Entrance at the plan's bottom
edge. The quarter turn this repo applies to the plan makes that a climb to **world west**, entered
from the **east**.

What moved with it: `groundPlates()`'s main flight is `axis: 'x'` now; `GF.gate` is a north–south
rect on the east face; `stairFlight`'s `dir` went `'+z'` to `'+x'` and its step count 16 to 24,
because the run is 8.96 m instead of 15.76 and 16 steps over it is a 31 cm riser; Stephan stands at
the opening in the barrier rather than at the middle of the old rect; the exit cutscene climbs west
through that opening.

**And the turn changed what the gate IS.** There are 55 px — 4.4 m — of concourse between the new
gate line and the glazed entrance wall, and the barrier is 197 px long. A leaf that length had
nowhere to swing that was not inside the glass or buried in the treads. Which is the building
saying what it actually is: nobody hangs a 15.7 m barrier on one hinge, a stair that wide is closed
by a run with **one gate in it**, and that is what Stephan has been unhooking in the text all along.
`GATE_MOUTH` is the opening, `gateDraw` reads the rect's long side for which way the run lies, and
the barrier either side of the mouth stays standing as `gatebar` walls — not `gate`, because
`openness()` reads that kind to decide whether the barrier is still sealed and two runs under it
told the renderer the gate had never opened.

### The reception block, done (`e4c1abe`)

- The counter is **two `COUNTER`-deep runs** closing the west and south faces, hollow in the middle,
  entered from the north-east corner beside the stairs — the only corner that can open, with BOF
  north and the staircase east. It was one solid 126x75 slab, which is exactly why it read as *"a
  wood panel longer than the room"*.
- The **printer sits on the south run**, so chapter 2's cable ends somewhere a robot reaches from
  the concourse and nobody walks behind the desk.
- The **wardrobe hands out over its west face**. It used to hand out SOUTH, into the back of the
  reception desk, where nobody can stand. Its dressing turned with it: the wood-slat back wall is
  the east face now and the rails run north-south, down the length of the view rather than end-on.
- `tests/reception.test.ts` holds both shapes, interior included.

Still open on that block from the 24 Sep list: the sign direction, and *"this element before
reception is not needed"* — the dark slab in front of the counter, which I could not identify from
the note alone and will ask about rather than guess at.

## Michele, 25 Sep — playing Version 30

Version 28 never started (the bundle was never uploaded with the page; see `GAUNTLET.md`), so
this is the first real play of the night's work.

| his note | state |
| --- | --- |
| *"I'd leave out the robot name here (moreover some task need multiple robots). That's already a big hint"* | **Done.** Worse than a hint: `Task.who` was one kind filled from `need[0]`, so a two-colour mix displayed one robot — a wrong answer. `who` is a list now, the chip is gone, and `H` names every robot a task needs. |
| *"esc ok click outside should close the panel"* | **Done.** The sheet takes pointer events back from the `pointer-events:none` overlay, or a click on it would land on the canvas and close it. |
| *"Colours are a bit off: Droid and biggy are whitey-grey"* | **Done.** One gain per rig instead of a per-panel target — see below. |
| *"I'd zoom a little bit to make robots and crates bigger"* | **Done**, after finding the rect was never what decided it — see below. |
| *"I'd remove this: and add it to the panel on I. The bar stays only with key reminders?"* | **Done.** The briefing is in the run sheet; the bar carries the chapter name and the keys. |
| *"we lost the intro text. We should display it somewhere. Maybe animation, transiction to game, popup appears?"* | **Done**, and that is exactly the shape: the sheet opens itself once per chapter, the first frame of play after the transition, and Esc / a click / `I` close it for good until the next chapter. |
| *"This also can go, it's the old version of the meter"* | **Done.** `GameSnapshot.progress` is no longer drawn. The field stays: several chapter tests read it as the chapter's own state line, and those are sim assertions that would be lost. |
| *"runsheet should also have the commands recap"* | **Done**, at the foot of the sheet. Still on the top bar too — there it is a glance, here it is a read, and the panel is where a player goes when they do not know what to do. |
| *"when showing the element, the glow is fine if it's in the view. If it's outside, there should be something pointing at it"* | **Done.** Off screen the ring becomes a chevron pinned to an inset border, rotated along the line from the middle of the frame to the UNCLAMPED point — clamping first would have every edge arrow pointing along the edge. |
| *"wifi password: when lighted by a robot for the first time, that robot could have a toast, 'Oh yeah, that password..'"* | **Done.** It narrated what the beam found, which is the camera talking; it opens on her reaction now. |
| *"also the 'this one is mine' hint does not work too well when multiple robots are involved"* | **Done** with the `who` list: *"Voxxy (1) and Droid (2) — this one takes both of us."* |
| *"Robots still go through the handrail in the chapter transiction"* | **Open.** Queued since 24 Sep. One waypoint through the 1.30 m pocket, plus an assertion that no cutscene leg crosses a wall. |
| *"there might be also intermediate challenges (eg: open the door for clue 3 with Droid and biggy). They might need a clue too?"* | **Open.** The shape that fits: let `Task.hint` be a LIST, so `H` walks several lines before the ring and a chapter can publish the intermediate step as its own clue without adding a row to the sheet. |
| *"There's a light on the crates, robot exit fully visible. Light (emergency light?) flickers and stops, robots light up -> transition to game"* | **Open, and it is the right answer** — see below. |
| *"We'll need to add music!"* | **Open.** |
| *"We need to add the CRAB SANDWICH somewhere. That's the most famous part of the infamous devoxx food."* | **Open**, noted for later work. Chapter 3's catering court is where it belongs. |

### Why the robots were whitey-grey

The lift scaled **each panel** to a target luminance of its own, `floor + range * sqrt(lum)`. That
is tone compression, not lighting, and it did two things nobody wanted: it squashed each robot's
internal contrast, and it exposed a charcoal robot to the same brightness as the pale tan crates he
is standing in front of. `robots/droid-robot.png` is dark charcoal with warm amber accents; the
lift was taking his main panel from luminance 0.053 to **0.201**, a mid grey.

Saturation was never the fault — it was preserved exactly. **Brightness was.** A low-saturation
colour made four times brighter reads as grey, which is why Voxxy (saturation 0.99) survived it and
Droid (0.47) and Biggy (0.54) did not.

Now: **one gain per rig**, set so the robot's mean panel luminance reaches `PRESENT_TARGET`, applied
to every panel alike. Dark stays dark relative to light, every hue holds, and the robot is the robot
with a light on it. Never below 1, never above `PRESENT_MAX_GAIN`, and the cap is **proportional**,
not per channel — dividing each channel by its own excess is exactly what turns a saturated colour
white. Voxxy gets a gain of 1.0, which is right: he is the orange one and needs no help.

### Why the zoom did nothing until it did

`frame()` fits a box that is the view rect **crossed with a fixed vertical band** (`BAND_LOW` to
`BAND_HIGH`, 4.3 m). While that band is in the box it is the binding dimension and the rect has no
say: measured through `__afterdark.project()`, shrinking `VIEW_CRATES` from 92 to 76 moved the
crates **3%** on screen, and 76 to 60 moved them 3% again.

The opening frames three crates in an empty corridor with nothing above them worth keeping, so it
gets its own band (`OPENING_BAND`, 3.1 m) the same way it already gets its own azimuth. `setBand()`
follows `setAzimuth()` exactly, restore convention included. `tests/intro-light.test.ts` pins the
thing that was silently false — that the rect now changes the framing at all — rather than merely
that the override exists.

### The emergency light — Michele's idea, and it is better than what is there

*"If we want to handle the light change, we could do this. There's a light on the crates, robot exit
fully visible. Light (emergency light?) flickers and stops, robots light up -> transition to game."*

This dissolves the tension the presentation light exists to fudge. Right now the intro has to fake
"fully visible in a blackout", which is why it needed tuning twice. With his version there IS a
light: the robots are lit because something is lighting them, it dies on camera, their own lamps
come up, and the cut to a dark corridor is **motivated** rather than a fade. It also explains the
blackout to a player who has just arrived, and it costs nothing in the sim — the presentation light
already takes a 0..1, so the flicker is a curve on the number that is already there.

### The intro, restaged against the west wall

Michele's own proposal, taken whole: *"Why not placing the crates on the west wall and using a single
transition? Start: cinematic on the crate, light on robots, each one exits and is presented.
Transition to the corridor, different camera angle, robots ready to start."*

It also turned out to be the only position that works, which the *"the left crate is half black"*
complaint was pointing at without either of us knowing. **Voxxy's crate was standing inside
`corridor-column`** (x 59..75, y 288..304): 9.1 px of a 17.25 px crate — 53% of it — of 3.3 m of
`#1b1e24` with a black emissive, i.e. exactly black in a blackout, standing in front of the boarding
and filling the interior the moment her panel dropped. Droid's and Biggy's fouled nothing, which is
why only hers showed it. Ruled out by measurement, not argument: the crate materials (probed live,
all three identical), a shadow (the black is pure 0,0,0 and survives `?nofog=1`), the visibility
polygon, the fallen panel, winding.

**And it could not be slid clear.** A pixel-by-pixel scan of x 40..400 against both the columns and
the auditorium door leaves found NO row centre where all three crates clear everything — the row is
4.82 m, the two usable column gaps are 75..169 and 245..365, and each has a door in the middle of
it. (Sliding it 26 px east, the obvious first try, puts Biggy's crate inside `cinema-door-leaf`.)

So: face line **x 29**, row centre **y 350** — the corridor's own centre line — backs to the west
wall, faces east, Biggy's 1.78 m depth reaching back to x 6.75 against the wall's inner face at
`T` = 6. Measured with slack: any face line 29..120 on any centre 316..384 clears.
`crateRowFouls()` in `src/render/crates.ts` re-checks a candidate before it is committed.

Three things fall out of it for free, and they are why this is better than a fix:
- The robots' start marks are the crate row, so they begin at the **west end facing east** — already
  pointed down the corridor, with the crates behind them instead of beside the lane.
- **One transition**, as he asked: the presentation and the cut to play are the same pull-back.
- The crates stay as scenery with colliders for the rest of the chapter.

**The presentation light** answers *"Robots are still black. In the intro I'll show them fully, even
if it's dark. It's their presentation."* Each panel is re-exposed in its OWN colour — no
`THREE.Light` anywhere, the rule the crates already follow — to `0.1 + 0.44 * sqrt(lum)`, so Droid's
graphite comes up a long way and Voxxy's orange shell hardly moves and they stay three different
robots rather than three grey ghosts. It rises with each robot's own crate lamp and is handed back
across the camera pull-back so nothing pops on the transition frame. Two traps recorded: the eye and
visor emissives are skipped (lifting one gives a robot two white holes in its face), and a material
carrying its colour in a canvas texture is lifted through its `emissiveMap` — lifting `mat.color`
works in node and painted Biggy's whole belly flat white in a browser.

**The intro's camera angle is 68 degrees** (`OPENING_AZIMUTH_RAD`), against the play azimuth's 14.
At 14 the row is edge-on and `DEVOXX` is three slivers, which is why the override exists at all; at
68 all six stencil letters, the ANTWERPEN band, both red corner blocks and Biggy's stove-in corner
read, and every crate still keeps a flank and a lid so the row reads as three boxes stepping up in
size — small, tall, huge, which is the presentation order. 90 degrees is a flat elevation: three
painted boards, no diorama. The override is per-shot and `dioramaToCamera()` deliberately still
reads the constant, so no signage facing rule moves with it; a shot at 68 will show some signs from
behind, which is harmless in an empty corridor and is the reason this is not a second setting.

### The run sheet, the meter and the nudge — `I` and `H`

Built tonight, and the biggest single playability item on the list. A stuck player
had two things: the briefing at the top, which says what the chapter is, once, and the
progress line at the bottom, which says what is happening, now. Neither answers
*what is left* or *what do I do about it*.

All four chapters already published `GameSnapshot.tasks` and nothing read it.

- **The meter** is one pip per task and a count, in the bottom strip **above** the progress
  line rather than replacing it. Two different questions: the line says what is
  happening right now (*"digits 2/4 · still dark: ..."*), the meter says how much of the
  chapter is left. A chapter with no list gets no meter, never an empty one.
- **`I` — the run sheet.** The whole list, struck through as it lands, with each task's
  robot as a chip in that robot's own lamp colour and its sub-count where it has one.
- **`H` — the nudge**, escalating, one step per press, and **never past what the chapter
  published**: (1) whose job it is, in that robot's voice, naming the key to press —
  most of being stuck in this game is having the wrong robot selected, so the cheapest
  answer is usually the right one; (2) the chapter's own line of help, never the
  answer; (3) a ring on the place. A task with no `who` has no step 1, one with no `at`
  has no step 3. The count is per task id, so moving on starts again from nothing.

The ring is drawn **at the target**, not from the robot: an arrow starting at the robot
has to be re-aimed every frame and reads as a tether telling you the route. *Where* is
what a stuck player is asking.

`nudgeStep` is lifted out of the HUD closure and exported so the ladder can be tested
without a DOM (the suite runs in node). `tests/tasks-panel.test.ts` also holds the
contract the overlay leans on, per chapter: unique ids, something to read on every row,
nothing done on the first frame, a complete sub-count or none, and every task
answerable at least once.

Verified in the browser at all four chapters: every task carries `who`, `at` and `hint`
except chapter 3's speaker (no fixed place — correct, he is hiding) and the two
"all three robots" rows, which have no single owner.

## Chapter 2, second pass — Michele, 24 Sep

| his note | decision |
| --- | --- |
| *"Typing password can be Voxxy or Droid, I think both are ok. I'd say Voxxy if every robot needs to have just one role, but what is excluding droid? Fingers too long?"* | **Both type.** Nothing excludes Droid, and inventing a reason to would be tidiness posing as design. Biggy still refuses, because his refusal is the joke. |
| *"Where is the wifi password? I'd put it here, spray painted, with a wifi symbol and '(And no, you can't change it)'. But it's a bit far from the entrance, and all is dark.."* | Graffiti on a hall wall, read by Voxxy's narrow beam. He flagged the real problem himself: a player has no reason to point a torch at that particular wall. The placement is the easy half. |
| *"Door should have Halo, Name on the side (shirts and gadget) and be mentioned on the intro. Gadgets must be ready, but the door is shut (we could mention the same lost keys?)"* | The badge store gets a halo, a name, an intro mention, and crates of **Devoxx t-shirts** inside — *"the devoxx shirt is a tradition"*. Shutting it with the same lost keys ties the errand back to the premise. |
| *"Why space and not e for catching? I'd keep it to one key."* | Agreed, and not yet done. `E` is chapter-handled and already means use / climb / brace / lift / play, so folding the grab into it is an ordering problem, not a rename — the chapter has to get first refusal and the grab take what is left. Held until the chapter files are free. |
| *"remove this from the stairs. (both the big and the small)"* | **Not yet identified.** His screenshot shows a dark slab with a blue edge strip and an orange post beside a flight, and it does not match any single object in `venue/ground.ts` by elimination. Asked rather than guessed. |
| *"The voxxy-biggy run worked, even if a bit clumsy."* | The tow bar is accepted. "Clumsy" is unexplained and may just be the eight-direction snap; leave it until he says more. |
| *"I haven't been able to see voxxy jump, how should that happen?"* | It does not exist yet. I asked him in the previous round whether it should be gated in chapter 4 or stay purely for fun and never got an answer, so nothing was built. Proposal sent back to him. |

## Looks — deferred by him, explicitly

| item | who | note |
| --- | --- | --- |
| **Player-controlled zoom, IN ONLY** — one or two fixed steps, clamped, never wider than the chapter's own framing | Michele, 24 Sep 2026 — *"ok keep this as a note for possible future feat"* | He asked whether player zoom should be an addition or avoided. **Avoided, with this one exception.** Free zoom-OUT is the part that cannot ship: `updateFocus` in `scene.ts` deliberately clamps the framed window inside the chapter's own `ViewRect` so the camera can never show something the chapter has not revealed yet, and the fog of war is what is supposed to open the world up. Let a player widen it and chapter 2's whole exhibition hall is visible without exploring it, and the fixed diorama camera — a design pillar, GAUNTLET.md §1 — stops being fixed. Zooming *in* leaks nothing and helps a judge on a laptop see a robot. Build it only if a playtest asks for it; pre-emptive is how a camera system grows. |
| Climbing and descending animations | Michele — *"keep them for next rounds / if we have time"* | |
| Door opening animation when the code is entered, then the transition | Michele — *"this also can wait, but keep track"* | The jammed door already falls; this is the fire door. |
| A better-looking breaker enclosure | Michele — *"fine for now... Maybe with red halo to signal it's interactive"* | His idea generalises: **one visual language for interactive props** would replace the projector panel, the duck target, the cam-lock and the keypad all being individually hacked into visibility. |
| Biggy's lower body is still squarish | Michele — *"a bit better, but still squarish. We can address it later"* | Trousers and undercut are now swept lathes; the belt plate is still a flat slab and there is a sawtooth where the undercut meets the right leg. |
| Droid sitting on Biggy reads well only from some angles | Michele | |
| Voxxy's arms are frenetic at speed | Michele | Gait amplitude, not speed — she is at the speed he approved. |
| The HUD stays up through cutscenes | agent | The objective paragraph, three robot chips and a live speed meter sit over a shot meant to be a beat. |
| The secondary staircases are in the wrong place | Michele, with drone footage — and again, 24 Sep: *"The stairs position on the upper wall haven't been fixed"* | **Escalated to him, measured.** Ground floor: fixed — both shafts were wrong (the bot one 64 px toward the hall's centre, halving the gap), now on the plan's own pixels. First floor: the plan measurably puts both flights at plan y 884..947, which is *inside room 4/9's length* (world x 1006..1113), not in the 3|4 or 10|9 gap that CLAUDE.md, GAUNTLET.md Stage 1 and `plans/README.md` all call non-negotiable. Two things he wrote disagree, so a builder cannot settle it; moving them there also crosses rooms 4 and 9's centred doorways and the descent waypoint chapter 1's closing cutscene hard-codes. **His call.** The mouth width (note 18) was measured and fixed in the meantime. |

## Structural — nobody asked, but they will bite

| item | note |
| --- | --- |
| `rig.ts`'s `weather()` brightens dark materials | It writes vertex colour as a *ratio* against the material's own colour, so a rust tint on a near-black part divides a light colour by a dark base and "wear" comes out as white flakes. Biggy works around it locally; **Voxxy and Droid almost certainly have it on their dark parts**. |
| `buildLights` is ~95% of a chapter-2 sim step | 0.9 -> 2.63 ms per cast across today's two changes (colliders, and the skirt doubling the light count). Fine against a 16.7 ms frame, but the next change to that path should cull walls outside a light's range first. |
| Four helper sets want promoting to `rig.ts` | Three agents independently wrote their own: a UV-carrying patch, a clearcoat material, a surface kit (seams, bolts, revolve mounts), a bellows. `rig.ts`'s `boltRing` also aims rivets with a sphere's normal, which tilts them visibly on a lathe. |
| `gaitSpeed`'s `tanh` compression | The surviving cousin of the deleted `HUD_PX_PER_MPS`: it existed so a 23 m/s robot's legs did not blur. At 5.8 m/s it barely does anything and is probably removable — one more fudge out of the submission. |
| `CUT_WALK_SPEED` is dead | The cutscene rewrite made walks duration-driven. Still exported, scaled and asserted; nothing reads it. |
| Crowd and prop radii are the generous ones now | A conference-goer is 0.8-1.28 m wide and the cake crate is 1.36 m, sized when the robots were twice their current width. |
| `pushBiggy` and `stepTow` ignore Biggy's mass | The crate beat adds mass and takes acceleration, and the design doc claimed the push and the tow would express the weight. They do not: both add `force · dt` straight to his velocity without dividing by mass. Only `botsCollide` reads it. Making them mass-aware retunes chapter 2's roller door, which is frozen physics and Michele's call. |
| A careful player may never see the OutOfMemoryError | The HUD reads `heap 4/5`, which is what makes the beat survivable and also what makes it skippable. Mitigated (Biggy's line at four dares you, no penalty for trying); the guaranteed version is a seventh crate, so one overfill is forced. |
| The crowd walks through the shuffleboard duck | `pushOutOfCrates` keeps the 36 visitors out of the beer crates and knows nothing about the duck, which is a separate body inside the minigames closure. Pre-existing, but chapter 3 is the only home now, so a craft screenshot can catch an attendee standing inside a rubber duck. Not fixed on purpose: letting the crowd displace the duck would let it drift into or out of the scoring circle with no player input, which is a design change rather than a move. |
| `E` precedence at the Sticker Mine | The minigames' key handler runs before the chapter's own, so Droid standing at the sticker takes it before anything else can happen there — and that booth shares the grid with the keynote speaker's hiding places. The chapter-3 end-to-end test already works around it by clearing the sticker first. |
| Chapter 4 runs about six minutes | Correct preservation of its difficulty through the rescale, possibly the wrong *shot*. The fix if playtesting says so is a run key or a smaller room, not re-tuning the clock back. |
| `tools/progress/shots/` is 50+ MB | Prune before submission. |

---

## 24 Sep, evening — seven notes in one sitting

He played while the round was running and filed these one at a time.

| his note | what it was, measured | outcome |
| --- | --- | --- |
| *"this hint is flickering"* (screenshot of a clue plate reading as broken arcs) | The marker's backing disc and all three slot rings sat at **y = 0.0200**, and `floor1.ts` builds the kiosk's floor plate with `floorSlab(F1.kiosk, 0.02, …)` — an opaque, depth-writing box whose top face is at exactly 0.0200. Chapter 1's clue 2 is at the kiosk's centre, so a 2.16 m marker was **exactly coplanar** with a 4.48 m slab that contains it. Which pixels survive is then decided by rasteriser rounding, and re-decided every frame as `updateFocus` eases the camera by a fraction of a pixel. That is the flicker. | Markers lift to `CLUE_PLATE_LIFT_M = 0.09`. `tests/clue-plate.test.ts` measures the clearance instead of trusting the comment. |
| *"you didn't move the room to the upper aisle as i suggested. The hint must be visible, it's unsolvable this way"* | Same root cause, worse symptom. The exit alcove publishes a `flat` prop, and `drawProp` puts a flat prop's top at `surface + h + 0.01` = **0.06** — four centimetres above the 0.02 marker, covering all of it. Clue 4 was not dashed, it was **gone**, which is why only the floating pip showed and why this was the one clue he could not solve. Fixed by the same lift; screenshotted in play view, fog on, and the three-colour ring now reads plainly in the alcove. | **The room did not move, and here is why.** Swept every floor cell Biggy can actually reach in cinema E (flood fill from the broken door, 3 px grid, 16 headings per cell): from the alcove mouth he lights the clue **directly from 0 poses and via the screen bounce from 893**. Move it anywhere in the aisle or the back cross-aisle — the "upper aisle" — and direct rises to **1000–1190**, which deletes the mirror puzzle outright. The whole bay east of the aisle is Biggy-proof only because the alcove's two solid walls blind him; the seat rows are `low` and pass light. So the complaint was legible, not geometric, and the geometry that answers it is the alcove. Michele's call if he still wants it moved. |
| *"Add sound effect when a Hint is solved"* | `audio.ts` has carried a written, tuned `clue` cue since the day it was added, and it had **never been played** — nor had `chime`, `switch` or `mount`. The sim knew an enigma had resolved, the marker drew its digit, and the room stayed silent. | Wired in `updateAudio`: `clue` on every solve, `chime` a beat later when the last one lands, plus `switch` on the robot switcher and `mount` when Droid goes up. |
| *"Could we add a basic action to each robot on E? Voxxy jumps, Biggy rolls, Droid? Stretches? Not needed for gameplay"* | Voxxy's hop already existed; the other two answered E with a line of flavour text and nothing else. | Built. The sim owns the clock, the rig reads a 0→1 phase, no displacement, and the same `hopRest` stops E being mashed. |
| *"still a walkthrough object on the doorway, add an animation + sound when it opens"* | | In flight. |
| *"The stairs position on the upper wall haven't been fixed"* | Re-files the open item below: the secondary staircases are lateral in the real hallway. Ambiguous between the first floor's `nicheTop` and the ground floor's two shafts, so both are being measured against `plans/`. | In flight. |
| *"The projector still needs a shape"* | | In flight. |
| *"In the intro to chapter 2 mention the printer too"* | The printer was named in the HUD objective and nowhere in the fiction, so half the chapter's goal arrived as a task line with no stake attached. | The card now carries it, with the stake and no route. |

### Measured and NOT changed

The 15 px aisle is **not** the needle it reads as. Droid's clearance is 1.25 px a side (10 cm) and
Voxxy's 2.75, which looks impossible written down. Driven — hold S from the back cross-aisle, entry
offset 0 to ±4 px — **both robots get through on every single entry offset**, because the collision
resolver slides them off the wall rather than stopping them. Widening it would cost the gate (Biggy
is 18 px across against the aisle's 15) and buy nothing.

### Crate stencils — agreed 24 Sep (not yet built)

Michele: *"the antwerpen sticker could stretch between the 3 crates instead of being repeated?"* — yes,
and it is the better read. One shipping stencil spans all three crates in the opening shot; the word
only exists while they stand in a row, and it breaks apart the moment the robots step down and the
crates are left behind. That is a beat the repeated label does not have.

Layout, decided by legibility rather than taste. At the intro's tight framing a crate face is about
520 px wide, so a letter can be ~150 px tall spanning three crates against ~45 px repeated per crate.

| band | text | placement |
| --- | --- | --- |
| big, spanning | `DEVOXX` | exactly two letters per crate (`DE` `VO` `XX`), so the two crate seams fall **between** letters and no glyph is ever cut by a gap |
| small, spanning | `ANTWERPEN · T.A.V. STEPHAN` | second line under it, also continuous across the three faces |
| per crate | Voxxy `FRAGILE · THIS WAY UP` (arrow upside down), Droid `DO NOT BEND`, Biggy **both** `BULKY` and `HIGHLY FRAGILE` + a stoved-in corner | each in its own crate's lower corner, unaffected by the span |

Biggy carries two contradictory stencils on purpose (Michele: *"keep both bulky and highly fragile
on biggy"*): the heaviest robot in the game is the one the shippers warned twice about, and the
stoved-in corner says how well that went. They stack, `BULKY` over `HIGHLY FRAGILE`, so the pair
reads as one block rather than two labels competing for the corner.

Consequences to honour when it is built: crate order is load-bearing (Voxxy, Droid, Biggy, left to
right) and the three faces must be coplanar and evenly gapped, or the word skews. `ZAAL 8` is dropped
— three bands on one face is one too many at this size.

### Two staircase questions, decided 24 Sep

Both came out of the switchback rebuild, and both are Michele's call rather than a
measurement, so they are recorded here as decisions and not as open items.

| question | his answer | what it means in the code |
| --- | --- | --- |
| A proper 0.95 m guard at the head of each first-floor well would hide rooms 4 and 9's Zaal numerals from the diorama camera — traced at every pitch, the sight line crosses the well between 0.63 m and 1.11 m, so **no** rail height clears it. Guard, or numerals? | **Keep the 0.40 m upstand.** | `NICHE_RAIL` stays an upstand at the head of the well and a full rail (0.95–0.99 m) on the open long face, where nothing is behind it. The numerals are untouched and `tests/venue.smoke.test.ts`'s legibility pass stays a real check rather than one with an exception in it. The compromise is deliberate and it is invisible at play zoom; the photo's guard is drawn where it can be. |
| The technical room leaves 15.8 px of floor outside the bot shaft's south door and Biggy is 18 px across, so he cannot use that door at all. `GF.tech` came from the prototype and has never been measured against the plan. | **Leave it — Biggy uses the north door.** | Both long faces carry doors now, so he always has a way through; the south door is a Voxxy-and-Droid route. That is a gate, not a bug, and it costs nothing to leave `GF.tech` unmeasured until something else needs it. |

Still open, not asked because he has already said the ground floor is right: the
ground-floor shaft's south end is not cleanly terminated on the drawing — treads
run past the bold wall at plan y 323 down to about y 709. `GF.stairs`' rect ends
at the bold line. If he ever wants the shaft's full length, that is the number.

### Chapter 1's ending — two filed 24 Sep, queued behind the intro

| his note | what it is | the fix, when it comes |
| --- | --- | --- |
| *"The door opens through Voxxy. What about vertical opening? shutter door?"* | The fire door swings on `FIRE_SWING_TIME` and its leaves become colliders where they END UP (`src/render/fire-door.ts`, `ch1-night.ts`), but nothing sweeps a robot out of the arc on the way. A robot parked in front of the door — which is exactly where the player leaves Voxxy, because she has just typed the code — is passed through by the leaf. | **Not a shutter.** A fire door swings, chapter 2 already owns the one roller shutter in the game, and a second one would spend a distinct object twice. The honest fix is the arc: the swinging leaf pushes anything in it, the way the door in a real corridor does. It is also funnier — Voxxy gets shoved aside by the door she just opened — and it is a physics win rather than a dodge. If he wants it gone rather than solved, the cheap version is opening the leaf the other way, away from the keypad. |
| *"The robots enter the stair when an handrail is, passing through it. They should walk around it."* | The exit cutscene walks straight lines between waypoints and asks no wall a question — which was harmless until `NICHE_RAIL` made the balustrade at the head of the stair a real collider this same day. So the route now crosses a wall the player cannot cross. | One waypoint, not a pathfinder: the route enters the well by turning in off the corridor at the east end, which is the pocket the rail leaves (16.2 px, 1.30 m). `tests/stairs-driven.test.ts` already drives that entry, so the number to aim at is measured. Worth also asserting that no cutscene leg crosses a wall — the class of bug is "a route written before a collider existed", and it will happen again. |

Both queued behind the opening sequence at his instruction: *"Fix this after the animation preview."*
