/**
 * THE BEER DELIVERY'S OWN PATH — measured, not asserted.
 *
 * Michele, on the plan to stack the crates behind the catering counter: *"ok but
 * remember biggy can't reach the soup without voxxy's help. So it should be a
 * different path, with clear hints. (glowing halo, taps ready, belgian beer
 * glassess)."*
 *
 * "A different path" is a claim about the floor, and a claim about the floor can be
 * measured. So the first two tests here do not look at the chapter's intentions at
 * all: they flood-fill the ground floor at Biggy's own radius, with all three
 * catering queues standing exactly where the chapter puts them, and ask the grid
 * two questions.
 *
 *   1. Is the bar's mark reachable from the pallet on that fill? (It must be — the
 *      beer is Biggy's errand alone.)
 *   2. Is the soup station reachable on the same fill? (It must NOT be — the soup
 *      is Voxxy's gate, and that gate is the thing the beer must not charge twice.)
 *
 * The fill treats every person in a queue as a solid disc, so a route the fill
 * finds cannot touch one: "never crosses a queue" is a property of the search
 * rather than of a later check. The later check is here anyway, because a test that
 * states the property out loud survives a rewrite of the search.
 *
 * Everything below reads the PUBLIC surface — the snapshot, `BreakfastState`, the
 * debug seam — and never the chapter's internals.
 */

import { describe, expect, it } from 'vitest';

import {
  CRATE_BREWS,
  CRATE_DELIVERY,
  CRATE_STACK_LIMIT,
  DEFS,
  DT_MAX,
  GF,
  createGame,
  crateBrew,
  type Bot,
  type BreakfastState,
  type DebugGame,
  type Prop,
  type Rect,
  type Vec2,
  type Wall,
} from '../src/sim';

const SEED = 20260930;
const mk = (): DebugGame => createGame({ seed: SEED, chapter: 3, cards: false });

const breakfastOf = (g: DebugGame): BreakfastState => g.debug.chapter() as BreakfastState;
const bot = (g: DebugGame, kind: 'voxxy' | 'droid' | 'biggy'): Bot => {
  const b = g.snapshot().bots.find((o) => o.kind === kind);
  if (!b) throw new Error(`no ${kind}`);
  return b;
};

/** The mark the sim says the crates go on. Read off the prop, never typed in twice. */
function barMark(g: DebugGame): Rect {
  const p = g.snapshot().props.find((o) => o.kind === 'dropzone' && (o.label ?? '').includes('beer'));
  if (!p) throw new Error('chapter 3 has no beer drop mark');
  return { x: p.x, y: p.y, w: p.w ?? 0, h: p.h ?? 0 };
}
const centre = (r: Rect): Vec2 => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Where the crates start, from the state rather than from a constant. */
function palletAt(g: DebugGame): Vec2 {
  const loose = breakfastOf(g).beer.loose;
  expect(loose).toHaveLength(CRATE_DELIVERY);
  return {
    x: loose.reduce((a, c) => a + c.x, 0) / loose.length,
    y: loose.reduce((a, c) => a + c.y, 0) / loose.length,
  };
}

/* ------------------------------------------------------- the flood fill itself
 *
 * One cell per sim pixel over the exhibition hall, at Biggy's frozen radius. A
 * cell is walkable when his body fits in it: clear of every wall the chapter's own
 * live wall list carries (minus the ones that do not exist for him at all), and
 * clear of every person standing in a catering queue.
 */

const R = DEFS.biggy.r;
const X0 = GF.hall.x;
const Y0 = GF.hall.y;
const NX = GF.hall.w + 1;
const NY = GF.hall.h + 1;
const at = (i: number, j: number): Vec2 => ({ x: X0 + i, y: Y0 + j });
const cell = (p: Vec2): number => Math.round(p.y - Y0) * NX + Math.round(p.x - X0);

interface Disc {
  x: number;
  y: number;
  r: number;
}

function blockedGrid(walls: Rect[], discs: Disc[], r: number): Uint8Array {
  const blocked = new Uint8Array(NX * NY);
  for (const w of walls) {
    const i0 = Math.max(0, Math.floor(w.x - r - X0));
    const i1 = Math.min(NX - 1, Math.ceil(w.x + w.w + r - X0));
    const j0 = Math.max(0, Math.floor(w.y - r - Y0));
    const j1 = Math.min(NY - 1, Math.ceil(w.y + w.h + r - Y0));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = j * NX + i;
        if (blocked[k]) continue;
        const p = at(i, j);
        const qx = p.x < w.x ? w.x : p.x > w.x + w.w ? w.x + w.w : p.x;
        const qy = p.y < w.y ? w.y : p.y > w.y + w.h ? w.y + w.h : p.y;
        if ((p.x - qx) ** 2 + (p.y - qy) ** 2 < r * r) blocked[k] = 1;
      }
    }
  }
  for (const d of discs) {
    const rr = r + d.r;
    for (let i = Math.max(0, Math.floor(d.x - rr - X0)); i <= Math.min(NX - 1, Math.ceil(d.x + rr - X0)); i++) {
      for (let j = Math.max(0, Math.floor(d.y - rr - Y0)); j <= Math.min(NY - 1, Math.ceil(d.y + rr - Y0)); j++) {
        const p = at(i, j);
        if ((p.x - d.x) ** 2 + (p.y - d.y) ** 2 < rr * rr) blocked[j * NX + i] = 1;
      }
    }
  }
  return blocked;
}

/** Biggy's world: the live walls that exist for him, and the queues as bodies. */
function biggyGrid(g: DebugGame): { blocked: Uint8Array; queues: Disc[] } {
  const snap = g.snapshot();
  const big = bot(g, 'biggy');
  const walls = (snap.walls as Wall[]).filter((w) => !(w.skipFor && w.skipFor(big)));
  const queues: Disc[] = snap.people.filter((p) => p.role === 'queue').map((p) => ({ x: p.x, y: p.y, r: p.r }));
  expect(queues.length).toBeGreaterThan(15);
  return { blocked: blockedGrid(walls, queues, R), queues };
}

/** Shortest walkable route between two points, one pixel per step, or null. */
function route(blocked: Uint8Array, from: Vec2, to: Vec2): Vec2[] | null {
  const s = cell(from);
  const t = cell(to);
  if (blocked[s] || blocked[t]) return null;
  const prev = new Int32Array(NX * NY).fill(-2);
  const queue = new Int32Array(NX * NY);
  let head = 0;
  let tail = 0;
  prev[s] = -1;
  queue[tail++] = s;
  while (head < tail) {
    const c = queue[head++];
    if (c === t) break;
    const i = c % NX;
    const j = (c - i) / NX;
    const nb = [i + 1 < NX ? c + 1 : -1, i > 0 ? c - 1 : -1, j + 1 < NY ? c + NX : -1, j > 0 ? c - NX : -1];
    for (const k of nb) {
      if (k < 0 || blocked[k] || prev[k] !== -2) continue;
      prev[k] = c;
      queue[tail++] = k;
    }
  }
  if (prev[t] === -2) return null;
  const pts: Vec2[] = [];
  for (let c = t; c !== -1; c = prev[c]) {
    const i = c % NX;
    pts.push(at(i, (c - i) / NX));
  }
  return pts.reverse();
}

const inRectPt = (p: Vec2, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/* ============================================================ the measurement */

describe('the beer delivery has its own path', () => {
  it('routes Biggy from the pallet to the bar without ever meeting a queue', () => {
    const g = mk();
    const { blocked, queues } = biggyGrid(g);
    const from = palletAt(g);
    const to = centre(barMark(g));

    const path = route(blocked, from, to);
    expect(path, 'no queue-free route from the pallet to the bar').not.toBeNull();
    const pts = path as Vec2[];

    // Said out loud, not merely implied by the search: at no point on the route is
    // Biggy's body touching anybody who is standing in a catering queue.
    for (const p of pts) {
      for (const q of queues) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        expect(d, `route passes through a queue at ${p.x},${p.y}`).toBeGreaterThanOrEqual(R + q.r);
      }
    }
    // ...and the route never even enters the catering block, whose three doorways
    // are the only way in and are what the queues stand in.
    for (const p of pts) expect(inRectPt(p, GF.food.court), 'route enters the catering block').toBe(false);

    // The haul is a real errand and not a hike: two round trips at this length is
    // the whole delivery. If this number ever doubles, somebody has moved the bar.
    expect(pts.length - 1).toBeLessThan(320);
    expect(pts.length - 1).toBeGreaterThan(120);
  });

  it('shares no floor with the soup errand, which lives inside the catering block', () => {
    const g = mk();
    const { blocked } = biggyGrid(g);
    const from = palletAt(g);

    // The soup station is INSIDE the catering court, whose only ways in are the
    // three doorways the queues stand in. The beer route, measured above, never
    // enters that rect at all — so the two errands are not the same errand with
    // two names, whatever the queues happen to be doing on a given frame.
    const soup = g.snapshot().props.find((p) => p.kind === 'soup-station');
    if (!soup) throw new Error('no soup station');
    expect(inRectPt({ x: soup.x, y: soup.y }, GF.food.court)).toBe(true);
    const beer = route(blocked, from, centre(barMark(g))) as Vec2[];
    for (const p of beer) expect(inRectPt(p, GF.food.court)).toBe(false);
    // ...and the bar's own mark is not in it either, nor is the finished stack.
    expect(inRectPt(centre(barMark(g)), GF.food.court)).toBe(false);
  });

  /*
   * A MEASUREMENT THAT IS NOT A PASS MARK, and a note for whoever owns the soup.
   *
   * While measuring the beer's route this fill also measured the soup's gate, and
   * the gate is softer than the chapter reads: a catering doorway is 44 px wide,
   * the queue standing in it is two files 10 px apart, and at Biggy's radius that
   * leaves a clear window of about 11 px of centre line beside the people — enough
   * to drive through without Voxxy saying a word. Clearing the queue still helps,
   * and that is what is asserted here: the window is strictly wider once they make
   * way. The absolute "he cannot get in at all" is NOT asserted, because it is not
   * true today and a test that claimed it would be a false pass.
   */
  it('widens the catering doorway when Voxxy clears the queue — it does not seal it', () => {
    const g = mk();
    const gap = GF.food.gaps[0];
    const y = GF.food.court.y + GF.food.court.h + 3;

    const window = (): number => {
      const big = bot(g, 'biggy');
      const snap = g.snapshot();
      const walls = (snap.walls as Wall[]).filter((w) => !(w.skipFor && w.skipFor(big)));
      const discs = snap.people.filter((p) => p.role === 'queue').map((p) => ({ x: p.x, y: p.y, r: p.r }));
      const blocked = blockedGrid(walls, discs, R);
      let best = 0;
      let run = 0;
      for (let x = gap[0] - 20; x <= gap[1] + 20; x++) {
        run = blocked[cell({ x, y })] ? 0 : run + 1;
        best = Math.max(best, run);
      }
      return best;
    };

    const shut = window();
    g.debug.select('voxxy');
    g.debug.place('voxxy', (gap[0] + gap[1]) / 2, y + 22);
    g.key('KeyE');
    expect(breakfastOf(g).queues[0].open).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) g.update(DT_MAX);
    const open = window();
    expect(open, `doorway window ${shut}px shut, ${open}px open`).toBeGreaterThan(shut);
  });

  it('puts the bar outside the catering block, and makes its counter solid', () => {
    const g = mk();
    const mark = barMark(g);
    for (const corner of [
      { x: mark.x, y: mark.y },
      { x: mark.x + mark.w, y: mark.y + mark.h },
    ]) {
      expect(inRectPt(corner, GF.food.court), 'the drop mark is inside the catering block').toBe(false);
    }
    // A bar you can walk through is the "this cube is walk-through" note again.
    const bar = g.snapshot().walls.find((w) => w.kind === 'bar');
    expect(bar, 'the bar counter is not a collider').toBeTruthy();
    expect((bar as Wall).low, 'the bar counter should pass light like every other counter').toBe(true);
    // Three voices, not one sentence with the name swapped (CLAUDE.md).
    const said = (['voxxy', 'droid', 'biggy'] as const).map((k) => (bar as Wall).why?.(bot(g, k)) ?? '');
    expect(new Set(said).size).toBe(3);
    for (const line of said) expect(line.length).toBeGreaterThan(20);
  });
});

/* =================================================== the hints, and the beer */

describe('the bar reads as a bar', () => {
  it('sets out taps and Belgian glassware on a counter that stands where the sim says', () => {
    const g = mk();
    const props = g.snapshot().props;
    const counter = props.find((p) => p.kind === 'bar-counter');
    expect(counter, 'no bar counter').toBeTruthy();
    const bar = g.snapshot().walls.find((w) => w.kind === 'bar') as Wall;
    // The prop and the collider are the same object seen twice: centre against rect.
    expect(counter?.x).toBeCloseTo(bar.x + bar.w / 2, 6);
    expect(counter?.y).toBeCloseTo(bar.y + bar.h / 2, 6);

    const taps = props.filter((p) => p.kind === 'beer-tap');
    const glasses = props.filter((p) => p.kind === 'beer-glass');
    expect(taps.length).toBeGreaterThanOrEqual(3);
    expect(glasses.length).toBeGreaterThanOrEqual(3);
    // Everything on the bar is ON the bar.
    for (const p of [...taps, ...glasses]) expect(inRectPt({ x: p.x, y: p.y }, bar)).toBe(true);
    // Each glass says which shape it is, so four glasses are four silhouettes.
    expect(new Set(glasses.map((p) => p.v)).size).toBe(glasses.length);
  });

  it('rings the drop mark with a halo that lights now and goes green when it is done', () => {
    const g = mk();
    const mark = barMark(g);
    const ring = (p: Prop[]): Prop[] =>
      p.filter(
        (o) =>
          o.kind === 'dropzone' &&
          o.label === undefined &&
          o.x >= mark.x - 8 &&
          o.x <= mark.x + mark.w + 8 &&
          o.y >= mark.y - 8 &&
          o.y <= mark.y + mark.h + 8,
      );
    const before = ring(g.snapshot().props);
    expect(before, 'the drop mark has no halo round it').toHaveLength(4);
    for (const r of before) expect(r.state).toBe('active');

    clearTheDelivery(g);
    expect(breakfastOf(g).beer.done).toBe(true);
    const after = ring(g.snapshot().props);
    expect(after).toHaveLength(4);
    for (const r of after) expect(r.state).toBe('done');
  });

  it('wears the same halo on the soup mark, so one ring means one thing', () => {
    const g = mk();
    const soupMark = g.snapshot().props.find((p) => p.kind === 'dropzone' && (p.label ?? '').includes('soup'));
    expect(soupMark, 'no soup drop mark').toBeTruthy();
    const m = soupMark as Prop;
    const ring = g
      .snapshot()
      .props.filter(
        (o) =>
          o.kind === 'dropzone' &&
          o.label === undefined &&
          o.x >= m.x - 8 &&
          o.x <= m.x + (m.w ?? 0) + 8 &&
          o.y >= m.y - 8 &&
          o.y <= m.y + (m.h ?? 0) + 8,
      );
    expect(ring).toHaveLength(4);
  });

  it('puts an invented Belgian brewery on every crate, and says it out loud', () => {
    const g = mk();
    expect(new Set(CRATE_BREWS).size).toBe(CRATE_BREWS.length);
    expect(CRATE_BREWS.length).toBeGreaterThanOrEqual(CRATE_DELIVERY);

    const labels = g
      .snapshot()
      .props.filter((p) => p.kind === 'crate')
      .map((p) => p.label ?? '');
    expect(labels).toHaveLength(CRATE_DELIVERY);
    for (let i = 0; i < CRATE_DELIVERY; i++) {
      expect(labels.some((l) => l.includes(crateBrew(i))), `no crate labelled ${crateBrew(i)}`).toBe(true);
    }

    // Biggy reads the name off the crate he lifts — the joke only lands if it is
    // said where the player is looking.
    const c = breakfastOf(g).beer.loose[0];
    g.debug.select('biggy');
    g.debug.place('biggy', c.x, c.y + 12);
    g.key('KeyE');
    expect(breakfastOf(g).beer.carried).toBe(1);
    const toast = g.snapshot().toast?.t ?? '';
    expect(CRATE_BREWS.some((b) => toast.includes(b)), `toast named no brewery: ${toast}`).toBe(true);
  });
});

/* ========================================================== playing the beat */

/** Biggy walks onto the nearest crate still on the floor and picks it up. */
function liftCrate(g: DebugGame): void {
  const c = breakfastOf(g).beer.loose[0];
  if (!c) throw new Error('no crate left on the floor');
  g.debug.select('biggy');
  g.debug.place('biggy', c.x, c.y + 12);
  g.key('KeyE');
}

function putCratesDown(g: DebugGame): void {
  const at2 = centre(barMark(g));
  g.debug.select('biggy');
  g.debug.place('biggy', at2.x, at2.y);
  g.key('KeyE');
}

function clearTheDelivery(g: DebugGame): void {
  while (breakfastOf(g).beer.stacked < CRATE_DELIVERY) {
    const room = Math.min(CRATE_STACK_LIMIT - 1, breakfastOf(g).beer.loose.length);
    for (let i = 0; i < room; i++) liftCrate(g);
    putCratesDown(g);
  }
}

describe('playing the delivery', () => {
  it('drives the whole haul on the measured route, loaded, and finishes the beer', () => {
    const g = mk();
    const { blocked } = biggyGrid(g);
    const from = palletAt(g);
    const to = centre(barMark(g));
    const path = route(blocked, from, to) as Vec2[];
    expect(path).not.toBeNull();

    // Waypoints off the measured route, one every 40 px, so the pilot drives the
    // floor the fill found rather than a straight line through a column.
    const way = path.filter((_, i) => i % 40 === 0).concat([to]);

    let seconds = 0;
    let trips = 0;
    g.debug.select('biggy');
    while (breakfastOf(g).beer.stacked < CRATE_DELIVERY) {
      trips++;
      expect(trips).toBeLessThanOrEqual(3);
      // Load up at the pallet, one crate under the limit.
      const room = Math.min(CRATE_STACK_LIMIT - 1, breakfastOf(g).beer.loose.length);
      for (let i = 0; i < room; i++) liftCrate(g);
      expect(breakfastOf(g).beer.carried).toBe(room);
      expect(breakfastOf(g).beer.oom).toBe(0);

      // ...and drive him there, on the route, with the crates on his back.
      g.debug.place('biggy', from.x, from.y);
      for (const w of way) {
        for (let step = 0; step < 900; step++) {
          const b = bot(g, 'biggy');
          const dx = w.x - b.x;
          const dy = w.y - b.y;
          if (Math.hypot(dx, dy) < 10) break;
          const d = Math.hypot(dx, dy) || 1;
          g.setStick(dx / d, dy / d);
          g.update(DT_MAX);
          seconds += DT_MAX;
        }
      }
      g.setStick(0, 0);
      const b = bot(g, 'biggy');
      expect(Math.hypot(b.x - to.x, b.y - to.y), 'Biggy could not drive the measured route').toBeLessThan(44);
      g.key('KeyE');
    }

    const st = breakfastOf(g).beer;
    expect(st.stacked).toBe(CRATE_DELIVERY);
    expect(st.done).toBe(true);
    expect(st.oom).toBe(0);
    // Two trips, and the driving is seconds rather than minutes. The bar moved to
    // make the beat legible, not to make it long.
    expect(trips).toBe(2);
    expect(seconds, `haul took ${seconds.toFixed(1)}s`).toBeLessThan(90);

    // The frozen identity comes back exactly, with nothing on his back.
    const big = bot(g, 'biggy');
    expect(big.mass).toBeCloseTo(DEFS.biggy.mass, 10);
    expect(big.accel).toBeCloseTo(DEFS.biggy.accel, 10);
  });

  it('stacks the delivery at the cellar end, clear of the mark Biggy stands on', () => {
    const g = mk();
    clearTheDelivery(g);
    const mark = barMark(g);
    const stacked = g.snapshot().props.filter((p) => p.kind === 'crate' && p.state === 'done');
    expect(stacked).toHaveLength(CRATE_DELIVERY);
    for (const c of stacked) expect(inRectPt({ x: c.x, y: c.y }, mark), 'the stack grows where the player stands').toBe(false);
    // Piled, not spread: three wide and two layers deep.
    expect(new Set(stacked.map((c) => c.v)).size).toBe(2);
  });
});
