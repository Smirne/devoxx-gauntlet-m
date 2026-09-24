# After Dark — full run on the real Kinepolis plans (POC 10, 2026-09-16)

Files: `poc/10-after-dark-kinepolis.html` (current), `poc/09-after-dark-two-floors.html` (first two-floor version, schematic hall), `poc/08-after-dark-full.html` (one floor). Deployed from the `poc/` folder on Vercel (`index.html` is the lab page with relative links); artifacts no longer maintained.

## Maps (from the annotated Devoxx plans, rotated so the corridor runs left→right)
- **First floor** (`floor1Walls`, `rooms`): closed cinema section x 0–600 — three unnumbered cinema rooms on top (A, B, C), two below (D, E), the curved foyer with a bar (bottom-left, open onto the corridor), a glass kiosk with a Voxxy-sized hatch in the foyer. Fire door at x=600 with the keypad on it. Devoxx rooms: 10, 9, 8 (keynote, top row), 7 on top; 3, 4, 5, 6 below, widths in the plan's proportions. Secondary staircases standing in the corridor against its two walls, level with rooms 4 and 9, labelled "▼ ground floor" (**corrected 24 Sep 2026**: this line used to say they were niches in the corridor walls between 3|4 and 10|9. Re-measured off `plans/devoxx-rooms-stairs-annotated.png`, the drawing puts them at plan y 884–947, hard against the room walls and 20 plan px deep — see `NICHE_MOUTH` and `F1.nicheTop` in `src/sim/geometry.ts`. Michele: *"follow the devoxx plant, not the plan.md"*). Main staircase at the corridor's end between 6 and 7.
- **Ground floor** (`groundWalls`, `GF`): exhibition hall on the left (x 30–1040) with the two secondary staircases on its far side, catering counters in a walled court top-left (three queue doorways), technical room bottom-left (breakers high, network rack), polo-and-badge store top-right of the hall with a roller door on its hall side, 12 sponsor booths (4×3, half tables Voxxy fits under). Hall's right wall has four openings (the scalloped wall). Lobby: reception (badge printer), main staircase (gate on its hall side), BOF rooms, toilets, wheelchair access, main entrance on the right wall.
- **Camera**: per-chapter view rect, clipped: `VIEW_CLOSED` (x 0–900: closed section + the sealed rooms 10/3 beyond the fire door), `VIEW_GROUND` (whole hall + lobby), `VIEW_DEVOXX` (x 590–1900, fire door shut behind), `VIEW_F1` only during the first cutscene.

## Chapters
1. **Night** — closed section only. Clues: foyer (orange+green), kiosk (Voxxy inside through the hatch + Biggy's flood through the glass), room B (locked; projector panel needs Droid on Biggy; green+blue), room E (seat rows, mirror screen, exit alcove; all three). Room E's door is jammed: **Biggy alone** breaks it — threshold 70 px/s on the speed *into* the door, one corridor width of run gives ~100. Code → fire door opens → cutscene: walk to the 3|4 niche, fade.
2. **Expo** — dark hall. Droid: three breakers. Voxxy: cable from the rack to the reception printer, metered (`MAX 1480`; straight line ≈1350 with 8-way keys, lane route ≈1630 fails and the cable snaps back). Biggy: the roller door needs **270 px/s, above his 235 top speed**, so Voxxy pushes him along the top lane (push force 170 px/s², ~400 px needed; `boostCap = speed × 1.05` so the clamp doesn't undercut the check at impact). Alone he stops at the door with "that's my top speed". 
3. **Lunch** — entrance open, 36 visitors on a lane grid, queues in the three catering doorways (Voxxy clears one for 5 s), ladle on the high shelf, pot (spills, cools), speaker hiding by a built booth, Stephan at the main-staircase gate. Soup + speaker → gate opens → cutscene: walk into the main staircase, fade.
4. **Keynote** — Devoxx section; robots start at the top of the main staircase, crowd follows from there. Room 8 is on the top row: stage at the top, door on the corridor, two aisles, seat blocks y 140–270 (strip of 94 px inside the door). Cake / banner / spotlights, then all three robots on the stage rect → final card.

## Optional booth games (swag, chapters 2–3; not required)
Rubber Duck Inc shuffleboard (shove the sliding duck so it stops in the circle 95 px away), Sticker Mine top shelf (Droid, E), Regex Racing lap 1→4 under 5 s (Voxxy). Final score adds 0.5 per swag.

## Cutscenes
`startCut(routes,next,view)`: gather (0.35 s fade to black, robots placed at the route start) → walk (waypoints, walls ignored, ≥150 px/s) → leave (fade) → next chapter. Skip works during a cutscene.

## Verified (Playwright test27)
Four clues incl. kiosk; jammed door alone (103 px/s); roller: Biggy alone fails at the door, pushed by Voxxy breaks it at ~282; cable 1270–1311 px; sticker minigame; queue/ladle/pot/speaker/delivery; both cutscenes reach the next chapter; keynote jobs, crowd, everyone on stage; no console errors.

## Michele's guidance kept
Chapter 1 and 4 show only their part of the floor; stair animations between chapters; booth games optional; jammed door solo, pushed door with a straight run-up; stick to the actual Devoxx map with the stair annotations; final game probably 3D; no more artifacts, deploy is Vercel.
