/**
 * rig.ts — the skeleton contract and the shared workshop the three robot
 * builders are made from.
 *
 * Everything here is pure geometry and material maths: no WebGL context is ever
 * touched, so `tests/robots.smoke.test.ts` can build all three robots headless in
 * node and measure them against the model sheets in `robots/*.png`.
 *
 * Conventions (the whole renderer depends on these):
 *  - **+Y is up, the sole of the foot sits exactly on y = 0**, so a rig can be
 *    dropped on the floor with `root.position.y = 0`.
 *  - **The robot faces +Z.** With +Y up that puts the model's own LEFT on +X
 *    (right = forward x up = -X), which is why every `...L` bone has x > 0.
 *  - Distances are **metres**. The sim works in prototype pixels; only the
 *    renderer converts, with `PX_PER_M` from `src/sim/units.ts`.
 *  - Bones are bare `Object3D`s with no geometry of their own. Meshes hang off
 *    them. `gait.ts` writes bone transforms and never touches a mesh, which is
 *    what keeps the animation independent of the modelling.
 *
 * Weathering is done with **vertex colours**, not textures: vitest runs in node
 * where there is no canvas to bake a texture on, and the brief forbids external
 * asset files anyway. Every material therefore has `vertexColors: true` and every
 * geometry gets a colour attribute — always build meshes through `part()`.
 */

import * as THREE from 'three';
import type { RobotKind } from '../../sim/types';

/* ------------------------------------------------------------------- maths */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const d = edge1 - edge0;
  const t = clamp(d === 0 ? 0 : (x - edge0) / d, 0, 1);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------- bones */

/**
 * The bones every rig must expose. `gait.ts` drives these by name, so a builder
 * that forgets one fails loudly at construction instead of silently animating
 * half a robot.
 */
export const BONE_NAMES = [
  'root',
  'pelvis',
  'torso',
  'neck',
  'head',
  'shoulderL',
  'shoulderR',
  'upperArmL',
  'upperArmR',
  'forearmL',
  'forearmR',
  'handL',
  'handR',
  'hipL',
  'hipR',
  'thighL',
  'thighR',
  'shinL',
  'shinR',
  'footL',
  'footR',
] as const;

export type BoneName = (typeof BONE_NAMES)[number];

/**
 * A built robot. `gait.ts` animates it, the chapter renderer parents `root` into
 * the scene and moves it from the sim snapshot.
 */
export interface RobotRig {
  /** Which species this is — `gait.ts` picks its character profile from it. */
  readonly kind: RobotKind;
  /** Parent this into the scene. Its origin is the point between the feet, on the floor. */
  readonly root: THREE.Group;
  /** Every bone in `BONE_NAMES`, plus a few per-robot extras (`antenna`, `ear*`). */
  readonly bones: Record<string, THREE.Object3D>;
  /**
   * Named shell meshes. Not part of the skeleton: these exist so the appearance
   * checks can measure "is the head wider than the torso" and so effects code can
   * swap a material without walking the tree.
   */
  readonly parts: Record<string, THREE.Object3D>;
  /** Metres, sole to the top of the head. Matches `ROBOT_HEIGHT_M`. */
  readonly height: number;
  /** Emissive materials (eyes, visor strips, ports) for the bloom/light pass. */
  readonly glow: THREE.MeshStandardMaterial[];
  /** Where this robot's lamp emits from. Its local +Z is the beam direction. */
  readonly lampAnchor: THREE.Object3D;
  dispose(): void;
}

/** Create a bone, register it under `name`, and parent it. */
export function joint(
  bones: Record<string, THREE.Object3D>,
  parent: THREE.Object3D,
  name: string,
  x = 0,
  y = 0,
  z = 0,
): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  bones[name] = o;
  return o;
}

/** Fail at build time rather than animating a rig with a missing joint. */
export function assertBones(kind: RobotKind, bones: Record<string, THREE.Object3D>): void {
  for (const n of BONE_NAMES) {
    if (!bones[n]) throw new Error(`${kind}: rig is missing bone "${n}"`);
  }
}

/* -------------------------------------------------------------- weathering */

const fract = (v: number): number => v - Math.floor(v);

/** Deterministic lattice hash — the classic sin-based one, stable across runs. */
function latticeHash(ix: number, iy: number, iz: number, seed: number): number {
  return fract(Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7 + seed * 57.33) * 43758.5453123);
}

/** Trilinear value noise, 0..1. */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number): number => latticeHash(ix + dx, iy + dy, iz + dz, seed);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), ux);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), ux);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), ux);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
}

/** Three octaves is enough blotching at the scale a diorama camera sees. */
function fbm(x: number, y: number, z: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 3; o++) {
    sum += amp * valueNoise(x * f, y * f, z * f, seed + o * 19);
    f *= 2.13;
    amp *= 0.5;
  }
  return clamp(sum / 0.875, 0, 1);
}

export interface WeatherOpts {
  /** 0 = factory fresh, 1 = twenty years in a cinema basement. */
  amount?: number;
  /** Any integer; the same seed always produces the same scuffs. */
  seed?: number;
  /** Colour the worn patches drift toward: rust, copper, grime. */
  tint?: THREE.ColorRepresentation;
  /** Noise frequency in cycles per metre. Small = broad blotches. */
  scale?: number;
  /** Extra darkening toward the bottom of the part, where dirt settles. */
  grime?: number;
}

const _tint = new THREE.Color();

/** Rec.709 luminance of a linear colour. */
const relLum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * How much brighter than its own panel a worn patch may come out, in linear
 * luminance.
 *
 * `weather()` writes a RATIO against the material's colour, and a rust tint is
 * brighter than graphite: on Droid's darkest panel (`#181b21`, relative
 * luminance 0.0109) the rust `#8c5a32` is 12x brighter, so "wear" arrived as a
 * pale fleck rather than as rust. Two separate things went wrong and both are
 * fixed below.
 *
 * 1. The old code clamped each CHANNEL at 6 independently. Clamping channels
 *    one at a time throws the tint's hue away — the channel that was going to
 *    carry the rust is the one that saturates first — so what came out was a
 *    brightened copy of the base colour, which on a near-black part is a white
 *    flake. Measured before this change: Droid had 11 meshes and 53 vertices
 *    pinned at the 6.0 clamp, Biggy 3 meshes and 18 vertices, Voxxy none.
 * 2. Even short of the clamp the gain was unbounded in practice. Measured
 *    linear-luminance gain of the brightest vertex over its own panel, before:
 *    Droid 82 meshes above 1.05x, of which 28 above 2.5x and 15 at 4x or more;
 *    Biggy 41 above 1.05x, of which 7 above 2.5x (peak 3.33x) even with the
 *    local `darkWear` workaround in `biggy.ts`; Voxxy nothing at all — her wear
 *    only ever lands on orange and white, which is why nobody had seen it.
 *
 * The cap is applied to the RESULT and scales all three channels by the same
 * factor, so the tint keeps its hue exactly and only its brightness is held
 * down. 2.0 is chosen off that census: it is above every mid-tone panel's
 * natural gain (all of those sit under 1.5x and are untouched), and it is the
 * point below which a rusted patch on graphite still reads as rust rather than
 * as a chip of light.
 */
export const MAX_WEAR_LUM_GAIN = 2;

/**
 * Bake wear into a geometry's vertex colours.
 *
 * The colour attribute is a *multiplier* on the material colour, so the same
 * material can be shared by a pristine and a battered part. Ratios are computed
 * from two `THREE.Color`s built the same way, which keeps them in the same
 * (linear) working space.
 */
export function weather(geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, o: WeatherOpts = {}): void {
  const amount = clamp(o.amount ?? 0.5, 0, 1);
  const scale = o.scale ?? 7;
  const seed = o.seed ?? 1;
  const grime = o.grime ?? 0.25;
  _tint.set(o.tint ?? '#8c5a32');
  const base = mat.color;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const y0 = bb ? bb.min.y : 0;
  const y1 = bb ? bb.max.y : 1;
  const col = new Float32Array(pos.count * 3);
  const safe = (v: number): number => (v < 1e-3 ? 1e-3 : v);
  const baseLum = Math.max(1e-6, relLum(base.r, base.g, base.b));
  const lumCeil = baseLum * MAX_WEAR_LUM_GAIN;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = fbm(x * scale, y * scale, z * scale, seed);
    // Worn-through patches: the top of the noise range only, so wear reads as
    // discrete blotches and streaks rather than an even dirty wash.
    const patch = smoothstep(0.54, 0.86, n) * amount;
    // Broad shading variation plus dirt settling low on the part.
    const low = 1 - smoothstep(y0, y1 === y0 ? y0 + 1 : y1, y);
    const shade = 1 - amount * (0.22 * (n - 0.5) * 2 + grime * low * 0.35);
    let r = lerp(base.r, _tint.r, patch) * shade;
    let g = lerp(base.g, _tint.g, patch) * shade;
    let b = lerp(base.b, _tint.b, patch) * shade;
    /*
     * Hold the patch's BRIGHTNESS down without touching its hue. One factor on
     * all three channels: a per-channel clamp is what used to turn rust on a
     * dark panel into a pale fleck (see `MAX_WEAR_LUM_GAIN`). A tint darker than
     * the panel — soot, grime, the usual case on a light part — is never scaled,
     * because its luminance is already under the ceiling.
     */
    const outLum = relLum(r, g, b);
    if (outLum > lumCeil) {
      const k = lumCeil / outLum;
      r *= k;
      g *= k;
      b *= k;
    }
    col[i * 3] = clamp(r / safe(base.r), 0, 6);
    col[i * 3 + 1] = clamp(g / safe(base.g), 0, 6);
    col[i * 3 + 2] = clamp(b / safe(base.b), 0, 6);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Fill a flat white colour attribute so a geometry is safe on a vertexColors material. */
function plainColour(geo: THREE.BufferGeometry): void {
  if (geo.getAttribute('color')) return;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/* -------------------------------------------------------------- materials */

export interface PanelOpts {
  roughness?: number;
  metalness?: number;
  flat?: boolean;
  /** Draw the inside instead of the outside (helmet liners, recessed faces). */
  side?: THREE.Side;
}

/**
 * The one material factory. `weathering` (0..1) shifts a fresh gloss panel toward
 * a rough, dead, scuffed one; pair it with `weather()` on the geometry for the
 * blotches themselves.
 */
export function panelMaterial(
  colour: THREE.ColorRepresentation,
  weathering = 0,
  opts: PanelOpts = {},
): THREE.MeshStandardMaterial {
  const w = clamp(weathering, 0, 1);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colour),
    roughness: opts.roughness ?? clamp(0.22 + 0.62 * w, 0.04, 1),
    metalness: opts.metalness ?? clamp(0.55 - 0.4 * w, 0, 1),
    vertexColors: true,
    flatShading: opts.flat ?? false,
  });
  if (opts.side !== undefined) m.side = opts.side;
  return m;
}

/** An eye, a visor strip, a status port: dark body, bright emissive. */
export function glowMaterial(
  colour: THREE.ColorRepresentation,
  intensity = 1.8,
  body: THREE.ColorRepresentation = '#151212',
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(body),
    emissive: new THREE.Color(colour),
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0,
    vertexColors: true,
    toneMapped: false,
  });
}

/* ------------------------------------------- the presentation light (intro) */

/**
 * THE INTRO'S PRESENTATION LIGHT — a robot readable in a room with no light in it.
 *
 * Michele, having played the opening: *"Robots are still black. In the intro
 * I'll show them fully, even if it's dark. It's their presentation."* He is
 * right and the cause is not a bug: chapter 1's corridor is a blackout, the only
 * lamps in the venue are the robots' own, and those are outside the crate while
 * the robot is still in it. A robot standing in a crate is lit by nothing, so it
 * renders as its own silhouette.
 *
 * ## Why this is not a light
 *
 * The venue's lighting is the sim's visibility polygons (`src/sim/lights.ts`),
 * drawn by `src/render/lighting.ts`. A `THREE.Light` parked in a crate would be
 * a second lighting model that the sim does not know about — and the crates are
 * asserted to contain no light at all (`tests/crates.test.ts`). So this is a
 * DRAWING change and nothing else: it raises each panel material's own emissive
 * and restores it exactly on the way down.
 *
 * ## Why it raises each panel's OWN colour
 *
 * A flat white lift turns three robots into three grey ghosts, and the one thing
 * the beat exists for is that Voxxy is orange, Droid is graphite and Biggy is
 * rusted orange under a blue-grey dome. So the lift is the material's own colour,
 * re-exposed.
 *
 * ## ONE GAIN PER ROBOT, which is what a light actually does
 *
 * The first cut scaled EACH PANEL to a target luminance of its own
 * (`floor + range * sqrt(lum)`). That is tone compression, not lighting, and it
 * had two effects nobody wanted. It squashed each robot's internal contrast —
 * a near-black panel and a mid panel both arrived in the same narrow band — and
 * it exposed a charcoal robot to the same brightness as the pale tan crates he
 * is standing in front of. Michele, on the first build of it: *"Colours are a
 * bit off: Droid and biggy are whitey-grey."* He was right, and the sheet says
 * so: `robots/droid-robot.png` is dark charcoal with warm amber accents, and the
 * lift was taking his main panel from luminance 0.053 to 0.201 — a mid grey.
 *
 * Saturation was never the fault; it was preserved exactly. **Brightness was.** A
 * low-saturation colour made four times brighter reads as grey, which is why
 * Voxxy (saturation 0.99) survived it and Droid (0.47) and Biggy (0.54) did not.
 *
 * So: one scalar per rig, chosen so the robot's MEAN panel luminance reaches
 * `PRESENT_TARGET`, and every panel multiplied by that same scalar. Dark stays
 * dark relative to light, every hue holds, and the robot is simply the robot with
 * a light on it. The gain is never below 1 — a presentation light may not make a
 * robot darker than it is — and never above `PRESENT_MAX_GAIN`, or Droid's
 * near-black recesses would be dragged up into his mid tones and flatten him the
 * other way.
 *
 * ## The trap this deliberately avoids
 *
 * `weather()` writes vertex colours as a RATIO against the material's own colour,
 * which is why a light "wear" tint on a near-black panel came out as white flakes
 * (`docs/playtest-notes.md`, and `MAX_WEAR_LUM_GAIN` above). Nothing here touches
 * a vertex colour, and in three's standard shader `vColor` multiplies the diffuse
 * term only — `totalEmissiveRadiance` is not touched by it. So the lift lands
 * evenly on a weathered part instead of multiplying its blotches, and the flake
 * bug cannot come back through this door.
 *
 * Eyes, visors and status ports are left alone: they are already emissive at
 * `emissiveIntensity` up to 1.8 with `toneMapped: false`, and lifting those is
 * how you get a robot with two white holes in its face. Everything in
 * `rig.glow` is skipped.
 */

/**
 * The mean panel luminance a rig is exposed to at `v = 1`.
 *
 * Measured against the set rather than guessed: the crates stand at
 * `OPEN_CRATE_LIT` and up, and a robot in front of them should read as a LIT
 * OBJECT rather than as another pale box. At 0.14 Droid's charcoal body lands
 * near 0.12 — dark, but plainly lit — against the 0.201 the old per-panel target
 * gave it, which is a mid grey and is what he reported. Voxxy needs no lift at
 * all (his own mean is above this), which is right: he is the orange one.
 */
export const PRESENT_TARGET = 0.14;

/**
 * The most a rig may be scaled by, however dark it is.
 *
 * Without it a very dark rig gets a very large gain, which drags its near-black
 * recesses — panel gaps, shadow lines, the dirt in a weathered seam — up into its
 * mid tones and flattens the robot just as badly as the old formula did, only
 * from the other direction.
 */
export const PRESENT_MAX_GAIN = 4;

/**
 * The luminance a PAINTED panel's average texel is taken to sit at.
 *
 * Biggy's belly and dome are the only two mapped materials on any of the three
 * rigs, and in a browser both carry `color: '#ffffff'` with all of their colour
 * in a canvas texture (`biggy.ts`). Lifting `mat.color` there would paint the
 * whole gut flat white — which is exactly what the first cut of this did, and it
 * is the same mistake `crates.ts` records on its own painted faces: the honest
 * lift goes through the art's own map, so the orange glows orange and the
 * worn-through grey stays grey.
 *
 * So a mapped material lifts its `emissiveMap` instead, by a scalar, and this is
 * the texel luminance that scalar is calibrated against: 0.25 is the belly
 * paint's own orange. It is a reference point, not a measurement of any one
 * pixel — the map's darks come out darker than the target and its whites
 * brighter, which is the whole point of lifting through it.
 */
const MAP_REF_LUM = 0.25;

/**
 * The gain that takes this rig's mean panel luminance to `PRESENT_TARGET`.
 *
 * The mean is over the panels the light actually touches — `rig.glow` and pure
 * blacks are already excluded by the caller — and a mapped panel contributes
 * `MAP_REF_LUM`, since its colour is `#ffffff` and its luminance lives in the
 * texture. Never below 1 and never above `PRESENT_MAX_GAIN`.
 */
function rigGain(lums: readonly number[]): number {
  if (lums.length === 0) return 1;
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  if (mean <= 1e-5) return PRESENT_MAX_GAIN;
  return clamp(PRESENT_TARGET / mean, 1, PRESENT_MAX_GAIN);
}

interface PresentEntry {
  mat: THREE.MeshStandardMaterial;
  /** The emissive the material was built with — restored exactly at `v = 0`. */
  base: THREE.Color;
  /** What is added at `v = 1`. */
  lift: THREE.Color;
}

const PRESENT_KEY = 'presentationLight';

/** Build (once) the list of panel materials this rig presents with. */
function presentEntries(rig: RobotRig): PresentEntry[] {
  const cached = rig.root.userData[PRESENT_KEY] as PresentEntry[] | undefined;
  if (cached) return cached;
  const skip = new Set<THREE.Material>(rig.glow);
  const seen = new Set<THREE.Material>();
  const out: PresentEntry[] = [];
  /** Every panel the light touches, with the luminance the gain is set from. */
  const lit: Array<{ mat: THREE.MeshStandardMaterial; lum: number }> = [];
  rig.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      const mat = raw as THREE.MeshStandardMaterial;
      if (!mat || !mat.isMeshStandardMaterial || skip.has(mat) || seen.has(mat)) continue;
      seen.add(mat);
      const c = mat.color;
      /*
       * A material with no colour of its own has nothing to expose. Voxxy's
       * glass highlights are exactly this — `#000000` with a pale emissive,
       * deliberately kept out of `rig.glow` (`voxxy.ts`: *"The glass highlights.
       * Not a glow"*) — and scaling a black colour by any gain is still black.
       * Skipping them rather than writing black over black keeps `v = 0` an
       * exact restore and keeps the lift monotonic on everything it does touch.
       */
      if (!mat.map && relLum(c.r, c.g, c.b) < 1e-4) continue;
      if (mat.map) {
        /*
         * A painted panel lights itself THROUGH ITS OWN ART. Set once, here:
         * swapping a material's maps per frame recompiles its shader, and this
         * is the one call that has to pay for it.
         */
        if (mat.emissiveMap !== mat.map) {
          mat.emissiveMap = mat.map;
          mat.needsUpdate = true;
        }
        // Its colour is #ffffff and its luminance lives in the texture, so it
        // weighs in at the paint's own reference value.
        lit.push({ mat, lum: MAP_REF_LUM });
        continue;
      }
      lit.push({ mat, lum: Math.max(1e-5, relLum(c.r, c.g, c.b)) });
    }
  });

  /*
   * ONE GAIN FOR THE WHOLE RIG. Every panel is multiplied by the same scalar, so
   * the robot's own tonal range survives the light instead of being compressed
   * into it — see the header. A per-panel target is what turned Droid into a mid
   * grey.
   */
  const gain = rigGain(lit.map((e) => e.lum));
  for (const { mat } of lit) {
    const c = mat.color;
    /*
     * A MAPPED panel is not capped. Its colour is `#ffffff` and its hue lives in
     * the emissive map, so the emissive here is a pure exposure on the art and
     * pushing it past 1 shifts nothing — capping it would just quietly drop the
     * rig's gain on the one panel that carries Biggy's orange.
     *
     * An UNMAPPED panel is capped PROPORTIONALLY, never per channel: dividing
     * each channel by its own excess is what turns a saturated colour white at
     * the top of its range, while scaling the whole triple by one factor keeps
     * the hue exactly and gives up only the brightness there was no room for.
     */
    out.push({
      mat,
      base: mat.emissive.clone(),
      lift: mat.map
        ? new THREE.Color(c.r * gain, c.g * gain, c.b * gain)
        : capped(c.r * gain, c.g * gain, c.b * gain),
    });
  }
  rig.root.userData[PRESENT_KEY] = out;
  return out;
}

/** `(r, g, b)` scaled down as a whole until nothing is over 1. Hue is exact. */
function capped(r: number, g: number, b: number): THREE.Color {
  const mx = Math.max(r, g, b);
  const k = mx > 1 ? 1 / mx : 1;
  return new THREE.Color(r * k, g * k, b * k);
}

/**
 * Light a robot for its presentation. `v` is 0..1: **0 is the robot exactly as
 * built** — every emissive back to the colour its builder set — and 1 is fully
 * readable in a blacked-out corridor.
 *
 *     import { presentationLight } from './robots';
 *     presentationLight(rig, 1);   // for its slot in the opening
 *     presentationLight(rig, 0);   // back to the game's own lighting
 *
 * Idempotent and cheap: the material list is built on the first call and cached
 * on the rig, and after that each call writes one colour per panel material (26
 * to 40 of them, depending on the robot). Safe to call every frame, and safe to
 * call in node — it touches no WebGL object.
 */
export function presentationLight(rig: RobotRig, v: number): void {
  const k = clamp(v, 0, 1);
  for (const e of presentEntries(rig)) {
    if (k <= 0) e.mat.emissive.copy(e.base);
    else e.mat.emissive.setRGB(e.base.r + e.lift.r * k, e.base.g + e.lift.g * k, e.base.b + e.lift.b * k);
  }
}

/* ------------------------------------------------------------------ meshes */

/**
 * The only way a mesh should be made in this folder: it guarantees the colour
 * attribute the shared `vertexColors` materials need.
 */
export function part(
  geo: THREE.BufferGeometry,
  mat: THREE.MeshStandardMaterial,
  wear?: WeatherOpts,
): THREE.Mesh {
  if (wear && (wear.amount ?? 0) > 0) weather(geo, mat, wear);
  else plainColour(geo);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Keep a part out of the measured silhouette (whip antennae, wires). */
export const EXCLUDE_FROM_BOUNDS = 'excludeFromBounds';

export function excludeFromBounds<T extends THREE.Object3D>(o: T): T {
  o.userData[EXCLUDE_FROM_BOUNDS] = true;
  return o;
}

/**
 * A box with rounded edges, built by pushing a segmented box's vertices onto the
 * offset surface of its inner box. Normals are analytic, so the corners shade
 * smoothly without needing a merge pass.
 */
export function roundedBox(w: number, h: number, d: number, radius: number, segments = 3): THREE.BufferGeometry {
  const r = Math.max(0.0001, Math.min(radius, Math.min(w, h, d) / 2 - 1e-4));
  const geo = new THREE.BoxGeometry(w, h, d, segments + 1, segments + 1, segments + 1);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  const hz = d / 2 - r;
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(inner);
    const len = v.length();
    if (len > 1e-6) {
      v.multiplyScalar(r / len);
      nrm.setXYZ(i, v.x / r, v.y / r, v.z / r);
    }
    v.add(inner);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  nrm.needsUpdate = true;
  return geo;
}

/** A sphere scaled into an ellipsoid — heads, bellies, shoulder domes. */
export function ellipsoid(rx: number, ry: number, rz: number, wSeg = 36, hSeg = 24): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  g.scale(rx, ry, rz);
  return g;
}

/**
 * A curved shell patch cut out of an ellipsoid — visors and armour bands that
 * have to hug a head or a belly exactly.
 *
 * `phiHalf` is the half-width in radians around the front (+Z); `thetaStart` and
 * `thetaLength` are measured down from the +Y pole, as in `SphereGeometry`.
 */
export function spherePatch(
  rx: number,
  ry: number,
  rz: number,
  phiHalf: number,
  thetaStart: number,
  thetaLength: number,
  wSeg = 28,
  hSeg = 14,
): THREE.BufferGeometry {
  // SphereGeometry puts phi = PI/2 on +Z, so centre the patch there.
  const g = new THREE.SphereGeometry(1, wSeg, hSeg, Math.PI / 2 - phiHalf, phiHalf * 2, thetaStart, thetaLength);
  g.scale(rx, ry, rz);
  return g;
}

/** A flat disc, axis along +Y. Rotate it to face where you need it. */
export function puck(radius: number, thickness: number, segments = 24): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, thickness, segments);
}

/** Our own spherical parametrisation: theta down from +Y, phi around Y from +Z. */
function onEllipsoid(
  rx: number,
  ry: number,
  rz: number,
  theta: number,
  phi: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  return out.set(rx * Math.sin(theta) * Math.sin(phi), ry * Math.cos(theta), rz * Math.sin(theta) * Math.cos(phi));
}

const _op = new THREE.Vector3();
const _on = new THREE.Vector3();

/**
 * A **rounded-oval patch** of an ellipsoid's surface — Voxxy's inset visor, and
 * any other panel that has to read as a shape set into a curved face rather than
 * as a band wrapped all the way round it.
 *
 * `spherePatch` cuts a rectangle in angle space, so its corners run to the edges
 * of the head and it always reads as a wrap-around visor. This maps the unit disc
 * into angle space instead: the outline is an ellipse in (phi, theta), which on
 * the surface is the sheet's rounded-oval glass panel with shell visible on all
 * four sides of it.
 *
 * `phiMid` aims the patch left or right of the front (+Z); `thetaMid` is measured
 * down from the +Y pole, as in `SphereGeometry`.
 */
export function ovalPatch(
  rx: number,
  ry: number,
  rz: number,
  phiMid: number,
  phiHalf: number,
  thetaMid: number,
  thetaHalf: number,
  rings = 6,
  segs = 36,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const push = (theta: number, phi: number): void => {
    onEllipsoid(rx, ry, rz, theta, phi, _op);
    pos.push(_op.x, _op.y, _op.z);
    _on.set(_op.x / (rx * rx), _op.y / (ry * ry), _op.z / (rz * rz)).normalize();
    nrm.push(_on.x, _on.y, _on.z);
  };
  // Ring 0 is the patch centre, repeated `segs` times so every ring has the same
  // stride and the index maths below stays one loop.
  for (let i = 0; i <= rings; i++) {
    const a = i / rings;
    for (let j = 0; j < segs; j++) {
      const b = (j / segs) * Math.PI * 2;
      push(thetaMid + thetaHalf * a * Math.sin(b), phiMid + phiHalf * a * Math.cos(b));
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % segs;
      const a = i * segs + j;
      const b = i * segs + j2;
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + j2;
      // Wound so the patch faces out of the ellipsoid: j runs clockwise as seen
      // from in front of the patch, so the outward triangle is a -> b -> c.
      if (i > 0) idx.push(a, b, c);
      idx.push(b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export interface RevolvePatchOpts {
  /** How far the patch floats off the surface, metres. Its apparent thickness. */
  out?: number;
  /** Extra bulge at the middle of the patch, metres — a plate that is not flat. */
  dome?: number;
  /** Corner rounding, 0 = a rectangle, 1 = a lozenge. */
  corner?: number;
  /** Fraction of the half-width at the top edge — under 1 gives a trapezoid. */
  taperTop?: number;
  /** Fraction of the half-width at the bottom edge. */
  taperBottom?: number;
  cols?: number;
  rows?: number;
}

/**
 * A rounded-rectangle patch lying on a **surface of revolution** — `ovalPatch`'s
 * sibling for a lathe instead of an ellipsoid.
 *
 * Biggy's belt plate is what this exists for. It was a `roundedBox` laid against
 * the trousers, which was fine while the trousers were a box; once they became a
 * lathe the plate's flat back face stood **70 mm off the shell at the bottom
 * edge** (the sweep takes the block from 0.42 m of radius at the waist to 0.30 m
 * at the hem, and a 0.10 m tall flat plate cannot follow that), which is the
 * "still a flat slab" in Michele's note. A patch generated ON the profile cannot
 * have that failure: every vertex is `radiusAt(y) + out` by construction.
 *
 * `radiusAt` is the lathe's own profile in ITS pre-scale frame, so a caller that
 * squashes the lathe in Z squashes the patch by the same factor afterwards and
 * the two still agree exactly. `phiMid` aims the patch around Y measured from
 * +Z, as everywhere else in this file.
 */
export function revolvePatch(
  radiusAt: (y: number) => number,
  phiMid: number,
  phiHalf: number,
  y0: number,
  y1: number,
  o: RevolvePatchOpts = {},
): THREE.BufferGeometry {
  const out = o.out ?? 0.006;
  const dome = o.dome ?? 0;
  const corner = clamp(o.corner ?? 0.35, 0, 1);
  const tTop = o.taperTop ?? 1;
  const tBot = o.taperBottom ?? 1;
  const cols = Math.max(2, o.cols ?? 16);
  const rows = Math.max(2, o.rows ?? 10);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const v = (j / rows) * 2 - 1;
    const y = lerp(y0, y1, j / rows);
    // The footprint: a trapezoid, with its four corners rounded off. `k` is how
    // far into the corner band this row is, and the circular arc is what makes
    // the corner a radius rather than a chamfer.
    const taper = lerp(tBot, tTop, j / rows);
    const k = corner <= 0 ? 0 : clamp((Math.abs(v) - (1 - corner)) / corner, 0, 1);
    const shrink = 1 - corner * (1 - Math.sqrt(Math.max(0, 1 - k * k)));
    for (let i = 0; i <= cols; i++) {
      const u = (i / cols) * 2 - 1;
      const phi = phiMid + phiHalf * taper * shrink * u;
      const r = radiusAt(y) + out + dome * (1 - u * u) * (1 - v * v);
      pos.push(r * Math.sin(phi), y, r * Math.cos(phi));
    }
  }
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // Wound to face OUT of the lathe. `i` runs with phi, which at the front
      // (phi = 0) is +X, and `j` runs with +Y, so the outward triangle is
      // a -> b -> c: (b - a) x (c - a) = X x Y = +Z. Getting this backwards is
      // silent — `computeVertexNormals` flips with it and back-face culling then
      // throws the patch away, which is exactly how the first cut of Biggy's
      // belt plate shipped invisible.
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A grid of small square dots lying on an ellipsoid's surface, as ONE geometry —
 * the dot-matrix screen behind Voxxy's visor glass.
 *
 * One mesh per dot would be two hundred draw calls for a decoration; this is a
 * few hundred triangles in a single buffer, and the dots curve with the head
 * because they are placed in the same angle space the visor is.
 */
export function dotGrid(
  rx: number,
  ry: number,
  rz: number,
  phiMid: number,
  phiHalf: number,
  thetaMid: number,
  thetaHalf: number,
  cols: number,
  rows: number,
  fill = 0.42,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const dPhi = ((phiHalf * 2) / cols) * fill;
  const dTheta = ((thetaHalf * 2) / rows) * fill;
  for (let r = 0; r < rows; r++) {
    const tv = rows === 1 ? 0 : (r / (rows - 1)) * 2 - 1;
    const theta = thetaMid + thetaHalf * tv;
    for (let c = 0; c < cols; c++) {
      const pv = cols === 1 ? 0 : (c / (cols - 1)) * 2 - 1;
      // Elliptical mask, so the dot field ends where the oval visor does.
      if (pv * pv + tv * tv > 1) continue;
      const phi = phiMid + phiHalf * pv;
      const base = pos.length / 3;
      for (const [st, sp] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        onEllipsoid(rx, ry, rz, theta + st * dTheta, phi + sp * dPhi, _op);
        pos.push(_op.x, _op.y, _op.z);
        _on.set(_op.x / (rx * rx), _op.y / (ry * ry), _op.z / (rz * rz)).normalize();
        nrm.push(_on.x, _on.y, _on.z);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/**
 * A lathe profile through control points `[radius, y]`, smoothed with a spline —
 * this is what gives Voxxy its pear body and Biggy his bellows.
 */
export function latheProfile(points: Array<[number, number]>, samples = 28, segments = 32): THREE.BufferGeometry {
  /*
   * A profile written from the top down is the same shape as one written from
   * the bottom up — but not to `LatheGeometry`, which winds its triangles in the
   * order the points arrive. Given a descending profile it produces a shell that
   * is inside out: back-face culling then throws the surface away and what the
   * camera sees is the inside of the far wall. A convex shape still *looks*
   * roughly right that way, which is how Voxxy's arms shipped with their white
   * bands buried inside them for a whole round. Normalise the order instead of
   * making every caller remember.
   */
  const ordered = points.length > 1 && points[points.length - 1][1] < points[0][1] ? [...points].reverse() : points;
  const curve = new THREE.SplineCurve(ordered.map(([x, y]) => new THREE.Vector2(Math.max(x, 0), y)));
  const pts = curve.getPoints(samples).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
  return new THREE.LatheGeometry(pts, segments);
}

/* -------------------------------------------------------------- hardware */

/** One rivet: a slightly tapered head standing proud of the panel, axis +Y. */
export function bolt(mat: THREE.MeshStandardMaterial, radius = 0.012, height = 0.01): THREE.Mesh {
  const g = new THREE.CylinderGeometry(radius * 0.82, radius, height, 8);
  g.translate(0, height / 2, 0);
  return part(g, mat);
}

export interface BoltRingOpts {
  count: number;
  /** Ring radius in the XZ plane. */
  radius: number;
  y?: number;
  boltRadius?: number;
  boltHeight?: number;
  /** Start angle, radians, measured from +Z. */
  phase?: number;
  /**
   * If given, each rivet is aimed away from this point instead of straight up.
   *
   * This is only right on a SPHERE centred there. On a lathe it is wrong by
   * however far the profile's normal differs from the radius, and it is wrong in
   * a way that shows: Biggy's dome rivet line sits at r = 0.412, y = 0.108, where
   * the helmet's profile runs at dr/dy = -0.56, so its true normal stands 29
   * degrees above horizontal — while `aimFrom = (0, -0.25, 0)` pointed the rivets
   * at **41 degrees**, a 12-degree tilt on every head in a line of eighteen.
   * Prefer `aimSlope`, which is exact for any surface of revolution.
   */
  aimFrom?: THREE.Vector3;
  /**
   * The profile's `dr/dy` at this ring — the exact way to seat rivets on a lathe.
   *
   * A surface of revolution `r(y)` has outward normal `(1, -dr/dy)` in the
   * radius/height plane, so a flank falling away as it rises (a dome: `dr/dy`
   * negative) tilts its rivets UP by `atan(-dr/dy)`, and a cylinder (`0`) stands
   * them straight out. Takes precedence over `aimFrom`.
   */
  aimSlope?: number;
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

/** A ring of rivets around a panel or a crown. */
export function boltRing(parent: THREE.Object3D, mat: THREE.MeshStandardMaterial, o: BoltRingOpts): void {
  const y = o.y ?? 0;
  const phase = o.phase ?? 0;
  for (let i = 0; i < o.count; i++) {
    const a = phase + (i / o.count) * Math.PI * 2;
    const b = bolt(mat, o.boltRadius ?? 0.014, o.boltHeight ?? 0.012);
    b.position.set(Math.sin(a) * o.radius, y, Math.cos(a) * o.radius);
    if (o.aimSlope !== undefined) {
      _dir.set(Math.sin(a), -o.aimSlope, Math.cos(a)).normalize();
      b.quaternion.setFromUnitVectors(_up, _dir);
    } else if (o.aimFrom) {
      _dir.copy(b.position).sub(o.aimFrom).normalize();
      b.quaternion.setFromUnitVectors(_up, _dir);
    }
    parent.add(b);
  }
}

/* ----------------------------------------------------------- measurement */

const _mv = new THREE.Vector3();

/**
 * Exact world-space bounds of a subtree, skipping anything flagged
 * `excludeFromBounds`. `Box3.setFromObject` would fold a whip antenna into the
 * silhouette and cannot skip a subtree, which is why this exists: the appearance
 * checks measure the robot, not its aerial.
 */
export function measureBounds(o: THREE.Object3D, target: THREE.Box3 = new THREE.Box3()): THREE.Box3 {
  target.makeEmpty();
  o.updateWorldMatrix(true, true);
  const walk = (node: THREE.Object3D): void => {
    if (node.userData[EXCLUDE_FROM_BOUNDS] === true) return;
    if (node instanceof THREE.Mesh) {
      const pos = node.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (pos) {
        for (let i = 0; i < pos.count; i++) {
          _mv.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
          target.expandByPoint(_mv);
        }
      }
    }
    for (const c of node.children) walk(c);
  };
  walk(o);
  return target;
}

/* --------------------------------------------------------------- teardown */

/** Free every geometry and material under `root` exactly once. */
export function disposeTree(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geos.add(o.geometry);
      if (Array.isArray(o.material)) for (const m of o.material) mats.add(m);
      else mats.add(o.material);
    }
  });
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  root.removeFromParent();
}
