/**
 * doors.ts — the three doors in the game that used to POP, drawn as pure geometry.
 *
 * ## Why this exists
 *
 * Michele, twice: *"add an animation + sound when it opens"*, and then, still
 * mid-playtest, **"And an animation for the door opening."** Chapter 1's fire door
 * (`fire-door.ts`) and chapter 2's roller shutter (`roller-door.ts`) were the two
 * he had already caught. An audit of every `removeWall` in `src/sim/chapters` and
 * every door-ish kind in `scene.ts`'s `PROPS` found three more that changed from
 * shut to open between two frames:
 *
 *  - **cinema B's magnetic lock** (`ch1-night.ts`) — the payoff of the whole mount
 *    beat. `key` removed the wall and `props()` stopped publishing the prop in the
 *    same frame, so the door did not open, it ceased to exist, in silence.
 *  - **the router cabinet** (`ch2-expo.ts`) — `drawCabinet` cut straight to a leaf
 *    standing at 58°, and that leaf had no collider under it at all.
 *  - **the registration gate at the foot of the main staircase** (`ch3-breakfast.ts`)
 *    — flagged during the roller round and explicitly left: `done()` calls
 *    `removeWall(gate)` and goes on publishing a `gate` prop, which `PROPS.gate`
 *    drew as a 1.1 m box across the stair foot. Un-animated AND walk-through, and
 *    `buildVenue()` draws a second, static gate in the same doorway on top of it.
 *
 * ## The shape, which is settled
 *
 * The same one `fire-door.ts` and `roller-door.ts` use, and this file does not get
 * to invent a third:
 *
 *  1. the SIM owns the clock — a duration constant, a 0..1 value ticked in the
 *     chapter's `update`, published as the prop's `progress`;
 *  2. the leaf is posed from the chapter's **live wall list** plus that clock,
 *     never from a static table. A leaf is only ever drawn where the sim has
 *     something solid, and a leaf the sim has no wall for is not drawn there at
 *     all. That is what stops walk-through doors recurring;
 *  3. an open door is a collider **where it ends up**, or it is out of the doorway
 *     entirely and draws nothing there. It is never a slab across the hole it has
 *     just made.
 *
 * Callers with no wall list — `tests/prop-geometry.ts` asking what box the renderer
 * draws for a kind — pass `[]` and get the pose the prop's own `state` and
 * `progress` describe. Same seam the other two leave open, safe for the same
 * reason: the poses are checked against the real wall list by whoever has one.
 *
 * ## The one licence, also the same one
 *
 * Between the two ends — `0 < u < 1` — a swinging leaf sweeps through floor the sim
 * has already handed back. A leaf is a moving solid and the sim does not carry
 * moving solids. The two ENDS are the poses the sim agrees with, and those are the
 * poses the tests check.
 */

import { CY0, CY1 } from '../sim/geometry';
import type { Prop, Rect, Vec2, Wall } from '../sim/types';

/* ------------------------------------------------------------- the shared leaf */

/** A leaf of a door, posed. Sim px. */
export interface Leaf {
  /** The hinge it turns on. */
  hinge: Vec2;
  /** Unit vector from the hinge along the leaf at this `u`. */
  axis: Vec2;
  /** Leaf length along `axis`. */
  len: number;
  /** Axis-aligned footprint, the leaf's own thickness included. */
  rect: Rect;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const box = (a: Vec2, b: Vec2, pad: number): Rect => ({
  x: Math.min(a.x, b.x) - pad,
  y: Math.min(a.y, b.y) - pad,
  w: Math.abs(b.x - a.x) + pad * 2,
  h: Math.abs(b.y - a.y) + pad * 2,
});

/**
 * One leaf, hinged at `hinge`, `len` long, turned `u` of the way from `shut` to
 * `open`.
 *
 * Both directions are unit vectors the caller chooses, so this says nothing about
 * which way any particular door goes — that belongs with the door, where the
 * reason lives. It is `leafAt` in `src/render/fire-door.ts` with the two ends
 * handed in rather than assumed, and the fire door keeps its own copy because its
 * pair turn together and its geometry is already measured and tested.
 */
export function swingLeaf(hinge: Vec2, shut: Vec2, open: Vec2, len: number, thick: number, u: number): Leaf {
  const th = clamp01(u) * Math.acos(Math.max(-1, Math.min(1, shut.x * open.x + shut.y * open.y)));
  // Rotate `shut` toward `open` by `th`, the short way round. The sign falls out of
  // the 2D cross product, so a door hung the other way needs no second branch.
  const sign = shut.x * open.y - shut.y * open.x >= 0 ? 1 : -1;
  const c = Math.cos(th);
  const s = Math.sin(th) * sign;
  const axis: Vec2 = { x: shut.x * c - shut.y * s, y: shut.x * s + shut.y * c };
  const tip: Vec2 = { x: hinge.x + axis.x * len, y: hinge.y + axis.y * len };
  return { hinge, axis, len, rect: box(hinge, tip, thick / 2) };
}

const overlaps = (w: Wall, r: Rect): boolean =>
  w.x < r.x + r.w && w.x + w.w > r.x && w.y < r.y + r.h && w.y + w.h > r.y;

/**
 * How far open this prop's door is, with the wall list winning every argument.
 *
 * A wall of one of `sealedKinds` across the prop's own rect means the door is SHUT,
 * whatever a stale `progress` says. No such wall and no clock either means it is
 * fully OPEN — the sim has given the doorway back, and a leaf drawn across it would
 * be the bug this file exists to make unsayable.
 */
function openness(p: Prop, rect: Rect, walls: readonly Wall[], sealedKinds: readonly string[]): { u: number; sealed: boolean } {
  const sealed = walls.some((w) => w.kind !== undefined && sealedKinds.includes(w.kind) && overlaps(w, rect));
  let u = clamp01(p.progress ?? (p.state === 'open' ? 1 : 0));
  if (sealed) u = 0;
  else if (walls.length > 0 && u === 0 && p.state === 'open') u = 1;
  return { u, sealed };
}

/* ---------------------------------------------------- chapter 1 · cinema doors */

/** The leaf's thickness, sim px. Matches `LOCK_LEAF_T` in `ch1-night.ts`. */
export const LOCK_LEAF_T = 4;
/** Clear height of an auditorium door, metres — what `PROPS.lock` used to be. */
export const LOCK_LEAF_H = 2.1;

export interface LockDoorDraw {
  /** The single leaf, posed. */
  leaf: Leaf;
  /** 0 shut .. 1 swung flat against the inside of the auditorium wall. */
  u: number;
  /** The sim still has a wall across this doorway. */
  sealed: boolean;
}

/**
 * A cinema door, shut or swinging.
 *
 * `p` is a `lock` prop: the leaf band in the doorway, and `progress` is the sim's
 * own swing clock (`lockSwing` in `ch1-night.ts`). Only cinema B ever moves — A, C
 * and D are scenery with a `shut` wall behind the joke on them, and they come back
 * from here at `u = 0`, which is the pose they have always had.
 *
 * It swings a quarter turn INTO the auditorium, hinged on the jamb the fixed
 * camera looks past, and ends flat against the inside of the wall it hangs on:
 * out of the doorway, where `ch1-night.ts` has pushed a `lockleaf` wall under it.
 * A magnetic lock lets go and the leaf falls open under its own weight — it does
 * not need to go anywhere else, and a door standing out in a 10 m corridor would
 * be a new obstacle in the dark rather than an opening.
 */
export function lockDoorDraw(p: Prop, walls: readonly Wall[]): LockDoorDraw {
  const rect: Rect = { x: p.x, y: p.y, w: p.w ?? 46, h: p.h ?? 6 };
  const { u, sealed } = openness(p, rect, walls, ['lock', 'shut']);
  // North rooms hang off `CY0` and open away from the corridor; south rooms off
  // `CY1` and away from it the other way. The corridor is between the two, so
  // which side the door is on is a fact about the doorway, not a flag to carry.
  const north = rect.y + rect.h / 2 < (CY0 + CY1) / 2;
  const jamb = north ? CY0 : CY1;
  const open: Vec2 = { x: 0, y: north ? -1 : 1 };
  const hinge: Vec2 = { x: rect.x + LOCK_LEAF_T / 2, y: jamb };
  return { leaf: swingLeaf(hinge, { x: 1, y: 0 }, open, rect.w, LOCK_LEAF_T, u), u, sealed };
}

/** The footprint a cinema door puts in the robot band this frame. */
export const lockDoorSolids = (p: Prop, walls: readonly Wall[]): Rect[] => [lockDoorDraw(p, walls).leaf.rect];

/* --------------------------------------------------- chapter 2 · router cabinet */

/** How many leaves the cabinet's door bay has. A 5 m equipment cabinet has two. */
export const CABINET_LEAVES = 2;
/** One leaf's width, sim px — 1.4 m, a door a person opens, not a 4.3 m wall. */
export const CABINET_LEAF_W = 17.5;
/** Leaf thickness, sim px: 2 mm of folded steel plus its frame. */
export const CABINET_LEAF_T = 3;
/** Leaf height and how far off the floor the bay starts, metres. */
export const CABINET_LEAF_H = 1.75;
export const CABINET_LEAF_LIFT = 0.15;
/**
 * How far each leaf swings, as a fraction of a quarter turn.
 *
 * Not the full 90°: a door left square to the wall is edge-on to a camera that
 * looks at that wall, and reads as a sliver rather than as an open door. 58° is
 * what `drawCabinet` already opened to and it is kept; what has changed is that
 * it now takes `CABINET_SWING_TIME` to get there and that `ch2-expo.ts` pushes a
 * `cabinetleaf` wall under each leaf where it stops.
 */
const CABINET_OPEN = 58 / 90;

export interface CabinetDoorDraw {
  /** The two leaves, west first. */
  leaves: Leaf[];
  /** 0 shut .. 1 walked open on their seized hinges. */
  u: number;
  /** The doorway the lit interior shows through, sim px. */
  bay: Rect;
}

/**
 * The router cabinet's doors, shut or being shouldered open.
 *
 * `p` is the `cabinet` prop — the whole carcass — and the doors are the middle of
 * its SOUTH face, the face the diorama camera looks at. The carcass itself is a
 * collider in every chapter and stays one: this is a full-height 19-inch floor
 * cabinet, not a doorway, so `openness` is not asked and the leaves are posed from
 * the clock alone. What the wall list decides here is what happens to the LEAVES,
 * and `ch2-expo.ts` puts a wall under each of them at the angle they stop at.
 *
 * Two leaves rather than one. The old single leaf was drawn at the full width of
 * the carcass — 4.32 m of door on a 5.12 m cabinet — which is not a door anybody
 * has ever opened and which, swung to 58°, reached 3.7 m out across the technical
 * room's floor. A pair of 1.4 m doors is what a cabinet that size has, and it
 * leaves the terminal inside reachable from where a robot can actually stand.
 */
export function cabinetDoorDraw(p: Prop, u01: number): CabinetDoorDraw {
  const u = clamp01(u01) * CABINET_OPEN;
  const w = p.w ?? 64;
  const d = p.h ?? 20;
  const faceY = p.y + d;
  const bayW = CABINET_LEAVES * CABINET_LEAF_W;
  const bayX = p.x + (w - bayW) / 2;
  const bay: Rect = { x: bayX, y: faceY - 1, w: bayW, h: 1 };
  // Hinged at the OUTER stile of each half and opening apart, the way a pair of
  // cabinet doors does — so the middle of the bay, where the terminal is, is the
  // first thing clear and the last thing either leaf is in front of.
  const shutW: Vec2 = { x: 1, y: 0 };
  const shutE: Vec2 = { x: -1, y: 0 };
  const outward: Vec2 = { x: 0, y: 1 };
  return {
    leaves: [
      swingLeaf({ x: bayX, y: faceY }, shutW, outward, CABINET_LEAF_W, CABINET_LEAF_T, u),
      swingLeaf({ x: bayX + bayW, y: faceY }, shutE, outward, CABINET_LEAF_W, CABINET_LEAF_T, u),
    ],
    u: clamp01(u01),
    bay,
  };
}

/**
 * Where the two leaves come to rest, for the chapter to push walls at.
 *
 * `ch2-expo.ts` calls this once, when Biggy walks the doors open, so the colliders
 * and the drawing are the same arithmetic rather than two guesses. Fully open, so
 * it is the END of the swing — the pose the sim agrees with.
 */
export const cabinetLeafRests = (p: Prop): Rect[] => cabinetDoorDraw(p, 1).leaves.map((l) => l.rect);

/* ------------------------------------------------- chapter 3 · the stair gate */

/** The barrier's own thickness, sim px. */
export const GATE_LEAF_T = 4;
/** The barrier's height, metres — `PROPS.gate` and the venue's static one agree. */
export const GATE_H = 1.1;
/** How far in from each end of the gate line its posts stand, sim px. */
export const GATE_POST_INSET = 8;
/** A post's own radius, sim px. */
export const GATE_POST_R = 1.6;

export interface GateDraw {
  /** The single barrier leaf, posed. */
  leaf: Leaf;
  /** The two fixed posts it hangs between, as points. */
  posts: Vec2[];
  /** 0 shut .. 1 swung back along the stair's west cheek. */
  u: number;
  /** The sim still has a `gate` wall across the foot of the flight. */
  sealed: boolean;
}

/**
 * The registration gate at the foot of the main staircase, shut or opening.
 *
 * `p` is chapter 3's `gate` prop and `progress` is `gateSwing` in
 * `ch3-breakfast.ts`. Stephan stands at this gate all morning and opens it when he
 * has his soup, his speaker and his floor back — so it OPENS FOR THE DAY. It is not
 * smashed and it does not lift like a shutter: it is a barrier hung on one post,
 * and it swings a quarter turn to lie flat along the west edge of the approach,
 * which is where a stair gate is pinned back when a building is open.
 *
 * **It swings SOUTH, out of the stairwell, and that is not a taste call.** Back
 * into the shaft would have been the tidier drawing and it is wrong twice over: the
 * flight starts climbing at `GF.gate`'s own edge and reaches 2.7 m within the
 * leaf's length (`groundPlates` in `src/sim/geometry.ts`), so a barrier drawn at
 * the height of its hinge would be buried two metres inside the treads — and the
 * transition walks three robots up the middle of that flight a moment later. Out
 * into the concourse it lies on flat lobby floor at one height, hard against the
 * reception block's east face, in full view of a camera that is on that side.
 * `ch3-breakfast.ts` pushes a `gateleaf` wall exactly where it stops.
 */
export function gateDraw(p: Prop, walls: readonly Wall[]): GateDraw {
  const rect: Rect = { x: p.x, y: p.y, w: p.w ?? 112, h: p.h ?? 6 };
  const { u, sealed } = openness(p, rect, walls, ['gate']);
  const y = rect.y + rect.h / 2;
  const hingeX = rect.x + GATE_POST_INSET;
  const len = rect.w - GATE_POST_INSET * 2;
  // South is out into the lobby — see the header for why it is not the other way.
  const leaf = swingLeaf({ x: hingeX, y }, { x: 1, y: 0 }, { x: 0, y: 1 }, len, GATE_LEAF_T, u);
  return { leaf, posts: [{ x: hingeX, y }, { x: hingeX + len, y }], u, sealed };
}

/** Every footprint the gate puts in the robot band this frame, posts included. */
export const gateSolids = (p: Prop, walls: readonly Wall[]): Rect[] => {
  const d = gateDraw(p, walls);
  return [
    d.leaf.rect,
    ...d.posts.map((v): Rect => ({ x: v.x - GATE_POST_R, y: v.y - GATE_POST_R, w: GATE_POST_R * 2, h: GATE_POST_R * 2 })),
  ];
};
