/**
 * THE THING THAT OPENS THE DOOR HAS TO LOOK LIKE A THING THAT OPENS A DOOR.
 *
 * Michele, with a screenshot of chapter 1's mount beat — Droid up on Biggy's
 * shoulders, the corridor blacked out behind them: **"the part that needs a
 * shape is the green Cube that opens the door"**.
 *
 * Measured before the fix, and this is the whole diagnosis:
 *
 * | question | measurement |
 * |---|---|
 * | how does `scene.ts` draw a `projector-panel`? | `PROPS['projector-panel'] = { h: 0.9, color: 0x39414f, tl: true, lift: 2.5, glow: 0x6b4406 }`, through `drawProp` |
 * | so what is on screen? | one lit cuboid, 1.6 m along the corridor by **1.92 m deep** by 0.9 m tall |
 * | which of its faces does the camera see most of? | its **LID**: 3.07 m2 x 0.500 = 1.54 m2 projected, against 1.44 x 0.840 = 1.21 m2 of front |
 * | and what changes when Droid presses it? | the emissive goes from amber to green. The box does not move |
 *
 * A box whose largest visible surface is its own top is a box seen from above,
 * which is exactly the read Michele reported — it floats, it has no front, and
 * nothing about it says "release". `src/render/release-panel.ts` models it: a
 * plate on standoffs, a hooded housing 0.24 m deep instead of 1.92, a pull
 * lever, a mushroom release, a key switch, an engraved Dutch plate, a lamp, and
 * the conduit and hanger rods that tie it to the corridor vault overhead.
 *
 * `facesBeatLid` below is the test that would have caught the original: against
 * the old renderer it measures the plain box's 1.21 / 1.54 = **0.79** and fails.
 *
 * Nothing here touches the sim. The rect and `PANEL_REACH` are the sim's, and
 * the rect is wrong in two ways this file measures but does not change — see
 * `scratchpad/panel-round/panel-rect.patch`, which is handed up rather than
 * applied because the mount beat is tuned around the reach.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { dioramaToCamera } from '../src/render/camera';
import { PANEL_H_M, PANEL_LIFT_M, buildReleasePanel } from '../src/render/release-panel';
import { corridorSoffit, corridorSoffitY } from '../src/render/venue/floor1';
import { createGame } from '../src/sim/game';
import { corridorColumns } from '../src/sim/geometry';
import type { Prop } from '../src/sim/types';
import { m } from '../src/sim/units';
// Vite's own `?raw`, the way `tests/seats.test.ts` and `tests/clue-plate.test.ts`
// reach into the same file: `PROPS` lives inside `src/render/scene.ts` and the
// module needs a WebGL canvas to build, which a node test has not got.
import SCENE_SRC from '../src/render/scene.ts?raw';

/** The `projector-panel` prop chapter 1 publishes, from the sim itself. */
function panelProp(): Prop {
  const g = createGame({ seed: 20260930, chapter: 1, cards: false });
  for (let i = 0; i < 4; i++) g.update(0.033);
  const p = g.snapshot().props.find((o) => o.kind === 'projector-panel');
  if (!p) throw new Error('chapter 1 no longer publishes a projector-panel');
  return p;
}

/** The entry `PROPS` in `src/render/scene.ts` declares for one kind. */
function propsEntry(kind: string): string {
  const table = /const PROPS:[\s\S]*?\n};/.exec(SCENE_SRC);
  expect(table, 'src/render/scene.ts no longer declares a PROPS table').not.toBeNull();
  const hit = new RegExp(`(?:^|\\n)\\s*['"]?${kind}['"]?:\\s*\\{([^}]*)\\}`).exec((table as RegExpExecArray)[0]);
  expect(hit, `PROPS has no entry for "${kind}"`).not.toBeNull();
  return (hit as RegExpExecArray)[1];
}

/** The model, posed on the chapter's own rect at floor level. */
function posed(state: 'idle' | 'done' = 'idle'): { root: THREE.Group; dispose(): void; prop: Prop } {
  const prop = { ...panelProp(), state };
  const model = buildReleasePanel();
  model.pose(prop, 0);
  model.root.updateMatrixWorld(true);
  return { root: model.root, dispose: () => model.dispose(), prop };
}

/**
 * Projected area, in square metres, split by which way a surface faces.
 *
 * Every triangle in world space, weighted by `max(0, n · toCamera)`, bucketed by
 * the dominant axis of its normal: `front` is everything the camera reads as the
 * unit's face, `lid` is everything it reads as the top of a box. This is the
 * same arithmetic the module's header does by hand for the published rect, done
 * over the geometry that is actually drawn.
 */
function projected(root: THREE.Object3D): { front: number; lid: number; ends: number } {
  const cam = dioramaToCamera(1, new THREE.Vector3()).normalize();
  const out = { front: 0, lid: 0, ends: 0 };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    if (!pos) return;
    const index = geo.getIndex();
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const i0 = index ? index.getX(i) : i;
      const i1 = index ? index.getX(i + 1) : i + 1;
      const i2 = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      n.crossVectors(ab, ac);
      const area = n.length() / 2;
      if (area <= 0) continue;
      n.divideScalar(area * 2);
      const seen = n.dot(cam);
      if (seen <= 0) continue;
      const ax = Math.abs(n.x);
      const ay = Math.abs(n.y);
      const az = Math.abs(n.z);
      const bucket = ay >= ax && ay >= az ? 'lid' : az >= ax ? 'front' : 'ends';
      out[bucket] += area * seen;
    }
  });
  return out;
}

const emissiveOf = (mat: THREE.Material): THREE.Color =>
  (mat as THREE.MeshStandardMaterial).emissive ?? new THREE.Color(0, 0, 0);

const lit = (mat: THREE.Material): number => {
  const c = emissiveOf(mat);
  const i = (mat as THREE.MeshStandardMaterial).emissiveIntensity ?? 0;
  return (c.r + c.g + c.b) * i;
};

describe("chapter 1's door override is a modelled release, not a lit box", () => {
  /*
   * THE ONE THAT WOULD HAVE CAUGHT IT.
   *
   * Against the old renderer this reads `h: 0.9` and `lift: 2.5` out of
   * `PROPS['projector-panel']` — the literals of a table entry drawn as one box —
   * and fails with `expected '0.9' to be 'PANEL_H_M'`. It passes only when both
   * numbers are READ from the module that actually draws the thing, which is the
   * `KEYPAD_TOP_M` / `SEAT_TOP_M` pattern `tests/prop-geometry.ts` already uses.
   */
  it('declares the override at the modelled height, not a box height', () => {
    const body = propsEntry('projector-panel');
    const h = /\bh:\s*([A-Za-z0-9_$.]+)/.exec(body);
    const lift = /\blift:\s*([A-Za-z0-9_$.]+)/.exec(body);
    expect(h, "PROPS['projector-panel'] has no height").not.toBeNull();
    expect(lift, "PROPS['projector-panel'] has no lift").not.toBeNull();
    expect((h as RegExpExecArray)[1], "PROPS['projector-panel'] re-types the panel height").toBe('PANEL_H_M');
    expect((lift as RegExpExecArray)[1], "PROPS['projector-panel'] re-types the panel lift").toBe('PANEL_LIFT_M');
    // And the numbers behind them are the ones the collider sweep has always
    // measured: the change was the shape inside the band, not the band.
    expect(PANEL_H_M).toBeCloseTo(0.9, 6);
    expect(PANEL_LIFT_M).toBeCloseTo(2.5, 6);
  });

  /* The same thing from the other end: the draw path, not the table. */
  it('routes the override away from the generic drawProp path', () => {
    const dispatch = /function drawDressing[\s\S]*?\n  }/.exec(SCENE_SRC);
    expect(dispatch, 'src/render/scene.ts no longer has a drawDressing dispatch').not.toBeNull();
    const body = (dispatch as RegExpExecArray)[0];
    expect(body, 'the override still falls through to drawProp').toMatch(/p\.kind === 'projector-panel'/);
    expect(body.indexOf("'projector-panel'"), 'the override branch must come before the drawProp fallback').toBeLessThan(
      body.indexOf('else drawProp'),
    );
  });

  /**
   * `facesBeatLid` — the measurement Michele's screenshot is a picture of.
   *
   * The diorama camera looks along (0.210, 0.500, 0.840). On the published rect
   * a solid box shows the camera 1.44 x 0.840 = 1.21 m2 of front and 3.07 x
   * 0.500 = 1.54 m2 of top, a ratio of **0.79**: more lid than face, which is
   * what "a big flat green cube" means. The modelled unit is 0.24 m deep
   * instead of 1.92 and its top is a hood rather than a plate, so the face wins
   * by a wide margin. Asserted as a ratio rather than an area so it survives the
   * rect patch, which changes both numbers.
   */
  it('shows the camera a face rather than a lid', () => {
    const u = posed();
    try {
      const p = projected(u.root);
      /*
       * The fault, for the record — and it has to be computed from the rect the
       * fault was ON, not from the live one. The old rect was 20 x 24 px, and a
       * solid box on it showed the camera 1.21 m2 of front against 1.54 m2 of
       * LID: the biggest thing on screen was the top of the box, which is what
       * "a big flat cube" means. The rect is 20 x 6 now, so reading these off
       * `u.prop` would quietly re-describe the fixed rect and assert nothing.
       */
      const OLD_W_PX = 20;
      const OLD_D_PX = 24;
      const boxFront = m(OLD_W_PX) * PANEL_H_M * 0.84;
      const boxLid = m(OLD_W_PX) * m(OLD_D_PX) * 0.5;
      expect(boxFront / boxLid, 'the old box showed more lid than face').toBeLessThan(1);
      // And the rect no longer claims that depth: the unit is 0.48 m deep, not 1.92.
      expect(m(u.prop.h ?? OLD_D_PX), 'the rect still claims a corridor of depth').toBeLessThan(1);
      expect(p.front / p.lid, `face ${p.front.toFixed(2)} m2 vs lid ${p.lid.toFixed(2)} m2`).toBeGreaterThan(2);
    } finally {
      u.dispose();
    }
  });

  it('puts every part of the unit inside the sim\'s own rect', () => {
    const u = posed();
    try {
      const box = new THREE.Box3().setFromObject(u.root);
      const x0 = m(u.prop.x);
      const z0 = m(u.prop.y);
      expect(box.min.x).toBeGreaterThanOrEqual(x0 - 1e-6);
      expect(box.max.x).toBeLessThanOrEqual(x0 + m(u.prop.w ?? 20) + 1e-6);
      expect(box.min.z).toBeGreaterThanOrEqual(z0 - 1e-6);
      expect(box.max.z).toBeLessThanOrEqual(z0 + m(u.prop.h ?? 24) + 1e-6);
      // Vertically the UNIT keeps the band the table declares; only the hangers
      // go above it, because what they reach for is above it. See below.
      expect(box.min.y).toBeCloseTo(PANEL_LIFT_M, 2);
    } finally {
      u.dispose();
    }
  });

  /**
   * It hangs off the building, and the length is read off the building.
   *
   * `corridorSoffit` in `src/render/venue/floor1.ts` is where the corridor
   * vault's underside is. The stays stop on it — straight up where there is
   * soffit overhead, raked back to its outer edge where there is not — so a
   * change to the vault moves them and neither file carries a second copy of the
   * other's numbers. Against a unit that simply hung in the air this is
   * `expected 3.40 to be close to 4.31`.
   */
  it('hangs off the corridor vault rather than floating in front of it', () => {
    const u = posed();
    try {
      const box = new THREE.Box3().setFromObject(u.root);
      const s = corridorSoffit();
      // The stays land ON the vault's underside: straight up where there is
      // soffit over the unit, raked back to its outer edge where there is not.
      // So the top of the model is somewhere on that sloping line between the
      // height above the unit's own back and the plate's outer edge.
      const lo = corridorSoffitY(Math.min(Math.max(box.min.z, s.z0), s.z1));
      expect(lo, 'the stays reach for something that is not the vault').not.toBeNull();
      expect(box.max.y, 'the stays stop under the soffit').toBeGreaterThan((lo as number) - 0.02);
      expect(box.max.y, 'the stays go through the soffit').toBeLessThan(s.y1 + 0.02);
      expect(box.max.y).toBeGreaterThan(PANEL_LIFT_M + PANEL_H_M);
    } finally {
      u.dispose();
    }
  });

  /**
   * THE SECOND THING WRONG WITH THE RECT, AND WHY THE UNIT IS NOT AT ITS BACK.
   *
   * `corridorColumns()` stands full 3.3 m shafts on the far side of the
   * corridor, and cinema B and C's meet at sim x 365..385 y 288..304 — across
   * the back half of the published rect. A unit drawn there is 70% hidden and
   * partly inside the columns; the published BOX got away with it only by being
   * 1.92 m deep, which is what put its lid in front of the player. `mountZ` in
   * `src/render/release-panel.ts` slides the unit forward inside its own rect
   * until it is clear, which is what this holds — and holds just as well after
   * the rect patch, where there is nothing to slide past.
   */
  it('stands clear of the corridor columns instead of inside them', () => {
    const u = posed();
    try {
      const box = new THREE.Box3().setFromObject(u.root);
      for (const c of corridorColumns().far) {
        const overlapX = m(c.x + c.w) > box.min.x && m(c.x) < box.max.x;
        if (!overlapX) continue;
        expect(
          box.min.z,
          `the unit is inside the corridor column at sim x ${c.x}..${c.x + c.w}`,
        ).toBeGreaterThanOrEqual(m(c.y + c.h));
      }
    } finally {
      u.dispose();
    }
  });

  /**
   * Four things change when the lock lets go, not one emissive.
   *
   * The old box changed colour and nothing else. A release that has been pulled
   * looks pulled: the lever stands up, the key is turned, the mushroom is in,
   * and the lamp and its legend go from held to released.
   */
  it('answers Prop.state with the controls, not only with a colour', () => {
    const idle = posed('idle');
    const done = posed('done');
    try {
      const gather = (root: THREE.Object3D): Map<string, THREE.Vector3> => {
        const out = new Map<string, THREE.Vector3>();
        let i = 0;
        root.traverse((o) => {
          const w = new THREE.Vector3();
          o.getWorldPosition(w);
          out.set(`${o.type}-${i++}`, w);
        });
        return out;
      };
      const a = gather(idle.root);
      const b = gather(done.root);
      let moved = 0;
      for (const [k, v] of a) {
        const w = b.get(k);
        if (w && v.distanceTo(w) > 0.01) moved++;
      }
      expect(moved, 'nothing on the unit moves when the lock lets go').toBeGreaterThanOrEqual(2);

      const lampOf = (root: THREE.Object3D): THREE.Color => {
        let hit: THREE.Color | null = null;
        root.traverse((o) => {
          if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === 'release/lamp') {
            hit = emissiveOf(o.material as THREE.Material);
          }
        });
        if (!hit) throw new Error('the unit has no lamp');
        return hit;
      };
      const held = lampOf(idle.root);
      const free = lampOf(done.root);
      expect(held.r, 'the held lamp is not red').toBeGreaterThan(held.g);
      expect(free.g, 'the released lamp is not green').toBeGreaterThan(free.r);
    } finally {
      idle.dispose();
      done.dispose();
    }
  });

  /**
   * A LIT FACE ON AN UNLIT BODY FLOATS — the Zaal panel's lesson, applied.
   *
   * And the other half of it: the thing the player is hunting is `idle` by
   * definition and chapter 1 is a blackout, so the unit has to be findable
   * before anyone has solved it. Both are one assertion: in the IDLE state, more
   * than one material on the body carries emissive, and the lamp is lit too.
   */
  it('lights its own body, not just its lamp, and does it while still idle', () => {
    const u = posed('idle');
    try {
      const glowing = new Set<string>();
      u.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mat = o.material as THREE.Material;
        if (lit(mat) > 0.01) glowing.add(mat.name);
      });
      expect(glowing.has('release/lamp'), 'the standby lamp is dark').toBe(true);
      const body = [...glowing].filter((n) => n !== 'release/lamp');
      expect(body.length, `only ${[...glowing].join(', ')} is lit — a lit face on an unlit body floats`).toBeGreaterThanOrEqual(2);
    } finally {
      u.dispose();
    }
  });

  /** A back plate screwed flat to its wall has no shadow under it. This one does. */
  it('holds its back plate off the mounting plane on standoffs', () => {
    const u = posed();
    try {
      let plate: THREE.Box3 | null = null;
      const pads: THREE.Box3[] = [];
      u.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const name = (o.material as THREE.Material).name;
        if (name === 'release/plate') plate = new THREE.Box3().setFromObject(o);
        if (name === 'release/dark') pads.push(new THREE.Box3().setFromObject(o));
      });
      expect(plate, 'the unit has no back plate').not.toBeNull();
      const back = (plate as unknown as THREE.Box3).min.z;
      // Something stands behind the plate, and holds it off by a real gap.
      const behind = pads.filter((pad) => pad.min.z < back - 1e-6);
      expect(behind.length, 'nothing holds the plate off its mounting plane').toBeGreaterThanOrEqual(2);
      const gap = back - Math.min(...behind.map((pad) => pad.min.z));
      expect(gap, 'the plate sits flat on its mounting plane').toBeGreaterThan(0.03);
    } finally {
      u.dispose();
    }
  });

  /** The controls are where a mounted Droid can reach and a standing one cannot. */
  it('puts its controls in the 0.30 m the mount actually buys', () => {
    const u = posed();
    try {
      let mushroom: THREE.Box3 | null = null;
      u.root.traverse((o) => {
        if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === 'release/hazard') {
          const b = new THREE.Box3().setFromObject(o);
          if (!mushroom || b.max.y > mushroom.max.y) mushroom = b;
        }
      });
      expect(mushroom, 'the unit has no release to press').not.toBeNull();
      const y = (mushroom as unknown as THREE.Box3).getCenter(new THREE.Vector3()).y;
      /*
       * Measured off the rigs, not chosen: Droid's shoulder is at 1.697 m with
       * 0.95 m of arm on it, so he reaches about 2.80 m standing; `scene.ts`'s
       * `mountLift` raises him by Biggy's crown less his own pelvis, 0.30 m, so
       * about 3.10 m on Biggy's shoulders. The release has to be in that band or
       * the chapter's own line — *"about a metre above my reach. I need
       * height"* — is a claim the geometry contradicts.
       */
      expect(y, 'a standing Droid could reach this').toBeGreaterThan(2.85);
      expect(y, 'even on Biggy, Droid could not reach this').toBeLessThan(3.15);
    } finally {
      u.dispose();
    }
  });
});
