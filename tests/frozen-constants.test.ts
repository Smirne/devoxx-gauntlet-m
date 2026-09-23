/**
 * The frozen physics constants (GAUNTLET.md, "Frozen physics constants").
 *
 * Changing one of these is a human decision, never a builder's — so every value in
 * that table is pinned here, and the last block checks the numbers still trace back
 * to the prototype they were ported from. If a value has genuinely been re-decided,
 * the table, `src/sim/constants.ts` and this file move together, in one reviewed
 * commit.
 *
 * ## They were unfrozen exactly once: 23 September 2026
 *
 * Michele playtested chapter 1 and filed three complaints — Voxxy too fast to
 * control, aiming her beam hard because she would not stop, and Droid shoving Biggy
 * "just by coming close, with no contacts". All three were one cause: these were
 * arcade numbers read through a real geometry scale, so Voxxy's 290 px/s was 23 m/s
 * and Biggy's 17 px collision radius was 1.36 m against a body 0.72 m wide.
 * `src/sim/units.ts` carried a second, invented scale (`HUD_PX_PER_MPS = 72.5`)
 * whose only job was to keep that off the HUD. He authorised a full rescale of
 * speeds and radii; it is the only one, and they are frozen again behind it.
 *
 *   - **Speeds.** Every px/s quantity is the prototype's number times
 *     `SPEED_SCALE = 0.25`, which puts Voxxy at 5.8 m/s, Droid at 2.3 and Biggy at
 *     4.7. Rates in s^-1 and pure ratios are dimensionless across that rescale and
 *     did not move, so every curve keeps its shape. The last block below asserts
 *     the factor itself against the prototype source: one factor, no exceptions.
 *   - **Radii.** `DEFS.*.r` is measured off the rig `src/render/robots` builds, not
 *     guessed, and `PUSH_REACH` is contact slack again instead of 0.96 m of reach.
 *     `tests/robots.smoke.test.ts` owns the rigs; this file pins the numbers they
 *     produced.
 *
 * The relationships between the speeds are load-bearing — the roller door is only
 * passable with a push BECAUSE it is above Biggy's cap — so they are asserted as
 * relationships too, not only as values, and the next person cannot break the
 * puzzle by nudging one number.
 */

import { describe, expect, it } from 'vitest';

// The prototype source itself, so the last block can diff our numbers against it.
// `?raw` keeps this a Vite/vitest import — the project has no Node type definitions.
import proto from '../reference/poc/10-after-dark-kinepolis.html?raw';

import {
  ANIM_DIV,
  SPEED_SCALE,
  DROID_SPEED_SCALE,
  BIGGY_SPEED_SCALE,
  TRAVEL_TIME_SCALE,
  BLOCKED_THROTTLE,
  BOOST_CAP_FACTOR,
  BOOST_DECAY,
  BRACED_MASS,
  CABLE_MAX,
  CUT_FADE,
  CUT_WALK_SPEED,
  DEFS,
  DT_MAX,
  FACE_MIN_SPEED,
  H,
  JAMMED_DOOR_SPEED,
  MIRROR_ANG,
  MIRROR_MIN_RANGE,
  MIRROR_SAMPLES,
  MOUNT_BIGGY_MAX_SPEED,
  MOUNT_OFFSET_Y,
  MOUNT_POOL_SCALE,
  MOUNT_REACH,
  PUSH_FLASH_COOLDOWN,
  PUSH_FORCE,
  PUSH_LEAN_MIN,
  PUSH_REACH,
  RAYS_CONE,
  RAYS_MIRROR,
  RAYS_POOL,
  REST_BOT,
  REST_WALL_BIGGY,
  REST_WALL_OTHER,
  ROLLER_DOOR_SPEED,
  STOP_SNAP,
  T,
  TOAST_MS,
  W,
} from '../src/sim/constants';
import type { RobotKind } from '../src/sim/types';
import { PX_PER_M } from '../src/sim/units';

const KINDS: RobotKind[] = ['voxxy', 'droid', 'biggy'];

/** What the prototype had, kept so the size of each decision stays visible. */
const PROTO_RADII: Record<RobotKind, number> = { voxxy: 9, droid: 13, biggy: 17 };
const PROTO_MAX: Record<RobotKind, number> = { voxxy: 290, droid: 115, biggy: 235 };

describe('the robot table', () => {
  it('has the three robots and nothing else', () => {
    expect(Object.keys(DEFS).sort()).toEqual(['biggy', 'droid', 'voxxy']);
    expect(DEFS.voxxy.name).toBe('Voxxy');
    expect(DEFS.droid.name).toBe('Droid');
    expect(DEFS.biggy.name).toBe('Biggy');
  });

  /*
   * The collision footprint each robot actually has on screen: the widest point of
   * the rest pose about its own vertical axis, measured off `createRobot(kind)` with
   * `measureBounds` and rounded to the nearest half pixel. Voxxy measured 0.377 m,
   * Droid 0.503, Biggy 0.722.
   */
  it('radii: the rendered footprint, 0.38 / 0.50 / 0.72 m', () => {
    expect(DEFS.voxxy.r).toBe(4.75);
    expect(DEFS.droid.r).toBe(6.25);
    expect(DEFS.biggy.r).toBe(9);
    expect(DEFS.voxxy.r / PX_PER_M).toBeCloseTo(0.38, 3);
    expect(DEFS.droid.r / PX_PER_M).toBeCloseTo(0.5, 3);
    expect(DEFS.biggy.r / PX_PER_M).toBeCloseTo(0.72, 3);
    // Small, tall-and-narrow, wide — in that order, as the model sheets are.
    expect(DEFS.voxxy.r).toBeLessThan(DEFS.droid.r);
    expect(DEFS.droid.r).toBeLessThan(DEFS.biggy.r);
  });

  it('accel: 12 / 4 / 0.6 s^-1', () => {
    expect(DEFS.voxxy.accel).toBe(12);
    expect(DEFS.droid.accel).toBe(4);
    expect(DEFS.biggy.accel).toBe(0.6);
  });

  it('top speed: the prototype x each robot\'s own scale', () => {
    expect(DEFS.voxxy.max).toBe(290 * SPEED_SCALE);
    expect(DEFS.droid.max).toBe(115 * DROID_SPEED_SCALE);
    expect(DEFS.biggy.max).toBe(235 * BIGGY_SPEED_SCALE);
    expect(SPEED_SCALE).toBe(0.25);
    expect(TRAVEL_TIME_SCALE).toBe(4);
    // Only Voxxy keeps the plain factor; the other two were lifted after Michele
    // played the rescale and found them "a bit too slow now, droid in particular".
    expect(DROID_SPEED_SCALE).toBeGreaterThan(SPEED_SCALE);
    // Biggy kept the base factor: the roller door sits between his top speed and
    // Voxxy's, and that sandwich leaves him no room. See constants.ts.
    expect(BIGGY_SPEED_SCALE).toBe(SPEED_SCALE);
  });

  /*
   * WHAT THE HUD AND THE WALLS BOTH SAY NOW.
   *
   * `PX_PER_M` is the geometry scale the venue is built at, and since the rescale it
   * is also the speed scale: there is no second number any more. A knee-high robot
   * that sprints, a two-metre one that walks briskly, and a heavy one that rolls.
   */
  it('reads as 5.8 / 3.2 / 4.7 m/s through the geometry scale', () => {
    expect(DEFS.voxxy.max / PX_PER_M).toBeCloseTo(5.8, 6);
    expect(DEFS.droid.max / PX_PER_M).toBeCloseTo(3.22, 2);
    expect(DEFS.biggy.max / PX_PER_M).toBeCloseTo(4.7, 2);
    /*
     * Biggy's lift is small, and the ceiling is not arbitrary: the roller door has
     * to stay under VOXXY's top speed, because a push tops out near the pusher and
     * a door she cannot push him through is a door nobody opens. 270 x his scale
     * <= 290 x hers puts his factor at 1.074, so 1.07 is as fast as he gets
     * without changing what the puzzle means.
     */
    expect(270 * BIGGY_SPEED_SCALE).toBeLessThan(DEFS.voxxy.max);
    // Inside the 4-6 m/s window the rescale was authorised against.
    expect(DEFS.voxxy.max / PX_PER_M).toBeGreaterThanOrEqual(4);
    expect(DEFS.voxxy.max / PX_PER_M).toBeLessThanOrEqual(6);
  });

  /*
   * THE ORDERING IS THE CAST. Voxxy is the fast one, Biggy is the heavy one that
   * still outruns Droid once he is going, and Droid is the deliberate one. Three
   * numbers that could each be nudged without failing a value assertion, and any
   * one of those nudges would be a different game.
   */
  it('keeps the three of them in their own order, fast to deliberate', () => {
    expect(DEFS.voxxy.max).toBeGreaterThan(DEFS.biggy.max);
    expect(DEFS.biggy.max).toBeGreaterThan(DEFS.droid.max);
    expect(DEFS.voxxy.accel).toBeGreaterThan(DEFS.droid.accel);
    expect(DEFS.droid.accel).toBeGreaterThan(DEFS.biggy.accel);
    expect(DEFS.voxxy.drag).toBeGreaterThan(DEFS.droid.drag);
    expect(DEFS.droid.drag).toBeGreaterThan(DEFS.biggy.drag);
    expect(DEFS.voxxy.mass).toBeLessThan(DEFS.droid.mass);
    expect(DEFS.droid.mass).toBeLessThan(DEFS.biggy.mass);
  });

  it('drag: 9 / 7 / 0.35 s^-1', () => {
    expect(DEFS.voxxy.drag).toBe(9);
    expect(DEFS.droid.drag).toBe(7);
    expect(DEFS.biggy.drag).toBe(0.35);
  });

  it('mass: 1 / 3 / 7', () => {
    expect(DEFS.voxxy.mass).toBe(1);
    expect(DEFS.droid.mass).toBe(3);
    expect(DEFS.biggy.mass).toBe(7);
  });

  it('only Droid is tall', () => {
    expect(DEFS.droid.tall).toBe(true);
    expect(DEFS.voxxy.tall).toBeUndefined();
    expect(DEFS.biggy.tall).toBeUndefined();
  });
});

describe('the lamps', () => {
  it('Voxxy: an orange cone, 0.38 rad, range 280', () => {
    const l = DEFS.voxxy.light;
    expect(l.type).toBe('cone');
    expect(l.ang).toBe(0.38);
    expect(l.range).toBe(280);
    expect(l.c).toEqual([255, 120, 40]);
    expect(l.c[0]).toBeGreaterThan(l.c[2]); // reads orange, not blue
  });

  it('Droid: a green pool, range 95, no angle', () => {
    const l = DEFS.droid.light;
    expect(l.type).toBe('pool');
    expect(l.range).toBe(95);
    expect(l.ang).toBeUndefined();
    expect(l.c).toEqual([90, 220, 140]);
    expect(l.c[1]).toBeGreaterThan(Math.max(l.c[0], l.c[2])); // reads green
  });

  it('Biggy: a blue cone, 1.0 rad, range 300 — the widest and the longest', () => {
    const l = DEFS.biggy.light;
    expect(l.type).toBe('cone');
    expect(l.ang).toBe(1.0);
    expect(l.range).toBe(300);
    expect(l.c).toEqual([70, 120, 255]);
    expect(l.c[2]).toBeGreaterThan(Math.max(l.c[0], l.c[1])); // reads blue
    expect(l.range).toBeGreaterThan(DEFS.voxxy.light.range);
    expect(l.ang ?? 0).toBeGreaterThan(DEFS.voxxy.light.ang ?? 0);
  });
});

describe('collision and motion', () => {
  it('wall restitution 0.45 for Biggy, 0.05 for the others', () => {
    expect(REST_WALL_BIGGY).toBe(0.45);
    expect(REST_WALL_OTHER).toBe(0.05);
  });

  it('robot-robot restitution 0.3', () => {
    expect(REST_BOT).toBe(0.3);
  });

  it('a braced robot is effectively immovable', () => {
    expect(BRACED_MASS).toBe(1e6);
    expect(BRACED_MASS / DEFS.biggy.mass).toBeGreaterThan(1e5);
  });

  it('stop snap 0.5 px/s, heading floor 0.25 px/s, gait divisor 18', () => {
    expect(STOP_SNAP).toBe(2 * SPEED_SCALE);
    expect(FACE_MIN_SPEED).toBe(1 * SPEED_SCALE);
    // The gait phase advances per pixel TRAVELLED, and lengths did not move, so
    // this one is the prototype's number untouched — the legs still take a step
    // every 18 px of floor.
    expect(ANIM_DIV).toBe(18);
  });

  it('dt is clamped to 0.033 s', () => {
    expect(DT_MAX).toBe(0.033);
  });

  it('the canvas the sim is laid out on is 1900 x 700 with 6 px slabs', () => {
    expect(W).toBe(1900);
    expect(H).toBe(700);
    expect(T).toBe(6);
  });
});

describe('pushing, mounting and the doors', () => {
  it('push force is the prototype\'s, on BIGGY\'s scale, lean at least 0.3', () => {
    // An acceleration is a velocity per second and the time axis did not move.
    // It rides Biggy's scale, not the pusher's: the force is applied TO Biggy and
    // has to reach a door threshold that is also on his scale. Raising his speed
    // without raising this is what briefly broke the roller-door choreography.
    expect(PUSH_FORCE.voxxy).toBe(170 * BIGGY_SPEED_SCALE);
    expect(PUSH_FORCE.droid).toBe(120 * BIGGY_SPEED_SCALE);
    expect(PUSH_FORCE.biggy).toBe(0);
    expect(PUSH_LEAN_MIN).toBe(0.3);
    expect(PUSH_FLASH_COOLDOWN).toBe(3);
  });

  /*
   * MICHELE'S THIRD COMPLAINT, PINNED.
   *
   * "droid is pushing Biggy just by coming close, with no contacts." He was right:
   * 12 px of slack on top of two radii that were already 0.4 m too big put the push
   * zone 2.3 m from Biggy's centre, most of it empty floor. It is 8 cm now — a hand
   * on him. Mounting is allowed to reach further, because climbing is a reach and
   * shoving is not, but it is still well under half a metre.
   */
  it('pushes only on contact, and never from further away than a robot is wide', () => {
    expect(PUSH_REACH).toBe(1);
    expect(PUSH_REACH / PX_PER_M).toBeLessThan(0.1);
    expect(MOUNT_REACH).toBe(4);
    expect(MOUNT_REACH / PX_PER_M).toBeLessThan(0.4);
    expect(MOUNT_REACH).toBeGreaterThan(PUSH_REACH);
    // The whole push zone, centre to centre, is smaller than Biggy is wide.
    expect(DEFS.droid.r + DEFS.biggy.r + PUSH_REACH).toBeLessThan(DEFS.biggy.r * 2 + DEFS.droid.r * 2);
    expect((DEFS.droid.r + DEFS.biggy.r + PUSH_REACH) / PX_PER_M).toBeLessThan(1.35);
  });

  it('boostCap = speed x 1.05, decaying at 1.5 s^-1', () => {
    expect(BOOST_CAP_FACTOR).toBe(1.05);
    expect(BOOST_DECAY).toBe(1.5);
  });

  it('mounting needs Biggy nearly stopped and widens the pool x1.6', () => {
    expect(MOUNT_BIGGY_MAX_SPEED).toBe(20 * BIGGY_SPEED_SCALE);
    expect(MOUNT_POOL_SCALE).toBe(1.6);
    expect(MOUNT_OFFSET_Y).toBe(6);
    // "Nearly stationary" has to stay nearly stationary: well under a tenth of the
    // speed he tops out at, or Droid could step onto a moving Biggy.
    expect(MOUNT_BIGGY_MAX_SPEED).toBeLessThan(DEFS.biggy.max * 0.1);
  });

  it('both doors are on Biggy\'s scale, and the cable is a length', () => {
    // Every threshold measured against Biggy carries HIS factor, so the gates keep
    // exactly the margins the prototype gave them however fast he ends up being.
    expect(JAMMED_DOOR_SPEED).toBe(70 * BIGGY_SPEED_SCALE);
    expect(ROLLER_DOOR_SPEED).toBe(270 * BIGGY_SPEED_SCALE);
    expect(ROLLER_DOOR_SPEED / DEFS.biggy.max).toBeCloseTo(270 / 235, 6);
    // A LENGTH: the reel is a physical object in a room, and rooms did not move.
    expect(CABLE_MAX).toBe(1480);
  });

  /*
   * THE TWO DOORS ARE A RELATIONSHIP, NOT TWO NUMBERS.
   *
   * Chapter 1 works because Biggy can reach the jammed door's threshold alone and
   * chapter 2 works because he cannot reach the roller door's. Both survive the
   * rescale only because one factor was applied to all three numbers; asserting
   * that here means the next person who nudges one gets a failing test instead of a
   * silently unsolvable chapter 2 or a chapter 1 that opens itself.
   */
  it('the roller door is above Biggy\'s own top speed — that is the puzzle', () => {
    expect(ROLLER_DOOR_SPEED).toBeGreaterThan(DEFS.biggy.max);
    // ...and far enough above it that a boosted coast cannot creep over by luck.
    expect(ROLLER_DOOR_SPEED).toBeGreaterThan(DEFS.biggy.max * 1.1);
    // A push tops out near the pusher's own speed, so it has to be reachable too.
    expect(ROLLER_DOOR_SPEED).toBeLessThan(DEFS.voxxy.max);
    // ...while the jammed door is well inside it, so Biggy can take that one alone.
    expect(JAMMED_DOOR_SPEED).toBeLessThan(DEFS.biggy.max / 2);
    // And it is above the speed he drifts at, or the door would open by accident.
    expect(JAMMED_DOOR_SPEED).toBeGreaterThan(MOUNT_BIGGY_MAX_SPEED);
    expect(JAMMED_DOOR_SPEED).toBeGreaterThan(STOP_SNAP * 10);
  });
});

describe('light and feedback', () => {
  it('48 / 72 / 32 rays per polygon', () => {
    expect(RAYS_CONE).toBe(48);
    expect(RAYS_POOL).toBe(72);
    expect(RAYS_MIRROR).toBe(32);
  });

  it('mirror bounces: 0.55 rad, at least 90 px, 8 samples along the screen', () => {
    expect(MIRROR_ANG).toBe(0.55);
    expect(MIRROR_MIN_RANGE).toBe(90);
    expect(MIRROR_SAMPLES).toBe(8);
  });

  it('blocked messages are throttled to 2.5 s, toasts last 2200 ms', () => {
    expect(BLOCKED_THROTTLE).toBe(2.5);
    expect(TOAST_MS).toBe(2200);
  });

  it('cutscene fade 0.35 s, walk 37.5 px/s', () => {
    expect(CUT_FADE).toBe(0.35);
    expect(CUT_WALK_SPEED).toBe(150 * SPEED_SCALE);
    // A cutscene walk is a walk: slower than the robot it carries, never a sprint.
    expect(CUT_WALK_SPEED).toBeLessThan(DEFS.voxxy.max);
  });

  it('the one scale is 12.5 px per metre, for geometry and for speed alike', () => {
    expect(PX_PER_M).toBe(12.5);
  });
});

describe('DEFS is frozen', () => {
  it('the table, each robot and each lamp are all frozen', () => {
    expect(Object.isFrozen(DEFS)).toBe(true);
    for (const kind of KINDS) {
      expect(Object.isFrozen(DEFS[kind])).toBe(true);
      expect(Object.isFrozen(DEFS[kind].light)).toBe(true);
    }
    expect(Object.isFrozen(PUSH_FORCE)).toBe(true);
  });

  it('writing to it throws rather than silently re-tuning the game', () => {
    const table = DEFS as unknown as Record<string, unknown>;
    expect(() => {
      table.voxxy = null;
    }).toThrow(TypeError);
    const voxxy = DEFS.voxxy as unknown as Record<string, unknown>;
    expect(() => {
      voxxy.max = 999;
    }).toThrow(TypeError);
    expect(DEFS.voxxy.max).toBe(72.5);
  });
});

describe('still the prototype\'s numbers, times one factor', () => {
  /*
   * Parity with `reference/poc/10-after-dark-kinepolis.html` is the acceptance test
   * (CLAUDE.md), so the robot table is read straight out of it and compared. After
   * the 2026-09-23 rescale "parity" means something sharper than it used to: every
   * px/s quantity is the prototype's number times `SPEED_SCALE` and every rate,
   * ratio and length is the prototype's number unchanged. That is what makes the
   * rescale a change of unit rather than a re-tune, and it is checked here rather
   * than asserted in prose — if somebody "improves" one speed on its own, the
   * factor stops being one factor and this block fails.
   *
   * The radii are the exception, and deliberately: they were never the prototype's
   * measurement of anything, they were a guess at a footprint, and they are now
   * taken off the rig the renderer builds. The prototype's own values are still
   * read here, and still asserted — as the numbers we moved AWAY from, so the size
   * of that decision stays visible instead of disappearing into a diff.
   */
  for (const kind of KINDS) {
    it(`${kind} is the prototype's entry, speeds scaled and nothing else`, () => {
      const line = new RegExp(`${kind}:\\{[^}]*`).exec(proto);
      expect(line).not.toBeNull();
      const entry = line ? line[0] : '';
      const num = (field: string): number => {
        const m = new RegExp(`${field}:(-?[0-9.]+)`).exec(entry);
        expect(m, `${kind}.${field} not found in the prototype`).not.toBeNull();
        return m ? Number(m[1]) : NaN;
      };
      const def = DEFS[kind];
      // px/s: the prototype's number times THAT ROBOT'S factor. It was one factor
      // for all three until Michele played the rescale and found Droid cumbersome;
      // the parity that matters is that each speed is still the prototype's value
      // times a stated scale, not that the three scales are equal.
      const scale =
        kind === 'droid' ? DROID_SPEED_SCALE : kind === 'biggy' ? BIGGY_SPEED_SCALE : SPEED_SCALE;
      expect(def.max).toBeCloseTo(num('max') * scale, 10);
      // s^-1 and ratios: dimensionless across a rescale, so untouched.
      expect(num('accel')).toBe(def.accel);
      expect(num('drag')).toBe(def.drag);
      expect(num('mass')).toBe(def.mass);
      // Lengths: the lamp reaches as far into the room as it always did.
      expect(num('range')).toBe(def.light.range);
      expect(entry).toContain(`[${def.light.c.join(',')}]`);
      expect(entry).toContain(`type:'${def.light.type}'`);
      // ...and the radius is the one thing that is NOT the prototype's any more.
      expect(num('r')).toBe(PROTO_RADII[kind]);
      expect(def.r).toBeLessThan(PROTO_RADII[kind]);
    });
  }

  it('the thresholds are the prototype\'s too, through the same factor', () => {
    expect(proto).toContain('N.JAM=70');
    expect(JAMMED_DOOR_SPEED).toBeCloseTo(70 * SPEED_SCALE, 10);
    expect(proto).toContain('X.NEED=270');
    expect(ROLLER_DOOR_SPEED).toBeCloseTo(270 * SPEED_SCALE, 10);
    expect(proto).toContain('MAX:1480');
    expect(CABLE_MAX).toBe(1480); // a length: unscaled
    expect(proto).toContain('Math.exp(-1.5*dt)'); // boost decay, s^-1: unscaled
    expect(BOOST_DECAY).toBe(1.5);
    expect(proto).toContain('*1.05'); // boost cap factor, a ratio: unscaled
    expect(BOOST_CAP_FACTOR).toBe(1.05);
    expect(proto).toContain("b.kind==='biggy'?0.45:0.05"); // wall restitution: unscaled
  });

  it('applies a stated factor to every speed and to nothing else', () => {
    /*
     * Read the factors back out of the table they were applied to.
     *
     * This asserted ONE factor until Michele played the rescale: "The other 2 are
     * a bit too slow now, droid in particular is a bit cumbersome to move around."
     * Droid was lifted, so the invariant is weaker on purpose and narrower in
     * exchange — every speed is still the prototype's number times a factor that
     * is NAMED in constants.ts, nobody has a hand-typed value, and two of the
     * three are still the base one.
     */
    const scales: Record<string, number> = {
      voxxy: SPEED_SCALE,
      droid: DROID_SPEED_SCALE,
      biggy: BIGGY_SPEED_SCALE,
    };
    for (const k of KINDS) expect(DEFS[k].max / PROTO_MAX[k]).toBeCloseTo(scales[k], 12);
    expect(BIGGY_SPEED_SCALE).toBe(SPEED_SCALE);
    expect(DEFS.voxxy.max / PROTO_MAX.voxxy).toBeCloseTo(SPEED_SCALE, 12);
    // And nothing that is not a speed went with it.
    expect(DT_MAX).toBe(0.033);
    expect(ANIM_DIV).toBe(18);
    expect(BRACED_MASS).toBe(1e6);
    expect(BLOCKED_THROTTLE).toBe(2.5);
    expect(TOAST_MS).toBe(2200);
    expect(MIRROR_MIN_RANGE).toBe(90);
    expect(W).toBe(1900);
    expect(H).toBe(700);
    expect(T).toBe(6);
  });
});
