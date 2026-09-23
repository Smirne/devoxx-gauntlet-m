/**
 * Sim pixels -> metres.
 *
 * The Devoxx floor plans are drawn at roughly 10 px/m; the prototype stretches the
 * corridor axis x1.25 and compresses room depth, so the sim runs at about 12.5 px/m
 * along the corridor (see docs/scale-and-units.md). Room 8 is 383 sim px wide
 * -> 30.6 m, which matches a real Kinepolis auditorium.
 *
 * The sim computes in pixels — every physics constant, every wall, every radius —
 * and only ever converts on the way OUT: the renderer places rigs in metres, and a
 * chapter uses `m()` when it has a speed to say out loud to the player. Nothing
 * here feeds back into the integration.
 */

export const PX_PER_M = 12.5;

/** Sim pixels -> metres. */
export const m = (px: number): number => px / PX_PER_M;

/** Metres -> sim pixels. */
export const px = (metres: number): number => metres * PX_PER_M;

/**
 * Sim px/s -> the metres per second the HUD quotes to the player.
 *
 * There used to be a second scale here, `HUD_PX_PER_MPS = 72.5`, whose only job was
 * to stop the HUD printing what `PX_PER_M` actually implied about the prototype's
 * arcade speeds: Voxxy at 290 px/s was 23 m/s, 84 km/h for a knee-high robot, and
 * the HUD quietly divided by a different number so it could say "4.0 m/s" instead.
 * The 2026-09-23 speed rescale (`SPEED_SCALE` in `src/sim/constants.ts`) brought the
 * caps down to what the geometry says they are, so the two scales are one scale
 * again and the HUD reads the same metre the walls are built in.
 */
export const displayMps = (pxPerSec: number): number => m(pxPerSec);

/**
 * Modelled robot heights in metres. These are the figures the procedural meshes in
 * `src/render/robots` are built to, matching the model sheets' proportions relative
 * to each other. The sim's collision radii used to be "deliberately generous"
 * guesses at the top-down footprint; since the 2026-09-23 rescale they are measured
 * off these same rigs, so a contact in the sim is a contact on screen.
 */
export const ROBOT_HEIGHT_M = Object.freeze({
  /** Small, rounded, head about a third of the total. */
  voxxy: 1.15,
  /** Tall mechanical silhouette — the one that reaches the projector panel. */
  droid: 2.1,
  /** Stocky little heavyweight: barely taller than Voxxy, three times as wide. */
  biggy: 1.45,
});

/** Storey height from the exhibition-hall floor to the cinema corridor, metres. */
export const STOREY_H_M = 5.5;
