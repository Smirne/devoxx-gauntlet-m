/**
 * main.ts — the entry point: the game, the diorama, the HUD, the audio and the
 * keyboard, tied together by one requestAnimationFrame loop.
 *
 * Everything in here is *glue*. `src/sim` owns the game state and `src/render`
 * owns the pixels (CLAUDE.md); this file owns neither, and the only decisions it
 * makes are which key maps to which stick axis and what the debug URL says.
 *
 * ## The debug URL API
 *
 * The gauntlet's critics drive the build through the address bar, so a fidelity
 * screenshot is deterministic and needs no automation client:
 *
 *   ?chapter=N   start in chapter 1..4, skipping the title card
 *   ?topdown=1   the flat plan-view debug camera of the current floor. The sim
 *                rect 0,0..1900,700 is drawn at its own 19:7 aspect, anchored to
 *                the canvas' TOP-LEFT corner — not centred, because a headless
 *                screenshot is taken at the window size while the page is laid
 *                out in a shorter viewport, and a centred band then lands at an
 *                offset the image alone cannot tell you. Anchored, the mapping is
 *                exact: image (px, py) is sim (px * 1900/w, py * 700/h) over the
 *                drawn band, with no offset to guess.
 *   ?nofog=1     drop the fog-of-war mask only
 *   ?seed=N      seed the sim RNG, so clue digits and crowds replay exactly
 *   ?warm=N      advance the sim N fixed steps before the first drawn frame
 *   ?pose=voxxy|droid|biggy   one robot alone, front three-quarter, on a plinth
 *   ?nohud=1     hide the DOM overlay
 *
 * ## Error reporting
 *
 * The first thing this module does is take over `window.onerror`,
 * `window.onunhandledrejection` and `console.error`, append every line to
 * `<pre id="console-log" hidden>` and write the running count into
 * `document.title`. A critic reads "no console errors" (GAUNTLET.md §4) straight
 * out of `--dump-dom` without a devtools protocol client.
 */

import './style.css';

import { flairPhase } from './sim/bot';
import { DT_MAX } from './sim/constants';
import { createGame, type DebugGame } from './sim/game';
import type { GameSnapshot, RobotKind } from './sim/types';
import { PX_PER_M, ROBOT_HEIGHT_M } from './sim/units';

import { createAudio, type Audio } from './render/audio';
import { createHud, type Hud, type SpeakerAnchors } from './render/hud';
import { STEP_FREQ_BASE, STEP_FREQ_PER_MPS, gaitSpeed } from './render/robots';
import { createScene, type DioramaScene } from './render/scene';

/* ====================================================== error reporting ==== */

const TITLE_BASE = 'After Dark · ERRORS:';
const errors: string[] = [];
let logEl: HTMLPreElement | null = null;

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack ?? ''}`;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function recordError(line: string): void {
  errors.push(line);
  if (logEl) logEl.textContent = `${logEl.textContent ?? ''}${line}\n`;
  document.title = TITLE_BASE + errors.length;
}

function installErrorReporting(): void {
  const pre = document.createElement('pre');
  pre.id = 'console-log';
  pre.hidden = true;
  logEl = pre;
  const attach = (): void => {
    if (document.body && !pre.isConnected) document.body.appendChild(pre);
  };
  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach, { once: true });

  document.title = `${TITLE_BASE}0`;

  const original = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    recordError(`console.error: ${args.map(fmt).join(' ')}`);
    // Never swallow it: the devtools console is still the first place a human looks.
    original(...args);
  };

  window.onerror = (message, source, lineno, colno, error): boolean => {
    recordError(`window.onerror: ${error ? fmt(error) : String(message)} @ ${source ?? '?'}:${lineno ?? 0}:${colno ?? 0}`);
    return false;
  };

  window.onunhandledrejection = (ev: PromiseRejectionEvent): void => {
    recordError(`unhandledrejection: ${fmt(ev.reason)}`);
  };
}

installErrorReporting();

/* ============================================================ debug URL ==== */

const params = new URLSearchParams(window.location.search);

function flag(name: string): boolean {
  const v = params.get(name);
  return v !== null && v !== '0' && v !== 'false' && v !== '';
}

function int(name: string): number | undefined {
  const v = params.get(name);
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

const KINDS: readonly RobotKind[] = ['voxxy', 'droid', 'biggy'];
const poseParam = params.get('pose');
const pose: RobotKind | null = KINDS.includes(poseParam as RobotKind) ? (poseParam as RobotKind) : null;

const chapterParam = int('chapter');
const startIn = chapterParam !== undefined && chapterParam >= 1 && chapterParam <= 4 ? chapterParam : undefined;
const seed = int('seed');
const warm = Math.max(0, Math.min(int('warm') ?? 0, 20000));
const wantTopDown = flag('topdown');
const wantFog = !flag('nofog');
const hideHud = flag('nohud');

/* =============================================================== the app === */

const app: HTMLElement = document.getElementById('app') ?? document.body;

const canvas = document.createElement('canvas');
canvas.id = 'scene';
canvas.tabIndex = 0;
app.appendChild(canvas);

/** The chapter fade: `GameSnapshot.fade`, 0 clear to 1 black, under the HUD. */
const fadeEl = document.createElement('div');
fadeEl.id = 'fade';
app.appendChild(fadeEl);

if (hideHud) document.body.classList.add('ad-nohud');

const game: DebugGame = createGame({
  seed,
  chapter: startIn,
  // A portrait shot is not a play session: no title card to dismiss.
  cards: pose === null,
});

const scene: DioramaScene = createScene(canvas);
const hud: Hud = createHud(app, { onSkip: () => game.skipChapter() });
const audio: Audio = createAudio();

scene.setFogEnabled(wantFog);
scene.setTopDown(wantTopDown);
scene.posePortrait(pose);

function resize(): void {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  scene.resize(w, h);
}
resize();
window.addEventListener('resize', resize);

/* ================================================================ input ==== */

/** Which movement keys are down. The stick is their sum, normalised by the sim. */
const held = { up: false, down: false, left: false, right: false };

const MOVE: Readonly<Record<string, keyof typeof held>> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

function pushStick(): void {
  game.setStick((held.right ? 1 : 0) - (held.left ? 1 : 0), (held.down ? 1 : 0) - (held.up ? 1 : 0));
}

let muted = false;

/** Reused every frame: the three robots' screen positions for the HUD's bubbles. */
const anchors: SpeakerAnchors = {};

/**
 * `KeyboardEvent.code` is what the sim speaks, but a synthetic event dispatched by
 * a test harness often carries only `key`. Falling back to a `key`-derived code
 * means a scripted `Tab`, `1` or `7` reaches the game exactly as a real key press
 * would, instead of being silently dropped.
 */
function codeOf(ev: KeyboardEvent): string {
  /*
   * THE NUMERIC KEYPAD IS A KEYPAD.
   *
   * Michele, at chapter 1's fire door: *"This part does not takes number input
   * with keypad, why?"* Because the sim only ever heard `Digit4`, and a numeric
   * keypad sends `Numpad4`. A player typing a door code on the number pad is
   * doing the most natural thing there is, and the game ignored every key.
   *
   * Normalised here rather than in the chapter, because it is not a chapter's
   * business which of two physical keys a digit came from — this file owns the
   * keyboard and nothing else should have to know. It also means the numpad
   * selects robots like the top row, which is what a player pressing numpad 1
   * expects. `NumpadEnter` and the operators are left alone; they are not digits.
   */
  if (ev.code && /^Numpad[0-9]$/.test(ev.code)) return `Digit${ev.code.slice(6)}`;
  if (ev.code) return ev.code;
  const k = ev.key;
  if (!k) return '';
  if (k.length === 1 && k >= '0' && k <= '9') return `Digit${k}`;
  if (k.length === 1) {
    const up = k.toUpperCase();
    if (up >= 'A' && up <= 'Z') return `Key${up}`;
    if (k === ' ') return 'Space';
  }
  if (k === 'Tab' || k === 'Enter' || k === 'Escape') return k === 'Escape' ? 'Escape' : k;
  if (k.startsWith('Arrow')) return k;
  return k;
}

function onKeyDown(ev: KeyboardEvent): void {
  const code = codeOf(ev);
  /*
   * While the sim has the keyboard (chapter 2's router terminal — `snapshot().typing`)
   * the movement keys are letters, not a stick. `DevoxxForever` starts with a `D`,
   * and without this the first character of the password walks the robot out of
   * reach of the terminal it is being typed into. Key-UP is never suppressed, or a
   * key held when the prompt opened would stay held for ever.
   */
  const axis = game.snapshot().typing ? undefined : MOVE[code];
  if (axis) {
    held[axis] = true;
    pushStick();
    ev.preventDefault();
  }
  // Tab cycles the driven robot, so it must never move focus out of the game.
  if (code === 'Tab' || code === 'Space') ev.preventDefault();
  // Backspace at the terminal must edit the password, not walk the browser back.
  if (code === 'Backspace' && game.snapshot().typing) ev.preventDefault();
  if (ev.repeat) return;
  if (code === 'KeyM') {
    muted = !muted;
    audio.mute(muted);
  }
  // Everything the sim understands, plus whatever dismisses a card ("press any key").
  game.key(code);
}

function onKeyUp(ev: KeyboardEvent): void {
  const axis = MOVE[codeOf(ev)];
  if (axis) {
    held[axis] = false;
    pushStick();
    ev.preventDefault();
  }
}

function releaseAll(): void {
  held.up = held.down = held.left = held.right = false;
  pushStick();
}

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', releaseAll);

/* =============================================================== audio ===== */

/**
 * Footsteps are derived, not scripted: the sim gives a speed, `gaitSpeed` maps it
 * to the speed the legs actually run at, and the step frequency is the gait's own
 * (`src/render/robots/gait.ts`). Two steps per cycle, so a crossing of every half
 * turn of the phase is one planted foot.
 */
const stepPhase: Record<RobotKind, number> = { voxxy: 0, droid: 0, biggy: 0 };
let ambientChapter = -1;
let lastPhase = '';
/** Last frame's fall progress on chapter 1's jammed door, so the crash plays once. */
let lastBreak = 0;
/** Last frame's swing on chapter 1's fire door, so the opening plays once. */
let lastFireSwing = 0;
/** Last frame's rise on chapter 2's roller door, so the shutter plays once. */
let lastRollerRise = 0;
/**
 * What chapter 1's keypad was showing last frame.
 *
 * `audio.ts` has carried a written, tuned `keypad` cue — with `semitones`, so the
 * digits are not all one note — since the day it was added, and it had never been
 * played: the one object in the game you type into answered in silence. The prop's
 * `label` is `entered.padEnd(4, '_')`, so the digits are the label with the
 * underscores taken off, and every edge below is a change in THAT string. The sim
 * owns the code and the entry; nothing here decides anything.
 */
let lastEntered = '';
/**
 * A whole-tone ladder, one rung per digit, `4` at the base — chapter 1 accepts 4
 * to 9 and nothing else, so those six are the ones that have to be told apart by
 * ear. The others are mapped anyway rather than left to collapse onto one pitch.
 */
const KEY_SEMIS = [-8, -6, -4, -2, 0, 2, 4, 6, 8, 10];
/** Last frame's swing on chapter 1's cinema-B door, so the maglock plays once. */
let lastLockSwing = 0;
/** Last frame's swing on chapter 2's router cabinet, so the hinges play once. */
let lastCabinetSwing = 0;
/** Last frame's swing on chapter 3's registration gate, so the hook plays once. */
let lastGateSwing = 0;
/** Last frame's flourish per robot, so a party trick's cue plays once. */
const lastFlair: Record<RobotKind, number> = { voxxy: 0, droid: 0, biggy: 0 };
/**
 * How many clues were solved last frame, and who was being driven, and who was
 * riding — the three edges below.
 *
 * `audio.ts` has carried a written, tuned and **never played** `clue` cue since the
 * day it was added: the sim knew a light-mix enigma had resolved, the marker drew
 * its digit, and the room stayed silent. Michele, 24 Sep 2026: *"Add sound effect
 * when a Hint is solved."* A digit surfacing out of the dark is the single best
 * moment chapter 1 has and it was the one moment with nothing on it.
 *
 * The count, not a per-clue flag, because `snap.clues` is rebuilt every chapter and
 * a chapter change would otherwise fire four cues at once; it is reset below with
 * the ambient bed. Clues are only ever found, never un-found, so a rising count is
 * exactly one clue solved.
 */
let lastFound = 0;
let lastActive = -1;
let lastMounted = false;

function updateAudio(snap: GameSnapshot, dt: number): void {
  // The only thing in the game a robot destroys. `Prop.progress` leaving zero is
  // the sim saying it has just been hit, and `crash` has been written and unplayed
  // in `audio.ts` since it was added.
  const breaking = snap.props.find((p) => p.kind === 'jammed')?.progress ?? 0;
  if (breaking > 0 && lastBreak <= 0) audio.play('crash', { intensity: 1 });
  lastBreak = breaking;

  // The keypad's payoff. `Prop.progress` leaving zero is the sim saying the magnetic
  // lock has just let go, and the cue runs about as long as `FIRE_SWING_TIME`. The
  // chapter deliberately holds the corridor for the swing before the cutscene takes
  // over, so this is heard over the thing it describes rather than under a fade.
  const swinging = snap.props.find((p) => p.kind === 'firedoor')?.progress ?? 0;
  if (swinging > 0 && lastFireSwing <= 0) audio.play('door-open');
  lastFireSwing = swinging;

  // The store's shutter, on the same edge. `shutter` carries its own impact, so the
  // roller break does NOT also play `crash` — that stays on chapter 1's jammed door.
  const rising = snap.props.find((p) => p.kind === 'roller')?.progress ?? 0;
  if (rising > 0 && lastRollerRise <= 0) audio.play('shutter');
  lastRollerRise = rising;

  /*
   * The keypad, one cue per keystroke.
   *
   * Three different things can happen to the entry and they have to sound
   * different, because the player cannot see the object closely while driving:
   * a digit lands (pitched off the digit itself), a digit is taken back, and a
   * wrong code clears the whole entry — which is the only one that must not be
   * mistakable for progress, so it answers low and twice.
   */
  const pad = snap.props.find((p) => p.kind === 'keypad');
  const entered = (pad?.label ?? '').replace(/_/g, '');
  if (entered.length > lastEntered.length) {
    const digit = Number(entered[entered.length - 1]);
    audio.play('keypad', { semitones: KEY_SEMIS[digit] ?? 0 });
  } else if (entered.length < lastEntered.length) {
    /*
     * Backspace, or the whole entry cleared by a wrong code. `state` is still
     * 'idle' either way, so the LENGTH is what tells them apart — and it is 3,
     * not 4: `ch1-night.ts:861` tests the code and clears `entered` inside the
     * same key press, so a wrong fourth digit never reaches a snapshot and the
     * entry goes 3 to 0 in one frame. That is also why a rejected fourth digit
     * has no keystroke cue of its own: the rejection is the answer to it.
     */
    const wrong = entered.length === 0 && lastEntered.length === 3;
    audio.play('keypad', { semitones: -14, gain: 0.9 });
    if (wrong) audio.play('keypad', { semitones: -17, gain: 0.9, delay: 0.11 });
  }
  lastEntered = entered;

  // Cinema B's magnetic lock, released from the projector panel. The prop is
  // published in BOTH states now — it used to stop existing the moment it opened,
  // which made the payoff of the whole mount beat a door that silently ceased to
  // be — so `state === 'open'` is what picks it out of the four cinema doors
  // chapter 1 draws. A, C and D are scenery and never carry a clock.
  const unlocking = snap.props.find((p) => p.kind === 'lock' && p.state === 'open')?.progress ?? 0;
  if (unlocking > 0 && lastLockSwing <= 0) audio.play('maglock');
  lastLockSwing = unlocking;

  // Biggy shouldering the router cabinet open, on hinges seized since 2019. Two
  // leaves, so the cue has two stops in it; it is the one cue whose middle is
  // louder than its ends.
  const shouldering = snap.props.find((p) => p.kind === 'cabinet')?.progress ?? 0;
  if (shouldering > 0 && lastCabinetSwing <= 0) audio.play('cabinet');
  lastCabinetSwing = shouldering;

  // Stephan opening the stairs for the day: a hook off an eye, and nothing hits.
  // The chapter holds the hall for the whole swing before the exit cutscene, so
  // this is heard over the thing it describes rather than under a fade.
  const opening = snap.props.find((p) => p.kind === 'gate')?.progress ?? 0;
  if (opening > 0 && lastGateSwing <= 0) audio.play('gate');
  lastGateSwing = opening;

  /*
   * The party tricks on `E`.
   *
   * `flairPhase` is the sim's own clock (`src/sim/bot.ts`), the same number the rig
   * poses from — so the cue rides the edge of a value the sim already owns and
   * nothing here schedules an animation. Voxxy's hop is not in this list: she lands
   * with a footstep, which is the right sound for a hop and is already playing.
   */
  for (const b of snap.bots) {
    const f = flairPhase(b);
    if (f > 0 && lastFlair[b.kind] <= 0) {
      if (b.kind === 'biggy') audio.play('roll');
      else if (b.kind === 'droid') audio.play('stretch');
    }
    lastFlair[b.kind] = f;
  }

  /*
   * A hint solved: the digit's own cue, and — when it was the LAST one — the
   * "job done" arpeggio a beat later, so the set completing sounds different from
   * the four steps that got there. `chime` had also never been played.
   */
  const found = snap.clues.reduce((n, c) => n + (c.found ? 1 : 0), 0);
  if (found > lastFound) {
    audio.play('clue');
    if (snap.clues.length > 0 && found === snap.clues.length) audio.play('chime', { delay: 0.32 });
  }
  lastFound = found;

  // Two more cues that were written and silent: the switcher, and Droid going up.
  if (snap.active !== lastActive) {
    if (lastActive >= 0) audio.play('switch');
    lastActive = snap.active;
  }
  const mounted = snap.bots.some((b) => b.mounted);
  if (mounted && !lastMounted) audio.play('mount');
  lastMounted = mounted;
  if (snap.chapter !== ambientChapter) {
    ambientChapter = snap.chapter;
    // A fresh chapter brings a fresh set of clues, already at zero found; without
    // this, restarting chapter 1 after solving it would count four solves at once.
    lastFound = snap.clues.reduce((n, c) => n + (c.found ? 1 : 0), 0);
    // Same reason, for every door: a chapter's props arrive shut, and a restart
    // must not carry the previous run's swing across and swallow the next cue.
    // The three older edges had this bug — replay chapter 1 after breaking the
    // jammed door and the crash was silent the second time.
    lastBreak = 0;
    lastFireSwing = 0;
    lastRollerRise = 0;
    lastEntered = '';
    lastLockSwing = 0;
    lastCabinetSwing = 0;
    lastGateSwing = 0;
    audio.setAmbient(snap.chapter);
    if (snap.chapter > 1) audio.play('transition');
  }
  if (snap.phase !== lastPhase) {
    if (snap.phase === 'done') audio.play('victory');
    lastPhase = snap.phase;
  }
  for (const b of snap.bots) {
    if (b.mounted) continue;
    const v = gaitSpeed(Math.hypot(b.vx, b.vy) / PX_PER_M);
    if (v < 0.12) {
      stepPhase[b.kind] = 0;
      continue;
    }
    const before = stepPhase[b.kind];
    const after = before + (STEP_FREQ_BASE + STEP_FREQ_PER_MPS * v) * dt;
    stepPhase[b.kind] = after % 1;
    if (Math.floor(after * 2) > Math.floor(before * 2)) {
      audio.footstep(b.kind, Math.min(1, v / 2.6));
    }
  }
}

/* ================================================================= loop ==== */

// `?warm=N`: settle the world before the first drawn frame, so a screenshot shows
// a chapter in progress rather than its first tick.
//
// A chapter that opens on a card has its sim paused until a key arrives, so the
// warm-up dismisses one exactly as a player would. Without this, `?warm=` on
// chapters 2-4 advances nothing and the shot is of a modal, not of the game.
for (let i = 0; i < warm; i++) {
  if (game.snapshot().card !== null) game.key('Space');
  game.update(DT_MAX);
}

let last = performance.now();
let raf = 0;
let lastFade = -1;

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(Math.max((now - last) / 1000, 0), DT_MAX);
  last = now;

  /*
   * A KEY THAT IS STILL DOWN WHEN THE SIM TAKES THE KEYBOARD.
   *
   * Michele, chapter 2: *"Password not matching: I don't know what was happening,
   * but i kept typing and it never took it right."* The matching was never the
   * problem — measured on the built page, `DevoxxForever` goes in under caps lock,
   * held shift, overlapping keydowns and auto-repeat. The stick was.
   *
   * `onKeyDown` suppresses a movement keydown while `typing`, so `held[axis]` is
   * never set, so nothing ever balances it and `pushStick()` is never called: the
   * stick keeps whatever value it had when the prompt opened, for as long as the
   * key is physically down. Traced in the built page, Voxxy accelerated from 11 to
   * 41 px/s over 2.5 s with the router prompt open and walked out of the terminal's
   * reach — which closes the prompt, silently, and from there every letter of the
   * password is a control again. The two `R`s in `DevoxxForever` restart the run.
   *
   * The chapter now pins the robot at an open prompt, so the run no longer depends
   * on this. This is the other half: the stale stick is dropped rather than paid
   * out the instant the prompt closes, exactly as `blur` already does it.
   */
  if (game.snapshot().typing && (held.up || held.down || held.left || held.right)) releaseAll();

  game.update(dt);
  const snap = game.snapshot();

  scene.render(snap, dt);
  if (!hideHud) {
    // Where each robot is on the canvas, so the HUD can hang that robot's spoken
    // line over its head instead of in a text row at the bottom of the screen.
    for (const key of Object.keys(anchors) as RobotKind[]) delete anchors[key];
    for (const b of snap.bots) {
      const at = scene.project(b.x, b.y, ROBOT_HEIGHT_M[b.kind] + 0.25);
      if (at) anchors[b.kind] = at;
    }
    hud.update(snap, anchors);
  }
  updateAudio(snap, dt);

  if (Math.abs(snap.fade - lastFade) > 0.004) {
    lastFade = snap.fade;
    fadeEl.style.opacity = snap.fade.toFixed(3);
  }
}

raf = requestAnimationFrame(frame);

/* ========================================================= debug handle ==== */

export interface AfterDarkHandle {
  game: DebugGame;
  snapshot(): GameSnapshot;
  startChapter(n: number): void;
  topDown(on: boolean): void;
  fog(on: boolean): void;
  portrait(kind: RobotKind | null): void;
  /** Every line the error reporter has caught, live. `document.title` carries the count. */
  errors: string[];
  dispose(): void;
}

const handle: AfterDarkHandle = {
  game,
  snapshot: () => game.snapshot(),
  startChapter: (n: number) => game.startChapter(n),
  topDown: (on: boolean) => scene.setTopDown(on),
  fog: (on: boolean) => scene.setFogEnabled(on),
  portrait: (kind: RobotKind | null) => scene.posePortrait(kind),
  errors,
  dispose(): void {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseAll);
    hud.dispose();
    audio.dispose();
    scene.dispose();
  },
};

declare global {
  interface Window {
    __afterdark?: AfterDarkHandle;
  }
}

window.__afterdark = handle;
