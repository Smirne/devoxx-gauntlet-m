/**
 * Chapter 3 — BREAKFAST. The entrance is open, three thousand people are inside, and
 * Stephan is standing in front of the main staircase with his arms crossed.
 *
 * Ported from the prototype's `setupLunch` / `lunchKey` / `lunchUpdate` / `lunchDone`
 * (`reference/poc/10-after-dark-kinepolis.html`) — the prototype called this chapter
 * Lunch, and those are its function names, kept so the parity is traceable.
 *
 * It is breakfast now because the opening keynote is a morning event: a keynote that
 * happened after lunch would be a strange Devoxx. The tomato soup stayed anyway.
 * Michele's ruling, 24 Sep 2026: *"The tomato soup stays, it's devoxx flavour, it's
 * odder in the morning but i found it fun. And we're in belgium, i can't exclude
 * they'd drink it at breakfast."*
 *
 * He wants three things before he opens the rooms: his tomato soup, the keynote
 * speaker (still "TBA", still hiding from the queues behind a built booth), and the
 * beer delivery out of his aisle. All three need all three robots:
 *
 *   Droid — the ladle is on the high shelf.
 *   Biggy — carries the pot. He cannot stop quickly, every bump spills, and the soup
 *           goes cold on a timer, so the heavy robot has to be driven gently. He is
 *           also the only one who can lift a beer crate.
 *   Voxxy — clears a catering queue for five seconds, and finds the speaker.
 *
 * The crowd is not decoration: thirty-six visitors walk the hall's lane grid, and
 * shoving them costs complaints on the final card.
 *
 * ## The booth games
 *
 * The three optional sponsor games live here, and only here, since 24 Sep 2026 —
 * Michele, playing chapter 2: *"Minigames should be in chapter 3. The hall is still
 * closed at the moment."* See `setupMinigames` below.
 *
 * ## The beer delivery, and the OutOfMemoryError
 *
 * `docs/gameplay-additions.md` §3, and the last of its three calls to be approved:
 * Michele held it until he could play it, then said *"OutOfMemory, yes build it."*
 *
 * The crates arrive at eight in the morning for tonight — which is when a brewery
 * actually delivers, and which is funnier at breakfast than at lunch: nobody is
 * drinking, the pallet is simply standing in the way of three thousand people, and
 * the shrink-wrap label still carries Devoxx's own line about hangovers and
 * OutOfMemoryErrors. Six crates, six invented Belgian breweries (`CRATE_BREWS`),
 * and Biggy takes them to **The Finally Block** — the bar built for tonight in the
 * open aisle, taps ready, Belgian glassware out, a lit halo on the floor in front
 * of it. That bar is the beat's own path: see `BAR` below for why it is NOT behind
 * the catering counters, and `tests/beer-bar.test.ts` for the flood-fill that
 * proves the route never meets a queue.
 *
 * Every crate he picks up adds mass and takes acceleration (`src/sim/crates.ts`),
 * so a bigger load means fewer trips and worse handling; the crate past
 * `CRATE_STACK_LIMIT` throws a heap error, he drops the lot, and the load becomes
 * six bodies he has to shove out of his own way. The optimal line is one crate
 * under the limit, and greed is punished by physics rather than by a rule — which
 * is how the rest of this game works.
 */

import { PUSH_LEAN_MIN, SPEED_SCALE, TRAVEL_TIME_SCALE } from '../constants';
import {
  CRATE_DELIVERY,
  CRATE_DRAG,
  CRATE_MASS,
  CRATE_MAX_SPEED,
  CRATE_R,
  CRATE_REACH,
  CRATE_SCATTER_SPEED,
  CRATE_SHOVE_BIGGY,
  CRATE_SHOVE_OTHER,
  CRATE_STACK_LIMIT,
  crateBrew,
  crateLoadAccel,
  crateLoadMass,
  crateReachable,
  crateRescueSpot,
  loadBiggy,
} from '../crates';
import { BAR_RECT, GF, VIEW_GROUND, entranceBayGaps, groundWalls } from '../geometry';
import { botsCollide, circleRect, dist, inRect, mkBody, speed, standOff, stepBot } from '../bot';
import type { Bot, Person, Prop, Rect, Task, Vec2, Wall } from '../types';

import type { ChapterCtx, ChapterDef, ChapterRuntime, PrevVel } from './index';

/* ---------------------------------------------------------------- reach and pacing */

const SHELF_REACH = 45;
const POT_REACH = 70;
const TALK_REACH = 40;
/**
 * The crab sandwich, on the sandwich counter's hall-facing edge.
 *
 * On the counter, not behind it: what a robot walks up to is the tray at the
 * front, under the sign. (`GF.food.sandwich` is the counter block; its `y + h` is
 * the face the queues stand at.)
 */
const CRAB: Vec2 = { x: GF.food.sandwich.x + GF.food.sandwich.w / 2, y: GF.food.sandwich.y + GF.food.sandwich.h - 5 };
/** How close counts as standing at the tray. */
const CRAB_REACH = 46;
/**
 * A queue steps aside for this long — a window Voxxy has to *walk* through, so it
 * grows with `TRAVEL_TIME_SCALE` (constants.ts, the 2026-09-23 rescale).
 */
const QUEUE_OPEN = 5 * TRAVEL_TIME_SCALE;
/** Sideways shuffle of a queue that is making way. */
const QUEUE_STEP = 30;
/**
 * Seconds for the soup to go from boiling to stone cold.
 *
 * The clock is really a distance: it is how far Biggy may carry the pot before it
 * is undrinkable, and the hall did not get shorter when he got slower. It scales
 * with `TRAVEL_TIME_SCALE` so the pot still goes cold in the same place.
 */
const COOL_SECONDS = 150 * TRAVEL_TIME_SCALE;
/** Visitors on the floor at once. */
const VISITORS = 36;
const SPAWN_EVERY = 0.9;
/** Closing speed above which a robot has knocked someone over rather than brushed them. px/s. */
const BOWL_OVER = 110 * SPEED_SCALE;
/** The jerk that counts as "Biggy hit something" while he is carrying the pot. px/s. */
const SPILL_DV = 90 * SPEED_SCALE;
const SPILL_MIN_SPEED = 60 * SPEED_SCALE;
/** The speaker's walking pace once Voxxy has talked them out from behind the booth. px/s. */
const SPEAKER_WALK = 150 * SPEED_SCALE;

/* --------------------------------------------------------- the beer delivery */

/**
 * Where the lorry left the pallet: the first aisle, a few metres in front of where
 * the three robots start the chapter.
 *
 * Michele's standing note from two playtests — *"I had trouble finding the
 * projector / open the room... There should be something visible"* — applies to a
 * crate as much as to a control panel. Six of them, stacked on a pallet, in the
 * open, on the spot the camera is already looking at when the chapter opens.
 */
const PALLET: Vec2 = { x: 600, y: 158 };
/** The shrink-wrapped pallet's own footprint, for the halo that marks it. */
const PALLET_MARK: Rect = { x: PALLET.x - 26, y: PALLET.y - 20, w: 52, h: 40 };

/**
 * THE FINALLY BLOCK — the bar the delivery is FOR, and why it stands out here
 * rather than behind the catering counters.
 *
 * Michele, on the first plan to stack the crates behind the counter: *"ok but
 * remember biggy can't reach the soup without voxxy's help. So it should be a
 * different path, with clear hints. (glowing halo, taps ready, belgian beer
 * glassess)."*
 *
 * That is a design note, not a bug report, and it is right. The soup errand is
 * DELIBERATELY Voxxy-dependent: the soup station stands inside the catering block,
 * the block's only ways in are three doorways, and a queue stands in each of them
 * for Voxxy to clear. A beer drop inside that same block would charge the player
 * the same gate twice while pretending to be a second errand.
 *
 * So the bar is built OUTSIDE the block, in the open north aisle, with its back to
 * the hall wall and its taps facing the floor — which is where a venue puts a bar
 * for the evening, and which makes the crates Biggy's own job from end to end.
 * `tests/beer-bar.test.ts` measures that rather than asserting it: a flood-fill of
 * the ground floor at Biggy's radius, with all three queues standing where they
 * stand, finds a route from the pallet to the mark that never comes within his own
 * radius of anybody in a queue and never enters the catering block at all. The two
 * errands share no floor.
 *
 * The same fill found something nobody asked about, so it is written down here
 * rather than left in a report: **the soup's gate leaks.** A doorway is 44 px
 * wide, the queue standing in it is two files 10 px apart, and at Biggy's radius
 * that leaves about 11 px of clear centre line beside the people — he can drive in
 * without Voxxy saying a word. Clearing the queue widens that to 27 px, so the
 * mechanic does something; it does not do what the chapter's own text claims. It
 * is not fixed here because it is not this beat: the fix is to stand the queue's
 * two files across the doorway's width rather than 10 px apart, and it changes the
 * soup's difficulty, which is somebody's call and not a builder's.
 *
 * The counter is a `low` wall (pushed in `setup`), so light crosses it and robots
 * do not: a bar you can walk through is the *"this cube is walk-through"* note all
 * over again. It is two metres deep — counter plus back bar — and its back face
 * leaves only 6 px to the hall wall, which is deliberate: any wider and there is a
 * pocket behind the bar for a robot to get stuck in.
 */
// The bar is venue furniture, not a chapter constant — it shares the hall's north
// wall with chapter 2's spray tag and the two have to be measurable against each
// other (`BAR_RECT`, and Michele's *"The bar covers the wifi graffiti"*).
const BAR: Rect = BAR_RECT;
/** What it is called, in the register the sponsor list next door uses. */
const BAR_NAME = 'The Finally Block';
/**
 * The mark Biggy stands on to hand a load over the bar.
 *
 * In front of the taps, clear of the counter by more than his own radius and clear
 * of the catering block's east wall by the same, so there is no corner of it he
 * can be standing in and still be told there is nothing here.
 */
const BEER_STACK: Rect = { x: 346, y: 128, w: 72, h: 40 };
/**
 * Where the crates end up once he has handed them over: the cellar end of the bar,
 * stacked against the hall wall beside the taps.
 *
 * Separate from the mark on purpose. The old stack grew in the middle of the same
 * rect the player had to stand in, so the reward for the errand was a pile in your
 * own way; here the mark stays clear and the finished delivery reads as stowed.
 */
const CELLAR: Vec2 = { x: 440, y: 106 };
/** How close a robot has to get to the pallet to read what is printed on the wrap. */
const LABEL_REACH = 90;
/** The middle of the stack zone, and how close to it counts as "on the mark". */
const STACK_AT: Vec2 = { x: BEER_STACK.x + BEER_STACK.w / 2, y: BEER_STACK.y + BEER_STACK.h / 2 };
/**
 * 44 px, against the 72x40 zone's own 41 px half-diagonal: the marked rectangle is
 * the *smallest* place `E` works, not the only one. A player who has walked up to
 * the mark and is a body-width off one corner still puts the crates down.
 */
const STACK_REACH = 44;
/** Crates per layer on the finished stack, and the footprint they are set out on. */
const STACK_WIDE = 3;
const STACK_STEP = 13;
/**
 * The three taps, and the glassware beside them.
 *
 * On the counter's FRONT lip rather than its middle: the diorama camera sits on
 * the +y side (`src/render/camera.ts`), so the front edge is the one the player
 * is looking at, and a tap set back behind two metres of bar is a tap nobody sees.
 */
const BAR_TOP = BAR.y + BAR.h - 7;
const TAPS: readonly Vec2[] = [352, 368, 384].map((x) => ({ x, y: BAR_TOP }));
/** Belgian glassware, one shape per beer. */
const GLASSES: readonly Vec2[] = [400, 408, 416, 424].map((x) => ({ x, y: BAR_TOP }));

/**
 * A GLOWING HALO ROUND SOMETHING YOU CAN USE.
 *
 * Michele's standing idea, filed twice — *"Maybe with red halo to signal it's
 * interactive"*, and again in the line above as one of the "clear hints" this beat
 * owes the player. It is deliberately NOT a beer-only decoration: the prize is one
 * visual language for "you can use this", so this is a ring anything can wear and
 * chapter 3 already puts it on three different things — the pallet the crates
 * start on, the bar they go to, and the spot the soup goes to.
 *
 * It needs no new render code. `dropzone` is already the flat floor plate the two
 * drop marks are drawn with, and `STATE_EMISSIVE` in `src/render/scene.ts` already
 * lights an `active` prop amber and a `done` one green — so a ring of four thin
 * `dropzone` strips laid round a rect is a lit outline that goes green when the job
 * is finished, in the state colours the rest of the game is already speaking.
 *
 * `state` is the whole vocabulary: 'active' for waiting, 'done' for finished.
 */
const HALO_W = 3;
function halo(r: Rect, state: string): Prop[] {
  const strip = (x: number, y: number, w: number, h: number): Prop => ({ kind: 'dropzone', x, y, w, h, state });
  return [
    strip(r.x - HALO_W, r.y - HALO_W, r.w + 2 * HALO_W, HALO_W),
    strip(r.x - HALO_W, r.y + r.h, r.w + 2 * HALO_W, HALO_W),
    strip(r.x - HALO_W, r.y, HALO_W, r.h),
    strip(r.x + r.w, r.y, HALO_W, r.h),
  ];
}

/**
 * The joke, and it has to survive a room full of Java developers: Devoxx is a Java
 * conference, so a *plausible* trace is the whole gag. It reads like a real one —
 * innermost frame first, the key press at the bottom of the visible stack, a
 * `Caused by` that is the actual problem — and names nothing that needs permission.
 */
const OOM_TRACE: readonly string[] = [
  'Exception in thread "main" java.lang.OutOfMemoryError: Biggy heap space',
  '\tat be.devoxx.robots.Biggy.lift(Biggy.java:212)',
  '\tat be.devoxx.robots.Biggy.stack(Biggy.java:188)',
  '\tat be.devoxx.catering.BeerDelivery.loadAll(BeerDelivery.java:74)',
  '\tat be.devoxx.afterdark.Chapter3$Breakfast.pickUp(Chapter3.java:411)',
  '\tat be.devoxx.afterdark.Game.key(Game.java:96)',
  '\t... 5 more',
  'Caused by: java.lang.IllegalStateException: 5 crates, 2 arms',
  '\t... 12 more',
];

/**
 * The crash dump, shown ONCE per run.
 *
 * The first heap error gets the full-screen card, because a stack trace is worth
 * reading and the beat only lands if the player gets to read it. Every one after
 * that is a toast in Biggy's voice: the design's own kill condition is *"whether a
 * player laughs the first time and then plays around it"*, and a modal that
 * interrupts the fourth attempt is how a joke turns into a penalty.
 */
const oomCardHtml = (n: number): string =>
  '<b>java.lang.OutOfMemoryError</b><br>' +
  '<span style="display:block;margin:14px 0 10px;padding:12px 14px;border-radius:8px;' +
  'background:rgba(0,0,0,.5);text-align:left;color:#ff9b7a;white-space:pre-wrap;' +
  'font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">' +
  OOM_TRACE.join('\n') +
  '</span>' +
  `<span class="sub">Biggy drops all ${n}. They are still crates, and they are all still here.</span>` +
  `<small>${CRATE_STACK_LIMIT - 1} fit. ${CRATE_STACK_LIMIT - 1} always fitted. · Press any key</small>`;

/**
 * A beer crate: a body, not a robot. `mkBody` (`bot.ts`) is the same thing the
 * shuffleboard duck and the cake crate are built from.
 */
interface Crate extends Bot {
  /** Stable index for the whole chapter — the debug seam names crates by it. */
  i: number;
  /** On the floor and physical, on Biggy's back, or stacked and finished. */
  held: 'loose' | 'carried' | 'stacked';
  /** Which layer of the finished stack it is in, so the renderer can pile them up. */
  layer: number;
  /**
   * Was it moving last frame? The falling edge is when a crate can become stranded.
   *
   * A crate only ever ends up somewhere unreachable by coming to rest there, so
   * that is the one frame worth paying for the check on — see `rescueStranded`.
   */
  rolling: boolean;
}

const VISITOR_COLOURS = ['#b9a58c', '#8c9bb9', '#c98c8c', '#9bb98c'] as const;
const QUEUE_COLOURS = ['#b9a58c', '#8c9bb9', '#b98c8c', '#9bb98c'] as const;

/** A conference-goer walking the lane grid. A `Bot` only to reuse `botsCollide`. */
interface Visitor extends Bot {
  walk: number;
  route: Vec2[];
  dwell: number;
  hitCd: number;
  colour: string;
}

interface QueuePerson {
  x: number;
  y: number;
  /** Where this person stands when the queue is not making way. */
  hx: number;
  r: number;
  colour: string;
  cd: number;
}

interface Queue {
  label: string;
  x: number;
  people: QueuePerson[];
  /** Seconds of "making way" left. */
  open: number;
}

/* =============================================================== booth games */

export interface MinigameState {
  duck: Vec2;
  duckDone: boolean;
  stickerDone: boolean;
  raceDone: boolean;
  /** Which of the four Regex Racing markers is next, 0 when the lap has not started. */
  raceNext: number;
}

/**
 * The three optional booth games. Worth 0.5 points each on the final card and
 * nothing else — they exist so the hall rewards wandering, which is the only
 * reason a player looks at twelve sponsor booths at all.
 *
 * THEY USED TO BE CHAPTER 2'S. Michele moved them here on 24 Sep 2026, playing
 * chapter 2: *"Minigames should be in chapter 3 — the hall is still closed at the
 * moment."* He is right, and it is not a small point: the premise of a booth game
 * is a booth with somebody standing at it, and chapter 2's hall is dark, empty and
 * an hour from opening. Nobody is there to start a stopwatch, nobody is there to
 * hand over a giant rubber duck, and the sponsor who would is asleep. Here the
 * doors are open, three thousand people are on the floor and the crew are at their
 * stands — so the swag is theirs to give, and the lines below say so.
 */
interface Minigames {
  /** Returns true when the key was consumed, so the chapter does not also act on it. */
  key(code: string, b: Bot): boolean;
  update(dt: number): void;
  props(): Prop[];
  /** Debug/test seam: move the duck. */
  place(kind: string, x: number, y: number): boolean;
  state(): MinigameState;
  /** How many of the three are won, for the HUD's progress line. */
  won(): number;
}

function setupMinigames(ctx: ChapterCtx): Minigames {
  const booth = (name: string): { x: number; y: number; w: number; h: number } => {
    const b = GF.booths.find((o) => o.name === name);
    if (!b) throw new Error(`no booth ${name}`);
    return b;
  };

  /*
   * Shuffleboard: shove the duck so it comes to rest inside the circle.
   *
   * **The lane runs WEST of the stand, not east.** It used to be laid out from
   * `duckB.x + duckB.w + 30`, which put the duck at (1010, 285) and the target at
   * (1010, 380) — and `GF.smallStairs` is x 952..1045, y 285..568, so the whole
   * minigame was played on the staircase, with the target decal drawn across the
   * steps. Narrowing column 3 off the stairs does not rescue it: the lane would
   * only move to x 970, still inside. It has to go the other way.
   *
   * It runs along the **aisle directly in front of the stand** instead, east to
   * west: the duck sits under its own sponsor's name and slides 95 px into open
   * floor.
   *
   * It took three goes, and the two failures are the interesting part.
   *
   *   1. The 60 px aisle immediately west of the stand: both ENDS of the lane
   *      measured clear, and a roof column at x 853..867, y 333..347 sits squarely
   *      in the middle of it. Checking a route's endpoints and calling it clear is
   *      the exact mistake `aisle.test.ts` was rewritten to stop making, and it was
   *      caught here the same way — by a test that walks the whole lane.
   *   2. The aisle further north, at y 170: lane clear, target clear, and Voxxy
   *      could not play it. She lines up 22 px BEHIND the duck, and behind it was
   *      x 902 — inside `GF.store`, which is x 900..1040. She was pushed out of the
   *      wall every shot and the duck never moved. A lane is not just where the
   *      puck goes; it is also where the player has to stand to hit it.
   *
   * So the scan that produced this one requires all four: the shove spot at 22, 30
   * and 40 px back, every point of the 95 px lane at 10 px of duck clearance, the
   * 22 px target ring, and 30 px of run-off past it so a hard shove does not bury
   * the duck in a wall. 91 positions survive that; this is the closest to the
   * stand it belongs to.
   */
  const duckB = booth('Rubber Duck Inc');
  const duck = mkBody('duck', duckB.x + 10, duckB.y - 30, {
    r: 8,
    mass: 0.6,
    accel: 0,
    max: 500 * SPEED_SCALE,
    drag: 1.1,
  });
  const duckTarget = { x: duckB.x - 85, y: duckB.y - 30, r: 22 };
  // Swag already won stays won: `ctx.swag` outlives the chapter object, so a
  // replay of chapter 3 (R, or Skip back into it) does not re-award anything.
  let duckDone = ctx.swag.includes('duck');

  const stB = booth('Sticker Mine');
  const sticker = { x: stB.x + stB.w / 2, y: stB.y + stB.h + 14 };
  let stickerDone = ctx.swag.includes('sticker');

  const rxB = booth('Regex Racing');
  const racePts: Vec2[] = [
    { x: rxB.x - 24, y: rxB.y - 16 },
    { x: rxB.x + rxB.w + 24, y: rxB.y - 16 },
    { x: rxB.x + rxB.w + 24, y: rxB.y + rxB.h + 16 },
    { x: rxB.x - 24, y: rxB.y + rxB.h + 16 },
  ];
  /**
   * The lap is a fixed length of floor, so the budget is a required speed wearing a
   * clock's clothes: it grows with `TRAVEL_TIME_SCALE` or the rescale would quietly
   * make the minigame impossible. 5 s of the prototype's Voxxy, 20 s of this one.
   */
  const RACE_LIMIT = 5 * TRAVEL_TIME_SCALE;
  let raceNext = 0;
  let raceT0 = 0;
  let raceDone = ctx.swag.includes('race');

  /**
   * The top shelf, and who can reach it.
   *
   * A gate, so each robot says why in its own voice (CLAUDE.md) — and now there is
   * somebody behind the counter who could hand it down and is enjoying not to.
   */
  function key(code: string, b: Bot): boolean {
    if (code !== 'KeyE') return false;
    if (!stickerDone && dist(b, sticker) < 40) {
      if (b.kind === 'droid') {
        stickerDone = true;
        ctx.addSwag(
          'sticker',
          'The Sticker Mine crew watch Droid take the holographic one off the top shelf without a stool. ' +
            '"…keep it." Swag +1',
        );
      } else if (b.kind === 'voxxy') {
        ctx.flash('Voxxy: "The holographic one?" — "Top shelf." I am 38 cm of robot. DROID!');
      } else {
        ctx.flash('Biggy: I leaned on the stand to reach and the whole stand leaned back. Droid does this one.');
      }
      return true;
    }
    return false;
  }

  function update(dt: number): void {
    stepBot(duck, dt, ctx.walls);
    for (const b of ctx.bots) {
      if (b.mounted) continue;
      const dx = duck.x - b.x;
      const dy = duck.y - b.y;
      const dd = Math.hypot(dx, dy);
      if (dd <= 0 || dd >= b.r + duck.r + 4) continue;
      const nx = dx / dd;
      const ny = dy / dd;
      const lean = b.ix * nx + b.iy * ny;
      // A shove, not a carry: the duck only takes a kick while it is still slow.
      if (lean > PUSH_LEAN_MIN && speed(duck) < 40 * SPEED_SCALE) {
        const F = (b.kind === 'biggy' ? 900 : 350) * SPEED_SCALE;
        duck.vx += nx * lean * F * dt;
        duck.vy += ny * lean * F * dt;
      }
      botsCollide(b, duck);
    }
    if (!duckDone && speed(duck) < 5 * SPEED_SCALE && dist(duck, duckTarget) < duckTarget.r) {
      duckDone = true;
      ctx.addSwag('duck', 'The duck stops in the circle. Rubber Duck Inc hands over a giant duck. Swag +1');
    }

    if (raceDone) return;
    const v = ctx.byKind('voxxy');
    const p = racePts[raceNext];
    if (dist(v, p) < 16) {
      if (raceNext === 0) raceT0 = ctx.t;
      raceNext++;
      if (raceNext === 4) {
        const el = ctx.t - raceT0;
        if (el <= RACE_LIMIT) {
          raceDone = true;
          ctx.addSwag('race', `Regex Racing lap in ${el.toFixed(1)}s — under ${RACE_LIMIT}s. Swag +1`);
        } else {
          ctx.flash(`Regex Racing lap in ${el.toFixed(1)}s — too slow, again`);
          raceNext = 0;
        }
      }
    }
    if (raceNext > 0 && ctx.t - raceT0 > RACE_LIMIT) {
      /*
       * A lap the player never meant to start must expire in silence.
       *
       * Marker 1 sits on a route Voxxy has three separate errands along, and
       * brushing it starts the clock. Announcing the reset told a player who was
       * fetching the ladle that they had failed a game they did not know they had
       * entered — twenty seconds after the fact, with no marker on screen since.
       *
       * One marker is a brush; two is a decision, because the second is only
       * reachable by going the way the lap goes. So the toast is gated on the
       * second, and the reset itself still happens either way.
       */
      const committed = raceNext >= 2;
      raceNext = 0;
      if (committed) ctx.flash("Regex Racing: time's up, lap reset");
    }
  }

  function props(): Prop[] {
    const out: Prop[] = [
      { kind: 'duck', x: duck.x, y: duck.y, w: duck.r * 2, h: duck.r * 2, state: duckDone ? 'done' : 'idle' },
      {
        kind: 'duck-target',
        x: duckTarget.x,
        y: duckTarget.y,
        w: duckTarget.r * 2,
        h: duckTarget.r * 2,
        state: duckDone ? 'done' : 'idle',
        label: 'duck shuffleboard',
      },
      {
        kind: 'sticker',
        x: sticker.x,
        y: sticker.y,
        w: 12,
        h: 8,
        state: stickerDone ? 'done' : 'idle',
        label: stickerDone ? 'sticker ✓' : 'top-shelf sticker (E)',
      },
    ];
    racePts.forEach((p, i) => {
      out.push({
        kind: 'race-marker',
        x: p.x,
        y: p.y,
        w: 12,
        h: 12,
        v: i + 1,
        state: raceDone ? 'done' : i === raceNext ? 'active' : 'idle',
        label: raceDone ? 'lap ✓' : `Voxxy lap 1→4 under ${RACE_LIMIT}s`,
      });
    });
    return out;
  }

  return {
    key,
    update,
    props,
    place(kind: string, x: number, y: number): boolean {
      if (kind !== 'duck') return false;
      duck.x = x;
      duck.y = y;
      duck.vx = 0;
      duck.vy = 0;
      return true;
    },
    state: () => ({ duck: { x: duck.x, y: duck.y }, duckDone, stickerDone, raceDone, raceNext }),
    won: () => (duckDone ? 1 : 0) + (stickerDone ? 1 : 0) + (raceDone ? 1 : 0),
  };
}

export interface BreakfastState {
  chapter: 3;
  ladle: boolean;
  carrying: boolean;
  delivered: boolean;
  /** Percent left in the pot. */
  soup: number;
  /** Percent of the original heat. */
  temp: number;
  /** Pots spilled or gone cold and refilled — never a lost run (`ruined`). */
  batches: number;
  /** Has anybody walked up to the crab sandwich yet. Flavour, and a test hook. */
  crabFound: boolean;
  complaints: number;
  speaker: { following: boolean; onStage: boolean; booth: string };
  queues: Array<{ label: string; open: number }>;
  gateOpen: boolean;
  /** 0..1, how far Stephan has walked the barrier back. See `GATE_SWING_TIME`. */
  gateSwing: number;
  crowd: number;
  /** The beer delivery (`src/sim/crates.ts`). */
  beer: {
    /** Crates on the floor right now, in index order. */
    loose: Array<{ i: number; x: number; y: number }>;
    carried: number;
    stacked: number;
    total: number;
    /** The crate whose pickup throws — carrying one fewer is the optimal line. */
    limit: number;
    /** Heap errors thrown this run. */
    oom: number;
    done: boolean;
  };
  minigames: MinigameState;
}

const OBJECTIVE =
  'Chapter 3 · <b>Breakfast</b>. The main entrance is open and 3,000 people walk in. <b>Stephan</b> stands ' +
  'at the main staircase and wants three things before he opens it: his <b>tomato soup</b> — at breakfast, ' +
  'yes — the <b>keynote speaker</b>, and <b>tonight\'s beer delivery</b> out of the aisle and onto the bar. Droid: the ladle ' +
  'is on the high shelf. Biggy: carry the pot (bumps spill it, and it cools), and stack the crates — he is ' +
  'the only one who can lift one, and only so many at a time — they go to <b>The Finally Block</b>, the bar ' +
  'with the lit mark on the floor, and that errand is his alone. Voxxy: clear a catering queue (E), find the ' +
  'speaker at a built booth. The sponsor booths are open and running their games: three bits of ' +
  '<b>swag</b> to be won on the way, all optional.';
const KEYS =
  '1/2/3/Tab: switch · WASD · E: use / lift / ask / clear a queue / play a game / tow Biggy / Voxxy jumps · R: restart \u00b7 I: run sheet \u00b7 H: hint';

function setup(ctx: ChapterCtx): ChapterRuntime {
  ctx.setFloor('down');
  ctx.setView(VIEW_GROUND);
  ctx.setWalls(groundWalls());
  ctx.place([600, 215], [630, 215], [660, 215]);

  /**
   * HOW LONG STEPHAN TAKES TO OPEN THE STAIRS, seconds.
   *
   * The gate at the foot of the main staircase was the last door in the game that
   * popped: `done()` called `ctx.removeWall(gate)` and `props()` went on publishing
   * a `gate` prop, which `PROPS.gate` drew as a 1.1 m box across the stair foot —
   * un-animated AND walk-through, and with a second, static gate drawn in the same
   * doorway by `buildVenue()` on top of it. It was flagged during the roller-door
   * round and left for somebody else; this is that somebody.
   *
   * Longer than any of the other three (`FIRE_SWING_TIME` 1 s, `ROLLER_RISE_TIME`
   * 0.42 s, `CABINET_SWING_TIME` 1.2 s), because nothing is forcing this one. It is
   * a man unhooking a barrier and walking it back against the wall at the start of
   * a conference day, and it is the only door in the game that opens because
   * somebody decided it was time. A duration, not a speed.
   */
  const GATE_SWING_TIME = 1.5;
  /**
   * ...and how long the chapter stays on the hall afterwards before the exit
   * cutscene fades it out.
   *
   * Exactly the trap `FIRE_CUT_DELAY` exists for in `ch1-night.ts`, and chapter 3
   * had it in its purest form: `done()` opened the gate and started the cutscene
   * that ends the chapter in the same statement. `CUT_FADE` is 0.35 s, so the
   * screen would be black before the barrier had moved a degree and the animation
   * would exist with nobody able to see it. The chapter now holds — still in
   * `play`, still driveable — for the swing plus this, and only then hands over.
   */
  const GATE_CUT_DELAY = 0.5;
  /** The barrier's own thickness. Matches `GATE_LEAF_T` in `src/render/doors.ts`. */
  const GATE_LEAF_T = 4;
  /**
   * ...and how wide the opening in it is (`GATE_MOUTH` in `src/render/doors.ts`).
   *
   * Both numbers are duplicated rather than imported because `src/sim` may not
   * read `src/render` (CLAUDE.md). `tests/doors.test.ts` asserts the two copies
   * against each other so they cannot drift.
   */
  const GATE_MOUTH = 44;
  const GATE_POST_R = 1.6;

  const gate: Wall = {
    ...GF.gate,
    kind: 'gate',
    why: (b) =>
      b.kind === 'voxxy'
        ? 'Stephan, to Voxxy: "Fast little thing. Still no. Soup, my keynote speaker, and that beer off my floor. Then the stairs."'
        : b.kind === 'droid'
          ? 'Stephan, to Droid: "You can see over the gate, I know. Nobody goes up until I have soup, a speaker and a clear aisle."'
          : 'Stephan, to Biggy: "Do not. The rooms open when I say so, and I say nothing before my soup — and those crates are still where the lorry left them."',
  };
  ctx.walls.push(gate);
  let gateOpen = false;
  /** 0..1, how far the barrier has swung back. Ticked in `update`. */
  let gateSwing = 0;
  /** Sim time the exit cutscene starts, once Stephan has opened up. -1 until then. */
  let leaveAt = -1;
  /*
   * WHERE THE BARRIER ENDS UP, and what it leaves behind.
   *
   * The rects `gateDraw` poses at `progress = 1` (`src/render/doors.ts`), which
   * since the staircase was turned to face the entrance is a **gate in a run of
   * barrier** rather than one enormous leaf: the flight is 197 px — 15.7 m —
   * across its foot, and the 55 px of concourse between it and the glazed wall has
   * nowhere to put a leaf that long. `GATE_MOUTH` is the opening; the leaf is that
   * wide, hinged on its north post and swung a quarter turn EAST into the
   * concourse; both posts stay, and so does the barrier either side.
   *
   * East rather than into the shaft, because the flight starts climbing at this
   * line and is 3.9 m up within the leaf's own length (`groundPlates`): a barrier
   * lying in there would be buried in the treads, and the transition walks three
   * robots up the middle of it a second and a half later. Out here it lies flat on
   * the lobby floor with 11 px to spare in front of the glazing, and nothing in
   * the cutscene goes near it.
   */
  const gateX = GF.gate.x + GF.gate.w / 2;
  /** The middle of the barrier: where the opening is, and where Stephan stands. */
  const gateMouthY = GF.gate.y + (GF.gate.h - GATE_MOUTH) / 2;
  const gateOpenWalls: Wall[] = [
    // The leaf, swung a quarter turn east into the concourse and resting there.
    {
      x: gateX - GATE_LEAF_T / 2,
      y: gateMouthY - GATE_LEAF_T / 2,
      w: GATE_MOUTH + GATE_LEAF_T,
      h: GATE_LEAF_T,
      kind: 'gateleaf',
      why: (b) => `${b.name}: that is the gate itself, walked back out of the way. The way up is beside it`,
    },
    // Both posts stay. So does the rest of the barrier, either side of the
    // opening: Stephan opened a gate, he did not take the stair's whole front off.
    ...[gateMouthY, gateMouthY + GATE_MOUTH].map(
      (y): Wall => ({
        x: gateX - GATE_POST_R,
        y: y - GATE_POST_R,
        w: GATE_POST_R * 2,
        h: GATE_POST_R * 2,
        kind: 'gatepost',
        why: (b) => `${b.name}: the gate post. It stays where it is`,
      }),
    ),
    ...(
      [
        [GF.gate.y, gateMouthY],
        [gateMouthY + GATE_MOUTH, GF.gate.y + GF.gate.h],
      ] as const
    )
      .filter(([a, b]) => b - a > 0.5)
      .map(
        ([a, b]): Wall => ({
          x: gateX - GATE_LEAF_T / 2,
          y: a,
          w: GATE_LEAF_T,
          h: b - a,
          /*
           * `gatebar`, NOT `gate`. `openness()` in `src/render/doors.ts` reads the
           * wall list for a `gate` to decide whether the barrier is still sealed,
           * so leaving these two runs under that kind told the renderer the gate
           * had never opened and drew the leaf shut across its own opening — with
           * nothing in the sim behind it, which `tests/colliders.test.ts` catches
           * as a wall you can walk through.
           */
          kind: 'gatebar',
          why: (bot) => `${bot.name}: the barrier still runs the width of the stair. The gate is the gap in the middle`,
        }),
      ),
  ];

  /*
   * The bar itself, as a collider.
   *
   * `low`, like the reception counter and the catering counters: light crosses it,
   * robots do not. It is pushed by the chapter rather than living in
   * `groundWalls()` because it is not the building — it is a pop-up bar set up for
   * tonight, and it is only here on the morning this chapter happens.
   *
   * Three voices, because a wall that stops you owes you a reason in the voice of
   * whoever walked into it (CLAUDE.md), and three ways of saying "it is a bar" is
   * the point of having three robots.
   */
  ctx.walls.push({
    ...BAR,
    low: true,
    kind: 'bar',
    why: (b) =>
      b.kind === 'voxxy'
        ? `Voxxy: "${BAR_NAME}. From down here it is a wall with glasses on top. I can hear them."`
        : b.kind === 'droid'
          ? `Droid: "I can see every glass on that bar and reach exactly none of them from this side. Round the end."`
          : `Biggy: "I have been through a bar before. They still talk about it. Round the end."`,
  });

  const mg = setupMinigames(ctx);

  const food = GF.food;
  const station: Vec2 = { x: food.soup.x + 45, y: food.soup.y + 15 };
  const shelfAt: Vec2 = { x: food.shelf.x + 11, y: food.shelf.y + 8 };
  let ladle = false;
  let carrying = false;
  let delivered = false;
  let soup = 100;
  let temp = 100;
  let pickupT = 0;
  /** How many pots have been spilled or gone cold on the way over. Flavour, and a count. */
  let batches = 0;
  /**
   * THE CRAB SANDWICH, and whether anybody has found it yet.
   *
   * Michele, 25 Sep 2026: *"We need to add the CRAB SANDWiCH somewhere. That's
   * the most famous part of the infamous devoxx food."* It is a running joke with
   * a queue attached, so it is in the building rather than in a line of text: a
   * lit tray on the sandwich counter under its own sign (`crab-sign` in
   * `src/render/venue/signage.ts`), and three different answers when a robot walks
   * up to it. It asks nothing of the player and blocks nothing — it is the kind of
   * thing the "sense of place" 10 points are for.
   */
  let crabFound = false;
  let complaints = 0;

  /* --------------------------------------------------------------- the queues */

  const queues: Queue[] = [];
  const mkQueue = (x0: number, n: number, label: string): void => {
    const q: Queue = { label, x: x0, people: [], open: 0 };
    for (let i = 0; i < n; i++) {
      const x = x0 + (i % 2 ? 5 : -5);
      q.people.push({
        x,
        hx: x,
        y: food.court.y + food.court.h - 10 - i * 16,
        r: 6,
        colour: QUEUE_COLOURS[(i * 7) % 4],
        cd: 0,
      });
    }
    queues.push(q);
  };
  mkQueue(102, 7, 'soup queue');
  mkQueue(232, 6, 'sandwich queue');
  mkQueue(307, 7, 'coffee queue');

  /* ------------------------------------------------------------ people to ask */

  const npcs = [
    {
      x: 1010,
      y: 300,
      r: 8,
      name: 'a speaker',
      line: 'The keynote speaker? Hiding from the queues at a sponsor booth. One of the built ones, with walls.',
    },
    {
      x: 1150,
      y: 500,
      r: 8,
      name: 'JUG leader',
      line: 'Stephan is at the main staircase, arms crossed. He is not opening it before his soup.',
    },
    { x: 370, y: 215, r: 8, name: 'Devoxx crew', line: 'Mind the coffee queue with that pot. It bites.' },
  ];

  // The speaker hides behind one of the *built* booths, never a table — the hint the
  // NPCs give has to stay true, and a table booth would be visible from the aisle.
  const built = GF.booths.filter((b) => !b.table);
  const hideBooth = built[Math.floor(ctx.rng() * built.length)];
  const speaker = { x: hideBooth.x + hideBooth.w / 2, y: hideBooth.y + hideBooth.h + 14, r: 7, following: false, onStage: false };

  /*
   * Stephan, and the spot the soup has to reach him.
   *
   * Both sit EAST of the main staircase, because that is the foot of the flight
   * and the only side of it anyone can reach: the wardrobe and the reception desk
   * close its west flank (`src/sim/geometry.ts`), and `GF.gate` — the gate he is
   * standing at — closes the east. He stands **at the opening**, not at the middle
   * of the rect, which since the stair was turned are no longer the same point.
   * Arrivals come in through the left-hand doors a few metres to his south-east
   * and walk straight into him, which is the queue Devoxx actually has.
   */
  const stair = GF.mainStair;
  const gateMidY = GF.gate.y + GF.gate.h / 2;
  const stephan = { x: stair.x + stair.w + 26, y: gateMidY, r: 8 };
  /*
   * The stage stays SOUTH of the stair, where it always was.
   *
   * Stephan moved to the east face with the gate; the stage did not follow him,
   * because it cannot: the concourse east of the flight is 49 px — 3.9 m — of
   * clear floor between the barrier and the glazed wall, which is a corridor two
   * robots wide and not somewhere to stand a lectern, a soup pot and a keynote
   * speaker. Down here is the open lobby in front of reception, it is in the same
   * frame as the gate, and it is the ground a robot already crosses on the way in.
   */
  const stage = { x: stair.x + 6, y: stair.y + stair.h + 40, w: 100, h: 110 };

  /* --------------------------------------------------------------- the crowd */

  const crowd: Visitor[] = [];
  let spawnT = 0;

  // `GF` is `as const`, so its lane arrays are tuples of literal types; widening them
  // once here keeps `indexOf` usable without casting at every call site.
  const laneX: readonly number[] = GF.laneX;
  const laneY: readonly number[] = GF.laneY;
  const nearestNode = (x: number, y: number): Vec2 => ({
    x: laneX.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a)),
    y: laneY.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a)),
  });

  /**
   * One arrival, through the LEFT-HAND DOORS.
   *
   * Only that one set of doors is open for Devoxx (`GF.entrance`, Michele's plot),
   * so the whole crowd enters on a 136 px front next to the reception desk rather
   * than along the entire glazed wall — and certainly not off the canvas edge,
   * where the prototype spawned them. From there they walk the front of reception,
   * turn at the wardrobe and go DOWN THE STEPS into the hall: the small staircase
   * is the only way through the hall's right edge, so the crowd has to use it too.
   */
  function spawnVisitor(): void {
    const e = GF.entrance;
    const st = GF.smallStairs;
    // Which door leaf, and which part of the 22 m wide steps, this one takes. One
    // shared route would put three thousand people in single file: they all aim at
    // the same waypoint, and "do not walk into the back of the person in front"
    // then turns the only threshold into a stationary conga line.
    const lane = ctx.rng();
    const step = st.y + 34 + lane * (st.h - 68);
    /*
     * ...and which of the three DOOR BAYS. The entrance is one opening in the
     * plot and three bays on the ground: the mullions between them and the
     * leaves standing open in them are colliders now, so a visitor aimed at the
     * middle of a frame stood at the door for the whole chapter instead of
     * coming in. `entranceBayGaps()` is the clear width of each bay.
     */
    const gaps = entranceBayGaps();
    const gap = gaps[Math.min(gaps.length - 1, Math.floor(lane * gaps.length))];
    const inY = gap[0] + 6 + ctx.rng() * Math.max(0, gap[1] - gap[0] - 12);
    const v = mkBody('attendee', e.x, inY, { r: 5, mass: 0.5 }) as Visitor;
    v.walk = (60 + ctx.rng() * 40) * SPEED_SCALE;
    v.colour = VISITOR_COLOURS[Math.floor(ctx.rng() * 4)];
    v.dwell = 0;
    v.hitCd = 0;
    v.route = [
      // Straight through the bay first, then turn: the leaf is standing open in it.
      { x: e.x - 24, y: inY },
      { x: e.x - 40, y: inY },
      { x: 1240, y: 520 + (lane - 0.5) * 90 },
      { x: st.x + st.w + 20, y: step },
      { x: GF.hall.x + GF.hall.w - 40, y: step },
    ];
    crowd.push(v);
  }

  /**
   * Keep a visitor out of the built fabric.
   *
   * The crowd walks a lane grid and never asked the wall list anything, so a
   * visitor whose node hop clipped a booth corner, a stair wall or a counter
   * simply walked through it — the round-2 craft critic photographed several of
   * them half inside the stair wall and a queue apparently lying down inside a
   * booth table. This is the same shallowest-axis push-out `src/sim/bot.ts` does
   * for the robots, minus the bounce: a visitor has no velocity response, it just
   * cannot be inside a slab.
   */
  function pushOutOfWalls(a: { x: number; y: number; r: number }): void {
    for (const w of ctx.walls) {
      if (w.hidden) continue;
      const cx = a.x < w.x ? w.x : a.x > w.x + w.w ? w.x + w.w : a.x;
      const cy = a.y < w.y ? w.y : a.y > w.y + w.h ? w.y + w.h : a.y;
      const dx = a.x - cx;
      const dy = a.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > a.r * a.r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        a.x = cx + (dx / d) * a.r;
        a.y = cy + (dy / d) * a.r;
        continue;
      }
      // Dead centre inside the slab: leave by the nearest face.
      const left = a.x - w.x;
      const right = w.x + w.w - a.x;
      const up = a.y - w.y;
      const down = w.y + w.h - a.y;
      const min = Math.min(left, right, up, down);
      if (min === left) a.x = w.x - a.r;
      else if (min === right) a.x = w.x + w.w + a.r;
      else if (min === up) a.y = w.y - a.r;
      else a.y = w.y + w.h + a.r;
    }
  }

  function stepVisitor(a: Visitor, dt: number): void {
    if (a.dwell > 0) {
      a.dwell -= dt;
      a.vx *= 0.8;
      a.vy *= 0.8;
      return;
    }
    if (!a.route.length) {
      // Pick a neighbouring lane node and amble to it. No pathfinding, no goals —
      // a trade show floor is Brownian motion with coffee.
      const n = nearestNode(a.x, a.y);
      const xi = laneX.indexOf(n.x);
      const yi = laneY.indexOf(n.y);
      const opts: Vec2[] = [];
      if (xi > 0) opts.push({ x: laneX[xi - 1], y: n.y });
      if (xi < laneX.length - 1) opts.push({ x: laneX[xi + 1], y: n.y });
      if (yi > 0) opts.push({ x: n.x, y: laneY[yi - 1] });
      if (yi < laneY.length - 1) opts.push({ x: n.x, y: laneY[yi + 1] });
      a.route.push(opts[Math.floor(ctx.rng() * opts.length)]);
      a.dwell = ctx.rng() * 2;
    }
    const t = a.route[0];
    const dx = t.x - a.x;
    const dy = t.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 5) {
      a.route.shift();
      return;
    }
    // Do not walk into the back of the person in front: that is what makes a crowd
    // look like a crowd rather than like particles.
    let blocked = false;
    for (const o of crowd) {
      if (o === a) continue;
      const ox = o.x - a.x;
      const oy = o.y - a.y;
      const od = Math.hypot(ox, oy);
      if (od < 12 && (ox * dx + oy * dy) / (od * d) > 0.6) {
        blocked = true;
        break;
      }
    }
    const spd = blocked ? 0 : a.walk;
    const k = 1 - Math.exp(-8 * dt);
    a.vx += ((dx / d) * spd - a.vx) * k;
    a.vy += ((dy / d) * spd - a.vy) * k;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    pushOutOfWalls(a);
    pushOutOfCrates(a);
  }

  /* --------------------------------------------------------- the beer delivery */

  /*
   * Six crates, shrink-wrapped on a pallet, in two rows of three — which is how a
   * brewery leaves them and, not by accident, how they end up on the stack.
   */
  const crates: Crate[] = [];
  for (let i = 0; i < CRATE_DELIVERY; i++) {
    const c = mkBody(crateBrew(i), PALLET.x + ((i % 3) - 1) * 13, PALLET.y + (i < 3 ? -8 : 8), {
      r: CRATE_R,
      mass: CRATE_MASS,
      // `accel` 0: nothing drives a crate, it is only ever shoved.
      accel: 0,
      max: CRATE_MAX_SPEED,
      drag: CRATE_DRAG,
    }) as Crate;
    c.i = i;
    c.held = 'loose';
    c.layer = 0;
    c.rolling = false;
    crates.push(c);
  }
  let beerDone = false;
  /** Heap errors thrown this run. It goes on the final card. */
  let oom = 0;
  let oomCardShown = false;
  let labelRead = false;

  const held = (which: Crate['held']): Crate[] => crates.filter((c) => c.held === which);
  const carriedCrates = (): number => held('carried').length;

  /** Biggy's identity is restored from `DEFS` every time, never accumulated. */
  const reload = (): void => loadBiggy(ctx.byKind('biggy'), carriedCrates());
  // Defensive: `game.ts` restores the frozen numbers at every chapter start, and
  // this chapter is the only thing that ever moves them. Both together mean a
  // replay of chapter 3 can never begin with the last run's load still on him.
  reload();

  /** Where the k-th crate lands at the cellar end of the bar: three wide, then a layer up. */
  const stackSlot = (k: number): { x: number; y: number; layer: number } => ({
    x: CELLAR.x + (k % STACK_WIDE) * STACK_STEP,
    y: CELLAR.y,
    layer: Math.floor(k / STACK_WIDE),
  });

  /**
   * Keep the crowd out of the delivery.
   *
   * The premise of the beat is that a pallet dumped in the aisle is in three
   * thousand people's way, so they have to be seen going round it — `stepVisitor`
   * already does exactly this against the wall list, and a crate is the same
   * question with a circle instead of a slab. The visitor has no velocity response
   * (it has no physics), it simply cannot be inside one.
   */
  function pushOutOfCrates(a: { x: number; y: number; r: number }): void {
    for (const c of crates) {
      if (c.held === 'carried') continue;
      const dx = a.x - c.x;
      const dy = a.y - c.y;
      const min = a.r + c.r;
      // Squared, and the square root only on the one crate in a hundred that is
      // actually touching someone: this runs 36 visitors x 6 crates every frame.
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      if (d2 < 1e-6) {
        a.x = c.x + min;
        continue;
      }
      const d = Math.sqrt(d2);
      a.x = c.x + (dx / d) * min;
      a.y = c.y + (dy / d) * min;
    }
  }

  /*
   * A CRATE NOBODY CAN REACH. The rules are in `src/sim/crates.ts`, which is where
   * a test can ask them a question; this is the chapter deciding what to say.
   */
  function rescueCrate(c: Crate): void {
    const spot = crateRescueSpot(c.x, c.y, ctx.byKind('biggy').r, ctx.walls);
    c.vx = 0;
    c.vy = 0;
    if (spot) {
      c.x = spot.x;
      c.y = spot.y;
      ctx.flash(`Biggy: "${c.name} went somewhere my arms do not. Dragged it back out."`, 3600);
      return;
    }
    // Nowhere within four metres. Should never happen on this floor, and if it
    // ever does the pallet is somewhere the crate is definitely reachable from.
    c.x = PALLET.x;
    c.y = PALLET.y;
    ctx.flash(`Biggy: "${c.name} is back on the pallet. Do not ask."`, 3600);
  }

  /** The nearest crate Biggy could get his arms round, or null. */
  function crateInReach(p: Vec2): Crate | null {
    let best: Crate | null = null;
    let bd = CRATE_REACH;
    for (const c of held('loose')) {
      const d = dist(c, p);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * The heap error: everything he is holding hits the floor and stays there.
   *
   * The scatter is a ring just outside his own radius at `CRATE_SCATTER_SPEED`,
   * which is about a crate's length of travel — his mess, at his feet, and he has
   * to shove his way out of it. Cheap on purpose: *"the test is whether a player
   * laughs the first time and then plays around it"*.
   */
  function heapError(bg: Bot): void {
    const load = held('carried');
    oom++;
    ctx.score.oom = oom;
    load.forEach((c, k) => {
      const a = (k / load.length) * Math.PI * 2 + ctx.rng() * 0.8;
      const out = bg.r + c.r + 2;
      const sp = CRATE_SCATTER_SPEED * (0.7 + ctx.rng() * 0.6);
      c.held = 'loose';
      c.layer = 0;
      c.x = bg.x + Math.cos(a) * out;
      c.y = bg.y + Math.sin(a) * out;
      c.vx = Math.cos(a) * sp;
      c.vy = Math.sin(a) * sp;
    });
    reload();
    ctx.flash(`Biggy: "\u2026I had them. I had all ${load.length} of them."`, 4200);
    if (!oomCardShown) {
      oomCardShown = true;
      ctx.card(oomCardHtml(load.length));
    }
  }

  /** `E` on a crate. Returns true when the key was spent, whatever the outcome. */
  function takeCrate(bg: Bot): boolean {
    const c = crateInReach(bg);
    if (!c) return false;
    if (carrying && !delivered) {
      ctx.flash('Biggy: "The pot needs both hands. The crates need the rest of me. One job at a time."');
      return true;
    }
    c.held = 'carried';
    c.vx = 0;
    c.vy = 0;
    const n = carriedCrates();
    reload();
    if (n >= CRATE_STACK_LIMIT) {
      heapError(bg);
      return true;
    }
    if (n === CRATE_STACK_LIMIT - 1) {
      // The last safe one says so, in his voice: the punchline is only funny if
      // the player could see it coming (and the progress line has been counting).
      ctx.flash(`Biggy: "${c.name}, and that is ${n}. That is the stack. I can feel it in the knees."`, 3200);
    } else {
      // The brewery on the crate, every time he lifts one: six invented Belgian
      // names (`CRATE_BREWS`) are only a joke if the player gets to read them.
      ctx.flash(`Biggy takes the ${c.name} \u2014 ${n} up, ${held('loose').length} still on the floor`, 2800);
    }
    return true;
  }

  /** `E` inside the stack zone: the whole load goes down, neatly, and he is himself again. */
  function stackCrates(): void {
    const load = held('carried');
    let k = held('stacked').length;
    for (const c of load) {
      const slot = stackSlot(k++);
      c.held = 'stacked';
      c.layer = slot.layer;
      c.x = slot.x;
      c.y = slot.y;
      c.vx = 0;
      c.vy = 0;
    }
    reload();
    const done = held('stacked').length;
    if (done >= CRATE_DELIVERY) {
      beerDone = true;
      ctx.flash(
        `Biggy: "${CRATE_DELIVERY} crates on the bar, ${oom} heap error${oom === 1 ? '' : 's'}. ` +
          `${BAR_NAME} is stocked and the aisle is yours, Stephan."`,
        4000,
      );
    } else {
      ctx.flash(`Biggy hands ${load.length} over the bar \u2014 ${done}/${CRATE_DELIVERY} stacked at ${BAR_NAME}`);
    }
  }

  /**
   * Crates on the floor are bodies: they step, they hit walls, robots bump into
   * them and any robot can shove one. Only Biggy can pick one up.
   *
   * This is the shuffleboard duck's loop (ch2) with six bodies instead of one, and
   * a crate-against-crate pass so a scattered load piles up rather than overlapping.
   */
  function stepCrates(dt: number): void {
    const bg = ctx.byKind('biggy');
    for (const c of crates) {
      if (c.held === 'carried') {
        // Riding on his back: drawn above him by `props()`, and not a body while
        // he has it. The physics of carrying it is `loadBiggy`, not a collision.
        c.x = bg.x;
        c.y = bg.y;
        c.vx = 0;
        c.vy = 0;
        continue;
      }
      if (c.held === 'stacked') {
        c.rolling = false;
        continue;
      }
      // A crate at rest has nothing to integrate and no wall to resolve: it got
      // there by being resolved already. Only a crate somebody has shoved pays
      // for `stepBot`, which walks the whole ground-floor wall list.
      if (c.vx !== 0 || c.vy !== 0) stepBot(c, dt, ctx.walls);
      /*
       * The one frame a crate can become stranded: the one it stops on.
       *
       * See `rescueCrate`. Checking here rather than on a timer is what keeps the
       * guard free — a crate that has not moved cannot have moved somewhere new,
       * and a crate that is still rolling has not arrived anywhere yet.
       */
      const rolling = c.vx !== 0 || c.vy !== 0;
      if (c.rolling && !rolling && !crateReachable(c.x, c.y, ctx.byKind('biggy').r, ctx.walls)) rescueCrate(c);
      c.rolling = rolling;
      for (const b of ctx.bots) {
        if (b.mounted) continue;
        const dx = c.x - b.x;
        const dy = c.y - b.y;
        const dd = Math.hypot(dx, dy);
        if (dd <= 0 || dd >= b.r + c.r + 4) continue;
        const nx = dx / dd;
        const ny = dy / dd;
        const lean = b.ix * nx + b.iy * ny;
        // A shove, not a carry: a crate only takes a kick while it is still slow.
        if (lean > PUSH_LEAN_MIN && speed(c) < 40 * SPEED_SCALE) {
          const F = b.kind === 'biggy' ? CRATE_SHOVE_BIGGY : CRATE_SHOVE_OTHER;
          c.vx += nx * lean * F * dt;
          c.vy += ny * lean * F * dt;
        }
        botsCollide(b, c);
      }
    }
    // Crate against crate, so a scattered load piles up instead of overlapping —
    // and only while something in the pile is still moving.
    const floor = held('loose');
    if (floor.some((c) => c.vx !== 0 || c.vy !== 0)) {
      for (let i = 0; i < floor.length; i++) {
        for (let j = i + 1; j < floor.length; j++) botsCollide(floor[i], floor[j]);
      }
    }
    if (!labelRead) {
      for (const b of ctx.bots) {
        if (dist(b, PALLET) > LABEL_REACH) continue;
        labelRead = true;
        ctx.flash(
          'Printed on the shrink-wrap: "Belgian beers may cause hangovers and OutOfMemoryErrors." Delivered this ' +
            `morning, for tonight: ${crateBrew(0)}, ${crateBrew(1)}, ${crateBrew(3)}\u2026 and they go to ${BAR_NAME}.`,
          5000,
        );
        break;
      }
    }
  }

  /* -------------------------------------------------------------- Stephan talks */

  /** How many times he has been asked, so he does not say the same thing twice. */
  let asked = 0;

  /**
   * What Stephan says when you walk up to him, which depends entirely on what is
   * still outstanding — he is a man with a list.
   *
   * Two or three lines per state, cycled rather than randomised: a line you can
   * get back to by pressing `E` again is a line the player can read properly, and
   * nothing in this game is random that does not have to be.
   */
  function stephanSays(): string {
    const pick = (lines: readonly string[]): string => `Stephan: "${lines[asked++ % lines.length]}"`;
    if (gateOpen) return pick(['All is ready. All is ready! Up you go, the rooms are yours.', 'Go on. Before I find something else that is missing.']);
    if (!delivered) {
      if (carrying) return pick(['Is that my soup? Bring it here before it is a cold soup.', 'I can see it from here. Walk. Do not run.']);
      if (ladle) return pick(['Where is my soup?', 'Tomato. At breakfast, yes. It is a tradition and I am the one who keeps it.']);
      return pick(['Where is my soup?', 'The pot is on the counter and the ladle is on the shelf. I am not doing it myself, I am holding a staircase.']);
    }
    if (!speaker.onStage) {
      if (speaker.following) return pick(['That is them? Good. Over here, please.', 'Hurry them along. The programme still says TBA and people are reading it.']);
      return pick([
        'The keynote speaker! Where is he? Or she. The programme says <b>TBA</b> and it has said TBA for a month.',
        'Somebody saw them hiding from the queue behind a booth. One of the built ones.',
      ]);
    }
    if (!beerDone)
      return pick([
        `Tonight's beer is standing in the middle of my aisle. It goes to ${BAR_NAME}.`,
        'Three thousand people, one aisle, and a pallet of beer in it. Biggy.',
        'And if anybody is passing the sandwich counter — no. I have had two. Do not tell the crew.',
      ]);
    return pick(['Soup. Speaker. Beer. Right — give me a moment with this barrier.']);
  }

  /* ----------------------------------------------------------------- the soup */

  function spill(amount: number, why: string): void {
    if (!carrying || delivered) return;
    soup = Math.max(0, soup - amount);
    if (soup > 0) {
      ctx.flash(`Splash — ${why} (${Math.trunc(soup)}% left)`);
      return;
    }
    ruined('Biggy: "…that was all of it."');
  }

  /**
   * THE POT IS RUINED — AND THAT IS NOT THE END OF THE RUN.
   *
   * Michele, 25 Sep 2026: *"if the soup is spilled, you can come back and take a
   * new batch."* He is right, and what was there was the worst kind of
   * difficulty: a full-screen `R to try again` twenty seconds from the end of the
   * chapter, for a mistake whose fix in the fiction is walking back to a counter
   * with a vat on it. There are three thousand people at a breakfast queue; the
   * kitchen is not out of soup.
   *
   * So an empty pot and a cold pot both send Biggy back to the counter with the
   * ladle he already has. The cost is the walk and the clock, which is a cost the
   * player can see and can do something about, and Stephan's line at the end
   * counts the batches — the joke is better than the failure was.
   */
  function ruined(line: string): void {
    carrying = false;
    batches++;
    soup = 100;
    temp = 100;
    ctx.flash(`${line} Back to the counter, Biggy — they will fill it again.`, 4200);
  }

  ctx.objective(OBJECTIVE, KEYS);
  /*
   * THE CARD HAS TO SAY WHAT THE CHAPTER IS FOR. Michele, 25 Sep 2026: *"Intro
   * for chapter 3 does not state the aim. Breakfast is ready, stephan wants his
   * soup. And the keynote speaker (has it been announced yet?)"*
   *
   * It said *"Power, network, badges"* — which is chapter TWO's list, already
   * done, and then a line about a queue. So the one screen the player actually
   * reads named none of the three things they are about to be asked for. It names
   * all three now, in Stephan's own order, and it keeps the TBA joke where the
   * joke is: on the programme.
   */
  ctx.card(
    '<b>Breakfast, and Stephan wants three things.</b> The doors are open, three thousand people are inside, ' +
      'and the man at the foot of the main staircase is not unhooking that barrier until he has his ' +
      '<b>tomato soup</b> — at breakfast, yes — until somebody finds the <b>keynote speaker</b>, who is still ' +
      '<b>TBA</b> on the programme and hiding from the queue behind a booth, and until <b>tonight\u2019s beer</b> ' +
      `is out of the aisle and behind the bar at ${BAR_NAME}.` +
      '<small>Press any key</small>',
  );

  /* --------------------------------------------------------------------- keys */

  /**
   * This chapter's keys — and what it hands back.
   *
   * `false` means "`E` means nothing where you are standing", and `game.ts` then
   * spends the key on Voxxy's hop or on taking hold of Biggy (see
   * `ChapterRuntime.key`). Chapter 3 was the last of the four to be taught it, and
   * the symptom was reported from the other end: the rig round found that Voxxy
   * could not hop anywhere in this chapter at all, because everything here ends in
   * a line of dialogue and a line of dialogue was claiming the key.
   *
   * The dead ends hand it back — Voxxy with nobody to talk to, Biggy with nothing
   * to pick up, and, since the other two robots got a party trick of their own on
   * 25 Sep 2026, Droid with nothing to reach. Every refusal that names a REASON
   * keeps the key,
   * because those are answers: "no ladle", "I am three crates deep", "that weighs
   * more than I do". Hopping instead of saying one of those would be a worse game.
   */
  function key(code: string): boolean {
    const b = ctx.bots[ctx.cur];
    const d = ctx.byKind('droid');
    const bg = ctx.byKind('biggy');
    const v = ctx.byKind('voxxy');
    ctx.switchKey(code);
    if (code !== 'KeyE') return true;
    if (mg.key(code, b)) return true;

    /*
     * TALK TO STEPHAN. Michele, 25 Sep 2026: *"you should be able to 'talk' with
     * stephan. Lines like 'where's my soup' 'All is ready.. all is ready' 'the
     * keynote speaker! Where is he'."*
     *
     * He is the whole chapter — three errands, all of them his — and he was a
     * figure with a hat you walked up to and nothing happened. Any robot can
     * talk to him, not only Voxxy: he is not a person you have to be charming to,
     * he is a man waiting for his soup, and he will say so to whoever turns up.
     *
     * Biggy arriving WITH the pot is a delivery and not a chat, so that one case
     * falls straight through to the branch below — being told "where is my soup"
     * by the man you are handing the soup to is a worse joke than the one it
     * would replace.
     */
    if (dist(b, stephan) < TALK_REACH + b.r && !(b.kind === 'biggy' && carrying && !delivered)) {
      ctx.flash(stephanSays(), 4600);
      return true;
    }

    /*
     * THE CRAB SANDWICH. One per robot, in three voices, because the joke is what
     * each of them makes of it — and Biggy carrying the pot is working, so he gets
     * the one line that admits it.
     */
    if (dist(b, CRAB) < CRAB_REACH && !(b.kind === 'biggy' && carrying && !delivered)) {
      crabFound = true;
      ctx.flash(
        b.kind === 'voxxy'
          ? 'Voxxy: "<b>Broodje krab.</b> THE crab sandwich. People queue an hour for this and argue about it for a year. It is the size of my head."'
          : b.kind === 'droid'
            ? 'Droid: "<b>Broodje krab.</b> Bread, crab salad, and a queue with its own folklore. I have no mouth and I would still like to be asked."'
            : 'Biggy: "<b>Broodje krab.</b> One per person, it says. I am one person. I am simply a lot of it."',
        4600,
      );
      return true;
    }

    if (b.kind === 'droid') {
      if (!ladle && dist(d, shelfAt) < SHELF_REACH) {
        ladle = true;
        ctx.flash('Droid reaches the high shelf — ladle secured');
        return true;
      }
      const dc = crateInReach(d);
      if (dc) {
        ctx.flash(`Droid: "${dc.name}. Half my own mass, all of it above the knee. This one is Biggy's."`);
        return true;
      }
      // His dead end, handed back: at Biggy it becomes a grab, anywhere else the
      // stretch. "Nothing to reach here" is what the stretch says, without words.
      return false;
    }

    if (b.kind === 'biggy') {
      // The stack comes first: it is the only thing `E` can mean while he is
      // standing on the mark with a load on his back. The mark is deliberately the
      // SMALLEST place that works rather than the only one — the zone is 48x64 and
      // Biggy is 18 px across, and "you were 3 px outside the box, so there is
      // nothing to pick up here" is the worst kind of feedback: correct, useless.
      if (carriedCrates() > 0 && (inRect(bg, BEER_STACK) || dist(bg, STACK_AT) < STACK_REACH)) {
        stackCrates();
        return true;
      }
      if (!carrying && dist(bg, station) < POT_REACH) {
        if (!ladle) {
          ctx.flash('Biggy: no ladle. Droid, the shelf!');
          return true;
        }
        if (carriedCrates() > 0) {
          ctx.flash(`Biggy: "I am ${carriedCrates()} crates deep. The pot can wait, or the beer can."`);
          return true;
        }
        carrying = true;
        pickupT = ctx.t;
        ctx.flash("Biggy has the pot. Careful — it can't stop and the soup can't either.");
        return true;
      }
      if (carrying && !delivered && inRect(bg, stage)) {
        delivered = true;
        const said =
          soup > 70 ? 'Finally! Still hot.' : soup > 35 ? "Half a bowl. It's… something." : 'Is this a bowl or a hint?';
        ctx.flash(
          `Stephan: "${said}"${batches > 0 ? ` <i>(${batches === 1 ? 'the second pot' : `pot number ${batches + 1}`}, but who is counting)</i>` : ''}`,
          4000,
        );
        return true;
      }
      if (takeCrate(bg)) return true;
      if (carriedCrates() > 0) {
        ctx.flash(`Biggy: "I am not putting these down in the middle of the floor. They go to ${BAR_NAME}, by the taps."`);
        return true;
      }
      // His dead end. He cannot hop, but he can be taken hold of, and `spareE`
      // has a better line for him than this one did.
      return false;
    }

    // Voxxy: the one who talks to people.
    const q = queues.find((o) => Math.abs(v.x - o.x) < 50 && v.y < 300);
    if (q && q.open <= 0) {
      q.open = QUEUE_OPEN;
      ctx.flash(`Voxxy: "Excuse me — soup coming through!" — the ${q.label} makes way for ${QUEUE_OPEN}s`);
      return true;
    }
    const n = npcs.find((o) => dist(o, v) < TALK_REACH);
    if (n) {
      ctx.flash(`${n.name}: "${n.line}"`, 4500);
      return true;
    }
    if (!speaker.following && dist(speaker, v) < TALK_REACH) {
      speaker.following = true;
      ctx.flash('Keynote speaker: "Oh! Is it time? Lead the way."');
      return true;
    }
    const vc = crateInReach(v);
    if (vc) {
      ctx.flash(`Voxxy: "${vc.name} weighs more than I do. Considerably more. BIGGY!"`);
      return true;
    }
    // Her dead end, handed back: at Biggy it becomes a grab, anywhere else a hop.
    return false;
  }

  /* ------------------------------------------------------------------- update */

  function done(): void {
    gateOpen = true;
    ctx.removeWall(gate);
    // The barrier does not vanish, it moves: the foot of the flight is free from
    // this frame and the leaf is solid where it comes to rest. `gateSwing` is only
    // the picture.
    for (const w of gateOpenWalls) ctx.walls.push(w);
    ctx.score.soup = Math.trunc(soup);
    ctx.score.temp = Math.trunc(temp);
    ctx.score.complaints = complaints;
    ctx.score.breakfastT = Math.round(ctx.t);
    ctx.flash('Stephan unhooks the barrier and walks it back against the wall: "Soup. Speaker. Fine — the stairs are open." Up you go', 4000);
    // Watch him open it first. See `GATE_CUT_DELAY`.
    leaveAt = ctx.t + GATE_SWING_TIME + GATE_CUT_DELAY;
  }

  /** The exit: up the main staircase Stephan has just opened. */
  function leave(): void {
    /*
     * Up the flight, which climbs WEST from the gate Stephan has just opened, and
     * through the OPENING in the barrier rather than through the barrier.
     *
     * The three lanes used to be 34 px either side of the centre line, which was
     * fine across a 112 px gate and is 24 px too wide for a 44 px one. They queue
     * through the mouth and fan out once they are on the treads, where there is
     * 15.7 m of stair to fan out across.
     */
    const route = (dy: number): Vec2[] => [
      { x: stair.x + stair.w + 34, y: gateMidY + dy * 0.4 },
      { x: stair.x + stair.w - 10, y: gateMidY + dy * 0.4 },
      { x: stair.x + 24, y: gateMidY + dy },
    ];
    ctx.startCut(
      [
        { kind: 'voxxy', pts: route(-34) },
        { kind: 'droid', pts: route(0) },
        { kind: 'biggy', pts: route(34) },
      ],
      () => ctx.startChapter(4),
      VIEW_GROUND,
    );
  }

  function update(dt: number): void {
    if (gateOpen && gateSwing < 1) gateSwing = Math.min(1, gateSwing + dt / GATE_SWING_TIME);
    if (leaveAt >= 0 && ctx.t >= leaveAt) {
      leaveAt = -1;
      leave();
    }
    ctx.pushBiggy(dt);
    mg.update(dt);
    stepCrates(dt);
    ctx.stepAll(dt, (b: Bot, before: PrevVel) => {
      if (b.kind !== 'biggy' || !carrying || delivered) return;
      // A spill is caused by the *jerk*, not by speed: gliding across the hall at
      // full tilt is fine, hitting a booth at the same speed is not.
      const dv = Math.hypot(b.vx - before.vx, b.vy - before.vy);
      const sp = Math.hypot(before.vx, before.vy);
      if (dv > SPILL_DV && sp > SPILL_MIN_SPEED) spill(Math.min(25, sp / (10 * SPEED_SCALE)), 'Biggy hit something');
    });

    spawnT += dt;
    if (crowd.length < VISITORS && spawnT > SPAWN_EVERY) {
      spawnT = 0;
      spawnVisitor();
    }

    for (const a of crowd) {
      stepVisitor(a, dt);
      for (const b of ctx.bots) {
        if (b.mounted) continue;
        const hit = botsCollide(a, b, 0.2);
        if (hit && hit.rv > BOWL_OVER && !a.hitCd) {
          a.hitCd = 1.5;
          complaints++;
          if (b.kind === 'biggy' && carrying && !delivered) spill(4, 'bumped into an attendee');
          else ctx.flash(`${b.name} bowled over an attendee (${complaints})`);
        }
      }
      if (a.hitCd) a.hitCd = Math.max(0, a.hitCd - dt);
    }

    for (const q of queues) {
      q.open = Math.max(0, q.open - dt);
      for (const p of q.people) {
        const tx = q.open > 0 ? p.hx - QUEUE_STEP : p.hx;
        p.x += (tx - p.x) * Math.min(1, dt * 6);
      }
      for (const p of q.people) {
        for (const b of ctx.bots) {
          if (b.braced || b.mounted) continue;
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const dd = Math.hypot(dx, dy);
          const min = b.r + p.r;
          if (dd < min && dd > 0) {
            const nx = dx / dd;
            const ny = dy / dd;
            b.x += nx * (min - dd);
            b.y += ny * (min - dd);
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) {
              b.vx -= vn * nx * 1.2;
              b.vy -= vn * ny * 1.2;
            }
            if (b.kind === 'biggy' && !p.cd && speed(b) > 40 * SPEED_SCALE) {
              p.cd = 1;
              complaints++;
              if (carrying && !delivered) spill(4, 'bumped into the queue');
              else ctx.flash(`Biggy shoved the ${q.label} (${complaints})`);
            }
          }
        }
        if (p.cd) p.cd = Math.max(0, p.cd - dt);
      }
    }

    if (carrying && !delivered) {
      temp = Math.max(0, 100 - ((ctx.t - pickupT) / COOL_SECONDS) * 100);
      // Stone cold is a ruined batch, not a lost run — see `ruined`.
      if (temp <= 0) ruined('Stephan: "Cold. I am not drinking that, and neither is anybody else."');
    }

    /*
     * ...and the people who simply STAND there are solid too.
     *
     * Michele, with a screenshot of Voxxy inside one of them: *"voxy passes
     * though a person?"* The queues pushed back and the crowd pushed back; the
     * three you ask for directions, Stephan and the speaker did not, so the three
     * most important figures in the chapter were the ones you could walk through.
     * A speaker who is FOLLOWING is exempt — she is walking with Voxxy, and a
     * follower who shoulder-charges the robot she is following cannot keep up.
     */
    for (const b of ctx.bots) {
      for (const n of npcs) standOff(b, n);
      standOff(b, stephan);
      if (!speaker.following) standOff(b, speaker);
    }

    if (speaker.following && !speaker.onStage) {
      const v = ctx.byKind('voxxy');
      // Follow Voxxy, unless Voxxy is already on the spot — then head for the spot,
      // so the speaker settles next to Stephan instead of orbiting the robot.
      const tgt = inRect(v, stage) ? { x: stage.x + 30, y: stage.y + 30 } : { x: v.x, y: v.y };
      const dx = tgt.x - speaker.x;
      const dy = tgt.y - speaker.y;
      const dd = Math.hypot(dx, dy);
      if (dd > 22) {
        speaker.x += (dx / dd) * SPEAKER_WALK * dt;
        speaker.y += (dy / dd) * SPEAKER_WALK * dt;
        for (const w of ctx.walls) {
          if (w.low) continue;
          const hit = circleRect(speaker, w);
          if (hit) {
            speaker.x += hit.nx * hit.pen;
            speaker.y += hit.ny * hit.pen;
          }
        }
      }
      if (inRect(speaker, stage)) {
        speaker.onStage = true;
        ctx.flash('Keynote speaker: "Stephan! Sorry — the queues."');
      }
    }

    if (delivered && speaker.onStage && beerDone && !gateOpen) done();
  }

  /* --------------------------------------------------------- snapshot payload */

  function props(): Prop[] {
    const bg = ctx.byKind('biggy');
    const out: Prop[] = [
      {
        kind: 'soup-station',
        x: station.x,
        y: station.y,
        w: 22,
        h: 22,
        state: carrying ? 'done' : 'idle',
        label: 'TOMATO SOUP',
      },
      {
        kind: 'ladle',
        ...GF.food.shelf,
        state: ladle ? 'done' : 'idle',
        label: ladle ? 'shelf' : 'ladle (high)',
      },
      { kind: 'dropzone', ...stage, state: delivered ? 'done' : 'idle', label: 'bring the soup here' },
      /*
       * The crab sandwich on the counter, under its own sign. Lit before it is
       * found, because the whole point of it is that you notice it and go and
       * look — it asks nothing and gives a line (`crabFound`).
       */
      {
        kind: 'crab',
        x: CRAB.x - 8,
        y: CRAB.y - 5,
        w: 16,
        h: 10,
        state: crabFound ? 'done' : 'active',
        label: crabFound ? 'broodje krab — the famous one' : 'broodje krab (E)',
      },
      /*
       * The gate is emitted whatever state it is in, and it carries the sim's own
       * swing clock. `src/render/doors.ts` poses the leaf from that clock and from
       * the chapter's LIVE wall list, so a barrier is only ever drawn across the
       * stair foot while the sim has something solid there.
       */
      { kind: 'gate', ...GF.gate, state: gateOpen ? 'open' : 'shut', progress: gateSwing, label: 'main staircase' },
      /*
       * THE BAR, and the three things that make it read as one.
       *
       * The counter is the `low` wall pushed in `setup` — this is its visual, at
       * the same rect, the way `GF.gate` is a wall and a prop. The taps stand on
       * it and the glassware is set out beside them, which is Michele's own list
       * of what "the place beer goes" looks like: *"(glowing halo, taps ready,
       * belgian beer glassess)"*. Centre coordinates, not top-left, so a renderer
       * that has not been taught these kinds yet still puts them in the right
       * place.
       */
      {
        kind: 'bar-counter',
        x: BAR.x + BAR.w / 2,
        y: BAR.y + BAR.h / 2,
        w: BAR.w,
        h: BAR.h,
        state: beerDone ? 'done' : 'active',
        label: `${BAR_NAME} — the bar for tonight`,
      },
      // The mark reads exactly like the soup's, because it is the same promise:
      // put the thing you are carrying down HERE. The plate stays idle until it is
      // done, and the HALO round it is what says "you can use this" — one signal
      // for that job is worth more than two.
      { kind: 'dropzone', ...BEER_STACK, state: beerDone ? 'done' : 'idle', label: 'hand the beer crates over the bar here' },
      // The bar's own sign, on the hall wall behind the taps.
      {
        kind: 'sign',
        x: BAR.x + BAR.w / 2,
        y: GF.hall.y + 2,
        w: 60,
        h: 8,
        state: beerDone ? 'done' : 'active',
        label: `${BAR_NAME} · taps ready · doors 18:00`,
      },
      // Devoxx's own line, on a Devoxx-blue sign, standing at the pallet: it is
      // printed on the shrink-wrap, so it belongs where the shrink-wrap is.
      {
        kind: 'sign',
        x: PALLET.x,
        y: PALLET.y - 30,
        w: 60,
        h: 8,
        state: beerDone ? 'done' : 'active',
        label: 'Belgian beers may cause hangovers and OutOfMemoryErrors',
      },
    ];
    for (const t of TAPS) {
      out.push({ kind: 'beer-tap', x: t.x, y: t.y, w: 3, h: 3, state: beerDone ? 'done' : 'active', label: 'tap' });
    }
    GLASSES.forEach((gl, k) => {
      out.push({
        kind: 'beer-glass',
        x: gl.x,
        y: gl.y,
        w: 3,
        h: 3,
        // Belgian glassware is a different shape per beer — a tulip, a goblet, a
        // flute, a chalice. `v` is which, so a renderer can turn four numbers into
        // four silhouettes without the sim knowing what a goblet looks like.
        v: k,
        state: beerDone ? 'done' : 'active',
        label: 'Belgian glassware',
      });
    });
    // The halos: where the crates are, where they go, and where the soup goes.
    // One ring, three jobs — see `halo` above.
    if (held('loose').length > 0 && !beerDone) out.push(...halo(PALLET_MARK, 'active'));
    out.push(...halo(BEER_STACK, beerDone ? 'done' : 'active'));
    out.push(...halo(stage, delivered ? 'done' : 'active'));
    // Crates: on the floor where they lie, on the stack in layers, or piled on
    // Biggy's back in the order he picked them up.
    for (const c of crates) {
      if (c.held === 'carried') continue;
      out.push({
        kind: 'crate',
        x: c.x,
        y: c.y,
        w: c.r * 2,
        h: c.r * 2,
        v: c.layer,
        state: c.held === 'stacked' ? 'done' : 'idle',
        label: `beer crate \u00b7 ${c.name}`,
      });
    }
    held('carried').forEach((c, k) => {
      out.push({
        kind: 'crate',
        x: bg.x,
        y: bg.y,
        w: c.r * 2,
        h: c.r * 2,
        v: k + 1,
        state: k + 1 >= CRATE_STACK_LIMIT - 1 ? 'broken' : 'active',
        label: `beer crate \u00b7 ${c.name}`,
      });
    });
    if (carrying && !delivered) {
      // The pot rides on Biggy's shoulder; `v` carries what each meter needs.
      out.push({ kind: 'pot', x: bg.x, y: bg.y - bg.r - 8, w: 20, h: 20, v: temp / 100, state: 'active', label: 'tomato soup · temperature' });
      out.push({ kind: 'soup', x: bg.x, y: bg.y - bg.r - 8, w: 16, h: 16, v: soup / 100, state: 'active', label: 'soup in the pot' });
    }
    for (const q of queues) {
      out.push({
        kind: 'sign',
        x: q.x,
        y: GF.food.court.y + GF.food.court.h + 14,
        w: 60,
        h: 10,
        state: q.open > 0 ? 'active' : 'idle',
        label: q.label + (q.open > 0 ? ' — making way' : ''),
      });
    }
    return out.concat(mg.props());
  }

  function people(): Person[] {
    const out: Person[] = [];
    for (const a of crowd) out.push({ x: a.x, y: a.y, r: a.r, colour: a.colour, role: 'visitor' });
    for (const q of queues) {
      for (const p of q.people) out.push({ x: p.x, y: p.y, r: p.r, colour: p.colour, role: 'queue', tx: p.hx });
    }
    for (const n of npcs) out.push({ x: n.x, y: n.y, r: n.r, name: n.name, colour: '#d9c3a5', role: 'staff' });
    out.push({ x: stephan.x, y: stephan.y, r: stephan.r, name: 'Stephan', colour: '#e8d5b5', hat: true, role: 'stephan' });
    // The speaker is only drawn once Voxxy is close enough to have spotted them.
    if (speaker.following || dist(ctx.byKind('voxxy'), speaker) < 90) {
      out.push({
        x: speaker.x,
        y: speaker.y,
        r: speaker.r,
        name: 'keynote speaker (TBA)',
        colour: '#f0e0c0',
        role: 'speaker',
      });
    }
    return out;
  }

  /** The live bottom-of-screen line: Stephan's two conditions, plus the pot's state. */
  function progress(): string {
    if (gateOpen) return 'Stephan opens the main staircase · up to the Devoxx rooms';
    const n = carriedCrates();
    /*
     * The heap, spelled out. Michele's note on this beat: the crate count, the
     * mass penalty and how close he is to the limit belong on the HUD, because
     * "the punchline is only funny if the player could see it coming".
     */
    const load =
      n > 0
        ? ` (×${(crateLoadMass(n) / crateLoadMass(0)).toFixed(2)} mass, −${Math.round((1 - crateLoadAccel(n) / crateLoadAccel(0)) * 100)}% accel)`
        : '';
    const beer = beerDone
      ? `beer ✓ (${BAR_NAME} is stocked)`
      : `beer ${held('stacked').length}/${CRATE_DELIVERY} to ${BAR_NAME} · heap ${n}/${CRATE_STACK_LIMIT}${load}`;
    const soupLine = delivered
      ? 'soup ✓'
      : carrying
        ? `soup: carrying the pot · ${Math.round(soup)}% left at ${Math.round(temp)}°`
        : ladle
          ? `soup: ladle in hand — ${batches > 0 ? 'fill it again' : 'fill the pot'} at the counter`
          : 'soup: the ladle is on the high shelf (Droid)';
    const spk = speaker.onStage
      ? 'speaker ✓'
      : speaker.following
        ? 'speaker: following you to Stephan'
        : 'speaker: hiding behind a built booth (Voxxy, E)';
    const w = mg.won();
    // Optional, so it never leads and never reads like a task: last, and only once
    // the player has actually won something.
    const sw = w > 0 ? ` · swag ${w}/3` : '';
    return `${beer} · ${soupLine} · ${spk}${sw}`;
  }

  /* ------------------------------------------------------------------- tasks
   *
   * WHERE TO STAND, rather than where the thing sits: the ladle is on a shelf and
   * the pot is on a counter, and both of those are furniture with a collider on
   * it. Each address below is floor, inside the reach the chapter already enforces
   * for that prop, so walking to the arrow is walking to the job.
   */
  /** Under the high shelf, inside `SHELF_REACH`. */
  const shelfStand: Vec2 = { x: shelfAt.x, y: shelfAt.y + 26 };
  /** In front of the soup counter, inside `POT_REACH`. */
  const soupStand: Vec2 = { x: station.x, y: food.soup.y + food.soup.h + 22 };
  /** The spot in front of Stephan the soup and the speaker both have to reach. */
  const stageAt: Vec2 = { x: stage.x + stage.w / 2, y: stage.y + stage.h / 2 };
  /** Stephan's own feet, at the foot of the flight he is not opening yet. */
  const stephanAt: Vec2 = { x: stephan.x, y: stephan.y + 14 };

  /**
   * The same state as `progress()`, as a list — the one source behind the HUD's
   * meter, the panel's checklist and every hint (`Task` in `src/sim/types.ts`).
   *
   * Five things, in the order the briefing puts them: soup, speaker, beer, and
   * then the staircase all three of them are for. The ladle is a row of its own
   * rather than a step inside the soup, because it is a different robot in a
   * different place — one `who` cannot say "Droid, over there" and "Biggy, over
   * here" at the same time, and the player who is stuck on the soup is almost
   * always stuck on the ladle.
   *
   * **The booth games are not in here.** Three bits of swag are winnable and every
   * one of them is optional (`OBJECTIVE`, and `progress()` refuses to let them
   * lead), so counting them in a meter would tell the player the chapter is 3/8
   * done when they have in fact done everything that is asked of them. They stay
   * where they are: last in the progress line, and only once something has been won.
   */
  function tasks(): Task[] {
    return [
      {
        id: 'ladle',
        text: 'fetch the ladle off the high shelf',
        done: ladle,
        who: ['droid'],
        at: shelfStand,
        hint: 'Droid: top shelf in the catering block, and nobody fills a pot without it. Voxxy cannot see over that shelf and Biggy cannot get an arm into it',
      },
      {
        id: 'soup',
        text: 'take Stephan his tomato soup',
        done: delivered,
        who: ['biggy'],
        at: carrying && !delivered ? stageAt : soupStand,
        hint: carrying
          ? 'Biggy: it goes cold while I walk and it comes out of the pot every time I hit something. Smooth lines — and let Voxxy open a queue before I am standing in it'
          : batches > 0
            ? 'Biggy: back to the counter. They have a vat of it and there are three thousand people here — nobody is going to miss another pot'
            : 'Biggy: the pot is on the counter in the catering court, and I am not filling it with my hands. Ladle first',
      },
      {
        id: 'speaker',
        text: 'find the keynote speaker and walk them to Stephan',
        done: speaker.onStage,
        who: ['voxxy'],
        /*
         * NO ARROW WHILE THEY ARE STILL HIDING.
         *
         * Which booth the speaker is behind is this errand's answer — the chapter
         * picks it per run and does not even publish the person until Voxxy is
         * close enough to have spotted them (`people()`). An arrow to it would
         * hand over the search; once they are following her, where they have to
         * END UP is not a secret at all.
         */
        at: speaker.following ? stageAt : undefined,
        hint: 'Voxxy: they are hiding from the queues behind one of the booths with WALLS — you can see straight under the cloth tables, so it is none of those',
      },
      {
        id: 'beer',
        text: `stack tonight’s beer delivery at ${BAR_NAME}`,
        done: beerDone,
        who: ['biggy'],
        at: STACK_AT,
        n: held('stacked').length,
        of: CRATE_DELIVERY,
        hint: 'Biggy: they are mine alone, and there are only so many of them I can hold. When the last safe one goes on, take that load to the lit mark by the taps before trying for another',
      },
      {
        id: 'stairs',
        text: 'get Stephan to open the main staircase',
        done: gateOpen,
        at: stephanAt,
        hint: 'Voxxy: he is at the foot of the flight with his arms crossed and he is counting. Soup, speaker, beer — all three, and then he unhooks it himself',
      },
    ];
  }

  return {
    key,
    update,
    props,
    people,
    progress,
    tasks,
    /**
     * `crate` moves the first crate still on the floor; `crate3` moves that one
     * whatever state it is in, which is how a test takes a load off Biggy without
     * a heap error. Anything else is the minigames' (the shuffleboard duck).
     */
    placeProp: (kind: string, x: number, y: number): boolean => {
      const mm = /^crate(\d*)$/.exec(kind);
      if (!mm) return mg.place(kind, x, y);
      const c = mm[1] ? crates[Number(mm[1])] : held('loose')[0];
      if (!c) return false;
      c.held = 'loose';
      c.layer = 0;
      c.x = x;
      c.y = y;
      c.vx = 0;
      c.vy = 0;
      reload();
      return true;
    },
    state: (): BreakfastState => ({
      chapter: 3,
      ladle,
      carrying,
      delivered,
      batches,
      crabFound,
      soup,
      temp,
      complaints,
      speaker: { following: speaker.following, onStage: speaker.onStage, booth: hideBooth.name },
      queues: queues.map((q) => ({ label: q.label, open: q.open })),
      gateOpen,
      gateSwing,
      crowd: crowd.length,
      beer: {
        loose: held('loose').map((c) => ({ i: c.i, x: c.x, y: c.y })),
        carried: carriedCrates(),
        stacked: held('stacked').length,
        total: CRATE_DELIVERY,
        limit: CRATE_STACK_LIMIT,
        oom,
        done: beerDone,
      },
      minigames: mg.state(),
    }),
  };
}

export const ch3Breakfast: ChapterDef = { n: 3, title: '3 · Breakfast — doors open', setup };
