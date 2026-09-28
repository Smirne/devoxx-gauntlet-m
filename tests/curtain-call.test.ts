/**
 * THE CURTAIN CALL — what the three of them do while the opening video plays.
 *
 * Michele, 28 Sep 2026: *"Where are we with the ending video/animation?"*. The
 * video was there and the animation was not: the house screen woke up, the cards
 * came and went, and the robots stood wherever the player had parked them for the
 * whole of it.
 *
 * The act is built out of verbs the game already has — `partyTrick` and the climb
 * — so the things worth asserting are that it HAPPENS, that it happens in order,
 * and that it stays inside the rules the rest of the game plays by: nobody is
 * teleported, nobody exceeds its own frozen top speed, and nobody walks off the
 * stage to do it.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame, type KeynoteState } from '../src/sim';
import type { Bot, Prop } from '../src/sim/types';
import { m } from '../src/sim/units';

import { raiseSign } from './pilot';

const SEED = 20260930;
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};
const bot = (g: DebugGame, kind: string): Bot => g.snapshot().bots.find((b) => b.kind === kind) as Bot;
const prop = (g: DebugGame, kind: string): Prop | undefined => g.snapshot().props.find((p) => p.kind === kind);

/**
 * Chapter 4, played to the frame the house screen wakes up.
 *
 * The same three jobs `tests/chapters.test.ts` drives, in the same order, because
 * the reel only starts when the chapter says the stage is ready and all three of
 * them are standing on it.
 */
function toTheVideo(g: DebugGame): void {
  const key = (): KeynoteState => g.debug.chapter() as KeynoteState;
  const mark = prop(g, 'cake-mark');
  expect(mark, 'chapter 4 draws no cake mark').toBeDefined();
  const markX = mark!.x + (mark!.w ?? 0) / 2;
  expect(g.debug.placeProp('cake', markX, mark!.y + 58)).toBe(true);
  g.debug.select('biggy');
  g.debug.place('biggy', markX, mark!.y + 98);
  g.setStick(0, -1);
  for (let i = 0; i < 200 && !key().cake; i++) g.update(DT_MAX);
  g.setStick(0, 0);
  expect(key().cake, 'the cake never reached its mark').toBe(true);

  raiseSign(g);
  expect(key().sign, 'the #DEVOXX sign never went up').toBe('#DEVOXX');
  g.debug.select('voxxy');
  for (const sp of g.snapshot().props.filter((p) => p.kind === 'spotlight')) {
    g.debug.place('voxxy', sp.x, sp.y);
    steps(g, 1);
  }
  expect(key().ready, 'the stage never came ready').toBe(true);

  // Parked on the stage, but scattered across it — which is the point: the act
  // starts by getting them onto their marks, and it has to do that from wherever
  // the player happened to leave them.
  const stage = prop(g, 'stage');
  expect(stage, 'chapter 4 draws no stage').toBeDefined();
  const sy = stage!.y + (stage!.h ?? 0) / 2;
  g.debug.place('voxxy', stage!.x + 18, sy + 14);
  g.debug.place('droid', stage!.x + 96, sy - 10);
  g.debug.place('biggy', stage!.x + 170, sy + 12);
  steps(g, 1);
  expect(g.snapshot().reel, 'the opening video never started').not.toBeNull();
}

describe('the curtain call', () => {
  /**
   * Every beat, in order, over one playthrough of the video — and the three of
   * them end the night as the tower the whole game has been building towards.
   */
  it('takes the marks, gives all three party tricks, and puts Droid on Biggy', () => {
    const g = createGame({ seed: SEED, chapter: 4, cards: false }) as DebugGame;
    toTheVideo(g);
    const len = g.snapshot().reel!.len;

    let hopAt = -1;
    let rollAt = -1;
    let stretchAt = -1;
    let mountAt = -1;
    let over = 0;
    const frames = Math.ceil(len / DT_MAX);
    for (let i = 0; i < frames; i++) {
      g.update(DT_MAX);
      const snap = g.snapshot();
      if (snap.reel === null) break;
      const at = snap.reel.t;
      const v = bot(g, 'voxxy');
      const d = bot(g, 'droid');
      const bg = bot(g, 'biggy');
      if (hopAt < 0 && (v.air ?? 0) > 0) hopAt = at;
      if (rollAt < 0 && (bg.flair ?? 0) > 0) rollAt = at;
      if (stretchAt < 0 && (d.flair ?? 0) > 0) stretchAt = at;
      if (mountAt < 0 && d.mounted) mountAt = at;
      // Nobody is run faster than it can walk — the same guard
      // `tests/cutscene-pace.test.ts` puts on the chapter transitions.
      for (const b of snap.bots) {
        if (b.mounted) continue;
        if (Math.hypot(b.vx, b.vy) > b.max + 0.01) over++;
      }
    }

    expect(hopAt, 'Voxxy never jumped').toBeGreaterThan(0);
    expect(rollAt, 'Biggy never rolled').toBeGreaterThan(0);
    expect(stretchAt, 'Droid never unfolded').toBeGreaterThan(0);
    expect(mountAt, 'Droid never climbed Biggy').toBeGreaterThan(0);
    // In that order: the small one opens, the heavy one answers, the tall one
    // goes last and then climbs.
    expect(hopAt).toBeLessThan(rollAt);
    expect(rollAt).toBeLessThan(stretchAt);
    expect(stretchAt).toBeLessThan(mountAt);
    // ...and the whole act fits inside the shortest reel the game can cut.
    expect(mountAt).toBeLessThan(len - 1);
    expect(over, 'a robot was run above its own top speed').toBe(0);
  });

  /**
   * THE ACT STAYS ON THE STAGE.
   *
   * A curtain call that walks a robot into the front row is worse than no curtain
   * call, and the marks are written against the stage rect rather than typed, so
   * this is the assertion that keeps them there if the rect ever moves.
   */
  it('keeps all three inside the stage, on marks of their own', () => {
    const g = createGame({ seed: SEED, chapter: 4, cards: false }) as DebugGame;
    toTheVideo(g);
    const stage = prop(g, 'stage')!;
    const inside = (b: Bot): boolean =>
      b.x >= stage.x && b.x <= stage.x + (stage.w ?? 0) && b.y >= stage.y && b.y <= stage.y + (stage.h ?? 0);

    for (let i = 0; i < Math.ceil(g.snapshot().reel!.len / DT_MAX); i++) {
      g.update(DT_MAX);
      if (g.snapshot().reel === null) break;
      for (const b of g.snapshot().bots) expect(inside(b), `${b.kind} left the stage`).toBe(true);
    }

    // They finish in a line across the apron, a body's width apart, all three
    // looking out at the room rather than at the screen behind them.
    const v = bot(g, 'voxxy');
    const bg = bot(g, 'biggy');
    expect(Math.abs(v.y - bg.y), 'they are not on one line').toBeLessThan(6);
    expect(m(Math.abs(v.x - bg.x)), 'they are standing on top of each other').toBeGreaterThan(1.5);
  });

  /**
   * THE ROOM REACTS.
   *
   * Three thousand people watching three robots take a bow do not sit with their
   * hands in their laps, and a still crowd under a playing screen is the thing
   * that made the old ending read as a pause. The applause is the sim's number
   * (`Person.cheer`) so the pose can be the renderer's business, it comes up
   * rather than switching on, and nobody still hunting for a seat is clapping.
   */
  it('brings the room up to applause, and only the people who are sitting down', () => {
    const g = createGame({ seed: SEED, chapter: 4, cards: false }) as DebugGame;
    const before = g.snapshot().people;
    expect(before.length, 'nobody in the room at all').toBeGreaterThan(0);
    for (const p of before) expect(p.cheer ?? 0, 'the room was clapping before the show').toBe(0);

    // Let some of the room actually sit down first — an empty auditorium makes
    // every assertion below about the seated rows pass by having none.
    for (let i = 0; i < 4000 && (g.debug.chapter() as { seated: number }).seated < 6; i++) g.update(DT_MAX);
    expect((g.debug.chapter() as { seated: number }).seated, 'nobody ever sat down').toBeGreaterThan(5);

    toTheVideo(g);
    const seatedNow = g.snapshot().people.filter((p) => p.role === 'seated');
    expect(seatedNow.length, 'the rows emptied again').toBeGreaterThan(5);
    steps(g, 6);
    const early = g.snapshot().people.filter((p) => p.role === 'seated');
    if (early.length > 0) {
      // It has started, and it has not arrived: a room at full volume on frame
      // one is a laugh track.
      expect(early[0].cheer ?? 0).toBeGreaterThan(0);
      expect(early[0].cheer ?? 0).toBeLessThan(1);
    }
    steps(g, 120);
    const loud = g.snapshot().people;
    const sat = loud.filter((p) => p.role === 'seated');
    expect(sat.length, 'nobody was seated for the keynote').toBe(seatedNow.length);
    for (const p of sat) expect(p.cheer ?? 0, 'a seated row is not applauding').toBe(1);
    // Stephan and the speaker are on stage clapping the robots off it.
    for (const who of ['stephan', 'speaker']) {
      const one = loud.find((p) => p.role === who);
      expect(one, `no ${who} on the stage`).toBeDefined();
      expect(one!.cheer ?? 0, `${who} is not applauding`).toBeGreaterThan(0.9);
    }
    // Anybody still walking to a seat has better things to do with their hands.
    for (const p of loud.filter((q) => q.role === 'visitor')) expect(p.cheer ?? 0).toBe(0);
  });

  /**
   * THE CARD LANDS ON A LIVE STAGE, NOT A PHOTOGRAPH.
   *
   * Michele, 28 Sep 2026: *"the score card still arrives over a frozen frame"*.
   * It did, and for a reason nothing in the chapter could see: `game.ts` stops the
   * sim while a card is showing, which is right for a briefing and wrong for the
   * one card that comes after everything. The video ended, the camera jumped back
   * out to the wide room, and the last thing the player saw was three thousand
   * people stopped mid-clap behind a photograph of themselves.
   */
  it('keeps the room playing behind the final card, on the same shot', () => {
    const g = createGame({ seed: SEED, chapter: 4, cards: false }) as DebugGame;
    // Let the room start filling first: a keynote played to an empty auditorium
    // has nobody to freeze, and this test is about the room.
    for (let i = 0; i < 4000 && (g.debug.chapter() as { seated: number }).seated < 6; i++) g.update(DT_MAX);
    toTheVideo(g);
    const shot = g.snapshot().view;
    // All the way to the end of the video, with no key pressed.
    const frames = Math.ceil(g.snapshot().reel!.len / DT_MAX) + 8;
    for (let i = 0; i < frames; i++) g.update(DT_MAX);
    expect(g.snapshot().reel, 'the video never ended').toBeNull();
    expect(g.snapshot().phase).toBe('done');
    expect(g.snapshot().card, 'no final card').toContain('Keynote starts');
    // The camera did NOT pull back out to the room: the card is over the stage.
    expect(g.snapshot().view, 'the shot changed under the card').toEqual(shot);

    // The tower is still standing, and the room is still clapping.
    expect(bot(g, 'droid').mounted, 'the tower came apart').toBe(true);
    for (const p of g.snapshot().people.filter((q) => q.role === 'seated')) {
      expect(p.cheer ?? 0, 'the room stopped clapping behind the card').toBe(1);
    }

    // ...and it is MOVING: somebody in the room is in a different place a second
    // later, and Voxxy is still taking her encore.
    const before = g.snapshot().people.map((p) => ({ x: p.x, y: p.y }));
    let hops = 0;
    for (let i = 0; i < 300; i++) {
      g.update(DT_MAX);
      if ((bot(g, 'voxxy').air ?? 0) > 0) hops++;
    }
    const after = g.snapshot().people.map((p) => ({ x: p.x, y: p.y }));
    const moved = after.filter((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y) > 1).length;
    expect(moved, 'the whole room froze behind the card').toBeGreaterThan(0);
    expect(hops, 'Voxxy stopped taking her encore').toBeGreaterThan(0);
    // Nothing the tableau does may touch the run: it is already scored and written.
    expect(g.snapshot().card, 'the card was rewritten behind itself').toContain('Keynote starts');
  });

  /**
   * A skipped video skips the act with it: the chapter is over, and a robot left
   * walking to a mark after the final card is a robot the player can see moving
   * behind it.
   */
  it('stops dead when the video is skipped', () => {
    const g = createGame({ seed: SEED, chapter: 4, cards: false }) as DebugGame;
    toTheVideo(g);
    steps(g, 60);
    g.key('KeyE');
    expect(g.snapshot().reel, 'the video survived the skip').toBeNull();
    expect(g.snapshot().phase).toBe('done');
    const before = g.snapshot().bots.map((b) => ({ x: b.x, y: b.y }));
    steps(g, 30);
    const after = g.snapshot().bots.map((b) => ({ x: b.x, y: b.y }));
    for (let i = 0; i < before.length; i++) {
      expect(Math.hypot(after[i].x - before[i].x, after[i].y - before[i].y), 'a robot kept walking').toBeLessThan(0.5);
    }
  });
});
