# Lights & Locks — the mechanic's rules (from POC 3, unchanged in POC 10)

## Robot rules (traits made physical)
- Voxxy: small (fits Voxxy-sized gaps and hatches), fast; narrow orange headlamp beam (cone 0.38 rad, range 280) that points where it last moved.
- Droid: tall (steps over ropes, reaches high; too tall for low passages); green lamp on its head → pool of light (range 95); can climb onto Biggy (E next to a standing Biggy) → tower: Biggy moves both, Droid's pool 1.6× wider, reach becomes projector-height.
- Biggy: heavy, slow to start and stop; barges doors at speed; too wide for narrow aisles; wide blue floodlight (cone 1.0 rad, range 300), the longest reach.

## World rules
- Real shadows: every light is a visibility polygon cast against walls (slab raycasts, 48–72 rays per light). Colours are additive so overlaps mix.
- **Bodies cast shadows too, where a chapter asks for it.** `buildLights` takes an optional list of
  occluding circles and clips each ray against them as well as against the walls, inserting a vertex
  pair at each edge of each umbra so the shadow's flank is geometry and not a chord (`POLY_EXTRA`,
  `src/sim/lights.ts`). It is opt-in per cast: chapters 1–4 hand it nothing and cast exactly what they
  always cast, and the shadow rig (`?chapter=5`, `src/sim/chapters/demo-dark.ts`) hands it the three
  robots. Because the umbra is in the polygon rather than in a side test, `litBy`, `clueLit` and the
  renderer's own fan meshes all see it without being taught about it.
- Glass walls block robots, pass light. Low obstacles (seat rows, desks, tables) block robots, pass light.
- Mirrors (the cinema screen): a lit point on the mirror becomes a secondary light source with the reflected direction.
- Explored fog: darkness mask, lit areas stay dimly remembered.
- "Why am I blocked" messages: every gate wall has a per-robot reason shown on bump, throttled per wall (2.5 s).
- Clue = a point that must be inside the polygons of the required colours at the same time; digits random per run, positions given by the clues; the code is typed at the keypad.
