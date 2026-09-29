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

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { cakeTrolley } from '../src/render3d/keynote3d';
import { DT_MAX, DEFS, PUSH_REACH, createGame, type Bot, type DebugGame } from '../src/sim';
import type { Prop } from '../src/sim/types';
import { PX_PER_M } from '../src/sim/units';

const SEED = 20260930;
const mk = (): DebugGame => createGame({ seed: SEED, chapter: 4, cards: false });
const cake = (g: DebugGame): Prop => {
  const p = g.snapshot().props.find((o) => o.kind === 'cake');
  if (!p) throw new Error('chapter 4 is not drawing a cake');
  return p;
};
const biggy = (g: DebugGame): Bot => {
  const b = g.snapshot().bots.find((o) => o.kind === 'biggy');
  if (!b) throw new Error('no Biggy');
  return b;
};
/** Daylight between Biggy and the board, circle to circle, px. Negative is overlap. */
const gap = (g: DebugGame): number => {
  const c = cake(g);
  const b = biggy(g);
  return Math.hypot(c.x - b.x, c.y - b.y) - b.r - (c.w ?? 0) / 2;
};

/**
 * Put the cake at `x,y`, stand Biggy behind it `off` px off the centre line, and
 * push in `dir` for `seconds`. Reports how far it travelled along the push and how
 * far it wandered across it. `each` is called after every frame of the push.
 */
function push(
  dir: [number, number],
  off: number,
  seconds = 3,
  at?: [number, number],
  each?: (g: DebugGame) => void,
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
  for (let i = 0; i * DT_MAX < seconds; i++) {
    g.update(DT_MAX);
    each?.(g);
  }
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
      // 2.2 s: the ~92 px of push that 3 s gave before Biggy's accel went 0.6 ->
      // 1.5 (Michele, 29 Sep). The same shove, measured over the same floor.
      const t = push([-1, 0], off, 2.2);
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

/* ---------------------------------------------------------------------------
 * PUSHING IT WITH A HAND ON IT.
 *
 * Michele, 29 Sep 2026, with a screenshot of Biggy shoving the trolley down the
 * corridor with daylight between them: *"cake is pushed from too far"*.
 *
 * It was, by two things at once. The sim pushed it from up to 16 px past touching
 * (`CAKE_TOUCH`, 1.28 m), and a board shoved that hard runs off from a robot who
 * accelerates at 1.5 s⁻¹, so it ran ahead into that window: the dead-square shove
 * below was pushing it from up to 9.8 px (0.78 m) of daylight, and the test
 * pilot's drive into Room 8 from 12.5–16 px without ever touching it. And the 3D
 * board was a square that stopped 2.55 px short of the disc the sim collides with.
 * The push is `PUSH_REACH` now, the robots' own rule, and the board is the disc;
 * these are the two halves of that, measured.
 */
describe('Biggy pushes the cake with a hand on it', () => {
  it('does not move it from across a gap, only once he is touching it', () => {
    // 12 px is 0.96 m of daylight, inside the 16 the old push reached across.
    for (const start of [4, 12]) {
      const g = mk();
      const at = cake(g);
      g.debug.select('biggy');
      g.debug.place('biggy', at.x + DEFS.biggy.r + (at.w ?? 0) / 2 + start, at.y);
      g.update(DT_MAX);
      const x0 = cake(g).x;
      const y0 = cake(g).y;
      g.setStick(-1, 0);
      /*
       * The daylight on the frame it first moves. A push lands on the frame
       * BEFORE the board moves (it changes a velocity, and the board is stepped
       * next frame), and a collision moves it on the frame itself — so it is the
       * smaller of the two gaps that has to be a hand's breadth.
       */
      let was = gap(g);
      let movedAt: number | null = null;
      for (let i = 0; i * DT_MAX < 3 && movedAt === null; i++) {
        g.update(DT_MAX);
        const now = gap(g);
        if (cake(g).x !== x0 || cake(g).y !== y0) movedAt = Math.min(was, now);
        was = now;
      }
      expect(movedAt, `from ${start} px away he never moved it`).not.toBeNull();
      expect(movedAt!, `from ${start} px away it moved with ${movedAt!.toFixed(2)} px of daylight between them`).toBeLessThanOrEqual(PUSH_REACH);
    }
  });

  /**
   * ...and it never picks up speed with daylight between them, the whole length of
   * the shoves this file already makes. Drag only ever slows the board, so a frame
   * it is going faster than the one before is a frame something shoved it — and
   * the only thing near it is Biggy.
   */
  it('has a hand on it every time the board picks up speed', () => {
    const g0 = mk();
    const mark = g0.snapshot().props.find((p) => p.kind === 'cake-mark')!;
    const aisle: [number, number] = [mark.x + (mark.w ?? 0) / 2, mark.y + 90];
    const shoves: Array<[string, [number, number], number, [number, number]?]> = [
      ['west, dead behind', [-1, 0], 0],
      ['west, 6 px off the line', [-1, 0], -6],
      ['west, 6 px off the other way', [-1, 0], 6],
      ['north up the aisle', [0, -1], 0, aisle],
      ['north up the aisle, 6 px off', [0, -1], 6, aisle],
    ];
    for (const [name, dir, off, at] of shoves) {
      const daylight: number[] = [];
      let last: { x: number; y: number } | null = null;
      let lastSpeed = 0;
      let lastGap = 0;
      const t = push(dir, off, 3, at, (g) => {
        const c = cake(g);
        const now = gap(g);
        if (last) {
          const sp = Math.hypot(c.x - last.x, c.y - last.y) / DT_MAX;
          if (sp > lastSpeed + 0.1) daylight.push(Math.min(lastGap, now));
          lastSpeed = sp;
        }
        last = { x: c.x, y: c.y };
        lastGap = now;
      });
      expect(t.along, `${name}: the cake barely moved`).toBeGreaterThan(40);
      // Seven or eight a push: it only gains speed until it is at its own top
      // speed with him leaning on it, and from then on it holds.
      expect(daylight.length, `${name}: never caught it picking up speed`).toBeGreaterThanOrEqual(5);
      const worst = Math.max(...daylight);
      expect(worst, `${name}: shoved with ${worst.toFixed(2)} px of daylight between them`).toBeLessThanOrEqual(PUSH_REACH);
    }
  });

  /**
   * ...AND THE BOARD IS DRAWN WHERE HE TOUCHES IT. The 3D trolley, built exactly as
   * the renderer builds it, reaches the sim's own radius in every direction round
   * it — not short of it, which is daylight on a square push, and not past it,
   * which is a robot drawn standing in the board.
   */
  it('draws the trolley the size of the disc the sim pushes, from every side', () => {
    const p = cake(mk());
    const mat = new THREE.MeshPhysicalMaterial();
    const o = cakeTrolley(p, { darkMetal: mat, rubber: mat, steel: mat });
    o.updateMatrixWorld(true);
    const R = (p.w ?? 0) / 2 / PX_PER_M;
    // How far the drawn trolley reaches in each of 72 directions round its centre.
    const reach = new Array<number>(72).fill(-Infinity);
    const v = new THREE.Vector3();
    o.traverse((n) => {
      if (!(n instanceof THREE.Mesh)) return;
      const pos = n.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld);
        for (let k = 0; k < reach.length; k++) {
          const a = (k / reach.length) * Math.PI * 2;
          reach[k] = Math.max(reach[k], v.x * Math.cos(a) + v.z * Math.sin(a));
        }
      }
    });
    for (const [k, r] of reach.entries()) {
      // A centimetre is an eighth of a sim pixel.
      expect(Math.abs(r - R), `at ${k * 5}°, the trolley reaches ${r.toFixed(3)} m against the sim's ${R.toFixed(3)} m`).toBeLessThan(0.01);
    }
    mat.dispose();
  });
});
