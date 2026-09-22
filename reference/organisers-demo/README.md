# The organisers' reference demo — screenshots

Screenshots of the organisers' own interactive 3D robots at
`game.devoxx.be/references/?robot=voxxy|droid|biggy`, captured by Michele and kept here as the
**quality bar**.

## How to read these

Michele's ruling, verbatim: *"this is mostly a reference for expected quality, the appearance is
defined in the sheets."*

So the two references do different jobs and must not be confused:

| source | authority over |
| --- | --- |
| `robots/*.png` model sheets | **what the robot looks like** — shape, proportion, colour, which features exist |
| these screenshots | **how well it is made** — finish, gloss, panel detail, weathering, edge quality, silhouette read |

Where the demo and a sheet disagree, the sheet wins. The demo's Droid in particular diverges from
our sheet noticeably, which is itself the useful signal: the organisers allowed themselves that
latitude, so exact fidelity is not the bar — comparable craft is.

The organisers' own note on the page: *"The robot behind this panel is one possible look and feel
… a reference to work from, not a kit to ship. Build your own from the model sheets."* Their code
is **not** to be copied. Nothing in `src/` derives from their bundle; these are look-and-feel
reference images only, the same way the model sheets are.

## Files

- `voxxy-front.webp` — front elevation, near-level camera.
- `voxxy-three-quarter.webp` — roughly 60 degrees off front, showing the side port and the ear profile.

Droid and Biggy screenshots are still to be added.

## Why the screenshots and not the live page

This build environment's network policy blocks `game.devoxx.be` (the egress proxy answers 403 to
the CONNECT), so the demo cannot be opened from a session. Screenshots are the way the reference
reaches the build.
