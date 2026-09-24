/**
 * surface.ts — how high the floor is at a point, and who decides.
 *
 * ## The bug this closes, which has been logged for three rounds
 *
 * `docs/playtest-notes.md`: *"Robots do not stand on the ground floor's raised
 * lobby or its stairs. `groundRiseM(x)` exists **for this**, its own doc says the
 * renderer reads it, and nothing reads it — so a robot on the lobby plate stands
 * half a metre inside it and one on the main flight is swallowed. This is why
 * chapter 3's transition walks into a staircase."*
 *
 * And then Michele, mid-playtest, with a screenshot of Biggy standing in the
 * fallen leaf of the door he had just smashed: *"we are still walking through the
 * crashed door. The shape is fine, as long as robot walk on it, not through."*
 *
 * Those are one question — **how high is the walking surface here** — asked of
 * three different things: a raised floor plate, a ramp, and a piece of scenery a
 * robot put on the floor himself. They were about to be answered three times, in
 * three places, at least one of them inside `src/render`. A lift computed in
 * drawing code is game logic in drawing code, which CLAUDE.md forbids outright,
 * and it is also how the venue ended up with thirty-seven walk-through columns.
 *
 * So there is one answer and the sim owns it. A `Plate` is a piece of floor that
 * stands above the storey's datum; `GameSnapshot.plates` carries every plate the
 * current floor and the current chapter have; `riseAt` reads them. The renderer
 * asks and draws, and `tests/surface.test.ts` asks the same function.
 *
 * ## Why it is not part of `Wall`
 *
 * A wall is something a robot cannot enter. A plate is something it stands **on**,
 * which is the opposite: every cell of a plate has to stay walkable or the raised
 * lobby becomes a hole in the map. They are different questions about the same
 * rectangle and the sim already answers the first one; conflating them is what
 * would turn Michele's *"walk on it, not through"* back into *"blocked by it"*.
 */

import type { Plate, Vec2 } from './types';

/** Is `(x, y)` inside this plate's footprint, its own yaw taken into account? */
export function onPlate(p: Plate, x: number, y: number): boolean {
  let px = x;
  let py = y;
  if (p.rot !== undefined && p.rot !== 0) {
    // Un-rotate the point about the plate's centre and test the axis-aligned rect.
    // A skewed thing lying on the floor covers a skewed patch of it, and an
    // axis-aligned bounding box would hand the player four corners of thin air.
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const c = Math.cos(-p.rot);
    const s = Math.sin(-p.rot);
    const dx = x - cx;
    const dy = y - cy;
    px = cx + dx * c - dy * s;
    py = cy + dx * s + dy * c;
  }
  return px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h;
}

/** How high this plate's own surface is at `(x, y)`, metres. Ramps interpolate. */
export function plateRiseM(p: Plate, x: number, y: number): number {
  if (p.hi === undefined || p.hi === p.lo) return p.lo;
  const along = p.axis === 'y' ? (y - p.y) / p.h : (x - p.x) / p.w;
  const u = along < 0 ? 0 : along > 1 ? 1 : along;
  return p.lo + (p.hi - p.lo) * u;
}

/**
 * The height of the walking surface at `(x, y)`, metres above the storey datum.
 *
 * The HIGHEST plate covering the point wins, which is what stacking means: a door
 * leaf lying on the raised lobby would be stood on at the leaf's height, not at
 * the lobby's. Nothing covering the point is the datum itself, 0.
 */
export function riseAt(x: number, y: number, plates: readonly Plate[]): number {
  let out = 0;
  for (const p of plates) {
    if (!onPlate(p, x, y)) continue;
    const h = plateRiseM(p, x, y);
    if (h > out) out = h;
  }
  return out;
}

/** The same question about a point that already exists as a `Vec2`. */
export const riseAtPoint = (v: Vec2, plates: readonly Plate[]): number => riseAt(v.x, v.y, plates);
