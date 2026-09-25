/**
 * tests/pilot.ts — the test pilot: a robot driven to a point the way a player
 * would drive it.
 *
 * It lived inside `tests/chapters.test.ts`, which was fine while that was the only
 * file that played a chapter through. `tests/colliders.test.ts` now plays chapter 3
 * end to end as well — its post-gate sweep needs Stephan's gate OPEN, and the only
 * way to that state is soup, speaker and the beer delivery — and a second copy of
 * an A* router is exactly the drift this repo keeps writing tests against. So it is
 * a shared module.
 *
 * This file is NOT a test (the runner collects `tests/**\/*.test.ts`), it is the
 * harness those tests share.
 */

import { expect } from 'vitest';

import {
  CRATE_STACK_LIMIT,
  DT_MAX,
  GF,
  circleRect,
  type Bot,
  type BreakfastState,
  type DebugGame,
  type Prop,
  type RobotKind,
  type Vec2,
  type Wall,
} from '../src/sim';

/** The robot of this kind, off the public snapshot. */
export const bot = (g: DebugGame, kind: RobotKind): Bot => {
  const b = g.snapshot().bots.find((o) => o.kind === kind);
  if (!b) throw new Error(`no ${kind}`);
  return b;
};

/* --------------------------------------------------------------- a test pilot
 *
 * The prototype's Playwright run held arrow keys down along a route. A headless
 * test has no browser to hold keys in, so this is the same thing: an eight-way
 * stick aimed at the next waypoint, and a grid router that only ever proposes
 * waypoints the robot can actually walk to — including under the sponsor tables
 * that Voxxy, and only Voxxy, fits beneath.
 */

const GRID = 10;

export function passable(walls: Wall[], b: Bot, x: number, y: number): boolean {
  const c = { x, y, r: b.r + 1 };
  for (const w of walls) {
    if (w.skipFor && w.skipFor(b)) continue;
    if (circleRect(c, w)) return false;
  }
  return true;
}

/** Eight-way A* on a `GRID`-pixel lattice, no corner cutting. */
export function findPath(g: DebugGame, kind: RobotKind, target: Vec2): Vec2[] {
  const b = bot(g, kind);
  const walls = g.debug.walls();
  const free = new Map<number, boolean>();
  const key = (ix: number, iy: number): number => iy * 1000 + ix;
  const ok = (ix: number, iy: number): boolean => {
    if (ix < 0 || iy < 0 || ix * GRID > 1900 || iy * GRID > 700) return false;
    const k = key(ix, iy);
    let v = free.get(k);
    if (v === undefined) {
      v = passable(walls, b, ix * GRID, iy * GRID);
      free.set(k, v);
    }
    return v;
  };

  const sx = Math.round(b.x / GRID);
  const sy = Math.round(b.y / GRID);
  const gx = Math.round(target.x / GRID);
  const gy = Math.round(target.y / GRID);
  const h = (ix: number, iy: number): number => {
    const dx = Math.abs(ix - gx);
    const dy = Math.abs(iy - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  const gScore = new Map<number, number>();
  const came = new Map<number, number>();
  const open: Array<{ k: number; ix: number; iy: number; f: number }> = [];
  gScore.set(key(sx, sy), 0);
  open.push({ k: key(sx, sy), ix: sx, iy: sy, f: h(sx, sy) });

  const DIRS: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  let goalKey = -1;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.ix === gx && cur.iy === gy) {
      goalKey = cur.k;
      break;
    }
    const gc = gScore.get(cur.k) ?? Infinity;
    for (const [dx, dy] of DIRS) {
      const nx = cur.ix + dx;
      const ny = cur.iy + dy;
      if (!ok(nx, ny)) continue;
      // No slipping through the diagonal gap between two wall corners.
      if (dx && dy && (!ok(cur.ix + dx, cur.iy) || !ok(cur.ix, cur.iy + dy))) continue;
      const step = dx && dy ? Math.SQRT2 : 1;
      const k = key(nx, ny);
      if (gc + step >= (gScore.get(k) ?? Infinity)) continue;
      gScore.set(k, gc + step);
      came.set(k, cur.k);
      open.push({ k, ix: nx, iy: ny, f: gc + step + h(nx, ny) });
    }
  }
  if (goalKey < 0) return [];

  const back: Vec2[] = [];
  let k: number | undefined = goalKey;
  while (k !== undefined) {
    back.push({ x: (k % 1000) * GRID, y: Math.floor(k / 1000) * GRID });
    k = came.get(k);
  }
  back.reverse();
  // Collapse straight runs: the pilot only needs the corners.
  const pts: Vec2[] = [];
  for (let i = 0; i < back.length; i++) {
    const p = back[i];
    const prev = back[i - 1];
    const next = back[i + 1];
    if (!prev || !next) {
      pts.push(p);
      continue;
    }
    if ((p.x - prev.x) * (next.y - p.y) !== (p.y - prev.y) * (next.x - p.x)) pts.push(p);
  }
  pts.push(target);
  return pts;
}

/** Hold the stick at the next waypoint until it is reached, or give up. */
export function driveTo(g: DebugGame, kind: RobotKind, pts: Vec2[], tol = 7, budget = 400): boolean {
  g.debug.select(kind);
  for (const p of pts) {
    let arrived = false;
    for (let i = 0; i < budget && !arrived; i++) {
      const b = bot(g, kind);
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (Math.hypot(dx, dy) <= tol) {
        arrived = true;
        break;
      }
      g.setStick(Math.abs(dx) > 3 ? Math.sign(dx) : 0, Math.abs(dy) > 3 ? Math.sign(dy) : 0);
      g.update(DT_MAX);
    }
    if (!arrived) {
      g.setStick(0, 0);
      return false;
    }
  }
  g.setStick(0, 0);
  return true;
}

/** Walk a robot to a point, routing round whatever it cannot walk through. */
export function walkTo(g: DebugGame, kind: RobotKind, target: Vec2, tol = 7): boolean {
  const pts = findPath(g, kind, target);
  if (!pts.length) return false;
  return driveTo(g, kind, pts, tol);
}

/**
 * Play chapter 3 to the moment Stephan opens the stairs, and stop there.
 *
 * Soup, speaker, beer: his three conditions, in the order a player meets them, and
 * every address read off a prop or a person the sim itself publishes rather than
 * typed in. It stops while the chapter is still holding the hall for the gate's
 * swing (`GATE_SWING_TIME + GATE_CUT_DELAY` in `ch3-breakfast.ts`) — once
 * `startChapter(4)` has run, the props are chapter 4's and there is nothing left of
 * chapter 3 to measure.
 *
 * Shared, because two files need it: `tests/colliders.test.ts` sweeps what the
 * chapter draws with its gate open — the half of the chapter that was written off
 * as unreachable for a round — and `tests/doors.test.ts` measures the swing itself.
 */
export function playToStairGate(g: DebugGame, onOpen?: (g: DebugGame) => void): void {
    const st = (): BreakfastState => g.debug.chapter() as BreakfastState;
    const propAt = (kind: string, match?: (p: Prop) => boolean): Vec2 => {
      const p = g.snapshot().props.find((o) => o.kind === kind && (match?.(o) ?? true));
      if (!p) throw new Error(`chapter 3 publishes no ${kind}`);
      return { x: p.x + (p.w ?? 0) / 2, y: p.y + (p.h ?? 0) / 2 };
    };
    const use = (kind: RobotKind, at: Vec2, dy = 0): void => {
      g.debug.select(kind);
      g.debug.place(kind, at.x, at.y + dy);
      g.key('KeyE');
    };

    // The ladle is on the high shelf, and only Droid reaches it. Then Biggy can
    // pick the pot up, and the pot goes to where Stephan is standing.
    g.debug.select('droid');
    g.debug.place('droid', 176, 150);
    g.key('KeyE');
    expect(st().ladle, 'Droid never got the ladle').toBe(true);
    use('biggy', { x: 105, y: 180 });
    expect(st().carrying, 'Biggy never picked the pot up').toBe(true);
    const drop = propAt('dropzone', (p) => !(p.label ?? '').includes('beer'));
    use('biggy', drop);
    expect(st().delivered, 'the soup never arrived').toBe(true);

    // The top-shelf sticker first: it shares the booth grid with the speaker's
    // hiding places and `E` offers the swag before the conversation, so a run that
    // skips it ends up collecting a sticker instead of a keynote speaker.
    const sticker = g.snapshot().props.find((p) => p.kind === 'sticker');
    if (sticker) use('droid', { x: sticker.x, y: sticker.y }, 20);

    /*
     * The keynote speaker is hiding behind a booth; Voxxy finds them and they
     * follow her to the stage.
     *
     * The speaker is a `Person` the chapter spawns over time and this run is four
     * frames old, so the booth the sim NAMES is the reliable address — the same
     * fallback `tests/chapters.test.ts` uses, and the reason it is a fallback there
     * is that a run with more frames on it finds the person.
     */
    const hiding = g.snapshot().people.find((p) => p.role === 'speaker');
    const booth = GF.booths.find((b) => b.name === st().speaker.booth);
    expect(booth, 'the chapter names a booth the venue does not have').toBeDefined();
    g.debug.select('voxxy');
    g.debug.place(
      'voxxy',
      hiding ? hiding.x : (booth as { x: number; w: number }).x + (booth as { w: number }).w / 2,
      (hiding ? hiding.y : (booth as { y: number; h: number }).y + (booth as { h: number }).h + 14) + 24,
    );
    g.update(DT_MAX);
    g.key('KeyE');
    expect(st().speaker.following, 'the speaker is not following Voxxy').toBe(true);
    /*
     * ...and Voxxy WALKS them there rather than teleporting to the mark.
     *
     * The speaker walks straight at Voxxy and slides along whatever it touches
     * (`ch3-breakfast.ts`); dropped across the hall in one frame, Voxxy leaves them
     * wedged behind the booth they were hiding in. `walkTo` is the shared test
     * pilot — the same A* router `tests/chapters.test.ts` drives this errand with —
     * so the speaker is led down a route a player could actually walk.
     */
    expect(walkTo(g, 'voxxy', drop), 'Voxxy could not walk the speaker to the stage').toBe(true);
    for (let i = 0; i < 900 && !st().speaker.onStage; i++) g.update(DT_MAX);
    expect(st().speaker.onStage, 'the speaker never reached the stage').toBe(true);

    // And the beer delivery, off the aisle and onto the bar: Biggy alone, and only
    // so many crates at a time before the heap throws.
    const stack = propAt('dropzone', (p) => (p.label ?? '').includes('beer'));
    for (let trip = 0; trip < 12 && !st().beer.done; trip++) {
      const room = Math.min(CRATE_STACK_LIMIT - 1, st().beer.loose.length);
      for (let i = 0; i < room; i++) {
        const c = st().beer.loose[0];
        if (!c) break;
        use('biggy', { x: c.x, y: c.y }, 12);
      }
      use('biggy', stack);
    }
    expect(st().beer.done, 'the beer delivery is not clear').toBe(true);

    g.update(DT_MAX);
    expect(st().gateOpen, 'chapter 3s gate did not open').toBe(true);
  // The frame the barrier starts moving on, for a caller that wants to watch it.
  onOpen?.(g);
  /*
   * Let the barrier finish its swing and stop there.
   *
   * The chapter holds the hall for `GATE_SWING_TIME + GATE_CUT_DELAY` after
   * `done()`, so stopping on the swing leaves half a second of `play` in hand —
   * which is what callers need, because once `startChapter(4)` has run these are
   * chapter 4's props and chapter 3 is gone.
   */
  for (let i = 0; i < 200 && st().gateSwing < 1; i++) g.update(DT_MAX);
  expect(st().gateSwing, 'the gate never finished swinging').toBe(1);
  expect(g.snapshot().phase, 'the chapter handed over before its gate had opened on screen').toBe('play');
}
