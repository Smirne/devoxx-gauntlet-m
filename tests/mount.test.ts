/**
 * Climbing onto Biggy — the gate, and what it says when it refuses.
 *
 * Michele's chapter-1 notes: *"I had some trouble climbing on biggy (Droid must be
 * next to a standing biggy - the exact situation i was in)."*
 *
 * Measured before the fix, on the frozen constants:
 *
 * | question | measurement |
 * |---|---|
 * | is `MOUNT_REACH` honest? | yes — a 32 cm shell of daylight, all 16 angles |
 * | can Droid reach it? | yes, from the moment the two bodies touch |
 * | how long is a nudged Biggy unclimbable? | 2.61 s after Droid's own arrival |
 * | ...after being driven at top speed? | 7.03 s (drag 0.35 s^-1, the lowest here) |
 *
 * The refusal was therefore correct and the message was not: it named "standing",
 * Biggy looked standing, and what had set him rolling was Droid walking up to him.
 * Nothing frozen moved — `tests/frozen-constants.test.ts` still pins `MOUNT_REACH`
 * at 4 px and `MOUNT_BIGGY_MAX_SPEED` at 20 * BIGGY_SPEED_SCALE, and a moving Biggy
 * is still not climbable.
 */
import { describe, expect, it } from 'vitest';
import { botsCollide, dist, mkBot, speed, stepBot, toggleMount } from '../src/sim/bot';
import { DEFS, DT_MAX, MOUNT_BIGGY_MAX_SPEED, MOUNT_REACH } from '../src/sim/constants';
import type { Bot } from '../src/sim/types';

/** Droid and Biggy, `gap` px of daylight apart along `angle`, Biggy drifting at `v`. */
function pair(gap: number, angle = Math.PI, v = 0): [Bot, Bot, string[]] {
  const bg = mkBot('biggy', 500, 350);
  bg.vx = v;
  const reach = DEFS.droid.r + DEFS.biggy.r + gap;
  const d = mkBot('droid', 500 + Math.cos(angle) * reach, 350 + Math.sin(angle) * reach);
  return [d, bg, []];
}

const press = (d: Bot, bg: Bot, log: string[]): boolean => toggleMount([d, bg], (s) => log.push(s));

describe('mount — the reach', () => {
  it('accepts anywhere inside MOUNT_REACH of contact, at every angle', () => {
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      for (const gap of [0, 1, 2, 3, MOUNT_REACH - 0.25]) {
        const [d, bg, log] = pair(gap, angle);
        expect(`a${a} g${gap} ${press(d, bg, log)}`).toBe(`a${a} g${gap} true`);
        expect(d.mounted).toBe(true);
      }
    }
  });

  it('refuses outside it, at every angle, and says how far away he is', () => {
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      for (const gap of [MOUNT_REACH, MOUNT_REACH + 2, 12]) {
        const [d, bg, log] = pair(gap, angle);
        expect(press(d, bg, log)).toBe(false);
        expect(d.mounted).toBe(false);
        expect(log[0]).toMatch(/^Droid: .* m of daylight\. .*come round beside him$/);
      }
    }
  });

  it('measures "next to" as something a player would call next to', () => {
    // 32 cm of daylight around a 1.44 m body. If this shrinks to a contact test
    // the complaint comes straight back, so it is asserted rather than assumed.
    expect(MOUNT_REACH).toBeGreaterThan(3);
    const [d, bg] = pair(0);
    expect(dist(d, bg)).toBeCloseTo(DEFS.droid.r + DEFS.biggy.r, 6);
  });
});

describe('mount — the standing Biggy', () => {
  it('still refuses a Biggy who is moving', () => {
    const [d, bg, log] = pair(0, Math.PI, MOUNT_BIGGY_MAX_SPEED);
    expect(press(d, bg, log)).toBe(false);
    expect(d.mounted).toBe(false);
  });

  it('says he is rolling, not that Droid is in the wrong place', () => {
    const [d, bg, log] = pair(0, Math.PI, 15);
    press(d, bg, log);
    expect(log[0]).toMatch(/rolling/);
    expect(log[0]).not.toMatch(/daylight/);
  });

  it('plants Droid’s feet and stops him, so the next press lands', () => {
    const [d, bg, log] = pair(0, Math.PI, 15);
    expect(press(d, bg, log)).toBe(false);
    expect(speed(bg)).toBe(0);
    expect(bg.boostCap).toBe(0);
    expect(press(d, bg, log)).toBe(true);
    expect(d.mounted).toBe(true);
  });

  it('will not catch a Biggy going faster than Droid can run', () => {
    const fast = DEFS.droid.max + 1;
    const [d, bg, log] = pair(0, Math.PI, fast);
    expect(press(d, bg, log)).toBe(false);
    expect(speed(bg)).toBeCloseTo(fast, 6);
    expect(log[0]).toMatch(/let him run down/);
  });

  it('does not reach past MOUNT_REACH to steady him', () => {
    const [d, bg, log] = pair(8, Math.PI, 15);
    expect(press(d, bg, log)).toBe(false);
    expect(speed(bg)).toBeCloseTo(15, 6);
    expect(log[0]).toMatch(/daylight/);
  });
});

describe('mount — Michele’s actual situation', () => {
  it('lets Droid walk up to a parked Biggy and climb him', () => {
    const d = mkBot('droid', 440, 350);
    const bg = mkBot('biggy', 500, 350);
    const log: string[] = [];
    let contact = -1;
    let climbed = -1;
    let t = 0;
    let knocked = 0;
    for (let i = 0; i < 900 && climbed < 0; i++) {
      const touching = dist(d, bg) < d.r + bg.r + 1.5;
      if (touching && contact < 0) contact = t;
      // Walk up, and let go the moment they touch — which is what a player does.
      d.ix = touching ? 0 : 1;
      d.iy = 0;
      stepBot(d, DT_MAX, []);
      stepBot(bg, DT_MAX, []);
      botsCollide(d, bg);
      if (contact >= 0) {
        knocked = Math.max(knocked, speed(bg));
        if (press(d, bg, log)) climbed = t;
      }
      t += DT_MAX;
    }
    // His own arrival is what set Biggy rolling: that is the whole trap.
    expect(knocked).toBeGreaterThan(MOUNT_BIGGY_MAX_SPEED);
    expect(climbed).toBeGreaterThanOrEqual(0);
    // It used to be 2.61 s of "Droid must be next to a standing Biggy".
    expect(climbed - contact).toBeLessThan(0.2);
  });

  it('climbs down where it always did', () => {
    const [d, bg, log] = pair(0);
    expect(press(d, bg, log)).toBe(true);
    expect(press(d, bg, log)).toBe(false);
    expect(d.mounted).toBe(false);
    expect(log[log.length - 1]).toBe('Droid climbs down');
  });
});
