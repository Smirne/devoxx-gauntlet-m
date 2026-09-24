/**
 * A CUTSCENE IS A WALK — measured, per robot, per transition.
 *
 * Michele: *"the animation between chapter 1 and 2 is better, but the walk is long
 * and they are running a bit too fast."* Measured through chapter 1's transition
 * frame by frame, with the `CUT_PLACE_AT` teleport excluded:
 *
 * ```
 * voxxy  497 px in 7.23 s   top 109.2 px/s   151% of her own max
 * droid  481 px             top 105.7 px/s   263% of his
 * biggy  471 px             top 103.5 px/s   176% of his
 * ```
 *
 * Droid was being driven at two and a half times the fastest he can physically
 * move. The gait is driven by that speed (`b.anim += sp * dt / CUT_ANIM_DIV` in
 * `game.ts`, and `updateRobot` takes `speedMps` straight off the snapshot), so his
 * legs were being asked to run at a rate the rig was never tuned for. That is a
 * physics-realism bug, not a pacing note — 20 of the 100 points are physics.
 *
 * The cause was arithmetic: `pace = routeLength / CUT_WALK_TIME`, and chapter 1's
 * route got 180 px longer when the secondary staircases moved to where the plan
 * puts them (24 Sep). It was already at 134% of Droid's max before that.
 *
 * This file is the durable half of the fix. It plays every transition in the game
 * and asserts that **no robot is ever moved faster than its own `max`** while the
 * game is in `cut`. Whatever a chapter writes as a route, and wherever a waypoint
 * moves to next, the shot has to stay a walk.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame, type NightState, type RobotKind } from '../src/sim';
import { playToStairGate } from './pilot';
// Vite's own `?raw`, not `node:fs`: the repo has no `@types/node` and
// `tsconfig.json` pins `types` to `vite/client` (see `tests/clue-plate.test.ts`).
import CH1_SRC from '../src/sim/chapters/ch1-night.ts?raw';
import CH2_SRC from '../src/sim/chapters/ch2-expo.ts?raw';
import CH3_SRC from '../src/sim/chapters/ch3-breakfast.ts?raw';
import CH4_SRC from '../src/sim/chapters/ch4-keynote.ts?raw';

/** Slack on the per-frame measurement: one frame of `dt` rounding, no more. */
const SLACK = 1.02;

interface Measured {
  frames: number;
  top: Map<RobotKind, number>;
  walked: Map<RobotKind, number>;
  max: Map<RobotKind, number>;
  reached: number | null;
}

/**
 * Run the game until it leaves the chapter it is in, watching every `cut` frame.
 *
 * Speeds are measured as the distance a robot actually moved between two frames
 * rather than off `b.vx/b.vy`, because the thing being asserted is where the
 * renderer puts the robot and how fast the gait is therefore driven. The
 * `CUT_PLACE_AT` teleport is a jump of hundreds of pixels in one frame and is
 * excluded — it happens under a full black screen and is not a walk.
 */
function measureCut(g: DebugGame, budget = 1200): Measured {
  const top = new Map<RobotKind, number>();
  const walked = new Map<RobotKind, number>();
  const max = new Map<RobotKind, number>();
  const from = g.snapshot().chapter;
  let prev = new Map(g.snapshot().bots.map((b) => [b.kind, { x: b.x, y: b.y }]));
  let frames = 0;
  let reached: number | null = null;
  for (let i = 0; i < budget; i++) {
    g.update(DT_MAX);
    const s = g.snapshot();
    if (s.phase === 'cut') {
      frames++;
      for (const b of s.bots) {
        const p = prev.get(b.kind);
        if (!p) continue;
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        max.set(b.kind, b.max);
        // A teleport, not a step: `CUT_PLACE_AT` moves the cast to the head of its
        // route under the black. Anything under 60 px in a 33 ms frame is a walk.
        if (d > 60) continue;
        top.set(b.kind, Math.max(top.get(b.kind) ?? 0, d / DT_MAX));
        walked.set(b.kind, (walked.get(b.kind) ?? 0) + d);
      }
    }
    prev = new Map(s.bots.map((b) => [b.kind, { x: b.x, y: b.y }]));
    if (s.chapter !== from) {
      reached = s.chapter;
      break;
    }
  }
  return { frames, top, walked, max, reached };
}

function expectAWalk(m: Measured, label: string): void {
  expect(m.frames, `${label}: no cutscene ran at all`).toBeGreaterThan(20);
  for (const [kind, top] of m.top) {
    const own = m.max.get(kind) ?? 0;
    expect(
      top,
      `${label}: ${kind} is driven at ${top.toFixed(1)} px/s, ` +
        `${((top / own) * 100).toFixed(0)}% of his own max of ${own.toFixed(1)}. A cutscene is a WALK — ` +
        'the ROUTE has to shrink (`trimRoute` in src/sim/game.ts), not the clamp',
    ).toBeLessThanOrEqual(own * SLACK);
  }
}

/** Chapter 1: type the code at the fire door and let the leaves swing. */
function runChapter1(): DebugGame {
  const g = createGame({ seed: 20260930, chapter: 1, cards: false });
  g.debug.select('biggy');
  g.debug.place('biggy', 575, 305);
  g.update(DT_MAX);
  for (const d of (g.debug.chapter() as NightState).code) g.key(`Digit${d}`);
  expect((g.debug.chapter() as NightState).fireOpen).toBe(true);
  return g;
}

describe('no robot is ever run faster than it can walk', () => {
  it('chapter 1 to 2 — down the secondary staircase', () => {
    const g = runChapter1();
    const m = measureCut(g);
    expect(m.reached, 'chapter 1 never handed over').toBe(2);
    expectAWalk(m, 'chapter 1 to 2');
  });

  /**
   * ...and the other two chapters, which is the half of this that has to keep
   * being true rather than the half that was broken.
   *
   * Chapter 2 hands over with a bare `startChapter(3)` the moment the printer comes
   * up behind the torn shutter, and chapter 4 ends on `ctx.finish()`: neither walks
   * anybody anywhere, so neither has a pace to get wrong. That is asserted off the
   * chapters' own source, so a transition added to either one fails HERE, with a
   * message saying to come and measure it — rather than shipping at 2.6x Droid's
   * top speed the way chapter 1's did.
   */
  it('names every chapter that runs a walk, so a new one cannot arrive unmeasured', () => {
    const sources: Array<[string, string]> = [
      ['ch1-night.ts', CH1_SRC],
      ['ch2-expo.ts', CH2_SRC],
      ['ch3-breakfast.ts', CH3_SRC],
      ['ch4-keynote.ts', CH4_SRC],
    ];
    const walks = sources.filter(([, src]) => src.includes('ctx.startCut(')).map(([name]) => name);
    expect(
      walks,
      'a chapter has gained (or lost) a cutscene walk. Every walk in the game is measured in this ' +
        'file, per robot, against that robot\'s own `max` — add the new one rather than editing this list',
    ).toEqual(['ch1-night.ts', 'ch3-breakfast.ts']);
  });

  it('chapter 3 to 4 — up the main staircase', { timeout: 30000 }, () => {
    const g = createGame({ seed: 20260930, chapter: 3, cards: false });
    for (let i = 0; i < 4; i++) g.update(DT_MAX);
    playToStairGate(g);
    const m = measureCut(g, 2000);
    expect(m.reached, 'chapter 3 never handed over').toBe(4);
    expectAWalk(m, 'chapter 3 to 4');
  });

  /**
   * And the guard, from the other side: `trimRoute` shortens the run-up rather
   * than clamping the pace, so the cast must still REACH its mark. A clamped pace
   * on an over-long route ends the leg at `CUT_WALK_MAX` with three robots
   * standing in the wrong place, which is a worse failure than a fast walk.
   */
  it('still lands the cast on its mark rather than running out of time', () => {
    const g = runChapter1();
    const m = measureCut(g);
    expect(m.reached).toBe(2);
    // The chapter-1 exit converges all three on the stairwell mouth. Chapter 2
    // places them itself on arrival, so what is checked is that the leg ENDED by
    // arriving — `CUT_WALK_TIME` is 4.6 s and `CUT_WALK_MAX` is 9 s, so a leg that
    // timed out would be half as long again as one that finished.
    expect(m.frames * DT_MAX, 'the walk ran out of time instead of arriving').toBeLessThan(8);
  });
});
