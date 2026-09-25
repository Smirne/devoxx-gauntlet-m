/**
 * The opening sequence: three crates, three presentations, one transition.
 *
 * What these hold is the pair of things that went wrong when it was first built
 * and that no other test would catch: a robot driven faster than it can
 * physically move, and a sequence whose beats have drifted out of the order
 * they are meant to play in.
 */

import { describe, expect, it } from 'vitest';

import { DEFS, T } from '../src/sim/constants';
import {
  CARDS,
  CRATE_AT,
  CRATE_RECTS,
  CRATE_ROW,
  HOLD,
  LEAD,
  PANEL_DELAY,
  SLOT,
  STAND_AT,
  STEP_DELAY,
  STEP_TIME,
  TITLE_HOLD,
  TITLE_IN,
  TITLE_OUT,
  WALK_AT,
  DARK_HOLD,
  FLICKER_TIME,
  OVER_AT,
  emergencyAt,
  openingAt,
} from '../src/sim/opening';
import { DT_MAX, createGame, type DebugGame, type RobotKind } from '../src/sim';
import { CY0, CY1 } from '../src/sim/geometry';
import { PX_PER_M } from '../src/sim/units';

const KINDS: readonly RobotKind[] = ['voxxy', 'droid', 'biggy'];

describe('the opening', () => {
  it('never moves a robot faster than it can move itself', () => {
    /*
     * The transitions once drove Droid at 263% of his own top speed, which is a
     * physics-realism bug rather than a pacing note, and the stride out of a
     * crate is driven by `game.ts` rather than by the cutscene walker — so it
     * needs its own guard. Measured the same way: per frame, in sim px.
     */
    const g = createGame({ seed: 20260930 });
    const seen: Record<string, number> = { voxxy: 0, droid: 0, biggy: 0 };
    let last = new Map(g.snapshot().bots.map((b) => [b.kind, { x: b.x, y: b.y }]));
    for (let i = 0; i < 400 && g.snapshot().opening !== null; i++) {
      g.update(DT_MAX);
      for (const b of g.snapshot().bots) {
        const p = last.get(b.kind)!;
        const v = Math.hypot(b.x - p.x, b.y - p.y) / DT_MAX;
        if (v > seen[b.kind]) seen[b.kind] = v;
      }
      last = new Map(g.snapshot().bots.map((b) => [b.kind, { x: b.x, y: b.y }]));
    }
    for (const kind of KINDS) {
      const max = DEFS[kind].max;
      expect(seen[kind], `${kind} at ${seen[kind].toFixed(1)} px/s against his own ${max}`).toBeLessThanOrEqual(max);
      // And it is not accidentally still: the stride has to actually happen.
      expect(seen[kind], `${kind} never moved`).toBeGreaterThan(0);
    }
  });

  it('shows exactly one robot at a time, and each one its own key', () => {
    const seen: RobotKind[] = [];
    for (let t = 0; t < WALK_AT; t += 0.05) {
      const c = openingAt(t).card;
      if (c !== null && c !== seen[seen.length - 1]) seen.push(c);
    }
    expect(seen, 'the order is the order of the keys').toEqual(['voxxy', 'droid', 'biggy']);
    expect(CARDS.voxxy.key).toBe(1);
    expect(CARDS.droid.key).toBe(2);
    expect(CARDS.biggy.key).toBe(3);
  });

  it('opens a crate before the robot in it steps out, every time', () => {
    for (let i = 0; i < KINDS.length; i++) {
      const kind = KINDS[i];
      const at = LEAD + i * SLOT;
      // The panel is off before the stride starts, or a robot walks through its
      // own crate front — which is the complaint this game has collected twice.
      expect(PANEL_DELAY, kind).toBeLessThan(STEP_DELAY);
      const atStep = openingAt(at + STEP_DELAY + 0.001);
      expect(atStep.open[kind], `${kind} started moving inside a shut crate`).toBeGreaterThan(0.9);
    }
  });

  it('is finished before it hands over, and hands over once', () => {
    const last = LEAD + SLOT * 2 + STEP_DELAY + STEP_TIME;
    expect(WALK_AT, 'the transition starts before the last robot is out').toBeGreaterThanOrEqual(last);
    expect(WALK_AT - last, 'no beat to look at them before the cut').toBeCloseTo(HOLD, 6);
    const end = openingAt(WALK_AT);
    for (const kind of KINDS) expect(end.step[kind], `${kind} is still stepping`).toBe(1);
  });

  it('clears the title before the first crate opens', () => {
    expect(TITLE_IN + TITLE_HOLD + TITLE_OUT).toBeLessThanOrEqual(LEAD + PANEL_DELAY + 1e-9);
  });

  it('puts every robot inside its own crate, and stands it in front after', () => {
    for (const c of CRATE_RECTS) {
      const inside = CRATE_AT[c.kind];
      expect(inside.x, `${c.kind} is not within its crate in x`).toBeGreaterThan(c.x);
      expect(inside.x).toBeLessThan(c.x + c.w);
      expect(inside.y, `${c.kind} is not within its crate in y`).toBeGreaterThan(c.y);
      expect(inside.y).toBeLessThan(c.y + c.h);
      // And its standing mark is clear of the crate it came out of, by its own
      // radius — or it would be spawned inside a collider the moment play starts.
      // Measured as a distance to the rect rather than along one axis: the row
      // turned 90 degrees when it moved to the west wall, and an assertion that
      // only watches y would have passed the whole move without looking.
      const stand = STAND_AT[c.kind];
      const dx = Math.max(c.x - stand.x, 0, stand.x - (c.x + c.w));
      const dy = Math.max(c.y - stand.y, 0, stand.y - (c.y + c.h));
      expect(Math.hypot(dx, dy), `${c.kind} stands inside his own crate`).toBeGreaterThan(DEFS[c.kind].r);
    }
  });

  it('leaves the crates solid once the chapter takes over', () => {
    const g: DebugGame = createGame({ seed: 20260930, chapter: 1, cards: false });
    const crates = g.debug.walls().filter((w) => w.kind === 'crate');
    expect(crates, 'the crates stopped being obstacles').toHaveLength(3);
    for (const w of crates) {
      expect(w.why, 'a wall with no voice').toBeTypeOf('function');
      // Against the corridor's WEST wall, backs to it, faces east: the deepest
      // crate is Biggy's at 1.78 m, so nothing may reach past the face line and
      // nothing may pass through the wall's inner face at T = 6.
      expect(w.x! + w.w!).toBeLessThanOrEqual(CRATE_ROW.x + 1e-6);
      expect(w.x!).toBeGreaterThanOrEqual(CRATE_ROW.x - 1.78 * PX_PER_M - 1e-6);
      expect(w.x!, 'a crate is inside the west wall').toBeGreaterThanOrEqual(T);
      // And the row stays inside the corridor it is standing in.
      expect(w.y!).toBeGreaterThan(CY0);
      expect(w.y! + w.h!).toBeLessThan(CY1);
    }
  });
});

/**
 * The light over the crates, and the beat it gives the end of the sequence.
 *
 * Michele, 25 Sep 2026: *"If we want to handle the light change, we could do
 * this. There's a light on the crates, robot exit fully visible. Light
 * (emergency light?) flickers and stops, robots light up -> transition to
 * game."*
 *
 * The numbers are here rather than in the renderer because the fitting, the point
 * light and the work light on the boarding all read the same one (CLAUDE.md), so
 * this is where "it flickers and then it is gone" is actually true or not.
 */
describe('the emergency fitting over the crates', () => {
  it('is lit for the whole presentation', () => {
    for (let t = 0; t <= WALK_AT; t += 0.05) {
      expect(emergencyAt(t), `dark at t=${t.toFixed(2)}, mid-presentation`).toBe(1);
    }
  });

  it('flickers — strikes and half-recoveries, not a fade', () => {
    const step = FLICKER_TIME / 240;
    let dark = 0;
    let backOn = 0;
    let was = 1;
    for (let t = WALK_AT; t < WALK_AT + FLICKER_TIME; t += step) {
      const v = emergencyAt(t);
      expect(v, `out of range at t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(0);
      expect(v, `out of range at t=${t.toFixed(2)}`).toBeLessThanOrEqual(1);
      if (was > 0 && v === 0) dark++;
      if (was === 0 && v > 0) backOn++;
      was = v;
    }
    expect(dark, 'it faded instead of striking').toBeGreaterThanOrEqual(3);
    expect(backOn, 'it went out once and stayed out — that is a switch, not a failing tube').toBeGreaterThanOrEqual(2);
  });

  it('never comes back to full once it has started going', () => {
    for (let t = WALK_AT + 0.01; t < WALK_AT + FLICKER_TIME; t += 0.01) {
      expect(emergencyAt(t), `full brightness again at t=${t.toFixed(2)}`).toBeLessThan(1);
    }
  });

  it('is dead, and stays dead, before the chapter takes over', () => {
    expect(emergencyAt(WALK_AT + FLICKER_TIME)).toBe(0);
    expect(emergencyAt(OVER_AT)).toBe(0);
    expect(emergencyAt(OVER_AT + 10)).toBe(0);
    // ...with a beat in the dark first: their own three lamps, and nothing else,
    // which is the game the player is about to be handed.
    expect(OVER_AT - (WALK_AT + FLICKER_TIME)).toBeCloseTo(DARK_HOLD, 6);
  });

  it('hands the sequence over after the flicker, not before it', () => {
    // `game.ts` used to end the opening on `walking`, which is the instant the
    // last robot is standing — so the camera pull-back and the presentation
    // light's hand-off, both written for it, had never played.
    expect(openingAt(WALK_AT).walking).toBe(true);
    expect(openingAt(WALK_AT).over, 'the shot was cut before the light went').toBe(false);
    expect(openingAt(OVER_AT - 0.01).over).toBe(false);
    expect(openingAt(OVER_AT).over).toBe(true);
    expect(openingAt(OVER_AT).emergency).toBe(0);
  });
});
