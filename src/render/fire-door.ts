/**
 * fire-door.ts — where chapter 1's fire door is DRAWN, as pure geometry.
 *
 * ## Why this is its own module
 *
 * Michele, with a screenshot of Biggy standing squarely in the fire doorway:
 * *"still a walkthrough object on the doorway, add an animation + sound when it
 * opens."* He was right, and the measurement is in `tests/fire-door.test.ts`:
 * once the code was accepted, `ch1-night.ts` removed the whole 14 x 130 px
 * corridor-crossing wall and went on publishing a `firedoor` prop with the same
 * rect, which `scene.ts` drew from its `PROPS` table as a 2.1 m slab. A door that
 * had just opened was still a solid across its own opening — except that it was
 * not solid, because the collider had gone. The player walked through the leaf.
 *
 * `tests/colliders.test.ts` could not see it. Its chapter sweep ticks four frames
 * from the chapter's START, where the fire door is shut and its wall is present,
 * so the only state it ever measured was the one that was right. See that file's
 * header for the same blind spot in its older form.
 *
 * The cure is the one CLAUDE.md already prescribes: **the fire door is drawn where
 * the sim says the fire door is.** Not from a table of kinds, not from the prop's
 * own rect once that rect has stopped meaning anything — from the chapter's live
 * wall list, every frame. A leaf that is drawn is a leaf the sim is standing
 * behind; a leaf the sim has no wall for is not drawn at all. Walk-through is then
 * not a bug that can come back, it is a shape the code cannot express.
 *
 * `scene.ts` draws what this module returns and `tests/fire-door.test.ts` measures
 * it, so the picture and the acceptance criterion cannot drift apart.
 *
 * ## The one licence this takes
 *
 * While the leaves are swinging — `Prop.progress` strictly between 0 and 1 — they
 * sweep through corridor the sim has already handed back to the player. That is
 * the same licence `drawJammed` takes with the falling leaf, and it is the one
 * thing a swinging door cannot avoid: a leaf is a moving solid, and the sim does
 * not carry moving solids. It costs about a second, in a corridor the robots are
 * standing WEST of while the leaves sweep west past them. The two ENDS of the
 * swing are the poses the sim has walls for, and those are the poses the test
 * checks.
 */

import type { Prop, Rect, Vec2, Wall } from '../sim/types';

/** The leaf's own thickness, sim px. 4 px is 32 cm: a fire door, not a screen. */
export const FIRE_LEAF_T = 4;
/** Leaf height, metres — the clear opening under the lintel. */
export const FIRE_LEAF_H = 2.1;

/** A leaf of the fire door, posed. Sim px, except `h` which is metres. */
export interface FireLeaf {
  /** The hinge, on the jamb it is hung from. */
  hinge: Vec2;
  /** Unit vector from the hinge along the leaf, at this `u`. */
  axis: Vec2;
  /** Leaf length along `axis`. */
  len: number;
  /** Axis-aligned footprint, thickness included. */
  rect: Rect;
}

/** The fixed screen the leaves hang in, plus the leaves. Footprints in sim px. */
export interface FireDoorDraw {
  /** The jambs either side of the opening — `firescreen` walls, full wall height. */
  screen: Rect[];
  /** The two leaves at this frame's swing. */
  leaves: FireLeaf[];
  /** 0 shut .. 1 swung clear, straight off `Prop.progress`. */
  u: number;
}

const box = (a: Vec2, b: Vec2, pad: number): Rect => ({
  x: Math.min(a.x, b.x) - pad,
  y: Math.min(a.y, b.y) - pad,
  w: Math.abs(b.x - a.x) + pad * 2,
  h: Math.abs(b.y - a.y) + pad * 2,
});

/**
 * One leaf, hinged at `hinge` and `dir` metres of it along +y or -y when shut.
 *
 * At `u = 0` the leaf lies across the opening; at `u = 1` it has swung a quarter
 * turn to the WEST — out of the opening and back along the corridor, which is the
 * way the robots are not going and the way the fixed camera can see it move. Both
 * leaves turn the same way, so the pair opens like a pair of fire doors and not
 * like a saloon.
 */
function leafAt(hinge: Vec2, dir: 1 | -1, len: number, u: number): FireLeaf {
  const th = (Math.max(0, Math.min(1, u)) * Math.PI) / 2;
  const axis: Vec2 = { x: -Math.sin(th), y: dir * Math.cos(th) };
  const tip: Vec2 = { x: hinge.x + axis.x * len, y: hinge.y + axis.y * len };
  return { hinge, axis, len, rect: box(hinge, tip, FIRE_LEAF_T / 2) };
}

/**
 * What the fire door looks like this frame, from the sim and nothing else.
 *
 * `p` is the chapter's `firedoor` prop: its rect is the CLEAR OPENING in the
 * screen — the part that swings — and `progress` is the sim's own swing clock.
 * `walls` is the chapter's live wall list, which carries the fixed screen either
 * side of that opening as `firescreen`.
 *
 * Three states, and each one draws only what the sim is standing behind:
 *
 *  - **shut** (`u = 0`): the leaves fill the opening, and the chapter has a
 *    `firedoor` wall right there.
 *  - **swinging** (`0 < u < 1`): the leaves sweep. See the module header.
 *  - **open** (`u = 1`): the leaves stand out in the corridor, where the chapter
 *    has pushed a `fireleaf` wall under each of them.
 *
 * A prop that says `open` but carries no `progress` is a sim that has not been
 * told about the swing yet. The honest answer is then no leaves at all: the door
 * has gone, which is what the chapter's own wall list says.
 */
export function fireDoorDraw(p: Prop, walls: readonly Wall[]): FireDoorDraw {
  const screen: Rect[] = [];
  for (const w of walls) if (w.kind === 'firescreen') screen.push({ x: w.x, y: w.y, w: w.w, h: w.h });

  const opening = p.h ?? 0;
  const open = p.state === 'open';
  const u = p.progress ?? (open ? -1 : 0);
  if (u < 0 || opening <= 0) return { screen, leaves: [], u: open ? 1 : 0 };

  const mid = (p.x ?? 0) + (p.w ?? 14) / 2;
  const len = opening / 2;
  return {
    screen,
    leaves: [
      leafAt({ x: mid, y: p.y }, 1, len, u),
      leafAt({ x: mid, y: p.y + opening }, -1, len, u),
    ],
    u,
  };
}

/**
 * Every footprint the fire door puts in the robot band this frame.
 *
 * `tests/fire-door.test.ts` asks the sim whether a robot can stand in any of
 * them. Mid-swing is excluded on purpose — see the module header — so the test
 * drives the door to a settled state before it measures.
 */
export const fireDoorSolids = (p: Prop, walls: readonly Wall[]): Rect[] => {
  const d = fireDoorDraw(p, walls);
  return [...d.screen, ...d.leaves.map((l) => l.rect)];
};
