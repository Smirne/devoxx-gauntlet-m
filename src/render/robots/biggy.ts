/**
 * biggy.ts — Model 03, "a stocky little heavyweight with blue-gray armor and a
 * weathered orange belly".
 *
 * Built from `robots/biggy-robot.png`. The read is ONE THING: **a huge gut
 * bulging out from under a smaller tin hat.**
 *
 * Flood-fill the sheet's front view and it is 390 px tall; the gut is 320 px
 * across (0.82 of the height), the dome 255 (0.80 of the gut, so the gut
 * overhangs it on every side), and the widest row of the whole figure is 378 px
 * (0.97) — the arms, hanging OUTSIDE the gut. One build had the belly at 0.70 of
 * the height and the dome at 0.96 of the belly: the mass had migrated into the
 * arms and the helmet, and the character went with it. The next over-corrected
 * to 0.93 by reading the figure's total width as the gut's, which buried the
 * arms inside the gut. All three ratios are asserted in
 * `tests/robots.smoke.test.ts` so none of them can drift again.
 *
 * The rest, in order:
 *   - a blue-gray armoured dome fused on top, with the sheet's PAIRED front
 *     rivet ports, side nubs, crown bolts and a thin whip antenna;
 *   - a dark visor band in the recess under the dome's rim;
 *   - short stubby dark arms — low-profile slabs that barely clear the belly,
 *     not limbs — with small clawed hands;
 *   - very short thick legs with ribbed ankle bellows in the darkest, chunkiest
 *     boots on the model;
 *   - horizontal latitude seams and heavy rust patina on the belly, and a MUTED
 *     ring glyph that does not out-shout the silhouette.
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
  latheProfile,
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
 * Measured off the sheet's FRONT VIEW at 390 px = 1.45 m: dome crown 100% ->
 * dome rim 77% -> belly widest 59% -> belly bottom / belt 28% -> boot top 10% ->
 * sole 0. Across, at the same scale: belly 1.20 m, dome 0.96 m, and the arms
 * hanging 0.1 m outside the belly's own width.
 */
const ANKLE_Y = 0.13;
const KNEE_Y = 0.27;
const HIP_Y = 0.43;
const TORSO_Y = 0.5;
const SHOULDER_Y = 0.88;
const NECK_Y = 1.06;
/** The dome's base — the helmet is fused straight onto the belly. */
const HEAD_Y = 1.13;
const SHIN = KNEE_Y - ANKLE_Y;
const THIGH = HIP_Y - KNEE_Y;
/*
 * THE BELLY, AND WHY IT IS NOT AS WIDE AS IT WAS.
 *
 * Flood-filling the sheet's FRONT VIEW panel: the figure is 390 px from the
 * crown of the dome to the sole; the widest row that is still orange — the gut
 * itself — is 320 px, at 59% of the height; and the widest row of all, 378 px,
 * is lower down, where the ARMS are outside the gut's own outline. So on the
 * sheet the belly is 0.82 of the height and the whole figure is 0.97 of it.
 *
 * The build this replaces had the belly at 0.93 of the height, from reading the
 * sheet's total width as the belly's. The cost was not just the proportion: a
 * belly of revolution 1.35 m across swallows anything hanging inside its own
 * radius, so from the portrait's three-quarter view the far arm disappeared
 * into it and came back as a shard above and a floating claw 140 px below. A
 * gut at the sheet's own width leaves the arms outside it, which is how the
 * sheet draws them and the only way the far arm can read as one limb.
 */
const BELLY_TOP = 1.15;
/** The widest point of the gut: 1.20 m across = 0.83 of his height (sheet 0.82). */
const BELLY_MAX_R = 0.6;
/** Where it is widest, 0.55 of the height — the sheet's is at 0.59. */
const BELLY_MAX_Y = 0.8;
/** Dome: 0.96 m across = 0.80 of the belly, so the belly overhangs it all round. */
const HELM_R = 0.478;
const HELM_H = 0.32;
/**
 * The dark visor band in the recess between the belly's shoulder and the dome's
 * rim. The belly is 0.86 across at the band's own height and the rim flares to
 * 0.94, so a 0.90-wide band stands 0.02 proud of the belly and sits 0.02 inside
 * the rim: a real slot, readable from anywhere the diorama camera can stand.
 */
const BAND_Y0 = 1.045;
const BAND_Y1 = 1.135;
const BAND_R = 0.452;
/**
 * Stubby arms, hung OUTSIDE the gut.
 *
 * `SHOULDER_X + half the slab` is 0.705, a tenth of a metre past the belly's
 * widest radius, and the pair are set 0.09 m forward of the belly's axis. Both
 * numbers are there for the same reason: the portrait camera stands 34 degrees
 * off the front, which foreshortens an arm's sideways offset by cos 34 = 0.83
 * while leaving a solid of revolution exactly as wide as it ever was. An arm
 * merely level with the belly's edge is therefore BEHIND it from that camera,
 * which is what swallowed the far arm. At 0.705 out and 0.09 forward the far
 * arm's own silhouette clears the gut's by 0.03 m for its whole length.
 */
const SHOULDER_X = 0.64;
const SHOULDER_Z = 0.09;
const ARM_W = 0.13;
const ARM_D = 0.185;
const UPPER_ARM = 0.26;
const FOREARM = 0.2;

/**
 * The belly's radius at world height `y`. One profile, used for the shell itself
 * and then for every seam, hatch and emblem placed on it — nothing on this robot
 * is positioned by eye, which is how the last build ended up with meridians
 * floating 0.16 m off the surface.
 */
const BELLY_PROFILE: Array<[number, number]> = [
  [0.4, 0.0],
  [0.44, 0.265],
  [0.48, 0.378],
  [0.53, 0.462],
  [0.59, 0.526],
  [0.66, 0.569],
  [0.73, 0.592],
  [BELLY_MAX_Y, BELLY_MAX_R],
  [0.87, 0.591],
  [0.93, 0.566],
  [0.98, 0.522],
  [1.02, 0.472],
  [1.06, 0.408],
  [1.1, 0.32],
  [1.13, 0.197],
  [BELLY_TOP, 0.0],
];

function bellyR(y: number): number {
  if (y <= BELLY_PROFILE[0][0]) return 0;
  for (let i = 1; i < BELLY_PROFILE.length; i++) {
    if (y <= BELLY_PROFILE[i][0]) {
      const [y0, r0] = BELLY_PROFILE[i - 1];
      const [y1, r1] = BELLY_PROFILE[i];
      return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
  }
  return 0;
}

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
  // Weathered, not fresh. The sheet's belly medians #9b675a — rust and blue-gray
  // undercoat showing through an orange that has been in a cinema basement for
  // twenty years — where a straight #d9772a photographs at nearly double the
  // sheet's saturation and reads as new plastic on the largest surface Biggy has.
  const belly = panelMaterial('#ad6540', 0.8, { roughness: 0.82, metalness: 0.22 });
  const rubber = panelMaterial('#23262b', 0.4, { roughness: 0.9, metalness: 0.1 });
  /** The boots: the darkest, chunkiest thing on the model, as the sheet has them. */
  const bootDark = panelMaterial('#1b1e23', 0.45, { roughness: 0.92, metalness: 0.12 });
  const steel = panelMaterial('#6d7885', 0.4, { roughness: 0.55, metalness: 0.75 });
  /** The band under the rim: near-black, and the only place Biggy has a face. */
  const visorBand = panelMaterial('#15181c', 0.25, { roughness: 0.55, metalness: 0.3 });
  /**
   * The belly glyph, MUTED. The previous ring was near-white and read as
   * emissive: the brightest thing on the model, pulling the eye off the
   * silhouette it is supposed to sit on. The sheet's is low-contrast grey.
   */
  const emblemLight = panelMaterial('#b3a79c', 0.5, { roughness: 0.78, metalness: 0.08 });
  // Amber, not lemon: at the old intensity the green channel clipped to 255 and
  // both eyes photographed as pure yellow. `#ffb347` x 1.2 keeps R > G > B.
  const eyeGlow = glowMaterial('#ffb347', 1.2, '#0d0e10');
  /** The pilot light on the antenna tip — dimmer and redder than the eyes. */
  const pilotGlow = glowMaterial('#ff8a3c', 0.9, '#0d0e10');
  glow.push(eyeGlow, pilotGlow);

  /** Rust bleeding through the orange, grime pooling low: twenty years of it. */
  const wear = (amount: number, seed: number, scale = 5): WeatherOpts => ({
    amount,
    seed,
    scale,
    tint: '#7d4526',
    grime: 0.4,
  });
  /**
   * The belly's own weathering: rust mottle over the blue-gray undercoat showing
   * through, at a higher frequency than the broad thumbprint blotches the shared
   * `wear()` produces. The sheet's belly is mottled, not smudged.
   */
  const bellyWear = (seed: number): WeatherOpts => ({
    amount: 0.92,
    seed,
    scale: 9,
    tint: '#6b6168',
    grime: 0.45,
  });

  /* ------------------------------------------------------------- skeleton */
  const pelvis = joint(bones, root, 'pelvis', 0, HIP_Y, 0);
  const torso = joint(bones, pelvis, 'torso', 0, TORSO_Y - HIP_Y, 0);
  const neck = joint(bones, torso, 'neck', 0, NECK_Y - TORSO_Y, 0);
  const head = joint(bones, neck, 'head', 0, HEAD_Y - NECK_Y, 0);

  /* ---------------------------------------------------------- the belly */
  const bellyGeo = latheProfile(
    BELLY_PROFILE.map(([y, r]) => [r, y - TORSO_Y] as [number, number]),
    40,
    64,
  );
  const bellyMesh = part(bellyGeo, belly, bellyWear(3));
  torso.add(bellyMesh);
  parts.bellyShell = bellyMesh;
  // Biggy has no torso other than his belly; both names point at the same shell.
  parts.torsoShell = bellyMesh;

  /*
   * HORIZONTAL latitude seams, and no meridians.
   *
   * Vertical plate joins quartering the sphere turned the armour into a beach
   * ball, which is what the round-3 critic saw. The sheet's belly is banded the
   * other way: a few latitude seams, a couple of hatches, and rust doing the rest.
   * Each ring is a torus at exactly the profile's own radius for that height, so
   * it lies on the surface instead of floating over it.
   */
  for (const [y, tube] of [
    [1.0, 0.006],
    [0.71, 0.007],
    [0.52, 0.006],
  ] as const) {
    const ring = part(new THREE.TorusGeometry(bellyR(y) + 0.002, tube, 6, 56), rubber, wear(0.5, 4));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y - TORSO_Y;
    torso.add(ring);
  }
  // Two riveted hatches, sitting flat on the shell where the sheet has them.
  for (const [ax, hy] of [
    [-0.85, 0.88],
    [0.95, 0.74],
  ] as const) {
    const r = bellyR(hy) - 0.012;
    const hatch = part(roundedBox(0.13, 0.17, 0.03, 0.01, 2), armourDark, wear(0.7, 18));
    hatch.position.set(Math.sin(ax) * r, hy - TORSO_Y, Math.cos(ax) * r);
    hatch.rotation.y = ax;
    torso.add(hatch);
  }

  /*
   * The circular emblem, low-contrast, on the front of the belly.
   */
  const emblemY = 0.885;
  const emblem = new THREE.Object3D();
  emblem.position.set(0, emblemY - TORSO_Y, bellyR(emblemY) + 0.012);
  emblem.rotation.x = -0.22;
  torso.add(emblem);
  const emblemRing = part(new THREE.TorusGeometry(0.115, 0.015, 10, 36), emblemLight, wear(0.55, 5));
  emblem.add(emblemRing);
  for (const sx of [-1, 1]) {
    const dot = part(puck(0.022, 0.012, 16).rotateX(Math.PI / 2), emblemLight, wear(0.5, 6));
    dot.position.set(sx * 0.038, 0.022, 0.004);
    emblem.add(dot);
  }
  const emblemBar = part(roundedBox(0.075, 0.019, 0.012, 0.006, 2), emblemLight, wear(0.5, 7));
  emblemBar.position.set(0, -0.028, 0.004);
  emblem.add(emblemBar);

  /*
   * Under the belly: the belt, the orange hip band and the dark under-plate the
   * legs come out of. On the sheet this is what separates the gut from the boots.
   */
  /*
   * The belt is a BAND ON THE HIP, not a hoop in the air. A torus wide enough to
   * clear the belly hangs off the body at the height it is actually placed —
   * which is how a "seam" becomes a floating ring — so this is a short collar
   * around the top of the hip band, tucked under the gut's overhang.
   */
  const belt = part(new THREE.CylinderGeometry(0.385, 0.372, 0.075, 44, 1, true), armourDark, wear(0.6, 8));
  belt.position.y = 0.4 - TORSO_Y;
  torso.add(belt);
  const hipBand = part(new THREE.CylinderGeometry(0.372, 0.33, 0.15, 40, 1, true), belly, bellyWear(9));
  hipBand.position.y = 0.345 - TORSO_Y;
  torso.add(hipBand);
  /*
   * The skirt stops at 0.25, not 0.225: below it there has to be bare shin for
   * the ankle bellows to be ribs ON a leg rather than a stack of loose rings.
   */
  const underPlate = part(new THREE.CylinderGeometry(0.335, 0.3, 0.09, 36, 1, true), armour, wear(0.65, 10));
  underPlate.position.y = 0.295 - TORSO_Y;
  torso.add(underPlate);

  /* ------------------------------------------- visor band under the helmet */
  // Fixed to the belly, not to the head: the helmet swivels over it.
  const bandMid = (BAND_Y0 + BAND_Y1) / 2;
  const bandGeo = new THREE.CylinderGeometry(BAND_R, BAND_R, BAND_Y1 - BAND_Y0, 48, 1, true);
  const band = part(bandGeo, visorBand, wear(0.2, 11));
  band.position.y = bandMid - TORSO_Y;
  torso.add(band);
  // A dark brow lip closing the top of the recess, so the band reads as a slot cut
  // into the shoulder rather than as a floating ring.
  const bandLip = part(new THREE.TorusGeometry(BAND_R + 0.006, 0.014, 8, 44), visorBand, wear(0.3, 12));
  bandLip.rotation.x = Math.PI / 2;
  bandLip.position.y = BAND_Y0 - TORSO_Y - 0.004;
  torso.add(bandLip);

  /*
   * TWO EYES — A DELIBERATE DEVIATION FROM THE SHEET.
   *
   * The model sheet's visor band is blank in all nine views. Michele's call is
   * that gameplay legibility wins: the player has to be able to tell at a glance
   * which way the heaviest robot in the room is facing, and the band is the only
   * face Biggy has. Two discrete amber lenses, and no other emissive geometry
   * anywhere near the face.
   */
  const eyeY = BAND_Y0 + (BAND_Y1 - BAND_Y0) * 0.45;
  for (const sx of [-1, 1]) {
    const ex = sx * 0.145;
    const ez = Math.sqrt(Math.max(0.01, BAND_R * BAND_R - ex * ex));
    const socket = part(puck(0.054, 0.01, 20).rotateX(Math.PI / 2), visorBand);
    socket.position.set(ex, eyeY - TORSO_Y, ez + 0.002);
    socket.rotation.y = -sx * 0.3;
    torso.add(socket);
    const eye = part(puck(0.04, 0.016, 20).rotateX(Math.PI / 2), eyeGlow);
    eye.position.set(ex, eyeY - TORSO_Y, ez + 0.008);
    eye.rotation.y = -sx * 0.3;
    torso.add(eye);
  }

  // Biggy's lamp: the wide blue flood, out of the visor band.
  const lampAnchor = new THREE.Object3D();
  lampAnchor.name = 'lamp';
  lampAnchor.position.set(0, eyeY - TORSO_Y, BAND_R);
  torso.add(lampAnchor);

  /* ------------------------------------------------------- helmet (head) */
  const domeR = (y: number): number => HELM_R * Math.sqrt(Math.max(0, 1 - (y / HELM_H) ** 2));
  const domeY = (r: number): number => HELM_H * Math.sqrt(Math.max(0, 1 - (r / HELM_R) ** 2));

  const domeGeo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.scale(HELM_R, HELM_H, HELM_R);
  const dome = part(domeGeo, armour, wear(0.55, 13, 4));
  head.add(dome);
  parts.headShell = dome;
  // The brim: a flared rim that puts a lip over the visor recess.
  const rim = part(new THREE.TorusGeometry(HELM_R - 0.006, 0.022, 10, 48), armourDark, wear(0.5, 14));
  rim.rotation.x = Math.PI / 2;
  head.add(rim);
  const crownBand = part(
    new THREE.CylinderGeometry(domeR(0.085) + 0.004, domeR(0.02) + 0.004, 0.07, 48, 1, true),
    armourDark,
    wear(0.55, 15),
  );
  crownBand.position.y = 0.05;
  head.add(crownBand);
  boltRing(head, steel, {
    count: 6,
    radius: 0.33,
    y: domeY(0.33) - 0.01,
    boltRadius: 0.02,
    boltHeight: 0.016,
    phase: 0.42,
    aimFrom: new THREE.Vector3(0, 0, 0),
  });

  /*
   * THE PAIRED FRONT RIVET PORTS.
   *
   * Two large, deeply recessed circular bolt-ports side by side on the dome's
   * front-upper face. They are in all nine views of the sheet and they are what
   * makes the helmet read as *Biggy's* helmet; the build before this had one
   * central boss instead and the critic listed them as missing. Each is seated on
   * the dome's own surface normal, so the pair sits flat and symmetric.
   */
  const PORT_Y = 0.23;
  const PORT_AZI = 0.48;
  const portUp = new THREE.Vector3(0, 1, 0);
  for (const sx of [-1, 1]) {
    const pr = domeR(PORT_Y);
    const px = sx * pr * Math.sin(PORT_AZI);
    const pz = pr * Math.cos(PORT_AZI);
    const port = new THREE.Object3D();
    port.position.set(px, PORT_Y, pz);
    port.quaternion.setFromUnitVectors(
      portUp,
      new THREE.Vector3(px / (HELM_R * HELM_R), PORT_Y / (HELM_H * HELM_H), pz / (HELM_R * HELM_R)).normalize(),
    );
    head.add(port);
    const collar = part(new THREE.CylinderGeometry(0.082, 0.088, 0.05, 26), armour, wear(0.5, 16));
    collar.position.y = -0.012;
    port.add(collar);
    const ringMesh = part(new THREE.TorusGeometry(0.075, 0.019, 10, 28), steel, wear(0.5, 17));
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.012;
    port.add(ringMesh);
    /*
     * The recess itself. An open-ended cylinder would be the honest way to cut a
     * well, but its inner wall is back-facing from outside and culls away, so the
     * port photographed as an empty outline. A solid dark plug set below the ring
     * gives the same read — a deep dark circle inside a steel collar — from every
     * angle the diorama camera can reach.
     */
    const well = part(new THREE.CylinderGeometry(0.062, 0.058, 0.04, 24), rubber);
    well.position.y = -0.005;
    port.add(well);
    const boss = part(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 12), steel, wear(0.5, 19));
    boss.position.y = -0.016;
    port.add(boss);
  }
  // The small nubs at the dome's sides, between the ports and the rim.
  for (const sx of [-1, 1]) {
    const ny = 0.085;
    const nub = part(roundedBox(0.09, 0.075, 0.17, 0.028, 2), armour, wear(0.55, 20));
    nub.position.set(sx * (domeR(ny) - 0.01), ny, -0.02);
    nub.rotation.z = -sx * 0.18;
    head.add(nub);
    const nubTip = part(roundedBox(0.035, 0.06, 0.15, 0.016, 2), belly, bellyWear(21));
    nubTip.position.set(sx * (domeR(ny) + 0.026), ny + 0.004, -0.02);
    nubTip.rotation.z = -sx * 0.18;
    head.add(nubTip);
  }

  /*
   * The whip antenna. It stays out of the measured silhouette — it is a wire, not
   * the top of his head, and `ROBOT_HEIGHT_M.biggy` is asserted against that
   * silhouette — and it is short enough to stay inside the portrait's top margin.
   */
  const antenna = joint(bones, head, 'antenna', 0.13, domeY(0.17) - 0.01, -0.09);
  antenna.rotation.set(-0.06, 0, -0.05);
  const whip = part(new THREE.CylinderGeometry(0.004, 0.007, 0.1, 6), rubber);
  whip.position.y = 0.05;
  antenna.add(excludeFromBounds(whip));
  const whipTip = part(ellipsoid(0.011, 0.014, 0.011, 8, 6), pilotGlow);
  whipTip.position.y = 0.1;
  antenna.add(excludeFromBounds(whipTip));
  const antennaBase = part(new THREE.CylinderGeometry(0.018, 0.022, 0.035, 10), steel, wear(0.4, 22));
  antennaBase.position.y = 0.012;
  antenna.add(antennaBase);

  /*
   * A vestigial neck collar: the helmet is fused to the belly, so this only ever
   * moves a few degrees (see `gait.ts`, Biggy's headLook is tiny). It is tall
   * enough to actually reach the dome's base at 1.13 — the belly hides the gap
   * either way, but a shell that does not touch the shell it hangs from is how
   * detached geometry gets shipped, and now a test says so.
   */
  const collarMesh = part(new THREE.CylinderGeometry(0.16, 0.19, 0.13, 20), armourDark, wear(0.5, 23));
  collarMesh.position.y = 0.01;
  neck.add(collarMesh);

  /* ----------------------------------------------------------------- arms */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const shoulder = joint(bones, torso, `shoulder${L}`, side * SHOULDER_X, SHOULDER_Y - TORSO_Y, SHOULDER_Z);
    const upper = joint(bones, shoulder, `upperArm${L}`, 0, 0, 0);
    const fore = joint(bones, upper, `forearm${L}`, 0, -UPPER_ARM, 0);
    const hand = joint(bones, fore, `hand${L}`, 0, -FOREARM, 0);

    /*
     * SHORT STUBBY DARK ARMS — slabs, not limbs.
     *
     * The build before this hung big ball shoulders at visor height carrying
     * multi-segment cones with ring collars, standing 0.14 m clear of the belly
     * on each side at 0.22 of the belly's width in thickness. The sheet's arm is
     * a low-profile dark slab about 0.13 of the belly across whose outer face is
     * just inside the belly's widest point: it barely clears the gut, which is
     * the whole reason the gut reads as the silhouette.
     */
    const pad = part(roundedBox(ARM_W + 0.02, 0.15, ARM_D + 0.015, 0.045, 3), armourDark, wear(0.6, 24));
    pad.position.set(0, 0.04, -0.01);
    shoulder.add(pad);
    const padTop = part(roundedBox(ARM_W - 0.02, 0.045, ARM_D - 0.03, 0.018, 2), belly, bellyWear(25));
    padTop.position.set(side * 0.02, 0.105, -0.01);
    padTop.rotation.z = side * 0.2;
    shoulder.add(padTop);

    const upperMesh = part(roundedBox(ARM_W, UPPER_ARM, ARM_D, 0.04, 3), armourDark, wear(0.6, 26));
    upperMesh.position.y = -UPPER_ARM / 2 + 0.02;
    upper.add(upperMesh);

    const elbow = part(new THREE.TorusGeometry(0.07, 0.018, 8, 20), rubber);
    elbow.rotation.x = Math.PI / 2;
    fore.add(elbow);
    const foreMesh = part(roundedBox(ARM_W - 0.012, FOREARM, ARM_D - 0.02, 0.035, 3), armourDark, wear(0.6, 27));
    foreMesh.position.y = -FOREARM / 2;
    fore.add(foreMesh);

    // Small clawed hand: four short fingers and a thumb, in the arm's own dark.
    const palm = part(roundedBox(0.105, 0.065, 0.1, 0.026, 3), armourDark, wear(0.25, 28));
    palm.position.y = -0.03;
    hand.add(palm);
    const clawAngles = [-0.75, -0.25, 0.25, 0.75];
    for (let i = 0; i < clawAngles.length; i++) {
      const a = clawAngles[i];
      const claw = new THREE.Object3D();
      claw.position.set(Math.sin(a) * 0.04, -0.062, Math.cos(a) * 0.03);
      claw.rotation.set(-0.25, a * 0.5, 0);
      hand.add(claw);
      bones[`finger${L}${i}`] = claw;
      const seg = part(roundedBox(0.026, 0.06, 0.026, 0.01, 2), armourDark, wear(0.2, 29));
      seg.position.y = -0.03;
      claw.add(seg);
      const tip = part(new THREE.ConeGeometry(0.016, 0.034, 8), rubber);
      tip.position.y = -0.072;
      tip.rotation.x = Math.PI;
      claw.add(tip);
    }
    const thumb = new THREE.Object3D();
    thumb.position.set(-side * 0.05, -0.048, -0.01);
    thumb.rotation.set(0.2, 0, side * 1.0);
    hand.add(thumb);
    const thumbSeg = part(roundedBox(0.026, 0.055, 0.026, 0.01, 2), armourDark, wear(0.2, 30));
    thumbSeg.position.y = -0.028;
    thumb.add(thumbSeg);

    // Hung straight down against the belly, with only the smallest splay.
    shoulder.rotation.z = side * 0.03;
    shoulder.rotation.x = -0.04;
  }

  /* ----------------------------------------------------------------- legs */
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'L' : 'R';
    const hip = joint(bones, pelvis, `hip${L}`, side * 0.19, 0, 0);
    const thigh = joint(bones, hip, `thigh${L}`, 0, 0, 0);
    const shin = joint(bones, thigh, `shin${L}`, 0, -THIGH, 0);
    const foot = joint(bones, shin, `foot${L}`, 0, -SHIN, 0);

    const hipBall = part(ellipsoid(0.115, 0.108, 0.115, 20, 14), armourDark, wear(0.55, 31));
    hip.add(hipBall);
    const thighMesh = part(new THREE.CylinderGeometry(0.114, 0.118, THIGH, 20, 2), armour, wear(0.6, 32));
    thighMesh.position.y = -THIGH / 2;
    thigh.add(thighMesh);
    /*
     * A dark ball over the knee pivot. It is 0.112 on a hip 0.19 out, so its
     * outer face is 0.302 against the skirt's 0.315 at the same height: it can
     * no longer graze the inside of the under-plate, which is what used to shred
     * the two surfaces into the dark saw-toothed shard above the boot.
     */
    const kneeBall = part(ellipsoid(0.112, 0.105, 0.112, 18, 12), rubber, wear(0.4, 33));
    shin.add(kneeBall);
    const shinMesh = part(new THREE.CylinderGeometry(0.108, 0.114, SHIN, 20, 2), armour, wear(0.6, 34));
    shinMesh.position.y = -SHIN / 2;
    shin.add(shinMesh);

    /*
     * Ribbed bellows on the ANKLE, where the sheet has them: three rings sitting
     * on the shin between the skirt and the boot top.
     *
     * The stack that came before this one read as detached for two reasons, and
     * moving it to the ankle pivot — which a previous round did — fixed neither.
     * First, Biggy's knee was folded 63 degrees just standing there (see
     * `standBend` in gait.ts), and rings on a shin that is itself swung forward
     * out of the leg's line photograph as a crescent hanging off nothing.
     * Second, the rings were 0.142 across on a 0.125 shin AND filled the whole
     * 0.095 m of leg the skirt left visible, so there was no shin next to them
     * to belong to. Now the knee is straight, the rings are a ribbed sleeve
     * around the shin rather than a stack beside it, and the shin shows above
     * them and runs on down into the boot.
     */
    for (let i = 0; i < 3; i++) {
      const ring = part(new THREE.TorusGeometry(0.106, 0.019, 8, 24), rubber);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -SHIN + 0.098 - i * 0.036;
      shin.add(ring);
    }
    // The ankle collar the bellows are clamped to, so the sleeve ends on a
    // fitting rather than in mid-air.
    const ankleSleeve = part(new THREE.CylinderGeometry(0.1, 0.108, 0.05, 20), rubber, wear(0.4, 38));
    ankleSleeve.position.y = 0.022;
    foot.add(ankleSleeve);

    /*
     * The boots: the darkest and chunkiest thing on the robot, with a heavy sole.
     * The previous pair were light blue-gray trays — lighter than the legs above
     * them — which stood the whole figure on two bright slabs.
     */
    const boot = part(roundedBox(0.3, 0.12, 0.34, 0.038, 3), bootDark, wear(0.6, 35, 4));
    boot.position.set(0, -0.04, 0.02);
    foot.add(boot);
    const sole = part(roundedBox(0.325, 0.032, 0.365, 0.014, 2), rubber, wear(0.5, 36));
    sole.position.set(0, -0.114, 0.02);
    foot.add(sole);
    const toeCap = part(roundedBox(0.29, 0.055, 0.075, 0.018, 2), rubber, wear(0.7, 37));
    toeCap.position.set(0, -0.045, 0.165);
    foot.add(toeCap);
    boltRing(foot, steel, {
      count: 4,
      radius: 0.11,
      y: 0.01,
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
