/**
 * A FULL ROOM IS A NOISE, NOT A GAME OVER.
 *
 * Michele, 28 Sep 2026: *"Game does not end if room is full, but some rumors from
 * the crowd?"*
 *
 * Chapter 4 used to end the moment the last attendee sat down with the stage
 * unfinished — a player two jobs from the end was handed a card telling them to
 * press R, having lost a chapter they were most of the way through. Three
 * thousand people arriving early does not cancel a keynote; it makes a noise.
 *
 * What the room being full costs you now is the `spare` on your card, the `late`
 * flag, and a line on the opening video saying how long they sat there.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame } from '../src/sim';
import type { KeynoteState } from '../src/sim/chapters/ch4-keynote';
import { buildReel } from '../src/sim/reel';

const SEED = 20260930;
const mk = (): DebugGame => createGame({ seed: SEED, chapter: 4, cards: false }) as DebugGame;
const key = (g: DebugGame): KeynoteState => g.debug.chapter() as KeynoteState;

/** Run the sim until the room is full, or give up. */
function fillTheRoom(g: DebugGame): boolean {
  for (let i = 0; i < 20000; i++) {
    g.update(DT_MAX);
    if (g.snapshot().phase !== 'play') return false;
    if (key(g).restless > 0) return true;
  }
  return false;
}

describe('chapter 4 · the room fills before the stage is ready', () => {
  it('keeps playing, and starts a clock on how long they have been waiting', () => {
    const g = mk();
    expect(fillTheRoom(g), 'the room never filled').toBe(true);
    expect(g.snapshot().phase, 'a full room ended the chapter').toBe('play');
    expect(g.snapshot().card, 'a full room put a card up').toBeNull();
    // Nothing was finished, so this is the worst case the old code failed on.
    expect(key(g).ready).toBe(false);

    const t0 = key(g).restless;
    for (let i = 0; i < 300; i++) g.update(DT_MAX);
    expect(key(g).restless, 'the waiting clock is not running').toBeGreaterThan(t0);
    expect(g.snapshot().phase, 'it ended a few seconds later instead').toBe('play');
  });

  it('gives the room something to say, and does not say the same thing twice running', () => {
    const g = mk();
    expect(fillTheRoom(g)).toBe(true);
    const said = new Set<string>();
    let last = '';
    // Three murmurs' worth of clock, at MURMUR_EVERY = 9s.
    for (let i = 0; i < Math.ceil(30 / DT_MAX); i++) {
      g.update(DT_MAX);
      const line = g.snapshot().toast?.t ?? '';
      if (line && line !== last) {
        said.add(line);
        last = line;
      }
    }
    expect(said.size, 'the room sat there in silence').toBeGreaterThanOrEqual(2);
    // In the room's voice, not the HUD's: no instructions, no R-to-retry.
    for (const line of said) {
      expect(line.toLowerCase()).not.toContain('try again');
      expect(line.toLowerCase()).not.toContain('press r');
    }
  });

  /**
   * ...and the consequence is on the video rather than in a flag nobody reads.
   */
  it('puts the wait on the opening video', () => {
    const clean = { soup: 100, temp: 92, spare: 0, complaints: 0, keynoteComplaints: 0, oom: 0, cable: 0 };
    const titles = buildReel({ ...clean, lateT: 96 }, [], 700).map((c) => c.title);
    expect(titles).toContain('96s of 746 people waiting');
    // A run that was never late says nothing about it.
    expect(buildReel(clean, [], 700).map((c) => c.title)).not.toContain('0s of 746 people waiting');
  });
});
