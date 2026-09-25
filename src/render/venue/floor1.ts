/**
 * floor1.ts — the cinema level: corridor, both rows of auditoriums, the curved
 * foyer with its bar and glass kiosk, the fire door, both secondary staircases
 * and the main staircase.
 *
 * **Every** coordinate comes from `src/sim/geometry.ts`. Nothing in this file
 * invents a plan position, because that module is what makes the Stage 1 overlay
 * check a property of the data rather than of the drawing code: rooms 3, 4, 5, 6
 * along the bottom and 10, 9, 8, 7 along the top, the two secondary staircases
 * standing in the corridor against its walls level with rooms 4 and 9, and the
 * main staircase at the corridor's end between 6 and 7.
 *
 * Materials and dressing follow `media/other-images/CAPTIONS.md`: dark navy
 * carpet, charcoal walls, square dark columns with pale vaults springing off them,
 * orange backlit poster boxes as the only warm accent, and the blue-carpeted main
 * staircase split into three runs under its white tensile canopy.
 */

import * as THREE from 'three';

import { H, T, W } from '../../sim/constants';
import {
  CY0,
  CY1,
  DOOR,
  F1,
  ROW_PITCH_PX,
  SEAT_BLOCK_MIN_PX,
  SEAT_PITCH_PX,
  NICHE_RAIL,
  floor1Walls,
  nicheMidLanding,
  nicheMouth,
  nicheRamps,
  roomDoor,
  roomScreen,
  roomSeating,
  rooms,
} from '../../sim/geometry';
import type { Rect, RoomDef, Wall } from '../../sim/types';
import { m } from '../../sim/units';
import type { VenuePalette } from './materials';
import { projectionBooth } from './projector';
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
import { POSTER_W_PX, zaalPosterX } from './signage';

/* ------------------------------------------------------- auditorium layout */

/**
 * How far the back row sits above the front row. Cinema rake, cut for the diorama.
 *
 * The seating PLAN — aisles, row pitch, how deep the block runs — is not here any
 * more: it is `roomSeating()` in `src/sim/geometry.ts`, because the seat blocks
 * are colliders and a collider and its picture must be the same object. This
 * module only says how tall the rake is and what a seat is made of.
 */
const RAKE_M = 1.5;
/** The corridor columns' knee-high plinths on the camera side. See `wallStyle`. */
const COLUMN_PLINTH_H = 0.52;

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

/* ------------------------------------------------------------------- walls */

/**
 * Which palette entry and height a sim wall slab is drawn with, or `null` for a
 * wall whose own builder draws it further down this file.
 */
function wallStyle(
  w: Wall,
  p: VenuePalette,
): { mat: THREE.MeshStandardMaterial; height: number; cap?: boolean } | null {
  // Drawn by their own builders: the seat blocks become rows of modelled seats on
  // a raked floor, the screen is lit, the stools are turned, the bar is dressed.
  if (w.kind === 'seats' || w.kind === 'screen' || w.kind === 'stool' || w.kind === 'bar') return null;
  // The two runs of a secondary staircase. `secondaryStairs` draws them as real
  // steps falling away from the landing; a slab here would stand a solid block on
  // top of that, and on the near wall it would stand it between the fixed camera
  // and the corridor.
  if (w.kind === 'stairwell' || w.kind === 'stairwell-near') return null;
  // ...and the balustrade across the head of each flight, which `secondaryStairs`
  // draws as a handrail on posts. A slab here would build a second, solid one on
  // top of it — and on the near flight, one between the camera and the corridor.
  if (w.kind === 'stair-rail' || w.kind === 'stair-rail-near') return null;
  // The corridor's square columns. The FAR side gets the full shaft; the NEAR side
  // a knee-high plinth, because a full shaft there stands between the fixed camera
  // and the corridor floor (see `corridorDressing`).
  if (w.kind === 'corridor-column') return { mat: p.corridorColumn, height: SHELL_H };
  if (w.kind === 'corridor-plinth') return { mat: p.corridorColumn, height: COLUMN_PLINTH_H };
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
 * Does the venue seat this auditorium itself?
 *
 * Every house but cinema E. Room E dresses itself in chapter 1 — seat rows, one
 * aisle and the exit alcove, on a plan of its own — and seating it twice would
 * put a flat block of seats through the raked one.
 *
 * Exported because `src/render/seats.ts` has to ask: the chapters publish
 * `seatrow`/`seatblock` props, and chapter 4's keynote republishes room 8's own
 * seat blocks, which this module has already set. One answer to the question, in
 * one place, so the two drawers cannot both think the floor is theirs.
 */
export const venueSeatsRoom = (r: RoomDef): boolean => r.n !== 'E';

/**
 * One auditorium's raked seating: a stepped floor and a block of seats, both
 * drawn as a single `InstancedMesh` so a 1900-seat venue costs 26 draw calls
 * rather than hundreds of meshes.
 */
function seating(r: RoomDef, p: VenuePalette): THREE.Object3D[] {
  // The plan comes from the sim, which is also what carries the colliders.
  const plan = roomSeating(r);
  if (!plan) return [];
  const { blocks, rows, inward } = plan;
  const rowCount = rows.length;

  const seatsPerRow = blocks.reduce(
    (n, [x0, x1]) => n + Math.max(0, Math.floor((x1 - x0 - SEAT_BLOCK_MIN_PX) / SEAT_PITCH_PX) + 1),
    0,
  );

  if (seatsPerRow < 1) return [];

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
    const t = rowCount === 1 ? 0 : row / (rowCount - 1);
    const rise = t * RAKE_M;
    const simY = rows[row];

    const stepH = Math.max(0.06, rise + 0.06);
    pos.set(m(r.x + r.w / 2), stepH / 2, m(simY));
    scale.set(m(r.w), stepH, m(ROW_PITCH_PX));
    rake.setMatrixAt(row, mat.compose(pos, upright, scale));

    scale.set(1, 1, 1);
    for (const [x0, x1] of blocks) {
      const inset = SEAT_BLOCK_MIN_PX / 2;
      for (let x = x0 + inset; x <= x1 - inset && s < seats.count; x += SEAT_PITCH_PX) {
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

  // The bar: the sim's own counter rect (`F1.bar`, a `low` wall like every other
  // counter in the game), dressed with a brass foot rail, cream table lamps and a
  // pair of pendants — image-1790032659509.webp. The stools are the sim's too:
  // they were three cylinders this file invented, and a robot walked through them.
  const bar = F1.bar;
  g.add(slab(bar, 0, LOW_H, p.barTop));
  g.add(slab({ x: bar.x, y: bar.y + bar.h, w: bar.w, h: 3 }, 0.12, 0.07, p.brass));
  for (const st of F1.barStools) {
    g.add(boxAt(st.x + st.w / 2, bar.y + 6, 5, 5, LOW_H, 0.26, p.lampWarm));
    g.add(postAt(st.x + st.w / 2, st.y + st.h / 2, 0.18, 0.62, 0, p.blackMetal, 8));
  }
  for (let i = 0; i < 2; i++) overhead.add(pendant(bar.x + 22 + i * 30, bar.y + 8, 0.5, 2.5, p.pendantWhite));

  return g;
}

/**
 * The glass kiosk. Its glazing, and the Voxxy-sized hatch in its left face, are
 * already sim walls (the hatch is a `hidden` collider with
 * `skipFor: b => b.kind === 'voxxy'`), so this only adds what the sim has no
 * opinion about: the fascia and a warm frame marking the hatch.
 *
 * ## The black block
 *
 * Michele, twice: *"reduce / remove the black block, make it into a glass wall or
 * something to show the circle better"*, then *"the black bench(?) has to go, for
 * a glass wall"*. Chapter 1's clue 2 sits on the kiosk's floor, at its centre.
 *
 * The thing on top of it was not a bench. It was this function's own **fascia**:
 * a 60 x 60 px plate laid flat at `GLASS_H` — a LID over the whole kiosk, 4.8 m
 * square and two metres up. Unlit, from a camera pitched 30 degrees, that is
 * exactly what a "black block" looks like.
 *
 * Measured rather than assumed, because the first guess was wrong. The lid does
 * not stand between the camera and the clue — at this pitch its projection falls
 * NORTH of the ring — it **shades** it. A/B on the same build, mean luminance of
 * the 100 x 80 px box around the ring: **39.1 with the lid, 43.5 without, and
 * the brightest arc pixels 128.8 against 174.1**, a quarter of the arcs' punch
 * spent on a roof nobody asked for. The counter, the bench he guessed at, costs
 * 43.8 against 43.5 — nothing, inside the noise. It goes anyway: he asked for it
 * to go, and it was a dark slab in a glass box.
 *
 * A kiosk fascia is a BAND round the head of the glazing, not a roof, so it is
 * four bands now and the top is open: the kiosk is glass, a floor and a clue.
 */
function kiosk(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'kiosk';
  const k = F1.kiosk;
  g.add(floorSlab(k, 0.02, p.barTop));
  // The fascia band, on all four heads. 3 px deep, so it reads as a rim from the
  // diorama camera and hides nothing under it.
  const F = 3;
  const o = 2;
  for (const band of [
    { x: k.x - o, y: k.y - o, w: k.w + 2 * o, h: F },
    { x: k.x - o, y: k.y + k.h + o - F, w: k.w + 2 * o, h: F },
    { x: k.x - o, y: k.y - o + F, w: F, h: k.h + 2 * o - 2 * F },
    { x: k.x + k.w + o - F, y: k.y - o + F, w: F, h: k.h + 2 * o - 2 * F },
  ] as Rect[]) {
    g.add(slab(band, GLASS_H, 0.14, p.devoxxOrange));
  }
  // The hatch: the sim's gap runs y k.y+16 .. k.y+40 in the kiosk's left wall.
  const hatch: Rect = { x: k.x - 1, y: k.y + 16, w: T + 2, h: 24 };
  g.add(slab(hatch, 0, 0.05, p.lampWarm));
  g.add(slab(hatch, 0.62, 0.05, p.lampWarm));
  return g;
}

/**
 * `r` with `hole` taken out of it, as up to four rectangles.
 *
 * Axis-aligned, so this is four strips and no geometry library: the piece west of
 * the hole, the piece east of it, and the two remaining stubs above and below.
 * Used to cut the stairwells out of the corridor floor.
 */
function minus(r: Rect, hole: Rect): Rect[] {
  const x0 = Math.max(r.x, hole.x);
  const x1 = Math.min(r.x + r.w, hole.x + hole.w);
  const y0 = Math.max(r.y, hole.y);
  const y1 = Math.min(r.y + r.h, hole.y + hole.h);
  if (x1 <= x0 || y1 <= y0) return [r];
  return [
    { x: r.x, y: r.y, w: x0 - r.x, h: r.h },
    { x: x1, y: r.y, w: r.x + r.w - x1, h: r.h },
    { x: x0, y: r.y, w: x1 - x0, h: y0 - r.y },
    { x: x0, y: y1, w: x1 - x0, h: r.y + r.h - y1 },
  ].filter((q) => q.w > 0.01 && q.h > 0.01);
}

/* ----------------------------------------------------------------- staircases */

/**
 * Both secondary staircases, with real steps disappearing down them.
 *
 * They **stand in the corridor** against its two walls, level with rooms 4 and 9,
 * because that is where `plans/devoxx-rooms-stairs-annotated.png` draws them — see
 * `F1.nicheTop` for the measurement and for Michele's 24 Sep ruling that the
 * drawing outranks the prose. Until this round they were 40 x 57 pockets cut into
 * the wall 148 px back along the corridor, which is the fault he reported three
 * times.
 *
 * The plan's own section is what is drawn here: a flight **1.41 m wide**
 * (`NICHE_MOUTH`, 20 plan px of the corridor's 147) hard against the room wall,
 * **109 px long** along the corridor. At 1.41 m Biggy cannot take it, which is the
 * sim's rule and note 18 in `docs/playtest-notes.md`; this is the picture agreeing.
 *
 * ## ONE staircase, not two — 24 Sep 2026
 *
 * It used to be drawn as a square landing in the middle of the run with a flight
 * falling away either side, and that is exactly what Michele sent back, with the
 * plan symbol enlarged: *"This makes it look like there's a center, and 2 descent.
 * I think it's a mid plane between two ramps of stairs. In this picture stairs go
 * south to north."*
 *
 * So: the head is the **top step at the east end** (`nicheMouth`), one ramp falls
 * west from it to a **half-landing** (`nicheMidLanding`), and a second ramp falls
 * west from that to the foot of the well — one staircase, and the drop is split
 * between the ramps in proportion to their runs so the half-landing lands level.
 *
 * The balustrade is where the photo puts it — *"There's a protection on West and
 * North, as you can see on the second picture"* — on the flight's open long face,
 * the one toward the corridor, and across its far (world-west) end. The head is
 * the one side left open, because it is the way on.
 */
function secondaryStairs(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'secondary-stairs';
  const flights: Array<{ name: string; rect: Rect; side: -1 | 1 }> = [
    { name: 'stair-niche-top', rect: F1.nicheTop, side: -1 },
    { name: 'stair-niche-bot', rect: F1.nicheBot, side: 1 },
  ];
  /** How far the well drops before the diorama stops drawing it, metres. */
  const DROP = 2.6;
  for (const f of flights) {
    const mouth = nicheMouth(f.rect);
    const mid = nicheMidLanding(f.rect);
    const [upper, lower] = nicheRamps(f.rect);
    const well = new THREE.Group();
    well.name = f.name;

    // Split the drop by run length, so the half-landing is flat at the height
    // both ramps agree on.
    const run = upper.w + lower.w;
    const midY = -DROP * (upper.w / run);
    for (const [rect, y0, y1] of [
      [upper, 0, midY],
      [lower, midY, -DROP],
    ] as const) {
      if (rect.w < 1) continue;
      well.add(
        stairFlight({
          rect,
          topY: y0,
          bottomY: y1,
          // Top at the east edge, descending west: the plan's south-to-north.
          dir: '-x',
          steps: Math.max(3, Math.round(rect.w / 4.5)),
          tread: p.stairTreadDark,
          nosing: p.stairNosing,
          runs: 1,
        }),
      );
    }
    // The half-landing between the two ramps — the "mid plane".
    well.add(floorSlab(mid, midY, p.stairTreadDark, 0.1));
    // Close the well so the camera does not look straight through to nothing...
    well.add(slab(f.rect, -3.3, 0.55, p.shell));
    // ...and floor the top step, which is the part a robot may stand on.
    well.add(floorSlab(mouth, -0.02, p.stairTreadDark, 0.08));

    /*
     * The protection. `open` is the corridor-facing long face of this flight —
     * the top niche hugs the far wall so its open edge is its +y side, the bottom
     * one the mirror — and `far` is the west end, where the well bottoms out.
     * Kept 1.5 px thin so it reads as a balustrade rather than as another wall,
     * and so the near one does not mask the corridor it stands in.
     *
     * ## Why the head of the well gets an upstand and not a handrail
     *
     * Room 9's numeral panel is 30.25 px of sign in 30.75 px of wall, clamped by
     * `signage.ts` to the end of room 9's frontage — which is this flight's own
     * west edge, 0.12 m away — with its bottom corner 0.30 m off the floor.
     * Traced from that corner at every diorama pitch (`DIORAMA_ELEVATIONS_DEG`),
     * the sight line to the camera crosses the head-of-well line between 0.63 m
     * and 1.11 m, so there is NO handrail height there that leaves the numeral
     * clear, and neither run of wall beside room 9's door is long enough to slide
     * the panel out of the way (the west one has a corridor column in front of
     * its first 5 px). Legible Zaal numerals are a Stage 1 pass condition and
     * `tests/venue.smoke.test.ts` enforces them, so the head of the well carries
     * a 0.40 m upstand and a newel instead of a full guard.
     *
     * **That is a compromise and it is logged as one** — the honest fix is to move
     * rooms 4 and 9's numerals off the wall beside the stair, which moves signage
     * the plan does place there. Flagged for Michele.
     *
     * The open face, which is where his photo puts the protection people actually
     * hold, gets the real thing: a rail at 0.95..0.99 m on posts. That band is the
     * gap between the sight cones at 24° (0.86..0.92) and 30° (1.03..1.10); it is
     * checked by the same test, not by this comment.
     */
    const RAIL_0 = 0.95;
    const RAIL_1 = 0.99;
    const UPSTAND = 0.4;
    // `NICHE_RAIL` and this y come from the sim, which stands the same rail
    // across the mouth as a collider — the picture and the wall are one object.
    const openY = f.side < 0 ? f.rect.y + f.rect.h - NICHE_RAIL : f.rect.y;
    well.add(slab({ x: f.rect.x, y: openY, w: f.rect.w, h: NICHE_RAIL }, RAIL_0, RAIL_1 - RAIL_0, p.steelRail));
    for (let i = 0; i <= 5; i++) {
      well.add(postAt(f.rect.x + (i * f.rect.w) / 5, openY + 0.75, 0.05, RAIL_1, 0, p.steelRail, 8));
    }
    // The head of the well: upstand across the full depth, newel at the corner.
    well.add(slab({ x: f.rect.x, y: f.rect.y, w: NICHE_RAIL, h: f.rect.h }, 0, UPSTAND, p.shell));
    well.add(postAt(f.rect.x + 0.75, f.rect.y + f.rect.h / 2, 0.05, UPSTAND, 0, p.steelRail, 8));
    g.add(well);
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

  // The corridor's square columns are `corridorColumns()` in the sim now and are
  // drawn by the wall loop in `buildFloor1` — full 3.3 m shafts on the FAR side,
  // where they stand behind the corridor and give it depth, and knee-high plinths
  // on the NEAR side, where a full shaft would stand between the fixed camera and
  // the corridor floor. They used to be drawn here out of this file's own loop,
  // which meant eighteen columns a robot walked straight through.

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
    const box = slab({ x: zaalPosterX(Number(r.n)) - POSTER_W_PX / 2, y, w: POSTER_W_PX, h: 2 }, 0.55, 1.2, p.posterGlow);
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

/**
 * The underside of the corridor vault at one distance into the corridor, metres,
 * or `null` out past the plate's far edge where there is no vault overhead;
 * `corridorSoffit` gives the plate's own span, for anything that has to reach
 * BACK to it from further out in the corridor.
 *
 * Exported because anything HUNG in the closed section's corridor has to know
 * where the soffit is, and the alternative is a second copy of the four numbers
 * above. `src/render/release-panel.ts` hangs chapter 1's door override off it:
 * the vault springs from the far wall head and rakes up steeply, so a control
 * high on that wall is behind the soffit (`FAR_Y1` in `signage.ts` is the same
 * fact, from the other end) and one out in the corridor is not — which is why
 * that prop's rect stands clear of the wall, and what its hangers reach up to.
 */
export function corridorSoffit(): { z0: number; z1: number; y0: number; y1: number } {
  const z0 = m(CY0 + VAULT_SPRING_PX);
  const z1 = z0 + VAULT_DEPTH_M * Math.cos(VAULT_RAKE_RAD);
  return { z0, z1, y0: VAULT_SPRING_Y, y1: VAULT_SPRING_Y + VAULT_DEPTH_M * Math.sin(VAULT_RAKE_RAD) };
}

export function corridorSoffitY(zM: number): number | null {
  const s = corridorSoffit();
  if (zM < s.z0 || zM > s.z1) return null;
  return s.y0 + (zM - s.z0) * Math.tan(VAULT_RAKE_RAD);
}

/* --------------------------------------------------------------------- build */

export function buildFloor1(p: VenuePalette): Floor1Build {
  const group = new THREE.Group();
  group.name = 'floor1';
  const overhead = new THREE.Group();
  overhead.name = 'overhead';
  const anchors = new Map<number | string, THREE.Object3D>();

  /*
   * The floor, with the two stairwells cut out of it.
   *
   * A staircase down is a HOLE in the floor it leaves, and until the flights moved
   * into the corridor this floor never had to know that: they were pockets outside
   * the corridor band, so the band's carpet simply stopped short of them. Laid
   * whole over the new footprints, the carpet and the base plate roofed both
   * flights over — measured in the top-down debug shot, every pixel of both
   * stairwells came back the corridor's own [47,51,66], which is the Stage 1
   * overlay check failing on the one thing it exists to look at.
   */
  const wells: Rect[] = [F1.nicheTop, F1.nicheBot];
  const cut = (r: Rect): Rect[] => wells.reduce<Rect[]>((acc, hole) => acc.flatMap((q) => minus(q, hole)), [r]);
  // A base plate under everything, so voids between rooms read as building, not sky.
  for (const r of cut({ x: 0, y: 0, w: W, h: H })) group.add(floorSlab(r, -0.02, p.shell, 0.4));
  /*
   * The corridor itself: dark navy carpet running the full length of the level.
   *
   * Cut by the two stair wells AND by the main staircase's own rect. The main stair
   * was missing from that list, and it cost the same z-fight the ground floor's
   * threshold had: the carpet's top face and the flight's top tread both sit at
   * **y = 0.0000**, and they shared a 1.32 x 9.4 m ribbon — 12.46 m2 — at the head
   * of the flight. Found by the scan in `tests/coplanar.test.ts`, which was written
   * for Michele's ground-floor line and turned this up on the floor above.
   *
   * The hole is covered by the staircase's own head slab and treads, so nothing
   * shows through: this only stops two surfaces claiming the same plane.
   */
  const carpet = new THREE.Group();
  carpet.name = 'corridor-carpet';
  for (const r of cut({ x: 0, y: CY0, w: W, h: CY1 - CY0 })) {
    for (const q of minus(r, F1.mainStair)) carpet.add(floorSlab(q, 0, p.corridorCarpet));
  }
  group.add(carpet);

  for (const r of rooms) {
    const room = new THREE.Group();
    room.name = `room-${r.n}`;
    room.add(floorSlab(r, 0, p.audFloor));

    // The screen at the far end, away from the corridor door.
    const screenMesh = slab(roomScreen(r), 0.35, 2.4, p.audScreen);
    screenMesh.name = `screen-${r.n}`;
    room.add(screenMesh);

    // Room E dresses itself in chapter 1 (seat rows, aisle, exit alcove) from sim
    // walls, exactly as the prototype does; everywhere else the seats are set.
    if (venueSeatsRoom(r)) for (const o of seating(r, p)) room.add(o);
    room.add(doorway(r, p, overhead));
    // The projection booth over the door, and the machine in it — Michele: "the
    // projector still needs a shape". See `projector.ts` for what it is made of
    // and why it sits beside the doorway rather than over it.
    const booth = projectionBooth(r, p);
    if (booth) room.add(booth);
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
    const style = wallStyle(w, p);
    if (!style) continue;
    const { mat, height, cap } = style;
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
  // Named, because chapter 1 takes it over: once that chapter publishes a
  // `firedoor` prop the door is a moving thing with a swing clock on it, and
  // `scene.ts` hides this static leaf and draws the sim's own screen and leaves
  // instead (`src/render/fire-door.ts`). Chapter 4 publishes no such prop — the
  // cinema section is simply sealed again — so there this stays the door.
  const fireLeaf = slab({ x: F1.fireX, y: CY0, w: 14, h: CY1 - CY0 }, 0, WALL_H, p.fireDoor);
  fireLeaf.name = 'fire-leaf';
  fire.add(fireLeaf);
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
