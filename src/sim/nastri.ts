/**
 * nastri.ts — the retractable belt barrier at the foot of the main staircase.
 *
 * ## Why it is not a crowd barrier any more
 *
 * Michele, 27 Sep 2026, looking at the shut gate in chapter 3: *"Stephan is
 * powerful, but i don't think he can remove a wall. I'd use something simpler,
 * like «Nastri»"* — and then, having seen the plan of what was there: *"Nastri is
 * fine. We could also have some kind of scene/effect where stephan pull one spot
 * and the 8 nastri retract one by one."*
 *
 * He is right about the fiction, and the drawing agreed with him: the old barrier
 * was 15.76 m of steel with a 3.52 m gate hung in the middle of it, and the line
 * that opened it — *"Stephan unhooks the barrier and walks it back against the
 * wall"* — described moving all 15.76 m when only the leaf ever moved. Nobody walks
 * a steel run anywhere. What a venue really puts across a staircase it wants to
 * reopen in one gesture is a line of **belt posts**: a chrome column with a webbing
 * belt that winds back into its own head when you unclip it.
 *
 * So the line is now **nine posts and eight belts**, and opening it is a wave:
 * Stephan unclips the belt in front of him and the release runs outward from him,
 * one belt at a time, each winding into its post.
 *
 * ## Why the arithmetic lives in the sim
 *
 * Because the belts are COLLIDERS as well as a picture. Chapter 3 pushes a wall per
 * belt and takes each one away as that belt finishes retracting, and the renderer
 * draws the same list from the same numbers (`gateDraw` in `src/render/doors.ts`).
 * `tests/doors.test.ts` measures exactly that agreement — every rect the renderer
 * draws for the gate must have a wall under it, in both states — and the cheapest
 * way to pass a test like that is to have one source of truth rather than two
 * copies that a test compares. `src/render` may read `src/sim`; the reverse is what
 * CLAUDE.md forbids, and nothing here knows the renderer exists.
 */

import type { Rect, Vec2 } from './types';

/** Belts in the run. Michele's own number: *"the 8 nastri"*. */
export const GATE_BELTS = 8;
/**
 * A post's collider radius, sim px — 0.128 m.
 *
 * A belt post is a slim column on a flat disc, not a barrier leg: it is the one
 * thing left standing once the line is open, so it has to be small enough that
 * walking the three robots up the middle of a 15.76 m staircase never touches one.
 */
export const GATE_POST_R = 1.6;
/**
 * A belt's collider thickness, sim px — 0.32 m.
 *
 * A webbing belt is a few millimetres of nylon, and a collider that thin is a
 * collider a fast robot tunnels through between two frames. This is the old
 * barrier's own thickness, kept: it is what "you do not walk through this" has
 * measured at since the gate was built, and `DT_MAX` has not changed.
 */
export const GATE_BELT_T = 4;
/** The barrier's height, metres — posts stand this tall, the belt hangs below it. */
export const GATE_H = 1.0;
/** Where the belt itself runs, metres off the floor. */
export const BELT_H = 0.88;

/**
 * How much of the whole opening ONE belt's own snap-back takes, 0..1.
 *
 * A webbing belt does not travel, it snaps: let go of the clip and it is inside the
 * post before you have straightened up. So one belt takes a quarter of the window
 * and the eight of them are staggered across the other three quarters — which is
 * what makes the wave read as eight separate releases rather than as one slow
 * curtain. With `GATE_SWING_TIME` at 1.5 s that is a 0.38 s snap every 0.16 s, and
 * the last belt lands exactly on 1, so the cutscene's timing does not move.
 */
export const BELT_SPAN = 0.25;
const STAGGER = (1 - BELT_SPAN) / Math.max(1, GATE_BELTS - 1);

/** One belt of the run. */
export interface Nastro {
  /** Position along the run, 0 at the rect's low end. */
  i: number;
  /** Release order, 0 for the one Stephan pulls. See `nastriRun`. */
  rank: number;
  /** The posts it spans. */
  a: Vec2;
  b: Vec2;
  /**
   * The post it winds INTO — the one FARTHER from the pull.
   *
   * Which is both what happens and what reads. Stephan takes the clip in front of
   * him and the webbing runs away from his hand into its own post, so the gap this
   * belt leaves opens at his end first and grows outward. Anchored the other way
   * the belts would all wind back towards the man releasing them and the opening
   * would appear at the far ends of a line he is standing in the middle of.
   */
  anchor: Vec2;
  /** Its footprint while it is still clipped up. */
  rect: Rect;
}

export interface NastriRun {
  /** `GATE_BELTS + 1` posts, low end first. */
  posts: Vec2[];
  belts: Nastro[];
  /** True when the run lies along +y — which `GF.gate` does, since the stair turned. */
  vertical: boolean;
  /** Every post's own footprint. Posts never move, open or shut. */
  postRects: Rect[];
}

/**
 * The run across `rect`, and the order the belts let go in.
 *
 * `pullT` is where Stephan takes hold, as a fraction along the run — chapter 3
 * hands it his own position, which is the middle, so the line opens outward from
 * him in both directions like a zipper. Ranking is by distance from that point and
 * then by index, so the two sides alternate and no two belts share a rank.
 */
export function nastriRun(rect: Rect, pullT = 0.5): NastriRun {
  const vertical = rect.h >= rect.w;
  const cross = (vertical ? rect.x : rect.y) + (vertical ? rect.w : rect.h) / 2;
  const at = (t: number): Vec2 => (vertical ? { x: cross, y: t } : { x: t, y: cross });
  /*
   * The end posts stand a radius IN from the rect's ends rather than on them.
   *
   * Not tidiness: `tests/doors.test.ts` measures every rect the renderer draws for
   * this barrier against the sim's wall list, and while the line is shut the only
   * wall under it is the chapter's own `gate` — which is exactly `rect`. A post
   * centred on the end of the rect would put half its footprint outside the one
   * wall that covers it, and the barrier would be drawn 1.6 px into open floor at
   * each end of a 15.76 m run. So the run is the rect, minus a post at each end.
   */
  const span = (vertical ? rect.h : rect.w) - GATE_POST_R * 2;
  const start = (vertical ? rect.y : rect.x) + GATE_POST_R;

  const step = span / GATE_BELTS;
  const posts: Vec2[] = [];
  for (let i = 0; i <= GATE_BELTS; i++) posts.push(at(start + i * step));

  const pull = start + Math.min(1, Math.max(0, pullT)) * span;
  const mid = (i: number): number => start + (i + 0.5) * step;
  const order = [...Array(GATE_BELTS).keys()].sort(
    (p, q) => Math.abs(mid(p) - pull) - Math.abs(mid(q) - pull) || p - q,
  );

  const belts: Nastro[] = order.map((i, rank) => {
    const a = posts[i];
    const b = posts[i + 1];
    const lo = start + i * step;
    return {
      i,
      rank,
      a,
      b,
      // Away from the hand that just unclipped it. See `Nastro.anchor`.
      anchor: dist1(a, pull, vertical) >= dist1(b, pull, vertical) ? a : b,
      rect: vertical
        ? { x: cross - GATE_BELT_T / 2, y: lo, w: GATE_BELT_T, h: step }
        : { x: lo, y: cross - GATE_BELT_T / 2, w: step, h: GATE_BELT_T },
    };
  });
  // Back into position order: a caller drawing or colliding them wants the line,
  // not the running order, and every belt carries its own `rank` anyway.
  belts.sort((p, q) => p.i - q.i);

  return {
    posts,
    belts,
    vertical,
    postRects: posts.map((p) => ({
      x: p.x - GATE_POST_R,
      y: p.y - GATE_POST_R,
      w: GATE_POST_R * 2,
      h: GATE_POST_R * 2,
    })),
  };
}

const dist1 = (p: Vec2, at: number, vertical: boolean): number => Math.abs((vertical ? p.y : p.x) - at);

/**
 * How far belt `rank` has wound in, at overall progress `u`.
 *
 * 0 while it is still clipped across, 1 once it is fully inside its post. The
 * chapter removes that belt's wall on the frame this reaches 1, and the renderer
 * stops drawing it on the same frame — one number, so they cannot disagree.
 */
export const beltU = (u: number, rank: number): number =>
  Math.min(1, Math.max(0, (u - rank * STAGGER) / BELT_SPAN));

/** Is this belt still something you cannot walk through? */
export const beltUp = (u: number, rank: number): boolean => beltU(u, rank) < 1;

/**
 * What belt `n` still covers at overall progress `u` — its live footprint.
 *
 * It shrinks towards `n.anchor` and lands on a zero-length sliver inside that post,
 * so it is always a SUBSET of `n.rect` and never grows past either end. That is the
 * property `tests/doors.test.ts` rests on: the chapter's wall for this belt covers
 * `n.rect` for as long as `beltUp` is true, so every rect the renderer draws while
 * the belt is winding in has sim under it, and the frame the wall goes away is the
 * frame the drawing stops.
 */
export function beltRect(run: NastriRun, n: Nastro, u: number): Rect {
  const left = 1 - beltU(u, n.rank);
  if (run.vertical) {
    const h = n.rect.h * left;
    const low = n.anchor.y <= n.rect.y + n.rect.h / 2;
    return { x: n.rect.x, y: low ? n.rect.y : n.rect.y + n.rect.h - h, w: n.rect.w, h };
  }
  const w = n.rect.w * left;
  const low = n.anchor.x <= n.rect.x + n.rect.w / 2;
  return { x: low ? n.rect.x : n.rect.x + n.rect.w - w, y: n.rect.y, w, h: n.rect.h };
}
