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
  NEAR_CAP_T,
  NEAR_CUT_H,
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
import { zaalPosterX } from './signage';

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
/**
 * Clear standing room between the back row and the corridor wall, sim px.
 *
 * The plan's shallow houses — 3, 7 and 10 at 179–184 px deep — are shallower than
 * `SEAT_BACK_PX`, so the back rows were laid out *through* the corridor wall and
 * out into the corridor. From the diorama camera that put a raked step and a row
 * of seat backs in front of the Zaal 7 and Zaal 10 numeral panels, which is how
 * a seating constant ends up failing a signage check.
 */
const SEAT_CONCOURSE_PX = 52;
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
function wallStyle(
  w: Wall,
  p: VenuePalette,
): { mat: THREE.MeshStandardMaterial; height: number; cap?: boolean } {
  if (w.glass) return { mat: p.glassPane, height: GLASS_H };
  if (w.low) return { mat: p.counterTop, height: LOW_H };

  const isShell =
    (w.w === W && (w.y === 0 || w.y === H - T)) || (w.h === H && (w.x === 0 || w.x === W - T));
  if (isShell) return { mat: p.shell, height: SHELL_H };

  // The two long corridor walls are the only T-thin slabs sitting on the band edges.
  if (w.h === T && w.y === CY0 - T) return { mat: p.corridorWall, height: WALL_H };
  // The NEAR one is cut to a parapet: it stands between the fixed camera and the
  // corridor, and at full height it hid the corridor floor, both robots walking
  // it and the main staircase — the venue's signature image, which until now only
  // ever appeared in the top-down debug view. See `NEAR_CUT_H`.
  if (w.h === T && w.y === CY1) return { mat: p.corridorWall, height: NEAR_CUT_H, cap: true };

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
  const back = Math.min(SEAT_BACK_PX, r.h - SEAT_CONCOURSE_PX);
  const rowCount = Math.floor((back - SEAT_FRONT_PX) / ROW_PITCH_PX) + 1;

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
  const far = r.side < 0;
  const wallY = far ? CY0 - T : CY1;
  const jamb = 5;
  // Near-side jambs follow the parapet the near wall is cut to: a full-height
  // frame standing on a 1.15 m wall would be the tallest thing between the camera
  // and the corridor, which is the one thing the cutaway exists to avoid.
  const jambH = far ? DOOR_H + 0.12 : NEAR_CUT_H + NEAR_CAP_T + 0.1;
  g.add(slab({ x: d.cx - DOOR / 2 - jamb, y: wallY, w: jamb, h: T }, 0, jambH, p.doorFrame));
  g.add(slab({ x: d.cx + DOOR / 2, y: wallY, w: jamb, h: T }, 0, jambH, p.doorFrame));
  if (far) {
    overhead.add(slab({ x: d.cx - DOOR / 2, y: wallY, w: DOOR, h: T }, DOOR_H, WALL_H - DOOR_H, p.corridorWall));
  }
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

  // A blue-carpet HEAD at corridor level, then the flight dropping away from it.
  //
  // Drawn as a bare 10-step flight over the whole 64-px rect this read, from the
  // diorama camera and from straight above, as a single six-unit blue line and an
  // amorphous grey wedge — the venue's most recognisable image, missing from the
  // chapter that needs it. The head gives the carpet an area at floor level, the
  // flight is shallower so more of its treads sit near the top, and the handrails
  // and balustrades stand at corridor height where both cameras can see them.
  const HEAD = 18;
  const head: Rect = { x: s.x, y: s.y, w: HEAD, h: s.h };
  const landing = floorSlab(head, 0.01, p.stairCarpetBlue, 0.1);
  landing.name = 'stair-main-head';
  g.add(landing);

  const flight = stairFlight({
    rect: { x: s.x + HEAD, y: s.y, w: s.w - HEAD, h: s.h },
    topY: 0,
    bottomY: -2.2,
    dir: '+x',
    steps: 8,
    tread: p.stairCarpetBlue,
    nosing: p.stairNosing,
    runs: 3,
    rail: p.steelRail,
  });
  flight.name = 'stair-main-flight';
  g.add(flight);

  // Slim tubular steel handrails splitting the stair into its three runs, plus a
  // balustrade down each side — image-1790032674926.webp.
  for (let k = 0; k <= 3; k++) {
    const y = s.y + (s.h * k) / 3;
    const rail = slab({ x: s.x - 2, y: y - 1.5, w: s.w + 4, h: 3 }, 0.92, 0.07, p.steelRail);
    g.add(rail);
    for (let j = 0; j <= 3; j++) {
      g.add(postAt(s.x + 2 + (j * (s.w - 4)) / 3, y, 0.05, 0.95, 0, p.steelRail, 8));
    }
  }
  // The dark well edge, so the opening reads as a hole in the floor from above.
  for (const y of [s.y - T, s.y + s.h]) g.add(slab({ x: s.x, y, w: s.w, h: T }, -0.02, 0.9, p.corridorColumn));

  // The white tensile "tree" canopy over the stair head, uplit blue.
  overhead.add(tensileTree(s.x + 14, s.y + 24, 2.2, 1.6, 2.5, p.canopyFabric));
  overhead.add(tensileTree(s.x + 46, s.y + 66, 2.2, 1.6, 2.5, p.canopyFabric));
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
    // FAR side (small sim y) gets the full 3.3 m shaft: the diorama camera sits on
    // the +z side, so those columns stand BEHIND the corridor and give it depth.
    g.add(boxAt(x, CY0 + 11, 16, 16, 0, SHELL_H, p.corridorColumn));
    // NEAR side gets a knee-high plinth instead. A full shaft here stands between
    // the camera and the corridor floor, and since these columns are render-only
    // dressing rather than sim colliders, a robot walks straight behind one and
    // vanishes — which is exactly what happened to Voxxy and Droid on chapter 1's
    // opening frame, ring and all.
    g.add(boxAt(x, CY1 - 11, 16, 16, 0, 0.52, p.corridorColumn));
  }

  // The vault: one pale plate springing off the far wall head and raking up over
  // the corridor — image-1790032669312.webp.
  //
  // It used to be a 0.9 x 0.96 m bar floating a metre and a half *out* in the
  // corridor at 2.3 m, which is head height for this camera: it sliced the top
  // off every numeral panel on the far wall and took the whole top line of the
  // blue wayfinding sign with it. Springing it from the wall head instead, and
  // raking it up faster than any chapter's sight line climbs, means a ray leaving
  // the top of a panel can never catch it again. `VAULT_RAKE` > the steepest
  // `tan(elevation)` in `src/render/camera.ts` is the whole trick.
  overhead.add(corridorVault(p));

  // The near half of the corridor ceiling is cut away with the near wall: on this
  // side of the corridor anything above the parapet is, by construction, between
  // the camera and the thing it is meant to be looking at.

  // Backlit poster boxes, on the far side of each Devoxx door from the Zaal sign.
  for (const r of rooms) {
    if (r.closed) continue;
    // Hung on the corridor *face* of the wall, so it reads from down the corridor.
    const y = r.side < 0 ? CY0 + 1 : CY1 - 3;
    // Deliberately smaller than it used to be. A blank orange poster box that
    // rendered complete while the numeral panel beside it was clipped made the
    // poster the dominant colour block on the wall — the reverse of the Kinepolis
    // photograph, where the numeral panel is what you read from 60 m away.
    const box = slab({ x: zaalPosterX(Number(r.n)) - 9, y, w: 18, h: 2 }, 0.55, 1.2, p.posterGlow);
    box.name = `poster-box-${r.n}`;
    g.add(box);
  }
  return g;
}

/** How steeply the vault rakes up off the wall head. See `corridorVault`. */
const VAULT_RAKE_RAD = 0.75;
/** Where its underside springs from, metres: clear of the tallest panel band. */
const VAULT_SPRING_Y = 2.95;
/** Sim px out from the far wall's corridor face. */
const VAULT_SPRING_PX = 2;
const VAULT_DEPTH_M = 2;
const VAULT_T_M = 0.16;

/**
 * The corridor's pale plaster vault, as one raked plate over the far side.
 *
 * Built in a local frame and placed by its **underside springing edge**, because
 * that edge is the only part of it any sight line ever has to clear: everything
 * else is further from the camera and higher up.
 */
function corridorVault(p: VenuePalette): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(m(W), VAULT_T_M, VAULT_DEPTH_M),
    p.corridorVault,
  );
  mesh.name = 'corridor-vault';
  // Negative: a positive rotation about +x tips the plate's far edge DOWN, and
  // this one has to climb away from the wall faster than any sight line does.
  mesh.rotation.x = -VAULT_RAKE_RAD;
  const c = Math.cos(VAULT_RAKE_RAD);
  const s = -Math.sin(VAULT_RAKE_RAD);
  // Undo the rotation of the plate's near-bottom edge, so that edge lands exactly
  // on (VAULT_SPRING_Y, the springing plane).
  mesh.position.set(
    m(W) / 2,
    VAULT_SPRING_Y + (VAULT_T_M / 2) * c - (VAULT_DEPTH_M / 2) * s,
    m(CY0 + VAULT_SPRING_PX) + (VAULT_T_M / 2) * s + (VAULT_DEPTH_M / 2) * c,
  );
  return mesh;
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
    const { mat, height, cap } = wallStyle(w, p);
    group.add(slab(w, 0, height, mat));
    // A painted cut face, so the lowered near wall reads as a deliberate section
    // through the building rather than as a wall that stops for no reason.
    if (cap === true) group.add(slab(w, height, NEAR_CAP_T, p.sectionCut));
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
