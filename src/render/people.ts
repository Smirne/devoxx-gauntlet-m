/**
 * people.ts — the three thousand.
 *
 * Michele, asking what was left: *"Should we start on graphics? people, details
 * etc."* The people were the answer. They were a cylinder with a sphere on top —
 * no arms, no legs, nothing that moved — and there are sixty of them walking
 * chapter 3 and an auditorium filling up in chapter 4, so they are in almost every
 * frame of the back half of the game. Ten of the hundred points are "sense of
 * place", and a venue full of chess pawns does not have one.
 *
 * ## What a figure is
 *
 * Head, torso, two arms, two legs, and a contact disc — seven meshes, all of them
 * boxes and one sphere off four shared geometries. Nothing here is anatomy: at the
 * zoom this game is played at a person is about thirty pixels tall, and what
 * actually reads at that size is the silhouette and whether the legs are moving.
 * So the proportions are caricatured on purpose — a head a third again as big as
 * life, short arms, a clear gap between the legs — for the same reason the robots
 * are (CLAUDE.md: *"recognisable beats precise"*).
 *
 * ## Why the sim had to change for this
 *
 * Three things a body needs that a position cannot give it:
 *
 *  - **identity** (`Person.seed`), because a body has to be the same body every
 *    frame. The old height jitter was derived from `x` and `y`, so a visitor
 *    changed height as they walked;
 *  - **a heading** (`Person.face`), because a figure with a front has to have one;
 *  - **a speed** (`Person.speed`), because legs swing in proportion to it.
 *
 * All three are facts about a person rather than about a picture, so all three are
 * the sim's (`src/sim/types.ts`). This file decides nothing: it reads them.
 *
 * ## The gait is stateless
 *
 * There is no per-person phase kept anywhere. The phase is `t * cadence + seed`,
 * and the AMPLITUDE is what `speed` scales — so a person who stops has their legs
 * come to rest rather than freeze mid-stride, a person who starts walking picks up
 * where the clock is, and the renderer never has to match a person in this frame
 * to a person in the last one. Which is just as well: `snap.people` is rebuilt
 * every frame and a visitor who sits down takes everybody's index with them.
 */

import * as THREE from 'three';

import { m } from '../sim/units';
import type { Person } from '../sim/types';
import { SEAT_CUSHION_TOP_M } from './venue/props';

/**
 * A person's height, metres, before their own seed stretches or squashes it.
 *
 * **1.60, not the 1.72 a real adult is.** Michele, looking at the crowd on the
 * threshold: *"Reduce size a little bit."* The figures are drawn beside robots
 * that are caricatures — Voxxy is 38 cm of robot and Biggy is a ball — and at a
 * true 1.72 the crowd read as the biggest thing in the hall. This is a diorama and
 * the people are its scale figures, so they get the diorama's scale rather than
 * the world's: *"recognisable beats precise"* (`CLAUDE.md`), one more time.
 *
 * The seed still spreads them ±8% about this, so the crowd is a crowd of different
 * people and not a row of one.
 */
export const PERSON_H = 1.6;

/** Steps per second at a normal walking pace, shared by everybody. */
const CADENCE = 2.15;
/** The speed, sim px/s, at which the legs are swinging as far as they ever will. */
const WALK_REF = 26;
/** Full leg excursion, radians. */
const SWING = 0.62;
/** Claps per second. Fast enough to read as applause, slow enough to see. */
const CLAP_HZ = 3.1;
/** How far the arms come up to clap, radians about the shoulder. */
const CLAP_LIFT = 2.1;
/** How far in towards the midline the hands sit while clapping. */
const CLAP_IN = 0.42;
/** ...and how far either side of that they beat. */
const CLAP_SWING = 0.2;
/**
 * Hip height on an auditorium seat, metres — what a seated figure is dropped to.
 *
 * **The seat's own cushion top, not a number.** This used to be a hand-picked
 * 0.62: a real chair puts a hip near 0.45, that cut the audience off at the neck
 * behind the row in front, and 0.62 was the compromise that made Room 8 look full.
 * Shortening the figures to 1.60 (`PERSON_H`) turned the compromise into a fault —
 * the drop from standing fell to 14.7 cm and they perched above their own seats.
 *
 * Reading `SEAT_CUSHION_TOP_M` off the seat model instead makes the question
 * disappear: 0.54 m is where the cushion is, so it is where a hip goes, and it
 * stays right if anybody re-models the seat. The shoulders still clear the row in
 * front at this height — measured, and `tests/people.test.ts` holds both ends of
 * it (a visible drop from standing, and a head still above the seat back).
 */
const SEAT_HIP_M = SEAT_CUSHION_TOP_M;

/**
 * Skin, in five tones, shared.
 *
 * Five materials for the whole crowd rather than one per person: the colour a
 * chapter publishes is the person's CLOTHES (`Person.colour`), which is what
 * distinguishes a visitor from staff from a queue, and skin is not that. Picked
 * by seed, so a person keeps theirs.
 */
const SKIN = ['#e8c39a', '#d9a97c', '#a9764f', '#7a5233', '#f0d5b8'] as const;
/** Trousers, four shades of "conference". */
const TROUSER = ['#2f3440', '#3d4250', '#4a4038', '#26303a'] as const;
/** Hair, five. Short, and only ever a cap on the skull. */
const HAIR = ['#2b2118', '#4a3524', '#6b4a2c', '#1a1a1c', '#8a7a68'] as const;

/** What they are carrying, if anything. One small mesh, off the same seed. */
type Carry = 'none' | 'pack' | 'coffee' | 'lanyard';
const CARRY: readonly Carry[] = ['none', 'lanyard', 'pack', 'coffee', 'lanyard', 'none', 'coffee', 'pack'];

export interface PersonModel {
  readonly root: THREE.Group;
  /**
   * Place and pose this figure.
   *
   * `base` is the floor height under them and `t` the sim clock; the figure puts
   * itself at `p.x, p.y` rather than being placed and then posed, so there is one
   * place that knows where a person is. Everything that
   * varies from person to person is read out of `p.seed` here, every frame, so
   * the model itself holds no state and a pooled figure can be any person at all.
   */
  pose(p: Person, base: number, t: number): void;
  dispose(): void;
}

/** A deterministic 0..1 from a seed and a channel — the whole variation budget. */
const rnd = (seed: number, k: number): number => {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Shared across every figure ever built. Disposed with the last one. */
interface Shared {
  box: THREE.BoxGeometry;
  sphere: THREE.SphereGeometry;
  disc: THREE.CircleGeometry;
  cyl: THREE.CylinderGeometry;
  skin: THREE.MeshStandardMaterial[];
  trouser: THREE.MeshStandardMaterial[];
  hair: THREE.MeshStandardMaterial[];
  shadow: THREE.MeshBasicMaterial;
  lanyard: THREE.MeshStandardMaterial;
  /**
   * One material per lanyard colour the sim has asked for, built on demand.
   *
   * The ribbons mean something (`src/sim/lanyards.ts`: crew red, speaker teal,
   * attendee grey-blue, chair orange) and there are four of them, so a map rather
   * than a material per figure — three thousand figures share four ribbons.
   */
  ribbons: Map<string, THREE.MeshStandardMaterial>;
  cup: THREE.MeshStandardMaterial;
  /** Spectacle frames, the headset's boom, and a laptop's lid and deck. */
  frame: THREE.MeshStandardMaterial;
  boom: THREE.MeshStandardMaterial;
  screen: THREE.MeshStandardMaterial;
  shell: THREE.MeshStandardMaterial;
  refs: number;
}

let shared: Shared | null = null;

function acquire(): Shared {
  if (shared) {
    shared.refs++;
    return shared;
  }
  const std = (c: string, rough = 0.85): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: rough, metalness: 0.02 });
  shared = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 10, 8),
    disc: new THREE.CircleGeometry(1, 14),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    skin: SKIN.map((c) => std(c, 0.9)),
    trouser: TROUSER.map((c) => std(c)),
    hair: HAIR.map((c) => std(c, 0.95)),
    shadow: new THREE.MeshBasicMaterial({ color: 0x05070c, transparent: true, opacity: 0.3, depthWrite: false }),
    lanyard: std('#d9741f', 0.7),
    ribbons: new Map(),
    cup: std('#f2efe9', 0.6),
    frame: std('#3a2a1c', 0.5),
    boom: std('#d9c7b4', 0.6),
    screen: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1b2230'),
      roughness: 0.4,
      emissive: new THREE.Color('#5f8fd0'),
      emissiveIntensity: 0.8,
    }),
    shell: std('#9aa3ad', 0.5),
    refs: 1,
  };
  return shared;
}

function release(): void {
  if (!shared) return;
  shared.refs--;
  if (shared.refs > 0) return;
  shared.box.dispose();
  shared.sphere.dispose();
  shared.disc.dispose();
  shared.cyl.dispose();
  for (const list of [shared.skin, shared.trouser, shared.hair]) for (const mm of list) mm.dispose();
  shared.shadow.dispose();
  shared.lanyard.dispose();
  for (const mm of shared.ribbons.values()) mm.dispose();
  shared.ribbons.clear();
  shared.cup.dispose();
  shared.frame.dispose();
  shared.boom.dispose();
  shared.screen.dispose();
  shared.shell.dispose();
  shared = null;
}

export function buildPerson(): PersonModel {
  const s = acquire();
  const root = new THREE.Group();
  root.name = 'person';

  /** The clothes. One material per figure, because the chapter colours it. */
  const cloth = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 });

  const yaw = new THREE.Group();
  root.add(yaw);

  const torso = new THREE.Mesh(s.box, cloth);
  torso.name = 'torso';
  torso.castShadow = true;
  yaw.add(torso);

  const head = new THREE.Mesh(s.sphere, s.skin[0]);
  head.name = 'head';
  head.castShadow = true;
  yaw.add(head);

  // A cap of hair, slightly smaller and lifted, so the skull is not a bare ball.
  const hair = new THREE.Mesh(s.sphere, s.hair[0]);
  hair.name = 'hair';
  yaw.add(hair);

  /*
   * Limbs hang from PIVOTS at the joint, not from their own centres.
   *
   * A leg that rotates about its middle scissors; a leg that rotates about the hip
   * walks. The mesh is therefore parked half its own length below its pivot and
   * never moved again — all the animation is on the pivot's x rotation.
   */
  const mkLimb = (name: string, mat: THREE.Material): { pivot: THREE.Group; mesh: THREE.Mesh } => {
    const pivot = new THREE.Group();
    pivot.name = `${name}-pivot`;
    const mesh = new THREE.Mesh(s.box, mat);
    mesh.name = name;
    mesh.castShadow = true;
    pivot.add(mesh);
    yaw.add(pivot);
    return { pivot, mesh };
  };
  const legL = mkLimb('leg-l', s.trouser[0]);
  const legR = mkLimb('leg-r', s.trouser[0]);
  const armL = mkLimb('arm-l', cloth);
  const armR = mkLimb('arm-r', cloth);

  // The three things somebody might be carrying. One is shown at a time, or none.
  const pack = new THREE.Mesh(s.box, s.trouser[0]);
  pack.name = 'pack';
  pack.visible = false;
  yaw.add(pack);
  const lanyard = new THREE.Mesh(s.box, s.lanyard);
  lanyard.name = 'lanyard';
  lanyard.visible = false;
  yaw.add(lanyard);
  const cup = new THREE.Mesh(s.cyl, s.cup);
  cup.name = 'cup';
  cup.visible = false;
  yaw.add(cup);
  const hat = new THREE.Mesh(s.cyl, cloth);
  hat.name = 'hat';
  hat.visible = false;
  yaw.add(hat);

  /*
   * The accessories that make somebody a SOMEBODY.
   *
   * Four more meshes on a figure that had seven, all of them off geometries the
   * crowd already shares, all of them hidden unless the sim asks. At this zoom a
   * face is four pixels and none of these is anatomy: the collar is a stripe
   * across the shoulders, the glasses a dark bar with a highlight, the mic a pale
   * line from the ear to the corner of the mouth, and the laptop a lid and a deck.
   * Read from ten metres they say *Devoxx polo*, *glasses*, *headset*, *fixing his
   * slides*, which is the whole job.
   */
  const collar = new THREE.Mesh(s.box, cloth);
  collar.name = 'collar';
  collar.visible = false;
  yaw.add(collar);
  const specs = new THREE.Mesh(s.box, s.frame);
  specs.name = 'glasses';
  specs.visible = false;
  yaw.add(specs);
  const boom = new THREE.Mesh(s.box, s.boom);
  boom.name = 'mic';
  boom.visible = false;
  yaw.add(boom);
  const lapBase = new THREE.Mesh(s.box, s.shell);
  lapBase.name = 'laptop-deck';
  lapBase.visible = false;
  yaw.add(lapBase);
  const lapLid = new THREE.Mesh(s.box, s.screen);
  lapLid.name = 'laptop-lid';
  lapLid.visible = false;
  yaw.add(lapLid);
  /** The collar's own colour, so a striped polo is not the shirt's material. */
  const collarMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.02 });
  collar.material = collarMat;

  // Unshaded pawns on a flat floor read as pawns floating over it; one disc each
  // is what pins them down. Kept from the old model, which got this right.
  const contact = new THREE.Mesh(s.disc, s.shadow);
  contact.name = 'contact';
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.02;
  root.add(contact);

  function pose(p: Person, base: number, t: number): void {
    const seed = p.seed;
    const seated = p.role === 'seated';
    // Height, build and stride are the three things that make a crowd a crowd
    // rather than one person copied. +-8% is enough to read and not enough to
    // turn anybody into a child or a giant.
    const H = PERSON_H * (0.92 + 0.16 * rnd(seed, 1));
    const wide = 0.9 + 0.3 * rnd(seed, 2);

    const headR = 0.135 * H;
    const shoulder = H - 2.35 * headR;
    const hip = 0.47 * H;
    const legLen = hip;
    const armLen = 0.3 * H;
    const halfW = 0.15 * H * wide;

    head.scale.setScalar(headR * 2);
    head.position.set(0, H - headR, 0);
    head.material = s.skin[Math.floor(rnd(seed, 3) * s.skin.length) % s.skin.length];
    /*
     * Hair is a CAP on the top of the skull, not a band round the middle of it.
     *
     * The sphere geometry has radius 0.5, so a scale of `k` is a radius of `k/2`:
     * at 1.15 tall its half-height is 0.575 r, and centring it at `H - 0.55 r`
     * puts its top a hair above the crown and its bottom 44% of the way down the
     * head. Centred any lower — which is what the first pass did — the crown pokes
     * out through it and the hair reads as a sweatband.
     */
    hair.scale.set(headR * 2.02, headR * 1.15, headR * 2.02);
    hair.position.set(0, H - headR * 0.55, 0);
    hair.material = s.hair[Math.floor(rnd(seed, 4) * s.hair.length) % s.hair.length];

    torso.scale.set(halfW * 2, shoulder - hip, 0.19 * H);
    torso.position.set(0, (shoulder + hip) / 2, 0);

    const trouser = s.trouser[Math.floor(rnd(seed, 5) * s.trouser.length) % s.trouser.length];
    legL.mesh.material = trouser;
    legR.mesh.material = trouser;
    for (const [limb, side] of [
      [legL, -1],
      [legR, 1],
    ] as const) {
      limb.pivot.position.set(side * halfW * 0.48, hip, 0);
      limb.mesh.scale.set(0.105 * H, legLen, 0.12 * H);
      limb.mesh.position.set(0, -legLen / 2, 0);
    }
    for (const [limb, side] of [
      [armL, -1],
      [armR, 1],
    ] as const) {
      limb.pivot.position.set(side * (halfW + 0.035 * H), shoulder - 0.04 * H, 0);
      limb.mesh.scale.set(0.075 * H, armLen, 0.085 * H);
      limb.mesh.position.set(0, -armLen / 2, 0);
    }

    /*
     * THE GAIT. Amplitude from `speed`, phase from the clock and the seed.
     *
     * Nothing is remembered between frames — see the file header. `swing` going to
     * zero is what stops a stationary person mid-pose instead of mid-stride, and
     * the small `0.04` floor is a crowd that is never perfectly still.
     */
    const sp = p.speed ?? 0;
    const swing = seated ? 0 : Math.min(1, sp / WALK_REF) * SWING;
    const ph = t * CADENCE * (0.85 + 0.3 * rnd(seed, 6)) * Math.PI * 2 + seed;
    const a = Math.sin(ph);
    const cheer = Math.max(0, Math.min(1, p.cheer ?? 0));
    if (seated) {
      // Knees up, hands in the lap, and the whole figure dropped onto the seat.
      legL.pivot.rotation.x = -Math.PI / 2;
      legR.pivot.rotation.x = -Math.PI / 2;
      armL.pivot.rotation.x = -0.9;
      armR.pivot.rotation.x = -0.9;
    } else {
      legL.pivot.rotation.x = a * swing;
      legR.pivot.rotation.x = -a * swing;
      // Arms counter-swing, and less far: it is the legs that say "walking".
      armL.pivot.rotation.x = -a * swing * 0.75 + 0.04;
      armR.pivot.rotation.x = a * swing * 0.75 + 0.04;
    }

    /*
     * APPLAUSE, and it overrides whatever the arms were doing.
     *
     * Chapter 4's curtain call. Both arms come up in front of the chest and the
     * hands beat towards each other — at this scale a clap is not two hands
     * meeting, it is a pair of forearms oscillating in antiphase about the
     * midline, which is what the `z` does. Every row is off everybody else's beat
     * (`seed`), because a crowd that claps in time is a crowd at a rally.
     *
     * The legs are left alone: a seated row keeps its knees up and a standing
     * person keeps their stride, and `cheer` only ever says what the arms do.
     */
    if (cheer > 0.01) {
      const beat = Math.sin(t * CLAP_HZ * Math.PI * 2 + seed * 2.7);
      const up = -CLAP_LIFT * cheer;
      armL.pivot.rotation.x += (up - armL.pivot.rotation.x) * cheer;
      armR.pivot.rotation.x += (up - armR.pivot.rotation.x) * cheer;
      armL.pivot.rotation.z = (CLAP_IN + beat * CLAP_SWING) * cheer;
      armR.pivot.rotation.z = -(CLAP_IN + beat * CLAP_SWING) * cheer;
    } else {
      armL.pivot.rotation.z = 0;
      armR.pivot.rotation.z = 0;
    }

    const carry = seated ? 'none' : CARRY[Math.floor(rnd(seed, 7) * CARRY.length) % CARRY.length];
    pack.visible = carry === 'pack';
    /*
     * The badge ribbon. Everybody the sim gives one to wears one — it is how you
     * tell a speaker from an attendee across a hall, and chapter 3 asks you to do
     * that — while `carry` keeps deciding the rucksack and the coffee. Seated
     * rows keep theirs on: people do not take their badge off to watch a keynote.
     */
    lanyard.visible = p.lanyard !== undefined || carry === 'lanyard';
    if (p.lanyard !== undefined) {
      let mm = s.ribbons.get(p.lanyard);
      if (!mm) {
        mm = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.lanyard), roughness: 0.7, metalness: 0.02 });
        s.ribbons.set(p.lanyard, mm);
      }
      lanyard.material = mm;
    } else {
      lanyard.material = s.lanyard;
    }
    cup.visible = carry === 'coffee';
    if (pack.visible) {
      pack.scale.set(halfW * 1.5, 0.26 * H, 0.1 * H);
      pack.position.set(0, hip + (shoulder - hip) * 0.62, -0.16 * H);
      pack.material = trouser;
    }
    if (lanyard.visible) {
      lanyard.scale.set(0.05 * H, 0.2 * H, 0.012);
      lanyard.position.set(0, shoulder - 0.13 * H, 0.1 * H);
    }
    if (cup.visible) {
      cup.scale.set(0.055 * H, 0.07 * H, 0.055 * H);
      // In the hand, which is the bottom of the arm — so it rides the swing.
      const drop = armLen * Math.cos(armR.pivot.rotation.x);
      const fwd = armLen * Math.sin(-armR.pivot.rotation.x);
      cup.position.set(halfW + 0.035 * H, shoulder - 0.04 * H - drop + 0.04 * H, fwd);
    }
    hat.visible = p.hat === true;
    if (hat.visible) {
      hat.scale.set(headR * 2.1, headR * 0.55, headR * 2.1);
      hat.position.set(0, H - headR * 0.3, 0);
    }

    /*
     * The four accessories, posed off the same proportions as everything else.
     *
     * +Z is the direction a figure faces (`yaw` turns the whole group), so a thing
     * on somebody's front sits at positive z and a thing behind them at negative —
     * the same convention the rucksack has used since the crowd got bodies.
     */
    collar.visible = p.collar !== undefined;
    if (collar.visible) {
      collarMat.color.set(p.collar as string);
      // A band across the top of the shoulders, standing a hair proud of the shirt.
      collar.scale.set(halfW * 1.5, 0.035 * H, 0.2 * H);
      collar.position.set(0, shoulder - 0.015 * H, 0);
    }
    specs.visible = p.glasses === true;
    if (specs.visible) {
      specs.scale.set(headR * 1.7, headR * 0.34, headR * 0.3);
      specs.position.set(0, H - headR * 1.05, headR * 0.92);
    }
    boom.visible = p.mic === true;
    if (boom.visible) {
      // From the right ear to the corner of the mouth: a thin bar, turned down and
      // forward, which is the shape everybody reads as "wearing a headset".
      boom.scale.set(headR * 0.16, headR * 0.16, headR * 1.5);
      boom.position.set(headR * 0.78, H - headR * 1.25, headR * 0.5);
      boom.rotation.set(0, -0.5, 0.35);
    }
    const lap = p.laptop === true && !seated;
    lapBase.visible = lap;
    lapLid.visible = lap;
    if (lap) {
      // Held in both hands, deck flat and lid up: the pose of somebody who is
      // editing slides standing up, five minutes before they are needed.
      const deckY = hip + (shoulder - hip) * 0.52;
      lapBase.scale.set(halfW * 1.7, 0.012 * H, 0.16 * H);
      lapBase.position.set(0, deckY, 0.17 * H);
      lapLid.scale.set(halfW * 1.7, 0.14 * H, 0.014 * H);
      lapLid.position.set(0, deckY + 0.06 * H, 0.1 * H);
      lapLid.rotation.x = -0.25;
      // ...and the arms come up to hold it, which is what makes it read as held
      // rather than balanced.
      armL.pivot.rotation.x = -1.15;
      armR.pivot.rotation.x = -1.15;
    }

    if (p.colour) cloth.color.set(p.colour);

    contact.scale.setScalar(Math.max(m(p.r), 0.16) * 1.5);
    /*
     * Face, and the one place this file is allowed an opinion.
     *
     * `Person.face` is undefined for somebody with no reason to be pointing
     * anywhere — a member of staff stood waiting to be asked a question. Turning
     * them a quarter off the camera's axis is what makes that read as waiting
     * rather than as a mannequin parked square to the world.
     */
    yaw.rotation.y = p.face !== undefined ? Math.PI / 2 - p.face : Math.PI * 0.75 + rnd(seed, 8) * 0.5;

    /*
     * A little vertical bob, off the same phase, scaled by how fast they are going
     * — and, for somebody sitting down, a drop.
     *
     * A seated figure that keeps its standing hip height is a standing figure with
     * its knees bent: head at 1.6 m over a seat back. `SEAT_HIP_M` is where a hip
     * actually is on a chair, so the drop is the difference and the head comes out
     * at about 1.35 m, which is what the row behind is looking over.
     */
    const bob = seated ? 0 : Math.abs(Math.cos(ph)) * 0.02 * (swing / SWING);
    const sit = seated ? Math.max(0, hip - SEAT_HIP_M) : 0;
    root.position.set(m(p.x), base + bob - sit, m(p.y));
  }

  return {
    root,
    pose,
    dispose(): void {
      cloth.dispose();
      collarMat.dispose();
      release();
    },
  };
}
