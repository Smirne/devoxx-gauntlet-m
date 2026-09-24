/**
 * The headless game: the chapter manifest, the shared step, the cutscene runner and
 * the snapshot the renderer reads.
 *
 * Ported from the prototype's `level()` closure
 * (`reference/poc/10-after-dark-kinepolis.html`), minus everything to do with a
 * canvas. `src/sim` is the only source of truth for state and it never imports
 * Three.js, touches the DOM or calls `Math.random` — the last one matters because the
 * chapter-1 code is randomised per run and the tests have to be able to replay a run
 * exactly (see `mulberry32` below).
 *
 * The renderer holds one of these and only ever calls `snapshot()`. Everything a
 * frame needs — walls, lights, props, people, the HUD lines, the fade, the card — is
 * reachable from there, so no drawing code ever needs to know which chapter is on.
 */

import {
  BLOCKED_THROTTLE,
  CUT_FADE,
  DEFS,
  DT_MAX,
  MOUNT_REACH,
  TOAST_MS,
  TRAVEL_TIME_SCALE,
} from './constants';
import { VIEW_CLOSED, groundPlates } from './geometry';
import {
  botsCollide,
  circleRect,
  mkBot,
  partyTrick as showOff,
  pushBiggy as leanOnBiggy,
  stepBot,
  syncMount,
  toggleMount as climbBiggy,
} from './bot';
import { canGrab, grab as takeHold, stepTow, towPlace, type TowState } from './tow';
import type {
  Bot,
  Clue,
  CutRoute,
  Game,
  GameSnapshot,
  LightSource,
  Mirror,
  Person,
  Phase,
  Plate,
  Prop,
  RobotKind,
  Toast,
  ViewRect,
  Wall,
} from './types';
import { CHAPTERS, type ChapterCtx, type ChapterRuntime, type ChapterState, type PrevVel } from './chapters';

export const CHAPTER_COUNT = 4;

/** Robot order in `bots`, and therefore what 1/2/3 select. */
const ORDER: readonly RobotKind[] = ['voxxy', 'droid', 'biggy'];

/* ------------------------------------------------------------------ cutscenes */

/*
 * A chapter transition is a BEAT, and Michele's chapter-1 playtest said this one
 * went by before it registered: "the animation in the chapter 1-2 passage is too
 * fast and too dark, and I'd zoom more". Every number below is in SECONDS, and the
 * walk is driven by a duration rather than by a speed, on purpose:
 *
 *   - a speed in px/s is a number the physics rescale moves underneath us, and a
 *     cutscene tuned in px/s is retuned every time the robots' `max` changes;
 *   - a cutscene is direction, not physics. The shot is as long as the shot needs
 *     to be, and each robot's pace falls out of "cover your route in that time".
 *
 * The whole thing is gather + walk + hold + leave, about seven seconds.
 */

/** After the gather fade, the robots are teleported to the head of their route. */
const CUT_PLACE_AT = 0.8;
/** The walk fades back in over this long — a reveal, not a switch. */
const CUT_WALK_FADE = 0.9;
/**
 * How long the walk itself takes, whatever the speed constants say: every robot
 * covers its own route in this, so the leg is the same length in every chapter and
 * survives any rescale of `max`.
 */
const CUT_WALK_TIME = 4.6;
/**
 * A CUTSCENE IS A WALK, AND THE ROUTE IS WHAT HAS TO FIT.
 *
 * Michele: *"the animation between chapter 1 and 2 is better, but the walk is long
 * and they are running a bit too fast."* Measured through chapter 1's transition,
 * frame by frame, teleports excluded:
 *
 * ```
 * voxxy  497 px in 7.23 s   top 109.2 px/s   151% of her own max
 * droid  481 px             top 105.7 px/s   263% of his
 * biggy  471 px             top 103.5 px/s   176% of his
 * ```
 *
 * Droid was being driven at **two and a half times the fastest he can physically
 * move**, and the gait is driven by that speed, so his legs were being asked to run
 * at a rate the rig was never tuned for. That is a physics-realism bug, not a
 * pacing note.
 *
 * The cause is arithmetic and it is the staircase move of 24 Sep: `leave()` in
 * `ch1-night.ts` walks to the stairwell mouth, the plan put that mouth 180 px
 * further east, `pace = routeLength / CUT_WALK_TIME` did the rest. It was already
 * at 134% of Droid's max before the move.
 *
 * The fix is NOT to stretch `CUT_WALK_TIME` — he says the walk is *long*, and a
 * longer shot makes that worse — and it is not to clamp the pace, because a clamped
 * pace on an over-long route means the cast never reaches its mark before
 * `CUT_WALK_MAX` ends the leg and the shot lands with three robots in the wrong
 * place. **The route is what shrinks**: `trimRoute` below cuts the run-up back from
 * the destination until the whole leg fits a walking pace, and the destination, the
 * shape of the final approach and the formation are all untouched. The cast is
 * teleported to the head of its route anyway (`CUT_PLACE_AT`), so where the walk
 * begins is a directorial choice and not a continuity one.
 *
 * Derived, not picked, which is the durable half: the budget falls out of the
 * SLOWEST robot's own `max`, so the next time a waypoint moves the shot re-sizes
 * itself instead of turning into a sprint.
 */
const CUT_WALK_FRACTION = 0.7;
/** They stand on their mark for this long before the black comes back. */
const CUT_HOLD = 0.5;
/**
 * A cutscene walk never holds the game hostage: after this the leg ends wherever it
 * has got to. It is a safety hatch, not a pace — it has to sit comfortably above
 * `CUT_WALK_TIME + CUT_HOLD` or it truncates the scene it is meant to protect.
 */
const CUT_WALK_MAX = 9;
/** The closing fade, and when it hands over to the next chapter. */
const CUT_LEAVE_FADE = 1;
const CUT_LEAVE_AT = 1.25;
/** A waypoint counts as reached inside this. */
const CUT_ARRIVE = 4;
/** How fast the black lifts once play resumes. */
const FADE_IN_RATE = 1.4;
/** Gait phase advance during a cutscene — `stepBot`'s `ANIM_DIV`, applied by hand. */
const CUT_ANIM_DIV = 18;

/**
 * Michele's own words, 24 Sep 2026, kept verbatim.
 *
 * The version before it opened on "the entrance is shut", which states a fact
 * about a door. His opens on Stephan losing the keys, which states a fact about
 * a person — and it answers the question the old card left hanging: if the
 * humans are locked out, why is anyone inside at all? The robots are already in
 * there because they were set up for the conference. That is the premise, and it
 * took one sentence.
 */
const TITLE_CARD =
  '<b>AFTER DARK</b><br>' +
  '<span class="sub">Kinepolis Antwerp, the night before Devoxx. <b>Stephan</b> lost the keys — the humans are ' +
  'locked out until morning, but three robots are already inside, set up for the conference. The power is out ' +
  'in the closed cinema section, and somewhere a keynote has to happen after breakfast.<br>' +
  'Three robots. Two floors. Four chapters.</span><small>Press any key</small>';
const TITLE_OBJECTIVE =
  '<b>After Dark</b> — the night before Devoxx, a power cut, three robots, two floors of Kinepolis and one keynote to save.';
const TITLE_KEYS = 'Press any key to start · 1/2/3/Tab: switch · WASD: move · E: use · Skip chapter: top right';

/* ---------------------------------------------------------------------- rng */

/**
 * mulberry32 — 32 bits of state, one multiply-xorshift round, good enough for
 * "which digit, which booth, which shade of jumper" and, crucially, seedable.
 * `Math.random()` is never called anywhere in `src/sim`.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------- options */

export interface GameOptions {
  /** Seed for every per-run randomisation. The same seed replays the same run. */
  seed?: number;
  /** Start straight in this chapter instead of on the title card. */
  chapter?: number;
  /**
   * Full-screen cards between chapters. Off for headless runs (tests, the fidelity
   * harness) so `update` is never waiting on a keypress that nobody will send.
   */
  cards?: boolean;
}

/** Test and debug-overlay access to state the renderer has no business reading. */
export interface GameDebug {
  /** Teleport one robot and stop it dead. `face` aims its lamp. */
  place(kind: RobotKind, x: number, y: number, face?: number): void;
  /** Hand control to one robot, as 1/2/3 would. */
  select(kind: RobotKind): void;
  /** The active chapter's own state. Narrow it on `state().chapter`. */
  chapter(): ChapterState;
  /** The live wall list, including the doors chapters add and remove. */
  walls(): Wall[];
  /** Move a loose body ('cake', 'duck'); false when this chapter has none by that name. */
  placeProp(kind: string, x: number, y: number): boolean;
}

export interface DebugGame extends Game {
  readonly debug: GameDebug;
}

/* ----------------------------------------------------------------------- game */

const NO_LIGHTS: LightSource[] = [];
const NO_MIRRORS: Mirror[] = [];
const NO_CLUES: Clue[] = [];
const NO_PROPS: Prop[] = [];
const NO_PEOPLE: Person[] = [];
/**
 * The ground floor's own raised surfaces — the lobby, its steps, the main flight.
 *
 * Built once: it is the building, and the building does not move. The first floor
 * has none, which is why `platesNow` answers with an empty list up there rather
 * than with a filtered copy of this.
 */
const GROUND_PLATES: Plate[] = groundPlates();
const NO_PLATES: Plate[] = [];

export function createGame(opts: GameOptions = {}): DebugGame {
  const showCards = opts.cards !== false;
  let rng = mulberry32(opts.seed ?? 0x9e3779b9);

  const bots: Bot[] = [mkBot('voxxy', 60, 325), mkBot('droid', 60, 352), mkBot('biggy', 66, 380)];
  const walls: Wall[] = [];
  const score: Record<string, number> = {};
  const swag: string[] = [];
  const skipped: number[] = [];
  /** Last time each wall explained itself, so it does not nag every frame. */
  const blockedAt = new Map<Wall, number>();

  let cur = 0;
  let t = 0;
  let chapter = 0;
  let phase: Phase = 'intro';
  let floor: 'up' | 'down' = 'up';
  let view: ViewRect = VIEW_CLOSED;
  let fade = 0;
  let card: string | null = null;
  let toast: Toast | null = null;
  let objective = TITLE_OBJECTIVE;
  let keysLine = TITLE_KEYS;
  let stickX = 0;
  let stickY = 0;
  let runtime: ChapterRuntime | null = null;
  /** The tow bar, when somebody has hold of Biggy. See `tow.ts`. */
  let tow: TowState | null = null;

  interface CutState {
    view: ViewRect;
    routes: Map<RobotKind, Array<{ x: number; y: number }>>;
    next: () => void;
    stage: 'gather' | 'walk' | 'hold' | 'leave';
    st: number;
    /** px/s per robot, derived at the top of the walk from route length / `CUT_WALK_TIME`. */
    pace: Map<RobotKind, number>;
  }
  let cut: CutState | null = null;

  const byKind = (kind: RobotKind): Bot => {
    const b = bots.find((o) => o.kind === kind);
    if (!b) throw new Error(`no ${kind}`);
    return b;
  };

  /* ------------------------------------------------------------- feedback */

  function flash(text: string, ms: number = TOAST_MS): void {
    toast = { t: text, until: t + ms / 1000 };
  }

  function showCard(html: string): void {
    if (!showCards) return;
    card = html;
  }

  /**
   * A wall that explains itself does so at most once every `BLOCKED_THROTTLE`, per
   * wall — otherwise leaning on a door produces sixty identical toasts a second and
   * the one message that matters is never readable.
   */
  function onBlocked(b: Bot, w: Wall): void {
    const last = blockedAt.get(w) ?? -9;
    if (t - last < BLOCKED_THROTTLE) return;
    const why = w.why;
    if (!why) return;
    const m = why(b);
    if (m) {
      flash(m);
      blockedAt.set(w, t);
    }
  }

  /* ---------------------------------------------------------------- the step */

  function stepAll(dt: number, afterStep?: (b: Bot, before: PrevVel) => void): void {
    bots.forEach((b, i) => {
      // Only the robot being driven gets the stick. The other two keep their
      // momentum — which is the whole point of Biggy.
      if (i === cur) {
        b.ix = stickX;
        b.iy = stickY;
      } else {
        b.ix = 0;
        b.iy = 0;
      }
    });
    // The bar reads the holder's stick and spends it on Biggy, so it has to run
    // BEFORE the step — the velocity it sets is the one Biggy carries through his
    // own wall resolution — and the holder's own stick is then spent, or it would
    // walk off the bar under its own power as well.
    stepTowBar(dt);
    for (const b of bots) {
      if (b.braced) {
        b.vx = 0;
        b.vy = 0;
        b.ix = 0;
        b.iy = 0;
        continue;
      }
      const before: PrevVel = { vx: b.vx, vy: b.vy };
      stepBot(b, dt, walls, onBlocked);
      if (afterStep) afterStep(b, before);
    }
    syncMount(bots);
    for (let i = 0; i < bots.length; i++) {
      for (let j = i + 1; j < bots.length; j++) botsCollide(bots[i], bots[j]);
    }
    settleTow();
  }

  /* -------------------------------------------------------------- the tow bar */

  /**
   * Take hold of Biggy, or let go. Space, and it is the same key both ways.
   *
   * Control follows the bar for the same reason it follows a mounted Droid: the
   * pair moves as one thing, and a player steering Biggy's *holder* while the HUD
   * says they are driving Biggy has to work out the indirection for themselves.
   */
  function towToggle(): void {
    if (tow) {
      release('lets go of Biggy');
      return;
    }
    const bg = byKind('biggy');
    const b = bots[cur];
    if (b === bg) {
      // Biggy cannot tow himself, and saying so is friendlier than a dead key.
      flash('Biggy: "Someone has to pull. It is not going to be me."');
      return;
    }
    if (!canGrab(b, bg, MOUNT_REACH)) {
      flash(`${b.name}: "Not close enough to get a grip on Biggy."`);
      return;
    }
    tow = takeHold(b, bg);
    cur = ORDER.indexOf(tow.holder);
    flash(`${b.name} takes hold of Biggy — push or pull along the bar, steer across it`);
  }

  /**
   * `E` with nothing else on it: take hold of Biggy, let go of him, or show off.
   *
   * The order is intent, not convenience. A robot already on the bar means to let
   * go; one standing against Biggy means to take hold, because that is the reason
   * to be standing there; anything else is that robot's party trick — Voxxy's hop,
   * Biggy's roll, Droid's stretch. A robot can always step away from Biggy to
   * perform, and there is nothing any of them could want to hop over, rock on or
   * stretch out of while touching him.
   *
   * That ordering is also the whole of the "towing" gate: a robot on the bar never
   * reaches `partyTrick`, because on the bar `E` already means something, and
   * letting go says so out loud.
   */
  function spareE(): void {
    const b = bots[cur];
    if (tow || (b.kind !== 'biggy' && canGrab(b, byKind('biggy'), MOUNT_REACH))) {
      towToggle();
      return;
    }
    showOff(bots, b, flash);
  }

  function release(why: string): void {
    if (!tow) return;
    const holder = byKind(tow.holder);
    tow = null;
    flash(`${holder.name} ${why}`);
  }

  /** Quietly drop the bar — chapter change, cutscene, teleport. No toast. */
  function dropTow(): void {
    tow = null;
  }

  function stepTowBar(dt: number): void {
    if (!tow) return;
    const holder = byKind(tow.holder);
    const bg = byKind('biggy');
    const next = stepTow(tow, holder, bg, dt);
    if (!next) {
      release('lets go of Biggy');
      return;
    }
    holder.ix = 0;
    holder.iy = 0;
  }

  /**
   * Put the holder back on the bar now that Biggy has moved and resolved his own
   * walls, then push the holder out of anything it landed in.
   *
   * Pushing out rather than releasing is deliberate. The bar is a straight line
   * and the venue is not: a run down a corridor clips the holder into a door
   * reveal for a frame or two, and dropping the grab there would mean the tow
   * fails exactly where a player most needs it. The drive uses the bar's axis,
   * never the two robots' actual positions, so a holder nudged off the line still
   * steers. Only a wall that genuinely separates the pair — more than half a
   * robot's worth of daylight opened up — ends the grab.
   */
  function settleTow(): void {
    if (!tow) return;
    const holder = byKind(tow.holder);
    const bg = byKind('biggy');
    towPlace(tow, holder, bg);
    for (const w of walls) {
      if (w.skipFor && w.skipFor(holder)) continue;
      const hit = circleRect(holder, w);
      if (!hit) continue;
      holder.x += hit.nx * hit.pen;
      holder.y += hit.ny * hit.pen;
    }
    const gap = holder.r + bg.r;
    if (Math.hypot(bg.x - holder.x, bg.y - holder.y) > gap + holder.r * 0.5) {
      release('loses the grip on Biggy');
    }
  }

  function place(
    v: readonly [number, number],
    d: readonly [number, number],
    b: readonly [number, number],
  ): void {
    const V = byKind('voxxy');
    const D = byKind('droid');
    const B = byKind('biggy');
    if (D.mounted) D.mounted = false;
    D.braced = false;
    dropTow();
    [V.x, V.y] = v;
    [D.x, D.y] = d;
    [B.x, B.y] = b;
    for (const o of bots) {
      o.vx = 0;
      o.vy = 0;
      o.boostCap = 0;
      o.air = 0;
      o.flair = 0;
      o.hopRest = 0;
    }
  }

  function switchKey(code: string): void {
    if (code === 'Digit1') cur = 0;
    if (code === 'Digit2' && !byKind('droid').mounted) cur = 1;
    if (code === 'Digit3') cur = 2;
  }

  function toggleMount(): void {
    // Climbing on is a second way of riding Biggy, and holding the bar while
    // doing it left the holder welded to his flank mid-climb. One verb at a time.
    dropTow();
    // While Droid rides Biggy the tower moves as one robot, so control follows it.
    if (climbBiggy(bots, flash)) cur = ORDER.indexOf('biggy');
  }

  /* ------------------------------------------------------------- cutscenes */

  /**
   * The longest leg a cutscene may walk, sim px.
   *
   * `CUT_WALK_FRACTION` of the slowest robot's top speed, held for
   * `CUT_WALK_TIME`. Everything in it is derived: the robots' `max` is frozen
   * physics, the two cutscene numbers are durations and fractions, and no px/s
   * constant is typed anywhere. A rescale of the speeds re-sizes the shot.
   */
  function cutReach(): number {
    let slowest = Infinity;
    for (const b of bots) if (b.max < slowest) slowest = b.max;
    return slowest * CUT_WALK_FRACTION * CUT_WALK_TIME;
  }

  /**
   * Shorten a route's RUN-UP until the whole leg fits `budget`, keeping its end.
   *
   * Walked back from the destination: every waypoint that still fits is kept, and
   * the one the budget runs out on becomes an interpolated start point on that
   * segment. So the mark, the final approach and the three robots' formation are
   * exactly what the chapter wrote; only the distance the shot opens at moves.
   * A route that already fits is returned untouched.
   */
  function trimRoute(pts: Array<{ x: number; y: number }>, budget: number): Array<{ x: number; y: number }> {
    if (pts.length < 2 || budget <= 0) return pts;
    let left = budget;
    for (let i = pts.length - 1; i > 0; i--) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (seg <= left) {
        left -= seg;
        continue;
      }
      // The budget runs out inside this segment: start the walk partway along it.
      const u = seg > 0 ? left / seg : 0;
      return [{ x: b.x + (a.x - b.x) * u, y: b.y + (a.y - b.y) * u }, ...pts.slice(i)];
    }
    return pts;
  }

  function startCut(routes: CutRoute[], next: () => void, v: ViewRect): void {
    phase = 'cut';
    const map = new Map<RobotKind, Array<{ x: number; y: number }>>();
    const budget = cutReach();
    for (const r of routes) map.set(r.kind, trimRoute(r.pts.map((p) => ({ x: p.x, y: p.y })), budget));
    cut = { view: v, routes: map, next, stage: 'gather', st: 0, pace: new Map() };
    for (const b of bots) {
      b.ix = 0;
      b.iy = 0;
      b.braced = false;
      b.vx = 0;
      b.vy = 0;
    }
    if (byKind('droid').mounted) toggleMount();
    dropTow();
  }

  function cutUpdate(dt: number): void {
    if (!cut) return;
    cut.st += dt;
    if (cut.stage === 'gather') {
      fade = Math.min(1, cut.st / CUT_FADE);
      if (cut.st > CUT_PLACE_AT) {
        // Under cover of the black, everyone is moved to the head of their route:
        // no robot ever has to walk across the map to reach its mark.
        for (const b of bots) {
          const r = cut.routes.get(b.kind);
          if (r && r.length) {
            b.x = r[0].x;
            b.y = r[0].y;
            r.shift();
          }
        }
        view = cut.view;
        // Each robot's pace, fixed here and held for the whole leg: how far it
        // still has to walk, divided by how long the shot lasts. Nothing in this
        // file is a px/s constant any more.
        for (const b of bots) {
          const r = cut.routes.get(b.kind);
          let len = 0;
          let px = b.x;
          let py = b.y;
          if (r) {
            for (const pt of r) {
              len += Math.hypot(pt.x - px, pt.y - py);
              px = pt.x;
              py = pt.y;
            }
          }
          /*
           * The clamp is a GUARD, not the pace.
           *
           * `trimRoute` has already made every leg short enough that
           * `len / CUT_WALK_TIME` is under a walking pace, so this line never bites
           * on a route the chapters actually write — and `tests/cutscene-pace.test.ts`
           * asserts that, by measuring every robot through every transition against
           * its own `max`. It is here so that a route nobody trimmed (a chapter
           * added later, a waypoint moved) degrades into a slow walk that runs out
           * of time rather than into Droid sprinting at 2.6x his top speed, which
           * is what this cost last round.
           */
          cut.pace.set(b.kind, Math.min(len / CUT_WALK_TIME, b.max));
        }
        cut.stage = 'walk';
        cut.st = 0;
      }
      return;
    }
    if (cut.stage === 'walk') {
      fade = Math.max(0, 1 - cut.st / CUT_WALK_FADE);
      let done = true;
      for (const b of bots) {
        const r = cut.routes.get(b.kind);
        if (!r || !r.length) {
          b.vx = 0;
          b.vy = 0;
          continue;
        }
        const target = r[0];
        const dx = target.x - b.x;
        const dy = target.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < CUT_ARRIVE) {
          // Reaching a waypoint is not reaching the END of the route: without this
          // the leg finished on the frame every robot happened to touch the same
          // corner, which is every corner now that they walk the route in lockstep.
          r.shift();
          if (r.length) done = false;
          continue;
        }
        done = false;
        // Walls are ignored here on purpose — a cutscene walks through the doorway
        // it is meant to walk through, and `d / dt` stops it overshooting the mark.
        const sp = Math.min(d / dt, cut.pace.get(b.kind) ?? 0);
        b.vx = (dx / d) * sp;
        b.vy = (dy / d) * sp;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.face = Math.atan2(dy, dx);
        b.anim += (sp * dt) / CUT_ANIM_DIV;
      }
      // The robots have moved; anything the chapter derives from that has to move
      // with them, or the cutscene is lit from wherever the chapter left off.
      runtime?.relight?.();
      if (done || cut.st > CUT_WALK_MAX) {
        // They have arrived: hold the picture for a beat before the black returns,
        // so the shot lands on a pose instead of cutting on the last footfall.
        cut.stage = 'hold';
        cut.st = 0;
      }
      return;
    }
    if (cut.stage === 'hold') {
      fade = 0;
      for (const b of bots) {
        b.vx = 0;
        b.vy = 0;
      }
      if (cut.st > CUT_HOLD) {
        cut.stage = 'leave';
        cut.st = 0;
      }
      return;
    }
    fade = Math.min(1, cut.st / CUT_LEAVE_FADE);
    if (cut.st > CUT_LEAVE_AT) {
      fade = 1;
      const next = cut.next;
      cut = null;
      next();
    }
  }

  /* ------------------------------------------------------------- end cards */

  function fail(text: string): void {
    phase = 'done';
    card = text;
  }

  /**
   * The final card. The prototype's formula, unchanged: three points for finishing,
   * plus how much soup survived and how hot it still was, plus the slack left before
   * the keynote, minus the people you knocked over, plus half a point per swag.
   */
  function finalCard(): void {
    const soup = score.soup ?? 0;
    const temp = score.temp ?? 0;
    const spare = score.spare ?? 0;
    const complaints = (score.complaints ?? 0) + (score.keynoteComplaints ?? 0);
    const pts = Math.max(
      1,
      Math.min(9, Math.round(3 + (soup / 100) * 2 + temp / 100 + spare / (40 * TRAVEL_TIME_SCALE) - complaints * 0.3 + swag.length * 0.5)),
    );
    score.points = pts;
    score.total = Math.round(t);
    const nightT = score.nightT ?? 0;
    const expoT = score.expoT ?? 0;
    const sk = skipped.length ? ` · skipped: ${skipped.join(', ')}` : '';
    card =
      `<b>Keynote starts.</b> ${pts}/9<br>` +
      `<span class="sub">Night ${nightT}s · Expo ${Math.max(0, expoT - nightT)}s (cable ${score.cable ?? 0} px) · ` +
      `Soup ${soup}% at ${temp}° (${score.complaints ?? 0} complaint${(score.complaints ?? 0) === 1 ? '' : 's'}) · ` +
      `Stage ready with ${spare}s to spare (${score.keynoteComplaints ?? 0} complaint${(score.keynoteComplaints ?? 0) === 1 ? '' : 's'}) · ` +
      `Swag ${swag.length}/3 · Total ${Math.round(t)}s${sk}</span><small>R to play again</small>`;
  }

  function finish(): void {
    phase = 'done';
    finalCard();
  }

  /* ------------------------------------------------------------- the manifest */

  /**
   * Give every robot its frozen identity back.
   *
   * A chapter is allowed to modify a robot's physical numbers for its own beat —
   * chapter 3's beer crates put mass on Biggy and take acceleration off him
   * (`src/sim/crates.ts`) — and `mkBot` spreads `DEFS` into a mutable copy
   * precisely so it can. What a chapter must never do is let that modifier
   * OUTLIVE it: skipping out of chapter 3 mid-carry, or pressing `R`, would
   * otherwise hand chapter 4 or chapter 1 a Biggy who is still carrying four
   * crates that no longer exist.
   *
   * So the restore lives here, at the one door every chapter comes through, and
   * it reads `DEFS` rather than remembering anything. The frozen table itself is
   * never written — it is deep-frozen, and writing it would throw.
   */
  function restoreIdentity(): void {
    for (const b of bots) {
      const def = DEFS[b.kind];
      b.r = def.r;
      b.accel = def.accel;
      b.max = def.max;
      b.drag = def.drag;
      b.mass = def.mass;
      b.air = 0;
      b.flair = 0;
      b.hopRest = 0;
    }
  }

  function startChapter(n: number): void {
    const def = CHAPTERS[n - 1];
    if (!def) throw new Error(`no chapter ${n}`);
    chapter = n;
    phase = 'play';
    cur = 0;
    toast = null;
    cut = null;
    dropTow();
    blockedAt.clear();
    walls.length = 0;
    restoreIdentity();
    runtime = def.setup(ctx);
  }

  /** Fill in whatever the skipped chapter would have scored, so the card still adds up. */
  function defaultScore(n: number): void {
    if (n === 1) score.nightT ??= Math.round(t);
    if (n === 2) {
      score.expoT ??= Math.round(t);
      score.cable ??= 0;
    }
    if (n === 3) {
      score.soup ??= 100;
      score.temp ??= 100;
      score.complaints ??= 0;
      score.breakfastT ??= Math.round(t);
    }
    if (n === 4) {
      score.spare ??= 0;
      score.keynoteComplaints ??= 0;
    }
  }

  function skipChapter(): void {
    // Once the run is over there is nothing left to skip: skipping the end card
    // used to push chapter 4 onto `skipped` a second time, so the final card read
    // "skipped: 1, 2, 3, 4, 4".
    if (phase === 'done') return;
    card = null;
    if (chapter === 0) {
      startChapter(1);
      return;
    }
    // Skipping *during* a cutscene just runs it out: the next chapter is already
    // decided, and the player pressed skip to stop watching, not to lose a chapter.
    if (phase === 'cut' && cut) {
      fade = 1;
      const next = cut.next;
      cut = null;
      next();
      return;
    }
    skipped.push(chapter);
    defaultScore(chapter);
    if (chapter < CHAPTER_COUNT) startChapter(chapter + 1);
    else {
      phase = 'done';
      finalCard();
    }
  }

  function restart(): void {
    for (const k of Object.keys(score)) delete score[k];
    swag.length = 0;
    skipped.length = 0;
    blockedAt.clear();
    walls.length = 0;
    rng = mulberry32(opts.seed ?? 0x9e3779b9);
    for (const b of bots) {
      b.mounted = false;
      b.braced = false;
      b.boostCap = 0;
      b.pushFlash = undefined;
    }
    t = 0;
    cur = 0;
    fade = 0;
    toast = null;
    cut = null;
    dropTow();
    runtime = null;
    chapter = 0;
    phase = 'intro';
    objective = TITLE_OBJECTIVE;
    keysLine = TITLE_KEYS;
    card = null;
    if (showCards) showCard(TITLE_CARD);
    else startChapter(1);
  }

  /* ----------------------------------------------------------------- context */

  const ctx: ChapterCtx = {
    bots,
    walls,
    setWalls(next: Wall[]): void {
      walls.length = 0;
      walls.push(...next);
    },
    removeWall(w: Wall): void {
      const i = walls.indexOf(w);
      if (i >= 0) walls.splice(i, 1);
    },
    byKind,
    place,
    get t(): number {
      return t;
    },
    get cur(): number {
      return cur;
    },
    set cur(n: number) {
      cur = n;
    },
    flash,
    card: showCard,
    objective(line: string, k: string): void {
      objective = line;
      keysLine = k;
    },
    setView(v: ViewRect): void {
      view = v;
    },
    setFloor(f: 'up' | 'down'): void {
      floor = f;
    },
    rng: () => rng(),
    stepAll,
    pushBiggy(dt: number): void {
      leanOnBiggy(bots, dt, t, flash);
    },
    toggleMount,
    switchKey,
    startCut,
    startChapter,
    fail,
    finish,
    score,
    swag,
    addSwag(id: string, toastText: string): void {
      if (swag.includes(id)) return;
      swag.push(id);
      flash(toastText, 3000);
    },
  };

  /* -------------------------------------------------------------------- loop */

  function update(dtRaw: number): void {
    // Clamped again here even though the caller is supposed to: one stalled frame
    // must never be able to tunnel Biggy through a wall.
    const dt = Math.min(Math.max(dtRaw, 0), DT_MAX);
    if (fade > 0 && phase !== 'cut') fade = Math.max(0, fade - dt * FADE_IN_RATE);
    if (toast && t > toast.until) toast = null;
    if (card !== null) return;
    if (phase === 'cut') {
      t += dt;
      cutUpdate(dt);
      return;
    }
    if (phase !== 'play' || !runtime) return;
    t += dt;
    runtime.update(dt);
  }

  /**
   * A keypress. **Dismissing a card must not eat the key that dismissed it.**
   *
   * Chapters 2, 3 and 4 open on a "press any key" card, and this used to clear the
   * card and `return`, so the first deliberate input after every chapter start was
   * swallowed: pressing 2 to take Droid did nothing the first time, every time,
   * and the player had to press it twice without ever being told why. The same bug
   * ate the `R` on the end card's own "R to play again".
   *
   * So the card is dismissed and the key then goes on to mean whatever it means.
   * Keys that only ever dismissed (Space, Enter) still just dismiss — they reach a
   * runtime that ignores them — and a card shown by `fail()` or `finish()` leaves
   * `phase` at 'done', where everything below but `R` falls through harmlessly.
   */
  function key(code: string): void {
    if (card !== null) {
      card = null;
      if (chapter === 0) startChapter(1);
    }
    // `R` is restart everywhere except inside a chapter's own text prompt, where it
    // is the two Rs in `DevoxxForever` (`ChapterRuntime.typing`).
    if (code === 'KeyR' && !(runtime?.typing?.() ?? false)) {
      restart();
      return;
    }
    if (phase !== 'play' || !runtime) return;
    if (code === 'Space') {
      towToggle();
      return;
    }
    if (code === 'Tab') {
      // Never hand control to a robot that is riding on another one.
      do {
        cur = (cur + 1) % bots.length;
      } while (bots[cur].mounted);
    }
    /*
     * THE CHAPTER GETS FIRST REFUSAL ON `E`.
     *
     * Michele: *"Why space and not e for catching? I'd keep it to one key"*, and
     * then *"I'd keep E, when no other action is available."* `E` already means
     * use / climb / brace / lift / play inside the chapters, so this is an
     * ordering problem rather than a rename: the chapter is asked first, and only
     * a chapter that answers a flat `false` — "I looked, and `E` means nothing
     * where you are standing" — hands the key on. A chapter that has not been
     * taught to answer returns nothing and keeps the key, which is why this
     * arrived one chapter at a time instead of all at once.
     */
    const claimed = runtime.key(code);
    if (code === 'KeyE' && claimed === false) spareE();
    // Taking a different robot lets go of the bar: the holder is driven by the
    // stick, so leaving the pair joined while the stick is somewhere else means
    // Biggy drags a robot nobody is steering. This is checked AFTER the chapter
    // has had the key, because 1/2/3 are handled down there by `switchKey`.
    if (tow && bots[cur].kind !== tow.holder) dropTow();
  }

  /**
   * Every raised walking surface on screen this frame: the floor's, plus the
   * chapter's own (`src/sim/surface.ts`).
   *
   * Allocation-free in the common case — a chapter with nothing of its own hands
   * back the shared array rather than a new one per frame.
   */
  function platesNow(r: ChapterRuntime | null): Plate[] {
    const floorPlates = floor === 'down' ? GROUND_PLATES : NO_PLATES;
    const mine = r?.plates?.();
    if (mine === undefined || mine.length === 0) return floorPlates;
    return floorPlates.length === 0 ? mine : [...floorPlates, ...mine];
  }

  function snapshot(): GameSnapshot {
    const r = runtime;
    return {
      chapter,
      phase,
      t,
      floor,
      view,
      bots,
      active: cur,
      walls,
      lights: r?.lights?.() ?? NO_LIGHTS,
      mirrors: r?.mirrors?.() ?? NO_MIRRORS,
      clues: r?.clues?.() ?? NO_CLUES,
      props: r?.props?.() ?? NO_PROPS,
      people: r?.people?.() ?? NO_PEOPLE,
      /*
       * The floor's own raised surfaces, plus whatever the chapter has added to
       * them. `GROUND_PLATES` is built once — it is the building, and the building
       * does not move — and a chapter with nothing of its own hands back exactly
       * that array rather than a fresh copy every frame.
       */
      plates: platesNow(r),
      objective,
      keys: keysLine,
      progress: r?.progress?.() ?? '',
      toast,
      fade,
      card,
      tow: tow ? { holder: tow.holder, dir: tow.dir, aim: tow.aim } : null,
      entered: r?.entered?.() ?? '',
      typing: r?.typing?.() ?? false,
      prompt: r?.prompt?.() ?? null,
      score,
      swag,
    };
  }

  const debug: GameDebug = {
    place(kind: RobotKind, x: number, y: number, face?: number): void {
      const b = byKind(kind);
      b.x = x;
      b.y = y;
      b.vx = 0;
      b.vy = 0;
      b.boostCap = 0;
      if (face !== undefined) b.face = face;
    },
    select(kind: RobotKind): void {
      cur = ORDER.indexOf(kind);
    },
    chapter(): ChapterState {
      if (!runtime) throw new Error('no chapter running');
      return runtime.state();
    },
    walls: () => walls,
    placeProp: (kind: string, x: number, y: number): boolean => runtime?.placeProp?.(kind, x, y) ?? false,
  };

  if (opts.chapter !== undefined) startChapter(opts.chapter);
  else if (showCards) showCard(TITLE_CARD);
  else startChapter(1);

  /**
   * See `Game.turn`. Standing only — under 8 px/s (0.64 m/s), a robot still
   * settling after the stick let go — and never while carried or mid-cutscene.
   * An input threshold, not physics: nothing it moves is a frozen constant.
   */
  function turn(rad: number): void {
    if (phase !== 'play') return;
    const b = bots[cur];
    if (!b || b.mounted || Math.hypot(b.vx, b.vy) > 8) return;
    b.face = Math.atan2(Math.sin(b.face + rad), Math.cos(b.face + rad));
  }

  return { snapshot, update, key, setStick: (x, y) => { stickX = x; stickY = y; }, turn, skipChapter, startChapter, debug };
}
