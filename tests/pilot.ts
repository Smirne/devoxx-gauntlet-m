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
  R,
  circleRect,
  roomDoor,
  type Bot,
  type BreakfastState,
  type DebugGame,
  type ExpoState,
  type KeynoteState,
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
 * Where Voxxy stands to bring the keynote speaker in: inside Stephan's mark, at
 * its south end.
 *
 * The soup and the speaker share one mark since Michele's *"the dropzone per
 * speaker and soup could be the same"* (30 Sep 2026), and it is centred on
 * Stephan, so its middle is the one point of it nobody else can stand on.
 */
export function speakerMarkAt(g: DebugGame): Vec2 {
  const m = g.snapshot().props.find((o) => o.kind === 'dropzone' && (o.label ?? '').includes('speaker'));
  if (!m) throw new Error('chapter 3 publishes no mark for the speaker');
  return { x: m.x + (m.w ?? 0) / 2, y: m.y + (m.h ?? 0) - 8 };
}

/**
 * Play chapter 3 to the moment Stephan opens the stairs, and stop there.
 *
 * Soup, speaker, beer: his three conditions, in the order a player meets them, and
 * every address read off a prop or a person the sim itself publishes rather than
 * typed in. It stops on the frame the last belt has wound in, inside the stair
 * beat and before the climb (`STAIR_BEAT`, `GATE_CUT_DELAY` in `ch3-breakfast.ts`)
 * — once `startChapter(4)` has run, the props are chapter 4's and there is nothing
 * left of chapter 3 to measure.
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
     * follow her to Stephan.
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
    expect(walkTo(g, 'voxxy', speakerMarkAt(g)), 'Voxxy could not walk the speaker to Stephan').toBe(true);
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
   * Let the belts finish winding in and stop there.
   *
   * `done()` hands the chapter to the stair beat (`STAIR_BEAT` in
   * `ch3-breakfast.ts`): the cast is placed at the belt line, Stephan steps to his
   * post and presses the button, and only then do the belts go — so the wave is
   * finished well inside the cutscene, with the three of them still standing on
   * their marks for `GATE_CUT_DELAY` before the climb. Stopping there leaves the
   * callers chapter 3's props and walls, which is what they need: once
   * `startChapter(4)` has run these are chapter 4's and chapter 3 is gone.
   */
  for (let i = 0; i < 400 && st().gateSwing < 1; i++) g.update(DT_MAX);
  expect(st().gateSwing, 'the belts never finished winding in').toBe(1);
  expect(g.snapshot().chapter, 'the chapter handed over before its belts had wound in on screen').toBe(3);
  expect(g.snapshot().shot?.name, 'the climb started before the belts were home').toBe('stair-gate');
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

/* ----------------------------------------------------------- chapter 4, driven
 *
 * The whole of chapter 4 on one stick, the way a player plays it: select a robot
 * (keys 1/2/3 — `g.debug.select`), hold the stick, switch, hold the stick. No
 * robot and no prop is ever put anywhere; the only other debug call is the
 * read-only `g.debug.chapter()`.
 *
 * It was written for `tests/chapter4-length.test.ts`, which measures the
 * chapter's pacing, and it lives here because `tests/full-run.test.ts` — and the
 * filmed playthrough that replays it in the 3D page — need the same drive. Two
 * copies of it would be the drift this file exists to prevent.
 */

/** A frame counter with a hard stop, so a stuck drive fails loudly and finitely. */
class Ch4Clock {
  frames = 0;
  constructor(private readonly limit: number) {}
  get t(): number {
    return this.frames * DT_MAX;
  }
  step(g: DebugGame): void {
    g.update(DT_MAX);
    this.frames++;
    if (this.t > this.limit) throw new Error(`chapter 4 never finished in ${this.limit}s — a drive is stuck`);
  }
}

/**
 * Select a robot and walk it to a point on its own stick.
 *
 * The stick steers at the velocity error rather than flat at the target, which is
 * what stops a heavy robot orbiting its mark — the same servo the curtain call
 * uses. Walls are NOT ignored: a route that walks into a seat block stalls, and a
 * stall fails the run rather than flattering it.
 */
function steerTo(g: DebugGame, clock: Ch4Clock, kind: RobotKind, to: Vec2, reach = 12): void {
  g.debug.select(kind);
  let stall = 0;
  let best = Infinity;
  for (;;) {
    // The last robot onto the stage ends the chapter under its own feet: the
    // curtain call takes the sticks, and there is nothing left to drive.
    if (g.snapshot().reel !== null) return;
    const b = bot(g, kind);
    const dx = to.x - b.x;
    const dy = to.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < reach) break;
    if (d < best - 0.05) {
      best = d;
      stall = 0;
    } else stall += DT_MAX;
    if (stall > 4) {
      g.setStick(0, 0);
      throw new Error(
        `${kind} is stuck at (${b.x.toFixed(0)},${b.y.toFixed(0)}), ` +
          `${d.toFixed(0)}px from (${Math.round(to.x)},${Math.round(to.y)})`,
      );
    }
    const want = Math.min(1, d / 18) * b.max;
    const ex = (dx / d) * want - b.vx;
    const ey = (dy / d) * want - b.vy;
    const el = Math.hypot(ex, ey) || 1;
    g.setStick(ex / el, ey / el);
    clock.step(g);
  }
  g.setStick(0, 0);
}

/**
 * Play chapter 4 from its first frame to the opening video, driving every robot.
 *
 * `onLeg` hears each leg's name and its seconds of sim clock as it finishes;
 * `limit` is the whole chapter's allowance in seconds, generous but finite.
 */
export function driveChapter4(g: DebugGame, onLeg?: (name: string, seconds: number) => void, limit = 600): void {
  const clock = new Ch4Clock(limit);
  const key = (): KeynoteState => g.debug.chapter() as KeynoteState;
  const props = (kind: string): Prop[] => g.snapshot().props.filter((p) => p.kind === kind);
  /** The middle of a prop published as a top-left rect: the stage, the mark, a letter, a gap. */
  const mid = (p: Prop): Vec2 => ({ x: p.x + (p.w ?? 0) / 2, y: p.y + (p.h ?? 0) / 2 });
  /**
   * ...and of one published AT its centre, `w,h` its diameter: the cake and the
   * spotlights (`props()` in ch4-keynote.ts, and the way both renderers and
   * `tests/prop-geometry.ts` read them). Through `mid()` these came out 8 and
   * 17 px south-east of where they are, and nothing noticed while Biggy could push
   * the cake from 16 px past touching — see the cake's leg below.
   */
  const centreOf = (p: Prop): Vec2 => ({ x: p.x, y: p.y });
  let t0 = 0;
  const done = (name: string): void => {
    onLeg?.(name, clock.t - t0);
    t0 = clock.t;
  };

  /*
   * The room, read off what the chapter publishes rather than typed in: the four
   * spotlights give both aisle centres and both ends of the seating, so the
   * routes below re-derive themselves if the room is ever re-laid.
   */
  const spots = props('spotlight').map(centreOf);
  const aisleX = [...new Set(spots.map((p) => Math.round(p.x)))].sort((a, b) => a - b);
  /** The strip behind the seating, between the last row and the door. */
  const backY = Math.max(...spots.map((p) => p.y)) + 42;
  /** The strip in front of it, between the first row and the stage. */
  const frontY = Math.min(...spots.map((p) => p.y)) - 42;

  const d8 = roomDoor(R(8));
  const doorOut: Vec2 = { x: d8.cx, y: d8.cy + 18 };
  const doorIn: Vec2 = { x: d8.cx, y: d8.cy - 18 };

  /** Out of whatever aisle you are in, round the back, and up the one you want. */
  const viaBack = (k: RobotKind, to: Vec2): void => {
    const b = bot(g, k);
    if (Math.abs(b.x - to.x) > 6) {
      if (Math.abs(b.y - backY) > 10) steerTo(g, clock, k, { x: b.x, y: backY }, 10);
      steerTo(g, clock, k, { x: to.x, y: backY }, 10);
    }
    steerTo(g, clock, k, to, 10);
  };

  /*
   * IN THROUGH THE ONE DOOR. They start at the head of the main staircase, out in
   * the corridor; room 8 has a single doorway. Biggy stays outside on purpose —
   * the cake is in the corridor with him.
   */
  for (const k of ['voxxy', 'droid'] as const) {
    steerTo(g, clock, k, doorOut, 10);
    steerTo(g, clock, k, doorIn, 10);
  }
  done('Voxxy and Droid in through the one door');

  /*
   * VOXXY lights the four spotlights, in the order the chapter demands: one aisle
   * end to end, across the back, and the other.
   */
  for (const sp of spots) {
    viaBack('voxxy', sp);
    clock.step(g);
  }
  expect(key().spots, 'the spotlights did not all light').toBe(4);
  done('Voxxy · four spotlights, two aisles');

  /*
   * DROID finishes the #DEVOXX sign (`src/sim/letters.ts`): the O and both X's lean
   * in the east wing, each goes into its own gap at the back of the stage. Up the
   * east aisle, across the front strip into the wing, then three carries — round
   * the FRONT of Stephan and the speaker, who are bodies, not scenery.
   */
  const droidR = bot(g, 'droid').r;
  const hosts = g.snapshot().people.filter((p) => p.role === 'stephan' || p.role === 'speaker');
  /** The lane in front of the two of them, clear of both. */
  const laneY = Math.max(...hosts.map((p) => p.y + p.r)) + droidR + 8;
  const hostX0 = Math.min(...hosts.map((p) => p.x - p.r)) - droidR - 8;
  const hostX1 = Math.max(...hosts.map((p) => p.x + p.r)) + droidR + 8;
  steerTo(g, clock, 'droid', { x: aisleX[1], y: backY }, 10);
  steerTo(g, clock, 'droid', { x: aisleX[1], y: frontY }, 10);
  for (let n = 0; n < 3; n++) {
    const d = bot(g, 'droid');
    const l = props('letter')
      .filter((p) => p.state === 'idle')
      .sort((a, b) => Math.hypot(mid(a).x - d.x, mid(a).y - d.y) - Math.hypot(mid(b).x - d.x, mid(b).y - d.y))[0];
    expect(l, 'no letter left leaning in the wing').toBeDefined();
    // They lean face out, so he lifts from in front of it.
    steerTo(g, clock, 'droid', { x: hostX1, y: laneY }, 10);
    steerTo(g, clock, 'droid', { x: mid(l).x, y: l.y + (l.h ?? 0) + droidR + 3 }, 5);
    g.key('KeyE');
    clock.step(g);
    expect(key().carrying, `Droid did not lift the ${l.label}`).toBe(l.v);
    const gap = props('letter-slot').find((p) => p.v === l.v);
    expect(gap, `no gap for the ${l.label}`).toBeDefined();
    steerTo(g, clock, 'droid', { x: hostX1, y: laneY }, 10);
    steerTo(g, clock, 'droid', { x: Math.min(mid(gap!).x, hostX0), y: laneY }, 10);
    steerTo(g, clock, 'droid', { x: mid(gap!).x, y: gap!.y + (gap!.h ?? 0) + droidR + 3 }, 6);
    g.key('KeyE');
    clock.step(g);
    expect(key().carrying, `the ${l.label} did not go into its gap`).toBe(-1);
  }
  expect(key().sign, 'the #DEVOXX sign did not go up').toBe('#DEVOXX');
  done("Droid · the O and both X's, wing to sign");

  /*
   * BIGGY shoves the cake in from the corridor and up the west aisle onto its
   * mark. He has to get BEHIND it for every leg, and the board is slow on purpose.
   *
   * The route hugs the seats. Behind the last row the strip is 54 px from the
   * backs of the seats to the corridor wall, and a 34 px cake with an 18 px Biggy
   * behind it is 52: the cake goes along the seats (`backY`), which leaves him a
   * 20 px lane between it and the wall to get round it by. In the middle of the
   * strip there is no way past it at all.
   */
  const mark = mid(props('cake-mark')[0]);
  /** Each stop for the cake's centre, and how close counts as there. */
  const cakeRoute: Array<[Vec2, number]> = [
    // Lined up with the door, out in the corridor: 6 px either side of it.
    [{ x: d8.cx, y: d8.cy + 26 }, 4],
    // Through it and up against the backs of the seats.
    [{ x: d8.cx, y: backY }, 6],
    // Along the seats to the mouth of the west aisle, which leaves it 7 px a side.
    [{ x: aisleX[0], y: backY }, 3],
    [{ x: aisleX[0], y: frontY }, 8],
    [mark, 4],
  ];
  /*
   * The cake's own centre — `centreOf`, NOT `mid()`.
   *
   * Through `mid()` this pilot aimed at a cake 17 px east and 17 px south of the
   * real one and "stood behind" a phantom, fifteen pixels short of the board, and
   * it read the spotlights 8 px off too, which put the back-of-the-room lane at
   * 250 instead of 242 — the middle of the strip rather than hard against the
   * seats. None of it showed while Biggy could push from 16 px past touching.
   * When Michele's *"cake is pushed from too far"* (29 Sep) took the push down to
   * a hand on it (`CAKE_TOUCH`), this drive was the first thing that could no
   * longer reach the cake.
   */
  const cakeAt = (): Vec2 => centreOf(props('cake')[0]);
  const cakeR = (props('cake')[0].w ?? 0) / 2;
  // Round behind the crate first, out in the corridor where he already is.
  const cake0 = cakeAt();
  steerTo(g, clock, 'biggy', { x: cake0.x + 40, y: cake0.y + 16 }, 14);
  g.debug.select('biggy');
  /*
   * HOW A PLAYER PUSHES IT, now that a push is a hand on it.
   *
   * The old drive walked straight at a point behind the cake and leaned when it
   * got there. With 16 px of reach that was harmless; with a hand's breadth, the
   * straight line to the far side of the cake goes THROUGH the cake, and a stick
   * pointing into it is a push — so it shoved the board away every time it tried
   * to get behind it. A player walks round it instead. So:
   *
   *  - **Round it at arm's length** (`ORBIT`), a step at a time (`STEP`), towards
   *    dead behind. The step is small enough that whenever he is touching the
   *    board his stick points away from it (`ORBIT·cos STEP` is past touching),
   *    so going round it never pushes it.
   *  - **Lean from behind** — within `CONE` of dead behind and close — along the
   *    line to the stop.
   *  - **Ease off** as the stop comes up. A board let go of coasts `v / 2.2` px
   *    (its drag), so it is leaned on only while it is slower than that would
   *    carry it to the stop, and otherwise he backs off and lets it roll there.
   */
  const touch = bot(g, 'biggy').r + cakeR;
  const ORBIT = touch + 10;
  const STEP = 0.6;
  const CONE = Math.cos((20 * Math.PI) / 180);
  let prev = cakeAt();
  for (const [wp, tol] of cakeRoute) {
    let stall = 0;
    let best = Infinity;
    for (;;) {
      if (key().cake) break;
      const c = cakeAt();
      const b = bot(g, 'biggy');
      const ax = wp.x - c.x;
      const ay = wp.y - c.y;
      const al = Math.hypot(ax, ay);
      if (al < tol) break;
      if (al < best - 0.05) {
        best = al;
        stall = 0;
      } else stall += DT_MAX;
      if (stall > 8) {
        g.setStick(0, 0);
        throw new Error(`the cake is stuck ${al.toFixed(0)}px from (${Math.round(wp.x)},${Math.round(wp.y)})`);
      }
      const ux = ax / al;
      const uy = ay / al;
      // Where he is round the board, and how square behind it that is.
      const rx = b.x - c.x;
      const ry = b.y - c.y;
      const rl = Math.hypot(rx, ry) || 1;
      const behind = -(rx * ux + ry * uy) / rl;
      // How fast it is already going towards the stop, from the last frame.
      const along = ((c.x - prev.x) * ux + (c.y - prev.y) * uy) / DT_MAX;
      prev = c;
      if (behind > CONE && rl < ORBIT + 4) {
        if (along < 2 * Math.max(0, al - tol / 2)) g.setStick(ux, uy);
        else g.setStick(-ux, -uy);
      } else {
        const from = Math.atan2(ry, rx);
        let turn = Math.atan2(-uy, -ux) - from;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        const a = from + Math.sign(turn) * Math.min(Math.abs(turn), STEP);
        const gx = c.x + Math.cos(a) * ORBIT - b.x;
        const gy = c.y + Math.sin(a) * ORBIT - b.y;
        const gd = Math.hypot(gx, gy) || 1;
        g.setStick(gx / gd, gy / gd);
      }
      clock.step(g);
    }
    g.setStick(0, 0);
    if (key().cake) break;
  }
  expect(key().cake, 'the cake never reached its mark').toBe(true);
  expect(key().ready, 'the stage never came ready').toBe(true);
  done('Biggy · the cake in from the corridor');

  /*
   * ...and whoever is not already on the stage walks onto it: three marks in the
   * clear band of the apron, between the cake at the west end and Stephan and the
   * speaker at the east. Each robot comes up to the front strip first and crosses
   * along it; westmost first, so nobody walks round somebody already standing.
   */
  const stage = props('stage')[0];
  const sy = stage.y + (stage.h ?? 0) / 2;
  const onStage = (b: Bot): boolean =>
    b.x >= stage.x && b.x <= stage.x + (stage.w ?? 0) && b.y >= stage.y && b.y <= stage.y + (stage.h ?? 0);
  const marks: Array<[RobotKind, Vec2]> = [
    ['biggy', { x: stage.x + 68, y: sy }],
    ['voxxy', { x: stage.x + 98, y: sy }],
    ['droid', { x: stage.x + 124, y: sy }],
  ];
  for (const [k, to] of marks) {
    if (onStage(bot(g, k))) continue;
    const b = bot(g, k);
    if (b.y > frontY + 4) steerTo(g, clock, k, { x: b.x, y: frontY }, 10);
    steerTo(g, clock, k, { x: to.x, y: frontY }, 10);
    steerTo(g, clock, k, to, 8);
  }
  clock.step(g);
  expect(g.snapshot().reel, 'the chapter never reached its ending').not.toBeNull();
  done('everyone onto the stage');
}

/**
 * Chapter 2's last job (29 Sep): once the printer and the store are both done,
 * the front doors. Waits for them to become the job, walks `kind` to the main
 * entrance, presses E and waits out the walk into chapter 3. `walk = false`
 * places the robot at the doors instead, for the tests that are about something
 * else and only need the chapter to hand over.
 */
export function openFrontDoors(g: DebugGame, kind: RobotKind = 'voxxy', walk = true, finish = true): boolean {
  const due = (): boolean => g.snapshot().chapter === 2 && (g.debug.chapter() as { doorsDue?: boolean }).doorsDue === true;
  for (let i = 0; i < Math.ceil(15 / DT_MAX) && g.snapshot().chapter === 2 && !due(); i++) g.update(DT_MAX);
  if (!due()) return false;
  const e = GF.entrance;
  const at = { x: e.x - 24, y: e.y + e.h / 2 };
  g.debug.select(kind);
  if (walk) {
    if (!walkTo(g, kind, at, 10)) return false;
  } else {
    g.debug.place(kind, at.x, at.y);
    g.update(DT_MAX);
  }
  g.key('KeyE');
  // `finish = false` stops on the E, for a caller that wants to watch the walk.
  if (!finish) return (g.debug.chapter() as { doorsOpen?: boolean }).doorsOpen === true;
  for (let i = 0; i < Math.ceil(15 / DT_MAX) && g.snapshot().chapter === 2; i++) g.update(DT_MAX);
  return g.snapshot().chapter === 3;
}

/**
 * Chapter 2 up to its last job: breakers, cabinet, password, router, the cable to
 * the printer and Biggy through the roller door. The front doors are left for
 * `openFrontDoors`. (Moved here from full-run.test.ts so the cutscene measurement
 * can reach the chapter-2 walk without running the whole game.)
 */
export function finishChapter2(g: DebugGame): void {
  const HUB: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };
  const PANEL: Vec2 = { x: GF.panel.x + 13, y: GF.panel.y + 8 };
  const steps = (gg: DebugGame, n: number): void => {
    for (let i = 0; i < n; i++) gg.update(DT_MAX);
  };
  const expo = (): ExpoState => g.debug.chapter() as ExpoState;

  g.debug.select('droid');
  g.debug.place('droid', PANEL.x, PANEL.y + 8);
  for (let i = 0; i < 3; i++) g.key('KeyE');
  expect(expo().power, 'the breakers never went in').toBe(true);

  g.debug.select('biggy');
  g.debug.place('biggy', HUB.x, HUB.y + 30);
  g.key('KeyE');
  expect(expo().router.cabinetOpen, 'the cabinet stayed shut').toBe(true);

  // Droid up on Biggy for the label inside the lid, then down to type it in.
  g.debug.place('biggy', 300, 640);
  g.debug.place('droid', 284, 640);
  g.debug.select('droid');
  g.key('KeyE');
  expect(bot(g, 'droid').mounted, 'Droid never got up on Biggy').toBe(true);
  g.debug.place('biggy', HUB.x, HUB.y + 20);
  steps(g, 1);
  g.key('KeyE');
  expect(expo().router.known, 'the password was never read').toBe(true);
  g.key('KeyE');
  expect(bot(g, 'droid').mounted, 'Droid never got back down').toBe(false);
  g.debug.select('droid');
  g.debug.place('droid', HUB.x, HUB.y + 20);
  g.key('KeyE');
  expect(expo().router.online, 'the router never came up').toBe(true);

  // The cable, run the signposted way — the long way round is a blooper and this
  // is meant to be the clean run.
  const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
  const printer = { x: GF.printer.x + 10, y: GF.printer.y + 6 };
  expect(walkTo(g, 'voxxy', { x: rack.x, y: rack.y - 24 }), 'Voxxy never reached the rack').toBe(true);
  g.key('KeyE');
  expect(walkTo(g, 'voxxy', { x: printer.x, y: printer.y + 34 }), 'the cable never reached the printer').toBe(true);
  g.key('KeyE');
  expect(expo().printerOnline, 'the badge printer stayed offline').toBe(true);

  // ...and Voxxy shoves Biggy through the roller door, which ends the chapter.
  g.debug.select('voxxy');
  g.debug.place('biggy', 400, 160);
  g.debug.place('voxxy', 372, 160);
  g.setStick(1, 0);
  for (let i = 0; i < 600 && !expo().rollerBroken; i++) g.update(DT_MAX);
  g.setStick(0, 0);
  expect(expo().rollerBroken, 'the roller door never went').toBe(true);
}
