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
    // Twice: in a chapter the first R only asks.
    g.key('KeyR');
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
    // Twice: in a chapter the first R only asks.
    g.key('KeyR');
    g.key('KeyR');
    expect(g.snapshot().t, 'the chapter clock did not go back to zero').toBe(0);
    expect((g.debug.chapter() as NightState).code, 'a replay changed the code').toBe(before);
  });

  /*
   * R sits beside E, the key every chapter is played with, and one stray press
   * used to wipe the chapter at once (critic round, 30 Sep). The first R asks.
   */
  it('asks first: one R only says so, a second inside the question restarts', () => {
    const g = mk();
    for (let i = 0; i < 40; i++) g.update(DT_MAX);
    const t0 = g.snapshot().t;
    g.key('KeyR');
    expect(g.snapshot().t, 'one R restarted the chapter').toBe(t0);
    expect(g.snapshot().toast?.t, 'the first R did not say what a second one does').toContain('again to restart');
    // Too late for the second: the question has lapsed, so this R asks again.
    for (let i = 0; i < Math.ceil(3.2 / DT_MAX); i++) g.update(DT_MAX);
    const t1 = g.snapshot().t;
    g.key('KeyR');
    expect(g.snapshot().t, 'an R after the question lapsed restarted anyway').toBe(t1);
    g.key('KeyR');
    expect(g.snapshot().t, 'the second R did not restart').toBe(0);
    // ...and the next chapter does not inherit a question asked in this one: asked
    // early in chapter 1, and answered early in chapter 2 on a clock that started
    // again, it would otherwise look like the second press.
    for (let i = 0; i < 3; i++) g.update(DT_MAX);
    g.key('KeyR');
    g.skipChapter();
    expect(g.snapshot().chapter).toBe(2);
    for (let i = 0; i < 10; i++) g.update(DT_MAX);
    const t2 = g.snapshot().t;
    g.key('KeyR');
    expect(g.snapshot().t, 'an R asked in chapter 1 restarted chapter 2').toBe(t2);
  });

  it('still restarts the whole run from the end card', () => {
    const g = createGame({ seed: 20260930, chapter: 4, cards: false });
    g.skipChapter();
    expect(g.snapshot().phase).toBe('done');
    g.key('KeyR');
    expect(g.snapshot().chapter, 'the end card no longer replays the run').toBe(1);
  });
});
