/**
 * A SEAT ROW HAS TO LOOK LIKE SEATS.
 *
 * Michele, with a screenshot of chapter 1's cinema — Droid up on Biggy, his green
 * pool across the rows behind them: *"This still needs a shape."*
 *
 * Measured before the fix, and this is the whole diagnosis:
 *
 * | question | measurement |
 * |---|---|
 * | how does `scene.ts` draw a `seatrow`? | `PROPS.seatrow = { h: 0.55, tl: true }`, through `drawProp` |
 * | so what is on screen? | one flat-topped cuboid per published rect — cinema E's six rows are six 10 m slabs |
 * | does the game know how to draw a seat? | yes: `seatGeometry()` in `src/render/venue/props.ts`, since the venue was built |
 * | who uses it? | `seating()` in `floor1.ts`, for rooms 3..10 — 1900 seats in 26 draw calls |
 * | so cinema D, one wall away, has modelled seats? | yes |
 *
 * Two answers to "what does a seat row look like", and the chapters had the bad
 * one. This file pins the join: the chapters draw **the venue's seat**, at the
 * **sim's** pitch, inside the **sim's** rect, and no seat stands between a clue
 * and the camera.
 *
 * Nothing here touches the sim. The rects and the `low` walls under them are the
 * same rects and the same walls; `tests/aisle.test.ts` measures the aisle they
 * leave, `tests/colliders.test.ts` measures the solid they claim, and both are
 * about the sim, which this change does not enter.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CHAPTER_ELEVATION_DEG, dioramaToCameraAtDeg } from '../src/render/camera';
import { SEAT_KINDS, SEAT_TOP_M, createSeatField, seatLayout, seatYaw, venueAlreadySeats } from '../src/render/seats';
import { seatGeometry } from '../src/render/venue/props';
import { buildVenue } from '../src/render/venue/index';
import { createGame } from '../src/sim/game';
import { R, ROW_PITCH_PX, SEAT_PITCH_PX, screenEdge } from '../src/sim/geometry';
import type { Prop, Rect } from '../src/sim/types';
import { m } from '../src/sim/units';
// Vite's own `?raw`, the way `tests/clue-plate.test.ts` reaches into the same
// file: `PROPS` lives inside `src/render/scene.ts` and the module needs a WebGL
// canvas to build, which a node test has not got.
import SCENE_SRC from '../src/render/scene.ts?raw';

/** The seat props one chapter publishes, as rects. `tl` kinds: `x,y` is the corner. */
function seatRects(chapter: number): Rect[] {
  const g = createGame({ seed: 20260930, chapter, cards: false });
  // A few frames, so a chapter that only publishes its dressing once it has
  // ticked is in the list.
  for (let i = 0; i < 4; i++) g.update(0.033);
  return g
    .snapshot()
    .props.filter((p: Prop) => SEAT_KINDS.has(p.kind))
    .map((p: Prop) => ({ x: p.x, y: p.y, w: p.w ?? 0, h: p.h ?? 0 }));
}

/** The entry `PROPS` in `src/render/scene.ts` declares for one kind. */
function propsEntry(kind: string): string {
  const table = /const PROPS:[\s\S]*?\n};/.exec(SCENE_SRC);
  expect(table, 'src/render/scene.ts no longer declares a PROPS table').not.toBeNull();
  const hit = new RegExp(`(?:^|\\n)\\s*['"]?${kind}['"]?:\\s*\\{([^}]*)\\}`).exec((table as RegExpExecArray)[0]);
  expect(hit, `PROPS has no entry for "${kind}"`).not.toBeNull();
  return (hit as RegExpExecArray)[1];
}

describe('a chapter seat row is drawn as seats, not as a slab', () => {
  /*
   * THE ONE THAT WOULD HAVE CAUGHT IT.
   *
   * Against the old renderer this reads `h: 0.55` out of `PROPS.seatrow` — the
   * flat-topped cuboid — and fails with `expected 0.55 to be 0.87`. It passes
   * only when the table's height is the height of the seat MODEL, which is what
   * `src/render/seats.ts` actually draws.
   */
  it('declares the seat kinds at the modelled seat height, not a box height', () => {
    for (const kind of SEAT_KINDS) {
      const body = propsEntry(kind);
      const h = /\bh:\s*([A-Za-z0-9_$.]+)/.exec(body);
      expect(h, `PROPS.${kind} has no height`).not.toBeNull();
      const token = (h as RegExpExecArray)[1];
      const value = /^[0-9]*\.?[0-9]+$/.test(token) ? Number(token) : NaN;
      // A literal is the old state: the height must be READ from the seat model.
      expect(Number.isNaN(value) ? SEAT_TOP_M : value, `PROPS.${kind} is a ${token} m box, not a seat`).toBeCloseTo(
        SEAT_TOP_M,
        6,
      );
      expect(token, `PROPS.${kind} re-types the seat height instead of importing it`).toBe('SEAT_TOP_M');
    }
  });

  /* The same thing from the other end: the draw path, not the table. */
  it('routes the seat kinds away from the generic drawProp path', () => {
    const dispatch = /function drawDressing[\s\S]*?\n  }/.exec(SCENE_SRC);
    expect(dispatch, 'src/render/scene.ts no longer has a drawDressing dispatch').not.toBeNull();
    const body = (dispatch as RegExpExecArray)[0];
    expect(body, 'seat props still fall through to drawProp').toMatch(/SEAT_KINDS\.has\(p\.kind\)/);
    expect(body.indexOf('SEAT_KINDS'), 'the seat branch must come before the drawProp fallback').toBeLessThan(
      body.indexOf('else drawProp'),
    );
  });

  it("draws the venue's own seat, vertex for vertex", () => {
    const field = createSeatField(new THREE.Group());
    try {
      const want = seatGeometry(m(SEAT_PITCH_PX), m(ROW_PITCH_PX));
      const a = field.mesh.geometry.getAttribute('position');
      const b = want.getAttribute('position');
      expect(a.count).toBe(b.count);
      for (let i = 0; i < a.count * 3; i++) expect(a.array[i]).toBeCloseTo(b.array[i] as number, 6);
      want.dispose();
    } finally {
      field.dispose();
    }
  });

  it('is the same seat the venue seats rooms 3..10 with', () => {
    const venue = buildVenue();
    try {
      const seats = venue.floor1.getObjectByName('seats-8');
      expect(seats, 'the venue no longer seats room 8').toBeInstanceOf(THREE.InstancedMesh);
      const field = createSeatField(new THREE.Group());
      try {
        const a = (seats as THREE.InstancedMesh).geometry.getAttribute('position');
        const b = field.mesh.geometry.getAttribute('position');
        expect(a.count, 'the venue and the chapters are back to two different seats').toBe(b.count);
        for (let i = 0; i < a.count * 3; i++) expect(a.array[i]).toBeCloseTo(b.array[i] as number, 6);
      } finally {
        field.dispose();
      }
    } finally {
      venue.dispose();
    }
  });

  it('has a shape: a back taller than its cushion, and it is at the back', () => {
    const geo = seatGeometry(m(SEAT_PITCH_PX), m(ROW_PITCH_PX));
    const pos = geo.getAttribute('position');
    // The model faces +z. Highest vertex behind the seat's middle vs in front of it.
    let backTop = -Infinity;
    let frontTop = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (pos.getZ(i) < -0.2) backTop = Math.max(backTop, y);
      if (pos.getZ(i) > 0.2) frontTop = Math.max(frontTop, y);
    }
    expect(backTop).toBeCloseTo(SEAT_TOP_M, 6);
    // A slab is flat: the whole point is that this is not.
    expect(backTop - frontTop, 'the seat back does not stand above the cushion').toBeGreaterThan(0.3);
    geo.dispose();
  });
});

describe('the seat grid comes from the sim, and stays inside the sim rect', () => {
  it("seats cinema E at the sim's own pitch", () => {
    const rects = seatRects(1);
    expect(rects.length, 'chapter 1 publishes no seat rows any more').toBeGreaterThan(0);
    let total = 0;
    for (const r of rects) {
      const seats = seatLayout(r);
      expect(seats.length, `a ${r.w}x${r.h} row got no seats`).toBeGreaterThan(0);
      total += seats.length;
      // Pitch, not a spacing this module invented.
      const xs = [...new Set(seats.map((s) => s.x))].sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(SEAT_PITCH_PX, 9);
      // Every seat inside the rect the collider is on: a drawn solid standing
      // where the sim has nothing is the bug this repo keeps catching.
      const halfW = (m(SEAT_PITCH_PX) * 0.88) / 2;
      const halfD = m(Math.min(r.h, ROW_PITCH_PX)) / 2;
      for (const s of seats) {
        expect(m(s.x) - halfW).toBeGreaterThanOrEqual(m(r.x) - 1e-9);
        expect(m(s.x) + halfW).toBeLessThanOrEqual(m(r.x + r.w) + 1e-9);
        expect(m(s.y) - halfD).toBeGreaterThanOrEqual(m(r.y) - 1e-9);
        expect(m(s.y) + halfD).toBeLessThanOrEqual(m(r.y + r.h) + 1e-9);
        expect(s.depthPx).toBeLessThanOrEqual(ROW_PITCH_PX);
      }
    }
    // A slab renderer draws one box per rect. This draws a room full of seats.
    expect(total, 'cinema E should be a room of seats, not nine boxes').toBeGreaterThan(40);
  });

  it("faces every seat at its room's screen", () => {
    // Cinema E's screen is at the high-y end, so its seats keep the model's own
    // +z facing; every Devoxx room's is at the low-y end, so those turn about.
    expect(screenEdge(R('E')).inward).toBe(-1);
    for (const r of seatRects(1)) expect(seatYaw(r)).toBeCloseTo(0, 9);

    const r8 = R(8);
    expect(screenEdge(r8).inward).toBe(1);
    expect(seatYaw({ x: r8.x + 10, y: r8.y + 80, w: 40, h: 20 })).toBeCloseTo(Math.PI, 9);
  });

  it('puts every chapter seat in one instanced draw call', () => {
    const parent = new THREE.Group();
    const field = createSeatField(parent);
    try {
      field.begin();
      for (const r of seatRects(1)) field.add(r, () => 0);
      field.end();
      const meshes: THREE.Mesh[] = [];
      parent.traverse((o) => {
        if (o instanceof THREE.Mesh && o.visible) meshes.push(o);
      });
      expect(meshes.length, 'chapter seating costs more than one draw call').toBe(1);
      expect(field.mesh.count).toBeGreaterThan(40);
      // The instances are actually written, not left at the identity.
      const mat = new THREE.Matrix4();
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      field.mesh.getMatrixAt(0, mat);
      a.setFromMatrixPosition(mat);
      field.mesh.getMatrixAt(1, mat);
      b.setFromMatrixPosition(mat);
      // float32 in the instance matrix: millimetres, not machine epsilon.
      expect(a.distanceTo(b)).toBeCloseTo(m(SEAT_PITCH_PX), 4);
    } finally {
      field.dispose();
    }
  });
});

describe('the venue and the chapters never seat the same floor twice', () => {
  it("leaves chapter 4's keynote blocks to the venue, which already seats room 8", () => {
    const rects = seatRects(4);
    expect(rects.length, 'chapter 4 publishes no seat blocks any more').toBeGreaterThan(0);
    for (const r of rects) expect(venueAlreadySeats(r), `chapter 4 doubles the seating at ${r.x},${r.y}`).toBe(true);

    const parent = new THREE.Group();
    const field = createSeatField(parent);
    try {
      field.begin();
      for (const r of rects) field.add(r, () => 0);
      field.end();
      expect(field.mesh.count, 'a second set of seats is drawn through the raked one').toBe(0);
      expect(field.mesh.visible).toBe(false);
    } finally {
      field.dispose();
    }
  });

  it('still seats cinema E, the one house the venue leaves undressed', () => {
    for (const r of seatRects(1)) expect(venueAlreadySeats(r)).toBe(false);
    const venue = buildVenue();
    try {
      expect(venue.floor1.getObjectByName('seats-E'), 'the venue has started seating cinema E too').toBeUndefined();
      expect(venue.floor1.getObjectByName('seats-8')).toBeDefined();
    } finally {
      venue.dispose();
    }
  });
});

describe('seating never hides a clue', () => {
  /**
   * Chapter 1's clues sit near the seating — clue 4 is in cinema E's exit alcove,
   * with the front row between it and the camera — and a seat back is 32 cm taller
   * than the slab it replaces. That is exactly the trade the brief flags, so it is
   * measured rather than eyeballed: a ray from the clue plate toward the diorama
   * camera must leave the room without passing through a seat.
   */
  it('leaves a clear line from every chapter-1 clue to the diorama camera', () => {
    const g = createGame({ seed: 20260930, chapter: 1, cards: false });
    for (let i = 0; i < 4; i++) g.update(0.033);
    const snap = g.snapshot();
    expect(snap.clues.length).toBeGreaterThan(0);

    const boxes: Array<{ box: THREE.Box3; at: string }> = [];
    for (const r of seatRects(1)) {
      for (const s of seatLayout(r)) {
        const half = new THREE.Vector3((m(SEAT_PITCH_PX) * 0.88) / 2, SEAT_TOP_M / 2, m(s.depthPx) / 2);
        const c = new THREE.Vector3(m(s.x), SEAT_TOP_M / 2, m(s.y));
        boxes.push({ box: new THREE.Box3(c.clone().sub(half), c.clone().add(half)), at: `${s.x},${s.y}` });
      }
    }
    expect(boxes.length).toBeGreaterThan(40);

    const toCam = dioramaToCameraAtDeg(CHAPTER_ELEVATION_DEG[1]);
    const ray = new THREE.Ray(new THREE.Vector3(), toCam);
    for (const c of snap.clues) {
      // The plate is a floor decal: a few centimetres up, which is the worst case.
      ray.origin.set(m(c.x), 0.05, m(c.y));
      for (const s of boxes) {
        expect(ray.intersectsBox(s.box), `the seat at ${s.at} stands between clue "${c.label}" and the camera`).toBe(
          false,
        );
      }
    }
  });
});
