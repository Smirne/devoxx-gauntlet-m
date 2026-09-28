/**
 * people3d.ts — the crowd, in 3D.
 *
 * The figures are the 2.5D build's own (`src/render/people.ts`, `buildPerson`):
 * head, torso, arms, legs, posed from the person's seed, heading and speed with
 * no state of their own. So this is only a pool — `snap.people` is rebuilt every
 * frame and a person's index is not their identity, which the models do not need
 * — and the floor under each one, from the sim's plates.
 *
 * Two things are 3D's own, because the 3D camera gets close enough to see them:
 *
 *  - every figure is softened: rounded torso and limbs instead of boxes, a
 *    smoother head, and a neck (the 2.5D build never needed one at 30 px);
 *  - the people the player has to know on sight — Stephan, who runs the whole
 *    chapter, Celestino on the badge desk, and Mario, Venkat and Josh out on
 *    the hall floor — get a sculpted head and their own clothes, from the
 *    photographs Michele sent (28 Sep 2026);
 *  - everybody wears shoes, because the one person who does not is the joke.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { buildPerson, type PersonModel } from '../render/people';
import { riseAt } from '../sim/surface';
import type { GameSnapshot } from '../sim/types';

/** Clothes by role, when the chapter did not say — the 2.5D build's fallback. */
const ROLE_COLOR: Readonly<Record<string, string>> = {
  visitor: '#6f7c8d',
  queue: '#7b6f8d',
  staff: '#c0392b',
  stephan: '#e0b050',
  speaker: '#4aa3a0',
};

/* ------------------------------------------------------------ softer bodies */

const TORSO_GEO = new RoundedBoxGeometry(1, 1, 1, 3, 0.24);
const LIMB_GEO = new RoundedBoxGeometry(1, 1, 1, 2, 0.4);
const HEAD_GEO = new THREE.SphereGeometry(0.5, 20, 14);
const NECK_GEO = new THREE.CylinderGeometry(0.5, 0.55, 1, 12);
const SHOE_GEO = new RoundedBoxGeometry(1, 1, 1, 2, 0.35);
const SHOE_MAT = new THREE.MeshStandardMaterial({ color: new THREE.Color('#26221f'), roughness: 0.55 });

/** Swap the shared figure's boxes for rounded ones, once per pooled model. */
function soften(yaw: THREE.Group): THREE.Mesh {
  (yaw.getObjectByName('torso') as THREE.Mesh).geometry = TORSO_GEO;
  for (const n of ['leg-l', 'leg-r', 'arm-l', 'arm-r']) (yaw.getObjectByName(n) as THREE.Mesh).geometry = LIMB_GEO;
  (yaw.getObjectByName('head') as THREE.Mesh).geometry = HEAD_GEO;
  (yaw.getObjectByName('hair') as THREE.Mesh).geometry = HEAD_GEO;
  for (const side of ['l', 'r']) {
    const shoe = new THREE.Mesh(SHOE_GEO, SHOE_MAT);
    shoe.name = `shoe-${side}`;
    shoe.castShadow = true;
    (yaw.getObjectByName(`leg-${side}-pivot`) as THREE.Object3D).add(shoe);
  }
  const neck = new THREE.Mesh(NECK_GEO);
  neck.name = 'neck';
  neck.castShadow = true;
  yaw.add(neck);
  return neck;
}

/** A shoe under each leg, riding its pivot so it walks with it — or a bare foot. */
function placeFeet(yaw: THREE.Group, H: number, bare: THREE.Material | null): void {
  for (const side of ['l', 'r']) {
    const leg = yaw.getObjectByName(`leg-${side}`) as THREE.Mesh;
    const shoe = yaw.getObjectByName(`shoe-${side}`) as THREE.Mesh;
    const len = leg.scale.y;
    shoe.material = bare ?? SHOE_MAT;
    // Bare feet are flatter and a little longer: that is what makes them read.
    shoe.scale.set(0.105 * H, (bare ? 0.032 : 0.05) * H, (bare ? 0.19 : 0.17) * H);
    shoe.position.set(0, -len + shoe.scale.y / 2, 0.035 * H);
  }
}

/** Neck from the shoulders to under the head, in the head's own skin. */
function placeNeck(yaw: THREE.Group, neck: THREE.Mesh): void {
  const head = yaw.getObjectByName('head') as THREE.Mesh;
  const torso = yaw.getObjectByName('torso') as THREE.Mesh;
  const R = head.scale.x / 2;
  const top = head.position.y - R * 0.6;
  const bottom = torso.position.y + torso.scale.y / 2 - R * 0.1;
  neck.scale.set(R * 0.8, Math.max(0.01, top - bottom), R * 0.8);
  neck.position.set(0, (top + bottom) / 2, 0);
  neck.material = head.material;
}

/* ----------------------------------------------------------- sculpted heads */

interface HeadSpec {
  skin: string;
  /** Hair on the crown, and at the sides and back (salt-and-pepper is lighter here). */
  hairTop: string;
  hairSide: string;
  /** Where the hair starts, as the height on a unit head: forehead, temple, over the ear, nape. */
  line: [number, number, number, number];
  /** How much the hair stands off the skull, in head radii: crown, sides. */
  thickTop: number;
  thickSide: number;
  /** Salt specks through the hair, 0..1. */
  salt: number;
  /** Beard shadow on the jaw, 0..1. */
  stubble: number;
  /** A narrower, longer face than the round default. */
  narrow: number;
  long: number;
  /** The beard's colour, where `stubble` paints it (dark grey by default). */
  beard?: string;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (x: number, y: number, z: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/**
 * One mesh for skull, face and hair, instead of a head with a cap on it.
 *
 * Michele, 28 Sep 2026, on the first close-up: *"Stephan looks like he has a
 * beanie with some stuff on top."* A cap is a hat whatever colour it is: its
 * edge runs round the head at one height. Hair is the head's own surface, grown
 * out a little where there is hair and not at all where there is not, with a
 * hairline that is high at the forehead, recedes at the temples, is cropped
 * short over the ears and drops at the nape. So that is what this builds: a
 * unit sphere, shaped into a face (narrower, a longer jaw, a nose), with every
 * vertex above the hairline pushed out by a textured thickness and coloured
 * hair, and the rest coloured skin — with the beard shadow painted onto the jaw
 * rather than a shell laid over it.
 */
function sculptHead(spec: HeadSpec): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 56, 40);
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const skin = new THREE.Color(spec.skin);
  const top = new THREE.Color(spec.hairTop);
  const side = new THREE.Color(spec.hairSide);
  const beard = new THREE.Color(spec.beard ?? '#4d4640');
  const c = new THREE.Color();
  const [front, temple, over, nape] = spec.line;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const a = Math.abs(Math.atan2(x, z));
    // The hairline, round the head: forehead -> temple -> over the ear -> nape.
    const line = a < 0.9 ? front + (temple - front) * (a / 0.9) : a < 1.6 ? temple + (over - temple) * ((a - 0.9) / 0.7) : over + (nape - over) * ((a - 1.6) / (Math.PI - 1.6));
    const n = hash(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30));
    const hair = smooth(line - 0.02, line + 0.07, y + (n - 0.5) * 0.05);
    const crown = smooth(0.25, 0.85, y);
    const thick = hair * (spec.thickSide + (spec.thickTop - spec.thickSide) * crown) * (0.75 + 0.5 * n);
    // The face: narrower, the jaw longer and tapering to the chin, and a nose.
    x *= spec.narrow;
    if (y < -0.2) {
      const k = 1 - 0.18 * (-0.2 - y);
      x *= k;
      z *= 1 - 0.08 * (-0.2 - y);
    }
    y *= y < 0 ? spec.long : 1;
    if (z > 0.6) z += 0.16 * Math.exp(-((x / 0.13) ** 2 + ((y + 0.08) / 0.22) ** 2));
    const r = 1 + thick;
    pos.setXYZ(i, x * r, y * r, z * r);
    // Colour: hair (darker on the crown, salt through it), else skin, with the
    // beard shadow on the lower face and jaw.
    c.copy(side).lerp(top, crown);
    if (n > 1 - spec.salt) c.lerp(new THREE.Color('#bdb8b0'), 0.6);
    c.multiplyScalar(0.9 + 0.2 * hash(i, 1, 2));
    const sk = skin.clone();
    const jaw = smooth(-0.1, -0.45, pos.getY(i)) * smooth(-0.35, 0.2, pos.getZ(i));
    if (spec.stubble > 0) sk.lerp(beard, jaw * spec.stubble * (0.7 + 0.3 * hash(i, 5, 7)));
    c.lerp(sk, 1 - hair);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  mesh.castShadow = true;
  // Ears, in the skin colour.
  const earMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), earMat);
    ear.scale.set(0.12, 0.24, 0.16);
    ear.position.set(sx * 0.95 * spec.narrow, -0.08, -0.02);
    mesh.add(ear);
  }
  return mesh;
}

/* ----------------------------------------------------------------- portraits */

interface Portrait {
  group: THREE.Group;
  /** The sculpted head; scaled to the figure's head each frame. */
  head: THREE.Mesh;
  /** The shirt's body, when it is not the figure's own cloth (Celestino's raglan). */
  body?: THREE.MeshStandardMaterial;
  /** Skin for the neck and hands. */
  skin: THREE.MeshStandardMaterial;
  /** The shared figure's far-camera stand-ins this portrait replaces. */
  hides: string[];
  /** Bare feet: the skin goes on the feet too. */
  barefoot?: boolean;
}

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundRectRing(w: number, h: number, t: number): THREE.ExtrudeGeometry {
  const r = Math.min(w, h) * 0.22;
  const outer = new THREE.Shape();
  outer.moveTo(-w / 2 + r, -h / 2);
  outer.lineTo(w / 2 - r, -h / 2);
  outer.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  outer.lineTo(w / 2, h / 2 - r);
  outer.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  outer.lineTo(-w / 2 + r, h / 2);
  outer.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  outer.lineTo(-w / 2, -h / 2 + r);
  outer.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const iw = w - 2 * t;
  const ih = h - 2 * t;
  const hole = new THREE.Path();
  hole.moveTo(-iw / 2, -ih / 2);
  hole.lineTo(iw / 2, -ih / 2);
  hole.lineTo(iw / 2, ih / 2);
  hole.lineTo(-iw / 2, ih / 2);
  hole.lineTo(-iw / 2, -ih / 2);
  outer.holes.push(hole);
  return new THREE.ExtrudeGeometry(outer, { depth: t * 0.5, bevelEnabled: false });
}

const std = (c: string, rough = 0.6): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: rough });

/** Eyes on a sculpted head (unit radius, so these are in head radii). */
function eyes(head: THREE.Mesh, y: number, colour = '#1f1a16'): void {
  const white = std('#f1ece4', 0.4);
  const iris = std(colour, 0.3);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), white);
    w.scale.set(1, 0.7, 0.5);
    w.position.set(sx * 0.3, y, 0.9);
    head.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), iris);
    p.position.set(sx * 0.3, y, 0.95);
    head.add(p);
  }
}

/**
 * STEPHAN — the photographs: amber tortoiseshell rectangular frames, short
 * salt-and-pepper hair (grey at the sides, darker and tousled on top, a little
 * receding at the temples), grey stubble, a wide grin, a skin-coloured headset
 * boom along his left cheek, and the Devoxx Belgium polo: olive, the collar
 * tipped orange / grey / white / grey, orange piping inside the neck, three dark
 * buttons, DEVOXX in white on his left chest. First name, a caricature, nothing
 * that needs permission.
 */
function buildStephan(torso: THREE.Mesh, H: number): Portrait {
  const g = new THREE.Group();
  const head = sculptHead({
    skin: '#d9a07c',
    hairTop: '#4a4642',
    hairSide: '#8f8a83',
    line: [0.5, 0.36, 0.12, -0.42],
    thickTop: 0.14,
    thickSide: 0.035,
    salt: 0.3,
    stubble: 0.55,
    narrow: 0.92,
    long: 1.14,
  });
  eyes(head, 0.1);
  const amber = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b8742c'), roughness: 0.35, metalness: 0.05 });
  const lens = roundRectRing(0.62, 0.38, 0.065);
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(lens, amber);
    f.position.set(sx * 0.33, 0.1, 0.97);
    head.add(f);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.95), amber);
    temple.position.set(sx * 0.66, 0.14, 0.48);
    temple.rotation.y = sx * -0.22;
    head.add(temple);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), std('#4a4642', 0.9));
    brow.position.set(sx * 0.32, 0.33, 0.93);
    brow.rotation.z = sx * -0.12;
    head.add(brow);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.04), amber);
  bridge.position.set(0, 0.18, 1.02);
  head.add(bridge);
  // The grin: open, teeth showing.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std('#4a1f18', 0.8));
  mouth.scale.set(0.42, 0.22, 0.14);
  mouth.position.set(0, -0.36, 0.9);
  head.add(mouth);
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), std('#f3eee5', 0.5));
  teeth.position.set(0, -0.37, 0.95);
  head.add(teeth);
  // The headset on his left (+x): ear pad, boom, mic at the corner of the mouth.
  const skinish = std('#e2d2c0', 0.5);
  const boomPath = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.96, -0.05, 0.05), new THREE.Vector3(0.95, -0.48, 0.62), new THREE.Vector3(0.42, -0.44, 0.97));
  head.add(new THREE.Mesh(new THREE.TubeGeometry(boomPath, 12, 0.03, 6), skinish));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), std('#efe6da', 0.5));
  tip.position.copy(boomPath.getPoint(1));
  head.add(tip);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skinish);
  pad.position.set(0.98, -0.02, 0.02);
  head.add(pad);
  g.add(head);

  // The polo collar: two flaps folded down either side of the neck, the tipping
  // along their edges, a band round the back, orange piping inside.
  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const tipped = canvasTex(128, 48, (x) => {
    x.fillStyle = '#434a3c';
    x.fillRect(0, 0, 128, 48);
    const bands: Array<[string, number]> = [
      ['#6b6d62', 26],
      ['#f2efe9', 32],
      ['#6b6d62', 37],
      ['#e8a01c', 41],
    ];
    for (const [c, y] of bands) {
      x.fillStyle = c;
      x.fillRect(0, y, 128, 5);
    }
  });
  const flapMat = new THREE.MeshStandardMaterial({ map: tipped, roughness: 0.8, side: THREE.DoubleSide });
  const R = H * 0.135;
  for (const sx of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 0.62, H * 0.075), flapMat);
    flap.position.set(sx * halfW * 0.3, shoulder + H * 0.012, front * 0.7);
    flap.rotation.set(-1.1, sx * -0.55, sx * 0.35);
    g.add(flap);
  }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.56, H * 0.035, 16, 1, true, Math.PI * 0.35, Math.PI * 1.3), flapMat);
  band.position.set(0, shoulder + H * 0.02, 0);
  band.rotation.y = Math.PI;
  g.add(band);
  const piping = new THREE.Mesh(new THREE.TorusGeometry(R * 0.47, R * 0.025, 6, 18), std('#e8a01c', 0.6));
  piping.rotation.x = Math.PI / 2;
  piping.position.set(0, shoulder + H * 0.004, 0);
  g.add(piping);
  // Placket and buttons, DEVOXX on his left chest.
  const placket = new THREE.Mesh(new THREE.BoxGeometry(halfW * 0.16, H * 0.1, 0.004), std('#3a4034', 0.85));
  placket.position.set(0, shoulder - H * 0.05, front + 0.002);
  g.add(placket);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(H * 0.0055, 6, 4), std('#221f1b', 0.4));
    b.position.set(0, shoulder - H * (0.02 + i * 0.028), front + 0.006);
    g.add(b);
  }
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 0.8, halfW * 0.2),
    new THREE.MeshStandardMaterial({
      map: canvasTex(256, 64, (x) => {
        x.fillStyle = '#f4f1ea';
        x.font = 'bold 44px "Helvetica Neue", Arial, sans-serif';
        x.textBaseline = 'middle';
        x.fillText('DEVOXX', 8, 34);
      }),
      transparent: true,
      roughness: 0.8,
    }),
  );
  logo.position.set(halfW * 0.5, shoulder - H * 0.1, front + 0.004);
  g.add(logo);
  return { group: g, head, skin: std('#d9a07c', 0.8), hides: ['glasses', 'mic', 'collar', 'head', 'hair'] };
}

/**
 * CELESTINO — the photograph: short dark hair, fair, clean-shaven, and the crew
 * T-shirt, white with orange raglan sleeves and neck trim and the joke printed
 * across the chest in orange. The ribbon stays crew red: lanyard colours mean
 * something in this game (`src/sim/lanyards.ts`).
 */
function buildCelestino(torso: THREE.Mesh, H: number): Portrait {
  const g = new THREE.Group();
  const head = sculptHead({
    skin: '#e8bb9c',
    hairTop: '#2a221d',
    hairSide: '#322822',
    line: [0.55, 0.42, 0.18, -0.35],
    thickTop: 0.1,
    thickSide: 0.04,
    salt: 0,
    stubble: 0.18,
    narrow: 0.94,
    long: 1.1,
  });
  eyes(head, 0.1, '#3b2a1e');
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.05), std('#2a221d', 0.9));
    brow.position.set(sx * 0.32, 0.3, 0.93);
    head.add(brow);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.04), std('#8a4a3c', 0.8));
  mouth.position.set(0, -0.36, 0.95);
  head.add(mouth);
  g.add(head);
  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const R = H * 0.135;
  const orange = std('#f07a1e', 0.8);
  for (const sx of [-1, 1]) {
    // The raglan: an orange panel over each shoulder, running into the sleeve.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), orange);
    cap.scale.set(halfW * 0.85, H * 0.035, front * 2.05);
    cap.position.set(sx * halfW * 0.75, shoulder - H * 0.01, 0);
    g.add(cap);
  }
  const trim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, R * 0.05, 6, 18), orange);
  trim.rotation.x = Math.PI / 2;
  trim.position.set(0, shoulder + H * 0.004, 0);
  g.add(trim);
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 1.6, halfW * 0.8),
    new THREE.MeshStandardMaterial({
      map: canvasTex(256, 128, (x) => {
        x.fillStyle = '#f07a1e';
        x.textAlign = 'center';
        x.font = 'italic 24px "Comic Sans MS", "Marker Felt", cursive';
        x.fillText('Hey, Event Organizer', 128, 32);
        x.fillText('do Open Source', 128, 66);
        x.fillText('and save Big Money', 128, 100);
      }),
      transparent: true,
      roughness: 0.8,
    }),
  );
  print.position.set(0, shoulder - H * 0.12, front + 0.004);
  g.add(print);
  return { group: g, head, body: std('#f2efe9', 0.85), skin: std('#e8bb9c', 0.8), hides: ['collar', 'head', 'hair'] };
}

/* ------------------------------------------------- the three on the hall floor */

/** Rectangular frames on a sculpted head: `metal` for thin wire, else acetate. */
function specs(head: THREE.Mesh, colour: string, w: number, h: number, t: number, metal = false): void {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: metal ? 0.3 : 0.4, metalness: metal ? 0.7 : 0.05 });
  const ring = roundRectRing(w, h, t);
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(ring, m);
    f.position.set(sx * 0.33, 0.1, 0.97);
    head.add(f);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(t * 0.8, t, 0.95), m);
    temple.position.set(sx * 0.6, 0.14, 0.45);
    temple.rotation.y = sx * -0.2;
    head.add(temple);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, t * 0.8, t * 0.6), m);
  bridge.position.set(0, 0.16, 1.01);
  head.add(bridge);
}

function brows(head: THREE.Mesh, colour: string, thick = 0.06, tilt = 0.1): void {
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, thick, 0.05), std(colour, 0.9));
    b.position.set(sx * 0.32, 0.33, 0.93);
    b.rotation.z = sx * -tilt;
    head.add(b);
  }
}

/** A smile: a dark crescent, with teeth when it is a grin. */
function smile(head: THREE.Mesh, w: number, teeth: boolean): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std('#4a1f18', 0.8));
  m.scale.set(w, 0.16, 0.12);
  m.position.set(0, -0.38, 0.92);
  head.add(m);
  if (!teeth) return;
  const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.05, 0.05), std('#f3eee5', 0.5));
  t.position.set(0, -0.39, 0.96);
  head.add(t);
}

/** A moustache over the lip: a soft bar, fuller in the middle. */
function moustache(head: THREE.Mesh, colour: string, w: number, h: number): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), std(colour, 0.95));
  m.scale.set(w, h, 0.16);
  m.position.set(0, -0.27, 0.95);
  head.add(m);
}

/** A headset: pad over the left ear, boom along the cheek, mic at the mouth. */
function headset(head: THREE.Mesh, colour: string): void {
  const mat = std(colour, 0.5);
  const path = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.96, -0.05, 0.05), new THREE.Vector3(0.95, -0.48, 0.62), new THREE.Vector3(0.42, -0.44, 0.97));
  head.add(new THREE.Mesh(new THREE.TubeGeometry(path, 12, 0.028, 6), mat));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat);
  tip.position.copy(path.getPoint(1));
  head.add(tip);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat);
  pad.position.set(0.98, -0.02, 0.02);
  head.add(pad);
}

/**
 * Arms folded across the chest — Mario's and Josh's photographs both have them.
 * Built into the portrait (the shared figure's arms are hidden), because the
 * shared figure only knows how to swing them. Upper arms hang to the elbow, the
 * two forearms cross in front of the stomach, one over the other, and a hand
 * pokes out at each elbow.
 */
function foldedArms(g: THREE.Group, torso: THREE.Mesh, H: number, sleeve: THREE.Material, fore: THREE.Material, skin: THREE.Material, stripe?: THREE.Material): void {
  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const hip = torso.position.y - torso.scale.y / 2;
  const elbowY = hip + (shoulder - hip) * 0.36;
  const top = shoulder - 0.04 * H;
  const t = 0.08 * H;
  for (const sx of [-1, 1]) {
    const up = new THREE.Mesh(LIMB_GEO, sleeve);
    up.scale.set(0.075 * H, top - elbowY + t * 0.4, 0.085 * H);
    up.position.set(sx * (halfW + 0.03 * H), (top + elbowY) / 2, front * 0.25);
    up.rotation.x = -0.25;
    g.add(up);
    // The forearm from this elbow across to the far side.
    const fa = new THREE.Mesh(LIMB_GEO, fore);
    fa.scale.set(halfW * 2.05, t * 0.9, t);
    fa.position.set(0, elbowY + (sx > 0 ? 0.012 : -0.012) * H, front + t * (sx > 0 ? 0.62 : 0.5));
    fa.rotation.z = sx * 0.14;
    g.add(fa);
    if (stripe) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(halfW * 1.9, t * 0.12, 0.004), stripe);
      st.position.set(0, fa.position.y + t * 0.3, fa.position.z + t / 2 + 0.002);
      st.rotation.z = fa.rotation.z;
      g.add(st);
    }
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), skin);
    hand.scale.set(t * 0.75, t * 0.7, t * 0.7);
    hand.position.set(-sx * (halfW + 0.02 * H), elbowY + (sx > 0 ? 0.03 : -0.005) * H, front + t * 0.35);
    g.add(hand);
  }
}

/**
 * MARIO — the photograph with short hair (the older one had it long; Michele:
 * *"the hair are short now"*): short dark hair swept to one side with grey
 * through it, rectangular dark frames, a long grey-white beard under a dark
 * moustache, a black track jacket with red piping open over a maroon T-shirt
 * with a lightning bolt, arms folded.
 */
function buildMario(torso: THREE.Mesh, H: number): Portrait {
  const g = new THREE.Group();
  const skinC = '#d7a887';
  const head = sculptHead({
    skin: skinC,
    hairTop: '#2e2926',
    hairSide: '#5a5550',
    line: [0.52, 0.38, 0.14, -0.4],
    thickTop: 0.11,
    thickSide: 0.03,
    salt: 0.3,
    stubble: 0.85,
    narrow: 0.93,
    long: 1.12,
    beard: '#b9b4ad',
  });
  eyes(head, 0.1, '#2b1f17');
  specs(head, '#2a2b30', 0.6, 0.34, 0.05, true);
  brows(head, '#2e2926', 0.065, 0.06);
  // The beard: long, grey-white, hanging from the chin to the collarbone.
  const beardMat = std('#c9c4bc', 0.95);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 16, 1), beardMat);
  // Forward of the head's centre and tilted out over the chest: the torso's
  // front is 1.4 head radii out, and a beard behind it is no beard at all.
  beard.scale.set(0.95, 1.4, 0.6);
  beard.rotation.set(Math.PI - 0.5, 0, 0);
  beard.position.set(0, -0.98, 1.05);
  head.add(beard);
  moustache(head, '#2e2926', 0.5, 0.11);
  // ...over the top of the beard, which stands proud of the face.
  (head.children[head.children.length - 1] as THREE.Mesh).position.set(0, -0.26, 1.04);
  g.add(head);

  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const hip = torso.position.y - torso.scale.y / 2;
  const red = std('#c4262e', 0.6);
  // The maroon tee between the open jacket fronts, the bolt on it.
  const tee = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 0.9, shoulder - hip),
    new THREE.MeshStandardMaterial({
      roughness: 0.85,
      map: canvasTex(64, 128, (x) => {
        x.fillStyle = '#7a1e26';
        x.fillRect(0, 0, 64, 128);
        x.fillStyle = '#f2c230';
        x.beginPath();
        x.moveTo(38, 14);
        x.lineTo(18, 50);
        x.lineTo(32, 50);
        x.lineTo(24, 84);
        x.lineTo(48, 42);
        x.lineTo(34, 42);
        x.closePath();
        x.fill();
      }),
    }),
  );
  tee.position.set(0, (shoulder + hip) / 2, front + 0.003);
  g.add(tee);
  for (const sx of [-1, 1]) {
    // Red piping down each jacket front.
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.008 * H, shoulder - hip, 0.004), red);
    p.position.set(sx * halfW * 0.45, (shoulder + hip) / 2, front + 0.005);
    g.add(p);
  }
  // A stand-up track collar, black, with the red at its edge.
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.075, H * 0.08, H * 0.04, 18, 1, true, Math.PI * 0.25, Math.PI * 1.5), std('#1c1c20', 0.7));
  collar.position.set(0, shoulder + H * 0.015, 0);
  collar.rotation.y = Math.PI;
  g.add(collar);
  const jacket = std('#1c1c20', 0.7);
  const skin = std(skinC, 0.8);
  foldedArms(g, torso, H, jacket, jacket, skin, red);
  return { group: g, head, body: jacket, skin, hides: ['glasses', 'mic', 'collar', 'head', 'hair', 'arm-l', 'arm-r', 'lanyard', 'cup', 'laptop-deck', 'laptop-lid'] };
}

/**
 * VENKAT — the photograph: black hair, brown skin, thin wire frames, a thick
 * black moustache, a headset mic, a dark grey polo with a small emblem on the
 * chest. And — Michele: *"(no shoes!)"* — the bare feet he gives every talk in.
 */
function buildVenkat(torso: THREE.Mesh, H: number): Portrait {
  const g = new THREE.Group();
  const skinC = '#9c6a48';
  const head = sculptHead({
    skin: skinC,
    hairTop: '#181514',
    hairSide: '#26221f',
    line: [0.5, 0.4, 0.16, -0.38],
    thickTop: 0.12,
    thickSide: 0.04,
    salt: 0.06,
    stubble: 0.12,
    narrow: 0.95,
    long: 1.08,
    beard: '#3a2a20',
  });
  eyes(head, 0.1, '#1a120d');
  specs(head, '#9a9690', 0.58, 0.36, 0.035, true);
  brows(head, '#181514', 0.07, 0.08);
  moustache(head, '#141110', 0.62, 0.17);
  smile(head, 0.34, false);
  headset(head, '#c9a888');
  g.add(head);
  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const polo = std('#56585b', 0.85);
  const dark = std('#3a3b3d', 0.85);
  for (const sx of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(halfW * 0.5, H * 0.05, 0.01), dark);
    flap.position.set(sx * halfW * 0.28, shoulder + H * 0.005, front * 0.72);
    flap.rotation.set(-1.0, sx * -0.5, sx * 0.3);
    g.add(flap);
  }
  // The dark placket, and the small emblem on his left chest.
  const placket = new THREE.Mesh(new THREE.BoxGeometry(halfW * 0.22, H * 0.1, 0.004), std('#141414', 0.9));
  placket.position.set(0, shoulder - H * 0.05, front + 0.002);
  g.add(placket);
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(H * 0.014, 12), std('#b8322c', 0.6));
  emblem.position.set(halfW * 0.45, shoulder - H * 0.08, front + 0.004);
  g.add(emblem);
  return { group: g, head, body: polo, skin: std(skinC, 0.8), hides: ['glasses', 'mic', 'collar', 'head', 'hair', 'lanyard'], barefoot: true };
}

/**
 * JOSH — the photograph: short brown hair, receding a little, black rectangular
 * frames, a gingery short beard, a big grin, a light grey T-shirt with a green
 * leaf on it, arms folded. The shirt says his word, not a logo: "bootiful".
 */
function buildJosh(torso: THREE.Mesh, H: number): Portrait {
  const g = new THREE.Group();
  const skinC = '#eab99a';
  const head = sculptHead({
    skin: skinC,
    hairTop: '#6a4a33',
    hairSide: '#5d412d',
    line: [0.62, 0.46, 0.18, -0.36],
    thickTop: 0.08,
    thickSide: 0.03,
    salt: 0,
    stubble: 0.75,
    narrow: 0.95,
    long: 1.12,
    beard: '#8e5d3c',
  });
  eyes(head, 0.1, '#3b3a44');
  specs(head, '#151518', 0.64, 0.36, 0.08);
  brows(head, '#6a4a33', 0.05, 0.05);
  smile(head, 0.44, true);
  g.add(head);
  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const R = H * 0.135;
  const tee = std('#c9c8c4', 0.9);
  const neck = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, R * 0.05, 6, 18), std('#b9b8b3', 0.9));
  neck.rotation.x = Math.PI / 2;
  neck.position.set(0, shoulder + H * 0.004, 0);
  g.add(neck);
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 1.7, halfW * 0.5),
    new THREE.MeshStandardMaterial({
      transparent: true,
      roughness: 0.85,
      map: canvasTex(256, 76, (x) => {
        x.fillStyle = '#6db33f';
        x.beginPath();
        x.ellipse(222, 22, 28, 14, -0.5, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = '#c9c8c4';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(200, 34);
        x.quadraticCurveTo(222, 24, 244, 10);
        x.stroke();
        x.fillStyle = '#5c9e33';
        x.font = 'bold 50px "Helvetica Neue", Arial, sans-serif';
        x.textAlign = 'center';
        x.fillText('bootiful', 112, 66);
      }),
    }),
  );
  // Above the folded arms, where the photograph has it.
  print.position.set(0, shoulder - H * 0.06, front + 0.004);
  g.add(print);
  const skin = std(skinC, 0.8);
  foldedArms(g, torso, H, tee, skin, skin);
  return { group: g, head, body: tee, skin, hides: ['glasses', 'mic', 'collar', 'head', 'hair', 'arm-l', 'arm-r', 'lanyard', 'cup', 'laptop-deck', 'laptop-lid'] };
}

type Builder = (torso: THREE.Mesh, H: number) => Portrait;
/** Who gets a portrait: Stephan by role, the rest by name on a named NPC. */
const BY_NAME: Readonly<Record<string, Builder>> = { Celestino: buildCelestino, Mario: buildMario, Venkat: buildVenkat, Josh: buildJosh };

/* --------------------------------------------------------------------- pool */

export interface People3D {
  update(snap: GameSnapshot, t: number): void;
}

export function createPeople(parent: THREE.Object3D): People3D {
  const models: PersonModel[] = [];
  const necks = new Map<PersonModel, THREE.Mesh>();
  const portraits = new Map<PersonModel, Portrait>();
  return {
    update(snap: GameSnapshot, t: number): void {
      const people = snap.people ?? [];
      const plates = snap.plates ?? [];
      for (let i = 0; i < people.length; i++) {
        let pm = models[i];
        if (!pm) {
          pm = buildPerson();
          necks.set(pm, soften(pm.root.children[0] as THREE.Group));
          pm.root.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          models.push(pm);
          parent.add(pm.root);
        }
        pm.root.visible = true;
        const p = people[i];
        pm.pose({ ...p, colour: p.colour ?? ROLE_COLOR[p.role] ?? ROLE_COLOR.visitor }, riseAt(p.x, p.y, plates), t);
        const yaw = pm.root.children[0] as THREE.Group;
        const neck = necks.get(pm) as THREE.Mesh;
        placeNeck(yaw, neck);
        const head = yaw.getObjectByName('head') as THREE.Mesh;
        const torso = yaw.getObjectByName('torso') as THREE.Mesh;
        const R = head.scale.x / 2;
        const H = head.position.y + R;
        for (const n of ['head', 'hair', 'arm-l', 'arm-r']) (yaw.getObjectByName(n) as THREE.Object3D).visible = true;

        let pt = portraits.get(pm);
        const who = p.role === 'stephan' ? 'Stephan' : p.role === 'staff' && p.name && BY_NAME[p.name] ? p.name : null;
        placeFeet(yaw, H, null);
        if (pt && pt.group.userData.who !== who) {
          // A pooled figure that was one of them and is now somebody else.
          torso.material = pt.group.userData.cloth as THREE.Material;
          yaw.remove(pt.group);
          portraits.delete(pm);
          pt = undefined;
        }
        if (!who) continue;
        if (!pt) {
          pt = who === 'Stephan' ? buildStephan(torso, H) : BY_NAME[who](torso, H);
          pt.group.userData.who = who;
          pt.group.userData.cloth = torso.material;
          yaw.add(pt.group);
          portraits.set(pm, pt);
        }
        for (const n of pt.hides) (yaw.getObjectByName(n) as THREE.Object3D).visible = false;
        pt.head.scale.setScalar(R);
        pt.head.position.copy(head.position);
        neck.material = pt.skin;
        if (pt.body) torso.material = pt.body;
        if (pt.barefoot) placeFeet(yaw, H, pt.skin);
      }
      for (let i = people.length; i < models.length; i++) models[i].root.visible = false;
    },
  };
}
