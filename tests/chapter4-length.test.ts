/**
 * HOW LONG CHAPTER 4 ACTUALLY TAKES, measured rather than felt.
 *
 * Michele, 28 Sep 2026, twice: *"Chapter 4 runs about six minutes"*, then
 * *"measure your run. I'd say 3 minutes?"*
 *
 * What makes this chapter long is not the puzzle, it is the STICK: `stepAll`
 * hands it to the selected robot and zeroes the other two, so three jobs spread
 * across a 30 m room cannot be done in parallel. And the room is not open floor
 * — three seat blocks are walls, so everything happens down two aisles and
 * across the strip behind them. A player walks Voxxy to four spotlights in two
 * different aisles, switches, walks Droid the width of the room twice, switches,
 * shoves the cake in from the corridor and up an aisle, and then puts whoever is
 * left onto the stage. One robot at a time, always.
 *
 * So this drives it exactly that way: one stick, in series, on the robots' own
 * legs, through the room's one door and along the real aisles, with no
 * teleporting anywhere. What comes out is the floor under a real playthrough — a
 * player who knows the solution and never stops to think — and the chapter's
 * pacing budget is asserted against it.
 *
 * The drive itself is `driveChapter4` in `tests/pilot.ts`, shared with
 * `tests/full-run.test.ts` (and through it the filmed playthrough), so the chapter
 * the full run plays is the chapter this file times.
 */

import { describe, expect, it } from 'vitest';

import { createGame, type DebugGame } from '../src/sim';
import { driveChapter4 } from './pilot';

const SEED = 20260930;
const mk = (): DebugGame => createGame({ seed: SEED, chapter: 4, cards: false }) as DebugGame;

/**
 * The budget, seconds of sim clock.
 *
 * Michele's own target is three minutes for a run with thinking in it, so the
 * floor — no thinking, no mistakes, no reading — has to come in well under that,
 * or nobody can finish the chapter in three minutes. 150s is half his figure,
 * which leaves a player the other half to be a person in.
 */
const BUDGET = 150;

describe('chapter 4, driven on one stick', () => {
  it('is solvable well inside three minutes, and says where the time goes', () => {
    const g = mk();
    const legs: Array<[string, number]> = [];
    driveChapter4(g, (name, secs) => legs.push([name, secs]));
    const total = legs.reduce((s, [, secs]) => s + secs, 0);

    // eslint-disable-next-line no-console
    console.log(
      '\nchapter 4, one stick, no thinking:\n' +
        legs.map(([n, secs]) => `  ${secs.toFixed(1).padStart(6)}s  ${n}`).join('\n') +
        `\n  ${total.toFixed(1).padStart(6)}s  TOTAL, + ${Math.round(g.snapshot().reel?.len ?? 0)}s of video\n`,
    );

    expect(g.snapshot().reel, 'the chapter never reached its ending').not.toBeNull();
    expect(total, 'chapter 4 has grown past its pacing budget').toBeLessThan(BUDGET);
  });
});
