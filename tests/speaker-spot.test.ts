/**
 * THE KEYNOTE SPEAKER MAY NOT HIDE WHERE A MINIGAME ALREADY OWNS `E`.
 *
 * Chapter 3's optional swag gets the key before the chapter's own beats do:
 * `mg.key(code, b)` is the second line of the chapter's handler. That ordering is
 * deliberate — Michele's rule for this chapter is that a refusal which names a
 * reason keeps the key, because those refusals are answers ("I am 38 cm of robot")
 * and hopping instead would be a worse game.
 *
 * The price of the rule is that a spine beat standing inside a minigame's reach is
 * unreachable, and one was. The speaker's hiding place and the Sticker Mine's
 * top-shelf swag are both derived as `inFrontOf(booth)`, so when the chapter's RNG
 * picked the Sticker Mine they were the **same point**: Voxxy pressing `E` at the
 * speaker got the sticker's refusal, which consumes the key, and the speaker could
 * not be collected until somebody walked Droid over to take a sticker they had no
 * reason to connect to it. Chapter 3 cannot be finished without the speaker.
 * Measured before the fix, over 200 seeds: **35 of them — one run in six.**
 *
 * Two tests, at two altitudes. The geometry one says the spots are apart; the
 * behaviour one says Voxxy can actually do her job, and is the one that would have
 * gone red on the old code. Both sweep seeds, because a one-in-six bug passes a
 * single-seed test five times out of six.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, GF, createGame, type DebugGame } from '../src/sim';

interface SpeakerState {
  speaker: { following: boolean; onStage: boolean; booth: string };
}

const ch3 = (g: DebugGame): SpeakerState => g.debug.chapter() as unknown as SpeakerState;

/** Where a beat that belongs to a sponsor stand puts itself: `inFrontOf`. */
const inFrontOf = (b: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({
  x: b.x + b.w / 2,
  y: b.y + b.h + 14,
});

const SEEDS = 60;

describe('the keynote speaker and the top-shelf sticker', () => {
  it('never hides within the sticker\'s reach, on any seed', () => {
    const st = GF.booths.find((b) => b.name === 'Sticker Mine');
    expect(st, 'the venue has no Sticker Mine').toBeDefined();
    const spot = inFrontOf(st!);
    const seen = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed++) {
      const g = createGame({ seed, cards: false });
      g.startChapter(3);
      const name = ch3(g).speaker.booth;
      seen.add(name);
      const booth = GF.booths.find((b) => b.name === name);
      expect(booth, `chapter 3 names a booth the venue does not have: ${name}`).toBeDefined();
      // The hint the NPCs give — "one of the built ones, with walls" — stays true.
      expect(booth!.table, `${name} is a table booth`).toBe(false);
      const at = inFrontOf(booth!);
      // 40 is the sticker's own reach, 24 the clearance a robot standing there needs.
      expect(Math.hypot(at.x - spot.x, at.y - spot.y), `speaker hid at the sticker (seed ${seed})`).toBeGreaterThan(40);
    }
    // Not vacuous by being pinned to one booth: the RNG still has a choice.
    expect(seen.size).toBeGreaterThan(2);
    expect(seen.has('Sticker Mine')).toBe(false);
  });

  it('can be collected with the sticker still on its shelf, on every seed', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const g = createGame({ seed, cards: false });
      g.startChapter(3);
      const booth = GF.booths.find((b) => b.name === ch3(g).speaker.booth);
      const at = inFrontOf(booth!);
      // Nobody has touched the sticker: this is a fresh run, which is the state the
      // old code could not survive.
      expect(g.snapshot().swag, `seed ${seed} started with swag`).toHaveLength(0);
      g.debug.select('voxxy');
      // 24 px short of the speaker, the way a player pulls up to them.
      g.debug.place('voxxy', at.x, at.y + 24);
      g.update(DT_MAX);
      g.key('KeyE');
      expect(ch3(g).speaker.following, `the speaker would not follow Voxxy (seed ${seed})`).toBe(true);
      // And she did not come away with a sticker instead.
      expect(g.snapshot().swag, `Voxxy collected swag instead of the speaker (seed ${seed})`).toHaveLength(0);
    }
  });
});
