/**
 * Chapter 2 — EXPO. The exhibition hall before opening: dark, empty, no network,
 * and three thousand badges locked in the pickup store.
 *
 * Ported from the prototype's `setupExpo` / `expoKey` / `expoUpdate` and its
 * `setupMinigames` block (`reference/poc/10-after-dark-kinepolis.html`). Three jobs,
 * one per robot, each of which only that robot can do:
 *
 *   Droid — three breakers on a panel too high for anybody else.
 *   Voxxy — the network cable from the rack to the badge printer. The reel is
 *           `CABLE_MAX` long and the straight diagonal *under the sponsor tables*
 *           is the only route that fits; going round the booth lane runs out.
 *   Biggy — the store's roller door, which needs `ROLLER_DOOR_SPEED`. That is above
 *           his own top speed on purpose: alone he bounces off it announcing his
 *           own limit, and Voxxy has to shove him the length of the top lane.
 */

import { CABLE_MAX, PUSH_LEAN_MIN, ROLLER_DOOR_SPEED, T } from '../constants';
import { GF, VIEW_GROUND, groundWalls } from '../geometry';
import { botsCollide, dist, inRect, mkBot, speed, stepBot } from '../bot';
import { buildLights } from '../lights';
import type { Bot, LightSource, Mirror, Prop, Vec2, Wall } from '../types';
import type { ChapterCtx, ChapterDef, ChapterRuntime } from './index';

/* ---------------------------------------------------------------- reach distances */

const PANEL_REACH = 52;
const PLUG_REACH = 40;
/** A new cable point is only recorded once Voxxy has actually gone somewhere. */
const CABLE_STEP = 6;
/** Below this, "Biggy: 40 px/s, needs 270" would fire on every nudge. */
const ROLLER_MIN_TALK = 40;
/** Seconds between the roller door's "not fast enough" readouts. */
const ROLLER_TALK_COOLDOWN = 3;
const BREAKERS = 3;

/** The exhibition hall has no cinema screen to bounce a lamp off. */
const NO_MIRRORS: Mirror[] = [];
const NO_MIRROR_LIGHTS: LightSource[] = [];

/**
 * A pushable body that is not a robot: the shuffleboard duck here, the cake crate in
 * chapter 4. It borrows `Bot` only so it can reuse `stepBot` and `botsCollide`.
 *
 * `kind` is 'droid' and never read as an identity — the prototype gave these bodies
 * their own kinds ('duck', 'crate'), and the single place `stepBot` looks at `kind`
 * is the wall restitution, where anything that is not Biggy gets `REST_WALL_OTHER`.
 * 'droid' reproduces that exactly. They are never added to `ctx.bots`, so no lamp,
 * no mount and no player input ever reaches them.
 */
export function mkBody(name: string, x: number, y: number, over: Partial<Bot>): Bot {
  const b = mkBot('droid', x, y);
  b.name = name;
  b.tall = false;
  b.light = { c: [0, 0, 0], type: 'pool', range: 1 };
  return Object.assign(b, over);
}

/* ================================================================== minigames */

export interface MinigameState {
  duck: Vec2;
  duckDone: boolean;
  stickerDone: boolean;
  raceDone: boolean;
  /** Which of the four Regex Racing markers is next, 0 when the lap has not started. */
  raceNext: number;
}

/**
 * The three optional booth games. Worth 0.5 points each on the final card and
 * nothing else — they exist so the hall rewards wandering, which is the only reason
 * a player looks at twelve sponsor booths at all.
 */
export interface Minigames {
  /** Returns true when the key was consumed, so the chapter does not also act on it. */
  key(code: string, b: Bot): boolean;
  update(dt: number): void;
  props(): Prop[];
  /** Debug/test seam: move the duck. */
  place(kind: string, x: number, y: number): boolean;
  state(): MinigameState;
}

export function setupMinigames(ctx: ChapterCtx): Minigames {
  const booth = (name: string): { x: number; y: number; w: number; h: number } => {
    const b = GF.booths.find((o) => o.name === name);
    if (!b) throw new Error(`no booth ${name}`);
    return b;
  };

  // Shuffleboard: shove the duck so it comes to rest inside the circle.
  const duckB = booth('Rubber Duck Inc');
  const duck = mkBody('duck', duckB.x + duckB.w + 30, duckB.y + 35, {
    r: 8,
    mass: 0.6,
    accel: 0,
    max: 500,
    drag: 1.1,
  });
  const duckTarget = { x: duckB.x + duckB.w + 30, y: duckB.y + 35 + 95, r: 22 };
  // Swag already won in an earlier chapter stays won: the prototype kept one
  // minigame object for the whole run, we rebuild it per chapter.
  let duckDone = ctx.swag.includes('duck');

  const stB = booth('Sticker Mine');
  const sticker = { x: stB.x + stB.w / 2, y: stB.y + stB.h + 14 };
  let stickerDone = ctx.swag.includes('sticker');

  const rxB = booth('Regex Racing');
  const racePts: Vec2[] = [
    { x: rxB.x - 24, y: rxB.y - 16 },
    { x: rxB.x + rxB.w + 24, y: rxB.y - 16 },
    { x: rxB.x + rxB.w + 24, y: rxB.y + rxB.h + 16 },
    { x: rxB.x - 24, y: rxB.y + rxB.h + 16 },
  ];
  const RACE_LIMIT = 5;
  let raceNext = 0;
  let raceT0 = 0;
  let raceDone = ctx.swag.includes('race');

  function key(code: string, b: Bot): boolean {
    if (code !== 'KeyE') return false;
    if (!stickerDone && dist(b, sticker) < 40) {
      if (b.kind === 'droid') {
        stickerDone = true;
        ctx.addSwag('sticker', 'Droid peels the top-shelf holographic sticker. Swag +1');
      } else {
        ctx.flash(`${b.name}: the good stickers are on the top shelf. Droid?`);
      }
      return true;
    }
    return false;
  }

  function update(dt: number): void {
    stepBot(duck, dt, ctx.walls);
    for (const b of ctx.bots) {
      if (b.mounted) continue;
      const dx = duck.x - b.x;
      const dy = duck.y - b.y;
      const dd = Math.hypot(dx, dy);
      if (dd <= 0 || dd >= b.r + duck.r + 4) continue;
      const nx = dx / dd;
      const ny = dy / dd;
      const lean = b.ix * nx + b.iy * ny;
      // A shove, not a carry: the duck only takes a kick while it is still slow.
      if (lean > PUSH_LEAN_MIN && speed(duck) < 40) {
        const F = b.kind === 'biggy' ? 900 : 350;
        duck.vx += nx * lean * F * dt;
        duck.vy += ny * lean * F * dt;
      }
      botsCollide(b, duck);
    }
    if (!duckDone && speed(duck) < 5 && dist(duck, duckTarget) < duckTarget.r) {
      duckDone = true;
      ctx.addSwag('duck', 'The duck stops in the circle. Rubber Duck Inc hands over a giant duck. Swag +1');
    }

    if (raceDone) return;
    const v = ctx.byKind('voxxy');
    const p = racePts[raceNext];
    if (dist(v, p) < 16) {
      if (raceNext === 0) raceT0 = ctx.t;
      raceNext++;
      if (raceNext === 4) {
        const el = ctx.t - raceT0;
        if (el <= RACE_LIMIT) {
          raceDone = true;
          ctx.addSwag('race', `Regex Racing lap in ${el.toFixed(1)}s — under ${RACE_LIMIT}s. Swag +1`);
        } else {
          ctx.flash(`Regex Racing lap in ${el.toFixed(1)}s — too slow, again`);
          raceNext = 0;
        }
      }
    }
    if (raceNext > 0 && ctx.t - raceT0 > RACE_LIMIT) {
      raceNext = 0;
      ctx.flash("Regex Racing: time's up, lap reset");
    }
  }

  function props(): Prop[] {
    const out: Prop[] = [
      { kind: 'duck', x: duck.x, y: duck.y, w: duck.r * 2, h: duck.r * 2, state: duckDone ? 'done' : 'idle' },
      {
        kind: 'duck-target',
        x: duckTarget.x,
        y: duckTarget.y,
        w: duckTarget.r * 2,
        h: duckTarget.r * 2,
        state: duckDone ? 'done' : 'idle',
        label: 'duck shuffleboard',
      },
      {
        kind: 'sticker',
        x: sticker.x,
        y: sticker.y,
        w: 12,
        h: 8,
        state: stickerDone ? 'done' : 'idle',
        label: stickerDone ? 'sticker ✓' : 'top-shelf sticker (E)',
      },
    ];
    racePts.forEach((p, i) => {
      out.push({
        kind: 'race-marker',
        x: p.x,
        y: p.y,
        w: 12,
        h: 12,
        v: i + 1,
        state: raceDone ? 'done' : i === raceNext ? 'active' : 'idle',
        label: raceDone ? 'lap ✓' : `Voxxy lap 1→4 under ${RACE_LIMIT}s`,
      });
    });
    return out;
  }

  return {
    key,
    update,
    props,
    place(kind: string, x: number, y: number): boolean {
      if (kind !== 'duck') return false;
      duck.x = x;
      duck.y = y;
      duck.vx = 0;
      duck.vy = 0;
      return true;
    },
    state: () => ({ duck: { x: duck.x, y: duck.y }, duckDone, stickerDone, raceDone, raceNext }),
  };
}

/* ==================================================================== chapter */

export interface ExpoState {
  chapter: 2;
  power: boolean;
  breakersLeft: number;
  cable: { carrying: boolean; connected: boolean; len: number; snapped: boolean };
  rollerBroken: boolean;
  minigames: MinigameState;
}

const OBJECTIVE =
  'Chapter 2 · <b>Expo</b>. The exhibition hall before opening: dark, empty, registration in an hour. ' +
  '<b>Droid</b> flips the three breakers on the high panel in the technical room (E). ' +
  '<b>Voxxy</b> runs the network cable from the rack to the printer at reception — it is short: ' +
  'straight line, <b>under the sponsor tables</b>. <b>Biggy</b> smashes the roller door of the badge ' +
  'store — above his own top speed, so <b>Voxxy pushes him</b> down the long top lane. ' +
  'Booth games on the way are optional swag.';
const KEYS = '1/2/3/Tab: switch · WASD · E: use · R: restart';

function setup(ctx: ChapterCtx): ChapterRuntime {
  ctx.setFloor('down');
  ctx.setView(VIEW_GROUND);
  ctx.setWalls(groundWalls());
  ctx.place([372, 440], [372, 470], [372, 502]);

  let power = false;
  /**
   * The hall is pitch dark until Droid throws the last breaker, so until then the
   * robots' own lamps are the only light there is — the prototype punches a hole in
   * an 80%-black mask around each of them (`expoDraw`). The 3D renderer works from
   * `LightSource` polygons instead of a 2D mask, so the chapter has to cast them:
   * without this the exhibition hall renders as a black rectangle. Chapter 2 has no
   * light-mix enigma, so nothing in here ever *reads* them — they exist to be drawn.
   */
  let lights: LightSource[] = [];
  let breakersLeft = BREAKERS;
  let rollerBroken = false;
  let hintedPanel = false;
  let rollerTalk = -9;

  const cable = {
    carrying: false,
    connected: false,
    len: 0,
    snapped: false,
    pts: [] as Vec2[],
  };

  const gate: Wall = {
    ...GF.gate,
    kind: 'gate',
    why: (b) =>
      b.kind === 'voxxy'
        ? 'Voxxy: gate! Main staircase, shut until registration opens. Not even I fit through that'
        : b.kind === 'droid'
          ? 'Droid: the main staircase gate. It stays down until registration opens. Tomorrow, not tonight'
          : 'Biggy: gate. Steel. Down. Registration opens it, not me',
  };
  ctx.walls.push(gate);

  const roller: Wall = {
    ...GF.roller,
    kind: 'roller',
    why: (b) =>
      b.kind === 'biggy'
        ? `Biggy: roller door. I'd need ${ROLLER_DOOR_SPEED} px/s and I top out at ${b.max}. Unless someone pushes me all the way down that lane`
        : b.kind === 'voxxy'
          ? "Voxxy: roller door — every badge and polo is behind it. I bounce off. Biggy at full tilt isn't enough either, so I'll shove him down the whole top lane"
          : 'Droid: a slatted roller door. Mass, not leverage. Biggy needs a longer run than he can give himself',
    // Horizontal door: the speed that counts is the one along the lane.
    onHit: (b) => {
      if (b.kind !== 'biggy') return false;
      if (b.vx > ROLLER_DOOR_SPEED) {
        rollerBroken = true;
        ctx.removeWall(roller);
        ctx.flash(
          `CRASH — Biggy rolls through at ${Math.trunc(b.vx)} px/s. The Devoxx crew and 3,000 badges are free`,
          3500,
        );
        b.vx *= 0.4;
        return true;
      }
      if (b.vx > ROLLER_MIN_TALK && ctx.t - rollerTalk > ROLLER_TALK_COOLDOWN) {
        rollerTalk = ctx.t;
        ctx.flash(
          `Biggy: ${Math.trunc(b.vx)} px/s — needs ${ROLLER_DOOR_SPEED}. ` +
            (b.vx > b.max - 5 ? "That's my top speed. Somebody push me" : 'Longer run-up, straighter line'),
        );
      }
      return false;
    },
  };
  ctx.walls.push(roller);

  const printerAt: Vec2 = { x: GF.printer.x + 10, y: GF.printer.y + 6 };
  const rackAt: Vec2 = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
  const panelAt: Vec2 = { x: GF.panel.x + 13, y: GF.panel.y + 8 };

  const mg = setupMinigames(ctx);

  ctx.objective(OBJECTIVE, KEYS);
  ctx.card(
    '<b>Down the secondary staircase.</b><br>' +
      '<span class="sub">The exhibition hall: twelve sponsor booths, no power, no network, and the badges locked in the pickup store.</span>' +
      '<small>Press any key</small>',
  );

  /* --------------------------------------------------------------------- keys */

  function key(code: string): void {
    const b = ctx.bots[ctx.cur];
    ctx.switchKey(code);
    if (code !== 'KeyE') return;
    if (mg.key(code, b)) return;

    if (b.kind === 'droid') {
      if (!power && dist(b, panelAt) < PANEL_REACH) {
        breakersLeft--;
        if (breakersLeft <= 0) {
          power = true;
          ctx.flash('Droid flips the last breaker — the hall lights come on, booth by booth', 3500);
        } else {
          ctx.flash(`Droid flips a breaker (${BREAKERS - breakersLeft}/${BREAKERS})`);
        }
        return;
      }
      ctx.flash('Droid: nothing to reach here');
      return;
    }

    if (b.kind === 'voxxy') {
      if (!cable.carrying && !cable.connected && dist(b, rackAt) < PLUG_REACH) {
        cable.carrying = true;
        cable.snapped = false;
        cable.len = 0;
        cable.pts = [{ x: b.x, y: b.y }];
        ctx.flash("Voxxy takes the cable end. It's not long — straight to reception, under the tables");
        return;
      }
      if (cable.carrying && dist(b, printerAt) < PLUG_REACH) {
        cable.carrying = false;
        cable.connected = true;
        ctx.flash(`Cable in — badge printer online (${Math.trunc(cable.len)} of ${CABLE_MAX} px used)`, 3000);
        return;
      }
      if (cable.carrying) {
        ctx.flash('Voxxy: the printer is at reception, through the hall wall on the right');
        return;
      }
      ctx.flash('Voxxy: nothing to plug in here');
      return;
    }

    ctx.flash("Biggy: I don't do buttons. I do doors.");
  }

  /* ------------------------------------------------------------------- update */

  function update(dt: number): void {
    ctx.stepAll(dt);
    ctx.pushBiggy(dt);
    mg.update(dt);

    const v = ctx.byKind('voxxy');
    if (cable.carrying) {
      const last = cable.pts[cable.pts.length - 1];
      const d = dist(v, last);
      if (d > CABLE_STEP) {
        cable.len += d;
        cable.pts.push({ x: v.x, y: v.y });
      }
      if (cable.len > CABLE_MAX) {
        cable.carrying = false;
        cable.snapped = true;
        cable.len = 0;
        cable.pts = [];
        ctx.flash(
          "The cable's run out — that route was too long. It snaps back to the rack. Straight line, under the tables, Voxxy!",
          3500,
        );
      }
    }

    if (!power && !hintedPanel && (inRect(v, GF.tech) || inRect(ctx.byKind('biggy'), GF.tech))) {
      hintedPanel = true;
      ctx.flash('Breakers — way up on the wall. Droid?');
    }

    // Once the house lights are on the prototype stops masking, and so do we: the
    // renderer lights the hall from its own chapter mood instead.
    lights = power ? NO_MIRROR_LIGHTS : buildLights(ctx.bots, ctx.walls, NO_MIRRORS);

    if (power && cable.connected && rollerBroken) {
      ctx.score.expoT = Math.round(ctx.t);
      ctx.score.cable = Math.trunc(cable.len);
      ctx.startChapter(3);
    }
  }

  /* -------------------------------------------------------------------- props */

  function props(): Prop[] {
    const out: Prop[] = [
      {
        kind: 'breaker',
        ...GF.panel,
        v: BREAKERS - breakersLeft,
        state: power ? 'done' : 'idle',
        label: power ? 'power ON' : `breakers ${BREAKERS - breakersLeft}/${BREAKERS} (high)`,
      },
      { kind: 'rack', ...GF.rack, state: cable.carrying || cable.connected ? 'active' : 'idle', label: 'network rack' },
      {
        kind: 'printer',
        ...GF.printer,
        state: cable.connected ? 'done' : 'idle',
        label: cable.connected ? 'printer online' : 'badge printer (no network)',
      },
      {
        kind: 'cable',
        x: rackAt.x,
        y: rackAt.y,
        // While Voxxy is carrying, the head of the run is wherever Voxxy is, so the
        // drawn cable and the metered length agree to within one sample step.
        pts: cable.carrying ? [...cable.pts, { x: ctx.byKind('voxxy').x, y: ctx.byKind('voxxy').y }] : cable.pts,
        v: cable.len,
        state: cable.connected ? 'done' : cable.carrying ? 'active' : cable.snapped ? 'broken' : 'idle',
        label: 'cable reel',
      },
      {
        kind: 'roller',
        ...GF.roller,
        state: rollerBroken ? 'broken' : 'shut',
        label: 'roller door',
      },
      { kind: 'gate', ...GF.gate, state: 'shut', label: 'registration gate' },
      // The lane the prototype drew as a dashed hint: this is where Voxxy has to
      // shove Biggy from, and it is sim data so the renderer need not guess.
      { kind: 'lane', x: 370, y: 160, w: GF.roller.x - 4 - 370, h: T, state: rollerBroken ? 'done' : 'idle', label: 'run-up lane → (Voxxy pushes Biggy)' },
    ];
    return out.concat(mg.props());
  }

  // Cast once at setup so the very first drawn frame is already lit, rather than
  // one black frame before `update` runs.
  lights = buildLights(ctx.bots, ctx.walls, NO_MIRRORS);

  /** The live bottom-of-screen line: the three jobs, each with its own counter. */
  function progress(): string {
    const breakers = power ? 'power ✓' : `breakers ${BREAKERS - breakersLeft}/${BREAKERS}`;
    const net = cable.connected
      ? 'network ✓'
      : cable.snapped
        ? 'cable snapped — start again at the rack'
        : cable.carrying
          ? `cable ${Math.round(cable.len)}/${CABLE_MAX} px`
          : 'cable: still on the reel at the rack';
    const store = rollerBroken ? 'badge store ✓' : `roller door: shut (needs ${ROLLER_DOOR_SPEED} px/s)`;
    return `${breakers} · ${net} · ${store}`;
  }

  return {
    key,
    update,
    props,
    progress,
    lights: () => lights,
    placeProp: (kind: string, x: number, y: number): boolean => mg.place(kind, x, y),
    state: (): ExpoState => ({
      chapter: 2,
      power,
      breakersLeft,
      cable: { carrying: cable.carrying, connected: cable.connected, len: cable.len, snapped: cable.snapped },
      rollerBroken,
      minigames: mg.state(),
    }),
  };
}

export const ch2Expo: ChapterDef = { n: 2, title: '2 · Expo — the exhibition hall', setup };
