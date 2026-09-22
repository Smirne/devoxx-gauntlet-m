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

import { T, W } from '../src/sim/constants';
import { CY0, CY1, DOOR, F1, GF, R, ROOM_D, SPONSORS, floor1Walls, groundWalls, rooms, roomDoor } from '../src/sim/geometry';
import type { RoomDef, Wall } from '../src/sim/types';

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

  it('every room backs onto the corridor at the right depth', () => {
    for (const r of rooms) {
      expect(r.h).toBe(ROOM_D);
      if (r.side < 0) expect(r.y + r.h).toBe(CY0);
      else expect(r.y).toBe(CY1);
    }
    expect(CY1 - CY0).toBe(100); // the corridor band itself
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
        expect(b - a).toBe(DOOR);
        expect(a).toBe(door.x);
        expect((a + b) / 2).toBe(r.x + r.w / 2); // centred on the room
      }
    }
  });

  it('the only gaps that are not doorways are the stair niches and the foyer mouth', () => {
    const top = corridorGaps(-1);
    const bottom = corridorGaps(1);
    expect(top).toHaveLength(rooms.filter((r) => r.side === -1).length + 1);
    expect(bottom).toHaveLength(rooms.filter((r) => r.side === 1).length + 2);
    expect(top).toContainEqual([F1.nicheTop.x, F1.nicheTop.x + F1.nicheTop.w]);
    expect(bottom).toContainEqual([F1.nicheBot.x, F1.nicheBot.x + F1.nicheBot.w]);
    expect(bottom).toContainEqual([F1.foyer.x, F1.foyer.x + F1.foyer.w]);
  });

  it('a doorway is wide enough for Biggy and narrow enough to read as a door', () => {
    expect(DOOR).toBeGreaterThan(2 * 17); // Biggy's diameter
    expect(DOOR).toBeLessThan(ROOM_D / 3);
  });
});

describe('the staircases — both of them, exactly where the plan puts them', () => {
  it('the secondary niches sit in the corridor walls, in the gap between 10|9 and 3|4', () => {
    for (const [side, niche, left, rightRoom] of [
      [-1, F1.nicheTop, 10, 9],
      [1, F1.nicheBot, 3, 4],
    ] as const) {
      const a = R(left);
      const b = R(rightRoom);
      const gapStart = right(a);
      const gapEnd = b.x;
      // There is a gap between the two rooms at all...
      expect(gapEnd).toBeGreaterThan(gapStart);
      // ...and the niche lives inside it, overlapping neither room.
      expect(niche.x).toBeGreaterThanOrEqual(gapStart);
      expect(niche.x + niche.w).toBeLessThanOrEqual(gapEnd);
      expect(niche.x).toBeGreaterThan(a.x);
      expect(niche.x + niche.w).toBeLessThan(right(b));
      for (const r of rooms.filter((x) => x.side === side)) {
        const overlaps = niche.x < right(r) && niche.x + niche.w > r.x;
        expect(overlaps, `niche overlaps room ${String(r.n)}`).toBe(false);
      }
      // It is cut into the corridor wall, opening away from the corridor.
      if (side < 0) expect(niche.y + niche.h).toBe(CY0);
      else expect(niche.y).toBe(CY1);
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
