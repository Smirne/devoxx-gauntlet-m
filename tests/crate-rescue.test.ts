/**
 * The one way chapter 3 could dead-end, and the guard against it.
 *
 * `beerDone` needs all six crates on the bar. A crate is a 0.32 m body in a hall
 * built for 0.72 m robots, so there are places a crate fits and Biggy does not —
 * and a crate in one of them is a run that can never be finished. This file
 * names the place, proves it is a trap, and proves the guard gets a crate out of
 * it. See `crateReachable` / `crateRescueSpot` in `src/sim/crates.ts`.
 */

import { describe, expect, it } from 'vitest';

import { circleRect } from '../src/sim/bot';
import { DEFS, H, W } from '../src/sim/constants';
import { CRATE_R, crateReachable, crateRescueSpot } from '../src/sim/crates';
import { GF } from '../src/sim/geometry';
import { createGame } from '../src/sim/game';
import type { Wall } from '../src/sim/types';

/** Chapter 3's live wall list, a couple of seconds in. */
function hallWalls(): Wall[] {
  const g = createGame({ chapter: 3, cards: false });
  for (let i = 0; i < 120; i++) g.update(0.016);
  return g.snapshot().walls as Wall[];
}

const BR = DEFS.biggy.r;

/**
 * THE SLOT. Between the sandwich counter and the coffee counter, backed by the
 * hall's north wall: `GF.food.sandwich` ends at x 270 and `GF.food.coffee` starts
 * at 285, both spanning y 100..130. 15 px — 1.2 m — against Biggy's 1.44 m.
 *
 * **The BACK of it**, and that is not fussiness. The slot is 30 px deep and
 * `CRATE_REACH` is 26, so a crate in the mouth is still something Biggy can lean
 * in and take from the open floor outside — measured: at y 112 there is exactly
 * one standing spot left, dead ahead at 25 px. Only past about y 108 does the
 * last of them go, and that is where the trap actually is.
 *
 * Written out of `GF` rather than as three magic numbers, so that moving a
 * counter moves the test with it instead of quietly making it about empty floor.
 */
const SLOT = {
  x: (GF.food.sandwich.x + GF.food.sandwich.w + GF.food.coffee.x) / 2,
  y: GF.food.sandwich.y + CRATE_R,
};

describe('a crate nobody can reach', () => {
  it('has somewhere to be stranded — the slot between the counters is real', () => {
    const walls = hallWalls();
    const gap = GF.food.coffee.x - (GF.food.sandwich.x + GF.food.sandwich.w);
    // Wide enough for a crate, too narrow for Biggy. That is the whole trap.
    expect(gap).toBeGreaterThan(CRATE_R * 2);
    expect(gap).toBeLessThan(BR * 2);
    const clear = (x: number, y: number, r: number): boolean =>
      !walls.some((w) => !w.hidden && circleRect({ x, y, r }, w) !== null);
    expect(clear(SLOT.x, SLOT.y, CRATE_R), 'a crate fits in the slot').toBe(true);
    expect(clear(SLOT.x, SLOT.y, BR), 'Biggy does not').toBe(false);
  });

  it('calls a crate in the slot unreachable, and open floor reachable', () => {
    const walls = hallWalls();
    expect(crateReachable(SLOT.x, SLOT.y, BR, walls)).toBe(false);
    // The pallet, the bar drop and the middle of the hall are all fine, or the
    // guard would be firing on crates that are simply lying about.
    for (const p of [
      { x: 600, y: 158 },
      { x: 382, y: 148 },
      { x: 700, y: 400 },
    ]) {
      expect(crateReachable(p.x, p.y, BR, walls), `${p.x},${p.y}`).toBe(true);
    }
  });

  it('walks a stranded crate back out to somewhere Biggy can reach', () => {
    const walls = hallWalls();
    const spot = crateRescueSpot(SLOT.x, SLOT.y, BR, walls);
    expect(spot).not.toBeNull();
    const s = spot as { x: number; y: number };
    expect(crateReachable(s.x, s.y, BR, walls)).toBe(true);
    // Out the way it went in — the nearest way out, not a teleport across the hall.
    expect(Math.hypot(s.x - SLOT.x, s.y - SLOT.y)).toBeLessThan(60);
  });

  /**
   * The guard is only worth having if it is quiet everywhere else: a rescue that
   * fires on a crate lying in the open would shuffle the delivery around under
   * the player. Swept over the whole floor, the cells it calls stranded have to
   * stay a rounding error.
   */
  it('is quiet on the rest of the floor', () => {
    const walls = hallWalls();
    const clear = (x: number, y: number, r: number): boolean =>
      !walls.some((w) => !w.hidden && circleRect({ x, y, r }, w) !== null);
    let fits = 0;
    let stranded = 0;
    for (let x = 20; x < W - 20; x += 8) {
      for (let y = 20; y < H - 20; y += 8) {
        if (!clear(x, y, CRATE_R)) continue;
        fits++;
        if (!crateReachable(x, y, BR, walls)) stranded++;
      }
    }
    expect(fits).toBeGreaterThan(10000);
    expect(stranded / fits).toBeLessThan(0.002);
  });
});
