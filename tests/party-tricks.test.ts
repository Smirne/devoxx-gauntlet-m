/**
 * Voxxy's hop.
 *
 * Michele asked for it twice — *"just for one quiz. And for jumping around for
 * fun"*, then *"Voxxy jump: let's make it. I'd keep E, when no other action is
 * available."* Both halves are load-bearing and both are tested here: what the hop
 * physically is, and what happens to the `E` that fires it.
 *
 * The arc is derived rather than tuned (`JUMP_RISE_M` is the only free number), so
 * the first tests measure the ballistics against closed-form projectile motion and
 * would fail if anybody replaced them with an eased animation curve. The rest is
 * the rule that keeps one key doing two jobs: the chapter is asked first, and only
 * a flat `false` from it lets the hop through.
 */

import { describe, expect, it } from 'vitest';

import {
  DT_MAX,
  GRAVITY,
  JUMP_AIR,
  JUMP_RISE_M,
  PX_PER_M,
  airborne,
  createGame,
  hopPhase,
  jump,
  mkBot,
  stepBot,
  type Bot,
  type DebugGame,
  type RobotKind,
  type Wall,
} from '../src/sim';

const noop = (): void => {};

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
    expect(jump(v, noop)).toBe(true);
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
    jump(v, noop);

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
      jump(v, noop); // E mashed every single frame
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
    expect(jump(hopped, noop)).toBe(true);
    runEast(hopped, [ROW], 120);
    expect(hopped.x).toBeGreaterThan(ROW.x + ROW.w);
  });

  it('is a hop and not a flight — a full-height wall is still a wall in the air', () => {
    const v = mkBot('voxxy', 40, 0);
    runEast(v, [SOLID], 40);
    jump(v, noop);
    runEast(v, [SOLID], 120);
    expect(v.x).toBeLessThan(SOLID.x);
  });

  it('gets no free ground from a standing hop', () => {
    const v = mkBot('voxxy', 40, 0);
    jump(v, noop);
    for (let i = 0; i < 40; i++) stepBot(v, DT_MAX, [ROW]);
    expect(v.x).toBeCloseTo(40, 6);
  });

  it('is put back where she came from when the hop falls short', () => {
    // A block far too wide to clear: she lands inside it and the usual push-out
    // returns her to the side she jumped from, rather than warping her through.
    const BLOCK: Wall = { x: 100, y: -40, w: 90, h: 80, low: true };
    const v = mkBot('voxxy', 40, 0);
    runEast(v, [BLOCK], 40);
    jump(v, noop);
    runEast(v, [BLOCK], 120);
    expect(v.x).toBeLessThan(BLOCK.x);
  });

  it('clears about three metres at a run, which is what a seat row costs', () => {
    const v = mkBot('voxxy', 0, 0);
    runEast(v, [], 40);
    jump(v, noop);
    const x0 = v.x;
    while (airborne(v)) stepBot(v, DT_MAX, []);
    const metres = (v.x - x0) / PX_PER_M;
    expect(metres).toBeGreaterThan(2.5);
    expect(metres).toBeLessThan(3.2);
  });
});

describe("Voxxy's hop — whose verb it is", () => {
  it('is refused to the other two, in their own voices', () => {
    const said: string[] = [];
    const d = mkBot('droid', 0, 0);
    expect(jump(d, (t) => said.push(t))).toBe(false);
    expect(airborne(d)).toBe(false);
    const bg = mkBot('biggy', 0, 0);
    expect(jump(bg, (t) => said.push(t))).toBe(false);
    expect(airborne(bg)).toBe(false);
    expect(said).toHaveLength(2);
    expect(said[0]).toContain('Droid');
    expect(said[1]).toContain('Biggy');
    expect(said[0]).not.toBe(said[1]);
  });

  it('is refused while she is being carried or planted', () => {
    const v = mkBot('voxxy', 0, 0);
    v.mounted = true;
    expect(jump(v, noop)).toBe(false);
    v.mounted = false;
    v.braced = true;
    expect(jump(v, noop)).toBe(false);
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
    g.debug.place('droid', bg.x - bg.r - bot(g, 'droid').r - 1, bg.y);
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
