/**
 * camera3d.ts — the third-person camera.
 *
 * An orbit around the driven robot's chest: mouse (pointer lock, or drag)
 * turns it, the wheel zooms, and while the player is moving and has not touched
 * the mouse for a moment it drifts back behind the robot's heading. A ray from
 * the pivot to the wanted position stops it at the first wall, ceiling or door,
 * so it never sees through the building.
 *
 * WASD are camera-relative: `stick()` turns "forward" into the sim's own axes.
 * That is input mapping, not game logic — the sim still gets a plain stick.
 */

import * as THREE from 'three';

import type { RobotKind } from '../sim/types';
import { ROBOT_HEIGHT_M } from '../sim/units';

const DIST: Record<RobotKind, number> = { voxxy: 3.1, droid: 4.4, biggy: 4.2 };
const PIVOT: Record<RobotKind, number> = { voxxy: 0.85, droid: 0.8, biggy: 0.8 };

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

  /** Teleport next frame instead of easing (chapter start, cutscene cut). */
  cut(): void {
    this.snapNext = true;
  }

  /** Camera-relative stick -> sim stick (sim +x right, +y down = world +z). */
  stick(fwd: number, strafe: number): [number, number] {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    return [fx * fwd + rx * strafe, fz * fwd + rz * strafe];
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
    this.kind = kind;
    const target = new THREE.Vector3(robotPos.x, robotPos.y + ROBOT_HEIGHT_M[kind] * PIVOT[kind], robotPos.z);
    const k = this.snapNext ? 1 : 1 - Math.exp(-dt * (switched ? 3 : 9));
    this.pivot.lerp(target, k);

    // Drift behind the robot when it moves and the mouse is idle — but not when
    // it walks toward the camera, or the camera would chase its own tail.
    if (speed > 0.3 && this.time - this.lastUser > 1.2) {
      const hx = Math.cos(heading);
      const hz = Math.sin(heading);
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      if (hx * fx + hz * fz > -0.25) {
        const want = Math.atan2(-hx, -hz);
        let d = want - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 1.6 * Math.min(1, speed / 2));
      }
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
    cam.position.copy(this.want);
    cam.lookAt(this.pivot);
    cam.updateMatrixWorld();
    this.snapNext = false;
  }
}
