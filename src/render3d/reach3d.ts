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

/** A point on the floor, world metres: `x` east, `z` south (the sim's y). */
export interface Spot {
  x: number;
  z: number;
}

/** A handle a hand can take: its grip point, and how to put it at a travel `k`. */
export interface Grip {
  /** The point the palm closes on. Its world position is read every frame. */
  point: THREE.Object3D;
  /** Pose the handle at travel `k` (0 home .. 1 thrown). */
  set(k: number): void;
  /** Which way the handle travels — the body pulls down into one, pushes up into the other. */
  throw: 'down' | 'up';
  /** The furthest a standing Droid walks to this one, m. `STEP_MAX` unless the prop says otherwise. */
  walk?: number;
}

const grips = new Map<string, Grip>();

/**
 * One reach in progress. `s` runs from `-lead`: a standing Droid who pressed E
 * from further off than his arm walks up to the handle first — from `from`, or
 * from wherever the sim has him, to `to` — and back to where the sim has him
 * afterwards, over `back`. The handle does not move until his hand is on it, so
 * the lead only delays the picture; nothing in the sim waits on it (the chapter-1
 * lever, whose door does wait, is thrown from Biggy's shoulders with no walk:
 * lead 0).
 *
 * The two ends are PLACES, not an offset from where the sim has him. It used to
 * be an offset (`step`), added to the sim's position every frame, so a Droid still
 * coasting when E went down was drawn arriving as far past the handle as the sim
 * carried him — into the wall, in chapter 2. Now the walk up starts where he
 * actually is, ends at the handle whatever the sim does meanwhile, and the walk
 * back ends where the sim has him at that moment.
 */
export interface Reach {
  id: string;
  /** Seconds since the hand set off; negative while he is still walking up. */
  s: number;
  /** The walk up, s. 0: he does not walk. */
  lead: number;
  /** The walk back, s. 0: there is none — or the next handle in the queue takes over from where he stands. */
  back: number;
  /** Where the walk up starts. null: where the sim has him, read live. */
  from: Spot | null;
  /** Where he stands for this handle. null: where the sim has him (no walk). */
  to: Spot | null;
  /** Where the sim had him when this run of handles began; see `slipped`. */
  anchor: Spot | null;
}
let active: Reach | null = null;
/**
 * Handles whose hand is still to come, in order — pressed while another was in
 * his hand. Michele, 29 Sep 2026, on chapter 2's breakers: *"i see no
 * animation."* Three presses used to be three `startReach`es, each replacing the
 * last: the handle he was on snapped up untouched, the drawn Droid jumped back to
 * where the sim had him to start the walk again, and only the third handle was
 * ever pulled. Now every press is a pull of its own, taken in turn.
 */
const queue: Array<{ id: string; walk: boolean }> = [];

/** How close a standing Droid comes to the handle's foot, m (root to grip, level). */
export const STAND_OFF = 0.6;
/** His walk up to it, m/s on average — the deliberate one's stride, not a dash. */
export const STEP_SPEED = 1.2;
/**
 * The furthest he will walk to a handle, m — a couple of his strides.
 *
 * It was 3.5, which was what chapter 2's 52 px breaker reach needed and which
 * still fell short of it from the back of that zone: his hand stopped in the air,
 * a metre off the handle it was supposed to be pulling. Since 29 Sep the sim puts
 * him at the board to throw them at all (`PANEL_REACH` in `ch2-expo.ts`), and the
 * longest walk from anywhere inside that to any of the three handles is 2.0 m, so
 * he always ends it within arm's length — `tests/reach3d.test.ts` sweeps the zone
 * to keep it so. A prop whose own reach is longer says so on its grip
 * (`Grip.walk`): chapter 3's ladle does.
 */
export const STEP_MAX = 2;
/** When the walk back starts, s: while the arm is still on its way down. */
export const WALK_BACK = REACH_END - 0.3;
/**
 * How far the sim may carry him from where the run began before the hand gives
 * up, m (see `slipped`).
 *
 * It used to be a SPEED: over 0.3 m/s and the reach was cancelled, on the frame it
 * started as much as any other. Droid is deliberate — drag 7 s⁻¹ from a top speed
 * of 2.3 m/s — so a player who let go of the stick and pressed E in one movement
 * was still rolling at more than that, and the hand was dropped before it had
 * left his side: no reach, and a handle that went up on its own. Distance is the
 * right measure because it is what the picture has to hide. Coasting to a stop
 * from full speed covers 0.33 m, and the reach carries on; walking off covers
 * this in a quarter of a second, and it does not.
 */
export const REACH_SLIP = 0.6;

/**
 * Where a standing robot at `from` stands to take a grip at `grip` (world metres),
 * and how long the walk there takes: `STAND_OFF` short of it, along the line he
 * approaches on — so the walk heads at the handle and he arrives facing it. Null
 * when he is near enough already.
 */
export function stepFor(from: Spot, grip: Spot, max = STEP_MAX): { lead: number; to: Spot | null } {
  const dx = grip.x - from.x;
  const dz = grip.z - from.z;
  const d = Math.hypot(dx, dz);
  const need = Math.min(max, d - STAND_OFF);
  if (need < 0.15) return { lead: 0, to: null };
  return { lead: need / STEP_SPEED, to: { x: from.x + (dx / d) * need, z: from.z + (dz / d) * need } };
}

/**
 * Where the drawn body stands `s` into reach `r` (its own clock unless asked
 * about another moment), with the sim holding him at `sim`: on his way from
 * `from` (or from the sim) to `to` during the lead, at `to` through the reach,
 * and on his way back to the sim over `back` at the end. Pure: the same answer
 * for the same numbers, whatever else is running.
 */
export function walkAt(r: Reach, sim: Spot, out: Spot = { x: 0, z: 0 }, s = r.s): Spot {
  const to = r.to;
  let base = sim;
  let k = 0;
  if (to && s < 0) {
    base = r.from ?? sim;
    k = r.lead > 0 ? ss(s, -r.lead, 0) : 1;
  } else if (to) {
    k = r.back > 0 ? 1 - ss(s, WALK_BACK, WALK_BACK + r.back) : 1;
  }
  out.x = base.x + ((to?.x ?? base.x) - base.x) * k;
  out.z = base.z + ((to?.z ?? base.z) - base.z) * k;
  return out;
}

/** When a reach with this walk back is over, s. */
export const reachEnd = (back: number): number => Math.max(REACH_END, WALK_BACK + back);

/**
 * Has the sim carried him away from where the run began? More than `REACH_SLIP`
 * and the picture can no longer pretend he is standing at the handle. Only a
 * standing Droid has an anchor: on Biggy's shoulders he is carried, not driven
 * off, and the hand stays on its handle wherever the tower goes.
 */
export function slipped(r: Reach, sim: Spot): boolean {
  return r.anchor !== null && Math.hypot(sim.x - r.anchor.x, sim.z - r.anchor.z) > REACH_SLIP;
}

/** A prop announces a handle ('lever', 'breaker0'..). Rebuilding the prop replaces it. */
export function registerGrip(id: string, g: Grip): void {
  grips.set(id, g);
}
export function gripOf(id: string): Grip | undefined {
  return grips.get(id);
}

const _g = new THREE.Vector3();

/**
 * Set the hand off for `id`. `at` is where the sim has him, or null when that is
 * not known; `from`, where the drawn body is when that is somewhere else (at the
 * last handle, in a queue). Without `walk` he reaches from where he is — Biggy's
 * shoulders — and the lead is 0.
 */
function begin(id: string, at: Spot | null, walk: boolean, from: Spot | null, anchor: Spot | null): void {
  const start = from ?? at;
  const g = grips.get(id);
  let lead = 0;
  let to: Spot | null = from;
  if (walk && start && g) {
    g.point.getWorldPosition(_g);
    const w = stepFor(start, { x: _g.x, z: _g.z }, g.walk);
    if (w.to) {
      lead = w.lead;
      to = w.to;
    }
  }
  const home = at ?? start;
  const back = to && home ? Math.hypot(to.x - home.x, to.z - home.z) / STEP_SPEED : 0;
  active = { id, s: -lead, lead, back, from, to, anchor };
}

/**
 * The sim's edge arrived: the hand sets off for `id`, from a Droid the sim has at
 * `at` (world metres; he walks up to it if `walk` and it is out of arm's length).
 * A new reach replaces a running one, and anything queued behind it.
 */
export function startReach(id: string, at: Spot | null = null, walk = true): void {
  queue.length = 0;
  begin(id, at, walk, null, walk ? at : null);
}
/**
 * The same, for a hand that may be busy: set off now if it is free, or taken in
 * turn once the running reach is over. The chapter-2 breakers come this way.
 */
export function queueReach(id: string, at: Spot | null = null, walk = true): void {
  if (active) queue.push({ id, walk });
  else begin(id, at, walk, null, walk ? at : null);
}
/**
 * Advance the one clock. Called once a frame, before the robots and the props
 * read it, with where the sim has Droid (`at`) for the next handle in the queue.
 *
 * With a handle waiting he does not walk back: the next one starts from the
 * handle he is at, a step to the side at most. A press that comes once the walk
 * back has begun lets him finish it, and walks him up again from where the sim
 * has him — never a jump from one to the other.
 */
export function tickReach(dt: number, at: Spot | null = null): void {
  const r = active;
  if (!r) return;
  if (queue.length > 0 && r.s < WALK_BACK) r.back = 0;
  r.s += dt;
  if (r.s < reachEnd(r.back)) return;
  active = null;
  const next = queue.shift();
  if (next) begin(next.id, at, next.walk, r.back === 0 ? r.to : null, r.anchor ?? (next.walk ? at : null));
}
/** The running reach, if any. */
export function activeReach(): Reach | null {
  return active;
}
/**
 * Seconds into the reach on `id` (negative while he walks up), or null when no
 * hand is on its way to it. A handle queued behind the running one reads
 * -Infinity: its hand is coming but has not set off, so everything keyed on its
 * clock — the pull, the strike — is still to happen.
 */
export function reachClock(id: string): number | null {
  if (active && active.id === id) return active.s;
  return queue.some((q) => q.id === id) ? -Infinity : null;
}
/** Drop the hand, and every handle still waiting for it. */
export function cancelReach(): void {
  active = null;
  queue.length = 0;
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
  return solveArm(rig, 'R', target, wShoulder, wElbow, fold);
}

/**
 * `solveArmR` for either arm. The left one is the same chain with its elbow
 * hanging out to HIS left: the pole is mirrored across his own centre line, and
 * nothing else about the solve is handed — both forearms hinge the same way
 * (`applyCarry` in gait.ts bends them with the same sign).
 */
export function solveArm(rig: RobotRig, side: 'L' | 'R', target: THREE.Vector3, wShoulder: number, wElbow: number, fold = 0): number {
  const b = rig.bones;
  const up = b[`upperArm${side}`];
  const fore = b[`forearm${side}`];
  const hand = b[`hand${side}`];
  rig.root.updateMatrixWorld(true);
  up.getWorldPosition(_S);
  fore.getWorldPosition(_E0);
  hand.getWorldPosition(_H0);
  const a = _S.distanceTo(_E0);
  const fl = _H0.distanceTo(_E0);
  const c = fl + (PALM * fl) / hand.position.length();

  _n.copy(target).sub(_S);
  const d = _n.length();
  _n.divideScalar(Math.max(d, 1e-6));
  const dc = clamp(d, Math.abs(a - c) + 1e-3, (a + c) * 0.999);

  // The pole: down, out to his side (-x in rig space is his right) and a touch back.
  rig.root.getWorldQuaternion(_rq);
  _p.set(side === 'R' ? -0.55 : 0.55, -1, -0.2).applyQuaternion(_rq);
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

/* ------------------------------------------------- a letter in both hands ---- */

/**
 * How far either side of a carried letter's middle each hand holds it, m — the
 * gait's own carry pose, measured (hands at +0.053 / -0.038 across his front).
 */
const HOLD_SPREAD = 0.045;
const _hold = new THREE.Vector3();
const _hand = new THREE.Vector3();

/**
 * Droid's two hands ON the #DEVOXX letter he is carrying, wherever the sim says
 * it is: `centre` is the letter's middle (world metres; its height is ignored)
 * and `face` the sim heading it faces. Each palm goes to the letter's own plane, a
 * hand's spread either side of its middle, at the height the gait's carry put
 * that hand; `k` blends it over the gait's canned carry.
 *
 * Michele, 29 Sep 2026: *"letters (and droid's arm) through the wall"*. The carry
 * was a canned pose with the letter hung off wherever its hands ended up — 0.89 m
 * out, 0.39 m past everything the sim collides with. The sim now says where the
 * letter is and keeps it out of the walls (`carryPoint`, src/sim/letters.ts), and
 * this brings the hands to it rather than it to the hands, so no arm can reach
 * further than the letter it is holding. Returns the worse hand's shortfall, m.
 */
export function holdLetter(rig: RobotRig, centre: THREE.Vector3, face: number, k: number): number {
  const nx = -Math.sin(face);
  const nz = Math.cos(face);
  let short = 0;
  for (const side of ['L', 'R'] as const) {
    rig.root.updateMatrixWorld(true);
    rig.bones[`hand${side}`].getWorldPosition(_hand);
    const s = side === 'L' ? HOLD_SPREAD : -HOLD_SPREAD;
    _hold.set(centre.x + nx * s, _hand.y, centre.z + nz * s);
    short = Math.max(short, solveArm(rig, side, _hold, k, k));
  }
  return short;
}

/** `palmWorld` for either hand. */
export function palmOf(rig: RobotRig, side: 'L' | 'R', out = new THREE.Vector3()): THREE.Vector3 {
  const b = rig.bones;
  rig.root.updateMatrixWorld(true);
  b[`forearm${side}`].getWorldPosition(_E0);
  b[`hand${side}`].getWorldPosition(out);
  const fore = out.distanceTo(_E0);
  const palm = (PALM * fore) / b[`hand${side}`].position.length();
  return out.add(_f.copy(out).sub(_E0).normalize().multiplyScalar(palm));
}
