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
/** Frames of no progress on a leg before the pilot tries stepping round. */
const STALL = 26;
/** Frames it spends stepping sideways before aiming at the waypoint again. */
const SIDE = 18;

/** Somebody standing still that the router should go round — a `standOff` body. */
export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

export function passable(walls: Wall[], b: Bot, x: number, y: number, avoid: readonly Obstacle[] = []): boolean {
  const c = { x, y, r: b.r + 1 };
  for (const w of walls) {
    if (w.skipFor && w.skipFor(b)) continue;
    if (circleRect(c, w)) return false;
  }
  // People are solid through `standOff`, not through walls, so the router is told
  // about the ones in the way rather than finding them with its shoulder.
  for (const o of avoid) if (Math.hypot(o.x - x, o.y - y) < c.r + o.r) return false;
  return true;
}

/** Eight-way A* on a `GRID`-pixel lattice, no corner cutting. */
export function findPath(g: DebugGame, kind: RobotKind, target: Vec2, avoid: readonly Obstacle[] = []): Vec2[] {
  const b = bot(g, kind);
  const walls = g.debug.walls();
  const free = new Map<number, boolean>();
  const key = (ix: number, iy: number): number => iy * 1000 + ix;
  const ok = (ix: number, iy: number): boolean => {
    if (ix < 0 || iy < 0 || ix * GRID > 1900 || iy * GRID > 700) return false;
    const k = key(ix, iy);
    let v = free.get(k);
    if (v === undefined) {
      v = passable(walls, b, ix * GRID, iy * GRID, avoid);
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

/**
 * Hold the stick at the next waypoint until it is reached, or give up.
 *
 * The budget is per waypoint and it is a FLOOR, not the whole allowance: a
 * straightened path can hand this a single 920 px leg — Voxxy from a booth at the
 * west end of the hall to Stephan's mark at the east — and 400 frames of a robot
 * that tops out at 72.5 px/s does not cover it. A fixed budget turned that into
 * "the route is impossible", which is a test lying about the game. So each leg
 * also gets the time the leg actually needs at the robot's own top speed, twice
 * over, for the corners and the acceleration.
 */
export function driveTo(g: DebugGame, kind: RobotKind, pts: Vec2[], tol = 7, budget = 400): boolean {
  g.debug.select(kind);
  for (const p of pts) {
    let arrived = false;
    const b0 = bot(g, kind);
    const need = (Math.hypot(p.x - b0.x, p.y - b0.y) / b0.max / DT_MAX) * 2 + 60;
    const legBudget = Math.max(budget, Math.ceil(need));
    /*
     * ...and a sidestep, because the router only knows about WALLS.
     *
     * The hall's staff stand where the chapter put them and the sixty visitors
     * walk wherever they are going; none of them is a wall, so `findPath` will
     * happily route a leg straight through the JUG leader, and an eight-way stick
     * held dead at a waypoint behind him pins the robot against his standoff
     * forever. A player steps round. So does this: no progress for `STALL` frames
     * and it drives perpendicular for `SIDE` of them, flipping the side each time,
     * which is enough to clear a person and never enough to leave the lane.
     */
    let best = Infinity;
    let stalled = 0;
    let side = 1;
    let sidestep = 0;
    for (let i = 0; i < legBudget && !arrived; i++) {
      const b = bot(g, kind);
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d <= tol) {
        arrived = true;
        break;
      }
      if (d < best - 0.5) {
        best = d;
        stalled = 0;
      } else stalled++;
      if (stalled > STALL && sidestep === 0) {
        sidestep = SIDE;
        side = -side;
        stalled = 0;
      }
      if (sidestep > 0) {
        sidestep--;
        g.setStick(Math.sign(-dy / d) * side || side, Math.sign(dx / d) * side || side);
      } else {
        g.setStick(Math.abs(dx) > 3 ? Math.sign(dx) : 0, Math.abs(dy) > 3 ? Math.sign(dy) : 0);
      }
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
export function walkTo(g: DebugGame, kind: RobotKind, target: Vec2, tol = 7, avoid: readonly Obstacle[] = []): boolean {
  const pts = findPath(g, kind, target, avoid);
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

    // The ladle is on the high shelf, only Droid reaches it, and reaching it is
    // half the errand: he carries it to the counter and drops it IN the pot.
    // Then Biggy can pick the pot up, and it goes to where Stephan is standing.
    g.debug.select('droid');
    g.debug.place('droid', 176, 150);
    g.key('KeyE');
    expect(st().ladle, 'Droid never got the ladle off the shelf').toBe('carried');
    g.debug.place('droid', 105, 180);
    g.key('KeyE');
    expect(st().ladle, 'Droid never dropped the ladle in the pot').toBe('in');
    use('biggy', { x: 105, y: 180 });
    expect(st().carrying, 'Biggy never picked the pot up').toBe(true);
    const drop = propAt('dropzone', (p) => (p.label ?? '').includes('soup'));
    use('biggy', drop);
    expect(st().delivered, 'the soup never arrived').toBe(true);

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
    const spkMark = g.snapshot().props.find((o) => o.kind === 'dropzone' && (o.label ?? '').includes('speaker'));
    if (!spkMark) throw new Error('chapter 3 publishes no mark for the speaker');
    const spkAt = { x: spkMark.x + (spkMark.w ?? 0) / 2, y: spkMark.y + (spkMark.h ?? 0) / 2 };
    expect(walkTo(g, 'voxxy', spkAt), 'Voxxy could not walk the speaker to Stephan').toBe(true);
    for (let i = 0; i < 900 && !st().speaker.withStephan; i++) g.update(DT_MAX);
    expect(st().speaker.withStephan, 'the speaker never reached Stephan').toBe(true);

    // The top-shelf sticker, AFTER the speaker rather than before. It used to come
    // first, because the minigames take `E` before the chapter does and the speaker
    // could be hiding at the sticker's own spot — one seed in six — so a run that
    // skipped it collected a sticker instead of a keynote speaker. The speaker keeps
    // clear of a minigame's key circle now (`SPEAKER_CLEAR`), so the order is free
    // again, and this way round the pilot walks the errand with the sticker still
    // live rather than with the collision swept out of the way.
    const sticker = g.snapshot().props.find((p) => p.kind === 'sticker');
    if (sticker) use('droid', { x: sticker.x, y: sticker.y }, 20);

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

/**
 * Chapter 4: Droid finishes the #DEVOXX sign — every letter still leaning in the
 * wing lifted with `E` and set into its own gap with `E`.
 *
 * `walk` drives him there with the router, the way a player would, from wherever
 * he is. Without it he is put beside each letter and in front of each gap, which is
 * what the chapter-4 tests about something else (the cake, the lights, the video)
 * need, and exactly what they used to do with the banner's two hooks.
 *
 * Every address is read off the props the sim publishes: the letter leans on the
 * wing's east wall, so he stands to its west; the gap is taped on the stage floor
 * at the back, so he stands in front of it, towards the house.
 */
export function raiseSign(g: DebugGame, walk = false): void {
  /*
   * Walking: route to a point a step short of the stand-point, then drive the last
   * step straight. The router snaps its goal to a 10 px lattice, and beside a letter
   * leaning on a wall that lattice cell is inside the letter — so a route to the
   * stand-point itself does not exist, though the stand-point does.
   */
  // Stephan and the speaker stand on the stage, and a player walks round them.
  const hosts: Obstacle[] = g.snapshot().people.filter((p) => p.role === 'stephan' || p.role === 'speaker');
  const go = (to: Vec2, via: Vec2): void => {
    if (walk) {
      expect(walkTo(g, 'droid', via, 7, hosts), `Droid could not walk to ${Math.round(via.x)},${Math.round(via.y)}`).toBe(true);
      expect(driveTo(g, 'droid', [to], 5), `Droid could not step to ${Math.round(to.x)},${Math.round(to.y)}`).toBe(true);
    } else {
      g.debug.place('droid', to.x, to.y);
    }
    g.update(DT_MAX);
  };
  g.debug.select('droid');
  for (let n = 0; n < 3; n++) {
    const leaning = g.snapshot().props.filter((p) => p.kind === 'letter' && p.state === 'idle');
    if (!leaning.length) break;
    // The nearest one, which is the one his `E` takes.
    const d = bot(g, 'droid');
    const centreOf = (p: Prop): Vec2 => ({ x: p.x + (p.w ?? 0) / 2, y: p.y + (p.h ?? 0) / 2 });
    leaning.sort((a, b) => Math.hypot(centreOf(a).x - d.x, centreOf(a).y - d.y) - Math.hypot(centreOf(b).x - d.x, centreOf(b).y - d.y));
    const l = leaning[0];
    // In front of it, along the way it faces: half its depth, his radius and a step.
    const c = centreOf(l);
    const f = l.face ?? Math.PI / 2;
    const half = Math.min(l.w ?? 0, l.h ?? 0) / 2;
    const at = (k: number): Vec2 => ({ x: c.x + Math.cos(f) * (half + d.r + k), y: c.y + Math.sin(f) * (half + d.r + k) });
    go(at(2), at(12));
    g.key('KeyE');
    const gap = g.snapshot().props.find((p) => p.kind === 'letter-slot' && p.v === l.v);
    expect(gap, `no gap in the sign for the letter in slot ${l.v}`).toBeDefined();
    const front = { x: gap!.x + (gap!.w ?? 0) / 2, y: gap!.y + (gap!.h ?? 0) + d.r + 2 };
    go(front, { x: front.x, y: front.y + 10 });
    g.key('KeyE');
  }
}
