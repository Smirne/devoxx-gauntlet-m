/**
 * The three robots, as the rest of the renderer sees them.
 *
 *     const voxxy = createRobot('voxxy');
 *     scene.add(voxxy.root);
 *     // per frame, from the sim snapshot:
 *     voxxy.root.position.set(m(bot.x), 0, m(bot.y));
 *     updateRobot(voxxy, { speedMps, heading: bot.face, dt, mounted: bot.mounted });
 *
 * The rig owns its own rotation (it turns toward its heading at 11 s^-1); the
 * caller owns its position. Nothing in here reads or writes game state: `src/sim`
 * is the only source of truth, and this module only ever receives numbers.
 */

import type { RobotKind } from '../../sim/types';
import { buildBiggy } from './biggy';
import { buildDroid } from './droid';
import { buildVoxxy } from './voxxy';
import { applyGait, type PoseName } from './gait';
import type { RobotRig } from './rig';

export type { RobotRig, WeatherOpts } from './rig';
export {
  measureBounds,
  disposeTree,
  presentationLight,
  BONE_NAMES,
  EXCLUDE_FROM_BOUNDS,
  PRESENT_TARGET,
  PRESENT_MAX_GAIN,
} from './rig';
export type { PoseName, GaitParams } from './gait';
export {
  applyGait,
  triggerPose,
  boneWorldPosition,
  footContact,
  footWorldPosition,
  gaitPhase,
  yawFromSimHeading,
  FOOT_OFFSET_M,
  BOB_M,
  LEAN_RAD_PER_MPS,
  STEP_DUR_WALK,
  STEP_DUR_RUN,
  STEP_FREQ_BASE,
  STEP_FREQ_PER_MPS,
  TURN_RATE,
  RUN_SPEED_MPS,
  IDLE_SPEED_MPS,
} from './gait';

/** Everything the gait needs to know about a robot this frame. */
export interface RobotState {
  /** True ground speed in metres per second (sim px/s / PX_PER_M). */
  speedMps: number;
  /** Sim heading in radians — `Bot.face`, where 0 is +x and +y is down. */
  heading: number;
  /** Seconds since the last frame. */
  dt: number;
  /** Droid riding Biggy. */
  mounted?: boolean;
  /** A one-shot pose to play: 'nope', 'reach' or 'squeeze'. */
  pose?: PoseName | null;
  /**
   * How much of this robot's motion is somebody else's: **0 driving, 1 shoved.**
   *
   * Pass `worldMoved(bot) ? 1 : 0` from `src/sim/bot.ts` — shoved by another
   * robot, towed, or still sliding after either. Do NOT derive it from an empty
   * stick, which is what this used to say: a stick goes empty on every release
   * and the gait's acceleration is smoothed, so the two together rolled Biggy on
   * a tap (measured, in `worldMoved`'s comment). Only Biggy does anything with
   * it, and what he does is roll (`applyShove` in `gait.ts`). Omitting it is a
   * robot under its own steam, so every existing call site is unchanged.
   */
  shoved?: number;
  /**
   * Voxxy's hop: **0 on the ground, 0 to 1 across the airtime.**
   *
   * Pass `hopPhase(bot)` from `src/sim/bot.ts` — that function returns exactly
   * this number and nothing else has to be worked out on the renderer's side.
   * Omitting it, or passing 0, is a robot standing on the floor, so every
   * existing call site is unchanged.
   *
   * The caller still owns the HEIGHT (`JUMP_RISE_M * 4u(1 - u)` on
   * `root.position.y`, in `src/render/scene.ts`); this is the pose that goes with
   * it — legs tucking on the way up, reaching on the way down, and both long arms
   * thrown up and out at the top.
   */
  hop?: number;
  /**
   * The other two robots' party trick: **0 when standing, 0 to 1 across it.**
   *
   * Pass `flairPhase(bot)` from `src/sim/bot.ts`, exactly as `hop` takes
   * `hopPhase(bot)`. Biggy rocks his whole gut over and back; Droid stretches both
   * long arms overhead. The rig picks which by its own kind — there is only ever
   * one flourish a given robot can be doing.
   *
   * Nothing here moves the body: a flourish is cosmetic (Michele: *"not needed for
   * gameplay"*), so unlike the hop there is no height for the caller to own.
   * Omitting it, or passing 0, is a robot not showing off.
   */
  flair?: number;
}

const BUILDERS: Record<RobotKind, () => RobotRig> = {
  voxxy: buildVoxxy,
  droid: buildDroid,
  biggy: buildBiggy,
};

/** Build one robot. Geometry only — safe to call with no WebGL context. */
export function createRobot(kind: RobotKind): RobotRig {
  const build = BUILDERS[kind];
  if (!build) throw new Error(`unknown robot "${String(kind)}"`);
  return build();
}

/**
 * The speed the *gait* runs at, in m/s. It is now the body's own speed, and the
 * comment below is why it stopped being anything else.
 *
 * This used to compress speed through `2.75 * tanh(v / 2.75)`. It was written
 * against the PRE-RESCALE constants, where Voxxy's top speed converted to 23 m/s
 * and her legs genuinely did blur; it is the surviving cousin of the deleted
 * `HUD_PX_PER_MPS` fudge, and `docs/playtest-notes.md` has had it on the
 * structural list as "probably removable" since the rescale.
 *
 * Measured before removing it, driving each rig at a steady speed for 5 s at
 * 480 Hz and reading the bones (the harness is in this round's session notes):
 *
 * | case | leg cadence | arm peak rate | knee fold | stance foot travel |
 * |---|---|---|---|---|
 * | Voxxy 5.8 m/s, tanh on | 5.60 Hz | 30.3 rad/s | 2.36 rad | **2.69 m/s** |
 * | Voxxy 5.8 m/s, tanh off | 5.60 Hz | 30.3 rad/s | 2.35 rad | **5.80 m/s** |
 * | Biggy 4.7 m/s, on / off | 5.00 / 5.60 Hz | 5.7 / 6.4 | 1.86 / 1.83 | 2.67 / 4.74 |
 * | Droid 2.3 m/s, on / off | 2.00 / 2.60 Hz | 2.7 / 3.4 | 1.31 / 1.30 | 1.94 / 2.37 |
 *
 * The thing it existed to prevent — a blurred leg — it was not doing. At Voxxy's
 * top speed the cadence, the arm rate and the knee angle are **identical** with
 * it and without it, because `MAX_STEP_FREQ` and the over-striding rule in
 * `gait.ts` bind first and bind the same way either way. What it WAS doing is
 * breaking the one promise that file's header makes: a planted stance foot
 * travels backward at exactly the body's speed. With the tanh, Voxxy's foot
 * travelled at 2.69 m/s while she moved at 5.80 — she skated forward at 3.1 m/s,
 * and all three robots did it. Without it, foot travel equals body speed on all
 * three, to the last digit.
 *
 * So it went. Nothing replaces it: the legs are bounded by the leg geometry, as
 * they should be, and the arms by a slew limit in `gait.ts` (`ARM_MAX_RATE`),
 * which is what Michele's "Voxxy's arms are frenetic at speed" was actually
 * about. Physics, collisions and every gameplay threshold were never involved —
 * `src/sim` has not been touched.
 *
 * The function stays because `src/main.ts` derives footstep audio from it, and
 * this is still the one place that says what speed the legs run at. Now that the
 * answer is "the body's", that call site can inline it whenever `main.ts` is next
 * open.
 */
export const gaitSpeed = (mps: number): number => Math.max(0, mps);

/** Advance one robot's animation. Call once per frame, per robot. */
export function updateRobot(rig: RobotRig, state: RobotState): void {
  applyGait(rig, {
    speedMps: gaitSpeed(state.speedMps),
    heading: state.heading,
    dt: state.dt,
    mounted: state.mounted ?? false,
    pose: state.pose ?? null,
    hop: state.hop ?? 0,
    flair: state.flair ?? 0,
    shoved: state.shoved ?? 0,
  });
}
