/**
 * The opening sequence: three crates, three presentations, one transition.
 *
 * What these hold is the pair of things that went wrong when it was first built
 * and that no other test would catch: a robot driven faster than it can
 * physically move, and a sequence whose beats have drifted out of the order
 * they are meant to play in.
 */

import { describe, expect, it } from 'vitest';

import { DEFS } from '../src/sim/constants';
import {
  CARDS,
  CRATE_AT,
  CRATE_RECTS,
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
  openingAt,
} from '../src/sim/opening';
import { DT_MAX, createGame, type DebugGame, type RobotKind } from '../src/sim';
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
      const stand = STAND_AT[c.kind];
      expect(stand.y - (c.y + c.h), `${c.kind} stands inside his own crate`).toBeGreaterThan(DEFS[c.kind].r);
    }
  });

  it('leaves the crates solid once the chapter takes over', () => {
    const g: DebugGame = createGame({ seed: 20260930, chapter: 1, cards: false });
    const crates = g.debug.walls().filter((w) => w.kind === 'crate');
    expect(crates, 'the crates stopped being obstacles').toHaveLength(3);
    for (const w of crates) {
      expect(w.why, 'a wall with no voice').toBeTypeOf('function');
      // Against the corridor's north wall, leaving the lane clear: the deepest
      // crate is Biggy's at 1.78 m.
      expect(w.y! + w.h!).toBeLessThanOrEqual(307 + 1e-6);
      expect(w.y!).toBeGreaterThanOrEqual(307 - 1.78 * PX_PER_M - 1e-6);
    }
  });
});
