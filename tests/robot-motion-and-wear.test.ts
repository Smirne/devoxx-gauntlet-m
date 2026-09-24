/**
 * The three things this round's robot pass fixed, as acceptance criteria.
 *
 * Every one of them was invisible to the suite and visible to Michele, which is
 * the pattern `docs/playtest-notes.md` exists to break. They are written as
 * measurements rather than as snapshots so they keep biting: a number, a
 * threshold, and the reason the threshold is where it is.
 *
 * Geometry and maths only — vitest runs in node and nothing here makes a
 * renderer.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRobot, footContact, updateRobot, type RobotRig } from '../src/render/robots';
import { MAX_WEAR_LUM_GAIN } from '../src/render/robots/rig';
import { DEFS } from '../src/sim/constants';
import { PX_PER_M } from '../src/sim/units';
import type { RobotKind } from '../src/sim/types';

const KINDS: RobotKind[] = ['voxxy', 'droid', 'biggy'];

/** Rec.709 relative luminance of a linear colour. */
const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Each robot's own frozen top speed, in metres per second. */
const topSpeed = (k: RobotKind): number => DEFS[k].max / PX_PER_M;

describe('weather() does not turn rust into white flakes', () => {
  /*
   * `weather()` writes vertex colour as a RATIO against the material's colour, so
   * a tint brighter than the panel divides a light colour by a dark base. It used
   * to clamp each channel at 6 independently, which throws the tint's hue away —
   * the channel carrying the rust saturates first — and what came out on Droid's
   * graphite was a pale fleck, not rust.
   *
   * Measured before the fix: Droid had 82 meshes brighter than 1.05x their own
   * panel, 15 of them at 4x or more, with 53 vertices pinned at the channel
   * clamp; Biggy 41 and 18; Voxxy none at all, which is why four rounds of
   * looking at her never found it.
   */
  for (const kind of KINDS) {
    it(`${kind}: no worn patch is more than ${MAX_WEAR_LUM_GAIN}x its own panel's luminance`, () => {
      const rig = createRobot(kind);
      let worst = 1;
      let worstWhere = '';
      let pinned = 0;
      rig.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const col = o.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
        if (!col) return;
        const base = (o.material as THREE.MeshStandardMaterial).color;
        const baseLum = Math.max(1e-9, lum(base.r, base.g, base.b));
        for (let i = 0; i < col.count; i++) {
          const r = col.getX(i);
          const g = col.getY(i);
          const b = col.getZ(i);
          // The channel clamp is the hue-destroying failure itself: reaching it
          // at all means some channel wanted more than the others could follow.
          if (Math.max(r, g, b) >= 5.999) pinned++;
          const gain = lum(base.r * r, base.g * g, base.b * b) / baseLum;
          if (gain > worst) {
            worst = gain;
            worstWhere = `#${base.getHexString()}`;
          }
        }
      });
      rig.dispose();
      expect(pinned, 'vertices pinned at the per-channel clamp').toBe(0);
      // A hair of slack for the float round trip through the attribute.
      expect(worst, `worst gain, on ${worstWhere}`).toBeLessThanOrEqual(MAX_WEAR_LUM_GAIN + 0.01);
    });
  }
});

/** Drive a rig at a steady speed and read the peak rate of its shoulder. */
function shoulderPeakRate(rig: RobotRig, mps: number): number {
  const dt = 1 / 480;
  for (let i = 0; i < 960; i++) updateRobot(rig, { speedMps: mps, heading: Math.PI / 2, dt });
  let peak = 0;
  let prev = rig.bones.upperArmL.rotation.x;
  for (let i = 0; i < 2400; i++) {
    updateRobot(rig, { speedMps: mps, heading: Math.PI / 2, dt });
    const a = rig.bones.upperArmL.rotation.x;
    peak = Math.max(peak, Math.abs(a - prev) / dt);
    prev = a;
  }
  return peak;
}

describe('arms are slew limited, so nobody windmills', () => {
  /*
   * Michele: *"Voxxy's arms are frenetic at speed."* Measured off the bone, her
   * shoulder was running at **30.3 rad/s — 1735 degrees per second** at her top
   * speed, because 0.85 rad of swing has to be covered inside a 0.179 s cycle.
   * The cure is a peak-rate limit on the arm, which is a statement about the
   * actuator: it binds on whoever is breaking it and on nobody else.
   */
  for (const kind of KINDS) {
    it(`${kind}: the shoulder stays under 12.5 rad/s at ${topSpeed(kind).toFixed(1)} m/s`, () => {
      const rig = createRobot(kind);
      const peak = shoulderPeakRate(rig, topSpeed(kind));
      rig.dispose();
      // 12 is the limit; the half is the sampling, since the peak is read off a
      // finite difference of a cosine rather than from its derivative.
      expect(peak).toBeLessThan(12.5);
    });
  }

  it('voxxy still swings her arms at a walk — the limit is a ceiling, not a nerf', () => {
    const rig = createRobot('voxxy');
    const peak = shoulderPeakRate(rig, 1);
    rig.dispose();
    // Measured 9.3 rad/s at 1 m/s, which is under the ceiling and therefore
    // untouched. If a future change drops this it has taken her walk with it.
    expect(peak).toBeGreaterThan(8);
  });
});

describe('the hop has a pose', () => {
  const settle = (rig: RobotRig): void => {
    for (let i = 0; i < 60; i++) updateRobot(rig, { speedMps: 0, heading: Math.PI / 2, dt: 1 / 60 });
  };

  it('hop defaults to 0, so every existing call site is unchanged', () => {
    const a = createRobot('voxxy');
    const b = createRobot('voxxy');
    settle(a);
    settle(b);
    for (let i = 0; i < 30; i++) {
      updateRobot(a, { speedMps: 2, heading: 0.3, dt: 1 / 60 });
      updateRobot(b, { speedMps: 2, heading: 0.3, dt: 1 / 60, hop: 0 });
    }
    for (const bone of ['thighL', 'shinL', 'shoulderL', 'head']) {
      expect(a.bones[bone].rotation.x).toBeCloseTo(b.bones[bone].rotation.x, 10);
    }
    a.dispose();
    b.dispose();
  });

  it('tucks the knees and lifts the arms at the top of the arc', () => {
    const rig = createRobot('voxxy');
    settle(rig);
    const groundKnee = rig.bones.shinL.rotation.x;
    const groundArm = rig.bones.shoulderL.rotation.x;
    // The apex: `hopPhase` is 0.5 halfway through the airtime.
    updateRobot(rig, { speedMps: 2, heading: Math.PI / 2, dt: 1 / 60, hop: 0.5 });
    expect(rig.bones.shinL.rotation.x, 'knee folds further than standing').toBeGreaterThan(groundKnee + 0.3);
    expect(rig.bones.shoulderL.rotation.x, 'arm comes up (negative is up)').toBeLessThan(groundArm - 0.8);
    // Both arms, not one: it is a jump, not a wave.
    expect(rig.bones.shoulderR.rotation.x).toBeCloseTo(rig.bones.shoulderL.rotation.x, 6);
    rig.dispose();
  });

  it('reaches for the floor on the way down', () => {
    const rig = createRobot('voxxy');
    settle(rig);
    updateRobot(rig, { speedMps: 2, heading: Math.PI / 2, dt: 1 / 60, hop: 0.5 });
    const apexKnee = rig.bones.shinL.rotation.x;
    updateRobot(rig, { speedMps: 2, heading: Math.PI / 2, dt: 1 / 60, hop: 0.95 });
    expect(rig.bones.shinL.rotation.x, 'the leg straightens into the landing').toBeLessThan(apexKnee - 0.3);
    rig.dispose();
  });

  it('nothing is in contact with a floor that is 30 cm below', () => {
    const rig = createRobot('voxxy');
    settle(rig);
    for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      updateRobot(rig, { speedMps: 2, heading: Math.PI / 2, dt: 1 / 60, hop: u });
      // `main.ts` fires footstep audio off this flag; without it she clatters
      // across the whole arc.
      expect(footContact(rig, 'L'), `left foot at u=${u}`).toBe(false);
      expect(footContact(rig, 'R'), `right foot at u=${u}`).toBe(false);
    }
    rig.dispose();
  });

  it('a mounted robot cannot be hopping, whatever it is passed', () => {
    const rig = createRobot('droid');
    settle(rig);
    updateRobot(rig, { speedMps: 0, heading: Math.PI / 2, dt: 1 / 60, mounted: true });
    const seated = rig.bones.thighL.rotation.x;
    updateRobot(rig, { speedMps: 0, heading: Math.PI / 2, dt: 1 / 60, mounted: true, hop: 0.5 });
    expect(rig.bones.thighL.rotation.x).toBeCloseTo(seated, 10);
    rig.dispose();
  });
});
