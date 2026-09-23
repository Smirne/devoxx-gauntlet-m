/**
 * The chapter-1 keypad, and the note that took two rounds to land.
 *
 * Michele, playing chapter 1: *"I don't seem to be able to activate it. imanaged
 * with biggy."* I closed that note by reading the code, finding that digits route
 * to the pad when a robot is parked there, and declaring it fine. He hit it again
 * the next round.
 *
 * The existing choreography in `chapters.test.ts` covers the case I looked at —
 * a robot IN reach types, for all three — and it passes, which is why reading was
 * not enough. What it never covered is the case he was actually in: **a pixel out
 * of reach**. 1, 2 and 3 select a robot, and pressing the 2 of your code from just
 * outside `PAD_REACH` takes Droid instead of typing, so every digit after it lands
 * on a robot standing somewhere else and the pad reads as dead. Biggy has the
 * largest radius and so the largest reach — 49 px against Voxxy's 44.8 — which is
 * exactly why he was the one it worked with.
 *
 * His own prescription, given twice, was to keep 1-2-3 out of the code. That is
 * what these tests hold: the alphabet is 4 to 9, so no key the code needs can
 * switch a robot, from any distance.
 */

import { describe, expect, it } from 'vitest';

import {
  DT_MAX,
  createGame,
  type Bot,
  type DebugGame,
  type NightState,
  type RobotKind,
} from '../src/sim';

const mk = (seed: number): DebugGame => createGame({ seed, chapter: 1, cards: false });

const night = (g: DebugGame): NightState => g.debug.chapter() as NightState;

const bot = (g: DebugGame, kind: RobotKind): Bot => {
  const b = g.snapshot().bots.find((o) => o.kind === kind);
  if (!b) throw new Error(`no ${kind}`);
  return b;
};

/** The keypad's own centre, read off the prop rather than hard-coded. */
function padAt(g: DebugGame): { x: number; y: number } {
  const p = g.snapshot().props.find((o) => o.kind === 'keypad');
  if (!p) throw new Error('no keypad prop');
  return { x: p.x + 8, y: p.y + 12 };
}

describe('the chapter-1 keypad', () => {
  it('never puts a robot-switch key in the code, at any seed', () => {
    // 200 seeds is well past the point where a 0-3 would show up by chance: with
    // the old generator each digit had a 40% chance of being one, so a single run
    // of four would have failed this about 87% of the time.
    for (let seed = 0; seed < 200; seed++) {
      const code = night(mk(seed)).code;
      expect(code).toHaveLength(4);
      expect(code, `seed ${seed}`).toMatch(/^[4-9]{4}$/);
    }
  });

  /*
   * HIS BUG, REPRODUCED.
   *
   * Park each robot just outside its own reach and press every digit of the code.
   * The old alphabet let a 1, 2 or 3 in there change the driven robot; this asserts
   * it cannot, for all three, and that the player is told why nothing happened
   * rather than being left with a dead key.
   */
  it('cannot switch the driven robot out from under the player at the pad edge', () => {
    for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
      // Seed 0 on purpose: under the old 0-9 generator its code was `2021`, so
      // the very first key of it took Droid. Any seed exercises the rule now, but
      // this one is the run that would have failed before the fix.
      const g = mk(0);
      const code = night(g).code;
      const pad = padAt(g);
      g.debug.select(kind);
      const r = bot(g, kind).r;
      // Two pixels beyond the reach: close enough that a player believes they are
      // at the keypad, far enough that the sim does not.
      g.debug.place(kind, pad.x, pad.y + 40 + r + 2);
      g.update(DT_MAX);

      for (const d of code) g.key(`Digit${d}`);
      expect(g.snapshot().bots[g.snapshot().active].kind, `${kind} lost the stick`).toBe(kind);
      expect(night(g).entered).toBe('');
      expect(night(g).fireOpen).toBe(false);
      expect(g.snapshot().toast?.t ?? '').toContain('keypad');
    }
  });

  it('still opens for every robot once it is actually in reach', () => {
    for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
      const g = mk(23);
      const code = night(g).code;
      const pad = padAt(g);
      g.debug.select(kind);
      g.debug.place(kind, pad.x, pad.y + 20);
      g.update(DT_MAX);
      for (const d of code) g.key(`Digit${d}`);
      expect(night(g).fireOpen, `${kind} could not open the door`).toBe(true);
    }
  });

  it('takes a digit back on Backspace instead of making the player fill it up and be wrong', () => {
    const g = mk(5);
    const code = night(g).code;
    const pad = padAt(g);
    g.debug.select('voxxy');
    g.debug.place('voxxy', pad.x, pad.y + 20);
    g.update(DT_MAX);

    // Fat-finger the first digit, take it back, then type the code properly.
    g.key(`Digit${code[0] === '4' ? '5' : '4'}`);
    expect(night(g).entered).toHaveLength(1);
    g.key('Backspace');
    expect(night(g).entered).toBe('');
    for (const d of code) g.key(`Digit${d}`);
    expect(night(g).fireOpen).toBe(true);
  });

  it('turns a switch key at the pad away instead of swallowing it as a digit', () => {
    const g = mk(5);
    const pad = padAt(g);
    g.debug.select('voxxy');
    g.debug.place('voxxy', pad.x, pad.y + 20);
    g.update(DT_MAX);

    g.key('Digit2');
    expect(night(g).entered).toBe('');
    expect(g.snapshot().toast?.t ?? '').toContain('4 to 9');
    // And it did not take Droid either — at the pad, the pad has the keyboard.
    expect(g.snapshot().bots[g.snapshot().active].kind).toBe('voxxy');
  });

  it('says what it rejected, in the robot that typed it', () => {
    const lines = new Set<string>();
    for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
      const g = mk(31);
      const code = night(g).code;
      const pad = padAt(g);
      g.debug.select(kind);
      g.debug.place(kind, pad.x, pad.y + 20);
      g.update(DT_MAX);

      // Four digits that are not the code: rotate the real one, which keeps every
      // key inside the pad's own alphabet.
      const wrong = [code[1], code[2], code[3], code[0]].join('');
      expect(wrong).not.toBe(code);
      for (const d of wrong) g.key(`Digit${d}`);

      expect(night(g).fireOpen).toBe(false);
      // Cleared, so the next attempt starts from nothing.
      expect(night(g).entered).toBe('');
      const said = g.snapshot().toast?.t ?? '';
      // It names what it tried — a bare "Wrong code" leaves the player unsure the
      // pad took the digits at all.
      expect(said).toContain(wrong);
      lines.add(said.replace(wrong, '').replace(bot(g, kind).name, ''));
    }
    // Three robots, three sentences — not one script with the name swapped.
    expect(lines.size).toBe(3);
  });
});
