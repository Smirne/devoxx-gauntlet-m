/**
 * The four chapters, and the contract between them and `src/sim/game.ts`.
 *
 * A chapter is a *closure over a context*, not a bag of globals: `setup(ctx)` builds
 * its world (walls, props, NPCs) and returns a `ChapterRuntime` that owns its own
 * state for the rest of the chapter. That is the one structural change from the
 * prototype `reference/poc/10-after-dark-kinepolis.html`, where the four chapters
 * shared module-level objects `N`, `X`, `L`, `K` — and it is what lets `startChapter`
 * be called twice in a row (tests, the debug overlay, `R`) without a stale flag from
 * the previous run deciding the next one.
 *
 * Everything else is ported verbatim in behaviour. Numbers that the prototype spelled
 * out inline live in `../constants` and are imported, never re-declared.
 */

import type {
  Bot,
  Clue,
  CutRoute,
  LightSource,
  Mirror,
  Person,
  Prop,
  RobotKind,
  ViewRect,
  Wall,
} from '../types';

/** Velocity as it was before `stepBot` ran — the pot needs the jerk, not the speed. */
export interface PrevVel {
  vx: number;
  vy: number;
}

/**
 * The services a chapter may use. `game.ts` implements exactly this and nothing else
 * reaches into it, which is what keeps "no game logic in render code" checkable: the
 * renderer is handed a snapshot, never a `ChapterCtx`.
 */
export interface ChapterCtx {
  /** The three robots, always in order voxxy, droid, biggy. */
  readonly bots: Bot[];
  /** The live wall list. Chapters push and splice it, as the prototype did. */
  readonly walls: Wall[];
  /** Replace the whole wall list *in place*, so the snapshot keeps its reference. */
  setWalls(next: Wall[]): void;
  /** Drop a wall if it is still there. Doors that open call this. */
  removeWall(w: Wall): void;
  byKind(kind: RobotKind): Bot;
  /** Teleport the three robots and stop them dead (the prototype's `place`). */
  place(v: readonly [number, number], d: readonly [number, number], b: readonly [number, number]): void;
  /** Sim seconds since the run started. */
  readonly t: number;
  /** Index into `bots` of the robot being driven. Chapters may hand over control. */
  cur: number;
  /** A toast, in the speaking robot's voice where there is one. */
  flash(text: string, ms?: number): void;
  /** A full-screen card that pauses play until a key is pressed. */
  card(text: string): void;
  objective(line: string, keys: string): void;
  setView(v: ViewRect): void;
  setFloor(f: 'up' | 'down'): void;
  /** Deterministic 0..1. `Math.random` is never called inside `src/sim`. */
  rng(): number;
  /** The shared step: stick to the active robot, physics, mount, robot-robot. */
  stepAll(dt: number, afterStep?: (b: Bot, before: PrevVel) => void): void;
  pushBiggy(dt: number): void;
  /** E next to a standing Biggy: Droid climbs on or off, control follows the tower. */
  toggleMount(): void;
  /** 1/2/3 switch the driven robot (suppressed while typing at a keypad). */
  switchKey(code: string): void;
  startCut(routes: CutRoute[], next: () => void, view: ViewRect): void;
  startChapter(n: number): void;
  /** A losing end state: the card explains it, `R` or Skip chapter moves on. */
  fail(text: string): void;
  /** The winning end state of chapter 4. */
  finish(): void;
  /** Flat, so the HUD and the final card can read it without chapter knowledge. */
  readonly score: Record<string, number>;
  readonly swag: string[];
  /** Swag is worth 0.5 points each on the final card. */
  addSwag(id: string, toastText: string): void;
}

/** One chapter, once it has been set up. Everything but `update`/`key` is snapshot data. */
export interface ChapterRuntime {
  key(code: string): void;
  update(dt: number): void;
  props?(): Prop[];
  people?(): Person[];
  clues?(): Clue[];
  mirrors?(): Mirror[];
  /**
   * Visibility polygons for this frame, when the chapter's mechanic needs them.
   * Only the two dark chapters pay for them: chapter 1 the whole way through, and
   * chapter 2 until the breakers go in. Once the house lights are on, the prototype
   * stops casting too, and the renderer lights the room instead.
   */
  lights?(): LightSource[];
  /** Chapter 1's keypad buffer. */
  entered?(): string;
  /**
   * Rebuild whatever this chapter derives from where the robots ARE, running none
   * of its rules. The cutscene runner walks the robots itself and never calls
   * `update`, so chapter 1's lamps used to stay behind at the fire door for the
   * whole transition: the three of them walked the length of a blacked-out
   * corridor carrying light sources that were still shining on the keypad. Called
   * once a frame while a cutscene is walking, and by nothing else.
   */
  relight?(): void;
  /**
   * One short line of live progress for the HUD's bottom-centre readout, rebuilt
   * every frame (`GameSnapshot.progress`). Every chapter implements it: without
   * one a chapter shows the player a static briefing and no running score of what
   * is actually left, which is the difference between a puzzle and a guess.
   */
  progress?(): string;
  /**
   * Move one of this chapter's loose bodies (the cake crate, the shuffleboard duck).
   * Tests and the debug overlay use it to set up a shove without driving halfway
   * across the venue first; nothing in normal play calls it. Returns false when this
   * chapter has no such body.
   */
  placeProp?(kind: string, x: number, y: number): boolean;
  /** Read-only internals, for tests and the debug overlay. */
  state(): ChapterState;
}

export interface ChapterDef {
  n: number;
  title: string;
  setup(ctx: ChapterCtx): ChapterRuntime;
}

import { ch1Night, type NightState } from './ch1-night';
import { ch2Expo, type ExpoState } from './ch2-expo';
import { ch3Breakfast, type BreakfastState } from './ch3-breakfast';
import { ch4Keynote, type KeynoteState } from './ch4-keynote';

export type { NightState, ExpoState, BreakfastState, KeynoteState };

/** The union a `ChapterRuntime.state()` may return; narrow it on `snapshot().chapter`. */
export type ChapterState = NightState | ExpoState | BreakfastState | KeynoteState;

/** The chapter manifest, in play order. Index 0 is the title card. */
export const CHAPTERS: readonly ChapterDef[] = [ch1Night, ch2Expo, ch3Breakfast, ch4Keynote];

export { ch1Night, ch2Expo, ch3Breakfast, ch4Keynote };
