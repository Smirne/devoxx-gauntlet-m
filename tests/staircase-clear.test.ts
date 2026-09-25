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
  type RobotKind,
} from '../src/sim';
import { stairExitRoutes } from '../src/sim/chapters/ch1-night';

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
    // Sixteen, not the eighteen this test was written on: the x 213 line was both
    // of the columns that pinched the route to the technical room, and the rule in
    // `HALL_COLUMNS` drops them. See the test below for what that rule means.
    expect(HALL_COLUMNS).toHaveLength(16);
    const xs = [...new Set(HALL_COLUMNS.map((c) => c.x))].sort((a, b) => a - b);
    expect(xs).toEqual([373, 533, 693, 853, 1013]);
    for (const c of HALL_COLUMNS) {
      for (const b of GF.booths) {
        expect(hits(c, { x: b.x, y: b.y, w: b.w, h: b.h }), `a column stands inside ${b.name}`).toBe(false);
      }
    }
  });

  /**
   * ...and none of the sixteen makes a gap the heaviest robot cannot get through.
   *
   * Michele, 25 Sep 2026, with Biggy stopped beside one: *"Biggy route to the
   * modem room is a bit long. Is this column strictly needed?"* Two of the
   * eighteen were not: one stood 13 px off the technical room and one 7 px off
   * the lower stair shaft, both on the x 213 line, both on the route the chapter
   * sends BIGGY down to open the router cabinet. 13 px is 1.04 m and he is 1.44,
   * so the short way was a slot he could not enter — which is the whole of "a bit
   * long".
   *
   * The rule that dropped them is in `HALL_COLUMNS`; this is what it means, asked
   * of the result rather than of the code.
   */
  it('leaves every column a gap Biggy can actually use', () => {
    const blocks: Array<{ name: string; r: Rect }> = [
      { name: 'catering court', r: GF.food.court },
      { name: 'technical room', r: GF.tech },
      { name: 'store', r: GF.store },
      { name: 'small stairs', r: GF.smallStairs },
      { name: 'concrete wall', r: GF.concreteWall },
      ...GF.stairs.map((s, i) => ({ name: `stair shaft ${i}`, r: { x: s.x, y: s.y, w: s.w, h: s.h } })),
      ...GF.booths.map((b) => ({ name: b.name, r: { x: b.x, y: b.y, w: b.w, h: b.h } })),
    ];
    const tight: string[] = [];
    for (const c of HALL_COLUMNS) {
      for (const { name, r } of blocks) {
        const ovY = Math.min(c.y + c.h, r.y + r.h) - Math.max(c.y, r.y);
        const ovX = Math.min(c.x + c.w, r.x + r.w) - Math.max(c.x, r.x);
        const gapX = Math.max(r.x - (c.x + c.w), c.x - (r.x + r.w));
        const gapY = Math.max(r.y - (c.y + c.h), c.y - (r.y + r.h));
        if (ovY > 0 && gapX >= 0 && gapX < DEFS.biggy.r * 2) {
          tight.push(`column ${c.x},${c.y} leaves ${gapX.toFixed(1)} px to ${name} — Biggy is ${DEFS.biggy.r * 2}`);
        }
        if (ovX > 0 && gapY >= 0 && gapY < DEFS.biggy.r * 2) {
          tight.push(`column ${c.x},${c.y} leaves ${gapY.toFixed(1)} px to ${name} — Biggy is ${DEFS.biggy.r * 2}`);
        }
      }
    }
    expect(tight, `columns standing in a gap nothing can use:\n  ${tight.join('\n  ')}`).toEqual([]);
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
   * Biggy does not. Chapter 1 ends by walking all three onto the top step, so the
   * top step has to be somewhere a robot can be.
   *
   * **The waypoint used to be the middle of the flight** — `r.x + r.w / 2` — back
   * when the mouth was centred and a run fell away either side. Michele, 24 Sep
   * 2026: *"This makes it look like there's a center, and 2 descent. I think it's
   * a mid plane between two ramps of stairs."* It is one staircase, the centre is
   * a ramp, and the way on is the east end (`nicheMouth`). The assertion moved
   * onto the new head rather than being dropped, and `ch1-night.ts` derives its
   * waypoint from `nicheMouth` so the two cannot drift apart again.
   */
  it('lets Droid onto the top step and keeps Biggy off it', () => {
    for (const { name, r } of shafts) {
      const mouth = nicheMouth(r);
      expect(mouth.w, `the ${name} mouth admits Biggy`).toBeLessThan(DEFS.biggy.r * 2);
      expect(mouth.w, `the ${name} mouth refuses Droid`).toBeGreaterThan(DEFS.droid.r * 2);
      expect(mouth.h).toBeGreaterThan(DEFS.droid.r * 2);
      // Chapter 1's descent waypoint is the centre of that top step, and it is
      // inside the corridor band.
      const head = { x: mouth.x + mouth.w / 2, y: mouth.y + mouth.h / 2 };
      expect(head.x).toBeGreaterThan(mouth.x);
      expect(head.x).toBeLessThan(mouth.x + mouth.w);
      expect(head.y).toBeGreaterThan(CY0);
      expect(head.y).toBeLessThan(CY1);
      // ...and the middle of the flight, where it used to stand, is now wall.
      const runs = floor1Walls().filter((w) => w.kind === 'stairwell' || w.kind === 'stairwell-near');
      const centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      expect(
        runs.some((w) => centre.x > w.x && centre.x < w.x + w.w && centre.y > w.y && centre.y < w.y + w.h),
        `the middle of the ${name} flight is still walkable`,
      ).toBe(true);
    }
  });
});

/**
 * ...and the chapter-1 exit cutscene walks round the balustrade, not through it.
 *
 * Michele, twice, the second time after a round that had not touched it: *"Robots
 * still go throuh the handrail in the chapter transiction."* He was right both
 * times. The closing route ran along the corridor to a point above the mouth and
 * then straight south into the top step, which crosses the balustrade
 * `floor1Walls()` stands across that mouth — the wall whose own `why` tells the
 * player *"the way on is round the end, off the corridor"*.
 *
 * Nothing caught it because a cutscene ignores walls on purpose (`game.ts`: the
 * shot has to be able to walk through the doorway it is being framed through), and
 * because every test in this repo asked where a robot may DRIVE. This one asks
 * where the chapter SENDS one, which is the question that was missing.
 *
 * The legs are sampled rather than solved: a segment/rect intersection would be
 * exact, but the sample is what a viewer sees — a robot's centre, frame by frame —
 * and it reports the offending leg and point instead of a boolean.
 */
describe('chapter 1 leaves by the stairs, not through them', () => {
  /** The walls a cutscene may not be seen to cross. Doorways are not among them. */
  const solid = floor1Walls().filter((w) => !w.hidden && !w.glass && !w.low);

  it('never walks a robot through a wall on the way out', () => {
    const fouls: string[] = [];
    for (const { kind, pts } of stairExitRoutes()) {
      const rad = DEFS[kind].r;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(2, Math.ceil(len / 0.5));
        for (let s = 0; s <= n; s++) {
          const p = { x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n };
          for (const w of solid) {
            // The robot is a disc, not a point: grazing the end of the handrail
            // reads as walking through it just as plainly as crossing the middle.
            if (p.x > w.x - rad && p.x < w.x + w.w + rad && p.y > w.y - rad && p.y < w.y + w.h + rad) {
              fouls.push(`${kind} leg ${i} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) is inside ${w.kind ?? 'wall'} ${w.x.toFixed(1)},${w.y.toFixed(1)} ${w.w.toFixed(1)}x${w.h.toFixed(1)}`);
            }
          }
        }
      }
    }
    expect([...new Set(fouls)].slice(0, 6), 'the exit cutscene walks through walls').toEqual([]);
  });

  it('turns in past the east end of the flight', () => {
    const nb = F1.nicheBot;
    const rail = floor1Walls().find((w) => w.kind === 'stair-rail-near');
    expect(rail, 'the near balustrade is gone').toBeDefined();
    for (const { kind, pts } of stairExitRoutes()) {
      // Every point that is south of the balustrade — i.e. on the stair side of it
      // — was reached from the open east end, never over the rail.
      const turn = pts.findIndex((p) => p.y > (rail as { y: number }).y);
      expect(turn, `${kind} never reaches the stair`).toBeGreaterThan(0);
      expect(pts[turn].x, `${kind} turns in over the balustrade`).toBeGreaterThan(nb.x + nb.w);
    }
  });

  it('ends with the three queued at the head, not in a heap', () => {
    const at = new Map(stairExitRoutes().map((r) => [r.kind, r.pts[r.pts.length - 1]]));
    const order: RobotKind[] = ['voxxy', 'droid', 'biggy'];
    for (let i = 1; i < order.length; i++) {
      const a = at.get(order[i - 1]) as { x: number; y: number };
      const b = at.get(order[i]) as { x: number; y: number };
      const gap = Math.hypot(b.x - a.x, b.y - a.y);
      expect(gap, `${order[i - 1]} and ${order[i]} finish inside each other`).toBeGreaterThan(DEFS[order[i - 1]].r + DEFS[order[i]].r);
    }
    // Voxxy takes the step; the other two are still in the corridor, because only
    // one robot fits in a 17.7 px mouth and Biggy does not fit in it at all.
    const mouth = nicheMouth(F1.nicheBot);
    expect((at.get('voxxy') as { x: number }).x).toBeLessThan(mouth.x + mouth.w);
    for (const k of ['droid', 'biggy'] as const) {
      expect((at.get(k) as { x: number }).x, `${k} is standing on the top step`).toBeGreaterThan(mouth.x + mouth.w);
    }
  });
});
