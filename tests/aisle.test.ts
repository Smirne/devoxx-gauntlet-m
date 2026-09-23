/**
 * Cinema E's aisle — the gate that had quietly stopped being one.
 *
 * Michele, chapter 1: *"Biggy can now walk the aisle. I think the whole point was
 * he cannot."* He was right and it was my doing. The 23 Sep rescale measured the
 * robots' radii off the rigs, Biggy's body went from 2.72 m across to 1.44 m, and
 * this aisle stayed at the 2.4 m it was sized to when he was the wider robot. He
 * asked for the geometry to move to meet the rule rather than the rule to be
 * re-asserted.
 *
 * ## Why these tests exist as well as the width
 *
 * A width alone is a number somebody will change. What has to hold is the BEAT:
 * Voxxy and Droid walk down to the alcove, Biggy cannot follow, and his flood
 * bounces off the screen to reach a clue he can never stand next to. So these
 * tests drive the robots with the stick rather than teleporting them, and they
 * measure the clue against REACHABLE ground rather than against a placed pose.
 *
 * That distinction is the whole point. `chapters.test.ts`'s end-to-end solve was
 * green for months with Biggy teleported to a spot that, at 1.2 m of aisle, no
 * player could reach — a passing test describing an unplayable solution.
 */

import { describe, expect, it } from 'vitest';

import {
  DT_MAX,
  circleRect,
  clueLitBy,
  createGame,
  type Bot,
  type DebugGame,
  type NightState,
  type RobotKind,
  type Wall,
} from '../src/sim';

const SEED = 20260930;

const mk = (): DebugGame => createGame({ seed: SEED, chapter: 1, cards: false });

const night = (g: DebugGame): NightState => g.debug.chapter() as NightState;

const bot = (g: DebugGame, kind: RobotKind): Bot => {
  const b = g.snapshot().bots.find((o) => o.kind === kind);
  if (!b) throw new Error(`no ${kind}`);
  return b;
};

/** The aisle, read off the drawn seat rows rather than hard-coded from the source. */
function aisleGap(g: DebugGame): { x0: number; x1: number; rowY0: number; rowY1: number } {
  const rows = g.snapshot().props.filter((p) => p.kind === 'seatrow');
  expect(rows.length).toBeGreaterThan(0);
  const ys = rows.map((r) => r.y);
  const front = Math.min(...ys);
  const onFront = rows.filter((r) => r.y === front).sort((a, b) => a.x - b.x);
  expect(onFront.length).toBeGreaterThan(1);
  return {
    x0: onFront[0].x + (onFront[0].w ?? 0),
    x1: onFront[1].x,
    rowY0: front,
    rowY1: Math.max(...ys),
  };
}

/**
 * Every cell a robot can actually walk to, on a 3 px lattice.
 *
 * Gates a chapter opens later are treated as open — the projector-panel lock, the
 * jammed door, the fire door. Measuring from frame one instead would say cinema E
 * is unreachable for everybody, which is true and useless: behind a gate is
 * exactly where an unwalkable puzzle hides longest.
 */
const G = 3;
function reachable(walls: Wall[], b: Bot, from: { x: number; y: number }): Set<number> {
  const key = (ix: number, iy: number): number => iy * 1000 + ix;
  const free = (ix: number, iy: number): boolean => {
    const x = ix * G;
    const y = iy * G;
    if (x < 0 || y < 0 || x > 1900 || y > 700) return false;
    const c = { x, y, r: b.r };
    for (const w of walls) {
      if (w.skipFor && w.skipFor(b)) continue;
      if (w.onHit) continue;
      if (w.kind && /^(lock|firedoor|jammed|shut)$/.test(w.kind)) continue;
      if (circleRect(c, w)) return false;
    }
    return true;
  };
  const seen = new Set<number>();
  const start: [number, number] = [Math.round(from.x / G), Math.round(from.y / G)];
  if (!free(start[0], start[1])) return seen;
  seen.add(key(start[0], start[1]));
  const q: Array<[number, number]> = [start];
  while (q.length) {
    const [ix, iy] = q.pop() as [number, number];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = ix + dx;
      const ny = iy + dy;
      const k = key(nx, ny);
      if (seen.has(k) || !free(nx, ny)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

describe("cinema E's aisle", () => {
  it('is a real cinema aisle, and sits in the only window that gates Biggy alone', () => {
    const g = mk();
    const { x0, x1 } = aisleGap(g);
    const w = x1 - x0;
    expect(w).toBe(15);

    // Droid fits with room to steer; Biggy does not fit at all. There is no third
    // width that would also separate Droid from Voxxy — that window is 10 to 12 px
    // and leaves her under 10 cm a side, which is threading a needle, not a gate.
    expect(w).toBeGreaterThan(2 * bot(g, 'droid').r + 2);
    expect(w).toBeLessThan(2 * bot(g, 'biggy').r);
  });

  it('lets the two small robots walk to the screen and stops Biggy at the back', () => {
    const g0 = mk();
    const { x0, x1, rowY0, rowY1 } = aisleGap(g0);
    const lane = (x0 + x1) / 2;

    for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
      // Driven, not teleported, and started three pixels off the centre line —
      // nobody lines an aisle up by eye any better than that.
      for (const off of [0, 3]) {
        const g = mk();
        g.debug.select(kind);
        g.debug.place(kind, lane + off, rowY1 + 40);
        g.setStick(0, -1);
        let reached = Infinity;
        for (let i = 0; i < 300; i++) {
          g.update(DT_MAX);
          reached = Math.min(reached, bot(g, kind).y);
        }
        if (kind === 'biggy') {
          expect(reached, `Biggy walked into the seating (off ${off})`).toBeGreaterThan(rowY1);
        } else {
          expect(reached, `${kind} could not get down the aisle (off ${off})`).toBeLessThan(rowY0);
        }
      }
    }
    /*
     * An explicit timeout, because vitest's default is 5 s and this walks six
     * 300-step routes through a chapter's full wall list. It came in at 1.9 s on
     * an idle machine and failed at 5.3 s while a build was running beside it —
     * a timeout, not a wrong answer, which is the worst kind of red because it
     * looks like a regression.
     */
  }, 30000);

  /*
   * THE BEAT ITSELF.
   *
   * The clue in the exit alcove needs all three lamps at once, and Biggy is shut
   * out of the room's aisle — so his blue has to arrive off the screen, which is
   * this chapter's mirror. This measures that against ground he can stand on,
   * which is the check the end-to-end solve cannot make because it teleports.
   */
  it('still leaves every robot somewhere it can STAND and light the alcove clue', () => {
    const g = mk();
    g.update(DT_MAX);
    const walls = g.debug.walls();
    const clue = night(g).clues[3];
    expect(clue.need.slice().sort()).toEqual(['biggy', 'droid', 'voxxy']);

    /*
     * WANT is a floor, not a census, and the sweep stops the moment it clears it.
     *
     * Counting every lighting pose in the room is the honest measurement and it
     * costs four minutes here, because each pose rebuilds the chapter's whole
     * visibility-polygon set. The question this test asks is only "is there a
     * FINDABLE place, or a needle" — so it counts to WANT and stops. A full census
     * belongs in a throwaway probe, and one was run when the aisle was narrowed:
     * Voxxy 1778 spots, Droid 401, Biggy 539.
     */
    const WANT = 60;
    const STEP = 6;
    for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
      const b = bot(g, kind);
      const cells = reachable(walls, b, { x: b.x, y: b.y });
      let spots = 0;
      for (const k of cells) {
        if (spots >= WANT) break;
        const ix = k % 1000;
        const x = ix * G;
        const y = ((k - ix) / 1000) * G;
        // A coarser lattice than the flood fill's, and only the clue's own
        // neighbourhood: a robot 26 m away is not the question.
        if (x % STEP !== 0 || y % STEP !== 0) continue;
        if (Math.hypot(x - clue.x, y - clue.y) > 280) continue;
        for (let f = 0; f < 8; f++) {
          g.debug.place(kind, x, y, (f / 8) * Math.PI * 2);
          g.update(DT_MAX);
          if (clueLitBy(g.snapshot().lights, kind, clue)) {
            spots++;
            break;
          }
        }
      }
      expect(spots, `${kind} has nowhere reachable to light the alcove`).toBeGreaterThanOrEqual(WANT);
    }
  }, 60000);

  it('keeps Biggy out of the room he lights into', () => {
    const g = mk();
    g.update(DT_MAX);
    const { x0, x1, rowY0, rowY1 } = aisleGap(g);
    const big = bot(g, 'biggy');
    const cells = reachable(g.debug.walls(), big, { x: big.x, y: big.y });
    let inAisle = 0;
    for (const k of cells) {
      const ix = k % 1000;
      const x = ix * G;
      const y = ((k - ix) / 1000) * G;
      if (x > x0 && x < x1 && y > rowY0 && y < rowY1) inAisle++;
    }
    expect(inAisle, 'Biggy can stand inside the aisle again').toBe(0);
  });
});
