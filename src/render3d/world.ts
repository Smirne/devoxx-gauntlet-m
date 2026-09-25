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
import { LightPool } from './lightpool';
import { createMaterials } from './materials';
import { Pipeline, QUALITY, type QualityName, type VolumeSpot } from './pipeline';
import { createProps, type Props3D } from './props3d';
import { createRobots, updateGlare, updateRobots, type Robot3D } from './robots3d';
import { HEIGHTS, SIGN_SPANS, X_END, buildVenue, type Venue3D } from './venue';
import { CY0, CY1, F1 } from '../sim/geometry';
import { CRATE_AT, CRATE_ROW, PULL_BACK, STAND_AT, WALK_AT } from '../sim/opening';
import { buildCrates } from '../render/crates';

export interface World3D {
  readonly renderer: THREE.WebGLRenderer;
  /** For debugging and the screenshot harness only. */
  readonly scene: THREE.Scene;
  readonly pipeline: Pipeline;
  readonly cam: ThirdPersonCamera;
  /** `intro`: play the establishing dolly instead of following the robot. */
  render(snap: GameSnapshot, dt: number, intro?: boolean): void;
  /** Photo mode: depth of field focused on the driven robot. */
  photo: boolean;
  /** Debug: refresh cinema E's mirror (on by default). */
  mirrorOn: boolean;
  resize(w: number, h: number): void;
  /** Sim px (x, y) at `hM` metres up -> canvas CSS px, or null behind the camera. */
  project(x: number, y: number, hM: number): { x: number; y: number } | null;
  /** `project` for the HUD hint: never null; off-screen in the true direction when behind. */
  projectHint(x: number, y: number, hM: number): { x: number; y: number };
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
  // Bounce stand-in: the floor and the neons throw warm magenta up at the ceiling.
  scene.add(new THREE.HemisphereLight(0x2a3a6a, 0x3a1636, 0.1));
  const pipeline = new Pipeline(renderer, scene, cam.camera, quality);
  const venue: Venue3D = buildVenue(mats, pipeline.reflection);
  scene.add(venue.group);
  pipeline.reflectors = venue.reflectors;
  pipeline.setFogBox(new THREE.Vector3(m(8), -1, m(6)), new THREE.Vector3(m(X_END + 8), 9, m(694)));
  // Wall furniture keeps clear of what the venue already hung: posters, the ad,
  // the extinguisher cabinets (sim x ranges, per wall side).
  const details = buildDetails(mats, pipeline.reflection, [...SIGN_SPANS, venue.adSpan, ...(venue.candySpan ? [venue.candySpan] : [])]);
  scene.add(details.group);
  pipeline.reflectors = [...venue.reflectors, ...details.reflectors];
  const robots: Map<RobotKind, Robot3D> = createRobots(scene, quality.shadowSize);
  // The lamp flares are aimed at the real camera; mirrored, they became big
  // out-of-place blobs on the floor.
  for (const r of robots.values()) if (r.glare) pipeline.reflectors.push(r.glare);
  const props: Props3D = createProps(scene, mats);
  // Point lights beyond the robots' own spills go through a fixed pool.
  const pool = new LightPool(scene, 14, [...robots.values()].map((r) => r.spill));
  pool.collect(scene);
  for (const L of venue.volumeSpots) L.light.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);

  // THE OPENING: the three arrive in crates against the corridor's west wall
  // (src/sim/opening.ts owns the clock; the crates are the 2.5D build's own
  // model, src/render/crates.ts, placed exactly as src/render/scene.ts places
  // them). They stay for the rest of chapter 1, open and dark, as the sim keeps
  // their footprints solid. Two lights go with them, always in the scene and
  // switched by intensity (a visibility toggle recompiles every material): the
  // emergency bulkhead over the row, which gives out at the end, and a key
  // light on whichever robot is being presented.
  const crates = buildCrates({ baseY: 0, centre: { x: m(CRATE_ROW.x), z: m(CRATE_ROW.y) }, yaw: Math.PI / 2, seed: 7 });
  scene.add(crates.root);
  const bulkhead = new THREE.SpotLight(0xffe2b0, 0, 9, 0.9, 0.7, 2);
  bulkhead.position.set(m(CRATE_ROW.x) + 1.4, 3.2, m(CRATE_ROW.y));
  bulkhead.target.position.set(m(CRATE_ROW.x) + 0.4, 0, m(CRATE_ROW.y));
  scene.add(bulkhead, bulkhead.target);
  const keyLight = new THREE.SpotLight(0xffffff, 0, 8, 0.32, 0.8, 2);
  keyLight.position.set(m(CRATE_ROW.x) + 4.5, 2.6, m(CRATE_ROW.y));
  scene.add(keyLight, keyLight.target);
  const OPEN_CRATE_LIT = 0.08;
  const _oPos = new THREE.Vector3();
  const _oLook = new THREE.Vector3();
  const _fPos = new THREE.Vector3();
  const _fLook = new THREE.Vector3();

  /** Pose the crates and the two lights from `snap.opening`; returns the camera pose while it runs. */
  function stageOpening(snap: GameSnapshot): { pos: THREE.Vector3; look: THREE.Vector3; follow: number } | null {
    const o = snap.opening;
    crates.root.visible = o !== null || snap.chapter === 1;
    if (o === null) {
      crates.setLit(OPEN_CRATE_LIT);
      crates.setEmergency(0);
      for (const c of crates.crates) {
        c.setLamp(0);
        c.setOpen(1);
      }
      bulkhead.intensity = 0;
      keyLight.intensity = 0;
      return null;
    }
    const lamps = Math.max(o.lamp.voxxy, o.lamp.droid, o.lamp.biggy);
    crates.setLit(Math.max(OPEN_CRATE_LIT, lamps) * o.emergency);
    crates.setEmergency(o.emergency);
    for (const c of crates.crates) {
      c.setLamp(o.lamp[c.kind]);
      c.setOpen(o.open[c.kind]);
    }
    bulkhead.intensity = 70 * o.emergency;
    // The key light follows the card: the robot being presented is the one lit.
    const who = o.card;
    const row = new THREE.Vector3(m(CRATE_ROW.x), 1.0, m(CRATE_ROW.y));
    if (who) {
      const at = CRATE_AT[who];
      keyLight.target.position.set(m(at.x), 1.0, m(at.y));
      keyLight.intensity = 60 * o.lamp[who];
    } else keyLight.intensity *= 0.9;
    keyLight.target.updateMatrixWorld();
    // Camera: frontal on the row, a step east of it, easing toward whoever is
    // being presented; then, as the sim pulls back (WALK_AT .. +PULL_BACK), it
    // blends into the follow camera's framing behind the lead robot.
    const focus = who ? new THREE.Vector3(m(CRATE_AT[who].x), 1.0, m(CRATE_AT[who].y)) : row;
    _oLook.lerp(focus, _oLook.lengthSq() === 0 ? 1 : 0.06);
    _oPos.set(_oLook.x + 5.2, 1.55, _oLook.z * 0.6 + row.z * 0.4);
    const u = Math.min(1, Math.max(0, (o.t - WALK_AT) / PULL_BACK));
    const e = u * u * (3 - 2 * u);
    const lead = snap.bots[snap.active] ?? snap.bots[0];
    const lx = m(STAND_AT[lead.kind].x);
    const lz = m(STAND_AT[lead.kind].y);
    _fPos.set(lx - DIST_BEHIND, 1.9, lz);
    _fLook.set(lx + 2, 1.0, lz);
    return { pos: _oPos.clone().lerp(_fPos, e), look: _oLook.clone().lerp(_fLook, e), follow: e };
  }
  const DIST_BEHIND = 3.4;

  // Mirror bounces: the sim's secondary lights (cinema E's screen), drawn as
  // unshadowed spots from the point on the screen they leave.
  const mirrorSpots: THREE.SpotLight[] = [];
  for (let i = 0; i < 3; i++) {
    // Always in the scene, switched by intensity: toggling `visible` changes
    // three's light count, which recompiles every material — a multi-second
    // freeze the moment Biggy's smash let light reach the mirror (24 Sep).
    const s = new THREE.SpotLight(0xffffff, 0, 20, 0.5, 0.6, 2);
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
    // The closed section only: east of the shutter the capture (taken west of
    // it) would reflect the red shutter into every surface.
    max: new THREE.Vector3(m(F1.fireX), HEIGHTS.corridor, m(CY1)),
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
    pool.update(PROBE);
    const hidden: THREE.Object3D[] = [];
    for (const r of robots.values()) {
      if (r.rig.root.visible) hidden.push(r.rig.root);
      r.rig.root.visible = false;
      r.lamp.visible = false;
    }
    const envRT = pmrem.fromScene(scene, 0.02, 0.1, 80, { size: 256, position: PROBE });
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.35;
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
      pool.collect(scene);
      patchedFrames++;
    }

    const active = snap.bots[snap.active] ?? snap.bots[0];
    const rob = robots.get(active.kind);
    const grade = pipeline.grade;
    const staged = stageOpening(snap);
    if (staged && !cam.pose) {
      // The opening frames itself; the follow camera takes over, snapped to the
      // same framing, on the frame the player gets the keyboard.
      const c = cam.camera;
      c.position.copy(staged.pos);
      c.lookAt(staged.look);
      c.updateMatrixWorld();
      cam.yaw = -Math.PI / 2;
      cam.pitch = 0.22;
      cam.cut();
      grade.dofAmount = 0.6 * (1 - staged.follow);
      grade.dofFocus = c.position.distanceTo(staged.look);
      grade.dofRange = 3;
    } else if (intro && !cam.pose) {
      introT += dt;
      cam.intro(introT, INTRO.from, INTRO.to, INTRO.lookFrom, INTRO.lookTo);
      // Rack focus down the corridor as the camera travels.
      grade.dofAmount = 0.85;
      grade.dofFocus = 6 + 10 * Math.max(0, 1 - introT / 14);
      grade.dofRange = 7;
    } else if (rob) {
      grade.dofAmount = world.photo ? 0.9 : 0;
      if (world.photo) {
        grade.dofFocus = cam.camera.position.distanceTo(rob.rig.root.position) - 0.2;
        grade.dofRange = 3.5;
      }
      _pos.copy(rob.rig.root.position);
      const speed = Math.hypot(active.vx, active.vy) / PX_PER_M;
      cam.update(dt, active.kind, _pos, active.face, speed, [...venue.colliders, ...props.colliders]);
    }

    // Mirror bounces from the sim.
    let mi = 0;
    for (const L of snap.lights) {
      if (L.primary || mi >= mirrorSpots.length) continue;
      const s = mirrorSpots[mi++];
      s.color.setRGB(L.c[0] / 255, L.c[1] / 255, L.c[2] / 255);
      s.intensity = 140;
      s.angle = Math.min(1.1, L.ang ?? 0.8);
      s.distance = m(L.range);
      s.position.set(m(L.x), 2.6, m(L.y));
      s.target.position.set(m(L.x) + Math.cos(L.face) * 5, 1.0, m(L.y) + Math.sin(L.face) * 5);
      s.target.updateMatrixWorld();
    }
    for (; mi < mirrorSpots.length; mi++) mirrorSpots[mi].intensity = 0;

    pool.update(cam.camera.position);
    updateGlare(robots, cam.camera);

    // The fog takes a fixed number of lights. The robots' lamps always, then
    // whatever else is nearest the camera — so the haze you can see is lit by
    // the lights you can see, wherever you are in the building.
    const eye = cam.camera.position;
    volSpots.length = 0;
    for (const r of robots.values()) if (r.fog > 0) volSpots.push({ light: r.lamp, fog: r.fog });
    const others: VolumeSpot[] = [...venue.volumeSpots];
    for (const s of mirrorSpots) if (s.intensity > 0) others.push({ light: s, fog: 0.03 });
    others.sort((a, b) => a.light.position.distanceToSquared(eye) - b.light.position.distanceToSquared(eye));
    volSpots.push(...others);
    const pts = [...venue.volumePoints, ...props.volumePoints];
    pts.sort((a, b) => a.position.distanceToSquared(eye) - b.position.distanceToSquared(eye));
    pipeline.setVolumeLights(volSpots, pts);

    pipeline.render(dt);

    // Cinema E's mirror: re-rendered only while the camera is in the room or
    // at its door, since that is the only place it can be seen from. After the
    // frame, so the shadow maps it samples exist and are this frame's.
    const mir = venue.mirror;
    if (mir && world.mirrorOn) {
      const e = mir.room;
      const cx = eye.x * PX_PER_M;
      const cz = eye.z * PX_PER_M;
      if (cx > e.x - 20 && cx < e.x + e.w + 20 && cz > e.y - 40 && cz < e.y + e.h + 10) {
        mir.render(renderer, scene, cam.camera);
      }
    }

  }

  const _v = new THREE.Vector3();
  /**
   * `project`, for the HUD's hint: a point BEHIND the camera does not vanish
   * (the perspective divide flips it through the middle of the screen). It is
   * returned far off the edge in its true direction instead, so the HUD's
   * off-screen chevron points at it — the 2.5D camera never has anything
   * behind it, the 3D one often does.
   */
  function projectHint(x: number, y: number, hM: number): { x: number; y: number } {
    const c = cam.camera;
    _v.set(m(x), hM, m(y)).applyMatrix4(c.matrixWorldInverse);
    if (_v.z < -0.05) {
      const p = project(x, y, hM);
      if (p) return p;
    }
    // Behind (camera looks down -z): its right/up components give the side.
    let dx = _v.x;
    const dy = -_v.y;
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dx = 1;
    const k = 4 * Math.max(w, h) / Math.hypot(dx, dy);
    return { x: w / 2 + dx * k, y: h / 2 + Math.max(dy, 0.2) * k };
  }

  function project(x: number, y: number, hM: number): { x: number; y: number } | null {
    _v.set(m(x), hM, m(y)).project(cam.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: ((_v.x + 1) / 2) * w, y: ((1 - _v.y) / 2) * h };
  }

  const world: World3D = {
    renderer,
    scene,
    pipeline,
    photo: false,
    mirrorOn: true,
    cam,
    render,
    resize,
    project,
    projectHint,
    dispose(): void {
      pipeline.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
  return world;
}
