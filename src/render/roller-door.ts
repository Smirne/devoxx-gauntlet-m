/**
 * roller-door.ts — where chapter 2's store shutter is DRAWN, as pure geometry.
 *
 * ## Why this is its own module
 *
 * Michele, with a screenshot of a mid-grey slab standing through Biggy's chest:
 * *"still a walkthrough object on the doorway, add an animation + sound when it
 * opens."* The fire door in chapter 1 was one of them; this is the other, and it
 * is the same bug to the letter. `ch2-expo.ts` removes the `roller` wall on the
 * frame Biggy goes through it and goes on publishing a `roller` prop with the
 * same rect, which `scene.ts` drew from its `PROPS` table as a 2.6 m box —
 * tinted dark red for `broken` and otherwise unchanged. Measured on the built
 * page, driving the real chapter through the real break:
 *
 * ```
 * roller prop after the break: {"kind":"roller","x":894,"y":130,"w":6,"h":60,"state":"broken"}
 * walls still covering that rect: []
 * biggy placed at 897,160 (r=9) -> settles at 897.0,160.0   <- dead centre of the leaf
 * ```
 *
 * Worse than the fire door, in fact: `src/render/venue/ground.ts` builds a
 * slatted shutter at the same rect in every chapter, so after the break there
 * were *two* doors standing in a doorway the sim had already given up.
 *
 * ## The cure, which is the one CLAUDE.md already prescribes
 *
 * The shutter is drawn where the sim says the shutter is. Not from a table of
 * kinds, not from a rect that has stopped meaning anything — from the chapter's
 * live wall list and the sim's own clock, every frame. `rollerDoorDraw` is handed
 * the walls; if none of them is a `roller` across the opening, the curtain is
 * **not** drawn in the opening, whatever the prop says. Walk-through is then not
 * a bug that can come back, it is a shape the code cannot express.
 *
 * `scene.ts` draws what this module returns and `tests/roller-door.test.ts`
 * measures it, so the picture and the acceptance criterion cannot drift apart.
 *
 * ## A shutter does not swing, it goes up
 *
 * The fire door arrives: a magnetic lock lets go and a heavy leaf swings to its
 * stop. This one is *hit*, at 5.7 m/s by seven hundred kilos of Biggy with Voxxy
 * on the tow bar, and the ROLLER_DOOR_SPEED check exists precisely because
 * nothing softer will do it. So it is torn upward and jams in its housing: a fast
 * ugly run-up (`ease`, front-loaded), the slats rattling in their guides on the
 * way (`rattle`, damped to nothing by the time it settles), and a curtain that
 * ends up bunched, bulged INTO the store — the way Biggy was going — and sitting
 * too low in its box to be called open. Nobody is ever going to shut it again.
 *
 * The settled bundle hangs entirely above `ROLLER_CLEAR_M`, which is above Droid,
 * the tallest thing that walks under it. So the honest answer to "what is in the
 * doorway now" is *nothing*, and that is what the sim says too: the opening is
 * free and the chapter needs no new collider for the leaf, because the leaf is
 * over your head.
 *
 * ## The one licence this takes
 *
 * Between the two ends — `0 < u < 1` — the curtain sweeps up through a doorway
 * the sim has already handed back. It is the same licence `fire-door.ts` takes
 * with its swing and `drawJammed` takes with the falling leaf: a moving solid,
 * and the sim does not carry moving solids. It costs `ROLLER_RISE_TIME`, which is
 * under half a second, in a doorway Biggy has just left at speed. The two ENDS
 * are the poses the sim agrees with, and those are the poses the test checks.
 */

import type { Prop, Rect, Wall } from '../sim/types';

/** Slats in the curtain. The venue's own static shutter draws seven; so does this. */
export const ROLLER_SLATS = 7;
/**
 * The clear height of the opening, metres — the venue's `WALL_H` in
 * `src/render/venue/props.ts`, which is what the static shutter is built to.
 */
export const ROLLER_H = 2.45;
/** One slat's height, metres. */
export const ROLLER_SLAT_H = ROLLER_H / ROLLER_SLATS;
/**
 * The underside of the jammed bundle, metres, and therefore the headroom the
 * torn-open doorway keeps.
 *
 * Droid is the tallest thing that ever walks through here at 2.1 m
 * (`ROBOT_HEIGHT_M` in `src/sim/units.ts`), so the curtain settles clear of him
 * with 15 cm to spare. Anything this module draws below this line is standing in
 * a robot's way and has to have a wall under it — which is exactly the question
 * `rollerDoorSolids` answers and `tests/roller-door.test.ts` asks.
 */
export const ROLLER_CLEAR_M = 2.25;
/**
 * Vertical pitch of the slats once they are packed in the housing, metres.
 *
 * A quarter of their own height: they are nested, not stacked. Seven of them
 * reach 2.25..3.05 m, which is under the hall's ceiling ribs at 3.25 m.
 */
const PACK_PITCH = 0.085;
/** How far the torn curtain bulges INTO the store, sim px. Biggy was going that way. */
const TEAR_PUSH = 3.5;

/** One slat of the curtain, posed. Footprint in sim px, heights in metres. */
export interface RollerSlat {
  /** Axis-aligned footprint, the slat's own thickness included. */
  rect: Rect;
  /** Underside, metres above the store's floor. */
  lo: number;
  /** The slat's own height, metres. */
  h: number;
  /**
   * Roll about the door's own width axis, radians — a torn slat does not sit
   * square in its guides. Sim +y is world +z, so the renderer applies this as a
   * rotation about world Z and the slat's top edge leans in x.
   */
  tilt: number;
}

/** What the shutter looks like this frame. */
export interface RollerDoorDraw {
  /** The curtain, bottom rail first. Empty when the chapter draws no shutter at all. */
  slats: RollerSlat[];
  /** 0 down .. 1 torn up and jammed in its housing. */
  u: number;
  /** The sim still has a `roller` wall across this opening. */
  sealed: boolean;
}

/** Deterministic 0..1 per slat: the tear is ugly, and it is the same ugly every frame. */
const jag = (i: number): number => {
  const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Front-loaded: yanked up hard, then jams. Nothing about this is a door opening. */
const ease = (u: number): number => 1 - (1 - u) ** 2.2;

const overlaps = (w: Wall, r: Rect): boolean =>
  w.x < r.x + r.w && w.x + w.w > r.x && w.y < r.y + r.h && w.y + w.h > r.y;

/**
 * What the shutter looks like this frame, from the sim and nothing else.
 *
 * `p` is the chapter's `roller` prop: its rect is the opening the curtain fills,
 * and `progress` is the sim's own rise clock (`rollerRise` in `ch2-expo.ts`).
 * `walls` is the chapter's live wall list, which carries a `roller` wall across
 * that opening for exactly as long as the shutter is down.
 *
 * The wall list wins every argument:
 *
 *  - a `roller` wall across the opening means the curtain is DOWN (`u = 0`),
 *    whatever a stale `progress` claims;
 *  - no wall, and no rise clock either, means the curtain is UP (`u = 1`) — the
 *    sim has given the doorway back and a leaf drawn across it would be the very
 *    bug this module exists to make unsayable;
 *  - no wall and a rise clock means the sim is running the animation, and `u` is
 *    that clock.
 *
 * Callers that have no wall list — `tests/prop-geometry.ts` asking what box the
 * renderer draws for a kind — pass `[]` and get the pose the prop's own state and
 * progress describe. That is the same seam `fireDoorDraw` leaves open, and it is
 * safe for the same reason: the poses are then checked against the real wall
 * list by whoever has one.
 */
export function rollerDoorDraw(p: Prop, walls: readonly Wall[]): RollerDoorDraw {
  const rect: Rect = { x: p.x, y: p.y, w: p.w ?? 6, h: p.h ?? 60 };
  const sealed = walls.some((w) => w.kind === 'roller' && overlaps(w, rect));

  let u = clamp01(p.progress ?? (p.state === 'broken' ? 1 : 0));
  if (sealed) u = 0;
  else if (walls.length > 0 && u === 0) u = 1;

  const lift = ease(u);
  const slats: RollerSlat[] = [];
  for (let i = 0; i < ROLLER_SLATS; i++) {
    const down = i * ROLLER_SLAT_H;
    const up = ROLLER_CLEAR_M + i * PACK_PITCH;
    /*
     * The rattle: sheet metal hammering through its guides on the way up, damped
     * to exactly nothing by the time the curtain settles, so the pose at `u = 1`
     * is a single fixed answer and not a frame of an animation. It is a function
     * of `u` alone — the sim owns the clock, this module owns the shape.
     */
    const rattle = Math.sin(u * Math.PI * 5 + i * 1.7) * (1 - u) * (1 - u) * 0.06;
    const tear = u;
    const thick = rect.w * (1 + 0.9 * tear * jag(i + 7));
    const bulge = (0.35 + 0.65 * jag(i)) * TEAR_PUSH * tear;
    const inset = 1.6 * tear * jag(i + 11);
    slats.push({
      rect: {
        x: rect.x + bulge - (thick - rect.w) / 2,
        y: rect.y + inset,
        w: thick,
        h: rect.h - inset * 2,
      },
      lo: Math.max(0, down + (up - down) * lift + rattle),
      h: ROLLER_SLAT_H * 0.82,
      tilt: (jag(i + 3) - 0.5) * 0.5 * tear,
    });
  }
  return { slats, u, sealed };
}

/**
 * Every footprint the shutter puts in a robot's way this frame.
 *
 * Anything whose underside is below `ROLLER_CLEAR_M` is something a robot walks
 * into rather than under. `tests/roller-door.test.ts` asks the sim whether a
 * robot can stand in any of them; mid-rise is excluded on purpose — see the
 * module header — so the test drives the door to a settled state before it
 * measures.
 */
export const rollerDoorSolids = (p: Prop, walls: readonly Wall[]): Rect[] =>
  rollerDoorDraw(p, walls)
    .slats.filter((s) => s.lo < ROLLER_CLEAR_M - 1e-6)
    .map((s) => s.rect);
