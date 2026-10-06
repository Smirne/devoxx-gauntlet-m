import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame, type KeynoteState } from '../src/sim';
import { bot, driveTo } from './pilot';

const keynote = (g: DebugGame): KeynoteState => g.debug.chapter() as KeynoteState;

function until(g: DebugGame, done: () => boolean, budget = 3000): boolean {
  for (let i = 0; i < budget; i++) {
    if (done()) return true;
    g.update(DT_MAX);
  }
  return done();
}

/** Chapter 3 -> PageDown -> chapter 4, staged and running. */
function staged(): DebugGame {
  const g = createGame({ seed: 20260930, chapter: 3, cards: false, demo: true });
  g.update(DT_MAX);
  g.key('PageDown');
  expect(until(g, () => g.snapshot().chapter === 4)).toBe(true);
  g.update(DT_MAX);
  return g;
}

describe('demo: chapter 4 (Keynote)', () => {
  it('lands with everything done but the last letter, Droid at it, and a nearly full room', () => {
    const g = staged();
    const k = keynote(g);
    expect(k.cake).toBe(true);
    expect(k.spots).toBe(4);
    expect(k.ready).toBe(false);
    expect(k.seated).toBeGreaterThan(60);
    expect(g.snapshot().card).toBeFalsy();
    const snap = g.snapshot();
    expect(snap.bots[snap.active].kind).toBe('droid');
    expect(snap.props.some((p) => p.kind === 'letter-held')).toBe(false);
  });

  it('E lifts the last letter, then E at its gap finishes the stage and starts the ending', () => {
    const g = staged();
    g.key('KeyE');
    g.update(DT_MAX);
    expect(g.snapshot().props.some((p) => p.kind === 'letter-held')).toBe(true);
    const slot = g.snapshot().props.find((p) => p.kind === 'letter-slot' && p.v === 6);
    expect(slot).toBeDefined();
    const droid = bot(g, 'droid');
    // a short walk to the gap, then E
    driveTo(g, 'droid', [{ x: slot!.x + (slot!.w ?? 0) / 2, y: slot!.y + (slot!.h ?? 0) + droid.r + 2 }], 4);
    g.key('KeyE');
    for (let i = 0; i < 10; i++) g.update(DT_MAX);
    expect(keynote(g).ready).toBe(true);
    expect(g.snapshot().reel).not.toBeNull();
    expect(until(g, () => g.snapshot().phase === 'done', 6000)).toBe(true);
  });

  it('Droid eases to his curtain-call mark without juddering', () => {
    const g = staged();
    g.key('KeyE');
    g.update(DT_MAX);
    const slot = g.snapshot().props.find((p) => p.kind === 'letter-slot' && p.v === 6)!;
    const droid = bot(g, 'droid');
    driveTo(g, 'droid', [{ x: slot.x + (slot.w ?? 0) / 2, y: slot.y + (slot.h ?? 0) + droid.r + 2 }], 4);
    g.key('KeyE');
    // the stick must not flip sign frame after frame while he is still moving
    let flips = 0;
    let prev = 0;
    for (let i = 0; i < 90; i++) {
      g.update(DT_MAX);
      const d = bot(g, 'droid');
      const dir = Math.sign(d.iy);
      if (dir !== 0 && prev !== 0 && dir !== prev && Math.hypot(d.vx, d.vy) > 1) flips++;
      if (dir !== 0) prev = dir;
    }
    expect(flips).toBeLessThan(2);
  });
});
