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

import * as THREE from 'three';
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

/* ============================== the pose, and who is allowed to be in it */

/**
 * WHAT THE ROLL LOOKS LIKE, and the line Michele drew round it.
 *
 * The gate went the whole way across and came back in two days. Four rounds of
 * *"I can't get biggy to roll"* ended with *"I tried running but it keeps
 * walking"*, so for one build SPEED was the gate, whoever set him going. He drove
 * that build and answered both halves in one line: *"the roll is great! Biggy
 * should retreat his feet while rolling. And maybe it's better to reserve it for
 * when he's pushed to high speed."*
 *
 * So: a robot on his own stick walks at any speed, a shove past 1.5 m/s rolls him,
 * and while he is rolling the legs are not folded up inside the ball — they are
 * SCALED away to a fifth of themselves (`LEG_TUCK`), because folded legs still put
 * two boots outside a 1.2 m sphere, which is exactly what he was looking at.
 *
 * These read the RIG rather than a flag: the pose is the feature, so the pose is
 * what is asserted.
 */
describe('the ball has no feet, and nobody rolls it but a shove', () => {
  /**
   * Run one Biggy for `seconds` — driving himself, or shoved by Voxxy — and report
   * the rig at the end of it.
   */
  function run(
    seconds: number,
    opts: { drive?: boolean; carrying?: boolean } = {},
  ): { v: number; thigh: number; legScale: number; pelvisSwing: number } {
    const drive = opts.drive ?? true;
    const bg = mkBot('biggy', 300, 160);
    const pusher = mkBot('voxxy', 300 - bg.r - DEFS.voxxy.r, 160);
    const bots: Bot[] = [pusher, bg];
    const rig = createRobot('biggy');
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i * DT < seconds; i++) {
      bg.ix = drive ? 1 : 0;
      bg.iy = 0;
      pusher.ix = drive ? 0 : 1;
      pusher.iy = 0;
      stepBot(pusher, DT, []);
      stepBot(bg, DT, []);
      if (!drive) {
        botsCollide(pusher, bg);
        pushBiggy(bots, DT, i * DT, noop);
      }
      updateRobot(rig, {
        speedMps: speed(bg) / PX_PER_M,
        heading: bg.face,
        dt: DT,
        shoved: worldMoved(bg) ? 1 : 0,
        carrying: opts.carrying ?? false,
      });
      if (i * DT > seconds - 1) {
        lo = Math.min(lo, rig.bones.pelvis.rotation.x);
        hi = Math.max(hi, rig.bones.pelvis.rotation.x);
      }
    }
    return {
      v: speed(bg) / PX_PER_M,
      thigh: rig.bones.thighL.rotation.x,
      legScale: rig.bones.thighL.scale.y,
      pelvisSwing: hi - lo,
    };
  }

  it('walks when he is driving himself, however fast he is going', () => {
    // Four seconds of held stick is 4.3 m/s — faster than any shove in the game,
    // and still a walk, because the roll is not his to start. Michele's call.
    const t = run(4);
    expect(t.v).toBeGreaterThan(3.4);
    expect(t.thigh).toBeGreaterThan(-1.3);
    expect(t.legScale).toBeCloseTo(1, 3);
    expect(t.pelvisSwing).toBeLessThan(0.5);
  });

  it('balls up when somebody else has him moving, and pulls the legs in with it', () => {
    const t = run(4, { drive: false });
    expect(t.v, 'Voxxy never got him up to a rolling speed').toBeGreaterThan(1.5);
    // Legs folded into the gut (the tuck is -1.45 rad at the thigh)...
    expect(t.thigh).toBeLessThan(-1.3);
    // ...and then taken away altogether, which is the half he asked for: a leg at
    // a fifth of its length is entirely inside the ball.
    expect(t.legScale).toBeLessThan(0.3);
    // ...and the body turning through whole revolutions rather than stepping.
    expect(t.pelvisSwing).toBeGreaterThan(2);
  });

  /*
   * ...about his OWN centre, with the lid on top of him.
   *
   * Michele, 30 Sep 2026: *"when rolling now biggy's elmet seems detached"*. The
   * ball turned about a point some 15 cm off its centre, taken off the hip's
   * height over the ankle rather than over the floor, and tipped further by the
   * walk's lean: it hopped 30 cm off the floor every revolution. And the lid was turned
   * back about its own base, which rides round with the ball, so it stood out of
   * his side and sank into his underside. The gut's centre is `GUT_CY_PER_H` of
   * his height up standing, and a ball rolling on the floor keeps it one radius up.
   */
  it('rolls about his own centre, one radius off the floor, with the lid kept on top', () => {
    const rig = createRobot('biggy');
    const gutR = rig.height * 0.415;
    rig.root.updateMatrixWorld(true);
    const inTorso = rig.bones.torso.worldToLocal(new THREE.Vector3(0, rig.height * 0.507, 0));
    const gut = new THREE.Vector3();
    const head = new THREE.Vector3();
    let lo = Infinity;
    let hi = -Infinity;
    let lidLow = Infinity;
    for (let i = 0; i * DT < 4; i++) {
      updateRobot(rig, { speedMps: 5.7, heading: 0, dt: DT, shoved: 1 });
      if (i * DT < 2) continue;
      rig.root.updateMatrixWorld(true);
      gut.copy(inTorso).applyMatrix4(rig.bones.torso.matrixWorld);
      rig.bones.head.getWorldPosition(head);
      lo = Math.min(lo, gut.y);
      hi = Math.max(hi, gut.y);
      lidLow = Math.min(lidLow, head.y - gut.y);
    }
    expect(rig.bones.thighL.scale.y, 'he never tucked up').toBeLessThan(0.3);
    expect(hi - lo, 'the ball hops as it rolls').toBeLessThan(0.01);
    expect(Math.abs(lo - gutR), 'the ball is not rolling on the floor').toBeLessThan(0.01);
    // Upright, the head's joint is 0.41 m over the centre; the lid rides ~17 degrees.
    expect(lidLow, 'the lid came off the top of him').toBeGreaterThan(0.36);
  });

  it('gives the legs back the moment the roll lets go', () => {
    const bg = mkBot('biggy', 300, 160);
    const rig = createRobot('biggy');
    // Rolling, hard.
    for (let i = 0; i * DT < 2; i++) {
      updateRobot(rig, { speedMps: 4, heading: 0, dt: DT, shoved: 1 });
    }
    expect(rig.bones.thighL.scale.y).toBeLessThan(0.3);
    // ...and then standing still, on his own two feet, with nothing shrunk.
    for (let i = 0; i * DT < 3; i++) {
      bg.ix = 0;
      bg.iy = 0;
      updateRobot(rig, { speedMps: 0, heading: 0, dt: DT, shoved: 0 });
    }
    expect(rig.bones.thighL.scale.y).toBeCloseTo(1, 2);
  });

  /**
   * Michele, 29 Sep 2026: *"Biggy's roll: should not start straight away, make a
   * couple of steps then roll."* It used to tuck on the frame a shove passed
   * 1.5 m/s. Counted off the rig: each step swaps which thigh is forward, and
   * there have to be two of those on his own feet before the legs start to go.
   */
  it('takes a couple of steps on his own feet before he tucks, however hard the shove', () => {
    for (const v of [3, 5]) {
      const rig = createRobot('biggy');
      for (let i = 0; i < 30; i++) updateRobot(rig, { speedMps: 0, heading: 0, dt: DT, shoved: 0 });
      let side = 0;
      let steps = 0;
      let tucking = false;
      for (let i = 0; i * DT < 1.5; i++) {
        updateRobot(rig, { speedMps: v, heading: 0, dt: DT, shoved: 1 });
        const s = Math.sign(rig.bones.thighL.rotation.x - rig.bones.thighR.rotation.x);
        tucking ||= rig.bones.thighL.scale.y < 0.9;
        if (!tucking && s !== 0 && side !== 0 && s !== side) steps++;
        if (s !== 0) side = s;
      }
      expect(steps, `shoved at ${v} m/s, he tucked after ${steps} steps`).toBeGreaterThanOrEqual(2);
      // ...and then he does roll: this is a delay, not a refusal.
      expect(rig.bones.thighL.scale.y, `shoved at ${v} m/s, he never tucked`).toBeLessThan(0.3);
    }
  });

  /**
   * *"...when the door is smashed, Biggy should keep rolling for a couple of
   * metres, then stand."* The roller door keeps 40% of his speed and his own
   * brake takes him from there (`handOver` in `src/sim/game.ts`): 2.2 m/s at
   * 1.2 s⁻¹. He used to start untucking on the way through 1.5 m/s, which was
   * the doorway itself; now the ball rolls on while he is still really moving
   * and the legs come back as he comes to rest.
   */
  it('rolls on through a doorway that takes his speed, and stands up as he stops', () => {
    const rig = createRobot('biggy');
    for (let i = 0; i * DT < 2; i++) updateRobot(rig, { speedMps: 5.4, heading: 0, dt: DT, shoved: 1 });
    expect(rig.bones.thighL.scale.y).toBeLessThan(0.3);
    let v = 2.2;
    let rolled = 0;
    for (let i = 0; i * DT < 4; i++) {
      updateRobot(rig, { speedMps: v, heading: 0, dt: DT, shoved: 1 });
      if (v > 0.9) {
        expect(rig.bones.thighL.scale.y, `legs out at ${v.toFixed(2)} m/s, still rolling`).toBeLessThan(0.3);
        rolled += v * DT;
      }
      v *= Math.exp(-1.2 * DT);
      if (v < 0.05) v = 0;
    }
    // About a metre of it as a ball...
    expect(rolled).toBeGreaterThan(1);
    // ...and standing on his own two feet once he is at rest.
    expect(rig.bones.thighL.scale.y).toBeCloseTo(1, 2);
    expect(rig.bones.thighL.rotation.x).toBeGreaterThan(-1.3);
  });

  it('never rolls with the soup pot in his hands, shove or no shove', () => {
    const t = run(4, { drive: false, carrying: true });
    expect(t.v).toBeGreaterThan(1.5);
    expect(t.thigh).toBeGreaterThan(-1.3);
    expect(t.legScale).toBeCloseTo(1, 3);
    expect(t.pelvisSwing).toBeLessThan(0.5);
  });
});
