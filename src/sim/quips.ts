/**
 * quips.ts — the running joke that belongs to the physics rather than to a chapter.
 *
 * Michele, 26 Sep 2026, picking from the list of cheap extras: *"Let's try 5 6 7
 * too."* Number 7 was **"GC pause" when Biggy finally stops**.
 *
 * It lives here and not in a chapter because the thing it is about — Biggy taking
 * half a room to shed his momentum — is true in all four of them, and because a
 * joke that only fires in chapter 2 is not a running joke. `game.ts` ticks it after
 * the chapter's own update and hands it the only two things it needs: the robots and
 * a way to speak.
 *
 * The rule it enforces on itself is the whole reason it is bearable: it needs a real
 * run-up (`WIND_UP` seconds above `FAST` of his own top speed) and it fires **once a
 * chapter**. A gag on a timer is a gag; a gag every time Biggy stops is a bug.
 */

import { STOP_SNAP } from './constants';
import type { Bot } from './types';

/** Fraction of Biggy's own top speed that counts as "running". */
const FAST = 0.55;
/** Seconds he has to hold that before stopping is worth remarking on. */
const WIND_UP = 1.2;

/**
 * The lines, in order. Java's stop-the-world pause is the joke every room at Devoxx
 * gets without being told, and Biggy is the only robot in the building it describes.
 */
const LINES: readonly string[] = [
  'Biggy: that was a <b>GC pause</b>. Stop-the-world. I am assured it is normal.',
  'Biggy: <b>GC pause</b>. Everything stopped for a moment. Everything is fine now.',
  'Biggy: <b>stop-the-world</b> again. Somebody could really tune my heap.',
];

export interface Quips {
  /**
   * One frame. `say` is the chapter's toast — this never builds one itself — and
   * `clear` says whether the screen is free to be spoken on.
   *
   * The two are separate on purpose, and it is the whole difference between a gag
   * you can find and one you cannot. Michele, replaying: *"I can't get biggy to
   * roll"*. He could; what he could not do was HEAR it. The first cut skipped the
   * tick entirely while any toast was up, so a wall bump — which is exactly how a
   * heavy robot's run ends — both ate the wind-up and swallowed the punchline. Now
   * the wind-up is always counted and the line WAITS for a clear screen.
   */
  tick(bots: readonly Bot[], dt: number, say: (text: string) => void, clear: boolean): void;
  /** A new chapter: the gag is available again, and the wind-up starts over. */
  reset(): void;
}

/**
 * How long a line that has been earned waits for a clear screen, seconds.
 *
 * Long enough to outlast the "why am I blocked" toast that a heavy robot's run
 * usually ends with (2.5 s), short enough that the joke still belongs to the stop
 * it is about rather than turning up a room later.
 */
const HOLD = 4;

export function makeQuips(): Quips {
  let wound = 0;
  let spent = false;
  let line = 0;
  /** Seconds left to find a gap to speak in, or 0 when there is nothing to say. */
  let waiting = 0;

  return {
    tick(bots, dt, say, clear): void {
      const b = bots.find((o) => o.kind === 'biggy');
      if (!b || b.mounted) return;

      // An earned line, looking for a gap. This runs before the speed test so a
      // player who sets off again does not lose the line he already earned.
      if (waiting > 0) {
        waiting = Math.max(0, waiting - dt);
        if (clear) {
          waiting = 0;
          say(LINES[line % LINES.length]);
          line++;
        }
      }

      const sp = Math.hypot(b.vx, b.vy);
      if (sp > b.max * FAST) {
        wound += dt;
        return;
      }
      // Still rolling: neither winding up nor stopped. Hold what he has.
      if (sp > STOP_SNAP) return;
      if (!spent && wound >= WIND_UP) {
        spent = true;
        // Say it now if the screen is free, or queue it if something else is
        // talking — the thing he just ran into, most likely.
        if (clear) {
          say(LINES[line % LINES.length]);
          line++;
        } else {
          waiting = HOLD;
        }
      }
      wound = 0;
    },
    reset(): void {
      wound = 0;
      spent = false;
      waiting = 0;
    },
  };
}
