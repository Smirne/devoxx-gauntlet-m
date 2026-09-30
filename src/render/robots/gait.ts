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
import { BIGGY_ROLL_ROCKS } from '../../sim/constants';
import { clamp, lerp, smoothstep, type RobotRig } from './rig';

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

/**
 * How fast a shoulder is allowed to swing, radians per second.
 *
 * Michele, on the chapter-1 build: *"Voxxy's arms are frenetic at speed."* He is
 * right and the number is worse than it looks. Her profile asks for 0.85 rad of
 * swing, and at her top speed the cycle is 0.179 s, so the shoulder was being
 * driven at **30.3 rad/s — 1735 degrees per second**, measured off the bone. A
 * servo does not do that, and on screen it is a propeller.
 *
 * The cause is amplitude, not speed: she is at the speed he approved and
 * `src/sim` is not involved. The cadence is already bounded (by `MAX_STEP_FREQ`
 * and by the over-striding rule below, which is what stops her legs blurring);
 * nothing bounded the SWING, so the faster the cycle ran the faster the same
 * 0.85 rad had to be covered.
 *
 * So the arm gets the limit an actuator has: a peak angular rate. The requested
 * amplitude is scaled down by whatever factor keeps `A * 2pi / cycle` under this,
 * which is a statement about the arm rather than about the speed — and because
 * it is a rate, it only ever binds on the robot that was actually breaking it.
 * Measured at each robot's top speed with this in place: Voxxy 30.3 -> 12.0
 * rad/s (her swing at 5.8 m/s falls 0.85 -> 0.34 rad), **Droid 3.4 and Biggy 6.4,
 * both untouched**, and Voxxy's own walk at 1 m/s untouched at 9.3.
 */
const ARM_MAX_RATE = 12;

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
  /** Walking backwards (moving against `heading`): the step cycle runs in reverse. */
  backward?: boolean;
  /** Carrying a rider (Biggy under Droid): the body bobs, sways and leans far less. */
  laden?: boolean;
  /** Set to fire a one-shot pose. Edge triggered: hold it or clear it, either works. */
  pose?: PoseName | null;
  /**
   * Where a hop is in its arc: **0 on the ground, 0..1 across the airtime.**
   *
   * This is `hopPhase(bot)` from `src/sim/bot.ts` and nothing else — the sim owns
   * the jump, the renderer reads its clock. The caller lifts the rig by
   * `JUMP_RISE_M * 4u(1 - u)`; this is what the robot DOES while it is up there.
   */
  hop?: number;
  /**
   * Where a party trick is: **0 when standing, 0..1 across the flourish.**
   *
   * This is `flairPhase(bot)` from `src/sim/bot.ts` and nothing else — the same
   * arrangement as `hop`, one number off the sim's clock. WHICH flourish plays is
   * the rig's own business (Biggy rolls, Droid stretches), because which robot it
   * is is not a thing the sim should have to tell the renderer twice.
   *
   * Unlike the hop, nothing outside this file reads it: a flourish is cosmetic,
   * and the body does not move a millimetre.
   */
  flair?: number;
  /**
   * How much of this robot's motion is SOMEBODY ELSE'S: 0 driving himself, 1 shoved.
   *
   * Michele, 24 Sep 2026: *"ah Another thing to handle later. Biggy should really
   * roll, at least when he's pushed!"* He is right about the physics — Biggy is a
   * 1.2 m ball on two stubby legs and he crossed the hall like a crate on ice,
   * with the same walk whether he was driving or being pushed into a door.
   *
   * The caller works it out from the one thing that distinguishes the two: a
   * robot that is moving with nothing on the stick is being moved by something.
   * Which robot does what with it is this file's business, and only Biggy does
   * anything at all — Voxxy and Droid are not balls.
   */
  shoved?: number;
  /**
   * Both hands full: Biggy with chapter 3's soup pot on his shoulder.
   *
   * The renderer reads it off the published `pot` prop rather than from a new sim
   * flag, because the pot IS the sim's answer to the question — it is only
   * published while he is carrying it. All it does here is keep the ball from
   * rolling with a pot on top of it.
   */
  carrying?: boolean;
  /**
   * A weight shift someone else is driving: the pelvis raised by `rise` metres
   * (at the rig's own scale) and pitched forward by `pitch` radians, BEFORE the
   * legs, so the IK takes it up and the feet stay planted. The 3D renderer's
   * lever reach uses it (`src/render3d/reach3d.ts`); omitted, nothing moves.
   */
  body?: { rise: number; pitch: number };
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
  /** Stance-foot slide under braking, centimetres per m/s^2. */
  skid: number;
  /**
   * MOMENTUM, optional and Voxxy's only (Michele, 30 Sep 2026, on a critic's
   * "her start/stop reads as toy-like"). The sim takes her 0 -> 4 m/s in 0.1 s
   * and stops her in 0.57 s, frozen; what made that read as a wind-up toy was
   * the body tracking the acceleration exactly, with no weight behind it. With
   * these set, the acceleration lean goes through an underdamped spring
   * (`leanSpring`: natural frequency, rad/s, and damping ratio), so the body
   * lags into the push and overshoots once when she plants; braking leans back
   * harder than starting leans forward (`brakeLean` multiplies `accelLean`
   * while decelerating); and the hips drop into the stop (`brakeDip`, metres
   * per m/s^2, capped) so the knees take the load. Absent, a robot's lean is
   * exactly what it was — Droid and Biggy do not set them.
   */
  leanSpring?: { omega: number; zeta: number };
  brakeLean?: number;
  brakeDip?: number;
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
  /**
   * How far the knee is allowed to fold while STANDING, in radians.
   *
   * `crouch` is a distance, and a distance means completely different knee
   * angles on a 1.04 m leg and on a 0.30 m one: Biggy's nominal 0.05 m sank his
   * 0.30 m leg far enough to fold the knee 63 degrees, which swung his ribbed
   * ankle bellows out into a crescent that photographed as a stack of rings
   * floating off the leg entirely. Capping the ANGLE instead of the sag keeps
   * every robot's stance the one its own sheet has — Voxxy and Biggy on nearly
   * straight stubby legs, Droid with the deliberate crouch that is his.
   */
  standBend: number;
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
    // Read against a sharper acceleration signal than the others (see
    // `accelLeanOf`), so 0.009 here peaks ~25% past the old 0.012 on a start;
    // braking leans back 1.6x as hard, through a spring that rings once at
    // ~2 Hz — quick enough to stay hers, damped enough (0.35) that the one
    // forward rock after she stops is a settle and not a wobble.
    accelLean: 0.009,
    skid: 0.09,
    leanSpring: { omega: 13, zeta: 0.35 },
    brakeLean: 1.6,
    brakeDip: 0.0016,
    armSwing: 0.85,
    elbow: 0.5,
    twist: 0.1,
    sway: 0.05,
    headBob: 0.09,
    headLead: 0.75,
    crouch: 0.045,
    standBend: 0.4,
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
    standBend: 0.89,
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
    standBend: 0.32,
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
  /**
   * Smoothed `GaitParams.shoved`, and how far the ball has rolled, in radians.
   *
   * The angle is integrated from DISTANCE, not from time: `v dt / r` is exactly
   * what a ball of radius `r` turns through while it travels, so the wobble has
   * one period per revolution and speeding up makes him roll faster rather than
   * flap faster. It is the same reasoning the step cycle uses two hundred lines
   * up — a gait that is a function of the clock instead of the ground is the
   * thing that reads as ice.
   */
  shove: number;
  rollA: number;
  /**
   * 0 walking .. 1 tucked up and rolling like the ball he is.
   *
   * Separate from `shove`, which is only "is somebody else moving him": a slow
   * nudge tips him, a real shove rolls him. See `applyShove`.
   */
  roll: number;
  /**
   * Steps taken since somebody else started running him along, counted off the
   * step cycle itself. The roll waits for `ROLL_AFTER_STEPS` of them.
   */
  pushedSteps: number;
  /** 0 arms down .. 1 both hands on chapter 3's soup pot. See `applyCarry`. */
  hold: number;
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
  /** `accel` smoothed at 18 s^-1 instead of 6: what the lean spring chases. */
  accelFast: number;
  /** The spring-driven acceleration lean (`Profile.leanSpring`) and its rate. */
  leanP: number;
  leanPV: number;
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
    accelFast: 0,
    leanP: 0,
    leanPV: 0,
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
    shove: 0,
    rollA: 0,
    roll: 0,
    pushedSteps: 0,
    hold: 0,
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

/**
 * How far a two-bone leg's hip drops when its knee folds by `bend` radians.
 *
 * Law of cosines on the thigh/shin triangle: the hip-to-ankle distance at a
 * knee angle of `pi - bend` is `sqrt(t^2 + s^2 + 2ts cos bend)`, and the sag is
 * how much shorter that is than the straight leg. Exact for any proportions,
 * which is the point — a metres-based crouch is not.
 */
export function standSag(thigh: number, shin: number, bend: number): number {
  const b = clamp(bend, 0, Math.PI * 0.9);
  const d = Math.sqrt(thigh * thigh + shin * shin + 2 * thigh * shin * Math.cos(b));
  return Math.max(0, thigh + shin - d);
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

  /*
   * THE HOP. Voxxy's verb, and the only robot that has one.
   *
   * `u` is the sim's own `hopPhase`, 0 at take-off and 1 at landing. Everything
   * below is built from two shapes of it, so the pose is continuous at both ends
   * without a blend parameter to keep in step:
   *
   *   `tuck`  climbs fast out of the floor, holds through the apex, and unwinds
   *           into the landing — the knees coming up.
   *   `land`  is zero until past the apex and 1 at touchdown — the legs reaching
   *           for the floor and the arms coming down to catch.
   *
   * A mounted robot cannot hop (the sim will not let one), so the two never mix.
   */
  const u = params.mounted ? 0 : clamp(params.hop ?? 0, 0, 1);
  const hopping = u > 0;
  const tuck = hopping ? smoothstep(0, 0.16, u) * (1 - smoothstep(0.55, 0.96, u)) : 0;
  const land = hopping ? smoothstep(0.5, 1, u) : 0;

  /*
   * THE PARTY TRICK. Biggy's roll and Droid's stretch, the two flourishes that
   * are not the hop — same deal as `u` above: the sim's own phase, 0 to 1, and
   * the shape of the move belongs to this file.
   *
   * A mounted robot is refused one by the sim, and a flourish and a hop cannot
   * overlap either (one `hopRest` gates all three), so like the hop this never
   * has to blend against anything but the walk it interrupts.
   */
  const f = params.mounted ? 0 : clamp(params.flair ?? 0, 0, 1);
  const flairing = f > 0;

  /* ------------------------------------------------------------ speed */
  const v = Math.max(0, params.speedMps || 0);
  const accelRaw = dt > 0 ? (v - st.prevSpeed) / dt : 0;
  st.prevSpeed = v;
  st.accel += (accelRaw - st.accel) * (1 - Math.exp(-6 * dt));
  st.accelFast += (accelRaw - st.accelFast) * (1 - Math.exp(-18 * dt));
  /*
   * IS HE ROLLING? — and if he is, he is not walking.
   *
   * Michele asked for this four times across two rounds, the last three of them
   * while looking at the answer: *"I can't get biggy to roll"*, *"How do I
   * activate Biggy's rolling? I tried running but it keeps walking"*, *"(still
   * can't make it roll)"*. He was right every time. What existed was a **tip** —
   * eleven degrees of gut and a lean — over a walk cycle that never stopped, and
   * a robot taking little steps while leaning is not a ball rolling, whatever the
   * sim's flag says.
   *
   * So above a real rolling speed the walk is switched off at the source: `moving`
   * and `amp` are what every part of the gait is scaled by, and both go to zero
   * as `st.roll` comes up. `applyShove` then tucks the legs and spins the whole
   * body about the gut's own centre. Below that speed nothing changes, because a
   * ball being nudged across a floor does not roll either.
   *
   * PUSHED, AND FAST — both, and that is Michele's call rather than a reading of
   * the physics. For one round the gate was SPEED alone, whoever set him going,
   * because *"I tried running but it keeps walking"* was a fair complaint about a
   * ball. He drove it, liked the move, and drew the line somewhere else: *"the
   * roll is great! ... maybe it's better to reserve it for when he's pushed to
   * high speed"*. So a robot under his own stick walks however fast he is going,
   * and the roll belongs to the thing it started as — a heavy body somebody else
   * has set moving. It is a game-feel decision, it is his, and the physics reads
   * the same either way.
   */
  // ...and he does not roll with a pot of hot soup on his shoulder. Chapter 3
  // asks the heavy robot to be driven gently with both hands full; a ball is the
  // one thing that errand is not.
  const rolling =
    rig.kind === 'biggy' && (params.shoved ?? 0) > 0.5 && !params.mounted && !params.carrying;
  /*
   * INTO IT ON THE THIRD STEP, AND OUT OF IT ONLY AS HE STOPS.
   *
   * Michele, 29 Sep 2026: *"Biggy's roll: should not start straight away, make a
   * couple of steps then roll. And when the door is smashed, Biggy should keep
   * rolling for a couple of metres, then stand."*
   *
   * In: he is run along on his own feet for `ROLL_AFTER_STEPS` steps — counted
   * off his own step cycle below, so it is steps and not a clock, at whatever
   * pace the push sets — and tucks over the next one. He used to tuck on the
   * frame the push passed 1.5 m/s, a third of a second in, which read as a ball
   * that had never been a robot.
   *
   * Out: once tucked he stays tucked while he is still rolling on
   * (`ROLL_KEEP_MPS`), and puts his legs down as he comes to rest. He used to
   * untuck on the way back down through 1.5 m/s — and the roller door takes 60%
   * of his speed on the way through, so he was half out of the roll in the
   * doorway and walked the rest of the way in.
   */
  if (!rolling) st.pushedSteps = 0;
  const wantRoll = !rolling
    ? 0
    : st.roll > 0.5
      ? smoothstep(ROLL_STAND_MPS, ROLL_KEEP_MPS, v)
      : smoothstep(ROLL_MIN_MPS, ROLL_FULL_MPS, v) * smoothstep(ROLL_AFTER_STEPS, ROLL_AFTER_STEPS + 1, st.pushedSteps);
  st.roll += (wantRoll - st.roll) * (1 - Math.exp(-(wantRoll > st.roll ? ROLL_ON : ROLL_OFF) * dt));
  // The legs go away as he balls up. `tuckLegs` is called here rather than inside
  // `applyShove` because it writes a SCALE, and a scale that is not written every
  // frame leaves a robot standing about with no legs when the roll ends.
  tuckLegs(rig, flairing ? 0 : st.roll);
  const walkAmt = 1 - st.roll;
  const moving = smoothstep(0.03, 0.35, v) * walkAmt;
  const idleAmt = 1 - moving;
  const amp = smoothstep(IDLE_SPEED_MPS, p.speedRef, v) * walkAmt;

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
  const legLen = (st.thighLen + st.shinLen) * 0.98;
  /*
   * A robot sinks into its gait and straightens up when it stops.
   *
   * The profile's crouch is a distance, and the same distance is a completely
   * different knee angle on a 1.04 m leg and on a 0.30 m one: Biggy's sank his
   * short legs far enough to fold the knee 63 degrees while STANDING STILL,
   * which swung his ribbed ankle bellows out of the leg's own line and
   * photographed as a stack of rings floating behind the boot. Standing is
   * capped by a knee ANGLE instead (`standBend`, exact for any proportions);
   * walking keeps the full crouch, because a straight leg cannot stride — the
   * foot would have to slide to reach, which `plants its feet` catches.
   */
  const walkCrouch = Math.min(p.crouch, legLen * 0.15);
  const standCrouch = Math.min(walkCrouch, standSag(st.thighLen, st.shinLen, p.standBend));
  const crouch = standCrouch + (walkCrouch - standCrouch) * moving;
  const standH = Math.max(0.02, st.hipRestY - crouch - st.footRest[0].y);
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
  // Two steps to a cycle: the run-up the roll waits for (`ROLL_AFTER_STEPS`).
  if (rolling && v > PUSHED_STEP_MPS) st.pushedSteps += (2 * dt) / cycle;

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
  // A rider sits at a fixed height over Biggy, so his full bounce under Droid
  // read as a trampoline (Michele, 28 Sep: "biggy should be less bouncy when
  // droid's on top"). Laden, he plods: a quarter of the bob and sway.
  const calm = params.laden ? 0.25 : 1;
  const bob = -BOB_M * p.bob * (0.5 - 0.5 * Math.cos(st.phase * TAU * 2)) * moving * calm;
  const back = params.backward ? -1 : 1;
  const accelLean = accelLeanOf(st, p, dt);
  const lean = (back * LEAN_RAD_PER_MPS * p.lean * v + clamp(accelLean, -0.32, 0.32)) * (params.laden ? 0.4 : 1);
  // Hips drop into a hard stop, so the knees are seen to take her weight.
  const dip = p.brakeDip ? clamp(-st.accel * p.brakeDip, 0, 0.03) : 0;
  pelvis.position.y += bob - crouch - dip;
  // A ball has no posture: the lean goes as he tucks, or it tips the lid forward
  // off the top of him for as long as he rolls.
  pelvis.rotation.x += clamp(lean, -0.45, 0.45) * walkAmt;
  pelvis.rotation.z += Math.sin(st.phase * TAU) * p.sway * moving * calm;
  pelvis.rotation.y += -Math.sin(st.phase * TAU) * p.twist * moving * calm;

  if (idleAmt > 0.01) applyIdlePelvis(rig, st, idleAmt);
  if (poseName) applyPosePelvis(rig, poseName, e, scale);
  if (params.body && !params.mounted) {
    pelvis.position.y += params.body.rise * scale;
    pelvis.rotation.x += params.body.pitch;
  }
  // Droid's stretch lifts the pelvis BEFORE the legs, so the IK straightens them
  // under him and his feet stay where they were planted — the same arrangement the
  // 'reach' pose uses. Biggy's roll is the opposite case and waits until after.
  if (flairing) applyFlairPelvis(rig, f, scale);
  if (hopping) {
    // The pelvis rides a little higher with the knees up and drops as she folds
    // to absorb the landing. The bob and the lean are already in; this is on top,
    // and it is BEFORE the legs so the IK blend below sees the real hip height.
    pelvis.position.y += (0.035 * tuck - 0.045 * land) * scale;
    pelvis.rotation.x += 0.16 * tuck - 0.1 * land;
  }

  /* ------------------------------------------------------------- legs */
  if (params.mounted) {
    // Riding Biggy: sitting astride the dome, not curled up in mid-air.
    //
    // This was knees-up and feet-tucked, which reads as a crouching jump and,
    // together with a lift that assumed his soles touched down, left him hovering
    // over the helmet. He straddles it now.
    //
    // ROUND TWO, on Michele's *"Droid sitting on Biggy reads well only from some
    // angles."* This game has one camera, so "some angles" means the one that
    // matters, sometimes. Shot from it (chapter 1, the pair about 100 px tall),
    // the failure is specific: **nothing of his legs appears outside Biggy's
    // outline**. The hips rolled 0.58 and the thighs 0.52 forward put both knees
    // inside a dome 0.88 m across, so what the camera got was a torso and a head
    // standing out of a ball, with two blue flecks where his shins surfaced
    // through the shell — a bust on a plinth, not a rider.
    //
    // A silhouette is the only thing that reads at that size, so the legs are
    // posed to make one: hips rolled to 0.92 takes each knee past the dome's
    // 0.44 m flank, the thigh comes further forward so the knee breaks his
    // outline toward the camera, and the shin folds back hard so the foot tucks
    // against the helmet instead of hanging into the gut below it. Knees up
    // round his ears on a beach ball is also the funnier read, which is the
    // tie-breaker Michele has already given us: *"I vote funny, robots must be
    // recognizable."*
    for (const L of ['L', 'R'] as const) {
      bones[`thigh${L}`].rotation.x = -0.86;
      bones[`shin${L}`].rotation.x = 1.62;
      bones[`foot${L}`].rotation.x = -0.15;
      bones[`hip${L}`].rotation.z = L === 'L' ? 0.92 : -0.92;
    }
    // Leaning forward over the crown, which is what a rider does and what stops
    // his own head reading as the top of a totem pole.
    pelvis.rotation.x += 0.2;
    st.contact[0] = false;
    st.contact[1] = false;
  } else {
    const lift = p.lift * smoothstep(0.05, 0.45, v) * scale;
    // Braking slide: Biggy's is the big one; Voxxy's small feet skid a little.
    const skid = back > 0 ? clamp(-st.accel, 0, 40) * p.skid * 0.01 : 0;
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
      // Backing up mirrors the stride: the planted foot travels forward.
      solveLeg(rig, st, side, back * z, y, pelvis.rotation.x, ankle);
    }
    if (hopping) applyHopLegs(rig, st, tuck, land);
  }

  /* ------------------------------------------------------------- arms */
  /*
   * The slew limit (see `ARM_MAX_RATE`). `upper.rotation.x` traces
   * `A cos(2pi t / cycle)`, whose peak rate is `A * 2pi / cycle`; hold that under
   * the limit and the whole arm — elbow included, or the forearm would outrun the
   * upper arm it hangs off — is scaled by the same factor.
   */
  const wanted = p.armSwing * amp;
  const armRate = (wanted * TAU) / Math.max(1e-4, cycle);
  const armScale = armRate > ARM_MAX_RATE ? ARM_MAX_RATE / armRate : 1;
  const swing = wanted * armScale;
  for (const side of [0, 1] as const) {
    const L = side === 0 ? 'L' : 'R';
    const shoulder = bones[`shoulder${L}`];
    const upper = bones[`upperArm${L}`];
    const fore = bones[`forearm${L}`];
    const u = (st.phase + side * 0.5) % 1;
    // +1 when this side's leg is forward; the arm counter-swings it.
    const fwd = Math.cos(u * TAU);
    upper.rotation.x += swing * fwd;
    fore.rotation.x -= p.elbow * amp * armScale * Math.max(0, -fwd) + 0.06 * amp;
    // A little outward flare with speed, and a lag behind the turn.
    shoulder.rotation.z += (side === 0 ? 1 : -1) * 0.06 * amp;
    shoulder.rotation.y += clamp(-st.turn * 0.04, -0.2, 0.2);
  }
  if (params.mounted) {
    /*
     * Both hands down on the crown. They were held straight out to the sides,
     * which from the diorama camera is a scarecrow; a rider holding on is the
     * one arm pose that reads at 100 px, and it clears the knees, which are now
     * up round his ears.
     */
    for (const L of ['L', 'R'] as const) {
      bones[`shoulder${L}`].rotation.x = -0.45;
      bones[`shoulder${L}`].rotation.z = (L === 'L' ? 1 : -1) * 0.34;
      bones[`upperArm${L}`].rotation.x = -0.35;
      bones[`forearm${L}`].rotation.x = -0.8;
    }
    bones.torso.rotation.x += 0.1;
  }

  /* ------------------------------------------------------ torso + head */
  torso.rotation.y += Math.sin(st.phase * TAU) * p.twist * moving;
  torso.rotation.x += 0.35 * clamp(accelLean, -0.2, 0.2);
  head.rotation.x += p.headBob * Math.sin(st.phase * TAU * 2) * moving;
  head.rotation.y += clamp(st.headErr * p.headLead, -0.7, 0.7);
  // Banking into a turn: lean the body toward the inside of the corner.
  pelvis.rotation.z += clamp(st.turn * 0.035 * v, -0.18, 0.18);

  if (idleAmt > 0.01) applyIdleUpper(rig, st, idleAmt, dt);
  if (poseName) applyPoseUpper(rig, poseName, e, st);
  if (hopping) applyHopUpper(rig, tuck, land);
  if (flairing) applyFlairBody(rig, st, f, standH);
  /*
   * ...and the roll, which is the same tip driven by being pushed instead of by
   * showing off. It is skipped outright while a flourish is playing: both of them
   * move the whole body about the floor between his boots, and two at once would
   * be two pivots fighting over one pelvis.
   */
  if (!flairing) applyShove(rig, st, params.shoved ?? 0, v, amp, dt, standH);
  /*
   * ...and BOTH HANDS ON THE POT, last, so it wins over the walk's arm swing.
   *
   * Michele, 28 Sep 2026, with a photograph of Biggy and a pot of soup floating
   * beside his head: *"GRAB that thing :D"*. It was drawn where a carried pot
   * belongs and he was standing there with his arms down, which reads as a pot
   * that has nothing to do with him. `src/render/scene.ts` puts it in the hands
   * this pose makes — it reads the rig's own hand bones rather than a number typed
   * twice — so the two cannot come apart however the pose is tuned.
   */
  applyCarry(rig, st, (params.carrying ?? false) && !flairing, dt);

  /* --------------------------------------------------------- antenna */
  const ant = bones.antenna;
  if (ant) {
    // A damped spring whipped by acceleration and by turning. Biggy's is slack
    // and wobbles for ages; Voxxy's nub is stiff and barely moves.
    // The hop whips it too: she goes up, the nub stays behind, and it is still
    // catching up when she lands. `tuck - land` is +1 rising and -1 falling.
    const driveX = -clamp(st.accel, -30, 30) * 0.012 - Math.sin(st.t * 2.1) * 0.04 * idleAmt - 0.22 * (tuck - land);
    const driveZ = clamp(st.turn, -8, 8) * 0.06 + Math.sin(st.t * 1.5 + 1.1) * 0.03 * idleAmt;
    st.antXV += (-p.antK * st.antX - p.antC * st.antXV + driveX * p.antK) * dt;
    st.antZV += (-p.antK * st.antZ - p.antC * st.antZV + driveZ * p.antK) * dt;
    st.antX = clamp(st.antX + st.antXV * dt, -0.6, 0.6);
    st.antZ = clamp(st.antZ + st.antZV * dt, -0.6, 0.6);
    ant.rotation.x += st.antX;
    ant.rotation.z += st.antZ;
  }
}

/**
 * The acceleration part of the body lean, radians.
 *
 * Without `leanSpring` it is the smoothed acceleration times `accelLean`, as it
 * always was. With it, the target follows a SHARPER acceleration (`accelFast`)
 * and a damped spring chases it, integrated in 1/120 s substeps so a long frame
 * cannot blow it up. The sharper signal is what lets the spring overshoot: it
 * drops back to zero as soon as the robot is at speed or at rest, and the body,
 * still carrying its own momentum, rocks once past upright before it settles.
 */
function accelLeanOf(st: GaitState, p: Profile, dt: number): number {
  if (!p.leanSpring) return st.accel * p.accelLean;
  const a = st.accelFast;
  const target = a * p.accelLean * (a < 0 ? (p.brakeLean ?? 1) : 1);
  const { omega, zeta } = p.leanSpring;
  const n = Math.max(1, Math.ceil(dt * 120));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    st.leanPV += (omega * omega * (target - st.leanP) - 2 * zeta * omega * st.leanPV) * h;
    st.leanP += st.leanPV * h;
  }
  return st.leanP;
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
      /*
       * Looks around: a slow sweep with quick curious glances on top.
       *
       * Amplitude halved from 0.42 + 0.18. At 0.6 rad Voxxy spent most of his
       * idle with his face 34 degrees off the camera, which is a third of the
       * visor's apparent width and most of one ear's white shell gone — and the
       * model-sheet check is shot on an idling rig. Curious, still; turned away
       * from the judge, no.
       */
      b.head.rotation.y += (0.21 * Math.sin(s * 0.63) + 0.1 * Math.sin(s * 2.1 + 1.3)) * w;
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

/* -------------------------------------------------------------------- hop */

/**
 * The legs, while she is in the air.
 *
 * `solveLeg` has already run and planted both feet on a floor that is no longer
 * under them, so this **blends over** its answer rather than adding to it: at
 * the apex the leg is entirely the tuck, and at both ends of the arc it is
 * entirely the walk, which is what makes take-off and landing continuous with
 * whatever she was doing before she pressed the key.
 *
 * `contact` is cleared as well. A foot that is 30 cm off the floor is not
 * planted, and `main.ts` fires a footstep off exactly this flag — without it she
 * clattered across the whole arc.
 */
function applyHopLegs(rig: RobotRig, st: GaitState, tuck: number, land: number): void {
  const b = rig.bones;
  // Knees up and heels back on the way up; the leg straightens and the toes come
  // up to meet the floor on the way down.
  const thighT = -1.15 * tuck + 0.16 * land;
  const shinT = 1.5 * tuck * (1 - 0.65 * land);
  const footT = 0.34 * tuck - 0.5 * land;
  const w = clamp(tuck + land * 0.85, 0, 1);
  for (const L of ['L', 'R'] as const) {
    const thigh = b[`thigh${L}`];
    const shin = b[`shin${L}`];
    const foot = b[`foot${L}`];
    thigh.rotation.x = lerp(thigh.rotation.x, thighT, w);
    shin.rotation.x = lerp(shin.rotation.x, shinT, w);
    foot.rotation.x = lerp(foot.rotation.x, footT, w);
    // A small splay, so the tuck is a frog and not a pair of scissors.
    b[`hip${L}`].rotation.z += (L === 'L' ? 1 : -1) * 0.2 * tuck;
  }
  st.contact[0] = false;
  st.contact[1] = false;
}

/**
 * The arms, the torso and the head, while she is in the air.
 *
 * Voxxy's arms are the longest thing on her — the model sheet's own "very long
 * tapered arms with a white band near the wrist" — so they are what has to carry
 * the jump. Both go up and OUT on the way up (a small robot with a big reach,
 * which is the read Michele keeps asking for: *"I vote funny, robots must be
 * recognizable"*), then swing forward and down to catch the landing. It is
 * written for any rig rather than for Voxxy alone, because only the sim decides
 * who may leave the floor and this file should not have a second opinion.
 */
function applyHopUpper(rig: RobotRig, tuck: number, land: number): void {
  const b = rig.bones;
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    // Negative rotation.x on a shoulder lifts the arm forward and up (see the
    // 'reach' pose, which is the same sign).
    b[`shoulder${L}`].rotation.x -= 1.55 * tuck - 0.6 * land;
    b[`shoulder${L}`].rotation.z += side * (0.5 * tuck + 0.16 * land);
    b[`upperArm${L}`].rotation.x -= 0.25 * tuck;
    b[`forearm${L}`].rotation.x -= 0.5 * tuck + 0.3 * land;
  }
  b.torso.rotation.x -= 0.14 * tuck - 0.2 * land;
  b.neck.rotation.x -= 0.1 * tuck - 0.08 * land;
  // Looks up at the top of the arc and down at what she is about to land on.
  b.head.rotation.x -= 0.2 * tuck - 0.16 * land;
}

/* ------------------------------------------------------------ party tricks */

/**
 * How far into the move a flourish is, as an amplitude rather than a clock.
 *
 * Droid's stretch: up over the first third, held, released into the settle. Every
 * term of his pose is scaled by this one number, so the whole thing starts and
 * ends at exactly the pose he was already standing in and there is nothing to
 * blend.
 */
const stretchE = (f: number): number => smoothstep(0, 0.33, f) * (1 - smoothstep(0.64, 1, f));

/**
 * How far Biggy goes over at the top of a rock, in radians.
 *
 * 0.62 is 36 degrees of gut, and it is bigger than it needs to be in the abstract
 * on purpose. This game has one camera and it is a high isometric, which
 * foreshortens a roll about the forward axis badly: at the 0.5 rad this started on,
 * a strip of frames through the whole move read as a lean rather than a rock. What
 * the camera sees is what the number is set to.
 */
const BIGGY_ROLL_RAD = 0.62;

/** Biggy's rock, in radians: a decaying weeble, zero at both ends. */
const rollRad = (f: number): number =>
  BIGGY_ROLL_RAD *
  smoothstep(0, 0.1, f) *
  (1 - smoothstep(0.76, 1, f)) *
  Math.sin(TAU * BIGGY_ROLL_ROCKS * f);

/**
 * Droid's stretch — the half that has to happen before the legs.
 *
 * He comes up out of his own standing crouch, which is the "small rise and settle"
 * of somebody who has been at a desk for four hours. Doing it here means the IK
 * straightens his legs under him and his feet stay planted, exactly as the 'reach'
 * pose does it; doing it afterwards would have lifted him off the floor.
 */
function applyFlairPelvis(rig: RobotRig, f: number, scale: number): void {
  if (rig.kind !== 'droid') return;
  const e = stretchE(f);
  rig.bones.pelvis.position.y += 0.075 * e * scale;
  // Positive pelvis.rotation.x is a forward lean (see the walk's own lean), so the
  // arch through the back is negative.
  rig.bones.pelvis.rotation.x -= 0.11 * e;
}

/**
 * The other two robots' answer to `E`, from the waist up — and, for Biggy, from
 * the boots up.
 *
 * Michele, 25 Sep 2026: *"Voxxy jumps, Biggy rolls, Droid? Stretches? Not needed
 * for gameplay."* Neither of these moves the robot: the sim's flourish writes a
 * clock and nothing else (`partyTrick`, `src/sim/bot.ts`), and everything here is
 * a bone rotation about the body's own axis.
 *
 * **Biggy rocks, he does not travel.** The read the model sheet gives us is one
 * thing — a huge round gut with a tin lid on it — so his roll is that ball going
 * over its own edge and coming back, a turn and a half of it, with the stubby arms
 * trailing a beat behind the body and the lid trying to stay level. It is applied
 * AFTER the IK rather than before, because the whole robot tips as one piece: a
 * roll fed to the legs first would be a man standing still and swaying his hips,
 * which is what a weeble is not. The pivot is moved down to the floor between his
 * boots (that is the `standH` pair of terms), and the rise on `|sin|` is what
 * tipping a wide flat base up onto its edge actually costs you — it also keeps
 * the low boot from going through the floor at the top of each rock.
 */
/**
 * Tip Biggy over the floor between his boots, about one axis.
 *
 * Rotating a bone rotates the body about THAT BONE, and a ball goes over its own
 * edge, not about its middle — so the pelvis is translated by exactly as much as
 * the rotation moved it away from the floor pivot, and the two cancel. For a roll
 * about z a pelvis `standH` up ends at `(-standH sin th, standH cos th)`; about x
 * it ends at `(standH sin th)` in z. That is the whole of the arithmetic.
 *
 * `rise` is the extra lift from levering a wide flat base up onto its edge. Biggy's
 * boots are wide across him and short front to back, so it is real for a sideways
 * rock and near enough nothing for a forward one — which is why it is an argument
 * rather than a constant.
 */
function tipBiggy(rig: RobotRig, th: number, standH: number, axis: 'x' | 'z', rise: number): void {
  const pelvis = rig.bones.pelvis;
  const s = Math.sin(th);
  const c = Math.cos(th);
  pelvis.position.y += standH * (c - 1) + Math.abs(rise * s);
  if (axis === 'z') {
    pelvis.rotation.z += th;
    pelvis.position.x -= standH * s;
  } else {
    pelvis.rotation.x += th;
    pelvis.position.z += standH * s;
  }
}

/**
 * Turn `bone` by `a` radians about its parent's x axis through `pivot`, a point in
 * the parent's frame: `tipBiggy` for a pivot that is not straight below the joint.
 */
function turnAboutX(bone: THREE.Object3D, pivot: THREE.Vector3, a: number): void {
  const y = bone.position.y - pivot.y;
  const z = bone.position.z - pivot.z;
  const c = Math.cos(a);
  const s = Math.sin(a);
  bone.position.y = pivot.y + y * c - z * s;
  bone.position.z = pivot.z + y * s + z * c;
  bone.rotation.x += a;
}
const _gut = new THREE.Vector3();
const _turnQ = new THREE.Quaternion();
/**
 * How far round the ball the lid rides and comes back as he rolls, radians each
 * way, once a revolution: the face shows the roll without leaving the top of him.
 */
const LID_RIDE = 0.3;

/** Biggy's gut as a fraction of his height — the sheet's ball is 0.83 across. */
const GUT_R_PER_H = 0.415;
/** How far he goes over on each roll, radians at full tilt. */
const ROLL_TIP = 0.20;
/** ...and how far the top of him lags behind a shove that is pushing the bottom. */
const PUSH_LAG = 0.12;
/**
 * How fast the roll comes on when a shove lands, per second.
 *
 * Fast: the push is the event, and a ball that is hit goes over on the frame it
 * is hit. There is no matching threshold here any more — whether he is being
 * moved by somebody else is the sim's answer (`worldMoved`), and it is a fact
 * rather than a guess, so this file does not second-guess it with a number.
 */
const SHOVE_ON = 9;
/**
 * The speeds a shove has to reach before Biggy stops walking and starts ROLLING.
 *
 * 1.5 m/s to begin and 3 m/s for the full tuck — against a top speed of 4.7. A
 * ball that is nudged does not roll, it is nudged; a ball that is shoved across a
 * hall does nothing else. Both are metres per second and neither is a px/s
 * quantity, so the 23 Sep rescale does not touch them.
 */
const ROLL_MIN_MPS = 1.5;
const ROLL_FULL_MPS = 3;
/**
 * ...and the rest of the roll's timing (see "into it on the third step" in
 * `applyGait`): the steps he takes on his own feet once somebody is running him
 * along — a step counts while he is being moved faster than a shuffle — and,
 * once he is tucked, the speed he stays balled up above and the speed his legs
 * are all the way out by. Through chapter 2's roller door, braking on his own
 * 1.2 s⁻¹ from the 2.2 m/s the door leaves him, that is a metre of ball and then
 * a robot standing up over the last half metre.
 */
const ROLL_AFTER_STEPS = 2;
const PUSHED_STEP_MPS = 0.3;
const ROLL_KEEP_MPS = 0.9;
const ROLL_STAND_MPS = 0.35;
/**
 * HOW FAR THE LEGS GO AWAY when he balls up, as a fraction of their own length.
 *
 * Michele, looking at the first roll: *"Biggy should retreat his feet while
 * rolling."* Folding them (thigh back, shin up, toe down) put the knees inside the
 * gut and left two boots sticking out of a sphere, which is what he saw. A leg
 * that is scaled to a fifth of itself about the hip ends up entirely inside a
 * 1.2 m ball, so the silhouette while rolling is the ball and nothing else, and it
 * comes back out as the tuck lets go. Scale rather than a hidden mesh, because a
 * scale blends: there is no frame where a boot pops.
 */
const LEG_TUCK = 0.8;
/**
 * How fast both hands come onto the pot, and let go of it, per second.
 *
 * Quick on, because picking a pot up is a decision; slower off, because handing
 * it over is a hand-over. Neither is a cut: `E` at the counter is one frame and a
 * robot whose arms teleport into a carry on that frame reads as a glitch.
 */
const CARRY_ON = 8;
const CARRY_OFF = 5;
/** How fast the tuck comes on and lets go, per second. Faster in than out. */
const ROLL_ON = 7;
const ROLL_OFF = 4;
/** Where the gut's centre sits above the sole, as a fraction of his height. */
const GUT_CY_PER_H = 0.507;
/**
 * ...and how fast it lets go when the player takes the stick back, per second.
 *
 * Slower than it came on, because standing up out of a roll is a recovery and
 * not a cut. It never runs during the coast: `shoved` stays true for the whole
 * free slide, and the roll tapers there with `amp`, which is the speed — he
 * stops rolling because he has stopped, not because a timer ran out.
 */
const SHOVE_OFF = 3.5;

/**
 * BIGGY BEING PUSHED, which should not look like Biggy walking.
 *
 * Michele: *"Biggy should really roll, at least when he's pushed!"* The read the
 * sheet gives us is a huge round gut with a tin lid on it, and a huge round gut
 * that is shoved does two things a walking one does not: it goes over its own
 * edge and comes back, and the top of it lags behind the bottom because the
 * push is down at the floor and the mass is up in the ball.
 *
 * Both are here, and both are scaled by how much of his motion is somebody
 * else's — `GaitParams.shoved`, which the renderer takes from the sim's
 * `worldMoved` and NOT from an empty stick; the difference is a measured 61% of
 * a roll on every tap and release, and the measurement is in `worldMoved`'s own
 * comment. The wobble's angle is integrated from DISTANCE (`v dt / r`), so it
 * has one period per revolution of a ball that size: he rolls faster when he is
 * going faster instead of flapping faster, which is the difference between this
 * and an animation. The free slide after the push is still a roll, and it dies
 * with `amp` as he slows — there is nothing to blend out of.
 *
 * Only Biggy. Voxxy and Droid are not balls, and a shoved Droid staying upright
 * and offended is the right picture for Droid.
 */
/**
 * HOLDING THE POT: both arms up and forward, hands together in front of the lid.
 *
 * Only the arms — he still walks, still leans into a turn, still takes the stairs;
 * a robot carrying something does not stop being a robot walking. The pose is
 * blended in and out on its own clock (`CARRY_ON`) so picking the pot up and
 * handing it over are moves rather than cuts, and it is applied AFTER the walk so
 * the arm swing does not fight it.
 *
 * The numbers are a two-handed carry at chest height: shoulders forward and up,
 * elbows bent, hands turned inwards to meet. What makes it a carry rather than a
 * shrug is that the renderer then puts the pot exactly where those hands ended up.
 */
function applyCarry(rig: RobotRig, st: GaitState, carrying: boolean, dt: number): void {
  st.hold += ((carrying ? 1 : 0) - st.hold) * (1 - Math.exp(-(carrying ? CARRY_ON : CARRY_OFF) * dt));
  const k = st.hold;
  if (k < 0.01) return;
  const b = rig.bones;
  for (const L of ['L', 'R'] as const) {
    const sh = b[`shoulder${L}`];
    sh.rotation.x += (-1.15 - sh.rotation.x) * k;
    sh.rotation.z += ((L === 'L' ? -0.5 : 0.5) - sh.rotation.z) * k;
    const up = b[`upperArm${L}`];
    if (up) up.rotation.x += (-0.25 - up.rotation.x) * k;
    const fore = b[`forearm${L}`];
    if (fore) fore.rotation.x += (-0.55 - fore.rotation.x) * k;
    const hand = b[`hand${L}`];
    if (hand) hand.rotation.z += ((L === 'L' ? -0.4 : 0.4) - hand.rotation.z) * k;
  }
}

/**
 * Pull Biggy's legs up inside his own gut, by `k` (0 standing, 1 fully balled up).
 *
 * One scale on each thigh, which carries the shin and the boot with it because
 * they hang off it: the whole leg shortens towards the hip joint, and the hip
 * joint is already inside the sphere. Written EVERY frame — including at 0, and
 * including while a party trick is playing — because the one thing a pose made of
 * scale cannot survive is a frame that forgets to set it.
 *
 * Only Biggy has a gut to hide them in; the other two keep their legs.
 */
function tuckLegs(rig: RobotRig, k: number): void {
  if (rig.kind !== 'biggy') return;
  const s = 1 - LEG_TUCK * Math.max(0, Math.min(1, k));
  rig.bones.thighL.scale.setScalar(s);
  rig.bones.thighR.scale.setScalar(s);
}

function applyShove(
  rig: RobotRig,
  st: GaitState,
  shoved: number,
  v: number,
  amp: number,
  dt: number,
  standH: number,
): void {
  if (rig.kind !== 'biggy') return;
  const pushed = shoved > 0.5;
  st.shove += ((pushed ? 1 : 0) - st.shove) * (1 - Math.exp(-(pushed ? SHOVE_ON : SHOVE_OFF) * dt));
  st.rollA = (st.rollA + (v * dt) / (rig.height * GUT_R_PER_H)) % TAU;
  const b = rig.bones;

  /*
   * THE ROLL PROPER — he tucks up and the whole ball turns.
   *
   * `st.roll` has already taken the walk out (`applyGait`), so there is no stride
   * to fight: the legs fold into the gut, the arms come in, and the body rotates
   * about the GUT'S OWN CENTRE rather than about the floor between his boots.
   * That distinction is the whole move. A rotation about the floor swings a robot
   * round a point like a falling tree; a rotation about the centre of a ball, with
   * the centre held one radius above the floor, IS rolling — and because `rollA`
   * is integrated from distance (`v dt / r`), the surface turns at exactly the
   * rate the floor goes past. No wheel slip, no animation on a timer.
   *
   * He also comes DOWN as he tucks: standing, the gut's centre is 0.735 m up and
   * the ball's radius is 0.602, so a ball actually resting on the floor sits
   * 13 cm lower than a ball carried on two legs. That drop is what sells the tuck.
   */
  if (st.roll > 0.01) {
    const k = st.roll;
    const gutC = rig.height * GUT_CY_PER_H;
    const gutR = rig.height * GUT_R_PER_H;
    // Legs in first: they are posed off the IK's own result, so blending toward
    // the tuck rather than setting it keeps the transition continuous.
    for (const L of ['L', 'R'] as const) {
      const thigh = b[`thigh${L}`];
      const shin = b[`shin${L}`];
      const foot = b[`foot${L}`];
      thigh.rotation.x += (-1.45 - thigh.rotation.x) * k;
      shin.rotation.x += (2.1 - shin.rotation.x) * k;
      foot.rotation.x += (0.5 - foot.rotation.x) * k;
      const hip = b[`hip${L}`];
      if (hip) hip.rotation.z += ((L === 'L' ? 0.35 : -0.35) - hip.rotation.z) * k;
      // ...and the stubby arms come in against the gut, out of the floor's way.
      const sh = b[`shoulder${L}`];
      sh.rotation.x += (-0.5 - sh.rotation.x) * k;
      sh.rotation.z += ((L === 'L' ? 0.45 : -0.45) - sh.rotation.z) * k;
    }
    /*
     * Down onto the ball, then the spin about its centre, which is `up` above the
     * pelvis joint: the gut's height off the sole less the pelvis's own.
     *
     * It used to be measured off `standH`, the hip's height over the ANKLE, which
     * is the leg's business and not the floor, and placed as if the pelvis were
     * upright when the walk's lean (it rises with speed) had tipped it forward. So
     * the pivot sat about 15 cm off the ball's real centre: the ball hopped 30 cm
     * off the floor every revolution, and the lid, which rides on top of it, came
     * away from it.
     */
    const up = gutC - (st.base.get(b.pelvis)?.py ?? st.hipRestY);
    rig.bones.pelvis.position.y -= (gutC - gutR) * k;
    // The centre as the pelvis holds it now, in the frame the pelvis hangs in.
    turnAboutX(b.pelvis, _gut.set(0, up, 0).applyEuler(b.pelvis.rotation).add(b.pelvis.position), st.rollA * k);
    /*
     * The lid keeps its head, mostly.
     *
     * A full counter-rotation would weld his face to the camera and lose the roll;
     * none at all tumbles him through a full revolution three times a second and
     * loses HIM. So the face rides round a little and comes back up (`LID_RIDE`),
     * once a revolution — recognisable beats precise (CLAUDE.md), and what has to
     * stay recognisable is the face.
     *
     * ...and it is turned back about the BALL'S centre, not its own. Michele,
     * 30 Sep 2026: *"when rolling now biggy's elmet seems detached"*. It was. The
     * lid used to be turned back 80% of the roll about the head's own pivot, and
     * that pivot sits on the neck, which goes round with the ball: the lid stayed
     * nearly upright while its base orbited the gut, standing out of the ball's
     * side at a quarter turn and sunk into its underside at a half — and when
     * `rollA` wrapped, the 80% wrapped with it and the lid jumped 72 degrees. Now
     * the collar and lid turn back about the gut's centre, the pivot the ball turns
     * on, so they stay seated on top and the ball turns under them.
     */
    const gutInTorso = _gut.set(0, up, 0).sub(b.torso.position).applyQuaternion(_turnQ.setFromEuler(b.torso.rotation).invert());
    turnAboutX(b.neck, gutInTorso, -st.rollA * k + LID_RIDE * k * Math.sin(st.rollA));
    // Rolling has no footfalls.
    if (k > 0.5) {
      st.contact[0] = false;
      st.contact[1] = false;
    }
  }

  const w = st.shove * amp * (1 - st.roll);
  if (w < 0.01) return;
  // Below the roll speed it is still the old weeble tip, which is what being
  // nudged looks like: a lean and a wobble, not a revolution.
  const th = Math.sin(st.rollA) * ROLL_TIP * w - PUSH_LAG * w;
  tipBiggy(rig, th, standH, 'x', 0);
  // The lid tries to stay level and fails by about half — the same half it fails
  // by in the flourish, because it is the same lid on the same ball.
  b.head.rotation.x -= 0.45 * th;
  // The stubby arms trail a beat behind the body rather than riding on it.
  for (const L of ['L', 'R'] as const) b[`shoulder${L}`].rotation.x -= 0.55 * th;
}

function applyFlairBody(rig: RobotRig, st: GaitState, f: number, standH: number): void {
  const b = rig.bones;
  if (rig.kind === 'droid') {
    const e = stretchE(f);
    for (const side of [1, -1] as const) {
      const L = side > 0 ? 'L' : 'R';
      // Negative on a shoulder lifts the arm forward and up; both go, and they go
      // OUT as well, because the long arms are what makes this Droid and not a
      // generic humanoid saluting.
      b[`shoulder${L}`].rotation.x -= 2.5 * e;
      b[`shoulder${L}`].rotation.z += side * 0.34 * e;
      b[`upperArm${L}`].rotation.x -= 0.18 * e;
      // The forearms fold back a little at the top: hands over the crown, not a
      // pair of flagpoles.
      b[`forearm${L}`].rotation.x += 0.4 * e;
      // Up on the toes, like the 'reach' pose.
      b[`foot${L}`].rotation.x += 0.22 * e;
    }
    b.torso.rotation.x -= 0.24 * e;
    b.neck.rotation.x -= 0.12 * e;
    b.head.rotation.x -= 0.26 * e;
    return;
  }
  if (rig.kind !== 'biggy') return;

  const roll = rollRad(f);
  tipBiggy(rig, roll, standH, 'z', st.footRest[0].x);
  for (const L of ['L', 'R'] as const) {
    // The body has already taken the arms round with it; this takes them back past
    // neutral, so they swing counter to the gut instead of riding on it.
    b[`shoulder${L}`].rotation.z -= 1.4 * roll;
    b[`upperArm${L}`].rotation.z -= 0.25 * roll;
  }
  // The lid tries to stay level, and fails by about half.
  b.head.rotation.z -= 0.45 * roll;
  b.torso.rotation.z -= 0.12 * roll;
  // Nothing is standing on anything: no footstep, no scuff (`footContact`).
  st.contact[0] = false;
  st.contact[1] = false;
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
