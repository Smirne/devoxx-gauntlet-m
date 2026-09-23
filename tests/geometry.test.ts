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
  R,
  ROOM_D,
  SPONSORS,
  floor1Walls,
  groundRiseM,
  groundWalls,
  rooms,
  roomDoor,
  stairDoor,
  stairFlightRect,
  stairLanding,
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
  const free = (ix: number, iy: number): boolean => {
    const x = ix * STEP;
    const y = iy * STEP;
    for (const w of walls) {
      const cx = Math.max(w.x, Math.min(x, w.x + w.w));
      const cy = Math.max(w.y, Math.min(y, w.y + w.h));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return false;
    }
    return true;
  };
  const idx = (ix: number, iy: number): number => iy * nx + ix;
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
    // East of the glazing is the street: only the building's own shell is there.
    const outside = walls.filter((w) => w.x > GF.entrance.x + GF.entrance.w && w.x < W - T);
    expect(outside).toHaveLength(0);
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
 * walled shaft standing free in the hall with double doors in its plan-north end
 * (world west) and the ascent arrow running away from them.
 */
describe('the secondary staircases are enclosed shafts', () => {
  const shafts = GF.stairs.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }));

  it('walls all four sides, and puts the one doorway in the west end', () => {
    for (const s of shafts) {
      const d = stairDoor(s);
      // The doorway is in the west face and nowhere else.
      expect(d.x).toBe(s.x);
      expect(d.y).toBeGreaterThan(s.y);
      expect(d.y + d.h).toBeLessThan(s.y + s.h);
      // Biggy, the widest robot, fits through it.
      expect(d.h).toBeGreaterThan(DEFS.biggy.r * 2 + 4);

      // You can stand on the landing...
      const landing = stairLanding(s);
      expect(canWalk({ x: s.x - 20, y: s.y + s.h / 2 }, { x: landing.x + landing.w / 2, y: landing.y + landing.h / 2 }, DEFS.biggy.r)).toBe(true);
      // ...and you cannot get past it onto the flight, from anywhere at all.
      const flight = stairFlightRect(s);
      expect(
        canWalk({ x: s.x - 20, y: s.y + s.h / 2 }, { x: flight.x + flight.w - 8, y: flight.y + flight.h / 2 }, DEFS.voxxy.r),
        'the flight is walkable',
      ).toBe(false);
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
