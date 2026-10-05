import { describe, expect, it } from 'vitest';

import { DT_MAX, GF, circleRect, createGame, type DebugGame, type ExpoState } from '../src/sim';
import { bot } from './pilot';

const mk = (): DebugGame => createGame({ seed: 20260930, chapter: 1, cards: false, demo: true });
const expo = (g: DebugGame): ExpoState => g.debug.chapter() as ExpoState;

function until(g: DebugGame, done: () => boolean, budget = 1500): boolean {
  for (let i = 0; i < budget; i++) {
    if (done()) return true;
    g.update(DT_MAX);
  }
  return done();
}

/** Chapter 1 -> PageDown -> chapter 2, staged and running. */
function staged(): DebugGame {
  const g = mk();
  g.update(DT_MAX);
  g.key('PageDown');
  expect(until(g, () => g.snapshot().chapter === 2)).toBe(true);
  g.update(DT_MAX);
  return g;
}

describe('demo: chapter 2 (Expo)', () => {
  it('lands staged on the roller push, and the push works from there', () => {
    const g = staged();
    const s = expo(g);
    expect(s.power && s.router.online && s.hallLit && s.printerOnline && s.cable.connected).toBe(true);
    expect(s.breakersLeft).toBe(0);
    expect(s.rollerBroken).toBe(false);
    expect(g.snapshot().card).toBeFalsy();
    const snap = g.snapshot();
    expect(snap.bots[snap.active].kind).toBe('voxxy');
    expect(snap.tasks.filter((t) => !t.done).map((t) => t.id)).toEqual(['store']);

    // Nobody inside a wall at the staging spot.
    for (const k of ['voxxy', 'droid', 'biggy'] as const) {
      for (const w of g.debug.walls()) {
        const hit = circleRect(bot(g, k), w);
        expect(hit && hit.pen > 0.5, `${k} in a wall`).toBeFalsy();
      }
    }

    g.key('KeyE');
    g.update(DT_MAX);
    expect(g.snapshot().tow, 'E did not take hold of Biggy').toBeTruthy();
    g.setStick(1, 0);
    for (let i = 0; i < 600 && !expo(g).rollerBroken; i++) g.update(DT_MAX);
    expect(expo(g).rollerBroken).toBe(true);
    expect(GF.roller.x).toBeGreaterThan(bot(g, 'biggy').x);
  });

  it('PageDown at once, and mid-push, leaves through the let-in into chapter 3', () => {
    const g = staged();
    g.key('PageDown');
    expect(until(g, () => g.snapshot().chapter === 3, 3000)).toBe(true);

    const h = staged();
    h.key('KeyE');
    h.setStick(1, 0);
    for (let i = 0; i < 40; i++) h.update(DT_MAX);
    h.key('PageDown');
    expect(until(h, () => h.snapshot().chapter === 3, 3000)).toBe(true);
  });
});
