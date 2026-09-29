/**
 * governor.ts — keeps the frame rate up on whatever machine the game lands on.
 *
 * The quality tier (low … ultra) is chosen once, at load, and a change reloads
 * the page. Inside a tier the governor walks a LADDER of cheaper settings that
 * need no reload — render scale first, then the passes that cost the most for
 * the least on screen — one rung per half second while the frame is slow, and
 * back up, slowly, when a GPU timer shows there is room.
 *
 * It replaced a resolution-only stepper (29 Sep, after players reported the 3D
 * build "very slow, in some cases unusable"). That one needed 45 slow frames
 * per step — four and a half seconds at 10 fps, half a minute to reach its
 * floor — ignored every frame over 200 ms as a "hitch", so a machine running at
 * 4 fps never adapted at all, and could only climb back on a display faster
 * than 60 Hz. Decisions here are taken on half-second windows, and a window is
 * slow only when most of its frames are: a stall or two (a shader compile, a
 * tab switch) cannot move it, a machine that is slow every frame always does.
 *
 * Pure logic — no three, no DOM — so `tests/governor.test.ts` can drive it with
 * synthetic frame times.
 */

/** One rung: what the frame costs, relative to the tier's own settings. */
export interface Rung {
  /** Render scale, times the tier's pixel ratio. */
  ratio: number;
  /** Ground-truth AO (a whole extra scene pass plus two blurs). */
  ao: boolean;
  /** Volumetric fog detail: 1 the tier's, 0.5 fewer steps at a lower resolution. */
  vol: 1 | 0.5;
  /** Floor reflection resolution: 1 the tier's, 0.5 half. */
  refl: 1 | 0.5;
}

/**
 * Cheapest last. A little resolution goes first, because it buys the most for
 * the least that anyone notices; then the AO; more resolution; the fog's
 * detail; the floor mirror; and the rest of the resolution.
 */
export const LADDER: readonly Rung[] = [
  { ratio: 1, ao: true, vol: 1, refl: 1 },
  { ratio: 0.85, ao: true, vol: 1, refl: 1 },
  { ratio: 0.85, ao: false, vol: 1, refl: 1 },
  { ratio: 0.72, ao: false, vol: 1, refl: 1 },
  { ratio: 0.72, ao: false, vol: 0.5, refl: 1 },
  { ratio: 0.62, ao: false, vol: 0.5, refl: 0.5 },
  { ratio: 0.5, ao: false, vol: 0.5, refl: 0.5 },
];

/** A frame above this is slow, ms: below ~40 fps. */
export const SLOW_MS = 25;
/** How long a window is, ms, and the fewest frames it decides on. */
export const WINDOW_MS = 500;
export const WINDOW_FRAMES = 4;
/** GPU ms under which a frame has room to spare at 60 Hz. */
export const ROOM_GPU_MS = 9;
/** Wall ms under which a frame has room even without a GPU timer (a 90 Hz+ display). */
export const ROOM_WALL_MS = 11.5;
/** Windows of room in a row before a climb: three seconds. */
export const CLIMB_WINDOWS = 6;
/** After a step down, no climbing for this long, ms; doubles every time a climb had to be undone. */
export const HOLD_MS = 20000;
/**
 * A window this long decides on as few as two frames: a machine managing one
 * frame a second still gets a decision every few seconds. There is no "gap"
 * rule — a rule that discarded long frames is exactly what kept the old stepper
 * from ever adapting a very slow machine; a tab switch's one enormous frame is
 * outvoted like any other stall.
 */
export const LONG_WINDOW_MS = 2000;
/** The share of a window's frames that must agree: slow to step down, quick to count as room. */
export const MOST = 0.7;

/** The frame time that a `share` of the window's frames are at least as slow as. */
function atLeast(xs: number[], share: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * (1 - share))];
}
/** The frame time that a `share` of the window's frames are at most as slow as. */
function atMost(xs: number[], share: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.ceil((s.length - 1) * share)];
}

export class Governor {
  /** Index into LADDER. */
  rung = 0;
  /** At the bottom rung and still slow: only a lower tier (a reload) can help. */
  struggling = false;
  private wall: number[] = [];
  private gpu: number[] = [];
  private since = -1;
  private settle = false;
  private roomy = 0;
  private slowAtBottom = 0;
  /** The last window judged was slow: confirms a slow window of only a few (long) frames. */
  private slowBefore = false;
  private holdUntil = -Infinity;
  private hold = HOLD_MS;
  private climbedAt = -Infinity;

  constructor(private readonly ladder: readonly Rung[] = LADDER) {}

  get current(): Rung {
    return this.ladder[this.rung];
  }

  /**
   * One frame. `now` and `wallMs` from the wall clock (ms), `gpuMs` from a GPU
   * timer query when the browser has one (a finished query from a few frames
   * back — the lag does not matter to a half-second window). Returns true when
   * the rung changed and the caller has to apply it.
   */
  frame(now: number, wallMs: number, gpuMs: number | null = null): boolean {
    if (this.since < 0) {
      this.restart(now);
      return false;
    }
    this.wall.push(wallMs);
    if (gpuMs !== null) this.gpu.push(gpuMs);
    const age = now - this.since;
    const n = this.wall.length;
    if (age < WINDOW_MS || (n < WINDOW_FRAMES && !(age >= LONG_WINDOW_MS && n >= 2))) return false;
    const full = n >= WINDOW_FRAMES;
    const slowest = atLeast(this.wall, MOST);
    const quick = atMost(this.wall, MOST);
    const gpu = this.gpu.length ? atMost(this.gpu, MOST) : null;
    this.restart(now);
    // The window after a change measured the change's own reallocation.
    if (this.settle) {
      this.settle = false;
      this.slowBefore = false;
      return false;
    }
    const slow = slowest > SLOW_MS;
    // A window of two or three long frames could be a stall and a tab switch
    // back to back: it steps down only if the window before it was slow too.
    const sure = full || this.slowBefore;
    this.slowBefore = slow;
    if (slow) {
      this.roomy = 0;
      if (!sure) return false;
      if (this.rung < this.ladder.length - 1) {
        // A climb that has to be undone within a hold's length was a bounce:
        // wait twice as long before trying again.
        if (now - this.climbedAt < this.hold) this.hold = Math.min(this.hold * 2, 8 * HOLD_MS);
        this.holdUntil = now + this.hold;
        return this.move(this.rung + 1);
      }
      if (++this.slowAtBottom >= 2) this.struggling = true;
      return false;
    }
    this.slowAtBottom = 0;
    const room = full && ((gpu !== null && gpu < ROOM_GPU_MS && quick < 20) || quick < ROOM_WALL_MS);
    this.roomy = room ? this.roomy + 1 : 0;
    if (this.rung > 0 && now >= this.holdUntil && this.roomy >= CLIMB_WINDOWS) {
      this.roomy = 0;
      this.climbedAt = now;
      return this.move(this.rung - 1);
    }
    return false;
  }

  private move(to: number): boolean {
    this.rung = to;
    this.settle = true;
    return true;
  }

  private restart(now: number): void {
    this.wall.length = 0;
    this.gpu.length = 0;
    this.since = now;
  }
}
