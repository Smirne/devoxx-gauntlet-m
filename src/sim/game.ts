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
  DT_MAX,
  TOAST_MS,
  TRAVEL_TIME_SCALE,
} from './constants';
import { VIEW_CLOSED } from './geometry';
import { botsCollide, mkBot, pushBiggy as leanOnBiggy, stepBot, syncMount, toggleMount as climbBiggy } from './bot';
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

const TITLE_CARD =
  '<b>AFTER DARK</b><br>' +
  '<span class="sub">Kinepolis Antwerp, the night before Devoxx. The entrance is shut, the power is out in the ' +
  'closed cinema section, and somewhere a keynote has to happen tomorrow.<br>' +
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
      if (b.braced) {
        b.vx = 0;
        b.vy = 0;
        b.ix = 0;
        b.iy = 0;
        return;
      }
      const before: PrevVel = { vx: b.vx, vy: b.vy };
      stepBot(b, dt, walls, onBlocked);
      if (afterStep) afterStep(b, before);
    });
    syncMount(bots);
    for (let i = 0; i < bots.length; i++) {
      for (let j = i + 1; j < bots.length; j++) botsCollide(bots[i], bots[j]);
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
    [V.x, V.y] = v;
    [D.x, D.y] = d;
    [B.x, B.y] = b;
    for (const o of bots) {
      o.vx = 0;
      o.vy = 0;
      o.boostCap = 0;
    }
  }

  function switchKey(code: string): void {
    if (code === 'Digit1') cur = 0;
    if (code === 'Digit2' && !byKind('droid').mounted) cur = 1;
    if (code === 'Digit3') cur = 2;
  }

  function toggleMount(): void {
    // While Droid rides Biggy the tower moves as one robot, so control follows it.
    if (climbBiggy(bots, flash)) cur = ORDER.indexOf('biggy');
  }

  /* ------------------------------------------------------------- cutscenes */

  function startCut(routes: CutRoute[], next: () => void, v: ViewRect): void {
    phase = 'cut';
    const map = new Map<RobotKind, Array<{ x: number; y: number }>>();
    for (const r of routes) map.set(r.kind, r.pts.map((p) => ({ x: p.x, y: p.y })));
    cut = { view: v, routes: map, next, stage: 'gather', st: 0, pace: new Map() };
    for (const b of bots) {
      b.ix = 0;
      b.iy = 0;
      b.braced = false;
      b.vx = 0;
      b.vy = 0;
    }
    if (byKind('droid').mounted) toggleMount();
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
          cut.pace.set(b.kind, len / CUT_WALK_TIME);
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

  function startChapter(n: number): void {
    const def = CHAPTERS[n - 1];
    if (!def) throw new Error(`no chapter ${n}`);
    chapter = n;
    phase = 'play';
    cur = 0;
    toast = null;
    cut = null;
    blockedAt.clear();
    walls.length = 0;
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
      score.lunchT ??= Math.round(t);
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
    if (code === 'KeyR') {
      restart();
      return;
    }
    if (phase !== 'play' || !runtime) return;
    if (code === 'Tab') {
      // Never hand control to a robot that is riding on another one.
      do {
        cur = (cur + 1) % bots.length;
      } while (bots[cur].mounted);
    }
    runtime.key(code);
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
      objective,
      keys: keysLine,
      progress: r?.progress?.() ?? '',
      toast,
      fade,
      card,
      entered: r?.entered?.() ?? '',
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

  return { snapshot, update, key, setStick: (x, y) => { stickX = x; stickY = y; }, skipChapter, startChapter, debug };
}
