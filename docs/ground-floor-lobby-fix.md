# Ground-floor lobby — measured target positions

Michele playtested the round-3 build and called it: the big hall is fine, but reception,
coatroom, BOF rooms and toilets are not consistent with the floor plan. He is right, and the
error is large enough that "roughly present" — which is all the automated floor-plan check ever
tested — was hiding it.

He chose **fix relative positions only**: correct the blocks against each other and against the
hall, inside the canvas as it is. No rescale of either floor.

## The mapping

Anchored on the exhibition hall, whose world rect is already correct
(`GF.hall = {30, 90, 1010, 600}`), against `plans/exhibition-floor.jpg` (903 x 1148):

```
world_x = 30 + (plan_y -  85) * 1.4326     plan y  85 -> 30,  790 -> 1040
world_y = 90 + (700 - plan_x) * 0.9375     plan x 700 -> 90,   60 ->  690
```

The two factors differ because the prototype stretched the corridor axis; keeping them is what
"fix relative positions only" means. Everything below is derived with these, so the blocks are
correct *relative to the hall and to each other* even though the whole floor is stretched 1.53x
along x versus across it.

## Targets — from Michele's own plot, 2026-09-22

Michele placed these on the plotter (`claude.ai/artifact/FS9Y748Cpr27YboBa9oxn4`), whose
Exhibition Hall box is the ruler: its world rect is already correct, so the mapping is derived
from where he put that box rather than from my measurement. Measured kx = 1.43262 along the
corridor, ky = 0.93750 across it.

| block | game rect | |
|---|---|---|
| Coatroom / wardrobe | `x 1172, y 262, w 126, h 122` | |
| Reception | `x 1174, y 388, w 126, h 75` | below the coatroom, not beside it |
| Main staircase | `x 1305, y 263, w 112, h 197` | |
| Main entrance | `x 1472, y 422, w 33, h 136` | the left-hand doors only |
| Small stairs | `x 952, y 285, w 93, h 283` | **new** |
| Concrete wall | `x 1039, y 90, w 43, h 199` | **new**, top-clamped |
| BOF rooms | `x 1195, y 6, w 275, h 151` | top-clamped, was h 245 |
| Toilets | `x 1085, y 6, w 105, h 150` | top-clamped, was h 247 |

Clamped because the plan's building reaches ~90 px further "up" in world terms than the hall
does, and a 700-tall canvas leaves only 90 px above it. Michele chose to clamp rather than grow
the canvas: BOF and the toilets end up about 36% shallower than the plan. BOF is optional
content, so the loss is mostly cosmetic in top-down.

## What his plot changes that measuring could not

1. **The hall's right edge is not a "scalloped wall with four openings".** That was the
   prototype's invention and it survived into the build unquestioned. The real edge is a
   concrete wall across the upper stretch (world y 90..289) and the small staircase across
   y 285..568 — and the staircase is the *only* way between lobby and hall. Replace
   `GF.openings`' four gaps with one wide stepped opening and solid concrete either side.

2. **There is a level change.** 5–7 steps down from the lobby into the hall, so the hall floor
   sits about 1.0 m below the lobby. Nothing in the game models this yet. It is worth having:
   a robot with Biggy's inertia meeting a flight of steps is the kind of thing this game is
   about, and it gives chapter 2 a real threshold instead of a doorway.

3. **The main entrance is only the left-hand doors.** "The whole wall until the BOF rooms is
   made of glass doors. Only the ones on the left are open for Devoxx, so people enter next to
   the reception." So chapter 3's 36 visitors spawn at world x 1472, y 422..558 — not along the
   full wall, and not at the canvas edge where the prototype put them. Glaze the rest of that
   run as fixed panes.

4. **The main staircase confirms the existing design.** "When Devoxx opens this passage is
   closed and you go to the reception — main entrance first" is exactly the gate Stephan stands
   at, which chapter 3 already ends on. No change needed; the reason behind it is now real.

5. **BOF rooms have tables and host workshops** — Michele offered them as usable game space.
   Worth remembering when chapter 3 needs somewhere for the hiding keynote speaker.

## Settled, no longer open

- **The second toilet block** (plan top-left, its own entrance) is dropped on Michele's call:
  it is a corridor outside the hall's real shape, and "robots don't need toilet". A wall with a
  closed door stands where it would have joined.
- **The coatroom** is placed: the wardrobe is the larger, northern part of the reception block,
  with the reception desk itself the smaller southern part.

## Consequences to handle in the same pass

Moving the entrance moves chapter 3: the visitors spawn there and walk the lane grid, so the
crowd choreography and its tests move with it. Rewrite those tests to assert the new route —
never loosen them (`GAUNTLET.md` section 4).
