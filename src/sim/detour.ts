/**
 * detour.ts — a person-sized way round, for somebody following a robot who fits
 * where they do not.
 *
 * ## Why it exists
 *
 * Michele, 29 Sep 2026, playing chapter 3, with a screenshot of the masked, caped
 * keynote speaker standing pressed against a white block and Voxxy out beyond it:
 * *"the keynote speaker is blocked on this block. I went under the table I think."*
 * He had. The speaker follows Voxxy's ROUTE — her positions dropped behind her as
 * breadcrumbs (`TRAIL_STEP` in `chapters/ch3-breakfast.ts`) — and a crumb is only
 * ever dropped where the speaker's own body fits, so none were dropped under the
 * tablecloth. The last crumb before the table and the first one after it were
 * therefore both good places to stand, on opposite sides of a table, and the
 * speaker walked the straight line between them into its face and stayed there.
 * Measured before the fix — Regex Racing's hiding place, Voxxy driven through the
 * middle of The Coffee Sponsor and on to Stephan's mark — the speaker stood at
 * x 873, the table's west face less their 7 px, for as long as the test waited.
 * The chapter cannot be finished without them.
 *
 * The breadcrumb was never going to solve that on its own: a route only a 38 cm
 * robot can walk is not a route, however faithfully it is recorded. So the crumbs
 * stay — being led still looks like walking where the leader walked — and this is
 * the one thing they cannot do: find a person's way round the stretch that was
 * hers alone.
 *
 * ## Why this is not the router that was turned down on 28 Sep
 *
 * The first breadcrumb fix considered *"A* for one NPC"* and rejected it as a
 * second router in the sim for a problem a breadcrumb solves. It was the right
 * call for the problem it had in front of it, which was a follower beelining
 * across the hall. This is a different problem — the gap in the crumbs — and the
 * breadcrumb is still the follower; this only runs while its next step is one a
 * person cannot take, which on an errand that stays out from under the furniture
 * is never.
 *
 * ## What it is
 *
 * Two questions, both asked with the follower's own body against every wall it is
 * given — `low` ones included, since a tablecloth is exactly what a person does
 * not fit under — and neither with any notion of a robot's `skipFor`:
 *
 *  - `clearWalk`: can a body of this radius walk the straight line from here to
 *    there without touching anything? Exact, not sampled: the capsule the body
 *    sweeps, against each rect.
 *  - `detour`: if not, which of the places it is trying to get to — in order —
 *    is the first one it CAN get to, and by which way? A flood over a 0.4 m
 *    lattice of the floor, pulled tight into the few straight legs a person
 *    would actually walk.
 *
 * Headless and pure: walls in, points out. Nothing here moves anybody.
 */

import type { Rect, Vec2, Wall } from './types';

/**
 * The floor's lattice, sim px — 0.4 m.
 *
 * Fine enough that the openings people use in the venue have cells a body can
 * stand on across them: a cell is floor when its centre has `r + WALK_SLACK` of
 * clearance, so an opening needs `2 x (7 + 0.5) + 5` = 20 px (1.6 m) to be sure of
 * a row of them, against 44 px for a catering doorway and 49 px for the strip in
 * front of Stephan's barrier. Coarse enough that the whole ground floor is about
 * fifty thousand cells — and a way round a table stops long before it has
 * flooded them all.
 */
export const DETOUR_CELL = 5;
/**
 * Half a pixel of give, both ways.
 *
 * A body resting against a wall is at exactly its radius from it, and a straight
 * line started from there is "touching" by a rounding error; so a line counts as
 * walkable at `r - WALK_SLACK`, which the push-out settles as a slide nobody can
 * see. The lattice asks the other way — floor at `r + WALK_SLACK` — so that a line
 * from one floor cell to the next is always walkable by that same measure.
 */
export const WALK_SLACK = 0.5;
/** A lattice step in its own integer cost: 5 px across, 7 on the diagonal (7.07). */
const STEP = 5;
const DIAG = 7;

/** Squared distance from a point to a rect; 0 inside it. */
function rectD2(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return dx * dx + dy * dy;
}

/** Squared distance from a point to the segment `a`–`b`. */
function segD2(a: Vec2, b: Vec2, x: number, y: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
  const ex = a.x + t * dx - x;
  const ey = a.y + t * dy - y;
  return ex * ex + ey * ey;
}

/** Does the segment `a`–`b` enter the rect at all (Liang–Barsky)? */
function crosses(a: Vec2, b: Vec2, r: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, a.x - r.x) && clip(dx, r.x + r.w - a.x) && clip(-dy, a.y - r.y) && clip(dy, r.y + r.h - a.y);
}

/**
 * Can a body of radius `r` walk the straight line from `a` to `b` and touch no
 * wall on the way?
 *
 * The same question `circleRect` answers for one position, asked of every
 * position along the line at once: the line is clear of a rect by at least `r`
 * unless it enters the rect, or one of its ends comes within `r` of it, or one of
 * the rect's corners comes within `r` of the line — for a segment and a box that
 * do not meet, the nearest pair of points always has a corner or an end in it.
 * With `r` 0 it is the bare line of sight: is there a wall BETWEEN the two.
 */
export function clearWalk(walls: readonly Wall[], a: Vec2, b: Vec2, r: number): boolean {
  const lx = Math.min(a.x, b.x) - r;
  const hx = Math.max(a.x, b.x) + r;
  const ly = Math.min(a.y, b.y) - r;
  const hy = Math.max(a.y, b.y) + r;
  const r2 = r * r;
  for (const w of walls) {
    if (w.x > hx || w.x + w.w < lx || w.y > hy || w.y + w.h < ly) continue;
    if (crosses(a, b, w)) return false;
    if (r2 === 0) continue;
    if (
      rectD2(w, a.x, a.y) < r2 ||
      rectD2(w, b.x, b.y) < r2 ||
      segD2(a, b, w.x, w.y) < r2 ||
      segD2(a, b, w.x + w.w, w.y) < r2 ||
      segD2(a, b, w.x, w.y + w.h) < r2 ||
      segD2(a, b, w.x + w.w, w.y + w.h) < r2
    ) {
      return false;
    }
  }
  return true;
}

/** A way round: where to walk, and which of the places asked for it gets to. */
export interface Detour {
  /**
   * Waypoints in walking order, each a straight line a body of the radius asked
   * for can walk from the one before (the first from where it stands). Empty when
   * it cannot take a single step.
   */
  path: Vec2[];
  /**
   * Index of the goal it gets to — the FIRST in the list that can be got to at
   * all — or -1 when none of them can. Then `path` ends where to wait for the last
   * of them: within `near` of the closest a body can get to it, at whichever such
   * spot is the shortest walk — beside the table she is under, not round the far
   * side of it for the sake of a hand's width.
   */
  goal: number;
}

/**
 * A body of radius `r` at `from` wants the first of `goals` it can get to: a
 * person-sized way there, round anything in the way.
 *
 * `goals` is in order of preference, and for a follower that order is the
 * leader's route and then the leader: the next crumb if it can be reached, the
 * one after if not — a crumb dropped somewhere with no way in for a person is a
 * crumb nobody will ever walk — and the robot herself last. A crumb is a PLACE and
 * is walked onto; the last goal is a PERSON, and getting within `near` of them is
 * getting to them, which is also the only honest way to ask it: a robot hugging a
 * column is standing where no person fits, and that is not "somewhere I cannot
 * follow you".
 *
 * A flood from where the body stands, over every lattice cell a body fits on
 * (Dial's buckets, 5 across and 7 diagonally, and never squeezing diagonally
 * between two corners), which stops as soon as it lands on the first goal — the
 * usual case, about a millisecond round a table; then, only if it never did, the
 * cheapest landing on each later goal in turn; then the chain back, pulled tight —
 * from each point, straight to the furthest one along it that a straight walk
 * reaches.
 */
export function detour(walls: readonly Wall[], from: Vec2, goals: readonly Vec2[], r: number, near = 0): Detour {
  // The lattice covers the walls' own extent, which on any floor is the building.
  let x0 = Math.min(from.x, ...goals.map((g) => g.x));
  let y0 = Math.min(from.y, ...goals.map((g) => g.y));
  let x1 = Math.max(from.x, ...goals.map((g) => g.x));
  let y1 = Math.max(from.y, ...goals.map((g) => g.y));
  for (const w of walls) {
    x0 = Math.min(x0, w.x);
    y0 = Math.min(y0, w.y);
    x1 = Math.max(x1, w.x + w.w);
    y1 = Math.max(y1, w.y + w.h);
  }
  const C = DETOUR_CELL;
  const nx = Math.floor((x1 - x0) / C) + 1;
  const ny = Math.floor((y1 - y0) / C) + 1;
  const n = nx * ny;
  const px = (i: number): number => x0 + (i % nx) * C;
  const py = (i: number): number => y0 + Math.floor(i / nx) * C;
  const pt = (i: number): Vec2 => ({ x: px(i), y: py(i) });
  const gap = (i: number, p: Vec2): number => Math.hypot(px(i) - p.x, py(i) - p.y);

  // Floor: every cell whose centre a body stands on, with the slack to spare.
  const floor = new Uint8Array(n).fill(1);
  const R = r + WALK_SLACK;
  const R2 = R * R;
  for (const w of walls) {
    const ax = Math.max(0, Math.ceil((w.x - R - x0) / C));
    const bx = Math.min(nx - 1, Math.floor((w.x + w.w + R - x0) / C));
    const ay = Math.max(0, Math.ceil((w.y - R - y0) / C));
    const by = Math.min(ny - 1, Math.floor((w.y + w.h + R - y0) / C));
    for (let iy = ay; iy <= by; iy++) {
      for (let ix = ax; ix <= bx; ix++) if (rectD2(w, x0 + ix * C, y0 + iy * C) < R2) floor[iy * nx + ix] = 0;
    }
  }
  /** The floor cells within `k` cells of a point. */
  const around = (p: Vec2, k: number): number[] => {
    const cx = Math.round((p.x - x0) / C);
    const cy = Math.round((p.y - y0) / C);
    const out: number[] = [];
    for (let iy = Math.max(0, cy - k); iy <= Math.min(ny - 1, cy + k); iy++) {
      for (let ix = Math.max(0, cx - k); ix <= Math.min(nx - 1, cx + k); ix++) if (floor[iy * nx + ix]) out.push(iy * nx + ix);
    }
    return out;
  };
  const walkable = (a: Vec2, b: Vec2): boolean => clearWalk(walls, a, b, r - WALK_SLACK);
  const last = goals.length - 1;
  /** The floor cells a body has got to goal `k` from, if it stands on one. */
  const landing = (k: number): number[] =>
    k === last && near > 0
      ? around(goals[k], Math.ceil(near / C)).filter((i) => gap(i, goals[k]) <= near)
      : around(goals[k], 2).filter((i) => walkable(pt(i), goals[k]));

  // The flood, which stops the moment it stands on a landing for the first goal.
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const buckets: number[][] = [];
  const reach = (i: number, c: number, via: number): void => {
    if (c >= cost[i]) return;
    cost[i] = c;
    prev[i] = via;
    (buckets[c] ??= []).push(i);
  };
  const first = new Uint8Array(n);
  if (goals.length > 0) for (const i of landing(0)) first[i] = 1;
  let goal = -1;
  let end = -1;
  for (const i of around(from, 2)) if (walkable(from, pt(i))) reach(i, Math.round(gap(i, from)), -1);
  flood: for (let c = 0; c < buckets.length; c++) {
    const list = buckets[c];
    if (!list) continue;
    for (const i of list) {
      if (cost[i] !== c) continue;
      if (first[i]) {
        goal = 0;
        end = i;
        break flood;
      }
      const ix = i % nx;
      const iy = (i - ix) / nx;
      // The four across, then the four diagonals — each only past two open sides.
      const left = ix > 0 && floor[i - 1] === 1;
      const right = ix < nx - 1 && floor[i + 1] === 1;
      const up = iy > 0 && floor[i - nx] === 1;
      const down = iy < ny - 1 && floor[i + nx] === 1;
      if (left) reach(i - 1, c + STEP, i);
      if (right) reach(i + 1, c + STEP, i);
      if (up) reach(i - nx, c + STEP, i);
      if (down) reach(i + nx, c + STEP, i);
      if (left && up && floor[i - nx - 1]) reach(i - nx - 1, c + DIAG, i);
      if (right && up && floor[i - nx + 1]) reach(i - nx + 1, c + DIAG, i);
      if (left && down && floor[i + nx - 1]) reach(i + nx - 1, c + DIAG, i);
      if (right && down && floor[i + nx + 1]) reach(i + nx + 1, c + DIAG, i);
    }
  }

  // It never landed on the first: the whole floor it can reach is flooded, so
  // the cheapest landing on each later goal, in turn.
  for (let k = 1; k < goals.length && goal < 0; k++) {
    let best = Infinity;
    for (const i of landing(k)) {
      if (cost[i] < best) {
        best = cost[i];
        end = i;
        goal = k;
      }
    }
  }
  if (goal < 0 && goals.length > 0) {
    // None of them. Where to wait for the last: as close as the floor gets to it,
    // give or take `near`, and of those the shortest walk from here.
    const g = goals[last];
    const d2 = (i: number): number => (px(i) - g.x) ** 2 + (py(i) - g.y) ** 2;
    let closest = Infinity;
    for (let i = 0; i < n; i++) if (cost[i] < Infinity) closest = Math.min(closest, d2(i));
    const within = (Math.sqrt(closest) + near) ** 2;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (cost[i] < best && d2(i) <= within) {
        best = cost[i];
        end = i;
      }
    }
  }
  if (end < 0) return { path: [], goal: -1 };

  const chain: Vec2[] = [];
  for (let i = end; i >= 0; i = prev[i]) chain.push(pt(i));
  chain.reverse();
  // A place is walked onto; a person is stopped short of.
  if (goal >= 0 && !(goal === last && near > 0)) chain.push({ x: goals[goal].x, y: goals[goal].y });
  const path: Vec2[] = [];
  let at = from;
  for (let k = 0; k < chain.length; ) {
    let j = k;
    while (j + 1 < chain.length && walkable(at, chain[j + 1])) j++;
    path.push(chain[j]);
    at = chain[j];
    k = j + 1;
  }
  return { path, goal };
}
