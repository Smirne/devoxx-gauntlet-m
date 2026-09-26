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
import type { Bot, GameSnapshot, Prop, RobotKind, Task } from '../sim/types';
import { displayMps } from '../sim/units';
import { CARDS as INTRO_CARDS } from '../sim/opening';
import { GOAL, STORY } from '../sim/story';

export interface HudOptions {
  /**
   * The skip-chapter button's click handler — the only interactive element in the
   * overlay. Wire it to `Game.skipChapter()`.
   */
  onSkip?: () => void;
  /**
   * Where a sim point lands on the canvas — `DioramaScene.project`. The hint
   * arrow needs it and nothing else does, so a HUD built without one simply
   * stops the hint one step earlier instead of failing.
   */
  project?: (simX: number, simY: number, heightM?: number) => { x: number; y: number } | null;
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
  /** `I` — show or hide the run sheet. */
  toggleTasks(): void;
  /** `Escape`, or a click anywhere off the panel. */
  closeTasks(): void;
  /**
   * Left/right arrow while the sheet is open: turn between its two pages, the
   * night (the story, the run's goal) and this chapter (briefing, tasks). Returns
   * false when the sheet is shut, so the shell can spend the key on movement.
   */
  pageTasks(dir: number): boolean;
  /**
   * `H` — one more step of help on the task in hand.
   *
   * Escalating, and never past what the chapter published: whose job it is, then
   * the line of help in that robot's voice, then an arrow at the place. A task
   * with no `at` stops at the line, which is the honest answer rather than an
   * arrow pointing at nothing.
   */
  nudge(): void;
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

/**
 * HOW FAR `H` CAN GO ON ONE TASK, and which step a press lands on.
 *
 * Pure, exported and tested, because it is the only part of the nudge that has a
 * right answer: the DOM around it can only show what this returns.
 *
 * The ladder is 1 whose job it is, 2 the chapter's own line of help, 3 a ring on
 * the place. A task with no `who` has no step 1 and one with no `at` has no step
 * 3, so the escalation stops where the chapter's knowledge stops rather than
 * inventing a step it cannot back up — and a task that publishes none of the
 * three can still be asked, and says so, rather than swallowing the keypress.
 */
export function hintLines(task: Task): readonly string[] {
  if (task.hint === undefined) return [];
  return typeof task.hint === 'string' ? [task.hint] : task.hint;
}

/** Which rung the ring sits on: after every line the chapter published. */
export function markLevel(task: Task): number {
  // `Math.max(.., 1)` so a task with no hint at all keeps the ring on rung 3,
  // where it has always been, instead of sliding down into the empty rung.
  return 2 + Math.max(hintLines(task).length, 1);
}

export function nudgeStep(task: Task, was: number, canMark: boolean): number {
  const lines = hintLines(task).length;
  const hasMark = task.at !== undefined && canMark;
  const ring = markLevel(task);
  const top = hasMark ? ring : lines > 0 ? 1 + lines : 1;
  let level = was + 1;
  if (level === 1 && (task.who === undefined || task.who.length === 0)) level = 2;
  if (level === 2 && lines === 0) level = ring;
  return level > top ? top : level;
}

/** The switch key for each robot, so a hint can name the key it wants pressed. */
const BOT_KEY: Readonly<Record<RobotKind, string>> = { voxxy: '1', droid: '2', biggy: '3' };

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
/* The briefing moved off the top bar and into the run sheet — the bar carries the
   chapter's name and the keys, and nothing that has to be read twice. */
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
  text-align:left;animation:ad-rise-b .22s cubic-bezier(.2,.9,.3,1) both}
.ad-bubble::after{content:'';position:absolute;left:50%;bottom:-7px;width:12px;height:12px;
  margin-left:-6px;transform:rotate(45deg);background:rgba(10,11,14,.93);
  border-right:1px solid currentColor;border-bottom:1px solid currentColor}
.ad-bubble.ad-out{animation:ad-sink-b .34s ease-in forwards}

.ad-toasts{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);width:min(680px,74vw);
  display:flex;flex-direction:column;align-items:center;gap:6px}
.ad-toast{max-width:100%;padding:8px 15px;border-radius:9px;border-left:3px solid currentColor;
  background:rgba(10,11,14,.92);box-shadow:0 8px 28px rgba(0,0,0,.5);font-size:15px;text-align:center;
  animation:ad-rise .22s cubic-bezier(.2,.9,.3,1) both}
.ad-toast .ad-line{color:#f2efe9}
.ad-toast.ad-out{animation:ad-sink .34s ease-in forwards}
@keyframes ad-rise{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}
@keyframes ad-sink{to{opacity:0;transform:translateY(-10px)}}
/* A SPEECH BUBBLE CARRIES ITS OWN TRANSFORM, so it needs its own keyframes.
   .ad-bubble is anchored by its BOTTOM CENTRE - translate(-50%,-100%) - which is
   what puts the tail on the robot. The shared ad-rise ends on transform:none and
   runs with 'both', so that final frame persisted and silently cancelled the
   anchor: every bubble jumped half its width right and its whole height down the
   moment its entry animation finished. These keep the anchor in every frame. */
@keyframes ad-rise-b{from{opacity:0;transform:translate(-50%,-100%) translateY(18px) scale(.985)}
  to{opacity:1;transform:translate(-50%,-100%)}}
@keyframes ad-sink-b{from{opacity:1;transform:translate(-50%,-100%)}
  to{opacity:0;transform:translate(-50%,-100%) translateY(-10px)}}
@media (prefers-reduced-motion:reduce){
  .ad-toast,.ad-toast.ad-out{animation-duration:.01s}
  .ad-fill{transition:none}
}

/* THE RUN SHEET AND THE NUDGE — I and H.
   The meter lives in the bottom strip with the live progress line rather than
   replacing it: the line says what is happening right now, the meter says how
   much of the chapter is left, and they are different questions. */
.ad-tasks{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:5px}
.ad-pips{display:flex;gap:4px}
.ad-pip{width:16px;height:4px;border-radius:2px;background:rgba(242,239,233,.2)}
.ad-pip.ad-on{background:${ACCENT}}
.ad-count{font-size:12px;letter-spacing:.06em;color:${MUTED};font-variant-numeric:tabular-nums}
.ad-count b{color:#f2efe9;font-weight:600}
.ad-ask{font-size:11px;letter-spacing:.06em;color:${MUTED};opacity:.8}

/* The overlay root is pointer-events:none so the canvas keeps the pointer. The
   sheet takes them back, or a click ON the panel would land on the canvas and
   the click-outside rule would close the thing the player is reading. */
.ad-sheet{pointer-events:auto;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;
  width:min(560px,86vw);padding:18px 20px;border:1px solid ${ACCENT};border-radius:12px;
  background:rgba(10,11,14,.97);box-shadow:0 24px 80px rgba(0,0,0,.7)}
.ad-sheet h3{margin:0 0 4px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:${ACCENT}}
.ad-sheet .ad-sub{margin-bottom:10px;font-size:12px;color:${MUTED}}
.ad-brief{margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(242,239,233,.12);
  font-size:13px;line-height:1.45;color:#cdc9c2;max-height:34vh;overflow-y:auto}
.ad-brief b{color:${ACCENT};font-weight:600}
.ad-shead{margin:0 0 5px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${MUTED}}
.ad-story{max-height:none;color:#b9b4ac}
.ad-goal{margin-top:6px;color:#f2efe9}
.ad-peek{display:flex;align-items:center;justify-content:space-between;gap:12px;
  font-size:13px;color:#cdc9c2}
.ad-peek b{color:#f2efe9;font-weight:600;font-variant-numeric:tabular-nums}
.ad-peek .ad-key{color:${ACCENT};letter-spacing:.06em}
.ad-skeys{margin-top:12px;padding-top:11px;border-top:1px solid rgba(242,239,233,.12);
  font-size:12px;line-height:1.5;color:${MUTED}}
.ad-trow{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-top:1px solid rgba(242,239,233,.09);
  font-size:14px;line-height:1.3}
.ad-trow:first-of-type{border-top:0}
.ad-tick{flex:0 0 auto;width:15px;text-align:center;color:${MUTED}}
.ad-trow.ad-did .ad-tick{color:${ACCENT}}
.ad-trow.ad-did .ad-ttext{opacity:.5;text-decoration:line-through}
.ad-ttext{flex:1 1 auto}
.ad-twho{flex:0 0 auto;padding:1px 7px;border-radius:999px;font-size:11px;letter-spacing:.08em;
  border:1px solid currentColor}
.ad-tn{flex:0 0 auto;font-size:12px;color:${MUTED};font-variant-numeric:tabular-nums}

/* The arrow is drawn at the target, not from the robot: an arrow that starts at
   the robot has to be re-aimed every frame and reads as a tether. A ring that
   sits ON the thing, in the colour of whoever has to go there, answers "where"
   in one frame and says nothing about the route. */
.ad-mark{position:absolute;z-index:3;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
  border:2px solid currentColor;pointer-events:none;animation:ad-ping 1.4s ease-out infinite}
.ad-mark::after{content:'';position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;
  border-radius:50%;background:currentColor}
/* OFF SCREEN, the ring has nothing to sit on. Michele: "when showing the element,
   the glow is fine if it's in the view. If it's outside, there should be something
   pointing at it." So a chevron pinned to the edge, rotated to face it. */
.ad-edge{position:absolute;z-index:3;width:0;height:0;margin:-13px 0 0 -13px;
  border-left:15px solid currentColor;border-top:9px solid transparent;border-bottom:9px solid transparent;
  pointer-events:none;filter:drop-shadow(0 0 6px currentColor);animation:ad-nudge 1.1s ease-in-out infinite}
@keyframes ad-nudge{0%,100%{transform:rotate(var(--a)) translateX(0)}50%{transform:rotate(var(--a)) translateX(7px)}}
@media (prefers-reduced-motion:reduce){.ad-edge{animation:none}}
@keyframes ad-ping{0%{transform:scale(.55);opacity:1}70%{transform:scale(1);opacity:.35}100%{transform:scale(1.1);opacity:0}}
@media (prefers-reduced-motion:reduce){.ad-mark{animation:none;opacity:.9}}

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

/* THE PRESENTATION CARD. One robot at a time, with its own switch key — the
   opening teaches 1, 2 and 3 by using them rather than by listing them. Low in
   the frame, because the robot it names is in the middle of it. */
.ad-intro{position:absolute;left:0;right:0;bottom:12%;display:flex;align-items:center;
  justify-content:center;gap:14px;pointer-events:none}
.ad-intro .ad-ikey{display:grid;place-items:center;width:40px;height:40px;border-radius:9px;
  border:2px solid currentColor;font-size:22px;font-weight:800;line-height:1}
.ad-intro .ad-itext{text-align:left}
.ad-intro .ad-iname{font-size:24px;font-weight:800;letter-spacing:.1em;line-height:1.1}
.ad-intro .ad-iline{font-size:14px;letter-spacing:.06em;color:#e9e6df;opacity:.92}
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

/** Clear air left between two bubbles that would otherwise touch, in px. */
const BUBBLE_GAP = 6;

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
  /*
   * THE RUN SHEET'S METER, in the bottom strip above the live progress line.
   *
   * `GameSnapshot.tasks` is the chapter's own list and this is the smallest
   * honest view of it: one pip per task, filled as they land, and the count. It
   * does not replace the progress line under it — that line says what is
   * happening right now ("digits 2/4 · still dark: ..."), the meter says how much
   * of the chapter is left, and those are different questions.
   */
  const taskBar = el('div', 'ad-tasks', pad);
  const pipsWrap = el('div', 'ad-pips', taskBar);
  const pips: HTMLElement[] = [];
  const countEl = el('span', 'ad-count', taskBar);
  const askEl = el('span', 'ad-ask', taskBar);
  askEl.textContent = 'I run sheet · H hint';


  /* the run sheet (I) and the hint mark (H) */
  const sheet = el('div', 'ad-sheet ad-hide', root);
  const sheetTitle = el('h3', '', sheet);
  sheetTitle.textContent = 'Run sheet';
  const sheetSub = el('div', 'ad-sub', sheet);
  /*
   * THE BRIEFING LIVES HERE NOW. Michele: *"I'd remove this: and add it to the
   * panel on I. The bar stays only with key reminders?"*
   *
   * It was 60-84 words across the top of the frame — a permanent text band over
   * the diorama that folded to one line and could be clicked back. In the panel
   * it is read when it is wanted and takes no screen the rest of the time.
   */
  /*
   * The night itself, above the chapter's briefing: Stephan and the keys, and the
   * run's one goal. Michele: *"we lost the main story... Could we keep a general
   * objective + chapter briefing in the I panel?"* — the crate opening had
   * replaced the title card, which was the only place it was told.
   */
  /*
   * TWO PAGES, NOT ONE LONG PANEL. Michele, on the two stacked: *"too big / too
   * much to read... Maybe on I we can switch between main text and chapters with
   * arrow left/right?"* — and the night first. Page 0 is the story, page 1 the
   * chapter; the arrows turn, and a line under the title says so.
   */
  const sheetStory = el('div', 'ad-brief ad-story', sheet);
  sheetStory.innerHTML = `<div class="ad-shead">The night</div>${STORY}<div class="ad-goal">${GOAL}</div>`;
  const chapterHead = el('div', 'ad-shead', sheet);
  chapterHead.textContent = 'This chapter';
  const sheetBrief = el('div', 'ad-brief', sheet);
  const sheetRows = el('div', '', sheet);
  /*
   * WHAT THE BRIEFING SHOWS INSTEAD OF THE TASK LIST.
   *
   * Michele, 25 Sep 2026, on the panel that opens with the chapter: *"I'll hide
   * this from the starting splash page, it's a kind of spoiler. Could show the
   * meter? and a key to expand to this?"*
   *
   * He is right, and it is the same panel doing two jobs. Opened BY the chapter
   * it is a briefing — it should set the scene and say how much there is to do,
   * and listing "light the orange + green mix" before the player has seen a lamp
   * hands them the answer to a puzzle they have not met. Opened BY `I` it is a
   * run sheet, asked for, and then the rows are the whole point.
   *
   * So the sheet has two states and `sheetFull` is which: the briefing carries
   * this line — the count, and the key that expands it — and the run sheet
   * carries the rows.
   */
  const sheetPeek = el('div', 'ad-peek', sheet);
  /*
   * THE KEYS, AGAIN, AT THE BOTTOM OF THE SHEET. Michele: *"runsheet should also
   * have the commands recap."*
   *
   * They are still along the top bar, where they are a glance. Here they are a
   * read: the panel is already the one place a player goes when they do not know
   * what to do, and having to close it to find out which key climbs is exactly
   * the moment it should answer.
   */
  const sheetKeys = el('div', 'ad-skeys', sheet);
  const mark = el('div', 'ad-mark ad-hide', root);
  const edge = el('div', 'ad-edge ad-hide', root);
  let sheetOpen = false;
  /** Which page: 0 the night, 1 this chapter. */
  let sheetPage = 1;
  /** Is the sheet showing its rows, or only the briefing and the meter? See `sheetPeek`. */
  let sheetFull = false;
  /**
   * How much help the player has asked for on the task in hand, keyed by its id
   * so it survives the task list being rebuilt every frame — and so moving on to
   * the next task starts again from nothing.
   */
  const nudges = new Map<string, number>();

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

  /**
   * The per-robot card: its switch key, its name and one line. Coloured with the
   * robot's own lamp colour, which is the same colour its chip in the switcher
   * carries, so the connection is made before the player has touched anything.
   */
  const intro = el('div', 'ad-intro ad-hide', root);
  const introKey = el('div', 'ad-ikey', intro);
  const introText = el('div', 'ad-itext', intro);
  const introName = el('div', 'ad-iname', introText);
  const introLine = el('div', 'ad-iline', introText);

  const card = el('div', 'ad-card ad-hide', root);
  const cardBox = el('div', 'ad-cardbox', card);

  host.appendChild(root);

  const textCache = new Map<HTMLElement, string>();
  const htmlCache = new Map<HTMLElement, string>();
  const styleCache = new Map<string, string>();
  let lastChrome = -1;
  let disposed = false;
  /** The last snapshot `update` was handed, for the two key-driven methods. */
  let lastSnap: GameSnapshot | null = null;
  /** The chapter whose briefing has already been put up. See `update`. */
  let briefedFor = -1;

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
    /*
     * THE BOTTOM STRIP IS THE METER NOW, plus chapter 1's four keypad cells.
     *
     * It used to end in `GameSnapshot.progress` — a full sentence of live state
     * ("digits 0/4 · still dark: orange + green, ... · keypad: drive up to the
     * fire door to type"). Michele: *"This also can go, it's the old version of
     * the meter"*, and he is right: the run sheet says the same things better —
     * the sub-count is a row's `n / of`, and "still dark" is four rows that tick
     * off. Two readouts of one fact is one too many.
     *
     * `progress` stays on the snapshot. Several chapter tests read it as the
     * chapter's own state line (`tests/chapters.test.ts` — "router ✓",
     * "password known", "(2/13)"), and those are real assertions about the sim
     * that would be lost, not HUD assertions.
     */
    const showPad = snap.opening === null && snap.chapter >= 1 && snap.phase !== 'done' && snap.tasks.length > 0;
    pad.classList.toggle('ad-hide', !showPad);
    const show = snap.chapter === 1 && snap.phase !== 'done';
    cellsWrap.classList.toggle('ad-hide', !show);
    if (!showPad || !show) return;
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
  }

  /* ------------------------------------------------ the run sheet, I and H */

  /** The task the player is on: the first one not done. */
  function current(snap: GameSnapshot): Task | undefined {
    return snap.tasks.find((t) => !t.done);
  }

  /** A robot's own lamp colour, so every mention of it speaks the same language. */
  function lampOf(snap: GameSnapshot, kind: RobotKind): string {
    const bot = snap.bots.find((b) => b.kind === kind);
    return rgb(bot?.light.c ?? LAMP_FALLBACK[kind]);
  }

  function updateTaskBar(snap: GameSnapshot): void {
    const list = snap.tasks;
    // A chapter that has not been taught to publish a list gets no meter — never
    // an empty one, which would read as "nothing to do".
    taskBar.classList.toggle('ad-hide', list.length === 0);
    if (list.length === 0) return;
    while (pips.length < list.length) pips.push(el('div', 'ad-pip', pipsWrap));
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle('ad-hide', i >= list.length);
      pips[i].classList.toggle('ad-on', i < list.length && list[i].done);
    }
    const done = list.reduce((n, t) => n + (t.done ? 1 : 0), 0);
    setHtml(countEl, `<b>${done}</b> / ${list.length}`, htmlCache);
  }

  function updateSheet(snap: GameSnapshot): void {
    const open =
      sheetOpen && snap.phase === 'play' && snap.opening === null && snap.card === null && snap.tasks.length > 0;
    sheet.classList.toggle('ad-hide', !open);
    if (!open) return;
    const done = snap.tasks.reduce((n, t) => n + (t.done ? 1 : 0), 0);
    setText(sheetSub, `${CHAPTER_TITLES[snap.chapter] ?? ''} — ${done} of ${snap.tasks.length} done`, textCache);
    setHtml(sheetBrief, snap.objective, htmlCache);
    const story = sheetPage === 0;
    sheetStory.classList.toggle('ad-hide', !story);
    chapterHead.classList.toggle('ad-hide', story);
    sheetBrief.classList.toggle('ad-hide', story);
    setText(sheetKeys, snap.keys, textCache);
    // Rebuilt rather than diffed: the sheet is open only while the player is
    // reading it, the lists are five rows long, and a diff here would be cost
    // with no frame to spend it on.
    sheetTitle.textContent = story ? 'Briefing \u00b7 the night' : sheetFull ? 'Run sheet' : 'Briefing';
    sheetPeek.classList.toggle('ad-hide', sheetFull && !story);
    sheetRows.classList.toggle('ad-hide', !sheetFull || story);
    if (story) {
      setHtml(sheetPeek, `<span>\u2192 this chapter</span><span class="ad-key">\u2190 \u2192 turn the page</span>`, htmlCache);
      return;
    }
    if (!sheetFull) {
      setHtml(
        sheetPeek,
        `<span><b>${snap.tasks.length}</b> things to do here, <b>${done}</b> done</span>` +
          `<span class="ad-key">\u2190 the night \u00b7 I \u2014 the run sheet</span>`,
        htmlCache,
      );
      setText(sheetKeys, snap.keys, textCache);
      return;
    }
    sheetRows.textContent = '';
    for (const t of snap.tasks) {
      const row = el('div', `ad-trow${t.done ? ' ad-did' : ''}`, sheetRows);
      const tick = el('span', 'ad-tick', row);
      tick.textContent = t.done ? '\u2713' : '\u25cb';
      const text = el('span', 'ad-ttext', row);
      text.textContent = t.text;
      if (t.of !== undefined) {
        const n = el('span', 'ad-tn', row);
        n.textContent = `${t.n ?? 0} / ${t.of}`;
      }
      /*
       * NO ROBOT CHIP HERE. Michele: *"I'd leave out the robot name here
       * (moreover some task need multiple robots). That's already a big hint"*.
       *
       * The sheet says what is left to do; working out who does it is the game.
       * `who` stays in the data because `H` is where a player ASKS for that, and
       * an answer you asked for is not a spoiler.
       */
    }
  }

  /**
   * THE HINT MARK. A ring on the thing, in the colour of whoever has to go there.
   *
   * Drawn at the target rather than from the robot: an arrow that starts at the
   * robot has to be re-aimed every frame and reads as a tether telling you the
   * route. "Where" is the question a stuck player is asking, and a ring answers
   * it in one frame and says nothing about how to get there.
   */
  function updateMark(snap: GameSnapshot): void {
    const t = current(snap);
    const level = t ? (nudges.get(t.id) ?? 0) : 0;
    const at = t?.at;
    const p = level >= 3 && at && opts.project ? opts.project(at.x, at.y, 0.4) : null;
    if (p === null) {
      mark.classList.add('ad-hide');
      edge.classList.add('ad-hide');
      return;
    }
    // One ring, so one colour: the first robot named, or the house accent when a
    // task belongs to nobody in particular.
    const who = t?.who;
    const colour = who && who.length > 0 ? lampOf(snap, who[0]) : ACCENT;

    /*
     * ON SCREEN it is a ring on the thing. OFF SCREEN a ring is drawn outside the
     * frame and the player sees nothing at all, which is worse than no hint —
     * they asked and got silence. Michele: *"If it's outside, there should be
     * something pointing at it."*
     *
     * So the target is clamped to an inset border and a chevron is pinned there,
     * rotated along the line from the middle of the screen to where the thing
     * actually is. The inset keeps the whole arrow on the canvas; the rotation is
     * computed from the UNCLAMPED point, or every arrow on an edge would point
     * along it instead of at the target.
     */
    const w = root.clientWidth || 1;
    const h = root.clientHeight || 1;
    const inset = 34;
    const outside = p.x < inset || p.x > w - inset || p.y < inset || p.y > h - inset;
    mark.classList.toggle('ad-hide', outside);
    edge.classList.toggle('ad-hide', !outside);
    if (!outside) {
      mark.style.left = `${Math.round(p.x)}px`;
      mark.style.top = `${Math.round(p.y)}px`;
      mark.style.color = colour;
      return;
    }
    const cx = w / 2;
    const cy = h / 2;
    const ang = Math.atan2(p.y - cy, p.x - cx);
    edge.style.left = `${Math.round(Math.min(Math.max(p.x, inset), w - inset))}px`;
    edge.style.top = `${Math.round(Math.min(Math.max(p.y, inset), h - inset))}px`;
    edge.style.color = colour;
    edge.style.setProperty('--a', `${ang}rad`);
    edge.style.transform = `rotate(${ang}rad)`;
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

  /**
   * Put one line on screen, as a bubble over its speaker or in the stack.
   *
   * Extracted from `updateToasts` so `nudge()` can say something without
   * inventing a second way of speaking: a hint is a line like any other and the
   * player should not be able to tell where it came from.
   */
  function pushLine(text: string, snap: GameSnapshot, lifeMs: number): void {
    const now = performance.now();
    const speaker = speakerOf(text);
    const node = el('div', speaker ? 'ad-bubble' : 'ad-toast');
    const colour = toastColour(text, snap);
    node.style.color = rgb(colour);
    if (!speaker) {
      node.style.background = `linear-gradient(90deg, ${rgba(colour, 0.2)}, rgba(10,11,14,.93) 58%)`;
    }
    const line = el('span', 'ad-line', node);
    /*
     * MARKUP, LIKE EVERY OTHER LINE THE SIM WRITES — and this was a bug.
     *
     * Michele: *"There's some html code in toast, not rendered."* The chapters
     * have always written `<b>` into their toasts — the breaker circuits, the
     * password, `SHIRTS &amp; GADGETS` — because the briefing and the objective
     * take the same simple markup, and this one path set `textContent`. So the
     * emphasis the sentence was built around arrived on screen as literal tags
     * and an `&amp;`.
     *
     * Same trusted source as `setHtml`: these strings come from `src/sim`, which
     * is ours. Nothing a player types ever reaches here.
     */
    line.innerHTML = text;
    (speaker ? bubbles : toasts).appendChild(node);
    live.push({ node, text, dieAt: now + lifeMs, removeAt: now + lifeMs + 340, out: false, speaker });
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
          pushLine(t.t, snap, life);
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
    /*
     * TWO ROBOTS STANDING TOGETHER SPEAK OVER EACH OTHER. Each bubble hangs at
     * its own speaker's anchor, so when the robots are a metre apart on screen
     * the boxes land on top of one another and the one underneath is unreadable
     * — Michele: "sometimes the toast are multiple and not all are visible".
     *
     * So place them, then separate them. The lowest bubble keeps its spot (it is
     * the one closest to its robot, and the tail has to point somewhere true);
     * every bubble above it that would still touch it is lifted clear. Only
     * boxes whose horizontal spans actually cross are pushed — bubbles side by
     * side stay at their own height.
     */
    const placed: { l: number; r: number; top: number; bot: number }[] = [];
    const rows: { lt: LiveToast; x: number; y: number; bw: number; bh: number }[] = [];
    for (const lt of live) {
      if (!lt.speaker) continue;
      const at = anchors[lt.speaker];
      if (!at) {
        lt.node.style.opacity = '0';
        continue;
      }
      lt.node.style.opacity = '';
      const bw = lt.node.offsetWidth || 0;
      const bh = lt.node.offsetHeight || 0;
      rows.push({
        lt,
        x: Math.min(Math.max(at.x, 180), w - 180),
        y: Math.min(Math.max(at.y - 18, 92), h - 40),
        bw,
        bh,
      });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      let y = r.y;
      const l = r.x - r.bw / 2;
      const rt = r.x + r.bw / 2;
      // Lift until nothing is left to clear. Each pass can expose a new
      // neighbour above, so keep going rather than resolving once.
      for (let guard = 0; guard < placed.length + 1; guard++) {
        let lift = 0;
        for (const q of placed) {
          if (rt <= q.l || l >= q.r) continue;
          const top = y - r.bh;
          if (top >= q.bot || y <= q.top) continue;
          lift = Math.max(lift, y - q.top + BUBBLE_GAP);
        }
        if (lift <= 0) break;
        y -= lift;
      }
      // Never push one off the top of the canvas; an overlap there beats a
      // bubble nobody can see at all.
      y = Math.max(y, r.bh + 8);
      placed.push({ l, r: rt, top: y - r.bh, bot: y });
      r.lt.node.style.left = `${Math.round(r.x)}px`;
      r.lt.node.style.top = `${Math.round(y)}px`;
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
    // `I` and `H` are keypresses, not frames, so they need the last snapshot the
    // HUD was given rather than one of their own.
    lastSnap = snap;
    /*
     * OPENED ONCE A CHAPTER, and only once. The briefing is no longer anywhere
     * else, so a player who never presses `I` would never read it — but a panel
     * that reopens every time the chapter state twitches is worse than the text
     * band it replaced. `briefedFor` is the chapter it has already been shown
     * for, so Esc, a click or `I` close it for good until the next one.
     */
    /*
     * ...and only once the chapter CARD is gone.
     *
     * It opened the moment the chapter went live, which put two panels on the
     * screen at once — the card saying what this chapter is, and the briefing
     * saying the same thing at length across the middle of it. Michele's *"I'll
     * hide this from the starting splash page"* is about a panel he could see
     * through another panel. Card, then briefing, then play.
     */
    if (snap.phase === 'play' && snap.opening === null && snap.card === null && snap.chapter !== briefedFor) {
      briefedFor = snap.chapter;
      sheetOpen = true;
      // The chapter opens the BRIEFING. `I` is what turns it into the run sheet.
      sheetFull = false;
      // The run opens on the night; every later chapter on its own page.
      sheetPage = snap.chapter === 1 ? 0 : 1;
    }

    setText(chapterEl, CHAPTER_TITLES[snap.chapter] ?? CHAPTER_TITLES[0], textCache);
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
    const who = snap.opening?.card ?? null;
    intro.classList.toggle('ad-hide', who === null);
    if (who !== null) {
      const c = INTRO_CARDS[who];
      const bot = snap.bots.find((b) => b.kind === who);
      setText(introKey, String(c.key), textCache);
      setText(introName, c.name, textCache);
      setText(introLine, c.line, textCache);
      if (bot) setStyle(intro, 'introcol', 'color', rgb(bot.light.c), styleCache);
    }
    left.classList.toggle('ad-hide', opening);
    meters.classList.toggle('ad-hide', opening);
    // The top bar keeps only the one thing that is true during the opening: that
    // a key skips it. The chapter's name and briefing arrive when the chapter does.
    chapterEl.classList.toggle('ad-hide', opening);
    if (opening) {
      sheet.classList.add('ad-hide');
      mark.classList.add('ad-hide');
      edge.classList.add('ad-hide');
    }

    updateChips(snap);
    updateSpeed(snap);
    updateKeypad(snap);
    updatePrompt(snap);
    updateMeters(snap);
    updateToasts(snap);
    placeBubbles(anchors);
    updateTaskBar(snap);
    updateSheet(snap);
    updateMark(snap);
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
    window.removeEventListener('click', onRootClick);
    live.length = 0;
    promptCells.length = 0;
    meterRows.clear();
    textCache.clear();
    htmlCache.clear();
    styleCache.clear();
    root.remove();
    style.remove();
  }

  /**
   * `I`, three ways: open the run sheet, expand the briefing into it, close it.
   *
   * The middle case is the one Michele asked for — the panel the chapter opens is
   * a briefing with a meter on it, and `I` is the key that expands it (see
   * `sheetPeek`). From anywhere else `I` goes straight to the rows, because a
   * player who presses it has asked for them.
   */
  function pageTasks(dir: number): boolean {
    if (!sheetOpen) return false;
    sheetPage = dir < 0 ? 0 : 1;
    return true;
  }
  function toggleTasks(): void {
    if (sheetOpen && sheetPage === 0) {
      sheetPage = 1;
      return;
    }
    if (sheetOpen && !sheetFull) {
      sheetFull = true;
      return;
    }
    sheetOpen = !sheetOpen;
    sheetFull = true;
  }

  function closeTasks(): void {
    sheetOpen = false;
  }

  /*
   * Michele: *"esc ok click outside should close the panel"*. `I` opens it and
   * the two ways anybody expects to get rid of a panel close it.
   *
   * The click listener is on the OVERLAY ROOT rather than the window: the HUD
   * root already sits over the canvas, and a listener on the window would also
   * catch the click that the Skip button is in the middle of handling.
   */
  const onRootClick = (ev: MouseEvent): void => {
    if (!sheetOpen) return;
    if (sheet.contains(ev.target as Node)) return;
    sheetOpen = false;
  };
  window.addEventListener('click', onRootClick);

  /*
   * ONE PRESS, ONE MORE STEP, AND NEVER PAST WHAT THE CHAPTER PUBLISHED.
   *
   * 1 — whose job it is. Most of being stuck in this game is having the wrong
   *     robot selected, so the first answer is the cheapest one that is usually
   *     right, and it is said in that robot's own voice and colour.
   * 2 — the chapter's own line of help. Never the answer: the nudge that gets a
   *     stuck player moving again. A task with a gate in front of it publishes
   *     SEVERAL, nearest obstacle first, and they get a rung each (`Task.hint`).
   * last — a ring on the place.
   *
   * A task with no `who` has no step 1 and one with no `at` has no step 3, so the
   * escalation stops where the chapter's own knowledge stops rather than
   * inventing a step it cannot back up. The count is kept per task id, so moving
   * on to the next task starts again from nothing.
   */
  function nudge(): void {
    const snap = lastSnap;
    if (!snap || snap.phase !== 'play' || snap.opening !== null) return;
    const t = current(snap);
    if (!t) return;
    const hasMark = t.at !== undefined && opts.project !== undefined;
    const level = nudgeStep(t, nudges.get(t.id) ?? 0, opts.project !== undefined);
    nudges.set(t.id, level);
    const life = 4200;
    if (level === 1 && t.who !== undefined && t.who.length > 0) {
      // Every robot it needs, because plenty need two and naming one of them is
      // a wrong answer rather than half an answer.
      const names = t.who.map((k) => `${k[0].toUpperCase()}${k.slice(1)} (${BOT_KEY[k]})`);
      pushLine(
        t.who.length === 1
          ? `${names[0]}: this one is mine.`
          : `${names.join(' and ')} — this one takes both of us.`,
        snap,
        life,
      );
    } else if (level >= 2 && level - 2 < hintLines(t).length) {
      // One rung per line, nearest obstacle first: the gate in front of the task
      // before the task itself. See `Task.hint`.
      pushLine(hintLines(t)[level - 2], snap, life);
    } else if (level === markLevel(t) && hasMark) {
      pushLine('Look for the ring.', snap, life);
    } else {
      pushLine('That is everything anybody knows about this one.', snap, life);
    }
  }

  return { update, toggleTasks, closeTasks, pageTasks, nudge, dispose, root };
}
