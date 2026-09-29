/**
 * The 3D build's frame governor — `src/render3d/governor.ts`.
 *
 * Players reported the 3D build "very slow, in some cases unusable" (29 Sep).
 * The stepper it replaced needed 45 slow frames per step, ignored any frame over
 * 200 ms, and could only climb back on a display faster than 60 Hz. These are
 * the behaviours that make it a governor rather than a hope, driven with
 * synthetic frame times on a virtual clock.
 */

import { describe, expect, it } from 'vitest';

import { CLIMB_WINDOWS, Governor, HOLD_MS, LADDER, WINDOW_MS } from '../src/render3d/governor';

/** Run `seconds` of frames of `ms` each (GPU time `gpu`), starting at `clock.t`. */
function run(g: Governor, clock: { t: number }, seconds: number, ms: number, gpu: number | null = null): void {
  const end = clock.t + seconds * 1000;
  while (clock.t < end) {
    clock.t += ms;
    g.frame(clock.t, ms, gpu);
  }
}

const bottom = LADDER.length - 1;

describe('the frame governor', () => {
  it('starts at the full tier', () => {
    const g = new Governor();
    expect(g.rung).toBe(0);
    expect(g.current).toEqual(LADDER[0]);
  });

  it('steps down within about a second at 10 fps, and reaches the bottom within ten', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    run(g, clock, 1.2, 100);
    expect(g.rung).toBeGreaterThanOrEqual(1);
    run(g, clock, 9, 100);
    expect(g.rung).toBe(bottom);
  });

  it('adapts a machine that runs at 4 fps (the old stepper called every such frame a hitch)', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    run(g, clock, 3, 250);
    expect(g.rung).toBeGreaterThanOrEqual(1);
  });

  it('adapts a machine that manages about one frame a second', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    run(g, clock, 8, 1500);
    expect(g.rung).toBeGreaterThanOrEqual(1);
  });

  it('does not step down for a tab switch at the start of a window', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    for (let k = 0; k < 6; k++) {
      run(g, clock, 0.5 + k * 0.13, 16.7);
      clock.t += 60000;
      g.frame(clock.t, 60000);
    }
    run(g, clock, 3, 16.7);
    expect(g.rung).toBe(0);
  });

  it('says it is struggling only once the bottom rung is still slow', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    run(g, clock, 5, 100);
    expect(g.struggling).toBe(false);
    run(g, clock, 12, 100);
    expect(g.rung).toBe(bottom);
    expect(g.struggling).toBe(true);
  });

  it('does not step down for one-off stalls (a shader compile, a tab switch)', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    for (let k = 0; k < 10; k++) {
      run(g, clock, 2, 16.7);
      clock.t += 900;
      g.frame(clock.t, 900);
      clock.t += 5000;
      g.frame(clock.t, 5000);
    }
    expect(g.rung).toBe(0);
  });

  it('holds its rung at 60 Hz with no GPU timer: the wall clock cannot show room', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    run(g, clock, 1.5, 40);
    // One window at the new pace, so none still holds the slow frames.
    run(g, clock, 1.2, 16.7);
    const r = g.rung;
    expect(r).toBeGreaterThanOrEqual(1);
    run(g, clock, 90, 16.7);
    expect(g.rung).toBe(r);
  });

  it('climbs back when a GPU timer shows room, after the hold', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    run(g, clock, 1.2, 40);
    const r = g.rung;
    expect(r).toBeGreaterThanOrEqual(1);
    // Room from now on, but not for the hold after the step down.
    run(g, clock, HOLD_MS / 1000 - 2, 16.7, 5);
    expect(g.rung).toBe(r);
    run(g, clock, 2 + ((CLIMB_WINDOWS + 3) * WINDOW_MS) / 1000, 16.7, 5);
    expect(g.rung).toBe(r - 1);
  });

  it('climbs on a fast display without a timer', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    run(g, clock, 1.2, 40);
    const r = g.rung;
    run(g, clock, HOLD_MS / 1000 + 5, 8.3);
    expect(g.rung).toBeLessThan(r);
  });

  it('waits longer before trying again after a climb that had to be undone', () => {
    const g = new Governor();
    const clock = { t: 0 };
    g.frame(0, 16);
    run(g, clock, 1.2, 40);
    const r = g.rung;
    run(g, clock, HOLD_MS / 1000 + 5, 16.7, 5);
    expect(g.rung).toBe(r - 1);
    // Too much: back down...
    run(g, clock, 1.2, 40);
    expect(g.rung).toBe(r);
    // ...and a single hold is no longer enough to climb again.
    run(g, clock, HOLD_MS / 1000 + 5, 16.7, 5);
    expect(g.rung).toBe(r);
    run(g, clock, HOLD_MS / 1000 + 5, 16.7, 5);
    expect(g.rung).toBe(r - 1);
  });

  it('never trims anything a rung above it kept', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const a = LADDER[i - 1];
      const b = LADDER[i];
      expect(b.ratio).toBeLessThanOrEqual(a.ratio);
      expect(b.vol).toBeLessThanOrEqual(a.vol);
      expect(b.refl).toBeLessThanOrEqual(a.refl);
      if (!a.ao) expect(b.ao).toBe(false);
      expect(b).not.toEqual(a);
    }
    expect(LADDER[0]).toEqual({ ratio: 1, ao: true, vol: 1, refl: 1 });
    expect(LADDER[bottom].ratio).toBeGreaterThanOrEqual(0.5);
  });
});
