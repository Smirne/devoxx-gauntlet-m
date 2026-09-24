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

/**
 * A piece of floor that stands above its storey's datum — something a robot walks
 * ON rather than into.
 *
 * The raised lobby, the six steps up to it, the main flight, and the door leaf
 * Biggy has just put on the floor of cinema E are all the same thing said four
 * ways. See `src/sim/surface.ts` for why this is sim state and not a number the
 * renderer works out for itself, and `riseAt` for how it is read.
 */
export interface Plate extends Rect {
  /** What it is, for readability and for the sweeps' failure messages. */
  kind?: string;
  /**
   * Height of the surface above the storey datum, metres — at the LOW edge of
   * `axis` when this plate is a ramp, and everywhere when it is not.
   */
  lo: number;
  /** ...and at the high edge. Omitted, or equal to `lo`, means a flat plate. */
  hi?: number;
  /** Which axis a ramp climbs along. Ignored by a flat plate. Default `'x'`. */
  axis?: 'x' | 'y';
  /**
   * Yaw of the footprint about its own centre, radians — for a plate that is not
   * square to the world, which is every piece of scenery that was dropped rather
   * than built. `x/y/w/h` stay the un-rotated rect.
   */
  rot?: number;
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
  /**
   * Seconds of airtime left on a hop; 0 or absent on the ground.
   *
   * The sim stays 2D: nothing here has a z. What being airborne means is precisely
   * one thing — `low` walls are not there for this body — and how high it reads is
   * the renderer's business, drawn from this clock and `JUMP_RISE_M`.
   */
  air?: number;
  /**
   * Seconds before this body may show off again, counted from the start of the
   * last party trick.
   *
   * The shared rest for all three of them — Voxxy's hop, Biggy's roll and Droid's
   * stretch — since 25 Sep 2026, when the other two got a flourish of their own.
   * One field, because `E` mashed is `E` mashed whoever is holding it, and because
   * it is already zeroed in the two places a robot's history stops mattering
   * (`restoreIdentity` and `place`, `game.ts`).
   */
  hopRest?: number;
  /**
   * Seconds left on a **cosmetic** flourish: Biggy's roll or Droid's stretch.
   * 0 or absent when the robot is not performing.
   *
   * Michele asked for these with *"not needed for gameplay"* attached, and that is
   * enforced rather than trusted: nothing in the sim branches on this field except
   * the party trick itself, and no code path that reads it writes a position or a
   * velocity. Voxxy never uses it — her flourish leaves the floor, which is `air`.
   */
  flair?: number;
  /**
   * How long the running flourish was given, so `flairPhase` can normalise it.
   *
   * It is stored rather than looked up per species because the length belongs to
   * the performance that is actually running: the renderer asks "how far through",
   * and the answer must not change under it if a duration is ever retimed mid-hop.
   */
  flairDur?: number;
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
  /**
   * True for the short spill around a robot's own feet (`SKIRT_RANGE`).
   *
   * A label, not a rule: the skirt's polygon, range and ray count are exactly
   * what they were, so `clueLitBy` and `clueLit` cannot tell it from any other
   * pool and the puzzle is untouched. It exists because the RENDERER has to draw
   * a light that is emitted at the robot's own feet differently from one that is
   * thrown across a room — see `writeLightMesh` in `src/render/lighting.ts`.
   */
  skirt?: boolean;
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
  /**
   * How far through its own transition this prop is, 0 = not started, 1 = finished.
   *
   * A `state` says WHICH of a prop's states it is in; this says how far it has got
   * through the change into it, so the renderer can animate the change instead of
   * cutting between two stills. The sim owns the clock — the number is advanced by
   * the chapter that owns the prop and only read by `src/render` (CLAUDE.md) — and
   * any prop whose change is worth watching may carry it, not just doors.
   */
  progress?: number;
}

/**
 * A TEXT FIELD THE SIM IS ASKING THE PLAYER TO FILL IN.
 *
 * Michele, 25 Sep 2026, on chapter 2's router terminal: *"Typing the password was
 * hard, the game did not match it. I'd display an input text at center screen on e
 * to make it easier."* There was no field: what he had typed lived in one clause of
 * a 100-character status line along the bottom edge of the frame, which is not
 * where anybody looks while they are typing.
 *
 * Everything the HUD needs to draw the field is here and nothing it could invent is:
 * the sim decides what is being asked, what is in the box, how long the answer is
 * and whether the last key was refused; `src/render/hud.ts` formats it and owns none
 * of it (CLAUDE.md). `null` whenever no prompt is open, which is what makes the
 * field appear and disappear.
 */
export interface TextPrompt {
  /** What the field is asking for, e.g. `AUTHORISATION — venue WiFi password`. */
  title: string;
  /** What is in the box: exactly the characters the player should see. */
  value: string;
  /** How long the answer is, when that is known. 0 means "as long as it needs to be". */
  total: number;
  /** The glyph drawn for a character not yet typed. */
  blank: string;
  /** One line under the field: what the keys do. */
  hint: string;
  /** 1 the instant a key was refused, decaying to 0 — the field flashes on it. */
  reject: number;
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
  /**
   * Every raised walking surface on this floor, this frame — the lobby plate, the
   * flights, and anything a chapter has put on the floor that a robot stands on
   * top of. `riseAt` in `src/sim/surface.ts` is how it is read; the renderer only
   * ever asks (CLAUDE.md), which is what keeps a robot's height off the floor a
   * fact of the sim rather than a guess made in drawing code.
   */
  plates: Plate[];
  /** HUD line: the current objective, may contain simple markup. */
  objective: string;
  /** HUD line: the controls that matter right now. */
  keys: string;
  /**
   * HUD line: the live "what is left to do" readout, one short line, refreshed
   * every frame — `breakers 2/3 · cable 0/1480 px · roller door: shut`. Every
   * chapter produces one; the top-bar `objective` is the briefing and never moves,
   * this is the part that ticks.
   */
  progress: string;
  /**
   * The tow bar, when somebody has hold of Biggy — `holder` is who, `aim` is the
   * bar's angle and `dir` its snapped eighth. `null` when nobody is holding on.
   * The renderer draws the bar from this; nothing else may write it.
   */
  tow: { holder: RobotKind; dir: number; aim: number } | null;
  /**
   * The sim has the keyboard: a prompt is open and letters are being typed into it
   * (chapter 2's router terminal). The browser shell must not also read those keys
   * as movement — see `src/main.ts`.
   */
  typing: boolean;
  /**
   * The text field to draw at the centre of the screen, or `null` for none.
   * Open exactly when `typing` is true. See `TextPrompt`.
   */
  prompt: TextPrompt | null;
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
  /**
   * Turn the driven robot on the spot by `rad` (sim radians, +clockwise on
   * screen), without moving it. Only while it is standing: a robot under way
   * steers with the stick. Added for the 3D build's "A/D alone turn in place"
   * (Michele, 24 Sep); it aims a lamp without walking, so it is gameplay input,
   * not presentation, and lives here.
   */
  turn?(rad: number): void;
  skipChapter(): void;
  /** Jump straight to a chapter — used by tests and the debug overlay. */
  startChapter(n: number): void;
}
