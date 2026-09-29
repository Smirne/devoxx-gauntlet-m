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
 *    photographs Michele sent (28 Sep 2026); so, since 29 Sep, do the two who
 *    built the game — Michele, from a photograph, and Claude, a terminal for a
 *    face (`src/sim/cameos.ts`);
 *  - everybody wears shoes, because the one person who does not is the joke.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { buildPerson, type PersonModel } from '../render/people';
import { CLAUDE_CLAY, CLAUDE_CREAM } from '../sim/cameos';
import { WELLD_MARK_ASPECT, drawWellD } from './welld';
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
const HAND_GEO = new THREE.SphereGeometry(0.5, 10, 8);
/** The crowd's eyes: two dark dots, enough for a face to look somewhere. */
const EYE_GEO = new THREE.SphereGeometry(0.5, 8, 6);
const EYE_MAT = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b1714'), roughness: 0.3 });

/**
 * The crowd's hair: a shell over the skull with a HAIRLINE, not a cap.
 *
 * The shared figure's hair is a squashed sphere lifted over the head, and at
 * 3D distance it had the same fault Stephan's first head had — a band round
 * the skull at one height, a beanie (Michele, 28 Sep). This keeps its size and
 * pose (the figure scales and places it) but tucks every vertex below a line
 * that is high at the forehead and low at the nape into the head, and roughens
 * what is left so it catches the light like hair.
 */
const HAIR_GEO = ((): THREE.BufferGeometry => {
  const g = new THREE.SphereGeometry(0.5, 28, 20);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * 2;
    const y = pos.getY(i) * 2;
    const z = pos.getZ(i) * 2;
    // Figure-local: +z is the face. Forehead line high, nape low.
    const line = 0.05 + 0.3 * Math.max(0, z) - 0.55 * Math.max(0, -z) - 0.15 * (1 - Math.abs(z)) * Math.abs(x);
    const h = Math.sin(Math.round(x * 9) * 127.1 + Math.round(y * 9) * 311.7 + Math.round(z * 9) * 74.7) * 43758.5453;
    const n = h - Math.floor(h);
    const k = y + (n - 0.5) * 0.12 > line ? 1 + 0.04 * n : 0.8;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
})();

/** Swap the shared figure's boxes for rounded ones, once per pooled model. */
function soften(yaw: THREE.Group): THREE.Mesh {
  (yaw.getObjectByName('torso') as THREE.Mesh).geometry = TORSO_GEO;
  for (const n of ['leg-l', 'leg-r', 'arm-l', 'arm-r']) (yaw.getObjectByName(n) as THREE.Mesh).geometry = LIMB_GEO;
  (yaw.getObjectByName('head') as THREE.Mesh).geometry = HEAD_GEO;
  (yaw.getObjectByName('hair') as THREE.Mesh).geometry = HAIR_GEO;
  // Hands, at the end of each arm, riding its pivot so they swing with it.
  for (const side of ['l', 'r']) {
    const arm = yaw.getObjectByName(`arm-${side}`) as THREE.Mesh;
    const hand = new THREE.Mesh(HAND_GEO);
    hand.name = `hand-${side}`;
    hand.castShadow = true;
    (arm.parent as THREE.Object3D).add(hand);
  }
  for (const side of ['l', 'r']) {
    const shoe = new THREE.Mesh(SHOE_GEO, SHOE_MAT);
    shoe.name = `shoe-${side}`;
    shoe.castShadow = true;
    (yaw.getObjectByName(`leg-${side}-pivot`) as THREE.Object3D).add(shoe);
  }
  for (const side of ['l', 'r']) {
    const eye = new THREE.Mesh(EYE_GEO, EYE_MAT);
    eye.name = `eye-${side}`;
    yaw.add(eye);
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
  for (const [side, sx] of [
    ['l', -1],
    ['r', 1],
  ] as const) {
    const eye = yaw.getObjectByName(`eye-${side}`) as THREE.Mesh;
    eye.scale.set(R * 0.17, R * 0.22, R * 0.1);
    eye.position.set(head.position.x + sx * R * 0.34, head.position.y + R * 0.08, head.position.z + R * 0.92);
    eye.visible = head.visible;
    const arm = yaw.getObjectByName(`arm-${side}`) as THREE.Mesh;
    const hand = yaw.getObjectByName(`hand-${side}`) as THREE.Mesh;
    hand.material = head.material;
    hand.scale.set(arm.scale.x * 1.15, arm.scale.x * 1.35, arm.scale.z * 1.05);
    hand.position.set(0, -arm.scale.y - arm.scale.x * 0.4, 0);
  }
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
  /** The bones under the skin; every field has a mild default. See `FACE`. */
  face?: Partial<FaceShape>;
}

/**
 * The FACE, not just the head: what turns a ball with features stuck on it into
 * somebody. Michele, 28 Sep 2026: *"Can we work on Stephan and Josh face
 * shape?"* — the close-ups were spheres with a nose bump, the glasses floating
 * in front and the eyes two marbles on the surface. All in head radii.
 */
interface FaceShape {
  /** Brow ridge standing forward over the eyes. */
  brow: number;
  /** How deep the eyes sit under it. */
  socket: number;
  /** Cheekbones (and, pushed up, a grin's cheeks). */
  cheek: number;
  /** How fast the jaw narrows to the chin: high is a pointed chin, low a square jaw. */
  jawTaper: number;
  /** A wider lower face at the jaw's corners. */
  jawWidth: number;
  /** The chin pushed forward. */
  chin: number;
  /** The nose's reach, and its width. */
  nose: number;
  noseW: number;
  /** The crown flattened, less of an egg. */
  crownFlat: number;
  /** Warmth on the cheeks and nose. */
  blush: number;
  /** Beard shadow on the upper lip, as a share of `stubble`. */
  lip: number;
  /** Ear size, and how far they stand off the head. */
  ears: number;
}
const FACE: FaceShape = { brow: 0.05, socket: 0.05, cheek: 0.03, jawTaper: 0.18, jawWidth: 0, chin: 0.03, nose: 0.16, noseW: 0.13, crownFlat: 0.05, blush: 0.08, lip: 0, ears: 1 };

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (x: number, y: number, z: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
const bump = (u: number, v: number): number => Math.exp(-(u * u + v * v));

/**
 * One mesh for skull, face and hair, instead of a head with a cap on it.
 *
 * Michele, 28 Sep 2026, on the first close-up: *"Stephan looks like he has a
 * beanie with some stuff on top."* A cap is a hat whatever colour it is: its
 * edge runs round the head at one height. Hair is the head's own surface, grown
 * out a little where there is hair and not at all where there is not, with a
 * hairline that is high at the forehead, recedes at the temples, is cropped
 * short over the ears and drops at the nape. So that is what this builds: a
 * unit sphere, shaped into a face (`FaceShape`: brow, sockets, cheekbones,
 * nose, jaw and chin), with every vertex above the hairline pushed out by a
 * textured thickness and coloured hair, and the rest coloured skin — with the
 * beard shadow, the sockets' shade and the cheeks' warmth painted in.
 *
 * `userData.surf(x, y)` is the face's own depth at a point, so the features
 * (eyes, brows, glasses, mouth) sit ON it rather than at a guessed z.
 */
function sculptHead(spec: HeadSpec): THREE.Mesh {
  const f: FaceShape = { ...FACE, ...spec.face };
  const geo = new THREE.SphereGeometry(1, 72, 54);
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const skin = new THREE.Color(spec.skin);
  const top = new THREE.Color(spec.hairTop);
  const side = new THREE.Color(spec.hairSide);
  const beard = new THREE.Color(spec.beard ?? '#4d4640');
  const warm = new THREE.Color('#d0645a');
  const c = new THREE.Color();
  const [front, temple, over, nape] = spec.line;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const ux = x;
    const uy = y;
    const uz = z;
    const a = Math.abs(Math.atan2(x, z));
    // The hairline, round the head: forehead -> temple -> over the ear -> nape.
    const line = a < 0.9 ? front + (temple - front) * (a / 0.9) : a < 1.6 ? temple + (over - temple) * ((a - 0.9) / 0.7) : over + (nape - over) * ((a - 1.6) / (Math.PI - 1.6));
    const n = hash(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30));
    const hair = smooth(line - 0.02, line + 0.07, y + (n - 0.5) * 0.05);
    const crown = smooth(0.25, 0.85, y);
    const thick = hair * (spec.thickSide + (spec.thickTop - spec.thickSide) * crown) * (0.75 + 0.5 * n);
    const facing = smooth(0.35, 0.85, uz);
    // The skull: a flatter crown.
    if (y > 0.55) y = 0.55 + (y - 0.55) * (1 - f.crownFlat);
    // The face's width, then the jaw: wider at its corners, narrowing to the chin.
    x *= spec.narrow;
    if (y < -0.15) {
      const d = -0.15 - y;
      x *= 1 - f.jawTaper * d + f.jawWidth * d * (1 - d) * 2;
      z *= 1 - 0.08 * d;
    }
    y *= y < 0 ? spec.long : 1;
    // Bones under the skin, all on the front of the head.
    const ax = Math.abs(x);
    z += f.brow * bump(ax / 0.42, (uy - 0.3) / 0.08) * facing;
    const sock = bump((ax - 0.3) / 0.14, (uy - 0.1) / 0.11) * facing;
    z -= f.socket * sock;
    const cheek = bump((ax - 0.52) / 0.2, (uy + 0.08) / 0.16) * facing;
    x += Math.sign(x) * f.cheek * 0.6 * cheek;
    z += f.cheek * cheek;
    z += f.chin * bump(x / 0.26, (uy + 0.86) / 0.14) * facing;
    if (uz > 0.5) z += f.nose * Math.exp(-((x / f.noseW) ** 2)) * (bump(0, (uy + 0.1) / 0.17) + 0.45 * bump(0, (uy - 0.12) / 0.12));
    const r = 1 + thick;
    pos.setXYZ(i, x * r, y * r, z * r);
    // Colour: hair (darker on the crown, salt through it), else skin — shaded
    // in the sockets, warm on the cheeks and nose, beard shadow on the jaw and,
    // for some, the upper lip.
    c.copy(side).lerp(top, crown);
    if (n > 1 - spec.salt) c.lerp(new THREE.Color('#bdb8b0'), 0.6);
    c.multiplyScalar(0.9 + 0.2 * hash(i, 1, 2));
    const sk = skin.clone();
    sk.multiplyScalar(1 - 0.22 * sock);
    sk.lerp(warm, f.blush * (cheek + 0.6 * bump(ux / 0.12, (uy + 0.1) / 0.15)) * facing);
    const jaw = smooth(-0.1, -0.45, uy) * smooth(-0.35, 0.2, uz);
    const lip = f.lip * bump(ux / 0.3, (uy + 0.3) / 0.07) * facing;
    if (spec.stubble > 0) sk.lerp(beard, Math.min(1, jaw + lip) * spec.stubble * (0.7 + 0.3 * hash(i, 5, 7)));
    c.lerp(sk, 1 - hair);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }));
  mesh.castShadow = true;
  // The face's depth at (x, y), for putting things on it.
  const ray = new THREE.Raycaster();
  const probe = new THREE.Mesh(geo);
  const surf = (x: number, y: number): number => {
    ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(probe, false)[0];
    return hit ? hit.point.z : Math.sqrt(Math.max(0, 1 - x * x - y * y));
  };
  mesh.userData.surf = surf;
  mesh.userData.probe = probe;
  mesh.userData.skin = spec.skin;
  // Ears, in the skin colour, cupped and set back.
  const earMat = new THREE.MeshStandardMaterial({ color: skin.clone().lerp(warm, 0.08), roughness: 0.7 });
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), earMat);
    ear.scale.set(0.1 * f.ears, 0.25 * f.ears, 0.16 * f.ears);
    ear.position.set(sx * (0.94 * spec.narrow + 0.03 * (f.ears - 1)), -0.06, -0.04);
    ear.rotation.y = sx * 0.35 * f.ears;
    mesh.add(ear);
  }
  return mesh;
}

/** A sculpted head's face depth at (x, y), in head radii. */
const surfOf = (head: THREE.Mesh): ((x: number, y: number) => number) => head.userData.surf as (x: number, y: number) => number;

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
  /**
   * Short sleeves: bare forearms in `skin`, and this sleeve (with its tipped cuff)
   * over the top of each arm. Built onto the arm pivots, so it swings with them.
   */
  sleeve?: { cloth: THREE.Material; cuff: THREE.Material };
  /** Long sleeves in a cloth of their own (Michele's striped hoodie), on the figure's own arms. */
  arms?: THREE.Material;
  /**
   * Shorts: bare shins in `skin`, and these shorts (with their turned-up hem)
   * over the top of each leg — built onto the leg pivots like the sleeves.
   */
  shorts?: { cloth: THREE.Material; hem: THREE.Material };
  /** Shoes of their own, where the crowd's are dark: Michele's white trainers. */
  shoes?: THREE.Material;
  /** Anything in the portrait that moves on its own clock — Claude's cursor. */
  tick?: (t: number) => void;
  /**
   * How far the badge hangs, as a fraction of the crowd's drop: the same ribbon
   * from the same collar, shorter, when the shirt under it has something to show.
   */
  badge?: number;
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

/**
 * Eyes, set INTO the face: the whites sunk into the socket, a dark iris with a
 * catchlight, and an upper lid in the skin over the top third, which is what
 * stops them reading as two marbles glued to a ball.
 *
 * `follow` turns each white and lid with the face's curve. On a narrow face the
 * surface falls away fast towards the temples, so a white set square to the
 * head is buried at the inner corner and bare at the outer one, and the iris,
 * looking straight ahead, reads as looking at the nose. Opt-in, because the
 * portraits drawn before it are tuned without it.
 */
function eyes(head: THREE.Mesh, y: number, colour = '#1f1a16', open = 1, follow = false): void {
  const surf = surfOf(head);
  const white = std('#efe9e0', 0.35);
  const iris = std(colour, 0.25);
  const lid = std(head.userData.skin as string, 0.7);
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const x = sx * 0.3;
    const z = surf(x, y);
    const turn = follow ? Math.atan((surf(x - 0.08, y) - surf(x + 0.08, y)) / 0.16) : 0;
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), white);
    w.scale.set(1, 0.72 * open, 0.55);
    w.position.set(x, y, z - 0.03);
    w.rotation.y = turn;
    head.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 8), iris);
    p.scale.set(1, 1, 0.5);
    p.position.set(x, y - 0.005, z + 0.028);
    head.add(p);
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), glint);
    g.position.set(x + 0.02, y + 0.02, z + 0.052);
    head.add(g);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), lid);
    l.scale.set(1, 0.8, 0.62);
    l.position.set(x, y + 0.005, z - 0.035);
    l.rotation.y = turn;
    head.add(l);
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
  /*
   * The face: longer than it is wide, high cheekbones pushed up by the grin, a
   * tapering jaw to a definite chin, a straight nose, and the brow sitting low
   * over the eyes behind the frames. Warm, outdoorsy skin, grey stubble right
   * up to the lip line. Michele, 28 Sep: "Can we work on Stephan and Josh face
   * shape?" — he was a ball wearing glasses.
   */
  const head = sculptHead({
    /*
     * Michele's second set of photographs (28 Sep): the hair is CROPPED, short
     * and grey all over, receding at the temples — not the tousled top the first
     * pass gave him — and his skin is lighter than the stage-lit first photo.
     */
    skin: '#e2b08e',
    hairTop: '#7d7872',
    hairSide: '#a29d96',
    line: [0.56, 0.4, 0.1, -0.45],
    thickTop: 0.065,
    thickSide: 0.025,
    salt: 0.4,
    stubble: 0.6,
    narrow: 0.88,
    long: 1.2,
    beard: '#5a534c',
    face: { brow: 0.08, socket: 0.07, cheek: 0.09, jawTaper: 0.34, jawWidth: 0.04, chin: 0.07, nose: 0.27, noseW: 0.11, crownFlat: 0.1, blush: 0.14, lip: 0.45, ears: 1.05 },
  });
  spikes(head, { count: 260, len: 0.16, width: 0.05, dark: '#6f6a64', light: '#c2bdb6', minY: 0.05 });
  // Eyes narrowed by the grin.
  eyes(head, 0.1, '#3a2c20', 0.8);
  brows(head, '#4a4642', 0.055, 0.14, 0.32);
  specs(head, '#a8682a', 0.58, 0.34, 0.045);
  // The grin: wide, corners well up, teeth showing.
  smile(head, 0.56, true, 0.11, 0.08);
  // THE MIC ("Remember the MIC"): a slim skin-tone boom hooked over his left
  // ear (+x), running along the cheek to a small capsule just off the corner
  // of the mouth — his in every photograph.
  headset(head, '#d6b89a', { tube: 0.017, tip: 0.045, pad: 0.05, at: [0.5, -0.3], off: 0.035 });
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
  // Short polo sleeves, their cuffs tipped like the collar.
  const cuff = new THREE.MeshStandardMaterial({ map: tipped, roughness: 0.8 });
  return { group: g, head, skin: std('#e2b08e', 0.8), hides: ['glasses', 'mic', 'collar', 'head', 'hair'], sleeve: { cloth: std('#434a3c', 0.85), cuff } };
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
  brows(head, '#2a221d', 0.06, 0.04, 0.3);
  smile(head, 0.3, false, 0.025, 0.02);
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

/**
 * Rectangular frames on a sculpted head: `metal` for thin wire, else acetate.
 * Seated on the face — in front of the brow and the nose bridge, each lens
 * turned a little to wrap — with the temples running back to the ears.
 */
function specs(head: THREE.Mesh, colour: string, w: number, h: number, t: number, metal = false): void {
  const surf = surfOf(head);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: metal ? 0.3 : 0.35, metalness: metal ? 0.7 : 0.05 });
  const ring = roundRectRing(w, h, t);
  const y = 0.1;
  const z = Math.max(surf(0, 0.14) + 0.01, surf(0.33, y) + 0.07, surf(0.33, 0.3) + 0.02);
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(ring, m);
    f.position.set(sx * 0.33, y, z - 0.03);
    f.rotation.y = sx * 0.12;
    head.add(f);
    // The temple: from the lens's outer corner back over the ear.
    const a = new THREE.Vector3(sx * (0.33 + w / 2 - 0.02), y + h * 0.3, z - 0.07);
    const b = new THREE.Vector3(sx * 0.93, y + 0.02, -0.1);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(t * 0.7, t * 0.9, a.distanceTo(b)), m);
    temple.position.copy(a).add(b).multiplyScalar(0.5);
    temple.lookAt(b);
    head.add(temple);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, t * 0.8, t * 0.6), m);
  bridge.position.set(0, y + h * 0.15, z);
  head.add(bridge);
}

function brows(head: THREE.Mesh, colour: string, thick = 0.06, tilt = 0.1, y = 0.31): void {
  const surf = surfOf(head);
  const mat = std(colour, 0.9);
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.28, thick, 0.06, 1, thick * 0.4), mat);
    b.position.set(sx * 0.31, y, surf(sx * 0.31, y) + 0.005);
    b.rotation.set(-0.15, sx * 0.25, sx * -tilt);
    head.add(b);
  }
}

/**
 * A band laid onto the face between two curves, `top(t)` and `bottom(t)` for
 * t in 0..1, tessellated in rows so its middle follows the face as well as its
 * edges (a flat outline-only shape cut chords through the cheeks).
 */
function faceBand(head: THREE.Mesh, top: (t: number) => [number, number], bottom: (t: number) => [number, number], mat: THREE.Material, lift: number): void {
  const surf = surfOf(head);
  const N = 24;
  const M = 4;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= M; j++) {
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const [ax, ay] = top(t);
      const [bx, by] = bottom(t);
      const x = ax + (bx - ax) * (j / M);
      const y = ay + (by - ay) * (j / M);
      pos.push(x, y, surf(x, y) + lift);
    }
  }
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + N + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  (m.material as THREE.Material).side = THREE.DoubleSide;
  head.add(m);
}

/**
 * A mouth, on the face's own curve.
 *
 * Michele, 28 Sep: *"her mouth and stephan's are odd"*. The first one was a
 * thin black lens with pointed corners and a sliver of white — a grimace. A
 * grin is a D: the upper edge almost level and lifting at the corners, the
 * lower edge a deep round curve, the corners ROUNDED; inside, a row of upper
 * teeth over a dark red (not black) mouth; and soft lips framing it rather
 * than an outline. A closed smile is just the lip line, curving up, with the
 * lower lip under it.
 */
function smile(head: THREE.Mesh, w: number, teeth: boolean, open = 0.1, up = 0.05, y0 = -0.4): void {
  const hw = w / 2;
  // Upper edge: level in the middle, lifting to the corners.
  const upper = (t: number): [number, number] => {
    const x = -hw + 2 * hw * t;
    const u = (2 * t - 1) ** 2;
    return [x, y0 + up * u];
  };
  // Lower edge: a deep round curve, meeting the upper one at rounded corners.
  const lower = (t: number): [number, number] => {
    const x = -hw * 0.94 + 2 * hw * 0.94 * t;
    const s = Math.sin(Math.PI * t);
    return [x, y0 + up * (2 * t - 1) ** 2 - Math.max(0.012, open) * Math.pow(s, 0.8) * 1.25];
  };
  const lipMat = std('#bd756b', 0.55);
  if (open > 0.04) {
    faceBand(head, upper, lower, std('#5b1f1c', 0.8), 0.018);
    if (teeth) {
      const tl = (t: number): [number, number] => {
        const [ux, uy] = upper(t);
        const [, ly] = lower(t);
        return [ux * 0.97, uy + (ly - uy) * 0.5];
      };
      faceBand(head, (t) => {
        const [x, y] = upper(t);
        return [x * 0.95, y - 0.004];
      }, tl, std('#f1ebe0', 0.4), 0.021);
    }
    // Lips: a thin upper one, a fuller lower one, both tapering to the corners.
    faceBand(head, (t) => {
      const [x, y] = upper(t);
      return [x, y + 0.028 * Math.sin(Math.PI * t)];
    }, upper, lipMat, 0.016);
    faceBand(head, lower, (t) => {
      const [x, y] = lower(t);
      return [x, y - 0.045 * Math.sin(Math.PI * t)];
    }, lipMat, 0.016);
  } else {
    // Closed: the line where the lips meet, and the lower lip.
    faceBand(head, upper, (t) => {
      const [x, y] = upper(t);
      return [x, y - 0.014 * Math.sin(Math.PI * t) - 0.004];
    }, std('#7a3a34', 0.6), 0.016);
    faceBand(head, (t) => {
      const [x, y] = upper(t);
      return [x * 0.8, y - 0.016];
    }, (t) => {
      const [x, y] = upper(t);
      return [x * 0.8, y - 0.016 - 0.04 * Math.sin(Math.PI * t)];
    }, lipMat, 0.014);
  }
}

/**
 * Short, POINTY hair — Michele, 28 Sep: *"Stephan hair should be pointy!"* A
 * crop gelled up into little spikes over the crown and the front, each one a
 * short cone rising off the sculpted hair, leaning up and a touch forward,
 * salt-and-pepper from spike to spike. Short, so it reads as a spiky crop
 * rather than the punk tufts of the very first attempt.
 */
function spikes(head: THREE.Mesh, o: { count: number; len: number; width: number; dark: string; light: string; minY: number }): void {
  const probe = head.userData.probe as THREE.Mesh;
  const ray = new THREE.Raycaster();
  const cone = new THREE.ConeGeometry(o.width, 1, 5);
  cone.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const im = new THREE.InstancedMesh(cone, mat, o.count);
  const dark = new THREE.Color(o.dark);
  const light = new THREE.Color(o.light);
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const mm = new THREE.Matrix4();
  let n = 0;
  const tries = o.count * 4;
  for (let k = 0; k < tries && n < o.count; k++) {
    // A Fibonacci spiral over the upper cap, kept to where the hair is.
    const y = 1 - (k / tries) * (1 - o.minY);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = k * 2.399963;
    const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    // Not over the forehead's bare skin: the front is allowed only higher up.
    if (dir.z > 0.35 && dir.y < 0.5) continue;
    // Over the ears and the nape the crop is too short to stand up.
    if (dir.y < 0.3 && dir.z > -0.3) continue;
    ray.set(dir.clone().multiplyScalar(3), dir.clone().negate());
    const hit = ray.intersectObject(probe, false)[0];
    if (!hit) continue;
    const h = hash(k, 3, 9);
    const lean = dir.clone().multiplyScalar(0.8).add(up.clone().multiplyScalar(0.55)).add(new THREE.Vector3(0, 0, 0.25 * Math.max(0, dir.z))).normalize();
    q.setFromUnitVectors(up, lean);
    const len = o.len * (0.7 + 0.6 * h);
    mm.compose(hit.point.clone().addScaledVector(dir, -0.03), q, new THREE.Vector3(1, len, 1));
    im.setMatrixAt(n, mm);
    c.copy(dark).lerp(light, hash(k, 7, 1));
    im.setColorAt(n, c);
    n++;
  }
  im.count = n;
  im.castShadow = true;
  head.add(im);
}

/** A moustache over the lip: a soft bar, fuller in the middle. */
function moustache(head: THREE.Mesh, colour: string, w: number, h: number): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), std(colour, 0.95));
  m.scale.set(w, h, 0.16);
  m.position.set(0, -0.27, surf0(head, 0, -0.27) + 0.01);
  head.add(m);
}
const surf0 = (head: THREE.Mesh, x: number, y: number): number => surfOf(head)(x, y);

/** A headset: pad over the left ear, boom along the cheek, mic at the mouth. */
function headset(head: THREE.Mesh, colour: string, o: { tube?: number; tip?: number; pad?: number; at?: [number, number]; off?: number } = {}): void {
  const mat = std(colour, 0.5);
  const [tx, ty] = o.at ?? [0.44, -0.42];
  const tipAt = new THREE.Vector3(tx, ty, surf0(head, tx, ty) + (o.off ?? 0.06));
  // Hugging the cheek: the control point sits just off the face's own side.
  const mid = new THREE.Vector3(0.9, (ty - 0.05) / 2, 0.5);
  mid.z = Math.max(mid.z, surf0(head, 0.85, mid.y) + 0.04);
  const path = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.97, 0.02, 0.02), mid, tipAt);
  head.add(new THREE.Mesh(new THREE.TubeGeometry(path, 20, o.tube ?? 0.026, 6), mat));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(o.tip ?? 0.072, 10, 8), mat);
  tip.scale.set(1.3, 1, 1);
  tip.position.copy(tipAt);
  head.add(tip);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(o.pad ?? 0.11, 10, 8), mat);
  pad.position.set(0.98, 0.02, 0.0);
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
  return { group: g, head, body: jacket, skin, hides: ['glasses', 'mic', 'collar', 'head', 'hair', 'arm-l', 'arm-r', 'hand-l', 'hand-r', 'cup'] };
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
  smile(head, 0.34, false, 0.03, 0.03);
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
  return { group: g, head, body: polo, skin: std(skinC, 0.8), hides: ['glasses', 'mic', 'collar', 'head', 'hair'], barefoot: true };
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
    narrow: 1.0,
    long: 1.06,
    beard: '#8e5d3c',
    /*
     * Broad and square: a wide jaw that barely narrows, full cheeks lifted by
     * the grin, a rounded chin under the beard, a high forehead where the hair
     * has gone back, ears that stand out. Rosy.
     */
    face: { brow: 0.05, socket: 0.05, cheek: 0.1, jawTaper: 0.02, jawWidth: 0.28, chin: 0.05, nose: 0.21, noseW: 0.15, crownFlat: 0.14, blush: 0.22, lip: 0.55, ears: 1.25 },
  });
  eyes(head, 0.1, '#4a5a66', 0.75);
  specs(head, '#151518', 0.64, 0.36, 0.08);
  brows(head, '#6a4a33', 0.05, 0.02, 0.31);
  smile(head, 0.6, true, 0.13, 0.09);
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
  return { group: g, head, body: tee, skin, hides: ['glasses', 'mic', 'collar', 'head', 'hair', 'arm-l', 'arm-r', 'hand-l', 'hand-r', 'cup'] };
}

/**
 * A goatee: the chin and nothing above the mouth — Michele, 29 Sep 2026: *"No
 * mustaches for me. I don't have a goatee at the moment, but that's a
 * distinctive figure, so keep it."* From under the lower lip down, rounded at
 * the bottom, laid onto the face's own surface (`faceBand`) so it is a beard and
 * not a bead stuck on the chin. Sized for a `smile` at its default height.
 */
function goatee(head: THREE.Mesh, colour: string): void {
  // A crescent, not a disc: its top edge follows the lower lip's curve a little
  // below it, its bottom edge the round of the chin. A half-disc under a smile
  // reads as a second mouth.
  faceBand(
    head,
    (t) => {
      const x = -0.2 + 0.4 * t;
      return [x, -0.6 + 0.16 * (x / 0.2) ** 2];
    },
    (t) => {
      const x = -0.22 + 0.44 * t;
      return [x, -0.9 + 0.2 * (x / 0.22) ** 2];
    },
    std(colour, 0.95),
    0.022,
  );
}

/**
 * THE WELLD BACKPACK — Michele, 29 Sep 2026, with a photograph of it: *"Add a
 * WellD backpack for me."* Navy, a rounded top, shock cord crossed over the
 * front panel, zip pulls, mesh side pockets, and on the front the photograph's
 * layout in the new mark's words (*"sorry, we have a new logo"*): Dream. Do.
 * Develop stacked in white, over a white label with the red WeLLD on it
 * (`src/render3d/welld.ts`) — red straight onto navy would sink in a dark hall.
 * The maker's own logo under the cords is left off: that one is not Michele's
 * to give. Worn on the back, its straps over the hoodie's shoulders and down its
 * fronts, so it reads from the front as well; named `backpack` so the portrait
 * can take it off to sit down.
 */
function welldBackpack(torso: THREE.Mesh, H: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'backpack';
  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const hip = torso.position.y - torso.scale.y / 2;
  const navy = std('#1d2331', 0.85);
  const black = std('#0b0d12', 0.5);
  const w = halfW * 1.45;
  const h = (shoulder - hip) * 1.12;
  const d = H * 0.1;
  const r = d * 0.42;
  const z = -front - d / 2 - 0.004;
  const top = shoulder + H * 0.018;
  const bag = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), navy);
  bag.position.set(0, top - h / 2, z);
  g.add(bag);
  // The front panel, on the flat of the bag's back face: the print and the cords.
  const pw = w - 2 * r;
  const ph = h - 2 * r;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(pw, ph),
    new THREE.MeshStandardMaterial({
      roughness: 0.85,
      map: canvasTex(320, Math.round((320 * ph) / pw), (x) => {
        const W = 320;
        const Hc = Math.round((320 * ph) / pw);
        x.fillStyle = '#1d2331';
        x.fillRect(0, 0, W, Hc);
        // Ripstop: a faint grid in the weave.
        x.fillStyle = 'rgba(255,255,255,0.035)';
        for (let i = 0; i < W; i += 9) x.fillRect(i, 0, 1, Hc);
        for (let j = 0; j < Hc; j += 9) x.fillRect(0, j, W, 1);
        // Dream. Do. Develop — white, bold, rounded, flush left, one word a line.
        x.fillStyle = '#f4f2ee';
        x.font = 'bold 52px "Ubuntu", "Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
        x.textBaseline = 'alphabetic';
        x.fillText('Dream.', 50, Hc * 0.2);
        x.fillText('Do.', 50, Hc * 0.2 + 50);
        x.fillText('Develop', 50, Hc * 0.2 + 100);
        // The label: white, rounded, the red WeLLD on it.
        const lw = 136;
        const lh = Math.round(118 * WELLD_MARK_ASPECT) + 18;
        x.fillStyle = '#f4f2ee';
        x.beginPath();
        x.roundRect(50, Hc * 0.2 + 118, lw, lh, 7);
        x.fill();
        drawWellD(x, 59, Hc * 0.2 + 127, 118);
        // Shock cord, crossed and laced between the side hooks.
        const cord = (pts: Array<[number, number]>): void => {
          for (const [c, lw, dy] of [['#07080b', 6, 0], ['#3a4152', 1.6, -1.5]] as Array<[string, number, number]>) {
            x.strokeStyle = c;
            x.lineWidth = lw;
            x.lineJoin = 'round';
            x.beginPath();
            pts.forEach(([px, py], i) => (i ? x.lineTo(px, py + dy) : x.moveTo(px, py + dy)));
            x.stroke();
          }
        };
        const y0 = Hc * 0.2 + 170;
        cord([[14, y0], [W / 2, Hc - 8], [W - 14, y0]]);
        cord([[14, Hc - 8], [W / 2, y0 + 6], [W - 14, Hc - 8]]);
        cord([[14, y0], [W - 14, Hc - 8]]);
        cord([[W - 14, y0], [14, Hc - 8]]);
      }),
    }),
  );
  // Facing away from Michele, so it reads to whoever is behind.
  panel.rotation.y = Math.PI;
  panel.position.set(0, top - h / 2, z - d / 2 - 0.002);
  g.add(panel);
  // A grab loop on top, two zip pulls, and the mesh pockets on the sides.
  const loop = new THREE.Mesh(new THREE.TorusGeometry(w * 0.13, H * 0.006, 6, 14, Math.PI), black);
  loop.position.set(0, top - 0.002, z);
  g.add(loop);
  for (const sx of [-1, 1]) {
    const pull = new THREE.Mesh(new THREE.BoxGeometry(H * 0.008, H * 0.03, H * 0.004), black);
    pull.position.set(sx * w * 0.36, top - h * 0.16, z - d / 2 - 0.006);
    g.add(pull);
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(d * 0.22, h * 0.42, d * 0.72, 2, d * 0.08), std('#2c3344', 0.95));
    pocket.position.set(sx * (w / 2 + d * 0.06), top - h * 0.7, z);
    g.add(pocket);
  }
  // The straps: over each shoulder (a flattened half-ring from back to front),
  // then down the hoodie's front to a buckle.
  const rr = front + H * 0.012;
  const low = shoulder + H * 0.014 - rr;
  for (const sx of [-1, 1]) {
    // Over the grey hoodie fronts, outside the tee: navy on black would vanish.
    const x0 = sx * halfW * 0.8;
    const over = new THREE.Mesh(new THREE.TorusGeometry(rr, H * 0.011, 6, 16, Math.PI), navy);
    over.rotation.y = Math.PI / 2;
    over.scale.z = 1.7;
    over.position.set(x0, low, 0);
    g.add(over);
    const len = low - (hip + H * 0.03);
    const strap = new THREE.Mesh(new RoundedBoxGeometry(H * 0.036, len, H * 0.012, 1, H * 0.004), navy);
    strap.position.set(x0, low - len / 2, rr);
    g.add(strap);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(H * 0.03, H * 0.012, H * 0.016), black);
    buckle.position.set(x0, hip + H * 0.03, rr + H * 0.004);
    g.add(buckle);
  }
  return g;
}

/**
 * MICHELE — the photograph at Pena, 29 Sep 2026 (`src/sim/cameos.ts`), and then
 * Michele's own notes on the first portrait: *"Make me more beautiful :D"* and
 * *"ah, short trousers for me!"*
 *
 * A brown buzz cut with a little texture to it, a fair, sun-warmed face with
 * the bones given some say — cheekbones, a squarer jaw, a definite chin — clear
 * hazel eyes, a real smile, and under it the light brown goatee — the chin
 * only, no moustache (`goatee`). The grey hoodie is open over a black tee, its
 * sleeves and sides banded in red that has half worn away, the hood down behind
 * the neck; the mirrored sunglasses hang from the tee's collar by one arm. Khaki
 * chino shorts, bare shins, white trainers; the WellD backpack
 * (`welldBackpack`); and a body of its own, tall (`CameoLook.seed`).
 *
 * The tee's colourful blocks are the photograph's, the word on them is not: the
 * real one is a brand's wordmark (CLAUDE.md, nothing that needs permission), so
 * they spell the standing call instead — VOTE FUNNY.
 */
function buildMichele(torso: THREE.Mesh, H: number): Portrait {
  const g = new THREE.Group();
  const skinC = '#ebb795';
  const head = sculptHead({
    skin: skinC,
    hairTop: '#4b3828',
    hairSide: '#6e5846',
    line: [0.62, 0.46, 0.18, -0.32],
    // A buzz cut: barely off the skull, faded at the sides.
    thickTop: 0.04,
    thickSide: 0.012,
    salt: 0,
    stubble: 0.08,
    narrow: 0.86,
    long: 1.2,
    beard: '#8a6a4e',
    // No shadow on the upper lip: no moustache.
    face: { brow: 0.07, socket: 0.065, cheek: 0.09, jawTaper: 0.3, jawWidth: 0.07, chin: 0.08, nose: 0.21, noseW: 0.105, crownFlat: 0.12, blush: 0.13, lip: 0, ears: 1 },
  });
  // The crop's texture: a velvet of very short hair, not a painted cap.
  spikes(head, { count: 700, len: 0.03, width: 0.03, dark: '#3b2c20', light: '#5e4838', minY: 0.2 });
  eyes(head, 0.1, '#6b4a2b', 1, true);
  brows(head, '#4a3727', 0.058, 0.12, 0.31);
  smile(head, 0.46, true, 0.09, 0.075);
  goatee(head, '#a07a57');
  g.add(head);

  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const hip = torso.position.y - torso.scale.y / 2;
  const R = H * 0.135;
  /** The hoodie's cloth: grey, banded in red with flecks of the grey back through it. */
  const hoodie = (repeat: number): THREE.MeshStandardMaterial => {
    const tex = canvasTex(64, 64, (x) => {
      x.fillStyle = '#8d9095';
      x.fillRect(0, 0, 64, 64);
      x.fillStyle = '#b8323c';
      x.fillRect(0, 22, 64, 20);
      x.fillStyle = 'rgba(141,144,149,0.85)';
      for (let i = 0; i < 110; i++) x.fillRect(hash(i, 1, 3) * 64, 22 + hash(i, 2, 5) * 20, 1 + hash(i, 4, 1) * 4, 1);
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, repeat);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  };
  const body = hoodie(2.5);
  const arms = hoodie(4);
  const grey = std('#8d9095', 0.9);

  // The black tee between the open hoodie fronts, and its print.
  const teeW = halfW * 1.2;
  const tee = new THREE.Mesh(
    new THREE.PlaneGeometry(teeW, shoulder - hip),
    new THREE.MeshStandardMaterial({
      roughness: 0.9,
      map: canvasTex(128, 256, (x) => {
        x.fillStyle = '#151517';
        x.fillRect(0, 0, 128, 256);
        const ink = ['#ff4fa3', '#2fb5ff', '#ffd23f', '#3ee07a', '#ff8a3d'];
        x.font = 'bold 30px "Arial Black", "Helvetica Neue", Arial, sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        const row = (word: string, y: number, off: number): void => {
          const step = 23;
          const x0 = 64 - ((word.length - 1) * step) / 2;
          [...word].forEach((ch, i) => {
            x.fillStyle = ink[(i + off) % ink.length];
            x.fillText(ch, x0 + i * step, y);
          });
        };
        // Low on the tee, under the badge and the sunglasses (`badge` below).
        row('VOTE', 180, 0);
        row('FUNNY', 214, 2);
      }),
    }),
  );
  tee.position.set(0, (shoulder + hip) / 2, front + 0.003);
  g.add(tee);
  // The open zip: a grey edge down each side of the tee.
  for (const sx of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012 * H, shoulder - hip, 0.006), std('#5f6267', 0.8));
    edge.position.set(sx * teeW * 0.5, (shoulder + hip) / 2, front + 0.004);
    g.add(edge);
  }
  // The hood, down: a grey roll round the back of the neck.
  const hood = new THREE.Mesh(new THREE.TorusGeometry(R * 0.62, R * 0.2, 8, 18, Math.PI), grey);
  hood.rotation.set(Math.PI / 2, 0, Math.PI);
  hood.position.set(0, shoulder + H * 0.01, -front * 0.15);
  g.add(hood);
  // The sunglasses, hooked on the collar by one arm, hanging lens over lens —
  // to one side, where the lanyard is not.
  const mirror = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2cc3b0'), metalness: 0.9, roughness: 0.12, emissive: new THREE.Color('#0a3834') });
  const rim = std('#4a5560', 0.4);
  for (const k of [0, 1]) {
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), mirror);
    const y = shoulder - H * (0.045 + k * 0.05);
    lens.scale.set(H * 0.045, H * 0.036, H * 0.008);
    lens.position.set(teeW * 0.3, y, front + 0.012);
    g.add(lens);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 16), rim);
    frame.scale.set(H * 0.047, H * 0.038, H * 0.02);
    frame.position.copy(lens.position);
    g.add(frame);
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006 * H, H * 0.05, 0.004 * H), rim);
  arm.position.set(teeW * 0.3 + H * 0.02, shoulder - H * 0.015, front + 0.01);
  g.add(arm);
  g.add(welldBackpack(torso, H));

  // The shorts' seat, across the hips, joining the two legs' shorts (`dressShorts`).
  const khaki = std('#b8a47e', 0.9);
  const seat = new THREE.Mesh(TORSO_GEO, khaki);
  seat.scale.set(halfW * 1.9, H * 0.07, torso.scale.z * 0.94);
  seat.position.set(0, hip - H * 0.015, 0);
  g.add(seat);
  return {
    group: g,
    head,
    body,
    arms,
    skin: std(skinC, 0.8),
    // ...and the crowd's rucksack, which the WellD one replaces.
    hides: ['glasses', 'mic', 'collar', 'head', 'hair', 'pack'],
    // The badge rides high, so the print shows under it.
    badge: 0.5,
    shorts: { cloth: khaki, hem: std('#c9b893', 0.9) },
    shoes: std('#f1eee8', 0.55),
  };
}

/**
 * CLAUDE — no photograph, and no logo (Michele: *"No logo, but one should be able
 * to understand that's you"*). So not the mark, and not the name set in its
 * type: what people know it by. A terminal for a face — the only body it has
 * ever really had — dark glass in a cream case, on the neck like a monitor on its
 * stand, a terracotta prompt glowing on it with the cursor blinking after it;
 * terracotta and cream on the hoodie; cream hands. It says the rest itself
 * (`src/sim/cameos.ts`).
 */
function buildClaude(torso: THREE.Mesh, H: number): Portrait {
  const g = new THREE.Group();
  const cream = std(CLAUDE_CREAM, 0.45);
  // In head radii, like every head here: a little wider than a head, not as tall.
  const head = new THREE.Mesh(new RoundedBoxGeometry(2.3, 1.75, 1.15, 4, 0.3), cream);
  head.castShadow = true;
  g.add(head);
  const glass = new THREE.Mesh(new RoundedBoxGeometry(2.0, 1.45, 0.06, 2, 0.14), new THREE.MeshStandardMaterial({ color: new THREE.Color('#1f1e1d'), roughness: 0.22, metalness: 0.1 }));
  glass.position.set(0, 0, 0.56);
  head.add(glass);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(CLAUDE_CLAY).multiplyScalar(2.2), toneMapped: false });
  // The prompt: a chevron, two strokes meeting at a point...
  for (const sy of [1, -1]) {
    const stroke = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.03), glow);
    stroke.position.set(-0.42, sy * 0.13, 0.6);
    stroke.rotation.z = -sy * 0.62;
    head.add(stroke);
  }
  // ...and the cursor after it, which blinks.
  const cursor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.03), glow);
  cursor.position.set(0.28, -0.26, 0.6);
  head.add(cursor);

  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const hip = torso.position.y - torso.scale.y / 2;
  const R = H * 0.135;
  const clay = std(CLAUDE_CLAY, 0.85);
  // The hood down behind the neck, lined in cream; two cream drawstrings.
  const hood = new THREE.Mesh(new THREE.TorusGeometry(R * 0.62, R * 0.2, 8, 18, Math.PI), clay);
  hood.rotation.set(Math.PI / 2, 0, Math.PI);
  hood.position.set(0, shoulder + H * 0.01, -front * 0.15);
  g.add(hood);
  const lining = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, R * 0.06, 6, 18, Math.PI), cream);
  lining.rotation.copy(hood.rotation);
  lining.position.set(0, shoulder + H * 0.022, -front * 0.15);
  g.add(lining);
  for (const sx of [-1, 1]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004 * H, 0.004 * H, H * 0.09, 6), cream);
    cord.position.set(sx * halfW * 0.16, shoulder - H * 0.045, front + 0.008);
    g.add(cord);
  }
  // A kangaroo pocket, a shade deeper than the hoodie.
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(halfW * 1.3, (shoulder - hip) * 0.3, 0.006), std('#c4674a', 0.85));
  pocket.position.set(0, hip + (shoulder - hip) * 0.2, front + 0.004);
  g.add(pocket);
  return {
    group: g,
    head,
    body: clay,
    arms: clay,
    skin: cream,
    // ...and the crowd figure's own screen head (`Person.screen`), which this one replaces up close.
    hides: ['glasses', 'mic', 'collar', 'head', 'hair', 'screen-head'],
    // A terminal's cursor: on for half a second, off for half a second.
    tick: (t: number): void => {
      cursor.visible = t % 1 < 0.55;
    },
  };
}

/**
 * Short sleeves on the figure's own arms: the arm goes to skin, and a sleeve
 * with a tipped cuff is hung on each arm's pivot over its top third.
 */
function dressSleeves(yaw: THREE.Group, pt: Portrait): void {
  const sl = pt.sleeve as NonNullable<Portrait['sleeve']>;
  let made = pt.group.userData.sleeves as THREE.Object3D[] | undefined;
  if (!made) {
    made = [];
    for (const side of ['l', 'r']) {
      const arm = yaw.getObjectByName(`arm-${side}`) as THREE.Mesh;
      const g = new THREE.Group();
      const body = new THREE.Mesh(LIMB_GEO, sl.cloth);
      body.name = 'sleeve';
      const band = new THREE.Mesh(LIMB_GEO, sl.cuff);
      band.name = 'cuff';
      g.add(body, band);
      (arm.parent as THREE.Object3D).add(g);
      made.push(g);
    }
    pt.group.userData.sleeves = made;
  }
  for (const [i, side] of ['l', 'r'].entries()) {
    const arm = yaw.getObjectByName(`arm-${side}`) as THREE.Mesh;
    arm.material = pt.skin;
    const g = made[i];
    g.visible = arm.visible;
    const len = arm.scale.y * 0.38;
    const body = g.children[0] as THREE.Mesh;
    body.scale.set(arm.scale.x * 1.3, len, arm.scale.z * 1.3);
    body.position.set(0, -len / 2 + arm.scale.x * 0.2, 0);
    const band = g.children[1] as THREE.Mesh;
    band.scale.set(arm.scale.x * 1.34, len * 0.2, arm.scale.z * 1.34);
    band.position.set(0, -len + arm.scale.x * 0.2 + len * 0.1, 0);
  }
}

/**
 * Shorts, the legs' `dressSleeves`: the legs in skin, and over the top of each
 * one the shorts and a turned-up hem, on the leg's own pivot so they swing with
 * it and sit with it. The seat across the hips is the portrait's own.
 */
function dressShorts(yaw: THREE.Group, pt: Portrait): void {
  const sh = pt.shorts as NonNullable<Portrait['shorts']>;
  let made = pt.group.userData.shorts as THREE.Object3D[] | undefined;
  if (!made) {
    made = [];
    for (const side of ['l', 'r']) {
      const leg = yaw.getObjectByName(`leg-${side}`) as THREE.Mesh;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(LIMB_GEO, sh.cloth), new THREE.Mesh(LIMB_GEO, sh.hem));
      (leg.parent as THREE.Object3D).add(g);
      made.push(g);
    }
    pt.group.userData.shorts = made;
  }
  for (const [i, side] of ['l', 'r'].entries()) {
    const leg = yaw.getObjectByName(`leg-${side}`) as THREE.Mesh;
    leg.material = pt.skin;
    const g = made[i];
    g.visible = leg.visible;
    // From just above the hip joint to a little above the knee.
    const len = leg.scale.y * 0.46;
    const top = leg.scale.x * 0.3;
    const body = g.children[0] as THREE.Mesh;
    body.scale.set(leg.scale.x * 1.22, len, leg.scale.z * 1.18);
    body.position.set(0, top - len / 2, 0);
    const hem = g.children[1] as THREE.Mesh;
    hem.scale.set(leg.scale.x * 1.27, len * 0.14, leg.scale.z * 1.23);
    hem.position.set(0, top - len + len * 0.07, 0);
  }
}

/**
 * LONG HAIR: a curtain that falls from the crown, frames the face and drapes
 * over the shoulders — which the skull-hugging sculpt cannot do. Built in head
 * radii round the back and sides (the face's gap narrows as it falls, so the
 * hair comes forward over the shoulders), waved, flared at the ends, and
 * streaked in two colours. `flick` turns the ends out (Aurélie's).
 */
function longHair(head: THREE.Mesh, o: { colour: string; streak: string; length: number; gap: number; wave: number; flare: number; flick?: number; parted?: boolean }): void {
  const U = 40;
  const V = 26;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c1 = new THREE.Color(o.colour);
  const c2 = new THREE.Color(o.streak);
  const c = new THREE.Color();
  const top = 0.72;
  for (let j = 0; j <= V; j++) {
    const v = j / V;
    const y = top - v * (top + o.length);
    // The face's gap: wide at the temples, closing as the hair falls past the chin.
    const gap = o.gap * (1 - 0.55 * smooth(-0.6, -1.6, y));
    for (let i = 0; i <= U; i++) {
      const u = i / U;
      const th = -Math.PI + gap + u * (2 * Math.PI - 2 * gap); // 0 = the back (-z)
      const skull = y > -0.2 ? Math.sqrt(Math.max(0.05, 1 - Math.min(0.97, y * y * (y > 0 ? 1 : 0.4)))) : 0.92;
      const below = Math.max(0, -0.4 - y);
      let r = skull * 1.1 + o.flare * below * 0.35 + (o.flick ?? 0) * smooth(o.length - 0.35, o.length, -y) * 0.6;
      r += o.wave * Math.sin(y * 7 + th * 3) * smooth(0.2, -0.6, y);
      // A little higher at the sides where it sits over the ears.
      const x = Math.sin(th) * r;
      const z = -Math.cos(th) * r * 0.95;
      pos.push(x, y, z);
      const st = 0.5 + 0.5 * Math.sin(th * 11 + y * 2.3);
      c.copy(c1).lerp(c2, st * 0.6).multiplyScalar(0.85 + 0.3 * hash(i, j, 3));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < U; i++) {
      const a = j * (U + 1) + i;
      const b = a + U + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  head.add(mesh);
  if (o.parted) {
    // The centre parting: a thin line of scalp down the crown.
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.9), std(head.userData.skin as string, 0.7));
    part.position.set(0, 0.99, 0.2);
    part.rotation.x = 0.4;
    head.add(part);
  }
}

/**
 * LIZE — two photographs: long wavy auburn hair with a centre parting, pale
 * skin, light blue eyes, a wide smile, and a headset mic at the cheek; on
 * stage in a red wrap dress with a V neck and a sash. First name, a
 * caricature, nothing that needs permission.
 */
function buildLize(torso: THREE.Mesh, H: number): Portrait {
  const g = new THREE.Group();
  const skinC = '#f0cdb6';
  const head = sculptHead({
    skin: skinC,
    hairTop: '#6e3b22',
    hairSide: '#7a4428',
    line: [0.6, 0.45, 0.2, -0.5],
    thickTop: 0.07,
    thickSide: 0.04,
    salt: 0,
    stubble: 0,
    narrow: 0.88,
    long: 1.16,
    face: { brow: 0.04, socket: 0.05, cheek: 0.07, jawTaper: 0.3, chin: 0.05, nose: 0.17, noseW: 0.1, crownFlat: 0.06, blush: 0.2, ears: 0.9 },
  });
  eyes(head, 0.1, '#5d88aa', 0.85);
  brows(head, '#7a4a30', 0.04, 0.12, 0.32);
  smile(head, 0.52, true, 0.11, 0.08);
  headset(head, '#e0c2a6', { tube: 0.016, tip: 0.045, pad: 0.05, at: [0.5, -0.32], off: 0.035 });
  longHair(head, { colour: '#6a3520', streak: '#9a5a32', length: 2.5, gap: 0.95, wave: 0.07, flare: 0.5 });
  g.add(head);
  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  const hip = torso.position.y - torso.scale.y / 2;
  const red = std('#b3202e', 0.55);
  const skin = std(skinC, 0.8);
  // The wrap's V: skin from the collarbones to the sash's crossing.
  const v = new THREE.Shape();
  v.moveTo(-halfW * 0.42, 0);
  v.lineTo(halfW * 0.42, 0);
  v.lineTo(0, -(shoulder - hip) * 0.5);
  v.closePath();
  const vee = new THREE.Mesh(new THREE.ShapeGeometry(v), skin);
  vee.position.set(0, shoulder - 0.002, front + 0.004);
  g.add(vee);
  // The sash at the waist, a deeper red, and the skirt falling from it.
  const sash = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2.08, H * 0.05, front * 2.08), std('#8e1622', 0.5));
  sash.position.set(0, hip + (shoulder - hip) * 0.22, 0);
  g.add(sash);
  const skirtH = hip * 0.72;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 1.02, halfW * 1.45, skirtH, 20, 3, true), red);
  skirt.material.side = THREE.DoubleSide;
  skirt.scale.z = front / halfW + 0.15;
  skirt.position.set(0, hip - skirtH / 2 + H * 0.03, 0);
  skirt.castShadow = true;
  skirt.name = 'skirt';
  g.add(skirt);
  return { group: g, head, body: red, skin, hides: ['glasses', 'mic', 'collar', 'head', 'hair'] };
}

/**
 * AURÉLIE — the photograph: dark brown hair to the jaw with a fringe, its ends
 * flicked out in every direction, thin violet rectangular frames, a warm
 * closed-mouth smile, a navy T-shirt.
 */
function buildAurelie(torso: THREE.Mesh, _H: number): Portrait {
  const g = new THREE.Group();
  const skinC = '#efc9ae';
  const head = sculptHead({
    skin: skinC,
    hairTop: '#3b2a20',
    hairSide: '#44302a',
    // A fringe: the hairline comes low on the forehead.
    line: [0.3, 0.3, 0.15, -0.5],
    thickTop: 0.12,
    thickSide: 0.06,
    salt: 0,
    stubble: 0,
    narrow: 0.94,
    long: 1.08,
    face: { brow: 0.04, socket: 0.05, cheek: 0.09, jawTaper: 0.22, chin: 0.04, nose: 0.2, noseW: 0.11, crownFlat: 0.02, blush: 0.16, ears: 0.9 },
  });
  eyes(head, 0.08, '#4a3326', 0.8);
  brows(head, '#2b1e18', 0.04, 0.06, 0.29);
  specs(head, '#6f4a9a', 0.6, 0.3, 0.03, true);
  smile(head, 0.4, false, 0.03, 0.06);
  longHair(head, { colour: '#3b2a20', streak: '#5e4232', length: 1.45, gap: 1.05, wave: 0.05, flare: 0.7, flick: 0.9 });
  g.add(head);
  const skin = std(skinC, 0.8);
  const navy = std('#1e2a44', 0.85);
  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const shoulder = torso.position.y + torso.scale.y / 2;
  // The scoop neck.
  const neck = new THREE.Mesh(new THREE.CircleGeometry(halfW * 0.4, 16, Math.PI, Math.PI), skin);
  neck.position.set(0, shoulder - 0.002, front + 0.004);
  g.add(neck);
  return { group: g, head, body: navy, skin, hides: ['glasses', 'mic', 'collar', 'head', 'hair'], sleeve: { cloth: navy, cuff: navy } };
}

type Builder = (torso: THREE.Mesh, H: number) => Portrait;
/** Who gets a portrait: Stephan by role, the rest by name on a named NPC. */
const BY_NAME: Readonly<Record<string, Builder>> = {
  Celestino: buildCelestino,
  Mario: buildMario,
  Venkat: buildVenkat,
  Josh: buildJosh,
  Lize: buildLize,
  'Aurélie': buildAurelie,
  // The two who built it (`src/sim/cameos.ts`).
  Michele: buildMichele,
  Claude: buildClaude,
};

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
        for (const n of ['head', 'hair', 'arm-l', 'arm-r', 'hand-l', 'hand-r', 'eye-l', 'eye-r']) (yaw.getObjectByName(n) as THREE.Object3D).visible = true;

        let pt = portraits.get(pm);
        const who = p.role === 'stephan' ? 'Stephan' : (p.role === 'staff' || p.role === 'seated') && p.name && BY_NAME[p.name] ? p.name : null;
        placeFeet(yaw, H, null);
        if (pt && pt.group.userData.who !== who) {
          // A pooled figure that was one of them and is now somebody else.
          torso.material = pt.group.userData.cloth as THREE.Material;
          for (const n of ['arm-l', 'arm-r']) (yaw.getObjectByName(n) as THREE.Mesh).material = pt.group.userData.cloth as THREE.Material;
          for (const sl of (pt.group.userData.sleeves as THREE.Object3D[] | undefined) ?? []) sl.removeFromParent();
          for (const sh of (pt.group.userData.shorts as THREE.Object3D[] | undefined) ?? []) sh.removeFromParent();
          yaw.remove(pt.group);
          portraits.delete(pm);
          pt = undefined;
        }
        if (!who) continue;
        if (!pt) {
          pt = who === 'Stephan' ? buildStephan(torso, H) : BY_NAME[who](torso, H);
          pt.group.userData.who = who;
          pt.head.name = `portrait-${who}`;
          pt.group.userData.cloth = torso.material;
          yaw.add(pt.group);
          portraits.set(pm, pt);
        }
        for (const n of [...pt.hides, 'eye-l', 'eye-r']) (yaw.getObjectByName(n) as THREE.Object3D).visible = false;
        pt.head.scale.setScalar(R);
        pt.head.position.copy(head.position);
        neck.material = pt.skin;
        // Hands in the portrait's own skin, not the pooled figure's: `placeNeck`
        // hands them the figure's random one every frame.
        for (const n of ['hand-l', 'hand-r']) (yaw.getObjectByName(n) as THREE.Mesh).material = pt.skin;
        if (pt.body) torso.material = pt.body;
        if (pt.arms) for (const n of ['arm-l', 'arm-r']) (yaw.getObjectByName(n) as THREE.Mesh).material = pt.arms;
        pt.tick?.(t);
        if (pt.badge) {
          // Shortened from the bottom: the ribbon still starts at the collar.
          const badge = yaw.getObjectByName('lanyard') as THREE.Mesh;
          const top = badge.position.y + badge.scale.y / 2;
          badge.scale.y *= pt.badge;
          badge.position.y = top - badge.scale.y / 2;
        }
        if (pt.barefoot) placeFeet(yaw, H, pt.skin);
        if (pt.shoes) for (const n of ['shoe-l', 'shoe-r']) (yaw.getObjectByName(n) as THREE.Mesh).material = pt.shoes;
        if (pt.sleeve) dressSleeves(yaw, pt);
        if (pt.shorts) dressShorts(yaw, pt);
        // A skirt drawn for standing goes straight down through the seat, and
        // nobody watches a keynote with their backpack on.
        for (const n of ['skirt', 'backpack']) {
          const o = pt.group.getObjectByName(n);
          if (o) o.visible = p.role !== 'seated';
        }
      }
      for (let i = people.length; i < models.length; i++) models[i].root.visible = false;
    },
  };
}
