/**
 * THE FLOOR-PLAN FIDELITY CHECK, AT SCENE LEVEL (GAUNTLET.md Stage 1, piece 1).
 *
 * `tests/geometry.test.ts` already asserts that the *data* matches the annotated
 * plans. This file asserts that the *diorama built from that data* still matches
 * them: that nothing in `src/render/venue` quietly re-scales, re-orders, mirrors or
 * drops a room, a staircase or a sign on the way from sim pixels to metres.
 *
 * It is the headless half of the critic's overlay check. The critic's half is a
 * top-down screenshot laid over `plans/devoxx-rooms-stairs-annotated.png` and
 * `plans/exhibition-floor-stairs-annotated.png`; that can only pass if everything
 * below passes first, so a red test here means the round is already lost.
 *
 * Conventions under test (see `src/render/venue/props.ts`):
 *   world x = simX / PX_PER_M,  world z = simY / PX_PER_M,  +y up,
 *   cinema level at y = 0 and the exhibition level STOREY_H_M below it.
 */

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { H, W } from '../src/sim/constants';
import { F1, R, rooms } from '../src/sim/geometry';
import { PX_PER_M, STOREY_H_M } from '../src/sim/units';
import { buildVenue, simToWorld, type Venue } from '../src/render/venue/index';

const DEVOXX_TOP = [10, 9, 8, 7];
const DEVOXX_BOTTOM = [3, 4, 5, 6];
const DEVOXX = [...DEVOXX_BOTTOM, ...DEVOXX_TOP];

let venue: Venue;

beforeEach(() => {
  venue = buildVenue();
  venue.group.updateMatrixWorld(true);
});

afterEach(() => {
  venue.dispose();
});

/** World-space position of a named descendant. */
function worldXZ(name: string): { x: number; z: number } {
  const o = venue.group.getObjectByName(name);
  expect(o, `missing object "${name}"`).toBeDefined();
  const v = new THREE.Vector3();
  (o as THREE.Object3D).getWorldPosition(v);
  return { x: v.x, z: v.z };
}

const anchorX = (n: number | string): number => {
  const a = venue.roomAnchors.get(n);
  expect(a, `missing anchor for room ${String(n)}`).toBeDefined();
  return (a as THREE.Object3D).getWorldPosition(new THREE.Vector3()).x;
};

describe('the venue builds', () => {
  it('returns both levels with geometry in them', () => {
    expect(venue.group.children.length).toBeGreaterThan(0);
    expect(venue.floor1.children.length).toBeGreaterThan(0);
    expect(venue.ground.children.length).toBeGreaterThan(0);

    let meshes = 0;
    venue.floor1.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes++;
    });
    expect(meshes).toBeGreaterThan(100);
  });

  it('puts the exhibition level exactly STOREY_H_M below the cinema level', () => {
    expect(venue.floor1.position.y).toBe(0);
    expect(venue.ground.position.y).toBeCloseTo(-STOREY_H_M, 6);
    expect(simToWorld(0, 0, 'down').y).toBeCloseTo(-STOREY_H_M, 6);
  });

  it('keeps hundreds of auditorium seats instanced rather than as separate meshes', () => {
    const seats = venue.group.getObjectByName('seats-8');
    expect(seats).toBeInstanceOf(THREE.InstancedMesh);
    expect((seats as THREE.InstancedMesh).count).toBeGreaterThan(60);
  });
});

describe('the built map covers the sim extent', () => {
  it('spans 1900x700 sim px scaled by PX_PER_M, within 5%', () => {
    const box = new THREE.Box3().setFromObject(venue.group);
    const size = box.getSize(new THREE.Vector3());
    const wantX = W / PX_PER_M;
    const wantZ = H / PX_PER_M;
    expect(size.x).toBeGreaterThan(wantX * 0.95);
    expect(size.x).toBeLessThan(wantX * 1.05);
    expect(size.z).toBeGreaterThan(wantZ * 0.95);
    expect(size.z).toBeLessThan(wantZ * 1.05);
  });

  it('is laid out in the plan\'s own orientation, not mirrored or rotated', () => {
    // Room 3 is at the corridor's left-hand end, room 6 at the far right.
    expect(anchorX(3)).toBeLessThan(anchorX(6));
    // The bottom row is at larger z than the top row, as +y down on the plan.
    const top = venue.roomAnchors.get(10) as THREE.Object3D;
    const bottom = venue.roomAnchors.get(3) as THREE.Object3D;
    expect(bottom.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(
      top.getWorldPosition(new THREE.Vector3()).z,
    );
  });
});

describe('the eight Devoxx rooms', () => {
  it('each has an anchor, at the position geometry.ts gives it', () => {
    for (const n of DEVOXX) {
      const r = R(n);
      const want = simToWorld(r.x + r.w / 2, r.y + r.h / 2, 'up');
      const got = (venue.roomAnchors.get(n) as THREE.Object3D).getWorldPosition(new THREE.Vector3());
      expect(got.x).toBeCloseTo(want.x, 5);
      expect(got.z).toBeCloseTo(want.z, 5);
    }
  });

  it('runs 10, 9, 8, 7 left to right along the top and 3, 4, 5, 6 along the bottom', () => {
    for (const row of [DEVOXX_TOP, DEVOXX_BOTTOM]) {
      const xs = row.map(anchorX);
      expect(xs).toEqual([...xs].sort((a, b) => a - b));
      // ...and in exactly the order geometry.ts puts them in.
      const fromGeometry = row.map((n) => R(n).x).sort((a, b) => a - b);
      expect(row.map((n) => R(n).x)).toEqual(fromGeometry);
    }
  });

  it('gives every room a door anchor on the corridor wall', () => {
    for (const n of DEVOXX) {
      const room = venue.roomAnchors.get(n) as THREE.Object3D;
      const door = room.getObjectByName('door');
      expect(door, `room ${n} has no door anchor`).toBeDefined();
      const z = (door as THREE.Object3D).getWorldPosition(new THREE.Vector3()).z;
      // The corridor band is sim y 300..400.
      expect(z).toBeGreaterThanOrEqual(300 / PX_PER_M - 1e-6);
      expect(z).toBeLessThanOrEqual(400 / PX_PER_M + 1e-6);
    }
  });

  it('never puts two room anchors in the same place', () => {
    const seen = new Set<string>();
    for (const r of rooms) {
      const a = venue.roomAnchors.get(r.n) as THREE.Object3D;
      expect(a, `missing anchor for room ${String(r.n)}`).toBeDefined();
      const p = a.getWorldPosition(new THREE.Vector3());
      const key = `${p.x.toFixed(3)}|${p.z.toFixed(3)}`;
      expect(seen.has(key), `two rooms share the position ${key}`).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(rooms.length);
  });
});

describe('both staircases, which is what the overlay check fails rounds over', () => {
  it('puts the secondary staircases between rooms 10|9 and 3|4', () => {
    const top = worldXZ('stair-niche-top');
    const bot = worldXZ('stair-niche-bot');

    // Room 10 ends and room 9 starts on either side of the top niche.
    expect(top.x).toBeGreaterThan(simToWorld(R(10).x + R(10).w, 0, 'up').x);
    expect(top.x).toBeLessThan(simToWorld(R(9).x, 0, 'up').x);
    // Same gap on the bottom row, between rooms 3 and 4.
    expect(bot.x).toBeGreaterThan(simToWorld(R(3).x + R(3).w, 0, 'up').x);
    expect(bot.x).toBeLessThan(simToWorld(R(4).x, 0, 'up').x);

    // The niches face each other across the corridor.
    expect(top.z).toBeLessThan(bot.z);
    expect(top.x).toBeCloseTo(bot.x, 5);
  });

  it('puts the main staircase beyond rooms 6 and 7, at the corridor\'s end', () => {
    const main = worldXZ('stair-main-flight');
    const mid6 = simToWorld(R(6).x + R(6).w / 2, 0, 'up').x;
    const mid7 = simToWorld(R(7).x + R(7).w / 2, 0, 'up').x;
    expect(main.x).toBeGreaterThan(mid6);
    expect(main.x).toBeGreaterThan(mid7);

    // ...and further along the corridor than either secondary staircase.
    expect(main.x).toBeGreaterThan(worldXZ('stair-niche-top').x);
    expect(main.x).toBeGreaterThan(worldXZ('stair-niche-bot').x);

    // It sits in the corridor band, not inside a room.
    expect(main.z).toBeGreaterThan(F1.mainStair.y / PX_PER_M - 1);
    expect(main.z).toBeLessThan((F1.mainStair.y + F1.mainStair.h) / PX_PER_M + 1);
  });

  it('gives the exhibition level its own three flights up', () => {
    for (const name of ['ground-stair-top', 'ground-stair-bot', 'ground-stair-main']) {
      const o = venue.group.getObjectByName(name);
      expect(o, `missing ${name}`).toBeDefined();
      const y = (o as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y;
      // They climb from the exhibition floor, so they start below the cinema level.
      expect(y).toBeLessThan(0);
      expect(y).toBeGreaterThan(-STOREY_H_M);
    }
  });
});

describe('signage', () => {
  it('has a numbered Zaal panel and a talk strip for all eight Devoxx rooms', () => {
    for (const n of DEVOXX) {
      expect(venue.group.getObjectByName(`zaal-sign-${n}`), `no Zaal sign for room ${n}`).toBeDefined();
      expect(venue.group.getObjectByName(`talk-sign-${n}`), `no talk sign for room ${n}`).toBeDefined();
    }
  });

  it('hangs each Zaal panel on its own room\'s corridor frontage', () => {
    for (const n of DEVOXX) {
      const r = R(n);
      const sign = venue.group.getObjectByName(`zaal-sign-${n}`) as THREE.Object3D;
      const p = sign.getWorldPosition(new THREE.Vector3());
      expect(p.x).toBeGreaterThan(simToWorld(r.x, 0, 'up').x);
      expect(p.x).toBeLessThan(simToWorld(r.x + r.w, 0, 'up').x);
      // On the corridor wall, within half a metre of the band edge it belongs to.
      const wall = simToWorld(0, r.side < 0 ? 300 : 400, 'up').z;
      expect(Math.abs(p.z - wall)).toBeLessThan(0.5);
    }
  });

  it('carries the Devoxx-flavour signs the brief asks for', () => {
    for (const name of ['entrance-sign', 'catering-board', 'wifi-sign', 'wayfinding-top', 'wayfinding-bottom']) {
      expect(venue.group.getObjectByName(name), `missing ${name}`).toBeDefined();
    }
  });

  it('builds headlessly, with no canvas and no leaked texture', () => {
    // vitest runs with environment "node": there is no document here at all.
    expect(typeof document).toBe('undefined');
    const sign = venue.group.getObjectByName('zaal-face-8') as THREE.Mesh;
    const mat = sign.material as THREE.MeshStandardMaterial;
    expect(mat.map).toBeNull();
    // The fallback still reads as the venue's orange panel.
    expect(mat.color.getHexString()).toBe('e1561c');
  });
});

describe('the exhibition level', () => {
  it('has the hall, the catering court, the store, reception and the BOF rooms', () => {
    for (const key of ['hall', 'catering', 'tech', 'store', 'reception', 'bof', 'toilets', 'entrance']) {
      expect(venue.roomAnchors.get(key), `missing anchor "${key}"`).toBeDefined();
    }
    for (const name of ['roller-door', 'breaker-panel', 'network-rack', 'badge-printer', 'main-stair-gate']) {
      expect(venue.group.getObjectByName(name), `missing ${name}`).toBeDefined();
    }
  });

  it('builds all twelve sponsor booths, half of them as cloth-draped tables', () => {
    let built = 0;
    let tables = 0;
    venue.group.traverse((o) => {
      if (o.name.startsWith('booth-screen-')) built++;
      if (o.name.startsWith('booth-table-')) tables++;
    });
    expect(built + tables).toBe(12);
    expect(tables).toBe(6);
  });
});

describe('teardown', () => {
  it('disposes twice without throwing', () => {
    expect(() => venue.dispose()).not.toThrow();
    // afterEach disposes again; a second pass must be a no-op.
  });

  it('can hide everything overhead for the top-down overlay shot', () => {
    venue.showOverhead(false);
    const f1Overhead = venue.floor1.getObjectByName('overhead');
    expect(f1Overhead?.visible).toBe(false);
    venue.showOverhead(true);
    expect(f1Overhead?.visible).toBe(true);
  });
});
