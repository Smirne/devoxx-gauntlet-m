/**
 * THE #DEVOXX LETTERS — chapter 4's stage sign, and Droid's job in Room 8.
 *
 * Michele, 28 Sep 2026, with a photograph taken from behind the letters on the
 * keynote stage: *"There are always those 3d letters in Devoxx, used for the
 * keynote and the closing. They could be hidden around and be brought on stage by
 * the robot? Maybe we can change Voxxy or Droid's task?"* — and then, deciding:
 * *"Droid swap. Droid is already slow, so don't scatter the letters around."*
 *
 * They are the real thing. `media/venue-photos/54836008506_68c9fc5562_k.jpg`, the
 * photo this project has always captioned "the stage ← chapter 4", has `#DEVOXX`
 * standing on Room 8's stage: white, with the last X in Devoxx orange. The banner
 * Droid used to hang between two hooks ("HAPPY DEVOXX") was invented. The letters
 * replace it one for one, so every robot still has exactly one job in the room.
 *
 * ## The job
 *
 * The crew got as far as `#DEV`. The O and both X's are leaning against the wall in
 * the wing beside the stage — ONE stash, a few metres from their gaps, because
 * Droid is the slow one and a scavenger hunt at 3 m/s is a chapter nobody finishes.
 * Droid lifts one with `E`, carries it, and sets it into its own gap with `E`. Each
 * letter has its own gap, so the sign spells itself as it goes up and there is no
 * wrong order to get stuck in.
 *
 * Why Droid, in the other two's own words: the letters are as tall as Voxxy, who
 * could carry one or see where she was going but not both; and Biggy's hands close
 * round a pot handle, not round an E. Droid has the height to see over one and the
 * long forearms to hold it clear of the carpet.
 *
 * ## The physics
 *
 * A letter has mass, and carrying one is a LOAD on Droid in exactly the way the
 * beer crates are a load on Biggy (`src/sim/crates.ts`): `DEFS` is never written,
 * `loadDroid` writes a modifier on the mutable `Bot` copy, recomputed from the
 * frozen numbers every time, and `game.ts`'s `restoreIdentity` takes it off at the
 * door of every chapter. The acceleration falls by the MASS RATIO — the same motor
 * force pushing more mass — which is also exactly what the crate factor already
 * was (7 / (7 + 1.5) = 0.82). Top speed and drag are untouched.
 *
 * Units: sim pixels and seconds, like the rest of `src/sim`.
 */

import { DEFS } from './constants';
import { PX_PER_M } from './units';
import type { Bot, Rect, Vec2 } from './types';

/** The sign, one glyph per slot, left to right as the room reads it. */
export const SIGN = '#DEVOXX';

/** The slot whose letter is Devoxx orange: the last X, as in the photograph. */
export const SIGN_ORANGE = 6;

/** Slots `0 .. SIGN_STANDING - 1` are already standing when the chapter opens: `#DEV`. */
export const SIGN_STANDING = 4;

/** Letters Droid has to bring: the O, the X and the orange X. */
export const SIGN_MISSING = SIGN.length - SIGN_STANDING;

/** A letter's height, metres. As tall as Voxxy (1.15 m), which is her whole objection. */
export const LETTER_H_M = 1.1;

/** A letter's face width, sim px (0.84 m) — bold display letters, a little taller than wide. */
export const LETTER_W = 0.84 * PX_PER_M;

/** A letter's depth, sim px (0.28 m): a thick routed block, which is what lets it stand on its own. */
export const LETTER_D = 0.28 * PX_PER_M;

/** Slot pitch along the sign, sim px: a letter plus a 12 cm gap. */
export const LETTER_PITCH = LETTER_W + 0.12 * PX_PER_M;

/**
 * One letter's mass, in the ratio units of `DEFS.*.mass` (Biggy's 7 is about 150 kg,
 * so one unit is about 21 kg).
 *
 * 0.7 is about 15 kg: a 1.1 m letter routed out of foam and skinned hard enough to
 * survive a conference, which is what these are. Heavy enough that Droid's 3 goes
 * to 3.7 and his pick-up falls by a fifth, light enough that he can carry one.
 */
export const LETTER_MASS = 0.7;

/**
 * How close Droid's centre must be to a letter's to take hold of it, sim px.
 *
 * About three times the gap at which he is touching one leaning on the wall (his
 * 6.25 px radius plus half its depth), so walking up to the stash is enough and
 * nobody has to nose into exactly the right spot before `E` works — the same
 * generosity as `CRATE_REACH`.
 */
export const LETTER_REACH = 22;

/**
 * How close Droid's centre must be to a gap in the sign to set a letter into it.
 *
 * Wide enough to reach a gap from beside the next letter along — he can stand in
 * front of the V and still put the O in — and narrow enough that "anywhere on the
 * stage" does not count, because that would be a letter jumping two metres.
 */
export const SLOT_REACH = 24;

/** Droid's mass while carrying one letter. Not carrying is exactly the frozen number. */
export const letterLoadMass = (carrying: boolean): number => DEFS.droid.mass + (carrying ? LETTER_MASS : 0);

/**
 * Droid's acceleration while carrying one letter: the frozen rate scaled by the
 * mass ratio, so the same push on more mass. Not carrying is exactly the frozen number.
 */
export const letterLoadAccel = (carrying: boolean): number =>
  carrying ? (DEFS.droid.accel * DEFS.droid.mass) / letterLoadMass(true) : DEFS.droid.accel;

/**
 * Put a letter in Droid's hands, or take it out of them.
 *
 * Recomputed from `DEFS` every time and never accumulated, so `loadDroid(d, false)`
 * gives back the frozen identity to the last bit. With `loadBiggy` in `crates.ts`,
 * one of the only two functions in the game that write `mass` or `accel`.
 */
export function loadDroid(d: Bot, carrying: boolean): void {
  d.mass = letterLoadMass(carrying);
  d.accel = letterLoadAccel(carrying);
}

/**
 * How a letter is named out loud. Two X's need telling apart, and the orange one
 * is the one everybody remembers.
 */
export const letterName = (slot: number): string => (slot === SIGN_ORANGE ? 'orange X' : SIGN[slot]);

/**
 * The sign as it reads right now: its glyph where a letter is standing in its gap,
 * `_` where a gap is still empty — `#DEV___`, `#DEV_X_`, `#DEVOXX`.
 */
export const signText = (up: (slot: number) => boolean): string =>
  [...SIGN].map((ch, i) => (up(i) ? ch : '_')).join('');

/* ------------------------------------------------------------ the carry ---- */

/**
 * How far in front of Droid's centre a letter rides in his hands, sim px (0.89 m).
 *
 * Measured off the rig, the way the robots' radii are (`docs/scale-and-units.md`):
 * in the two-handed carry (`applyCarry`, `src/render/robots/gait.ts`) the midpoint
 * of his hands stands 0.889 m out along his heading. That is 0.39 m past the
 * 0.50 m of him the sim collides with, which is the whole of the bug below.
 */
export const LETTER_CARRY_REACH = 0.89 * PX_PER_M;

/** Daylight kept between a carried letter and the wall it has been stopped by, sim px (2.5 cm). */
const CARRY_CLEAR = 0.3;

/**
 * WHERE THE LETTER IN DROID'S HANDS IS — and it is never inside a wall.
 *
 * Michele, 29 Sep 2026: *"letters (and droid's arm) through the wall"*. The sim
 * published a carried letter at Droid's CENTRE, where it can never be in a wall,
 * and left the rest to the renderer, which hung it off his hands 0.89 m out — past
 * everything the sim knows about. So wherever he stood at a wall, the letter and
 * his arms went into it. In the wing that was every single pick-up: he is stopped
 * 0.86 m short of the wall by the very letter he is lifting, so on the frame it
 * came off the wall his hands were in the plaster and its face 17 cm into it —
 * more once he walked, which swings the hands out to 1.03 m.
 *
 * So the sim says where the letter is, as it says where everything else is: out
 * along his heading by `LETTER_CARRY_REACH`, swept out from his centre and stopped
 * `CARRY_CLEAR` short of the first wall its footprint would touch. Nose to a wall,
 * he hugs it to his chest instead of pushing it through the plaster; the renderer
 * puts it here and his hands on it (`holdLetter`, `src/render3d/reach3d.ts`).
 * `tests/letters.test.ts` holds it out of every wall for the whole chapter.
 *
 * At his centre the footprint is inside him (5.5 px against his 6.25), so pulled
 * all the way in it is still clear of any wall he is clear of.
 */
export function carryPoint(d: { x: number; y: number; face: number }, walls: readonly Rect[]): Vec2 {
  const ux = Math.cos(d.face);
  const uy = Math.sin(d.face);
  let hit = Infinity;
  for (const w of walls) hit = Math.min(hit, sweepTo(d.x, d.y, ux, uy, w, LETTER_CARRY_REACH));
  const s = hit >= LETTER_CARRY_REACH ? LETTER_CARRY_REACH : Math.max(0, hit - CARRY_CLEAR);
  return { x: d.x + ux * s, y: d.y + uy * s };
}

/**
 * How far out along `u` from `c` a letter's footprint — `LETTER_D` deep along `u`,
 * `LETTER_W` wide across it — can go before it touches `w`: the first `s` in
 * `0..max` where they meet, or `max` if they never do.
 *
 * A moving box against a still one. On each axis that could separate them (the
 * wall's two, the letter's two) they overlap over an interval of `s`, and they meet
 * only where all four intervals do; the first touch is where that begins. Already
 * overlapping at his centre, it is 0.
 */
function sweepTo(cx: number, cy: number, ux: number, uy: number, w: Rect, max: number): number {
  const nx = -uy;
  const ny = ux;
  let lo = -Infinity;
  let hi = Infinity;
  for (const [ax, ay] of [
    [1, 0],
    [0, 1],
    [ux, uy],
    [nx, ny],
  ] as const) {
    const wx0 = Math.min(w.x * ax, (w.x + w.w) * ax);
    const wx1 = Math.max(w.x * ax, (w.x + w.w) * ax);
    const wy0 = Math.min(w.y * ay, (w.y + w.h) * ay);
    const wy1 = Math.max(w.y * ay, (w.y + w.h) * ay);
    const half = (LETTER_D / 2) * Math.abs(ux * ax + uy * ay) + (LETTER_W / 2) * Math.abs(nx * ax + ny * ay);
    const c0 = cx * ax + cy * ay;
    const du = ux * ax + uy * ay;
    if (Math.abs(du) < 1e-9) {
      // Moving along this axis's perpendicular: apart on it for every s, or never.
      if (c0 + half <= wx0 + wy0 || c0 - half >= wx1 + wy1) return max;
      continue;
    }
    let s0 = (wx0 + wy0 - half - c0) / du;
    let s1 = (wx1 + wy1 + half - c0) / du;
    if (s0 > s1) [s0, s1] = [s1, s0];
    lo = Math.max(lo, s0);
    hi = Math.min(hi, s1);
    if (lo >= hi) return max;
  }
  if (hi <= 0 || lo >= max) return max;
  return Math.max(0, lo);
}
