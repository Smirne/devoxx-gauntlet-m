/**
 * Robot physics — ported verbatim in behaviour from the prototype
 * `reference/poc/10-after-dark-kinepolis.html` (`mkBot`, `stepBot`, `circleRect`,
 * `botsCollide`, `pushBiggy`, `mount`).
 *
 * Parity with the prototype is the acceptance test (CLAUDE.md), so the order of
 * operations here matters as much as the numbers: the speed used for the stop-snap,
 * the heading update and the gait phase is the speed *before* the boost clamp, and
 * the position is integrated *before* walls are resolved. Changing that changes the
 * feel, and the frozen constants stop being meaningful.
 *
 * Headless: no DOM, no Three.js, no rendering concepts. Sim pixels and seconds.
 */

import {
  AIM_SETTLE,
  ANIM_DIV,
  BOOST_CAP_FACTOR,
  BOOST_DECAY,
  BRACED_MASS,
  DEFS,
  FACE_MIN_SPEED,
  JUMP_AIR,
  JUMP_COOLDOWN,
  MOUNT_BIGGY_MAX_SPEED,
  MOUNT_OFFSET_Y,
  MOUNT_REACH,
  PUSH_FLASH_COOLDOWN,
  PUSH_FORCE,
  PUSH_LEAN_MIN,
  PUSH_REACH,
  REST_BOT,
  REST_WALL_BIGGY,
  REST_WALL_OTHER,
  STOP_SNAP,
} from './constants';
import { m } from './units';
import type { Bot, Hit, Rect, RobotKind, Vec2, Wall } from './types';

/* ---------------------------------------------------------------- small helpers */

/** Current speed, px/s. */
export const speed = (b: Bot): number => Math.hypot(b.vx, b.vy);

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const inRect = (p: Vec2, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/* ---------------------------------------------------------------- construction */

/**
 * A robot at rest with its species' frozen identity copied in.
 *
 * The lamp is copied rather than shared: `DEFS` is deep-frozen, and a shared
 * reference would make any later write to `bot.light` throw instead of being a
 * harmless per-robot tweak. Every read path behaves exactly as the prototype's.
 */
export function mkBot(kind: RobotKind, x: number, y: number): Bot {
  const def = DEFS[kind];
  return {
    ...def,
    light: { ...def.light, c: [def.light.c[0], def.light.c[1], def.light.c[2]] },
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    face: 0,
    anim: 0,
    ix: 0,
    iy: 0,
    mounted: false,
    braced: false,
  };
}

/* ---------------------------------------------------------------- loose bodies */

/**
 * A pushable body that is not a robot: chapter 3's beer crates, its crowd, its
 * shuffleboard duck, and chapter 4's cake crate. It borrows `Bot` only so it can
 * reuse `stepBot` and `botsCollide`.
 *
 * It lived in `ch2-expo.ts` until 24 Sep 2026, because chapter 2 happened to be the
 * first chapter that needed one. When the booth minigames moved to chapter 3,
 * chapter 2 stopped using it and stopped being anything but an address — two other
 * chapters importing a physics helper across a chapter boundary from a chapter that
 * does not use it. It belongs here, with the step and the collision it exists to
 * borrow.
 *
 * `kind` is 'droid' and never read as an identity — the prototype gave these bodies
 * their own kinds ('duck', 'crate'), and the single place `stepBot` looks at `kind`
 * is the wall restitution, where anything that is not Biggy gets `REST_WALL_OTHER`.
 * 'droid' reproduces that exactly. They are never added to `ctx.bots`, so no lamp,
 * no mount and no player input ever reaches them.
 */
export function mkBody(name: string, x: number, y: number, over: Partial<Bot>): Bot {
  const b = mkBot('droid', x, y);
  b.name = name;
  b.tall = false;
  b.light = { c: [0, 0, 0], type: 'pool', range: 1 };
  return Object.assign(b, over);
}

/* ---------------------------------------------------------------- collision */

/**
 * Circle vs axis-aligned rectangle.
 *
 * Normal case: closest point on the rectangle, push out along the vector to it.
 * Deep case (centre inside the slab, so there is no closest-point direction):
 * fall back to the *shallowest* face, which is the one the robot came in through
 * for any step short enough that it could not cross the slab's midline — which is
 * what `DT_MAX` guarantees at every robot's top speed.
 */
export function circleRect(c: { x: number; y: number; r: number }, r: Rect): Hit | null {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
  const dx = c.x - cx;
  const dy = c.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= c.r) return null;
  if (d < 1e-6) {
    const l = c.x - r.x;
    const rr = r.x + r.w - c.x;
    const t = c.y - r.y;
    const bb = r.y + r.h - c.y;
    const m = Math.min(l, rr, t, bb);
    if (m === l) return { nx: -1, ny: 0, pen: l + c.r };
    if (m === rr) return { nx: 1, ny: 0, pen: rr + c.r };
    if (m === t) return { nx: 0, ny: -1, pen: t + c.r };
    return { nx: 0, ny: 1, pen: bb + c.r };
  }
  return { nx: dx / d, ny: dy / d, pen: c.r - d };
}

/* ------------------------------------------------------------- where it looks */

/**
 * Aim bookkeeping, one record per body.
 *
 * Kept in a `WeakMap` rather than on `Bot` because it is not game state: nothing
 * outside this file reads it, no snapshot carries it, and a body that falls out of
 * scope takes its record with it. It exists because "where the player aimed" is a
 * fact about the last few frames of input, and a single `face` number cannot hold
 * it.
 */
interface AimState {
  /** True once a stick has ever driven this body — crates and the crowd never are. */
  driven: boolean;
  /** The previous frame's raw stick, so a ragged release can be told from a turn. */
  sx: number;
  sy: number;
  /** Seconds a reduced stick has been held; -1 when nothing is being waited out. */
  settling: number;
  /** Since the stick let go: the slowest this body has been. */
  coast: number;
}

const AIMS = new WeakMap<Bot, AimState>();

function aimOf(b: Bot): AimState {
  let a = AIMS.get(b);
  if (!a) {
    a = { driven: false, sx: 0, sy: 0, settling: -1, coast: Infinity };
    AIMS.set(b, a);
  }
  return a;
}

/**
 * Did the stick only *drop* an axis — same signs on whatever is left, nothing new
 * pressed? That is the shape of a fumbled release (up-right becoming up), and the
 * only stick change this game does not believe immediately. See `AIM_SETTLE`.
 */
function isReduction(px: number, py: number, nx: number, ny: number): boolean {
  if ((px === 0 && py === 0) || (nx === 0 && ny === 0)) return false;
  const dropped = (px !== 0 && nx === 0) || (py !== 0 && ny === 0);
  const sameSigns =
    (nx === 0 || Math.sign(nx) === Math.sign(px)) && (ny === 0 || Math.sign(ny) === Math.sign(py));
  return dropped && sameSigns;
}

/**
 * Point the robot where the player pointed it, and leave it there.
 *
 * **Under the stick the heading IS the stick.** It used to be the velocity, which
 * is the same thing only when the robot is already up to speed: a tap from rest, or
 * a new direction taken at a run, spent its first frames pointing somewhere between
 * the old heading and the new one. Measured on the frozen constants, a one-frame
 * press of "down" while running east left Voxxy facing 64 deg off her stick and
 * Droid 82 deg off his — which is what "short press down" in Michele's chapter-1
 * notes describes. Deriving the heading from the stick instead of from the velocity
 * changes *what* the aim is read from; it retunes nothing, and `FACE_MIN_SPEED` is
 * frozen and still does the job it names below.
 *
 * **Off the stick the heading does not move.** The aim is what the lamp follows, so
 * a robot that has been let go has to hold the line the player left it on — and it
 * did not: a wall bounce reverses the normal component of the velocity, and every
 * one of the eight directions ended a chapter-1 run facing *exactly backwards* from
 * the stick that had been held, because the last few frames of the coast were the
 * rebound. Drive at the seat rows and let go, and the robot turned round to face up
 * the room. That is the other half of the complaint.
 *
 * **Unless the world is moving it.** Coasting only ever loses speed, so a body that
 * speeds up while nobody is steering it is being towed, shoved or knocked — and
 * then the old rule is the right one, and the heading follows the velocity again
 * until the next stick. That keeps a towed Biggy and a kicked crate pointing the
 * way they are actually travelling, which is what the renderer draws.
 */
function stepAim(b: Bot, dt: number, il: number, sp: number): void {
  const a = aimOf(b);
  if (il > 0) {
    if (b.ix !== a.sx || b.iy !== a.sy) {
      a.settling = isReduction(a.sx, a.sy, b.ix, b.iy) ? 0 : -1;
      a.sx = b.ix;
      a.sy = b.iy;
    }
    if (a.settling >= 0) {
      a.settling += dt;
      if (a.settling >= AIM_SETTLE) a.settling = -1;
    }
    if (a.settling < 0) b.face = Math.atan2(b.iy, b.ix);
    a.driven = true;
    a.coast = Infinity;
    return;
  }
  if (a.sx !== 0 || a.sy !== 0) {
    // The frame the stick let go: from here the coast can only slow down.
    a.sx = 0;
    a.sy = 0;
    a.settling = -1;
    a.coast = sp;
  }
  if (a.driven) {
    if (sp > a.coast + 1e-9) a.driven = false;
    else a.coast = Math.min(a.coast, sp);
  }
  if (!a.driven && sp > FACE_MIN_SPEED && (b.vx !== 0 || b.vy !== 0)) {
    b.face = Math.atan2(b.vy, b.vx);
  }
}

/* ---------------------------------------------------------------- integration */

/**
 * Advance one robot by `dt` and resolve it against `walls`.
 *
 * `onBlocked` is called once per wall that has a `why()` and was actually hit, so
 * the game layer can throttle and show the message in that robot's voice. `dt` is
 * expected to be clamped to `DT_MAX` by the caller (see `Game.update`).
 */
export function stepBot(b: Bot, dt: number, walls: Wall[], onBlocked?: (b: Bot, w: Wall) => void): void {
  // A mounted Droid is carried: Biggy's step moves it, `syncMount` places it.
  if (b.mounted) {
    b.vx = 0;
    b.vy = 0;
    return;
  }
  /*
   * Read the hop BEFORE it is spent, so the frame she comes down on is still a
   * frame in the air. She lands past the seat row rather than on top of it, which
   * is what a player who timed the jump right expects, and it costs the alternative
   * nothing: a hop that ends short leaves her overlapping the slab and the usual
   * push-out puts her back on the side she jumped from.
   */
  const airborne = (b.air ?? 0) > 0;
  if (b.air) b.air = Math.max(0, b.air - dt);
  if (b.hopRest) b.hopRest = Math.max(0, b.hopRest - dt);
  const il = Math.hypot(b.ix, b.iy);
  if (il > 0) {
    // Exponential approach to the stick's target velocity: frame-rate independent.
    const tx = (b.ix / il) * b.max;
    const ty = (b.iy / il) * b.max;
    const k = 1 - Math.exp(-b.accel * dt);
    b.vx += (tx - b.vx) * k;
    b.vy += (ty - b.vy) * k;
  } else {
    const k = Math.exp(-b.drag * dt);
    b.vx *= k;
    b.vy *= k;
  }
  // Pre-clamp speed: the stop-snap, the heading and the gait all read this one.
  const sp = Math.hypot(b.vx, b.vy);
  const cap = Math.max(b.max, b.boostCap ?? 0);
  if (sp > cap) {
    b.vx *= cap / sp;
    b.vy *= cap / sp;
  }
  b.boostCap = (b.boostCap ?? 0) * Math.exp(-BOOST_DECAY * dt);
  if (sp < STOP_SNAP && il === 0) {
    b.vx = 0;
    b.vy = 0;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (sp > FACE_MIN_SPEED) b.anim += (sp * dt) / ANIM_DIV;
  stepAim(b, dt, il, sp);
  for (const w of walls) {
    if (w.skipFor && w.skipFor(b)) continue;
    // Over the seat rows, the sponsor tables and the counters — the same `low` that
    // already lets light across, and uniformly 0.78 m of furniture she vaults rather
    // than clears (see `JUMP_RISE_M`). Everything else is still a wall in the air.
    if (airborne && w.low) continue;
    const hit = circleRect(b, w);
    if (!hit) continue;
    // Breakable doors consume the hit themselves (no push-out, no bounce).
    if (w.onHit && w.onHit(b, hit)) continue;
    b.x += hit.nx * hit.pen;
    b.y += hit.ny * hit.pen;
    const vn = b.vx * hit.nx + b.vy * hit.ny;
    if (vn < 0) {
      const rest = b.kind === 'biggy' ? REST_WALL_BIGGY : REST_WALL_OTHER;
      b.vx -= (1 + rest) * vn * hit.nx;
      b.vy -= (1 + rest) * vn * hit.ny;
    }
    if (w.why && onBlocked) onBlocked(b, w);
  }
}

/**
 * Resolve one robot-robot contact: positional correction split by mass, then a
 * restitution impulse. A braced robot has `BRACED_MASS`, so it neither moves nor
 * takes an impulse — that is what "planted" means in this game.
 *
 * Returns `{ rv }`, the closing speed that was resolved (0 when the pair was
 * already separating), or null when they are not touching.
 */
export function botsCollide(a: Bot, b: Bot, e: number = REST_BOT): { rv: number } | null {
  if (a.mounted || b.mounted) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (d >= min || d < 1e-6) return null;
  const nx = dx / d;
  const ny = dy / d;
  const pen = min - d;
  const ma = a.braced ? BRACED_MASS : a.mass;
  const mb = b.braced ? BRACED_MASS : b.mass;
  const tot = ma + mb;
  a.x -= (nx * pen * mb) / tot;
  a.y -= (ny * pen * mb) / tot;
  b.x += (nx * pen * ma) / tot;
  b.y += (ny * pen * ma) / tot;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv > 0) return { rv: 0 };
  const j = (-(1 + e) * rv) / (1 / ma + 1 / mb);
  if (!a.braced) {
    a.vx -= (j * nx) / ma;
    a.vy -= (j * ny) / ma;
  }
  if (!b.braced) {
    b.vx += (j * nx) / mb;
    b.vy += (j * ny) / mb;
  }
  return { rv: -rv };
}

/* ---------------------------------------------------------------- pushing Biggy */

/**
 * Voxxy or Droid leaning on Biggy adds a modest extra acceleration, so a long
 * straight push takes Biggy beyond his own top speed — the only way through the
 * roller door (`ROLLER_DOOR_SPEED` is above `DEFS.biggy.max` on purpose).
 *
 * The boost cap is raised to just above the speed achieved so `stepBot`'s clamp
 * cannot undercut the door check on the next frame, and it decays on its own.
 * `t` is sim seconds, used only to throttle the toast.
 */
export function pushBiggy(bots: Bot[], dt: number, t: number, flash: (s: string) => void): void {
  const bg = bots.find((b) => b.kind === 'biggy');
  if (!bg || bg.mounted) return;
  for (const p of bots) {
    if (p === bg || p.mounted || p.braced) continue;
    const dx = bg.x - p.x;
    const dy = bg.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    const nx = dx / d;
    const ny = dy / d;
    // How squarely the pusher's stick points at Biggy: a shove, not a graze.
    const lean = p.ix * nx + p.iy * ny;
    if (d < p.r + bg.r + PUSH_REACH && lean > PUSH_LEAN_MIN) {
      const F = PUSH_FORCE[p.kind];
      bg.vx += nx * lean * F * dt;
      bg.vy += ny * lean * F * dt;
      bg.boostCap = Math.max(bg.boostCap ?? 0, speed(bg) * BOOST_CAP_FACTOR);
      // The pusher gives up the momentum it just handed over, so it does not
      // clip through Biggy while he is still slower than it is.
      const bv = bg.vx * nx + bg.vy * ny;
      const pv = p.vx * nx + p.vy * ny;
      if (pv > bv) {
        p.vx -= (pv - bv) * nx * 0.5;
        p.vy -= (pv - bv) * ny * 0.5;
      }
      if (!bg.pushFlash || t - bg.pushFlash > PUSH_FLASH_COOLDOWN) {
        bg.pushFlash = t;
        flash(`${p.name} pushes Biggy — ${m(speed(bg)).toFixed(1)} m/s and climbing`);
      }
    }
  }
}

/* ---------------------------------------------------------------- Voxxy hops */

/** True while this body is off the floor. */
export const airborne = (b: Bot): boolean => (b.air ?? 0) > 0;

/**
 * Where a hop is in its arc, 0 on take-off to 1 on landing. 0 on the ground.
 *
 * The renderer's only input for drawing the jump: height is `JUMP_RISE_M * 4u(1-u)`,
 * which is the exact parabola of a body under constant gravity, so the arc on screen
 * is the arc the sim used and nothing about the hop is drawn twice.
 */
export const hopPhase = (b: Bot): number => (b.air ? 1 - b.air / JUMP_AIR : 0);

/**
 * Voxxy leaves the ground.
 *
 * Her verb, next to Droid's climb and Biggy's charge, and the one Michele asked for
 * on its own terms: *"just for one quiz. And for jumping around for fun."* Both
 * halves are here — over a seat row at a run, or on the spot because it is funny.
 * A foot on the furniture and over it, rather than a clean leap above it: see
 * `JUMP_RISE_M` for why that distinction is the honest one at her size.
 *
 * The other two say why not, in their own voices, because a gate that just does
 * nothing is the worst kind (CLAUDE.md, and the mount's own history). Their reasons
 * are also true: Droid is the one with the reach and the one thing he is no good at
 * is leaving the floor, and Biggy at 7 relative mass coming back down is an event.
 *
 * Returns true if she actually left the ground.
 */
export function jump(b: Bot, flash: (s: string) => void): boolean {
  if (b.kind === 'droid') {
    flash('Droid: "I go up by climbing, not by leaping. Ask the small one."');
    return false;
  }
  if (b.kind === 'biggy') {
    flash('Biggy: "I could. The floor would rather I did not."');
    return false;
  }
  if (b.mounted || b.braced) return false;
  if (airborne(b)) return false;
  if ((b.hopRest ?? 0) > 0) return false;
  b.air = JUMP_AIR;
  // Counted from take-off, so the gap on the ground is one airtime, not two.
  b.hopRest = JUMP_AIR + JUMP_COOLDOWN;
  return true;
}

/* ---------------------------------------------------------------- Droid rides Biggy */

/**
 * E next to a standing Biggy: Droid climbs on (taller lamp, wider pool, higher
 * reach) or climbs down again.
 *
 * Returns true when Droid is mounted after the call — the caller switches control
 * to Biggy then, because the tower moves as one robot (prototype: `cur = 2`).
 *
 * ## Why this stopped saying "Droid must be next to a standing Biggy"
 *
 * Michele, chapter 1: *"I had some trouble climbing on biggy (Droid must be next to
 * a standing biggy — the exact situation i was in)."* He was right, and the refusal
 * was right too, which is the worst combination a gate can manage: it named two
 * conditions, he met the one he could see, and it refused on the one he could not.
 *
 * Measured on the frozen constants. The reach is honest — the window is a 32 cm
 * shell of daylight around a body that is 1.44 m across, identical at all sixteen
 * angles tested, and Droid is inside it from the moment he touches Biggy. The speed
 * is where it goes wrong, and Droid does it to himself: **walking up to a parked
 * Biggy knocks him to 1.0 m/s**, which is 2.6 s of refusals before he is under
 * `MOUNT_BIGGY_MAX_SPEED` again — by which time he has rolled out of reach as
 * well. Driving Biggy anywhere first is worse: 7.0 s from his top speed, because
 * his 0.35 s^-1 drag is the lowest in the game and he coasts long after he looks
 * stopped.
 *
 * So there are three answers now instead of one, and each says the thing that is
 * actually wrong. And the middle one does something about it: a Droid with a hand
 * on a slowly rolling Biggy **plants his feet and stops him**, which is the same
 * `braced`-robot idea the rest of the game already runs on, costs a second press
 * rather than a wait, and leaves the frozen gate exactly where it was — a moving
 * Biggy is still not climbable. It is capped at Droid's own top speed: he can only
 * catch what he could have kept up with.
 */
export function toggleMount(bots: Bot[], flash: (s: string) => void): boolean {
  const d = bots.find((b) => b.kind === 'droid');
  const bg = bots.find((b) => b.kind === 'biggy');
  if (!d || !bg) return false;
  if (d.mounted) {
    d.mounted = false;
    d.x = bg.x - bg.r - d.r - 2;
    d.y = bg.y;
    flash('Droid climbs down');
    return false;
  }
  const gap = dist(d, bg) - d.r - bg.r;
  if (gap >= MOUNT_REACH) {
    flash(
      `Droid: ${m(gap).toFixed(1)} m of daylight. I climb with a hand on his shoulder — come round beside him`,
    );
    return false;
  }
  const sp = speed(bg);
  if (sp >= MOUNT_BIGGY_MAX_SPEED) {
    if (sp < DEFS.droid.max) {
      bg.vx = 0;
      bg.vy = 0;
      bg.boostCap = 0;
      flash(`Droid: still rolling at ${m(sp).toFixed(1)} m/s. Planting my feet — there. Again, and I am up`);
      return false;
    }
    flash(`Droid: he is doing ${m(sp).toFixed(1)} m/s. I cannot catch that, never mind climb it — let him run down`);
    return false;
  }
  d.mounted = true;
  flash('Droid climbs onto Biggy — taller lamp, wider pool, higher reach');
  return true;
}

/** Keep a mounted Droid glued to Biggy's shoulders. Call once per step, after `stepBot`. */
export function syncMount(bots: Bot[]): void {
  const d = bots.find((b) => b.kind === 'droid');
  const bg = bots.find((b) => b.kind === 'biggy');
  if (!d || !bg || !d.mounted) return;
  d.x = bg.x;
  d.y = bg.y - MOUNT_OFFSET_Y;
  d.face = bg.face;
}
