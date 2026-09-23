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
 * ...and two robots that needed a little more of it after he played the result.
 *
 * Michele, on the rescaled build: *"Voxxy speed is good now... The other 2 are a
 * bit too slow now, droid in particular is a bit cumbersome to move around."*
 *
 * That is a real consequence of quartering the speeds while the rooms stayed the
 * same size. The prototype's ratios (290 / 115 / 235) were tuned for an arcade
 * game where everything was four times faster, and at the new pace Droid's 2.3 m/s
 * stopped reading as "deliberate" and started reading as "waiting".
 *
 * So the single factor is now three, and only Voxxy keeps the plain one. This
 * costs the property the first rescale was proudest of — one number, no
 * exceptions — and it is worth it: the ratios were never sacred, the FEEL is what
 * the realism score rests on, and the person who has to play it says these two
 * are wrong. Droid 2.3 -> 3.2 m/s.
 *
 * BIGGY DID NOT GET ONE, and the reason is worth keeping. His top speed is
 * deliberately BELOW `ROLLER_DOOR_SPEED` so he cannot break the roller door
 * alone — that gate is the whole reason chapter 2 needs two robots — and the
 * door in turn has to stay below VOXXY's top speed, because a push tops out near
 * the pusher and a door she cannot shove him through is a door nobody opens.
 * That sandwich leaves him about 7% of headroom, and at 7% the chapter-2
 * choreography starts failing for real: the push lane is a fixed length, so a
 * faster Biggy spends fewer frames being pushed down it and gains less from the
 * boost. Measured, not guessed — 1.15 and 1.10 broke the isolated push test, 1.07
 * broke the chapter itself.
 *
 * So he keeps the base factor. A meaningfully faster Biggy is not a constant, it
 * is a redesign of the roller door, and that is Michele's call rather than a
 * tuning decision. His scale stays as a named constant so the intent is visible
 * if anyone revisits it.
 */
export const DROID_SPEED_SCALE = SPEED_SCALE * 1.4;
export const BIGGY_SPEED_SCALE = SPEED_SCALE;

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
    max: 115 * DROID_SPEED_SCALE,
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
    max: 235 * BIGGY_SPEED_SCALE,
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
/**
 * A body with no player behind it takes its heading from its velocity, above this
 * speed — so a crate that has been kicked points the way it is sliding, and one
 * that has stopped keeps facing where it was. A robot under the stick takes its
 * heading from the stick instead (`stepBot`), which is why this is no longer the
 * only thing that decides where a robot looks.
 */
export const FACE_MIN_SPEED = 1 * SPEED_SCALE;

/**
 * How long a stick that only *dropped* an axis has to be held before the heading
 * follows it. Seconds. NOT a frozen constant — added 23 Sep 2026 with the aim fix.
 *
 * A diagonal is two keys and two fingers, and two fingers never lift together. The
 * game samples the keyboard once a frame, so "let go of up-right" arrives as a real
 * up-right, then a real up held for a frame or three, then nothing — and a heading
 * that believes every sample it is given ends up pointing at the key that happened
 * to linger. That is the "robots tend to turn up when u release" in Michele's
 * chapter-1 notes: measured at 14-43 deg of drift for Voxxy across a one-to-eight
 * frame release skew, always toward the axis released last.
 *
 * So a stick that has only lost an axis — same signs, nothing new pressed — is
 * treated as a possible fumble and the heading waits it out. A stick that presses
 * something new is believed at once, because a player changing direction is not a
 * player letting go, and aiming has to stay instant: that is the whole complaint.
 *
 * 0.1 s is three frames at the `DT_MAX` floor and six at 60 Hz — longer than the
 * skew between two fingers leaving two keys, shorter than the ~150 ms of a press
 * meant as a press, and it only ever delays the one transition "diagonal to one of
 * its own two axes".
 */
export const AIM_SETTLE = 0.1;
/** Gait phase advance: anim += speed * dt / ANIM_DIV. */
export const ANIM_DIV = 18;

/* ---------------------------------------------------------------- pushing Biggy */

/** A robot leaning on Biggy adds acceleration, taking him past his own top speed. */
export const PUSH_FORCE: Readonly<Record<RobotKind, number>> = Object.freeze({
  voxxy: 170 * BIGGY_SPEED_SCALE,
  droid: 120 * BIGGY_SPEED_SCALE,
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
export const MOUNT_BIGGY_MAX_SPEED = 20 * BIGGY_SPEED_SCALE;
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

/* ---------------------------------------------------------------- Voxxy jumps */

/**
 * The hop, and the one moment this game leaves the floor plane.
 *
 * Michele asked for it twice — first scoped down to *"just for one quiz. And for
 * jumping around for fun"*, then approved outright: *"Voxxy jump: let's make it.
 * I'd keep E, when no other action is available."*
 *
 * These are NOT tuned numbers and they are not frozen-by-decree either: the airtime
 * is derived, so there is exactly one thing to argue about. Pick a hop height, and
 * projectile motion fixes everything else — a body that leaves the ground at
 * `v0 = sqrt(2 g H)` is back on it after `2 v0 / g`, and its height through the hop
 * is the parabola `4 H u (1 - u)` over `u` in 0..1, which is what the renderer
 * draws. Change `JUMP_RISE_M` and the whole arc stays honest.
 *
 * 0.3 m is a knee-high robot getting a foot up onto something. It buys 0.49 s of
 * air, which at her top speed is 2.9 m of ground, and from a standstill it is a hop
 * on the spot — the half of it he asked for for its own sake.
 *
 * **It is a vault, not a clearance.** Every `low` wall in this game is drawn 0.78 m
 * tall (`LOW_H`, `src/render/venue/props.ts`) — seat rows, sponsor tables, the
 * reception counter — and 0.3 m of air does not carry a 0.38 m robot over 0.78 m of
 * furniture. What it does is what a small fast thing actually does to a seat row:
 * a foot on it and over. So the rule the sim enforces is "one hop crosses one piece
 * of low furniture, if she covers its depth", which is why chapter 1's 0.72 m-deep
 * rows go and chapter 4's 7.2 m-deep seat BLOCKS do not, and why the one thing that
 * is taller than 0.78 m — chapter 2's 1.06 m pallets of t-shirts — is not `low` at
 * all and is not hers to cross.
 */
export const GRAVITY = 9.81;
/** Hop height, metres. The only free number in the jump. */
export const JUMP_RISE_M = 0.3;
/** Airtime, seconds — ballistic, derived, not chosen: 2*sqrt(2H/g). */
export const JUMP_AIR = 2 * Math.sqrt((2 * JUMP_RISE_M) / GRAVITY);
/**
 * Seconds on the ground between hops, counted from take-off.
 *
 * One airtime, so the duty cycle is 50%: holding E down gets her a run of hops with
 * a footfall between each, never a permanent hover. Legs push off from the floor,
 * and the floor is where she has to be to do it.
 */
export const JUMP_COOLDOWN = JUMP_AIR;

/* ---------------------------------------------------------------- doors */

/** Chapter 1: room E's jammed door. Speed *into* the door, not total speed. */
export const JAMMED_DOOR_SPEED = 70 * BIGGY_SPEED_SCALE;
/** Chapter 2: the store's roller door — above Biggy's own top speed, so he must be pushed. */
export const ROLLER_DOOR_SPEED = 270 * BIGGY_SPEED_SCALE;
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
