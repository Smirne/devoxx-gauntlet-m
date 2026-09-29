/**
 * THE SOUP, AS A PICTURE: the ladle, the pot, and what ends up on the floor.
 *
 * Michele, 28 Sep 2026, twice in the same round: *"Soup ladle should be visible -
 * visual hint."* and *"Soup graphics(including spilling and leaving spill on the
 * ground"*. All three were boxes out of the renderer's fallback table — a grey
 * slab on the floor under the shelf, a brown box a metre and a half behind the
 * robot carrying it, and, for a spill, a line in the flash bar and nothing else.
 *
 * What the renderer draws is not this file's business (`src/render/scene.ts` has
 * `drawLadle`, `drawPot` and `drawSpill`); what the SIM publishes is, because the
 * renderer can only draw what it is told. Three things are pinned here:
 *
 *  - the ladle prop sits on the shelf rect and says whether it is still there;
 *  - the pot is published at the CARRIER's own centre, so the renderer can put it
 *    in his hands — it used to be pushed 20 px north of him, which drew a pot
 *    standing on the floor behind the robot holding it;
 *  - every splash leaves a `spill` where the body was, they accumulate, and the
 *    list is bounded.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame } from '../src/sim';
import { GF } from '../src/sim/geometry';
import type { BreakfastState } from '../src/sim/chapters/ch3-breakfast';
import type { Bot, Prop } from '../src/sim/types';

const mk = (): DebugGame => createGame({ seed: 20260930, chapter: 3, cards: false });
const st = (g: DebugGame): BreakfastState => g.debug.chapter() as BreakfastState;
const props = (g: DebugGame, kind: string): Prop[] => g.snapshot().props.filter((p) => p.kind === kind);
const biggy = (g: DebugGame): Bot => g.snapshot().bots.find((b) => b.kind === 'biggy') as Bot;
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};

/** Ladle off the shelf, ladle into the pot, then the pot — the standard opening. */
function withThePot(g: DebugGame): void {
  g.debug.select('droid');
  g.debug.place('droid', 176, 150);
  g.key('KeyE');
  expect(st(g).ladle, 'Droid did not reach the shelf').toBe('carried');
  g.debug.place('droid', 105, 180);
  g.key('KeyE');
  expect(st(g).ladle, 'Droid did not drop it in the pot').toBe('in');
  g.debug.select('biggy');
  g.debug.place('biggy', 105, 180);
  g.key('KeyE');
  expect(st(g).carrying, 'the counter would not fill the pot').toBe(true);
}

describe('the ladle has three places, and the prop says which', () => {
  it('stands on the high shelf rect until Droid takes it', () => {
    const g = mk();
    const before = props(g, 'ladle');
    expect(before, 'no ladle prop').toHaveLength(1);
    // The prop IS the shelf rect: the renderer stands the ladle on the slab the
    // venue already builds there, so the two cannot drift apart.
    expect(before[0].x).toBe(GF.food.shelf.x);
    expect(before[0].y).toBe(GF.food.shelf.y);
    expect(before[0].w).toBe(GF.food.shelf.w);
    expect(before[0].state).toBe('idle');

    g.debug.select('droid');
    g.debug.place('droid', 176, 150);
    g.key('KeyE');
    expect(st(g).ladle).toBe('carried');
    // Taken: `active`, and the rect is now a small box on Droid himself, because
    // the shelf is empty and the ladle is walking.
    const held = props(g, 'ladle')[0];
    expect(held.state).toBe('active');
    const d = g.snapshot().bots.find((b) => b.kind === 'droid') as Bot;
    expect(Math.hypot(held.x + (held.w ?? 0) / 2 - d.x, held.y + (held.h ?? 0) / 2 - d.y)).toBeLessThan(2);
  });

  /*
   * Michele, 28 Sep 2026: *"I think droid should take it and drop it in the soup.
   * Otherwise the action is a bit pointless."* So taking it is not the end of the
   * row — the pot will not fill until the ladle is IN it, which is what makes the
   * walk between the shelf and the counter a job rather than a button.
   */
  it('will not let Biggy fill the pot until the ladle is in it', () => {
    const g = mk();
    g.debug.select('droid');
    g.debug.place('droid', 176, 150);
    g.key('KeyE');
    expect(st(g).ladle).toBe('carried');

    g.debug.select('biggy');
    g.debug.place('biggy', 105, 180);
    g.key('KeyE');
    expect(st(g).carrying, 'the pot filled with the ladle still in Droid\'s hand').toBe(false);

    g.debug.select('droid');
    g.debug.place('droid', 105, 180);
    g.key('KeyE');
    expect(st(g).ladle).toBe('in');
    expect(props(g, 'ladle')[0].state).toBe('done');

    g.debug.select('biggy');
    g.debug.place('biggy', 105, 180);
    g.key('KeyE');
    expect(st(g).carrying, 'the pot would not fill with the ladle in it').toBe(true);
    // ...and from here the ladle rides with the pot, not with the counter.
    const b = biggy(g);
    const l = props(g, 'ladle')[0];
    expect(Math.hypot(l.x + (l.w ?? 0) / 2 - b.x, l.y + (l.h ?? 0) / 2 - b.y)).toBeLessThan(2);
  });
});

describe('the pot is carried, not parked', () => {
  it('rides on the carrier, at his own centre', () => {
    const g = mk();
    expect(props(g, 'pot'), 'a pot nobody is carrying is drawn').toHaveLength(0);
    withThePot(g);
    const pot = props(g, 'pot')[0];
    const soup = props(g, 'soup')[0];
    const bg = biggy(g);
    expect(pot, 'no pot once he is carrying it').toBeTruthy();
    expect(Math.hypot(pot.x - bg.x, pot.y - bg.y), 'the pot is not where the robot is').toBeLessThan(1);
    expect(Math.hypot(soup.x - bg.x, soup.y - bg.y)).toBeLessThan(1);
    // Two props for one pot: the vessel carries the TEMPERATURE and the soup HOW
    // MUCH IS LEFT, because a prop has one `v` and the HUD needs both meters.
    expect(pot.v).toBeCloseTo(1, 2);
    expect(soup.v).toBeCloseTo(1, 2);

    // ...and he takes it with him. `snapshot()` hands back the live bodies, so the
    // starting x is read as a NUMBER before he is driven anywhere.
    const x0 = bg.x;
    g.setStick(1, 0);
    steps(g, 40);
    g.setStick(0, 0);
    const moved = biggy(g);
    expect(moved.x).toBeGreaterThan(x0);
    const after = props(g, 'pot')[0];
    expect(Math.hypot(after.x - moved.x, after.y - moved.y)).toBeLessThan(1);
  });
});

describe('a spill stays on the floor', () => {
  it('leaves a puddle where the body was, and one per splash', () => {
    const g = mk();
    withThePot(g);
    expect(props(g, 'spill'), 'the floor starts clean').toHaveLength(0);

    // A run-up and a wall: the spill is caused by the JERK, not by the speed, so
    // this is how a player empties a pot by accident.
    g.debug.place('biggy', 138, 270);
    g.setStick(0, -1);
    steps(g, 120);
    g.setStick(0, 0);

    const spills = props(g, 'spill');
    expect(spills.length, 'nothing was spilled by driving into the counter').toBeGreaterThan(0);
    expect(st(g).soup).toBeLessThan(100);
    const bg = biggy(g);
    // At his feet, not at the counter he hit or at the station he filled it from.
    const near = spills.some((p) => Math.hypot(p.x - bg.x, p.y - bg.y) < 60);
    expect(near, 'the puddle is nowhere near the robot that spilled it').toBe(true);
    // A puddle has a size, and the size is how much came out.
    for (const p of spills) expect(p.w ?? 0).toBeGreaterThan(8);
  });

  it('keeps the puddles, and keeps the list bounded', () => {
    const g = mk();
    withThePot(g);
    // Empty pot after empty pot: every batch adds its own marks to the floor.
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < 24 && st(g).carrying; i++) {
        g.debug.place('biggy', 138, 270);
        g.setStick(0, -1);
        steps(g, 120);
      }
      g.setStick(0, 0);
      g.debug.select('biggy');
      g.debug.place('biggy', 105, 180);
      g.key('KeyE');
    }
    const spills = props(g, 'spill');
    expect(spills.length, 'six ruined pots left no marks').toBeGreaterThan(3);
    expect(spills.length, 'the puddle list is unbounded').toBeLessThanOrEqual(14);
    expect(st(g).batches).toBeGreaterThan(1);
  });
});

describe('the ladle goes where the pot goes', () => {
  it('puts the ladle back in the counter pot once the soup has been handed over', () => {
    const g = mk();
    withThePot(g);
    const stephan = g.snapshot().people?.find((p) => p.role === 'stephan');
    expect(stephan).toBeTruthy();
    g.debug.place('biggy', (stephan?.x ?? 0) - 20, stephan?.y ?? 0);
    g.key('KeyE');
    expect(st(g).delivered).toBe(true);
    const l = props(g, 'ladle')[0];
    expect(l.state).toBe('done');
    expect(props(g, 'pot')).toHaveLength(0);
    const sx = GF.food.soup.x + 45;
    const sy = GF.food.soup.y + 15;
    expect(Math.hypot(l.x + (l.w ?? 0) / 2 - sx, l.y + (l.h ?? 0) / 2 - sy)).toBeLessThan(2);
  });
});
