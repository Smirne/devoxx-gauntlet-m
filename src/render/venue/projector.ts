/**
 * projector.ts — the projection booth over an auditorium door, and the machine
 * standing in it.
 *
 * ## Why this file exists
 *
 * Chapter 1 talks about the projector constantly — cinema B's door is locked
 * until Droid, on Biggy's shoulders, reaches *"the release way up by the
 * projector window"*, cinema C's joke is *"projector says NO SIGNAL"*, and the
 * README opens on *"the projectors are cold"* — and until now the venue drew no
 * projector at all. Not a crude one: none. Michele, after his playtest: **"The
 * projector still needs a shape."** (The `projector-panel` prop beside cinema B's
 * door is the door override, a different object, and it already has one.)
 *
 * ## What is modelled, and why each piece is there
 *
 * A 35 mm booth machine, because that is what a room *"locked since the 2019
 * after-party"* still has in it, and because its silhouette is the one a stranger
 * reads as a projector at a glance: two big reels stacked on a spindle arm, a
 * lens barrel out of the front, a lamphouse behind with a chimney off its top.
 * Everything in `MACHINE` below is that read, plus the pieces that sell it close
 * up — a plinth, a rear-door and vents on the lamphouse, a brass lens ring, a
 * pilot lamp, conduit down the wall and a sagging feed cable to the tray.
 *
 * ## The four measurements this geometry is built on
 *
 * 1. **It has to read at play zoom.** Chapter 1 plays on a 320 x 235 px focus
 *    window (`FOCUS` in `scene.ts`), which is ~40 screen px per metre at 1600
 *    wide. So the machine is 1.5 m long and its reels are 0.52 m across — about
 *    60 px and 21 px. Detail finer than ~4 cm is for the close-up only, and
 *    nothing load-bearing is smaller than a reel.
 * 2. **The camera band is -0.4 .. 3.9 m** (`BAND_LOW`/`BAND_HIGH` in
 *    `camera.ts`): that is what the diorama camera guarantees to frame. The deck
 *    is at 2.30 m and the machine tops out at 3.68 m, inside it.
 * 3. **A booth over the far row cannot be seen, below about 2.7 m.** Raycast
 *    from a booth-height point in cinema B toward the camera, at all four
 *    diorama pitches (24, 30, 31, 33 deg): the corridor vault
 *    (`corridorVault()`) swallows everything under 2.25-2.70 m depending on the
 *    pitch and how far back in the room the point sits. The far rooms' rear wall
 *    stands at `WALL_H`, so their deck sits ON the wall head at 2.45 m rather
 *    than being bracketed off a parapet, which puts the machine in the clear at
 *    every pitch. The near row has no such constraint — every height from 2.0 m
 *    up is clear.
 * 4. **It must stand clear of the doorway and of everything already on that
 *    frontage.** A bay centred over the door would hover over a 3.68 m opening
 *    and hide a strip of the corridor behind it, in the chapter whose whole
 *    stage is that corridor; a bay a couple of metres to one side lands on the
 *    Zaal numeral, the poster box or the talk strip, all of which hang on that
 *    same wall and all of which the camera reads through the space the bay
 *    would occupy. So the offset is **computed from `signage.ts`'s own
 *    positions** (`bayOffsetPx`), not chosen, and the machine is **toed in**
 *    toward the centre of `roomScreen(r)` from wherever that puts it. Offset
 *    booths toeing in is what real projection rooms do.
 *
 * Nothing here reads game state, and no position is invented: the bay hangs off
 * `roomDoor()`, the aim comes from `roomScreen()`, and the heights come from the
 * sectional-model constants in `props.ts`.
 *
 * ## Why no `weather()`
 *
 * The venue's materials are shared and are **not** `vertexColors` materials
 * (`materials.ts` builds them once for the whole building), so the robots' wear
 * baking would be ignored here. Age is carried by material choice instead: a
 * hammertone grey body against near-black auditorium walls, dull steel reels,
 * and one green pilot LED — equipment asleep, not equipment gone.
 */

import * as THREE from 'three';

import { T } from '../../sim/constants';
import { CY0, CY1, DOOR, roomDoor, roomScreen } from '../../sim/geometry';
import type { RoomDef } from '../../sim/types';
import { m } from '../../sim/units';
import { DIORAMA_AZIMUTH_RAD } from '../camera';
import { puck, roundedBox } from '../robots/rig';
import type { VenuePalette } from './materials';
import { NEAR_CAP_T, NEAR_CUT_H, WALL_H } from './props';
import { zaalPosterX, zaalSignX } from './signage';

/* --------------------------------------------------------------- the bay */

/** Bay width and depth, sim px: 2.4 m of deck, 1.92 m out from the wall. */
const BAY_W_PX = 30;
const BAY_D_PX = 24;
/** Slack between the bay and whatever it is standing clear of, sim px. */
const BAY_CLEAR_PX = 2;
/** Deck plate thickness. */
const DECK_T = 0.12;
/** Walking surface of the booth deck, above the near row's parapet cap. */
const DECK_NEAR = 2.3;
/** Far row: the deck sits on the rear wall's own head instead. See note 3. */
const DECK_FAR = WALL_H + DECK_T;
/**
 * How far the machine's own origin stands out from the wall face.
 *
 * 0.90 puts the front of the lens 4 cm behind the projection glass: close enough
 * to read as looking through it, far enough that the two faces never z-fight.
 */
const MACHINE_Z = 0.9;
/**
 * Port wall: front face of the bay, and how far it stands above the deck.
 *
 * 0.58 m, not the 0.75 it started at. At 0.75 the wall is chest-high on the
 * machine and, from a camera that looks slightly down on the booth, it hid the
 * pedestal, the lower reel and the whole lower half of the head: the booth read
 * as a black parapet with a pipe behind it. At 0.58 the port sill crosses the
 * machine below its lens and the machine keeps its silhouette.
 */
const PORT_Z = 1.8;
const PORT_T = 0.08;
const PORT_H = 0.58;
/** Downward rake of the machine, radians — the lens looks at the screen centre. */
const RAKE_RAD = (5 * Math.PI) / 180;
/**
 * Where the cooling stack turns, in the machine's own frame.
 *
 * The duct from here back into the wall is built in the BAY's frame, not the
 * machine's: the machine is yawed by however far its bay sits off the room's
 * axis, and a duct that inherits that yaw leaves the elbow at an angle and stops
 * in mid-air short of the wall instead of entering it. Shared so the elbow and
 * the duct cannot drift apart.
 */
const VENT = new THREE.Vector3(-0.1, 1.28, -0.5);

const BAY_W = m(BAY_W_PX);
const BAY_D = m(BAY_D_PX);

/**
 * Everything already hanging on this room's frontage, as sim-px spans measured
 * from the doorway centre, **along the corridor in world x**.
 *
 * The bay has to stand clear of all of it, and not by eye: a near-row room's
 * signage hangs on the room side of the corridor wall, facing the camera, so
 * anything of mine within about 2 m in front of it does not merely sit near the
 * numeral — it stands in the sight line to it, which
 * `tests/venue.smoke.test.ts` asserts is clear for all eight Zaal panels. The
 * first cut of this file put the bay 40 px to the left of the door and **failed
 * that test on zaal 6**, the one room whose numeral hangs on that side
 * (`zaalSignSide()` flips it there because room 7's would otherwise land in the
 * main staircase). Reading the spans out of `signage.ts`'s own exported
 * positions rather than guessing a side is what makes that unable to come back.
 */
function frontageSpans(r: RoomDef): Array<[number, number]> {
  const cx = roomDoor(r).cx;
  const spans: Array<[number, number]> = [[-DOOR / 2, DOOR / 2]];
  if (r.closed) {
    // The "cinema · closed tonight" plate: 1.2 m wide, hung at cx + 36 px.
    spans.push([27, 45]);
    return spans;
  }
  const n = Number(r.n);
  // The orange numeral panel's body is 2.1 m + 4 px wide; the backlit poster box
  // across the door from it is 18 px; the talk strip is 3.2 m on the door centre.
  spans.push([zaalSignX(n) - cx - 16, zaalSignX(n) - cx + 16]);
  spans.push([zaalPosterX(n) - cx - 10, zaalPosterX(n) - cx + 10]);
  spans.push([-21, 21]);
  return spans;
}

/**
 * How far along the corridor, in world +x from the doorway centre, the bay sits.
 *
 * **Always +x, and that is a legibility decision, not a tidiness one.** The
 * machine has to toe in at the screen, so the side it sits on fixes its yaw, and
 * the yaw is what decides whether the reels — the part that says "projector" —
 * are seen or are edge-on. With the camera looking along (0.21, 0.50, 0.84), a
 * reel face on the machine's +x side has normal `(cos a, 0, -sin a)` for yaw
 * `a`, so its dot with the camera goes 0.21 at a = 0, **0.03 at a = +12 deg**
 * (invisible: this is what the first cut did, and the reels rendered as bars)
 * and **0.38 at a = -12 deg**. A bay on +x is the one that yaws the machine
 * negative. It is clamped to stay inside the room.
 */
function bayOffsetPx(r: RoomDef): number {
  /*
   * Standing beside the numeral is not the same as being out of its way.
   *
   * The camera is yawed `DIORAMA_AZIMUTH_RAD` off the plan axis, so a sight line
   * leaving a sign travels `tan(14 deg)` = 0.25 m along the corridor for every
   * metre it travels toward the camera, at every pitch. The bay reaches
   * `BAY_D` in front of the frontage, so a sight line that starts level with its
   * near edge has drifted a third of a metre sideways by the time it gets
   * there. Clearing the panel's edge alone is not enough, and this is exactly
   * what failed zaal 3 on the second try: the bay was 2 px clear of the panel in
   * plan and still 30 cm inside its sight line.
   */
  const drift = Math.tan(DIORAMA_AZIMUTH_RAD) * (BAY_D_PX + 4);
  const want = Math.max(...frontageSpans(r).map(([, hi]) => hi)) + drift + BAY_W_PX / 2 + BAY_CLEAR_PX;
  // Never outside the room it belongs to; the far row's signage hangs on the
  // corridor face, in front of its bay, so a clamp there costs nothing.
  return Math.min(want, r.w / 2 - BAY_W_PX / 2 - 1);
}

/** A box placed by its centre, in the bay's local frame. */
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.MeshStandardMaterial,
  radius = 0,
): THREE.Mesh {
  const geo = radius > 0 ? roundedBox(w, h, d, radius) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A cylinder along an axis, placed by its centre. */
function tube(
  radiusTop: number,
  radiusBottom: number,
  length: number,
  axis: 'x' | 'y' | 'z',
  x: number,
  y: number,
  z: number,
  mat: THREE.MeshStandardMaterial,
  segments = 16,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments), mat);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ----------------------------------------------------------- the machine */

/**
 * The projector itself, built about its own origin: `y = 0` is the deck it
 * stands on, `+z` is the way the lens looks, `+x` is the side the reels are on.
 *
 * ## The angle it is actually seen from, which decides the modelling
 *
 * The diorama camera looks along (0.21, 0.50, 0.84): 14 degrees off the plan's
 * z axis and 30 degrees above the floor. The machine looks at the screen, which
 * in a near-row house is on the camera's side — so **the player sees it close to
 * head-on down its own barrel**, about 30 degrees off, and its reels, whose
 * plane contains the optical axis, are seen 20 degrees from edge-on.
 *
 * That is not a defect to design around, it is the fact to design *for*:
 *
 *  - the reels are built as reels rather than as discs — a dark wound web, three
 *    spokes, a hub and a **bright steel rim**. An edge-on disc is a bar; a rim is
 *    a circle from any angle, and the two circles are what say "projector";
 *  - the front carries the weight: a stepped barrel, a brass focus ring and a
 *    flange, so head-on the machine reads as a bullseye rather than as a face;
 *  - the mass is pale (`mullion`, `chafingSteel`) against near-black auditorium
 *    walls. In every chapter the venue is dim and unlit geometry goes to black,
 *    so contrast, not colour, is what makes this legible.
 */
function machine(p: VenuePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'projector-machine';

  // The pedestal. Squat and dark, so the machine reads as standing on something.
  g.add(box(1.1, 0.3, 0.86, 0, 0.15, -0.05, p.rackMetal, 0.04));
  g.add(box(1.18, 0.04, 0.94, 0, 0.32, -0.05, p.blackMetal));

  // The head: the mechanism, gate and sound head, with a darker access door on
  // the camera side and a pair of handwheels.
  g.add(box(0.56, 0.64, 0.62, 0, 0.66, 0.16, p.sectionCut, 0.05));
  g.add(box(0.03, 0.46, 0.44, 0.29, 0.66, 0.16, p.rackMetal));
  for (const [y, z] of [
    [0.52, 0.34],
    [0.84, 0.02],
  ]) {
    const wheel = new THREE.Mesh(puck(0.075, 0.03, 14), p.chafingSteel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0.32, y, z);
    wheel.castShadow = true;
    g.add(wheel);
  }

  // The lamphouse behind it, its rear door, its side vents and its pilot lamp.
  g.add(box(0.52, 0.58, 0.66, 0, 0.63, -0.5, p.sectionCut, 0.06));
  g.add(box(0.44, 0.44, 0.03, 0, 0.63, -0.84, p.rackMetal));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.02, 0.05, 0.46, 0.27, 0.46 + i * 0.1, -0.5, p.blackMetal));
  }
  const pilot = new THREE.Mesh(puck(0.045, 0.02, 12), p.rackLed);
  pilot.rotation.z = Math.PI / 2;
  pilot.position.set(0.27, 0.85, -0.3);
  g.add(pilot);

  // The cooling stack: up off the lamphouse, an elbow, and a duct back into the
  // booth wall. A xenon lamphouse that vents nowhere is the detail that gives a
  // modelled projector away — and a vertical pipe is the one part of this that
  // reads from every angle the camera has.
  g.add(tube(0.085, 0.085, 0.36, 'y', -0.1, 1.1, -0.5, p.concrete, 14));
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 8), p.concrete);
  elbow.position.copy(VENT);
  elbow.castShadow = true;
  g.add(elbow);

  // The lens: a mount flange, a stepped barrel, a brass focus ring and dead glass.
  g.add(box(0.34, 0.34, 0.05, 0, 0.62, 0.48, p.rackMetal, 0.02));
  g.add(tube(0.12, 0.13, 0.24, 'z', 0, 0.62, 0.6, p.concrete, 20));
  g.add(tube(0.095, 0.105, 0.18, 'z', 0, 0.62, 0.79, p.concrete, 20));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 8, 22), p.brass);
  ring.position.set(0, 0.62, 0.73);
  ring.castShadow = true;
  g.add(ring);
  const front = new THREE.Mesh(new THREE.CircleGeometry(0.092, 18), p.blackMetal);
  front.position.set(0, 0.62, 0.881);
  g.add(front);

  /*
   * Feed above, take-up below, on one spindle arm.
   *
   * At play zoom the body is a 25-px lump and these are what carry the read, so
   * they are full reels — 0.52 m across, about 22 px — and each is four parts: a
   * dark wound web, a bright rim, three spokes and a hub. The pair is stacked
   * with 2 cm to spare between them and 2 cm over the pedestal: reels that clip
   * through each other are what a modelled machine must not do.
   */
  g.add(box(0.07, 1.0, 0.12, 0.3, 0.84, -0.05, p.blackMetal));
  for (const y of [1.12, 0.58]) {
    const web = new THREE.Mesh(puck(0.22, 0.075, 22), p.rackMetal);
    web.rotation.z = Math.PI / 2;
    web.position.set(0.41, y, -0.05);
    web.castShadow = true;
    web.receiveShadow = true;
    g.add(web);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 8, 26), p.concrete);
    rim.rotation.y = Math.PI / 2;
    rim.position.set(0.41, y, -0.05);
    rim.castShadow = true;
    g.add(rim);
    for (let s = 0; s < 3; s++) {
      const a = (s * Math.PI * 2) / 3 + 0.4;
      const spoke = box(0.03, 0.5, 0.05, 0.41, y, -0.05, p.concrete);
      spoke.rotation.x = a;
      g.add(spoke);
    }
    const hub = new THREE.Mesh(puck(0.07, 0.12, 12), p.concrete);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(0.44, y, -0.05);
    g.add(hub);
    g.add(tube(0.022, 0.022, 0.2, 'x', 0.34, y, -0.05, p.mullion, 8));
  }
  return g;
}

/* ------------------------------------------------------------ the whole bay */

/**
 * The booth over one auditorium's door, or `null` for a room with no doorway of
 * its own.
 *
 * The returned group is in world space (metres) and is parented by the caller
 * into the room it belongs to.
 */
export function projectionBooth(r: RoomDef, p: VenuePalette): THREE.Group | null {
  const door = roomDoor(r);
  const near = r.side > 0;
  const deck = near ? DECK_NEAR : DECK_FAR;
  // The face of the rear wall the bay hangs off, and the head of what carries it.
  const wallFaceY = near ? CY1 + T : CY0 - T;
  const carryTop = near ? NEAR_CUT_H + NEAR_CAP_T : WALL_H;

  const g = new THREE.Group();
  g.name = `projector-${r.n}`;
  g.position.set(m(door.cx), 0, m(wallFaceY));
  // Local +z points into the room, whichever row the room is on.
  if (!near) g.rotation.y = Math.PI;

  /*
   * Everything below is in the bay's local frame: x across the wall, z into the
   * room, y off the storey floor.
   *
   * The far row's group is turned through 180 degrees, so its local +x is world
   * -x: the offset is negated for it, which puts every booth in the building on
   * the same side of its own door as seen from the corridor.
   */
  const bay = new THREE.Group();
  bay.name = 'projection-room';
  const bayX = (near ? 1 : -1) * m(bayOffsetPx(r));
  bay.position.x = bayX;
  g.add(bay);

  // The deck, its pale cut edge, and the brackets carrying it off the wall head.
  bay.add(box(BAY_W, DECK_T, BAY_D + 0.2, 0, deck - DECK_T / 2, BAY_D / 2 - 0.1, p.corridorColumn));
  bay.add(box(BAY_W + 0.06, 0.05, 0.06, 0, deck - DECK_T - 0.02, BAY_D, p.sectionCut));
  /*
   * The booth's standby strip, under the front edge of the deck.
   *
   * Same rule the sponsor stands are built on (`boothStandby` in
   * `materials.ts`): every chapter here is a blackout or near it, and anything
   * whose only readable state is "brightly lit" is invisible for the whole of
   * one. This is a switched socket, not a light — it puts a 2 m line under the
   * booth so the player can see there is something up there, and the machine
   * itself still only comes out of the dark when a robot's lamp finds it.
   */
  bay.add(box(BAY_W - 0.3, 0.05, 0.05, 0, deck - DECK_T - 0.03, BAY_D - 0.04, p.boothStandby));
  if (deck - DECK_T > carryTop + 0.05) {
    const rise = deck - DECK_T - carryTop;
    for (const sx of [-0.9, 0.9]) {
      bay.add(box(0.14, rise, 0.24, sx, carryTop + rise / 2, 0.12, p.blackMetal));
      // A diagonal strut, so the deck is carried rather than glued to the wall.
      const dz = BAY_D * 0.62;
      const dy = rise - 0.18;
      const strut = box(0.09, 0.09, Math.hypot(dz, dy), sx, carryTop + 0.18 + dy / 2, dz / 2 + 0.12, p.blackMetal);
      strut.rotation.x = -Math.atan2(dy, dz);
      bay.add(strut);
    }
  }

  /*
   * The port wall, and the two windows in it.
   *
   * A booth is a room with a projection port and a smaller viewing port beside
   * it, and cutting the ports as GAPS between three pieces of wall — rather than
   * painting them on — is what makes the lens read as looking *through*
   * something. The lens sits 3 cm behind the projection glass, where it does in
   * a real booth.
   */
  const portY = deck + PORT_H / 2;
  for (const [x0, x1] of [
    [-1.2, -0.45],
    [0.45, 0.62],
    [0.95, 1.2],
  ]) {
    const w = x1 - x0;
    bay.add(box(w, PORT_H, PORT_T, (x0 + x1) / 2, portY, PORT_Z, p.corridorColumn));
    bay.add(box(w + 0.04, 0.05, PORT_T + 0.04, (x0 + x1) / 2, deck + PORT_H + 0.02, PORT_Z, p.sectionCut));
  }
  for (const [x0, x1, h] of [
    [-0.45, 0.45, PORT_H - 0.1],
    [0.62, 0.95, PORT_H - 0.3],
  ]) {
    const glass = box(x1 - x0, h, 0.02, (x0 + x1) / 2, deck + h / 2 + 0.05, PORT_Z, p.glassPane);
    glass.castShadow = false;
    bay.add(glass);
  }

  /*
   * Cable runs. Conduit down the wall to the deck, a tray along the wall behind
   * the machine, and one slack feed cable sagging from the plinth into it —
   * built as a tube along a curve, because a cable drawn as a straight stick is
   * the thing that says "primitive" loudest.
   */
  bay.add(box(BAY_W - 0.5, 0.09, 0.1, 0, deck + 0.14, 0.1, p.blackMetal));
  for (const sx of [-0.62, 0.62]) {
    bay.add(tube(0.04, 0.04, deck + 0.14 - carryTop, 'y', sx, (deck + 0.14 + carryTop) / 2, 0.06, p.blackMetal, 10));
  }
  const sag = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, deck + 0.14, 0.12),
    new THREE.Vector3(-0.54, deck + 0.03, 0.28),
    new THREE.Vector3(-0.4, deck + 0.1, MACHINE_Z - 0.46),
  ]);
  bay.add(new THREE.Mesh(new THREE.TubeGeometry(sag, 14, 0.028, 7, false), p.blackMetal));

  /*
   * The rewind bench, with a film can on it, and a second can leaning on the
   * port wall.
   *
   * Cheap — a top, two legs and two cylinders — and it is what turns a shelf
   * with a machine on it into a room somebody worked in. It stands on the +x
   * half of the deck, which the machine leaves empty and which is the half
   * turned toward the camera.
   */
  bay.add(box(0.62, 0.05, 0.44, 0.92, deck + 0.7, 0.98, p.sectionCut));
  for (const lz of [0.8, 1.16]) {
    bay.add(box(0.05, 0.7, 0.05, 0.66, deck + 0.35, lz, p.blackMetal));
    bay.add(box(0.05, 0.7, 0.05, 1.18, deck + 0.35, lz, p.blackMetal));
  }
  const canFlat = new THREE.Mesh(puck(0.24, 0.07, 18), p.concrete);
  canFlat.position.set(0.92, deck + 0.76, 0.98);
  canFlat.castShadow = true;
  bay.add(canFlat);
  const canLeaning = new THREE.Mesh(puck(0.3, 0.07, 18), p.concrete);
  canLeaning.rotation.set(Math.PI / 2 - 0.22, 0, 0);
  canLeaning.position.set(-0.85, deck + 0.3, PORT_Z - 0.2);
  canLeaning.castShadow = true;
  bay.add(canLeaning);

  /*
   * The machine, raked down and toed in at the screen.
   *
   * Both angles are measured off the room the booth is in, not typed: the toe-in
   * is the angle from the bay to the centre of `roomScreen(r)`, so a booth in a
   * deep room points straighter than one in a shallow room, exactly as it would
   * if somebody had aimed it.
   */
  const screen = roomScreen(r);
  const throwM = Math.abs(m(screen.y + screen.h / 2) - m(wallFaceY)) - MACHINE_Z;
  const mach = machine(p);
  mach.position.set(0, deck, MACHINE_Z);
  // Negative when the bay is at local +x: the lens swings back toward the middle
  // of the house, which is also the yaw that turns the reels toward the camera.
  mach.rotation.y = -Math.atan2(bayX, Math.max(throwM, 1));
  mach.rotation.x = RAKE_RAD;
  bay.add(mach);

  // The extract duct, from wherever the yaw has put the stack's elbow straight
  // back into the wall. See `VENT`.
  mach.updateMatrix();
  const vent = VENT.clone().applyMatrix4(mach.matrix);
  bay.add(tube(0.085, 0.085, Math.max(vent.z, 0.1), 'z', vent.x, vent.y, vent.z / 2, p.concrete, 14));

  return g;
}
