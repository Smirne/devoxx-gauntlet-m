/**
 * THE BEER DELIVERY — `OutOfMemoryError`, and the numbers behind the joke.
 *
 * `docs/gameplay-additions.md` §3, approved by Michele on 23 Sep 2026 in one word:
 * *"OutOfMemory, yes build it."* Biggy picks beer crates up and stacks them; each
 * crate adds to his mass and eats into his acceleration; the crate past the limit
 * throws a `java.lang.OutOfMemoryError`, he drops the lot, and the crates become
 * physical bodies he then has to shove out of his own way.
 *
 * ## Why this file exists at all
 *
 * The beat CHANGES BIGGY'S MASS AND ACCELERATION AT RUN TIME, which is exactly the
 * kind of thing the frozen table exists to stop. So the distinction is made here,
 * in one place, rather than left implicit in the chapter:
 *
 *   - `DEFS` in `constants.ts` is the robots' frozen IDENTITY. Nothing here writes
 *     to it; it is deep-frozen and `tests/frozen-constants.test.ts` pins every
 *     number in it, unchanged.
 *   - What a robot is carrying is not its identity. `mkBot` spreads `DEFS` into a
 *     fresh mutable `Bot`, and `loadBiggy` writes a MODIFIER on that copy, computed
 *     from `DEFS` and the crate count every time — never accumulated. At zero
 *     crates it therefore restores the frozen numbers *exactly*, not approximately,
 *     which is asserted in `tests/chapters.test.ts`.
 *
 * `game.ts` restores every robot's frozen identity at the head of `startChapter`,
 * so a load can never outlive the chapter that granted it.
 *
 * Units: sim pixels and seconds, like the rest of `src/sim`. Every px/s quantity
 * carries `SPEED_SCALE` for the same reason everything else does (the 2026-09-23
 * rescale, `constants.ts`).
 */

import { circleRect } from './bot';
import { DEFS, SPEED_SCALE } from './constants';
import type { Bot, Wall } from './types';

/**
 * A crate's collision radius, sim px. 4 px = 0.32 m.
 *
 * A Belgian crate of 24 33 cl bottles is about 0.42 x 0.32 m on the floor, whose
 * half-diagonal is 0.26 m. Rounded up to 0.32 so a crate lying in the aisle is
 * something Biggy (0.72 m) has to go round or shove, rather than something that
 * vanishes under his belly — the scatter after a heap error is the payoff, and it
 * only works if the crates are in the way.
 */
export const CRATE_R = 4;

/**
 * What one crate adds to Biggy's mass, in the same ratio units as `DEFS.*.mass`.
 *
 * Life says less: a full crate is about 20 kg against Biggy's ~150, which would be
 * 0.9 of his 7. The number is deliberately heavier than life because mass is only
 * visible where `botsCollide` splits a contact, and at 0.9 the full safe stack
 * changes his share of a shove by a fifth — which a player reads as noise. At 1.5,
 * four crates take him from 7 to 13, so a Voxxy shove moves him a little over half
 * as far as it did, and the trade the beat is built on is something you feel.
 *
 * The same number is the crate body's own mass on the floor, because it is the
 * same crate.
 */
export const CRATE_MASS = 1.5;

/**
 * Biggy's acceleration is multiplied by this ONCE PER CRATE, compounding.
 *
 * `accel` is an exponential-approach rate in s^-1, so this is the handling half of
 * the trade: at the safe maximum of four crates 0.6 becomes 0.6 x 0.82^4 = 0.271,
 * and a 200 px (16 m) haul from a standing start goes from 5.0 s to 6.4 s — a
 * quarter longer, which is felt, against a stack that halves the number of trips.
 * Top speed and drag are untouched: a loaded Biggy still gets there, he just takes
 * his time getting going, which is what "heavier" looks like in this model.
 *
 * Compounding rather than subtracting so that no crate count can drive the rate to
 * zero or below. The stack limit stops the stack; it should not have to stop the
 * arithmetic as well.
 */
export const CRATE_ACCEL_FACTOR = 0.82;

/**
 * The crate whose pickup throws. Four is the heap; the fifth is the error.
 *
 * With `CRATE_DELIVERY = 6` on the pallet, four-then-two is the honest line and
 * five-then-one is the greedy one that does not exist — which is the design's own
 * summary: *"the optimal line is one crate under the limit. Greed is punished by
 * physics rather than by a rule."*
 */
export const CRATE_STACK_LIMIT = 5;

/** Crates in the delivery. Six, so the job is two trips and greed is tempting. */
export const CRATE_DELIVERY = 6;

/**
 * How close Biggy's centre has to be to a crate's to get his arms round it, px.
 *
 * Twice the 13 px at which the two bodies are actually touching (9 + 4), so walking
 * up to a crate is enough and nobody has to nudge one into exactly the right spot
 * before `E` will take it.
 */
export const CRATE_REACH = 26;

/** Biggy shoving a loose crate, px/s^2 — the shuffleboard duck's number, ch2. */
export const CRATE_SHOVE_BIGGY = 900 * SPEED_SCALE;
/** Voxxy or Droid shoving one. They cannot lift a crate; they can still move it. */
export const CRATE_SHOVE_OTHER = 350 * SPEED_SCALE;
/** A crate's top speed once shoved, px/s. */
export const CRATE_MAX_SPEED = 200 * SPEED_SCALE;
/**
 * A crate's drag, s^-1. A full crate on a hall floor is not a puck: at 2.6 it
 * coasts its own speed divided by 2.6 — about a crate's length from a hard shove —
 * and stops.
 */
export const CRATE_DRAG = 2.6;
/**
 * How fast the crates leave Biggy when the heap error fires, px/s.
 *
 * 30 px/s against `CRATE_DRAG` is roughly 12 px of travel, so the load lands in a
 * ring just outside his own radius: close enough that the scatter is plainly HIS
 * mess and cheap to collect, far enough that he has to shove his way out of it.
 * The comedy is the drop, not the walk back.
 */
export const CRATE_SCATTER_SPEED = 120 * SPEED_SCALE;

/** Biggy's mass carrying `n` crates. `n = 0` is exactly the frozen number. */
export const crateLoadMass = (n: number): number => DEFS.biggy.mass + n * CRATE_MASS;

/** Biggy's acceleration carrying `n` crates. `n = 0` is exactly the frozen number. */
export const crateLoadAccel = (n: number): number => DEFS.biggy.accel * CRATE_ACCEL_FACTOR ** n;

/**
 * Put `n` crates on Biggy's back.
 *
 * Always recomputed from `DEFS`, never accumulated, so the numbers cannot drift
 * over a long chapter and `loadBiggy(bg, 0)` gives back the frozen identity to the
 * last bit. This is the only function in the game that writes `mass` or `accel`.
 */
export function loadBiggy(bg: Bot, n: number): void {
  bg.mass = crateLoadMass(n);
  bg.accel = crateLoadAccel(n);
}

/**
 * WHAT IS ACTUALLY IN THE CRATES.
 *
 * Michele, approving the beat: *"Of course they'll need to look like beer crates,
 * with funny names."* Six crates, six breweries, in the same register as the
 * sponsor list next door in `geometry.ts` — "NullPointer Insurance", "Async
 * Airlines", "Monolith GmbH" — which is to say: a real-sounding Belgian brewery
 * with a Java joke wearing its coat.
 *
 * Every one of them is INVENTED. `Dubbel`, `Tripel`, `Lambiek`, `Gueuze`, `Saison`
 * and `Abdij` are Belgian beer *styles* and ordinary Dutch words, not anybody's
 * trademark, which is the whole reason the list is built out of them: the rule for
 * this project is "nothing that needs permission" (CLAUDE.md), and a real brewery
 * on a crate in a competition entry would need it.
 *
 * The order is the order they sit on the pallet, so `crates[3]` is always the
 * Gueuze Collector and a test can say so.
 */
export const CRATE_BREWS: readonly string[] = [
  'Brouwerij Dubbel-Checked',
  'Lambiek Lambda',
  'Tripel Equals',
  'Gueuze Collector',
  'Saison Stacktrace',
  'Abdij van de Heap',
];

/** The brewery on crate `i`, wrapping if a future delivery is bigger than the list. */
export const crateBrew = (i: number): string => CRATE_BREWS[i % CRATE_BREWS.length];

/* ------------------------------------------------- a crate nobody can reach */

/**
 * THE ONE WAY CHAPTER 3 COULD DEAD-END, and it is not hypothetical.
 *
 * `beerDone` needs all six crates on the bar, and a crate is a 0.32 m body in a
 * hall built for 0.72 m robots — so there are places a crate fits and Biggy does
 * not. A sweep of every cell of the ground floor found exactly one: the **15 px
 * slot between the sandwich counter and the coffee counter** (`GF.food`, x
 * 270..285 at y 100..130), open at its south end and backed by the hall's north
 * wall. A crate shoved up there sits in a 1.2 m gap that Biggy is 1.44 m wide
 * for, and the chapter can never be finished again.
 *
 * Five cells out of 61,218 is a low risk and an unrecoverable one, which is the
 * combination worth spending code on — and the guard is deliberately GENERAL
 * rather than a plug in that one slot. The slot is a consequence of two counters
 * standing a metre apart; any future prop can make another, and a chapter that
 * can eat a crate is a chapter that can eat a run.
 *
 * It lives here rather than inside the chapter because it is a fact about crates
 * and robot sizes, and because a closure in `setup()` is a thing no test can ask
 * a question of. `tests/crate-rescue.test.ts` names the real slot.
 */

/** Is this circle clear of every wall in `walls`? */
const clearOfWalls = (x: number, y: number, r: number, walls: readonly Wall[]): boolean =>
  !walls.some((w) => !w.hidden && circleRect({ x, y, r }, w) !== null);

/**
 * Could a robot of radius `botR` stand somewhere it could get its arms round a
 * crate at `(x, y)`?
 *
 * The same question `crateInReach` asks from the robot's side, asked from the
 * crate's: somewhere within `CRATE_REACH` of it that a body that size fits in.
 * Sixteen directions at 4 px steps is coarse, and coarse is the right way to be
 * wrong here — it can call a tight-but-usable spot unreachable and move the crate
 * 20 px into the open, which nobody will notice. The other error is a dead run.
 */
export function crateReachable(x: number, y: number, botR: number, walls: readonly Wall[]): boolean {
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    const cx = Math.cos(th);
    const cy = Math.sin(th);
    for (let d = botR + CRATE_R; d <= CRATE_REACH; d += 4) {
      if (clearOfWalls(x + cx * d, y + cy * d, botR, walls)) return true;
    }
  }
  return false;
}

/**
 * Where a stranded crate should be walked back out to, or null if nowhere is.
 *
 * Outward in rings until a spot turns up that the crate itself fits in AND the
 * robot can reach — so it comes back out the way it went in, by the shortest
 * route, rather than teleporting across the hall. Nothing is created and nothing
 * is destroyed: it is the same crate, a metre further out, which is the smallest
 * honest thing that can happen to it.
 */
export function crateRescueSpot(
  x: number,
  y: number,
  botR: number,
  walls: readonly Wall[],
): { x: number; y: number } | null {
  for (let d = 10; d <= 120; d += 5) {
    for (let a = 0; a < 24; a++) {
      const th = (a / 24) * Math.PI * 2;
      const px = x + Math.cos(th) * d;
      const py = y + Math.sin(th) * d;
      if (clearOfWalls(px, py, CRATE_R, walls) && crateReachable(px, py, botR, walls)) {
        return { x: px, y: py };
      }
    }
  }
  return null;
}
