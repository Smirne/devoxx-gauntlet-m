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
 * ## The beer delivery, and the OutOfMemoryError
 *
 * `docs/gameplay-additions.md` §3, and the last of its three calls to be approved:
 * Michele held it until he could play it, then said *"OutOfMemory, yes build it."*
 *
 * The crates arrive at eight in the morning for tonight — which is when a brewery
 * actually delivers, and which is funnier at breakfast than at lunch: nobody is
 * drinking, the pallet is simply standing in the way of three thousand people, and
 * the shrink-wrap label still carries Devoxx's own line about hangovers and
 * OutOfMemoryErrors. Biggy stacks them by the catering block. Every crate he picks
 * up adds mass and takes acceleration (`src/sim/crates.ts`), so a bigger load means
 * fewer trips and worse handling; the crate past `CRATE_STACK_LIMIT` throws a heap
 * error, he drops the lot, and the load becomes six bodies he has to shove out of
 * his own way. The optimal line is one crate under the limit, and greed is punished
 * by physics rather than by a rule — which is how the rest of this game works.
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
  crateLoadAccel,
  crateLoadMass,
  loadBiggy,
} from '../crates';
import { GF, VIEW_GROUND, entranceBayGaps, groundWalls } from '../geometry';
import { botsCollide, circleRect, dist, inRect, speed, stepBot } from '../bot';
import type { Bot, Person, Prop, Rect, Vec2, Wall } from '../types';
import { mkBody, setupMinigames, type MinigameState, type Minigames } from './ch2-expo';
import type { ChapterCtx, ChapterDef, ChapterRuntime, PrevVel } from './index';

/* ---------------------------------------------------------------- reach and pacing */

const SHELF_REACH = 45;
const POT_REACH = 70;
const TALK_REACH = 40;
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
/**
 * Where they are supposed to end up: against the catering block's east wall, out of
 * the walking lanes and next to the counters they will be served from tonight.
 * Biggy (r 9) stands inside this rect to put a load down.
 */
const BEER_STACK: Rect = { x: 346, y: 112, w: 48, h: 64 };
/** How close a robot has to get to the pallet to read what is printed on the wrap. */
const LABEL_REACH = 90;
/** The middle of the stack zone, and how close to it counts as "on the mark". */
const STACK_AT: Vec2 = { x: BEER_STACK.x + BEER_STACK.w / 2, y: BEER_STACK.y + BEER_STACK.h / 2 };
/**
 * 44 px, against the 48x64 zone's own 40 px half-diagonal: the marked square is
 * the *smallest* place `E` works, not the only one. A player who has walked up to
 * the mark and is a body-width off one corner still puts the crates down.
 */
const STACK_REACH = 44;
/** Crates per layer on the finished stack, and the footprint they are set out on. */
const STACK_WIDE = 3;
const STACK_STEP = 12;

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
 * A beer crate: a body, not a robot. `mkBody` (ch2) is the same thing the
 * shuffleboard duck and the cake crate are built from.
 */
interface Crate extends Bot {
  /** Stable index for the whole chapter — the debug seam names crates by it. */
  i: number;
  /** On the floor and physical, on Biggy's back, or stacked and finished. */
  held: 'loose' | 'carried' | 'stacked';
  /** Which layer of the finished stack it is in, so the renderer can pile them up. */
  layer: number;
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

export interface BreakfastState {
  chapter: 3;
  ladle: boolean;
  carrying: boolean;
  delivered: boolean;
  /** Percent left in the pot. */
  soup: number;
  /** Percent of the original heat. */
  temp: number;
  complaints: number;
  speaker: { following: boolean; onStage: boolean; booth: string };
  queues: Array<{ label: string; open: number }>;
  gateOpen: boolean;
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
  'yes — the <b>keynote speaker</b>, and <b>tonight\'s beer delivery</b> out of the aisle. Droid: the ladle ' +
  'is on the high shelf. Biggy: carry the pot (bumps spill it, and it cools), and stack the crates — he is ' +
  'the only one who can lift one, and only so many at a time. Voxxy: clear a catering queue (E), find the ' +
  'speaker at a built booth. Booth games still count as swag.';
const KEYS = '1/2/3/Tab: switch · WASD · E: use / lift a crate / ask / clear a queue · Space: tow Biggy · R: restart';

function setup(ctx: ChapterCtx): ChapterRuntime {
  ctx.setFloor('down');
  ctx.setView(VIEW_GROUND);
  ctx.setWalls(groundWalls());
  ctx.place([600, 215], [630, 215], [660, 215]);

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

  const mg: Minigames = setupMinigames(ctx);

  const food = GF.food;
  const station: Vec2 = { x: food.soup.x + 45, y: food.soup.y + 15 };
  const shelfAt: Vec2 = { x: food.shelf.x + 11, y: food.shelf.y + 8 };
  let ladle = false;
  let carrying = false;
  let delivered = false;
  let soup = 100;
  let temp = 100;
  let pickupT = 0;
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
   * Both sit SOUTH of the main staircase, because that is the only side of it
   * anyone can reach: the wardrobe and the reception desk close its west flank
   * (`src/sim/geometry.ts`), and `GF.gate` — the gate he is standing at — closes
   * the foot of the flight. Arrivals come in through the left-hand doors and walk
   * straight past reception into him, which is the queue Devoxx actually has.
   */
  const stair = GF.mainStair;
  const stephan = { x: stair.x + stair.w / 2, y: stair.y + stair.h + 26, r: 8 };
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
    const c = mkBody(`beer crate ${i + 1}`, PALLET.x + ((i % 3) - 1) * 13, PALLET.y + (i < 3 ? -8 : 8), {
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

  /** Where the k-th crate lands on the finished stack: three wide, then a layer up. */
  const stackSlot = (k: number): { x: number; y: number; layer: number } => ({
    x: BEER_STACK.x + 12 + (k % STACK_WIDE) * STACK_STEP,
    y: BEER_STACK.y + BEER_STACK.h / 2,
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
      ctx.flash(`Biggy: "${n}. That is the stack. I can feel it in the knees."`, 3200);
    } else {
      ctx.flash(`Biggy takes a crate \u2014 ${n} up, ${held('loose').length} still on the floor`);
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
        `Biggy: "${CRATE_DELIVERY} crates stacked, ${oom} heap error${oom === 1 ? '' : 's'}. The aisle is yours, Stephan."`,
        4000,
      );
    } else {
      ctx.flash(`Biggy sets ${load.length} down \u2014 ${done}/${CRATE_DELIVERY} stacked`);
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
      if (c.held === 'stacked') continue;
      // A crate at rest has nothing to integrate and no wall to resolve: it got
      // there by being resolved already. Only a crate somebody has shoved pays
      // for `stepBot`, which walks the whole ground-floor wall list.
      if (c.vx !== 0 || c.vy !== 0) stepBot(c, dt, ctx.walls);
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
            'morning, for tonight.',
          5000,
        );
        break;
      }
    }
  }

  /* ----------------------------------------------------------------- the soup */

  function spill(amount: number, why: string): void {
    if (!carrying || delivered) return;
    soup = Math.max(0, soup - amount);
    ctx.flash(`Splash — ${why} (${Math.trunc(soup)}% left)`);
    if (soup <= 0) ctx.fail('The pot is empty. Stephan gets a napkin.<small>R to try again · or Skip chapter</small>');
  }

  ctx.objective(OBJECTIVE, KEYS);
  ctx.card(
    "<b>Power, network, badges.</b> The main entrance opens… and the queue for breakfast is already out of the door." +
      '<small>Press any key</small>',
  );

  /* --------------------------------------------------------------------- keys */

  function key(code: string): void {
    const b = ctx.bots[ctx.cur];
    const d = ctx.byKind('droid');
    const bg = ctx.byKind('biggy');
    const v = ctx.byKind('voxxy');
    ctx.switchKey(code);
    if (code !== 'KeyE') return;
    if (mg.key(code, b)) return;

    if (b.kind === 'droid') {
      if (!ladle && dist(d, shelfAt) < SHELF_REACH) {
        ladle = true;
        ctx.flash('Droid reaches the high shelf — ladle secured');
        return;
      }
      if (crateInReach(d)) {
        ctx.flash('Droid: "Half my own mass, all of it above the knee. This one is Biggy\'s."');
        return;
      }
      ctx.flash('Droid: nothing to reach here');
      return;
    }

    if (b.kind === 'biggy') {
      // The stack comes first: it is the only thing `E` can mean while he is
      // standing on the mark with a load on his back. The mark is deliberately the
      // SMALLEST place that works rather than the only one — the zone is 48x64 and
      // Biggy is 18 px across, and "you were 3 px outside the box, so there is
      // nothing to pick up here" is the worst kind of feedback: correct, useless.
      if (carriedCrates() > 0 && (inRect(bg, BEER_STACK) || dist(bg, STACK_AT) < STACK_REACH)) {
        stackCrates();
        return;
      }
      if (!carrying && dist(bg, station) < POT_REACH) {
        if (!ladle) {
          ctx.flash('Biggy: no ladle. Droid, the shelf!');
          return;
        }
        if (carriedCrates() > 0) {
          ctx.flash(`Biggy: "I am ${carriedCrates()} crates deep. The pot can wait, or the beer can."`);
          return;
        }
        carrying = true;
        pickupT = ctx.t;
        ctx.flash("Biggy has the pot. Careful — it can't stop and the soup can't either.");
        return;
      }
      if (carrying && !delivered && inRect(bg, stage)) {
        delivered = true;
        ctx.flash(
          `Stephan: "${soup > 70 ? 'Finally! Still hot.' : soup > 35 ? "Half a bowl. It's… something." : 'Is this a bowl or a hint?'}"`,
          4000,
        );
        return;
      }
      if (takeCrate(bg)) return;
      if (carriedCrates() > 0) {
        ctx.flash('Biggy: "I am not putting these down in the middle of the floor. They go by the counters."');
        return;
      }
      ctx.flash('Biggy: nothing to pick up here');
      return;
    }

    // Voxxy: the one who talks to people.
    const q = queues.find((o) => Math.abs(v.x - o.x) < 50 && v.y < 300);
    if (q && q.open <= 0) {
      q.open = QUEUE_OPEN;
      ctx.flash(`Voxxy: "Excuse me — soup coming through!" — the ${q.label} makes way for ${QUEUE_OPEN}s`);
      return;
    }
    const n = npcs.find((o) => dist(o, v) < TALK_REACH);
    if (n) {
      ctx.flash(`${n.name}: "${n.line}"`, 4500);
      return;
    }
    if (!speaker.following && dist(speaker, v) < TALK_REACH) {
      speaker.following = true;
      ctx.flash('Keynote speaker: "Oh! Is it time? Lead the way."');
      return;
    }
    if (crateInReach(v)) {
      ctx.flash('Voxxy: "It weighs more than I do. Considerably more. BIGGY!"');
      return;
    }
    ctx.flash('Voxxy: nobody to talk to here');
  }

  /* ------------------------------------------------------------------- update */

  function done(): void {
    gateOpen = true;
    ctx.removeWall(gate);
    ctx.score.soup = Math.trunc(soup);
    ctx.score.temp = Math.trunc(temp);
    ctx.score.complaints = complaints;
    ctx.score.breakfastT = Math.round(ctx.t);
    ctx.flash('Stephan: "Soup. Speaker. Fine — open the stairs." Up the main staircase', 4000);
    // Up the flight, which climbs NORTH from the gate Stephan has just opened.
    const route = (dx: number): Vec2[] => [
      { x: stair.x + stair.w / 2 + dx, y: stair.y + stair.h + 34 },
      { x: stair.x + stair.w / 2 + dx, y: stair.y + stair.h - 40 },
      { x: stair.x + stair.w / 2 + dx, y: stair.y + 24 },
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
      if (temp <= 0) {
        ctx.fail(
          'Stone cold. Stephan drinks it anyway, out of politeness.<small>R to try again · or Skip chapter</small>',
        );
      }
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
      { kind: 'gate', ...GF.gate, state: gateOpen ? 'open' : 'shut', label: 'main staircase' },
      // The stack zone reads exactly like the soup's drop mark, because it is the
      // same promise: put the thing you are carrying down HERE.
      { kind: 'dropzone', ...BEER_STACK, state: beerDone ? 'done' : 'idle', label: 'stack the beer crates here' },
      // Devoxx's own line, on a Devoxx-blue sign, flat against the catering block
      // above the stack so nobody has to walk through it to read it.
      {
        kind: 'sign',
        x: BEER_STACK.x - 6,
        y: GF.hall.y + 6,
        w: 60,
        h: 8,
        state: beerDone ? 'done' : 'active',
        label: 'Belgian beers may cause hangovers and OutOfMemoryErrors',
      },
    ];
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
        label: 'beer crate',
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
        label: 'beer crate',
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
      ? 'beer ✓'
      : `beer ${held('stacked').length}/${CRATE_DELIVERY} · heap ${n}/${CRATE_STACK_LIMIT}${load}`;
    const soupLine = delivered
      ? 'soup ✓'
      : carrying
        ? `soup: carrying the pot · ${Math.round(soup)}% left at ${Math.round(temp)}°`
        : ladle
          ? 'soup: ladle in hand — fill the pot at the counter'
          : 'soup: the ladle is on the high shelf (Droid)';
    const spk = speaker.onStage
      ? 'speaker ✓'
      : speaker.following
        ? 'speaker: following you to Stephan'
        : 'speaker: hiding behind a built booth (Voxxy, E)';
    return `${beer} · ${soupLine} · ${spk}`;
  }

  return {
    key,
    update,
    props,
    people,
    progress,
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
      soup,
      temp,
      complaints,
      speaker: { following: speaker.following, onStage: speaker.onStage, booth: hideBooth.name },
      queues: queues.map((q) => ({ label: q.label, open: q.open })),
      gateOpen,
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
