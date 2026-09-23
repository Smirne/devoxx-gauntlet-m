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
  GF,
  LOBBY_PLANTERS,
  LOBBY_RISE_M,
  groundWalls,
  stairDoor,
  stairFlightRect,
  stairLanding,
} from '../../sim/geometry';
import type { Rect, Wall } from '../../sim/types';
import { m } from '../../sim/units';
import type { VenuePalette } from './materials';
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
  postAt,
  rollerDoor,
  slab,
  stairFlight,
} from './props';

/** Built sponsor booths stand a head taller than a partition; tables are `low`. */
const BOOTH_H = 2.4;
/** How far the visible part of a staircase climbs before the ceiling swallows it. */
const STAIR_RISE = 5;
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
  // Half tables are drawn as cloth-draped tables, not as slabs.
  if (w.booth) return w.booth.table ? null : { mat: p.boothWall, height: BOOTH_H, base: 0 };
  // Drawn by their own builders further down: the 19-inch rack, the flight inside
  // a stair shaft (the sim carries it as a wall because nothing climbs).
  if (w.kind === 'rack' || w.kind === 'stair-foot') return null;
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

function booths(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'booths';
  for (const bo of GF.booths) {
    const rect: Rect = { x: bo.x, y: bo.y, w: bo.w, h: bo.h };
    if (bo.table) {
      // A half table: cloth on three sides, open toward the lane below it. That
      // open side is the gap the sim gives Voxxy and nobody else.
      const table = clothTable(rect, '+z', p);
      table.name = `booth-table-${bo.col}-${bo.row}`;
      g.add(table);
      g.add(boxAt(bo.x + bo.w / 2, bo.y - 14, 18, 18, 0, 1.05, p.blackMetal));
    } else {
      // A built booth: the sim's slab carries the walls, so this is the back-wall
      // LED and the totem that make it read as a stand rather than a block.
      const led = slab({ x: bo.x + 6, y: bo.y - 2, w: bo.w - 12, h: 3 }, 0.9, 1.5, p.boothScreen);
      led.name = `booth-screen-${bo.col}-${bo.row}`;
      g.add(led);
      g.add(boxAt(bo.x + bo.w - 8, bo.y + bo.h + 12, 10, 10, 0, 2.1, p.devoxxOrange));
    }
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

  // The wood-slat back wall: the wardrobe's own north face, seen over the counter
  // and over the desk from the diorama camera.
  g.add(slab({ x: co.x + T, y: co.y + T, w: co.w - 2 * T, h: 5 }, RISE, 2.6, p.wood));
  for (let x = co.x + T + 5; x < co.x + co.w - T; x += 13) {
    g.add(slab({ x, y: co.y + T - 2, w: 4, h: 2 }, RISE + 0.1, 2.4, p.blackMetal));
  }

  // Coat rails and a thin crowd of hangers, inside the wardrobe.
  for (const ry of [co.y + 34, co.y + 74]) {
    g.add(slab({ x: co.x + 14, y: ry, w: co.w - 28, h: 3 }, RISE + 1.5, 0.05, p.steelRail));
    for (let x = co.x + 18; x < co.x + co.w - 18; x += 7) {
      g.add(slab({ x, y: ry - 4, w: 5, h: 10 }, RISE + 0.72, 0.76, p.coatFabric));
    }
  }

  const printer = slab(GF.printer, RISE + LOW_H, 0.28, p.printerWhite);
  printer.name = 'badge-printer';
  g.add(printer);
  // Cream-shaded table lamps along the counter.
  for (let k = 0; k < 3; k++) {
    const lx = r.x + 22 + k * 42;
    g.add(postAt(lx, r.y + 22, 0.03, 0.26, RISE + LOW_H, p.brass, 8));
    g.add(boxAt(lx, r.y + 22, 9, 9, RISE + LOW_H + 0.26, 0.2, p.lampWarm));
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
 * (`GF.stairs`, which land in the corridor niches between 3|4 and 10|9) and the
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
 * a walled shaft with a pair of doors in its plan-north end — world WEST, by this
 * module's rotation — and the ascent arrow running away from them, so the flight
 * climbs eastward and the landing is behind the doors. The shell is `groundWalls()`'
 * job now (it has to be a collider, which was the other half of the same report);
 * what is built here is the flight inside it, the landing floor and the doors.
 */
function staircases(p: VenuePalette, anchors: Map<number | string, THREE.Object3D>): THREE.Group {
  const g = new THREE.Group();
  g.name = 'staircases';

  for (const s of GF.stairs) {
    const rect: Rect = { x: s.x, y: s.y, w: s.w, h: s.h };
    const flight = stairFlight({
      rect: stairFlightRect(rect),
      topY: STAIR_RISE,
      bottomY: 0,
      // Top of the flight at its EAST end: you come down heading west, and step
      // out of the doors in the west face.
      dir: '-x',
      steps: 12,
      tread: p.stairTreadDark,
      nosing: p.stairNosing,
      runs: 2,
      rail: p.steelRail,
    });
    flight.name = `ground-stair-${s.to}`;
    g.add(flight);

    // The landing behind the doors, and a lintel over them so the mouth reads as a
    // doorway rather than as a hole in a wall.
    const d = stairDoor(rect);
    g.add(floorSlab(stairLanding(rect), 0.02, p.stairTreadDark, 0.1));
    g.add(slab({ x: d.x, y: d.y, w: d.w, h: d.h }, DOOR_H, WALL_H - DOOR_H, p.hallWall));
    // Two leaves standing open against the jambs, pushed back into the shaft.
    for (const ly of [d.y + 1, d.y + d.h - 6]) {
      g.add(slab({ x: d.x + T, y: ly, w: 15, h: 5 }, 0, DOOR_H, p.doorLeaf));
    }
    // The green running-man plate over the doors — this is a fire stair.
    // Held 0.4 px off the jamb face: two coplanar surfaces is how the entrance
    // got its flicker (see `lobby()`), and one costs nothing to avoid here.
    g.add(slab({ x: d.x - 2.4, y: d.y + d.h / 2 - 7, w: 2, h: 14 }, DOOR_H + 0.12, 0.34, p.signGreen));

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
  // The open doors: three bays of paired leaves, swung back into the lobby, with a
  // Devoxx poster on each leaf.
  const bays = 3;
  const bayH = e.h / bays;
  for (let k = 0; k < bays; k++) {
    const y0 = e.y + k * bayH;
    g.add(slab({ x: e.x - 1, y: y0, w: e.w + 2, h: 6 }, RISE, SHELL_H, p.mullion));
    // The transom over the opening, so the doorway reads as a doorway.
    g.add(slab({ x: e.x, y: y0 + 6, w: e.w, h: bayH - 6 }, RISE + DOOR_H, SHELL_H - DOOR_H, p.glazing));
    // A leaf standing open against the reveal, on the lobby side.
    g.add(slab({ x: e.x - 17, y: y0 + 8, w: 16, h: 5 }, RISE, DOOR_H, p.doorLeaf));
    g.add(slab({ x: e.x - 18, y: y0 + bayH / 2 - 9, w: 2, h: 18 }, RISE + 0.5, 1.1, p.devoxxOrange));
  }
  g.add(slab({ x: e.x - 1, y: e.y + e.h - 6, w: e.w + 2, h: 6 }, RISE, SHELL_H, p.mullion));

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
  for (let k = 0; k < 7; k++) g.add(postAt(e.x + e.w + 26, 120 + k * 78, 0.22, 0.9, RISE, p.blackMetal, 10));
  for (const [sx, sy] of [
    [e.x + e.w + 70, 300],
    [e.x + e.w + 70, 600],
  ] as Array<[number, number]>) {
    g.add(boxAt(sx, sy, 26, 70, RISE, 0.5, p.concrete));
    g.add(boxAt(sx, sy, 20, 62, RISE + 0.5, 0.35, p.boothCloth));
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
  for (const [sx, sy] of [
    [1440, 604],
    [1370, 596],
    [1300, 588],
    [1230, 580],
  ] as Array<[number, number]>) {
    g.add(postAt(sx, sy, 0.13, 1.0, RISE, p.stanchion, 10));
    g.add(postAt(sx, sy, 0.17, 0.05, RISE + 0.98, p.stanchion, 12));
    g.add(slab({ x: sx - 38, y: sy - 1, w: 38, h: 2 }, RISE + 0.78, 0.05, p.stanchionBelt));
  }
  // The greenery on top of the planters; the timber box under it is a sim wall.
  for (const r of LOBBY_PLANTERS) {
    g.add(slab({ x: r.x + 4, y: r.y + 3, w: r.w - 8, h: r.h - 6 }, RISE + 0.5, 0.35, p.boothCloth));
  }

  /* --------------------------------------------------------------- toilets */

  const tl = GF.toilets;
  for (let k = 1; k < 3; k++) {
    g.add(slab({ x: tl.x + (k * tl.w) / 3, y: tl.y + T, w: 3, h: tl.h - 34 }, RISE, 1.9, p.tiling));
  }
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
    g.add(slab({ x: x0 + 6, y: b.y + T + 2, w: roomW - 12, h: 3 }, RISE + 0.75, 1.4, p.audScreen));
    g.add(slab({ x: x0 + 2, y: b.y + 18, w: 4, h: b.h - 40 }, RISE, WALL_H, p.wood));
    for (let r = 0; r < 2; r++) {
      const t: Rect = { x: x0 + 10, y: b.y + 54 + r * 42, w: roomW - 20, h: 20 };
      g.add(slab(t, RISE + LOW_H - 0.06, 0.06, p.boothCloth));
      g.add(slab({ x: t.x, y: t.y + 2, w: t.w, h: 4 }, RISE + 0.02, LOW_H - 0.08, p.boothCloth));
    }
    overhead.add(slab({ x: x0 + 4, y: b.y + 4, w: roomW - 8, h: b.h - 8 }, RISE + 2.9, 0.1, p.ceilingTile));
  }
  // The orange Devoxx sign over the BOF block, readable from the concourse.
  g.add(slab({ x: b.x + 20, y: b.y + b.h - 2, w: 120, h: 2 }, RISE + 1.7, 0.55, p.devoxxOrange));
  return g;
}

/* --------------------------------------------------------------------- build */

export function buildGround(p: VenuePalette): GroundBuild {
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
  group.add(booths(p));
  group.add(reception(p, overhead));
  group.add(staircases(p, anchors));

  // Red accent panels down the hall's long walls — the empty-hall photograph's
  // only colour once the lights are off.
  const h = GF.hall;
  for (let k = 0; k < 4; k++) {
    const x = h.x + 120 + k * 230;
    group.add(slab({ x, y: h.y + 1, w: 90, h: 2 }, 0.4, 2, p.redPanel));
    group.add(slab({ x, y: h.y + h.h - 3, w: 90, h: 2 }, 0.4, 2, p.redPanel));
  }

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
   * `GameSnapshot.props`, exactly as the cam-lock wheel is. This follows the
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
   * The carcass and its louvres are static set dressing and belong here; the
   * cam-lock wheel bolted to its south face is NOT — it carries a live angle out of
   * the sim's snapshot, so `src/render/scene.ts` draws that from `GameSnapshot.props`
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
  group.add(slab({ x: GF.store.x + 10, y: GF.store.y + 6, w: GF.store.w - 20, h: 8 }, 0, 1.9, p.wood));

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
