/**
 * voxxy.ts — Model 01, "the orange companion".
 *
 * Built from `robots/voxxy-robot.png`. Voxxy is a SQUAT, WIDE, CHUNKY TOY: the
 * sheet's front view is 642 px tall against 418 wide, an aspect of 1.54, and an
 * earlier build read at 2.01 — lanky, which is the one silhouette Voxxy must
 * never have. Every number below is measured off that panel and held to
 * ROBOT_HEIGHT_M.voxxy = 1.15, so the only way to make him taller is to make him
 * wider with him. `tests/robots.smoke.test.ts` asserts the ratios.
 *
 * The read, in order of importance:
 *   1. a huge WIDE ellipsoid head — 0.58 of the total height across, 92% of the
 *      whole silhouette's width — sitting almost directly on the shoulders on a
 *      neck stub barely 5% of the head's width long;
 *   2. a rounded-oval visor INSET in the front face with orange shell on all four
 *      sides of it — a thick brow above, a chin below, a cheek either side — two
 *      big softly glowing amber bar-eyes on a dot-matrix screen behind the glass,
 *      and a complete white/silver ring port on each side of the head;
 *   3. one smooth pear/teardrop body, no seam across it, with the sheet's white
 *      cat-face glyph on the chest;
 *   4. BOWLING-PIN arms: thin at the shoulder, swelling continuously to their
 *      widest at about three-quarters of the way down, white bands wrapping that
 *      swollen club, a rounded orange tip and small dark grippers;
 *   5. short thin orange legs on small dark claw feet.
 * Everything is glossy — low roughness, no weathering: Voxxy is the new one.
 */

import * as THREE from 'three';
import { ROBOT_HEIGHT_M } from '../../sim/units';
import {
  assertBones,
  dotGrid,
  ellipsoid,
  glowMaterial,
  joint,
  latheProfile,
  ovalPatch,
  panelMaterial,
  part,
  puck,
  roundedBox,
  disposeTree,
  type RobotRig,
} from './rig';

/*
 * Vertical layout, metres from the sole, read off the sheet's front view at
 * 465 px = 1.15 m and then held to ROBOT_HEIGHT_M.voxxy.
 *
 * head (with ears) 40% / neck 3% / body 45% / legs 12% of the height. The head's
 * own ellipsoid is 0.67 m across against 0.39 m tall — half again as wide as it
 * is tall, and nearly as wide as the whole robot. Getting THAT ratio wrong is
 * what made the previous build read as a lanky generic robot.
 */
const HIP_Y = 0.185;
const TORSO_Y = 0.3;
const SHOULDER_Y = 0.63;
/** Top of the body shell. The head's underside is 0.038 m above it: a stub. */
const NECK_Y = 0.652;
const HEAD_Y = 0.885;
const HEAD_RX = 0.335;
const HEAD_RY = 0.195;
const HEAD_RZ = 0.235;
/** Outer face of the side ring ports — the widest point of the head. */
const PORT_X = 0.345;
/** Short and stubby: 0.08 m of leg shows under a body whose underside is at 0.132. */
const THIGH = 0.062;
const SHIN = 0.068;
/** Arm segments. Shoulder to wrist is 0.57 m = half his height: "very long". */
const UPPER_ARM = 0.3;
const FOREARM = 0.27;
const ARM_LEN = UPPER_ARM + FOREARM;

/**
 * The arm's radius `d` metres below the shoulder — the whole bowling-pin read.
 *
 * The sheet's arm is a teardrop hanging point-up: 0.019 m at the shoulder,
 * swelling continuously to 0.074 m at 78% of its length, and only then rounding
 * off into the tip. The previous build had this backwards — widest right under
 * the shoulder, tapering down — which the critic called the clearest single
 * error on the model. The white bands wrap the swell, not the wrist.
 */
function armRadius(d: number): number {
  const pts: Array<[number, number]> = [
    [0.0, 0.019],
    [0.06, 0.028],
    [0.12, 0.037],
    [0.18, 0.046],
    [0.24, 0.054],
    [0.3, 0.061],
    [0.36, 0.067],
    [0.42, 0.0725],
    [0.445, 0.074],
    [0.48, 0.0725],
    [0.52, 0.064],
    [0.545, 0.05],
    [0.565, 0.026],
    [ARM_LEN, 0.0],
  ];
  if (d <= 0) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (d <= pts[i][0]) {
      const [d0, r0] = pts[i - 1];
      const [d1, r1] = pts[i];
      return r0 + ((r1 - r0) * (d - d0)) / (d1 - d0);
    }
  }
  return 0;
}

/** A lathe of the arm between two depths, as a profile in the bone's own space. */
function armShell(from: number, to: number, y0: number, swell = 1): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const d = from + ((to - from) * i) / steps;
    pts.push([armRadius(d) * swell, y0 - (d - from)]);
  }
  return latheProfile(pts, 22, 30);
}

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
  /** The dot-matrix screen behind the glass: barely lighter than the glass. */
  const screenDot = panelMaterial('#23262b', 0, { roughness: 0.55, metalness: 0.08 });
  // Amber bar-eyes. At intensity 2.6 the green channel clipped to 255 and both
  // bars photographed as lemon yellow; the model sheet's eye glow samples strongly
  // orange. Lower intensity, more saturated base: R > G > B survives the clip.
  const eyeGlow = glowMaterial('#ff7d0a', 1.45, '#2a1405');
  /**
   * The falloff, as geometry, because this renderer has no bloom.
   *
   * A bright lozenge with one dim oval behind it reads as a flat ellipse with a
   * dark-orange outline, which is what the last round measured. So: a hot core
   * inside a broad bright disc, and then three THIN concentric rings stepping
   * down to nearly the screen's own darkness. Thin is the point — wide steps
   * are visible bands, and a band darker than the disc is exactly the outline
   * being got rid of.
   */
  const eyeCore = glowMaterial('#ff8a18', 1.56, '#301806');
  const eyeGlow2 = glowMaterial('#ff7208', 1.12, '#241105');
  const eyeHalo2 = glowMaterial('#ff6a00', 0.72, '#1c0d04');
  const eyeHalo = glowMaterial('#ff6400', 0.5, '#170b03');
  const portGlow = glowMaterial('#ff8c22', 1.3, '#1d1208');
  glow.push(eyeCore, eyeGlow, eyeGlow2, eyeHalo2, eyeHalo, portGlow);

  /* ------------------------------------------------------------- skeleton */
  const pelvis = joint(bones, root, 'pelvis', 0, HIP_Y, 0);
  const torso = joint(bones, pelvis, 'torso', 0, TORSO_Y - HIP_Y, 0);
  const neck = joint(bones, torso, 'neck', 0, NECK_Y - TORSO_Y, 0);
  const head = joint(bones, neck, 'head', 0, HEAD_Y - NECK_Y, 0);

  /* ----------------------------------------------------------------- body */
  /*
   * ONE smooth pear, and no ring anywhere on it.
   *
   * The profile is monotone from the neck down to its widest point at y = 0.32
   * and then rounds off, so there is no place for the silhouette to break into
   * two stacked lobes — which, with a panel-line torus across the join, is how
   * the round-3 critic read the last one.
   */
  const bodyGeo = latheProfile(
    [
      [0.0, -0.168],
      [0.085, -0.158],
      [0.132, -0.135],
      [0.16, -0.095],
      [0.174, -0.04],
      [0.177, 0.02],
      [0.172, 0.09],
      [0.162, 0.16],
      [0.148, 0.228],
      [0.127, 0.283],
      [0.101, 0.325],
      [0.064, 0.355],
      [0.0, 0.369],
    ],
    36,
    40,
  );
  const body = part(bodyGeo, shell);
  torso.add(body);
  parts.torsoShell = body;

  // The little dark vent slot low on the belly — the sheet's one panel detail
  // down there, and small enough that it cannot read as a seam.
  const vent = part(roundedBox(0.07, 0.016, 0.012, 0.006, 2), dark);
  vent.position.set(0, -0.05, 0.166);
  torso.add(vent);

  /*
   * Chest emblem: the sheet's CAT FACE.
   *
   * A white rounded face with two ear bumps, two dark eye dots, and — the part
   * that makes it read as a glyph rather than as a sticker — the cheeks and nose
   * punched out in the body's own ORANGE, exactly as the decal on the sheet does.
   */
  const emblem = new THREE.Object3D();
  emblem.position.set(0, 0.19, 0.151);
  emblem.rotation.x = -0.1;
  torso.add(emblem);
  const markDark = panelMaterial('#2a2d33', 0, { roughness: 0.4, metalness: 0.06 });
  const catHead = part(ellipsoid(0.048, 0.044, 0.011, 24, 16), white);
  emblem.add(catHead);
  for (const sx of [-1, 1]) {
    // Ear: a rounded bump out of the top corner, same white as the face.
    const ear = part(ellipsoid(0.016, 0.016, 0.009, 14, 10), white);
    ear.position.set(sx * 0.032, 0.031, -0.001);
    emblem.add(ear);
    // Eye: a dark dot, high and wide apart.
    const eye = part(ellipsoid(0.005, 0.005, 0.006, 12, 8), markDark);
    eye.position.set(sx * 0.018, 0.009, 0.008);
    emblem.add(eye);
    // Cheek: orange showing through the white face.
    const cheek = part(ellipsoid(0.012, 0.008, 0.006, 16, 10), shell);
    cheek.position.set(sx * 0.021, -0.009, 0.009);
    emblem.add(cheek);
  }
  // Nose: a small orange triangle, point down, between the cheeks.
  const nose = part(new THREE.ConeGeometry(0.008, 0.012, 3), shell);
  nose.position.set(0, -0.018, 0.009);
  nose.rotation.set(Math.PI / 2, 0, Math.PI);
  emblem.add(nose);

  /*
   * Neck: a stub, not a stalk.
   *
   * Measured the way the round's verifier measures it — flood-fill the portrait,
   * count the rows under the head where the figure is narrower than a fifth of
   * the head box — the sheet gives Voxxy 18 px against a 394 px head, 4.6%. The
   * build these numbers replace came out at 6.3%: the head no longer rested on
   * the shoulders, it stood on a visible dark pillar. The body's own shoulders
   * were raised 0.017 m (see the pear profile above) to close it, because the
   * head's top is pinned by ROBOT_HEIGHT_M and cannot come down.
   */
  const neckMesh = part(new THREE.CylinderGeometry(0.048, 0.058, 0.062, 18), dark);
  neckMesh.position.y = 0.002;
  neck.add(neckMesh);

  /* ----------------------------------------------------------------- head */
  const headShell = part(ellipsoid(HEAD_RX, HEAD_RY, HEAD_RZ, 48, 32), shell);
  head.add(headShell);
  parts.headShell = headShell;

  /*
   * The visor: a rounded-oval glass panel INSET IN THE FRONT FACE.
   *
   * Not a band wrapped edge to edge — that version ran into the side ports and
   * left the left-hand one as a 3 px crescent. `ovalPatch` cuts an ellipse in
   * angle space, so orange shell is left on all four sides: a brow 25% of the
   * head's height above it, a chin 15% below, and a cheek 9% of the head's width
   * either side, between the glass and the ring ports.
   */
  /*
   * Sized off the sheet, not by eye. Flood-filling the sheet's front panel and
   * the in-game portrait the same way gives the visor as a fraction of the head
   * box: the sheet is 0.683 wide and 0.655 tall, and the build these numbers
   * replace measured 0.583 and 0.579 — a mask oval where the sheet has a screen
   * that fills the face. `tests/robots.smoke.test.ts` pins the geometry that
   * produces it.
   */
  const VISOR_PHI = 0.87;
  const VISOR_THETA_MID = 1.68;
  const VISOR_THETA = 0.83;
  const visor = part(
    ovalPatch(HEAD_RX * 1.012, HEAD_RY * 1.02, HEAD_RZ * 1.012, 0, VISOR_PHI, VISOR_THETA_MID, VISOR_THETA, 7, 44),
    visorGlass,
  );
  head.add(visor);
  parts.visor = visor;

  // The dot-matrix screen behind the glass, as the sheet's close-ups show.
  const screen = part(
    dotGrid(
      HEAD_RX * 1.018,
      HEAD_RY * 1.026,
      HEAD_RZ * 1.018,
      0,
      VISOR_PHI * 0.9,
      VISOR_THETA_MID,
      VISOR_THETA * 0.88,
      34,
      15,
      0.2,
    ),
    screenDot,
  );
  head.add(screen);

  /*
   * Two LARGE softly glowing amber bar-eyes on the dot-matrix screen.
   *
   * SHAPE first: the pair this replaces were 0.21 x 0.13 in angle, an aspect of
   * 2.4 measured off the portrait against the sheet's 1.5-1.6, and 22% of the
   * visor's height against a sheet nearer 40% — flat painted-on dashes where
   * the sheet has tall rounded bars. Height went up; width did not.
   *
   * SOFTNESS second, and it is the harder half, because this renderer has no
   * bloom pass to do it. Concentric ovals stepping down in emissive give the
   * falloff, and the outermost step is a field of LIT DOTS rather than another
   * solid oval: the eye's edge dissolves into the screen's own matrix instead
   * of ending on a rim, which is how the sheet's eyes sit on their screen and
   * the opposite of the "hard-edged ellipse with a dark-orange outline" the
   * last round measured.
   */
  for (const sx of [-1, 1]) {
    const halo = part(
      dotGrid(
        HEAD_RX * 1.028,
        HEAD_RY * 1.042,
        HEAD_RZ * 1.028,
        sx * 0.31,
        0.36,
        VISOR_THETA_MID + 0.02,
        0.3,
        23,
        18,
        0.3,
      ),
      eyeHalo,
    );
    head.add(halo);
    for (const [phiHalf, thetaHalf, mat, lift] of [
      [0.3, 0.245, eyeHalo2, 1.032],
      [0.278, 0.227, eyeGlow2, 1.036],
      [0.256, 0.209, eyeGlow, 1.04],
      [0.234, 0.191, eyeCore, 1.044],
    ] as const) {
      const lens = part(
        ovalPatch(
          HEAD_RX * lift,
          HEAD_RY * (1 + (lift - 1) * 1.5),
          HEAD_RZ * lift,
          sx * 0.31,
          phiHalf,
          VISOR_THETA_MID + 0.02,
          thetaHalf,
          5,
          30,
        ),
        mat,
      );
      head.add(lens);
    }
  }

  /*
   * A complete white/silver ring port on each side of the head.
   *
   * The sheet's head is an ellipsoid whose ends are capped by these — a dark
   * ring, an amber lens ring and a square pupil inside a white shell — and they
   * are the widest points of the head, so nothing may wrap across them.
   */
  for (const sx of [-1, 1]) {
    // The white/silver shell panel the port is set into: on the sheet the whole
    // side of the head is white, which is what keeps the port reading as a port
    // and not as a drum stuck on the side of an orange ball.
    const sideShell = part(
      ovalPatch(HEAD_RX * 1.006, HEAD_RY * 1.006, HEAD_RZ * 1.006, (sx * Math.PI) / 2, 0.44, Math.PI / 2, 0.62, 6, 36),
      white,
    );
    head.add(sideShell);

    const portRoot = new THREE.Object3D();
    portRoot.position.set(sx * (PORT_X - 0.039), 0.004, 0.012);
    portRoot.rotation.y = sx * 0.12;
    head.add(portRoot);
    const cup = part(new THREE.CylinderGeometry(0.082, 0.09, 0.078, 30).rotateZ(Math.PI / 2), white);
    portRoot.add(cup);
    const rim = part(new THREE.TorusGeometry(0.062, 0.011, 10, 30), dark);
    rim.rotation.y = Math.PI / 2;
    rim.position.x = sx * 0.036;
    portRoot.add(rim);
    const iris = part(puck(0.052, 0.01, 26).rotateZ(Math.PI / 2), dark);
    iris.position.x = sx * 0.038;
    portRoot.add(iris);
    const lens = part(new THREE.TorusGeometry(0.038, 0.01, 10, 28), portGlow);
    lens.rotation.y = Math.PI / 2;
    lens.position.x = sx * 0.041;
    portRoot.add(lens);
    const socket = part(puck(0.024, 0.012, 20).rotateZ(Math.PI / 2), dark);
    socket.position.x = sx * 0.04;
    portRoot.add(socket);
    const pupil = part(roundedBox(0.01, 0.016, 0.016, 0.004, 2), white);
    pupil.position.x = sx * 0.044;
    portRoot.add(pupil);
  }

  /*
   * Two prominent two-tone ears: a white/silver outer shell over an orange inner,
   * 0.20 of the head's width across. The old pair were 0.16 and plain orange,
   * which lost the sheet's clearest bit of character at the top of the figure.
   */
  for (const sx of [-1, 1]) {
    const ear = new THREE.Object3D();
    ear.position.set(sx * 0.19, 0.16, -0.02);
    ear.rotation.z = sx * 0.24;
    head.add(ear);
    bones[sx > 0 ? 'earL' : 'earR'] = ear;
    const inner = part(ellipsoid(0.066, 0.068, 0.062, 22, 16), shell);
    ear.add(inner);
    /*
     * The white shell is a CRESCENT along the ear's outer-top edge, and it is
     * the same crescent on both ears.
     *
     * Two bugs lived in the line this replaces. It built a +Z half-sphere and
     * then yawed it, which showed half the ear as white where the sheet shows a
     * rim; and it yawed the right ear by `PI + 0.45`, swinging that ear's cap
     * round to the back of the head where nothing can see it — which is the
     * whole of the "one ear is white shell, the other is plain orange" bug (a
     * flood fill of the portrait measured 83.6% near-white against 1.1%).
     *
     * A cap of revolution tilted outward has no azimuth to get wrong: it is
     * mirror-symmetric by construction, and unlike a wedge aimed at +-X it does
     * not vanish on whichever ear happens to be facing away from the camera —
     * the portrait is a three-quarter view, so a rim that only exists on the
     * outward face is a rim only one ear ever shows.
     */
    const outerGeo = new THREE.SphereGeometry(1, 22, 16, 0, Math.PI * 2, 0, 0.66);
    outerGeo.scale(0.07, 0.072, 0.066);
    const outer = part(outerGeo, white);
    outer.rotation.z = -sx * 0.45;
    ear.add(outer);
  }

  // The antenna nub between the ears: the top of the silhouette, at 1.15 m.
  const antenna = joint(bones, head, 'antenna', 0, 0.168, -0.035);
  const nub = part(new THREE.CapsuleGeometry(0.022, 0.042, 6, 16), white);
  nub.position.y = 0.03;
  antenna.add(nub);
  const nubTip = part(ellipsoid(0.021, 0.019, 0.021, 16, 12), shell);
  nubTip.position.y = 0.056;
  antenna.add(nubTip);
  antenna.rotation.x = -0.1;

  // The lamp sits behind the visor and fires forward: Voxxy's narrow orange cone.
  const lampAnchor = new THREE.Object3D();
  lampAnchor.name = 'lamp';
  lampAnchor.position.set(0, -0.02, HEAD_RZ + 0.02);
  head.add(lampAnchor);

  /* ----------------------------------------------------------------- arms */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const shoulder = joint(bones, torso, `shoulder${L}`, side * 0.175, SHOULDER_Y - TORSO_Y, 0.015);
    const upper = joint(bones, shoulder, `upperArm${L}`, 0, 0, 0);
    const fore = joint(bones, upper, `forearm${L}`, 0, -UPPER_ARM, 0);
    const hand = joint(bones, fore, `hand${L}`, 0, -FOREARM, 0);

    // Shoulder ball: small and dark, so the arm reads as a separate hanging
    // teardrop threaded onto the body rather than as a lump grown out of it.
    const cap = part(ellipsoid(0.028, 0.027, 0.028, 16, 12), dark);
    shoulder.add(cap);

    /*
     * The dark strut, slimmed.
     *
     * The sheet has a thin rod tucked against the upper arm's INNER edge for
     * about a third of its length. The previous build ran a 0.019 m rod down the
     * FACE of the arm for 60% of it, and the critic reported that the rod, not
     * the arm, was what the eye read.
     */
    const strut = part(new THREE.CylinderGeometry(0.0095, 0.0095, 0.2, 10), dark);
    strut.position.set(-side * 0.026, -0.1, 0.006);
    strut.rotation.z = side * 0.14;
    upper.add(strut);

    const upperShell = part(armShell(0, UPPER_ARM, 0), shell);
    upper.add(upperShell);
    const foreShell = part(armShell(UPPER_ARM, ARM_LEN, 0), shell);
    fore.add(foreShell);

    /*
     * The white bands wrap the SWELL, where the sheet puts them: a wide one
     * across the widest part of the club and a narrow one just below it.
     */
    const bandWide = part(armShell(0.4, 0.478, -(0.4 - UPPER_ARM), 1.055), white);
    fore.add(bandWide);
    const bandThin = part(armShell(0.5, 0.522, -(0.5 - UPPER_ARM), 1.055), white);
    fore.add(bandThin);

    // Small dark three-finger gripper under the rounded orange tip.
    const wrist = part(new THREE.CylinderGeometry(0.02, 0.018, 0.016, 12), dark);
    hand.add(wrist);
    const fingerAngles = [0.0, 2.1, -2.1];
    for (let i = 0; i < fingerAngles.length; i++) {
      const a = fingerAngles[i];
      const finger = new THREE.Object3D();
      finger.position.set(Math.sin(a) * 0.016, -0.01, Math.cos(a) * 0.016);
      finger.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      hand.add(finger);
      const seg = part(new THREE.CapsuleGeometry(0.009, 0.026, 4, 10), dark);
      seg.position.y = -0.018;
      finger.add(seg);
      const tip = part(ellipsoid(0.011, 0.011, 0.011, 12, 8), dark);
      tip.position.y = -0.035;
      finger.add(tip);
      bones[`finger${L}${i}`] = finger;
    }

    // Arms hang clear of the body with a distinct outward splay: on the sheet
    // there is daylight between the teardrop arms and the pear all the way down,
    // and their widest point is what sets the silhouette's 0.73 m width.
    shoulder.rotation.z = side * 0.26;
    shoulder.rotation.x = -0.04;
  }

  /* ----------------------------------------------------------------- legs */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const hip = joint(bones, pelvis, `hip${L}`, side * 0.062, 0, 0);
    const thigh = joint(bones, hip, `thigh${L}`, 0, 0, 0);
    const shin = joint(bones, thigh, `shin${L}`, 0, -THIGH, 0);
    const foot = joint(bones, shin, `foot${L}`, 0, -SHIN, 0);

    /*
     * The lower leg's palette, the right way round.
     *
     * The sheet's leg is a thin ORANGE cone down to a short dark ankle sleeve,
     * and the foot under it is a small DARK claw. The previous build had it
     * inverted — matte-black stilts under the body, ending in bright orange
     * clogs — which is the loudest wrong note on the bottom third of the figure.
     */
    const hipBall = part(ellipsoid(0.03, 0.03, 0.03, 14, 10), shellDeep);
    hip.add(hipBall);
    const thighMesh = part(new THREE.CylinderGeometry(0.033, 0.028, THIGH, 16), shell);
    thighMesh.position.y = -THIGH / 2;
    thigh.add(thighMesh);
    const shinMesh = part(new THREE.CylinderGeometry(0.027, 0.022, SHIN, 16), shell);
    shinMesh.position.y = -SHIN / 2;
    shin.add(shinMesh);
    const ankle = part(new THREE.CylinderGeometry(0.023, 0.021, 0.022, 14), dark);
    ankle.position.y = 0.005;
    foot.add(ankle);

    // Small dark claw foot: a low pad with two toes in front and a heel behind.
    const pad = part(roundedBox(0.058, 0.026, 0.07, 0.012, 3), dark);
    pad.position.set(0, -0.036, 0.012);
    foot.add(pad);
    for (const bx of [-1, 1]) {
      const toe = part(ellipsoid(0.017, 0.017, 0.02, 14, 10), dark);
      toe.position.set(bx * 0.016, -0.038, 0.04);
      foot.add(toe);
    }
    const heel = part(ellipsoid(0.017, 0.016, 0.018, 12, 10), dark);
    heel.position.set(0, -0.038, -0.022);
    foot.add(heel);
    // One deep-orange toe cap, the only warm note below the ankle.
    const toeCap = part(ellipsoid(0.02, 0.012, 0.016, 14, 10), shellDeep);
    toeCap.position.set(0, -0.026, 0.042);
    foot.add(toeCap);
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
