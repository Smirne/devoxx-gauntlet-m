/**
 * nastri.test.ts — the belt barrier at the foot of the main staircase.
 *
 * Michele, 27 Sep 2026, looking at the steel run that used to stand there:
 * *"Stephan is powerful, but i don't think he can remove a wall. I'd use something
 * simpler, like «Nastri»"*, and then *"We could also have some kind of
 * scene/effect where stephan pull one spot and the 8 nastri retract one by one."*
 *
 * Eight belts that go one at a time is eight chances for the picture and the
 * colliders to disagree, so this file measures the four things that would go wrong
 * in silence:
 *
 *  1. the line is nine posts and eight belts and all of it is inside `GF.gate`;
 *  2. the release runs OUTWARD from Stephan's hand, one belt at a time, with no two
 *     belts letting go on the same frame;
 *  3. through the whole wave, a belt is drawn if and only if the sim has a wall
 *     under it — the walk-through bug, asserted every frame rather than at the ends;
 *  4. and when it is over, the widest robot can walk between any two posts, and the
 *     three of them walk out through the GAPS in the cutscene rather than through a
 *     post, which no collider test can catch because a cutscene ignores walls.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, GF, circleRect, createGame, type BreakfastState, type DebugGame } from '../src/sim';
import { GATE_BELTS, GATE_POST_R, beltU, beltUp, nastriRun } from '../src/sim/nastri';
import type { Bot, Prop, Rect, Wall } from '../src/sim/types';
import { gateDraw } from '../src/render/doors';
import { playToStairGate } from './pilot';

const mk = (): DebugGame => createGame({ seed: 20260930, chapter: 3, cards: false });
const propOf = (g: DebugGame, kind: string): Prop => {
  const p = g.snapshot().props.find((o) => o.kind === kind);
  if (!p) throw new Error(`no ${kind} prop`);
  return p;
};
const beltWalls = (g: DebugGame): Wall[] => g.debug.walls().filter((w) => w.kind === 'gatebelt');
const postWalls = (g: DebugGame): Wall[] => g.debug.walls().filter((w) => w.kind === 'gatepost');
const inside = (r: Rect, outer: Rect): boolean =>
  r.x >= outer.x - 1e-9 &&
  r.y >= outer.y - 1e-9 &&
  r.x + r.w <= outer.x + outer.w + 1e-9 &&
  r.y + r.h <= outer.y + outer.h + 1e-9;
/** Is every 2 px sample of `r` inside some wall? The lattice `colliders.test.ts` walks. */
function uncovered(r: Rect, walls: readonly Wall[]): number {
  let miss = 0;
  const xs = [r.x, r.x + r.w / 2, r.x + r.w];
  for (let y = r.y; y <= r.y + r.h + 1e-9; y = Math.min(y + 2, r.y + r.h) + (y + 2 >= r.y + r.h ? 1e-6 : 0)) {
    for (const x of xs) {
      if (!walls.some((w) => x >= w.x - 1e-9 && x <= w.x + w.w + 1e-9 && y >= w.y - 1e-9 && y <= w.y + w.h + 1e-9)) miss++;
    }
  }
  return miss;
}

describe('the stair nastri · the line itself', () => {
  it('is nine posts and eight belts, every one of them inside the line the plan draws', () => {
    const run = nastriRun(GF.gate, 0.5);
    expect(run.posts).toHaveLength(GATE_BELTS + 1);
    expect(run.belts).toHaveLength(GATE_BELTS);
    expect(run.vertical, 'the staircase faces the entrance, so its barrier runs north–south').toBe(true);

    for (const r of [...run.postRects, ...run.belts.map((b) => b.rect)]) {
      expect(inside(r, GF.gate), `${r.x},${r.y} ${r.w}x${r.h} sticks out of GF.gate`).toBe(true);
    }
    // The belts tile the run end to end: no overlap, no seam a robot could aim at.
    for (let i = 1; i < run.belts.length; i++) {
      const prev = run.belts[i - 1].rect;
      expect(run.belts[i].rect.y).toBeCloseTo(prev.y + prev.h, 9);
    }
    // ...and what is left between two posts is wider than the widest robot.
    const gap = run.posts[1].y - run.posts[0].y - GATE_POST_R * 2;
    const biggy = mk().snapshot().bots[2] as Bot;
    expect(gap, 'the gaps between the posts are too narrow for Biggy').toBeGreaterThan(biggy.r * 2);
  });

  it('lets go from Stephan’s hand outward, one belt at a time', () => {
    const run = nastriRun(GF.gate, 0.5);
    const ranks = run.belts.map((b) => b.rank).sort((a, b) => a - b);
    expect(ranks, 'two belts share a release rank, so two let go on one frame').toEqual([...Array(GATE_BELTS).keys()]);

    // Stephan stands at the middle, so the first belt to go is one of the two that
    // touch the middle post, and every later one is at least as far from him.
    const mid = GF.gate.y + GF.gate.h / 2;
    const away = (i: number): number => Math.abs((run.belts[i].a.y + run.belts[i].b.y) / 2 - mid);
    const byRank = [...run.belts].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < byRank.length; i++) {
      expect(away(byRank[i].i), `belt of rank ${i} goes before one nearer Stephan`).toBeGreaterThanOrEqual(
        away(byRank[i - 1].i) - 1e-9,
      );
    }
    // And each belt winds into the post FARTHER from him, so the opening grows
    // outward from his hand rather than towards it.
    for (const b of run.belts) {
      const far = Math.abs(b.anchor.y - mid);
      const near = Math.abs((b.anchor === b.a ? b.b : b.a).y - mid);
      expect(far, `belt ${b.i} winds back towards the man releasing it`).toBeGreaterThanOrEqual(near);
    }
  });

  it('finishes every belt by the end of the wave, and no two on the same frame', () => {
    const done: number[] = [];
    for (let rank = 0; rank < GATE_BELTS; rank++) {
      expect(beltU(0, rank), `belt ${rank} is already winding in before anyone touched it`).toBe(0);
      expect(beltU(1, rank), `belt ${rank} is still across the line when the wave is over`).toBe(1);
      let u = 0;
      while (u < 1 && beltUp(u, rank)) u = Math.round((u + 0.001) * 1000) / 1000;
      done.push(u);
    }
    for (let i = 1; i < done.length; i++) {
      expect(done[i], `belts ${i - 1} and ${i} land together`).toBeGreaterThan(done[i - 1]);
    }
  });
});

describe('the stair nastri · Stephan opens it', () => {
  it('drops one belt wall at a time, and never draws a belt it has no wall for', () => {
    const g = mk();
    g.update(DT_MAX);
    const seen: number[] = [];
    playToStairGate(g, (h) => {
      // The whole wave, frame by frame, from the one `done()` fires on.
      for (let i = 0; i < 80 && (h.debug.chapter() as BreakfastState).gateSwing < 1; i++) {
        const u = (h.debug.chapter() as BreakfastState).gateSwing;
        const walls = h.debug.walls();
        const drawn = gateDraw(propOf(h, 'gate'), walls).belts;
        const up = drawn.filter((b) => b.up);
        seen.push(up.length);
        expect(beltWalls(h), `${up.length} belts drawn, ${beltWalls(h).length} walls, at u=${u}`).toHaveLength(up.length);
        for (const b of up) {
          expect(uncovered(b.rect, walls), `a belt is drawn over open floor at u=${u}`).toBe(0);
        }
        expect(postWalls(h), 'a post went missing').toHaveLength(GATE_BELTS + 1);
        h.update(DT_MAX);
      }
    });
    // Eight, down to none, one at a time and never back up.
    expect(seen[0]).toBe(GATE_BELTS);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `the count jumped from ${seen[i - 1]} to ${seen[i]}`).toBeGreaterThanOrEqual(seen[i - 1] - 1);
      expect(seen[i]).toBeLessThanOrEqual(seen[i - 1]);
    }
    expect(seen[seen.length - 1], 'the wave never got through all eight').toBeLessThan(GATE_BELTS);
    expect(beltWalls(g), 'a belt is still a collider after the wave').toHaveLength(0);
    expect(gateDraw(propOf(g, 'gate'), g.debug.walls()).belts.filter((b) => b.up)).toHaveLength(0);
  });

  it('gives the flight back: the widest robot fits through every gap in the line', () => {
    const g = mk();
    g.update(DT_MAX);
    playToStairGate(g);
    const walls = g.debug.walls();
    const biggy = g.snapshot().bots[2] as Bot;
    const run = nastriRun(GF.gate, 0.5);
    for (const b of run.belts) {
      const at = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
      const blocked = walls.filter((w) => (w.skipFor?.(biggy) !== true) && circleRect({ ...at, r: biggy.r }, w));
      /*
       * Nothing the BARRIER leaves behind may be in the way of any gap. The two
       * gaps at the ends of the line are still up against the flight's own side
       * walls — the line is the full width of the staircase and a staircase has
       * cheeks — and that is the building, not Stephan's barrier.
       */
      const mine = blocked.filter((w) => (w.kind ?? '').startsWith('gate'));
      expect(mine.map((w) => w.kind), `the barrier still blocks the gap at y=${Math.round(at.y)}`).toEqual([]);
    }
    // ...and the three gaps the exit walks through are clear of everything.
    for (const i of [3, 4, 5]) {
      const b = run.belts[i];
      const at = { x: (b.a.x + b.b.x) / 2 - 10, y: (b.a.y + b.b.y) / 2 };
      const blocked = walls.filter((w) => (w.skipFor?.(biggy) !== true) && circleRect({ ...at, r: biggy.r }, w));
      expect(blocked.map((w) => w.kind ?? '?'), `Biggy cannot walk out through gap ${i}`).toEqual([]);
    }
  });

  it('walks the three of them out between the posts rather than through one', () => {
    const g = mk();
    g.update(DT_MAX);
    playToStairGate(g);
    for (let i = 0; i < 200 && g.snapshot().phase === 'play'; i++) g.update(DT_MAX);
    expect(g.snapshot().phase).toBe('cut');

    const posts = postWalls(g);
    let crossings = 0;
    for (let i = 0; i < 400 && g.snapshot().phase === 'cut'; i++) {
      for (const b of g.snapshot().bots) {
        // Only the frames a robot is actually at the line: a cutscene ignores
        // walls (`cutUpdate` in `game.ts`), so this is the only thing standing
        // between the last shot of the chapter and Droid inside a chrome post.
        if (Math.abs(b.x - (GF.gate.x + GF.gate.w / 2)) > 6) continue;
        crossings++;
        const hit = posts.filter((w) => circleRect({ x: b.x, y: b.y, r: b.r }, w));
        expect(hit, `${b.kind} walks out through a post at y=${Math.round(b.y)}`).toEqual([]);
      }
      g.update(DT_MAX);
    }
    expect(crossings, 'nobody ever reached the line, so this measured nothing').toBeGreaterThan(0);
  });
});
