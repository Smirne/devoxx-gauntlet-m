/**
 * The four chapters, driven headlessly through the public `Game` surface.
 *
 * These are the prototype's own verified choreography (GAUNTLET.md section 4,
 * "Tests are the acceptance criteria"), ported rather than reinvented: four clues
 * including the kiosk one, the jammed door for Biggy alone, the roller door that
 * needs a push, the cable that fits on the straight route and runs out on the long
 * one, the lunch chain, the keynote jobs, both cutscenes and Skip chapter.
 *
 * Everything runs at a fixed `DT_MAX` step, and the game is seeded, so a failure
 * here is a real regression and not a flaky frame.
 */

import { describe, expect, it } from 'vitest';

import {
  CABLE_MAX,
  DT_MAX,
  GF,
  JAMMED_DOOR_SPEED,
  ROLLER_DOOR_SPEED,
  circleRect,
  createGame,
  type Bot,
  type DebugGame,
  type ExpoState,
  type KeynoteState,
  type LunchState,
  type NightState,
  type RobotKind,
  type Vec2,
  type Wall,
} from '../src/sim';

/* ------------------------------------------------------------------- harness */

const SEED = 20260930;

/** Headless: no chapter cards, so `update` never waits on a keypress. */
const mk = (chapter: number): DebugGame => createGame({ seed: SEED, chapter, cards: false });

const bot = (g: DebugGame, kind: RobotKind): Bot => {
  const b = g.snapshot().bots.find((o) => o.kind === kind);
  if (!b) throw new Error(`no ${kind}`);
  return b;
};

function steps(g: DebugGame, n: number): void {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
}

/** Run until `done()` or the budget expires. Returns whether it got there. */
function until(g: DebugGame, done: () => boolean, budget = 600): boolean {
  for (let i = 0; i < budget; i++) {
    if (done()) return true;
    g.update(DT_MAX);
  }
  return done();
}

/* --------------------------------------------------------------- a test pilot
 *
 * The prototype's Playwright run held arrow keys down along a route. A headless
 * test has no browser to hold keys in, so this is the same thing: an eight-way
 * stick aimed at the next waypoint, and a grid router that only ever proposes
 * waypoints the robot can actually walk to — including under the sponsor tables
 * that Voxxy, and only Voxxy, fits beneath.
 */

const GRID = 10;

function passable(walls: Wall[], b: Bot, x: number, y: number): boolean {
  const c = { x, y, r: b.r + 1 };
  for (const w of walls) {
    if (w.skipFor && w.skipFor(b)) continue;
    if (circleRect(c, w)) return false;
  }
  return true;
}

/** Eight-way A* on a `GRID`-pixel lattice, no corner cutting. */
function findPath(g: DebugGame, kind: RobotKind, target: Vec2): Vec2[] {
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
function driveTo(g: DebugGame, kind: RobotKind, pts: Vec2[], tol = 7, budget = 400): boolean {
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
function walkTo(g: DebugGame, kind: RobotKind, target: Vec2, tol = 7): boolean {
  const pts = findPath(g, kind, target);
  if (!pts.length) return false;
  return driveTo(g, kind, pts, tol);
}

/* ------------------------------------------------- the chapter-2 cam-lock wheel
 *
 * The router cabinet in the technical room (`docs/gameplay-additions.md` §2). These
 * three helpers are the choreography a player performs: Biggy runs at the wheel from
 * the back of the room, Droid waits beside it, and Droid brakes when the wheel's
 * stopping distance lands on the mark. Everything they read comes out of the public
 * snapshot and `ExpoState`, never out of the chapter's internals.
 */

const HUB: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };
/** Where Droid stands to get a hand on the hub, clear of Biggy's run-up line. */
const BRACE_SPOT: Vec2 = { x: 118, y: 602 };
/** `WHEEL_BRAKE` in `ch2-expo.ts`: a braced Droid kills the coast in `vel / 7` radians. */
const BRAKE_RATE = 7;
/** `WHEEL_TOL`: the cam seats within this of the mark. */
const WHEEL_TOL = 0.16;

const TAU = Math.PI * 2;
const wrap = (a: number): number => ((a % TAU) + TAU) % TAU;
const angDiff = (a: number, b: number): number => {
  const d = wrap(a - b);
  return d > Math.PI ? d - TAU : d;
};

const expo = (g: DebugGame): ExpoState => g.debug.chapter() as ExpoState;

/**
 * Biggy charges the cabinet face from the back wall of the technical room. `x`
 * decides the lever arm: the wheel turns the way he comes in on.
 */
function heaveWheel(g: DebugGame, x = 178, steps = 50): void {
  g.debug.select('biggy');
  g.debug.place('biggy', x, 671);
  g.setStick(0, -1);
  steps_(g, steps);
  g.setStick(0, 0);
}

function steps_(g: DebugGame, n: number): void {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
}

/** Droid, braced at the right instant, catches the wheel on the mark. */
function braceOntoMark(g: DebugGame, budget = 2400): boolean {
  g.debug.select('droid');
  for (let i = 0; i < budget; i++) {
    const w = expo(g).wheel;
    if (w.open) return true;
    if (!w.held && Math.abs(w.vel) > 0.02 && Math.abs(angDiff(w.ang + w.vel / BRAKE_RATE, w.mark)) < 0.05) {
      g.key('KeyE');
    }
    g.update(DT_MAX);
  }
  return expo(g).wheel.open;
}

/* ================================================================ chapter 1 */

describe('chapter 1 — night', () => {
  it('lights all four clues, including the kiosk one', () => {
    const g = mk(1);
    const night = (): NightState => g.debug.chapter() as NightState;
    expect(night().clues).toHaveLength(4);

    // 1 · the foyer: Voxxy's beam and Droid's pool on the same spot.
    const c1 = night().clues[0];
    g.debug.place('voxxy', c1.x - 29, c1.y, 0);
    g.debug.place('droid', c1.x, c1.y);
    steps(g, 2);
    expect(night().clues[0].found).toBe(true);

    // 2 · the kiosk: Voxxy inside through the Voxxy-sized hatch, Biggy's flood
    //     through the glazing. The glass blocks the robot and passes the light.
    const c2 = night().clues[1];
    g.debug.place('voxxy', c2.x - 10, c2.y, 0);
    g.debug.place('biggy', 100, 500, Math.atan2(c2.y - 500, c2.x - 100));
    steps(g, 2);
    expect(night().clues[1].found).toBe(true);

    // 3 · cinema B: green and blue, no orange anywhere near it.
    const c3 = night().clues[2];
    g.debug.place('droid', c3.x, c3.y + 20);
    g.debug.place('biggy', c3.x, c3.y + 90, -Math.PI / 2);
    steps(g, 2);
    expect(night().clues[2].found).toBe(true);

    // 4 · the exit alcove in cinema E: all three at once.
    const c4 = night().clues[3];
    g.debug.place('voxxy', c4.x, c4.y + 8, -Math.PI / 2);
    g.debug.place('droid', c4.x + 11, c4.y + 30);
    g.debug.place('biggy', c4.x - 24, c4.y + 42, Math.atan2(-42, 24));
    steps(g, 2);
    expect(night().clues[3].found).toBe(true);

    expect(night().clues.every((c) => c.found)).toBe(true);
    expect(night().code).toHaveLength(4);
  });

  it('opens the fire door on the right code and runs the cutscene into chapter 2', () => {
    const g = mk(1);
    const code = (g.debug.chapter() as NightState).code;

    // A wrong code clears the buffer and leaves the door shut.
    g.debug.select('voxxy');
    g.debug.place('voxxy', 585, 330);
    steps(g, 1);
    for (const d of '9999') g.key(`Digit${d}`);
    expect((g.debug.chapter() as NightState).fireOpen).toBe(false);
    expect(g.snapshot().entered).toBe('');

    for (const d of code) g.key(`Digit${d}`);
    expect((g.debug.chapter() as NightState).fireOpen).toBe(true);
    expect(g.snapshot().phase).toBe('cut');

    expect(until(g, () => g.snapshot().chapter === 2, 500)).toBe(true);
    expect(g.snapshot().floor).toBe('down');
  });

  it('breaks the jammed door for Biggy alone after a run across the corridor, and not at a crawl', () => {
    const run = mk(1);
    run.debug.select('biggy');
    run.debug.place('biggy', 475, 318);
    run.setStick(0, 1);
    let hitSpeed = 0;
    for (let i = 0; i < 120; i++) {
      hitSpeed = Math.max(hitSpeed, Math.abs(bot(run, 'biggy').vy));
      if ((run.debug.chapter() as NightState).jamBroken) break;
      run.update(DT_MAX);
    }
    run.setStick(0, 0);
    expect((run.debug.chapter() as NightState).jamBroken).toBe(true);
    expect(hitSpeed).toBeGreaterThan(JAMMED_DOOR_SPEED);

    // A nudge and a drift is not a run-up.
    const crawl = mk(1);
    crawl.debug.select('biggy');
    crawl.debug.place('biggy', 475, 360);
    crawl.setStick(0, 1);
    steps(crawl, 6);
    crawl.setStick(0, 0);
    steps(crawl, 60);
    expect(Math.abs(bot(crawl, 'biggy').vy)).toBeLessThan(JAMMED_DOOR_SPEED);
    expect((crawl.debug.chapter() as NightState).jamBroken).toBe(false);
  });

  it('keeps Voxxy out of nothing and Biggy out of the kiosk hatch', () => {
    const g = mk(1);
    const hatch = g.debug.walls().find((w) => w.hidden && w.skipFor);
    expect(hatch).toBeDefined();
    expect(hatch?.skipFor?.(bot(g, 'voxxy'))).toBe(true);
    expect(hatch?.skipFor?.(bot(g, 'biggy'))).toBe(false);
  });
});

/* ================================================================ chapter 2 */

describe('chapter 2 — expo', () => {
  it('stalls Biggy at the roller door alone, and breaks it when Voxxy pushes him down the lane', () => {
    const alone = mk(2);
    alone.debug.select('biggy');
    alone.debug.place('biggy', 380, 160);
    alone.setStick(1, 0);
    steps(alone, 220);
    alone.setStick(0, 0);
    const solo = alone.debug.chapter() as ExpoState;
    expect(solo.rollerBroken).toBe(false);
    expect(bot(alone, 'biggy').max).toBeLessThan(ROLLER_DOOR_SPEED);

    const pushed = mk(2);
    pushed.debug.select('voxxy');
    pushed.debug.place('biggy', 400, 160);
    pushed.debug.place('voxxy', 372, 160);
    pushed.setStick(1, 0);
    let top = 0;
    for (let i = 0; i < 400; i++) {
      top = Math.max(top, bot(pushed, 'biggy').vx);
      if ((pushed.debug.chapter() as ExpoState).rollerBroken) break;
      pushed.update(DT_MAX);
    }
    pushed.setStick(0, 0);
    expect((pushed.debug.chapter() as ExpoState).rollerBroken).toBe(true);
    expect(top).toBeGreaterThan(ROLLER_DOOR_SPEED);
    // The only thing that can take Biggy over his own cap is the push.
    expect(top).toBeGreaterThan(bot(pushed, 'biggy').max);
  });

  it('runs the cable to the printer on the straight route, and snaps it on the long way round', () => {
    const g = mk(2);
    const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
    const printer = { x: GF.printer.x + 10, y: GF.printer.y + 6 };

    expect(walkTo(g, 'voxxy', { x: rack.x + 10, y: rack.y - 14 })).toBe(true);
    g.key('KeyE');
    expect((g.debug.chapter() as ExpoState).cable.carrying).toBe(true);

    // The printer sits on the reception counter, and reception now faces SOUTH onto
    // the arrivals concourse (Michele's plot), so Voxxy plugs in from in front of
    // the desk rather than from on top of it.
    expect(walkTo(g, 'voxxy', { x: printer.x, y: printer.y + 34 })).toBe(true);
    g.key('KeyE');
    const cable = (g.debug.chapter() as ExpoState).cable;
    expect(cable.connected).toBe(true);
    expect(cable.len).toBeLessThan(CABLE_MAX);
    /*
     * The run is still long — out of the technical room, along the bottom lane, up
     * through the stepped threshold and along the front of reception — but it is
     * no longer a near miss: it measures ~1208 px against the frozen 1480 reel,
     * where the prototype's own route measured 1270-1311 and ours read 1345.
     *
     * It got shorter because reception MOVED: Michele's plot puts the desk 280 px
     * further down the lobby than the prototype's guess did, and the plans win over
     * the prototype (CLAUDE.md). The reel is a frozen constant and stays 1480, so
     * the slack is asserted at both ends rather than silently widened: still over
     * 1200 px of cable for the intended solution, and now held well clear of the
     * HUD's 93% warning band instead of hugging it.
     */
    expect(cable.len).toBeGreaterThan(1200);
    expect(cable.len).toBeLessThan(CABLE_MAX * 0.85);

    // The long way round: out of the technical room, down the bottom lane and back.
    const long = mk(2);
    expect(walkTo(long, 'voxxy', { x: rack.x + 10, y: rack.y - 14 })).toBe(true);
    long.key('KeyE');
    const detour: Vec2[] = [
      { x: 215, y: 625 },
      { x: 950, y: 650 },
      { x: 300, y: 650 },
      { x: 950, y: 650 },
    ];
    driveTo(long, 'voxxy', detour, 10, 500);
    const snapped = (long.debug.chapter() as ExpoState).cable;
    expect(snapped.snapped).toBe(true);
    expect(snapped.carrying).toBe(false);
    expect(snapped.connected).toBe(false);
  });

  it('gives Droid the breakers and the top-shelf sticker, and nobody else', () => {
    const g = mk(2);
    const panel = { x: GF.panel.x + 13, y: GF.panel.y + 8 };

    // Biggy does not do buttons.
    g.debug.select('biggy');
    g.debug.place('biggy', panel.x + 30, panel.y + 30);
    g.key('KeyE');
    expect((g.debug.chapter() as ExpoState).breakersLeft).toBe(3);

    g.debug.select('droid');
    g.debug.place('droid', panel.x + 20, panel.y + 30);
    g.key('KeyE');
    g.key('KeyE');
    expect((g.debug.chapter() as ExpoState).breakersLeft).toBe(1);
    g.key('KeyE');
    expect((g.debug.chapter() as ExpoState).power).toBe(true);

    const sticker = g.snapshot().props.find((p) => p.kind === 'sticker');
    expect(sticker).toBeDefined();
    g.debug.select('voxxy');
    g.debug.place('voxxy', sticker!.x, sticker!.y + 20);
    g.key('KeyE');
    expect(g.snapshot().swag).toHaveLength(0);
    g.debug.select('droid');
    g.debug.place('droid', sticker!.x, sticker!.y + 20);
    g.key('KeyE');
    expect(g.snapshot().swag).toContain('sticker');
  });

  /* ---------------------------------------------------- the network closet */

  it('lets nobody but Biggy break the cam-lock free, and says why in each voice', () => {
    for (const kind of ['voxxy', 'droid'] as const) {
      const g = mk(2);
      g.debug.select(kind);
      g.debug.place(kind, 172, 640);
      g.setStick(0, -1);
      steps_(g, 200);
      g.setStick(0, 0);
      const w = expo(g).wheel;
      expect(w.vel, `${kind} turned the wheel`).toBe(0);
      expect(w.open).toBe(false);
    }

    // Each one is told why in its own words, through the wall's own `why`.
    const g = mk(2);
    const cab = g.debug.walls().find((w) => w.kind === 'cabinet');
    expect(cab?.why).toBeDefined();
    const voxxy = cab?.why?.(bot(g, 'voxxy')) ?? '';
    const droid = cab?.why?.(bot(g, 'droid')) ?? '';
    expect(voxxy).toContain('Voxxy');
    expect(droid).toContain('Droid');
    expect(voxxy).not.toBe(droid);
    // Not one script with the name swapped.
    expect(voxxy.replace(/^Voxxy:\s*/, '')).not.toBe(droid.replace(/^Droid:\s*/, ''));
    // Biggy has no blocked line here: his answer is the wheel moving.
    expect(cab?.why?.(bot(g, 'biggy'))).toBeNull();
  });

  // Ten full coast-downs with the hall's light polygons cast every frame: slow, and
  // the point of it is the breadth of the sweep, so it gets its own budget.
  it('turns the wheel for Biggy and strands it on a detent — he never lands the mark alone', { timeout: 30000 }, () => {
    const g = mk(2);
    const mark = expo(g).wheel.mark;
    heaveWheel(g);
    const spun = expo(g).wheel;
    expect(spun.vel, 'Biggy did not break the cam free').not.toBe(0);
    // He overshoots: the coast carries the wheel more than a whole turn.
    const swept = Math.abs(spun.vel) / 0.11;
    expect(swept).toBeGreaterThan(Math.PI * 2);

    // Ten different run-up lines, i.e. ten different impact speeds and lever arms.
    for (let k = 0; k < 10; k++) {
      const solo = mk(2);
      heaveWheel(solo, 164 + 2 * k);
      for (let i = 0; i < 900; i++) {
        solo.update(DT_MAX);
        const w = expo(solo).wheel;
        if (w.open || Math.abs(w.vel) < 5e-4) break;
      }
      const w = expo(solo).wheel;
      expect(w.open, `solo Biggy opened the cabinet from x=${164 + 2 * k}`).toBe(false);
      // The sprung pawl always walks it back between two marks, a long way off one.
      expect(Math.abs(angDiff(w.ang, mark)), `run-up x=${164 + 2 * k} rested on the mark`).toBeGreaterThan(WHEEL_TOL * 2);
    }
  });

  it('opens the cabinet when a braced Droid catches the wheel on the mark', () => {
    const g = mk(2);
    g.debug.place('droid', BRACE_SPOT.x, BRACE_SPOT.y);
    heaveWheel(g);
    expect(braceOntoMark(g)).toBe(true);

    const w = expo(g).wheel;
    expect(w.open).toBe(true);
    expect(Math.abs(angDiff(w.ang, w.mark))).toBeLessThan(WHEEL_TOL);
    expect(bot(g, 'droid').braced).toBe(true);
    // The cabinet stops being a wall once it is open.
    expect(g.debug.walls().some((x) => x.kind === 'cabinet')).toBe(false);

    // Bracing out of reach of the hub brakes nothing.
    const far = mk(2);
    far.debug.place('droid', 60, 660);
    far.debug.select('droid');
    far.key('KeyE');
    heaveWheel(far);
    expect(expo(far).wheel.held).toBe(false);
  });

  it('resolves the index mark under Voxxy\'s narrow cone and nobody else\'s', () => {
    for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
      const g = mk(2);
      // Everyone else parked far away, so only this robot's lamp is in the room.
      for (const other of ['voxxy', 'droid', 'biggy'] as const) {
        if (other !== kind) g.debug.place(other, 620 + 30 * ['voxxy', 'droid', 'biggy'].indexOf(other), 400);
      }
      g.debug.place(kind, HUB.x, HUB.y + 56, -Math.PI / 2);
      steps_(g, 4);
      expect(expo(g).wheel.markLit, `${kind} read the mark`).toBe(kind === 'voxxy');
      const line = g.snapshot().progress;
      expect(line).toContain(kind === 'voxxy' ? 'mark ' : 'mark unlit');
    }
  });

  it('keeps the badge printer offline until power, cable and router are all in', () => {
    const g = mk(2);
    const panel = { x: GF.panel.x + 13, y: GF.panel.y + 8 };
    const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
    const printer = { x: GF.printer.x + 10, y: GF.printer.y + 6 };

    // Power and cable, but no router: the printer is still dark.
    g.debug.select('droid');
    g.debug.place('droid', panel.x + 20, panel.y + 30);
    for (let i = 0; i < 3; i++) g.key('KeyE');
    expect(expo(g).power).toBe(true);

    expect(walkTo(g, 'voxxy', { x: rack.x + 10, y: rack.y - 14 })).toBe(true);
    g.key('KeyE');
    expect(walkTo(g, 'voxxy', { x: printer.x, y: printer.y + 34 })).toBe(true);
    g.key('KeyE');
    expect(expo(g).cable.connected).toBe(true);

    expect(expo(g).printerOnline).toBe(false);
    expect(g.snapshot().props.find((p) => p.kind === 'printer')?.state).not.toBe('done');
    expect(g.snapshot().progress).toContain('router:');

    // And the chapter does not end on power + cable + roller door alone.
    const noRouter = mk(2);
    steps_(noRouter, 2);
    expect(noRouter.snapshot().chapter).toBe(2);

    // Now the router.
    g.debug.place('droid', BRACE_SPOT.x, BRACE_SPOT.y);
    heaveWheel(g);
    expect(braceOntoMark(g)).toBe(true);
    expect(expo(g).printerOnline).toBe(true);
    expect(g.snapshot().props.find((p) => p.kind === 'printer')?.state).toBe('done');
    expect(g.snapshot().progress).toContain('router ✓');
  });

  it('runs chapter 2 end to end — breakers, cable, router and the roller door', () => {
    const g = mk(2);
    const panel = { x: GF.panel.x + 13, y: GF.panel.y + 8 };
    const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
    const printer = { x: GF.printer.x + 10, y: GF.printer.y + 6 };

    // 1. the router cabinet, while everyone is still in the technical room
    g.debug.place('droid', BRACE_SPOT.x, BRACE_SPOT.y);
    heaveWheel(g);
    expect(braceOntoMark(g)).toBe(true);
    // Droid gets off the wheel again before he is needed anywhere else.
    g.key('KeyE');
    expect(bot(g, 'droid').braced).toBe(false);

    // 2. the breakers
    g.debug.select('droid');
    g.debug.place('droid', panel.x + 20, panel.y + 30);
    for (let i = 0; i < 3; i++) g.key('KeyE');
    expect(expo(g).power).toBe(true);

    // 3. the cable
    expect(walkTo(g, 'voxxy', { x: rack.x + 10, y: rack.y - 14 })).toBe(true);
    g.key('KeyE');
    expect(walkTo(g, 'voxxy', { x: printer.x, y: printer.y + 34 })).toBe(true);
    g.key('KeyE');
    expect(expo(g).printerOnline).toBe(true);

    // 4. the roller door, Voxxy shoving Biggy down the top lane
    g.debug.select('voxxy');
    g.debug.place('biggy', 400, 160);
    g.debug.place('voxxy', 372, 160);
    g.setStick(1, 0);
    for (let i = 0; i < 400; i++) {
      if (g.snapshot().chapter !== 2) break;
      g.update(DT_MAX);
    }
    g.setStick(0, 0);
    steps_(g, 4);
    expect(g.snapshot().chapter).toBe(3);
  });
});

/* ================================================================ chapter 3 */

describe('chapter 3 — lunch', () => {
  it('runs the soup chain and only opens the gate once the soup and the speaker are both there', () => {
    const g = mk(3);
    const lunch = (): LunchState => g.debug.chapter() as LunchState;
    const gateWall = (): Wall | undefined => g.debug.walls().find((w) => w.kind === 'gate');
    expect(gateWall()).toBeDefined();

    // Voxxy clears a catering queue.
    g.debug.select('voxxy');
    g.debug.place('voxxy', 110, 260);
    g.key('KeyE');
    expect(lunch().queues[0].open).toBeGreaterThan(0);

    // The pot needs the ladle first, and the ladle needs Droid's reach.
    g.debug.select('biggy');
    g.debug.place('biggy', 105, 180);
    g.key('KeyE');
    expect(lunch().carrying).toBe(false);

    g.debug.select('droid');
    g.debug.place('droid', 176, 150);
    g.key('KeyE');
    expect(lunch().ladle).toBe(true);

    g.debug.select('biggy');
    g.key('KeyE');
    expect(lunch().carrying).toBe(true);

    // Hitting something at speed spills it.
    g.setStick(1, 0);
    steps(g, 70);
    g.setStick(0, 0);
    steps(g, 10);
    expect(lunch().soup).toBeLessThan(100);
    expect(lunch().soup).toBeGreaterThan(0);

    // Soup alone is not enough. The drop is where Stephan stands: SOUTH of the main
    // staircase, past the reception desk — the only side of the flight anyone can
    // reach now that the lobby follows the plan.
    const drop = g.snapshot().props.find((p) => p.kind === 'dropzone');
    expect(drop).toBeDefined();
    const dropAt = { x: drop!.x + (drop!.w ?? 0) / 2, y: drop!.y + (drop!.h ?? 0) / 2 };
    expect(dropAt.y).toBeGreaterThan(GF.mainStair.y + GF.mainStair.h);
    expect(dropAt.x).toBeGreaterThan(GF.reception.x + GF.reception.w);
    g.debug.place('biggy', dropAt.x, dropAt.y);
    g.key('KeyE');
    expect(lunch().delivered).toBe(true);
    expect(gateWall()).toBeDefined();

    // Clear the top-shelf sticker out of the way first: it shares the booth grid with
    // the speaker's hiding places, and `E` offers the swag before the conversation.
    const sticker = g.snapshot().props.find((p) => p.kind === 'sticker');
    g.debug.select('droid');
    g.debug.place('droid', sticker!.x, sticker!.y + 20);
    g.key('KeyE');
    expect(g.snapshot().swag).toContain('sticker');

    // Find the speaker at the booth they are hiding behind, then lead them over.
    const hiding = g.snapshot().people.find((p) => p.role === 'speaker');
    const booth = GF.booths.find((b) => b.name === lunch().speaker.booth);
    expect(booth).toBeDefined();
    expect(booth?.table).toBe(false);
    const sx = hiding ? hiding.x : booth!.x + booth!.w / 2;
    const sy = hiding ? hiding.y : booth!.y + booth!.h + 14;

    g.debug.select('voxxy');
    g.debug.place('voxxy', sx, sy + 24);
    steps(g, 1);
    g.key('KeyE');
    expect(lunch().speaker.following).toBe(true);

    expect(walkTo(g, 'voxxy', dropAt)).toBe(true);
    expect(until(g, () => lunch().speaker.onStage, 900)).toBe(true);

    // Both delivered: the gate goes up and the cutscene runs.
    expect(lunch().gateOpen).toBe(true);
    expect(gateWall()).toBeUndefined();
    expect(g.snapshot().phase).toBe('cut');
    expect(until(g, () => g.snapshot().chapter === 4, 600)).toBe(true);
    expect(g.snapshot().floor).toBe('up');
  });

  it('puts thirty-six visitors on the lane grid, with Stephan at the foot of the stairs', () => {
    const g = mk(3);
    steps(g, 1400);
    const lunch = g.debug.chapter() as LunchState;
    expect(lunch.crowd).toBe(36);
    expect(g.snapshot().people.filter((p) => p.role === 'visitor')).toHaveLength(36);
    const stephan = g.snapshot().people.find((p) => p.role === 'stephan');
    expect(stephan).toBeDefined();
    // He stands where the gate is: south of the flight, past the reception desk.
    expect((stephan as { y: number }).y).toBeGreaterThan(GF.mainStair.y + GF.mainStair.h);
    expect((stephan as { x: number }).x).toBeGreaterThan(GF.reception.x + GF.reception.w);
  });

  /**
   * THE CROWD'S ROUTE, WHICH MOVED WITH THE ENTRANCE.
   *
   * Only the left-hand doors are open for Devoxx (`GF.entrance`, Michele's plot),
   * and the small staircase is the only way through the hall's right edge — so the
   * whole crowd comes in on a 136 px front next to reception and goes down the
   * steps. The prototype spawned them along the entire wall at the canvas edge and
   * walked them through a wall that is not there any more.
   */
  it('brings the crowd in through the left-hand doors and down the steps, nowhere else', () => {
    const g = mk(3);
    const e = GF.entrance;
    const st = GF.smallStairs;
    const edge = GF.hall.x + GF.hall.w;

    expect(until(g, () => g.snapshot().people.some((p) => p.role === 'visitor'), 120)).toBe(true);
    const arrivals = g.snapshot().people.filter((p) => p.role === 'visitor');
    expect(arrivals.length).toBeGreaterThan(0);
    for (const p of arrivals) {
      expect(p.x).toBeGreaterThan(e.x - 40);
      expect(p.x).toBeLessThanOrEqual(e.x + e.w);
      expect(p.y).toBeGreaterThanOrEqual(e.y - 8);
      expect(p.y).toBeLessThanOrEqual(e.y + e.h + 8);
    }

    // Every crossing of the hall's right edge is on the steps, all run long.
    let crossings = 0;
    for (let i = 0; i < 1400; i++) {
      g.update(DT_MAX);
      for (const p of g.snapshot().people) {
        if (p.role !== 'visitor' || Math.abs(p.x - edge) > 8) continue;
        crossings++;
        expect(p.y, `a visitor crossed the hall wall at y=${Math.round(p.y)}`).toBeGreaterThanOrEqual(st.y - 6);
        expect(p.y, `a visitor crossed the hall wall at y=${Math.round(p.y)}`).toBeLessThanOrEqual(st.y + st.h + 6);
      }
    }
    expect(crossings).toBeGreaterThan(20);

    // And they get all the way in: a crowd stuck in single file at the threshold
    // leaves the hall empty, which is the whole chapter's stage.
    const crowd = g.snapshot().people.filter((p) => p.role === 'visitor');
    expect(crowd).toHaveLength(36);
    for (const p of crowd) expect(p.x).toBeLessThan(edge);
    expect(new Set(crowd.map((p) => Math.round(p.y / 70))).size).toBeGreaterThan(3);
  });
});

/* ================================================================ chapter 4 */

describe('chapter 4 — keynote', () => {
  it('finishes the three jobs and ends the game with all three robots on the stage', () => {
    const g = mk(4);
    const key = (): KeynoteState => g.debug.chapter() as KeynoteState;
    const mark = g.snapshot().props.find((p) => p.kind === 'cake-mark');
    expect(mark).toBeDefined();
    const markX = mark!.x + (mark!.w ?? 0) / 2;

    // Biggy shoves the cake crate up the aisle onto its mark.
    expect(g.debug.placeProp('cake', markX, mark!.y + 58)).toBe(true);
    g.debug.select('biggy');
    g.debug.place('biggy', markX, mark!.y + 98);
    g.setStick(0, -1);
    expect(until(g, () => key().cake, 200)).toBe(true);
    g.setStick(0, 0);

    // Droid hangs the banner: one hook, then the other.
    const hooks = g.snapshot().props.filter((p) => p.kind === 'banner-hook');
    expect(hooks).toHaveLength(2);
    g.debug.select('droid');
    for (const h of hooks) {
      g.debug.place('droid', h.x, h.y + 22);
      g.key('KeyE');
    }
    expect(key().hooks).toBe(2);

    // Voxxy lights the spotlights, and only in order.
    const spots = g.snapshot().props.filter((p) => p.kind === 'spotlight');
    expect(spots).toHaveLength(4);
    g.debug.select('voxxy');
    g.debug.place('voxxy', spots[2].x, spots[2].y);
    steps(g, 1);
    expect(key().spots).toBe(0);
    for (const s of spots) {
      g.debug.place('voxxy', s.x, s.y);
      steps(g, 1);
    }
    expect(key().spots).toBe(4);
    expect(key().ready).toBe(true);

    // Everyone on stage.
    const stage = g.snapshot().props.find((p) => p.kind === 'stage');
    expect(stage).toBeDefined();
    const sy = stage!.y + (stage!.h ?? 0) / 2;
    g.debug.place('voxxy', stage!.x + 20, sy);
    g.debug.place('droid', stage!.x + 90, sy);
    g.debug.place('biggy', stage!.x + 160, sy);
    steps(g, 1);
    expect(g.snapshot().phase).toBe('done');
    expect(g.snapshot().card).toContain('Keynote starts');
    expect(g.snapshot().score.points).toBeGreaterThan(0);
  });

  it('blocks the seat blocks and leaves the aisles open', () => {
    const g = mk(4);
    const seats = g.debug.walls().filter((w) => w.kind === 'seatblock');
    expect(seats).toHaveLength(3);
    // Low walls stop robots but not light, which is what makes the room readable.
    expect(seats.every((w) => w.low)).toBe(true);
    expect(seats[0].why?.(bot(g, 'biggy'))).toContain('aisles');
  });
});

/* =================================================================== the rig */

describe('the game rig', () => {
  it('walks Skip chapter from 1 to 2 to 3 to 4 and out', () => {
    const g = createGame({ seed: SEED, cards: false });
    expect(g.snapshot().chapter).toBe(1);
    for (const n of [2, 3, 4]) {
      g.skipChapter();
      steps(g, 3);
      expect(g.snapshot().chapter).toBe(n);
    }
    g.skipChapter();
    expect(g.snapshot().phase).toBe('done');
    expect(g.snapshot().card).toContain('skipped: 1, 2, 3, 4');

    // Skipping the END CARD skips nothing: it used to push chapter 4 a second
    // time, so the card read "skipped: 1, 2, 3, 4, 4".
    g.skipChapter();
    expect(g.snapshot().card).toContain('skipped: 1, 2, 3, 4<');
  });

  it('gives every chapter a live progress line that actually moves', () => {
    for (const n of [1, 2, 3, 4]) {
      const g = mk(n);
      steps(g, 4);
      const line = g.snapshot().progress;
      expect(line, `chapter ${n} has no progress line`).not.toBe('');
      expect(line.length).toBeLessThan(180);
    }
    // Chapter 2's line counts the three jobs down as they are done.
    const g = mk(2);
    steps(g, 2);
    expect(g.snapshot().progress).toContain('breakers 0/3');
    expect(g.snapshot().progress).toContain('roller door');
  });

  /**
   * THE SWALLOWED KEYPRESS.
   *
   * Chapters 2, 3 and 4 open on a "press any key" card that pauses the sim, and
   * `game.key()` used to clear the card and RETURN — so the first real keypress
   * after every chapter start was eaten. Pressing 2 to take Droid did nothing the
   * first time, deterministically, and the player was never told why. Dismissing a
   * card now costs the key nothing.
   */
  it('never eats the first real keypress after a chapter card', () => {
    for (const seed of [7, 11]) {
      for (const chapter of [2, 3, 4]) {
        const g = createGame({ seed, chapter });
        const where = `chapter ${chapter}, seed ${seed}`;
        expect(g.snapshot().card, `${where} should open on a card`).not.toBeNull();
        expect(g.snapshot().active, where).toBe(0);
        g.key('Digit2');
        // One press: the card is gone AND Droid has the controls.
        expect(g.snapshot().card, `${where} card survived`).toBeNull();
        expect(g.snapshot().active, `${where} ate the 2`).toBe(1);
      }
    }
  });

  it('dismisses a card with a key that means nothing else, and plays on', () => {
    const g = createGame({ seed: SEED, chapter: 2 });
    expect(g.snapshot().card).not.toBeNull();
    g.update(DT_MAX);
    expect(g.snapshot().t).toBe(0); // the card really did pause the sim
    g.key('Space');
    expect(g.snapshot().card).toBeNull();
    expect(g.snapshot().active).toBe(0);
    steps(g, 5);
    expect(g.snapshot().t).toBeGreaterThan(0);
  });

  it('honours the end card\'s own "R to play again" on the first press', () => {
    const g = createGame({ seed: SEED });
    g.key('Space');
    for (let i = 0; i < 4; i++) g.skipChapter();
    expect(g.snapshot().phase).toBe('done');
    expect(g.snapshot().card).toContain('R to play again');
    g.key('KeyR');
    expect(g.snapshot().chapter).toBe(0);
    expect(g.snapshot().phase).toBe('intro');
  });

  it('starts on a card, dismisses it with any key, and restarts on R', () => {
    const g = createGame({ seed: SEED });
    expect(g.snapshot().card).toContain('AFTER DARK');
    expect(g.snapshot().chapter).toBe(0);
    g.update(DT_MAX);
    expect(g.snapshot().t).toBe(0);
    g.key('Space');
    expect(g.snapshot().chapter).toBe(1);
    steps(g, 10);
    expect(g.snapshot().t).toBeGreaterThan(0);
    g.key('KeyR');
    expect(g.snapshot().chapter).toBe(0);
    expect(g.snapshot().t).toBe(0);
  });

  it('is deterministic for a seed, and different for another', () => {
    const a = mk(1).debug.chapter() as NightState;
    const b = mk(1).debug.chapter() as NightState;
    const c = (createGame({ seed: SEED + 1, chapter: 1, cards: false }).debug.chapter() as NightState).code;
    expect(a.code).toBe(b.code);
    expect(a.code).not.toBe(c);
  });

  it('throttles a wall that explains itself', () => {
    const g = mk(1);
    g.debug.select('biggy');
    g.debug.place('biggy', 560, 350);
    g.setStick(1, 0);
    steps(g, 40);
    const first = g.snapshot().toast;
    expect(first?.t).toContain('fire door');
    // Same wall, same second: no second toast.
    const at = first!.until;
    steps(g, 2);
    expect(g.snapshot().toast?.until).toBe(at);
    g.setStick(0, 0);
  });

  it('routes digits to the keypad at the fire door, and to the switcher away from it', () => {
    const g = mk(1);
    const code = (g.debug.chapter() as NightState).code;

    // Away from the door, 1/2/3 are the robot switcher, as the controls line says.
    g.debug.select('voxxy');
    g.debug.place('voxxy', 300, 350);
    steps(g, 1);
    g.key('Digit3');
    expect(g.snapshot().active).toBe(2);
    expect(g.snapshot().entered).toBe('');
    // A digit with no other meaning says why it did nothing rather than vanishing.
    g.key('Digit7');
    expect(g.snapshot().toast?.t ?? '').toContain('keypad');

    // At the pad, every digit types — including for Biggy, whose 17 px of radius
    // used to keep his centre outside the old flat 40 px reach.
    for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
      const h = mk(1);
      const c = (h.debug.chapter() as NightState).code;
      h.debug.select(kind);
      h.debug.place(kind, 600 - 18 - bot(h, kind).r, 320);
      steps(h, 1);
      h.key(`Digit${c[0]}`);
      expect(h.snapshot().entered, `${kind} could not reach the keypad`).toBe(c[0]);
      // And the driven robot did not change underneath the player.
      expect(h.snapshot().bots[h.snapshot().active].kind).toBe(kind);
    }

    const g2 = mk(1);
    g2.debug.select('voxxy');
    g2.debug.place('voxxy', 585, 330);
    steps(g2, 1);
    for (const d of code) g2.key(`Digit${d}`);
    expect((g2.debug.chapter() as NightState).fireOpen).toBe(true);
  });

  it('speaks the blocked message in each robot\'s own voice, not one script with a name swapped', () => {
    const g = mk(1);
    const fire = g.debug.walls().find((w) => w.kind === 'firedoor');
    expect(fire?.why).toBeDefined();
    const lines = (['voxxy', 'droid', 'biggy'] as const).map((k) => fire?.why?.(bot(g, k)) ?? '');
    expect(new Set(lines).size).toBe(3);
    // Not the same sentence with the name swapped: strip the names and compare.
    const bodies = lines.map((l) => l.replace(/^(Voxxy|Droid|Biggy):\s*/, ''));
    expect(new Set(bodies).size).toBe(3);
  });

  it('switches robot with 1/2/3 and Tab, and never to a mounted Droid', () => {
    const g = mk(1);
    expect(g.snapshot().active).toBe(0);
    g.key('Digit3');
    expect(g.snapshot().active).toBe(2);
    g.key('Tab');
    expect(g.snapshot().active).toBe(0);

    // Droid climbs on Biggy: control follows the tower, and 2 no longer selects him.
    g.debug.place('biggy', 300, 350);
    g.debug.place('droid', 322, 350);
    g.debug.select('droid');
    g.key('KeyE');
    expect(bot(g, 'droid').mounted).toBe(true);
    expect(g.snapshot().active).toBe(2);
    g.key('Digit2');
    expect(g.snapshot().active).toBe(2);
    g.key('Tab');
    expect(g.snapshot().active).toBe(0);
  });
});
