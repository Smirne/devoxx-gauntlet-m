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
export { measureBounds, disposeTree, BONE_NAMES, EXCLUDE_FROM_BOUNDS } from './rig';
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
 * The speed the *gait* runs at, in m/s.
 *
 * The prototype is an arcade game: Voxxy's frozen top speed of 290 px/s is 23 m/s
 * once converted, which is nobody's walk cycle. Legs are therefore driven through
 * a soft knee that is 1:1 at conversational speeds and saturates just above the
 * organisers' run speed (2.6 m/s), so a sprinting robot reads as sprinting rather
 * than as a blur. Physics, collisions and every gameplay threshold stay untouched
 * in `src/sim` — this only ever affects how fast the legs appear to move.
 */
export const GAIT_SPEED_REF = 2.75;

export const gaitSpeed = (mps: number): number =>
  GAIT_SPEED_REF * Math.tanh(Math.max(0, mps) / GAIT_SPEED_REF);

/** Advance one robot's animation. Call once per frame, per robot. */
export function updateRobot(rig: RobotRig, state: RobotState): void {
  applyGait(rig, {
    speedMps: gaitSpeed(state.speedMps),
    heading: state.heading,
    dt: state.dt,
    mounted: state.mounted ?? false,
    pose: state.pose ?? null,
  });
}
