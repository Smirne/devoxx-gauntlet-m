# The Robot Games — Devoxx Belgium 2026: brief and reference material

Source: https://game.devoxx.be/game.html and https://game.devoxx.be/references.html (captured 2026-09-10).

## Competition brief

- Build a playable game in which the three robots (Voxxy, Droid, Biggy) appear and matter, set in a recognisable Kinepolis Antwerp (the Devoxx venue).
- Any engine, language, stack, 2D or 3D. Organisers' guidance: "a sharp 2D game beats a vague 3D one."
- Generative AI use is encouraged; document prompts and process.
- Deadline: Wednesday 30 September 2026, 23:59 CEST.
- Submission: web form with name, email, public GitHub repo URL (MIT licence), optional hosted playable build link, technologies and GenAI tools used, optional company affiliation.
- README must let judges run the game from a repository clone.

## Scoring (100 points)

| Points | Criterion |
|---|---|
| 40 | Originality — unexpected genre, mechanic or reading of the brief |
| 20 | Realism — robot movement and spatial behaviour reflecting physics |
| 15 | Playability — clear goals, intuitive controls, feedback |
| 10 | All three robots used meaningfully |
| 10 | Sense of place — venue recognisable |
| 5 | GenAI craft documentation |

## Prizes

1st: Combi ticket (€2,135) + demo slot on the keynote stage. 2nd: Conference ticket. 3rd: Deep Dive ticket. One ticket per entry; teams designate a recipient.

## The robots

- **Voxxy (Model 01)** — "The orange companion. Rounded shell, glowing eyes and long, articulated arms." Light, curious, quick on its feet; "the one players will want to control." Glowing amber eyes.
- **Droid (Model 02)** — "A tall mechanical silhouette with weathered graphite panels and exposed joints." Tall, weathered, deliberate; "it has been in this building a long time." Amber eyes, scuffed panels.
- **Biggy (Model 03)** — "A stocky little heavyweight with blue-gray armor and a weathered orange belly." Short legs, heavy armour, no hurry; "slow to start and hard to stop once it is moving."

Model sheets (multi-view PNGs, copies in `robots/`):
- https://game.devoxx.be/references/robots/voxxy-robot.png?v=2 (2752×1536)
- https://game.devoxx.be/references/robots/droid-robot.png?v=2 (1376×768)
- https://game.devoxx.be/references/robots/biggy-robot.png?v=2 (2752×1536)

## The venue — Kinepolis Antwerp

Two levels of one building:
- **Ground floor — exhibition hall**: main entrance, reception, booths, catering, BOF rooms, toilets; structural column grid; two secondary staircases inside the hall up to the cinema corridor.
- **First floor — cinema level**: auditoriums with raked seating (Devoxx uses rooms 3–10), the central corridor between them, the curved foyer with pendant lighting, the unnumbered cinema rooms Devoxx does not use.
- **Main (grand) staircase** connects the exhibition floor to the corridor end between rooms 6 and 7; **secondary staircases** come up into the corridor level with rooms 4 and 9, standing in it against its two walls (**corrected 24 Sep 2026** from "between rooms 3|4 and 10|9", which is not what `plans/devoxx-rooms-stairs-annotated.png` draws; the measurement is in `src/sim/geometry.ts`).

Floor plans (copies in `plans/`):
- Exhibition hall, raw: https://game.devoxx.be/references/venue/maps/hollywood-area.png
- Exhibition hall, annotated: https://game.devoxx.be/references/venue/maps/exhibition-floor.jpg
- Auditoriums, raw: https://game.devoxx.be/references/venue/maps/cinema-venue-devoxx.png
- Devoxx rooms, annotated: https://game.devoxx.be/references/venue/maps/devoxx-rooms.jpg

Photographs (14, copyleft; see `media/DOWNLOAD.md`) and drone footage (YouTube): Drone Letters https://www.youtube.com/watch?v=yKDz1ZAXc-M · Kinepolis Hallway https://www.youtube.com/watch?v=7o9SjnBgcQM · Exhibition Hall https://www.youtube.com/watch?v=sfDMXs3TPkE · Keynote Room https://www.youtube.com/watch?v=V6eNRv4Fum4. More photos: https://www.flickr.com/photos/bejug/albums/

## Organisers' example GenAI prompts (verbatim)

Robot: "Create a detailed 3D robot from the attached model sheet. Match its proportions, silhouette, colors, materials and visible mechanical details across the different views. Articulate the head, shoulders, elbows, wrists, fingers, hips, knees and ankles. Animate idle motion, walking and running with planted feet, coordinated arm swing and smooth transitions. Make the robot controllable with WASD on a flat ground plane."

Venue: "Use the attached cinema floor plans to create a 3D environment for a robot exploration game. They are two levels of one building: the exhibition hall on the ground floor and the auditoriums on the first floor. Stack them, and connect them with the grand staircase that lands in the foyer. Preserve the relative placement of the auditoriums, corridors and entrances. Use the visible seating layouts and room connections as a guide. Add collision boundaries so the robot walks through doorways and corridors, and can climb between the levels. Where heights, materials or dimensions are not specified, make consistent assumptions and list them."
