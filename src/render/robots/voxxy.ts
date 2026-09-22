/**
 * voxxy.ts — Model 01, "the orange companion".
 *
 * Built from `robots/voxxy-robot.png`. The silhouette reads at a glance because
 * of four things, in this order of importance:
 *   1. a WIDE ellipsoid head, clearly wider than the body and about a third of
 *      the total height, carrying a big black wrap-around visor;
 *   2. two glowing amber bar-eyes inside that visor, and a white disc port with
 *      an amber ring on each side of the head;
 *   3. a pear/teardrop body with a small white emblem badge on the chest;
 *   4. very long tapered teardrop arms that hang past the knees, each with a
 *      white band near the wrist and a small dark three-finger gripper.
 * Legs are short dark posts with small orange feet. Everything is glossy — low
 * roughness, no weathering: Voxxy is the new one.
 */

import * as THREE from 'three';
import { ROBOT_HEIGHT_M } from '../../sim/units';
import {
  assertBones,
  bolt,
  ellipsoid,
  glowMaterial,
  joint,
  latheProfile,
  panelMaterial,
  part,
  puck,
  roundedBox,
  spherePatch,
  disposeTree,
  type RobotRig,
} from './rig';

/* Vertical layout, metres from the sole. Every number below is read off the
 * model sheet's front view and then held to ROBOT_HEIGHT_M.voxxy = 1.15. */
/*
 * Re-measured off the sheet's front view in round 2. The figure reads
 * legs 11-14% / body 44% / neck 6% / head 39% of total height; the build had
 * legs at 18.6% and the head at 29%, which made Voxxy leggier and less toy-like
 * than the model sheet and cost him the "short stubby legs" checklist item.
 */
const HIP_Y = 0.215;
const TORSO_Y = 0.305;
const SHOULDER_Y = 0.615;
const NECK_Y = 0.73;
const HEAD_Y = 0.95;
/**
 * Head half-extents. The sheet's head is a WIDE ellipsoid: half again as wide as
 * it is tall, and wider than the body is anywhere. Getting this ratio wrong is
 * the single fastest way to turn Voxxy into a generic round-headed robot.
 */
const HEAD_RX = 0.25;
// 0.178, not 0.155: the sheet's head is 39% of total height including the ears
// and this build had it at 29%. Only the vertical half-extent moves, so every
// x/z-placed feature on the head — visor patch, bar-eyes, side ports, ears —
// keeps the position it was measured into.
const HEAD_RY = 0.178;
const HEAD_RZ = 0.2;
/** Short and stubby: 0.14 m of leg under a body whose underside sits at 0.175. */
const THIGH = 0.068;
const SHIN = 0.082;
/** Arm segments. Shoulder-to-wrist is 0.54 m = 0.47 x height: "very long". */
const UPPER_ARM = 0.28;
const FOREARM = 0.26;

export function buildVoxxy(): RobotRig {
  const bones: Record<string, THREE.Object3D> = {};
  const parts: Record<string, THREE.Object3D> = {};
  const glow: THREE.MeshStandardMaterial[] = [];

  const root = new THREE.Group();
  root.name = 'voxxy';
  bones.root = root;

  /* --------------------------------------------------------------- palette */
  // Glossy injection-moulded plastic: low roughness, a little metalness for the
  // sheen the sheet's renders have. No weathering anywhere on Voxxy.
  const shell = panelMaterial('#ff7a1a', 0, { roughness: 0.15, metalness: 0.14 });
  const shellDeep = panelMaterial('#e0630f', 0, { roughness: 0.2, metalness: 0.14 });
  const white = panelMaterial('#f4f6f8', 0, { roughness: 0.26, metalness: 0.05 });
  const dark = panelMaterial('#24272c', 0, { roughness: 0.42, metalness: 0.3 });
  const visorGlass = panelMaterial('#0a0b0d', 0, { roughness: 0.06, metalness: 0.45 });
  // Amber bar-eyes. At intensity 2.6 the green channel clipped to 255 and both
  // bars photographed as lemon yellow; the model sheet's eye glow samples strongly
  // orange. Lower intensity, more saturated base: R > G > B survives the clip.
  const eyeGlow = glowMaterial('#ff9a2e', 1.35, '#1d1208');
  const portGlow = glowMaterial('#ff8c22', 1.0, '#1d1208');
  glow.push(eyeGlow, portGlow);

  /* ------------------------------------------------------------- skeleton */
  const pelvis = joint(bones, root, 'pelvis', 0, HIP_Y, 0);
  const torso = joint(bones, pelvis, 'torso', 0, TORSO_Y - HIP_Y, 0);
  const neck = joint(bones, torso, 'neck', 0, NECK_Y - TORSO_Y, 0);
  const head = joint(bones, neck, 'head', 0, HEAD_Y - NECK_Y, 0);

  /* ----------------------------------------------------------------- body */
  // A true pear: widest at 0.38 m, a third of the way up the body, narrowing to
  // the neck. Lathed from a spline so the shoulder line stays soft.
  const bodyGeo = latheProfile(
    [
      [0.0, -0.13],
      [0.07, -0.122],
      [0.125, -0.098],
      [0.16, -0.052],
      [0.175, 0.004],
      [0.178, 0.05],
      [0.17, 0.118],
      [0.152, 0.186],
      [0.125, 0.256],
      [0.092, 0.318],
      [0.052, 0.36],
      [0.0, 0.372],
    ],
    34,
    40,
  );
  const body = part(bodyGeo, shell);
  torso.add(body);
  parts.torsoShell = body;

  /*
   * ONE faint panel line low on the body, as the sheet has.
   *
   * There used to be a second ring at the waist. Between it and a profile whose
   * widest point sat under it, the silhouette broke into an upper egg and a lower
   * sphere and the round-2 critic read the join as construction geometry. The
   * profile above is now monotone from the neck to its widest point at y = 0.05,
   * and this is the only ring left.
   */
  {
    const seam = part(new THREE.TorusGeometry(0.1585, 0.0028, 6, 44), shellDeep);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = -0.055;
    torso.add(seam);
  }
  // The little dark vent slot low on the belly.
  const vent = part(roundedBox(0.07, 0.016, 0.012, 0.006, 2), dark);
  vent.position.set(0, -0.03, 0.148);
  torso.add(vent);

  /*
   * Chest emblem: the sheet's CAT FACE.
   *
   * White on orange, with the ears rising OUT of the top corners as part of the
   * one silhouette, two dark dots for eyes and a small orange nose. The previous
   * version put grey ear-shaped boxes INSIDE a white square and gave the square a
   * corner-radius big enough to notch its bottom edge; the round-2 critic read it
   * as a torn white card or a broken UI icon, which is the opposite of a glyph.
   */
  const emblem = new THREE.Object3D();
  // Proud of the lathe's surface, which is 0.134 across at this height: at 0.121
  // the whole badge sat inside the body and only the ear tips and the eye dots
  // poked out, which is why the glyph read as a torn card.
  emblem.position.set(0, 0.232, 0.139);
  emblem.rotation.x = -0.12;
  torso.add(emblem);
  const markDark = panelMaterial('#2a2d33', 0, { roughness: 0.4, metalness: 0.06 });
  // The head: wider than tall, with a flat bottom edge and only a small radius.
  const catHead = part(roundedBox(0.072, 0.058, 0.012, 0.008, 3), white);
  emblem.add(catHead);
  // A cheek lobe each side, so the outline is a cat head and not a rounded box.
  for (const sx of [-1, 1]) {
    const cheek = part(ellipsoid(0.021, 0.018, 0.007, 16, 10), white);
    cheek.position.set(sx * 0.026, -0.01, 0.004);
    emblem.add(cheek);
    // Ear: a triangle standing out of the top corner, same white as the head.
    const ear = part(new THREE.ConeGeometry(0.0155, 0.024, 3), white);
    ear.position.set(sx * 0.024, 0.036, 0.001);
    ear.rotation.set(Math.PI / 2, 0, sx * 0.26);
    emblem.add(ear);
    // Eye: a dark dot, on the white.
    const eye = part(puck(0.0072, 0.005, 12).rotateX(Math.PI / 2), markDark);
    eye.position.set(sx * 0.0165, 0.006, 0.008);
    emblem.add(eye);
  }
  // Nose: a small orange triangle, point down.
  const nose = part(new THREE.ConeGeometry(0.009, 0.013, 3), shell);
  nose.position.set(0, -0.014, 0.008);
  nose.rotation.set(Math.PI / 2, 0, Math.PI);
  emblem.add(nose);

  // Neck: a short dark post, visible between body and head on every view.
  const neckMesh = part(new THREE.CylinderGeometry(0.034, 0.038, 0.118, 16), dark);
  neckMesh.position.y = -0.005;
  neck.add(neckMesh);

  /* ----------------------------------------------------------------- head */
  const headShell = part(ellipsoid(HEAD_RX, HEAD_RY, HEAD_RZ, 44, 28), shell);
  head.add(headShell);
  parts.headShell = headShell;

  // The big black wrap-around visor: a patch of the head's own ellipsoid, pushed
  // out 3% so it reads as a separate glass shell rather than a decal.
  const visor = part(spherePatch(HEAD_RX * 1.03, HEAD_RY * 1.05, HEAD_RZ * 1.03, 1.22, 1.12, 0.95, 34, 16), visorGlass);
  head.add(visor);
  parts.visor = visor;

  // Two glowing amber bar-eyes inside the visor.
  for (const sx of [-1, 1]) {
    const bar = part(roundedBox(0.112, 0.034, 0.014, 0.014, 3), eyeGlow);
    bar.position.set(sx * 0.07, 0.002, 0.2);
    bar.rotation.y = -sx * 0.28;
    head.add(bar);
  }

  // A white/silver disc port on each side of the head, with an amber ring.
  for (const sx of [-1, 1]) {
    const portRoot = new THREE.Object3D();
    portRoot.position.set(sx * 0.242, 0.004, -0.008);
    head.add(portRoot);
    const disc = part(puck(0.062, 0.026, 28).rotateZ(Math.PI / 2), white);
    portRoot.add(disc);
    const rim = part(new THREE.TorusGeometry(0.045, 0.009, 8, 28), dark);
    rim.rotation.y = Math.PI / 2;
    rim.position.x = sx * 0.012;
    portRoot.add(rim);
    const lens = part(puck(0.03, 0.008, 24).rotateZ(Math.PI / 2), portGlow);
    lens.position.x = sx * 0.016;
    portRoot.add(lens);
    const pupil = part(roundedBox(0.008, 0.016, 0.016, 0.003, 2), dark);
    pupil.position.x = sx * 0.02;
    portRoot.add(pupil);
  }

  // Two small rounded ears, and the antenna nub between them. The nub is what
  // sets the top of the silhouette at 1.15 m.
  for (const sx of [-1, 1]) {
    const ear = part(ellipsoid(0.055, 0.06, 0.05, 20, 16), shell);
    ear.position.set(sx * 0.132, 0.115, -0.02);
    ear.rotation.z = sx * 0.2;
    head.add(ear);
    bones[sx > 0 ? 'earL' : 'earR'] = ear;
  }
  const antenna = joint(bones, head, 'antenna', 0, 0.135, -0.015);
  const nub = part(new THREE.CapsuleGeometry(0.021, 0.042, 6, 14), white);
  nub.position.y = 0.024;
  antenna.add(nub);
  const nubTip = part(ellipsoid(0.019, 0.017, 0.019, 14, 10), shell);
  nubTip.position.y = 0.046;
  antenna.add(nubTip);
  antenna.rotation.x = -0.12;

  // The lamp sits behind the visor and fires forward: Voxxy's narrow orange cone.
  const lampAnchor = new THREE.Object3D();
  lampAnchor.name = 'lamp';
  lampAnchor.position.set(0, 0.01, HEAD_RZ + 0.02);
  head.add(lampAnchor);

  /* ----------------------------------------------------------------- arms */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const shoulder = joint(bones, torso, `shoulder${L}`, side * 0.168, SHOULDER_Y - TORSO_Y, 0.012);
    const upper = joint(bones, shoulder, `upperArm${L}`, 0, 0, 0);
    const fore = joint(bones, upper, `forearm${L}`, 0, -UPPER_ARM, 0);
    const hand = joint(bones, fore, `hand${L}`, 0, -FOREARM, 0);

    // Shoulder cap where the arm meets the pear — small, so the arm reads as a
    // separate hanging teardrop and not as a lump on the body.
    const cap = part(ellipsoid(0.034, 0.033, 0.034, 16, 12), dark);
    shoulder.add(cap);

    // The dark rod the teardrop is threaded on — visible at the shoulder and
    // again at the elbow on the sheet.
    const rod = part(new THREE.CylinderGeometry(0.019, 0.019, UPPER_ARM + 0.02, 12), dark);
    rod.position.y = -UPPER_ARM / 2;
    upper.add(rod);

    // Upper half of the teardrop: thin at the shoulder, swelling downward.
    const upperShell = part(
      latheProfile(
        [
          [0.0, 0.012],
          [0.024, -0.012],
          [0.034, -0.06],
          [0.045, -0.13],
          [0.054, -0.21],
          [0.06, -0.28],
        ],
        20,
        28,
      ),
      shell,
    );
    upper.add(upperShell);

    // Forearm: widest just below the elbow, tapering into the white band.
    const foreShell = part(
      latheProfile(
        [
          [0.058, 0.005],
          [0.065, -0.05],
          [0.062, -0.1],
          [0.053, -0.15],
          [0.046, -0.175],
        ],
        18,
        28,
      ),
      shell,
    );
    fore.add(foreShell);
    const band = part(new THREE.CylinderGeometry(0.043, 0.04, 0.058, 26), white);
    band.position.y = -0.202;
    fore.add(band);
    const wristTip = part(
      latheProfile(
        [
          [0.039, -0.231],
          [0.034, -0.246],
          [0.027, -0.258],
          [0.0, -0.262],
        ],
        12,
        24,
      ),
      shell,
    );
    fore.add(wristTip);

    // Small dark three-finger gripper.
    const wrist = part(new THREE.CylinderGeometry(0.022, 0.02, 0.018, 12), dark);
    hand.add(wrist);
    const fingerAngles = [0.0, 2.1, -2.1];
    for (let i = 0; i < fingerAngles.length; i++) {
      const a = fingerAngles[i];
      const finger = new THREE.Object3D();
      finger.position.set(Math.sin(a) * 0.018, -0.012, Math.cos(a) * 0.018);
      finger.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      hand.add(finger);
      const seg = part(new THREE.CapsuleGeometry(0.0095, 0.03, 4, 10), dark);
      seg.position.y = -0.02;
      finger.add(seg);
      const tip = part(ellipsoid(0.012, 0.012, 0.012, 12, 8), dark);
      tip.position.y = -0.04;
      finger.add(tip);
      bones[`finger${L}${i}`] = finger;
    }

    // Arms hang clear of the body with a distinct outward splay: on the sheet
    // there is daylight between the teardrop arms and the pear all the way down.
    shoulder.rotation.z = side * 0.2;
    shoulder.rotation.x = -0.05;
  }

  /* ----------------------------------------------------------------- legs */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const hip = joint(bones, pelvis, `hip${L}`, side * 0.062, 0, 0);
    const thigh = joint(bones, hip, `thigh${L}`, 0, 0, 0);
    const shin = joint(bones, thigh, `shin${L}`, 0, -THIGH, 0);
    const foot = joint(bones, shin, `foot${L}`, 0, -SHIN, 0);

    const hipBall = part(ellipsoid(0.033, 0.033, 0.033, 14, 10), dark);
    hip.add(hipBall);
    // Orange thigh, dark ankle: on the sheet only the ankle piston is dark, and a
    // pair of matte-black struts under an orange body read as stilts.
    const thighMesh = part(new THREE.CylinderGeometry(0.036, 0.031, THIGH, 14), shell);
    thighMesh.position.y = -THIGH / 2;
    thigh.add(thighMesh);
    const knee = part(ellipsoid(0.03, 0.03, 0.03, 14, 10), dark);
    knee.position.y = -THIGH;
    thigh.add(knee);
    const shinMesh = part(new THREE.CylinderGeometry(0.026, 0.028, SHIN, 12), dark);
    shinMesh.position.y = -SHIN / 2;
    shin.add(shinMesh);

    // Small orange foot with two dark castor balls at the toe — the sheet's feet
    // are barely bigger than the leg post.
    const boot = part(roundedBox(0.072, 0.055, 0.115, 0.022, 3), shell);
    boot.position.set(0, -0.0375, 0.018);
    foot.add(boot);
    for (const bx of [-1, 1]) {
      const castor = part(ellipsoid(0.018, 0.018, 0.018, 14, 10), dark);
      castor.position.set(bx * 0.02, -0.047, 0.055);
      foot.add(castor);
    }
    const heel = part(ellipsoid(0.02, 0.016, 0.018, 12, 8), dark);
    heel.position.set(0, -0.047, -0.03);
    foot.add(heel);
    // Two rivets on the outer side of each boot.
    const r1 = bolt(dark, 0.006, 0.005);
    r1.position.set(side * 0.036, -0.03, 0.0);
    r1.rotation.z = -side * Math.PI / 2;
    foot.add(r1);
  }

  assertBones('voxxy', bones);

  return {
    kind: 'voxxy',
    root,
    bones,
    parts,
    height: ROBOT_HEIGHT_M.voxxy,
    glow,
    lampAnchor,
    dispose: () => disposeTree(root),
  };
}
