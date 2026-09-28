/**
 * HOW LONG CHAPTER 4 ACTUALLY TAKES, measured rather than felt.
 *
 * Michele, 28 Sep 2026, twice: *"Chapter 4 runs about six minutes"*, then
 * *"measure your run. I'd say 3 minutes?"*
 *
 * What makes this chapter long is not the puzzle, it is the STICK: `stepAll`
 * hands it to the selected robot and zeroes the other two, so three jobs spread
 * across a 30 m room cannot be done in parallel. And the room is not open floor
 * — three seat blocks are walls, so everything happens down two aisles and
 * across the strip behind them. A player walks Voxxy to four spotlights in two
 * different aisles, switches, walks Droid the width of the room twice, switches,
 * shoves the cake in from the corridor and up an aisle, and then puts whoever is
 * left onto the stage. One robot at a time, always.
 *
 * So this drives it exactly that way: one stick, in series, on the robots' own
 * legs, through the room's one door and along the real aisles, with no
 * teleporting anywhere. What comes out is the floor under a real playthrough — a
 * player who knows the solution and never stops to think — and the chapter's
 * pacing budget is asserted against it.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, createGame, type DebugGame } from '../src/sim';
import type { KeynoteState } from '../src/sim/chapters/ch4-keynote';
import { R, roomDoor } from '../src/sim/geometry';
import type { Bot, Prop, RobotKind, Vec2 } from '../src/sim/types';

const SEED = 20260930;
const mk = (): DebugGame => createGame({ seed: SEED, chapter: 4, cards: false }) as DebugGame;
const key = (g: DebugGame): KeynoteState => g.debug.chapter() as KeynoteState;
const bot = (g: DebugGame, k: RobotKind): Bot => g.snapshot().bots.find((b) => b.kind === k) as Bot;
const props = (g: DebugGame, kind: string): Prop[] => g.snapshot().props.filter((p) => p.kind === kind);
const mid = (p: Prop): Vec2 => ({ x: p.x + (p.w ?? 0) / 2, y: p.y + (p.h ?? 0) / 2 });

/**
 * The budget, seconds of sim clock.
 *
 * Michele's own target is three minutes for a run with thinking in it, so the
 * floor — no thinking, no mistakes, no reading — has to come in well under that,
 * or nobody can finish the chapter in three minutes. 150s is half his figure,
 * which leaves a player the other half to be a person in.
 */
const BUDGET = 150;

/** The sim clock, with a hard stop so a stuck drive fails loudly. */
class Clock {
  t = 0;
  step(g: DebugGame): void {
    g.update(DT_MAX);
    this.t += DT_MAX;
    if (this.t > 600) throw new Error('chapter 4 never finished — a drive is stuck');
  }
}

/**
 * Select a robot and walk it to a point on its own stick, the way a player does.
 *
 * The stick steers at the velocity error rather than flat at the target, which
 * is what stops a heavy robot orbiting its mark — the same servo the curtain
 * call uses. Walls are NOT ignored: a route that needs the door goes through the
 * door, and one that walks into a seat block fails the test rather than
 * flattering the measurement.
 */
function walkTo(g: DebugGame, clock: Clock, kind: RobotKind, to: Vec2, reach = 12): void {
  g.debug.select(kind);
  let stall = 0;
  let best = Infinity;
  for (;;) {
    // The last robot onto the stage ends the chapter under its own feet: the
    // house screen wakes up and the curtain call takes the sticks off the
    // player. There is nothing left to drive, and a driver that kept pushing
    // would stall against an animation and call it a stuck robot.
    if (g.snapshot().reel !== null) return;
    const b = bot(g, kind);
    const dx = to.x - b.x;
    const dy = to.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < reach) break;
    if (d < best - 0.05) {
      best = d;
      stall = 0;
    } else stall += DT_MAX;
    if (stall > 4) {
      throw new Error(
        `${kind} is stuck at (${b.x.toFixed(0)},${b.y.toFixed(0)}), ` +
          `${d.toFixed(0)}px from (${Math.round(to.x)},${Math.round(to.y)})`,
      );
    }
    const want = Math.min(1, d / 18) * b.max;
    const ex = (dx / d) * want - b.vx;
    const ey = (dy / d) * want - b.vy;
    const el = Math.hypot(ex, ey) || 1;
    g.setStick(ex / el, ey / el);
    clock.step(g);
  }
  g.setStick(0, 0);
}

describe('chapter 4, driven on one stick', () => {
  it('is solvable well inside three minutes, and says where the time goes', () => {
    const g = mk();
    const clock = new Clock();
    const legs: Array<[string, number]> = [];
    let t0 = 0;

    /*
     * The room, read off what the chapter publishes rather than typed in: the
     * four spotlights give both aisle centres and both ends of the seating, so
     * the routes below re-derive themselves if the room is ever re-laid.
     */
    const spots = props(g, 'spotlight').map(mid);
    const aisleX = [...new Set(spots.map((p) => Math.round(p.x)))].sort((a, b) => a - b);
    /** The strip behind the seating, between the last row and the door. */
    const backY = Math.max(...spots.map((p) => p.y)) + 42;
    /** The strip in front of it, between the first row and the stage. */
    const frontY = Math.min(...spots.map((p) => p.y)) - 42;

    const d8 = roomDoor(R(8));
    const doorOut: Vec2 = { x: d8.cx, y: d8.cy + 18 };
    const doorIn: Vec2 = { x: d8.cx, y: d8.cy - 18 };

    /** Out of whatever aisle you are in, round the back, and up the one you want. */
    function viaBack(k: RobotKind, to: Vec2): void {
      const b = bot(g, k);
      if (Math.abs(b.x - to.x) > 6) {
        if (Math.abs(b.y - backY) > 10) walkTo(g, clock, k, { x: b.x, y: backY }, 10);
        walkTo(g, clock, k, { x: to.x, y: backY }, 10);
      }
      walkTo(g, clock, k, to, 10);
    }

    /*
     * IN THROUGH THE ONE DOOR. They start at the head of the main staircase, out
     * in the corridor; room 8 has a single doorway. Biggy stays outside on
     * purpose — the cake is in the corridor with him, and walking him in first
     * only means walking him straight back out.
     */
    t0 = clock.t;
    for (const k of ['voxxy', 'droid'] as const) {
      walkTo(g, clock, k, doorOut, 10);
      walkTo(g, clock, k, doorIn, 10);
    }
    legs.push(['Voxxy and Droid in through the one door', clock.t - t0]);

    /*
     * VOXXY lights the four spotlights, in the order the chapter demands. Two
     * are at the back of one aisle and the other two at the front of both, so
     * she walks one aisle end to end, crosses, and walks the other.
     */
    t0 = clock.t;
    for (const sp of spots) {
      viaBack('voxxy', sp);
      clock.step(g);
    }
    expect(key(g).spots, 'the spotlights did not all light').toBe(4);
    legs.push(['Voxxy · four spotlights, two aisles', clock.t - t0]);

    /*
     * DROID finishes the #DEVOXX sign (`src/sim/letters.ts`): the O and both X's
     * lean in one stash against the east wing's back wall, and each goes into
     * its own gap at the back of the stage. Up the east aisle, across the front
     * strip into the wing, then three carries — round the FRONT of Stephan and the
     * speaker, who stand beside the sign and are bodies, not scenery.
     *
     * (It was a hook at each end of the room until 28 Sep; the swap was measured
     * here as well as in `tests/letters.test.ts`, and it is the one leg that grew.)
     */
    t0 = clock.t;
    const droidR = bot(g, 'droid').r;
    const hosts = g.snapshot().people.filter((p) => p.role === 'stephan' || p.role === 'speaker');
    /** The lane in front of the two of them, clear of both. */
    const laneY = Math.max(...hosts.map((p) => p.y + p.r)) + droidR + 8;
    const hostX0 = Math.min(...hosts.map((p) => p.x - p.r)) - droidR - 8;
    const hostX1 = Math.max(...hosts.map((p) => p.x + p.r)) + droidR + 8;
    walkTo(g, clock, 'droid', { x: aisleX[1], y: backY }, 10);
    walkTo(g, clock, 'droid', { x: aisleX[1], y: frontY }, 10);
    for (let n = 0; n < 3; n++) {
      const d = bot(g, 'droid');
      const leaning = props(g, 'letter')
        .filter((p) => p.state === 'idle')
        .sort((a, b) => Math.hypot(mid(a).x - d.x, mid(a).y - d.y) - Math.hypot(mid(b).x - d.x, mid(b).y - d.y));
      const l = leaning[0];
      // They lean face out, so he lifts from in front of it.
      walkTo(g, clock, 'droid', { x: hostX1, y: laneY }, 10);
      walkTo(g, clock, 'droid', { x: mid(l).x, y: l.y + (l.h ?? 0) + droidR + 3 }, 5);
      g.key('KeyE');
      clock.step(g);
      expect(key(g).carrying, `Droid did not lift the ${l.label}`).toBe(l.v);
      const gap = props(g, 'letter-slot').find((p) => p.v === l.v);
      expect(gap, `no gap for the ${l.label}`).toBeDefined();
      walkTo(g, clock, 'droid', { x: hostX1, y: laneY }, 10);
      walkTo(g, clock, 'droid', { x: Math.min(mid(gap!).x, hostX0), y: laneY }, 10);
      walkTo(g, clock, 'droid', { x: mid(gap!).x, y: gap!.y + (gap!.h ?? 0) + droidR + 3 }, 6);
      g.key('KeyE');
      clock.step(g);
      expect(key(g).carrying, `the ${l.label} did not go into its gap`).toBe(-1);
    }
    expect(key(g).sign, 'the #DEVOXX sign did not go up').toBe('#DEVOXX');
    legs.push(['Droid · the O and both X\'s, wing to sign', clock.t - t0]);

    /*
     * BIGGY shoves the cake in from the corridor and up the left-hand aisle onto
     * its mark. He has to get BEHIND it for every leg, and the board is slow on
     * purpose — `CRATE_FORCE` against a 20-mass crate with castors that scrub.
     */
    t0 = clock.t;
    const mark = mid(props(g, 'cake-mark')[0]);
    const cakeRoute: Vec2[] = [
      { x: d8.cx, y: d8.cy + 26 },
      { x: d8.cx, y: d8.cy - 26 },
      { x: aisleX[0], y: backY },
      { x: aisleX[0], y: frontY },
      mark,
    ];
    // Round behind the crate first, out in the corridor where he already is.
    const cake0 = mid(props(g, 'cake')[0]);
    walkTo(g, clock, 'biggy', { x: cake0.x + 40, y: cake0.y + 16 }, 14);
    g.debug.select('biggy');
    for (const wp of cakeRoute) {
      let stall = 0;
      let best = Infinity;
      for (;;) {
        if (key(g).cake) break;
        const c = mid(props(g, 'cake')[0]);
        const b = bot(g, 'biggy');
        const ax = wp.x - c.x;
        const ay = wp.y - c.y;
        const al = Math.hypot(ax, ay);
        if (al < 16) break;
        if (al < best - 0.05) {
          best = al;
          stall = 0;
        } else stall += DT_MAX;
        if (stall > 8) throw new Error(`the cake is stuck ${al.toFixed(0)}px from (${Math.round(wp.x)},${Math.round(wp.y)})`);
        /*
         * Stand behind the crate on the line to the waypoint, then lean. The
         * standing point is the two radii plus a little — aimed any closer it is
         * inside the crate, `botsCollide` keeps pushing him back out, and a naive
         * driver spends the whole chapter walking at a point it cannot reach.
         */
        const back = b.r + 17 + 8;
        const behind = { x: c.x - (ax / al) * back, y: c.y - (ay / al) * back };
        const gx = behind.x - b.x;
        const gy = behind.y - b.y;
        const gd = Math.hypot(gx, gy);
        if (gd > 16) g.setStick(gx / gd, gy / gd);
        else g.setStick(ax / al, ay / al);
        clock.step(g);
      }
      g.setStick(0, 0);
      if (key(g).cake) break;
    }
    expect(key(g).cake, 'the cake never reached its mark').toBe(true);
    legs.push(['Biggy · the cake in from the corridor', clock.t - t0]);
    expect(key(g).ready, 'the stage never came ready').toBe(true);

    /*
     * ...and then whoever is not already on the stage walks onto it. Michele,
     * 28 Sep: *"robots should end on stage by the tasks (voxxy excluded)"* — so
     * this leg is the one meant to survive, and it is measured on its own.
     */
    t0 = clock.t;
    const stage = props(g, 'stage')[0];
    const sy = stage.y + (stage.h ?? 0) / 2;
    const onStage = (b: Bot): boolean =>
      b.x >= stage.x && b.x <= stage.x + (stage.w ?? 0) && b.y >= stage.y && b.y <= stage.y + (stage.h ?? 0);
    /*
     * Three marks in the clear band of the apron — about 80 px of it, between
     * the cake parked on its own mark at the western end and Stephan and the
     * speaker standing at the eastern one, all three of which are bodies that
     * shove a robot off any mark within a radius of them. Each robot comes up
     * to the front strip first and crosses along it: one cutting the corner
     * from the east walks straight through Stephan, and one cutting up out of
     * an aisle walks into a seat block. Westmost first, so that nobody has to
     * walk round somebody already standing on a mark.
     */
    const marks: Array<[RobotKind, Vec2]> = [
      ['biggy', { x: stage.x + 68, y: sy }],
      ['voxxy', { x: stage.x + 98, y: sy }],
      ['droid', { x: stage.x + 124, y: sy }],
    ];
    for (const [k, to] of marks) {
      if (onStage(bot(g, k))) continue;
      const b = bot(g, k);
      if (b.y > frontY + 4) walkTo(g, clock, k, { x: b.x, y: frontY }, 10);
      walkTo(g, clock, k, { x: to.x, y: frontY }, 10);
      walkTo(g, clock, k, to, 8);
    }
    clock.step(g);
    legs.push(['everyone onto the stage', clock.t - t0]);

    expect(g.snapshot().reel, 'the chapter never reached its ending').not.toBeNull();

    // eslint-disable-next-line no-console
    console.log(
      '\nchapter 4, one stick, no thinking:\n' +
        legs.map(([n, secs]) => `  ${secs.toFixed(1).padStart(6)}s  ${n}`).join('\n') +
        `\n  ${clock.t.toFixed(1).padStart(6)}s  TOTAL, + ${Math.round(g.snapshot().reel?.len ?? 0)}s of video\n`,
    );

    expect(clock.t, 'chapter 4 has grown past its pacing budget').toBeLessThan(BUDGET);
  });
});
