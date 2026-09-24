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
import type { GameSnapshot, RobotKind } from './sim/types';
import { PX_PER_M, ROBOT_HEIGHT_M } from './sim/units';

import { createAudio, type Audio } from './render/audio';
import { createHud, type Hud, type SpeakerAnchors } from './render/hud';
import { STEP_FREQ_BASE, STEP_FREQ_PER_MPS, gaitSpeed } from './render/robots';
import type { QualityName } from './render3d/pipeline';
import { createWorld3D, type World3D } from './render3d/world';
import { installHudTheme } from './render3d/hudTheme';

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

const game: DebugGame = createGame({ seed: int('seed'), chapter: 1, cards: false });

/*
 * The title: the sim waits (chapter 1 is set up, so every door and the fire
 * shutter are already in place) while the camera dollies down the corridor;
 * any key starts play. This is shell, not game: the sim simply is not stepped.
 */
let titleUp = !shotMode || flag('cards');
const titleEl = document.createElement('div');
titleEl.className = 'ad3d-title';
titleEl.innerHTML =
  '<h1>AFTER DARK</h1><p class="ad3d-sub">Kinepolis Antwerp, the night before Devoxx. Stephan lost the keys; the humans are locked out until morning. ' +
  'Three robots are already inside, and the power is out in the closed cinema section.</p>' +
  '<p class="ad3d-poc">Full-3D proof of concept · chapter 1</p><p class="ad3d-press">Press any key</p>';
if (titleUp) app.appendChild(titleEl);
function dismissTitle(): void {
  if (!titleUp) return;
  titleUp = false;
  titleEl.remove();
  world.cam.cut();
}
const world: World3D = createWorld3D(canvas, { quality, preserveDrawingBuffer: shotMode });
const hud: Hud = createHud(app, { onSkip: () => game.skipChapter() });
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

/** The sim's stick, from held keys and the camera's yaw — refreshed every frame. */
function pushStick(): void {
  const fwd = (held.up ? 1 : 0) - (held.down ? 1 : 0);
  const strafe = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (fwd === 0 && strafe === 0) {
    game.setStick(0, 0);
    return;
  }
  const [sx, sy] = world.cam.stick(fwd, strafe);
  game.setStick(sx, sy);
}

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
let photo = false;

window.addEventListener('keydown', (ev) => {
  const code = codeOf(ev);
  if (titleUp) {
    dismissTitle();
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
    document.body.classList.toggle('ad-nohud', photo || hideHud);
  }
  game.key(code);
});
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

const stepPhase: Record<RobotKind, number> = { voxxy: 0, droid: 0, biggy: 0 };
let lastBreak = 0;
let ambientSet = false;
function updateAudio(snap: GameSnapshot, dt: number): void {
  const breaking = snap.props.find((p) => p.kind === 'jammed')?.progress ?? 0;
  if (breaking > 0 && lastBreak <= 0) audio.play('crash', { intensity: 1 });
  lastBreak = breaking;
  if (!ambientSet) {
    audio.setAmbient(snap.chapter);
    ambientSet = true;
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
    if (Math.floor(after * 2) > Math.floor(before * 2)) audio.footstep(b.kind, Math.min(1, v / 2.6));
  }
}

/* ============================================================ end card ===== */

let ended = false;
function showEnd(): void {
  if (ended) return;
  ended = true;
  const card = document.createElement('div');
  card.className = 'ad3d-end';
  card.innerHTML =
    '<h1>END OF THE 3D PROOF OF CONCEPT</h1><p>The fire door is open. Chapter 2, the exhibition hall, exists only in the 2.5D build for now.</p>' +
    '<p><button type="button" id="ad3d-replay">Replay chapter 1</button></p>';
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
    world.render(game.snapshot(), dt, true);
    return;
  }
  pushStick();
  game.update(dt);
  const snap = game.snapshot();
  if (snap.chapter > 1) {
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

let last = performance.now();
function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min(Math.max((now - last) / 1000, 0), DT_MAX);
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
