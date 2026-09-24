/**
 * THE CLUE PLATE HAS TO CLEAR WHATEVER IT IS LYING ON.
 *
 * Michele, with a screenshot of chapter 1's kiosk clue: *"this hint is
 * flickering."* The rings in the shot are dashed arcs rather than rings.
 *
 * The cause is coplanarity, and it is measurable without a browser. The marker
 * root is placed at `surfaceY(floorY, clue.x) + CLUE_PLATE_LIFT_M`, and the dark
 * backing disc, the three slot rings and the numeral all hang off it within
 * 12 mm. Chapter 1's clue 2 sits at the centre of the glass kiosk, and
 * `src/render/venue/floor1.ts` builds the kiosk's own floor as
 * `floorSlab(F1.kiosk, 0.02, …)`: an opaque, depth-writing box whose TOP FACE is
 * at y = 0.0200, 4.48 m square, which completely contains the marker's 2.16 m
 * spread. At a lift of 0.02 the two are the same plane to the last bit, so which
 * of the ring's pixels pass the depth test is decided by rasteriser rounding —
 * and re-decided every frame, because `updateFocus` eases the framing and moves
 * the orthographic camera by a fraction of a pixel. Broken arcs, and breaks that
 * crawl.
 *
 * The same 0.02 buried chapter 1's clue 4 completely: the exit-alcove plate is a
 * `flat` prop, and `drawProp` puts a flat prop's top face at
 * `surface + max(h, 0.03) + 0.01`, i.e. 0.06 for the alcove — four centimetres
 * ABOVE the marker, covering all of it.
 *
 * So this file asserts the one thing that makes both symptoms impossible: the
 * plate stands clear, by a real margin, of every opaque floor surface that can be
 * under a chapter-1 clue. It reads the lift out of `src/render/scene.ts` because
 * the constant lives inside `createScene`, which needs a WebGL canvas and cannot
 * be built here — the numbers it is checked against are measured from the real
 * scene graph and the real sim, not restated.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createGame } from '../src/sim/game';
import type { Clue, Prop } from '../src/sim/types';
import { m } from '../src/sim/units';
import { buildVenue, type Venue } from '../src/render/venue/index';
// Vite's own `?raw`, not `node:fs`: the repo has no `@types/node` and
// `tsconfig.json` pins `types` to `vite/client`, so this is the way a test here
// gets at a source file's text.
import SCENE_SRC from '../src/render/scene.ts?raw';

/**
 * The clearance the plate must keep over anything it is lying on, metres.
 *
 * 20 mm is what the foyer clue has always had (its floor tops out at y = 0) and
 * it is the clearance the marker was designed around. Coplanar is 0 mm; anything
 * under a millimetre or two is a depth fight at some zoom.
 */
const MIN_CLEARANCE_M = 0.02;

/**
 * The lift `updateClues` actually applies, read off the one line that applies it:
 *
 *     mark.root.position.set(m(clue.x), surfaceY(floorY, clue.x, clue.y) + <lift>, m(clue.y));
 *
 * `<lift>` may be a literal or a named constant; a name is resolved to its
 * declaration. Taking it from the call site rather than from a constant is the
 * point — a named constant that nothing uses would otherwise pass.
 */
function clueLiftFromSource(): number {
  const call = /mark\.root\.position\.set\(\s*m\(clue\.x\)\s*,\s*surfaceY\(floorY,\s*clue\.x,\s*clue\.y\)\s*\+\s*([A-Za-z0-9_$.]+)\s*,/.exec(
    SCENE_SRC,
  );
  expect(call, 'updateClues no longer lifts the marker root off surfaceY()').not.toBeNull();
  const token = (call as RegExpExecArray)[1];
  if (/^[0-9]*\.?[0-9]+$/.test(token)) return Number(token);
  const decl = new RegExp(`const\\s+${token.replace(/\$/g, '\\$')}\\s*(?::\\s*number\\s*)?=\\s*([0-9]*\\.?[0-9]+)\\s*;`).exec(SCENE_SRC);
  expect(decl, `cannot resolve the marker lift "${token}" to a number`).not.toBeNull();
  return Number((decl as RegExpExecArray)[1]);
}

/**
 * Every `flat: true` entry of the `PROPS` table, with the top face `drawProp`
 * gives it: `lift + max(h, 0.03) + 0.01` above the walking surface.
 */
function flatPropTops(): Map<string, { top: number; tl: boolean }> {
  const table = /const PROPS:[\s\S]*?\n};/.exec(SCENE_SRC);
  expect(table, 'src/render/scene.ts no longer declares a PROPS table').not.toBeNull();
  const out = new Map<string, { top: number; tl: boolean }>();
  const entry = /(['"]?)([\w-]+)\1:\s*\{([^}]*)\}/g;
  let hit: RegExpExecArray | null;
  while ((hit = entry.exec((table as RegExpExecArray)[0])) !== null) {
    const [, , kind, body] = hit;
    if (!/flat:\s*true/.test(body)) continue;
    const h = /\bh:\s*([0-9.]+)/.exec(body);
    if (!h) continue;
    const lift = /\blift:\s*([0-9.]+)/.exec(body);
    out.set(kind, {
      top: (lift ? Number(lift[1]) : 0) + Math.max(Number(h[1]), 0.03) + 0.01,
      tl: /\btl:\s*true/.test(body),
    });
  }
  expect(out.size, 'no flat floor plates found in PROPS — has the table been reformatted?').toBeGreaterThan(0);
  return out;
}

/** Chapter 1's clues and props, from the sim itself rather than from a fixture. */
function chapterOne(seed: number): { clues: Clue[]; props: Prop[] } {
  const game = createGame({ seed, chapter: 1, cards: false });
  const snap = game.snapshot();
  expect(snap.chapter).toBe(1);
  expect(snap.clues.length).toBeGreaterThan(0);
  return { clues: snap.clues.map((c) => ({ ...c })), props: snap.props.map((p) => ({ ...p })) };
}

/**
 * The highest opaque top face the venue puts under a point, metres, relative to
 * the first-floor datum. Chapter 1 plays on `floor: 'up'`, where `surfaceY` is
 * flat 0, so a world Y is a clearance.
 */
function venueTopUnder(venue: Venue, simX: number, simY: number): { top: number; what: string } {
  const wx = m(simX);
  const wz = m(simY);
  const box = new THREE.Box3();
  let top = -Infinity;
  let what = 'nothing';
  venue.floor1.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mat = o.material as THREE.Material & { depthWrite?: boolean };
    if (mat.depthWrite === false) return;
    box.setFromObject(o);
    if (box.min.x > wx || box.max.x < wx || box.min.z > wz || box.max.z < wz) return;
    // Floor-level only: a ceiling vault or a fascia band two metres up is not
    // what the plate is lying on.
    if (box.max.y > 0.5 || box.max.y < -0.5) return;
    if (box.max.y > top) {
      top = box.max.y;
      what = o.name || o.parent?.name || '(unnamed mesh)';
    }
  });
  // To the millimetre: these are authored numbers, and a `Box3` built from float32
  // vertices puts an authored 0 at 6e-10, which is not a clearance anybody owes.
  return { top: Math.round(top * 1000) / 1000, what };
}

/** Does a `flat` prop's footprint cover the point? */
function covers(p: Prop, tl: boolean, simX: number, simY: number): boolean {
  const w = p.w ?? 0;
  const h = p.h ?? 0;
  const x0 = tl ? p.x : p.x - w / 2;
  const y0 = tl ? p.y : p.y - h / 2;
  return simX >= x0 && simX <= x0 + w && simY >= y0 && simY <= y0 + h;
}

describe('the clue plate clears the floor it is drawn on', () => {
  it('stands clear of every opaque venue floor plate under a chapter-1 clue', () => {
    const lift = clueLiftFromSource();
    const venue = buildVenue();
    venue.group.updateMatrixWorld(true);
    try {
      // Four seeds: the digits are randomised per run, the clue POSITIONS are not,
      // but this is the sim's own list rather than a copy of it either way.
      for (const seed of [1, 7, 23, 101]) {
        const { clues } = chapterOne(seed);
        for (const c of clues) {
          const under = venueTopUnder(venue, c.x, c.y);
          expect(
            lift,
            `clue "${c.label}" at sim(${c.x}, ${c.y}) lies on "${under.what}", top y=${under.top.toFixed(4)}; ` +
              `a plate at ${lift} is ${(lift - under.top).toFixed(4)} m clear and needs ${MIN_CLEARANCE_M}`,
          ).toBeGreaterThanOrEqual(under.top + MIN_CLEARANCE_M);
        }
      }
    } finally {
      venue.dispose();
    }
  });

  it('stands clear of the flat prop plates chapter 1 lays over a clue', () => {
    const lift = clueLiftFromSource();
    const flats = flatPropTops();
    const { clues, props } = chapterOne(7);
    let checked = 0;
    for (const c of clues) {
      for (const p of props) {
        const spec = flats.get(p.kind);
        if (!spec || !covers(p, spec.tl, c.x, c.y)) continue;
        checked++;
        expect(
          lift,
          `clue "${c.label}" at sim(${c.x}, ${c.y}) is under the "${p.kind}" plate, top y=${spec.top.toFixed(4)}`,
        ).toBeGreaterThanOrEqual(spec.top + MIN_CLEARANCE_M);
      }
    }
    // Chapter 1's clue 4 sits inside the exit alcove, which IS a flat plate. If
    // this stops matching, the case the assertion exists for has moved.
    expect(checked, 'expected at least one chapter-1 clue to lie on a flat prop plate').toBeGreaterThan(0);
  });

  it('keeps the plate low enough to still read as a floor decal', () => {
    // The other half of the constraint: the marker is a decal, not a hovering
    // card. Anything past a robot's ankle stops reading as painted on the floor.
    expect(clueLiftFromSource()).toBeLessThanOrEqual(0.15);
  });
});
