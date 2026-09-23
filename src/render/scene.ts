/**
 * scene.ts — the diorama, assembled.
 *
 * This is the seam between `src/sim` and everything in `src/render`: it owns the
 * `WebGLRenderer`, the venue built by `buildVenue()`, one `RobotRig` per robot,
 * the `LightLayer` and the fixed orthographic camera, and once a frame it *reads*
 * a `GameSnapshot` and draws it.
 *
 * It contains no game logic and never mutates the snapshot (CLAUDE.md). Every
 * number it uses comes out of the snapshot or out of `src/sim/units.ts`; the only
 * decisions made here are which mesh stands for which `Prop.kind` and where the
 * camera goes, neither of which the sim cares about.
 *
 * Three cameras live in here, and exactly one is used per frame:
 *
 *  - the **diorama** camera (`src/render/camera.ts`), the game's real viewpoint:
 *    orthographic, yawed and pitched, framed on the chapter's `ViewRect`;
 *  - the **top-down** debug camera (`setTopDown(true)`), a plain orthographic
 *    plan view covering exactly the sim rect 0,0..1900,700, north up, flat lit,
 *    no fog. The Stage 1 floor-plan overlay check photographs this one, so the
 *    frame is letterboxed to the sim rect's own 19:7 aspect rather than stretched;
 *  - the **portrait** camera (`posePortrait(kind)`), a front three-quarter
 *    perspective shot of one robot alone on a plinth. The Stage 1 model-sheet
 *    check photographs this one, which is why it must never be a plan view: the
 *    critic has to see the robot's face.
 */

import * as THREE from 'three';

import { W as SIM_W, H as SIM_H } from '../sim/constants';
import type { GameSnapshot, Person, Prop, RobotKind, ViewRect } from '../sim/types';
import { PX_PER_M, ROBOT_HEIGHT_M, STOREY_H_M, m } from '../sim/units';

import { createCamera, type DioramaCamera } from './camera';
import { createLightLayer, type LightLayer } from './lighting';
import { createRobot, measureBounds, updateRobot, EXCLUDE_FROM_BOUNDS, type RobotRig } from './robots';
import { BREAKER_H, BREAKER_Y, buildVenue, type Venue } from './venue';

const KINDS: readonly RobotKind[] = ['voxxy', 'droid', 'biggy'];

/** The plan, in metres. The top-down debug frame is exactly this rect. */
const MAP_W_M = m(SIM_W);
const MAP_H_M = m(SIM_H);

/** Dark, slightly blue: the venue at night, never flat grey. */
const BG_PLAY = 0x05070c;
/** Letterbox and background of the plan view: plain black, so the rect's edge reads. */
const BG_TOPDOWN = 0x000000;
/** A neutral studio grey for the portrait, so the robot's own palette is what reads. */
const BG_PORTRAIT = 0x23262c;

/* ------------------------------------------------------------------ framing */

/**
 * How much of the venue the diorama holds in frame, per chapter, in sim pixels.
 *
 * A chapter's `ViewRect` is the *bounds* of the playable area — chapter 1's is
 * 900 x 620, which is 72 x 50 metres. Framed whole, a 1.15 m Voxxy renders about
 * fifteen pixels tall and the judge cannot see the robot they are driving, which
 * is the one thing a diorama exists to show. So the camera frames a room-sized
 * window instead and slides it, clamped so it never leaves the chapter's rect.
 * Angle and zoom never change: it is still one fixed viewpoint per chapter, just
 * pointed at the room the player is in rather than at the whole storey.
 */
const FOCUS: Readonly<Record<number, { w: number; h: number }>> = Object.freeze({
  1: { w: 320, h: 235 },
  2: { w: 380, h: 280 },
  3: { w: 380, h: 280 },
  4: { w: 345, h: 255 },
});
const FOCUS_FALLBACK = { w: 360, h: 265 };
/**
 * Cutscenes and the title card get their chapter's whole rect, but the chapter
 * rects are 50-100 m wide and at that zoom a robot is four pixels tall. A cut is
 * a wide shot on purpose, so it keeps the rect — but it is capped, or the first
 * frame of chapter 4 (a 105 m rect) reads as an empty ribbon.
 */
const WIDE_MAX = { w: 900, h: 660 };
/**
 * The cutscene window, sim px, per chapter — Michele's "I'd zoom more".
 *
 * A transition is a close beat, not an establishing shot. On the chapter's own rect
 * the three robots were 900 px of corridor away from the camera and read as three
 * specks; at this width they are the subject, and the camera tracks the middle of
 * the group rather than whichever robot the player happened to be driving. Still
 * wider than play (chapter 1 plays at 320x235) so the route they are walking is
 * legible, but close enough that you can see who is walking it.
 *
 * **Chapter 3 is deliberately absent and stays on `WIDE_MAX`.** Its transition walks
 * the three of them UP the main staircase, and the renderer has no elevation for a
 * robot on a flight: `placeRobots` puts every robot at the storey's datum, and
 * `groundRiseM` — which `src/sim/geometry.ts` exports for exactly this and says the
 * renderer is the one that reads it — is not read by anything. So the robots walk
 * at hall height while the treads climb to 5 m over them, and the closer the camera
 * gets the more plainly they are inside the staircase rather than on it. That is a
 * pre-existing gap, not this framing's; until it is fixed, zooming in on it would
 * only frame it better. See the note in `placeRobots`.
 */
const CUT_FRAME: Readonly<Record<number, { w: number; h: number }>> = Object.freeze({
  1: { w: 430, h: 315 },
});
/** Exponential approach rate of the framing, s^-1. High enough not to read as drift. */
const FOCUS_EASE = 6;
/** A jump larger than this (a `place`, a chapter change) cuts instead of panning. */
const FOCUS_CUT_PX = 260;

/** The ring drawn on the floor under the robot being driven. */
const RING_INNER = 0.52;
const RING_OUTER = 0.70;

/* ------------------------------------------------------------------ props */

/**
 * How each `Prop.kind` the four chapters emit is drawn. Nothing here decides
 * anything about the game — it is a lookup from a stable sim string to a box.
 *
 * `tl` marks the kinds whose `x,y` is a rect's top-left corner (they come from a
 * `Rect` in `src/sim/geometry.ts`); everything else reports a centre point.
 */
interface PropSpec {
  /** Height in metres. */
  h: number;
  /** Base colour, sRGB hex. */
  color: number;
  /** `x,y` is the top-left of `w,h` rather than its centre. */
  tl?: boolean;
  /** Draw as a floor plate rather than a solid: markers, lanes, drop zones. */
  flat?: boolean;
  /** Footprint in metres when the prop carries no `w`/`h`. */
  fw?: number;
  fd?: number;
  /**
   * Metres off the floor. For things bolted to a wall rather than standing on the
   * ground — without it, a panel a robot has to be lifted up to reach is drawn at
   * ankle height, which tells the player the opposite of the truth.
   */
  lift?: number;
  /**
   * A standby glow the prop carries whatever its state, sRGB hex.
   *
   * `STATE_EMISSIVE` only lights a prop once something has happened to it, which
   * is no help in a blackout: the thing you are looking FOR is by definition still
   * idle. A panel with power to its own indicator is findable before you have
   * solved it, and still changes colour when you do.
   */
  glow?: number;
}

const PROPS: Readonly<Record<string, PropSpec>> = {
  /* chapter 1 — the closed cinema section */
  firedoor: { h: 2.1, color: 0x8d3b2a, tl: true },
  keypad: { h: 1.25, color: 0x2c3340, tl: true },
  /*
   * Chapter 1's door override, up on the wall beside cinema B's door.
   *
   * Michele: "I had trouble finding the projector / open the room with biggy and
   * droid. There should be something visible." It was a 0.6 m grey box sitting on
   * the floor in a blacked-out corridor — unlit, at ankle height, for a control
   * the fiction says is a metre above Droid's reach. Now it is a lit panel at
   * 2.5 m: tall, standing proud of the wall, with its own amber standby lamp so
   * it reads as powered equipment long before you work out what it does.
   */
  'projector-panel': { h: 0.9, color: 0x39414f, tl: true, lift: 2.5, glow: 0x6b4406 },
  screen: { h: 5.2, color: 0xcfd6dd, tl: true },
  alcove: { h: 0.05, color: 0x2f7d4f, tl: true, flat: true },
  lock: { h: 2.1, color: 0x4a4038, tl: true },
  jammed: { h: 2.1, color: 0x6b4630, tl: true },
  /* chapter 2 — the exhibition hall */
  // `breaker` is NOT in this table: its three handles carry a live sim value, so it
  // is drawn by `drawBreaker` the way the cam wheel is drawn by `drawCamWheel`.
  // The rack's CARCASS is venue geometry (`ground.ts`), like the breaker enclosure:
  // this is the live band across its face, so the chapter's idle/active/done state
  // reads from across the room. Drawn as a solid box it was a second, duplicate
  // cabinet standing in the same place — the mistake the breaker panel was making.
  rack: { h: 0.3, color: 0x2b3a44, tl: true, lift: 1.55, glow: 0x1f5c38 },
  printer: { h: 0.95, color: 0xb9bec6, tl: true },
  roller: { h: 2.6, color: 0x7d8792, tl: true },
  gate: { h: 1.1, color: 0x2b3542, tl: true },
  lane: { h: 0.04, color: 0x6a5a2a, tl: true, flat: true },
  duck: { h: 0.3, color: 0xf0c040 },
  // The circle the duck has to stop in. Michele found the duck ("I can push this
  // yellow thing around. Does it have a purpose?") and not the target, which is
  // exactly the `projector-panel` problem: an unlit floor decal in a blacked-out
  // hall is not findable, and the thing that explains the yellow thing is the
  // circle. `glow` makes it read before it is solved, as a painted line under a
  // sponsor's own spot would.
  'duck-target': { h: 0.03, color: 0x3f7fa8, flat: true, glow: 0x1d4a63 },
  sticker: { h: 0.06, color: 0xff7a1a },
  'race-marker': { h: 0.5, color: 0xff7a1a },
  /* chapter 3 — breakfast */
  'soup-station': { h: 1.0, color: 0xc0392b },
  ladle: { h: 0.9, color: 0x9aa3ad, tl: true },
  dropzone: { h: 0.04, color: 0x2f7d4f, tl: true, flat: true },
  pot: { h: 0.45, color: 0x8e5a3a },
  soup: { h: 0.12, color: 0xd9452f },
  sign: { h: 2.2, color: 0x1f4f8f, fw: 4.8, fd: 0.14 },
  /* chapter 4 — the keynote */
  cake: { h: 0.55, color: 0xe6d7b8 },
  'cake-mark': { h: 0.04, color: 0x2f7d4f, tl: true, flat: true },
  stage: { h: 0.45, color: 0x2a2430, tl: true },
  crowd: { h: 0.05, color: 0x3a3550, flat: true, fw: 2, fd: 2 },
  'banner-hook': { h: 0.25, color: 0xb0b6bd },
  banner: { h: 1.1, color: 0xff7a1a, tl: true },
  spotlight: { h: 0.35, color: 0xffd9a0 },
  seatrow: { h: 0.55, color: 0x3c2f3a, tl: true },
  seatblock: { h: 0.55, color: 0x3c2f3a, tl: true },
};

const PROP_FALLBACK: PropSpec = { h: 0.7, color: 0x5a6069 };

/** State tints, on top of the prop's own colour. */
const STATE_EMISSIVE: Readonly<Record<string, number>> = {
  done: 0x1f5c38,
  active: 0x6b4406,
  broken: 0x5a1712,
  open: 0x1f5c38,
};

/** Who is who in a crowd, when the sim does not give a colour. */
const ROLE_COLOR: Readonly<Record<string, number>> = {
  visitor: 0x6f7c8d,
  queue: 0x7b6f8d,
  staff: 0xc0392b,
  stephan: 0xe0b050,
  speaker: 0x4aa3a0,
};

const PERSON_H = 1.72;

/* ------------------------------------------------------------------- pools */

/**
 * A reuse pool. Chapter props and NPCs come and go every frame; allocating a mesh
 * per frame would churn the GPU, so objects are built once, hidden when unused and
 * handed back out in the next frame's draw order.
 */
interface Pool<T extends THREE.Object3D> {
  begin(): void;
  get(): T;
  end(): void;
  dispose(): void;
}

function makePool<T extends THREE.Object3D>(parent: THREE.Object3D, make: () => T): Pool<T> {
  const items: T[] = [];
  let n = 0;
  return {
    begin(): void {
      n = 0;
    },
    get(): T {
      let o = items[n];
      if (!o) {
        o = make();
        items.push(o);
        parent.add(o);
      }
      o.visible = true;
      n++;
      return o;
    },
    end(): void {
      for (let i = n; i < items.length; i++) items[i].visible = false;
    },
    dispose(): void {
      for (const o of items) {
        o.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            const mat = mesh.material;
            if (Array.isArray(mat)) for (const mm of mat) mm.dispose();
            else mat.dispose();
          }
        });
        o.removeFromParent();
      }
      items.length = 0;
      n = 0;
    },
  };
}

/* ------------------------------------------------------------------ facade */

export interface DioramaScene {
  /** Draw one frame from the sim's snapshot. Never mutates it. */
  render(snap: GameSnapshot, dt: number): void;
  /** The canvas' new CSS size in pixels. */
  resize(w: number, h: number): void;
  /** `?topdown=1` — the flat plan-view debug camera. */
  setTopDown(on: boolean): void;
  /** `?nofog=1` — drop the fog-of-war mask, leave the rest of the lighting alone. */
  setFogEnabled(on: boolean): void;
  /** `?pose=voxxy|droid|biggy` — one robot alone, front three-quarter. Null returns to play. */
  posePortrait(kind: RobotKind | null): void;
  /**
   * Where a sim point lands on the canvas, in CSS pixels, or null if it is behind
   * the camera or the scene is in a debug mode. The HUD uses it to hang a robot's
   * speech bubble over that robot instead of in a text row at the bottom edge.
   */
  project(simX: number, simY: number, heightM?: number): { x: number; y: number } | null;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement): DioramaScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // three's default, and what `lighting.ts` was calibrated against: its ambient,
  // hemisphere and spotlight intensities are art-direction numbers, and its additive
  // light pools are `toneMapped: false`. Putting a filmic curve under only half of
  // that mismatches the two and crushes the night chapters to black.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(BG_PLAY, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG_PLAY);

  const venue: Venue = buildVenue();
  scene.add(venue.group);

  const lights: LightLayer = createLightLayer(scene);

  /* ------------------------------------------------------------- robots */

  const rigs = new Map<RobotKind, RobotRig>();
  for (const kind of KINDS) {
    const rig = createRobot(kind);
    rigs.set(kind, rig);
    scene.add(rig.root);
  }

  /* ---------------------------------------------------- chapter dressing */

  const dressing = new THREE.Group();
  dressing.name = 'chapter-dressing';
  scene.add(dressing);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const bodyGeo = new THREE.CylinderGeometry(0.5, 0.56, 1, 10);
  const headGeo = new THREE.SphereGeometry(0.5, 10, 8);

  const propPool = makePool<THREE.Mesh>(dressing, () => {
    const mesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.06 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  });

  /** The contact shadow under a visitor — a soft dark disc, not a cast shadow. */
  const contactGeo = new THREE.CircleGeometry(1, 18);
  const contactMat = new THREE.MeshBasicMaterial({
    color: 0x05070c,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });

  const peoplePool = makePool<THREE.Group>(dressing, () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 });
    const body = new THREE.Mesh(bodyGeo, mat);
    body.name = 'body';
    body.castShadow = true;
    const head = new THREE.Mesh(headGeo, mat);
    head.name = 'head';
    head.castShadow = true;
    // A crowd of unshaded pawns standing on a flat floor reads as pawns floating
    // over it; one disc each is what pins them down.
    const contact = new THREE.Mesh(contactGeo, contactMat);
    contact.name = 'contact';
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.02;
    g.add(body, head, contact);
    return g;
  });

  /** The chapter-2 cable, as the sim laid it: a polyline on the floor. */
  const CABLE_MAX_PTS = 512;
  const cableGeo = new THREE.BufferGeometry();
  const cablePos = new THREE.BufferAttribute(new Float32Array(CABLE_MAX_PTS * 3), 3);
  cablePos.setUsage(THREE.DynamicDrawUsage);
  cableGeo.setAttribute('position', cablePos);
  cableGeo.setDrawRange(0, 0);
  const cableMat = new THREE.LineBasicMaterial({ color: 0xffb347, toneMapped: false });
  const cableLine = new THREE.Line(cableGeo, cableMat);
  cableLine.name = 'cable';
  cableLine.frustumCulled = false;
  cableLine.visible = false;
  dressing.add(cableLine);

  /* ------------------------------------------------- the chapter-2 cam-lock wheel
   *
   * The one prop in the game whose *orientation* is live game state, so it cannot be
   * a box out of `PROPS` like everything else. There is exactly one of it, so it is
   * built once rather than pooled, in the pattern the cable already uses.
   *
   * The wheel stands in the world x-y plane on the cabinet's +z face — the face the
   * diorama camera looks at — so it is never seen edge-on, and `rotation.z` reads
   * straight off `Prop.v`, the sim's own angle. Sim angle 0 points along +x, which
   * is screen right, and increases anticlockwise; nothing here converts it, which is
   * what makes the HUD's "wheel 47°" and the picture agree.
   *
   * The BEZEL does not turn: the eight index marks are scribed on the cabinet, and
   * the one the cam has to be stopped on lights up only while Voxxy's cone is on it
   * (`GameSnapshot.props`, kind 'cam-mark', state 'active').
   */
  const WHEEL_SPOKES = 5;
  const WHEEL_MARK_COUNT = 8;
  /** Hub height off the floor, metres — about Biggy's shoulder, which is what hits it. */
  const WHEEL_HUB_Y = 1.15;
  /** Tick radius as a fraction of the rim: the bezel ring sits just outside the wheel. */
  const BEZEL_R = 1.3;

  const wheelSteel = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 0.35, metalness: 0.8 });
  /** Biggy-blue: the handle he catches, and the pointer that has to line up with the mark. */
  const wheelGrip = new THREE.MeshStandardMaterial({ color: 0x5f8fd0, roughness: 0.45, metalness: 0.3 });
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.8, metalness: 0.2 });
  const tickMat = new THREE.MeshStandardMaterial({ color: 0x6c757f, roughness: 0.7, metalness: 0.3 });
  /** The target mark. Voxxy-orange and self-lit the moment her cone finds it. */
  const markMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a1c,
    roughness: 0.6,
    emissive: 0x000000,
    emissiveIntensity: 1,
    toneMapped: false,
  });

  /** The turning part: rim, spokes, hub and the grip-and-pointer that shows the angle. */
  const camWheel = new THREE.Group();
  camWheel.name = 'cam-wheel';
  camWheel.visible = false;
  {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 28), wheelSteel);
    rim.castShadow = true;
    camWheel.add(rim);
    for (let i = 0; i < WHEEL_SPOKES; i++) {
      const a = (i * Math.PI * 2) / WHEEL_SPOKES;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(2, 0.11, 0.1), wheelSteel);
      spoke.rotation.z = a;
      spoke.castShadow = true;
      camWheel.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.34, 12), wheelSteel);
    hub.rotation.x = Math.PI / 2;
    camWheel.add(hub);
    // The handle and its pointer. Without one asymmetric feature a five-spoke wheel
    // looks identical every 72°, and this beat is entirely about reading where it has
    // got to: the pointer sits at the wheel's own angle 0, so "pointer on the lit
    // mark" IS the sim's success condition, drawn.
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 8), wheelGrip);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(1, 0, 0.16);
    camWheel.add(grip);
    const pointer = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.12), wheelGrip);
    pointer.position.set(0.72, 0, 0.2);
    camWheel.add(pointer);
  }
  dressing.add(camWheel);

  /* ------------------------------------------------- the chapter-2 breaker panel
   *
   * Michele: *"The breaker should be graphical of course."* It was a 1.5 m grey box
   * standing on the floor — `PROPS.breaker`, drawn by `drawProp` like a crate — in
   * front of the static enclosure `ground.ts` was drawing at 1.45 m for the same
   * control. Same failure as chapter 1's door override, same cure: the enclosure is
   * venue fabric (`ground.ts`, named `breaker-panel`, at `BREAKER_Y`), and the part
   * that is STATE lives here.
   *
   * Three handles on the enclosure's south face — the face the diorama camera looks
   * at — each of which visibly flips from down to up as Droid throws it, plus the
   * supply lamp that makes the panel findable in the dark before it is understood.
   * `Prop.v` is how many are in; `Prop.state` is 'done' once the last one lands.
   */
  const BREAKER_COUNT = 3;
  /** Handle angles about the panel's horizontal axis: tipped out and down, or up. */
  const BREAKER_OFF = 0.7;
  const BREAKER_ON = -0.2;

  const breakerHandleMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.5, metalness: 0.1 });
  const breakerLampMat = new THREE.MeshStandardMaterial({
    color: 0x2a2018,
    roughness: 0.4,
    emissive: 0xb06a10,
    emissiveIntensity: 1,
    toneMapped: false,
  });
  const breakerPanel = new THREE.Group();
  breakerPanel.name = 'breaker-handles';
  breakerPanel.visible = false;
  /** One pivot per handle, so `rotation.x` is the throw and nothing else moves. */
  const breakerPivots: THREE.Group[] = [];
  {
    for (let i = 0; i < BREAKER_COUNT; i++) {
      const pivot = new THREE.Group();
      // The toggle itself, standing off the face, and the moulded base it sits in.
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.08), breakerHandleMat);
      lever.position.set(0, 0.15, 0.04);
      lever.castShadow = true;
      pivot.add(lever);
      breakerPivots.push(pivot);
      breakerPanel.add(pivot);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.06), bezelMat);
      seat.position.set(0, 0.1, -0.03);
      pivot.userData.seat = seat;
      breakerPanel.add(seat);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), breakerLampMat);
    lamp.name = 'breaker-lamp';
    breakerPanel.add(lamp);
  }
  dressing.add(breakerPanel);

  /** The fixed bezel: a ring, eight ticks, and the target mark among them. */
  const camBezel = new THREE.Group();
  camBezel.name = 'cam-bezel';
  camBezel.visible = false;
  const camMark = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.14), markMat);
  {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(BEZEL_R, 0.07, 6, 30), bezelMat);
    camBezel.add(ring);
    for (let i = 0; i < WHEEL_MARK_COUNT; i++) {
      const a = (i * Math.PI * 2) / WHEEL_MARK_COUNT;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.1), tickMat);
      tick.position.set(Math.cos(a) * BEZEL_R, Math.sin(a) * BEZEL_R, 0);
      tick.rotation.z = a;
      camBezel.add(tick);
    }
    camBezel.add(camMark);
  }
  dressing.add(camBezel);

  /**
   * What "the cabinet opens" looks like: the door leaf swings off its hinge and the
   * switch gear behind it is suddenly the brightest thing in the technical room.
   *
   * The closed carcass is venue geometry and never changes; this group is the only
   * part that is state, so it lives here and is hidden until the sim says 'open'.
   */
  const cabinetOpen = new THREE.Group();
  cabinetOpen.name = 'cabinet-open';
  cabinetOpen.visible = false;
  const cabinetLeaf = new THREE.Group();
  {
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x101820,
        roughness: 0.6,
        emissive: 0x2f9d5f,
        emissiveIntensity: 1.6,
        toneMapped: false,
      }),
    );
    inner.name = 'cabinet-interior';
    cabinetOpen.add(inner);
    // Lighter than the carcass on purpose: a dark leaf swung into a dark room is
    // invisible, and "the cabinet is open" has to read from the diorama, not only
    // from the card.
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x5c6470, roughness: 0.5, metalness: 0.5 });
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.06), leafMat);
    leaf.name = 'cabinet-leaf';
    leaf.castShadow = true;
    cabinetLeaf.add(leaf);
    cabinetOpen.add(cabinetLeaf);
  }
  dressing.add(cabinetOpen);

  /* ------------------------------------------------- the jammed cinema door
   *
   * Chapter 1's door to cinema E, and the only thing in the game a robot destroys.
   * It used to be deleted from the prop list on the frame Biggy hit it, so the
   * player's biggest physical achievement in the chapter was a door that blinked
   * out of existence. The sim now keeps it in the list with a `progress` on it
   * (`Prop.progress`, 0..1, ticked by `JAM_FALL_TIME` in `ch1-night.ts`); all the
   * decisions live there and this only draws what the number says.
   *
   * WHY IT FALLS FLAT rather than sliding aside or rolling up. Cinema E is on the
   * bottom row, so its doorway faces the camera: a leaf that swung on a vertical
   * hinge would be broadside at 0 degrees and an edge-on sliver at 90 — the same
   * trap the cabinet leaf above is stopped at 58 degrees to avoid — and a shutter
   * or a slide keeps the leaf upright, which reads as "opened", not as "hit".
   * Tipped forward about its bottom edge, the leaf sweeps from a full-height
   * rectangle to a foreshortened plate on the floor: the largest change of
   * silhouette this camera can show, it clears the whole opening, and it finishes
   * lying in the cinema where Biggy put it, which is the trophy. Biggy is running
   * toward the camera when he hits it, so it goes down in front of the doorway,
   * skewed and skidded, and rattles once before it settles.
   */
  const jammedLeaf = new THREE.Group();
  jammedLeaf.name = 'jammed-door';
  const jammedSlab = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 }));
  jammedSlab.castShadow = true;
  jammedSlab.receiveShadow = true;
  jammedLeaf.add(jammedSlab);
  dressing.add(jammedLeaf);

  /** Radians the leaf tips through: a touch past flat, so it settles back onto the floor. */
  const JAM_TIP = Math.PI / 2;
  /** How far it skids into the room once it is off its hinges, metres. */
  const JAM_SKID = 0.55;
  /** How far off square it lands — it was hit off-centre, radians. */
  const JAM_SKEW = 0.17;
  /**
   * The broken leaf is LIGHTER than the shut one, and deliberately.
   *
   * Shut, it is a painted face in a dark corridor and dark is right. Down, it is
   * raw splintered timber, and it has to read — the first shot of it lying flat
   * came back as a near-black patch of floor, because chapter 1's floor pools are
   * decals on the floor plane and a slab lying ON that plane is not painted by
   * them. Same lesson as the cabinet leaf above.
   */
  const JAM_BROKEN_COLOR = 0xa8825a;
  /** Last frame's fall progress, so the impact is kicked once and not every frame. */
  let jamLast = 0;

  /**
   * The ground ring under the robot being driven. Nothing else in the frame says
   * which of the three the stick is moving — the HUD chip does, but the player is
   * looking at the diorama, not at the corner of the screen.
   */
  const ringGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 40);

  /*
   * TWO rings, not one, because the marker has to survive being behind something
   * without painting over the thing it marks.
   *
   * It used to be a single ring with `depthTest: false`, drawn over everything, so
   * that a robot standing in front of the one you are driving could not hide it —
   * chapter 1 starts the three of them stacked 26 sim px apart along the camera's
   * depth axis. That worked, and it also drew the ring straight across the driven
   * robot's own legs, which is what Michele hit in play: "the circle around the
   * selected chars shouldn't cover the robot."
   *
   * Now the bright ring is depth-tested like any other floor decal, so the robot's
   * feet occlude it properly, and a dimmer ghost is drawn only where something is
   * IN FRONT of it (`depthFunc: GreaterDepth`) — the same trick as the occluded
   * silhouette below. In the open you see one clean ring on the floor; behind a
   * pillar you still see where you are.
   */
  const activeRing = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: 0xff7a1a,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  activeRing.name = 'active-ring';
  activeRing.rotation.x = -Math.PI / 2;
  activeRing.renderOrder = 999;
  dressing.add(activeRing);

  /** The same ring, seen only through whatever is hiding it. */
  const activeRingGhost = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: 0xff7a1a,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      toneMapped: false,
    }),
  );
  activeRingGhost.name = 'active-ring-ghost';
  activeRingGhost.rotation.x = -Math.PI / 2;
  activeRingGhost.renderOrder = 998;
  dressing.add(activeRingGhost);

  /**
   * THE OCCLUDED SILHOUETTE.
   *
   * A ring drawn over the top of whatever is hiding the robot marks a spot; it
   * does not show a robot. In chapters 2, 3 and 4 the round-2 craft critic could
   * not find the robot they were driving in the opening frame at all — behind a
   * booth pillar, sunk into a crate, a twelve-pixel smudge — and read the ring
   * floating on the pillar as a rendering bug rather than as a marker.
   *
   * So the active robot also gets an x-ray: a capsule roughly its own size, in its
   * own lamp colour, drawn ONLY where something is in front of it
   * (`depthFunc: GreaterDepth`). In the open it is invisible, because the robot
   * itself passes the depth test first; behind a pillar it is a coloured ghost of
   * the right size in the right place.
   */
  /*
   * The ghost is the robot's OWN geometry, not a stand-in.
   *
   * It used to be a capsule and a sphere roughly the right size, which marked a
   * spot without showing a robot — Michele, seeing one behind a wall: "when a
   * robot is behind an object, show the silhuette, not this thing."
   *
   * Each mesh in the rig gets a child that shares its geometry and carries the
   * x-ray material. A child with an identity transform has its parent's world
   * matrix by construction, so the ghost follows every bone the gait moves
   * without a second animation path to keep in step — and it costs no extra
   * geometry, only the draw. Only the robot you are driving builds one.
   */
  const xrayMats = new Map<string, THREE.MeshBasicMaterial>();
  function xrayMaterial(kind: string, c: readonly number[]): THREE.MeshBasicMaterial {
    let mat = xrayMats.get(kind);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.5,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        toneMapped: false,
      });
      xrayMats.set(kind, mat);
    }
    mat.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
    return mat;
  }

  /** Ghost meshes per robot, built the first time that robot is driven. */
  const ghosts = new Map<string, THREE.Mesh[]>();
  function ensureGhost(kind: string, rig: RobotRig, c: readonly number[]): THREE.Mesh[] {
    const made = ghosts.get(kind);
    if (made) return made;
    const mat = xrayMaterial(kind, c);
    const list: THREE.Mesh[] = [];
    const sources: THREE.Mesh[] = [];
    rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.userData[EXCLUDE_FROM_BOUNDS] !== true) sources.push(mesh);
    });
    for (const src of sources) {
      const ghost = new THREE.Mesh(src.geometry, mat);
      ghost.name = `${src.name}-xray`;
      /*
       * Order matters more than it looks, and getting it wrong is what Michele
       * saw: "biggy should not be transparent here, it's fully visible."
       *
       * The ghost draws where the depth buffer already holds something NEARER.
       * With the ghosts drawn last, the robot's own body counted — Biggy's dome
       * is in front of his belly, so the belly's ghost showed straight through
       * him and the whole robot read as glass.
       *
       * So the ghosts go between the venue and the robot: after the room, which
       * is what should hide him, and before his own meshes, which then paint
       * over the ghost wherever he is actually visible.
       */
      ghost.renderOrder = 1;
      ghost.castShadow = false;
      ghost.receiveShadow = false;
      src.renderOrder = 2;
      src.add(ghost);
      list.push(ghost);
    }
    ghosts.set(kind, list);
    return list;
  }

  /**
   * CLUE MARKERS. `GameSnapshot.clues` carries the four light-mix spots; nothing
   * in the world used to mark them, so the only way to know where to go was to
   * read the briefing paragraph. Each is a small floor plate with a slowly
   * breathing glyph pip, in the mix's own colours — it says "something here",
   * which is all a light-mixing puzzle should give away, and it goes green once
   * the clue is found.
   */
  const CLUE_MAX = 8;
  /** Most colours any one clue asks for. */
  const CLUE_ARCS = 3;
  const clueGroup = new THREE.Group();
  clueGroup.name = 'clue-markers';
  dressing.add(clueGroup);

  /**
   * The ring is CUT INTO ARCS, one per colour the clue needs.
   *
   * It used to be a single ring in the average of those colours, which is exactly
   * the wrong thing to show: orange + green averages to a yellow that names no
   * robot, and all three average to white. Michele: "Light points should give
   * hints on the needed light... Gradient is an alternative, or double colored
   * circles." So a two-colour clue is a half-and-half ring in Voxxy's orange and
   * Droid's green, and a three-colour clue is thirds. You can read which robots
   * to bring off the floor, without being told the answer.
   *
   * Geometry per arc count, built once: index n holds n arcs of 2pi/n each, with
   * a small gap so the joins read as deliberate rather than as z-fighting.
   */
  const ARC_GAP = 0.13;
  const clueArcGeo: THREE.RingGeometry[][] = [];
  for (let n = 0; n <= CLUE_ARCS; n++) {
    const set: THREE.RingGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const span = (Math.PI * 2) / n;
      set.push(new THREE.RingGeometry(0.42, 0.62, 28, 1, i * span + ARC_GAP / 2, span - ARC_GAP));
    }
    clueArcGeo.push(set);
  }
  const pipGeo = new THREE.SphereGeometry(0.16, 12, 8);
  const digitGeo = new THREE.PlaneGeometry(0.72, 0.72);

  /**
   * A digit as a canvas texture, cached. Ten of them at most, made on demand.
   *
   * `document` is guarded because this module is imported by headless code paths;
   * without a canvas the marker simply keeps its found-green ring and no numeral,
   * which is what the build did before.
   */
  const digitTex = new Map<number, THREE.CanvasTexture | null>();
  function digitTexture(d: number): THREE.CanvasTexture | null {
    const hit = digitTex.get(d);
    if (hit !== undefined) return hit;
    let tex: THREE.CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 128;
      const g = cv.getContext('2d');
      if (g) {
        g.clearRect(0, 0, 128, 128);
        g.font = 'bold 104px ui-monospace, "SF Mono", Menlo, monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        // A dark rim under the glyph so it holds up over a bright floor pool.
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(8,12,10,0.85)';
        g.strokeText(String(d), 64, 70);
        g.fillStyle = '#eafff0';
        g.fillText(String(d), 64, 70);
        tex = new THREE.CanvasTexture(cv);
        tex.anisotropy = 4;
      }
    }
    digitTex.set(d, tex);
    return tex;
  }

  const clueMarks: Array<{
    root: THREE.Group;
    arcs: THREE.Mesh[];
    pip: THREE.Mesh;
    digit: THREE.Mesh;
  }> = [];
  for (let i = 0; i < CLUE_MAX; i++) {
    const root = new THREE.Group();
    const arcs: THREE.Mesh[] = [];
    for (let a = 0; a < CLUE_ARCS; a++) {
      const arc = new THREE.Mesh(
        clueArcGeo[CLUE_ARCS][a],
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
      );
      arc.rotation.x = -Math.PI / 2;
      arcs.push(arc);
      root.add(arc);
    }
    const pip = new THREE.Mesh(
      pipGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }),
    );
    pip.position.y = 0.5;
    /** The digit, laid flat inside the ring once the clue is lit, and left there. */
    const digit = new THREE.Mesh(
      digitGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    digit.rotation.x = -Math.PI / 2;
    digit.position.y = 0.012;
    digit.visible = false;
    root.add(pip, digit);
    root.visible = false;
    clueGroup.add(root);
    clueMarks.push({ root, arcs, pip, digit });
  }

  /* -------------------------------------------------------- debug staging */

  /** Flat, even light for the plan view and the portrait. Off during play. */
  const debugRig = new THREE.Group();
  debugRig.name = 'debug-lights';
  debugRig.visible = false;
  // The venue's own materials are built for a blacked-out cinema, so a debug rig
  // that merely "adds some light" photographs as mud. These are deliberately hot:
  // the overlay and model-sheet checks are measurements, not mood shots.
  const debugAmbient = new THREE.AmbientLight(0xffffff, 3.2);
  const debugKey = new THREE.DirectionalLight(0xfff4e6, 2.6);
  debugKey.position.set(0.35, 1, 0.45);
  const debugFill = new THREE.DirectionalLight(0xbfd2ff, 1.1);
  debugFill.position.set(-0.7, 0.4, 0.6);
  const debugRim = new THREE.DirectionalLight(0xffffff, 1.4);
  debugRim.position.set(-0.2, 0.5, -1);
  debugRig.add(debugAmbient, debugKey, debugFill, debugRim);
  scene.add(debugRig);

  /** The portrait plinth, built once and hidden until a portrait is asked for. */
  const plinth = new THREE.Group();
  plinth.name = 'plinth';
  plinth.visible = false;
  {
    // Small enough that the robot, not the furniture, is the subject. No backdrop
    // plane: the clear colour is already an even neutral, and a plane big enough
    // to fill a 16:9 frame would only add an edge to misread as geometry.
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.1, 44),
      new THREE.MeshStandardMaterial({ color: 0x9fa6ae, roughness: 0.5, metalness: 0.1 }),
    );
    top.position.y = -0.05;
    top.receiveShadow = true;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.74, 0.42, 44),
      new THREE.MeshStandardMaterial({ color: 0x5b6169, roughness: 0.7, metalness: 0.05 }),
    );
    base.position.y = -0.31;
    base.receiveShadow = true;
    plinth.add(top, base);
  }
  scene.add(plinth);

  /* ------------------------------------------------------------- cameras */

  let viewW = Math.max(1, canvas.clientWidth || 1600);
  let viewH = Math.max(1, canvas.clientHeight || 900);
  renderer.setSize(viewW, viewH, false);

  const diorama: DioramaCamera = createCamera(viewW / viewH);
  const planCam = new THREE.OrthographicCamera(-MAP_W_M / 2, MAP_W_M / 2, MAP_H_M / 2, -MAP_H_M / 2, 0.1, 400);
  planCam.name = 'plan-camera';
  /*
   * A LONG LENS, not a wide one.
   *
   * At 30 degrees the camera stood 2.9 m from Biggy and the projection stretched
   * him: his belly measured 0.82 of his height off the screenshot where the model
   * is 0.93, because the near parts of a 1.4 m-deep robot are a fifth closer to
   * the lens than the far ones. The model-sheet check is a measurement, and the
   * sheet's own panels are near-orthographic, so the portrait uses a 16-degree
   * lens from twice the distance: what the critic measures is then the model's
   * real proportions rather than the lens's opinion of them.
   */
  const portraitCam = new THREE.PerspectiveCamera(16, viewW / viewH, 0.1, 100);
  portraitCam.name = 'portrait-camera';

  /** Look straight down with -z as screen up: sim y = 0 at the top, exactly like the plan. */
  function aimPlanCamera(floor: 'up' | 'down'): void {
    const floorY = floor === 'down' ? -STOREY_H_M : 0;
    planCam.up.set(0, 0, -1);
    planCam.position.set(MAP_W_M / 2, floorY + 120, MAP_H_M / 2);
    planCam.lookAt(MAP_W_M / 2, floorY, MAP_H_M / 2);
    planCam.left = -MAP_W_M / 2;
    planCam.right = MAP_W_M / 2;
    planCam.top = MAP_H_M / 2;
    planCam.bottom = -MAP_H_M / 2;
    planCam.near = 0.1;
    planCam.far = 400;
    planCam.updateProjectionMatrix();
    planCam.updateMatrixWorld();
  }

  /**
   * Front three-quarter, with the camera's own eye at the robot's face height and
   * the whole figure filling the same fraction of the frame for all three.
   *
   * A closed-form fit from the bounding box is not enough: the camera is a
   * PERSPECTIVE one looking slightly down, so how much of the frame a figure
   * actually covers depends on how tall and how deep it is. Tall Droid came out
   * at 84% of the frame height where squat Voxxy came out at 89% — small on
   * paper, but a critic judging the three side by side against the model sheets
   * sees one robot noticeably smaller than the others and reads it as the
   * framing, not the model. So the fit projects the box's eight corners and
   * relaxes the distance until the binding axis lands on the target fill, which
   * is exact for any shape.
   */
  const portraitBox = new THREE.Box3();
  const _corner = new THREE.Vector3();
  /** World-space samples of the rig's surface, flattened — the fit's subject. */
  const portraitPts: number[] = [];
  /** Samples of the parts the silhouette excludes — a whip antenna, a wire. */
  const portraitAerial: number[] = [];

  /**
   * Sample the rig's own surface rather than any bounding box.
   *
   * A box round the whole robot has corners that stick far out past a rounded
   * figure, and fitting to those leaves a fifth of the frame empty; per-mesh
   * boxes are better but still put Droid three points of fill behind the other
   * two. Vertices are what the camera actually sees, so they are what the fit
   * measures.
   */
  function collectPortraitPoints(rig: RobotRig): void {
    portraitPts.length = 0;
    portraitAerial.length = 0;
    rig.root.updateWorldMatrix(true, true);
    const walk = (node: THREE.Object3D, aerial = false): void => {
      const out = aerial || node.userData[EXCLUDE_FROM_BOUNDS] === true;
      if (node instanceof THREE.Mesh && node.visible) {
        const pos = node.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (pos) {
          // Around 150 samples per mesh: enough that a lathe's or an ellipsoid's
          // extreme ring is always hit, cheap enough to run a dozen times.
          const stride = Math.max(1, Math.ceil(pos.count / 150));
          const into = out ? portraitAerial : portraitPts;
          for (let i = 0; i < pos.count; i += stride) {
            _corner.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
            into.push(_corner.x, _corner.y, _corner.z);
          }
        }
      }
      for (const child of node.children) walk(child, out);
    };
    walk(rig.root);
  }
  /** Fraction of the half-frame the figure's binding axis fills. */
  const PORTRAIT_FILL = 0.93;
  /** ...and how close to the edge a whip antenna is allowed to come. */
  const AERIAL_FILL = 0.995;
  /** How far up the figure its face sits — where the camera's eye goes. */
  const PORTRAIT_FACE = 0.84;

  function placePortraitCamera(dist: number, ty: number, faceY: number): void {
    // 34 degrees off the robot's own facing (+Z).
    const az = (34 * Math.PI) / 180;
    // Level with the face: the camera's eye rides at the robot's own face height
    // whatever its size, so none of the three is looked down on more than another.
    const rise = faceY - ty;
    const horiz = Math.sqrt(Math.max(dist * dist - rise * rise, dist * dist * 0.25));
    portraitCam.position.set(Math.sin(az) * horiz, ty + rise, Math.cos(az) * horiz);
    portraitCam.up.set(0, 1, 0);
    portraitCam.lookAt(0, ty, 0);
    portraitCam.updateProjectionMatrix();
    portraitCam.updateMatrixWorld();
  }

  function aimPortraitCamera(rig: RobotRig): void {
    const aspect = viewW / viewH;
    portraitCam.aspect = aspect;
    measureBounds(rig.root, portraitBox);
    const size = portraitBox.getSize(new THREE.Vector3());
    const height = Math.max(size.y, rig.height, 0.2);
    let ty = (portraitBox.min.y + portraitBox.max.y) / 2;
    const faceY = portraitBox.min.y + height * PORTRAIT_FACE;

    collectPortraitPoints(rig);
    const fovY = (portraitCam.fov * Math.PI) / 180;
    let dist = Math.max(height, size.x, size.z) / Math.tan(fovY / 2);
    /*
     * Pull back until the figure fills `PORTRAIT_FILL` of the frame, and slide
     * the look-at point until what is left over is split evenly top and bottom.
     *
     * Both halves matter. Fitting alone leaves the taller robot's feet nearer the
     * edge than its head, because a camera looking slightly down does not project
     * symmetrically about its target; that is how Droid ended up three points of
     * fill behind the other two with the same nominal fit.
     */
    for (let i = 0; i < 24; i++) {
      placePortraitCamera(dist, ty, faceY);
      let lo = Infinity;
      let hi = -Infinity;
      let wide = 0;
      for (let p = 0; p < portraitPts.length; p += 3) {
        _corner.set(portraitPts[p], portraitPts[p + 1], portraitPts[p + 2]).project(portraitCam);
        if (_corner.y < lo) lo = _corner.y;
        if (_corner.y > hi) hi = _corner.y;
        wide = Math.max(wide, Math.abs(_corner.x));
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) break;
      const fill = Math.max((hi - lo) / 2, wide);
      if (fill <= 1e-4) break;
      // The aerial is not part of the silhouette and must not drive the fit, but
      // it must not walk off the top of the frame either.
      let aerial = 0;
      for (let p = 0; p < portraitAerial.length; p += 3) {
        _corner.set(portraitAerial[p], portraitAerial[p + 1], portraitAerial[p + 2]).project(portraitCam);
        aerial = Math.max(aerial, Math.abs(_corner.x), Math.abs(_corner.y));
      }
      // Recentre: half the frame's height in world units at the target's depth.
      // Damped: moving the target also changes the camera's pitch, so a full
      // correction each pass oscillates instead of settling.
      ty += ((hi + lo) / 2) * dist * Math.tan(fovY / 2) * 0.6;
      const k = Math.max(fill / PORTRAIT_FILL, aerial / AERIAL_FILL);
      dist *= k;
      if (Math.abs(k - 1) < 0.002 && Math.abs(hi + lo) < 0.004) break;
    }
    placePortraitCamera(dist, ty, faceY);
  }

  /* -------------------------------------------------------------- framing */

  /** The framed window, in sim pixels. Eased toward the active robot every frame. */
  const focus: ViewRect = { x: 0, y: 0, w: SIM_W, h: SIM_H };
  let focusReady = false;

  const clampTo = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : v < lo ? lo : v > hi ? hi : v);

  /**
   * The rect the camera frames this frame.
   *
   * Cutscenes, the title card and the end card get the chapter's whole rect — they
   * are wide shots and the sim already chose the framing. Play gets a room-sized
   * window centred on the robot being driven and clamped inside that rect, so the
   * camera never shows anything the chapter did not mean to show.
   */
  function updateFocus(snap: GameSnapshot, dt: number): ViewRect {
    const view = snap.view;
    // A cutscene that has a framing of its own; chapters without one keep the wide
    // shot they always had, which is also the untouched path for cards and the end.
    const cut = snap.phase === 'cut' ? CUT_FRAME[snap.chapter] : undefined;
    const want = snap.phase === 'play' ? (FOCUS[snap.chapter] ?? FOCUS_FALLBACK) : (cut ?? WIDE_MAX);
    if (cut === undefined && snap.phase !== 'play') {
      // A wide shot, still centred on the robots rather than on the whole storey.
      focusReady = false;
      if (view.w <= WIDE_MAX.w && view.h <= WIDE_MAX.h) return view;
    }
    const w = Math.min(want.w, view.w);
    const h = Math.min(want.h, view.h);
    const bot = snap.bots[snap.active];
    // In a cutscene all three are the subject, so the camera tracks the middle of
    // the group; in play it is the robot being driven.
    let sx = bot ? bot.x : view.x + view.w / 2;
    let sy = bot ? bot.y : view.y + view.h / 2;
    if (cut !== undefined && snap.bots.length) {
      sx = 0;
      sy = 0;
      for (const b of snap.bots) {
        sx += b.x;
        sy += b.y;
      }
      sx /= snap.bots.length;
      sy /= snap.bots.length;
    }
    const tx = clampTo(sx, view.x + w / 2, view.x + view.w - w / 2);
    const ty = clampTo(sy, view.y + h / 2, view.y + view.h - h / 2);
    if (snap.phase !== 'play') {
      focus.w = w;
      focus.h = h;
      focus.x = tx - w / 2;
      focus.y = ty - h / 2;
      return focus;
    }

    const cx = focus.x + focus.w / 2;
    const cy = focus.y + focus.h / 2;
    const jump = !focusReady || Math.hypot(tx - cx, ty - cy) > FOCUS_CUT_PX || focus.w !== w || focus.h !== h;
    const k = jump ? 1 : 1 - Math.exp(-FOCUS_EASE * dt);
    focusReady = true;
    focus.w = w;
    focus.h = h;
    focus.x = cx + (tx - cx) * k - w / 2;
    focus.y = cy + (ty - cy) * k - h / 2;
    return focus;
  }

  /**
   * The driven robot's own silhouette, wherever geometry is in front of it.
   *
   * Nothing is positioned here: the ghosts are children of the rig's own meshes,
   * so they are already exactly where the robot is, in whatever pose the gait has
   * it in. All this does is decide whose ghosts are switched on.
   */
  function updateXray(snap: GameSnapshot): void {
    const bot = snap.bots[snap.active];
    const live = bot !== undefined && snap.chapter >= 1 && snap.phase === 'play';
    for (const [kind, list] of ghosts) {
      const on = live && bot !== undefined && kind === bot.kind;
      for (const g of list) g.visible = on;
    }
    if (!live || !bot) return;
    const rig = rigs.get(bot.kind);
    if (!rig) return;
    const made = ensureGhost(bot.kind, rig, bot.light.c);
    for (const g of made) g.visible = true;
    xrayMaterial(bot.kind, bot.light.c);
  }

  /** Floor markers on the chapter's clue spots. */
  function updateClues(snap: GameSnapshot, floorY: number): void {
    const list = snap.phase === 'play' ? snap.clues : [];
    for (let i = 0; i < clueMarks.length; i++) {
      const mark = clueMarks[i];
      const clue = list[i];
      if (!clue) {
        mark.root.visible = false;
        continue;
      }
      mark.root.visible = true;
      mark.root.position.set(m(clue.x), floorY + 0.02, m(clue.y));

      const found = clue.found;
      const pulse = 0.55 + 0.45 * Math.sin(snap.t * 2.1 + i * 1.7);
      const n = Math.min(Math.max(clue.need.length, 1), CLUE_ARCS);

      // One arc per colour the clue needs, each in that robot's own lamp colour,
      // so the ring spells out the recipe. Found turns the whole ring green.
      for (let a = 0; a < CLUE_ARCS; a++) {
        const arc = mark.arcs[a];
        if (a >= n) {
          arc.visible = false;
          continue;
        }
        arc.visible = true;
        if (arc.geometry !== clueArcGeo[n][a]) arc.geometry = clueArcGeo[n][a];
        const src = snap.bots.find((x) => x.kind === clue.need[a]);
        /*
         * A found clue KEEPS its colours. It used to go green, which threw away
         * the one worked example the player has — Michele: "Keep the colors on
         * the found codes, it remains as a hint for the next ones." A solved
         * ring still says "this one wanted orange and green", which is how you
         * learn to read the unsolved ones.
         */
        const c = src ? src.light.c : [200, 200, 200];
        const mat = arc.material as THREE.MeshBasicMaterial;
        mat.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
        /*
         * Opaque enough that the COLOUR survives.
         *
         * At a third opacity over a near-black floor, Voxxy's orange composites
         * to brown and Droid's green to teal — the ring was legible as a shape
         * but not as a recipe, which is the one job it has. These arcs are the
         * hint; muting them to taste defeats them.
         */
        mat.opacity = found ? 0.92 : 0.6 + 0.3 * pulse;
      }

      // The pip keeps the averaged colour: it is the "something is here" marker,
      // and it stops breathing once the clue is read.
      let r = 0;
      let g = 0;
      let b = 0;
      for (const kind of clue.need) {
        const src = snap.bots.find((x) => x.kind === kind);
        const c = src ? src.light.c : [200, 200, 200];
        r += c[0];
        g += c[1];
        b += c[2];
      }
      const avg = [r / clue.need.length, g / clue.need.length, b / clue.need.length];
      const pipMat = mark.pip.material as THREE.MeshBasicMaterial;
      pipMat.color.setRGB(avg[0] / 255, avg[1] / 255, avg[2] / 255);
      pipMat.opacity = found ? 0 : 0.4 + 0.35 * pulse;
      mark.pip.visible = !found;
      mark.pip.position.y = 0.5 + 0.09 * pulse;

      // ...and the digit takes its place, and STAYS, as the prototype does. The
      // toast that announced it was the only record, and it scrolled away before
      // Michele noticed it: "I didn't notice the circle nor that the number was
      // found."
      const digitMat = mark.digit.material as THREE.MeshBasicMaterial;
      if (found) {
        const tex = digitTexture(clue.digit);
        if (tex && digitMat.map !== tex) {
          digitMat.map = tex;
          digitMat.needsUpdate = true;
        }
        mark.digit.visible = digitMat.map !== null;
        digitMat.opacity = 0.96;
      } else {
        mark.digit.visible = false;
        digitMat.opacity = 0;
      }
    }
  }

  /** Put the ring under the driven robot, in that robot's own lamp colour. */
  function updateActiveRing(snap: GameSnapshot, floorY: number): void {
    const bot = snap.bots[snap.active];
    if (!bot || snap.chapter < 1 || snap.phase !== 'play') {
      activeRing.visible = false;
      activeRingGhost.visible = false;
      return;
    }
    activeRing.visible = true;
    activeRingGhost.visible = true;
    const r = m(bot.r);
    activeRing.scale.setScalar(Math.max(r / RING_OUTER, 0.6) * 1.25);
    activeRing.position.set(m(bot.x), floorY + 0.03, m(bot.y));
    activeRingGhost.scale.copy(activeRing.scale);
    activeRingGhost.position.copy(activeRing.position);
    const c = bot.light.c;
    (activeRing.material as THREE.MeshBasicMaterial).color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
    (activeRingGhost.material as THREE.MeshBasicMaterial).color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
  }

  /* --------------------------------------------------------------- modes */

  let topDown = false;
  let fogOn = true;
  let portrait: RobotKind | null = null;
  /** Frames left of "re-fit the portrait while the rig settles into its stance". */
  let portraitSettle = 0;
  let lastChapter = -1;

  /** Put the scene graph into whatever the current mode needs. */
  function applyMode(): void {
    const debug = topDown || portrait !== null;
    lights.setEnabled(!debug);
    lights.setFogEnabled(fogOn);
    debugRig.visible = debug;
    plinth.visible = portrait !== null;
    venue.group.visible = portrait === null;
    dressing.visible = portrait === null;
    venue.showOverhead(!topDown);
    renderer.shadowMap.enabled = portrait !== null || !debug;

    const bg = portrait !== null ? BG_PORTRAIT : topDown ? BG_TOPDOWN : BG_PLAY;
    (scene.background as THREE.Color).setHex(bg);
    renderer.setClearColor(bg, 1);

    if (portrait !== null) {
      // One robot, on the plinth, facing the camera. `applyGait` owns the yaw, so
      // the heading is chosen to leave the rig facing its modelled front (+Z).
      for (const [kind, rig] of rigs) {
        rig.root.visible = kind === portrait;
        if (kind === portrait) rig.root.position.set(0, 0, 0);
      }
      const rig = rigs.get(portrait);
      if (rig) {
        aimPortraitCamera(rig);
        portraitSettle = 120;
      }
    }
  }

  /* ------------------------------------------------------------- dressing */

  /** One chapter prop. `x,y` is sim pixels; `tl` kinds report a corner, the rest a centre. */
  function drawProp(p: Prop, floorY: number): void {
    if (p.kind === 'cable') return;
    const spec = PROPS[p.kind] ?? PROP_FALLBACK;
    const wM = p.w !== undefined ? m(p.w) : (spec.fw ?? 0.8);
    const dM = p.h !== undefined ? m(p.h) : (spec.fd ?? 0.8);
    const cx = spec.tl ? m(p.x) + wM / 2 : m(p.x);
    const cz = spec.tl ? m(p.y) + dM / 2 : m(p.y);

    const mesh = propPool.get();
    const height = spec.flat ? Math.max(spec.h, 0.03) : spec.h;
    mesh.scale.set(Math.max(wM, 0.06), height, Math.max(dM, 0.06));
    mesh.position.set(cx, floorY + (spec.lift ?? 0) + height / 2 + (spec.flat ? 0.01 : 0), cz);
    mesh.castShadow = !spec.flat;
    mesh.receiveShadow = true;

    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(spec.color);
    const tint = (p.state ? STATE_EMISSIVE[p.state] : undefined) ?? spec.glow;
    mat.emissive.setHex(tint ?? 0x000000);
    mat.emissiveIntensity = tint === undefined ? 0 : 1;
    mat.transparent = spec.flat === true;
    mat.opacity = spec.flat ? 0.65 : 1;
  }

  /** The cable, as a polyline on the floor. */
  function drawCable(p: Prop, floorY: number): void {
    const pts = p.pts;
    if (!pts || pts.length < 2) {
      cableLine.visible = false;
      return;
    }
    const arr = cablePos.array as Float32Array;
    const n = Math.min(pts.length, CABLE_MAX_PTS);
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      arr[o] = m(pts[i].x);
      arr[o + 1] = floorY + 0.08;
      arr[o + 2] = m(pts[i].y);
    }
    cablePos.needsUpdate = true;
    cableGeo.setDrawRange(0, n);
    cableLine.visible = true;
    // 'taut' is the sim holding Voxxy on the end of the reel (`stepCable`). The
    // robot stopping is the loud half of that; this is the quiet half, so a player
    // who is leaning into it can see WHAT is holding them.
    cableMat.color.setHex(p.state === 'taut' ? 0xff4d3a : 0xffb347);
  }

  /**
   * The breaker panel's three handles, on the face of the enclosure the venue drew.
   *
   * `p` is the panel rect (`GF.panel`, top-left), so the face is its south edge and
   * the handles are spread across its width at the height `ground.ts` hung it at.
   * `p.v` breakers are up; the rest are down.
   */
  function drawBreaker(p: Prop, floorY: number): void {
    const wM = m(p.w ?? 26);
    const dM = m(p.h ?? 16);
    const thrown = p.v ?? 0;
    breakerPanel.visible = true;
    breakerPanel.position.set(m(p.x), floorY + BREAKER_Y, m(p.y) + dM);
    for (let i = 0; i < BREAKER_COUNT; i++) {
      const x = (wM * (i + 0.5)) / BREAKER_COUNT;
      const y = BREAKER_H * 0.42;
      const pivot = breakerPivots[i];
      pivot.position.set(x, y, 0.02);
      pivot.rotation.x = i < thrown ? BREAKER_ON : BREAKER_OFF;
      const seat = pivot.userData.seat as THREE.Mesh;
      seat.position.set(x, y + 0.1, -0.01);
    }
    // The supply lamp: amber on standby, green once the hall has power.
    const lamp = breakerPanel.children[breakerPanel.children.length - 1];
    lamp.position.set(wM - 0.12, BREAKER_H - 0.12, 0.03);
    const on = p.state === 'done';
    breakerLampMat.emissive.setHex(on ? 0x2fd17a : 0xb06a10);
    breakerHandleMat.color.setHex(on ? 0xdfe6df : 0xd8d4cc);
  }

  /** The cam-lock wheel: one live angle out of the sim, straight onto `rotation.z`. */
  function drawCamWheel(p: Prop, floorY: number): void {
    const rM = m((p.w ?? 16) / 2);
    camWheel.visible = true;
    camWheel.scale.setScalar(rM);
    camWheel.position.set(m(p.x), floorY + WHEEL_HUB_Y, m(p.y));
    camWheel.rotation.z = p.v ?? 0;
    wheelSteel.color.setHex(p.state === 'done' ? 0x7fd9a6 : 0x9aa4b0);
    wheelSteel.emissive.setHex(p.state === 'done' ? 0x1f5c38 : p.state === 'active' ? 0x243c55 : 0x000000);
  }

  /** The bezel it has to be stopped against, and the one mark that matters. */
  function drawCamMark(p: Prop, floorY: number): void {
    const rM = m((p.w ?? 16) / 2);
    camBezel.visible = true;
    camBezel.scale.setScalar(rM);
    camBezel.position.set(m(p.x), floorY + WHEEL_HUB_Y, m(p.y) + 0.02);
    const a = p.v ?? 0;
    camMark.position.set(Math.cos(a) * BEZEL_R, Math.sin(a) * BEZEL_R, 0.05);
    camMark.rotation.z = a;
    // Unlit it is a scratch in dark paint; under Voxxy's 0.38 rad cone it is the
    // only orange thing in the room. Nothing else in the frame tells the player
    // where to stop the wheel, which is the point of giving her the narrow beam.
    const lit = p.state === 'active' || p.state === 'done';
    markMat.color.setHex(lit ? 0xff9a3c : 0x3a2a1c);
    markMat.emissive.setHex(lit ? (p.state === 'done' ? 0x2f7d4f : 0xff7a1a) : 0x000000);
  }

  /**
   * The jammed door, shut or coming down. `p.progress` is the sim's clock, 0..1.
   *
   * The easing is front-loaded — most of the swing is spent in the first third of
   * the time — because that is what being hit by 400 kg looks like; the tail of the
   * curve is the leaf bouncing on the floor and going still.
   */
  function drawJammed(p: Prop, floorY: number): void {
    const spec = PROPS.jammed ?? PROP_FALLBACK;
    const wM = m(p.w ?? 24);
    const dM = m(p.h ?? 12);
    const u = Math.min(1, Math.max(0, p.progress ?? 0));
    const broken = p.state === 'broken';

    jammedLeaf.visible = true;
    jammedSlab.scale.set(Math.max(wM, 0.06), spec.h, Math.max(dM, 0.06));

    // Fast out, then a decaying rattle that dies to nothing by u = 1.
    const swing = broken ? 1 - Math.pow(1 - u, 2) : 0;
    const rattle = broken ? Math.exp(-6 * u) * Math.sin(u * 15) * 0.13 : 0;
    const tip = Math.min(JAM_TIP, Math.max(0, JAM_TIP * swing + rattle));

    // Pivot on the bottom edge nearest the camera: sim +y is world +z and the
    // camera is on the +z side, so the leaf goes down between the doorway and the
    // lens and stays in shot.
    jammedLeaf.position.set(m(p.x) + wM / 2, floorY, m(p.y) + dM + JAM_SKID * swing);
    jammedLeaf.rotation.set(tip, -JAM_SKEW * swing, 0);
    jammedSlab.position.set(0, spec.h / 2, -dM / 2);

    const mat = jammedSlab.material as THREE.MeshStandardMaterial;
    mat.color.setHex(broken ? JAM_BROKEN_COLOR : spec.color);
    // A flash of hot splintered wood on the impact, gone as it settles.
    const heat = broken ? Math.max(0, 1 - u * 2.6) : 0;
    mat.emissive.setRGB(heat * 0.16, heat * 0.06, heat * 0.015);
    mat.emissiveIntensity = heat > 0 ? 1 : 0;
    mat.transparent = false;
    mat.opacity = 1;

    // The hit itself: the camera takes it on the frame the sim starts the clock,
    // once. `camera.shake` has been sitting here unused since it was written.
    if (broken && u > 0 && jamLast <= 0) diorama.shake(0.9);
    jamLast = broken ? u : 0;
  }

  /** The swung door leaf and the lit interior, once the cam has let go. */
  function drawCabinet(p: Prop, floorY: number): void {
    if (p.state !== 'open') {
      cabinetOpen.visible = false;
      return;
    }
    const wM = m(p.w ?? 64);
    const dM = m(p.h ?? 20);
    const leafW = wM - 0.8;
    const leafH = 1.75;
    const faceZ = m(p.y) + dM;
    cabinetOpen.visible = true;
    const inner = cabinetOpen.children[0] as THREE.Mesh;
    inner.scale.set(leafW, leafH, 1);
    inner.position.set(m(p.x) + wM / 2, floorY + 0.15 + leafH / 2, faceZ - 0.06);
    // Hinged on the left stile and swung 58° into the room. Not 90: a door left
    // square to the wall is edge-on to a camera that looks at that wall, and reads
    // as a sliver rather than as an open door.
    cabinetLeaf.position.set(m(p.x) + 0.4, floorY + 0.15 + leafH / 2, faceZ);
    cabinetLeaf.rotation.y = -(58 * Math.PI) / 180;
    const leaf = cabinetLeaf.children[0] as THREE.Mesh;
    leaf.scale.set(leafW, leafH, 1);
    leaf.position.set(leafW / 2, 0, 0);
  }

  function drawPerson(p: Person, floorY: number): void {
    const g = peoplePool.get();
    const rM = Math.max(m(p.r), 0.16);
    // A line of identical pawns reads as a stack of cylinders, so each one gets a
    // deterministic 8% height wobble off its own position — the same person is
    // the same height every frame, and a queue reads as people.
    const jitter = 0.92 + 0.16 * (((Math.abs(Math.round(p.x * 7 + p.y * 13)) % 97) / 97) || 0);
    const bodyH = PERSON_H * jitter - rM * 1.1;
    const body = g.children[0] as THREE.Mesh;
    const head = g.children[1] as THREE.Mesh;
    const contact = g.children[2] as THREE.Mesh;
    body.scale.set(rM * 2, bodyH, rM * 2);
    body.position.set(0, bodyH / 2, 0);
    head.scale.setScalar(rM * 1.5);
    head.position.set(0, bodyH + rM * 0.6, 0);
    contact.scale.setScalar(rM * 1.7);
    g.position.set(m(p.x), floorY, m(p.y));

    const mat = body.material as THREE.MeshStandardMaterial;
    const hex = p.colour ? new THREE.Color(p.colour).getHex() : (ROLE_COLOR[p.role] ?? ROLE_COLOR.visitor);
    mat.color.setHex(hex);
  }

  function drawDressing(snap: GameSnapshot, floorY: number): void {
    propPool.begin();
    peoplePool.begin();
    cableLine.visible = false;
    camWheel.visible = false;
    camBezel.visible = false;
    breakerPanel.visible = false;
    cabinetOpen.visible = false;
    jammedLeaf.visible = false;
    for (const p of snap.props) {
      if (p.kind === 'cable') drawCable(p, floorY);
      else if (p.kind === 'jammed') drawJammed(p, floorY);
      else if (p.kind === 'breaker') drawBreaker(p, floorY);
      else if (p.kind === 'cam-wheel') drawCamWheel(p, floorY);
      else if (p.kind === 'cam-mark') drawCamMark(p, floorY);
      else if (p.kind === 'cabinet') drawCabinet(p, floorY);
      else drawProp(p, floorY);
    }
    for (const person of snap.people) drawPerson(person, floorY);
    propPool.end();
    peoplePool.end();
  }

  /* ---------------------------------------------------------------- robots */

  /**
   * How far to raise Droid so he sits on Biggy's dome rather than hovering over it.
   *
   * Biggy's crown, less the height of Droid's own pelvis above his soles, less a
   * couple of centimetres so he settles into the helmet instead of balancing on
   * it. Measured once from the rigs at rest and cached — both robots are built
   * procedurally, so a reshape of either changes this automatically.
   */
  let mountLiftM: number | null = null;
  function mountLift(): number {
    if (mountLiftM !== null) return mountLiftM;
    const droid = rigs.get('droid');
    if (!droid) return ROBOT_HEIGHT_M.biggy;
    droid.root.updateMatrixWorld(true);
    const pelvisY = new THREE.Vector3().setFromMatrixPosition(droid.bones.pelvis.matrixWorld).y;
    mountLiftM = ROBOT_HEIGHT_M.biggy - pelvisY - 0.02;
    return mountLiftM;
  }

  function placeRobots(snap: GameSnapshot, dt: number, floorY: number): void {
    const show = snap.chapter >= 1;
    for (const b of snap.bots) {
      const rig = rigs.get(b.kind);
      if (!rig) continue;
      rig.root.visible = show;
      if (!show) continue;
      // Droid rides on Biggy: the sim keeps both at the same footprint, so the
      // renderer is the only place that knows how far up "on his shoulders" is.
      //
      // This used to lift him by Biggy's full height, which is right only if his
      // SOLES are what touch down. They are not: the mounted pose in `gait.ts`
      // tucks his knees up, so his feet end up well above his own root and he
      // floated a clear metre over the dome — "droid on biggy is floating.
      // Sitting on the helmet should be it?"
      //
      // He sits instead. `mountLift` puts his PELVIS just into the crown, so the
      // dome takes his weight where a rider's weight actually goes, and the
      // measurement comes off the rig rather than being a magic number that goes
      // stale the next time either robot is reshaped.
      /*
       * NOT HANDLED HERE, and it shows in chapter 3's transition: the height of
       * the ground floor's own walking surface. `groundRiseM` in
       * `src/sim/geometry.ts` gives the 0.5 m lobby plate at a sim x and says in
       * its own doc comment that the renderer is what reads it — nothing does, so
       * a robot standing on the raised lobby stands half a metre inside it, and a
       * robot on the main flight (whose treads climb to 5 m) is swallowed whole.
       * The fix is a rise term added to `floorY` per robot; it needs the flight's
       * own ramp, which lives in `src/render/venue/ground.ts`, so it is a piece of
       * work of its own rather than a line here.
       */
      const lift = b.kind === 'droid' && b.mounted ? mountLift() : 0;
      rig.root.position.set(m(b.x), floorY + lift, m(b.y));
      updateRobot(rig, {
        speedMps: Math.hypot(b.vx, b.vy) / PX_PER_M,
        heading: b.face,
        dt,
        mounted: b.mounted,
      });
    }
  }

  /* ----------------------------------------------------------------- frame */

  function renderPortrait(dt: number): void {
    const rig = portrait ? rigs.get(portrait) : null;
    if (!rig) return;
    // Idle, facing +Z: `yawFromSimHeading(PI/2)` is a yaw of 0.
    updateRobot(rig, { speedMps: 0, heading: Math.PI / 2, dt });
    /*
     * Re-fit while the rig settles, then stop.
     *
     * The fit runs on the pose the builder left, but the first thing the gait
     * does is drop the pelvis into its standing crouch — Droid's is 0.1 m of a
     * 2.1 m robot, which is 5% of the frame, and that alone is what made him look
     * smaller than the other two side by side. Re-fitting for the first couple of
     * seconds catches the settle; freezing afterwards keeps the idle breathing
     * from panning the camera.
     */
    if (portraitSettle > 0) {
      portraitSettle--;
      aimPortraitCamera(rig);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, viewW, viewH);
    renderer.render(scene, portraitCam);
  }

  function renderTopDown(snap: GameSnapshot, dt: number): void {
    const floorY = snap.floor === 'down' ? -STOREY_H_M : 0;
    venue.floor1.visible = snap.floor === 'up';
    venue.ground.visible = snap.floor === 'down';
    placeRobots(snap, dt, floorY);
    drawDressing(snap, floorY);
    activeRing.visible = false;
    for (const list of ghosts.values()) for (const g of list) g.visible = false;
    for (const mark of clueMarks) mark.root.visible = false;
    aimPlanCamera(snap.floor);

    // Letterbox to the sim rect's own aspect, so a pixel in the shot maps to a
    // fixed number of sim pixels and the plan overlay lines up without scaling.
    const dpr = renderer.getPixelRatio();
    const fullW = Math.round(viewW * dpr);
    const fullH = Math.round(viewH * dpr);
    const want = MAP_W_M / MAP_H_M;
    let vw = fullW;
    let vh = Math.round(fullW / want);
    if (vh > fullH) {
      vh = fullH;
      vw = Math.round(fullH * want);
    }
    // Anchored to the TOP-LEFT of the canvas rather than centred. A headless
    // screenshot is taken at the window size while the page is laid out in a
    // slightly shorter viewport, so a vertically centred band lands at an offset
    // nobody can predict from the image alone. Top-left anchoring makes the
    // mapping exact and stated: image pixel (px, py) is sim (px * 1900/vw,
    // py * 700/vh), with no offset to guess.
    const vx = 0;
    const vy = fullH - vh;

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, fullW, fullH);
    renderer.setScissor(0, 0, fullW, fullH);
    renderer.clear();
    renderer.setScissorTest(true);
    renderer.setViewport(vx, vy, vw, vh);
    renderer.setScissor(vx, vy, vw, vh);
    renderer.render(scene, planCam);
    renderer.setScissorTest(false);
  }

  function render(snap: GameSnapshot, dt: number): void {
    if (portrait !== null) {
      renderPortrait(dt);
      return;
    }
    if (topDown) {
      renderTopDown(snap, dt);
      return;
    }

    const floorY = snap.floor === 'down' ? -STOREY_H_M : 0;
    lastFloorY = floorY;
    venue.floor1.visible = snap.floor === 'up';
    venue.ground.visible = snap.floor === 'down';

    if (snap.chapter !== lastChapter) {
      lastChapter = snap.chapter;
      diorama.setChapter(snap.chapter);
    }

    placeRobots(snap, dt, floorY);
    drawDressing(snap, floorY);
    updateActiveRing(snap, floorY);
    updateXray(snap);
    updateClues(snap, floorY);
    lights.update(snap, dt);

    diorama.frame(updateFocus(snap, dt), viewW / viewH, snap.floor);
    diorama.update(dt);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, viewW, viewH);
    renderer.render(scene, diorama.cam);
  }

  /* --------------------------------------------------------------- facade */

  applyMode();
  aimPlanCamera('up');

  const projV = new THREE.Vector3();
  let lastFloorY = 0;

  return {
    render,
    project(simX: number, simY: number, heightM = 0): { x: number; y: number } | null {
      if (portrait !== null || topDown) return null;
      projV.set(m(simX), lastFloorY + heightM, m(simY));
      projV.project(diorama.cam);
      if (!Number.isFinite(projV.x) || !Number.isFinite(projV.y) || projV.z > 1) return null;
      return { x: (projV.x * 0.5 + 0.5) * viewW, y: (1 - (projV.y * 0.5 + 0.5)) * viewH };
    },
    resize(w: number, h: number): void {
      viewW = Math.max(1, Math.floor(w));
      viewH = Math.max(1, Math.floor(h));
      renderer.setSize(viewW, viewH, false);
      diorama.frame({ x: 0, y: 0, w: SIM_W, h: SIM_H }, viewW / viewH);
      if (portrait !== null) {
        const rig = rigs.get(portrait);
        if (rig) aimPortraitCamera(rig);
      }
    },
    setTopDown(on: boolean): void {
      if (topDown === on) return;
      topDown = on;
      applyMode();
    },
    setFogEnabled(on: boolean): void {
      fogOn = on;
      lights.setFogEnabled(on);
    },
    posePortrait(kind: RobotKind | null): void {
      if (portrait === kind) return;
      portrait = kind;
      if (kind === null) for (const rig of rigs.values()) rig.root.visible = true;
      applyMode();
    },
    dispose(): void {
      // The ghosts share their source meshes' geometry, so only the materials
      // are ours to free; `disposeTree` on each rig takes the geometry.
      for (const mat of xrayMats.values()) mat.dispose();
      for (const set of clueArcGeo) for (const geo of set) geo.dispose();
      pipGeo.dispose();
      digitGeo.dispose();
      for (const tex of digitTex.values()) tex?.dispose();
      for (const mark of clueMarks) {
        for (const arc of mark.arcs) (arc.material as THREE.Material).dispose();
        (mark.pip.material as THREE.Material).dispose();
        (mark.digit.material as THREE.Material).dispose();
      }
      propPool.dispose();
      peoplePool.dispose();
      (jammedSlab.material as THREE.Material).dispose();
      cableGeo.dispose();
      cableMat.dispose();
      contactGeo.dispose();
      contactMat.dispose();
      boxGeo.dispose();
      bodyGeo.dispose();
      headGeo.dispose();
      plinth.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) for (const mm of mat) mm.dispose();
          else mat.dispose();
        }
      });
      for (const rig of rigs.values()) {
        rig.root.removeFromParent();
        rig.dispose();
      }
      rigs.clear();
      lights.dispose();
      venue.dispose();
      scene.clear();
      renderer.dispose();
    },
  };
}
