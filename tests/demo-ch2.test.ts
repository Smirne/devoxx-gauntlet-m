import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame, type ExpoState } from '../src/sim';

const mk = (chapter: number): DebugGame => createGame({ seed: 20260930, chapter, cards: false, demo: true });
const expo = (g: DebugGame): ExpoState => g.debug.chapter() as ExpoState;

function until(g: DebugGame, done: () => boolean, budget = 3000): boolean {
  for (let i = 0; i < budget; i++) {
    if (done()) return true;
    g.update(DT_MAX);
  }
  return done();
}

describe('demo: chapter 2 (Expo) is only its let-in', () => {
  it('PageDown in chapter 1 goes straight to the let-in, in a lit hall, then to chapter 3', () => {
    const g = mk(1);
    g.update(DT_MAX);
    g.key('PageDown');
    // no walk down the stairs, no roller push: the let-in is what plays
    expect(g.snapshot().chapter).toBe(2);
    expect(g.snapshot().phase).toBe('cut');
    expect(expo(g).hallLit && expo(g).printerOnline).toBe(true);
    expect(expo(g).rollerBroken).toBe(false);
    expect(until(g, () => g.snapshot().chapter === 3)).toBe(true);
    expect(g.snapshot().phase).toBe('play');
  });

  it('PageDown in the real chapter 2 leaves through the same let-in into chapter 3', () => {
    const g = mk(2);
    g.update(DT_MAX);
    g.key('PageDown');
    expect(until(g, () => g.snapshot().chapter === 3)).toBe(true);
  });
});
