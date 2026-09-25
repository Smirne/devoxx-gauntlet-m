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

import { flairPhase, hopPhase } from '../sim/bot';
import { riseAt } from '../sim/surface';
import { DEFS, JUMP_RISE_M } from '../sim/constants';
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
  /** A camera-facing flare at the lamp, bright only when the lamp points at you. */
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
            float core = exp(-r * r * 180.); float halo = exp(-r * r * 18.) * .25;
            float star = exp(-abs(d.y) * 90.) * exp(-abs(d.x) * 5.) * .6;
            gl_FragColor = vec4((colour + .6) * (core * 30. + halo * 3. + star * 6.) * strength, 1.); }`,
      });
      glare = new THREE.Mesh(new THREE.PlaneGeometry(kind === 'biggy' ? 1.2 : 0.8, kind === 'biggy' ? 1.2 : 0.8), gm);
      glare.frustumCulled = false;
      parent.add(glare);
    }
    out.set(kind, { kind, rig, lamp, spill, glare, fog: L.fog });
  }
  return out;
}

const _p = new THREE.Vector3();
let mountLiftM: number | null = null;

function mountLift(droid: RobotRig): number {
  if (mountLiftM !== null) return mountLiftM;
  droid.root.updateMatrixWorld(true);
  const pelvisY = new THREE.Vector3().setFromMatrixPosition(droid.bones.pelvis.matrixWorld).y - droid.root.position.y;
  mountLiftM = ROBOT_HEIGHT_M.biggy - pelvisY - 0.02;
  return mountLiftM;
}

/** Droid's climb on and off Biggy, 0 on the floor .. 1 on top (renderer easing only). */
let climb = 0;
const climbFrom = new THREE.Vector3();
let wasMounted = false;
const CLIMB_TIME = 0.55;

/** A gesture per robot, seconds left: the rig's own `reach` pose. */
const gesture = new Map<RobotKind, number>();
let lastPanel: string | undefined;
let lastPad: string | undefined;

/** Place and animate the robots from the snapshot, and aim their lamps. */
export function updateRobots(robots: Map<RobotKind, Robot3D>, snap: GameSnapshot, dt: number): void {
  const droid = robots.get('droid');
  const bg = snap.bots.find((o) => o.kind === 'biggy');
  // The sim's state changes that a hand makes: Droid throwing the projector
  // panel, a digit going into the keypad. Read off the props, drawn as a reach.
  const panel = snap.props.find((q) => q.kind === 'projector-panel')?.state;
  if (lastPanel !== undefined && panel !== lastPanel && panel === 'done') gesture.set('droid', 1.15);
  lastPanel = panel;
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
    const u = hopPhase(b);
    const hop = u > 0 ? JUMP_RISE_M * 4 * u * (1 - u) : 0;
    let x = m(b.x);
    let z = m(b.y);
    // Standing on a raised surface the sim publishes (the fallen leaf of cinema
    // E's door, the stair treads): the 2.5D renderer lifts by this, so does 3D.
    const rise = riseAt(b.x, b.y, snap.plates ?? []);
    let lift = hop + rise;
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
    updateRobot(r.rig, { speedMps: Math.hypot(b.vx, b.vy) / PX_PER_M, heading: b.face, dt, mounted, hop: u, flair: flairPhase(b), pose: (gesture.get(b.kind) ?? 0) > 0 ? 'reach' : null });
    aimLamp(r, b);
  }
}

function aimLamp(r: Robot3D, b: Bot): void {
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
    lamp.target.position.set(_p.x + Math.cos(b.face) * 0.3, 0, _p.z + Math.sin(b.face) * 0.3);
    lamp.angle = Math.min(1.35, Math.atan(rad / top));
    lamp.distance = Math.hypot(rad, top) + 1;
  } else {
    lamp.position.copy(_p);
    const dx = Math.cos(b.face);
    const dz = Math.sin(b.face);
    lamp.target.position.set(_p.x + dx * 10, _p.y - 10 * Math.tan(L.tilt), _p.z + dz * 10);
  }
  lamp.target.updateMatrixWorld();
  // Spill: just in front of and above the lamp, so it grazes the robot's own
  // front and pools on the floor ahead of its feet.
  r.spill.position.set(_p.x + Math.cos(b.face) * 1.1, Math.max(0.9, _p.y + 0.5), _p.z + Math.sin(b.face) * 1.1);
}

const _dir = new THREE.Vector3();
const _toCam = new THREE.Vector3();

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
    (g.material as THREE.ShaderMaterial).uniforms.strength.value = Math.pow(facing, 6) * Math.min(1, dist / 2);
    g.quaternion.copy(camera.quaternion);
  }
}
