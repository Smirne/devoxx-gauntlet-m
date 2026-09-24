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

import { flairPhase, hopPhase } from '../sim/bot';
import { JUMP_RISE_M, MOUNT_OFFSET_Y, W as SIM_W, H as SIM_H } from '../sim/constants';
import { riseAt, riseForBody } from '../sim/surface';
import { JAM_LEAF_H, JAM_SKEW, JAM_SKID, JAM_TIP } from '../sim/chapters/ch1-night';
import type { GameSnapshot, Person, Plate, Prop, RobotKind, ViewRect } from '../sim/types';
import { PX_PER_M, ROBOT_HEIGHT_M, STOREY_H_M, m } from '../sim/units';

import { createCamera, type DioramaCamera } from './camera';
import { FIRE_LEAF_H, FIRE_LEAF_T, fireDoorDraw } from './fire-door';
import { buildKeypad, type KeypadModel } from './keypad';
import { createLightLayer, type LightLayer } from './lighting';
import { PANEL_H_M, PANEL_LIFT_M, buildReleasePanel, type ReleasePanelModel } from './release-panel';
import { createRobot, measureBounds, updateRobot, yawFromSimHeading, EXCLUDE_FROM_BOUNDS, type RobotRig } from './robots';
import { ROLLER_SLATS, rollerDoorDraw } from './roller-door';
import { SEAT_KINDS, SEAT_TOP_M, createSeatField } from './seats';
import {
  CABINET_LEAF_H,
  CABINET_LEAF_LIFT,
  CABINET_LEAF_T,
  CABINET_LEAVES,
  GATE_H,
  GATE_LEAF_T,
  GATE_POST_R,
  LOCK_LEAF_T,
  cabinetDoorDraw,
  gateDraw,
  lockDoorDraw,
} from './doors';
import { BREAKER_H, BREAKER_Y, WALL_H, buildVenue, type Venue } from './venue';

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
 * **Chapter 3 used to be deliberately absent** and stayed on `WIDE_MAX`, because
 * its transition walks the three of them UP the main staircase and the renderer had
 * no elevation for a robot on a flight: `placeRobots` put every robot at the
 * storey's datum, `groundRiseM` was exported for exactly this and read by nothing,
 * so they walked at hall height while the treads climbed to 5 m over them. Zooming
 * in on that would only have framed it better.
 *
 * The sim publishes the flight as a walking surface now (`groundPlates` and
 * `src/sim/surface.ts`) and `surfaceY` reads it, so they climb it. It gets the same
 * close framing as chapter 1's, and for the same reason: a transition is a beat, not
 * an establishing shot.
 */
const CUT_FRAME: Readonly<Record<number, { w: number; h: number }>> = Object.freeze({
  1: { w: 430, h: 315 },
  3: { w: 430, h: 315 },
});
/**
 * The world Y of the walking surface at a sim point.
 *
 * ## What this used to be, and the bug it left open
 *
 * The ground floor is not flat. Kinepolis' lobby stands half a metre above the
 * exhibition hall, six long steps join the two, and the main flight climbs five
 * metres out of the lobby to the Devoxx rooms. `src/render/venue` has built all
 * three correctly from the start and nothing MOVING ever stood on any of them:
 * this function used to read `groundRiseM(x)`, which models the lobby threshold
 * alone, and it did so from a table in drawing code.
 *
 * Then Michele, with a screenshot of Biggy standing inside the fallen leaf of the
 * door he had just smashed: *"we are still walking through the crashed door. The
 * shape is fine, as long as robot walk on it, not through."* That is the same
 * question — how high is the floor here — asked of a piece of scenery, and
 * answering it here would have put a third copy of the lift in `src/render`.
 *
 * So the sim answers it. `GameSnapshot.plates` carries every raised surface the
 * floor and the chapter have, `riseAt` reads them, and this is the one line of
 * drawing code that asks. See `src/sim/surface.ts`.
 *
 * ## Why the plates are frame-scoped rather than a parameter
 *
 * `floorY` is already threaded through fifteen drawing functions and was itself
 * only tolerable because it is computed in exactly two places. A second parameter
 * beside it would double that for no new information: the plates are a property of
 * the FRAME, like the frame's own snapshot, and they are set once at the top of
 * `draw` and read nowhere else. `framePlates` is emptied on dispose so a stale
 * chapter cannot outlive the frame that published it.
 */
let framePlates: readonly Plate[] = [];
function surfaceY(floorY: number, x: number, y: number): number {
  return floorY + riseAt(x, y, framePlates);
}

/**
 * The same, for something that has a WIDTH — a robot rather than a decal.
 *
 * A point crosses a step's edge in one frame; a body climbs it across its own
 * radius. `riseForBody` is the sim's answer to that (`src/sim/surface.ts`), and
 * it exists because Michele watched Biggy meet the fallen door leaf: *"walking on
 * the door is fine, but starts a little too late IMHO. At first it looks like you
 * are walking through it."*
 */
function bodySurfaceY(floorY: number, x: number, y: number, r: number): number {
  return floorY + riseForBody(x, y, r, framePlates);
}

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
   *
   * And then: *"the part that needs a shape is the green Cube that opens the
   * door"*. A lit box is still a box, and this one was 1.92 m DEEP, so the face
   * the camera saw most of was its lid. `drawReleasePanel` poses the modelled
   * unit from `src/render/release-panel.ts`; what survives here is the colour a
   * robot's lamp finds it with, the standby glow, and the two numbers the
   * collider sweep asks for — read off the model rather than retyped, the way
   * `keypad` reads `KEYPAD_TOP_M`.
   */
  'projector-panel': { h: PANEL_H_M, color: 0x39414f, tl: true, lift: PANEL_LIFT_M, glow: 0x6b4406 },
  screen: { h: 5.2, color: 0xcfd6dd, tl: true },
  alcove: { h: 0.05, color: 0x2f7d4f, tl: true, flat: true },
  lock: { h: 2.1, color: 0x4a4038, tl: true },
  jammed: { h: JAM_LEAF_H, color: 0x6b4630, tl: true },
  /* chapter 2 — the exhibition hall */
  // `breaker` is NOT in this table: its three handles carry a live sim value, so it
  // is drawn by `drawBreaker` the way the router terminal is drawn by `drawTerminal`.
  // The rack's CARCASS is venue geometry (`ground.ts`), like the breaker enclosure:
  // this is the live band across its face, so the chapter's idle/active/done state
  // reads from across the room. Drawn as a solid box it was a second, duplicate
  // cabinet standing in the same place — the mistake the breaker panel was making.
  rack: { h: 0.3, color: 0x2b3a44, tl: true, lift: 1.55, glow: 0x1f5c38 },
  /*
   * The router terminal inside the cabinet, and the sponsor banner out in the hall
   * that carries the password in its small print.
   *
   * Both carry a `glow`, for the reason `projector-panel` above carries one: the
   * thing a player is looking FOR is by definition still idle, and Michele has
   * filed "there should be something visible" against this exact failure twice.
   * `drawTerminal` takes the screen further — a waiting terminal blinks.
   */
  terminal: { h: 0.34, color: 0x101820, tl: true, lift: 1.25, glow: 0x6b4406 },
  poster: { h: 0.62, color: 0xe9e4d6, tl: true, lift: 0.95, glow: 0x2a3a52 },
  printer: { h: 0.95, color: 0xb9bec6, tl: true },
  /*
   * The store's shutter is NOT drawn from this entry any more — `drawRollerDoor`
   * poses it from `src/render/roller-door.ts`, which reads the chapter's own wall
   * list. Drawn from here it was a 2.6 m box at the prop's rect whatever the state
   * said, so a shutter Biggy had just gone through was still a slab across its own
   * opening: Michele, with a screenshot of it through Biggy's chest, *"still a
   * walkthrough object on the doorway"*. What survives is the colour, which
   * `rollerMat` takes, and the kind staying classified in `tests/prop-geometry.ts`.
   */
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
  /*
   * THE FINALLY BLOCK — chapter 3's beer bar (`src/sim/chapters/ch3-breakfast.ts`).
   *
   * Michele: *"ok but remember biggy can't reach the soup without voxxy's help. So
   * it should be a different path, with clear hints. (glowing halo, taps ready,
   * belgian beer glassess)."* The counter is also a `low` wall in the sim, so it
   * stops a robot and passes light; these four boxes are only its face and what
   * stands on it, and `lift` is what puts the taps and the glassware at counter
   * height instead of on the floor. Each glass carries `v = 0..3` for its shape —
   * the sim names the beer, not the silhouette.
   */
  'bar-counter': { h: 1.05, color: 0x6b4a2f },
  'beer-tap': { h: 0.34, color: 0xc9a227, lift: 1.05, glow: 0x4a3405 },
  'beer-glass': { h: 0.16, color: 0xf2e2b0, lift: 1.05, glow: 0x3a3320 },
  ladle: { h: 0.9, color: 0x9aa3ad, tl: true },
  dropzone: { h: 0.04, color: 0x2f7d4f, tl: true, flat: true },
  pot: { h: 0.45, color: 0x8e5a3a },
  soup: { h: 0.12, color: 0xd9452f },
  /*
   * HUNG, not planted. `tests/colliders.test.ts` caught this the night it learned
   * to sweep what chapters draw: a `sign` is a 4.8 m blue panel 2.2 m tall, it was
   * standing on the floor, and it had no collider — so five of them stood across
   * cinema doorways in chapter 1 and four more across the hall in chapters 2 and 3,
   * and a robot walked through every one.
   *
   * Giving them colliders would have been the wrong fix, because the real Kinepolis
   * sign is not on the floor. `media/other-images/image-1790032663823.webp` is the
   * corridor: the blue `uitgang zaal 6/7` panel is SUSPENDED, over the walking line,
   * with people underneath it. Every sign this game emits is the same thing — a
   * queue label, `SHIRTS & GADGETS`, `TECHNISCHE RUIMTE`, `taps ready · doors 18:00`
   * — so they all hang. 2.2 m clears Biggy and Droid-on-Biggy; the top sits at 4.4 m
   * under a 5.5 m storey.
   */
  sign: { h: 2.2, color: 0x1f4f8f, fw: 4.8, fd: 0.14, lift: 2.2 },
  /* chapter 4 — the keynote */
  cake: { h: 0.55, color: 0xe6d7b8 },
  'cake-mark': { h: 0.04, color: 0x2f7d4f, tl: true, flat: true },
  stage: { h: 0.45, color: 0x2a2430, tl: true },
  crowd: { h: 0.05, color: 0x3a3550, flat: true, fw: 2, fd: 2 },
  'banner-hook': { h: 0.25, color: 0xb0b6bd },
  banner: { h: 1.1, color: 0xff7a1a, tl: true },
  spotlight: { h: 0.35, color: 0xffd9a0 },
  /*
   * SEATING IS NOT DRAWN FROM THIS TABLE.
   *
   * Both entries used to be `{ h: 0.55, color: 0x3c2f3a, tl: true }` and `drawProp`
   * drew them literally: one flat-topped cuboid per published rect, so cinema E's
   * six rows were six anthracite slabs and the room next door — dressed by
   * `floor1.ts` out of the same sim plan — had modelled seats in it. Michele, with
   * the shot of Droid up on Biggy under his own green pool: *"This still needs a
   * shape."*
   *
   * `src/render/seats.ts` draws them now, from `seatGeometry` and the sim's own
   * `SEAT_PITCH_PX`/`ROW_PITCH_PX`, as one `InstancedMesh` for the whole frame.
   * The entries stay because every drawn kind must be classified — the footprint
   * is still the sim's own rect, and the height is read off the seat model rather
   * than retyped, so `tests/prop-geometry.ts` cannot drift from it.
   */
  seatrow: { h: SEAT_TOP_M, color: 0x3c2f3a, tl: true },
  seatblock: { h: SEAT_TOP_M, color: 0x3c2f3a, tl: true },
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

  /**
   * Every seat a chapter publishes, in one instanced draw. See `src/render/seats.ts`
   * for why the seat rows are not in `propPool` with everything else.
   */
  const seatField = createSeatField(dressing);

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

  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.8, metalness: 0.2 });

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
  const cabinetLeaves: THREE.Group[] = [];
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
    for (let i = 0; i < CABINET_LEAVES; i++) {
      const pivot = new THREE.Group();
      const leaf = new THREE.Mesh(boxGeo, leafMat);
      leaf.name = `cabinet-leaf-${i}`;
      leaf.castShadow = true;
      pivot.add(leaf);
      cabinetLeaves.push(pivot);
      cabinetOpen.add(pivot);
    }
  }
  dressing.add(cabinetOpen);

  /* ---------------------------------------------- the cinema doors, chapter 1
   *
   * Every auditorium door in the closed section: A, C and D are scenery with a
   * `shut` wall behind the joke taped to them, and B is the one the projector-panel
   * release opens. They used to be drawn from the `PROPS` table as a flat 2.1 m
   * box at the prop's own rect — which was true of a shut door and said nothing
   * about an opening one, so B's leaf did not swing, it stopped being published.
   *
   * A pooled hinge group each: the leaf is a child offset half its own length
   * along +x, so the group's own yaw IS the swing and `lockDoorDraw` owns the
   * angle. One pool, because the number of doors on screen is a chapter's business.
   */
  const lockPool = makePool<THREE.Group>(dressing, () => {
    const g = new THREE.Group();
    g.name = 'cinema-door';
    const leaf = new THREE.Mesh(
      boxGeo,
      new THREE.MeshStandardMaterial({ color: PROPS.lock.color, roughness: 0.75, metalness: 0.08 }),
    );
    leaf.name = 'cinema-door-leaf';
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    g.add(leaf);
    return g;
  });

  /* ------------------------------------------- the registration gate, chapter 3
   *
   * The barrier Stephan stands at, its two posts, and the swing that opens the
   * Devoxx rooms for the day. `buildVenue()` draws a static one in the same place
   * — `main-stair-gate` — and it is hidden for as long as a chapter publishes this
   * prop, exactly as the venue's shutter is: two gates in one doorway is the
   * duplicate the breaker panel and cinema E's screen were each caught doing.
   */
  const gateGroup = new THREE.Group();
  gateGroup.name = 'stair-gate';
  gateGroup.visible = false;
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x4d6c8a, roughness: 0.45, metalness: 0.65 });
  const gatePivot = new THREE.Group();
  const gateBar = new THREE.Mesh(boxGeo, gateMat);
  gateBar.name = 'gate-leaf';
  gateBar.castShadow = true;
  gatePivot.add(gateBar);
  gateGroup.add(gatePivot);
  const gatePosts: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(GATE_POST_R / PX_PER_M, GATE_POST_R / PX_PER_M, 1, 10), gateMat);
    post.name = `gate-post-${i}`;
    post.castShadow = true;
    gatePosts.push(post);
    gateGroup.add(post);
  }
  dressing.add(gateGroup);
  const venueGate = venue.ground.getObjectByName('main-stair-gate') ?? null;

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

  /*
   * The fallen leaf's resting pose is `ch1-night.ts`'s now — `JAM_TIP`, `JAM_SKID`
   * and `JAM_SKEW` are imported, not declared here.
   *
   * Michele: *"we are still walking through the crashed door. The shape is fine, as
   * long as robot walk on it, not through."* Standing on it is a question about the
   * height of the floor, the sim is the only thing allowed to answer that
   * (CLAUDE.md), and it cannot answer it without knowing where the leaf ended up.
   * So the pose moved to the sim and this file draws from it. One fact, not two.
   */
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

  /* --------------------------------------------------- the fire door, chapter 1
   *
   * Michele, with a screenshot of Biggy standing squarely in the doorway: *"still
   * a walkthrough object on the doorway, add an animation + sound when it opens."*
   * The leaf was drawn from the `PROPS` table at the prop's own rect, and that
   * rect went on being published after `ch1-night.ts` had removed the wall — a
   * 2.1 m slab across an opening that was no longer solid.
   *
   * So the door is no longer drawn from a table. `src/render/fire-door.ts` poses
   * it from the chapter's live wall list and the sim's own swing clock, and that
   * module's header explains why the collider sweep could not see the bug. Here
   * there is only the geometry: a pair of leaves on hinge pivots, and up to two
   * jamb panels for the fixed screen they hang in.
   */
  const fireDoor = new THREE.Group();
  fireDoor.name = 'fire-door-live';
  const fireMat = new THREE.MeshStandardMaterial({ color: 0x9c3a2c, roughness: 0.6, metalness: 0.25 });
  const fireBarMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.35, metalness: 0.7 });
  /** Two hinge pivots; each carries a leaf and the push bar across it. */
  const firePivots: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const pivot = new THREE.Group();
    const leaf = new THREE.Mesh(boxGeo, fireMat);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    // The panic bar: the one detail that says "fire door" rather than "partition",
    // and the thing the keypad releases. Stainless, so it catches what little light
    // the corridor has.
    const bar = new THREE.Mesh(boxGeo, fireBarMat);
    bar.castShadow = true;
    pivot.add(leaf, bar);
    fireDoor.add(pivot);
    firePivots.push(pivot);
  }
  /** The fixed screen either side of the opening, drawn from `firescreen` walls. */
  const fireScreens: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const panel = new THREE.Mesh(boxGeo, fireMat);
    panel.castShadow = true;
    panel.receiveShadow = true;
    fireScreens.push(panel);
    fireDoor.add(panel);
  }
  dressing.add(fireDoor);
  /** The venue's own static leaf, which chapter 1 takes over. See `floor1.ts`. */
  const venueFireLeaf = venue.floor1.getObjectByName('fire-leaf') ?? null;
  /** Height of the panic bar above the floor, metres. */
  const FIRE_BAR_Y = 1.02;

  /* ------------------------------------------------- the roller door, chapter 2
   *
   * The same story as the fire door above, in the store's doorway: `ch2-expo.ts`
   * removes the `roller` wall on the frame Biggy goes through it and goes on
   * publishing the prop, and this drew a 2.6 m box there from the `PROPS` table —
   * tinted dark red for `broken` and otherwise a slab through Biggy's chest.
   *
   * `src/render/roller-door.ts` poses the curtain from the chapter's live wall
   * list and the sim's own rise clock, so a slat is only ever drawn across the
   * opening while the sim has a wall there. Here there is only the geometry: one
   * pivot per slat, so a torn slat can sit out of square in its guides.
   */
  const rollerDoor = new THREE.Group();
  rollerDoor.name = 'roller-door-live';
  // The one thing the `PROPS` entry is still good for: the shutter's own grey.
  const rollerMat = new THREE.MeshStandardMaterial({
    color: PROPS.roller.color,
    roughness: 0.55,
    metalness: 0.6,
  });
  const rollerSlats: THREE.Group[] = [];
  for (let i = 0; i < ROLLER_SLATS; i++) {
    const pivot = new THREE.Group();
    const slat = new THREE.Mesh(boxGeo, rollerMat);
    slat.castShadow = true;
    slat.receiveShadow = true;
    pivot.add(slat);
    rollerDoor.add(pivot);
    rollerSlats.push(pivot);
  }
  dressing.add(rollerDoor);
  /** The venue's own static shutter, which chapter 2 takes over. See `ground.ts`. */
  const venueRoller = venue.ground.getObjectByName('roller-door') ?? null;

  /* ---------------------------------------------------- the keypad, chapter 1
   *
   * Michele: *"the keypad also needs a shape. Big numbers?"* It was one box from
   * the `PROPS` table, in the chapter whose whole plot is the four digits that go
   * into it. `src/render/keypad.ts` builds the unit and poses it from the prop —
   * including `label`, the digits typed so far, which the sim has been publishing
   * all along with nothing drawing it.
   */
  const keypad: KeypadModel = buildKeypad();
  dressing.add(keypad.root);
  /** The venue's own static keypad, which chapter 1 takes over. See `floor1.ts`. */
  const venueKeypad = venue.floor1.getObjectByName('fire-keypad') ?? null;

  /* ------------------------------------------- the door override, chapter 1
   *
   * Michele: *"the part that needs a shape is the green Cube that opens the
   * door"* — cinema B's release, the payoff of the mount beat, drawn from the
   * `PROPS` table as one lit cuboid. `src/render/release-panel.ts` builds the
   * unit and poses it from the prop, including `state`, which goes `idle` to
   * `done` when Droid reaches it off Biggy's shoulders.
   *
   * There is no static twin to hide, unlike the keypad, the fire leaf, the gate
   * and the shutter: `buildVenue()` puts a projection BOOTH over every
   * auditorium door (`venue/projector.ts`), and that is inside the room behind
   * this wall, not a second copy of this control.
   */
  const releasePanel: ReleasePanelModel = buildReleasePanel();
  dressing.add(releasePanel.root);

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
      // The ring is the selection marker now that the robot itself no longer
      // glows (see `xrayMaterial`), so it carries a little more weight.
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  activeRing.name = 'active-ring';
  activeRing.rotation.x = -Math.PI / 2;
  activeRing.renderOrder = 999;
  dressing.add(activeRing);

  /*
   * The same ring, seen only through whatever is hiding it — and opaque, for the
   * reason the robot's own ghost is (see `xrayMaterial`). Transparent, it was
   * drawn after every opaque mesh in the scene, so `GreaterDepth` passed over the
   * legs of the very robot the ring is drawn around: the marker painted a third
   * of its colour across the robot's feet, which is the note this pair of rings
   * exists to answer ("the circle around the selected chars shouldn't cover the
   * robot"). In the opaque pass at renderOrder 1 it draws while the depth buffer
   * holds only the venue, so it shows through a pillar and never through a robot.
   *
   * Dimmed on the way in rather than by `opacity`, which a non-transparent
   * material ignores.
   */
  const RING_GHOST_DIM = 0.42;
  const activeRingGhost = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: 0xff7a1a,
      transparent: false,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      toneMapped: false,
    }),
  );
  activeRingGhost.name = 'active-ring-ghost';
  activeRingGhost.rotation.x = -Math.PI / 2;
  activeRingGhost.renderOrder = 1;
  dressing.add(activeRingGhost);

  /*
   * THE TOW BAR.
   *
   * `src/sim/tow.ts` quantises the grab to one of eight compass directions, and
   * that quantisation is the whole mechanic: it is what stops the run-up
   * wandering. A player who cannot SEE which of the eight they are committed to
   * has been given a lane and not told where it goes, which is the original
   * complaint wearing a different hat.
   *
   * So two pieces. The bar itself, drawn between the pair at hand height, says
   * "you are joined, and this robot is holding". The lane strip on the floor,
   * running ahead of Biggy along the snapped axis, says where pushing will send
   * him — before it sends him there. Both take the holder's lamp colour, so the
   * pair reads at a glance even in an unlit room.
   *
   * Nothing here decides anything: every number comes off `snap.tow`, which the
   * sim owns (CLAUDE.md — no game logic in render code, ever).
   */
  const TOW_BAR_H = 0.5;
  const TOW_LANE_LEN = 4.0;
  const TOW_LANE_W = 0.9;

  const towBar = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.09, 0.09),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  );
  towBar.name = 'tow-bar';
  towBar.visible = false;
  dressing.add(towBar);

  const towLane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  towLane.name = 'tow-lane';
  towLane.rotation.x = -Math.PI / 2;
  towLane.renderOrder = 998;
  towLane.visible = false;
  dressing.add(towLane);

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
  /*
   * THE GHOST IS OPAQUE, AND THAT IS THE WHOLE FIX.
   *
   * `renderOrder` 1 on the ghost against 2 on the robot's own mesh was supposed
   * to mean "the ghost draws after the room and before the robot, so the robot
   * paints over it wherever he is actually visible". It never did, because three
   * splits the render list into an OPAQUE pass and a TRANSPARENT pass and draws
   * every opaque object before any transparent one; `renderOrder` only sorts
   * WITHIN a pass. A `transparent: true` ghost is therefore always drawn after
   * every opaque mesh in the scene, the robot's own shell included — so the
   * ghost of each part drew wherever any nearer part of the same robot had
   * already written depth, and the robot you were driving turned to glass.
   *
   * Measured on the build Michele played, Droid alone in an open corridor, with
   * the ghosts switched off and on: torso L=109 -> 149, shins L=57 -> 93, and the
   * "cinema closed tonight" sign four metres behind him reads straight through
   * his legs. That is "the selected characters becomes lighted and a bit
   * ethereal, in particular droid", and it was the selection highlight doing it,
   * not the lamps.
   *
   * Opaque, the pass order does the work by itself: venue (renderOrder 0), then
   * the ghosts (1) while the depth buffer holds nothing but the venue, so
   * `GreaterDepth` passes exactly where the VENUE is in front of the robot and
   * nowhere else, then the robot's own meshes (2) over the top. It is also the
   * thing Michele asked for in the first place — "show the silhuette" — because
   * with no blending the overlapping parts composite to one flat shape instead
   * of an x-ray of the rig's insides.
   *
   * `transparent: false` is what puts it in the opaque pass, and three disables
   * blending outright for a non-transparent material, so `opacity` is dead here:
   * the colour is dimmed on the way in instead (`GHOST_DIM`).
   */
  const GHOST_DIM = 0.62;
  const xrayMats = new Map<string, THREE.MeshBasicMaterial>();
  function xrayMaterial(kind: string, c: readonly number[]): THREE.MeshBasicMaterial {
    let mat = xrayMats.get(kind);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        transparent: false,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        toneMapped: false,
      });
      xrayMats.set(kind, mat);
    }
    mat.color.setRGB((c[0] / 255) * GHOST_DIM, (c[1] / 255) * GHOST_DIM, (c[2] / 255) * GHOST_DIM);
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
      if (!mesh.isMesh || mesh.userData[EXCLUDE_FROM_BOUNDS] === true) return;
      /*
       * Only the SHELL is ghosted. A rig's transparent parts — Voxxy's additive
       * visor glow, the lamp profile — are drawn in the transparent pass, after
       * the opaque ghosts, so ghosting them would put a solid blob of their
       * geometry on top of the silhouette instead of a silhouette.
       */
      const mat = mesh.material as THREE.Material | THREE.Material[];
      const clear = Array.isArray(mat) ? mat.some((mm) => mm.transparent) : mat.transparent;
      if (clear === true) return;
      sources.push(mesh);
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
  /*
   * THE MARKERS ARE DRAWN AFTER THE LIGHT.
   *
   * The slots, the pip and the numeral are floor decals at renderOrder 0, and
   * `lighting.ts` draws its additive floor pools at 12 and its wedges at 13 —
   * so every lamp in the room was composited ON TOP of the numeral. The glyph
   * is carried by a dark rim stroked under it, and additive light lifts that rim
   * to the same value as the glyph it is meant to separate: "Light is sometimes
   * too much (3 is no longer legible)". Measured with two robots standing on the
   * clue, the numeral's contrast against the floor inside its own ring was 16 of
   * 255 against 65 with one of the lights removed.
   *
   * Above the light layer (and above the fog mask at 10) the markers are lit by
   * nothing and read the same on a blacked-out floor and under three lamps at
   * once, which is what a piece of UI drawn into the world should do. They still
   * depth-test, so a robot standing on a clue still hides the part of it he is
   * standing on — that is a different note, and it was answered.
   */
  const CLUE_ORDER = 20;
  const CLUE_MAX = 8;
  /** One slot per robot: the most colours any one clue can ask for. */
  const CLUE_SLOTS = 3;
  /**
   * HOW FAR THE PLATE FLOATS ABOVE THE WALKING SURFACE, METRES.
   *
   * Michele, with a screenshot of chapter 1's kiosk clue: *"this hint is
   * flickering."* The rings in the shot are not rings, they are dashed arcs.
   *
   * It was 0.02, and 0.02 is exactly where the kiosk's own floor plate ends:
   * `src/render/venue/floor1.ts` builds it with `floorSlab(F1.kiosk, 0.02, …)`,
   * i.e. an opaque, depth-writing box whose TOP FACE is at y = 0.0200, measured
   * off the built scene graph. Chapter 1's clue 2 sits at the kiosk's centre, so
   * the dark backing disc and all three slot rings — 2.16 m across — were
   * **exactly coplanar** with a 4.48 x 4.48 m surface that completely contains
   * them. Which of the ring's pixels survive the depth test is then decided by
   * float rounding in the rasteriser, and it is re-decided every frame as the
   * eased framing (`updateFocus`) shifts the camera by a fraction of a pixel:
   * arcs that break, and breaks that crawl. That is the flicker.
   *
   * The same 0.02 also buried chapter 1's clue 4 outright. The exit-alcove plate
   * is a `flat` prop, and `drawProp` puts a flat prop's top at
   * `surface + h + 0.01` = 0.06 — four centimetres ABOVE the marker, covering all
   * of it, so the alcove's marker was not dashed, it was gone.
   *
   * 0.09 clears the kiosk plate by 70 mm and the tallest flat prop plate by
   * 30 mm. It stays a floor decal: at the diorama's 30° pitch the extra 70 mm
   * moves the plate about two pixels up the screen, and the markers still
   * depth-test, so a robot standing on a clue still hides the part of it he is
   * standing on. `tests/clue-plate.test.ts` measures the clearance rather than
   * trusting this comment.
   */
  const CLUE_PLATE_LIFT_M = 0.09;
  const clueGroup = new THREE.Group();
  clueGroup.name = 'clue-markers';
  dressing.add(clueGroup);

  /**
   * The ring says WHICH COLOURS, and it says it by RADIUS.
   *
   * It used to be a single ring in the average of those colours, which is exactly
   * the wrong thing to show: orange + green averages to a yellow that names no
   * robot, and all three average to white. Michele: "Light points should give
   * hints on the needed light... Gradient is an alternative, or double colored
   * circles." So the ring was cut into one arc per colour needed — and that is
   * where the next note came from: *"I don't know if it's me, but green and blue
   * on the hints are too similar."*
   *
   * He is right, and the lamp colours are not the problem — they are the robots'
   * identity and the whole light-mixing puzzle is built on them. The problem is
   * that two arcs of a 0.2 m-thick ring, at a diorama zoom where a metre is about
   * 34 px across and half that down the screen, are **three pixels thick** and
   * six pixels apart, at 60-90% opacity over a floor that can be anything from
   * black to a green wash. Hue is the only thing separating them and hue is the
   * thing that survives least at that size.
   *
   * So the arcs stop sharing a circle. Each robot owns a **slot at its own
   * radius**, always the same one, drawn as a complete ring rather than an arc:
   *
   *   Voxxy inner, Droid middle, Biggy outer — smallest robot, smallest ring.
   *
   * Green and blue are then separated by 0.34 m of dark floor, not by hue, and
   * each gets two and a half times the pixels an arc had. A slot a clue does not
   * need is simply not drawn, so the recipe still reads off the marker: two rings
   * with the inner slot empty means "green and blue, no orange".
   */
  const CLUE_SLOT: Readonly<Record<RobotKind, readonly [number, number]>> = Object.freeze({
    voxxy: [0.38, 0.56],
    droid: [0.64, 0.82],
    biggy: [0.90, 1.08],
  });
  /**
   * The keyline under the slots.
   *
   * The arcs are drawn over the additive floor pools, so under three lamps at
   * once a 0.6-opacity colour composites toward whatever the floor is doing and
   * the hue the marker is trying to name is the first casualty. A near-opaque
   * dark disc behind the whole marker gives every slot the same black backing
   * whatever the lighting, which is most of what makes the colours hold.
   */
  const clueBackGeo = new THREE.RingGeometry(0.32, 1.14, 40);
  const clueSlotGeo: Record<RobotKind, THREE.RingGeometry> = {
    voxxy: new THREE.RingGeometry(CLUE_SLOT.voxxy[0], CLUE_SLOT.voxxy[1], 40),
    droid: new THREE.RingGeometry(CLUE_SLOT.droid[0], CLUE_SLOT.droid[1], 44),
    biggy: new THREE.RingGeometry(CLUE_SLOT.biggy[0], CLUE_SLOT.biggy[1], 48),
  };
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
        // A heavier rim than the original 10: it is the only thing separating the
        // glyph from a floor that can be anything from black to three overlapping
        // lamps, and it costs nothing.
        g.lineWidth = 15;
        g.strokeStyle = 'rgba(6,10,8,0.92)';
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
    slots: THREE.Mesh[];
    back: THREE.Mesh;
    pip: THREE.Mesh;
    digit: THREE.Mesh;
  }> = [];
  for (let i = 0; i < CLUE_MAX; i++) {
    const root = new THREE.Group();
    const back = new THREE.Mesh(
      clueBackGeo,
      new THREE.MeshBasicMaterial({ color: 0x04070a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    );
    back.rotation.x = -Math.PI / 2;
    back.renderOrder = CLUE_ORDER - 1;
    root.add(back);
    const slots: THREE.Mesh[] = [];
    for (let a = 0; a < CLUE_SLOTS; a++) {
      const arc = new THREE.Mesh(
        clueSlotGeo[KINDS[a]],
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
      );
      arc.rotation.x = -Math.PI / 2;
      arc.renderOrder = CLUE_ORDER;
      slots.push(arc);
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
    digit.renderOrder = CLUE_ORDER + 1;
    digit.visible = false;
    pip.renderOrder = CLUE_ORDER;
    root.add(pip, digit);
    root.visible = false;
    clueGroup.add(root);
    clueMarks.push({ root, slots, back, pip, digit });
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
      mark.root.position.set(m(clue.x), surfaceY(floorY, clue.x, clue.y) + CLUE_PLATE_LIFT_M, m(clue.y));

      const found = clue.found;
      const pulse = 0.55 + 0.45 * Math.sin(snap.t * 2.1 + i * 1.7);

      // One RING per colour the clue needs, each at that robot's own fixed
      // radius and in that robot's own lamp colour, so the marker spells out the
      // recipe by position as well as by hue.
      for (let a = 0; a < CLUE_SLOTS; a++) {
        const arc = mark.slots[a];
        const kind = KINDS[a];
        if (!clue.need.includes(kind)) {
          arc.visible = false;
          continue;
        }
        arc.visible = true;
        const src = snap.bots.find((x) => x.kind === kind);
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
         * but not as a recipe, which is the one job it has. These rings are the
         * hint; muting them to taste defeats them. The pulse now swings between
         * 0.78 and 1, not between 0.6 and 0.9: it still breathes, and the dim
         * half of the breath no longer costs the hue its chroma.
         */
        mat.opacity = found ? 0.97 : 0.78 + 0.22 * pulse;
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
    activeRing.position.set(m(bot.x), bodySurfaceY(floorY, bot.x, bot.y, bot.r) + 0.03, m(bot.y));
    activeRingGhost.scale.copy(activeRing.scale);
    activeRingGhost.position.copy(activeRing.position);
    const c = bot.light.c;
    (activeRing.material as THREE.MeshBasicMaterial).color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
    (activeRingGhost.material as THREE.MeshBasicMaterial).color.setRGB(
      (c[0] / 255) * RING_GHOST_DIM,
      (c[1] / 255) * RING_GHOST_DIM,
      (c[2] / 255) * RING_GHOST_DIM,
    );
  }

  /** Draw the bar and its lane, or hide both. Reads `snap.tow`; decides nothing. */
  function updateTow(snap: GameSnapshot, floorY: number): void {
    const tow = snap.phase === 'play' ? snap.tow : null;
    const holder = tow ? snap.bots.find((b) => b.kind === tow.holder) : undefined;
    const big = tow ? snap.bots.find((b) => b.kind === 'biggy') : undefined;
    if (!tow || !holder || !big) {
      towBar.visible = false;
      towLane.visible = false;
      return;
    }
    towBar.visible = true;
    towLane.visible = true;

    const c = holder.light.c;
    (towBar.material as THREE.MeshBasicMaterial).color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
    (towLane.material as THREE.MeshBasicMaterial).color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);

    // World +X is sim +x and world +Z is sim +y, so a sim heading is a yaw of its
    // negative about Y. The bar is modelled along its own +X and scaled to fit.
    const hx = m(holder.x);
    const hz = m(holder.y);
    const bx = m(big.x);
    const bz = m(big.y);
    // Both ends read the BODY surface, like the robots they are attached to: a
    // bar whose ends came off the point surface would stay on the floor while the
    // robot holding it climbed a step.
    const barY =
      (bodySurfaceY(floorY, holder.x, holder.y, holder.r) +
        bodySurfaceY(floorY, big.x, big.y, big.r)) /
      2;
    towBar.position.set((hx + bx) / 2, barY + TOW_BAR_H, (hz + bz) / 2);
    towBar.rotation.y = -Math.atan2(bz - hz, bx - hx);
    towBar.scale.x = Math.max(Math.hypot(bx - hx, bz - hz), 0.2);

    // The lane is drawn from Biggy's far edge outward: it shows where he is going,
    // not where he already is, and the snapped `aim` is what the sim will drive.
    const ax = Math.cos(tow.aim);
    const az = Math.sin(tow.aim);
    const start = m(big.r);
    const mid = start + TOW_LANE_LEN / 2;
    towLane.position.set(bx + ax * mid, bodySurfaceY(floorY, big.x, big.y, big.r) + 0.02, bz + az * mid);
    // Euler XYZ applies Z first, so `rotation.z` turns the plane inside its own
    // XY before `rotation.x` lays it flat: local +X lands on (cos z, 0, -sin z),
    // which is the sim axis for z = -aim. Feeding it `atan2(az, ax)` mirrors the
    // lane about the room's long axis, which looks plausible exactly half the time.
    towLane.rotation.z = -tow.aim;
    towLane.scale.set(TOW_LANE_LEN, TOW_LANE_W, 1);
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
    mesh.position.set(cx, surfaceY(floorY, p.x, p.y) + (spec.lift ?? 0) + height / 2 + (spec.flat ? 0.01 : 0), cz);
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

  /**
   * A published seat row or seat block, as a row of modelled seats.
   *
   * The rect is the sim's, untouched: `src/render/seats.ts` subdivides it on the
   * sim's own `SEAT_PITCH_PX`/`ROW_PITCH_PX` and faces the seats at the room's
   * screen, and every seat stands inside the rect the collider is on.
   */
  function drawSeats(p: Prop, floorY: number): void {
    const w = p.w ?? 0;
    const d = p.h ?? 0;
    if (w <= 0 || d <= 0) return;
    // Seat kinds are `tl`: the prop reports the rect's top-left corner.
    seatField.add({ x: p.x, y: p.y, w, h: d }, (sx, sy) => surfaceY(floorY, sx, sy));
  }

  /**
   * A beer crate — chapter 3's delivery (`src/sim/crates.ts`).
   *
   * Not a `PROPS` entry, because a crate's height off the floor is live state:
   * `v` is which layer of a pile it is in, and a crate Biggy is CARRYING is piled
   * on his dome rather than on the ground. Watching that column grow over his head
   * is how the player sees the heap filling up, so it is drawn rather than
   * described. Everything else about it is an ordinary pooled box.
   */
  const CRATE_H_M = 0.34;
  const CRATE_GAP_M = 0.02;
  function drawCrate(p: Prop, floorY: number): void {
    const carried = p.state === 'active' || p.state === 'broken';
    const layer = Math.max(0, p.v ?? 0) - (carried ? 1 : 0);
    const base = carried ? ROBOT_HEIGHT_M.biggy : 0;
    const wM = Math.max(m(p.w ?? 8), 0.3);
    const dM = Math.max(m(p.h ?? 8), 0.3);

    const mesh = propPool.get();
    mesh.scale.set(wM, CRATE_H_M, dM * 0.8);
    mesh.position.set(m(p.x), surfaceY(floorY, p.x, p.y) + base + layer * (CRATE_H_M + CRATE_GAP_M) + CRATE_H_M / 2, m(p.y));
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(p.state === 'done' ? 0x8f3a2b : 0xb4472f);
    // The last crate that fits glows like a warning lamp: the heap error is only
    // funny if the player could see it coming.
    const tint = p.state === 'broken' ? 0x6b2206 : undefined;
    mat.emissive.setHex(tint ?? 0x000000);
    mat.emissiveIntensity = tint === undefined ? 0 : 1;
    mat.transparent = false;
    mat.opacity = 1;
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
      // Per point, not per cable: the run crosses the lobby threshold, so a
      // single height would bury half of it or float the other half.
      arr[o + 1] = surfaceY(floorY, pts[i].x, pts[i].y) + 0.08;
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
    breakerPanel.position.set(m(p.x), surfaceY(floorY, p.x, p.y) + BREAKER_Y, m(p.y) + dM);
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

  /**
   * The router terminal, on the switch gear inside the cabinet.
   *
   * It is a screen, and the one thing a screen has that a grey box does not is that
   * it BLINKS while it is waiting for you. Michele's note, twice over two playtests:
   * *"I had trouble finding the projector / open the room... There should be
   * something visible."* A terminal that wants a password pulses amber; one that has
   * had it sits green. The sim owns every bit of that — `p.state` is 'idle' behind a
   * shut door, 'active' once the door is open and 'done' once the password is in,
   * and `p.v` is how much of the password is typed, 0..1 — so the only thing decided
   * here is what those look like.
   */
  function drawTerminal(p: Prop, floorY: number, t: number): void {
    const spec = PROPS.terminal ?? PROP_FALLBACK;
    const wM = m(p.w ?? 16);
    const dM = m(p.h ?? 4);
    const mesh = propPool.get();
    mesh.scale.set(Math.max(wM, 0.06), spec.h, Math.max(dM, 0.06));
    mesh.position.set(m(p.x) + wM / 2, surfaceY(floorY, p.x, p.y) + (spec.lift ?? 1.25) + spec.h / 2, m(p.y) + dM / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.transparent = false;
    mat.opacity = 1;
    mat.color.setHex(spec.color);
    const waiting = p.state === 'active';
    const done = p.state === 'done';
    mat.emissive.setHex(done ? 0x2f9d5f : waiting ? 0xff8a1a : (spec.glow ?? 0x6b4406));
    // A cursor, not a strobe: the field brightens as it fills, and the empty field
    // blinks hardest. 2.4 rad/s is about one blink a second.
    const filled = Math.min(1, Math.max(0, p.v ?? 0));
    const blink = waiting ? 0.45 + 0.35 * filled + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.4)) * (1 - filled) : 1;
    mat.emissiveIntensity = done ? 1.6 : waiting ? blink * 1.5 : 0.5;
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
    jammedLeaf.position.set(m(p.x) + wM / 2, surfaceY(floorY, p.x, p.y), m(p.y) + dM + JAM_SKID * swing);
    /*
     * `YXZ`, and that one word is what lets a robot stand on the leaf.
     *
     * Under the default `XYZ` the skew is applied to the door while it is still
     * standing and the tip then turns that yaw into a ROLL: the leaf came to rest
     * propped on nothing, one long edge 0.78 m in the air and its face running
     * downhill by 0.62 m across its width — a surface you can only walk on by
     * walking uphill on air. Yawed AFTER the tip it lands flat and askew in plan,
     * which is what a door off its hinges does and what the silhouette already
     * read as. `jammedLeafPlate` in `ch1-night.ts` is the same motion in plan.
     */
    jammedLeaf.rotation.order = 'YXZ';
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

  /**
   * Chapter 1's fire door: the screen it hangs in, and the two leaves swinging.
   *
   * Every number here comes out of `fireDoorDraw`, which reads the chapter's own
   * walls and the sim's swing clock — so a leaf is only ever drawn where the sim
   * has something solid, and the door cannot go back to being a slab across an
   * opening it has already given up. See `src/render/fire-door.ts`.
   *
   * The static leaf `buildVenue()` puts here is hidden for as long as a chapter
   * publishes this prop: two doors in one doorway is exactly the duplicate the
   * breaker panel and cinema E's screen were each caught doing.
   */
  function drawFireDoor(p: Prop, floorY: number, walls: GameSnapshot['walls']): void {
    if (venueFireLeaf) venueFireLeaf.visible = false;
    const d = fireDoorDraw(p, walls);
    fireDoor.visible = true;

    for (let i = 0; i < fireScreens.length; i++) {
      const r = d.screen[i];
      const panel = fireScreens[i];
      panel.visible = r !== undefined;
      if (!r) continue;
      panel.scale.set(Math.max(m(r.w), 0.05), WALL_H, Math.max(m(r.h), 0.05));
      panel.position.set(m(r.x + r.w / 2), surfaceY(floorY, r.x, r.y) + WALL_H / 2, m(r.y + r.h / 2));
    }

    const tM = m(FIRE_LEAF_T);
    for (let i = 0; i < firePivots.length; i++) {
      const l = d.leaves[i];
      const pivot = firePivots[i];
      pivot.visible = l !== undefined;
      if (!l) continue;
      const lenM = m(l.len);
      const base = surfaceY(floorY, l.hinge.x, l.hinge.y);
      pivot.position.set(m(l.hinge.x), base, m(l.hinge.y));
      // The leaf's own length runs along the pivot's local +x. Sim +y is world +z,
      // so a heading of (ax, ay) is a yaw of atan2(-ay, ax).
      pivot.rotation.y = Math.atan2(-l.axis.y, l.axis.x);
      const leaf = pivot.children[0] as THREE.Mesh;
      const bar = pivot.children[1] as THREE.Mesh;
      leaf.scale.set(lenM, FIRE_LEAF_H, tM);
      leaf.position.set(lenM / 2, FIRE_LEAF_H / 2, 0);
      // Across the leaf, standing proud of its corridor face, and stopping short
      // of the hinge the way a panic bar does.
      bar.scale.set(lenM * 0.78, 0.08, tM * 0.55);
      bar.position.set(lenM * 0.55, FIRE_BAR_Y, tM * 0.7);
    }
  }

  /**
   * Chapter 1's keypad — the thing the whole four-digit hunt is for.
   *
   * Everything it shows comes out of the prop: the rect it stands on, `label`
   * (the digits typed so far, padded with '_'), and `state`, which goes `idle` to
   * `done` when the magnetic lock lets go. See `src/render/keypad.ts` for the
   * model and for the camera geometry that decides which way it faces.
   *
   * The static keypad `buildVenue()` screws to the fire door is hidden for as
   * long as a chapter publishes this prop — the same rule the fire door's own
   * leaf follows above, and for the same reason: two keypads in one doorway.
   */
  function drawKeypad(p: Prop, floorY: number): void {
    if (venueKeypad) venueKeypad.visible = false;
    keypad.root.visible = true;
    keypad.pose(p, surfaceY(floorY, p.x, p.y));
  }

  /**
   * Chapter 1's door override — the release Droid reaches from Biggy's shoulders.
   *
   * Everything it shows comes out of the prop: the rect it hangs in and `state`,
   * which goes `idle` to `done` on the frame the magnetic lock lets go. See
   * `src/render/release-panel.ts` for the model, for the camera geometry that
   * decides which way it faces, and for why the rect's DEPTH is the part of it
   * that is wrong.
   */
  function drawReleasePanel(p: Prop, floorY: number): void {
    releasePanel.root.visible = true;
    releasePanel.pose(p, surfaceY(floorY, p.x, p.y));
  }

  /**
   * Chapter 2's roller door: seven slats, down, tearing up, or jammed in the box.
   *
   * Every number here comes out of `rollerDoorDraw`, which reads the chapter's own
   * walls and the sim's rise clock — so a slat is only ever drawn across the
   * opening while the sim has a wall there, and the shutter cannot go back to
   * being a slab across a doorway Biggy has already gone through. See
   * `src/render/roller-door.ts`.
   *
   * The static shutter `buildVenue()` puts in this doorway is hidden for as long
   * as a chapter publishes this prop: two doors in one doorway is exactly the
   * duplicate the breaker panel and cinema E's screen were each caught doing, and
   * here it was literally true — the venue's leaf and this one, both standing.
   */
  function drawRollerDoor(p: Prop, floorY: number, walls: GameSnapshot['walls']): void {
    if (venueRoller) venueRoller.visible = false;
    const d = rollerDoorDraw(p, walls);
    rollerDoor.visible = true;

    for (let i = 0; i < rollerSlats.length; i++) {
      const s = d.slats[i];
      const pivot = rollerSlats[i];
      pivot.visible = s !== undefined;
      if (!s) continue;
      const wM = Math.max(m(s.rect.w), 0.04);
      const dM = Math.max(m(s.rect.h), 0.04);
      const base = surfaceY(floorY, s.rect.x, s.rect.y);
      pivot.position.set(m(s.rect.x) + wM / 2, base + s.lo + s.h / 2, m(s.rect.y) + dM / 2);
      // Sim +y is world +z, so the door's width axis is Z and a slat bent out of
      // its guides leans about it. See `RollerSlat.tilt`.
      pivot.rotation.z = s.tilt;
      const slat = pivot.children[0] as THREE.Mesh;
      slat.scale.set(wM, s.h, dM);
    }

    /*
     * Hot torn steel, cooling as it goes up and dead by the time it jams.
     *
     * The same licence `drawJammed` takes with the splintered leaf, and the same
     * reason, only more so: chapter 2's hall is in a blackout and the robots' own
     * lamps are at floor level, so a curtain travelling up past head height leaves
     * the only light in the room. Without this the animation happens in the dark
     * and the shutter reads as having simply vanished. It is off at `u = 0` and
     * off again at `u = 1`, so nothing glows that is not moving.
     */
    const heat = Math.max(0, 1 - d.u * 1.6) * (d.u > 0 ? 1 : 0);
    rollerMat.emissive.setRGB(heat * 0.22, heat * 0.085, heat * 0.025);
    rollerMat.emissiveIntensity = heat > 0 ? 1 : 0;
  }

  /**
   * The router cabinet's two doors, and the lit interior behind them.
   *
   * Every number comes out of `cabinetDoorDraw` (`src/render/doors.ts`), which is
   * posed from the sim's own swing clock — `cabinetSwing` in `ch2-expo.ts`, ticked
   * over `CABINET_SWING_TIME`. This used to cut from nothing to a single 4.32 m
   * leaf standing at 58° on the frame Biggy pressed `E`: no animation, no sound,
   * and no collider anywhere near the 3.7 m of technical-room floor it lay across.
   *
   * The carcass itself is venue geometry and a collider in every chapter, so this
   * group is only the state: the doors, and the light coming out from between them.
   */
  function drawCabinet(p: Prop, floorY: number): void {
    const u = p.progress ?? (p.state === 'open' ? 1 : 0);
    if (u <= 0) {
      cabinetOpen.visible = false;
      return;
    }
    const d = cabinetDoorDraw(p, u);
    const base = surfaceY(floorY, p.x, p.y) + CABINET_LEAF_LIFT;
    cabinetOpen.visible = true;

    // The interior: the width of the bay, revealed as the leaves come off it.
    const inner = cabinetOpen.children[0] as THREE.Mesh;
    inner.scale.set(m(d.bay.w), CABINET_LEAF_H, 1);
    inner.position.set(m(d.bay.x + d.bay.w / 2), base + CABINET_LEAF_H / 2, m(d.bay.y) - 0.06);
    const innerMat = inner.material as THREE.MeshStandardMaterial;
    // Dark behind a door that has only just cracked: the switch gear is the
    // brightest thing in the room, but not before you can see into it.
    innerMat.emissiveIntensity = 1.6 * Math.min(1, d.u * 2.2);

    for (let i = 0; i < cabinetLeaves.length; i++) {
      const pivot = cabinetLeaves[i];
      const l = d.leaves[i];
      pivot.visible = l !== undefined;
      if (!l) continue;
      pivot.position.set(m(l.hinge.x), base + CABINET_LEAF_H / 2, m(l.hinge.y));
      // Sim +y is world +z, so a leaf turning in plan turns about world Y, and the
      // yaw that gets a sim vector onto a world one is the same one the robots use.
      pivot.rotation.y = yawFromSimHeading(Math.atan2(l.axis.y, l.axis.x));
      /*
       * The leaf runs along the pivot's local +Z, not +X.
       *
       * `yawFromSimHeading` is the renderer's one conversion from a sim heading to
       * a world yaw and it is written for the robots, whose rigs face +Z at yaw 0.
       * Hung along +X instead, every leaf in this file came out a quarter turn
       * round — cinema B's door swung west along the corridor instead of north into
       * its auditorium, which is exactly what the first frame strip showed.
       */
      const leaf = pivot.children[0] as THREE.Mesh;
      leaf.scale.set(m(CABINET_LEAF_T), CABINET_LEAF_H, m(l.len));
      leaf.position.set(0, 0, m(l.len) / 2);
    }
  }

  /**
   * A cinema door in the closed section: shut, or swinging into its auditorium.
   *
   * Every number comes out of `lockDoorDraw` (`src/render/doors.ts`), which reads
   * the chapter's live wall list and the sim's own clock — so a leaf is only ever
   * drawn where the sim has something solid, and cinema B's door cannot go back to
   * being a thing that simply stops existing when the release is pressed.
   */
  function drawLock(p: Prop, floorY: number, walls: GameSnapshot['walls']): void {
    const d = lockDoorDraw(p, walls);
    const g = lockPool.get();
    const h = PROPS.lock.h;
    g.position.set(m(d.leaf.hinge.x), surfaceY(floorY, d.leaf.hinge.x, d.leaf.hinge.y) + h / 2, m(d.leaf.hinge.y));
    g.rotation.y = yawFromSimHeading(Math.atan2(d.leaf.axis.y, d.leaf.axis.x));
    // Along the pivot's local +Z — see `drawCabinet` for why that and not +X.
    const leaf = g.children[0] as THREE.Mesh;
    leaf.scale.set(m(LOCK_LEAF_T), h, m(d.leaf.len));
    leaf.position.set(0, 0, m(d.leaf.len) / 2);
    const mat = leaf.material as THREE.MeshStandardMaterial;
    // A door standing open shows its edge to the corridor and its back to the
    // room; lightening it as it goes is what makes the swing read in a blackout.
    const lit = d.u * 0.35;
    mat.emissive.setRGB(lit * 0.05, lit * 0.06, lit * 0.08);
    mat.emissiveIntensity = lit > 0 ? 1 : 0;
  }

  /**
   * Chapter 3's registration gate: two posts and a barrier Stephan walks back.
   *
   * Every number comes out of `gateDraw` (`src/render/doors.ts`), posed from
   * `gateSwing` in `ch3-breakfast.ts`. The static gate `buildVenue()` builds in
   * this doorway is hidden for as long as a chapter publishes this prop — two
   * barriers in one doorway, one of which never opens, is exactly the duplicate
   * the venue's shutter was caught doing behind chapter 2's.
   */
  function drawGate(p: Prop, floorY: number, walls: GameSnapshot['walls']): void {
    if (venueGate) venueGate.visible = false;
    const d = gateDraw(p, walls);
    gateGroup.visible = true;
    const base = surfaceY(floorY, d.leaf.hinge.x, d.leaf.hinge.y);

    gatePivot.position.set(m(d.leaf.hinge.x), base + GATE_H / 2, m(d.leaf.hinge.y));
    gatePivot.rotation.y = yawFromSimHeading(Math.atan2(d.leaf.axis.y, d.leaf.axis.x));
    gateBar.scale.set(m(GATE_LEAF_T), GATE_H, m(d.leaf.len));
    gateBar.position.set(0, 0, m(d.leaf.len) / 2);

    for (let i = 0; i < gatePosts.length; i++) {
      const v = d.posts[i];
      // A post is 15 cm taller than the bar it carries, which is what makes a
      // barrier read as a barrier rather than as a plank floating in a doorway.
      gatePosts[i].scale.set(1, GATE_H + 0.15, 1);
      gatePosts[i].position.set(m(v.x), base + (GATE_H + 0.15) / 2, m(v.y));
    }
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
    g.position.set(m(p.x), surfaceY(floorY, p.x, p.y), m(p.y));

    const mat = body.material as THREE.MeshStandardMaterial;
    const hex = p.colour ? new THREE.Color(p.colour).getHex() : (ROLE_COLOR[p.role] ?? ROLE_COLOR.visitor);
    mat.color.setHex(hex);
  }

  function drawDressing(snap: GameSnapshot, floorY: number): void {
    propPool.begin();
    peoplePool.begin();
    lockPool.begin();
    seatField.begin();
    gateGroup.visible = false;
    cableLine.visible = false;
    breakerPanel.visible = false;
    cabinetOpen.visible = false;
    jammedLeaf.visible = false;
    fireDoor.visible = false;
    rollerDoor.visible = false;
    keypad.root.visible = false;
    releasePanel.root.visible = false;
    // Handed back to the venue unless a chapter claims it again this frame.
    if (venueFireLeaf) venueFireLeaf.visible = true;
    if (venueRoller) venueRoller.visible = true;
    if (venueGate) venueGate.visible = true;
    if (venueKeypad) venueKeypad.visible = true;
    for (const p of snap.props) {
      if (p.kind === 'cable') drawCable(p, floorY);
      else if (p.kind === 'firedoor') drawFireDoor(p, floorY, snap.walls);
      else if (p.kind === 'roller') drawRollerDoor(p, floorY, snap.walls);
      else if (p.kind === 'jammed') drawJammed(p, floorY);
      else if (p.kind === 'breaker') drawBreaker(p, floorY);
      else if (p.kind === 'terminal') drawTerminal(p, floorY, snap.t);
      else if (p.kind === 'cabinet') drawCabinet(p, floorY);
      else if (p.kind === 'lock') drawLock(p, floorY, snap.walls);
      else if (p.kind === 'gate') drawGate(p, floorY, snap.walls);
      else if (p.kind === 'crate') drawCrate(p, floorY);
      else if (p.kind === 'keypad') drawKeypad(p, floorY);
      else if (p.kind === 'projector-panel') drawReleasePanel(p, floorY);
      else if (SEAT_KINDS.has(p.kind)) drawSeats(p, floorY);
      else drawProp(p, floorY);
    }
    for (const person of snap.people) drawPerson(person, floorY);
    propPool.end();
    peoplePool.end();
    lockPool.end();
    seatField.end();
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
       * The height of the floor under a robot is `surfaceY`'s business and the
       * SIM's answer — `GameSnapshot.plates`, read through `riseAt`. It used to be
       * nobody's: `groundRiseM` was exported for exactly this, said in its own doc
       * comment that the renderer was what read it, and nothing did, so a robot
       * standing on the raised lobby stood half a metre inside it and one on the
       * main flight was swallowed whole. What is added HERE is only what a robot
       * does on top of that floor — riding on Biggy, and Voxxy's hop.
       */
      const rider = b.kind === 'droid' && b.mounted;
      /*
       * Voxxy's hop, drawn from the sim's own clock and nothing else.
       *
       * `hopPhase` runs 0 to 1 across the airtime and `4u(1 - u)` is the height
       * of a body under constant gravity as a fraction of its apex, so the arc on
       * screen is the arc `JUMP_AIR` was derived from. No easing curve, no second
       * set of numbers to keep in step with the sim — which is the rule for this
       * file (CLAUDE.md: the renderer reads, it does not decide).
       */
      const u = hopPhase(b);
      const hop = u > 0 ? JUMP_RISE_M * 4 * u * (1 - u) : 0;
      const lift = (rider ? mountLift() : 0) + hop;
      /*
       * "Droid light is oddly pointing somewhere else?"
       *
       * It is not the lamp, and it is not `face` going stale — Droid's lamp is a
       * pool and a pool has no direction. It is this line, and only while he is
       * riding Biggy.
       *
       * `syncMount` (`src/sim/bot.ts`) puts a mounted Droid at
       * `bg.y - MOUNT_OFFSET_Y`: six sim pixels NORTH of his carrier. That is the
       * prototype's flat-canvas way of drawing "he is up on the shoulders", and
       * this renderer already draws that in the axis it belongs in, by lifting him
       * `mountLift()` metres. The comment that used to sit here said the sim keeps
       * both at the same footprint; it does not, so the offset was being counted
       * twice — once as height, once as half a metre of floor — and Droid was
       * drawn 0.48 m behind his own light.
       *
       * `buildLights` emits a mounted lamp at the CARRIER's position, which is
       * both correct and untouchable (moving it would move the polygon the clue
       * rule tests). So the drawing is what comes back to the carrier: the offset
       * is added out here, where it was introduced, and Droid sits on Biggy's
       * axis with his pool centred under him. At chapter 1's zoom the gap was
       * ~30 screen pixels of a pool that is meant to be centred on him.
       */
      const ry = rider ? b.y + MOUNT_OFFSET_Y : b.y;
      rig.root.position.set(m(b.x), bodySurfaceY(floorY, b.x, b.y, b.r) + lift, m(ry));
      updateRobot(rig, {
        speedMps: Math.hypot(b.vx, b.vy) / PX_PER_M,
        heading: b.face,
        dt,
        mounted: b.mounted,
        // The same `hopPhase` the lift above is drawn from, so the pose and the
        // height are two readings of one number rather than two animations.
        hop: u,
        // Biggy's roll and Droid's stretch, off the sim's clock the same way. No
        // lift goes with this one: a party trick moves nothing (`partyTrick`).
        flair: flairPhase(b),
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
    framePlates = snap.plates;
    venue.floor1.visible = snap.floor === 'up';
    venue.ground.visible = snap.floor === 'down';
    placeRobots(snap, dt, floorY);
    drawDressing(snap, floorY);
    activeRing.visible = false;
    // The plan view is for measuring the map against `plans/`, not for playing:
    // every marker that exists to help the player is off, the bar included.
    towBar.visible = false;
    towLane.visible = false;
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
    // The frame's raised surfaces, from the sim. See `surfaceY`.
    framePlates = snap.plates;
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
    updateTow(snap, floorY);
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
      clueBackGeo.dispose();
      for (const geo of Object.values(clueSlotGeo)) geo.dispose();
      pipGeo.dispose();
      digitGeo.dispose();
      for (const tex of digitTex.values()) tex?.dispose();
      for (const mark of clueMarks) {
        for (const arc of mark.slots) (arc.material as THREE.Material).dispose();
        (mark.back.material as THREE.Material).dispose();
        (mark.pip.material as THREE.Material).dispose();
        (mark.digit.material as THREE.Material).dispose();
      }
      propPool.dispose();
      seatField.dispose();
      peoplePool.dispose();
      lockPool.dispose();
      gateMat.dispose();
      for (const post of gatePosts) post.geometry.dispose();
      // Nothing may outlive the scene that published it — a stale plate list would
      // otherwise answer `surfaceY` for whatever is built next (see that function).
      framePlates = [];
      (jammedSlab.material as THREE.Material).dispose();
      fireMat.dispose();
      fireBarMat.dispose();
      keypad.dispose();
      releasePanel.dispose();
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
