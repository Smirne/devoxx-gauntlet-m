/**
 * STEPHAN FACES THE DOORS. Michele, 29 Sep 2026, playing chapter 3: he stood at
 * the foot of the main staircase looking at the stairs — at a wall, as far as
 * anybody coming in could tell. The man holding the building's one way up
 * watches the way IN, and turns to whoever walks up to talk to him.
 *
 * His heading is the sim's (`Person.face`) so the 2.5D and 3D builds agree.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame } from '../src/sim';
import { GF } from '../src/sim/geometry';
import type { Person } from '../src/sim/types';

const mk = (): DebugGame => createGame({ seed: 20260930, chapter: 3, cards: false });
const stephan = (g: DebugGame): Person => g.snapshot().people?.find((p) => p.role === 'stephan') as Person;
const angleTo = (from: { x: number; y: number }, to: { x: number; y: number }): number => Math.atan2(to.y - from.y, to.x - from.x);
const gap = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const doors = { x: GF.entrance.x + GF.entrance.w / 2, y: GF.entrance.y + GF.entrance.h / 2 };

describe('Stephan', () => {
  it('faces the main entrance, not the staircase behind him', () => {
    const g = mk();
    for (let i = 0; i < 10; i++) g.update(DT_MAX);
    const s = stephan(g);
    expect(s.face, 'no heading: the renderer would turn him to the camera').toBeDefined();
    expect(gap(s.face as number, angleTo(s, doors))).toBeLessThan(0.05);
    // ...and that is away from the flight: the stairs are behind him, to the west.
    const stairs = { x: GF.mainStair.x + GF.mainStair.w / 2, y: GF.mainStair.y + GF.mainStair.h / 2 };
    expect(gap(s.face as number, angleTo(s, stairs))).toBeGreaterThan(Math.PI / 2);
  });

  it('turns to whoever walks up to talk to him, and back to the doors after', () => {
    const g = mk();
    const s0 = stephan(g);
    g.debug.select('voxxy');
    g.debug.place('voxxy', s0.x + 4, s0.y - 24);
    for (let i = 0; i < 30; i++) g.update(DT_MAX);
    const s = stephan(g);
    const v = g.snapshot().bots.find((b) => b.kind === 'voxxy');
    expect(v).toBeTruthy();
    expect(gap(s.face as number, angleTo(s, v as { x: number; y: number }))).toBeLessThan(0.1);

    g.debug.place('voxxy', 900, 600);
    for (let i = 0; i < 30; i++) g.update(DT_MAX);
    const back = stephan(g);
    expect(gap(back.face as number, angleTo(back, doors))).toBeLessThan(0.05);
  });
});
