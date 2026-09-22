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
 * The scalloped right wall. `GF.openings` already leaves the four gaps; this adds
 * the shallow rounded piers between them that give the wall its name on the plan.
 */
function scallops(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'scalloped-wall';
  const h = GF.hall;
  const x = h.x + h.w - 2;
  for (let y = h.y + 24; y < h.y + h.h; y += 48) {
    if (GF.openings.some(([a, b]) => y > a - 14 && y < b + 14)) continue;
    g.add(postAt(x, y, 0.42, WALL_H, 0, p.concrete, 10));
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

  for (const w of groundWalls()) {
    if (w.hidden) continue;
    const style = wallStyle(w, p);
    if (!style) continue;
    group.add(slab(w, 0, style.height, style.mat));
  }

  group.add(columnGrid(p));
  group.add(scallops(p));
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

  // BOF rooms: a screen flush on each end wall, nothing free-standing that the
  // sim does not also know about.
  for (let k = 0; k < 2; k++) {
    const y = GF.bof.y + 24 + k * 110;
    group.add(slab({ x: GF.bof.x + GF.bof.w - 4, y, w: 3, h: 70 }, 0.7, 1.5, p.audScreen));
  }

  // Main entrance: full-height glazing with the autumn dark behind it.
  const entrance = slab(GF.entrance, 0, SHELL_H, p.glazing);
  entrance.name = 'main-entrance';
  group.add(entrance);
  for (let k = 0; k <= 2; k++) {
    group.add(slab({ x: GF.entrance.x - 1, y: GF.entrance.y + k * 82, w: T + 2, h: 5 }, 0, SHELL_H, p.blackMetal));
  }

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
