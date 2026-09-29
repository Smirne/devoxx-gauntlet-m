/**
 * ROOM 8, RAKED — heights only, and the heights are the rows'.
 *
 * The rake (`KEYNOTE_RAKE`) sinks Room 8's seats into a pit: the door and the
 * cross-aisle stay at corridor level and the rows step down to the stage. The
 * 3D build draws it as rows, one flat tread per row, and it read everything
 * that stands in the room off a SMOOTH slope — so a spotlight or a robot
 * mid-row stood up to a step below the tread it was on (Michele, 29 Sep: "the
 * projectors are eaten by the pavement"). The plate now climbs in treads
 * (`Plate.steps`), and this file pins that the sim's treads are the drawn rows
 * and that chapter 4 still plays from start to video with the rake on: it is
 * heights only, so nothing a robot does may change.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type KeynoteState } from '../src/sim';
import { KEYNOTE_RAKE, RAKE_DEPTH } from '../src/sim/chapters/ch4-keynote';
import { plateRiseM } from '../src/sim/surface';
import type { Plate } from '../src/sim/types';
import { driveChapter4 } from './pilot';

describe('a plate that climbs in treads', () => {
  const p: Plate = { x: 0, y: 0, w: 10, h: 70, lo: -2.1, hi: 0, axis: 'y', steps: 7 };

  it('stands every point of a tread at the height of the tread', () => {
    for (let k = 0; k < 7; k++) {
      const tread = -2.1 * (1 - (k + 1) / 7);
      for (const f of [0.02, 0.5, 0.98]) {
        expect(plateRiseM(p, 5, 10 * k + 10 * f), `tread ${k} at ${f}`).toBeCloseTo(tread, 9);
      }
    }
  });

  it('never climbs past its own ends', () => {
    expect(plateRiseM(p, 5, 70)).toBeCloseTo(0, 9);
    expect(plateRiseM(p, 5, 500)).toBeCloseTo(0, 9);
    expect(plateRiseM(p, 5, -50)).toBeCloseTo(-2.1 * (1 - 1 / 7), 9);
  });

  it('is the smooth ramp it always was without `steps`', () => {
    const smooth: Plate = { ...p, steps: undefined };
    expect(plateRiseM(smooth, 5, 35)).toBeCloseTo(-1.05, 9);
  });
});

describe('chapter 4 with the rake on', () => {
  it('climbs one tread per row of seats, and still plays through to the video', { timeout: 60000 }, () => {
    KEYNOTE_RAKE.on = true;
    try {
      const g = createGame({ seed: 20260930, chapter: 4, cards: false });
      g.update(DT_MAX);
      const s = g.snapshot();
      const rake = (s.plates ?? []).find((q) => q.kind === 'rake');
      expect(rake, 'no rake plate with the rake on').toBeDefined();
      const rows = s.props.filter((q) => q.kind === 'seatrow');
      expect(rows.length).toBeGreaterThan(0);
      // The drawn rows are 18 px deep (keynote3d.ts builds one slab per tread).
      expect(rake!.steps).toBe(Math.round((rows[0].h ?? 0) / 18));
      expect(rake!.lo).toBe(-RAKE_DEPTH);

      driveChapter4(g);
      const k = g.debug.chapter() as KeynoteState;
      expect(k.cake, 'the cake never reached its mark').toBe(true);
      expect(k.ready, 'the stage never came ready').toBe(true);
      expect(g.snapshot().reel, 'the opening video never started').not.toBeNull();
    } finally {
      KEYNOTE_RAKE.on = false;
    }
  });
});
