/**
 * How `src/render/scene.ts` turns a `Prop` into a box — transcribed, because it
 * will not export it.
 *
 * A chapter's own furniture reaches the screen through `props()`, and `PROPS` in
 * the renderer is the lookup that says how tall each `kind` is drawn, whether its
 * `x,y` is a corner or a centre, whether it is a flat floor decal and how far off
 * the floor it is hung. `tests/colliders.test.ts` measures the venue's real
 * meshes; it has never been able to measure these, because they are not meshes
 * until a frame is drawn — and that blind spot is where cinema E's 5.2 m screen
 * slab, its keypad and five 2.2 m joke hoardings sat, drawn and walk-through,
 * through every round of the sweep.
 *
 * This file is NOT a test (the runner collects `tests/**\/*.test.ts`), it is the
 * table those tests share. It is a transcription and therefore a thing that can
 * drift: `everyDrawnKindIsClassified` in `tests/colliders.test.ts` fails the
 * moment a chapter emits a kind that is not in here, which is the drift that
 * matters — a new prop nobody has classified. The fix for the rest of it is to
 * export `PROPS` from the renderer and delete this; that is a change in a file
 * another builder was writing in the same tree, so it is flagged, not made.
 */

import type { Prop, Rect } from '../src/sim/types';
import { PX_PER_M } from '../src/sim/units';

export interface PropDraw {
  /** Height in metres. */
  h: number;
  /** `x,y` is the top-left of `w,h` rather than its centre. */
  tl?: boolean;
  /** Drawn as a floor plate: a marker, a lane, a drop zone. Never an obstacle. */
  flat?: boolean;
  /** Footprint in metres when the prop carries no `w`/`h`. */
  fw?: number;
  fd?: number;
  /** Metres off the floor — a thing bolted to a wall rather than standing on it. */
  lift?: number;
}

/** `PROPS` in `src/render/scene.ts`, kind for kind. */
export const PROP_DRAW: Readonly<Record<string, PropDraw>> = Object.freeze({
  /* chapter 1 */
  firedoor: { h: 2.1, tl: true },
  keypad: { h: 1.25, tl: true },
  'projector-panel': { h: 0.9, tl: true, lift: 2.5 },
  screen: { h: 5.2, tl: true },
  alcove: { h: 0.05, tl: true, flat: true },
  lock: { h: 2.1, tl: true },
  jammed: { h: 2.1, tl: true },
  /* chapter 2 */
  rack: { h: 0.3, tl: true, lift: 1.55 },
  terminal: { h: 0.34, tl: true, lift: 1.25 },
  poster: { h: 0.62, tl: true, lift: 0.95 },
  printer: { h: 0.95, tl: true },
  roller: { h: 2.6, tl: true },
  gate: { h: 1.1, tl: true },
  lane: { h: 0.04, tl: true, flat: true },
  duck: { h: 0.3 },
  'duck-target': { h: 0.03, flat: true },
  sticker: { h: 0.06 },
  'race-marker': { h: 0.5 },
  /* chapter 3 */
  'soup-station': { h: 1.0 },
  ladle: { h: 0.9, tl: true },
  dropzone: { h: 0.04, tl: true, flat: true },
  pot: { h: 0.45 },
  soup: { h: 0.12 },
  sign: { h: 2.2, fw: 4.8, fd: 0.14 },
  /* chapter 4 */
  cake: { h: 0.55 },
  'cake-mark': { h: 0.04, tl: true, flat: true },
  stage: { h: 0.45, tl: true },
  crowd: { h: 0.05, flat: true, fw: 2, fd: 2 },
  'banner-hook': { h: 0.25 },
  banner: { h: 1.1, tl: true },
  spotlight: { h: 0.35 },
  seatrow: { h: 0.55, tl: true },
  seatblock: { h: 0.55, tl: true },
  /*
   * Drawn by their own functions rather than from the table — `drawBreaker`,
   * `drawTerminal`, `drawCabinet`, `drawCrate`, `drawJammed`, the cable. Their
   * footprints are listed here so the sweep can see them; where the function
   * scales a box itself the numbers are the ones it uses.
   */
  breaker: { h: 0.9, tl: true, lift: 0.6 },
  cabinet: { h: 1.75, tl: true, lift: 0.15 },
  crate: { h: 0.34 },
  cable: { h: 0.02, flat: true },
});

/** The box a prop is drawn as: its footprint in sim px, and its band in metres. */
export function propBox(p: Prop): { rect: Rect; lo: number; hi: number } | null {
  const spec = PROP_DRAW[p.kind];
  if (spec === undefined) return null;
  const wPx = p.w !== undefined ? p.w : (spec.fw ?? 0.8) * PX_PER_M;
  const dPx = p.h !== undefined ? p.h : (spec.fd ?? 0.8) * PX_PER_M;
  const rect: Rect = spec.tl
    ? { x: p.x, y: p.y, w: wPx, h: dPx }
    : { x: p.x - wPx / 2, y: p.y - dPx / 2, w: wPx, h: dPx };
  const lo = spec.lift ?? 0;
  return { rect, lo, hi: lo + (spec.flat === true ? Math.max(spec.h, 0.03) : spec.h) };
}

/** Is this prop a floor decal or a hung fitting rather than something you walk into? */
export const isFloorDecalOrHung = (p: Prop): boolean => {
  const box = propBox(p);
  if (box === null) return false;
  return PROP_DRAW[p.kind].flat === true || box.lo >= 0.6 || box.hi <= 0.15;
};
