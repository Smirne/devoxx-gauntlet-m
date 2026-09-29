/**
 * Droid's ladle in the 3D build — every frame of a take and a put, against the
 * furniture it lives among.
 *
 * Michele, 29 Sep 2026: *"droid soup animation: some enhancements needed. When
 * taking the ladle, it goes through the shelf, and when dropping it, it appears
 * in the pot before the movement."* The ladle moved on a 0.4 s timer of its own
 * while his arm ran on the reach clock behind a walk of up to three seconds, so
 * it left the hook before his hand got there, rode up to the rail pointing into
 * the shelf, and stood in the pot while he was still walking to it.
 *
 * What this pins, playing the sim and posing the ladle exactly as `world.ts`
 * does (`poseLadle`, off the robots `updateRobots` has just posed):
 *
 *  1. ONE CLOCK. It leaves the hook on the frame his palm is on its sleeve, and
 *     arrives in the pot on the frame his fingers open with his palm on the
 *     sleeve of its place there — never before, never from a distance.
 *  2. NOTHING JUMPS. No frame moves it further than a hand can carry it.
 *  3. IT CLEARS THE FURNITURE, every frame: the shelf slab and the bowls on it,
 *     the soup counter, the TOMATO SOUP sign, and the pots — which it may be in
 *     only through the top: no stretch of it crosses a pot's wall under the rim.
 *     His own hand clears the slab too.
 *
 * Presentation only: nothing here is read by the sim.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { DT_MAX, GF, createGame, type DebugGame, type Prop } from '../src/sim';
import { m } from '../src/sim/units';
import { activeReach, cancelReach, palmWorld, reachClock } from '../src/render3d/reach3d';
import { createRobots, updateRobots, type Robot3D } from '../src/render3d/robots3d';
import {
  LADLE_REACH,
  SHELF_SLAB_Y,
  SOUP_POT,
  carryFrame,
  hookPose,
  ladlePose,
  ladleShelf,
  poseLadle,
  potPose,
  sleeveOf,
  soupPots,
} from '../src/render3d/props-ground';
import type { RobotKind } from '../src/sim/types';

/* ------------------------------------------------------------ the ladle ---- */

/**
 * The ladle's shape in its own frame (`makeLadle`: hooked end at the origin,
 * handle along +z, crook down into a 0.1 m bowl opening +y), as a polyline dense
 * enough that nothing thicker than 2 cm can hide between two samples, plus the
 * bowl's rim and bottom.
 */
const LINE: THREE.Vector3[] = (() => {
  const L = LADLE_REACH;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.07, -0.12),
    new THREE.Vector3(0, 0.03, -0.07),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, L * 0.85),
    new THREE.Vector3(0, -0.03, L),
    new THREE.Vector3(0, -0.09, L + 0.03),
  ]);
  return path.getSpacedPoints(48);
})();
const BOWL = new THREE.Vector3(0, -0.09, LADLE_REACH + 0.13);
const RIM: THREE.Vector3[] = [...Array(12).keys()].map((i) => BOWL.clone().add(new THREE.Vector3(0.1 * Math.cos((i / 12) * Math.PI * 2), 0, 0.1 * Math.sin((i / 12) * Math.PI * 2))));
const BOTTOM = BOWL.clone().add(new THREE.Vector3(0, -0.1, 0));

/** The ladle in world space for a pose: the handle's polyline, and every point that has to clear things. */
function shape(pose: { pos: THREE.Vector3; quat: THREE.Quaternion }): { line: THREE.Vector3[]; all: THREE.Vector3[] } {
  const w = (p: THREE.Vector3): THREE.Vector3 => p.clone().applyQuaternion(pose.quat).add(pose.pos);
  const line = [...LINE.map(w), w(BOWL), w(BOTTOM)];
  return { line, all: [...line, ...RIM.map(w)] };
}

/* ------------------------------------------------------- the furniture ---- */

interface Box {
  name: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
}
const inside = (p: THREE.Vector3, b: Box): boolean =>
  p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z;

function furniture(st: Prop): { boxes: Box[]; pots: Array<{ name: string; x: number; z: number }> } {
  const sh = ladleShelf();
  const soup = GF.food.soup;
  const cx = m(st.x + (st.w ?? 22) / 2);
  const cz = m(st.y + (st.h ?? 22) / 2);
  const pots = soupPots(st);
  return {
    boxes: [
      // The slab, and the stacked bowls standing on it (a box over the whole top).
      { name: 'the shelf slab', min: new THREE.Vector3(sh.cx - sh.w / 2, SHELF_SLAB_Y - 0.025, sh.back), max: new THREE.Vector3(sh.cx + sh.w / 2, SHELF_SLAB_Y + 0.025, sh.front) },
      { name: 'the bowls on the shelf', min: new THREE.Vector3(sh.cx - sh.w / 2, SHELF_SLAB_Y + 0.025, sh.back), max: new THREE.Vector3(sh.cx + sh.w / 2, SHELF_SLAB_Y + 0.25, sh.front) },
      { name: 'the soup counter', min: new THREE.Vector3(m(soup.x), 0, m(soup.y)), max: new THREE.Vector3(m(soup.x + soup.w), SOUP_POT.counter, m(soup.y + soup.h)) },
      { name: 'the TOMATO SOUP sign', min: new THREE.Vector3(cx - 1.15, SOUP_POT.counter + 1.64, cz - 0.23), max: new THREE.Vector3(cx + 1.15, SOUP_POT.counter + 2.16, cz - 0.14) },
    ],
    pots: [
      { name: 'the pot he fills', ...pots.takeable },
      { name: "the crowd's pot", ...pots.crowd },
    ],
  };
}

/** A pot's wall radius at height `y`, or null above the rim / under the floor. */
function wallAt(y: number): number | null {
  const u = (y - SOUP_POT.counter) / SOUP_POT.h;
  return u < 0 || u > 1 ? null : SOUP_POT.rBottom + (SOUP_POT.rTop - SOUP_POT.rBottom) * u;
}

/** What is wrong with the ladle (and his hand) this frame, if anything. */
function clashes(line: THREE.Vector3[], all: THREE.Vector3[], hand: THREE.Vector3[], st: Prop): string[] {
  const f = furniture(st);
  const bad: string[] = [];
  for (const b of f.boxes) {
    if (all.some((p) => inside(p, b))) bad.push(`the ladle is in ${b.name}`);
    if (b.name.startsWith('the shelf') && hand.some((p) => inside(p, b))) bad.push(`his hand is in ${b.name}`);
  }
  for (const pot of f.pots) {
    const r = (p: THREE.Vector3): number => Math.hypot(p.x - pot.x, p.z - pot.z);
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const c = line[i];
      const ra = wallAt(a.y);
      const rc = wallAt(c.y);
      // Both under the rim, one in and one out: that stretch goes through the wall.
      if (ra !== null && rc !== null && r(a) < ra !== r(c) < rc) {
        bad.push(`the ladle goes through the wall of ${pot.name}`);
        break;
      }
    }
    if (pot.name !== 'the pot he fills') {
      if (all.some((p) => { const w = wallAt(p.y); return w !== null && r(p) < w; })) bad.push(`the ladle is in ${pot.name}`);
    }
  }
  return bad;
}

/* ------------------------------------------------------------ the harness ---- */

const SHELF_AT = { x: GF.food.shelf.x + 11, y: GF.food.shelf.y + 8 };

interface Frame {
  i: number;
  state: string | undefined;
  take: number | null;
  put: number | null;
  inHand: boolean;
  pos: THREE.Vector3;
  bowl: THREE.Vector3;
  palm: THREE.Vector3;
  bad: string[];
}

function harness(): { g: DebugGame; robots: Map<RobotKind, Robot3D>; step: () => Frame } {
  cancelReach();
  const g = createGame({ seed: 20260930, chapter: 3, cards: false });
  const robots = createRobots(new THREE.Group(), 256);
  const hook = hookPose(ladlePose());
  const rest = ladlePose();
  const pose = ladlePose();
  const carry = new THREE.Quaternion();
  const fwd = new THREE.Vector3();
  let i = 0;
  const step = (): Frame => {
    g.update(DT_MAX);
    const snap = g.snapshot();
    updateRobots(robots, snap, DT_MAX);
    const lp = snap.props.find((q) => q.kind === 'ladle');
    const st = snap.props.find((q) => q.kind === 'soup-station') as Prop;
    const rig = (robots.get('droid') as Robot3D).rig;
    // Exactly as world.ts's `holdLadle` (the pot is still on the counter here).
    potPose(soupPots(st).takeable, rest);
    const palm = palmWorld(rig);
    rig.root.getWorldDirection(fwd).setY(0).normalize();
    carryFrame(fwd, carry);
    const take = reachClock('ladle-shelf');
    const put = reachClock('ladle-pot');
    const inHand = poseLadle(pose, { state: lp?.state, take, put, palm, carry, hook, rest });
    const { line, all } = shape(pose);
    rig.root.updateMatrixWorld(true);
    const hand = [palm, ...[0, 1, 2, 3].map((k) => rig.bones[`fingerR${k}`].localToWorld(new THREE.Vector3(0, -0.1, 0)))];
    return { i: i++, state: lp?.state, take, put, inHand, pos: pose.pos.clone(), bowl: line[line.length - 2].clone(), palm: palm.clone(), bad: clashes(line, all, hand, st) };
  };
  return { g, robots, step };
}

/** Droid takes the ladle from `from`: every frame from the key press until his arm is back. */
function take(from: { x: number; y: number }): { h: ReturnType<typeof harness>; frames: Frame[] } {
  const h = harness();
  for (let k = 0; k < 3; k++) h.step();
  h.g.debug.select('droid');
  h.g.debug.place('droid', from.x, from.y);
  h.step();
  h.g.key('KeyE');
  const frames: Frame[] = [];
  for (let k = 0; k < 150; k++) {
    frames.push(h.step());
    if (k > 5 && activeReach() === null) break;
  }
  return { h, frames };
}

/** ...then carries it to `to` and puts it in the pot: every frame from the key press until it is over. */
function put(h: ReturnType<typeof harness>, to: { x: number; y: number }): Frame[] {
  h.g.debug.place('droid', to.x, to.y);
  for (let k = 0; k < 20; k++) h.step();
  h.g.key('KeyE');
  const frames: Frame[] = [];
  for (let k = 0; k < 180; k++) {
    frames.push(h.step());
    if (k > 5 && activeReach() === null) break;
  }
  return frames;
}

const jumps = (frames: Frame[], key: 'pos' | 'bowl'): number => {
  let most = 0;
  for (let k = 1; k < frames.length; k++) most = Math.max(most, frames[k][key].distanceTo(frames[k - 1][key]));
  return most;
};

/* -------------------------------------------------------------- the tests ---- */

describe("Droid's ladle: on the hook until his hand is on it, in his hand until it is in the pot", () => {
  // The task arrows (`shelfStand`, `soupStand` in ch3-breakfast.ts), and two
  // harder places: right under the shelf, and along the counter from the east,
  // the line that used to walk him into it.
  const TAKES = [
    { name: 'from the task arrow', at: { x: SHELF_AT.x, y: SHELF_AT.y + 26 } },
    { name: 'from right under the shelf', at: { x: SHELF_AT.x - 4, y: SHELF_AT.y + 16 } },
  ];
  const PUTS = [
    { name: 'from the task arrow', at: { x: GF.food.soup.x + 45, y: GF.food.soup.y + GF.food.soup.h + 22 } },
    { name: 'from along the counter', at: { x: GF.food.soup.x + GF.food.soup.w + 2, y: GF.food.soup.y + GF.food.soup.h + 10 } },
  ];

  for (const t of TAKES) {
    it(`takes it off the hook ${t.name}, and nothing goes through the shelf`, () => {
      const { frames } = take(t.at);
      expect(frames[frames.length - 1].state).toBe('active');
      const first = frames.findIndex((f) => f.inHand);
      expect(first, 'the ladle never went into his hand').toBeGreaterThan(0);
      // Not before his palm is on it: still on the hook the frame before, and the
      // frame it leaves the hook his palm is on its sleeve.
      const hook = hookPose(ladlePose());
      expect(frames[first - 1].pos.distanceTo(hook.pos), 'it left the hook before his hand got there').toBeLessThan(1e-9);
      expect(frames[first].palm.distanceTo(sleeveOf(hook, new THREE.Vector3())), 'his palm is not on the ladle when it leaves the hook').toBeLessThan(0.03);
      expect(frames[first].take ?? -1).toBeGreaterThanOrEqual(0.5);
      for (const f of frames) expect(f.bad, `frame ${f.i} (reach ${f.take?.toFixed(2)})`).toEqual([]);
      expect(jumps(frames, 'pos'), 'the ladle jumped').toBeLessThan(0.3);
      expect(jumps(frames, 'bowl'), 'the bowl jumped').toBeLessThan(0.45);
      // ...and it ends the reach in his hand, carried upright.
      const last = frames[frames.length - 1];
      expect(last.inHand).toBe(true);
      expect(last.bowl.y - last.pos.y, 'not carried upright').toBeGreaterThan(0.4);
    });
  }

  for (const p of PUTS) {
    it(`puts it in the pot ${p.name}: from his hand, through the top, when his hand is there`, () => {
      const { h } = take(TAKES[0].at);
      const frames = put(h, p.at);
      expect(frames[frames.length - 1].state).toBe('done');
      const landed = frames.findIndex((f) => !f.inHand);
      expect(landed, 'the ladle was never let go').toBeGreaterThan(0);
      // In his hand until then — through the whole walk up — and let go only
      // with his palm on the sleeve of its place in the pot.
      for (const f of frames.slice(0, landed)) expect(f.inHand).toBe(true);
      const rest = potPose(soupPots(h.g.snapshot().props.find((q) => q.kind === 'soup-station') as Prop).takeable, ladlePose());
      expect(frames[landed].pos.distanceTo(rest.pos)).toBeLessThan(1e-9);
      expect(frames[landed - 1].palm.distanceTo(sleeveOf(rest, new THREE.Vector3())), 'it arrived in the pot from a hand that was not there').toBeLessThan(0.03);
      expect(frames[landed].put ?? -1, 'let go before his fingers opened').toBeGreaterThanOrEqual(0.86);
      for (const f of frames) expect(f.bad, `frame ${f.i} (reach ${f.put?.toFixed(2)})`).toEqual([]);
      expect(jumps(frames, 'pos'), 'the ladle jumped').toBeLessThan(0.3);
      expect(jumps(frames, 'bowl'), 'the bowl jumped').toBeLessThan(0.45);
      // Standing in the pot: the bowl under the rim, inside it.
      const pots = soupPots(h.g.snapshot().props.find((q) => q.kind === 'soup-station') as Prop);
      const end = frames[frames.length - 1];
      expect(end.bowl.y).toBeLessThan(SOUP_POT.counter + SOUP_POT.h);
      expect(Math.hypot(end.bowl.x - pots.takeable.x, end.bowl.z - pots.takeable.z)).toBeLessThan(SOUP_POT.rTop - 0.1);
    });
  }
});
