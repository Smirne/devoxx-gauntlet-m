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

import { FIRE_LEAF_H, fireDoorDraw } from '../src/render/fire-door';
import { KEYPAD_TOP_M } from '../src/render/keypad';
import { GATE_H, LOCK_LEAF_H, gateDraw, lockDoorDraw } from '../src/render/doors';
import { ROLLER_H, rollerDoorDraw, ROLLER_CLEAR_M } from '../src/render/roller-door';
import { SEAT_TOP_M } from '../src/render/seats';
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
  /*
   * The fire door is the one kind this table no longer describes.
   *
   * It used to be `{ h: 2.1, tl: true }`, and that entry was true of the shut door
   * and a lie about the open one: `ch1-night.ts` removes the wall when the code is
   * accepted and goes on publishing the prop, so the renderer kept drawing a 2.1 m
   * slab across an opening that was no longer solid — Michele, with a screenshot of
   * Biggy standing inside it, *"still a walkthrough object on the doorway"*. The
   * entry stays so the kind is still classified, and `propBox` below asks
   * `src/render/fire-door.ts` — the module `scene.ts` itself draws from — where the
   * leaves actually are.
   */
  firedoor: { h: FIRE_LEAF_H, tl: true },
  /*
   * The keypad is taller than it was, and that is a real change, not a fudge.
   *
   * It used to be `{ h: 1.25 }`, a table entry drawn as one box. It is now a
   * modelled unit (`src/render/keypad.ts`) whose mounting plate tops out at
   * `KEYPAD_TOP_M` — the height is read from that module rather than re-typed, so
   * this transcription cannot drift from it the way the header warns about. The
   * FOOTPRINT is unchanged and is still the sim's own rect, which is the only
   * thing the collider sweep asks about: a drawn solid must stand where a wall
   * stands, and it does.
   */
  keypad: { h: KEYPAD_TOP_M, tl: true },
  'projector-panel': { h: 0.9, tl: true, lift: 2.5 },
  screen: { h: 5.2, tl: true },
  alcove: { h: 0.05, tl: true, flat: true },
  /*
   * A cinema door is no longer a box at the prop's own rect either.
   *
   * It was `{ h: 2.1, tl: true }`, which was true of the four that never open and a
   * lie about cinema B's, which `ch1-night.ts` used to stop publishing altogether on
   * the frame the projector-panel release was pressed — a door that did not open,
   * it ceased to exist. It swings now, and `propBox` asks `src/render/doors.ts`,
   * the module `scene.ts` itself draws from, where the leaf actually is.
   */
  lock: { h: LOCK_LEAF_H, tl: true },
  jammed: { h: 2.1, tl: true },
  /* chapter 2 */
  rack: { h: 0.3, tl: true, lift: 1.55 },
  terminal: { h: 0.34, tl: true, lift: 1.25 },
  poster: { h: 0.62, tl: true, lift: 0.95 },
  printer: { h: 0.95, tl: true },
  /*
   * The shutter is the second kind this table no longer describes, for the same
   * reason as `firedoor` above and with the same history: `ch2-expo.ts` removes
   * the `roller` wall on the frame Biggy smashes through it and goes on publishing
   * the prop, so a 2.6 m box at that rect was a lie about every frame after the
   * break — and `chapterSolids` in `tests/colliders.test.ts` excused it anyway,
   * because it skipped anything `broken`. `propBox` below asks
   * `src/render/roller-door.ts`, the module `scene.ts` itself draws from.
   */
  roller: { h: ROLLER_H, tl: true },
  /*
   * And the registration gate, for the same reason and with the same history:
   * `ch3-breakfast.ts` removes the `gate` wall in `done()` and goes on publishing
   * the prop, so a 1.1 m box at that rect was a barrier standing across a stair
   * foot the sim had already opened. It swings back along the flight's west cheek
   * now, and `propBox` asks `gateDraw`.
   *
   * The box below is the LEAF. The gate's two posts do not move and are separately
   * covered — by the `gate` wall while it is shut, and by `gateleaf`/`gatepost`
   * once it is open — and a single box round leaf AND far post would claim the
   * whole 8 m stair mouth as solid, which is the opposite of what this sweep is
   * for. `tests/doors.test.ts` checks every rect `gateSolids` returns, posts
   * included, against the wall list in both states.
   */
  gate: { h: GATE_H, tl: true },
  lane: { h: 0.04, tl: true, flat: true },
  duck: { h: 0.3 },
  'duck-target': { h: 0.03, flat: true },
  sticker: { h: 0.06 },
  'race-marker': { h: 0.5 },
  /* chapter 3 */
  'soup-station': { h: 1.0 },
  /*
   * The Finally Block — chapter 3's beer bar. Centre points, not corners.
   *
   * The counter is a metre of solid oak and has a `low` wall under it (pushed by
   * `ch3-breakfast.ts`, kind `bar`), so it belongs in the band the sweep measures
   * and is expected to pass it. The taps and the glassware stand ON that counter,
   * which is what `lift: 1.05` says: above `BAND_HI`, so the sweep reads them as
   * fittings rather than as things a robot walks into — you cannot walk into a
   * beer glass that is a metre off the floor without first walking into the bar.
   */
  'bar-counter': { h: 1.05 },
  'beer-tap': { h: 0.34, lift: 1.05 },
  'beer-glass': { h: 0.16, lift: 1.05 },
  ladle: { h: 0.9, tl: true },
  dropzone: { h: 0.04, tl: true, flat: true },
  pot: { h: 0.45 },
  soup: { h: 0.12 },
  sign: { h: 2.2, fw: 4.8, fd: 0.14, lift: 2.2 },
  /* chapter 4 */
  cake: { h: 0.55 },
  'cake-mark': { h: 0.04, tl: true, flat: true },
  stage: { h: 0.45, tl: true },
  crowd: { h: 0.05, flat: true, fw: 2, fd: 2 },
  'banner-hook': { h: 0.25 },
  banner: { h: 1.1, tl: true },
  spotlight: { h: 0.35 },
  /*
   * A seat row is no longer a 0.55 m slab, and that is a real change, not a fudge.
   *
   * It was drawn as one flat-topped cuboid per rect — the entry said so and
   * `drawProp` obeyed it — while the venue's own auditoria were being seated with
   * a modelled seat out of `src/render/venue/props.ts`. Michele, with cinema E
   * under Droid's pool: *"This still needs a shape."* `src/render/seats.ts` draws
   * both kinds now, from that same seat geometry, and `SEAT_TOP_M` is read off the
   * model rather than retyped so this transcription cannot drift from it.
   *
   * The FOOTPRINT is unchanged and is still the sim's own rect — no seat is drawn
   * outside it — which is the only thing the collider sweep asks about.
   */
  seatrow: { h: SEAT_TOP_M, tl: true },
  seatblock: { h: SEAT_TOP_M, tl: true },
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
  /*
   * The fire door comes from the renderer's own module, not from the table: see
   * its entry above. Shut, that is the pair of leaves filling the opening and the
   * answer is the same as the old one. Open, the leaves have swung clear and the
   * opening is drawn as what it is — an opening — so there is no box at all, and a
   * zero-height one reads to the sweeps as "nothing in the robot band".
   */
  if (p.kind === 'firedoor') {
    const d = fireDoorDraw(p, []);
    // Shut, the two leaves together ARE the opening, and one box describes them.
    // Once they are swinging they are two separate things in two separate places,
    // which a single box cannot say without claiming the gap between them as
    // solid — the very claim that made this prop walk-through. `tests/fire-door.
    // test.ts` takes the leaves one at a time; here they are simply not a box.
    if (d.u !== 0 || d.leaves.length === 0) return { rect: { x: p.x, y: p.y, w: 0, h: 0 }, lo: 0, hi: 0 };
    const rs = d.leaves.map((l) => l.rect);
    const x0 = Math.min(...rs.map((r) => r.x));
    const y0 = Math.min(...rs.map((r) => r.y));
    const x1 = Math.max(...rs.map((r) => r.x + r.w));
    const y1 = Math.max(...rs.map((r) => r.y + r.h));
    return { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, lo: 0, hi: spec.h };
  }
  /*
   * And the roller door comes from `roller-door.ts` for the same reason. Down, the
   * curtain fills the opening and one box describes it. Torn up, every slat is
   * above `ROLLER_CLEAR_M` — over Droid's head, in the housing — so there is
   * nothing in the doorway at all, and a zero-height box reads to the sweeps as
   * "nothing in the robot band". Mid-rise the curtain is a moving solid the sim
   * does not carry (see that module's header), and the union of the slats still
   * below the clearance is the honest box for it.
   */
  if (p.kind === 'roller') {
    const low = rollerDoorDraw(p, []).slats.filter((s) => s.lo < ROLLER_CLEAR_M - 1e-6);
    if (low.length === 0) return { rect: { x: p.x, y: p.y, w: 0, h: 0 }, lo: 0, hi: 0 };
    const x0 = Math.min(...low.map((s) => s.rect.x));
    const y0 = Math.min(...low.map((s) => s.rect.y));
    const x1 = Math.max(...low.map((s) => s.rect.x + s.rect.w));
    const y1 = Math.max(...low.map((s) => s.rect.y + s.rect.h));
    return {
      rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      lo: Math.min(...low.map((s) => s.lo)),
      hi: Math.max(...low.map((s) => s.lo + s.h)),
    };
  }
  /*
   * A cinema door, from `src/render/doors.ts`. Shut, the leaf fills the doorway and
   * the answer is the box it always was. Open, it stands against the inside of the
   * auditorium wall, where `ch1-night.ts` pushes a `lockleaf` wall under it — a
   * real footprint in a real place, which is the whole point of the change.
   */
  if (p.kind === 'lock') {
    return { rect: lockDoorDraw(p, []).leaf.rect, lo: 0, hi: spec.h };
  }
  /* ...and the stair gate's leaf. See its entry above for why the posts are not in here. */
  if (p.kind === 'gate') {
    return { rect: gateDraw(p, []).leaf.rect, lo: 0, hi: spec.h };
  }
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
