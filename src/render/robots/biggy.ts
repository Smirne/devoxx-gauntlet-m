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
 * THE BELLY IS A BALL, NOT A CUSHION.
 * ----------------------------------
 * Fitting a circle to the sheet's front elevation — flood-filled, 584 px crown
 * to 976 px sole, so 392 px tall — the belly's own outline is a circular arc of
 * radius 0.41 of the figure's height whose centre sits a little under halfway
 * up. Sampled at three heights the fit is within two pixels each time, which is
 * as close to "it is a sphere" as a painted sheet gets. What hides that is the
 * occlusion: the helmet is a LID over the ball's top cap and the trousers are a
 * collar round its bottom cap, so only the middle 60% of a sphere is ever in
 * view. The build this replaces drew the visible part as a squashed ellipsoid —
 * 1.2 m across by 0.75 tall — and got a cushion instead of a ball. Now the
 * profile is the circle itself (`BELLY_R` about `BELLY_CY`), cut at the two
 * heights where the other parts take over, so the outline curves like a sphere
 * because it is one.
 *
 * Three ratios are asserted in `tests/robots.smoke.test.ts` and none of them
 * moved: the gut is 0.83 of his height across (sheet 0.82), the whole figure
 * 1.00 (sheet 0.97 — the arms hang OUTSIDE the gut), and the dome 0.80 of the
 * gut (sheet 0.75), so the gut overhangs the helmet all the way round.
 *
 * The rest, in Michele's own priority order:
 *   - the belly: chipped paint over the orange, meridian panel seams, one low
 *     horizontal seam, a cream stencil emblem and a small decal plate — all
 *     painted into one procedurally generated canvas texture, because a
 *     vertex-colour blotch on a 56-column lathe cannot have an edge;
 *   - the helmet: a low riveted steel-blue dome with a FLARED BRIM and a black
 *     gasket band under it, two recessed port lenses, a whip antenna;
 *   - the arms: an angular pauldron cap, a thick cylindrical upper arm, a ring
 *     joint carrying a lens disc, and a blocky grey work glove with four stubby
 *     segmented fingers — not the thin segmented sticks that came before, which
 *     read far too light for a robot whose whole character is inertia;
 *   - the trousers: a blue-grey yoke under the gut with a ribbed hose wrapped
 *     round it, short tapered legs, wide moulded boots with a splayed sole.
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
  excludeFromBounds,
  glowMaterial,
  joint,
  lerp,
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
/** The dome's base — the helmet is a lid dropped straight onto the belly. */
const HEAD_Y = 1.13;
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

/** Radius of the ball at world height `y` — exact, no table to drift out of step. */
function ballR(y: number): number {
  const d = (y - BELLY_CY) / BELLY_R;
  return d <= -1 || d >= 1 ? 0 : BELLY_R * Math.sqrt(1 - d * d);
}

/**
 * The belly's lathe profile, `[radius, worldY]`, bottom to top.
 *
 * The circular section is sampled by ANGLE and forced through theta = 0, so the
 * lathe's widest ring is exactly `BELLY_R` and the asserted gut width cannot
 * drift with the sample count. Above and below the cuts the profile closes with
 * a few steep points: they are inside the helmet and inside the trouser yoke
 * respectively, and the steepness is deliberate — a shallow closure would meet
 * the leg cones almost tangentially, which is precisely the geometry that used
 * to saw the left knee into a row of notches.
 */
function bellyProfile(): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  // Bottom cap, inside the yoke.
  pts.push([0, 0.2455], [0.18, 0.2465], [0.3, 0.2495], [0.348, 0.2525]);
  const t0 = Math.asin((BELLY_CUT_LO - BELLY_CY) / BELLY_R);
  const t1 = Math.asin((BELLY_CUT_HI - BELLY_CY) / BELLY_R);
  const nLo = 13;
  const nHi = 11;
  for (let i = 0; i <= nLo; i++) {
    const t = t0 + ((0 - t0) * i) / nLo;
    pts.push([BELLY_R * Math.cos(t), BELLY_CY + BELLY_R * Math.sin(t)]);
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

/** Dome: 0.956 m across = 0.80 of the belly, so the belly overhangs it all round. */
const HELM_R = 0.478;
const HELM_H = 0.32;
/** The brim's outer lip — it stands 4 cm proud of the gasket it shades. */
const BRIM_R = 0.518;
/**
 * The black gasket band between the brim and the orange. It follows the ball's
 * own surface plus a millimetre, so it is a collar clamped onto the sphere
 * rather than a hoop hanging in the air near it.
 */
const GASKET_Y0 = 1.05;
const GASKET_Y1 = 1.152;

/* ----------------------------------------------------------- the arms */

/**
 * Thick arms, hung OUTSIDE the gut.
 *
 * The widest point of the whole figure is the elbow's lens hub at 0.729 out,
 * and the pair sit 0.075 m forward of the belly's axis. Both numbers are there
 * for the same reason: the portrait camera stands 34 degrees off the front,
 * which foreshortens an arm's sideways offset by cos 34 = 0.83 while leaving a
 * solid of revolution exactly as wide as it ever was, so an arm merely level
 * with the belly's edge is BEHIND it from that camera. A test measures the
 * clearance in exactly that projection.
 */
const SHOULDER_X = 0.585;
const SHOULDER_Z = 0.075;
const UPPER_ARM = 0.28;
const FOREARM = 0.2;
const UPPER_R = 0.101;
const FORE_R = 0.096;

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

const _v = new THREE.Vector3();
const _ctr = new THREE.Vector3();
const _rad = new THREE.Vector3();

/**
 * A torus whose tube is corrugated along its length — the ribbed hose wrapped
 * round Biggy's waist. `ribs` must be a whole number or the corrugation does not
 * meet itself where the hose closes, and `tubSeg` wants to be four times `ribs`
 * or more: at two segments a rib the corrugation is a triangle wave and the
 * hose's silhouette comes out looking like a tessellation fault, which on this
 * robot is exactly the thing nobody should have to look at twice.
 */
function ribbedTorus(major: number, tube: number, ribs: number, depth: number, radSeg = 7, tubSeg = 84): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(major, tube, radSeg, tubSeg);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const a = Math.atan2(_v.y, _v.x);
    _ctr.set(Math.cos(a) * major, Math.sin(a) * major, 0);
    _rad.copy(_v).sub(_ctr);
    _rad.multiplyScalar(1 + depth * Math.sin(ribs * a));
    _v.copy(_ctr).add(_rad);
    pos.setXYZ(i, _v.x, _v.y, _v.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
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

  /** The dome's own paint: steel-blue chipping to orange primer and bare steel. */
  const domePaint = paintTexture({
    w: 640,
    h: 200,
    base: '#64788d',
    chip: '#8a919a',
    primer: '#966a4c',
    turnR: HELM_R,
    spanM: 0.55,
    freq: 12,
    coverage: 0.33,
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
   * Under the gut: the trouser yoke, the ribbed hose and the orange band.
   *
   * The yoke's top rim is 5 cm INSIDE the ball at the height it reaches, so it
   * disappears into the sphere rather than ending on a visible lip; its bottom
   * is a near-flat disc, which is what the leg cones pass through. That matters:
   * a cone through a horizontal plane crosses it at 90 degrees and tessellates
   * cleanly, where the old skirt met the shins at a few degrees off tangent and
   * shredded both into the sawtooth that has been sitting on the left knee.
   */
  const YOKE_PTS: Array<[number, number]> = [
    [0, 0.2325],
    [0.21, 0.233],
    [0.32, 0.2355],
    [0.378, 0.2455],
    [0.412, 0.261],
    [0.4255, 0.2785],
    [0.4265, 0.295],
    [0.418, 0.3085],
    [0.4, 0.3185],
    [0.375, 0.325],
  ];
  const yoke = part(lathe(YOKE_PTS, TORSO_Y, 48), armour, wear(0.7, 8));
  torso.add(yoke);

  /** The orange band round the yoke, where the sheet puts one. */
  const band = part(
    new THREE.CylinderGeometry(0.417, 0.387, 0.017, 48, 1, true),
    orangeTrim,
    wear(0.8, 9, 7),
  );
  band.position.y = 0.255 - TORSO_Y;
  torso.add(band);

  /*
   * THE RIBBED HOSE.
   *
   * The single most recognisable thing under the demo's belly: a corrugated hose
   * lying in the crease where the ball overhangs the trousers. The big one sits
   * exactly ON the seam where the sphere gives way to the yoke — its inner wall
   * inside the ball, its outer wall proud of the skirt — so the join between the
   * two masses is a tube instead of a hard rim. That was the difference between
   * "a ball resting on a saucer" and the demo's hoop-and-hose assembly.
   */
  for (const [hy, major, tube, ribs, depth, seg] of [
    [0.305, 0.428, 0.036, 30, 0.11, 120],
    [0.2645, 0.412, 0.019, 24, 0.11, 96],
  ] as const) {
    const hose = part(ribbedTorus(major, tube, ribs, depth, 8, seg), armour, wear(0.62, 40));
    hose.rotation.x = Math.PI / 2;
    hose.position.y = hy - TORSO_Y;
    torso.add(hose);
  }
  boltRing(torso, steel, {
    count: 10,
    radius: 0.4245,
    y: 0.2835 - TORSO_Y,
    boltRadius: 0.012,
    boltHeight: 0.01,
    phase: 0.31,
    aimFrom: new THREE.Vector3(0, 0.1 - TORSO_Y, 0),
  });

  /* ------------------------------------------ gasket band under the brim */
  // Fixed to the belly, not to the head: the helmet swivels over it.
  const gasketGeo = new THREE.CylinderGeometry(
    ballR(GASKET_Y1) + 0.008,
    ballR(GASKET_Y0) + 0.008,
    GASKET_Y1 - GASKET_Y0,
    56,
    1,
    true,
  );
  const gasket = part(gasketGeo, gasketMat, wear(0.2, 11));
  gasket.position.y = (GASKET_Y0 + GASKET_Y1) / 2 - TORSO_Y;
  torso.add(gasket);
  // A hard lip closing the bottom of the band, so it reads as a clamped collar
  // and not as a painted stripe.
  const gasketLip = part(new THREE.TorusGeometry(ballR(GASKET_Y0) + 0.008, 0.012, 8, 56), gasketMat, wear(0.3, 12));
  gasketLip.rotation.x = Math.PI / 2;
  gasketLip.position.y = GASKET_Y0 - TORSO_Y;
  torso.add(gasketLip);

  /*
   * TWO EYES — A DELIBERATE DEVIATION FROM BOTH REFERENCES.
   *
   * The sheet's gasket is blank in all nine views and the demo's dome ports are
   * dead glass. Michele's standing call is that gameplay legibility wins: the
   * player has to be able to tell at a glance which way the heaviest robot in
   * the room is facing, and the band is the only face Biggy has. They are built
   * as proper lamps now — a steel bezel, a dark socket, a small amber lens set
   * into it — rather than the two flat amber blobs they were, and they are the
   * only emissive geometry anywhere near his face.
   */
  const EYE_Y = 1.08;
  const eyeR = ballR(EYE_Y) + 0.008;
  const eyeTilt = Math.atan2(
    ballR(GASKET_Y0) - ballR(GASKET_Y1),
    GASKET_Y1 - GASKET_Y0,
  );
  for (const sx of [-1, 1]) {
    const azi = sx * 0.3;
    const ex = Math.sin(azi) * eyeR;
    const ez = Math.cos(azi) * eyeR;
    const socketAt = new THREE.Object3D();
    socketAt.position.set(ex, EYE_Y - TORSO_Y, ez);
    socketAt.rotation.y = azi;
    socketAt.rotation.x = Math.PI / 2 - eyeTilt;
    torso.add(socketAt);
    const bezel = part(new THREE.TorusGeometry(0.031, 0.01, 8, 22), steel, wear(0.5, 44));
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = 0.004;
    socketAt.add(bezel);
    const socket = part(puck(0.031, 0.014, 22), gasketMat);
    socketAt.add(socket);
    const lens = part(puck(0.024, 0.018, 22), eyeGlow);
    lens.position.y = 0.004;
    socketAt.add(lens);
  }

  // Biggy's lamp: the wide blue flood, out of the gasket band.
  const lampAnchor = new THREE.Object3D();
  lampAnchor.name = 'lamp';
  lampAnchor.position.set(0, EYE_Y - TORSO_Y, eyeR);
  torso.add(lampAnchor);

  /* ------------------------------------------------------- helmet (head) */
  const domeR = (y: number): number => HELM_R * Math.sqrt(Math.max(0, 1 - (y / HELM_H) ** 2));
  const domeY = (r: number): number => HELM_H * Math.sqrt(Math.max(0, 1 - (r / HELM_R) ** 2));

  const domeGeo = new THREE.SphereGeometry(1, 48, 22, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.scale(HELM_R, HELM_H, HELM_R);
  const dome = part(domeGeo, domeMat, domePaint ? shading(13) : wear(0.55, 13, 4));
  head.add(dome);
  parts.headShell = dome;

  /*
   * THE FLARED BRIM.
   *
   * The thing the old helmet most obviously lacked. On both references the dome
   * does not simply stop: it ends in a skirt that kicks outward and overhangs
   * the gasket by a good four centimetres, throwing a hard shadow across the
   * band. A cone plus a lip torus is all it takes, and it changes the whole read
   * of the head from "sphere cap" to "hat".
   */
  const brim = part(
    new THREE.CylinderGeometry(domeR(0.1075) + 0.004, BRIM_R, 0.115, 56, 1, true),
    armourDark,
    wear(0.5, 14),
  );
  brim.position.y = 0.05;
  head.add(brim);
  const brimLip = part(new THREE.TorusGeometry(BRIM_R, 0.016, 9, 56), rubber, wear(0.45, 15));
  brimLip.rotation.x = Math.PI / 2;
  brimLip.position.y = -0.0075;
  head.add(brimLip);
  // A riveted seam round the dome just above the brim — the sheet has one and so
  // does the demo, and it is what makes the dome read as beaten plate.
  const seam = part(
    new THREE.CylinderGeometry(domeR(0.152) + 0.004, domeR(0.11) + 0.005, 0.045, 56, 1, true),
    armour,
    wear(0.5, 45),
  );
  seam.position.y = 0.131;
  head.add(seam);
  boltRing(head, steel, {
    count: 16,
    radius: 0.428,
    y: domeY(0.428) - 0.004,
    boltRadius: 0.011,
    boltHeight: 0.009,
    phase: 0.196,
    aimFrom: new THREE.Vector3(0, -0.3, 0),
  });
  boltRing(head, steel, {
    count: 6,
    radius: 0.3,
    y: domeY(0.3) - 0.006,
    boltRadius: 0.018,
    boltHeight: 0.014,
    phase: 0.42,
    aimFrom: new THREE.Vector3(0, 0, 0),
  });
  // The crown hatch the demo carries at the top of the dome.
  const crownHatch = part(roundedBox(0.11, 0.024, 0.155, 0.01, 2), armour, wear(0.5, 46));
  crownHatch.position.set(0.035, HELM_H - 0.023, -0.075);
  head.add(crownHatch);

  /*
   * THE PAIRED FRONT PORT LENSES.
   *
   * In all nine views of the sheet and on the demo's dome: two deeply recessed
   * circular ports side by side on the dome's front-upper face. They are what
   * makes the helmet read as *Biggy's* helmet. Each sits on the dome's own
   * surface normal, and each is now a real lens stack — steel collar, bright
   * inner ring, dark glass, a small boss behind it — rather than the flat dark
   * plug it used to be.
   */
  const PORT_Y = 0.195;
  const PORT_AZI = 0.48;
  const portUp = new THREE.Vector3(0, 1, 0);
  for (const sx of [-1, 1]) {
    const pr = domeR(PORT_Y);
    const px = sx * pr * Math.sin(PORT_AZI);
    const pz = pr * Math.cos(PORT_AZI);
    const port = new THREE.Object3D();
    port.position.set(px, PORT_Y, pz);
    port.quaternion.setFromUnitVectors(
      portUp,
      new THREE.Vector3(px / (HELM_R * HELM_R), PORT_Y / (HELM_H * HELM_H), pz / (HELM_R * HELM_R)).normalize(),
    );
    head.add(port);
    const collar = part(new THREE.CylinderGeometry(0.081, 0.09, 0.05, 28), armour, wear(0.5, 16));
    collar.position.y = -0.014;
    port.add(collar);
    const ringMesh = part(new THREE.TorusGeometry(0.073, 0.018, 10, 30), rubber, wear(0.4, 17));
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.014;
    port.add(ringMesh);
    const inner = part(new THREE.TorusGeometry(0.056, 0.008, 8, 26), steel, wear(0.4, 47));
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.01;
    port.add(inner);
    /*
     * The well. An open-ended cylinder would be the honest way to cut one, but
     * its inner wall is back-facing from outside and culls away, so the port
     * photographed as an empty outline. A dark glass plug set below the ring
     * gives the same read from every angle the diorama camera can reach.
     */
    const well = part(new THREE.CylinderGeometry(0.058, 0.05, 0.036, 26), glass);
    well.position.y = -0.002;
    port.add(well);
    const boss = part(new THREE.CylinderGeometry(0.022, 0.026, 0.026, 12), steel, wear(0.5, 19));
    boss.position.y = -0.014;
    port.add(boss);
  }

  // The small nubs at the dome's sides, between the ports and the brim.
  for (const sx of [-1, 1]) {
    const ny = 0.115;
    const nub = part(roundedBox(0.07, 0.065, 0.125, 0.026, 2), armour, wear(0.55, 20));
    nub.position.set(sx * (domeR(ny) - 0.01), ny, -0.02);
    nub.rotation.z = -sx * 0.2;
    head.add(nub);
    const nubTip = part(roundedBox(0.03, 0.05, 0.11, 0.014, 2), orangeTrim, wear(0.75, 21, 7));
    nubTip.position.set(sx * (domeR(ny) + 0.021), ny + 0.003, -0.02);
    nubTip.rotation.z = -sx * 0.2;
    head.add(nubTip);
  }

  /*
   * The whip antenna. It stays out of the measured silhouette — it is a wire,
   * not the top of his head, and `ROBOT_HEIGHT_M.biggy` is asserted against that
   * silhouette — and it is short enough to stay inside the portrait's margin.
   */
  const antenna = joint(bones, head, 'antenna', 0.115, domeY(0.15) - 0.01, -0.075);
  antenna.rotation.set(-0.05, 0, -0.04);
  const whip = part(new THREE.CylinderGeometry(0.0022, 0.0055, 0.17, 5), rubber);
  whip.position.y = 0.085;
  antenna.add(excludeFromBounds(whip));
  const whipTip = part(ellipsoid(0.009, 0.012, 0.009, 8, 6), pilotGlow);
  whipTip.position.y = 0.172;
  antenna.add(excludeFromBounds(whipTip));
  const antennaBase = part(new THREE.CylinderGeometry(0.016, 0.021, 0.03, 10), steel, wear(0.4, 22));
  antennaBase.position.y = 0.01;
  antenna.add(antennaBase);

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
     * THE PAULDRON — an angular cap, not a pad.
     *
     * The build before this hung a 13 cm slab off each shoulder and called it an
     * arm. On both references the shoulder is a big bevelled blue cap that rises
     * nearly to the gasket line and clearly carries the arm's weight; everything
     * about Biggy is inertia, and an arm that looks light undoes that in one
     * glance. Three stacked boxes with a small corner radius give the bevelled,
     * faceted read the demo's fin has without a lathe's cost.
     */
    const capMain = part(roundedBox(0.215, 0.23, 0.25, 0.05, 3), armour, wear(0.6, 24));
    capMain.position.set(0, 0.025, -0.008);
    shoulder.add(capMain);
    const capTop = part(roundedBox(0.178, 0.075, 0.205, 0.045, 2), armour, wear(0.55, 48));
    capTop.position.set(-side * 0.008, 0.145, -0.008);
    capTop.rotation.z = side * 0.14;
    shoulder.add(capTop);
    const capLip = part(roundedBox(0.2, 0.05, 0.225, 0.02, 2), armourDark, wear(0.65, 49));
    capLip.position.set(0, -0.1, -0.008);
    shoulder.add(capLip);
    const capFlash = part(roundedBox(0.032, 0.05, 0.1, 0.014, 2), orangeTrim, wear(0.75, 25, 7));
    capFlash.position.set(side * 0.1, 0.06, 0.055);
    shoulder.add(capFlash);

    /* A thick cylindrical upper arm, capped so it does not end in a flat disc. */
    const upperMesh = part(
      new THREE.CylinderGeometry(UPPER_R, UPPER_R * 1.035, UPPER_ARM - 0.02, 24, 1),
      armour,
      wear(0.6, 26),
    );
    upperMesh.position.y = -UPPER_ARM / 2 + 0.03;
    upper.add(upperMesh);
    const upperCap = part(ellipsoid(UPPER_R - 0.004, 0.05, UPPER_R - 0.004, 20, 10), armour, wear(0.55, 50));
    upperCap.position.y = 0.01;
    upper.add(upperCap);

    /*
     * THE RING JOINT, with the lens disc the demo carries on the outside of it.
     *
     * The first cut of this was a fat torus round the elbow with a second torus
     * stood on edge beside it, and from three-quarters the pair read as a
     * carabiner clipped to a handlebar — two rings and daylight through both.
     * A short collar with a solid lens cup let into its outer face says
     * "articulated joint" instead, which is what the demo's says.
     */
    const elbowCollar = part(
      new THREE.CylinderGeometry(UPPER_R + 0.014, UPPER_R + 0.014, 0.062, 26, 1),
      armourDark,
      wear(0.5, 27),
    );
    fore.add(elbowCollar);
    const lensAt = new THREE.Object3D();
    lensAt.position.set(side * (UPPER_R + 0.004), 0, 0);
    lensAt.rotation.z = -side * (Math.PI / 2);
    fore.add(lensAt);
    const lensCup = part(new THREE.CylinderGeometry(0.046, 0.05, 0.022, 24), steel, wear(0.4, 51));
    lensCup.position.y = 0.011;
    lensAt.add(lensCup);
    const lensGlass = part(puck(0.036, 0.02, 24), glass);
    lensGlass.position.y = 0.015;
    lensAt.add(lensGlass);
    const lensHub = part(puck(0.013, 0.016, 12), steel, wear(0.4, 52));
    lensHub.position.y = 0.013;
    lensAt.add(lensHub);

    const foreMesh = part(
      new THREE.CylinderGeometry(FORE_R, FORE_R * 1.04, FOREARM + 0.04, 22, 1),
      armour,
      wear(0.62, 28),
    );
    foreMesh.position.y = -FOREARM / 2 + 0.025;
    fore.add(foreMesh);
    const cuff = part(new THREE.CylinderGeometry(FORE_R * 1.1, FORE_R * 1.06, 0.035, 22), armourDark, wear(0.6, 53));
    cuff.position.y = -FOREARM + 0.018;
    fore.add(cuff);

    /*
     * A WORK GLOVE, NOT A CLAW.
     *
     * A blocky grey hand with four stubby segmented fingers in a row and a
     * thumb block — the demo's hand, and the one part of Biggy that has to look
     * like it could pick up a flight case. The old four-pronged claw with cone
     * tips read as a bird's foot at play scale.
     */
    const palm = part(roundedBox(0.15, 0.1, 0.15, 0.028, 3), gloveMat, darkWear(0.35, 29));
    palm.position.y = -0.045;
    hand.add(palm);
    const knuckle = part(roundedBox(0.155, 0.036, 0.158, 0.015, 2), armourDark, darkWear(0.4, 54));
    knuckle.position.y = -0.092;
    hand.add(knuckle);
    for (let i = 0; i < 4; i++) {
      const fz = -0.0495 + i * 0.033;
      const finger = new THREE.Object3D();
      finger.position.set(0, -0.108, fz);
      finger.rotation.x = 0.08 * (i - 1.5);
      hand.add(finger);
      bones[`finger${L}${i}`] = finger;
      const seg1 = part(roundedBox(0.105, 0.05, 0.0295, 0.012, 2), gloveMat, darkWear(0.3, 30));
      seg1.position.y = -0.026;
      finger.add(seg1);
      const seg2 = part(roundedBox(0.095, 0.045, 0.028, 0.013, 2), gloveMat, darkWear(0.3, 55));
      seg2.position.y = -0.07;
      finger.add(seg2);
    }
    const thumb = new THREE.Object3D();
    thumb.position.set(-side * 0.078, -0.07, 0.03);
    thumb.rotation.set(0.15, 0, side * 0.85);
    hand.add(thumb);
    const thumbSeg = part(roundedBox(0.05, 0.075, 0.05, 0.018, 2), gloveMat, darkWear(0.3, 31));
    thumbSeg.position.y = -0.036;
    thumb.add(thumbSeg);

    // Hung straight down against the belly, with only the smallest splay.
    shoulder.rotation.z = side * 0.025;
    shoulder.rotation.x = -0.035;
  }

  /* ----------------------------------------------------------------- legs */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const hip = joint(bones, pelvis, `hip${L}`, side * 0.19, 0, 0);
    const thigh = joint(bones, hip, `thigh${L}`, 0, 0, 0);
    const shin = joint(bones, thigh, `shin${L}`, 0, -THIGH, 0);
    const foot = joint(bones, shin, `foot${L}`, 0, -SHIN, 0);

    /*
     * Everything above the yoke's flat underside at y = 0.233 is hidden inside
     * it, so the thigh and the knee only have to exist, not to be pretty. What
     * shows is the short tapered cone below, and the boot.
     */
    const hipBall = part(ellipsoid(0.105, 0.1, 0.105, 16, 12), armourDark, wear(0.55, 32));
    hip.add(hipBall);
    const thighMesh = part(new THREE.CylinderGeometry(0.108, 0.118, THIGH, 18, 1), armourDark, wear(0.6, 33));
    thighMesh.position.y = -THIGH / 2;
    thigh.add(thighMesh);
    const kneeBall = part(ellipsoid(0.1, 0.092, 0.1, 16, 10), armourDark, wear(0.4, 34));
    shin.add(kneeBall);

    /*
     * THE SAWTOOTH, AND WHERE IT CAME FROM.
     *
     * The left knee carried a row of triangular notches, invisible at the
     * shipped 34-degree portrait angle and obvious in a level front elevation.
     * It was not shading: it was the 36-segment skirt cone and the 20-segment
     * shin cylinder crossing each other a couple of degrees off tangent, so the
     * intersection curve wandered in and out between two coarse tessellations
     * and z-fighting drew the difference. Nothing about that is fixable by
     * nudging a radius — the two surfaces have to stop grazing. They do now:
     * the shin is a cone of revolution that passes through the yoke's FLAT
     * underside at very nearly a right angle, and no other surface comes near it.
     */
    const shinMesh = part(new THREE.CylinderGeometry(0.118, 0.096, SHIN + 0.06, 22, 1), armour, wear(0.6, 35));
    shinMesh.position.y = -SHIN / 2 + 0.03;
    shin.add(shinMesh);
    /*
     * Ribbed bellows on the ankle, where the sheet has them. Each ring's major
     * radius is the CONE'S OWN radius at that height plus 4 mm, so the tube
     * crosses the leg's surface square-on instead of skimming along it.
     */
    const coneR = (y: number): number => 0.096 + ((y - 0.13) / 0.2) * 0.022;
    for (let i = 0; i < 3; i++) {
      const ry = 0.205 - i * 0.025;
      const ring = part(new THREE.TorusGeometry(coneR(ry) + 0.004, 0.014, 7, 22), rubber);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry - KNEE_Y;
      shin.add(ring);
    }

    /*
     * WIDE MOULDED BOOTS WITH A SPLAYED SOLE.
     *
     * The demo's boots are mid-grey mouldings with a rounded, oversized sole
     * that spreads past the upper on every side — the visual reason a heavy
     * robot looks planted. Ours were dark blocks standing on a flat tray. The
     * sole's underside is exactly y = 0, which the "stands on the floor" test
     * measures to a centimetre.
     */
    const ankleCuff = part(new THREE.CylinderGeometry(0.104, 0.118, 0.045, 22), bootMat, wear(0.5, 37));
    ankleCuff.position.y = 0.012;
    foot.add(ankleCuff);
    const bootBody = part(roundedBox(0.255, 0.115, 0.29, 0.055, 4), bootMat, wear(0.55, 38));
    bootBody.position.set(0, -0.045, 0.022);
    foot.add(bootBody);
    const bootToe = part(roundedBox(0.225, 0.075, 0.115, 0.035, 3), bootMat, wear(0.6, 56));
    bootToe.position.set(0, -0.075, 0.135);
    foot.add(bootToe);
    const sole = part(roundedBox(0.3, 0.05, 0.355, 0.024, 3), soleMat, wear(0.5, 39));
    sole.position.set(0, -0.105, 0.025);
    foot.add(sole);
    boltRing(foot, steel, {
      count: 4,
      radius: 0.1,
      y: 0.028,
      boltRadius: 0.011,
      boltHeight: 0.009,
      phase: 0.5,
    });
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
  ctx.fillStyle = 'rgba(232,225,209,0.9)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.17;
  ctx.strokeStyle = 'rgba(232,225,209,0.9)';
  for (const sx of [-0.27, 0.27]) {
    ctx.beginPath();
    ctx.moveTo(sx, -0.34);
    ctx.lineTo(sx, -0.06);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-0.33, 0.33);
  ctx.lineTo(0.33, 0.33);
  ctx.stroke();
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
