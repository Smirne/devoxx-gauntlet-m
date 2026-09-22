/**
 * gait.ts — procedural locomotion for the three rigs. No keyframes, no clips:
 * everything below is derived from speed, heading and dt.
 *
 * The numbers come from the organisers' own robot demo
 * (`docs/organisers-3d-demo-notes.md`), so our robots sit in the same motion
 * world as theirs: step frequency 2 + 0.55 * speed steps/s, step duration 0.16 s
 * walking and 0.11 s running, foot offset +-0.16 m, body bob ~1.6 cm, lean 0.027
 * rad per m/s, heading turning toward velocity at 11 s^-1.
 *
 * FEET ARE PLANTED. A foot in contact does not slide: its fore/aft position is
 * integrated from the actual stride length (`speed * stance duration`), so its
 * velocity relative to the ground is exactly zero, and the legs are then solved
 * with two-bone IK to reach it. That also means the bob, the lean and the crouch
 * cannot unplant a foot — the IK absorbs them. The one deliberate exception is
 * Biggy's skid: under heavy braking his stance feet slide forward, which is the
 * point of him.
 *
 * Personality is layered on top of the shared model, per robot, in PROFILES:
 * Voxxy patters with big arm swings and a curious head; Droid takes long slow
 * strides with almost no arm swing and leads with his head; Biggy takes short
 * stomps, leans hard into acceleration and skids when he stops.
 */

import * as THREE from 'three';
import type { RobotKind } from '../../sim/types';
import { clamp, smoothstep, type RobotRig } from './rig';

const TAU = Math.PI * 2;

/* ------------------------------------------------- the organisers' numbers */

/** Steps per second at a standstill. */
export const STEP_FREQ_BASE = 2;
/** Extra steps per second per m/s. */
export const STEP_FREQ_PER_MPS = 0.55;
/** Swing-phase duration, seconds. */
export const STEP_DUR_WALK = 0.16;
export const STEP_DUR_RUN = 0.11;
/** The demo's HUD flips to RUNNING here. */
export const RUN_SPEED_MPS = 2;
/** Nominal maximum fore/aft foot excursion from neutral, metres. */
export const FOOT_OFFSET_M = 0.16;
/** Body bob, metres. */
export const BOB_M = 0.016;
/** Forward lean, radians per m/s. */
export const LEAN_RAD_PER_MPS = 0.027;
/** Heading approach rate toward the velocity direction, s^-1. */
export const TURN_RATE = 11;
/** Below this the robot is idling, not walking. */
export const IDLE_SPEED_MPS = 0.05;

/** A gait never runs faster than this, however arcade the sim speed gets. */
const MAX_STEP_FREQ = 6.5;

export type PoseName = 'nope' | 'reach' | 'squeeze';

const POSE_DURATION: Record<PoseName, number> = { nope: 0.6, reach: 1.15, squeeze: 0.95 };

export interface GaitParams {
  /** Ground speed in metres per second. */
  speedMps: number;
  /**
   * Target heading in SIM radians (`Bot.face`): 0 faces +x, and +y is down the
   * screen. `yawFromSimHeading` converts it to the renderer's yaw.
   */
  heading: number;
  /** Seconds since the last update. Clamped internally, as the sim clamps its own. */
  dt: number;
  /** Droid riding Biggy: legs tuck, no stepping. */
  mounted?: boolean;
  /** Set to fire a one-shot pose. Edge triggered: hold it or clear it, either works. */
  pose?: PoseName | null;
}

/**
 * Sim heading -> renderer yaw.
 *
 * Sim space is the prototype canvas: +x right, +y DOWN. The renderer maps sim x
 * to world x and sim y to world z, and the rigs are modelled facing +Z, so a
 * heading of 0 (facing +x) is a yaw of PI/2.
 */
export const yawFromSimHeading = (face: number): number => Math.PI / 2 - face;

/* ------------------------------------------------------------- personality */

interface Profile {
  /** Multiplies the shared step frequency. */
  freq: number;
  /** Max foot excursion, as a multiple of FOOT_OFFSET_M. Droid strides, Biggy stomps. */
  stride: number;
  /** Foot lift at mid-swing, metres. */
  lift: number;
  /** Multiplies BOB_M. */
  bob: number;
  /** Multiplies LEAN_RAD_PER_MPS. */
  lean: number;
  /** Extra lean, radians per m/s^2 — the heavy "lean into it". */
  accelLean: number;
  /** Stance-foot slide under braking, metres per m/s^2. Biggy only, by design. */
  skid: number;
  /** Arm swing amplitude at full speed, radians. */
  armSwing: number;
  /** Extra elbow flex on the forward swing, radians. */
  elbow: number;
  /** Torso/pelvis counter-rotation, radians. */
  twist: number;
  /** Pelvis roll, radians — the weight shift from foot to foot. */
  sway: number;
  /** Head bob, radians. */
  headBob: number;
  /** How much the head points at the heading the body is still turning toward. */
  headLead: number;
  /** Metres the pelvis rides below the straight-leg rest height. */
  crouch: number;
  /** Speed at which swing amplitudes are full, m/s. */
  speedRef: number;
  /** Antenna spring stiffness and damping. */
  antK: number;
  antC: number;
}

const PROFILES: Record<RobotKind, Profile> = {
  // Quick light steps, big arm swing, curious head.
  voxxy: {
    freq: 1.35,
    stride: 0.8,
    lift: 0.055,
    bob: 1.1,
    lean: 0.9,
    accelLean: 0.012,
    skid: 0,
    armSwing: 0.85,
    elbow: 0.5,
    twist: 0.1,
    sway: 0.05,
    headBob: 0.09,
    headLead: 0.75,
    crouch: 0.045,
    speedRef: 2.0,
    antK: 60,
    antC: 4.5,
  },
  // Long, slow, deliberate strides; minimal arm swing; the head leads the turn.
  droid: {
    freq: 0.68,
    stride: 2.1,
    lift: 0.07,
    bob: 0.9,
    lean: 1.0,
    accelLean: 0.02,
    skid: 0.01,
    armSwing: 0.22,
    elbow: 0.18,
    twist: 0.05,
    sway: 0.035,
    headBob: 0.03,
    headLead: 1.0,
    crouch: 0.1,
    speedRef: 1.6,
    antK: 50,
    antC: 5,
  },
  // Short stomps, a heavy lean into acceleration, and a visible skid when stopping.
  biggy: {
    freq: 1.1,
    stride: 0.7,
    lift: 0.035,
    bob: 1.4,
    lean: 1.3,
    accelLean: 0.055,
    skid: 0.055,
    armSwing: 0.18,
    elbow: 0.1,
    twist: 0.03,
    sway: 0.08,
    headBob: 0.02,
    headLead: 0.25,
    crouch: 0.05,
    speedRef: 2.2,
    antK: 26,
    antC: 1.6,
  },
};

/* ------------------------------------------------------------------ state */

interface BoneBase {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
}

interface GaitState {
  base: Map<THREE.Object3D, BoneBase>;
  partScale: Map<THREE.Object3D, THREE.Vector3>;
  /** Ankle rest positions in root space, [left, right]. */
  footRest: [THREE.Vector3, THREE.Vector3];
  thighLen: number;
  shinLen: number;
  /** Hip pivot height in root space with the rig standing in its base pose. */
  hipRestY: number;
  phase: number;
  yaw: number;
  yawInit: boolean;
  /** Radians per second actually turned this frame. */
  turn: number;
  /** Heading error the body has not caught up with yet. */
  headErr: number;
  prevSpeed: number;
  accel: number;
  t: number;
  pose: PoseName | null;
  poseT: number;
  lastPoseReq: PoseName | null;
  antX: number;
  antXV: number;
  antZ: number;
  antZV: number;
  twitchIn: number;
  twitchAmp: number;
  twitchPhase: number;
  rnd: number;
  /** Which feet are in their stance phase right now, [left, right]. */
  contact: [boolean, boolean];
}

const STATES = new WeakMap<RobotRig, GaitState>();

const _hip = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/** Deterministic 0..1 — the idle twitches must replay identically in tests. */
function rand(st: GaitState): number {
  st.rnd = (st.rnd * 1664525 + 1013904223) >>> 0;
  return st.rnd / 4294967296;
}

function capture(rig: RobotRig): GaitState {
  const base = new Map<THREE.Object3D, BoneBase>();
  for (const name of Object.keys(rig.bones)) {
    const b = rig.bones[name];
    if (b === rig.root) continue;
    base.set(b, {
      px: b.position.x,
      py: b.position.y,
      pz: b.position.z,
      rx: b.rotation.x,
      ry: b.rotation.y,
      rz: b.rotation.z,
    });
  }
  const partScale = new Map<THREE.Object3D, THREE.Vector3>();
  for (const name of Object.keys(rig.parts)) {
    const p = rig.parts[name];
    partScale.set(p, p.scale.clone());
  }

  // Rest ankle positions, measured in root space from the pose the builder left
  // the rig in. Doing it by matrix means a builder can pose its base stance
  // however it likes without the gait having to know.
  rig.root.updateMatrixWorld(true);
  _inv.copy(rig.root.matrixWorld).invert();
  const footRest: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  const feet = [rig.bones.footL, rig.bones.footR];
  for (let i = 0; i < 2; i++) {
    footRest[i].setFromMatrixPosition(feet[i].matrixWorld).applyMatrix4(_inv);
  }

  const hipRestY = new THREE.Vector3().setFromMatrixPosition(rig.bones.hipL.matrixWorld).applyMatrix4(_inv).y;

  return {
    base,
    partScale,
    footRest,
    thighLen: rig.bones.shinL.position.length(),
    shinLen: rig.bones.footL.position.length(),
    hipRestY,
    phase: 0,
    yaw: 0,
    yawInit: false,
    turn: 0,
    headErr: 0,
    prevSpeed: 0,
    accel: 0,
    t: 0,
    pose: null,
    poseT: 0,
    lastPoseReq: null,
    antX: 0,
    antXV: 0,
    antZ: 0,
    antZV: 0,
    twitchIn: 2,
    twitchAmp: 0,
    twitchPhase: 0,
    rnd: 0x9e3779b9,
    contact: [true, true],
  };
}

function stateFor(rig: RobotRig): GaitState {
  let st = STATES.get(rig);
  if (!st) {
    st = capture(rig);
    STATES.set(rig, st);
  }
  return st;
}

/** Restore every bone to the pose its builder left it in, ready for this frame. */
function resetPose(st: GaitState): void {
  for (const [bone, b] of st.base) {
    bone.position.set(b.px, b.py, b.pz);
    bone.rotation.set(b.rx, b.ry, b.rz);
  }
  for (const [p, s] of st.partScale) p.scale.copy(s);
}

const wrapPi = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= TAU;
  while (x < -Math.PI) x += TAU;
  return x;
};

/** Fire a named one-shot pose. Restarts it if it is already playing. */
export function triggerPose(rig: RobotRig, name: PoseName): void {
  const st = stateFor(rig);
  st.pose = name;
  st.poseT = 0;
}

/** 0..1 weight of the pose currently playing. */
function poseEnvelope(name: PoseName, k: number): number {
  if (name === 'nope') {
    // A damped rebuff: snap back, wobble, settle.
    return Math.sin(Math.PI * k) * Math.exp(-2.2 * k) * 2.4;
  }
  // Reach and squeeze hold their shape for most of their duration.
  return smoothstep(0, 0.26, k) * (1 - smoothstep(0.72, 1, k));
}

/* -------------------------------------------------------------- two-bone IK */

/**
 * Put the ankle of one leg at `targetZ`/`targetY` (root space, relative to its
 * rest position) by rotating the thigh, shin and foot. Planar: the sagittal
 * plane is where a walk lives, and the pelvis roll is small enough to ignore
 * laterally.
 */
function solveLeg(
  rig: RobotRig,
  st: GaitState,
  side: 0 | 1,
  targetZ: number,
  targetY: number,
  pelvisPitch: number,
  anklePitch: number,
): void {
  const L = side === 0 ? 'L' : 'R';
  const pelvis = rig.bones.pelvis;
  const hip = rig.bones[`hip${L}`];
  const thigh = rig.bones[`thigh${L}`];
  const shin = rig.bones[`shin${L}`];
  const foot = rig.bones[`foot${L}`];

  // Where the hip pivot ended up once the pelvis has bobbed, leaned and swayed.
  _hip.copy(hip.position).applyEuler(pelvis.rotation).add(pelvis.position);

  const rest = st.footRest[side];
  const dz = rest.z + targetZ - _hip.z;
  const dy = _hip.y - (rest.y + targetY);
  const t = st.thighLen;
  const s = st.shinLen;
  const reach = (t + s) * 0.999;
  const d = clamp(Math.hypot(dz, dy), Math.abs(t - s) + 1e-3, reach);
  const a = Math.atan2(dz, dy);
  const alpha = Math.acos(clamp((t * t + d * d - s * s) / (2 * t * d), -1, 1));
  const gamma = Math.acos(clamp((t * t + s * s - d * d) / (2 * t * s), -1, 1));
  const bend = Math.PI - gamma;
  const thighFwd = a + alpha;

  // rotation.x = -forward angle (see rig.ts: +Z is forward, +Y is up).
  thigh.rotation.x = -thighFwd - pelvisPitch;
  shin.rotation.x = bend;
  foot.rotation.x = thighFwd - bend + anklePitch;
}

/* -------------------------------------------------------------- the update */

/**
 * Advance one rig by `dt`. Writes bone transforms and `root.rotation.y` only —
 * never `root.position`, which belongs to whoever is reading the sim snapshot.
 */
export function applyGait(rig: RobotRig, params: GaitParams): void {
  const st = stateFor(rig);
  const p = PROFILES[rig.kind];
  const dt = clamp(params.dt, 0, 0.05);
  st.t += dt;
  resetPose(st);

  const bones = rig.bones;
  const pelvis = bones.pelvis;
  const torso = bones.torso;
  const head = bones.head;
  const scale = rig.height / 1.45;

  /* ------------------------------------------------------------ speed */
  const v = Math.max(0, params.speedMps || 0);
  const accelRaw = dt > 0 ? (v - st.prevSpeed) / dt : 0;
  st.prevSpeed = v;
  st.accel += (accelRaw - st.accel) * (1 - Math.exp(-6 * dt));
  const moving = smoothstep(0.03, 0.35, v);
  const idleAmt = 1 - moving;
  const amp = smoothstep(IDLE_SPEED_MPS, p.speedRef, v);

  /* ---------------------------------------------------------- heading */
  const targetYaw = yawFromSimHeading(params.heading);
  if (!st.yawInit) {
    st.yaw = targetYaw;
    st.yawInit = true;
  }
  const err = wrapPi(targetYaw - st.yaw);
  const k = 1 - Math.exp(-TURN_RATE * dt);
  const turned = err * k;
  st.yaw = wrapPi(st.yaw + turned);
  st.turn = dt > 0 ? turned / dt : 0;
  st.headErr = err - turned;
  rig.root.rotation.y = st.yaw;

  /* ------------------------------------------------------ step cycle */
  // Cycle = two steps. The stance duration is what actually sets the stride, so
  // a foot in contact can travel backward at exactly -speed.
  const running = v > RUN_SPEED_MPS;
  const stepDur = running ? STEP_DUR_RUN : STEP_DUR_WALK;
  const freq = clamp((STEP_FREQ_BASE + STEP_FREQ_PER_MPS * v) * p.freq, 0.3, MAX_STEP_FREQ);

  // How far this robot's leg can actually put a foot in front of its hip, given
  // how high the hip rides. Voxxy's 21 cm legs cannot take Droid's stride, so the
  // nominal +-0.16 m is a ceiling, never a promise.
  const standH = Math.max(0.02, st.hipRestY - p.crouch - st.footRest[0].y);
  const legLen = (st.thighLen + st.shinLen) * 0.98;
  const geoExc = legLen > standH ? Math.sqrt(legLen * legLen - standH * standH) * 0.92 : 0.02;
  const maxExc = Math.min(FOOT_OFFSET_M * p.stride, geoExc);

  let stance = Math.max(2 / freq - stepDur, stepDur * 0.6);
  if ((v * stance) / 2 > maxExc && v > 1e-4) {
    // Over-striding: step faster rather than slide the feet or tear the leg off.
    // This is what makes Voxxy patter and Biggy stomp without either one gliding.
    stance = Math.max((2 * maxExc) / v, stepDur * 0.6);
  }
  // cycle, stance and stride are derived from each other in this order so that
  // (1 - swingFrac) * cycle === stance exactly: that identity is what plants the feet.
  const cycle = stance + stepDur;
  const swingFrac = stepDur / cycle;
  const half = (v * stance) / 2;
  st.phase = (st.phase + dt / cycle) % 1;

  /* ------------------------------------------------------------ pose */
  const req = params.pose ?? null;
  if (req && req !== st.lastPoseReq) {
    st.pose = req;
    st.poseT = 0;
  }
  st.lastPoseReq = req;
  let poseName: PoseName | null = null;
  let e = 0;
  if (st.pose) {
    st.poseT += dt;
    const dur = POSE_DURATION[st.pose];
    if (st.poseT >= dur) st.pose = null;
    else {
      poseName = st.pose;
      e = poseEnvelope(st.pose, st.poseT / dur);
    }
  }

  /* ------------------------------------------- pelvis (before the legs) */
  // Everything that moves the body must happen before the IK, so the IK can
  // absorb it and leave the feet where they were planted.
  const bob = -BOB_M * p.bob * (0.5 - 0.5 * Math.cos(st.phase * TAU * 2)) * moving;
  const lean = LEAN_RAD_PER_MPS * p.lean * v + clamp(st.accel * p.accelLean, -0.32, 0.32);
  pelvis.position.y += bob - p.crouch;
  pelvis.rotation.x += clamp(lean, -0.45, 0.45);
  pelvis.rotation.z += Math.sin(st.phase * TAU) * p.sway * moving;
  pelvis.rotation.y += -Math.sin(st.phase * TAU) * p.twist * moving;

  if (idleAmt > 0.01) applyIdlePelvis(rig, st, idleAmt);
  if (poseName) applyPosePelvis(rig, poseName, e, scale);

  /* ------------------------------------------------------------- legs */
  if (params.mounted) {
    // Riding Biggy: knees up, feet tucked, nothing planted.
    for (const L of ['L', 'R'] as const) {
      bones[`thigh${L}`].rotation.x = -1.05;
      bones[`shin${L}`].rotation.x = 1.55;
      bones[`foot${L}`].rotation.x = 0.35;
      bones[`hip${L}`].rotation.z = L === 'L' ? 0.22 : -0.22;
    }
    st.contact[0] = false;
    st.contact[1] = false;
  } else {
    const lift = p.lift * smoothstep(0.05, 0.45, v) * scale;
    // Braking slide: only Biggy has a skid worth seeing.
    const skid = clamp(-st.accel, 0, 40) * p.skid * 0.01;
    for (const side of [0, 1] as const) {
      const u = (st.phase + side * 0.5) % 1;
      let z: number;
      let y: number;
      let ankle: number;
      st.contact[side] = u < 1 - swingFrac;
      if (u < 1 - swingFrac) {
        // Stance: the foot is on the ground and travels backward at exactly -v.
        const kk = u / (1 - swingFrac);
        z = half - 2 * half * kk + skid * kk;
        y = 0;
        // Heel comes off the floor at the end of the stance.
        ankle = 0.45 * smoothstep(0.72, 1, kk);
      } else {
        // Swing: forward again, with a lift arc.
        const kk = (u - (1 - swingFrac)) / swingFrac;
        const s2 = kk * kk * (3 - 2 * kk);
        z = -half + 2 * half * s2 + skid;
        y = lift * Math.sin(Math.PI * kk);
        ankle = 0.45 * (1 - smoothstep(0, 0.35, kk)) - 0.18 * smoothstep(0.6, 1, kk);
      }
      solveLeg(rig, st, side, z, y, pelvis.rotation.x, ankle);
    }
  }

  /* ------------------------------------------------------------- arms */
  const swing = p.armSwing * amp;
  for (const side of [0, 1] as const) {
    const L = side === 0 ? 'L' : 'R';
    const shoulder = bones[`shoulder${L}`];
    const upper = bones[`upperArm${L}`];
    const fore = bones[`forearm${L}`];
    const u = (st.phase + side * 0.5) % 1;
    // +1 when this side's leg is forward; the arm counter-swings it.
    const fwd = Math.cos(u * TAU);
    upper.rotation.x += swing * fwd;
    fore.rotation.x -= p.elbow * amp * Math.max(0, -fwd) + 0.06 * amp;
    // A little outward flare with speed, and a lag behind the turn.
    shoulder.rotation.z += (side === 0 ? 1 : -1) * 0.06 * amp;
    shoulder.rotation.y += clamp(-st.turn * 0.04, -0.2, 0.2);
  }
  if (params.mounted) {
    for (const L of ['L', 'R'] as const) {
      bones[`upperArm${L}`].rotation.x = -0.75;
      bones[`forearm${L}`].rotation.x = -0.9;
      bones[`shoulder${L}`].rotation.z = (L === 'L' ? 1 : -1) * 0.25;
    }
  }

  /* ------------------------------------------------------ torso + head */
  torso.rotation.y += Math.sin(st.phase * TAU) * p.twist * moving;
  torso.rotation.x += 0.35 * clamp(st.accel * p.accelLean, -0.2, 0.2);
  head.rotation.x += p.headBob * Math.sin(st.phase * TAU * 2) * moving;
  head.rotation.y += clamp(st.headErr * p.headLead, -0.7, 0.7);
  // Banking into a turn: lean the body toward the inside of the corner.
  pelvis.rotation.z += clamp(st.turn * 0.035 * v, -0.18, 0.18);

  if (idleAmt > 0.01) applyIdleUpper(rig, st, idleAmt, dt);
  if (poseName) applyPoseUpper(rig, poseName, e, st);

  /* --------------------------------------------------------- antenna */
  const ant = bones.antenna;
  if (ant) {
    // A damped spring whipped by acceleration and by turning. Biggy's is slack
    // and wobbles for ages; Voxxy's nub is stiff and barely moves.
    const driveX = -clamp(st.accel, -30, 30) * 0.012 - Math.sin(st.t * 2.1) * 0.04 * idleAmt;
    const driveZ = clamp(st.turn, -8, 8) * 0.06 + Math.sin(st.t * 1.5 + 1.1) * 0.03 * idleAmt;
    st.antXV += (-p.antK * st.antX - p.antC * st.antXV + driveX * p.antK) * dt;
    st.antZV += (-p.antK * st.antZ - p.antC * st.antZV + driveZ * p.antK) * dt;
    st.antX = clamp(st.antX + st.antXV * dt, -0.6, 0.6);
    st.antZ = clamp(st.antZ + st.antZV * dt, -0.6, 0.6);
    ant.rotation.x += st.antX;
    ant.rotation.z += st.antZ;
  }
}

/* ------------------------------------------------------------------- idle */

function applyIdlePelvis(rig: RobotRig, st: GaitState, w: number): void {
  const pelvis = rig.bones.pelvis;
  const s = st.t;
  switch (rig.kind) {
    case 'voxxy':
      // Shifts its weight from foot to foot, never quite still.
      pelvis.position.x += 0.014 * Math.sin(s * 1.5) * w;
      pelvis.position.y += 0.005 * Math.sin(s * 3.0 + 0.7) * w;
      pelvis.rotation.z += 0.055 * Math.sin(s * 1.5) * w;
      break;
    case 'droid':
      // Almost nothing: a slow settle, the odd creak.
      pelvis.position.y += 0.004 * Math.sin(s * 0.5) * w;
      pelvis.rotation.z += 0.012 * Math.sin(s * 0.37) * w;
      break;
    case 'biggy':
      // Sways like a moored boat.
      pelvis.position.x += 0.022 * Math.sin(s * 1.05) * w;
      pelvis.rotation.z += 0.075 * Math.sin(s * 1.05) * w;
      pelvis.rotation.x += 0.02 * Math.sin(s * 0.72) * w;
      break;
  }
}

function applyIdleUpper(rig: RobotRig, st: GaitState, w: number, dt: number): void {
  const b = rig.bones;
  const s = st.t;
  switch (rig.kind) {
    case 'voxxy':
      // Looks around: a slow sweep with quick curious glances on top.
      b.head.rotation.y += (0.42 * Math.sin(s * 0.63) + 0.18 * Math.sin(s * 2.1 + 1.3)) * w;
      b.head.rotation.x += (0.1 * Math.sin(s * 1.25) - 0.03) * w;
      b.head.rotation.z += 0.05 * Math.sin(s * 0.9) * w;
      for (const L of ['L', 'R'] as const) {
        b[`upperArm${L}`].rotation.x += 0.07 * Math.sin(s * 1.5 + (L === 'L' ? 0 : Math.PI)) * w;
      }
      break;
    case 'droid': {
      // A slow scan, plus an occasional joint twitch: something in there sticks.
      b.head.rotation.y += 0.55 * Math.sin(s * 0.33) * w;
      b.head.rotation.x += 0.05 * Math.sin(s * 0.21) * w;
      st.twitchIn -= dt;
      if (st.twitchIn <= 0) {
        st.twitchIn = 2.4 + rand(st) * 4;
        st.twitchAmp = 1;
        st.twitchPhase = 0;
      }
      if (st.twitchAmp > 0.001) {
        st.twitchAmp *= Math.exp(-7 * dt);
        st.twitchPhase += dt * 34;
        const j = st.twitchAmp * Math.sin(st.twitchPhase) * w;
        b.forearmR.rotation.x += 0.3 * j;
        b.shoulderR.rotation.z += 0.12 * j;
        b.head.rotation.z += 0.05 * j;
      }
      break;
    }
    case 'biggy':
      b.head.rotation.y += 0.12 * Math.sin(s * 0.45) * w;
      for (const L of ['L', 'R'] as const) {
        b[`upperArm${L}`].rotation.z += (L === 'L' ? 1 : -1) * 0.05 * Math.sin(s * 1.05) * w;
      }
      break;
  }
}

/* ------------------------------------------------------------------ poses */

function applyPosePelvis(rig: RobotRig, name: PoseName, e: number, scale: number): void {
  const pelvis = rig.bones.pelvis;
  switch (name) {
    case 'nope':
      // Rebuffed: recoil back and up, then settle. The legs stay planted.
      pelvis.position.z -= 0.07 * e * scale;
      pelvis.position.y += 0.03 * e * scale;
      pelvis.rotation.x -= 0.22 * e;
      break;
    case 'reach':
      // Stretch: the IK straightens the legs as the pelvis rises.
      pelvis.position.y += 0.08 * e * scale;
      pelvis.rotation.x += 0.06 * e;
      break;
    case 'squeeze':
      // Flatten: the pelvis drops and the knees fold under the body.
      pelvis.position.y -= 0.13 * e * scale;
      pelvis.rotation.x += 0.1 * e;
      break;
  }
}

function applyPoseUpper(rig: RobotRig, name: PoseName, e: number, st: GaitState): void {
  const b = rig.bones;
  switch (name) {
    case 'nope': {
      // A head shake, arms thrown out: "no, and here is why".
      const shake = Math.sin(st.poseT * 26) * e;
      b.head.rotation.y += 0.3 * shake;
      b.head.rotation.x -= 0.12 * e;
      for (const side of [1, -1] as const) {
        const L = side > 0 ? 'L' : 'R';
        b[`shoulder${L}`].rotation.z += side * 0.35 * e;
        b[`upperArm${L}`].rotation.x -= 0.35 * e;
        b[`forearm${L}`].rotation.x -= 0.5 * e;
      }
      break;
    }
    case 'reach':
      // Droid's job: the right arm goes up and over, the left counterbalances.
      b.shoulderR.rotation.x -= 2.25 * e;
      b.shoulderR.rotation.z -= 0.18 * e;
      b.forearmR.rotation.x += 0.45 * e;
      b.upperArmR.rotation.z -= 0.12 * e;
      b.shoulderL.rotation.x += 0.35 * e;
      b.shoulderL.rotation.z += 0.3 * e;
      b.torso.rotation.x -= 0.2 * e;
      b.neck.rotation.x -= 0.1 * e;
      b.head.rotation.x -= 0.3 * e;
      // Up on the toes.
      b.footL.rotation.x += 0.3 * e;
      b.footR.rotation.x += 0.3 * e;
      break;
    case 'squeeze': {
      // Voxxy's job: flatten the shell, tuck the long arms in, duck the head.
      const shell = rig.parts.torsoShell;
      if (shell) shell.scale.set(1 + 0.24 * e, 1 - 0.3 * e, 1 + 0.12 * e);
      b.torso.rotation.x += 0.22 * e;
      b.neck.rotation.x += 0.18 * e;
      b.head.position.y -= 0.05 * e;
      b.head.rotation.x += 0.2 * e;
      for (const side of [1, -1] as const) {
        const L = side > 0 ? 'L' : 'R';
        b[`shoulder${L}`].rotation.z -= side * 0.42 * e;
        b[`shoulder${L}`].rotation.x += 0.25 * e;
        b[`forearm${L}`].rotation.x -= 0.55 * e;
      }
      break;
    }
  }
}

/* ------------------------------------------------------------- diagnostics */

/**
 * World-space ankle position of one foot — used by the smoke test to prove that
 * a planted foot does not slide.
 */
export function footWorldPosition(rig: RobotRig, side: 'L' | 'R', target = new THREE.Vector3()): THREE.Vector3 {
  rig.root.updateMatrixWorld(true);
  return target.setFromMatrixPosition(rig.bones[`foot${side}`].matrixWorld);
}

/**
 * Is that foot in its stance phase — i.e. on the floor and planted?
 *
 * The renderer uses this for footstep audio and scuff puffs, and the smoke test
 * uses it to prove the foot is not sliding while it is down.
 */
export function footContact(rig: RobotRig, side: 'L' | 'R'): boolean {
  return stateFor(rig).contact[side === 'L' ? 0 : 1];
}

/** The gait's current cycle phase, 0..1. Handy for footstep audio. */
export function gaitPhase(rig: RobotRig): number {
  return stateFor(rig).phase;
}

/** World position of any bone — lamp placement, cable anchors, carried props. */
export function boneWorldPosition(rig: RobotRig, name: string, target = new THREE.Vector3()): THREE.Vector3 {
  const b = rig.bones[name];
  if (!b) throw new Error(`${rig.kind}: no bone "${name}"`);
  rig.root.updateMatrixWorld(true);
  return target.setFromMatrixPosition(b.matrixWorld);
}
