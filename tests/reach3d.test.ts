/**
 * Droid's hand on a lever — the 3D renderer's reach, as numbers.
 *
 * Michele, 29 Sep 2026: *"Droid's animation while using levers / breaker still
 * need improvement. He should reach the lever and pull it, with more natural
 * movements."* What that asks of the code is three things this file pins:
 *
 *  1. The handle and the hand run on ONE clock, and the handle is home exactly
 *     when the sim lets cinema B's door move (`LEVER_REACH_TIME`) — the picture
 *     never gets ahead of, or behind, the game.
 *  2. The hand is ON the handle for the whole pull: both arm weights are 1 and
 *     the extra elbow fold is 0 from the grip to the let-go, and the IK really
 *     does put the palm on a target it can reach.
 *  3. Nothing snaps: every weight starts and ends at 0 and moves in small steps.
 *
 * Presentation only; nothing here is read by the sim.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { LEVER_REACH_TIME } from '../src/sim/chapters/ch1-night';
import { LETTER_CARRY_REACH, LETTER_D } from '../src/sim/letters';
import { PX_PER_M } from '../src/sim/units';
import { createRobot, updateRobot } from '../src/render/robots';
import {
  GRIP_AT,
  LET_GO,
  PULL_END,
  REACH_END,
  armReach,
  holdLetter,
  palmOf,
  palmWorld,
  pullAt,
  reachClock,
  reachWeights,
  solveArmR,
  startReach,
  tickReach,
} from '../src/render3d/reach3d';

describe("Droid's reach: one clock for the hand and the handle", () => {
  it('throws the handle over the grip-to-home window, home when the sim opens the door', () => {
    expect(PULL_END).toBe(LEVER_REACH_TIME);
    expect(pullAt(0)).toBe(0);
    expect(pullAt(GRIP_AT)).toBe(0);
    expect(pullAt(PULL_END)).toBe(1);
    expect(pullAt(REACH_END)).toBe(1);
    expect(reachWeights(0.6).pull).toBe(pullAt(0.6));
  });

  it('keeps the hand on the handle from the grip to the let-go', () => {
    for (let s = GRIP_AT; s <= LET_GO; s += 0.01) {
      const w = reachWeights(s);
      expect(w.arm, `arm at ${s.toFixed(2)}`).toBeCloseTo(1, 6);
      expect(w.travel, `travel at ${s.toFixed(2)}`).toBeCloseTo(1, 6);
      expect(w.fold, `fold at ${s.toFixed(2)}`).toBeCloseTo(0, 6);
    }
  });

  it('starts and ends at rest and never snaps', () => {
    const keys = ['face', 'arm', 'travel', 'fold', 'grip', 'body', 'effort'] as const;
    for (const k of keys) {
      expect(reachWeights(0)[k], `${k} at 0`).toBeCloseTo(0, 6);
      expect(reachWeights(REACH_END)[k], `${k} at the end`).toBeCloseTo(0, 6);
    }
    const dt = 1 / 120;
    let prev = reachWeights(0);
    for (let s = dt; s <= REACH_END; s += dt) {
      const w = reachWeights(s);
      // A hand closes fast (a tenth of a second), and the IK takes the arm over
      // just as fast because it takes it over AT the palm's own rest: neither
      // is a jump on screen. Everything else moves slower.
      for (const k of keys) expect(Math.abs(w[k] - prev[k]), `${k} jumps at ${s.toFixed(3)}`).toBeLessThan(k === 'grip' || k === 'arm' ? 0.13 : 0.06);
      prev = w;
    }
    // The IK takes the arm over before the palm has left his side, and gives it
    // back only once the palm is home again: no pop at either end.
    expect(reachWeights(0.1).arm).toBeCloseTo(1, 6);
    expect(reachWeights(0.1).travel).toBeLessThan(0.1);
    expect(reachWeights(REACH_END - 0.12).travel).toBeLessThan(0.02);
  });

  it('runs the clock for the handle it was started on, and stops at the end', () => {
    startReach('breaker1');
    tickReach(0.3);
    expect(reachClock('breaker1')).toBeCloseTo(0.3, 9);
    expect(reachClock('lever')).toBeNull();
    tickReach(REACH_END);
    expect(reachClock('breaker1')).toBeNull();
  });
});

describe("Droid's reach: the palm lands on the handle", () => {
  const rig = createRobot('droid');
  for (let i = 0; i < 10; i++) updateRobot(rig, { speedMps: 0, heading: -Math.PI / 2, dt: 1 / 30 });
  rig.root.updateMatrixWorld(true);
  const shoulder = rig.bones.upperArmR.getWorldPosition(new THREE.Vector3());
  const L = armReach(rig);

  it('puts the palm on a handle within reach, above and in front', () => {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.root.getWorldQuaternion(new THREE.Quaternion()));
    for (const [up, out] of [
      [0.5, 0.5],
      [0.2, 0.7],
      [0.7, 0.2],
    ] as const) {
      const target = shoulder.clone().addScaledVector(fwd, out * L).add(new THREE.Vector3(0, up * L, 0));
      const short = solveArmR(rig, target, 1, 1, 0);
      expect(short).toBe(0);
      expect(palmWorld(rig).distanceTo(target), `palm off the handle at ${up}/${out}`).toBeLessThan(0.005);
    }
  });

  it('points the arm straight at a handle it cannot get to', () => {
    const target = shoulder.clone().add(new THREE.Vector3(0, 1.2 * L, 0.8 * L));
    expect(solveArmR(rig, target, 1, 1, 0)).toBeGreaterThan(0);
    const dir = target.clone().sub(shoulder).normalize();
    const palm = palmWorld(rig).sub(shoulder);
    expect(palm.length()).toBeCloseTo(L * 0.999, 2);
    expect(palm.normalize().dot(dir)).toBeGreaterThan(0.999);
  });
});

/*
 * THE LETTER IN BOTH HANDS, WHEREVER THE SIM HAS IT.
 *
 * Michele, 29 Sep 2026: *"letters (and droid's arm) through the wall"*. The sim
 * keeps a carried letter out of the walls (`carryPoint`, tests/letters.test.ts);
 * this is the arm half. The gait's canned carry reached 1.03 m out whatever was in
 * front of him, so pulled in against a wall the letter would have been clear and
 * his hands still in the plaster. `holdLetter` brings both palms to the letter,
 * and nothing of either arm may reach past its front face.
 */
describe("Droid's reach: a carried letter in both hands", () => {
  /** Forward extent of everything hanging off the arm bones, along his heading (+x). */
  const armFront = (rig: ReturnType<typeof createRobot>): number => {
    rig.root.updateMatrixWorld(true);
    let front = -Infinity;
    const v = new THREE.Vector3();
    for (const bone of ['upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR']) {
      rig.bones[bone].traverse((n) => {
        if (!(n instanceof THREE.Mesh)) return;
        const pos = n.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) front = Math.max(front, v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld).x);
      });
    }
    return front;
  };

  it('puts both palms on the letter and keeps both arms behind its face, however far in it is', () => {
    // From the sim's full reach down to hugged against his chest.
    for (const reach of [LETTER_CARRY_REACH / PX_PER_M, 0.7, 0.5, 0.36, 0.25]) {
      const rig = createRobot('droid');
      // Heading 0: sim +x, which is world +x, so "in front" is +x.
      for (let i = 0; i < 60; i++) updateRobot(rig, { speedMps: 0, heading: 0, dt: 1 / 30, carrying: true });
      expect(holdLetter(rig, new THREE.Vector3(reach, 0, 0), 0, 1), `at ${reach} m the hands cannot get to it`).toBe(0);
      for (const side of ['L', 'R'] as const) {
        const palm = palmOf(rig, side);
        expect(Math.abs(palm.x - reach), `${side} palm is ${(palm.x - reach).toFixed(3)} m off the letter at ${reach} m`).toBeLessThan(0.005);
        // Either side of its middle, not crossed over it.
        expect(Math.sign(palm.z), `${side} palm on the wrong side`).toBe(side === 'L' ? 1 : -1);
      }
      const face = reach + LETTER_D / PX_PER_M / 2;
      expect(armFront(rig), `at ${reach} m an arm reaches past the letter's face`).toBeLessThan(face);
    }
  });

  it('is the canned carry that reached through: without it the arms are out past a letter pulled in', () => {
    const rig = createRobot('droid');
    for (let i = 0; i < 60; i++) updateRobot(rig, { speedMps: 0, heading: 0, dt: 1 / 30, carrying: true });
    // The number the sim's reach was measured from, and how far past it the hands went.
    expect(armFront(rig)).toBeGreaterThan(LETTER_CARRY_REACH / PX_PER_M + LETTER_D / PX_PER_M / 2);
  });
});
