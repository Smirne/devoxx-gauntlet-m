/**
 * FROZEN PHYSICS CONSTANTS — ported verbatim from the prototype
 * `reference/poc/10-after-dark-kinepolis.html`.
 *
 * Parity with the prototype beats any "improvement" (CLAUDE.md). These values are
 * asserted by `tests/frozen-constants.test.ts`; changing one is a design decision
 * that has to be made by a human, not by a builder agent.
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

export const DEFS: Readonly<Record<RobotKind, RobotDef>> = Object.freeze({
  voxxy: Object.freeze({
    name: 'Voxxy',
    r: 9,
    accel: 12,
    max: 290,
    drag: 9,
    mass: 1,
    color: '#ff7a1a',
    eye: '#ffd27a',
    light: Object.freeze({ c: [255, 120, 40] as [number, number, number], type: 'cone' as const, ang: 0.38, range: 280 }),
  }),
  droid: Object.freeze({
    name: 'Droid',
    r: 13,
    accel: 4,
    max: 115,
    drag: 7,
    mass: 3,
    color: '#4a4f57',
    eye: '#ffc46b',
    tall: true,
    light: Object.freeze({ c: [90, 220, 140] as [number, number, number], type: 'pool' as const, range: 95 }),
  }),
  biggy: Object.freeze({
    name: 'Biggy',
    r: 17,
    accel: 0.6,
    max: 235,
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
export const STOP_SNAP = 2;
/** Heading only updates above this speed, so a stopped robot keeps facing where it was. */
export const FACE_MIN_SPEED = 1;
/** Gait phase advance: anim += speed * dt / ANIM_DIV. */
export const ANIM_DIV = 18;

/* ---------------------------------------------------------------- pushing Biggy */

/** A robot leaning on Biggy adds acceleration, taking him past his own top speed. */
export const PUSH_FORCE: Readonly<Record<RobotKind, number>> = Object.freeze({
  voxxy: 170,
  droid: 120,
  biggy: 0,
});
/** Minimum alignment of the pusher's stick with the direction to Biggy. */
export const PUSH_LEAN_MIN = 0.3;
/** Contact slack for "touching Biggy", added to the two radii. */
export const PUSH_REACH = 12;
/** The boost cap is set just above the achieved speed so the clamp cannot undercut a door check. */
export const BOOST_CAP_FACTOR = 1.05;
/** The boost cap decays at this rate, s^-1. */
export const BOOST_DECAY = 1.5;
/** Seconds between "X pushes Biggy" toasts. */
export const PUSH_FLASH_COOLDOWN = 3;

/* ---------------------------------------------------------------- Droid rides Biggy */

/** Droid may mount only a nearly-stationary Biggy. */
export const MOUNT_BIGGY_MAX_SPEED = 20;
/** Contact slack for mounting. */
export const MOUNT_REACH = 12;
/** Droid's pool widens by this factor while mounted (taller lamp). */
export const MOUNT_POOL_SCALE = 1.6;
/** Droid sits this far above Biggy's centre while mounted. */
export const MOUNT_OFFSET_Y = 6;

/* ---------------------------------------------------------------- doors */

/** Chapter 1: room E's jammed door. Speed *into* the door, not total speed. */
export const JAMMED_DOOR_SPEED = 70;
/** Chapter 2: the store's roller door — above Biggy's 235 top speed, so he must be pushed. */
export const ROLLER_DOOR_SPEED = 270;
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
export const CUT_WALK_SPEED = 150;
