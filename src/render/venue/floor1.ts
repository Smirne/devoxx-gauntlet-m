/**
 * floor1.ts — the cinema level: corridor, both rows of auditoriums, the curved
 * foyer with its bar and glass kiosk, the fire door, both secondary-staircase
 * niches and the main staircase.
 *
 * **Every** coordinate comes from `src/sim/geometry.ts`. Nothing in this file
 * invents a plan position, because that module is what makes the Stage 1 overlay
 * check a property of the data rather than of the drawing code: rooms 3, 4, 5, 6
 * along the bottom and 10, 9, 8, 7 along the top, the secondary staircases in the
 * corridor walls between 3|4 and 10|9, and the main staircase at the corridor's
 * end between 6 and 7.
 *
 * Materials and dressing follow `media/other-images/CAPTIONS.md`: dark navy
 * carpet, charcoal walls, square dark columns with pale vaults springing off them,
 * orange backlit poster boxes as the only warm accent, and the blue-carpeted main
 * staircase split into three runs under its white tensile canopy.
 */

import * as THREE from 'three';

import { H, T, W } from '../../sim/constants';
import { CY0, CY1, DOOR, F1, floor1Walls, roomDoor, rooms } from '../../sim/geometry';
import type { Rect, RoomDef, Wall } from '../../sim/types';
import { m } from '../../sim/units';
import type { VenuePalette } from './materials';
import {
  DOOR_H,
  GLASS_H,
  LOW_H,
  SHELL_H,
  WALL_H,
  anchorAt,
  boxAt,
  floorSlab,
  pendant,
  postAt,
  seatGeometry,
  slab,
  stairFlight,
  tensileTree,
} from './props';

/* ------------------------------------------------------- auditorium layout */

/**
 * The two aisles, as fractions of a room's width. Taken from the prototype's
 * keynote room (`K.A8 = [[r8.x+90, r8.x+140], [r8.x+235, r8.x+285]]` with room 8
 * 375 px wide), so chapter 4's aisle logic and the modelled aisles line up.
 */
const AISLES: ReadonlyArray<readonly [number, number]> = [
  [90 / 375, 140 / 375],
  [235 / 375, 285 / 375],
];
/** Seat block extent, measured from the screen wall — design doc: "seat blocks y 140–270". */
const SEAT_FRONT_PX = 70;
const SEAT_BACK_PX = 200;
const ROW_PITCH_PX = 18;
const SEAT_PITCH_PX = 14;
/** How far the back row sits above the front row. Cinema rake, cut for the diorama. */
const RAKE_M = 1.5;

export interface Floor1Build {
  group: THREE.Group;
  /** Room number or letter -> an Object3D at the room's floor centre. */
  anchors: Map<number | string, THREE.Object3D>;
  /**
   * Everything that hangs above head height — the corridor vaults, the tensile
   * canopy, the foyer pendants. Hidden for the Stage 1 top-down overlay shot,
   * where a canopy over the main staircase would hide the very thing being
   * measured.
   */
  overhead: THREE.Group;
}

/** The screen wall's sim y, and the sign of "into the room" from it. */
function screenEdge(r: RoomDef): { y: number; inward: 1 | -1 } {
  return r.side < 0 ? { y: r.y, inward: 1 } : { y: r.y + r.h, inward: -1 };
}

/* ------------------------------------------------------------------- walls */

/** Which palette entry and height a sim wall slab is drawn with. */
function wallStyle(w: Wall, p: VenuePalette): { mat: THREE.MeshStandardMaterial; height: number } {
  if (w.glass) return { mat: p.glassPane, height: GLASS_H };
  if (w.low) return { mat: p.counterTop, height: LOW_H };

  const isShell =
    (w.w === W && (w.y === 0 || w.y === H - T)) || (w.h === H && (w.x === 0 || w.x === W - T));
  if (isShell) return { mat: p.shell, height: SHELL_H };

  // The two long corridor walls are the only T-thin slabs sitting on the band edges.
  const isCorridor = w.h === T && (w.y === CY0 - T || w.y === CY1);
  if (isCorridor) return { mat: p.corridorWall, height: WALL_H };

  const f = F1.foyer;
  const touchesFoyer =
    w.x + w.w >= f.x - 2 * T && w.x <= f.x + f.w + 2 * T && w.y + w.h >= f.y - T && w.y <= f.y + f.h + 2 * T;
  if (touchesFoyer) return { mat: p.foyerWall, height: WALL_H };

  return { mat: p.audWall, height: WALL_H };
}

/* ------------------------------------------------------------------- rooms */

/**
 * One auditorium's raked seating: a stepped floor and a block of seats, both
 * drawn as a single `InstancedMesh` so a 1900-seat venue costs 26 draw calls
 * rather than hundreds of meshes.
 */
function seating(r: RoomDef, p: VenuePalette): THREE.Object3D[] {
  const { y: far, inward } = screenEdge(r);
  const rowCount = Math.floor((SEAT_BACK_PX - SEAT_FRONT_PX) / ROW_PITCH_PX) + 1;

  // Seat blocks, in sim x, with the two aisles cut out.
  const blocks: Array<[number, number]> = [];
  let cut = r.x;
  for (const [a, b] of AISLES) {
    blocks.push([cut, r.x + a * r.w]);
    cut = r.x + b * r.w;
  }
  blocks.push([cut, r.x + r.w]);

  const seatsPerRow = blocks.reduce(
    (n, [x0, x1]) => n + Math.max(0, Math.floor((x1 - x0 - 20) / SEAT_PITCH_PX) + 1),
    0,
  );

  if (rowCount < 1 || seatsPerRow < 1) return [];

  const rake = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), p.audRake, rowCount);
  rake.name = `rake-${r.n}`;
  const seats = new THREE.InstancedMesh(
    seatGeometry(m(SEAT_PITCH_PX), m(ROW_PITCH_PX)),
    p.audSeat,
    rowCount * seatsPerRow,
  );
  seats.name = `seats-${r.n}`;

  const mat = new THREE.Matrix4();
  const upright = new THREE.Quaternion();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  // Seats face the screen; the seat geometry is modelled facing +z.
  quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), inward > 0 ? Math.PI : 0);

  let s = 0;
  for (let row = 0; row < rowCount; row++) {
    const off = SEAT_FRONT_PX + row * ROW_PITCH_PX;
    const t = rowCount === 1 ? 0 : row / (rowCount - 1);
    const rise = t * RAKE_M;
    const simY = far + inward * off;

    const stepH = Math.max(0.06, rise + 0.06);
    pos.set(m(r.x + r.w / 2), stepH / 2, m(simY));
    scale.set(m(r.w), stepH, m(ROW_PITCH_PX));
    rake.setMatrixAt(row, mat.compose(pos, upright, scale));

    scale.set(1, 1, 1);
    for (const [x0, x1] of blocks) {
      for (let x = x0 + 10; x <= x1 - 10 && s < seats.count; x += SEAT_PITCH_PX) {
        pos.set(m(x), rise + 0.06, m(simY));
        seats.setMatrixAt(s++, mat.compose(pos, quat, scale));
      }
    }
  }
  // Row widths are counted conservatively; hide any instance the loop did not fill.
  for (let i = s; i < seats.count; i++) seats.setMatrixAt(i, mat.makeScale(0.0001, 0.0001, 0.0001));
  rake.instanceMatrix.needsUpdate = true;
  seats.instanceMatrix.needsUpdate = true;
  rake.castShadow = true;
  rake.receiveShadow = true;
  seats.castShadow = true;
  return [rake, seats];
}

/**
 * Jambs and a lintel, so a gap in the corridor wall reads as a doorway.
 *
 * The lintel goes in `overhead`: door positions are part of the Stage 1 overlay
 * check, and a head above the opening would close the gap in a shot taken from
 * straight up. Hidden overhead, every doorway is a real hole in the plan again.
 */
function doorway(r: RoomDef, p: VenuePalette, overhead: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  const d = roomDoor(r);
  const wallY = r.side < 0 ? CY0 - T : CY1;
  const jamb = 5;
  g.add(slab({ x: d.cx - DOOR / 2 - jamb, y: wallY, w: jamb, h: T }, 0, DOOR_H + 0.12, p.doorFrame));
  g.add(slab({ x: d.cx + DOOR / 2, y: wallY, w: jamb, h: T }, 0, DOOR_H + 0.12, p.doorFrame));
  overhead.add(slab({ x: d.cx - DOOR / 2, y: wallY, w: DOOR, h: T }, DOOR_H, WALL_H - DOOR_H, p.corridorWall));
  return g;
}

/* ----------------------------------------------------------------- the foyer */

/**
 * The curved foyer floor. The plan's sweep is the prototype's own
 * `quadraticCurveTo`, kept verbatim: straight along the corridor, then falling
 * away to the left as the real foyer does.
 */
function foyerFloor(p: VenuePalette): THREE.Mesh {
  const f = F1.foyer;
  const shape = new THREE.Shape();
  // Shape y is negated so that, once the plate is laid flat, shape y maps to world z.
  shape.moveTo(m(f.x), -m(f.y));
  shape.lineTo(m(f.x + f.w), -m(f.y));
  shape.lineTo(m(f.x + f.w), -m(f.y + f.h));
  shape.quadraticCurveTo(m(f.x + f.w * 0.2), -m(f.y + f.h * 0.9), m(f.x), -m(f.y + f.h * 0.5));
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, p.foyerFloor);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.14;
  mesh.receiveShadow = true;
  mesh.name = 'foyer-floor';
  return mesh;
}

function foyer(p: VenuePalette, overhead: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.name = 'foyer';
  g.add(foyerFloor(p));

  // The bar: the prototype's counter rect, dressed with a brass foot rail,
  // cream table lamps and a pair of pendants — image-1790032659509.webp.
  const bar: Rect = { x: F1.foyer.x + 20, y: F1.foyer.y + 150, w: 70, h: 16 };
  g.add(slab(bar, 0, LOW_H, p.barTop));
  g.add(slab({ x: bar.x, y: bar.y + bar.h, w: bar.w, h: 3 }, 0.12, 0.07, p.brass));
  for (let i = 0; i < 3; i++) {
    const x = bar.x + 12 + i * 22;
    g.add(boxAt(x, bar.y + 6, 5, 5, LOW_H, 0.26, p.lampWarm));
    g.add(postAt(x, bar.y + 30, 0.18, 0.62, 0, p.blackMetal, 8));
  }
  for (let i = 0; i < 2; i++) overhead.add(pendant(bar.x + 22 + i * 30, bar.y + 8, 0.5, 2.5, p.pendantWhite));

  return g;
}

/**
 * The glass kiosk. Its glazing, and the Voxxy-sized hatch in its left face, are
 * already sim walls (the hatch is a `hidden` collider with
 * `skipFor: b => b.kind === 'voxxy'`), so this only adds what the sim has no
 * opinion about: the fascia, the counter and a warm frame marking the hatch.
 */
function kiosk(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'kiosk';
  const k = F1.kiosk;
  g.add(floorSlab(k, 0.02, p.barTop));
  g.add(slab({ x: k.x - 2, y: k.y - 2, w: k.w + 4, h: k.h + 4 }, GLASS_H, 0.14, p.devoxxOrange));
  g.add(slab({ x: k.x + 8, y: k.y + k.h - 18, w: k.w - 16, h: 10 }, 0.02, LOW_H, p.counterTop));
  // The hatch: the sim's gap runs y k.y+16 .. k.y+40 in the kiosk's left wall.
  const hatch: Rect = { x: k.x - 1, y: k.y + 16, w: T + 2, h: 24 };
  g.add(slab(hatch, 0, 0.05, p.lampWarm));
  g.add(slab(hatch, 0.62, 0.05, p.lampWarm));
  return g;
}

/* ----------------------------------------------------------------- staircases */

/** Both secondary-staircase niches, with real steps disappearing down the well. */
function secondaryStairs(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'secondary-stairs';
  const flights: Array<{ name: string; rect: Rect; dir: '+z' | '-z' }> = [
    { name: 'stair-niche-top', rect: F1.nicheTop, dir: '-z' },
    { name: 'stair-niche-bot', rect: F1.nicheBot, dir: '+z' },
  ];
  for (const f of flights) {
    const flight = stairFlight({
      rect: f.rect,
      topY: 0,
      bottomY: -2.6,
      dir: f.dir,
      steps: 8,
      tread: p.stairTreadDark,
      nosing: p.stairNosing,
      runs: 2,
      rail: p.steelRail,
    });
    flight.name = f.name;
    g.add(flight);
    // Close the well so the camera does not look straight through to nothing.
    g.add(slab(f.rect, -3.3, 0.55, p.shell));
  }
  return g;
}

/**
 * The main staircase at the corridor's end between 6 and 7: blue carpet, three
 * runs split by slim tubular handrails, pale nosings, and the white tensile
 * canopy overhead — image-1790032674926.webp, which is the venue's signature shot.
 */
function mainStaircase(p: VenuePalette, overhead: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.name = 'stair-main';
  const s = F1.mainStair;
  const flight = stairFlight({
    rect: s,
    topY: 0,
    bottomY: -2.9,
    dir: '+x',
    steps: 10,
    tread: p.stairCarpetBlue,
    nosing: p.stairNosing,
    runs: 3,
    rail: p.steelRail,
  });
  flight.name = 'stair-main-flight';
  g.add(flight);
  overhead.add(tensileTree(s.x + 16, s.y + 22, 2.0, 1.5, 2.6, p.canopyFabric));
  overhead.add(tensileTree(s.x + 48, s.y + 66, 2.0, 1.5, 2.6, p.canopyFabric));
  return g;
}

/* ---------------------------------------------------------- corridor dressing */

/**
 * The corridor's own architecture: square dark columns on the room boundaries,
 * pale vaults springing off them, and an orange backlit poster box beside every
 * Devoxx door.
 */
function corridorDressing(p: VenuePalette, overhead: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  g.name = 'corridor-dressing';

  // Columns land on the room party walls, which keeps them clear of every doorway.
  const xs = new Set<number>();
  for (const r of rooms) {
    xs.add(Math.round(r.x - T / 2));
    xs.add(Math.round(r.x + r.w + T / 2));
  }
  const busy: Rect[] = [F1.nicheTop, F1.nicheBot, F1.mainStair];
  for (const x of xs) {
    if (busy.some((b) => x > b.x - 24 && x < b.x + b.w + 24)) continue;
    for (const y of [CY0 + 11, CY1 - 11]) g.add(boxAt(x, y, 16, 16, 0, SHELL_H, p.corridorColumn));
  }

  // Vaults: pale bands tilted up off the columns, springing toward the centre.
  for (const side of [-1, 1] as const) {
    const y = side < 0 ? CY0 + 16 : CY1 - 16;
    const vault = slab({ x: 0, y: y - 6, w: W, h: 12 }, 2.5, 0.9, p.corridorVault);
    vault.rotation.x = side < 0 ? -0.7 : 0.7;
    overhead.add(vault);
  }

  // Backlit poster boxes, on the far side of each Devoxx door from the Zaal sign.
  for (const r of rooms) {
    if (r.closed) continue;
    const d = roomDoor(r);
    // Hung on the corridor *face* of the wall, so it reads from down the corridor.
    const y = r.side < 0 ? CY0 + 1 : CY1 - 3;
    g.add(slab({ x: d.cx - DOOR / 2 - 44, y, w: 30, h: 2 }, 0.55, 1.9, p.posterGlow));
  }
  return g;
}

/* --------------------------------------------------------------------- build */

export function buildFloor1(p: VenuePalette): Floor1Build {
  const group = new THREE.Group();
  group.name = 'floor1';
  const overhead = new THREE.Group();
  overhead.name = 'overhead';
  const anchors = new Map<number | string, THREE.Object3D>();

  // A base plate under everything, so voids between rooms read as building, not sky.
  group.add(floorSlab({ x: 0, y: 0, w: W, h: H }, -0.02, p.shell, 0.4));
  // The corridor itself: dark navy carpet running the full length of the level.
  const carpet = floorSlab({ x: 0, y: CY0, w: W, h: CY1 - CY0 }, 0, p.corridorCarpet);
  carpet.name = 'corridor-carpet';
  group.add(carpet);

  for (const r of rooms) {
    const room = new THREE.Group();
    room.name = `room-${r.n}`;
    room.add(floorSlab(r, 0, p.audFloor));

    // The screen at the far end, away from the corridor door.
    const { y: far, inward } = screenEdge(r);
    const screen: Rect = { x: r.x + r.w * 0.2, y: far + inward * 5 - 1, w: r.w * 0.6, h: 3 };
    const screenMesh = slab(screen, 0.35, 2.4, p.audScreen);
    screenMesh.name = `screen-${r.n}`;
    room.add(screenMesh);

    // Room E dresses itself in chapter 1 (seat rows, aisle, exit alcove) from sim
    // walls, exactly as the prototype does; everywhere else the seats are set.
    if (r.n !== 'E') for (const o of seating(r, p)) room.add(o);
    room.add(doorway(r, p, overhead));
    group.add(room);

    const anchor = anchorAt(`anchor-${r.n}`, r.x + r.w / 2, r.y + r.h / 2);
    anchor.userData.room = r.n;
    anchor.userData.side = r.side;
    const door = roomDoor(r);
    const doorAnchor = anchorAt('door', 0, 0);
    doorAnchor.position.set(0, 0, m(door.cy) - m(r.y + r.h / 2));
    anchor.add(doorAnchor);
    group.add(anchor);
    anchors.set(r.n, anchor);
  }

  for (const w of floor1Walls()) {
    if (w.hidden) continue;
    const { mat, height } = wallStyle(w, p);
    group.add(slab(w, 0, height, mat));
  }

  group.add(foyer(p, overhead));
  group.add(kiosk(p));

  // The fire door between the closed section and the Devoxx rooms. Chapter 1 owns
  // whether it is shut; the renderer owns what it looks like, and names the leaf
  // so the chapter can hide it once the code is entered.
  const fire = new THREE.Group();
  fire.name = 'fire-door';
  fire.add(slab({ x: F1.fireX, y: CY0, w: 14, h: CY1 - CY0 }, 0, WALL_H, p.fireDoor));
  const keypad = slab({ x: F1.fireX - 18, y: CY0 + 8, w: 16, h: 6 }, 1.0, 0.42, p.keypad);
  keypad.name = 'fire-keypad';
  fire.add(keypad);
  group.add(fire);

  group.add(secondaryStairs(p));
  group.add(mainStaircase(p, overhead));
  group.add(corridorDressing(p, overhead));
  group.add(overhead);

  return { group, anchors, overhead };
}
