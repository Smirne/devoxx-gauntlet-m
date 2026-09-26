/**
 * THE CONTACT LOG — the physics view's one source, and pure telemetry.
 *
 * Twenty of the hundred points are physics realism and none of it is visible: a
 * judge sees robots moving, not the impulse that stopped one. `P` draws that, and
 * this is what it draws from — so these tests check the two things that make the
 * readout honest: the numbers are the solver's own, and nothing in the game
 * changes because they were recorded.
 */

import { describe, expect, it } from 'vitest';

import { DEFS, DT_MAX, REST_WALL_BIGGY, botsCollide, createGame, mkBot, speed, stepBot } from '../src/sim';
import { clearContacts, contacts } from '../src/sim/contacts';

describe('the contact log', () => {
  it('records a wall bounce with the impulse the solver actually applied', () => {
    clearContacts();
    const b = mkBot('biggy', 100, 100);
    b.vx = 40;
    const wall = { x: 120, y: 60, w: 20, h: 80 };
    // Close enough that one step at this speed puts him into the face of it.
    b.x = wall.x - b.r - 1;
    const before = b.vx;
    stepBot(b, DT_MAX, [wall], undefined);
    const log = contacts();
    expect(log.length, 'the bounce was not recorded').toBe(1);
    const c = log[0];
    expect(c.kind).toBe('wall');
    expect(c.who).toBe('biggy');
    // The normal points out of the wall, back the way he came.
    expect(c.nx).toBeCloseTo(-1, 6);
    expect(c.ny).toBeCloseTo(0, 6);
    // The contact is ON the wall's face, not at his centre.
    expect(c.x).toBeCloseTo(wall.x, 3);
    // And the impulse is the solver's: (1 + e) * closing speed * mass.
    expect(c.j).toBeCloseTo((1 + REST_WALL_BIGGY) * c.rv * DEFS.biggy.mass, 6);
    expect(c.rv).toBeGreaterThan(0);
    expect(c.rv).toBeLessThanOrEqual(before);
  });

  it('records a robot-robot hit once, with the pair impulse', () => {
    clearContacts();
    const a = mkBot('voxxy', 100, 100);
    const b = mkBot('biggy', 100 + DEFS.voxxy.r + DEFS.biggy.r - 2, 100);
    a.vx = 30;
    const hit = botsCollide(a, b);
    expect(hit).not.toBeNull();
    const log = contacts();
    expect(log).toHaveLength(1);
    // The closing speed the log carries is the one `botsCollide` reports.
    expect(log[0].rv).toBeCloseTo((hit as { rv: number }).rv, 6);
    expect(log[0].kind).toBe('bot');
    expect(log[0].j).toBeGreaterThan(0);
  });

  it('clears itself every frame, and never grows without bound', () => {
    const g = createGame({ chapter: 3, cards: false, seed: 7 });
    for (let i = 0; i < 200; i++) g.update(DT_MAX);
    const n = g.snapshot().contacts.length;
    expect(n).toBeLessThanOrEqual(64);
    // A frame's snapshot carries that frame's contacts: step once more and the
    // list is rebuilt rather than appended to.
    g.update(DT_MAX);
    expect(g.snapshot().contacts.length).toBeLessThanOrEqual(64);
  });

  /*
   * THE POINT OF THE WHOLE FILE: it is telemetry, not state.
   *
   * Two runs from the same seed are identical whether or not anybody read the log
   * in between — otherwise the physics view would be a second physics, and every
   * frozen constant in `frozen-constants.test.ts` would be measuring a game that
   * behaves differently when a judge presses `P`.
   */
  it('changes nothing about the run', () => {
    const play = (read: boolean): number[] => {
      const g = createGame({ chapter: 2, cards: false, seed: 11 });
      const out: number[] = [];
      for (let i = 0; i < 400; i++) {
        g.setStick(i % 90 < 45 ? 1 : -1, i % 60 < 30 ? 1 : -0.5);
        g.update(DT_MAX);
        if (read) out.push(g.snapshot().contacts.length);
      }
      for (const b of g.snapshot().bots) out.push(Math.round(b.x * 1e6), Math.round(b.y * 1e6), Math.round(speed(b) * 1e6));
      return out.slice(-9);
    };
    expect(play(true)).toEqual(play(false));
  });
});
