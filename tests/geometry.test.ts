/**
 * THE FLOOR-PLAN FIDELITY CHECK, AT DATA LEVEL (GAUNTLET.md Stage 1, piece 1).
 *
 * The critic's version of this check is visual: a top-down screenshot of the
 * rendered map overlaid on `plans/devoxx-rooms-stairs-annotated.png`. That check can
 * only pass if the *data* is right, and the renderer builds from `src/sim/geometry`,
 * so everything the overlay looks at — room count, which side each room is on, their
 * relative widths, one doorway each, and **both** staircase positions — is asserted
 * here. A red test here means the overlay cannot pass, whatever the renderer does.
 *
 * Both floors are rotated 90 degrees from the plans so the corridor runs left to
 * right: plan top becomes world left. See the header of `src/sim/geometry.ts`.
 */

import { describe, expect, it } from 'vitest';

import { DEFS, H, T, W } from '../src/sim/constants';
import {
  CY0,
  CY1,
  DOOR,
  F1,
  GF,
  HALL_COLUMNS,
  LOBBY_COLUMNS,
  LOBBY_PLANTERS,
  LOBBY_RISE_M,
  NICHE_MOUTH,
  R,
  ROOM_D,
  SPONSORS,
  floor1Walls,
  groundRiseM,
  groundWalls,
  nicheMidLanding,
  nicheMouth,
  nicheRamps,
  rooms,
  roomDoor,
  roomFrontage,
  stairDoor,
  stairDoors,
  stairFlightRect,
  stairLanding,
  stairMidLanding,
  stairRamps,
} from '../src/sim/geometry';
import type { Rect, RoomDef, Vec2, Wall } from '../src/sim/types';
import { ROBOT_HEIGHT_M } from '../src/sim/units';

const DEVOXX = [3, 4, 5, 6, 7, 8, 9, 10];
const CLOSED = ['A', 'B', 'C', 'D', 'E'];

const right = (r: RoomDef): number => r.x + r.w;

/** The gaps left in one corridor wall — the doorways, the stair niche, the foyer mouth. */
function corridorGaps(side: -1 | 1): Array<[number, number]> {
  const yy = side < 0 ? CY0 - T : CY1;
  const segs = floor1Walls()
    .filter((w) => w.y === yy && w.h === T)
    .sort((a, b) => a.x - b.x);
  expect(segs.length).toBeGreaterThan(1);
  const gaps: Array<[number, number]> = [];
  for (let i = 1; i < segs.length; i++) {
    const end = segs[i - 1].x + segs[i - 1].w;
    if (segs[i].x > end) gaps.push([end, segs[i].x]);
  }
  return gaps;
}

/**
 * Can a robot of radius `r` actually walk from `a` to `b` across the exhibition
 * level? A flood fill on a 5 px lattice, which is the only way to assert "this is
 * the ONLY route" rather than "this route exists".
 */
function canWalk(a: Vec2, b: Vec2, r: number, extra: Wall[] = []): boolean {
  const STEP = 5;
  const walls = [...groundWalls(), ...extra].filter((w) => !w.hidden);
  const nx = Math.ceil(W / STEP);
  const ny = Math.ceil(H / STEP);
  const seen = new Uint8Array(nx * ny);
  const idx = (ix: number, iy: number): number => iy * nx + ix;
  /*
   * Blocked cells, rasterised once per wall instead of tested per cell.
   *
   * Same circle-vs-rect test as before, evaluated only where it can possibly be
   * true — the cells inside the wall grown by `r`. The old form was cells x
   * walls (9.6M checks a call once the 2026-09-23 collider sweep roughly doubled
   * the wall list), and it put this file over vitest's 5 s default on a loaded
   * machine. Nothing about the answer changes.
   */
  const blocked = new Uint8Array(nx * ny);
  for (const w of walls) {
    const i0 = Math.max(0, Math.floor((w.x - r) / STEP));
    const i1 = Math.min(nx - 1, Math.ceil((w.x + w.w + r) / STEP));
    const j0 = Math.max(0, Math.floor((w.y - r) / STEP));
    const j1 = Math.min(ny - 1, Math.ceil((w.y + w.h + r) / STEP));
    for (let ix = i0; ix <= i1; ix++) {
      for (let iy = j0; iy <= j1; iy++) {
        if (blocked[idx(ix, iy)]) continue;
        const x = ix * STEP;
        const y = iy * STEP;
        const cx = Math.max(w.x, Math.min(x, w.x + w.w));
        const cy = Math.max(w.y, Math.min(y, w.y + w.h));
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) blocked[idx(ix, iy)] = 1;
      }
    }
  }
  const free = (ix: number, iy: number): boolean => blocked[idx(ix, iy)] === 0;
  const start = [Math.round(a.x / STEP), Math.round(a.y / STEP)] as const;
  const goal = [Math.round(b.x / STEP), Math.round(b.y / STEP)] as const;
  expect(free(start[0], start[1]), 'start is inside a wall').toBe(true);
  expect(free(goal[0], goal[1]), 'goal is inside a wall').toBe(true);
  const queue: Array<[number, number]> = [[start[0], start[1]]];
  seen[idx(start[0], start[1])] = 1;
  while (queue.length) {
    const [ix, iy] = queue.pop() as [number, number];
    if (ix === goal[0] && iy === goal[1]) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as Array<[number, number]>) {
      const jx = ix + dx;
      const jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      if (seen[idx(jx, jy)]) continue;
      seen[idx(jx, jy)] = 1;
      if (free(jx, jy)) queue.push([jx, jy]);
    }
  }
  return false;
}

describe('the rooms', () => {
  it('13 rooms: the 8 numbered Devoxx rooms 3..10 and the 5 closed cinema rooms A..E', () => {
    expect(rooms).toHaveLength(13);
    const numbered = rooms.filter((r) => !r.closed).map((r) => r.n);
    const closed = rooms.filter((r) => r.closed).map((r) => r.n);
    expect(numbered.slice().sort((a, b) => Number(a) - Number(b))).toEqual(DEVOXX);
    expect(closed.slice().sort()).toEqual(CLOSED);
    expect(numbered).toHaveLength(8);
    expect(closed).toHaveLength(5);
  });

  it('3, 4, 5, 6 run along the bottom and 10, 9, 8, 7 along the top', () => {
    for (const n of [3, 4, 5, 6]) expect(R(n).side).toBe(1);
    for (const n of [10, 9, 8, 7]) expect(R(n).side).toBe(-1);
    // ...in that order, left to right, as on the plan.
    const leftToRight = (ns: number[]): number[] => ns.map((n) => R(n).x);
    expect(leftToRight([3, 4, 5, 6])).toEqual([...leftToRight([3, 4, 5, 6])].sort((a, b) => a - b));
    expect(leftToRight([10, 9, 8, 7])).toEqual([...leftToRight([10, 9, 8, 7])].sort((a, b) => a - b));
  });

  it('each room faces its opposite number across the corridor', () => {
    for (const [top, bottom] of [
      [10, 3],
      [9, 4],
      [8, 5],
      [7, 6],
    ]) {
      expect(R(top).x).toBe(R(bottom).x);
      expect(R(top).w).toBe(R(bottom).w);
    }
  });

  it('room 8 is the widest Devoxx room — the keynote room', () => {
    const r8 = R(8);
    for (const n of DEVOXX) expect(r8.w).toBeGreaterThanOrEqual(R(n).w);
    for (const n of [10, 9, 7]) expect(r8.w).toBeGreaterThan(R(n).w);
    expect(r8.n).toBe(8);
  });

  it('every room backs onto the corridor, and none of them leaves the sim rect', () => {
    for (const r of rooms) {
      if (r.side < 0) expect(r.y + r.h).toBe(CY0);
      else expect(r.y).toBe(CY1);
      expect(r.y).toBeGreaterThanOrEqual(T);
      expect(r.y + r.h).toBeLessThanOrEqual(700 - T);
    }
    // The corridor band. 130, not the prototype's 100: on the plan the corridor
    // measures 147 px against room 4's 251 of depth (0.586), and 130 against this
    // module's 224 base depth is 0.580. See the CY0 comment in src/sim/geometry.ts.
    expect(CY1 - CY0).toBe(130);
    expect((CY1 - CY0) / ROOM_D).toBeGreaterThan(0.54);
  });

  /**
   * THE STEPPED OUTER ENVELOPE.
   *
   * The plan's four auditorium pairs are four different depths, and rooms 5 and 8
   * bulge past their neighbours on both sides — that silhouette is what a judge's
   * overlay recognises as the Kinepolis first floor. The prototype gave all eight
   * one constant depth, so the biggest room in the venue was the same box as the
   * smallest. These ratios are measured off
   * `plans/devoxx-rooms-stairs-annotated.png` and normalised to room 4/9.
   */
  it('steps the outer envelope exactly as the plan does, per room', () => {
    const rel = (n: number): number => R(n).h / R(4).h;
    for (const [n, want] of [
      [3, 207 / 251],
      [10, 206 / 251],
      [9, 252 / 251],
      [5, 298 / 251],
      [8, 298 / 251],
      [6, 251 / 251],
      [7, 201 / 251],
    ] as const) {
      expect(rel(n), `room ${n} depth relative to room 4`).toBeCloseTo(want, 1);
    }
    // 5/8 is the deepest pair and it really does stand proud of its neighbours.
    for (const n of [3, 4, 6, 7, 9, 10]) expect(R(8).h).toBeGreaterThan(R(n).h);
    expect(R(5).h).toBe(R(8).h);
    // 3/10 are shallower than 4/9, and 7 is the shallowest of the lot.
    expect(R(3).h).toBeLessThan(R(4).h);
    expect(R(10).h).toBeLessThan(R(9).h);
    for (const n of [3, 4, 5, 6, 8, 9, 10]) expect(R(7).h).toBeLessThanOrEqual(R(n).h);
    // Room 4/9 is the anchor the rest are scaled from.
    expect(R(4).h).toBe(ROOM_D);
    expect(R(9).h).toBe(ROOM_D);
  });

  /**
   * WIDTH ALONG THE CORRIDOR. On the plan 6/7 is effectively the same size as 4/9
   * (177 vs 174 plan px) and clearly the second-widest pair; the prototype made it
   * 18% narrower than 4/9 and barely wider than 3/10.
   */
  it('gives the four pairs the plan\'s widths along the corridor', () => {
    const total = [10, 9, 8, 7].reduce((s, n) => s + R(n).w, 0);
    for (const [n, want] of [
      [10, 145 / 720],
      [9, 174 / 720],
      [8, 224 / 720],
      [7, 177 / 720],
    ] as const) {
      expect(R(n).w / total, `room ${n} share of the corridor`).toBeCloseTo(want, 2);
    }
    // 6/7 is the second-widest pair, not the second-narrowest.
    expect(R(7).w).toBeGreaterThan(R(9).w);
    expect(R(7).w).toBeLessThan(R(8).w);
  });

  it('the closed cinema section is behind the fire door, the Devoxx rooms beyond it', () => {
    for (const r of rooms.filter((x) => x.closed)) expect(right(r)).toBeLessThanOrEqual(F1.fireX);
    for (const r of rooms.filter((x) => !x.closed)) expect(r.x).toBeGreaterThanOrEqual(F1.fireX);
  });

  it('rooms on the same side never overlap', () => {
    for (const side of [-1, 1] as const) {
      const row = rooms.filter((r) => r.side === side).sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) {
        expect(row[i].x).toBeGreaterThanOrEqual(right(row[i - 1]));
      }
    }
  });
});

describe('doorways', () => {
  it('every room has exactly one doorway gap onto the corridor', () => {
    for (const side of [-1, 1] as const) {
      const gaps = corridorGaps(side);
      for (const r of rooms.filter((x) => x.side === side)) {
        const mine = gaps.filter(([a, b]) => (a + b) / 2 > r.x && (a + b) / 2 < right(r));
        expect(mine, `room ${String(r.n)} doorways`).toHaveLength(1);
        const [a, b] = mine[0];
        const door = roomDoor(r);
        const [lo, hi] = roomFrontage(r);
        expect(b - a).toBe(DOOR);
        expect(a).toBe(door.x);
        // Centred on the frontage the room actually has. For six of the eight
        // that is the whole room; for 4 and 9 it is the stretch the staircase
        // standing in front of them leaves (`roomFrontage`).
        expect((a + b) / 2).toBe((lo + hi) / 2);
        expect(a).toBeGreaterThanOrEqual(lo);
        expect(b).toBeLessThanOrEqual(hi);
      }
    }
  });

  /*
   * The staircases are NOT holes in the corridor wall any more.
   *
   * They stand in the corridor against it (`F1.nicheTop`), so the wall runs
   * unbroken behind them and the only gaps left in it are doorways and the foyer.
   * The one wall segment behind each mouth is still emitted — tagged `stair` for
   * the renderer — which is why it is not a gap.
   */
  it('the only gap that is not a doorway is the foyer mouth', () => {
    const top = corridorGaps(-1);
    const bottom = corridorGaps(1);
    expect(top).toHaveLength(rooms.filter((r) => r.side === -1).length);
    expect(bottom).toHaveLength(rooms.filter((r) => r.side === 1).length + 1);
    for (const [niche, gaps] of [
      [F1.nicheTop, top],
      [F1.nicheBot, bottom],
    ] as const) {
      const m = nicheMouth(niche);
      expect(gaps).not.toContainEqual([m.x, m.x + m.w]);
      expect(gaps).not.toContainEqual([niche.x, niche.x + niche.w]);
    }
    expect(bottom).toContainEqual([F1.foyer.x, F1.foyer.x + F1.foyer.w]);
  });

  it('a doorway is wide enough for Biggy and narrow enough to read as a door', () => {
    expect(DOOR).toBeGreaterThan(2 * 17); // Biggy's diameter
    expect(DOOR).toBeLessThan(ROOM_D / 3);
  });
});

describe('the staircases — both of them, exactly where the plan puts them', () => {
  /*
   * MOVED 24 Sep 2026, and this test is the one that used to hold them wrong.
   *
   * It asserted the staircases against the prose — "in the gap between 10|9 and
   * 3|4" — which is what CLAUDE.md, GAUNTLET.md and plans/README.md all said and
   * what the plan does not draw. Michele, asked which to follow: *"Follow the plan
   * — move them"*, then *"follow the devoxx plant, not the plan.md"*. So this now
   * asserts the drawing: level with rooms 4 and 9, standing IN the corridor.
   */
  it('the secondary staircases stand in the corridor, across rooms 4 and 9\'s frontage', () => {
    for (const [side, niche, roomN] of [
      [-1, F1.nicheTop, 9],
      [1, F1.nicheBot, 4],
    ] as const) {
      const r = R(roomN);
      // Along the corridor: inside that room's own frontage, and well inside it —
      // the plan leaves 107.5 px of frontage west of the flight and 80.3 east.
      expect(niche.x).toBeGreaterThan(r.x);
      expect(niche.x + niche.w).toBeLessThan(right(r));
      // It is NOT in the gap between 10|9 or 3|4, which is where the build had it.
      const before = R(roomN === 9 ? 10 : 3);
      expect(niche.x).toBeGreaterThan(right(before) + 100);
      // Across the corridor: standing in it, hard against the wall, not recessed
      // behind it. The wall behind it is unbroken (see the doorway tests).
      if (side < 0) {
        expect(niche.y).toBe(CY0);
        expect(niche.y + niche.h).toBeLessThan(CY1);
      } else {
        expect(niche.y + niche.h).toBe(CY1);
        expect(niche.y).toBeGreaterThan(CY0);
      }
      // ...and it leaves most of the corridor to walk down.
      expect(CY1 - CY0 - niche.h).toBeGreaterThan(100);
    }
  });

  it('the two niches face each other across the corridor', () => {
    expect(F1.nicheTop.x).toBe(F1.nicheBot.x);
    expect(F1.nicheTop.w).toBe(F1.nicheBot.w);
    // Both lead down to the exhibition hall, which is why there are two of them.
    expect(GF.stairs.map((s) => s.to).sort()).toEqual(['bot', 'top']);
  });

  it('the main staircase is at the corridor\'s end, between rooms 6 and 7', () => {
    const m = F1.mainStair;
    // Flush with the end of the corridor.
    expect(m.x + m.w).toBe(W - T);
    // Beyond the far edge of both rooms 6 and 7, and beyond both their doorways.
    expect(m.x + m.w).toBeGreaterThan(right(R(6)));
    expect(m.x + m.w).toBeGreaterThan(right(R(7)));
    expect(m.x).toBeGreaterThan(roomDoor(R(6)).cx);
    expect(m.x).toBeGreaterThan(roomDoor(R(7)).cx);
    // Between them: inside the corridor band, with 7 above it and 6 below it.
    expect(m.y).toBeGreaterThanOrEqual(CY0);
    expect(m.y + m.h).toBeLessThanOrEqual(CY1);
    expect(R(7).y + R(7).h).toBeLessThanOrEqual(m.y);
    expect(R(6).y).toBeGreaterThanOrEqual(m.y + m.h);
    // ...and further along the corridor than the secondary staircases.
    expect(m.x).toBeGreaterThan(F1.nicheTop.x);
  });

  it('all three staircase mouths are tagged for the renderer', () => {
    const walls = floor1Walls();
    const tagged = (s: number): Wall[] => walls.filter((w) => w.stair === s);
    expect(tagged(-1)).toHaveLength(1); // top niche
    expect(tagged(1)).toHaveLength(1); // bottom niche
    expect(tagged(0)).toHaveLength(1); // main staircase
    expect(tagged(0)[0].x).toBe(F1.mainStair.x + F1.mainStair.w);
  });
});

/*
 * THE STAIRCASES, PINNED TO THE PLAN PIXELS THEY WERE MEASURED FROM.
 *
 * Michele has now reported the secondary staircases three times — "in the wrong
 * place... lateral in the real hallway", "they seem fit for biggy to pass, make the
 * passage more narrow" and "the stairs position on the upper wall haven't been
 * fixed". The tests above assert the staircases against each OTHER and against the
 * rooms, which is why the build kept passing them while being wrong. These assert
 * them against the plan's own pixels, so the arithmetic in `geometry.ts`'s doc
 * comments is executable rather than decorative.
 *
 * Every number below carries the plan measurement that produced it. Change one only
 * by re-measuring the PNG.
 */
describe('the staircases against the plan pixels', () => {
  /*
   * `plans/devoxx-rooms-stairs-annotated.png`, 996 x 1498, re-measured 24 Sep 2026
   * and cross-checked against the unannotated `devoxx-rooms-plain.png`:
   *   corridor, clear between the room walls  plan x 503..650  = 147
   *   both secondary flights, along the corridor  plan y 884..947 = 64 (rect [884,948))
   *   both secondary flights, deep into the corridor  20 (x 506..527 and 627..647)
   *   rooms 4 and 9, along the corridor  plan y 821..995 = 174
   */
  const PLAN = {
    corridorW: 147,
    flightDeep: 20,
    flightLong: 64,
    /** Plan y of the first row of treads, and of room 4/9's own leading edge. */
    flightStartY: 884,
    room49StartY: 821,
    room49Long: 174,
  } as const;

  /**
   * Plan y -> world x, anchored on room 4/9 exactly as `geometry.ts` is: that room
   * is 174 plan px long and `R(4).w` sim px wide, and it starts at `R(4).x`.
   */
  const alongCorridor = (planY: number): number =>
    R(4).x + ((planY - PLAN.room49StartY) * R(4).w) / PLAN.room49Long;

  it('the corridor is the plan\'s 147 plan px wide, which is the ruler for the rest', () => {
    // 130 sim px across 147 plan px: the one scale on this floor that is not
    // stretched, and therefore the only honest way to turn a plan px into a metre.
    expect(CY1 - CY0).toBe(130);
  });

  it('the secondary-staircase mouth is the plan\'s flight width, and Biggy does not fit', () => {
    // 20/147 of a 130 px corridor.
    const measured = (PLAN.flightDeep / PLAN.corridorW) * (CY1 - CY0);
    expect(NICHE_MOUTH).toBeCloseTo(measured, 1);
    // 1.41 m at PX_PER_M, against Biggy's 1.44 m. The relationship, not the number:
    // this is note 18 in docs/playtest-notes.md, and it is the whole point of the
    // mouth being narrower than the well behind it.
    expect(NICHE_MOUTH).toBeLessThan(DEFS.biggy.r * 2);
    expect(NICHE_MOUTH).toBeGreaterThan(DEFS.droid.r * 2);
  });

  it('the flight reaches the plan\'s 20 plan px out from the wall, and no further', () => {
    // The flight's own width, which is how far it stands out from the wall it
    // hugs: 20 plan px of the corridor's 147, carried at 130/147. The same number
    // as `NICHE_MOUTH`, and that is not a coincidence — see `geometry.ts`.
    const measured = PLAN.flightDeep * ((CY1 - CY0) / PLAN.corridorW);
    for (const n of [F1.nicheTop, F1.nicheBot]) expect(n.h).toBeCloseTo(measured, 1);
    expect(NICHE_MOUTH).toBeCloseTo(measured, 1);
    // Deep enough that chapter 1's closing cutscene still walks INTO it: Droid is
    // the widest robot that may take these stairs.
    for (const n of [F1.nicheTop, F1.nicheBot]) expect(n.h).toBeGreaterThan(DEFS.droid.r * 2);
  });

  /*
   * THE FAULT MICHELE REPORTED THREE TIMES, PINNED TO THE PIXEL.
   *
   * *"in the wrong place... lateral in the real hallway"*, *"they seem fit for
   * biggy to pass"*, *"the stairs position on the upper wall haven't been fixed"*.
   * The first two were fixed; this is the third, and it is the ALONG-CORRIDOR
   * position, which nothing asserted until now — which is exactly why the build
   * kept passing while being 148 px wrong.
   */
  it('runs the plan\'s own 64 plan px along the corridor', () => {
    const measured = (PLAN.flightLong * R(4).w) / PLAN.room49Long;
    for (const n of [F1.nicheTop, F1.nicheBot]) expect(n.w).toBeCloseTo(measured, 0);
    // A flight six times as long as it is wide, which is what a stair is.
    for (const n of [F1.nicheTop, F1.nicheBot]) expect(n.w / n.h).toBeGreaterThan(5);
  });

  it('starts where the plan starts it: 63 plan px into room 4 and 9, not in the 3|4 gap', () => {
    // plan y 884 is 63 px into room 4/9's own 174 — level with the 4 and 9
    // numerals. Through the anchor above that is world x 1005.5.
    const want = alongCorridor(PLAN.flightStartY);
    expect(want).toBeCloseTo(1005.5, 0);
    for (const n of [F1.nicheTop, F1.nicheBot]) expect(n.x).toBeCloseTo(want, 0);
    for (const n of [F1.nicheTop, F1.nicheBot]) {
      expect(n.x + n.w).toBeCloseTo(alongCorridor(PLAN.flightStartY + PLAN.flightLong), 0);
    }
    // The old position, which the prose called non-negotiable and the drawing does
    // not support: in the 40 px gap the layout leaves between 10|9 and 3|4.
    const oldGap = [right(R(3)), R(4).x] as const;
    for (const n of [F1.nicheTop, F1.nicheBot]) {
      expect(n.x, 'the staircase is back in the 3|4 gap').toBeGreaterThan(oldGap[1]);
    }
    expect(F1.nicheTop.x - oldGap[0]).toBeGreaterThan(140);
  });

  it('puts rooms 4 and 9\'s doorway beside the flight, never behind it', () => {
    for (const n of [4, 9] as const) {
      const d = roomDoor(R(n));
      const niche = R(n).side < 0 ? F1.nicheTop : F1.nicheBot;
      // The whole opening is clear of the flight's footprint...
      expect(d.x + d.w).toBeLessThanOrEqual(niche.x);
      // ...and still on its own room's frontage.
      expect(d.x).toBeGreaterThanOrEqual(R(n).x);
      expect(d.x + d.w).toBeLessThanOrEqual(right(R(n)));
      // A centred door — what `roomDoor` gives every other room — would be inside
      // the flight, which is the second thing the move broke.
      const centred = R(n).x + R(n).w / 2;
      expect(centred).toBeGreaterThan(niche.x);
      expect(centred).toBeLessThan(niche.x + niche.w);
    }
  });

  it('the two secondary staircases are exactly opposite each other, as the plan draws them', () => {
    // Plan y 884..947 on BOTH corridor walls — identical, not merely similar.
    expect(F1.nicheTop.x).toBe(F1.nicheBot.x);
    expect(F1.nicheTop.w).toBe(F1.nicheBot.w);
    expect(F1.nicheTop.h).toBe(F1.nicheBot.h);
    expect(nicheMouth(F1.nicheTop).x).toBe(nicheMouth(F1.nicheBot).x);
  });

  /**
   * ONE staircase upstairs too, and you step on at the END of it.
   *
   * Michele, 24 Sep 2026, on the plan symbol: *"This makes it look like there's a
   * center, and 2 descent. I think it's a mid plane between two ramps of stairs.
   * In this picture stairs go south to north."* The build had a walkable square in
   * the middle with a run falling away either side; the drawing has two ramps, a
   * half-landing between them, and the head at the end the ground floor's own
   * doors put it — world east. See `nicheMouth` for the derivation.
   */
  it('heads each upstairs flight at its east end, with a half-landing mid-run', () => {
    for (const [name, niche] of [
      ['top', F1.nicheTop],
      ['bot', F1.nicheBot],
    ] as const) {
      const mouth = nicheMouth(niche);
      // The head is the EAST end of the flight, not its middle.
      expect(mouth.x + mouth.w, `the ${name} head is not flush with the east end`).toBeCloseTo(niche.x + niche.w, 6);
      expect(mouth.w).toBe(NICHE_MOUTH);
      // The centre of the flight — where the head used to be — is now flight.
      const centre = niche.x + niche.w / 2;
      expect(centre, `the ${name} flight's centre is still the way on`).toBeLessThan(mouth.x);

      // One half-landing, well inside the run, with a ramp either side of it.
      const mid = nicheMidLanding(niche);
      const [upper, lower] = nicheRamps(niche);
      expect(mid.x).toBeGreaterThan(niche.x);
      expect(mid.x + mid.w).toBeLessThan(mouth.x);
      expect(mid.w / niche.w).toBeGreaterThan(0.08);
      expect(mid.w / niche.w).toBeLessThan(0.25);
      // Foot, lower ramp, half-landing, upper ramp, head — tiling the flight.
      expect(lower.x).toBe(niche.x);
      expect(lower.x + lower.w).toBe(mid.x);
      expect(upper.x).toBe(mid.x + mid.w);
      expect(upper.x + upper.w).toBeCloseTo(niche.x + niche.w, 6);
      // The plan's two runs are 26 and 27 plain px — near enough equal, and the
      // mouth is the top step OF the upper one rather than a bite out of it.
      expect(Math.abs(upper.w - lower.w) / niche.w).toBeLessThan(0.05);
      expect(lower.w).toBeGreaterThan(20);
      expect(upper.w).toBeGreaterThan(20);
    }
  });

  /*
   * `plans/exhibition-floor-stairs-annotated.png`, 900 x 1141, the two shafts
   * Michele circled. Head wall plan y 165, foot wall plan y 323; west shaft
   * plan x 222..269, east shaft plan x 421..469. Through the calibrated mapping in
   * docs/ground-floor-lobby-fix.md:
   *     world_x = 30 + (plan_y -  85) * 1.4326
   *     world_y = 90 + (700 - plan_x) * 0.9375
   */
  const gx = (planY: number): number => 30 + (planY - 85) * 1.4326;
  const gy = (planX: number): number => 90 + (700 - planX) * 0.9375;

  it('puts both exhibition-hall shafts where the plan draws them', () => {
    const [top, bot] = GF.stairs;
    expect(top.to).toBe('top');
    expect(bot.to).toBe('bot');

    // Both run from the head wall to the foot wall, the same length, the same x.
    for (const s of GF.stairs) {
      expect(s.x).toBeCloseTo(gx(165), 0); // 144.6
      expect(s.x + s.w).toBeCloseTo(gx(323), 0); // 370.0
    }

    // East shaft on the plan is the world-TOP one: plan x 469..421.
    expect(top.y).toBeCloseTo(gy(469), 0); // 306.6
    expect(top.y + top.h).toBeCloseTo(gy(421), 0); // 351.6
    // West shaft on the plan is the world-BOT one: plan x 269..222.
    expect(bot.y).toBeCloseTo(gy(269), 0); // 494.1
    expect(bot.y + bot.h).toBeCloseTo(gy(222), 0); // 538.1
  });

  it('leaves the plan\'s hall between the two shafts, not half of it', () => {
    const [top, bot] = GF.stairs;
    // Plan x 269..421 of clear hall between the east shaft and the west one.
    expect(bot.y - (top.y + top.h)).toBeCloseTo((421 - 269) * 0.9375, 0); // 142.5
    // The prototype left 70. Anything near that is the bug coming back.
    expect(bot.y - (top.y + top.h)).toBeGreaterThan(120);
  });

  it('keeps both shafts clear of the sponsor stands and the technical room', () => {
    for (const s of GF.stairs) {
      const shaft: Rect = { x: s.x, y: s.y, w: s.w, h: s.h };
      for (const b of GF.booths) {
        const hit = shaft.x < b.x + b.w && shaft.x + shaft.w > b.x && shaft.y < b.y + b.h && shaft.y + shaft.h > b.y;
        expect(hit, `booth ${b.name} is inside the ${s.to} staircase`).toBe(false);
      }
      for (const [name, b] of [
        ['technical room', GF.tech],
        ['catering court', GF.food.court],
        ['small staircase', GF.smallStairs],
      ] as const) {
        const hit = shaft.x < b.x + b.w && shaft.x + shaft.w > b.x && shaft.y < b.y + b.h && shaft.y + shaft.h > b.y;
        expect(hit, `${name} is inside the ${s.to} staircase`).toBe(false);
      }
      // ...and inside the hall that holds them.
      expect(s.x).toBeGreaterThanOrEqual(GF.hall.x);
      expect(s.y).toBeGreaterThanOrEqual(GF.hall.y);
      expect(s.y + s.h).toBeLessThanOrEqual(GF.hall.y + GF.hall.h);
    }
  });

  it('keeps chapter 3\'s west visitor lane out of the shafts', () => {
    const lane = GF.laneX[0];
    for (const s of GF.stairs) expect(lane, `lane ${lane} is inside the ${s.to} staircase`).toBeGreaterThan(s.x + s.w + 8);
    // ...and still west of the booth grid it serves.
    expect(lane + 8).toBeLessThan(Math.min(...GF.booths.map((b) => b.x)));
  });
});

describe('the ground floor', () => {
  it('the hall holds twelve named sponsor booths', () => {
    expect(GF.booths).toHaveLength(12);
    expect(SPONSORS).toHaveLength(12);
    expect(new Set(GF.booths.map((b) => b.name)).size).toBe(12);
    // Some are half tables Voxxy fits under; the rest are built booths.
    const tables = GF.booths.filter((b) => b.table);
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.length).toBeLessThan(GF.booths.length);
  });

  it('the two staircases up sit on the hall side, one per cinema-corridor niche', () => {
    expect(GF.stairs).toHaveLength(2);
    for (const s of GF.stairs) {
      expect(s.x).toBeGreaterThanOrEqual(GF.hall.x);
      expect(s.x + s.w).toBeLessThanOrEqual(GF.hall.x + GF.hall.w);
    }
    expect(GF.stairs[0].y).toBeLessThan(GF.stairs[1].y);
  });

  it('the roller door is the badge store\'s only way in from the hall', () => {
    expect(GF.roller.x + GF.roller.w).toBeLessThanOrEqual(GF.store.x);
    expect(GF.roller.y).toBeGreaterThanOrEqual(GF.store.y);
    expect(GF.roller.y + GF.roller.h).toBeLessThanOrEqual(GF.store.y + GF.store.h);
  });

  it('glass and low walls exist and are marked, because light has to pass them', () => {
    const f1 = floor1Walls();
    const gf = groundWalls();
    expect(f1.filter((w) => w.glass).length).toBeGreaterThan(0); // the kiosk
    expect(gf.filter((w) => w.low).length).toBeGreaterThan(0); // counters, tables, reception
    // The kiosk hatch is a hole only Voxxy fits through.
    const hatch = f1.find((w) => w.hidden && w.skipFor);
    expect(hatch).toBeDefined();
  });

  it('both floors are sealed by an outer wall', () => {
    for (const walls of [floor1Walls(), groundWalls()]) {
      expect(walls.some((w) => w.x === 0 && w.y === 0 && w.w === W && w.h === T)).toBe(true);
      expect(walls.some((w) => w.x === W - T && w.h === 700)).toBe(true);
    }
  });
});

/**
 * THE LOBBY, AGAINST MICHELE'S OWN PLOT (`docs/ground-floor-lobby-fix.md`).
 *
 * Round 3 checked this quadrant for *presence* — "is there a wall east of 1560" —
 * and it passed while reception, the coatroom, the BOF rooms and the toilets were
 * all somewhere else. Every assertion below is a POSITION, taken from the plot
 * Michele made on a calibrated tool against `plans/exhibition-floor.jpg`, so the
 * only way to pass is to be right.
 */
describe('ground floor — the lobby, where Michele plotted it', () => {
  const PLOT: Record<string, Rect> = {
    coatroom: { x: 1172, y: 262, w: 126, h: 122 },
    reception: { x: 1174, y: 388, w: 126, h: 75 },
    mainStair: { x: 1305, y: 263, w: 112, h: 197 },
    entrance: { x: 1472, y: 422, w: 33, h: 136 },
    smallStairs: { x: 952, y: 285, w: 93, h: 283 },
    concreteWall: { x: 1039, y: 90, w: 43, h: 199 },
    bof: { x: 1195, y: 6, w: 275, h: 151 },
    toilets: { x: 1085, y: 6, w: 105, h: 150 },
  };
  const built = (): Record<string, Rect> => ({
    coatroom: GF.coatroom,
    reception: GF.reception,
    mainStair: GF.mainStair,
    entrance: GF.entrance,
    smallStairs: GF.smallStairs,
    concreteWall: GF.concreteWall,
    bof: GF.bof,
    toilets: GF.toilets,
  });

  it('puts every block of the lobby on its measured rect, to the pixel', () => {
    const got = built();
    for (const [name, want] of Object.entries(PLOT)) {
      expect({ name, ...got[name] }).toEqual({ name, ...want });
    }
  });

  it('stacks the reception desk BELOW the wardrobe, not beside it', () => {
    const co = GF.coatroom;
    const r = GF.reception;
    expect(r.y).toBeGreaterThanOrEqual(co.y + co.h);
    // Same run of furniture: they share a west face within a couple of pixels...
    expect(Math.abs(r.x - co.x)).toBeLessThan(6);
    // ...the wardrobe is the larger, northern part...
    expect(co.h).toBeGreaterThan(r.h);
    // ...and the slot between them is too narrow for even Voxxy to slip through.
    expect(r.y - (co.y + co.h)).toBeLessThan(2 * DEFS.voxxy.r);
  });

  it('leaves the hall\'s right edge exactly ONE opening, and it is the stepped threshold', () => {
    const line = GF.hall.x + GF.hall.w + T / 2;
    const segs = groundWalls()
      .filter((w) => w.x <= line && w.x + w.w >= line)
      .filter((w) => w.y < GF.hall.y + GF.hall.h && w.y + w.h > GF.hall.y)
      .sort((a, b) => a.y - b.y);
    const gaps: Array<[number, number]> = [];
    let y: number = GF.hall.y;
    for (const s of segs) {
      if (s.y > y) gaps.push([y, s.y]);
      y = Math.max(y, s.y + s.h);
    }
    if (y < GF.hall.y + GF.hall.h) gaps.push([y, GF.hall.y + GF.hall.h]);

    // Not four gaps, not six door bays: one threshold.
    expect(gaps).toHaveLength(1);
    expect(GF.openings).toHaveLength(1);
    const st = GF.smallStairs;
    const [a, b] = gaps[0];
    expect(a).toBeGreaterThanOrEqual(st.y);
    expect(a).toBeLessThanOrEqual(st.y + 8);
    expect(b).toBe(st.y + st.h);
    expect(b - a).toBeGreaterThan(260);
    // Concrete above it, concrete below it.
    expect(segs.some((s) => s.kind === 'concrete' && s.y === GF.concreteWall.y)).toBe(true);
    expect(segs.some((s) => s.y === st.y + st.h)).toBe(true);
  });

  it('makes the small staircase the ONLY way between the hall and the lobby', () => {
    const hall = { x: 620, y: 645 };
    const lobby = { x: 1440, y: 500 };
    expect(canWalk(hall, lobby, DEFS.biggy.r)).toBe(true);
    // Plug the threshold and the lobby is unreachable: there is no second route.
    const plug: Wall = { x: GF.smallStairs.x, y: GF.smallStairs.y, w: GF.smallStairs.w + 20, h: GF.smallStairs.h };
    expect(canWalk(hall, lobby, DEFS.voxxy.r, [plug])).toBe(false);
  });

  it('raises the lobby half a metre above the hall — a threshold, not a ramp', () => {
    expect(LOBBY_RISE_M).toBe(0.5);
    expect(groundRiseM(GF.hall.x + 100)).toBe(0);
    expect(groundRiseM(GF.smallStairs.x)).toBe(0);
    expect(groundRiseM(GF.entrance.x)).toBe(LOBBY_RISE_M);
    expect(groundRiseM(GF.reception.x)).toBe(LOBBY_RISE_M);
    // It climbs across the flight's own footprint, and only there.
    expect(groundRiseM(GF.smallStairs.x + GF.smallStairs.w / 2)).toBeCloseTo(LOBBY_RISE_M / 2, 6);
    // 43% of Voxxy: high enough to read as a step up, low enough not to be a wall.
    expect(LOBBY_RISE_M / ROBOT_HEIGHT_M.voxxy).toBeGreaterThan(0.4);
    expect(LOBBY_RISE_M).toBeLessThan(ROBOT_HEIGHT_M.voxxy * 0.6);
  });

  it('opens only the LEFT-HAND doors and glazes the rest of that wall', () => {
    const e = GF.entrance;
    const panes = groundWalls().filter((w) => w.kind === 'facade');
    expect(panes).toHaveLength(2);
    for (const p of panes) {
      expect(p.glass).toBe(true); // fixed glazing: blocks robots, passes daylight
      expect(p.x).toBe(e.x);
    }
    const north = panes.find((p) => p.y < e.y);
    const south = panes.find((p) => p.y > e.y);
    expect(north).toBeDefined();
    expect(south).toBeDefined();
    // The two runs meet the doorway exactly: nothing else in the wall is open.
    expect((north as Wall).y + (north as Wall).h).toBe(e.y);
    expect((south as Wall).y).toBe(e.y + e.h);
    // The open doors are at the far end of the run, next to reception — not in the
    // middle of the wall, and not off the canvas edge where the prototype put them.
    expect(e.y).toBeGreaterThan(GF.bof.y + GF.bof.h);
    expect(e.x + e.w).toBeLessThan(W - T);
    expect((north as Wall).h).toBeGreaterThan(e.h * 2);
  });

  it('builds the toilets and the three BOF rooms inside their own footprints, one doorway each', () => {
    const walls = groundWalls();
    for (const [kind, rect, rooms] of [
      ['toilets', GF.toilets, 1],
      ['bof', GF.bof, GF.bofSplits.length + 1],
    ] as Array<[string, Rect, number]>) {
      const mine = walls.filter((w) => w.kind === kind);
      expect(mine.length, `${kind} walls`).toBeGreaterThan(3);
      for (const w of mine) {
        expect(w.x).toBeGreaterThanOrEqual(rect.x);
        expect(w.x + w.w).toBeLessThanOrEqual(rect.x + rect.w);
        expect(w.y).toBeGreaterThanOrEqual(rect.y);
        expect(w.y + w.h).toBeLessThanOrEqual(rect.y + rect.h);
      }
      const south = mine.filter((w) => w.y === rect.y + rect.h - T && w.h === T).sort((a, b) => a.x - b.x);
      let gaps = 0;
      for (let i = 1; i < south.length; i++) {
        if (south[i].x > south[i - 1].x + south[i - 1].w) gaps++;
      }
      expect(gaps, `${kind} doorways`).toBe(rooms);
    }
    // Both blocks face the lobby, in the TOP band, clear of the arrivals route.
    expect(GF.bof.y + GF.bof.h).toBeLessThan(GF.coatroom.y);
    expect(GF.toilets.x + GF.toilets.w).toBeLessThanOrEqual(GF.bof.x);
  });

  it('keeps the gate at the foot of the main staircase — its only reachable side', () => {
    const ms = GF.mainStair;
    expect(GF.gate.x).toBe(ms.x);
    expect(GF.gate.w).toBe(ms.w);
    expect(GF.gate.y).toBe(ms.y + ms.h);
    // The wardrobe and the desk close the flight's whole west flank, which is why
    // the south is the only way at it — and why Stephan stands exactly there.
    const west = [GF.coatroom, GF.reception];
    expect(Math.min(...west.map((r) => r.y))).toBeLessThanOrEqual(ms.y);
    expect(Math.max(...west.map((r) => r.y + r.h))).toBeGreaterThanOrEqual(ms.y + ms.h);
    for (const r of west) expect(r.x + r.w).toBeLessThanOrEqual(ms.x);
  });

  it('never overlaps two blocks of the lobby', () => {
    const named = Object.entries({ ...built(), gate: GF.gate });
    for (let i = 0; i < named.length; i++) {
      for (let j = i + 1; j < named.length; j++) {
        const [an, a] = named[i];
        const [bn, b] = named[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        // The concrete wall butts into the head of the steps by 4 px, which is the
        // plot's own overlap; nothing else may touch at all.
        const allowed = (an === 'smallStairs' && bn === 'concreteWall') || (an === 'concreteWall' && bn === 'smallStairs');
        expect(Math.min(ox, oy) <= 0 || (allowed && Math.min(ox, oy) <= 6), `${an} overlaps ${bn}`).toBe(true);
      }
    }
  });

  it('builds fabric across the whole lobby, and leaves the forecourt outside it', () => {
    const walls = groundWalls();
    // Every 85-px column of the lobby proper carries something built.
    for (let x = GF.hall.x + GF.hall.w; x < GF.entrance.x; x += 85) {
      const band = walls.filter((w) => w.x + w.w > x && w.x < x + 85 && w.w < 400);
      expect(band.length, `nothing built in the column starting at x=${x}`).toBeGreaterThan(0);
    }
    /*
     * East of the glazing is the street. Nothing of the BUILDING stands out
     * there — but the street furniture does, and it has to: the doors are open,
     * a robot can walk out onto the forecourt, and the venue draws seven
     * bollards and two planters on it. They were scenery a robot walked through
     * until the collider sweep of 2026-09-23; now they are `low` walls, and the
     * rule this test guards is narrower and truer than "nothing is out there".
     */
    const outside = walls.filter((w) => w.x > GF.entrance.x + GF.entrance.w && w.x < W - T);
    expect(outside.every((w) => w.kind === 'bollard' || w.kind === 'forecourt-planter')).toBe(true);
    expect(outside.every((w) => w.low === true)).toBe(true);
    expect(outside).toHaveLength(9);
  });
});

/*
 * ========================================================================
 * EVERYTHING THE HALL DRAWS IS SOMETHING THE HALL STOPS YOU WITH.
 *
 * Michele, playing chapter 2: *"robots can go through staircase and objects."* The
 * cause was the one chapter 1 already hit with its seat rows: `src/render/venue`
 * built geometry out of its own loops — the column grid, the lobby columns, the
 * planters, both secondary staircases — that the sim had never been told about. A
 * throwaway flood-fill probe measured 100% of every one of those footprints as
 * walkable floor.
 *
 * These are the tests that stop it coming back. They are deliberately written
 * against `GF`/`HALL_COLUMNS` rather than against a hard-coded list, so a column
 * added to the grid is a column that has to be a collider.
 * ========================================================================
 */
describe('the hall stops you where it looks solid', () => {
  const solid = (rect: Rect, r: number): boolean => {
    const walls = groundWalls().filter((w) => !w.hidden);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return walls.some((w) => {
      const px = Math.max(w.x, Math.min(cx, w.x + w.w));
      const py = Math.max(w.y, Math.min(cy, w.y + w.h));
      return (cx - px) ** 2 + (cy - py) ** 2 < r * r;
    });
  };

  it('gives every structural column in the hall a collider', () => {
    expect(HALL_COLUMNS.length).toBeGreaterThan(12);
    for (const c of HALL_COLUMNS) {
      expect(solid(c, DEFS.voxxy.r), `column at ${c.x},${c.y} is walkable`).toBe(true);
    }
  });

  it('does the same for the lobby columns and the concourse planters', () => {
    for (const c of LOBBY_COLUMNS) expect(solid(c, DEFS.voxxy.r), `lobby column ${c.x}`).toBe(true);
    for (const c of LOBBY_PLANTERS) expect(solid(c, DEFS.voxxy.r), `planter ${c.x}`).toBe(true);
    // The rack is the cable's own starting point, and it is a cabinet, not a decal.
    expect(solid(GF.rack, DEFS.voxxy.r)).toBe(true);
  });

  it('never puts a column where a booth, a counter or a staircase already stands', () => {
    const blocks: Rect[] = [
      GF.food.court,
      GF.tech,
      GF.store,
      GF.smallStairs,
      GF.concreteWall,
      ...GF.stairs.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
      ...GF.booths.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
    ];
    for (const c of HALL_COLUMNS) {
      for (const b of blocks) {
        const hit = c.x < b.x + b.w && c.x + c.w > b.x && c.y < b.y + b.h && c.y + c.h > b.y;
        expect(hit, `column at ${c.x},${c.y} stands inside built fabric`).toBe(false);
      }
    }
    // ...and every one of them is inside the hall it holds up.
    for (const c of HALL_COLUMNS) {
      expect(c.x).toBeGreaterThan(GF.hall.x);
      expect(c.x + c.w).toBeLessThan(GF.hall.x + GF.hall.w);
    }
  });
});

/*
 * The secondary staircases are ROOMS. Michele: *"In devoxx the stairs are not open
 * but look like rooms."* `plans/exhibition-floor-simple.png` draws each one as a
 * walled shaft standing free in the hall with a pair of double doors in EACH of
 * its two long faces near the plan-north (world west) end, a landing behind them
 * and the ascent arrow running away down the middle.
 *
 * **This block used to assert one doorway in the short west end**, which is what
 * the build had and what `SHAFT_DOOR`'s own comment had already flagged as wrong
 * and deferred. Michele overruled the deferral on 24 Sep 2026: *"Just a
 * correction: you put the opening north, but it's on the sides (WEST, EAST).
 * Worth a fix."* The building's west and east are this rect's two LONG faces —
 * the whole floor is rotated 90° (see `src/sim/geometry.ts`'s header) — so the
 * assertions below moved with the geometry rather than being loosened.
 */
describe('the secondary staircases are enclosed shafts', () => {
  const shafts = GF.stairs.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }));

  it('walls both short ends and puts a doorway in each long face', () => {
    for (const s of shafts) {
      const [north, south] = stairDoors(s);
      for (const d of [north, south]) {
        // Along the shaft, inside it, and near the west (plan-north) end — the
        // landing end, not the middle and not the far end.
        expect(d.x).toBeGreaterThan(s.x);
        expect(d.x + d.w).toBeLessThan(s.x + s.w);
        expect(d.x + d.w - s.x).toBeLessThan(s.w / 3);
        // Biggy, the widest robot, fits through it with room to spare.
        expect(d.w).toBeGreaterThan(DEFS.biggy.r * 2 + 4);
      }
      // One in each long face: same span along the shaft, opposite flanks.
      expect(north.x).toBe(south.x);
      expect(north.w).toBe(south.w);
      expect(north.y).toBe(s.y);
      expect(south.y + south.h).toBe(s.y + s.h);
      // ...and the default a chapter gets is the one the camera can see into.
      expect(stairDoor(s)).toEqual(south);

      /*
       * Both short ends are solid: driving straight at either one along the
       * shaft's own axis always meets a wall. `canWalk` cannot say this — you can
       * always walk round and in through a long face — so the line is what is
       * tested, exactly as the north-south case below does it.
       */
      const shell = groundWalls().filter((w) => w.kind === 'stairwell' || w.kind === 'stairwell-near' || w.kind === 'stair-foot');
      const blocked = (px: number, py: number, r: number): boolean =>
        shell.some((w) => {
          const cx = Math.max(w.x, Math.min(px, w.x + w.w));
          const cy = Math.max(w.y, Math.min(py, w.y + w.h));
          return (px - cx) ** 2 + (py - cy) ** 2 < r * r;
        });
      for (const [what, from, to] of [
        ['west', s.x - 24, s.x + s.w / 2],
        ['east', s.x + s.w + 24, s.x + s.w / 2],
      ] as const) {
        let hit = false;
        const step = from > to ? -2 : 2;
        for (let x = from; step > 0 ? x <= to : x >= to; x += step) if (blocked(x, s.y + s.h / 2, DEFS.voxxy.r)) hit = true;
        expect(hit, `walked straight in through the ${what} end`).toBe(true);
      }

      /*
       * You can stand on the landing, coming in through EITHER long face.
       *
       * Droid, not Biggy, is the robot asked here, and that is a finding rather
       * than a convenience: the technical room's north wall runs at y 554 and the
       * BOT shaft's south face at 538.2, so that door opens onto 15.8 px — 1.26 m
       * — and Biggy is 1.44 m across. He uses the north door, which opens onto
       * open hall, and the assertion under this one is that he can always get out
       * of a shaft some way. The pinch is the technical room's, not the
       * staircase's; `GF.tech` came from the prototype and has never been measured
       * off the plan.
       */
      const landing = stairLanding(s);
      const mid = { x: landing.x + landing.w / 2, y: landing.y + landing.h / 2 };
      expect(canWalk({ x: north.x + north.w / 2, y: s.y - 20 }, mid, DEFS.droid.r), 'Droid cannot use the north door').toBe(true);
      expect(canWalk({ x: south.x + south.w / 2, y: s.y + s.h + DEFS.droid.r + 1 }, mid, DEFS.droid.r), 'Droid cannot use the south door').toBe(true);
      // Biggy has to be able to leave a stairwell he is put in — chapter 2 opens
      // with all three of them standing on this landing.
      expect(canWalk(mid, { x: s.x + s.w / 2, y: s.y - 30 }, DEFS.biggy.r), 'Biggy is sealed into the shaft').toBe(true);
      // ...and you cannot get past the landing onto the flight, from anywhere.
      const flight = stairFlightRect(s);
      expect(canWalk(mid, { x: flight.x + flight.w - 8, y: flight.y + flight.h / 2 }, DEFS.voxxy.r), 'the flight is walkable').toBe(false);
    }
  });

  /**
   * ONE staircase with a mid-plane, not two descents. Michele, sending the plan
   * symbol back enlarged: *"I think it's a mid plane between two ramps of stairs."*
   */
  it('cuts the flight into two ramps with a half-landing between them', () => {
    for (const s of shafts) {
      const flight = stairFlightRect(s);
      const mid = stairMidLanding(s);
      const [lower, upper] = stairRamps(s);
      // The half-landing is inside the flight, and well inside it — a mid-plane,
      // not an end landing.
      expect(mid.x).toBeGreaterThan(flight.x);
      expect(mid.x + mid.w).toBeLessThan(flight.x + flight.w);
      // Both ramps are real runs, and the landing is a fraction of the flight.
      expect(lower.w).toBeGreaterThan(20);
      expect(upper.w).toBeGreaterThan(20);
      expect(mid.w / flight.w).toBeGreaterThan(0.1);
      expect(mid.w / flight.w).toBeLessThan(0.3);
      // They tile the flight, foot to head, with nothing left over.
      expect(lower.x).toBe(flight.x);
      expect(lower.x + lower.w).toBe(mid.x);
      expect(upper.x).toBe(mid.x + mid.w);
      expect(upper.x + upper.w).toBe(flight.x + flight.w);
    }
  });

  it('cannot be walked through from north to south, or from east to west', () => {
    for (const s of shafts) {
      const n = { x: s.x + s.w / 2, y: s.y - 22 };
      const so = { x: s.x + s.w / 2, y: s.y + s.h + 22 };
      const e = { x: s.x + s.w + 22, y: s.y + s.h / 2 };
      // Going round is fine; going THROUGH is not, which is what a flood fill
      // cannot tell you on its own — so the shaft's own strip is what is tested.
      for (const r of [DEFS.voxxy.r, DEFS.biggy.r]) {
        const walls = groundWalls().filter((w) => w.kind === 'stairwell' || w.kind === 'stairwell-near' || w.kind === 'stair-foot');
        const blocked = (p: Vec2): boolean =>
          walls.some((w) => {
            const px = Math.max(w.x, Math.min(p.x, w.x + w.w));
            const py = Math.max(w.y, Math.min(p.y, w.y + w.h));
            return (p.x - px) ** 2 + (p.y - py) ** 2 < r * r;
          });
        // A straight line across the shaft always meets a wall of it.
        let hitNS = false;
        for (let y = n.y; y <= so.y; y += 2) if (blocked({ x: s.x + s.w / 2, y })) hitNS = true;
        expect(hitNS, 'walked straight through the shaft north to south').toBe(true);
        let hitEW = false;
        for (let x = e.x; x >= s.x - 22; x -= 2) if (blocked({ x, y: s.y + s.h / 2 })) hitEW = true;
        expect(hitEW, 'walked straight through the shaft east to west').toBe(true);
      }
    }
  });

  it('keeps the flight and the landing inside the plan rect, with the flight to the east', () => {
    for (const s of shafts) {
      const landing = stairLanding(s);
      const flight = stairFlightRect(s);
      expect(landing.x).toBeGreaterThanOrEqual(s.x);
      expect(flight.x + flight.w).toBeLessThanOrEqual(s.x + s.w);
      // Doors, then landing, then the first riser: the plan's own order.
      expect(flight.x).toBeGreaterThan(landing.x + landing.w);
      expect(flight.w).toBeGreaterThan(landing.w);
    }
  });
});
