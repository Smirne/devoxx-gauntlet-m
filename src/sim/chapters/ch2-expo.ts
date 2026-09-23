/**
 * Chapter 2 — EXPO. The exhibition hall before opening: dark, empty, no network,
 * and three thousand badges locked in the pickup store.
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
 * ## The network closet — the WiFi password
 *
 * `docs/gameplay-additions.md` §2 described this beat as a cam-lock wheel. Michele
 * killed the wheel on 23 Sep 2026 — *"Remove the wheel, too complicated"* — and the
 * password itself took its place. His other two rules from the same conversation
 * still stand and still shape it: **not** thirteen letters scattered round the venue
 * (letter-collection is busywork) and **not** a second helping of chapter 1's light
 * mix (that is chapter 1's identity).
 *
 * The badge printer needs POWER + CABLE + ROUTER. The router lives in the cabinet in
 * the technical room, and the terminal wired to it wants the venue WiFi password:
 * `DevoxxForever`. **Biggy is on every route** — the cabinet is a heavy steel door
 * with seized hinges and nothing else in the building can swing it, and the terminal
 * is inside it. Past that there are three ways to answer, and a player needs one:
 *
 *   1. **Type it.** It is on the chapter card, and it is the sort of password you
 *      remember. Thirteen letters, case-insensitive, Backspace fixes a slip, and a
 *      wrong key simply does not go in — it never throws the whole thing away.
 *   2. **Voxxy reads it off the poster.** The sponsor banner in the hall carries it
 *      in the small print at the bottom. Her cone is 0.38 rad against Biggy's 1.0:
 *      the only beam in the game narrow enough to resolve type that size, and she
 *      has to be close enough to read it rather than merely to light it.
 *   3. **Droid reads the label, from Biggy's shoulders.** The tape is stuck inside
 *      the cabinet lid, up at the top, which is where every conference's WiFi
 *      password really lives. `toggleMount` is the mechanic — it exists, it is
 *      tested, and outside chapter 1's projector panel almost nothing uses it.
 *
 * Whichever route found it, the answer is entered at the same terminal, and the
 * chapter ends the same way: power + cable + router, then the roller door.
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
import type { Bot, LightSource, Mirror, Prop, Vec2, Wall } from '../types';
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
 * How close Voxxy has to be for her cone to resolve the small print on the poster,
 * sim px — 5.6 m.
 *
 * Her lamp reaches 280 px, and lighting a poster from 22 m away is not reading it.
 * This is the difference between the two, and it is the only number in the beat
 * that is a judgement rather than a measurement: close enough that she has to walk
 * to the booth and stand at it, far enough that it is not a pixel hunt.
 */
const POSTER_READ = 70;
/** Seconds between the terminal's "that is not it" readouts, so a mashed key is not a wall of toast. */
const TYPO_COOLDOWN = 1.2;
const BREAKERS = 3;

/** The exhibition hall has no cinema screen to bounce a lamp off. */
const NO_MIRRORS: Mirror[] = [];

/* ==================================================================== chapter */

export interface ExpoState {
  chapter: 2;
  power: boolean;
  breakersLeft: number;
  cable: { carrying: boolean; connected: boolean; len: number; snapped: boolean; taut: boolean };
  rollerBroken: boolean;
  /** The router cabinet, its terminal, and the WiFi password. */
  router: {
    /** Biggy has shouldered the cabinet door open. Nothing else in here starts until he has. */
    cabinetOpen: boolean;
    /** The robots have read the password off the poster or off the label inside the lid. */
    known: boolean;
    /** The terminal has the keyboard: letters type instead of driving. */
    prompting: boolean;
    /** The prefix of `PASSWORD` typed in so far — never a wrong letter, so it only ever grows. */
    typed: string;
    /** Voxxy's cone is on the poster's small print this frame, and close enough to read it. */
    posterLit: boolean;
    /** The password is in and the router is up. */
    online: boolean;
  };
  /** Power AND cable AND router: all three, or the badge printer prints nothing. */
  printerOnline: boolean;
}

const OBJECTIVE =
  'Chapter 2 · <b>Expo</b>. The exhibition hall before opening: dark, empty, registration in an hour. ' +
  '<b>Droid</b> flips the three breakers on the high panel in the technical room (E). ' +
  '<b>Voxxy</b> runs the network cable from the rack to the printer at reception — it is short: ' +
  'straight line, <b>under the sponsor tables</b>. The printer also wants the <b>router</b>: only ' +
  '<b>Biggy</b> can shoulder that cabinet open (E), and the terminal inside wants the WiFi password. ' +
  '<b>Type it</b> if you remember it from the card — or <b>Voxxy</b> reads it off a sponsor poster in ' +
  'the hall with her narrow beam, or <b>Droid</b> reads the label inside the lid <b>from Biggy\'s ' +
  'shoulders</b> (E beside him to climb on). <b>Biggy</b> also smashes the roller door of the badge ' +
  'store — above his own top speed, so <b>Voxxy takes hold of him (Space)</b> and runs him ' +
  'down the long top lane: the bar locks to one of eight directions, so the run cannot wander.';
const KEYS =
  '1/2/3/Tab: switch · WASD · E: use / climb / terminal · A-Z: type the password · Space: take hold of Biggy · R: restart';

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

  /* ------------------------------------------------------------ the network closet */

  /**
   * The cabinet's south face — the face the diorama camera looks at. Everything in
   * this beat is measured from here: Biggy's shoulder, the terminal's keys, and the
   * label taped inside the lid that Droid reads from up on Biggy.
   */
  const cabinetAt: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };

  /**
   * The sponsor poster, on the south face of the Cloudy Bank booth.
   *
   * Placed off every errand in the chapter on purpose — Droid's breakers are in the
   * technical room, Voxxy's cable runs along the bottom lane and Biggy's run-up is
   * the top one — so reading it is a detour a player chooses, not something that
   * happens to them on the way past. Two pixels proud of the booth's face, exactly
   * as chapter 1's clues stand off their walls, so the booth itself never occludes
   * the beam that is trying to read it.
   */
  const posterBooth = GF.booths.find((b) => b.name === 'Cloudy Bank') ?? GF.booths[2];
  const posterAt: Vec2 = { x: posterBooth.x + posterBooth.w / 2, y: posterBooth.y + posterBooth.h + 2 };

  const router = {
    cabinetOpen: false,
    known: false,
    prompting: false,
    typed: '',
    posterLit: false,
    online: false,
  };
  let typoTalk = -9;

  /**
   * The terminal has the keyboard.
   *
   * `game.ts` asks this before it treats `R` as restart and the browser shell asks it
   * before it treats `WASD` as driving (`GameSnapshot.typing`): `DevoxxForever` has a
   * `D` in it and two `r`s, and without this the first letter of the password would
   * drive the robot out of reach of the terminal and the seventh would restart the
   * chapter. It is the only thing in the game that takes the keyboard, and it is the
   * player who opens it with `E` and closes it with `E`, `Esc` or `Enter`.
   */
  const typing = (): boolean => router.prompting && router.cabinetOpen && !router.online;

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
   * THE CARD IS ROUTE 1.
   *
   * The password is on it, in the crew's own run sheet, and a player who reads the
   * card can walk to the terminal and type it without finding anything at all. That
   * is deliberate: it costs nothing, it rewards attention, and it is the reason the
   * other two routes are alternatives rather than a gate. It is also the joke.
   */
  ctx.card(
    '<b>Down the secondary staircase.</b><br>' +
      '<span class="sub">The exhibition hall: twelve sponsor booths, no power, no network, and the badges ' +
      'locked in the pickup store. Taped to the technical room door, the crew\'s run sheet, in biro:<br><br>' +
      '<b>WiFi: DevoxxForever</b> — and no, you cannot change it.</span>' +
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
      if (router.typed.length === PASSWORD.length) {
        router.known = true;
        router.online = true;
        router.prompting = false;
        ctx.flash('DevoxxForever. Four green lights come up on the router, and the venue is on the air', 3500);
      }
      return;
    }
    if (ctx.t - typoTalk <= TYPO_COOLDOWN) return;
    typoTalk = ctx.t;
    ctx.flash(
      `Terminal: ${ch} — not that one. ${router.typed.length} of ${PASSWORD.length} still stand. ` +
        'Backspace takes one back',
    );
  }

  /** E at the terminal: type it, or have the robot that already read it type it for you. */
  function useTerminal(b: Bot): void {
    if (router.online) {
      ctx.flash(`${b.name}: the router is up. Four green lights and a fan nobody has cleaned since 2019`);
      return;
    }
    if (b.kind === 'biggy') {
      ctx.flash('Biggy: thirteen little keys. These are not thirteen-little-key hands. Voxxy? Droid?');
      return;
    }
    if (router.known) {
      router.online = true;
      router.prompting = false;
      router.typed = PASSWORD;
      ctx.flash(
        `${b.name} types it in — DevoxxForever — and the router comes up. And no, you cannot change it`,
        3500,
      );
      return;
    }
    if (router.prompting) {
      router.prompting = false;
      ctx.flash(`${b.name} steps back from the terminal`);
      return;
    }
    router.prompting = true;
    ctx.flash(
      (b.kind === 'droid'
        ? 'Droid: <b>WIFI PASSWORD?</b>, it says. That label will be taped inside the lid, up at the top — ' +
          "from Biggy's shoulders I could read it"
        : 'Voxxy: <b>WIFI PASSWORD?</b>, it says. Type it — or let me go looking, small print is what I am for') +
        '. A–Z types, Backspace fixes a slip, Esc steps away',
      4000,
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
          ctx.flash('Droid flips the last breaker — the hall lights come on, booth by booth', 3500);
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
        ctx.flash("Voxxy takes the cable end. It's not long — straight to reception, under the tables");
        return;
      }
      if (cable.carrying && dist(b, printerAt) < PLUG_REACH) {
        cable.carrying = false;
        cable.taut = false;
        cable.connected = true;
        ctx.flash(
          `Cable in — the run is made (${Math.trunc(cable.len)} of ${CABLE_MAX} px used). ` +
            'Now it wants power and a router on the other end',
          3000,
        );
        return;
      }
      if (cable.carrying) {
        ctx.flash('Voxxy: the printer is at reception, through the hall wall on the right');
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
            ? 'Voxxy: read it already — DevoxxForever'
            : 'Voxxy: there is small print along the bottom of this banner. Not a poking job — point the beam at it',
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
      ctx.flash(
        'Biggy sets his shoulder against the cabinet door and walks it open. Inside: the venue router, ' +
          'a fan full of 2019, and a little terminal blinking <b>WIFI PASSWORD?</b>',
        4000,
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
   * The poster, read.
   *
   * One visibility test, not a light mix — chapter 1 owns mixing and this is not a
   * second helping of it. The question asked is only ever "is Voxxy's own beam on
   * the small print", and it is asked of a filtered light list: the SKIRT each
   * robot throws around its own feet is dropped, so standing next to the banner in
   * the dark is not reading it. That leaves her 0.38 rad cone against Biggy's 1.0
   * and Droid's pool, which is the trait this route is built on, plus a range check
   * because lighting a poster from 22 m away is not reading it either.
   */
  function stepPoster(cast: LightSource[]): void {
    const v = ctx.byKind('voxxy');
    router.posterLit =
      dist(v, posterAt) < POSTER_READ && litBy(cast.filter((L) => L.skirt !== true), 'voxxy', posterAt);
    // Lighting it again once it has been read is just a robot pointing a torch at a
    // banner: still true, and nothing left to say about it.
    if (!router.posterLit || router.known) return;
    router.known = true;
    ctx.flash(
      'Voxxy holds the beam on the bottom of the banner: <b>free coffee · free wifi · DevoxxForever</b>. ' +
        'Sponsors. Now the terminal in the technical room',
      3800,
    );
  }

  function update(dt: number): void {
    ctx.stepAll(dt);
    ctx.pushBiggy(dt);

    const v = ctx.byKind('voxxy');
    if (cable.carrying) stepCable(v, dt);

    /*
     * Walking away from the terminal puts the keyboard back. There is no other way
     * out of the prompt than this, `E`, `Esc` or `Enter` — and the robot being
     * driven cannot walk while it is open, so in practice this is what fires when
     * the player takes a different robot with Tab or 1/2/3.
     */
    if (router.prompting && dist(ctx.bots[ctx.cur], cabinetAt) > TERMINAL_REACH) router.prompting = false;

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
          'And that grey cabinet is the router: shut, seized, and far too heavy for anybody but Biggy',
        3600,
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

    if (power && cable.connected && router.online && rollerBroken) {
      ctx.score.expoT = Math.round(ctx.t);
      ctx.score.cable = Math.trunc(cable.len);
      ctx.startChapter(3);
    }
  }

  /* -------------------------------------------------------------------- props */

  function props(): Prop[] {
    const out: Prop[] = [
      {
        kind: 'breaker',
        ...GF.panel,
        v: BREAKERS - breakersLeft,
        state: power ? 'done' : 'idle',
        label: power ? 'power ON' : `breakers ${BREAKERS - breakersLeft}/${BREAKERS} (high)`,
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
      {
        kind: 'terminal',
        // Centred on the cabinet face, and a metre wide: bigger than the KVM screen
        // a real rack has, and deliberately so — at diorama zoom a true-to-life
        // 40 cm panel is four pixels of dark grey in a blacked-out room, which is
        // the exact failure Michele reported against the projector panel.
        x: cabinetAt.x - 6,
        y: cabinetAt.y - 2,
        w: 12,
        h: 4,
        // `v` is how much of the password is in, so the renderer can fill the field
        // without knowing what the password IS.
        v: router.typed.length / PASSWORD.length,
        state: router.online ? 'done' : !router.cabinetOpen ? 'idle' : 'active',
        label: router.online
          ? 'router online'
          : !router.cabinetOpen
            ? 'terminal — behind the cabinet door'
            : `WIFI PASSWORD? ${maskedPassword()}`,
      },
      {
        kind: 'poster',
        x: posterAt.x - 14,
        y: posterAt.y - 2,
        w: 28,
        h: 3,
        state: router.known ? 'done' : router.posterLit ? 'active' : 'idle',
        label: router.known ? 'sponsor banner — read' : 'sponsor banner (small print — Voxxy)',
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
        label: 'cable reel',
      },
      {
        kind: 'roller',
        ...GF.roller,
        state: rollerBroken ? 'broken' : 'shut',
        label: 'roller door',
      },
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

  /** Power AND cable AND router. Three prerequisites, one printer. */
  const printerOnline = (): boolean => power && cable.connected && router.online;

  /**
   * The password as the player sees it while typing: what is in, then a dot per
   * letter still to come. The count is on the end because thirteen dots are not
   * countable at a glance and "7/13" is.
   */
  const maskedPassword = (): string =>
    `${router.typed}${PASSWORD_BLANK.repeat(PASSWORD.length - router.typed.length)} ` +
    `(${router.typed.length}/${PASSWORD.length})`;

  /** The live bottom-of-screen line: the four jobs, each with its own counter. */
  function progress(): string {
    const breakers = power ? 'power ✓' : `breakers ${BREAKERS - breakersLeft}/${BREAKERS}`;
    const net = cable.connected
      ? 'cable ✓'
      : cable.snapped
        ? 'cable snapped — back to the rack'
        : cable.carrying
          ? `cable ${Math.round(cable.len)}/${CABLE_MAX} px${cable.taut ? ' — TAUT' : ''}`
          : 'cable: on the reel at the rack';
    const net2 = router.online
      ? 'router ✓'
      : !router.cabinetOpen
        ? 'router: cabinet shut — Biggy shoulders it open (E)'
        : router.prompting
          ? `WIFI PASSWORD ${maskedPassword()} · Backspace · Esc`
          : router.known
            ? 'router: password known — E at the terminal'
            : 'router: terminal waiting — E at it and type the password';
    const store = rollerBroken ? 'badge store ✓' : `roller door: shut (needs ${m(ROLLER_DOOR_SPEED).toFixed(1)} m/s)`;
    return `${breakers} · ${net} · ${net2} · ${store}`;
  }

  return {
    key,
    update,
    props,
    progress,
    typing,
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
        known: router.known,
        prompting: router.prompting,
        typed: router.typed,
        posterLit: router.posterLit,
        online: router.online,
      },
      printerOnline: printerOnline(),
    }),
  };
}

export const ch2Expo: ChapterDef = { n: 2, title: '2 · Expo — the exhibition hall', setup };
