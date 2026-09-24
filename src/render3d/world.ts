/**
 * world.ts — the 3D build's seam with the sim, like `src/render/scene.ts` is
 * for the diorama: it owns the renderer, the pipeline, the venue, the robots,
 * the props and the camera, and once a frame it READS a `GameSnapshot`.
 */

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

import type { GameSnapshot, RobotKind } from '../sim/types';
import { PX_PER_M, m } from '../sim/units';

import { ThirdPersonCamera } from './camera3d';
import { applyBoxProjection, type ProbeBox } from './boxproj';
import { buildDetails } from './details';
import { createMaterials } from './materials';
import { Pipeline, QUALITY, type QualityName, type VolumeSpot } from './pipeline';
import { createProps, type Props3D } from './props3d';
import { createRobots, updateRobots, type Robot3D } from './robots3d';
import { HEIGHTS, X_END, buildVenue, type Venue3D } from './venue';
import { CY0, CY1 } from '../sim/geometry';

export interface World3D {
  readonly renderer: THREE.WebGLRenderer;
  /** For debugging and the screenshot harness only. */
  readonly scene: THREE.Scene;
  readonly pipeline: Pipeline;
  readonly cam: ThirdPersonCamera;
  /** `intro`: play the establishing dolly instead of following the robot. */
  render(snap: GameSnapshot, dt: number, intro?: boolean): void;
  resize(w: number, h: number): void;
  /** Sim px (x, y) at `hM` metres up -> canvas CSS px, or null behind the camera. */
  project(x: number, y: number, hM: number): { x: number; y: number } | null;
  dispose(): void;
}

export interface WorldOptions {
  quality?: QualityName;
  preserveDrawingBuffer?: boolean;
}

export function createWorld3D(canvas: HTMLCanvasElement, opts: WorldOptions = {}): World3D {
  const quality = QUALITY[opts.quality ?? 'high'];
  RectAreaLightUniformsLib.init();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  const cam = new ThirdPersonCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
  scene.userData.camera = cam.camera;

  const mats = createMaterials(renderer);
  // The faintest night fill: sky-blue from above, a bruise of magenta from the
  // floor, so a silhouette in an unlit corner still reads against the dark.
  scene.add(new THREE.HemisphereLight(0x2a3a6a, 0x2a0f2a, 0.3));
  const pipeline = new Pipeline(renderer, scene, cam.camera, quality);
  const venue: Venue3D = buildVenue(mats, pipeline.reflection);
  scene.add(venue.group);
  pipeline.reflectors = venue.reflectors;
  pipeline.setFogBox(new THREE.Vector3(m(8), -1, m(6)), new THREE.Vector3(m(X_END + 8), 9, m(694)));
  // Wall furniture keeps clear of what the venue already hung: posters, the ad,
  // the extinguisher cabinets (sim x ranges, per wall side).
  const details = buildDetails(mats, pipeline.reflection, [
    [189, 209, -1],
    [529, 549, -1],
    [320, 340, 1],
    [520, 540, 1],
    [355, 383, -1],
    [88, 102, -1],
    [253, 267, -1],
    [553, 567, 1],
  ]);
  scene.add(details.group);
  pipeline.reflectors = [...venue.reflectors, ...details.reflectors];
  const robots: Map<RobotKind, Robot3D> = createRobots(scene, quality.shadowSize);
  const props: Props3D = createProps(scene, mats);
  for (const L of venue.volumeSpots) L.light.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);

  // Mirror bounces: the sim's secondary lights (cinema E's screen), drawn as
  // unshadowed spots from the point on the screen they leave.
  const mirrorSpots: THREE.SpotLight[] = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.SpotLight(0xffffff, 0, 20, 0.5, 0.6, 2);
    s.visible = false;
    scene.add(s, s.target);
    mirrorSpots.push(s);
  }

  // Image-based light from the venue itself: a cube capture of the corridor
  // with every robot and lamp off, so glossy shells and glass pick up the neon
  // that is actually around them.
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envBaked = false;
  const PROBE = new THREE.Vector3(m(300), 1.8, m(350));
  const probeBox: ProbeBox = {
    min: new THREE.Vector3(0, 0, m(CY0)),
    max: new THREE.Vector3(m(X_END + 8), HEIGHTS.corridor, m(CY1)),
    probe: PROBE,
  };
  let patchedFrames = 0;
  let introT = 0;
  const INTRO = {
    from: new THREE.Vector3(m(560), 1.1, m(350) + 1.5),
    to: new THREE.Vector3(m(250), 2.1, m(342)),
    lookFrom: new THREE.Vector3(m(420), 1.4, m(345)),
    lookTo: new THREE.Vector3(m(60), 1.0, m(350)),
  };

  function bakeEnv(): void {
    const hidden: THREE.Object3D[] = [];
    for (const r of robots.values()) {
      if (r.rig.root.visible) hidden.push(r.rig.root);
      r.rig.root.visible = false;
      r.lamp.visible = false;
    }
    const envRT = pmrem.fromScene(scene, 0.02, 0.1, 80, { size: 256, position: PROBE });
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.3;
    for (const o of hidden) o.visible = true;
    for (const r of robots.values()) r.lamp.visible = true;
    envBaked = true;
  }

  let w = 4;
  let h = 4;
  const _pos = new THREE.Vector3();
  const volSpots: VolumeSpot[] = [];
  let time = 0;

  function resize(cw: number, ch: number): void {
    w = Math.max(4, cw);
    h = Math.max(4, ch);
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    pipeline.setSize(w * pr, h * pr);
    cam.camera.aspect = w / h;
    cam.camera.updateProjectionMatrix();
  }

  /*
   * Adaptive resolution: the pipeline is heavy (a reflection pass, GTAO, a
   * volumetric march, a bloom chain), so on a weaker GPU the pixel ratio steps
   * down until the frame fits, and back up when there is room. Frame time is
   * measured on the wall clock, not the sim's clamped dt.
   */
  const maxRatio = Math.min(window.devicePixelRatio || 1, quality.pixelRatio);
  let ratio = maxRatio;
  let slow = 0;
  let fast = 0;
  let lastWall = performance.now();
  function adapt(): void {
    if (opts.preserveDrawingBuffer) return; // screenshot mode: never
    const now = performance.now();
    const ms = now - lastWall;
    lastWall = now;
    if (ms > 200) return; // a hitch (tab switch, shader compile), not a trend
    slow = ms > 24 ? slow + 1 : Math.max(0, slow - 1);
    fast = ms < 13 ? fast + 1 : 0;
    let next = ratio;
    if (slow > 45) next = Math.max(0.55, ratio - 0.15);
    else if (fast > 240) next = Math.min(maxRatio, ratio + 0.1);
    if (next !== ratio) {
      ratio = next;
      slow = 0;
      fast = 0;
      renderer.setPixelRatio(ratio);
      resize(w, h);
    }
  }

  function render(snap: GameSnapshot, dt: number, intro = false): void {
    time += dt;
    adapt();
    if (!envBaked) bakeEnv();
    venue.update(time, dt);
    details.update(time);
    updateRobots(robots, snap, dt);
    props.update(snap, time, dt);
    // Props are built lazily from the first snapshots; patch whatever exists.
    if (patchedFrames < 3) {
      applyBoxProjection(scene, probeBox);
      patchedFrames++;
    }

    const active = snap.bots[snap.active] ?? snap.bots[0];
    const rob = robots.get(active.kind);
    if (intro && !cam.pose) {
      introT += dt;
      cam.intro(introT, INTRO.from, INTRO.to, INTRO.lookFrom, INTRO.lookTo);
    } else if (rob) {
      _pos.copy(rob.rig.root.position);
      const speed = Math.hypot(active.vx, active.vy) / PX_PER_M;
      cam.update(dt, active.kind, _pos, active.face, speed, [...venue.colliders, ...props.colliders]);
    }

    // Mirror bounces from the sim.
    let mi = 0;
    for (const L of snap.lights) {
      if (L.primary || mi >= mirrorSpots.length) continue;
      const s = mirrorSpots[mi++];
      s.visible = true;
      s.color.setRGB(L.c[0] / 255, L.c[1] / 255, L.c[2] / 255);
      s.intensity = 140;
      s.angle = Math.min(1.1, L.ang ?? 0.8);
      s.distance = m(L.range);
      s.position.set(m(L.x), 2.6, m(L.y));
      s.target.position.set(m(L.x) + Math.cos(L.face) * 5, 1.0, m(L.y) + Math.sin(L.face) * 5);
      s.target.updateMatrixWorld();
    }
    for (; mi < mirrorSpots.length; mi++) mirrorSpots[mi].visible = false;

    // The fog takes a fixed number of lights. The robots' lamps always, then
    // whatever else is nearest the camera — so the haze you can see is lit by
    // the lights you can see, wherever you are in the building.
    const eye = cam.camera.position;
    volSpots.length = 0;
    for (const r of robots.values()) if (r.fog > 0) volSpots.push({ light: r.lamp, fog: r.fog });
    const others: VolumeSpot[] = [...venue.volumeSpots];
    for (const s of mirrorSpots) if (s.visible) others.push({ light: s, fog: 0.03 });
    others.sort((a, b) => a.light.position.distanceToSquared(eye) - b.light.position.distanceToSquared(eye));
    volSpots.push(...others);
    const pts = [...venue.volumePoints, ...props.volumePoints];
    pts.sort((a, b) => a.position.distanceToSquared(eye) - b.position.distanceToSquared(eye));
    pipeline.setVolumeLights(volSpots, pts);
    pipeline.render(dt);
  }

  const _v = new THREE.Vector3();
  function project(x: number, y: number, hM: number): { x: number; y: number } | null {
    _v.set(m(x), hM, m(y)).project(cam.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: ((_v.x + 1) / 2) * w, y: ((1 - _v.y) / 2) * h };
  }

  return {
    renderer,
    scene,
    pipeline,
    cam,
    render,
    resize,
    project,
    dispose(): void {
      pipeline.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
