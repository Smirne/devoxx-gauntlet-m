/**
 * A QUEUE MAKES WAY FOR BEING ASKED, NOT FOR BEING LEANT ON.
 *
 * Michele, 29 Sep 2026: *"Biggy should not be able to move the queue on its
 * own."* On 28 Sep he had asked for all three robots to be able to ask a queue
 * aside, not only Voxxy — and Biggy asking turned the one gate the soup errand
 * has into no gate at all: he walked to the doorway, pressed `E`, and walked in.
 * So Biggy asks and the queue stays where it is; he says why, in his own voice,
 * and so does leaning on them. Voxxy and Droid still ask.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame } from '../src/sim';
import type { BreakfastState } from '../src/sim/chapters/ch3-breakfast';
import type { Person } from '../src/sim/types';

const mk = (): DebugGame => createGame({ seed: 20260930, chapter: 3, cards: false });
const st = (g: DebugGame): BreakfastState => g.debug.chapter() as BreakfastState;
const toast = (g: DebugGame): string => g.snapshot().toast?.t ?? '';
const queuers = (g: DebugGame): Person[] => (g.snapshot().people ?? []).filter((p) => p.role === 'queue');

describe('the catering queues', () => {
  it('do not make way for Biggy, and he says why', () => {
    const g = mk();
    g.debug.select('biggy');
    g.debug.place('biggy', 110, 266);
    g.key('KeyE');
    expect(st(g).queues.every((q) => q.open === 0), 'the queue made way for Biggy').toBe(true);
    const said = toast(g);
    expect(said.startsWith('Biggy'), `Biggy said: ${said}`).toBe(true);
    expect(said).toContain('Voxxy');
  });

  it('do not get shoved aside by Biggy driving into them', () => {
    const g = mk();
    for (let i = 0; i < 5; i++) g.update(DT_MAX);
    const before = queuers(g).map((p) => ({ x: p.x, y: p.y }));
    g.debug.select('biggy');
    g.debug.place('biggy', 110, 290);
    const said = new Set<string>();
    for (let k = 0; k < 4; k++) {
      g.setStick(0, -1);
      for (let i = 0; i < 60; i++) {
        g.update(DT_MAX);
        said.add(toast(g));
      }
      g.setStick(0, 1);
      for (let i = 0; i < 20; i++) g.update(DT_MAX);
    }
    g.setStick(0, 0);
    for (let i = 0; i < 20; i++) g.update(DT_MAX);
    expect(st(g).queues.every((q) => q.open === 0)).toBe(true);
    const after = queuers(g);
    before.forEach((p, i) => {
      expect(Math.hypot(after[i].x - p.x, after[i].y - p.y), `queuer ${i} was pushed`).toBeLessThan(1);
    });
    // Leaning on them is answered, in his voice.
    const lines = [...said].filter((t) => t.startsWith('Biggy') && t.includes('queue'));
    expect(lines.length, [...said].join(' | ')).toBeGreaterThan(0);
  });

  it('still make way for Voxxy, and for Droid', () => {
    for (const who of ['voxxy', 'droid'] as const) {
      const g = mk();
      g.debug.select(who);
      g.debug.place(who, 110, 266);
      g.key('KeyE');
      expect(st(g).queues[0].open, `${who} could not ask`).toBeGreaterThan(0);
    }
  });
});
