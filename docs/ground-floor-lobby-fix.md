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

## Targets

| block | plan rect (x0,y0,x1,y1) | world rect | currently |
|---|---|---|---|
| Reception desk | 290, 880, 580, 975 | **x 1169, y 202, w 136, h 272** | x 1280, y 120, w 240, h 50 |
| Main staircase | 300, 975, 520, 1050 | **x 1305, y 259, w 108, h 206** | x 1280, y 200, w 240, h 200 |
| BOF rooms | 625, 880, 890, 1090 | **x 1169, y 6, w 301, h 154** (top-clamped) | x 1560, y 40, w 320, h 220 |
| Toilets (right) | 600, 810, 890, 880 | **x 1069, y 6, w 100, h 178** (top-clamped) | x 1060, y 110, w 150, h 130 |
| Main entrance | 180, 1100, 630, 1120 | **x ~1484-1513, y 156-577** | x 1894 (canvas edge) |
| Coatroom | *unlabelled on both plans* | — | does not exist |

The BOF and right-toilet blocks are top-clamped because the plan puts them past the hall's own
edge; at this mapping their true world y starts at -88, so they sit against the canvas top.

## Three things this exposes

1. **The lobby is currently ~400 px too far right.** Round 2 pushed BOF out to x 1560 to fill
   what a critic called "featureless deck". The deck was real but the cure was wrong: the
   building's true right edge is near world x 1513, and the emptiness beyond it is *outside*.
   Dress it as the frontage instead — glazed entrance doors at x ~1513 and, beyond them, the
   forecourt from `media/other-images/image-1790032592052.webp`: white facade, blue KINEPOLIS
   EVENT CENTER lettering, blue star banners, bollards. That fills the dead zone with something
   true instead of inventing interior.

2. **There is a second toilet block we cannot place.** The plan's top-left "Toilets", with its
   own "< Toilet Entrance", maps to world x -77..23 — almost entirely off the left edge of the
   1900x700 canvas, because the hall already starts at x 30. Placing it needs the canvas
   extended leftward, which is a rescale and therefore out of scope. Logged as a known,
   deliberate omission rather than quietly dropped.

3. **Moving the main entrance moves chapter 3.** The 36 visitors spawn at it and walk the lane
   grid. If the entrance moves from x 1894 to x 1513 the crowd choreography and its tests move
   with it. Do that deliberately, in the same pass, with the tests rewritten to assert the new
   route — never loosened.

## Still open

**The coatroom.** Neither annotated plan labels one; the labels are Toilets, Toilet Entrance,
Stairs to Cinema Rooms, Devoxx Polo Pickup, Wheelchair access, Reception, Rooms (the main
staircase), BOF Rooms and Main Entrance. Michele is pointing at its location. Place it in the
same pass once he does.
