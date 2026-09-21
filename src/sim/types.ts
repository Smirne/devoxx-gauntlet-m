/**
 * After Dark — shared simulation types.
 *
 * `src/sim` is the only source of truth for game state. `src/render` may READ these
 * structures and must never mutate them or contain game logic. See CLAUDE.md.
 *
 * All sim coordinates are *map pixels* on the 1900x700 prototype canvas
 * (`reference/poc/10-after-dark-kinepolis.html`), +x right, +y down.
 * The renderer converts to metres with `PX_PER_M` from `./units`.
 */

export type RobotKind = 'voxxy' | 'droid' | 'biggy';

export interface Vec2 {
  x: number;
  y: number;
}

/** An axis-aligned rectangle in sim pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LightType = 'cone' | 'pool';

/** A robot's lamp, as defined by its species. */
export interface LampDef {
  /** RGB 0-255, additive when light polygons overlap. */
  c: [number, number, number];
  type: LightType;
  /** Half-angle in radians. Cones only. */
  ang?: number;
  range: number;
}

/** Frozen per-robot physical identity. See `constants.ts`. */
export interface RobotDef {
  name: string;
  /** Collision radius, sim px. */
  r: number;
  /** Velocity approach rate toward the input target, s^-1. */
  accel: number;
  /** Top speed, px/s. */
  max: number;
  /** Velocity decay rate with no input, s^-1. */
  drag: number;
  /** Relative mass for robot-robot impulses. */
  mass: number;
  color: string;
  eye: string;
  belly?: string;
  /** Too tall for low passages; can climb onto Biggy. */
  tall?: boolean;
  light: LampDef;
}

/** Mutable per-robot state. */
export interface Bot extends RobotDef {
  kind: RobotKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Heading in radians, updated only while actually moving. */
  face: number;
  /** Gait phase accumulator, advanced by distance travelled. */
  anim: number;
  /** Input stick, -1..1 each axis, normalised in stepBot. */
  ix: number;
  iy: number;
  /** Droid riding Biggy. */
  mounted: boolean;
  /** Planted: infinite effective mass, ignores input. */
  braced: boolean;
  /** Transient speed cap above `max`, granted by a push; decays at 1.5 s^-1. */
  boostCap?: number;
  /** Timestamp of the last "X pushes Biggy" toast, sim seconds. */
  pushFlash?: number;
}

/**
 * A wall slab. Walls block robots; `glass` and `low` walls do not block light,
 * so they still cast no shadow in the visibility polygons.
 */
export interface Wall extends Rect {
  /** Blocks robots, passes light (kiosk glazing). */
  glass?: boolean;
  /** Blocks robots, passes light (seat rows, tables, desks). */
  low?: boolean;
  /** Not drawn (invisible collider, e.g. the Voxxy-sized kiosk hatch). */
  hidden?: boolean;
  /** Robots for which this wall does not exist at all. */
  skipFor?: (b: Bot) => boolean;
  /**
   * Per-robot explanation shown on bump, in that robot's voice.
   * Return null to stay silent for that robot.
   */
  why?: (b: Bot) => string | null;
  /**
   * Custom response. Return true to consume the hit (no push-out, no bounce)
   * — used by breakable doors.
   */
  onHit?: (b: Bot, hit: Hit) => boolean;
  /** Marks a staircase mouth: -1 top niche, 1 bottom niche, 0 main staircase. */
  stair?: number;
  /** Tag used by chapter code and by the renderer to pick geometry/materials. */
  kind?: string;
  /** Back-reference for booth walls. */
  booth?: Booth;
}

export interface Hit {
  nx: number;
  ny: number;
  pen: number;
}

/** A first-floor auditorium. Numbered rooms are Devoxx's 3..10; 'A'..'E' are the closed cinema section. */
export interface RoomDef {
  n: number | string;
  x: number;
  w: number;
  y: number;
  h: number;
  /** -1 = top row (10, 9, 8, 7 and A, B, C), 1 = bottom row (3, 4, 5, 6 and D, E). */
  side: -1 | 1;
  /** Part of the closed cinema section (chapter 1). */
  closed: boolean;
}

export interface Booth extends Rect {
  name: string;
  /** A half table with a cloth: Voxxy fits under it, nobody else does. */
  table: boolean;
  col: number;
  row: number;
}

/** A computed light source with its visibility polygon. */
export interface LightSource {
  x: number;
  y: number;
  face: number;
  c: [number, number, number];
  type: LightType;
  ang?: number;
  range: number;
  /** Which robot's lamp this is (primary or its mirror bounce). */
  owner: RobotKind;
  /** False for mirror reflections. */
  primary: boolean;
  poly: Vec2[];
  /** Pool lights cover the full circle. */
  full?: boolean;
}

/** The cinema screen: a horizontal mirror segment that re-emits light. */
export interface Mirror {
  x0: number;
  x1: number;
  y: number;
  /** Which way the reflective face points: -1 up, 1 down. */
  ny: -1 | 1;
}

/** A light-mix enigma: a point that must sit inside all of `need` at once. */
export interface Clue {
  x: number;
  y: number;
  /** Which robots' lamps must reach it simultaneously. */
  need: RobotKind[];
  /** The digit revealed, 0-9, randomised per run. */
  digit: number;
  /** Position in the four-digit code. */
  slot: number;
  found: boolean;
  label: string;
}

/** The camera rect a chapter shows, in sim px. */
export type ViewRect = Rect;

export interface Toast {
  t: string;
  until: number;
}

/** A cutscene waypoint route for one robot. */
export interface CutRoute {
  kind: RobotKind;
  pts: Vec2[];
}

export type Phase = 'intro' | 'play' | 'cut' | 'done';

/* ================================================================ render facade
 *
 * The renderer only ever reads a `GameSnapshot`. It must not mutate it and must
 * not contain game logic (CLAUDE.md). Everything the diorama needs to draw a frame
 * is reachable from here.
 */

/** A conference-goer, catering worker, Stephan, or the hiding keynote speaker. */
export interface Person {
  x: number;
  y: number;
  r: number;
  /** Drawn above the head when present. */
  name?: string;
  colour?: string;
  hat?: boolean;
  /** 'visitor' | 'queue' | 'stephan' | 'speaker' | 'staff' */
  role: string;
  /** Lane-walk target. */
  tx?: number;
  ty?: number;
}

/**
 * A chapter-specific piece of set dressing or interactive object, described by the
 * sim so the renderer can pick a mesh for it without knowing the rules.
 * `kind` values are stable strings, e.g. 'breaker', 'roller', 'keypad', 'pot',
 * 'ladle', 'cake', 'banner', 'spotlight', 'cable', 'booth', 'seatrow', 'screen',
 * 'projector-panel', 'printer', 'rack', 'gate', 'firedoor', 'stair', 'sign'.
 */
export interface Prop {
  kind: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** 'idle' | 'active' | 'done' | 'broken' | 'open' | 'shut' */
  state?: string;
  label?: string;
  /** For the cable: the polyline laid so far. */
  pts?: Vec2[];
  /** Free-form extras a specific prop needs (fill level, spin, digit). */
  v?: number;
}

/** Everything the renderer reads for one frame. */
export interface GameSnapshot {
  chapter: number;
  phase: Phase;
  /** Sim seconds since the chapter started. */
  t: number;
  /** Which level is on screen. */
  floor: 'up' | 'down';
  view: ViewRect;
  bots: Bot[];
  /** Index into `bots` of the robot the player is driving. */
  active: number;
  walls: Wall[];
  lights: LightSource[];
  mirrors: Mirror[];
  clues: Clue[];
  props: Prop[];
  people: Person[];
  /** HUD line: the current objective, may contain simple markup. */
  objective: string;
  /** HUD line: the controls that matter right now. */
  keys: string;
  toast: Toast | null;
  /** 0 = clear, 1 = black. Cutscenes and chapter transitions. */
  fade: number;
  /** A full-screen card that pauses play until dismissed. */
  card: string | null;
  /** The keypad code being typed, chapter 1. */
  entered: string;
  score: Record<string, number>;
  swag: string[];
}

/** The headless game. `src/render` holds one of these and only reads its snapshot. */
export interface Game {
  snapshot(): GameSnapshot;
  /** Advance the sim. `dt` is already clamped to DT_MAX by the caller. */
  update(dt: number): void;
  /** A KeyboardEvent.code, on keydown, non-repeating. */
  key(code: string): void;
  /** Movement stick, each axis -1..1. */
  setStick(x: number, y: number): void;
  skipChapter(): void;
  /** Jump straight to a chapter — used by tests and the debug overlay. */
  startChapter(n: number): void;
}
