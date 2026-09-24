/**
 * camera.ts — the diorama camera.
 *
 * "After Dark" is a **diorama**, not a 3D game with a free camera: one fixed
 * orthographic viewpoint per chapter, framed on the chapter's `ViewRect`
 * (GAUNTLET.md §1). Nothing here reads game state — `frame()` is handed a rect in
 * sim pixels and an aspect ratio, and that is all it needs.
 *
 * ## The viewpoint
 *
 * The venue is built so that sim +x is world +x and sim +y (down the plan) is
 * world +z, with +y up (`src/render/venue/props.ts`). The camera therefore:
 *
 *  - sits on the **+z side** looking toward -z, which puts sim +x on the screen's
 *    right: the corridor runs left-to-right exactly as the plan reads, rooms
 *    3·4·5·6 near the camera and 10·9·8·7 beyond the corridor;
 *  - is yawed by a small `DIORAMA_AZIMUTH_RAD` off that axis, so room partitions
 *    (which run along z) show a face instead of being edge-on slivers — the
 *    difference between a flat elevation and a diorama;
 *  - is pitched to ~30°, in the classic 2:1-ish isometric band. A square floor
 *    tile projects roughly 2:1, and — the point of the whole exercise — a robot
 *    is seen from slightly above its own eye line, so the judge reads Voxxy's
 *    visor and Droid's face rather than the tops of their heads. Chapter 4 drops
 *    lower still to put the Room 8 stage in the frame.
 *
 * ## Using it
 *
 *     const camera = createCamera(canvas.clientWidth / canvas.clientHeight);
 *     camera.setChapter(1);
 *     camera.frame(snap.view, aspect, snap.floor);   // on view/resize change
 *     camera.update(dt);                             // every frame: decays shake
 *     renderer.render(scene, camera.cam);
 *
 * `frame()` is cheap enough to call every frame; `update(dt)` is what animates
 * `shake()`, so call it in the frame loop even when the view has not changed.
 */

import * as THREE from 'three';

import { H as SIM_H, W as SIM_W } from '../sim/constants';
import type { ViewRect } from '../sim/types';
import { STOREY_H_M, m } from '../sim/units';

/**
 * Yaw off the plan axis, radians. Exported because anything that has to face the
 * camera — a billboarded label, a flat sign, a sprite — needs the same angle.
 *
 * This is the **play** azimuth and the one the set is built against: the Zaal
 * panels, the keypad, the projector-bay ports and the seat/clue sight lines are
 * all laid out so they read from here, and `tests/venue.smoke.test.ts` checks
 * them at exactly this yaw. A shot may borrow a different one for its own
 * duration (`DioramaCamera.setAzimuth`), but nothing in the set may be tuned to
 * that borrowed angle: the moment the shot ends the camera is back here.
 */
export const DIORAMA_AZIMUTH_RAD = (14 * Math.PI) / 180;

/**
 * The yaw the opening's presentation shot is staged at, radians.
 *
 * The crates stand in a row **against the corridor's west wall**, faces pointing
 * east down the corridor, so the play azimuth sees all three edge-on — the
 * stencil that spells `DEVOXX` across them would be three slivers. The camera
 * therefore swings round to the east and looks back west along the corridor.
 *
 * 68 deg rather than a flat 90: at 90 the three faces are dead square to the
 * lens, which is an elevation rather than a diorama and flattens the crates into
 * painted boards. 22 deg off-square keeps a hand's width of the left-hand crate's
 * flank in frame, so the row still reads as three boxes, and measured on the
 * built page all six stencil letters stay legible (see this round's frame strip,
 * `scratchpad/intro-light/az-*.png`). It also keeps the row running left-to-right
 * across the screen, which is the direction the robots then walk.
 */
export const OPENING_AZIMUTH_RAD = (68 * Math.PI) / 180;

/** Pitch above the floor plane, degrees, per chapter. Chapter 4 sits lower to see the stage. */
export const CHAPTER_ELEVATION_DEG: Readonly<Record<number, number>> = Object.freeze({
  1: 30,
  2: 31,
  3: 33,
  4: 24,
});
export const BASE_ELEVATION_DEG = 30;

/**
 * The unit vector from anything in the scene **toward** the camera, for one
 * chapter's pitch (`undefined` gives the base pitch).
 *
 * This is the one number the set builder has to agree with the camera on. A flat
 * sign is readable exactly when its face normal has a positive dot product with
 * this vector, and it is un-occluded exactly when a ray cast along this vector
 * from its face reaches infinity without hitting the venue — which is what
 * `tests/venue.smoke.test.ts` asserts for all eight Zaal numeral panels, and why
 * this lives here rather than being re-derived in `src/render/venue`.
 */
export function dioramaToCameraAtDeg(deg: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  const e = (deg * Math.PI) / 180;
  const ce = Math.cos(e);
  return out
    .set(Math.sin(DIORAMA_AZIMUTH_RAD) * ce, Math.sin(e), Math.cos(DIORAMA_AZIMUTH_RAD) * ce)
    .normalize();
}

/** The same vector, for a chapter rather than a raw pitch. */
export function dioramaToCamera(chapter?: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  const deg = chapter === undefined ? BASE_ELEVATION_DEG : CHAPTER_ELEVATION_DEG[chapter] ?? BASE_ELEVATION_DEG;
  return dioramaToCameraAtDeg(deg, out);
}

/**
 * Every pitch the diorama camera is ever set to, shallowest first.
 *
 * A shallow pitch is the worst case for a sign clipped by the ceiling in front of
 * it; a steep one is the worst case for a sign clipped by the ceiling *above* it.
 * Signage has to survive both, so the check iterates this list rather than
 * picking one.
 */
export const DIORAMA_ELEVATIONS_DEG: readonly number[] = Object.freeze(
  [...new Set([BASE_ELEVATION_DEG, ...Object.values(CHAPTER_ELEVATION_DEG)])].sort((a, b) => a - b),
);

/**
 * The vertical band the framing must keep on screen, metres relative to the
 * storey's floor: a little below the floor plate, up to just over the shell
 * height of the sectional model (`SHELL_H` is 3.3 m). Kept local on purpose —
 * importing `src/render/venue` here would couple the camera to the set builder.
 */
const BAND_LOW = -0.4;
const BAND_HIGH = 3.9;

/** Breathing room around the framed rect. */
const FIT_MARGIN = 1.06;

/**
 * Fraction of the frame's height the HUD owns along the bottom edge.
 *
 * The robot chips, the speed meter and the progress line are an opaque band
 * across the bottom of the screen, and until now the camera framed the venue as
 * though they were not there. In chapter 1 that put the foyer — which holds the
 * FIRST clue the player is sent to find — underneath them: Michele reported "the
 * first hint is still not visible" twice, and a shot with the HUD suppressed
 * showed the marker sitting behind the Droid chip, lit and pulsing, where nobody
 * could see it. The same band is why the foyer and kiosk clues looked stacked on
 * top of each other when they are 9.4 m apart.
 *
 * So the camera fits its box into the part of the screen the player can actually
 * see and lifts it clear. This is a small zoom-out — the cost of the fix — and it
 * applies to every chapter, because any chapter can put something important in
 * the bottom sixth of its own frame.
 */
const HUD_SAFE = 0.15;

/** Orthographic: the pull-back only has to clear the geometry, it changes nothing else. */
const CAM_DIST = 140;
const CAM_NEAR = 0.5;
const CAM_FAR = 420;

/** Biggy hitting a door: a small, fast, decaying nudge in screen space. */
const SHAKE_MAX_M = 0.42;
const SHAKE_DECAY = 6.5;
const SHAKE_HZ_X = 13;
const SHAKE_HZ_Y = 9.5;
/** Below this the offset is not worth applying. */
const SHAKE_EPS = 0.002;

export interface DioramaCamera {
  /** Hand this to `renderer.render()`. */
  cam: THREE.OrthographicCamera;
  /**
   * Fit a chapter's sim-pixel view rect to a viewport of the given aspect.
   * `floor` picks the storey, matching `GameSnapshot.floor`; it is remembered, so
   * `frame(view, aspect)` keeps whatever storey was last used.
   */
  frame(view: ViewRect, aspect: number, floor?: 'up' | 'down'): void;
  /** Chapter 1-4. Nudges the pitch and re-frames the last rect. */
  setChapter(n: number): void;
  /**
   * Yaw the whole diorama for one shot, radians — and re-frame the last rect at
   * the new angle, exactly as `setChapter` re-frames it at a new pitch.
   *
   * Call it with nothing (or with anything that is not a finite number) to put
   * the camera back on `DIORAMA_AZIMUTH_RAD`. Until it is called at all, the
   * camera is on `DIORAMA_AZIMUTH_RAD` and every framing is bit-for-bit what it
   * was before this existed.
   *
   * **The set is not yawed with it.** `DIORAMA_AZIMUTH_RAD` is baked into the
   * facing rule for the Zaal panels (`src/render/venue/signage.ts`), the keypad,
   * the projector-bay ports (`src/render/venue/projector.ts`) and the sight-line
   * checks in `tests/venue.smoke.test.ts`, `tests/seats.test.ts`,
   * `tests/aisle.test.ts` and `tests/release-panel.test.ts`. A flat sign is
   * readable when its normal has a positive dot product with the camera, so a
   * shot staged far off the play azimuth will show some of them from behind.
   * That is fine for a shot that frames its own subject — the opening frames
   * three crates in an empty corridor — and it is the reason this is a shot
   * override rather than a second setting.
   */
  setAzimuth(rad?: number): void;
  /** The yaw in force right now, radians. `DIORAMA_AZIMUTH_RAD` unless a shot moved it. */
  azimuth(): number;
  /** Kick the camera. `amount` is 0..1 and stacks; anything above 1 is clamped. */
  shake(amount: number): void;
  /** Advance the shake. Call once per frame with the frame's dt in seconds. */
  update(dt: number): void;
}

/** A monotonic clock in seconds, used until the host starts driving `update(dt)`. */
function wallClock(): number {
  return typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000;
}

export function createCamera(aspect: number): DioramaCamera {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, CAM_NEAR, CAM_FAR);
  cam.name = 'diorama-camera';

  /** Camera basis, rebuilt whenever the pitch changes. */
  const dirToCam = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  /** The framed position, before the shake offset is added. */
  const basePos = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const centre = new THREE.Vector3();

  let elevation = (BASE_ELEVATION_DEG * Math.PI) / 180;
  /** The yaw in force. The play azimuth until a shot borrows another one. */
  let azimuth = DIORAMA_AZIMUTH_RAD;
  let lastView: ViewRect = { x: 0, y: 0, w: SIM_W, h: SIM_H };
  let lastAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  let lastFloor: 'up' | 'down' = 'up';

  /** Shake state on a timeline that is wall-clock until `update()` takes over. */
  let manualTime = false;
  let clock = wallClock();
  let shakeAmp = 0;
  let shakeStart = -1e9;

  const now = (): number => (manualTime ? clock : wallClock());

  function rebuildBasis(): void {
    const az = azimuth;
    const ce = Math.cos(elevation);
    // Offset from the subject to the camera: +z side, yawed by `az`, pitched up.
    dirToCam.set(Math.sin(az) * ce, Math.sin(elevation), Math.cos(az) * ce).normalize();
    forward.copy(dirToCam).negate();
    // With the camera on the +z side this comes out as +x pointing screen-right,
    // which is what makes the rendered map read the same way round as the plan.
    right.set(Math.cos(az), 0, -Math.sin(az)).normalize();
    up.crossVectors(right, forward).normalize();
    basis.makeBasis(right, up, dirToCam);
    cam.quaternion.setFromRotationMatrix(basis);
    cam.up.copy(up);
  }

  /** Re-apply the current shake offset on top of the framed position. */
  function applyOffset(): void {
    const tau = now() - shakeStart;
    const env = shakeAmp * Math.exp(-SHAKE_DECAY * tau);
    if (env <= SHAKE_EPS) {
      shakeAmp = 0;
      cam.position.copy(basePos);
    } else {
      const ox = env * SHAKE_MAX_M * Math.sin(tau * SHAKE_HZ_X * Math.PI * 2);
      const oy = env * SHAKE_MAX_M * 0.7 * Math.sin(tau * SHAKE_HZ_Y * Math.PI * 2 + 1.1);
      cam.position.copy(basePos).addScaledVector(right, ox).addScaledVector(up, oy);
    }
    cam.updateMatrixWorld();
  }

  function frame(view: ViewRect, viewAspect: number, floor?: 'up' | 'down'): void {
    if (floor !== undefined) lastFloor = floor;
    if (Number.isFinite(viewAspect) && viewAspect > 0) lastAspect = viewAspect;
    lastView = view;

    const x0 = m(view.x);
    const x1 = m(view.x + view.w);
    const z0 = m(view.y);
    const z1 = m(view.y + view.h);
    const floorY = lastFloor === 'down' ? -STOREY_H_M : 0;
    const y0 = floorY + BAND_LOW;
    const y1 = floorY + BAND_HIGH;
    centre.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

    // Project the eight corners of the framed box onto the camera's screen axes
    // and fit the resulting rectangle. Doing it this way means the yaw and the
    // pitch can be retuned without touching the framing maths.
    let minR = Infinity;
    let maxR = -Infinity;
    let minU = Infinity;
    let maxU = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0).sub(centre);
      const r = corner.dot(right);
      const u = corner.dot(up);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
    }

    // Fit into the HUD-free part of the frame, not the whole of it.
    const halfH = (Math.max((maxU - minU) / 2, (maxR - minR) / 2 / lastAspect) * FIT_MARGIN) / (1 - HUD_SAFE);
    const halfW = halfH * lastAspect;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.near = CAM_NEAR;
    cam.far = CAM_FAR;
    cam.updateProjectionMatrix();

    // Slide the camera sideways/up so the projected box is centred in the frame.
    basePos
      .copy(centre)
      .addScaledVector(dirToCam, CAM_DIST)
      .addScaledVector(right, (minR + maxR) / 2)
      // ...and drop the camera by the reserved band, which lifts the venue out
      // from behind the HUD.
      .addScaledVector(up, (minU + maxU) / 2 - halfH * HUD_SAFE);
    applyOffset();
  }

  rebuildBasis();
  frame(lastView, lastAspect, 'up');

  return {
    cam,
    frame,
    setChapter(n: number): void {
      const deg = CHAPTER_ELEVATION_DEG[n] ?? BASE_ELEVATION_DEG;
      const next = (deg * Math.PI) / 180;
      if (next === elevation) return;
      elevation = next;
      rebuildBasis();
      frame(lastView, lastAspect);
    },
    setAzimuth(rad?: number): void {
      // Anything that is not a finite number means "back to the play azimuth",
      // so a caller can clear the override with `setAzimuth()` and never has to
      // import the constant to put it back.
      const next = typeof rad === 'number' && Number.isFinite(rad) ? rad : DIORAMA_AZIMUTH_RAD;
      if (next === azimuth) return;
      azimuth = next;
      rebuildBasis();
      frame(lastView, lastAspect);
    },
    azimuth(): number {
      return azimuth;
    },
    shake(amount: number): void {
      if (!(amount > 0)) return;
      // Whatever is left of the previous hit is folded in, so two quick door hits
      // read as one harder one instead of restarting from zero.
      const tau = now() - shakeStart;
      const left = shakeAmp * Math.exp(-SHAKE_DECAY * tau);
      shakeAmp = Math.min(1, (Number.isFinite(left) ? left : 0) + amount);
      shakeStart = now();
      applyOffset();
    },
    update(dt: number): void {
      if (!manualTime) {
        clock = wallClock();
        manualTime = true;
      }
      clock += Number.isFinite(dt) ? dt : 0;
      if (shakeAmp > 0) applyOffset();
    },
  };
}
