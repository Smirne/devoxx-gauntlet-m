/**
 * biggy.ts — Model 03, "a stocky little heavyweight with blue-gray armor and a
 * weathered orange belly".
 *
 * Built from `robots/biggy-robot.png` for APPEARANCE and from
 * `reference/organisers-demo/biggy-*.webp` for CRAFT. Where they disagree the
 * sheet wins; the screenshots only say how well a thing has to be made.
 *
 * The read is ONE THING: **a huge round gut with a tin lid on it.**
 *
 * THE BELLY IS A BALL ON TOP AND A TUCKED-IN ONE UNDERNEATH.
 * ---------------------------------------------------------
 * Fitting a circle to the sheet's front elevation — flood-filled, 584 px crown
 * to 976 px sole, so 392 px tall — the belly's own outline is a circular arc of
 * radius 0.41 of the figure's height whose centre sits a little under halfway
 * up. Sampled at three heights the fit is within two pixels each time, which is
 * as close to "it is a sphere" as a painted sheet gets. What hides that is the
 * occlusion: the helmet is a LID over the ball's top cap and the trousers are a
 * block under its bottom cap, so only the middle 60% of a sphere is ever in
 * view. The build before that drew the visible part as a squashed ellipsoid —
 * 1.2 m across by 0.75 tall — and got a cushion instead of a ball. The profile
 * is the circle itself (`BELLY_R` about `BELLY_CY`), cut at the two heights
 * where the other parts take over, so the outline curves like a sphere because
 * it is one.
 *
 * Those three sample heights were all above the equator, and below it the sheet
 * is NOT a circle — it tucks, which is the whole of the waist. That correction
 * is `BELLY_TUCK`, and it is confined to the underside: at and above the widest
 * ring the fitted circle is untouched, down to the last millimetre and the last
 * texture coordinate.
 *
 * Three ratios are asserted in `tests/robots.smoke.test.ts` and none of them
 * moved: the gut is 0.83 of his height across (sheet 0.82), the whole figure
 * 1.00 (sheet 0.97 — the arms hang OUTSIDE the gut), and the dome 0.80 of the
 * gut (sheet 0.75), so the gut overhangs the helmet all the way round.
 *
 * THE HELMET, THE ARMS AND THE LEGS COME OFF THE SHEET, NOT OFF THE DEMO.
 * ----------------------------------------------------------------------
 * A previous round dressed all three from `reference/organisers-demo` — a
 * flared cone brim, big pauldron caps, an elbow lens disc, a whip antenna — and
 * the owner's note was the obvious one: "the helmet is still quite different,
 * and so arms and legs". None of those four things is on `biggy-robot.png`.
 * Everything below is measured off the panel labelled FRONT VIEW (r1c0, source
 * rect 0,512..917,1024; crown at y=585, sole at y=990, so 405 px = 1.45 m and
 * one source pixel is 3.58 mm). The first, unlabelled 3/4 panel is a different
 * camera and has misled this file twice; nothing here is measured from it.
 *
 * What the front view actually has, top to bottom:
 *   - a wide, low, flat-crowned blue dome, 0.891 m across by 0.304 tall on the
 *     sheet (w/h 2.93) — and it is NOT an ellipse cap: its crown is flat out to
 *     r = 0.245 and its flanks are far straighter than an ellipse's, which is
 *     why the old sphere cap read as a beanie. It is a lathe through the
 *     measured rows now;
 *   - a shallow recessed band cut into the dome's brow, 36 mm tall on the sheet,
 *     with a bright steel trim edge overhanging it. There is no brim. The
 *     overhang is the dome's own step;
 *   - two rounded blue side lobes hanging at 10 and 2 o'clock over the gut's
 *     shoulders, each with a small orange rivet dot — the most characterful
 *     thing on the sheet and the thing this model was missing entirely;
 *   - two concentric-ring lens ports high on the dome's front slope, 0.106 of
 *     the dome's width across and 0.373 apart (`docs/model-sheet-targets.md`);
 *   - two flat-topped ribbed fittings on the crown's shoulders;
 *   - one smooth slab forearm per side, hanging straight down outside the gut,
 *     with a narrow cuff and a dark hand of four LONG three-segment fingers —
 *     0.15 m of finger on a 0.40 m arm. No pauldron, no ring joint, no lens;
 *   - a boxy trouser mass 0.60 of his height across — a good deal NARROWER than
 *     the gut, which is the point of it — squared off at the bottom, with a
 *     dark vented undercut above it, a fan of three diagonal wrap folds either
 *     side and a belt plate flush with its bottom edge;
 *   - two short legs set well apart, each a fat concertina, a smaller two-ring
 *     bellows and a wide grey moulded boot. The whole leg is 0.19 m of his 1.45.
 *
 * The belly's paint, the helmet and the legs are NOT part of that: each was
 * signed off in one of the rounds before this one and is left exactly as it was
 * found. The belly's UPPER half goes with the paint — "the belly is better, the
 * color is nice" — and only its underside was reopened, with the ruling that
 * reopened it: "the gut / pants is an hard NO. stick to the model sheet."
 *
 * Finish is matte to satin throughout. Biggy is the one robot where gloss would
 * be wrong, so nothing here goes above 0.55 metalness and the painted panels sit
 * at 0.85+ roughness.
 */

import * as THREE from 'three';
import { ROBOT_HEIGHT_M } from '../../sim/units';
import {
  assertBones,
  boltRing,
  clamp,
  disposeTree,
  ellipsoid,
  glowMaterial,
  joint,
  lerp,
  ovalPatch,
  panelMaterial,
  part,
  puck,
  roundedBox,
  smoothstep,
  type RobotRig,
  type WeatherOpts,
} from './rig';

/*
 * Vertical layout, metres from the sole, held to ROBOT_HEIGHT_M.biggy = 1.45.
 *
 * The SKELETON is unchanged from the build this replaces — `gait.ts` derives
 * Biggy's stride, crouch and knee angle from the bone positions, and every one
 * of those numbers was tuned against these. Only the shells moved.
 */
const ANKLE_Y = 0.13;
const KNEE_Y = 0.27;
const HIP_Y = 0.43;
const TORSO_Y = 0.5;
const SHOULDER_Y = 0.88;
const NECK_Y = 1.06;
/**
 * The dome's rim — the helmet is a lid dropped straight onto the belly.
 *
 * 1.148 is where the sheet's helmet is widest (source y = 672), which is also
 * where it stops: the rim is the widest thing on the hat, not a brim below it.
 */
const HEAD_Y = 1.148;
const SHIN = KNEE_Y - ANKLE_Y;
const THIGH = HIP_Y - KNEE_Y;

/* ------------------------------------------------------------ the ball */

/** The gut's radius: 1.20 m across = 0.83 of his height (the sheet's is 0.82). */
const BELLY_R = 0.6;
/** Centre of the sphere. The sheet's fit puts it at 0.45 of the height. */
const BELLY_CY = 0.735;
/** Where the trousers take over from the ball. */
const BELLY_CUT_LO = 0.256;
/** Where the helmet's gasket takes over. */
const BELLY_CUT_HI = 1.15;
/**
 * HOW HARD THE GUT TUCKS IN UNDER ITS OWN EQUATOR.
 *
 * The round above this file said the sheet's gut is a circle. It is — for the
 * top half. Traced again off the FRONT VIEW panel, this time by following the
 * dark crease where the gut meets the arm rather than where its orange paint
 * runs out (which stops at the terminator and reads 20 px narrow in the
 * shadow), the two halves are not the same curve. With the gut's own equator at
 * source row 800 and its half-width there 151 px, and writing `t` for how far
 * below the equator a row is in units of that half-width:
 *
 *   t      0.13   0.20   0.27   0.33   0.40   0.46   0.50
 *   sheet  0.987  0.970  0.944  0.907  0.848  0.781  0.755
 *   circle 0.991  0.980  0.964  0.944  0.918  0.886  0.868
 *
 * The residual is `1 - 1.06 t^3` to within a pixel at every sampled row, so
 * that is what the profile multiplies the circle by. It is one number and it is
 * the whole difference between a ball and a man with a waist: at the height
 * where the trousers start the gut is 0.417 m across the axis instead of the
 * circle's 0.507, which is what lets a trouser block at the SHEET'S width sit
 * under it and be seen. Everything at or above t = 0 is untouched — the widest
 * ring is still exactly `BELLY_R`, which is the ring the asserted gut width,
 * the dome ratio and the silhouette ratio are all measured at.
 */
const BELLY_TUCK = 1.06;

/**
 * Radius of the gut at world height `y` — exact, no table to drift out of step.
 *
 * Above the equator this is the fitted circle, unchanged. Below it the circle
 * is scaled by the tuck (see `BELLY_TUCK`). Both factors fall to zero before
 * `y` runs out, so the shell closes without a lip at either end.
 */
function ballR(y: number): number {
  const d = (y - BELLY_CY) / BELLY_R;
  if (d <= -1 || d >= 1) return 0;
  const t = Math.max(0, -d);
  return BELLY_R * Math.sqrt(1 - d * d) * Math.max(0, 1 - BELLY_TUCK * t * t * t);
}

/**
 * The belly's lathe profile, `[radius, worldY]`, bottom to top.
 *
 * The section is sampled by ANGLE and forced through theta = 0, so the lathe's
 * widest ring is exactly `BELLY_R` and the asserted gut width cannot drift with
 * the sample count. Above and below the cuts the profile closes with a few
 * steep points: they are inside the helmet and inside the trousers
 * respectively, and the steepness is deliberate — a shallow closure would meet
 * the leg cones almost tangentially, which is precisely the geometry that used
 * to saw the left knee into a row of notches.
 *
 * THE HEIGHTS IN THIS LIST ARE LOAD-BEARING AND THE RADII ARE NOT. `bellyV`
 * walks the same list to turn a world height into a texture `v`, and
 * `LatheGeometry` lays the map out by profile INDEX, so the stencil, the
 * meridian seams and the hatch decals are all pinned to this column of `y`
 * values and to their count. The tuck therefore changes only the radius at each
 * of the heights the circle already had: the sampling, the count and every `y`
 * are exactly what they were, so nothing painted on the gut moved.
 */
function bellyProfile(): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  // Bottom cap, inside the trousers — tucked in step with the shell above it.
  pts.push([0, 0.2455], [0.083, 0.2465], [0.139, 0.2495], [0.161, 0.2525]);
  const t0 = Math.asin((BELLY_CUT_LO - BELLY_CY) / BELLY_R);
  const t1 = Math.asin((BELLY_CUT_HI - BELLY_CY) / BELLY_R);
  const nLo = 13;
  const nHi = 11;
  for (let i = 0; i <= nLo; i++) {
    const t = t0 + ((0 - t0) * i) / nLo;
    const y = BELLY_CY + BELLY_R * Math.sin(t);
    pts.push([ballR(y), y]);
  }
  for (let i = 1; i <= nHi; i++) {
    const t = (t1 * i) / nHi;
    pts.push([BELLY_R * Math.cos(t), BELLY_CY + BELLY_R * Math.sin(t)]);
  }
  // Top cap, inside the dome.
  pts.push([0.36, 1.178], [0.22, 1.2], [0, 1.208]);
  return pts;
}

const BELLY_PTS = bellyProfile();

/** Texture `v` for a world height on the belly — where the seams and decals go. */
function bellyV(y: number): number {
  const n = BELLY_PTS.length;
  for (let i = 1; i < n; i++) {
    if (y <= BELLY_PTS[i][1]) {
      const y0 = BELLY_PTS[i - 1][1];
      const y1 = BELLY_PTS[i][1];
      const f = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return (i - 1 + f) / (n - 1);
    }
  }
  return 1;
}

/* --------------------------------------------------------- the helmet */

/**
 * Dome: 0.884 m across, 0.302 tall — w/h 2.93, the sheet's own number.
 *
 * Against the gut that is 0.737, and the sheet's is 0.891/1.21 = 0.736. The
 * build this replaces had 0.956 m of dome (0.80 of the gut) and then hung a
 * 1.036 m flared brim under it: the dome's own aspect was right, but the brim
 * was 17% wider than anything on the sheet and added 0.17 m of black skirt and
 * gasket under it, so the head read as a hat and a half. Narrower and brimless
 * is the correction — the sheet's helmet is widest at its own rim.
 */
const HELM_R = 0.442;
const HELM_H = 0.302;
/**
 * The recessed brow band, in dome-local height. 42 mm against the sheet's 36;
 * the 6 mm buys a 32 mm eye lens instead of a 26 mm one, and 26 mm stops being
 * a lamp at play scale. See the eyes, below.
 */
const BROW_Y0 = 0.048;
const BROW_Y1 = 0.09;
/** The groove's floor, 6-8 mm inside the dome's surface at that height. */
const BROW_R = 0.4;

/**
 * The dome's lathe profile, `[radius, dome-local y]`, bottom to top.
 *
 * Rows 592..673 of the sheet's front view, divided by 1.21 m of sheet gut and
 * multiplied by our 1.20, with the brow groove cut into the run between 0.041
 * and 0.093 and a rolled rim added below zero (that part is inside the gut and
 * only exists so the hat does not end in a visible open edge).
 *
 * The thing worth keeping when this is next touched: the flanks between r = 0.24
 * and r = 0.40 are far straighter than any ellipse through the same two ends,
 * and that is what makes it a helmet shell rather than a cap. The crown itself
 * measures almost flat on the sheet — the half-width does not move over four
 * sampled rows below the apex — but building it that way gave the dome a hard
 * lid edge that nothing on the sheet has, so the last 30 mm is rounded off and
 * the flat is left as a tendency rather than a facet.
 */
const DOME_PTS: Array<[number, number]> = [
  [0.352, -0.052],
  [0.404, -0.03],
  [0.432, -0.012],
  [HELM_R, 0.0],
  [0.436, 0.022],
  [0.43, 0.041],
  [BROW_R, BROW_Y0],
  [0.398, 0.07],
  [BROW_R, BROW_Y1],
  [0.409, 0.096],
  [0.401, 0.11],
  [0.389, 0.132],
  [0.376, 0.154],
  [0.36, 0.176],
  [0.34, 0.198],
  [0.317, 0.219],
  [0.29, 0.24],
  [0.268, 0.256],
  [0.243, 0.27],
  [0.212, 0.282],
  [0.168, 0.292],
  [0.105, 0.299],
  [0, HELM_H],
];

/* ----------------------------------------------------------- the arms */

/**
 * ONE SLAB PER SIDE, hung OUTSIDE the gut.
 *
 * The sheet's arm is a single flat-faced rounded block 0.247 m across hanging
 * from under the side lobe to below the trousers, a narrow cuff, and then a
 * long-fingered hand. There is no pauldron and no elbow. `UPPER_ARM` is
 * therefore only the dark linkage between the shoulder ball and the top of the
 * slab, and `FOREARM` is the slab itself plus its cuff.
 *
 * The pair sit 0.07 m forward of the belly's axis, and the outermost point of
 * the figure is the cuff at 0.697. Both numbers are there for the same reason:
 * the portrait camera stands 34 degrees off the front, which foreshortens an
 * arm's sideways offset by cos 34 = 0.83 while leaving a solid of revolution
 * exactly as wide as it ever was, so an arm merely level with the belly's edge
 * is BEHIND it from that camera. A test measures the clearance in exactly that
 * projection. The sheet puts the slab's outer face at 0.677 and the sim's
 * collision radius is 0.68; the silhouette band `carries its bulk in the belly`
 * asserts needs the figure at least 1.348 m across, which puts the arm's outer
 * face at 0.674 at the very least, so nothing inside the collision radius is
 * reachable with a slab arm. 0.6905 is where those three pull to.
 */
const SHOULDER_X = 0.568;
const SHOULDER_Z = 0.07;
const UPPER_ARM = 0.2;
const FOREARM = 0.4;
/** The slab: 0.245 across, 0.21 deep, 0.34 long, then a 0.036 cuff. */
const FORE_W = 0.245;
const FORE_D = 0.21;
const FORE_LEN = 0.34;

/* ------------------------------------------------------------ the legs */

/**
 * Hip spacing. The sheet's boot centres are 0.253 m either side of the gut's
 * axis and its boots are 0.207 m wide, so the stance measures 0.677 outer to
 * outer — 0.503 of the figure's width, which is what
 * `docs/model-sheet-targets.md` reports for it. 0.255 rather than 0.253 is two
 * millimetres of slack left over from the round when the trousers were 0.15 m
 * too wide; it is inside the legs, which are signed off, so it stays.
 */
const HIP_X = 0.255;
/** Where the trousers stop and the concertina starts. */
const LEG_TOP = 0.212;
/** Where the trousers' own bottom face sits, just inside `LEG_TOP`. */
const SHORTS_Y0 = 0.205;
/**
 * Where the rusted orange of the trousers stops and the dark vented undercut
 * above it starts. Sheet row 895, and the gut's lip is at row 877 — 65 mm of
 * dark band between the two, which is where the vents live.
 */
const SHORTS_Y1 = 0.35;
/** The top of the dark undercut block. Buried in the gut; only has to reach. */
const SHORTS_Y2 = 0.47;
/**
 * HOW WIDE THE TROUSERS ARE, MEASURED RATHER THAN ARGUED.
 *
 * Flood-filled off the FRONT VIEW panel the block runs from x = 300 to x = 540
 * at source row 888, where it first clears the arms: 241 px on a figure 402.5 px
 * tall, so 0.599 of his height, so 0.868 m at our 1.45. 0.86 here, a centimetre
 * under, because the arm slabs hang at 0.4455 and the sheet leaves daylight
 * between the two rather than tucking one behind the other.
 *
 * Against our gut that is 0.717. The 1.00 m block this replaces was 0.833 of
 * it, and the note that came with it — "1.00 m across clears the sphere at
 * y = 0.408, and that is the number the sphere chooses for us" — was true and
 * was the whole problem: it was a workaround for a gut that did not tuck, it
 * overlapped the arm's inner edge by 55 mm, and it made the folds on it read as
 * planks because nothing else at that height was anywhere near as wide. The gut
 * tucks now, so the sheet's own number fits.
 */
const SHORTS_HW = 0.43;
/** Depth. The LEFT PROFILE panel gives 0.92 m through the hips; 0.88 here. */
const SHORTS_HD = 0.44;

/* ------------------------------------------------------- paint texture */

/** The belly's paint map. 1536 wide is about 400 px per metre of its equator. */
const BELLY_TEX_W = 1536;
const BELLY_TEX_H = 480;

const fract = (v: number): number => v - Math.floor(v);

/**
 * An INTEGER lattice hash, and why it is not the sin-based one `rig.ts` uses.
 *
 * `rig.ts` hashes a lattice point with `fract(sin(dot) * 43758.5)`, which is the
 * right trade when it runs a few thousand times over a mesh's vertices. This
 * runs per TEXEL: three quarters of a million of them for the belly, eight
 * lattice corners per octave, and at that volume the transcendental dominates
 * everything. Measured on the build box, the sin hash baked Biggy's two maps in
 * 2.6 seconds of dead time at startup; the xxhash-style integer finaliser below
 * does the same job in under 0.4, and nobody can tell the two noise fields apart
 * by eye. `Math.imul` is what keeps the multiplies in 32-bit.
 */
function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let n =
    Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177) ^ Math.imul(seed, 2654435761);
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Trilinear value noise. Written out flat: a closure per call costs real time here. */
function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const a000 = hash3(ix, iy, iz, seed);
  const a100 = hash3(ix + 1, iy, iz, seed);
  const a010 = hash3(ix, iy + 1, iz, seed);
  const a110 = hash3(ix + 1, iy + 1, iz, seed);
  const a001 = hash3(ix, iy, iz + 1, seed);
  const a101 = hash3(ix + 1, iy, iz + 1, seed);
  const a011 = hash3(ix, iy + 1, iz + 1, seed);
  const a111 = hash3(ix + 1, iy + 1, iz + 1, seed);
  const x00 = a000 + (a100 - a000) * ux;
  const x10 = a010 + (a110 - a010) * ux;
  const x01 = a001 + (a101 - a001) * ux;
  const x11 = a011 + (a111 - a011) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

function fbm3(x: number, y: number, z: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + o * 19);
    norm += amp;
    f *= 2.07;
    amp *= 0.5;
  }
  return clamp(sum / norm, 0, 1);
}

interface PaintOpts {
  /** Texture size. Width wraps all the way round, height runs bottom to top. */
  w: number;
  h: number;
  /** The paint, what shows through when it chips, and the primer ring between. */
  base: string;
  chip: string;
  primer: string;
  /** Radius and arc length of the surface, so the chips come out isotropic. */
  turnR: number;
  spanM: number;
  /** Chips per metre. */
  freq: number;
  /** 0 = factory fresh, 1 = the whole panel is bare. */
  coverage: number;
  seed: number;
  /** Extra darkening toward the bottom, where twenty years of grime settles. */
  grime?: number;
  /**
   * For a texture on a SPHERE CAP: the polar angle the map spans, in radians.
   *
   * A sphere's uv columns all converge on its pole, so a chip sampled at a
   * constant angular frequency is squeezed into a radial sliver near the crown
   * and the whole dome comes back wearing a starburst. Given the span, the
   * sampling circle shrinks with `sin(theta)` exactly as the real circumference
   * does, so a chip keeps its size in metres all the way up and the pinch
   * simply makes the paint near the crown uniform — which is what it looks like.
   */
  capSpan?: number;
}

/**
 * A hex literal straight to CANVAS BYTES.
 *
 * Not via `THREE.Color`: colour management is on, so `Color.set('#d2793c')`
 * stores the LINEAR value, and writing that into an ImageData the texture then
 * declares as sRGB applies the transfer twice. The first cut of this texture did
 * exactly that and Biggy came back oxblood instead of orange. The hex is already
 * sRGB — read the bytes out of it and leave them alone.
 */
const srgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * Chipped painted metal, generated into a canvas — **no asset file, and nothing
 * that needs a GL context**, so the headless tests build the same robot with
 * this step simply skipped.
 *
 * The noise is sampled on a CYLINDER (`cos u`, `sin u`, `v`) rather than on the
 * flat uv plane, so it is exactly periodic across the texture's vertical seam:
 * the wrap that would otherwise draw a bright line down the back of the belly
 * cannot exist. The two radii scale the sampling so a chip is the same size in
 * metres whichever way it runs.
 */
function paintTexture(o: PaintOpts): { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = o.w;
  canvas.height = o.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(o.w, o.h);
  const d = img.data;
  const base = srgb(o.base);
  const chip = srgb(o.chip);
  const primer = srgb(o.primer);
  // Turn "coverage" into the noise threshold that produces it. The fbm is
  // roughly uniform about 0.5, so this maps 0..1 onto a usable 0.72..0.40.
  const edge = lerp(0.72, 0.4, clamp(o.coverage, 0, 1));
  const grime = o.grime ?? 0.3;
  const capSpan = o.capSpan ?? 0;
  const ax = o.turnR * o.freq;
  const ay = o.spanM * o.freq;
  for (let py = 0; py < o.h; py++) {
    const v = 1 - (py + 0.5) / o.h;
    for (let px = 0; px < o.w; px++) {
      const u = (px + 0.5) / o.w;
      const a = u * Math.PI * 2;
      const shrink = capSpan > 0 ? Math.max(Math.sin((1 - v) * capSpan), 0.05) : 1;
      const nx = Math.cos(a) * ax * shrink;
      const nz = Math.sin(a) * ax * shrink;
      const ny = v * ay;
      const n = fbm3(nx, ny, nz, o.seed, 3);
      const n2 = fbm3(nx * 2.6, ny * 2.6, nz * 2.6, o.seed + 7, 2);
      /*
       * A worn patch is the top of the noise range only, so the paint chips in
       * discrete islands with hard edges instead of fading off into a wash —
       * and at TWO scales, because a single one gives the dark continents the
       * first cut of this texture had. The coarse field is the big flaked
       * areas; the fine one scatters flakes off their edges the way real
       * chipped paint spreads.
       */
      const big = smoothstep(edge, edge + 0.03, n);
      const small = smoothstep(edge + 0.02, edge + 0.048, n2) * (0.3 + 0.7 * smoothstep(edge - 0.18, edge, n));
      const bare = clamp(big + small * (1 - big), 0, 1);
      // ...ringed by a hairline of exposed primer, which is what stops a chip
      // reading as a decal printed on top of the paint.
      const ring = smoothstep(edge - 0.04, edge - 0.01, n) * (1 - bare);
      // The fine chip field doubles as the speckle: a third fbm per texel bought
      // nothing the eye could name and cost a third of the bake.
      const shade = 1 - grime * (1 - v) * 0.5 - 0.16 * (n2 - 0.5);
      const i = (py * o.w + px) * 4;
      for (let k = 0; k < 3; k++) {
        let c = lerp(base[k], primer[k], ring);
        c = lerp(c, chip[k], bare);
        d[i + k] = clamp(c * shade, 0, 255);
      }
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return { tex, ctx };
}

/* ------------------------------------------------------ small geometry */

/**
 * A concertina: a lathe whose profile alternates between a fat ring radius and a
 * pinched one, `rings` times, over the height `y1 - y0`.
 *
 * Straight tapered cones were what Biggy's legs were before, and they are the
 * one shape that cannot read as a bellows however they are shaded, because a
 * bellows is entirely silhouette. The pinch is 16% of the ring radius, which is
 * what the sheet's own leg measures between its widest and narrowest rows.
 */
function bellows(rTop: number, rBot: number, y0: number, y1: number, rings: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const steps = rings * 3;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const y = y1 + (y0 - y1) * f;
    const r = rTop + (rBot - rTop) * f;
    // 0 at a waist, 1 at a ring's fattest — three samples per ring.
    const k = i % 3;
    pts.push([r * (k === 1 ? 1 : k === 2 ? 0.965 : 0.84), y]);
  }
  return pts.reverse();
}

/** A point on the belly's own sphere, `off` metres proud of it. */
function onBall(theta: number, phi: number, off: number, out = new THREE.Vector3()): THREE.Vector3 {
  const r = BELLY_R + off;
  return out.set(r * Math.sin(theta) * Math.sin(phi), BELLY_CY + r * Math.cos(theta), r * Math.sin(theta) * Math.cos(phi));
}

/** A closed lathe through `[radius, worldY]` control points, hung off a bone at `originY`. */
function lathe(pts: Array<[number, number]>, originY: number, segments = 48): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y - originY)),
    segments,
    -Math.PI,
    Math.PI * 2,
  );
}

export function buildBiggy(): RobotRig {
  const bones: Record<string, THREE.Object3D> = {};
  const parts: Record<string, THREE.Object3D> = {};
  const glow: THREE.MeshStandardMaterial[] = [];
  const textures: THREE.Texture[] = [];

  const root = new THREE.Group();
  root.name = 'biggy';
  bones.root = root;

  /* --------------------------------------------------------------- palette */
  /*
   * MATTE TO SATIN, NOWHERE GLOSSY.
   *
   * Voxxy is the clearcoat robot. Biggy is twenty years of brush-painted steel
   * in a cinema basement, and the demo's own finish agrees: broad soft terminator,
   * no specular hotspots anywhere on the painted panels. Metalness stays under
   * 0.2 on anything painted and roughness over 0.8; only bare hardware — rivets,
   * rings, the bezels — is allowed the 0.55/0.6 that reads as dull steel.
   */
  const armour = panelMaterial('#5c7085', 0.55, { roughness: 0.84, metalness: 0.16 });
  const armourDark = panelMaterial('#3e4d5e', 0.6, { roughness: 0.87, metalness: 0.14 });
  const rubber = panelMaterial('#1c1f24', 0.4, { roughness: 0.95, metalness: 0.05 });
  /** The gasket under the brim: dead black rubber, and the only face Biggy has. */
  const gasketMat = panelMaterial('#14171b', 0.25, { roughness: 0.92, metalness: 0.06 });
  /** Moulded boots — mid grey, as the demo has them, not the old near-black slabs. */
  const bootMat = panelMaterial('#585c5e', 0.5, { roughness: 0.93, metalness: 0.07 });
  /** The work glove: darker than the boots, so the hands do not out-shout them. */
  const gloveMat = panelMaterial('#393d40', 0.5, { roughness: 0.94, metalness: 0.07 });
  const soleMat = panelMaterial('#3c3f41', 0.45, { roughness: 0.97, metalness: 0.04 });
  const steel = panelMaterial('#7f8994', 0.35, { roughness: 0.6, metalness: 0.55 });
  const glass = panelMaterial('#0e1113', 0.1, { roughness: 0.45, metalness: 0.2 });
  // Amber, not lemon: at the old intensity the green channel clipped to 255 and
  // both eyes photographed as pure yellow. `#ffb347` x 1.2 keeps R > G > B.
  const eyeGlow = glowMaterial('#ffb347', 1.2, '#0d0e10');
  /** The pilot light on the antenna tip — dimmer and redder than the eyes. */
  const pilotGlow = glowMaterial('#ff8a3c', 0.9, '#0d0e10');
  glow.push(eyeGlow, pilotGlow);

  /*
   * THE BELLY'S PAINT, AND WHY IT IS A TEXTURE.
   *
   * The demo's belly is orange worn through to large irregular dark-grey
   * patches with hard edges. Our weathering is baked into vertex colours, which
   * is the right tool for broad shading and the wrong one for a chip: the
   * belly lathe has 56 columns, so the smallest blotch it can hold is 7 cm of
   * arc with a smoothly interpolated edge, and that is the soft smoky wash the
   * owner called "far too clean". The brief allows a GENERATED canvas, so the
   * paint, the meridian seams, the stencil and the decal plate are all drawn
   * into one at build time. In node — the smoke tests — there is no document and
   * `paintTexture` returns null, so the same code builds the same geometry with
   * the paint falling back to vertex colour alone.
   */
  const bellyPaint = paintTexture({
    w: BELLY_TEX_W,
    h: BELLY_TEX_H,
    base: '#d2793c',
    chip: '#63646a',
    primer: '#a4785c',
    turnR: BELLY_R,
    spanM: 0.95,
    freq: 10.5,
    coverage: 0.47,
    seed: 3,
    grime: 0.1,
  });
  if (bellyPaint) {
    drawBellyDecals(bellyPaint.ctx, BELLY_TEX_W, BELLY_TEX_H);
    bellyPaint.tex.needsUpdate = true;
    textures.push(bellyPaint.tex);
  }
  const belly = panelMaterial(bellyPaint ? '#ffffff' : '#b26038', 0.85, {
    roughness: 0.88,
    metalness: 0.08,
  });
  if (bellyPaint) belly.map = bellyPaint.tex;
  /*
   * The same orange WITHOUT the map. The belly's texture is laid out for the
   * belly's own lathe: put it on a box and it samples a random two-centimetre
   * crop of the atlas, which is how the helmet's side nubs came back as red
   * smears. Every small orange trim piece uses this instead.
   */
  const orangeTrim = panelMaterial('#bd6c37', 0.85, { roughness: 0.88, metalness: 0.08 });
  /*
   * The trousers. Darker and rustier than the gut on purpose: on the sheet they
   * are a duller, more oxidised orange than the belly's paint, and against a
   * 1.20 m ball of the SAME orange a 1.00 m block simply disappears — which is
   * how the first cut of this shipped a trouser mass nobody could see.
   */
  const trouser = panelMaterial('#a35a2f', 0.85, { roughness: 0.92, metalness: 0.07 });

  /** The dome's own paint: steel-blue chipping to orange primer and bare steel. */
  const domePaint = paintTexture({
    w: 640,
    h: 200,
    base: '#64788d',
    chip: '#79818c',
    primer: '#8a6750',
    turnR: HELM_R,
    spanM: 0.55,
    freq: 12,
    coverage: 0.17,
    seed: 41,
    grime: 0.06,
    capSpan: Math.PI / 2,
  });
  if (domePaint) textures.push(domePaint.tex);
  const domeMat = panelMaterial(domePaint ? '#ffffff' : '#5c7085', 0.55, {
    roughness: 0.84,
    metalness: 0.16,
  });
  if (domePaint) domeMat.map = domePaint.tex;

  /**
   * Scuffing for the DARK parts.
   *
   * `weather()` writes a multiplier against the material's own colour, so a rust
   * tint on a near-black glove divides a bright patch by a very dark base and
   * comes out as a white flake. Anything this dark gets a tint close to its own
   * colour and a small amount.
   */
  const darkWear = (amount: number, seed: number): WeatherOpts => ({
    amount,
    seed,
    scale: 9,
    tint: '#5c6164',
    grime: 0.3,
  });
  /** Rust bleeding through, grime pooling low: twenty years of it. */
  const wear = (amount: number, seed: number, scale = 5): WeatherOpts => ({
    amount,
    seed,
    scale,
    tint: '#7d4526',
    grime: 0.4,
  });
  /**
   * On a mapped material the vertex colours are only broad shading — the chips
   * live in the texture, and doubling them up muddies both.
   */
  const shading = (seed: number): WeatherOpts => ({
    amount: 0.16,
    seed,
    scale: 2.6,
    tint: '#8b7a6c',
    grime: 0.15,
  });
  const bellyWear = (seed: number): WeatherOpts =>
    bellyPaint ? shading(seed) : { amount: 0.92, seed, scale: 9, tint: '#6b6168', grime: 0.45 };

  /* ------------------------------------------------------------- skeleton */
  const pelvis = joint(bones, root, 'pelvis', 0, HIP_Y, 0);
  const torso = joint(bones, pelvis, 'torso', 0, TORSO_Y - HIP_Y, 0);
  const neck = joint(bones, torso, 'neck', 0, NECK_Y - TORSO_Y, 0);
  const head = joint(bones, neck, 'head', 0, HEAD_Y - NECK_Y, 0);

  /* ------------------------------------------------------------ the ball */
  const bellyGeo = lathe(BELLY_PTS, TORSO_Y, 56);
  const bellyMesh = part(bellyGeo, belly, bellyWear(3));
  torso.add(bellyMesh);
  parts.bellyShell = bellyMesh;
  // Biggy has no torso other than his belly; both names point at the same shell.
  parts.torsoShell = bellyMesh;

  /*
   * Two riveted hatches, sitting flat on the shell where the sheet has them.
   * Each is seated on the ball's own surface normal, which on a sphere is just
   * the radius, so they lie down instead of standing off it.
   */
  for (const [azi, hy] of [
    [-0.95, 0.9],
    [1.05, 0.74],
  ] as const) {
    const r = ballR(hy);
    const hatch = part(roundedBox(0.125, 0.16, 0.035, 0.012, 2), armourDark, wear(0.7, 18));
    hatch.position.set(Math.sin(azi) * (r - 0.012), hy - TORSO_Y, Math.cos(azi) * (r - 0.012));
    hatch.rotation.y = azi;
    hatch.rotation.x = -Math.asin(clamp((hy - BELLY_CY) / BELLY_R, -1, 1));
    torso.add(hatch);
    const hatchFace = new THREE.Object3D();
    hatchFace.rotation.x = Math.PI / 2;
    hatch.add(hatchFace);
    boltRing(hatchFace, steel, { count: 4, radius: 0.048, y: 0.017, boltRadius: 0.008, boltHeight: 0.007 });
  }

  /*
   * THE STENCIL EMBLEM.
   *
   * On both references this is PAINT: a cream circle outline with a robot glyph
   * inside it, flat on the shell. The build before this made it out of a torus
   * and three pucks standing 12 mm proud, which caught the key light and became
   * the brightest object on the model. It is drawn into the belly texture now
   * (see `drawBellyDecals`) — except in node, where there is no canvas, and
   * where nothing looks at it.
   */

  /*
   * THE TROUSERS: A BLOCK UNDER A WAIST, NOT A COLLAR ROUND A BALL.
   *
   * Everything here is off the FRONT VIEW panel, read at source rows 877-932
   * against a figure 402.5 px tall with its axis at x = 419.5:
   *
   *   the block         x 300..540 at row 888, 241 px = 0.599 of his height
   *   its underside     row 932, and it tapers 241 -> 222 px on the way down
   *   the dark undercut rows 877..895, between the gut's lip and the orange
   *   three vent slots  x 400..440 at row 890 — a small central group, 0.14 m
   *                     of slot altogether, NOT one across the whole front
   *   the belt plate    x 392..455, rows 902..931: 0.23 by 0.10, sitting on the
   *                     block's bottom edge rather than floating above it
   *   the wrap folds    THREE creases a side, fanning from the block's bottom
   *                     corners out and UP to the hip at 14, 19 and 24 degrees
   *
   * The round before this built a 1.00 m block because the gut was a perfect
   * sphere and nothing narrower could be seen under it. The gut tucks now (see
   * `BELLY_TUCK`), so the block is the sheet's width, the arm's inner edge has
   * its daylight back, and the folds sit on something the same size as they are
   * instead of cantilevering off a shelf.
   */

  /*
   * THE BUMPER LIP.
   *
   * On the sheet the gut does not fade into the trousers: it ends on a hard,
   * near-horizontal dark rim — a rubber bumper round its underside — and the
   * trousers start below that. The torus rides the tucked shell — 8 mm proud of
   * it, at 0.427, the last centimetre before the block's edge overtakes the
   * gut's — so the rim is the gut's own flange and not a hoop hung round it.
   * The 0.505 m one this replaces was sized for a sphere that no longer exists
   * and would now stand 75 mm off the shell.
   */
  const LIP_Y = 0.427;
  const bumper = part(new THREE.TorusGeometry(ballR(LIP_Y) - 0.007, 0.015, 9, 56), rubber, wear(0.4, 70));
  bumper.rotation.x = Math.PI / 2;
  bumper.position.y = LIP_Y - TORSO_Y;
  torso.add(bumper);

  /*
   * The dark undercut is a SECOND block 5 mm bigger all round, not a band drawn
   * on the first one. It runs from inside the gut down to `SHORTS_Y1`, where the
   * orange takes over, so the 75 mm of dark between the bumper and the orange is
   * this block's own straight side. Its corner radius is small for the same
   * reason it has to be: round it like the gut and the band vanishes into its
   * own bottom fillet exactly where it has to show.
   */
  // It carries on 60 mm BEHIND the orange rather than meeting it edge to edge:
  // two fillets ending at the same height pinched a 40 mm notch out of the
  // block's outline at exactly y = 0.34 — a facet artefact that reads as a chip.
  const underH = SHORTS_Y2 - SHORTS_Y1 + 0.06;
  /*
   * Swept, for the same reason the orange below it is. Left as a box it became
   * the square thing the moment the trousers stopped being one — a flat slab
   * across the full width, hiding the curve underneath it. The two now share a
   * silhouette and the lower body reads as one rounded mass.
   */
  const underPts: THREE.Vector2[] = [];
  const UNDER_RINGS = 10;
  for (let i = 0; i <= UNDER_RINGS; i++) {
    const t = i / UNDER_RINGS;
    // Widest at the bottom, where it meets the trousers, drawing in as it climbs
    // into the gut's shadow.
    const f = 1.005 - 0.06 * t * t;
    underPts.push(new THREE.Vector2((SHORTS_HW + 0.005) * f, underH * t));
  }
  underPts.push(new THREE.Vector2(0, underH));
  const underGeo = new THREE.LatheGeometry(underPts, 28);
  underGeo.scale(1, 1, (SHORTS_HD + 0.005) / (SHORTS_HW + 0.005));
  const shortsUnder = part(underGeo, armourDark, wear(0.55, 8));
  shortsUnder.position.y = SHORTS_Y1 - 0.06 - TORSO_Y;
  torso.add(shortsUnder);

  /*
   * The trousers are a LATHE, not a box.
   *
   * They were a `roundedBox`, and Michele called it: "biggy is still square down
   * there. It should have some kind of slips - pants." He is right, and a bigger
   * corner radius could never have fixed it — the block is only 0.145 m tall, so
   * the radius is capped near 0.07 by its own height, which is 8% of its width.
   * A box that wide and that short reads as a box whatever you do to its corners.
   *
   * The sheet's back and back-right views show something quite different: a soft
   * rounded mass that swells out from under the gut and tucks back in above the
   * legs, with no straight sides at all. So it is swept as a body of revolution
   * and squashed in Z to keep the depth the front elevation was measured against.
   * `LatheGeometry` about Y gives curved sides in plan, which is the whole point
   * — from the diorama camera you see the plan curve, not the elevation.
   */
  const mainH = SHORTS_Y1 - SHORTS_Y0;
  const SHORTS_RINGS = 14;
  const shortsPts: THREE.Vector2[] = [];
  for (let i = 0; i <= SHORTS_RINGS; i++) {
    const t = i / SHORTS_RINGS;
    // 1 at the waist, swelling a little below it, drawn in above the legs. The
    // sine puts the widest ring a third of the way down, which is where the
    // sheet's outline turns over.
    const f = 0.9 + 0.1 * Math.sin(Math.PI * Math.min(1, t * 1.35)) - 0.22 * t * t;
    shortsPts.push(new THREE.Vector2(SHORTS_HW * f, mainH * (1 - t)));
  }
  // Close the bottom so the sweep is a solid, not an open skirt.
  shortsPts.push(new THREE.Vector2(0, mainH * 0.02));
  const shortsGeo = new THREE.LatheGeometry(shortsPts, 28);
  shortsGeo.scale(1, 1, SHORTS_HD / SHORTS_HW);
  const shortsMain = part(shortsGeo, trouser, wear(0.8, 61, 6));
  shortsMain.position.y = SHORTS_Y0 - TORSO_Y;
  torso.add(shortsMain);

  /*
   * The dark central panel. On the sheet the rusted orange is only the outer
   * sixth of the block on each side — x 300..320 and 525..540 of a block that
   * runs 300..540 — and everything between is the same cool dark armour as the
   * belt. 0.55 m of 0.86 here, and it stands only 4 mm off the block's face: at
   * 6 mm it beat the undercut above it as well and turned the whole crotch into
   * a slab hung off his front. At 4 it wins over the orange, which is all it is
   * for, and loses to the undercut, which is what it has to do.
   */
  const crotchH = SHORTS_Y1 + 0.015 - SHORTS_Y0;
  const crotchPanel = part(
    roundedBox(0.55, crotchH, SHORTS_HD * 2 + 0.008, 0.045, 2),
    armourDark,
    wear(0.5, 62),
  );
  crotchPanel.position.y = SHORTS_Y0 + crotchH / 2 - TORSO_Y;
  torso.add(crotchPanel);

  /*
   * THE DIAGONAL WRAP FOLDS.
   *
   * A fan of three creases a side, converging on the bottom corner of the belt
   * plate and running out and UP to the hip, like a cloth wrap gathered at the
   * waist. High-pass the sheet's trouser block and they are the loudest thing on
   * it — three dark lines a side, unmistakable, at roughly 14, 19 and 24 degrees.
   *
   * Each is built from its two measured ends rather than from a length and an
   * angle, because the end that matters is the outer one: it has to land ON the
   * block's edge and not past it. What shipped before was a 0.44 m bar on a
   * 1.00 m block at a flat 12 degrees, cantilevered out where the gut had
   * already curved away above it, and it photographed as an orange plank.
   *
   * They are DARK, and they are only that. On the sheet a fold is a shadow with
   * a thin lit edge over it, so what carries it is the crease and not the
   * ridge — which is the other half of why the last pass read as planks: the
   * ridge was the trousers' own rusted orange, three centimetres proud, on the
   * only part of him nothing else was covering. This build tried a light lip on
   * top of each crease as well and three of them turned straight back into grey
   * rods laid across an orange block, so the lip is gone: one `armourDark` bar
   * a crease, dark against the rust and a shading break against the panel.
   */
  /*
   * THE WRAP FOLDS ARE GONE.
   *
   * They were three bars a side, pinned at a constant z on what used to be a flat
   * trouser face. That worked while the trousers were a box. It does not work on
   * a lathe: the surface falls away toward the outer end and the bar does not, so
   * each fold stood proud of the shell and read as a wire laid across him — worse
   * than the flatness they were added to relieve.
   *
   * They could be re-cut to follow the sweep, one crease at a time, and the pass
   * that built them was already honest that "three straight bars on a flat face
   * will never be cloth" and that a trouser texture was the real answer. So
   * rather than a third attempt at a detail nobody asked for, the shape carries
   * itself: Michele asked for a rounded form, not for folds.
   */

  /**
   * The belt plate: 0.23 by 0.10, dead centre, flush with the block's underside.
   * In front of the folds, whose fans converge on its two bottom corners.
   */
  const belt = part(roundedBox(0.23, 0.1, 0.05, 0.022, 2), armourDark, wear(0.45, 65));
  belt.position.set(0, 0.258 - TORSO_Y, SHORTS_HD + 0.006);
  torso.add(belt);

  /*
   * Vent slots in the undercut: three of them, and a SMALL central group. The
   * sheet's span the 40 px between x 400 and 440 — 0.14 m in all, about a sixth
   * of the block — where the pass before this drew them 0.38 m apart and turned
   * a louvre into a grille across his whole front.
   */
  for (const vx of [-0.047, 0, 0.047]) {
    const vent = part(roundedBox(0.036, 0.016, 0.03, 0.006, 1), rubber);
    vent.position.set(vx, 0.372 - TORSO_Y, SHORTS_HD);
    torso.add(vent);
  }

  /* ------------------------------------------ the helmet/belly seam ring */
  /*
   * A THIN dark ring in the crease where the hat meets the gut — the black line
   * the sheet draws there, and nothing more. What this replaces was a 0.10 m
   * black cylinder wrapped round the ball, which is how Biggy came to be wearing
   * a tray across his face; the recessed band that the eyes now live in belongs
   * to the HELMET, up in its brow, and is a third of that tall.
   */
  const SEAM_Y0 = 1.116;
  const SEAM_Y1 = 1.15;
  const seamRing = part(
    new THREE.CylinderGeometry(ballR(SEAM_Y1) + 0.006, ballR(SEAM_Y0) + 0.006, SEAM_Y1 - SEAM_Y0, 56, 1, true),
    gasketMat,
    wear(0.2, 11),
  );
  seamRing.position.y = (SEAM_Y0 + SEAM_Y1) / 2 - TORSO_Y;
  torso.add(seamRing);

  /*
   * THE SIDE LOBES.
   *
   * Rounded blue flaps at 10 and 2 o'clock, hanging from under the helmet's rim
   * down over the gut's shoulders, each carrying a small orange rivet dot. They
   * were missing altogether, and on the sheet they are the single most
   * characterful thing about him after the gut itself: from the front they read
   * as ears, from three quarters as shoulder guards.
   *
   * Measured off the front view: the blue runs from source y 668 to 748 (world
   * 1.15 down to 0.86) and the orange dot sits at x = -0.537, y = 0.924, which
   * on the gut's own sphere is theta 1.25, phi 71 degrees. They are patches of
   * the gut's OWN sphere rather than slabs bolted near it, so they lie down on
   * the shoulder the way the sheet's do instead of standing off it — 12 mm
   * proud, with a darker patch 8 mm below that for the rim. The first cut stood
   * them 22 mm off and the unbacked patch edge threw a shadow gap: from three
   * quarters the lobe read as a disc on a spacer.
   */
  const LOBE_THETA = 1.08;
  const LOBE_PHI = 1.24;
  for (const side of [1, -1] as const) {
    const back = part(
      ovalPatch(0.6035, 0.6035, 0.6035, side * LOBE_PHI, 0.4, LOBE_THETA + 0.05, 0.345, 7, 26),
      armourDark,
      wear(0.5, 66),
    );
    back.position.y = BELLY_CY - TORSO_Y;
    torso.add(back);
    const lobe = part(
      ovalPatch(0.612, 0.612, 0.612, side * LOBE_PHI, 0.36, LOBE_THETA + 0.05, 0.325, 7, 26),
      armour,
      wear(0.6, 67),
    );
    lobe.position.y = BELLY_CY - TORSO_Y;
    torso.add(lobe);

    const dotAt = new THREE.Object3D();
    const outward = onBall(1.225, side * 1.29, 0).sub(new THREE.Vector3(0, BELLY_CY, 0)).normalize();
    onBall(1.225, side * 1.29, 0.011, dotAt.position);
    dotAt.position.y -= TORSO_Y;
    dotAt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
    torso.add(dotAt);
    const dot = part(puck(0.03, 0.016, 18), orangeTrim, wear(0.7, 68, 7));
    dotAt.add(dot);
  }

  /* ------------------------------------------------------- helmet (head) */
  /** The dome's radius at a dome-local height, read off its own lathe profile. */
  const domeR = (y: number): number => {
    for (let i = 1; i < DOME_PTS.length; i++) {
      if (y <= DOME_PTS[i][1]) {
        const [r0, y0] = DOME_PTS[i - 1];
        const [r1, y1] = DOME_PTS[i];
        return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
      }
    }
    return 0;
  };

  const dome = part(lathe(DOME_PTS, 0, 56), domeMat, domePaint ? shading(13) : wear(0.55, 13, 4));
  head.add(dome);
  parts.headShell = dome;

  /*
   * THE BROW: a shallow recessed band with a bright steel trim edge over it.
   *
   * On the sheet this is 36 mm of shadow between a light edge line above and the
   * dome's own lower lip below — a groove, not a visor, and certainly not the
   * flared cone this file used to carry. The groove is cut into the lathe
   * profile (`BROW_R`), a dark cylinder fills its floor, and the trim is one
   * thin steel torus standing 7 mm proud of the dome above it, which is what
   * throws the shadow.
   */
  const browBand = part(
    new THREE.CylinderGeometry(BROW_R + 0.005, BROW_R + 0.005, BROW_Y1 - BROW_Y0 - 0.004, 56, 1, true),
    gasketMat,
    wear(0.25, 12),
  );
  browBand.position.y = (BROW_Y0 + BROW_Y1) / 2;
  head.add(browBand);
  const trim = part(new THREE.TorusGeometry(0.406, 0.007, 8, 56), steel, wear(0.45, 14));
  trim.rotation.x = Math.PI / 2;
  trim.position.y = BROW_Y1 + 0.004;
  head.add(trim);
  const browLip = part(new THREE.TorusGeometry(0.424, 0.008, 8, 56), armour, wear(0.5, 15));
  browLip.rotation.x = Math.PI / 2;
  browLip.position.y = BROW_Y0 - 0.006;
  head.add(browLip);

  /*
   * TWO AMBER EYES IN THE BROW — A DELIBERATE DEVIATION FROM THE SHEET.
   *
   * `docs/model-sheet-targets.md` §4a is explicit that Biggy's front elevation
   * has no lit eyes; Michele's standing call from an earlier round is that
   * gameplay legibility wins, because the player has to be able to tell at a
   * glance which way the heaviest robot in the room is facing. What the sheet
   * DOES have, at exactly the place an eye would go, is a pair of small bright
   * dots in the brow band, directly under the two lens ports and 0.161 m either
   * side of the axis. The eyes go there, at that spacing.
   *
   * They are 32 mm lenses in a 42 mm band rather than the 48 mm lenses in a
   * 102 mm band they were. That band is 6 mm taller than the sheet's 36 mm, and
   * the 6 mm is the whole of the compromise: at the sheet's exact height the
   * lens is 26 mm and stops being a lamp.
   */
  const EYE_PHI = Math.asin(0.161 / (BROW_R + 0.005));
  const EYE_Y = (BROW_Y0 + BROW_Y1) / 2;
  for (const sx of [-1, 1]) {
    const azi = sx * EYE_PHI;
    const socketAt = new THREE.Object3D();
    socketAt.position.set(Math.sin(azi) * (BROW_R + 0.003), EYE_Y, Math.cos(azi) * (BROW_R + 0.003));
    socketAt.rotation.y = azi;
    socketAt.rotation.x = Math.PI / 2;
    head.add(socketAt);
    const bezel = part(new THREE.TorusGeometry(0.019, 0.006, 7, 18), steel, wear(0.5, 44));
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = 0.004;
    socketAt.add(bezel);
    const lens = part(puck(0.016, 0.014, 18), eyeGlow);
    lens.position.y = 0.005;
    socketAt.add(lens);
  }

  // Biggy's lamp: the wide blue flood, out of the brow band.
  const lampAnchor = new THREE.Object3D();
  lampAnchor.name = 'lamp';
  lampAnchor.position.set(0, EYE_Y, BROW_R + 0.02);
  head.add(lampAnchor);

  /*
   * A rivet line round the dome's flank, where the sheet has one, and nothing
   * else: no brim, no skirt, no second cone. The dome's own step at the brow is
   * the whole of the overhang.
   */
  boltRing(head, steel, {
    count: 18,
    radius: 0.412,
    y: 0.108,
    boltRadius: 0.008,
    boltHeight: 0.006,
    phase: 0.174,
    aimFrom: new THREE.Vector3(0, -0.25, 0),
  });

  /*
   * THE PAIRED FRONT PORT LENSES.
   *
   * Two concentric-ring lens fittings high on the dome's front slope. Measured
   * on the front view they are 0.106 of the dome's width across, centres 0.373
   * of it apart (`docs/model-sheet-targets.md` §4a, and both numbers hold across
   * a threshold sweep) — so 94 mm across and 165 mm either side of the axis on
   * our 884 mm dome. The stack this replaces was drawn to the demo's scale and
   * came out a fifth too big in every ring.
   *
   * Each sits on the dome's own surface normal, taken from the lathe profile
   * rather than from an ellipse, because the dome is no longer an ellipse.
   */
  const PORT_Y = 0.168;
  const portUp = new THREE.Vector3(0, 1, 0);
  for (const sx of [-1, 1]) {
    const pr = domeR(PORT_Y);
    const azi = Math.asin(Math.min(1, 0.165 / pr));
    const px = sx * pr * Math.sin(azi);
    const pz = pr * Math.cos(azi);
    // The surface normal: the profile's outward normal, swung round to `azi`.
    const slope = (domeR(PORT_Y + 0.02) - domeR(PORT_Y - 0.02)) / 0.04;
    const nr = 1 / Math.hypot(1, slope);
    const port = new THREE.Object3D();
    port.position.set(px, PORT_Y, pz);
    port.quaternion.setFromUnitVectors(
      portUp,
      new THREE.Vector3(sx * nr * Math.sin(azi), -slope * nr, nr * Math.cos(azi)).normalize(),
    );
    head.add(port);
    const collar = part(new THREE.CylinderGeometry(0.047, 0.052, 0.034, 24), armour, wear(0.5, 16));
    collar.position.y = -0.011;
    port.add(collar);
    const ringMesh = part(new THREE.TorusGeometry(0.04, 0.009, 9, 26), rubber, wear(0.4, 17));
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.01;
    port.add(ringMesh);
    const inner = part(new THREE.TorusGeometry(0.028, 0.006, 8, 22), steel, wear(0.4, 47));
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.009;
    port.add(inner);
    /*
     * The well. An open-ended cylinder would be the honest way to cut one, but
     * its inner wall is back-facing from outside and culls away, so the port
     * photographed as an empty outline. A dark glass plug set below the ring
     * gives the same read from every angle the diorama camera can reach.
     */
    const well = part(new THREE.CylinderGeometry(0.03, 0.026, 0.024, 22), glass);
    well.position.y = 0.001;
    port.add(well);
    const boss = part(new THREE.CylinderGeometry(0.011, 0.013, 0.02, 10), steel, wear(0.5, 19));
    boss.position.y = 0.009;
    port.add(boss);
  }

  /*
   * THE CROWN FITTINGS.
   *
   * The sheet has two small flat-topped ribbed nubs on the crown's shoulders,
   * 0.218 m either side of the axis, and a hair-thin wire between them. The
   * wire is two pixels on a 2752-px sheet and invisible at play scale; what
   * stood here instead was a 0.17 m whip off the organisers' demo, which is the
   * silhouette of a different robot. The nubs stay, the whip goes, and the pilot
   * lamp that used to sit on the whip's tip moves onto the left-hand nub — the
   * side the sheet's own wire rises from.
   */
  for (const sx of [-1, 1]) {
    const nx = sx * 0.218;
    const ny = 0.278;
    const nub = part(new THREE.CylinderGeometry(0.028, 0.031, 0.038, 14), armourDark, wear(0.5, 46));
    nub.position.set(nx, ny, 0);
    head.add(nub);
    for (let i = 0; i < 3; i++) {
      const rib = part(new THREE.TorusGeometry(0.029, 0.0035, 6, 14), steel, wear(0.4, 69));
      rib.rotation.x = Math.PI / 2;
      rib.position.set(nx, ny - 0.011 + i * 0.01, 0);
      head.add(rib);
    }
    if (sx < 0) {
      const pilot = part(ellipsoid(0.01, 0.007, 0.01, 10, 8), pilotGlow);
      pilot.position.set(nx, ny + 0.021, 0);
      head.add(pilot);
    }
  }

  /*
   * A vestigial neck collar: the helmet is fused to the belly, so this only ever
   * moves a few degrees (see `gait.ts`, Biggy's headLook is tiny). It is tall
   * enough to actually reach the dome's base at 1.13 — the belly hides the gap
   * either way, but a shell that does not touch the shell it hangs from is how
   * detached geometry gets shipped, and now a test says so.
   */
  const collarMesh = part(new THREE.CylinderGeometry(0.16, 0.19, 0.13, 20), armourDark, wear(0.5, 23));
  collarMesh.position.y = 0.01;
  neck.add(collarMesh);

  /* ----------------------------------------------------------------- arms */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const shoulder = joint(bones, torso, `shoulder${L}`, side * SHOULDER_X, SHOULDER_Y - TORSO_Y, SHOULDER_Z);
    const upper = joint(bones, shoulder, `upperArm${L}`, 0, 0, 0);
    const fore = joint(bones, upper, `forearm${L}`, 0, -UPPER_ARM, 0);
    const hand = joint(bones, fore, `hand${L}`, 0, -FOREARM, 0);

    /*
     * THE SHOULDER LINKAGE — a ball and a dark stub, and no pauldron.
     *
     * The sheet has nothing on the shoulder at all: under the side lobe there is
     * a small dark joint, and then the slab. The three-box bevelled cap that
     * used to sit here is the organisers' demo's, and it is a big enough shape
     * to change the whole upper silhouette — which is exactly what the owner was
     * looking at when he said the arms were still wrong.
     */
    const ball = part(ellipsoid(0.082, 0.092, 0.094, 18, 12), rubber, darkWear(0.4, 24));
    // Pulled 75 mm INBOARD of its own bone, so the side lobe covers it. On the
    // sheet the linkage is a glimpse under the lobe, not a shoulder.
    ball.position.x = -side * 0.075;
    shoulder.add(ball);

    /*
     * The stub between the ball and the slab: a dark block a little narrower and
     * a lot shallower than the slab, mostly hidden behind the side lobe.
     *
     * The sheet wants it narrower still — above y = 0.70 its arm is entirely
     * behind the gut — but `hangs its arms outside the gut from the portrait
     * camera` measures every mesh on the arm chain in a 34-degree projection and
     * demands 15 mm of daylight, and at shoulder height the gut is 0.582 m
     * against the 0.568 the arm hangs at. 0.19 clears by 26 mm; anything narrow
     * enough to hide fails. A tapered eight-sided version of this passed the
     * test too and read as a lampshade, which is worse than a nick of daylight.
     */
    const stub = part(roundedBox(0.19, 0.215, 0.17, 0.05, 2), armourDark, wear(0.55, 26));
    stub.position.y = -0.1;
    upper.add(stub);

    /*
     * ONE SMOOTH SLAB.
     *
     * A rounded rectangular block with flat faces, hanging straight down beside
     * the gut, with a narrow cuff band at the bottom. No ring joint and no lens
     * disc: both came off the demo, and the lens hub was also the widest point
     * on the whole robot, which is a poor thing for a detail nobody can name to
     * be. On the sheet the slab is 0.247 m across and 0.34 long, and the arm's
     * outer face is the figure's own silhouette for most of its length.
     */
    const slab = part(roundedBox(FORE_W, FORE_LEN, FORE_D, 0.07, 3), armour, wear(0.62, 28));
    slab.position.y = -FORE_LEN / 2;
    fore.add(slab);
    const cuff = part(roundedBox(FORE_W + 0.008, 0.036, FORE_D + 0.008, 0.016, 2), armourDark, wear(0.6, 53));
    cuff.position.y = -FORE_LEN - 0.014;
    fore.add(cuff);

    /*
     * FOUR LONG THREE-SEGMENT FINGERS.
     *
     * The single biggest difference on the sheet's arm: the hand is a dark grey
     * claw of four thin multi-segmented fingers hanging open and slightly
     * curled, and they are LONG — 0.15 m on a 0.40 m arm, a bit over a third of
     * it. What was here was four stubby two-segment slabs on a blocky glove,
     * which reads as a mitten, and a thumb, which the sheet does not have.
     */
    const palm = part(roundedBox(0.155, 0.058, 0.152, 0.024, 3), gloveMat, darkWear(0.35, 29));
    palm.position.y = -0.01;
    hand.add(palm);
    const knuckle = part(roundedBox(0.163, 0.02, 0.16, 0.008, 2), armourDark, darkWear(0.4, 54));
    knuckle.position.y = -0.05;
    hand.add(knuckle);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Object3D();
      finger.position.set(side * (0.05 - 0.033 * i), -0.058, -0.036 + i * 0.024);
      // Fanned front to back, splayed sideways, and hanging a little open.
      finger.rotation.x = 0.12 * (i - 1.5);
      finger.rotation.z = side * (0.26 - 0.15 * i);
      hand.add(finger);
      bones[`finger${L}${i}`] = finger;
      for (let k = 0; k < 3; k++) {
        const seg = part(
          roundedBox(0.034 - k * 0.003, 0.05, 0.034 - k * 0.003, 0.01, 2),
          gloveMat,
          darkWear(0.3, 30 + k),
        );
        // Each joint curls a touch further, so the hand hangs open, not straight.
        seg.position.set(0, -0.029 - k * 0.054, k * 0.009);
        seg.rotation.x = -0.14 * k;
        finger.add(seg);
      }
    }

    // Hung straight down against the belly, with only the smallest splay.
    shoulder.rotation.z = side * 0.012;
    shoulder.rotation.x = -0.03;
  }

  /* ----------------------------------------------------------------- legs */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const hip = joint(bones, pelvis, `hip${L}`, side * HIP_X, 0, 0);
    const thigh = joint(bones, hip, `thigh${L}`, 0, 0, 0);
    const shin = joint(bones, thigh, `shin${L}`, 0, -THIGH, 0);
    const foot = joint(bones, shin, `foot${L}`, 0, -SHIN, 0);

    /*
     * Everything above the trousers' flat underside at y = 0.205 is hidden
     * inside them, so the thigh and the knee only have to exist, not to be
     * pretty. What shows is 0.19 m of leg: a fat concertina, a smaller two-ring
     * bellows and a boot, which is what the sheet gives him and about an eighth
     * of his height.
     */
    const hipBall = part(ellipsoid(0.115, 0.108, 0.115, 16, 12), armourDark, wear(0.55, 32));
    hip.add(hipBall);
    const thighMesh = part(new THREE.CylinderGeometry(0.108, 0.118, THIGH, 18, 1), armourDark, wear(0.6, 33));
    thighMesh.position.y = -THIGH / 2;
    thigh.add(thighMesh);
    const kneeBall = part(ellipsoid(0.104, 0.095, 0.104, 16, 10), armourDark, wear(0.4, 34));
    shin.add(kneeBall);

    /*
     * FAT CONCERTINAS, NOT THIN CONES.
     *
     * The sheet's leg is a stack of three bellows rings 0.197 m across, widest
     * at the top, then a narrower two-ring bellows, then the boot. Ours were
     * 0.21 m tapered cones with three loose tori hung on them — the right
     * diameter and entirely the wrong shape, because a bellows is all
     * silhouette and a cone has none. Both stacks are lathes through a pinched
     * profile now, so the concertina is in the outline rather than drawn on it.
     *
     * The short plain cylinder above them is inside the trousers. It is there
     * because the shin's own shell has to reach up and touch the thigh's, and a
     * test says so after a round shipped Biggy's bellows floating beside a leg
     * that was not there.
     */
    const shinTop = part(new THREE.CylinderGeometry(0.1, 0.104, KNEE_Y - LEG_TOP + 0.02, 20, 1), armourDark, wear(0.5, 35));
    shinTop.position.y = -(KNEE_Y - LEG_TOP) / 2 + 0.01;
    shin.add(shinTop);
    const bigBellows = part(lathe(bellows(0.106, 0.096, 0.117, LEG_TOP, 2), KNEE_Y, 28), armour, wear(0.62, 36));
    shin.add(bigBellows);

    const smallBellows = part(lathe(bellows(0.086, 0.08, 0.076, 0.119, 2), ANKLE_Y, 24), rubber, darkWear(0.4, 37));
    foot.add(smallBellows);

    /*
     * A WIDE MOULDED BOOT WITH A SPLAYED SOLE.
     *
     * Mid-grey, 0.205 m across and 0.077 tall — the sheet's boot, which is
     * barely wider than the concertina above it and nothing like the 0.30 m
     * slab on a 0.355 m tray that was here. That tray is also why the stance
     * measured right while the legs looked wrong: the boots were doing the work
     * the hip spacing should have been doing. The hips are 0.24 m apart now, so
     * the stance is still the sheet's 0.68 m with the boots at the sheet's size.
     *
     * The sole's underside is exactly y = 0, which the "stands on the floor"
     * test measures to a centimetre.
     */
    const bootBody = part(roundedBox(0.218, 0.062, 0.25, 0.034, 3), bootMat, wear(0.55, 38));
    bootBody.position.set(0, 0.052 - ANKLE_Y, 0.015);
    foot.add(bootBody);
    const bootToe = part(roundedBox(0.188, 0.046, 0.108, 0.022, 3), bootMat, wear(0.6, 56));
    bootToe.position.set(0, 0.033 - ANKLE_Y, 0.136);
    foot.add(bootToe);
    const sole = part(roundedBox(0.23, 0.032, 0.275, 0.014, 3), soleMat, wear(0.5, 39));
    sole.position.set(0, 0.016 - ANKLE_Y, 0.02);
    foot.add(sole);
  }

  assertBones('biggy', bones);

  return {
    kind: 'biggy',
    root,
    bones,
    parts,
    height: ROBOT_HEIGHT_M.biggy,
    glow,
    lampAnchor,
    dispose: () => {
      for (const t of textures) t.dispose();
      disposeTree(root);
    },
  };
}

/* ------------------------------------------------------- painted decals */

/** Where each painted mark sits, in world height and in turns around the belly. */
const FRONT_U = 0.5;
const EMBLEM_Y = 0.955;
const DECAL_Y = 1.0;

/**
 * The meridian seams, the low horizontal seam, the stencil emblem and the decal
 * plate, drawn straight onto the belly's paint.
 *
 * SIX MERIDIANS, OFFSET BY HALF A PANEL. Vertical plate joins quartering the
 * sphere once turned the armour into a beach ball, and the round that followed
 * deleted them entirely — but both references clearly have them, so the fault
 * was never the seams, it was drawing one straight down the middle of the face.
 * Offsetting by half a panel puts a seam 30 degrees either side of the emblem,
 * which is where the demo's are, and leaves the front panel whole.
 */
function drawBellyDecals(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const py = (y: number): number => (1 - bellyV(y)) * h;
  ctx.save();

  /* meridians */
  ctx.strokeStyle = 'rgba(38,26,20,0.5)';
  ctx.lineWidth = Math.max(2, w / 420);
  for (let k = 0; k < 6; k++) {
    const u = fract(FRONT_U + (k + 0.5) / 6);
    const x = u * w;
    ctx.beginPath();
    ctx.moveTo(x, py(0.3));
    ctx.lineTo(x, py(1.13));
    ctx.stroke();
  }
  /* one low horizontal seam, and a fainter one up on the shoulder */
  for (const [y, alpha] of [
    [0.44, 0.45],
    [1.02, 0.22],
  ] as const) {
    ctx.strokeStyle = `rgba(28,20,16,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, py(y));
    ctx.lineTo(w, py(y));
    ctx.stroke();
  }

  /* the stencil emblem: a cream ring with the sheet's robot glyph inside it */
  const ex = FRONT_U * w;
  const ey = py(EMBLEM_Y);
  const rx = w * 0.031;
  const ry = h * 0.105;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.scale(rx, ry);
  ctx.strokeStyle = 'rgba(232,225,209,0.9)';
  ctx.lineWidth = 0.17;
  ctx.beginPath();
  ctx.arc(0, 0, 0.86, 0, Math.PI * 2);
  ctx.stroke();
  /*
   * The glyph is "ii", not a face.
   *
   * Cropping the sheet's emblem at eight times scale (source 380,680..470,770)
   * it is two lower-case i's: a short square tittle, a gap, then a longer stem
   * with a rounded foot — the ring is a good deal wider than they are tall, and
   * the bar this used to draw underneath them, which turned the whole thing into
   * a neutral smiley, is not on the sheet at all. Six marks instead of three.
   */
  ctx.fillStyle = 'rgba(232,225,209,0.9)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.19;
  ctx.strokeStyle = 'rgba(232,225,209,0.9)';
  for (const sx of [-0.23, 0.23]) {
    // The tittle.
    ctx.beginPath();
    ctx.moveTo(sx, -0.44);
    ctx.lineTo(sx, -0.33);
    ctx.stroke();
    // The stem.
    ctx.beginPath();
    ctx.moveTo(sx, -0.14);
    ctx.lineTo(sx, 0.4);
    ctx.stroke();
  }
  ctx.restore();

  /* the small rectangular decal plate, up and to the viewer's left of it */
  const dx = (FRONT_U - 0.062) * w;
  const dy = py(DECAL_Y);
  ctx.strokeStyle = 'rgba(40,30,24,0.55)';
  ctx.lineWidth = Math.max(1.5, w / 640);
  ctx.strokeRect(dx - w * 0.012, dy - h * 0.05, w * 0.024, h * 0.1);
  ctx.fillStyle = 'rgba(224,216,200,0.5)';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(dx - w * 0.0085, dy - h * 0.032 + i * h * 0.026, w * 0.017, h * 0.009);
  }

  ctx.restore();
}
