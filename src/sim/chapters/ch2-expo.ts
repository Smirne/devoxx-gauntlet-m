/**
 * Chapter 2 — EXPO. The exhibition hall before opening: dark, empty, no network,
 * and three thousand Devoxx t-shirts locked in the pickup store.
 *
 * Ported from the prototype's `setupExpo` / `expoKey` / `expoUpdate`
 * (`reference/poc/10-after-dark-kinepolis.html`). Three jobs, one per robot, each of
 * which only that robot can do:
 *
 *   Droid — three breakers on a panel too high for anybody else.
 *   Voxxy — the network cable from the rack to the badge printer. The reel is
 *           `CABLE_MAX` long and the straight diagonal *under the sponsor tables*
 *           is the only route that fits; going round the booth lane runs out.
 *   Biggy — the store's roller door, which needs `ROLLER_DOOR_SPEED`. That is above
 *           his own top speed on purpose: alone he bounces off it announcing his
 *           own limit, and Voxxy has to shove him the length of the top lane.
 *
 * ## THE CHAIN — Michele, 25 Sep 2026, after his chapter-2 playtest
 *
 * *"The breaker lighted all up, with no need to activate the router. I thought they
 * were linked. How I'd do that? Breaker give energy, and a transformer/router lights
 * up in the cabinet. It needs authorization. First you need to open the door (biggy)
 * than type."*
 *
 * `power`, `cable.connected` and `router.online` used to be three independent flags
 * that happened to be ANDed at the badge printer, and the breakers lit the whole
 * hall by themselves — so the router read as an optional errand instead of as the
 * next link. It is one chain now, and each link is visibly dead until the one before
 * it lands:
 *
 *   1. **Droid throws the three breakers.** Power reaches the room. THE HALL STAYS
 *      DARK — a supply is not a lit room, and the only thing that changes out here
 *      is that something behind the cabinet door starts to spin up.
 *   2. **Biggy shoulders the cabinet open.** A steel door with seized hinges;
 *      nothing else in the building has the weight. Before the breakers the unit
 *      inside is a dead grey box, and the terminal wired to it is a dark screen
 *      that says so in the robot's own voice.
 *   3. **With power, the transformer/router in the cabinet comes up** — amber, its
 *      own link lights, a fan full of 2019 — and the terminal wakes and asks for
 *      authorisation.
 *   4. **Somebody types the venue WiFi password.** Only then does the lighting
 *      circuit close and the hall come up, booth by booth, and only then is there a
 *      network for the cable to carry.
 *
 * The renderer learns "the hall is lit" the way it always has, off the `breaker`
 * prop's own `state` (`src/render/lighting.ts`, `hallPowered`) — which now goes
 * idle -> active (supply on, hall dark) -> done (the circuit is closed). No game
 * logic crossed the line; the sim simply stopped calling step 1 the end of the job.
 *
 * ## The password, and where it lives
 *
 * `docs/gameplay-additions.md` §2 described this beat as a cam-lock wheel. Michele
 * killed the wheel on 23 Sep 2026 — *"Remove the wheel, too complicated"* — and the
 * password itself took its place. His other two rules from the same conversation
 * still stand and still shape it: **not** thirteen letters scattered round the venue
 * (letter-collection is busywork) and **not** a second helping of chapter 1's light
 * mix (that is chapter 1's identity).
 *
 * It is `DevoxxForever`, and on 25 Sep 2026 he placed it himself: *"Where is the
 * wifi password? I'd put it here, spray painted, with a wifi symbol and '(And no,
 * you can't change it)'."* — against a photograph of a long dark hall wall. So it
 * is a **spray tag on the hall's top wall**, not small print on a sponsor's banner.
 * He flagged the two problems with his own idea in the same breath — *"it's a bit
 * far from the entrance, and all is dark"* — and both are answered rather than
 * inherited:
 *
 *   - it is at the WEST head of the top lane, a few seconds from where the three of
 *     them come out of the stairwell, and on the lane Voxxy has to run Biggy down
 *     anyway, so nobody crosses the hall for it;
 *   - the paint carries its own standby glow (`PROPS.poster`), so from across a
 *     blacked-out hall it reads as *something is on that wall* long before it reads
 *     as letters — and resolving letters still takes Voxxy's 0.38 rad cone inside
 *     `POSTER_READ`, which is the route;
 *   - and nobody has to guess: the terminal itself says where the crew put it, and
 *     the run sheet on the chapter card says somebody sprayed it.
 *
 * Past Biggy's shoulder there are three ways to answer, and a player needs one:
 *
 *   1. **Type it from memory.** Thirteen letters, case-insensitive, Backspace fixes
 *      a slip, and a wrong key simply does not go in — it never throws the whole
 *      thing away. It is no longer printed on the chapter card: Michele, 25 Sep,
 *      *"yes, change the intro, the wifi password can't be there."*
 *   2. **Voxxy reads the tag.** Her cone is 0.38 rad against Biggy's 1.0: the only
 *      beam in the game narrow enough to resolve type that size, and she has to be
 *      close enough to read it rather than merely to light it.
 *   3. **Droid reads the label, from Biggy's shoulders.** The tape is stuck inside
 *      the cabinet lid, up at the top, which is where every conference's WiFi
 *      password really lives. `toggleMount` is the mechanic — it exists, it is
 *      tested, and outside chapter 1's projector panel almost nothing uses it.
 *
 * **Who may type it.** Michele, asked: *"Typing password can be Voxxy or Droid, I
 * think both are ok... what is excluding droid? Fingers too long?"* Nothing excludes
 * him, so nothing does. Both type; Biggy refuses, and his refusal is the joke.
 * Knowing the password and entering it stay two acts whoever performs them.
 *
 * Whichever route found it, the answer is entered at the same terminal, and the
 * chapter ends the same way: the chain, then the roller door.
 */

import {
  CABLE_MAX,
  MOUNT_BIGGY_MAX_SPEED,
  MOUNT_REACH,
  ROLLER_DOOR_SPEED,
  SPEED_SCALE,
  T,
  TRAVEL_TIME_SCALE,
} from '../constants';
import { m } from '../units';
import { GF, VIEW_GROUND, groundWallsFor, stairDoor } from '../geometry';
import { dist, inRect, speed } from '../bot';
import { buildLights, litBy } from '../lights';
import type { Bot, LightSource, Mirror, Prop, TextPrompt, Vec2, Wall } from '../types';
import type { ChapterCtx, ChapterDef, ChapterRuntime } from './index';

/* ---------------------------------------------------------------- reach distances */

const PANEL_REACH = 52;
const PLUG_REACH = 40;
/** A new cable point is only recorded once Voxxy has actually gone somewhere. */
const CABLE_STEP = 6;
/**
 * How long Voxxy has to keep leaning on a taut cable before the plug comes out.
 *
 * A clock a robot travels against, so it carries `TRAVEL_TIME_SCALE` — 0.3 s of the
 * prototype's Voxxy, 1.2 s of this one. Long enough to be a decision and short
 * enough that a player who has decided does not have to hold it.
 */
const CABLE_PULL_OUT = 0.3 * TRAVEL_TIME_SCALE;
/** ...and how fast that patience is given back once she stops pulling, s^-1. */
const CABLE_PULL_RELAX = 3;
/** How square-on the stick has to be to the cable to count as pulling, -1..1. */
const CABLE_PULL_LEAN = 0.45;
/** Seconds between "the cable goes tight" readouts. */
const CABLE_TALK_COOLDOWN = 4;
/** Below this, "Biggy: 0.8 m/s, needs 5.4" would fire on every nudge. px/s. */
const ROLLER_MIN_TALK = 40 * SPEED_SCALE;
/** Seconds between the roller door's "not fast enough" readouts. */
const ROLLER_TALK_COOLDOWN = 3;

/* ------------------------------------------------------------- the network closet
 *
 * Chapter-local tuning. Nothing here is a NEW physics constant: `src/sim/constants.ts`
 * is frozen (CLAUDE.md) and this beat deliberately needs no entry in it — it is built
 * out of frozen numbers that already exist (Voxxy's 0.38 rad cone, `MOUNT_REACH` and
 * the mount itself, the robots' own masses for who can swing a steel door). Every
 * number below is a property of one prop in one room, so it lives with that prop.
 *
 * None of them is a speed, so none of them carries `SPEED_SCALE` from the 2026-09-23
 * rescale. The three reaches are lengths in sim pixels, and lengths did not move.
 */

/**
 * The venue WiFi password, and the whole answer to this beat.
 *
 * Compared upper-case against upper-case, which is what makes typing it
 * case-insensitive without a single `toLowerCase` anywhere: `KeyboardEvent.code`
 * says `KeyD` whether or not shift was down, so the sim never learns the case the
 * player typed and cannot punish them for it.
 */
const PASSWORD = 'DEVOXXFOREVER';
/** What the player is shown for a letter they have not typed yet. */
const PASSWORD_BLANK = '·';
/**
 * How close a robot must be to the terminal in the open cabinet to touch its keys,
 * sim px — 4.3 m, measured from the cabinet's south face.
 *
 * Deliberately the same reach the cam-lock wheel had, for the same reason: the
 * breaker panel is 89 px along the same back wall with its own 52 px reach, and
 * these two must overlap only just, so that "Droid presses E at the cabinet" and
 * "Droid presses E at the breakers" are different places to stand and not a coin
 * toss. Where they do overlap, the nearer hand wins (see `key`).
 */
const TERMINAL_REACH = 54;
/** How close Biggy has to be to get a shoulder behind the cabinet door, sim px. */
const CABINET_REACH = 54;
/**
 * How close the tower has to be for Droid, up on Biggy's shoulders, to read the
 * label taped inside the lid, sim px.
 *
 * Tighter than `TERMINAL_REACH` because it is Biggy's centre being measured and he
 * is 9 px of radius: at 44 px he is standing against the cabinet, not near it.
 */
const LABEL_REACH = 44;
/**
 * How close Voxxy has to be for her cone to resolve the spray tag, sim px — 5.6 m.
 *
 * Her lamp reaches 280 px, and lighting a wall from 22 m away is not reading what
 * is written on it. This is the difference between the two, and it is the only
 * number in the beat that is a judgement rather than a measurement: close enough
 * that she has to walk up to the wall and stand at it, far enough that it is not a
 * pixel hunt.
 */
const POSTER_READ = 70;
/**
 * How close anybody has to get to the pickup store before it introduces itself,
 * sim px — 12 m, measured from the roller door.
 *
 * Michele, twice now and against two different props: *"There's no hint on where
 * the cable should go or which door should be slammed and how."* The door carries
 * a halo and a name on the side, and the first robot to come down the top lane is
 * told what is behind it.
 */
const STORE_HAIL = 150;
/** ...and how close before reception says which desk the cable is looking for. */
const RECEPTION_HAIL = 150;
/** Seconds between the terminal's "that is not it" readouts, so a mashed key is not a wall of toast. */
const TYPO_COOLDOWN = 1.2;
const BREAKERS = 3;

/** The exhibition hall has no cinema screen to bounce a lamp off. */
const NO_MIRRORS: Mirror[] = [];

/**
 * Four pallets of crated Devoxx t-shirts, inside the pickup store.
 *
 * Michele: *"Gadgets must be ready... (and put crates, shirts and gadgets inside)...
 * But the devoxx shirt is a tradition."* They are dressing — no collider, no state —
 * and they exist so that what is behind the roller door is worth breaking it for.
 * Laid out clear of the door's swing so the crash reveals them rather than clipping
 * through them.
 */
const STORE_PALLETS: readonly Vec2[] = [
  { x: GF.store.x + 34, y: GF.store.y + 30 },
  { x: GF.store.x + 34, y: GF.store.y + 72 },
  { x: GF.store.x + 80, y: GF.store.y + 30 },
  { x: GF.store.x + 80, y: GF.store.y + 72 },
];

/* ==================================================================== chapter */

export interface ExpoState {
  chapter: 2;
  /**
   * The three breakers are in and there is a supply on the bars.
   *
   * LINK 1 OF THE CHAIN, and no longer the end of anything: power reaching the room
   * is not the room being lit. See `hallLit`.
   */
  power: boolean;
  breakersLeft: number;
  cable: { carrying: boolean; connected: boolean; len: number; snapped: boolean; taut: boolean };
  rollerBroken: boolean;
  /** The router cabinet, its terminal, and the WiFi password. */
  router: {
    /** Biggy has shouldered the cabinet door open. Nothing else in here starts until he has. */
    cabinetOpen: boolean;
    /**
     * LINK 2: the unit in the cabinet has a supply, so its lamps are up and the
     * terminal is awake. Dead — and it says so — until the breakers are in.
     */
    powered: boolean;
    /** The robots have read the password off the wall or off the label inside the lid. */
    known: boolean;
    /** The terminal has the keyboard: letters type instead of driving. */
    prompting: boolean;
    /** The prefix of `PASSWORD` typed in so far — never a wrong letter, so it only ever grows. */
    typed: string;
    /** Voxxy's cone is on the spray tag this frame, and close enough to read it. */
    posterLit: boolean;
    /** LINK 3: the password is in, the router is up and it has authorised the circuit. */
    online: boolean;
  };
  /**
   * The hall's own lights.
   *
   * Michele's chain, and the whole of what changed: the breakers do NOT do this.
   * The router closes the lighting circuit when it is authorised, which is the only
   * reason the terminal is worth walking to.
   */
  hallLit: boolean;
  /** The chain, all the way through, plus the cable: or the badge printer prints nothing. */
  printerOnline: boolean;
}

/**
 * THE BRIEFING, AND WHAT IT IS NOT ALLOWED TO CONTAIN.
 *
 * The old one was 84 words. It printed the password, named all three discovery
 * routes and explained the tow bar, which is the whole chapter solved in a
 * paragraph across the top of the frame. Michele, 25 Sep 2026: *"yes, change the
 * intro, the wifi password can't be there."*
 *
 * So it says what the chapter WANTS and who does what, and stops. It names the
 * pickup store, because he asked for that by name — *"Door should have Halo, Name
 * on the side (shirts and gadget) and be mentioned on the intro"* — and it names
 * no route to the password at all. The routes are the game.
 */
const OBJECTIVE =
  'Chapter 2 · <b>Expo</b>. Registration opens in an hour: no power, no network, and every ' +
  'Devoxx t-shirt shut in the pickup store. Get the <b>badge printer at reception</b> printing and ' +
  'the <b>store</b> open. <b>Droid</b> reaches what is too high, <b>Biggy</b> moves what is too ' +
  'heavy, <b>Voxxy</b> goes where nothing else fits.';
const KEYS =
  '1/2/3/Tab: switch · WASD · E: use / climb / terminal · Space: take hold of Biggy · R: restart';

function setup(ctx: ChapterCtx): ChapterRuntime {
  ctx.setFloor('down');
  ctx.setView(VIEW_GROUND);
  ctx.setWalls(groundWallsFor(2));
  /*
   * Out of the secondary stairwell's doors, into the hall.
   *
   * They used to stand at x 372, off the EAST end of the staircase, because the
   * staircase was an open flight that climbed westward. It is an enclosed shaft now
   * with its doors in the west face and the flight climbing away from them, which
   * is what `plans/exhibition-floor-simple.png` draws (see `GF.stairs`) — so the
   * three of them come out on the west side. The old spot has also stopped being
   * empty floor: one of the hall's roof columns stands at 380,480, and it is a
   * collider now.
   */
  const shaft = GF.stairs[1];
  const mouth = stairDoor({ x: shaft.x, y: shaft.y, w: shaft.w, h: shaft.h });
  ctx.place([mouth.x - 20, mouth.y + 4], [mouth.x - 34, mouth.y + mouth.h / 2], [mouth.x - 20, mouth.y + mouth.h - 4]);

  let power = false;
  /**
   * The hall is pitch dark until Droid throws the last breaker, so until then the
   * robots' own lamps are the only light there is — the prototype punches a hole in
   * an 80%-black mask around each of them (`expoDraw`). The 3D renderer works from
   * `LightSource` polygons instead of a 2D mask, so the chapter has to cast them:
   * without this the exhibition hall renders as a black rectangle. Chapter 2 has no
   * light-mix enigma, so nothing in here ever *reads* them — they exist to be drawn.
   */
  let lights: LightSource[] = [];
  let breakersLeft = BREAKERS;
  let rollerBroken = false;
  let hintedTech = false;
  let rollerTalk = -9;

  const cable = {
    carrying: false,
    connected: false,
    len: 0,
    snapped: false,
    /** The reel is paid out and Voxxy is being held on the end of it. */
    taut: false,
    /** Seconds she has spent leaning AGAINST the taut cable. See `CABLE_PULL_OUT`. */
    pull: 0,
    pts: [] as Vec2[],
  };
  let tautTalk = -9;

  const gate: Wall = {
    ...GF.gate,
    kind: 'gate',
    why: (b) =>
      b.kind === 'voxxy'
        ? 'Voxxy: gate! Main staircase, shut until registration opens. Not even I fit through that'
        : b.kind === 'droid'
          ? 'Droid: the main staircase gate. It stays down until registration opens. Tomorrow, not tonight'
          : 'Biggy: gate. Steel. Down. Registration opens it, not me',
  };
  ctx.walls.push(gate);

  const roller: Wall = {
    ...GF.roller,
    kind: 'roller',
    why: (b) =>
      b.kind === 'biggy'
        ? `Biggy: roller door. I'd need ${m(ROLLER_DOOR_SPEED).toFixed(1)} m/s and I top out at ${m(b.max).toFixed(1)}. Unless someone grabs hold and runs me down that lane`
        : b.kind === 'voxxy'
          ? "Voxxy: roller door — every badge and polo is behind it. I bounce off. Biggy at full tilt isn't enough either, so I'll take hold of him (Space) and run him down the whole top lane"
          : 'Droid: a slatted roller door. Mass, not leverage. Biggy needs a longer run than he can give himself — and a straighter one than I can give him. Voxxy has the legs for it',
    // Horizontal door: the speed that counts is the one along the lane.
    onHit: (b) => {
      if (b.kind !== 'biggy') return false;
      if (b.vx > ROLLER_DOOR_SPEED) {
        rollerBroken = true;
        ctx.removeWall(roller);
        ctx.flash(
          `CRASH — Biggy rolls through at ${m(b.vx).toFixed(1)} m/s. The Devoxx crew and 3,000 badges are free`,
          3500,
        );
        b.vx *= 0.4;
        return true;
      }
      if (b.vx > ROLLER_MIN_TALK && ctx.t - rollerTalk > ROLLER_TALK_COOLDOWN) {
        rollerTalk = ctx.t;
        ctx.flash(
          `Biggy: ${m(b.vx).toFixed(1)} m/s — needs ${m(ROLLER_DOOR_SPEED).toFixed(1)}. ` +
            (b.vx > b.max - 5 * SPEED_SCALE ? "That's my top speed. Somebody take hold of me" : 'Longer run-up, straighter line'),
        );
      }
      return false;
    },
  };
  ctx.walls.push(roller);

  const printerAt: Vec2 = { x: GF.printer.x + 10, y: GF.printer.y + 6 };
  const rackAt: Vec2 = { x: GF.rack.x + 10, y: GF.rack.y + 12 };
  const panelAt: Vec2 = { x: GF.panel.x + 13, y: GF.panel.y + 8 };
  /** The middle of the roller door, on its hall side — what the halo is drawn around. */
  const storeAt: Vec2 = { x: GF.roller.x, y: GF.roller.y + GF.roller.h / 2 };

  /* ------------------------------------------------------------ the network closet */

  /**
   * The cabinet's south face — the face the diorama camera looks at. Everything in
   * this beat is measured from here: Biggy's shoulder, the terminal's keys, and the
   * label taped inside the lid that Droid reads from up on Biggy.
   */
  const cabinetAt: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };

  /**
   * THE SPRAY TAG, on the hall's top wall at the head of the run-up lane.
   *
   * Michele placed it: *"Where is the wifi password? I'd put it here, spray painted,
   * with a wifi symbol and '(And no, you can't change it)'"* — over a photograph of
   * a long dark hall wall. It used to be eight-point small print along the bottom of
   * a sponsor's banner on the Cloudy Bank booth, which is both duller and harder to
   * find, and the booth face is in the middle of the room where a beam sweep never
   * settles.
   *
   * WHERE, and why not further: the booths start at y 250, so the strip between the
   * hall's top edge and the first row is the one long uninterrupted wall in the
   * room, and this is its WEST end — level with the stairwell the three of them come
   * out of, about 40 m from their feet, and on the lane Voxxy has to run Biggy down
   * for the roller door anyway. That answers his own objection to his own idea
   * (*"it's a bit far from the entrance"*) without making it free: it is still a
   * detour nobody is pushed into, and it is still unreadable without her cone.
   *
   * Four pixels proud of the wall, as chapter 1's clues stand off theirs, so nothing
   * occludes the beam that is trying to read it.
   */
  const tagAt: Vec2 = { x: 400, y: GF.hall.y + 8 };
  /** Kept under the old name inside the beat: it is still the thing Voxxy reads. */
  const posterAt: Vec2 = tagAt;

  const router = {
    cabinetOpen: false,
    known: false,
    prompting: false,
    typed: '',
    posterLit: false,
    online: false,
    /** Sim seconds of the last key the terminal refused, so the HUD can flash the field. */
    rejectAt: -9,
  };
  let typoTalk = -9;
  /** The store and reception each introduce themselves once, the way the technical room does. */
  let hailedStore = false;
  let hailedReception = false;

  /**
   * The terminal has the keyboard.
   *
   * `game.ts` asks this before it treats `R` as restart and the browser shell asks it
   * before it treats `WASD` as driving (`GameSnapshot.typing`): `DevoxxForever` has a
   * `D` in it and two `r`s, and without this the first letter of the password would
   * drive the robot out of reach of the terminal and the seventh would restart the
   * chapter. It is the only thing in the game that takes the keyboard, and it is the
   * player who opens it with `E` and closes it with `Esc` or `Enter`.
   *
   * `power` is in here because of the chain: a dark screen has no keyboard to take.
   */
  const typing = (): boolean => router.prompting && router.cabinetOpen && power && !router.online;

  const cabinet: Wall = {
    ...GF.cabinet,
    kind: 'cabinet',
    /**
     * The mass gate, routed through the wall's own `why` so the throttling and the
     * toast plumbing are the ones every other blocked message in the game uses.
     * Biggy gets no line here: his answer is the door opening, and it is spoken
     * from `key` when he puts his shoulder into it.
     *
     * The cabinet stays a collider once it is open — it is a full-height 19-inch
     * floor cabinet, not a doorway — so the `why` has to fall silent rather than
     * keep telling a robot it cannot open something that is already open.
     */
    why: (b) =>
      router.cabinetOpen
        ? null
        : b.kind === 'voxxy'
          ? "Voxxy: router cabinet, and the door is shut. I got both grippers under the lip and lifted MYSELF off the floor. One kilo of me against a steel door — that is a Biggy door"
          : b.kind === 'droid'
            ? 'Droid: the hinges have not moved since 2019. Three times Voxxy and still nothing, and there is no lever on a flush door. This wants weight. Biggy'
            : null,
  };
  ctx.walls.push(cabinet);

  ctx.objective(OBJECTIVE, KEYS);
  /*
   * THE CARD NO LONGER GIVES IT AWAY.
   *
   * It used to print `WiFi: DevoxxForever` in bold, which made every other route to
   * it decorative. Michele's call, 25 Sep 2026: *"yes, change the intro, the wifi
   * password can't be there."*
   *
   * What is left is the run sheet with that line **torn off** — which is a better
   * joke than the password was, tells the player there IS a password without
   * telling them what it is, and points at the wall the crew sprayed it on. It also
   * carries the two things he asked the intro to carry: the store by name, and the
   * reason it is shut, which is the same pair of keys Stephan lost on the title
   * card.
   */
  ctx.card(
    '<b>Down the secondary staircase.</b><br>' +
      '<span class="sub">The exhibition hall: twelve sponsor booths, no power, no network, and the whole ' +
      'of <b>SHIRTS &amp; GADGETS</b> — three thousand t-shirts, crated and ready — behind the pickup ' +
      'store\'s roller door. The shutter key is on the ring Stephan lost.<br><br>' +
      'Taped to the technical room door, the crew\'s run sheet, in biro. The top line has been torn ' +
      'off. Under the gap, in a different hand: <b>\u201cwifi\u2019s on the wall, Bart did it in orange\u201d</b>.</span>' +
      '<small>Press any key</small>',
  );

  /* --------------------------------------------------------------------- keys */

  /**
   * One letter at the terminal.
   *
   * Forgiving on purpose, because Michele's word for the beat that replaced the cam
   * wheel was *simpler*: a wrong key does not go in and does not throw away what is
   * already there, Backspace takes one back, and case never enters into it. What is
   * left is thirteen key presses with a visible counter — a few seconds, and nothing
   * to lose by being slow.
   */
  function typeLetter(ch: string): void {
    if (ch === PASSWORD[router.typed.length]) {
      router.typed += ch;
      if (router.typed.length === PASSWORD.length) authorise('DevoxxForever');
      return;
    }
    /*
     * A REFUSED KEY IS NOW VISIBLE.
     *
     * Michele: *"Typing the password was hard, the game did not match it... I don't
     * know what was happening, but i kept typing and it never took it right."* The
     * forgiveness was right and the silence was not: with no field on screen and a
     * 1.2 s throttle on the toast, most refused keys produced no feedback of any
     * kind, so a player who was mistyping — or whose prompt had quietly closed —
     * saw a game that had stopped listening.
     *
     * `rejectAt` is a sim clock, and the HUD's field flashes off it. The toast is
     * still throttled, because thirteen toasts is a wall of text; the flash is not,
     * because it is one frame of colour.
     */
    router.rejectAt = ctx.t;
    if (ctx.t - typoTalk <= TYPO_COOLDOWN) return;
    typoTalk = ctx.t;
    ctx.flash(
      `Terminal: ${ch} — not that one. ${router.typed.length} of ${PASSWORD.length} still stand. ` +
        'Backspace takes one back',
    );
  }

  /**
   * LINK 3 LANDS — and it is the router, not the breakers, that lights the hall.
   *
   * One place, so both ways in (typed letter by letter, or entered in one go by a
   * robot that already knows it) end the chain identically.
   */
  function authorise(how: string): void {
    router.known = true;
    router.online = true;
    router.prompting = false;
    router.typed = PASSWORD;
    ctx.flash(
      `${how}. The transformer takes it — a relay drops somewhere over your head, and the hall comes up ` +
        'booth by booth, all twelve of them. Four green lights on the router. The venue is on the air',
      4200,
    );
  }

  /** E at the terminal: type it, or have the robot that already read it type it for you. */
  function useTerminal(b: Bot): void {
    if (router.online) {
      ctx.flash(`${b.name}: the router is up. Four green lights and a fan nobody has cleaned since 2019`);
      return;
    }
    /*
     * LINK 1 GATES LINK 2, and each robot says so in its own voice. This is the
     * sentence that makes the breakers and the router read as one chain instead of
     * two errands: the player is standing at the thing they need, and it is dead.
     */
    if (!power) {
      ctx.flash(
        b.kind === 'voxxy'
          ? 'Voxxy: dead screen. No standby lamp, no fan, nothing humming — there is not a volt coming down ' +
              'this wire. Somebody wants to put a supply on it before I start pressing things'
          : b.kind === 'droid'
            ? 'Droid: the unit is cold. Every link light on it is out, which means the cabinet is not fed, ' +
                'which means the three breakers on that wall are still down. Mine, and I am the only one tall ' +
                'enough to reach them'
            : 'Biggy: black screen. I opened the door, I did not bring the electricity. That is a Droid job, ' +
                'up on the panel',
        4000,
      );
      return;
    }
    /*
     * BIGGY'S HANDS ARE THE JOKE, and the joke is the reason there is a gate here
     * at all. Michele, asked which of the other two should type: *"Typing password
     * can be Voxxy or Droid, I think both are ok... what is excluding droid?
     * Fingers too long?"* — nothing excludes him, so nothing does. Both type.
     */
    if (b.kind === 'biggy') {
      ctx.flash('Biggy: thirteen little keys. These are not thirteen-little-key hands. Voxxy? Droid?');
      return;
    }
    if (router.known) {
      authorise(`${b.name} types it in — DevoxxForever, and no, you cannot change it`);
      return;
    }
    if (router.prompting) {
      router.prompting = false;
      ctx.flash(`${b.name} steps back from the terminal`);
      return;
    }
    router.prompting = true;
    /*
     * ...and the terminal says WHERE, because Michele's own objection to his own
     * hiding place was that nobody would think to point a torch at that wall.
     */
    ctx.flash(
      (b.kind === 'droid'
        ? 'Droid: <b>AUTHORISATION?</b>, it says — the venue WiFi password, because of course it is the same ' +
          'one for everything. That label will be taped inside the lid, up at the top; from Biggy\'s ' +
          'shoulders I could read it'
        : 'Voxxy: <b>AUTHORISATION?</b>, it says — the venue WiFi password. Nobody writes those down. Except ' +
          'that somebody sprayed it along the top wall of the hall, in orange, and small paint is what I am for') +
        '. Type it: A–Z, Backspace fixes a slip, Esc steps away',
      4600,
    );
  }

  function key(code: string): void {
    const b = ctx.bots[ctx.cur];
    const d = ctx.byKind('droid');
    const bg = ctx.byKind('biggy');

    /*
     * While the terminal has the keyboard, letters are letters. This runs BEFORE
     * `switchKey` so nothing else in the game sees the keystroke — and `game.ts`
     * has already declined to treat `R` as restart, because `typing()` told it not
     * to. `DevoxxForever` contains a D and two Rs; without this the first letter of
     * the password would drive the robot out of reach of the terminal and the
     * seventh would restart the chapter.
     */
    if (typing()) {
      if (code === 'Escape' || code === 'Enter') {
        router.prompting = false;
        ctx.flash(`${b.name} steps back from the terminal`);
        return;
      }
      if (code === 'Backspace') {
        router.typed = router.typed.slice(0, -1);
        return;
      }
      const letter = /^Key([A-Z])$/.exec(code);
      if (letter) {
        typeLetter(letter[1]);
        return;
      }
      // Anything else (Tab, a digit) falls through and means what it always means;
      // taking a robot that is not at the terminal closes the prompt in `update`.
    }

    ctx.switchKey(code);
    if (code !== 'KeyE') return;

    const atCabinet = dist(b, cabinetAt) < CABINET_REACH;
    const atTerminal = router.cabinetOpen && dist(b, cabinetAt) < TERMINAL_REACH;

    if (b.kind === 'droid') {
      const atPanel = !power && dist(b, panelAt) < PANEL_REACH;
      // The panel and the cabinet share the technical room's back wall 89 px apart
      // and their reaches just overlap, so the nearer hand wins rather than
      // whichever check happens to be written first.
      if (atTerminal && (!atPanel || dist(b, cabinetAt) <= dist(b, panelAt))) {
        useTerminal(b);
        return;
      }
      if (atPanel) {
        breakersLeft--;
        if (breakersLeft <= 0) {
          power = true;
          /*
           * LINK 1, AND NOT THE END OF IT. This used to read "the hall lights come
           * on, booth by booth" and they did, which is precisely what made the
           * router optional. A supply is not a lit room: what the player gets for
           * the breakers is a noise behind a door, and a reason to go and open it.
           */
          ctx.flash(
            'Droid throws the last breaker. The bars go live with a thump you feel through the floor — ' +
              'and the hall stays black. Something behind that grey cabinet door starts spinning up',
            4200,
          );
        } else {
          ctx.flash(`Droid flips a breaker (${BREAKERS - breakersLeft}/${BREAKERS})`);
        }
        return;
      }
      // Route 3 starts here rather than at the cabinet: he climbs on wherever Biggy
      // happens to be standing, and the tower walks over afterwards.
      if (dist(d, bg) < d.r + bg.r + MOUNT_REACH && speed(bg) < MOUNT_BIGGY_MAX_SPEED) {
        ctx.toggleMount();
        return;
      }
      if (atCabinet) {
        ctx.flash(
          'Droid: shut, and seized. Weight opens this, not leverage — and the label is inside the lid ' +
            'anyway, up at the top. One of those is a Biggy problem, the other one is both of us',
        );
        return;
      }
      if (dist(b, posterAt) < POSTER_READ) {
        ctx.flash(
          router.known
            ? 'Droid: orange paint, a wifi symbol, and DevoxxForever. Read it already'
            : 'Droid: somebody has been at this wall with a spray can. I can see a wifi symbol and then ' +
                'thirteen letters of orange fog. My eyes are for reaching things, not for reading them. Voxxy',
          4000,
        );
        return;
      }
      ctx.flash('Droid: nothing to reach here');
      return;
    }

    if (b.kind === 'voxxy') {
      if (!cable.carrying && !cable.connected && dist(b, rackAt) < PLUG_REACH) {
        cable.carrying = true;
        cable.snapped = false;
        cable.taut = false;
        cable.pull = 0;
        cable.len = 0;
        cable.pts = [{ x: b.x, y: b.y }];
        ctx.flash(
          'Voxxy takes the cable end. Reception is at the far RIGHT of the hall: up the steps in the ' +
            'right-hand wall, then the desk with the lit pad on it. The reel is short — straight line, ' +
            'under the sponsor tables',
          4600,
        );
        return;
      }
      if (cable.carrying && dist(b, printerAt) < PLUG_REACH) {
        cable.carrying = false;
        cable.taut = false;
        cable.connected = true;
        ctx.flash(
          `Cable in — the run is made (${Math.trunc(cable.len)} of ${CABLE_MAX} px used). ` +
            'The printer has its wire. Now it wants the other end of it to be awake',
          3000,
        );
        return;
      }
      /*
       * THE LINE MICHELE COULD NOT PARSE — *"I still don't get where / how to
       * connect the cable to the reception. 'thought the hall wall on the right'?
       * what does that mean."*
       *
       * It said `through the hall wall on the right`, which is a typo away from
       * nonsense and, read correctly, still names no landmark, no direction the
       * player can act on and no whose-right. What a robot says has to be usable
       * directions in a world the player can see, so this one gives the distance
       * left, the landmark to aim at (the blue RECEPTION sign is a prop now) and
       * the thing to press E on when she gets there.
       */
      if (cable.carrying) {
        const away = Math.round(dist(b, printerAt) / 12.5);
        ctx.flash(
          `Voxxy: the printer is on the reception desk, ${away} m that way — keep going RIGHT, up the ` +
            'steps in the hall\'s right-hand wall (the blue sign), then the lit pad on the counter. E there',
          4200,
        );
        return;
      }
      if (atTerminal) {
        useTerminal(b);
        return;
      }
      if (atCabinet) {
        ctx.flash('Voxxy: shut. I can see the seam and I cannot do one thing about it. Biggy opens this one');
        return;
      }
      if (dist(b, posterAt) < POSTER_READ) {
        ctx.flash(
          router.known
            ? 'Voxxy: read it already — DevoxxForever. And no, you cannot change it'
            : 'Voxxy: orange spray, a wifi symbol, and something under it in letters half my size. Not a ' +
                'poking job — hold the beam on it',
          3600,
        );
        return;
      }
      ctx.flash('Voxxy: nothing to plug in here');
      return;
    }

    /*
     * Biggy — or the tower, since control follows a mounted Droid: `b` is Biggy
     * either way, and `d.mounted` is what says which of the two is being asked.
     */
    if (d.mounted) {
      if (router.cabinetOpen && !router.known && dist(bg, cabinetAt) < LABEL_REACH) {
        router.known = true;
        ctx.flash(
          'From up on Biggy, Droid gets his head inside the lid and reads the label tape: ' +
            '<b>WiFi: DevoxxForever</b>. Of course it is. Now the terminal',
          3800,
        );
        return;
      }
      if (router.cabinetOpen && !router.known && dist(bg, cabinetAt) < TERMINAL_REACH + 40) {
        ctx.flash('Droid: the tape is inside the lid, right at the top. Closer, Biggy — up against it');
        return;
      }
      ctx.toggleMount();
      return;
    }

    if (!router.cabinetOpen && atCabinet) {
      router.cabinetOpen = true;
      /*
       * LINK 2 — and what is behind the door depends on whether link 1 has landed,
       * which is the whole of Michele's chain in one sentence of narration.
       */
      ctx.flash(
        power
          ? 'Biggy sets his shoulder against the cabinet door and walks it open. Inside, already humming: ' +
              'the venue transformer, a router with its link lights coming up one by one, a fan full of ' +
              '2019 — and a terminal blinking <b>AUTHORISATION?</b>'
          : 'Biggy sets his shoulder against the cabinet door and walks it open. Inside: the venue ' +
              'transformer, the router, a fan full of 2019, and a terminal. All of it dead, dark and cold. ' +
              'Nothing in this cabinet has a supply',
        4400,
      );
      return;
    }
    if (atTerminal) {
      useTerminal(b);
      return;
    }
    ctx.flash("Biggy: I don't do buttons. I do doors.");
  }

  /* ------------------------------------------------------------------- update */

  /**
   * THE REEL, AND THE END OF IT.
   *
   * Michele: *"When cable ends, Voxxy should be stopped and only further going
   * would release it."* It used to simply run out — one frame you were under the
   * limit, the next the plug was back on the rack and thirty seconds of route with
   * it, with nothing in between to tell you it was coming.
   *
   * A reel with `CABLE_MAX` on it has three states, and now the sim has all three:
   *
   *   - **slack** — every `CABLE_STEP` px of travel pays another point onto the run
   *     and adds its length to the meter. Unchanged.
   *   - **taut** — the reel is empty. Voxxy is held on a circle of the remaining
   *     budget around the last pinned point, and the component of her velocity
   *     pulling away from it is cancelled: she can still walk the circle, and she
   *     can always walk back, because a cable pivots. This is the beat that was
   *     missing — you *feel* the end of the cable, in the robot stopping, before
   *     anything is lost.
   *   - **pulled out** — she leans against it anyway for `CABLE_PULL_OUT` seconds,
   *     and the plug comes out of the rack. Same failure as before, but now it is
   *     something the player DID rather than something that happened to them.
   *
   * Nothing here is a new physics constant: the hold is a projection, exactly the
   * one `bot.ts` does against a wall, and the two numbers below are properties of
   * one reel in one chapter. `CABLE_PULL_OUT` is a clock a robot travels against,
   * so it carries `TRAVEL_TIME_SCALE` from the 2026-09-23 rescale like every other
   * one in the file.
   */
  function stepCable(v: Bot, dt: number): void {
    const last = cable.pts[cable.pts.length - 1];
    const budget = Math.max(0, CABLE_MAX - cable.len);
    const dx = v.x - last.x;
    const dy = v.y - last.y;
    const d = Math.hypot(dx, dy);

    if (d > budget) {
      const nx = dx / (d || 1);
      const ny = dy / (d || 1);
      // Held on the end of it. Position first, then kill the outward velocity, or
      // she would spend every frame accelerating into a stop.
      v.x = last.x + nx * budget;
      v.y = last.y + ny * budget;
      const out = v.vx * nx + v.vy * ny;
      if (out > 0) {
        v.vx -= out * nx;
        v.vy -= out * ny;
      }
      // How hard she is leaning on it: the stick's component along the cable.
      const lean = v.ix * nx + v.iy * ny;
      if (lean > CABLE_PULL_LEAN) {
        cable.pull += dt;
        if (!cable.taut && ctx.t - tautTalk > CABLE_TALK_COOLDOWN) {
          tautTalk = ctx.t;
          ctx.flash("The cable goes tight — that's the whole reel. Back up, or keep pulling and it comes out", 2600);
        }
      } else {
        cable.pull = Math.max(0, cable.pull - dt * CABLE_PULL_RELAX);
      }
      cable.taut = true;
      if (cable.pull >= CABLE_PULL_OUT) {
        cable.carrying = false;
        cable.snapped = true;
        cable.taut = false;
        cable.pull = 0;
        cable.len = 0;
        cable.pts = [];
        ctx.flash(
          "The plug comes out of the rack — that route was too long. Straight line, under the tables, Voxxy!",
          3500,
        );
      }
      return;
    }

    cable.taut = false;
    cable.pull = Math.max(0, cable.pull - dt * CABLE_PULL_RELAX);
    if (d > CABLE_STEP) {
      cable.len += d;
      cable.pts.push({ x: v.x, y: v.y });
    }
  }

  /**
   * The spray tag, read.
   *
   * One visibility test, not a light mix — chapter 1 owns mixing and this is not a
   * second helping of it. The question asked is only ever "is Voxxy's own beam on
   * the paint", and it is asked of a filtered light list: the SKIRT each robot
   * throws around its own feet is dropped, so standing against the wall in the dark
   * is not reading it. That leaves her 0.38 rad cone against Biggy's 1.0 and
   * Droid's pool, which is the trait this route is built on, plus a range check
   * because lighting a wall from 22 m away is not reading what is on it either.
   */
  function stepPoster(cast: LightSource[]): void {
    const v = ctx.byKind('voxxy');
    router.posterLit =
      dist(v, posterAt) < POSTER_READ && litBy(cast.filter((L) => L.skirt !== true), 'voxxy', posterAt);
    // Lighting it again once it has been read is just a robot pointing a torch at a
    // wall: still true, and nothing left to say about it.
    if (!router.posterLit || router.known) return;
    router.known = true;
    ctx.flash(
      'Voxxy holds the beam on the paint. A wifi symbol, a metre of orange, and under it: ' +
        '<b>DevoxxForever</b> — <i>(and no, you can\u2019t change it)</i>. Bart. Now the terminal in the ' +
        'technical room',
      4600,
    );
  }

  /**
   * A ROBOT AT A TERMINAL IS TYPING, NOT WALKING — and this is half of the bug
   * Michele filed.
   *
   * *"Typing the password was hard, the game did not match it... I kept typing and
   * it never took it right."* Reproduced over CDP with real key events: tap `E`
   * while still holding the key you drove up on, and the prompt opens — but the
   * browser shell stops pushing the stick without CLEARING it (`held` in
   * `src/main.ts` keeps its last value, because a keydown suppressed while typing
   * never records the key as down and so never gets balanced). The stick stays hard
   * over, the robot keeps walking, it leaves `TERMINAL_REACH`, and the line below
   * quietly shuts the prompt. From then on every letter of `DevoxxForever` is a
   * control again: `D` drives, `E` says "nothing to plug in here", and `R` restarts
   * the whole run back to chapter 1.
   *
   * The sim is the source of truth for whether a robot may move (CLAUDE.md), so the
   * sim is where this is answered: while the prompt has the keyboard, the robot at
   * it is pinned. It cannot drift out of its own prompt, whatever the shell does
   * with a stick. The prompt still closes the moment the PLAYER leaves — `Esc`,
   * `Enter`, or taking another robot, which moves `ctx.cur` to somebody far away.
   */
  let typeAnchor: Vec2 | null = null;

  function update(dt: number): void {
    const wasTyping = typing();
    const driven = ctx.bots[ctx.cur];
    if (wasTyping && typeAnchor === null) typeAnchor = { x: driven.x, y: driven.y };
    if (!wasTyping) typeAnchor = null;

    ctx.stepAll(dt);
    ctx.pushBiggy(dt);

    if (typeAnchor !== null && typing()) {
      driven.x = typeAnchor.x;
      driven.y = typeAnchor.y;
      driven.vx = 0;
      driven.vy = 0;
    }

    const v = ctx.byKind('voxxy');
    if (cable.carrying) stepCable(v, dt);

    /*
     * Walking away from the terminal puts the keyboard back. There is no other way
     * out of the prompt than this, `Esc` or `Enter` — and the robot being driven is
     * pinned while it is open, so in practice this is what fires when the player
     * takes a different robot with Tab or 1/2/3.
     */
    if (router.prompting && dist(ctx.bots[ctx.cur], cabinetAt) > TERMINAL_REACH) router.prompting = false;
    // The chain runs backwards too: pull the supply and the prompt is a dark screen.
    if (router.prompting && !power) router.prompting = false;

    /*
     * WHY THIS ROOM ANNOUNCES ITSELF. Michele, twice across two playtests: *"I had
     * trouble finding the projector / open the room... There should be something
     * visible."* The technical room now holds two of the chapter's four jobs, so
     * the first robot through the door is told both are in here, and the terminal
     * carries its own standby glow in the renderer the way the breaker panel does.
     */
    if (!hintedTech && (inRect(v, GF.tech) || inRect(ctx.byKind('biggy'), GF.tech) || inRect(ctx.byKind('droid'), GF.tech))) {
      hintedTech = true;
      ctx.flash(
        (power ? '' : 'Breakers — way up on the wall, Droid. ') +
          'And that grey cabinet is the venue transformer and the router: shut, seized, and far too heavy ' +
          'for anybody but Biggy',
        3600,
      );
    }

    /*
     * THE STORE AND THE DESK INTRODUCE THEMSELVES, exactly as the technical room
     * does. Michele has now reported three times that he could not tell what a
     * thing in this hall was for — the projector panel, the duck, and now both ends
     * of this chapter at once: *"There's no hint on where the cable should go or
     * which door should be slammed and how."*
     *
     * Each fires once, off proximity, and names the thing and the job. The props
     * carry the rest: a halo and a name at the door, a blue wayfinding sign at the
     * steps and a lit pad on the counter.
     */
    if (!hailedStore && ctx.bots.some((b) => dist(b, storeAt) < STORE_HAIL)) {
      hailedStore = true;
      ctx.flash(
        '<b>SHIRTS &amp; GADGETS</b>, stencilled down the side of the shutter, and a red halo painted on ' +
          'the floor in front of it. Three thousand Devoxx t-shirts, crated, on the other side — and the ' +
          'shutter key went with Stephan\u2019s ring. This door opens the hard way',
        4600,
      );
    }
    if (!hailedReception && ctx.bots.some((b) => dist(b, printerAt) < RECEPTION_HAIL)) {
      hailedReception = true;
      ctx.flash(
        cable.connected
          ? 'Reception. The badge printer on the counter, wired at last'
          : 'Reception — the blue sign, the desk, and the badge printer on the counter with a lit pad in ' +
              'front of it. That pad is where the cable ends',
        4000,
      );
    }

    /*
     * THE LAMPS STAY ON. Michele: *"After switching the room gets darker, not
     * lighter (i think is the robot's light being switched off?)."*
     *
     * This line is the half of that he guessed. It used to read
     * `lights = power ? NO_MIRROR_LIGHTS : cast`, on the prototype's logic that
     * once the house lights are up there is nothing left to reveal — but the
     * renderer does not only draw pools from this list, it drives each robot's
     * spotlight and its key light from it too (`src/render/lighting.ts`). Handing
     * it an empty list switched all nine of those off, and since nothing on the
     * renderer's side had ever heard of the breakers, the net effect of throwing
     * them was that the hall went three-quarters darker: mean scene luminance
     * 12.5 -> 5.1, 90th percentile 42 -> 8.8.
     *
     * One cone, one pool and one flood a frame is what chapter 1 pays for its whole
     * length, so casting them the whole way through costs nothing new. The house
     * lights coming up is now the RENDERER's answer to `power` (MOOD_EXPO_LIT),
     * which is where a change in what the room looks like belongs; the mood damps
     * these lamps to 0.4 the way chapter 3's daylight does, so they fade rather
     * than vanish.
     */
    const cast = buildLights(ctx.bots, ctx.walls, NO_MIRRORS);
    lights = cast;
    stepPoster(cast);

    if (printerOnline() && rollerBroken) {
      ctx.score.expoT = Math.round(ctx.t);
      ctx.score.cable = Math.trunc(cable.len);
      ctx.startChapter(3);
    }
  }

  /* -------------------------------------------------------------------- props */

  function props(): Prop[] {
    const out: Prop[] = [
      /*
       * THE BREAKER PANEL, AND HOW THE RENDERER LEARNS THE HALL IS LIT.
       *
       * `src/render/lighting.ts` asks one question of this prop — is its `state`
       * 'done'? — and lifts the hall to `MOOD_EXPO_LIT` if it is. That is the one
       * channel the renderer is allowed to read, so the chain is expressed HERE
       * rather than over there: 'idle' while breakers are down, 'active' once the
       * supply is on and the hall is still dark, 'done' only when the router has
       * closed the lighting circuit. Nothing in `src/render` changed.
       *
       * `v` is still how many handles are up, so the panel itself shows the player
       * that link 1 is done even while the room around it stays black.
       */
      {
        kind: 'breaker',
        ...GF.panel,
        v: BREAKERS - breakersLeft,
        state: hallLit() ? 'done' : power ? 'active' : 'idle',
        label: hallLit()
          ? 'power ON · hall lit'
          : power
            ? 'supply ON — the hall is still dark (the router has not authorised)'
            : `breakers ${BREAKERS - breakersLeft}/${BREAKERS} (high)`,
      },
      { kind: 'rack', ...GF.rack, state: cable.carrying || cable.connected ? 'active' : 'idle', label: 'network rack' },
      {
        kind: 'printer',
        ...GF.printer,
        state: printerOnline() ? 'done' : cable.connected ? 'active' : 'idle',
        label: printerOnline()
          ? 'printer online'
          : `badge printer — needs${power ? '' : ' power,'}${cable.connected ? '' : ' cable,'}${router.online ? '' : ' router,'}`.replace(/,$/, ''),
      },
      /*
       * WHERE THE CABLE GOES, drawn in the world instead of described in a line
       * nobody could parse. Michele: *"I still don't get where / how to connect the
       * cable to the reception."*
       *
       * Three props, no renderer changes — every kind below is already in
       * `PROPS` (`src/render/scene.ts`):
       *
       *   - a blue Dutch wayfinding panel in the hall at the foot of the steps,
       *     in the venue's own signage language (`media/other-images/CAPTIONS.md`),
       *     lit amber while the cable is in Voxxy's hand and green once it is in;
       *   - a second one at the desk, so the landmark is visible from both ends;
       *   - a lit pad on the counter under the printer — the same "put it HERE"
       *     floor plate chapter 3 uses for its delivery drop zone, which is the
       *     vocabulary this game already teaches.
       */
      {
        kind: 'sign',
        x: GF.smallStairs.x - 26,
        y: GF.smallStairs.y + GF.smallStairs.h / 2,
        w: 6,
        h: 40,
        state: cable.connected ? 'done' : cable.carrying ? 'active' : 'idle',
        label: 'RECEPTION · BADGE PRINTER →',
      },
      {
        kind: 'sign',
        x: GF.reception.x + GF.reception.w / 2,
        y: GF.reception.y - 12,
        w: 70,
        h: 5,
        state: cable.connected ? 'done' : cable.carrying ? 'active' : 'idle',
        label: 'RECEPTIE · RECEPTION',
      },
      {
        kind: 'dropzone',
        x: GF.printer.x - 6,
        y: GF.printer.y + GF.printer.h + 2,
        w: GF.printer.w + 12,
        h: 14,
        state: cable.connected ? 'done' : cable.carrying ? 'active' : 'idle',
        label: cable.connected ? 'cable in' : 'cable ends here (Voxxy, E)',
      },
      /*
       * The cabinet, the terminal inside it and the poster out in the hall. The
       * renderer needs no chapter knowledge for any of the three: each is a rect
       * with a `state` and a `label`, and the terminal's standby glow — the thing
       * that makes it findable in a blacked-out room before it is understood — is
       * a property of the prop kind, exactly as it is for the breaker panel.
       */
      {
        kind: 'cabinet',
        ...GF.cabinet,
        state: router.cabinetOpen ? 'open' : 'shut',
        label: router.cabinetOpen ? 'router cabinet — open' : 'router cabinet — shut (Biggy)',
      },
      /*
       * THE TRANSFORMER/ROUTER ITSELF, which Michele asked to SEE come up: *"Breaker
       * give energy, and a transformer/router lights up in the cabinet."*
       *
       * It is a second `terminal`-kind prop — `drawTerminal` pools its mesh, so a
       * chapter may emit as many as it likes — standing to the left of the little
       * keypad screen across the cabinet's face. Dead grey while the breakers are
       * down, pulsing amber the moment they are in (which is the beat: the player
       * throws three handles at one end of the room and a box lights up at the
       * other), green once it has authorised. `v` is high so it reads as a row of
       * settled link lights rather than as an empty field waiting for a cursor.
       */
      {
        kind: 'terminal',
        x: GF.cabinet.x + 4,
        y: cabinetAt.y - 3,
        w: 26,
        h: 4,
        v: 0.85,
        state: !router.cabinetOpen || !power ? 'idle' : router.online ? 'done' : 'active',
        label: !power
          ? 'venue transformer/router — no supply'
          : router.online
            ? 'transformer/router — online'
            : 'transformer/router — powered, waiting for authorisation',
      },
      {
        kind: 'terminal',
        // Beside it, and a metre wide: bigger than the KVM screen a real rack has,
        // and deliberately so — at diorama zoom a true-to-life 40 cm panel is four
        // pixels of dark grey in a blacked-out room, which is the exact failure
        // Michele reported against the projector panel.
        x: cabinetAt.x + 4,
        y: cabinetAt.y - 2,
        w: 16,
        h: 4,
        // `v` is how much of the password is in, so the renderer can fill the field
        // without knowing what the password IS.
        v: router.typed.length / PASSWORD.length,
        state: router.online ? 'done' : !router.cabinetOpen || !power ? 'idle' : 'active',
        label: router.online
          ? 'router online'
          : !router.cabinetOpen
            ? 'terminal — behind the cabinet door'
            : !power
              ? 'terminal — dark (no supply)'
              : `AUTHORISATION? ${maskedPassword()}`,
      },
      /*
       * THE SPRAY TAG. Still `PROPS.poster` — the kind that carries a standby glow
       * and needs a narrow beam to resolve — but a wall's worth of it now, 7 m of
       * orange on the hall's top wall rather than eight-point type on a banner.
       * The glow is what answers Michele's *"and all is dark"*: from across the
       * hall it reads as something painted there, and only her cone reads what.
       */
      {
        kind: 'poster',
        x: posterAt.x - 44,
        y: posterAt.y - 6,
        w: 88,
        h: 4,
        state: router.known ? 'done' : router.posterLit ? 'active' : 'idle',
        label: router.known ? 'the wall: DevoxxForever' : 'spray tag — wifi symbol, unreadable (Voxxy\u2019s beam)',
      },
      {
        kind: 'cable',
        x: rackAt.x,
        y: rackAt.y,
        // While Voxxy is carrying, the head of the run is wherever Voxxy is, so the
        // drawn cable and the metered length agree to within one sample step.
        pts: cable.carrying ? [...cable.pts, { x: ctx.byKind('voxxy').x, y: ctx.byKind('voxxy').y }] : cable.pts,
        v: cable.len,
        state: cable.connected ? 'done' : cable.taut ? 'taut' : cable.carrying ? 'active' : cable.snapped ? 'broken' : 'idle',
        // The HUD's reel meter takes its label from here (`collectMeters`), so the
        // distance still to run is sim state rather than a number the overlay works
        // out for itself. It is the second half of "where does the cable go": the
        // bar stops being an abstract budget and becomes "62 m left, 118 m of reel".
        label: cable.connected
          ? `cable reel — in at reception (${Math.round(cable.len)} px used)`
          : cable.carrying
            ? `cable reel — ${Math.round(dist(ctx.byKind('voxxy'), printerAt) / 12.5)} m still to reception`
            : 'cable reel',
      },
      /*
       * THE STORE DOOR, as Michele designed it: *"Door should have Halo, Name on the
       * side (shirts and gadget) and be mentioned on the intro. Gadgets must be
       * ready, but the door is shut (we could mention the same lost keys?) (and put
       * crates, shirts and gadgets inside)."*
       *
       * The HALO is a flat plate on the floor across the front of the shutter —
       * `PROPS.lane` is the one flat kind this chapter already draws, and
       * `STATE_EMISSIVE.broken` is the dark red in the renderer's own palette, so a
       * red glow on the floor at the door costs no change in `src/render`. It turns
       * green when the door is down. A proper `halo` kind is a two-line patch to
       * `PROPS` and it is in the handover report: this is the stand-in that works
       * today, not the final shape of the idea.
       *
       * The NAME is a blue wayfinding panel down the side of the shutter, in the
       * venue's own signage language; nothing draws prop text yet, so the words
       * themselves are spoken by the store's own hail in `update` and carried in
       * the label for when something does.
       *
       * And what is BEHIND it is drawn, because an empty room behind a door you
       * broke is an anticlimax: four pallets of crated Devoxx t-shirts, visible the
       * moment the shutter goes.
       */
      {
        kind: 'lane',
        x: GF.roller.x - 26,
        y: GF.roller.y - 6,
        w: 26,
        h: GF.roller.h + 12,
        state: rollerBroken ? 'done' : 'broken',
        label: rollerBroken ? 'SHIRTS & GADGETS — open' : 'SHIRTS & GADGETS — shut (the key is on Stephan\u2019s ring)',
      },
      {
        kind: 'sign',
        x: GF.roller.x - 4,
        y: GF.roller.y - 16,
        w: 5,
        h: 22,
        state: rollerBroken ? 'done' : 'idle',
        label: 'SHIRTS & GADGETS',
      },
      {
        kind: 'roller',
        ...GF.roller,
        state: rollerBroken ? 'broken' : 'shut',
        label: rollerBroken ? 'roller door — down' : 'roller door — shirts & gadgets, shut',
      },
      ...STORE_PALLETS.map((pt, i): Prop => ({
        kind: 'crate',
        x: pt.x,
        y: pt.y,
        w: 16,
        h: 14,
        v: i % 2 === 0 ? 2 : 1,
        state: 'idle',
        label: 'Devoxx t-shirts',
      })),
      { kind: 'gate', ...GF.gate, state: 'shut', label: 'registration gate' },
      // The lane the prototype drew as a dashed hint: this is where Voxxy has to
      // shove Biggy from, and it is sim data so the renderer need not guess.
      { kind: 'lane', x: 370, y: 160, w: GF.roller.x - 4 - 370, h: T, state: rollerBroken ? 'done' : 'idle', label: 'run-up lane → (Voxxy pushes Biggy)' },
    ];
    return out;
  }

  // Cast once at setup so the very first drawn frame is already lit, rather than
  // one black frame before `update` runs.
  lights = buildLights(ctx.bots, ctx.walls, NO_MIRRORS);

  /**
   * THE HALL'S LIGHTS. The breakers give energy; the router closes the circuit.
   *
   * One function, read by the breaker prop (which is how `src/render/lighting.ts`
   * learns the room is lit) and by the state block the tests read. It is deliberately
   * not a stored flag: a chain has no state of its own beyond its links.
   */
  const hallLit = (): boolean => power && router.online;

  /** The chain, and the cable: all of it, or the printer prints nothing. */
  const printerOnline = (): boolean => power && cable.connected && router.online;

  /**
   * The password as the player sees it while typing: what is in, then a dot per
   * letter still to come. The count is on the end because thirteen dots are not
   * countable at a glance and "7/13" is.
   */
  const maskedPassword = (): string =>
    `${router.typed}${PASSWORD_BLANK.repeat(PASSWORD.length - router.typed.length)} ` +
    `(${router.typed.length}/${PASSWORD.length})`;

  /**
   * The live bottom-of-screen line — now written as THE CHAIN, in order.
   *
   * The old one read as four independent errands with four independent counters,
   * which is exactly how the chapter played. Each link now says what the one before
   * it is waiting on, so a player who reads one line knows why the thing in front of
   * them is dead.
   */
  function progress(): string {
    const breakers = power
      ? hallLit()
        ? 'power ✓'
        : 'power ✓ (hall still dark)'
      : `breakers ${BREAKERS - breakersLeft}/${BREAKERS} — Droid, high on the wall (E)`;
    const net2 = router.online
      ? 'router ✓ — the hall is lit'
      : !router.cabinetOpen
        ? 'router: cabinet shut — Biggy shoulders it open (E)'
        : !power
          ? 'router: open, and dead. No supply until the breakers are in'
          : router.prompting
            ? `AUTHORISATION ${maskedPassword()} · Backspace · Esc`
            : router.known
              ? 'router: powered, password known — E at the terminal'
              : 'router: powered, waiting for the WiFi password — E at the terminal';
    const net = cable.connected
      ? 'cable ✓'
      : cable.snapped
        ? 'cable snapped — back to the rack'
        : cable.carrying
          ? `cable ${Math.round(cable.len)}/${CABLE_MAX} px${cable.taut ? ' — TAUT' : ''} → reception`
          : 'cable: on the reel at the rack (Voxxy, E)';
    const store = rollerBroken
      ? 'shirts & gadgets ✓'
      : `store shutter: shut (needs ${m(ROLLER_DOOR_SPEED).toFixed(1)} m/s)`;
    return `${breakers} · ${net2} · ${net} · ${store}`;
  }

  /**
   * THE FIELD ON SCREEN — `GameSnapshot.prompt`, and the other half of Michele's
   * *"I'd display an input text at center screen on e to make it easier."*
   *
   * Everything the HUD needs to draw a text field, and nothing it could decide for
   * itself: the sim says what is being asked, what is in the box, how long the
   * answer is, what the keys do and whether the last key was refused. The renderer
   * formats it and owns none of it (CLAUDE.md). `null` whenever no prompt is open,
   * which is what makes the field appear and disappear.
   */
  function prompt(): TextPrompt | null {
    if (!typing()) return null;
    return {
      title: 'AUTHORISATION — venue WiFi password',
      value: router.typed,
      total: PASSWORD.length,
      blank: PASSWORD_BLANK,
      hint: router.known
        ? 'You have read it. Type it: A–Z · Backspace · Esc steps away'
        : 'A–Z types · Backspace fixes a slip · Esc steps away',
      // A refusal is worth about a third of a second of red, which is long enough
      // to see on a key you did not mean and short enough not to stack up.
      reject: Math.max(0, 1 - (ctx.t - router.rejectAt) / 0.35),
    };
  }

  return {
    key,
    update,
    props,
    progress,
    typing,
    prompt,
    lights: () => lights,
    state: (): ExpoState => ({
      chapter: 2,
      power,
      breakersLeft,
      cable: {
        carrying: cable.carrying,
        connected: cable.connected,
        len: cable.len,
        snapped: cable.snapped,
        taut: cable.taut,
      },
      rollerBroken,
      router: {
        cabinetOpen: router.cabinetOpen,
        powered: power,
        known: router.known,
        prompting: router.prompting,
        typed: router.typed,
        posterLit: router.posterLit,
        online: router.online,
      },
      hallLit: hallLit(),
      printerOnline: printerOnline(),
    }),
  };
}

export const ch2Expo: ChapterDef = { n: 2, title: '2 · Expo — the exhibition hall', setup };
