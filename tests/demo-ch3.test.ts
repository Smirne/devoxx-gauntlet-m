import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame } from '../src/sim';
import type { BreakfastState } from '../src/sim/chapters/ch3-breakfast';
import { bot, findPath } from './pilot';

const mk = (chapter: number): DebugGame => createGame({ seed: 20260930, chapter, cards: false, demo: true });
const st = (g: DebugGame): BreakfastState => g.debug.chapter() as BreakfastState;

function until(g: DebugGame, done: () => boolean, budget = 1500): boolean {
  for (let i = 0; i < budget; i++) {
    if (done()) return true;
    g.update(DT_MAX);
  }
  return done();
}

/** Chapter 2 -> PageDown -> chapter 3, staged. */
function landInChapter3(): DebugGame {
  const g = mk(2);
  for (let i = 0; i < 5; i++) g.update(DT_MAX);
  g.key('PageDown');
  expect(until(g, () => g.snapshot().chapter === 3), 'chapter 3 never started').toBe(true);
  g.update(DT_MAX);
  return g;
}

describe('demo: entering chapter 3 (Breakfast)', () => {
  it('lands on the soup run: ladle in, soup not started, Biggy far away', () => {
    const g = landInChapter3();
    const s = st(g);
    expect(s.ladle).toBe('in');
    expect(s.carrying).toBe(false);
    expect(s.delivered).toBe(false);
    expect(s.gateOpen).toBe(false);
    expect(s.speaker.withStephan).toBe(false);
    expect(s.beer.done).toBe(false);
    expect(g.snapshot().card).toBeFalsy();
    expect(g.snapshot().toast?.t ?? '').toContain('soup');
    expect(g.snapshot().tasks?.find((t) => t.id === 'ladle')?.done).toBe(true);
    expect(g.snapshot().tasks?.find((t) => t.id === 'soup')?.done).toBe(false);
    const v = bot(g, 'voxxy');
    const b = bot(g, 'biggy');
    expect(g.snapshot().bots.find((o) => o.driven)?.kind).toBe('voxxy');
    expect(b.x - v.x).toBeGreaterThan(700);
    expect(findPath(g, 'biggy', { x: 110, y: 266 }).length, 'Biggy cannot reach the soup doorway').toBeGreaterThan(0);
  });

  it('one E from Voxxy clears the soup queue, and Biggy then fills the pot', () => {
    const g = landInChapter3();
    g.debug.select('voxxy');
    g.key('KeyE');
    expect(st(g).queues[0].open, 'the staged spot does not clear the queue').toBeGreaterThan(0);

    g.debug.select('biggy');
    g.debug.place('biggy', 105, 180);
    g.key('KeyE');
    expect(st(g).carrying).toBe(true);
  });
});

describe('demo: leaving chapter 3', () => {
  it('PageDown goes straight into the keynote room, with no cutscene', () => {
    const g = mk(3);
    for (let i = 0; i < 5; i++) g.update(DT_MAX);
    g.key('PageDown');
    expect(g.snapshot().chapter).toBe(4);
    expect(g.snapshot().phase).toBe('play');
    const sc = g.snapshot().score;
    expect(sc.breakfastT).toBeDefined();
    expect(sc.soup).toBeDefined();
  });

  it('PageDown with the soup mid-carry still goes straight to chapter 4', () => {
    const g = mk(3);
    g.debug.select('droid');
    g.debug.place('droid', 176, 150);
    g.key('KeyE');
    g.debug.place('droid', 105, 180);
    g.key('KeyE');
    g.debug.select('biggy');
    g.debug.place('biggy', 105, 180);
    g.key('KeyE');
    expect(st(g).carrying).toBe(true);
    g.key('PageDown');
    expect(g.snapshot().chapter).toBe(4);
  });
});
