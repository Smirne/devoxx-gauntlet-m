/**
 * You cannot stand inside a person.
 *
 * Michele, 25 Sep 2026, with a screenshot of Voxxy inside one of them: *"voxy
 * passes though a person?"* She was. The queues pushed a robot out and the
 * roaming crowd pushed a robot out, but the three staff you ask for directions,
 * Stephan and the keynote speaker were drawn and nothing else — so the three
 * figures the chapter is ABOUT were the ones you could walk through.
 *
 * The repo's oldest recurring complaint is walking through something drawn solid
 * (the room-door hoardings, the booths, the crates), and this is the same fault
 * wearing a jumper. `standOff` in `src/sim/bot.ts` is the fix; this is the test
 * that it stays fixed, driven rather than asserted on the geometry, because what
 * matters is where a robot ENDS after leaning on somebody for a second.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame, type Person, type RobotKind } from '../src/sim';
import { bot } from './pilot';

const KINDS: readonly RobotKind[] = ['voxxy', 'droid', 'biggy'];

/** The people who are standing still, which is everyone with a name. */
const standing = (g: DebugGame): Person[] => g.snapshot().people.filter((p) => p.name !== undefined);

/**
 * Drive `kind` straight at `p` for a second and report the closest the CENTRES
 * ever got, as a fraction of the distance they may legally be.
 *
 * One frame of overlap is what a contact IS — the resolve happens after the
 * move — so the check is on where the robot is left at the end of each frame,
 * with a pixel of slack for the frame it arrives on.
 */
function leanOn(g: DebugGame, kind: RobotKind, p: Person): number {
  const b = bot(g, kind);
  const min = b.r + p.r;
  // Start a couple of robot-widths out, aimed at them.
  const d0 = min + 26;
  const th = Math.atan2(b.y - p.y, b.x - p.x);
  g.debug.place(kind, p.x + Math.cos(th) * d0, p.y + Math.sin(th) * d0);
  g.debug.select(kind);
  let closest = Infinity;
  for (let i = 0; i < 90; i++) {
    const cur = bot(g, kind);
    g.setStick(Math.sign(p.x - cur.x), Math.sign(p.y - cur.y));
    g.update(DT_MAX);
    const now = bot(g, kind);
    closest = Math.min(closest, Math.hypot(now.x - p.x, now.y - p.y));
  }
  g.setStick(0, 0);
  return closest / min;
}

describe('the people who stand there are solid', () => {
  for (const chapter of [3, 4]) {
    it(`chapter ${chapter}: no robot can walk into one of them`, () => {
      const g = createGame({ seed: 20260930, chapter, cards: false }) as DebugGame;
      // Let the chapter settle: crowds spawn, queues form, nobody has moved yet.
      for (let i = 0; i < 30; i++) g.update(DT_MAX);
      const who = standing(g);
      expect(who.length, `chapter ${chapter} has nobody standing in it`).toBeGreaterThan(0);
      for (const p of who) {
        for (const kind of KINDS) {
          const frac = leanOn(g, kind, p);
          expect(
            frac,
            `${kind} drove into "${p.name ?? 'someone'}" in chapter ${chapter} and ended ${(frac * 100).toFixed(0)}% of a contact away`,
          ).toBeGreaterThan(0.94);
        }
      }
    });
  }
});
