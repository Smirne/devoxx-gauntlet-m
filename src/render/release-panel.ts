/**
 * release-panel.ts — where chapter 1's door override is DRAWN.
 *
 * ## Why this is its own module
 *
 * Michele, with a screenshot of the mount beat in chapter 1: **"the part that
 * needs a shape is the green Cube that opens the door"**. He was looking at
 * `PROPS['projector-panel'] = { h: 0.9, color: 0x39414f, tl: true, lift: 2.5,
 * glow: 0x6b4406 }` drawn by the generic `drawProp` — one cuboid, 1.6 m along
 * the corridor by 1.92 m deep by 0.9 m tall, hanging at 2.5 m with a flat amber
 * lid on `idle` and a flat green one on `done`. It is the payoff of the whole
 * climb: Droid goes up on Biggy's shoulders to press *this*, and until now
 * "this" was a lit box with no front, no control and no reason to be there.
 *
 * (`src/render/venue/projector.ts`'s header used to assert that this prop "is
 * the door override, a different object, and it already has one" — a shape, that
 * is. It did not. That sentence is corrected in the same change as this file.)
 *
 * So the override stops being a table entry, the way the fire door, the roller
 * door, the cinema doors and the keypad did before it. Same contract as
 * `src/render/keypad.ts`: the sim owns the rect and `Prop.state`, and this
 * module owns nothing but what those look like.
 *
 * ## What it is, in fiction
 *
 * A **manual door release and house-lights override** for cinema B, up at the
 * level the projection booth's services run at: a back plate held off its
 * mounting plane on standoffs, a hooded housing on it, a pull lever that stands
 * up once it has been pulled, a mushroom release under a guard ring, a key
 * switch that is the reason a passing robot cannot just flip it, an engraved
 * Dutch plate, and a lamp that goes from held to released. Conduit along the top
 * and two hanger rods up into the corridor vault, so it belongs to the building
 * rather than floating in front of it.
 *
 * ## Which way it faces, and why that is not a choice
 *
 * The same rule `keypad.ts` and `signage.ts` are built on: the diorama camera is
 * fixed on the +z side of the plan (`src/render/camera.ts`), so at chapter 1's
 * 30 deg pitch it looks along (0.210, 0.500, 0.840). A +z face is nearly square
 * on; a +x face is 12 deg off grazing; a -x face is drawn from behind. The
 * unit's readable front therefore always looks +z, and every control goes on it.
 *
 * **The 0.500 in the middle of that vector is the whole diagnosis of the green
 * cube.** Of the three faces the camera can see on the published rect, the
 * projected areas are 1.44 x 0.840 = 1.21 m2 of front, 1.73 x 0.210 = 0.36 m2 of
 * end, and **3.07 x 0.500 = 1.54 m2 of LID** — the largest thing on screen was
 * the top of the box, because the box is deeper than it is wide. Two answers,
 * and both are here: the housing is 0.24 m deep instead of 1.92 m so there is
 * hardly any lid left, and what lid there is is a raked hood with an overhang
 * and a shadow line under it rather than a flat plate.
 *
 * ## Why it hangs out in the corridor instead of against the wall
 *
 * Because it has to, and this is measured rather than assumed. `floor1.ts`
 * springs the corridor vault off the far wall head at 2.95 m and rakes it up at
 * 0.75 rad, faster than any chapter's sight line climbs — which is why
 * `signage.ts` caps the far wall's readable band at `FAR_Y1 = 2.6 m`. A unit at
 * 2.5..3.4 m hard against `CY0` is behind that soffit and cannot be seen at all.
 * Out where the sim puts it the soffit has climbed to 3.55 m and the unit is in
 * clear air under it. So the rect's **distance from the wall is right and its
 * depth is wrong**; see `scratchpad/panel-round/panel-rect.patch` for the
 * measurement and the proposed cut, which is a sim change and therefore not
 * applied here.
 *
 * ## And why it does not sit at the back of its own rect either
 *
 * Because two corridor columns are standing there. `corridorColumns()` puts full
 * 3.3 m shafts on the far side of the corridor at every room edge, and cinema B
 * and C's meet at **sim x 365..385, y 288..304** — dead in front of the rect's
 * back half. The published box got away with it by being 1.92 m deep: its lid
 * stuck out past the columns, which is *why* the lid was what the player saw.
 * Model the unit at the honest depth and put it at the rect's rear and the
 * columns swallow 70% of it — measured in the running build, magenta-face probe,
 * `scratchpad/panel-round/dbg-close.png`.
 *
 * So `mountZ` below slides the unit forward INSIDE its own rect until it is
 * clear of any column standing in its x range, and no further. That is the same
 * move `venue/projector.ts` makes with `bayOffsetPx` — a drawing position
 * computed from the geometry it has to stand clear of, rather than chosen — and
 * it changes nothing the sim owns: the rect, the collider and `PANEL_REACH` are
 * exactly as published. When the rect is patched to the depth the unit actually
 * has, this clamp finds nothing to dodge and the unit sits where the rect says.
 *
 * This module reads the rect rather than assuming any version of it, so it is
 * correct before and after: the plate goes as far BACK in the rect as the
 * building allows, and the housing stands proud of it toward the camera.
 *
 * ## The two things this repo has already learned, applied
 *
 *  - **A lit face on an unlit body floats.** The Zaal panel read as "a plain
 *    orange quadrilateral floating on a dark wall" until the body was lit to
 *    match the face. So the plate and the housing carry their own faint
 *    emissive, not just the lamp.
 *  - **The thing you are looking FOR is idle by definition, and chapter 1 is a
 *    blackout.** `projector-panel`, `terminal` and `keypad` all carry a standby
 *    glow for that reason; Michele filed *"there should be something visible"*
 *    against this very prop. The trim keeps its amber standby and the lamp is
 *    lit in both states — red held, green released — so the unit is findable
 *    before it is solved and still changes when it is.
 */

import * as THREE from 'three';

import type { Prop } from '../sim/types';
import { m } from '../sim/units';
import { corridorColumns } from '../sim/geometry';
import { puck, roundedBox } from './robots/rig';
import { corridorSoffit, corridorSoffitY } from './venue/floor1';
import { SignPainter, type Paint } from './venue/signage';

/* ------------------------------------------------------------------ layout */

/**
 * Metres off the corridor floor to the bottom of the unit, and its overall
 * height — the two numbers `PROPS` in `src/render/scene.ts` and `PROP_DRAW` in
 * `tests/prop-geometry.ts` describe the prop with.
 *
 * They are exported rather than retyped in either place, the way `KEYPAD_TOP_M`
 * and `SEAT_TOP_M` already are, so the table and the model cannot drift apart.
 * Both keep the values the table already had: the collider sweep's question is
 * which floor cells a drawn solid stands in, `lift` puts this one a metre and a
 * half over Droid's head either way, and nothing about the beat moves.
 */
export const PANEL_LIFT_M = 2.5;
export const PANEL_H_M = 0.9;

/** Shadow gap between the mounting plane and the back of the plate. */
const PLATE_GAP = 0.06;
/** The back plate's own thickness. */
const PLATE_T = 0.05;
/** Margin between the housing and the ends of the plate. */
const CASE_INSET = 0.11;
/** How far the housing stands proud of the plate's front face. */
const CASE_D = 0.24;

/** The housing's band, absolute metres. See `CONTROL_Y` for why it sits high. */
const CASE_Y0 = PANEL_LIFT_M + 0.12;
const CASE_Y1 = PANEL_LIFT_M + 0.78;
/**
 * The drip sill under the housing, and the hood over it.
 *
 * Both are DEEP-dark and edged with a bright lip rather than being bright
 * themselves, and both are kept shallow, because of the 0.500 in the camera
 * vector: a hood is a horizontal surface, the camera sees half of its area, and
 * the first cut of this file made it 0.36 m deep in polished trim with a standby
 * glow on it. Photographed at play zoom it was a gold awning with a dark box
 * under it — the green cube's own mistake, one tenth the size. The rule this
 * file works to is that the brightest thing on the unit is its FACE.
 */
const SILL_H = 0.04;
const HOOD_H = 0.055;
const HOOD_OVER = 0.03;
/** The bright lip along the front edge of each, which is all the shine they get. */
const LIP_H = 0.018;

/**
 * Where the controls sit, absolute metres — and this is the one number in the
 * file that answers a gameplay question rather than a drawing one.
 *
 * Measured off the rigs, not guessed: Droid's shoulder is at 1.697 m and his arm
 * is 0.95 m of it, so his hand tops out about **2.80 m** above whatever he is
 * standing on. Mounted, `scene.ts` lifts him by Biggy's crown less his own
 * pelvis — **0.30 m** — so on Biggy's shoulders he reaches about **3.10 m**.
 * That 0.30 m is the entire physical difference the mount buys, and it is the
 * gap the beat lives in: controls at 3.05..3.15 m are inside a mounted Droid's
 * reach and outside a standing one's, which is what the chapter's own dialogue
 * claims (*"about a metre above my reach. I need height"* — the metre is
 * rhetoric, the sign of it is not).
 *
 * Putting them at the TOP of the unit rather than its middle is therefore not a
 * composition choice. The rect's own band starts at 2.5 m, which a standing
 * Droid can already touch.
 */
const CONTROL_Y = PANEL_LIFT_M + 0.6;
/** The key switch sits a little under the rest: it is not a thing you hit. */
const KEY_Y = PANEL_LIFT_M + 0.55;
/** The lamp, above the controls where a lamp goes, with its legend under it. */
const LAMP_Y = PANEL_LIFT_M + 0.68;
const LAMP_R = 0.05;
/** The engraved plate, along the bottom of the housing. */
const LABEL_Y0 = PANEL_LIFT_M + 0.18;
const LABEL_H = 0.19;

/** Cable tray along the top of the plate, the drop into it, and the hanger rods. */
const CONDUIT_R = 0.032;
const TRAY_Y = PANEL_LIFT_M + PANEL_H_M - 0.055;
const HANGER_R = 0.022;
/** How far a hanger climbs when there is no vault anywhere to reach for. */
const HANGER_STUB = 0.26;
/** And the longest stay it will draw, so a stray rect cannot grow a mast. */
const HANGER_MAX = 1.6;

/* --------------------------------------------------------------------- art */

const HELD = 0xd8452f;
const RELEASED = 0x35d17a;

/**
 * The engraved instruction plate. Dutch, because the building is — the keypad
 * next door says `NOODDEUR · CODE` and this is the same maintenance alphabet.
 *
 * Two lines, not one: the top line is what the control does and the bottom is
 * which house it does it to, which is the only thing on the unit that ties it to
 * the door three metres to its left. At play zoom the plate is about 90 x 12
 * screen px, so the top line is legible and the bottom line is texture — which
 * is the right way round, and the reason the room letter is not on top.
 */
const platePaint: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#1c212a';
  ctx.fillRect(0, 0, w, h);
  // An engraved plate is a shallow tray: a light top edge and a dark bottom one.
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, 0, w, Math.max(2, h * 0.06));
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, h - Math.max(2, h * 0.06), w, Math.max(2, h * 0.06));

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  // Fitted, not sized by eye: the first cut typed `DEURONTGRENDELING` at 0.4h
  // and it ran straight through the hazard flash on the end of the plate. The
  // engraving room is w*0.045 .. w*0.76, and the type shrinks to suit.
  const fit = (text: string, weight: number, size: number, y: number, colour: string): void => {
    const room = w * 0.715;
    ctx.fillStyle = colour;
    let px = Math.round(h * size);
    for (let i = 0; i < 12; i++) {
      ctx.font = `${weight} ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      if (ctx.measureText(text).width <= room || px <= 6) break;
      px -= 1;
    }
    ctx.fillText(text, w * 0.045, y);
  };
  fit('DEURONTGRENDELING', 700, 0.36, h * 0.33, '#e6ebf2');
  fit('ZAAL B · ZAALVERLICHTING', 600, 0.24, h * 0.72, '#93a0b0');

  // The hazard flash on the right-hand end: the one bit of colour on the plate,
  // and what says "this is not a light switch" from further away than the text.
  const bx = w * 0.79;
  ctx.fillStyle = '#c8a01c';
  ctx.fillRect(bx, h * 0.14, w * 0.17, h * 0.72);
  ctx.fillStyle = '#14171c';
  for (let i = -3; i < 7; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, h * 0.14, w * 0.17, h * 0.72);
    ctx.clip();
    ctx.translate(bx + (i * w * 0.17) / 4, h * 0.14);
    ctx.transform(1, 0, -0.45, 1, 0, 0);
    ctx.fillRect(0, 0, (w * 0.17) / 8, h * 0.72);
    ctx.restore();
  }
};

/** The little legend under the lamp: what the two colours mean. */
const lampLegend: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#12161c';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8c98a7';
  ctx.font = `700 ${Math.round(h * 0.62)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillText('VERGRENDELD', w / 2, h * 0.55);
};

/** And what it says once the lock has let go. */
const lampLegendDone: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#12161c';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9fc8ac';
  ctx.font = `700 ${Math.round(h * 0.62)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillText('ONTGRENDELD', w / 2, h * 0.55);
};

/* ----------------------------------------------------------------- the model */

export interface ReleasePanelModel {
  /** Parent this into the scene once; `pose` moves it. */
  root: THREE.Group;
  /**
   * Put the unit where this frame's prop says it is, and show what it says.
   * `base` is the floor height under the prop, in metres.
   */
  pose(p: Prop, base: number): void;
  dispose(): void;
}

/** The rect, in world metres: where its readable front is and how wide it is. */
function unitFrame(p: Prop): { cx: number; frontZ: number; backZ: number; width: number; depth: number } {
  const w = m(p.w ?? 20);
  const d = m(p.h ?? 24);
  const backZ = m(p.y ?? 0);
  return { cx: m(p.x ?? 0) + w / 2, frontZ: backZ + d, backZ, width: w, depth: d };
}

/**
 * How far back in its own rect the unit can stand, in world metres.
 *
 * The rect's rear plane, unless a corridor column is standing in front of it in
 * the unit's own x range — in which case the first plane clear of that column,
 * clamped so the unit never leaves the rect. See the module header.
 */
function mountZ(u: { cx: number; backZ: number; frontZ: number; width: number }, depth: number): number {
  const x0 = u.cx - u.width / 2;
  const x1 = u.cx + u.width / 2;
  let z = u.backZ;
  for (const c of corridorColumns().far) {
    const cx0 = m(c.x);
    const cx1 = m(c.x + c.w);
    if (cx1 <= x0 || cx0 >= x1) continue;
    const far = m(c.y + c.h);
    if (far > z && m(c.y) < u.frontZ) z = far + 0.02;
  }
  // Never out of the rect: a rect too shallow to dodge the column is a rect
  // that needs patching, not a renderer that draws outside the sim.
  return Math.min(z, Math.max(u.backZ, u.frontZ - depth));
}

const box = (mat: THREE.Material, radius = 0): THREE.Mesh => {
  const geo = radius > 0 ? roundedBox(1, 1, 1, radius) : new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/**
 * Build the override once. Pose it every frame from the chapter's own prop.
 *
 * It owns its canvas painter rather than borrowing the venue's, because it is a
 * chapter prop and the venue is torn down on its own schedule; `dispose()` here
 * releases every texture it baked.
 */
export function buildReleasePanel(): ReleasePanelModel {
  const painter = new SignPainter();
  const root = new THREE.Group();
  root.name = 'release-panel-live';

  const plateMat = new THREE.MeshStandardMaterial({ name: 'release/plate', color: 0x272d37, roughness: 0.72, metalness: 0.18 });
  const shell = new THREE.MeshStandardMaterial({ name: 'release/shell', color: 0x39414f, roughness: 0.5, metalness: 0.34 });
  /** The face the controls are on: the lightest surface on the unit, on purpose. */
  const face = new THREE.MeshStandardMaterial({ name: 'release/face', color: 0x5c6675, roughness: 0.58, metalness: 0.2 });
  const trim = new THREE.MeshStandardMaterial({ name: 'release/trim', color: 0xa9b0bb, roughness: 0.3, metalness: 0.76 });
  const dark = new THREE.MeshStandardMaterial({ name: 'release/dark', color: 0x0b0d11, roughness: 1 });
  const hazard = new THREE.MeshStandardMaterial({ name: 'release/hazard', color: 0xc03a26, roughness: 0.42, metalness: 0.1 });
  const brass = new THREE.MeshStandardMaterial({ name: 'release/brass', color: 0xb08d3a, roughness: 0.34, metalness: 0.8 });
  /*
   * The stays get their own steel rather than sharing the bezels' trim.
   *
   * Trim carries the unit's amber standby, and on two 1.2 m rods that reads as
   * brass: in the first in-game frame of this the stays were the brightest thing
   * in the shot and the panel hung off two gold poles. They are structure, not
   * indication, so they are pale and cold and glow only enough to be found.
   */
  const stay = new THREE.MeshStandardMaterial({ name: 'release/stay', color: 0x8a919c, roughness: 0.38, metalness: 0.7 });
  stay.emissive = new THREE.Color(0x161b22);
  stay.emissiveIntensity = 1;
  const lampMat = new THREE.MeshStandardMaterial({ name: 'release/lamp', color: 0x2a2f38, roughness: 0.4 });
  lampMat.emissive = new THREE.Color(HELD);
  lampMat.emissiveIntensity = 1.5;
  lampMat.toneMapped = false;

  /*
   * THE BODY IS LIT, NOT JUST THE LAMP.
   *
   * `docs/genai-notes.md` records the Zaal panel reading as "a plain orange
   * quadrilateral floating on a dark wall" for exactly one reason: its face was
   * emissive and its body was not, so there was nothing for the face to be the
   * face OF. This unit hangs in a blacked-out corridor 2.5 m up with no wall
   * behind it, which is the worst case of that, so the plate and the housing
   * carry their own dim emissive and the trim carries the amber standby a
   * powered lock is entitled to. Nothing here illuminates anything; it only
   * stops the unit being a hole in the frame until a robot's lamp finds it.
   */
  plateMat.emissive = new THREE.Color(0x0d1117);
  plateMat.emissiveIntensity = 1;
  shell.emissive = new THREE.Color(0x151b24);
  shell.emissiveIntensity = 1;
  face.emissive = new THREE.Color(0x2b333f);
  face.emissiveIntensity = 1;
  trim.emissive = new THREE.Color(0x4a3a18);
  trim.emissiveIntensity = 0.6;
  hazard.emissive = new THREE.Color(0x2a0c06);
  hazard.emissiveIntensity = 1;

  const owned: THREE.Material[] = [plateMat, shell, face, trim, dark, hazard, brass, stay, lampMat];

  const backPlate = box(plateMat);
  /** Four standoffs, so the plate is held off its mounting plane and casts a gap. */
  const pads = [box(dark), box(dark), box(dark), box(dark)];
  const housing = box(shell, 0.04);
  /** The face plate the controls are screwed to — the unit's one light surface. */
  const facePlate = box(face);
  const sill = box(shell);
  const hood = box(shell);
  /** One bright lip along the front edge of the hood and of the sill. */
  const hoodLip = box(trim);
  const sillLip = box(trim);
  /** The hood's own shadow line: a dark reveal tucked under the overhang. */
  const reveal = box(dark);

  // The mushroom release, under its guard ring: dome, collar, ring.
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.018, 8, 22), trim);
  const collar = new THREE.Mesh(puck(0.075, 0.03, 18), dark);
  collar.rotation.x = Math.PI / 2;
  const mushroom = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hazard);
  mushroom.rotation.x = Math.PI / 2;

  // The pull lever, on its quadrant. `leverPivot` swings with `Prop.state`.
  const quadrant = box(dark);
  const leverPivot = new THREE.Group();
  const leverArm = box(trim);
  const leverKnob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), hazard);
  leverPivot.add(leverArm, leverKnob);

  // The key switch: a brass barrel with a bar across it, turned when released.
  const keyBezel = new THREE.Mesh(puck(0.055, 0.022, 16), trim);
  keyBezel.rotation.x = Math.PI / 2;
  const keyBarrel = new THREE.Mesh(puck(0.036, 0.03, 14), brass);
  keyBarrel.rotation.x = Math.PI / 2;
  const keyBar = box(dark);

  // The lamp: a bezel, a lens, and a legend plate under it.
  const lampBezel = new THREE.Mesh(new THREE.TorusGeometry(LAMP_R + 0.016, 0.014, 8, 20), trim);
  const lens = new THREE.Mesh(puck(LAMP_R, 0.026, 18), lampMat);
  lens.rotation.x = Math.PI / 2;
  const legend = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMat);

  const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMat);

  /*
   * The services: a tray along the top of the plate on two saddles, a conduit
   * dropping into it from above, a junction box where the two meet, and the two
   * rods that hang the whole unit off the corridor vault.
   *
   * Every one of these is a unit cylinder scaled on all three axes rather than a
   * cylinder built at its own radius and then scaled again — which is what the
   * first cut did, and it made the conduit a 1.2 mm wire. A thing that is
   * invisible in the render and present in the scene graph is the worst of both.
   */
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), dark);
  tray.rotation.z = Math.PI / 2;
  const saddles = [box(trim), box(trim)];
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), dark);
  const junction = box(shell, 0.02);
  const hangers = [
    new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), stay),
    new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), stay),
  ];

  root.add(
    backPlate,
    ...pads,
    housing,
    facePlate,
    sill,
    hood,
    hoodLip,
    sillLip,
    reveal,
    quadrant,
    leverPivot,
    guard,
    collar,
    mushroom,
    keyBezel,
    keyBarrel,
    keyBar,
    lampBezel,
    lens,
    legend,
    label,
    tray,
    ...saddles,
    drop,
    junction,
    ...hangers,
  );
  for (const o of root.children) o.castShadow = true;

  function pose(p: Prop, base: number): void {
    const u = unitFrame(p);
    const done = p.state === 'done';

    /*
     * The plate goes on the rect's REAR plane and the housing stands proud of it
     * toward the camera, whatever the rect's depth is. A rect deeper than the
     * unit therefore leaves its slack BEHIND — between the unit and the wall,
     * where the patch under `scratchpad/panel-round/` proposes to take it out —
     * rather than pushing the unit out into the corridor.
     */
    const unitD = PLATE_GAP + PLATE_T + CASE_D;
    const mount = mountZ(u, unitD);
    const plateBackZ = mount + Math.min(PLATE_GAP, u.depth * 0.25);
    const plateFrontZ = plateBackZ + PLATE_T;
    const caseFrontZ = plateFrontZ + Math.min(CASE_D, Math.max(0.1, u.frontZ - plateFrontZ));
    const caseW = Math.max(u.width - CASE_INSET * 2, u.width * 0.6);

    const place = (mesh: THREE.Mesh, cx: number, lo: number, hi: number, z0: number, z1: number, wide: number): void => {
      mesh.scale.set(Math.max(wide, 0.008), Math.max(hi - lo, 0.008), Math.max(z1 - z0, 0.004));
      mesh.position.set(cx, base + (lo + hi) / 2, (z0 + z1) / 2);
    };

    place(backPlate, u.cx, PANEL_LIFT_M, PANEL_LIFT_M + PANEL_H_M, plateBackZ, plateFrontZ, u.width);
    for (let i = 0; i < pads.length; i++) {
      const sx = i % 2 === 0 ? -1 : 1;
      const sy = i < 2 ? 0.08 : PANEL_H_M - 0.08;
      place(pads[i], u.cx + sx * (u.width / 2 - 0.1), PANEL_LIFT_M + sy - 0.035, PANEL_LIFT_M + sy + 0.035, mount, plateBackZ, 0.07);
    }

    place(housing, u.cx, CASE_Y0, CASE_Y1, plateFrontZ - 0.01, caseFrontZ, caseW);
    // The face: inset from the housing's own edges, so the box has a rim round it
    // and the light surface is unmistakably a PANEL rather than the whole unit.
    place(facePlate, u.cx, CASE_Y0 + 0.035, CASE_Y1 - 0.035, caseFrontZ - 0.012, caseFrontZ + 0.003, caseW - 0.07);
    // A drip sill under the housing and a hood over it, each a dark shallow
    // shelf with one bright lip on its front edge. See `SILL_H`.
    place(sill, u.cx, CASE_Y0 - SILL_H, CASE_Y0, plateFrontZ, caseFrontZ + 0.02, caseW + 0.04);
    place(sillLip, u.cx, CASE_Y0 - SILL_H, CASE_Y0 - SILL_H + LIP_H, caseFrontZ, caseFrontZ + 0.022, caseW + 0.045);
    place(hood, u.cx, CASE_Y1, CASE_Y1 + HOOD_H, plateFrontZ - 0.01, caseFrontZ + HOOD_OVER, caseW + 0.05);
    place(hoodLip, u.cx, CASE_Y1 + HOOD_H - LIP_H, CASE_Y1 + HOOD_H, caseFrontZ + HOOD_OVER - 0.02, caseFrontZ + HOOD_OVER, caseW + 0.055);
    place(reveal, u.cx, CASE_Y1 - 0.022, CASE_Y1, caseFrontZ - 0.005, caseFrontZ + HOOD_OVER * 0.6, caseW + 0.03);

    const faceZ = caseFrontZ + 0.004;
    /*
     * Four columns across the face, left to right: the pull lever, the mushroom
     * release dead centre, the key switch, and the lamp with its legend under
     * it. The first cut stacked the key switch, the lamp AND the legend on one
     * column and they drew through each other; the second put the key switch
     * where the lever's own knob swings to. Both are visible in the bench
     * renders under `scratchpad/panel-round/`, which is what a bench is for.
     */
    const leverX = u.cx - caseW * 0.36;
    const keyX = u.cx + caseW * 0.16;
    const lampX = u.cx + caseW * 0.32;

    // --- the mushroom release, dead centre: the thing Droid's hand goes to.
    guard.position.set(u.cx, base + CONTROL_Y, faceZ + 0.03);
    collar.position.set(u.cx, base + CONTROL_Y, faceZ + 0.02);
    mushroom.position.set(u.cx, base + CONTROL_Y, faceZ + 0.035 + (done ? -0.028 : 0));

    // --- the pull lever, west of it, standing up once it has been pulled.
    place(quadrant, leverX, CONTROL_Y - 0.12, CONTROL_Y + 0.17, faceZ - 0.01, faceZ + 0.012, 0.12);
    leverPivot.position.set(leverX, base + CONTROL_Y - 0.07, faceZ + 0.05);
    leverPivot.rotation.z = done ? 0.42 : -1.18;
    leverArm.scale.set(0.035, 0.24, 0.035);
    leverArm.position.set(0, 0.12, 0);
    leverKnob.position.set(0, 0.25, 0);

    // --- the key switch, east of it, turned a quarter when released.
    keyBezel.position.set(keyX, base + KEY_Y, faceZ + 0.014);
    keyBarrel.position.set(keyX, base + KEY_Y, faceZ + 0.026);
    keyBar.scale.set(0.058, 0.012, 0.012);
    keyBar.position.set(keyX, base + KEY_Y, faceZ + 0.042);
    keyBar.rotation.z = done ? Math.PI / 2 : 0;

    // --- the lamp and its legend.
    lampBezel.position.set(lampX, base + LAMP_Y, faceZ + 0.014);
    lens.position.set(lampX, base + LAMP_Y, faceZ + 0.022);
    legend.scale.set(Math.min(caseW * 0.24, 0.32), 0.055, 1);
    legend.position.set(lampX, base + LAMP_Y - LAMP_R - 0.062, faceZ + 0.006);

    // --- the engraved plate.
    const labelW = Math.min(caseW * 0.62, 0.92);
    label.scale.set(labelW, LABEL_H, 1);
    label.position.set(u.cx - caseW / 2 + labelW / 2 + caseW * 0.04, base + LABEL_Y0 + LABEL_H / 2, faceZ + 0.006);

    // --- the tray along the top of the plate, on two saddles.
    const trayZ = plateFrontZ + CONDUIT_R + 0.012;
    tray.scale.set(CONDUIT_R, u.width - 0.12, CONDUIT_R);
    tray.position.set(u.cx, base + TRAY_Y, trayZ);
    for (let i = 0; i < saddles.length; i++) {
      const sx = i === 0 ? -1 : 1;
      place(
        saddles[i],
        u.cx + sx * (u.width * 0.3),
        TRAY_Y - CONDUIT_R - 0.018,
        TRAY_Y + CONDUIT_R + 0.018,
        plateFrontZ,
        trayZ + CONDUIT_R,
        0.045,
      );
    }

    /*
     * THE HANGERS, WHICH ARE THE WHOLE REASON THIS DOES NOT FLOAT.
     *
     * Two rods off the top of the plate, up to the underside of the corridor
     * vault — `corridorSoffitY` in `src/render/venue/floor1.ts`, so the length is
     * read off the building rather than typed here and a change to the vault
     * moves them. Directly over the unit the soffit is about 3.55 m and the plate
     * tops out at 3.40, so they are short; short is correct, and the point is
     * that the frame now contains the thing the unit is hanging FROM. Out past
     * the vault's far edge there is nothing overhead, and they become a stub that
     * runs up out of shot rather than a rod to nowhere.
     */
    const top = base + PANEL_LIFT_M + PANEL_H_M;
    const hangZ = plateBackZ + PLATE_T / 2;
    const over = corridorSoffitY(hangZ);
    const edge = corridorSoffit();
    // Straight up where there is soffit overhead; otherwise raked BACK to the
    // plate's outer edge, which is what a stay does. Only if the vault is
    // nowhere near does it become a stub running up out of shot.
    const anchorZ = over === null ? edge.z1 : hangZ;
    const anchorY = base + (over ?? edge.y1);
    const dz = anchorZ - hangZ;
    const dy = Math.max(anchorY - top, 0.04);
    const len = Math.min(Math.hypot(dz, dy), HANGER_MAX);
    const lean = Math.atan2(dz, dy);
    for (let i = 0; i < hangers.length; i++) {
      const sx = i === 0 ? -1 : 1;
      const use = len < 0.05 ? HANGER_STUB : len;
      hangers[i].scale.set(HANGER_R, use, HANGER_R);
      hangers[i].rotation.x = len < 0.05 ? 0 : -lean;
      hangers[i].position.set(
        u.cx + sx * (u.width / 2 - 0.16),
        top + Math.cos(lean) * use * 0.5,
        hangZ + Math.sin(lean) * use * 0.5,
      );
    }
    // The supply comes down beside them, into a junction box on the tray: the
    // same drop, and the reason a control this far off the ground has power at
    // all. It is the piece that ties the unit to the services overhead rather
    // than leaving it hanging on two bare rods.
    const dropX = u.cx + u.width * 0.24;
    const dropBottom = base + TRAY_Y + CONDUIT_R;
    const dropLen = Math.max(Math.min(anchorY, top + Math.cos(lean) * len) - dropBottom, 0.06);
    drop.scale.set(CONDUIT_R, dropLen, CONDUIT_R);
    drop.position.set(dropX, dropBottom + dropLen / 2, trayZ);
    place(junction, dropX, TRAY_Y - 0.055, TRAY_Y + 0.045, plateFrontZ, trayZ + CONDUIT_R + 0.01, 0.13);

    // --- what it says, and what colour it says it in.
    label.material = painter.material('release-plate', 384, 80, '#1c212a', platePaint, 0.22);
    legend.material = done
      ? painter.material('release-legend-done', 192, 28, '#12161c', lampLegendDone, 0.24)
      : painter.material('release-legend', 192, 28, '#12161c', lampLegend, 0.2);
    lampMat.emissive.setHex(done ? RELEASED : HELD);
    // The guard ring picks the lamp's colour up at a fraction of it, so the
    // control the player pressed is the part of the unit that changed, not a
    // 5 cm lens two feet away from it.
    trim.emissive.setHex(done ? 0x12351f : 0x4a3a18);
  }

  return {
    root,
    pose,
    dispose(): void {
      painter.dispose();
      for (const mat of owned) mat.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      root.removeFromParent();
      root.clear();
    },
  };
}
