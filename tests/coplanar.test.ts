/**
 * NO TWO WALKING SURFACES MAY CLAIM THE SAME PLANE.
 *
 * Michele, three times now, in three different places: *"Something is flickering at
 * the entrance"*, *"some flickering lights (hard to show on screenshot)"*, and —
 * with the location that finally made it findable — *"chapter 2/3 the passage
 * between the reception zone and the main hall. There's a line that flicker when
 * the robot is walking."*
 *
 * All three are the same fault. Two faces at exactly the same height, overlapping in
 * plan, and the depth buffer picking a winner per pixel per frame. It sits still
 * until a light moves across it, which is why it reads as flickering **when a robot
 * walks** and why it never survived a screenshot.
 *
 * The one he reported: the raised lobby plate started 6 px west of `LOBBY_X` and the
 * threshold's top tread ended there, both with their top faces at `y = -5.0000`
 * exactly — a 0.48 m ribbon running the flight's whole 22.6 m, plus the concrete
 * riser caps above and below it. This scan found a second one nobody had reported,
 * one floor up: the corridor carpet ran straight over the main staircase's head,
 * **12.46 m²** of it at `y = 0.0000`.
 *
 * So the test is the class, not the two instances. It walks the built venue, takes
 * every mesh's top face, and fails on any pair that share a height to within a
 * millimetre and overlap in plan — but only at the heights a robot actually walks
 * at, because a pair of wall tops meeting at a corner is a speckle nobody sees from
 * a diorama camera and there are a dozen of those by construction.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { buildVenue } from '../src/render/venue/index';
import { LOBBY_RISE_M } from '../src/sim/geometry';
import { STOREY_H_M } from '../src/sim/units';

interface Face {
  name: string;
  y: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  area: number;
}

/** Every mesh's top face in world space, with the path that names it. */
function topFaces(root: THREE.Object3D): Face[] {
  root.updateMatrixWorld(true);
  const out: Face[] = [];
  const box = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    box.setFromObject(mesh);
    if (!Number.isFinite(box.min.x)) return;
    const path: string[] = [];
    let p: THREE.Object3D | null = o;
    while (p) {
      if (p.name) path.unshift(p.name);
      p = p.parent;
    }
    out.push({
      name: path.join('/') || '(unnamed)',
      y: box.max.y,
      x0: box.min.x,
      x1: box.max.x,
      z0: box.min.z,
      z1: box.max.z,
      area: (box.max.x - box.min.x) * (box.max.z - box.min.z),
    });
  });
  return out;
}

/**
 * The heights a robot stands at, per storey, in world metres.
 *
 * The ground floor has two — the hall datum and the raised lobby plate half a metre
 * over it — and the first floor one. A band of ±0.12 m catches a tread, a carpet and
 * a decal without reaching the tops of the knee-high things (door leaves, upstands)
 * that legitimately overlap each other at 0.52 m.
 */
const BANDS: ReadonlyArray<{ floor: 'ground' | 'floor1'; y: number }> = [
  { floor: 'ground', y: -STOREY_H_M },
  { floor: 'ground', y: -STOREY_H_M + LOBBY_RISE_M },
  { floor: 'floor1', y: 0 },
];
const BAND = 0.12;
/** Below this a pair is a corner or a seam, not a ribbon the camera can see. */
const MIN_AREA = 0.05;

describe('the venue has no z-fighting at floor level', () => {
  it('no two walking surfaces are coplanar and overlapping', () => {
    const v = buildVenue();
    const roots: Record<'ground' | 'floor1', THREE.Object3D> = { ground: v.ground, floor1: v.floor1 };
    const faults: string[] = [];
    let pairs = 0;
    for (const key of ['ground', 'floor1'] as const) {
      const bands = BANDS.filter((b) => b.floor === key);
      const faces = topFaces(roots[key]).filter(
        (f) => f.area > 0.2 && bands.some((b) => Math.abs(f.y - b.y) < BAND),
      );
      // Non-vacuous: each storey really does hand us a floor's worth of surfaces.
      expect(faces.length, `${key} produced no floor-level faces at all`).toBeGreaterThan(20);
      for (let i = 0; i < faces.length; i++) {
        for (let j = i + 1; j < faces.length; j++) {
          const a = faces[i];
          const b = faces[j];
          if (Math.abs(a.y - b.y) > 0.001) continue;
          const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
          const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
          pairs++;
          if (ox * oz <= MIN_AREA || ox <= 0 || oz <= 0) continue;
          faults.push(
            `${key} y=${a.y.toFixed(4)} ${(ox * oz).toFixed(2)} m2 — ${a.name} vs ${b.name}`,
          );
        }
      }
    }
    // Non-vacuous the other way: there ARE coplanar pairs to reject, they just do
    // not overlap. A scan that compared nothing would pass this file silently.
    expect(pairs, 'nothing was compared at all').toBeGreaterThan(50);
    expect(faults, `z-fighting ribbons:\n  ${faults.join('\n  ')}`).toHaveLength(0);
  });
});
