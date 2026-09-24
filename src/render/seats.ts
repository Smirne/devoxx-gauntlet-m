/**
 * seats.ts — a chapter's seat rows, drawn as the seats the venue already draws.
 *
 * Michele, with a screenshot of cinema E under Droid's green pool, Droid up on
 * Biggy and the rows behind them: *"This still needs a shape."* It did. Chapter 1
 * and chapter 4 publish `seatrow`/`seatblock` props, `PROPS` in `src/render/scene.ts`
 * carried one entry each — `{ h: 0.55, tl: true }` — and `drawProp` drew exactly
 * that: one flat-topped cuboid per rect. A 10 m slab of anthracite.
 *
 * The game already knew better. `src/render/venue/props.ts` models a cinema seat
 * (cushion, back, legs) and `src/render/venue/floor1.ts` lays a whole auditorium
 * out as one `InstancedMesh`, which is why rooms 3..10 read as seating and cinema E
 * did not. So there were two answers to "what does a seat row look like" and the
 * chapters got the worse one. This module is the join: the same `seatGeometry`,
 * the same `audSeat` colour, the same sim-side pitch constants, one draw call.
 *
 * **It decides nothing about the game.** The sim goes on publishing the same rects
 * with the same `low` walls — light crosses a seat row, robots do not — and every
 * number here comes out of `src/sim/geometry.ts`. What a rect is for is the sim's
 * business; what it looks like is this file's (CLAUDE.md).
 *
 * Two rules the layout is built around, both of them load-bearing:
 *
 *  1. **Nothing is drawn outside the published rect.** A seat row's rect is its
 *     collider, and this repo has been bitten repeatedly by drawn solids that
 *     stand where the sim has nothing (the 5.2 m cinema screen, the hung signs,
 *     the roller door). A row that is shallower than `ROW_PITCH_PX` — chapter 1's
 *     are 9 px, half a venue row — gets shallower seats, not seats that overhang
 *     into the gap a robot walks down.
 *  2. **Pitch comes from the sim.** `SEAT_PITCH_PX` and `ROW_PITCH_PX` are the
 *     same two numbers `roomSeating()` lays the venue's own houses out on, so a
 *     chapter block and the room next door are seated at the same density.
 */

import * as THREE from 'three';

import { ROW_PITCH_PX, SEAT_PITCH_PX, rooms, screenEdge, seatBlockRects } from '../sim/geometry';
import type { Rect, RoomDef } from '../sim/types';
import { m } from '../sim/units';

import { venueSeatsRoom } from './venue/floor1';
import { venueSpec } from './venue/materials';
import { SEAT_TOP_M, seatGeometry } from './venue/props';

export { SEAT_TOP_M };

/** The `Prop.kind`s this module draws instead of `drawProp`. */
export const SEAT_KINDS: ReadonlySet<string> = new Set(['seatrow', 'seatblock']);

/** The auditorium a rect's centre stands in, if any. */
function roomOf(r: Rect): RoomDef | undefined {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return rooms.find((o) => cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h);
}

/** Area of the overlap of two rects, sim px². */
function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Is the venue's own auditorium seating already standing on this rect?
 *
 * Chapter 4 republishes room 8's seat blocks as `seatrow` props, and the venue
 * has already seated room 8 from the same `roomSeating()` plan — with a rake
 * under it, which the sim has no plate for and the chapter's rects therefore sit
 * flat beneath. Drawn as slabs that did not matter: they were buried. Drawn as
 * seats it does, and it did — a second, half-height row of seats came up through
 * the gap between every raked row, measured on a before/after of the keynote.
 *
 * So the chapter's copy stands down where the venue's seating already covers it.
 * The test for that is the overlap, not the room: a chapter that seats some
 * corner of a Devoxx room the venue's own plan does not reach still gets seats.
 */
export function venueAlreadySeats(r: Rect): boolean {
  const room = roomOf(r);
  if (!room || !venueSeatsRoom(room)) return false;
  const covered = seatBlockRects(room).reduce((n, b) => n + overlap(r, b), 0);
  return covered >= 0.5 * r.w * r.h;
}

/** One seat: where it stands in sim pixels, which way it faces, how deep it is. */
export interface SeatPlacement {
  /** Centre of the seat, sim px. */
  x: number;
  y: number;
  /** Yaw about world +Y. The seat model faces +z, i.e. down the plan. */
  yaw: number;
  /** The seat's own depth, sim px — its row's, never more than `ROW_PITCH_PX`. */
  depthPx: number;
}

/**
 * Which way the seats in a rect face.
 *
 * Toward the room's screen, which is the sim's own `screenEdge()`: `inward` is the
 * direction *from* the screen into the house, so a seat faces the other way.
 * `seatGeometry` models a seat facing +z (down the plan, increasing sim y), so a
 * house whose screen is at the low-y end — every Devoxx room 3..10, and chapter
 * 4's keynote in room 8 — turns through half a turn, and cinema E, whose screen is
 * at the high-y end, does not.
 *
 * A rect in no room at all keeps the model's own facing rather than throwing: this
 * is the renderer, and a chapter that invents a seat row in the corridor should
 * get an odd-looking row, not a black screen.
 */
export function seatYaw(r: Rect): number {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const room = rooms.find((o) => cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h);
  if (!room) return 0;
  return screenEdge(room).inward > 0 ? Math.PI : 0;
}

/**
 * One rect's seats: rows at `ROW_PITCH_PX`, seats at `SEAT_PITCH_PX`, the whole
 * grid centred in the rect so the leftover at the ends is shared rather than
 * hanging off one edge.
 *
 * A rect too small for a full row or a full seat still gets one of each — chapter
 * 1's rows are 9 px deep against an 18 px pitch, and a row that rounded down to
 * nothing would put the slab back by another route.
 */
export function seatLayout(r: Rect): SeatPlacement[] {
  const yaw = seatYaw(r);
  const cols = Math.max(1, Math.floor(r.w / SEAT_PITCH_PX));
  const rowCount = Math.max(1, Math.floor(r.h / ROW_PITCH_PX));
  const depthPx = Math.min(r.h, ROW_PITCH_PX);
  const x0 = r.x + (r.w - cols * SEAT_PITCH_PX) / 2 + SEAT_PITCH_PX / 2;
  const y0 = r.y + (r.h - rowCount * depthPx) / 2 + depthPx / 2;

  const out: SeatPlacement[] = [];
  for (let row = 0; row < rowCount; row++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: x0 + c * SEAT_PITCH_PX, y: y0 + row * depthPx, yaw, depthPx });
    }
  }
  return out;
}

/**
 * Every seat every chapter draws this frame, in one `InstancedMesh`.
 *
 * `buildLights` is already most of a chapter-2 step and cinema E alone is 57
 * seats, chapter 4's keynote 126; a mesh apiece would be a draw call apiece. This
 * is the venue's own trick — `seating()` in `floor1.ts` puts 1900 seats in 26
 * calls — applied to the props the chapters publish.
 */
export interface SeatField {
  /** Start a frame. */
  begin(): void;
  /** Seat one published rect. `baseY` is the walking surface under a sim point. */
  add(r: Rect, baseY: (simX: number, simY: number) => number): void;
  /** Push the frame's instances to the GPU. */
  end(): void;
  /** For tests and probes: the live mesh. */
  readonly mesh: THREE.InstancedMesh;
  dispose(): void;
}

/** Instances allocated up front. Cinema E needs 57; growth is one reallocation. */
const SEAT_CAPACITY_MIN = 64;

export function createSeatField(parent: THREE.Object3D): SeatField {
  // Exactly the geometry rooms 3..10 are seated with, at exactly their pitch.
  // Rows shallower than `ROW_PITCH_PX` scale this down in z per instance.
  const geo = seatGeometry(m(SEAT_PITCH_PX), m(ROW_PITCH_PX));
  const spec = venueSpec('audSeat');
  const mat = new THREE.MeshStandardMaterial({
    name: 'chapter/audSeat',
    color: new THREE.Color(spec.color),
    roughness: spec.roughness ?? 0.85,
    metalness: spec.metalness ?? 0,
  });

  interface Placed {
    x: number;
    y: number;
    z: number;
    yaw: number;
    sz: number;
  }
  /** Reused between frames: a chapter's seating does not move, so nor should the churn. */
  const placed: Placed[] = [];
  let n = 0;

  function make(capacity: number): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(geo, mat, capacity);
    im.name = 'chapter-seats';
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = true;
    im.receiveShadow = true;
    // An `InstancedMesh`'s bounding sphere is the GEOMETRY's until something
    // recomputes it, and this one's instances are spread over a whole auditorium.
    // Culling against the unit seat would drop the field out of frame at the
    // edges of a pan, which is the sort of flicker that costs a round.
    im.frustumCulled = false;
    im.count = 0;
    im.visible = false;
    parent.add(im);
    return im;
  }

  let mesh = make(SEAT_CAPACITY_MIN);

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axisY = new THREE.Vector3(0, 1, 0);

  return {
    get mesh(): THREE.InstancedMesh {
      return mesh;
    },
    begin(): void {
      n = 0;
    },
    add(r: Rect, baseY: (simX: number, simY: number) => number): void {
      if (venueAlreadySeats(r)) return;
      for (const s of seatLayout(r)) {
        const p = placed[n] ?? (placed[n] = { x: 0, y: 0, z: 0, yaw: 0, sz: 1 });
        p.x = m(s.x);
        p.y = baseY(s.x, s.y);
        p.z = m(s.y);
        p.yaw = s.yaw;
        p.sz = s.depthPx / ROW_PITCH_PX;
        n++;
      }
    },
    end(): void {
      // Capacity is allocated, never per-frame: a chapter's seat count is fixed
      // the moment it starts, so this reallocates at most once per chapter.
      if (n > mesh.instanceMatrix.count) {
        parent.remove(mesh);
        mesh.dispose();
        mesh = make(Math.max(SEAT_CAPACITY_MIN, 1 << Math.ceil(Math.log2(n))));
      }
      for (let i = 0; i < n; i++) {
        const p = placed[i];
        pos.set(p.x, p.y, p.z);
        quat.setFromAxisAngle(axisY, p.yaw);
        scale.set(1, 1, p.sz);
        mesh.setMatrixAt(i, mat4.compose(pos, quat, scale));
      }
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose(): void {
      parent.remove(mesh);
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}
