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
 *
 * ## The network closet (added after gauntlet round 2)
 *
 * `docs/gameplay-additions.md` §2. The badge printer needs POWER + CABLE + ROUTER,
 * and the router is behind a cam-lock wheel on the cabinet in the technical room.
 * The beat is deliberately the INVERSE of chapter 1's light mix: chapter 1 asks for
 * three things to be true *at the same time*, this asks for one thing to be true
 * *at the right moment*. All three robots are load-bearing and none of them by the
 * mechanic they already used upstairs:
 *
 *   Biggy — the only mass that breaks the cam free at all, and the only robot whose
 *           drag (0.35 s^-1, the lowest of the three) means he can never feather it.
 *   Droid — `braced` is finally the point of something: a planted Droid with a hand
 *           on the hub is the only brake in the building.
 *   Voxxy — a 0.38 rad cone against Biggy's 1.0: the only beam narrow enough to
 *           resolve a scribed index mark, so the target angle is literally unknown
 *           until Voxxy lights it.
 */

import { CABLE_MAX, PUSH_LEAN_MIN, ROLLER_DOOR_SPEED, SPEED_SCALE, T, TRAVEL_TIME_SCALE } from '../constants';
import { m } from '../units';
import { GF, VIEW_GROUND, groundWalls } from '../geometry';
import { botsCollide, dist, inRect, mkBot, speed, stepBot } from '../bot';
import { buildLights, litBy } from '../lights';
import type { Bot, Hit, LightSource, Mirror, Prop, Vec2, Wall } from '../types';
import type { ChapterCtx, ChapterDef, ChapterRuntime } from './index';

/* ---------------------------------------------------------------- reach distances */

const PANEL_REACH = 52;
const PLUG_REACH = 40;
/** A new cable point is only recorded once Voxxy has actually gone somewhere. */
const CABLE_STEP = 6;
/** Below this, "Biggy: 0.8 m/s, needs 5.4" would fire on every nudge. px/s. */
const ROLLER_MIN_TALK = 40 * SPEED_SCALE;
/** Seconds between the roller door's "not fast enough" readouts. */
const ROLLER_TALK_COOLDOWN = 3;
const BREAKERS = 3;

/* ---------------------------------------------------------------- the cam-lock wheel
 *
 * Chapter-local tuning. Nothing here is a NEW physics constant: `src/sim/constants.ts`
 * is frozen (CLAUDE.md) and this beat deliberately needs no entry in it — it is
 * built out of the frozen numbers that already exist (Biggy's mass 7 and drag 0.35,
 * Droid's `braced`/`BRACED_MASS`, Voxxy's 0.38 rad cone). Every number below is a
 * property of one prop in one room, so it lives with that prop.
 *
 * Two of them are speeds in disguise and therefore carry `SPEED_SCALE` from the
 * 2026-09-23 rescale: `WHEEL_MIN_INTO`, which is a px/s threshold, and `WHEEL_GAIN`,
 * which converts px/s into rad/s and so scales by its reciprocal. Everything else —
 * radians, rad/s, s^-1, px — is dimensionless across that rescale and is untouched.
 */

/** Rim radius, sim px. 16 px across is ~1.3 m — an industrial hand wheel, readable at diorama zoom. */
const WHEEL_R = 8;
/** Index marks scribed round the bezel. Eight of them, so the target is a 1-in-8 unknown. */
const WHEEL_MARKS = 8;
const WHEEL_STEP = (Math.PI * 2) / WHEEL_MARKS;
/**
 * The cam's sprung pawl rests in detents offset HALF a step from the index marks.
 *
 * This is the load-bearing line of the whole beat. A wheel nobody is holding always
 * walks itself into a detent, and a detent is by construction 22.5 deg from the
 * nearest mark — six times `WHEEL_TOL`. So a solo Biggy cannot park it on the mark
 * by luck, by patience or by feathering: not because a rule forbids it but because
 * the detent ball every valve wheel has ever had puts it back between two marks.
 * Stopping it ON a mark requires something that can hold it there. That is Droid.
 */
const PAWL_OFFSET = WHEEL_STEP / 2;
/** Above this the wheel rides straight over the detents; below it the ball drops in. rad/s. */
const PAWL_CATCH = 0.18;
/** The speed the ball rolls the wheel home at, rad/s. Under `PAWL_CATCH`, so it stays caught. */
const PAWL_CREEP = 0.12;
/** How fast the wheel is pulled onto the creep, s^-1. A catch, not a snap. */
const PAWL_EASE = 5;
/** Close enough to the detent, and slow enough, to seat the ball and stop dead. rad. */
const PAWL_SNAP = 0.03;
/**
 * The wheel's own bearing drag, s^-1. Lower than every robot's — including Biggy's
 * 0.35 — because a greased cam wheel is the one thing in this building that coasts
 * better than he does.
 *
 * It is not picked for feel, it is picked for a guarantee. Bracing is only a skill
 * if the mark actually comes past at a speed a player can react to, so the coast
 * from 1.0 rad/s down to `PAWL_CATCH` has to be at least one whole revolution:
 * (1.0 - 0.18) / 0.11 = 7.5 rad > 2 pi. Every heave therefore brings the mark past
 * Droid at least once below 1 rad/s, and the long tail under 0.4 rad/s widens the
 * brake's window to most of a second — demanding, never a lottery.
 */
const WHEEL_DRAG = 0.11;
/**
 * Angular velocity added per px/s of the speed Biggy carries INTO the cabinet face.
 *
 * This is the one number in the file that scales the OTHER way: it converts a speed
 * into a rad/s, so a rescale that divides speeds by four has to multiply it by four
 * for the same run-up to turn the wheel the same amount. The run-up the technical
 * room allows, across the full lever, still gives about 1.45 rad/s — a quarter-turn
 * a second, which is what a wheel this heavy should look like, and close to twenty
 * seconds of coast to spend on it before the pawl bites. Measured on a typical
 * run-up (x = 178, lever 0.81): 1.17 rad/s, settling after 18.9 s and 1.2 turns of
 * it below 1 rad/s.
 */
const WHEEL_GAIN = 0.013 / SPEED_SCALE;
/**
 * Below this speed into the face the cam does not break away at all — a heavy
 * industrial lock has static friction, and this is what stops the puzzle being
 * solved by nudging the wheel one degree at a time. The smallest heave that does
 * break it free already carries it past `PAWL_CATCH`, so the coarsest adjustment
 * available to Biggy alone is a whole detent.
 */
const WHEEL_MIN_INTO = 55 * SPEED_SCALE;
/**
 * Biggy has to catch a spoke, not the hub: torque is his speed into the face times
 * how far off the wheel's centre line he hit it, and dead centre only rattles. The
 * side he comes in on is the side it turns — the one bit of steering he gets.
 */
const WHEEL_DEAD_LEVER = 0.18;
/**
 * A braced Droid with a hand on the hub: angular damping, s^-1. The only brake in
 * the venue. It kills the coast in `vel / WHEEL_BRAKE` radians, so the player is
 * aiming the wheel's stopping distance at the mark, not the wheel.
 */
const WHEEL_BRAKE = 7;
/** How close Droid's centre has to be to the hub to get a hand on it, sim px. */
const WHEEL_REACH = 54;
/** The cam seats within this of the mark, rad (9.2 deg). Well inside `PAWL_OFFSET`'s 22.5. */
const WHEEL_TOL = 0.16;
/** ...and only once the wheel is this close to stopped, rad/s. */
const WHEEL_STOP = 0.05;
/**
 * ...and only if it STAYS there this long. A cam needs a moment to drop in, and
 * without the dwell the instant the pawl reverses a coasting wheel would count as a
 * stop — one frame of zero velocity that could land anywhere, which is exactly the
 * luck this beat is built to remove.
 */
const WHEEL_SEAT = 0.3;
/** Seconds between the wheel's readouts, so leaning on it is not sixty toasts a second. */
const WHEEL_TALK_COOLDOWN = 2;

const TAU = Math.PI * 2;
/** 0..2pi. */
const norm = (a: number): number => ((a % TAU) + TAU) % TAU;
/** Signed shortest way from `b` round to `a`, -pi..pi. */
function angDiff(a: number, b: number): number {
  const d = norm(a - b);
  return d > Math.PI ? d - TAU : d;
}
const deg = (a: number): number => Math.round((norm(a) * 180) / Math.PI);

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
    max: 500 * SPEED_SCALE,
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
  /**
   * The lap is a fixed length of floor, so the budget is a required speed wearing a
   * clock's clothes: it grows with `TRAVEL_TIME_SCALE` or the rescale would quietly
   * make the minigame impossible. 5 s of the prototype's Voxxy, 20 s of this one.
   */
  const RACE_LIMIT = 5 * TRAVEL_TIME_SCALE;
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
      if (lean > PUSH_LEAN_MIN && speed(duck) < 40 * SPEED_SCALE) {
        const F = (b.kind === 'biggy' ? 900 : 350) * SPEED_SCALE;
        duck.vx += nx * lean * F * dt;
        duck.vy += ny * lean * F * dt;
      }
      botsCollide(b, duck);
    }
    if (!duckDone && speed(duck) < 5 * SPEED_SCALE && dist(duck, duckTarget) < duckTarget.r) {
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
  /** The cam-lock wheel on the router cabinet. Angles in radians, `vel` in rad/s. */
  wheel: {
    ang: number;
    vel: number;
    /** The target index mark, fixed for the run, unknown until Voxxy lights it. */
    mark: number;
    /** Voxxy's cone is on the scribed mark this frame. */
    markLit: boolean;
    /** A braced Droid has a hand on the hub. */
    held: boolean;
    open: boolean;
  };
  /** Power AND cable AND router: all three, or the badge printer prints nothing. */
  printerOnline: boolean;
  minigames: MinigameState;
}

const OBJECTIVE =
  'Chapter 2 · <b>Expo</b>. The exhibition hall before opening: dark, empty, registration in an hour. ' +
  '<b>Droid</b> flips the three breakers on the high panel in the technical room (E). ' +
  '<b>Voxxy</b> runs the network cable from the rack to the printer at reception — it is short: ' +
  'straight line, <b>under the sponsor tables</b>. The printer also wants the <b>router</b>, and the ' +
  'router is behind a cam-lock wheel only <b>Biggy</b> can shift, only <b>Droid</b> can stop and only ' +
  '<b>Voxxy</b> can aim. <b>Biggy</b> also smashes the roller door of the badge ' +
  'store — above his own top speed, so <b>Voxxy pushes him</b> down the long top lane. ' +
  'Booth games on the way are optional swag.';
const KEYS = '1/2/3/Tab: switch · WASD · E: use / brace · R: restart';

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
        ? `Biggy: roller door. I'd need ${m(ROLLER_DOOR_SPEED).toFixed(1)} m/s and I top out at ${m(b.max).toFixed(1)}. Unless someone pushes me all the way down that lane`
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
          `CRASH — Biggy rolls through at ${m(b.vx).toFixed(1)} m/s. The Devoxx crew and 3,000 badges are free`,
          3500,
        );
        b.vx *= 0.4;
        return true;
      }
      if (b.vx > ROLLER_MIN_TALK && ctx.t - rollerTalk > ROLLER_TALK_COOLDOWN) {
        rollerTalk = ctx.t;
        ctx.flash(
          `Biggy: ${m(b.vx).toFixed(1)} m/s — needs ${m(ROLLER_DOOR_SPEED).toFixed(1)}. ` +
            (b.vx > b.max - 5 * SPEED_SCALE ? "That's my top speed. Somebody push me" : 'Longer run-up, straighter line'),
        );
      }
      return false;
    },
  };
  ctx.walls.push(roller);

  const printerAt: Vec2 = { x: GF.printer.x + 10, y: GF.printer.y + 6 };
  const rackAt: Vec2 = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
  const panelAt: Vec2 = { x: GF.panel.x + 13, y: GF.panel.y + 8 };

  /* ------------------------------------------------------------ the cam-lock wheel */

  /**
   * The hub, on the cabinet's south face — the face the diorama camera looks at.
   * Everything about the wheel is measured from here: Biggy's lever arm, Droid's
   * reach, and the point Voxxy's beam has to find.
   */
  const wheelAt: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };
  /** Half the face, which is the lever arm a full-width hit gets. */
  const WHEEL_LEVER = GF.cabinet.w / 2;

  const wheel = {
    /** Parked in detent 0, where a cam-lock wheel that nobody has touched sits. */
    ang: PAWL_OFFSET,
    vel: 0,
    /**
     * The target mark, drawn once per run from the eight scribed marks. Seeded, so a
     * run replays exactly (`game.ts`), and never on a detent by construction — the
     * marks are at k * WHEEL_STEP, the detents half a step off them.
     */
    mark: Math.floor(ctx.rng() * WHEEL_MARKS) * WHEEL_STEP,
    markLit: false,
    held: false,
    open: false,
    /** How long the cam has been sitting on the mark, seconds. */
    seat: 0,
  };
  let wheelTalk = -9;

  /**
   * Where the scribed mark actually is, for the light test.
   *
   * The wheel stands in a vertical plane, so only its horizontal extent exists in a
   * 2D sim: the mark is offset along the cabinet face by `R cos(mark)` and sits a
   * couple of pixels proud of it. That is enough for `litBy` to ask the one question
   * this beat needs — is Voxxy's cone on it — without inventing a new light test.
   */
  const markAt = (): Vec2 => ({ x: wheelAt.x + WHEEL_R * Math.cos(wheel.mark), y: wheelAt.y + 2 });

  const cabinet: Wall = {
    ...GF.cabinet,
    kind: 'cabinet',
    /**
     * The mass gate, routed through the wall's own `why` so the throttling and the
     * toast plumbing are the ones every other blocked message in the game uses.
     * Biggy gets no line here: his answer is the wheel moving, and it is spoken from
     * `onHit` with the number on it.
     */
    why: (b) =>
      b.kind === 'voxxy'
        ? "Voxxy: cam-lock wheel. I hit that at full tilt and it did not even rattle — one kilo of me against a cabinet lock. My beam's the narrow one, though: point me at the bezel and I'll read the mark"
        : b.kind === 'droid'
          ? 'Droid: three times Voxxy and still nothing. The cam wants a shove, not a lever. Holding it, on the other hand, I can do — that is what I am ballasted for'
          : null,
    onHit: (b: Bot, hit: Hit): boolean => {
      if (b.kind !== 'biggy' || wheel.open) return false;
      // The wheel is bolted to the SOUTH face; the sides and the top are cabinet.
      if (hit.ny < 0.5) return false;
      // The projection, exactly as the chapter-1 jammed door does it: the speed
      // INTO the face, not the speed Biggy happens to be carrying. A robot crossing
      // the technical room at full tilt must not spin it in passing.
      const into = -(b.vx * hit.nx + b.vy * hit.ny);
      if (into < WHEEL_MIN_INTO) {
        // 8 px/s of the prototype's scale: below a brush past the cabinet, he says nothing.
        if (into > 8 * SPEED_SCALE && ctx.t - wheelTalk > WHEEL_TALK_COOLDOWN) {
          wheelTalk = ctx.t;
          ctx.flash(`Biggy: ${m(into).toFixed(1)} m/s into it and the cam did not break. Needs ${m(WHEEL_MIN_INTO).toFixed(1)}. Back up and run at it`);
        }
        return false;
      }
      const lever = Math.max(-1, Math.min(1, (b.x - wheelAt.x) / WHEEL_LEVER));
      if (Math.abs(lever) < WHEEL_DEAD_LEVER) {
        if (ctx.t - wheelTalk > WHEEL_TALK_COOLDOWN) {
          wheelTalk = ctx.t;
          ctx.flash('Biggy: straight at the hub. All that does is rattle it — catch a spoke, left or right of centre');
        }
        return false;
      }
      wheel.vel += WHEEL_GAIN * into * lever;
      if (ctx.t - wheelTalk > WHEEL_TALK_COOLDOWN) {
        wheelTalk = ctx.t;
        ctx.flash(
          `Biggy heaves — ${m(into).toFixed(1)} m/s into the ${lever > 0 ? 'right' : 'left'} spokes. ` +
            'It turns. It does not stop. Somebody stop it',
        );
      }
      return false;
    },
  };
  ctx.walls.push(cabinet);

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

    const atWheel = !wheel.open && dist(b, wheelAt) < WHEEL_REACH;

    if (b.kind === 'droid') {
      const atPanel = !power && dist(b, panelAt) < PANEL_REACH;
      // The panel and the wheel share the technical room's back wall 89 px apart and
      // their reaches just overlap, so the nearer hand wins rather than whichever
      // check happens to be written first.
      if (atWheel && (!atPanel || dist(b, wheelAt) <= dist(b, panelAt))) {
        b.braced = !b.braced;
        if (b.braced) {
          b.vx = 0;
          b.vy = 0;
          b.ix = 0;
          b.iy = 0;
          ctx.flash(
            'Droid plants his feet and gets a hand on the hub. Nothing turns while I am holding it — ' +
              'E again to let go, and a short hold just bleeds the speed off',
            3200,
          );
        } else {
          ctx.flash('Droid lets go of the wheel');
        }
        return;
      }
      if (atPanel) {
        breakersLeft--;
        if (breakersLeft <= 0) {
          power = true;
          ctx.flash('Droid flips the last breaker — the hall lights come on, booth by booth', 3500);
        } else {
          ctx.flash(`Droid flips a breaker (${BREAKERS - breakersLeft}/${BREAKERS})`);
        }
        return;
      }
      // Braced is a stance, not a place: E anywhere lets him out of it again.
      if (b.braced) {
        b.braced = false;
        ctx.flash('Droid unplants');
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
        ctx.flash(
          `Cable in — the run is made (${Math.trunc(cable.len)} of ${CABLE_MAX} px used). ` +
            'Now it wants power and a router on the other end',
          3000,
        );
        return;
      }
      if (cable.carrying) {
        ctx.flash('Voxxy: the printer is at reception, through the hall wall on the right');
        return;
      }
      if (atWheel) {
        ctx.flash(
          wheel.markLit
            ? `Voxxy: got it — the mark is at ${deg(wheel.mark)}°. Hold me here and keep the beam on the bezel`
            : 'Voxxy: I cannot shift it, but I can read it. Face me at the bezel and the scribed mark comes up',
        );
        return;
      }
      ctx.flash('Voxxy: nothing to plug in here');
      return;
    }

    if (atWheel) {
      ctx.flash("Biggy: buttons no. Wheels, not with these hands. Running at things — that I can do. Give me the length of the room");
      return;
    }
    ctx.flash("Biggy: I don't do buttons. I do doors.");
  }

  /* ------------------------------------------------------------------- update */

  /**
   * The wheel's own body: one angle, one angular velocity, its own drag, its own
   * detent pawl, and exactly one thing in the world that can take energy out of it
   * quickly — a braced Droid. Stepped after `stepAll`, so any heave Biggy landed
   * through `cabinet.onHit` this frame is already in `wheel.vel`.
   */
  function stepWheel(dt: number): void {
    if (wheel.open) return;
    const d = ctx.byKind('droid');
    wheel.held = d.braced && dist(d, wheelAt) < WHEEL_REACH;

    if (wheel.held) {
      // BRACED_MASS is what makes this legal: Droid is not slowing the wheel down,
      // he is an immovable object with a hand on it.
      wheel.vel *= Math.exp(-WHEEL_BRAKE * dt);
    } else {
      wheel.vel *= Math.exp(-WHEEL_DRAG * dt);
      if (Math.abs(wheel.vel) < PAWL_CATCH) {
        const det = Math.round((wheel.ang - PAWL_OFFSET) / WHEEL_STEP) * WHEEL_STEP + PAWL_OFFSET;
        const off = angDiff(det, wheel.ang);
        if (Math.abs(off) < PAWL_SNAP && Math.abs(wheel.vel) < PAWL_CREEP * 1.2) {
          wheel.ang = norm(det);
          wheel.vel = 0;
        } else {
          const want = Math.sign(off) * PAWL_CREEP;
          wheel.vel += (want - wheel.vel) * (1 - Math.exp(-PAWL_EASE * dt));
        }
      }
    }
    wheel.ang = norm(wheel.ang + wheel.vel * dt);

    const onMark = Math.abs(angDiff(wheel.ang, wheel.mark)) < WHEEL_TOL && Math.abs(wheel.vel) < WHEEL_STOP;
    wheel.seat = onMark ? wheel.seat + dt : 0;
    if (wheel.seat >= WHEEL_SEAT) {
      wheel.open = true;
      wheel.vel = 0;
      ctx.removeWall(cabinet);
      ctx.flash('The cam drops in. The cabinet swings open on the venue router', 3500);
      ctx.card(
        '<b>The router cabinet is open.</b><br>' +
          '<span class="sub">Four green lights, a fan nobody has cleaned since 2019, and a strip of label tape ' +
          'stuck to the inside of the lid in somebody\'s handwriting:<br><br>' +
          '<b>WiFi: DevoxxForever</b> — and no, you cannot change it.</span>' +
          '<small>Press any key</small>',
      );
    }
  }

  function update(dt: number): void {
    ctx.stepAll(dt);
    ctx.pushBiggy(dt);
    mg.update(dt);
    stepWheel(dt);

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
    //
    // The polygons are still CAST while the cabinet is shut, because the index mark
    // is a light question and it does not stop being one when the breakers go in —
    // they are simply not handed to the renderer any more. One cone, one pool and
    // one flood a frame, which is what chapter 1 pays for the whole way through.
    const cast = !power || !wheel.open ? buildLights(ctx.bots, ctx.walls, NO_MIRRORS) : NO_MIRROR_LIGHTS;
    lights = power ? NO_MIRROR_LIGHTS : cast;
    // A single-colour visibility test, not a mix: only the 0.38 rad cone throws an
    // edge hard enough to read a scribed line, which is why Biggy's 1.0 rad flood
    // standing in the same doorway reveals nothing.
    wheel.markLit = !wheel.open && litBy(cast, 'voxxy', markAt());

    if (power && cable.connected && wheel.open && rollerBroken) {
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
        state: printerOnline() ? 'done' : cable.connected ? 'active' : 'idle',
        label: printerOnline()
          ? 'printer online'
          : `badge printer — needs${power ? '' : ' power,'}${cable.connected ? '' : ' cable,'}${wheel.open ? '' : ' router,'}`.replace(/,$/, ''),
      },
      // The cabinet and its wheel. The renderer needs no chapter knowledge: the
      // cabinet is a box with a state, the wheel carries its own angle in `v` and
      // the mark carries the angle it is scribed at.
      {
        kind: 'cabinet',
        ...GF.cabinet,
        state: wheel.open ? 'open' : 'shut',
        label: wheel.open ? 'router cabinet — open' : 'router cabinet (cam-lock)',
      },
      {
        kind: 'cam-wheel',
        x: wheelAt.x,
        y: wheelAt.y,
        w: WHEEL_R * 2,
        h: WHEEL_R * 2,
        v: wheel.ang,
        state: wheel.open ? 'done' : wheel.held ? 'active' : 'idle',
        label: wheel.open ? 'cam-lock: open' : `cam-lock wheel at ${deg(wheel.ang)}°`,
      },
      {
        kind: 'cam-mark',
        x: wheelAt.x,
        y: wheelAt.y,
        w: WHEEL_R * 2,
        h: WHEEL_R * 2,
        v: wheel.mark,
        state: wheel.open ? 'done' : wheel.markLit ? 'active' : 'idle',
        label: wheel.markLit ? `index mark ${deg(wheel.mark)}°` : 'index mark (unlit)',
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

  /** Power AND cable AND router. Three prerequisites, one printer. */
  const printerOnline = (): boolean => power && cable.connected && wheel.open;

  /** The live bottom-of-screen line: the four jobs, each with its own counter. */
  function progress(): string {
    const breakers = power ? 'power ✓' : `breakers ${BREAKERS - breakersLeft}/${BREAKERS}`;
    const net = cable.connected
      ? 'cable ✓'
      : cable.snapped
        ? 'cable snapped — back to the rack'
        : cable.carrying
          ? `cable ${Math.round(cable.len)}/${CABLE_MAX} px`
          : 'cable: on the reel at the rack';
    const router = wheel.open
      ? 'router ✓'
      : `router: wheel ${deg(wheel.ang)}°, mark ${wheel.markLit ? `${deg(wheel.mark)}°` : 'unlit'}${wheel.held ? ' (held)' : ''}`;
    const store = rollerBroken ? 'badge store ✓' : `roller door: shut (needs ${m(ROLLER_DOOR_SPEED).toFixed(1)} m/s)`;
    return `${breakers} · ${net} · ${router} · ${store}`;
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
      wheel: {
        ang: wheel.ang,
        vel: wheel.vel,
        mark: wheel.mark,
        markLit: wheel.markLit,
        held: wheel.held,
        open: wheel.open,
      },
      printerOnline: printerOnline(),
      minigames: mg.state(),
    }),
  };
}

export const ch2Expo: ChapterDef = { n: 2, title: '2 · Expo — the exhibition hall', setup };
