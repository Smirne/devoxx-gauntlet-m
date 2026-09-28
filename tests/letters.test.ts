/**
 * THE #DEVOXX SIGN — chapter 4's job for Droid (`src/sim/letters.ts`).
 *
 * Michele, 28 Sep 2026: *"There are always those 3d letters in Devoxx, used for
 * the keynote and the closing... Maybe we can change Voxxy or Droid's task?"*, then
 * *"Droid swap. Droid is already slow, so don't scatter the letters around."*
 *
 * What is asserted is what the swap promised: one stash and not a scavenger hunt;
 * only Droid can carry a letter, and the other two say why in their own voices;
 * a letter is a load he feels and puts down again exactly; it goes into its own
 * gap and nowhere else; a standing letter is solid; nothing can get trapped
 * behind the sign; and the stage is not ready until the sign reads #DEVOXX.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFS,
  DT_MAX,
  LETTER_MASS,
  LETTER_REACH,
  PX_PER_M,
  SIGN,
  SIGN_ORANGE,
  createGame,
  type Bot,
  type DebugGame,
  type KeynoteState,
  type Prop,
  type Vec2,
} from '../src/sim';
import { bot, raiseSign } from './pilot';

const mk = (): DebugGame => createGame({ seed: 4, chapter: 4, cards: false }) as DebugGame;
const key = (g: DebugGame): KeynoteState => g.debug.chapter() as KeynoteState;
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};
const centre = (p: { x: number; y: number; w?: number; h?: number }): Vec2 => ({ x: p.x + (p.w ?? 0) / 2, y: p.y + (p.h ?? 0) / 2 });
const leaning = (g: DebugGame): Prop[] => g.snapshot().props.filter((p) => p.kind === 'letter' && p.state === 'idle');
const gapFor = (g: DebugGame, slot: number): Prop | undefined =>
  g.snapshot().props.find((p) => p.kind === 'letter-slot' && p.v === slot);
const toast = (g: DebugGame): string => g.snapshot().toast?.t ?? '';

/** Stand `kind` in front of a letter or a gap — along the way the letter faces, clear of it. */
function inFront(g: DebugGame, kind: 'voxxy' | 'droid' | 'biggy', p: Prop, face = p.face ?? Math.PI / 2): void {
  const c = centre(p);
  const half = Math.min(p.w ?? 0, p.h ?? 0) / 2;
  const out = half + bot(g, kind).r + 2;
  g.debug.place(kind, c.x + Math.cos(face) * out, c.y + Math.sin(face) * out);
  g.update(DT_MAX);
}

/** Droid lifts the nearest leaning letter and returns it. */
function lift(g: DebugGame): Prop {
  g.debug.select('droid');
  const l = leaning(g)[0];
  inFront(g, 'droid', l);
  g.key('KeyE');
  expect(key(g).carrying, 'Droid did not take the letter').toBe(l.v);
  return l;
}

describe('the #DEVOXX sign', () => {
  it('opens as #DEV, with the other three leaning together in one wing and not scattered', () => {
    const g = mk();
    expect(key(g).sign).toBe('#DEV___');
    expect(key(g).letters).toBe(0);
    expect(key(g).carrying).toBe(-1);

    const letters = g.snapshot().props.filter((p) => p.kind === 'letter');
    expect(letters.map((p) => p.label).join('')).toBe(SIGN);
    expect(letters.filter((p) => p.state === 'done').map((p) => p.label).join('')).toBe('#DEV');
    const wing = leaning(g);
    expect(wing.map((p) => p.label).join('')).toBe('OXX');
    // The orange one is the last X, as in the photograph.
    expect(wing.find((p) => p.v === SIGN_ORANGE)?.label).toBe('X');

    // One stash: the three lean side by side, all within three metres of each other...
    for (const a of wing) {
      for (const b of wing) {
        expect(Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y) / PX_PER_M).toBeLessThan(3);
      }
    }
    // ...and every one of them is within twelve metres of its own gap — a walk
    // across the front of one stage, not a hunt round the Devoxx floor.
    for (const l of wing) {
      const gap = gapFor(g, l.v ?? -1);
      expect(gap, `no gap for the ${l.label}`).toBeDefined();
      const d = Math.hypot(centre(l).x - centre(gap!).x, centre(l).y - centre(gap!).y) / PX_PER_M;
      expect(d, `the ${l.label} is ${d.toFixed(1)} m from its gap`).toBeLessThan(12);
    }

    // Every letter standing anywhere stands on its own collider.
    const walls = g.debug.walls();
    for (const l of letters) {
      const under = walls.find((w) => w.kind === 'letter' && w.x === l.x && w.y === l.y && w.w === l.w && w.h === l.h);
      expect(under, `the ${l.label} in slot ${l.v} has no collider under it`).toBeDefined();
    }
  });

  it('is Droid’s job: Voxxy and Biggy each say why, in their own voices, and keep the key', () => {
    const g = mk();
    const l = leaning(g)[0];

    g.debug.select('voxxy');
    inFront(g, 'voxxy', l);
    g.key('KeyE');
    expect(toast(g)).toMatch(/^Voxxy:.*Droid/);
    expect(key(g).carrying).toBe(-1);
    expect(bot(g, 'voxxy').air ?? 0, 'Voxxy hopped instead of answering').toBe(0);

    g.debug.place('voxxy', 1700, 350);
    g.debug.select('biggy');
    inFront(g, 'biggy', l);
    g.key('KeyE');
    expect(toast(g)).toMatch(/^Biggy:.*has no handle/);
    expect(key(g).carrying).toBe(-1);
    expect(bot(g, 'biggy').flair ?? 0, 'Biggy rolled instead of answering').toBe(0);
    expect(leaning(g)).toHaveLength(3);
  });

  it('weighs on Droid while he carries one, by the mass ratio, and not at all once it is down', () => {
    const g = mk();
    const l = lift(g);
    const d = bot(g, 'droid');
    expect(d.mass).toBeCloseTo(DEFS.droid.mass + LETTER_MASS, 9);
    expect(d.accel).toBeCloseTo((DEFS.droid.accel * DEFS.droid.mass) / (DEFS.droid.mass + LETTER_MASS), 9);
    // Top speed and drag are not what a load changes.
    expect(d.max).toBe(DEFS.droid.max);
    expect(d.drag).toBe(DEFS.droid.drag);
    // Lifted off its collider: the wing is clear where it stood.
    expect(g.debug.walls().some((w) => w.kind === 'letter' && w.x === l.x && w.y === l.y)).toBe(false);

    const gap = gapFor(g, l.v ?? -1)!;
    inFront(g, 'droid', gap, Math.PI / 2);
    g.key('KeyE');
    expect(key(g).carrying).toBe(-1);
    // Exactly his own numbers back, not approximately.
    expect(bot(g, 'droid').mass).toBe(DEFS.droid.mass);
    expect(bot(g, 'droid').accel).toBe(DEFS.droid.accel);
  });

  it('is felt: loaded, he gets going more slowly over the same metres and still reaches the same top speed', () => {
    const run = (carry: boolean): { early: number; late: number } => {
      const g = mk();
      if (carry) lift(g);
      g.debug.select('droid');
      // Open corridor floor, the same start for both runs.
      g.debug.place('droid', 1080, 350);
      steps(g, 1);
      g.setStick(1, 0);
      const x0 = bot(g, 'droid').x;
      steps(g, 12); // 0.4 s
      const early = bot(g, 'droid').x - x0;
      steps(g, 90);
      const late = Math.hypot(bot(g, 'droid').vx, bot(g, 'droid').vy);
      return { early, late };
    };
    const light = run(false);
    const loaded = run(true);
    expect(loaded.early, 'a 15 kg letter made no difference to the first 0.4 s').toBeLessThan(light.early * 0.95);
    expect(loaded.late).toBeCloseTo(light.late, 1);
  });

  it('goes into its own gap and nowhere else, and says where that is', () => {
    const g = mk();
    const l = lift(g);
    const gap = gapFor(g, l.v ?? -1)!;
    expect(gap.state, 'its gap does not light up while he holds it').toBe('active');

    // Still in the wing: not here.
    g.key('KeyE');
    expect(key(g).carrying).toBe(l.v);
    expect(toast(g)).toMatch(/^Droid:.*on the stage/);

    // On the stage, but at the #: not this gap either.
    const hash = g.snapshot().props.find((p) => p.kind === 'letter' && p.v === 0)!;
    inFront(g, 'droid', hash, Math.PI / 2);
    g.key('KeyE');
    expect(key(g).carrying).toBe(l.v);
    expect(toast(g)).toMatch(/^Droid:.*between the V and the X/);

    // At its gap.
    inFront(g, 'droid', gap, Math.PI / 2);
    g.key('KeyE');
    expect(key(g).carrying).toBe(-1);
    expect(key(g).letters).toBe(1);
    expect(key(g).sign).toBe('#DEVO__');
    const stood = g.snapshot().props.find((p) => p.kind === 'letter' && p.v === l.v)!;
    expect(stood.state).toBe('done');
    expect({ x: stood.x, y: stood.y }).toEqual({ x: gap.x, y: gap.y });
    expect(gapFor(g, l.v ?? -1), 'a filled gap is still taped out').toBeUndefined();
  });

  it('will not put a letter down through a robot standing in its gap', () => {
    const g = mk();
    const l = lift(g);
    const gap = gapFor(g, l.v ?? -1)!;
    const c = centre(gap);
    g.debug.place('voxxy', c.x, c.y + 2);
    inFront(g, 'droid', gap, Math.PI / 2);
    // Droid in front, Voxxy in the gap: the place Droid stands is shoved clear by
    // Voxxy, so stand him beside her instead, still within reach of the gap.
    g.debug.place('droid', c.x + 14, c.y + 10);
    steps(g, 1);
    g.key('KeyE');
    expect(key(g).carrying).toBe(l.v);
    expect(toast(g)).toMatch(/^Droid: Voxxy is standing where/);
  });

  it('stands solid: a robot driven into a letter in the sign stops at its face', () => {
    const g = mk();
    const d = g.snapshot().props.find((p) => p.kind === 'letter' && p.v === 1)!; // the D
    g.debug.select('voxxy');
    const v0 = bot(g, 'voxxy');
    g.debug.place('voxxy', centre(d).x, d.y + (d.h ?? 0) + v0.r + 14);
    steps(g, 1);
    g.setStick(0, -1);
    steps(g, 60);
    const v = bot(g, 'voxxy');
    expect(v.y - v.r, 'Voxxy walked into the D').toBeGreaterThanOrEqual(d.y + (d.h ?? 0) - 0.5);
  });

  it('leaves no room behind it for anybody to be trapped in', () => {
    const g = mk();
    const walls = g.debug.walls();
    const sign = g.snapshot().props.filter((p) => p.kind === 'letter' && p.state === 'done');
    const smallest = Math.min(...(['voxxy', 'droid', 'biggy'] as const).map((k) => bot(g, k).r));
    for (const l of sign) {
      const c = centre(l);
      // The nearest wall face behind the letter, north of it along its own column.
      const behind = walls
        .filter((w) => w.kind !== 'letter' && w.x <= c.x && w.x + w.w >= c.x && w.y + w.h <= l.y + 0.001)
        .reduce((a, w) => Math.max(a, w.y + w.h), -Infinity);
      expect(l.y - behind, `a robot fits behind the ${l.label}`).toBeLessThan(2 * smallest);
    }
  });

  it('holds the stage back until it reads #DEVOXX, and every robot stays in reach of the job', () => {
    const g = mk();
    // Cake and lights, done the way the other chapter-4 tests do them.
    const mark = g.snapshot().props.find((p) => p.kind === 'cake-mark')!;
    const markX = mark.x + (mark.w ?? 0) / 2;
    g.debug.placeProp('cake', markX, mark.y + 58);
    g.debug.select('biggy');
    g.debug.place('biggy', markX, mark.y + 98);
    g.setStick(0, -1);
    for (let i = 0; i < 200 && !key(g).cake; i++) g.update(DT_MAX);
    g.setStick(0, 0);
    g.debug.select('voxxy');
    for (const s of g.snapshot().props.filter((p) => p.kind === 'spotlight')) {
      g.debug.place('voxxy', s.x, s.y);
      steps(g, 1);
    }
    expect(key(g).cake).toBe(true);
    expect(key(g).spots).toBe(4);
    expect(key(g).ready, 'the stage came ready with the sign reading #DEV').toBe(false);
    raiseSign(g);
    steps(g, 1);
    expect(key(g).sign).toBe('#DEVOXX');
    expect(key(g).ready).toBe(true);
  });

  /**
   * DRIVEN, THE WAY A PLAYER DRIVES IT — from the top of the main staircase,
   * through the door and up the aisle to the wing, then three carries, routing
   * round Stephan and the speaker rather than through them.
   *
   * The number is the swap's real cost. Walked the same way, the old banner's
   * two hooks took about 25 s; the sign takes about 40, most of it three carries.
   * 50 s is the ceiling: past it, "don't scatter the letters around" has quietly
   * stopped being true.
   */
  it('is finished by Droid from the top of the stairs in under fifty seconds of play', () => {
    const g = mk();
    const t0 = g.snapshot().t;
    raiseSign(g, true);
    expect(key(g).sign).toBe('#DEVOXX');
    expect(g.snapshot().t - t0).toBeLessThan(50);
  });

  it('gives Droid his own weight back when the chapter is restarted with a letter in his hands', () => {
    const g = mk();
    lift(g);
    expect(bot(g, 'droid').mass).not.toBe(DEFS.droid.mass);
    g.key('KeyR');
    steps(g, 1);
    const d: Bot = bot(g, 'droid');
    expect(d.mass).toBe(DEFS.droid.mass);
    expect(d.accel).toBe(DEFS.droid.accel);
    expect(key(g).carrying).toBe(-1);
    expect(key(g).sign).toBe('#DEV___');
  });

  it('keeps every letter within Droid’s reach of the arrow that sends him to it', () => {
    const g = mk();
    g.debug.select('droid');
    const row = (): { at?: Vec2 } => g.snapshot().tasks.find((t) => t.id === 'sign') ?? {};
    for (let n = 0; n < 3; n++) {
      const at = row().at!;
      const near = leaning(g).some((l) => Math.hypot(centre(l).x - at.x, centre(l).y - at.y) < LETTER_REACH);
      expect(near, 'the arrow is not by a letter Droid can lift from there').toBe(true);
      g.debug.place('droid', at.x, at.y);
      steps(g, 1);
      g.key('KeyE');
      expect(key(g).carrying, 'E at the arrow did not lift anything').toBeGreaterThanOrEqual(0);
      const gap = row().at!;
      g.debug.place('droid', gap.x, gap.y + 10);
      steps(g, 1);
      g.key('KeyE');
      expect(key(g).carrying, 'E by the arrow did not set it down').toBe(-1);
    }
    expect(key(g).sign).toBe('#DEVOXX');
  });
});
