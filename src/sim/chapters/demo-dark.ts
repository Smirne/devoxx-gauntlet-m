/**
 * Chapter 5 — DARK ROOM. A demonstration, not a chapter of the game.
 *
 * ## What this is, and why it exists
 *
 * Michele, 26 Sep 2026: *"A puzzle needing darkness, with biggy obstucting a lamp is
 * fine, but where would you place it?"* — then, once the two puzzles had been
 * described to him: *"Can you make a poc / demonstration for the two no light
 * games?"*
 *
 * So this is the proof of concept, reachable only from the URL (`?chapter=5`) and
 * deliberately left out of `CHAPTER_COUNT`: it is not in the run, Skip chapter never
 * lands on it, and nothing in the four chapters imports it. Both stations are wired
 * to the same new physics, and the whole point of a rig is that you can stand in
 * front of it and watch the thing work.
 *
 * ## The new physics
 *
 * Until this round, light in this game was stopped by WALLS and nothing else, which
 * `docs/lights-and-locks-rules.md` said out loud. `src/sim/lights.ts` now takes an
 * optional list of bodies and clips every ray against them too (`rayCircle`), so a
 * robot standing in a beam casts a real umbra — and because the shadow is in the
 * visibility POLYGON rather than in a side test, the renderer draws it, `litBy`
 * answers with it, and the sensors below need no special case.
 *
 * It is opt-in per cast. Chapters 1 and 2 were measured and playtested against light
 * that only walls could stop; this chapter hands `buildLights` the three robots,
 * they hand it nothing, and their clue windows are exactly what they were.
 *
 * ## Where it goes in the real game — the answer to "where would you place it?"
 *
 * Here: the **closed cinema section's corridor**, x 6..600 on the upper floor, which
 * is chapter 1's own ground and the only part of the building that is dark by
 * architecture rather than by the hour. The night crew's work lamp is a green pool
 * on a stand, and the two sensor rigs are the kind of thing a projectionist leaves
 * lying about. Nothing here needs a second venue, a second floor, or a light that
 * the sim does not already own.
 *
 * ## The two stations
 *
 * **A — THE PHOTOCELL PAIR.** Two cells and a sign, in a row, 70 px out from the
 * lamp. Both cells must read dark and the sign between them must stay lit. One body
 * cannot do it: a disc that touches both outer rays from that distance also covers
 * the middle one, so it takes Voxxy on one ray and Biggy on the other — and each of
 * them has to stand far enough back that their own shadow has stopped being a
 * curtain and become a stripe. It teaches, in one screen, that a shadow has EDGES.
 *
 * **B — THE WIDE SENSOR BAR.** An 80 px bar of sensor, all of it to be dark at once,
 * 70 px out from the lamp. This one is arithmetic, and the arithmetic is why it
 * works. A point is in a body's umbra when the ray to it passes within `r` of the
 * body's centre, so a body of radius `r` at distance `d` from the lamp shadows
 * everything inside a half-angle `asin(r/d)` — and `d` can never be smaller than the
 * two radii added together, because robots do not overlap. Every robot therefore has
 * a WIDEST POSSIBLE SHADOW, and no amount of driving widens it:
 *
 *   - Voxxy, flat against the lamp at d = 11, reaches 70·tan(asin(4.75/11)) = 33.5 px
 *     either side of the axis at the bar. The bar reaches 40. She cannot darken it
 *     from anywhere in the building, and that is the point of her being there.
 *   - Biggy, flat against it at d = 15.25, reaches 51.2 px — so he can, from
 *     anywhere closer than d = 18.1, pressed right up against the lamp. Which is
 *     exactly the shot Michele asked for.
 *
 * It teaches that a robot's WIDTH is a physical quantity and not a drawing. The
 * window is narrow on purpose (about 6.5° of heading at the lamp), and it plays
 * because the station LATCHES: Biggy drifts across the beam and it catches the frame
 * all 17 samples go dark, rather than asking anyone to park on a pixel.
 *
 * ## The one concession
 *
 * The sensors read the work lamp's own GREEN and ignore the rest. Voxxy and Biggy
 * carry headlights of their own that point where they last moved, so a colour-blind
 * cell would be lit by the very robot sent to shade it — the puzzle would be about
 * reversing into position, which is not what it is for. A photocell wired to the
 * lamp it belongs to is also just what a photocell is.
 */

import { CY0, CY1, F1, floor1Walls } from '../geometry';
import { buildLights, litBy, type Occluder } from '../lights';
import { dist } from '../bot';
import type { LightSource, Prop, Task, Vec2, ViewRect } from '../types';

import type { ChapterCtx, ChapterDef, ChapterRuntime } from './index';

/** The closed corridor, framed end to end: both rigs are in shot at once. */
const VIEW_DARK: ViewRect = { x: 6, y: 276, w: 610, h: 150 };

/**
 * How close the lamp carrier must be to a pad for that station to be live, px.
 *
 * A station is geometry — every distance in the two paragraphs above is measured
 * from the pad — so the lamp has to actually be ON it. 9 px is inside Droid's own
 * footprint (r 6.25), tight enough that the arithmetic holds and loose enough that
 * a robot with drag 7 can stop on it.
 */
const PAD_REACH = 9;

/** How far out from a pad the sensors sit, px. `D` in the notes above. */
const SENSOR_D = 70;
/**
 * Half the width of station B's bar, px — the number that locks Voxxy out.
 *
 * Between her widest shadow at this distance (33.5) and Biggy's (51.2), and nearer
 * the middle than either: 40 leaves her 6.5 px short however she drives, and gives
 * him a 2.9 px band of standing room. Both margins are measured in
 * `tests/dark-rig.test.ts` by sweeping the whole corridor, not asserted here.
 */
const BAR_HALF = 40;
/** Station A's cells, px either side of the sign. */
const CELL_OFF = 30;
/** Samples along the bar. At 5 px a robot's own width cannot hide between two. */
const BAR_STEP = 5;

/** Station A's pad, in the western bay between two corridor columns. */
const PAD_A: Vec2 = { x: 120, y: 312 };
/**
 * Station B's pad, in the wide bay between cinemas B and C.
 *
 * x 310 so the 80 px bar lands at 270..350, clear of the corridor columns at
 * 245..261 and 365..385 — a column across one end of the bar would darken it for
 * free, which is the one thing this station must not allow.
 */
const PAD_B: Vec2 = { x: 310, y: 312 };

export interface DarkState {
  chapter: 5;
  /** True while the lamp is standing on station A's pad. */
  onA: boolean;
  onB: boolean;
  /** Which of station A's two cells are dark right now. */
  cellsDark: number;
  /** Is the sign between them still lit? */
  signLit: boolean;
  /** Bar samples currently dark, of `barOf`. */
  barDark: number;
  barOf: number;
  doneA: boolean;
  doneB: boolean;
}

const KEYS = '1/2/3/Tab: switch · WASD · E: hold Biggy / Voxxy jumps · R: restart · I: run sheet · H: hint · P: physics';

function setup(ctx: ChapterCtx): ChapterRuntime {
  ctx.setFloor('up');
  ctx.setView(VIEW_DARK);
  ctx.setWalls(floor1Walls());

  // The fire door is shut: the rig is in the closed section and so are you.
  ctx.walls.push({
    x: F1.fireX,
    y: CY0,
    w: 14,
    h: CY1 - CY0,
    kind: 'firedoor',
    why: (b) => `${b.name}: the fire door is shut — the rig is on this side of it`,
  });

  ctx.place([196, 344, Math.PI / 2], [176, 356, Math.PI / 2], [222, 368, Math.PI / 2]);

  /** The two cells and the sign of station A, and the bar samples of station B. */
  const cellL: Vec2 = { x: PAD_A.x - CELL_OFF, y: PAD_A.y + SENSOR_D };
  const cellR: Vec2 = { x: PAD_A.x + CELL_OFF, y: PAD_A.y + SENSOR_D };
  const sign: Vec2 = { x: PAD_A.x, y: PAD_A.y + SENSOR_D };
  const bar = { x0: PAD_B.x - BAR_HALF, x1: PAD_B.x + BAR_HALF, y: PAD_B.y + SENSOR_D };
  const barSamples: Vec2[] = [];
  for (let x = bar.x0; x <= bar.x1 + 0.001; x += BAR_STEP) barSamples.push({ x, y: bar.y });

  let lights: LightSource[] = [];
  let doneA = false;
  let doneB = false;
  /** Rate-limits the coaching line, so it is a remark and not a stutter. */
  let said = 0;

  ctx.objective(
    'Demo · <b>Dark room</b> — bodies cast shadows now. <b>Droid</b> is the work lamp: park him on a green pad. ' +
      '<b>A</b>: both photocells dark, the sign between them still lit. <b>B</b>: the whole sensor bar dark — ' +
      'only one robot in this building is wide enough.',
    KEYS,
  );
  ctx.card(
    '<b>Shadow rig — proof of concept.</b><br>' +
      '<span class="sub">Not part of the run. Light is stopped by bodies here, not just by walls: park Droid on a pad ' +
      'and put the other two in his beam.</span>' +
      '<small>Press any key</small>',
  );

  /* ----------------------------------------------------------------- the rig */

  const lamp = (): Occluder => ctx.byKind('droid');
  const onPad = (pad: Vec2): boolean => dist(lamp(), pad) < PAD_REACH;
  /** The lamp's own green, with every body's shadow already in it. */
  const green = (p: Vec2): boolean => litBy(lights, 'droid', p);

  const cellsDark = (): number => [cellL, cellR].filter((c) => !green(c)).length;
  const barDark = (): number => barSamples.filter((p) => !green(p)).length;

  const solvedA = (): boolean => onPad(PAD_A) && cellsDark() === 2 && green(sign);
  const solvedB = (): boolean => onPad(PAD_B) && barDark() === barSamples.length;

  function update(dt: number): void {
    ctx.stepAll(dt);
    ctx.pushBiggy(dt);
    /*
     * The three of them are the occluders, tagged with their own kind so no lamp
     * shadows itself. This one argument is the whole demonstration.
     */
    const bodies: Occluder[] = ctx.bots.map((b) => ({ x: b.x, y: b.y, r: b.r, kind: b.kind }));
    lights = buildLights(ctx.bots, ctx.walls, [], bodies);

    if (!doneA && solvedA()) {
      doneA = true;
      ctx.score.darkA = 1;
      ctx.flash('<b>Station A</b> — both cells dark, sign still lit. Two shadows, two edges.', 4200);
    }
    if (!doneB && solvedB()) {
      doneB = true;
      ctx.score.darkB = 1;
      ctx.flash('<b>Station B</b> — the whole bar is in Biggy’s shadow. Nothing narrower could have done it.', 4600);
    }

    // One coaching line, in the voice of the robot who is standing in the way and
    // not managing it. It says what the geometry says, never where to stand.
    said = Math.max(0, said - dt);
    if (!said && onPad(PAD_B) && !doneB) {
      const short = ctx.bots.find(
        (b) => b.kind !== 'droid' && dist(b, PAD_B) < SENSOR_D && Math.abs(b.x - PAD_B.x) < BAR_HALF,
      );
      if (short && barDark() > 0 && barDark() < barSamples.length) {
        said = 5;
        ctx.flash(
          short.kind === 'voxxy'
            ? 'Voxxy: my shadow is a stripe. I could stand on that lamp and it would still be a stripe.'
            : 'Biggy: closer to the lamp. The nearer I am to it, the bigger the hole I make in it.',
          3400,
        );
      }
    }

    if (doneA && doneB && !ctx.score.darkDone) {
      ctx.score.darkDone = 1;
      ctx.card(
        '<b>Both rigs pass.</b><br>' +
          '<span class="sub">Bodies occlude light: a shadow has edges (A) and a width that comes off the body ' +
          'casting it (B). Nothing in chapters 1–4 has changed — they cast without bodies, exactly as before.</span>' +
          '<small>Press any key · R to replay</small>',
      );
    }
  }

  /* --------------------------------------------------------- snapshot payload */

  function props(): Prop[] {
    const out: Prop[] = [
      { kind: 'lamp-pad', x: PAD_A.x, y: PAD_A.y, state: doneA ? 'done' : onPad(PAD_A) ? 'active' : 'idle', label: 'A · park DROID here (the lamp)' },
      { kind: 'lamp-pad', x: PAD_B.x, y: PAD_B.y, state: doneB ? 'done' : onPad(PAD_B) ? 'active' : 'idle', label: 'B · park DROID here (the lamp)' },
      { kind: 'beam-sign', x: sign.x, y: sign.y, state: green(sign) ? 'done' : 'broken', label: 'KEEP THIS SIGN LIT' },
      /*
       * No hung signs over the two stations, and that is deliberate rather than an
       * omission: a chapter's `sign` prop is a blue panel and nothing paints text on
       * it (only the venue's own `SignPainter` does), so two more would have been
       * two blank boards over a rig that was already hard to read. What names each
       * station is the run sheet, the two lanes below, and the cells going red.
       */
      {
        kind: 'sensor-bar',
        x: bar.x0,
        y: bar.y - 3,
        w: bar.x1 - bar.x0,
        h: 6,
        state: doneB ? 'done' : barDark() === barSamples.length ? 'active' : 'idle',
        v: barDark() / barSamples.length,
        label: `B · sensor bar — ${barDark()}/${barSamples.length} dark`,
      },
      /*
       * THE TWO BEAM LANES, PAINTED ON THE FLOOR.
       *
       * Michele, 28 Sep 2026, with a screenshot of this rig: *"I can't play
       * chapter=5, i don't understand where the sensors / what to block."* Every
       * word of the rig was in the objective and the run sheet and none of it was
       * on the floor: two 40 cm boxes and a brown strip, in a corridor whose only
       * light is a robot you have not parked yet.
       *
       * So each station's beam is a painted lane from its pad to its sensors — the
       * same `lane` decal chapter 2 marks its cable run with. It answers both
       * halves of the note at once: the sensors are at the far end of the lane, and
       * what you block is the lane. The lane is DRAWN, not simulated: the shadow is
       * still `buildLights` clipping rays against bodies, and a robot standing in
       * the paint is not what the sensors read.
       */
      {
        kind: 'lane',
        x: PAD_A.x - CELL_OFF - 6,
        y: PAD_A.y,
        w: CELL_OFF * 2 + 12,
        h: SENSOR_D,
        // `active` and not `idle`: `idle` is the one state the renderer does not
        // tint, and an untinted olive lane in a blacked-out corridor is exactly
        // the invisible hint this lane exists to replace.
        state: doneA ? 'done' : 'active',
        label: 'A · stand in the beam',
      },
      {
        kind: 'lane',
        x: bar.x0 - 6,
        y: PAD_B.y,
        w: bar.x1 - bar.x0 + 12,
        h: SENSOR_D,
        state: doneB ? 'done' : 'active',
        label: 'B · stand in the beam',
      },
    ];
    for (const c of [cellL, cellR]) {
      /*
       * A CELL THAT STILL NEEDS SHADING SAYS SO IN RED.
       *
       * It used to publish `idle` while lit, and `idle` is the one state the
       * renderer does not tint — so the thing you are looking for was the thing
       * that was not drawn. `broken` is the red the rest of the game uses for "this
       * is what is wrong", and it goes green the moment the cell reads dark.
       */
      out.push({
        kind: 'photocell',
        x: c.x,
        y: c.y,
        state: green(c) ? 'broken' : 'done',
        label: green(c) ? 'A · cell LIT — shade it' : 'A · cell dark ✓',
      });
    }
    return out;
  }

  function progress(): string {
    const a = doneA ? '✓' : `cells ${cellsDark()}/2 dark, sign ${green(sign) ? 'lit' : 'DARK'}`;
    const b = doneB ? '✓' : `bar ${barDark()}/${barSamples.length} dark`;
    return `lamp on ${onPad(PAD_A) ? 'pad A' : onPad(PAD_B) ? 'pad B' : 'no pad'} · A: ${a} · B: ${b}`;
  }

  function tasks(): Task[] {
    return [
      {
        id: 'darkA',
        text: 'station A: both cells dark, the sign lit',
        done: doneA,
        who: ['droid', 'voxxy', 'biggy'],
        at: sign,
        n: doneA ? 2 : cellsDark(),
        of: 2,
        hint: [
          'Droid: the pad first. The rig is measured from where the lamp stands, so off the pad it measures nothing.',
          'Voxxy: one of us per cell. Anybody standing in the middle shades the sign as well, and the sign has to stay lit.',
          'Biggy: back off a bit. Up close my shadow covers the whole rig — from further out it is only as wide as the cell.',
        ],
      },
      {
        id: 'darkB',
        text: 'station B: the whole sensor bar in shadow',
        done: doneB,
        who: ['droid', 'biggy'],
        at: { x: PAD_B.x, y: bar.y },
        n: doneB ? barSamples.length : barDark(),
        of: barSamples.length,
        hint: [
          'Droid: pad B, and hold still.',
          'Biggy: that bar is wider than anything Voxxy can throw. Right up against the lamp — my shadow is widest where I am closest to it.',
        ],
      },
    ];
  }

  return {
    key: (): boolean => false,
    update,
    props,
    progress,
    tasks,
    lights: (): LightSource[] => lights,
    relight(): void {
      const bodies: Occluder[] = ctx.bots.map((b) => ({ x: b.x, y: b.y, r: b.r, kind: b.kind }));
      lights = buildLights(ctx.bots, ctx.walls, [], bodies);
    },
    state: (): DarkState => ({
      chapter: 5,
      onA: onPad(PAD_A),
      onB: onPad(PAD_B),
      cellsDark: cellsDark(),
      signLit: green(sign),
      barDark: barDark(),
      barOf: barSamples.length,
      doneA,
      doneB,
    }),
  };
}

export const demoDark: ChapterDef = { n: 5, title: '5 · Demo — shadow rig', setup };

/**
 * The rig's own numbers, so `tests/dark-rig.test.ts` measures the thing that is
 * built rather than a second copy of it.
 */
export const DARK_RIG = {
  padA: PAD_A,
  padB: PAD_B,
  d: SENSOR_D,
  barHalf: BAR_HALF,
  cellOff: CELL_OFF,
  padReach: PAD_REACH,
  cellL: { x: PAD_A.x - CELL_OFF, y: PAD_A.y + SENSOR_D },
  cellR: { x: PAD_A.x + CELL_OFF, y: PAD_A.y + SENSOR_D },
  sign: { x: PAD_A.x, y: PAD_A.y + SENSOR_D },
  bar: { x0: PAD_B.x - BAR_HALF, x1: PAD_B.x + BAR_HALF, y: PAD_B.y + SENSOR_D },
  view: VIEW_DARK,
} as const;
