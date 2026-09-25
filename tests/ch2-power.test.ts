/**
 * CHAPTER 2's SWITCHBOARD — what throwing a breaker actually DOES.
 *
 * Michele, 26 Sep 2026, playing chapter 2: *"the braker activation seems to do
 * nothing, apart from the message. A 56k like sound for the modem and a light on a
 * cabinet to signal you should go there?"*
 *
 * He is not asking for the chain to be undone — `tests/ch2-chain.test.ts` owns the
 * chain and the hall still must NOT light on the breakers. He is asking for the
 * feedback the chain promised and never built: `ch2-expo.ts` says in its own
 * comment beside the last breaker that *"what the player gets for the breakers is
 * a noise behind a door, and a reason to go and open it"*, and there was neither.
 * Three handles moved a few pixels in an unlit room, in silence.
 *
 * Two facts have to reach the renderer and the audio, and the sim is the only
 * thing allowed to decide either of them (CLAUDE.md):
 *
 *   1. **A handle was just thrown.** `Prop.progress` on the `breaker` panel — a
 *      strike clock, 1 on the frame the handle goes up and decaying to 0 — so the
 *      panel can flash as the board takes the load and `main.ts` has an edge to
 *      fire a cue off. Every handle, not only the last.
 *   2. **What the cabinet's pilot lamp is doing.** A `pilot` prop at the cabinet,
 *      whose `state` is the ELECTRICAL state of the thing behind the door and
 *      nothing else: dark with no supply, live while the unit inside is running,
 *      green once it has authorised. That is the "come here" light, and the reason
 *      it is keyed to the supply rather than to the door is that a lamp lit on a
 *      cabinet with no volts in it would be a lie — the player would walk to it
 *      and find a dead grey box.
 *
 * Everything here drives the public `Game` surface and reads `ExpoState` and
 * `GameSnapshot`; nothing reaches into the chapter's internals.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, GF, createGame, type DebugGame, type ExpoState, type Prop, type Vec2 } from '../src/sim';
import { PROP_DRAW, isFloorDecalOrHung } from './prop-geometry';

const SEED = 20260930;
const mk = (): DebugGame => createGame({ seed: SEED, chapter: 2, cards: false });

const expo = (g: DebugGame): ExpoState => g.debug.chapter() as ExpoState;
const prop = (g: DebugGame, kind: string): Prop | undefined => g.snapshot().props.find((p) => p.kind === kind);
const said = (g: DebugGame): string => g.snapshot().toast?.t ?? '';
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};

/** The cabinet's south face — the point `ch2-expo.ts` measures the whole beat from. */
const HUB: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };
/** The breaker panel, high on the technical room's back wall. */
const PANEL: Vec2 = { x: GF.panel.x + 13, y: GF.panel.y + 8 };

/** Droid, stood at the panel, ready to throw handles one at a time. */
function atPanel(g: DebugGame): void {
  g.debug.select('droid');
  g.debug.place('droid', PANEL.x + 20, PANEL.y + 30);
}

function powerUp(g: DebugGame): void {
  atPanel(g);
  for (let i = 0; i < 3; i++) g.key('KeyE');
}

function openCabinet(g: DebugGame): void {
  g.debug.select('biggy');
  g.debug.place('biggy', HUB.x, HUB.y + 30);
  g.key('KeyE');
}

function authorise(g: DebugGame): void {
  g.debug.select('voxxy');
  g.debug.place('voxxy', HUB.x, HUB.y + 20);
  g.key('KeyE');
  for (const ch of 'DEVOXXFOREVER') g.key(`Key${ch}`);
}

/* ====================================================== the breakers land === */

describe('chapter 2 — a thrown breaker does something', () => {
  /**
   * THE NOTE ITSELF, for the first two handles as much as for the third.
   *
   * The panel's `v` already said how many handles were up, and a handle moving a
   * few pixels up a wall in a blacked-out room is not feedback. `progress` is the
   * strike: the sim saying "a handle went up on THIS frame", which is the only
   * thing a renderer can flash off and the only edge a cue can ride.
   */
  it('strikes the panel on every handle, not just the last', () => {
    const g = mk();
    expect(prop(g, 'breaker')?.progress ?? 0, 'the panel is striking before anybody touched it').toBe(0);

    atPanel(g);
    for (let i = 1; i <= 3; i++) {
      g.key('KeyE');
      expect(prop(g, 'breaker')?.v, `handle ${i} did not go up`).toBe(i);
      expect(prop(g, 'breaker')?.progress, `handle ${i} went up without striking the board`).toBe(1);
      // ...and it is a strike, not a state: it decays on its own, so the next
      // handle has a rising edge of its own to fire.
      steps(g, 30);
      expect(prop(g, 'breaker')?.progress, `the strike from handle ${i} never went out`).toBe(0);
    }
    expect(expo(g).power).toBe(true);
  });

  /** And each handle says which circuit it just fed, rather than counting to three. */
  it('names the circuit on each handle, and the hall lighting is one of them', () => {
    const g = mk();
    atPanel(g);
    const lines: string[] = [];
    for (let i = 0; i < 3; i++) {
      g.key('KeyE');
      lines.push(said(g));
      steps(g, 2);
    }
    expect(new Set(lines).size, 'all three handles say the same thing').toBe(3);
    // The second handle is the one that explains the whole chapter: the lighting
    // circuit is FED and still open, because nothing has authorised it yet.
    expect(lines.join(' ')).toMatch(/lighting/i);
    expect(lines[2], 'the last handle does not read as the big one').toMatch(/transformer|mains|bars/i);
    // ...and none of them claims a lit hall.
    expect(expo(g).hallLit, 'the breakers lit the hall by themselves').toBe(false);
  });
});

/* ================================================== the cabinet says come === */

describe('chapter 2 — the cabinet pilot lamp', () => {
  /**
   * THE STATE TABLE, and the one line of it that matters: a lamp on a cabinet with
   * no supply in it is a lie, so the lamp is dark in BOTH of the dead states —
   * shut and dead, open and dead — and comes up the instant the board takes load.
   */
  it('is dark until there is a supply, whatever the door is doing', () => {
    // shut, dead.
    const g = mk();
    expect(prop(g, 'pilot')?.state, 'the cabinet is advertising a supply it has not got').toBe('idle');

    // open, dead: Biggy can shoulder it any time he likes — it is a door, not a
    // circuit — and what he finds is a cold box that must not pretend otherwise.
    openCabinet(g);
    expect(expo(g).router.cabinetOpen).toBe(true);
    expect(prop(g, 'pilot')?.state, 'an open dead cabinet lit its own lamp').toBe('idle');
    expect(prop(g, 'pilot')?.label ?? '').toMatch(/no supply|dead|dark/i);
  });

  it('comes up the moment the board takes load, with the door still shut', () => {
    const g = mk();
    powerUp(g);
    expect(expo(g).router.cabinetOpen, 'this beat is about a SHUT cabinet').toBe(false);
    expect(prop(g, 'pilot')?.state, 'the breakers went in and the cabinet said nothing').toBe('active');
    // ...and it is still not a lit hall. That is the regression this whole chain
    // exists to prevent (`tests/ch2-chain.test.ts`), restated where the lamp is.
    expect(expo(g).hallLit).toBe(false);
    expect(prop(g, 'breaker')?.state).toBe('active');
  });

  it('goes green when the router authorises, and only then', () => {
    const g = mk();
    powerUp(g);
    openCabinet(g);
    expect(prop(g, 'pilot')?.state).toBe('active');
    authorise(g);
    expect(expo(g).router.online).toBe(true);
    expect(prop(g, 'pilot')?.state).toBe('done');
  });

  /**
   * It is a lamp bolted to the top of a 1.75 m cabinet, not something you walk
   * into: `tests/colliders.test.ts` sweeps every drawn kind for a collider, and a
   * hung fitting is excused only because it is genuinely out of the robot band.
   */
  it('is a hung fitting at the cabinet, classified like every other drawn kind', () => {
    const g = mk();
    const p = prop(g, 'pilot');
    expect(p, 'chapter 2 publishes no pilot lamp at all').toBeDefined();
    if (!p) return;
    expect(PROP_DRAW.pilot, 'the pilot lamp is a kind nobody has classified').toBeDefined();
    expect(isFloorDecalOrHung(p), 'the pilot lamp is standing in the robot band with no collider').toBe(true);
    // On the cabinet, not somewhere near it.
    expect(p.x).toBeGreaterThanOrEqual(GF.cabinet.x - 2);
    expect(p.x + (p.w ?? 0)).toBeLessThanOrEqual(GF.cabinet.x + GF.cabinet.w + 2);
    expect(Math.abs(p.y - (GF.cabinet.y + GF.cabinet.h))).toBeLessThan(6);
  });

  /**
   * And the way into the room reads from the hall: the threshold plate lying in
   * the technical room's doorway is red while the room is dead, amber once there
   * is a supply in it, green when the room is finished with. The cabinet lamp is
   * four metres inside a doorway in a blacked-out hall; this is what is visible
   * from outside it.
   */
  it('turns the technical room threshold amber when the supply lands', () => {
    const g = mk();
    const plate = (): Prop | undefined =>
      g.snapshot().props.find((p) => p.kind === 'lane' && (p.label ?? '').includes('technical room'));
    expect(plate()?.state).toBe('broken');
    powerUp(g);
    expect(plate()?.state, 'the doorway says nothing changed').toBe('active');
    openCabinet(g);
    authorise(g);
    expect(plate()?.state).toBe('done');
  });
});
