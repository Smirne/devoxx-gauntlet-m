/**
 * The crowd — `src/render/people.ts`.
 *
 * The people were a cylinder with a sphere on top until 25 Sep 2026, and the
 * thing that made them worth replacing is also the thing worth asserting: a
 * figure has to be the SAME figure every frame. The old height jitter was
 * derived from `x` and `y`, so a visitor changed height as they walked — nobody
 * sees that and everybody feels it. `Person.seed` is the fix and this file is
 * what holds it.
 *
 * Three.js runs perfectly well headless, so these are real meshes with real
 * transforms, measured the same way `tests/venue.smoke.test.ts` measures a venue.
 */

import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { buildPerson, type PersonModel } from '../src/render/people';
import { m } from '../src/sim/units';
import type { Person } from '../src/sim/types';

const models: PersonModel[] = [];
const mk = (): PersonModel => {
  const p = buildPerson();
  models.push(p);
  return p;
};
afterEach(() => {
  for (const p of models.splice(0)) p.dispose();
});

const person = (over: Partial<Person> = {}): Person => ({
  x: 100,
  y: 200,
  r: 5,
  role: 'visitor',
  colour: '#8c9bb9',
  seed: 7,
  ...over,
});

/**
 * World-space box of one named part of a posed figure.
 *
 * `updateMatrixWorld` first, every time: `Box3.setFromObject` only refreshes the
 * object it is handed, not the chain above it, and a figure that has never been
 * rendered has an identity matrix all the way up. Without this the legs measure
 * as their own local box and every pose looks the same — which is exactly the
 * wrong way for this file to be wrong.
 */
function part(pm: PersonModel, name: string): THREE.Box3 {
  const o = pm.root.getObjectByName(name);
  expect(o, `no part named ${name}`).toBeDefined();
  pm.root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o as THREE.Object3D);
}

const height = (pm: PersonModel): number => {
  pm.root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(pm.root).max.y;
};

describe('a person', () => {
  it('is built out of a head, a torso, two arms and two legs', () => {
    const pm = mk();
    pm.pose(person(), 0, 0);
    for (const n of ['head', 'hair', 'torso', 'leg-l', 'leg-r', 'arm-l', 'arm-r', 'contact']) {
      expect(pm.root.getObjectByName(n), n).toBeDefined();
    }
  });

  /**
   * THE BUG THE SEED EXISTS FOR. The same person, two different places, is the
   * same person; two different seeds in the same place are not.
   */
  it('is the same body wherever they are standing, and a different one per seed', () => {
    const a = mk();
    const b = mk();
    a.pose(person({ x: 100, y: 200 }), 0, 0);
    const h1 = height(a);
    a.pose(person({ x: 640, y: 55 }), 0, 0);
    expect(height(a)).toBeCloseTo(h1, 9);

    b.pose(person({ x: 100, y: 200, seed: 8 }), 0, 0);
    expect(Math.abs(height(b) - h1)).toBeGreaterThan(0.005);
  });

  it('stands on the floor it is given', () => {
    const pm = mk();
    pm.pose(person(), 0, 0);
    pm.root.updateMatrixWorld(true);
    const low = new THREE.Box3().setFromObject(pm.root).min.y;
    pm.pose(person(), 3.5, 0);
    pm.root.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(pm.root).min.y).toBeCloseTo(low + 3.5, 6);
    // ...and where the sim put them, in metres.
    expect(pm.root.position.x).toBeCloseTo(m(100), 9);
    expect(pm.root.position.z).toBeCloseTo(m(200), 9);
  });

  /**
   * The gait, which is the whole reason the sim now publishes a speed: legs apart
   * while walking, together at rest. Measured as the z spread of the two legs,
   * because a leg that swings from the hip moves forward and back, not sideways.
   */
  it('swings its legs in proportion to how fast it is going, and stops when it stops', () => {
    const pm = mk();
    /*
     * `face: PI/2` puts the figure's own axes on the world's (`yaw = PI/2 - face`),
     * so a leg swinging from the hip moves in world z and the spread is readable.
     * At any other heading the legs' sideways offset leaks into z as well.
     */
    const spread = (speed: number, t: number): number => {
      pm.pose(person({ speed, face: Math.PI / 2 }), 0, t);
      const l = part(pm, 'leg-l');
      const r = part(pm, 'leg-r');
      return Math.abs((l.min.z + l.max.z) / 2 - (r.min.z + r.max.z) / 2);
    };
    // The phase starts at the seed rather than at zero, so sweep a whole second
    // and take the widest the stride ever gets rather than guessing where it is.
    const widest = (speed: number): number => {
      let w = 0;
      for (let i = 0; i < 60; i++) w = Math.max(w, spread(speed, i / 60));
      return w;
    };
    const fast = widest(40);
    const slow = widest(8);
    expect(fast).toBeGreaterThan(0.2);
    expect(slow).toBeLessThan(fast * 0.6);
    // Standing still: the two legs are in the same place, whatever the clock says.
    for (const at of [0, 0.3, 1.7, 9.1]) expect(spread(0, at)).toBeLessThan(1e-9);
  });

  it('faces where the sim says, and picks a angle of its own when the sim does not', () => {
    const pm = mk();
    const yawOf = (): number => {
      const g = pm.root.children.find((c) => c.type === 'Group') as THREE.Object3D;
      return g.rotation.y;
    };
    pm.pose(person({ face: 0 }), 0, 0);
    expect(yawOf()).toBeCloseTo(Math.PI / 2, 9);
    pm.pose(person({ face: Math.PI / 2 }), 0, 0);
    expect(yawOf()).toBeCloseTo(0, 9);
    // No heading: an angle off the world axes, so somebody waiting reads as waiting.
    pm.pose(person({ face: undefined }), 0, 0);
    const idle = yawOf();
    expect(idle).toBeGreaterThan(Math.PI * 0.7);
    expect(idle).toBeLessThan(Math.PI * 1.3);
  });

  /**
   * Sitting down. The drop is not cosmetic: a seated figure at standing hip height
   * is a standing figure with its knees bent, and in Room 8 that is a row of
   * people apparently hovering over their seats.
   */
  it('sits lower than it stands, and stops moving when it does', () => {
    const pm = mk();
    pm.pose(person({ role: 'visitor', speed: 30, face: Math.PI / 2 }), 0, 0);
    const standing = height(pm);
    pm.pose(person({ role: 'seated', speed: 0, face: Math.PI / 2 }), 0, 0);
    const sitting = height(pm);
    expect(sitting).toBeLessThan(standing - 0.2);
    // Still a head above a seat back, or the room reads as empty.
    expect(sitting).toBeGreaterThan(1.1);
    const l = part(pm, 'leg-l');
    const r = part(pm, 'leg-r');
    expect(Math.abs((l.min.z + l.max.z) / 2 - (r.min.z + r.max.z) / 2)).toBeLessThan(1e-9);
  });

  it('wears the colour the chapter gives it', () => {
    const pm = mk();
    pm.pose(person({ colour: '#ff0000' }), 0, 0);
    const torso = pm.root.getObjectByName('torso') as THREE.Mesh;
    expect((torso.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ff0000');
  });

  /**
   * A crowd is thirty-six of these in chapter 3 and eighty-four in chapter 4, so
   * the per-figure cost is the whole budget. Twelve meshes — seven of the body,
   * the three things somebody might be carrying, a hat, and the contact disc —
   * and the geometries and every material but the clothes are shared between
   * every figure ever built.
   */
  it('costs twelve meshes and one material of its own', () => {
    const a = mk();
    const b = mk();
    a.pose(person(), 0, 0);
    b.pose(person({ seed: 12 }), 0, 0);
    let meshes = 0;
    a.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBeLessThanOrEqual(12);
    const geo = (pm: PersonModel, n: string): THREE.BufferGeometry => (pm.root.getObjectByName(n) as THREE.Mesh).geometry;
    for (const n of ['head', 'torso', 'leg-l', 'contact']) expect(geo(a, n)).toBe(geo(b, n));
    const mat = (pm: PersonModel, n: string): THREE.Material => (pm.root.getObjectByName(n) as THREE.Mesh).material as THREE.Material;
    // Clothes are per figure; skin is shared out of a palette of five.
    expect(mat(a, 'torso')).not.toBe(mat(b, 'torso'));
  });
});
