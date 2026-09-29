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

import { GF, createGame } from '../src/sim';
import { LEVER_REACH_TIME } from '../src/sim/chapters/ch1-night';
import { PANEL_REACH } from '../src/sim/chapters/ch2-expo';
import { LETTER_CARRY_REACH, LETTER_D } from '../src/sim/letters';
import { PX_PER_M, m } from '../src/sim/units';
import { createRobot, updateRobot } from '../src/render/robots';
import { BREAKER_HANDLES } from '../src/render3d/props-ground';
import {
  GRIP_AT,
  LET_GO,
  PULL_END,
  REACH_END,
  REACH_SLIP,
  STAND_OFF,
  STEP_MAX,
  WALK_BACK,
  activeReach,
  armReach,
  cancelReach,
  holdLetter,
  palmOf,
  palmWorld,
  pullAt,
  queueReach,
  reachClock,
  reachWeights,
  registerGrip,
  slipped,
  solveArmR,
  startReach,
  stepFor,
  tickReach,
  walkAt,
  type Reach,
  type Spot,
} from '../src/render3d/reach3d';
import { bot, passable } from './pilot';

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

/* ----------------------------------------------- chapter 2's three handles ---- */

/**
 * Michele, 29 Sep 2026, on chapter 2: *"breakers scene: i see no animation, and
 * yes, droid should be nearer to activate it."* What the picture owed him, and
 * what these pin, with the board's three handles where `props-ground.ts` hangs
 * them:
 *
 *  1. Every handle the sim puts up is pulled by his hand, in turn — a press while
 *     another is in his hand waits for it, instead of replacing it and snapping
 *     the first one up untouched.
 *  2. Nothing jumps: the walk up and back are drawn between PLACES, and the next
 *     handle starts from the one he is at, not from where the sim has him.
 *  3. The hand is dropped for being walked off, not for still coasting.
 *  4. From anywhere the sim lets him throw one, he gets to every handle.
 */
describe("Droid's reach: chapter 2's breakers, one pull per handle", () => {
  /** A handle's grip on the floor plan, world metres, hanging down (as the board is built). */
  const handle = (i: number): Spot => ({
    x: m(GF.panel.x + GF.panel.w / 2) + (i - 1) * BREAKER_HANDLES.pitch,
    z: m(GF.tech.y) + BREAKER_HANDLES.out,
  });
  const board = [0, 1, 2].map((i) => {
    const point = new THREE.Object3D();
    const h = handle(i);
    point.position.set(h.x, BREAKER_HANDLES.pivotY - BREAKER_HANDLES.grip, h.z);
    point.updateMatrixWorld(true);
    registerGrip(`breaker${i}`, { point, throw: 'up', set: () => {} });
    return h;
  });
  /** Where the sim's `panelAt` is: the middle of the board's rect. */
  const PANEL = { x: GF.panel.x + GF.panel.w / 2, y: GF.panel.y + GF.panel.h / 2 };

  it('pulls every handle pressed, in turn, and never two at once', () => {
    cancelReach();
    // Three presses a tenth of a second apart, from the task arrow.
    const at: Spot = { x: m(PANEL.x), z: m(PANEL.y + 8) };
    const dt = 1 / 60;
    const pulls: number[][] = [];
    const bodies: Spot[] = [];
    for (let f = 0; f < 60 * 7; f++) {
      if (f === 0 || f === 6 || f === 12) queueReach(`breaker${f / 6}`, at);
      tickReach(dt, at);
      pulls.push(
        [0, 1, 2].map((i) => {
          const c = reachClock(`breaker${i}`);
          // No clock: not pressed yet, or its pull is over (the sim has it up).
          return c === null ? (f > 12 ? 1 : 0) : pullAt(c);
        }),
      );
      const r = activeReach();
      bodies.push(r ? walkAt(r, at) : { ...at });
    }
    for (const i of [0, 1, 2]) {
      const k = pulls.map((p) => p[i]);
      const first = k.findIndex((v) => v > 0);
      const home = k.findIndex((v) => v >= 1 - 1e-9);
      expect(first, `handle ${i} was never pulled`).toBeGreaterThan(0);
      expect(home, `handle ${i} never got home`).toBeGreaterThan(first);
      // A pull, not a pop: it passes through the middle of its travel.
      expect(k.filter((v) => v > 0.1 && v < 0.9).length, `handle ${i} snapped up`).toBeGreaterThan(3);
      for (let f = 1; f < k.length; f++) expect(k[f], `handle ${i} went back down`).toBeGreaterThanOrEqual(k[f - 1] - 1e-9);
      if (i > 0) {
        const before = pulls.map((p) => p[i - 1]).findIndex((v) => v >= 1 - 1e-9);
        expect(first, `handle ${i} moved before handle ${i - 1} was home`).toBeGreaterThan(before);
      }
    }
    for (const p of pulls) expect(p.filter((v) => v > 0 && v < 1).length, 'two handles in his hand at once').toBeLessThanOrEqual(1);
    // No jump anywhere, and no walk back to the arrow between handles: from his
    // hand's first pull to the third handle home, he stays at the board.
    let most = 0;
    for (let f = 1; f < bodies.length; f++) most = Math.max(most, Math.hypot(bodies[f].x - bodies[f - 1].x, bodies[f].z - bodies[f - 1].z));
    expect(most / dt, 'the drawn body jumped').toBeLessThan(3);
    const arrive = pulls.findIndex((p) => p[0] > 0);
    const last = pulls.findIndex((p) => p[2] >= 1 - 1e-9);
    for (let f = arrive; f <= last; f++) {
      const near = Math.min(...board.map((h) => Math.hypot(bodies[f].x - h.x, bodies[f].z - h.z)));
      expect(near, `walked away from the board between handles, frame ${f}`).toBeLessThan(STAND_OFF + 0.2);
    }
    // ...and home to where the sim has him once it is all over.
    expect(activeReach()).toBeNull();
    const end = bodies[bodies.length - 1];
    expect(Math.hypot(end.x - at.x, end.z - at.z)).toBeLessThan(1e-9);
  });

  it('walks from where he is to a place at the handle, and back to wherever the sim has him', () => {
    const at = (p: Spot, q: Spot): number => Math.hypot(p.x - q.x, p.z - q.z);
    const to: Spot = { x: 5, z: 45.8 };
    const r: Reach = { id: 'breaker1', s: -1, lead: 1, back: 0.8, from: null, to, anchor: { x: 5, z: 47 } };
    const sim: Spot = { x: 5, z: 47 };
    expect(at(walkAt(r, sim), sim)).toBeLessThan(1e-9);
    // Still coasting while he walks up: the walk starts where he is, and ends at
    // the handle all the same — not as far past it as the sim carried him.
    const coasted: Spot = { x: 5, z: 46.7 };
    expect(at(walkAt(r, coasted, undefined, 0), to)).toBeLessThan(1e-9);
    expect(at(walkAt(r, coasted, undefined, WALK_BACK), to)).toBeLessThan(1e-9);
    expect(at(walkAt(r, coasted, undefined, WALK_BACK + r.back), coasted)).toBeLessThan(1e-9);
    // In a queue, from the last handle's place rather than from the sim's.
    const chained: Reach = { ...r, from: { x: 4.6, z: 45.8 }, back: 0 };
    expect(at(walkAt(chained, sim, undefined, -1), { x: 4.6, z: 45.8 })).toBeLessThan(1e-9);
    expect(at(walkAt(chained, sim, undefined, REACH_END), to)).toBeLessThan(1e-9);
  });

  it('keeps the hand through a coast to a stop, and drops it once he is walked off', () => {
    cancelReach();
    const at: Spot = { x: m(PANEL.x), z: m(PANEL.y + 8) };
    startReach('breaker0', at);
    const r = activeReach() as Reach;
    // Droid's own coast from full speed: 2.3 m/s under drag 7 s⁻¹.
    const coast = 2.3 / 7;
    expect(coast).toBeLessThan(REACH_SLIP);
    expect(slipped(r, { x: at.x, z: at.z - coast })).toBe(false);
    expect(slipped(r, { x: at.x + REACH_SLIP + 0.01, z: at.z })).toBe(true);
    // On Biggy's shoulders there is no anchor: the tower carries him.
    startReach('lever');
    expect(slipped(activeReach() as Reach, { x: 99, z: 99 })).toBe(false);
    cancelReach();
  });

  it('gets him to every handle from anywhere the sim lets him throw one', () => {
    const g = createGame({ seed: 20260930, chapter: 2, cards: false });
    const walls = g.debug.walls();
    const droid = bot(g, 'droid');
    let spots = 0;
    for (let y = PANEL.y - PANEL_REACH; y <= PANEL.y + PANEL_REACH; y += 0.5) {
      for (let x = PANEL.x - PANEL_REACH; x <= PANEL.x + PANEL_REACH; x += 0.5) {
        if (Math.hypot(x - PANEL.x, y - PANEL.y) >= PANEL_REACH || !passable(walls, droid, x, y)) continue;
        spots++;
        const from: Spot = { x: m(x), z: m(y) };
        for (const [i, h] of board.entries()) {
          const w = stepFor(from, h);
          const stand = w.to ?? from;
          expect(
            Math.hypot(h.x - stand.x, h.z - stand.z),
            `from ${x},${y} his walk stops short of handle ${i} (STEP_MAX ${STEP_MAX} m)`,
          ).toBeLessThanOrEqual(STAND_OFF + 0.15 + 1e-9);
        }
      }
    }
    expect(spots, 'nowhere to stand inside the reach').toBeGreaterThan(100);
  });
});
