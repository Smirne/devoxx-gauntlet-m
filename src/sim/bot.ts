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
  ANIM_DIV,
  BOOST_CAP_FACTOR,
  BOOST_DECAY,
  BRACED_MASS,
  DEFS,
  FACE_MIN_SPEED,
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
  if (sp > FACE_MIN_SPEED && (b.vx !== 0 || b.vy !== 0)) {
    b.face = Math.atan2(b.vy, b.vx);
    b.anim += (sp * dt) / ANIM_DIV;
  }
  for (const w of walls) {
    if (w.skipFor && w.skipFor(b)) continue;
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
        flash(`${p.name} pushes Biggy — ${Math.trunc(speed(bg))} px/s and climbing`);
      }
    }
  }
}

/* ---------------------------------------------------------------- Droid rides Biggy */

/**
 * E next to a standing Biggy: Droid climbs on (taller lamp, wider pool, higher
 * reach) or climbs down again.
 *
 * Returns true when Droid is mounted after the call — the caller switches control
 * to Biggy then, because the tower moves as one robot (prototype: `cur = 2`).
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
  if (dist(d, bg) < d.r + bg.r + MOUNT_REACH && speed(bg) < MOUNT_BIGGY_MAX_SPEED) {
    d.mounted = true;
    flash('Droid climbs onto Biggy — taller lamp, wider pool, higher reach');
    return true;
  }
  flash('Droid must be next to a standing Biggy');
  return false;
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
