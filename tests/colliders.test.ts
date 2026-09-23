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
 */

import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { H, T, W } from '../src/sim/constants';
import { circleRect, createGame } from '../src/sim';
import { F1, GF, LOBBY_RISE_M, LOBBY_STANCHIONS } from '../src/sim/geometry';
import type { Bot, Rect, Wall } from '../src/sim/types';
import { PX_PER_M, STOREY_H_M } from '../src/sim/units';
import { buildVenue, type Venue } from '../src/render/venue/index';

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
