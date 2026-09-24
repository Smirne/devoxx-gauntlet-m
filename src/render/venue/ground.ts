/**
 * ground.ts — the exhibition level, on its TWO levels: the hall with its column
 * grid, the walled catering court, the technical room, the polo/badge store with
 * its roller door, twelve sponsor booths — and, half a metre higher, the lobby:
 * reception, the wardrobe, the main staircase and its gate, the BOF rooms, the
 * toilets and the main entrance.
 *
 * Every rectangle comes from `GF` in `src/sim/geometry.ts`; the only numbers typed
 * here are heights, which the plan does not carry, and dressing offsets inside a
 * rectangle the plan does give.
 *
 * ## The level change
 *
 * `LOBBY_RISE_M` — half a metre. The hall floor is the datum (local y = 0) and the
 * lobby stands on a raised plate above it, joined by the **small staircase**: five
 * long, shallow steps across the hall's right edge, which is the only way between
 * the two. Concrete closes that edge either side of it. The prototype's "scalloped
 * wall with four openings" was invented and is gone; see
 * `docs/ground-floor-lobby-fix.md`.
 *
 * Materials follow `media/other-images/CAPTIONS.md`: mid-gray hall carpet under a
 * pale square-column grid, red accent panels on the side walls, and a warm
 * reception — wood-slat back wall, long white counter, cream-shaded table lamps, a
 * large white pendant disc and an orange ceiling soffit strip.
 *
 * Nothing in this file is a collider: the sim owns collision, and anything drawn
 * here that the sim does not know about is kept flat against a real wall or low
 * enough to read as dressing.
 *
 * That rule used to have an exception — the hall's column grid was built here, out
 * of the renderer's own loop, and the sim had never heard of it. Michele found what
 * that means in play ("robots can go through staircase and objects") and a
 * flood-fill probe put a number on it: eighteen columns, four lobby columns, two
 * planters and both secondary staircases, 100% of every footprint walkable. All of
 * that geometry now lives in `src/sim/geometry.ts` and arrives here through
 * `groundWalls()` like every other wall, so there is no second copy to drift.
 */

import * as THREE from 'three';

import { H, T, W } from '../../sim/constants';
import {
  COUNTER,
  ENTRANCE_BAYS,
  FORECOURT_BOLLARDS,
  FORECOURT_PLANTERS,
  GF,
  LOBBY_PLANTERS,
  LOBBY_RISE_M,
  MAIN_STAIR_TOP_M,
  LOBBY_STANCHIONS,
  bofTables,
  boothTotem,
  entranceLeaves,
  groundWalls,
  stairDoors,
  stairLanding,
  stairMidLanding,
  stairRamps,
} from '../../sim/geometry';
import type { Rect, Wall } from '../../sim/types';
import { m } from '../../sim/units';
import type { VenuePalette } from './materials';
import {
  BOOTH_SCHEMES,
  type SignPainter,
  sponsorCloth,
  sponsorPanel,
  sponsorSkirt,
  sponsorTotem,
} from './signage';
import {
  BREAKER_H,
  BREAKER_Y,
  DOOR_H,
  LOW_H,
  NEAR_CUT_H,
  SHELL_H,
  WALL_H,
  anchorAt,
  boxAt,
  clothTable,
  floorSlab,
  networkRack,
  pendant,
  mergeSimple,
  postAt,
  rollerDoor,
  slab,
  stairFlight,
  wallPanel,
} from './props';

/**
 * How far the visible part of a staircase climbs before the ceiling swallows it.
 *
 * It is `MAIN_STAIR_TOP_M` in `src/sim/geometry.ts` now, not a number of this
 * file's own: the sim publishes the main flight as a walking surface a robot
 * stands on (`groundPlates`), and a flight drawn to one height while robots walk
 * it at another is the bug that made chapter 3's transition climb through solid
 * treads. One number, and the sim owns it.
 */
const STAIR_RISE = MAIN_STAIR_TOP_M;
/** The lobby's walking surface, above the hall's. */
const RISE = LOBBY_RISE_M;
/** East of this the floor is the raised lobby plate; west of it, the hall. */
const LOBBY_X = GF.smallStairs.x + GF.smallStairs.w;
/**
 * The plinth the network rack stands on, metres.
 *
 * Nothing in the plan asks for it; the diorama camera does. Chapter 2's pitch is
 * 31 deg and the technical room's south side is the building shell — 3.8 m of it —
 * four metres in front of a 1.95 m cabinet, so the rack's head cleared the wall top
 * by 13 cm and Michele reported it as *"not visible at all"*. On a 0.4 m plinth it
 * clears by half a metre, which is the difference between a silhouette you can see
 * and one you cannot. It changes nothing in the sim: the rack's footprint, and
 * therefore Voxxy's reach to the cable end on it, is the same rect.
 */
const RACK_PLINTH = 0.4;

export interface GroundBuild {
  group: THREE.Group;
  /** Named venue features -> an Object3D on the ground floor. */
  anchors: Map<number | string, THREE.Object3D>;
  /** Everything above head height, so a top-down debug shot can hide it. */
  overhead: THREE.Group;
}

/** The walking surface a thing at this sim x stands on. */
function baseAt(x: number): number {
  return x >= LOBBY_X ? RISE : 0;
}

/* ------------------------------------------------------------------- walls */

/** Palette entry, height and base for a sim wall slab; `null` means "drawn elsewhere". */
function wallStyle(
  w: Wall,
  p: VenuePalette,
): { mat: THREE.MeshStandardMaterial; height: number; base: number } | null {
  /*
   * Every sponsor booth is drawn by `booths()` — half tables as cloth-draped
   * tables, built booths as a back wall, two returns and a counter. A built booth
   * used to come through here as one `BOOTH_H` slab across its whole rect, which
   * is why the hall read as six grey blocks with a stripe.
   */
  if (w.booth) return null;
  // Drawn by their own builders further down: the 19-inch rack, the router cabinet
  // and its louvres, the slatted roller door, the turned forecourt bollards, and
  // the flight inside a stair shaft (the sim carries it as a wall because nothing
  // climbs).
  if (w.kind === 'rack' || w.kind === 'stair-foot' || w.kind === 'cabinet' || w.kind === 'roller' || w.kind === 'bollard') {
    return null;
  }
  /*
   * The furniture that used to be drawn out of this file's own numbers and was
   * therefore walk-through: booth totems and flight cases, the hall's red accent
   * panels, the store's back wall, the BOF slat walls, the toilet partitions, the
   * entrance's door-bay mullions and the leaves standing open in them, and the
   * forecourt planters. Michele, on that build: *"this cube is walk-through"*,
   * *"Entrance walls are still walkable"*.
   */
  // The totem is drawn by `booths()` too: it carries its sponsor's name now, and
  // a name needs a painted face rather than a block of `devoxxOrange`.
  if (w.kind === 'totem') return null;
  if (w.kind === 'crate') return { mat: p.blackMetal, height: 1.05, base: 0 };
  if (w.kind === 'accent-panel') return { mat: p.redPanel, height: 2, base: 0.4 };
  if (w.kind === 'store-wall') return { mat: p.wood, height: 1.9, base: 0 };
  if (w.kind === 'bof-slats') return { mat: p.wood, height: WALL_H, base: RISE };
  if (w.kind === 'bof-table') return null;
  if (w.kind === 'toilet-partition') return { mat: p.tiling, height: 1.9, base: RISE };
  if (w.kind === 'mullion') return { mat: p.mullion, height: SHELL_H, base: RISE };
  if (w.kind === 'door-leaf') return { mat: p.doorLeaf, height: DOOR_H, base: RISE };
  if (w.kind === 'forecourt-planter') return { mat: p.concrete, height: 0.5, base: RISE };
  // The hall's structural grid: full shell height, because a roof column carries
  // the roof. The lobby's are the dark blue ones on the raised plate.
  if (w.kind === 'column') return { mat: p.concrete, height: SHELL_H, base: 0 };
  if (w.kind === 'lobby-column') return { mat: p.lobbyColumn, height: SHELL_H, base: RISE };
  if (w.kind === 'planter') return { mat: p.wood, height: 0.5, base: RISE };
  /*
   * The stair shafts. Their near (south) flank is cut to a parapet for the same
   * reason the corridor's is upstairs (`NEAR_CUT_H` in props.ts): at full height it
   * is a 2.45 m wall standing between the diorama camera and the inside of the very
   * thing the player has to read as a stairwell.
   */
  if (w.kind === 'stairwell') return { mat: p.hallWall, height: WALL_H, base: 0 };
  if (w.kind === 'stairwell-near') return { mat: p.hallWall, height: NEAR_CUT_H, base: 0 };
  const isShell =
    (w.w === W && (w.y === 0 || w.y === H - T)) || (w.h === H && (w.x === 0 || w.x === W - T));
  if (isShell) return { mat: p.shell, height: SHELL_H + RISE, base: 0 };
  // The hall's right edge stands on the hall floor and reaches above the lobby's.
  if (w.kind === 'concrete') return { mat: p.concrete, height: WALL_H + RISE, base: 0 };
  if (w.kind === 'hall-edge') return { mat: p.hallWall, height: WALL_H + RISE, base: 0 };
  if (w.kind === 'facade') return { mat: p.glazing, height: SHELL_H, base: RISE };
  // Reception's long white counter and the wardrobe's hand-in top.
  if (w.kind === 'desk' || w.kind === 'coat-counter') return { mat: p.counterWhite, height: LOW_H, base: RISE };
  if (w.low) return { mat: p.counterTop, height: LOW_H, base: baseAt(w.x) };
  return { mat: p.hallWall, height: WALL_H, base: baseAt(w.x) };
}

/* -------------------------------------------------------------- the hall */

/** The router cabinet's height, metres. A full-height 19-inch floor cabinet. */
const CABINET_H = 2.05;

/**
 * THE THRESHOLD — the hall's right edge, and the only way across it.
 *
 * Michele's plot, and the plan under it, draw a run of long shallow steps across
 * world y 285..568 and solid wall above and below. The sim's slabs carry the
 * concrete (`wallStyle`); this builds the flight itself, the nosings, and the
 * lip of the raised lobby plate either side of it so the level change reads from
 * the hall as a step up rather than as a seam in the floor.
 */
function threshold(p: VenuePalette, anchors: Map<number | string, THREE.Object3D>): THREE.Group {
  const g = new THREE.Group();
  g.name = 'threshold';
  const s = GF.smallStairs;

  const flight = stairFlight({
    rect: { x: s.x, y: s.y, w: s.w, h: s.h },
    topY: RISE,
    bottomY: 0,
    // The lobby is on the +x side, so the flight descends westward into the hall.
    dir: '-x',
    steps: 6,
    tread: p.concrete,
    nosing: p.stairNosing,
  });
  flight.name = 'threshold-steps';
  g.add(flight);

  // The cut edge of the raised plate, above and below the flight: a 0.5 m riser
  // faced in the same concrete, which is what you actually see from the hall.
  for (const [y0, y1] of [
    [GF.hall.y, s.y],
    [s.y + s.h, GF.hall.y + GF.hall.h],
  ] as Array<[number, number]>) {
    if (y1 <= y0) continue;
    g.add(slab({ x: LOBBY_X - 6, y: y0, w: 6, h: y1 - y0 }, 0, RISE, p.concrete));
  }

  /*
   * A stepped cheek wall down each flank.
   *
   * Twenty-two metres of open steps needs its edges marked, and a handrail is the
   * wrong object here: it would have to be a slope, and a flat one on posts of one
   * length ends up floating at the top of the flight. A low stringer wall that
   * climbs with the treads is what the plan draws, and it reads as a stair from
   * every angle the diorama camera takes.
   */
  const STEPS = 6;
  for (const ry of [s.y, s.y + s.h - 5]) {
    for (let i = 0; i < STEPS; i++) {
      const tread = (RISE * (i + 1)) / STEPS;
      g.add(slab({ x: s.x + (s.w * i) / STEPS, y: ry, w: s.w / STEPS + 0.5, h: 5 }, 0, tread + 0.34, p.concrete));
    }
  }

  const a = anchorAt('anchor-threshold', s.x + s.w / 2, s.y + s.h / 2, RISE / 2);
  anchors.set('threshold', a);
  g.add(a);
  return g;
}

/* --------------------------------------------------------------- catering */

/**
 * The catering court. The counters themselves are sim walls; this adds the blue
 * LED rope along their fronts and the rows of yellow-orange soup cups on top —
 * `image-1790032625677.webp`, which is the tomato-soup beat already in the venue.
 */
function catering(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'catering';

  for (const key of ['soup', 'sandwich', 'coffee'] as const) {
    const f = GF.food[key];
    g.add(slab({ x: f.x, y: f.y + f.h - 2, w: f.w, h: 2 }, 0.42, 0.06, p.ledBlue));
  }

  const soup = GF.food.soup;
  const perRow = Math.floor((soup.w - 12) / 9);
  const cups = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.09, 0.16, 10),
    p.soupCup,
    perRow * 2,
  );
  cups.name = 'soup-cups';
  const mat = new THREE.Matrix4();
  let i = 0;
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < perRow; k++) {
      mat.makeTranslation(m(soup.x + 6 + k * 9), LOW_H + 0.08, m(soup.y + 9 + row * 12));
      cups.setMatrixAt(i++, mat);
    }
  }
  cups.instanceMatrix.needsUpdate = true;
  g.add(cups);

  // Chafing dishes on the sandwich counter; the pot and ladle are chapter props.
  const s = GF.food.sandwich;
  for (let k = 0; k < 3; k++) {
    g.add(boxAt(s.x + 14 + k * 21, s.y + s.h / 2, 16, 14, LOW_H, 0.18, p.chafingSteel));
  }
  // The high shelf the ladle sits on, above the coffee end of the counter.
  g.add(slab(GF.food.shelf, 1.35, 0.06, p.counterTop));
  return g;
}

/* ------------------------------------------------------------------ booths */

/**
 * THE TWELVE SPONSOR STANDS.
 *
 * Michele, tonight: *"Polishing the graphic, making people and stands real etc."*
 *
 * What was here before: six built booths got a single LED slab laid across the
 * back edge, six half tables got a cloth, and the twelve sponsors' names — which
 * `src/sim/geometry.ts` has carried all along, and which the "why am I blocked"
 * lines already speak — appeared on screen nowhere. From the diorama camera a
 * trade-show floor read as six grey blocks with a stripe and six purple slabs.
 *
 * The references are `media/other-images/image-1790032630885/-637969/-650288/
 * -655131.webp`, and what they say a Devoxx stand is, in the order you read it:
 *
 *  1. **a flat panel of one brand colour with the name on it** — the thing you
 *     read from across the hall, over everybody's heads;
 *  2. **a slim lit totem out in the lane** — the thing you read at head height
 *     when the panel is behind a crowd (the hall shot is full of them);
 *  3. **a pale carpet tile with a white taped edge**, which is what separates a
 *     stand from the aisle more cheaply than any amount of furniture;
 *  4. only then the furniture: a counter, black metal high tables, white tub
 *     stools, a planter.
 *
 * So that is the order this builds them in, and the first three are the ones that
 * are never allowed to be cut.
 *
 * ## Where a mesh is allowed to stand
 *
 * `tests/colliders.test.ts` sweeps every mesh the venue draws and fails any solid
 * a robot can stand inside. The sim's booth slab — the whole 100 x 70 px rect —
 * is this stand's collider and the only one it gets; `src/sim/geometry.ts` is held
 * by another builder tonight, so nothing here may ask for a new one. Therefore:
 *
 *  - anything standing on the floor is **inside the booth's own rect**, or inside
 *    `boothTotem()`/`boothCrate()`, which are colliders already;
 *  - anything outside it is either **flat** (the carpet: top 0.07 m, under the
 *    sweep's 0.15 m floor-plate cut) or **hung** above 0.6 m;
 *  - nothing new stands in an aisle. Michele: *"staircase should be clear of
 *    booths in general"* — the aisles get the same answer.
 *
 * ## Standby, not shop window
 *
 * Constraint 4 of this piece: chapter 2 is an unlit hall with three robot lamps
 * and a visibility polygon, and `media/other-images/image-1790032600128.webp` is
 * what that hall looks like — near-black, red accent panels, track spots, one lit
 * screen. Every printed surface here is re-used as an emissive map so that a stand
 * is not simply *gone* for a whole chapter, but at a fraction of the 0.5 a
 * corridor lightbox gets: 0.05 for a cloth (eight metres of it), 0.08 for a back
 * wall, 0.18-0.22 for a banner or a totem. The first pass used the lightbox value
 * and lit the entire exhibition floor through the blackout.
 *
 * ## Why a built stand is enclosed
 *
 * The sim says a built booth is solid across its whole rect ("a built booth, solid
 * walls"), and a render that shows an open stand you can see straight into would
 * be calling that a lie. So it is built as the kind of stand that IS solid: a back
 * wall, two side returns and a counter closing the front. The counter is 0.95 m
 * rather than the venue's usual `LOW_H` 0.78 on purpose — in this game 0.78 is the
 * height of the `low` walls Voxxy can jump, and a stand front is not one of them.
 */

/** Back wall of a built stand. Taller than a partition: it is the stand's poster. */
const STAND_WALL_H = 3.0;
/** The side returns that make the back wall a stand rather than a hoarding. */
const STAND_RETURN_H = 2.5;
/** How deep the returns run from the back wall, sim px. */
const STAND_RETURN_D = 42;
/** The counter across the front, and the pale top laid on it. */
const STAND_COUNTER_H = 0.88;
const STAND_COUNTER_TOP = 0.1;
/** Depth of the back wall, the returns and the counter, sim px. */
const STAND_T = 5;
const STAND_COUNTER_D = 12;
/** The carpet tile's overhang into the aisle, sim px, and its two layers. */
const CARPET_BLEED = 7;
const CARPET_TOP = 0.045;
const CARPET_EDGE_TOP = 0.075;

/** A sim rect extruded to a world-space geometry, ready for `mergeSimple`. */
function boxGeo(r: Rect, base: number, height: number): THREE.BufferGeometry {
  const h = Math.max(height, 0.01);
  const geo = new THREE.BoxGeometry(m(r.w), h, m(r.h));
  geo.translate(m(r.x + r.w / 2), base + h / 2, m(r.y + r.h / 2));
  return geo;
}

/** One `InstancedMesh`'s worth of a repeated prop: one geometry, many placings. */
class Instanced {
  private readonly at: THREE.Matrix4[] = [];
  constructor(
    private readonly name: string,
    private readonly geo: THREE.BufferGeometry,
    private readonly mat: THREE.MeshStandardMaterial,
  ) {}
  /** Place a copy with its origin on the floor at a sim point. */
  put(simX: number, simY: number, base = 0): void {
    this.at.push(new THREE.Matrix4().makeTranslation(m(simX), base, m(simY)));
  }
  build(): THREE.InstancedMesh | null {
    if (this.at.length === 0) {
      this.geo.dispose();
      return null;
    }
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.at.length);
    mesh.name = this.name;
    this.at.forEach((mat4, i) => mesh.setMatrixAt(i, mat4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** A white tub stool: a seat disc on a pedestal, origin between its feet. */
function stoolGeometry(): THREE.BufferGeometry {
  const seat = new THREE.CylinderGeometry(0.2, 0.19, 0.08, 12);
  seat.translate(0, 0.63, 0);
  const stem = new THREE.CylinderGeometry(0.045, 0.045, 0.6, 8);
  stem.translate(0, 0.32, 0);
  const foot = new THREE.CylinderGeometry(0.17, 0.18, 0.04, 12);
  foot.translate(0, 0.02, 0);
  return mergeSimple([seat, stem, foot]);
}

/**
 * A black metal high table — the single most recognisable object on that floor.
 * Every drone frame has a dozen of them: a thin square tube frame and a dark top.
 */
function highTableGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const top = new THREE.BoxGeometry(0.62, 0.05, 0.62);
  top.translate(0, 1.03, 0);
  parts.push(top);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Array<[number, number]>) {
    const leg = new THREE.BoxGeometry(0.035, 1.03, 0.035);
    leg.translate(sx * 0.28, 0.515, sz * 0.28);
    parts.push(leg);
  }
  return mergeSimple(parts);
}

/** A planter tub, and the grass in it as a separate green instance. */
function planterTubGeometry(): THREE.BufferGeometry {
  const tub = new THREE.BoxGeometry(0.72, 0.46, 0.72);
  tub.translate(0, 0.23, 0);
  return tub;
}
function planterGrassGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [dx, dz, hgt] of [[0, 0, 0.8], [-0.16, 0.1, 0.62], [0.17, -0.09, 0.7], [0.05, 0.18, 0.55]] as Array<[number, number, number]>) {
    const blade = new THREE.BoxGeometry(0.07, hgt, 0.07);
    blade.translate(dx, 0.46 + hgt / 2, dz);
    parts.push(blade);
  }
  return mergeSimple(parts);
}

/** A bowl of giveaways. There is one on every counter at that show. */
function bowlGeometry(): THREE.BufferGeometry {
  const bowl = new THREE.CylinderGeometry(0.17, 0.11, 0.1, 12);
  bowl.translate(0, 0.05, 0);
  return bowl;
}

/** A rubber duck, at the only level of detail a diorama camera resolves. */
function duckGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.11, 10, 8);
  body.scale(1, 0.85, 1.25);
  body.translate(0, 0.1, 0);
  const head = new THREE.SphereGeometry(0.07, 8, 6);
  head.translate(0, 0.21, -0.08);
  const bill = new THREE.BoxGeometry(0.05, 0.03, 0.07);
  bill.translate(0, 0.19, -0.16);
  return mergeSimple([body, head, bill]);
}

function booths(p: VenuePalette, art: SignPainter): THREE.Group {
  const g = new THREE.Group();
  g.name = 'booths';

  // Repeated furniture is instanced across the whole field: the sweep expands an
  // InstancedMesh per instance, so each stool is still measured on its own, and
  // twelve stands' worth of stools costs one draw call rather than twenty-four.
  const stools = new Instanced('booth-stools', stoolGeometry(), p.tubChair);
  const tables = new Instanced('booth-high-tables', highTableGeometry(), p.blackMetal);
  const tubs = new Instanced('booth-planters', planterTubGeometry(), p.planterTub);
  const grass = new Instanced('booth-planter-grass', planterGrassGeometry(), p.planterGreen);
  const bowls = new Instanced('booth-giveaway-bowls', bowlGeometry(), p.duckYellow);
  const ducks = new Instanced('booth-ducks', duckGeometry(), p.duckYellow);
  /** Both carpet layers for all twelve, merged: they are flat, so one mesh is right. */
  const carpet: THREE.BufferGeometry[] = [];
  const carpetEdge: THREE.BufferGeometry[] = [];

  for (const bo of GF.booths) {
    const r: Rect = { x: bo.x, y: bo.y, w: bo.w, h: bo.h };
    // `row * 4 + col` is the order `SPONSORS` is laid out in, so a stand's brand
    // is a pure function of where the plan puts it. No RNG: a screenshot of this
    // hall is the same screenshot tomorrow.
    const idx = bo.row * 4 + bo.col;
    const s = BOOTH_SCHEMES[idx % BOOTH_SCHEMES.length];
    const key = `${bo.col}-${bo.row}`;

    /*
     * The carpet tile, and its white taped edge.
     *
     * It bleeds into the aisle, which is the only thing here that leaves the
     * booth's own rect — allowed because it tops out at 7.5 cm, under the sweep's
     * 0.15 m floor-plate cut, and because a carpet is not something you walk into.
     *
     * The east edge is clamped off `GF.smallStairs`. Column 3 of the booth grid
     * (x 880..980) already overlaps the small staircase (x 952) by 28 px — that is
     * Michele's *"is it a booth? in the middle of the stairs?"*, it is a fix in
     * `geometry.ts`, and `geometry.ts` is held tonight. What this file can do is
     * not make it worse by laying sponsor carpet up the steps.
     */
    const bleedE = Math.min(r.x + r.w + CARPET_BLEED, GF.smallStairs.x);
    const tile: Rect = {
      x: r.x - CARPET_BLEED,
      y: r.y - CARPET_BLEED,
      // For column 3 this clamp cuts 28 px OFF THE BOOTH, not just off the bleed,
      // and it is meant to: the booth is inside the staircase there and the least
      // this file can do is stop short of the steps rather than carpet them.
      w: bleedE - (r.x - CARPET_BLEED),
      h: r.h + CARPET_BLEED * 2,
    };
    carpet.push(boxGeo(tile, CARPET_TOP - 0.04, 0.04));
    const EDGE = 1.6;
    for (const band of [
      { x: tile.x, y: tile.y, w: tile.w, h: EDGE },
      { x: tile.x, y: tile.y + tile.h - EDGE, w: tile.w, h: EDGE },
      { x: tile.x, y: tile.y, w: EDGE, h: tile.h },
      { x: tile.x + tile.w - EDGE, y: tile.y, w: EDGE, h: tile.h },
    ]) {
      carpetEdge.push(boxGeo(band, CARPET_EDGE_TOP - 0.03, 0.03));
    }

    /** Everything of this stand built in the shared dark stand fabric. */
    const dark: THREE.BufferGeometry[] = [];
    /** Everything in the pale counter/shelf fabric. */
    const pale: THREE.BufferGeometry[] = [];

    if (bo.table) {
      /*
       * A HALF TABLE. The cloth covers the whole rect, because the whole rect is
       * what the sim lets Voxxy under ("only something Voxxy-sized goes under the
       * tablecloth"), and the south side is left open because that gap IS the
       * mechanic — do not close it.
       */
      const table = clothTable(r, '+z', p);
      table.name = `booth-table-${key}`;
      g.add(table);

      /*
       * The printed cloth over the top. See `sponsorCloth` for why the top is the
       * surface that has to carry the name on a table stand, and for why
       * `rotation.x = -PI/2` is the right way up for a camera that only ever
       * stands on +z.
       */
      const cloth = new THREE.Mesh(
        new THREE.PlaneGeometry(m(r.w) - 0.02, m(r.h) - 0.02),
        art.material(`booth-cloth-${key}`, 512, 358, s.brand, sponsorCloth(bo.name, s), 0.05),
      );
      cloth.rotation.x = -Math.PI / 2;
      cloth.position.set(m(r.x + r.w / 2), LOW_H + 0.006, m(r.y + r.h / 2));
      cloth.name = `booth-cloth-${key}`;
      cloth.receiveShadow = true;
      g.add(cloth);

      /*
       * The printed valance: a 22 cm band hanging from the table edge across the
       * open side, with half a metre of dark gap still showing under it. A draped
       * table at a trade show always has one, and it is the only surface on a
       * table stand that faces the camera at all.
       */
      const valance = wallPanel(
        r.x + r.w / 2,
        r.y + r.h + 0.4,
        m(r.w) - 0.1,
        0.22,
        0.63,
        1,
        art.material(`booth-skirt-${key}`, 512, 60, s.brand, sponsorSkirt(s), 0.07),
      );
      valance.name = `booth-skirt-${key}`;
      g.add(valance);

      /*
       * The desktop roll-up banner at the back of the table. A table stand carries
       * its name on one of these, not on a wall it has not paid for, and standing
       * it ON the table keeps it inside the collider and out of Voxxy's gap.
       */
      const banner = wallPanel(r.x + 22, r.y + 11, 1.1, 1.75, LOW_H + 0.9, 1,
        art.material(`booth-banner-${key}`, 224, 356, s.brand, sponsorTotem(bo.name, s), 0.18));
      banner.name = `booth-banner-${key}`;
      g.add(banner);
      dark.push(boxGeo({ x: r.x + 18, y: r.y + 11, w: 8, h: 1.6 }, LOW_H, 0.05));

      // On the table: the giveaway bowl, and a standby strip along the cloth edge.
      bowls.put(r.x + r.w - 26, r.y + 26, LOW_H);
      g.add(slab({ x: r.x + 8, y: r.y + r.h - 5, w: r.w - 16, h: 1.4 }, LOW_H - 0.09, 0.05, p.boothStandby));
    } else {
      /*
       * A BUILT STAND: back wall, two returns, a counter closing the front. See
       * the header for why it is closed rather than open.
       */
      dark.push(boxGeo({ x: r.x, y: r.y, w: r.w, h: STAND_T }, 0, STAND_WALL_H));
      for (const rx of [r.x, r.x + r.w - STAND_T]) {
        dark.push(boxGeo({ x: rx, y: r.y, w: STAND_T, h: STAND_RETURN_D }, 0, STAND_RETURN_H));
      }
      const front: Rect = { x: r.x, y: r.y + r.h - STAND_COUNTER_D, w: r.w, h: STAND_COUNTER_D };
      dark.push(boxGeo(front, 0, STAND_COUNTER_H));
      pale.push(boxGeo({ ...front, x: front.x - 0.5, w: front.w + 1 }, STAND_COUNTER_H, STAND_COUNTER_TOP));

      /*
       * The branded back wall itself. The face is a plane held 0.4 px proud of the
       * wall body — two coplanar surfaces is how the entrance got its flicker (see
       * `lobby()`), and one costs nothing to avoid here.
       */
      const panelH = 2.2;
      const face = wallPanel(
        r.x + r.w / 2,
        r.y + STAND_T + 0.4,
        m(r.w) - 0.35,
        panelH,
        0.52 + panelH / 2,
        1,
        art.material(`booth-screen-${key}`, 640, 200, s.brand, sponsorPanel(bo.name, s), 0.08),
      );
      face.name = `booth-screen-${key}`;
      g.add(face);

      // The standby strip along the counter front: the stand's one lit thing in a
      // blackout. Chapter 2 is lit by three robot lamps and nothing else.
      g.add(slab({ x: r.x + 5, y: r.y + r.h - 1.6, w: r.w - 10, h: 1.4 }, 0.68, 0.06, p.boothStandby));

      // The furniture inside: a high table, two stools, a planter, a bowl.
      tables.put(r.x + 34, r.y + 34);
      stools.put(r.x + 22, r.y + 40);
      stools.put(r.x + 46, r.y + 29);
      tubs.put(r.x + r.w - 17, r.y + 18);
      grass.put(r.x + r.w - 17, r.y + 18);
      bowls.put(r.x + r.w - 30, r.y + r.h - 6, STAND_COUNTER_H + STAND_COUNTER_TOP);

      /*
       * The totem in the lane. `boothTotem()` has been a collider since the "this
       * cube is walk-through" round; `wallStyle` no longer draws it as an orange
       * block, because an orange block is exactly what Michele could not identify
       * (*"the orange thing and the big black thing with halo"*). It is a lit
       * pylon with the sponsor's name on it now, which is what those are.
       */
      const t = boothTotem(bo);
      if (t) {
        /*
         * Its own mesh, not merged into the stand's: the totem stands out in the
         * lane, and one merged geometry spanning the stand AND the totem has a
         * bounding box that swallows the aisle between them. The collider sweep
         * measures bounding boxes, so it read that aisle as a drawn solid with no
         * collider — correctly. Six of them, first run.
         */
        const body = slab({ x: t.x, y: t.y, w: t.w, h: t.h - 1 }, 0, 2.1, p.boothWall);
        body.name = `booth-totem-body-${key}`;
        g.add(body);
        const totem = wallPanel(t.x + t.w / 2, t.y + t.h - 0.4, m(t.w) - 0.06, 1.6, 1.18, 1,
          art.material(`booth-totem-${key}`, 192, 384, s.brand, sponsorTotem(bo.name, s), 0.22));
        totem.name = `booth-totem-${key}`;
        g.add(totem);
      }
    }

    /* ------------------------------------------------- the named jokes land */
    switch (bo.name) {
      case 'Rubber Duck Inc':
        // Chapter 3 shuffles a duck across the lane here. A stand stacked with the
        // things is how a player finds out which stand that is.
        for (let k = 0; k < 6; k++) ducks.put(r.x + 12 + (k % 3) * 13, r.y + 34 + Math.floor(k / 3) * 15, LOW_H);
        break;
      case 'Sticker Mine': {
        /*
         * The top shelf, drawn.
         *
         * `ch3-breakfast.ts` gives the holographic sticker to whoever can reach
         * the top of this stand, and only Droid (2.1 m) can — Voxxy is 1.15 and
         * Biggy 1.45. That gate was a line of prose with nothing on screen behind
         * it. Three shelves at 0.62 / 1.24 / 1.92 m say it without a word.
         */
        for (const sy of [0.62, 1.24, 1.92]) {
          pale.push(boxGeo({ x: r.x + r.w - 34, y: r.y + STAND_T, w: 28, h: 7 }, sy, 0.05));
        }
        for (let k = 0; k < 9; k++) {
          const sy = [0.67, 1.29, 1.97][k % 3];
          bowls.put(r.x + r.w - 28 + Math.floor(k / 3) * 9, r.y + STAND_T + 3, sy);
        }
        break;
      }
      case 'Regex Racing': {
        // A chequered apron across the front of the carpet: four metres of it, and
        // the four race markers chapter 3 drops sit just outside it.
        for (let k = 0; k < 10; k++) {
          if (k % 2 === 0) continue;
          carpetEdge.push(boxGeo({ x: r.x + k * (r.w / 10), y: r.y + r.h + 1, w: r.w / 10, h: 5 }, CARPET_EDGE_TOP - 0.03, 0.03));
        }
        break;
      }
      case 'The Coffee Sponsor':
        /*
         * The queue joke, in cups. `soupCup` is already the show's yellow-orange.
         *
         * Anchored to the stand's RIGHT EDGE, not to a fixed 52 px from its left.
         * This is an end-of-row stand, and end-of-row stands were narrowed from
         * 100 px to 60 to get column 3 out of the small staircase — at which point
         * a literal 52 put eight cups in mid-air over a walking lane, with no
         * collider under them. `tests/booths.test.ts` caught it, which is the test
         * doing exactly the job it was written for.
         */
        for (let k = 0; k < 8; k++) {
          g.add(boxAt(r.x + r.w - 44 + (k % 4) * 9, r.y + 30 + Math.floor(k / 4) * 10, 6, 6, LOW_H, 0.14, p.soupCup));
        }
        break;
      case 'Legacy Systems SA':
        // A stack of beige boxes on the counter. It is 2026 and they still ship it.
        for (let k = 0; k < 3; k++) {
          pale.push(boxGeo({ x: r.x + 14 + k * 3, y: r.y + r.h - 10, w: 16, h: 8 }, STAND_COUNTER_H + STAND_COUNTER_TOP + k * 0.14, 0.14));
        }
        break;
      case 'Monolith GmbH':
        // One deployable. One. It does not fit on the table and they brought it
        // anyway. Parked at the back right: in the middle it punched a hole
        // through the sponsor's own name on the cloth.
        dark.push(boxGeo({ x: r.x + r.w - 40, y: r.y + 6, w: 28, h: 24 }, LOW_H, 0.9));
        break;
      default:
        break;
    }

    if (dark.length > 0) {
      const mesh = new THREE.Mesh(mergeSimple(dark), p.boothWall);
      mesh.name = `booth-shell-${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    if (pale.length > 0) {
      const mesh = new THREE.Mesh(mergeSimple(pale), p.counterWhite);
      mesh.name = `booth-counter-${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
  }

  const tiles = new THREE.Mesh(mergeSimple(carpet), p.boothCarpet);
  tiles.name = 'booth-carpet';
  tiles.castShadow = false;
  tiles.receiveShadow = true;
  g.add(tiles);
  const edges = new THREE.Mesh(mergeSimple(carpetEdge), p.boothEdge);
  edges.name = 'booth-carpet-edge';
  edges.castShadow = false;
  edges.receiveShadow = true;
  g.add(edges);

  for (const inst of [stools, tables, tubs, grass, bowls, ducks]) {
    const mesh = inst.build();
    if (mesh) g.add(mesh);
  }
  return g;
}

/* --------------------------------------------------- reception and wardrobe */

/**
 * The reception block: the wardrobe above, the desk below.
 *
 * `media/other-images/image-1790032544510.webp` is the brief for it, and
 * CAPTIONS.md spells the correction out — reception is the one WARM thing on this
 * floor: a wood-slat back wall, a long white counter, cream-shaded table lamps, a
 * big white pendant disc and an orange soffit strip overhead. The counter itself
 * and the wardrobe's hand-in top are sim walls (`wallStyle` gives them the white);
 * everything here is what stands on, behind and above them.
 */
function reception(p: VenuePalette, overhead: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.name = 'reception';
  const r = GF.reception;
  const co = GF.coatroom;

  /*
   * THE WARDROBE IS NOW READ FROM THE WEST, so its dressing turned with it.
   *
   * The hand-in counter moved to the west face (`groundWalls`), which is the only
   * side of this block anybody can stand at. So the wood-slat back wall is the
   * EAST face — the one you see across the room when you look in over the counter
   * — and the coat rails run north-south, down the length of the view, instead of
   * end-on across it.
   */
  g.add(slab({ x: co.x + co.w - T - 5, y: co.y + T, w: 5, h: co.h - 2 * T }, RISE, 2.6, p.wood));
  for (let y = co.y + T + 5; y < co.y + co.h - T; y += 13) {
    g.add(slab({ x: co.x + co.w - T - 2, y, w: 2, h: 4 }, RISE + 0.1, 2.4, p.blackMetal));
  }

  // Coat rails and a thin crowd of hangers, inside the wardrobe.
  for (const rx of [co.x + 40, co.x + 80]) {
    g.add(slab({ x: rx, y: co.y + 14, w: 3, h: co.h - 28 }, RISE + 1.5, 0.05, p.steelRail));
    for (let y = co.y + 18; y < co.y + co.h - 18; y += 7) {
      g.add(slab({ x: rx - 4, y, w: 10, h: 5 }, RISE + 0.72, 0.76, p.coatFabric));
    }
  }

  const printer = slab(GF.printer, RISE + LOW_H, 0.28, p.printerWhite);
  printer.name = 'badge-printer';
  g.add(printer);
  /*
   * Cream-shaded table lamps ALONG THE TWO RUNS, not floating in the middle.
   *
   * The counter is an L and hollow now, so a lamp at the old `r.y + 22` would have
   * stood on open floor inside the desk. Two sit on the south run either side of
   * the printer, one on the west run.
   */
  const southMid = r.y + r.h - COUNTER / 2;
  for (const [lx, ly] of [
    [r.x + 30, southMid],
    [r.x + r.w - 14, southMid],
    [r.x + COUNTER / 2, r.y + 26],
  ] as const) {
    g.add(postAt(lx, ly, 0.03, 0.26, RISE + LOW_H, p.brass, 8));
    g.add(boxAt(lx, ly, 9, 9, RISE + LOW_H + 0.26, 0.2, p.lampWarm));
  }

  // The big white pendant disc and the orange ceiling soffit strip.
  const disc = pendant(r.x + r.w / 2, r.y + 30, 1.5, RISE + 2.6, p.pendantWhite);
  disc.name = 'reception-pendant';
  overhead.add(disc);
  overhead.add(slab({ x: r.x - 26, y: r.y + r.h + 18, w: r.w + 52, h: 10 }, RISE + 3.0, 0.22, p.devoxxOrange));
  return g;
}

/* ------------------------------------------------------------------ stairs */

/**
 * The staircases up to the cinema level: the two secondary flights inside the hall
 * (`GF.stairs`, which come up beside rooms 4 and 9 — see `F1.nicheTop`) and the
 * main staircase beside reception, which is gated until Stephan opens it.
 *
 * The main flight climbs NORTH out of the lobby, so its gate — the only side of it
 * anybody can reach — is at the foot, on the south. All of them stop short of the
 * cinema floor plate: they disappear into the soffit rather than punching through a
 * level the diorama draws separately.
 *
 * ## The secondary flights are inside a box
 *
 * Michele, on chapter 2: *"In devoxx the stairs are not open but look like rooms."*
 * They are rooms. `plans/exhibition-floor-simple.png` draws each secondary stair as
 * a walled shaft with the ascent arrow running away down the middle, a deep landing
 * at the plan-north end — world WEST, by this module's rotation — and **a pair of
 * double doors in each of the shaft's two LONG faces** beside that landing. The
 * shell is `groundWalls()`' job now (it has to be a collider, which was the other
 * half of the same report); what is built here is the flight inside it, the landing
 * floor and both doors.
 *
 * ## Two corrections, 24 Sep 2026
 *
 * *"Just a correction: you put the opening north, but it's on the sides (WEST,
 * EAST). Worth a fix."* — there was one doorway, in the shaft's short west end.
 * There are two now, one per long face (`stairDoors`); counted on the drawing, the
 * short ends carry no door symbol at all. The building's west and east ARE these
 * long faces: the whole floor is rotated 90° (see `src/sim/geometry.ts`'s header).
 *
 * *"I think it's a mid plane between two ramps of stairs"* — the flight is drawn
 * as two ramps with a half-landing between them (`stairRamps`, `stairMidLanding`),
 * not as one unbroken run. The drop is split between the ramps in proportion to
 * their runs so the half-landing comes out level.
 */
function staircases(p: VenuePalette, anchors: Map<number | string, THREE.Object3D>): THREE.Group {
  const g = new THREE.Group();
  g.name = 'staircases';

  for (const s of GF.stairs) {
    const rect: Rect = { x: s.x, y: s.y, w: s.w, h: s.h };
    const mid = stairMidLanding(rect);
    const [lower, upper] = stairRamps(rect);
    const flight = new THREE.Group();
    /*
     * Split the climb by run length so the half-landing comes out level, and hang
     * the group's own origin ON that half-landing: `ground-stair-*` is the handle
     * `tests/venue.smoke.test.ts` takes the flight's height by, and a wrapper
     * sitting at local zero would report the exhibition floor rather than the
     * stair. So the ramps are built relative to `midY` and the group carries it.
     */
    const midY = (STAIR_RISE * lower.w) / (lower.w + upper.w);
    flight.position.y = midY;
    for (const [r, y0, y1] of [
      [lower, 0, -midY],
      [upper, STAIR_RISE - midY, 0],
    ] as const) {
      flight.add(
        stairFlight({
          rect: r,
          topY: y0,
          bottomY: y1,
          // Top of each ramp at its EAST end: you come down heading west, toward
          // the landing and the doors beside it.
          dir: '-x',
          steps: Math.max(3, Math.round((r.w / (lower.w + upper.w)) * 12)),
          tread: p.stairTreadDark,
          nosing: p.stairNosing,
          runs: 2,
          rail: p.steelRail,
        }),
      );
    }
    // The mid plane between the two ramps — Michele's own words for it.
    flight.add(floorSlab(mid, 0, p.stairTreadDark, 0.1));
    flight.name = `ground-stair-${s.to}`;
    g.add(flight);

    // The landing at the foot, and then BOTH doorways: a lintel over each so the
    // mouth reads as a doorway rather than as a hole in a wall, two leaves stood
    // open against the jambs, and the green running-man plate — this is a fire
    // stair. Held 0.4 px off the jamb face: two coplanar surfaces is how the
    // entrance got its flicker (see `lobby()`), and one costs nothing to avoid.
    g.add(floorSlab(stairLanding(rect), 0.02, p.stairTreadDark, 0.1));
    const [north, south] = stairDoors(rect);
    for (const [d, out] of [
      [north, -1],
      [south, 1],
    ] as const) {
      g.add(slab({ x: d.x, y: d.y, w: d.w, h: d.h }, DOOR_H, WALL_H - DOOR_H, p.hallWall));
      for (const lx of [d.x + 1, d.x + d.w - 16]) {
        g.add(slab({ x: lx, y: d.y - out * T, w: 15, h: 5 }, 0, DOOR_H, p.doorLeaf));
      }
      g.add(slab({ x: d.x + d.w / 2 - 7, y: d.y + (out < 0 ? -2.4 : d.h + 0.4), w: 14, h: 2 }, DOOR_H + 0.12, 0.34, p.signGreen));
    }

    const a = anchorAt(`anchor-stair-${s.to}`, s.x + s.w / 2, s.y + s.h / 2);
    anchors.set(`stair-${s.to}`, a);
    g.add(a);
  }

  const ms = GF.mainStair;
  const main = stairFlight({
    rect: { x: ms.x, y: ms.y, w: ms.w, h: ms.h },
    topY: STAIR_RISE,
    bottomY: RISE,
    // Top of the flight at its north edge, descending south to the lobby floor.
    dir: '+z',
    steps: 16,
    tread: p.stairCarpetBlue,
    nosing: p.stairNosing,
    runs: 3,
    rail: p.steelRail,
  });
  main.name = 'ground-stair-main';
  g.add(main);

  // The gate across the foot. Chapter 3 decides when it opens; this is its look.
  const gate = slab(GF.gate, RISE, 1.55, p.steelBlue);
  gate.name = 'main-stair-gate';
  g.add(gate);
  for (let k = 0; k <= 4; k++) {
    g.add(postAt(GF.gate.x + (GF.gate.w * k) / 4, GF.gate.y + T / 2, 0.09, 1.6, RISE, p.steelBlue, 10));
  }

  const a = anchorAt('anchor-stair-main', ms.x + ms.w / 2, ms.y + ms.h / 2, RISE);
  anchors.set('stair-main', a);
  g.add(a);
  return g;
}

/* ----------------------------------------------------------------- the lobby */

/**
 * The lobby — the raised quarter of the ground floor, between the hall's concrete
 * edge and the glazed entrance wall.
 *
 * This is the half of `plans/exhibition-floor.jpg` that reads "Reception / Toilets
 * / BOF Rooms / Main Entrance". The rectangles are all `GF`'s, from Michele's plot;
 * what is added here is the architecture the plan draws on top of them and the
 * dressing `media/other-images/CAPTIONS.md` specifies — the entrance doors and
 * their Devoxx posters, the fixed panes either side of them, the rope-line
 * stanchions, the dark blue columns, the toilet block and the BOF rooms.
 */
function lobby(p: VenuePalette, overhead: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.name = 'lobby';

  /* ---------------- main entrance: the left-hand doors, and fixed panes beyond */

  const e = GF.entrance;
  /*
   * Mullions up the fixed glazing, which the sim carries as two `glass` runs.
   *
   * `MULLION_PROUD` is the second half of the entrance flicker: a mullion is wider
   * and deeper than the pane it frames, but it used to be exactly as TALL, so its
   * cap and the glass's cap were coplanar down the whole facade. A frame standing
   * four centimetres proud of its glass is what a curtain wall actually looks like,
   * and it is also the one thing that makes the two surfaces stop fighting.
   */
  const MULLION_PROUD = 0.04;
  for (const [y0, y1] of [
    [T, e.y],
    [e.y + e.h, H - T],
  ] as Array<[number, number]>) {
    for (let y = y0 + 24; y < y1 - 10; y += 46) {
      g.add(slab({ x: e.x - 1, y, w: e.w + 2, h: 5 }, RISE, SHELL_H + MULLION_PROUD, p.mullion));
    }
  }
  /*
   * The open doors: three bays, each with a leaf swung back into the lobby and a
   * Devoxx poster on it. The mullions between them and the leaves standing open
   * against the reveals are `entranceMullions()` and `entranceLeaves()` in the sim
   * and arrive through the wall loop — Michele, on the last build: *"Entrance
   * walls are still walkable."* They were: this file drew four full-height frames
   * and three door leaves in the one gap the sim leaves open, and none of them
   * existed as far as a robot was concerned.
   */
  const bayH = e.h / ENTRANCE_BAYS;
  for (let k = 0; k < ENTRANCE_BAYS; k++) {
    const y0 = e.y + k * bayH;
    // The transom over the opening, so the doorway reads as a doorway.
    g.add(slab({ x: e.x, y: y0 + 6, w: e.w, h: bayH - 6 }, RISE + DOOR_H, SHELL_H - DOOR_H, p.glazing));
    // The Devoxx poster on the open leaf, at eye height on its hall-facing side.
    // It used to hang in mid-air beside the leaf, on nothing.
    const leaf = entranceLeaves()[k];
    g.add(slab({ x: leaf.x + 2, y: leaf.y + leaf.h - 0.5, w: leaf.w - 4, h: 1.5 }, RISE + 0.7, 1.1, p.devoxxOrange));
  }

  /* -------------------------------------------- the forecourt beyond the glass */

  /*
   * Everything east of the facade is outside: paving, bollards and the dark.
   *
   * **The flicker Michele saw at the entrance was here.** The lobby plate
   * (`buildGround`) ran the full width of the canvas and the paving was laid on top
   * of it — two floor slabs, four hundred sim pixels of overlap, and both of their
   * top faces at exactly `RISE`. Two coplanar surfaces fighting for the same depth
   * value is z-fighting by construction, and at diorama zoom it is the whole
   * forecourt shimmering behind the glass. The plate now stops at the building line
   * (see `buildGround`) and the paving carries the ground from there east, so the
   * two are edge to edge with nothing coplanar between them.
   */
  g.add(floorSlab({ x: e.x + e.w, y: 0, w: W - (e.x + e.w), h: H }, RISE, p.paving, RISE + 0.3));
  // The bollards and the planters out here are sim walls now — a robot can walk
  // out through the open doors, and it used to walk through all nine of them.
  for (const b of FORECOURT_BOLLARDS) {
    g.add(postAt(b.x + b.w / 2, b.y + b.h / 2, 0.22, 0.9, RISE, p.blackMetal, 10));
  }
  for (const r of FORECOURT_PLANTERS) {
    g.add(slab({ x: r.x + 3, y: r.y + 4, w: r.w - 6, h: r.h - 8 }, RISE + 0.5, 0.35, p.boothCloth));
  }

  /* ------------------------------------- the concourse in front of the doors */

  // The dark blue lobby columns and the concourse planters are sim walls now
  // (`LOBBY_COLUMNS` / `LOBBY_PLANTERS` in geometry.ts, drawn by the wall loop):
  // robots used to walk straight through all six of them.
  //
  // Rope-line stanchions funnelling arrivals from the doors past reception. These
  // stay dressing: a velvet rope on a 26 cm post is not something a player expects
  // to be stopped by, and a 4 px collider in the middle of the concourse would be
  // an invisible snag rather than an obstacle.
  for (const st of LOBBY_STANCHIONS) {
    const sx = st.x + st.w / 2;
    const sy = st.y + st.h / 2;
    g.add(postAt(sx, sy, 0.13, 1.0, RISE, p.stanchion, 10));
    g.add(postAt(sx, sy, 0.17, 0.05, RISE + 0.98, p.stanchion, 12));
    g.add(slab({ x: sx - 38, y: sy - 1, w: 38, h: 2 }, RISE + 0.78, 0.05, p.stanchionBelt));
  }
  // The greenery on top of the planters; the timber box under it is a sim wall.
  for (const r of LOBBY_PLANTERS) {
    g.add(slab({ x: r.x + 4, y: r.y + 3, w: r.w - 8, h: r.h - 6 }, RISE + 0.5, 0.35, p.boothCloth));
  }

  /* --------------------------------------------------------------- toilets */

  // The two partitions inside are sim walls (`toiletPartitions()`); this is the
  // tiled back wall and the pictogram.
  const tl = GF.toilets;
  g.add(slab({ x: tl.x + T, y: tl.y + T, w: tl.w - 2 * T, h: 4 }, RISE, WALL_H, p.tiling));
  // The blue pictogram panel beside the doorway, on the lobby side.
  g.add(slab({ x: tl.x + tl.w / 2 - 34, y: tl.y + tl.h - 2, w: 22, h: 2 }, RISE + 1.5, 0.5, p.signBlue));

  /* ------------------------------------------------------------- BOF rooms */

  // Dressed per image-1790032615122.webp: suspended ceiling tiles, a wood-slat
  // wall panel, cloth-draped tables and a projector screen in each room. Michele
  // offers these as usable game space, so they are furnished, not blocked out.
  const b = GF.bof;
  const edges = [0, ...GF.bofSplits, b.w];
  for (let i = 0; i < edges.length - 1; i++) {
    const x0 = b.x + edges[i] + T;
    const x1 = b.x + edges[i + 1];
    const roomW = x1 - x0;
    if (roomW < 20) continue;
    // The projector screen. The slat wall beside it is a sim wall now
    // (`bofSlatWalls()`): it is 2.45 m of wall and it was walk-through.
    g.add(slab({ x: x0 + 6, y: b.y + T + 2, w: roomW - 12, h: 3 }, RISE + 0.75, 1.4, p.audScreen));
    overhead.add(slab({ x: x0 + 4, y: b.y + 4, w: roomW - 8, h: b.h - 8 }, RISE + 2.9, 0.1, p.ceilingTile));
  }
  // The workshop tables. Their rects are `bofTables()` in the sim — they are
  // `low` walls like every other table in the building — and the cloth is drawn
  // inside each one so the skirt is never proud of its own collider.
  for (const t of bofTables()) {
    g.add(slab(t, RISE + LOW_H - 0.06, 0.06, p.boothCloth));
    g.add(slab({ x: t.x, y: t.y + 2, w: t.w, h: 4 }, RISE + 0.02, LOW_H - 0.08, p.boothCloth));
  }
  // The orange Devoxx sign over the BOF block, readable from the concourse.
  g.add(slab({ x: b.x + 20, y: b.y + b.h - 2, w: 120, h: 2 }, RISE + 1.7, 0.55, p.devoxxOrange));
  return g;
}

/* --------------------------------------------------------------------- build */

export function buildGround(
  p: VenuePalette,
  /** The venue's one canvas painter — the twelve sponsor stands print on it. */
  painter: SignPainter,
): GroundBuild {
  const group = new THREE.Group();
  group.name = 'ground';
  const overhead = new THREE.Group();
  overhead.name = 'overhead';
  const anchors = new Map<number | string, THREE.Object3D>();

  // The hall plate at the datum, the lobby plate half a metre above it. The raised
  // plate is thick enough to carry its own riser, so the level change is a solid
  // mass from the hall side rather than a floating sheet.
  // The raised plate stops at the building line: east of it is the forecourt's own
  // paving, and when the two overlapped at the same height they z-fought (see
  // `lobby()`'s forecourt note — Michele's "something is flickering at the
  // entrance").
  const buildingLine = GF.entrance.x + GF.entrance.w;
  group.add(floorSlab({ x: 0, y: 0, w: LOBBY_X, h: H }, 0, p.lobbyFloor, 0.4));
  group.add(floorSlab({ x: LOBBY_X - 6, y: 0, w: buildingLine - LOBBY_X + 6, h: H }, RISE, p.lobbyFloor, RISE + 0.3));
  const hallFloor = floorSlab(GF.hall, 0.005, p.hallFloor, 0.1);
  hallFloor.name = 'hall-floor';
  group.add(hallFloor);
  group.add(floorSlab(GF.food.court, 0.01, p.counterTop, 0.08));
  group.add(floorSlab(GF.bof, RISE + 0.005, p.wood, 0.08));
  group.add(floorSlab(GF.toilets, RISE + 0.005, p.whitePanel, 0.08));
  group.add(floorSlab(GF.mainStair, RISE + 0.005, p.stairCarpetBlue, 0.08));

  for (const w of groundWalls()) {
    if (w.hidden) continue;
    const style = wallStyle(w, p);
    if (!style) continue;
    // `GF.entrance` is 33 px of door-bank DEPTH, which is what the sim needs to
    // stop a robot on the building line. Glass is a pane: draw it thin, on that
    // line, rather than as a two-and-a-half metre block of translucent nothing.
    group.add(slab(w.kind === 'facade' ? { ...w, w: 6 } : w, style.base, style.height, style.mat));
  }

  group.add(threshold(p, anchors));
  group.add(catering(p));
  group.add(booths(p, painter));
  group.add(reception(p, overhead));
  group.add(staircases(p, anchors));

  // The red accent panels down the hall's long walls — the empty-hall
  // photograph's only colour once the lights are off — are `HALL_PANELS` in the
  // sim and come through the wall loop above.
  const h = GF.hall;

  /*
   * THE BREAKER PANEL — the consumer unit on the technical room's back wall.
   *
   * Michele: *"The breaker should be graphical of course."* It was two objects in
   * the same place and neither of them was a breaker panel: a 0.55 m slab drawn
   * here at 1.45 m, and, on top of it, chapter 2's own `breaker` prop, which
   * `scene.ts` drew from the generic `PROPS` table as a 1.5 m box **standing on the
   * floor** — the coloured crate in the corner of the room.
   *
   * It is one object now, split the way the architecture asks: the enclosure, the
   * conduit and the busbar are static venue fabric and live here; the three handles
   * and the standby lamp carry a live sim value and are drawn in `scene.ts` from
   * `GameSnapshot.props`, exactly as the router terminal is. This follows the
   * treatment chapter 1's door override got (`PropSpec.lift` / `.glow`): a control
   * a metre above Droid's head is drawn a metre above Droid's head, and it is lit
   * from its own supply so it can be FOUND in a blackout before it is understood.
   */
  {
    const pa = GF.panel;
    const box = new THREE.Group();
    box.name = 'breaker-panel';
    // The enclosure, proud of the wall, and its darker recessed door.
    box.add(slab(pa, BREAKER_Y, BREAKER_H, p.breakerBox));
    box.add(slab({ x: pa.x + 2, y: pa.y + pa.h - 1, w: pa.w - 4, h: 2 }, BREAKER_Y + 0.06, BREAKER_H - 0.12, p.blackMetal));
    // Conduit down to the floor and along to the router cabinet: the giveaway that
    // this box is where the room's power comes from.
    box.add(slab({ x: pa.x + pa.w / 2 - 2, y: pa.y + pa.h - 2, w: 4, h: 2 }, 0, BREAKER_Y, p.chafingSteel));
    box.add(slab({ x: pa.x + pa.w / 2, y: pa.y + pa.h - 2, w: GF.cabinet.x - pa.x - pa.w / 2, h: 2 }, 0.1, 0.09, p.chafingSteel));
    group.add(box);
  }

  /*
   * Technical room: the network rack the cable comes off.
   *
   * The rack keeps its own builder — it is set dressing with a state the sim does
   * not carry — but it is a collider now (`groundWalls`) and it is 40 sim px taller
   * on its plinth, because from the diorama camera the technical room's south wall
   * is 3.8 m of shell standing in front of a 1.95 m cabinet: Michele's *"cable rack
   * is not visible at all"*. See `RACK_PLINTH`.
   */
  const rack = networkRack(GF.rack, RACK_PLINTH, p);
  rack.name = 'network-rack';
  group.add(rack);
  group.add(slab({ x: GF.rack.x - 3, y: GF.rack.y - 3, w: GF.rack.w + 6, h: GF.rack.h + 6 }, 0, RACK_PLINTH, p.concrete));

  /*
   * The router cabinet, beside the breakers on the same back wall.
   *
   * The carcass and its louvres are static set dressing and belong here; the door
   * leaf and the terminal behind it are NOT — they carry live state out of the
   * sim's snapshot, so `src/render/scene.ts` draws those from `GameSnapshot.props`
   * exactly as it draws the cable. The face is the +y one because that is the side
   * the diorama camera stands on (`src/render/camera.ts`).
   */
  {
    const c = GF.cabinet;
    const cab = new THREE.Group();
    cab.name = 'router-cabinet';
    cab.add(slab(c, 0, CABINET_H, p.rackMetal));
    // A recessed door panel, so the face is not one flat rectangle at diorama zoom.
    cab.add(slab({ x: c.x + 5, y: c.y + c.h - 1, w: c.w - 10, h: 2 }, 0.14, CABINET_H - 0.28, p.blackMetal));
    // Louvre bands across the door, the giveaway that it is full of switch gear.
    for (let i = 0; i < 4; i++) {
      cab.add(slab({ x: c.x + 9, y: c.y + c.h + 0.5, w: c.w - 18, h: 1.5 }, 0.34 + i * 0.3, 0.1, p.chafingSteel));
    }
    // Hinge stiles down both edges of the face.
    for (const hx of [c.x + 3, c.x + c.w - 6]) {
      cab.add(slab({ x: hx, y: c.y + c.h - 0.5, w: 3, h: 2 }, 0.2, CABINET_H - 0.4, p.chafingSteel));
    }
    group.add(cab);
  }

  // Polo & badge store: the roller door is the sim's chapter-2 obstacle; this is
  // the slatted leaf that sells it breaking open.
  const roller = rollerDoor(GF.roller, p);
  roller.name = 'roller-door';
  group.add(roller);

  group.add(lobby(p, overhead));

  // Ceiling ribs around the hall, suggesting the white coffered ceiling without
  // putting a lid on a diorama that is looked into from above.
  for (const rib of [
    { x: h.x, y: h.y, w: h.w, h: 10 },
    { x: h.x, y: h.y + h.h - 10, w: h.w, h: 10 },
    { x: h.x, y: h.y, w: 10, h: h.h },
    { x: h.x + h.w - 10, y: h.y, w: 10, h: h.h },
  ]) {
    overhead.add(slab(rib, 3.25, 0.18, p.concrete));
  }
  group.add(overhead);

  for (const [key, rect] of [
    ['hall', GF.hall],
    ['catering', GF.food.court],
    ['tech', GF.tech],
    ['store', GF.store],
    ['reception', GF.reception],
    ['coatroom', GF.coatroom],
    ['bof', GF.bof],
    ['toilets', GF.toilets],
    ['entrance', GF.entrance],
  ] as Array<[string, Rect]>) {
    const a = anchorAt(`anchor-${key}`, rect.x + rect.w / 2, rect.y + rect.h / 2, baseAt(rect.x));
    anchors.set(key, a);
    group.add(a);
  }

  return { group, anchors, overhead };
}
