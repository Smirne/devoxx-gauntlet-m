/**
 * camera3d.ts — the third-person camera.
 *
 * An orbit around the driven robot's chest: mouse (pointer lock, or drag)
 * turns it, the wheel zooms, and while the player is moving and has not touched
 * the mouse for a moment it drifts back behind the robot's heading. A ray from
 * the pivot to the wanted position stops it at the first wall, ceiling or door,
 * so it never sees through the building.
 *
 * WASD steer the robot's own heading (`pushStick` in main3d.ts); only the first
 * W from standing reads the camera's yaw.
 */

import * as THREE from 'three';

import type { RobotKind } from '../sim/types';
import { ROBOT_HEIGHT_M } from '../sim/units';

export const DIST: Record<RobotKind, number> = { voxxy: 3.1, droid: 4.4, biggy: 4.2 };
// Droid's orbit centre sits higher than the others' (0.95 of his 2.1 m): he is
// the tall one, and his puzzles are high (Michele, 24 Sep, after trying a
// chase camera and asking for the original one back with just this change).
export const PIVOT: Record<RobotKind, number> = { voxxy: 0.85, droid: 0.95, biggy: 0.8 };
/** The closest the camera comes to the pivot, m: outside each robot's shell. */
const NEAR: Record<RobotKind, number> = { voxxy: 0.9, droid: 1.0, biggy: 1.3 };
/** Below this share of the wanted distance, the camera lifts instead. */
const CLEAR = 0.6;

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = -Math.PI / 2;
  pitch = 0.22;
  zoom = 1;
  /** A fixed pose for screenshots: when set, the orbit is ignored. */
  pose: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  private readonly pivot = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private lastUser = -10;
  private time = 0;
  private dist = 3.5;
  private kind: RobotKind | null = null;
  private snapNext = true;
  /** Swinging round behind a robot just switched to; the mouse cancels it. */
  private swing = false;
  /** Extra pitch while boxed in (see `update`), eased. */
  private lift = 0;
  /**
   * A pitch to ease back to once the robot is under way, then forgotten. The
   * opening hands over looking down over the crates (from the usual pitch the
   * camera sat behind them, and the first playable frame was a crate); this lets
   * it settle to the normal framing as the robot walks clear. Any mouse look
   * cancels it: after that the pitch is the player's.
   */
  settlePitch: number | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.05, 420);
  }

  onMouse(dx: number, dy: number): void {
    this.yaw -= dx * 0.0035;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0028, -0.25, 1.15);
    this.lastUser = this.time;
    this.settlePitch = null;
  }

  onWheel(dy: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(dy * 0.001), 0.45, 2.2);
  }

  /**
   * The establishing shot, played while the title card is up: a slow dolly
   * from the fire door back down the dark corridor to the three robots, low and
   * close to the floor so the reflections carry it. `t` is seconds into it.
   */
  intro(t: number, from: THREE.Vector3, to: THREE.Vector3, lookFrom: THREE.Vector3, lookTo: THREE.Vector3): void {
    const k = Math.min(1, t / 14);
    const e = k * k * (3 - 2 * k);
    const cam = this.camera;
    cam.position.lerpVectors(from, to, e);
    cam.position.y += Math.sin(t * 0.7) * 0.05;
    const look = new THREE.Vector3().lerpVectors(lookFrom, lookTo, e);
    cam.lookAt(look);
    cam.updateMatrixWorld();
    this.snapNext = true;
  }

  /** Teleport next frame instead of easing (chapter start, cutscene cut). */
  cut(): void {
    this.snapNext = true;
  }

  update(dt: number, kind: RobotKind, robotPos: THREE.Vector3, heading: number, speed: number, colliders: THREE.Object3D[]): void {
    this.time += dt;
    const cam = this.camera;
    if (this.pose) {
      cam.position.copy(this.pose.pos);
      cam.lookAt(this.pose.look);
      cam.updateMatrixWorld();
      return;
    }
    const switched = kind !== this.kind;
    // Switching robot swings the camera round behind the new one (Michele, 28
    // Sep: "the camera shouldn't reset to frontal when switching robot?"). It
    // used to keep its yaw, so a robot facing the old camera came up face-on
    // and W walked it the wrong way. Not the first robot of a chapter: that
    // one is framed by whoever cut to it.
    if (switched && this.kind !== null && !this.snapNext) this.swing = true;
    this.kind = kind;
    if (this.swing) {
      let d = Math.atan2(-Math.cos(heading), -Math.sin(heading)) - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 4);
      if (Math.abs(d) < 0.02 || this.time - this.lastUser < 0.05) this.swing = false;
    }
    const target = new THREE.Vector3(robotPos.x, robotPos.y + ROBOT_HEIGHT_M[kind] * PIVOT[kind], robotPos.z);
    const k = this.snapNext ? 1 : 1 - Math.exp(-dt * (switched ? 3 : 9));
    this.pivot.lerp(target, k);

    // Drift behind the robot whenever it moves and the mouse is idle. It used
    // to follow only a robot heading within ~55° of the view: the stick was
    // camera-relative then, and a camera chasing a strafing robot turned its
    // own "right" and ran it in circles (scripted playtest, 2026-09-23). The
    // stick steers the robot's heading now (`pushStick` in main3d.ts), so the
    // camera can always follow — the cone was what lost Michele's view when he
    // turned while walking (28 Sep).
    if (speed > 0.3 && this.time - this.lastUser > 1.2) {
      const want = Math.atan2(-Math.cos(heading), -Math.sin(heading));
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 2.4 * Math.min(1, speed / 1.5));
    }

    if (this.settlePitch !== null && speed > 0.3) {
      this.pitch += (this.settlePitch - this.pitch) * Math.min(1, dt * 0.9);
      if (Math.abs(this.settlePitch - this.pitch) < 0.01) this.settlePitch = null;
    }

    const wantDist = DIST[kind] * this.zoom;
    /*
     * BOXED IN: LIFT, DON'T CLOSE IN.
     *
     * With a wall or a booth right behind the robot the ray used to stop the
     * camera half a metre from the pivot — which is inside Voxxy's head (the
     * polish survey, 28 Sep: a frame that was all orange shell). So when the
     * orbit's own pitch leaves less than `CLEAR` of the distance free, try
     * steeper pitches and look down over the obstacle instead, eased in and out
     * through `lift` so it never pops.
     */
    const clearAt = (pitch: number): { d: number; dir: THREE.Vector3 } => {
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
      this.ray.set(this.pivot, dir);
      this.ray.far = wantDist + 0.3;
      const hits = this.ray.intersectObjects(colliders, true);
      return { d: hits.length ? Math.min(wantDist, hits[0].distance - 0.3) : wantDist, dir };
    };
    let lift = 0;
    let best = clearAt(this.pitch);
    if (best.d < wantDist * CLEAR) {
      for (const up of [0.3, 0.6, 0.9]) {
        const p = Math.min(1.25, this.pitch + up);
        const c = clearAt(p);
        if (c.d > best.d + 0.05) {
          best = c;
          lift = p - this.pitch;
        }
        if (c.d >= wantDist * CLEAR) break;
      }
    }
    this.lift += (lift - this.lift) * (this.snapNext ? 1 : 1 - Math.exp(-dt * 4));
    const pitch = this.pitch + this.lift;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
    let d = wantDist;
    this.ray.set(this.pivot, dir);
    this.ray.far = wantDist + 0.3;
    const hits = this.ray.intersectObjects(colliders, true);
    // Never nearer than the robot's own shell (`NEAR`), wall or no wall.
    if (hits.length) d = Math.max(NEAR[kind], Math.min(d, hits[0].distance - 0.3));
    const kd = this.snapNext ? 1 : d < this.dist ? 1 - Math.exp(-dt * 25) : 1 - Math.exp(-dt * 3);
    this.dist += (d - this.dist) * kd;
    this.want.copy(this.pivot).addScaledVector(dir, this.dist);
    cam.position.copy(this.want);
    cam.lookAt(this.pivot);
    cam.updateMatrixWorld();
    this.snapNext = false;
  }
}
