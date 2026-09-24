/**
 * THE FIRE DOOR — measured in the state the collider sweep never reached.
 *
 * Michele playtested chapter 1 and sent a screenshot of Biggy standing squarely
 * in the fire doorway with a flat slab through his chest: *"still a walkthrough
 * object on the doorway, add an animation + sound when it opens."*
 *
 * Reproduced on the built bundle before anything was changed, by entering the
 * chapter's own code and then putting Biggy at 607,350 — the middle of the drawn
 * leaf. He stayed there, at rest, and the wall list had nothing covering
 * 600..614 x 285..415. `ch1-night.ts` removes the whole corridor-crossing wall
 * when the code is accepted and keeps publishing a `firedoor` prop with the same
 * rect, and the renderer drew that rect as a 2.1 m solid whatever the state said.
 *
 * ## Why `tests/colliders.test.ts` came back clean through all of it
 *
 * Its chapter sweep ticks **four frames from the chapter's start**. At frame four
 * the fire door is shut, its wall is present, and the only state it has ever
 * measured is the state that was right. Every gate in the game has the same shape
 * — a drawn thing whose collider changes when the player solves something — so
 * this file measures chapter 1 *after* its gates have been opened, which is the
 * half of the chapter that sweep cannot see.
 *
 * The drawn geometry comes from `src/render/fire-door.ts`, the same module
 * `scene.ts` draws the door from, so passing here and looking right on screen are
 * the same fact rather than two hopes.
 */

import { describe, expect, it } from 'vitest';

import { H, W } from '../src/sim/constants';
import { circleRect, createGame, type DebugGame } from '../src/sim';
import type { Bot, Prop, Rect, Wall } from '../src/sim/types';
import { fireDoorSolids } from '../src/render/fire-door';
import { propBox } from './prop-geometry';

/** Grid pitch, sim px — the same 16 cm lattice the collider sweep walks. */
const STEP = 2;
const COLS = Math.ceil(W / STEP);
const ROWS = Math.ceil(H / STEP);
const idx = (i: number, j: number): number => i * ROWS + j;

/** Cells no wall covers at all. `skipFor` ignored: a wall is a wall. */
function freeGrid(walls: readonly Wall[]): Uint8Array {
  const g = new Uint8Array(COLS * ROWS).fill(1);
  for (const w of walls) {
    for (let i = Math.max(0, Math.floor(w.x / STEP)); i <= Math.min(COLS - 1, Math.ceil((w.x + w.w) / STEP)); i++) {
      for (let j = Math.max(0, Math.floor(w.y / STEP)); j <= Math.min(ROWS - 1, Math.ceil((w.y + w.h) / STEP)); j++) {
        const x = i * STEP;
        const y = j * STEP;
        if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) g[idx(i, j)] = 0;
      }
    }
  }
  return g;
}

/** Cells this robot's centre can walk to from where it is standing now. */
function reachGrid(walls: readonly Wall[], bot: Bot, starts: Array<[number, number]>): Uint8Array {
  const blocked = new Uint8Array(COLS * ROWS);
  const r = bot.r;
  for (const w of walls) {
    if (w.skipFor?.(bot) === true) continue;
    for (let i = Math.max(0, Math.floor((w.x - r) / STEP)); i <= Math.min(COLS - 1, Math.ceil((w.x + w.w + r) / STEP)); i++) {
      for (let j = Math.max(0, Math.floor((w.y - r) / STEP)); j <= Math.min(ROWS - 1, Math.ceil((w.y + w.h + r) / STEP)); j++) {
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
    push(Math.floor(k / ROWS) + 1, k % ROWS);
    push(Math.floor(k / ROWS) - 1, k % ROWS);
    push(Math.floor(k / ROWS), (k % ROWS) + 1);
    push(Math.floor(k / ROWS), (k % ROWS) - 1);
  }
  return seen;
}

interface Field {
  free: Uint8Array;
  reach: Uint8Array;
}

function fieldOf(g: DebugGame): Field {
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

/** The first cell of `r` a robot could stand in, or `null` — the player's own test. */
function standableCell(r: Rect, f: Field): [number, number] | null {
  for (let i = Math.floor(r.x / STEP); i <= Math.ceil((r.x + r.w) / STEP); i++) {
    for (let j = Math.floor(r.y / STEP); j <= Math.ceil((r.y + r.h) / STEP); j++) {
      if (i < 0 || j < 0 || i >= COLS || j >= ROWS) continue;
      const x = i * STEP;
      const y = j * STEP;
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      if (f.free[idx(i, j)] === 1 && f.reach[idx(i, j)] === 1) return [x, y];
    }
  }
  return null;
}

const mk = (): DebugGame => createGame({ seed: 20260930, chapter: 1, cards: false });
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(0.033);
};
const doorProp = (g: DebugGame): Prop => {
  const p = g.snapshot().props.find((q) => q.kind === 'firedoor');
  if (!p) throw new Error('chapter 1 published no fire door');
  return p;
};

/**
 * Type the chapter's own code at the keypad and let the door settle.
 *
 * Biggy is parked a little west of the pad rather than teleported through it: the
 * point of the run is to reach the state a PLAYER reaches, gates and all.
 */
function openTheDoor(g: DebugGame): void {
  g.debug.select('biggy');
  g.debug.place('biggy', 575, 305);
  steps(g, 1);
  const st = g.debug.chapter() as { code: string; fireOpen: boolean };
  for (const d of st.code) g.key(`Digit${d}`);
  expect((g.debug.chapter() as { fireOpen: boolean }).fireOpen, 'the code did not open the door').toBe(true);
  // Long enough for any swing clock the chapter owns to run out; the settled pose
  // is the one the sim has walls for. See `src/render/fire-door.ts`.
  steps(g, 90);
}

describe('chapter 1s fire door', () => {
  it('is a collider wherever it is drawn, shut', () => {
    const g = mk();
    steps(g, 4);
    const f = fieldOf(g);
    const p = doorProp(g);
    const drawn = fireDoorSolids(p, g.snapshot().walls as Wall[]);
    expect(drawn.length, 'a shut fire door that draws nothing is not a shut fire door').toBeGreaterThan(0);
    for (const r of drawn) {
      const cell = standableCell(r, f);
      expect(cell, `the shut fire door is drawn at ${r.x},${r.y} ${r.w}x${r.h} and a robot can stand at ${cell}`).toBe(
        null,
      );
    }
  });

  it('is not a slab across its own opening once it is open', () => {
    const g = mk();
    openTheDoor(g);
    const f = fieldOf(g);
    const p = doorProp(g);
    expect(p.state).toBe('open');

    // 1. What `scene.ts` draws, from the module it draws it with.
    for (const r of fireDoorSolids(p, g.snapshot().walls as Wall[])) {
      const cell = standableCell(r, f);
      expect(
        cell,
        `the OPEN fire door is drawn at ${r.x},${r.y} ${r.w}x${r.h} px and a robot can stand at ${cell}. ` +
          'An open door is either swung clear of its opening — and then it is a collider where it ENDS UP — ' +
          'or it is a solid you cannot pass. It is never a slab across the hole it just made.',
      ).toBe(null);
    }

    // 2. And the renderer's transcription in `tests/prop-geometry.ts` agrees: the
    //    prop's own rect is not a box any more. This is the assertion that was red
    //    before the fix, with Biggy standing at 607,350 inside a 2.1 m leaf.
    const box = propBox(p);
    expect(box, 'the fire door is no longer a classified prop kind').not.toBe(null);
    if (box && box.hi > 0.15) {
      const cell = standableCell(box.rect, f);
      expect(cell, `the open fire door is still drawn as one solid box, and a robot stands at ${cell}`).toBe(null);
    }
  });

  it('leaves the corridor cross-section sealed until the code is entered', () => {
    // The other half of "drawn and solid agree": the door must not become passable
    // early. Every cell across the doorway is covered while it is shut.
    const g = mk();
    steps(g, 4);
    const walls = g.snapshot().walls as Wall[];
    const p = doorProp(g);
    const free = freeGrid(walls);
    for (let y = p.y; y <= p.y + (p.h ?? 0); y += STEP) {
      const i = Math.round((p.x + (p.w ?? 14) / 2) / STEP);
      const j = Math.round(y / STEP);
      expect(free[idx(i, j)], `the shut fire door has a hole at y ${y}`).toBe(0);
    }
  });
});
