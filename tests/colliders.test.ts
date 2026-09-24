/**
 * THE COLLIDER SWEEP — a drawn solid must be a collider.
 *
 * This is the test that exists because the same bug has now been found by hand
 * three times, always by Michele, always in play (`docs/playtest-notes.md`):
 *
 *   1. chapter 1's seat rows — drawn by the chapter, never given a collider;
 *   2. chapter 2's ground floor — **thirty-seven** objects, both staircases, the
 *      hall's eighteen roof columns, four lobby columns, two planters and the
 *      network rack, every one of them built inside `src/render/venue/ground.ts`
 *      out of its own loops, none of them known to the sim;
 *   3. "this cube is walk-through" and "Entrance walls are still walkable" — the
 *      sponsor booths' totems and flight cases, and the entrance's door-bay
 *      mullions and the leaves standing open in them.
 *
 * Each of those was fixed locally. The class was not, so the class kept coming
 * back. CLAUDE.md already has the cure written down — `src/sim` is the only
 * source of truth and `src/render` only reads it — and this file is what makes
 * it enforceable: it walks the venue **as built**, takes every mesh's real
 * world-space footprint, and asks whether a robot centre can stand inside it.
 *
 * It is deliberately written against the venue's own structures rather than
 * against a list of names: adding a column to a grid adds a column that has to
 * be a collider, because the new column is a new mesh and the new mesh is
 * measured. Nothing has to be remembered.
 *
 * ## What counts as a solid
 *
 * `BAND_LO..BAND_HI` above the floor that mesh stands on. Everything whose
 * underside is below 0.6 m is standing on the floor and is something a robot
 * walks into; everything whose underside is above it is hung on a wall, laid on
 * a counter or flying overhead, and is a different (cosmetic) question. The
 * bottom of the band keeps floor plates, carpets, decals and stair nosings out.
 *
 * ## What counts as blocked
 *
 * A cell is FREE if no sim wall rect covers it, `skipFor` ignored — a sponsor
 * table is a wall even though Voxxy is allowed under it, and its cloth is drawn
 * exactly on it. A cell is REACHABLE if some robot can walk its centre there
 * from where the chapter starts it, `skipFor` honoured and the chapter's own
 * gates treated as open (see `GATES`). A drawn solid fails only when a cell of
 * its footprint is both, which is the player's own test: could I stand in that
 * thing?
 *
 * ## The exceptions, and why each one is allowed
 *
 * They are listed in `excuse()`, they are read out of `src/sim/geometry.ts`
 * rather than typed here, and there are three:
 *
 *  - **staircases** — a flight, its landing, its treads, nosings, cheek walls,
 *    handrails and well edging are all *floor you walk on*, and the sim's answer
 *    to "nothing in this game climbs" is a `stair-foot` wall across the bottom
 *    riser, not a solid stair;
 *  - **the auditorium rake** — the stepped floor under a seat block is the
 *    room's own floor. The seats standing on it are the collider (`kind:
 *    'seats'`), and the aisles are cut through both;
 *  - **the rope-line stanchions** (`LOBBY_STANCHIONS`) — Michele's own call from
 *    the chapter-2 round: a velvet rope on a 26 cm post is not something a
 *    player expects to stop them, and a 4 px collider in the middle of the
 *    concourse is an invisible snag rather than an obstacle.
 *
 * The last one is asserted BOTH ways: if somebody ever gives the stanchions
 * colliders, this file says so, so the exception cannot quietly go stale.
 *
 * ## The half of the venue this file could not see
 *
 * It walks `buildVenue()`, and `buildVenue()` is the STATIC set. Everything a
 * chapter pushes through `props()` — cinema E's seat rows, its screen, its
 * keypad, the joke on every closed cinema's door — becomes a mesh only when a
 * frame is drawn, so none of it was ever measured. Michele then reported, of the
 * one room this file was written for: *"Robots still pass through that wall"* and
 * *"The room door is still big and walked on"*. He was right both times, and both
 * were chapter props: a 5.2 m screen slab drawn over the screen the venue already
 * draws, with a collider under only its middle third, and a 2.2 m joke hoarding
 * standing across each doorway with nothing under it at all.
 *
 * So there is a second sweep below, over what the CHAPTERS draw, using
 * `tests/prop-geometry.ts` — a transcription of the renderer's own `PROPS` table,
 * because the renderer will not export it. Chapter 1 has to come back clean.
 * Chapters 2 to 4 are held at a frozen list of offending kinds: their props are
 * other people's files tonight, and a list that may not GROW is worth more than a
 * sweep that is switched off.
 *
 * ## The half of every CHAPTER this file could not see either
 *
 * That second sweep used to tick **four frames from the chapter's start** and
 * measure only that. Every gate in the game is a drawn thing whose collider
 * changes when the player solves something, so the only state it ever measured
 * was the one before anything had happened — and that is the state that is always
 * right. It also did `if (p.state === 'broken') continue;`, which handed a free
 * pass to precisely the props that change.
 *
 * Both of Michele's *"still a walkthrough object on the doorway"* reports lived in
 * that gap, and neither of them could have been caught here:
 *
 *  - chapter 1's fire door — `ch1-night.ts` removed the corridor wall when the
 *    code went in and went on publishing the prop (`src/render/fire-door.ts`);
 *  - chapter 2's roller door — `ch2-expo.ts` removes the wall on the frame Biggy
 *    goes through it and goes on publishing the prop, *and* it was `broken`, so it
 *    was skipped twice over (`src/render/roller-door.ts`).
 *
 * So the chapter sweep now runs **twice**: once at the start, and once after the
 * chapter's own gate has been opened by playing it — the code typed at the keypad
 * in chapter 1, the towed run-up into the shutter in chapter 2. `GATE_RUNS` below says
 * which chapters can be driven here and why the other two cannot. `broken` is no
 * longer a free pass: a smashed door that is still drawn standing fails.
 */

import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DT_MAX, H, T, W } from '../src/sim/constants';
import { circleRect, createGame, type DebugGame, type ExpoState } from '../src/sim';
import { F1, GF, LOBBY_RISE_M, LOBBY_STANCHIONS } from '../src/sim/geometry';
import type { Bot, Rect, Wall } from '../src/sim/types';
import { PX_PER_M, STOREY_H_M } from '../src/sim/units';
import { buildVenue, type Venue } from '../src/render/venue/index';
import { PROP_DRAW, propBox } from './prop-geometry';
import { playToStairGate } from './pilot';

/** Grid pitch, sim px. 2 px is 16 cm — finer than any gap a robot could use. */
const STEP = 2;
const COLS = Math.ceil(W / STEP);
const ROWS = Math.ceil(H / STEP);
/** Above this the mesh is hung, stacked or overhead, not standing in the way. */
const BAND_HI = 0.6;
/** Below this it is a floor plate, a carpet, a decal or a stair nosing. */
const BAND_LO = 0.15;

/** Which floor plane a thing on the exhibition level stands on: hall or lobby. */
const LOBBY_X = GF.smallStairs.x + GF.smallStairs.w;

interface Solid extends Rect {
  name: string;
  /** Underside and top, metres above the floor it stands on. */
  lo: number;
  hi: number;
}

const idx = (i: number, j: number): number => i * ROWS + j;

/** A readable path to a mesh, for the failure message. */
function meshPath(o: THREE.Object3D): string {
  const parts: string[] = [];
  let cur: THREE.Object3D | null = o;
  while (cur && cur.name !== 'venue') {
    const mat = cur instanceof THREE.Mesh ? (cur.material as THREE.Material).name : '';
    parts.unshift(cur.name !== '' ? cur.name : mat !== '' ? `[${mat}]` : cur.type);
    cur = cur.parent;
  }
  return parts.join('/');
}

/** Every mesh under `root` as a world-space footprint, instanced meshes expanded. */
function solidsOf(root: THREE.Object3D, floorY: (simX: number) => number): Solid[] {
  const out: Solid[] = [];
  const box = new THREE.Box3();
  const tmp = new THREE.Matrix4();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const local = o.geometry.boundingBox;
    if (!local) return;
    const push = (mat: THREE.Matrix4, name: string): void => {
      box.copy(local).applyMatrix4(mat);
      const x = box.min.x * PX_PER_M;
      const y = box.min.z * PX_PER_M;
      const w = (box.max.x - box.min.x) * PX_PER_M;
      const h = (box.max.z - box.min.z) * PX_PER_M;
      const base = floorY(x + w / 2);
      out.push({ name, x, y, w, h, lo: box.min.y - base, hi: box.max.y - base });
    };
    if (o instanceof THREE.InstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, tmp);
        tmp.premultiply(o.matrixWorld);
        push(tmp, `${meshPath(o)}#${i}`);
      }
    } else push(o.matrixWorld, meshPath(o));
  });
  return out.filter((s) => s.lo < BAND_HI && s.hi > BAND_LO);
}

/** Cells no sim wall covers. `skipFor` is ignored: a table is still a wall. */
function freeGrid(walls: Wall[]): Uint8Array {
  const g = new Uint8Array(COLS * ROWS).fill(1);
  for (const w of walls) {
    const i0 = Math.max(0, Math.floor(w.x / STEP));
    const i1 = Math.min(COLS - 1, Math.ceil((w.x + w.w) / STEP));
    const j0 = Math.max(0, Math.floor(w.y / STEP));
    const j1 = Math.min(ROWS - 1, Math.ceil((w.y + w.h) / STEP));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const x = i * STEP;
        const y = j * STEP;
        if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) g[idx(i, j)] = 0;
      }
    }
  }
  return g;
}

/**
 * The gates a chapter opens while you play it.
 *
 * Reachability is measured from the chapter's START, so without this the test
 * would only ever see the rooms that are open on frame one: cinema B is locked
 * until Droid reaches the projector panel from Biggy's shoulders, cinema E's
 * door is jammed until Biggy charges it, the store is behind a roller door and
 * the router cabinet is cam-locked. Everything behind those is exactly where a
 * missing collider hides longest — cinema B's seat rows were drawn, uncollided
 * and invisible to a start-state sweep for four rounds. A gate is a wall with an
 * `onHit` handler (something breaks it) or one of these kinds.
 */
const GATES = new Set(['lock', 'jammed', 'shut', 'firedoor', 'roller', 'cabinet', 'gate']);
const isGate = (w: Wall): boolean => w.onHit !== undefined || (w.kind !== undefined && GATES.has(w.kind));

/** Cells this robot's centre can walk to from where the chapter puts the three. */
function reachGrid(walls: Wall[], bot: Bot, starts: Array<[number, number]>): Uint8Array {
  const blocked = new Uint8Array(COLS * ROWS);
  const r = bot.r;
  for (const w of walls) {
    if (w.skipFor?.(bot) === true) continue;
    if (isGate(w)) continue;
    const i0 = Math.max(0, Math.floor((w.x - r) / STEP));
    const i1 = Math.min(COLS - 1, Math.ceil((w.x + w.w + r) / STEP));
    const j0 = Math.max(0, Math.floor((w.y - r) / STEP));
    const j1 = Math.min(ROWS - 1, Math.ceil((w.y + w.h + r) / STEP));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = idx(i, j);
        if (blocked[k] === 0 && circleRect({ x: i * STEP, y: j * STEP, r }, w)) blocked[k] = 1;
      }
    }
  }
  const seen = new Uint8Array(COLS * ROWS);
  const q: number[] = [];
  const push = (i: number, j: number): void => {
    if (i < 0 || j < 0 || i >= COLS || j >= ROWS) return;
    const k = idx(i, j);
    if (seen[k] === 1 || blocked[k] === 1) return;
    seen[k] = 1;
    q.push(k);
  };
  for (const [x, y] of starts) push(Math.round(x / STEP), Math.round(y / STEP));
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const i = Math.floor(k / ROWS);
    const j = k % ROWS;
    push(i + 1, j);
    push(i - 1, j);
    push(i, j + 1);
    push(i, j - 1);
  }
  return seen;
}

/** Does `a` lie inside `b`, with `pad` px of slack? */
const inside = (a: Rect, b: Rect, pad: number): boolean =>
  a.x >= b.x - pad && a.y >= b.y - pad && a.x + a.w <= b.x + b.w + pad && a.y + a.h <= b.y + b.h + pad;

/**
 * The staircases, as the sim itself draws them. A flight, its landing and its
 * edging are floor; `pad` covers the well edging that frames the opening.
 *
 * PER FLOOR, and that is not tidiness. The two levels share one 1900x700 plan,
 * so a ground-floor stair shaft sits under first-floor corridor: a single list
 * excused anything upstairs that happened to stand over a stairwell downstairs,
 * and a test box dropped in the chapter-1 corridor went unreported because of it.
 */
const STAIRS: Record<'floor1' | 'ground', Rect[]> = {
  floor1: [F1.mainStair, F1.nicheTop, F1.nicheBot],
  ground: [
    GF.smallStairs,
    GF.mainStair,
    ...GF.stairs.map((s): Rect => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
  ],
};

/** `null` if this mesh must be a collider, or the reason it need not be. */
function excuse(s: Solid, floor: 'floor1' | 'ground'): string | null {
  if (STAIRS[floor].some((r) => inside(s, r, T))) return 'staircase: a flight and its landing are floor';
  if (/\/rake-[^/]*#\d+$/.test(s.name)) return 'the raked floor of an auditorium; the seats on it are the collider';
  if (floor === 'ground' && LOBBY_STANCHIONS.some((r) => inside(s, r, 1))) {
    return 'rope-line stanchion, walk-through on purpose';
  }
  return null;
}

let venue: Venue;

beforeAll(() => {
  venue = buildVenue();
  venue.group.updateMatrixWorld(true);
});
afterAll(() => {
  venue.dispose();
});

/** Every chapter, with the floor it plays on and where that floor's datum is. */
const CHAPTERS: Array<{ n: number; floor: 'floor1' | 'ground' }> = [
  { n: 1, floor: 'floor1' },
  { n: 2, floor: 'ground' },
  { n: 3, floor: 'ground' },
  { n: 4, floor: 'floor1' },
];

const floorY =
  (which: 'floor1' | 'ground') =>
  (x: number): number =>
    which === 'floor1' ? 0 : -STOREY_H_M + (x >= LOBBY_X ? LOBBY_RISE_M : 0);

/** The first cell of `s` a robot could stand in, or `null`. */
function standableCell(s: Solid, free: Uint8Array, reach: Uint8Array): [number, number] | null {
  for (let i = Math.floor(s.x / STEP); i <= Math.ceil((s.x + s.w) / STEP); i++) {
    for (let j = Math.floor(s.y / STEP); j <= Math.ceil((s.y + s.h) / STEP); j++) {
      if (i < 0 || j < 0 || i >= COLS || j >= ROWS) continue;
      const x = i * STEP;
      const y = j * STEP;
      if (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h) continue;
      if (free[idx(i, j)] === 1 && reach[idx(i, j)] === 1) return [x, y];
    }
  }
  return null;
}

describe('every solid the venue draws is a collider', () => {
  for (const { n, floor } of CHAPTERS) {
    it(`chapter ${n}: a robot cannot stand inside anything drawn on that floor`, () => {
      const solids = solidsOf(venue[floor], floorY(floor));
      expect(solids.length, 'the venue built nothing in the robot band').toBeGreaterThan(50);

      const snap = createGame({ seed: 20260930, chapter: n, cards: false }).snapshot();
      const walls = snap.walls as Wall[];
      const starts = snap.bots.map((b): [number, number] => [b.x, b.y]);
      const free = freeGrid(walls);
      const reach = new Uint8Array(COLS * ROWS);
      for (const b of snap.bots) {
        const one = reachGrid(walls, b as Bot, starts);
        for (let k = 0; k < reach.length; k++) if (one[k] === 1) reach[k] = 1;
      }

      const bad: string[] = [];
      for (const s of solids) {
        if (excuse(s, floor) !== null) continue;
        const cell = standableCell(s, free, reach);
        if (!cell) continue;
        bad.push(
          `${s.name} — drawn at ${s.x.toFixed(0)},${s.y.toFixed(0)} ${s.w.toFixed(0)}x${s.h.toFixed(0)} px, ` +
            `standing ${s.lo.toFixed(2)}..${s.hi.toFixed(2)} m, and a robot can stand at ${cell[0]},${cell[1]}`,
        );
      }
      expect(
        bad,
        `${bad.length} drawn solid(s) with no collider in chapter ${n}. The geometry belongs in ` +
          'src/sim/geometry.ts and the renderer should draw the sim\'s wall list — see this file\'s header:\n  ' +
          bad.join('\n  '),
      ).toEqual([]);
    });
  }

  it('keeps the rope-line stanchions walk-through, which is a decision and not an oversight', () => {
    // If this fails, somebody gave them colliders. That may well be right — but
    // then `LOBBY_STANCHIONS` and the exception in `excuse()` both have to go,
    // and `docs/playtest-notes.md` has to stop saying they are deliberate.
    const snap = createGame({ seed: 1, chapter: 2, cards: false }).snapshot();
    const walls = snap.walls as Wall[];
    for (const st of LOBBY_STANCHIONS) {
      const hit = walls.some(
        (w) => w.x < st.x + st.w && w.x + w.w > st.x && w.y < st.y + st.h && w.y + w.h > st.y,
      );
      expect(hit, `a stanchion at ${st.x},${st.y} has become a collider`).toBe(false);
    }
  });
});

/* ================================================= what the CHAPTERS draw ===
 *
 * See this file's header. `buildVenue()` is the static set; everything below is
 * the furniture a chapter publishes through `props()`, which never became a mesh
 * the sweep above could measure.
 */

/**
 * The offending prop kinds in chapters 2 to 4, frozen.
 *
 * Every one of these is a box the renderer draws on the floor with no wall under
 * it. They are not fixed here because chapters 2, 3 and 4 were open in other
 * hands the night this sweep was written, and because several of them are real
 * design questions rather than oversights — a loose `duck` and a `crate` are
 * things you PUSH, a `spotlight` and a `race-marker` may well be meant to be
 * stepped over. What this list buys is that the set cannot GROW: a new
 * walk-through prop in any chapter fails here, and taking one off the list is a
 * one-line edit that follows the fix.
 */
const KNOWN_WALKTHROUGH: Readonly<Record<number, readonly string[]>> = Object.freeze({
  2: [],
  3: ['ladle', 'crate', 'duck', 'race-marker'],
  4: ['cake', 'stage', 'banner-hook', 'spotlight'],
});

/**
 * Play a chapter as far as the gate that changes what is drawn, or `null`.
 *
 * These are the chapters' own choreographies, the ones their tests use, because
 * the point is to reach the state a PLAYER reaches — gates and all — rather than
 * to teleport into it. `null` is a chapter this file cannot drive tonight, and it
 * says why; that is a gap in the sweep and it is written down rather than hidden.
 */
const GATE_RUNS: Readonly<Record<number, ((g: DebugGame) => void) | null>> = {
  /** Type the four digits at the keypad and let the leaves swing. */
  1: (g) => {
    g.debug.select('biggy');
    g.debug.place('biggy', 575, 305);
    g.update(DT_MAX);
    const st = g.debug.chapter() as { code: string };
    for (const d of st.code) g.key(`Digit${d}`);
    expect((g.debug.chapter() as { fireOpen: boolean }).fireOpen, 'chapter 1s gate did not open').toBe(true);
    for (let i = 0; i < 90; i++) g.update(DT_MAX);
  },
  /** Voxxy takes hold of Biggy and runs him into the shutter down the top lane. */
  2: (g) => {
    g.debug.select('voxxy');
    g.debug.place('biggy', 400, 160);
    g.debug.place('voxxy', 386, 160);
    g.key('Space');
    g.setStick(1, 0);
    for (let i = 0; i < 400; i++) {
      if ((g.debug.chapter() as ExpoState).rollerBroken) break;
      g.update(DT_MAX);
    }
    g.setStick(0, 0);
    expect((g.debug.chapter() as ExpoState).rollerBroken, 'chapter 2s gate did not open').toBe(true);
    for (let i = 0; i < 60; i++) g.update(DT_MAX);
  },
  /**
   * Chapter 3: the whole of Stephan's list, because that is what opens his gate.
   *
   * This slot said `null` for a round — *"it is also the next instance of this
   * exact bug waiting to happen"* — and it was right: `ch3-breakfast.ts` removed
   * the `gate` wall in `done()` and went on publishing a `gate` prop, which
   * `PROPS.gate` drew as a 1.1 m box across the foot of the main staircase, with a
   * second static one drawn there by `buildVenue()` underneath it. Both are fixed
   * (`src/render/doors.ts`), so the write-off comes off and the post-gate sweep
   * actually covers the chapter.
   *
   * It costs a full playthrough, which is the reason it was written off, and there
   * is no way round that: soup, speaker and the beer delivery are three separate
   * errands and the gate is gated on all three. The moves are the ones
   * `tests/chapters.test.ts` uses — `debug.place` to the prop the sim itself
   * publishes, then `E` — so nothing here knows a coordinate the game does not
   * already say out loud.
   *
   * The chapter now HOLDS the hall for `GATE_SWING_TIME + GATE_CUT_DELAY` after
   * `done()` before the exit cutscene, so this run stops while the props are still
   * chapter 3's. That hold is what makes the state measurable at all: before it,
   * the open gate lasted one frame and then the screen faded.
   */
  3: playToStairGate,
  /** Chapter 4 removes no walls at all: nothing it draws changes its collider. */
  4: null,
};

/** Which chapter props are drawn solid on the floor, and where. */
function chapterSolids(
  n: number,
  open = false,
): { solids: Solid[]; kinds: string[]; unknown: string[]; game: DebugGame } {
  const g = createGame({ seed: 20260930, chapter: n, cards: false });
  // A few frames, so anything whose footprint is live (a door mid-fall, a prop a
  // chapter only publishes once it has ticked) is in the list.
  for (let i = 0; i < 4; i++) g.update(0.033);
  if (open) GATE_RUNS[n]?.(g);
  const solids: Solid[] = [];
  const kinds = new Set<string>();
  const unknown: string[] = [];
  for (const p of g.snapshot().props) {
    kinds.add(p.kind);
    const box = propBox(p);
    if (box === null) {
      unknown.push(p.kind);
      continue;
    }
    /*
     * `broken` is NOT a free pass any more.
     *
     * It used to be one — "a door Biggy has already put through the wall is lying
     * on the floor on purpose" — and that one line is what excused chapter 2's
     * roller door, which was not lying on the floor at all: it was standing
     * upright across its own opening with Biggy inside it. A prop that is drawn
     * lying down has to SAY so through its own geometry, the way the fire door and
     * the shutter now do, and then this sweep reads it as clear of the band on the
     * numbers rather than on the word.
     */
    if (PROP_DRAW[p.kind].flat === true || box.lo >= BAND_HI || box.hi <= BAND_LO) continue;
    solids.push({ ...box.rect, name: `${p.kind}${p.state !== undefined ? `(${p.state})` : ''}`, lo: box.lo, hi: box.hi });
  }
  return { solids, kinds: [...kinds], unknown, game: g };
}

describe('every solid a CHAPTER draws is a collider', () => {
  /**
   * The grids a chapter is measured against — the same rule as the venue sweep.
   *
   * Taken off the SAME game that produced the props, which is the whole point of
   * the post-gate pass: a chapter that has opened a door has a different wall list
   * and a bigger reachable set (chapter 2's store is only walkable once Biggy has
   * been through the shutter), and measuring frame-four walls against post-gate
   * props would be two different chapters compared with each other.
   */
  function gridsFor(g: DebugGame): { free: Uint8Array; reach: Uint8Array } {
    const snap = g.snapshot();
    const walls = snap.walls as Wall[];
    const starts = snap.bots.map((b): [number, number] => [b.x, b.y]);
    const free = freeGrid(walls);
    const reach = new Uint8Array(COLS * ROWS);
    for (const b of snap.bots) {
      const one = reachGrid(walls, b as Bot, starts);
      for (let k = 0; k < reach.length; k++) if (one[k] === 1) reach[k] = 1;
    }
    return { free, reach };
  }

  it('classifies every kind all four chapters draw', () => {
    const missing = new Set<string>();
    for (const { n } of CHAPTERS) {
      for (const k of chapterSolids(n).unknown) missing.add(k);
      // And the kinds a chapter only publishes once its gate is open — which is
      // exactly where a new, unclassified prop would be least likely to be noticed.
      if (GATE_RUNS[n]) for (const k of chapterSolids(n, true).unknown) missing.add(k);
    }
    expect(
      [...missing],
      'a chapter is drawing a prop kind `tests/prop-geometry.ts` has never heard of. ' +
        'Add it there, copying its entry from `PROPS` in src/render/scene.ts — an unclassified ' +
        'kind is exactly how a walk-through solid hides from this sweep.',
    ).toEqual([]);
  });

  it('chapter 1: nothing the night chapter draws can be walked through', () => {
    const one = chapterSolids(1);
    const { free, reach } = gridsFor(one.game);
    const bad: string[] = [];
    for (const s of one.solids) {
      const cell = standableCell(s, free, reach);
      if (cell) {
        bad.push(
          `${s.name} — drawn at ${s.x.toFixed(0)},${s.y.toFixed(0)} ${s.w.toFixed(0)}x${s.h.toFixed(0)} px, ` +
            `standing ${s.lo.toFixed(2)}..${s.hi.toFixed(2)} m, and a robot can stand at ${cell[0]},${cell[1]}`,
        );
      }
    }
    expect(
      bad,
      `${bad.length} prop(s) chapter 1 draws with no collider. Either push a wall for it in ` +
        'ch1-night.ts, or stop drawing it:\n  ' + bad.join('\n  '),
    ).toEqual([]);
  });

  for (const n of [2, 3, 4]) {
    it(`chapter ${n}: the list of walk-through props does not grow`, () => {
      const run = chapterSolids(n);
      const { free, reach } = gridsFor(run.game);
      const kinds = new Set<string>();
      for (const s of run.solids) {
        if (standableCell(s, free, reach)) kinds.add(s.name.replace(/\(.*\)$/, ''));
      }
      const known = new Set(KNOWN_WALKTHROUGH[n] ?? []);
      const fresh = [...kinds].filter((k) => !known.has(k));
      expect(fresh, `new walk-through prop kind(s) in chapter ${n}: ${fresh.join(', ')}`).toEqual([]);
      // And the other way: a kind that has been fixed comes off the list, or the
      // list quietly stops describing the build.
      const stale = [...known].filter((k) => !kinds.has(k));
      expect(stale, `KNOWN_WALKTHROUGH[${n}] still lists ${stale.join(', ')}, which now has a collider`).toEqual([]);
    });
  }

  /* ------------------------------------------------- and after the doors open */

  /**
   * The offending prop kinds once a chapter's gate is OPEN, frozen — same
   * contract as `KNOWN_WALKTHROUGH` above and, for now, the same contents.
   *
   * There is nothing extra in either list: chapter 1 comes back clean with its
   * fire door swung open, and chapter 2 comes back clean with its shutter torn
   * up — including the store behind it, which is measured here for the first time
   * because it is only reachable once Biggy has been through the door.
   */
  const KNOWN_WALKTHROUGH_OPEN: Readonly<Record<number, readonly string[]>> = Object.freeze({
    1: [],
    2: [],
    /*
     * Chapter 3 is measured here for the first time — `GATE_RUNS[3]` used to be a
     * written-off `null`. It comes back with the same four kinds its frame-four
     * sweep already carries in `KNOWN_WALKTHROUGH`, and nothing extra: the gate
     * itself is off the list, in both states, which is the whole point of adding
     * the run.
     */
    3: ['ladle', 'crate', 'duck', 'race-marker'],
  });

  for (const n of [1, 2, 3]) {
    it(`chapter ${n}: nothing it draws can be walked through AFTER its gate opens`, () => {
      const run = chapterSolids(n, true);
      const { free, reach } = gridsFor(run.game);
      const bad: string[] = [];
      const kinds = new Set<string>();
      for (const s of run.solids) {
        const cell = standableCell(s, free, reach);
        if (!cell) continue;
        kinds.add(s.name.replace(/\(.*\)$/, ''));
        bad.push(
          `${s.name} — drawn at ${s.x.toFixed(0)},${s.y.toFixed(0)} ${s.w.toFixed(0)}x${s.h.toFixed(0)} px, ` +
            `standing ${s.lo.toFixed(2)}..${s.hi.toFixed(2)} m, and a robot can stand at ${cell[0]},${cell[1]}`,
        );
      }
      const known = new Set(KNOWN_WALKTHROUGH_OPEN[n] ?? []);
      const fresh = bad.filter((line) => !known.has(line.split(' ')[0].replace(/\(.*\)$/, '')));
      expect(
        fresh,
        `${fresh.length} prop(s) chapter ${n} draws with no collider once its door is open. This is the half ` +
          'of the chapter the sweep could not see, and it is where both of Michele\'s "still a walkthrough ' +
          'object on the doorway" reports lived. Either the chapter pushes a wall where the thing ENDS UP, or ' +
          'the renderer stops drawing it there — see src/render/fire-door.ts and src/render/roller-door.ts:\n  ' +
          fresh.join('\n  '),
      ).toEqual([]);
      // And the other way round, so the list cannot quietly stop describing the build.
      const stale = [...known].filter((k) => !kinds.has(k));
      expect(stale, `KNOWN_WALKTHROUGH_OPEN[${n}] still lists ${stale.join(', ')}, which now has a collider`).toEqual(
        [],
      );
    });
  }

  /**
   * The gap, asserted: every chapter is either driven past its gate here or
   * listed in `GATE_RUNS` with a reason. A chapter added later shows up as `undefined`
   * and fails, rather than silently getting the old half-measured treatment.
   */
  it('says, for every chapter, whether its post-gate half is measured', () => {
    for (const { n } of CHAPTERS) {
      expect(
        GATE_RUNS[n],
        `chapter ${n} is neither driven past its gate nor written off in GATE_RUNS`,
      ).not.toBe(undefined);
    }
  });
});
