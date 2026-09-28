/**
 * robots3d.ts — Voxxy, Droid and Biggy in the 3D build.
 *
 * The rigs are the 2.5D build's own (`src/render/robots`), built from the model
 * sheets and animated by the same gait — appearance is decided there and not
 * re-litigated here (GAUNTLET.md Stage 1). What this file changes is surface and
 * light:
 *
 *  - every shell material becomes a `MeshPhysicalMaterial` with a clearcoat
 *    where the sheet shows gloss (Voxxy's orange) and a procedural micro-wear
 *    patch (roughness breakup and hairline scratches in object space), so a
 *    close camera sees a manufactured object rather than a flat colour;
 *  - the emissive eyes and ports are pushed into HDR so the bloom treats them as
 *    lights;
 *  - each robot's lamp becomes a real shadow-casting SpotLight whose beam the
 *    volumetric fog renders: Voxxy's narrow orange cone, Droid's green pool
 *    thrown down from his chest, Biggy's wide blue flood. The sim decides where
 *    the light GOES (its polygons open the clues); this only draws it.
 */

import * as THREE from 'three';

import { flairPhase, hopPhase, worldMoved } from '../sim/bot';
import { riseAt } from '../sim/surface';
import { BIGGY_ROLL_DUR, DEFS, DROID_STRETCH_DUR, JUMP_AIR, JUMP_RISE_M } from '../sim/constants';
import { LEAD, SLOT, STAND_FACE, STEP_DELAY, STEP_TIME } from '../sim/opening';
import type { Bot, GameSnapshot, RobotKind } from '../sim/types';
import { PX_PER_M, ROBOT_HEIGHT_M, m } from '../sim/units';
import { createRobot, updateRobot, type RobotRig } from '../render/robots';
import { WORLD_NOISE_GLSL } from './materials';
import { mergeUnderAnchors } from './merge';

export interface Robot3D {
  kind: RobotKind;
  rig: RobotRig;
  lamp: THREE.SpotLight;
  /**
   * The lamp's spill on the robot itself and the floor round its feet — the 3D
   * reading of the sim's own `SKIRT_RANGE` pool. It is what keeps the robot you
   * are driving readable in a building with the lights out.
   */
  spill: THREE.PointLight;
  /**
   * A camera-facing flare at the lamp, bright only when the lamp points at you.
   * Small and tight: at 1.2 m with a wide halo it covered Biggy's whole face in
   * the intro, where every robot faces the camera (Michele: "when seen from the
   * front, robots have a strange light"), and the soft halo under the intro's
   * depth of field read as a pink disc beside Voxxy.
   */
  glare: THREE.Mesh | null;
  /** How much of the lamp shows in the fog. */
  fog: number;
}

// Beam lamps fall off linearly (decay 1), not with the inverse square: the sim
// lights a clue anywhere inside its cone out to 22-24 m, and a physical lamp
// was invisible past ~5 m, so a clue could be lit with nothing on screen to
// show it (playtest, 24 Sep: "Biggy's light not reaching?"). Tilted only
// down enough that the beam's centre lands on the floor a few metres ahead
// (clues are painted on the floor: "Voxxy light should point on the
// pavement"), while the top of the cone still reaches down the room.
const LAMP: Record<RobotKind, { intensity: number; fog: number; tilt: number; decay: number }> = {
  voxxy: { intensity: 380, fog: 0.2, tilt: 0.25, decay: 1 },
  droid: { intensity: 420, fog: 0.0, tilt: 0, decay: 2 },
  biggy: { intensity: 420, fog: 0.13, tilt: 0.14, decay: 1 },
};

/* --------------------------------------------------------- material upgrade */

const WEAR_GLSL = /* glsl */ `
float scr(vec3 p, float seed){
  // Hairline scratches: thin bands of a rotated noise field.
  float n = wNoise(p * vec3(3., 60., 3.) + seed);
  return smoothstep(.97, 1., n);
}
`;

function upgrade(mat: THREE.MeshStandardMaterial, kind: RobotKind): THREE.MeshPhysicalMaterial {
  const p = new THREE.MeshPhysicalMaterial({
    color: mat.color.clone(),
    roughness: mat.roughness,
    metalness: mat.metalness,
    vertexColors: mat.vertexColors,
    flatShading: mat.flatShading,
    side: mat.side,
    map: mat.map,
    normalMap: mat.normalMap,
    transparent: mat.transparent,
    opacity: mat.opacity,
  });
  const hsl = { h: 0, s: 0, l: 0 };
  p.color.getHSL(hsl);
  const glossy = mat.roughness < 0.45;
  if (kind === 'voxxy' && glossy && hsl.s > 0.4) {
    // Voxxy's shell: glossy orange plastic, lacquered.
    p.clearcoat = 1;
    p.clearcoatRoughness = 0.06;
    p.roughness = Math.max(0.28, p.roughness);
    p.metalness = 0.0;
  } else if (glossy) {
    p.clearcoat = 0.5;
    p.clearcoatRoughness = 0.2;
  }
  if (hsl.l < 0.08 && mat.roughness < 0.2) {
    // Visors: black glass.
    p.clearcoat = 1;
    p.clearcoatRoughness = 0.02;
    p.roughness = 0.05;
  }
  p.envMapIntensity = 1.2;
  const seed = kind === 'voxxy' ? 1.3 : kind === 'droid' ? 7.7 : 4.1;
  p.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObjP;\n${WORLD_NOISE_GLSL}\n${WEAR_GLSL}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         float wN = wFbm(vObjP * 18. + ${seed.toFixed(2)});
         float s1 = scr(vObjP * 4., ${seed.toFixed(2)});
         roughnessFactor = clamp(roughnessFactor + (wN - .5) * .22 + s1 * .25, .02, 1.);`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         diffuseColor.rgb *= .9 + .2 * wFbm(vObjP * 9. + ${seed.toFixed(2)});
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.55), scr(vObjP * 4., ${seed.toFixed(2)}) * .35);`,
      );
  };
  p.customProgramCacheKey = () => `robotwear-${kind}`;
  return p;
}

function upgradeRig(rig: RobotRig): void {
  const glow = new Set<THREE.Material>(rig.glow);
  const cache = new Map<THREE.Material, THREE.Material>();
  rig.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat || Array.isArray(mat)) return;
    if (glow.has(mat)) {
      if (!cache.has(mat)) {
        mat.emissiveIntensity *= 3;
        cache.set(mat, mat);
      }
      mesh.castShadow = false;
      return;
    }
    if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
    let up = cache.get(mat);
    if (!up) {
      up = upgrade(mat, rig.kind);
      cache.set(mat, up);
    }
    mesh.material = up;
  });
}

/* ------------------------------------------------------------------ robots */

export function createRobots(parent: THREE.Object3D, shadowSize: number): Map<RobotKind, Robot3D> {
  const out = new Map<RobotKind, Robot3D>();
  for (const kind of ['voxxy', 'droid', 'biggy'] as RobotKind[]) {
    const rig = createRobot(kind);
    upgradeRig(rig);
    mergeUnderAnchors(rig.root, new Set<THREE.Object3D>([...Object.values(rig.parts), ...Object.values(rig.bones), rig.lampAnchor]));
    parent.add(rig.root);
    const def = DEFS[kind].light;
    const col = new THREE.Color(def.c[0] / 255, def.c[1] / 255, def.c[2] / 255);
    const L = LAMP[kind];
    const range = m(def.range) * (kind === 'droid' ? 1 : 1.1);
    const angle = def.type === 'cone' ? Math.min(1.2, def.ang ?? 0.5) : 1.2;
    const lamp = new THREE.SpotLight(col, L.intensity, kind === 'droid' ? 12 : range, angle, kind === 'voxxy' ? 0.35 : 0.6, L.decay);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(shadowSize, shadowSize);
    lamp.shadow.bias = -0.0006;
    lamp.shadow.normalBias = 0.02;
    lamp.shadow.camera.near = 0.2;
    lamp.shadow.radius = 3;
    parent.add(lamp, lamp.target);
    const spill = new THREE.PointLight(col, kind === 'biggy' ? 9 : 7, 4, 2);
    parent.add(spill);
    let glare: THREE.Mesh | null = null;
    if (kind !== 'droid') {
      const gm = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { colour: { value: col.clone() }, strength: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: /* glsl */ `uniform vec3 colour; uniform float strength; varying vec2 vUv;
          void main(){ vec2 d = vUv - .5; float r = length(d);
            float core = exp(-r * r * 260.); float halo = exp(-r * r * 40.) * .25;
            float star = exp(-abs(d.y) * 140.) * exp(-abs(d.x) * 9.) * .6;
            gl_FragColor = vec4((colour + .6) * (core * 9. + halo * .8 + star * 1.5) * strength, 1.); }`,
      });
      glare = new THREE.Mesh(new THREE.PlaneGeometry(kind === 'biggy' ? 0.5 : 0.35, kind === 'biggy' ? 0.5 : 0.35), gm);
      glare.frustumCulled = false;
      parent.add(glare);
    }
    out.set(kind, { kind, rig, lamp, spill, glare, fog: L.fog });
  }
  return out;
}

const _p = new THREE.Vector3();
let mountLiftM: number | null = null;
/** How far above Biggy's crown Droid's pelvis rides, m. */
const RIDE_CLEAR = 0.1;

function mountLift(droid: RobotRig): number {
  if (mountLiftM !== null) return mountLiftM;
  droid.root.updateMatrixWorld(true);
  const pelvisY = new THREE.Vector3().setFromMatrixPosition(droid.bones.pelvis.matrixWorld).y - droid.root.position.y;
  // Sitting ON the lid, not in it: the 2.5D lift (pelvis 2 cm into the crown)
  // reads from above; at eye level his hips vanished into the dome (Michele,
  // 25 Sep: "droid is still a bit sinking into biggy").
  mountLiftM = ROBOT_HEIGHT_M.biggy - pelvisY + RIDE_CLEAR;
  return mountLiftM;
}

/** Droid's climb on and off Biggy, 0 on the floor .. 1 on top (renderer easing only). */
let climb = 0;
const climbFrom = new THREE.Vector3();
let wasMounted = false;
const CLIMB_TIME = 0.55;

/** A gesture per robot, seconds left: the rig's own `reach` pose. */
const gesture = new Map<RobotKind, number>();
/** What a reach is aimed at, world metres — the lever or the breaker handle. */
const reachAt = new Map<RobotKind, THREE.Vector3>();
/** Length of the 'reach' pose, s (`POSE_DURATION.reach` in gait.ts). */
const REACH = 1.15;
let lastBreakers: number | undefined;
const _sh = new THREE.Vector3();

/**
 * Point a reach at its target (Michele, 28 Sep: "the arm should reach the
 * lever"). The pose raises Droid's right arm up and forward at a fixed angle, so
 * the rest is aiming: the body turns to face the target and the shoulder pitches
 * to its height, eased in and out with the pose.
 */
function aimReach(rig: RobotRig, target: THREE.Vector3, left: number): void {
  const p = 1 - left / REACH;
  const e = THREE.MathUtils.smoothstep(p, 0, 0.3) * (1 - THREE.MathUtils.smoothstep(p, 0.78, 1));
  const root = rig.root;
  const want = Math.atan2(target.x - root.position.x, target.z - root.position.z);
  let d = want - root.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  root.rotation.y += d * e;
  root.updateMatrixWorld(true);
  rig.bones.shoulderR.getWorldPosition(_sh);
  const elev = Math.atan2(target.y - _sh.y, Math.hypot(target.x - _sh.x, target.z - _sh.z));
  const angle = THREE.MathUtils.clamp(Math.PI / 2 + elev, 0.9, 2.9);
  rig.bones.shoulderR.rotation.x += (2.25 - angle) * e;
}
let lastPanel: string | undefined;
let lastPad: string | undefined;

/**
 * The intro's party tricks, as `hopPhase`/`flairPhase` values off the opening's
 * clock: each robot does its own `E` trick the moment it is out of its crate.
 * Voxxy hops twice, Droid stretches, Biggy rolls (Michele: the start animation is
 * "too slow and static... add actions (voxxy exits and jumps...)").
 *
 * Drawn only: the sim's opening places the robots and nothing here moves one.
 * The tricks are the same poses `E` plays, so nothing new is being claimed about
 * what these bodies can do. A trick runs on into the next robot's slot, which
 * keeps the shot busy while the next crate opens.
 */
function openingTrick(kind: RobotKind, t: number): { hop: number; flair: number } {
  const out = LEAD + ['voxxy', 'droid', 'biggy'].indexOf(kind) * SLOT + STEP_DELAY + STEP_TIME;
  const phase = (from: number, dur: number): number => {
    const u = (t - from) / dur;
    return u > 0 && u < 1 ? u : 0;
  };
  if (kind === 'voxxy') return { hop: phase(out + 0.05, JUMP_AIR) || phase(out + 0.05 + JUMP_AIR + 0.2, JUMP_AIR), flair: 0 };
  return { hop: 0, flair: phase(out + 0.1, kind === 'droid' ? DROID_STRETCH_DUR : BIGGY_ROLL_DUR) };
}

/**
 * Droid's glance in the intro: eyes left, eyes right, back — "the thoughtful
 * one" having a look round before he steps out (Michele: "make droid move its
 * eyes sideways"). The beads slide in their sockets and the head follows a
 * little behind, which is what makes it read at the intro's distance. Timed off
 * his own slot; drawn only.
 */
function glance(rig: RobotRig, t: number): void {
  const s = t - (LEAD + SLOT);
  const ss = THREE.MathUtils.smoothstep;
  const g = -ss(s, 0.7, 0.95) + 2 * ss(s, 1.45, 1.75) - ss(s, 2.25, 2.55);
  const eyes = rig.parts.eyes;
  if (eyes) eyes.position.x = g * 0.011;
  const lag = -ss(s, 0.8, 1.1) + 2 * ss(s, 1.55, 1.95) - ss(s, 2.35, 2.7);
  rig.bones.head.rotation.y += lag * 0.2;
}

/**
 * Droid riding, as the 3D chase camera sees him: legs pressed down Biggy's sides.
 *
 * The rig's mounted pose throws the knees wide so that, from the 2.5D diorama's
 * camera above, they clear Biggy's outline at all; from behind at eye level
 * that read as wings. Hand-tuned angles then put the shins INSIDE the ball
 * (Michele: "pressed is fine, but they should not disappear into Biggy's
 * body!"). So the pose is solved against Biggy's real shape — his belly is a
 * 0.6 m sphere at 0.735 m (`src/render/robots/biggy.ts`), his lid a dome on top
 * — once, the first time Droid is up there: the hip roll and shin angle that
 * keep knee and ankle just outside the body, as close to it as they can get.
 */
const BELLY = { cy: 0.735, r: 0.6 };
const LID = { cy: 1.06, r: 0.42 };
/** A limb's own half-thickness plus a hair: how far outside the shell a joint sits. */
const SKIN = 0.07;
let grip: { hip: number; thigh: number; shin: number; shinRoll: number } | null = null;

function outside(p: THREE.Vector3, lift: number): number {
  // Signed clearance from Biggy's body, Droid-root space (Biggy's axis is the y axis).
  const r = Math.hypot(p.x, p.z);
  const dBelly = Math.hypot(r, p.y + lift - BELLY.cy) - BELLY.r;
  const dLid = Math.hypot(r, p.y + lift - LID.cy) - LID.r;
  return Math.min(dBelly, dLid) - SKIN;
}

function solveGrip(rig: RobotRig, lift: number): void {
  const b = rig.bones;
  const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let best = Infinity;
  let pick = { hip: 0.9, thigh: -0.2, shin: 0.4, shinRoll: -0.4 };
  for (let hip = 0.3; hip <= 1.5; hip += 0.06) {
    for (const thigh of [-0.45, -0.3, -0.15, 0]) {
      for (let shinRoll = -1.2; shinRoll <= 0.4; shinRoll += 0.08) {
        for (const shin of [0.15, 0.4, 0.7]) {
          b.hipL.rotation.z = hip;
          b.thighL.rotation.x = thigh;
          b.shinL.rotation.set(shin, 0, shinRoll);
          rig.root.updateMatrixWorld(true);
          b.shinL.getWorldPosition(pts[0]);
          b.footL.getWorldPosition(pts[2]);
          pts[1].copy(pts[0]).add(pts[2]).multiplyScalar(0.5);
          let ok = true;
          let cost = 0;
          for (const q of pts) {
            rig.root.worldToLocal(q);
            const c = outside(q, lift);
            if (c < 0) ok = false;
            cost += Math.abs(c);
          }
          // Prefer the leg hanging down the flank over sticking out sideways.
          cost += 0.15 * Math.abs(pts[2].x);
          if (ok && cost < best) {
            best = cost;
            pick = { hip, thigh, shin, shinRoll };
          }
        }
      }
    }
  }
  grip = pick;
}

function gripBiggy(rig: RobotRig, lift: number): void {
  if (!grip) solveGrip(rig, lift);
  const g = grip!;
  for (const L of ['L', 'R'] as const) {
    const s = L === 'L' ? 1 : -1;
    rig.bones[`hip${L}`].rotation.z = s * g.hip;
    rig.bones[`thigh${L}`].rotation.x = g.thigh;
    rig.bones[`shin${L}`].rotation.set(g.shin, 0, s * g.shinRoll);
    rig.bones[`foot${L}`].rotation.x = 0;
  }
}

/** Place and animate the robots from the snapshot, and aim their lamps. */
export function updateRobots(robots: Map<RobotKind, Robot3D>, snap: GameSnapshot, dt: number, surface?: (x: number, z: number) => number): void {
  const droid = robots.get('droid');
  const bg = snap.bots.find((o) => o.kind === 'biggy');
  // The sim's state changes that a hand makes: Droid throwing the projector
  // panel, a digit going into the keypad. Read off the props, drawn as a reach.
  const panel = snap.props.find((q) => q.kind === 'projector-panel')?.state;
  if (lastPanel !== undefined && panel !== lastPanel && panel === 'done') {
    gesture.set('droid', REACH);
    const pp = snap.props.find((q) => q.kind === 'projector-panel');
    // The lever: left of the panel's centre, 3.35 m up (props3d.ts).
    if (pp) reachAt.set('droid', new THREE.Vector3(m(pp.x + (pp.w ?? 30) / 2) - 0.2, 3.35, m(pp.y)));
  }
  lastPanel = panel;
  // Chapter 2's breakers, one handle at a time.
  const br = snap.props.find((q) => q.kind === 'breaker');
  const up = br?.v;
  if (br && lastBreakers !== undefined && up !== undefined && up > lastBreakers) {
    gesture.set('droid', REACH);
    reachAt.set('droid', new THREE.Vector3(m(br.x + (br.w ?? 26) / 2) + (up - 2) * 0.42, 2.4, m(br.y)));
  }
  lastBreakers = up;
  const pad = snap.props.find((q) => q.kind === 'keypad')?.label;
  const active = snap.bots[snap.active]?.kind;
  if (lastPad !== undefined && pad !== lastPad && active) gesture.set(active, 0.7);
  lastPad = pad;
  for (const [k, v] of gesture) gesture.set(k, v - dt);
  for (const b of snap.bots) {
    const r = robots.get(b.kind);
    if (!r) continue;
    // Voxxy's hop and every robot's party trick (E), off the sim's own clocks —
    // the 2.5D renderer draws them the same way; the 3D one used to ignore
    // both, so E did something in the sim and nothing on screen.
    const trick = snap.opening ? openingTrick(b.kind, snap.opening.t) : null;
    const u = trick ? trick.hop : hopPhase(b);
    const hop = u > 0 ? JUMP_RISE_M * 4 * u * (1 - u) : 0;
    let x = m(b.x);
    let z = m(b.y);
    // Standing on a raised surface the sim publishes (the stair treads): the
    // 2.5D renderer lifts by this, so does 3D. Not the fallen leaf of cinema E's
    // door: that plate is the 2.5D leaf's pose (skidded, skewed, 0.48 m thick),
    // and the 3D leaf falls straight and thin, so the plate lifted robots off it
    // in places and let the leaf "eat the foot" in others (Michele, 28 Sep). The
    // 3D leaf is a surface of its own, through `surface` below.
    const rise = riseAt(b.x, b.y, (snap.plates ?? []).filter((q) => q.kind !== 'jammed-leaf'));
    // Plus any renderer-only surface under them: the crates' floors and their
    // fallen fronts, which the sim does not model as plates, and the fallen door.
    let lift = hop + rise + (surface ? surface(x, z) : 0);
    let mounted = b.mounted;
    if (b.kind === 'droid' && droid) {
      // The sim snaps him on and off Biggy; the climb is eased here. While
      // mounted he sits on Biggy's centre (MOUNT_OFFSET_Y is a 2.5D screen
      // offset: in 3D it pushed his legs into the dome).
      if (b.mounted !== wasMounted) {
        climbFrom.copy(r.rig.root.position);
        wasMounted = b.mounted;
      }
      climb = THREE.MathUtils.clamp(climb + (b.mounted ? dt : -dt) / CLIMB_TIME, 0, 1);
      const top = b.mounted && bg ? new THREE.Vector3(m(bg.x), mountLift(droid.rig), m(bg.y)) : new THREE.Vector3(x, 0, z);
      const e = climb * climb * (3 - 2 * climb);
      const k = b.mounted ? e : 1 - e;
      if (climb > 0 && climb < 1) {
        // Between the two ends: from where he was toward where he is going,
        // over a small arc — a step up, not a teleport.
        // k runs 0 -> 1 from where he was to where he is going, either way.
        const t = k;
        x = THREE.MathUtils.lerp(climbFrom.x, top.x, t);
        z = THREE.MathUtils.lerp(climbFrom.z, top.z, t);
        lift = THREE.MathUtils.lerp(climbFrom.y, top.y, t) + Math.sin(Math.PI * t) * 0.35;
        mounted = b.mounted ? t > 0.6 : t < 0.4;
      } else if (b.mounted && bg) {
        x = top.x;
        z = top.z;
        lift = top.y;
      }
    }
    r.rig.root.position.set(x, lift, z);
    // In the crates the sim turns them south, to the 2.5D diorama's camera; the
    // 3D intro looks at them from the east, so they stood side-on and turned on
    // the step (Michele: "I'd keep them frontal"). Facing east throughout.
    const face = snap.opening ? STAND_FACE : b.face;
    updateRobot(r.rig, { speedMps: Math.hypot(b.vx, b.vy) / PX_PER_M, heading: face, dt, mounted, backward: b.vx * Math.cos(face) + b.vy * Math.sin(face) < -8, laden: b.kind === 'biggy' && snap.bots.some((o) => o.mounted), hop: u, flair: trick ? trick.flair : flairPhase(b), shoved: worldMoved(b) ? 1 : 0, pose: (gesture.get(b.kind) ?? 0) > 0 ? 'reach' : null });
    if (b.kind === 'droid' && snap.opening) glance(r.rig, snap.opening.t);
    const left = gesture.get(b.kind) ?? 0;
    const target = reachAt.get(b.kind);
    if (left > 0 && target) aimReach(r.rig, target, left);
    else if (left <= 0) reachAt.delete(b.kind);
    // Solved at the final riding height, not wherever the climb has got to.
    if (b.kind === 'droid' && mounted) gripBiggy(r.rig, mountLift(r.rig));
    aimLamp(r, b, face);
  }
}

function aimLamp(r: Robot3D, b: Bot, face: number): void {
  r.rig.root.updateMatrixWorld(true);
  r.rig.lampAnchor.getWorldPosition(_p);
  const L = LAMP[r.kind];
  const lamp = r.lamp;
  if (r.kind === 'droid') {
    // The pool: from above the head, straight down. Wider on Biggy's shoulders,
    // as the sim widens it (MOUNT widens Droid's pool x1.6).
    // The source is lifted well clear of his helmet — a lamp 15 cm over his
    // shoulders put 1000+ lux on them and bleached a graphite robot white. From
    // 1.4 m above his head the floor pool keeps the sim's radius and he casts a
    // stage-light shadow at his own feet.
    const top = r.rig.root.position.y + ROBOT_HEIGHT_M.droid + 1.4;
    const rad = m(DEFS.droid.light.range) * (b.mounted ? 1.6 : 1);
    lamp.position.set(_p.x, top, _p.z);
    lamp.target.position.set(_p.x + Math.cos(face) * 0.3, 0, _p.z + Math.sin(face) * 0.3);
    lamp.angle = Math.min(1.35, Math.atan(rad / top));
    lamp.distance = Math.hypot(rad, top) + 1;
  } else {
    lamp.position.copy(_p);
    const dx = Math.cos(face);
    const dz = Math.sin(face);
    lamp.target.position.set(_p.x + dx * 10, _p.y - 10 * Math.tan(L.tilt), _p.z + dz * 10);
  }
  lamp.target.updateMatrixWorld();
  // Spill: just in front of and above the lamp, so it grazes the robot's own
  // front and pools on the floor ahead of its feet.
  r.spill.position.set(_p.x + Math.cos(face) * 1.1, Math.max(0.9, _p.y + 0.5), _p.z + Math.sin(face) * 1.1);
}

const _dir = new THREE.Vector3();
const _toCam = new THREE.Vector3();

/**
 * Turn the lamps down in a lit room. They are tuned for a blackout, and with the
 * hall's own lights up they still threw a 22 m searchlight across the floor
 * (Michele, 28 Sep: "after the lights are back, reduce the robots' light"). The
 * sim's cones are untouched: what a lamp can light is gameplay, how bright it
 * looks is not. Eased over about a second, like the hall's own lights.
 */
export function dimLamps(robots: Map<RobotKind, Robot3D>, level: number, dt: number): void {
  const k = Math.min(1, dt * 1.5);
  for (const r of robots.values()) {
    const base = LAMP[r.kind].intensity;
    r.lamp.intensity += (base * level - r.lamp.intensity) * k;
    const sb = r.kind === 'biggy' ? 9 : 7;
    r.spill.intensity += (sb * level - r.spill.intensity) * k;
  }
}

/** Aim each lamp's flare at the camera and scale it by how squarely the lamp faces it. */
export function updateGlare(robots: Map<RobotKind, Robot3D>, camera: THREE.Camera): void {
  for (const r of robots.values()) {
    const g = r.glare;
    if (!g) continue;
    const lamp = r.lamp;
    _dir.subVectors(lamp.target.position, lamp.position).normalize();
    g.position.copy(lamp.position).addScaledVector(_dir, 0.12);
    _toCam.subVectors(camera.position, g.position);
    const dist = _toCam.length();
    _toCam.divideScalar(dist);
    const facing = Math.max(0, _dir.dot(_toCam));
    (g.material as THREE.ShaderMaterial).uniforms.strength.value = Math.pow(facing, 16) * Math.min(1, dist / 2);
    g.quaternion.copy(camera.quaternion);
  }
}
