/**
 * THE RECEPTION BLOCK, AGAINST MICHELE'S 24 SEP NOTES.
 *
 * Two of his lobby notes were shape faults, not dressing faults, so they belong
 * here rather than in a screenshot:
 *
 *   *"Reception i don't get it. There's a wood panel longer than the room. If
 *   it's the counter it should be lower, a half square, two sides (west and
 *   south): and it should be hollow inside. The printer might be on the reception
 *   counter, so no need to enter?"*
 *
 *   *"Coat room / Wardrobe opening should be west."*
 *
 * A solid block and an L read the same from most angles and behave completely
 * differently, which is exactly the kind of thing a test should hold.
 */

import { describe, expect, it } from 'vitest';

import { COUNTER, GF, groundWalls } from '../src/sim/geometry';
import { T } from '../src/sim/constants';
import type { Rect, Wall } from '../src/sim/types';

const hits = (walls: readonly Wall[], x: number, y: number): Wall[] =>
  walls.filter((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h);

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('the reception counter', () => {
  const walls = groundWalls();
  const desks = walls.filter((w) => w.kind === 'desk');
  const r = GF.reception;

  it('is two runs, not one slab — the fault Michele read as a wood panel', () => {
    expect(desks).toHaveLength(2);
    for (const d of desks) expect(d.low).toBe(true);
  });

  it('closes the west and the south face, and nothing else', () => {
    const west = desks.find((d) => d.w <= COUNTER);
    const south = desks.find((d) => d.h <= COUNTER);
    expect(west).toBeDefined();
    expect(south).toBeDefined();
    // West run: the full height of the block, on its west edge.
    expect(west!.x).toBe(r.x);
    expect(west!.h).toBe(r.h);
    // South run: the rest of the width, on its south edge.
    expect(south!.y + south!.h).toBe(r.y + r.h);
    expect(south!.x + south!.w).toBe(r.x + r.w);
    // Neither closes the north or the east face.
    for (const d of desks) {
      expect(d.y).toBeLessThan(r.y + r.h);
      expect(d.x).toBeLessThan(r.x + r.w);
    }
  });

  it('is HOLLOW — the middle of the desk is open floor', () => {
    // A grid over the interior, inset past both runs. Every sample must be clear
    // of every ground wall, not merely of the desk: a hollow desk that another
    // prop fills is not hollow.
    for (let x = r.x + COUNTER + 6; x < r.x + r.w - 6; x += 8) {
      for (let y = r.y + 6; y < r.y + r.h - COUNTER - 6; y += 8) {
        expect(hits(walls, x, y)).toHaveLength(0);
      }
    }
  });

  it('carries the printer ON the south run, so nobody has to go behind it', () => {
    const south = desks.find((d) => d.h <= COUNTER)!;
    expect(overlaps(GF.printer, south)).toBe(true);
    // And the printer is reachable from the concourse side: the strip of floor
    // immediately south of the run is clear.
    for (let x = GF.printer.x; x <= GF.printer.x + GF.printer.w; x += 5) {
      expect(hits(walls, x, r.y + r.h + 8)).toHaveLength(0);
    }
  });
});

describe('the wardrobe', () => {
  const walls = groundWalls();
  const co = GF.coatroom;
  const shell = walls.filter((w) => w.kind === 'coatroom');
  const counter = walls.filter((w) => w.kind === 'coat-counter');

  it('hands out over its WEST face, which is the only side anyone can stand at', () => {
    expect(counter).toHaveLength(1);
    const c = counter[0];
    expect(c.low).toBe(true);
    expect(c.x).toBe(co.x);
    expect(c.w).toBe(COUNTER);
    // Tall enough to be the face, not a stub in the corner of it.
    expect(c.h).toBeGreaterThan(co.h * 0.8);
  });

  it('is closed on the other three sides', () => {
    expect(shell).toHaveLength(3);
    const north = shell.find((w) => w.y === co.y && w.w === co.w);
    const east = shell.find((w) => w.x === co.x + co.w - T);
    const south = shell.find((w) => w.y === co.y + co.h - T);
    expect(north).toBeDefined();
    expect(east).toBeDefined();
    expect(south).toBeDefined();
  });

  it('no longer opens south into the back of the reception desk', () => {
    // The old shape left the whole south face open but for a low counter. Walk
    // the face: every sample must be inside a wall now.
    for (let x = co.x + T + 4; x < co.x + co.w - T - 4; x += 8) {
      expect(hits(walls, x, co.y + co.h - T / 2).length).toBeGreaterThan(0);
    }
  });
});
