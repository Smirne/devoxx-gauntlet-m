/**
 * Chapter 3 — LUNCH. The entrance is open, three thousand people are inside, and
 * Stephan is standing in front of the main staircase with his arms crossed.
 *
 * Ported from the prototype's `setupLunch` / `lunchKey` / `lunchUpdate` / `lunchDone`
 * (`reference/poc/10-after-dark-kinepolis.html`). He wants two things before he opens
 * the rooms: his tomato soup, and the keynote speaker (still "TBA", still hiding from
 * the queues behind a built booth). Both need all three robots:
 *
 *   Droid — the ladle is on the high shelf.
 *   Biggy — carries the pot. He cannot stop quickly, every bump spills, and the soup
 *           goes cold on a timer, so the heavy robot has to be driven gently.
 *   Voxxy — clears a catering queue for five seconds, and finds the speaker.
 *
 * The crowd is not decoration: thirty-six visitors walk the hall's lane grid, and
 * shoving them costs complaints on the final card.
 */

import { SPEED_SCALE, TRAVEL_TIME_SCALE } from '../constants';
import { GF, VIEW_GROUND, groundWalls } from '../geometry';
import { botsCollide, circleRect, dist, inRect, speed } from '../bot';
import type { Bot, Person, Prop, Vec2, Wall } from '../types';
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

export interface LunchState {
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
  minigames: MinigameState;
}

const OBJECTIVE =
  'Chapter 3 · <b>Lunch</b>. The main entrance is open and 3,000 people walk in. <b>Stephan</b> stands ' +
  'at the main staircase and wants his <b>tomato soup</b> and the <b>keynote speaker</b> before he opens ' +
  'it. Droid: the ladle is on the high shelf. Biggy: carry the pot (bumps spill it, and it cools). ' +
  'Voxxy: clear a catering queue (E), find the speaker at a built booth. Booth games still count as swag.';
const KEYS = '1/2/3/Tab: switch · WASD · E: use / ask / clear a queue · R: restart';

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
        ? 'Stephan, to Voxxy: "Fast little thing. Still no. Soup first, then my keynote speaker, then the stairs."'
        : b.kind === 'droid'
          ? 'Stephan, to Droid: "You can see over the gate, I know. Nobody goes up until I have soup and a speaker."'
          : 'Stephan, to Biggy: "Do not. The rooms open when I say so, and I say nothing before my soup."',
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
    const v = mkBody('attendee', e.x, e.y + 8 + lane * (e.h - 16), { r: 5, mass: 0.5 }) as Visitor;
    v.walk = (60 + ctx.rng() * 40) * SPEED_SCALE;
    v.colour = VISITOR_COLOURS[Math.floor(ctx.rng() * 4)];
    v.dwell = 0;
    v.hitCd = 0;
    v.route = [
      { x: e.x - 40, y: e.y + 16 + lane * (e.h - 32) },
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
    "<b>Power, network, badges.</b> The main entrance opens… and it's already lunchtime." +
      '<small>Press any key</small>',
  );

  /* --------------------------------------------------------------------- keys */

  function key(code: string): void {
    if (code === 'KeyP' && !gateOpen) { done(); return; }
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
      ctx.flash('Droid: nothing to reach here');
      return;
    }

    if (b.kind === 'biggy') {
      if (!carrying && dist(bg, station) < POT_REACH) {
        if (!ladle) {
          ctx.flash('Biggy: no ladle. Droid, the shelf!');
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
    ctx.flash('Voxxy: nobody to talk to here');
  }

  /* ------------------------------------------------------------------- update */

  function done(): void {
    gateOpen = true;
    ctx.removeWall(gate);
    ctx.score.soup = Math.trunc(soup);
    ctx.score.temp = Math.trunc(temp);
    ctx.score.complaints = complaints;
    ctx.score.lunchT = Math.round(ctx.t);
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

    if (delivered && speaker.onStage && !gateOpen) done();
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
    ];
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
    return `${soupLine} · ${spk}`;
  }

  return {
    key,
    update,
    props,
    people,
    progress,
    placeProp: (kind: string, x: number, y: number): boolean => mg.place(kind, x, y),
    state: (): LunchState => ({
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
      minigames: mg.state(),
    }),
  };
}

export const ch3Lunch: ChapterDef = { n: 3, title: '3 · Lunch — doors open', setup };
