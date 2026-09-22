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
  it('has a neck stub, not a stalk — under 8% of the head width', () => {
    const rig = createRobot('voxxy');
    const head = measureBounds(rig.parts.headShell);
    const torso = measureBounds(rig.parts.torsoShell);
    const neck = head.min.y - torso.max.y;
    const headW = head.max.x - head.min.x;
    expect(neck).toBeGreaterThan(0);
    expect(neck / headW, `neck ${(neck / headW).toFixed(3)} of head width`).toBeLessThan(0.08);
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
   * THE BELLY IS THE SILHOUETTE.
   *
   * On the sheet's front view the widest thing about Biggy is 0.98 of his own
   * height, and it is his gut. A build whose belly was 0.70 of its height had
   * given that bulk away to the arms and the helmet, and stopped being Biggy.
   */
  it('carries its bulk in the belly — belly width over 0.9 of total height', () => {
    const rig = createRobot('biggy');
    const s = silhouette(rig);
    const belly = widthOf(rig.parts.bellyShell);
    expect(belly / s.h, `belly ${(belly / s.h).toFixed(3)} of height`).toBeGreaterThan(0.9);
    // Nothing else may be wider: the arms hang inside the gut's own width.
    expect(s.w, `silhouette ${s.w.toFixed(3)} vs belly ${belly.toFixed(3)}`).toBeLessThan(belly * 1.06);
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

  it('mounted Droid tucks its legs instead of stepping', () => {
    const rig = createRobot('droid');
    const dt = 1 / 60;
    for (let i = 0; i < 30; i++) applyGait(rig, { speedMps: 1.2, heading: 0, dt, mounted: true });
    // Knees up and bent: nothing like a walk pose.
    expect(rig.bones.shinL.rotation.x).toBeGreaterThan(1);
    expect(rig.bones.thighL.rotation.x).toBeLessThan(-0.5);
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
