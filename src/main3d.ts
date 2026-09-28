/**
 * main3d.ts — the full-3D proof of concept's entry point (`3d.html`).
 *
 * Same sim, same HUD, same audio as the 2.5D diorama (`src/main.ts`); a
 * different renderer (`src/render3d`): a third-person camera inside the
 * building, an HDR pipeline with reflections, volumetric light, bloom and a
 * filmic grade. Chapter 1 only — the closed cinema section is what this proof
 * of concept builds; the chapter-2 hand-off shows an end card.
 *
 * ## Debug URL
 *
 *   ?q=low|medium|high|ultra   render quality (default high)
 *   ?seed=N                    sim RNG seed
 *   ?warm=N                    sim steps before the first frame
 *   ?nohud=1                   hide the DOM overlay
 *   ?shot=1                    no animation loop; `window.__ad3d.step()` drives
 *                              frames, for deterministic screenshots
 *
 * Controls: WASD / arrows (camera-relative), mouse to look (click to lock the
 * pointer), wheel to zoom, 1/2/3/Tab to switch robot, E use/climb, Space tow,
 * 4–9 at the keypad, P photo mode (hide the HUD), M mute.
 */

import './style.css';

import { Vector3 } from 'three';

import { DT_MAX } from './sim/constants';
import { createGame, type DebugGame } from './sim/game';
import type { RobotKind } from './sim/types';
import { ROBOT_HEIGHT_M } from './sim/units';

import { createAudio, type Audio } from './render/audio';
import { createCues } from './render/cues';
import { createHud, type Hud, type SpeakerAnchors } from './render/hud';
import type { QualityName } from './render3d/pipeline';
import { CLUE_SPOT_3D } from './render3d/props3d';
import { createWorld3D, type World3D } from './render3d/world';
import { installHudTheme } from './render3d/hudTheme';
import { fillSplash } from './render3d/splash';

/* ====================================================== error reporting ==== */

const TITLE_BASE = 'After Dark 3D · ERRORS:';
const errors: string[] = [];
function recordError(line: string): void {
  errors.push(line);
  document.title = TITLE_BASE + errors.length;
}
{
  document.title = `${TITLE_BASE}0`;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    recordError(`console.error: ${args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' ')}`);
    original(...args);
  };
  window.onerror = (message, source, lineno, colno, error): boolean => {
    recordError(`window.onerror: ${error ? error.message : String(message)} @ ${source ?? '?'}:${lineno ?? 0}:${colno ?? 0}`);
    return false;
  };
  window.onunhandledrejection = (ev: PromiseRejectionEvent): void => recordError(`unhandledrejection: ${String(ev.reason)}`);
}

/* ============================================================ debug URL ==== */

const params = new URLSearchParams(window.location.search);
const flag = (n: string): boolean => {
  const v = params.get(n);
  return v !== null && v !== '0' && v !== 'false' && v !== '';
};
const int = (n: string): number | undefined => {
  const v = params.get(n);
  if (v === null || v === '') return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? Math.trunc(x) : undefined;
};
const Q: QualityName[] = ['low', 'medium', 'high', 'ultra'];
const Q_KEY = 'afterdark3d.quality';
function storedQuality(): QualityName | null {
  try {
    const v = window.localStorage.getItem(Q_KEY) as QualityName | null;
    return v && Q.includes(v) ? v : null;
  } catch {
    return null;
  }
}
const qParam = params.get('q') as QualityName | null;
const quality: QualityName = qParam && Q.includes(qParam) ? qParam : storedQuality() ?? 'high';
const shotMode = flag('shot');
const hideHud = flag('nohud') || (shotMode && !flag('hud'));
const warm = Math.max(0, Math.min(int('warm') ?? 0, 20000));

/* =============================================================== the app === */

const app: HTMLElement = document.getElementById('app') ?? document.body;
const canvas = document.createElement('canvas');
canvas.id = 'scene';
canvas.tabIndex = 0;
app.appendChild(canvas);
const fadeEl = document.createElement('div');
fadeEl.id = 'fade';
app.appendChild(fadeEl);
if (hideHud) document.body.classList.add('ad-nohud');
installHudTheme();

// Play starts with the sim's opening (the crates), exactly as the 2.5D page
// does: no chapter, cards on. Screenshot runs go straight to chapter 1 unless
// they ask for the opening with ?cards=1.
const withOpening = !shotMode || flag('cards');
const game: DebugGame = createGame({ seed: int('seed'), chapter: withOpening ? undefined : (int('chapter') ?? 1), cards: withOpening, clueSpot: CLUE_SPOT_3D });

/*
 * A black "press any key" gate before the opening. Browsers hold audio until a
 * key or click, and the opening now has a score (Michele: "there should be
 * music also in the animation") — without the gate the first key both started
 * the music and skipped the scene. The gate eats that key; the opening then
 * plays from its first frame. The full splash comes back later (Michele,
 * 28 Sep: "the splash should come back, but we'll work on that later").
 */
let titleUp = withOpening && !shotMode;
const titleEl = document.createElement('div');
titleEl.className = 'ad3d-title ad3d-gate';
const stopSplash = titleUp ? fillSplash(titleEl) : (): void => undefined;
if (titleUp) app.appendChild(titleEl);
/**
 * When the gate went, ms. For `GATE_GRACE` after it the opening ignores keys:
 * a player mashing to get past the gate otherwise skipped the opening with the
 * second press (Michele, 28 Sep: "add a tolerance for keypress").
 */
let gateOffAt = -Infinity;
const GATE_GRACE = 1500;
function dismissTitle(): void {
  if (!titleUp) return;
  titleUp = false;
  stopSplash();
  titleEl.remove();
  gateOffAt = performance.now();
}
const world: World3D = createWorld3D(canvas, { quality, preserveDrawingBuffer: shotMode });
const hud: Hud = createHud(app, {
  onSkip: () => game.skipChapter(),
  // The hint's ring and off-screen arrow are drawn at a sim point, which only
  // the renderer can put on the canvas (same hook as the 2.5D page).
  project: (x, y, h) => world.projectHint(x, y, h ?? 0),
});
const audio: Audio = createAudio();

function resize(): void {
  world.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
}
resize();
window.addEventListener('resize', resize);

/* ================================================================ input ==== */

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


/**
 * The sim's stick, from held keys — refreshed every frame.
 *
 * W walks and S backs up along the robot's own heading; A and D turn it, on the
 * spot when standing, steering while it walks. The first W from standing still
 * goes where the camera looks, so the mouse chooses a direction.
 *
 * This replaced camera-relative WASD (28 Sep). Michele: *"sometimes it loses the
 * frontal view, and I didn't change it. Usually when moving and rotating?"* With a
 * camera-relative stick, D while walking sent the robot sideways, and the camera
 * could not follow it round without chasing its own stick into a circle, so it
 * held back (a 55° cone in `ThirdPersonCamera.update`) and was left looking at
 * the robot's flank. Steering the heading instead makes the stick independent of
 * the camera, so the camera can always settle behind. It is also what his two
 * earlier asks had been reaching for: A/D alone turn in place (24 Sep), S walks
 * backwards keeping the facing (28 Sep).
 */
function pushStick(dt: number): void {
  const fwd = (held.up ? 1 : 0) - (held.down ? 1 : 0);
  const strafe = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (fwd === 0 && strafe === 0) {
    steer = null;
    game.setStick(0, 0);
    return;
  }
  const snap = game.snapshot();
  const b = snap.bots[snap.active] ?? snap.bots[0];
  const moving = Math.hypot(b.vx, b.vy) > 8;
  if (fwd === 0) {
    // Turning on the spot. A robot still rolling is let go first; `Game.turn`
    // only turns one that has stopped.
    steer = null;
    game.setStick(0, 0);
    game.turn?.(strafe * TURN_RATE * dt);
    // The camera turns with her.
    let d = Math.atan2(-Math.cos(b.face), -Math.sin(b.face)) - world.cam.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    world.cam.yaw += d * Math.min(1, dt * 6);
    return;
  }
  if (steer === null) steer = fwd > 0 && !moving ? Math.atan2(-Math.cos(world.cam.yaw), -Math.sin(world.cam.yaw)) : b.face;
  steer += strafe * TURN_RATE * dt;
  const cx = Math.cos(steer);
  const cy = Math.sin(steer);
  // Backing up keeps the heading: the lamp stays on its mark (see `holdHeading`).
  if (fwd < 0) game.setStick(-cx, -cy, steer);
  else game.setStick(cx, cy);
}

/** A/D turn rate, rad/s, standing or walking. */
const TURN_RATE = 2.4;
/** The heading W/S drive along while held (sim radians); null between presses. */
let steer: number | null = null;

function codeOf(ev: KeyboardEvent): string {
  if (ev.code && /^Numpad[0-9]$/.test(ev.code)) return `Digit${ev.code.slice(6)}`;
  if (ev.code) return ev.code;
  const k = ev.key;
  if (k.length === 1 && k >= '0' && k <= '9') return `Digit${k}`;
  if (k.length === 1 && /[a-z]/i.test(k)) return `Key${k.toUpperCase()}`;
  if (k === ' ') return 'Space';
  return k;
}

let muted = false;
/** `N` — the score only, on top of `muted`. */
let musicOff = false;
let photo = false;

window.addEventListener('keydown', (ev) => {
  const code = codeOf(ev);
  if (titleUp) {
    dismissTitle();
    ev.preventDefault();
    return;
  }
  if (game.snapshot().opening && (ev.repeat || performance.now() - gateOffAt < GATE_GRACE)) {
    ev.preventDefault();
    return;
  }
  // With the run sheet open, left/right turn its page (the night / this
  // chapter) instead of steering.
  if ((code === 'ArrowLeft' || code === 'ArrowRight') && hud.pageTasks(code === 'ArrowLeft' ? -1 : 1)) {
    ev.preventDefault();
    return;
  }
  // On the story page any other key turns to this chapter's briefing, and
  // does nothing else — it is a page turn, not a step or an action.
  if (!ev.repeat && !SHEET_KEEPS.has(code) && hud.turnStory()) {
    ev.preventDefault();
    return;
  }
  const axis = game.snapshot().typing ? undefined : MOVE[code];
  if (axis) {
    held[axis] = true;
    ev.preventDefault();
  }
  if (code === 'Tab' || code === 'Space') ev.preventDefault();
  if (ev.repeat) return;
  if (code === 'KeyM') {
    muted = !muted;
    audio.mute(muted);
  }
  // The 2.5D page's overlay keys, the same way: N the score on its own, I the
  // run sheet, H the escalating hint, Escape closes the sheet. The sim never
  // hears I/H; both letters are in the keypad password, hence `typing`.
  if (code === 'KeyN') {
    musicOff = !musicOff;
    audio.muteMusic(musicOff);
  }
  if (!game.snapshot().typing) {
    if (code === 'KeyI') hud.toggleTasks();
    if (code === 'KeyH') hud.nudge();
  }
  // Any other key closes the sheet too — the one that opens at chapter start
  // used to need Escape, I or a click outside (Michele: "I thought any key would
  // do"). Only the overlay keys that act on the sheet or the view leave it open;
  // a movement key closes it and moves.
  if (!SHEET_KEEPS.has(code)) hud.closeTasks();
  // Q cycles the render quality. The pipeline is built for one quality, so the
  // choice is remembered and the page reloads into it.
  if (code === 'KeyQ' && !game.snapshot().typing) {
    const next = Q[(Q.indexOf(quality) + 1) % Q.length];
    try {
      window.localStorage.setItem(Q_KEY, next);
    } catch {
      /* no storage: the URL's ?q= still works */
    }
    window.location.reload();
    return;
  }
  if (code === 'KeyP') {
    photo = !photo;
    world.photo = photo;
    document.body.classList.toggle('ad-nohud', photo || hideHud);
  }
  game.key(code);
});
/** Keys that leave the run sheet open: I and H act on it; mute, music, photo and quality are about the view. */
const SHEET_KEEPS = new Set(['KeyI', 'KeyH', 'KeyM', 'KeyN', 'KeyP', 'KeyQ', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);
window.addEventListener('keyup', (ev) => {
  const axis = MOVE[codeOf(ev)];
  if (axis) {
    held[axis] = false;
    ev.preventDefault();
  }
});
window.addEventListener('blur', () => {
  held.up = held.down = held.left = held.right = false;
});

// Mouse look: pointer lock on click, or a plain drag where lock is refused.
let dragging = false;
canvas.addEventListener('mousedown', (ev) => {
  if (titleUp) {
    dismissTitle();
    return;
  }
  dragging = true;
  if (ev.button === 0 && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
window.addEventListener('mouseup', () => (dragging = false));
window.addEventListener('mousemove', (ev) => {
  if (document.pointerLockElement === canvas || dragging) world.cam.onMouse(ev.movementX, ev.movementY);
});
canvas.addEventListener('wheel', (ev) => {
  world.cam.onWheel(ev.deltaY);
  ev.preventDefault();
}, { passive: false });

/* =============================================================== audio ===== */

// Shared with the 2.5D page (src/render/cues.ts): every cue is an edge in the
// snapshot, whichever renderer draws it. This page used to keep its own copy.
const updateAudio = createCues(audio);

/* ============================================================ end card ===== */

let ended = false;
function showEnd(): void {
  if (ended) return;
  ended = true;
  const card = document.createElement('div');
  card.className = 'ad3d-end';
  card.innerHTML =
    '<h1>END OF THE 3D BUILD, FOR NOW</h1><p>Breakfast is served and the stairs are open. Chapter 4, the keynote, exists only in the 2.5D build so far.</p>' +
    '<p><button type="button" id="ad3d-replay">Play again</button></p>';
  app.appendChild(card);
  card.querySelector('#ad3d-replay')?.addEventListener('click', () => window.location.reload());
}

/* ================================================================= loop ==== */

for (let i = 0; i < warm; i++) {
  if (game.snapshot().card !== null) game.key('Space');
  game.update(DT_MAX);
}

const anchors: SpeakerAnchors = {};
let lastFade = -1;

function frame(dt: number): void {
  if (titleUp) {
    // The sim waits behind the gate; nothing is drawn under the black.
    return;
  }
  // The sim steps at most DT_MAX at a time; a slower frame takes several
  // steps. It used to take one clamped step, so below 30 fps the whole game ran
  // in slow motion — the intro most visibly (Michele: "the intro is slow, looks
  // like a performance issue").
  let left = dt;
  while (left > 1e-6) {
    const h = Math.min(DT_MAX, left);
    pushStick(h);
    game.update(h);
    left -= h;
  }
  const snap = game.snapshot();
  if (snap.chapter > 3) {
    showEnd();
    return;
  }
  world.render(snap, dt);
  if (!hideHud) {
    for (const key of Object.keys(anchors) as RobotKind[]) delete anchors[key];
    for (const b of snap.bots) {
      const at = world.project(b.x, b.y, ROBOT_HEIGHT_M[b.kind] + 0.35);
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

/** The longest frame the game catches up on, s; beyond it, it slows down. */
const MAX_FRAME = 0.1;
let last = performance.now();
function loop(now: number): void {
  requestAnimationFrame(loop);
  // Real elapsed time, capped so a tab switch does not fast-forward the game.
  const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_FRAME);
  last = now;
  frame(dt);
}
if (!shotMode) requestAnimationFrame(loop);

/* ========================================================= debug handle ==== */

export interface AfterDark3DHandle {
  game: DebugGame;
  world: World3D;
  /** Run `n` frames of `dt` seconds (sim + render). */
  step(n: number, dt?: number): void;
  /** Fixed camera for a screenshot: position and look-at, metres. */
  pose(px: number, py: number, pz: number, lx: number, ly: number, lz: number): void;
  /** Back to the orbit camera, at a given yaw/pitch/zoom. */
  orbit(yaw: number, pitch: number, zoom?: number): void;
  errors: string[];
  ready: boolean;
}

declare global {
  interface Window {
    __ad3d?: AfterDark3DHandle;
  }
}

window.__ad3d = {
  game,
  world,
  step(n: number, dt = 1 / 30): void {
    for (let i = 0; i < n; i++) frame(dt);
  },
  pose(px, py, pz, lx, ly, lz): void {
    world.cam.pose = { pos: new Vector3(px, py, pz), look: new Vector3(lx, ly, lz) };
  },
  orbit(yaw: number, pitch: number, zoom = 1): void {
    world.cam.pose = null;
    world.cam.yaw = yaw;
    world.cam.pitch = pitch;
    world.cam.zoom = zoom;
    world.cam.cut();
  },
  errors,
  ready: true,
};
