/**
 * THE TWO WHO BUILT IT — Michele and Claude, at breakfast and at the keynote
 * (`src/sim/cameos.ts`).
 *
 * Michele, 29 Sep 2026: *"I'd like to add a couple character to the game... They
 * are you and me."* What is asserted is what makes them characters rather than
 * scenery: they stand where the chapter says, wear what a normal attendee wears,
 * answer Voxxy in their own words — the one she is actually standing at, when
 * two of them are in reach — and take their seats for the keynote without
 * taking one from the crowd.
 */

import { describe, expect, it } from 'vitest';

import { CAMEO_LINES, DT_MAX, HIGH_TABLES, createGame, type DebugGame, type Person } from '../src/sim';
import { LANYARD } from '../src/sim/lanyards';
import { bot } from './pilot';

const SEED = 20260930;
const mk = (chapter: number): DebugGame => createGame({ seed: SEED, chapter, cards: false }) as DebugGame;
const person = (g: DebugGame, name: string): Person | undefined => g.snapshot().people.find((p) => p.name === name);
const toast = (g: DebugGame): string => g.snapshot().toast?.t ?? '';

describe('Michele and Claude', () => {
  it('stand either side of a high table in chapter 3, on attendee ribbons', () => {
    const g = mk(3);
    g.update(DT_MAX);
    const m = person(g, 'Michele');
    const c = person(g, 'Claude');
    expect(m, 'Michele is not in the hall').toBeDefined();
    expect(c, 'Claude is not in the hall').toBeDefined();
    const t = HIGH_TABLES[6];
    const tx = t.x + t.w / 2;
    const ty = t.y + t.h / 2;
    expect(m!.x).toBeLessThan(tx);
    expect(c!.x).toBeGreaterThan(tx);
    // Claude's face is a screen, in every renderer; Michele's is a face.
    expect(c!.screen).toBe(true);
    expect(m!.screen).toBeFalsy();
    for (const p of [m!, c!]) {
      expect(Math.abs(p.y - ty), `${p.name} is not at the table`).toBeLessThan(1);
      expect(Math.hypot(p.x - tx, p.y - ty), `${p.name} is not at the table`).toBeLessThan(24);
      expect(p.lanyard, `${p.name} is not wearing an attendee ribbon`).toBe(LANYARD.attendee);
      // Turned towards the hall, north of the table, so a robot in the lane sees a face.
      expect(Math.sin(p.face ?? 0), `${p.name} has their back to the hall`).toBeLessThan(0);
    }
  });

  it('each answer Voxxy in their own words', () => {
    for (const name of ['Michele', 'Claude'] as const) {
      const g = mk(3);
      g.update(DT_MAX);
      const p = person(g, name)!;
      g.debug.select('voxxy');
      // From the lane side, north of them, well inside talking range.
      g.debug.place('voxxy', p.x, p.y - p.r - bot(g, 'voxxy').r - 6);
      g.update(DT_MAX);
      g.key('KeyE');
      expect(toast(g)).toContain(`${name}:`);
      expect(toast(g)).toContain(CAMEO_LINES[name].slice(0, 30));
    }
  });

  it('answers with the one Voxxy is standing at when both are in reach', () => {
    const g = mk(3);
    g.update(DT_MAX);
    const m = person(g, 'Michele')!;
    const c = person(g, 'Claude')!;
    g.debug.select('voxxy');
    // North of the table, a little to Claude's side: both within reach, Claude nearer.
    g.debug.place('voxxy', (m.x + c.x) / 2 + 8, m.y - 16);
    g.update(DT_MAX);
    const v = bot(g, 'voxxy');
    expect(Math.hypot(m.x - v.x, m.y - v.y)).toBeLessThan(40);
    expect(Math.hypot(c.x - v.x, c.y - v.y)).toBeLessThan(Math.hypot(m.x - v.x, m.y - v.y));
    g.key('KeyE');
    expect(toast(g), 'the first name in the list answered for the nearest').toMatch(/^Claude:/);
  });

  /*
   * A crowd member's seed is their place in the chapter's list, so the same name
   * got a different body in each room: 1.57 m at breakfast, 1.48 m and broad at
   * the keynote. The seed decides height, build and what they carry
   * (`src/render/people.ts`); somebody the player is meant to recognise keeps one.
   */
  it('are the same body at breakfast and at the keynote', () => {
    const g3 = mk(3);
    g3.update(DT_MAX);
    const g4 = mk(4);
    g4.update(DT_MAX);
    for (const name of ['Michele', 'Claude']) {
      const a = person(g3, name)!;
      const b = person(g4, name)!;
      expect(a.seed, `${name} has no seed of their own`).toBeDefined();
      expect(b.seed, `${name} changed bodies between the hall and Room 8`).toBe(a.seed);
    }
    expect(person(g3, 'Michele')!.seed).not.toBe(person(g3, 'Claude')!.seed);
  });

  it('take their seats in Room 8 for the keynote, behind the front row, and the crowd still fills', () => {
    const g = mk(4);
    g.update(DT_MAX);
    const seated = g.snapshot().people.filter((p) => p.role === 'seated' && p.name);
    const front = seated.filter((p) => p.name !== 'Michele' && p.name !== 'Claude');
    const cameos = seated.filter((p) => p.name === 'Michele' || p.name === 'Claude');
    expect(cameos.map((p) => p.name)).toEqual(['Michele', 'Claude']);
    expect(front.length, 'the front row is gone').toBeGreaterThan(0);
    for (const p of cameos) {
      expect(p.y, `${p.name} is in the front row`).toBeGreaterThan(front[0].y);
      expect(p.lanyard).toBe(LANYARD.attendee);
      expect(p.screen === true, `${p.name}'s head`).toBe(p.name === 'Claude');
    }
    // Every attendee still gets a seat: nobody arrives to find the room one short.
    const st = (): { crowd: number; seated: number } => g.debug.chapter() as { crowd: number; seated: number };
    for (let i = 0; i < 30 * 700 && !(st().crowd >= 84 && st().seated >= 84); i++) g.update(DT_MAX);
    expect(st().seated, 'the room did not fill').toBe(84);
  });
});
