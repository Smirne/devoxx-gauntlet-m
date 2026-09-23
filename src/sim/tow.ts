/**
 * The tow bar — Voxxy or Droid takes hold of Biggy and steers him.
 *
 * ## Why this exists
 *
 * `pushBiggy()` in `bot.ts` is the incidental shove: lean on him and he drifts
 * that way. It is right for chapters where nudging Biggy is flavour, and it is
 * hopeless when a chapter actually *requires* a straight run — Michele, playing
 * chapter 2: *"pushing biggy is really really hard, It tends to go sideways, and
 * hitting a good speed is a very hard task."*
 *
 * That is not a tuning problem. A free push applies force along whatever line
 * joins the two robots at that instant, so the tiniest misalignment steers him,
 * and the error compounds over the run-up. No value of `PUSH_FORCE` fixes it.
 *
 * The fix is a different verb, and the shape of it is not ours: the same problem
 * was met and solved in `welldsagl/devoxx-game-experiments`, a parallel 2D port
 * of the same prototype, and Michele handed the design over rather than have us
 * rediscover it. What follows is that design, reimplemented against our sim and
 * our own constants.
 *
 * ## The design
 *
 * Grabbing snaps the pair into a rigid bar pointing along one of eight compass
 * directions, and the bar is what the player steers:
 *
 *  - stick roughly ALONG the bar pushes or pulls — this is the straight run,
 *    and it cannot wander, because the direction is quantised and held;
 *  - stick roughly ACROSS it walks the holder around Biggy to re-aim the bar,
 *    during which Biggy's sideways speed is bled off, so swinging the bar mid-run
 *    does not fling him;
 *  - pulling straight back, or letting go, releases.
 *
 * Eight directions rather than free aim is the load-bearing choice. A continuous
 * bar reintroduces exactly the drift it exists to remove; a quantised one gives
 * the player a lane and the confidence to commit to it.
 *
 * ## Units
 *
 * Every speed here is expressed against the frozen table in `constants.ts`, not
 * as a literal. The experiment's numbers are in the prototype's old scale, which
 * this project divided by four on 23 Sep 2026 (`SPEED_SCALE`), so porting a bare
 * `210` would have produced a cap four times too fast.
 */

import { DEFS, SPEED_SCALE } from './constants';
import type { Bot, RobotKind } from './types';

/** The bar snaps to one of these; index is the direction, in eighths of a turn. */
export const TOW_DIRS = 8;
const STEP = (Math.PI * 2) / TOW_DIRS;

/**
 * Stick within this of the bar's axis counts as "along it" rather than "across".
 * Half of a 90-degree quadrant, so along and across split the circle evenly and
 * there is no dead input.
 */
export const TOW_AXIS_HALF = Math.PI / 4;

/** How fast the holder walks round Biggy to re-aim the bar, rad/s. */
export const TOW_WALK_ROUND = 7;

/**
 * Biggy's sideways speed decays at this rate, s^-1, while the bar is being
 * re-aimed. Without it a player who swings the bar 90 degrees mid-run keeps all
 * the momentum from the old direction and Biggy leaves sideways — which is the
 * original complaint, reintroduced by the cure.
 */
export const TOW_BLEED = 4;

/** Pull straight back for this long to let go, seconds. */
export const TOW_RELEASE_HOLD = 0.2;

/**
 * While held, Biggy is capped here rather than at his own `max`.
 *
 * Above his own top speed on purpose — a towed robot is being driven by someone
 * else's legs as well as his own — but below `ROLLER_DOOR_SPEED`, so the tow is
 * how you *reach* the door's threshold rather than a free pass through it.
 */
export const TOW_CAP = 210 * SPEED_SCALE;

/** Who can take hold. Biggy cannot tow himself; Droid can, and is slower at it. */
export const TOW_CAN_GRAB: readonly RobotKind[] = ['voxxy', 'droid'];

/** Live state for one grab. `null` when nobody is holding on. */
export interface TowState {
  /** The robot holding the bar. */
  holder: RobotKind;
  /** Bar direction as an index 0..TOW_DIRS-1, measured from +x, turning toward +y. */
  dir: number;
  /** Continuous aim, which `dir` quantises; the holder walks this round. */
  aim: number;
  /** How long the stick has been pulling straight back, seconds. */
  heldBack: number;
}

/** The bar's unit vector for a given aim. */
export const towAxis = (aim: number): { x: number; y: number } => ({
  x: Math.cos(aim),
  y: Math.sin(aim),
});

/** Snap a continuous aim to the nearest of the eight directions. */
export const towSnap = (aim: number): number => Math.round(aim / STEP) % TOW_DIRS;

/** The angle of a snapped direction index. */
export const towAngle = (dir: number): number => dir * STEP;

/**
 * Can `b` take hold of Biggy right now?
 *
 * Deliberately the same reach as mounting rather than the same reach as pushing:
 * taking hold is a reach, and a player who has to shove Biggy across the room
 * before they can grab him has the original problem back.
 */
export function canGrab(b: Bot, bg: Bot, reach: number): boolean {
  if (b.mounted || b.braced || bg.mounted) return false;
  if (!TOW_CAN_GRAB.includes(b.kind)) return false;
  const d = Math.hypot(bg.x - b.x, bg.y - b.y);
  return d <= b.r + bg.r + reach;
}

/** Take hold, with the bar aimed along the line the holder already stands on. */
export function grab(b: Bot, bg: Bot): TowState {
  const aim = Math.atan2(bg.y - b.y, bg.x - b.x);
  const dir = towSnap(aim);
  return { holder: b.kind, dir, aim: towAngle(dir), heldBack: 0 };
}

/**
 * Advance one grab.
 *
 * Returns `null` once the grab has ended, which the caller treats as "let go".
 * Nothing here reads or writes anything outside the two robots and the state, so
 * a chapter can own a `TowState` without the rest of the sim knowing.
 */
export function stepTow(
  tow: TowState,
  holder: Bot,
  bg: Bot,
  dt: number,
): TowState | null {
  if (holder.mounted || bg.mounted) return null;

  const axis = towAxis(tow.aim);
  const il = Math.hypot(holder.ix, holder.iy);

  // No stick: hold station, keep the bar where it is.
  if (il < 1e-6) {
    tow.heldBack = 0;
    place(tow, holder, bg);
    return tow;
  }

  const ux = holder.ix / il;
  const uy = holder.iy / il;
  // Positive along the bar means pushing Biggy away from the holder.
  const along = ux * axis.x + uy * axis.y;

  if (Math.abs(along) >= Math.cos(TOW_AXIS_HALF)) {
    // Along the bar: drive. The holder's own force does the work and the
    // direction is the bar's, not the instantaneous line between the two.
    tow.heldBack = along < 0 ? tow.heldBack + dt : 0;
    if (tow.heldBack >= TOW_RELEASE_HOLD) return null;

    const F = DEFS[holder.kind].accel * DEFS[holder.kind].max * 0.5;
    bg.vx += axis.x * along * F * dt;
    bg.vy += axis.y * along * F * dt;

    const sp = Math.hypot(bg.vx, bg.vy);
    if (sp > TOW_CAP) {
      bg.vx *= TOW_CAP / sp;
      bg.vy *= TOW_CAP / sp;
    }
  } else {
    // Across the bar: walk round to re-aim, and bleed the sideways component of
    // Biggy's velocity so the swing does not carry him off in the old direction.
    tow.heldBack = 0;
    const side = ux * -axis.y + uy * axis.x;
    tow.aim += Math.sign(side) * TOW_WALK_ROUND * dt;
    tow.dir = towSnap(tow.aim);

    const k = Math.exp(-TOW_BLEED * dt);
    const fwd = bg.vx * axis.x + bg.vy * axis.y;
    const lat = bg.vx * -axis.y + bg.vy * axis.x;
    const latK = lat * k;
    bg.vx = fwd * axis.x + latK * -axis.y;
    bg.vy = fwd * axis.y + latK * axis.x;
  }

  place(tow, holder, bg);
  return tow;
}

/** Keep the holder on the bar, one radius-pair back from Biggy's centre. */
function place(tow: TowState, holder: Bot, bg: Bot): void {
  const a = towAxis(tow.aim);
  const gap = holder.r + bg.r;
  holder.x = bg.x - a.x * gap;
  holder.y = bg.y - a.y * gap;
  holder.vx = bg.vx;
  holder.vy = bg.vy;
  holder.face = tow.aim;
}
