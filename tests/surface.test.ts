/**
 * HOW HIGH THE FLOOR IS — the logged item, and Michele's fallen door.
 *
 * Two reports, one question.
 *
 * `docs/playtest-notes.md` has carried this for three rounds: *"Robots do not
 * stand on the ground floor's raised lobby or its stairs. `groundRiseM(x)` exists
 * for this, its own doc says the renderer reads it, and nothing reads it — so a
 * robot on the lobby plate stands half a metre inside it and one on the main
 * flight is swallowed. This is why chapter 3's transition walks into a staircase."*
 *
 * And Michele, mid-playtest, with a screenshot of Biggy and Droid standing inside
 * the fallen leaf of the door Biggy had just smashed: *"we are still walking
 * through the crashed door. The shape is fine, as long as robot walk on it, not
 * through."*
 *
 * Both halves of that sentence matter. He does not want the leaf turned back into
 * a blocker — the whole beat is that Biggy went through it — he wants a robot
 * standing over it to be ON it. That is a walking surface, not a wall, and the two
 * are opposite questions about the same rectangle: every cell of a plate has to
 * stay walkable or the raised lobby becomes a hole in the map.
 *
 * So the sim answers it once, for all of them: `Plate`, `GameSnapshot.plates` and
 * `riseAt` in `src/sim/surface.ts`. `src/render/scene.ts`'s `surfaceY` is the one
 * line of drawing code that asks, which is what keeps a robot's height off the
 * floor a fact of the sim rather than a guess made in drawing code (CLAUDE.md).
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  DT_MAX,
  GF,
  JAMMED_DOOR_SPEED,
  LOBBY_RISE_M,
  MAIN_STAIR_TOP_M,
  R,
  createGame,
  groundPlates,
  groundRiseM,
  riseAt,
  riseForBody,
  roomDoor,
  type DebugGame,
  type NightState,
  type Plate,
} from '../src/sim';
import { JAM_LEAF_H, JAM_SKEW, JAM_SKID, jammedLeafPlate } from '../src/sim/chapters/ch1-night';
import { PX_PER_M } from '../src/sim/units';
// Vite's own `?raw`, the way `tests/clue-plate.test.ts` gets at a source file.
import SCENE_SRC from '../src/render/scene.ts?raw';

const mk = (chapter: number): DebugGame => createGame({ seed: 20260930, chapter, cards: false });
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};

describe('the ground floor is not flat, and the sim says so', () => {
  it('puts the lobby half a metre up, ramps the six steps, and climbs the main flight', () => {
    const plates = groundPlates();
    const hall = { x: GF.smallStairs.x - 40, y: 400 };
    const lobby = { x: GF.smallStairs.x + GF.smallStairs.w + 40, y: 640 };

    expect(riseAt(hall.x, hall.y, plates), 'the exhibition hall is the datum').toBe(0);
    expect(riseAt(lobby.x, lobby.y, plates)).toBeCloseTo(LOBBY_RISE_M, 6);
    // Halfway up the six steps is halfway up the level change.
    const mid = GF.smallStairs.x + GF.smallStairs.w / 2;
    expect(riseAt(mid, 400, plates)).toBeCloseTo(LOBBY_RISE_M / 2, 6);
    // ...and the main flight, from the lobby at its foot to the first floor at its
    // head. The foot is its EAST edge — the entrance side — since the quarter turn
    // of 25 Sep 2026; it used to climb north, across its own treads.
    const ms = GF.mainStair;
    expect(riseAt(ms.x + ms.w - 1, ms.y + ms.h / 2, plates)).toBeCloseTo(LOBBY_RISE_M, 1);
    expect(riseAt(ms.x + 1, ms.y + ms.h / 2, plates)).toBeCloseTo(MAIN_STAIR_TOP_M, 1);
    // Across the width of the stair the height does not change at all: that is
    // what tells the two axes apart, and it is what was wrong before.
    const foot = riseAt(ms.x + ms.w - 1, ms.y + 8, plates);
    expect(riseAt(ms.x + ms.w - 1, ms.y + ms.h - 8, plates)).toBeCloseTo(foot, 6);
  });

  /**
   * The x-only view and the plate list have to agree, or the lobby threshold is
   * modelled twice and one of them goes stale. `groundRiseM` is the older of the
   * two and `src/render/venue/ground.ts` is built to it.
   *
   * It is compared **down the staircase's own y band**, because that is the whole
   * of what `groundRiseM` ever described: a function of x alone cannot say that the
   * level change happens ON the six steps and not through the solid riser above and
   * below them, and it cannot say anything at all about the main flight. Those are
   * the two things the plates add, and they are checked above.
   */
  it('agrees with groundRiseM down the line of the six steps', () => {
    const plates = groundPlates();
    const y = GF.smallStairs.y + GF.smallStairs.h / 2;
    const ms = GF.mainStair;
    for (let x = 0; x < 1900; x += 7) {
      // Except where the main flight stands on the lobby: it climbs to 5 m out of
      // this same band, and that is the other thing a function of x cannot say.
      if (x >= ms.x && x <= ms.x + ms.w) continue;
      expect(riseAt(x, y, plates), `x=${x}`).toBeCloseTo(groundRiseM(x), 6);
    }
  });

  /**
   * ...and off that line the level change is a STEP, not a ramp: the cut edge of
   * the lobby plate above and below the flight is a 0.5 m riser you walk round, and
   * `src/render/venue/ground.ts` has built it that way from the start.
   */
  it('makes the level change a riser everywhere except on the steps themselves', () => {
    const plates = groundPlates();
    const s = GF.smallStairs;
    const above = s.y - 40;
    expect(riseAt(s.x + s.w / 2, above, plates), 'the hall side of the riser').toBe(0);
    expect(riseAt(s.x + s.w + 20, above, plates)).toBeCloseTo(LOBBY_RISE_M, 6);
  });

  it('carries the floor plates on the ground-floor snapshot and none upstairs', () => {
    const down = mk(2).snapshot().plates;
    expect(down.some((p: Plate) => p.kind === 'lobby')).toBe(true);
    expect(down.some((p: Plate) => p.kind === 'main-flight')).toBe(true);
    const up = mk(1).snapshot().plates;
    expect(up.some((p: Plate) => p.kind === 'lobby'), 'the first floor has no lobby plate').toBe(false);
  });
});

/* ============================================ the door Biggy puts on the floor */

/** Biggy charges cinema E's jammed door from the far side of the corridor. */
function smashCinemaE(g: DebugGame): void {
  const dE = roomDoor(R('E'));
  g.debug.select('biggy');
  g.debug.place('biggy', dE.cx, dE.y - 90);
  g.setStick(0, 1);
  for (let i = 0; i < 400 && !(g.debug.chapter() as NightState).jamBroken; i++) g.update(DT_MAX);
  g.setStick(0, 0);
  expect((g.debug.chapter() as NightState).jamBroken, `Biggy never got to ${JAMMED_DOOR_SPEED} px/s`).toBe(true);
}

describe('the crashed door is something you stand ON', () => {
  it('publishes no plate while the door is shut, and one once it is down', () => {
    const g = mk(1);
    steps(g, 2);
    expect(g.snapshot().plates.length, 'a shut door is a wall, not a floor').toBe(0);
    smashCinemaE(g);
    steps(g, 40);
    const plates = g.snapshot().plates;
    expect(plates.length).toBe(1);
    expect(plates[0].kind).toBe('jammed-leaf');
    // The leaf's own thickness: `leaf()` in `ch1-night.ts` draws a 6 px leaf.
    expect(plates[0].lo).toBeCloseTo(6 / PX_PER_M, 6);
  });

  it('lands flat, so the surface is the same height everywhere on it', () => {
    const g = mk(1);
    steps(g, 2);
    smashCinemaE(g);
    steps(g, 40);
    const plates = g.snapshot().plates;
    const p = plates[0];
    const heights = new Set<number>();
    for (let x = p.x + 1; x < p.x + p.w - 1; x += 3) {
      for (let y = p.y + 1; y < p.y + p.h - 1; y += 3) {
        const h = riseAt(x, y, plates);
        if (h > 0) heights.add(Number(h.toFixed(6)));
      }
    }
    /*
     * One height, not a range.
     *
     * Under `scene.ts`'s old default `XYZ` Euler order the skew was applied to the
     * door while it was still standing and the tip turned that yaw into a ROLL: the
     * leaf came to rest propped on nothing, one long edge 0.78 m in the air and its
     * face running downhill by 0.62 m across its width. You cannot stand on that.
     * `YXZ` yaws it after the tip — flat, and askew in plan, which is what a door
     * off its hinges does.
     */
    expect([...heights], 'the fallen leaf is not lying flat').toEqual([Number((6 / PX_PER_M).toFixed(6))]);
  });

  it('is the patch of floor the renderer actually draws the leaf on, corner for corner', () => {
    /*
     * The plate and the mesh are one motion written twice — once in plan by
     * `jammedLeafPlate`, once as a rigid body by `drawJammed`. This rebuilds the
     * mesh's transform exactly as `scene.ts` applies it and checks that the drawn
     * slab's top face and the plate are the same rectangle at the same height.
     * If they ever part company, a robot stands next to the leaf rather than on it.
     */
    const p = { kind: 'jammed', x: 452, y: 412, w: 46, h: 6, state: 'broken' as const };
    const plate = jammedLeafPlate(p);
    expect(plate).not.toBeNull();

    /*
     * The Euler order comes out of `scene.ts` itself rather than being retyped.
     *
     * It is the whole fix: under the default `XYZ` the skew is applied to the door
     * while it is still standing and the tip turns that yaw into a roll, so the
     * leaf comes to rest propped on nothing with its face running downhill. Read
     * from the source, a change there fails here instead of quietly putting the
     * robots back inside the leaf.
     */
    const orderMatch = /jammedLeaf\.rotation\.order = '([A-Z]{3})';/.exec(SCENE_SRC);
    expect(orderMatch, 'scene.ts no longer sets the fallen leaf\'s rotation order at all').not.toBeNull();
    const order = (orderMatch as RegExpExecArray)[1] as THREE.EulerOrder;

    const m = (v: number): number => v / PX_PER_M;
    const group = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    group.add(slab);
    slab.scale.set(m(p.w), JAM_LEAF_H, m(p.h));
    group.position.set(m(p.x) + m(p.w) / 2, 0, m(p.y) + m(p.h) + JAM_SKID);
    group.rotation.order = order;
    group.rotation.set(Math.PI / 2, -JAM_SKEW, 0);
    slab.position.set(0, JAM_LEAF_H / 2, -m(p.h) / 2);
    group.updateMatrixWorld(true);

    // The top face's four corners, in sim px, and their height off the floor.
    const corners: Array<{ x: number; y: number; h: number }> = [];
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        const v = new THREE.Vector3(sx, sy, -0.5).applyMatrix4(slab.matrixWorld);
        corners.push({ x: v.x * PX_PER_M, y: v.z * PX_PER_M, h: v.y });
      }
    }
    for (const c of corners) {
      expect(c.h, 'the drawn leaf is not flat').toBeCloseTo((plate as Plate).lo, 5);
      // A corner is on the boundary of the plate, so it is measured a hair inside.
      const cx = (plate as Plate).x + (plate as Plate).w / 2;
      const cy = (plate as Plate).y + (plate as Plate).h / 2;
      const inX = c.x + (cx - c.x) * 0.02;
      const inY = c.y + (cy - c.y) * 0.02;
      expect(
        riseAt(inX, inY, [plate as Plate]),
        `the renderer draws the leaf over ${c.x.toFixed(1)},${c.y.toFixed(1)} and the sim has no floor there`,
      ).toBeCloseTo((plate as Plate).lo, 6);
    }
    // ...and the plate claims nothing the leaf is not on: a metre beyond the tip.
    expect(riseAt(corners[3].x + 14, corners[3].y + 14, [plate as Plate])).toBe(0);
  });

  it('leaves the leaf WALKABLE — it is a floor, not a wall', () => {
    const g = mk(1);
    steps(g, 2);
    smashCinemaE(g);
    steps(g, 40);
    const plate = g.snapshot().plates[0];
    const at = { x: plate.x + plate.w / 2, y: plate.y + plate.h / 2 };
    /*
     * Michele's own words are the assertion: *"as long as robot walk ON it, not
     * through."* Turning the leaf into a collider would have been the easy fix and
     * the wrong one — Biggy just went through that doorway, and a chapter that
     * seals it again behind him has taken the beat away.
     */
    const biggy = g.snapshot().bots[2];
    expect(
      g.debug.walls().some((w) => w.kind === 'jammed' || w.kind === 'jammed-leaf'),
      'the smashed door is a wall again',
    ).toBe(false);
    g.debug.place('biggy', at.x, at.y);
    steps(g, 6);
    expect(Math.hypot(biggy.x - at.x, biggy.y - at.y), 'something pushed Biggy off the leaf').toBeLessThan(2);
    expect(riseAt(biggy.x, biggy.y, g.snapshot().plates), 'Biggy is standing in the leaf, not on it').toBeCloseTo(
      plate.lo,
      6,
    );
  });

  it('starts the climb where the body touches the step, not where its centre does', () => {
    /*
     * Michele, watching Biggy meet the fallen leaf: *"walking on the door is fine,
     * but starts a little too late IMHO. At first it looks like you are walking
     * through it."*
     *
     * The amount is measurable. `riseAt` asks about a POINT, so the lift arrives
     * when the robot's CENTRE crosses the edge — and for the whole radius before
     * that, the robot stands at floor height with the step's edge passing through
     * its body. `riseForBody` starts the climb at contact instead and finishes it
     * at the centre crossing, which is what walking up a step looks like.
     */
    const plate: Plate = { x: 400, y: 400, w: 60, h: 60, lo: 0.48 };
    const r = 9; // Biggy's radius, 0.72 m.
    const edge = plate.x;
    const inward = (d: number): number => riseForBody(edge + d, plate.y + plate.h / 2, r, [plate]);

    // Out of reach entirely: the floor, and no hint of the step.
    expect(inward(-r - 0.01)).toBe(0);
    expect(riseAt(edge - 0.01, plate.y + plate.h / 2, [plate]), 'the point answer at the same spot').toBe(0);

    // Touching: the climb has started. This is the frame the old answer got wrong.
    expect(inward(-r + 0.5)).toBeGreaterThan(0);
    // Half a body out: half way up.
    expect(inward(-r / 2)).toBeCloseTo(plate.lo / 2, 6);
    // Centre on the edge, and from there on: the whole rise, never a partial one.
    expect(inward(0)).toBeCloseTo(plate.lo, 6);
    expect(inward(20)).toBeCloseTo(plate.lo, 6);

    // It never lifts a robot ABOVE the surface it is climbing onto.
    for (let d = -r; d <= r; d += 0.25) {
      const h = inward(d);
      expect(h, `d=${d}`).toBeGreaterThanOrEqual(0);
      expect(h, `d=${d}`).toBeLessThanOrEqual(plate.lo + 1e-9);
    }

    // And a point-sized query is still exactly the old answer, so every decal,
    // prop and marker that asks `riseAt` is untouched.
    expect(riseForBody(edge - 3, plate.y + plate.h / 2, 0, [plate])).toBe(0);
    expect(riseForBody(edge + 3, plate.y + plate.h / 2, 0, [plate])).toBeCloseTo(plate.lo, 6);
  });

  it('draws the robots from the body answer, not the point one', () => {
    // The fix is only real if the renderer asks the new question. A regex, because
    // `scene.ts` needs a GPU and this is the same trick `clue-plate.test.ts` uses.
    expect(SCENE_SRC, 'scene.ts no longer imports riseForBody').toMatch(/riseForBody/);
    expect(SCENE_SRC, 'the robot rig is back on the point surface').toMatch(
      /rig\.root\.position\.set\(m\(b\.x\), bodySurfaceY\(/,
    );
  });

  it('keeps two plates that share a seam continuous', () => {
    /*
     * The trap in blending at edges: a robot standing on the join between the
     * lobby plate and the flight that climbs to it is near an edge of BOTH, and a
     * naive blend would sag it into the seam. Inside a plate the answer is that
     * plate's own height, unblended, so the join is flat.
     */
    const plates = groundPlates();
    const lobby = plates.find((p) => p.hi === undefined && p.lo > 0);
    const ramp = plates.find((p) => p.hi !== undefined);
    if (!lobby || !ramp) throw new Error('expected a lobby plate and a ramp');
    for (const r of [4.75, 6.25, 9]) {
      for (let y = lobby.y + 1; y < lobby.y + lobby.h - 1; y += 7) {
        const h = riseForBody(lobby.x + 1, y, r, plates);
        expect(h, `r=${r} y=${y}`).toBeCloseTo(riseAt(lobby.x + 1, y, plates), 6);
      }
    }
  });
});
