/**
 * hud.ts — the DOM overlay: objective, controls, robot switcher, keypad readout,
 * chapter meters, the speed gauge and the "why am I blocked" toasts.
 *
 * This is deliberately *not* Three.js. Text is the one thing a canvas renders worse
 * than the browser does, and the judges read the HUD at 1280x720 on a projector.
 * The overlay is driven purely by a `GameSnapshot` — it holds no game state of its
 * own beyond the animation bookkeeping for toasts (which are wall-clock, not sim,
 * because they keep fading while the sim is paused behind a card).
 *
 * Architecture rule (CLAUDE.md): `src/sim` is the only source of truth. Nothing here
 * mutates the snapshot or decides anything about the game; it only formats.
 *
 * Pointer events: the whole overlay is `pointer-events:none` except the skip button,
 * so a click always reaches the diorama canvas underneath.
 */

import { CABLE_MAX, TOAST_MS } from '../sim/constants';
import type { Bot, GameSnapshot, Prop, RobotKind } from '../sim/types';
import { displayMps } from '../sim/units';

export interface HudOptions {
  /**
   * The skip-chapter button's click handler — the only interactive element in the
   * overlay. Wire it to `Game.skipChapter()`.
   */
  onSkip?: () => void;
}

/**
 * Where each robot is on the canvas this frame, in CSS pixels — the renderer's
 * `DioramaScene.project()` for a point over that robot's head. A robot that is
 * off screen or in a debug camera is simply absent, and its line falls back to
 * the stacked row at the bottom.
 */
export type SpeakerAnchors = Partial<Record<RobotKind, { x: number; y: number }>>;

export interface Hud {
  /** Call once per rendered frame with the current snapshot. */
  update(snap: GameSnapshot, anchors?: SpeakerAnchors): void;
  dispose(): void;
  /** The overlay root, for hosts that need to measure or reparent it. */
  readonly root: HTMLElement;
}

/** Chapter headings, verbatim from the prototype's `CHAPTER_TITLES` (parity). */
const CHAPTER_TITLES: readonly string[] = [
  'After Dark',
  '1 · Night — the closed cinema section',
  '2 · Expo — the exhibition hall',
  '3 · Breakfast — doors open',
  '4 · Keynote — Room 8',
];

/**
 * Fallback identity colours, used only if a robot is missing from the snapshot.
 * The live values come from each bot's lamp (`Bot.light.c`): the light-mix mechanic
 * teaches the player orange = Voxxy, green = Droid, blue = Biggy, so the HUD speaks
 * the same language rather than inventing a second palette.
 */
const LAMP_FALLBACK: Readonly<Record<RobotKind, [number, number, number]>> = {
  voxxy: [255, 120, 40],
  droid: [90, 220, 140],
  biggy: [70, 120, 255],
};

/** Which robot a toast is spoken by, so it can be tinted in that robot's colour. */
const SPEAKERS: ReadonlyArray<readonly [RegExp, RobotKind]> = [
  [/\bvoxxy\b/i, 'voxxy'],
  [/\bdroid\b/i, 'droid'],
  [/\bbiggy\b/i, 'biggy'],
];

/**
 * The robot a line is spoken BY, as opposed to one it merely mentions.
 *
 * Every "why am I blocked" message in `src/sim` is written as `Name: line` in
 * that robot's own voice, which is the build's best writing and was being
 * delivered in a grey text row at the bottom edge of the screen. Only that
 * prefix form gets a bubble: "Voxxy pushes Biggy" is narration, not speech.
 */
function speakerOf(text: string): RobotKind | null {
  const mm = /^(Voxxy|Droid|Biggy):/.exec(text);
  return mm ? (mm[1].toLowerCase() as RobotKind) : null;
}

/** Seconds of play after which the briefing paragraph folds to one line. */
const BRIEF_FULL_S = 13;

const ACCENT = '#ffb347';
const MUTED = '#9aa0ab';

const CSS = `
.ad-hud{position:fixed;inset:0;z-index:5;pointer-events:none;color:#e8e6e1;
  font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.ad-hud *{box-sizing:border-box;margin:0}
.ad-hide{display:none!important}

.ad-top{position:absolute;left:0;right:0;top:0;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;
  padding:8px 14px;background:linear-gradient(180deg,rgba(10,11,14,.96),rgba(10,11,14,.78));border-bottom:1px solid #2a2e36}
.ad-brand{color:${ACCENT};font-weight:700;letter-spacing:.09em;font-size:12px;white-space:nowrap}
.ad-chapter{color:${MUTED};font-size:12px;white-space:nowrap}
.ad-obj{flex:1 1 340px;min-width:240px;cursor:pointer}
/* The briefing is 60-84 words and it used to sit across the top of the frame for
   the whole chapter — a permanent 12% text band over the diorama. It folds to one
   line a few seconds in, and a click puts it back. The objective bar at the bottom
   carries the live state, which is the part that actually ticks. */
.ad-obj.ad-fold{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;
  overflow:hidden;opacity:.72}
.ad-obj b{color:${ACCENT};font-weight:600}
.ad-keys{color:${MUTED};font-size:12px}
.ad-swag{color:${MUTED};font-size:12px;white-space:nowrap}
.ad-skip{pointer-events:auto;margin-left:auto;background:#1c1f26;color:${ACCENT};border:1px solid ${ACCENT};
  border-radius:6px;padding:4px 10px;cursor:pointer;font:12px system-ui,sans-serif;white-space:nowrap}
.ad-skip:hover{background:#2a2e36}
.ad-skip:focus-visible{outline:2px solid ${ACCENT};outline-offset:2px}

.ad-panel{background:rgba(10,11,14,.8);border:1px solid #2a2e36;border-radius:8px;padding:6px 8px}

.ad-left{position:absolute;left:14px;bottom:14px;width:246px;display:flex;flex-direction:column;gap:7px}
.ad-bots{display:flex;gap:6px}
.ad-bot{flex:1 1 0;display:flex;flex-direction:column;gap:3px;padding:6px 7px;border-radius:8px;
  border:1px solid #2a2e36;background:rgba(10,11,14,.8);opacity:.7;transition:opacity .15s,border-color .15s,transform .15s}
.ad-bot .ad-badge{display:flex;align-items:center;gap:5px}
.ad-dot{width:8px;height:8px;border-radius:50%;background:currentColor}
.ad-bot .ad-name{font-size:12px;font-weight:600;letter-spacing:.01em;color:#e8e6e1}
.ad-bot .ad-key{font-size:10px;color:${MUTED};letter-spacing:.06em}
.ad-bot.ad-on{opacity:1;border-color:currentColor;transform:translateY(-2px);box-shadow:0 0 0 1px currentColor inset,0 0 14px -4px currentColor}
.ad-bot.ad-on .ad-dot{box-shadow:0 0 9px currentColor}
.ad-bot.ad-off{opacity:.34}
.ad-bot.ad-off .ad-key{text-decoration:line-through}

.ad-speed .ad-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.ad-speed .ad-v{font:600 18px/1.1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.ad-speed .ad-state{font-size:10px;letter-spacing:.12em;color:${MUTED}}
.ad-speed .ad-cap{font-size:10px;color:${MUTED}}
.ad-speed.ad-boost .ad-state{color:${ACCENT}}

.ad-track{height:4px;border-radius:2px;background:#22262e;overflow:hidden;margin-top:5px}
.ad-fill{height:100%;width:0%;background:${ACCENT};border-radius:2px;transition:width .09s linear,background-color .2s}

.ad-meters{position:absolute;right:14px;bottom:14px;width:262px;display:flex;flex-direction:column;gap:6px}
.ad-meter .ad-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;color:${MUTED}}
.ad-meter .ad-lab{color:#e8e6e1;font-weight:500}
.ad-meter .ad-val{font-variant-numeric:tabular-nums}
.ad-meter.ad-warn{border-color:#a8452f}

.ad-pad{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;flex-direction:column;
  align-items:center;gap:5px}
.ad-cells{display:flex;gap:6px}
.ad-cell{width:30px;height:38px;border:1px solid #2a2e36;border-radius:6px;background:rgba(10,11,14,.82);
  display:flex;align-items:center;justify-content:center;color:#394049;
  font:600 20px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;transition:color .18s,border-color .18s}
.ad-cell.ad-found{color:#c9a227;border-color:#59491c}
.ad-cell.ad-typed{color:#ffd27a;border-color:${ACCENT};box-shadow:0 0 14px -2px rgba(255,179,71,.45)}
.ad-pad .ad-cap{font-size:13px;color:#d7d3cc;letter-spacing:.01em;padding:4px 12px;border-radius:7px;
  background:rgba(10,11,14,.82);border:1px solid #2a2e36;text-align:center;max-width:min(860px,88vw)}

/* THE TEXT FIELD, at the centre of the screen.

   Michele, on chapter 2's router terminal: "Typing the password was hard, the game
   did not match it. I'd display an input text at center screen on e to make it
   easier." What he had typed was one clause of a 100-character status line along
   the bottom edge of the frame, which is not where anybody looks while they type.

   It is not an <input>: the sim owns the buffer and the keyboard, and a focusable
   element inside a pointer-events:none overlay would fight the canvas for focus and
   swallow the very keys the game is reading. It is a box that DRAWS what the sim
   says is in the box, one character per cell, with a caret on the next one. */
.ad-prompt{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);
  display:flex;flex-direction:column;align-items:center;gap:9px;padding:18px 24px 15px;
  border:1px solid ${ACCENT};border-radius:12px;background:rgba(10,11,14,.95);
  box-shadow:0 22px 64px rgba(0,0,0,.66),0 0 0 9999px rgba(4,5,8,.18);
  animation:ad-rise .18s cubic-bezier(.2,.9,.3,1) both;max-width:min(92vw,720px)}
.ad-prompt .ad-ptitle{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${ACCENT};
  text-align:center}
.ad-pfield{display:flex;flex-wrap:wrap;justify-content:center;gap:5px}
.ad-pchar{width:26px;height:34px;border-radius:5px;border:1px solid #333944;background:#0e1016;
  display:flex;align-items:center;justify-content:center;color:#3c434e;
  font:600 19px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  transition:color .12s,border-color .12s,background-color .12s}
.ad-pchar.ad-in{color:#ffd995;border-color:${ACCENT};background:#191309;
  box-shadow:0 0 12px -3px rgba(255,179,71,.55)}
.ad-pchar.ad-caret{border-color:#ffd995;animation:ad-blink 1.05s steps(1,end) infinite}
.ad-prompt.ad-bad{border-color:#e0533a;animation:ad-shake .22s ease-in-out}
.ad-prompt.ad-bad .ad-pchar.ad-caret{border-color:#e0533a;background:#20100d;animation:none}
.ad-pcount{font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:${MUTED};
  font-variant-numeric:tabular-nums}
.ad-phint{font-size:12.5px;color:#c7c2b9;text-align:center}
@keyframes ad-blink{0%,55%{background:#241a0b}56%,100%{background:#0e1016}}
@keyframes ad-shake{25%{transform:translate(calc(-50% - 6px),-50%)}75%{transform:translate(calc(-50% + 6px),-50%)}}
@media (prefers-reduced-motion:reduce){
  .ad-pchar.ad-caret{animation:none}
  .ad-prompt.ad-bad{animation:none}
}
@media (max-width:760px){
  .ad-pchar{width:20px;height:28px;font-size:15px}
}

/* A vignette, so the diorama's floor plate ends at a deliberate edge instead of
   running off the corner of the frame on an arbitrary diagonal. It is part of the
   HUD on purpose: ?nohud=1 turns it off, and the overlay and model-sheet checks
   photograph a clean frame. */
.ad-vig{position:absolute;inset:0;
  background:radial-gradient(124% 98% at 50% 46%, rgba(0,0,0,0) 60%, rgba(4,5,8,.26) 84%, rgba(4,5,8,.52) 100%)}

/* Speech bubbles. A blocked line is spoken BY a robot, so it is hung over that
   robot with a tail, not dropped in an 18px row at the bottom edge where the
   player is not looking. Anything with no identifiable speaker, or whose speaker
   is off screen, falls back to the stacked row. */
.ad-bubbles{position:absolute;inset:0;overflow:hidden}
.ad-bubble{position:absolute;transform:translate(-50%,-100%);max-width:330px;width:max-content;
  padding:8px 13px;border-radius:11px;border:1px solid currentColor;
  background:rgba(10,11,14,.93);box-shadow:0 10px 30px rgba(0,0,0,.55);font-size:15px;line-height:1.28;
  text-align:left;animation:ad-rise .22s cubic-bezier(.2,.9,.3,1) both}
.ad-bubble::after{content:'';position:absolute;left:50%;bottom:-7px;width:12px;height:12px;
  margin-left:-6px;transform:rotate(45deg);background:rgba(10,11,14,.93);
  border-right:1px solid currentColor;border-bottom:1px solid currentColor}
.ad-bubble.ad-out{animation:ad-sink .34s ease-in forwards}

.ad-toasts{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);width:min(680px,74vw);
  display:flex;flex-direction:column;align-items:center;gap:6px}
.ad-toast{max-width:100%;padding:8px 15px;border-radius:9px;border-left:3px solid currentColor;
  background:rgba(10,11,14,.92);box-shadow:0 8px 28px rgba(0,0,0,.5);font-size:15px;text-align:center;
  animation:ad-rise .22s cubic-bezier(.2,.9,.3,1) both}
.ad-toast .ad-line{color:#f2efe9}
.ad-toast.ad-out{animation:ad-sink .34s ease-in forwards}
@keyframes ad-rise{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}
@keyframes ad-sink{to{opacity:0;transform:translateY(-10px)}}
@media (prefers-reduced-motion:reduce){
  .ad-toast,.ad-toast.ad-out{animation-duration:.01s}
  .ad-fill{transition:none}
}

.ad-card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;
  background:rgba(6,7,10,.58)}
.ad-card .ad-cardbox{max-width:min(760px,82vw);padding:20px 28px;border:1px solid ${ACCENT};border-radius:12px;
  background:rgba(10,11,14,.96);box-shadow:0 20px 70px rgba(0,0,0,.65);text-align:center;font-size:20px;line-height:1.35}
.ad-card b{color:${ACCENT}}

/* THE OPENING TITLE. Over the shot of the crates, not on a card over the game —
   the point of staging the arrival in the corridor is that the player is looking
   at the game from the first frame, and a modal in front of it would undo that. */
.ad-titles{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;pointer-events:none;text-align:center;gap:10px}
.ad-titles .ad-t1{font-size:min(9vw,74px);letter-spacing:.14em;font-weight:800;color:${ACCENT};
  text-shadow:0 6px 40px rgba(0,0,0,.9),0 0 90px rgba(0,0,0,.8)}
.ad-titles .ad-t2{font-size:min(2.6vw,18px);letter-spacing:.24em;color:#e9e6df;
  text-shadow:0 3px 22px rgba(0,0,0,.95)}
.ad-card small{display:block;font-size:13px;color:${MUTED};margin-top:8px}

/* The objective wraps the top bar onto two or three lines at 1280x720, so nothing
   the player needs is anchored under it: the keypad sits at the bottom, between the
   switcher and the meters, with the toast stack above it. */
@media (max-height:620px){
  .ad-left,.ad-meters,.ad-pad{bottom:10px}
  .ad-toasts{bottom:84px}
  .ad-cell{height:32px;width:26px;font-size:17px}
}
`;

/* ------------------------------------------------------------------ helpers */

const rgb = (c: readonly [number, number, number]): string => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba = (c: readonly [number, number, number], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

/** Writes only when the value actually changed — `update()` runs every frame. */
function setText(node: HTMLElement, value: string, cache: Map<HTMLElement, string>): void {
  if (cache.get(node) === value) return;
  cache.set(node, value);
  node.textContent = value;
}

/** Same, for the few fields the sim is allowed to send simple markup in. */
function setHtml(node: HTMLElement, value: string, cache: Map<HTMLElement, string>): boolean {
  if (cache.get(node) === value) return false;
  cache.set(node, value);
  // Trusted source: these strings come from our own `src/sim` chapter code, and the
  // type contract says the objective "may contain simple markup" (<b> emphasis).
  node.innerHTML = value;
  return true;
}

/**
 * Same idea for style properties. The cache key is passed in rather than derived
 * from the node, because class names change as chips highlight and meters warn.
 */
function setStyle(
  node: HTMLElement,
  key: string,
  prop: 'width' | 'background' | 'color',
  value: string,
  cache: Map<string, string>,
): void {
  const k = `${key}|${prop}`;
  if (cache.get(k) === value) return;
  cache.set(k, value);
  node.style.setProperty(prop, value);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Chapters report progress either as a 0..1 fraction or as a 0..100 percentage
 * (the prototype's soup and temperature are percentages, the keynote crowd fill is
 * a fraction). Accept both rather than forcing one convention on the sim side.
 */
function frac01(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return clamp01(v > 1.0001 ? v / 100 : v);
}

/** Metres travelled by the cable so far, from the polyline the sim has laid. */
function cableUsed(p: Prop): number {
  const pts = p.pts;
  if (pts && pts.length > 1) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return len;
  }
  // No polyline: fall back to `v`, as an absolute length or as a fraction of the reel.
  if (typeof p.v !== 'number' || !Number.isFinite(p.v)) return 0;
  return p.v > 1.0001 ? p.v : p.v * CABLE_MAX;
}

interface MeterView {
  key: string;
  label: string;
  value: string;
  frac: number;
  colour: string;
  warn: boolean;
}

const COLD: [number, number, number] = [96, 150, 235];
const HOT: [number, number, number] = [255, 138, 52];
const TOMATO: [number, number, number] = [214, 70, 48];
const AMBER: [number, number, number] = [255, 179, 71];
const ALARM: [number, number, number] = [200, 62, 40];

/**
 * The bars each chapter asks for, read out of the snapshot's props:
 * the cable reel (ch2), the soup pot and its temperature (ch3) and the crowd
 * filling Room 8 (ch4). Unknown props are simply ignored, so a chapter can add a
 * bar by emitting a prop of the right `kind` without touching the HUD.
 */
function collectMeters(snap: GameSnapshot): MeterView[] {
  const out: MeterView[] = [];
  for (const p of snap.props) {
    switch (p.kind) {
      case 'cable': {
        const used = cableUsed(p);
        const f = clamp01(used / CABLE_MAX);
        // The intended straight route lands at 1270-1311 px of the 1480 reel (the
        // prototype's verified run), so it must NOT read as a failure: the bar only
        // goes red past 93%, where nothing but a detour can put you.
        const tight = f > 0.93;
        out.push({
          key: 'cable',
          label: p.label ?? 'cable reel',
          value: `${Math.round(used)} / ${CABLE_MAX} px`,
          frac: f,
          colour: rgb(mixRgb(AMBER, ALARM, (f - 0.75) / 0.2)),
          warn: tight,
        });
        break;
      }
      case 'pot': {
        // The pot carries its heat in `v`: hot is orange, stone cold is blue.
        const f = frac01(p.v);
        out.push({
          key: 'pot',
          label: p.label ?? 'tomato soup · temperature',
          value: `${Math.round(f * 100)}°`,
          frac: f,
          colour: rgb(mixRgb(COLD, HOT, f)),
          warn: f < 0.25,
        });
        break;
      }
      case 'soup': {
        const f = frac01(p.v);
        out.push({
          key: 'soup',
          label: p.label ?? 'soup in the pot',
          value: `${Math.round(f * 100)}%`,
          frac: f,
          colour: rgb(TOMATO),
          warn: f < 0.35,
        });
        break;
      }
      case 'crowd':
      case 'crowd-fill': {
        const f = frac01(p.v);
        out.push({
          key: 'crowd',
          label: p.label ?? 'Room 8 filling up',
          value: `${Math.round(f * 100)}%`,
          frac: f,
          colour: rgb(f > 0.8 ? ALARM : AMBER),
          warn: f > 0.8,
        });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** The lamp colour of a robot present in this snapshot. */
function lampOf(bots: readonly Bot[], kind: RobotKind): [number, number, number] {
  for (const b of bots) if (b.kind === kind) return b.light.c;
  return LAMP_FALLBACK[kind];
}

/**
 * `Toast` only carries text, so the speaker is read back out of the line — every
 * blocked-message in the sim names the robot that is talking ("Droid: too high,
 * even for me."). Anything impersonal is tinted with the robot being driven.
 */
function toastColour(text: string, snap: GameSnapshot): [number, number, number] {
  for (const [re, kind] of SPEAKERS) if (re.test(text)) return lampOf(snap.bots, kind);
  const act = snap.bots[snap.active];
  return act ? act.light.c : LAMP_FALLBACK.voxxy;
}

/**
 * How long a toast should stay up. `Toast.until` is a deadline, but the sim may
 * express it in sim seconds (comparable to `snap.t`) or as a `performance.now()`
 * millisecond stamp; both are recognised, and anything implausible falls back to
 * the frozen `TOAST_MS`.
 */
function toastLifeMs(until: number, snapT: number): number {
  let ms: number;
  if (!Number.isFinite(until)) ms = TOAST_MS;
  else if (until > 1e5) ms = until - performance.now();
  else ms = (until - snapT) * 1000;
  if (!Number.isFinite(ms)) ms = TOAST_MS;
  return Math.max(900, Math.min(8000, ms));
}

interface LiveToast {
  node: HTMLElement;
  /** The line's text, so a repeat of the same sentence refreshes instead of stacking. */
  text: string;
  dieAt: number;
  removeAt: number;
  out: boolean;
  /**
   * The robot that said it, when the line names one as its prefix. A line with a
   * speaker becomes a bubble over that robot; everything else stays in the stack.
   */
  speaker: RobotKind | null;
}

/** Idle / walking / running, scaled to each robot's own frozen top speed. */
function speedState(speed: number, max: number, boosted: boolean): string {
  if (boosted) return 'PUSHED · OVER CAP';
  if (speed < max * 0.015) return 'IDLE';
  if (speed < max * 0.45) return 'WALKING';
  return 'RUNNING';
}

/* --------------------------------------------------------------------- build */

export function createHud(host: HTMLElement, opts: HudOptions = {}): Hud {
  const style = document.createElement('style');
  style.id = 'ad-hud-style';
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', 'ad-hud');
  root.setAttribute('data-hud', 'after-dark');
  el('div', 'ad-vig', root);

  /* top bar */
  const top = el('div', 'ad-top ad-chrome', root);
  const brand = el('span', 'ad-brand', top);
  brand.textContent = 'AFTER DARK';
  const chapterEl = el('span', 'ad-chapter', top);
  const objEl = el('span', 'ad-obj', top);
  objEl.title = 'Click to fold or unfold the briefing';
  let briefPinned: boolean | null = null;
  const onBriefClick = (): void => {
    briefPinned = objEl.classList.contains('ad-fold');
  };
  objEl.addEventListener('click', onBriefClick);
  const keysEl = el('span', 'ad-keys', top);
  const swagEl = el('span', 'ad-swag', top);
  const skip = el('button', 'ad-skip', top);
  skip.type = 'button';
  skip.textContent = 'Skip chapter ▸';
  skip.title = 'Jump to the next chapter (for testing, or if you are stuck)';

  const onSkipClick = (ev: MouseEvent): void => {
    // Blur, or the next Space/Enter meant for the game re-presses the button.
    (ev.currentTarget as HTMLElement | null)?.blur();
    opts.onSkip?.();
  };
  skip.addEventListener('click', onSkipClick);

  /* keypad readout (chapter 1) */
  const pad = el('div', 'ad-pad ad-chrome ad-hide', root);
  const cellsWrap = el('div', 'ad-cells', pad);
  const cells: HTMLElement[] = [];
  for (let i = 0; i < 4; i++) {
    const c = el('div', 'ad-cell', cellsWrap);
    c.dataset['k'] = `cell${i}`;
    cells.push(c);
  }
  const padCap = el('div', 'ad-cap', pad);

  /* the centre-screen text field (GameSnapshot.prompt) */
  const promptBox = el('div', 'ad-prompt ad-hide', root);
  const promptTitle = el('div', 'ad-ptitle', promptBox);
  const promptField = el('div', 'ad-pfield', promptBox);
  const promptCount = el('div', 'ad-pcount', promptBox);
  const promptHint = el('div', 'ad-phint', promptBox);
  /** One cell per character of the answer, grown on demand and reused after that. */
  const promptCells: HTMLElement[] = [];

  /* bottom-left: robot switcher + speed gauge */
  const left = el('div', 'ad-left ad-chrome', root);
  const botsWrap = el('div', 'ad-bots', left);
  interface ChipView {
    node: HTMLElement;
    name: HTMLElement;
    key: HTMLElement;
  }
  const chips: ChipView[] = [];
  for (let i = 0; i < 3; i++) {
    const node = el('div', 'ad-bot', botsWrap);
    node.dataset['k'] = `bot${i}`;
    const badge = el('div', 'ad-badge', node);
    el('span', 'ad-dot', badge);
    const name = el('span', 'ad-name', badge);
    const key = el('div', 'ad-key', node);
    chips.push({ node, name, key });
  }

  const speedBox = el('div', 'ad-panel ad-speed', left);
  const speedRow = el('div', 'ad-row', speedBox);
  const speedVal = el('span', 'ad-v', speedRow);
  const speedStateEl = el('span', 'ad-state', speedRow);
  const speedTrack = el('div', 'ad-track', speedBox);
  const speedFill = el('div', 'ad-fill', speedTrack);
  speedFill.dataset['k'] = 'speed';
  const speedCap = el('div', 'ad-cap', speedBox);

  /* bottom-right: chapter meters */
  const meters = el('div', 'ad-meters ad-chrome', root);
  interface MeterRow {
    node: HTMLElement;
    label: HTMLElement;
    value: HTMLElement;
    fill: HTMLElement;
  }
  const meterRows = new Map<string, MeterRow>();

  /* speech bubbles, then the fallback toast stack */
  const bubbles = el('div', 'ad-bubbles', root);
  const toasts = el('div', 'ad-toasts', root);
  toasts.setAttribute('role', 'status');
  toasts.setAttribute('aria-live', 'polite');
  const live: LiveToast[] = [];
  let lastToastKey = '';

  /* full-screen card */
  /**
   * The opening's title, drawn over the first shot and gone before the crates
   * open — so the thing it names is what the player is looking at when it
   * clears. Its alpha is the sim's (`GameSnapshot.opening.title`), like every
   * other number in this file.
   */
  const titles = el('div', 'ad-titles ad-hide', root);
  const titleMain = el('div', 'ad-t1', titles);
  const titleSub = el('div', 'ad-t2', titles);
  titleMain.textContent = 'AFTER DARK';
  titleSub.textContent = 'KINEPOLIS ANTWERP · THE NIGHT BEFORE DEVOXX';

  const card = el('div', 'ad-card ad-hide', root);
  const cardBox = el('div', 'ad-cardbox', card);

  host.appendChild(root);

  const textCache = new Map<HTMLElement, string>();
  const htmlCache = new Map<HTMLElement, string>();
  const styleCache = new Map<string, string>();
  let lastChrome = -1;
  let disposed = false;

  function updateChips(snap: GameSnapshot): void {
    for (let i = 0; i < chips.length; i++) {
      const chip = chips[i];
      const bot = snap.bots[i];
      if (!bot) {
        chip.node.classList.add('ad-hide');
        continue;
      }
      chip.node.classList.remove('ad-hide');
      setText(chip.name, bot.name, textCache);
      // Droid cannot be selected while he is riding Biggy: the sim's own switch key
      // refuses Digit2 then, so the chip says so instead of lying about the control.
      const unavailable = bot.mounted;
      setText(chip.key, unavailable ? `${i + 1} · riding` : `${i + 1}`, textCache);
      chip.node.classList.toggle('ad-on', i === snap.active);
      chip.node.classList.toggle('ad-off', unavailable);
      setStyle(chip.node, `bot${i}`, 'color', rgb(bot.light.c), styleCache);
    }
  }

  function updateSpeed(snap: GameSnapshot): void {
    const bot = snap.bots[snap.active];
    if (!bot) return;
    const speedPx = Math.hypot(bot.vx, bot.vy);
    const mps = displayMps(speedPx);
    const capMps = displayMps(bot.max);
    // A push can take Biggy past his own top speed — that is the whole roller-door
    // puzzle, so the gauge shows it rather than clamping it away.
    const boosted = speedPx > bot.max * 1.005;
    setText(speedVal, `${mps.toFixed(1)} / ${capMps.toFixed(1)} m/s`, textCache);
    setText(speedStateEl, speedState(speedPx, bot.max, boosted), textCache);
    // One unit in the player-facing line. The raw sim pixels stay available for a
    // physics judge, but as a parenthetical rather than as a second contradictory
    // number next to a cap quoted in metres.
    setText(speedCap, `${bot.name} · ${Math.round(speedPx)} of ${bot.max} px/s (sim)`, textCache);
    speedBox.classList.toggle('ad-boost', boosted);
    setStyle(speedFill, 'speed', 'width', `${(clamp01(speedPx / bot.max) * 100).toFixed(1)}%`, styleCache);
    setStyle(speedFill, 'speed', 'background', boosted ? rgb(ALARM) : rgb(bot.light.c), styleCache);
  }

  function updateKeypad(snap: GameSnapshot): void {
    // The bottom-centre strip is every chapter's live progress readout; only
    // chapter 1 also carries the four keypad cells above it.
    const line = snap.progress;
    const showPad =
      snap.opening === null && snap.chapter >= 1 && snap.phase !== 'done' && (line !== '' || snap.chapter === 1);
    pad.classList.toggle('ad-hide', !showPad);
    const show = snap.chapter === 1 && snap.phase !== 'done';
    cellsWrap.classList.toggle('ad-hide', !show);
    if (!showPad) return;
    if (!show) {
      setText(padCap, line, textCache);
      return;
    }
    // `Clue.slot` may be 0- or 1-based depending on the chapter; ordering by slot
    // makes both work.
    const ordered = snap.clues.slice().sort((a, b) => a.slot - b.slot);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const clue = ordered[i];
      const typed = i < snap.entered.length ? snap.entered[i] : '';
      const glyph = typed !== '' ? typed : clue?.found ? String(clue.digit) : '·';
      setText(cell, glyph, textCache);
      cell.classList.toggle('ad-typed', typed !== '');
      cell.classList.toggle('ad-found', typed === '' && !!clue?.found);
    }
    setText(padCap, line, textCache);
  }

  /**
   * THE TEXT FIELD. Pure formatting: everything it shows is decided in `src/sim`
   * and arrives on `GameSnapshot.prompt` (`TextPrompt`), and nothing here decides
   * whether a key was right, what the answer is or how long it is (CLAUDE.md).
   *
   * One cell per character, so what is in and what is left are countable at a
   * glance — the same language the chapter-1 keypad cells already speak, moved to
   * the middle of the screen where a player who is typing is actually looking. The
   * next empty cell carries the caret; a refused key turns the whole box red for a
   * third of a second, which is the feedback that was missing entirely.
   */
  function updatePrompt(snap: GameSnapshot): void {
    const p = snap.prompt;
    promptBox.classList.toggle('ad-hide', p === null);
    if (p === null) {
      promptBox.classList.remove('ad-bad');
      return;
    }
    // `total` 0 means "as long as it needs to be": show what is typed plus one
    // empty cell for the caret, so an open-ended field still has somewhere to blink.
    const cells = p.total > 0 ? p.total : p.value.length + 1;
    while (promptCells.length < cells) promptCells.push(el('div', 'ad-pchar', promptField));
    for (let i = 0; i < promptCells.length; i++) {
      const cell = promptCells[i];
      const used = i < cells;
      cell.classList.toggle('ad-hide', !used);
      if (!used) continue;
      const typed = i < p.value.length;
      setText(cell, typed ? p.value[i] : p.blank, textCache);
      cell.classList.toggle('ad-in', typed);
      cell.classList.toggle('ad-caret', i === p.value.length);
    }
    setText(promptTitle, p.title, textCache);
    setText(promptCount, p.total > 0 ? `${p.value.length} / ${p.total}` : `${p.value.length}`, textCache);
    setText(promptHint, p.hint, textCache);
    promptBox.classList.toggle('ad-bad', p.reject > 0);
  }

  function updateMeters(snap: GameSnapshot): void {
    const wanted = collectMeters(snap);
    const seen = new Set<string>();
    for (const mv of wanted) {
      seen.add(mv.key);
      let row = meterRows.get(mv.key);
      if (!row) {
        const node = el('div', 'ad-panel ad-meter', meters);
        node.dataset['k'] = mv.key;
        const r = el('div', 'ad-row', node);
        const label = el('span', 'ad-lab', r);
        const value = el('span', 'ad-val', r);
        const track = el('div', 'ad-track', node);
        const fill = el('div', 'ad-fill', track);
        fill.dataset['k'] = `meter-${mv.key}`;
        row = { node, label, value, fill };
        meterRows.set(mv.key, row);
      }
      setText(row.label, mv.label, textCache);
      setText(row.value, mv.value, textCache);
      setStyle(row.fill, `meter-${mv.key}`, 'width', `${(mv.frac * 100).toFixed(1)}%`, styleCache);
      setStyle(row.fill, `meter-${mv.key}`, 'background', mv.colour, styleCache);
      row.node.classList.toggle('ad-warn', mv.warn);
    }
    // Drop bars whose chapter has moved on.
    meterRows.forEach((row, key) => {
      if (seen.has(key)) return;
      row.node.remove();
      meterRows.delete(key);
    });
  }

  function updateToasts(snap: GameSnapshot): void {
    const now = performance.now();
    const t = snap.toast;
    if (t && t.t) {
      const key = `${t.t}|${t.until}`;
      if (key !== lastToastKey) {
        lastToastKey = key;
        const life = toastLifeMs(t.until, snap.t);
        // The same sentence twice is one message that is still true, not two
        // messages: leaning on a door re-fires its `why` every throttle window, and
        // stacking those produced six identical toasts down the middle of the
        // screen. Refresh the existing line's timer instead.
        const repeat = live.find((lt) => !lt.out && lt.text === t.t);
        if (repeat) {
          repeat.dieAt = now + life;
          repeat.removeAt = now + life + 340;
        } else {
          const speaker = speakerOf(t.t);
          const node = el('div', speaker ? 'ad-bubble' : 'ad-toast');
          const colour = toastColour(t.t, snap);
          node.style.color = rgb(colour);
          if (!speaker) {
            node.style.background = `linear-gradient(90deg, ${rgba(colour, 0.2)}, rgba(10,11,14,.93) 58%)`;
          }
          const line = el('span', 'ad-line', node);
          line.textContent = t.t;
          (speaker ? bubbles : toasts).appendChild(node);
          live.push({ node, text: t.t, dieAt: now + life, removeAt: now + life + 340, out: false, speaker });
          // Three lines is already a wall of text over the diorama: as a fourth
          // arrives, the oldest starts its exit animation immediately.
          for (let i = 0; i < live.length - 3; i++) {
            const old = live[i];
            if (old.out) continue;
            old.out = true;
            old.dieAt = now;
            old.removeAt = now + 340;
            old.node.classList.add('ad-out');
          }
        }
      }
    } else {
      lastToastKey = '';
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const lt = live[i];
      if (!lt.out && now >= lt.dieAt) {
        lt.out = true;
        lt.node.classList.add('ad-out');
      }
      if (now >= lt.removeAt) {
        lt.node.remove();
        live.splice(i, 1);
      }
    }
  }

  /**
   * Hang every live bubble over its speaker. A speaker that is off screen this
   * frame parks its bubble at the top of the canvas above the robot's last known
   * side, which is better than letting it drift off the edge.
   */
  function placeBubbles(anchors: SpeakerAnchors | undefined): void {
    if (!anchors) return;
    const w = root.clientWidth || 1;
    const h = root.clientHeight || 1;
    for (const lt of live) {
      if (!lt.speaker) continue;
      const at = anchors[lt.speaker];
      if (!at) {
        lt.node.style.opacity = '0';
        continue;
      }
      lt.node.style.opacity = '';
      const x = Math.min(Math.max(at.x, 180), w - 180);
      const y = Math.min(Math.max(at.y - 18, 92), h - 40);
      lt.node.style.left = `${Math.round(x)}px`;
      lt.node.style.top = `${Math.round(y)}px`;
    }
  }

  function updateCard(snap: GameSnapshot): void {
    const html = snap.card;
    if (html) {
      setHtml(cardBox, html, htmlCache);
      card.classList.remove('ad-hide');
    } else {
      card.classList.add('ad-hide');
    }
  }

  function update(snap: GameSnapshot, anchors?: SpeakerAnchors): void {
    if (disposed) return;

    setText(chapterEl, CHAPTER_TITLES[snap.chapter] ?? CHAPTER_TITLES[0], textCache);
    if (setHtml(objEl, snap.objective, htmlCache)) briefPinned = null;
    // Unfolded while the player is still reading it, then folded to one line. A
    // click pins it either way for the rest of the chapter.
    const fold = briefPinned === null ? snap.phase === 'play' && snap.t > BRIEF_FULL_S : briefPinned;
    objEl.classList.toggle('ad-fold', fold);
    setText(keysEl, snap.keys, textCache);
    setText(swagEl, snap.swag.length > 0 ? `swag ${snap.swag.length}/3` : '', textCache);

    /*
     * THE OPENING OWNS THE SCREEN.
     *
     * While the crates are on, everything that belongs to driving a robot is
     * off: the switcher, the speed gauge, the clue cells and the live progress
     * line. None of it is true yet — nobody is driving — and a speed gauge
     * reading 0.0 / 5.8 m/s over three crated robots is the kind of detail that
     * makes an opening look like a paused game rather than an opening.
     */
    const opening = snap.opening !== null;
    titles.classList.toggle('ad-hide', !opening || snap.opening!.title <= 0.001);
    if (opening) titles.style.opacity = snap.opening!.title.toFixed(3);
    left.classList.toggle('ad-hide', opening);
    meters.classList.toggle('ad-hide', opening);
    // The top bar keeps only the one thing that is true during the opening: that
    // a key skips it. The chapter's name and briefing arrive when the chapter does.
    chapterEl.classList.toggle('ad-hide', opening);
    objEl.classList.toggle('ad-hide', opening);

    updateChips(snap);
    updateSpeed(snap);
    updateKeypad(snap);
    updatePrompt(snap);
    updateMeters(snap);
    updateToasts(snap);
    placeBubbles(anchors);
    updateCard(snap);

    // Cutscenes fade the world to black; the chrome goes with it, so a transition
    // reads as a shot and not as a UI sitting on top of one. Toasts and the card
    // deliberately stay: they are what the fade is usually there to announce.
    const chrome = clamp01(1 - snap.fade * 1.25);
    if (Math.abs(chrome - lastChrome) > 0.01) {
      lastChrome = chrome;
      const v = chrome.toFixed(2);
      top.style.opacity = v;
      pad.style.opacity = v;
      promptBox.style.opacity = v;
      left.style.opacity = v;
      meters.style.opacity = v;
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    skip.removeEventListener('click', onSkipClick);
    objEl.removeEventListener('click', onBriefClick);
    live.length = 0;
    promptCells.length = 0;
    meterRows.clear();
    textCache.clear();
    htmlCache.clear();
    styleCache.clear();
    root.remove();
    style.remove();
  }

  return { update, dispose, root };
}
