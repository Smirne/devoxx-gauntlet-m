/**
 * THE CHEAP EXTRAS — Michele, 26 Sep 2026: *"Let's try 5 6 7 too."*
 *
 *   5. The rubber duck listens: `E` at the Rubber Duck Inc stand and the robot
 *      talks the problem out loud, which is the oldest debugging technique there
 *      is and, here, the chapter's own hint in the robot's own voice.
 *   6. Lanyard colours mean something — crew red, speaker teal, attendee
 *      grey-blue, chair orange (`src/sim/lanyards.ts`).
 *   7. "GC pause" when Biggy finally stops (`src/sim/quips.ts`).
 *
 * Each of the three is a joke, and a joke that fires at the wrong moment is a bug,
 * so what is measured here is mostly the RESTRAINT: once per chapter, only at the
 * stand, only while the duck is still on it.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame, type BreakfastState } from '../src/sim';
import { GF, type ExpoState } from '../src/sim';
import { LANYARD, lanyardFor } from '../src/sim/lanyards';
import { walkTo } from './pilot';

const SEED = 20260930;
const mk = (chapter: number): DebugGame => createGame({ seed: SEED, chapter, cards: false });
const said = (g: DebugGame): string => g.snapshot().toast?.t ?? '';
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};

describe('lanyards', () => {
  it('gives each role its own ribbon, and everybody else the attendee one', () => {
    expect(lanyardFor('staff')).toBe(LANYARD.crew);
    expect(lanyardFor('speaker')).toBe(LANYARD.speaker);
    expect(lanyardFor('stephan')).toBe(LANYARD.chair);
    expect(lanyardFor('visitor')).toBe(LANYARD.attendee);
    // Four distinct colours, or the whole idea says nothing.
    expect(new Set(Object.values(LANYARD)).size).toBe(4);
  });

  it('puts one on every person in the hall, with Stephan the only chair', () => {
    const g = mk(3);
    steps(g, 200);
    const people = g.snapshot().people;
    expect(people.length).toBeGreaterThan(10);
    expect(people.every((p) => p.lanyard !== undefined)).toBe(true);
    expect(people.filter((p) => p.lanyard === LANYARD.chair)).toHaveLength(1);
    expect(people.filter((p) => p.lanyard === LANYARD.crew).length).toBeGreaterThan(0);
  });
});

describe('the rubber duck', () => {
  /** Where the duck starts, read off the chapter rather than copied from it. */
  const duckAt = (g: DebugGame): { x: number; y: number } => (g.debug.chapter() as BreakfastState).minigames.duck;

  it('says the chapter’s own hint back, in the voice of the robot who asked', () => {
    const g = mk(3);
    steps(g, 5);
    const d = duckAt(g);
    g.debug.select('voxxy');
    g.debug.place('voxxy', d.x + 14, d.y);
    g.key('KeyE');
    const t = said(g);
    expect(t).toContain('rubber duck');
    // The hint half: chapter 3's first open job is the ladle, and that hint is
    // Droid's line — but Voxxy gets the one SHE can act on, which is the speaker.
    expect(t.length).toBeGreaterThan(60);
  });

  it('stops listening once it has been shoved down the lane', () => {
    const g = mk(3);
    steps(g, 5);
    const d = duckAt(g);
    // A duck in the middle of a shuffleboard shot is a puck, not a confessor.
    expect(g.debug.placeProp('duck', d.x - 60, d.y)).toBe(true);
    g.debug.select('voxxy');
    g.debug.place('voxxy', d.x - 46, d.y);
    g.key('KeyE');
    expect(said(g)).not.toContain('rubber duck');
  });
});

describe('the GC pause', () => {
  /**
   * Biggy at a dead run, then let go until he has coasted to a stop — and stop
   * stepping the moment he does. A toast expires (`TOAST_MS`), so running on for
   * another ten seconds reads an empty screen and proves nothing.
   */
  function runAndStop(g: DebugGame): string {
    g.debug.select('biggy');
    g.setStick(1, 0);
    steps(g, 200);
    g.setStick(0, 0);
    let heard = '';
    for (let i = 0; i < 400; i++) {
      g.update(DT_MAX);
      const t = said(g);
      if (t !== '') heard = t;
      const b = g.snapshot().bots.find((o) => o.kind === 'biggy');
      if (b && Math.hypot(b.vx, b.vy) === 0 && i > 20) break;
    }
    return heard;
  }

  it('fires when Biggy stops after a real run, and only once a chapter', () => {
    /*
     * Chapter 1's corridor, because it is the longest clear run in the building.
     * The first cut of this ran him down the exhibition hall and he hit a sponsor
     * table — which is its own answer, and the right one: a toast explaining what
     * he just walked into is not a screen the joke may talk over.
     */
    const g = mk(1);
    g.debug.place('biggy', 700, 350);
    expect(runAndStop(g)).toContain('GC pause');

    // Second run, same chapter: the gag is spent.
    g.debug.place('biggy', 700, 350);
    expect(runAndStop(g)).not.toContain('GC pause');
  });

  it('never fires for a robot that has not been running', () => {
    const g = mk(1);
    g.debug.place('biggy', 700, 350);
    g.debug.select('biggy');
    steps(g, 300);
    expect(said(g)).not.toContain('GC pause');
  });
});

describe('the two things on chapter 1’s walls', () => {
  it('shows the AV rider to whoever walks past it, once', () => {
    const g = mk(1);
    // A few strides east of the marks, on the corridor's north side.
    g.debug.place('voxxy', 85, 320);
    steps(g, 3);
    const first = said(g);
    expect(first).toContain('AV RIDER');
    // The legend itself: the three colours, so a player who reads one toast in the
    // whole chapter reads the one that explains the mechanic.
    expect(first).toContain('orange');
    expect(first).toContain('green');
    expect(first).toContain('blue');
  });

  it('gives the CFP slips to Voxxy’s beam and to nobody else', () => {
    const g = mk(1);
    // Biggy parked on the same spot, lighting the same wall with a flood: nothing.
    g.debug.place('biggy', 375, 380, Math.PI / 2);
    g.debug.select('biggy');
    steps(g, 20);
    expect(said(g)).not.toContain('CFP');

    // Voxxy, close, with her cone on it.
    g.debug.place('voxxy', 375, 375, Math.PI / 2);
    g.debug.select('voxxy');
    steps(g, 3);
    expect(said(g)).toContain('rejected CFP slips');
  });
});

describe('the printer’s test badge', () => {
  it('spells her name wrong, a few seconds after the printer wakes up', () => {
    const g = mk(2);
    const panel = { x: GF.panel.x + 13, y: GF.panel.y + 8 };
    const rack = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
    const printer = { x: GF.printer.x + 10, y: GF.printer.y + 6 };
    const hub = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };

    // The chain, the short way: breakers, cabinet, Droid up for the label, Droid
    // down to type it, then the cable. Nothing here is a cheat — it is the same
    // route `tests/chapters.test.ts` plays end to end.
    g.debug.select('droid');
    g.debug.place('droid', panel.x + 20, panel.y + 30);
    for (let i = 0; i < 3; i++) g.key('KeyE');
    g.debug.select('biggy');
    g.debug.place('biggy', hub.x, hub.y + 30);
    g.key('KeyE');
    g.debug.place('biggy', 300, 640);
    g.debug.place('droid', 284, 640);
    g.debug.select('droid');
    g.key('KeyE');
    g.debug.place('biggy', hub.x, hub.y + 20);
    steps(g, 1);
    g.key('KeyE');
    g.key('KeyE');
    g.debug.select('droid');
    g.debug.place('droid', hub.x, hub.y + 20);
    g.key('KeyE');
    expect(walkTo(g, 'voxxy', { x: rack.x, y: rack.y - 24 })).toBe(true);
    g.key('KeyE');
    expect(walkTo(g, 'voxxy', { x: printer.x, y: printer.y + 34 })).toBe(true);
    g.key('KeyE');
    expect((g.debug.chapter() as ExpoState).printerOnline).toBe(true);

    // It does NOT talk over "cable in — the run is made": the printer warms up
    // first, which is both true of printers and the reason the line survives.
    expect(said(g)).toContain('Cable in');
    let heard = '';
    for (let i = 0; i < 200; i++) {
      g.update(DT_MAX);
      const t = said(g);
      if (t.includes('VOXY')) {
        heard = t;
        break;
      }
    }
    expect(heard).toContain('VOXY');
    expect(heard).toContain('One X');
  });
});
