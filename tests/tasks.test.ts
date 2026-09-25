/**
 * tests/tasks.test.ts — the one list behind the meter, the checklist and the hints.
 *
 * `GameSnapshot.tasks` is what the instructions panel, the HUD's `x of y` meter and
 * `H` all read (`Task` in `src/sim/types.ts`), and the whole reason it exists is
 * that three strings written three times drift apart. A list that is right on frame
 * 1 and stale afterwards would drift exactly the same way, so almost nothing in
 * here is asserted at setup: each chapter is PLAYED — the same choreographies
 * `tests/chapters.test.ts` and `tests/pilot.ts` use, with the same A* pilot — and
 * the list is read after the state has actually moved.
 *
 * Four properties, for every chapter including the one this file did not write:
 *
 *   - **ids are unique and stable.** The panel keeps a selection and the arrow
 *     keeps a target across frames; an id that changes with the state throws both
 *     away at the moment the player is looking at them.
 *   - **`done` follows the sim.** Driven, never faked: no test in here constructs
 *     a `Task`.
 *   - **`at` is floor.** An arrow that lands inside a wall — or outside the map —
 *     is worse than no arrow, which is what `Task.at` being optional is for.
 *   - **no line is an answer.** Checked against the chapter's OWN secrets, read
 *     out of its state: chapter 1's keypad code, chapter 2's WiFi password, and
 *     the booth chapter 3 hides the keynote speaker behind.
 */

import { describe, expect, it } from 'vitest';

import {
  CRATE_DELIVERY,
  DT_MAX,
  GF,
  createGame,
  type BreakfastState,
  type DebugGame,
  type ExpoState,
  type KeynoteState,
  type NightState,
  type RobotKind,
  type Task,
  type Vec2,
} from '../src/sim';

import { bot, passable, playToStairGate, walkTo } from './pilot';
// The ladder's own reader, so the test walks a hint exactly as `H` does.
import { hintLines } from '../src/render/hud';

/* ------------------------------------------------------------------- harness */

const SEED = 20260930;

/** Headless: no chapter cards, so `update` never waits on a keypress. */
const mk = (chapter: number): DebugGame => createGame({ seed: SEED, chapter, cards: false });

function steps(g: DebugGame, n: number): void {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
}

const tasks = (g: DebugGame): Task[] => g.snapshot().tasks;
const ids = (g: DebugGame): string[] => tasks(g).map((t) => t.id);

function row(g: DebugGame, id: string): Task {
  const t = tasks(g).find((o) => o.id === id);
  if (!t) throw new Error(`no task '${id}' — the list is ${ids(g).join(', ')}`);
  return t;
}

/** The sim's own canvas, from the header of `src/sim/types.ts`. */
const MAP = { w: 1900, h: 700 };

/** How far from the arrow a robot may have to stand, sim px — see `wellFormed`. */
const ARROW_SLACK = 34;

/** Is there floor at `p`, or within `ARROW_SLACK` of it, that this robot fits on? */
function reachable(g: DebugGame, kind: RobotKind, p: Vec2): boolean {
  const walls = g.debug.walls();
  const b = bot(g, kind);
  if (passable(walls, b, p.x, p.y)) return true;
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    for (const r of [ARROW_SLACK / 2, ARROW_SLACK]) {
      if (passable(walls, b, p.x + Math.cos(th) * r, p.y + Math.sin(th) * r)) return true;
    }
  }
  return false;
}

/**
 * Everything that must be true of a list whenever it is read.
 *
 * `where` names the moment, because the failure that matters is the one that only
 * happens after twenty seconds of play.
 */
function wellFormed(g: DebugGame, where: string): void {
  const list = tasks(g);
  expect(list.length, `${where}: no tasks at all`).toBeGreaterThan(0);
  expect(new Set(list.map((t) => t.id)).size, `${where}: duplicate ids in ${ids(g).join(', ')}`).toBe(list.length);
  for (const t of list) {
    const at = `${where} · ${t.id}`;
    expect(t.id, `${at}: empty id`).not.toBe('');
    expect(t.text.trim(), `${at}: empty text`).not.toBe('');
    expect(t.text, `${at}: the sim is writing markup`).not.toMatch(/[<>]/);
    expect(typeof t.done, `${at}: done is not a flag`).toBe('boolean');
    // A hint may be several lines now — a gate in front of the task, then the
    // task (`Task.hint`) — and every one of them has to be a real line.
    for (const line of hintLines(t)) expect(line.trim(), `${at}: empty hint`).not.toBe('');
    if (t.n !== undefined) {
      expect(t.of, `${at}: n without of`).toBeDefined();
      expect(t.n, `${at}: negative count`).toBeGreaterThanOrEqual(0);
      expect(t.n, `${at}: n past of (${t.n}/${t.of})`).toBeLessThanOrEqual(t.of as number);
    }
    if (t.at) {
      expect(t.at.x, `${at}: arrow off the west edge`).toBeGreaterThan(0);
      expect(t.at.x, `${at}: arrow off the east edge`).toBeLessThan(MAP.w);
      expect(t.at.y, `${at}: arrow off the north edge`).toBeGreaterThan(0);
      expect(t.at.y, `${at}: arrow off the south edge`).toBeLessThan(MAP.h);
      /*
       * ...and it is somewhere the robot it is for can actually GET TO. `who` is
       * who the job needs; a task that needs nobody in particular is checked
       * against the smallest of them, which is the weakest honest claim.
       *
       * Floor under the arrow, or floor within `ARROW_SLACK` of it — because some
       * of what a player is sent to is bolted to a wall rather than standing on
       * the ground, and chapter 1's keypad is the case in point: its rect is the
       * pad ON the corridor wall, so the middle of it is inside the slab and the
       * robot types from in front of it. An arrow into the face of the thing you
       * are being sent to is not the failure this is hunting. An arrow into the
       * middle of a room-sized wall, or off the map, is.
       */
      // EVERY robot the task names, not just the first: `who` is a list now
      // (a two-colour mix needs both lamps), and a place only one of them can
      // reach is a task only one of them can do.
      const crew: readonly RobotKind[] = t.who ?? ['voxxy'];
      for (const kind of crew) {
        expect(
          reachable(g, kind, t.at),
          `${at}: the arrow sends ${kind} somewhere they cannot get to, ${Math.round(t.at.x)},${Math.round(t.at.y)}`,
        ).toBe(true);
      }
    }
  }
}

/**
 * Every line the panel could have shown during a run, collected as it is played.
 *
 * The answer-leak checks run against THIS rather than against the final list: a
 * hint that spells the password while the terminal is still asking for it has
 * already done the damage by the time the router is online.
 */
function collect(g: DebugGame, into: string[]): void {
  for (const t of tasks(g)) {
    into.push(t.text);
    // Every line, not just the first: an answer leaked on the second rung of the
    // ladder is leaked.
    for (const line of hintLines(t)) into.push(line);
  }
}

const mentions = (lines: string[], needle: string): string[] =>
  lines.filter((l) => l.toLowerCase().includes(needle.toLowerCase()));

/* ================================================================== the shape */

describe('the task list', () => {
  it('is published, unique and well formed by every chapter, before anything has happened', () => {
    for (const n of [1, 2, 3, 4]) {
      const g = mk(n);
      steps(g, 2);
      wellFormed(g, `chapter ${n} at setup`);
    }
  });

  /**
   * The slack in `wellFormed` is for chapter 1's keypad, which is a pad ON a wall.
   * Nothing else in the game needs it: every address chapters 2, 3 and 4 publish
   * is floor, chosen to be inside the reach that chapter already enforces for the
   * prop, so "walk to the arrow" is "walk to the job" with nothing left over.
   */
  it('puts every chapter 2, 3 and 4 arrow on floor the robot can stand on', () => {
    for (const n of [2, 3, 4]) {
      const g = mk(n);
      steps(g, 2);
      for (const t of tasks(g)) {
        if (!t.at) continue;
        const crew: readonly RobotKind[] = t.who ?? ['voxxy'];
        for (const kind of crew) {
          expect(
            passable(g.debug.walls(), bot(g, kind), t.at.x, t.at.y),
            `chapter ${n} · ${t.id}: ${kind} cannot stand on ${Math.round(t.at.x)},${Math.round(t.at.y)}`,
          ).toBe(true);
        }
      }
    }
  });

  it('orders itself so that H always has an unfinished row to hint at', () => {
    for (const n of [1, 2, 3, 4]) {
      const g = mk(n);
      steps(g, 2);
      const first = tasks(g).find((t) => !t.done);
      expect(first, `chapter ${n} opens with everything already done`).toBeDefined();
      expect(first?.hint, `chapter ${n}'s first job has no hint for a stuck player`).toBeDefined();
    }
  });
});

/* =============================================================== chapter 1 */

describe('chapter 1 — night', () => {
  it('flips a clue row the moment the mix lights, and keeps every id', () => {
    const g = mk(1);
    const night = (): NightState => g.debug.chapter() as NightState;
    const before = ids(g);
    expect(before).toHaveLength(5);
    expect(tasks(g).every((t) => !t.done)).toBe(true);

    // The foyer mix: Voxxy's beam and Droid's pool on the same spot.
    const c1 = night().clues[0];
    g.debug.place('voxxy', c1.x - 29, c1.y, 0);
    g.debug.place('droid', c1.x, c1.y);
    steps(g, 2);
    expect(night().clues[0].found, 'the foyer mix never lit').toBe(true);
    expect(ids(g), 'chapter 1 renamed its rows when one of them landed').toEqual(before);
    const lit = tasks(g).filter((t) => t.done);
    expect(lit, 'the found clue did not tick').toHaveLength(1);
    wellFormed(g, 'chapter 1 with one clue lit');
  });

  it('counts the keypad in digits and opens on the code', () => {
    const g = mk(1);
    const code = (g.debug.chapter() as NightState).code;
    g.debug.select('voxxy');
    g.debug.place('voxxy', 585, 330);
    steps(g, 1);
    const pad = () => row(g, 'code');
    expect(pad().n).toBe(0);
    expect(pad().of).toBe(4);
    g.key(`Digit${code[0]}`);
    expect(pad().n, 'the keypad row does not count what has been typed').toBe(1);
    expect(pad().done).toBe(false);
    for (const d of code.slice(1)) g.key(`Digit${d}`);
    expect((g.debug.chapter() as NightState).fireOpen).toBe(true);
    expect(pad().done, 'the fire door is open and the row still says it is not').toBe(true);
    wellFormed(g, 'chapter 1 with the fire door open');
  });

  it('never puts a digit of the code in a line', () => {
    const g = mk(1);
    const code = (g.debug.chapter() as NightState).code;
    const lines: string[] = [];
    collect(g, lines);
    // ...and again with a clue lit, because the hints change with the state.
    const c1 = (g.debug.chapter() as NightState).clues[0];
    g.debug.place('voxxy', c1.x - 29, c1.y, 0);
    g.debug.place('droid', c1.x, c1.y);
    steps(g, 2);
    collect(g, lines);
    expect(lines.length).toBeGreaterThan(5);
    expect(mentions(lines, code), 'a chapter 1 line hands over the whole code').toEqual([]);
    for (const line of lines) {
      expect(line, `a chapter 1 line has a digit in it, and the answer is four digits: "${line}"`).not.toMatch(/\d/);
    }
  });
});

/* =============================================================== chapter 2 */

const expo = (g: DebugGame): ExpoState => g.debug.chapter() as ExpoState;
/** The cabinet's south face, from `GF` — the point `ch2-expo.ts` measures from. */
const HUB: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };
const PANEL: Vec2 = { x: GF.panel.x + 13, y: GF.panel.y + 8 };

/**
 * The chain, played the long way round: breakers, Biggy on the cabinet, Droid up
 * on Biggy for the label inside the lid, Droid at the terminal, then the cable.
 *
 * It stops short of the roller door on purpose — the chapter hands over to
 * chapter 3 on the frame the shutter goes, so the store row can only be watched
 * in a run that has NOT finished the printer. That one is `rollerRun` below.
 */
function chainRun(g: DebugGame, lines: string[]): void {
  g.debug.select('droid');
  g.debug.place('droid', PANEL.x + 20, PANEL.y + 30);
  g.key('KeyE');
  expect(row(g, 'power').n, 'the power row does not count the handles').toBe(1);
  expect(row(g, 'power').done).toBe(false);
  collect(g, lines);
  for (let i = 0; i < 2; i++) g.key('KeyE');
  expect(expo(g).power).toBe(true);
  expect(row(g, 'power').done, 'the supply is on and the row still says it is not').toBe(true);
  expect(row(g, 'power').n).toBe(row(g, 'power').of);
  expect(row(g, 'router').done, 'the breakers ticked the router off too').toBe(false);
  collect(g, lines);
  wellFormed(g, 'chapter 2 with the power on');

  g.debug.select('biggy');
  g.debug.place('biggy', HUB.x, HUB.y + 30);
  g.key('KeyE');
  expect(expo(g).router.cabinetOpen, 'Biggy never got the cabinet open').toBe(true);
  expect(row(g, 'router').done).toBe(false);
  expect(row(g, 'router').who, 'the cabinet is open and the row still wants Biggy').toBeUndefined();
  collect(g, lines);
  wellFormed(g, 'chapter 2 with the cabinet open');

  // Droid up on Biggy reads the label taped inside the lid.
  g.debug.place('biggy', 300, 640);
  g.debug.place('droid', 284, 640);
  g.debug.select('droid');
  g.key('KeyE');
  expect(bot(g, 'droid').mounted).toBe(true);
  g.debug.place('biggy', HUB.x, HUB.y + 20);
  steps(g, 1);
  g.key('KeyE');
  expect(expo(g).router.known, 'Droid never read the label').toBe(true);
  expect(row(g, 'router').done, 'knowing the password is not being on the air').toBe(false);
  collect(g, lines);

  g.key('KeyE');
  expect(bot(g, 'droid').mounted).toBe(false);
  g.debug.select('droid');
  g.debug.place('droid', HUB.x, HUB.y + 20);
  g.key('KeyE');
  expect(expo(g).router.online, 'the router never came up').toBe(true);
  expect(row(g, 'router').done, 'the router is on the air and the row still says it is not').toBe(true);
  collect(g, lines);
  wellFormed(g, 'chapter 2 with the router online');

  const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
  const printer = { x: GF.printer.x + 10, y: GF.printer.y + 6 };
  expect(walkTo(g, 'voxxy', { x: rack.x, y: rack.y - 24 })).toBe(true);
  g.key('KeyE');
  expect(expo(g).cable.carrying, 'Voxxy never took the cable end').toBe(true);
  const carrying = row(g, 'cable');
  expect(carrying.done).toBe(false);
  expect(carrying.at, 'the cable row keeps pointing at the rack she is holding').toBeDefined();
  expect(carrying.at?.x, 'the arrow does not move to the far end of the run').toBeGreaterThan(1000);
  collect(g, lines);
  wellFormed(g, 'chapter 2 with the cable in hand');

  expect(walkTo(g, 'voxxy', { x: printer.x, y: printer.y + 34 })).toBe(true);
  g.key('KeyE');
  expect(expo(g).printerOnline).toBe(true);
  expect(row(g, 'cable').done, 'the printer has its wire and the row still says it has not').toBe(true);
  expect(row(g, 'store').done, 'the cable opened the store').toBe(false);
  collect(g, lines);
  wellFormed(g, 'chapter 2 with the printer online');
}

describe('chapter 2 — expo', () => {
  it('runs the chain and ticks power, router and cable as each link lands', { timeout: 30000 }, () => {
    const g = mk(2);
    const before = ids(g);
    expect(before).toEqual(['power', 'router', 'cable', 'store']);
    const lines: string[] = [];
    chainRun(g, lines);
    expect(ids(g), 'chapter 2 renamed its rows on the way through').toEqual(before);
    expect(g.snapshot().chapter, 'the chapter handed over before the store was open').toBe(2);
  });

  it('ticks the store row when Biggy goes through the shutter', () => {
    const g = mk(2);
    // Voxxy takes hold of him and runs him the length of the top lane.
    g.debug.select('voxxy');
    g.debug.place('biggy', 400, 160);
    g.debug.place('voxxy', 372, 160);
    g.setStick(1, 0);
    for (let i = 0; i < 400 && !expo(g).rollerBroken; i++) g.update(DT_MAX);
    g.setStick(0, 0);
    expect(expo(g).rollerBroken, 'Biggy never got through the shutter').toBe(true);
    expect(g.snapshot().chapter, 'the chapter left before the printer was online').toBe(2);
    expect(row(g, 'store').done, 'the store is open and the row still says it is shut').toBe(true);
    expect(row(g, 'power').done, 'the shutter threw the breakers').toBe(false);
    wellFormed(g, 'chapter 2 with the store open');
  });

  it('takes the arrow away while the terminal has the keyboard', () => {
    const g = mk(2);
    g.debug.select('droid');
    g.debug.place('droid', PANEL.x + 20, PANEL.y + 30);
    for (let i = 0; i < 3; i++) g.key('KeyE');
    g.debug.select('biggy');
    g.debug.place('biggy', HUB.x, HUB.y + 30);
    g.key('KeyE');
    expect(row(g, 'router').at, 'nothing to walk to while the cabinet is shut').toBeDefined();

    g.debug.select('voxxy');
    g.debug.place('voxxy', HUB.x, HUB.y + 20);
    g.key('KeyE');
    expect(g.snapshot().typing, 'the terminal never took the keyboard').toBe(true);
    expect(
      row(g, 'router').at,
      'the password is typed, not walked to — the arrow points at the robot doing the typing',
    ).toBeUndefined();
    wellFormed(g, 'chapter 2 at the open prompt');
  });

  it('never puts the WiFi password in a line', { timeout: 30000 }, () => {
    const g = mk(2);
    const lines: string[] = [];
    collect(g, lines);
    chainRun(g, lines);
    /*
     * The password out of the chapter's own mouth: `authorise` fills the typed
     * buffer with the whole of it, so the secret this asserts against is the
     * secret the chapter actually holds rather than a copy of it kept in a test.
     */
    const password = expo(g).router.typed;
    expect(password.length, 'the chapter has no password to leak').toBeGreaterThan(8);
    expect(mentions(lines, password), 'a chapter 2 line hands over the password').toEqual([]);
    // ...and not the half of it that is not also the name of the conference.
    expect(mentions(lines, password.slice(6)), 'a chapter 2 line hands over most of the password').toEqual([]);
  });
});

/* =============================================================== chapter 3 */

const breakfast = (g: DebugGame): BreakfastState => g.debug.chapter() as BreakfastState;

describe('chapter 3 — breakfast', () => {
  it("ticks all five of Stephan's rows, and never counts the swag", () => {
    const g = mk(3);
    const before = ids(g);
    expect(before).toEqual(['ladle', 'soup', 'speaker', 'beer', 'stairs']);
    expect(tasks(g).every((t) => !t.done), 'chapter 3 opens with something already done').toBe(true);

    // The shared choreography: ladle, soup, the speaker, the delivery — and the
    // top-shelf sticker on the way past, which is swag and is not a job.
    playToStairGate(g);

    expect(ids(g), 'chapter 3 renamed its rows on the way through').toEqual(before);
    expect(g.snapshot().swag.length, 'this run won no swag, so it cannot prove swag is uncounted').toBeGreaterThan(0);
    expect(tasks(g), 'a bit of optional swag turned into a row on the checklist').toHaveLength(5);
    for (const t of tasks(g)) {
      expect(t.done, `${t.id} is still open with the staircase already unhooked`).toBe(true);
      expect(`${t.text} ${t.hint ?? ''}`, `${t.id} mentions the booth games`).not.toMatch(
        /swag|sticker|duck|shuffle|regex/i,
      );
    }
    expect(row(g, 'beer').n).toBe(CRATE_DELIVERY);
    wellFormed(g, 'chapter 3 with the staircase open');
  });

  it('ticks the ladle on its own, and counts the crates as they are stacked', () => {
    const g = mk(3);
    g.debug.select('droid');
    g.debug.place('droid', 176, 150);
    g.key('KeyE');
    expect(breakfast(g).ladle, 'Droid never got the ladle').toBe(true);
    expect(row(g, 'ladle').done, 'the ladle is in hand and the row says it is on the shelf').toBe(true);
    expect(row(g, 'soup').done, 'the ladle delivered the soup').toBe(false);
    wellFormed(g, 'chapter 3 with the ladle');

    const stack = g.snapshot().props.find((p) => p.kind === 'dropzone' && (p.label ?? '').includes('beer'));
    expect(stack).toBeDefined();
    const at = { x: (stack as { x: number }).x, y: (stack as { y: number }).y };
    const c = breakfast(g).beer.loose[0];
    g.debug.select('biggy');
    g.debug.place('biggy', c.x, c.y + 12);
    g.key('KeyE');
    expect(row(g, 'beer').n, 'a crate on his back is not a crate on the bar').toBe(0);
    g.debug.place('biggy', at.x, at.y);
    g.key('KeyE');
    expect(breakfast(g).beer.stacked).toBe(1);
    expect(row(g, 'beer').n, 'the beer row does not count what is on the bar').toBe(1);
    expect(row(g, 'beer').of).toBe(CRATE_DELIVERY);
    expect(row(g, 'beer').done).toBe(false);
    wellFormed(g, 'chapter 3 with one crate delivered');
  });

  it('keeps the hiding speaker off the arrow, and never names their booth', () => {
    const g = mk(3);
    const booth = breakfast(g).speaker.booth;
    expect(booth.length).toBeGreaterThan(0);
    const lines: string[] = [];
    collect(g, lines);
    expect(row(g, 'speaker').at, 'the arrow gives away where the speaker is hiding').toBeUndefined();

    // Voxxy walks up to the booth they are behind and talks them out.
    const hiding = GF.booths.find((b) => b.name === booth);
    expect(hiding).toBeDefined();
    const b = hiding as { x: number; y: number; w: number; h: number };
    g.debug.select('voxxy');
    g.debug.place('voxxy', b.x + b.w / 2, b.y + b.h + 38);
    steps(g, 1);
    g.key('KeyE');
    expect(breakfast(g).speaker.following, 'the speaker is not following Voxxy').toBe(true);
    collect(g, lines);
    const led = row(g, 'speaker');
    expect(led.done).toBe(false);
    expect(led.at, 'the speaker is following and there is still nowhere to lead them').toBeDefined();
    expect(led.at?.x, 'the arrow does not point at Stephan').toBeGreaterThan(1200);
    expect(mentions(lines, booth), `a chapter 3 line names the booth (${booth})`).toEqual([]);
    wellFormed(g, 'chapter 3 with the speaker in tow');
  });
});

/* =============================================================== chapter 4 */

describe('chapter 4 — keynote', () => {
  it('ticks the cake, the banner, the spotlights and the stage, and counts the two that count', () => {
    const g = mk(4);
    const keynote = (): KeynoteState => g.debug.chapter() as KeynoteState;
    const before = ids(g);
    expect(before).toEqual(['cake', 'banner', 'spots', 'stage']);

    const mark = g.snapshot().props.find((p) => p.kind === 'cake-mark');
    expect(mark).toBeDefined();
    const markX = mark!.x + (mark!.w ?? 0) / 2;
    expect(g.debug.placeProp('cake', markX, mark!.y + 58)).toBe(true);
    g.debug.select('biggy');
    g.debug.place('biggy', markX, mark!.y + 98);
    g.setStick(0, -1);
    for (let i = 0; i < 200 && !keynote().cake; i++) g.update(DT_MAX);
    g.setStick(0, 0);
    expect(keynote().cake, 'the cake never reached its mark').toBe(true);
    expect(row(g, 'cake').done, 'the cake is on the mark and the row says it is not').toBe(true);
    wellFormed(g, 'chapter 4 with the cake on its mark');

    // One hook, then the other: the count moves and the arrow moves with it.
    const hooks = g.snapshot().props.filter((p) => p.kind === 'banner-hook');
    expect(hooks).toHaveLength(2);
    g.debug.select('droid');
    const firstArrow = row(g, 'banner').at;
    g.debug.place('droid', hooks[0].x, hooks[0].y + 22);
    g.key('KeyE');
    expect(keynote().hooks).toBe(1);
    expect(row(g, 'banner').n, 'the banner row does not count the hooks').toBe(1);
    expect(row(g, 'banner').done, 'one end of a banner is not a banner').toBe(false);
    expect(row(g, 'banner').at, 'the arrow still points at the hook that is done').not.toEqual(firstArrow);
    wellFormed(g, 'chapter 4 with one hook hung');
    g.debug.place('droid', hooks[1].x, hooks[1].y + 22);
    g.key('KeyE');
    expect(row(g, 'banner').done).toBe(true);

    // The spotlights only take in order, and the arrow only ever points at the
    // one that is waiting.
    const spots = g.snapshot().props.filter((p) => p.kind === 'spotlight');
    expect(spots).toHaveLength(4);
    g.debug.select('voxxy');
    for (const s of spots) {
      const arrow = row(g, 'spots').at;
      expect(arrow, 'no spotlight to point at').toBeDefined();
      expect({ x: arrow?.x, y: arrow?.y }, 'the arrow is not on the spotlight that is next').toEqual({
        x: s.x,
        y: s.y,
      });
      g.debug.place('voxxy', s.x, s.y);
      steps(g, 1);
    }
    expect(keynote().spots).toBe(4);
    expect(row(g, 'spots').done).toBe(true);
    expect(row(g, 'spots').n).toBe(4);
    expect(keynote().ready).toBe(true);
    expect(row(g, 'stage').done, 'the stage row ticked with nobody on it').toBe(false);
    wellFormed(g, 'chapter 4 with the stage ready');

    const stage = g.snapshot().props.find((p) => p.kind === 'stage');
    const sy = stage!.y + (stage!.h ?? 0) / 2;
    g.debug.place('voxxy', stage!.x + 20, sy);
    steps(g, 1);
    expect(row(g, 'stage').n, 'the stage row does not count who is on it').toBe(1);
    g.debug.place('droid', stage!.x + 90, sy);
    g.debug.place('biggy', stage!.x + 160, sy);
    steps(g, 1);
    expect(g.snapshot().phase).toBe('done');
    expect(row(g, 'stage').done, 'all three are on the stage and the row says they are not').toBe(true);
    expect(row(g, 'stage').n).toBe(3);
    expect(ids(g), 'chapter 4 renamed its rows on the way through').toEqual(before);
  });

  it('has no row for the clock', () => {
    const g = mk(4);
    steps(g, 40);
    expect(tasks(g)).toHaveLength(4);
    for (const t of tasks(g)) {
      expect(
        `${t.text} ${t.hint ?? ''}`,
        `${t.id} turns the crowd clock into something to tick off`,
      ).not.toMatch(/seconds?\b|clock|timer|countdown|seated|doors in/i);
    }
    // The countdown is published where a countdown belongs: on the crowd prop.
    const crowd = g.snapshot().props.find((p) => p.kind === 'crowd');
    expect(crowd, 'the chapter publishes no crowd clock at all').toBeDefined();
  });
});
