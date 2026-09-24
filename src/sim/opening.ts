/**
 * opening.ts — the three of them arrive in crates, and the game starts.
 *
 * ## What this is
 *
 * Michele: *"we need an intro - starting point. I'd start with the three robots
 * frontal, on pedestal or pallets (imballati). They light up, get down and we are
 * ready to play."* Then, on where it happens: *"stage it in the corridor where
 * chapter 1 already starts"* — *"yes of course"* — and on skipping it — *"yes"*.
 *
 * So the opening is not a separate scene with its own set. Chapter 1 is already
 * running underneath it: the venue is built, the corridor is dark, the chapter's
 * own lamps and walls are live. What this module owns is a CLOCK and three
 * numbers per robot, and `game.ts` reads it to decide when to hand the keyboard
 * over.
 *
 * ## Why the beats are durations and not positions
 *
 * The same rule the cutscenes ended up with: every number here is a length of
 * time, and the only thing that moves the robots is the cutscene walker that
 * already exists (`startCut`), driven at a pace derived from the slowest robot's
 * own `max`. Nothing in this file may set a speed — that is what turned the
 * chapter transitions into a sprint at 263% of Droid's top speed, and it is a
 * physics-realism bug rather than a pacing one.
 *
 * ## The crate marks
 *
 * The crates stand in the corridor in a neat, evenly gapped row, because the
 * stencil spanning the three faces only reads if they do (`src/render/crates.ts`
 * — two letters per crate, so the crate centres must be evenly spaced). The
 * chapter's own start marks are NOT evenly spaced, so the robots walk from the
 * crates to their marks, and that walk is the "get down and we are ready to
 * play" beat rather than a teleport.
 */

import { DEFS } from './constants';
import type { RobotKind, ViewRect } from './types';

/** Sim px per metre — the crate row is measured in metres by the renderer. */
const PX_PER_M = 12.5;

/**
 * Where the crate row stands, in sim px: the centre of the row's FACE line.
 *
 * Hard against the corridor's north wall (the corridor is y 285..415), so the
 * crates stay out of the lane the player drives in once the game starts — they
 * are still there for the rest of the chapter, as scenery with colliders, which
 * is the half of Michele's option 2 worth keeping: *"crates remain after the
 * transition, non interactive"*. Vanishing them at the transition would be the
 * same discontinuity he objected to, only quicker.
 *
 * The deepest crate is Biggy's at 1.78 m, and `CRATE_ROW` is the FACE line, so
 * the row occupies y 285..307 and leaves the southern 108 px of corridor clear.
 */
const CRATE_ROW_Y = 307;
/** One stride south of the crates: out, and facing down the corridor. */
const STAND_Y = 324;
export const CRATE_ROW = { x: 96, y: CRATE_ROW_Y } as const;

/**
 * Where each robot STANDS once it has stepped out — a row in front of its own
 * crate, facing east, which is the way the corridor runs and the way they are
 * about to go.
 *
 * Michele, on the first cut of this sequence: *"The intermediate scene i don't
 * get it. Crates are there, robots in a different position, and then another
 * transition to same scene without crates?"* He was seeing a redundancy rather
 * than a shot: the step-down walked them the length of the corridor to the
 * chapter's own start marks, and the chapter then restarted underneath them,
 * which dropped the crates and re-placed the robots on one frame.
 *
 * So the chapter's marks ARE this row — `ch1-night.ts` places them here — and
 * the step-down is one stride out of a crate rather than a journey. Of his three
 * options he chose *"they start, but are in a similar position (next to each
 * other as in the crates)"*, with *"maybe all facing east?"*.
 */
export const STAND_AT: Record<RobotKind, { x: number; y: number }> = {
  voxxy: { x: CRATE_ROW.x - 1.72 * PX_PER_M, y: STAND_Y },
  droid: { x: CRATE_ROW.x - 0.26 * PX_PER_M, y: STAND_Y },
  biggy: { x: CRATE_ROW.x + 1.46 * PX_PER_M, y: STAND_Y },
};

/** Facing east, down the corridor: a sim heading of 0. */
export const STAND_FACE = 0;

/**
 * The three crates as floor plan, sim px — what a robot cannot drive through.
 *
 * They stay for the whole chapter (Michele: *"crates remain after the
 * transition, non interactive"*), so they are real obstacles and not a painting:
 * the one complaint this game has collected twice is walking through something
 * that is drawn solid. Depth is each crate's own, back from the row's FACE line,
 * and the row sits against the corridor's north wall so the lane stays clear.
 */
export const CRATE_RECTS: ReadonlyArray<{ kind: RobotKind; x: number; y: number; w: number; h: number }> = (
  [
    { kind: 'voxxy' as const, cx: -1.72, w: 1.38, d: 1.06 },
    { kind: 'droid' as const, cx: -0.26, w: 1.38, d: 1.16 },
    { kind: 'biggy' as const, cx: 1.46, w: 1.9, d: 1.78 },
  ]
).map((c) => ({
  kind: c.kind,
  x: CRATE_ROW.x + (c.cx - c.w / 2) * PX_PER_M,
  y: CRATE_ROW.y - c.d * PX_PER_M,
  w: c.w * PX_PER_M,
  h: c.d * PX_PER_M,
}));

/**
 * Each robot stands INSIDE its crate, not against the front of it — sim px.
 *
 * Two offsets, and getting either wrong is visible immediately. Across the row:
 * voxxy -1.72 m, droid -0.26 m, biggy +1.46 m from the row's centre, which is
 * the renderer's own layout and is what makes the crate centres evenly spaced so
 * the spanning word does not skew. And BACK from the face: `CRATE_ROW` is the
 * row's FACE line, the three faces are coplanar, and the crates have different
 * depths (1.06, 1.16, 1.78 m), so each robot sits back by half of its own. A
 * robot left on the face line stands half outside its crate — which is exactly
 * what the first frame strip showed.
 *
 * Stated here rather than imported because `src/sim` may not read `src/render`
 * (CLAUDE.md); `tests/opening.test.ts` asserts the two agree, so the copy cannot
 * drift.
 */
export const CRATE_AT: Record<RobotKind, { x: number; y: number }> = {
  voxxy: { x: CRATE_ROW.x - 1.72 * PX_PER_M, y: CRATE_ROW.y - (1.06 / 2) * PX_PER_M },
  droid: { x: CRATE_ROW.x - 0.26 * PX_PER_M, y: CRATE_ROW.y - (1.16 / 2) * PX_PER_M },
  biggy: { x: CRATE_ROW.x + 1.46 * PX_PER_M, y: CRATE_ROW.y - (1.78 / 2) * PX_PER_M },
};

/*
 * THE BEATS. Durations, never speeds — and one robot at a time.
 *
 * Michele, after the first cut: *"We might also add 1 for Voxxy, small and
 * swift, 2 for Droid, tall and thoughtful, 3 for biggy.. em.. sturdy? And they
 * come out one at a time?"* So the opening is a presentation, and it teaches the
 * three keys by using them: each robot's own slot shows its number while it is
 * the only thing moving on screen.
 *
 * That is also the whole instruction set for switching robots, delivered without
 * a single line of "press 1 to select Voxxy" — the thing he called *"very good"*
 * when it was first proposed.
 */
/** Black, before anything wakes — long enough for the title to have its say. */
export const LEAD = 1.6;
/** One robot's whole presentation: lamp, panel, step out, and a beat to be looked at. */
export const SLOT = 2.9;
/** Inside a slot, measured from its own start. */
export const LAMP_EACH = 0.55;
export const PANEL_DELAY = 0.5;
export const PANEL_EACH = 0.7;
export const STEP_DELAY = 1.25;
/**
 * How long the stride out of the crate takes — DERIVED, not chosen.
 *
 * The first version was 0.95 s flat and Droid came out at **48.7 px/s against a
 * top speed of 40.25**, which `tests/opening.test.ts` caught immediately. Two
 * things had been missed: his crate is deeper than the others so his stride is
 * the longest, and an ease has a peak faster than its average — the `u(2 - u)`
 * ease-out starts at twice the mean, which is the worst possible curve to leave
 * ahead of a speed limit.
 *
 * So the ease is a smoothstep (peak 1.5x the mean, both ends still) and the
 * duration falls out of the slowest robot's own `max`. Move a crate or a mark
 * and this re-sizes itself instead of quietly breaking the one rule the physics
 * score rests on.
 */
export const STEP_PEAK = 1.5;
/** Headroom under the limit, so a re-measure does not land exactly on it. */
const STEP_MARGIN = 1.25;
export const STEP_TIME = (['voxxy', 'droid', 'biggy'] as const).reduce((worst, kind) => {
  const from = CRATE_AT[kind];
  const to = STAND_AT[kind];
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(worst, (d * STEP_PEAK * STEP_MARGIN) / DEFS[kind].max);
}, 0.6);
/** Everyone is out and standing: the beat before the game takes the screen. */
export const HOLD = 0.8;
/** When the last robot has finished, and the one transition begins. */
export const WALK_AT = LEAD + SLOT * 2 + STEP_DELAY + STEP_TIME + HOLD;

/**
 * The title is up, held and gone before the first crate opens, so the crates
 * open onto a clear frame.
 */
export const TITLE_IN = 0.45;
export const TITLE_HOLD = 0.7;
export const TITLE_OUT = 0.45;

/**
 * The shot the whole presentation plays in: tight on the three crates.
 *
 * The crate module measured the legibility rather than guessing at it —
 * `DEVOXX` reads from 14 screen px per metre, the `ANTWERPEN · T.A.V. STEPHAN`
 * line from 34, the small red corner labels from 46, plus about 15% at the
 * diorama's pitch. The camera's own fit margin widens whatever rect it is given,
 * so this number was chosen by shooting it: at 116 px the row fills the middle
 * of the frame and every band on all three crates reads.
 */
export const VIEW_CRATES: ViewRect = { x: CRATE_ROW.x - 58, y: CRATE_ROW.y - 34, w: 116, h: 85 };

/** How long the camera takes to pull back from the crates to the corridor. */
export const PULL_BACK = 1.6;

/** What each robot is introduced as, in the order they come out. */
export const CARDS: Record<RobotKind, { key: number; name: string; line: string }> = {
  voxxy: { key: 1, name: 'VOXXY', line: 'small and swift' },
  droid: { key: 2, name: 'DROID', line: 'tall and thoughtful' },
  biggy: { key: 3, name: 'BIGGY', line: 'heavy and unstoppable' },
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (t: number, at: number, dur: number): number => clamp01((t - at) / dur);

/** The order the crates wake up in — small, tall, heavy. */
const ORDER: readonly RobotKind[] = ['voxxy', 'droid', 'biggy'];

/** Everything the renderer needs to draw the opening, for one frame. */
export interface OpeningView {
  /** Seconds since the first frame of the opening. */
  t: number;
  /** 0 dark .. 1 lit, per crate. */
  lamp: Record<RobotKind, number>;
  /** 0 shut .. 1 the front panel is off, per crate. */
  open: Record<RobotKind, number>;
  /**
   * 0 still inside .. 1 standing on its mark, per robot. The stride out of the
   * crate: `game.ts` reads it and puts the robot between `CRATE_AT` and
   * `STAND_AT`, which is the whole of the movement in this sequence.
   */
  step: Record<RobotKind, number>;
  /**
   * Whose presentation card is on screen, or `null`. One at a time, by design —
   * the card carries the robot's own switch key, so the opening teaches 1, 2 and
   * 3 by using them rather than by listing them.
   */
  card: RobotKind | null;
  /** 0..1 on the title card over the first shot. */
  title: number;
  /** True once the robots have started walking to their marks. */
  walking: boolean;
}

/**
 * The camera's rect at `t`: held tight on the crates, then pulled back to the
 * chapter's own framing as they step down.
 *
 * Eased, because a linear zoom reads as a machine moving the camera rather than
 * a shot opening up. `smoothstep` either end, on a rect the renderer already
 * knows how to frame — so this is one number interpolated, not a second camera.
 */
export function openingView(t: number, to: ViewRect): ViewRect {
  const u = clamp01((t - WALK_AT) / PULL_BACK);
  const e = u * u * (3 - 2 * u);
  const from = VIEW_CRATES;
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    w: from.w + (to.w - from.w) * e,
    h: from.h + (to.h - from.h) * e,
  };
}

/** The opening at time `t`. Pure: same `t`, same frame, every time. */
export function openingAt(t: number): OpeningView {
  const lamp = {} as Record<RobotKind, number>;
  const open = {} as Record<RobotKind, number>;
  const step = {} as Record<RobotKind, number>;
  let card: RobotKind | null = null;
  for (let i = 0; i < ORDER.length; i++) {
    const kind = ORDER[i];
    const at = LEAD + i * SLOT;
    lamp[kind] = ramp(t, at, LAMP_EACH);
    open[kind] = ramp(t, at + PANEL_DELAY, PANEL_EACH);
    step[kind] = ramp(t, at + STEP_DELAY, STEP_TIME);
    // Its card is up from the moment its lamp does until the next one starts —
    // so exactly one name is ever on screen, which is what makes it teach.
    if (t >= at && t < at + SLOT) card = kind;
  }
  // In, hold, out — the title is over the first shot and gone before the first
  // crate opens, so the thing it names is what the player is looking at.
  const title = t < TITLE_IN + TITLE_HOLD ? ramp(t, 0, TITLE_IN) : 1 - ramp(t, TITLE_IN + TITLE_HOLD, TITLE_OUT);
  return { t, lamp, open, step, card, title: clamp01(title), walking: t >= WALK_AT };
}
