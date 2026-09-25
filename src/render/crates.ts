/**
 * crates.ts — the three shipping crates the robots are unpacked from.
 *
 * Michele asked for an opening beat before chapter 1: the three robots stand
 * frontal on pallets, *imballati*, they light up, get down, and the game starts.
 * This module is the **crates only**. It draws them and hands back handles; the
 * choreography, the camera move and the instructions panel belong to the caller.
 *
 * ## What it is allowed to be
 *
 * Pure drawing. `src/sim` is the only source of truth and `src/render` only reads
 * it (CLAUDE.md), so there is no timer, no input, no state machine and no collider
 * in here: `buildCrates()` takes parameters and returns objects, `setLamp()` and
 * `setOpen()` take a number and move a material or a transform, and that is the
 * whole surface. The one thing it *does* read from the sim is data it would
 * otherwise have had to copy — the robots' radii (`DEFS.*.r`), their heights
 * (`ROBOT_HEIGHT_M`) and their lamp colours (`DEFS.*.light.c`) — because a crate
 * that does not fit its occupant kills the gag, and a number typed here is a
 * number that drifts.
 *
 * ## The stencils, and why the crate widths are what they are
 *
 * `docs/playtest-notes.md`, "Crate stencils — agreed 24 Sep", is the authority.
 * One shipping stencil spans all three crates rather than repeating per crate
 * (Michele: *"the antwerpen sticker could stretch between the 3 crates instead of
 * being repeated?"*): `DEVOXX` in a big band with **exactly two letters per
 * crate** — `DE` `VO` `XX` — so both seams fall between letters and no glyph is
 * ever cut by a gap, and a smaller continuous line under it reading
 * `ANTWERPEN · T.A.V. STEPHAN`. Per crate, in its own lower corner: Voxxy
 * `FRAGILE · THIS WAY UP` with the arrow upside down, Droid `DO NOT BEND`, Biggy
 * **both** `BULKY` and `HIGHLY FRAGILE` stacked as one block, plus a stoved-in
 * corner. `ZAAL 8` was dropped — three bands on one face is one too many.
 *
 * That spec has a geometric consequence nobody wrote down, and it is the reason
 * Voxxy's and Droid's crates are the **same width**:
 *
 * A word reads as one word when its tracking is constant. Two letters per crate
 * at a constant pitch `p` puts the pair centres `2p` apart, so the crate centres
 * must also be `2p` apart, so `2p = (wᵢ + wᵢ₊₁)/2 + GAP` for **every** adjacent
 * pair. With unequal widths those equations contradict each other and the word
 * skews — which is exactly the failure the notes warn about. Solve them and two
 * facts fall out:
 *
 *   1. adjacent crates must be equal width, and
 *   2. the tightest possible tracking is `GAP + 2·INK_MARGIN` — the letter gap
 *      *is* the crate gap plus the two edge margins, because the cross-seam gap
 *      and the intra-pair gap are the same number.
 *
 * The third crate is the escape hatch. Its pair sits hard against its **left**
 * margin rather than centred, so any surplus width falls into the right margin,
 * which is the *end* of the word where nobody can see it. So Biggy's crate is
 * free to be the oversize one — `BULKY`, as the shippers said — while Voxxy's and
 * Droid's share a width and differ in height and depth instead. Two cases from
 * the same crate-maker and one oversize special is also just what a real pallet of
 * freight looks like, so the constraint pays for itself.
 *
 * `crateLayout()` is that arithmetic, kept pure and free of THREE and of the DOM
 * so `tests/crates.test.ts` can assert the letters clear the seams from the very
 * numbers the canvas draws from. Nothing in the painting code re-derives a
 * position.
 *
 * **Not to be confused with `src/sim/crates.ts`**, which is a different thing
 * entirely: the beer crates Biggy stacks for the `OutOfMemoryError` joke in
 * chapter 3. That one is game state; this one is scenery, and neither imports the
 * other.
 *
 * ## Using it
 *
 *     const crates = buildCrates({ centre: { x: 12, z: 4 }, baseY: 0 });
 *     scene.add(crates.root);
 *     crates.byKind('voxxy').setLamp(0.8);   // 0..1, per crate
 *     crates.byKind('voxxy').setOpen(1);     // front panel tips out and lies flat
 *     // ... and to put a robot in one:
 *     voxxy.root.position.copy(crates.byKind('voxxy').anchor.getWorldPosition(v));
 *
 * `dispose()` releases every geometry, material and canvas texture it made.
 */

import * as THREE from 'three';

import { DEFS } from '../sim/constants';
import type { RobotKind } from '../sim/types';
import { PX_PER_M, ROBOT_HEIGHT_M, m } from '../sim/units';

import { SignPainter, type Paint } from './venue/signage';
import { venueSpec } from './venue/materials';
import { mergeSimple } from './venue/props';

/* ========================================================================== */
/*  Layout — pure arithmetic, no THREE, no DOM. The tests read this.          */
/* ========================================================================== */

/** Cap height of Helvetica/Arial at weight 800, as a fraction of the em. */
const CAP_RATIO = 0.716;

/** Sawn board thickness, metres. Everything is built out of this one board. */
export const PLANK_T = 0.05;
/** The pallet under each crate: three bearers and a deck. */
export const PALLET_H = 0.135;
/** Air between two crates' outer faces. Also the word's tracking, see the header. */
export const CRATE_GAP = 0.08;
/**
 * How far the **spanning word's cells** stay clear of a face edge, and therefore
 * of a seam. Load-bearing: it sets the word's tracking (see the header), so it is
 * as small as the layout will bear.
 */
export const INK_MARGIN = 0.05;
/**
 * The margin the two small bands use instead.
 *
 * They have no sidebearing to hide behind — a cell of `DEVOXX` is 12 % wider than
 * the glyph in it, and the small type is set solid — so at `INK_MARGIN` the first
 * and last characters of every small line ran under the 0.048 m corner battens
 * and came back clipped. The big band is unaffected and must not move.
 */
export const SMALL_MARGIN = 0.08;
/** Width of the battens on the face. Narrower than the body's: they sit over ink. */
const FACE_BATTEN = 0.048;

/** The big band: cap height and the top of the caps, metres above the crate floor. */
const BAND_CAP_H = 0.52;
const BAND_TOP = 1.4;
/** The continuous second line under it. */
const SUB_CAP_H = 0.17;
const SUB_TOP = 0.8;
/** The per-crate corner block's own band. */
const CORNER_TOP = 0.55;
const CORNER_BOTTOM = 0.1;

/** The spanning word. Six letters, two per crate — that is the whole constraint. */
const WORD = 'DEVOXX';
/** The continuous second line. Split across the three faces by width, never cut mid-glyph. */
const SUBLINE = 'ANTWERPEN · T.A.V. STEPHAN';

/**
 * The boxes, metres, excluding the pallet.
 *
 * Voxxy's and Droid's widths are equal **on purpose** — see the header; it is the
 * condition that keeps `DEVOXX` from skewing. Everything else is clearance over
 * the occupant: `tests/crates.test.ts` checks each interior against `DEFS.*.r` and
 * `ROBOT_HEIGHT_M`, so a crate can never quietly stop fitting its robot.
 */
const BOXES: Readonly<Record<RobotKind, { w: number; d: number; h: number }>> = Object.freeze({
  /** Small and square: 0.26 m of dunnage all round a 0.76 m robot. */
  voxxy: { w: 1.38, d: 1.06, h: 1.52 },
  /** The same case, stretched: 2.1 m of Droid needs 2.42 m of crate. */
  droid: { w: 1.38, d: 1.16, h: 2.42 },
  /** The oversize special. Tight on him at 0.18 m a side, which is what BULKY means. */
  biggy: { w: 1.9, d: 1.78, h: 1.8 },
});

/** Left to right, and the order is load-bearing: it spells the word. */
export const CRATE_ORDER: readonly RobotKind[] = Object.freeze(['voxxy', 'droid', 'biggy']);

/** The block of small type in each crate's own lower corner. */
const CORNER_LINES: Readonly<Record<RobotKind, readonly string[]>> = Object.freeze({
  voxxy: ['FRAGILE', 'THIS WAY UP'],
  droid: ['DO NOT BEND'],
  /** Two contradictory stencils, stacked so they read as one block (Michele, 24 Sep). */
  biggy: ['BULKY', 'HIGHLY FRAGILE'],
});

/** One glyph of the spanning word, positioned in assembly-local x. */
export interface StencilLetter {
  readonly char: string;
  /** Which crate's face it lands on. */
  readonly kind: RobotKind;
  /** Centre of the glyph's cell, assembly-local metres. */
  readonly x: number;
  /** Cell width. The drawn glyph is a little narrower still. */
  readonly cell: number;
}

/** One crate, as the layout sees it. */
export interface CrateGeom {
  readonly kind: RobotKind;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** Centre of the footprint, assembly-local metres. */
  readonly centreX: number;
  /**
   * Centre of the footprint in z, assembly-local metres — always `-depth/2`.
   *
   * THE FACES ARE COPLANAR, which the notes call out and the first build got
   * wrong. Centring every crate on z = 0 puts each front face at its own
   * `+depth/2`, so Biggy's stood 0.31 m nearer the camera than Droid's and, at
   * the diorama's 14 deg azimuth, ate 0.44 m of his neighbour's face — the `O` of
   * `VO` and the `E` of `DE` were both half hidden in the very shot the spanning
   * word exists for. Aligning the faces instead of the centres costs nothing and
   * is what "coplanar" means.
   */
  readonly centreZ: number;
  /** Interior clear dimensions, and the height of its floor above the ground. */
  readonly interior: { width: number; depth: number; height: number; floorY: number };
  /** The two letters of `DEVOXX` this face carries. */
  readonly letters: readonly StencilLetter[];
  /** This face's slice of the continuous second line. */
  readonly sub: string;
  /** This face's own corner block. */
  readonly corner: readonly string[];
}

/** Everything the painter and the tests need to agree on. */
export interface CrateLayout {
  readonly crates: readonly CrateGeom[];
  /** Centre x of each physical gap between crates, assembly-local metres. */
  readonly seams: readonly number[];
  /** Letter pitch: the distance between two glyph cell centres, anywhere in the word. */
  readonly pitch: number;
  /** Cell width. Constant across all six letters — an uneven one is a skewed word. */
  readonly cell: number;
  /** Total width of the three crates plus the two gaps. */
  readonly span: number;
  /** Tracking of the continuous second line, metres. One value for all three faces. */
  readonly subTrack: number;
  /**
   * What the whole second line measures, unset, at `band.subCapH` — metres.
   *
   * The painter compares it against what the browser's own font actually
   * measures and scales the cap height by the ratio. `Helvetica Neue` is not
   * installed in a headless Chromium and the fallback is materially wider, so a
   * line laid out on Helvetica's metrics and drawn in the fallback overran every
   * face by about a character. One measurement fixes all three at once and keeps
   * the tracking the layout chose.
   */
  readonly subNatural: number;
  readonly band: {
    readonly capH: number;
    readonly top: number;
    readonly subCapH: number;
    readonly subTop: number;
    readonly cornerTop: number;
    readonly cornerBottom: number;
  };
  readonly word: string;
  readonly subline: string;
}

/**
 * Helvetica/Arial advances, em units — the widths the canvas will actually use.
 *
 * They live here, in the pure layer, because **where** the continuous second line
 * is cut has to be decided by width and not by character count. Counting
 * characters is what the first build did, and it put eight glyphs of `N · T.A.`
 * — five of them punctuation — across the same 1.28 m that eight letters of
 * `ANTWERPE` filled, so the middle crate came out spaced like a ransom note. A
 * table of eleven numbers is the cost of the two faces matching.
 */
const ADV: Readonly<Record<string, number>> = Object.freeze({
  A: 0.722, B: 0.722, C: 0.722, D: 0.722, E: 0.667, F: 0.611, G: 0.778, H: 0.722,
  I: 0.278, J: 0.556, K: 0.722, L: 0.611, M: 0.833, N: 0.722, O: 0.778, P: 0.667,
  Q: 0.778, R: 0.722, S: 0.667, T: 0.611, U: 0.722, V: 0.667, W: 0.944, X: 0.667,
  Y: 0.667, Z: 0.611, '.': 0.278, ' ': 0.278, '\u00b7': 0.35,
});
const advance = (ch: string): number => ADV[ch] ?? 0.7;
const runEm = (text: string): number => [...text].reduce((a, ch) => a + advance(ch), 0);

/**
 * Cut `text` into one run per face, in proportion to each face's ink width.
 *
 * The cut always lands on a character boundary, and a boundary always lands in a
 * physical gap — so the second line is broken by the crates exactly as the word
 * above it is, and never mid-glyph.
 */
function splitByWidth(text: string, widths: readonly number[]): string[] {
  const total = runEm(text);
  const sum = widths.reduce((a, b) => a + b, 0);
  const out: string[] = [];
  let cut = 0;
  let target = 0;
  for (let f = 0; f < widths.length - 1; f++) {
    target += (total * widths[f]) / sum;
    // Walk to the boundary nearest this face's share of the whole string.
    let run = runEm(text.slice(0, cut));
    let best = cut;
    let bestErr = Infinity;
    for (let i = cut; i <= text.length; i++) {
      const err = Math.abs(run - target);
      if (err < bestErr) {
        bestErr = err;
        best = i;
      }
      if (i < text.length) run += advance(text[i]);
    }
    /*
     * Never start the next face with a full stop or a space. The width-nearest
     * boundary put `T.A` on the middle crate and `.V. STEPHAN` on Biggy's, which
     * is a legal split and an unreadable one; stepping one character on costs
     * 0.07 m of type and gives `PEN · T.A.` and `V. STEPHAN`.
     */
    while (best < text.length && (text[best] === '.' || text[best] === ' ')) best++;
    out.push(text.slice(cut, Math.max(best, cut + 1)));
    cut = Math.max(best, cut + 1);
    target = runEm(text.slice(0, cut));
  }
  out.push(text.slice(cut));
  return out;
}

/**
 * The whole arithmetic of the three-crate row, in assembly-local metres with the
 * row centred on x = 0 and every front face on z = +depth/2 of its own crate.
 *
 * Pure: no THREE, no canvas, no randomness. Call it in a test and call it in the
 * painter and they cannot disagree.
 */
export function crateLayout(): CrateLayout {
  const boxes = CRATE_ORDER.map((kind) => ({ kind, ...BOXES[kind] }));
  const span = boxes.reduce((a, b) => a + b.w, 0) + CRATE_GAP * (boxes.length - 1);

  // Left edges, centres and the seam centres between them.
  const centres: number[] = [];
  const seams: number[] = [];
  let x = -span / 2;
  for (let i = 0; i < boxes.length; i++) {
    centres.push(x + boxes[i].w / 2);
    x += boxes[i].w;
    if (i < boxes.length - 1) {
      seams.push(x + CRATE_GAP / 2);
      x += CRATE_GAP;
    }
  }

  /*
   * The pitch is fixed by the first two crates — it is half the distance between
   * their centres — and the cell width by what is left of a face once the pitch
   * and the two margins are taken out of it. See the header for why this is the
   * only solution rather than one taste among several.
   */
  const pitch = ((boxes[0].w + boxes[1].w) / 2 + CRATE_GAP) / 2;
  const cell = boxes[0].w - pitch - 2 * INK_MARGIN;

  // The six cells, from the first crate's pair being centred on its own face.
  const first = centres[0] - pitch / 2;
  const letters: StencilLetter[] = [];
  for (let k = 0; k < WORD.length; k++) {
    letters.push({
      char: WORD[k],
      kind: boxes[Math.floor(k / 2)].kind,
      x: first + k * pitch,
      cell,
    });
  }

  // The second line: each face takes a share of the string sized by its ink width.
  const inkWidths = boxes.map((b) => b.w - 2 * SMALL_MARGIN);
  const runs = splitByWidth(SUBLINE, inkWidths);
  /*
   * One tracking for the whole second line: the slack left once its natural width
   * at `SUB_CAP_H` is taken out of the three faces' ink, shared over every gap.
   * Same number on all three faces, so the line reads as one line.
   */
  const inkTotal = inkWidths.reduce((a, b) => a + b, 0);
  const subNatural = (runEm(SUBLINE) * SUB_CAP_H) / CAP_RATIO;
  const subTrack = Math.max(0, (inkTotal - subNatural) / Math.max(1, SUBLINE.length - 1));

  const crates: CrateGeom[] = boxes.map((b, i) => {
    const sub = runs[i];
    return {
      kind: b.kind,
      width: b.w,
      depth: b.d,
      height: b.h,
      centreX: centres[i],
      centreZ: -b.d / 2,
      interior: {
        width: b.w - 2 * PLANK_T,
        depth: b.d - 2 * PLANK_T,
        height: b.h - 2 * PLANK_T,
        floorY: PALLET_H + PLANK_T,
      },
      letters: letters.filter((l) => l.kind === b.kind),
      sub,
      corner: CORNER_LINES[b.kind],
    };
  });

  return {
    crates,
    seams,
    pitch,
    cell,
    span,
    subTrack,
    subNatural,
    band: {
      capH: BAND_CAP_H,
      top: BAND_TOP,
      subCapH: SUB_CAP_H,
      subTop: SUB_TOP,
      cornerTop: CORNER_TOP,
      cornerBottom: CORNER_BOTTOM,
    },
    word: WORD,
    subline: SUBLINE,
  };
}

/* ========================================================================== */
/*  Colour                                                                    */
/* ========================================================================== */

/**
 * The timber, derived from the venue's own `wood` rather than typed again.
 *
 * `venueSpec('wood')` is the reception's walnut slats — too dark and too red for
 * a packing case, so it is mixed toward raw deal. Reading the hue from the palette
 * rather than pasting a hex is the same move `src/render/seats.ts` makes, and for
 * the same reason: this repo keeps growing second answers to "what colour is X".
 */
const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const ch = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
};

const DEAL = mix(venueSpec('wood').color, '#ddc39b', 0.46);
const DEAL_DARK = mix(DEAL, '#24180c', 0.42);
const DEAL_PALE = mix(DEAL, '#f0ddb8', 0.42);
/** Stencil ink: bitumen black, never quite opaque over sawn grain. */
const INK = '#1d1a16';
/** The warning stencils. Faded oxide red, the colour a FRAGILE stamp actually is. */
const INK_RED = '#9d3326';

/**
 * What `setLamp(1)` actually adds.
 *
 * Not 1: the decal is additive over a face that is already taking room light, and
 * at full strength Biggy's blue came back white — the hue washed straight out of
 * the one thing the beat is for, which is knowing WHICH robot just woke up.
 */
const LAMP_PEAK = 0.82;

/** A robot's lamp colour, straight off the frozen light definition. */
const lampColour = (kind: RobotKind): THREE.Color => {
  const [r, g, b] = DEFS[kind].light.c;
  return new THREE.Color(r / 255, g / 255, b / 255);
};

/* ========================================================================== */
/*  Canvas — the stencils                                                     */
/* ========================================================================== */

/** Same stack `src/render/venue/signage.ts` paints every other sign with. */
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** A tiny deterministic PRNG, so a crate looks the same in every screenshot. */
function rng(seed: number): () => number {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/**
 * Draw one glyph as if sprayed through a template: a heavy sans with the stencil's
 * own bridges cut across it, a little overspray, and a ragged edge.
 *
 * It is composited through an offscreen layer rather than straight onto the
 * timber, because the bridges and the ragged edge are `destination-out` erasures
 * and erasing on the timber canvas would take the planks with them.
 */
function sprayGlyph(
  ctx: CanvasRenderingContext2D,
  ch: string,
  cx: number,
  baseline: number,
  capPx: number,
  cellPx: number,
  colour: string,
  r: () => number,
): void {
  if (ch === ' ') return;
  const size = capPx / CAP_RATIO;
  ctx.font = `800 ${size}px ${FONT}`;
  const wide = ctx.measureText(ch).width || size * 0.6;
  /*
   * Glyphs fill at most 0.88 of their cell — the rest is the sidebearing that
   * keeps the outermost letter of a pair clear of the seam by the full margin —
   * but they are never *stretched* to reach it. Forcing every glyph to one width
   * is how the first build got an E as wide as a D: a stencil is monospaced in
   * its cells, not in its letterforms.
   */
  const target = cellPx * 0.88;
  const sx = Math.min(1, target / wide);
  const drawn = wide * sx;

  ctx.save();
  ctx.translate(cx, baseline);
  ctx.scale(sx, 1);
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, 0, 0);
  // Overspray: the halo a rattle can leaves round a template's edge.
  ctx.globalAlpha = 0.09;
  for (let i = 0; i < 3; i++) {
    ctx.fillText(ch, (r() - 0.5) * capPx * 0.09, (r() - 0.5) * capPx * 0.07);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  /*
   * Bridges go only on letters that HAVE a counter to hold in. The first build
   * bridged every glyph and the two X's came back looking like hazard chevrons —
   * a real stencil ties nothing on an X, because there is nothing to fall out.
   */
  if (COUNTERED.has(ch)) {
    const bw = capPx * 0.08;
    for (const f of [0.32, 0.68]) {
      ctx.fillRect(cx - drawn * 0.62, baseline - capPx * f - bw / 2, drawn * 1.24, bw);
    }
  }
  // Ragged edge: a scatter of small bites out of the ink, so it is sprayed rather
  // than printed. Small enough never to break a stroke.
  for (let i = 0; i < 16; i++) {
    const px = cx + (r() - 0.5) * drawn * 1.1;
    const py = baseline - r() * capPx;
    ctx.beginPath();
    ctx.arc(px, py, capPx * (0.01 + r() * 0.022), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The letters with an enclosed counter — the only ones a stencil has to tie. */
const COUNTERED: ReadonlySet<string> = new Set(['A', 'B', 'D', 'O', 'P', 'Q', 'R']);

/** Natural width, in px, of a run of glyphs at this cap height and tracking. */
function runWidth(ctx: CanvasRenderingContext2D, text: string, capPx: number, track: number): number {
  ctx.font = `800 ${capPx / CAP_RATIO}px ${FONT}`;
  return ctx.measureText(text).width + track * Math.max(0, text.length - 1);
}

/**
 * The largest cap height at which `text` still fits `maxPx`, never above `start`.
 *
 * `DO NOT BEND` and `THIS WAY UP` both ran off the end of their faces in the
 * first build, which is the one failure a stencil cannot survive — a label that
 * is cut off says nothing at all. Fitting is cheap and it means the corner blocks
 * cannot be broken by someone editing the words.
 */
function fitCap(ctx: CanvasRenderingContext2D, text: string, maxPx: number, start: number, trackFrac: number): number {
  let cap = start;
  for (let i = 0; i < 40 && cap > 4; i++) {
    if (runWidth(ctx, text, cap, cap * trackFrac) <= maxPx) break;
    cap *= 0.94;
  }
  return cap;
}

/**
 * A line of stencil type laid out left to right from `x0`, glyph by glyph, so the
 * tracking is ours rather than the font's. Returns the width it used.
 */
function sprayLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x0: number,
  baseline: number,
  capPx: number,
  track: number,
  colour: string,
  r: () => number,
): number {
  ctx.font = `800 ${capPx / CAP_RATIO}px ${FONT}`;
  let x = x0;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    sprayGlyph(ctx, ch, x + w / 2, baseline, capPx, w / 0.88, colour, r);
    x += w + track;
  }
  return x - track - x0;
}

/** The `THIS WAY UP` chevrons — drawn upside down, which is the joke. */
function upsideDownArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, colour: string): void {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.translate(cx, cy);
  // A stem with a head, pointing DOWN: the crate was packed the wrong way up.
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(-s * 0.32, -s);
  ctx.lineTo(s * 0.32, -s);
  ctx.lineTo(s * 0.32, s * 0.12);
  ctx.lineTo(s * 0.86, s * 0.12);
  ctx.lineTo(0, s);
  ctx.lineTo(-s * 0.86, s * 0.12);
  ctx.lineTo(-s * 0.32, s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The rows of board gaps on a face, as fractions of its height. */
function boardGaps(heightM: number, boardH = 0.215): number[] {
  const n = Math.max(3, Math.round(heightM / boardH));
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push((i * heightM) / n);
  return out;
}

/**
 * The timber a face is made of: boards, grain, knots, nail rows, and the dark
 * gap between every pair of boards.
 */
function paintTimber(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: number,
  crate: CrateGeom,
  r: () => number,
): void {
  ctx.fillStyle = DEAL;
  ctx.fillRect(0, 0, w, h);

  const gaps = boardGaps(crate.height);
  const edges = [0, ...gaps.map((g) => crate.height - g), crate.height].sort((a, b) => a - b);

  for (let i = 0; i < edges.length - 1; i++) {
    const y0 = edges[i] * s;
    const y1 = edges[i + 1] * s;
    // Every board is sawn off a different part of the log.
    ctx.fillStyle = mix(DEAL, r() > 0.48 ? DEAL_PALE : DEAL_DARK, 0.12 + r() * 0.4);
    ctx.fillRect(0, y0, w, y1 - y0);

    // Grain: long wandering strokes down the board's length.
    ctx.strokeStyle = 'rgba(56,36,18,0.15)';
    for (let k = 0; k < 10; k++) {
      const gy = y0 + (r() * (y1 - y0));
      const amp = (y1 - y0) * 0.09;
      ctx.lineWidth = 0.7 + r() * 1.6;
      ctx.beginPath();
      ctx.moveTo(-4, gy);
      for (let px = 0; px <= w; px += w / 10) {
        ctx.lineTo(px, gy + Math.sin((px / w) * 6.2 + k) * amp);
      }
      ctx.stroke();
    }

    // A knot or two per board, with its rings.
    if (r() > 0.45) {
      const kx = w * (0.08 + r() * 0.84);
      const ky = y0 + (y1 - y0) * (0.3 + r() * 0.4);
      const kr = (y1 - y0) * (0.1 + r() * 0.12);
      for (let ring = 3; ring >= 1; ring--) {
        ctx.fillStyle = `rgba(62,40,20,${0.1 * ring})`;
        ctx.beginPath();
        ctx.ellipse(kx, ky, kr * ring * 0.5, kr * ring * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The dark gap at the board's bottom edge, with the lit arris above it.
    ctx.fillStyle = 'rgba(24,15,7,0.62)';
    ctx.fillRect(0, y1 - s * 0.012, w, s * 0.012);
    ctx.fillStyle = 'rgba(255,238,205,0.2)';
    ctx.fillRect(0, y1 - s * 0.02, w, s * 0.008);
  }

  // Nail heads down the two stiles, where the battens land.
  ctx.fillStyle = 'rgba(40,32,26,0.5)';
  for (const nx of [w * 0.045, w * 0.955]) {
    for (let i = 0; i < edges.length - 1; i++) {
      const ny = (edges[i] * s + edges[i + 1] * s) / 2;
      ctx.beginPath();
      ctx.arc(nx, ny, s * 0.009, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * One crate's front face, timber and ink together.
 *
 * Every ink position comes out of `crateLayout()` and is converted here, once,
 * from assembly-local metres to canvas pixels. Nothing is eyeballed and nothing
 * is re-derived: the spanning word is placed by the same numbers the test asserts
 * the seam clearances from.
 */
function paintFace(layout: CrateLayout, crate: CrateGeom, seed: number): Paint {
  return (ctx, w, h) => {
    const s = w / crate.width; // canvas px per metre
    const faceLeft = crate.centreX - crate.width / 2;
    const toX = (xm: number): number => (xm - faceLeft) * s;
    const toY = (ym: number): number => (crate.height - ym) * s;
    const r = rng(seed);

    paintTimber(ctx, w, h, s, crate, r);

    /*
     * The ink goes on an offscreen layer first. The stencil bridges and the
     * ragged edge are `destination-out` erasures, so they have to bite into the
     * ink and nothing else; composited back at 0.9 the black sits ON the timber
     * with the grain still showing through, which is the whole look.
     */
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const lc = layer.getContext('2d');
    if (!lc) return;

    // --- band 1: the two letters of DEVOXX this face carries.
    const capPx = layout.band.capH * s;
    const baseline = toY(layout.band.top - layout.band.capH);
    for (const letter of crate.letters) {
      sprayGlyph(lc, letter.char, toX(letter.x), baseline, capPx, letter.cell * s, INK, r);
    }

    // --- band 2: this face's slice of the continuous second line. Centred on the
    // face's own ink area at the layout's single tracking, so the three runs read
    // as one line broken by the crates rather than as three justified blocks.
    if (crate.sub.length > 0) {
      const track = layout.subTrack * s;
      const inkW = (crate.width - 2 * SMALL_MARGIN) * s;
      // Correct the cap height for whatever font this browser actually resolved.
      const nominal = layout.band.subCapH * s;
      const whole = runWidth(lc, layout.subline, nominal, 0);
      let subCap = nominal * Math.min(1, (layout.subNatural * s) / Math.max(1, whole));
      // ...then let a single face shrink a hair more if its own share still spills.
      subCap *= Math.min(1, (inkW * 0.97) / Math.max(1, runWidth(lc, crate.sub, subCap, track)));
      const used = runWidth(lc, crate.sub, subCap, track);
      const x0 = SMALL_MARGIN * s + Math.max(0, (inkW - used) / 2);
      sprayLine(lc, crate.sub, x0, toY(layout.band.subTop - layout.band.subCapH), subCap, track, INK, r);
    }

    // --- band 3: the crate's own corner block, lower left. Biggy's stops well
    // short of his right-hand end: that is where the crate is stoved in.
    const arrow = crate.kind === 'voxxy';
    const textX = (arrow ? SMALL_MARGIN + 0.28 : SMALL_MARGIN) * s;
    const room =
      (crate.kind === 'biggy' ? crate.width * 0.56 : crate.width - 2 * SMALL_MARGIN) * s -
      (textX - SMALL_MARGIN * s);
    let cornerCap = 0.125 * s;
    for (const line of crate.corner) cornerCap = Math.min(cornerCap, fitCap(lc, line, room, cornerCap, 0.07));
    const lead = cornerCap * 1.62;
    const blockTop = toY(layout.band.cornerTop);
    crate.corner.forEach((line, i) => {
      sprayLine(lc, line, textX, blockTop + cornerCap + i * lead, cornerCap, cornerCap * 0.07, INK_RED, r); // every warning in oxide red, Droid's too (Michele, 25 Sep)
    });
    if (arrow) {
      // "THIS WAY UP", and it is upside down. Michele's note, taken literally.
      upsideDownArrow(lc, (SMALL_MARGIN + 0.105) * s, blockTop + lead * 0.8, 0.26 * s, INK_RED);
    }

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();

    /*
     * The board gaps go back over the ink. A stencil sprayed onto a made-up case
     * breaks at every seam, and drawing them afterwards is what stops the band
     * looking like a decal stuck on a flat panel.
     */
    for (const g of boardGaps(crate.height)) {
      ctx.fillStyle = 'rgba(24,15,7,0.55)';
      ctx.fillRect(0, toY(g) - s * 0.012, w, s * 0.012);
    }

    if (crate.kind === 'biggy') paintStoveIn(ctx, w, h, s, r);

    // Freight grime: the bottom of a case that has been dragged about.
    const grime = ctx.createLinearGradient(0, h, 0, h * 0.78);
    grime.addColorStop(0, 'rgba(22,16,9,0.42)');
    grime.addColorStop(1, 'rgba(22,16,9,0)');
    ctx.fillStyle = grime;
    ctx.fillRect(0, h * 0.78, w, h * 0.22);

    // A soft shade down the two stiles: the battens standing proud of the face.
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.22)');
    shade.addColorStop(0.12, 'rgba(0,0,0,0)');
    shade.addColorStop(0.88, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
  };
}

/**
 * Biggy's stoved-in corner, painted: a crushed shadow, splintered board ends and
 * a split running up out of the damage.
 *
 * It goes in the **lower right**, which is the one part of his face the layout
 * leaves empty — his pair of letters sits hard against his left margin and the
 * surplus width falls to the right (see the header). So the two things that make
 * his crate his, the double warning and the damage, never fight each other.
 */
function paintStoveIn(ctx: CanvasRenderingContext2D, w: number, h: number, s: number, r: () => number): void {
  const cx = w * 0.82;
  const cy = h * 0.84;
  const rad = s * 0.38;

  // The shadow the caved-in boards sit in: an angular hollow, not a bruise.
  ctx.save();
  ctx.beginPath();
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rr = rad * (0.55 + r() * 0.5);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.72]);
  }
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
  ctx.closePath();
  const crush = ctx.createRadialGradient(cx, cy, rad * 0.05, cx, cy, rad);
  crush.addColorStop(0, 'rgba(10,7,3,0.86)');
  crush.addColorStop(1, 'rgba(36,24,12,0.35)');
  ctx.fillStyle = crush;
  ctx.fill();
  ctx.restore();

  // Broken board ends stepping back into the hollow: short, pale, and roughly
  // level with the boarding they were torn out of. Four, not six, and only
  // slightly off the horizontal — a scatter of little tilted rectangles reads as
  // confetti rather than as timber.
  for (let i = 0; i < 4; i++) {
    const bx = cx + (r() - 0.5) * rad * 1.1;
    const by = cy + (r() - 0.5) * rad * 0.95;
    const bw = rad * (0.3 + r() * 0.3);
    const bh = rad * (0.07 + r() * 0.05);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate((r() - 0.5) * 0.3);
    ctx.fillStyle = `rgba(226,203,163,${0.3 + r() * 0.35})`;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = 'rgba(20,13,6,0.55)';
    ctx.fillRect(-bw / 2, bh / 2 - bh * 0.25, bw, bh * 0.3);
    ctx.restore();
  }

  // A few short fibres still attached at the rim. Kept inside the hollow: run
  // them out past it and they read as whiskers drawn on the crate.
  ctx.strokeStyle = 'rgba(232,211,172,0.4)';
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    ctx.lineWidth = 1 + r() * 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rad * 0.45, cy + Math.sin(a) * rad * 0.36);
    ctx.lineTo(cx + Math.cos(a) * rad * 0.72, cy + Math.sin(a) * rad * 0.58);
    ctx.stroke();
  }

  // The split that ran up out of the impact.
  ctx.strokeStyle = 'rgba(14,9,4,0.8)';
  ctx.lineWidth = s * 0.014;
  ctx.beginPath();
  let y = cy - rad * 0.75;
  let x = cx - rad * 0.2;
  ctx.moveTo(x, y);
  while (y > h * 0.44) {
    y -= s * 0.06;
    x += (r() - 0.5) * s * 0.055;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * The same face as a glow mask: black everywhere, white where light gets out.
 *
 * It is used as an additive decal in front of the panel, so black adds nothing
 * and the crate stays a crate until `setLamp()` turns its robot on. Board gaps,
 * knot holes and — on Biggy — the split at the stoved-in corner are the only
 * places a packed robot's lamp can show, and that is exactly the shot: dark, then
 * three cases with something awake inside them.
 */
function paintGlowMask(crate: CrateGeom, seed: number): Paint {
  return (ctx, w, h) => {
    const s = w / crate.width;
    const toY = (ym: number): number => (crate.height - ym) * s;
    const r = rng(seed ^ 0x5eed);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.shadowColor = '#ffffff';

    // Light through every board gap, brightest in the middle of the panel where
    // the boards have sprung, fading out at the battens.
    for (const g of boardGaps(crate.height)) {
      const y = toY(g);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      const heat = 0.35 + r() * 0.4;
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.18, `rgba(255,255,255,${heat * 0.55})`);
      grad.addColorStop(0.5, `rgba(255,255,255,${heat})`);
      grad.addColorStop(0.82, `rgba(255,255,255,${heat * 0.55})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.shadowBlur = s * 0.02;
      ctx.fillRect(0, y - s * 0.009, w, s * 0.018);
    }
    ctx.shadowBlur = 0;

    // A few knot holes that went all the way through.
    for (let i = 0; i < 5; i++) {
      const kx = w * (0.12 + r() * 0.76);
      const ky = h * (0.15 + r() * 0.7);
      const kr = s * (0.012 + r() * 0.02);
      const g2 = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr * 3);
      g2.addColorStop(0, 'rgba(255,255,255,0.95)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(kx, ky, kr * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (crate.kind === 'biggy') {
      // The split above the damage is the widest opening on any of the three.
      const cx = w * 0.8;
      const g3 = ctx.createLinearGradient(cx - s * 0.06, 0, cx + s * 0.06, 0);
      g3.addColorStop(0, 'rgba(0,0,0,0)');
      g3.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      g3.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g3;
      ctx.fillRect(cx - s * 0.06, h * 0.44, s * 0.12, h * 0.36);
    }

    // Nothing leaks where the lid and the pallet clamp the boards shut.
    const ends = ctx.createLinearGradient(0, 0, 0, h);
    ends.addColorStop(0, 'rgba(0,0,0,1)');
    ends.addColorStop(0.07, 'rgba(0,0,0,0)');
    ends.addColorStop(0.93, 'rgba(0,0,0,0)');
    ends.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = ends;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  };
}

/* ========================================================================== */
/*  Geometry                                                                  */
/* ========================================================================== */

/**
 * A wall of horizontal boards, `w` wide and `h` tall, `t` thick, in a local frame
 * with x centred, y running 0..h and the board faces on z = 0.
 *
 * Rough sawn, not milled: every board gets a little depth jitter and a fraction of
 * a degree of roll, which is the difference between a crate and a cardboard box.
 */
function plankWall(w: number, h: number, t: number, r: () => number, boardH = 0.215): THREE.BufferGeometry[] {
  const n = Math.max(3, Math.round(h / boardH));
  const gap = 0.012;
  const bh = (h - gap * (n - 1)) / n;
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(w, bh, t * (0.92 + r() * 0.2));
    g.rotateX((r() - 0.5) * 0.012);
    g.translate(0, i * (bh + gap) + bh / 2, (r() - 0.5) * t * 0.22);
    out.push(g);
  }
  return out;
}

/** A batten: the sawn cleat that holds a crate's corners and edges together. */
function batten(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/**
 * A pallet: three bearers, a top deck of five boards and two bottom runners. The
 * crate does not stand on the floor, it stands on this, which is half of what
 * says "freight" before any lettering does.
 */
function palletGeometry(w: number, d: number, r: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const deck = 0.028;
  const bearer = PALLET_H - deck * 2;

  for (let i = 0; i < 3; i++) {
    const z = -d / 2 + (d * (i + 0.5)) / 3;
    parts.push(batten(w * 0.98, bearer, d * 0.11, 0, deck + bearer / 2, z));
  }
  const boards = 5;
  for (let i = 0; i < boards; i++) {
    const z = -d / 2 + (d * (i + 0.5)) / boards;
    const bw = (d / boards) * 0.82;
    const g = new THREE.BoxGeometry(w, deck, bw);
    g.rotateX((r() - 0.5) * 0.01);
    g.translate(0, PALLET_H - deck / 2, z);
    parts.push(g);
  }
  for (const z of [-d / 2 + d * 0.1, d / 2 - d * 0.1]) {
    parts.push(batten(w, deck, d * 0.16, 0, deck / 2, z));
  }
  return mergeSimple(parts);
}

/** A crate body's BOARDS: back, two sides, floor and lid — minus the front. */
function bodyGeometry(c: CrateGeom, r: () => number): THREE.BufferGeometry {
  const { width: w, depth: d, height: h } = c;
  const t = PLANK_T;
  const parts: THREE.BufferGeometry[] = [];

  // Back.
  for (const g of plankWall(w, h, t, r)) {
    g.translate(0, 0, -d / 2 + t / 2);
    parts.push(g);
  }
  // Sides.
  for (const sign of [-1, 1]) {
    for (const g of plankWall(d - 2 * t, h, t, r)) {
      g.rotateY(Math.PI / 2);
      g.translate(sign * (w / 2 - t / 2), 0, 0);
      parts.push(g);
    }
  }
  // Floor and lid.
  parts.push(batten(w, t, d, 0, t / 2, 0));
  const lidBoards = Math.max(3, Math.round(d / 0.24));
  for (let i = 0; i < lidBoards; i++) {
    const bd = (d / lidBoards) * 0.94;
    const g = new THREE.BoxGeometry(w, t, bd);
    g.rotateZ((r() - 0.5) * 0.01);
    g.translate(0, h - t / 2, -d / 2 + (d * (i + 0.5)) / lidBoards);
    parts.push(g);
  }

  return mergeSimple(parts);
}

/**
 * A crate's FRAME: the corner battens and the rails that cap the lid and foot the
 * case, drawn in a darker timber than the boards they hold.
 *
 * Split off the boards on purpose. Built as one merged mesh in one colour the
 * crate read as a smooth carton from any distance — it is the frame standing
 * proud of the boarding, in a different tone, that says "made up out of sawn
 * stuff" before a single stencil is legible.
 */
function frameGeometry(c: CrateGeom, front: boolean): THREE.BufferGeometry {
  const { width: w, depth: d, height: h } = c;
  const parts: THREE.BufferGeometry[] = [];
  const bs = 0.07;
  const zs = front ? [-1, 1] : [-1];
  for (const sx of [-1, 1]) {
    for (const sz of zs) {
      parts.push(batten(bs, h, bs, sx * (w / 2 - bs / 2), h / 2, sz * (d / 2 - bs / 2)));
    }
  }
  for (const y of [h - bs / 2, bs / 2]) {
    parts.push(batten(w, bs, bs, 0, y, -d / 2 + bs / 2));
    for (const sx of [-1, 1]) parts.push(batten(bs, bs, d - 2 * bs, sx * (w / 2 - bs / 2), y, 0));
  }
  return mergeSimple(parts);
}

/**
 * The glow slits down the crate's two flanks and along its lid seam. Built as
 * plain quads because they are drawn with an unlit additive material — what is
 * behind them is a robot with its lamp on, not a surface taking light.
 */
function sideSlitGeometry(c: CrateGeom): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const { width: w, depth: d, height: h } = c;
  for (const g of boardGaps(h)) {
    for (const sx of [-1, 1]) {
      const q = new THREE.PlaneGeometry(d * 0.82, 0.014);
      q.rotateY((sx * Math.PI) / 2);
      q.translate(sx * (w / 2 + 0.004), g, 0);
      parts.push(q);
    }
  }
  // The seam under the lid, seen from a camera that stands above the crates.
  for (const sz of [-1, 1]) {
    const q = new THREE.PlaneGeometry(w * 0.86, 0.014);
    if (sz < 0) q.rotateY(Math.PI);
    q.translate(0, h - PLANK_T - 0.012, sz * (d / 2 + 0.004));
    parts.push(q);
  }
  return mergeSimple(parts);
}

/**
 * The splintered wreckage of Biggy's bottom right corner, in the panel's own
 * frame: a snapped batten, two board ends driven inward and a loose splinter.
 *
 * The painted crush in `paintStoveIn` says the corner was hit; this says it is
 * still bent, which is what reads from a camera standing off to one side.
 */
function stoveInGeometry(c: CrateGeom, r: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const x = c.width / 2 - 0.09;
  const bs = 0.07;

  // The lower third of the right-hand batten, snapped and pushed in.
  const stub = new THREE.BoxGeometry(bs, 0.42, bs);
  stub.rotateZ(-0.16);
  stub.rotateX(0.1);
  stub.translate(x + 0.02, 0.2, -0.03);
  parts.push(stub);

  // Two board ends driven back past the face. Kept inboard of the corner: a
  // splinter sticking out past the crate's own silhouette reads as loose debris
  // in the frame rather than as damage to the case.
  for (let i = 0; i < 2; i++) {
    const g = new THREE.BoxGeometry(0.26 + r() * 0.08, 0.14, PLANK_T);
    g.rotateY(0.3 + r() * 0.14);
    g.rotateZ(-0.08 - r() * 0.08);
    g.translate(x - 0.2 - i * 0.05, 0.2 + i * 0.2, -0.05 - i * 0.02);
    parts.push(g);
  }

  // One splinter hanging off it.
  const sp = new THREE.BoxGeometry(0.16, 0.03, 0.02);
  sp.rotateZ(0.45);
  sp.translate(x - 0.24, 0.44, 0.02);
  parts.push(sp);

  return mergeSimple(parts);
}

/* ========================================================================== */
/*  Public model                                                              */
/* ========================================================================== */

export interface CratesOptions {
  /** Floor the pallets stand on, world y. Default 0. */
  baseY?: number;
  /** World x/z of the centre of the three-crate row. Default the origin. */
  centre?: { x: number; z: number };
  /** Yaw, radians. 0 points the stencilled faces along +z — at the diorama camera. */
  yaw?: number;
  /** Deterministic rough-sawn jitter and overspray. Same seed, same crates. */
  seed?: number;
  /**
   * Canvas resolution for the painted faces, px per metre. Default 320.
   *
   * 320 is about five times the density of the tightest framing the stencils are
   * legible at (see the legibility note handed up with this module), and it keeps
   * the three faces plus their glow masks inside ~5 MB. Raise it only for a shot
   * that pushes in closer than a metre-and-a-half of crate across the frame.
   */
  texelsPerM?: number;
}

export interface CrateModel {
  readonly kind: RobotKind;
  /** The whole crate. Its origin is the centre of the pallet's footprint, on the floor. */
  readonly root: THREE.Group;
  /**
   * The front panel, as a child of `root`, named `crate-panel-<kind>`.
   *
   * Its origin is the **hinge**: the bottom edge of the face, centred, at the
   * crate's own floor level. So `panel.rotation.x` tips it out toward the camera,
   * `panel.position` slides or drops it, and `panel.removeFromParent()` takes it
   * away entirely. Nothing else in the crate moves with it.
   */
  readonly panel: THREE.Group;
  /** Where the robot stands: the centre of the crate's inner floor. */
  readonly anchor: THREE.Object3D;
  /** Clear interior, metres, and the height of its floor above `baseY`. */
  readonly interior: { width: number; depth: number; height: number; floorY: number };
  /** The layout row this crate was drawn from. */
  readonly geom: CrateGeom;
  /** 0 dark, 1 the robot inside fully awake. Drives emissive only — no lights. */
  setLamp(v: number): void;
  /** 0 shut, 1 the panel tipped out and lying flat on the floor in front. */
  setOpen(t: number): void;
}

export interface CratesModel {
  readonly root: THREE.Group;
  /** Left to right: Voxxy, Droid, Biggy. The order spells the word. */
  readonly crates: readonly CrateModel[];
  readonly layout: CrateLayout;
  byKind(kind: RobotKind): CrateModel;
  /** Convenience: the same lamp value on all three. */
  setLamp(v: number): void;
  /**
   * 0..1 work light on the boarding, so the stencils read where there is no
   * light to read them by — the opening stages the crates in a blacked-out
   * corridor. Emissive only; this adds no `THREE.Light`.
   */
  setLit(v: number): void;
  /**
   * 0..1 on the emergency bulkhead over the row — the fitting the opening is lit
   * by, and the one that gives out at the end of it (`emergencyAt` in
   * `src/sim/opening.ts`). Emissive only; the point light that goes with it is
   * `src/render/lighting.ts`'s.
   */
  setEmergency(v: number): void;
  dispose(): void;
}

/**
 * Build the three crates. Geometry and canvas only — safe to call with no WebGL
 * context, and safe to call in node, where the painted faces fall back to flat
 * timber the way every other `SignPainter` surface does.
 */
export function buildCrates(opts: CratesOptions = {}): CratesModel {
  const layout = crateLayout();
  const baseY = opts.baseY ?? 0;
  const centre = opts.centre ?? { x: 0, z: 0 };
  const seed = opts.seed ?? 7;
  const texels = opts.texelsPerM ?? 320;

  const painter = new SignPainter();
  const owned: THREE.Material[] = [];

  const timberSpec = venueSpec('wood');
  const timber = new THREE.MeshStandardMaterial({
    name: 'crate/timber',
    color: new THREE.Color(DEAL),
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });
  // The venue's convention for anything that has to stay findable in a blackout
  // (`src/render/keypad.ts`, the sponsor standby strips): a trace of self-light so
  // the object is a shape rather than a silhouette before anybody lights it.
  timber.emissive = new THREE.Color(mix(timberSpec.color, '#000000', 0.78));
  timber.emissiveIntensity = 1;
  owned.push(timber);

  /*
   * The frame, a shade darker and greyer than the boarding it holds. One material
   * for three crates, so the whole row still costs two.
   */
  const timberFrame = new THREE.MeshStandardMaterial({
    name: 'crate/frame',
    color: new THREE.Color(mix(DEAL, '#3a2a17', 0.34)),
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  });
  timberFrame.emissive = new THREE.Color(mix(timberSpec.color, '#000000', 0.84));
  timberFrame.emissiveIntensity = 1;
  owned.push(timberFrame);

  /** Every painted face, so the work light can be raised on all three at once. */
  const artFaces: THREE.MeshStandardMaterial[] = [];

  const root = new THREE.Group();
  root.name = 'crates';
  root.position.set(centre.x, baseY, centre.z);
  root.rotation.y = opts.yaw ?? 0;

  const models: CrateModel[] = layout.crates.map((c, i) => {
    const r = rng(seed + i * 977);
    const lamp = lampColour(c.kind);

    const group = new THREE.Group();
    group.name = `crate-${c.kind}`;
    group.position.set(c.centreX, 0, c.centreZ);

    // --- pallet and body
    const pallet = new THREE.Mesh(palletGeometry(c.width * 1.02, c.depth * 1.04, r), timberFrame);
    pallet.name = `crate-pallet-${c.kind}`;
    pallet.castShadow = true;
    pallet.receiveShadow = true;
    group.add(pallet);

    const body = new THREE.Mesh(bodyGeometry(c, r), timber);
    body.name = `crate-body-${c.kind}`;
    body.position.y = PALLET_H;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const frame = new THREE.Mesh(frameGeometry(c, false), timberFrame);
    frame.name = `crate-frame-${c.kind}`;
    frame.position.y = PALLET_H;
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    // --- the lamp: an unlit additive decal, so "lit" is an opacity and nothing
    //     in the scene's lighting rig has to know these crates exist.
    const glowMat = new THREE.MeshBasicMaterial({
      name: `crate/glow-${c.kind}`,
      color: lamp,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    owned.push(glowMat);

    const slits = new THREE.Mesh(sideSlitGeometry(c), glowMat);
    slits.name = `crate-slits-${c.kind}`;
    slits.position.y = PALLET_H;
    group.add(slits);

    // --- the front panel, on its hinge
    const panel = new THREE.Group();
    panel.name = `crate-panel-${c.kind}`;
    panel.position.set(0, PALLET_H, c.depth / 2 - PLANK_T / 2);
    panel.userData.hinge = 'bottom-front';
    group.add(panel);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(c.width, c.height, PLANK_T), timber);
    slab.position.y = c.height / 2;
    slab.castShadow = true;
    slab.receiveShadow = true;
    panel.add(slab);

    const texW = Math.min(1024, Math.round(c.width * texels));
    const texH = Math.min(1024, Math.round(c.height * texels));
    const artMat = painter.material(
      `crate-face-${c.kind}`,
      texW,
      texH,
      DEAL,
      paintFace(layout, c, seed + i * 977),
      0,
    );
    artMat.roughness = 0.95;
    artMat.metalness = 0;
    artMat.emissive = new THREE.Color(mix(timberSpec.color, '#000000', 0.78));
    /*
     * The painted face lights ITSELF, through its own art.
     *
     * The opening stages the crates in chapter 1's blacked-out corridor, where
     * there is no light to read a stencil by: the first frame strip showed three
     * black boxes with a little colour leaking out of the board gaps, and
     * `DEVOXX` — the whole reason the three crates stand in a row — was not
     * there at all. An emissive MAP rather than a flat emissive colour is what
     * makes the lift honest: the timber glows and the ink stays dark, because
     * the ink is dark in the map, so raising it reads as a work light on the
     * boards instead of the whole face turning to fog.
     *
     * At rest it contributes almost nothing — `emissive` is a near-black brown —
     * and `setLit` is what raises it. Set once, here: swapping a material's maps
     * per frame recompiles its shader.
     */
    artMat.emissiveMap = artMat.map;
    artMat.emissiveIntensity = 1;
    artFaces.push(artMat);

    const face = new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.height), artMat);
    face.name = `crate-face-${c.kind}`;
    face.position.set(0, c.height / 2, PLANK_T / 2 + 0.003);
    face.receiveShadow = true;
    panel.add(face);

    /*
     * The glow mask rides on the panel, one texture ahead of the art. The painter
     * bakes it as a material we never render — we only want its texture — which
     * keeps every canvas this module makes on the painter's own dispose list.
     */
    // The mask is nothing but soft gradients, so it is baked at half density.
    const maskHolder = painter.material(
      `crate-glow-${c.kind}`,
      Math.max(64, texW >> 1),
      Math.max(64, texH >> 1),
      '#000000',
      paintGlowMask(c, seed + i * 977),
      0,
    );
    const faceGlowMat = glowMat.clone();
    faceGlowMat.name = `crate/glow-face-${c.kind}`;
    faceGlowMat.map = maskHolder.map;
    owned.push(faceGlowMat);
    const faceGlow = new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.height), faceGlowMat);
    faceGlow.name = `crate-faceglow-${c.kind}`;
    faceGlow.position.set(0, c.height / 2, PLANK_T / 2 + 0.006);
    panel.add(faceGlow);

    // Battens on the face, and the damage on Biggy's.
    const cleats: THREE.BufferGeometry[] = [];
    const bs = FACE_BATTEN;
    for (const sx of [-1, 1]) cleats.push(batten(bs, c.height, bs, sx * (c.width / 2 - bs / 2), c.height / 2, bs / 2));
    for (const y of [c.height - bs / 2, bs / 2]) cleats.push(batten(c.width - 2 * bs, bs, bs, 0, y, bs / 2));
    if (c.kind === 'biggy') cleats.push(stoveInGeometry(c, r));
    const cleatMesh = new THREE.Mesh(mergeSimple(cleats), timberFrame);
    cleatMesh.name = `crate-cleats-${c.kind}`;
    cleatMesh.castShadow = true;
    panel.add(cleatMesh);

    // --- where the robot stands
    const anchor = new THREE.Object3D();
    anchor.name = `crate-stand-${c.kind}`;
    anchor.position.set(0, c.interior.floorY, 0);
    group.add(anchor);

    root.add(group);

    const model: CrateModel = {
      kind: c.kind,
      root: group,
      panel,
      anchor,
      interior: c.interior,
      geom: c,
      setLamp(v: number): void {
        const k = Math.min(1, Math.max(0, v));
        // Squared, because a lamp coming up behind a plank gap reads as a ramp
        // rather than as a dimmer: nothing, nothing, then suddenly a robot.
        glowMat.opacity = k * k * LAMP_PEAK;
        faceGlowMat.opacity = k * k * LAMP_PEAK;
      },
      setOpen(t: number): void {
        const k = Math.min(1, Math.max(0, t));
        /*
         * Tips out about its bottom edge to just past flat, then settles onto the
         * floor — the hinge is at the crate's own floor, so the last of the move
         * is a drop.
         *
         * And it turns over on the way down. A panel that simply falls forward
         * lands stencil-side to the concrete, which throws away the best half of
         * the beat: the notes have the spanning word breaking apart "the moment
         * the robots step down and the crates are left behind", and a blank board
         * on the floor does not break apart, it just disappears. Rolling it
         * through 180 deg about its own upright in the last third of the move
         * lands `DE` `VO` `XX` face up, upside down, in three pieces. It is also
         * what a kicked-out crate front actually does.
         */
        const roll = Math.min(1, Math.max(0, (k - 0.62) / 0.38));
        panel.rotation.set(k * (Math.PI / 2 + 0.06), roll * roll * (3 - 2 * roll) * Math.PI, 0);
        panel.position.set(0, PALLET_H * (1 - k), c.depth / 2 - PLANK_T / 2 + k * 0.06);
      },
    };
    return model;
  });

  /* ------------------------------------------------- the light over the row
   *
   * Michele: *"There's a light on the crates, robot exit fully visible. Light
   * (emergency light?) flickers and stops, robots light up -> transition to
   * game."*
   *
   * This is the fitting. A bulkhead on the corridor's west wall above the crates:
   * a cast body, a milky lens and a wire guard over it, which is what the last
   * light still running in a building with the power out looks like. The lens is
   * emissive only — no `THREE.Light` goes inside this module, which is the rule
   * the boarding's work light already follows — and `src/render/lighting.ts`
   * hangs the actual point light at the same place off the same number.
   *
   * It is a child of `root`, so the quarter-turn that backs the crates onto the
   * wall carries it there too: local -z is into the wall, local +z is out over
   * the row.
   */
  const BULKHEAD_Y = 2.55;
  const BULKHEAD_Z = -1.62;
  const lensMat = new THREE.MeshStandardMaterial({
    name: 'crate/bulkhead-lens',
    color: new THREE.Color('#e8f3ea'),
    emissive: new THREE.Color('#bdf0d2'),
    emissiveIntensity: 1,
    roughness: 0.55,
    metalness: 0,
    toneMapped: false,
  });
  const caseMat = new THREE.MeshStandardMaterial({
    name: 'crate/bulkhead-case',
    color: new THREE.Color('#2b3038'),
    roughness: 0.8,
    metalness: 0.2,
    flatShading: true,
  });
  owned.push(lensMat, caseMat);
  const bulkhead = new THREE.Group();
  bulkhead.name = 'crate-bulkhead';
  bulkhead.position.set(0, BULKHEAD_Y, BULKHEAD_Z);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.26, 0.09), caseMat);
  back.position.set(0, 0, -0.045);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.19, 0.11), lensMat);
  lens.name = 'crate-bulkhead-lens';
  lens.position.set(0, 0, 0.05);
  bulkhead.add(back, lens);
  // The guard: three bars across the lens, the detail that says "emergency
  // fitting" rather than "lamp" at a glance.
  for (let i = -1; i <= 1; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.23, 0.02), caseMat);
    bar.position.set(i * 0.14, 0, 0.11);
    bulkhead.add(bar);
  }
  root.add(bulkhead);

  const byKind = (kind: RobotKind): CrateModel => {
    const hit = models.find((c) => c.kind === kind);
    if (!hit) throw new Error(`no crate for "${String(kind)}"`);
    return hit;
  };

  return {
    root,
    crates: models,
    layout,
    byKind,
    setLamp(v: number): void {
      for (const c of models) c.setLamp(v);
    },
    setEmergency(v: number): void {
      // Emissive only. The lens keeps a trace of itself at zero so the dead
      // fitting is still a shape on the wall rather than a hole in it, which is
      // the same convention the boarding and the keypad follow.
      const k = Math.min(1, Math.max(0, v));
      lensMat.emissiveIntensity = 0.04 + k * 2.6;
      lensMat.color.setHex(k > 0.02 ? 0xe8f3ea : 0x555f5a);
    },
    setLit(v: number): void {
      /*
       * The work light on the boards, 0..1 — what lets the stencils read in a
       * blackout. It is not a light: no `THREE.Light` goes anywhere near these
       * crates (a test asserts that), because the venue's lighting is the sim's
       * visibility polygons and a stray point light would be a second lighting
       * model. This raises the emissive the painted faces already carry.
       *
       * Ink stays dark as it rises, because the lift goes through the art's own
       * map: the timber glows, the letters do not.
       */
      const k = Math.min(1, Math.max(0, v));
      const rest = new THREE.Color(mix(timberSpec.color, '#000000', 0.78));
      const lit = new THREE.Color('#d6c3a2');
      for (const mat of artFaces) mat.emissive.copy(rest).lerp(lit, k);
      // The sides and the frame come up with the face, or the crates read as three
      // lit posters standing in the dark rather than as three boxes.
      timber.emissive.copy(new THREE.Color(mix(timberSpec.color, '#000000', 0.78))).lerp(lit, k * 0.42);
      timberFrame.emissive.copy(new THREE.Color(mix(timberSpec.color, '#000000', 0.84))).lerp(lit, k * 0.3);
    },
    dispose(): void {
      painter.dispose();
      for (const mat of owned) mat.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      root.removeFromParent();
      root.clear();
    },
  };
}

/* ========================================================================== */
/*  Where the row may stand                                                   */
/* ========================================================================== */

/** A footprint on the floor plan, sim pixels — the same shape as a sim `Rect`. */
export interface CrateFootprint {
  readonly kind: RobotKind;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The three crates' footprints on the floor plan, in SIM PIXELS, for a row whose
 * face line is centred on (`rowX`, `rowY`).
 *
 * `yaw` is the same angle `buildCrates` takes: **0** points the faces along +z,
 * which on the plan is south, so the crates stand back against a north wall and
 * the row runs east-west — where the row stands today. **π/2** points them along
 * +x, east, for a row standing against the corridor's WEST wall with the row
 * running north-south, which is the restaging Michele proposed. Other yaws are
 * accepted and rotated properly, but those two are the ones the venue has a wall
 * for.
 *
 * ## Why this exists
 *
 * 24 Sep 2026: Michele, on the opening — *"the left crate is half black"*. It
 * was not a material, a shadow or a winding: **Voxxy's crate was standing inside
 * a corridor column.** The far column at sim x 59..75, y 288..304 (3.3 m of
 * `venue/corridorColumn`, `#1b1e24` with no emissive) overlaps her crate's
 * 65.9..83.1 by 9.1 px, which is 53% of the crate's width — the half that
 * renders black, in front of the boarding and filling the interior the moment
 * her panel drops. The other two crates are clear, which is why only hers shows
 * it. Evidence: `scratchpad/intro-light/diagnosis-column-magenta*.png`, the same
 * frame with every corridor column painted magenta.
 *
 * The crates are dressing and the columns are venue, so nothing in either module
 * can see the other. This is the check that can: hand it a candidate row and the
 * venue's own rects, and it says which crate fouls what. `src/sim` may not import
 * `src/render`, so the sim keeps its own copy of the row arithmetic — but a test
 * can import both, and `tests/intro-light.test.ts` does.
 */
export function crateFootprints(rowX: number, rowY: number, yaw = 0): CrateFootprint[] {
  const layout = crateLayout();
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return layout.crates.map((box) => {
    // Assembly-local centre, metres. `centreZ` is -depth/2 because the faces are
    // coplanar on z = 0, so the body sits BEHIND the face line.
    const lx = box.centreX;
    const lz = box.centreZ;
    // Rotate about +y: (x, z) -> (x cos + z sin, -x sin + z cos).
    const cx = lx * c + lz * s;
    const cz = -lx * s + lz * c;
    // The footprint's own extent after the same rotation. At 0 and pi/2 this is
    // exact; in between it is the axis-aligned box that contains the rotated one,
    // which is what a wall list wants anyway.
    const ex = Math.abs(box.width * c) + Math.abs(box.depth * s);
    const ez = Math.abs(box.width * s) + Math.abs(box.depth * c);
    return {
      kind: box.kind,
      x: rowX + (cx - ex / 2) * PX_PER_M,
      y: rowY + (cz - ez / 2) * PX_PER_M,
      w: ex * PX_PER_M,
      h: ez * PX_PER_M,
    };
  });
}

/** Which of `obstacles` each crate of a row at (`rowX`, `rowY`) is standing inside. */
export function crateRowFouls(
  rowX: number,
  rowY: number,
  obstacles: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
  yaw = 0,
): Array<{ kind: RobotKind; overlapX: number; overlapY: number; obstacle: { x: number; y: number; w: number; h: number } }> {
  const out: Array<{ kind: RobotKind; overlapX: number; overlapY: number; obstacle: { x: number; y: number; w: number; h: number } }> = [];
  for (const f of crateFootprints(rowX, rowY, yaw)) {
    for (const o of obstacles) {
      const ox = Math.min(f.x + f.w, o.x + o.w) - Math.max(f.x, o.x);
      const oy = Math.min(f.y + f.h, o.y + o.h) - Math.max(f.y, o.y);
      if (ox > 0 && oy > 0) out.push({ kind: f.kind, overlapX: ox, overlapY: oy, obstacle: o });
    }
  }
  return out;
}

/** Metres a robot's collision circle is across — for the clearance checks. */
export const robotWidthM = (kind: RobotKind): number => 2 * m(DEFS[kind].r);
/** Metres a robot stands, sole to crown. */
export const robotHeightM = (kind: RobotKind): number => ROBOT_HEIGHT_M[kind];
