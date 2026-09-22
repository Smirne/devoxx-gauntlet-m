/**
 * ground.ts — the exhibition level: the hall with its column grid and scalloped
 * right wall, the walled catering court, the technical room, the polo/badge store
 * with its roller door, twelve sponsor booths, reception, the main staircase with
 * its gate, the BOF rooms, the toilets and the main entrance.
 *
 * Every rectangle comes from `GF` in `src/sim/geometry.ts`; the only numbers typed
 * here are heights, which the plan does not carry, and dressing offsets inside a
 * rectangle the plan does give.
 *
 * Materials follow `media/other-images/CAPTIONS.md`: mid-gray hall carpet under a
 * pale square-column grid, red accent panels on the side walls, a warm reception
 * with a wood-slat back wall and a big white pendant disc, and a catering counter
 * with a blue LED rope and rows of yellow-orange soup cups.
 *
 * Nothing in this file is a collider: the sim owns collision, and anything drawn
 * here that the sim does not know about is kept flat against a real wall or low
 * enough to read as dressing — with the deliberate exception of the hall's column
 * grid, which the floor plan itself draws and which the sense-of-place check wants.
 */

import * as THREE from 'three';

import { H, T, W } from '../../sim/constants';
import { GF, groundWalls } from '../../sim/geometry';
import type { Rect, Wall } from '../../sim/types';
import { m } from '../../sim/units';
import type { VenuePalette } from './materials';
import {
  DOOR_H,
  LOW_H,
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

export interface GroundBuild {
  group: THREE.Group;
  /** Named venue features -> an Object3D on the ground floor. */
  anchors: Map<number | string, THREE.Object3D>;
  /** Everything above head height, so a top-down debug shot can hide it. */
  overhead: THREE.Group;
}

function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

/* ------------------------------------------------------------------- walls */

/** Palette entry and height for a sim wall slab; `null` means "drawn elsewhere". */
function wallStyle(w: Wall, p: VenuePalette): { mat: THREE.MeshStandardMaterial; height: number } | null {
  // Half tables are drawn as cloth-draped tables, not as slabs.
  if (w.booth) return w.booth.table ? null : { mat: p.boothWall, height: BOOTH_H };
  if (w.low) return { mat: p.counterTop, height: LOW_H };
  const isShell =
    (w.w === W && (w.y === 0 || w.y === H - T)) || (w.h === H && (w.x === 0 || w.x === W - T));
  if (isShell) return { mat: p.shell, height: SHELL_H };
  return { mat: p.hallWall, height: WALL_H };
}

/* -------------------------------------------------------------- the hall */

/**
 * The structural column grid. The plan draws it at a regular 160 x 140 sim-pixel
 * pitch — the same pitch the prototype's booth grid uses — so the grid is phased
 * half a bay off the booths, which is how a real hall is dressed: the booths are
 * built in the bays and the columns stand in the walking lanes between them.
 */
function columnGrid(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'column-grid';
  const h = GF.hall;
  const solids: Rect[] = [
    GF.food.court,
    GF.tech,
    GF.store,
    GF.toilets,
    ...GF.stairs.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
    ...GF.booths.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
  ];
  for (let x = h.x + 190; x < h.x + h.w; x += 160) {
    for (let y = h.y + 110; y < h.y + h.h; y += 140) {
      const foot: Rect = { x: x - 7, y: y - 7, w: 14, h: 14 };
      if (solids.some((s) => overlaps(foot, s, 6))) continue;
      g.add(boxAt(x, y, 14, 14, 0, SHELL_H, p.concrete));
    }
  }
  return g;
}

/**
 * The hall's right wall: a **bank of glazed doors**, which is what "scalloped"
 * means on the plan.
 *
 * `plans/exhibition-floor-stairs-annotated.png` draws that wall as a continuous
 * row of about twelve door-swing arcs — it is scalloped because it is a dozen door
 * leaves, not because it has bumps. This used to be drawn as a flat slab modulated
 * by six sim units (five screen pixels), which survived neither the diorama camera
 * nor a plan overlay, and the four openings the sim leaves in it were invisible.
 *
 * So each solid run of wall becomes alternating door bays: a glazed leaf set back
 * `BAY_RECESS` into the hall between aluminium mullions, with reveals either side.
 * The four openings the sim leaves are drawn as bays whose leaves stand open, so
 * the way through to the lobby is visible as well as walkable.
 */
const BAY_PITCH = 50;
const BAY_LEAF = 40;
const BAY_RECESS = 25;

function doorBank(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'scalloped-wall';
  const h = GF.hall;
  const x = h.x + h.w;

  /** A recessed glazed bay between two mullions, running y0..y1. */
  const bay = (y0: number, y1: number, open: boolean): void => {
    const leaf: Rect = { x: x - BAY_RECESS, y: y0, w: T, h: y1 - y0 };
    if (open) {
      // Both leaves swung back into the hall, flat against the reveals.
      for (const at of [y0 + 2, y1 - 8]) {
        const d = slab({ x: x - BAY_RECESS, y: at, w: BAY_RECESS - 2, h: 6 }, 0, DOOR_H, p.doorLeaf);
        g.add(d);
      }
      g.add(slab({ x: x - BAY_RECESS, y: y0, w: BAY_RECESS, h: y1 - y0 }, 0, 0.04, p.concrete));
    } else {
      g.add(slab(leaf, 0, DOOR_H, p.doorLeaf));
      g.add(slab({ x: leaf.x, y: y0, w: T, h: y1 - y0 }, DOOR_H, WALL_H - DOOR_H, p.mullion));
      // Reveals: the short returns from the recessed leaf back to the wall line.
      for (const ry of [y0 - 1, y1 - 5]) {
        g.add(slab({ x: x - BAY_RECESS, y: ry, w: BAY_RECESS, h: 6 }, 0, WALL_H, p.hallWall));
      }
    }
    // The mullion that closes the bay on its far side.
    g.add(slab({ x: x - 2, y: y1, w: T + 4, h: BAY_PITCH - BAY_LEAF }, 0, WALL_H, p.mullion));
  };

  // Walk the wall top to bottom, cutting it into runs at the sim's own openings.
  const stops: Array<[number, number, boolean]> = [];
  let y: number = h.y;
  for (const [a, b] of GF.openings) {
    if (a > y) stops.push([y, a, false]);
    stops.push([a, b, true]);
    y = b;
  }
  if (y < h.y + h.h) stops.push([y, h.y + h.h, false]);

  for (const [y0, y1, open] of stops) {
    if (open) {
      bay(y0 + 2, y1 - 2, true);
      continue;
    }
    // Pier at the very start of the run, then as many full bays as fit.
    let yy = y0;
    g.add(slab({ x: x - 2, y: yy, w: T + 4, h: Math.min(10, y1 - yy) }, 0, WALL_H, p.mullion));
    yy += 10;
    while (yy + BAY_LEAF <= y1) {
      bay(yy, yy + BAY_LEAF, false);
      yy += BAY_PITCH;
    }
    if (yy < y1) g.add(slab({ x: x - 2, y: yy, w: T + 4, h: y1 - yy }, 0, WALL_H, p.mullion));
  }
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

/* --------------------------------------------------------------- reception */

function reception(p: VenuePalette, overhead: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.name = 'reception';
  const r = GF.reception;

  // Wood-slat back wall behind the counter — image-1790032544510.webp.
  const back: Rect = { x: r.x - 10, y: r.y - 26, w: r.w + 20, h: 8 };
  g.add(slab(back, 0, 2.7, p.wood));
  for (let x = back.x + 6; x < back.x + back.w; x += 14) {
    g.add(slab({ x, y: back.y - 2, w: 4, h: 2 }, 0.1, 2.5, p.blackMetal));
  }

  const printer = slab(GF.printer, LOW_H, 0.28, p.printerWhite);
  printer.name = 'badge-printer';
  g.add(printer);
  for (let k = 0; k < 3; k++) g.add(boxAt(r.x + 60 + k * 60, r.y + 14, 8, 8, LOW_H, 0.3, p.lampWarm));

  // The big white pendant disc and the orange ceiling soffit strip.
  const disc = pendant(r.x + r.w / 2, r.y + 30, 1.5, 3.1, p.pendantWhite);
  disc.name = 'reception-pendant';
  overhead.add(disc);
  overhead.add(slab({ x: r.x - 20, y: r.y - 40, w: r.w + 40, h: 10 }, 3.0, 0.22, p.devoxxOrange));
  return g;
}

/* ------------------------------------------------------------------ stairs */

/**
 * The three staircases up to the cinema level: the two secondary flights inside
 * the hall (`GF.stairs`, which land in the corridor niches between 3|4 and 10|9)
 * and the main staircase by reception, which is gated until Stephan opens it.
 *
 * All three stop short of the cinema floor plate: the flights disappear into the
 * soffit rather than punching through a level the diorama draws separately.
 */
function staircases(p: VenuePalette, anchors: Map<number | string, THREE.Object3D>): THREE.Group {
  const g = new THREE.Group();
  g.name = 'staircases';

  for (const s of GF.stairs) {
    const rect: Rect = { x: s.x, y: s.y, w: s.w, h: s.h };
    const flight = stairFlight({
      rect,
      topY: STAIR_RISE,
      bottomY: 0,
      dir: '+x',
      steps: 14,
      tread: p.stairTreadDark,
      nosing: p.stairNosing,
      runs: 2,
      rail: p.steelRail,
    });
    flight.name = `ground-stair-${s.to}`;
    g.add(flight);
    const a = anchorAt(`anchor-stair-${s.to}`, s.x + s.w / 2, s.y + s.h / 2);
    anchors.set(`stair-${s.to}`, a);
    g.add(a);
  }

  const ms = GF.mainStair;
  const main = stairFlight({
    rect: { x: ms.x, y: ms.y, w: ms.w, h: ms.h },
    topY: STAIR_RISE,
    bottomY: 0,
    dir: '-x',
    steps: 16,
    tread: p.stairCarpetBlue,
    nosing: p.stairNosing,
    runs: 3,
    rail: p.steelRail,
  });
  main.name = 'ground-stair-main';
  g.add(main);

  // The gate on the hall side. Chapter 3 decides when it opens; this is its look.
  const gate = slab(GF.gate, 0, 1.55, p.steelBlue);
  gate.name = 'main-stair-gate';
  g.add(gate);
  for (let k = 0; k <= 4; k++) {
    g.add(postAt(GF.gate.x + T / 2, GF.gate.y + (GF.gate.h * k) / 4, 0.09, 1.6, 0, p.steelBlue, 10));
  }

  const a = anchorAt('anchor-stair-main', ms.x + ms.w / 2, ms.y + ms.h / 2);
  anchors.set('stair-main', a);
  g.add(a);
  return g;
}


/* ----------------------------------------------------------------- the lobby */

/**
 * The lobby band — the east quarter of the ground floor, between the hall's door
 * bank and the main entrance.
 *
 * This is the half of `plans/exhibition-floor-stairs-annotated.png` that reads
 * "Reception / Toilets / BOF Rooms / Main Entrance", and it used to be bare grey
 * deck: from sim x 1560 to the east wall there was not one wall, door, pane of
 * glass or stanchion, only three cylinder people standing on a floor plate. The
 * rectangles are all `GF`'s; what is added here is the architecture the plan draws
 * on top of them and the dressing `media/other-images/CAPTIONS.md` specifies —
 * the entrance door row and its Devoxx posters, the rope-line stanchions, the
 * dark blue columns, the wheelchair ramp, the toilet block and the BOF rooms.
 */
function lobby(p: VenuePalette, overhead: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.name = 'lobby';

  /* -------- main entrance: a glazed facade with a row of doors in the middle */

  const e = GF.entrance;
  const FACADE_Y0 = 150;
  const FACADE_Y1 = 620;
  // Full-height glazing either side of the door row — image-1790032684113.webp.
  for (const [y0, y1] of [
    [FACADE_Y0, e.y],
    [e.y + e.h, FACADE_Y1],
  ] as Array<[number, number]>) {
    g.add(slab({ x: e.x - 4, y: y0, w: T + 4, h: y1 - y0 }, 0, SHELL_H, p.glazing));
    for (let y = y0 + 20; y < y1 - 10; y += 46) {
      g.add(slab({ x: e.x - 5, y, w: T + 6, h: 5 }, 0, SHELL_H, p.mullion));
    }
  }
  // The door row itself: four bays of paired leaves, scalloped like the plan's
  // entrance arcs, with a Devoxx poster on each leaf.
  const bays = 4;
  const bayH = e.h / bays;
  for (let k = 0; k < bays; k++) {
    const y0 = e.y + k * bayH;
    g.add(slab({ x: e.x - 5, y: y0, w: T + 6, h: 6 }, 0, SHELL_H, p.mullion));
    g.add(slab({ x: e.x - 18, y: y0 + 7, w: 16, h: bayH - 14 }, 0, DOOR_H, p.doorLeaf));
    g.add(slab({ x: e.x - 19, y: y0 + 7, w: 18, h: bayH - 14 }, DOOR_H, SHELL_H - DOOR_H, p.glazing));
    // Devoxx door poster, on the inside face of each leaf.
    g.add(slab({ x: e.x - 20, y: y0 + bayH / 2 - 9, w: 2, h: 18 }, 0.5, 1.1, p.devoxxOrange));
  }
  g.add(slab({ x: e.x - 5, y: e.y + e.h - 6, w: T + 6, h: 6 }, 0, SHELL_H, p.mullion));
  // Bollards outside, and the bright autumn beyond the glass.
  for (let k = 0; k < 5; k++) g.add(postAt(e.x + 4, e.y - 30 + k * 60, 0.22, 0.9, 0, p.blackMetal, 10));

  /* ------------------------------- the concourse in front of the door row */

  // Dark blue lobby columns — image-1790032582765.webp.
  for (const cx of [1620, 1760]) {
    for (const cy of [330, 470, 610]) g.add(boxAt(cx, cy, 22, 22, 0, SHELL_H, p.lobbyColumn));
  }
  // Rope-line stanchions funnelling arrivals from the doors toward reception.
  for (const [sx, sy] of [
    [1800, 320],
    [1720, 340],
    [1640, 360],
    [1560, 380],
    [1800, 570],
    [1720, 560],
    [1640, 545],
    [1560, 530],
  ] as Array<[number, number]>) {
    g.add(postAt(sx, sy, 0.13, 1.0, 0, p.stanchion, 10));
    g.add(postAt(sx, sy, 0.17, 0.05, 0.98, p.stanchion, 12));
    g.add(slab({ x: sx - 38, y: sy - 1, w: 38, h: 2 }, 0.78, 0.05, p.stanchionBelt));
  }
  // Planters along the concourse.
  for (const [sx, sy] of [
    [1690, 250],
    [1690, 660],
  ] as Array<[number, number]>) {
    g.add(boxAt(sx, sy, 60, 24, 0, 0.5, p.wood));
    g.add(boxAt(sx, sy, 52, 18, 0.5, 0.35, p.boothCloth));
  }

  /* ---------------------------------------------- the wheelchair access ramp */

  // The plan labels it between the hall's door bank and the main staircase.
  const ramp: Rect = { x: 1180, y: 250, w: 86, h: 74 };
  for (let k = 0; k < 6; k++) {
    g.add(slab({ x: ramp.x + (k * ramp.w) / 6, y: ramp.y, w: ramp.w / 6 + 1, h: ramp.h }, 0, 0.06 + k * 0.03, p.concrete));
  }
  for (const ry of [ramp.y - 3, ramp.y + ramp.h - 3]) {
    g.add(slab({ x: ramp.x, y: ry, w: ramp.w, h: 4 }, 0.2, 0.9, p.steelRail));
  }

  /* --------------------------------------------------------------- toilets */

  const tl = GF.toilets;
  for (let k = 1; k < 3; k++) {
    g.add(slab({ x: tl.x + (k * tl.w) / 3, y: tl.y + 8, w: 3, h: tl.h - 40 }, 0, 1.9, p.tiling));
  }
  g.add(slab({ x: tl.x + 8, y: tl.y + 6, w: tl.w - 16, h: 4 }, 0, WALL_H, p.tiling));
  // The blue pictogram panel over the doorway, on the lobby side.
  g.add(slab({ x: tl.x + tl.w / 2 - 22, y: tl.y + tl.h + T, w: 44, h: 2 }, 1.5, 0.5, p.signBlue));

  /* ------------------------------------------------------------- BOF rooms */

  // Dressed per image-1790032615122.webp: suspended ceiling tiles, a wood-slat
  // wall panel, cloth-draped tables and a projector screen in each room.
  const b = GF.bof;
  const edges = [0, ...GF.bofSplits, b.w];
  for (let i = 0; i < edges.length - 1; i++) {
    const x0 = b.x + edges[i] + T;
    const x1 = b.x + edges[i + 1];
    const roomW = x1 - x0;
    if (roomW < 20) continue;
    g.add(slab({ x: x0 + 6, y: b.y + 5, w: roomW - 12, h: 3 }, 0.75, 1.4, p.audScreen));
    g.add(slab({ x: x0 + 2, y: b.y + 12, w: 4, h: b.h - 30 }, 0, WALL_H, p.wood));
    for (let r = 0; r < 2; r++) {
      const t: Rect = { x: x0 + 12, y: b.y + 70 + r * 56, w: roomW - 24, h: 22 };
      g.add(slab(t, LOW_H - 0.06, 0.06, p.boothCloth));
      g.add(slab({ x: t.x, y: t.y + 2, w: t.w, h: 4 }, 0.02, LOW_H - 0.08, p.boothCloth));
    }
    overhead.add(slab({ x: x0 + 4, y: b.y + 4, w: roomW - 8, h: b.h - 8 }, 2.9, 0.1, p.ceilingTile));
  }
  // The orange Devoxx sign over the BOF block, readable from the concourse.
  g.add(slab({ x: b.x + 20, y: b.y + b.h + T, w: 120, h: 2 }, 1.7, 0.55, p.devoxxOrange));
  return g;
}

/* --------------------------------------------------------------------- build */

export function buildGround(p: VenuePalette): GroundBuild {
  const group = new THREE.Group();
  group.name = 'ground';
  const overhead = new THREE.Group();
  overhead.name = 'overhead';
  const anchors = new Map<number | string, THREE.Object3D>();

  // Lobby floor over the whole level, then the hall's own carpet on top of it.
  group.add(floorSlab({ x: 0, y: 0, w: W, h: H }, 0, p.lobbyFloor, 0.4));
  const hallFloor = floorSlab(GF.hall, 0.005, p.hallFloor, 0.1);
  hallFloor.name = 'hall-floor';
  group.add(hallFloor);
  group.add(floorSlab(GF.food.court, 0.01, p.counterTop, 0.08));
  group.add(floorSlab(GF.bof, 0.01, p.wood, 0.08));
  group.add(floorSlab(GF.toilets, 0.01, p.whitePanel, 0.08));

  const hallRightX = GF.hall.x + GF.hall.w;
  for (const w of groundWalls()) {
    if (w.hidden) continue;
    // The hall's right wall is drawn as a door bank, leaf by leaf; its sim slabs
    // are colliders only.
    if (w.x === hallRightX && w.w === T) continue;
    const style = wallStyle(w, p);
    if (!style) continue;
    group.add(slab(w, 0, style.height, style.mat));
  }

  group.add(columnGrid(p));
  group.add(doorBank(p));
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

  // Technical room: breakers mounted high, network rack on the floor.
  const breakers = slab(GF.panel, 1.45, 0.55, p.breakerBox);
  breakers.name = 'breaker-panel';
  group.add(breakers);
  const rack = networkRack(GF.rack, 0, p);
  rack.name = 'network-rack';
  group.add(rack);

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
    ['bof', GF.bof],
    ['toilets', GF.toilets],
    ['entrance', GF.entrance],
  ] as Array<[string, Rect]>) {
    const a = anchorAt(`anchor-${key}`, rect.x + rect.w / 2, rect.y + rect.h / 2);
    anchors.set(key, a);
    group.add(a);
  }

  return { group, anchors, overhead };
}
