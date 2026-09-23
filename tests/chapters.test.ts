/**
 * The four chapters, driven headlessly through the public `Game` surface.
 *
 * These are the prototype's own verified choreography (GAUNTLET.md section 4,
 * "Tests are the acceptance criteria"), ported rather than reinvented: four clues
 * including the kiosk one, the jammed door for Biggy alone, the roller door that
 * needs a push, the cable that fits on the straight route and runs out on the long
 * one, the breakfast chain, the keynote jobs, both cutscenes and Skip chapter.
 *
 * Everything runs at a fixed `DT_MAX` step, and the game is seeded, so a failure
 * here is a real regression and not a flaky frame.
 *
 * ## The 2026-09-23 speed rescale
 *
 * Every `expect` in this file is the one it was before the rescale
 * (`SPEED_SCALE` in `src/sim/constants.ts`), with one exception noted at the line
 * itself. What did move is the PILOT: a leg written as "hold the stick for 50
 * steps" is a *distance* expressed in the old top speeds, and the rooms did not
 * shrink when the robots slowed down, so those budgets carry `TRAVEL_TIME_SCALE`.
 * Likewise one hand-placed robot that was 22 px from Biggy — inside the old 42 px
 * mount reach, but half a metre clear of him once the radii became the rendered
 * ones — now stands against his flank, which is what the test always meant.
 */

import { describe, expect, it } from 'vitest';

import {
  CABLE_MAX,
  CRATE_DELIVERY,
  CRATE_STACK_LIMIT,
  DEFS,
  DT_MAX,
  TRAVEL_TIME_SCALE,
  crateLoadAccel,
  crateLoadMass,
  GF,
  JAMMED_DOOR_SPEED,
  R,
  ROLLER_DOOR_SPEED,
  roomDoor,
  circleRect,
  createGame,
  type Bot,
  type DebugGame,
  type ExpoState,
  type KeynoteState,
  type BreakfastState,
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

/* --------------------------------------------- the chapter-2 network closet
 *
 * The router cabinet in the technical room. Biggy shoulders the door open; the
 * terminal inside wants `DevoxxForever`, and there are three ways to answer it —
 * type it, have Voxxy read it off the poster in the hall, or have Droid read the
 * label inside the lid from Biggy's shoulders. These helpers are the choreography
 * a player performs, and everything they read comes out of the public snapshot and
 * `ExpoState`, never out of the chapter's internals.
 */

/** The cabinet's south face, from `GF` — the same point `ch2-expo.ts` measures from. */
const HUB: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };
/** The Cloudy Bank booth's south face, where the sponsor banner hangs. */
const POSTER: Vec2 = (() => {
  const bo = GF.booths.find((o) => o.name === 'Cloudy Bank');
  if (!bo) throw new Error('no Cloudy Bank booth');
  return { x: bo.x + bo.w / 2, y: bo.y + bo.h + 2 };
})();

const expo = (g: DebugGame): ExpoState => g.debug.chapter() as ExpoState;

function steps_(g: DebugGame, n: number): void {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
}

/** Biggy walks up to the cabinet and puts his shoulder into it. */
function openCabinet(g: DebugGame): boolean {
  g.debug.select('biggy');
  g.debug.place('biggy', HUB.x, HUB.y + 30);
  g.key('KeyE');
  return expo(g).router.cabinetOpen;
}

/** Type a string at the terminal, one `KeyX` at a time, exactly as the shell does. */
function typeAt(g: DebugGame, text: string): void {
  for (const ch of text.toUpperCase()) g.key(`Key${ch}`);
}

/* ================================================================ chapter 1 */

describe('chapter 1 — night', () => {
  /**
   * The cinemas that are only scenery have to be shut, not merely labelled.
   *
   * A, C and D each carry a joke sign saying they are closed. For four rounds the
   * sign was the only thing there: the doorway itself was a hole, so you could walk
   * through "locked since the 2019 after-party" into an empty room. No test caught
   * it because nothing asserted that a room nobody should enter cannot be entered —
   * Michele found it in his first minute of play.
   *
   * B and E are deliberately excluded: they ARE the puzzle, and their gates open.
   */
  it('shuts the cinemas that are only scenery — you cannot walk through a closed sign', () => {
    const g = mk(1);
    const walls = g.snapshot().walls;

    for (const n of ['A', 'C', 'D'] as const) {
      const r = R(n);
      const d = roomDoor(r);
      const blocks = walls.some(
        (w) =>
          !w.low &&
          !w.hidden &&
          w.x < d.x + d.w &&
          w.x + w.w > d.x &&
          w.y < d.y + d.h &&
          w.y + w.h > d.y,
      );
      expect(blocks, `cinema ${n} has a "closed" sign and an open doorway`).toBe(true);
    }
  });

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

    /*
     * 4 · the exit alcove in cinema E: all three at once — and Biggy is NOT in
     * the room with the other two.
     *
     * He used to be teleported to `c4.x - 24, c4.y + 42`, a spot beside the
     * alcove. That was a position no player could ever have walked to once the
     * aisle went back to 1.2 m, and the test never noticed because it teleports.
     * So it now places him where he can actually stand — the front of the house,
     * north of the seat rows — pointing his flood at the SCREEN rather than at
     * the clue. Cinema E's screen is the chapter's mirror, and the bounce is how
     * orange and green and blue all reach an alcove Biggy cannot walk to. That is
     * the beat the room was designed around, and until now no test described it.
     */
    const c4 = night().clues[3];
    g.debug.place('voxxy', c4.x, c4.y + 8, -Math.PI / 2);
    g.debug.place('droid', c4.x + 11, c4.y + 30);
    g.debug.place('biggy', 462, 417, 0.393);
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

  /*
   * WHY THE PILOT NOW STANDS NORTH OF THE RACK RATHER THAN ON ITS CORNER.
   *
   * It used to walk to `rack.x + 10, rack.y - 14`, which is two sim pixels off the
   * rack's north-east corner — fine while the rack was a picture. Michele's chapter
   * 2 report ("robots can go through staircase and objects") turned the whole of
   * the hall's drawn furniture into colliders, the 19-inch rack included, so that
   * waypoint is now inside a cabinet. The pilot stands 24 px north of the reel
   * instead: still well inside `PLUG_REACH`, same errand, same route.
   */
  it('runs the cable to the printer on the straight route, and snaps it on the long way round', { timeout: 30000 }, () => {
    const g = mk(2);
    const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
    const printer = { x: GF.printer.x + 10, y: GF.printer.y + 6 };

    expect(walkTo(g, 'voxxy', { x: rack.x, y: rack.y - 24 })).toBe(true);
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
    /*
     * THE ONE NUMBER THE 2026-09-23 RESCALE MOVED IN THIS FILE, and it moved
     * because the rescale worked. The reel is measured along the path Voxxy
     * actually walks, and the old 290 px/s Voxxy overshot every corner the pilot
     * steered her round; at 72.5 she tracks the waypoints, and the same route
     * measures 1161 px instead of 1194 — 2.7% less cable for the same walk. The
     * band is still asserted at both ends and is TIGHTER than it was: 1140 is
     * 1.8% under the measured run, where 1200 was 0.5% under the old one only
     * because the old one wandered.
     */
    expect(cable.len).toBeGreaterThan(1140);
    expect(cable.len).toBeLessThan(CABLE_MAX * 0.85);

    /*
     * The long way round: out of the technical room, down the bottom lane and back.
     *
     * The first leg used to be a hand-written waypoint at 215,625, which threaded
     * the technical room's door by eye. The hall has colliders now — a roof column
     * stands at 220,620 and the rack itself is solid — so getting OUT of the room
     * is routed rather than guessed, and the detour proper starts once she is in
     * the open lane. The errand is the same: 2,100 px of walking against a 1,480 px
     * reel.
     */
    const long = mk(2);
    expect(walkTo(long, 'voxxy', { x: rack.x, y: rack.y - 24 })).toBe(true);
    long.key('KeyE');
    expect(walkTo(long, 'voxxy', { x: 300, y: 650 })).toBe(true);
    const detour: Vec2[] = [
      { x: 950, y: 650 },
      { x: 300, y: 650 },
      { x: 950, y: 650 },
    ];
    driveTo(long, 'voxxy', detour, 10, 500);
    const snapped = (long.debug.chapter() as ExpoState).cable;
    expect(snapped.snapped).toBe(true);
    expect(snapped.taut).toBe(false);
    expect(snapped.carrying).toBe(false);
    expect(snapped.connected).toBe(false);
  });

  it('gives Droid the breakers, and nobody else', () => {
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
  });

  /**
   * MICHELE'S CALL, 24 Sep 2026, playing this chapter: *"Minigames should be in
   * chapter 3 — the hall is still closed at the moment."* A booth game needs a
   * booth with somebody standing at it, and nobody is in this hall at 3 a.m.
   *
   * So chapter 2 has no booth props at all, awards no swag, and never mentions
   * one in the briefing, the keys line or the progress line. The choreography
   * that used to live here is now in the chapter-3 block below.
   */
  it('has no booth games in the empty hall — no props, no swag, no mention', () => {
    const g = mk(2);
    steps(g, 20);
    const snap = g.snapshot();
    for (const kind of ['duck', 'duck-target', 'sticker', 'race-marker']) {
      expect(snap.props.find((p) => p.kind === kind), `chapter 2 still draws ${kind}`).toBeUndefined();
    }
    expect(snap.swag).toHaveLength(0);
    expect(g.debug.placeProp('duck', 500, 500)).toBe(false);

    const said = `${snap.objective} ${snap.keys} ${snap.progress}`.toLowerCase();
    for (const word of ['swag', 'booth game', 'sticker', 'duck', 'lap']) {
      expect(said.includes(word), `chapter 2 still talks about ${word}`).toBe(false);
    }

    // ...and pressing E where the booths are is an ordinary "nothing here", not a game.
    const stB = GF.booths.find((b) => b.name === 'Sticker Mine');
    expect(stB).toBeDefined();
    g.debug.select('droid');
    g.debug.place('droid', stB!.x + stB!.w / 2, stB!.y + stB!.h + 34);
    g.key('KeyE');
    expect(g.snapshot().swag).toHaveLength(0);
  });

  /* ---------------------------------------------------- the network closet */

  it('keeps the router cabinet shut for everybody but Biggy, and says why in each voice', () => {
    // Voxxy and Droid, right up against the door, pressing E: it does not move.
    for (const kind of ['voxxy', 'droid'] as const) {
      const g = mk(2);
      g.debug.select(kind);
      g.debug.place(kind, HUB.x, HUB.y + 20);
      g.key('KeyE');
      expect(expo(g).router.cabinetOpen, `${kind} opened the cabinet`).toBe(false);
      // ...and the terminal inside is unreachable until it is open.
      expect(expo(g).router.prompting).toBe(false);
      g.key('KeyD');
      expect(expo(g).router.typed).toBe('');
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
    // Biggy has no blocked line here: his answer is the door opening.
    expect(cab?.why?.(bot(g, 'biggy'))).toBeNull();

    // And once he has opened it, the wall stops explaining itself — the carcass is
    // still a collider, because a 19-inch floor cabinet is not a doorway.
    expect(openCabinet(g)).toBe(true);
    expect(cab?.why?.(bot(g, 'voxxy'))).toBeNull();
    expect(g.debug.walls().some((w) => w.kind === 'cabinet')).toBe(true);
    expect(g.snapshot().props.find((p) => p.kind === 'cabinet')?.state).toBe('open');
  });

  /*
   * ROUTE 1 — TYPED FROM MEMORY. The password is on the chapter card, so a player
   * who read it can walk to the terminal and type it without finding anything.
   *
   * What is asserted here is the *forgiveness*, because that is the whole of
   * Michele's "simpler": a wrong key does not go in and does not throw away what is
   * already there, Backspace takes one back, and while the prompt is open the
   * keyboard belongs to the terminal — `R` is the two Rs in DevoxxForever, not
   * restart. Case never enters into it: `KeyboardEvent.code` is `KeyD` whether or
   * not shift was down, which is what `typeAt` reproduces.
   */
  it('takes the WiFi password typed at the terminal, and forgives a wrong key and a slip', () => {
    const g = mk(2);
    expect(openCabinet(g)).toBe(true);

    // Biggy is standing right at it and cannot type a word of it.
    g.key('KeyE');
    expect(expo(g).router.prompting).toBe(false);
    expect(g.snapshot().typing).toBe(false);

    g.debug.select('voxxy');
    g.debug.place('voxxy', HUB.x, HUB.y + 20);
    g.key('KeyE');
    expect(expo(g).router.prompting).toBe(true);
    expect(g.snapshot().typing, 'the terminal never took the keyboard').toBe(true);

    typeAt(g, 'DEV');
    expect(expo(g).router.typed).toBe('DEV');

    // A wrong key is refused, not punished: nothing already typed is lost.
    g.key('KeyZ');
    g.key('KeyQ');
    expect(expo(g).router.typed).toBe('DEV');
    expect(expo(g).router.online).toBe(false);

    // R is a letter in here. It is NOT the next one, so it does nothing at all —
    // and above all it does not restart the chapter out from under the player.
    g.key('KeyR');
    expect(expo(g).router.typed).toBe('DEV');
    expect(g.snapshot().chapter, 'R restarted the run while the player was typing').toBe(2);
    expect(expo(g).router.cabinetOpen).toBe(true);

    // Backspace takes one back.
    g.key('Backspace');
    expect(expo(g).router.typed).toBe('DE');

    // The live readout shows what is in and what is left, so it is never a guess.
    expect(g.snapshot().progress).toContain('WIFI PASSWORD');
    expect(g.snapshot().progress).toContain('(2/13)');

    typeAt(g, 'VOXXFOREVER');
    const r = expo(g).router;
    expect(r.typed).toBe('DEVOXXFOREVER');
    expect(r.online).toBe(true);
    expect(r.prompting).toBe(false);
    expect(g.snapshot().typing).toBe(false);
    expect(g.snapshot().progress).toContain('router ✓');
    expect(g.snapshot().props.find((p) => p.kind === 'terminal')?.state).toBe('done');
  });

  /*
   * THE KEYBOARD IS ONLY EVER BORROWED. Outside the prompt every key means what it
   * always meant — this is the half that a "letters type" feature breaks silently.
   */
  it('gives the keyboard to the terminal only while its prompt is open', () => {
    const g = mk(2);
    expect(g.snapshot().typing).toBe(false);
    expect(openCabinet(g)).toBe(true);

    // No prompt: R is restart, and a restart drops the whole run back to chapter 1.
    g.key('KeyR');
    expect(g.snapshot().chapter).toBe(1);

    g.startChapter(2);
    expect(openCabinet(g)).toBe(true);
    g.debug.select('voxxy');
    g.debug.place('voxxy', HUB.x, HUB.y + 20);
    g.key('KeyE');
    typeAt(g, 'DEVO');
    expect(g.snapshot().typing).toBe(true);

    // Esc hands it back, and what was typed survives for when she comes back.
    g.key('Escape');
    expect(g.snapshot().typing).toBe(false);
    expect(expo(g).router.prompting).toBe(false);
    expect(expo(g).router.typed).toBe('DEVO');
    // Now a letter is a letter to nobody: it must not reach the terminal.
    g.key('KeyX');
    expect(expo(g).router.typed).toBe('DEVO');

    // Walking off closes the prompt by itself — including switching robot.
    g.key('KeyE');
    expect(g.snapshot().typing).toBe(true);
    g.debug.place('voxxy', 600, 400);
    steps_(g, 1);
    expect(g.snapshot().typing, 'the prompt followed her across the hall').toBe(false);
  });

  /*
   * ROUTE 2 — VOXXY READS THE POSTER. Her cone is 0.38 rad against Biggy's 1.0, and
   * the test that matters is the negative one: the same robot in the same place
   * facing the other way, and the other two robots square on to it, read nothing.
   * The skirt each robot throws round its own feet is excluded on purpose, or
   * standing next to the banner in the dark would BE reading it.
   */
  it("reads the poster under Voxxy's narrow beam, and not by standing near it", () => {
    const park = (g: DebugGame, kinds: RobotKind[]): void => {
      kinds.forEach((k, i) => g.debug.place(k, 560 + 30 * i, 660));
    };

    // Square on, at 34 px, beam north onto the banner: she reads it. (34 and not
    // 40: a sponsor's crate stands at 761,367 and a hand-placed robot must not be
    // teleported inside a collider.)
    const g = mk(2);
    park(g, ['droid', 'biggy']);
    g.debug.place('voxxy', POSTER.x, POSTER.y + 34, -Math.PI / 2);
    steps_(g, 4);
    expect(expo(g).router.posterLit).toBe(true);
    expect(expo(g).router.known).toBe(true);
    expect(g.snapshot().props.find((p) => p.kind === 'poster')?.state).toBe('done');

    // Close enough to touch it, but facing away: her skirt lights the floor there
    // and it is still not reading.
    const away = mk(2);
    park(away, ['droid', 'biggy']);
    away.debug.place('voxxy', POSTER.x, POSTER.y + 18, Math.PI / 2);
    steps_(away, 4);
    expect(expo(away).router.posterLit, 'the skirt read the small print').toBe(false);
    expect(expo(away).router.known).toBe(false);

    // Beam on it from across the hall: lit is not read.
    const far = mk(2);
    park(far, ['droid', 'biggy']);
    far.debug.place('voxxy', POSTER.x, POSTER.y + 140, -Math.PI / 2);
    steps_(far, 4);
    expect(expo(far).router.known, 'she read 8-point type from 11 m').toBe(false);

    // Droid's pool and Biggy's 1.0 rad flood, square on at the same 40 px: nothing.
    for (const kind of ['droid', 'biggy'] as const) {
      const other = mk(2);
      other.debug.place('voxxy', 560, 660);
      other.debug.place(kind === 'droid' ? 'biggy' : 'droid', 600, 660);
      other.debug.place(kind, POSTER.x, POSTER.y + 34, -Math.PI / 2);
      steps_(other, 4);
      expect(expo(other).router.known, `${kind} read the small print`).toBe(false);
    }
  });

  /*
   * ROUTE 3 — DROID READS THE LABEL, FROM BIGGY'S SHOULDERS. The tape is inside the
   * lid, up at the top, which is where every conference's WiFi password really
   * lives; `toggleMount` is the mechanic, and outside chapter 1's projector panel
   * almost nothing in the game uses it.
   */
  it('lets Droid read the label inside the lid only from Biggy\'s shoulders', () => {
    const g = mk(2);
    expect(openCabinet(g)).toBe(true);

    // Droid on his own feet at the cabinet gets the terminal, never the label.
    g.debug.select('droid');
    g.debug.place('droid', HUB.x, HUB.y + 20);
    g.key('KeyE');
    expect(expo(g).router.known, 'Droid read the lid with his feet on the floor').toBe(false);
    expect(expo(g).router.prompting).toBe(true);
    g.key('Escape');

    // Climb on wherever Biggy is standing — the tower walks over afterwards.
    g.debug.place('biggy', 300, 640);
    g.debug.place('droid', 284, 640);
    g.debug.select('droid');
    g.key('KeyE');
    expect(bot(g, 'droid').mounted).toBe(true);

    // Too far from the cabinet, up there, is still too far.
    g.debug.place('biggy', HUB.x, HUB.y + 70);
    steps_(g, 1);
    g.key('KeyE');
    expect(expo(g).router.known).toBe(false);
    expect(bot(g, 'droid').mounted, 'the near-miss climbed him down instead').toBe(true);

    // Right up against it: he gets his head inside the lid.
    g.debug.place('biggy', HUB.x, HUB.y + 20);
    steps_(g, 1);
    g.key('KeyE');
    expect(expo(g).router.known).toBe(true);
    expect(g.snapshot().progress).toContain('password known');

    // Knowing it is not entering it: somebody still has to work the terminal, and
    // it is not going to be Biggy.
    expect(expo(g).router.online).toBe(false);
    g.key('KeyE');
    expect(bot(g, 'droid').mounted, 'E at the open lid did not climb him down again').toBe(false);
    g.debug.select('droid');
    g.debug.place('droid', HUB.x, HUB.y + 20);
    g.key('KeyE');
    expect(expo(g).router.online).toBe(true);
    expect(expo(g).router.typed).toBe('DEVOXXFOREVER');
  });

  /*
   * THE END OF THE REEL — Michele: *"When cable ends, Voxxy should be stopped and
   * only further going would release it."*
   *
   * It used to just vanish: one frame under `CABLE_MAX`, the next the plug was back
   * on the rack. There was nothing between "fine" and "gone", so there was nothing
   * the player could react to. Three things are asserted here and each of them is
   * invisible to every other test in this file: the cable goes TAUT, Voxxy is HELD
   * while it is, and she is only released by continuing to pull.
   */
  it('holds Voxxy on the end of the cable, and only lets go if she keeps pulling', { timeout: 30000 }, () => {
    const g = mk(2);
    const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
    g.debug.select('voxxy');
    g.debug.place('voxxy', rack.x, rack.y - 24);
    g.key('KeyE');
    expect(expo(g).cable.carrying).toBe(true);

    // Out of the technical room, then up and down the bottom lane until the reel
    // is paid out. Long before the old code would have snapped it.
    expect(walkTo(g, 'voxxy', { x: 300, y: 650 })).toBe(true);
    const lane: Vec2[] = [
      { x: 950, y: 650 },
      { x: 300, y: 650 },
      { x: 950, y: 650 },
    ];
    let taut = false;
    for (const p of lane) {
      for (let i = 0; i < 500 && !taut; i++) {
        const b = bot(g, 'voxxy');
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        if (Math.hypot(dx, dy) <= 10) break;
        g.setStick(Math.abs(dx) > 3 ? Math.sign(dx) : 0, Math.abs(dy) > 3 ? Math.sign(dy) : 0);
        g.update(DT_MAX);
        taut = expo(g).cable.taut;
      }
      if (taut) break;
    }
    expect(taut, 'the cable never went taut on a 2,100 px route').toBe(true);

    // HELD. The stick is still down and she is still trying, and she does not get
    // any further: the whole reel is out and the cable is what is stopping her.
    const at = { ...bot(g, 'voxxy') };
    const c = expo(g).cable;
    expect(c.carrying).toBe(true);
    expect(c.snapped).toBe(false);
    expect(c.len).toBeGreaterThan(CABLE_MAX * 0.95);
    expect(c.len).toBeLessThanOrEqual(CABLE_MAX);

    // Let go of the stick: she stays put, and the plug stays in. Pulling is a
    // decision, not a timer that was already running.
    g.setStick(0, 0);
    steps(g, 90);
    expect(expo(g).cable.carrying, 'the plug came out while nobody was pulling').toBe(true);
    expect(Math.hypot(bot(g, 'voxxy').x - at.x, bot(g, 'voxxy').y - at.y)).toBeLessThan(6);

    // Now lean on it. THAT is what costs her the cable.
    g.setStick(1, 0);
    const out = until(g, () => expo(g).cable.snapped, 200);
    g.setStick(0, 0);
    expect(out, 'pulling against a taut cable never released the plug').toBe(true);
    const after = expo(g).cable;
    expect(after.carrying).toBe(false);
    expect(after.taut).toBe(false);
    expect(after.len).toBe(0);
  });

  it('keeps the badge printer offline until power, cable and router are all in', { timeout: 30000 }, () => {
    const g = mk(2);
    const panel = { x: GF.panel.x + 13, y: GF.panel.y + 8 };
    const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
    const printer = { x: GF.printer.x + 10, y: GF.printer.y + 6 };

    // Power and cable, but no router: the printer is still dark.
    g.debug.select('droid');
    g.debug.place('droid', panel.x + 20, panel.y + 30);
    for (let i = 0; i < 3; i++) g.key('KeyE');
    expect(expo(g).power).toBe(true);

    expect(walkTo(g, 'voxxy', { x: rack.x, y: rack.y - 24 })).toBe(true);
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

    // Now the router: Biggy opens the cabinet, Voxxy types the password.
    expect(openCabinet(g)).toBe(true);
    expect(expo(g).printerOnline, 'an open cabinet alone brought the printer up').toBe(false);
    g.debug.select('voxxy');
    g.debug.place('voxxy', HUB.x, HUB.y + 20);
    g.key('KeyE');
    typeAt(g, 'DEVOXXFOREVER');
    expect(expo(g).router.online).toBe(true);
    expect(expo(g).printerOnline).toBe(true);
    expect(g.snapshot().props.find((p) => p.kind === 'printer')?.state).toBe('done');
    expect(g.snapshot().progress).toContain('router ✓');
  });

  it('runs chapter 2 end to end — breakers, cable, router and the roller door', { timeout: 30000 }, () => {
    const g = mk(2);
    const panel = { x: GF.panel.x + 13, y: GF.panel.y + 8 };
    const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
    const printer = { x: GF.printer.x + 10, y: GF.printer.y + 6 };

    // 1. the router cabinet and its terminal, everyone still in the technical room.
    //    Played the long way round on purpose — Biggy's shoulder, then Droid up on
    //    Biggy for the label, then Droid typing it in — so the end-to-end run
    //    exercises the route with the most moving parts rather than the shortest.
    expect(openCabinet(g)).toBe(true);
    g.debug.place('biggy', 300, 640);
    g.debug.place('droid', 284, 640);
    g.debug.select('droid');
    g.key('KeyE');
    expect(bot(g, 'droid').mounted).toBe(true);
    g.debug.place('biggy', HUB.x, HUB.y + 20);
    steps_(g, 1);
    g.key('KeyE');
    expect(expo(g).router.known).toBe(true);
    // Down off Biggy, and he works the terminal himself.
    g.key('KeyE');
    expect(bot(g, 'droid').mounted).toBe(false);
    g.debug.select('droid');
    g.debug.place('droid', HUB.x, HUB.y + 20);
    g.key('KeyE');
    expect(expo(g).router.online).toBe(true);

    // 2. the breakers
    g.debug.select('droid');
    g.debug.place('droid', panel.x + 20, panel.y + 30);
    for (let i = 0; i < 3; i++) g.key('KeyE');
    expect(expo(g).power).toBe(true);

    // 3. the cable
    expect(walkTo(g, 'voxxy', { x: rack.x, y: rack.y - 24 })).toBe(true);
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

/* --------------------------------------------------- the chapter-3 beer delivery
 *
 * `docs/gameplay-additions.md` §3, and Michele's own kill condition for it: the
 * drop has to be comedy rather than punishment, which in a test means the crates
 * land where he dropped them and cost a few seconds, not a walk back across the
 * hall. Everything these helpers read is public — the snapshot and
 * `BreakfastState` — never the chapter's internals.
 */

const breakfastOf = (g: DebugGame): BreakfastState => g.debug.chapter() as BreakfastState;

/** Where the sim says the stack goes. Read off the prop, not typed in twice. */
function beerStack(g: DebugGame): Vec2 {
  const p = g.snapshot().props.find((o) => o.kind === 'dropzone' && (o.label ?? '').includes('beer'));
  if (!p) throw new Error('chapter 3 has no beer stack zone');
  return { x: p.x + (p.w ?? 0) / 2, y: p.y + (p.h ?? 0) / 2 };
}

/** Biggy walks onto the nearest crate still on the floor and picks it up. */
function liftCrate(g: DebugGame): void {
  const c = breakfastOf(g).beer.loose[0];
  if (!c) throw new Error('no crate left on the floor');
  g.debug.select('biggy');
  g.debug.place('biggy', c.x, c.y + 12);
  g.key('KeyE');
}

/** ...and puts whatever he is carrying down on the stack. */
function putCratesDown(g: DebugGame): void {
  const at = beerStack(g);
  g.debug.select('biggy');
  g.debug.place('biggy', at.x, at.y);
  g.key('KeyE');
}

/** The whole delivery, the way a player who has learned the limit does it. */
function clearTheDelivery(g: DebugGame): void {
  while (breakfastOf(g).beer.stacked < CRATE_DELIVERY) {
    const room = Math.min(CRATE_STACK_LIMIT - 1, breakfastOf(g).beer.loose.length);
    for (let i = 0; i < room; i++) liftCrate(g);
    putCratesDown(g);
  }
}

/** Seconds for Biggy to cover `d` px from a standing start, on a clear straight. */
function biggyRun(g: DebugGame, from: Vec2, d: number): number {
  g.debug.select('biggy');
  g.debug.place('biggy', from.x, from.y);
  g.setStick(1, 0);
  let t = 0;
  for (let i = 0; i < 2000; i++) {
    g.update(DT_MAX);
    t += DT_MAX;
    if (bot(g, 'biggy').x - from.x >= d) break;
  }
  g.setStick(0, 0);
  return t;
}

/** A clear 200 px straight in the north aisle, clear of the pallet and the columns. */
const RUN_FROM: Vec2 = { x: 430, y: 120 };
const RUN_LEN = 200;

/* ================================================================ chapter 3 */

describe('chapter 3 — breakfast', () => {
  it('runs the soup chain and only opens the gate once the soup, the speaker AND the beer are done', () => {
    const g = mk(3);
    const breakfast = (): BreakfastState => g.debug.chapter() as BreakfastState;
    const gateWall = (): Wall | undefined => g.debug.walls().find((w) => w.kind === 'gate');
    expect(gateWall()).toBeDefined();

    // Voxxy clears a catering queue.
    g.debug.select('voxxy');
    g.debug.place('voxxy', 110, 260);
    g.key('KeyE');
    expect(breakfast().queues[0].open).toBeGreaterThan(0);

    // The pot needs the ladle first, and the ladle needs Droid's reach.
    g.debug.select('biggy');
    g.debug.place('biggy', 105, 180);
    g.key('KeyE');
    expect(breakfast().carrying).toBe(false);

    g.debug.select('droid');
    g.debug.place('droid', 176, 150);
    g.key('KeyE');
    expect(breakfast().ladle).toBe(true);

    g.debug.select('biggy');
    g.key('KeyE');
    expect(breakfast().carrying).toBe(true);

    // Hitting something at speed spills it.
    g.setStick(1, 0);
    steps(g, 70 * TRAVEL_TIME_SCALE);
    g.setStick(0, 0);
    steps(g, 10);
    expect(breakfast().soup).toBeLessThan(100);
    expect(breakfast().soup).toBeGreaterThan(0);

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
    expect(breakfast().delivered).toBe(true);
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
    const booth = GF.booths.find((b) => b.name === breakfast().speaker.booth);
    expect(booth).toBeDefined();
    expect(booth?.table).toBe(false);
    const sx = hiding ? hiding.x : booth!.x + booth!.w / 2;
    const sy = hiding ? hiding.y : booth!.y + booth!.h + 14;

    g.debug.select('voxxy');
    g.debug.place('voxxy', sx, sy + 24);
    steps(g, 1);
    g.key('KeyE');
    expect(breakfast().speaker.following).toBe(true);

    expect(walkTo(g, 'voxxy', dropAt)).toBe(true);
    expect(until(g, () => breakfast().speaker.onStage, 900)).toBe(true);

    // Soup and speaker are BOTH in, and the stairs stay shut: the beer delivery
    // is Stephan's third condition, not decoration (`gameplay-additions.md` §3).
    expect(breakfast().beer.done).toBe(false);
    expect(breakfast().gateOpen).toBe(false);
    expect(gateWall()).toBeDefined();

    // Six crates, four at a time, two trips.
    clearTheDelivery(g);
    expect(breakfast().beer.stacked).toBe(CRATE_DELIVERY);
    expect(breakfast().beer.done).toBe(true);
    expect(breakfast().beer.oom).toBe(0);
    steps(g, 2);

    // All three delivered: the gate goes up and the cutscene runs.
    expect(breakfast().gateOpen).toBe(true);
    expect(gateWall()).toBeUndefined();
    expect(g.snapshot().phase).toBe('cut');
    expect(until(g, () => g.snapshot().chapter === 4, 600)).toBe(true);
    expect(g.snapshot().floor).toBe('up');
  });

  /**
   * THE TRADE THE BEAT IS BUILT ON: more crates per trip, worse handling.
   *
   * Both halves are already in the physics — `accel` is what `stepBot` approaches
   * the stick with, `mass` is what `botsCollide` splits a contact by — so the beat
   * adds no model. What it must never do is disturb the frozen identity: `DEFS` is
   * deep-frozen, the load is a modifier recomputed from it every time, and putting
   * the crates down has to give the numbers back EXACTLY, not nearly.
   */
  it('makes a loaded Biggy measurably worse to drive, and gives back his frozen numbers exactly', () => {
    const g = mk(3);
    const bg = bot(g, 'biggy');
    expect(bg.mass).toBe(DEFS.biggy.mass);
    expect(bg.accel).toBe(DEFS.biggy.accel);
    const empty = biggyRun(g, RUN_FROM, RUN_LEN);

    const safe = CRATE_STACK_LIMIT - 1;
    for (let i = 0; i < safe; i++) liftCrate(g);
    expect(breakfastOf(g).beer.carried).toBe(safe);
    expect(breakfastOf(g).beer.oom).toBe(0);

    expect(bg.mass).toBeCloseTo(crateLoadMass(safe), 10);
    expect(bg.accel).toBeCloseTo(crateLoadAccel(safe), 10);
    expect(bg.mass).toBeGreaterThan(DEFS.biggy.mass * 1.5);
    expect(bg.accel).toBeLessThan(DEFS.biggy.accel * 0.5);
    // Only mass and acceleration are in the trade. A loaded Biggy still gets to
    // the same top speed and still coasts the same way — the relationships those
    // two numbers hold up elsewhere (the roller door sandwich) are untouched.
    expect(bg.max).toBe(DEFS.biggy.max);
    expect(bg.drag).toBe(DEFS.biggy.drag);
    expect(bg.r).toBe(DEFS.biggy.r);

    const loaded = biggyRun(g, RUN_FROM, RUN_LEN);
    expect(loaded, `${RUN_LEN} px empty ${empty.toFixed(2)}s vs loaded ${loaded.toFixed(2)}s`).toBeGreaterThan(
      empty * 1.15,
    );

    // The HUD has been saying so the whole time: the count, the limit and the
    // penalty are on the progress line, or the punchline arrives unannounced.
    const line = g.snapshot().progress;
    expect(line).toContain(`heap ${safe}/${CRATE_STACK_LIMIT}`);
    expect(line).toMatch(/mass/);
    expect(line).toMatch(/accel/);

    putCratesDown(g);
    expect(breakfastOf(g).beer.carried).toBe(0);
    expect(breakfastOf(g).beer.stacked).toBe(safe);
    expect(bg.mass).toBe(DEFS.biggy.mass);
    expect(bg.accel).toBe(DEFS.biggy.accel);
  });

  /**
   * THE JOKE, AND WHAT IT COSTS.
   *
   * The crate past the limit throws, he drops everything, and the load becomes
   * bodies again — at his feet, not across the hall. The design's kill condition
   * is that the restart reads as comedy rather than punishment, so the distances
   * here are the test of it: every dropped crate is still within a couple of
   * body-widths of him and can be picked straight back up.
   */
  it('throws an OutOfMemoryError on the crate past the limit and drops the lot as real bodies', () => {
    const g = mk(3);
    const bg = bot(g, 'biggy');
    for (let i = 0; i < CRATE_STACK_LIMIT; i++) liftCrate(g);

    const st = breakfastOf(g).beer;
    expect(st.oom).toBe(1);
    expect(st.carried).toBe(0);
    expect(st.loose).toHaveLength(CRATE_DELIVERY);
    expect(st.stacked).toBe(0);
    // He is himself again the instant he lets go.
    expect(bg.mass).toBe(DEFS.biggy.mass);
    expect(bg.accel).toBe(DEFS.biggy.accel);
    // And it goes on the record, for the final card.
    expect(g.snapshot().score.oom).toBe(1);

    // Let the scatter settle, then check where it landed: his own mess, at his
    // own feet. Anything further than this is a walk, and a walk is a penalty.
    steps(g, 90);
    const after = breakfastOf(g).beer.loose;
    const dropped = after.filter((c) => Math.hypot(c.x - bg.x, c.y - bg.y) < 60);
    expect(dropped.length).toBeGreaterThanOrEqual(CRATE_STACK_LIMIT);

    // They are bodies, not decals: he can shove one out of his way.
    const near = after
      .map((c) => ({ c, d: Math.hypot(c.x - bg.x, c.y - bg.y) }))
      .sort((a, b) => a.d - b.d)[0].c;
    const before = { x: near.x, y: near.y };
    g.debug.select('biggy');
    g.debug.place('biggy', before.x - 20, before.y);
    g.setStick(1, 0);
    steps(g, 30);
    g.setStick(0, 0);
    const moved = breakfastOf(g).beer.loose.find((c) => c.i === near.i);
    expect(moved).toBeDefined();
    expect(Math.hypot(moved!.x - before.x, moved!.y - before.y)).toBeGreaterThan(5);

    // And picking them back up is the whole recovery: four more presses of E.
    for (let i = 0; i < CRATE_STACK_LIMIT - 1; i++) liftCrate(g);
    expect(breakfastOf(g).beer.carried).toBe(CRATE_STACK_LIMIT - 1);
    expect(breakfastOf(g).beer.oom).toBe(1);
  });

  it('lets only Biggy lift a crate, and the other two say why in their own voice', () => {
    const g = mk(3);
    const c = breakfastOf(g).beer.loose[0];
    for (const kind of ['voxxy', 'droid'] as const) {
      g.debug.select(kind);
      g.debug.place(kind, c.x, c.y + 10);
      steps(g, 1);
      g.key('KeyE');
      expect(breakfastOf(g).beer.carried).toBe(0);
      expect(breakfastOf(g).beer.loose).toHaveLength(CRATE_DELIVERY);
      const said = g.snapshot().toast?.t ?? '';
      expect(said, `${kind} said "${said}"`).toMatch(kind === 'voxxy' ? /^Voxxy:/ : /^Droid:/);
    }
    // ...and Biggy, from the same spot, simply picks it up.
    g.debug.select('biggy');
    g.debug.place('biggy', c.x, c.y + 10);
    g.key('KeyE');
    expect(breakfastOf(g).beer.carried).toBe(1);
  });

  /**
   * A load is not an identity, and it must not be able to leave the chapter that
   * granted it: `startChapter` restores every robot from `DEFS` (`game.ts`). Skip
   * out mid-carry, or press `R`, and chapter 4 gets the frozen Biggy.
   */
  it('never lets the crate load leak out of the chapter', () => {
    for (const escape of ['skip', 'restart'] as const) {
      const g = mk(3);
      const bg = bot(g, 'biggy');
      for (let i = 0; i < CRATE_STACK_LIMIT - 1; i++) liftCrate(g);
      expect(bg.mass).toBeGreaterThan(DEFS.biggy.mass);
      if (escape === 'skip') g.skipChapter();
      else g.key('KeyR');
      expect(g.snapshot().chapter).toBe(escape === 'skip' ? 4 : 1);
      expect(bg.mass, escape).toBe(DEFS.biggy.mass);
      expect(bg.accel, escape).toBe(DEFS.biggy.accel);
    }
  });

  it('puts thirty-six visitors on the lane grid, with Stephan at the foot of the stairs', () => {
    const g = mk(3);
    steps(g, 1400);
    const breakfast = g.debug.chapter() as BreakfastState;
    expect(breakfast.crowd).toBe(36);
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
    for (let i = 0; i < 1400 * TRAVEL_TIME_SCALE; i++) {
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
    // 5,600 simulated frames of a 36-body crowd is a wall-clock budget, not a
    // behaviour: it runs in a couple of seconds on a laptop and takes six in a
    // container, and vitest's default 5 s cut it off there long before anything
    // in this file was about beer crates.
  }, 30000);

  /* ----------------------------------------------------- the booth games
   *
   * Moved out of chapter 2 on Michele's call, 24 Sep 2026: *"Minigames should be
   * in chapter 3 — the hall is still closed at the moment."* The choreography is
   * the one the chapter-2 block used to run, plus the two games it never covered.
   */

  it('gives Droid the top-shelf sticker at the open booth, and nobody else', () => {
    const g = mk(3);
    const sticker = g.snapshot().props.find((p) => p.kind === 'sticker');
    expect(sticker).toBeDefined();

    for (const kind of ['voxxy', 'biggy'] as const) {
      g.debug.select(kind);
      g.debug.place(kind, sticker!.x, sticker!.y + 20);
      g.key('KeyE');
      expect(g.snapshot().swag, `${kind} took the sticker`).toHaveLength(0);
    }

    g.debug.select('droid');
    g.debug.place('droid', sticker!.x, sticker!.y + 20);
    g.key('KeyE');
    expect(g.snapshot().swag).toContain('sticker');
    expect(g.snapshot().progress).toContain('swag 1/3');
  });

  it('pays out the duck shuffleboard when the duck stops in the circle', () => {
    const g = mk(3);
    const target = g.snapshot().props.find((p) => p.kind === 'duck-target');
    expect(target).toBeDefined();
    const mgs = (): BreakfastState['minigames'] => (g.debug.chapter() as BreakfastState).minigames;
    // The debug seam moved with the game: chapter 3 owns the duck now.
    expect(g.debug.placeProp('duck', mgs().duck.x, mgs().duck.y)).toBe(true);

    /*
     * Shuffleboard, played properly: line up behind the duck, shove, let go, let it
     * coast, look at where it stopped, go again. It is never placed on the circle —
     * `duckDone` wants the duck under 5 px/s *inside* the ring, so a shove that is
     * too hard runs it out the far side and the next one has to come back.
     */
    g.debug.select('voxxy');
    for (let shot = 0; shot < 40 && !g.snapshot().swag.includes('duck'); shot++) {
      const d = mgs().duck;
      const dx = target!.x - d.x;
      const dy = target!.y - d.y;
      const len = Math.hypot(dx, dy) || 1;
      g.debug.place('voxxy', d.x - (dx / len) * 22, d.y - (dy / len) * 22);
      g.setStick(Math.abs(dx) > 3 ? Math.sign(dx) : 0, Math.abs(dy) > 3 ? Math.sign(dy) : 0);
      steps(g, Math.max(3, Math.min(22, Math.round(len / 4))));
      g.setStick(0, 0);
      steps(g, 120);
    }

    expect(mgs().duckDone).toBe(true);
    expect(g.snapshot().swag).toContain('duck');
    expect(Math.hypot(mgs().duck.x - target!.x, mgs().duck.y - target!.y)).toBeLessThan((target!.w ?? 0) / 2);
  });

  it('gives Voxxy the Regex Racing lap when she takes all four markers in time', () => {
    const g = mk(3);
    const markers = g.snapshot().props.filter((p) => p.kind === 'race-marker');
    expect(markers).toHaveLength(4);
    const race = (): BreakfastState['minigames'] => (g.debug.chapter() as BreakfastState).minigames;

    // Touch each marker in order. Teleporting between them is the pilot doing in
    // one frame what a fast Voxxy does in four seconds — what is under test is
    // the lap's order and its clock, and both are read from the sim.
    g.debug.select('voxxy');
    for (const mk_ of markers) {
      g.debug.place('voxxy', mk_.x, mk_.y);
      steps(g, 1);
    }
    expect(race().raceDone).toBe(true);
    expect(g.snapshot().swag).toContain('race');

    // All three, on one card.
    expect(g.snapshot().progress).toContain('swag 1/3');
  });

  /**
   * The swag counter and the half-point-per-swag on the final card are `game.ts`'s,
   * not a chapter's, so moving the games between chapters must not touch them. This
   * is the one assertion that says so out loud: a swag id earned HERE is still on the
   * end card three chapters later, and it is still worth its half point.
   */
  it('carries swag won in chapter 3 through to the final card', () => {
    const plain = createGame({ seed: SEED, chapter: 3, cards: false });
    for (let i = 0; i < 2; i++) plain.skipChapter();
    const bare = /(\d)\/9/.exec(plain.snapshot().card ?? '');
    expect(plain.snapshot().card).toContain('Swag 0/3');

    const g = mk(3);
    const sticker = g.snapshot().props.find((p) => p.kind === 'sticker');
    g.debug.select('droid');
    g.debug.place('droid', sticker!.x, sticker!.y + 20);
    g.key('KeyE');
    expect(g.snapshot().swag).toContain('sticker');

    for (let i = 0; i < 2; i++) g.skipChapter();
    expect(g.snapshot().phase).toBe('done');
    expect(g.snapshot().card).toContain('Swag 1/3');
    // Half a point each, so one swag is worth either nothing or one whole point
    // once the total is rounded — never less than the run without it.
    const withSwag = /(\d)\/9/.exec(g.snapshot().card ?? '');
    expect(Number(withSwag![1])).toBeGreaterThanOrEqual(Number(bare![1]));
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
    steps(g, 40 * TRAVEL_TIME_SCALE);
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
    // Against his flank. The two radii are 0.72 m and 0.50 m, so they touch at
    // 15.25 px; 16 px leaves Droid 6 cm off Biggy's side. It used to be 322, which
    // the old generous radii plus 12 px of mount slack counted as "next to him"
    // from half a metre of clear floor away.
    g.debug.place('droid', 316, 350);
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
