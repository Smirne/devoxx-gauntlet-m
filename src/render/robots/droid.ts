/**
 * droid.ts — Model 02, "a tall mechanical silhouette with weathered graphite
 * panels and exposed joints".
 *
 * Built from `robots/droid-robot.png`. What makes it read as Droid and not as a
 * generic humanoid:
 *   - 2.1 m tall and lanky: narrow everywhere, the smallest width/height ratio
 *     of the three, with a forward-hunched posture;
 *   - EXPOSED CYLINDRICAL JOINTS at shoulder, elbow, hip, knee and ankle — bare
 *     metal barrels with the panels stopping short of them;
 *   - a single smooth domed helmet with a dark oval faceplate and two small
 *     amber eyes set straight into it;
 *   - round shoulder pauldrons, each with a circular emblem;
 *   - copper/rust weathering streaked down from the shoulders and hips;
 *   - long forearms, articulated four-finger hands, flat blocky feet.
 *
 * "It has been in this building a long time": weathering is high, roughness is
 * high, nothing on this robot is glossy.
 */

import * as THREE from 'three';
import { ROBOT_HEIGHT_M } from '../../sim/units';
import {
  assertBones,
  bolt,
  ellipsoid,
  glowMaterial,
  joint,
  panelMaterial,
  part,
  puck,
  roundedBox,
  ovalPatch,
  disposeTree,
  type RobotRig,
  type WeatherOpts,
} from './rig';

/* Vertical layout, metres from the sole, held to ROBOT_HEIGHT_M.droid = 2.1. */
const ANKLE_Y = 0.09;
const KNEE_Y = 0.63;
const HIP_Y = 1.13;
const TORSO_Y = 1.3;
const SHOULDER_Y = 1.7;
const NECK_Y = 1.78;
const HEAD_Y = 1.86;
const SHIN = KNEE_Y - ANKLE_Y;
const THIGH = HIP_Y - KNEE_Y;
/** Long arms, longer forearms — the sheet's hands hang past the knee. */
const UPPER_ARM = 0.46;
const FOREARM = 0.5;

export function buildDroid(): RobotRig {
  const bones: Record<string, THREE.Object3D> = {};
  const parts: Record<string, THREE.Object3D> = {};
  const glow: THREE.MeshStandardMaterial[] = [];

  const root = new THREE.Group();
  root.name = 'droid';
  bones.root = root;

  /* --------------------------------------------------------------- palette */
  const panel = panelMaterial('#3c424c', 0.55, { roughness: 0.72, metalness: 0.42 });
  const panelDark = panelMaterial('#2a2f37', 0.5, { roughness: 0.75, metalness: 0.45 });
  const barrel = panelMaterial('#4a5058', 0.45, { roughness: 0.5, metalness: 0.72 });
  /*
   * Copper PATINA, not copper paint.
   *
   * At #9a5f30 with metalness 0.55 the hip caps and the shoulder rings caught
   * the key light and photographed as bright saturated orange pads — the most
   * saturated thing on a robot whose whole palette is weathered graphite. The
   * sheet's copper is a dull bloom on a panel edge. Darker, duller, and rougher
   * puts it back behind the silhouette where it belongs.
   */
  const copper = panelMaterial('#7d5334', 0.6, { roughness: 0.82, metalness: 0.32 });
  const grime = panelMaterial('#1b1e23', 0.3, { roughness: 0.9, metalness: 0.2 });
  // Amber. At intensity 2.4 the green channel clipped to 255 and Droid's eyes
  // photographed as lemon yellow — the one colour both the bio and GAUNTLET Stage 1
  // name for him. `#ffa63a` x 1.5 keeps R > G > B after the sRGB round trip.
  const eyeGlow = glowMaterial('#ffa63a', 1.5, '#1a1206');
  const statusGlow = glowMaterial('#d98a3a', 1.0, '#10160f');
  glow.push(eyeGlow, statusGlow);

  /** House weathering: copper bloom on graphite, blotchy rather than uniform. */
  const wear = (amount: number, seed: number, scale = 7): WeatherOpts => ({
    amount,
    seed,
    scale,
    tint: '#8a5a2b',
    grime: 0.35,
  });

  /* ------------------------------------------------------------- skeleton */
  const pelvis = joint(bones, root, 'pelvis', 0, HIP_Y, 0);
  const torso = joint(bones, pelvis, 'torso', 0, TORSO_Y - HIP_Y, 0);
  const neck = joint(bones, torso, 'neck', 0, NECK_Y - TORSO_Y, 0);
  const head = joint(bones, neck, 'head', 0, HEAD_Y - NECK_Y, 0);

  /* ---------------------------------------------------------------- torso */
  // Pelvis casing, hung below the waist between the two hip barrels.
  const pelvisBox = part(roundedBox(0.28, 0.2, 0.22, 0.05, 3), panel, wear(0.6, 11));
  pelvisBox.position.y = 0.01;
  pelvis.add(pelvisBox);
  const crotch = part(roundedBox(0.12, 0.14, 0.14, 0.04, 3), panelDark, wear(0.5, 12));
  crotch.position.set(0, -0.11, 0.01);
  pelvis.add(crotch);

  // Segmented abdomen: three plates stepping outward toward the chest, with the
  // dark spine column visible between them on the sheet's side views.
  const spine = part(new THREE.CylinderGeometry(0.052, 0.058, 0.26, 12, 3), grime, wear(0.4, 13));
  spine.position.y = 0.06;
  torso.add(spine);
  const abdomen: Array<[number, number, number]> = [
    [0.0, 0.2, 0.17],
    [0.075, 0.225, 0.185],
    [0.15, 0.25, 0.2],
  ];
  for (let i = 0; i < abdomen.length; i++) {
    const [ay, aw, ad] = abdomen[i];
    const seg = part(roundedBox(aw, 0.07, ad, 0.022, 3), panel, wear(0.55, 20 + i));
    seg.position.set(0, ay - 0.02, 0.005);
    torso.add(seg);
  }

  // Chest: the one broad mass on the whole robot.
  const chest = part(roundedBox(0.42, 0.29, 0.27, 0.06, 4), panel, wear(0.5, 31, 6));
  chest.position.set(0, 0.34, 0.0);
  torso.add(chest);
  parts.torsoShell = chest;
  const chestPlate = part(roundedBox(0.26, 0.2, 0.05, 0.03, 3), panelDark, wear(0.6, 32));
  chestPlate.position.set(0, 0.33, 0.14);
  torso.add(chestPlate);
  const accessPanel = part(roundedBox(0.1, 0.07, 0.02, 0.012, 2), barrel, wear(0.5, 33));
  accessPanel.position.set(0.055, 0.3, 0.165);
  torso.add(accessPanel);
  for (let i = 0; i < 3; i++) {
    const slat = part(roundedBox(0.075, 0.012, 0.016, 0.004, 2), grime);
    slat.position.set(-0.06, 0.38 - i * 0.022, 0.165);
    torso.add(slat);
  }
  // A single warm status pip, low on the chest plate. It used to be bright green,
  // which appears nowhere on the model sheet and read as a stray LED.
  const statusLamp = part(puck(0.009, 0.008, 12).rotateX(Math.PI / 2), statusGlow);
  statusLamp.position.set(0.055, 0.255, 0.168);
  torso.add(statusLamp);
  // Backpack hump — the sheet's back views have a raised panel between the blades.
  const backPack = part(roundedBox(0.24, 0.22, 0.09, 0.035, 3), panelDark, wear(0.6, 34));
  backPack.position.set(0, 0.34, -0.155);
  torso.add(backPack);

  /* ----------------------------------------------------------------- head */
  // Domed helmet, deeper than it is wide, unbroken from the crown to the jaw.
  const helmet = part(ellipsoid(0.135, 0.135, 0.152, 32, 22), panel, wear(0.5, 41, 9));
  helmet.position.set(0, 0.105, -0.012);
  head.add(helmet);
  parts.headShell = helmet;
  /*
   * ONE SMOOTH HELMET, AND A SMOOTH DARK FACEPLATE IN IT.
   *
   * There used to be two dark bands wrapped right round the helmet — a crown
   * patch and a brow patch — plus a rectangular brow shelf over a boxy faceplate
   * frame. None of that is on the model sheet, where the helmet is a single
   * smooth shell and the eyes are set straight into a dark oval face; together
   * the bands read as bandaging and the shelf as a welded-on visor. What is left
   * is one oval faceplate lying on the helmet's own surface.
   */
  const face = part(ovalPatch(0.137, 0.137, 0.154, 0, 0.78, 1.72, 0.44, 6, 32), grime);
  face.position.set(0, 0.105, -0.012);
  head.add(face);
  for (const sx of [-1, 1]) {
    const eye = part(puck(0.017, 0.012, 16).rotateX(Math.PI / 2), eyeGlow);
    eye.position.set(sx * 0.038, 0.048, 0.133);
    head.add(eye);
  }
  // Jaw/chin block and the cheek vents either side of it.
  const jaw = part(roundedBox(0.1, 0.05, 0.07, 0.02, 3), panelDark, wear(0.5, 45));
  jaw.position.set(0, 0.0, 0.075);
  head.add(jaw);
  for (const sx of [-1, 1]) {
    const cheek = part(roundedBox(0.032, 0.1, 0.075, 0.014, 3), panel, wear(0.55, 46));
    cheek.position.set(sx * 0.103, 0.045, 0.058);
    cheek.rotation.y = -sx * 0.25;
    head.add(cheek);
  }
  // Neck: a bare barrel with a cable collar, deliberately exposed.
  const neckMesh = part(new THREE.CylinderGeometry(0.042, 0.048, 0.1, 14, 2), barrel, wear(0.4, 47));
  neckMesh.position.y = 0.02;
  neck.add(neckMesh);
  const collar = part(new THREE.TorusGeometry(0.052, 0.012, 8, 20), grime);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.01;
  neck.add(collar);

  // Droid's lamp is a pool on the floor around it: anchored at chest height,
  // aimed straight down (+Z of the anchor points at the floor).
  const lampAnchor = new THREE.Object3D();
  lampAnchor.name = 'lamp';
  lampAnchor.position.set(0, 0.46, 0.08);
  lampAnchor.rotation.x = Math.PI / 2;
  torso.add(lampAnchor);

  /* ----------------------------------------------------------------- arms */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    /*
     * SHOULDER SPAN. 0.30 out, not 0.225.
     *
     * The sheet's front view puts the pauldron span at 0.44-0.47 of total height;
     * the build measured 0.334, which reads spindly rather than "broad-shouldered
     * and lanky" — and a three-quarter view foreshortens a shoulder mass, so the
     * angle could only widen that gap, never explain it. With the pauldron below
     * the outer edge now lands at 0.475 m either side: 0.45 of 2.1 m.
     */
    const shoulder = joint(bones, torso, `shoulder${L}`, side * 0.3, SHOULDER_Y - TORSO_Y, 0.0);
    const upper = joint(bones, shoulder, `upperArm${L}`, 0, 0, 0);
    const fore = joint(bones, upper, `forearm${L}`, 0, -UPPER_ARM, 0);
    const hand = joint(bones, fore, `hand${L}`, 0, -FOREARM, 0);

    // Exposed shoulder barrel.
    const shoulderBarrel = part(new THREE.CylinderGeometry(0.078, 0.078, 0.2, 18, 2), barrel, wear(0.45, 51));
    shoulderBarrel.rotation.z = Math.PI / 2;
    shoulder.add(shoulderBarrel);
    // Round pauldron with its circular emblem.
    const pauldron = part(ellipsoid(0.145, 0.118, 0.155, 28, 18), panel, wear(0.5, 52, 6));
    pauldron.position.set(side * 0.03, 0.02, 0.0);
    pauldron.rotation.z = -side * 0.22;
    shoulder.add(pauldron);

    // The circular emblem sits on the front-OUTER face of the pauldron, where the
    // sheet shows it in six of its ten views.
    //
    // It is parented to the pauldron, not to the shoulder, so the pauldron's own
    // tilt carries it, and it is placed at 1.13x the ellipsoid's surface along its
    // own normal. Placed as a sibling at (0.082, ., 0.072) it sat 4 cm INSIDE the
    // shell and both shoulders rendered as bare smooth domes.
    const emblemAt = new THREE.Object3D();
    // More frontal than before (0.76 out / 0.64 forward): at the diorama's and the
    // portrait's three-quarter angle the far shoulder's badge used to face away
    // entirely, so only one of the two "round shoulder pauldrons EACH with a
    // circular emblem" could be seen at once.
    const en = new THREE.Vector3(side * 0.56, 0.16, 0.81).normalize();
    const et = 1 / Math.hypot(en.x / 0.145, en.y / 0.118, en.z / 0.155);
    // Flush on the shell, not standing off it on a ring: at 1.06 the badge floated
    // proud with daylight under its rim and read as stray geometry.
    emblemAt.position.copy(en).multiplyScalar(et * 1.005);
    emblemAt.lookAt(en.clone().multiplyScalar(2));
    pauldron.add(emblemAt);
    const emblemRing = part(new THREE.TorusGeometry(0.046, 0.006, 8, 28), copper, wear(0.4, 53));
    emblemRing.position.z = -0.004;
    emblemAt.add(emblemRing);
    const emblemDisc = part(puck(0.046, 0.01, 24).rotateX(Math.PI / 2), panelDark, wear(0.5, 54));
    emblemDisc.position.z = -0.008;
    emblemAt.add(emblemDisc);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const spoke = part(roundedBox(0.01, 0.026, 0.008, 0.003, 2), copper);
      spoke.position.set(Math.cos(a) * 0.021, Math.sin(a) * 0.021, -0.001);
      spoke.rotation.z = -a;
      emblemAt.add(spoke);
    }

    /*
     * Copper at the shoulder is the JOINT RING and nothing else.
     *
     * Two free-standing copper slabs used to hang below it; from the portrait
     * angle they read as a bent wire dangling off the badge, and together with the
     * hip slabs and the thigh streaks they put copper on 3.6% of Droid's body
     * pixels against the sheet's 1.1%. Rust on this robot concentrates at joint
     * rings and panel edges, which is where the ring is.
     */
    const wornRing = part(new THREE.TorusGeometry(0.083, 0.009, 8, 22), copper, wear(0.9, 55));
    wornRing.rotation.y = Math.PI / 2;
    wornRing.position.set(side * 0.1, 0, 0);
    shoulder.add(wornRing);

    const upperMesh = part(new THREE.CylinderGeometry(0.062, 0.05, UPPER_ARM - 0.1, 14, 4), panel, wear(0.55, 58));
    upperMesh.position.y = -UPPER_ARM / 2;
    upper.add(upperMesh);
    const upperPlate = part(roundedBox(0.085, 0.2, 0.06, 0.02, 3), panelDark, wear(0.6, 59));
    upperPlate.position.set(0, -0.16, 0.035);
    upper.add(upperPlate);

    // Exposed elbow barrel, then the long forearm.
    const elbow = part(new THREE.CylinderGeometry(0.06, 0.06, 0.125, 16, 2), barrel, wear(0.45, 60));
    elbow.rotation.z = Math.PI / 2;
    fore.add(elbow);
    const foreMesh = part(new THREE.CylinderGeometry(0.055, 0.042, FOREARM - 0.09, 14, 4), panel, wear(0.55, 61));
    foreMesh.position.y = -FOREARM / 2 - 0.01;
    fore.add(foreMesh);
    const forePlate = part(roundedBox(0.075, 0.3, 0.055, 0.018, 3), panelDark, wear(0.6, 62));
    forePlate.position.set(0, -0.24, 0.028);
    fore.add(forePlate);
    const foreBand = part(new THREE.TorusGeometry(0.05, 0.01, 8, 20), barrel, wear(0.4, 63));
    foreBand.rotation.x = Math.PI / 2;
    foreBand.position.y = -0.36;
    fore.add(foreBand);

    // Wrist barrel and an articulated four-finger hand.
    const wrist = part(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 14, 1), barrel, wear(0.4, 64));
    wrist.rotation.z = Math.PI / 2;
    hand.add(wrist);
    const palm = part(roundedBox(0.085, 0.105, 0.048, 0.016, 3), panel, wear(0.55, 65));
    palm.position.y = -0.06;
    hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * 0.024;
      const finger = new THREE.Object3D();
      finger.position.set(fx, -0.108, 0.006);
      finger.rotation.x = -0.12 - i * 0.03;
      hand.add(finger);
      bones[`finger${L}${i}`] = finger;
      const seg1 = part(roundedBox(0.019, 0.05, 0.02, 0.008, 2), panelDark);
      seg1.position.y = -0.025;
      finger.add(seg1);
      const knuckle = new THREE.Object3D();
      knuckle.position.y = -0.05;
      knuckle.rotation.x = -0.35;
      finger.add(knuckle);
      const seg2 = part(roundedBox(0.016, 0.042, 0.017, 0.007, 2), panelDark);
      seg2.position.y = -0.021;
      knuckle.add(seg2);
    }
    const thumb = new THREE.Object3D();
    thumb.position.set(side * 0.045, -0.08, 0.012);
    thumb.rotation.set(-0.3, 0, side * 0.8);
    hand.add(thumb);
    const thumbSeg = part(roundedBox(0.018, 0.045, 0.018, 0.007, 2), panelDark);
    thumbSeg.position.y = -0.022;
    thumb.add(thumbSeg);

    // Hunched, arms slightly forward and splayed — the sheet's default stance.
    shoulder.rotation.x = -0.1;
    shoulder.rotation.z = side * 0.055;
    fore.rotation.x = -0.16;
  }

  /* ----------------------------------------------------------------- legs */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const hip = joint(bones, pelvis, `hip${L}`, side * 0.125, 0, 0);
    const thigh = joint(bones, hip, `thigh${L}`, 0, 0, 0);
    const shin = joint(bones, thigh, `shin${L}`, 0, -THIGH, 0);
    const foot = joint(bones, shin, `foot${L}`, 0, -SHIN, 0);

    // Exposed hip barrel with a copper-bloomed cap: one of Droid's signatures.
    const hipBarrel = part(new THREE.CylinderGeometry(0.088, 0.088, 0.12, 20, 2), barrel, wear(0.5, 71));
    hipBarrel.rotation.z = Math.PI / 2;
    hip.add(hipBarrel);
    // The cap itself is graphite; the copper is the RING round its edge, which
    // is where a patina actually blooms. A solid copper disc 0.14 m across read
    // as a painted orange pad on the widest part of the hip.
    const hipCap = part(puck(0.07, 0.03, 20).rotateZ(Math.PI / 2), barrel, wear(0.6, 72));
    hipCap.position.x = side * 0.07;
    hip.add(hipCap);
    const hipPatina = part(new THREE.TorusGeometry(0.063, 0.008, 8, 22), copper, wear(0.9, 74));
    hipPatina.rotation.y = Math.PI / 2;
    hipPatina.position.x = side * 0.083;
    hip.add(hipPatina);
    /*
     * Rust at the hip is the cap and one short bleed off its edge.
     *
     * The second, longer patch ran down the outside of the thigh and read as a
     * smooth flame-shaped paint stroke rather than as rust concentrated at a panel
     * edge — see the shoulder-ring comment for the pixel counts.
     */
    const hipBleed = part(roundedBox(0.013, 0.05, 0.04, 0.006, 2), copper, wear(0.95, 73));
    hipBleed.position.set(side * 0.068, -0.07, 0.032);
    hip.add(hipBleed);

    const thighMesh = part(new THREE.CylinderGeometry(0.082, 0.068, THIGH - 0.1, 14, 4), panel, wear(0.55, 75));
    thighMesh.position.y = -THIGH / 2;
    thigh.add(thighMesh);
    const thighPlate = part(roundedBox(0.11, 0.26, 0.07, 0.025, 3), panelDark, wear(0.6, 76));
    thighPlate.position.set(0, -0.2, 0.038);
    thigh.add(thighPlate);

    // Exposed knee barrel.
    const kneeBarrel = part(new THREE.CylinderGeometry(0.075, 0.075, 0.13, 18, 2), barrel, wear(0.5, 77));
    kneeBarrel.rotation.z = Math.PI / 2;
    shin.add(kneeBarrel);
    const kneeCap = part(puck(0.058, 0.026, 18).rotateZ(Math.PI / 2), panelDark, wear(0.6, 78));
    kneeCap.position.x = side * 0.066;
    shin.add(kneeCap);

    const shinMesh = part(new THREE.CylinderGeometry(0.066, 0.05, SHIN - 0.1, 14, 4), panel, wear(0.55, 79));
    shinMesh.position.y = -SHIN / 2;
    shin.add(shinMesh);
    const shinPlate = part(roundedBox(0.095, 0.3, 0.06, 0.022, 3), panelDark, wear(0.6, 80));
    shinPlate.position.set(0, -0.22, 0.035);
    shin.add(shinPlate);
    const calfCable = part(new THREE.CapsuleGeometry(0.014, SHIN - 0.2, 4, 8), grime);
    calfCable.position.set(side * 0.02, -SHIN / 2, -0.05);
    shin.add(calfCable);

    // Exposed ankle barrel and a flat blocky foot.
    const ankle = part(new THREE.CylinderGeometry(0.05, 0.05, 0.095, 14, 1), barrel, wear(0.45, 81));
    ankle.rotation.z = Math.PI / 2;
    foot.add(ankle);
    const boot = part(roundedBox(0.135, 0.085, 0.29, 0.022, 3), panel, wear(0.65, 82, 6));
    boot.position.set(0, -0.0475, 0.045);
    foot.add(boot);
    const toePlate = part(roundedBox(0.125, 0.04, 0.08, 0.012, 2), panelDark, wear(0.7, 83));
    toePlate.position.set(0, -0.055, 0.16);
    foot.add(toePlate);
    const heelBlock = part(roundedBox(0.1, 0.06, 0.06, 0.015, 2), panelDark, wear(0.7, 84));
    heelBlock.position.set(0, -0.05, -0.085);
    foot.add(heelBlock);
    for (const bx of [-1, 1]) {
      const rivet = bolt(barrel, 0.008, 0.006);
      rivet.position.set(bx * 0.06, -0.02, 0.05);
      rivet.rotation.z = (bx * Math.PI) / 2;
      foot.add(rivet);
    }
  }

  // The forward hunch. Applied to the base pose so every gait and idle state
  // inherits it: Droid never stands up straight.
  torso.rotation.x = 0.12;
  neck.rotation.x = -0.06;
  head.rotation.x = -0.03;

  assertBones('droid', bones);

  return {
    kind: 'droid',
    root,
    bones,
    parts,
    height: ROBOT_HEIGHT_M.droid,
    glow,
    lampAnchor,
    dispose: () => disposeTree(root),
  };
}
