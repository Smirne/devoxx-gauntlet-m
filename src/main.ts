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
  const axis = MOVE[code];
  if (axis) {
    held[axis] = true;
    pushStick();
    ev.preventDefault();
  }
  // Tab cycles the driven robot, so it must never move focus out of the game.
  if (code === 'Tab' || code === 'Space') ev.preventDefault();
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

function updateAudio(snap: GameSnapshot, dt: number): void {
  // The only thing in the game a robot destroys. `Prop.progress` leaving zero is
  // the sim saying it has just been hit, and `crash` has been written and unplayed
  // in `audio.ts` since it was added.
  const breaking = snap.props.find((p) => p.kind === 'jammed')?.progress ?? 0;
  if (breaking > 0 && lastBreak <= 0) audio.play('crash', { intensity: 1 });
  lastBreak = breaking;
  if (snap.chapter !== ambientChapter) {
    ambientChapter = snap.chapter;
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
