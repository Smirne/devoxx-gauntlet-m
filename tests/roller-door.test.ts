/**
 * THE STORE'S ROLLER DOOR — measured in the state the collider sweep never reached.
 *
 * Michele playtested and sent a screenshot of a mid-grey slab standing through
 * Biggy's chest: *"still a walkthrough object on the doorway, add an animation +
 * sound when it opens."* Chapter 1's fire door was one of them. This is the other,
 * and it is the same bug in the same words.
 *
 * Reproduced on the built bundle before anything was changed, by driving the real
 * chapter through the real break — Voxxy takes hold of Biggy on the top lane and
 * runs him into the shutter at 5.7 m/s — and then putting Biggy at 897,160, the
 * middle of the drawn leaf:
 *
 * ```
 * roller prop after the break: {"kind":"roller","x":894,"y":130,"w":6,"h":60,"state":"broken"}
 * walls still covering that rect: []
 * biggy placed at 897,160 (r=9) -> settles at 897.0,160.0
 * ```
 *
 * `ch2-expo.ts` removes the `roller` wall on the frame of the hit and goes on
 * publishing the prop; `scene.ts` drew that rect from its `PROPS` table as a 2.6 m
 * box whatever the state said. Worse than the fire door, in fact: `ground.ts`
 * builds a static slatted shutter at the same rect in every chapter, so there were
 * *two* doors standing in a doorway the sim had already given up.
 *
 * ## Why `tests/colliders.test.ts` came back clean through all of it
 *
 * Two reasons, and this file is the answer to the first while that file's own
 * chapter sweep is now the answer to the second. Its sweep ticks four frames from
 * the chapter's START, where the shutter is down and its wall is present — and it
 * then did `if (p.state === 'broken') continue;`, which is the exact line that
 * excused this door even if it had ever got there.
 *
 * The drawn geometry comes from `src/render/roller-door.ts`, the same module
 * `scene.ts` draws the shutter from, so passing here and looking right on screen
 * are the same fact rather than two hopes.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, H, W } from '../src/sim/constants';
import { circleRect, createGame, type DebugGame, type ExpoState } from '../src/sim';
import type { Bot, Prop, Rect, Wall } from '../src/sim/types';
import { ROLLER_CLEAR_M, rollerDoorDraw, rollerDoorSolids } from '../src/render/roller-door';
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

const mk = (): DebugGame => createGame({ seed: 20260930, chapter: 2, cards: false });
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};
const doorProp = (g: DebugGame): Prop => {
  const p = g.snapshot().props.find((q) => q.kind === 'roller');
  if (!p) throw new Error('chapter 2 published no roller door');
  return p;
};

/**
 * Break it the way a player has to: Voxxy on the tow bar, down the whole top lane.
 *
 * `ROLLER_DOOR_SPEED` is above Biggy's own cap on purpose (GAUNTLET.md's frozen
 * constants), so there is no shortcut — the run is the gate. The choreography is
 * `tests/tow.test.ts`'s, because the point of the run is to reach the state a
 * PLAYER reaches rather than to teleport into it.
 */
function breakTheShutter(g: DebugGame): void {
  g.debug.select('voxxy');
  g.debug.place('biggy', 400, 160);
  g.debug.place('voxxy', 386, 160);
  g.key('Space');
  expect(g.snapshot().tow?.holder, 'Voxxy never took hold of Biggy').toBe('voxxy');
  g.setStick(1, 0);
  for (let i = 0; i < 400; i++) {
    if ((g.debug.chapter() as ExpoState).rollerBroken) break;
    g.update(DT_MAX);
  }
  g.setStick(0, 0);
  expect((g.debug.chapter() as ExpoState).rollerBroken, 'the run-up did not break the shutter').toBe(true);
  // Long enough for the rise clock the chapter owns to run out; the settled pose
  // is the one the sim agrees with. See `src/render/roller-door.ts`.
  steps(g, 60);
  expect((g.debug.chapter() as ExpoState).rollerRise, 'the shutter never finished tearing up').toBe(1);
}

describe('chapter 2s roller door', () => {
  it('is a collider wherever it is drawn, down', () => {
    const g = mk();
    steps(g, 4);
    const f = fieldOf(g);
    const p = doorProp(g);
    expect(p.state).toBe('shut');
    const drawn = rollerDoorSolids(p, g.snapshot().walls as Wall[]);
    expect(drawn.length, 'a shut shutter that draws nothing is not a shut shutter').toBeGreaterThan(0);
    for (const r of drawn) {
      const cell = standableCell(r, f);
      expect(cell, `the shut shutter is drawn at ${r.x},${r.y} ${r.w}x${r.h} and a robot can stand at ${cell}`).toBe(
        null,
      );
    }
  });

  it('leaves the doorway sealed until Biggy goes through it', () => {
    const g = mk();
    steps(g, 4);
    const walls = g.snapshot().walls as Wall[];
    const p = doorProp(g);
    const free = freeGrid(walls);
    for (let y = p.y; y <= p.y + (p.h ?? 0); y += STEP) {
      const i = Math.round((p.x + (p.w ?? 6) / 2) / STEP);
      const j = Math.round(y / STEP);
      expect(free[idx(i, j)], `the shut shutter has a hole at y ${y}`).toBe(0);
    }
  });

  it('is not a slab across its own opening once Biggy has been through it', () => {
    const g = mk();
    breakTheShutter(g);
    const f = fieldOf(g);
    const p = doorProp(g);
    expect(p.state).toBe('broken');

    // 1. What `scene.ts` draws, from the module it draws it with. This is the
    //    assertion that was red before the fix, with Biggy at rest inside a 2.6 m
    //    box at 894,130 6x60 and not one wall covering it.
    for (const r of rollerDoorSolids(p, g.snapshot().walls as Wall[])) {
      const cell = standableCell(r, f);
      expect(
        cell,
        `the SMASHED shutter is drawn at ${r.x},${r.y} ${r.w}x${r.h} px and a robot can stand at ${cell}. ` +
          'A shutter that has been torn open is either up in its housing — and then nothing is drawn in the ' +
          'doorway at all — or it is a solid you cannot pass. It is never a slab across the hole it just made.',
      ).toBe(null);
    }

    // 2. And the renderer's transcription in `tests/prop-geometry.ts` agrees: the
    //    prop's own rect has stopped being a box.
    const box = propBox(p);
    expect(box, 'the roller door is no longer a classified prop kind').not.toBe(null);
    if (box && box.hi > 0.15) {
      const cell = standableCell(box.rect, f);
      expect(cell, `the smashed shutter is still drawn as one solid box, and a robot stands at ${cell}`).toBe(null);
    }

    // 3. The curtain is where a roller shutter goes — up — and every slat of it is
    //    clear of Droid, who is the tallest thing that walks under it.
    const d = rollerDoorDraw(p, g.snapshot().walls as Wall[]);
    expect(d.sealed, 'the sim still has a wall across an opening Biggy went through').toBe(false);
    expect(d.u).toBe(1);
    expect(d.slats.length, 'the shutter vanished instead of going somewhere').toBe(7);
    for (const s of d.slats) {
      expect(s.lo, `a slat is drawn at ${s.lo.toFixed(2)} m, in a robot's way`).toBeGreaterThanOrEqual(
        ROLLER_CLEAR_M - 1e-6,
      );
    }

    // 4. And the label stopped saying `roller door — down` about a door that is up.
    expect(p.label ?? '', `the smashed shutter still calls itself "${p.label}"`).not.toMatch(/down/i);
  });

  it('cannot be drawn across an opening the sim has given back', () => {
    /*
     * The guarantee, stated on its own: walk-through is not a bug that can come
     * back here, it is a shape the module cannot express. Hand it a prop that
     * claims to be broken with no rise clock at all — an older chapter, a replay,
     * a sim that has not been told about the animation — together with the live
     * wall list, and it still refuses to put a slat in the doorway.
     */
    const g = mk();
    breakTheShutter(g);
    const walls = g.snapshot().walls as Wall[];
    const stale: Prop = { kind: 'roller', x: 894, y: 130, w: 6, h: 60, state: 'broken' };
    expect(rollerDoorSolids(stale, walls)).toEqual([]);
    // Even a prop that has forgotten it was broken: the wall list decides.
    const amnesiac: Prop = { kind: 'roller', x: 894, y: 130, w: 6, h: 60, state: 'shut' };
    expect(rollerDoorSolids(amnesiac, walls)).toEqual([]);
    // ...and while the wall IS there, the same prop fills the opening.
    const shut = mk();
    steps(shut, 4);
    expect(rollerDoorSolids(amnesiac, shut.snapshot().walls as Wall[]).length).toBe(7);
  });
});
