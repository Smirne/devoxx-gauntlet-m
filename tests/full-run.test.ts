/**
 * ONE CLEAN FULL RUN — chapter 1 to the final card, in a single game.
 *
 * `GAUNTLET.md` Stage 3 has a ship gate the rest of the suite does not meet:
 * *"Nothing ships without at least one clean full run."* Every other test in this
 * repo starts the chapter it is about — `createGame({chapter: 3})` — so all four
 * chapters are covered and the SEAMS between them are covered only one at a time,
 * by `tests/cutscene-pace.test.ts`. Nothing anywhere plays the game.
 *
 * This does. One `createGame`, no `startChapter`, no `skipChapter`: chapter 1 is
 * solved, its cutscene runs, chapter 2 arrives on its own and is solved, and so on
 * to the opening video and the score card. What it is really watching for is
 * state that leaks or fails to cross a seam — a score counter that resets, a robot
 * that arrives on the next floor inside a wall, a chapter that starts before the
 * last one has finished handing over.
 *
 * It is NOT a pacing measurement for chapters 1–3: their choreographies still
 * place robots where a solved puzzle needs them, so that part of the clock is the
 * sim's, not a player's. Chapter 4 is driven on the stick throughout — the same
 * drive `tests/chapter4-length.test.ts` measures — so its leg is a player's time.
 */

import { describe, expect, it } from 'vitest';

import {
  DT_MAX,
  GF,
  createGame,
  type DebugGame,
  type ExpoState,
  type KeynoteState,
  type NightState,
  type Vec2,
} from '../src/sim';
import { bot, driveChapter4, playToStairGate, walkTo } from './pilot';

/**
 * The run's seed. The chapter routines are exported so the same run can be driven
 * through the real build, frame by frame (`tools/playthrough/`).
 */
export const SEED = 20260930;

const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};

/** Run until `done()`, or fail loudly with what was being waited for. */
export function until(g: DebugGame, what: string, done: () => boolean, budget = 900): void {
  for (let i = 0; i < budget && !done(); i++) g.update(DT_MAX);
  expect(done(), `the run never got to: ${what}`).toBe(true);
}

/* ------------------------------------------------------------- chapter 1 --- */

/** Voxxy at the fire-door keypad, the chapter's own code, and the stairs down. */
export function playChapter1(g: DebugGame): void {
  const code = (g.debug.chapter() as NightState).code;
  g.debug.select('voxxy');
  g.debug.place('voxxy', 585, 330);
  steps(g, 1);
  for (const d of code) g.key(`Digit${d}`);
  expect((g.debug.chapter() as NightState).fireOpen, 'the fire door stayed shut').toBe(true);
  // The chapter holds the corridor while the leaves swing, then hands over.
  until(g, 'the cutscene down to the exhibition hall', () => g.snapshot().chapter === 2);
  expect(g.snapshot().floor).toBe('down');
}

/* ------------------------------------------------------------- chapter 2 --- */

const HUB: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };
const PANEL: Vec2 = { x: GF.panel.x + 13, y: GF.panel.y + 8 };

/** Breakers, cabinet, the label read off Biggy's shoulders, the cable, the door. */
export function playChapter2(g: DebugGame): void {
  const expo = (): ExpoState => g.debug.chapter() as ExpoState;

  g.debug.select('droid');
  g.debug.place('droid', PANEL.x + 20, PANEL.y + 30);
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
  until(g, 'the roller door and the walk up to the lunch rush', () => g.snapshot().chapter === 3, 600);
  g.setStick(0, 0);
}

/* ------------------------------------------------------------- chapter 4 --- */

/**
 * Cake, the #DEVOXX sign, spotlights, everyone on the boards, and the opening video out.
 *
 * DRIVEN, not placed. Michele, 29 Sep 2026, on the old choreography, which put the
 * cake beside its mark and every robot on its spot: *"1.7 seconds for chap 4?"* —
 * and the filmed playthrough showed nothing happening. So this is the stick, one
 * robot at a time, through room 8's one door and up its real aisles: the same
 * drive `tests/chapter4-length.test.ts` measures (`driveChapter4` in the pilot).
 * The only debug calls are `select` (keys 1/2/3) and the read-only `chapter()`.
 */
export function playChapter4(g: DebugGame, onLeg?: (name: string, seconds: number) => void): void {
  const key = (): KeynoteState => g.debug.chapter() as KeynoteState;
  driveChapter4(g, onLeg);
  expect(key().cake, 'the cake never reached its mark').toBe(true);
  expect(key().sign, 'the #DEVOXX sign never went up').toBe('#DEVOXX');
  expect(key().spots, 'the spotlights never all lit').toBe(4);
  expect(key().ready, 'the stage never came ready').toBe(true);
  expect(g.snapshot().reel, 'the opening video never started').not.toBeNull();
}

/* ============================================================== the full run */

describe('a full run', () => {
  it('plays chapter 1 through to the final card in one game, with nothing skipped', () => {
    const g = createGame({ seed: SEED, cards: false });
    expect(g.snapshot().chapter, 'a new game does not start at chapter 1').toBe(1);

    const legs: Array<[string, number]> = [];
    let frames = 0;
    const leg = (name: string, run: () => void): void => {
      const before = frames;
      const count = (): void => {
        frames++;
      };
      const update = g.update.bind(g);
      g.update = (dt: number): void => {
        count();
        update(dt);
      };
      run();
      g.update = update;
      legs.push([name, (frames - before) * DT_MAX]);
    };

    leg('1 · night — the code and the fire door', () => playChapter1(g));
    leg('2 · expo — power, router, cable, roller door', () => playChapter2(g));
    leg('3 · breakfast — soup, speaker, beer', () => {
      playToStairGate(g);
      until(g, 'the walk back up to Room 8', () => g.snapshot().chapter === 4);
    });
    const ch4: Array<[string, number]> = [];
    leg('4 · keynote — cake, sign, lights, stage', () => playChapter4(g, (n, s) => ch4.push([`    ↳ ${n}`, s])));
    legs.push(...ch4);
    leg('the opening video', () => {
      until(g, 'the end of the opening video', () => g.snapshot().reel === null, 3000);
    });

    // eslint-disable-next-line no-console
    console.log(
      '\none full run, chapter 1 to the card:\n' +
        legs.map(([n, s]) => `  ${s.toFixed(1).padStart(6)}s  ${n}`).join('\n') +
        `\n  ${(frames * DT_MAX).toFixed(1).padStart(6)}s  TOTAL sim clock\n`,
    );

    expect(g.snapshot().phase, 'the run did not end').toBe('done');
    expect(g.snapshot().card, 'no final card').toContain('Keynote starts');
    expect(g.snapshot().score.points, 'the run scored nothing').toBeGreaterThan(0);
    expect(g.snapshot().card, 'a chapter was skipped').not.toContain('skipped');
  });
});
