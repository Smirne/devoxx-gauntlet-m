# Michele's playtest notes, and what happened to each

The gauntlet's automated critics check what they were told to check. This file is the other half:
what a human found by playing the thing. It is kept because the pattern in it is the useful part —
almost everything here was invisible to a passing test suite, and several items had been passing a
green check for four rounds.

Status key: **done** shipped and pushed · **open** not started · **waiting** needs a decision ·
**in flight** an agent has it now.

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
