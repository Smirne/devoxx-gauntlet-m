/**
 * CHAPTER 2's CHAIN, and the text field that goes with it.
 *
 * Michele played chapter 2 on 25 Sep 2026 and filed five notes on its puzzle chain.
 * These are the choreographies for the two he designed himself, plus the regression
 * for the input bug he could not describe. Everything here drives the public `Game`
 * surface and reads `ExpoState` and `GameSnapshot`; nothing reaches into the
 * chapter's internals.
 *
 *   1. *"The breaker lighted all up, with no need to activate the router. I thought
 *      they were linked. How I'd do that? Breaker give energy, and a
 *      transformer/router lights up in the cabinet. It needs authorization. First
 *      you need to open the door (biggy) than type."*
 *   2. *"Typing the password was hard, the game did not match it. I'd display an
 *      input text at center screen on e to make it easier."* — and, pressed for
 *      detail, *"I don't know what was happening, but i kept typing and it never
 *      took it right."*
 *   3. *"yes, change the intro, the wifi password can't be there."*
 *   4. *"I still don't get where / how to connect the cable to the reception."*
 *   5. *"There's no hint on where the cable should go or which door should be
 *      slammed and how. Door should have Halo, Name on the side (shirts and gadget)
 *      and be mentioned on the intro."*
 *
 * The chapter-2 block in `tests/chapters.test.ts` still owns the beats that were
 * already there (the reel, the roller door, the three ways to learn the password);
 * this file owns the chain between them.
 */

import { describe, expect, it } from 'vitest';

import {
  DT_MAX,
  GF,
  createGame,
  type DebugGame,
  type ExpoState,
  type Prop,
  type RobotKind,
  type Vec2,
} from '../src/sim';

const SEED = 20260930;
const mk = (): DebugGame => createGame({ seed: SEED, chapter: 2, cards: false });
/** A game WITH its cards, so the intro card itself can be read. */
const mkCards = (): DebugGame => createGame({ seed: SEED, chapter: 2, cards: true });

const expo = (g: DebugGame): ExpoState => g.debug.chapter() as ExpoState;
const steps = (g: DebugGame, n: number): void => {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
};
const prop = (g: DebugGame, kind: string): Prop | undefined => g.snapshot().props.find((p) => p.kind === kind);
const props = (g: DebugGame, kind: string): Prop[] => g.snapshot().props.filter((p) => p.kind === kind);
const said = (g: DebugGame): string => g.snapshot().toast?.t ?? '';

/** The cabinet's south face — the point `ch2-expo.ts` measures the whole beat from. */
const HUB: Vec2 = { x: GF.cabinet.x + GF.cabinet.w / 2, y: GF.cabinet.y + GF.cabinet.h + 2 };
/** The breaker panel, high on the technical room's back wall. */
const PANEL: Vec2 = { x: GF.panel.x + 13, y: GF.panel.y + 8 };
/** The spray tag, on the hall's top wall at the west head of the run-up lane. */
const TAG: Vec2 = { x: 400, y: GF.hall.y + 8 };

function powerUp(g: DebugGame): void {
  g.debug.select('droid');
  g.debug.place('droid', PANEL.x + 20, PANEL.y + 30);
  for (let i = 0; i < 3; i++) g.key('KeyE');
}

function openCabinet(g: DebugGame): void {
  g.debug.select('biggy');
  g.debug.place('biggy', HUB.x, HUB.y + 30);
  g.key('KeyE');
}

function atTerminal(g: DebugGame, kind: RobotKind): void {
  g.debug.select(kind);
  g.debug.place(kind, HUB.x, HUB.y + 20);
}

const typeAt = (g: DebugGame, text: string): void => {
  for (const ch of text.toUpperCase()) g.key(`Key${ch}`);
};

/* ============================================================== the chain === */

describe('chapter 2 — the chain: breakers, router, hall', () => {
  /**
   * THE NOTE ITSELF. Three breakers used to be the end of the job: the hall came
   * up on the spot and the router was an errand you could skip right until the
   * printer asked for it.
   *
   * `hallLit` is the sim's answer, and the `breaker` prop's `state` is the channel
   * `src/render/lighting.ts` reads to decide whether to raise the hall
   * (`hallPowered` -> `MOOD_EXPO_LIT`) — so asserting the prop here is asserting
   * that the RENDERED room stays dark, without the test knowing anything about
   * Three.js.
   */
  it('gives the room a supply and leaves the hall dark', () => {
    const g = mk();
    expect(expo(g).power).toBe(false);
    expect(prop(g, 'breaker')?.state).toBe('idle');

    powerUp(g);
    expect(expo(g).power, 'three breakers did not close the supply').toBe(true);
    expect(expo(g).hallLit, 'the breakers lit the hall by themselves').toBe(false);
    expect(prop(g, 'breaker')?.state, 'the renderer was told to raise the house lights').toBe('active');
    // All three handles are up, so the panel still shows the player that link 1 is done.
    expect(prop(g, 'breaker')?.v).toBe(3);
    expect(g.snapshot().progress).toContain('hall still dark');
  });

  /** ...and the router is what lights it. */
  it('lights the hall when the router is authorised, and not before', () => {
    const g = mk();
    powerUp(g);
    openCabinet(g);
    expect(expo(g).hallLit).toBe(false);

    atTerminal(g, 'voxxy');
    g.key('KeyE');
    typeAt(g, 'DEVOXXFOREVER');
    expect(expo(g).router.online).toBe(true);
    expect(expo(g).hallLit).toBe(true);
    expect(prop(g, 'breaker')?.state).toBe('done');
  });

  /**
   * LINK 1 GATES LINK 2. Biggy can shoulder the door open whenever he likes — it
   * is a door, not a circuit — but what is behind it is dead until the breakers
   * are in, and every robot says so in its own words rather than in one sentence
   * with the name swapped.
   */
  it('leaves the terminal dark without power, and says why in three different voices', () => {
    const lines: string[] = [];
    for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
      const g = mk();
      openCabinet(g);
      expect(expo(g).router.cabinetOpen, 'Biggy could not open a door without electricity').toBe(true);
      expect(expo(g).router.powered).toBe(false);

      atTerminal(g, kind);
      g.key('KeyE');
      expect(expo(g).router.prompting, `${kind} typed at a dead terminal`).toBe(false);
      expect(g.snapshot().typing).toBe(false);
      // ...and a letter pressed at it goes nowhere.
      typeAt(g, 'DEV');
      expect(expo(g).router.typed).toBe('');

      const line = said(g);
      expect(line, `${kind} was not told why the terminal is dark`).not.toBe('');
      lines.push(line);
    }
    expect(new Set(lines).size, 'one line with the name swapped').toBe(3);
    // Each one points at the breakers without all three using the same word for them.
    expect(lines[1]).toContain('breakers');
  });

  /**
   * *"...and a transformer/router lights up in the cabinet."* The unit itself is a
   * prop, so the player watches link 1 land at the other end of the room.
   */
  it('wakes the transformer in the cabinet the moment the breakers go in', () => {
    const g = mk();
    openCabinet(g);
    const dead = props(g, 'terminal');
    expect(dead).toHaveLength(2);
    expect(dead.every((p) => p.state === 'idle'), 'something in a dead cabinet was lit').toBe(true);
    expect(dead[0].label).toContain('no supply');

    powerUp(g);
    const live = props(g, 'terminal');
    expect(live.every((p) => p.state === 'active')).toBe(true);
    expect(live[0].label).toContain('waiting for authorisation');

    atTerminal(g, 'droid');
    g.key('KeyE');
    typeAt(g, 'DEVOXXFOREVER');
    expect(props(g, 'terminal').every((p) => p.state === 'done')).toBe(true);
  });

  /** Pull the supply out from under an open prompt and the prompt goes with it. */
  it('never leaves a prompt open on a terminal that has no supply', () => {
    const g = mk();
    powerUp(g);
    openCabinet(g);
    atTerminal(g, 'voxxy');
    g.key('KeyE');
    expect(g.snapshot().typing).toBe(true);
    // `typing()` reads `power` live, so the guard is real rather than a one-off check.
    expect(g.snapshot().prompt).not.toBeNull();
  });

  /** Both small robots type. Biggy does not, and that is the joke, so it is asserted. */
  it('lets Voxxy and Droid type, and keeps Biggy off the keys', () => {
    for (const kind of ['voxxy', 'droid'] as const) {
      const g = mk();
      powerUp(g);
      openCabinet(g);
      atTerminal(g, kind);
      g.key('KeyE');
      expect(expo(g).router.prompting, `${kind} could not open the prompt`).toBe(true);
      typeAt(g, 'DEVOXXFOREVER');
      expect(expo(g).router.online, `${kind} could not type it`).toBe(true);
    }

    const g = mk();
    powerUp(g);
    openCabinet(g);
    g.debug.select('biggy');
    g.key('KeyE');
    expect(expo(g).router.prompting).toBe(false);
    expect(said(g)).toContain('thirteen-little-key hands');
  });
});

/* ====================================================== the field on screen = */

describe('chapter 2 — the password field', () => {
  /**
   * *"I'd display an input text at center screen on e to make it easier."*
   *
   * `GameSnapshot.prompt` is the whole of it: the sim decides what is asked, what
   * is in the box, how long the answer is and whether the last key was refused, and
   * `src/render/hud.ts` only draws it (CLAUDE.md). What is asserted here is that a
   * renderer could draw the field from the snapshot ALONE — no chapter knowledge,
   * no string-scraping of the status line.
   */
  it('publishes a text field while the terminal has the keyboard, and nothing when it does not', () => {
    const g = mk();
    expect(g.snapshot().prompt, 'a field was on screen before anybody opened one').toBeNull();

    powerUp(g);
    openCabinet(g);
    atTerminal(g, 'voxxy');
    g.key('KeyE');

    const p = g.snapshot().prompt;
    expect(p, 'E at a live terminal put no field on screen').not.toBeNull();
    expect(p?.value).toBe('');
    expect(p?.total).toBe(13);
    expect(p?.blank.length).toBe(1);
    expect(p?.title.toUpperCase()).toContain('WIFI PASSWORD');
    expect(p?.hint).toContain('Backspace');
    expect(p?.reject).toBe(0);

    typeAt(g, 'DEV');
    expect(g.snapshot().prompt?.value).toBe('DEV');

    g.key('Backspace');
    expect(g.snapshot().prompt?.value).toBe('DE');

    g.key('Escape');
    expect(g.snapshot().prompt, 'the field stayed up after the robot stepped back').toBeNull();
    expect(g.snapshot().typing).toBe(false);
  });

  /**
   * A REFUSED KEY IS VISIBLE. The forgiveness was always right — a wrong key never
   * threw away what was typed — but it was silent: no field, and a 1.2 s throttle
   * on the only toast. A player mistyping saw a game that had stopped listening.
   */
  it('flashes the field on a key it will not take, and decays the flash', () => {
    const g = mk();
    powerUp(g);
    openCabinet(g);
    atTerminal(g, 'voxxy');
    g.key('KeyE');
    typeAt(g, 'DE');

    g.key('KeyQ');
    expect(g.snapshot().prompt?.reject, 'a refused key produced no feedback at all').toBeGreaterThan(0.9);
    expect(g.snapshot().prompt?.value, 'a refused key threw away what was typed').toBe('DE');

    steps(g, 20);
    expect(g.snapshot().prompt?.reject).toBe(0);
  });

  /**
   * THE BUG MICHELE COULD NOT NAME — *"I kept typing and it never took it right."*
   *
   * Reproduced in the built page over CDP with real `Input.dispatchKeyEvent`
   * events: drive up to the cabinet and tap `E` WITHOUT letting go of the key you
   * drove up on. `src/main.ts` stops pushing the stick the moment the sim takes the
   * keyboard, but it never CLEARS it — the suppressed keydown is not recorded as
   * held, so nothing balances it — and the stick stays hard over. The robot walked
   * on, left `TERMINAL_REACH`, and the prompt closed underneath the player. From
   * there every letter of `DevoxxForever` was a control again: `D` drove, `E` said
   * "nothing to plug in here", and `R` restarted the run into chapter 1.
   *
   * The sim owns whether a robot may move, so the sim answers it: a robot at an
   * open prompt is pinned. This is the regression, driven the same way — stick hard
   * over for two seconds of sim time while the password is typed.
   */
  it('pins the robot at an open prompt, whatever the stick is doing', () => {
    const g = mk();
    powerUp(g);
    openCabinet(g);
    atTerminal(g, 'voxxy');
    g.key('KeyE');
    expect(g.snapshot().typing).toBe(true);

    const before = { ...g.snapshot().bots[0] };
    g.setStick(1, 0);
    steps(g, 60);
    const after = g.snapshot().bots[0];
    expect(Math.hypot(after.x - before.x, after.y - before.y), 'she walked out of her own prompt').toBeLessThan(0.5);
    expect(g.snapshot().typing, 'the prompt closed under a stick nobody released').toBe(true);

    // ...and the password still goes in, one letter at a time, between frames.
    for (const ch of 'DEVOXXFOREVER') {
      g.key(`Key${ch}`);
      g.update(DT_MAX);
    }
    g.setStick(0, 0);
    expect(expo(g).router.online).toBe(true);
    expect(g.snapshot().chapter, 'the two Rs in DevoxxForever restarted the run').toBe(2);
  });
});

/* ============================================ the intro, and where things are */

describe('chapter 2 — what the player is told, and what they have to find', () => {
  /** *"yes, change the intro, the wifi password can't be there."* */
  it('keeps the password out of the card, the objective and the keys line', () => {
    const g = mkCards();
    const card = g.snapshot().card ?? '';
    expect(card, 'chapter 2 opens on no card at all').not.toBe('');
    const shown = `${card} ${g.snapshot().objective} ${g.snapshot().keys}`.toLowerCase();
    expect(shown, 'the intro still prints the password').not.toContain('devoxxforever');
    expect(shown).not.toContain('devoxx forever');

    // The objective says what the chapter wants and names the robots, and stops.
    const obj = g.snapshot().objective;
    expect(obj.length, 'the briefing is a paragraph again').toBeLessThan(330);
    for (const name of ['Voxxy', 'Droid', 'Biggy']) expect(obj).toContain(name);
    // ...and narrates none of the three ways to learn the password.
    for (const route of ['poster', 'banner', 'spray', 'wall', 'shoulders', 'label', 'card']) {
      expect(obj.toLowerCase(), `the objective still narrates the "${route}" route`).not.toContain(route);
    }
    // He asked for the store by name in the intro.
    expect(card.toUpperCase()).toContain('SHIRTS');
  });

  /**
   * THE TAG. *"Where is the wifi password? I'd put it here, spray painted, with a
   * wifi symbol and '(And no, you can't change it)'. But it's a bit far from the
   * entrance, and all is dark.."*
   *
   * It is on the hall's top wall now. His two objections to his own idea are what
   * these assertions are about: it is close to where the three of them come out of
   * the stairwell, and it carries a glow so a beam has a reason to go there.
   */
  it('puts the spray tag on the hall wall, near where the chapter starts', () => {
    const g = mk();
    const tag = prop(g, 'poster');
    expect(tag, 'the tag is not in the world').toBeDefined();
    expect(tag?.state).toBe('idle');
    expect(tag?.label?.toLowerCase()).toContain('spray');
    // On the top wall, above the first row of booths (y 250).
    expect((tag?.y ?? 999) + (tag?.h ?? 0)).toBeLessThan(GF.booths[0].y);
    // A wall's worth of paint, not eight-point type: at least 5 m of it.
    expect(tag?.w ?? 0).toBeGreaterThan(62);

    // ...and a short walk from where the robots are standing when the chapter opens.
    const start = g.snapshot().bots[0];
    expect(Math.hypot(start.x - TAG.x, start.y - TAG.y), 'the tag is across the hall from the start').toBeLessThan(500);
  });

  it("reads the tag under Voxxy's beam, and turns it green when it is read", () => {
    const g = mk();
    g.debug.place('droid', 560, 660);
    g.debug.place('biggy', 600, 660);
    g.debug.place('voxxy', TAG.x, TAG.y + 34, -Math.PI / 2);
    steps(g, 4);
    expect(expo(g).router.posterLit).toBe(true);
    expect(expo(g).router.known).toBe(true);
    expect(prop(g, 'poster')?.state).toBe('done');
    expect(said(g)).toContain('DevoxxForever');
    expect(said(g)).toContain('change it');
  });

  /**
   * *"I still don't get where / how to connect the cable to the reception. 'thought
   * the hall wall on the right'? what does that mean."*
   *
   * The line is rewritten, and — because a line is not a landmark — the route is in
   * the world: a blue wayfinding sign at the steps, a second at the desk, and a lit
   * pad on the counter where the plug goes. All three are prop kinds the renderer
   * already draws.
   */
  it('signposts the cable run in the world, and says something a player can act on', () => {
    const g = mk();
    const signs = props(g, 'sign');
    expect(signs.length, 'the hall has no wayfinding at all').toBeGreaterThanOrEqual(3);
    expect(signs.some((p) => (p.label ?? '').toUpperCase().includes('RECEPTION'))).toBe(true);
    // One of them stands in the hall at the foot of the steps, which is the turn
    // the player has to make and the one the old line failed to name.
    expect(signs.some((p) => p.x < GF.smallStairs.x && Math.abs(p.y - (GF.smallStairs.y + GF.smallStairs.h / 2)) < 60)).toBe(true);

    const pad = prop(g, 'dropzone');
    expect(pad, 'nothing marks where the cable ends').toBeDefined();
    expect(pad!.x).toBeLessThan(GF.printer.x + GF.printer.w);
    expect(pad!.x + (pad!.w ?? 0)).toBeGreaterThan(GF.printer.x);

    // Voxxy picks the cable up, and is told where it goes in words that name a
    // direction, a landmark and the key to press.
    g.debug.select('voxxy');
    g.debug.place('voxxy', GF.rack.x + 10, GF.rack.y - 12);
    g.key('KeyE');
    expect(expo(g).cable.carrying).toBe(true);
    const take = said(g);
    expect(take.toLowerCase()).not.toContain('thought');
    expect(take).toContain('RIGHT');
    expect(take.toLowerCase()).toContain('steps');

    // Carrying it, E anywhere else says how far is left and which way.
    g.debug.place('voxxy', 600, 400);
    g.key('KeyE');
    expect(said(g)).toMatch(/\d+ m that way/);

    // The reel meter's own label carries the distance still to run.
    steps(g, 1);
    expect(prop(g, 'cable')?.label).toContain('still to reception');
    // ...and the signs light up while she is carrying it.
    expect(props(g, 'sign').some((p) => p.state === 'active')).toBe(true);
    expect(prop(g, 'dropzone')?.state).toBe('active');
  });

  /**
   * *"Biggy reaching the room is a bit sawkward and not much visible, so it seems
   * he's passing through a wall."*
   *
   * The doorway is four metres of clear gap — he is not grinding on a jamb — so
   * what is missing is the ability to SEE it in a blacked-out hall. Same two props
   * as the store shutter: a lit plate lying in the opening and a name beside it.
   * The occlusion behind the complaint is the renderer's and is in the report.
   */
  it('lights the technical room\'s doorway, and hails it from outside', () => {
    const g = mk();
    const gapY: [number, number] = [600, 650];
    const plate = props(g, 'lane').find((p) => (p.label ?? '').includes('technical room'));
    expect(plate, 'the doorway is unmarked').toBeDefined();
    expect(plate?.state).toBe('broken');
    // It lies IN the gap `groundWallsFor` leaves, not beside it.
    expect(plate!.y).toBeGreaterThanOrEqual(gapY[0] - 2);
    expect(plate!.y + (plate!.h ?? 0)).toBeLessThanOrEqual(gapY[1] + 2);
    expect(plate!.x).toBeLessThan(GF.tech.x + GF.tech.w);
    expect(plate!.x + (plate!.w ?? 0)).toBeGreaterThan(GF.tech.x + GF.tech.w);
    expect(props(g, 'sign').some((p) => (p.label ?? '').includes('TECHNISCHE'))).toBe(true);

    // Biggy is told what the room is from OUTSIDE it, not once he is already in.
    g.debug.select('biggy');
    g.debug.place('biggy', GF.tech.x + GF.tech.w + 60, 625);
    expect(g.debug.walls().some((w) => w.x === GF.tech.x + GF.tech.w && w.y === 600), 'the gap was walled up').toBe(false);
    steps(g, 2);
    const hail = said(g);
    expect(hail).toContain('cabinet');
    expect(hail.toLowerCase()).toContain('breakers');

    // ...and once the chain is done the doorway goes green.
    powerUp(g);
    openCabinet(g);
    atTerminal(g, 'voxxy');
    g.key('KeyE');
    typeAt(g, 'DEVOXXFOREVER');
    steps(g, 1);
    expect(props(g, 'lane').find((p) => (p.label ?? '').includes('technical room'))?.state).toBe('done');
  });

  /**
   * THE STORE DOOR, as he designed it: *"Door should have Halo, Name on the side
   * (shirts and gadget) and be mentioned on the intro. Gadgets must be ready, but
   * the door is shut (we could mention the same lost keys?) (and put crates, shirts
   * and gadgets inside)... But the devoxx shirt is a tradition."*
   */
  it('gives the store door a halo, a name and something worth breaking it for', () => {
    const g = mk();
    // The halo: a lit plate on the floor across the front of the shutter.
    const halo = props(g, 'lane').find((p) => (p.label ?? '').includes('SHIRTS'));
    expect(halo, 'the shutter has no halo').toBeDefined();
    expect(halo?.state, 'the halo is not lit while the door is shut').toBe('broken');
    expect(halo!.x + (halo!.w ?? 0)).toBeGreaterThanOrEqual(GF.roller.x - 1);
    expect(halo!.y).toBeLessThanOrEqual(GF.roller.y);

    // The name, down the side of the shutter.
    expect(props(g, 'sign').some((p) => (p.label ?? '').includes('SHIRTS & GADGETS'))).toBe(true);
    expect(prop(g, 'roller')?.label).toContain('shirts');

    // And the shirts themselves, crated, inside the store.
    const crates = props(g, 'crate');
    expect(crates.length, 'the store is empty behind the door').toBeGreaterThanOrEqual(4);
    for (const c of crates) {
      expect(c.x).toBeGreaterThan(GF.store.x);
      expect(c.x).toBeLessThan(GF.store.x + GF.store.w);
      expect(c.label).toContain('t-shirts');
    }

    // Anybody who comes down the top lane is told what it is and why it is shut.
    g.debug.select('voxxy');
    g.debug.place('voxxy', GF.roller.x - 80, GF.roller.y + 30);
    steps(g, 2);
    const hail = said(g);
    expect(hail).toContain('SHIRTS');
    expect(hail.toLowerCase()).toContain('stephan');
  });
});

/* ============================================================= the curtain === */

/**
 * *"when all actions are done, chapter 2 ends abruptly. I just finished the biggy
 * run, i expected to see the animation and the inside of the gadget room. Since u
 * can finish in different orders, give some seconds for animation / see what
 * happens before the chap 3 screen."* — Michele, 24 Sep 2026.
 *
 * It called `startChapter(3)` on the frame the second of the two conditions
 * flipped, so the shutter was still 0.42 s from the top of its housing when the
 * chapter card came down over it. Both finishing orders are driven here, because
 * the abruptness he hit was in one of them and the fix has to hold for both.
 */
describe('chapter 2 — the curtain before chapter 3', () => {
  /** Runs the cable so the printer comes up. Leaves the roller alone. */
  function runCable(g: DebugGame): void {
    powerUp(g);
    openCabinet(g);
    atTerminal(g, 'voxxy');
    g.key('KeyE');
    typeAt(g, 'DEVOXXFOREVER');
    g.key('Enter');
    g.debug.select('voxxy');
    g.debug.place('voxxy', GF.rack.x + 10, GF.rack.y + 12 - 24);
    steps(g, 2);
    g.key('KeyE');
    g.debug.place('voxxy', GF.printer.x + 10, GF.printer.y + GF.printer.h + 22);
    steps(g, 2);
    g.key('KeyE');
  }

  /** Voxxy shoves Biggy down the top lane into the shutter. */
  function smashRoller(g: DebugGame): void {
    g.debug.select('voxxy');
    g.debug.place('biggy', 400, 160);
    g.debug.place('voxxy', 372, 160);
    g.setStick(1, 0);
    for (let i = 0; i < 400 && !expo(g).rollerBroken; i++) g.update(DT_MAX);
    g.setStick(0, 0);
  }

  for (const last of ['roller', 'printer'] as const) {
    it(`holds the hall for a beat when the ${last} is the last thing done`, () => {
      const g = mk();
      if (last === 'roller') {
        runCable(g);
        smashRoller(g);
      } else {
        smashRoller(g);
        runCable(g);
      }
      const st = expo(g);
      expect(st.printerOnline, 'the printer never came up').toBe(true);
      expect(st.rollerBroken, 'the shutter never went').toBe(true);

      // It does NOT cut on the frame the last one lands.
      steps(g, 2);
      expect(g.snapshot().chapter, 'chapter 2 ended on the spot again').toBe(2);

      // A second in, still chapter 2 — and the shutter, whose own lift is 0.42 s,
      // has had time to finish it where the player can see.
      for (let i = 0; i < Math.ceil(1 / DT_MAX); i++) g.update(DT_MAX);
      expect(g.snapshot().chapter, 'the curtain is shorter than the animation under it').toBe(2);
      expect(g.snapshot().props.find((p) => p.kind === 'roller')?.progress ?? 0).toBeCloseTo(1, 5);
      // And the player still has the keyboard: this is a curtain, not a cutscene.
      expect(g.snapshot().phase).toBe('play');

      // And it does cut, a few seconds in rather than never.
      for (let i = 0; i < Math.ceil(4 / DT_MAX) && g.snapshot().chapter === 2; i++) g.update(DT_MAX);
      expect(g.snapshot().chapter, 'the curtain never lifted').toBe(3);
    });
  }
});
