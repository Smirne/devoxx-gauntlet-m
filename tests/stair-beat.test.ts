/**
 * THE STAIR BEAT — chapter 3 into chapter 4, as one shot.
 *
 * Michele's storyboard, 29 Sep 2026: *"camera moves to show the staircase,
 * Stephan presses a button, the nastri open, then the climb"* — and of the version
 * before it, *"at the moment the robots aren't climbing correctly and the scene
 * ends in dark."*
 *
 * The order is the story, so the order is what is asserted: the button before the
 * belts, the belts before anybody climbs. Then the climb itself, measured the way
 * the renderer draws it — `riseAt` over the snapshot's own plates is exactly the
 * height `src/render3d/robots3d.ts` lifts a robot by — so "they rise tread by tread
 * up the actual flight" is a number here, not a hope. And the two ways it went
 * dark: a camera that was not following them up, and a black that came down
 * before they got anywhere.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, GF, createGame, riseAt, type BreakfastState, type DebugGame } from '../src/sim';
import { F1, MAIN_STAIR_TOP_M, LOBBY_RISE_M, R, roomDoor } from '../src/sim/geometry';
import type { CameraShot, RobotKind } from '../src/sim/types';
import { playToStairGate } from './pilot';

interface Frame {
  chapter: number;
  phase: string;
  fade: number;
  button: string;
  swing: number;
  shot: CameraShot | null;
  reach: number;
  bots: Record<RobotKind, { x: number; y: number; r: number; rise: number }>;
}

function grab(g: DebugGame): Frame {
  const s = g.snapshot();
  const bots = {} as Frame['bots'];
  for (const b of s.bots) bots[b.kind] = { x: b.x, y: b.y, r: b.r, rise: riseAt(b.x, b.y, s.plates) };
  return {
    chapter: s.chapter,
    phase: s.phase,
    fade: s.fade,
    button: s.props.find((p) => p.kind === 'stair-button')?.state ?? '',
    swing: s.props.find((p) => p.kind === 'gate')?.progress ?? 0,
    shot: s.shot,
    reach: s.people.find((p) => p.role === 'stephan')?.reach ?? 0,
    bots,
  };
}

/** Chapter 3 to the gate, then every frame from `done()` to a second into chapter 4. */
function film(): Frame[] {
  const g: DebugGame = createGame({ seed: 20260930, chapter: 3, cards: false });
  for (let i = 0; i < 4; i++) g.update(DT_MAX);
  const frames: Frame[] = [];
  playToStairGate(g, (h) => {
    frames.push(grab(h));
    for (let i = 0; i < 400 && (h.debug.chapter() as BreakfastState).gateSwing < 1; i++) {
      h.update(DT_MAX);
      frames.push(grab(h));
    }
  });
  let after = 0;
  for (let i = 0; i < 1200 && after < 40; i++) {
    g.update(DT_MAX);
    frames.push(grab(g));
    if (g.snapshot().chapter === 4) after++;
  }
  return frames;
}

const KINDS: readonly RobotKind[] = ['voxxy', 'droid', 'biggy'];

describe('chapter 3 to 4 · the stair beat', () => {
  const frames = film();
  const first = (p: (f: Frame, i: number) => boolean): number => frames.findIndex((f, i) => p(f, i));
  const pressAt = first((f) => f.button === 'done');
  const beltsAt = first((f) => f.swing > 0);
  const homeAt = first((f) => f.swing >= 1);
  const ch4At = first((f) => f.chapter === 4);
  /**
   * The frame the cast is put on its marks at the belt line: the last one under
   * the full black of the gather, before the reveal starts lifting it.
   */
  const placedAt = frames.slice(0, Math.max(0, pressAt)).map((f) => f.fade >= 0.99).lastIndexOf(true);
  const marks = frames[Math.max(0, placedAt)].bots;
  const movedAt = (k: RobotKind): number =>
    first((f, i) => i > placedAt && f.chapter === 3 && Math.hypot(f.bots[k].x - marks[k].x, f.bots[k].y - marks[k].y) > 1);

  it('takes the stick at once and films it: no play frames between the conditions and the hand-over', () => {
    expect(frames[1].phase, 'the player still had the stick after Stephan had everything').toBe('cut');
    for (const f of frames.slice(1, ch4At)) {
      expect(f.phase).toBe('cut');
      expect(f.shot, 'a frame of the stair beat has no directed shot').not.toBeNull();
    }
    expect(placedAt, 'the cast was never placed at the belt line').toBeGreaterThan(0);
  });

  it('Stephan presses the button before the belts go, in plain view', () => {
    expect(pressAt, 'the button was never pressed').toBeGreaterThan(placedAt);
    expect(beltsAt, 'the belts never went').toBeGreaterThan(0);
    expect(pressAt, 'the belts went before Stephan had pressed anything').toBeLessThan(beltsAt);
    // His hand is ON it when it goes, and the black has lifted by then.
    expect(frames[pressAt].reach, 'the button went without his hand on it').toBeGreaterThan(0.8);
    expect(frames[pressAt].fade, 'he pressed it under a black screen').toBe(0);
    // The belts go in the framing shot, not under the climb camera or the fade.
    for (const f of frames.slice(beltsAt, homeAt + 1)) {
      expect(f.shot?.name).toBe('stair-gate');
      expect(f.fade).toBe(0);
    }
  });

  it('the belts are home before anybody climbs, and Biggy goes up last', () => {
    expect(homeAt).toBeGreaterThan(beltsAt);
    const set = KINDS.map((k) => movedAt(k));
    for (const [i, k] of KINDS.entries()) {
      expect(set[i], `${k} never set off`).toBeGreaterThan(0);
      expect(set[i], `${k} set off while a belt was still across the stair`).toBeGreaterThan(homeAt);
    }
    expect(set[2], 'Biggy went up before the lighter two').toBeGreaterThan(Math.max(set[0], set[1]));
  });

  it("rises along the flight step by step: each robot's render height climbs from the lobby to the head", () => {
    const stair = GF.mainStair;
    for (const k of KINDS) {
      const climb = frames.slice(movedAt(k), ch4At).map((f) => f.bots[k]);
      expect(climb.length).toBeGreaterThan(30);
      // From the lobby floor at the belt line...
      expect(climb[0].rise, `${k} did not start on the lobby floor`).toBeCloseTo(LOBBY_RISE_M, 2);
      // ...never down, never a jump of more than a riser between two frames...
      for (let i = 1; i < climb.length; i++) {
        expect(climb[i].rise, `${k} sank on the flight`).toBeGreaterThanOrEqual(climb[i - 1].rise - 1e-9);
        expect(climb[i].rise - climb[i - 1].rise, `${k} jumped a flight in a frame`).toBeLessThan(0.2);
      }
      // ...to most of the way up by the time the black is down.
      const top = climb[climb.length - 1].rise;
      expect(top, `${k} ends the chapter at ${top.toFixed(2)} m, not at the head of the flight`).toBeGreaterThan(MAIN_STAIR_TOP_M - 1.2);
      // And inside the flight's cheeks the whole way: no robot in the balustrade.
      for (const b of climb.filter((q) => q.x < stair.x + stair.w)) {
        expect(b.y - b.r, `${k} is in the north balustrade`).toBeGreaterThan(stair.y + 6);
        expect(b.y + b.r, `${k} is in the south balustrade`).toBeLessThan(stair.y + stair.h - 6);
      }
    }
  });

  it('follows them up from behind and below, and only fades out at the head of the flight', () => {
    const climbing = frames.slice(homeAt, ch4At).filter((f) => f.shot?.name === 'stair-climb');
    expect(climbing.length, 'the camera never followed the climb').toBeGreaterThan(60);
    for (const f of climbing) {
      const s = f.shot as CameraShot;
      const cx = KINDS.reduce((a, k) => a + f.bots[k].x, 0) / 3;
      const hi = Math.max(...KINDS.map((k) => f.bots[k].rise));
      expect(s.eye.x, 'the climb camera is in front of them, not behind').toBeGreaterThan(cx);
      expect(s.eye.h, 'the climb camera is above their heads, not below').toBeLessThan(hi + 2);
      expect(s.look.h, 'the climb camera is not looking at them').toBeGreaterThan(hi - 1);
    }
    // The black comes down only once the leader is near the head.
    const darkAt = first((f, i) => i > homeAt && f.chapter === 3 && f.fade > 0.05);
    const lead = Math.max(...KINDS.map((k) => frames[darkAt].bots[k].rise));
    expect(lead, 'the fade came down mid-flight').toBeGreaterThan(MAIN_STAIR_TOP_M - 1.2);
  });

  it('opens chapter 4 lit, on the first floor, not on a black frame', () => {
    expect(ch4At).toBeGreaterThan(0);
    const end = frames[frames.length - 1];
    expect(end.chapter).toBe(4);
    expect(end.fade, 'chapter 4 is still black a second in').toBeLessThan(0.05);
    expect(end.shot, 'the stair beat still has the camera in chapter 4').toBeNull();
  });
});

/*
 * ...AND THE TOP OF THAT FLIGHT, WHERE CHAPTER 4 PICKS THEM UP.
 *
 * Michele, 29 Sep 2026: *"stairs should not be closed (but robots can't go down).
 * Robots should be pointing to the room."* They stood at the head of the stairs
 * they had just climbed with their backs to Room 8, nose to a rail drawn across
 * the top of the flight — and in the sim nothing stood there at all: a robot drove
 * straight out over a storey of treads and stopped, silently, at the far wall.
 * Now the flight is drawn open, and it is the sim that keeps them off it.
 */
describe('the head of the main staircase, where chapter 4 starts', () => {
  const kinds = ['voxxy', 'droid', 'biggy'] as const;
  const bot = (g: DebugGame, kind: RobotKind) => g.snapshot().bots.find((b) => b.kind === kind)!;

  it('the three of them start facing Room 8, not the stairs behind them', () => {
    const g = createGame({ seed: 5, chapter: 4, cards: false }) as DebugGame;
    g.update(DT_MAX);
    const door = roomDoor(R(8));
    for (const kind of kinds) {
      const b = bot(g, kind);
      const want = Math.atan2(door.cy - b.y, door.cx - b.x);
      const off = Math.abs(Math.atan2(Math.sin(b.face - want), Math.cos(b.face - want)));
      expect(off, `${kind} is not facing Room 8's door`).toBeLessThan(0.1);
      expect(Math.cos(b.face), `${kind} is facing the stairs`).toBeLessThan(0);
    }
  });

  for (const kind of kinds) {
    it(`${kind} cannot walk back down, and says why in its own voice`, () => {
      const g = createGame({ seed: 5, chapter: 4, cards: false }) as DebugGame;
      g.update(DT_MAX);
      g.debug.select(kind);
      const said: string[] = [];
      for (let i = 0; i < 240; i++) {
        g.setStick(1, 0);
        g.update(DT_MAX);
        const t = g.snapshot().toast?.t;
        if (t && !said.includes(t)) said.push(t);
      }
      g.setStick(0, 0);
      const b = bot(g, kind);
      // A step onto the head is fine — the guard is one tread in — and no further.
      expect(b.x + b.r, `${kind} walked out over the flight`).toBeLessThanOrEqual(F1.mainStair.x + 8 + 0.5);
      expect(said.some((t) => t.startsWith(`${b.name}: "`)), `${kind} said nothing about the stairs: ${said.join(' | ')}`).toBe(true);
    });
  }
});
