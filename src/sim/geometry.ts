/**
 * Venue geometry — ported verbatim from `reference/poc/10-after-dark-kinepolis.html`,
 * which was itself laid out from the annotated Devoxx plans in `plans/`.
 *
 * Both floors are rotated 90° counter-clockwise relative to the plans, so the
 * corridor runs left->right: **plan top -> world left**, plan left column -> world
 * bottom row. That puts the closed cinema section at x 0..600, Devoxx rooms 3, 4, 5, 6
 * along the bottom and 10, 9, 8, 7 along the top, the two secondary staircases
 * standing IN the corridor against its two walls, level with rooms 4 and 9, and the
 * main staircase at the corridor's end between 6 and 7 — exactly what
 * `plans/devoxx-rooms-stairs-annotated.png` draws.
 *
 * ## The drawing wins
 *
 * CLAUDE.md, GAUNTLET.md and `plans/README.md` used to say the secondary staircases
 * were "between rooms 3|4 and 10|9" and called it non-negotiable. Measured, the
 * drawing does not put them there — it puts them level with the 4 and 9 numerals,
 * about 150 sim px further along the corridor (`F1.nicheTop`). Michele was asked
 * which to follow and answered twice, 24 Sep 2026: *"Follow the plan — move them"*,
 * then *"follow the devoxx plant, not the plan.md"*. So: **when the drawing and the
 * prose disagree, the drawing is the authority.** The prose has been corrected.
 *
 * The positions are still non-negotiable (CLAUDE.md, GAUNTLET.md Stage 1); what
 * changed is which document states them. The renderer builds its environment from
 * this module, so the floor-plan overlay check is a property of the data, not of
 * the drawing code.
 */

import { W, H, T } from './constants';
import type { Booth, Bot, Plate, Rect, RoomDef, ViewRect, Wall } from './types';

/* ---------------------------------------------------------------- first floor */

/**
 * Corridor band: the cinema corridor runs between these two y values.
 *
 * 130 sim px, not the prototype's 100. Measured on
 * `plans/devoxx-rooms-stairs-annotated.png` the corridor is 147 plan px against
 * room 4's 251 of depth — a ratio of 0.586, where the prototype's 100 against 230
 * gives 0.435. The round-2 floor-plan critic measured the built corridor as 26%
 * too narrow for the rooms it serves, which is the one proportion a judge walking
 * chapters 1 and 4 spends the whole chapter looking at. 130 against the 224 base
 * depth below is 0.580.
 */
export const CY0 = 285;
export const CY1 = 415;
/**
 * Base auditorium depth — room 4/9's, the plan's middle size and the anchor the
 * other depths are scaled from. Individual rooms do **not** all use it: see
 * `DEPTH` below.
 */
export const ROOM_D = 224;
/** Auditorium door width. */
export const DOOR = 46;

/**
 * THE SECONDARY STAIRCASES, RE-MEASURED OFF THE PLAN — 24 Sep 2026.
 *
 * Michele: *"The stairs position on the upper wall haven't been fixed"*, and then,
 * when the drawing and the prose were put to him side by side, *"Follow the plan —
 * move them"* / *"follow the devoxx plant, not the plan.md"*.
 *
 * Measured on `plans/devoxx-rooms-stairs-annotated.png` (996 x 1498), and
 * cross-checked on the unannotated `plans/devoxx-rooms-plain.png` (1142 x 1420),
 * whose big black annotation-free copy of the same drawing maps onto it by
 * `plain_y = annot_y * 0.9943 - 26.3` — the two agree to a pixel:
 *
 * | what | plan px | how it was found |
 * |---|---|---|
 * | corridor walls | x 504..505 and x 649 | the two long dark verticals |
 * | corridor, clear between the room walls | x 503..650 = **147** | outer faces |
 * | left flight, hard against the left wall | x **506..527** = 20-22 deep | mid-grey (RGB 150,150,152) against the corridor's 209 |
 * | right flight, hard against the right wall | x **627..647** = 21 deep | same |
 * | both flights, along the corridor | y **884..947** = **64** | full-width rows, identical on both walls |
 * | rooms 4 and 9, along the corridor | y 821..995 = **174** | the teal fills, 826..993, plus their wall lines |
 *
 * Two things follow, and the second is what Michele had reported three times:
 *
 *  1. the flights are **20 plan px deep** — 20/147 = 0.136 of the corridor — and
 *     the corridor is 130 sim px wide (`CY0`..`CY1`), so a flight is 0.136 x 130 =
 *     **17.7 sim px = 1.41 m**. That ratio is the one measurement that survives
 *     this floor's anisotropy: lengths along the corridor are stretched ~1.93x
 *     against lengths across it (`docs/scale-and-units.md`), so reading the
 *     flight's width on the along-corridor scale would give 34 px and mean nothing
 *     physical. A robot's radius is isotropic; the corridor's own width is the
 *     ruler that matches it;
 *  2. the flights run **y 884..947**, which is 63..126 plan px into room **4/9**'s
 *     own 174 of length — level with the 4 and 9 numerals, **not** in the 3|4 or
 *     10|9 gap. See `F1.nicheTop` for that arithmetic.
 *
 * `NICHE_MOUTH` is (1): the clear width of the opening onto a flight, which is the
 * flight's own width. Michele asked for it in chapter 1 (`docs/playtest-notes.md`,
 * note 18): *"they seem fit for biggy to pass, make the passage more narrow"*.
 * Biggy is r 9, so **1.44 m across: he does not fit, by a centimetre**, which is
 * what note 18 asked for and what the real stair says. Droid (1.00 m) and Voxxy
 * (0.76 m) do. `tests/geometry.test.ts` pins the relationship, not just the number.
 *
 * The same 17.7 is the shaft's **depth into the corridor**, and that is not a
 * coincidence: a flight's width is how far it reaches out from the wall it hugs.
 * One measurement, used twice.
 *
 * ## ONE staircase, not two — 24 Sep 2026, second pass
 *
 * The first pass read the hatched plan symbol as a landing in the middle with a
 * descent falling away either side. Michele, sending the symbol back enlarged:
 * *"This makes it look like there's a center, and 2 descent. I think it's a mid
 * plane between two ramps of stairs. In this picture stairs go south to north."*
 *
 * He is right, and the drawing says so once you count the tread lines. On
 * `devoxx-rooms-plain.png` the right-hand flight runs plain y **853..914** with
 * its treads at a steady ~2 px pitch and one clear band at **879..887** carrying
 * none — a **half-landing**, 8 plain px of the run's 61 (13%), not a landing you
 * step onto from the corridor. Same object on the floor below, at that plan's own
 * scale: `exhibition-floor-simple.png` draws the flights over 199 px with a
 * tread-free band 31 px long at 39–55% of the run. One staircase; two ramps; a
 * mid-plane between them. `nicheMidLanding` and `nicheRamps` cut it up.
 *
 * ## Which end you step on
 *
 * The ground floor settles it, and Michele made that explicit: *"On ground floor,
 * your stairs are good. Floor 1 is directly above, so they should match."* Down
 * there the shaft's doors and its bottom landing are at the plan's **north** end
 * and the ascent arrow runs away from them southward (`GF.stairs`, `stairDoors`).
 * North is plan-top on both drawings, so the **head** of the stair — the end you
 * step on to go down — is its **south** end, which is this module's rotation
 * (plan top -> world left) is its **world-EAST** end.
 *
 * That is the same sentence as *"In this picture stairs go south to north"*: the
 * descent runs south to north, world east to world west. And it is why the guard
 * rail is where he saw it in the photo — *"There's a protection on West and
 * North"* — the open long face toward the corridor, plus the far (world-west) end
 * where the well bottoms out. The only side left unguarded is the head.
 *
 * `nicheMouth` is that head: one flight-width square at the world-east end. It
 * used to be centred on the long face, which is the "opening north" Michele is
 * correcting, and the two runs either side of it were the "2 descent".
 */
export const NICHE_MOUTH = 17.7;

/**
 * Thickness of the balustrade along a flight's open face, sim px.
 *
 * 1.5 px = 0.12 m of handrail and posts, which is what the renderer draws and
 * what `floor1Walls` stands across the mouth. It is the difference between the
 * flight's 1.41 m and the 1.30 m of clear floor at the head of it.
 */
export const NICHE_RAIL = 1.5;

/**
 * The half-landing between the two ramps, as offsets along the flight from its
 * world-WEST (plan-north, foot) end.
 *
 * Measured on `plans/devoxx-rooms-plain.png` and carried through `F1.nicheTop`'s
 * own arithmetic, `world_x = 898 + (plan_y - 821) * 1.70690`, after mapping the
 * plain drawing onto the annotated one with `plain_y = annot_y * 0.9943 - 26.3`:
 *
 * ```
 *   treads stop   plain y 879  ->  annot 910.5  ->  world x 1051.6   (46.1 in)
 *   treads resume plain y 887  ->  annot 918.5  ->  world x 1065.3   (59.8 in)
 * ```
 *
 * Held as offsets rather than absolutes so the pair survives the flight moving
 * again, which it has done twice in two days.
 */
const NICHE_MID_0 = 46.1;
const NICHE_MID_1 = 59.8;

/**
 * Per-room depth, sim px.
 *
 * The plan's outer envelope is **stepped**, and that silhouette is what makes the
 * map read as the Kinepolis first floor: rooms 5 and 8 bulge past their neighbours
 * on both sides, 3/10 are shallow, room 7 shallower still. Depths measured off
 * `plans/devoxx-rooms-stairs-annotated.png` (plan px): 3 = 207, 10 = 206, 4 = 251,
 * 9 = 252, 5 = 298, 8 = 298, 6 = 251, 7 = 201. Scaled by 224/251.5 so room 4/9
 * lands on `ROOM_D`, they become the numbers below. Room 6 and room 7 genuinely
 * differ on the plan — they are the one pair that is not symmetric.
 *
 * The closed cinema section is not numbered on the plan; its three top houses and
 * two bottom houses are given their own step so the envelope is not flat there
 * either.
 */
const DEPTH: Readonly<Record<string, number>> = Object.freeze({
  A: 196,
  B: 216,
  C: 196,
  D: 224,
  E: 224,
  '10': 184,
  '9': 224,
  '8': 265,
  '7': 179,
  '3': 184,
  '4': 224,
  '5': 265,
  '6': 224,
});

/** The deepest room on the floor, used to check the band fits inside `H`. */
export const ROOM_D_MAX = 265;

export const rooms: RoomDef[] = [];
{
  const add = (n: number | string, x: number, w: number, side: -1 | 1, closed = false): void => {
    const d = DEPTH[String(n)] ?? ROOM_D;
    rooms.push({ n, x, w, y: side < 0 ? CY0 - d : CY1, h: d, side, closed });
  };
  // Closed cinema section — three unnumbered rooms on top, two below.
  add('A', 70, 160, -1, true);
  add('B', 240, 160, -1, true);
  add('C', 410, 160, -1, true);
  add('D', 180, 190, 1, true);
  add('E', 380, 190, 1, true);
  /*
   * Devoxx rooms, widths in the plan's proportions.
   *
   * Measured along the corridor on the plan (plan y extents): 3/10 = 145,
   * 4/9 = 174, 5/8 = 224, 6/7 = 177 — so 6/7 is the plan's SECOND BIGGEST pair,
   * effectively equal to 4/9. The prototype had it at 263 against 4/9's 320, which
   * made the venue's second-largest auditorium read as its second-smallest. The
   * 1230 px between the fire door and the corridor's end are redistributed by the
   * plan's own ratios 0.2014 / 0.2417 / 0.3111 / 0.2458.
   *
   * 1230 and not 1270 because 40 px were reserved between 3|4 and 10|9 for the
   * secondary staircases, back when they were believed to live in that gap. They
   * do not (`NICHE_MOUTH`, `F1.nicheTop`), and the gap has been left where it is
   * rather than redistributing every room on this floor in the same round that
   * moves the staircases. It is not empty of meaning: the plan draws a vestibule
   * with a pair of double doors at each party wall, and room 3/4's lands at world
   * x ~882, inside this very gap. Closing it is a later round's change, and it
   * moves every Devoxx room, its signage and chapter 4's stage.
   */
  add(10, 610, 248, -1);
  add(9, 898, 297, -1);
  add(8, 1195, 383, -1);
  add(7, 1578, 302, -1);
  add(3, 610, 248, 1);
  add(4, 898, 297, 1);
  add(5, 1195, 383, 1);
  add(6, 1578, 302, 1);
}

/** Look a room up by its plan number or letter. */
export const R = (n: number | string): RoomDef => {
  const r = rooms.find((x) => x.n === n);
  if (!r) throw new Error(`no room ${String(n)}`);
  return r;
};

export interface DoorRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Centre of the doorway, on the corridor wall. */
  cx: number;
  cy: number;
  side: -1 | 1;
  r: RoomDef;
}

/**
 * The clear stretch of a room's corridor frontage: the part of it a secondary
 * staircase is not standing across.
 *
 * Seven of the eight Devoxx rooms have their whole frontage. Rooms **4 and 9** do
 * not: the staircase stands in the corridor from world x 1005.5 to 1114.7, and
 * their frontage runs 898..1195, so the flight takes 109 px out of the middle of
 * their 297 and leaves 107.5 west of it and 80.3 east of it. The plan draws it
 * exactly so — see `F1.nicheTop` — and it draws room 4's doors on both sides of
 * the stair, never behind it.
 */
export function roomFrontage(r: RoomDef): [number, number] {
  const n = r.side < 0 ? F1.nicheTop : F1.nicheBot;
  const lo = r.x;
  const hi = r.x + r.w;
  if (n.x + n.w <= lo || n.x >= hi) return [lo, hi];
  return n.x - lo >= hi - (n.x + n.w) ? [lo, n.x] : [n.x + n.w, hi];
}

/**
 * The doorway a room opens onto the corridor through.
 *
 * Centred on the room's frontage — except where a staircase stands across the
 * middle of it, which is rooms 4 and 9, where it is centred on the frontage the
 * staircase leaves (`roomFrontage`): world x **951.8**, spanning 928.8..974.8.
 *
 * The plan has two ways into room 4 and the stair is between them: a single-leaf
 * door at plan y 925..933 on `devoxx-rooms-plain.png` (world x ~1137, past the
 * east end of the flight) and the double doors of the vestibule it shares with
 * room 3 at plan y 772..788 (world x ~882, back past the west end). The game
 * models one door per room, so it takes the western of the two and puts it where
 * a 46 px opening, a numeral panel and a poster box all fit on real wall: the
 * eastern stretch is 80 px, which is not enough for the signage this venue hangs
 * beside a door (`src/render/venue/signage.ts`).
 *
 * A centred door would be at 1046.5 — **inside the flight**, which is how the
 * staircase move surfaced this at all.
 */
export function roomDoor(r: RoomDef): DoorRect {
  const [lo, hi] = roomFrontage(r);
  const cx = (lo + hi) / 2;
  return r.side < 0
    ? { x: cx - DOOR / 2, y: CY0 - T, w: DOOR, h: 12, cx, cy: CY0, side: -1, r }
    : { x: cx - DOOR / 2, y: CY1 - T, w: DOOR, h: 12, cx, cy: CY1, side: 1, r };
}

/** The curved foyer, so the bar inside it can be measured off its own rect. */
const FOYER: Rect = { x: 14, y: CY1, w: 160, h: 230 };
/** The long pale bar counter — `media/other-images/image-1790032659509.webp`. */
const BAR: Rect = { x: FOYER.x + 20, y: FOYER.y + 150, w: 70, h: 16 };

export const F1 = {
  /** The fire door with the keypad, between the closed section and the Devoxx rooms. */
  fireX: 600,
  /** Curved foyer with a bar, open straight onto the corridor. */
  foyer: FOYER,
  /** The bar counter in it. A counter, so light crosses it. */
  bar: BAR,
  /**
   * The three stools along the bar, as footprints rather than points.
   *
   * 4.5 px is the 0.18 m radius the renderer turns them into; they are listed
   * here because a stool is a thing you walk into, and until this round they were
   * three cylinders the renderer invented and the sim had never heard of.
   */
  barStools: [0, 1, 2].map((i): Rect => ({ x: BAR.x + 12 + i * 22 - 2.5, y: BAR.y + 30 - 2.5, w: 5, h: 5 })),
  /** Glass kiosk in the foyer, with a Voxxy-sized hatch. */
  kiosk: { x: 110, y: 412, w: 56, h: 56 },
  /**
   * The secondary staircase against the **top** corridor wall, level with room 9.
   *
   * A flight standing IN the corridor, not a pocket cut into the wall behind it:
   * `plans/devoxx-rooms-stairs-annotated.png` draws both flights hard against the
   * room walls with the corridor running unbroken past them, and
   * `plans/devoxx-rooms-plain.png` shows the treads, a landing halfway down and a
   * wall line closing each end. `NICHE_MOUTH` has the full measurement; this is
   * the arithmetic that turns it into a rect.
   *
   * **Depth into the corridor** — the flight's own width, 20 plan px of the
   * corridor's 147, carried at the corridor-band scale 130/147 = 0.8844:
   * 20 x 0.8844 = **17.7**, which is `NICHE_MOUTH`.
   *
   * **Position and length along the corridor** — room 4/9 is this module's anchor
   * (plan y 821..995 = 174 plan px, world x 898..1195 = 297 sim px), so the
   * along-corridor scale is 297/174 = **1.70690** sim px per plan px:
   *
   * ```
   * world_x = 898 + (plan_y - 821) * 1.70690
   *   flight starts  plan y 884  ->  898 +  63 * 1.70690 = 1005.5
   *   flight ends    plan y 948  ->  898 + 127 * 1.70690 = 1114.7
   *   length             64 plan px  ->  64 * 1.70690 =  109.2
   * ```
   *
   * That is **~148 px further along the corridor than the build had it** (x 858,
   * in the gap between rooms 10 and 9), and it is the fault Michele reported three
   * times: *"in the wrong place... lateral in the real hallway"*, *"they seem fit
   * for biggy to pass"*, *"the stairs position on the upper wall haven't been
   * fixed"*. The first two were fixed; this is the third.
   *
   * Two things move with it, and both are in `git log` beside this line: rooms 4
   * and 9's doorways, which were centred and are now inside the flight
   * (`roomDoor`), and chapter 1's closing descent, which walked to a point that is
   * now 12 px through the corridor wall (`ch1-night.ts`).
   */
  nicheTop: { x: 1005.5, y: CY0, w: 109.2, h: NICHE_MOUTH },
  /** The same flight against the **bottom** corridor wall, level with room 4. */
  nicheBot: { x: 1005.5, y: CY1 - NICHE_MOUTH, w: 109.2, h: NICHE_MOUTH },
  /**
   * Main staircase, corridor's end between rooms 6 and 7.
   *
   * 150 x 118, not the prototype's 64 x 88. On the plan the main stair's footprint
   * is roughly 140 x 90 plan px, which at this module's along-corridor scale is
   * about 158 sim deep; `media/other-images/image-1790032674926.webp` shows it
   * filling the end of the corridor with three full-width runs under the tensile
   * canopy, and at 64 px it rendered as a blue inset under a canopy three times
   * its size.
   */
  mainStair: { x: 1744, y: CY0 + 6, w: 150, h: CY1 - CY0 - 12 },
} as const;

/* ------------------------------------------------- what stands on this floor
 *
 * Everything from here to `floor1Walls` lived in `src/render/venue/floor1.ts`
 * until this round. It is the same bug as the ground floor's thirty-seven
 * missing colliders and as chapter 1's missing seat rows: the renderer drew
 * auditorium seating, cinema screens, corridor columns and a bar out of its own
 * loops, and the sim had never been told. A robot walked through all of it.
 *
 * The cure is the one CLAUDE.md already writes down: the geometry lives HERE,
 * `floor1Walls()` emits it, and the renderer draws the sim's own list. There is
 * no second copy to drift, and `tests/colliders.test.ts` fails if a drawn solid
 * ever loses its collider again.
 */

/** The screen wall's sim y, and the sign of "into the room" from it. */
export function screenEdge(r: RoomDef): { y: number; inward: 1 | -1 } {
  return r.side < 0 ? { y: r.y, inward: 1 } : { y: r.y + r.h, inward: -1 };
}

/**
 * The two aisles, as fractions of a room's width.
 *
 * Taken from the prototype's keynote room (`K.A8 = [[r8.x+90, r8.x+140],
 * [r8.x+235, r8.x+285]]` with room 8 375 px wide), so chapter 4's aisle logic and
 * the modelled aisles line up.
 */
export const AISLES: ReadonlyArray<readonly [number, number]> = Object.freeze([
  Object.freeze([90 / 375, 140 / 375] as const),
  Object.freeze([235 / 375, 285 / 375] as const),
]);
/** Seat block extent, measured from the screen wall — design doc: "seat blocks y 140–270". */
export const SEAT_FRONT_PX = 70;
export const SEAT_BACK_PX = 200;
/**
 * Clear standing room between the back row and the corridor wall, sim px.
 *
 * The plan's shallow houses — 3, 7 and 10 at 179–184 px deep — are shallower than
 * `SEAT_BACK_PX`, so the back rows were laid out *through* the corridor wall and
 * out into the corridor.
 */
export const SEAT_CONCOURSE_PX = 52;
export const ROW_PITCH_PX = 18;
export const SEAT_PITCH_PX = 14;
/**
 * The narrowest block that gets seats — and therefore a collider — at all.
 *
 * The two have to agree or the venue grows an invisible wall: the renderer lays
 * its seats from `x0 + SEAT_BLOCK_MIN_PX / 2` to `x1 - SEAT_BLOCK_MIN_PX / 2`,
 * so a block narrower than this is drawn empty, and a collider on empty floor is
 * the mirror image of the bug this whole round is about. No room's blocks come
 * near it (the narrowest is 38 px, in cinemas A, B and C); it is here so that a
 * future room's cannot.
 */
export const SEAT_BLOCK_MIN_PX = 20;

/** One auditorium's seating: the x span of each block, and the sim y of each row. */
export interface RoomSeating {
  /** Seat-block spans in sim x, with the two aisles cut out. */
  blocks: Array<[number, number]>;
  /** Centre sim y of every row, front row first. */
  rows: number[];
  inward: 1 | -1;
}

/**
 * The seating plan of one auditorium, or `null` for a room with no room for any.
 *
 * Room **E** is deliberately not special-cased here: chapter 1 dresses it with its
 * own seat rows and an aisle up one side, which is a different plan from this one.
 * `floor1Walls` is what leaves it out.
 */
export function roomSeating(r: RoomDef): RoomSeating | null {
  const { y: far, inward } = screenEdge(r);
  const back = Math.min(SEAT_BACK_PX, r.h - SEAT_CONCOURSE_PX);
  const rowCount = Math.floor((back - SEAT_FRONT_PX) / ROW_PITCH_PX) + 1;
  if (rowCount < 1) return null;

  const blocks: Array<[number, number]> = [];
  let cut = r.x;
  for (const [a, b] of AISLES) {
    blocks.push([cut, r.x + a * r.w]);
    cut = r.x + b * r.w;
  }
  blocks.push([cut, r.x + r.w]);
  if (!blocks.some(([x0, x1]) => x1 - x0 >= SEAT_BLOCK_MIN_PX)) return null;

  const rows: number[] = [];
  for (let i = 0; i < rowCount; i++) rows.push(far + inward * (SEAT_FRONT_PX + i * ROW_PITCH_PX));
  return { blocks, rows, inward };
}

/**
 * The seat blocks of one auditorium as rects: the rows, the raked floor under
 * them, and the aisles left open between them.
 *
 * `low`, like every other seat row in the game: light crosses them, robots do
 * not, which is what makes a dark auditorium readable at all.
 */
export function seatBlockRects(r: RoomDef): Rect[] {
  const s = roomSeating(r);
  if (!s) return [];
  const half = ROW_PITCH_PX / 2;
  const ys = s.rows.map((y) => y - s.inward * half).concat(s.rows.map((y) => y + s.inward * half));
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return s.blocks
    .filter(([x0, x1]) => x1 - x0 >= SEAT_BLOCK_MIN_PX)
    .map(([x0, x1]): Rect => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
}

/**
 * The screen at the far end of an auditorium, away from the corridor door.
 *
 * It is a wall the light goes through (`glass`), not because it is glazed but
 * because in room E it is a MIRROR: chapter 1 seats a secondary light source
 * 4 px off its face, and an occluding screen would swallow the bounce that
 * carries orange and green into the exit alcove.
 */
export function roomScreen(r: RoomDef): Rect {
  const { y: far, inward } = screenEdge(r);
  return { x: r.x + r.w * 0.2, y: far + inward * 5 - 1, w: r.w * 0.6, h: 3 };
}

/**
 * Cinema E's exit alcove — the pocket beside the screen that hides chapter 1's
 * hardest clue.
 *
 * ## Why it is venue geometry and not chapter dressing
 *
 * It used to be two walls that `ch1-night.ts` pushed at runtime, and **nothing in
 * `src/render` reads `snapshot().walls`** — the renderer builds its set from
 * `floor1Walls()`. So the alcove was two invisible slabs: a robot stopped dead
 * against thin air, which is exactly the bug the seat rows had
 * (`docs/playtest-notes.md`, "Biggy is blocked but it's not clear by what"). Here
 * it is drawn, lit and collided like every other wall in the building, from one
 * source, and `tests/colliders.test.ts` measures it.
 *
 * It is also honestly architecture rather than dressing: every auditorium in the
 * building has a fire exit beside the screen, and this one is the only one the
 * game ever asks you to walk into.
 *
 * ## Where it is, and why there
 *
 * Against the room's RIGHT wall, at the foot of the aisle, and — the part that
 * matters — far enough back from the screen wall to be **in shot**. The diorama
 * camera sits on the +y side and looks back over cinema E's own front wall, so
 * everything within about 50 px of that wall is behind it; at the old position
 * (`rE.y + rE.h - 78`) the clue sat in a 15 px keyhole of visibility and the
 * approach to it was hidden outright. Measured, not guessed: see the ray cast in
 * `tests/aisle.test.ts`, which fails if this ever slides back down the room.
 *
 * The mouth faces the screen (+y), because that is where the light comes from:
 * cinema E's screen is the chapter's mirror and the bounce has to be able to
 * enter.
 */
export function cinemaEExit(): Rect {
  const r = R('E');
  // `+ 97` is not a taste. `ch1-night.ts` lays its seat rows from `r.y + 58` on a
  // 24 px pitch, 9 px deep, so the SECOND row ends at `r.y + 91`; the alcove's top
  // wall is `T` deep and sits immediately above `y`, so at `+ 97` it lands flush
  // against the back of that row. Anything else leaves an orphan slot of walkable
  // floor between the two — in the shadow of the alcove wall, from this camera —
  // for a robot to drive into and vanish.
  // 52 deep rather than a tidy 40, and that is the mirror's doing. The bounce off
  // cinema E's screen carries `MIRROR_MIN_RANGE` (90 px) whatever else happens, and
  // beyond that it is whatever the source had left. A pocket that ends 87 px from
  // the screen puts the clue inside that floor from every angle; at 103 px — a
  // 40-deep pocket in the same place — Biggy's reachable lighting positions fell
  // from 539 to 73, which is a needle by another name. It also leaves 29 px of bay
  // between the pocket and the front row, which is what Droid turns around in.
  return { x: r.x + r.w - 44, y: r.y + 97, w: 40, h: 52 };
}

/**
 * The way onto a secondary staircase: the head of the stair, at its world-EAST end.
 *
 * One flight-width square — the top tread, the only part of the flight at corridor
 * level. Everything west of it falls away, and a falling-away flight is a wall,
 * because nothing in this game climbs (the same rule as the ground floor's
 * `stair-foot`).
 *
 * **It was centred until 24 Sep 2026**, with a run dropping away either side, and
 * that is the shape Michele sent back: *"This makes it look like there's a center,
 * and 2 descent"*, and then *"you put the opening north, but it's on the sides"*.
 * The plan symbol's middle band is a half-landing between two ramps of ONE stair
 * (`NICHE_MOUTH`, `nicheMidLanding`), so the way on is an END, and the ground
 * floor says which end: the doors and the foot are at the plan's north, so the
 * head is at the plan's south, which is world east.
 *
 * Both niches give the same `x`, because both flights do.
 */
export function nicheMouth(niche: Rect): Rect {
  return { x: niche.x + niche.w - NICHE_MOUTH, y: niche.y, w: NICHE_MOUTH, h: niche.h };
}

/**
 * The half-landing between the flight's two ramps — the "mid plane" of Michele's
 * note. Solid, like the ramps: you can see it, you cannot stand on it.
 */
export function nicheMidLanding(niche: Rect): Rect {
  return { x: niche.x + NICHE_MID_0, y: niche.y, w: NICHE_MID_1 - NICHE_MID_0, h: niche.h };
}

/**
 * The two ramps, **head first**: the upper one falls west from the head of the
 * flight to the half-landing, the lower one falls west from the half-landing to
 * the foot of the well. With `nicheMidLanding` they tile the whole niche.
 *
 * The upper ramp runs to the niche's own east edge and **not** to `nicheMouth`,
 * which is the point: the plan draws two near-equal runs — 26 and 27 plain px
 * either side of the half-landing — and these come out 46.1 and 49.4. The mouth
 * is the top step OF the upper ramp, the one tread that is at corridor level, not
 * a landing cut out of it; stopping the ramp at the mouth left the upper run a
 * third shorter than the lower one and the drawing does not do that.
 */
export function nicheRamps(niche: Rect): [Rect, Rect] {
  const mid = nicheMidLanding(niche);
  return [
    { x: mid.x + mid.w, y: niche.y, w: niche.x + niche.w - (mid.x + mid.w), h: niche.h },
    { x: niche.x, y: niche.y, w: mid.x - niche.x, h: niche.h },
  ];
}

/** Square corridor column, sim px. */
export const CORRIDOR_COLUMN = 16;
/** How far a corridor column stands off the wall it belongs to. */
const COLUMN_INSET = 11;

/**
 * The corridor's square columns, on the room party walls.
 *
 * `far` are the full-height shafts on the small-y side, which is behind the
 * corridor from the diorama camera; `near` are the knee-high plinths on the
 * camera side, cut down so a robot does not vanish behind one (the renderer's own
 * note, from chapter 1's opening frame). Both are things you walk into.
 */
export function corridorColumns(): { far: Rect[]; near: Rect[] } {
  const xs = new Set<number>();
  for (const r of rooms) {
    xs.add(Math.round(r.x - T / 2));
    xs.add(Math.round(r.x + r.w + T / 2));
  }
  const busy: Rect[] = [F1.nicheTop, F1.nicheBot, F1.mainStair];
  const far: Rect[] = [];
  const near: Rect[] = [];
  const at = (x: number, y: number): Rect => ({
    x: x - CORRIDOR_COLUMN / 2,
    y: y - CORRIDOR_COLUMN / 2,
    w: CORRIDOR_COLUMN,
    h: CORRIDOR_COLUMN,
  });
  for (const x of [...xs].sort((a, b) => a - b)) {
    if (busy.some((b) => x > b.x - 24 && x < b.x + b.w + 24)) continue;
    far.push(at(x, CY0 + COLUMN_INSET));
    near.push(at(x, CY1 - COLUMN_INSET));
  }
  return { far, near };
}

/** Walls of the cinema level. Room doorways, the two niches and the foyer are gaps. */
export function floor1Walls(): Wall[] {
  const w: Wall[] = [];
  w.push({ x: 0, y: 0, w: W, h: T }, { x: 0, y: H - T, w: W, h: T }, { x: 0, y: 0, w: T, h: H }, { x: W - T, y: 0, w: T, h: H });
  for (const side of [-1, 1] as const) {
    const yy = side < 0 ? CY0 - T : CY1;
    const rs = rooms.filter((r) => r.side === side);
    let x = 0;
    const gaps: Array<[number, number]> = rs.map((r) => {
      const d = roomDoor(r);
      return [d.x, d.x + d.w];
    });
    const niche = side < 0 ? F1.nicheTop : F1.nicheBot;
    const mouth = nicheMouth(niche);
    // The corridor wall runs UNBROKEN behind the staircase — the flight stands in
    // the corridor, it is not a pocket cut into the wall (`F1.nicheTop`). The one
    // segment behind the mouth is cut out of the run here and pushed back below
    // as its own wall, so the renderer has something tagged to hang the stair on.
    gaps.push([mouth.x, mouth.x + mouth.w]);
    // The foyer opens straight onto the corridor.
    if (side > 0) gaps.push([F1.foyer.x, F1.foyer.x + F1.foyer.w]);
    gaps.sort((a, b) => a[0] - b[0]);
    for (const [g0, g1] of gaps) {
      if (g0 > x) w.push({ x, y: yy, w: g0 - x, h: T });
      x = g1;
    }
    w.push({ x, y: yy, w: W - x, h: T });
    for (const r of rs) {
      w.push({ x: r.x - T, y: r.y, w: T, h: r.h }, { x: r.x + r.w, y: r.y, w: T, h: r.h });
      const by = side < 0 ? r.y - T : r.y + r.h;
      w.push({ x: r.x - T, y: by, w: r.w + 2 * T, h: T });
    }
    /*
     * The staircase itself, standing in the corridor.
     *
     * The head wall first: the piece of corridor wall the top step backs onto,
     * which is what you face when you step onto it, and the one thing on this
     * floor tagged `stair: ±1` for the renderer.
     */
    w.push({
      x: mouth.x,
      y: yy,
      w: mouth.w,
      h: T,
      stair: side,
      kind: 'stair-head',
      why: (b) => `${b.name}: that is the wall at the head of the stairs. The way down is the step in front of it`,
    });
    /*
     * Then the flight, west of the top step: one staircase falling away from the
     * head, two ramps with a half-landing between them (`nicheRamps`). It is a
     * wall the whole way — you can come down it, chapter 1 does in the closing
     * cutscene, and nothing in this game goes up one.
     *
     * It used to be emitted as two runs with a walkable square between them, which
     * is the "center, and 2 descent" Michele sent back on 24 Sep. The loop still
     * reads as a pair of spans because the mouth is a span of the flight; with the
     * mouth at the east end the eastern span is empty and is skipped.
     *
     * The near-side piece is tagged separately so the renderer can cut it to the
     * balustrade the plan draws along the flight's open face — *"There's a
     * protection on West and North"* — instead of standing a full-height block
     * between the fixed camera and the corridor.
     */
    const runKind = side < 0 ? 'stairwell' : 'stairwell-near';
    const runWhy = (b: Bot): string =>
      b.kind === 'biggy'
        ? 'Biggy: that flight is 1.41 m wide and I am 1.44. The other stairs, then'
        : `${b.name}: the flight down to the exhibition hall. One way on, and it is the top step, at the far end`;
    for (const [x0, x1] of [
      [niche.x, mouth.x],
      [mouth.x + mouth.w, niche.x + niche.w],
    ] as const) {
      if (x1 - x0 > 0.5) w.push({ x: x0, y: niche.y, w: x1 - x0, h: niche.h, kind: runKind, why: runWhy });
    }
    /*
     * ...and the balustrade along the flight's open face, ACROSS THE MOUTH.
     *
     * This is the piece that makes the head of the stair a stair. Michele's photo
     * is what put it here — *"There's a protection on West and North, as you can
     * see on the second picture"* — but it earns its collider on gameplay: with
     * the way on moved to the end of the flight, the top step was open on two
     * sides and **Biggy walked straight onto it**, which he has not been able to
     * do since note 18 of `docs/playtest-notes.md` (*"they seem fit for biggy to
     * pass, make the passage more narrow"*). A driven probe caught it, a grid
     * sample would not have.
     *
     * Guarded, the head is what it is in the building: a pocket the width of the
     * flight, walled by the corridor behind and the balustrade in front, entered
     * from the east END by turning in off the corridor. 17.7 less the rail is
     * **16.2 px = 1.30 m clear**; Droid is 1.00 and Voxxy 0.76 and Biggy is 1.44.
     * Over the rest of the flight the rail is inside the run, which is already
     * solid, so only this stretch is emitted.
     */
    const railY = side < 0 ? niche.y + niche.h - NICHE_RAIL : niche.y;
    w.push({
      x: mouth.x,
      y: railY,
      w: mouth.w,
      h: NICHE_RAIL,
      kind: side < 0 ? 'stair-rail' : 'stair-rail-near',
      why: (b) =>
        b.kind === 'biggy'
          ? 'Biggy: the handrail down the open side, and 1.30 m between it and the wall. I am 1.44. I have met this stair before'
          : `${b.name}: the balustrade along the stairs. The way on is round the end, off the corridor`,
    });
  }
  const f = F1.foyer;
  w.push({ x: f.x - T, y: f.y, w: T, h: f.h }, { x: f.x + f.w, y: f.y, w: T, h: f.h }, { x: f.x - T, y: f.y + f.h, w: f.w + 2 * T, h: T });
  const k = F1.kiosk;
  w.push(
    { x: k.x, y: k.y, w: k.w, h: T, glass: true },
    { x: k.x, y: k.y + k.h - T, w: k.w, h: T, glass: true },
    { x: k.x + k.w - T, y: k.y, w: T, h: k.h, glass: true },
    { x: k.x, y: k.y, w: T, h: 16, glass: true },
    { x: k.x, y: k.y + 40, w: T, h: 16, glass: true },
    { x: k.x, y: k.y + 16, w: T, h: 24, hidden: true, skipFor: (b) => b.kind === 'voxxy', why: (b) => `${b.name}: the kiosk hatch is Voxxy-sized` },
  );
  // Top of the main staircase.
  w.push({ x: F1.mainStair.x + F1.mainStair.w, y: CY0, w: T, h: CY1 - CY0, stair: 0 });

  /* ------------------------------------------- what stands in the rooms
   *
   * Every auditorium's seating and its screen.
   */
  for (const r of rooms) {
    // Room E gets no seat blocks — chapter 1 dresses it with its own rows and its
    // own aisle — but it does get a screen, like every other house. It is the one
    // screen in the building that MATTERS as an object: chapter 1 bounces orange
    // and green off it into the exit alcove, and it was the one screen with no
    // collider until the sweep started opening the gates it lives behind.
    if (r.n !== 'E') {
      for (const s of seatBlockRects(r)) {
        w.push({
          ...s,
          low: true,
          kind: 'seats',
          why: (b) => (b.kind === 'biggy' ? 'Biggy: seat rows. Too wide for me — use an aisle' : `${b.name}: seat rows. The aisles are that way`),
        });
      }
    }
    w.push({
      ...roomScreen(r),
      glass: true,
      kind: 'screen',
      why: (b) => `${b.name}: that is the screen. Fifteen metres of it, and it does not move`,
    });
  }

  /*
   * Cinema E's exit alcove: a top wall and a side wall, open toward the screen.
   *
   * Solid, not `low` — the pocket has to be light-tight everywhere but its mouth,
   * or Biggy's flood reaches the clue straight over the seat backs and the mirror
   * beat dies. See `cinemaEExit`.
   */
  {
    const a = cinemaEExit();
    const why = (b: Bot): string =>
      b.kind === 'biggy'
        ? 'Biggy: the exit alcove. I can see into it and I will never fit down that aisle — the screen can carry my light in for me'
        : `${b.name}: the exit alcove. It only opens toward the screen`;
    w.push(
      { x: a.x - T, y: a.y - T, w: a.w + 2 * T, h: T, kind: 'alcove', why },
      { x: a.x - T, y: a.y, w: T, h: a.h, kind: 'alcove', why },
    );
  }

  /* -------------------------------------------- what stands in the corridor */
  const cols = corridorColumns();
  for (const c of cols.far) {
    w.push({
      ...c,
      kind: 'corridor-column',
      why: (b) =>
        b.kind === 'biggy'
          ? 'Biggy: column. It holds the roof up, I hold nothing up. It wins'
          : `${b.name}: a corridor column. Go round`,
    });
  }
  for (const c of cols.near) {
    w.push({ ...c, low: true, kind: 'corridor-plinth', why: (b) => `${b.name}: the foot of a column, knee high and solid` });
  }

  /* ------------------------------------------------ what stands in the foyer */
  w.push({ ...F1.bar, low: true, kind: 'bar', why: (b) => `${b.name}: the foyer bar. Shut, dark, and nobody has left a drink on it` });
  for (const s of F1.barStools) {
    w.push({ ...s, low: true, kind: 'stool', why: (b) => `${b.name}: a bar stool. Push past it or go round` });
  }
  return w;
}

/* ---------------------------------------------------------------- ground floor */

export const SPONSORS = [
  'Kube Kettle',
  'JavaBeans & Co',
  'Cloudy Bank',
  'Rubber Duck Inc',
  'Legacy Systems SA',
  'Monolith GmbH',
  'NullPointer Insurance',
  'Async Airlines',
  'Big Data Bakery',
  'Sticker Mine',
  'Regex Racing',
  'The Coffee Sponsor',
] as const;

/** Booths laid out as half tables (Voxxy fits under the cloth) rather than built walls. */
const TABLES = new Set(['2,0', '1,1', '1,2', '0,3', '0,1', '2,3']);

const booths: Booth[] = [];
{
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 400 + col * 160;
      const y = 250 + row * 140;
      /*
       * THE END-OF-ROW STANDS ARE NARROWER, AND THE STAIRCASE IS WHY.
       *
       * Michele, twice: *"the orange thing and the big black thing with halo (is
       * it a booth? in the middle of the stairs?)"* and then *"staircase should be
       * clear of booths in geenral"*. At w 100 column 3 ran 880..980 against
       * `GF.smallStairs.x = 952` — **28 px inside the stairwell, three booths
       * deep** — and `boothTotem()` put a lit 10 px totem at 967..977, entirely
       * inside it. That totem is the orange thing in his screenshot, and once the
       * stands were dressed it started carrying the words `Async Airlines`, so
       * dressing them made the fault easier to see rather than harder.
       *
       * 60 px ends the column at 940 with 12 px to spare and puts the totem at
       * 927..937. The 160 x 140 pitch does not move, which matters: `HALL_COLUMNS`
       * is derived from these rects, and the column grid phases against the bays.
       * Measured before and after — the grid is identical, 18 columns at the same
       * eighteen positions, because the column feet sit in the aisles at x 853..867
       * and never touched this column's footprint in the first place.
       */
      const w = col === 3 ? 60 : 100;
      booths.push({ x, y, w, h: 70, name: SPONSORS[k++], table: TABLES.has(row + ',' + col), col, row });
    }
  }
}

/** Depth of a service counter — the wardrobe's hand-in top. */
export const COUNTER = 10;

/**
 * THE LOBBY, AS MICHELE PLOTTED IT (`docs/ground-floor-lobby-fix.md`).
 *
 * Every rect below the hall comes from his own calibrated plot of
 * `plans/exhibition-floor.jpg`, not from a reading of the plan and not from the
 * prototype, which had invented most of this quadrant. Two things his plot settles
 * that no measurement of ours had:
 *
 *  - the hall's right edge is **not** a scalloped wall with four holes in it. It is
 *    a concrete wall across the upper stretch and the SMALL STAIRCASE across the
 *    lower one, and that staircase is the only way between the hall and the lobby;
 *  - the lobby floor stands **half a metre above** the hall floor, so that
 *    staircase is a real threshold rather than a doorway.
 *
 * The blocks are clamped at y 6 where the building reaches further "up" in world
 * terms than a 700-tall canvas has room for — his call, rather than rescaling a
 * floor that is already correct against the hall.
 */
export const GF = {
  hall: { x: 30, y: 90, w: 1010, h: 600 },
  /**
   * The **one** opening in the hall's right edge: the stepped threshold onto the
   * small staircase, world y 285..568.
   *
   * The prototype's four unequal gaps — later six door bays — were fiction, and
   * they survived into the build unquestioned. The plan draws a run of long steps
   * exactly here and solid wall either side of it, which is also why the hall and
   * the lobby are at different levels: see `LOBBY_RISE_M`.
   */
  openings: [[285, 568]] as Array<[number, number]>,
  /**
   * The small staircase: 5-7 shallow steps down from the lobby into the hall,
   * 22 m wide, the only route between the two.
   */
  smallStairs: { x: 952, y: 285, w: 93, h: 283 },
  /** The concrete wall closing the hall's right edge above the threshold. */
  concreteWall: { x: 1039, y: 90, w: 43, h: 199 },
  food: {
    court: { x: 30, y: 90, w: 300, h: 160 },
    /** The three queue doorways. */
    gaps: [
      [80, 124],
      [210, 254],
      [285, 329],
    ] as Array<[number, number]>,
    soup: { x: 60, y: 100, w: 90, h: 30 },
    shelf: { x: 165, y: 100, w: 22, h: 16 },
    sandwich: { x: 200, y: 100, w: 70, h: 30 },
    coffee: { x: 285, y: 100, w: 45, h: 30 },
  },
  /**
   * The two secondary staircases up to the cinema corridor, on the hall's far side.
   *
   * These are **enclosed shafts**, not open flights. Michele, playing chapter 2:
   * *"In devoxx the stairs are not open but look like rooms."* He is right and the
   * plan says so — `plans/exhibition-floor-simple.png` draws each one as a walled
   * box standing free in the hall with a **pair of double doors in each of its two
   * long (plan west and east) faces**, near the plan-north end, and the ascent
   * arrow running away from them down the middle. Plan-north is world **west** (see
   * this module's header: plan top -> world left), so the landing is at the west
   * end, the flight climbs eastward, and the doors are in the ±y faces.
   * `stairDoors`, `stairFlightRect` and `stairRamps` below cut the rect up;
   * `groundWalls` builds the shell. The doorways moved there 24 Sep 2026, on
   * Michele's *"you put the opening north, but it's on the sides (WEST, EAST)"*.
   *
   * ## Where they are — measured, 24 Sep 2026
   *
   * Michele circled both of them on `plans/exhibition-floor-stairs-annotated.png`
   * and the shafts were still in the prototype's places. Read off that PNG
   * (900 x 1141; the unannotated `exhibition-floor.jpg` is the same drawing
   * pixel-for-pixel, which is what makes the lobby mapping below reusable):
   *
   * | | plan px |
   * |---|---|
   * | both shafts, plan-north wall (the head) | y = **165** |
   * | both shafts, plan-south wall (the foot) | y = **323** |
   * | west shaft, across | x 222..269 = **47** |
   * | east shaft, across | x 421..469 = **48** |
   *
   * Through `docs/ground-floor-lobby-fix.md`'s mapping — Michele's own calibration
   * of this floor, checked here against the small staircase (world x 952..1045,
   * y 285..568 lands on the long steps the plan draws at plan y 729..794,
   * x 190..492) and against the toilets:
   *
   * ```
   * world_x = 30 + (plan_y -  85) * 1.4326
   * world_y = 90 + (700 - plan_x) * 0.9375
   * ```
   *
   *  - plan y 165 -> world x **144.6**; plan y 323 -> world x **371.0** (w 226.4)
   *  - east shaft (world **top**): plan x 469..421 -> world y **306.6..351.6**
   *  - west shaft (world **bot**): plan x 269..222 -> world y **494.1..538.1**
   *
   * Against the prototype's `{150, 300, 200, 60}` / `{150, 430, 200, 60}`:
   * the **top** shaft was very nearly right on centre (329 measured against 330)
   * but 15 px too deep and 25 px too short; the **bot** shaft was **64 px too far
   * toward the middle of the hall**, which halved the gap between the two — the
   * plan leaves 142 px of hall between them and the build left 70.
   */
  stairs: [
    { x: 144.6, y: 306.6, w: 226.4, h: 45.0, to: 'top' as const },
    { x: 144.6, y: 494.1, w: 226.4, h: 44.1, to: 'bot' as const },
  ],
  tech: { x: 30, y: 560, w: 170, h: 130 },
  panel: { x: 50, y: 568, w: 26, h: 16 },
  rack: { x: 140, y: 640, w: 20, h: 24 },
  /**
   * The router cabinet, against the technical room's back wall beside the breaker
   * panel, heavy enough that only Biggy can swing its door (chapter 2,
   * `ch2-expo.ts`).
   *
   * It is venue furniture, not a chapter constant: the rect lives here so that
   * `src/render/venue/ground.ts` can build it without knowing a chapter exists,
   * exactly as it already does for `roller` and `gate`. Its SOUTH face (y + h) is
   * the one the door and the terminal behind it are on — the face that looks at
   * the diorama camera, which sits on the +y side (`src/render/camera.ts`). Clear
   * of `panel` (x 50..76) so Droid cannot reach both at once by accident, and
   * clear of `rack` (y 640..664).
   */
  cabinet: { x: 120, y: 560, w: 64, h: 20 },
  /** Devoxx polo & badge store, roller door on its hall side. */
  store: { x: 900, y: 90, w: 140, h: 110 },
  roller: { x: 894, y: 130, w: T, h: 60 },
  booths,
  /**
   * The wardrobe: the larger, northern half of the reception block, with its
   * hand-in counter along the south face.
   */
  coatroom: { x: 1172, y: 262, w: 126, h: 122 },
  /** The reception desk itself — BELOW the coatroom, not beside it. */
  reception: { x: 1174, y: 388, w: 126, h: 75 },
  /**
   * The badge printer, ON the reception counter's south run — not inside the desk.
   *
   * Michele: *"The printer might be on the reception counter, so no need to
   * enter?"* Its y is `reception.y + reception.h - COUNTER` (453), so it stands on
   * the run a robot can reach from the concourse rather than behind it.
   */
  printer: { x: 1262, y: 453, w: 20, h: 10 },
  /** The main staircase up to the Devoxx rooms, east of the reception block. */
  mainStair: { x: 1305, y: 263, w: 112, h: 197 },
  /**
   * The gate across the foot of the main staircase — the one Stephan stands at.
   *
   * It closes the staircase's SOUTH face, which is the only side of it anybody can
   * reach: the wardrobe and the reception desk close the west, and "when Devoxx
   * opens this passage is closed and you go to the reception first" is exactly the
   * gate chapter 3 ends on.
   */
  gate: { x: 1305, y: 263 + 197, w: 112, h: T },
  /** BOF rooms: tables, workshops, and usable game space. Top-clamped. */
  bof: { x: 1195, y: 6, w: 275, h: 151 },
  /** Internal partitions of the BOF block, as offsets from `bof.x`. */
  bofSplits: [92, 184] as const,
  toilets: { x: 1085, y: 6, w: 105, h: 150 },
  /**
   * The main entrance: the LEFT-HAND DOORS ONLY.
   *
   * Michele: "The whole wall until the BOF rooms is made of glass doors. Only the
   * ones on the left are open for Devoxx, so people enter next to the reception."
   * The rest of that run is fixed glazing (`groundWalls`), and chapter 3's visitors
   * come in here rather than through the whole wall or off the canvas edge.
   */
  entrance: { x: 1472, y: 422, w: 33, h: 136 },
  /**
   * Visitor lane grid for chapter 3.
   *
   * The west lane was 370, which was 20 px clear of the stair shafts while they
   * were 200 px long. At their measured 226.4 they end at x 371, so a lane node at
   * 370 would have sat *inside* the shaft wall and a visitor snapped to it could
   * never arrive. 385 is the middle of the 29 px the plan leaves between the foot
   * of the shafts (371) and the west edge of the booth grid (400).
   */
  laneX: [385, 530, 690, 850, 1010],
  laneY: [215, 355, 495, 645],
} as const;

/**
 * How far the lobby floor stands above the exhibition hall's, metres.
 *
 * Michele measured the drop at about half a metre — 5-7 shallow risers of roughly
 * 80 mm. It is 43% of Voxxy's height, which is what makes the threshold read as a
 * real obstacle rather than as a ramp, and the sim stays 2D: the steps are an
 * opening in the hall's right edge, not a height field.
 *
 * `src/sim` never reads this; the renderer does, to build the two levels and the
 * flight between them.
 */
export const LOBBY_RISE_M = 0.5;

/**
 * The height of the ground-floor walking surface above the hall floor, metres, at
 * a sim x. The level change runs along the hall's right edge, so it depends on x
 * alone: 0 in the hall, `LOBBY_RISE_M` in the lobby, and interpolated across the
 * small staircase's footprint.
 */
export function groundRiseM(x: number): number {
  const s = GF.smallStairs;
  if (x <= s.x) return 0;
  if (x >= s.x + s.w) return LOBBY_RISE_M;
  return ((x - s.x) / s.w) * LOBBY_RISE_M;
}

/**
 * The top of the main staircase above the hall floor, metres.
 *
 * It lived in `src/render/venue/ground.ts` as `STAIR_RISE` and it is what that
 * file still builds the flight to — but it is also the height a robot walking
 * chapter 3's transition is standing at, which makes it sim geometry. See
 * `groundPlates`.
 */
export const MAIN_STAIR_TOP_M = 5;

/**
 * Every raised walking surface the ground floor has, as `Plate`s.
 *
 * Three, and each one is something the renderer has drawn correctly since the
 * beginning and nothing has ever stood on:
 *
 *  - **the lobby**, half a metre up, flat, east of the small staircase;
 *  - **the small staircase**, six long steps ramping from the hall to the lobby —
 *    the same interpolation `groundRiseM` above does, which is asserted against
 *    this list in `tests/surface.test.ts` so the two cannot drift;
 *  - **the main flight**, climbing NORTH out of the lobby to the first floor.
 *    `src/render/venue/ground.ts` builds it from `bottomY: LOBBY_RISE_M` at its
 *    south edge to `topY: MAIN_STAIR_TOP_M` at its north, and until now chapter
 *    3's transition walked the three of them straight through it at hall level —
 *    which is the "walks into a staircase" note in `docs/playtest-notes.md`.
 *
 * A plate is not a wall (see `src/sim/surface.ts`): every cell of these stays
 * walkable, and what stops a robot strolling up the main flight in play is the
 * `gate` chapter 3 puts across its foot, exactly as before.
 */
export function groundPlates(): Plate[] {
  const s = GF.smallStairs;
  const ms = GF.mainStair;
  return [
    { kind: 'lobby', x: s.x + s.w, y: 0, w: W - (s.x + s.w), h: H, lo: LOBBY_RISE_M },
    { kind: 'lobby-steps', ...s, lo: 0, hi: LOBBY_RISE_M, axis: 'x' },
    // North edge is the top: `axis: 'y'` runs low-y to high-y, so `lo` is the TOP
    // of the flight and `hi` is its foot. The names are the axis's ends, not the
    // stair's.
    { kind: 'main-flight', ...ms, lo: MAIN_STAIR_TOP_M, hi: LOBBY_RISE_M, axis: 'y' },
  ];
}

/* ------------------------------------------------- what stands in the hall
 *
 * Everything below lived in `src/render/venue/ground.ts` until Michele played
 * chapter 2 and reported *"robots can go through staircase and objects"*. The
 * renderer was drawing eighteen structural columns, four lobby columns, two
 * planters and two whole staircases that the sim had never been told about — a
 * throwaway flood-fill probe measured 100% of every one of those footprints as
 * walkable. It is the same shape of bug as chapter 1's missing seat rows
 * (`docs/playtest-notes.md`, note 3): the venue draws from the plan and the sim
 * only knows what a chapter pushes at runtime.
 *
 * The cure is the same one: the geometry lives HERE, `groundWalls()` emits it, and
 * the renderer draws the sim's own wall list. There is no second copy to drift.
 */

/** Sim px of stairwell wall the shaft's shell is built from. */
const SHAFT_T = T;

/*
 * THE SHAFT'S INSIDES, RE-MEASURED OFF THE PLAN — 24 Sep 2026, second pass.
 *
 * `GF.stairs` puts the two shafts where Michele circled them and he has since
 * confirmed that much — *"On ground floor, your stairs are good"* — so the outer
 * rects below are untouched. What was wrong is everything inside them, and he
 * named it in one line: *"you put the opening north, but it's on the sides (WEST,
 * EAST). Worth a fix."* `SHAFT_DOOR`'s own comment had carried the same note as
 * deferred work since the shafts moved; this round resolves it.
 *
 * ## Read the compass twice
 *
 * The shaft rect is 226 x 45 **in world coordinates**, so its long faces are its
 * ±y faces and its short ends are west and east — and that is NOT the frame
 * Michele's sentence is in. This module rotates the plan 90° (see the header:
 * plan top -> world left, plan left -> world bottom), so
 *
 * ```
 *   building north -> world -x      building west -> world +y
 *   building south -> world +x      building east -> world -y
 * ```
 *
 * The building's WEST and EAST faces are therefore the rect's two LONG faces, and
 * "openings on the sides (WEST, EAST)" and "a doorway in each long face" are the
 * same statement said in two frames. Counted on
 * `plans/exhibition-floor-simple.png` (1562 x 2238), thresholding the drawing's
 * green door symbols inside each shaft's own bands:
 *
 * | face | door pixels, east shaft | west shaft |
 * |---|---|---|
 * | plan-north short end | **0** | **0** |
 * | plan-south short end | **0** | **0** |
 * | plan-west long face | 237 | 204 |
 * | plan-east long face | 279 | 257 |
 *
 * Both shafts, both long faces, a pair of leaves meeting in the middle of each;
 * neither short end carries a door symbol at all. The old single doorway in the
 * short west end is gone, and that end is now wall like the other.
 *
 * ## The numbers
 *
 * Measured along the shaft on `exhibition-floor-simple.png` and mapped onto the
 * annotated plan the world mapping is calibrated to by
 * `annot_y = 165.5 + (simple_y - 380.5) * 0.53020` (the two end walls are the
 * anchors), then through `world_x = 30 + (plan_y - 85) * 1.4326`:
 *
 * ```
 *   plan y 165  ->  world x 144.6   north end wall — closed, no door
 *   plan y 170  ->  world x 151.8   doors open
 *   plan y 205  ->  world x 201.9   doors close
 *   plan y 234  ->  world x 243.5   first riser
 *   plan y 276  ->  world x 303.3   treads stop — the half-landing
 *   plan y 292  ->  world x 326.8   treads resume
 *   plan y 323  ->  world x 371.0   south end
 * ```
 *
 * The first riser at plan y 234 was read straight off the annotated drawing too
 * (the first full-width tread line is at y 234), which is the check that the
 * mapping between the two renderings of this plan is sound.
 */

/**
 * Clear width of the double doors, sim px — **50.1**, along the shaft.
 *
 * It replaces a 24 that was a different measurement of a different opening: the
 * door used to be in the short west end, where its width ran across the shaft on
 * this floor's *other* scale. In the long face the opening runs along world x, so
 * it is carried at the along-shaft scale 1.4326, and 35 plan px of it is 50.1.
 * As a fraction of the shaft it is 35/158 = 22% either way, which is the check
 * that the anisotropy has not been applied twice.
 *
 * Biggy is 18 px across. 50.1 clears him nearly threefold, so chapter 2 can still
 * bring all three of them out of a stairwell shoulder to shoulder if it wants to.
 */
const SHAFT_DOOR = 50.1;
/**
 * Depth of the landing inside the doors, before the first riser, sim px.
 *
 * **98.9, up from 56**: plan y 165..234, measured above. The plan draws a deep
 * landing behind the doors — deep enough that both door pairs open onto it well
 * clear of the first riser — and then the flight. The sim is 2D and nothing
 * climbs, so the landing is the part of the shaft a robot may stand in and the
 * flight is a wall: you came down it, you cannot walk back up it.
 */
const SHAFT_LANDING = 98.9;
/** Where the doors start, as an offset along the shaft from its west end. */
const SHAFT_DOOR_AT = 7.2;
/** The half-landing between the two ramps, as offsets from the shaft's west end. */
const SHAFT_MID_0 = 158.7;
const SHAFT_MID_1 = 182.2;

/**
 * Both doorways: one in each long face, `[north, south]` in world terms — the
 * building's east and west faces (see the compass note above).
 */
export function stairDoors(s: Rect): [Rect, Rect] {
  const x = s.x + SHAFT_DOOR_AT;
  return [
    { x, y: s.y, w: SHAFT_DOOR, h: SHAFT_T },
    { x, y: s.y + s.h - SHAFT_T, w: SHAFT_DOOR, h: SHAFT_T },
  ];
}

/**
 * One of the pair, when only one is wanted: the SOUTH door, because the diorama
 * camera sits on the +y side (`src/render/camera.ts`) and a robot coming out of
 * the north one would be read through the shaft.
 *
 * **Prefer `stairDoors`.** A shaft has two doors now and each opens onto
 * something different — the BOT shaft's south door in particular has 15.8 px of
 * floor outside it before the technical room's north wall, which Biggy is 18
 * across and cannot use. Nothing in the game picks a door through this function
 * any more; chapter 2 starts its robots on the landing between the two
 * (`stairLanding`).
 */
export function stairDoor(s: Rect): Rect {
  return stairDoors(s)[1];
}

/** The part of a stair shaft the flight itself occupies — east of the landing. */
export function stairFlightRect(s: Rect): Rect {
  const x = s.x + SHAFT_LANDING + SHAFT_T;
  return { x, y: s.y + SHAFT_T, w: s.x + s.w - SHAFT_T - x, h: s.h - 2 * SHAFT_T };
}

/** The walkable landing inside the doors, west of the flight. */
export function stairLanding(s: Rect): Rect {
  return { x: s.x + SHAFT_T, y: s.y + SHAFT_T, w: SHAFT_LANDING - SHAFT_T, h: s.h - 2 * SHAFT_T };
}

/**
 * The half-landing partway up the flight — the "mid plane between two ramps"
 * Michele named. Not walkable: it is part of the flight, which is a wall.
 */
export function stairMidLanding(s: Rect): Rect {
  const f = stairFlightRect(s);
  return { x: s.x + SHAFT_MID_0, y: f.y, w: SHAFT_MID_1 - SHAFT_MID_0, h: f.h };
}

/**
 * The flight's two ramps, **foot first**: the lower one climbs east from the first
 * riser to the half-landing, the upper one climbs east from the half-landing to
 * the top of the shaft. One staircase with a mid-plane, not two descents.
 */
export function stairRamps(s: Rect): [Rect, Rect] {
  const f = stairFlightRect(s);
  const mid = stairMidLanding(s);
  return [
    { x: f.x, y: f.y, w: mid.x - f.x, h: f.h },
    { x: mid.x + mid.w, y: f.y, w: f.x + f.w - (mid.x + mid.w), h: f.h },
  ];
}

/**
 * Shell of one enclosed secondary staircase: four walls, two doorways, and the flight.
 *
 * The flight itself is a wall, and it is a real gate rather than scenery, so it
 * speaks in three voices like every other gate in the building (CLAUDE.md). The
 * shaft's own flanks get one line: a robot walking into the outside of a stairwell
 * has not been stopped by a puzzle, it has been stopped by a building.
 *
 * **Both short ends are now solid and both long faces are cut**, which is Michele's
 * *"you put the opening north, but it's on the sides (WEST, EAST)"* — see the
 * compass note above `stairDoors` for why the building's west and east are this
 * rect's long faces.
 */
function stairShaftWalls(s: Rect, to: string): Wall[] {
  const [dn, ds] = stairDoors(s);
  const kind = 'stairwell';
  const why = (b: Bot): string =>
    `${b.name}: the ${to === 'top' ? 'north' : 'south'} stairwell, walled in. The doors are in the long sides`;
  return [
    // Both short ends are closed, and both long flanks are cut by a pair of doors
    // near the west end. The near flank keeps its own kind so the renderer can cut
    // it down rather than stand a full-height box in front of the camera.
    { x: s.x, y: s.y + SHAFT_T, w: SHAFT_T, h: s.h - 2 * SHAFT_T, kind, why },
    { x: s.x + s.w - SHAFT_T, y: s.y + SHAFT_T, w: SHAFT_T, h: s.h - 2 * SHAFT_T, kind, why },
    { x: s.x, y: s.y, w: dn.x - s.x, h: SHAFT_T, kind, why },
    { x: dn.x + dn.w, y: s.y, w: s.x + s.w - (dn.x + dn.w), h: SHAFT_T, kind, why },
    { x: s.x, y: s.y + s.h - SHAFT_T, w: ds.x - s.x, h: SHAFT_T, kind: 'stairwell-near', why },
    { x: ds.x + ds.w, y: s.y + s.h - SHAFT_T, w: s.x + s.w - (ds.x + ds.w), h: SHAFT_T, kind: 'stairwell-near', why },
    // The foot of the flight. Nothing in this game climbs stairs.
    {
      x: s.x + SHAFT_LANDING,
      y: s.y + SHAFT_T,
      w: SHAFT_T,
      h: s.h - 2 * SHAFT_T,
      kind: 'stair-foot',
      stair: to === 'top' ? -1 : 1,
      why: (b) =>
        b.kind === 'voxxy'
          ? 'Voxxy: back up? Twelve risers and every one of them is taller than I am. We came DOWN these for a reason'
          : b.kind === 'droid'
            ? 'Droid: I could take that flight. Slowly. And then I would be alone on a floor with nothing on it'
            : 'Biggy: stairs. Down, once, loudly. Up, never',
    },
  ];
}

/**
 * The hall's structural column grid, 14 x 14 sim px feet.
 *
 * The plan draws it at a regular 160 x 140 pitch — the same pitch as the booth
 * grid, phased half a bay off it, so the columns stand in the walking lanes and the
 * booths are built in the bays. A column that stands inside a block the plan
 * already fills (the catering court, the technical room, the store, the threshold,
 * a booth, a stair shaft) is not drawn and not built.
 */
export const HALL_COLUMNS: readonly Rect[] = (() => {
  const h = GF.hall;
  const solids: Rect[] = [
    GF.food.court,
    GF.tech,
    GF.store,
    GF.smallStairs,
    GF.concreteWall,
    ...GF.stairs.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
    ...GF.booths.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
  ];
  const hits = (a: Rect, b: Rect, pad: number): boolean =>
    a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  const out: Rect[] = [];
  for (let x = h.x + 190; x < h.x + h.w; x += 160) {
    for (let y = h.y + 110; y < h.y + h.h; y += 140) {
      const foot: Rect = { x: x - 7, y: y - 7, w: 14, h: 14 };
      if (solids.some((s) => hits(foot, s, 6))) continue;
      out.push(foot);
    }
  }
  return Object.freeze(out);
})();

/** The dark blue lobby columns — `media/other-images/image-1790032582765.webp`. */
export const LOBBY_COLUMNS: readonly Rect[] = Object.freeze(
  ([
    [1078, 200],
    [1078, 655],
    [1240, 655],
    [1400, 655],
  ] as Array<[number, number]>).map(([x, y]): Rect => ({ x: x - 11, y: y - 11, w: 22, h: 22 })),
);

/** Planters along the arrivals concourse. Low: light crosses them, robots do not. */
export const LOBBY_PLANTERS: readonly Rect[] = Object.freeze(
  ([
    [1110, 350],
    [1430, 250],
  ] as Array<[number, number]>).map(([x, y]): Rect => ({ x: x - 28, y: y - 12, w: 56, h: 24 })),
);

/* ------------------------------------------------ the second round of the same
 *
 * Everything from here to `groundWalls` was, until this round, drawn by
 * `src/render/venue/ground.ts` out of its own numbers: the sponsor booths'
 * totems and AV crates, the toilet partitions, the BOF rooms' slat walls, the
 * hall's red accent panels, the store's back wall, the entrance's door-bay
 * mullions and open leaves, and the forecourt's bollards and planters. Michele,
 * playing the build after the first thirty-seven were fixed: *"this cube is
 * walk-through"*, *"Entrance walls are still walkable"*. Same class, same cure.
 */

/** The orange totem beside a built booth — a 2.1 m marker standing in the lane. */
export function boothTotem(b: Booth): Rect | null {
  return b.table ? null : { x: b.x + b.w - 13, y: b.y + b.h + 7, w: 10, h: 10 };
}
/** The AV crate in front of a sponsor half table. */
export function boothCrate(b: Booth): Rect | null {
  return b.table ? { x: b.x + b.w / 2 - 9, y: b.y - 23, w: 18, h: 18 } : null;
}

/** The toilet block's two internal partitions. */
export function toiletPartitions(): Rect[] {
  const tl = GF.toilets;
  return [1, 2].map((k): Rect => ({ x: tl.x + (k * tl.w) / 3, y: tl.y + T, w: 3, h: tl.h - 34 }));
}

/** The wood-slat wall down one side of each BOF room. */
export function bofSlatWalls(): Rect[] {
  const b = GF.bof;
  const edges = [0, ...GF.bofSplits, b.w];
  const out: Rect[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const x0 = b.x + edges[i] + T;
    if (b.x + edges[i + 1] - x0 < 20) continue;
    out.push({ x: x0 + 2, y: b.y + 18, w: 4, h: b.h - 40 });
  }
  return out;
}

/** The cloth-draped tables in the BOF rooms, two per room. */
export function bofTables(): Rect[] {
  const b = GF.bof;
  const edges = [0, ...GF.bofSplits, b.w];
  const out: Rect[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const x0 = b.x + edges[i] + T;
    const roomW = b.x + edges[i + 1] - x0;
    if (roomW < 20) continue;
    for (let r = 0; r < 2; r++) out.push({ x: x0 + 10, y: b.y + 54 + r * 42, w: roomW - 20, h: 20 });
  }
  return out;
}

/** The red accent panels down the hall's two long walls. */
export const HALL_PANELS: readonly Rect[] = Object.freeze(
  [0, 1, 2, 3].flatMap((k): Rect[] => {
    const h = GF.hall;
    const x = h.x + 120 + k * 230;
    return [
      { x, y: h.y + 1, w: 90, h: 2 },
      { x, y: h.y + h.h - 3, w: 90, h: 2 },
    ];
  }),
);

/** The store's wood back wall, behind the polo racks. */
export const STORE_WALL: Rect = { x: GF.store.x + 10, y: GF.store.y + 6, w: GF.store.w - 20, h: 8 };

/**
 * THE ENTRANCE, AS THREE DOOR BAYS RATHER THAN ONE HOLE.
 *
 * `GF.entrance` is the run of the facade whose doors are open for Devoxx. The
 * renderer has always drawn it as three bays divided by full-height mullions,
 * with a leaf standing open against each reveal — and the sim carried one clear
 * 136 px gap, so a robot walked straight through every one of those frames.
 * Michele: *"Entrance walls are still walkable."* Both are `glass`: they block a
 * robot and pass light, which is what a curtain wall does.
 */
export const ENTRANCE_BAYS = 3;
export function entranceMullions(): Rect[] {
  const e = GF.entrance;
  const bayH = e.h / ENTRANCE_BAYS;
  const out: Rect[] = [];
  for (let k = 0; k < ENTRANCE_BAYS; k++) out.push({ x: e.x - 1, y: e.y + k * bayH, w: e.w + 2, h: 6 });
  out.push({ x: e.x - 1, y: e.y + e.h - 6, w: e.w + 2, h: 6 });
  return out;
}
/** The door leaves standing open against the reveals, on the lobby side. */
export function entranceLeaves(): Rect[] {
  const e = GF.entrance;
  const bayH = e.h / ENTRANCE_BAYS;
  return [0, 1, 2].map((k): Rect => ({ x: e.x - 17, y: e.y + k * bayH + 8, w: 16, h: 5 }));
}
/**
 * The clear opening of each bay: between two mullions, past the leaf standing
 * open in it. Chapter 3's crowd walks in through these — it used to aim at any
 * point across the whole 136 px run, which was fine while the frames in that run
 * were scenery and is not fine now that they stop people.
 */
export function entranceBayGaps(): Array<[number, number]> {
  const mus = entranceMullions();
  const leaves = entranceLeaves();
  const out: Array<[number, number]> = [];
  for (let k = 0; k + 1 < mus.length; k++) {
    const lf = leaves[k];
    out.push([Math.max(mus[k].y + mus[k].h, lf.y + lf.h), mus[k + 1].y]);
  }
  return out;
}

/**
 * THE ROPE-LINE STANCHIONS — the one thing in the lobby that is drawn and is
 * deliberately NOT a collider.
 *
 * They funnel arrivals from the doors past reception, and they stay walk-through
 * on purpose: a velvet rope on a 26 cm post is not something a player expects to
 * be stopped by, and a 4 px collider in the middle of the concourse would be an
 * invisible snag rather than an obstacle. That decision is from the chapter-2
 * round (`docs/playtest-notes.md`) and it is recorded HERE, beside the walls,
 * rather than as a comment in the renderer — `tests/colliders.test.ts` reads
 * this list as its one furniture exception, so the decision and the exception
 * are the same four rectangles.
 */
export const LOBBY_STANCHIONS: readonly Rect[] = Object.freeze(
  ([
    [1440, 604],
    [1370, 596],
    [1300, 588],
    [1230, 580],
  ] as Array<[number, number]>).map(([x, y]): Rect => ({ x: x - 2.125, y: y - 2.125, w: 4.25, h: 4.25 })),
);

/** Bollards along the forecourt, outside the glazing. */
export const FORECOURT_BOLLARDS: readonly Rect[] = Object.freeze(
  Array.from({ length: 7 }, (_, k): Rect => ({
    x: GF.entrance.x + GF.entrance.w + 26 - 2.75,
    y: 120 + k * 78 - 2.75,
    w: 5.5,
    h: 5.5,
  })),
);
/** The two planters out on the forecourt. */
export const FORECOURT_PLANTERS: readonly Rect[] = Object.freeze(
  ([300, 600] as const).map((y): Rect => ({ x: GF.entrance.x + GF.entrance.w + 70 - 13, y: y - 35, w: 26, h: 70 })),
);

/** Walls of the exhibition level. */
export function groundWalls(): Wall[] {
  const w: Wall[] = [];
  w.push({ x: 0, y: 0, w: W, h: T }, { x: 0, y: H - T, w: W, h: T }, { x: 0, y: 0, w: T, h: H }, { x: W - T, y: 0, w: T, h: H });
  const h = GF.hall;
  w.push({ x: h.x - T, y: h.y - T, w: h.w + 2 * T, h: T }, { x: h.x - T, y: h.y, w: T, h: h.h });

  /*
   * The hall's right edge: concrete, with one opening in it.
   *
   * The concrete block is Michele's own rect and it is thicker than a partition,
   * so the thin edge slabs are only emitted where it does not already cover the
   * run — otherwise the renderer would draw two coincident walls.
   */
  const cw = GF.concreteWall;
  const covered = (y0: number, y1: number): boolean => cw.y <= y0 && cw.y + cw.h >= y1;
  const edge = (y0: number, y1: number): void => {
    if (y1 <= y0 || covered(y0, y1)) return;
    w.push({
      x: h.x + h.w,
      y: y0,
      w: T,
      h: y1 - y0,
      kind: 'hall-edge',
      why: (b) => `${b.name}: the hall's outside wall. The steps are the only way through to the lobby`,
    });
  };
  w.push({
    ...cw,
    kind: 'concrete',
    why: (b) => `${b.name}: poured concrete. Round to the steps — they are the only way into the lobby`,
  });
  let ey: number = h.y;
  for (const [a, b] of GF.openings) {
    edge(ey, a);
    ey = b;
  }
  edge(ey, h.y + h.h);

  const c = GF.food.court;
  w.push({ x: c.x + c.w, y: c.y, w: T, h: c.h + T });
  let gx: number = c.x;
  for (const [a, b] of GF.food.gaps) {
    w.push({ x: gx, y: c.y + c.h, w: a - gx, h: T });
    gx = b;
  }
  w.push({ x: gx, y: c.y + c.h, w: c.x + c.w - gx, h: T });
  for (const k of ['soup', 'sandwich', 'coffee'] as const) w.push({ ...GF.food[k], low: true });
  const t = GF.tech;
  // Technical room: door on the right, y 600..650.
  w.push({ x: t.x, y: t.y - T, w: t.w + T, h: T }, { x: t.x + t.w, y: t.y, w: T, h: 40 }, { x: t.x + t.w, y: t.y + 90, w: T, h: t.h - 90 });
  const s = GF.store;
  w.push(
    { x: s.x - T, y: s.y, w: T, h: GF.roller.y - s.y },
    { x: s.x - T, y: GF.roller.y + GF.roller.h, w: T, h: s.y + s.h - (GF.roller.y + GF.roller.h) },
    { x: s.x - T, y: s.y + s.h, w: s.w + T, h: T },
  );
  for (const bo of GF.booths) {
    w.push({
      x: bo.x,
      y: bo.y,
      w: bo.w,
      h: bo.h,
      booth: bo,
      low: bo.table,
      skipFor: bo.table ? (bb) => bb.kind === 'voxxy' : undefined,
      why: bo.table
        ? (bb) => (bb.kind === 'voxxy' ? null : `${bb.name}: a sponsor table. Only something Voxxy-sized goes under the tablecloth`)
        : (bb) => `${bb.name}: ${bo.name} — a built booth, solid walls`,
    });
    // The totem beside a built booth and the AV crate in front of a half table:
    // both stand in the walking lane, both were drawn and neither was a collider.
    const totem = boothTotem(bo);
    if (totem) {
      w.push({ ...totem, kind: 'totem', why: (bb) => `${bb.name}: ${bo.name}'s totem. Two metres of sponsor, bolted down` });
    }
    const crate = boothCrate(bo);
    if (crate) {
      w.push({ ...crate, low: true, kind: 'crate', why: (bb) => `${bb.name}: a flight case. Full of somebody's demo, and heavier than it looks` });
    }
  }

  // The two enclosed secondary staircases, and the structural column grid.
  for (const s of GF.stairs) w.push(...stairShaftWalls({ x: s.x, y: s.y, w: s.w, h: s.h }, s.to));
  for (const c of HALL_COLUMNS) {
    w.push({
      ...c,
      kind: 'column',
      why: (b) =>
        b.kind === 'biggy'
          ? 'Biggy: that one is holding the roof up. I checked. Twice'
          : `${b.name}: a roof column. Go round`,
    });
  }
  for (const c of LOBBY_COLUMNS) {
    w.push({ ...c, kind: 'lobby-column', why: (b) => `${b.name}: lobby column` });
  }
  for (const p of LOBBY_PLANTERS) {
    w.push({ ...p, low: true, kind: 'planter', why: (b) => `${b.name}: a planter. Somebody waters these` });
  }
  // The network rack the cable comes off: a 19-inch cabinet, not a decal.
  w.push({
    ...GF.rack,
    kind: 'rack',
    why: (b) => (b.kind === 'voxxy' ? null : `${b.name}: the patch rack. The cable end on it is Voxxy's job`),
  });
  /*
   * The router cabinet and the store's roller door.
   *
   * Both are drawn by the venue in every chapter, and until now only CHAPTER 2
   * carried a collider for either: in chapter 3 a robot walked through the
   * cabinet, through the shut roller door and on into the store. They are venue
   * fabric, so they belong here. Chapter 2 swaps them for its own versions,
   * which can be opened and smashed — see `groundWallsFor`.
   */
  w.push({
    ...GF.cabinet,
    kind: 'cabinet',
    why: (b) => `${b.name}: the router cabinet, shut`,
  });
  w.push({
    ...GF.roller,
    kind: 'roller',
    why: (b) => `${b.name}: the store's roller door, down for the night`,
  });
  w.push({ ...STORE_WALL, kind: 'store-wall', why: (b) => `${b.name}: the back wall of the store` });
  for (const p of HALL_PANELS) {
    w.push({ ...p, kind: 'accent-panel', why: (b) => `${b.name}: a wall panel. Kinepolis red, and solid` });
  }

  /* ------------------------------------------------------------------ the lobby
   *
   * Every lobby block is walled INSIDE its measured rect, so nothing spills over
   * the footprint Michele plotted and two neighbouring blocks never overlap.
   */

  /** North, west and east faces, inside `r`. */
  const shellOf = (r: Rect, kind: string): Wall[] => [
    { x: r.x, y: r.y, w: r.w, h: T, kind },
    { x: r.x, y: r.y + T, w: T, h: r.h - T, kind },
    { x: r.x + r.w - T, y: r.y + T, w: T, h: r.h - T, kind },
  ];

  /** The south face of `r`, cut by one `door`-wide gap per span. */
  const southDoors = (r: Rect, spans: Array<[number, number]>, door: number, kind: string): Wall[] => {
    const out: Wall[] = [];
    const y = r.y + r.h - T;
    for (const [x0, x1] of spans) {
      const cx = (x0 + x1) / 2;
      out.push({ x: x0, y, w: cx - door / 2 - x0, h: T, kind }, { x: cx + door / 2, y, w: x1 - (cx + door / 2), h: T, kind });
    }
    return out;
  };

  /*
   * THE RECEPTION COUNTER IS AN L, AND IT IS HOLLOW.
   *
   * Michele, 24 Sep: *"Reception i don't get it. There's a wood panel longer than
   * the room. If it's the counter it should be lower, a half square, two sides
   * (west and south): and it should be hollow inside. The printer might be on the
   * reception counter, so no need to enter?"*
   *
   * It was one solid 126 x 75 slab, which is why it read as a panel rather than a
   * desk: no counter in any building is ten metres of solid block. Two runs of
   * `COUNTER` depth now close the west and south faces and the middle is open
   * floor — the staff side, entered from the north-east, beside the stairs. That
   * is also the only corner you CAN enter it from: BOF closes the north, the main
   * staircase the east, and the two runs the other two sides.
   *
   * The printer moves onto the south run (`GF.printer`), which settles the second
   * half of his note: chapter 2's cable ends on top of the counter, reached from
   * the concourse, and nobody has to walk behind the desk to plug it in.
   */
  const rc = GF.reception;
  const deskWhy = (bb: Bot): string => `${bb.name}: reception. Badges, lanyards, the printer`;
  w.push(
    { x: rc.x, y: rc.y, w: COUNTER, h: rc.h, low: true, kind: 'desk', why: deskWhy },
    {
      x: rc.x + COUNTER,
      y: rc.y + rc.h - COUNTER,
      w: rc.w - COUNTER,
      h: COUNTER,
      low: true,
      kind: 'desk',
      why: deskWhy,
    },
  );

  /*
   * THE WARDROBE OPENS WEST. Michele: *"Coat room / Wardrobe opening should be
   * west."* And it is the only side that can open: BOF is north of it, the main
   * staircase east, and the reception desk's own back south. It used to hand out
   * over its SOUTH face, into the back of the reception desk, which nobody can
   * stand in. So the shell closes north, east and south, and the hand-in counter
   * runs down the west face where the concourse actually reaches it.
   */
  const co = GF.coatroom;
  w.push(
    { x: co.x, y: co.y, w: co.w, h: T, kind: 'coatroom' },
    { x: co.x + co.w - T, y: co.y + T, w: T, h: co.h - T, kind: 'coatroom' },
    { x: co.x, y: co.y + co.h - T, w: co.w - T, h: T, kind: 'coatroom' },
    {
      x: co.x,
      y: co.y + T,
      w: COUNTER,
      h: co.h - 2 * T,
      low: true,
      kind: 'coat-counter',
      why: (bb) => `${bb.name}: the wardrobe counter. Three thousand coats tomorrow, not one tonight`,
    },
  );

  // The main staircase. Its south face is left open for the gate a chapter adds
  // there (`GF.gate`); the reception block closes its west side.
  const ms = GF.mainStair;
  w.push(...shellOf(ms, 'mainstair'));

  // The BOF rooms: three workshop rooms off the lobby, one doorway each.
  const b = GF.bof;
  const edges = [0, ...GF.bofSplits, b.w];
  w.push(...shellOf(b, 'bof'));
  for (const sx of GF.bofSplits) w.push({ x: b.x + sx, y: b.y + T, w: T, h: b.h - 2 * T, kind: 'bof' });
  w.push(
    ...southDoors(
      b,
      edges.slice(0, -1).map((e0, i): [number, number] => [b.x + e0, b.x + edges[i + 1]]),
      44,
      'bof',
    ),
  );
  for (const s of bofSlatWalls()) {
    w.push({ ...s, kind: 'bof-slats', why: (bb) => `${bb.name}: the slat wall. It is a wall` });
  }
  for (const tb of bofTables()) {
    w.push({ ...tb, low: true, kind: 'bof-table', why: (bb) => `${bb.name}: a workshop table. Tomorrow there are twenty laptops on it` });
  }

  // The toilets: one block, one doorway onto the lobby.
  const tl = GF.toilets;
  w.push(...shellOf(tl, 'toilets'), ...southDoors(tl, [[tl.x, tl.x + tl.w]], 40, 'toilets'));
  for (const p of toiletPartitions()) {
    w.push({ ...p, kind: 'toilet-partition', why: (bb) => `${bb.name}: tiled partition. Whatever is behind it, none of us needs it` });
  }

  /*
   * The entrance wall: a glass facade with one set of doors open in it.
   *
   * `glass` blocks robots and passes light, which is what a fixed pane does; the
   * left-hand doors (`GF.entrance`) are simply the gap between the two runs.
   */
  const e = GF.entrance;
  for (const [y0, y1] of [
    [T, e.y],
    [e.y + e.h, H - T],
  ] as Array<[number, number]>) {
    w.push({
      x: e.x,
      y: y0,
      w: e.w,
      h: y1 - y0,
      glass: true,
      kind: 'facade',
      why: (bb) => `${bb.name}: fixed glazing. Only the left-hand doors are open for Devoxx`,
    });
  }
  // The frames between the three door bays, and the leaves standing open against
  // the reveals. Glass: they stop a robot and pass light, like the rest of the wall.
  for (const mu of entranceMullions()) {
    w.push({ ...mu, glass: true, kind: 'mullion', why: (bb) => `${bb.name}: that is the frame between two door bays — go through a bay` });
  }
  for (const lf of entranceLeaves()) {
    w.push({ ...lf, glass: true, kind: 'door-leaf', why: (bb) => `${bb.name}: a glass door, standing open. Round it` });
  }
  // Out on the forecourt: bollards across the drop-off and two planters.
  for (const bo of FORECOURT_BOLLARDS) {
    w.push({ ...bo, low: true, kind: 'bollard', why: (bb) => `${bb.name}: a bollard. It is there so vans do not come in here` });
  }
  for (const p of FORECOURT_PLANTERS) {
    w.push({ ...p, low: true, kind: 'forecourt-planter', why: (bb) => `${bb.name}: a planter, out in the rain with the rest of Antwerp` });
  }
  return w;
}

/**
 * The exhibition level's walls, with the pieces a chapter takes over left out.
 *
 * Chapter 2 owns the roller door (Biggy smashes it) and the router cabinet (he
 * shoulders it open), so it pushes its own versions with `onHit` and its
 * own voices. It asks for the wall list without them rather than ending up with
 * two colliders in each place, one of which nothing can ever remove.
 */
export function groundWallsFor(chapter: number): Wall[] {
  const taken = chapter === 2 ? new Set(['roller', 'cabinet']) : new Set<string>();
  return groundWalls().filter((w) => w.kind === undefined || !taken.has(w.kind));
}

/* ---------------------------------------------------------------- cameras */

/*
 * The chapter view rects reach y 14..686 rather than the prototype's 40..660: the
 * plan's stepped envelope puts rooms 5 and 8 at y 20 and y 680, and a rect that
 * stopped at 40 would have cropped the venue's biggest auditorium — the keynote
 * room — off the top of chapter 4's own frame.
 */
/** Chapter 1: the closed section plus the sealed rooms 10 and 3 beyond the fire door. */
export const VIEW_CLOSED: ViewRect = { x: 0, y: 14, w: 900, h: 672 };
/** Chapter 4: the Devoxx section with the fire door shut behind. */
export const VIEW_DEVOXX: ViewRect = { x: 590, y: 14, w: 1310, h: 672 };
/** The whole cinema level — only during the first cutscene. */
export const VIEW_F1: ViewRect = { x: 0, y: 14, w: 1900, h: 672 };
/** Chapters 2 and 3: the whole hall plus the lobby. */
export const VIEW_GROUND: ViewRect = { x: 0, y: 0, w: W, h: H };

export const CHAPTER_TITLES = [
  '',
  '1 · Night — the closed cinema section',
  '2 · Expo — the exhibition hall',
  '3 · Breakfast — doors open',
  '4 · Keynote — Room 8',
] as const;

/** Talk titles on the corridor signage, per Devoxx room. */
export const TALKS: Readonly<Record<number, string>> = Object.freeze({
  3: 'Hands-on: agents that ship',
  4: 'Java 27 in 50 minutes',
  5: 'Kubernetes, but calmer',
  6: 'The last talk about microservices',
  7: 'Deep dive: virtual threads',
  9: 'From developer to builder',
  10: 'BOF: what broke this year',
});
