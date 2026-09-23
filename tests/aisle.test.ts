/**
 * Cinema E's aisle — the gate that had quietly stopped being one, and the room
 * the player could not see into.
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
 *
 * ## And then it happened again, one level up
 *
 * Narrowing the aisle to the only width that gates Biggy was right, and these
 * tests proved it: all three robots keep hundreds of reachable positions from
 * which they can light the alcove clue. Michele then played that build and
 * *could not solve the room*: **"I'd try the aisle room on the opposite way, for
 * better interaction. I no longer see the hint in that room, i wasn't able to
 * solve it."**
 *
 * Nothing here was wrong. Everything here was measuring the wrong thing. A clue
 * that is lightable from 539 measured positions and invisible to the person
 * playing is not solvable, and "reachable" had been standing in for "playable"
 * the whole time. Cast against the diorama camera, cinema E's entire front of
 * house — every square metre of the route from the aisle to the alcove — was
 * behind the room's own front wall and behind a 5.2 m screen slab the chapter
 * was drawing on top of the screen the venue already draws. The clue sat in a
 * 15 px keyhole: one robot-width either side of it and it was gone.
 *
 * So the second half of this file asks the question the first half could not:
 * **is it in shot?** It ray-casts from the clue, from a robot standing at it and
 * from every cell of the route toward the fixed camera, through the venue's own
 * meshes and the chapter's own drawn props, exactly as `tests/venue.smoke.test.ts`
 * does for the Zaal numerals. A clue you cannot see is a failing test now.
 */

import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
import { BASE_ELEVATION_DEG, CHAPTER_ELEVATION_DEG, dioramaToCameraAtDeg } from '../src/render/camera';
import { buildVenue, type Venue } from '../src/render/venue/index';
import { T } from '../src/sim/constants';
import { cinemaEExit, R } from '../src/sim/geometry';
import { CLUE_SPOT } from '../src/sim/lights';
import type { GameSnapshot, Prop } from '../src/sim/types';
import { PX_PER_M, m } from '../src/sim/units';
import { PROP_DRAW, propBox } from './prop-geometry';

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

  /**
   * THE GATE, stated where it actually lives now.
   *
   * The aisle is not the gate on its own: what matters is that the bay in front of
   * the exit alcove has exactly one way in, and that it is 15 px wide. Mirroring
   * the room put the alcove at the aisle's foot, and the first cut of that layout
   * left the bay open to the front of house — so Biggy could walk round the
   * seating and stand in the alcove, and nothing in this file noticed, because
   * every test here was about the AISLE. This one is about the prize.
   */
  it('leaves Biggy no way at all to reach the exit alcove', () => {
    const g = mk();
    g.update(DT_MAX);
    const a = cinemaEExit();
    const clue = night(g).clues[3];
    const big = bot(g, 'biggy');
    for (const k of reachable(g.debug.walls(), big, { x: big.x, y: big.y })) {
      const ix = k % 1000;
      const x = ix * G;
      const y = ((k - ix) / 1000) * G;
      const inAlcove = x > a.x - T && x < a.x + a.w && y > a.y - T && y < a.y + a.h;
      expect(inAlcove, `Biggy can stand in the exit alcove at ${x},${y}`).toBe(false);
      // And not close enough to light it by standing next to it, either — the
      // whole beat is that his blue has to arrive off the screen.
      expect(
        Math.hypot(x - clue.x, y - clue.y) > 40,
        `Biggy can get within ${Math.hypot(x - clue.x, y - clue.y).toFixed(0)} px of the alcove clue, at ${x},${y}`,
      ).toBe(true);
    }
  });

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

/* ===================================================================== SIGHT
 *
 * "I no longer see the hint in that room." Everything below answers that, and
 * only that: what the fixed diorama camera can and cannot see of cinema E.
 */

/** The chapter's own drawn furniture, as boxes, so a ray can hit it. */
function drawnProps(props: Prop[]): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'chapter-props';
  for (const p of props) {
    const box = propBox(p);
    // A flat floor decal never occludes anything; an unknown kind is somebody
    // else's failing test (`colliders.test.ts`), not a silent pass here.
    if (box === null || PROP_DRAW[p.kind].flat === true) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(m(box.rect.w), 0.06), box.hi - box.lo, Math.max(m(box.rect.h), 0.06)),
    );
    mesh.name = `prop:${p.kind}`;
    mesh.position.set(m(box.rect.x + box.rect.w / 2), (box.lo + box.hi) / 2, m(box.rect.y + box.rect.h / 2));
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  return group;
}

describe('cinema E is a room the player can see into', () => {
  let venue: Venue;
  let props: THREE.Object3D;
  let snap: GameSnapshot;
  const ray = new THREE.Raycaster();
  ray.far = 400;

  beforeAll(() => {
    venue = buildVenue();
    venue.group.updateMatrixWorld(true);
    const g = mk();
    g.update(DT_MAX);
    snap = g.snapshot();
    props = drawnProps(snap.props);
  });
  afterAll(() => {
    venue.dispose();
  });

  const toCam = (): THREE.Vector3 => dioramaToCameraAtDeg(CHAPTER_ELEVATION_DEG[1] ?? BASE_ELEVATION_DEG);

  /** What stands between a point in the room and the camera, or `null`. */
  function blocker(x: number, y: number, heightM: number): string | null {
    ray.set(new THREE.Vector3(m(x), heightM, m(y)), toCam());
    const hit = ray.intersectObjects([venue.floor1, props], true).find((h) => h.distance > 0.02);
    if (!hit) return null;
    return hit.object.name || hit.object.parent?.name || hit.object.type;
  }

  it('leaves the alcove clue itself in clear sight, and its whole patch with it', () => {
    const clue = night(mk()).clues[3];
    // Not just the centre: `CLUE_SPOT` is what `clueLit` tests against, and a
    // clue whose centre peeps round a wall while its disc is hidden is a clue
    // that flickers as the player walks.
    const samples: Array<[number, number]> = [
      [clue.x, clue.y],
      [clue.x + CLUE_SPOT, clue.y],
      [clue.x - CLUE_SPOT, clue.y],
      [clue.x, clue.y + CLUE_SPOT],
      [clue.x, clue.y - CLUE_SPOT],
    ];
    for (const [x, y] of samples) {
      const b = blocker(x, y, 0.02);
      expect(b, `the alcove clue at ${x},${y} is behind ${b}`).toBeNull();
    }
  });

  it('shows a robot standing at the clue, head and all', () => {
    const clue = night(mk()).clues[3];
    for (const h of [0.4, 1.0, 1.75]) {
      const b = blocker(clue.x, clue.y, h);
      expect(b, `a robot at the clue is hidden at ${h} m by ${b}`).toBeNull();
    }
  });

  /**
   * The route, not just the prize.
   *
   * Michele's own words are about INTERACTION: he walked down an aisle and lost
   * sight of where he was going. So this measures every cell Droid can actually
   * stand on inside cinema E and asks how much of it is in shot. The old layout
   * scored 42% of the floor and 0% of the front of house; the failure mode is a
   * room whose puzzle happens off screen, and a percentage is the only honest
   * way to catch it before a human does.
   */
  /** Every cell of cinema E Droid can actually stand on, on the usual lattice. */
  function droidFloorOfE(): Array<[number, number]> {
    const g = mk();
    g.update(DT_MAX);
    const rE = R('E');
    const d = bot(g, 'droid');
    const out: Array<[number, number]> = [];
    for (const k of reachable(g.debug.walls(), d, { x: d.x, y: d.y })) {
      const ix = k % 1000;
      const x = ix * G;
      const y = ((k - ix) / 1000) * G;
      if (x < rE.x || x > rE.x + rE.w || y < rE.y || y > rE.y + rE.h) continue;
      out.push([x, y]);
    }
    return out;
  }

  it('keeps the floor Droid can stand on inside cinema E in shot', () => {
    const cells = droidFloorOfE();
    const dark = cells.filter(([x, y]) => blocker(x, y, 1.0) !== null);
    expect(cells.length, 'nothing of cinema E is reachable at all').toBeGreaterThan(500);
    const pct = (100 * (cells.length - dark.length)) / cells.length;
    /*
     * 70, not 100, and the missing fifth is named rather than waved at.
     *
     * Two things in cinema E are behind something from this camera and cannot be
     * moved by a chapter: the 11 px of floor immediately behind each row of seats
     * (which is what a rake looks like from above and in front, and is fine), and
     * the strip in front of the last row, which is behind the room's own 2.45 m
     * front wall and its screen. The second one is a renderer question — the near
     * CORRIDOR wall is already cut to a parapet by `wallStyle` in
     * `src/render/venue/floor1.ts` for exactly this reason, and the near ROOMS'
     * front walls are not — and it is why the puzzle has been moved OUT of that
     * strip rather than lit better inside it. It was 42% before that move.
     */
    expect(
      pct,
      `only ${pct.toFixed(0)}% of the floor Droid can reach in cinema E is in shot — ` +
        `${dark.length} cells are behind something, e.g. ${dark
          .slice(0, 8)
          .map(([x, y]) => `${x},${y}`)
          .join(' ')}`,
    ).toBeGreaterThan(70);
  });

  /**
   * And the part that is not allowed a tail at all: the puzzle's own ground.
   *
   * The alcove and the bay in front of it are where the player parks two robots,
   * aims a third and reads the digit off the floor. Every cell of it has to show a
   * robot standing on it. (At the FLOOR the front row of seats shades the 11 px
   * behind it, which is what a row of seats does; the one patch of floor that has
   * to be visible as floor is the clue's own, and that has its own test above.)
   *
   * The AISLE is deliberately not held to this. Its last few metres run past the
   * alcove's side wall, and a 2.45 m wall casts a 4 m shadow from a 30° camera —
   * that is what a wall is. Droid is 2.1 m and stands clear of it; Voxxy is 1.15 m
   * and does not, for about two metres of walking. The cure for that is not a
   * chapter change at all, it is the one `wallStyle` already applies to the near
   * CORRIDOR wall in `src/render/venue/floor1.ts` — cut the slab the camera looks
   * over down to a parapet — and it is somebody else's file.
   */
  it('leaves the alcove and the bay in front of it completely in shot', () => {
    const a = cinemaEExit();
    const { rowY1 } = aisleGap(mk());
    const near = droidFloorOfE().filter(([x, y]) => x >= a.x - T && y >= a.y && y <= rowY1);
    expect(near.length, 'there is no reachable ground at the alcove').toBeGreaterThan(80);
    for (const [x, y] of near) {
      const b = blocker(x, y, 1.0);
      expect(b, `the alcove approach at ${x},${y} is hidden behind ${b}`).toBeNull();
    }
  });

  /**
   * The exit alcove is the one place in the room that must be perfect: it is
   * where the clue is, where two robots have to stand, and the thing Michele
   * could not find.
   */
  it('shows every part of the exit alcove a robot can stand in', () => {
    const g = mk();
    g.update(DT_MAX);
    const a = cinemaEExit();
    const d = bot(g, 'droid');
    const cells = reachable(g.debug.walls(), d, { x: d.x, y: d.y });
    let inside = 0;
    for (const k of cells) {
      const ix = k % 1000;
      const x = ix * G;
      const y = ((k - ix) / 1000) * G;
      if (x < a.x || x > a.x + a.w || y < a.y || y > a.y + a.h) continue;
      inside++;
      const b = blocker(x, y, 1.0);
      expect(b, `the alcove's floor at ${x},${y} is behind ${b}`).toBeNull();
    }
    expect(inside, 'Droid cannot stand in the exit alcove at all').toBeGreaterThan(10);
  });

  /**
   * And the two halves of the puzzle are one picture.
   *
   * The camera frames chapter 1 on a 320 x 235 px window centred on the robot
   * being driven (`FOCUS` in `src/render/scene.ts`). The aisle and the alcove
   * being in the same room is not enough — they were, before — they have to be
   * close enough together that standing in one shows you the other.
   */
  it('puts the aisle and the exit alcove in the same frame', () => {
    const g = mk();
    const { x0, x1, rowY1 } = aisleGap(g);
    const a = cinemaEExit();
    const gapX = Math.abs((x0 + x1) / 2 - (a.x + a.w / 2));
    const gapY = Math.abs(rowY1 - (a.y + a.h / 2));
    expect(gapX, 'the aisle and the alcove are at opposite sides of the room').toBeLessThan(120);
    expect(gapY, 'the aisle runs past the alcove and out of frame').toBeLessThan(90);
  });

  it('never lets the chapter draw a second cinema screen over the venue s own', () => {
    // The 5.2 m slab that hid the room. `buildVenue()` draws `screen-E`; a
    // chapter emitting its own `screen` prop is drawing it twice, and the copy
    // is taller than the original, wider than the original and half of it has no
    // collider.
    expect(
      snap.props.filter((p) => p.kind === 'screen').map((p) => `${p.x},${p.y}`),
      'chapter 1 is drawing a screen prop again',
    ).toEqual([]);
    expect(venue.group.getObjectByName('screen-E'), 'the venue stopped drawing cinema E s screen').toBeDefined();
  });

  /** The mirror has to be ON the screen, or the bounce comes off thin air. */
  it('seats the mirror on the screen the player can see', () => {
    const g = mk();
    g.update(DT_MAX);
    const mirror = g.snapshot().mirrors[0];
    const screen = venue.group.getObjectByName('screen-E');
    expect(screen).toBeDefined();
    const box = new THREE.Box3().setFromObject(screen as THREE.Object3D);
    const faceY = box.min.z * PX_PER_M;
    expect(Math.abs(mirror.y - faceY), 'the mirror is not on the screen s face').toBeLessThan(2);
    expect(mirror.x0).toBeGreaterThanOrEqual(box.min.x * PX_PER_M - 1);
    expect(mirror.x1).toBeLessThanOrEqual(box.max.x * PX_PER_M + 1);
  });
});
