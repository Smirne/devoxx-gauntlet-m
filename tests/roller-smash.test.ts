/**
 * Chapter 2's roller door, AFTER it goes: Biggy rolls on a couple of metres and
 * stops, and Voxxy stays at the door.
 *
 * Michele, 29 Sep 2026: *"Biggy's roll: should not start straight away, make a
 * couple of steps then roll. And when the door is smashed, Biggy should keep
 * rolling for a couple of metres, then stand. Voxxy stays at the door."* The roll
 * itself is the gait's (`tests/shove-roll.test.ts` pins the steps before it and
 * the standing up after it). This is the half that needs the sim, because the
 * picture must never disagree with the positions:
 *
 *  - the door still goes at `ROLLER_DOOR_SPEED` and not below it, by either
 *    route, and Biggy on his own still cannot do it;
 *  - the stick the player is still holding through the crash pushes nobody on:
 *    the crash hands it to Biggy and holds it off until it is let go
 *    (`handOver` in `src/sim/game.ts`), and drops the tow bar;
 *  - so Voxxy, no longer driven, comes to rest on her own drag without ever
 *    crossing the door line, and Biggy, driven with the stick let go, comes to
 *    rest on his own brake a couple of metres in, short of the first pallet of
 *    shirts — where he used to be shoved into it and bounce;
 *  - and on no frame of any of it is anybody inside a wall.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, GF, ROLLER_DOOR_SPEED, circleRect, createGame, type DebugGame, type ExpoState, type RobotKind } from '../src/sim';
import { bot } from './pilot';

const expo = (g: DebugGame): ExpoState => g.debug.chapter() as ExpoState;
const speed = (g: DebugGame, k: RobotKind): number => Math.hypot(bot(g, k).vx, bot(g, k).vy);
/** The first pallet of shirts on the top lane inside the store (`STORE_PALLETS` in ch2-expo.ts): its west face. */
const PALLET_FACE = GF.store.x + 34 - 8;
const LANE_Y = 160;

/** Anybody inside a wall this frame, by how much. */
function inWalls(g: DebugGame): string[] {
  const out: string[] = [];
  for (const k of ['voxxy', 'droid', 'biggy'] as const) {
    const b = bot(g, k);
    if (b.mounted) continue;
    for (const w of g.debug.walls()) {
      if (w.skipFor && w.skipFor(b)) continue;
      const hit = circleRect(b, w);
      if (hit && hit.pen > 0.5) out.push(`${k} ${hit.pen.toFixed(2)} px into ${w.kind ?? 'a wall'} at ${w.x},${w.y}`);
    }
  }
  return out;
}

/** Run Biggy down the top lane into the shutter, the way the chapter's own tests do. */
function runAtTheDoor(route: 'shove' | 'tow'): { g: DebugGame; top: number } {
  const g = createGame({ seed: 20260930, chapter: 2, cards: false });
  g.debug.select('voxxy');
  g.debug.place('biggy', 400, LANE_Y);
  g.debug.place('voxxy', route === 'tow' ? 386 : 372, LANE_Y);
  if (route === 'tow') g.key('Space');
  g.setStick(1, 0);
  let top = 0;
  for (let i = 0; i < 600 && !expo(g).rollerBroken; i++) {
    top = Math.max(top, bot(g, 'biggy').vx);
    g.update(DT_MAX);
  }
  return { g, top };
}

describe('chapter 2 — through the roller door, and what happens next', () => {
  it('still takes the door speed to break it: Biggy on his own stalls at it', () => {
    const g = createGame({ seed: 20260930, chapter: 2, cards: false });
    g.debug.select('biggy');
    g.debug.place('biggy', 380, LANE_Y);
    g.setStick(1, 0);
    for (let i = 0; i < 260; i++) {
      g.update(DT_MAX);
      expect(inWalls(g), `frame ${i}`).toEqual([]);
    }
    expect(expo(g).rollerBroken).toBe(false);
    expect(bot(g, 'biggy').x + bot(g, 'biggy').r).toBeLessThanOrEqual(GF.roller.x + 0.5);
  });

  for (const route of ['shove', 'tow'] as const) {
    it(`${route}: breaks it at the door speed, rolls him on a couple of metres, and leaves Voxxy at the door`, () => {
      const { g, top } = runAtTheDoor(route);
      expect(expo(g).rollerBroken, 'the run-up did not break the shutter').toBe(true);
      expect(top, 'broken below the door speed').toBeGreaterThan(ROLLER_DOOR_SPEED);
      const from = bot(g, 'biggy').x;

      // The crash hands the stick to Biggy, and the bar is gone.
      const snap = g.snapshot();
      expect(snap.bots[snap.active].kind, 'the stick did not go to Biggy').toBe('biggy');
      expect(snap.tow ?? null, 'Voxxy is still on the bar').toBeNull();

      // A player still holding the stick for a second after the crash, then letting go.
      let vBiggy = speed(g, 'biggy');
      for (let k = 0; k * DT_MAX < 6; k++) {
        if (k * DT_MAX >= 1) g.setStick(0, 0);
        g.update(DT_MAX);
        expect(inWalls(g), `frame ${k} after the crash`).toEqual([]);
        const v = bot(g, 'voxxy');
        expect(v.x + v.r, `Voxxy went through the door, frame ${k}`).toBeLessThanOrEqual(GF.roller.x);
        const b = bot(g, 'biggy');
        expect(b.x + b.r, `Biggy reached the pallet, frame ${k}`).toBeLessThan(PALLET_FACE);
        // Nobody is pushing him any more: the held stick drives nobody, and he only slows.
        expect(speed(g, 'biggy'), `something pushed Biggy on, frame ${k}`).toBeLessThanOrEqual(vBiggy + 1e-6);
        vBiggy = speed(g, 'biggy');
      }
      // Both at rest: Voxxy at the door, Biggy a couple of metres inside it.
      expect(speed(g, 'voxxy')).toBe(0);
      expect(speed(g, 'biggy')).toBe(0);
      const v = bot(g, 'voxxy');
      expect((GF.roller.x - (v.x + v.r)) / 12.5, 'Voxxy wandered off from the door').toBeLessThan(1.5);
      const on = (bot(g, 'biggy').x - from) / 12.5;
      expect(on, 'Biggy did not roll on a couple of metres').toBeGreaterThan(1.5);
      expect(on).toBeLessThan(2.6);

      // Let go, the stick is Biggy's: pushing it drives him, and nobody else.
      const vx0 = bot(g, 'voxxy').x;
      const by0 = bot(g, 'biggy').y;
      g.setStick(0, 1);
      for (let k = 0; k < 20; k++) g.update(DT_MAX);
      g.setStick(0, 0);
      expect(bot(g, 'biggy').y - by0, 'the stick does not drive Biggy after the hand-over').toBeGreaterThan(1);
      expect(bot(g, 'voxxy').x).toBeCloseTo(vx0, 6);
    });
  }
});
