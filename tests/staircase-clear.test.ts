/**
 * The small staircase, and what may not stand in it.
 *
 * Michele filed this twice from two different directions. First a screenshot:
 * *"the orange thing and the big black thing with halo (is it a booth? in the
 * middle of the stairs?)"*. Then, when I asked which object he meant, the general
 * rule instead of the answer: *"staircase should be clear of booths in geenral"*.
 *
 * He was right about both, and there were two separate faults in that one corner:
 *
 *   1. **Sponsor column 3 ran 28 px into the stairwell**, three booths deep, and
 *      `boothTotem()` put a lit totem entirely inside it. That totem is the orange
 *      thing. It went unnoticed for rounds because a booth was an undressed grey
 *      block — and the moment the stands were given names, it started announcing
 *      `Async Airlines` from the middle of a flight of stairs.
 *   2. **Chapter 3's shuffleboard was played on the same staircase.** The duck and
 *      its target were laid out east of the Rubber Duck stand, which put both
 *      inside `GF.smallStairs` and drew the target decal across the treads.
 *
 * Neither was caught by anything, because every test in this repo asked whether a
 * robot could walk somewhere, and nothing asked whether an object had been put
 * somewhere absurd. That is what this file is for.
 */

import { describe, expect, it } from 'vitest';

import {
  CY0,
  CY1,
  DEFS,
  DT_MAX,
  F1,
  GF,
  H,
  HALL_COLUMNS,
  R,
  W,
  boothCrate,
  boothTotem,
  corridorColumns,
  createGame,
  floor1Walls,
  groundWallsFor,
  nicheMouth,
  roomDoor,
  type Rect,
} from '../src/sim';

/** Do two rectangles overlap at all? */
const hits = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const ST = GF.smallStairs;

describe('the small staircase is clear', () => {
  it('has no sponsor stand standing in it', () => {
    const inside = GF.booths
      .filter((b) => hits({ x: b.x, y: b.y, w: b.w, h: b.h }, ST))
      .map((b) => `${b.name} (col ${b.col}, row ${b.row}) reaches x=${b.x + b.w}, stairs start at ${ST.x}`);
    expect(inside, `sponsor stands inside the staircase:\n  ${inside.join('\n  ')}`).toEqual([]);
  });

  it('has none of the booths’ own furniture in it either', () => {
    // The totem is the piece Michele actually saw, so it is named separately: a
    // stand can be clear while the lit sign beside it is not.
    const inside: string[] = [];
    for (const b of GF.booths) {
      const t = boothTotem(b);
      if (t && hits(t, ST)) inside.push(`${b.name}'s totem at x=${t.x}..${t.x + t.w}`);
      const c = boothCrate(b);
      if (c && hits(c, ST)) inside.push(`${b.name}'s flight case at x=${c.x}..${c.x + c.w}`);
    }
    expect(inside, `booth furniture inside the staircase:\n  ${inside.join('\n  ')}`).toEqual([]);
  });

  it('keeps a real gap, not a shared edge', () => {
    // Column 3 is the one that was wrong. A booth that merely touches the stairwell
    // would pass the overlap test above and still read as built into it.
    const col3 = GF.booths.filter((b) => b.col === 3);
    expect(col3).toHaveLength(3);
    for (const b of col3) {
      expect(ST.x - (b.x + b.w), `${b.name} has no daylight to the stairs`).toBeGreaterThanOrEqual(6);
    }
  });

  it('did not move the roof columns when the stands were narrowed', () => {
    /*
     * `HALL_COLUMNS` suppresses any column foot that lands inside a booth, so
     * changing a booth's width can conjure a column into an aisle. Measured before
     * and after the narrowing: eighteen columns, same eighteen positions — the feet
     * sit at x 853..867 and never touched column 3's footprint. This pins that, so
     * the next person to resize a stand finds out in a second rather than in a
     * screenshot.
     */
    expect(HALL_COLUMNS).toHaveLength(18);
    const xs = [...new Set(HALL_COLUMNS.map((c) => c.x))].sort((a, b) => a - b);
    expect(xs).toEqual([213, 373, 533, 693, 853, 1013]);
    for (const c of HALL_COLUMNS) {
      for (const b of GF.booths) {
        expect(hits(c, { x: b.x, y: b.y, w: b.w, h: b.h }), `a column stands inside ${b.name}`).toBe(false);
      }
    }
  });

  it('is not where chapter 3 plays shuffleboard', () => {
    const g = createGame({ seed: 20260930, chapter: 3, cards: false });
    g.update(DT_MAX);
    const props = g.snapshot().props;
    const duck = props.find((p) => p.kind === 'duck');
    const target = props.find((p) => p.kind === 'duck-target');
    if (!duck || !target) throw new Error('no shuffleboard');

    for (const [what, p] of [['duck', duck], ['target', target]] as const) {
      const r: Rect = { x: p.x - (p.w ?? 16) / 2, y: p.y - (p.h ?? 16) / 2, w: p.w ?? 16, h: p.h ?? 16 };
      expect(hits(r, ST), `the ${what} is inside the staircase at ${Math.round(p.x)},${Math.round(p.y)}`).toBe(false);
    }

    // And the lane between them is clear floor, or the game is unplayable: the
    // duck has to slide the whole way without catching a wall on the route.
    const walls = groundWallsFor(3);
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const x = duck.x + ((target.x - duck.x) * i) / steps;
      const y = duck.y + ((target.y - duck.y) * i) / steps;
      const blocked = walls.filter((w) => x + 8 > w.x && x - 8 < w.x + w.w && y + 8 > w.y && y - 8 < w.y + w.h);
      expect(blocked.map((w) => w.kind ?? 'wall'), `the duck lane is blocked at ${Math.round(x)},${Math.round(y)}`).toEqual([]);
    }
  });
});

/*
 * ...and the same question of the two SECONDARY staircases, which moved this round
 * onto the pixels `plans/exhibition-floor-stairs-annotated.png` draws them at (see
 * `GF.stairs`). The west shaft moved 64 px and both grew 26 px longer, and the
 * prior art here is exactly why that needs asking: a sponsor stand was found 28 px
 * inside the small staircase the last time a rect in this hall moved.
 */
describe('the two secondary staircases are clear too', () => {
  const shafts = GF.stairs.map((s) => ({ name: s.to, r: { x: s.x, y: s.y, w: s.w, h: s.h } as Rect }));

  it('has no sponsor stand, totem or flight case standing in either shaft', () => {
    const inside: string[] = [];
    for (const { name, r } of shafts) {
      for (const b of GF.booths) {
        if (hits({ x: b.x, y: b.y, w: b.w, h: b.h }, r)) inside.push(`${b.name} in the ${name} shaft`);
        const t = boothTotem(b);
        if (t && hits(t, r)) inside.push(`${b.name}'s totem in the ${name} shaft`);
        const c = boothCrate(b);
        if (c && hits(c, r)) inside.push(`${b.name}'s flight case in the ${name} shaft`);
      }
    }
    expect(inside, `booth fabric inside a secondary staircase:\n  ${inside.join('\n  ')}`).toEqual([]);
  });

  it('has no roof column standing in either shaft', () => {
    for (const { name, r } of shafts) {
      for (const c of HALL_COLUMNS) {
        expect(hits(c, r), `a roof column at ${c.x},${c.y} stands inside the ${name} shaft`).toBe(false);
      }
    }
  });

  it('has nothing a chapter puts on the floor standing in either shaft', () => {
    for (const chapter of [2, 3] as const) {
      const g = createGame({ seed: 20260930, chapter, cards: false });
      g.update(DT_MAX);
      for (const p of g.snapshot().props) {
        const w = p.w ?? 16;
        const h = p.h ?? 16;
        const r: Rect = { x: p.x - w / 2, y: p.y - h / 2, w, h };
        for (const s of shafts) {
          expect(
            hits(r, s.r),
            `chapter ${chapter}'s ${p.kind} is inside the ${s.name} staircase at ${Math.round(p.x)},${Math.round(p.y)}`,
          ).toBe(false);
        }
      }
    }
  });
});

/*
 * ...and the same question of the two staircases UPSTAIRS, which moved this round
 * onto the pixels `plans/devoxx-rooms-stairs-annotated.png` draws them at (see
 * `NICHE_MOUTH` and `F1.nicheTop`). They moved ~148 px along the corridor and
 * stopped being pockets in the wall: they now stand IN the corridor, which is a
 * new way for this venue to put something inside a staircase. The prior art is
 * two rounds old and on the floor below — a sponsor stand 28 px inside the small
 * stairwell, and a chapter-3 lane node inside a relocated shaft.
 */
describe('the two secondary staircases upstairs are clear too', () => {
  const shafts = [
    { name: 'top', r: F1.nicheTop as Rect },
    { name: 'bot', r: F1.nicheBot as Rect },
  ];

  it('has no corridor column standing in either flight', () => {
    const cols = corridorColumns();
    for (const { name, r } of shafts) {
      for (const c of [...cols.far, ...cols.near]) {
        expect(hits(c, r), `a corridor column at ${c.x},${c.y} stands in the ${name} flight`).toBe(false);
      }
    }
  });

  it('opens rooms 4 and 9 beside their flight rather than into it', () => {
    for (const n of [4, 9] as const) {
      const d = roomDoor(R(n));
      for (const { name, r } of shafts) {
        expect(hits({ x: d.x, y: d.y, w: d.w, h: d.h }, r), `room ${n}'s doorway is in the ${name} flight`).toBe(false);
      }
    }
  });

  it('has nothing a first-floor chapter puts on the floor standing in either flight', () => {
    for (const chapter of [1, 4] as const) {
      const g = createGame({ seed: 20260930, chapter, cards: false });
      g.update(DT_MAX);
      for (const p of g.snapshot().props) {
        const w = p.w ?? 16;
        const h = p.h ?? 16;
        const r: Rect = { x: p.x - w / 2, y: p.y - h / 2, w, h };
        for (const s of shafts) {
          expect(
            hits(r, s.r),
            `chapter ${chapter}'s ${p.kind} is inside the ${s.name} staircase at ${Math.round(p.x)},${Math.round(p.y)}`,
          ).toBe(false);
        }
      }
    }
  });

  /**
   * The flight stands in the corridor now, so the corridor has to still BE a
   * corridor: 130 px wide less the 17.7 the flight takes is 112.3, and Biggy is
   * 18 across. A flood fill says it rather than arithmetic, because what matters
   * is that he can get from the fire door to the main staircase past both of them.
   */
  it('leaves Biggy the length of the corridor to drive, past both flights', () => {
    const walls = floor1Walls().filter((w) => !w.hidden);
    const STEP = 4;
    const r = DEFS.biggy.r;
    const cols = Math.ceil(W / STEP);
    const rows = Math.ceil(H / STEP);
    const blocked = new Uint8Array(cols * rows);
    const idx = (i: number, j: number): number => j * cols + i;
    for (const w of walls) {
      for (let i = Math.max(0, Math.floor((w.x - r) / STEP)); i <= Math.min(cols - 1, Math.ceil((w.x + w.w + r) / STEP)); i++) {
        for (let j = Math.max(0, Math.floor((w.y - r) / STEP)); j <= Math.min(rows - 1, Math.ceil((w.y + w.h + r) / STEP)); j++) {
          const x = i * STEP;
          const y = j * STEP;
          const cx = Math.max(w.x, Math.min(x, w.x + w.w));
          const cy = Math.max(w.y, Math.min(y, w.y + w.h));
          if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) blocked[idx(i, j)] = 1;
        }
      }
    }
    const from: [number, number] = [Math.round((F1.fireX + 30) / STEP), Math.round(350 / STEP)];
    const to: [number, number] = [Math.round((F1.mainStair.x - 20) / STEP), Math.round(350 / STEP)];
    expect(blocked[idx(from[0], from[1])], 'the corridor start is walled in').toBe(0);
    expect(blocked[idx(to[0], to[1])], 'the corridor end is walled in').toBe(0);
    const seen = new Uint8Array(cols * rows);
    const q: Array<[number, number]> = [from];
    seen[idx(from[0], from[1])] = 1;
    let reached = false;
    while (q.length) {
      const [i, j] = q.pop() as [number, number];
      if (i === to[0] && j === to[1]) {
        reached = true;
        break;
      }
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as Array<[number, number]>) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= cols || b >= rows || seen[idx(a, b)] || blocked[idx(a, b)]) continue;
        seen[idx(a, b)] = 1;
        q.push([a, b]);
      }
    }
    expect(reached, 'Biggy cannot drive the corridor past the staircases').toBe(true);
  });

  /**
   * ...and the two who CAN take those stairs still fit through the mouth, while
   * Biggy does not. Chapter 1 ends by walking all three onto that landing, so the
   * landing has to be somewhere a robot can be.
   */
  it('lets Droid onto the landing and keeps Biggy off it', () => {
    for (const { name, r } of shafts) {
      const mouth = nicheMouth(r);
      expect(mouth.w, `the ${name} mouth admits Biggy`).toBeLessThan(DEFS.biggy.r * 2);
      expect(mouth.w, `the ${name} mouth refuses Droid`).toBeGreaterThan(DEFS.droid.r * 2);
      expect(mouth.h).toBeGreaterThan(DEFS.droid.r * 2);
      // Chapter 1's descent waypoint is the middle of the flight, which is the
      // middle of that landing, and it is inside the corridor band.
      const head = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      expect(head.x).toBeGreaterThan(mouth.x);
      expect(head.x).toBeLessThan(mouth.x + mouth.w);
      expect(head.y).toBeGreaterThan(CY0);
      expect(head.y).toBeLessThan(CY1);
    }
  });
});
