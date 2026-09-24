/**
 * Aiming — the heading a player aimed is the heading they keep.
 *
 * Michele's chapter-1 notes, third round on the same complaint: *"Pointing the
 * light in a direction and stopping is still painful. Robots tend to turn up when
 * u release / short press down."*
 *
 * The heading is what the lamp follows, so every number here is really about where
 * the light ends up. Each case below reproduced a measured failure before the fix
 * in `stepBot`/`stepAim`:
 *
 * | situation                                    | was            | is  |
 * |---|---|---|
 * | chapter 1, drive 3 s and release             | 180.0 deg off  | 0.0 |
 * | one-frame press of a new direction at a run  | 64-89 deg off  | 0.0 |
 * | ragged release of a diagonal, 1-3 frames     | 14-32 deg off  | 0.0 |
 *
 * None of it moved a frozen constant. `FACE_MIN_SPEED` still reads 1 * SPEED_SCALE
 * in `tests/frozen-constants.test.ts` and still does two jobs: the gait phase, and
 * the heading of a body nobody is steering.
 */
import { describe, expect, it } from 'vitest';
import { mkBody, mkBot, speed, stepBot } from '../src/sim/bot';
import { createGame } from '../src/sim';
import { AIM_SETTLE, DT_MAX, FACE_MIN_SPEED } from '../src/sim/constants';
import type { DebugGame } from '../src/sim';
import type { Bot, Wall } from '../src/sim/types';

const KINDS = ['voxxy', 'droid', 'biggy'] as const;

/** The eight directions a keyboard can make, as the raw stick the game builds. */
const DIRS: Array<[string, number, number]> = [
  ['E', 1, 0],
  ['SE', 1, 1],
  ['S', 0, 1],
  ['SW', -1, 1],
  ['W', -1, 0],
  ['NW', -1, -1],
  ['N', 0, -1],
  ['NE', 1, -1],
];

const deg = (r: number): number => (r * 180) / Math.PI;
/** Signed heading error in degrees, wrapped to (-180, 180]. */
const err = (face: number, ix: number, iy: number): number => {
  const a = face - Math.atan2(iy, ix);
  return deg(Math.atan2(Math.sin(a), Math.cos(a)));
};

function hold(b: Bot, ix: number, iy: number, frames: number, walls: Wall[] = []): void {
  for (let i = 0; i < frames; i++) {
    b.ix = ix;
    b.iy = iy;
    stepBot(b, DT_MAX, walls);
  }
}

/** Let go and step until it has genuinely stopped. */
function coast(b: Bot, walls: Wall[] = [], max = 3000): void {
  b.ix = 0;
  b.iy = 0;
  for (let i = 0; i < max && speed(b) > 0; i++) stepBot(b, DT_MAX, walls);
}

/** A closed box with the robot in the middle: every direction reaches a wall. */
function room(): Wall[] {
  return [
    { x: 394, y: 244, w: 212, h: 6 },
    { x: 394, y: 450, w: 212, h: 6 },
    { x: 394, y: 244, w: 6, h: 212 },
    { x: 600, y: 244, w: 6, h: 212 },
  ];
}

describe('aim — under the stick', () => {
  it('points exactly where the stick points, on the very first frame', () => {
    for (const kind of KINDS) {
      for (const [name, ix, iy] of DIRS) {
        const b = mkBot(kind, 500, 350);
        b.face = 0;
        hold(b, ix, iy, 1);
        expect(`${kind} ${name} ${err(b.face, ix, iy).toFixed(1)}`).toBe(`${kind} ${name} 0.0`);
      }
    }
  });

  it('turns on a short press taken at a run — the "short press down"', () => {
    // Before: one frame of a new direction while running east left Voxxy 64 deg
    // off her stick, Droid 82 and Biggy 89, because the heading was the velocity
    // and the velocity had barely begun to turn.
    for (const kind of KINDS) {
      for (const [name, ix, iy] of DIRS) {
        for (const press of [1, 2, 3, 5]) {
          const b = mkBot(kind, 500, 350);
          hold(b, 1, 0, 200);
          hold(b, ix, iy, press);
          expect(`${kind} ${name} x${press} ${err(b.face, ix, iy).toFixed(1)}`).toBe(
            `${kind} ${name} x${press} 0.0`,
          );
        }
      }
    }
  });

  it('does not turn into a wall it is being held against', () => {
    for (const kind of KINDS) {
      for (const [name, ix, iy] of DIRS) {
        const b = mkBot(kind, 500, 350);
        hold(b, ix, iy, 120, room());
        expect(`${kind} ${name} ${err(b.face, ix, iy).toFixed(1)}`).toBe(`${kind} ${name} 0.0`);
      }
    }
  });
});

describe('aim — after the stick lets go', () => {
  it('keeps the heading through the coast, in free space', () => {
    for (const kind of KINDS) {
      for (const [name, ix, iy] of DIRS) {
        for (const held of [1, 3, 10, 90]) {
          const b = mkBot(kind, 500, 350);
          hold(b, ix, iy, held);
          coast(b);
          expect(`${kind} ${name} h${held} ${err(b.face, ix, iy).toFixed(1)}`).toBe(
            `${kind} ${name} h${held} 0.0`,
          );
        }
      }
    }
  });

  it('keeps the heading through a wall rebound', () => {
    // This is the 180 deg one. A bounce reverses the normal component of the
    // velocity, so the last frames of the coast used to re-aim the robot back up
    // the room it had just driven down.
    for (const kind of KINDS) {
      for (const [name, ix, iy] of DIRS) {
        const w = room();
        const b = mkBot(kind, 500, 350);
        hold(b, ix, iy, 120, w);
        coast(b, w);
        expect(`${kind} ${name} ${err(b.face, ix, iy).toFixed(1)}`).toBe(`${kind} ${name} 0.0`);
      }
    }
  });

  it('keeps the heading in the real chapter-1 rooms', { timeout: 30_000 }, () => {
    const start = (createGame({ seed: 20260930, chapter: 1, cards: false }) as DebugGame)
      .snapshot()
      .bots.find((b) => b.kind === 'voxxy')!;
    for (const [name, ix, iy] of DIRS) {
      const g = createGame({ seed: 20260930, chapter: 1, cards: false }) as DebugGame;
      g.debug.select('voxxy');
      /*
       * THE OTHER TWO GO AWAY FIRST, and that is not a weakening.
       *
       * This case is about the WALLS: "a wall bounce reverses the normal
       * component of the velocity" is the bug it was written for, and it drives
       * all eight directions across the real room to catch it. Since the crate
       * row moved to the west wall the three start marks are a north-south line
       * at x 46, so driving north is Voxxy shoving Biggy up the corridor — and a
       * shoved robot facing the way it is actually travelling is `stepAim`'s
       * documented rule ("a body that speeds up while nobody is steering it is
       * being towed, shoved or knocked"), not a bug in it. Leaving them in the
       * lane would have this case quietly asserting the opposite of the design.
       */
      g.debug.place('droid', 900, 650, 0);
      g.debug.place('biggy', 960, 650, 0);
      g.debug.place('voxxy', start.x, start.y, 0);
      g.setStick(ix, iy);
      for (let i = 0; i < 91; i++) g.update(DT_MAX);
      g.setStick(0, 0);
      for (let i = 0; i < 200; i++) g.update(DT_MAX);
      const v = g.snapshot().bots.find((b) => b.kind === 'voxxy')!;
      expect(`${name} ${err(v.face, ix, iy).toFixed(1)}`).toBe(`${name} 0.0`);
    }
  });
});

describe('aim — a ragged release is not a direction change', () => {
  it('holds the diagonal when one key of it lifts a few frames early', () => {
    const settleFrames = Math.floor(AIM_SETTLE / DT_MAX);
    for (const kind of KINDS) {
      for (const [name, ix, iy] of DIRS.filter(([, x, y]) => x !== 0 && y !== 0)) {
        for (const drop of ['x', 'y'] as const) {
          for (let lag = 1; lag <= settleFrames; lag++) {
            const b = mkBot(kind, 500, 350);
            hold(b, ix, iy, 90);
            hold(b, drop === 'x' ? 0 : ix, drop === 'y' ? 0 : iy, lag);
            coast(b);
            expect(`${kind} ${name} ${drop}${lag} ${err(b.face, ix, iy).toFixed(1)}`).toBe(
              `${kind} ${name} ${drop}${lag} 0.0`,
            );
          }
        }
      }
    }
  });

  it('believes a dropped axis that is actually held, once it has been held', () => {
    // Letting go of "up" to run straight east IS a direction change; it just has
    // to outlast a fumble. One frame past the window and the heading is east.
    const b = mkBot('voxxy', 500, 350);
    hold(b, 1, -1, 90);
    hold(b, 1, 0, Math.ceil(AIM_SETTLE / DT_MAX) + 1);
    expect(err(b.face, 1, 0)).toBeCloseTo(0, 6);
  });

  it('believes a genuinely new direction at once — aiming stays instant', () => {
    // A stick that presses something new is never waited out, whatever it drops.
    for (const [from, to] of [
      [[1, -1], [-1, -1]],
      [[1, -1], [0, 1]],
      [[1, 0], [1, 1]],
      [[0, 1], [1, 0]],
    ] as Array<[number[], number[]]>) {
      const b = mkBot('voxxy', 500, 350);
      hold(b, from[0], from[1], 90);
      hold(b, to[0], to[1], 1);
      expect(err(b.face, to[0], to[1])).toBeCloseTo(0, 6);
    }
  });
});

describe('aim — a body nobody is steering', () => {
  it('still takes its heading from the way it is sliding', () => {
    // Chapter 3's duck and crates, chapter 4's cake: no stick has ever touched
    // them, so `FACE_MIN_SPEED` and the velocity are still the whole rule.
    const crate = mkBody('Crate', 500, 350, { r: 8, mass: 4 });
    crate.vx = -30;
    crate.vy = -30;
    stepBot(crate, DT_MAX, []);
    expect(deg(crate.face)).toBeCloseTo(-135, 6);
  });

  it('turns again when the world starts moving it, and not before', () => {
    const b = mkBot('biggy', 500, 350);
    hold(b, 1, 0, 200);
    b.ix = 0;
    b.iy = 0;
    stepBot(b, DT_MAX, []);
    expect(err(b.face, 1, 0)).toBeCloseTo(0, 6);
    // A tow or a shove adds velocity between frames; a coast never does.
    b.vy -= 200;
    stepBot(b, DT_MAX, []);
    expect(deg(b.face)).toBeLessThan(-45);
  });

  it('advances the gait while it coasts, heading or no heading', () => {
    const b = mkBot('voxxy', 500, 350);
    hold(b, 1, 0, 60);
    b.ix = 0;
    b.iy = 0;
    const before = b.anim;
    stepBot(b, DT_MAX, []);
    expect(speed(b)).toBeGreaterThan(FACE_MIN_SPEED);
    expect(b.anim).toBeGreaterThan(before);
  });
});
