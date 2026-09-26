/**
 * droid.ts — Model 02, "a tall mechanical silhouette with weathered graphite
 * panels and exposed joints".
 *
 * Built from `robots/droid-robot.png` (the authority on APPEARANCE) and held to
 * the finish of `reference/organisers-demo/droid-*.{png,webp}` (the bar for
 * CRAFT). Where the two disagree the sheet wins; the demo only says how well the
 * thing has to be made.
 *
 * What makes it read as Droid and not as a generic humanoid:
 *   - 2.1 m tall and lanky: narrow everywhere, the smallest width/height ratio
 *     of the three, with a forward-hunched posture;
 *   - DRUM PAULDRONS mounted outboard of the chest, each ringed by a bright
 *     orange hoop — the single most recognisable feature on the model, present
 *     on the sheet as a copper band round a panelled drum and on the demo as a
 *     hot orange hoop round a dome;
 *   - a SMOOTH ROUNDED SKULL — an elongated dome on a superellipse section, so
 *     the sides read flat — flaring at the temples into two dark cheek plates,
 *     with two small round amber eyes set WIDE and a dark mesh grille where a
 *     mouth would be, plugged into a THICK DARK COLLAR RING sunk in the chest;
 *   - a TAPERED KEYSTONE chest carrying real panel work — orange-piped vents, a
 *     recessed central louvre, fine grilles;
 *   - EXPOSED JOINTS at shoulder, elbow, hip, knee and ankle, the hips and knees
 *     built as stacked ribbed discs with an orange ring round the outermost, and
 *     BANDED LIMB SEGMENTS — a sleeve of fine rings over the top of each forearm
 *     and shin, a short ribbed collar where each thigh and upper arm meets its
 *     joint, which is how the sheet's arms and legs are put together.
 *
 * WHAT CAME FROM THE DEMO AND STAYS. The hoop shoulders — a lathed disc-dome
 * with a hot orange ring on the rim — are not on the sheet. They are the
 * organisers' demo, Michele likes them, and they are not to be "corrected"
 * toward the sheet's angular pauldrons. Same for the orange piping, the X
 * harness and the ribbed joint stacks. The FACE is the opposite case: the round
 * that took its helmet from the demo lost the character, and the face is what
 * makes a character recognisable, so the head is the sheet's and only the
 * sheet's.
 *
 * THE ORANGE RULE. Orange appears as PIPING AND RINGS ONLY, never as a filled
 * area and never as a weathering wash over a big panel. That restraint is most
 * of why the demo does not read as a toy, and an earlier round of this file
 * proved the converse: a copper-tinted wear pass over the chest plate and a
 * solid copper hip disc photographed as painted orange pads. Large shells now
 * weather toward a cool light grey — a fine chip-and-scuff speckle on dark navy
 * — and the hot orange is reserved for trim geometry.
 *
 * "It has been in this building a long time": weathering is high, roughness is
 * high, nothing on this robot is glossy.
 */

import * as THREE from 'three';
import { ROBOT_HEIGHT_M } from '../../sim/units';
import {
  assertBones,
  bolt,
  glowMaterial,
  joint,
  latheProfile,
  panelMaterial,
  part,
  puck,
  roundedBox,
  disposeTree,
  type RobotRig,
  type WeatherOpts,
} from './rig';

/* Vertical layout, metres from the sole, held to ROBOT_HEIGHT_M.droid = 2.1. */
const ANKLE_Y = 0.09;
const KNEE_Y = 0.63;
const HIP_Y = 1.13;
const TORSO_Y = 1.3;
const SHOULDER_Y = 1.7;
const NECK_Y = 1.775;
const HEAD_Y = 1.845;
const SHIN = KNEE_Y - ANKLE_Y;
const THIGH = HIP_Y - KNEE_Y;
/** Long arms, longer forearms — the sheet's hands hang past the knee. */
const UPPER_ARM = 0.46;
const FOREARM = 0.5;

/*
 * THE KEYSTONE CHEST, in numbers, because the panel work has to lie on it.
 *
 * The chest is a rounded box whose width and depth are scaled by a linear
 * function of height: full at the shoulder line, pinched to a narrow flat waist.
 * Every decal below is then placed with `frontZ()`, which is that same taper
 * evaluated on the front face — which is the difference between panels that lie
 * on the chest and panels that float off it at the top and sink into it at the
 * bottom.
 */
/*
 * Width measured against the demo, not guessed: its keystone is 0.59 of the
 * shoulder span across the top. At 0.42 ours was 0.47 of the span and the chest
 * read as a small box slung between two big discs. 0.46 puts it at 0.51 — as
 * far as it can go while still leaving the exposed shoulder axle visible either
 * side, which the sheet shows in every one of its ten views.
 */
const CHEST_W = 0.46;
const CHEST_H = 0.42;
const CHEST_D = 0.31;
const CHEST_BOT_X = 0.58;
const CHEST_BOT_Z = 0.76;
/** Front-face z at chest-local height `y`. */
const frontZ = (y: number): number => (CHEST_D / 2) * (CHEST_BOT_Z + (1 - CHEST_BOT_Z) * ((y + CHEST_H / 2) / CHEST_H));
/** How far the front face leans back per metre of drop. */
const CHEST_SLOPE = Math.atan((((1 - CHEST_BOT_Z) * CHEST_D) / 2 / CHEST_H));

/*
 * THE HEAD, in numbers, taken off the front elevation panel of
 * `robots/droid-robot.png` (panel r1c1) and the ratios in
 * `docs/model-sheet-targets.md` §5. Head-local metres; the head bone sits at
 * HEAD_Y.
 *
 *   head_h / total_h   0.162     head_w / total_w  0.283
 *   head_w / shoulder span 0.305 eye spacing / head_w 0.400
 *   eye diameter / head_w  0.12  (4-8 px on the sheet, so a soft target)
 *
 * Our shoulder span IS our total width — the hands hang inboard of the
 * pauldrons where the sheet's hang outboard of them — so head_w/total_w and
 * head_w/span cannot both be hit. HEAD_W splits them: 0.294 of each, 0.011
 * from both targets, inside the +/-0.02 band either way.
 */
const HEAD_TOP = 0.28;
const HEAD_BOT = -0.064;
const HEAD_H = HEAD_TOP - HEAD_BOT;
/** Widest point of the head — the cheek plates, not the cranium. */
const HEAD_W = 0.2824;
/** Crown to the shell's bottom lip: 0.75 of the head, the rest is jaw. */
const SKULL_H = 0.75 * HEAD_H;
const SKULL_BOT = HEAD_TOP - SKULL_H;
/*
 * The cranium's measured profile. `v` runs 0 at the crown to 1 at the bottom
 * lip; widths come off the front panel, depths and the fore/aft centre off the
 * left-profile panel r1c0 scaled to the same figure height. The top three rings
 * are rounded by hand — at the threshold the measuring pass used, the profile
 * panel's first row is already 29 px deep while the front panel's is 0 wide,
 * which taken literally builds a knife edge across the crown.
 */
const SKULL_RINGS: readonly SkullRing[] = [
  [0.0, 0.0, 0.0, -0.024],
  [0.022, 0.033, 0.04, -0.0215],
  [0.05, 0.06, 0.074, -0.019],
  [0.09, 0.0812, 0.0987, -0.0155],
  [0.15, 0.0969, 0.1165, -0.0097],
  [0.22, 0.1102, 0.1311, -0.0043],
  [0.3, 0.1195, 0.1432, -0.0027],
  [0.39, 0.1271, 0.1508, -0.0027],
  [0.48, 0.1311, 0.1567, -0.0027],
  [0.57, 0.1327, 0.1547, 0.0],
  [0.66, 0.132, 0.154, 0.0002],
  [0.75, 0.1294, 0.1452, 0.0032],
  [0.84, 0.1265, 0.1345, 0.0095],
  // The last three rings TUCK UNDER. Read literally the panels say the shell
  // is still 0.113 wide where it meets the jaw, but what is that wide down
  // there is the jaw — the helmet's own lower edge rolls inwards and the dark
  // jaw comes out from beneath it. Cut square instead, as the round before
  // this one did, and the head reads as a dome someone sawed the bottom off.
  [0.91, 0.1225, 0.1195, 0.0205],
  [0.96, 0.1125, 0.1015, 0.0325],
  [1.0, 0.082, 0.0735, 0.0435],
];
/** Surface point and outward normal on the cranium at height `v`, offset `x`. */
function onSkull(v: number, x: number): { z: number; yaw: number } {
  const hw = sampleRing(SKULL_RINGS, v, 1);
  const hd = sampleRing(SKULL_RINGS, v, 2);
  const zc = sampleRing(SKULL_RINGS, v, 3);
  const n = 2.45;
  const u = Math.min(Math.abs(x) / hw, 1);
  const w = Math.pow(Math.max(1 - Math.pow(u, n), 0), 1 / n);
  // Gradient of |x/hw|^n + |z/hd|^n = 1, which is the surface normal.
  const gx = Math.pow(u, n - 1) / hw;
  const gz = Math.pow(w, n - 1) / hd;
  return { z: zc + hd * w, yaw: Math.atan2(gx, gz) };
}

/**
 * A rounded box with a linear taper in width and depth — the keystone chest, the
 * tapering cranium, the narrowing chin.
 *
 * `roundedBox` gives analytic normals; scaling positions alone would leave those
 * normals pointing off the new surface and the shading would lie about the
 * shape. The normals are therefore pushed through the inverse-transpose of the
 * taper's Jacobian, which for `X = x·s(y), Y = y, Z = z·t(y)` works out as
 * `(nx/s, ny - nx·x·s'/s - nz·z·t'/t, nz/t)`.
 */
function taperedBox(
  w: number,
  h: number,
  d: number,
  radius: number,
  segments: number,
  topX: number,
  topZ: number,
  botX = 1,
  botZ = 1,
): THREE.BufferGeometry {
  const geo = roundedBox(w, h, d, radius, segments);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const ds = (topX - botX) / h;
  const dt = (topZ - botZ) / h;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const f = (y + h / 2) / h;
    const s = botX + (topX - botX) * f;
    const t = botZ + (topZ - botZ) * f;
    pos.setXYZ(i, x * s, y, z * t);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    const mx = nx / s;
    const my = ny - (nx * x * ds) / s - (nz * z * dt) / t;
    const mz = nz / t;
    const len = Math.hypot(mx, my, mz) || 1;
    nrm.setXYZ(i, mx / len, my / len, mz / len);
  }
  pos.needsUpdate = true;
  nrm.needsUpdate = true;
  return geo;
}

/**
 * A plain box. Piping, slats and grille bars are 2-4 mm across on a 2.1 m robot:
 * a rounded box spends 48 triangles on a corner radius nobody can resolve, this
 * spends 12. There are about sixty of them on the finished model.
 */
const slab = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);

/**
 * Concatenate a pile of small geometries into one buffer.
 *
 * The mouth grille is eighteen 4 mm bars. Eighteen meshes is eighteen draw
 * calls for something 9 cm across; this is one. Position and normal only —
 * nothing in this file uses UVs, and `part()` adds the colour attribute after.
 */
function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  for (const g of list) {
    const flat = g.getIndex() ? g.toNonIndexed() : g;
    const p = flat.getAttribute('position') as THREE.BufferAttribute;
    const n = flat.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (flat !== g) flat.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

/**
 * A dark mesh field — the recessed grille under Droid's eyes.
 *
 * `cols x rows` little bars on a regular pitch, each `fill` of its cell, in one
 * geometry. At portrait scale it reads as woven mesh; at play scale it reads as
 * "the dark hole where a mouth would be", which is the whole job.
 */
function meshField(w: number, h: number, d: number, cols: number, rows: number, fill = 0.58): THREE.BufferGeometry {
  const cw = (w / cols) * fill;
  const ch = (h / rows) * fill;
  const boxes: THREE.BufferGeometry[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g = new THREE.BoxGeometry(cw, ch, d);
      g.translate(((c + 0.5) / cols - 0.5) * w, ((r + 0.5) / rows - 0.5) * h, 0);
      boxes.push(g);
    }
  }
  return mergeGeos(boxes);
}

/**
 * THE SKULL — one ring of the profile: `[v, halfWidth, halfDepth, zCentre]`,
 * with `v` running 0 at the crown to 1 at the shell's bottom lip.
 */
type SkullRing = readonly [v: number, halfW: number, halfD: number, zc: number];

/** Non-uniform Catmull-Rom through the control rings, evaluated at `v`. */
function sampleRing(rings: readonly SkullRing[], v: number, k: 1 | 2 | 3): number {
  const n = rings.length;
  let i = 0;
  while (i < n - 2 && rings[i + 1][0] < v) i++;
  const v0 = rings[i][0];
  const v1 = rings[i + 1][0];
  const h = v1 - v0 || 1e-6;
  const t = (v - v0) / h;
  const y0 = rings[i][k];
  const y1 = rings[i + 1][k];
  // Central-difference tangents, so the surface is C1 across every knot even
  // though the knots are not evenly spaced in v.
  const prev = rings[i > 0 ? i - 1 : i];
  const next = rings[i + 2 < n ? i + 2 : i + 1];
  const m0 = (y1 - prev[k]) / (v1 - prev[0] || 1e-6);
  const m1 = (next[k] - y0) / (next[0] - v0 || 1e-6);
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1
  );
}

/**
 * Droid's cranium: a SMOOTH ELONGATED DOME whose cross-section is a
 * SUPERELLIPSE, not a circle.
 *
 * The sheet's skull is the one shape on this robot that cannot be faked with a
 * box or a sphere. Seen head-on it is an egg standing on its narrow end —
 * rounded crown, widest just below the eyes, tapering into a narrow jaw. Seen
 * from the side it is half again as deep as it is wide, with a nearly flat
 * vertical face and the whole of the extra volume swept backwards. And seen
 * from above its section is not round: the sides are visibly FLATTENED, which
 * is what gives the front elevation its hard left and right edges.
 *
 * `power` is the superellipse exponent: 2 is a plain ellipse, and the value
 * used here pushes the section toward a rounded rectangle just far enough that
 * the side planes read flat under a raking light without the silhouette
 * developing corners.
 */
function skullShell(
  rings: readonly SkullRing[],
  topY: number,
  height: number,
  power: number,
  rows = 22,
  segs = 26,
): THREE.BufferGeometry {
  const e = 2 / power;
  const sp = (c: number): number => Math.sign(c) * Math.pow(Math.abs(c), e);
  const pos: number[] = [];
  const idx: number[] = [];
  const vs: number[] = [];
  // Rows bunched toward the crown (v = t^1.3), where the curvature is highest.
  for (let r = 0; r <= rows; r++) vs.push(Math.pow(r / rows, 1.3));
  for (const v of vs) {
    const hw = Math.max(sampleRing(rings, v, 1), 0);
    const hd = Math.max(sampleRing(rings, v, 2), 0);
    const zc = sampleRing(rings, v, 3);
    const y = topY - v * height;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(hw * sp(Math.cos(a)), y, zc + hd * sp(Math.sin(a)));
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      const a = r * segs + s;
      const b = r * segs + s2;
      const c = (r + 1) * segs + s;
      const d = (r + 1) * segs + s2;
      // Wound outward. It was (a, c, b, b, c, d), which faces every triangle
      // INTO the skull: seen from behind, the back of his head was culled and
      // his eyes showed through it (Michele, 25 Sep, the 3D build's chase
      // camera: "two orange points behind his head that look too much like eyes").
      idx.push(a, b, c, b, d, c);
    }
  }
  // Flat cap on the open bottom: the jaw covers it, but a shell you can see
  // the inside of from a low camera is worse than sixty spare triangles.
  const base = pos.length / 3;
  pos.push(0, topY - height, sampleRing(rings, 1, 3));
  for (let s = 0; s < segs; s++) {
    const s2 = (s + 1) % segs;
    idx.push(rows * segs + s, rows * segs + s2, base);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function buildDroid(): RobotRig {
  const bones: Record<string, THREE.Object3D> = {};
  const parts: Record<string, THREE.Object3D> = {};
  const glow: THREE.MeshStandardMaterial[] = [];

  const root = new THREE.Group();
  root.name = 'droid';
  bones.root = root;

  /* --------------------------------------------------------------- palette */
  // Dark desaturated navy over graphite, per the sheet and the demo alike.
  const panel = panelMaterial('#3a4150', 0.55, { roughness: 0.72, metalness: 0.42 });
  const panelDark = panelMaterial('#272d39', 0.5, { roughness: 0.75, metalness: 0.45 });
  const barrel = panelMaterial('#4a5260', 0.45, { roughness: 0.5, metalness: 0.72 });
  /*
   * TRIM. The hot orange, and the ONLY hot orange on the robot.
   *
   * It exists on ring and piping geometry exclusively — shoulder hoops, collar,
   * vent frames, joint rings, the groin harness. Nothing filled, nothing
   * weathered toward it. Kept fairly smooth so the hoops catch a highlight and
   * read from across a dark room, which is what makes the demo's shoulder the
   * thing you remember about it.
   */
  const trim = panelMaterial('#cf6d28', 0.2, { roughness: 0.58, metalness: 0.22 });
  const grime = panelMaterial('#181b21', 0.3, { roughness: 0.9, metalness: 0.2 });
  // Amber. At intensity 2.4 the green channel clipped to 255 and Droid's eyes
  // photographed as lemon yellow — the one colour both the bio and GAUNTLET Stage 1
  // name for him. `#ffa63a` x 1.5 keeps R > G > B after the sRGB round trip.
  const eyeGlow = glowMaterial('#ffa63a', 1.5, '#1a1206');
  const statusGlow = glowMaterial('#d98a3a', 1.0, '#10160f');
  glow.push(eyeGlow, statusGlow);

  /**
   * Big-shell weathering: a FINE CHIP SPECKLE, not a rust wash.
   *
   * The tint is a cool light grey — paint knocked off down to primer — and the
   * noise scale is high enough that a 40 cm panel carries a dozen cycles of it.
   * The old version tinted toward copper at 7 cycles per metre, which put broad
   * brown blooms over the chest and the helmet: orange as a filled area, the one
   * thing the demo never does.
   */
  const scuff = (amount: number, seed: number, scale = 13): WeatherOpts => ({
    amount,
    seed,
    scale,
    tint: '#939bad',
    grime: 0.4,
  });
  /** Bare-metal weathering: copper bloom, for barrels and small hardware only. */
  const patina = (amount: number, seed: number, scale = 9): WeatherOpts => ({
    amount,
    seed,
    scale,
    tint: '#8a5a2b',
    grime: 0.35,
  });

  /**
   * A stack of fine rings wrapped round a limb between two heights, the radius
   * lerped so the stack follows the shaft's own taper.
   *
   * The sheet's arms and legs are SEGMENTED, not smooth: fine rings over the
   * top of the forearm and the shin, a short ribbed collar where the thigh and
   * the upper arm meet their joints. Centred on x = 0 so the two sides stay
   * exact mirrors of one another.
   */
  const bandStack = (
    parent: THREE.Object3D,
    yTop: number,
    yBot: number,
    count: number,
    rTop: number,
    rBot: number,
    seed: number,
  ): void => {
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? 0 : i / (count - 1);
      const r = rTop + (rBot - rTop) * f;
      const ring = part(new THREE.TorusGeometry(r, 0.0062, 5, 18), barrel, patina(0.45, seed + i));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = yTop + (yBot - yTop) * f;
      parent.add(ring);
    }
  };

  /* ------------------------------------------------------------- skeleton */
  const pelvis = joint(bones, root, 'pelvis', 0, HIP_Y, 0);
  const torso = joint(bones, pelvis, 'torso', 0, TORSO_Y - HIP_Y, 0);
  const neck = joint(bones, torso, 'neck', 0, NECK_Y - TORSO_Y, 0);
  const head = joint(bones, neck, 'head', 0, HEAD_Y - NECK_Y, 0);

  /* --------------------------------------------------------------- pelvis */
  const pelvisBox = part(taperedBox(0.28, 0.2, 0.22, 0.05, 3, 1, 1, 0.82, 0.88), panel, scuff(0.5, 11));
  pelvisBox.position.y = 0.01;
  pelvis.add(pelvisBox);
  const crotch = part(roundedBox(0.12, 0.14, 0.14, 0.04, 3), panelDark, scuff(0.45, 12));
  crotch.position.set(0, -0.11, 0.01);
  pelvis.add(crotch);
  /*
   * The X HARNESS across the groin: two orange straps crossing on the front of
   * the pelvis. It is on the demo, it is the lowest piece of trim on the robot,
   * and it does the job of tying the two legs back into one body — without it
   * the pelvis reads as a spare block the thighs happen to hang off.
   */
  for (const sx of [-1, 1] as const) {
    const strap = part(slab(0.2, 0.014, 0.016), trim);
    strap.position.set(0, -0.005, 0.106);
    strap.rotation.z = sx * 0.72;
    pelvis.add(strap);
  }
  const harnessHub = part(puck(0.026, 0.014, 14).rotateX(Math.PI / 2), panelDark, scuff(0.4, 14));
  harnessHub.position.set(0, -0.005, 0.112);
  pelvis.add(harnessHub);

  /* ---------------------------------------------------------------- torso */
  /*
   * A NARROW RIBBED MIDRIFF, not a stack of sausages.
   *
   * This used to be three plates stepping OUTWARD toward the chest, which at
   * portrait scale read as a ribcage of fat tubes slung under the chest. Both
   * references show the opposite: the keystone's narrow flat waist sits on a
   * slim ribbed spine, and the pelvis is the next mass down.
   */
  const spine = part(new THREE.CylinderGeometry(0.052, 0.058, 0.3, 12, 2), grime, scuff(0.4, 13));
  spine.position.y = 0.05;
  torso.add(spine);
  for (let i = 0; i < 4; i++) {
    const rib = part(taperedBox(0.15 + i * 0.022, 0.028, 0.14 + i * 0.014, 0.012, 2, 1, 1, 0.94, 0.94), panel, scuff(0.5, 20 + i));
    rib.position.set(0, -0.015 + i * 0.048, 0.006);
    torso.add(rib);
  }

  /*
   * THE KEYSTONE CHEST and everything printed on it. All of it lives in one
   * group so the panel coordinates below are chest-local and stay readable.
   */
  const chestAt = new THREE.Object3D();
  chestAt.position.set(0, 0.27, 0);
  torso.add(chestAt);
  const chest = part(
    taperedBox(CHEST_W, CHEST_H, CHEST_D, 0.05, 7, 1, 1, CHEST_BOT_X, CHEST_BOT_Z),
    panel,
    scuff(0.62, 31, 11),
  );
  chestAt.add(chest);
  parts.torsoShell = chest;

  /** Lay a decal on the tapered front face at chest-local (x, y). */
  const onChest = (o: THREE.Object3D, x: number, y: number, lift = 0.004): void => {
    o.position.set(x, y, frontZ(y) + lift);
    o.rotation.x = CHEST_SLOPE;
    chestAt.add(o);
  };

  /** A rectangle of orange piping — four thin bars, no fill inside. */
  const pipeFrame = (parent: THREE.Object3D, w: number, h: number, t = 0.0075, d = 0.014): void => {
    const rails: Array<[number, number, number, number]> = [
      [w, t, 0, h / 2 - t / 2],
      [w, t, 0, -h / 2 + t / 2],
      [t, h - 2 * t, -w / 2 + t / 2, 0],
      [t, h - 2 * t, w / 2 - t / 2, 0],
    ];
    for (const [bw, bh, bx, by] of rails) {
      const rail = part(slab(bw, bh, d), trim);
      rail.position.set(bx, by, 0);
      parent.add(rail);
    }
  };

  // Central recessed louvre, sunk into the chest rather than sitting on it.
  const louvreWell = new THREE.Object3D();
  onChest(louvreWell, 0, 0.01, -0.006);
  const louvre = part(roundedBox(0.1, 0.205, 0.022, 0.01, 2), panelDark, scuff(0.45, 35));
  louvreWell.add(louvre);
  for (let i = 0; i < 7; i++) {
    const slat = part(slab(0.074, 0.008, 0.012), grime);
    slat.position.set(0, 0.076 - i * 0.024, 0.012);
    louvreWell.add(slat);
  }
  // A single warm status pip, low on the louvre. It used to be bright green,
  // which appears nowhere on the model sheet and read as a stray LED.
  const statusLamp = part(puck(0.008, 0.008, 12).rotateX(Math.PI / 2), statusGlow);
  statusLamp.position.set(0, -0.082, 0.014);
  louvreWell.add(statusLamp);

  // The two orange-piped vents either side of it, each divided into three cells.
  for (const sx of [-1, 1] as const) {
    const vent = new THREE.Object3D();
    onChest(vent, sx * 0.098, 0.045, 0.002);
    const well = part(roundedBox(0.062, 0.132, 0.016, 0.008, 2), panelDark, scuff(0.4, 36));
    well.position.z = -0.004;
    vent.add(well);
    pipeFrame(vent, 0.07, 0.14);
    for (const cy of [0.0233, -0.0233]) {
      const rung = part(slab(0.07, 0.0075, 0.014), trim);
      rung.position.set(0, cy, 0);
      vent.add(rung);
    }
  }

  // Fine grille and an access plate low on the chest, the sheet's small print.
  const grille = new THREE.Object3D();
  onChest(grille, 0.072, -0.1, 0.002);
  const grilleWell = part(roundedBox(0.046, 0.05, 0.014, 0.006, 2), panelDark, scuff(0.4, 37));
  grilleWell.position.z = -0.004;
  grille.add(grilleWell);
  for (let i = 0; i < 4; i++) {
    const bar = part(slab(0.034, 0.005, 0.012), grime);
    bar.position.set(0, 0.015 - i * 0.01, 0.006);
    grille.add(bar);
  }
  const access = new THREE.Object3D();
  onChest(access, -0.072, -0.1, 0.002);
  const accessPlate = part(roundedBox(0.05, 0.05, 0.016, 0.006, 2), panelDark, scuff(0.5, 38));
  access.add(accessPlate);
  for (const bx of [-1, 1] as const) {
    const rivet = bolt(barrel, 0.0045, 0.005);
    rivet.position.set(bx * 0.016, -0.016, 0.01);
    rivet.rotation.x = Math.PI / 2;
    access.add(rivet);
  }

  /*
   * ONE line of orange piping, on the waist seam.
   *
   * There were two, the second a 30 cm bar across the chest under the collar. On
   * a body this dark a bright horizontal bar at the widest point of the keystone
   * is the first thing the eye lands on, ahead of the shoulder hoops — which
   * makes it the wrong thing to have drawn.
   */
  const waistSeam = part(slab(0.185, 0.006, 0.012), trim);
  onChest(waistSeam, 0, -0.182, 0.001);

  // Backpack hump — the sheet's back views have a raised panel between the blades.
  const backPack = part(taperedBox(0.26, 0.26, 0.09, 0.035, 3, 1, 1, 0.75, 0.9), panelDark, scuff(0.55, 34));
  backPack.position.set(0, 0.03, -0.155);
  chestAt.add(backPack);

  /* ----------------------------------------------------------------- head */
  /*
   * THE SKULL. A smooth rounded dome, not a cuboid.
   *
   * The round before this one took its helmet from the organisers' demo — a
   * rounded box with a bevelled crown — and the face stopped being Droid's.
   * `robots/droid-robot.png` front elevation, and its hero close-up bottom
   * right, show something quite specific and quite unlike a box: an elongated
   * dome, widest a little below the eyes, tapering into a narrow jaw, with
   * FLATTENED SIDES and a nearly flat vertical face. SKULL_RINGS is that shape
   * measured row by row off both panels; `skullShell` revolves it on a
   * superellipse section so the sides come out flat and the front and back
   * stay round.
   */
  const cranium = part(skullShell(SKULL_RINGS, HEAD_TOP, SKULL_H, 2.45), panel, scuff(0.5, 41, 15));
  head.add(cranium);
  parts.headShell = cranium;

  /*
   * CHEEK PLATES, flaring at the temples.
   *
   * The sheet's head is at its WIDEST not at the cranium but at two plates
   * standing proud of it at eye level, and their outline is what sets head_w.
   * They stand 7 mm out from the shell at the equator and 9 mm at the corner —
   * more than the sheet's two pixels, which is deliberate: at the 90 px the
   * game actually draws him they have to survive as a silhouette notch, and a
   * temple flare that only exists in the portrait is a triangle wasted.
   */
  for (const sx of [-1, 1] as const) {
    /*
     * Rounded on every edge (radius = half the thickness, so the outer face is
     * a cylinder section). A plate with square corners parks two grey lugs on
     * the temples like hearing aids; rounded, it reads as armour lying against
     * the skull, which is what the sheet has.
     */
    const plate = part(roundedBox(0.02, 0.1, 0.098, 0.01, 3), grime, scuff(0.4, 43));
    // Outer face lands exactly on HEAD_W/2, which is what head_w is measured
    // on. No z-lean: the lean carried the top corner 3 mm further out again
    // and quietly widened the head past its target.
    plate.position.set(sx * (HEAD_W / 2 - 0.0118), HEAD_TOP - 0.5 * HEAD_H, 0.008);
    plate.rotation.y = -sx * 0.07;
    head.add(plate);
  }

  /*
   * THE EYES: two SMALL ROUND AMBER BEADS, SET WIDE.
   *
   * Spacing is the measurement that matters and the one that was wrong. The
   * sheet has the centres 0.400 of head width apart (range 0.395-0.416) on a
   * head only 0.283 of total width — wide eyes on a narrow skull. The previous
   * pass had them 2.0 eye-widths apart on a wider head; the sheet's are 3.3
   * eye-widths apart, and that single number is most of why he did not read as
   * himself. Diameter is 0.12 of head width, which on the sheet is 4-8 px and
   * is therefore soft — get the spacing right and the size follows.
   *
   * Height is 0.535 of the way from crown to neck, measured on the front panel
   * (crown row 16, neck row 71, eye centres row 45.4). They are NOT in the
   * upper third. Rounded to 0.52 here, which is the top of what the pixels
   * support.
   *
   * Each bead is a sphere sunk into a dark lens socket rather than a disc on
   * the surface: a flat disc on a shell this curved stands 8 mm proud at its
   * outer edge, and the sheet's eye is plainly a domed lens.
   */
  const EYE_X = 0.2 * HEAD_W;
  const EYE_R = 0.061 * HEAD_W;
  const EYE_Y = HEAD_TOP - 0.52 * HEAD_H;
  const eyeV = (HEAD_TOP - EYE_Y) / SKULL_H;
  const { z: eyeZ, yaw: eyeYaw } = onSkull(eyeV, EYE_X);
  // The two beads ride one group, `parts.eyes`, so a renderer can slide them
  // sideways in their sockets together — a glance (the 3D intro does).
  const eyes = new THREE.Group();
  eyes.name = 'eyes';
  head.add(eyes);
  parts.eyes = eyes;
  for (const sx of [-1, 1] as const) {
    // Socket and bead share one axis at x = EYE_X, so the spacing the sheet
    // measures is the spacing the render has. Offsetting the bead along the
    // surface normal instead put it visibly off-centre in its own rim.
    const socket = part(new THREE.CylinderGeometry(EYE_R * 1.3, EYE_R * 1.22, 0.014, 18).rotateX(Math.PI / 2), grime);
    socket.position.set(sx * EYE_X, EYE_Y, eyeZ - 0.003);
    socket.rotation.y = sx * eyeYaw;
    head.add(socket);
    const bead = part(new THREE.SphereGeometry(EYE_R, 14, 10), eyeGlow);
    bead.position.set(sx * EYE_X, EYE_Y, eyeZ - 0.0085);
    eyes.add(bead);
  }

  /*
   * The crown SEAM. The sheet carries one fine panel line arcing over the top
   * of the skull; this is it, a 2 mm ring squeezed to the shell's own oval
   * section so it hugs the dome instead of floating over it.
   */
  const seamV = 0.21;
  const seamHW = sampleRing(SKULL_RINGS, seamV, 1);
  const crownSeam = part(new THREE.TorusGeometry(seamHW + 0.0012, 0.0017, 5, 32).rotateX(Math.PI / 2), panelDark);
  crownSeam.scale.z = sampleRing(SKULL_RINGS, seamV, 2) / seamHW;
  crownSeam.position.set(0, HEAD_TOP - seamV * SKULL_H, sampleRing(SKULL_RINGS, seamV, 3));
  head.add(crownSeam);

  /*
   * THE JAW AND ITS GRILLE.
   *
   * Under the shell's bottom lip the sheet has no chin: it has a dark recess
   * with a mesh panel in it, bracketed either side by two curved mandible
   * arms, narrowing into the neck column. It is the darkest thing on the robot
   * and it is what gives the face its expression — a box with five louvre
   * slats in it, which is what was here, reads as a radiator.
   */
  const JAW_TOP = SKULL_BOT + 0.014;
  const JAW_H = JAW_TOP - HEAD_BOT;
  const jaw = part(taperedBox(0.168, JAW_H, 0.152, 0.026, 3, 1, 1, 0.5, 0.52), grime, scuff(0.3, 45));
  jaw.position.set(0, (JAW_TOP + HEAD_BOT) / 2, 0.012);
  head.add(jaw);
  // The recessed mesh panel, sunk behind the jaw's front face.
  const grilleY = SKULL_BOT - 0.024;
  const grilleWellFace = part(roundedBox(0.088, 0.046, 0.016, 0.006, 2), panelDark, scuff(0.35, 46));
  grilleWellFace.position.set(0, grilleY, 0.06);
  head.add(grilleWellFace);
  const mesh = part(meshField(0.078, 0.038, 0.006, 10, 3), barrel, patina(0.55, 47));
  mesh.position.set(0, grilleY, 0.069);
  head.add(mesh);
  // The two mandible brackets, flanking the grille where the sheet's curved
  // jaw arms are — kept flush and near-black so they frame the mesh instead of
  // growing a second silhouette off the chin.
  for (const sx of [-1, 1] as const) {
    const arm = part(roundedBox(0.014, 0.058, 0.044, 0.006, 2), panelDark, scuff(0.45, 48));
    arm.position.set(sx * 0.055, grilleY - 0.003, 0.05);
    arm.rotation.z = sx * 0.16;
    arm.rotation.y = -sx * 0.3;
    head.add(arm);
  }
  // A single bright shim under the grille — the sheet's chin plate.
  const chinPlate = part(slab(0.038, 0.006, 0.022), barrel, patina(0.5, 49));
  chinPlate.position.set(0, HEAD_BOT + 0.022, 0.04);
  head.add(chinPlate);

  /*
   * THE COLLAR RING: a THICK DARK RING sitting in the chest opening like a
   * socket. With the skull, this is the feature that makes him him.
   *
   * On the sheet it is unmissable — a heavy dark torus in a bright turned rim
   * sunk into the chest, with the neck column disappearing into the middle of
   * it. What was here was a thin cup with a hairline orange ring on top, which
   * at any distance was just the gap between the head and the body. The ring
   * is now 4.8 cm in section on a 17.8 cm outside diameter: nearly two thirds
   * the width of the head, which is the proportion the sheet shows.
   */
  // The turned rim of the opening: a bright annulus the dark ring sits inside.
  const socketRim = part(
    latheProfile(
      [
        [0.058, -0.034],
        [0.064, -0.014],
        [0.078, -0.004],
        [0.098, 0.008],
        [0.106, 0.002],
        [0.106, -0.02],
      ],
      18,
      28,
    ),
    barrel,
    patina(0.45, 52),
  );
  neck.add(socketRim);
  // The ring itself, 0.178 across the outside — as wide as the grille it sits
  // under and two thirds the width of the whole head.
  const collar = part(new THREE.TorusGeometry(0.065, 0.024, 10, 28), grime, scuff(0.4, 53));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.014;
  neck.add(collar);
  // A dark floor inside it, so the socket is a hole and not a doughnut lying
  // on a flat chest.
  const socketFloor = part(puck(0.064, 0.01, 24), grime);
  socketFloor.position.y = -0.012;
  neck.add(socketFloor);
  // The orange piping stays, on the rim's outer lip where it outlines the
  // socket instead of competing with the dark ring inside it.
  const collarTrim = part(new THREE.TorusGeometry(0.1055, 0.0046, 6, 30), trim);
  collarTrim.rotation.x = Math.PI / 2;
  collarTrim.position.y = 0.002;
  neck.add(collarTrim);
  // Two concertina bands round the neck column, between the jaw and the ring.
  for (let i = 0; i < 2; i++) {
    const rib = part(new THREE.TorusGeometry(0.05 - i * 0.003, 0.008, 6, 20), barrel, patina(0.45, 54 + i));
    rib.rotation.x = Math.PI / 2;
    rib.position.y = 0.036 + i * 0.017;
    neck.add(rib);
  }

  // Droid's lamp is a pool on the floor around it: anchored at chest height,
  // aimed straight down (+Z of the anchor points at the floor).
  const lampAnchor = new THREE.Object3D();
  lampAnchor.name = 'lamp';
  lampAnchor.position.set(0, 0.46, 0.08);
  lampAnchor.rotation.x = Math.PI / 2;
  torso.add(lampAnchor);

  /* ----------------------------------------------------------------- arms */
  /*
   * THE DRUM PAULDRON, lathed once and mirrored.
   *
   * Profile runs inboard (-y, tucked against the chest) to outboard (+y, the
   * rounded end cap); the whole thing is then yawed a quarter turn so its axis
   * lies along X. A lathe is the right tool here: the shape is a solid of
   * revolution, so 24 x 28 samples buy a clean silhouette from every angle for
   * about the triangles one subdivided ellipsoid used to cost.
   *
   * The radius steps have to EASE toward the apex. A version that went
   * 0.108 -> 0.060 -> 0.000 over the last 18 mm put a near-cylindrical shelf on
   * the outer face, and the spline's flat cap on top of it: from three-quarters
   * the pauldron grew a dark stub the size of the hub cap it was meant to
   * carry. The last six control points now halve the radius step every time.
   */
  const drumProfile: Array<[number, number]> = [
    [0.086, -0.078],
    [0.124, -0.054],
    [0.148, -0.022],
    [0.156, 0.014],
    [0.152, 0.046],
    [0.14, 0.072],
    [0.12, 0.092],
    [0.092, 0.106],
    [0.05, 0.116],
    [0.0, 0.12],
  ];

  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    /*
     * SHOULDER SPAN. The sheet's front view puts the pauldron span at 0.44-0.47
     * of total height. With the joint at 0.335 and the disc reaching 0.115
     * outboard the outer edge lands at 0.45 either side: 0.43 of 2.1 m, with the
     * hands swinging out to 0.46 and setting the measured silhouette.
     */
    const shoulder = joint(bones, torso, `shoulder${L}`, side * 0.335, SHOULDER_Y - TORSO_Y, 0.0);
    const upper = joint(bones, shoulder, `upperArm${L}`, 0, 0, 0);
    const fore = joint(bones, upper, `forearm${L}`, 0, -UPPER_ARM, 0);
    const hand = joint(bones, fore, `hand${L}`, 0, -FOREARM, 0);

    /*
     * The exposed shoulder axle, OFFSET INBOARD.
     *
     * It has to be long enough that its inboard end is buried in the keystone —
     * a shoulder that only almost reaches the chest is a floating limb and
     * `robots.smoke` asserts against exactly that. Centred on the joint, a
     * barrel that long also ran 2 cm out past the pauldron's apex and put a
     * dark flat-ended stub in the middle of the dome, which is the defect the
     * hub cap then got blamed for and shrunk twice over. It reaches into the
     * chest at one end and stops inside the dome at the other.
     */
    const shoulderBarrel = part(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 16, 1), barrel, patina(0.45, 55));
    shoulderBarrel.rotation.z = Math.PI / 2;
    shoulderBarrel.position.x = side * -0.06;
    shoulder.add(shoulderBarrel);

    const drum = part(latheProfile(drumProfile, 24, 28), panel, scuff(0.5, 56, 14));
    drum.rotation.z = -side * (Math.PI / 2);
    shoulder.add(drum);

    /*
     * THE HOOP. The one feature you remember about this robot.
     *
     * It rides the OUTER RIM, not the equator. Parked on the equator it was a
     * centimetre proud of the shell and still half invisible: from any
     * three-quarter view the disc's own bulge hides the near side of its widest
     * circle, so the hoop photographed as a crescent. Because the disc's axis is X the
     * hoop lies in the YZ plane and adds NOTHING to the measured width — it buys
     * the demo's broad shoulder without costing the sheet's lanky silhouette.
     *
     * There was briefly a second, thinner ring at the inboard root as well. Two
     * concentric orange rings on a drum twice this long read as a cotton reel:
     * one hoop on a shallow disc is the demo's shape and the demo's restraint.
     */
    const hoop = part(new THREE.TorusGeometry(0.16, 0.0085, 8, 32), trim);
    hoop.rotation.y = Math.PI / 2;
    hoop.position.x = side * 0.046;
    shoulder.add(hoop);


    /*
     * The sheet's circular shoulder emblem, as a hub cap.
     *
     * It replaces a four-spoke copper pinwheel decal that read as a spiral
     * sticker and, at the portrait's three-quarter angle, faced away on
     * whichever shoulder was turned from the camera.
     *
     * A flat disc CANNOT sit proud of a dome anywhere but its apex: parked at
     * 70% of the radius it vanished inside the shell, and pushed out until it
     * showed it read as a stub sticking through. At the apex the dome falls only
     * a couple of millimetres over the cap's own radius, so it lands flush all
     * round — and it is kept SMALL, because at 10 cm across a dark disc in the
     * middle of a lit dome reads as a hole punched in the shoulder.
     */
    const hubDisc = part(puck(0.036, 0.01, 20).rotateZ(Math.PI / 2), barrel, patina(0.55, 58));
    hubDisc.position.x = side * 0.1185;
    shoulder.add(hubDisc);
    const hubRing = part(new THREE.TorusGeometry(0.037, 0.0038, 6, 20), trim);
    hubRing.rotation.y = Math.PI / 2;
    hubRing.position.x = side * 0.1225;
    shoulder.add(hubRing);
    const hubBoss = part(puck(0.013, 0.008, 10).rotateZ(Math.PI / 2), panelDark, patina(0.6, 59));
    hubBoss.position.x = side * 0.1265;
    shoulder.add(hubBoss);

    const upperMesh = part(new THREE.CylinderGeometry(0.062, 0.05, UPPER_ARM - 0.1, 14, 4), panel, scuff(0.5, 60));
    upperMesh.position.y = -UPPER_ARM / 2;
    upper.add(upperMesh);
    /*
     * The upper arm's SHELL PLATE and its lower CUFF.
     *
     * What was here was a 20 cm dark box stuck on the front of a cylinder — a
     * plank, not armour. The sheet's upper arm is a smooth shell with a hard
     * lower lip and no banding until the elbow; the plate is now shorter, set
     * close to the shaft and tapered with it, and the cuff is what ends it.
     */
    const upperPlate = part(taperedBox(0.088, 0.16, 0.05, 0.018, 3, 0.94, 0.9, 0.86, 0.86), panelDark, scuff(0.55, 61));
    upperPlate.position.set(0, -0.15, 0.028);
    upper.add(upperPlate);
    bandStack(upper, -UPPER_ARM + 0.08, -UPPER_ARM + 0.035, 3, 0.053, 0.05, 61);
    // Exposed elbow barrel, then the long forearm.
    const elbow = part(new THREE.CylinderGeometry(0.06, 0.06, 0.125, 16, 2), barrel, patina(0.45, 62));
    elbow.rotation.z = Math.PI / 2;
    fore.add(elbow);
    const elbowRing = part(new THREE.TorusGeometry(0.063, 0.0055, 6, 22), trim);
    elbowRing.rotation.y = Math.PI / 2;
    elbowRing.position.x = side * 0.058;
    fore.add(elbowRing);
    const foreMesh = part(new THREE.CylinderGeometry(0.055, 0.042, FOREARM - 0.09, 14, 4), panel, scuff(0.5, 63));
    foreMesh.position.y = -FOREARM / 2 - 0.01;
    fore.add(foreMesh);
    /*
     * THE BANDED FOREARM — the one piece of limb detail the sheet insists on.
     *
     * Look at the front elevation: the upper half of the forearm is a stack of
     * fine rings, a dozen of them, like a sleeve of stacked washers, and it
     * runs all the way round the limb rather than sitting on the front of it.
     * Seven bands is where the pitch stops reading as stripes and starts
     * reading as segments at the scale the game draws.
     */
    bandStack(fore, -0.065, -0.235, 7, 0.056, 0.05, 64);
    const forePlate = part(taperedBox(0.072, 0.2, 0.05, 0.016, 3, 0.94, 0.92, 0.82, 0.84), panelDark, scuff(0.55, 65));
    forePlate.position.set(0, -0.32, 0.024);
    fore.add(forePlate);
    const foreBand = part(new THREE.TorusGeometry(0.05, 0.01, 8, 20), barrel, patina(0.4, 66));
    foreBand.rotation.x = Math.PI / 2;
    foreBand.position.y = -0.36;
    fore.add(foreBand);

    /*
     * A SPLAYED RAKE OF THIN FINGERS.
     *
     * Both references give Droid a skeletal hand whose fingers are clearly
     * separated — you can see daylight between them. Ours were 19 mm wide on a
     * 24 mm pitch, which is a mitten with grooves in it. 12 mm on a 27 mm pitch,
     * fanned outward, is the same bone count reading as a hand.
     */
    const wrist = part(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 14, 1), barrel, patina(0.4, 66));
    wrist.rotation.z = Math.PI / 2;
    hand.add(wrist);
    const palm = part(taperedBox(0.09, 0.1, 0.042, 0.014, 3, 1, 1, 0.82, 0.9), panel, scuff(0.5, 67));
    palm.position.y = -0.058;
    hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * 0.027;
      const finger = new THREE.Object3D();
      finger.position.set(fx, -0.104, 0.006);
      finger.rotation.x = -0.12 - i * 0.03;
      finger.rotation.z = -(i - 1.5) * 0.14;
      hand.add(finger);
      bones[`finger${L}${i}`] = finger;
      const seg1 = part(slab(0.012, 0.052, 0.014), panelDark);
      seg1.position.y = -0.026;
      finger.add(seg1);
      const knuckle = new THREE.Object3D();
      knuckle.position.y = -0.052;
      knuckle.rotation.x = -0.35;
      finger.add(knuckle);
      const seg2 = part(slab(0.0105, 0.044, 0.012), panelDark);
      seg2.position.y = -0.022;
      knuckle.add(seg2);
    }
    const thumb = new THREE.Object3D();
    thumb.position.set(side * 0.047, -0.078, 0.012);
    thumb.rotation.set(-0.3, 0, side * 0.85);
    hand.add(thumb);
    const thumbSeg = part(slab(0.013, 0.048, 0.014), panelDark);
    thumbSeg.position.y = -0.024;
    thumb.add(thumbSeg);

    // Hunched, arms slightly forward and splayed — the sheet's default stance.
    shoulder.rotation.x = -0.1;
    shoulder.rotation.z = side * 0.055;
    fore.rotation.x = -0.16;
  }

  /* ----------------------------------------------------------------- legs */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const hip = joint(bones, pelvis, `hip${L}`, side * 0.125, 0, 0);
    const thigh = joint(bones, hip, `thigh${L}`, 0, 0, 0);
    const shin = joint(bones, thigh, `shin${L}`, 0, -THIGH, 0);
    const foot = joint(bones, shin, `foot${L}`, 0, -SHIN, 0);

    /*
     * STACKED RIBBED DISCS, like washers on a shaft, with an orange ring round
     * the outermost. This is the demo's joint vocabulary and it is what turns a
     * bare cylinder into something that looks like it turns. A solid copper disc
     * 0.14 m across used to sit here and photographed as a painted orange pad on
     * the widest part of the hip.
     */
    const hipBarrel = part(new THREE.CylinderGeometry(0.086, 0.086, 0.12, 18, 1), barrel, patina(0.5, 71));
    hipBarrel.rotation.z = Math.PI / 2;
    hip.add(hipBarrel);
    const hipStack: Array<[number, number, number]> = [
      [0.078, 0.016, 0.064],
      [0.066, 0.014, 0.08],
      [0.046, 0.012, 0.094],
    ];
    for (let i = 0; i < hipStack.length; i++) {
      const [r, t, x] = hipStack[i];
      const disc = part(puck(r, t, 20).rotateZ(Math.PI / 2), i === 1 ? panelDark : barrel, patina(0.55, 72 + i));
      disc.position.x = side * x;
      hip.add(disc);
    }
    const hipRing = part(new THREE.TorusGeometry(0.083, 0.0065, 6, 24), trim);
    hipRing.rotation.y = Math.PI / 2;
    hipRing.position.x = side * 0.064;
    hip.add(hipRing);

    const thighMesh = part(new THREE.CylinderGeometry(0.082, 0.068, THIGH - 0.1, 14, 4), panel, scuff(0.5, 75));
    thighMesh.position.y = -THIGH / 2;
    thigh.add(thighMesh);
    /*
     * The thigh gets the same treatment as the upper arm: a tapered shell that
     * follows the shaft instead of a dark plank laid against it, and a short
     * band stack where it meets the knee, which is where the sheet's thigh
     * ends in a ribbed collar.
     */
    const thighPlate = part(taperedBox(0.112, 0.21, 0.058, 0.022, 3, 0.96, 0.9, 0.84, 0.84), panelDark, scuff(0.55, 76));
    thighPlate.position.set(0, -0.19, 0.032);
    thigh.add(thighPlate);
    bandStack(thigh, -THIGH + 0.085, -THIGH + 0.03, 3, 0.072, 0.068, 76);

    // Exposed knee barrel, same stacked-disc construction one size down.
    const kneeBarrel = part(new THREE.CylinderGeometry(0.073, 0.073, 0.13, 16, 1), barrel, patina(0.5, 77));
    kneeBarrel.rotation.z = Math.PI / 2;
    shin.add(kneeBarrel);
    for (const [r, t, x, dark] of [
      [0.066, 0.014, 0.058, 0],
      [0.05, 0.012, 0.072, 1],
    ] as const) {
      const disc = part(puck(r, t, 18).rotateZ(Math.PI / 2), dark ? panelDark : barrel, patina(0.55, 78));
      disc.position.x = side * x;
      shin.add(disc);
    }
    const kneeRing = part(new THREE.TorusGeometry(0.071, 0.006, 6, 22), trim);
    kneeRing.rotation.y = Math.PI / 2;
    kneeRing.position.x = side * 0.058;
    shin.add(kneeRing);

    const shinMesh = part(new THREE.CylinderGeometry(0.066, 0.05, SHIN - 0.1, 14, 4), panel, scuff(0.5, 79));
    shinMesh.position.y = -SHIN / 2;
    shin.add(shinMesh);
    bandStack(shin, -0.075, -0.155, 4, 0.062, 0.058, 80);
    const shinPlate = part(taperedBox(0.094, 0.24, 0.054, 0.02, 3, 0.95, 0.92, 0.8, 0.84), panelDark, scuff(0.55, 81));
    shinPlate.position.set(0, -0.3, 0.03);
    shin.add(shinPlate);
    const calfCable = part(new THREE.CapsuleGeometry(0.014, SHIN - 0.2, 4, 8), grime);
    calfCable.position.set(side * 0.02, -SHIN / 2, -0.05);
    shin.add(calfCable);

    /*
     * A FLAT WEDGE SLAB on an orange-ringed ankle disc.
     *
     * The ankle ring is the cheapest piece of trim on the robot and one of the
     * most useful: it is at eye level for the floor-level chapter cameras, where
     * the shoulder hoops are out of frame.
     */
    const ankle = part(new THREE.CylinderGeometry(0.05, 0.05, 0.095, 14, 1), barrel, patina(0.45, 81));
    ankle.rotation.z = Math.PI / 2;
    foot.add(ankle);
    // One disc per foot, on the OUTBOARD side only. Ringing both cheeks of both
    // ankles put four bright horseshoes in the bottom eighth of the frame and
    // dragged the eye straight off the shoulders.
    const ankleDisc = part(puck(0.042, 0.012, 16).rotateZ(Math.PI / 2), panelDark, patina(0.5, 82));
    ankleDisc.position.x = side * 0.05;
    foot.add(ankleDisc);
    const ankleRing = part(new THREE.TorusGeometry(0.045, 0.005, 6, 20), trim);
    ankleRing.rotation.y = Math.PI / 2;
    ankleRing.position.x = side * 0.052;
    foot.add(ankleRing);
    const boot = part(taperedBox(0.135, 0.09, 0.29, 0.022, 3, 1, 1, 0.86, 1), panel, scuff(0.6, 83, 20));
    boot.position.set(0, -0.045, 0.045);
    foot.add(boot);
    // The wedge: a thin sloped plate running out to the toe, so the foot reads as
    // a slab standing on the floor rather than a brick hovering over it.
    const toeWedge = part(taperedBox(0.12, 0.034, 0.12, 0.01, 2, 1, 1, 0.78, 1), panelDark, scuff(0.65, 84));
    toeWedge.position.set(0, -0.064, 0.155);
    toeWedge.rotation.x = 0.08;
    foot.add(toeWedge);
    const heelBlock = part(roundedBox(0.1, 0.06, 0.06, 0.015, 2), panelDark, scuff(0.65, 85));
    heelBlock.position.set(0, -0.045, -0.085);
    foot.add(heelBlock);
    for (const bx of [-1, 1]) {
      const rivet = bolt(barrel, 0.008, 0.006);
      rivet.position.set(bx * 0.06, -0.02, 0.05);
      rivet.rotation.z = (bx * Math.PI) / 2;
      foot.add(rivet);
    }
  }

  // The forward hunch. Applied to the base pose so every gait and idle state
  // inherits it: Droid never stands up straight.
  torso.rotation.x = 0.12;
  neck.rotation.x = -0.06;
  head.rotation.x = -0.03;

  assertBones('droid', bones);

  return {
    kind: 'droid',
    root,
    bones,
    parts,
    height: ROBOT_HEIGHT_M.droid,
    glow,
    lampAnchor,
    dispose: () => disposeTree(root),
  };
}
