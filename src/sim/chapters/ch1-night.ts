/**
 * Chapter 1 — NIGHT. The closed cinema section, power out.
 *
 * Ported from the prototype's `setupNight` / `nightKey` / `nightUpdate` / `nightDone`
 * (`reference/poc/10-after-dark-kinepolis.html`). Four light-mix clues hide the four
 * digits of the fire door's keypad, and no robot can read a clue alone — that is the
 * whole game in one chapter (`docs/lights-and-locks-rules.md`).
 *
 *   1. foyer          orange + green   Voxxy's beam and Droid's pool
 *   2. kiosk          orange + blue    Voxxy through the Voxxy-sized hatch,
 *                                      Biggy's flood through the glazing
 *   3. cinema B       green + blue     the door is locked until Droid, standing on
 *                                      Biggy, reaches the projector panel
 *   4. cinema E       all three        behind a jammed door and a mirror screen
 *
 * The digits are random per run (seeded — see `game.ts`), so the code cannot be
 * memorised between runs and the clues have to be actually solved.
 */

import { CY0, CY1, DOOR, F1, R, VIEW_CLOSED, VIEW_F1, floor1Walls, roomDoor } from '../geometry';
import { JAMMED_DOOR_SPEED, MOUNT_BIGGY_MAX_SPEED, MOUNT_REACH, SPEED_SCALE, T, W } from '../constants';
import { m } from '../units';
import { buildLights, clueLit, litBy } from '../lights';
import { dist, speed } from '../bot';
import type { Clue, LightSource, Mirror, Prop, Rect, Wall } from '../types';
import type { ChapterCtx, ChapterDef, ChapterRuntime } from './index';

/* ---------------------------------------------------------------- tuning that is
 * chapter-local: reach distances for "use", not physics. The prototype spelled these
 * out inline; they are here so the two "can Droid get at it" checks agree. */

/**
 * How close a robot must be to the keypad to type on it.
 *
 * The prototype compared centre-to-centre against a flat 40, which meant Biggy —
 * 17 px of radius — had to bury himself in the fire door before a digit was taken,
 * and pressing one anywhere else silently switched robot instead. The reach is now
 * measured from the robot's *edge*, so all three can stand at the pad, and
 * `nearPad` is reported to the HUD so the player is told when typing is live.
 */
const PAD_REACH = 40;
/** How close Biggy must park for Droid, on his shoulders, to reach the panel. */
const PANEL_REACH = 50;
/** Biggy is loud about a run-up that will not do it, but only once he is moving. px/s. */
const JAM_MIN_TALK = 20 * SPEED_SCALE;
/**
 * How long the smashed door takes to finish falling, seconds.
 *
 * The COLLIDER is gone on the frame of the hit — the passage is earned the instant
 * Biggy is through it, and a door that is visually open but physically shut would be
 * a worse bug than the one this fixes. This clock only feeds `Prop.progress`, which
 * is the renderer's cue to animate the leaf coming off its hinges. Half a second,
 * tuned by eye: long enough to read as an impact, short enough that nobody waits for
 * it. It is a duration, not a speed, so the physics rescale does not move it.
 */
const JAM_FALL_TIME = 0.55;

/** The jokes on the doors of the cinemas Devoxx never uses. */
const CLOSED_JOKES: Readonly<Record<string, string>> = Object.freeze({
  A: 'Popcorn machine: OFF',
  B: '"Reserved for the Devoxx film crew"',
  C: 'projector says NO SIGNAL',
  D: 'locked since the 2019 after-party',
  E: 'door jammed since the last film festival',
});

export interface NightState {
  chapter: 1;
  clues: Clue[];
  /** The four digits in keypad order — what the player is trying to discover. */
  code: string;
  entered: string;
  /** The projector-panel release that unlocks cinema B. */
  panelOn: boolean;
  jamBroken: boolean;
  /** 0..1, how far the smashed door has got through falling. See `JAM_FALL_TIME`. */
  jamFall: number;
  fireOpen: boolean;
  jokes: Readonly<Record<string, string>>;
}

const OBJECTIVE =
  'Chapter 1 · <b>Night</b>. The Devoxx entrance downstairs is shut; you came in through the ' +
  "cinema's back door, into the closed section — and the power is out. The fire door to the Devoxx " +
  'rooms has a keypad: find the <b>4 digits</b>, each visible only under the right <b>mix of lights</b>. ' +
  'Droid can climb on Biggy (E). Biggy can smash the jammed door with a straight run across the corridor.';
const KEYS = '1/2/3/Tab: switch · WASD · E: use / climb · Space: take hold of Biggy · digits at the keypad · R: restart';

function setup(ctx: ChapterCtx): ChapterRuntime {
  ctx.setFloor('up');
  ctx.setView(VIEW_CLOSED);
  ctx.setWalls(floor1Walls());
  /*
   * Spread ALONG the corridor, not across it.
   *
   * The three used to stand at x 40-46 with y 330, 356, 384 — a column stacked
   * along the diorama camera's own depth axis, so the tallest stood in front of
   * the smallest and the opening frame of the game showed two robots where there
   * are three. Spread left-to-right they all read from the first frame, which is
   * also the first thing a judge screenshots.
   */
  ctx.place([40, 350], [92, 334], [148, 366]);

  const clues: Clue[] = [];
  const mirrors: Mirror[] = [];
  let lights: LightSource[] = [];
  let entered = '';
  let panelOn = false;
  let jamBroken = false;
  /** 0..1, the smashed door's own fall. Started by the hit, ticked in `update`. */
  let jamFall = 0;
  let fireOpen = false;

  const digits = [0, 1, 2, 3].map(() => Math.floor(ctx.rng() * 10));

  /* ------------------------------------------------------------ the fire door */

  const fire: Wall = {
    x: F1.fireX,
    y: CY0,
    w: 14,
    h: CY1 - CY0,
    kind: 'firedoor',
    // One line per robot, in that robot's voice (CLAUDE.md): Voxxy chirpy, Droid
    // dry and deliberate, Biggy blunt. The old single sentence with the name
    // swapped in read as three robots sharing one script.
    why: (b) =>
      b.kind === 'voxxy'
        ? 'Voxxy: fire door! Sealed, bolted, no gap — but look, a keypad. Four digits and it is ours'
        : b.kind === 'droid'
          ? 'Droid: fire door, night-sealed. Magnetic lock, keypad override. Four digits. We do not have them yet'
          : 'Biggy: fire door. I could hit it. I would lose. Find the four digits',
  };
  ctx.walls.push(fire);
  const keypad: Rect = { x: F1.fireX - 18, y: CY0 + 8, w: 16, h: 24 };
  const padAt = { x: keypad.x + 8, y: keypad.y + 12 };
  /** Is the driven robot close enough to type? Measured from its edge, not its centre. */
  const atPad = (): boolean => {
    const b = ctx.bots[ctx.cur];
    return !fireOpen && dist(b, padAt) < PAD_REACH + b.r;
  };
  // Nothing beyond the fire door exists tonight: one invisible slab seals the whole
  // Devoxx half, so a robot squeezing past the door frame still cannot wander off.
  const beyond: Wall = { x: F1.fireX + 14, y: CY0, w: W, h: CY1 - CY0, hidden: true };
  ctx.walls.push(beyond);

  /* ------------------------------------------------------------ 1 · the foyer */

  const foyer = F1.foyer;
  clues.push({
    x: foyer.x + 55,
    y: foyer.y + 120,
    need: ['voxxy', 'droid'],
    slot: 1,
    digit: digits[0],
    found: false,
    label: 'orange + green',
  });

  /* ------------------------------------------------------------ 2 · the kiosk */

  const kiosk = F1.kiosk;
  clues.push({
    x: kiosk.x + kiosk.w / 2,
    y: kiosk.y + kiosk.h / 2,
    need: ['voxxy', 'biggy'],
    slot: 2,
    digit: digits[1],
    found: false,
    label: 'orange + blue',
  });

  /* ------------------------------------------------------------ 3 · cinema B */

  const rB = R('B');
  const dB = roomDoor(rB);
  const lock: Wall = {
    x: dB.x,
    y: dB.y,
    w: dB.w,
    h: dB.h,
    kind: 'lock',
    why: (b) =>
      b.kind === 'voxxy'
        ? 'Voxxy: locked! The release is way up by the projector window. I can barely see it, never mind reach it'
        : b.kind === 'droid'
          ? 'Droid: locked. The release is by the projector window, about a metre above my reach. I need height'
          : 'Biggy: locked. Release is up there. I am not up there. Droid could be, if he stood on me',
  };
  ctx.walls.push(lock);
  const panel: Rect = { x: dB.x + dB.w + 14, y: CY0 + 10, w: 20, h: 24 };
  const panelAt = { x: panel.x + 10, y: panel.y + 12 };
  clues.push({
    x: rB.x + rB.w / 2,
    y: rB.y + 40,
    need: ['droid', 'biggy'],
    slot: 3,
    digit: digits[2],
    found: false,
    label: 'green + blue',
  });

  /* ------------------------------------------------------------ 4 · cinema E */

  const rE = R('E');
  // One aisle up the left of the room; Biggy does not fit in it, but his flood does
  // clear the seat backs, which is the hint the seats themselves give him.
  const aisle: [number, number] = [rE.x + 50, rE.x + 80];
  const alcove: Rect = { x: rE.x + rE.w - 46, y: rE.y + rE.h - 78, w: 40, h: 40 };
  const whySeats = (b: { kind: string }): string | null =>
    b.kind === 'biggy' ? 'Biggy: too wide for that aisle — but my light goes over the seats' : null;
  /**
   * The seat rows, kept as rects as well as walls.
   *
   * They were only ever walls, and `buildVenue()` draws the STATIC geometry from
   * `floor1Walls()` — it never sees a wall a chapter pushes at runtime. Room E is
   * also the one auditorium the venue deliberately leaves undressed, precisely
   * because "room E dresses itself in chapter 1". So nothing drew them: the room
   * rendered empty and Biggy stopped dead against thin air. Michele, in play:
   * "seats are missing in the room. Biggy is blocked but it's not clear by what."
   *
   * The renderer has had a `seatrow` prop spec the whole time. `props()` now
   * publishes one per row, which is how every other piece of chapter furniture
   * already reaches the screen.
   */
  const seatRects: Rect[] = [];
  for (let y = rE.y + 58; y <= rE.y + 180; y += 24) {
    // The last rows stop short of the alcove instead of running into its wall.
    const rightEnd = y >= alcove.y - T - 9 ? alcove.x - T : rE.x + rE.w;
    const left: Rect = { x: rE.x, y, w: aisle[0] - rE.x, h: 9 };
    ctx.walls.push({ ...left, low: true, kind: 'seatrow', why: whySeats });
    seatRects.push(left);
    if (rightEnd - aisle[1] > 4) {
      const right: Rect = { x: aisle[1], y, w: rightEnd - aisle[1], h: 9 };
      ctx.walls.push({ ...right, low: true, kind: 'seatrow', why: whySeats });
      seatRects.push(right);
    }
  }
  ctx.walls.push(
    { x: alcove.x - T, y: alcove.y - T, w: alcove.w + 2 * T, h: T },
    { x: alcove.x - T, y: alcove.y, w: T, h: alcove.h },
  );
  // The cinema screen. A lit point on it re-emits, which is the only way orange and
  // green reach the alcove at all — the seat rows are low, so light crosses them.
  mirrors.push({ x0: rE.x + 20, x1: rE.x + rE.w - 20, y: rE.y + rE.h, ny: -1 });

  const dE = roomDoor(rE);
  const jam: Wall = {
    x: dE.x,
    y: dE.y,
    w: dE.w,
    h: dE.h,
    kind: 'jammed',
    why: (b) =>
      b.kind === 'biggy'
        ? `Biggy: jammed shut. Give me the width of the corridor and I'll go through it (needs ${m(JAMMED_DOOR_SPEED).toFixed(1)} m/s)`
        : `${b.name}: jammed shut. This one is Biggy's — from the far wall, straight at it`,
    // The check is the speed INTO the door, not the total speed: a fast robot sliding
    // along the corridor must not pop it open sideways. This was the prototype's own
    // bug fix and `JAMMED_DOOR_SPEED` is frozen against it.
    onHit: (b) => {
      if (b.kind !== 'biggy') return false;
      const into = Math.abs(b.vy);
      if (into > JAMMED_DOOR_SPEED) {
        jamBroken = true;
        // The collider goes NOW. What is left is a prop with a clock on it: `jamFall`
        // runs 0 -> 1 over `JAM_FALL_TIME` and the renderer draws the leaf falling.
        ctx.removeWall(jam);
        ctx.flash(`CRASH — Biggy goes through the jammed door at ${m(into).toFixed(1)} m/s`);
        b.vx *= 0.5;
        b.vy *= 0.5;
        return true;
      }
      if (into > JAM_MIN_TALK) ctx.flash(`Biggy: ${m(into).toFixed(1)} m/s — not enough, further back`);
      return false;
    },
  };
  ctx.walls.push(jam);

  clues.push({
    x: alcove.x + alcove.w / 2,
    y: alcove.y + 18,
    need: ['voxxy', 'droid', 'biggy'],
    slot: 4,
    digit: digits[3],
    found: false,
    label: 'all three',
  });

  /* ------------------------------------------------ the cinemas nobody is using
   *
   * A, C and D carry a sign saying they are shut and, until now, nothing else:
   * the sign was a prop and the doorway was a hole, so you could walk straight
   * through "locked since the 2019 after-party" into an empty room. Michele found
   * it on his first playthrough, walking into A from the corridor.
   *
   * B and E are the puzzle and already have their own gates — B's `lock`, E's
   * `jam` — so they are skipped here. The three that are only scenery get a plain
   * wall behind the joke, and, per CLAUDE.md, a line in each robot's voice saying
   * WHY rather than a silent refusal. Each line answers the sign on that door.
   */
  const SHUT_VOICES: Readonly<Record<string, (b: { kind: string; name: string }) => string>> =
    Object.freeze({
      A: (b) =>
        b.kind === 'voxxy'
          ? 'Voxxy: popcorn machine is off and so is the door. Nothing in there but empty seats'
          : `${b.name}: shut. No popcorn, no power, no reason to go in`,
      C: (b) =>
        b.kind === 'droid'
          ? 'Droid: NO SIGNAL, and a dead projector means a dark room. Nothing to find'
          : `${b.name}: that one is dark — the projector has had no signal for months`,
      D: (b) =>
        b.kind === 'biggy'
          ? 'Biggy: locked since 2019. I could open it. I have been asked not to open things'
          : `${b.name}: locked since the after-party, and nobody has found that key since`,
    });

  for (const n of Object.keys(SHUT_VOICES)) {
    const r = R(n);
    const d = roomDoor(r);
    ctx.walls.push({ x: d.x, y: d.y, w: d.w, h: d.h, kind: 'shut', why: SHUT_VOICES[n] });
  }

  const code = clues
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((c) => String(c.digit))
    .join('');

  ctx.objective(OBJECTIVE, KEYS);

  /* ------------------------------------------------------------------ opening */

  function done(): void {
    fireOpen = true;
    ctx.removeWall(fire);
    ctx.removeWall(beyond);
    ctx.score.nightT = Math.round(ctx.t);
    ctx.flash('Code accepted — the fire door swings open. Down the secondary stairs, to the exhibition hall', 4000);
    // Out of the closed section and down the secondary staircase between 3 and 4 —
    // the one the plans put exactly there (GAUNTLET.md Stage 1).
    const nb = F1.nicheBot;
    /*
     * A loose diagonal, not a column.
     *
     * The three used to walk this with only a `dy` offset — 14 px apart along the
     * diorama camera's own depth axis — so at the closer cutscene framing Biggy
     * stood in front of the other two and the shot was one robot and two hats.
     * Staggered in x as well they read as three, Voxxy out in front because she is
     * the quick one, and they converge on the stairwell mouth for the descent.
     */
    const route = (dx: number, dy: number): Array<{ x: number; y: number }> => [
      { x: F1.fireX + 30 + dx, y: 350 + dy },
      { x: nb.x + 20 + dx, y: 350 + dy },
      { x: nb.x + 20, y: nb.y + 30 },
    ];
    ctx.startCut(
      [
        { kind: 'voxxy', pts: route(18, -14) },
        { kind: 'droid', pts: route(0, 0) },
        { kind: 'biggy', pts: route(-18, 14) },
      ],
      () => ctx.startChapter(2),
      VIEW_F1,
    );
  }

  /* --------------------------------------------------------------------- keys */

  function key(input: string): void {
    const b = ctx.bots[ctx.cur];
    const d = ctx.byKind('droid');
    const bg = ctx.byKind('biggy');
    const nearPad = atPad();
    // At the keypad the digit keys type; everywhere else they switch robot.
    if (!nearPad) ctx.switchKey(input);
    // 4-9 mean nothing but "keypad" in this chapter, so a press that lands nowhere
    // says why instead of vanishing. 1/2/3 keep their documented switch meaning.
    if (!nearPad && !fireOpen && /^Digit[4-9]$/.test(input)) {
      ctx.flash(`${b.name}: too far from the keypad — it is on the fire door, drive right up to it`);
    }

    if (input === 'KeyE') {
      const canMount =
        !d.mounted && b.kind === 'droid' && dist(d, bg) < d.r + bg.r + MOUNT_REACH && speed(bg) < MOUNT_BIGGY_MAX_SPEED;
      if (!panelOn && d.mounted && dist(bg, panelAt) < PANEL_REACH) {
        panelOn = true;
        ctx.removeWall(lock);
        ctx.flash("Droid reaches the projector panel from Biggy's shoulders — the middle cinema unlocks");
        return;
      }
      if (!panelOn && !canMount && !d.mounted && b.kind === 'droid' && dist(b, panelAt) < PANEL_REACH) {
        ctx.flash('Droid: too high, even for me. If I stood on Biggy…');
        return;
      }
      if (b.kind === 'droid' || (b.kind === 'biggy' && d.mounted)) ctx.toggleMount();
    }

    if (nearPad && /^Digit\d$/.test(input)) {
      entered += input[5];
      if (entered.length === 4) {
        if (entered === code) done();
        else {
          ctx.flash('Wrong code');
          entered = '';
        }
      }
    }
  }

  /* ------------------------------------------------------------------- update */

  function update(dt: number): void {
    ctx.stepAll(dt);
    ctx.pushBiggy(dt);
    if (jamBroken && jamFall < 1) jamFall = Math.min(1, jamFall + dt / JAM_FALL_TIME);
    lights = buildLights(ctx.bots, ctx.walls, mirrors);
    for (const c of clues) {
      if (!c.found && clueLit(lights, c)) {
        c.found = true;
        ctx.flash(`Clue: digit ${c.digit} is position ${c.slot}`);
      }
    }
  }

  /* -------------------------------------------------------------------- props */

  function props(): Prop[] {
    const out: Prop[] = [
      { kind: 'firedoor', x: fire.x, y: fire.y, w: fire.w, h: fire.h, state: fireOpen ? 'open' : 'shut' },
      { kind: 'keypad', ...keypad, state: fireOpen ? 'done' : 'idle', label: entered.padEnd(4, '_') },
      { kind: 'projector-panel', ...panel, state: panelOn ? 'done' : 'idle', label: 'projector panel' },
      { kind: 'screen', x: mirrors[0].x0, y: mirrors[0].y - 5, w: mirrors[0].x1 - mirrors[0].x0, h: 5 },
      { kind: 'alcove', ...alcove, state: 'idle', label: 'exit alcove' },
    ];
    for (const r of seatRects) out.push({ kind: 'seatrow', ...r, state: 'idle' });
    // The scenery cinemas' doors, so the wall behind each joke is something you
    // can see rather than something you bump into.
    for (const n of Object.keys(SHUT_VOICES)) {
      const d = roomDoor(R(n));
      out.push({ kind: 'lock', x: d.x, y: d.y, w: d.w, h: d.h, state: 'shut' });
    }
    if (!panelOn) out.push({ kind: 'lock', x: lock.x, y: lock.y, w: lock.w, h: lock.h, state: 'shut' });
    /*
     * The jammed door is emitted whatever state it is in.
     *
     * It used to vanish from this list on the frame it broke, so the biggest
     * physical thing the player does in the chapter had no picture at all: the door
     * did not open, it ceased to exist. Broken, it keeps its place and carries
     * `progress`; the leaf ends up lying on the cinema floor where Biggy put it,
     * which is the trophy.
     */
    out.push({
      kind: 'jammed',
      x: jam.x,
      y: jam.y,
      w: jam.w,
      h: jam.h,
      state: jamBroken ? 'broken' : 'shut',
      progress: jamFall,
    });
    // The doors of the cinemas Devoxx never uses, each with its own excuse.
    for (const n of Object.keys(CLOSED_JOKES)) {
      const r = R(n);
      const d = roomDoor(r);
      out.push({
        kind: 'sign',
        x: d.cx,
        y: r.side < 0 ? CY0 + 14 : CY1 - 8,
        w: DOOR,
        h: 10,
        label: CLOSED_JOKES[n],
      });
    }
    return out;
  }

  /** The live bottom-of-screen line: clues found, then what the keypad is waiting for. */
  function progress(): string {
    if (fireOpen) return 'fire door open · down the secondary stairs between 3 and 4';
    const found = clues.filter((c) => c.found).length;
    const left = clues
      .filter((c) => !c.found)
      .map((c) => c.label)
      .join(', ');
    const pad = atPad()
      ? `keypad live — type ${4 - entered.length} more digit${4 - entered.length === 1 ? '' : 's'}`
      : 'keypad: drive up to the fire door to type';
    return `digits ${found}/4${found < 4 ? ` · still dark: ${left}` : ''} · ${pad}`;
  }

  return {
    key,
    update,
    props,
    progress,
    clues: () => clues,
    mirrors: () => mirrors,
    lights: () => lights,
    // The only chapter whose picture IS its lamps: without this the cutscene out
    // of the closed section is walked in the dark.
    relight: () => {
      lights = buildLights(ctx.bots, ctx.walls, mirrors);
    },
    entered: () => entered,
    state: (): NightState => ({
      chapter: 1,
      clues,
      code,
      entered,
      panelOn,
      jamBroken,
      jamFall,
      fireOpen,
      jokes: CLOSED_JOKES,
    }),
  };
}

/**
 * Which of a clue's colours are on it right now — the renderer draws the "needs
 * orange + green" hint from this, so the near-miss feedback is sim truth and not a
 * guess made in the drawing code.
 */
export function clueProgress(lights: LightSource[], clue: Clue): number {
  return clue.need.filter((k) => litBy(lights, k, clue)).length;
}

export const ch1Night: ChapterDef = { n: 1, title: '1 · Night — the closed cinema section', setup };
