/**
 * Physics acceptance tests — the prototype's feel, expressed as numbers.
 *
 * These are the acceptance criteria for `src/sim/bot.ts` (GAUNTLET.md section 4).
 * They describe *behaviour a player would notice* — Voxxy is instantly quick, Biggy
 * takes the length of a hall to get going and another to stop, nothing tunnels, a
 * braced robot is a wall — rather than re-stating the constants, which
 * `frozen-constants.test.ts` already pins down.
 */

import { describe, expect, it } from 'vitest';

import { botsCollide, circleRect, mkBot, pushBiggy, speed, stepBot } from '../src/sim/bot';
import {
  DEFS,
  DT_MAX,
  JAMMED_DOOR_SPEED,
  REST_WALL_BIGGY,
  REST_WALL_OTHER,
  ROLLER_DOOR_SPEED,
  T,
} from '../src/sim/constants';
import type { Bot, RobotKind, Wall } from '../src/sim/types';

const DT = 1 / 60;
const KINDS: RobotKind[] = ['voxxy', 'droid', 'biggy'];

/** Drive `b` for `secs` with a fixed stick, returning the distance covered. */
function drive(b: Bot, secs: number, ix: number, iy: number, walls: Wall[] = [], dt = DT): number {
  const x0 = b.x;
  const y0 = b.y;
  for (let t = 0; t < secs; t += dt) {
    b.ix = ix;
    b.iy = iy;
    stepBot(b, dt, walls);
  }
  return Math.hypot(b.x - x0, b.y - y0);
}

/** Seconds of full stick before the robot is within 1% of its top speed. */
function timeToTopSpeed(kind: RobotKind, limit = 40): number {
  const b = mkBot(kind, 0, 0);
  for (let t = 0; t < limit; t += DT) {
    b.ix = 1;
    b.iy = 0;
    stepBot(b, DT, []);
    if (b.vx >= b.max * 0.99) return t + DT;
  }
  return Infinity;
}

/** A closed box of wall slabs; the interior is x0..x1 by y0..y1. */
function box(x0: number, y0: number, x1: number, y1: number): Wall[] {
  return [
    { x: x0 - T, y: y0 - T, w: T, h: y1 - y0 + 2 * T },
    { x: x1, y: y0 - T, w: T, h: y1 - y0 + 2 * T },
    { x: x0, y: y0 - T, w: x1 - x0, h: T },
    { x: x0, y: y1, w: x1 - x0, h: T },
  ];
}

describe('acceleration — three robots, three personalities', () => {
  it('Voxxy is at full tilt inside a second, Biggy needs the length of a hall', () => {
    const v = mkBot('voxxy', 0, 0);
    drive(v, 1, 1, 0);
    expect(v.vx).toBeGreaterThan(289);
    expect(v.vx).toBeLessThanOrEqual(DEFS.voxxy.max);
    expect(timeToTopSpeed('voxxy')).toBeLessThan(1);

    const bg = mkBot('biggy', 0, 0);
    drive(bg, 1, 1, 0);
    // After a full second Biggy is not even at half his top speed.
    expect(bg.vx).toBeLessThan(DEFS.biggy.max / 2);
    expect(timeToTopSpeed('biggy')).toBeGreaterThan(5);
    // ...and Droid sits between the two, deliberate but not ponderous.
    expect(timeToTopSpeed('droid')).toBeGreaterThan(timeToTopSpeed('voxxy'));
    expect(timeToTopSpeed('droid')).toBeLessThan(timeToTopSpeed('biggy'));
  });

  it('nobody exceeds their own top speed without being pushed', () => {
    for (const kind of KINDS) {
      const b = mkBot(kind, 0, 0);
      let peak = 0;
      for (let t = 0; t < 20; t += DT) {
        b.ix = 1;
        b.iy = 0;
        stepBot(b, DT, []);
        peak = Math.max(peak, speed(b));
      }
      expect(peak).toBeLessThanOrEqual(DEFS[kind].max + 1e-9);
    }
  });

  it('the stick is normalised, so diagonals are not faster', () => {
    const straight = mkBot('voxxy', 0, 0);
    const diagonal = mkBot('voxxy', 0, 0);
    drive(straight, 2, 1, 0);
    drive(diagonal, 2, 1, 1);
    expect(speed(diagonal)).toBeCloseTo(speed(straight), 6);
  });
});

describe('momentum — stopping is a physical event', () => {
  it('Biggy coasts across the hall, Voxxy stops on the spot', () => {
    const bg = mkBot('biggy', 0, 0);
    drive(bg, 6, 1, 0);
    const bgCoast = drive(bg, 3, 0, 0);
    expect(bgCoast).toBeGreaterThan(400);
    expect(speed(bg)).toBeGreaterThan(20); // still rolling after three seconds

    const v = mkBot('voxxy', 0, 0);
    drive(v, 2, 1, 0);
    const vCoast = drive(v, 3, 0, 0);
    expect(vCoast).toBeLessThan(40);
    expect(speed(v)).toBe(0); // snapped to a dead stop
    expect(bgCoast / vCoast).toBeGreaterThan(10);
  });

  it('a released robot snaps to exactly zero instead of drifting forever', () => {
    const v = mkBot('voxxy', 0, 0);
    drive(v, 2, 1, 0);
    let stoppedAt = Infinity;
    for (let t = 0; t < 5; t += DT) {
      v.ix = 0;
      v.iy = 0;
      stepBot(v, DT, []);
      if (speed(v) === 0) {
        stoppedAt = t + DT;
        break;
      }
    }
    expect(stoppedAt).toBeLessThan(1);
  });

  it('heading holds when a robot stops, and only updates while moving', () => {
    const b = mkBot('voxxy', 0, 0);
    drive(b, 1, 0, -1); // walk north
    const facing = b.face;
    expect(Math.sin(facing)).toBeLessThan(-0.9);
    drive(b, 3, 0, 0); // let go
    expect(speed(b)).toBe(0);
    expect(b.face).toBe(facing); // still looking north
  });

  it('the gait phase advances with distance, not with time', () => {
    const fast = mkBot('voxxy', 0, 0);
    const slow = mkBot('droid', 0, 0);
    const fastDist = drive(fast, 4, 1, 0);
    const slowDist = drive(slow, 4, 1, 0);
    expect(fast.anim / fastDist).toBeCloseTo(slow.anim / slowDist, 2);
  });
});

describe('walls', () => {
  it('a robot cannot pass through a wall at any dt up to DT_MAX', () => {
    const walls = box(100, 100, 500, 300);
    const dts = [0.002, 0.004, 1 / 120, DT, 0.025, DT_MAX];
    const dirs: Array<[number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    // The worst excursion over every robot, every frame time and every heading:
    // asserted once per run so the loop stays a stress test rather than 100k matchers.
    for (const kind of KINDS) {
      for (const dt of dts) {
        for (const [ix, iy] of dirs) {
          const b = mkBot(kind, 300, 200);
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          for (let t = 0; t < 3; t += dt) {
            b.ix = ix;
            b.iy = iy;
            stepBot(b, dt, walls);
            minX = Math.min(minX, b.x);
            maxX = Math.max(maxX, b.x);
            minY = Math.min(minY, b.y);
            maxY = Math.max(maxY, b.y);
          }
          const where = `${kind} dt=${dt} dir=${ix},${iy}`;
          expect(`${where} minX>100: ${minX > 100}`).toBe(`${where} minX>100: true`);
          expect(`${where} maxX<500: ${maxX < 500}`).toBe(`${where} maxX<500: true`);
          expect(`${where} minY>100: ${minY > 100}`).toBe(`${where} minY>100: true`);
          expect(`${where} maxY<300: ${maxY < 300}`).toBe(`${where} maxY<300: true`);
          // Contact leaves the robot its own radius clear of the face.
          expect(minX).toBeGreaterThanOrEqual(100 + b.r - 0.001);
          expect(maxX).toBeLessThanOrEqual(500 - b.r + 0.001);
        }
      }
    }
  });

  it('a boosted Biggy — faster than his own top speed — still cannot tunnel', () => {
    const walls = box(100, 100, 500, 300);
    const bg = mkBot('biggy', 300, 200);
    bg.vx = ROLLER_DOOR_SPEED * 1.25; // straight out of a Voxxy push
    bg.boostCap = ROLLER_DOOR_SPEED * 1.3;
    for (let t = 0; t < 3; t += DT_MAX) {
      bg.ix = 1;
      bg.iy = 0;
      stepBot(bg, DT_MAX, walls);
      expect(bg.x).toBeLessThan(500);
      expect(bg.x).toBeGreaterThan(100);
    }
  });

  it('one step at DT_MAX never reaches the midline of a wall slab', () => {
    // Why tunnelling is impossible rather than merely unobserved: contact leaves the
    // robot exactly its own radius from the face, and one full-speed frame is shorter
    // than radius + half the slab, so the deep-penetration fallback always picks the
    // face the robot came in through.
    for (const kind of KINDS) {
      const def = DEFS[kind];
      const boosted = kind === 'biggy' ? ROLLER_DOOR_SPEED * 1.3 : def.max;
      expect(boosted * DT_MAX).toBeLessThan(def.r + T / 2);
    }
  });

  it('Biggy rebounds off a wall, the other two barely do', () => {
    const walls = box(100, 100, 500, 300);
    for (const kind of KINDS) {
      const b = mkBot(kind, 300, 200);
      const rest = kind === 'biggy' ? REST_WALL_BIGGY : REST_WALL_OTHER;
      let impact = 0;
      let rebound = 0;
      for (let t = 0; t < 8; t += DT) {
        b.ix = 1;
        b.iy = 0;
        const before = b.vx;
        stepBot(b, DT, walls);
        if (before > 0 && b.vx < 0) {
          impact = before;
          rebound = -b.vx;
          break;
        }
      }
      expect(impact).toBeGreaterThan(50);
      expect(rebound / impact).toBeCloseTo(rest, 2);
    }
  });

  it('skipFor removes a wall for one robot only, and why() reaches onBlocked', () => {
    const blocked: string[] = [];
    const hatch: Wall = {
      x: 200,
      y: 100,
      w: T,
      h: 200,
      skipFor: (b) => b.kind === 'voxxy',
      why: (b) => `${b.name}: the kiosk hatch is Voxxy-sized`,
    };
    const onBlocked = (b: Bot, w: Wall): void => {
      const m = w.why ? w.why(b) : null;
      if (m) blocked.push(m);
    };
    const v = mkBot('voxxy', 150, 200);
    drive(v, 2, 1, 0, [hatch]);
    expect(v.x).toBeGreaterThan(210); // straight through
    expect(blocked).toHaveLength(0);

    const bg = mkBot('biggy', 150, 200);
    for (let t = 0; t < 2; t += DT) {
      bg.ix = 1;
      bg.iy = 0;
      stepBot(bg, DT, [hatch], onBlocked);
    }
    expect(bg.x).toBeLessThan(200);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0]).toContain('Voxxy-sized');
  });

  it('onHit consumes the hit — a jammed door that only opens above its threshold', () => {
    const walls: Wall[] = [];
    let broken = false;
    const jam: Wall = {
      x: 300,
      y: 100,
      w: 14,
      h: 200,
      onHit: (b) => {
        if (b.kind === 'biggy' && Math.abs(b.vx) > JAMMED_DOOR_SPEED) {
          broken = true;
          const i = walls.indexOf(jam);
          if (i >= 0) walls.splice(i, 1);
          return true;
        }
        return false;
      },
    };
    walls.push(jam);

    // Nudged from close up, Biggy arrives under the threshold and is turned away.
    const slow = mkBot('biggy', 270, 200);
    drive(slow, 0.25, 1, 0, walls);
    expect(broken).toBe(false);
    expect(slow.x).toBeLessThan(300);

    // A run-up across the corridor and the door goes.
    const fast = mkBot('biggy', 60, 200);
    drive(fast, 4, 1, 0, walls);
    expect(broken).toBe(true);
    expect(fast.x).toBeGreaterThan(314);
  });
});

describe('robot against robot', () => {
  it('a braced robot does not move when shoved, and the shover bounces off it', () => {
    const droid = mkBot('droid', 300, 200);
    droid.braced = true;
    const biggy = mkBot('biggy', 180, 200);
    let bounced = 0;
    for (let t = 0; t < 3; t += DT) {
      biggy.ix = 1;
      biggy.iy = 0;
      droid.ix = 0;
      droid.iy = 0;
      stepBot(biggy, DT, []);
      stepBot(droid, DT, []);
      const hit = botsCollide(biggy, droid);
      if (hit) bounced = Math.max(bounced, hit.rv);
    }
    expect(bounced).toBeGreaterThan(100); // Biggy arrived with real momentum
    expect(droid.x).toBeCloseTo(300, 2);
    expect(droid.y).toBeCloseTo(200, 2);
    expect(speed(droid)).toBe(0);
    expect(biggy.vx).toBeLessThan(0); // sent back the way he came
  });

  it('the same shove moves an unbraced robot', () => {
    const droid = mkBot('droid', 300, 200);
    const biggy = mkBot('biggy', 180, 200);
    for (let t = 0; t < 3; t += DT) {
      biggy.ix = 1;
      biggy.iy = 0;
      droid.ix = 0;
      droid.iy = 0;
      stepBot(biggy, DT, []);
      stepBot(droid, DT, []);
      botsCollide(biggy, droid);
    }
    expect(droid.x).toBeGreaterThan(340);
  });

  it('positional correction splits by mass: the light robot gives way', () => {
    const v = mkBot('voxxy', 200, 200);
    const bg = mkBot('biggy', 210, 200); // deeply overlapping
    botsCollide(v, bg);
    const vMoved = 200 - v.x;
    const bgMoved = bg.x - 210;
    expect(vMoved).toBeGreaterThan(0);
    expect(bgMoved).toBeGreaterThan(0);
    // Mass ratio 7:1 — Voxxy takes seven eighths of the separation.
    expect(vMoved / bgMoved).toBeCloseTo(DEFS.biggy.mass / DEFS.voxxy.mass, 3);
    expect(Math.hypot(bg.x - v.x, bg.y - v.y)).toBeCloseTo(v.r + bg.r, 6);
  });

  it('robots that are already separating are not impulsed again', () => {
    const a = mkBot('voxxy', 200, 200);
    const b = mkBot('biggy', 215, 200);
    b.vx = 100; // moving away from a
    const res = botsCollide(a, b);
    expect(res).toEqual({ rv: 0 });
    expect(b.vx).toBe(100);
    expect(a.vx).toBe(0);
  });

  it('a mounted Droid is carried, not collided with', () => {
    const d = mkBot('droid', 300, 200);
    d.mounted = true;
    const bg = mkBot('biggy', 300, 206);
    expect(botsCollide(d, bg)).toBeNull();
    d.ix = 1;
    d.vx = 200;
    stepBot(d, DT, []);
    expect(speed(d)).toBe(0);
    expect(d.x).toBe(300);
  });
});

describe('pushing Biggy through the roller door', () => {
  const lane = (pusher: RobotKind): { peak: number; atLane: number; travelled: number } => {
    const bg = mkBot('biggy', 370, 160);
    const p = mkBot(pusher, 370 - bg.r - DEFS[pusher].r, 160);
    const bots: Bot[] = [p, bg];
    let peak = 0;
    let atLane = 0;
    let t = 0;
    for (let i = 0; i < 60 * 8; i++) {
      p.ix = 1;
      p.iy = 0;
      bg.ix = 0;
      bg.iy = 0;
      stepBot(p, DT, []);
      stepBot(bg, DT, []);
      pushBiggy(bots, DT, t, () => undefined);
      botsCollide(p, bg);
      t += DT;
      peak = Math.max(peak, bg.vx);
      if (atLane === 0 && bg.x - 370 >= 400) atLane = bg.vx;
    }
    return { peak, atLane, travelled: bg.x - 370 };
  };

  it('Biggy alone never reaches the roller door threshold', () => {
    const bg = mkBot('biggy', 0, 0);
    let peak = 0;
    for (let t = 0; t < 30; t += DT) {
      bg.ix = 1;
      bg.iy = 0;
      stepBot(bg, DT, []);
      peak = Math.max(peak, bg.vx);
    }
    expect(peak).toBeCloseTo(DEFS.biggy.max, 2);
    expect(peak).toBeLessThan(ROLLER_DOOR_SPEED);
    expect(ROLLER_DOOR_SPEED).toBeGreaterThan(DEFS.biggy.max);
  });

  it('Voxxy pushing him down a 400 px lane takes him past it', () => {
    const { peak, atLane } = lane('voxxy');
    expect(atLane).toBeGreaterThan(ROLLER_DOOR_SPEED);
    expect(peak).toBeGreaterThan(ROLLER_DOOR_SPEED);
    // Not a rocket: the push cannot carry him past the pusher's own top speed by much.
    expect(peak).toBeLessThan(DEFS.voxxy.max * 1.2);
  });

  it('the push needs the lean: shoving sideways does nothing', () => {
    const bg = mkBot('biggy', 370, 160);
    const v = mkBot('voxxy', 370 - bg.r - 9, 160);
    const bots: Bot[] = [v, bg];
    for (let t = 0; t < 2; t += DT) {
      v.ix = 0;
      v.iy = -1; // walking away across Biggy's face
      bg.ix = 0;
      bg.iy = 0;
      stepBot(v, DT, []);
      stepBot(bg, DT, []);
      pushBiggy(bots, DT, t, () => undefined);
    }
    expect(bg.vx).toBe(0);
  });

  it('the boost cap decays, so the extra speed is not free forever', () => {
    const bg = mkBot('biggy', 0, 0);
    bg.vx = 300;
    bg.boostCap = 320;
    for (let t = 0; t < 4; t += DT) {
      bg.ix = 1;
      bg.iy = 0;
      stepBot(bg, DT, []);
    }
    expect(bg.boostCap).toBeLessThan(1);
    expect(bg.vx).toBeLessThanOrEqual(DEFS.biggy.max + 1e-9);
  });

  it('a braced or mounted robot cannot push', () => {
    for (const mode of ['braced', 'mounted'] as const) {
      const bg = mkBot('biggy', 370, 160);
      const v = mkBot('voxxy', 370 - bg.r - 9, 160);
      v[mode] = true;
      const bots: Bot[] = [v, bg];
      for (let t = 0; t < 1; t += DT) {
        v.ix = 1;
        v.iy = 0;
        pushBiggy(bots, DT, t, () => undefined);
      }
      expect(bg.vx).toBe(0);
    }
  });
});

describe('circleRect', () => {
  it('misses when the circle is clear of the rectangle', () => {
    expect(circleRect({ x: 0, y: 0, r: 5 }, { x: 10, y: 10, w: 20, h: 20 })).toBeNull();
  });

  it('pushes out along the shortest way from a face', () => {
    const hit = circleRect({ x: 8, y: 20, r: 5 }, { x: 10, y: 10, w: 20, h: 20 });
    expect(hit).not.toBeNull();
    expect(hit?.nx).toBeCloseTo(-1, 6);
    expect(hit?.ny).toBeCloseTo(0, 6);
    expect(hit?.pen).toBeCloseTo(3, 6);
  });

  it('picks the shallowest face when the centre is inside the slab', () => {
    // Centre 1 px past the left face of a 6 px slab: out the way it came, not through.
    const hit = circleRect({ x: 11, y: 20, r: 9 }, { x: 10, y: 10, w: T, h: 20 });
    expect(hit?.nx).toBe(-1);
    expect(hit?.pen).toBeCloseTo(10, 6);
  });
});
