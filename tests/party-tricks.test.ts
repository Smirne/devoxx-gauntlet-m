/**
 * The three party tricks: Voxxy's hop, Biggy's roll, Droid's stretch.
 *
 * This file was `jump.test.ts` while `E` had one generic verb on it. Michele asked
 * for the other two on 25 Sep 2026 — *"Could we add a basic action to each robot
 * on E? Voxxy jumps, Biggy rolls, Droid? Stretches? Not needed for gameplay."* —
 * and the choreographies that were about the hop are now about a family, so the
 * file is named after the family.
 *
 * Michele asked for the hop twice before that — *"just for one quiz. And for
 * jumping around for fun"*, then *"Voxxy jump: let's make it. I'd keep E, when no
 * other action is available."* Both halves are load-bearing and both are still
 * tested here: what the hop physically is, and what happens to the `E` that fires
 * it. Her arc is derived rather than tuned (`JUMP_RISE_M` is the only free
 * number), so the first tests measure it against closed-form projectile motion and
 * would fail if anybody replaced them with an eased animation curve.
 *
 * The other two are held to the opposite standard, because *"not needed for
 * gameplay"* is a specification: their tests prove that the flourish is a clock
 * and a pose and **nothing else** — zero pixels of travel, zero velocity, one
 * shared cooldown, and a spoken reason every single time one is refused.
 *
 * Underneath all three is the rule that keeps one key doing several jobs: the
 * chapter is asked first, and only a flat `false` from it lets a party trick
 * through.
 */

import { describe, expect, it } from 'vitest';

import {
  BIGGY_ROLL_DUR,
  DROID_STRETCH_DUR,
  DT_MAX,
  FLAIR_REST_FACTOR,
  GRAVITY,
  JUMP_AIR,
  JUMP_RISE_M,
  MOUNT_REACH,
  PX_PER_M,
  airborne,
  createGame,
  flairPhase,
  flourishing,
  hopPhase,
  mkBot,
  partyTrick,
  stepBot,
  toggleMount,
  type Bot,
  type DebugGame,
  type RobotKind,
  type Wall,
} from '../src/sim';
import { createRobot, footContact, updateRobot, type RobotRig } from '../src/render/robots';

const noop = (): void => {};

/**
 * `E` reaching one robot on its own. The cast is only there for the one gate a
 * robot cannot check about itself — Biggy will not roll with Droid aboard — so
 * every test that does not care passes the robot as its own company.
 */
const trick = (b: Bot, flash: (s: string) => void = noop): boolean => partyTrick([b], b, flash);

const bot = (g: DebugGame, kind: RobotKind): Bot => {
  const b = g.snapshot().bots.find((o) => o.kind === kind);
  if (!b) throw new Error(`no ${kind}`);
  return b;
};

/** A run east at the stick, one `DT_MAX` step at a time. */
function runEast(b: Bot, walls: Wall[], n: number, onStep?: (i: number) => void): void {
  b.ix = 1;
  b.iy = 0;
  for (let i = 0; i < n; i++) {
    stepBot(b, DT_MAX, walls);
    if (onStep) onStep(i);
  }
}

describe("Voxxy's hop — the ballistics", () => {
  it('is in the air for exactly as long as a 0.3 m hop takes, and no longer', () => {
    // 2*sqrt(2H/g) is not a number anybody chose: it falls out of the rise.
    expect(JUMP_AIR).toBeCloseTo(2 * Math.sqrt((2 * JUMP_RISE_M) / GRAVITY), 12);

    const v = mkBot('voxxy', 0, 0);
    expect(trick(v, noop)).toBe(true);
    let air = 0;
    for (let i = 0; i < 200; i++) {
      if (!airborne(v)) break;
      air += DT_MAX;
      stepBot(v, DT_MAX, []);
    }
    // Within one frame of the closed-form airtime, from the discrete stepping.
    expect(air).toBeGreaterThan(JUMP_AIR - DT_MAX);
    expect(air).toBeLessThanOrEqual(JUMP_AIR + DT_MAX);
    expect(airborne(v)).toBe(false);
  });

  it('draws the parabola of a body under gravity, apex at the rise and both feet down', () => {
    const v = mkBot('voxxy', 0, 0);
    expect(hopPhase(v)).toBe(0);
    trick(v, noop);

    const h = (b: Bot): number => {
      const u = hopPhase(b);
      return JUMP_RISE_M * 4 * u * (1 - u);
    };
    let apex = 0;
    let apexAt = 0;
    let t = 0;
    expect(h(v)).toBeCloseTo(0, 9); // leaves the ground FROM the ground
    while (airborne(v)) {
      stepBot(v, DT_MAX, []);
      t += DT_MAX;
      if (h(v) > apex) {
        apex = h(v);
        apexAt = t;
      }
    }
    expect(apex).toBeGreaterThan(JUMP_RISE_M * 0.99);
    expect(apex).toBeLessThanOrEqual(JUMP_RISE_M + 1e-9);
    // Half-way up in half the airtime: the arc is symmetric, like a real one.
    expect(apexAt).toBeCloseTo(JUMP_AIR / 2, 1);
    expect(h(v)).toBe(0); // and back on the floor, not hovering a centimetre up
  });

  it('cannot be held down for a hover — one airtime up, one on the ground', () => {
    const v = mkBot('voxxy', 0, 0);
    let up = 0;
    const FRAMES = 300;
    for (let i = 0; i < FRAMES; i++) {
      trick(v, noop); // E mashed every single frame
      if (airborne(v)) up++;
      stepBot(v, DT_MAX, []);
    }
    const duty = up / FRAMES;
    expect(duty).toBeGreaterThan(0.4);
    expect(duty).toBeLessThan(0.6);
  });
});

describe("Voxxy's hop — what it clears", () => {
  /** A seat row at chapter 1's depth, 9 px (0.72 m) of it. */
  const ROW: Wall = { x: 100, y: -40, w: 9, h: 80, low: true };
  const SOLID: Wall = { x: 100, y: -40, w: 9, h: 80 };

  it('carries her over a seat row that stops her on foot', () => {
    const walked = mkBot('voxxy', 40, 0);
    runEast(walked, [ROW], 120);
    expect(walked.x).toBeLessThan(ROW.x);

    const hopped = mkBot('voxxy', 40, 0);
    // Run up and push off at the row, the way a player does it: the hop is a hop,
    // not a teleport, and it has to be spent at the right moment to be worth it.
    hopped.ix = 1;
    for (let i = 0; i < 200 && ROW.x - hopped.x - hopped.r > 6; i++) stepBot(hopped, DT_MAX, [ROW]);
    expect(Math.hypot(hopped.vx, hopped.vy)).toBeGreaterThan(hopped.max * 0.9);
    expect(trick(hopped, noop)).toBe(true);
    runEast(hopped, [ROW], 120);
    expect(hopped.x).toBeGreaterThan(ROW.x + ROW.w);
  });

  it('is a hop and not a flight — a full-height wall is still a wall in the air', () => {
    const v = mkBot('voxxy', 40, 0);
    runEast(v, [SOLID], 40);
    trick(v, noop);
    runEast(v, [SOLID], 120);
    expect(v.x).toBeLessThan(SOLID.x);
  });

  it('gets no free ground from a standing hop', () => {
    const v = mkBot('voxxy', 40, 0);
    trick(v, noop);
    for (let i = 0; i < 40; i++) stepBot(v, DT_MAX, [ROW]);
    expect(v.x).toBeCloseTo(40, 6);
  });

  it('is put back where she came from when the hop falls short', () => {
    // A block far too wide to clear: she lands inside it and the usual push-out
    // returns her to the side she jumped from, rather than warping her through.
    const BLOCK: Wall = { x: 100, y: -40, w: 90, h: 80, low: true };
    const v = mkBot('voxxy', 40, 0);
    runEast(v, [BLOCK], 40);
    trick(v, noop);
    runEast(v, [BLOCK], 120);
    expect(v.x).toBeLessThan(BLOCK.x);
  });

  it('clears about three metres at a run, which is what a seat row costs', () => {
    const v = mkBot('voxxy', 0, 0);
    runEast(v, [], 40);
    trick(v, noop);
    const x0 = v.x;
    while (airborne(v)) stepBot(v, DT_MAX, []);
    const metres = (v.x - x0) / PX_PER_M;
    expect(metres).toBeGreaterThan(2.5);
    expect(metres).toBeLessThan(3.2);
  });
});

describe("Voxxy's hop — whose verb it is", () => {
  it('is hers alone: the other two answer E without leaving the floor', () => {
    const said: string[] = [];
    const d = mkBot('droid', 0, 0);
    expect(trick(d, (t) => said.push(t))).toBe(true);
    expect(airborne(d)).toBe(false);
    const bg = mkBot('biggy', 0, 0);
    expect(trick(bg, (t) => said.push(t))).toBe(true);
    expect(airborne(bg)).toBe(false);
    expect(said).toHaveLength(2);
    expect(said[0]).toContain('Droid');
    expect(said[1]).toContain('Biggy');
    expect(said[0]).not.toBe(said[1]);
  });

  it('is refused while she is being carried or planted, and says which', () => {
    const said: string[] = [];
    const say = (t: string): void => void said.push(t);
    const v = mkBot('voxxy', 0, 0);
    v.mounted = true;
    expect(trick(v, say)).toBe(false);
    v.mounted = false;
    v.braced = true;
    expect(trick(v, say)).toBe(false);
    expect(said).toHaveLength(2);
    for (const line of said) expect(line).toContain('Voxxy');
  });
});

/*
 * THE OTHER TWO PARTY TRICKS.
 *
 * Michele, 25 Sep 2026: *"Could we add a basic action to each robot on E? Voxxy
 * jumps, Biggy rolls, Droid? Stretches? **Not needed for gameplay.**"* That last
 * clause is the hard part and it is what most of this block tests: a flourish that
 * moved a robot would be gameplay — it would push things, and the speed it pushed
 * them at would have to be a frozen number. So the assertion is not "it moves a
 * little", it is ZERO, to the last bit of a double.
 */
describe('Biggy rolls and Droid stretches — the clock', () => {
  const DUR: Record<'droid' | 'biggy', number> = { droid: DROID_STRETCH_DUR, biggy: BIGGY_ROLL_DUR };

  for (const kind of ['droid', 'biggy'] as const) {
    it(`${kind}: the phase runs 0 to 1 across the flourish and back to 0 after it`, () => {
      const b = mkBot(kind, 0, 0);
      expect(flairPhase(b)).toBe(0);
      expect(flourishing(b)).toBe(false);
      expect(trick(b)).toBe(true);
      expect(flourishing(b)).toBe(true);
      // It starts AT the start: a pose that opens half-played is a pop.
      expect(flairPhase(b)).toBeCloseTo(0, 9);

      let last = -1;
      let t = 0;
      let frames = 0;
      while (flourishing(b)) {
        const p = flairPhase(b);
        expect(p).toBeGreaterThanOrEqual(last); // monotonic: no rewind mid-move
        expect(p).toBeLessThanOrEqual(1);
        last = p;
        stepBot(b, DT_MAX, []);
        t += DT_MAX;
        if (++frames > 1000) throw new Error('flourish never ended');
      }
      expect(t).toBeGreaterThan(DUR[kind] - DT_MAX);
      expect(t).toBeLessThanOrEqual(DUR[kind] + DT_MAX);
      // Finished means finished: the renderer reads 0 and draws the standing rig.
      expect(flairPhase(b)).toBe(0);
      expect(last).toBeGreaterThan(0.97);
    });

    it(`${kind}: moves the body zero pixels, in any direction, ever`, () => {
      const b = mkBot(kind, 400, 250);
      // A wall it would reach the instant it travelled anything at all.
      const WALL = { x: 400 + b.r, y: 200, w: 40, h: 100 };
      trick(b);
      for (let i = 0; i < 200; i++) {
        stepBot(b, DT_MAX, [WALL]);
        expect(b.x).toBe(400);
        expect(b.y).toBe(250);
        expect(b.vx).toBe(0);
        expect(b.vy).toBe(0);
      }
    });

    it(`${kind}: cannot be mashed — one performance, then the same again on the floor`, () => {
      const b = mkBot(kind, 0, 0);
      let on = 0;
      const FRAMES = 400;
      for (let i = 0; i < FRAMES; i++) {
        trick(b); // E on every single frame
        if (flourishing(b)) on++;
        stepBot(b, DT_MAX, []);
      }
      const duty = on / FRAMES;
      expect(duty).toBeGreaterThan(0.4);
      expect(duty).toBeLessThan(0.6);
    });

    it(`${kind}: the stick ends it — a robot being driven has stopped showing off`, () => {
      const b = mkBot(kind, 0, 0);
      trick(b);
      stepBot(b, DT_MAX, []);
      expect(flourishing(b)).toBe(true);
      b.ix = 1;
      stepBot(b, DT_MAX, []);
      expect(flourishing(b)).toBe(false);
      expect(flairPhase(b)).toBe(0);
    });
  }

  it('the rest is the shared one: a hop and a roll come out of the same pocket', () => {
    const bg = mkBot('biggy', 0, 0);
    trick(bg);
    expect(bg.hopRest).toBeCloseTo(BIGGY_ROLL_DUR * (1 + FLAIR_REST_FACTOR), 9);
    const d = mkBot('droid', 0, 0);
    trick(d);
    expect(d.hopRest).toBeCloseTo(DROID_STRETCH_DUR * (1 + FLAIR_REST_FACTOR), 9);
  });
});

describe('Biggy rolls and Droid stretches — refused in their own voices', () => {
  const reasons = (kind: 'droid' | 'biggy'): string[] => {
    const said: string[] = [];
    const say = (t: string): void => void said.push(t);
    const name = kind === 'droid' ? 'Droid' : 'Biggy';

    const carried = mkBot(kind, 0, 0);
    carried.mounted = true;
    expect(partyTrick([carried], carried, say)).toBe(false);

    const planted = mkBot(kind, 0, 0);
    planted.braced = true;
    expect(partyTrick([planted], planted, say)).toBe(false);

    const busy = mkBot(kind, 0, 0);
    expect(partyTrick([busy], busy, noop)).toBe(true);
    expect(partyTrick([busy], busy, say)).toBe(false); // already performing

    const resting = mkBot(kind, 0, 0);
    expect(partyTrick([resting], resting, noop)).toBe(true);
    while (flourishing(resting)) stepBot(resting, DT_MAX, []);
    expect(partyTrick([resting], resting, say)).toBe(false); // still catching breath

    for (const line of said) expect(line).toContain(name);
    return said;
  };

  it('Droid says why, four different ways, and never just does nothing', () => {
    const said = reasons('droid');
    expect(said).toHaveLength(4);
    expect(new Set(said).size).toBe(4);
  });

  it('Biggy says why, four different ways, and never just does nothing', () => {
    const said = reasons('biggy');
    expect(said).toHaveLength(4);
    expect(new Set(said).size).toBe(4);
  });

  it('Biggy will not roll with Droid on his shoulders — the gate he cannot see himself', () => {
    const said: string[] = [];
    const bg = mkBot('biggy', 0, 0);
    const d = mkBot('droid', 0, 0);
    d.mounted = true;
    expect(partyTrick([d, bg], bg, (t) => said.push(t))).toBe(false);
    expect(flourishing(bg)).toBe(false);
    expect(said[0]).toContain('Biggy');
    expect(said[0]).toContain('Droid');
    // And alone he rolls, so it really is the passenger and not a broken gate.
    expect(partyTrick([bg], bg, noop)).toBe(true);
  });

  it('climbing aboard ends whatever either of them was doing', () => {
    const bots = [mkBot('voxxy', 0, 0), mkBot('droid', 100, 100), mkBot('biggy', 106, 100)];
    const [, d, bg] = bots;
    expect(partyTrick(bots, bg, noop)).toBe(true);
    expect(flourishing(bg)).toBe(true);
    expect(toggleMount(bots, noop)).toBe(true);
    expect(d.mounted).toBe(true);
    // A mounted Droid's clock does not tick (`stepBot` returns early for him), so
    // a flourish left running on either of them would hang for the whole chapter.
    expect(flourishing(bg)).toBe(false);
    expect(flourishing(d)).toBe(false);
  });
});

describe('E, when the chapter has no use for it', () => {
  const mk = (): DebugGame => createGame({ seed: 4, chapter: 4, cards: false });

  it('hops Voxxy where chapter 4 wants nothing', () => {
    const g = mk();
    g.debug.select('voxxy');
    // Well away from Biggy, so `E` cannot mean "take hold of him" instead.
    const v = bot(g, 'voxxy');
    g.debug.place('biggy', v.x + 400, v.y + 300);
    g.key('KeyE');
    expect(airborne(bot(g, 'voxxy'))).toBe(true);
  });

  it('still belongs to the chapter where the chapter wants it', () => {
    const g = mk();
    g.debug.select('droid');
    const hook = g.snapshot().props.find((o) => o.kind === 'banner-hook');
    if (!hook) throw new Error('no banner hook');
    g.debug.place('droid', hook.x, hook.y);
    g.update(DT_MAX);
    g.key('KeyE');
    expect((g.debug.chapter() as { hooks: number }).hooks).toBe(1);
    // And Droid is told to climb rather than leap only when there is no hook.
    expect(airborne(bot(g, 'droid'))).toBe(false);
  });

  it('takes hold of Biggy rather than hopping when she is standing against him', () => {
    const g = mk();
    g.debug.select('voxxy');
    const bg = bot(g, 'biggy');
    g.debug.place('voxxy', bg.x - bg.r - bot(g, 'voxxy').r, bg.y);
    g.update(DT_MAX);
    g.key('KeyE');
    expect(g.snapshot().tow?.holder).toBe('voxxy');
    expect(airborne(bot(g, 'voxxy'))).toBe(false);
    // Same key lets go again — that was the whole point of folding it onto E.
    g.key('KeyE');
    expect(g.snapshot().tow).toBeNull();
  });
});

/*
 * THE FALL-THROUGH, CHAPTER BY CHAPTER.
 *
 * `E` is one key with two jobs — Michele: *"I'd keep E, when no other action is
 * available"* — and it only works if the chapter gets first refusal. These are the
 * two cases that must never blur into each other: a press the chapter WANTS must
 * not also hop, and a press the chapter has no use for must not be swallowed.
 * Chapter 3 is not taught yet; when it is, it belongs here too.
 */
describe('E falls through only where the chapter has no use for it', () => {
  const night = (): DebugGame => createGame({ seed: 11, chapter: 1, cards: false });
  const expo = (): DebugGame => createGame({ seed: 11, chapter: 2, cards: false });

  /** Put the driven robot somewhere with nothing near it, and take it. */
  function alone(g: DebugGame, kind: RobotKind, x: number, y: number): void {
    g.debug.select(kind);
    for (const o of g.snapshot().bots) if (o.kind !== kind) g.debug.place(o.kind, x + 300, y + 200);
    g.debug.place(kind, x, y);
    g.update(DT_MAX);
  }

  it('hops Voxxy in the chapter-1 corridor, where E has never meant anything for her', () => {
    const g = night();
    alone(g, 'voxxy', 330, 352);
    g.key('KeyE');
    expect(airborne(bot(g, 'voxxy'))).toBe(true);
  });

  it('leaves the climb alone: Droid at Biggy takes the shoulders, not the air', () => {
    const g = night();
    const bg = bot(g, 'biggy');
    g.debug.select('droid');
    // Approached from the EAST, the open corridor. The crate row stands against
    // the WEST wall now (`src/sim/opening.ts`), so a mark west of Biggy's start
    // is inside his own crate rather than in free air.
    g.debug.place('droid', bg.x + bg.r + bot(g, 'droid').r + 1, bg.y);
    g.update(DT_MAX);
    g.key('KeyE');
    expect(bot(g, 'droid').mounted).toBe(true);
    expect(airborne(bot(g, 'droid'))).toBe(false);
  });

  it('leaves the projector panel alone, refusal and all', () => {
    const g = night();
    const panel = g.snapshot().props.find((o) => o.kind === 'projector-panel');
    if (!panel) throw new Error('no projector panel');
    alone(g, 'droid', panel.x + 13, panel.y + 8);
    g.key('KeyE');
    // Droid says he is too short for it; he does not also refuse to jump.
    expect(g.snapshot().toast?.t ?? '').toContain('If I stood on Biggy');
  });

  it('hops Voxxy in the chapter-2 hall, where her own E was a dead end', () => {
    const g = expo();
    alone(g, 'voxxy', 500, 400);
    g.key('KeyE');
    expect(airborne(bot(g, 'voxxy'))).toBe(true);
  });

  it('but takes hold of Biggy first when she is against him — one key, in order', () => {
    const g = expo();
    const bg = bot(g, 'biggy');
    g.debug.select('voxxy');
    g.debug.place('voxxy', bg.x - bg.r - bot(g, 'voxxy').r, bg.y);
    g.update(DT_MAX);
    g.key('KeyE');
    expect(g.snapshot().tow?.holder).toBe('voxxy');
    expect(airborne(bot(g, 'voxxy'))).toBe(false);
  });

  it('hops Voxxy in chapter 3, where every refusal was claiming the key', () => {
    /*
     * Reported from the other end: the rig round found she could not hop ANYWHERE
     * in chapter 3, because everything in that chapter ends in a line of dialogue
     * and a line of dialogue was claiming `E`. Only the two dead ends hand it back.
     */
    const g = createGame({ seed: 11, chapter: 3, cards: false });
    alone(g, 'voxxy', 620, 470);
    g.key('KeyE');
    expect(airborne(bot(g, 'voxxy'))).toBe(true);
  });

  it('leaves a chapter-3 refusal that names a reason alone', () => {
    // "That weighs more than I do" is an answer, not a dead end. She stays down.
    const g = createGame({ seed: 11, chapter: 3, cards: false });
    const crate = g.snapshot().props.find((o) => o.kind === 'crate');
    if (!crate) throw new Error('no beer crate');
    alone(g, 'voxxy', crate.x, crate.y);
    g.key('KeyE');
    expect(airborne(bot(g, 'voxxy'))).toBe(false);
    expect(g.snapshot().toast?.t ?? '').toContain('BIGGY');
  });

  /*
   * ALL THREE ROBOTS, ALL FOUR CHAPTERS.
   *
   * With one party trick, one dead end per chapter was enough. With three, the
   * fall-through has to be reachable for every robot in every room, and it was
   * not: chapters 2 and 3 answered Droid with "nothing to reach here" and chapter
   * 2 answered Biggy with "I don't do buttons, I do doors", both of which claimed
   * the key and left the two of them with a key that did nothing at all. Those
   * lines were written when the only thing behind them was a refusal to jump.
   */
  const SPOT: Record<number, [number, number]> = {
    1: [330, 352],
    2: [500, 400],
    3: [620, 470],
    4: [700, 300],
  };
  const performing = (b: Bot): boolean => airborne(b) || flourishing(b);

  for (const ch of [1, 2, 3, 4]) {
    for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
      it(`chapter ${ch}: ${kind} performs where the chapter wants nothing`, () => {
        const g = createGame({ seed: 11, chapter: ch, cards: false });
        alone(g, kind, SPOT[ch][0], SPOT[ch][1]);
        g.key('KeyE');
        expect(performing(bot(g, kind))).toBe(true);
      });
    }
  }

  /*
   * CHAPTER 1 IS THE ONE ROOM WHERE DROID'S `E` HAS A SECOND JOB, AND IT KEEPS IT
   * WHERE IT MATTERS.
   *
   * It used to take the key everywhere, so he was the only robot in the game with
   * a room he could not show off in. The chapter now takes it inside **one Biggy
   * of daylight** past the climb's own reach — where a player pressing `E` is
   * plainly going for the shoulders and the gap readout is the useful answer — and
   * hands it back outside that, where "15.0 m of daylight" is a measurement rather
   * than advice. Both halves are pinned here, because the bubble is the whole
   * point: widen it and the stretch disappears again, close it and the climb's
   * feedback does.
   */
  it('chapter 1: near Biggy, Droid climbs rather than stretches', () => {
    const g = createGame({ seed: 11, chapter: 1, cards: false });
    const bg = bot(g, 'biggy');
    g.debug.select('droid');
    // Approached from the EAST, the open corridor. The crate row stands against
    // the WEST wall now (`src/sim/opening.ts`), so a mark west of Biggy's start
    // is inside his own crate rather than in free air.
    g.debug.place('droid', bg.x + bg.r + bot(g, 'droid').r + 1, bg.y);
    g.update(DT_MAX);
    g.key('KeyE');
    expect(flourishing(bot(g, 'droid'))).toBe(false);
    expect(bot(g, 'droid').mounted).toBe(true);
  });

  it('chapter 1: just outside the climb, he is still told the gap', () => {
    const g = createGame({ seed: 11, chapter: 1, cards: false });
    const bg = bot(g, 'biggy');
    const d = bot(g, 'droid');
    g.debug.select('droid');
    // Inside the bubble (one Biggy of daylight past the reach) but outside the
    // reach itself: the climb refuses, in his voice, and keeps the key.
    g.debug.place('droid', bg.x + bg.r + d.r + (MOUNT_REACH + bg.r), bg.y);
    g.update(DT_MAX);
    g.key('KeyE');
    expect(bot(g, 'droid').mounted).toBe(false);
    expect(flourishing(bot(g, 'droid'))).toBe(false);
    expect(g.snapshot().toast?.t ?? '').toContain('daylight');
  });

  it('leaves the chapter-2 terminal alone', () => {
    const g = expo();
    const term = g.snapshot().props.find((o) => o.kind === 'terminal');
    if (!term) throw new Error('no terminal');
    alone(g, 'voxxy', term.x, term.y);
    g.key('KeyE');
    // Whatever the cabinet says back, she is on the floor saying it.
    expect(airborne(bot(g, 'voxxy'))).toBe(false);
  });
});

/*
 * THE RIG SIDE.
 *
 * The sim hands the renderer one number per flourish (`flairPhase`) and the rig
 * decides what to do with it, exactly as it does for `hop`. These build the real
 * rigs headless — no WebGL, same as `tests/robots.smoke.test.ts` — and check that
 * the number arrives, that it is the only thing that moves, and that a robot at
 * either end of a flourish is standing the way it was standing before it.
 */
describe('the party tricks have a pose', () => {
  const settle = (rig: RobotRig): void => {
    for (let i = 0; i < 60; i++) updateRobot(rig, { speedMps: 0, heading: Math.PI / 2, dt: 1 / 60 });
  };
  const drive = (rig: RobotRig, flair: number): void => {
    updateRobot(rig, { speedMps: 0, heading: Math.PI / 2, dt: 1 / 60, flair });
  };

  it('flair defaults to 0, so every existing call site is unchanged', () => {
    const a = createRobot('biggy');
    const b = createRobot('biggy');
    settle(a);
    settle(b);
    for (let i = 0; i < 30; i++) {
      updateRobot(a, { speedMps: 1, heading: 0.3, dt: 1 / 60 });
      updateRobot(b, { speedMps: 1, heading: 0.3, dt: 1 / 60, flair: 0 });
    }
    for (const bone of ['pelvis', 'shoulderL', 'head']) {
      expect(a.bones[bone].rotation.z).toBeCloseTo(b.bones[bone].rotation.z, 10);
      expect(a.bones[bone].position.x).toBeCloseTo(b.bones[bone].position.x, 10);
    }
    a.dispose();
    b.dispose();
  });

  it('Biggy rocks both ways, a turn and a half of it, and is upright at both ends', () => {
    const rig = createRobot('biggy');
    settle(rig);
    const roll: number[] = [];
    for (let i = 0; i <= 100; i++) {
      drive(rig, i / 100);
      roll.push(rig.bones.pelvis.rotation.z);
    }
    // Over one way and back the other: a rock, not a lean.
    expect(Math.max(...roll)).toBeGreaterThan(0.25);
    expect(Math.min(...roll)).toBeLessThan(-0.25);
    // A turn and a half (`BIGGY_ROLL_ROCKS`) is three swings — right, left, right —
    // so the roll changes sign exactly twice between the two ends of the move.
    let crossings = 0;
    for (let i = 1; i < roll.length; i++) if (roll[i - 1] * roll[i] < 0) crossings++;
    expect(crossings).toBe(2);
    // And he starts and finishes standing, so nothing pops when the sim's clock
    // hits 0 and the renderer stops passing a phase. Measured against a Biggy who
    // never rolled, because his idle sway is 0.075 rad of its own.
    const ctrl = createRobot('biggy');
    settle(ctrl);
    for (let i = 0; i <= 100; i++) updateRobot(ctrl, { speedMps: 0, heading: Math.PI / 2, dt: 1 / 60 });
    drive(rig, 1);
    updateRobot(ctrl, { speedMps: 0, heading: Math.PI / 2, dt: 1 / 60 });
    expect(rig.bones.pelvis.rotation.z).toBeCloseTo(ctrl.bones.pelvis.rotation.z, 9);
    expect(rig.bones.pelvis.position.x).toBeCloseTo(ctrl.bones.pelvis.position.x, 9);
    rig.dispose();
    ctrl.dispose();
  });

  it("Biggy's arms swing counter to the gut, and nothing is standing on the floor", () => {
    const rig = createRobot('biggy');
    settle(rig);
    // A quarter of the way into the first rock is the top of it.
    let best = 0;
    let at = 0;
    for (let i = 1; i <= 40; i++) {
      drive(rig, i / 100);
      if (Math.abs(rig.bones.pelvis.rotation.z) > Math.abs(best)) {
        best = rig.bones.pelvis.rotation.z;
        at = i / 100;
      }
    }
    drive(rig, at);
    expect(Math.sign(rig.bones.shoulderL.rotation.z)).toBe(-Math.sign(best));
    expect(Math.sign(rig.bones.shoulderR.rotation.z)).toBe(-Math.sign(best));
    // The lid tries to stay level: the head rolls back against the body.
    expect(Math.sign(rig.bones.head.rotation.z)).toBe(-Math.sign(best));
    expect(footContact(rig, 'L')).toBe(false);
    expect(footContact(rig, 'R')).toBe(false);
    rig.dispose();
  });

  it('Droid puts both long arms overhead and comes back down', () => {
    // A second rig driven the same number of frames with no flourish, so "back
    // down" is measured against a Droid standing there rather than against a
    // reading taken before the idle had breathed.
    const rig = createRobot('droid');
    const ctrl = createRobot('droid');
    settle(rig);
    settle(ctrl);
    const rest = rig.bones.shoulderL.rotation.x;
    const restY = rig.bones.pelvis.position.y;
    drive(rig, 0.5);
    drive(ctrl, 0);
    // Negative rotation.x on a shoulder lifts the arm up and forward.
    expect(rig.bones.shoulderL.rotation.x).toBeLessThan(rest - 2);
    expect(rig.bones.shoulderR.rotation.x).toBeLessThan(rest - 2);
    // Both of them, within a hair: a stretch, not a wave.
    expect(rig.bones.shoulderL.rotation.x).toBeCloseTo(rig.bones.shoulderR.rotation.x, 6);
    // A small rise, and an arch through the back.
    expect(rig.bones.pelvis.position.y).toBeGreaterThan(restY + 0.03);
    expect(rig.bones.pelvis.rotation.x).toBeLessThan(0);
    drive(rig, 1);
    drive(ctrl, 0);
    expect(rig.bones.shoulderL.rotation.x).toBeCloseTo(ctrl.bones.shoulderL.rotation.x, 9);
    expect(rig.bones.pelvis.position.y).toBeCloseTo(ctrl.bones.pelvis.position.y, 9);
    rig.dispose();
    ctrl.dispose();
  });

  it('a mounted robot cannot be flourishing, whatever it is passed', () => {
    const a = createRobot('droid');
    const b = createRobot('droid');
    settle(a);
    settle(b);
    updateRobot(a, { speedMps: 0, heading: Math.PI / 2, dt: 1 / 60, mounted: true });
    updateRobot(b, { speedMps: 0, heading: Math.PI / 2, dt: 1 / 60, mounted: true, flair: 0.5 });
    expect(a.bones.shoulderL.rotation.x).toBeCloseTo(b.bones.shoulderL.rotation.x, 10);
    a.dispose();
    b.dispose();
  });

  it('the rig never moves itself: the flourish writes bones, the caller owns the floor', () => {
    for (const kind of ['droid', 'biggy'] as const) {
      const rig = createRobot(kind);
      settle(rig);
      rig.root.position.set(3, 0, 7);
      for (let i = 0; i <= 40; i++) drive(rig, i / 40);
      expect(rig.root.position.x).toBe(3);
      expect(rig.root.position.y).toBe(0);
      expect(rig.root.position.z).toBe(7);
      rig.dispose();
    }
  });
});
