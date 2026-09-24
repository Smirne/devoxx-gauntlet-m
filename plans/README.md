# Floor plans
- devoxx-rooms.jpg — first floor, Devoxx rooms annotated (from game.devoxx.be)
- devoxx-rooms annotated.png — same, larger
- devoxx-rooms-stairs-annotated.png — Michele's annotation of where the staircases are ← use this for stair positions. Measured off it (996 x 1498): the two secondary flights stand IN the corridor, hard against its two walls, at plan y 884..947 and 20 plan px deep — level with the 4 and 9 numerals, NOT in the gap between 3|4 and 10|9. The main staircase is at the corridor's end between 6 and 7. The full measurement and the arithmetic that turns it into world coordinates are in `src/sim/geometry.ts` (`NICHE_MOUTH`, `F1.nicheTop`).
- cinema-venue-devoxx.png — first floor, raw auditoriums map
- exhibition-floor.jpg / exhibition-floor annotated.png — ground floor, annotated (registration, main staircase, BOF rooms, toilets, polo pickup)
- exhibition-floor-stairs-annotated.png — Michele's annotation: the two secondary staircases inside the hall and the main staircase by reception ← use this
- hollywood-area.png — ground floor, raw

**The drawing wins.** Michele, 24 Sep 2026, when the prose in CLAUDE.md, GAUNTLET.md and this file said the secondary staircases were between 3|4 and 10|9 and the drawing did not: *"Follow the plan — move them"*, then *"follow the devoxx plant, not the plan.md"*. Where a PNG here and a .md disagree, re-measure the PNG, move the geometry and correct the prose.

In the prototype both floors are rotated 90° so the corridor runs left→right (plan top = world left); see docs/after-dark-full-design.md for the coordinates.
