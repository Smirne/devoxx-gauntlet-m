/**
 * biggy.ts — Model 03, "a stocky little heavyweight with blue-gray armor and a
 * weathered orange belly".
 *
 * Built from `robots/biggy-robot.png`. The read is: a BARREL WITH A HELMET ON IT.
 *   - a huge sphere of weathered orange armour is the belly and dominates the
 *     silhouette, with a circular emblem on the front;
 *   - a blue-gray armoured dome helmet is fused onto the top of that sphere and
 *     OVERHANGS it, with rivet ports on the crown and a thin whip antenna;
 *   - a dark visor band sits in the gap under the helmet rim, with a faint warm
 *     glow in it;
 *   - short stubby dark arms with small clawed hands that barely clear the belly;
 *   - very short thick legs with ribbed bellows knees and wide flat boots.
 * Total width comes out close to total height, which is the whole point of him.
 */

import * as THREE from 'three';
import { ROBOT_HEIGHT_M } from '../../sim/units';
import {
  assertBones,
  boltRing,
  disposeTree,
  ellipsoid,
  excludeFromBounds,
  glowMaterial,
  joint,
  panelMaterial,
  part,
  puck,
  roundedBox,
  type RobotRig,
  type WeatherOpts,
} from './rig';

/*
 * Vertical layout, metres from the sole, held to ROBOT_HEIGHT_M.biggy = 1.45.
 *
 * Measured off the model sheet's FRONT VIEW rather than guessed. At 265 px/m on
 * that panel: helmet crown to belly 88 px (0.33 m), belly 265 px (1.00 m), boots
 * 35 px (0.13 m) — 23% / 68% / 9% of the height. Across: belly 305 px (1.15 m),
 * helmet 250 px (0.94 m), full silhouette including the arms 375 px (1.42 m). The
 * one relationship the whole character rests on is **belly 1.22x wider than the
 * helmet**, with the arms just outside the belly, and it is these numbers.
 */
const ANKLE_Y = 0.13;
const KNEE_Y = 0.26;
const HIP_Y = 0.4;
const TORSO_Y = 0.46;
const SHOULDER_Y = 0.96;
const NECK_Y = 1.02;
const HEAD_Y = 1.1;
const SHIN = KNEE_Y - ANKLE_Y;
const THIGH = HIP_Y - KNEE_Y;
/** The belly: 1.15 m across, 1.10 m tall, hung low enough to swallow the knees. */
const BELLY_R = 0.575;
const BELLY_RY = 0.55;
const BELLY_Y = 0.68;
/** Helmet: a cap on top of the belly, 0.94 m across — 1.22x narrower than the belly. */
const HELM_R = 0.47;
const HELM_H = 0.35;
/** The dark visor band in the gap under the helmet rim. This is Biggy's whole face. */
const BAND_Y0 = 1.02;
const BAND_Y1 = 1.13;
const BAND_R0 = 0.472;
const BAND_R1 = 0.4;
/** Stubby arms, hung on the shoulders of the belly and just clear of its widest point. */
const SHOULDER_X = 0.6;
const UPPER_ARM = 0.26;
const FOREARM = 0.22;

export function buildBiggy(): RobotRig {
  const bones: Record<string, THREE.Object3D> = {};
  const parts: Record<string, THREE.Object3D> = {};
  const glow: THREE.MeshStandardMaterial[] = [];

  const root = new THREE.Group();
  root.name = 'biggy';
  bones.root = root;

  /* --------------------------------------------------------------- palette */
  const armour = panelMaterial('#5f7387', 0.5, { roughness: 0.7, metalness: 0.45 });
  const armourDark = panelMaterial('#46566a', 0.55, { roughness: 0.75, metalness: 0.45 });
  const belly = panelMaterial('#d9772a', 0.65, { roughness: 0.72, metalness: 0.3 });
  const rubber = panelMaterial('#23262b', 0.4, { roughness: 0.9, metalness: 0.1 });
  const steel = panelMaterial('#6d7885', 0.4, { roughness: 0.55, metalness: 0.75 });
  /** The band under the rim: near-black, and the only place Biggy has a face. */
  const visorBand = panelMaterial('#15181c', 0.25, { roughness: 0.55, metalness: 0.3 });
  /** The belly emblem's own light material — embossed orange on orange vanished. */
  const emblemLight = panelMaterial('#ede0d0', 0.35, { roughness: 0.5, metalness: 0.1 });
  const visorGlow = glowMaterial('#ffb347', 0.55, '#0d0e10');
  // Amber, not lemon: at the old intensity the green channel clipped to 255 and
  // both eyes photographed as pure yellow. `#ffb347` x 1.2 keeps R > G > B.
  const eyeGlow = glowMaterial('#ffb347', 1.2, '#0d0e10');
  glow.push(visorGlow, eyeGlow);

  /** Rust bleeding through the orange, grime pooling low: twenty years of it. */
  const wear = (amount: number, seed: number, scale = 5): WeatherOpts => ({
    amount,
    seed,
    scale,
    tint: '#7d4526',
    grime: 0.4,
  });

  /* ------------------------------------------------------------- skeleton */
  const pelvis = joint(bones, root, 'pelvis', 0, HIP_Y, 0);
  const torso = joint(bones, pelvis, 'torso', 0, TORSO_Y - HIP_Y, 0);
  const neck = joint(bones, torso, 'neck', 0, NECK_Y - TORSO_Y, 0);
  const head = joint(bones, neck, 'head', 0, HEAD_Y - NECK_Y, 0);

  /* ---------------------------------------------------------- the belly */
  const bellyMesh = part(ellipsoid(BELLY_R, BELLY_RY, BELLY_R, 48, 32), belly, wear(0.8, 3, 4));
  bellyMesh.position.y = BELLY_Y - TORSO_Y;
  torso.add(bellyMesh);
  parts.bellyShell = bellyMesh;
  // Biggy has no torso other than his belly; both names point at the same shell.
  parts.torsoShell = bellyMesh;

  // Armour seams: one horizontal band and two vertical plate joins.
  // The seam sits on the ellipsoid's own surface at that height, not on a sphere's:
  // a torus of the wrong radius is either invisible inside the shell or a hoop
  // floating off it.
  const seamY = 0.14;
  const seamR = BELLY_R * Math.sqrt(Math.max(0, 1 - (seamY / BELLY_RY) ** 2));
  const seam = part(new THREE.TorusGeometry(seamR + 0.004, 0.008, 6, 48), armourDark, wear(0.5, 4));
  seam.rotation.x = Math.PI / 2;
  seam.position.y = BELLY_Y - TORSO_Y + seamY;
  torso.add(seam);
  for (const sx of [-1, 1]) {
    const join = part(new THREE.TorusGeometry(BELLY_R + 0.004, 0.007, 6, 48, Math.PI * 0.55), armourDark);
    join.rotation.set(0, sx * 1.1, Math.PI / 2 - 0.55);
    join.position.y = BELLY_Y - TORSO_Y;
    torso.add(join);
  }

  // The circular emblem on the front of the belly.
  // The circular emblem on the front of the belly. Its own light material, not an
  // embossed ring in the belly's orange: relief alone reads as nothing at all once
  // the diorama camera is more than a few metres away.
  const emblemY = 0.12;
  const emblemZ = BELLY_R * Math.sqrt(Math.max(0, 1 - (emblemY / BELLY_RY) ** 2));
  const emblem = new THREE.Object3D();
  // Proud of the shell, not sunk into it: at emblemZ - 0.02 the ring's outer arc
  // disappeared into the belly and the glyph read as a crescent.
  emblem.position.set(0, BELLY_Y - TORSO_Y + emblemY, emblemZ + 0.016);
  torso.add(emblem);
  const emblemRing = part(new THREE.TorusGeometry(0.1, 0.02, 10, 32), emblemLight, wear(0.3, 5));
  emblem.add(emblemRing);
  const emblemFace = part(puck(0.088, 0.014, 28).rotateX(Math.PI / 2), belly, wear(0.5, 6));
  emblemFace.position.z = -0.008;
  emblem.add(emblemFace);
  for (const sx of [-1, 1]) {
    const dot = part(puck(0.026, 0.016, 16).rotateX(Math.PI / 2), emblemLight);
    dot.position.set(sx * 0.036, 0.012, 0.008);
    emblem.add(dot);
  }
  const emblemBar = part(roundedBox(0.08, 0.022, 0.016, 0.007, 2), emblemLight);
  emblemBar.position.set(0, -0.028, 0.008);
  emblem.add(emblemBar);

  // The armoured skirt where the belly meets the legs.
  // The armoured skirt where the belly's underside meets the boots. Sits low now
  // that the belly hangs over the knees, so the two read as one mass.
  const skirt = part(new THREE.CylinderGeometry(0.42, 0.26, 0.2, 36, 2, true), armour, wear(0.6, 7));
  skirt.position.y = 0.23 - TORSO_Y;
  torso.add(skirt);
  const skirtLip = part(new THREE.TorusGeometry(0.265, 0.022, 8, 36), armourDark, wear(0.6, 8));
  skirtLip.rotation.x = Math.PI / 2;
  skirtLip.position.y = 0.14 - TORSO_Y;
  torso.add(skirtLip);

  /* ------------------------------------------- visor band under the helmet */
  // Fixed to the belly, not to the head: the helmet swivels over it.
  //
  // The band MUST stand proud of the belly shell at its own height, or the orange
  // sphere renders in front of it and Biggy has no face at all — which is exactly
  // what happened when this was a cylinder of radius 0.44 buried in a sphere of
  // radius 0.52. `BAND_R0/R1` are chosen against the ellipsoid: at y = 1.02 the
  // belly is 0.452 across the radius and the band is 0.472; at y = 1.13 the belly
  // is 0.331 and the band is 0.40, still inside the helmet rim's 0.47.
  const bandMid = (BAND_Y0 + BAND_Y1) / 2;
  const bandGeo = new THREE.CylinderGeometry(BAND_R1, BAND_R0, BAND_Y1 - BAND_Y0, 48, 1, true);
  const band = part(bandGeo, visorBand, wear(0.2, 9));
  band.position.y = bandMid - TORSO_Y;
  torso.add(band);
  // A thin warm line low in the slot, and the two amber eyes seated INSIDE the
  // dark band rather than floating on the orange above it.
  const stripR = BAND_R0 - (BAND_R0 - BAND_R1) * 0.2;
  const strip = part(
    new THREE.CylinderGeometry(stripR + 0.006, stripR + 0.006, 0.016, 40, 1, true, -0.8, 1.6),
    visorGlow,
  );
  strip.position.y = BAND_Y0 + (BAND_Y1 - BAND_Y0) * 0.2 - TORSO_Y;
  torso.add(strip);
  const eyeY = BAND_Y0 + (BAND_Y1 - BAND_Y0) * 0.45;
  const eyeR = BAND_R0 - (BAND_R0 - BAND_R1) * 0.45 + 0.01;
  for (const sx of [-1, 1]) {
    const ex = sx * 0.12;
    const eye = part(puck(0.03, 0.012, 18).rotateX(Math.PI / 2), eyeGlow);
    eye.position.set(ex, eyeY - TORSO_Y, Math.sqrt(Math.max(0.01, eyeR * eyeR - ex * ex)));
    eye.rotation.y = -sx * 0.3;
    torso.add(eye);
  }

  // Biggy's lamp: the wide blue flood, out of the visor band.
  const lampAnchor = new THREE.Object3D();
  lampAnchor.name = 'lamp';
  lampAnchor.position.set(0, eyeY - TORSO_Y, eyeR);
  torso.add(lampAnchor);

  /* ------------------------------------------------------- helmet (head) */
  const domeGeo = new THREE.SphereGeometry(1, 44, 22, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.scale(HELM_R, HELM_H, HELM_R);
  const dome = part(domeGeo, armour, wear(0.55, 11, 4));
  head.add(dome);
  parts.headShell = dome;
  const rim = part(new THREE.TorusGeometry(HELM_R - 0.008, 0.019, 10, 44), armourDark, wear(0.5, 12));
  rim.rotation.x = Math.PI / 2;
  head.add(rim);
  // Crown plates: the helmet reads as panels riveted onto a shell, not a ball.
  // Crown plates: the helmet reads as panels riveted onto a shell, not a ball.
  // Radii are taken off the dome at the band's own height — everything on this
  // helmet is placed by solving the dome, never by eye.
  const domeR = (y: number): number => HELM_R * Math.sqrt(Math.max(0, 1 - (y / HELM_H) ** 2));
  const domeY = (r: number): number => HELM_H * Math.sqrt(Math.max(0, 1 - (r / HELM_R) ** 2));
  const crownBand = part(
    new THREE.CylinderGeometry(domeR(0.075) + 0.004, domeR(0.015) + 0.004, 0.06, 44, 1, true),
    armourDark,
    wear(0.55, 13),
  );
  crownBand.position.y = 0.045;
  head.add(crownBand);
  boltRing(head, steel, {
    count: 6,
    radius: 0.3,
    y: domeY(0.3) - 0.01,
    boltRadius: 0.019,
    boltHeight: 0.016,
    phase: 0.3,
    aimFrom: new THREE.Vector3(0, 0, 0),
  });
  // Two bigger glazed ports near the front of the crown, seated on the dome.
  for (const sx of [-1, 1]) {
    const theta = 0.95;
    const azi = 0.66;
    const rr = HELM_R * Math.sin(theta);
    const px = sx * rr * Math.sin(azi);
    const pz = rr * Math.cos(azi);
    const py = HELM_H * Math.cos(theta);
    const portShell = part(new THREE.CylinderGeometry(0.043, 0.048, 0.04, 16), steel, wear(0.5, 14));
    portShell.position.set(px, py, pz);
    portShell.rotation.set(0.42, 0, -sx * 0.38);
    head.add(portShell);
    const portGlass = part(puck(0.034, 0.012, 16), rubber);
    portGlass.position.set(px * 1.04, py + 0.014, pz * 1.04);
    portGlass.rotation.set(0.42, 0, -sx * 0.38);
    head.add(portGlass);
  }

  // The whip antenna. Kept out of the measured silhouette: it is a wire, not the
  // top of his head.
  const antenna = joint(bones, head, 'antenna', 0.13, domeY(0.158) - 0.01, -0.09);
  antenna.rotation.set(-0.06, 0, -0.05);
  const whip = part(new THREE.CylinderGeometry(0.004, 0.007, 0.5, 6), rubber);
  whip.position.y = 0.25;
  antenna.add(excludeFromBounds(whip));
  const whipTip = part(ellipsoid(0.011, 0.014, 0.011, 8, 6), eyeGlow);
  whipTip.position.y = 0.5;
  antenna.add(excludeFromBounds(whipTip));
  const antennaBase = part(new THREE.CylinderGeometry(0.018, 0.022, 0.035, 10), steel, wear(0.4, 15));
  antennaBase.position.y = 0.012;
  antenna.add(antennaBase);

  // A vestigial neck collar: the helmet is fused to the belly, so this only ever
  // moves a few degrees (see `gait.ts`, Biggy's headLook is tiny).
  const collar = part(new THREE.CylinderGeometry(0.15, 0.18, 0.07, 20), armourDark, wear(0.5, 16));
  collar.position.y = 0.0;
  neck.add(collar);

  /* ----------------------------------------------------------------- arms */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const shoulder = joint(bones, torso, `shoulder${L}`, side * SHOULDER_X, SHOULDER_Y - TORSO_Y, 0.06);
    const upper = joint(bones, shoulder, `upperArm${L}`, 0, 0, 0);
    const fore = joint(bones, upper, `forearm${L}`, 0, -UPPER_ARM, 0);
    const hand = joint(bones, fore, `hand${L}`, 0, -FOREARM, 0);

    // Shoulder pad, tucked against the belly's shoulder and BELOW the helmet rim.
    // Dark like the sheet's arms: this whole limb is the dark mass either side of
    // the orange, not a continuation of the helmet.
    const pad = part(roundedBox(0.16, 0.18, 0.22, 0.055, 3), armourDark, wear(0.6, 21));
    pad.position.set(side * 0.005, 0.02, 0.0);
    shoulder.add(pad);
    const padTop = part(roundedBox(0.14, 0.05, 0.19, 0.02, 2), rubber, wear(0.6, 22));
    padTop.position.set(side * 0.005, 0.11, 0.0);
    shoulder.add(padTop);
    const stripe = part(roundedBox(0.028, 0.11, 0.17, 0.012, 2), belly, wear(0.7, 23));
    stripe.position.set(side * 0.086, 0.03, 0.0);
    shoulder.add(stripe);

    const upperMesh = part(new THREE.CylinderGeometry(0.105, 0.098, UPPER_ARM, 18, 3), armourDark, wear(0.6, 24));
    upperMesh.position.y = -UPPER_ARM / 2;
    upper.add(upperMesh);
    const upperPlate = part(roundedBox(0.14, 0.17, 0.12, 0.03, 3), rubber, wear(0.6, 25));
    upperPlate.position.set(0, -0.14, 0.035);
    upper.add(upperPlate);

    // Elbow bellows, then a short forearm.
    for (let i = 0; i < 2; i++) {
      const ring = part(new THREE.TorusGeometry(0.086, 0.022, 8, 20), rubber);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02 - i * 0.035;
      fore.add(ring);
    }
    const foreMesh = part(new THREE.CylinderGeometry(0.095, 0.088, FOREARM - 0.05, 18, 3), armourDark, wear(0.6, 26));
    foreMesh.position.y = -FOREARM / 2 - 0.01;
    fore.add(foreMesh);
    const cuff = part(new THREE.TorusGeometry(0.09, 0.016, 8, 22), rubber, wear(0.5, 27));
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -FOREARM + 0.03;
    fore.add(cuff);

    // Small clawed hand: three stubby digits.
    const palm = part(roundedBox(0.1, 0.07, 0.1, 0.028, 3), rubber, wear(0.55, 28));
    palm.position.y = -0.03;
    hand.add(palm);
    const clawAngles = [-0.75, 0, 0.75];
    for (let i = 0; i < clawAngles.length; i++) {
      const a = clawAngles[i];
      const claw = new THREE.Object3D();
      claw.position.set(Math.sin(a) * 0.035, -0.06, Math.cos(a) * 0.03);
      claw.rotation.set(-0.25, a * 0.5, 0);
      hand.add(claw);
      bones[`finger${L}${i}`] = claw;
      const seg = part(roundedBox(0.026, 0.06, 0.026, 0.01, 2), rubber);
      seg.position.y = -0.03;
      claw.add(seg);
      const tip = part(new THREE.ConeGeometry(0.016, 0.045, 8), steel);
      tip.position.y = -0.075;
      tip.rotation.x = Math.PI;
      claw.add(tip);
    }
    const thumb = new THREE.Object3D();
    thumb.position.set(-side * 0.045, -0.05, -0.01);
    thumb.rotation.set(0.2, 0, side * 1.0);
    hand.add(thumb);
    const thumbSeg = part(roundedBox(0.026, 0.055, 0.026, 0.01, 2), rubber);
    thumbSeg.position.y = -0.028;
    thumb.add(thumbSeg);

    // Arms hang just clear of the belly, splayed a little by the armour.
    shoulder.rotation.z = side * 0.05;
    shoulder.rotation.x = -0.06;
  }

  /* ----------------------------------------------------------------- legs */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const hip = joint(bones, pelvis, `hip${L}`, side * 0.2, 0, 0);
    const thigh = joint(bones, hip, `thigh${L}`, 0, 0, 0);
    const shin = joint(bones, thigh, `shin${L}`, 0, -THIGH, 0);
    const foot = joint(bones, shin, `foot${L}`, 0, -SHIN, 0);

    const hipBall = part(ellipsoid(0.13, 0.12, 0.13, 20, 14), armourDark, wear(0.55, 31));
    hip.add(hipBall);
    const thighMesh = part(new THREE.CylinderGeometry(0.128, 0.132, THIGH, 20, 2), armour, wear(0.6, 32));
    thighMesh.position.y = -THIGH / 2;
    thigh.add(thighMesh);

    // Ribbed bellows at the knee — three rubber rings, the sheet's clearest leg
    // detail and the reason his legs read as "thick" rather than "short".
    for (let i = 0; i < 3; i++) {
      const ring = part(new THREE.TorusGeometry(0.125, 0.032, 8, 24), rubber);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03 - i * 0.045;
      shin.add(ring);
    }
    const shinMesh = part(new THREE.CylinderGeometry(0.125, 0.13, SHIN - 0.02, 20, 2), armour, wear(0.6, 33));
    shinMesh.position.y = -SHIN / 2 - 0.02;
    shin.add(shinMesh);

    // Wide flat boot.
    const boot = part(roundedBox(0.3, 0.13, 0.34, 0.045, 3), armourDark, wear(0.7, 34, 4));
    boot.position.set(0, -0.065, 0.02);
    foot.add(boot);
    const tread = part(roundedBox(0.3, 0.035, 0.34, 0.018, 2), rubber, wear(0.5, 35));
    tread.position.set(0, -0.112, 0.02);
    foot.add(tread);
    const toeCap = part(roundedBox(0.28, 0.06, 0.08, 0.02, 2), steel, wear(0.65, 36));
    toeCap.position.set(0, -0.07, 0.165);
    foot.add(toeCap);
    boltRing(foot, steel, {
      count: 4,
      radius: 0.12,
      y: -0.005,
      boltRadius: 0.012,
      boltHeight: 0.01,
      phase: 0.5,
    });
  }

  assertBones('biggy', bones);

  return {
    kind: 'biggy',
    root,
    bones,
    parts,
    height: ROBOT_HEIGHT_M.biggy,
    glow,
    lampAnchor,
    dispose: () => disposeTree(root),
  };
}
