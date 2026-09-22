# What the organisers' demo does better than we do

Written from the screenshots in `reference/organisers-demo/` (Voxxy) and from the Droid and Biggy
shots Michele showed in session. **The sheets remain the authority on appearance**; this file is
only about craft — the gap between "the right robot" and "the right robot, well made".

Each section ends with the specific defects in our current build, which is the brief for the
polish round. Michele's own priority order per robot is given first and outranks anything below it.

---

## Voxxy — *his order: hands, eyes; then details, legs, polish*

**Visor.** The demo's visor is a **rounded-corner rectangle with a thin light-grey bezel**,
wrapping the front of the head, roughly two-thirds of head width and under half its height. The
glass is near-black with two or three broad specular streaks across it and nothing else. Ours is a
big black **oval** covering most of the face, filled with a **dot-matrix texture** that exists in
neither the sheet nor the demo. The dot matrix should go: it is reading as noise at play scale and
it flattens the glass.

**Eyes.** The demo draws them as two small **rounded-rectangle lamps** with a lattice of dark bars
across them — a lit grille, not a solid fill — each ringed by a darker amber bezel, sitting low in
the visor at about 60-65% of the way down.

**The sheet disagrees on that last point and the sheet wins: on the sheet the eyes are vertically
centred** (centre 0.498 of the way down the visor). Take the demo's *craft* — a lamp with structure
in it rather than a flat fill — and the sheet's *placement*.

The sheet's robust numbers, from the threshold sweep in the measurement pass:

| quantity | target | stable across |
| --- | --- | --- |
| eye centre-to-centre / visor width | **0.417** | 0.398-0.426 |
| one eye centre, x from visor centre / visor width | 0.207 | 0.186-0.226 |
| eye centre, y from visor top / visor height | 0.498 | 0.488-0.504 |
| eye aspect (w/h) | 1.44 | 1.38-1.65 |
| eye width / visor width, at half peak | 0.138 | level-dependent, state the level |
| eye height / visor height, at half peak | 0.181 | level-dependent, state the level |

**Eye *area* is not a measurable quantity on this sheet** and must never be used as a target again:
it sweeps 0.004 to 0.081 depending only on where the threshold is put. An earlier round's
"4.4-7.1% of visor area" was an artefact of that, and it was quoted in this document's first draft
as though it were solid. It is not. The centre-to-centre distance is the number to check.

**Why this matters more than any single figure:** the sheet's eyes are a **soft radial glow with no
hard edge** — the 10%-to-90% falloff takes 0.56 x FWHM per side, where the silhouette's own edge
falls from 255 to 70 in two pixels. A hard-edged game shape compared against a thresholded glow
gives a different answer every time the threshold moves, which is exactly what happened for four
rounds. **Author the eyes as a glow, not as a lit rectangle**, and the comparison becomes stable.

What is not in doubt either way: ours currently touch in the middle of the face, against a sheet
that puts two eye-widths of black between them.

**Ears.** Pointed teardrops angled outward about 25 degrees, overlapping the crown, each carrying a
small **white inner-ear decal**. Ours are rounded blobs with white caps sitting at the wrong angle
and no inner marking.

**Hands — Michele's first item.** The demo arm is a fat teardrop upper mass, then a **clean white
cuff band**, then a narrower orange forearm tapering down and inward to a **small black pointed
claw**. One band, not our stack of white-and-orange stripes, and the claw is a distinct terminal
part rather than the black stub we currently end on.

**Legs and feet.** Thin orange cylinders set close together, a **white ring at the ankle**, and
proper little **rounded boots with a row of four black toe pads** on each. Ours are stick legs
ending in nubs. This is cheap geometry for a large gain — the feet are what sell a robot as
standing rather than floating.

**Body details.** A clean **equatorial seam** across the egg, the cub emblem **smaller and higher**
than ours, a small black hemisphere button on the upper chest, a thin dark slot low on the belly
and a **single green LED** beside it.

**Finish.** High-gloss clearcoat with broad soft speculars and a soft contact shadow. Ours is
comparatively matte, which is most of why it reads as cheaper even where the shapes are right.

---

## Droid — *his order: shoulder, face, torso*

Michele's note: *"he's quite different from the sheets"* — true, and it is the clearest licence we
have that matching the demo shape-for-shape is not the goal. Take the craft, keep our sheet's
shapes.

**Shoulders.** Big circular dome pauldrons held by a **bright orange hoop** around the
circumference, mounted outboard of the torso. The hoop is the single most recognisable thing on the
model. Ours are plain domes with a small spiral decal and no ring.

**Face.** A **boxy rounded-cuboid helmet** with a bevelled top edge, not a smooth dome, and the two
small amber eyes sit **low and close together** with a jaw plate beneath. The neck behind it is a
**ribbed concertina column** with a thin orange collar ring at the base.

**Torso.** A tapered keystone chest carrying real panel work: rectangular vents **outlined in
orange piping**, a recessed central louvre panel, small grilles. Orange is used throughout as
**piping and rings**, never as a filled area — that restraint is what keeps it from looking toylike.
Ours is a flat plate with a couple of decals.

**Joints.** Hips and knees are **stacked ribbed discs**, like washers on a shaft, each with an
orange ring; there is an **X-shaped orange harness** across the groin. Hands are splayed skeletal
rakes of four or five clearly separated thin fingers. Feet are flat wedge slabs with an
orange-ringed ankle disc.

**Finish.** Dark desaturated navy over graphite with a fine **weathering speckle** — not flat paint.

---

## Biggy — *his order: belly, helmet, arms, trousers*

**Belly.** A **near-perfect sphere**, and it dominates the silhouette — the dome sits on it like a
lid rather than the two being comparable masses. It carries **meridian panel seams**, one low
horizontal seam, a **circular white stencil emblem** with a robot glyph, a small rectangular decal
plate, and heavy **chipped-paint weathering**: orange worn through to large irregular dark grey
patches. Ours is a squashed ellipsoid, too clean, and too close in size to the dome.

**Helmet.** A low riveted **steel-blue dome with a flared brim** and a black gasket band beneath
it, two **recessed circular port lenses** on the front face of the dome, and a thin **whip antenna**
from the crown. Painted metal chipping to orange primer and bare steel. Ours is a smooth dome with
no brim, no rivets and no gasket.

**Arms.** An angular **blue pauldron cap** over the shoulder, a **thick cylindrical upper arm**, a
ring joint with a lens disc, and a **blocky grey hand with four stubby segmented fingers** — a work
glove, not a claw. Ours are thin segmented sticks.

**Trousers.** Below the belly, a **blue-grey hoop/skirt assembly with a ribbed hose wrapped around
it**, then short tapered conical legs into **wide moulded grey boots** with a rounded splayed sole.
Ours has a plain blue band and block boots on a flat tray.

**Finish.** Matte to satin painted metal, no gloss anywhere. Biggy is the one robot where gloss
would be wrong.

**Note on the eyes.** The demo shows no lit face at all — the dome ports are dark lenses. The sheet
is now confirmed to agree: a bright-and-saturated search across the whole front elevation returns
only belly highlights and the white "ii" decal, and what reads as eyes are two **dark metal lens
bezels** on the dome (diameter 0.106 of dome width, spacing 0.373). There is no visor slot either —
the apparent slot is a shading seam, and its measured height swings 6.7x across a threshold sweep.

Our Biggy keeps the two amber eyes regardless: that is **Michele's standing decision** from an
earlier round, made in full knowledge that the sheet does not have them, and it is not up for
revision here. The sheet is simply now confirmed silent rather than merely unclear.

---

## The one defect no reference found

Biggy's left knee has a sawtooth artefact, invisible at the portrait angle and visible only in a
level front elevation. It came out of our own geometry, not out of any reference disagreement, and
it gets fixed this round regardless of anything above.
