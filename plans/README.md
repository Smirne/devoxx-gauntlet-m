# Floor plans
- devoxx-rooms.jpg — first floor, Devoxx rooms annotated (from game.devoxx.be)
- devoxx-rooms annotated.png — same, larger
- devoxx-rooms-stairs-annotated.png — Michele's annotation of where the staircases are ← use this for stair positions. Measured off it (996 x 1498): the two secondary flights stand IN the corridor, hard against its two walls, at plan y 884..947 and 20 plan px deep — level with the 4 and 9 numerals, NOT in the gap between 3|4 and 10|9. The main staircase is at the corridor's end between 6 and 7. The full measurement and the arithmetic that turns it into world coordinates are in `src/sim/geometry.ts` (`NICHE_MOUTH`, `F1.nicheTop`).
- cinema-venue-devoxx.png — first floor, raw auditoriums map
- exhibition-floor.jpg / exhibition-floor annotated.png — ground floor, annotated (registration, main staircase, BOF rooms, toilets, polo pickup)
- exhibition-floor-stairs-annotated.png — Michele's annotation: the two secondary staircases inside the hall and the main staircase by reception ← use this
- hollywood-area.png — ground floor, raw

**The stairs themselves, measured 24 Sep 2026 (evening).** Michele sent three crops back — they are in `michele-notes/` — with *"This makes it look like there's a center, and 2 descent. I think it's a mid plane between two ramps of stairs. In this picture stairs go south to north."*, *"There's a protection on West and North"*, and *"Just a correction: you put the opening north, but it's on the sides (WEST, EAST)."* Read off the drawings:

- the hatched symbol is **one** staircase — ramp, half-landing, ramp — not a landing with a descent either side. First floor: flight plain y 853..914 with a tread-free band at 879..887. Ground floor: flights over ~199 px with a tread-free band of 31.
- the ground-floor shaft's doors are a pair of double doors in **each long (plan west and east) face**, beside the landing at the plan-north end. Both short ends are solid — zero door symbols, counted.
- so the foot of the stair is at the plan's north and the head at its south, which through this repo's 90° rotation is world west and world east. The first floor is entered at its **east** end and descends west.

The arithmetic that turns all of that into world coordinates is in `src/sim/geometry.ts` (`NICHE_MOUTH`, `NICHE_RAIL`, `nicheRamps`, `stairDoors`, `stairRamps`).

**The drawing wins.** Michele, 24 Sep 2026, when the prose in CLAUDE.md, GAUNTLET.md and this file said the secondary staircases were between 3|4 and 10|9 and the drawing did not: *"Follow the plan — move them"*, then *"follow the devoxx plant, not the plan.md"*. Where a PNG here and a .md disagree, re-measure the PNG, move the geometry and correct the prose.

In the prototype both floors are rotated 90° so the corridor runs left→right (plan top = world left); see docs/after-dark-full-design.md for the coordinates.
