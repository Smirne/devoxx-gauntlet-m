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
import { JAMMED_DOOR_SPEED, MOUNT_BIGGY_MAX_SPEED, MOUNT_REACH, T, W } from '../constants';
import { buildLights, clueLit, litBy } from '../lights';
import { dist, speed } from '../bot';
import type { Clue, LightSource, Mirror, Prop, Rect, Wall } from '../types';
import type { ChapterCtx, ChapterDef, ChapterRuntime } from './index';

/* ---------------------------------------------------------------- tuning that is
 * chapter-local: reach distances for "use", not physics. The prototype spelled these
 * out inline; they are here so the two "can Droid get at it" checks agree. */

/** How close a robot must be to the keypad to type on it. */
const PAD_REACH = 40;
/** How close Biggy must park for Droid, on his shoulders, to reach the panel. */
const PANEL_REACH = 50;
/** Biggy is loud about a run-up that will not do it, but only once he is moving. */
const JAM_MIN_TALK = 20;

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
  fireOpen: boolean;
  jokes: Readonly<Record<string, string>>;
}

const OBJECTIVE =
  'Chapter 1 · <b>Night</b>. The Devoxx entrance downstairs is shut; you came in through the ' +
  "cinema's back door, into the closed section — and the power is out. The fire door to the Devoxx " +
  'rooms has a keypad: find the <b>4 digits</b>, each visible only under the right <b>mix of lights</b>. ' +
  'Droid can climb on Biggy (E). Biggy can smash the jammed door with a straight run across the corridor.';
const KEYS = '1/2/3/Tab: switch · WASD · E: use / climb · digits at the keypad · R: restart';

function setup(ctx: ChapterCtx): ChapterRuntime {
  ctx.setFloor('up');
  ctx.setView(VIEW_CLOSED);
  ctx.setWalls(floor1Walls());
  ctx.place([40, 330], [40, 356], [46, 384]);

  const clues: Clue[] = [];
  const mirrors: Mirror[] = [];
  let lights: LightSource[] = [];
  let entered = '';
  let panelOn = false;
  let jamBroken = false;
  let fireOpen = false;

  const digits = [0, 1, 2, 3].map(() => Math.floor(ctx.rng() * 10));

  /* ------------------------------------------------------------ the fire door */

  const fire: Wall = {
    x: F1.fireX,
    y: CY0,
    w: 14,
    h: CY1 - CY0,
    kind: 'firedoor',
    why: (b) => `${b.name}: fire door, sealed for the night. There's a keypad — we need the 4-digit code`,
  };
  ctx.walls.push(fire);
  const keypad: Rect = { x: F1.fireX - 18, y: CY0 + 8, w: 16, h: 24 };
  const padAt = { x: keypad.x + 8, y: keypad.y + 12 };
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
    why: (b) => `${b.name}: locked. The release is up by the projector window — too high even for Droid`,
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
  for (let y = rE.y + 58; y <= rE.y + 180; y += 24) {
    // The last rows stop short of the alcove instead of running into its wall.
    const rightEnd = y >= alcove.y - T - 9 ? alcove.x - T : rE.x + rE.w;
    ctx.walls.push({ x: rE.x, y, w: aisle[0] - rE.x, h: 9, low: true, kind: 'seatrow', why: whySeats });
    if (rightEnd - aisle[1] > 4) {
      ctx.walls.push({ x: aisle[1], y, w: rightEnd - aisle[1], h: 9, low: true, kind: 'seatrow', why: whySeats });
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
        ? `Biggy: jammed shut. Give me the width of the corridor and I'll go through it (needs ${JAMMED_DOOR_SPEED} px/s)`
        : `${b.name}: jammed shut. This one is Biggy's — from the far wall, straight at it`,
    // The check is the speed INTO the door, not the total speed: a fast robot sliding
    // along the corridor must not pop it open sideways. This was the prototype's own
    // bug fix and `JAMMED_DOOR_SPEED` is frozen against it.
    onHit: (b) => {
      if (b.kind !== 'biggy') return false;
      const into = Math.abs(b.vy);
      if (into > JAMMED_DOOR_SPEED) {
        jamBroken = true;
        ctx.removeWall(jam);
        ctx.flash(`CRASH — Biggy goes through the jammed door at ${Math.trunc(into)} px/s`);
        b.vx *= 0.5;
        b.vy *= 0.5;
        return true;
      }
      if (into > JAM_MIN_TALK) ctx.flash(`Biggy: ${Math.trunc(into)} px/s — not enough, further back`);
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
    const route = (dy: number): Array<{ x: number; y: number }> => [
      { x: F1.fireX + 30, y: 350 + dy },
      { x: nb.x + 20, y: 350 + dy },
      { x: nb.x + 20, y: nb.y + 30 },
    ];
    ctx.startCut(
      [
        { kind: 'voxxy', pts: route(-14) },
        { kind: 'droid', pts: route(0) },
        { kind: 'biggy', pts: route(14) },
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
    const nearPad = dist(b, padAt) < PAD_REACH;
    // At the keypad the digit keys type; everywhere else they switch robot.
    if (!nearPad) ctx.switchKey(input);

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
    if (!panelOn) out.push({ kind: 'lock', x: lock.x, y: lock.y, w: lock.w, h: lock.h, state: 'shut' });
    if (!jamBroken) out.push({ kind: 'jammed', x: jam.x, y: jam.y, w: jam.w, h: jam.h, state: 'shut' });
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

  return {
    key,
    update,
    props,
    clues: () => clues,
    mirrors: () => mirrors,
    lights: () => lights,
    entered: () => entered,
    state: (): NightState => ({
      chapter: 1,
      clues,
      code,
      entered,
      panelOn,
      jamBroken,
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
