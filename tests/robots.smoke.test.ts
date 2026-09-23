/**
 * Appearance and motion smoke tests for the three procedural robots.
 *
 * GAUNTLET.md Stage 1 makes robot appearance a first-class, *factual* check: a
 * critic puts the model next to `robots/*.png` and fails the round if it reads as
 * a generic humanoid. These assertions are the part of that check a machine can
 * run — the proportions that make each silhouette that robot and not another one.
 * They are deliberately written as ratios off the model sheets, so they keep
 * biting if somebody "improves" the meshes later.
 *
 * Everything here is geometry: vitest runs in node, there is no WebGL, and
 * nothing below constructs a renderer.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROBOT_HEIGHT_M } from '../src/sim/units';
import type { RobotKind } from '../src/sim/types';
import {
  BONE_NAMES,
  applyGait,
  createRobot,
  footContact,
  footWorldPosition,
  measureBounds,
  updateRobot,
  type RobotRig,
} from '../src/render/robots';

const KINDS: RobotKind[] = ['voxxy', 'droid', 'biggy'];

/** Width (front view) and height of a rig's silhouette, metres. */
function silhouette(rig: RobotRig): { w: number; h: number; d: number } {
  const size = measureBounds(rig.root).getSize(new THREE.Vector3());
  return { w: size.x, h: size.y, d: size.z };
}

function widthOf(o: THREE.Object3D): number {
  return measureBounds(o).getSize(new THREE.Vector3()).x;
}

/**
 * Where an arm is fattest, as a fraction of its own length from the shoulder,
 * and how fat it is there.
 *
 * Every vertex of every mesh hanging off the upper arm and forearm is projected
 * onto the shoulder-to-hand axis; the answer is the largest perpendicular radius
 * and where along the arm it occurs. This is the measurement that tells a
 * bowling pin (widest low) from a carrot (widest at the shoulder).
 */
function armSwell(rig: RobotRig): { radius: number; at: number; slices: number[] } {
  rig.root.updateMatrixWorld(true);
  const shoulder = new THREE.Vector3().setFromMatrixPosition(rig.bones.shoulderL.matrixWorld);
  const hand = new THREE.Vector3().setFromMatrixPosition(rig.bones.handL.matrixWorld);
  const axis = hand.clone().sub(shoulder);
  const len = axis.length();
  axis.normalize();
  const v = new THREE.Vector3();
  const foot = new THREE.Vector3();
  let radius = 0;
  let at = 0;
  /** Max radius in each tenth of the arm, shoulder to hand. */
  const slices = new Array<number>(10).fill(0);
  for (const bone of [rig.bones.upperArmL, rig.bones.forearmL]) {
    for (const child of bone.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const pos = child.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld).sub(shoulder);
        const t = v.dot(axis);
        if (t < 0 || t > len) continue;
        const r = foot.copy(axis).multiplyScalar(t).sub(v).length();
        const f = t / len;
        if (r > radius) {
          radius = r;
          at = f;
        }
        const sl = Math.min(9, Math.floor(f * 10));
        if (r > slices[sl]) slices[sl] = r;
      }
    }
  }
  return { radius, at, slices };
}

describe('robot rigs build', () => {
  for (const kind of KINDS) {
    it(`${kind} builds and disposes without throwing`, () => {
      const rig = createRobot(kind);
      expect(rig.kind).toBe(kind);
      expect(rig.root.children.length).toBeGreaterThan(0);
      expect(() => rig.dispose()).not.toThrow();
    });

    it(`${kind} exposes every named bone, a lamp anchor and at least two glow materials`, () => {
      const rig = createRobot(kind);
      for (const name of BONE_NAMES) {
        expect(rig.bones[name], `${kind} bone ${name}`).toBeDefined();
      }
      expect(rig.lampAnchor).toBeDefined();
      expect(rig.glow.length).toBeGreaterThanOrEqual(2);
      for (const g of rig.glow) {
        expect(g).toBeInstanceOf(THREE.MeshStandardMaterial);
        expect(g.emissive.getHex()).toBeGreaterThan(0);
      }
      rig.dispose();
    });

    it(`${kind} stands on the floor at its designed height`, () => {
      const rig = createRobot(kind);
      const box = measureBounds(rig.root);
      const target = ROBOT_HEIGHT_M[kind];
      const h = box.max.y - box.min.y;
      expect(h).toBeGreaterThan(target * 0.95);
      expect(h).toBeLessThan(target * 1.05);
      expect(rig.height).toBe(target);
      // Soles on y = 0, so a rig can be dropped straight onto the floor.
      expect(Math.abs(box.min.y)).toBeLessThan(0.01);
      rig.dispose();
    });
  }
});

/**
 * The meshes hanging directly off one bone, as one world-space box.
 *
 * "Directly" means not through another bone: a bone's own shell is what has to
 * meet its parent's, and folding a child limb's meshes in would make every
 * chain trivially connected and the check worthless.
 */
function boneShell(rig: RobotRig, bone: THREE.Object3D): THREE.Box3 | null {
  const bones = new Set(Object.values(rig.bones));
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let found = false;
  const walk = (node: THREE.Object3D): void => {
    if (node instanceof THREE.Mesh) {
      const pos = node.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (pos) {
        found = true;
        for (let i = 0; i < pos.count; i++) {
          box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld));
        }
      }
    }
    for (const child of node.children) if (!bones.has(child)) walk(child);
  };
  walk(bone);
  return found ? box : null;
}

/** Every mesh under `bone`, keyed by geometry and material, with its world box. */
function subtreeMeshes(bone: THREE.Object3D): Array<{ key: string; box: THREE.Box3 }> {
  const out: Array<{ key: string; box: THREE.Box3 }> = [];
  const v = new THREE.Vector3();
  bone.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const pos = node.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const box = new THREE.Box3();
    for (let i = 0; i < pos.count; i++) {
      box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld));
    }
    /*
     * `part()` builds a fresh geometry per call, so two mirrored parts never
     * share a geometry uuid. The material is shared, and the vertex and index
     * counts identify the shape: together they say "the same kind of part".
     */
    const mat = node.material as THREE.Material;
    out.push({ key: `${mat.uuid}|${pos.count}|${node.geometry.getIndex()?.count ?? 0}`, box });
  });
  return out;
}

describe('every robot is assembled, not scattered', () => {
  /*
   * NO FLOATING GEOMETRY.
   *
   * Biggy shipped a round with his ribbed ankle bellows hanging off the leg
   * entirely — a stack of rings beside the boot with no shin joining them to
   * anything — and the round after that reported it fixed while a verifier
   * measured it still broken. A picture cannot be asserted, but this can: each
   * bone's own shell has to actually touch the shell of the bone it hangs from.
   */

  for (const kind of KINDS) {
    it(`${kind} has a mesh on every limb segment`, () => {
      const rig = createRobot(kind);
      rig.root.updateMatrixWorld(true);
      for (const name of [
        'upperArmL',
        'upperArmR',
        'forearmL',
        'forearmR',
        'handL',
        'handR',
        'thighL',
        'thighR',
        'shinL',
        'shinR',
        'footL',
        'footR',
      ]) {
        // Meshes may sit on the segment or on the joint it hangs off, but the
        // pair may not BOTH be empty: that is a limb with a hole in it.
        const own = boneShell(rig, rig.bones[name]);
        const parent = rig.bones[name].parent;
        const viaJoint = own ?? (parent ? boneShell(rig, parent) : null);
        expect(viaJoint, `${kind} ${name} has no geometry anywhere on it`).not.toBeNull();
      }
      rig.dispose();
    });

    it(`${kind} joins every bone's shell to the one it hangs from`, () => {
      const rig = createRobot(kind);
      rig.root.updateMatrixWorld(true);
      // A rounded shell's box overshoots its surface a little, and two touching
      // parts can still leave a hair of daylight; a centimetre is the slack.
      const eps = 0.01;
      const bones = new Set(Object.values(rig.bones));
      for (const name of BONE_NAMES) {
        if (name === 'root') continue;
        const a = boneShell(rig, rig.bones[name]);
        if (!a) continue;
        // The nearest ancestor BONE that carries geometry of its own — a bare
        // pivot in between (`upperArm` on a rig that dresses the shoulder) is
        // not a break in the chain.
        let up: THREE.Object3D | null = rig.bones[name].parent;
        let b: THREE.Box3 | null = null;
        let upName = '?';
        while (up) {
          if (bones.has(up)) {
            b = boneShell(rig, up);
            upName = up.name || '?';
            if (b) break;
          }
          up = up.parent;
        }
        if (!b) continue;
        a.expandByScalar(eps);
        expect(a.intersectsBox(b), `${kind}: ${name} floats clear of ${upName}`).toBe(true);
      }
      rig.dispose();
    });

    /*
     * MIRROR SYMMETRY.
     *
     * Voxxy's two ears were built in one loop and still came out different: the
     * right ear's white shell cap was yawed by `PI + 0.45` instead of `+0.45`,
     * which swung it round to the back of the head. A flood fill of the portrait
     * measured 83.6% near-white on one ear and 1.1% on the other. Same mesh
     * count, same materials, same geometries — only the transform differed, so
     * counting meshes was never going to catch it. Mirroring the left side's
     * world boxes onto the right's does.
     */
    it(`${kind} builds its two sides as mirror images`, () => {
      const rig = createRobot(kind);
      rig.root.updateMatrixWorld(true);
      for (const [l, r] of [
        ['shoulderL', 'shoulderR'],
        ['hipL', 'hipR'],
        ['earL', 'earR'],
      ] as const) {
        if (!rig.bones[l] || !rig.bones[r]) continue;
        const left = subtreeMeshes(rig.bones[l]);
        const right = subtreeMeshes(rig.bones[r]);
        expect(right.length, `${kind}: ${l} has ${left.length} meshes, ${r} has ${right.length}`).toBe(
          left.length,
        );
        const bag = new Map<string, number>();
        for (const m of left) bag.set(m.key, (bag.get(m.key) ?? 0) + 1);
        for (const m of right) {
          const n = bag.get(m.key) ?? 0;
          expect(n, `${kind}: ${r} has a mesh ${l} does not (different geometry or material)`).toBeGreaterThan(0);
          bag.set(m.key, n - 1);
        }
        /*
         * ...and each of those meshes sits where its twin's mirror does.
         *
         * Rings of rivets are exempt: `boltRing` spaces its bolts by angle from
         * a phase, so the same ring on both hips is a ROTATION of its twin, not
         * a reflection, and that is fine — nobody counts a rivet. Anything with
         * a box bigger than 5 cm across is a part, and parts mirror.
         */
        for (const m of left) {
          if (m.box.min.distanceTo(m.box.max) < 0.05) continue;
          const want = new THREE.Box3(
            new THREE.Vector3(-m.box.max.x, m.box.min.y, m.box.min.z),
            new THREE.Vector3(-m.box.min.x, m.box.max.y, m.box.max.z),
          );
          const twin = right.find(
            (o) => o.key === m.key && o.box.min.distanceTo(want.min) < 0.01 && o.box.max.distanceTo(want.max) < 0.01,
          );
          expect(
            twin,
            `${kind}: a mesh of ${l} at ${m.box.min.toArray().map((n) => n.toFixed(2))} has no mirror in ${r}`,
          ).toBeDefined();
        }
      }
      rig.dispose();
    });
  }
});

describe('Voxxy reads as Voxxy', () => {
  /*
   * THE HEADLINE PROPORTION: Voxxy is squat, wide and chunky.
   *
   * The model sheet's front view is 642 px tall against 418 wide — an aspect of
   * 1.54. A build measured at 2.01 read as a lanky generic robot, and every other
   * fidelity problem on him was easier to see once that was fixed. His height is
   * frozen by ROBOT_HEIGHT_M, so the only way to hold this ratio is to keep him
   * as wide as the sheet is.
   */
  it('is as squat as the model sheet — aspect near 1.54, nowhere near 2', () => {
    const rig = createRobot('voxxy');
    const s = silhouette(rig);
    const aspect = s.h / s.w;
    expect(aspect, `voxxy aspect ${aspect.toFixed(3)}`).toBeGreaterThan(1.35);
    expect(aspect, `voxxy aspect ${aspect.toFixed(3)}`).toBeLessThan(1.75);
    rig.dispose();
  });

  /*
   * The head sits ALMOST DIRECTLY on the shoulders: the sheet's neck is an 18 px
   * stub against a 395 px head, 4.6% of the head's width. A build at 21% was the
   * second-biggest reason he read as lanky.
   */
  it('has a neck stub, not a stalk — under 4% of the head width', () => {
    const rig = createRobot('voxxy');
    const head = measureBounds(rig.parts.headShell);
    const torso = measureBounds(rig.parts.torsoShell);
    const neck = head.min.y - torso.max.y;
    const headW = head.max.x - head.min.x;
    /*
     * The bound was 8% and a build at 5.7% passed it while a verifier
     * flood-filling the portrait measured 7.4% against the sheet's 4.1% and
     * failed the round: this gap understates what the camera sees, because the
     * head's chin curves away above the shoulders. Sized so the sheet's own
     * proportion passes and the build that shipped as "fixed" does not.
     */
    expect(neck, `neck ${neck.toFixed(4)} m`).toBeGreaterThan(0.008);
    expect(neck / headW, `neck ${(neck / headW).toFixed(3)} of head width`).toBeLessThan(0.04);
    rig.dispose();
  });

  /*
   * THE VISOR IS A SCREEN FILLING THE FACE, NOT A MASK OVAL ON IT.
   *
   * Flood-fill the sheet's front panel and the visor's glass is 0.68-0.71 of the
   * head box across and 0.65 of it down. A build measuring 0.59 and 0.51 failed
   * the round: 17% and 21% short is the difference between the sheet's big
   * dot-matrix screen and a domino mask with fat orange cheeks either side.
   * Measured here against the head BONE's box — ears, ports and all — because
   * that is the box a flood fill of the portrait finds.
   */
  it('wears the sheet’s big screen: visor about 0.7 of the head box', () => {
    const rig = createRobot('voxxy');
    rig.root.updateMatrixWorld(true);
    const headBox = measureBounds(rig.bones.head).getSize(new THREE.Vector3());
    const visor = measureBounds(rig.parts.visor).getSize(new THREE.Vector3());
    const w = visor.x / headBox.x;
    const h = visor.y / headBox.y;
    expect(w, `visor ${w.toFixed(3)} of head width`).toBeGreaterThan(0.66);
    expect(w, `visor ${w.toFixed(3)} of head width`).toBeLessThan(0.8);
    expect(h, `visor ${h.toFixed(3)} of head height`).toBeGreaterThan(0.6);
    expect(h, `visor ${h.toFixed(3)} of head height`).toBeLessThan(0.74);
    rig.dispose();
  });

  /*
   * ...AND THE EYES ON IT ARE BARS, NOT DASHES.
   *
   * The sheet's eyes measure an aspect of 1.5-1.6 off the front panel. A build
   * with 2.7 and 2.2 read as two painted-on dashes. The widths are unchanged
   * from that build; it is the height that was missing.
   */
  it('has rounded bar-eyes, not flat dashes', () => {
    const rig = createRobot('voxxy');
    rig.root.updateMatrixWorld(true);
    const glowMats = new Set(rig.glow);
    let found = 0;
    for (const child of rig.bones.head.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      if (!glowMats.has(child.material as THREE.MeshStandardMaterial)) continue;
      const size = measureBounds(child).getSize(new THREE.Vector3());
      // The eye patches curve round the head, so their own x/y is the read.
      if (size.x < 0.04) continue;
      const aspect = size.x / size.y;
      expect(aspect, `eye layer aspect ${aspect.toFixed(2)}`).toBeLessThan(2.0);
      expect(aspect, `eye layer aspect ${aspect.toFixed(2)}`).toBeGreaterThan(1.0);
      found++;
    }
    expect(found, 'no glowing eye geometry found on the head').toBeGreaterThan(1);
    rig.dispose();
  });

  /*
   * The arms are BOWLING PINS: thin at the shoulder, swelling to their widest at
   * about three-quarters of the way down, where the white bands wrap them. A
   * build that tapered the other way — widest under the shoulder — was the
   * clearest single error on the model.
   */
  it('has arms that swell downward, widest well below mid-length', () => {
    const rig = createRobot('voxxy');
    const swell = armSwell(rig);
    expect(swell.at, `arm widest at ${(swell.at * 100).toFixed(0)}% down`).toBeGreaterThan(0.6);
    expect(swell.at).toBeLessThan(0.95);
    // And the taper runs the right way the whole length: the arm is thicker in
    // its last third than in its first, by a margin no sculpt tweak can blur.
    const upper = Math.max(swell.slices[1], swell.slices[2]);
    const lower = Math.max(swell.slices[6], swell.slices[7]);
    expect(lower, `upper arm ${upper.toFixed(3)} vs club ${lower.toFixed(3)}`).toBeGreaterThan(upper * 1.5);
    rig.dispose();
  });

  it('has a head clearly wider than its body', () => {
    const rig = createRobot('voxxy');
    const head = widthOf(rig.bones.head);
    const torso = widthOf(rig.parts.torsoShell);
    expect(head).toBeGreaterThan(torso * 1.2);
    rig.dispose();
  });

  it('has a head about a third of its total height', () => {
    const rig = createRobot('voxxy');
    const headH = measureBounds(rig.bones.head).getSize(new THREE.Vector3()).y;
    const ratio = headH / silhouette(rig).h;
    expect(ratio).toBeGreaterThan(0.26);
    expect(ratio).toBeLessThan(0.42);
    rig.dispose();
  });

  it('has very long arms — shoulder to hand past 0.45 of its height', () => {
    const rig = createRobot('voxxy');
    rig.root.updateMatrixWorld(true);
    const shoulder = new THREE.Vector3().setFromMatrixPosition(rig.bones.shoulderL.matrixWorld);
    const hand = new THREE.Vector3().setFromMatrixPosition(rig.bones.handL.matrixWorld);
    expect(shoulder.distanceTo(hand)).toBeGreaterThan(0.45 * ROBOT_HEIGHT_M.voxxy);
    rig.dispose();
  });
});

describe('Droid reads as Droid', () => {
  it('is the tallest and the narrowest of the three', () => {
    const rigs = KINDS.map((k) => createRobot(k));
    const s = rigs.map((r) => silhouette(r));
    const droid = s[1];
    for (const other of [s[0], s[2]]) {
      expect(droid.h).toBeGreaterThan(other.h);
      expect(droid.w / droid.h).toBeLessThan(other.w / other.h);
    }
    // Lanky: less than half as wide as it is tall.
    expect(droid.w / droid.h).toBeLessThan(0.5);
    for (const r of rigs) r.dispose();
  });

  /**
   * Droid's head is what makes him recognisable, and until now nothing asserted
   * anything about it — the block above only checked that he is tall and thin.
   * Michele's playtest found the head had drifted toward the organisers' demo
   * while every existing assertion stayed green, so these pin the two ratios
   * that carry his identity. Bands are `docs/model-sheet-targets.md` §8's own
   * tolerances, derived from the sheets by a pass that read no game code.
   */
  it("has the sheet's head: 0.162 of total height, 0.29 of the span", () => {
    const rig = createRobot('droid');
    rig.root.updateMatrixWorld(true);
    const total = measureBounds(rig.root).getSize(new THREE.Vector3());
    const head = measureBounds(rig.bones.head).getSize(new THREE.Vector3());

    const h = head.y / total.y;
    expect(h, `head ${h.toFixed(3)} of total height`).toBeGreaterThan(0.142);
    expect(h, `head ${h.toFixed(3)} of total height`).toBeLessThan(0.182);

    // Our shoulder span IS our total width, because our hands hang inboard of
    // the pauldrons where the sheet's hang outboard. So head_w/total_w (0.283)
    // and head_w/span (0.305) are the same number here; the band covers both.
    const w = head.x / total.x;
    expect(w, `head ${w.toFixed(3)} of total width`).toBeGreaterThan(0.263);
    expect(w, `head ${w.toFixed(3)} of total width`).toBeLessThan(0.325);

    rig.dispose();
  });

  /**
   * The spacing, not the size, is what went wrong last time: the eyes had crept
   * to 2.03 eye-widths apart against the sheet's 3.33, which reads as a face
   * squinting rather than the sheet's wide-set lamps.
   */
  it('has small round eyes set WIDE — 0.40 of head width apart', () => {
    const rig = createRobot('droid');
    rig.root.updateMatrixWorld(true);

    const glowMats = new Set(rig.glow);
    const eyes: THREE.Box3[] = [];
    rig.bones.head.traverse((o) => {
      if (o instanceof THREE.Mesh && glowMats.has(o.material as THREE.MeshStandardMaterial)) {
        eyes.push(measureBounds(o));
      }
    });
    expect(eyes.length, 'droid has no glowing eye geometry').toBe(2);

    const headW = measureBounds(rig.bones.head).getSize(new THREE.Vector3()).x;
    const cx = eyes.map((b) => (b.max.x + b.min.x) / 2);
    const sep = Math.abs(cx[0] - cx[1]) / headW;
    const dia = eyes[0].getSize(new THREE.Vector3()).x / headW;

    expect(sep, `eye spacing ${sep.toFixed(3)} of head width`).toBeGreaterThan(0.37);
    expect(sep, `eye spacing ${sep.toFixed(3)} of head width`).toBeLessThan(0.43);
    expect(dia, `eye diameter ${dia.toFixed(3)} of head width`).toBeGreaterThan(0.08);
    expect(dia, `eye diameter ${dia.toFixed(3)} of head width`).toBeLessThan(0.16);

    rig.dispose();
  });
});

describe('Biggy reads as Biggy', () => {
  it('is nearly as wide as it is tall', () => {
    const rigs = KINDS.map((k) => createRobot(k));
    const s = rigs.map((r) => silhouette(r));
    const biggy = s[2];
    const ratio = biggy.w / biggy.h;
    expect(ratio).toBeGreaterThan(0.85);
    for (const other of [s[0], s[1]]) {
      expect(ratio).toBeGreaterThan(other.w / other.h);
    }
    for (const r of rigs) r.dispose();
  });

  it('is a belly with a helmet on it — belly wider than the head', () => {
    const rig = createRobot('biggy');
    const bellyR = widthOf(rig.parts.bellyShell) / 2;
    const headR = widthOf(rig.parts.headShell) / 2;
    expect(bellyR).toBeGreaterThan(headR);
    // And the belly is most of the robot.
    expect(bellyR * 2).toBeGreaterThan(silhouette(rig).h * 0.6);
    rig.dispose();
  });

  /*
   * THE BELLY IS THE SILHOUETTE — AND THE ARMS HANG OUTSIDE IT.
   *
   * Both halves of that are measurements off the sheet's front view, taken by
   * flood-filling it against the page: 390 px from the crown to the sole, a gut
   * 320 px across (0.82 of the height) whose own edge is the silhouette at its
   * widest row, and a widest row of all of 378 px (0.97 of the height) lower
   * down, where the ARMS are outside the gut.
   *
   * Both bounds have cost a round. A belly at 0.70 of the height had given the
   * bulk away to the arms and the helmet and stopped being Biggy; the fix
   * over-corrected to 0.93 by reading the figure's total width as the gut's,
   * and a gut that wide swallows anything hanging inside its radius — which is
   * exactly what happened to the far arm in the portrait. Hence two-sided.
   */
  it('carries its bulk in the belly, at the width the sheet measures', () => {
    const rig = createRobot('biggy');
    const s = silhouette(rig);
    const belly = widthOf(rig.parts.bellyShell);
    expect(belly / s.h, `belly ${(belly / s.h).toFixed(3)} of height`).toBeGreaterThan(0.78);
    expect(belly / s.h, `belly ${(belly / s.h).toFixed(3)} of height`).toBeLessThan(0.88);
    expect(s.w / s.h, `silhouette ${(s.w / s.h).toFixed(3)} of height`).toBeGreaterThan(0.93);
    expect(s.w / s.h, `silhouette ${(s.w / s.h).toFixed(3)} of height`).toBeLessThan(1.04);
    // And the gut is still the single widest part of him by a long way.
    expect(belly, `belly ${belly.toFixed(3)} vs silhouette ${s.w.toFixed(3)}`).toBeGreaterThan(s.w * 0.8);
    rig.dispose();
  });

  /*
   * THE FAR ARM MUST CLEAR THE GUT IN THE PORTRAIT, NOT JUST IN PLAN.
   *
   * The appearance check is shot from `posePortrait`, 34 degrees off the front.
   * That foreshortens an arm's sideways offset by cos 34 = 0.829 and leaves a
   * body of revolution exactly as wide as it ever was, so an arm that clears the
   * belly in a front elevation can still be swallowed by it in the portrait —
   * and was: the far arm photographed as a shard above the gut's edge with its
   * claw reappearing 140 px lower, nothing joining them. This projects both the
   * way that camera does and demands real daylight along the whole limb.
   */
  it('hangs its arms outside the gut from the portrait camera, not just head-on', () => {
    const rig = createRobot('biggy');
    rig.root.updateMatrixWorld(true);
    const az = (34 * Math.PI) / 180;
    const belly = rig.parts.bellyShell as THREE.Mesh;
    const bpos = belly.geometry.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    /** The gut's radius in 0.05 m height bands — it is a solid of revolution. */
    const band = (y: number): number => Math.round(y / 0.05);
    const bellyR = new Map<number, number>();
    for (let i = 0; i < bpos.count; i++) {
      v.fromBufferAttribute(bpos, i).applyMatrix4(belly.matrixWorld);
      const k = band(v.y);
      bellyR.set(k, Math.max(bellyR.get(k) ?? 0, Math.hypot(v.x, v.z)));
    }
    // Each arm measured as if it were the FAR one — the rig is mirror-symmetric
    // and the portrait can be shot from either side, so both have to clear.
    for (const side of ['L', 'R'] as const) {
      let worst = Infinity;
      let worstY = 0;
      for (const boneName of [`upperArm${side}`, `forearm${side}`, `hand${side}`]) {
        rig.bones[boneName].traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const pos = o.geometry.getAttribute('position') as THREE.BufferAttribute;
          // The outermost point of each mesh is what has to clear; an inner face
          // buried in the gut is fine and is how the sheet draws it too.
          let best = -Infinity;
          let bestY = 0;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            // Screen-sideways offset from the axis for a camera `az` off the
            // front, standing on the far arm's opposite side.
            const off = Math.abs(v.x) * Math.cos(az) + v.z * Math.sin(az);
            const clear = off - (bellyR.get(band(v.y)) ?? 0);
            if (clear > best) {
              best = clear;
              bestY = v.y;
            }
          }
          if (best < worst) {
            worst = best;
            worstY = bestY;
          }
        });
      }
      expect(worst, `${side} arm clears the gut by ${worst.toFixed(3)} m at y=${worstY.toFixed(2)}`)
        .toBeGreaterThan(0.015);
    }
    rig.dispose();
  });

  /*
   * A HUGE GUT UNDER A SMALLER TIN HAT.
   *
   * Dome width over belly width is 283/375 = 0.75 on the sheet. Both are circles
   * in plan, so neither foreshortens and this is a direct comparison — which is
   * what made a build at 0.96 so plainly wrong: the belly no longer overhung the
   * helmet at all.
   */
  it('wears a helmet three quarters the width of its belly', () => {
    const rig = createRobot('biggy');
    const ratio = widthOf(rig.parts.headShell) / widthOf(rig.parts.bellyShell);
    expect(ratio, `dome/belly ${ratio.toFixed(3)}`).toBeGreaterThan(0.68);
    expect(ratio, `dome/belly ${ratio.toFixed(3)}`).toBeLessThan(0.84);
    rig.dispose();
  });
});

describe('gait', () => {
  /** 2 s of walking at the organisers' walk speed, facing +Z (yaw 0). */
  function walk(rig: RobotRig, speedMps = 1.35, seconds = 2, dt = 1 / 60): void {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      applyGait(rig, { speedMps, heading: Math.PI / 2, dt });
    }
  }

  for (const kind of KINDS) {
    it(`${kind} walks without drifting, with bounded leg rotations`, () => {
      const rig = createRobot(kind);
      let maxThigh = 0;
      let maxShin = 0;
      const dt = 1 / 60;
      for (let i = 0; i < 120; i++) {
        applyGait(rig, { speedMps: 1.35, heading: Math.PI / 2, dt });
        maxThigh = Math.max(maxThigh, Math.abs(rig.bones.thighL.rotation.x));
        maxShin = Math.max(maxShin, Math.abs(rig.bones.shinL.rotation.x));
        // The gait animates in place; the caller owns the root's position.
        expect(rig.root.position.y).toBe(0);
        expect(rig.root.position.x).toBe(0);
        expect(rig.root.position.z).toBe(0);
      }
      expect(maxThigh).toBeGreaterThan(0.05);
      expect(maxThigh).toBeLessThan(Math.PI);
      expect(maxShin).toBeGreaterThan(0.05);
      expect(maxShin).toBeLessThan(Math.PI);
      rig.dispose();
    });

    it(`${kind} plants its feet — a foot in contact does not slide`, () => {
      const rig = createRobot(kind);
      const dt = 1 / 60;
      const v = 1.35;
      walk(rig, v, 0.5, dt); // settle
      const planted: boolean[] = [];
      const zs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < 180; i++) {
        applyGait(rig, { speedMps: v, heading: Math.PI / 2, dt });
        const p = footWorldPosition(rig, 'L');
        planted.push(footContact(rig, 'L'));
        zs.push(p.z);
        ys.push(p.y);
      }
      const minY = Math.min(...ys);
      let checked = 0;
      for (let i = 1; i < zs.length; i++) {
        if (!planted[i - 1] || !planted[i]) continue;
        // Ground velocity of a planted foot: the body moves forward at +v, so
        // the foot must move at -v relative to the rig — i.e. stand still on the
        // floor. This is the "planted feet" the brief asks for, as a number.
        const groundSpeed = (zs[i] - zs[i - 1]) / dt + v;
        expect(Math.abs(groundSpeed)).toBeLessThan(v * 0.05);
        // And it stays on the floor while it is down.
        expect(ys[i] - minY).toBeLessThan(0.002);
        checked++;
      }
      expect(checked).toBeGreaterThan(20);
      // The swing foot really does leave the floor.
      expect(Math.max(...ys) - minY).toBeGreaterThan(0.01);
      rig.dispose();
    });

    it(`${kind} turns toward its heading and idles without exploding`, () => {
      const rig = createRobot(kind);
      const dt = 1 / 60;
      applyGait(rig, { speedMps: 0, heading: 0, dt });
      // Heading 0 (sim +x) is yaw PI/2 in the renderer.
      expect(rig.root.rotation.y).toBeCloseTo(Math.PI / 2, 5);
      for (let i = 0; i < 60; i++) applyGait(rig, { speedMps: 0, heading: -Math.PI / 2, dt });
      expect(rig.root.rotation.y).toBeCloseTo(Math.PI, 1);
      // Idle personality must stay small: no robot may shake itself apart.
      for (let i = 0; i < 600; i++) applyGait(rig, { speedMps: 0, heading: -Math.PI / 2, dt });
      expect(Math.abs(rig.bones.head.rotation.y)).toBeLessThan(1.2);
      expect(Math.abs(rig.bones.pelvis.position.x)).toBeLessThan(0.1);
      expect(Number.isFinite(rig.bones.thighL.rotation.x)).toBe(true);
      rig.dispose();
    });

    it(`${kind} plays one-shot poses and returns to its base pose`, () => {
      const rig = createRobot(kind);
      const dt = 1 / 60;
      // Sample the whole upper body: each pose moves a different part of it.
      // A twin that never poses. Both are stepped with the identical dt sequence,
      // and the gait is deterministic, so once the pose has finished the two rigs
      // must agree exactly: a one-shot pose leaves no residue behind.
      const twin = createRobot(kind);
      const probeOf = (r: RobotRig): number[] => [
        r.bones.shoulderR.rotation.x,
        r.bones.shoulderR.rotation.z,
        r.bones.upperArmR.rotation.x,
        r.bones.forearmR.rotation.x,
        r.bones.head.rotation.x,
        r.bones.head.rotation.y,
        r.bones.torso.rotation.x,
        r.bones.pelvis.position.y,
        r.bones.pelvis.position.z,
      ];
      applyGait(rig, { speedMps: 0, heading: 0, dt });
      applyGait(twin, { speedMps: 0, heading: 0, dt });
      for (const pose of ['nope', 'reach', 'squeeze'] as const) {
        let peak = 0;
        for (let i = 0; i < 45; i++) {
          applyGait(rig, { speedMps: 0, heading: 0, dt, pose });
          applyGait(twin, { speedMps: 0, heading: 0, dt });
          const a = probeOf(rig);
          const b = probeOf(twin);
          for (let j = 0; j < a.length; j++) peak = Math.max(peak, Math.abs(a[j] - b[j]));
        }
        expect(peak, `${kind} pose ${pose} did nothing`).toBeGreaterThan(0.1);
        // Let the pose run out.
        for (let i = 0; i < 120; i++) {
          applyGait(rig, { speedMps: 0, heading: 0, dt, pose: null });
          applyGait(twin, { speedMps: 0, heading: 0, dt });
        }
        const a = probeOf(rig);
        const b = probeOf(twin);
        for (let j = 0; j < a.length; j++) {
          expect(Math.abs(a[j] - b[j]), `${kind} left residue after ${pose} (probe ${j})`).toBeLessThan(1e-9);
        }
      }
      twin.dispose();
      rig.dispose();
    });
  }

  /**
   * Rewritten, not loosened. It used to assert the exact tucked pose — shin past
   * 1 rad, thigh past -0.5 — which pinned one particular sitting shape rather
   * than the thing that matters. Michele found Droid hovering over Biggy's dome
   * with his knees curled up ("sitting on the helmet should be it?"), so the pose
   * is now astride: hips rolled out, shins down the dome's flanks. The numbers it
   * checked are gone; the properties it was really protecting are all still here,
   * plus two it never had.
   */
  it('mounted Droid sits astride instead of stepping', () => {
    const rig = createRobot('droid');
    const dt = 1 / 60;
    for (let i = 0; i < 30; i++) applyGait(rig, { speedMps: 1.2, heading: 0, dt, mounted: true });

    // Legs held, not walking: knees bent and thighs raised, neither foot planted.
    expect(rig.bones.shinL.rotation.x).toBeGreaterThan(0.5);
    expect(rig.bones.thighL.rotation.x).toBeLessThan(-0.3);
    expect(footContact(rig, 0)).toBe(false);
    expect(footContact(rig, 1)).toBe(false);

    // Astride: the hips roll OUT, and by the same amount on each side, so the
    // thighs pass either side of a dome nearly a metre and a half across.
    expect(rig.bones.hipL.rotation.z).toBeGreaterThan(0.4);
    expect(rig.bones.hipL.rotation.z).toBeCloseTo(-rig.bones.hipR.rotation.z, 5);

    // It is a pose, not a gait: going faster must not animate it.
    const held = rig.bones.shinL.rotation.x;
    for (let i = 0; i < 30; i++) applyGait(rig, { speedMps: 6, heading: 0, dt, mounted: true });
    expect(rig.bones.shinL.rotation.x).toBeCloseTo(held, 5);

    rig.dispose();
  });

  it('updateRobot compresses arcade speeds instead of blurring the legs', () => {
    const rig = createRobot('voxxy');
    const dt = 1 / 60;
    // Voxxy's frozen top speed is 290 px/s = 23.2 m/s. The legs must still be sane.
    for (let i = 0; i < 120; i++) updateRobot(rig, { speedMps: 23.2, heading: 0, dt });
    expect(Math.abs(rig.bones.thighL.rotation.x)).toBeLessThan(Math.PI / 2);
    expect(Number.isFinite(rig.bones.footL.rotation.x)).toBe(true);
    rig.dispose();
  });
});
