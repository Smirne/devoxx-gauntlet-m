import { describe, expect, it } from 'vitest';
import { DT_MAX, createGame, type DebugGame, type NightState } from '../src/sim';

const mk = (): DebugGame => createGame({ seed: 20260930, chapter: 1, cards: false });

describe('R restarts the chapter, not the run', () => {
  it('keeps you in the chapter you were playing', () => {
    const g = mk();
    const st = (): NightState => g.debug.chapter() as NightState;
    const code = st().code;
    g.update(DT_MAX);
    g.key(`Digit${code[0]}`);
    g.key('KeyR');
    const s = g.snapshot();
    expect(s.chapter, 'R threw the player back to the title').toBe(1);
    expect(s.phase).toBe('play');
    expect(s.card, 'R put a card back up').toBe(null);
  });

  it('resets what the chapter owns and re-seeds nothing', () => {
    const g = mk();
    const before = (g.debug.chapter() as NightState).code;
    for (let i = 0; i < 40; i++) g.update(DT_MAX);
    expect(g.snapshot().t).toBeGreaterThan(0);
    g.key('KeyR');
    expect(g.snapshot().t, 'the chapter clock did not go back to zero').toBe(0);
    expect((g.debug.chapter() as NightState).code, 'a replay changed the code').toBe(before);
  });

  it('still restarts the whole run from the end card', () => {
    const g = createGame({ seed: 20260930, chapter: 4, cards: false });
    g.skipChapter();
    expect(g.snapshot().phase).toBe('done');
    g.key('KeyR');
    expect(g.snapshot().chapter, 'the end card no longer replays the run').toBe(1);
  });
});
