import { describe, expect, it } from 'vitest';

import { CY0, DT_MAX, R, createGame, roomDoor, type DebugGame, type NightState } from '../src/sim';

/** A stage-demo game, no chapter cards, started in chapter 1. */
const mk = (): DebugGame => createGame({ seed: 20260930, chapter: 1, cards: false, demo: true });

function until(g: DebugGame, done: () => boolean, budget = 1500): boolean {
  for (let i = 0; i < budget; i++) {
    if (done()) return true;
    g.update(DT_MAX);
  }
  return done();
}

describe('demo: leaving chapter 1 (Night)', () => {
  it('PageDown with nothing solved walks out through the stairs into chapter 2', () => {
    const g = mk();
    for (let i = 0; i < 5; i++) g.update(DT_MAX);
    expect(g.snapshot().chapter).toBe(1);
    g.key('PageDown');
    expect(until(g, () => g.snapshot().chapter === 2)).toBe(true);
    expect(g.snapshot().chapter).toBe(2);
    expect(g.snapshot().score.nightT).toBeDefined();
  });

  it('works with Droid selected and mounted on Biggy', () => {
    const g = mk();
    g.debug.select('droid');
    g.key('KeyE');
    g.update(DT_MAX);
    g.key('PageDown');
    expect(until(g, () => g.snapshot().chapter === 2)).toBe(true);
  });
});

describe('Droid at the projector panel on his own', () => {
  const atPanel = (demo: boolean): DebugGame => {
    const g = createGame({ seed: 20260930, chapter: 1, cards: false, demo });
    const dB = roomDoor(R('B'));
    g.debug.place('droid', dB.x + dB.w + 24, CY0 + 19 + 3 + 22);
    g.debug.select('droid');
    g.update(DT_MAX);
    return g;
  };

  it.each([true, false])('tries, stretches, and fails with the toast kept (demo %s)', (demo) => {
    const g = atPanel(demo);
    g.key('KeyE');
    g.update(DT_MAX);
    expect((g.debug.chapter() as NightState).panelOn).toBe(false);
    expect(g.snapshot().toast?.t).toContain('too high');
    const droid = g.snapshot().bots.find((b) => b.kind === 'droid');
    expect(droid?.flair ?? 0).toBeGreaterThan(0);
  });
});
