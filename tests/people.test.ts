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
import { LANYARD } from '../src/sim/lanyards';
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

  /**
   * Claude (`src/sim/cameos.ts`): a screen for a head, which REPLACES the head
   * rather than sitting on it — a skull poking out of a monitor is not a
   * character, it is a costume. And it comes off again: figures are pooled, and
   * whoever wears this one next has a head.
   */
  it('wears a screen for a head when the sim says so, instead of the head and hair', () => {
    const pm = mk();
    const shown = (n: string): boolean => (pm.root.getObjectByName(n) as THREE.Object3D).visible;
    pm.pose(person({ screen: true }), 0, 0);
    expect(shown('screen-head')).toBe(true);
    expect(shown('head')).toBe(false);
    expect(shown('hair')).toBe(false);
    // Where the head was: the same height to within a head's radius.
    const box = part(pm, 'screen-head');
    pm.pose(person(), 0, 0);
    expect(shown('screen-head')).toBe(false);
    expect(shown('head')).toBe(true);
    expect(shown('hair')).toBe(true);
    const skull = part(pm, 'head');
    const r = (skull.max.y - skull.min.y) / 2;
    expect(Math.abs((box.max.y + box.min.y) / 2 - (skull.max.y + skull.min.y) / 2)).toBeLessThan(r);
    // Wider than a head, and not as tall: a screen, not a cube.
    expect(box.max.x - box.min.x).toBeGreaterThan(skull.max.x - skull.min.x);
    expect(box.max.y - box.min.y).toBeLessThan(skull.max.y - skull.min.y);
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
  it('costs sixteen meshes and two materials of its own', () => {
    const a = mk();
    const b = mk();
    a.pose(person(), 0, 0);
    b.pose(person({ seed: 12 }), 0, 0);
    let meshes = 0;
    a.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    /*
     * Twelve became seventeen on 28 Sep 2026, and the five are named: a polo
     * collar, a pair of glasses, a headset boom and a laptop's two halves.
     *
     * Michele: *"Stephan must be identifiable: Devoxx shirt, mic, glasses as
     * accessories"*, and, on the keynote speaker: *"He could have a laptop in hand
     * to fix the slides?"* They are hidden on everybody who is not one of those
     * two, and they cost geometries the crowd already shares — the budget this
     * test guards is the per-figure one, and it is five boxes.
     *
     * Seventeen became fifteen on 29 Sep 2026: the laptop went (Michele: *"the
     * laptop is a bit awkward"*), and the disguise that replaced it is built
     * only on the one figure asked to wear it — see the test below. And fifteen
     * became sixteen the same day, the one named too: Claude's screen head
     * (`Person.screen`). Michele: *"They are you and me... one should be able to
     * understand that's you."* One more shared box, hidden on everybody else, its
     * materials built the first time somebody wears it.
     */
    expect(meshes).toBeLessThanOrEqual(16);
    const geo = (pm: PersonModel, n: string): THREE.BufferGeometry => (pm.root.getObjectByName(n) as THREE.Mesh).geometry;
    for (const n of ['head', 'torso', 'leg-l', 'contact']) expect(geo(a, n)).toBe(geo(b, n));
    const mat = (pm: PersonModel, n: string): THREE.Material => (pm.root.getObjectByName(n) as THREE.Mesh).material as THREE.Material;
    // Clothes are per figure; skin is shared out of a palette of five. The collar
    // is the second per-figure material, for the same reason: the chapter colours it.
    expect(mat(a, 'torso')).not.toBe(mat(b, 'torso'));
    expect(mat(a, 'collar')).not.toBe(mat(b, 'collar'));
    // ...and everything else on the accessories is shared.
    for (const n of ['glasses', 'mic']) expect(mat(a, n)).toBe(mat(b, n));
  });

  /**
   * The keynote speaker's disguise (`Person.disguise`), which replaced the laptop.
   *
   * Michele, 29 Sep 2026: *"the lanyard is not showing, the laptop is a bit
   * awkward ... A mask since it's yet mysterious? a cape?"* The laptop was posed
   * across the chest, over the ribbon. The disguise's own long ribbon has to be
   * there and in the sim's colour, the badge has to face UP towards a camera
   * that looks down, and a pooled figure that stops being the speaker must lose
   * the whole kit.
   */
  it('dresses the keynote speaker in the disguise, ribbon showing, and takes it off again', () => {
    const pm = mk();
    const disguise = { lining: '#e8a01c', badge: ['KEYNOTE', '?'] };
    pm.pose(person({ role: 'speaker', lanyard: LANYARD.keynote, disguise }), 0, 0);
    const kit = pm.root.getObjectByName('disguise') as THREE.Object3D;
    expect(kit.visible).toBe(true);
    for (const n of ['cape', 'mask', 'keynote-badge', 'keynote-strap-l', 'keynote-strap-r', 'clicker']) {
      expect(pm.root.getObjectByName(n), n).toBeDefined();
    }
    // The straps are the keynote ribbon (the headless fallback paints its key colour).
    const strap = pm.root.getObjectByName('keynote-strap-l') as THREE.Mesh;
    expect((strap.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(LANYARD.keynote.slice(1));
    // The badge's face (+z) is tipped towards the ceiling.
    const badge = pm.root.getObjectByName('keynote-badge') as THREE.Mesh;
    pm.root.updateMatrixWorld(true);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(badge.getWorldQuaternion(new THREE.Quaternion()));
    expect(n.y).toBeGreaterThan(0.4);
    // No laptop anywhere.
    expect(pm.root.getObjectByName('laptop-lid')).toBeUndefined();
    // ...and a pooled figure that is somebody else next frame wears none of it.
    pm.pose(person({ seed: 5 }), 0, 0);
    expect(kit.visible).toBe(false);
    expect((pm.root.getObjectByName('clicker') as THREE.Object3D).visible).toBe(false);
  });
});
