/**
 * THE OTHER THREE DOORS — animated, and solid where they end up.
 *
 * Michele, mid-playtest, for the second time: **"And an animation for the door
 * opening."** Chapter 1's fire door (`tests/fire-door.test.ts`) and chapter 2's
 * roller shutter (`tests/roller-door.test.ts`) were already done, so an audit ran
 * over every `removeWall` in `src/sim/chapters` and every door-ish kind in
 * `PROPS`. It found three more that changed from shut to open between two frames:
 *
 *  - **cinema B's magnetic lock** — `ch1-night.ts` removed the `lock` wall on the
 *    frame Droid reached the projector panel and `props()` stopped publishing the
 *    prop in the same frame. The payoff of the whole mount beat was a door that
 *    did not open, it ceased to exist, in silence.
 *  - **the router cabinet** — `drawCabinet` cut straight to a 4.32 m leaf standing
 *    at 58°, lying 3.7 m out across the technical room's floor with no collider
 *    under a square centimetre of it.
 *  - **the registration gate at the foot of the main staircase** — `done()` called
 *    `ctx.removeWall(gate)` and went on publishing a `gate` prop, which
 *    `PROPS.gate` drew as a 1.1 m box across the stair foot, with a SECOND static
 *    gate drawn in the same place by `buildVenue()` underneath it. Un-animated,
 *    walk-through and duplicated. It was flagged during the roller round and
 *    explicitly left for somebody else.
 *
 * What is asserted here is the contract all five doors are now under, and it is
 * the one `src/render/doors.ts`'s header sets out:
 *
 *  1. the SIM owns the clock: `Prop.progress` leaves 0, climbs, and lands on 1;
 *  2. the leaf is posed from the chapter's LIVE wall list, so a door the sim has
 *     opened cannot be drawn shut and a door the sim has sealed cannot be drawn
 *     open;
 *  3. an open door is a collider WHERE IT ENDS UP. Every rect the renderer draws
 *     in the robot band, in both settled states, has a wall under it.
 *
 * The drawn geometry comes from `src/render/doors.ts`, the same module `scene.ts`
 * draws from, so passing here and looking right on screen are the same fact.
 *
 * Mid-swing is excluded on purpose: a leaf between its two ends is a moving solid
 * and the sim does not carry moving solids. Each test drives the door to a settled
 * state before it measures — the same licence the other two doors take.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, GF, R, circleRect, createGame, entranceBayGaps, entranceLeaves, roomDoor, type BreakfastState, type DebugGame, type ExpoState, type NightState } from '../src/sim';
import type { Bot, Person, Prop, Rect, Wall } from '../src/sim/types';
import { cabinetDoorDraw, gateSolids, lockDoorSolids } from '../src/render/doors';
import { finishChapter2, openFrontDoors, playToStairGate } from './pilot';

const mk = (chapter: number): DebugGame => createGame({ seed: 20260930, chapter, cards: false });
/** Frames for Droid's reach to the projector panel's lever, before cinema B's leaf moves. */
const LEVER_STEPS = Math.ceil(0.75 / DT_MAX);
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};
const propOf = (g: DebugGame, kind: string, at?: (p: Prop) => boolean): Prop => {
  const p = g.snapshot().props.find((o) => o.kind === kind && (at?.(o) ?? true));
  if (!p) throw new Error(`no ${kind} prop`);
  return p;
};

/**
 * Is every point of `r` inside some wall?
 *
 * Sampled on the same 2 px lattice `tests/colliders.test.ts` walks — 16 cm, finer
 * than any gap a robot could use — and asked of the CORNERS too, because a leaf
 * that is covered in the middle and not at its ends is exactly how the fire door's
 * bug looked from a distance.
 */
function coverage(r: Rect, walls: readonly Wall[]): { covered: number; total: number; holes: Array<[number, number]> } {
  const holes: Array<[number, number]> = [];
  let covered = 0;
  let total = 0;
  for (let x = r.x; x <= r.x + r.w + 1e-9; x = Math.min(x + 2, r.x + r.w) + (x + 2 >= r.x + r.w ? 1e-6 : 0)) {
    for (let y = r.y; y <= r.y + r.h + 1e-9; y = Math.min(y + 2, r.y + r.h) + (y + 2 >= r.y + r.h ? 1e-6 : 0)) {
      total++;
      const hit = walls.some((w) => x >= w.x - 1e-9 && x <= w.x + w.w + 1e-9 && y >= w.y - 1e-9 && y <= w.y + w.h + 1e-9);
      if (hit) covered++;
      else if (holes.length < 6) holes.push([x, y]);
    }
  }
  return { covered, total, holes };
}

/** Can this robot's centre rest inside `r` without any wall pushing it out? */
function standableIn(r: Rect, walls: readonly Wall[], b: Bot): [number, number] | null {
  for (let x = r.x; x <= r.x + r.w; x += 1) {
    for (let y = r.y; y <= r.y + r.h; y += 1) {
      if (!walls.some((w) => (w.skipFor?.(b) !== true) && circleRect({ x, y, r: b.r }, w))) return [x, y];
    }
  }
  return null;
}

/* ============================================ chapter 1 · cinema B's maglock */

/** Droid on Biggy's shoulders, at the projector panel — the only way B opens. */
function releaseCinemaB(g: DebugGame): void {
  const panel = propOf(g, 'projector-panel');
  const at = { x: panel.x + (panel.w ?? 20) / 2, y: panel.y + (panel.h ?? 24) / 2 };
  g.debug.place('biggy', at.x, at.y + 30);
  g.debug.place('droid', at.x, at.y + 30);
  g.debug.select('droid');
  g.update(DT_MAX);
  g.key('KeyE');
  expect((g.debug.chapter() as NightState & { panelOn: boolean }).panelOn, 'Droid never climbed on').toBe(false);
  g.key('KeyE');
}

describe("chapter 1 · cinema B's door opens instead of vanishing", () => {
  it('runs a swing clock from 0 to 1 once the projector panel is pressed', () => {
    const g = mk(1);
    steps(g, 2);
    const bDoor = (): Prop => {
      const d = roomDoor(R('B'));
      return propOf(g, 'lock', (p) => Math.abs(p.x - d.x) < 1);
    };
    // Shut, it is published, it is at the doorway, and its clock has not started.
    expect(bDoor().state).toBe('shut');
    expect(bDoor().progress).toBe(0);

    releaseCinemaB(g);
    expect((g.debug.chapter() as NightState).panelOn, 'the release was never reached').toBe(true);
    // It is STILL PUBLISHED. This is the bug in one line: it used to leave the prop
    // list on this frame, so there was nothing left to animate.
    expect(bDoor().state).toBe('open');
    expect(bDoor().progress).toBe(0);

    // The leaf waits for Droid's hand to reach the lever (0.75 s, `LEVER_REACH_TIME`
    // in ch1-night.ts — Michele, 28 Sep: "the door should start opening only
    // after the lever is pulled"), and stays shut until then.
    steps(g, 10);
    expect(bDoor().progress, 'the door opened before the lever was pulled').toBe(0);
    steps(g, LEVER_STEPS);
    const mid = bDoor().progress ?? 0;
    expect(mid, 'the leaf jumped straight to open').toBeGreaterThan(0);
    expect(mid, 'the leaf finished before a single frame of it could be seen').toBeLessThan(1);

    steps(g, 40);
    expect(bDoor().progress, 'the leaf never settles').toBe(1);
  });

  it('puts the leaf where the sim has a wall, shut and open, and opens the doorway', () => {
    const g = mk(1);
    steps(g, 2);
    const d = roomDoor(R('B'));
    const bDoor = (): Prop => propOf(g, 'lock', (p) => Math.abs(p.x - d.x) < 1);
    const walls = (): Wall[] => g.debug.walls();

    // SHUT: the leaf fills the doorway and the doorway is solid.
    for (const r of lockDoorSolids(bDoor(), walls())) {
      const c = coverage(r, walls());
      expect(c.covered, `a shut leaf at ${r.x},${r.y} is drawn over ${c.total - c.covered} unwalled cells`).toBe(c.total);
    }

    releaseCinemaB(g);
    steps(g, 40 + LEVER_STEPS);

    // OPEN: the leaf is against the inside of the auditorium wall and has a wall
    // under it there — and the doorway it came out of is now clear.
    for (const r of lockDoorSolids(bDoor(), walls())) {
      const c = coverage(r, walls());
      expect(
        c.covered,
        `the open leaf at ${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.w}x${r.h} has no wall under ` +
          `${c.holes.map(([x, y]) => `${x},${y}`).join(' ')} — an open door is a collider where it ENDS UP`,
      ).toBe(c.total);
    }
    const voxxy = g.snapshot().bots[0] as Bot;
    const doorway: Rect = { x: d.x + 10, y: d.y, w: d.w - 20, h: d.h };
    expect(standableIn(doorway, walls(), voxxy), 'cinema B never actually opened').not.toBeNull();
  });
});

/* =========================================== chapter 2 · the router cabinet */

/** Biggy puts his shoulder into the cabinet. */
function openCabinet(g: DebugGame): void {
  g.debug.select('biggy');
  g.debug.place('biggy', GF.cabinet.x + GF.cabinet.w / 2, GF.cabinet.y + GF.cabinet.h + 32);
  g.key('KeyE');
}

describe('chapter 2 · the router cabinet is walked open', () => {
  it('runs a swing clock, and both leaves land on a wall', () => {
    const g = mk(2);
    steps(g, 2);
    const cab = (): Prop => propOf(g, 'cabinet');
    expect(cab().progress).toBe(0);
    // Shut, nothing is drawn in front of the carcass at all.
    expect(cabinetDoorDraw(cab(), 0).leaves.every((l) => l.rect.h <= 4)).toBe(true);

    openCabinet(g);
    expect((g.debug.chapter() as ExpoState).router.cabinetOpen, 'Biggy never opened it').toBe(true);
    expect(cab().progress).toBe(0);

    steps(g, 8);
    const mid = cab().progress ?? 0;
    expect(mid, 'the doors jumped straight open').toBeGreaterThan(0);
    expect(mid, 'the doors were open before anybody could see them move').toBeLessThan(1);

    steps(g, 60);
    expect(cab().progress).toBe(1);

    const walls = g.debug.walls();
    for (const l of cabinetDoorDraw(cab(), 1).leaves) {
      const c = coverage(l.rect, walls);
      expect(
        c.covered,
        `an open cabinet leaf at ${l.rect.x.toFixed(0)},${l.rect.y.toFixed(0)} has no wall under ` +
          `${c.holes.map(([x, y]) => `${x},${y}`).join(' ')}`,
      ).toBe(c.total);
    }
  });

  it('leaves the terminal between the two leaves reachable, which is why there are two', () => {
    const g = mk(2);
    steps(g, 2);
    openCabinet(g);
    steps(g, 60);
    const walls = g.debug.walls();
    const biggy = g.snapshot().bots[2] as Bot;
    // `TERMINAL_REACH` in `ch2-expo.ts` is 54 px from the cabinet's south face.
    const at = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };
    let found: [number, number] | null = null;
    for (let y = at.y + 10; y < at.y + 50 && !found; y += 1) {
      for (let x = at.x - 40; x < at.x + 40 && !found; x += 1) {
        if (Math.hypot(x - at.x, y - at.y) >= 54) continue;
        if (!walls.some((w) => (w.skipFor?.(biggy) !== true) && circleRect({ x, y, r: biggy.r }, w))) found = [x, y];
      }
    }
    expect(found, 'the open cabinet doors have sealed their own terminal off').not.toBeNull();
  });
});

/* ============================================= chapter 3 · the stair gate */

describe('chapter 3 · Stephan opens the stairs instead of the gate blinking out', () => {
  it('draws the shut line — nine posts and eight belts — over solid sim', () => {
    const g = mk(3);
    steps(g, 2);
    for (const r of gateSolids(propOf(g, 'gate'), g.debug.walls())) {
      const c = coverage(r, g.debug.walls());
      expect(c.covered, `the shut line is drawn over ${c.total - c.covered} unwalled cells at ${r.x},${r.y}`).toBe(
        c.total,
      );
    }
  });

  it('opens inside the stair beat, in shot and with the black lifted, and only then climbs', () => {
    const g = mk(3);
    steps(g, 2);
    playToStairGate(g);
    const st = g.debug.chapter() as BreakfastState;
    expect(st.gateOpen).toBe(true);
    /*
     * THE TRAP THIS CHAPTER WALKED STRAIGHT INTO, and where the fix moved to.
     *
     * `done()` used to open the gate and start the exit cutscene in the same
     * statement, and `CUT_FADE` is 0.35 s — so the screen would be black before the
     * barrier had moved a degree. The first fix held the hall in `play` for the
     * swing. Michele's storyboard (29 Sep) put the swing INSIDE the cutscene
     * instead: the black comes and goes first, the cast is at the belt line, and
     * the wave runs in the stair beat's own framing.
     *
     * `playToStairGate` stops on the frame the last belt is home, so this is the
     * assertion that it happened on screen: the wave is FINISHED, the black has
     * lifted, and the camera is still on the barrier rather than on the climb.
     */
    expect(st.gateSwing, 'the wave never got through all eight belts').toBe(1);
    expect(g.snapshot().phase, 'the player still has the stick during the stair beat').toBe('cut');
    expect(g.snapshot().fade, 'the belts wound in under a black screen').toBeLessThan(0.01);
    expect(g.snapshot().shot?.name, 'the camera left the barrier before the belts were home').toBe('stair-gate');
    // ...and it does go on to the climb, rather than hanging on the barrier.
    for (let i = 0; i < 60 && g.snapshot().shot?.name === 'stair-gate'; i++) g.update(DT_MAX);
    expect(g.snapshot().shot?.name).toBe('stair-climb');
  });

  it('runs its clock from 0 to 1 rather than cutting between two stills', () => {
    const g = mk(3);
    steps(g, 2);
    const gate = (): Prop => propOf(g, 'gate');
    expect(gate().progress, 'the barrier is moving before anyone has opened it').toBe(0);

    const seen: number[] = [];
    playToStairGate(g, (h) => {
      // From the frame the first belt lets go — after Stephan's walk to his button
      // and the press — watch the clock rather than the end state.
      for (let i = 0; i < 200 && (h.snapshot().props.find((o) => o.kind === 'gate')?.progress ?? 0) === 0; i++) h.update(DT_MAX);
      for (let i = 0; i < 12; i++) {
        const p = h.snapshot().props.find((o) => o.kind === 'gate');
        seen.push(p?.progress ?? -1);
        h.update(DT_MAX);
      }
    });
    // A dozen frames is 0.4 s of a 1.5 s swing, so every one of them is a pose
    // between the two ends — which is the whole difference between an animation
    // and a cut between two stills.
    expect(seen[0], 'the barrier jumped open on the frame it started').toBeLessThan(0.05);
    expect(seen[seen.length - 1], 'the whole swing happened inside half a second').toBeLessThan(1);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `frame ${i} did not advance`).toBeGreaterThan(seen[i - 1]);
    }
    expect(gate().progress, 'and it does land on 1').toBe(1);
  });

  it('leaves nothing drawn without a wall under it, and gives the flight back', () => {
    const g = mk(3);
    steps(g, 2);
    playToStairGate(g);
    const walls = g.debug.walls();
    const gate = propOf(g, 'gate');
    expect(gate.state).toBe('open');

    for (const r of gateSolids(gate, walls)) {
      const c = coverage(r, walls);
      expect(
        c.covered,
        `the open gate draws ${c.total - c.covered} cells with no wall under them, at ` +
          `${c.holes.map(([x, y]) => `${x},${y}`).join(' ')} — an open door is a collider where it ENDS UP, ` +
          'never a slab across the hole it has just made and never nothing at all',
      ).toBe(c.total);
    }

    // And the point of opening it: the foot of the flight is walkable, for the
    // widest robot in the game, up the middle where the transition walks.
    const biggy = g.snapshot().bots[2] as Bot;
    const mouth: Rect = { x: GF.mainStair.x + 26, y: GF.gate.y - 6, w: GF.mainStair.w - 52, h: 24 };
    expect(standableIn(mouth, walls, biggy), 'Stephan opened the gate and the stairs are still shut').not.toBeNull();
  });

  it('draws no belt across the stair foot once it is open — the walk-through bug, asserted', () => {
    const g = mk(3);
    steps(g, 2);
    playToStairGate(g);
    /*
     * `PROPS.gate` used to draw a 1.1 m box at `GF.gate` whatever the state said,
     * so a gate the sim had already removed was still a solid across its own
     * opening — except that it was not solid, because the collider had gone. This
     * is that measurement: nothing the renderer draws for the gate may sit in the
     * doorway any more.
     */
    const across = gateSolids(propOf(g, 'gate'), g.debug.walls()).filter(
      (r) => r.x < GF.gate.x + GF.gate.w - 20 && r.x + r.w > GF.gate.x + 20 && r.h < 20,
    );
    expect(across, 'the open gate is still drawn lying across the stair foot').toEqual([]);
  });
});

/* ============================================= chapter 2 · the front doors */

/** Chapter 2 with every job done, up to the E at the front doors. */
function toTheFrontDoors(): DebugGame {
  const g = mk(2);
  steps(g, 1);
  finishChapter2(g);
  expect(openFrontDoors(g, 'voxxy', false, false), 'the bolts never went back').toBe(true);
  return g;
}

/**
 * THE FRONT DOORS OPEN FROM THE INSIDE, ON STEPHAN.
 *
 * Michele, 29 Sep 2026: *"Transition between chap2 and 3 needs to change. Robots
 * exit the doors, but next chapter is inside. Let them regroup before the door,
 * then they open, Stephan is outside and enters (pats voxxy?)"*. So the order is
 * the thing under test: the three of them in front of the doors first, THEN the
 * leaves, THEN him — and nobody going out.
 */
describe('chapter 2 · the front doors open on Stephan', () => {
  it('keeps the leaves shut until the three of them are regrouped inside, then swings them to 1', { timeout: 30000 }, () => {
    const g = toTheFrontDoors();
    const e = GF.entrance;
    const door = (): Prop => propOf(g, 'entrance-doors');
    const shutWalls = (): number => g.debug.walls().filter((w) => w.kind === 'entrance-shut').length;
    // The E throws the bolts. It does not open the doors: nobody is at them yet.
    expect(door().progress, 'the doors swung on the E, before anyone was in front of them').toBe(0);
    expect(shutWalls(), 'the shut leaves stopped being walls before they moved').toBe(3);

    let last = 0;
    let first: { fade: number; phase: string; bots: Array<{ kind: string; x: number; y: number; r: number }> } | null = null;
    let underBlack = -1;
    const between: number[] = [];
    for (let i = 0; i < Math.ceil(15 / DT_MAX) && g.snapshot().chapter === 2; i++) {
      g.update(DT_MAX);
      const s = g.snapshot();
      if (s.chapter !== 2) break;
      const p = door().progress ?? 0;
      expect(p, 'the doors swung back').toBeGreaterThanOrEqual(last);
      last = p;
      if (p > 0 && !first) first = { fade: s.fade, phase: s.phase, bots: s.bots.map((b) => ({ kind: b.kind, x: b.x, y: b.y, r: b.r })) };
      if (p > 0 && p < 1) between.push(p);
      // A leaf that has moved is not a wall across its bay any more — and one that
      // has not is, all the way through the black the cast is regrouped under.
      if (p > 0) expect(shutWalls(), `a wall still stands across a bay with the leaves at ${p.toFixed(2)}`).toBe(0);
      if (underBlack < 0 && s.fade >= 0.99) underBlack = shutWalls();
      // ...and chapter 3 happens indoors: nobody walks out through them.
      if (s.phase === 'cut' && s.fade < 0.99) {
        for (const b of s.bots) expect(b.x + b.r, `${b.kind} went out through the front doors`).toBeLessThanOrEqual(e.x);
      }
    }
    expect(underBlack, 'the shut leaves stopped being walls before the regroup').toBe(3);
    expect(first, 'the doors never swung').not.toBeNull();
    expect(first!.phase, 'the doors swung in play, not in the let-in').toBe('cut');
    expect(first!.fade, 'the doors swung under the black, where nobody could see them regroup first').toBeLessThan(0.2);
    // Regrouped: all three in the hall, within 3.2 m of the doors' inner face.
    for (const b of first!.bots) {
      expect(b.x + b.r, `${b.kind} was not inside when the doors opened`).toBeLessThanOrEqual(e.x);
      expect(b.x, `${b.kind} was not at the doors when they opened`).toBeGreaterThan(e.x - 40);
      expect(b.y, `${b.kind} was not in front of the doors when they opened`).toBeGreaterThan(e.y - 40);
      expect(b.y, `${b.kind} was not in front of the doors when they opened`).toBeLessThan(e.y + e.h);
    }
    // A swing, not a cut between two stills — and it lands open.
    expect(between.length, 'the leaves jumped open').toBeGreaterThan(10);
    expect(last, 'the doors never finished opening').toBe(1);
    expect(g.snapshot().chapter, 'chapter 2 never handed over').toBe(3);
  });

  it('walks Stephan in from the forecourt through a bay, pats Voxxy, and leaves him on his chapter-3 mark', { timeout: 30000 }, () => {
    const g = toTheFrontDoors();
    const e = GF.entrance;
    expect(g.snapshot().people, 'Stephan is in the hall before anybody has let him in').toEqual([]);
    const gaps = entranceBayGaps();
    // As far out onto the forecourt as a leaf reaches, swinging or open.
    const reach = Math.max(...entranceLeaves().map((l) => l.x + l.w));

    let firstAt: { x: number; y: number; r: number } | null = null;
    let last: Person | null = null;
    let crossed = false;
    let patted = false;
    let said = '';
    const nearest = { voxxy: Infinity, droid: Infinity, biggy: Infinity };
    for (let i = 0; i < Math.ceil(15 / DT_MAX) && g.snapshot().chapter === 2; i++) {
      g.update(DT_MAX);
      const s = g.snapshot();
      if (s.chapter !== 2) break;
      said = s.toast?.t.includes('pats Voxxy') ? s.toast.t : said;
      const st = s.people.find((p) => p.role === 'stephan');
      if (!st) continue;
      firstAt ??= { x: st.x, y: st.y, r: st.r };
      last = st;
      // Through the doorway — the facade's depth and the leaves standing open
      // outside it — he is inside one bay's clear gap, and the doors are open.
      if (st.x + st.r > e.x && st.x - st.r < reach) {
        crossed ||= st.x < e.x;
        const bay = gaps.find(([y0, y1]) => st.y - st.r >= y0 && st.y + st.r <= y1);
        expect(bay, `Stephan walked into the glazing at ${st.x.toFixed(1)},${st.y.toFixed(1)}`).toBeDefined();
        expect(propOf(g, 'entrance-doors').progress, 'Stephan walked through a door that was still swinging').toBe(1);
      }
      for (const b of s.bots) {
        // Centre to centre for Voxxy, whom he pats; body to body for the other two.
        const k = b.kind as keyof typeof nearest;
        const d = Math.hypot(b.x - st.x, b.y - st.y);
        nearest[k] = Math.min(nearest[k], b.kind === 'voxxy' ? d : d - st.r - b.r);
        // The pat: standing still beside her, his hand out, and she is looking at him.
        if (b.kind === 'voxxy' && (st.reach ?? 0) > 0.5) {
          expect(st.speed ?? 0, 'Stephan patted her on the move').toBe(0);
          expect(Math.hypot(b.x - st.x, b.y - st.y), 'Stephan reached for Voxxy from across the room').toBeLessThan(12);
          const look = Math.atan2(st.y - b.y, st.x - b.x);
          expect(Math.abs(Math.atan2(Math.sin(look - b.face), Math.cos(look - b.face))), 'Voxxy was not looking at him').toBeLessThan(0.35);
          patted = true;
        }
      }
    }
    expect(firstAt, 'Stephan never came').not.toBeNull();
    expect(firstAt!.x - firstAt!.r, 'Stephan started inside, not out on the forecourt').toBeGreaterThan(e.x + e.w);
    expect(crossed, 'Stephan never came in through the doors').toBe(true);
    expect(patted, 'Stephan never patted Voxxy').toBe(true);
    expect(said, 'the pat went unsaid').toContain('Stephan');
    // Nearer than arm's length only to pat her, and no nearer than the pat: 0.76 m.
    expect(nearest.voxxy, 'Stephan walked through Voxxy').toBeGreaterThan(9.5);
    expect(nearest.droid, 'Stephan walked through Droid').toBeGreaterThan(0);
    expect(nearest.biggy, 'Stephan walked through Biggy').toBeGreaterThan(0);

    // ...and chapter 3 finds him where the let-in left him, as the same man.
    expect(g.snapshot().chapter, 'chapter 2 never handed over').toBe(3);
    const his = g.snapshot().people.find((p) => p.role === 'stephan');
    expect(his, 'chapter 3 has no Stephan').toBeDefined();
    expect(Math.hypot(last!.x - his!.x, last!.y - his!.y), 'Stephan jumped between the chapters').toBeLessThan(0.5);
    expect(Math.abs(Math.atan2(Math.sin((last!.face ?? 0) - (his!.face ?? 0)), Math.cos((last!.face ?? 0) - (his!.face ?? 0)))), 'Stephan turned between the chapters').toBeLessThan(0.05);
    for (const k of ['colour', 'collar', 'glasses', 'mic', 'lanyard', 'seed', 'name'] as const) {
      expect(last![k], `Stephan's ${k} changed between the chapters`).toEqual(his![k]);
    }
  });
});
