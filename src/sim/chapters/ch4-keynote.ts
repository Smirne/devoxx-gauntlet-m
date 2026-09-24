/**
 * Chapter 4 — KEYNOTE. Room 8, and 746 people coming up the main staircase behind you.
 *
 * Ported from the prototype's `setupKeynote` / `keynoteKey` / `keynoteUpdate`
 * (`reference/poc/10-after-dark-kinepolis.html`). Room 8 is on the top row of the
 * plan, so the stage is at the *top* of the room and the door is on the corridor
 * below it, with two aisles and three seat blocks between the two — which is why the
 * cake has to be shoved up an aisle rather than straight at the stage.
 *
 *   Biggy — pushes the cake crate onto its mark. He is the only one heavy enough.
 *   Droid — hangs the banner: E at one hook, E at the other, right across the room.
 *   Voxxy — lights the four spotlights in order, which needs the fast robot.
 *
 * The clock is the crowd: the first attendees arrive after `HEAD` seconds and fill
 * the room over `ARRIVAL`. Miss it and the keynote starts with a half-built stage.
 */

import { CY0, CY1, F1, R, VIEW_DEVOXX, floor1Walls, roomDoor } from '../geometry';
import { PUSH_LEAN_MIN, SPEED_SCALE, TRAVEL_TIME_SCALE } from '../constants';
import { botsCollide, circleRect, dist, inRect, mkBody, speed, stepBot } from '../bot';
import type { Bot, Person, Prop, Rect, Task, Vec2 } from '../types';

import type { ChapterCtx, ChapterDef, ChapterRuntime } from './index';

/**
 * Seconds before the first attendee reaches the top of the stairs.
 *
 * The crowd clock is the chapter's only real difficulty, and what it is measured
 * against is how far three robots can walk before it runs out. Room 8 did not
 * shrink when they slowed down, so both halves of the clock carry
 * `TRAVEL_TIME_SCALE` (constants.ts, the 2026-09-23 rescale) and the race is the
 * same race.
 */
const HEAD = 14 * TRAVEL_TIME_SCALE;
/** Seconds for the room to fill once they start arriving. */
const ARRIVAL = 80 * TRAVEL_TIME_SCALE;
/** How close Droid must be to a banner hook. */
const HOOK_REACH = 45;
/** How close Voxxy must pass a spotlight to switch it on. */
const SPOT_REACH = 22;
/**
 * Biggy's shove on the crate, px/s^2 — a crate is not a robot, it just slides.
 *
 * An acceleration is a velocity per second, and the rescale moved the velocity axis
 * and left the time axis alone, so it carries `SPEED_SCALE` like every speed does.
 */
const CRATE_FORCE = 900 * SPEED_SCALE;
/** Closing speed above which a robot has knocked an attendee over. px/s. */
const BOWL_OVER = 120 * SPEED_SCALE;
/** The crate has to be actually moving to be blamed for shoving someone. px/s. */
const CRATE_BLAME_SPEED = 25 * SPEED_SCALE;

const ATTENDEE_COLOURS = ['#b9a58c', '#8c9bb9', '#b98c8c', '#9bb98c'] as const;

interface Seat {
  x: number;
  y: number;
  taken: boolean;
  order: number;
}

/**
 * An attendee walking in and finding a seat. A `Bot` only so `botsCollide` can
 * resolve robot-against-person contacts with the same impulse the robots use; its
 * own movement is hand-integrated along the five legs below, like the prototype's.
 */
interface Attendee extends Bot {
  walk: number;
  colour: string;
  seat: Seat;
  /** 0 corridor → 1 doorway → 2 back of the room → 3 aisle → 4 row → seated. */
  leg: number;
  aisleX: number;
  seated: boolean;
  hitCd: number;
}

export interface KeynoteState {
  chapter: 4;
  cake: boolean;
  hooks: number;
  spots: number;
  /** Which spotlight is next, 1..4. */
  nextSpot: number;
  ready: boolean;
  seated: number;
  crowd: number;
  complaints: number;
  /** Seconds of slack left when the stage was finished. */
  spare: number;
}

const KEYS = '1/2/3/Tab: switch · WASD · E: use / hold Biggy / Voxxy jumps · R: restart';
const READY_OBJECTIVE =
  'Chapter 4 · <b>Keynote</b>. Stage ready. <b>Get all three robots on the stage</b> — Stephan and the speaker are waiting.';

function setup(ctx: ChapterCtx): ChapterRuntime {
  ctx.setFloor('up');
  ctx.setView(VIEW_DEVOXX);
  ctx.setWalls(floor1Walls());
  const stair = F1.mainStair;
  ctx.place([stair.x - 30, 330], [stair.x - 30, 356], [stair.x - 24, 380]);

  // The cinema section is closed to the public again, and sealed off the same way.
  ctx.walls.push({
    x: F1.fireX,
    y: CY0,
    w: 14,
    h: CY1 - CY0,
    kind: 'firedoor',
    why: (b) => `${b.name}: the fire door is shut again — the cinema section is closed to the public`,
  });
  ctx.walls.push({ x: 0, y: CY0, w: F1.fireX, h: CY1 - CY0, hidden: true });

  const r8 = R(8);
  const d8 = roomDoor(r8);
  const cx = r8.x + r8.w / 2;
  const top = r8.y;

  const stephan = { x: cx + 40, y: top + 30, r: 8 };
  const speakerAt = { x: cx + 70, y: top + 30, r: 7 };

  // Two aisles, three seat blocks. The strip between the blocks and the door is the
  // 94 px the attendees walk along before they turn up an aisle.
  const aisles: Array<[number, number]> = [
    [r8.x + 90, r8.x + 140],
    [r8.x + 235, r8.x + 285],
  ];
  const blocks: Array<[number, number]> = [
    [r8.x, aisles[0][0]],
    [aisles[0][1], aisles[1][0]],
    [aisles[1][1], r8.x + r8.w],
  ];
  const seatY0 = top + 70;
  const seatY1 = top + 200;
  for (const [x0, x1] of blocks) {
    ctx.walls.push({
      x: x0,
      y: seatY0,
      w: x1 - x0,
      h: seatY1 - seatY0,
      low: true,
      kind: 'seatblock',
      why: (b) => `${b.name}: seats. Use the aisles`,
    });
  }

  const crate = mkBody('cake', d8.cx + 130, 350, { r: 17, mass: 20, drag: 2.2, accel: 0, max: 160 * SPEED_SCALE });
  const stage: Rect = { x: cx - 110, y: top + 6, w: 220, h: 50 };
  const crateMark: Rect = { x: cx - 100, y: top + 12, w: 44, h: 34 };
  const hooks = [
    { x: r8.x + 16, y: top + 18, done: false },
    { x: r8.x + r8.w - 16, y: top + 18, done: false },
  ];
  const spots = [
    { x: aisles[0][0] + 25, y: seatY1 - 20 },
    { x: aisles[1][0] + 25, y: seatY1 - 20 },
    { x: aisles[1][0] + 25, y: seatY0 + 20 },
    { x: aisles[0][0] + 25, y: seatY0 + 20 },
  ].map((p, i) => ({ ...p, n: i + 1, on: false }));
  let nextSpot = 1;

  // Seats, filled front rows first and from the aisle inwards, with a little jitter
  // so the room does not fill in a visibly straight line.
  const seats: Seat[] = [];
  for (const [x0, x1] of blocks) {
    for (let y = seatY0 + 11; y < seatY1 - 5; y += 18) {
      for (let x = x0 + 10; x < x1 - 6; x += 14) seats.push({ x, y, taken: false, order: 0 });
    }
  }
  const aisleDist = (x: number): number => Math.min(...aisles.map((a) => Math.abs(x - (a[0] + a[1]) / 2)));
  for (const s of seats) s.order = s.y * 3 + aisleDist(s.x) * 0.6 + ctx.rng() * 30;
  seats.sort((a, b) => a.order - b.order);

  const crowd: Attendee[] = [];
  const N = Math.min(84, seats.length);
  let t = 0;
  let complaints = 0;
  let seated = 0;
  let ready = false;
  let spare = 0;
  let ended = false;

  ctx.objective(
    `Chapter 4 · <b>Keynote</b>. Top of the main staircase — the crowd is right behind you: first attendees in ${Math.round(HEAD)}s, ${Math.round(ARRIVAL)}s to fill Room 8, front rows first. Before they sit: <b>Biggy</b> pushes the cake onto the stage, <b>Droid</b> hangs the banner (E at both hooks), <b>Voxxy</b> lights spotlights 1→4. Then <b>all three on stage</b> with Stephan and the speaker.`,
    KEYS,
  );
  ctx.card(
    '<b>Up the main staircase.</b><br>' +
      '<span class="sub">Room 8 has to be ready before 746 people sit down — and the cake is still in the corridor.</span>' +
      '<small>Press any key</small>',
  );

  /* ------------------------------------------------------------- the audience */

  function spawnAttendee(): void {
    const seat = seats.find((s) => !s.taken);
    if (!seat) return;
    seat.taken = true;
    const a = mkBody('attendee', stair.x + 20, CY0 + 30 + ctx.rng() * 40, { r: 5, mass: 0.5 }) as Attendee;
    a.walk = (70 + ctx.rng() * 40) * SPEED_SCALE;
    a.colour = ATTENDEE_COLOURS[Math.floor(ctx.rng() * 4)];
    a.seat = seat;
    a.leg = 0;
    a.aisleX = aisles[0][0] + 25;
    a.seated = false;
    a.hitCd = 0;
    crowd.push(a);
  }

  function stepAttendee(a: Attendee, dt: number): void {
    if (a.seated) return;
    // Down the corridor, in through the door, along the back, up an aisle, along the
    // row. Five legs, which is exactly how a cinema fills.
    const inY = r8.y + r8.h - 30;
    let tx: number;
    let ty: number;
    if (a.leg === 0) {
      tx = d8.cx;
      ty = CY0 + 50;
      if (Math.abs(a.x - tx) < 6) a.leg = 1;
    } else if (a.leg === 1) {
      tx = d8.cx;
      ty = inY;
      if (a.y < inY + 6) a.leg = 2;
    } else if (a.leg === 2) {
      const ax = a.seat.x < aisles[1][0] ? aisles[0][0] + 25 : aisles[1][0] + 25;
      tx = ax;
      ty = inY;
      if (Math.abs(a.x - tx) < 6) {
        a.leg = 3;
        a.aisleX = ax;
      }
    } else if (a.leg === 3) {
      tx = a.aisleX;
      ty = a.seat.y;
      if (Math.abs(a.y - ty) < 6) a.leg = 4;
    } else {
      tx = a.seat.x;
      ty = a.seat.y;
      if (Math.hypot(a.x - tx, a.y - ty) < 4) {
        a.seated = true;
        seated++;
        return;
      }
    }
    const dx = tx - a.x;
    const dy = ty - a.y;
    const d = Math.hypot(dx, dy) || 1;
    let blocked = false;
    for (const o of crowd) {
      if (o === a || o.seated) continue;
      const ox = o.x - a.x;
      const oy = o.y - a.y;
      const od = Math.hypot(ox, oy);
      if (od < 13 && (ox * dx + oy * dy) / (od * d) > 0.5) {
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
    // Once in their row they are past the seat blocks, so walls stop mattering.
    if (a.leg < 4) {
      for (const w of ctx.walls) {
        if (w.low || w.hidden) continue;
        const hit = circleRect(a, w);
        if (hit) {
          a.x += hit.nx * hit.pen;
          a.y += hit.ny * hit.pen;
        }
      }
    }
  }

  const cakeOnMark = (): boolean => inRect(crate, crateMark);
  const jobsDone = (): boolean => cakeOnMark() && hooks.every((h) => h.done) && spots.every((s) => s.on);
  const allOnStage = (): boolean => ctx.bots.every((b) => inRect(b, stage));

  /* --------------------------------------------------------------------- keys */

  /**
   * The banner hooks — and the first chapter to hand `E` back.
   *
   * Returning `false` is not "nothing happened", it is this chapter saying `E`
   * means nothing where the player is standing, so `game.ts` may spend it on a
   * hop or on taking hold of Biggy (see `ChapterRuntime.key`). Everything this
   * room wants `E` for is one Droid at one of two hooks; the rest of it — a room
   * with two aisles, three blocks of seats and a crowd arriving — is exactly the
   * place to be jumping around in.
   */
  function key(code: string): boolean {
    const b = ctx.bots[ctx.cur];
    ctx.switchKey(code);
    if (code !== 'KeyE' || b.kind !== 'droid') return false;
    const h = hooks.find((o) => !o.done && dist(o, b) < HOOK_REACH);
    if (!h) return false;
    h.done = true;
    ctx.flash(hooks.every((o) => o.done) ? 'Banner up!' : 'One hook done — now the other end');
    return true;
  }

  /* ------------------------------------------------------------------- update */

  function update(dt: number): void {
    t += dt;
    ctx.stepAll(dt);
    ctx.pushBiggy(dt);
    const bg = ctx.byKind('biggy');
    const v = ctx.byKind('voxxy');

    stepBot(crate, dt, ctx.walls);
    for (const b of ctx.bots) botsCollide(b, crate, 0.1);
    // Biggy is the only one who can shove the crate: everyone else just bumps it.
    const dx = crate.x - bg.x;
    const dy = crate.y - bg.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 0) {
      const nx = dx / dd;
      const ny = dy / dd;
      const lean = bg.ix * nx + bg.iy * ny;
      if (dd < bg.r + crate.r + 6 && lean > PUSH_LEAN_MIN) {
        crate.vx += nx * lean * CRATE_FORCE * dt;
        crate.vy += ny * lean * CRATE_FORCE * dt;
      }
    }

    const sp = spots.find((s) => s.n === nextSpot);
    if (sp && dist(sp, v) < SPOT_REACH) {
      sp.on = true;
      nextSpot++;
      ctx.flash(`Spotlight ${sp.n} on`);
    }

    const due = Math.min(N, Math.floor((Math.max(0, t - HEAD) / ARRIVAL) * N));
    while (crowd.length < due) spawnAttendee();

    for (const a of crowd) {
      stepAttendee(a, dt);
      if (a.seated) continue;
      const crateHit = botsCollide(a, crate, 0.1);
      if (crateHit && speed(crate) > CRATE_BLAME_SPEED && !a.hitCd) {
        complaints++;
        a.hitCd = 1.5;
        ctx.flash(`The cake crate shoved an attendee (${complaints})`);
      }
      for (const b of ctx.bots) {
        if (b.mounted) continue;
        const hit = botsCollide(a, b, 0.2);
        if (hit && hit.rv > BOWL_OVER && !a.hitCd) {
          complaints++;
          a.hitCd = 1.5;
          ctx.flash(`${b.name} bowled over an attendee (${complaints})`);
        }
      }
      if (a.hitCd) a.hitCd = Math.max(0, a.hitCd - dt);
    }

    if (ended) return;
    const full = crowd.length >= N && crowd.every((a) => a.seated);
    if (!ready && jobsDone()) {
      ready = true;
      spare = Math.max(0, HEAD + ARRIVAL - t);
      ctx.flash('Stage ready! Now all three of you — on stage with Stephan and the speaker', 4000);
      ctx.objective(READY_OBJECTIVE, '1/2/3/Tab: switch · WASD');
    }
    if (ready && allOnStage()) {
      ended = true;
      ctx.score.spare = Math.trunc(spare);
      ctx.score.keynoteComplaints = complaints;
      ctx.score.late = full ? 1 : 0;
      ctx.finish();
    } else if (full && !ready) {
      ended = true;
      ctx.fail(
        "The room is full and the stage isn't ready." +
          `<small>cake ${cakeOnMark() ? '✓' : '✗'} · banner ${hooks.filter((h) => h.done).length}/2 · ` +
          `spotlights ${spots.filter((s) => s.on).length}/4 · R to try again · or Skip chapter</small>`,
      );
    }
  }

  /* --------------------------------------------------------- snapshot payload */

  function props(): Prop[] {
    const out: Prop[] = [
      { kind: 'cake', x: crate.x, y: crate.y, w: crate.r * 2, h: crate.r * 2, state: cakeOnMark() ? 'done' : 'idle', label: 'CAKE' },
      { kind: 'cake-mark', ...crateMark, state: cakeOnMark() ? 'done' : 'idle', label: 'cake' },
      { kind: 'stage', ...stage, state: ready ? 'done' : 'idle', label: ready ? 'EVERYONE ON STAGE' : 'STAGE' },
      {
        kind: 'crowd',
        x: d8.cx,
        y: CY0,
        v: Math.min(1, Math.max(0, (t - HEAD) / ARRIVAL)),
        state: ready ? 'done' : 'active',
        label: t < HEAD ? `attendees arrive in ${Math.round(HEAD - t)}s` : `seated ${seated}/${N}`,
      },
    ];
    for (const h of hooks) {
      out.push({ kind: 'banner-hook', x: h.x, y: h.y, w: 10, h: 10, state: h.done ? 'done' : 'idle' });
    }
    if (hooks.every((h) => h.done)) {
      out.push({
        kind: 'banner',
        x: hooks[0].x,
        y: hooks[0].y - 3,
        w: hooks[1].x - hooks[0].x,
        h: 6,
        state: 'done',
        label: 'HAPPY DEVOXX',
      });
    }
    for (const s of spots) {
      out.push({
        kind: 'spotlight',
        x: s.x,
        y: s.y,
        w: 16,
        h: 16,
        v: s.n,
        state: s.on ? 'done' : s.n === nextSpot ? 'active' : 'idle',
      });
    }
    for (const [x0, x1] of blocks) {
      out.push({ kind: 'seatrow', x: x0, y: seatY0, w: x1 - x0, h: seatY1 - seatY0, state: 'idle' });
    }
    return out;
  }

  function people(): Person[] {
    const out: Person[] = [];
    for (const a of crowd) {
      const p: Vec2 = a.seated ? { x: a.seat.x, y: a.seat.y } : { x: a.x, y: a.y };
      out.push({ x: p.x, y: p.y, r: a.seated ? 4 : a.r, colour: a.colour, role: a.seated ? 'seated' : 'visitor' });
    }
    out.push({ x: stephan.x, y: stephan.y, r: stephan.r, name: 'Stephan', colour: '#e8d5b5', hat: true, role: 'stephan' });
    out.push({ x: speakerAt.x, y: speakerAt.y, r: speakerAt.r, name: 'speaker', colour: '#f0e0c0', role: 'speaker' });
    return out;
  }

  /** The live bottom-of-screen line: the three stage jobs, then the clock. */
  function progress(): string {
    if (ready) {
      const on = ctx.bots.filter((b) => inRect(b, stage)).length;
      return `stage ready · all three on the stage: ${on}/3`;
    }
    const clock = t < HEAD ? `doors in ${Math.round(HEAD - t)}s` : `seated ${seated}/${N}`;
    return (
      `cake ${cakeOnMark() ? '✓' : '✗'} · banner ${hooks.filter((h) => h.done).length}/2 · ` +
      `spotlights ${spots.filter((s) => s.on).length}/4 (next: ${nextSpot}) · ${clock}`
    );
  }

  /* ------------------------------------------------------------------- tasks
   *
   * The four jobs of the room, and **not the clock.**
   *
   * The crowd arriving is a DEADLINE, not a thing to do: nobody can tick it off,
   * doing it faster is not doing more of it, and a meter that counted it would
   * read `3 of 5` for a stage that is finished and a room that is filling. It is
   * already published where a countdown belongs — the `crowd` prop carries how far
   * through the arrival the room is and how many are seated, and `progress()`
   * writes the same clock as a line. A checklist row would be the one row in the
   * game that the player cannot act on.
   */
  /**
   * The same state as `progress()`, as a list — the one source behind the HUD's
   * meter, the panel's checklist and every hint (`Task` in `src/sim/types.ts`).
   *
   * Three jobs that can be done in any order and by three different robots, and
   * then the one that needs all of them. The two counted rows carry `n`/`of`
   * because `banner 1/2` and `spotlights 3/4` are what the player is actually
   * holding in their head; the arrow on each points at the NEXT one, which is the
   * only one of them that does anything.
   */
  function tasks(): Task[] {
    const hook = hooks.find((h) => !h.done) ?? hooks[0];
    const spot = spots.find((s) => s.n === nextSpot) ?? spots[spots.length - 1];
    const onStage = ctx.bots.filter((b) => inRect(b, stage)).length;
    return [
      {
        id: 'cake',
        text: 'push the cake crate onto its mark',
        done: cakeOnMark(),
        who: 'biggy',
        at: { x: crateMark.x + crateMark.w / 2, y: crateMark.y + crateMark.h / 2 },
        hint: 'Biggy: it only moves for me, and only if I lean into it rather than brush past it. Up an aisle — it does not go over the seats any more than I do',
      },
      {
        id: 'banner',
        text: 'hang the banner at both ends',
        done: hooks.every((h) => h.done),
        who: 'droid',
        // The hook still to do: the other one is finished, and an arrow to it
        // would be an arrow to a job that is over.
        at: { x: hook.x, y: hook.y + 24 },
        n: hooks.filter((h) => h.done).length,
        of: hooks.length,
        hint: 'Droid: a hook at each end of the stage wall, both of them over everybody else’s head. One end hung is a banner on the floor',
      },
      {
        id: 'spots',
        text: 'light the four spotlights in order',
        done: spots.every((s) => s.on),
        who: 'voxxy',
        at: { x: spot.x, y: spot.y },
        n: spots.filter((s) => s.on).length,
        of: spots.length,
        hint: 'Voxxy: they come on in order and only in order. Run over one and nothing happens, and you are at the wrong one — the one that is waiting is the one lit up',
      },
      {
        id: 'stage',
        text: 'get all three robots on the stage',
        done: ready && allOnStage(),
        at: { x: stage.x + stage.w / 2, y: stage.y + stage.h / 2 },
        n: onStage,
        of: ctx.bots.length,
        hint: 'Biggy: all three of us on the boards at the same time — and Stephan is not starting until the cake, the banner and the lights are done either',
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
    placeProp(kind: string, x: number, y: number): boolean {
      if (kind !== 'cake') return false;
      crate.x = x;
      crate.y = y;
      crate.vx = 0;
      crate.vy = 0;
      return true;
    },
    state: (): KeynoteState => ({
      chapter: 4,
      cake: cakeOnMark(),
      hooks: hooks.filter((h) => h.done).length,
      spots: spots.filter((s) => s.on).length,
      nextSpot,
      ready,
      seated,
      crowd: crowd.length,
      complaints,
      spare,
    }),
  };
}

export const ch4Keynote: ChapterDef = { n: 4, title: '4 · Keynote — Room 8', setup };
