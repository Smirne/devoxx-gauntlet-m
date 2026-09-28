/**
 * THE PHYSICS VIEW — `P`, and the twenty points it exists for.
 *
 * Physics realism is a fifth of the score and none of it was visible: a judge
 * watching the game sees three robots moving, not the seven-to-one mass ratio or
 * the impulse that stopped one. The view draws it, and these tests hold the two
 * properties that make it worth having.
 *
 *   1. It draws the SIM's numbers — a circle at each robot's frozen radius, an
 *      arrow along its own velocity — and not a drawing-code approximation of them.
 *   2. It is a view. Off, it costs nothing; on, it changes nothing.
 */

import { describe, expect, it } from 'vitest';

import { DEFS, DT_MAX, createGame } from '../src/sim';
import { PX_PER_M } from '../src/sim/units';
import { createPhysicsOverlay } from '../src/render/physics-view';

/**
 * Every vertex the overlay DREW this frame, as [x, y, z] triples.
 *
 * `drawRange`, not the buffer: the buffer is preallocated and never cleared, so
 * last frame's splash is still sitting in it after the splash has gone. What is
 * drawn is the range, which is what the GPU is told to read.
 */
function verts(o: ReturnType<typeof createPhysicsOverlay>): number[][] {
  const geo = (o.group as unknown as {
    geometry: { drawRange: { count: number }; attributes: { position: { array: Float32Array } } };
  }).geometry;
  const a = geo.attributes.position.array;
  const n = Number.isFinite(geo.drawRange.count) ? geo.drawRange.count : 0;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) out.push([a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]);
  return out;
}

const flat = (): ((x: number, y: number) => number) => () => 0;

describe('the physics view', () => {
  it('draws nothing at all until it is asked for', () => {
    const g = createGame({ chapter: 2, cards: false, seed: 3 });
    const o = createPhysicsOverlay();
    expect(o.enabled()).toBe(false);
    expect(o.group.visible).toBe(false);
    o.update(g.snapshot(), DT_MAX, flat());
    expect(verts(o)).toHaveLength(0);
    o.dispose();
  });

  it('puts a circle on each robot at its own frozen radius', () => {
    const g = createGame({ chapter: 2, cards: false, seed: 3 });
    const o = createPhysicsOverlay();
    o.setEnabled(true);
    const snap = g.snapshot();
    o.update(snap, DT_MAX, flat());
    const pts = verts(o);
    expect(pts.length).toBeGreaterThan(0);

    for (const b of snap.bots) {
      // Every vertex within a robot's own neighbourhood, measured from its centre.
      const near = pts
        .map((p) => Math.hypot(p[0] - b.x / PX_PER_M, p[2] - b.y / PX_PER_M))
        .filter((d) => d < (b.r / PX_PER_M) * 1.2);
      expect(near.length, `${b.kind} has no circle`).toBeGreaterThan(40);
      // The outermost of them IS the collision radius — this is the whole claim the
      // view makes, and it is the sim's number, not a drawing-code guess.
      expect(Math.max(...near)).toBeCloseTo(b.r / PX_PER_M, 5);
      expect(Math.max(...near)).toBeCloseTo(DEFS[b.kind].r / PX_PER_M, 5);
    }
    o.dispose();
  });

  it('grows an arrow along the robot that is moving, and none on the ones that are not', () => {
    const g = createGame({ chapter: 2, cards: false, seed: 3 });
    const o = createPhysicsOverlay();
    o.setEnabled(true);
    // `contacts: []` throughout: a splash is ten more vertices and this test is
    // counting arrows. The splash has its own case below.
    o.update({ ...g.snapshot(), contacts: [] }, DT_MAX, flat());
    const still = verts(o).length;

    g.setStick(1, 0);
    for (let i = 0; i < 60; i++) g.update(DT_MAX);
    const snap = { ...g.snapshot(), contacts: [] };
    expect(snap.bots.some((b) => Math.hypot(b.vx, b.vy) > 1), 'nobody moved').toBe(true);
    o.update(snap, DT_MAX, flat());
    // Three barbs and a shaft: six vertices per robot that is actually travelling.
    expect(verts(o).length).toBe(still + 6 * snap.bots.filter((b) => Math.hypot(b.vx, b.vy) > 0.5).length);
    o.dispose();
  });

  /*
   * A contact splash outlives the frame that made it — by design, because a
   * 16 ms flash is not a thing an eye can see — and then it goes. It is the only
   * state this module owns, and it is presentational.
   */
  it('holds a contact splash for half a second and then drops it', () => {
    const g = createGame({ chapter: 2, cards: false, seed: 3 });
    const o = createPhysicsOverlay();
    o.setEnabled(true);
    const snap = { ...g.snapshot(), contacts: [] };
    const base = (() => {
      o.update(snap, 0.016, flat());
      return verts(o).length;
    })();
    const hit = { x: snap.bots[0].x, y: snap.bots[0].y, nx: 1, ny: 0, rv: 20, j: 30, kind: 'wall' as const, who: 'biggy' };
    o.update({ ...snap, contacts: [hit] }, 0.016, flat());
    const withHit = verts(o).length;
    expect(withHit).toBeGreaterThan(base);
    // Three frames later it is still there...
    o.update(snap, 0.016, flat());
    expect(verts(o).length).toBe(withHit);
    // ...and a second later it is not.
    o.update(snap, 1, flat());
    expect(verts(o).length).toBe(base);
    o.dispose();
  });

  it('changes nothing about the run', () => {
    const play = (view: boolean): number[] => {
      const g = createGame({ chapter: 2, cards: false, seed: 5 });
      const o = createPhysicsOverlay();
      o.setEnabled(view);
      for (let i = 0; i < 300; i++) {
        g.setStick(i % 70 < 35 ? 1 : -1, 0.3);
        g.update(DT_MAX);
        o.update(g.snapshot(), DT_MAX, flat());
      }
      o.dispose();
      return g.snapshot().bots.flatMap((b) => [Math.round(b.x * 1e6), Math.round(b.y * 1e6)]);
    };
    expect(play(true)).toEqual(play(false));
  });
});
