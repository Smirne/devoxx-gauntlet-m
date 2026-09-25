/**
 * Biggy rolls when he is PUSHED, and only when he is pushed.
 *
 * Michele, after the chapter-2 playtest: *"ah Another thing to handle later.
 * Biggy should really roll, at least when he's pushed!"* The sheet's read of him
 * is a huge round gut with a tin lid on it, and a huge round gut that is shoved
 * goes over its own edge and comes back while the top of it lags behind the
 * bottom. `applyShove` in `src/render/robots/gait.ts` draws that.
 *
 * The whole risk in the feature is the second half of the sentence. "Rolling" is
 * one tip of the body about the floor between his boots, so a roll that fires
 * when it should not is Biggy lurching every time the player lets go of the
 * stick — and the first version DID that: it read "the stick is empty" plus a
 * smoothed positive acceleration, and a third of a second of driving followed by
 * a release measured **61% of a full shove roll**, fading over a second. That is
 * what `tapping the stick does not roll him` below pins down, and it is why the
 * renderer now asks the sim (`worldMoved`) instead of guessing from the stick.
 *
 * Every rig test here works the same way: run one sim, feed the identical stream
 * of speeds and headings to two rigs, one with `shoved` wired up and one with it
 * held at 0, and measure the DIFFERENCE. The lean, the stride and the idle
 * twitches are then common to both and cancel, so what is left is the roll and
 * nothing else.
 */

import { describe, expect, it } from 'vitest';

import {
  DT_MAX,
  DEFS,
  PX_PER_M,
  botsCollide,
  mkBot,
  pushBiggy,
  speed,
  stepBot,
  worldMoved,
  type Bot,
  type RobotKind,
} from '../src/sim';
import { createRobot, updateRobot, type RobotRig } from '../src/render/robots';

const DT = DT_MAX;
const noop = (): void => undefined;

/** The four bones `applyShove` touches, as one number per frame. */
const read = (rig: RobotRig): number[] => [
  rig.bones.pelvis.rotation.x,
  rig.bones.pelvis.position.y,
  rig.bones.head.rotation.x,
  rig.bones.shoulderL.rotation.x,
];

interface Trace {
  /** Peak |roll - control| on the pelvis, radians. */
  peak: number;
  /** Peak-to-peak of the pelvis difference: a roll goes BOTH ways, a lean does not. */
  swing: number;
  /** The pelvis difference, frame by frame. */
  tip: number[];
  /** Biggy's speed, m/s, frame by frame. */
  v: number[];
}

/**
 * Run `frames` of sim, driving the rigs from it, and report what the `shoved`
 * flag added. `hold(i)` sets the sticks for frame `i`.
 */
function trace(
  kind: RobotKind,
  frames: number,
  hold: (i: number, subject: Bot, pusher: Bot) => void,
  push = true,
): Trace {
  const subject = mkBot(kind, 300, 160);
  const pusher = mkBot('voxxy', 300 - subject.r - DEFS.voxxy.r, 160);
  const bots: Bot[] = [pusher, subject];
  const rig = createRobot(kind);
  const ctrl = createRobot(kind);
  const tip: number[] = [];
  const v: number[] = [];
  let peak = 0;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < frames; i++) {
    hold(i, subject, pusher);
    stepBot(pusher, DT, []);
    stepBot(subject, DT, []);
    botsCollide(pusher, subject);
    if (push) pushBiggy(bots, DT, i * DT, noop);
    const state = {
      speedMps: speed(subject) / PX_PER_M,
      heading: subject.face,
      dt: DT,
    };
    updateRobot(rig, { ...state, shoved: worldMoved(subject) ? 1 : 0 });
    updateRobot(ctrl, { ...state, shoved: 0 });
    const a = read(rig);
    const b = read(ctrl);
    const d = a[0] - b[0];
    tip.push(d);
    v.push(state.speedMps);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
    for (let k = 0; k < a.length; k++) peak = Math.max(peak, Math.abs(a[k] - b[k]));
  }
  return { peak, swing: hi - lo, tip, v };
}

/** Nobody touches Biggy; the pusher stands still out of the way. */
const alone = (stick: (i: number) => [number, number]) => (i: number, s: Bot, p: Bot): void => {
  const [x, y] = stick(i);
  s.ix = x;
  s.iy = y;
  p.ix = 0;
  p.iy = 0;
};

describe('worldMoved: the sim knows who is moving a robot', () => {
  it('is false while the player drives, and stays false through the coast', () => {
    const bg = mkBot('biggy', 300, 160);
    for (let i = 0; i < 60 * 3; i++) {
      bg.ix = 1;
      bg.iy = 0;
      stepBot(bg, DT, []);
      expect(worldMoved(bg)).toBe(false);
    }
    // Let go at speed: five seconds of coast, and he is still his own robot.
    for (let i = 0; i < 60 * 5; i++) {
      bg.ix = 0;
      bg.iy = 0;
      stepBot(bg, DT, []);
      expect(worldMoved(bg)).toBe(false);
    }
    expect(speed(bg)).toBeLessThan(DEFS.biggy.max * 0.15);
  });

  it('flips on the very frame the speed goes up, with no filter to lag it', () => {
    const bg = mkBot('biggy', 300, 160);
    // Drive for a second, let go, coast for another: still his own robot.
    for (let i = 0; i * DT < 2; i++) {
      bg.ix = i * DT < 1 ? 1 : 0;
      bg.iy = 0;
      stepBot(bg, DT, []);
      expect(worldMoved(bg)).toBe(false);
    }
    // One knock, mid-coast. Not a stick: something hit him.
    bg.vx += DEFS.biggy.max * 0.2;
    stepBot(bg, DT, []);
    expect(worldMoved(bg)).toBe(true);
  });

  it('is true for the whole free slide a shove leaves behind', () => {
    const bg = mkBot('biggy', 300, 160);
    const v = mkBot('voxxy', 300 - bg.r - DEFS.voxxy.r, 160);
    const bots: Bot[] = [v, bg];
    for (let i = 0; i * DT < 1.5; i++) {
      v.ix = 1;
      v.iy = 0;
      bg.ix = 0;
      bg.iy = 0;
      stepBot(v, DT, []);
      stepBot(bg, DT, []);
      botsCollide(v, bg);
      pushBiggy(bots, DT, i * DT, noop);
    }
    expect(worldMoved(bg)).toBe(true);
    expect(speed(bg)).toBeGreaterThan(DEFS.biggy.max * 0.4);
    // Voxxy stops pushing; he slides for seconds and is still not driving himself.
    for (let i = 0; i * DT < 4; i++) {
      v.ix = 0;
      v.iy = 0;
      bg.ix = 0;
      bg.iy = 0;
      stepBot(v, DT, []);
      stepBot(bg, DT, []);
      expect(worldMoved(bg)).toBe(true);
    }
    // Until the player takes him back, which he can do at any point.
    bg.ix = 1;
    bg.iy = 0;
    stepBot(bg, DT, []);
    expect(worldMoved(bg)).toBe(false);
  });
});

describe('Biggy rolling when he is pushed', () => {
  it('a real shove rolls him, both ways, and keeps rolling through the slide', () => {
    // Voxxy shoves for two seconds, then stops pushing and Biggy slides on.
    const t = trace('biggy', Math.round(14 / DT), (i, s, p) => {
      s.ix = 0;
      s.iy = 0;
      p.ix = i * DT < 2 ? 1 : 0;
      p.iy = 0;
    });
    // He actually gets moved: this is a shove, not a nudge.
    expect(Math.max(...t.v)).toBeGreaterThan(2);
    // The gut goes over its edge and comes back — a lean would only go one way.
    expect(t.swing).toBeGreaterThan(0.1);
    expect(t.peak).toBeGreaterThan(0.05);
    // Still rolling a second after the push ended, because that is what a ball does.
    const after = t.tip.slice(Math.round(2.5 / DT), Math.round(3.5 / DT));
    expect(Math.max(...after) - Math.min(...after)).toBeGreaterThan(0.05);
    // And it stops when HE stops, not on a timer: the amplitude is the speed.
    // He is still sliding at ~1 m/s six seconds in and still rolling for it.
    expect(t.v[t.v.length - 1]).toBeLessThan(0.1);
    const last = t.tip.slice(-30);
    expect(Math.max(...last.map(Math.abs))).toBeLessThan(0.02);
  });

  it('driving himself does not roll him at all', () => {
    const t = trace('biggy', Math.round(6 / DT), alone(() => [1, 0]), false);
    expect(Math.max(...t.v)).toBeGreaterThan(3);
    expect(t.peak).toBe(0);
  });

  /**
   * The regression this whole file exists for. The first version of the feature
   * read "empty stick + positive smoothed acceleration", and because the gait's
   * acceleration is a 1/6 s low-pass, both were true for a few frames after every
   * release: a 0.35 s tap measured a 0.61 roll. `worldMoved` has no filter to lag.
   */
  it('tapping the stick and letting go does not roll him', () => {
    for (const hold of [0.1, 0.2, 0.35, 0.5, 1]) {
      const t = trace('biggy', Math.round(4 / DT), alone((i) => (i * DT < hold ? [1, 0] : [0, 0])), false);
      expect(t.peak).toBe(0);
    }
  });

  it('a wall bounce while coasting does not count as a shove', () => {
    // A rebound reverses the velocity; it cannot increase the speed, so the flag
    // must not trip. (The heading rule in `stepAim` is the same reading.)
    const bg = mkBot('biggy', 300, 160);
    const wall = { x: 360, y: 100, w: 6, h: 120 };
    for (let i = 0; i < 60 * 4; i++) {
      bg.ix = i * DT < 1.5 ? 1 : 0;
      bg.iy = 0;
      stepBot(bg, DT, [wall]);
      expect(worldMoved(bg)).toBe(false);
    }
    expect(bg.x).toBeLessThan(wall.x);
  });
});

describe('only Biggy is a ball', () => {
  for (const kind of ['voxxy', 'droid'] as const) {
    it(`a shoved ${kind} stands there and takes it`, () => {
      const t = trace(kind, Math.round(3 / DT), (i, s, p) => {
        s.ix = 0;
        s.iy = 0;
        p.ix = 0;
        p.iy = 0;
        // `pushBiggy` only moves Biggy, so shove this one by hand: a knock that
        // leaves `worldMoved` true, which is what the rig would be told.
        if (i === 30) s.vx += DEFS[kind].max * 0.8;
      }, false);
      expect(Math.max(...t.v)).toBeGreaterThan(1);
      expect(t.peak).toBe(0);
    });
  }
});
