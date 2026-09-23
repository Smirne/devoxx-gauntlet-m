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
| 15 | "reduce the black block, make it into a glass wall or something to show the circle better" | open | Something opaque hides the kiosk clue. |
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
