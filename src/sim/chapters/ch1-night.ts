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

import {
  CY0,
  CY1,
  F1,
  R,
  VIEW_CLOSED,
  VIEW_F1,
  cinemaEExit,
  floor1Walls,
  roomDoor,
  roomScreen,
} from '../geometry';
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

/**
 * The keypad's alphabet: 4 to 9, never 0 to 3.
 *
 * Michele asked for this twice — *"You didn't follow my suggestion (don't use
 * 1-2-3 in the door code)"* — and it is not a preference, it is the bug he filed
 * one message earlier: *"I don't seem to be able to activate it. imanaged with
 * biggy."*
 *
 * 1, 2 and 3 select a robot everywhere in this game, and at the keypad they type
 * instead. That is fine while you are in reach and a trap the moment you are not:
 * press the 2 of your code from a pixel outside `PAD_REACH` and you do not type a
 * 2, you take Droid — who is across the room — so every digit after it also does
 * nothing, and the keypad reads as dead. Biggy has the largest radius and
 * therefore the largest reach (49 px against Voxxy's 44.8), which is exactly why
 * he was the one it worked with.
 *
 * Restricting the alphabet removes the collision at the root rather than widening
 * the reach until the overlap stops mattering. It also makes the existing "4-9
 * mean nothing but keypad in this chapter" hint true, which it was not: the hint
 * was written for this range and the generator was still emitting 0 to 9.
 *
 * 0 is out too. It switches nothing, but it is the one digit with no hint of its
 * own, and a code that is all one contiguous range is a rule a player can hold.
 */
const PAD_LOW = 4;
const PAD_HIGH = 9;
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

/**
 * The leaf the renderer draws in a doorway, from the doorway's own collider.
 *
 * `roomDoor()` returns a 12 px band because a door has to seal a 6 px wall from
 * both sides; drawn literally that is a door leaf **0.96 m thick**, which is what
 * Michele keeps calling "big". The collider stays the full band — nothing about
 * passing through the door changes — and the picture becomes a 0.48 m leaf
 * centred in it.
 */
const leaf = (d: Rect): Rect => ({ x: d.x, y: d.y + 3, w: d.w, h: 6 });

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
  'Droid can climb on Biggy (E). Biggy can smash the jammed door with a straight run across the corridor. ' +
  'In the last cinema the <b>screen is a mirror</b>: light that hits it comes back into the room.';
const KEYS = '1/2/3/Tab: switch · WASD · E: use / climb · Space: take hold of Biggy · 4-9 at the keypad (Backspace) · R: restart';

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
  /** Biggy says "my light is coming off the screen" once, the first time it does. */
  let mirrorHinted = false;

  const digits = [0, 1, 2, 3].map(() => PAD_LOW + Math.floor(ctx.rng() * (PAD_HIGH - PAD_LOW + 1)));

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
  /**
   * The keypad: a panel ON the fire door, and a collider like everything else you
   * can see.
   *
   * It was a 16 x 24 px box standing 18 px clear of the door — 1.3 m wide, 1.9 m
   * DEEP and 1.25 m tall, a fridge parked in the corridor — and the collider sweep
   * never looked at it, because `tests/colliders.test.ts` measures what
   * `buildVenue()` builds and this is a chapter prop. You walked straight through
   * it. Now it is 8 px of housing against the door's own face, standing 1.9 m
   * along the wall, with a wall under it.
   */
  const keypad: Rect = { x: F1.fireX - 8, y: CY0 + 8, w: 8, h: 24 };
  ctx.walls.push({
    ...keypad,
    kind: 'keypad',
    why: (b) =>
      b.kind === 'voxxy'
        ? 'Voxxy: that is the keypad itself — stand next to it, do not headbutt it'
        : `${b.name}: keypad housing. Type on it, do not walk into it`,
  });
  const padAt = { x: keypad.x + keypad.w / 2, y: keypad.y + keypad.h / 2 };
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
  /**
   * One aisle up the left of the room. Biggy does not fit in it, but his flood
   * does clear the seat backs, which is the hint the seats themselves give him.
   *
   * WIDTH IS THE GATE, AND IT HAD STOPPED BEING ONE. Michele: *"Biggy can now
   * walk the aisle. I think the whole point was he cannot."* He was right, and it
   * was my doing: the 23 Sep rescale measured the radii off the rigs and Biggy's
   * body went from 2.72 m across to 1.44 m, while this aisle stayed at the 2.4 m
   * it was sized to when he was the wider robot. He asked for the geometry to move
   * to meet the rule rather than the rule to be re-asserted, so it does.
   *
   * 15 px = 1.2 m, which is a real cinema aisle and sits in the only window that
   * works: Droid's body is 1.00 m, so he keeps 10 cm either side, and Biggy's is
   * 1.44 m, so he is a clear 24 cm too wide. There is no width that separates
   * Droid from Voxxy — that window is 0.80 to 0.99 m and would leave Voxxy 7 cm a
   * side, which is threading a needle, not a puzzle. Width gates Biggy; height
   * (`tall`) is what gates Droid, in the rooms that use it.
   */
  const AISLE_W = 15;
  /**
   * The aisle is up the RIGHT of the room, beside the exit alcove.
   *
   * Michele, after the playthrough he could not finish: *"I'd try the aisle room
   * on the opposite way, for better interaction. I no longer see the hint in that
   * room, i wasn't able to solve it."*
   *
   * He is right twice over. The aisle used to run up the LEFT and the alcove sat
   * against the RIGHT wall, so the two halves of one puzzle were at opposite ends
   * of a room the camera frames 320 px wide: you walked down the aisle, lost sight
   * of where you were going, and crossed a black floor to get to it. Mirrored, the
   * aisle delivers you at the alcove's mouth, and the gate, the route and the prize
   * are one picture.
   *
   * `plans/` fixes where the ROOMS are, not which side a chapter dresses an aisle
   * on, so this is not a venue change (CLAUDE.md).
   */
  const aisle: [number, number] = [rE.x + rE.w - 50 - AISLE_W, rE.x + rE.w - 50];
  /**
   * The exit alcove is venue geometry now — `cinemaEExit()` — because its walls
   * have to be DRAWN, and the renderer only ever draws `floor1Walls()`. It has
   * also moved up the room, out of the strip the fixed camera cannot see past
   * cinema E's own front wall. See the comment on `cinemaEExit`.
   */
  const alcove: Rect = cinemaEExit();
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
  const ROW_H = 9;
  const rowY: number[] = [];
  for (let y = rE.y + 58; y <= rE.y + 180; y += 24) rowY.push(y);
  const lastRow = rowY[rowY.length - 1];
  for (const y of rowY) {
    const left: Rect = { x: rE.x, y, w: aisle[0] - rE.x, h: ROW_H };
    ctx.walls.push({ ...left, low: true, kind: 'seatrow', why: whySeats });
    seatRects.push(left);
    /*
     * Right of the aisle: seats down to the alcove, nothing beside it, and then
     * the FRONT ROW again.
     *
     * The front row is the load-bearing one. Without it the bay in front of the
     * alcove opens straight into the front of house, and the front of house is
     * open across the full width of the room — so Biggy strolls round the seating
     * and into the alcove, and cinema E stops being a puzzle. With it, the 15 px
     * aisle is the only way in or out of that bay, which is the gate, stated once
     * in geometry instead of asserted in a comment.
     */
    if (y + ROW_H <= alcove.y - T || y === lastRow) {
      const right: Rect = { x: aisle[1], y, w: rE.x + rE.w - aisle[1], h: ROW_H };
      ctx.walls.push({ ...right, low: true, kind: 'seatrow', why: whySeats });
      seatRects.push(right);
    }
  }
  /*
   * The cinema screen is the chapter's MIRROR, and it is now the SAME OBJECT the
   * venue draws.
   *
   * It used to be a mirror segment across the room's outer wall (`rE.y + rE.h`,
   * 20 px in from each side) plus a `screen` PROP of its own — and the venue
   * already draws `screen-E` from `roomScreen()`, so the room had two screens in
   * it. The prop was the worse of the two by a distance: 5.2 m tall against the
   * real screen's 2.75, wider than it, standing between the fixed camera and the
   * floor, and with a collider under only the middle two thirds of it. It hid the
   * entire front of cinema E — every square metre of the route from the aisle to
   * the alcove — and you could walk through the ends of it.
   *
   * So the prop is gone and the mirror sits on the face of the screen that is
   * actually in the room. Same beat, one object.
   */
  const screenE = roomScreen(rE);
  mirrors.push({ x0: screenE.x, x1: screenE.x + screenE.w, y: screenE.y, ny: -1 });

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
    // Just inside the MOUTH of the alcove, not at the back of it: that is where
    // the bounce off the screen arrives, and it is the part of the pocket the
    // camera looks straight into.
    y: alcove.y + alcove.h - 18,
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

    // Backspace takes one back. A four-digit field with no way to correct a
    // fat-fingered press makes the player wait for it to fill up and be wrong.
    if (nearPad && input === 'Backspace' && entered.length > 0) {
      entered = entered.slice(0, -1);
      return;
    }

    if (nearPad && /^Digit\d$/.test(input)) {
      // Only the pad's own alphabet goes in. A 0-3 here is a player using the
      // robot switcher while parked at the door, and swallowing it as a digit
      // would fill the field with keys they never meant for it.
      if (!/^Digit[4-9]$/.test(input)) {
        ctx.flash(`${b.name}: this keypad is 4 to 9. ${input[5]} is a robot, not a digit`);
        return;
      }
      entered += input[5];
      if (entered.length === 4) {
        if (entered === code) done();
        else {
          // In the robot's own voice, and it says what it tried — a bare "Wrong
          // code" leaves the player unsure the pad even took the digits.
          ctx.flash(
            b.kind === 'voxxy'
              ? `Voxxy: ${entered}. Nope. Clearing it — say the digits again, in order`
              : b.kind === 'droid'
                ? `Droid: ${entered} rejected. Four digits, positions 1 to 4. Order matters`
                : `Biggy: ${entered}. Still shut. Someone check the order`,
          );
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
    /*
     * The one line that tells the player the mirror exists.
     *
     * Michele could not solve cinema E, and the reason a bounce puzzle is hard is
     * that nothing ever says a bounce is happening: Biggy is shut out of the aisle,
     * so the only feedback he gets from walking into that room is a refusal. The
     * moment his flood actually throws a secondary source off the screen — which
     * only happens when he is in cinema E, in range, pointing at it — he says so,
     * once.
     */
    if (!mirrorHinted && !clues[3].found && lights.some((L) => L.owner === 'biggy' && !L.primary)) {
      mirrorHinted = true;
      ctx.flash('Biggy: my light is coming back off the screen — swing it until the bounce lands in the exit alcove', 3500);
    }
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
      // No `screen` prop: `buildVenue()` draws cinema E's screen from
      // `roomScreen()` like every other house's, and the mirror now sits on that
      // one. See the comment where `mirrors` is built.
      { kind: 'alcove', ...alcove, state: 'idle', label: 'exit alcove' },
    ];
    for (const r of seatRects) out.push({ kind: 'seatrow', ...r, state: 'idle' });
    // The scenery cinemas' doors, so the wall behind each joke is something you
    // can see rather than something you bump into.
    for (const n of Object.keys(SHUT_VOICES)) out.push({ kind: 'lock', ...leaf(roomDoor(R(n))), state: 'shut' });
    if (!panelOn) out.push({ kind: 'lock', ...leaf(dB), state: 'shut' });
    /*
     * The jammed door is emitted whatever state it is in.
     *
     * It used to vanish from this list on the frame it broke, so the biggest
     * physical thing the player does in the chapter had no picture at all: the door
     * did not open, it ceased to exist. Broken, it keeps its place and carries
     * `progress`; the leaf ends up lying on the cinema floor where Biggy put it,
     * which is the trophy.
     */
    out.push({ kind: 'jammed', ...leaf(dE), state: jamBroken ? 'broken' : 'shut', progress: jamFall });
    /*
     * The joke on each closed cinema's door — a NOTICE taped to the leaf, not a
     * hoarding parked in the doorway.
     *
     * It used to be `kind: 'sign'`, which `src/render/scene.ts` draws as a
     * 4.8 m-class box 2.2 m tall standing on the FLOOR, centred on the doorway.
     * So every closed cinema had a second, featureless slab planted across its
     * entrance with nothing under it: Michele, twice, *"The room door is still big
     * and walked on"*, and from the corridor it also blanked out the view into
     * cinema E — the room he could not solve.
     *
     * `poster` is the spec that already means "a printed thing on a wall": 0.62 m
     * of panel hung at 0.95 m, with its own standby glow so it reads in a
     * blackout. Hung, so it is not something you walk into in the first place.
     */
    for (const n of Object.keys(CLOSED_JOKES)) {
      // Cinema E's notice goes down with the door Biggy puts through the wall.
      if (n === 'E' && jamBroken) continue;
      const d = roomDoor(R(n));
      out.push({ kind: 'poster', x: d.cx - 13, y: d.y, w: 26, h: 4, label: CLOSED_JOKES[n] });
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
