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

/** The beats, in seconds from the first frame. Durations, never speeds. */
export const DARK = 1.1;
/** One lamp warming per robot, in order, overlapping by design. */
export const LAMP_EACH = 0.55;
export const LAMP_STEP = 0.4;
/** The front panel coming off, per crate, staggered the same way. */
export const PANEL_AT = DARK + LAMP_STEP * 2 + LAMP_EACH + 0.25;
export const PANEL_EACH = 0.75;
export const PANEL_STEP = 0.3;
/** When the walk to the chapter's own marks begins. */
export const WALK_AT = PANEL_AT + PANEL_STEP * 2 + PANEL_EACH;
/** How long the title holds at full before it fades under the lamps. */
/**
 * The title is up, held and gone before `PANEL_AT` — so the crates open onto a
 * clear frame. In, hold and out sum to 2.7 s, which is `PANEL_AT` exactly; if
 * either moves, `tests/opening.test.ts` says so rather than letting the title
 * sit across the one beat it is meant to introduce.
 */
export const TITLE_IN = 0.5;
export const TITLE_HOLD = 1.4;
export const TITLE_OUT = 0.8;

/**
 * The shot the opening opens on: tight on the three crates.
 *
 * The crate agent measured the legibility and gave a number rather than a
 * feeling — `DEVOXX` reads from 14 screen px per metre, the `ANTWERPEN ·
 * T.A.V. STEPHAN` line from 34, the small red corner labels from 46, and at the
 * diorama's own pitch add about 15%. Chapter 1's play framing works out at ~44
 * px/m, which reads the two spanning bands and loses the corner labels. This
 * The camera's own fit margin and HUD-safe area widen whatever rect they are
 * given — measured on the built page, a 200 px rect framed the 4.82 m row at
 * about 60 px/m rather than the 80 the arithmetic promised. So the number here was
 * chosen by shooting it rather than by arithmetic: at 116 px the row fills the
 * middle of the frame and every band on all three crates reads, including the
 * small red `HIGHLY FRAGILE`.
 */
export const VIEW_CRATES: ViewRect = { x: CRATE_ROW.x - 58, y: CRATE_ROW.y - 34, w: 116, h: 85 };

/**
 * The shot the step-out plays in: the crates plus the row in front of them, and
 * no more. The old sequence handed the walk chapter 1's whole rect, which is why
 * the camera appeared to cut somewhere else and back — the step is 17 px, so the
 * frame has no reason to move at all.
 */
export const VIEW_CRATES_OUT: ViewRect = { x: CRATE_ROW.x - 68, y: CRATE_ROW.y - 30, w: 136, h: 100 };

/** How long the camera takes to pull back from the crates to the corridor. */
export const PULL_BACK = 2.4;

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
  for (let i = 0; i < ORDER.length; i++) {
    const kind = ORDER[i];
    lamp[kind] = ramp(t, DARK + i * LAMP_STEP, LAMP_EACH);
    open[kind] = ramp(t, PANEL_AT + i * PANEL_STEP, PANEL_EACH);
  }
  // In, hold, out — the title is over the first shot and gone before the panels
  // drop, so the thing it names is what the player is looking at when it clears.
  const title = t < TITLE_IN + TITLE_HOLD ? ramp(t, 0, TITLE_IN) : 1 - ramp(t, TITLE_IN + TITLE_HOLD, TITLE_OUT);
  return { t, lamp, open, title: clamp01(title), walking: t >= WALK_AT };
}
