/**
 * camera3d.ts — the third-person camera.
 *
 * An orbit around the driven robot's chest: mouse (pointer lock, or drag)
 * turns it, the wheel zooms, and while the player is moving and has not touched
 * the mouse for a moment it drifts back behind the robot's heading. A ray from
 * the pivot to the wanted position stops it at the first wall, ceiling or door,
 * so it never sees through the building.
 *
 * W drives along the robot's heading and A/D turn it (`drive()`); the camera follows.
 * That is input mapping, not game logic — the sim still gets a plain stick.
 */

import * as THREE from 'three';

import type { RobotKind } from '../sim/types';
import { ROBOT_HEIGHT_M } from '../sim/units';

const DIST: Record<RobotKind, number> = { voxxy: 3.1, droid: 4.4, biggy: 4.2 };
const PIVOT: Record<RobotKind, number> = { voxxy: 0.85, droid: 0.8, biggy: 0.8 };
/** Pitch each robot's camera starts from after a switch. */
const PITCH: Record<RobotKind, number> = { voxxy: 0.22, droid: 0.12, biggy: 0.22 };
/**
 * Metres above the pivot the camera looks at. Droid is the tall one and his
 * puzzles are high (the projector panel sits 3.35 m up): his camera looks up
 * past his head instead of down at his shoulders.
 */
const LOOK_UP: Record<RobotKind, number> = { voxxy: 0, droid: 0.55, biggy: 0 };

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = -Math.PI / 2;
  pitch = 0.22;
  zoom = 1;
  /** A fixed pose for screenshots: when set, the orbit is ignored. */
  pose: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  private readonly pivot = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private lastUser = -10;
  private time = 0;
  private dist = 3.5;
  private kind: RobotKind | null = null;
  private snapNext = true;
  /** The heading W drives along (sim radians); A/D turn it. */
  private steerYaw: number | null = null;
  private steerKind: RobotKind | null = null;
  private backing = false;
  private turning = false;
  /** Seconds left of the swing behind a robot just switched to. */
  private settle = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.05, 420);
  }

  onMouse(dx: number, dy: number): void {
    this.yaw -= dx * 0.0035;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0028, -0.25, 1.15);
    this.lastUser = this.time;
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

  /**
   * Chase-camera steering: W drives along the robot's own heading, A/D turn it,
   * S turns round and walks back. The camera then follows the heading.
   *
   * It replaced camera-relative WASD (playtest, 24 Sep: "the camera should
   * follow the direction the droid is facing"). With camera-relative keys a
   * camera that follows the heading feeds back into "right" and the robot runs
   * in circles; with A/D turning the heading itself there is no loop.
   */
  drive(fwd: number, turn: number, dt: number, kind: RobotKind, heading: number): [number, number] {
    if (this.steerKind !== kind || this.steerYaw === null) {
      this.steerKind = kind;
      this.steerYaw = heading;
    }
    this.backing = fwd < 0;
    this.turning = turn !== 0;
    if (fwd === 0 && turn === 0) {
      // Idle: stay in step with wherever the sim has the robot facing.
      this.steerYaw = heading;
      return [0, 0];
    }
    // Screen-right, seen from behind, is heading + 90 deg in sim space (+y is
    // world +z, which is the camera's right when it looks along +x).
    this.steerYaw += turn * 2.2 * dt;
    const c = Math.cos(this.steerYaw);
    const sn = Math.sin(this.steerYaw);
    if (fwd > 0) return [c, sn];
    if (fwd < 0) return [-c, -sn];
    // Turning on the spot: a creep along the new heading, so the sim turns him.
    return [c * 0.12, sn * 0.12];
  }

  /** Camera-relative stick -> sim stick (sim +x right, +y down = world +z). */
  stick(fwd: number, strafe: number): [number, number] {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    return [fx * fwd + rx * strafe, fz * fwd + rz * strafe];
  }

  /**
   * `room`, in metres (x0, z0, x1, z1), keeps the camera inside the room the
   * robot is in. The collision ray alone let it sit in the corridor whenever
   * the robot-to-camera line went out through the doorway, and the wall round
   * the door came back between the player and the robot.
   */
  update(dt: number, kind: RobotKind, robotPos: THREE.Vector3, heading: number, speed: number, colliders: THREE.Object3D[], room?: [number, number, number, number]): void {
    this.time += dt;
    const cam = this.camera;
    if (this.pose) {
      cam.position.copy(this.pose.pos);
      cam.lookAt(this.pose.look);
      cam.updateMatrixWorld();
      return;
    }
    const switched = kind !== this.kind;
    this.kind = kind;
    // A switch puts you behind the new robot, looking where it looks, at its
    // own pitch — no hunting for an angle after every 1/2/3 (playtest).
    if (switched) {
      // Swing (not jump) behind the new robot over about half a second.
      this.settle = 0.6;
      this.pitch = PITCH[kind];
      this.lastUser = -10;
    }
    this.settle = Math.max(0, this.settle - dt);
    const target = new THREE.Vector3(robotPos.x, robotPos.y + ROBOT_HEIGHT_M[kind] * PIVOT[kind], robotPos.z);
    const k = this.snapNext ? 1 : 1 - Math.exp(-dt * (switched ? 3 : 9));
    this.pivot.lerp(target, k);

    // Follow the robot's heading once the mouse has been idle a moment: while
    // it moves or turns, and for the swing after a switch. Not while it backs
    // up (S), which would spin the camera half a turn every time.
    const idle = this.time - this.lastUser > 0.8;
    if (idle && !this.backing && (speed > 0.05 || this.turning || this.settle > 0)) {
      const want = Math.atan2(-Math.cos(heading), -Math.sin(heading));
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const rate = this.settle > 0 ? 8 : 3.2;
      this.yaw += d * Math.min(1, dt * rate);
    }

    const wantDist = DIST[kind] * this.zoom;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let d = wantDist;
    this.ray.set(this.pivot, dir);
    this.ray.far = wantDist + 0.3;
    const hits = this.ray.intersectObjects(colliders, true);
    if (hits.length) d = Math.max(0.5, Math.min(d, hits[0].distance - 0.3));
    const kd = this.snapNext ? 1 : d < this.dist ? 1 - Math.exp(-dt * 25) : 1 - Math.exp(-dt * 3);
    this.dist += (d - this.dist) * kd;
    this.want.copy(this.pivot).addScaledVector(dir, this.dist);
    if (room) {
      const pad = 0.45;
      this.want.x = THREE.MathUtils.clamp(this.want.x, room[0] + pad, room[2] - pad);
      this.want.z = THREE.MathUtils.clamp(this.want.z, room[1] + pad, room[3] - pad);
    }
    cam.position.copy(this.want);
    this.look.copy(this.pivot);
    this.look.y += LOOK_UP[kind];
    cam.lookAt(this.look);
    cam.updateMatrixWorld();
    this.snapNext = false;
  }
}
