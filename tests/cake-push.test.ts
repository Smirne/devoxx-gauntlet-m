/**
 * PUSHING THE CAKE IN A STRAIGHT LINE.
 *
 * Michele, 28 Sep 2026, playing chapter 4: *"the cake movement is a bit
 * imprevedible, especially west-east. I haven't managed to place it."*
 *
 * He was describing two discs. Biggy is a circle, the cake board is a circle, and
 * the push used to be pure contact physics — force along the line between the two
 * centres. That is a knife edge: a couple of pixels off the centre line turns a
 * push into a glance, the board leaves at an angle, he chases it and puts it back
 * the other way, and down a 20 m aisle it reads as a board with a mind of its own.
 *
 * `ch4-keynote.ts` now steers (`CAKE_STEER`: the push follows his stick as well as
 * the contact normal) and scrubs (`CAKE_SCRUB`: the castors kill sideways drift
 * while he is pushing). This file is the acceptance criterion for both, and the
 * measurement is the one he was making: start off centre, push, and see how far
 * sideways it has gone by the time it has crossed the room.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, DEFS, createGame, type DebugGame } from '../src/sim';
import type { Prop } from '../src/sim/types';

const SEED = 20260930;
const mk = (): DebugGame => createGame({ seed: SEED, chapter: 4, cards: false });
const cake = (g: DebugGame): Prop => {
  const p = g.snapshot().props.find((o) => o.kind === 'cake');
  if (!p) throw new Error('chapter 4 is not drawing a cake');
  return p;
};

/**
 * Put the cake at `x,y`, stand Biggy behind it `off` px off the centre line, and
 * push in `dir` for `seconds`. Reports how far it travelled along the push and how
 * far it wandered across it.
 */
function push(
  dir: [number, number],
  off: number,
  seconds = 3,
  at?: [number, number],
): { along: number; across: number } {
  const g = mk();
  const [dx, dy] = dir;
  // Where the chapter actually leaves it, unless the caller names a spot: the
  // corridor outside room 8, which is the floor Michele was pushing it along.
  at = at ?? [cake(g).x, cake(g).y];
  // Across the push, in sim space: the other axis.
  const [ax, ay] = [-dy, dx];
  const r = DEFS.biggy.r + 17;
  expect(g.debug.placeProp('cake', at[0], at[1])).toBe(true);
  g.debug.select('biggy');
  // Behind it along the push, and `off` to one side — the shot he could not make.
  g.debug.place('biggy', at[0] - dx * r + ax * off, at[1] - dy * r + ay * off);
  g.update(DT_MAX);
  const from = cake(g);
  const x0 = from.x;
  const y0 = from.y;
  g.setStick(dx, dy);
  for (let i = 0; i * DT_MAX < seconds; i++) g.update(DT_MAX);
  g.setStick(0, 0);
  const to = cake(g);
  return {
    along: (to.x - x0) * dx + (to.y - y0) * dy,
    across: Math.abs((to.x - x0) * ax + (to.y - y0) * ay),
  };
}

describe('the cake goes where Biggy pushes it', () => {
  it('tracks straight along the corridor, east to west, from dead behind', () => {
    const t = push([-1, 0], 0);
    expect(t.along, 'the cake barely moved').toBeGreaterThan(40);
    expect(t.across, 'a square push wandered off the line').toBeLessThan(6);
  });

  it('still tracks straight when he is half a body off the centre line', () => {
    // 6 px is a third of the board's own radius: a normal, human miss. This is the
    // measurement in Michele's note — "especially west-east".
    for (const off of [-6, 6]) {
      const t = push([-1, 0], off);
      expect(t.along, `off ${off}: the cake barely moved`).toBeGreaterThan(40);
      expect(t.across, `off ${off}: the cake wandered ${t.across.toFixed(0)} px off the line`).toBeLessThan(14);
    }
  });

  it('does the same north up the aisle, which is the push that ends the job', () => {
    const g = mk();
    const mark = g.snapshot().props.find((p) => p.kind === 'cake-mark');
    expect(mark).toBeDefined();
    const markX = mark!.x + (mark!.w ?? 0) / 2;
    for (const off of [0, 6]) {
      const t = push([0, -1], off, 3, [markX, mark!.y + 90]);
      expect(t.along).toBeGreaterThan(40);
      expect(t.across).toBeLessThan(14);
    }
  });

  /**
   * ...and it can still be STEERED, which is the other half of it: the fix must
   * not weld the board to one axis, or the aisle turn becomes impossible.
   */
  it('turns when he leans on a corner of it', () => {
    const g = mk();
    const at = { x: cake(g).x, y: cake(g).y };
    g.debug.select('biggy');
    // Behind and well to one side, pushing west: this is a corner shove and the
    // board is expected to come round rather than track dead straight.
    g.debug.place('biggy', at.x + (DEFS.biggy.r + 17) * 0.8, at.y + 18);
    g.update(DT_MAX);
    const y0 = cake(g).y;
    g.setStick(-1, 0);
    for (let i = 0; i * DT_MAX < 3; i++) g.update(DT_MAX);
    g.setStick(0, 0);
    const moved = cake(g);
    expect(moved.x, 'a corner shove did not move it at all').toBeLessThan(at.x - 10);
    expect(Math.abs(moved.y - y0), 'a corner shove no longer turns the board').toBeGreaterThan(3);
  });
});
