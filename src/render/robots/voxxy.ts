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
const HIP_Y = 0.275;
const TORSO_Y = 0.365;
const SHOULDER_Y = 0.625;
const NECK_Y = 0.745;
const HEAD_Y = 0.955;
/**
 * Head half-extents. The sheet's head is a WIDE ellipsoid: half again as wide as
 * it is tall, and wider than the body is anywhere. Getting this ratio wrong is
 * the single fastest way to turn Voxxy into a generic round-headed robot.
 */
const HEAD_RX = 0.25;
const HEAD_RY = 0.155;
const HEAD_RZ = 0.2;
const THIGH = 0.105;
const SHIN = 0.105;
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
  const eyeGlow = glowMaterial('#ffb24a', 2.6, '#1d1208');
  const portGlow = glowMaterial('#ff9c33', 1.5, '#1d1208');
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
      [0.0, -0.128],
      [0.062, -0.122],
      [0.112, -0.104],
      [0.152, -0.066],
      [0.172, 0.012],
      [0.166, 0.09],
      [0.145, 0.18],
      [0.118, 0.265],
      [0.09, 0.325],
      [0.055, 0.362],
      [0.0, 0.372],
    ],
    30,
    36,
  );
  const body = part(bodyGeo, shell);
  torso.add(body);
  parts.torsoShell = body;

  // Panel seams: two barely-there dark rings, as on the sheet's body panels.
  for (const [ringY, ringR] of [
    [0.09, 0.166],
    [-0.055, 0.153],
  ] as Array<[number, number]>) {
    const seam = part(new THREE.TorusGeometry(ringR, 0.0032, 6, 40), shellDeep);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = ringY;
    torso.add(seam);
  }
  // The little dark vent slot low on the belly.
  const vent = part(roundedBox(0.07, 0.016, 0.012, 0.006, 2), dark);
  vent.position.set(0, -0.03, 0.148);
  torso.add(vent);

  // Chest emblem: the small white badge with the cat-face mark.
  const badge = part(roundedBox(0.074, 0.074, 0.014, 0.018, 3), white);
  badge.position.set(0, 0.235, 0.123);
  badge.rotation.x = -0.12;
  torso.add(badge);
  const markMat = panelMaterial('#9aa3ad', 0, { roughness: 0.4, metalness: 0.1 });
  for (const sx of [-1, 1]) {
    const ear = part(roundedBox(0.016, 0.018, 0.006, 0.004, 2), markMat);
    ear.position.set(sx * 0.017, 0.263, 0.131);
    ear.rotation.x = -0.12;
    torso.add(ear);
    const eye = part(puck(0.005, 0.004, 10).rotateX(Math.PI / 2), markMat);
    eye.position.set(sx * 0.014, 0.238, 0.132);
    torso.add(eye);
  }

  // Neck: a short dark post, visible between body and head on every view.
  const neckMesh = part(new THREE.CylinderGeometry(0.034, 0.038, 0.07, 16), dark);
  neckMesh.position.y = 0.01;
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
    const thighMesh = part(new THREE.CylinderGeometry(0.029, 0.027, THIGH, 12), dark);
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
