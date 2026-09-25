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

import { H, T, W } from '../src/sim/constants';
import { BAR_RECT, CY0, CY1, F1, GF, LOBBY_RISE_M, R, WIFI_TAG, WIFI_TAG_W, rooms, stairFlightRect } from '../src/sim/geometry';
import { PX_PER_M, STOREY_H_M, m } from '../src/sim/units';
import { DIORAMA_ELEVATIONS_DEG, dioramaToCameraAtDeg } from '../src/render/camera';
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
      // The corridor band, wherever `src/sim/geometry` puts it. Hard-coding
      // 300..400 here only asserted that the prototype's numbers had not moved,
      // which is not what this test is for.
      expect(z).toBeGreaterThanOrEqual(CY0 / PX_PER_M - 1e-6);
      expect(z).toBeLessThanOrEqual(CY1 / PX_PER_M + 1e-6);
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
  /*
   * MOVED 24 Sep 2026: *"follow the devoxx plant, not the plan.md"*.
   *
   * This test used to assert the prose — the staircases in the gap between rooms
   * 10|9 and 3|4 — and passed all the way through Michele reporting the position
   * three times. The plan draws them level with rooms 4 and 9, standing in the
   * corridor. The sim-side pixel measurement is in `tests/geometry.test.ts`; this
   * is the same claim made of the thing actually on screen.
   */
  it('stands the secondary staircases in the corridor, level with rooms 4 and 9', () => {
    for (const [name, rect, roomN] of [
      ['stair-niche-top', F1.nicheTop, 9],
      ['stair-niche-bot', F1.nicheBot, 4],
    ] as const) {
      const o = venue.group.getObjectByName(name);
      expect(o, `missing object "${name}"`).toBeDefined();
      const box = new THREE.Box3().setFromObject(o as THREE.Object3D);
      // On the flight's own footprint, along the corridor and across it. The
      // slack is the nosings and the shell that closes the well.
      expect(box.min.x).toBeGreaterThan(m(rect.x) - 0.3);
      expect(box.max.x).toBeLessThan(m(rect.x + rect.w) + 0.3);
      expect(box.min.z).toBeGreaterThan(m(rect.y) - 0.3);
      expect(box.max.z).toBeLessThan(m(rect.y + rect.h) + 0.3);
      // Which is inside room 4/9's frontage, and nowhere near the 3|4 or 10|9 gap.
      expect(box.min.x).toBeGreaterThan(simToWorld(R(roomN).x, 0, 'up').x);
      expect(box.max.x).toBeLessThan(simToWorld(R(roomN).x + R(roomN).w, 0, 'up').x);
      const before = R(roomN === 9 ? 10 : 3);
      expect(box.min.x).toBeGreaterThan(simToWorld(before.x + before.w + 100, 0, 'up').x);
      // It goes DOWN: the flight's lowest tread is below the corridor floor.
      expect(box.min.y).toBeLessThan(-1);
    }
    // ...and the two of them face each other across the corridor.
    const top = new THREE.Box3().setFromObject(venue.group.getObjectByName('stair-niche-top') as THREE.Object3D);
    const bot = new THREE.Box3().setFromObject(venue.group.getObjectByName('stair-niche-bot') as THREE.Object3D);
    expect(top.max.z).toBeLessThan(bot.min.z);
    expect(top.getCenter(new THREE.Vector3()).x).toBeCloseTo(bot.getCenter(new THREE.Vector3()).x, 5);
  });

  it('leaves rooms 4 and 9 a doorway and a numeral beside the staircase, not behind it', () => {
    for (const n of [4, 9] as const) {
      const shaft = R(n).side < 0 ? F1.nicheTop : F1.nicheBot;
      const x0 = simToWorld(shaft.x, 0, 'up').x;
      const x1 = simToWorld(shaft.x + shaft.w, 0, 'up').x;
      for (const what of [`zaal-sign-${n}`, `poster-box-${n}`]) {
        const box = new THREE.Box3().setFromObject(venue.group.getObjectByName(what) as THREE.Object3D);
        const over = box.min.x < x1 && box.max.x > x0;
        expect(over, `${what} hangs over the stairwell`).toBe(false);
      }
    }
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

  /*
   * Michele: *"In devoxx the stairs are not open but look like rooms."* Each
   * secondary flight is drawn INSIDE the shaft `groundWalls()` builds round it —
   * east of the landing, never out in the open hall — so the picture and the
   * colliders are the same object seen twice.
   */
  it('draws each secondary flight inside its shaft, east of the landing', () => {
    for (const s of GF.stairs) {
      const rect = { x: s.x, y: s.y, w: s.w, h: s.h };
      const flight = stairFlightRect(rect);
      const o = venue.group.getObjectByName(`ground-stair-${s.to}`) as THREE.Object3D;
      const box = new THREE.Box3().setFromObject(o);
      // Inside the plan rect, with a little slack for the nosings.
      expect(box.min.x).toBeGreaterThan(m(rect.x) - 0.2);
      expect(box.max.x).toBeLessThan(m(rect.x + rect.w) + 0.2);
      expect(box.min.z).toBeGreaterThan(m(rect.y) - 0.2);
      expect(box.max.z).toBeLessThan(m(rect.y + rect.h) + 0.2);
      // ...and clear of the landing behind the doors, which is walkable floor.
      expect(box.min.x).toBeGreaterThan(m(flight.x) - 0.3);
      // It climbs EASTWARD: the top of the run is at the far end from the doors.
      const west = new THREE.Box3().setFromObject(o).min.y;
      expect(west).toBeLessThan(0);
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

      // On its own room's frontage, within the thickness of that wall plus the
      // depth of the panel let into it. The two rows are NOT symmetric: a far
      // room's panel reads off the corridor face, a near room's off the
      // camera-facing return of the same panel, because the fixed camera can
      // only ever see one of those two surfaces. So the side is asserted as well
      // as the distance — a near panel that drifted onto the corridor face would
      // pass a bare distance check while being invisible all game.
      const wall = simToWorld(0, r.side < 0 ? CY0 : CY1, 'up').z;
      expect(Math.abs(p.z - wall)).toBeLessThan(0.7);
      // ...and on the +z side of that plane either way, which is the side the
      // fixed camera looks at. A panel that drifted onto the other face would
      // still pass a bare distance check while being invisible all game.
      expect(p.z, `zaal ${n} sits on the blind face of its wall`).toBeGreaterThanOrEqual(wall);
    }
  });

  /*
   * THE SIGNAGE HALF OF THE STAGE 1 PASS CONDITION, ASSERTED GEOMETRICALLY.
   *
   * "Numbered Zaal signage must be visible in-scene" (GAUNTLET.md Stage 1) had
   * been checked by eye, and by eye it kept passing while the build was failing:
   * the far wall's numerals lost their top third to the corridor soffit, room 7's
   * sat behind the tensile canopy, and all four near-wall panels were built
   * facing away from the only camera the game has. Screenshots are how that gets
   * noticed; this is how it stops coming back.
   *
   * Two properties, per room, per chapter pitch:
   *   (a) the panel's bounding box is not intersected by anything overhead;
   *   (b) the numeral faces the camera, and a ray from anywhere on it toward the
   *       camera leaves the venue without hitting anything.
   */
  describe('the numerals are legible from the diorama camera', () => {
    /** Sample points across a sign's face, in world space. */
    function facePoints(face: THREE.Mesh, steps = 6): THREE.Vector3[] {
      const geo = face.geometry as THREE.PlaneGeometry;
      const { width, height } = geo.parameters;
      face.updateWorldMatrix(true, false);
      const out: THREE.Vector3[] = [];
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps; j++) {
          out.push(
            new THREE.Vector3((-0.5 + i / steps) * width * 0.98, (-0.5 + j / steps) * height * 0.98, 0.004)
              .applyMatrix4(face.matrixWorld),
          );
        }
      }
      return out;
    }

    /** The first thing between a sign's face and the camera, if there is one. */
    function firstBlocker(face: THREE.Mesh, toCam: THREE.Vector3): string | null {
      const ray = new THREE.Raycaster();
      ray.far = 400;
      for (const p of facePoints(face)) {
        ray.set(p, toCam);
        const hit = ray
          .intersectObject(venue.floor1, true)
          .find((h) => h.object !== face && h.distance > 0.02);
        if (hit) return `${hit.object.name || hit.object.parent?.name || 'unnamed'} at y=${hit.point.y.toFixed(2)}`;
      }
      return null;
    }

    it('faces every Zaal numeral toward the camera, never away from it', () => {
      const normal = new THREE.Vector3();
      for (const deg of DIORAMA_ELEVATIONS_DEG) {
        const toCam = dioramaToCameraAtDeg(deg);
        for (const n of DEVOXX) {
          const face = venue.group.getObjectByName(`zaal-face-${n}`) as THREE.Mesh;
          expect(face, `no numeral face for room ${n}`).toBeDefined();
          face.updateWorldMatrix(true, false);
          normal.set(0, 0, 1).transformDirection(face.matrixWorld).normalize();
          // Square-on is 1 and edge-on is 0; anything at or below 0 is a sign
          // painted on the back of a wall.
          expect(normal.dot(toCam), `zaal ${n} faces away from the camera at ${deg}°`).toBeGreaterThan(0.5);
        }
      }
    });

    it('keeps the soffit and everything else overhead out of every panel\'s box', () => {
      const overhead = venue.floor1.getObjectByName('overhead') as THREE.Object3D;
      expect(overhead, 'no overhead group').toBeDefined();
      const ceiling: Array<{ name: string; box: THREE.Box3 }> = [];
      overhead.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          ceiling.push({ name: o.name || o.parent?.name || 'overhead', box: new THREE.Box3().setFromObject(o) });
        }
      });
      expect(ceiling.length).toBeGreaterThan(0);

      for (const n of DEVOXX) {
        const panel = venue.group.getObjectByName(`zaal-sign-${n}`) as THREE.Object3D;
        const box = new THREE.Box3().setFromObject(panel);
        for (const c of ceiling) {
          expect(
            box.intersectsBox(c.box),
            `zaal ${n}'s panel (y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)}) is cut by "${c.name}"`,
          ).toBe(false);
        }
      }
    });

    it('leaves a clear line from every Zaal numeral to the camera, at every chapter pitch', () => {
      for (const deg of DIORAMA_ELEVATIONS_DEG) {
        const toCam = dioramaToCameraAtDeg(deg);
        for (const n of DEVOXX) {
          const face = venue.group.getObjectByName(`zaal-face-${n}`) as THREE.Mesh;
          const blocker = firstBlocker(face, toCam);
          expect(blocker, `zaal ${n} is hidden behind ${blocker} at ${deg}°`).toBeNull();
        }
      }
    });

    it('does the same for the blue Dutch wayfinding signs, both of them', () => {
      for (const name of ['wayfinding-top', 'wayfinding-bottom']) {
        const face = venue.group.getObjectByName(name) as THREE.Mesh;
        expect(face, `missing ${name}`).toBeDefined();
        for (const deg of DIORAMA_ELEVATIONS_DEG) {
          const toCam = dioramaToCameraAtDeg(deg);
          face.updateWorldMatrix(true, false);
          const normal = new THREE.Vector3(0, 0, 1).transformDirection(face.matrixWorld).normalize();
          expect(normal.dot(toCam), `${name} faces away at ${deg}°`).toBeGreaterThan(0.5);
          const blocker = firstBlocker(face, toCam);
          expect(blocker, `${name} is hidden behind ${blocker} at ${deg}°`).toBeNull();
        }
      }
    });

    it('makes the numeral panel, not the blank poster box, the dominant colour block', () => {
      for (const n of DEVOXX) {
        const panel = new THREE.Box3().setFromObject(
          venue.group.getObjectByName(`zaal-face-${n}`) as THREE.Object3D,
        );
        const poster = new THREE.Box3().setFromObject(
          venue.group.getObjectByName(`poster-box-${n}`) as THREE.Object3D,
        );
        const ps = panel.getSize(new THREE.Vector3());
        const bs = poster.getSize(new THREE.Vector3());
        // Frontal area, which is what "reads as a colour block from down the
        // corridor" means once both are square to the same camera.
        expect(ps.x * ps.y, `zaal ${n}'s numeral is smaller than its poster box`).toBeGreaterThan(
          bs.x * bs.y * 1.5,
        );
      }
    });
  });

  it('carries the Devoxx-flavour signs the brief asks for', () => {
    for (const name of ['entrance-sign', 'catering-board', 'wifi-sign', 'wayfinding-top', 'wayfinding-bottom']) {
      expect(venue.group.getObjectByName(name), `missing ${name}`).toBeDefined();
    }
  });

  /*
   * Michele: *"I don't get how to enter the reception."* There is one way from the
   * hall to the lobby and it is the stepped threshold; what was missing was anything
   * that said so. The plate has to hang over the steps and FACE THE HALL, which is
   * the half of "put a sign up" that is easy to get wrong.
   */
  it('signs the way to reception, over the steps and facing the hall', () => {
    const sign = venue.group.getObjectByName('reception-wayfinding') as THREE.Mesh;
    expect(sign, 'missing reception-wayfinding').toBeDefined();
    const p = sign.getWorldPosition(new THREE.Vector3());
    // Over the head of the threshold: at the hall's right edge, just north of the
    // opening the steps run through.
    expect(p.x).toBeGreaterThan(m(GF.hall.x + GF.hall.w - 10));
    expect(p.z).toBeLessThan(m(GF.openings[0][1]));
    expect(p.z).toBeGreaterThan(m(GF.openings[0][0] - 20));
    // Facing the camera side, not the lobby: its normal must point +z.
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(sign.getWorldQuaternion(new THREE.Quaternion()));
    expect(n.z).toBeGreaterThan(0.5);
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
    for (const key of ['hall', 'catering', 'tech', 'store', 'reception', 'coatroom', 'bof', 'toilets', 'entrance']) {
      expect(venue.roomAnchors.get(key), `missing anchor "${key}"`).toBeDefined();
    }
    for (const name of ['roller-door', 'breaker-panel', 'network-rack', 'badge-printer', 'main-stair-gate']) {
      expect(venue.group.getObjectByName(name), `missing ${name}`).toBeDefined();
    }
  });

  /*
   * Michele, tonight: *"where is the wifi password graffiti? It should be
   * visible!"* It was sim-only — chapter 2 published it as a `poster` prop and the
   * prop style draws every poster as a pale lightbox, so the paint never existed.
   * Now the venue paints it, and it has to stay on the wall chapter 2 reads.
   */
  it('paints the wifi spray tag on the hall wall the chapter reads it off', () => {
    const tag = venue.group.getObjectByName('wifi-tag');
    expect(tag, 'no spray tag on the hall wall').toBeDefined();
    const box = new THREE.Box3().setFromObject(tag as THREE.Object3D);
    // One number, in the venue: `WIFI_TAG` is what the renderer paints and what
    // chapter 2's beam has to find. It was written down twice, at x 400 in both
    // places, and the second copy is how the password ended up behind chapter
    // 3's bar counter.
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(m(WIFI_TAG.x), 1);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(m(GF.hall.y + T + 0.6), 1);
    // Paint, not a lightbox: it must not out-glow the real signs.
    const mat = (tag as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(mat.emissiveIntensity).toBeLessThan(0.4);
  });

  /**
   * ...and nothing else on that wall stands in front of it.
   *
   * Michele, 25 Sep 2026: *"The bar covers the wifi graffiti at the moment."* It
   * did: the tag is 88 px of paint centred on the hall's north wall and chapter
   * 3's bar counter is 92 px of the same wall, and they overlapped almost
   * exactly. Both rects live in `geometry.ts` now so this can be asked.
   */
  it('keeps the bar counter off the spray tag', () => {
    const tag = { x: WIFI_TAG.x - WIFI_TAG_W / 2, w: WIFI_TAG_W };
    const gap = Math.max(BAR_RECT.x - (tag.x + tag.w), tag.x - (BAR_RECT.x + BAR_RECT.w));
    expect(
      gap,
      `the bar (${BAR_RECT.x}..${BAR_RECT.x + BAR_RECT.w}) stands in front of the tag (${tag.x}..${tag.x + tag.w})`,
    ).toBeGreaterThan(10);
  });

  /** The bar is called something, and until now it was called it only in dialogue. */
  it('paints the bar’s name on the wall behind its taps', () => {
    const sign = venue.group.getObjectByName('bar-sign-hall');
    expect(sign, 'The Finally Block has no sign').toBeDefined();
    const box = new THREE.Box3().setFromObject(sign as THREE.Object3D);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(m(BAR_RECT.x + BAR_RECT.w / 2), 1);
    // Above the graffiti on the same wall, which is the one thing on that wall
    // with a known height — the hall floor is not at y 0 (`LOBBY_RISE_M`).
    const tag = venue.group.getObjectByName('wifi-tag') as THREE.Object3D;
    const tagBox = new THREE.Box3().setFromObject(tag);
    expect(box.min.y, 'the name is hung down among the taps').toBeGreaterThan(tagBox.max.y - 0.6);
  });

  /*
   * The printed WiFi notice used to hang at `GF.reception.y - 17` = y 371, which
   * is inside `GF.coatroom` (262..384) — a sign nailed up inside a closed room.
   */
  it('hangs the printed wifi notice where somebody can read it, not inside the wardrobe', () => {
    const sign = venue.group.getObjectByName('wifi-sign');
    expect(sign, 'no wifi notice').toBeDefined();
    const box = new THREE.Box3().setFromObject(sign as THREE.Object3D);
    const cz = (box.min.z + box.max.z) / 2;
    const co = GF.coatroom;
    expect(cz < m(co.y) || cz > m(co.y + co.h), 'the notice is inside the wardrobe').toBe(true);
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

/**
 * THE LEVEL CHANGE (`docs/ground-floor-lobby-fix.md`).
 *
 * The lobby stands half a metre above the exhibition hall and the two are joined
 * by one wide, shallow flight — the small staircase. The sim carries that as a
 * single opening in the hall's right edge; this is the diorama's half of it, and
 * it is asserted by RAY, not by name, because "is there a wall here" is the thing
 * the four fictional openings passed for three rounds.
 */
describe('the exhibition level is built on two levels', () => {
  const hallY = -STOREY_H_M;
  const lobbyY = -STOREY_H_M + LOBBY_RISE_M;

  const anchorY = (key: string): number =>
    (venue.roomAnchors.get(key) as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y;

  it('stands every lobby block half a metre above every hall block', () => {
    for (const key of ['hall', 'catering', 'tech', 'store']) {
      expect(anchorY(key), `${key} should be on the hall floor`).toBeCloseTo(hallY, 5);
    }
    for (const key of ['reception', 'coatroom', 'bof', 'toilets', 'entrance']) {
      expect(anchorY(key), `${key} should be on the raised lobby plate`).toBeCloseTo(lobbyY, 5);
    }
    expect(anchorY('reception') - anchorY('hall')).toBeCloseTo(LOBBY_RISE_M, 5);
  });

  it('bridges them with the stepped threshold, on the plot\'s own footprint', () => {
    const steps = venue.group.getObjectByName('threshold-steps');
    expect(steps, 'no threshold flight').toBeDefined();
    const box = new THREE.Box3().setFromObject(steps as THREE.Object3D);
    const st = GF.smallStairs;
    expect(box.min.x).toBeCloseTo(m(st.x), 1);
    expect(box.max.x).toBeCloseTo(m(st.x + st.w), 1);
    expect(box.min.z).toBeCloseTo(m(st.y), 1);
    expect(box.max.z).toBeCloseTo(m(st.y + st.h), 1);
    // It starts at the lobby's walking surface and its mass reaches the hall floor.
    expect(box.max.y).toBeGreaterThan(lobbyY - 0.02);
    expect(box.max.y).toBeLessThan(lobbyY + 0.1);
    expect(box.min.y).toBeLessThanOrEqual(hallY);
  });

  it('closes the hall\'s right edge everywhere except across those steps', () => {
    const ray = new THREE.Raycaster();
    ray.far = 2;
    const st = GF.smallStairs;
    const at = (simY: number): THREE.Intersection[] => {
      ray.set(
        new THREE.Vector3(m(GF.hall.x + GF.hall.w) - 0.6, hallY + 1.0, m(simY)),
        new THREE.Vector3(1, 0, 0),
      );
      return ray.intersectObject(venue.ground, true);
    };
    // Solid above the threshold and below it...
    for (const simY of [130, 200, 260, 600, 650]) {
      expect(at(simY).length, `the hall's right edge is open at y=${simY}`).toBeGreaterThan(0);
    }
    // ...and open across it, at every quarter of its width.
    for (const k of [0.25, 0.5, 0.75]) {
      const simY = st.y + st.h * k;
      expect(at(simY).length, `the threshold is blocked at y=${Math.round(simY)}`).toBe(0);
    }
  });

  it('starts the main staircase from the lobby floor, with its gate at the foot', () => {
    const main = venue.group.getObjectByName('ground-stair-main') as THREE.Object3D;
    const gate = venue.group.getObjectByName('main-stair-gate') as THREE.Object3D;
    expect(main).toBeDefined();
    expect(gate).toBeDefined();
    const flight = new THREE.Box3().setFromObject(main);
    // Its foot is on the raised plate, not on the hall floor — the flight's own
    // 0.1 m skirt is all that hangs below the lobby's walking surface.
    expect(flight.min.y).toBeGreaterThan(lobbyY - 0.15);
    expect(flight.min.y).toBeLessThan(lobbyY + 0.05);
    expect(flight.min.y - hallY).toBeGreaterThan(0.3);
    // ...and it climbs north, so the gate sits at its southern, downhill end.
    const g = gate.getWorldPosition(new THREE.Vector3());
    expect(g.z).toBeGreaterThan(m(GF.mainStair.y + GF.mainStair.h) - 0.1);
    expect(g.y).toBeGreaterThan(lobbyY);
  });
});
