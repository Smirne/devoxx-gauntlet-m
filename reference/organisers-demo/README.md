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

All six are the demo's own default studio setup: dark ground plane, single key light, soft contact
shadow. Two of them carry a sliver of the page's overlay text at the left edge — left in rather than
cropped, so it stays obvious these are screenshots of someone else's page and not our renders.

| file | robot | camera |
| --- | --- | --- |
| `voxxy-front.webp` | Voxxy | front elevation, near-level |
| `voxxy-three-quarter.webp` | Voxxy | ~60 degrees off front — side port and ear profile |
| `droid-front.png` | Droid | front elevation, slight high angle |
| `droid-three-quarter.webp` | Droid | near-profile — shoulder hoop and the joint stacks down the leg |
| `biggy-front.webp` | Biggy | front elevation — belly stencil, dome ports, boots |
| `biggy-three-quarter.webp` | Biggy | ~70 degrees off front — the hoop-and-hose assembly under the belly |

The two three-quarter views are the more useful of each pair: they show the joint construction and
how each robot's masses stack, which a front elevation flattens away.

## Why the screenshots and not the live page

This build environment's network policy blocks `game.devoxx.be` (the egress proxy answers 403 to
the CONNECT), so the demo cannot be opened from a session. Screenshots are the way the reference
reaches the build.
