/**
 * voxxy.ts — Model 01, "the orange companion".
 *
 * Built from `robots/voxxy-robot.png` (appearance) with the organisers' own demo
 * screenshots in `reference/organisers-demo/` as the *craft* bar. Where the two
 * disagree the sheet wins; every ratio below comes from `docs/model-sheet-targets.md`
 * and nowhere else.
 *
 * The read, in order of importance:
 *   1. a huge WIDE ellipsoid head — head_w/head_h 1.48, head_h 0.415 of the total
 *      figure — sitting almost directly on the shoulders on a neck stub;
 *   2. a rounded-corner visor filling that face (0.78 of the head box across,
 *      0.655 down) behind a thin light bezel, near-black glass with two broad
 *      specular streaks, and TWO SOFT AMBER GLOWS on it — see `EYE` below;
 *   3. one smooth pear body with a clean equatorial seam, a small high cub
 *      emblem, a chest button and a belly slot with one green LED beside it;
 *   4. BOWLING-PIN arms — thin at the shoulder, widest at ~78% down where ONE
 *      white cuff band wraps them — ending in a black ball wrist and a three-
 *      digit black gripper, which is what the sheet actually puts there;
 *   5. thin orange legs, a white ankle ring, and little rounded orange boots
 *      with four black toe pads each.
 *
 * ## EYE — why this file authors the eyes as a glow and not as a shape
 *
 * `docs/model-sheet-targets.md` §3c: on the sheet the eyes have **no hard edge
 * anywhere**. Half-peak extent 44x32 px on a 318x177 visor; 10%-of-peak 77x54;
 * 90%-of-peak 28x17. The 10->90 transition takes 0.56 x FWHM per side, where the
 * figure's own silhouette edge falls off in two pixels. Four rounds built a
 * hard-edged lit lozenge and then compared its area against a *thresholded* copy
 * of that glow, and eye area/visor area sweeps 0.004 to 0.081 on threshold alone
 * — so the comparison returned a different answer every round and every round
 * "fixed" it in a different direction.
 *
 * So the eyes here are a generated radial-falloff DataTexture on a curved patch,
 * additively blended: a real glow with the sheet's measured profile, no rim, no
 * silhouette. What is then targeted is the ONE eye number that is threshold-free
 * because a symmetric glow's centre does not move — **centre-to-centre distance
 * / visor width = 0.417** — plus the centre's position (dx 0.207 of visor width,
 * dy 0.498 of visor height, i.e. vertically CENTRED: the sheet, not the demo,
 * which sits them low) and the half-peak size, quoted with its level.
 *
 * Architecture note: nothing in here reads game state, and `src/sim` is never
 * imported except for the frozen height constant.
 */

import * as THREE from 'three';
import { ROBOT_HEIGHT_M } from '../../sim/units';
import {
  assertBones,
  ellipsoid,
  glowMaterial,
  joint,
  latheProfile,
  panelMaterial,
  part,
  puck,
  roundedBox,
  disposeTree,
  type RobotRig,
} from './rig';

/*
 * Vertical layout, metres from the sole, from the sheet's front elevation via
 * `docs/model-sheet-targets.md` §3a and held to ROBOT_HEIGHT_M.voxxy = 1.15:
 *
 *   body_h (neck to sole) / total = 0.585  -> the head's underside sits at 0.673
 *   head_h (ear tips to neck) / total = 0.415
 *   oval_h (ears excluded)    / total = 0.380  -> crown at 1.110, ear tips at 1.15
 *   head_w / head_h = 1.48                 -> head box 0.706 wide
 */
const HIP_Y = 0.185;
const TORSO_Y = 0.3;
const SHOULDER_Y = 0.63;
/** Top of the body shell; the head's underside is 0.014 m above it — a stub. */
const TORSO_TOP = 0.659;
const NECK_Y = 0.665;
/** Underside of the head shell: 0.585 of the figure, per §3a. */
const HEAD_BOTTOM = 0.673;
const HEAD_RY = 0.2185;
const HEAD_Y = HEAD_BOTTOM + HEAD_RY;
const HEAD_RX = 0.33;
const HEAD_RZ = 0.235;
/** Centre of the side ring port. Its outer hardware is the head's widest point. */
const PORT_X = 0.3435;
/** Ear tips are the top of the figure, at ROBOT_HEIGHT_M.voxxy. */
const EAR_X = 0.209;
const EAR_Y = 0.1624;
/** 25 degrees outward, as the sheet and the demo both angle them. */
const EAR_TILT = 0.436;
/** Short and stubby: 0.13 m of leg under a body whose underside is at 0.132. */
const THIGH = 0.062;
const SHIN = 0.068;
/** Arm segments. Shoulder to wrist is 0.57 m = half his height: "very long". */
const UPPER_ARM = 0.3;
const FOREARM = 0.27;
const ARM_LEN = UPPER_ARM + FOREARM;

/* ------------------------------------------------------------------- visor */

/*
 * §3b: visor_w / head_w = 0.803 (plateau 0.78-0.81, tolerance +/-0.04) and
 * visor_h / head_h = 0.655. `tests/robots.smoke.test.ts` caps the width at 0.80
 * of the head BOX (ears, ports and all), so 0.78 is the value that satisfies the
 * sheet's band and the test at once. These half-angles produce it on the head
 * ellipsoid; `pnpm exec vitest` measures the result, it is not asserted by eye.
 */
const VISOR_PHI = 0.9878;
const VISOR_THETA_MID = Math.PI / 2;
const VISOR_THETA = 0.7847;
/** Squircle exponent: the demo's visor is a rounded-corner rectangle, not an oval. */
const VISOR_POWER = 3.1;

/*
 * §3c, on the shell the glow patch sits on (HEAD_R* x EYE_LIFT):
 *   centre-to-centre / visor_w = 0.417  ->  each centre 0.207 of visor_w out
 *   centre dy from visor top / visor_h  = 0.498  ->  vertically centred
 *
 * WHICH "CENTRE". `tools/sheet-measure/06_voxxy_eyes.py` takes the CENTROID of
 * each thresholded blob, and for a symmetric glow that is its PEAK. It is NOT
 * the centre of the patch's bounding box: `x = rx sin(phi)` is concave, so a
 * patch spanning +/-EYE_PHI_HALF has its bbox centre 5.7% nearer the nose than
 * its peak. Measuring this build's own portrait gave 0.440 where its bbox
 * centres gave 0.418, and the render was the one telling the truth — 0.417 is a
 * peak-to-peak number, so EYE_PHI is solved peak-to-peak:
 *
 *     2 * HEAD_RX * EYE_LIFT * sin(EYE_PHI) = 0.417 * visor_w
 *
 * That ratio is also viewing-angle-proof: peak-to-peak over visor width holds
 * 0.417 from straight on to 45 degrees off, where the bbox version drifts.
 */
const EYE_LIFT = 1.03;
const EYE_PHI = 0.3491;
const EYE_THETA = VISOR_THETA_MID + 0.0006;
/**
 * Angular half-extent of the glow patch — the point at which the falloff has
 * reached 1.8% of peak, NOT an edge. The half-peak extent inside it is
 * `EYE_HALF_PEAK` of this, which puts eye_w/visor_w at 0.138 and eye_h/visor_h
 * at 0.181 **measured at half peak**, matching §3c's 0.138 / 0.181.
 */
const EYE_PHI_HALF = 0.3211;
const EYE_THETA_HALF = 0.3252;

/* ------------------------------------------------------------- generated maps */

/**
 * The eye's falloff, as a generated data texture — no image file, and no canvas,
 * so this is identical in the browser and in node (vitest builds every rig).
 *
 * The profile is fitted to §3c's three measured points. In units of the
 * half-width at half maximum `r`:
 *
 *   sheet: p = 0.90 at r = 0.64,  p = 0.50 at r = 1.00,  p = 0.10 at r = 1.75
 *
 * A plain Gaussian gives 0.76 / 0.50 / 0.12 — too pointed in the core. The sheet
 * has a flat-topped lozenge with a long skirt, so: a plateau out to r = 0.50 and
 * then `exp(-ln2 * u^1.30)` with `u = (r - 0.50) / 0.50`, which reproduces
 * 0.88 / 0.50 / 0.10. p(1) = 0.5 by construction whatever the fit, so the
 * half-peak extents this file targets do not move when the core is retuned.
 * The tail is trimmed by its own value at the patch edge so the quad ends on
 * exactly zero and never shows a boundary.
 */
const EYE_PLATEAU = 0.5;
const EYE_SKIRT = 1.3;
/** Where the profile is at half peak, as a fraction of the patch's half-extent. */
const EYE_HALF_PEAK = 0.385;

function eyeProfile(rho: number): number {
  if (rho >= 1) return 0;
  const r = rho / EYE_HALF_PEAK;
  if (r <= EYE_PLATEAU) return 1;
  const u = (r - EYE_PLATEAU) / (1 - EYE_PLATEAU);
  return Math.exp(-Math.LN2 * Math.pow(u, EYE_SKIRT));
}

let _eyeTex: THREE.DataTexture | null = null;

/** Built once and shared: a texture is data, and every Voxxy wants the same one. */
function eyeGlowTexture(): THREE.DataTexture {
  if (_eyeTex) return _eyeTex;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const edge = eyeProfile(0.999);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5;
      const dy = (y + 0.5) / N - 0.5;
      const rho = Math.sqrt(dx * dx + dy * dy) * 2;
      const v = Math.max(0, (eyeProfile(rho) - edge) / (1 - edge));
      const b = Math.round(v * 255);
      const i = (y * N + x) * 4;
      data[i] = b;
      data[i + 1] = b;
      data[i + 2] = b;
      data[i + 3] = b;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  _eyeTex = t;
  return t;
}

let _streakTex: THREE.DataTexture | null = null;

/**
 * A broad soft specular streak for the glass. The demo's visor carries two or
 * three of these and nothing else; they are what stops a black panel reading as
 * a hole. Soft on both axes so the quad's own edges never show.
 */
function streakTexture(): THREE.DataTexture {
  if (_streakTex) return _streakTex;
  const W = 64;
  const H = 32;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const ty = ((y + 0.5) / H - 0.5) * 2;
    const across = Math.exp(-3.2 * ty * ty);
    for (let x = 0; x < W; x++) {
      const tx = ((x + 0.5) / W - 0.5) * 2;
      // Fades in from one end and out at the other: a streak, not a bar.
      const along = Math.max(0, 1 - tx * tx) ** 1.4;
      const v = Math.round(across * along * 255);
      const i = (y * W + x) * 4;
      // All four channels carry the profile: `alphaMap` samples green, and
      // keeping the rest equal means the map reads the same however it is used.
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = v;
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  _streakTex = t;
  return t;
}

/* --------------------------------------------------------------- materials */

interface GlossOpts {
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

/**
 * Injection-moulded plastic with a clearcoat — the finish the organisers' demo
 * has and our previous rounds did not. A rough-ish diffuse base carries the
 * broad soft sheen; the coat on top of it carries the tight highlight. Doing it
 * with one `MeshStandardMaterial` gives you one or the other, which is most of
 * why the old model read as cheap even where the shapes were right.
 *
 * `MeshPhysicalMaterial` extends `MeshStandardMaterial`, so this stays a drop-in
 * for `part()` and for `RobotRig.glow`, and `vertexColors` is kept on for the
 * shared colour attribute every geometry in this folder carries.
 */
function glossMaterial(colour: THREE.ColorRepresentation, o: GlossOpts = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colour),
    roughness: o.roughness ?? 0.34,
    metalness: o.metalness ?? 0.0,
    clearcoat: o.clearcoat ?? 1.0,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.1,
    vertexColors: true,
  });
}

/* ------------------------------------------------------------------ patches */

const _pv = new THREE.Vector3();
const _pn = new THREE.Vector3();

function onEllipsoid(rx: number, ry: number, rz: number, theta: number, phi: number, out: THREE.Vector3): void {
  out.set(rx * Math.sin(theta) * Math.sin(phi), ry * Math.cos(theta), rz * Math.sin(theta) * Math.cos(phi));
}

/**
 * A **superellipse** patch of an ellipsoid's surface: `rig.ovalPatch` with a
 * corner exponent. At `power = 2` it is that function's ellipse; at 3.1 it is
 * the demo's rounded-corner rectangle, which is also what the sheet's visor is
 * once you look at the straight run along its top edge.
 */
function squirclePatch(
  rx: number,
  ry: number,
  rz: number,
  phiMid: number,
  phiHalf: number,
  thetaMid: number,
  thetaHalf: number,
  power: number,
  rings = 6,
  segs = 48,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const k = 2 / power;
  const signPow = (v: number): number => Math.sign(v) * Math.pow(Math.abs(v), k);
  const push = (theta: number, phi: number): void => {
    onEllipsoid(rx, ry, rz, theta, phi, _pv);
    pos.push(_pv.x, _pv.y, _pv.z);
    _pn.set(_pv.x / (rx * rx), _pv.y / (ry * ry), _pv.z / (rz * rz)).normalize();
    nrm.push(_pn.x, _pn.y, _pn.z);
  };
  for (let i = 0; i <= rings; i++) {
    const a = i / rings;
    for (let j = 0; j < segs; j++) {
      const b = (j / segs) * Math.PI * 2;
      push(thetaMid + thetaHalf * a * signPow(Math.sin(b)), phiMid + phiHalf * a * signPow(Math.cos(b)));
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % segs;
      const a = i * segs + j;
      const b = i * segs + j2;
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + j2;
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

/**
 * A rectangular grid patch of an ellipsoid's surface **with UVs** — what a
 * generated falloff map needs to live on. `rig.ovalPatch` and `rig.dotGrid`
 * have no texture coordinates, which is exactly why every previous round built
 * the eyes out of stacked solid ovals instead of out of a gradient.
 */
function uvPatch(
  rx: number,
  ry: number,
  rz: number,
  phiMid: number,
  phiHalf: number,
  thetaMid: number,
  thetaHalf: number,
  cols = 14,
  rows = 14,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const tv = (r / rows) * 2 - 1;
    for (let c = 0; c <= cols; c++) {
      const pv = (c / cols) * 2 - 1;
      onEllipsoid(rx, ry, rz, thetaMid + thetaHalf * tv, phiMid + phiHalf * pv, _pv);
      pos.push(_pv.x, _pv.y, _pv.z);
      _pn.set(_pv.x / (rx * rx), _pv.y / (ry * ry), _pv.z / (rz * rz)).normalize();
      nrm.push(_pn.x, _pn.y, _pn.z);
      // theta grows downward, so v is flipped to keep the map the right way up.
      uv.push((pv + 1) / 2, 1 - (tv + 1) / 2);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = a + cols + 1;
      const e = d + 1;
      /*
       * Wound so the patch faces OUT of the ellipsoid. `+c` runs along +phi
       * (toward +x) and `+r` runs along +theta (downward, toward -y), so the
       * obvious `a,b,d` order gives (+x) x (-y) = -z and every one of these
       * patches is back-face culled — which is exactly how the first cut of the
       * glow eyes rendered as a visor with nothing on it at all.
       */
      idx.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A decoration that must not cast a shadow or write depth: glows and streaks. */
function overlay(mesh: THREE.Mesh, order: number): THREE.Mesh {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = order;
  return mesh;
}

/* ---------------------------------------------------------------- arm shape */

/**
 * The arm's radius `d` metres below the shoulder — the whole bowling-pin read.
 *
 * The sheet's arm is a teardrop hanging point-up: a hair over the dark strut at
 * the shoulder, swelling continuously to 0.074 m at 78% of its length, and only
 * then rounding off. The single white cuff band wraps that swell.
 */
function armRadius(d: number): number {
  const pts: Array<[number, number]> = [
    [0.0, 0.0115],
    [0.05, 0.0165],
    [0.1, 0.031],
    [0.16, 0.042],
    [0.22, 0.0515],
    [0.28, 0.0595],
    [0.34, 0.0665],
    [0.4, 0.0718],
    [0.445, 0.074],
    [0.48, 0.0722],
    [0.51, 0.0665],
    [0.535, 0.0555],
    [0.555, 0.036],
    [ARM_LEN, 0.014],
  ];
  if (d <= 0) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (d <= pts[i][0]) {
      const [d0, r0] = pts[i - 1];
      const [d1, r1] = pts[i];
      return r0 + ((r1 - r0) * (d - d0)) / (d1 - d0);
    }
  }
  return pts[pts.length - 1][1];
}

/** A lathe of the arm between two depths, as a profile in the bone's own space. */
function armShell(from: number, to: number, y0: number, swell = 1): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const d = from + ((to - from) * i) / steps;
    pts.push([armRadius(d) * swell, y0 - (d - from)]);
  }
  return latheProfile(pts, 18, 28);
}

export function buildVoxxy(): RobotRig {
  const bones: Record<string, THREE.Object3D> = {};
  const parts: Record<string, THREE.Object3D> = {};
  const glow: THREE.MeshStandardMaterial[] = [];

  const root = new THREE.Group();
  root.name = 'voxxy';
  bones.root = root;

  /* --------------------------------------------------------------- palette */
  /*
   * Sampled off the sheet's front panel: the lit orange runs #ce6c20 at the
   * median to #e2813a in the upper quartile, the side pods #eff0ef, the glass
   * #080604. Voxxy is the new one — nothing here is weathered.
   */
  const shell = glossMaterial('#f2751a', { roughness: 0.33, clearcoatRoughness: 0.09 });
  const shellDeep = glossMaterial('#cf5d0e', { roughness: 0.38, clearcoatRoughness: 0.12 });
  const seamMat = panelMaterial('#8a3c07', 0, { roughness: 0.55, metalness: 0.05 });
  const white = glossMaterial('#f1f3f4', { roughness: 0.3, clearcoatRoughness: 0.08 });
  const bezel = glossMaterial('#b9bfc6', { roughness: 0.28, metalness: 0.25, clearcoatRoughness: 0.1 });
  const dark = glossMaterial('#1d2025', { roughness: 0.45, metalness: 0.2, clearcoatRoughness: 0.18 });
  const visorGlass = glossMaterial('#08090b', { roughness: 0.16, metalness: 0.08, clearcoatRoughness: 0.14 });

  /*
   * THE EYES. One material, one generated falloff map, additive.
   *
   * `color` is black so the lit term contributes nothing and the emissive is all
   * there is; `alphaMap` (three reads its green channel) carries the profile, and
   * additive blending means the result is `emissive * profile` added to whatever
   * is behind — a glow with no edge and no rim, which is the point. `depthWrite`
   * is off and `renderOrder` puts it after the glass it floats 6 mm in front of.
   *
   * Intensity: at 1.35 the core lands near (255, 152, 30) in sRGB against the
   * sheet's measured core of #ea8827. Higher and the green channel clips too and
   * both eyes photograph lemon-yellow, which is what happened two rounds ago.
   */
  const eyeGlowMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color('#ff8418'),
    emissiveIntensity: 1.35,
    alphaMap: eyeGlowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    toneMapped: false,
  });
  const portGlow = glowMaterial('#ff8c22', 1.25, '#1d1208');
  const ledGreen = glowMaterial('#4bf58a', 1.4, '#0d2216');
  glow.push(eyeGlowMat, portGlow, ledGreen);

  /** The glass highlights. Not a glow — it must stay out of `rig.glow`. */
  const streakMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color('#aebccc'),
    emissiveIntensity: 0.34,
    alphaMap: streakTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    toneMapped: false,
  });

  /* ------------------------------------------------------------- skeleton */
  const pelvis = joint(bones, root, 'pelvis', 0, HIP_Y, 0);
  const torso = joint(bones, pelvis, 'torso', 0, TORSO_Y - HIP_Y, 0);
  const neck = joint(bones, torso, 'neck', 0, NECK_Y - TORSO_Y, 0);
  const head = joint(bones, neck, 'head', 0, HEAD_Y - NECK_Y, 0);

  /* ----------------------------------------------------------------- body */
  /*
   * ONE smooth pear. §3e: torso width / head width = 0.537, measured on the
   * central run with the arms excluded — 0.380 m against a 0.706 m head box.
   * The profile is monotone from the neck down to its widest at y = 0.02, so
   * the silhouette cannot break into two stacked lobes.
   */
  const bodyGeo = latheProfile(
    [
      [0.0, -0.168],
      [0.091, -0.158],
      [0.142, -0.135],
      [0.172, -0.095],
      [0.187, -0.04],
      [0.19, 0.02],
      [0.184, 0.088],
      [0.174, 0.155],
      [0.159, 0.221],
      [0.142, 0.274],
      [0.118, 0.315],
      [0.068, 0.344],
      [0.0, TORSO_TOP - TORSO_Y],
    ],
    36,
    40,
  );
  const body = part(bodyGeo, shell);
  torso.add(body);
  parts.torsoShell = body;

  /*
   * The equatorial seam. Both references have it: the demo as a crisp line right
   * round the belly's widest row, the sheet as the panel break under the chest.
   * A torus just inside the shell's own radius reads as a moulding split from
   * every angle and costs 512 triangles.
   */
  const seam = part(new THREE.TorusGeometry(0.1875, 0.0035, 8, 64), seamMat);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = 0.02;
  torso.add(seam);

  /*
   * Shoulder pods: the two orange bumps the sheet grows the arm struts out of.
   * Without them the black shoulder ball hangs in daylight beside the pear,
   * which is how the arms read as bolted on rather than as jointed in.
   */
  for (const sx of [-1, 1]) {
    const pod = part(ellipsoid(0.056, 0.038, 0.048, 20, 14), shell);
    pod.position.set(sx * 0.118, 0.3, 0.004);
    pod.rotation.z = -sx * 0.62;
    torso.add(pod);
  }

  // A thin dark slot low on the belly, with ONE green LED beside it — the demo's
  // single most characterful small detail, and free.
  const vent = part(roundedBox(0.086, 0.011, 0.012, 0.005, 2), dark);
  vent.position.set(0, -0.052, 0.181);
  vent.rotation.x = -0.12;
  torso.add(vent);
  const led = part(roundedBox(0.022, 0.009, 0.008, 0.003, 2), ledGreen);
  led.position.set(-0.055, -0.081, 0.171);
  led.rotation.x = -0.18;
  torso.add(led);

  // The black hemisphere button high on the chest, off to one side.
  const button = part(ellipsoid(0.022, 0.022, 0.014, 18, 12), dark);
  button.position.set(0.062, 0.297, 0.096);
  torso.add(button);

  /*
   * Chest emblem: the sheet's CAT FACE — smaller and higher than the last round
   * put it (0.078 m across at y = 0.24 rather than 0.096 at 0.19), which is what
   * the sheet has and what stops it reading as a fridge magnet.
   *
   * The cheeks and nose are punched out in the body's own ORANGE, which is what
   * makes it read as a moulded glyph rather than as a sticker.
   */
  const emblem = new THREE.Object3D();
  emblem.position.set(0, 0.24, 0.1425);
  emblem.rotation.x = -0.16;
  torso.add(emblem);
  const catHead = part(ellipsoid(0.039, 0.036, 0.011, 24, 16), white);
  emblem.add(catHead);
  for (const sx of [-1, 1]) {
    const ear = part(ellipsoid(0.013, 0.013, 0.009, 14, 10), white);
    ear.position.set(sx * 0.026, 0.025, -0.001);
    emblem.add(ear);
    const eye = part(ellipsoid(0.004, 0.004, 0.006, 12, 8), dark);
    eye.position.set(sx * 0.0145, 0.007, 0.008);
    emblem.add(eye);
    const cheek = part(ellipsoid(0.0095, 0.0065, 0.006, 16, 10), shell);
    cheek.position.set(sx * 0.017, -0.0075, 0.009);
    emblem.add(cheek);
  }
  const nose = part(new THREE.ConeGeometry(0.0065, 0.0095, 3), shell);
  nose.position.set(0, -0.015, 0.009);
  nose.rotation.set(Math.PI / 2, 0, Math.PI);
  emblem.add(nose);

  /*
   * Neck: a stub, not a stalk. The sheet gives Voxxy 18 px against a 395 px head
   * — 4.6% — and `tests/robots.smoke.test.ts` fails anything over 4% of the head
   * shell's width. The visible gap here is 0.014 m on a 0.66 m shell: 2.1%.
   */
  const neckMesh = part(new THREE.CylinderGeometry(0.05, 0.062, 0.05, 20), dark);
  neck.add(neckMesh);

  /* ----------------------------------------------------------------- head */
  const headShell = part(ellipsoid(HEAD_RX, HEAD_RY, HEAD_RZ, 52, 34), shell);
  head.add(headShell);
  parts.headShell = headShell;

  /*
   * THE VISOR: a rounded-corner rectangle of near-black glass inside a thin
   * light bezel — the demo's construction, and the sheet's shape once you notice
   * how straight the run along the top of its "oval" actually is.
   *
   * The dot-matrix field the previous rounds printed across the whole panel is
   * GONE. At play scale it was a field of orange speckle that read as noise and
   * flattened the glass; §3c's screen texture lives inside the eyes' own core,
   * not across the face.
   */
  const bezelPatch = part(
    squirclePatch(
      HEAD_RX * 1.008,
      HEAD_RY * 1.012,
      HEAD_RZ * 1.008,
      0,
      VISOR_PHI + 0.036,
      VISOR_THETA_MID,
      VISOR_THETA + 0.05,
      VISOR_POWER,
      3,
      48,
    ),
    bezel,
  );
  head.add(bezelPatch);

  const visor = part(
    squirclePatch(
      HEAD_RX * 1.012,
      HEAD_RY * 1.02,
      HEAD_RZ * 1.012,
      0,
      VISOR_PHI,
      VISOR_THETA_MID,
      VISOR_THETA,
      VISOR_POWER,
      6,
      48,
    ),
    visorGlass,
  );
  head.add(visor);
  parts.visor = visor;

  /*
   * TWO SOFT AMBER GLOWS — see the EYE note at the top of the file.
   *
   * Each is one curved patch carrying the generated falloff map. The patch's own
   * angular extents do the anisotropy: phi runs 0.300 m/rad across the head at
   * this azimuth and theta runs 0.223 m/rad down it, so an isotropic profile in
   * UV lands on the sheet's 1.35 eye aspect without the texture knowing anything
   * about it.
   */
  for (const sx of [-1, 1]) {
    const eye = part(
      uvPatch(
        HEAD_RX * EYE_LIFT,
        HEAD_RY * (1 + (EYE_LIFT - 1) * 1.4),
        HEAD_RZ * EYE_LIFT,
        sx * EYE_PHI,
        EYE_PHI_HALF,
        EYE_THETA,
        EYE_THETA_HALF,
        16,
        16,
      ),
      eyeGlowMat,
    );
    head.add(overlay(eye, 3));
  }

  /*
   * Two broad specular streaks across the glass. The demo has two or three and
   * nothing else on its visor; without them a black panel of this size reads as
   * a hole cut in the head rather than as a sheet of glass in front of a screen.
   */
  for (const [phiMid, thetaMid, phiHalf, thetaHalf] of [
    [-0.36, VISOR_THETA_MID - 0.46, 0.62, 0.1],
    [0.3, VISOR_THETA_MID + 0.4, 0.46, 0.06],
  ] as const) {
    const streak = part(
      uvPatch(
        HEAD_RX * 1.018,
        HEAD_RY * 1.026,
        HEAD_RZ * 1.018,
        phiMid,
        phiHalf,
        thetaMid,
        thetaHalf,
        18,
        3,
      ),
      streakMat,
    );
    head.add(overlay(streak, 2));
  }

  /*
   * A complete white/silver ring port on each side of the head — the widest
   * point of the figure's head box, so nothing may wrap across them.
   */
  for (const sx of [-1, 1]) {
    const sideShell = part(
      squirclePatch(
        HEAD_RX * 1.006,
        HEAD_RY * 1.006,
        HEAD_RZ * 1.006,
        (sx * Math.PI) / 2,
        0.44,
        Math.PI / 2,
        0.62,
        2.4,
        4,
        36,
      ),
      white,
    );
    head.add(sideShell);

    const portRoot = new THREE.Object3D();
    portRoot.position.set(sx * (PORT_X - 0.039), 0.004, 0.012);
    head.add(portRoot);
    const cup = part(new THREE.CylinderGeometry(0.08, 0.088, 0.078, 30).rotateZ(Math.PI / 2), white);
    portRoot.add(cup);
    const rim = part(new THREE.TorusGeometry(0.06, 0.011, 10, 30), dark);
    rim.rotation.y = Math.PI / 2;
    rim.position.x = sx * 0.036;
    portRoot.add(rim);
    const iris = part(puck(0.05, 0.01, 26).rotateZ(Math.PI / 2), dark);
    iris.position.x = sx * 0.038;
    portRoot.add(iris);
    const lens = part(new THREE.TorusGeometry(0.036, 0.0095, 10, 28), portGlow);
    lens.rotation.y = Math.PI / 2;
    lens.position.x = sx * 0.041;
    portRoot.add(lens);
    const socket = part(puck(0.023, 0.012, 20).rotateZ(Math.PI / 2), dark);
    socket.position.x = sx * 0.04;
    portRoot.add(socket);
    const pupil = part(roundedBox(0.01, 0.015, 0.015, 0.004, 2), white);
    pupil.position.x = sx * 0.0435;
    portRoot.add(pupil);
  }

  /*
   * EARS: pointed teardrops angled 25 degrees outward, overlapping the crown,
   * each with a small white inner-ear decal.
   *
   * §3d: ear diameter / head_w = 0.185 and ear centre spacing / head_w = 0.593.
   * The rounded blobs with white skull-caps this replaces were the wrong shape,
   * the wrong angle and carried no marking at all — and the ears are the top of
   * the silhouette, so they are the first thing that says "Voxxy" at play scale.
   */
  const earGeoPts: Array<[number, number]> = [
    [0.0, -0.076],
    [0.034, -0.07],
    [0.0555, -0.05],
    [0.0615, -0.025],
    [0.06, 0.005],
    [0.052, 0.035],
    [0.04, 0.06],
    [0.0255, 0.082],
    [0.0115, 0.098],
    [0.0, 0.106],
  ];
  for (const sx of [-1, 1]) {
    const ear = new THREE.Object3D();
    ear.position.set(sx * EAR_X, EAR_Y, -0.014);
    ear.rotation.z = sx * EAR_TILT;
    head.add(ear);
    bones[sx > 0 ? 'earL' : 'earR'] = ear;

    const coneGeo = latheProfile(earGeoPts, 22, 26);
    // Flattened front to back: the sheet's ear is a fin, not a ball.
    coneGeo.scale(1, 1, 0.78);
    ear.add(part(coneGeo, shell));

    /*
     * The white inner-ear decal: the ear's own profile at 60%, pitched forward
     * so its tip clears the shell it sits in. A body of revolution pitched about
     * X has no azimuth to get wrong on either side — the round that yawed one
     * ear's white by `PI + 0.45` swung it round to the back of the head and
     * shipped one white ear and one plain orange one.
     */
    const innerGeo = latheProfile(
      earGeoPts.map(([r, y]) => [r * 0.6, y * 0.62] as [number, number]),
      18,
      22,
    );
    innerGeo.scale(1, 1, 0.8);
    const inner = part(innerGeo, white);
    inner.position.set(0, -0.004, 0.027);
    inner.rotation.x = -0.36;
    ear.add(inner);
  }

  /*
   * A small white crest between the ears. `gait.ts` whips this as Voxxy's
   * antenna; it is kept below the ear tips so the ears, as on the sheet's front
   * elevation, are the top of the figure at exactly ROBOT_HEIGHT_M.voxxy.
   */
  const antenna = joint(bones, head, 'antenna', 0, 0.178, -0.058);
  const crest = part(ellipsoid(0.021, 0.03, 0.038, 16, 12), white);
  crest.position.y = 0.016;
  crest.rotation.x = -0.3;
  antenna.add(crest);

  // The lamp sits behind the visor and fires forward: Voxxy's narrow orange cone.
  const lampAnchor = new THREE.Object3D();
  lampAnchor.name = 'lamp';
  lampAnchor.position.set(0, -0.02, HEAD_RZ + 0.02);
  head.add(lampAnchor);

  /* ----------------------------------------------------------------- arms */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const shoulder = joint(bones, torso, `shoulder${L}`, side * 0.175, SHOULDER_Y - TORSO_Y, 0.015);
    const upper = joint(bones, shoulder, `upperArm${L}`, 0, 0, 0);
    const fore = joint(bones, upper, `forearm${L}`, 0, -UPPER_ARM, 0);
    const hand = joint(bones, fore, `hand${L}`, 0, -FOREARM, 0);

    const cap = part(ellipsoid(0.029, 0.028, 0.029, 16, 12), dark);
    shoulder.add(cap);

    /*
     * The dark strut. On the sheet a segmented black rod runs from the shoulder
     * pod down to where the teardrop begins, and it is visible for the top fifth
     * of the arm — so the arm's own profile starts at 11 mm and lets it show,
     * instead of swallowing it as the previous round's 19 mm shoulder did.
     */
    const strut = part(new THREE.CylinderGeometry(0.0125, 0.0125, 0.105, 12), dark);
    strut.position.set(-side * 0.012, -0.055, 0.004);
    strut.rotation.z = side * 0.1;
    upper.add(strut);
    const strutRing = part(new THREE.TorusGeometry(0.0145, 0.0042, 8, 16), dark);
    strutRing.rotation.x = Math.PI / 2;
    strutRing.position.set(-side * 0.0085, -0.078, 0.003);
    upper.add(strutRing);

    const upperShell = part(armShell(0, UPPER_ARM, 0), shell);
    upper.add(upperShell);
    const foreShell = part(armShell(UPPER_ARM, ARM_LEN, 0), shell);
    fore.add(foreShell);

    /*
     * ONE white cuff band, wrapping the swell — not the stack of white-and-orange
     * stripes this replaces, which is the first thing the project owner named.
     * Both references have exactly one: the sheet wraps the teardrop's widest
     * part, the demo puts a clean single band lower down the same mass.
     */
    const cuff = part(armShell(0.385, 0.495, -(0.385 - UPPER_ARM), 1.042), white);
    fore.add(cuff);

    /*
     * THE HAND. Four rounds of automated checking never flagged it because
     * nobody had written a measurement for hands; the sheet's close-up
     * (`robots/voxxy-robot.png`, front panel, under either arm) shows what is
     * actually there: a black ball wrist under the rounded orange tip, and three
     * stubby segmented digits on their own ball knuckles, splayed forward and
     * down, each ending in a bulbous rounded pad.
     *
     * It is a distinct terminal part with its own silhouette, which the small
     * dark stub it replaces was not.
     */
    const wrist = part(ellipsoid(0.026, 0.021, 0.026, 16, 12), dark);
    hand.add(wrist);

    /*
     * Three digits, splayed 0.66 rad off the wrist's axis so each has daylight
     * round it: a ball knuckle, a slim banded segment and a bulbous pad. The
     * first cut stacked a fat knuckle straight onto a fat pad and photographed
     * as a bunch of black grapes — a digit has to be a good deal longer than it
     * is thick or the gripper has no fingers in it at all.
     *
     * The fan is deliberately NOT symmetric about the arm's own centreline: one
     * digit forward and two back reads as a hand, a radially even tripod reads
     * as a plug. It is therefore mirrored per side (`side * a`) — reusing one
     * list on both arms builds a right hand that is a COPY of the left rather
     * than its reflection, which `tests/robots.smoke.test.ts` catches as "a mesh
     * of shoulderL has no mirror in shoulderR".
     */
    const fingerAngles = [0.3, 2.25, -1.85];
    for (let i = 0; i < fingerAngles.length; i++) {
      const a = side * fingerAngles[i];
      const finger = new THREE.Object3D();
      finger.position.set(Math.sin(a) * 0.017, -0.014, Math.cos(a) * 0.017);
      finger.rotation.set(Math.cos(a) * 0.66, 0, -Math.sin(a) * 0.66);
      hand.add(finger);
      bones[`finger${L}${i}`] = finger;

      const knuckle = part(ellipsoid(0.0145, 0.0145, 0.0145, 12, 8), dark);
      finger.add(knuckle);
      const seg = part(new THREE.CapsuleGeometry(0.0105, 0.04, 4, 10), dark);
      seg.position.y = -0.032;
      finger.add(seg);
      const band = part(new THREE.TorusGeometry(0.0118, 0.0036, 6, 14), dark);
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.03;
      finger.add(band);
      const tip = part(ellipsoid(0.0155, 0.018, 0.016, 14, 10), dark);
      tip.position.set(0, -0.062, 0.004);
      finger.add(tip);
    }

    // Arms hang clear of the body with a distinct outward splay: on the sheet
    // there is daylight between the teardrop arms and the pear all the way down.
    shoulder.rotation.z = side * 0.26;
    shoulder.rotation.x = -0.04;
  }

  /* ----------------------------------------------------------------- legs */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const hip = joint(bones, pelvis, `hip${L}`, side * 0.062, 0, 0);
    const thigh = joint(bones, hip, `thigh${L}`, 0, 0, 0);
    const shin = joint(bones, thigh, `shin${L}`, 0, -THIGH, 0);
    const foot = joint(bones, shin, `foot${L}`, 0, -SHIN, 0);

    /*
     * The leg, the sheet's way round: a dark collar under the belly, a thin
     * ORANGE cone, a white ankle ring, and then a proper little rounded BOOT.
     *
     * Feet are what sell a robot as standing rather than floating, and the nubs
     * this replaces — two dark blobs and a toe cap — did not. Cheap geometry,
     * large gain.
     */
    const collar = part(new THREE.CylinderGeometry(0.036, 0.032, 0.022, 16), dark);
    collar.position.y = -0.006;
    hip.add(collar);

    const thighMesh = part(new THREE.CylinderGeometry(0.03, 0.025, THIGH, 16), shell);
    thighMesh.position.y = -THIGH / 2;
    thigh.add(thighMesh);
    const shinMesh = part(new THREE.CylinderGeometry(0.0245, 0.0205, SHIN, 16), shell);
    shinMesh.position.y = -SHIN / 2;
    shin.add(shinMesh);

    // The white ankle ring — the demo's, and the clearest small landmark on the
    // bottom third of the figure at play scale.
    const ring = part(new THREE.CylinderGeometry(0.024, 0.025, 0.017, 18), white);
    ring.position.y = 0.012;
    foot.add(ring);
    const ankle = part(ellipsoid(0.018, 0.016, 0.018, 14, 10), dark);
    ankle.position.y = -0.003;
    foot.add(ankle);

    // The boot: orange, rounded, sitting flat on y = 0 with its toes forward.
    const boot = part(roundedBox(0.064, 0.044, 0.092, 0.019, 3), shell);
    boot.position.set(0, -0.033, 0.014);
    foot.add(boot);
    const sole = part(roundedBox(0.058, 0.013, 0.086, 0.005, 2), dark);
    sole.position.set(0, -0.0485, 0.014);
    foot.add(sole);
    // A row of four black toe pads across the front of each boot.
    for (const tx of [-0.021, -0.007, 0.007, 0.021]) {
      const pad = part(ellipsoid(0.0063, 0.0085, 0.011, 10, 8), dark);
      pad.position.set(tx, -0.0435, 0.0525);
      foot.add(pad);
    }
    // One deep-orange instep panel, so the boot is not a single flat block.
    const instep = part(roundedBox(0.04, 0.012, 0.03, 0.005, 2), shellDeep);
    instep.position.set(0, -0.0165, 0.042);
    instep.rotation.x = 0.28;
    foot.add(instep);
  }

  assertBones('voxxy', bones);

  return {
    kind: 'voxxy',
    root,
    bones,
    parts,
    height: ROBOT_HEIGHT_M.voxxy,
    glow,
    lampAnchor,
    dispose: () => disposeTree(root),
  };
}
