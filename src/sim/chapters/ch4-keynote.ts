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
 *   Droid — finishes the #DEVOXX sign: the crew stood up #DEV, and the O and both
 *           X's are leaning in the wing. One at a time, each into its own gap.
 *           (It was a banner between two hooks until 28 Sep — `src/sim/letters.ts`.)
 *   Voxxy — lights the four spotlights in order, which needs the fast robot.
 *
 * The clock is the crowd: the first attendees arrive after `HEAD` seconds and fill
 * the room over `ARRIVAL`. Miss it and the keynote starts with a half-built stage.
 */

import { CY0, CY1, F1, R, VIEW_DEVOXX, VIEW_REEL, floor1Walls, roomDoor } from '../geometry';
import { MOUNT_REACH, SPEED_SCALE, TRAVEL_TIME_SCALE } from '../constants';
import { botsCollide, circleRect, dist, inRect, mkBody, partyTrick, speed, standOff, stepBot, syncMount } from '../bot';
import { LANYARD, lanyardFor } from '../lanyards';
import {
  LETTER_D,
  LETTER_PITCH,
  LETTER_REACH,
  LETTER_W,
  SIGN,
  SIGN_MISSING,
  SIGN_STANDING,
  SLOT_REACH,
  letterName,
  loadDroid,
  signText,
} from '../letters';
import { FRONT_ROW, SPEAKER_LOOKS } from '../speakers';
import { buildReel, reelAt, reelLength } from '../reel';
import type { Bot, Person, Prop, Rect, ReelCard, ReelView, RobotKind, Task, Vec2, Wall } from '../types';

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
/**
 * Clear floor between the cake's mark and the first letter of the sign, sim px.
 *
 * The cake comes up the west aisle onto the west third of the stage and the sign
 * stands along the back of the middle of it, so this is the gap that keeps a cake
 * shoved square onto its mark from grazing the `#`.
 */
const SIGN_CLEAR = 4;
/**
 * How far in front of the screen wall the sign's back face stands, sim px.
 *
 * Three pixels is 24 cm, and it is a number with a job: Voxxy, the smallest of
 * them, is 9.5 px across, so nothing can get in BEHIND the sign and be trapped
 * between the letters and the screen when the next one goes up.
 */
const SIGN_BACK = 3;
/**
 * The way a letter faces: out at the house. In the sign, and leaning in the wing
 * too — the wing's back wall is in line with the screen, so a letter leaning on it
 * shows the room its face.
 */
const FACE_HOUSE = Math.PI / 2;
/** Centre-to-centre spacing of the three letters leaning in the wing, sim px. */
const WING_PITCH = 14;
/** Clear floor between the end of the screen wall and the first letter in the wing, sim px. */
const WING_CLEAR = 6;
/** How close Voxxy must pass a spotlight to switch it on. */
const SPOT_REACH = 22;
/**
 * Biggy's shove on the crate, px/s^2 — a crate is not a robot, it just slides.
 *
 * An acceleration is a velocity per second, and the rescale moved the velocity axis
 * and left the time axis alone, so it carries `SPEED_SCALE` like every speed does.
 */
const CRATE_FORCE = 1500 * SPEED_SCALE;
/**
 * How far past touching Biggy can be and still be pushing, sim px.
 *
 * Michele, 28 Sep 2026: *"Pushing should be a bit easier, i didn't manage."* The
 * window was 6 px on top of the two radii and the lean had to be within 72° of
 * dead on (`PUSH_LEAN_MIN`), so a shove that was a hair off-centre slid round the
 * board instead of moving it and there was no feedback saying why. This is 16,
 * the lean is `CAKE_LEAN`, and the force is two thirds up — a cake on a wheeled
 * board is not a crate of beer, and the chapter's first job should not be the
 * hardest thing in the game.
 */
const CAKE_TOUCH = 16;
/** ...and how square to it he has to be pushing. Wider than a robot-on-robot shove. */
const CAKE_LEAN = 0.12;
/**
 * How much of the push follows BIGGY'S STICK rather than the line of contact, 0..1.
 *
 * Michele, 28 Sep 2026: *"the cake movement is a bit imprevedible, especially
 * west-east. I haven't managed to place it."* Two discs in contact decide the
 * direction between them, so a push a few pixels off centre left down the aisle,
 * and the correction that follows sends it back the other way. 0.45 leaves the
 * contact normal the larger share — push a corner and it still turns, which is
 * how you aim it — while a trolley pushed east goes east.
 */
const CAKE_STEER = 0.7;
/**
 * How fast the board's SIDEWAYS velocity dies while he is pushing it, per second.
 *
 * Castors: wheels roll one way and scrub the other. 6 s^-1 is a third of a second
 * for the drift to fall to a fifth, so a glancing contact nudges the line instead
 * of committing the cake to a diagonal it keeps for two metres. It only applies
 * while somebody is actually pushing — a board he has let go of coasts on its own
 * drag, exactly as before.
 */
const CAKE_SCRUB = 10;
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
  /** Stable identity for the renderer's body-builder. See `Person.seed`. */
  seed: number;
  walk: number;
  colour: string;
  seat: Seat;
  /** 0 corridor → 1 doorway → 2 back of the room → 3 aisle → 4 row → seated. */
  leg: number;
  aisleX: number;
  seated: boolean;
  hitCd: number;
}

/**
 * One letter of the #DEVOXX sign, wherever it is.
 *
 * `rect` and `face` are where and which way it STANDS — in its gap in the sign, or
 * leaning on the wing's wall — and mean nothing while Droid is holding it, when it
 * is drawn in his hands. `wall` is its collider for as long as it stands anywhere:
 * a 1.1 m letter is not something a robot walks through (`tests/colliders.test.ts`).
 */
interface Letter {
  /** Its gap in the sign, 0..6; `SIGN[slot]` is its glyph. */
  slot: number;
  at: 'sign' | 'wing' | 'held';
  rect: Rect;
  face: number;
  wall: Wall | null;
}

export interface KeynoteState {
  chapter: 4;
  cake: boolean;
  /** How many of the three missing letters are up in the sign, 0..3. */
  letters: number;
  /** The sign as it reads: `#DEV___` .. `#DEVOXX` (`signText`). */
  sign: string;
  /** The slot of the letter Droid is carrying, or -1. */
  carrying: number;
  spots: number;
  /** Which spotlight is next, 1..4. */
  nextSpot: number;
  ready: boolean;
  seated: number;
  crowd: number;
  complaints: number;
  /** Seconds of slack left when the stage was finished. */
  spare: number;
  /** Seconds a full room has spent waiting for an unfinished stage. */
  restless: number;
  /** Seconds into the opening video, or -1 while it is not playing. */
  reelT: number;
}

/** Seconds between one line from the room and the next. */
const MURMUR_EVERY = 9;
/**
 * What three thousand people do while they wait, in order, cycled.
 *
 * Cycled rather than randomised, like Stephan's lines in chapter 3: a line you can
 * get back to is a line the player can read, and the escalation is the joke — a
 * slow clap, then the noise, then somebody opening a laptop, which is the worst
 * thing an audience can do to you.
 */
const MURMURS: readonly string[] = [
  'The room is full and the stage is not. Somebody in row four starts a slow clap. It does not catch on.',
  'Three thousand people, one unfinished stage. The murmur goes up a semitone.',
  'From somewhere near the back: <b>"IS IT AN OUTOFMEMORYERROR?"</b> Laughter. Not kind laughter.',
  'A man in the fourth row has opened his laptop and started working. That is worse than heckling.',
  'Stephan, from the wings, to nobody: "Any minute now." Nobody believes him.',
  'Two rows have started a conversation about the parking. You are losing them.',
];

const KEYS = '1/2/3/Tab: switch · WASD · E: use / hold Biggy / Voxxy jumps · R: restart \u00b7 I: run sheet \u00b7 H: hint \u00b7 P: physics \u00b7 C: credits';
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
    flavour: true,
    why: (b) => `${b.name}: the fire door is shut again — the cinema section is closed to the public`,
  });
  ctx.walls.push({ x: 0, y: CY0, w: F1.fireX, h: CY1 - CY0, hidden: true });

  const r8 = R(8);
  const d8 = roomDoor(r8);
  const cx = r8.x + r8.w / 2;
  const top = r8.y;

  /*
   * At the back of the stage, beside the sign's last letter — where presenters
   * stand next to the #DEVOXX letters — rather than mid-stage, where they stood
   * before the sign went up (`cx + 40 / + 70, top + 30`).
   *
   * Measured, not guessed: mid-stage they left a 4 px lane for Droid's centre
   * between the finished letters and Stephan, and the test pilot's route from the
   * wing to the O's gap went down one aisle, across the back of the room and up
   * the other — 17 s a trip instead of 5. Standing here they leave the whole front
   * of the stage open between the wing and the gaps (24 px of lane), the top of
   * the east aisle clear for Biggy, and the curtain call's marks 36 px away.
   */
  const stephan = { x: cx + 44, y: top + 16, r: 8 };
  const speakerAt = { x: cx + 64, y: top + 17, r: 7 };

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
      flavour: true,
      why: (b) => `${b.name}: seats. Use the aisles`,
    });
  }

  const crate = mkBody('cake', d8.cx + 130, 350, { r: 17, mass: 20, drag: 2.2, accel: 0, max: 160 * SPEED_SCALE });
  const stage: Rect = { x: cx - 110, y: top + 6, w: 220, h: 50 };
  const crateMark: Rect = { x: cx - 100, y: top + 12, w: 44, h: 34 };

  /*
   * THE SIGN — `#DEVOXX` along the back of the stage, between the cake's mark and
   * Stephan, in front of the house screen, which is where the photograph has it.
   *
   * Its back face stands `SIGN_BACK` off the screen wall's front, read off the wall
   * itself rather than retyped. The crew got the first four up; the other three
   * lean against the back wall of the east wing, one stash, just past the end of
   * the screen and a few metres from their gaps — Michele: *"Droid is already
   * slow, so don't scatter the letters around."* They lean O, X, orange X from the
   * stage outwards, so the one nearest the stage is the next one the sign wants and
   * a player who takes them as they come watches it spell itself.
   *
   * The back wall and not the room's east wall, where they first leaned: 70 px
   * nearer the gaps, which is three seconds a round trip for the slowest robot in
   * the game, three times over.
   */
  const screen = ctx.walls.find((w) => w.kind === 'screen' && w.x < cx && w.x + w.w > cx && w.y < top + 20);
  const signTop = (screen ? screen.y + screen.h : stage.y) + SIGN_BACK;
  const slotRect = (slot: number): Rect => ({
    x: crateMark.x + crateMark.w + SIGN_CLEAR + slot * LETTER_PITCH,
    y: signTop,
    w: LETTER_W,
    h: LETTER_D,
  });
  const centre = (r: Rect): Vec2 => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  /** A standing letter's collider: its own footprint, nothing more. */
  const standUp = (l: Letter): void => {
    l.wall = { ...l.rect, kind: 'letter' };
    ctx.walls.push(l.wall);
  };
  const wingX = (screen ? screen.x + screen.w : stage.x + stage.w) + WING_CLEAR;
  const letters: Letter[] = [...SIGN].map((_, slot) => {
    const standing = slot < SIGN_STANDING;
    const j = slot - SIGN_STANDING;
    const l: Letter = standing
      ? { slot, at: 'sign', rect: slotRect(slot), face: FACE_HOUSE, wall: null }
      : {
          slot,
          at: 'wing',
          // Leaning on the wing's back wall, eight centimetres off it, face out.
          rect: { x: wingX + j * WING_PITCH, y: top + 1, w: LETTER_W, h: LETTER_D },
          face: FACE_HOUSE,
          wall: null,
        };
    standUp(l);
    return l;
  });
  const held = (): Letter | undefined => letters.find((l) => l.at === 'held');
  const up = (slot: number): boolean => letters[slot].at === 'sign';
  const lettersUp = (): number => letters.filter((l) => l.at === 'sign').length - SIGN_STANDING;
  const signDone = (): boolean => letters.every((l) => l.at === 'sign');
  const sign = (): string => signText(up);

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

  /*
   * THE FRONT ROW IS RESERVED FOR THE SPEAKERS.
   *
   * Michele, 28 Sep 2026, on the ending: every face met on the hall floor in
   * chapter 3 is sat in Room 8's front row for the keynote — Mario, Venkat,
   * Josh, Lize, Aurélie, middle block, from the start of the chapter. Their seats
   * are taken before the crowd's seat order is handed out, so nobody arrives to
   * find a speaker in their chair, and the crowd count is unchanged.
   */
  const frontY = Math.min(...seats.map((q) => q.y));
  const midX = (aisles[0][1] + aisles[1][0]) / 2;
  const reserved = seats
    .filter((q) => q.y === frontY && q.x > aisles[0][1] && q.x < aisles[1][0])
    .sort((a, b) => Math.abs(a.x - midX) - Math.abs(b.x - midX))
    .slice(0, FRONT_ROW.length)
    .sort((a, b) => a.x - b.x);
  for (const q of reserved) q.taken = true;

  const crowd: Attendee[] = [];
  /** Hands out `Person.seed` — monotonic, never reused. See `Person.seed`. */
  let nextSeed = 1;
  const N = Math.min(84, seats.length);
  let t = 0;
  let complaints = 0;
  /**
   * How long a full room has been sitting in front of an unfinished stage.
   *
   * Michele, 28 Sep 2026: *"Game does not end if room is full, but some rumors
   * from the crowd?"* It used to be a hard fail — the room filled, the chapter
   * stopped, and a player two jobs from the end was handed a card telling them to
   * press R. Three thousand people arriving early does not cancel a keynote; it
   * makes a noise. So the clock runs, the room gets louder, the score remembers
   * it (`late`, and these seconds), and the player finishes the chapter they were
   * most of the way through.
   */
  let restless = 0;
  let murmurAt = 0;
  let murmurs = 0;
  let wasFull = false;
  let seated = 0;
  let ready = false;
  let spare = 0;
  let ended = false;

  ctx.objective(
    `Chapter 4 · <b>Keynote</b>. Top of the main staircase — the crowd is right behind you: first attendees in ${Math.round(HEAD)}s, ${Math.round(ARRIVAL)}s to fill Room 8, front rows first. Before they sit: <b>Biggy</b> pushes the cake onto the stage, <b>Droid</b> finishes the <b>#DEVOXX</b> sign (the O and both X's lean in the wing — E to lift one, E at its gap), <b>Voxxy</b> lights spotlights 1→4. Then <b>all three on stage</b> with Stephan and the speaker.`,
    KEYS,
  );
  ctx.card(
    '<b>Up the main staircase.</b><br>' +
      '<span class="sub">Room 8 has to be ready before 746 people sit down — the cake is still in the corridor, and the sign on the stage stops at #DEV.</span>' +
      '<small>Press any key</small>',
  );

  /* ------------------------------------------------------------- the audience */

  function spawnAttendee(): void {
    const seat = seats.find((s) => !s.taken);
    if (!seat) return;
    seat.taken = true;
    const a = mkBody('attendee', stair.x + 20, CY0 + 30 + ctx.rng() * 40, { r: 5, mass: 0.5 }) as Attendee;
    a.seed = nextSeed++;
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
  const jobsDone = (): boolean => cakeOnMark() && signDone() && spots.every((s) => s.on);
  const allOnStage = (): boolean => ctx.bots.every((b) => inRect(b, stage));

  /* --------------------------------------------------------------------- keys */

  /**
   * The #DEVOXX letters — and the first chapter to hand `E` back.
   *
   * Returning `false` is not "nothing happened", it is this chapter saying `E`
   * means nothing where the player is standing, so `game.ts` may spend it on a
   * hop or on taking hold of Biggy (see `ChapterRuntime.key`). Everything this
   * room wants `E` for is Droid and a letter; the rest of it — a room with two
   * aisles, three blocks of seats and a crowd arriving — is exactly the place to
   * be jumping around in.
   *
   * A refusal that names a reason KEEPS the key (Michele's own rule, from the
   * Sticker Mine): Voxxy or Biggy at the stash say why it is Droid's job instead
   * of hopping, and Droid with his hands full says where the letter goes instead
   * of taking hold of Biggy with a 1.1 m O in his arms.
   */
  function key(code: string): boolean {
    if (reelKey()) return true;
    const b = ctx.bots[ctx.cur];
    ctx.switchKey(code);
    if (code !== 'KeyE') return false;
    if (b.kind === 'droid') return droidE(b);
    const l = leaning(b);
    if (!l) return false;
    ctx.flash(
      b.kind === 'voxxy'
        ? "Voxxy: it's as big as I am. I can carry it or see where I'm going, not both — Droid can see over it"
        : `Biggy: these hands are for pots. An ${SIGN[l.slot]} has no handle — Droid has the arms for it`,
    );
    return true;
  }

  /** The nearest letter still leaning in the wing that `b` could take hold of, if any. */
  function leaning(b: Bot): Letter | undefined {
    let best: Letter | undefined;
    let bestD = LETTER_REACH;
    for (const l of letters) {
      if (l.at !== 'wing') continue;
      const d = dist(b, centre(l.rect));
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  /** Droid's `E`: lift the letter in reach, or set the one in his hands into its gap. */
  function droidE(d: Bot): boolean {
    const h = held();
    if (h) return setDown(d, h);
    const l = leaning(d);
    if (!l) return false;
    l.at = 'held';
    if (l.wall) ctx.removeWall(l.wall);
    l.wall = null;
    loadDroid(d, true);
    ctx.flash(`Droid lifts the ${letterName(l.slot)} — its gap is ${gapOf(l.slot)}`);
    return true;
  }

  /** Where a letter's gap is, in words: by the letters either side of it. */
  function gapOf(slot: number): string {
    if (slot === SIGN.length - 1) return `on the end, after the ${letterName(slot - 1)}`;
    return `between the ${letterName(slot - 1)} and the ${letterName(slot + 1)}`;
  }

  /**
   * Set the letter Droid is carrying into its own gap in the sign.
   *
   * Only AT its gap (`SLOT_REACH`): anywhere-on-the-stage would be a letter jumping
   * two metres out of his hands. And never onto a robot — whoever is standing in
   * the gap would have 1.1 m of letter put down through them, and the collider
   * that comes with it would squeeze them out of the back of the sign.
   */
  function setDown(d: Bot, l: Letter): boolean {
    const gap = slotRect(l.slot);
    if (dist(d, centre(gap)) > SLOT_REACH) {
      ctx.flash(
        inRect(d, stage)
          ? `Droid: the ${letterName(l.slot)} goes ${gapOf(l.slot)} — at the back of the stage`
          : `Droid: the ${letterName(l.slot)} goes in the sign, on the stage — ${gapOf(l.slot)}`,
      );
      return true;
    }
    const inTheWay = ctx.bots.find((o) => circleRect(o, gap) !== null);
    if (inTheWay) {
      ctx.flash(
        inTheWay === d
          ? `Droid: I am standing where the ${letterName(l.slot)} goes. A step back`
          : `Droid: ${inTheWay.name} is standing where the ${letterName(l.slot)} goes`,
      );
      return true;
    }
    l.at = 'sign';
    l.rect = gap;
    l.face = FACE_HOUSE;
    standUp(l);
    loadDroid(d, false);
    const left = SIGN_MISSING - lettersUp();
    ctx.flash(left === 0 ? `${sign()} — the sign is up!` : `${sign()} — ${left} to go`);
    return true;
  }

  /* -------------------------------------------------------- the opening video
   *
   * Michele: *"Devoxx usually starts with a video. We could have one recapping the
   * robots adventures.. or bloopers?"*, then *"Movie approved, build it."*
   *
   * The game ends the way the conference starts. The three of them reach the stage,
   * the house screen behind them wakes up, and Devoxx's opening video plays — cut
   * from the night the player has just had (`src/sim/reel.ts`). Only then does the
   * final card come up.
   *
   * The chapter owns the clock and the cards; the renderer is handed one card and a
   * fade. `setView` pulls in on the screen for the length of it, because the payoff
   * of a video is being able to read it.
   */
  let reelCards: ReelCard[] = [];
  let reelT = -1;
  /**
   * Seconds the stage has been holding its pose BEHIND the final card, or -1.
   *
   * Michele, 28 Sep 2026, on the ending: *"the score card still arrives over a
   * frozen frame"*, then *"what is your suggestion?"* — and the answer was: do not
   * cut, kill the freeze. What read as dead at the end was never the single shot.
   * It was this: the video finished, the camera jumped back out to the wide room,
   * `finish()` put the card up, and `game.ts` stops the sim dead while a card is
   * showing — so the last thing the player saw was three thousand people stopped
   * mid-clap behind a photograph of themselves.
   *
   * So the run's last card is the one card the room plays on behind. The framing
   * stays where the video was, the crowd keeps walking, the applause stays up, and
   * the tower stands with the small one still jumping off it. (It is `curtainHeld`
   * rather than `held`, which in this chapter is the letter Droid is carrying.)
   * Only when the video RAN, though: a player who skipped it skipped the act with it, and holding a
   * half-finished bow behind the card is worse than holding nothing.
   */
  let curtainHeld = -1;

  function startReel(): void {
    reelCards = buildReel(ctx.score, ctx.swag, ctx.t, ctx.skipped);
    reelT = 0;
    dealMarks();
    ctx.setView(VIEW_REEL);
    ctx.flash('The house screen wakes up. <b>Devoxx opening video</b> \u2014 any key to skip', 3200);
  }

  /** True if the reel took the key. Any key skips to the final card. */
  function reelKey(): boolean {
    if (reelT < 0) return false;
    endReel(true);
    return true;
  }

  function endReel(skipped: boolean): void {
    reelT = -1;
    // Skipped: the camera goes back out to the room and everything stops, which is
    // what a player who pressed a key to get past this asked for. Ran to the end:
    // keep the shot, and keep the room alive behind the card — see `curtainHeld`.
    if (skipped) ctx.setView(VIEW_DEVOXX);
    else curtainHeld = 0;
    ctx.finish();
  }

  /* --------------------------------------------------- the curtain call ---- */

  /**
   * WHAT THE ROBOTS DO WHILE THE VIDEO PLAYS.
   *
   * The reel was the ending and the ending was typography: the house screen woke
   * up, the cards came and went, and the three of them stood exactly where the
   * player had parked them for the whole twenty seconds. A video of your own night
   * playing over a still photograph of yourself is not an ending, it is a pause.
   *
   * So the video has a stage act in front of it, and the act is built out of the
   * verbs the game already has rather than out of new ones: they take their marks
   * on the apron, turn to the house, and then take it in turns — Voxxy hops, Biggy
   * rolls, Droid unfolds — which is exactly `partyTrick`, the thing Michele asked
   * for on 25 Sep (*"Could we add a basic action to each robot on E?"*) and the one
   * place in the game where all three of those read as a performance instead of as
   * three separate showings-off. Then Droid climbs Biggy, the tower the whole cast
   * has been building towards since chapter 1, and holds it while the credits run.
   *
   * THEY WALK THERE ON THEIR OWN LEGS. Every beat below writes an input vector and
   * then runs the ordinary `stepBot` — the same acceleration, drag and top speed
   * the player drives against, so nothing here can put a robot above its own
   * `max`. It is `stepBot` and not `ctx.stepAll` because `stepAll` hands the stick
   * to whichever robot the player last selected and zeroes the other two, which is
   * exactly right for play and exactly wrong for a script. The marks are on the
   * apron, clear of the cake's mark, Stephan and the speaker.
   */
  const apron = stage.y + stage.h - 12;
  const marks: Vec2[] = [
    { x: cx - 46, y: apron },
    { x: cx - 10, y: apron },
    { x: cx + 20, y: apron },
  ];
  const callMarks: Record<RobotKind, Vec2> = { voxxy: marks[0], biggy: marks[1], droid: marks[2] };
  /** Which side of Biggy Droid climbs from: +1 stage right, -1 stage left. */
  let climbSide = 1;

  /**
   * Where Droid stands to climb, read off Biggy where he actually is.
   *
   * Aimed a pixel INSIDE him rather than a pixel outside: `driveTo` gives up
   * within `MARK_REACH` of its target, and Biggy is allowed the same slack on his
   * own mark, so a target at arm's length can leave a gap of two slacks — wider
   * than `MOUNT_REACH`, and Droid stands there for the rest of the video with his
   * hand out. Aimed to touch, the slack cannot push it past the reach, and
   * `botsCollide` is what actually stops him, which is the honest version of
   * "close enough to climb".
   */
  function climbPoint(d: Bot, bg: Bot): Vec2 {
    return { x: bg.x + climbSide * (bg.r + d.r - 1), y: bg.y };
  }

  /**
   * WHO GETS WHICH MARK — decided when the video starts, from where they are.
   *
   * Marks nailed to roles (Voxxy stage left, Biggy centre, Droid stage right) is
   * the obvious version and it is wrong, because the player parks them in whatever
   * order they please: the first cut had Biggy walking from stage right to a
   * centre mark straight through Droid, the two of them shoving each other for the
   * whole video, and a Biggy who never stood still long enough for anyone to climb
   * him. Robots do not walk through each other, so the choreography has to not ask
   * them to.
   *
   * So the three marks are three PLACES, and they are dealt out to whoever is
   * nearest — the assignment with the least total walking, which is the one with
   * no crossings. The one constraint is the finale: Droid's mark must be NEXT to
   * Biggy's, or there is a small orange robot standing between the tower's two
   * halves. Four of the six orderings satisfy that, and the cheapest of the four
   * is the shot.
   */
  const PERMS: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  function dealMarks(): void {
    const order: RobotKind[] = ['voxxy', 'biggy', 'droid'];
    let best = PERMS[0];
    let bestCost = Infinity;
    for (const perm of PERMS) {
      // Droid beside Biggy, or the tower has a gap in it.
      if (Math.abs(perm[1] - perm[2]) !== 1) continue;
      let cost = 0;
      for (let i = 0; i < 3; i++) {
        const b = ctx.byKind(order[i]);
        cost += Math.hypot(marks[perm[i]].x - b.x, marks[perm[i]].y - b.y);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = perm;
      }
    }
    for (let i = 0; i < 3; i++) callMarks[order[i]] = marks[best[i]];
    // He climbs from his own side, so he never has to cross in front of Biggy.
    climbSide = callMarks.droid.x > callMarks.biggy.x ? 1 : -1;
  }
  /** The beats, seconds into the video. */
  const BEAT_VOXXY = 2.4;
  const BEAT_BIGGY = 4.6;
  const BEAT_DROID = 6.8;
  /** He stops being a soloist and goes and stands by Biggy. */
  const BEAT_CLOSE = 9.4;
  const BEAT_CLIMB = 10.8;
  /** ...and she keeps hopping, this often, for as long as the reel runs. */
  const ENCORE = 3.2;
  /** Seconds for the room to come up to full applause. */
  const CHEER_RISE = 3;
  /** How close to a mark counts as standing on it, px. */
  const MARK_REACH = 3;
  /** Inside this the target speed eases off, so a heavy robot brakes into its mark. */
  const MARK_SLOW = 14;
  /** Which beats have fired. Each one fires once; the reel's clock never rewinds. */
  let beats = 0;
  let encoreAt = 0;

  /**
   * Point a robot at a mark with its own stick. True once it is standing on it.
   *
   * A stick held flat at the mark until the last pixel is how the first cut of
   * this was written, and Biggy — 130 kg, `accel` 0.6, and drag that takes a
   * second to bite — orbited his mark for the whole video and was therefore never
   * still enough for Droid to climb. So the stick steers at the VELOCITY ERROR
   * rather than at the mark: a target speed that eases to nothing inside
   * `MARK_SLOW`, minus what the robot is already doing, which brakes a heavy body
   * into its mark instead of throwing it past. On the mark the velocity is
   * cleared outright — the same thing `cutUpdate`'s hold does, and for the same
   * reason: a shot lands on a pose, not on a wobble.
   */
  function driveTo(b: Bot, to: Vec2): boolean {
    const dx = to.x - b.x;
    const dy = to.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < MARK_REACH) {
      b.ix = 0;
      b.iy = 0;
      b.vx = 0;
      b.vy = 0;
      return true;
    }
    const want = Math.min(1, d / MARK_SLOW) * b.max;
    const ex = (dx / d) * want - b.vx;
    const ey = (dy / d) * want - b.vy;
    const el = Math.hypot(ex, ey) || 1;
    b.ix = ex / el;
    b.iy = ey / el;
    return false;
  }

  /**
   * That robot's own party trick, with the rest timer forgiven.
   *
   * `partyTrick` refuses a robot that is still catching its breath, which is the
   * right answer to a player leaning on `E` and the wrong one to a script that has
   * timed the beats itself. Nothing else about it is bypassed — a mounted Droid
   * still cannot stretch and a Biggy with a passenger still cannot roll, and both
   * of those are true on this stage.
   */
  function trick(b: Bot): void {
    b.hopRest = 0;
    partyTrick(ctx.bots, b, () => {});
  }

  function curtainCall(dt: number, at: number): void {
    const d = ctx.byKind('droid');
    const bg = ctx.byKind('biggy');
    const vx = ctx.byKind('voxxy');
    const closing = at >= BEAT_CLOSE && !d.mounted;
    const parked: Bot[] = [];
    for (const b of ctx.bots) {
      if (b.mounted) continue;
      if (driveTo(b, b.kind === 'droid' && closing ? climbPoint(d, bg) : callMarks[b.kind])) parked.push(b);
    }
    for (const b of ctx.bots) stepBot(b, dt, ctx.walls);
    syncMount(ctx.bots);
    for (let i = 0; i < ctx.bots.length; i++) {
      for (let j = i + 1; j < ctx.bots.length; j++) botsCollide(ctx.bots[i], ctx.bots[j]);
    }
    // Standing still, they face the house — the far, high-y end of the room, where
    // three thousand people are. `stepBot` turns a robot that is moving, so this
    // only ever settles the ones that have arrived.
    for (const b of parked) b.face = Math.PI / 2;

    if (beats < 1 && at >= BEAT_VOXXY) {
      beats = 1;
      trick(vx);
    }
    if (beats < 2 && at >= BEAT_BIGGY) {
      beats = 2;
      trick(bg);
    }
    if (beats < 3 && at >= BEAT_DROID) {
      beats = 3;
      trick(d);
    }
    if (beats < 4 && at >= BEAT_CLIMB && dist(d, bg) - d.r - bg.r < MOUNT_REACH) {
      beats = 4;
      ctx.toggleMount();
      encoreAt = at + ENCORE;
    }
    // The tableau, held to the last card: the tower stands and the small one will
    // not stop jumping.
    if (beats >= 4 && at >= encoreAt && (vx.hopRest ?? 0) <= 0) {
      encoreAt = at + ENCORE;
      trick(vx);
    }
  }

  /* ------------------------------------------------------------------- update */

  /**
   * The stage, held behind the final card: the room keeps walking and clapping,
   * and the tower stands with the small one still jumping. See `held`.
   *
   * It runs the same curtain call on a clock of its own, started where the video
   * left off, so every beat is already spent and what is left is the encore.
   */
  function behindCard(dt: number): void {
    if (curtainHeld < 0) return;
    curtainHeld += dt;
    for (const a of crowd) stepAttendee(a, dt);
    curtainCall(dt, reelLength(reelCards) + curtainHeld);
  }

  function update(dt: number): void {
    if (reelT >= 0) {
      /*
       * The room is finished: nobody drives and no job is live. The CROWD keeps
       * walking, though — three thousand people do not freeze because a video
       * started, and a still room under a playing screen reads as a crash.
       */
      reelT += dt;
      for (const a of crowd) stepAttendee(a, dt);
      curtainCall(dt, reelT);
      if (reelT >= reelLength(reelCards)) endReel(false);
      return;
    }
    t += dt;
    ctx.stepAll(dt);
    ctx.pushBiggy(dt);
    const bg = ctx.byKind('biggy');
    const v = ctx.byKind('voxxy');

    // Stephan and the speaker are standing on the stage floor, not painted on
    // it — the same fix as chapter 3's ("voxy passes though a person?").
    for (const b of ctx.bots) {
      standOff(b, stephan);
      standOff(b, speakerAt);
    }

    stepBot(crate, dt, ctx.walls);
    for (const b of ctx.bots) botsCollide(b, crate, 0.1);
    /*
     * BIGGY PUSHES THE CAKE, and it goes where he is pushing.
     *
     * Michele, 28 Sep 2026: *"the cake movement is a bit imprevedible, especially
     * west-east. I haven't managed to place it."* He is describing two discs. The
     * push used to be pure contact physics — force along the line from his centre
     * to the crate's — and two round bodies in contact are a knife edge: a couple
     * of pixels off centre turns a push into a glance, the board slides away at an
     * angle, he chases it, and it is off again the other way. Down a long aisle
     * that reads as a board with a mind of its own, which is exactly the note.
     *
     * Two things fix it, and both of them are what a CAKE ON A WHEELED BOARD
     * actually does rather than what two billiard balls do:
     *
     *  - **He steers it** (`CAKE_STEER`). The push direction is the contact normal
     *    blended towards the stick, so a hand on the back of a trolley pointing
     *    east sends it east even when the hand is not exactly on the centre line.
     *    The normal still has the larger share, so pushing off one corner still
     *    turns it — the steering is the mechanic, the wandering was the bug.
     *  - **The castors scrub** (`CAKE_SCRUB`). Wheels roll one way and resist the
     *    other, so the part of the board's velocity that is ACROSS the push decays
     *    fast while the part along it is untouched. Sideways drift dies in a third
     *    of a second instead of carrying on for two metres.
     *
     * Everyone else still just bumps into it.
     */
    const dx = crate.x - bg.x;
    const dy = crate.y - bg.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 0) {
      const nx = dx / dd;
      const ny = dy / dd;
      const lean = bg.ix * nx + bg.iy * ny;
      if (dd < bg.r + crate.r + CAKE_TOUCH && lean > CAKE_LEAN) {
        // Where the push goes: the contact normal, steered towards his stick.
        const il = Math.hypot(bg.ix, bg.iy) || 1;
        let px = nx * (1 - CAKE_STEER) + (bg.ix / il) * CAKE_STEER;
        let py = ny * (1 - CAKE_STEER) + (bg.iy / il) * CAKE_STEER;
        const pl = Math.hypot(px, py) || 1;
        px /= pl;
        py /= pl;
        crate.vx += px * lean * CRATE_FORCE * dt;
        crate.vy += py * lean * CRATE_FORCE * dt;
        // ...and the castors: keep what is along the push, scrub what is across it.
        const along = crate.vx * px + crate.vy * py;
        const keep = Math.exp(-CAKE_SCRUB * dt);
        crate.vx = px * along + (crate.vx - px * along) * keep;
        crate.vy = py * along + (crate.vy - py * along) * keep;
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
    /*
     * A FULL ROOM IS A NOISE, NOT A GAME OVER.
     *
     * The clock keeps running and so does the chapter: what the room being full
     * costs you is the `spare` on your card, the `late` flag, and having to work
     * with three thousand people watching you do it.
     */
    if (full && !ready) {
      if (!wasFull) {
        wasFull = true;
        ctx.objective(
          'Chapter 4 · <b>Keynote</b>. The room is full and they are watching you build it. ' +
            '<b>Finish the stage</b> — cake, the #DEVOXX sign, four spotlights.',
          KEYS,
        );
      }
      restless += dt;
      if (restless >= murmurAt) {
        murmurAt = restless + MURMUR_EVERY;
        ctx.flash(MURMURS[murmurs++ % MURMURS.length], 4600);
      }
    }
    if (ready && allOnStage()) {
      ended = true;
      ctx.score.spare = Math.trunc(spare);
      ctx.score.keynoteComplaints = complaints;
      ctx.score.late = full ? 1 : 0;
      // The seconds the room spent waiting, so the opening video can say so.
      ctx.score.lateT = Math.trunc(restless);
      startReel();
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
    /*
     * THE SIGN, three ways. `v` is always the slot — which letter, and whether it
     * is the orange one — and `label` its glyph.
     *
     *  - `letter`: standing, in its gap (`done`) or leaning in the wing (`idle`).
     *    Top-left rect, its own collider under it, `face` which way it reads.
     *  - `letter-slot`: an empty gap, taped on the stage floor, `active` while
     *    Droid is carrying the letter it is waiting for.
     *  - `letter-held`: the one in Droid's hands, published at HIS centre with his
     *    heading, the way the soup pot is published at Biggy's.
     */
    const dr = ctx.byKind('droid');
    for (const l of letters) {
      if (l.at === 'held') {
        out.push({ kind: 'letter-held', x: dr.x, y: dr.y, w: LETTER_W, h: LETTER_D, v: l.slot, label: SIGN[l.slot], state: 'active', face: dr.face });
      } else {
        out.push({ kind: 'letter', ...l.rect, v: l.slot, label: SIGN[l.slot], state: l.at === 'sign' ? 'done' : 'idle', face: l.face });
      }
      if (l.at !== 'sign') {
        out.push({ kind: 'letter-slot', ...slotRect(l.slot), v: l.slot, label: SIGN[l.slot], state: l.at === 'held' ? 'active' : 'idle' });
      }
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

  /**
   * How hard the room is clapping, 0 before the act and 1 once it is under way.
   *
   * It comes UP rather than switching on: a room that is already at full applause
   * on the frame the video starts is a laugh track. Three seconds from the first
   * beat, which is about where Voxxy's first jump lands.
   */
  function cheerLevel(): number {
    // ...and it stays up behind the final card, for as long as the card is up.
    if (curtainHeld >= 0) return 1;
    if (reelT < 0) return 0;
    return Math.max(0, Math.min(1, reelT / CHEER_RISE));
  }

  function people(): Person[] {
    const out: Person[] = [];
    const cheer = cheerLevel();
    for (const a of crowd) {
      const p: Vec2 = a.seated ? { x: a.seat.x, y: a.seat.y } : { x: a.x, y: a.y };
      out.push({
        x: p.x,
        y: p.y,
        r: a.seated ? 4 : a.r,
        colour: a.colour,
        role: a.seated ? 'seated' : 'visitor',
        lanyard: lanyardFor('visitor'),
        seed: a.seed,
        // Sat down, they all face the stage, which is the low-y end of the room.
        face: a.seated ? -Math.PI / 2 : a.face,
        speed: a.seated ? 0 : Math.hypot(a.vx, a.vy),
        // Only the ones who are sitting down watching it: somebody still looking
        // for a seat is not applauding, they are looking for a seat.
        cheer: a.seated ? cheer : 0,
      });
    }
    // The front row claps with everybody else once the act is on (`cheerLevel`):
    // they are seated like the rest of the room, and the curtain call's applause
    // is the seated rows'.
    reserved.forEach((q, i) => {
      const name = FRONT_ROW[i];
      out.push({ x: q.x, y: q.y, r: 4, name, ...SPEAKER_LOOKS[name], role: 'seated', seed: 920 + i, face: -Math.PI / 2, speed: 0, cheer });
    });
  // Both of them are on the stage looking back up the room at the audience.
    out.push({
      x: stephan.x,
      y: stephan.y,
      r: stephan.r,
      name: 'Stephan',
      // The same polo, glasses and headset as chapter 3 — he has not changed
      // since the gate, and he is the one face the player knows by now.
      colour: '#434a3c',
      collar: '#e8a01c',
      glasses: true,
      mic: true,
      role: 'stephan',
      lanyard: LANYARD.chair,
      seed: 910,
      face: Math.PI / 2,
      cheer,
    });
    out.push({
      x: speakerAt.x,
      y: speakerAt.y,
      r: speakerAt.r,
      name: 'speaker',
      // Chapter 3's teal hoodie and cap: the person the player walked here.
      colour: '#1f9e9b',
      hat: true,
      role: 'speaker',
      lanyard: LANYARD.keynote,
      seed: 911,
      face: Math.PI / 2,
      cheer,
    });
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
      `cake ${cakeOnMark() ? '✓' : '✗'} · sign ${sign()} · ` +
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
   * because `sign 1/3` and `spotlights 3/4` are what the player is actually
   * holding in their head; the arrow on each points at the NEXT one, which is the
   * only one of them that does anything.
   */
  function tasks(): Task[] {
    const spot = spots.find((s) => s.n === nextSpot) ?? spots[spots.length - 1];
    /*
     * THE LETTER FIRST, THEN ITS GAP — the cake's rule (Michele: *"the hint
     * should be first on the cake, if biggy is next to it, it should point to the
     * stage"*). Empty hands: the leaning letter nearest Droid, which is the one
     * his `E` would take. A letter in his hands: its own gap in the sign.
     */
    const inHands = held();
    const droid = ctx.byKind('droid');
    const nextUp = letters
      .filter((l) => l.at === 'wing')
      .sort((a, b) => dist(droid, centre(a.rect)) - dist(droid, centre(b.rect)))[0];
    // A leaning letter is against the wall, so the arrow goes on the floor in front
    // of it — where Droid stands to lift it, and a point `E` works from.
    const inFront = (l: Letter): Vec2 => {
      const c = centre(l.rect);
      const out = LETTER_D / 2 + droid.r + 2;
      return { x: c.x + Math.cos(l.face) * out, y: c.y + Math.sin(l.face) * out };
    };
    const signAt = inHands ? centre(slotRect(inHands.slot)) : nextUp ? inFront(nextUp) : centre(slotRect(SIGN.length - 1));
    const onStage = ctx.bots.filter((b) => inRect(b, stage)).length;
    return [
      {
        id: 'cake',
        text: 'push the cake crate onto its mark',
        done: cakeOnMark(),
        who: ['biggy'],
        /*
         * THE CAKE FIRST, THEN THE STAGE.
         *
         * Michele, 28 Sep 2026: *"the hint should be first on the cake, if biggy
         * is next to it, it should point to the stage."* He is right about the
         * order — an arrow to the mark is an arrow to an empty rectangle while
         * the thing that has to get there is still round the corner in the
         * corridor, and chapter 4 is on a clock. So it points at the cake until
         * he is on it, and at the mark from the moment he is.
         */
        at: dist(ctx.byKind('biggy'), crate) < ctx.byKind('biggy').r + crate.r + CAKE_TOUCH * 2
          ? { x: crateMark.x + crateMark.w / 2, y: crateMark.y + crateMark.h / 2 }
          : { x: crate.x, y: crate.y },
        hint: 'Biggy: it only moves for me, and only if I lean into it rather than brush past it. Up an aisle — it does not go over the seats any more than I do',
      },
      {
        id: 'sign',
        text: 'finish the #DEVOXX sign',
        done: signDone(),
        who: ['droid'],
        at: signAt,
        n: lettersUp(),
        of: SIGN_MISSING,
        hint: inHands
          ? `Droid: the ${letterName(inHands.slot)} goes ${gapOf(inHands.slot)}, at the back of the stage. E when I am at its gap`
          : 'Droid: the crew stood up #DEV and left the O and both X’s leaning in the wing, by the wall. One at a time — E to lift it, E again at its gap',
      },
      {
        id: 'spots',
        text: 'light the four spotlights in order',
        done: spots.every((s) => s.on),
        who: ['voxxy'],
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
        hint: 'Biggy: all three of us on the boards at the same time — and Stephan is not starting until the cake, the sign and the lights are done either',
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
    behindCard,
    /** The opening video, while it is running. `null` every other frame. */
    reel: (): ReelView | null => (reelT < 0 ? null : reelAt(reelCards, reelT)),
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
      letters: lettersUp(),
      sign: sign(),
      carrying: held()?.slot ?? -1,
      spots: spots.filter((s) => s.on).length,
      nextSpot,
      ready,
      seated,
      crowd: crowd.length,
      complaints,
      restless: Math.trunc(restless),
      spare,
      reelT,
    }),
  };
}

export const ch4Keynote: ChapterDef = { n: 4, title: '4 · Keynote — Room 8', setup };
