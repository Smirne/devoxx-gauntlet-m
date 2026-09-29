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

import { DT_MAX, circleRect, createGame, type DebugGame, type GameSnapshot, type NightState, type RobotKind } from '../src/sim';
import { finishChapter2, openFrontDoors, playToStairGate } from './pilot';
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
  /** How far each robot walked while the closing fade came down. */
  inFade: Map<RobotKind, number>;
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
  const inFade = new Map<RobotKind, number>();
  let clear = false;
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
        // route under the black. Anything under 60 px in a 33 ms frame is a walk —
        // except under a full black, where the placing is, however short the jump:
        // chapter 3 lines the cast up at the belt line, and a robot that was already
        // standing near Stephan is moved a few px, which is not a walk either.
        if (d > 60 || s.fade >= 0.99) continue;
        top.set(b.kind, Math.max(top.get(b.kind) ?? 0, d / DT_MAX));
        walked.set(b.kind, (walked.get(b.kind) ?? 0) + d);
        if (clear && s.fade > 0) inFade.set(b.kind, (inFade.get(b.kind) ?? 0) + d);
      }
      // The walk's own fade-in has lifted: any black from here on is the closing one.
      if (s.fade === 0) clear = true;
    }
    prev = new Map(s.bots.map((b) => [b.kind, { x: b.x, y: b.y }]));
    if (s.chapter !== from) {
      reached = s.chapter;
      break;
    }
  }
  return { frames, top, walked, max, reached, inFade };
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

/** Chapter 2: every job done, and E at the front doors — the let-in follows. */
function runChapter2(): DebugGame {
  const g = createGame({ seed: 20260930, chapter: 2, cards: false });
  g.update(DT_MAX);
  finishChapter2(g);
  // Up to the E at the doors; whatever measures the cutscene watches what follows.
  expect(openFrontDoors(g, 'voxxy', false, false)).toBe(true);
  return g;
}

/**
 * Every frame of the cutscene that leaves `from`, with the picture up: the black
 * frames are where the walker places the cast, which is a teleport, not a walk.
 */
function eachCutFrame(g: DebugGame, from: number, see: (s: GameSnapshot, n: number) => void): number {
  let n = 0;
  for (let i = 0; i < 1200 && g.snapshot().chapter === from; i++) {
    g.update(DT_MAX);
    const s = g.snapshot();
    if (s.chapter !== from || s.phase !== 'cut' || s.fade >= 0.99) continue;
    see(s, ++n);
  }
  return n;
}

/** On this frame, no two robots stand inside one another. */
function expectApart(s: GameSnapshot, n: number): void {
  for (let a = 0; a < s.bots.length; a++) {
    for (let b = a + 1; b < s.bots.length; b++) {
      const A = s.bots[a];
      const B = s.bots[b];
      const gap = Math.hypot(A.x - B.x, A.y - B.y) - A.r - B.r;
      expect(gap, `${A.kind} inside ${B.kind} on cutscene frame ${n}`).toBeGreaterThanOrEqual(-0.5);
    }
  }
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
   * Chapter 4 ends on `ctx.finish()`: it walks nobody anywhere, so it has no pace to
   * get wrong. (Chapter 2 used to hand over with a bare `startChapter(3)` too; since
   * 29 Sep it ends on the front doors, and its walk is measured above.) That is
   * asserted off the chapters' own source, so a transition added to any of them
   * fails HERE, with a message saying to come and measure it — rather than
   * shipping at 2.6x Droid's top speed the way chapter 1's did.
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
    ).toEqual(['ch1-night.ts', 'ch2-expo.ts', 'ch3-breakfast.ts']);
  });

  it('chapter 2 to 3 — in through the front doors, after Stephan', { timeout: 30000 }, () => {
    const m = measureCut(runChapter2(), 2000);
    expect(m.reached, 'chapter 2 never handed over').toBe(3);
    expectAWalk(m, 'chapter 2 to 3');
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

  /*
   * Michele, 29 Sep: *"in the cutscene after chapter 1 droid walks through biggy"*.
   * The walker moves bodies without colliding them (walls and robots alike are
   * ignored on a route), so the ROUTES have to keep them apart: on no frame of
   * the walk may two robots stand inside one another. Biggy's lane used to cross
   * Droid's on the way down to the stairs, and they overlapped for 45 frames.
   */
  it('never walks one robot through another (chapter 1 to 2)', () => {
    const g = runChapter1();
    const n = eachCutFrame(g, 1, expectApart);
    expect(g.snapshot().chapter, 'chapter 1 never handed over').toBe(2);
    expect(n, 'no cutscene frames were seen').toBeGreaterThan(20);
  });

  /*
   * ...and chapter 2's, which since Michele's *"Let them regroup before the door,
   * then they open, Stephan is outside and enters"* (29 Sep) is three robots on
   * their marks in front of the front doors, a man walking in through them, and
   * the three walking up the lobby after him (`LET_IN` in `ch2-expo.ts`). The
   * walker ignores walls as well as robots, and Stephan is walked by the chapter,
   * so the routes are also all that keeps anybody out of the building's fabric:
   * on no frame with the picture up may a robot, or Stephan, stand inside a wall —
   * the shut leaves included, which is why they stay walls until they swing.
   */
  it('never walks one robot through another, nor anybody through a wall (chapter 2 to 3)', { timeout: 30000 }, () => {
    const g = runChapter2();
    let seen = 0;
    const n = eachCutFrame(g, 2, (s, k) => {
      expectApart(s, k);
      for (const b of s.bots) {
        for (const w of s.walls) {
          if (w.skipFor?.(b)) continue;
          expect(circleRect(b, w), `${b.kind} inside a ${w.kind ?? 'wall'} on cutscene frame ${k}`).toBeNull();
        }
      }
      for (const p of s.people) {
        seen++;
        for (const w of s.walls) {
          expect(circleRect(p, w), `${p.name ?? p.role} inside a ${w.kind ?? 'wall'} on cutscene frame ${k}`).toBeNull();
        }
      }
    });
    expect(g.snapshot().chapter, 'chapter 2 never handed over').toBe(3);
    expect(n, 'no cutscene frames were seen').toBeGreaterThan(20);
    expect(seen, 'nobody walked in: the let-in has nobody in it').toBeGreaterThan(20);
  });

  /*
   * Michele, 29 Sep: *"the robots stop walking before the transition. They should
   * keep walking with a fade out effect."* So nobody stands still for the black:
   * each robot is still on the move while the closing fade comes down, unless the
   * room itself stops it (a wall, the robot in front).
   */
  it('keeps them walking while the black comes down', { timeout: 30000 }, () => {
    const one = measureCut(runChapter1());
    // Chapter 2's closing fade comes down on the three following Stephan in.
    const two = measureCut(runChapter2(), 2000);
    const g = createGame({ seed: 20260930, chapter: 3, cards: false });
    for (let i = 0; i < 4; i++) g.update(DT_MAX);
    playToStairGate(g);
    const three = measureCut(g, 2000);
    for (const [label, m] of [['chapter 1 to 2', one], ['chapter 2 to 3', two], ['chapter 3 to 4', three]] as const) {
      const moved = [...m.inFade.values()].filter((d) => d > 5).length;
      expect(moved, `${label}: ${JSON.stringify([...m.inFade])} — the cast stopped before the fade`).toBeGreaterThanOrEqual(2);
    }
  });
});
