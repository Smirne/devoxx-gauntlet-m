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

import { DT_MAX, GF, R, circleRect, createGame, roomDoor, type BreakfastState, type DebugGame, type ExpoState, type NightState } from '../src/sim';
import type { Bot, Prop, Rect, Wall } from '../src/sim/types';
import { cabinetDoorDraw, gateSolids, lockDoorSolids } from '../src/render/doors';
import { playToStairGate } from './pilot';

const mk = (chapter: number): DebugGame => createGame({ seed: 20260930, chapter, cards: false });
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

    steps(g, 6);
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
    steps(g, 40);

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
  it('draws the shut barrier and both its posts over solid sim', () => {
    const g = mk(3);
    steps(g, 2);
    for (const r of gateSolids(propOf(g, 'gate'), g.debug.walls())) {
      const c = coverage(r, g.debug.walls());
      expect(c.covered, `the shut gate is drawn over ${c.total - c.covered} unwalled cells at ${r.x},${r.y}`).toBe(
        c.total,
      );
    }
  });

  it('opens over a swing the player can watch, and only then starts the cutscene', () => {
    const g = mk(3);
    steps(g, 2);
    playToStairGate(g);
    const st = g.debug.chapter() as BreakfastState;
    expect(st.gateOpen).toBe(true);
    /*
     * THE TRAP THIS CHAPTER WALKED STRAIGHT INTO.
     *
     * `done()` used to open the gate and start the exit cutscene in the same
     * statement, and `CUT_FADE` is 0.35 s — so the screen would be black before the
     * barrier had moved a degree, and the animation would exist with nobody able to
     * see it. Chapter 1's fire door had the same bug and `FIRE_CUT_DELAY` is what
     * fixed it; `GATE_SWING_TIME + GATE_CUT_DELAY` is the same hold here.
     *
     * `playToStairGate` stops while that hold is still running, so this is the
     * assertion that the hold exists at all: the swing is FINISHED and the chapter
     * is still in `play`, with the fade still down.
     */
    expect(st.gateSwing, 'the barrier never finished swinging').toBe(1);
    expect(g.snapshot().phase, 'the cutscene started before the gate had opened on screen').toBe('play');
    expect(g.snapshot().fade, 'the hall faded out during the swing').toBeLessThan(0.01);
    // ...and it does hand over once the hold is up, rather than hanging on the hall.
    for (let i = 0; i < 200 && g.snapshot().phase === 'play'; i++) g.update(DT_MAX);
    expect(g.snapshot().phase).toBe('cut');
  });

  it('runs its clock from 0 to 1 rather than cutting between two stills', () => {
    const g = mk(3);
    steps(g, 2);
    const gate = (): Prop => propOf(g, 'gate');
    expect(gate().progress, 'the barrier is moving before anyone has opened it').toBe(0);

    const seen: number[] = [];
    playToStairGate(g, (h) => {
      // From the frame `done()` fires, watch the clock rather than the end state.
      for (let i = 0; i < 12; i++) {
        const p = h.snapshot().props.find((o) => o.kind === 'gate');
        seen.push(p?.progress ?? -1);
        h.update(DT_MAX);
      }
    });
    // A dozen frames is 0.4 s of a 1.5 s swing, so every one of them is a pose
    // between the two ends — which is the whole difference between an animation
    // and a cut between two stills.
    expect(seen[0], 'the barrier is already part-open on the frame it is unhooked').toBe(0);
    expect(seen[seen.length - 1], 'the whole swing happened inside half a second').toBeLessThan(1);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `frame ${i} did not advance`).toBeGreaterThan(seen[i - 1]);
    }
    expect(gate().progress, 'and it does land on 1').toBe(1);
  });

  it('puts the swung barrier where the sim has a wall, and gives the flight back', () => {
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

  it('draws no barrier at the stair foot once it is open — the walk-through bug, asserted', () => {
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
