/**
 * reach3d.ts — Droid's hand on a lever: one clock for the arm and the handle.
 *
 * Michele, 29 Sep 2026: *"Droid's animation while using levers / breaker still
 * need improvement. He should reach the lever and pull it, with more natural
 * movements."* The arm used to be a canned pose (the gait's `reach`: right arm up
 * at a fixed 2.25 rad) pitched roughly toward the target, and the handle moved on
 * a clock of its own that the prop kept — so the hand waved in the lever's
 * direction and the lever flipped by itself a beat later, a hand's length away.
 *
 * Now both read ONE clock, started on the sim's own edge (the panel going 'done',
 * a breaker count going up) and run in the renderer only:
 *
 *   0.00 ..      turn to face the handle, look at it
 *   0.04 .. 0.50 the arm comes up on an arc in front of him — the shoulder lifts
 *                it, the elbow tucked on the way and opening as it arrives
 *   0.50         the hand is ON the handle (two-bone IK to the handle's real
 *                world position, off the prop's own grip object), fingers close
 *   0.50 .. 0.75 THE PULL: the handle turns on its pivot, and because the IK is
 *                solved every frame against the moving grip, the hand goes with
 *                it; the body leans into it
 *   0.75         home — `LEVER_REACH_TIME` in ch1-night.ts, the moment the sim
 *                lets cinema B's door start to swing. Same number, imported.
 *   0.86 .. 1.35 let go: fingers open, the elbow folds the hand off the handle,
 *                and the arm comes back down the same arc as the body settles
 *
 * Nothing here is game state. The sim decided the lever is thrown on the key
 * press (and chapter 2's breaker count went up on it); this is the 1.35 s of
 * picture that goes with it, and it never feeds anything back.
 */

import * as THREE from 'three';

import { LEVER_REACH_TIME } from '../sim/chapters/ch1-night';
import type { RobotRig } from '../render/robots';

const ss = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;

/** The hand closes on the handle, s after the sim's edge. */
export const GRIP_AT = 0.5;
/** The handle is home. The sim's own number: the door waits exactly this long. */
export const PULL_END = LEVER_REACH_TIME;
/** The fingers start to open. */
export const LET_GO = 0.86;
/** The arm is back at his side. */
export const REACH_END = 1.35;

/** Every weight the reach is made of, at one instant. All 0..1 except `fold`. */
export interface ReachWeights {
  /** Body turned to face the handle. */
  face: number;
  /** How much of the arm the IK has (0 = the gait's own arm). In fast, out at the very end. */
  arm: number;
  /**
   * Where the palm is along its path, 0 at his side .. 1 on the handle. The path
   * is an arc (`reachPath`): the hand comes up in front of him and over, rather
   * than straight through the air or up past the handle and back down.
   */
  travel: number;
  /** Extra elbow fold, radians: the arm tucks on the way up and pulls off the handle. 0 while gripping. */
  fold: number;
  /** Fingers closed. */
  grip: number;
  /** How far the handle has travelled, 0 up/shut .. 1 thrown. */
  pull: number;
  /** Lean and weight shift toward the handle. */
  body: number;
  /** The pull's own body effort — rises with the pull, fades on the let-go. */
  effort: number;
}

/** Where every part of the reach is, `s` seconds after the sim's edge. */
export function reachWeights(s: number): ReachWeights {
  const off = (a: number, b: number): number => 1 - ss(s, a, b);
  const up = clamp((s - 0.04) / (GRIP_AT - 0.04), 0, 1);
  const release = clamp((s - LET_GO) / 0.26, 0, 1);
  const pull = ss(s, GRIP_AT, PULL_END);
  return {
    face: ss(s, 0, 0.28) * off(1.0, REACH_END),
    arm: ss(s, 0, 0.1) * off(REACH_END - 0.12, REACH_END),
    travel: s < LET_GO ? ss(s, 0.04, GRIP_AT) : off(LET_GO + 0.04, REACH_END - 0.13),
    fold: 0.45 * Math.sin(Math.PI * up) * (s < GRIP_AT ? 1 : 0) + 0.5 * Math.sin(Math.PI * release),
    grip: ss(s, 0.4, GRIP_AT) * off(LET_GO, 0.96),
    pull,
    body: ss(s, 0, 0.45) * off(0.95, REACH_END),
    effort: pull * off(0.9, 1.3),
  };
}

const _c = new THREE.Vector3();
const _fw = new THREE.Vector3();
/**
 * The palm's path from `rest` (where the gait holds it) to `grip`, at `t`: a
 * quadratic arc bowed forward and out to his right, so the hand swings up in
 * front of the body the way a shoulder carries it, and arrives on the handle
 * from below and in front rather than dropping onto it from above.
 */
export function reachPath(rig: RobotRig, rest: THREE.Vector3, grip: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  rig.root.getWorldQuaternion(_rq);
  _fw.set(-0.35, 0, 1).applyQuaternion(_rq);
  const span = rest.distanceTo(grip);
  _c.copy(rest).lerp(grip, 0.5).addScaledVector(_fw, 0.3 * span);
  _c.y = Math.min(_c.y, grip.y);
  const u = 1 - t;
  return out
    .copy(rest)
    .multiplyScalar(u * u)
    .addScaledVector(_c, 2 * u * t)
    .addScaledVector(grip, t * t);
}

/** The handle's travel alone: what the prop turns by. Same curve as `reachWeights().pull`. */
export const pullAt = (s: number): number => ss(s, GRIP_AT, PULL_END);

/**
 * The standing body's share, for the gait (`GaitParams.body`): up a little and
 * leaning in as the arm goes up, then up on the toes into a handle that throws
 * upward, or down into one that comes down. Before the legs, so the feet stay put.
 */
export function reachBody(s: number, dir: 'down' | 'up'): { rise: number; pitch: number } {
  const w = reachWeights(s);
  return {
    rise: 0.03 * w.body + (dir === 'up' ? 0.035 : -0.04) * w.effort,
    pitch: 0.06 * w.body + (dir === 'up' ? -0.03 : 0.08) * w.effort,
  };
}

/* ------------------------------------------------------ the shared clock ---- */

/** A handle a hand can take: its grip point, and how to put it at a travel `k`. */
export interface Grip {
  /** The point the palm closes on. Its world position is read every frame. */
  point: THREE.Object3D;
  /** Pose the handle at travel `k` (0 home .. 1 thrown). */
  set(k: number): void;
  /** Which way the handle travels — the body pulls down into one, pushes up into the other. */
  throw: 'down' | 'up';
}

const grips = new Map<string, Grip>();

/**
 * One reach in progress. `s` runs from `-lead`: a standing Droid who pressed E
 * from further off than his arm walks up to the handle first (`step`, world
 * metres, the whole way) and back to where the sim has him afterwards. The
 * handle does not move until his hand is on it, so the lead only delays the
 * picture; nothing in the sim waits on it (the chapter-1 lever, whose door does
 * wait, is thrown from Biggy's shoulders with no walk: lead 0).
 */
export interface Reach {
  id: string;
  s: number;
  lead: number;
  step: { x: number; z: number };
}
let active: Reach | null = null;

/** How close a standing Droid comes to the handle's foot, m (root to grip, level). */
export const STAND_OFF = 0.6;
/** His walk up to it, m/s on average — the deliberate one's stride, not a dash. */
export const STEP_SPEED = 1.2;
/** The furthest he will walk to a handle, m. */
export const STEP_MAX = 3.5;

/** The walk-up for a standing robot at `from` to a grip at `to` (world metres). */
export function stepFor(from: { x: number; z: number }, to: { x: number; z: number }): { lead: number; step: { x: number; z: number } } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  const need = Math.min(STEP_MAX, d - STAND_OFF);
  if (need < 0.15) return { lead: 0, step: { x: 0, z: 0 } };
  return { lead: need / STEP_SPEED, step: { x: (dx / d) * need, z: (dz / d) * need } };
}

/** How far along the walk-up the body is at `s`: 0 where the sim has him, 1 at the handle. */
export function stepAt(s: number, lead: number): number {
  if (lead <= 0) return 0;
  const back = REACH_END - 0.3;
  return ss(s, -lead, 0) * (1 - ss(s, back, back + lead));
}

/** When a reach with this lead is over, s. */
export const reachEnd = (lead: number): number => Math.max(REACH_END, REACH_END - 0.3 + lead);

/** A prop announces a handle ('lever', 'breaker0'..). Rebuilding the prop replaces it. */
export function registerGrip(id: string, g: Grip): void {
  grips.set(id, g);
}
export function gripOf(id: string): Grip | undefined {
  return grips.get(id);
}
/** The sim's edge arrived: the hand sets off for `id`. A new reach replaces a running one. */
export function startReach(id: string, lead = 0, step = { x: 0, z: 0 }): void {
  active = { id, s: -lead, lead, step };
}
/** Advance the one clock. Called once a frame, before the robots and the props read it. */
export function tickReach(dt: number): void {
  if (!active) return;
  active.s += dt;
  if (active.s >= reachEnd(active.lead)) active = null;
}
/** The running reach, if any. */
export function activeReach(): Reach | null {
  return active;
}
/** Seconds into the reach on `id` (negative while he walks up), or null when no hand is on its way to it. */
export function reachClock(id: string): number | null {
  return active && active.id === id ? active.s : null;
}
export function cancelReach(): void {
  active = null;
}

/* ------------------------------------------------------------ the arm IK ---- */

/**
 * The palm's grip point past the hand joint, in the rig's own units: the palm
 * box is centred 0.058 below the wrist and 0.1 long (droid.ts), so the handle
 * sits in the middle of the fingers' root.
 */
const PALM = 0.075;

const _S = new THREE.Vector3();
const _E0 = new THREE.Vector3();
const _H0 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _E = new THREE.Vector3();
const _H = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _f = new THREE.Vector3();
const _rq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _q0 = new THREE.Quaternion();
const _M = new THREE.Matrix4();

/** Upper arm + forearm + palm reach of the right arm, world metres. */
export function armReach(rig: RobotRig): number {
  const b = rig.bones;
  rig.root.updateMatrixWorld(true);
  b.upperArmR.getWorldPosition(_S);
  b.forearmR.getWorldPosition(_E0);
  b.handR.getWorldPosition(_H0);
  const fore = _H0.distanceTo(_E0);
  return _S.distanceTo(_E0) + fore + (PALM * fore) / b.handR.position.length();
}

/** Where the palm's grip point is now, world metres. */
export function palmWorld(rig: RobotRig, out = new THREE.Vector3()): THREE.Vector3 {
  const b = rig.bones;
  rig.root.updateMatrixWorld(true);
  b.forearmR.getWorldPosition(_E0);
  b.handR.getWorldPosition(out);
  const fore = out.distanceTo(_E0);
  const palm = (PALM * fore) / b.handR.position.length();
  return out.add(_f.copy(out).sub(_E0).normalize().multiplyScalar(palm));
}

/**
 * Two-bone IK for Droid's right arm: put the palm on `target` (world metres),
 * blended in from whatever the gait left — `wShoulder` for the upper arm,
 * `wElbow` for the forearm, and `fold` radians of extra elbow bend on top.
 *
 * The elbow hangs down and out, the way a long arm reaching above the head
 * carries it, so the bend never flips as the handle moves. Out of reach, the
 * arm points straight at the handle at full stretch. Returns the shortfall,
 * metres (0 when the palm can get there).
 */
export function solveArmR(rig: RobotRig, target: THREE.Vector3, wShoulder: number, wElbow: number, fold = 0): number {
  const b = rig.bones;
  const up = b.upperArmR;
  const fore = b.forearmR;
  rig.root.updateMatrixWorld(true);
  up.getWorldPosition(_S);
  fore.getWorldPosition(_E0);
  b.handR.getWorldPosition(_H0);
  const a = _S.distanceTo(_E0);
  const fl = _H0.distanceTo(_E0);
  const c = fl + (PALM * fl) / b.handR.position.length();

  _n.copy(target).sub(_S);
  const d = _n.length();
  _n.divideScalar(Math.max(d, 1e-6));
  const dc = clamp(d, Math.abs(a - c) + 1e-3, (a + c) * 0.999);

  // The pole: down, out to his right (-x in rig space) and a touch back.
  rig.root.getWorldQuaternion(_rq);
  _p.set(-0.55, -1, -0.2).applyQuaternion(_rq);
  _p.addScaledVector(_n, -_p.dot(_n));
  if (_p.lengthSq() < 1e-8) _p.set(0, -1, 0);
  _p.normalize();

  const cosA = clamp((a * a + dc * dc - c * c) / (2 * a * dc), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _E.copy(_S).addScaledVector(_n, a * cosA).addScaledVector(_p, a * sinA);
  _H.copy(_S).addScaledVector(_n, dc);

  // The upper arm's world frame: +y from the elbow up to the shoulder, +z toward
  // the hand's side of the bend (the forearm hinges about x, forward is -rotation.x).
  _y.copy(_S).sub(_E).normalize();
  _f.copy(_H).sub(_E).normalize();
  _z.copy(_f).addScaledVector(_y, -_f.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).applyQuaternion(_rq).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _M.makeBasis(_x, _y, _z);
  _qw.setFromRotationMatrix(_M);
  up.parent!.getWorldQuaternion(_pq);
  _qw.premultiply(_pq.invert());
  const theta = Math.acos(clamp(-_y.dot(_f), -1, 1));

  _q0.copy(up.quaternion);
  up.quaternion.copy(_q0).slerp(_qw, clamp(wShoulder, 0, 1));
  fore.rotation.x = THREE.MathUtils.lerp(fore.rotation.x, -theta, clamp(wElbow, 0, 1)) - fold;
  return Math.max(0, d - (a + c) * 0.999);
}
