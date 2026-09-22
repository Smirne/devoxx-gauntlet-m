/**
 * The frozen physics constants (GAUNTLET.md, "Frozen physics constants").
 *
 * Changing one of these is a human decision, never a builder's — so every value in
 * that table is pinned here, and the last block checks the numbers still match the
 * prototype they were ported from. If a value has genuinely been re-decided, the
 * table, `src/sim/constants.ts` and this file move together, in one reviewed commit.
 */

import { describe, expect, it } from 'vitest';

// The prototype source itself, so the last block can diff our numbers against it.
// `?raw` keeps this a Vite/vitest import — the project has no Node type definitions.
import proto from '../reference/poc/10-after-dark-kinepolis.html?raw';

import {
  ANIM_DIV,
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

describe('the robot table', () => {
  it('has the three robots and nothing else', () => {
    expect(Object.keys(DEFS).sort()).toEqual(['biggy', 'droid', 'voxxy']);
    expect(DEFS.voxxy.name).toBe('Voxxy');
    expect(DEFS.droid.name).toBe('Droid');
    expect(DEFS.biggy.name).toBe('Biggy');
  });

  it('radii: 9 / 13 / 17 sim px', () => {
    expect(DEFS.voxxy.r).toBe(9);
    expect(DEFS.droid.r).toBe(13);
    expect(DEFS.biggy.r).toBe(17);
  });

  it('accel: 12 / 4 / 0.6 s^-1', () => {
    expect(DEFS.voxxy.accel).toBe(12);
    expect(DEFS.droid.accel).toBe(4);
    expect(DEFS.biggy.accel).toBe(0.6);
  });

  it('top speed: 290 / 115 / 235 px/s', () => {
    expect(DEFS.voxxy.max).toBe(290);
    expect(DEFS.droid.max).toBe(115);
    expect(DEFS.biggy.max).toBe(235);
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

  it('stop snap 2 px/s, heading floor 1 px/s, gait divisor 18', () => {
    expect(STOP_SNAP).toBe(2);
    expect(FACE_MIN_SPEED).toBe(1);
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
  it('push force 170 (Voxxy) / 120 (Droid), lean at least 0.3', () => {
    expect(PUSH_FORCE.voxxy).toBe(170);
    expect(PUSH_FORCE.droid).toBe(120);
    expect(PUSH_FORCE.biggy).toBe(0);
    expect(PUSH_LEAN_MIN).toBe(0.3);
    expect(PUSH_REACH).toBe(12);
    expect(PUSH_FLASH_COOLDOWN).toBe(3);
  });

  it('boostCap = speed x 1.05, decaying at 1.5 s^-1', () => {
    expect(BOOST_CAP_FACTOR).toBe(1.05);
    expect(BOOST_DECAY).toBe(1.5);
  });

  it('mounting needs Biggy below 20 px/s and widens the pool x1.6', () => {
    expect(MOUNT_BIGGY_MAX_SPEED).toBe(20);
    expect(MOUNT_POOL_SCALE).toBe(1.6);
    expect(MOUNT_REACH).toBe(12);
    expect(MOUNT_OFFSET_Y).toBe(6);
  });

  it('jammed door 70 px/s, roller door 270 px/s, cable 1480 px', () => {
    expect(JAMMED_DOOR_SPEED).toBe(70);
    expect(ROLLER_DOOR_SPEED).toBe(270);
    expect(CABLE_MAX).toBe(1480);
  });

  it('the roller door is above Biggy\'s own top speed — that is the puzzle', () => {
    expect(ROLLER_DOOR_SPEED).toBeGreaterThan(DEFS.biggy.max);
    // ...while the jammed door is well inside it, so Biggy can take that one alone.
    expect(JAMMED_DOOR_SPEED).toBeLessThan(DEFS.biggy.max / 2);
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

  it('cutscene fade 0.35 s, walk 150 px/s', () => {
    expect(CUT_FADE).toBe(0.35);
    expect(CUT_WALK_SPEED).toBe(150);
  });

  it('the renderer scale is 12.5 px per metre', () => {
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
    expect(DEFS.voxxy.max).toBe(290);
  });
});

describe('still the prototype\'s numbers', () => {
  // Parity with `reference/poc/10-after-dark-kinepolis.html` is the acceptance test
  // (CLAUDE.md), so the robot table is read straight out of it and compared.
  for (const kind of KINDS) {
    it(`${kind} matches the prototype's DEFS entry`, () => {
      const line = new RegExp(`${kind}:\\{[^}]*`).exec(proto);
      expect(line).not.toBeNull();
      const entry = line ? line[0] : '';
      const num = (field: string): number => {
        const m = new RegExp(`${field}:(-?[0-9.]+)`).exec(entry);
        expect(m, `${kind}.${field} not found in the prototype`).not.toBeNull();
        return m ? Number(m[1]) : NaN;
      };
      const def = DEFS[kind];
      expect(num('r')).toBe(def.r);
      expect(num('accel')).toBe(def.accel);
      expect(num('max')).toBe(def.max);
      expect(num('drag')).toBe(def.drag);
      expect(num('mass')).toBe(def.mass);
      expect(num('range')).toBe(def.light.range);
      expect(entry).toContain(`[${def.light.c.join(',')}]`);
      expect(entry).toContain(`type:'${def.light.type}'`);
    });
  }

  it('the thresholds are the prototype\'s too', () => {
    expect(proto).toContain('N.JAM=70');
    expect(proto).toContain('X.NEED=270');
    expect(proto).toContain('MAX:1480');
    expect(proto).toContain('Math.exp(-1.5*dt)'); // boost decay
    expect(proto).toContain('*1.05'); // boost cap factor
    expect(proto).toContain("b.kind==='biggy'?0.45:0.05"); // wall restitution
  });
});
