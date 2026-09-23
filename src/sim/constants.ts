/**
 * PHYSICS CONSTANTS — the prototype's numbers, rescaled once, on the record.
 *
 * These were ported verbatim from `reference/poc/10-after-dark-kinepolis.html` and
 * frozen: `tests/frozen-constants.test.ts` pins every one of them, and changing one
 * is a human decision, never a builder agent's.
 *
 * ## The one time they were unfrozen — 23 Sep 2026, by Michele
 *
 * He playtested chapter 1 and filed three complaints that all had one cause: the
 * prototype's speeds are arcade numbers, and read through the geometry scale
 * (`PX_PER_M = 12.5`, fixed by the Devoxx plans) Voxxy's 290 px/s was 23 m/s —
 * 84 km/h for a knee-high robot. `src/sim/units.ts` carried a second, invented
 * scale whose only job was to stop the HUD printing that number.
 *
 *   - "Voxxy feels too fast, it's almost hard to control."
 *   - "it's really hard to stop a character pointing the light in the right
 *     direction" — the aim is instant, but she coasted 2.6 m after the stick let go.
 *   - "droid is pushing Biggy just by coming close, with no contacts" — the radii
 *     were top-down footprints "deliberately generous": Biggy's 17 px was 1.36 m
 *     against a rendered half-width of 0.70 m, and `PUSH_REACH` added 0.96 m on top.
 *
 * He authorised a full rescale of speeds and radii. Two separate decisions:
 *
 *   1. **Speeds.** Every px/s quantity in the game — here and in the chapters —
 *      is the prototype's number times `SPEED_SCALE`, and nothing else changed.
 *      Rates in s^-1 (`accel`, `drag`, `BOOST_DECAY`) and ratios (restitution,
 *      masses, `BOOST_CAP_FACTOR`) are dimensionless across that rescale and are
 *      untouched, so the shape of every curve is the prototype's; only the unit on
 *      the velocity axis moved. Because lengths did NOT move, a time budget
 *      measured against robot travel is a speed in disguise and scales the other
 *      way, by `TRAVEL_TIME_SCALE` — the soup's cooling clock, the keynote crowd,
 *      the Regex Racing lap.
 *   2. **Radii.** `DEFS.*.r` is now measured off the rig the renderer actually
 *      builds (`createRobot(kind)` + `measureBounds`, widest point about the
 *      robot's own vertical axis) instead of being a generous guess, and the push
 *      and mount slack are contact distances again rather than a metre of reach.
 *
 * Everything in `tests/chapters.test.ts` still passes untouched, which is the proof
 * that this was a rescale and not a redesign. They are frozen again as of that date;
 * the next change is another human decision.
 *
 * Units: sim pixels and seconds. `accel` and `drag` are exponential-approach rates
 * in s^-1 (dimensionless across a rescale), masses and restitutions are ratios.
 */

import type { RobotDef, RobotKind } from './types';

/** The prototype canvas. Both floors are drawn inside it. */
export const W = 1900;
export const H = 700;
/** Wall slab thickness. */
export const T = 6;

/** Frame time is clamped so a stalled tab cannot tunnel a robot through a wall. */
export const DT_MAX = 0.033;

/* ---------------------------------------------------------------- the rescale */

/**
 * Every px/s quantity in the game is the prototype's number times this.
 *
 * 0.25 puts Voxxy at 72.5 px/s = **5.8 m/s** through the geometry scale, Droid at
 * 2.3 m/s and Biggy at 4.7 m/s — a knee-high robot sprinting, a tall one walking
 * briskly, and a heavy one rolling. The honest factor that makes the geometry
 * scale and the old HUD scale agree exactly is 12.5 / 72.5 = 0.1724 (Voxxy at
 * 4 m/s); measured against the chapters it costs another 45% of traversal time —
 * the chapter-2 cable errand goes from 4.6 s to 18.3 s instead of 13.9 s, and the
 * roller-door shove from 2.0 s to 11.9 s against a 13.2 s test budget — for 1.8 m/s
 * nobody can see. 0.25 is the fast end of the 4-6 m/s window Michele set, and it is
 * an exact quarter, so every rescaled constant stays a clean decimal and every
 * travel-time budget is exactly four times what it was.
 */
export const SPEED_SCALE = 0.25;

/**
 * ...and the reciprocal, for the other kind of frozen number.
 *
 * Lengths did not move, so a clock that a robot has to *travel* against — the soup
 * going cold, the keynote crowd arriving, the Regex Racing lap — has to grow by
 * exactly as much as the robots slowed down, or the choreography changes. This is
 * the same rescale seen from the time axis, not a second free parameter.
 */
export const TRAVEL_TIME_SCALE = 1 / SPEED_SCALE;

/**
 * The three robots.
 *
 * `r` is the top-down collision footprint in sim px, measured off the rig the
 * renderer builds: the widest point of the rest pose about the robot's own vertical
 * axis, which is the radius the silhouette sweeps as it turns. Voxxy 0.38 m
 * (measured 0.377), Droid 0.50 m (0.503), Biggy 0.72 m (0.722). Arms swing wider
 * than that mid-stride — Biggy's reaches 0.77 m — but an arm is not a body you bump
 * into, and a circle that big is the generosity Michele complained about.
 */
export const DEFS: Readonly<Record<RobotKind, RobotDef>> = Object.freeze({
  voxxy: Object.freeze({
    name: 'Voxxy',
    r: 4.75,
    accel: 12,
    max: 290 * SPEED_SCALE,
    drag: 9,
    mass: 1,
    color: '#ff7a1a',
    eye: '#ffd27a',
    light: Object.freeze({ c: [255, 120, 40] as [number, number, number], type: 'cone' as const, ang: 0.38, range: 280 }),
  }),
  droid: Object.freeze({
    name: 'Droid',
    r: 6.25,
    accel: 4,
    max: 115 * SPEED_SCALE,
    drag: 7,
    mass: 3,
    color: '#4a4f57',
    eye: '#ffc46b',
    tall: true,
    light: Object.freeze({ c: [90, 220, 140] as [number, number, number], type: 'pool' as const, range: 95 }),
  }),
  biggy: Object.freeze({
    name: 'Biggy',
    r: 9,
    accel: 0.6,
    max: 235 * SPEED_SCALE,
    drag: 0.35,
    mass: 7,
    color: '#5f7387',
    eye: '#ffe9b0',
    belly: '#d9772a',
    light: Object.freeze({ c: [70, 120, 255] as [number, number, number], type: 'cone' as const, ang: 1.0, range: 300 }),
  }),
}) as Readonly<Record<RobotKind, RobotDef>>;

/* ---------------------------------------------------------------- collision */

/** Wall bounce: Biggy rebounds, the other two barely. */
export const REST_WALL_BIGGY = 0.45;
export const REST_WALL_OTHER = 0.05;
/** Robot-robot restitution. */
export const REST_BOT = 0.3;
/** A braced robot behaves as if it had this mass (i.e. immovable). */
export const BRACED_MASS = 1e6;
/** Below this speed with no input, velocity snaps to zero. */
export const STOP_SNAP = 2 * SPEED_SCALE;
/** Heading only updates above this speed, so a stopped robot keeps facing where it was. */
export const FACE_MIN_SPEED = 1 * SPEED_SCALE;
/** Gait phase advance: anim += speed * dt / ANIM_DIV. */
export const ANIM_DIV = 18;

/* ---------------------------------------------------------------- pushing Biggy */

/** A robot leaning on Biggy adds acceleration, taking him past his own top speed. */
export const PUSH_FORCE: Readonly<Record<RobotKind, number>> = Object.freeze({
  voxxy: 170 * SPEED_SCALE,
  droid: 120 * SPEED_SCALE,
  biggy: 0,
});
/** Minimum alignment of the pusher's stick with the direction to Biggy. */
export const PUSH_LEAN_MIN = 0.3;
/**
 * Contact slack for "touching Biggy", added to the two radii.
 *
 * 1 px is 8 cm: a hand on him, which is what a push is. It was 12 px — 0.96 m of
 * reach on top of two radii that were already generous, which is why Droid shoved
 * Biggy across the room from a body-width away. It is not zero because the pair can
 * separate by up to `DT_MAX` x their closing speed between the frame that resolves
 * the contact and the frame that reads it, and a push that stutters is worse than
 * a push that starts a few centimetres early.
 */
export const PUSH_REACH = 1;
/** The boost cap is set just above the achieved speed so the clamp cannot undercut a door check. */
export const BOOST_CAP_FACTOR = 1.05;
/** The boost cap decays at this rate, s^-1. */
export const BOOST_DECAY = 1.5;
/** Seconds between "X pushes Biggy" toasts. */
export const PUSH_FLASH_COOLDOWN = 3;

/* ---------------------------------------------------------------- Droid rides Biggy */

/** Droid may mount only a nearly-stationary Biggy. */
export const MOUNT_BIGGY_MAX_SPEED = 20 * SPEED_SCALE;
/**
 * Contact slack for mounting — deliberately longer than `PUSH_REACH`.
 *
 * Climbing is a reach, not a shove: 4 px is 0.32 m, about an arm, so Droid can get
 * a hand on Biggy's shoulder from beside him instead of having to walk into him and
 * push him out from under himself first.
 */
export const MOUNT_REACH = 4;
/** Droid's pool widens by this factor while mounted (taller lamp). */
export const MOUNT_POOL_SCALE = 1.6;
/** Droid sits this far above Biggy's centre while mounted. */
export const MOUNT_OFFSET_Y = 6;

/* ---------------------------------------------------------------- doors */

/** Chapter 1: room E's jammed door. Speed *into* the door, not total speed. */
export const JAMMED_DOOR_SPEED = 70 * SPEED_SCALE;
/** Chapter 2: the store's roller door — above Biggy's own top speed, so he must be pushed. */
export const ROLLER_DOOR_SPEED = 270 * SPEED_SCALE;
/** Chapter 2: the cable from the network rack to the reception printer. */
export const CABLE_MAX = 1480;

/* ---------------------------------------------------------------- lights */

/** Rays per visibility polygon. */
export const RAYS_CONE = 48;
export const RAYS_POOL = 72;
export const RAYS_MIRROR = 32;
/** Mirror bounces: half-angle of a secondary cone, and its minimum range. */
export const MIRROR_ANG = 0.55;
export const MIRROR_MIN_RANGE = 90;
/** Sample points taken along a mirror segment when looking for lit spots. */
export const MIRROR_SAMPLES = 8;

/* ---------------------------------------------------------------- feedback */

/** Seconds before the same wall may explain itself again. */
export const BLOCKED_THROTTLE = 2.5;
/** Toast duration, ms. */
export const TOAST_MS = 2200;

/* ---------------------------------------------------------------- cutscenes */

export const CUT_FADE = 0.35;
export const CUT_WALK_SPEED = 150 * SPEED_SCALE;
