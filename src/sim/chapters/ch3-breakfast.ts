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
 * The crowd is not decoration: sixty visitors walk the hall's lane grid, and
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

import { BIGGY_ROLL_DUR, BLOCKED_THROTTLE, FACE_MIN_SPEED, PUSH_LEAN_MIN, SPEED_SCALE, TRAVEL_TIME_SCALE } from '../constants';
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
import { BAR_RECT, GF, HIGH_TABLES, VIEW_GROUND, entranceBayGaps, groundPlates, groundWalls } from '../geometry';
import { CAMEO_LINES, CAMEO_LOOKS } from '../cameos';
import { riseAt } from '../surface';
import { KEYNOTE_LOOK, SPEAKER_LOOKS } from '../speakers';
import { LANYARD } from '../lanyards';
import { beltUp, nastriRun } from '../nastri';
import { botsCollide, circleRect, dist, inRect, mkBody, smallTalk, speed, standOff, stepBot } from '../bot';
import { WALK_SLACK, clearWalk, detour } from '../detour';
import { PX_PER_M } from '../units';
import type { Bot, CameraShot, CutRoute, Person, Prop, Rect, Task, Vec2, Wall } from '../types';

import type { ChapterCtx, ChapterDef, ChapterRuntime, PrevVel } from './index';

/* ---------------------------------------------------------------- reach and pacing */

const SHELF_REACH = 45;
const POT_REACH = 70;
/**
 * How close Voxxy or Droid has to be to the soup pot for `E` to mean "the pot" —
 * standing at the counter in front of it, not anywhere in the court. Tighter than
 * `POT_REACH` so it does not swallow the key from a queue a step behind them.
 */
const POT_NAG = 40;
const TALK_REACH = 40;
/** How fast Stephan turns to somebody, rad/s: a man turning round, not a turret. */
const STEPHAN_TURN = 5;
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
 * How far either side of the queue's centre line the FRONT RANK stands.
 *
 * A catering doorway is 44 px and a queuer is 6, so a body at 11 px off centre
 * blocks Biggy's centre (r 9) from 76 to 106 px; the pair of them covers the whole
 * opening with 4 px to spare at each jamb. Measured, not chosen: at the old 5 px
 * the two files left an 11 px window of clear centre line beside them. See
 * `mkQueue`, and `tests/beer-bar.test.ts`, which does the fill.
 */
const QUEUE_SPREAD = 11;
/**
 * Seconds for the soup to go from boiling to stone cold.
 *
 * The clock is really a distance: it is how far Biggy may carry the pot before it
 * is undrinkable, and the hall did not get shorter when he got slower. It scales
 * with `TRAVEL_TIME_SCALE` so the pot still goes cold in the same place.
 */
const COOL_SECONDS = 150 * TRAVEL_TIME_SCALE;
/**
 * Visitors on the floor at once.
 *
 * Sixty, raised from thirty-six on 25 Sep 2026. Michele, after the figures got
 * bodies: *"Raise a bit, 60?"* — the hall is 22 m of floor with twelve sponsor
 * booths in it, and at thirty-six you could cross the whole thing and pass two
 * people while the chapter card claims three thousand walked in.
 *
 * It is the number of bodies the sim carries, not a crowd size: a visitor costs
 * one lane-walk, one pass over the other visitors, one over the six crates, and
 * one figure on screen. The pass over the other visitors is the only quadratic
 * thing here, and sixty of them is 3,600 distance checks a frame, which is
 * nothing beside the 2,900 meshes the hall already draws.
 */
const VISITORS = 60;
/**
 * Seconds between arrivals.
 *
 * Dropped from 0.9 with the count, so the hall still FILLS in the same
 * thirty-odd seconds it used to. Sixty people through a door at the old rate is
 * most of a minute of watching a half-empty room, which is a different change
 * from the one that was asked for.
 */
const SPAWN_EVERY = 0.55;
/** Closing speed above which a robot has knocked someone over rather than brushed them. px/s. */
const BOWL_OVER = 110 * SPEED_SCALE;
/** The jerk that counts as "Biggy hit something" while he is carrying the pot. px/s. */
const SPILL_DV = 90 * SPEED_SCALE;
/** How many spills stay on the floor. The oldest goes first — see `stains`. */
const MAX_STAINS = 14;
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

/**
 * The floor in front of a sponsor stand — where somebody stands to be talked to.
 *
 * Two beats derive their position from a booth this way: the Sticker Mine's
 * top-shelf swag and the keynote speaker's hiding place. They used to write the
 * formula out twice, which is how they came to be **the same point on one seed in
 * six** — see `hideBooth` below.
 */
const inFrontOf = (b: Rect): Vec2 => ({ x: b.x + b.w / 2, y: b.y + b.h + 14 });

/**
 * How far clear of a minigame's key circle the speaker has to hide, sim px.
 *
 * Not zero and not a hair: Voxxy has to be able to stand at the speaker and press
 * `E` without being inside the sticker's reach, and she is 4.75 px of robot, so the
 * two spots have to be further apart than one of her plus the slack a player leaves.
 */
const SPEAKER_CLEAR = 24;
/**
 * How long a visitor has to be grazing built fabric without gaining ground before
 * the leg they are walking, rather than the crowd around them, is what gets blamed.
 * Half a second: long enough to thread a door bay, short enough that nobody crawls
 * the face of a booth for a visible moment. See `stepVisitor`.
 */
const GRAZE_STALL = 0.5;
/**
 * ...and how long they get when nothing is grazed and it is simply the crowd.
 *
 * Longer, because a stream of people threading a doorway is SUPPOSED to be slow
 * and a person who re-routes at the first shoulder never gets anywhere. Two
 * seconds of no ground gained is not a slow queue, it is a knot — Michele's
 * photograph of fourteen of them stopped along the threshold. See `stepVisitor`.
 */
const CROWD_STALL = 2;
/**
 * How close a robot stands to a queue before `E` means "make way", sim px.
 *
 * 44, which is the doorway's own width and the distance `tests/beer-bar.test.ts`
 * has always asked from: it parks Voxxy 33 px south of the front rank, walks
 * Biggy's own grid through the gap afterwards, and that test is the acceptance
 * criterion for this beat.
 */
const QUEUE_ASK = 44;
/**
 * How close Biggy gets to Stephan before Stephan simply takes the pot, sim px.
 *
 * 34 is a long arm's reach at this scale — 2.7 m — and it is deliberately bigger
 * than the mark on the floor. Michele: *"He could also get it on it's own when
 * it's near."* A man who has been asking for soup for ten minutes does not make
 * you park it in a box first.
 */
const SOUP_HANDOVER = 34;
/**
 * ...and how close the keynote speaker gets before Stephan claims them, sim px.
 *
 * The same idea one step further out (38 px, 3 m): a pot has to be handed over
 * and a person only has to arrive, and the walk is Voxxy's rather than theirs —
 * a follower who has to thread a box while the robot she is following stands in
 * it is the fiddliest thing in the chapter. Michele, 28 Sep 2026: *"the speaker
 * should also go to stephan."*
 */
const SPEAKER_HANDOVER = 38;
/**
 * HOW THE SPEAKER FOLLOWS: Voxxy's ROUTE, not Voxxy.
 *
 * Found by the ship-gate run (`tests/full-run.test.ts`, 28 Sep 2026), and it was
 * not a seed thing: the speaker walked at wherever Voxxy was standing and pushed
 * back out of any wall they ended up inside, which is a beeline with a shove on
 * it. Voxxy walks at 72.5 px/s and the speaker at 37.5, so she arrives at the
 * mark well ahead of them; the moment she stood in the spot they stopped aiming
 * at her and set off straight across the hall for the mark — through whichever
 * booth was in the way — and jammed against it. Measured over fourteen seeds:
 * **twelve of them stranded the speaker**, and the chapter's third condition with
 * them. Only a hiding place with clear line of sight to Stephan worked.
 *
 * So the speaker walks where Voxxy WALKED. Her positions are dropped behind her
 * as breadcrumbs, the speaker takes them in order, and the route they walk is
 * therefore a route a robot just walked — around the booths, because Voxxy went
 * around the booths. It is also what being led actually looks like.
 */
const TRAIL_STEP = 12;
/** How close the speaker gets to a breadcrumb before taking the next one, px. */
const TRAIL_REACH = 9;
/** How much of Voxxy's route the speaker remembers — 120 crumbs is ~14 m. */
const TRAIL_MAX = 120;
/** How far short of Voxxy herself the speaker stops, px: they follow her, they do not tread on her. */
const SPEAKER_BEHIND = 22;
/**
 * ...EXCEPT WHERE NO PERSON CAN WALK IT.
 *
 * Michele, 29 Sep 2026, chapter 3, with a screenshot of the masked speaker stood
 * against a white block and Voxxy out beyond it: *"the keynote speaker is blocked
 * on this block. I went under the table I think."* She fits under the sponsor
 * half tables and nobody else does, so the crumb guard in `update` drops nothing
 * under the cloth — which is right, and which left the last crumb before the
 * table and the first one after it as two good places to stand with a table
 * between them. The speaker walked the straight line from one to the other into
 * the tablecloth, and nothing ever moved them again: measured, Regex Racing's
 * hiding place with Voxxy driven through the middle of The Coffee Sponsor left
 * them pinned at the table's west face for as long as the test would wait.
 *
 * So before every leg the speaker asks whether a PERSON can walk it
 * (`clearWalk`, `src/sim/detour.ts`), and when not, finds their own way round to
 * the first crumb of her route they can reach — or to her, if none — and rejoins
 * it there (`detour`). While her route is walkable it is never asked, so an
 * ordinary errand is the follow it always was: same crumbs, same pace, same stop
 * short of her.
 *
 * A way round a table is found in about a millisecond. Proving that she is
 * somewhere no person can reach at all means searching the whole floor, three or
 * four milliseconds, and a speaker waiting beside a table for Voxxy to come out
 * has no reason to do that every frame: after a search that found no way to her
 * they look again only once she has moved, and at most every `SPEAKER_REPLAN`
 * seconds.
 */
const SPEAKER_REPLAN = 0.5;
/**
 * A second of pressing on and getting nowhere, and the straight line is not
 * believed any more: they plan from where they stand. Nothing above should ever
 * leave them there; this is what lets "never" be said with a straight face. It is
 * also how long Voxxy gets to come straight back out from under something before
 * the speaker says they will wait.
 */
const SPEAKER_STALL = 1;
/**
 * How much further the way round has to be than the straight line before the
 * speaker says why they are not walking her route: a metre. Less than that is a
 * corner Voxxy cut closer than a person would, and nobody announces a corner.
 */
const SPEAKER_NOTICE = PX_PER_M;
/*
 * ...and what they say when they do. A table that stops the keynote speaker is a
 * gate, and every gate says why, in the voice of whoever it stopped (CLAUDE.md).
 * Once a time round, not once a frame — see `said`.
 */
const SPEAKER_ROUND_TABLE =
  'Keynote speaker: "Under the tablecloth? In this cape? I am going round — keep going, I can see you."';
const SPEAKER_ROUND = 'Keynote speaker: "You fit through there and I do not. I am going round — keep going, I can see you."';
const SPEAKER_WAITS =
  'Keynote speaker: "I cannot get to you in there. I will wait right here — come back out and lead me round."';
/*
 * ...and when Droid or Biggy stop to chat (`talk`). Hiding, to the two robots who
 * were not sent: it is Voxxy's errand (`OBJECTIVE`), and the reason is theirs to
 * give rather than a rule's. Handed over, to anybody.
 */
const SPEAKER_HIDING =
  'Shh! I am hiding from the queues, and you are the most noticeable thing in this hall. Send the small orange one — nobody looks twice at her.';
const SPEAKER_HANDED_OVER = 'Stephan has me now. Do not tell the queue where I am.';
/** Stephan's polo: the dark olive one, off the photograph he sent. */
const STEPHAN_POLO = '#434a3c';
/** ...and its collar stripe, which is the half of it that reads at this size. */
const DEVOXX_ORANGE = '#e8a01c';
/** Celestino's crew raglan — the orange half of it; the trim is the white. */
const CREW_ORANGE = '#e0692a';
/** How far in front of the reception counter an arrival stands to be served, px. */
const BADGE_STAND = 11;
/** ...and how long that takes. A badge desk is quick; it is a queue that is slow. */
const BADGE_DWELL = 1.1;
/** How near that line counts as being at the desk, sim px. */
const BADGE_REACH = 22;
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
/**
 * The pour, in seconds: the beat before the taps run, how long they run for, when
 * Biggy raises his, and how long he holds it up.
 *
 * Real seconds and not px/s, so the 23 Sep rescale does not touch them. The beat
 * exists because a tap that starts on the same frame as the flash line reads as
 * part of the HUD rather than as something happening in the room.
 */
const POUR_LEAD = 0.7;
const POUR_RUN = 3.4;
const TOAST_AT = 2.2;
const TOAST_HOLD = 3.4;
/**
 * The kegs behind the bar. BEHIND it: the counter is a `low` wall, so nothing can
 * stand where these are, which is both what a cellar looks like and why they need
 * no collider of their own.
 */
const KEGS: readonly Vec2[] = [344, 358, 420].map((x) => ({ x, y: BAR.y + 7 }));
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
  /** Stable identity for the renderer's body-builder. See `Person.seed`. */
  seed: number;
  walk: number;
  route: Vec2[];
  dwell: number;
  hitCd: number;
  colour: string;
  /** Seconds spent grazing built fabric without getting any closer. See `stepVisitor`. */
  stall: number;
  /** Have they been past Celestino's desk yet? See `arrivalLegs`. */
  badge: boolean;
}

interface QueuePerson {
  /** Stable identity for the renderer's body-builder. See `Person.seed`. */
  seed: number;
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
  /**
   * Where `key` will swallow `E`, as circles — so a chapter beat never lands on one.
   *
   * The minigames are optional swag and the chapter's beats are its spine, but the
   * minigames get the key first (`mg.key(code, b)` is the second line of the
   * chapter's own handler). That ordering is deliberate and stays: a refusal that
   * names a reason is an answer, and Michele's rule for this chapter is that such a
   * refusal keeps the key rather than falling through to a party trick. The price of
   * the rule is that a spine beat standing inside one of these circles is
   * unreachable, so the spine has to keep out of them.
   */
  keySpots(): readonly { x: number; y: number; r: number }[];
  update(dt: number): void;
  props(): Prop[];
  /** Debug/test seam: move the duck. */
  place(kind: string, x: number, y: number): boolean;
  state(): MinigameState;
  /** How many of the three are won, for the HUD's progress line. */
  won(): number;
}

/**
 * `hints()` is the chapter's own task list, handed in as a function because the
 * rubber duck reads it and `tasks()` is defined further down `setup`. Nothing here
 * decides what a hint says — the duck repeats the chapter's own line back at you.
 */
function setupMinigames(ctx: ChapterCtx, hints: () => readonly Task[]): Minigames {
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
  /** Where the duck sits before anybody shoves it — the only place it listens. */
  const duckHome: Vec2 = { x: duck.x, y: duck.y };
  /**
   * How close a robot has to be to rubber-duck at it, px, and how far the duck may
   * have wandered from its stand and still be a duck you talk to.
   *
   * Michele, 26 Sep 2026, from the list of cheap extras: *"Let's try 5 6 7 too"* —
   * number 5 was **the duck listens**. Rubber-duck debugging is the oldest joke in
   * the building and the only one that is also a game mechanic: you say the problem
   * out loud and the answer turns up on its own. So the duck gives you the same line
   * `H` gives you, in the robot's voice, for whatever the chapter is waiting on.
   *
   * It only works while the duck is still ON its stand, and that is not a
   * restriction, it is the honest reading: once it has been shoved down the lane it
   * is a puck. It also keeps `keySpots` a fixed circle, so the chapter's own beats
   * can be kept out of it the way they are kept out of the sticker's.
   */
  const DUCK_REACH = 26;
  const DUCK_HOME_SLACK = 30;
  // Swag already won stays won: `ctx.swag` outlives the chapter object, so a
  // replay of chapter 3 (R, or Skip back into it) does not re-award anything.
  let duckDone = ctx.swag.includes('duck');

  const stB = booth('Sticker Mine');
  const sticker = inFrontOf(stB);
  /** How close a robot has to be for `E` to mean "the top shelf" and nothing else. */
  const STICKER_REACH = 40;
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
  /** The line the duck answers with: the chapter's own hint for what is still open. */
  function duckHint(b: Bot): string {
    const open = hints().filter((t) => !t.done);
    // The one this robot can actually do, if there is one — a hint about somebody
    // else's job is a hint about the wrong problem (`Task.hint`).
    const mine = open.find((t) => t.who?.includes(b.kind)) ?? open[0];
    if (!mine) return 'Biggy: "Everything is done." The duck agrees.';
    const line = Array.isArray(mine.hint) ? mine.hint[0] : mine.hint;
    return typeof line === 'string' && line.length > 0 ? line : `Still open: ${mine.text}.`;
  }

  function key(code: string, b: Bot): boolean {
    if (code !== 'KeyE') return false;

    /*
     * RUBBER-DUCK DEBUGGING, at the stand that sells them. The robot says the
     * problem out loud to a plastic duck; the duck says nothing; the robot works
     * it out. The line it "works out" is the chapter's own hint, so this can never
     * drift from what `H` would have said.
     */
    if (dist(b, duck) < DUCK_REACH && dist(duck, duckHome) < DUCK_HOME_SLACK) {
      const said =
        b.kind === 'voxxy'
          ? 'Voxxy explains the whole thing to a rubber duck, at speed. The duck says nothing.'
          : b.kind === 'droid'
            ? 'Droid states the problem to the duck, twice, in order. The duck declines to comment.'
            : 'Biggy tells the duck everything. The duck looks up at him and waits.';
      ctx.flash(`${said}<br>${duckHint(b)}`, 6000);
      return true;
    }

    if (!stickerDone && dist(b, sticker) < STICKER_REACH) {
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
    // Only the sticker swallows `E`. The duck is shoved by driving into it and the
    // race is started by crossing its own line, so neither owns a key anywhere.
    keySpots: () => [
      { x: sticker.x, y: sticker.y, r: STICKER_REACH },
      // The duck's stand. The duck itself moves; the circle where it answers to
      // `E` does not, which is what lets the chapter's beats be kept out of it.
      { x: duckHome.x, y: duckHome.y, r: DUCK_REACH },
    ],
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
  /** Where the ladle is: still on the shelf, in Droid's hand, or in the pot. */
  ladle: 'shelf' | 'carried' | 'in';
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
  speaker: { following: boolean; withStephan: boolean; booth: string };
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
// "talk", for any of the three (`talk`). It said "ask", which read as the queues.
const KEYS =
  '1/2/3/Tab: switch · WASD · E: use / lift / talk / clear a queue / play a game / tow Biggy / Voxxy jumps · R: restart \u00b7 I: run sheet \u00b7 H: hint \u00b7 P: physics \u00b7 C: credits';

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
   * ...and how long the three of them stand looking at the open flight before the
   * first one sets off.
   *
   * It used to be the hold on the hall between the last belt and the exit fade —
   * the trap `FIRE_CUT_DELAY` exists for in `ch1-night.ts`, a cutscene that blacks
   * the screen out before the barrier has moved. The barrier now opens INSIDE the
   * cutscene, in its own framing (`STAIR_BEAT` below), so this is the beat between
   * "the belts are home" and "the climb", and it is still why the swing is seen.
   */
  const GATE_CUT_DELAY = 0.45;
  /*
   * THE STAIR BEAT — Michele's storyboard for the 3 → 4 transition, 29 Sep 2026:
   * *"camera moves to show the staircase, Stephan presses a button, the nastri
   * open, then the climb"*, and of the version before it: *"at the moment the
   * robots aren't climbing correctly and the scene ends in dark."*
   *
   * So the moment his three conditions are met the player loses the stick and the
   * chapter directs one continuous shot (`shot()`): the three robots line up in
   * front of the belts, Stephan steps to the post beside them and presses its
   * button, the light goes green, the eight belts wind in one after another, and
   * then the three of them climb the actual flight — its own plate
   * (`groundPlates`, `main-flight`) is what lifts them tread by tread — with the
   * camera behind and below them, and the black comes down as they reach the head
   * of it. Seconds from the frame the cast stands on its marks.
   */
  const STAIR_BEAT = {
    /** He turns from the doors and steps to the post... */
    stepAt: 0.55,
    stepTime: 1.0,
    /** ...his hand goes out over this long, and the button goes at `press`. */
    reachTime: 0.4,
    press: 2.0,
    /** The first belt lets go this long after the press: a relay, not a hinge. */
    belts: 2.25,
  } as const;
  /** When the walk starts — belts, the whole wave, and the pause. */
  const CLIMB_AT = STAIR_BEAT.belts + GATE_SWING_TIME + GATE_CUT_DELAY;
  /**
   * How long the climb takes, seconds: the whole flight, 9 m of run and 4.5 m of
   * rise, from the belt line to its head. Every robot's pace falls out of its route
   * over this (`startCut`), and at this length the slowest of them, Droid, walks it
   * at 70% of his own top speed — `tests/cutscene-pace.test.ts` holds that.
   */
  const CLIMB_TIME = 6.6;
  /**
   * The order they go up in, as a wait on the first mark: Voxxy first because she
   * always is, Droid a step behind, and Biggy last — the heaviest thing on a
   * staircase goes up after the others are clear of it.
   */
  const CLIMB_DELAY: Readonly<Record<'voxxy' | 'droid' | 'biggy', number>> = { voxxy: 0, droid: 0.35, biggy: 0.9 };
  /*
   * The barrier itself is `src/sim/nastri.ts` — nine belt posts and eight webbing
   * belts, with every position, the release order and each belt's own retraction in
   * that one module.
   *
   * It used to be three numbers copied out of `src/render/doors.ts` with a test
   * holding the copies against each other, because `src/sim` may not read
   * `src/render` (CLAUDE.md). The arithmetic moved the other way instead: the belts
   * are colliders as well as a picture, so the sim owns them and the renderer reads
   * the sim, which is the direction that was always allowed.
   */
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
  /** 0..1, how far the belts have wound in. Ticked by the stair beat (`stairBeat`). */
  let gateSwing = 0;
  /**
   * The stair beat's own clock, seconds since the cast was placed at the belts
   * (`STAIR_BEAT`). -1 until the exit cutscene has put them there.
   */
  let scene = -1;
  /** Has Stephan pressed the button on the post. */
  let pressed = false;
  /** How far his right hand is out towards the button, 0..1 (`Person.reach`). */
  let reach = 0;
  /** His walking speed while he steps to the post, px/s, for the gait. */
  let stephanSp = 0;
  /*
   * WHAT IS LEFT WHEN IT IS OPEN, and what goes away as it opens.
   *
   * Michele, 27 Sep 2026, on the steel run this replaced: *"Stephan is powerful,
   * but i don't think he can remove a wall. I'd use something simpler, like
   * «Nastri»"*, and then *"We could also have some kind of scene/effect where
   * stephan pull one spot and the 8 nastri retract one by one."*
   *
   * So: the nine posts STAY, for good — they are 13 cm of chrome each and a venue
   * leaves them standing all day. The eight belts go, one at a time, each on the
   * frame it finishes winding into its own post (`beltUp`). Between the posts there
   * is 1.94 m of clear floor, which is what gives the flight back: the widest robot
   * in the game is 1.44 m across.
   *
   * `pullT` is 0.5 because that is where Stephan stands — `stephan` below is at the
   * middle of this line — so the release runs outward from his hand in both
   * directions, alternating, and no two belts share a rank.
   */
  const run = nastriRun(GF.gate, 0.5);
  const gatePostWalls: Wall[] = run.postRects.map(
    (r): Wall => ({
      ...r,
      kind: 'gatepost',
      flavour: true,
      why: (b) =>
        b.kind === 'voxxy'
          ? `${b.name}: a belt post. Thirteen centimetres of chrome, and there is nearly two metres of floor either side of it`
          : b.kind === 'droid'
            ? `${b.name}: the post stays. The belt was the barrier; this is what held it`
            : `${b.name}: post. I am wider than most things and still narrower than that gap — line up and go through`,
    }),
  );
  /**
   * The belts, each with the rank that says when it lets go.
   *
   * `live` is the wall while it is still across the line and `null` once `update`
   * has taken it away, so the list stays parallel to what the renderer is drawing
   * from the same `gateSwing` — one number, two readers, no second opinion.
   */
  const gateBeltWalls: Array<{ rank: number; live: Wall | null }> = run.belts.map((n) => ({
    rank: n.rank,
    live: {
      ...n.rect,
      kind: 'gatebelt',
      why: (b) =>
        b.kind === 'voxxy'
          ? `${b.name}: that one is still clipped. Wait — Stephan is working down the line`
          : b.kind === 'droid'
            ? `${b.name}: this nastro has not wound in yet. Four seconds of patience, at most`
            : `${b.name}: a webbing belt would not stop me, and I am not going to be the robot that finds out in front of Stephan`,
    },
  }));

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

  const mg = setupMinigames(ctx, () => tasks());

  const food = GF.food;
  const station: Vec2 = { x: food.soup.x + 45, y: food.soup.y + 15 };
  const shelfAt: Vec2 = { x: food.shelf.x + 11, y: food.shelf.y + 8 };
  /**
   * WHERE THE LADLE IS — and it is three places, not two.
   *
   * Michele, 28 Sep 2026: *"The ladle thing: I think droid should take it and drop
   * it in the soup. Otherwise the action is a bit pointless."* He is right, and it
   * was the thinnest beat in the chapter: Droid stood under a shelf, pressed `E`,
   * a flag went true somewhere, and a robot on the other side of the court could
   * suddenly fill a pot. Nothing moved, so nothing happened.
   *
   * Now the ladle is an OBJECT with a journey: it is on the shelf, then it is in
   * Droid's hand and goes where he goes, then he drops it in the pot at the
   * counter and Biggy can fill it. Two presses and a walk instead of one press —
   * and the walk is the one only Droid can start, which is what the errand was
   * always for.
   */
  let ladle: 'shelf' | 'carried' | 'in' = 'shelf';
  /*
   * THE POT IS BIGGY'S, AND THE OTHER TWO SAY SO.
   *
   * Michele, 29 Sep 2026: *"when other chars try to reach the soup there should be
   * a message"*. Voxxy and Droid walked up to the pot, pressed `E` and got a hop,
   * or leant on the counter and got nothing — a thing that silently does not work
   * is the one thing a gate in this game may not be (CLAUDE.md). Each says why,
   * in their own voice, at the key and when they walk into the counter; the
   * counter's line is throttled by `game.ts` like every other wall's.
   */
  const potRefusal = (who: Bot): string =>
    who.kind === 'voxxy'
      ? 'Voxxy: "That pot is taller than I am and full of boiling tomato. I would not be carrying the soup, I would be IN it. BIGGY!"'
      : ladle === 'shelf'
        ? 'Droid: "A full pot, two metres up, on legs like mine? Every step would be a tidal wave. The pot is Biggy\'s. The ladle, on the other hand, is on the high shelf — that part is mine."'
        : 'Droid: "I did the ladle. The pot is Biggy\'s: at my height every step is a tidal event, and Stephan asked for soup, not a weather report."';
  const soupCounter = ctx.walls.find((w) => w.x === food.soup.x && w.y === food.soup.y && w.w === food.soup.w && w.h === food.soup.h);
  if (soupCounter) {
    soupCounter.kind = 'soup-counter';
    soupCounter.why = (b) =>
      b.kind === 'voxxy'
        ? 'Voxxy: "The soup counter. From down here it is a white wall with steam coming off the top. The pot is Biggy\'s job."'
        : b.kind === 'droid'
          ? `Droid: "The soup counter. I could lift that pot. I could not walk with it: two metres of wobble over a full pot is soup on the ceiling. ${ladle === 'shelf' ? 'Mine is the ladle, on the high shelf.' : 'That is Biggy\'s.'}"`
          : // Biggy walks up to it to pick the pot up: a line every time he arrives
            // would be noise, and `E` is already where his answer is.
            null;
  }
  /**
   * WHERE THE SOUP WENT — one stain on the floor per splash, and they stay.
   *
   * Michele, 28 Sep 2026: *"Soup graphics(including spilling and leaving spill on
   * the ground"*. A spill that only prints a line in the flash bar is a number
   * going down; a spill that leaves a puddle at the corner Biggy clipped is the
   * chapter telling its own story back to the player, and by the third batch the
   * route he keeps getting wrong is drawn on the floor in tomato.
   *
   * The sim owns them because they are facts about the run, not decoration: the
   * position is where the body was when it happened, and the radius is how much
   * came out. `MAX_STAINS` is a memory bound and nothing more — the oldest goes
   * when the list is full, which is also the one furthest back in the story.
   */
  const stains: Array<{ x: number; y: number; r: number }> = [];
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

  /**
   * Hands out `Person.seed`. Monotonic for the whole chapter, never reused.
   *
   * A visitor who leaves and a visitor who arrives are different people and must
   * not inherit a body; a counter that only ever goes up is the cheapest way of
   * saying so, and it makes a chapter's crowd reproducible from the seed the run
   * was started with.
   */
  let nextSeed = 1;

  /* --------------------------------------------------------------- the queues */

  const queues: Queue[] = [];
  /** Biggy's answer to a queue, at `E` and when he leans on one. */
  const BIGGY_QUEUE_LINE =
    'Biggy: "When I say excuse me to a queue, a queue hears a fridge falling over. They are not moving for me and I am not moving them. Voxxy asks; I wait for the gap."';
  /** Sim time Biggy last said so, for the throttle. */
  let leanAt = -Infinity;
  /**
   * One queue: a FRONT RANK across the doorway, and a tail of singles behind it.
   *
   * The rank is the gate. Michele had already ruled on the gate itself — *"That is
   * a good gate and it stays"* — but the fill in `tests/beer-bar.test.ts` measured
   * what was actually standing there: two files 10 px apart in a 44 px doorway,
   * which at Biggy's radius leaves an 11 px window of clear centre line beside
   * them. He could drive in and fill the pot without Voxxy saying a word, and the
   * test said so in a comment rather than asserting a seal that was not true.
   *
   * Michele, 26 Sep 2026: *"increase the queue but just the minimun needed."* The
   * minimum is ONE extra person per queue. Two of them abreast at `QUEUE_SPREAD`
   * either side of the centre line each block Biggy's centre within 15 px, and
   * 2 x 15 px overlapping across a 44 px opening leaves nothing to drive through.
   * Everybody behind them stands as they always did — a queue is a file, not a
   * phalanx, and widening the whole thing would read as a wall of people.
   *
   * The same pair is what makes the clearing worth something: shifted `QUEUE_STEP`
   * west they take the west half of the doorway with them and leave the east half
   * open, which is the beat — Voxxy asks, the queue shuffles, Biggy gets in.
   */
  const mkQueue = (x0: number, n: number, label: string): void => {
    const q: Queue = { label, x: x0, people: [], open: 0 };
    const front = food.court.y + food.court.h - 10;
    const stand = (x: number, y: number, i: number): void => {
      q.people.push({ seed: nextSeed++, x, hx: x, y, r: 6, colour: QUEUE_COLOURS[(i * 7) % 4], cd: 0 });
    };
    stand(x0 - QUEUE_SPREAD, front, 0);
    stand(x0 + QUEUE_SPREAD, front, 1);
    for (let i = 1; i < n; i++) stand(x0 + (i % 2 ? 5 : -5), front - i * 16, i + 1);
    queues.push(q);
  };
  mkQueue(102, 7, 'soup queue');
  mkQueue(232, 6, 'sandwich queue');
  mkQueue(307, 7, 'coffee queue');

  /* ------------------------------------------------------------ people to ask */

  /** Somebody to talk to: where they stand, what they say, and how they look. */
  interface Npc {
    x: number;
    y: number;
    r: number;
    name: string;
    line: string;
    colour?: string;
    collar?: string;
    face?: number;
    glasses?: boolean;
    mic?: boolean;
    barefoot?: boolean;
    lanyard?: string;
    screen?: boolean;
    /** A body of their own (`CameoLook.seed`); everybody else's is their place in this list. */
    seed?: number;
  }
  const npcs: Npc[] = [
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
    /*
     * CELESTINO, ON THE DESK.
     *
     * Michele, 27 Sep 2026, with a photograph of him in the crew raglan:
     * *"People should maybe pass at the reception to get a badge. Celestino should
     * be there."* Both halves are here — he is behind the counter, and every one
     * of the three thousand now walks past him on the way in and comes away
     * wearing a lanyard (`arrivalLegs`).
     *
     * First name and a caricature, the same rule Stephan gets: an orange-and-white
     * crew raglan, a crew-red ribbon, and the one job in the building that never
     * stops. Nothing here needs anybody's permission.
     */
    {
      x: GF.reception.x + GF.reception.w * 0.62,
      y: GF.reception.y + GF.reception.h * 0.42,
      r: 8,
      name: 'Celestino',
      line: 'Badges here! Wardrobe behind me, rooms are upstairs when Stephan says so. You three are not on my list, but go on.',
      colour: CREW_ORANGE,
      collar: '#f2efe9',
      face: Math.PI / 2,
    },
    /*
     * THREE REGULARS, OUT ON THE HALL FLOOR.
     *
     * Michele, 28 Sep 2026, one photograph each: *"i also need mario fusco
     * somewhere in the hall"*, *"and Venkat (no shoes!)"*, *"Josh Long"*. First
     * names and a caricature, the rule Stephan and Celestino already follow:
     * Mario's grey beard and track jacket, Venkat talking barefoot as he always
     * does, Josh in his grey tee saying "bootiful". Nothing here needs permission.
     *
     * Where: open carpet the robots already cross — Mario and Venkat on the
     * wide strip along the hall's east wall, between the threshold from the lobby
     * and the booths, Josh in the open band west of the booth rows. Measured
     * clear of every wall and every other person by 22 px and 45 px.
     *
     * They wear the SPEAKER ribbon, teal, like every speaker in the building.
     * Michele, 28 Sep: *"I think they should have speakers badge, and the
     * keynote another color, maybe multicolor?"* — the missing keynote speaker
     * wears the multicolour one (`LANYARD.keynote`), which is what keeps the
     * search a search: teal is two hundred people, multicolour is one.
     *
     * Lize and Aurélie joined the same afternoon (a photograph each), on the
     * open carpet along the hall's south edge.
     */
    {
      x: 985,
      y: 440,
      r: 8,
      name: 'Mario',
      line: 'Soup is a side effect, and Stephan is its only consumer. Keep it pure until it reaches him — Biggy has the hands for a pot.',
      ...SPEAKER_LOOKS['Mario'],
      face: Math.PI,
    },
    {
      x: 990,
      y: 600,
      r: 8,
      name: 'Venkat',
      line: 'Shoes? At the hotel. On carpet you feel every cable before you trip on it. Short feedback loops, my friend — the shortest.',
      ...SPEAKER_LOOKS['Venkat'],
      face: Math.PI,
    },
    {
      x: 250,
      y: 420,
      r: 8,
      name: 'Josh',
      line: 'Bootiful robots! The keynote speaker? Not at a table — try the booths with walls. Start there, ship it, then go to production.',
      ...SPEAKER_LOOKS['Josh'],
      face: 0,
    },
    {
      x: 330,
      y: 615,
      r: 8,
      name: 'Lize',
      line: 'Robots on the night shift, with no one prompting them? I have a talk about exactly this. Ask the soup what it wants — then check its answer.',
      ...SPEAKER_LOOKS['Lize'],
      face: -Math.PI / 2,
    },
    {
      x: 560,
      y: 650,
      r: 8,
      name: 'Aurélie',
      line: 'I drew you three already, as Gophers. The speaker? Behind a booth with walls — I sketch everything, and I saw a multicolour lanyard go by.',
      ...SPEAKER_LOOKS['Aurélie'],
      face: -Math.PI / 2,
    },
    /*
     * THE TWO WHO BUILT IT, AT A HIGH TABLE (`src/sim/cameos.ts`).
     *
     * Michele, 29 Sep 2026: *"They are you and me."* Either side of the last table
     * in the row along the south strip, by the drinks fridge — clear of the
     * visitor lane at y 645 — pair-programming over breakfast, each turned half
     * to the other and half to the hall, so a robot coming down the lane sees
     * both faces. Attendee ribbons, both: the one thing neither of them is here
     * as is crew.
     *
     * The LAST table and not the one before it, measured: the sixth stands under
     * Regex Racing, a built booth the keynote speaker can hide behind, and a
     * cameo 23 px from where Voxxy asks the speaker to come out is a cameo that
     * answers instead. The seventh's nearest booth is The Coffee Sponsor, a table
     * the speaker never hides at, and the nearest speaker spot is 86 px away.
     */
    ...(['Michele', 'Claude'] as const).map((name, i) => {
      const table = HIGH_TABLES[6];
      const side = i === 0 ? -1 : 1;
      return {
        x: table.x + table.w / 2 + side * 17,
        y: table.y + table.h / 2,
        r: 8,
        name,
        line: CAMEO_LINES[name],
        ...CAMEO_LOOKS[name],
        face: side < 0 ? -Math.PI / 4 : (-3 * Math.PI) / 4,
      };
    }),
  ];

  /*
   * WHERE THE SPEAKER HIDES, AND THE ONE STAND THEY MAY NOT HIDE BEHIND.
   *
   * Built booths only, never a table: the hint the NPCs give says *"one of the built
   * ones, with walls"* and it has to stay true, and a table booth would be visible
   * from the aisle anyway.
   *
   * The second filter is a **soft-lock**, found 25 Sep 2026 while auditing the note
   * that said `E` at the Sticker Mine runs before the chapter's own handler. The
   * speaker's spot and the sticker's are both `inFrontOf(booth)`, so when the RNG
   * picked the Sticker Mine they were the SAME POINT — and Voxxy pressing `E` there
   * got the sticker's "I am 38 cm of robot" refusal, which consumes the key, so the
   * speaker could not be picked up at all until somebody happened to walk DROID over
   * to take a sticker they had no reason to connect to the problem. Chapter 3 cannot
   * be finished without the speaker. Measured over 200 seeds: **35 of them, one run
   * in six.** `tests/chapters.test.ts` had been clearing the sticker first, which is
   * a test working around a bug rather than catching it.
   *
   * Filtering the spot rather than naming the booth: either beat can move, and this
   * stays correct when it does.
   */
  const noGo = mg.keySpots();
  const built = GF.booths.filter(
    (b) => !b.table && !noGo.some((s) => Math.hypot(inFrontOf(b).x - s.x, inFrontOf(b).y - s.y) < s.r + SPEAKER_CLEAR),
  );
  const hideBooth = built[Math.floor(ctx.rng() * built.length)];
  const speaker = { ...inFrontOf(hideBooth), r: 7, following: false, withStephan: false, sp: 0, face: Math.PI / 2 };
  /** Voxxy's route, dropped behind her for the speaker to walk — see `TRAIL_STEP`. */
  const trail: Vec2[] = [];
  /**
   * The speaker's own way round a stretch of that route no person can walk, and
   * where it comes out — see `SPEAKER_REPLAN`. Empty while they are on her route.
   */
  let way: Vec2[] = [];
  let wayTo: Vec2 = { x: speaker.x, y: speaker.y };
  /**
   * True when the last plan could reach none of her route and not her either:
   * they are standing where they wait, and there is nothing to plan again until
   * she moves or drops a crumb somewhere new. `waitSince` is when that started.
   */
  let waiting = false;
  let waitSince = 0;
  /** After a plan that found no way to her: sim time before which they do not look again. */
  let replanAt = 0;
  /** Seconds spent pressing on and getting nowhere — see `SPEAKER_STALL`. */
  let stalled = 0;
  /**
   * What they have said since they were last on her route — nothing, that they
   * will wait, or that they are going round — and when they last said anything.
   * Each at most once a time round: "I will wait" can still be followed by "I am
   * going round" when she comes out the far side, but neither is ever said twice.
   */
  let said: '' | 'wait' | 'round' = '';
  let saidAt = -Infinity;

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
   * WHICH WAY HE IS LOOKING. Michele, 29 Sep 2026: Stephan stood with his face
   * to the staircase — to the barrier and the flight behind it — so everybody
   * coming in through the doors met the back of his polo. The man holding the one
   * way up watches the way IN: `GF.entrance`, south-east of him. When a robot
   * walks up to him he turns to it, and back to the doors once it has gone. The
   * sim owns the heading (`Person.face`) so both renderers agree.
   */
  const doors: Vec2 = { x: GF.entrance.x + GF.entrance.w / 2, y: GF.entrance.y + GF.entrance.h / 2 };
  const doorsFace = Math.atan2(doors.y - stephan.y, doors.x - stephan.x);
  let stephanFace = doorsFace;
  /*
   * HIS BUTTON, and where he stands to press it.
   *
   * Michele's storyboard for the stair beat has Stephan PRESS something, and a
   * release button on a post beside the barrier is what a venue actually has for
   * a run of retractable belts. It stands just east of the belt line on the north
   * side of the centre post, a step from where Stephan waits: he walks to it
   * without crossing a lane, and the three lanes the robots climb in (`climbRoutes`)
   * are the gaps south of the centre, so the man and the queue never share floor.
   * A 25 cm pillar, and solid — it is a wall with its own line, like every post.
   */
  const BUTTON: Vec2 = { x: GF.gate.x + GF.gate.w + 7, y: run.posts[3].y + 1 };
  const STEPHAN_HOME: Vec2 = { x: stephan.x, y: stephan.y };
  const STEPHAN_PRESS: Vec2 = { x: BUTTON.x + 7, y: BUTTON.y + 7 };
  ctx.walls.push({
    x: BUTTON.x - 1.5,
    y: BUTTON.y - 1.5,
    w: 3,
    h: 3,
    kind: 'stairbutton',
    flavour: true,
    why: (b) =>
      b.kind === 'voxxy'
        ? `${b.name}: Stephan's button. It is his, and it is the only thing in this hall I have been told in advance not to press`
        : b.kind === 'droid'
          ? `${b.name}: the release for the belts. It is keyed to one finger, and the finger is Stephan's`
          : `${b.name}: a post with a button on it. I have a history with small buttons. I am leaving it`,
  });
  /*
   * THE TWO SHOTS of the stair beat (`shot()`), in plan px and metres.
   *
   * The framing stands against the lobby glazing at the north end of the belt
   * line and looks south-west down it: Stephan and his post nearest the lens, the
   * three robots queued in their lanes beyond him, the belts running away along
   * the foot of the flight and the flight itself climbing off to the right. It
   * opens low and close on Stephan and the queue (`FRAME.from`) and, as the black
   * lifts, rises and pulls back until the staircase is in (`FRAME.to`) — the
   * camera move of the storyboard.
   *
   * The climb follows the three of them: `back` px behind (east of) their centre
   * — but never out through the glazing, `GLASS_X` — and `side` px to the north,
   * on Voxxy's side, so the small robot is nearest the lens and Biggy is seen past
   * her rather than hiding everybody. Never lower than `clear` m over the flight
   * under the lens nor than `h` m over the tread they stand on: behind them and
   * below their heads, looking up the flight past them.
   */
  const FRAME = {
    from: { eye: { x: 1464, y: 322, h: 3.0 }, look: { x: 1436, y: 372, h: 0.8 } },
    to: { eye: { x: 1466, y: 290, h: 5.0 }, look: { x: 1404, y: 388, h: 1.3 } },
    /** Seconds the move takes, from the frame the cast is placed. */
    time: 2.8,
  } as const;
  const GLASS_X = 1464;
  const CLIMB_EYE = { back: 60, side: 30, clear: 1.6, h: 0.8, lead: 18, lookH: 1.1 };
  /** The hall's own raised floors — the flight among them — for the climb shot. */
  const FLOOR_PLATES = groundPlates();
  /*
   * THE SPEAKER GOES TO STEPHAN TOO. Michele, 28 Sep 2026: *"the speaker should
   * also go to stephan."*
   *
   * They used to be walked to a stage in the lobby, 17 m south of the man asking
   * for them, on the reasoning that a lectern belongs on a stage. It does — but
   * nobody in this chapter is giving a talk yet: Stephan is holding a staircase
   * and counting the three things he is waiting for, and one of them is a person.
   * Handing that person over is the beat, and it happens where he is standing.
   *
   * So the speaker's mark is the floor beside the soup's, a body's length further
   * south down the same concourse strip: two marks at his feet, both 36 px of the
   * 49 px between the barrier and the glazing, near enough that he can turn round
   * and greet them and far enough apart that Biggy setting a pot down does not
   * stand in the speaker's box. The prototype's HUD said *"speaker · with
   * Stephan"* all along; this is the game finally agreeing with it.
   */
  const speakerSpot = { x: stephan.x - 18, y: stephan.y + 42, w: 36, h: 48 };
  /*
   * ...BUT THE SOUP GOES WHERE THE MAN IS.
   *
   * Michele, 28 Sep 2026: *"maybe it's because steph moved, but the soup drop zone
   * is far from him. He could also get it on it's own when it's near."* Both
   * halves are right. The stage is 210 px — 17 m — from where Stephan has stood
   * since the staircase turned, so the chapter asked you to carry a pot of soup
   * past him and set it down across the lobby, and then had him drink it from
   * there. That is not a drop zone, it is a filing cabinet.
   *
   * So the soup's mark is the floor at his feet: the concourse strip between the
   * barrier and the glazing is 49 px wide and this is 36 of them, which Biggy
   * (18 px across) walks into with room either side. The stage keeps the keynote
   * speaker — a lectern belongs on a stage — and the two jobs stop sharing one
   * box. He also simply TAKES it if you get close enough to hand it over, which
   * is the other half of his note and the thing a man waiting for soup does.
   */
  const soupSpot = { x: stephan.x - 18, y: stephan.y - 30, w: 36, h: 60 };

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
  /**
   * The way in, from anywhere on the concourse: SOUTH OF THE GATE, then down the steps.
   *
   * Both the arrival and the re-acquire below need this, and they need the same one.
   * `GF.gate` — Stephan's barrier across the foot of the main staircase — is a
   * 6 x 197 px slab at x 1417, standing in the concourse for the whole of breakfast,
   * and a visitor aimed west at their own y walks into its east face and crawls it:
   * measured, ten of sixty standing in a 10 px-spaced line at x 1428, the gate's
   * face plus a body's radius, for a hundred seconds.
   *
   * So the first leg is always SOUTHWARD, to the clear band below the gate's foot,
   * and only then west. `lane` (0..1) spreads them across that band and across the
   * 22 m of steps, so the whole crowd is not single file through one waypoint.
   */
  function arrivalLegs(x: number, lane: number): Vec2[] {
    const st = GF.smallStairs;
    const doorY = 520 + (lane - 0.5) * 90;
    const step = st.y + 34 + lane * (st.h - 68);
    return [
      { x, y: doorY },
      /*
       * PAST THE DESK, AND NOBODY GETS IN WITHOUT A BADGE.
       *
       * Michele, 27 Sep 2026: *"People should maybe pass at the reception to get a
       * badge. Celestino should be there."*
       *
       * It costs one waypoint, because the route already ran along the front of
       * the reception counter on its way to the steps — the stanchions in the
       * lobby are there to funnel arrivals past exactly this desk
       * (`LOBBY_STANCHIONS`). So the leg is not a detour, it is the same walk with
       * a stop in it: they pause at the counter, and they come away wearing the
       * attendee ribbon they did not have when they came through the door.
       *
       * Spread along the counter by `lane` so three thousand people do not queue
       * at one point of it.
       */
      badgeStopFor(lane),
      { x: 1240, y: doorY },
      { x: st.x + st.w + 20, y: step },
      { x: GF.hall.x + GF.hall.w - 40, y: step },
    ];
  }

  /** The line in front of the reception counter that arrivals are served on. */
  const badgeLine = GF.reception.y + GF.reception.h + BADGE_STAND;

  /** The spot at the counter this arrival collects their badge at. */
  function badgeStopFor(lane: number): Vec2 {
    const rc = GF.reception;
    return { x: rc.x + 18 + lane * (rc.w - 36), y: badgeLine };
  }

  function spawnVisitor(): void {
    const e = GF.entrance;
    // Which door leaf, and which part of the 22 m wide steps, this one takes. One
    // shared route would put three thousand people in single file: they all aim at
    // the same waypoint, and "do not walk into the back of the person in front"
    // then turns the only threshold into a stationary conga line.
    const lane = ctx.rng();
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
    v.seed = nextSeed++;
    v.walk = (60 + ctx.rng() * 40) * SPEED_SCALE;
    v.colour = VISITOR_COLOURS[Math.floor(ctx.rng() * 4)];
    v.dwell = 0;
    v.hitCd = 0;
    v.stall = 0;
    v.badge = false;
    v.route = [
      // Straight through the bay first, then turn: the leaf is standing open in it.
      { x: e.x - 24, y: inY },
      { x: e.x - 40, y: inY },
      ...arrivalLegs(e.x - 40, lane),
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
  /** True when it actually had to move `a` — the caller uses that. */
  function pushOutOfWalls(a: { x: number; y: number; r: number }): boolean {
    let moved = false;
    for (const w of ctx.walls) {
      if (w.hidden) continue;
      const cx = a.x < w.x ? w.x : a.x > w.x + w.w ? w.x + w.w : a.x;
      const cy = a.y < w.y ? w.y : a.y > w.y + w.h ? w.y + w.h : a.y;
      const dx = a.x - cx;
      const dy = a.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > a.r * a.r) continue;
      moved = true;
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
    return moved;
  }

  function stepVisitor(a: Visitor, dt: number): void {
    if (a.dwell > 0) {
      a.dwell -= dt;
      a.vx *= 0.8;
      a.vy *= 0.8;
      return;
    }
    if (!a.route.length) {
      /*
       * NOT IN YET? THEN THE ONLY ROUTE IS THE STEPS.
       *
       * The lane grid is a HALL grid — `GF.laneX` stops at 1010 and `GF.laneY`
       * runs the hall's depth — so handing it to a visitor who is still out on the
       * concourse aims them at a node on the far side of the hall's east wall.
       * They walked the wall's face until it let them past: measured, one crossing
       * it at y 627, sixty px south of the steps that are the only way through it.
       *
       * So anybody who runs out of route east of that edge takes the arrival route
       * again — up to the stairs and down them — from wherever they now stand.
       */
      if (a.x > GF.hall.x + GF.hall.w) {
        // `seed`, not `rng`: the same person keeps the same lane every time they
        // have to take the route again, which is what a person does.
        a.route.push(...arrivalLegs(a.x, (a.seed % 17) / 17));
        return;
      }
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
    /*
     * Do not walk into the back of the person in front — GO ROUND THEM.
     *
     * This used to set the speed to zero and leave it there, which is a deadlock
     * with no way out of it: A is in front of B and B is in front of A, both stop,
     * and neither ever has a reason to move again. It survived at thirty-six
     * visitors and showed up the moment the count went to sixty — a permanent
     * knot of **seventeen** people at the top of the six steps, from frame 3,500
     * to the end of the chapter, measured across five seeds. A third of the crowd
     * stood in the doorway for the whole of breakfast.
     *
     * A blocked pedestrian does not stop, they sidestep, so that is what this
     * does: steer onto the perpendicular that leads AWAY from whoever is in the
     * way, at a little over half speed. Two people meeting head-on each see the
     * other a touch off-centre and pass; dead level, `seed` gives everybody a
     * consistent hand to favour, which is the same thing a corridor full of
     * people settles into on its own.
     */
    let blocker: Visitor | null = null;
    for (const o of crowd) {
      if (o === a) continue;
      const ox = o.x - a.x;
      const oy = o.y - a.y;
      const od = Math.hypot(ox, oy);
      /*
       * ...AND TWO PEOPLE ARE NEVER IN THE SAME PLACE.
       *
       * The sidestep above steers, and steering alone lets a dense stream merge:
       * measured at the threshold steps, two visitors were standing at exactly
       * (945, 453) — one body drawn twice. Nothing in this chapter depenetrated
       * the crowd from itself, because when they were pawns nobody could tell.
       *
       * So the same pass that looks for a blocker also parts an overlapping pair,
       * which is `botsCollide`'s positional half without its restitution: a crowd
       * should part, not bounce. It costs nothing — the loop was already here, and
       * this is the branch it was missing.
       *
       * It moves ONLY `a`, by half the overlap, and leaves `o` where it is: `o`
       * takes its own half when its turn to be stepped comes, and the pair is
       * symmetric over a frame either way. Pushing `o` here instead put a body
       * outside its own step, after the wall push-out that would have caught it —
       * so crowd pressure walked people THROUGH the stair wall (measured: a
       * visitor at y 594, twenty px south of the steps' own edge). A body is only
       * ever moved while it can still be un-moved by the wall list.
       */
      if (od > 0 && od < a.r + o.r) {
        const push = (a.r + o.r - od) / 2;
        a.x -= (ox / od) * push;
        a.y -= (oy / od) * push;
      }
      if (od < 12 && (ox * dx + oy * dy) / (od * d) > 0.6) {
        blocker = o;
        break;
      }
    }
    /*
     * ...AND A ROBOT STANDING IN THE LANE IS SOMETHING YOU WALK ROUND.
     *
     * Michele, 28 Sep 2026, with a photograph of fourteen people stopped nose to
     * tail along the threshold: *"people keep getting clustered - blocked on this
     * line"*, and then *"Crowd also block Droid now."* Both are the same missing
     * line. A visitor only ever looked for another VISITOR in the way, so a robot
     * parked on a lane was not something to walk round — it was a solid the
     * push-out slid them along, and the people behind piled into the people in
     * front. One robot standing still made a fourteen-person queue out of a crowd
     * that had somewhere else to be.
     *
     * A robot is bigger than a person, so it gets a wider berth (`b.r + 8` rather
     * than the flat 12 px a body gets), and it is checked after the crowd so a
     * person already dodging somebody keeps dodging them.
     */
    if (!blocker) {
      for (const bot of ctx.bots) {
        if (bot.mounted) continue;
        const ox = bot.x - a.x;
        const oy = bot.y - a.y;
        const od = Math.hypot(ox, oy);
        if (od > 0 && od < bot.r + 8 && (ox * dx + oy * dy) / (od * d) > 0.4) {
          blocker = { x: bot.x, y: bot.y } as Visitor;
          break;
        }
      }
    }
    let ux = dx / d;
    let uy = dy / d;
    let spd = a.walk;
    if (blocker) {
      // The left-hand normal of the way they are trying to go.
      const px = -uy;
      const py = ux;
      const lean = (blocker.x - a.x) * px + (blocker.y - a.y) * py;
      const side = lean === 0 ? (a.seed % 2 === 0 ? 1 : -1) : lean > 0 ? -1 : 1;
      ux = ux * 0.35 + px * side;
      uy = uy * 0.35 + py * side;
      const n = Math.hypot(ux, uy) || 1;
      ux /= n;
      uy /= n;
      spd = a.walk * 0.55;
    }
    const k = 1 - Math.exp(-8 * dt);
    a.vx += (ux * spd - a.vx) * k;
    a.vy += (uy * spd - a.vy) * k;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    /*
     * ...AND THEY FACE THE WAY THEY ARE WALKING.
     *
     * Michele, with a screenshot of the threshold steps: *"Some seem to walk
     * backward or have the backpack on front."* They did, all sixty of them.
     * `Visitor extends Bot`, so every one of them carried `Bot.face`, and `mkBot`
     * sets that to **0** — due east — while nothing in this function ever touched
     * it again. `stepBot`'s `stepAim` is what keeps a robot's heading honest and
     * a visitor is not stepped by `stepBot`. So the renderer, which had just
     * started drawing people with a front, a back and a rucksack, pointed every
     * single one of them east regardless of where they were going.
     *
     * Invisible until the crowd stopped being pawns, which is the shape this
     * chapter keeps producing: the renderer knowing about something the sim does
     * not. The threshold shows it first because that is where they turn.
     *
     * Below `FACE_MIN_SPEED` the heading holds: somebody who has stopped to look
     * at a booth keeps the way they were pointing rather than spinning on drift.
     */
    if (speed(a) > FACE_MIN_SPEED) a.face = Math.atan2(a.vy, a.vx);
    /*
     * TOUCHING A BOOTH MEANS THE ROUTE IS STALE — TAKE A NEW ONE.
     *
     * Michele: *"The small stair between reception and main hall seem to block
     * them."* It is not the stair. The crossing is `GF.smallStairs`, 93 x 283 px,
     * and the wall list over it is **empty**: measured, nothing stands in it at all.
     *
     * What jams is the corner beside it. A leg of the lane grid is axis-aligned,
     * but a visitor who has sidestepped is no longer ON the lane, so the straight
     * line from where they actually are to the next node clips the end-of-row booth
     * at x 880..940 — twelve pixels from the stairwell and they are sixteen across.
     * The push-out then slid them along the booth's face and they kept aiming at
     * the same node, so they crawled the wall instead of walking the floor:
     * measured, a standing line of them at x 936..948 with the 283 px opening
     * beside it empty.
     *
     * Grazing something means the line you were walking may no longer be a line you
     * can walk, so the leg is dropped and the next tick either takes the next
     * waypoint or re-acquires the grid from where they now stand. It is what a
     * person does when they bump into a stand.
     *
     * But ONLY once the graze has actually cost them ground. Dropping a leg on the
     * first touch reads as a bug at the doors: the three entrance bays have their
     * mullions and their standing-open leaves in the wall list, so a visitor
     * threading a bay grazes one for a frame or two while still walking straight
     * in. Dropping the leg there threw away the arrival route inside the doorway
     * and left them ambling the lane grid from the wrong side of the concourse —
     * measured, eight of sixty parked at x 1428 with the hall empty in front of
     * them. So the touch has to come with no progress, for `GRAZE_STALL` of it,
     * before the leg is what gets blamed.
     */
    /*
     * BEING AT THE DESK IS WHERE A BADGE COMES FROM.
     *
     * Checked on POSITION every frame rather than on arriving at the waypoint,
     * and the difference is 24 of 60 people: a visitor who is shoved off the mark
     * by the crowd, or whose leg the stall-breaker drops, still walks the length
     * of that counter — and measured on the waypoint alone, forty per cent of
     * them reached the hall with no ribbon on. Anybody who comes within a body's
     * length of the front of the counter is served, which is also what a desk is.
     */
    if (!a.badge && Math.abs(a.y - badgeLine) < BADGE_REACH && a.x > GF.reception.x - 12 && a.x < GF.reception.x + GF.reception.w + 12) {
      a.badge = true;
      a.dwell = BADGE_DWELL * (0.7 + ctx.rng() * 0.6);
    }
    const grazed = pushOutOfWalls(a);
    pushOutOfCrates(a);
    /*
     * A leg that is making no ground gets dropped, whether a wall is to blame or
     * a person is.
     *
     * It used to need `grazed` — the fault it was written for was a visitor
     * crawling a booth's face — and a crowd that jams on itself grazes nothing at
     * all. Michele's photograph of the threshold is that case: everybody walking,
     * nobody arriving, because each of them was steering round the one in front
     * and none of them was getting closer to a waypoint they all shared. Progress
     * is the test now, and the graze only decides how long it is given.
     */
    const stuck = Math.hypot(t.x - a.x, t.y - a.y) > d - a.walk * dt * 0.25;
    if (stuck) a.stall += dt * (grazed ? 1 : GRAZE_STALL / CROWD_STALL);
    else a.stall = 0;
    if (a.stall > GRAZE_STALL) {
      a.stall = 0;
      a.route.shift();
    }
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
  /**
   * WHEN THE LAST CRATE LANDED — the clock the bar's payoff runs on.
   *
   * Michele, 28 Sep 2026: *"When all is delivered, something should happen
   * (Spiller start and biggy toasts?)"* — *spillare*, to pour. Until now the
   * sixth crate set `beerDone`, printed a line and left the bar exactly as it
   * was: the taps that had been "ready" since the chapter opened stayed ready,
   * and the only thing that happened was a flag going true.
   *
   * So the bar pays off on its own clock: a beat, then the three taps run, the
   * glassware fills, and Biggy raises one. `-1` until the last crate is on.
   */
  let beerAt = -1;
  /** Has he raised it yet? The toast fires once, on its own beat. */
  let toasted = false;
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
      beerAt = ctx.t;
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
      if (ladle === 'in') return pick(['Where is my soup?', 'Tomato. At breakfast, yes. It is a tradition and I am the one who keeps it.']);
      if (ladle === 'carried')
        return pick(['Where is my soup?', 'The tall one is walking about with my ladle. It goes IN the pot. It is not a souvenir.']);
      return pick(['Where is my soup?', 'The pot is on the counter and the ladle is on the shelf. I am not doing it myself, I am holding a staircase.']);
    }
    if (!speaker.withStephan) {
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
    // The splash that empties the pot puts the REST of the pot on the floor, so it
    // leaves a lake and not the same little mark as a graze.
    stain(soup <= 0 ? Math.max(amount, 22) : amount);
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
  /** Put what came out of the pot on the floor, where the body is standing. */
  function stain(amount: number): void {
    const bg = ctx.byKind('biggy');
    // A 4% bump is a splash at his feet; the last of a pot is a lake. The spread
    // is the body's own radius plus the amount, so the two read as the same event.
    const r = Math.min(26, 7 + amount * 0.7);
    if (stains.length >= MAX_STAINS) stains.shift();
    stains.push({ x: bg.x, y: bg.y + bg.r * 0.6, r });
  }

  function ruined(line: string): void {
    // No stain here. This runs for the cold pot too, and soup going cold is not
    // soup going on the floor — the splash that empties it has already left its
    // own lake (`spill`).
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
   * The dead ends hand it back — Voxxy with nothing to do, Biggy with nothing to
   * pick up, and, since the other two robots got a party trick of their own on
   * 25 Sep 2026, Droid with nothing to reach. What `game.ts` does with it then is
   * take hold of Biggy, or talk to whoever is standing there (`talk`, 29 Sep:
   * *"I'd prefer all robots to talk"*), and only then the party trick. Every
   * refusal that names a REASON keeps the key,
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
     * ASKING A QUEUE TO MAKE WAY — ANY OF THE THREE, NOT JUST VOXXY.
     *
     * Michele, 28 Sep 2026, playing chapter 3: *"Crowd also block Droid now. Fine
     * but all robots should be able to move them, not only voxxy."* He is right,
     * and the old arrangement was worse than a missing feature: the queue is a
     * wall of people across the one doorway the soup comes through, and the only
     * robot who could open it was the one not carrying the pot. Biggy, stood at
     * the queue with the soup going cold in his arms, had to put the errand down
     * and go and fetch Voxxy to say a sentence.
     *
     * Three voices, because a line that stops you owes you one in the voice of
     * whoever is speaking (CLAUDE.md) — and because what is funny here is the
     * difference between being asked by a small orange robot, by a very tall
     * polite one, and by something the size of a fridge.
     *
     * It is every robot's LAST resort rather than their first, which is not a
     * detail: the soup pot stands 60 px behind the soup queue's own tail, so a
     * version of this that ran before the errands had Biggy walk up to the pot,
     * press `E`, and ask the queue to make way instead of picking it up.
     * `tests/chapters.test.ts` caught that on the first run.
     */
    const askQueue = (who: Bot): boolean => {
      const q = queues.find((o) => o.people.some((pp) => Math.hypot(pp.x - who.x, pp.y - who.y) < QUEUE_ASK));
      if (!q || q.open > 0) return false;
      /*
       * ...EXCEPT BIGGY. Michele, 29 Sep 2026: *"Biggy should not be able to move
       * the queue on its own."* The queue in the soup doorway is the one gate the
       * soup errand has, and Biggy asking it aside made it no gate at all: he
       * walked up with an empty pot, pressed `E` and walked in. So he asks and
       * nothing happens, and he knows why. Voxxy and Droid still can (his 28 Sep
       * call, above, was about them being stopped by the crowd).
       */
      if (who.kind === 'biggy') {
        ctx.flash(BIGGY_QUEUE_LINE, 4200);
        return true;
      }
      q.open = QUEUE_OPEN;
      const said =
        who.kind === 'voxxy'
          ? 'Voxxy: "Excuse me — soup coming through!"'
          : who.kind === 'droid'
            ? 'Droid: "Excuse me. I can see over all of you, and what I can see is that the soup is that way."'
            : 'Biggy: "Mind your feet. Mind all of your feet."';
      ctx.flash(`${said} — the ${q.label} makes way for ${QUEUE_OPEN}s`);
      return true;
    };

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
      if (ladle === 'shelf' && dist(d, shelfAt) < SHELF_REACH) {
        ladle = 'carried';
        ctx.flash('Droid reaches the high shelf — ladle in hand. Now the pot, on the soup counter.');
        return true;
      }
      // ...and the other half of the errand: he has to go and put it IN the pot.
      if (ladle === 'carried' && dist(d, station) < POT_REACH) {
        ladle = 'in';
        ctx.flash('Droid drops the ladle in the pot: "It is a long arm. That is the whole of my contribution to breakfast."', 3600);
        return true;
      }
      if (dist(d, station) < POT_NAG) {
        ctx.flash(potRefusal(d), 4200);
        return true;
      }
      const dc = crateInReach(d);
      if (dc) {
        ctx.flash(`Droid: "${dc.name}. Half my own mass, all of it above the knee. This one is Biggy's."`);
        return true;
      }
      if (askQueue(d)) return true;
      // His dead end, handed back: at Biggy it becomes a grab, at a person a word
      // with them (`talk`), anywhere else the stretch. "Nothing to reach here" is
      // what the stretch says, without words.
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
        if (ladle !== 'in') {
          // Two different problems, two different answers: nobody has the ladle,
          // or somebody is standing there holding it.
          ctx.flash(
            ladle === 'carried'
              ? 'Biggy: "Droid. It goes IN the pot. I am not fishing it out of your hand."'
              : 'Biggy: no ladle. Droid, the shelf!',
          );
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
      if (carrying && !delivered && (inRect(bg, soupSpot) || dist(bg, stephan) < SOUP_HANDOVER)) {
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
      if (askQueue(bg)) return true;
      // His dead end. He cannot hop, but he can be taken hold of, he can talk to
      // whoever is standing there (`talk`), and `spareE` has a better line for him
      // than this one did.
      return false;
    }

    /*
     * THE KEYNOTE SPEAKER FIRST. They are the chapter's objective and everybody
     * else in the hall is conversation, so nobody standing near their booth may
     * answer for them — that would be the Sticker Mine soft-lock again, one
     * bystander along (see `SPEAKER_CLEAR`).
     */
    if (!speaker.following && dist(speaker, v) < TALK_REACH) {
      speaker.following = true;
      ctx.flash('Keynote speaker: "Oh! Is it time? Lead the way."');
      return true;
    }
    // Everybody else in the hall is conversation, and conversation is `talk`,
    // for all three of them — after the jobs below and after Biggy's bar.
    if (dist(v, station) < POT_NAG) {
      ctx.flash(potRefusal(v), 4200);
      return true;
    }
    const vc = crateInReach(v);
    if (vc) {
      ctx.flash(`Voxxy: "${vc.name} weighs more than I do. Considerably more. BIGGY!"`);
      return true;
    }
    if (askQueue(v)) return true;
    // Her dead end, handed back: at Biggy it becomes a grab, at a person a word
    // with them (`talk`), anywhere else a hop.
    return false;
  }

  /**
   * SMALL TALK, FOR ALL THREE OF THEM (`ChapterRuntime.talk`).
   *
   * Michele, 29 Sep 2026, with a screenshot of Josh in the hall: *"is this Josh?
   * how do I talk to him? with E I get my action"* — and then *"I'd prefer all
   * robots to talk."* The people in this hall answered Voxxy and nobody else, so
   * `E` beside Josh was a stretch for Droid and a roll for Biggy.
   *
   * `game.ts` asks only once `key` has handed `E` back and the tow bar has had its
   * turn: every job here still comes first — the pot, the crates, the ladle, a
   * queue asked aside, the keynote speaker for Voxxy — and so does taking hold of
   * Biggy. The party trick is what is left with nobody near.
   *
   * The NEAREST person answers, within `TALK_REACH` of the robot's own edge: at
   * the high table two of them stand closer together than that, and "whoever is
   * first in the list" would answer for whoever the robot is actually facing. The
   * keynote speaker talks while standing still — hiding, to the two robots who
   * are not the one sent to fetch them, or once handed over — and not while
   * walking behind Voxxy, where they are never out of reach and `E` has to go on
   * meaning her hop.
   */
  function talk(b: Bot): boolean {
    let who: { name: string; line: string } | null = null;
    let nearest = TALK_REACH + b.r;
    for (const n of npcs) {
      const d = dist(n, b);
      if (d < nearest) {
        nearest = d;
        who = n;
      }
    }
    const standing = speaker.withStephan || (!speaker.following && b.kind !== 'voxxy');
    if (standing && dist(speaker, b) < nearest) {
      who = { name: 'Keynote speaker', line: speaker.withStephan ? SPEAKER_HANDED_OVER : SPEAKER_HIDING };
    }
    if (!who) return false;
    ctx.flash(smallTalk(b, who.name, who.line), 4500);
    return true;
  }

  /* ------------------------------------------------------------------- update */

  function done(): void {
    gateOpen = true;
    ctx.removeWall(gate);
    /*
     * Stephan's own wall comes off and the barrier's does not — the posts for good,
     * the belts until each has wound home (`windBelts`). The line is not open on
     * this frame and it is not meant to be: what happens now is Stephan walking to
     * his button, in the stair beat's own shot, and only then the belts.
     */
    for (const w of gatePostWalls) ctx.walls.push(w);
    for (const b of gateBeltWalls) if (b.live) ctx.walls.push(b.live);
    ctx.score.soup = Math.trunc(soup);
    ctx.score.temp = Math.trunc(temp);
    ctx.score.complaints = complaints;
    ctx.score.breakfastT = Math.round(ctx.t);
    ctx.flash('Stephan: "Soup. Speaker. Beer off my floor. Fine — line up at the belts."', 3600);
    leave();
  }

  /** Each belt stops being a collider on the frame it finishes winding in. */
  function windBelts(u: number): void {
    gateSwing = u;
    // The same frame the renderer stops drawing it: both ask `beltUp` of the same
    // `gateSwing`, so a belt cannot be a picture without a wall or a wall without
    // a picture.
    for (const b of gateBeltWalls) {
      if (b.live && !beltUp(gateSwing, b.rank)) {
        ctx.removeWall(b.live);
        b.live = null;
      }
    }
  }

  /** The lanes the three of them climb in, and the marks they wait on. */
  function climbRoutes(): CutRoute[] {
    /*
     * Up the flight, which climbs WEST from the belt line, and through the GAPS
     * BETWEEN THE POSTS rather than through a post.
     *
     * Nine posts across a 15.76 m line puts one EXACTLY on the centre, so the lanes
     * are three of the run's own gaps, read off `run` rather than guessed: the
     * three just south of the centre post, clear of the button post Stephan steps
     * to on the north side. Each lane is a straight line up the flight — the same
     * `y` from the mark to the head — so nobody drifts across the treads into the
     * balustrade, and the walk ends a robot's length short of the head wall with
     * Biggy, last up, a little further down than the other two.
     *
     * Cutscene walks ignore walls (`cutUpdate` in `game.ts`), which is exactly why
     * this has to be right here: nothing would have stopped them, and a robot
     * clipping through a chrome post in the last shot of the chapter is something a
     * viewer sees and no collider test does.
     */
    const lane = (i: number): number => (run.belts[i].a.y + run.belts[i].b.y) / 2;
    const foot = GF.gate.x + GF.gate.w;
    const route = (kind: 'voxxy' | 'droid' | 'biggy', y: number, wait: number, head: number): CutRoute => ({
      kind,
      delay: CLIMB_DELAY[kind],
      pts: [
        { x: foot + wait, y },
        { x: stair.x + stair.w - 2, y },
        { x: stair.x + head, y },
      ],
    });
    return [route('voxxy', lane(4), 13, 20), route('droid', lane(5), 17, 26), route('biggy', lane(6), 23, 36)];
  }

  /** The exit: the stair beat, then up the main staircase. */
  function leave(): void {
    scene = -1;
    ctx.startCut(climbRoutes(), () => ctx.startChapter(4), VIEW_GROUND, {
      walkTime: CLIMB_TIME,
      hold: () => scene < CLIMB_AT,
      tick: stairBeat,
    });
  }

  const smooth = (u: number): number => {
    const k = u < 0 ? 0 : u > 1 ? 1 : u;
    return k * k * (3 - 2 * k);
  };

  /**
   * The stair beat, one frame of it: Stephan to his post and his hand to the
   * button, the belts, and the hall carrying on behind them.
   */
  function stairBeat(dt: number): void {
    if (scene < 0) {
      scene = 0;
      // The speaker waits at the far end of the queue, off the lanes and out of
      // the framing's foreground, and watches them go.
      speaker.x = GF.gate.x + GF.gate.w + 26;
      speaker.y = (run.belts[7].a.y + run.belts[7].b.y) / 2;
      speaker.sp = 0;
      speaker.face = Math.PI;
    }
    scene += dt;
    const B = STAIR_BEAT;
    // Stephan: turn from the doors to the post, step over, reach, press.
    const k = smooth((scene - B.stepAt) / B.stepTime);
    const nx = STEPHAN_HOME.x + (STEPHAN_PRESS.x - STEPHAN_HOME.x) * k;
    const ny = STEPHAN_HOME.y + (STEPHAN_PRESS.y - STEPHAN_HOME.y) * k;
    stephanSp = dt > 0 ? Math.hypot(nx - stephan.x, ny - stephan.y) / dt : 0;
    stephan.x = nx;
    stephan.y = ny;
    const toPost = Math.atan2(BUTTON.y - STEPHAN_PRESS.y, BUTTON.x - STEPHAN_PRESS.x);
    let want = toPost;
    if (scene >= B.press + 0.7) {
      // ...and then he turns to watch them go.
      let cx = 0;
      let cy = 0;
      for (const b of ctx.bots) {
        cx += b.x / ctx.bots.length;
        cy += b.y / ctx.bots.length;
      }
      want = Math.atan2(cy - stephan.y, cx - stephan.x);
    }
    const d = Math.atan2(Math.sin(want - stephanFace), Math.cos(want - stephanFace));
    const turn = STEPHAN_TURN * 2 * dt;
    stephanFace = Math.abs(d) <= turn ? want : stephanFace + Math.sign(d) * turn;
    const up = smooth((scene - (B.press - B.reachTime)) / B.reachTime);
    const down = smooth((scene - (B.press + 0.2)) / 0.45);
    reach = Math.max(0, up - down);
    if (!pressed && scene >= B.press) {
      pressed = true;
      ctx.flash('Stephan presses the button on the post. A green light, a beep — and the eight belts wind home, one after the other. Up you go.', 4200);
    }
    if (scene >= B.belts && gateSwing < 1) windBelts(Math.min(1, (scene - B.belts) / GATE_SWING_TIME));
    // The hall does not stop for the shot.
    for (const a of crowd) stepVisitor(a, dt);
  }

  /**
   * The shot the stair beat is filmed in (`GameSnapshot.shot`), eye and target in
   * sim px with heights in metres off the hall floor.
   *
   * First the framing: from the lobby strip, above head height, the belt line
   * with the flight rising behind it — Stephan, his post and the three of them in
   * the one frame — pushing in a little while the black lifts. Then the climb:
   * behind the three of them and below their heads, riding up the flight with
   * them at the height the flight's own plate gives them, so they rise into the
   * frame rather than out of it, with nothing between the lens and them but air.
   */
  function shot(): CameraShot | null {
    if (!gateOpen) return null;
    const climb = scene - CLIMB_AT;
    if (scene < 0 || climb < 0) {
      const u = smooth(Math.max(0, scene) / FRAME.time);
      const mix = (a: { x: number; y: number; h: number }, b: { x: number; y: number; h: number }) => ({
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        h: a.h + (b.h - a.h) * u,
      });
      return { name: 'stair-gate', eye: mix(FRAME.from.eye, FRAME.to.eye), look: mix(FRAME.from.look, FRAME.to.look) };
    }
    let cx = 0;
    let cy = 0;
    for (const b of ctx.bots) {
      cx += b.x / ctx.bots.length;
      cy += b.y / ctx.bots.length;
    }
    const rc = riseAt(cx, cy, FLOOR_PLATES);
    const ex = Math.min(cx + CLIMB_EYE.back, GLASS_X);
    const ey = Math.max(cy - CLIMB_EYE.side, stair.y + 10);
    const eh = Math.max(riseAt(ex, ey, FLOOR_PLATES) + CLIMB_EYE.clear, rc + CLIMB_EYE.h);
    return {
      name: 'stair-climb',
      eye: { x: ex, y: ey, h: eh },
      look: { x: cx - CLIMB_EYE.lead, y: cy, h: rc + CLIMB_EYE.lookH },
    };
  }

  /**
   * The keynote speaker's way round, from where they stand, when the straight line
   * to `tgt` — the next crumb of Voxxy's route, or Voxxy — is not one a person can
   * walk (`SPEAKER_REPLAN`).
   *
   * To the FIRST crumb of her route they can reach, then her route again from
   * there; the crumbs before it are dropped, because a crumb with no way in for a
   * person is one nobody is ever going to walk. If none can be reached, nor Voxxy
   * herself — she is under a tablecloth, or somewhere else only she fits — to the
   * floor nearest her, and they wait there for her to come out (`update` says so,
   * if she does not come straight back out).
   *
   * And when they go round, they say so: once a time round (`said`), and not for
   * a corner.
   */
  function goRound(tgt: Vec2, lead: Vec2): void {
    stalled = 0;
    const d = detour(ctx.walls, speaker, [...trail, lead], speaker.r, SPEAKER_BEHIND);
    trail.splice(0, d.goal < 0 ? trail.length : d.goal);
    way = d.path;
    wayTo = trail[0] ?? lead;
    if (d.goal < 0) {
      if (!waiting) waitSince = ctx.t;
      replanAt = ctx.t + SPEAKER_REPLAN;
    }
    waiting = d.goal < 0;
    if (waiting || said === 'round' || ctx.t - saidAt < BLOCKED_THROTTLE) return;
    // How much further round it is than straight to where it comes out.
    let len = 0;
    let at: Vec2 = speaker;
    for (const p of way) {
      len += dist(at, p);
      at = p;
    }
    if (len < dist(speaker, at) + SPEAKER_NOTICE) return;
    // The line names the tablecloth when it is a tablecloth that is in the way.
    const cloth = ctx.walls.some((w) => w.booth?.table && !clearWalk([w], speaker, tgt, 0));
    said = 'round';
    saidAt = ctx.t;
    ctx.flash(cloth ? SPEAKER_ROUND_TABLE : SPEAKER_ROUND, 4000);
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
              else ctx.flash(`Biggy walked into the ${q.label} (${complaints}) \u2014 they do not move for him. Voxxy asks.`);
              leanAt = ctx.t;
            } else if (b.kind === 'biggy' && ctx.t - leanAt >= BLOCKED_THROTTLE) {
              // Leaning on them, slowly: the queue stays exactly where it is, and
              // he says so — at the throttle every other blocked line uses.
              leanAt = ctx.t;
              ctx.flash(BIGGY_QUEUE_LINE, 4200);
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
    {
      // The nearest robot close enough to talk to, or the doors; a turn, not a snap.
      let near: Bot | null = null;
      for (const b of ctx.bots) {
        if (dist(b, stephan) < TALK_REACH + b.r + 8 && (!near || dist(b, stephan) < dist(near, stephan))) near = b;
      }
      const want = near ? Math.atan2(near.y - stephan.y, near.x - stephan.x) : doorsFace;
      const d = Math.atan2(Math.sin(want - stephanFace), Math.cos(want - stephanFace));
      const turn = STEPHAN_TURN * dt;
      stephanFace = Math.abs(d) <= turn ? want : stephanFace + Math.sign(d) * turn;
    }
    for (const b of ctx.bots) {
      for (const n of npcs) standOff(b, n);
      standOff(b, stephan);
      if (!speaker.following) standOff(b, speaker);
    }

    if (speaker.following && !speaker.withStephan) {
      const v = ctx.byKind('voxxy');
      /*
       * Drop a breadcrumb where Voxxy is — but only where the SPEAKER could
       * stand.
       *
       * Michele, 28 Sep 2026: *"remember that voxxy can go under the tables!"*
       * He is right, and the first cut of this got it wrong: the sponsor half
       * tables are `low: true` with `skipFor: voxxy` (`geometry.ts`), so a guard
       * that waved low walls through was dropping crumbs under the tablecloths —
       * a route only Voxxy can walk, handed to the person following her. The
       * probe is the speaker's own body against every wall, low ones included.
       */
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(v.x - last.x, v.y - last.y) > TRAIL_STEP) {
        const probe = { x: v.x, y: v.y, r: speaker.r };
        if (!ctx.walls.some((w) => circleRect(probe, w))) {
          trail.push({ x: v.x, y: v.y });
          if (trail.length > TRAIL_MAX) trail.shift();
        }
      }
      while (trail.length > 0 && dist(trail[0], speaker) < TRAIL_REACH) trail.shift();

      // The next crumb if there is one; otherwise Voxxy herself, unless she is
      // already standing on the spot — then the spot, so the speaker settles next
      // to Stephan instead of orbiting the robot.
      const lead = inRect(v, speakerSpot) ? speakerAt : { x: v.x, y: v.y };
      const head = trail[0];
      const tgt = head ?? lead;
      // A crumb is walked onto; a person is stopped short of.
      const stop = head ? 0 : SPEAKER_BEHIND;
      /*
       * ...and whether a person can get there — see `SPEAKER_REPLAN`. Her route
       * first, in a straight line, exactly as it always was; the way round only
       * when that line would walk them into something she went under or through.
       */
      let aim: Vec2 | null = null;
      if (dist(tgt, speaker) <= stop) {
        way = [];
        waiting = false;
      } else {
        // A way planned to somewhere they are no longer going is no way at all.
        if (dist(wayTo, tgt) > TRAIL_STEP) {
          way = [];
          waiting = false;
        }
        const onRoute = way.length === 0 && !waiting && stalled < SPEAKER_STALL;
        if (onRoute && clearWalk(ctx.walls, speaker, tgt, speaker.r - WALK_SLACK)) {
          aim = tgt;
          said = '';
        } else {
          if ((onRoute || stalled >= SPEAKER_STALL) && ctx.t >= replanAt) goRound(tgt, lead);
          while (way.length > 0 && dist(way[0], speaker) < 1) way.shift();
          aim = way[0] ?? null;
        }
      }
      /*
       * Waiting for her, and they say so — but only once she has had a second to
       * come straight out again. Voxxy crossing a table takes about that long,
       * and "I will wait here" followed at once by walking off round it is a
       * person who did not mean it.
       */
      if (waiting && said === '' && ctx.t - waitSince >= SPEAKER_STALL && ctx.t - saidAt >= BLOCKED_THROTTLE) {
        said = 'wait';
        saidAt = ctx.t;
        ctx.flash(SPEAKER_WAITS, 4000);
      }
      speaker.sp = aim ? SPEAKER_WALK : 0;
      if (!aim) stalled = 0;
      else {
        const dx = aim.x - speaker.x;
        const dy = aim.y - speaker.y;
        const dd = Math.hypot(dx, dy);
        const was: Vec2 = { x: speaker.x, y: speaker.y };
        // Onto a waypoint, not past it: a corner of the way round is a corner.
        const step = Math.min(dd, SPEAKER_WALK * dt);
        speaker.face = Math.atan2(dy, dx);
        speaker.x += (dx / dd) * step;
        speaker.y += (dy / dd) * step;
        /*
         * ...and a tablecloth stops them, which it did not used to.
         *
         * This skipped `low` walls, so the keynote speaker walked straight
         * through the sponsor tables and the BOF workshop tables — the one thing
         * in the hall that is low *because* only something Voxxy-sized gets under
         * it. With the breadcrumbs routing them round the furniture there is
         * nothing left for the exemption to rescue, and a person gliding through
         * a draped table is the kind of thing a judge sees in three seconds.
         */
        for (const w of ctx.walls) {
          const hit = circleRect(speaker, w);
          if (hit) {
            speaker.x += hit.nx * hit.pen;
            speaker.y += hit.ny * hit.pen;
          }
        }
        // A quarter of a step or less, and they are pressing on for nothing.
        stalled = dist(was, speaker) < step / 4 ? stalled + dt : 0;
      }
      /*
       * ...and Stephan will step over for them, the way he takes the soup out of
       * Biggy's arms. A man who has been asking for this person for ten minutes
       * does not stand on a mark waiting for them to line up on it.
       */
      if (inRect(speaker, speakerSpot) || dist(speaker, stephan) < SPEAKER_HANDOVER) {
        speaker.withStephan = true;
        ctx.flash('Keynote speaker: "Stephan! Sorry — the queues." — Stephan: "You are here. Nothing else matters."', 3600);
      }
    }

    /*
     * THE BAR PAYS OFF — the taps run and Biggy raises one.
     *
     * The pour itself is in `props()`, because it is a picture and nothing else;
     * this is the one beat that changes the sim, and it is a flourish on a robot.
     * `flair` is set directly rather than through `partyTrick` on purpose: the
     * toast is the chapter's, not the player's, so it does not check the stick,
     * the rest timer or Droid's feet, and it does not speak Biggy's `E` line.
     */
    if (beerDone && !toasted && ctx.t - beerAt >= TOAST_AT) {
      toasted = true;
      const bg = ctx.byKind('biggy');
      if (!bg.mounted) {
        bg.flair = BIGGY_ROLL_DUR;
        bg.flairDur = BIGGY_ROLL_DUR;
      }
      ctx.flash(
        `Biggy raises one at ${BAR_NAME}: "To tonight. ${CRATE_DELIVERY} crates, ${oom} heap error${oom === 1 ? '' : 's'}, ` +
          'and not a drop before doors."',
        4200,
      );
    }
    if (delivered && speaker.withStephan && beerDone && !gateOpen) done();
  }

  /* --------------------------------------------------------- snapshot payload */

  function props(): Prop[] {
    const bg = ctx.byKind('biggy');
    const droidNow = (): Vec2 => ctx.byKind('droid');
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
      /*
       * The ladle, wherever it is: on the shelf, in Droid's hand, or in the pot.
       *
       * One prop with three places and three states, rather than a flag and a
       * decoration — the renderer draws it at the height each of those means (on
       * the shelf slab, at Droid's hand, standing in the pot), and a player who
       * cannot find it can follow it. The rect while it is carried is a small box
       * on Droid's own centre, exactly as the soup pot rides on Biggy's.
       *
       * Once the soup is handed over there is no pot on Biggy any more, so the
       * ladle is back in the counter's vat rather than riding on a robot with
       * nothing to stand in (the 3D build stands it in whichever pot this says).
       */
      {
        kind: 'ladle',
        ...(ladle === 'shelf'
          ? GF.food.shelf
          : ladle === 'carried'
            ? { x: droidNow().x - 8, y: droidNow().y - 8, w: 16, h: 16 }
            : carrying && !delivered
              ? { x: bg.x - 8, y: bg.y - 8, w: 16, h: 16 }
              : { x: station.x - 8, y: station.y - 8, w: 16, h: 16 }),
        state: ladle === 'in' ? 'done' : ladle === 'carried' ? 'active' : 'idle',
        label: ladle === 'in' ? 'ladle · in the pot' : ladle === 'carried' ? 'ladle · Droid has it' : 'ladle (high shelf)',
      },
      { kind: 'dropzone', ...soupSpot, state: delivered ? 'done' : 'idle', label: 'bring the soup to Stephan' },
      /*
       * ...and the speaker's own mark, a body's length south of the soup's.
       *
       * Two marks at the same man's feet rather than one: they are two different
       * jobs by two different robots, they finish at different times, and a single
       * box that means "put a pot here OR stand a person here" is a box that says
       * neither. Same ring, same green, one step apart.
       */
      {
        kind: 'dropzone',
        ...speakerSpot,
        state: speaker.withStephan ? 'done' : 'idle',
        label: 'lead the keynote speaker here',
      },
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
       * Stephan's button post, beside the belt line: red until he presses it,
       * green from the press on. `v` is his hand on it (`reach`), so the button
       * goes down under the finger rather than on its own.
       */
      {
        kind: 'stair-button',
        x: BUTTON.x - 1.5,
        y: BUTTON.y - 1.5,
        w: 3,
        h: 3,
        state: pressed ? 'done' : 'idle',
        v: reach,
        label: 'stair barrier · release',
      },
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
        // Only true once the crates are on the bar (Michele, 29 Sep: it said
        // "taps ready" while the beer was still on the pallet).
        label: beerDone ? `${BAR_NAME} · taps ready` : `${BAR_NAME} · waiting for the crates`,
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
    /*
     * THE POUR. 0 until the last crate is on the bar, then it runs for `POUR_RUN`
     * and stays at 1: what the taps are doing and how full the glassware is, as
     * one number both of them carry. The renderer draws a stream out of a tap
     * whose `v` is between 0 and 1 and a full glass at 1 — it never has to know
     * what a crate is.
     */
    const pour = beerAt < 0 ? 0 : Math.max(0, Math.min(1, (ctx.t - beerAt - POUR_LEAD) / POUR_RUN));
    for (const t of TAPS) {
      out.push({
        kind: 'beer-tap',
        x: t.x,
        y: t.y,
        w: 3,
        h: 3,
        v: pour,
        state: beerDone ? 'done' : 'active',
        label: pour > 0 && pour < 1 ? 'tap · pouring' : 'tap',
      });
    }
    // The cellar end of it: three kegs behind the counter, where nothing stands.
    for (const k of KEGS) {
      out.push({ kind: 'keg', x: k.x, y: k.y, w: 9, h: 9, state: beerDone ? 'done' : 'active', label: `${BAR_NAME} · keg` });
    }
    /*
     * ...and the glass Biggy holds up, for as long as he holds it up.
     *
     * Published as its own prop rather than as part of him, because the sim has no
     * idea what a hand is: it is at his feet on the floor plan and the renderer
     * puts it where his hand is, exactly as it does with the soup pot.
     */
    if (toasted && ctx.t - beerAt < TOAST_AT + TOAST_HOLD) {
      const bgt = ctx.byKind('biggy');
      out.push({
        kind: 'toast',
        x: bgt.x,
        y: bgt.y,
        w: 6,
        h: 6,
        v: Math.max(0, Math.min(1, (ctx.t - beerAt - TOAST_AT) / TOAST_HOLD)),
        state: 'done',
        label: 'Biggy raises one',
      });
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
        // `done` is a full glass and `active` an empty one; the renderer takes HOW
        // full from the taps' own `v`, so one pour clock drives the whole bar.
        state: beerDone ? 'done' : 'active',
        label: 'Belgian glassware',
      });
    });
    // The halos: where the crates are, where they go, and where the soup goes.
    // One ring, three jobs — see `halo` above.
    if (held('loose').length > 0 && !beerDone) out.push(...halo(PALLET_MARK, 'active'));
    out.push(...halo(BEER_STACK, beerDone ? 'done' : 'active'));
    // Both of Stephan's marks wear the ring: one visual language for "you can use
    // this", on the soup's patch of floor and on the speaker's beside it.
    out.push(...halo(soupSpot, delivered ? 'done' : 'active'));
    out.push(...halo(speakerSpot, speaker.withStephan ? 'done' : 'active'));
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
      /*
       * The pot rides ON Biggy, so it is published at his own centre and the
       * renderer lifts it to his shoulder — a prop's x,y is a floor position and
       * the height of a carried thing is the renderer's business, exactly as a
       * hopping robot's height is. It used to be pushed 20 px north of him, which
       * drew a cooking pot standing on the floor a metre and a half behind the
       * robot who was supposed to be holding it.
       *
       * Two props for one pot, because `v` is one number and the HUD needs both
       * meters: `pot` carries the TEMPERATURE and `soup` HOW MUCH IS LEFT. The
       * renderer draws the vessel from the first and the level in it from the
       * second (`drawPot`), so nothing is drawn twice.
       */
      out.push({ kind: 'pot', x: bg.x, y: bg.y, w: 20, h: 20, v: temp / 100, state: 'active', label: 'tomato soup · temperature' });
      out.push({ kind: 'soup', x: bg.x, y: bg.y, w: 16, h: 16, v: soup / 100, state: 'active', label: 'soup in the pot' });
    }
    for (const sp of stains) {
      out.push({ kind: 'spill', x: sp.x, y: sp.y, w: sp.r * 2, h: sp.r * 2, state: 'active', label: 'spilled soup' });
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
    for (const a of crowd) {
      out.push({
        x: a.x,
        y: a.y,
        r: a.r,
        colour: a.colour,
        role: 'visitor',
        // Nobody wears a ribbon they have not been given: the lanyard appears at
        // the reception counter and not before, which is the whole point of the
        // beat and the one way a player can see it working from across the lobby.
        lanyard: a.badge ? LANYARD.attendee : undefined,
        seed: a.seed,
        face: a.face,
        speed: speed(a),
      });
    }
    for (const q of queues) {
      for (const p of q.people) {
        out.push({
          x: p.x,
          y: p.y,
          r: p.r,
          colour: p.colour,
          role: 'queue',
          lanyard: LANYARD.attendee,
          tx: p.hx,
          seed: p.seed,
          // A queue faces the counter it is queueing at, which is north of it.
          face: -Math.PI / 2,
          // Shuffling sideways as the queue makes way: `hx` is where they belong.
          speed: Math.min(1, Math.abs(p.x - p.hx) / 6) * 26 * SPEED_SCALE,
        });
      }
    }
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      out.push({
        x: n.x,
        y: n.y,
        r: n.r,
        name: n.name,
        // Crew beige unless this one has a shirt of their own — Celestino does.
        colour: n.colour ?? '#d9c3a5',
        collar: n.collar,
        face: n.face,
        role: 'staff',
        lanyard: n.lanyard ?? LANYARD.crew,
        glasses: n.glasses,
        mic: n.mic,
        barefoot: n.barefoot,
        screen: n.screen,
        seed: n.seed ?? 900 + i,
      });
    }
    out.push({
      x: stephan.x,
      y: stephan.y,
      r: stephan.r,
      name: 'Stephan',
      /*
       * THE DEVOXX POLO, THE GLASSES AND THE HEADSET MIC.
       *
       * Michele, 28 Sep 2026, with two photographs — Stephan on stage, and the
       * shirt itself folded on a table: *"Also Stephan must be identifiable:
       * Devoxx shirt, mic, glasses as accessories"*.
       *
       * The shirt is the dark olive polo with the orange-and-white striped collar;
       * at thirty pixels the stripe IS the shirt, which is why the collar is its
       * own field. The glasses and the headset are the other two marks anybody
       * who has seen him on a stage would name first. Nothing here needs
       * permission: it is a caricature of a man in a company polo, which is what
       * CLAUDE.md asks for.
       */
      colour: STEPHAN_POLO,
      collar: DEVOXX_ORANGE,
      glasses: true,
      mic: true,
      role: 'stephan',
      lanyard: LANYARD.chair,
      seed: 910,
      // His back to the gate and the stairs, his eyes on the doors — or on whoever
      // has walked up to talk to him (`stephanFace`).
      face: stephanFace,
      speed: stephanSp,
      reach,
    });
    /*
     * THE KEYNOTE SPEAKER IS ALWAYS DRAWN, AND THEY LOOK LIKE SOMETHING.
     *
     * Michele, 28 Sep 2026: *"I cannot find the keynote speaker. The hint system
     * does not give the cirlce.- arrow for this? therse should also be something
     * recognizable about thim. Not announced yet? We need to invent something."*
     *
     * All three notes are the same failure. This person was not PUBLISHED at all
     * until Voxxy was within 90 px of them — so the search was twelve booths of
     * empty floor with nothing to see from anywhere, and the only feedback was
     * arriving. A hidden thing you cannot see from ten metres is not hidden, it is
     * absent.
     *
     * So they stand there from the first frame, and since the programme has said
     * **TBA** for a month, that is what we invented for them: the one person at
     * Devoxx in a teal hoodie and cap, the multicolour keynote ribbon, and — since
     * 29 Sep — a mystery guest's domino mask and cape, with an oversized badge
     * that says KEYNOTE and "?" because nobody has printed the real one yet.
     * Nothing else in the hall wears any of it, which is what makes a 30 px figure
     * recognisable at all.
     *
     * The NAME still only shows up close. A floating label across the hall would
     * not be finding somebody, it would be reading a sign — and the booth arrow
     * the task now carries is the help he actually asked for.
     */
    const seen = speaker.following || dist(ctx.byKind('voxxy'), speaker) < 120;
    out.push({
      x: speaker.x,
      y: speaker.y,
      r: speaker.r,
      name: seen ? 'TBA — the keynote speaker' : undefined,
      /*
       * ...and the disguise: domino mask, cape, clicker, and a badge the size of
       * a paperback that says KEYNOTE and nothing else (`KEYNOTE_LOOK`).
       *
       * It used to be an open laptop — Michele: *"He could have a laptop in hand
       * to fix the slides?"* — until his playtest on 29 Sep: *"the lanyard is not
       * showing, the laptop is a bit awkward ... A mask since it's yet
       * mysterious? a cape?"* The laptop sat exactly over the ribbon.
       */
      ...KEYNOTE_LOOK,
      role: 'speaker',
      /*
       * They WALK when they are walking.
       *
       * Michele, watching them follow Voxxy: *"keynote speaker does not walk when
       * moving."* They did not: `people()` published neither `speed` nor `face`
       * for them, and the renderer's gait reads exactly those two (`people.ts`),
       * so the most important person in the chapter glided across the lobby
       * pointing east with their legs still. Both are facts the sim already had.
       */
      speed: speaker.sp,
      face: speaker.face,
      seed: 911,
    });
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
        : ladle === 'in'
          ? `soup: ladle is in the pot — ${batches > 0 ? 'fill it again' : 'fill the pot'} at the counter`
          : ladle === 'carried'
            ? 'soup: Droid has the ladle — it goes in the pot on the soup counter'
            : 'soup: the ladle is on the high shelf (Droid)';
    const spk = speaker.withStephan
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
  /** The speaker's own mark at Stephan's feet, one body south of the soup's. */
  const speakerAt: Vec2 = { x: speakerSpot.x + speakerSpot.w / 2, y: speakerSpot.y + speakerSpot.h / 2 };
  const soupAt: Vec2 = { x: soupSpot.x + soupSpot.w / 2, y: soupSpot.y + soupSpot.h / 2 };
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
        text: 'take the ladle off the high shelf and drop it in the pot',
        done: ladle === 'in',
        who: ['droid'],
        // Two legs, two addresses: the shelf until he has it, then the pot. An
        // errand whose arrow never moves is an errand that is really one press.
        at: ladle === 'carried' ? soupStand : shelfStand,
        n: ladle === 'in' ? 2 : ladle === 'carried' ? 1 : 0,
        of: 2,
        hint:
          ladle === 'carried'
            ? 'Droid: I have it. It goes IN the pot — the soup counter is the one with the vat, a few steps west along the block'
            : 'Droid: top shelf in the catering block, and nobody fills a pot without it. Voxxy cannot see over that shelf and Biggy cannot get an arm into it',
      },
      {
        id: 'soup',
        text: 'take Stephan his tomato soup',
        done: delivered,
        who: ['biggy'],
        at: carrying && !delivered ? soupAt : soupStand,
        hint: carrying
          ? 'Biggy: it goes cold while I walk and it comes out of the pot every time I hit something. Smooth lines — and let Voxxy open a queue before I am standing in it'
          : batches > 0
            ? 'Biggy: back to the counter. They have a vat of it and there are three thousand people here — nobody is going to miss another pot'
            : 'Biggy: the pot is on the counter in the catering court, and I am not filling it with my hands. Ladle first',
      },
      {
        id: 'speaker',
        text: 'find the keynote speaker and walk them to Stephan',
        done: speaker.withStephan,
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
        /*
         * The arrow points at the BOOTH they are hiding at, from the start.
         *
         * It used to point nowhere until they were already following, on the
         * reasoning that an arrow would hand the search over. Michele, playing
         * it: *"I cannot find the keynote speaker. The hint system does not give
         * the cirlce.- arrow for this?"* Twelve booths and no arrow is not a
         * search, it is a sweep. The arrow gets you to the right stand; the
         * person is still round the back of it, and you still have to walk round.
         */
        at: speaker.following ? speakerAt : { x: speaker.x, y: speaker.y },
        hint: 'Voxxy: they are hiding from the queues behind one of the booths with WALLS — you can see straight under the cloth tables, so it is none of those. Look for the cape, the mask and a badge that says KEYNOTE: for somebody hiding, they are not trying very hard',
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
    talk,
    update,
    props,
    people,
    progress,
    tasks,
    shot,
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
      speaker: { following: speaker.following, withStephan: speaker.withStephan, booth: hideBooth.name },
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
