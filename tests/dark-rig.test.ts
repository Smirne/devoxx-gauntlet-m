/**
 * THE SHADOW RIG — `?chapter=5`, the proof of concept for body-occluded light.
 *
 * Michele, 26 Sep 2026: *"Can you make a poc / demonstration for the two no light
 * games?"* This is the measurement half of that answer. The rig's claims are
 * geometric, so they are measured rather than asserted:
 *
 *  - station B is possible for Biggy and **impossible for Voxxy from anywhere**, and
 *    the second half is the one that needs a sweep, because "she cannot" is a claim
 *    about every position in the corridor and not about one;
 *  - station A needs **two** bodies, because one disc that shadows both outer cells
 *    also shadows the sign between them;
 *  - and chapters 1–4 cast exactly what they cast before, because `buildLights`
 *    still occludes on walls alone unless a chapter hands it bodies.
 */

import { describe, expect, it } from 'vitest';

import {
  DT_MAX,
  createGame,
  type DebugGame,
  type DarkState,
} from '../src/sim';
import { DARK_RIG } from '../src/sim/chapters/demo-dark';
import { buildLights, litBy, rayCircle } from '../src/sim/lights';
import { DEFS } from '../src/sim/constants';

const SEED = 20260930;
const mk = (): DebugGame => createGame({ seed: SEED, chapter: 5, cards: false });
const rig = (g: DebugGame): DarkState => g.debug.chapter() as DarkState;

/** One frame with the lamp pinned to `pad` and one blocker pinned to `(x, y)`. */
function frame(g: DebugGame, pad: { x: number; y: number }, who: 'voxxy' | 'biggy', x: number, y: number): DarkState {
  g.debug.place('droid', pad.x, pad.y);
  g.debug.place(who, x, y);
  g.update(DT_MAX);
  return rig(g);
}

/** Park a robot at the far, empty end of the closed corridor, out of every beam. */
function park(g: DebugGame, who: 'voxxy' | 'biggy'): void {
  g.debug.place(who, who === 'voxxy' ? 520 : 560, 370);
}

describe('rayCircle', () => {
  const o = { x: 10, y: 0, r: 2 };

  it('stops a ray at the near face, and lets a miss through', () => {
    expect(rayCircle(0, 0, 1, 0, o)).toBeCloseTo(8, 6);
    // 3 px off the axis is wider than the 2 px body.
    expect(rayCircle(0, 3, 1, 0, o)).toBe(Infinity);
    // Behind the ray.
    expect(rayCircle(0, 0, -1, 0, o)).toBe(Infinity);
    // A grazing hit lands between the near face and the centre's distance.
    const t = rayCircle(0, 1.5, 1, 0, o);
    expect(t).toBeGreaterThan(8);
    expect(t).toBeLessThan(10);
  });

  it('answers 0 for a ray that starts inside — a buried lamp lights nothing', () => {
    expect(rayCircle(10, 0.5, 0, 1, o)).toBe(0);
  });
});

describe('body occlusion', () => {
  /*
   * The regression that matters more than the feature: every chapter but the rig
   * calls `buildLights` with three arguments, and three arguments must mean what
   * they meant before this round. Chapters 1 and 2 were playtested against light
   * that only walls could stop and their clue windows were measured against it.
   */
  it('changes nothing when a chapter hands it no bodies', () => {
    const g = mk();
    g.debug.place('droid', DARK_RIG.padA.x, DARK_RIG.padA.y);
    park(g, 'voxxy');
    park(g, 'biggy');
    g.update(DT_MAX);
    const snap = g.snapshot();
    const bots = snap.bots.map((b) => ({ ...b })) as never;
    const walls = g.debug.walls();
    const bare = buildLights(bots, walls, []);
    const mid = { x: DARK_RIG.padA.x, y: DARK_RIG.padA.y + 30 };
    expect(litBy(bare, 'droid', mid)).toBe(true);
    // The same cast, with a body sat on the point: now it is in shadow.
    const shaded = buildLights(bots, walls, [], [{ x: mid.x, y: mid.y, r: 8, kind: 'biggy' }]);
    expect(litBy(shaded, 'droid', mid)).toBe(false);
    // …and the lamp's own carrier never shadows its own lamp.
    const self = buildLights(bots, walls, [], [{ x: DARK_RIG.padA.x, y: DARK_RIG.padA.y, r: 8, kind: 'droid' }]);
    expect(litBy(self, 'droid', mid)).toBe(true);
  });
});

describe('station B — the wide sensor bar', () => {
  /**
   * The arithmetic the station is built on, restated from the radii rather than
   * copied from the chapter: a body of radius `r` can never be closer to the lamp
   * than `r + rDroid`, so its widest shadow at the bar is `D·tan(asin(r/d))`.
   */
  const widest = (r: number): number => {
    const d = r + DEFS.droid.r;
    return DARK_RIG.d * Math.tan(Math.asin(r / d));
  };

  it('is inside Biggy’s reach and outside Voxxy’s, by the radii alone', () => {
    expect(widest(DEFS.voxxy.r)).toBeLessThan(DARK_RIG.barHalf);
    expect(widest(DEFS.biggy.r)).toBeGreaterThan(DARK_RIG.barHalf);
  });

  it('latches for Biggy pressed against the lamp', () => {
    const g = mk();
    park(g, 'voxxy');
    const s = frame(g, DARK_RIG.padB, 'biggy', DARK_RIG.padB.x, DARK_RIG.padB.y + 16.5);
    expect(s.onB).toBe(true);
    expect(s.barDark).toBe(s.barOf);
    expect(s.doneB).toBe(true);
  });

  it('is impossible for Voxxy from anywhere in the corridor', () => {
    const g = mk();
    park(g, 'biggy');
    let best = 0;
    let worst = '';
    // Fine near the axis, where the only candidates are, and coarse out to the
    // walls, so the claim is about the corridor and not about one lane of it.
    const sweep = (dx: number, dy: number, step: number): void => {
      for (let x = DARK_RIG.padB.x - dx; x <= DARK_RIG.padB.x + dx; x += step) {
        for (let y = DARK_RIG.padB.y + 11.2; y <= DARK_RIG.padB.y + dy; y += step) {
          const s = frame(g, DARK_RIG.padB, 'voxxy', x, y);
          expect(s.doneB).toBe(false);
          if (s.onB && s.barDark > best) {
            best = s.barDark;
            worst = `${x.toFixed(1)},${y.toFixed(1)}`;
          }
        }
      }
    };
    sweep(6, 36, 1);
    sweep(60, 76, 4);
    // She gets a long way — this is a near miss by design, not a wall in the way.
    expect(best).toBeGreaterThan(DARK_RIG.barHalf / 5);
    expect(best).toBeLessThan(17);
    expect(worst).not.toBe('');
  });
});

describe('station A — the photocell pair', () => {
  it('cannot be solved by one body, at any distance on either ray', () => {
    const g = mk();
    park(g, 'biggy');
    for (let x = DARK_RIG.padA.x - 50; x <= DARK_RIG.padA.x + 50; x += 2) {
      for (let y = DARK_RIG.padA.y + 11.2; y <= DARK_RIG.padA.y + 68; y += 2) {
        const s = frame(g, DARK_RIG.padA, 'voxxy', x, y);
        expect(s.doneA).toBe(false);
        // The proof, frame by frame: two cells dark always costs the sign.
        if (s.cellsDark === 2) expect(s.signLit).toBe(false);
      }
    }
  });

  it('solves with one robot on each ray, and the sign still lit', () => {
    const g = mk();
    g.debug.place('droid', DARK_RIG.padA.x, DARK_RIG.padA.y);
    g.debug.place('voxxy', DARK_RIG.padA.x - 13.5, DARK_RIG.padA.y + 31.5);
    g.debug.place('biggy', DARK_RIG.padA.x + 15, DARK_RIG.padA.y + 35);
    g.update(DT_MAX);
    const s = rig(g);
    expect(s.onA).toBe(true);
    expect(s.cellsDark).toBe(2);
    expect(s.signLit).toBe(true);
    expect(s.doneA).toBe(true);
  });
});

describe('the rig is not part of the run', () => {
  it('is never reached by Skip chapter', () => {
    const g = createGame({ seed: SEED, chapter: 4, cards: false });
    g.skipChapter();
    expect(g.snapshot().chapter).toBe(4);
  });

  it('publishes tasks and props like any chapter, so the HUD needs no special case', () => {
    const g = mk();
    g.update(DT_MAX);
    const snap = g.snapshot();
    expect(snap.tasks.map((t) => t.id)).toEqual(['darkA', 'darkB']);
    expect(snap.props.filter((p) => p.kind === 'lamp-pad')).toHaveLength(2);
    expect(snap.props.filter((p) => p.kind === 'photocell')).toHaveLength(2);
    expect(snap.lights.length).toBeGreaterThan(0);
  });
});

/**
 * THE RIG HAS TO BE READABLE, which is a different question from whether it works.
 *
 * Michele, 28 Sep 2026, with a screenshot of it: *"I can't play chapter=5, i don't
 * understand where the sensors / what to block."* Every word of the rig was in the
 * objective and the run sheet; none of it was on the floor. Two 40 cm boxes and a
 * brown strip, in a corridor whose only light is a robot you have not parked yet.
 *
 * So each station paints its beam on the floor, from its pad to its sensors, and a
 * cell that still needs shading says so in the red the rest of the game uses for
 * "this is what is wrong". Both are pinned here: they are the answer to the note,
 * and a renderer change that drops either of them puts the rig back where it was.
 */
describe('the rig says where to stand', () => {
  it('paints a lane from each pad to its own sensors', () => {
    const g = mk();
    g.update(DT_MAX);
    const lanes = g.snapshot().props.filter((p) => p.kind === 'lane');
    expect(lanes, 'the two stations paint no beam on the floor').toHaveLength(2);
    const [a, b] = lanes.sort((p, q) => p.x - q.x);
    // Station A's lane spans its two cells and reaches from the pad to them.
    expect(a.x).toBeLessThanOrEqual(DARK_RIG.cellL.x);
    expect(a.x + (a.w ?? 0)).toBeGreaterThanOrEqual(DARK_RIG.cellR.x);
    expect(a.y).toBeCloseTo(DARK_RIG.padA.y, 6);
    expect(a.y + (a.h ?? 0)).toBeCloseTo(DARK_RIG.cellL.y, 6);
    // Station B's spans the whole bar, which is the thing that has to go dark.
    expect(b.x).toBeLessThanOrEqual(DARK_RIG.bar.x0);
    expect(b.x + (b.w ?? 0)).toBeGreaterThanOrEqual(DARK_RIG.bar.x1);
    expect(b.y + (b.h ?? 0)).toBeCloseTo(DARK_RIG.bar.y, 6);
  });

  it('shows a cell that still needs shading in red, and green once it is dark', () => {
    const g = mk();
    g.update(DT_MAX);
    const cells = (): string[] => g.snapshot().props.filter((p) => p.kind === 'photocell').map((p) => p.state ?? '');
    // Nobody on the pad: the lamp is elsewhere, the cells read dark, and a dark
    // cell is a solved cell — `done` either way, never the untinted `idle`.
    for (const s of cells()) expect(s === 'done' || s === 'broken').toBe(true);

    // Park the lamp and stand clear: both cells are lit now, and both say so.
    g.debug.place('droid', DARK_RIG.padA.x, DARK_RIG.padA.y);
    g.debug.place('voxxy', DARK_RIG.padA.x - 120, DARK_RIG.padA.y - 20);
    g.debug.place('biggy', DARK_RIG.padA.x + 140, DARK_RIG.padA.y - 20);
    g.update(DT_MAX);
    expect(rig(g).cellsDark, 'the cells should be lit with nobody in the beam').toBe(0);
    expect(cells()).toEqual(['broken', 'broken']);
  });
});
