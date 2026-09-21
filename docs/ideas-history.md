# Game ideas — how we got here (10–16 Sep 2026)

## Strategy read of the scoring
Originality is 40/100 and realism of robot physics 20/100, and the robot descriptions are physics specs (light/fast, tall/deliberate, high inertia). Making the physics differences the core mechanic scores in originality, realism and "all three robots matter" at once. Judges run from a clone: browser build + hosted link minimises friction. Top-down physics on the real floor plan gets sense-of-place cheaply and keeps physics legible.

Michele's original idea: escape-room / Lost Vikings puzzle built on the robots' physical rules (Biggy knocks doors but can't stop, Droid too tall for low passages) plus robots casting different lights that combine to reveal clues.

## POC 1 — playground
Physics model: velocity approaches input×max at rate `accel` (1/s), decays at rate `drag` (1/s) without input. Voxxy accel 12 / drag 9 / max 290 (r=9); Droid 4 / 7 / 115 (tall, r=13); Biggy 0.6 / 0.35 / 235, mass 7, r=17, bounces off walls. Lost Vikings switching scene, stealth scene, curling v0. Playtest: no in-game hints → players get lost; the game must say *why* a robot is blocked at the moment it bumps. Curling v0: "what is Droid's role?"

## POC 2 — Devoxx Olympics (7 events)
Curling·Skip (Droid calls the house, Voxxy shoves Biggy, sweep), Bank shot, Grand staircase (gravity, catch limit 260 px/s), Limbo, **Mixed lights** (four digits appear only under R+G, G+B, R+B, all three), Relay (size/height gates), **Keynote finale** (crowd fills Room 8 over 90 s while Biggy pushes the cake, Droid hangs the banner, Voxxy lights spotlights). Keepers: Skip, Staircase, Lights, Relay, Finale.

## POC 3 — Lights & Locks (the chosen mechanic)
Real shadows (visibility polygons), additive colour mixing, glass passes light but blocks robots, seat rows block robots but not light, the cinema screen is a mirror (secondary light source), explored fog, Droid climbs Biggy (pool ×1.6, projector-height reach), per-robot "why am I blocked" messages.

## POC 4–5 — After Dark (the structure)
Act 1: the closed half of the floor in the dark, four light-mix enigmas → code for the fire door. Act 2: the Devoxx half wakes up, the keynote crowd flows in and dictates the job order (front rows first, queues in the aisles, complaints when bowled over).

## POC 6 — The Building (alternative reading, parked)
The player is Kinepolis; the robots are autonomous (Voxxy runs to light, Droid takes the first open door, Biggy rolls and bounces); herd them with light, doors and bumpers. Lemmings meets pinball.

## POC 7 — The Tomato Soup Run (Devoxx flavour)
Biggy carries the pot (bumps spill, soup cools), Droid fetches the ladle from a high shelf and holds the spring door, Voxxy clears queues and finds the hiding keynote speaker (TBA placeholder), Stephan waits on stage. Cameo caution: caricatures and first names only.

## POC 8 — After Dark full run (one floor, three chapters)
Chapter manifest (setup/key/update/draw), push-Biggy mechanic (a robot leaning on Biggy adds speed beyond his cap).

## POC 9 — two floors, four chapters (schematic hall)
Michele's plan: Night (fire door) → Expo (breakers, length-limited cable under sponsor tables, roller door with a run-up) → Lunch (walled food court, queues at its doors, soup + speaker for Stephan at the grand-staircase gate) → Keynote (all three on stage). Skip-chapter button. Found and fixed: the jammed-door check used total speed, so Biggy could clip it while running along the corridor.

## POC 10 — the real Kinepolis plans (current)
See `after-dark-full-design.md`. Chapter-sized camera, stair cutscenes, jammed door solo / roller door pushed by Voxxy, optional booth games as swag.

## Devoxx flavour to build on
Facts (checked 11 Sep 2026): Devoxx Belgium 2026 is 5–9 Oct, Kinepolis Antwerp, theme "From Developer to Builder"; keynote speakers not announced yet (placeholder "TBA"); Stephan Janssen programme chair. Traditions: Wed beers & fries in the exhibition hall until 20:00; Thu movie & popcorn 20:00 in Room 8; Sunday badge pickup 17–18; WiFi "DevoxxForever"; "Belgian beers may cause hangovers and OutOfMemoryErrors".
Recurring jokes: food and queues (tomato soup is the emblem), sleeping in cinema seats after Belgian beers, room hopping vs the corridor crush, Stephan's keynote announcements. Hooks: a queue blocking a corridor, a popcorn machine in Room 8, the WiFi password as a code, an OutOfMemoryError when Biggy carries too much beer.
