/**
 * keynote3d.ts — chapter 4 in 3D: Room 8, the keynote.
 *
 * Chapter 1's venue stops at `X_END` (venue.ts): the Devoxx rooms past the fire
 * door are shut that night and only their doors are drawn. Chapter 4 is the
 * morning, and it happens inside one of them, so this builds Room 8's inside —
 * lazily, the first time chapter 4 is shown, so chapters 1–3 never pay for it.
 *
 * Everything is placed from the sim (CLAUDE.md: the sim is the only source of
 * truth; this only reads it):
 *
 *  - the room is `R(8)`, the stage/cake mark/#DEVOXX letters/spotlights/seat
 *    blocks are the chapter's props, and their `state` is all that changes them;
 *  - the house screen shows a holding slide with the crowd clock from the
 *    `crowd` prop, and the opening video from `snap.reel` when it plays.
 *
 * Nothing here is solid to the robots — the sim's walls are. The stage is a
 * dais a few centimetres high, because the sim's stage is floor (no plate), and
 * a robot drawn sunk into a knee-high stage would be worse than a low one.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { CY0, CY1, F1, R } from '../sim/geometry';
import { SIGN_ORANGE } from '../sim/letters';
import type { GameSnapshot, Prop, ReelCard, RobotKind } from '../sim/types';
import { m } from '../sim/units';
import { LEAN_RAD, LETTER_HELD_LIFT_M, LETTER_ORANGE, LETTER_WHITE, letterGeometry } from '../render/letters';
import { yawFromSimHeading } from '../render/robots';

import type { Materials } from './materials';
import { box } from './materials';
import { addSeats, HEIGHTS } from './venue';

export interface Keynote3D {
  group: THREE.Group;
  /** For the camera's collision rays. */
  colliders: THREE.Object3D[];
  /**
   * `hands` is where a robot's hands are this frame (`handsOf` in robots3d.ts), for
   * the #DEVOXX letter Droid is carrying; without it the letter rides in front of him.
   */
  update(snap: GameSnapshot, t: number, dt: number, hands?: (kind: RobotKind) => THREE.Vector3 | null): void;
  /** Where the camera watches the opening video from: the back rows, looking at the screen. */
  reelView: { pos: THREE.Vector3; look: THREE.Vector3 };
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** The stage dais, m. Low enough that a robot standing on sim floor does not sink out of sight. */
const DAIS = 0.05;
/** The house screen: over the #DEVOXX sign, 16:9. */
const SCREEN_BOTTOM = 3.35;
const SCREEN_W = 6.5;
const SCREEN_H = (SCREEN_W * 9) / 16;

const INK: Record<ReelCard['kind'], string> = { title: '#ff7a1a', stat: '#e8e6e1', blooper: '#ffd27a', end: '#ff7a1a' };

export function buildKeynote(mats: Materials): Keynote3D {
  const group = new THREE.Group();
  group.name = 'keynote-room8';
  const colliders: THREE.Object3D[] = [];
  const r8 = R(8);
  const x0 = m(r8.x);
  const x1 = m(r8.x + r8.w);
  const z0 = m(r8.y);
  const z1 = m(r8.y + r8.h);
  const cx = (x0 + x1) / 2;

  /* ------------------------------------------------------------ the shell */
  // Carpet, a ceiling with house lights, and the screen wall dressed in black.
  const floor = new THREE.Mesh(box(x1 - x0, 0.02, z1 - z0, V(cx, -0.008, (z0 + z1) / 2), 3), mats.carpetRed);
  floor.receiveShadow = true;
  group.add(floor);
  const ceil = new THREE.Mesh(box(x1 - x0, 0.1, z1 - z0, V(cx, HEIGHTS.room + 0.05, (z0 + z1) / 2), 3), mats.acoustic);
  group.add(ceil);
  colliders.push(ceil);
  const drape = new THREE.Mesh(box(x1 - x0 - 0.1, HEIGHTS.room, 0.12, V(cx, HEIGHTS.room / 2, z0 + 0.1)), mats.drape);
  drape.receiveShadow = true;
  group.add(drape);
  // House-light cans in rows, glowing.
  const canMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.75).multiplyScalar(6), toneMapped: false });
  const canGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16);
  for (let ix = 0; ix < 6; ix++) {
    for (let iz = 0; iz < 4; iz++) {
      const c = new THREE.Mesh(canGeo, canMat);
      c.position.set(x0 + ((ix + 0.5) * (x1 - x0)) / 6, HEIGHTS.room - 0.02, z0 + 4 + iz * ((z1 - z0 - 5) / 4));
      group.add(c);
    }
  }
  // The morning: house lights up, a fill so the room reads, and warm downlights.
  const fill = new THREE.HemisphereLight(0xfff2e0, 0x5a4034, 3.2);
  group.add(fill);
  for (const fx of [0.25, 0.75]) {
    const L = new THREE.SpotLight(0xffe8cc, 2600, 30, 1.15, 0.8, 1.4);
    L.position.set(x0 + fx * (x1 - x0), HEIGHTS.room - 0.3, (z0 + z1) / 2 + 2);
    L.target.position.set(L.position.x, 0, L.position.z);
    group.add(L, L.target);
  }
  // The stage wash: two fronts from the ceiling over the first rows, so the
  // people on the stage — and the robots, at the end — are the lit thing in
  // the room.
  for (const fx of [-0.18, 0.18]) {
    const L = new THREE.SpotLight(0xfff4e8, 1700, 30, 0.38, 0.6, 1.3);
    L.position.set(cx + fx * (x1 - x0), HEIGHTS.room - 0.4, m(r8.y + 150));
    // At the stage floor, not the drape: aimed chest-high they burnt the old
    // banner's middle white, and would burn out the white #DEVOXX letters now.
    L.target.position.set(cx + fx * (x1 - x0) * 0.6, 0, m(r8.y + 50));
    group.add(L, L.target);
  }
  // Grey side walls, lit: a black box read as a void at the edges.
  for (const wx of [x0 + 0.06, x1 - 0.06]) {
    const wall = new THREE.Mesh(box(0.1, HEIGHTS.room, z1 - z0, V(wx, HEIGHTS.room / 2, (z0 + z1) / 2), 3), mats.acoustic);
    wall.receiveShadow = true;
    group.add(wall);
  }
  // The corridor outside is lit too: doors are open, three thousand are coming.
  for (const x of [r8.x + 60, r8.x + r8.w / 2, r8.x + r8.w - 30, F1.mainStair.x - 40]) {
    const L = new THREE.SpotLight(0xfff0dd, 500, 14, 1.2, 0.8, 1.6);
    L.position.set(m(x), HEIGHTS.corridor - 0.3, m((CY0 + CY1) / 2));
    L.target.position.set(m(x), 0, m((CY0 + CY1) / 2));
    group.add(L, L.target);
  }

  // The fire door, shut again (the cinema section is closed to the public).
  // Chapter 1's own door is a prop of that chapter and hides with its set.
  for (const sgn of [-1, 1]) {
    const leaf = new THREE.Mesh(box(0.1, HEIGHTS.door, m(CY1 - CY0) / 2 - 0.02, V(m(F1.fireX + 7), HEIGHTS.door / 2, m((CY0 + CY1) / 2) + (sgn * m(CY1 - CY0)) / 4)), mats.darkMetal);
    group.add(leaf);
  }

  /* ------------------------------------------------------------- the screen */
  const scrCanvas = document.createElement('canvas');
  scrCanvas.width = 1024;
  scrCanvas.height = 576;
  const scrCtx = scrCanvas.getContext('2d')!;
  const scrTex = new THREE.CanvasTexture(scrCanvas);
  scrTex.colorSpace = THREE.SRGBColorSpace;
  const scrMat = new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), scrMat);
  screen.position.set(cx, SCREEN_BOTTOM + SCREEN_H / 2, z0 + 0.2);
  group.add(screen);
  const bezel = new THREE.Mesh(box(SCREEN_W + 0.3, SCREEN_H + 0.3, 0.08, V(cx, SCREEN_BOTTOM + SCREEN_H / 2, z0 + 0.15)), mats.rubber);
  group.add(bezel);
  let scrKey = '';
  function paintSlide(label: string): void {
    const w = scrCanvas.width;
    const h = scrCanvas.height;
    const g = scrCtx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1a0f08');
    g.addColorStop(1, '#07090d');
    scrCtx.fillStyle = g;
    scrCtx.fillRect(0, 0, w, h);
    scrCtx.textAlign = 'center';
    scrCtx.fillStyle = '#ff7a1a';
    scrCtx.font = '800 150px system-ui, sans-serif';
    scrCtx.fillText('DEVOXX', w / 2, h * 0.38);
    scrCtx.fillStyle = '#e8e6e1';
    scrCtx.font = '600 52px system-ui, sans-serif';
    scrCtx.fillText('BELGIUM 2026 · OPENING KEYNOTE', w / 2, h * 0.52);
    scrCtx.fillStyle = '#9fb0c4';
    scrCtx.font = '400 46px system-ui, sans-serif';
    scrCtx.fillText('Speaker: TBA', w / 2, h * 0.64);
    scrCtx.fillStyle = '#ffd27a';
    scrCtx.font = '600 48px system-ui, sans-serif';
    scrCtx.fillText(label, w / 2, h * 0.84, w * 0.92);
    scrCtx.fillStyle = '#ff7a1a';
    scrCtx.fillRect(w * 0.4, h * 0.44, w * 0.2, 4);
    scrTex.needsUpdate = true;
  }
  function paintCard(card: ReelCard | null, alpha: number): void {
    const w = scrCanvas.width;
    const h = scrCanvas.height;
    scrCtx.fillStyle = '#07090d';
    scrCtx.fillRect(0, 0, w, h);
    if (card && alpha > 0.01) {
      scrCtx.save();
      scrCtx.globalAlpha = Math.min(1, alpha);
      scrCtx.textAlign = 'center';
      scrCtx.fillStyle = INK[card.kind];
      scrCtx.font = '700 84px system-ui, sans-serif';
      scrCtx.fillText(card.title, w / 2, h * 0.46, w * 0.9);
      scrCtx.fillStyle = '#9fb0c4';
      scrCtx.font = '400 38px system-ui, sans-serif';
      scrCtx.fillText(card.sub, w / 2, h * 0.64, w * 0.88);
      if (card.kind === 'end') {
        scrCtx.fillStyle = INK.end;
        scrCtx.fillRect(w * 0.42, h * 0.52, w * 0.16, 5);
      }
      scrCtx.restore();
    }
    scrTex.needsUpdate = true;
  }

  /* ------------------------------------------------------ per-prop builders */
  const byKey = new Map<string, THREE.Object3D>();
  let seatsBuilt = false;

  function buildSeatBlocks(props: Prop[]): void {
    // Rows every 18 px from the block's front, seats every 7 px — every other one
    // on a sim seat, so the audience sits in chairs and not between them.
    const at: THREE.Matrix4[] = [];
    const dots: THREE.Vector3[] = [];
    for (const p of props) {
      if (p.kind !== 'seatrow') continue;
      const bx1 = p.x + (p.w ?? 0);
      for (let y = p.y + 11; y < p.y + (p.h ?? 0) - 5; y += 18) {
        for (let x = p.x + 10; x < bx1 - 6; x += 7) {
          const mm = new THREE.Matrix4().compose(V(m(x), 0, m(y) + 0.1), new THREE.Quaternion(), V(0.9, 1, 1));
          at.push(mm);
        }
        dots.push(V(m(p.x) + 0.1, 0.06, m(y)), V(m(bx1) - 0.1, 0.06, m(y)));
      }
    }
    addSeats(group, mats, at);
    // Aisle step lights, warm, one per row end.
    const g = new THREE.BoxGeometry(0.12, 0.04, 0.05);
    const mt = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.15).multiplyScalar(6), toneMapped: false });
    const im = new THREE.InstancedMesh(g, mt, dots.length);
    dots.forEach((d, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(d.x, d.y, d.z)));
    group.add(im);
  }

  function stage(p: Prop): THREE.Object3D {
    const o = new THREE.Group();
    const w = m(p.w ?? 0);
    const d = m(p.h ?? 0);
    const sx = m(p.x) + w / 2;
    const sz = m(p.y) + d / 2;
    const deck = new THREE.Mesh(box(w, DAIS, d, V(sx, DAIS / 2, sz)), mats.blackGloss);
    deck.receiveShadow = true;
    o.add(deck);
    // An LED edge along the front of the stage: orange, green when it is ready.
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.1).multiplyScalar(5), toneMapped: false });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.05), edgeMat);
    edge.position.set(sx, DAIS, sz + d / 2);
    o.add(edge);
    o.userData.edge = edgeMat;
    // A lectern at stage left, against the drape: where the speaker will stand.
    const lect = new THREE.Group();
    const body = new THREE.Mesh(box(0.6, 1.1, 0.45, V(0, 0.55 + DAIS, 0)), mats.darkMetal);
    const top = new THREE.Mesh(box(0.7, 0.05, 0.55, V(0, 1.15 + DAIS, 0.03)), mats.blackGloss);
    top.rotation.x = 0.2;
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.12), new THREE.MeshBasicMaterial({ map: word('DEVOXX', '#ff7a1a'), transparent: true, toneMapped: false }));
    logo.position.set(0, 0.8 + DAIS, 0.231);
    lect.add(body, top, logo);
    lect.position.set(sx + w / 2 - 0.9, 0, m(p.y) + 0.6);
    o.add(lect);
    return o;
  }

  function cakeMark(p: Prop): THREE.Object3D {
    // Glow tape on the stage, four strips and a word.
    const o = new THREE.Group();
    const w = m(p.w ?? 0);
    const d = m(p.h ?? 0);
    const x = m(p.x);
    const z = m(p.y);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.1).multiplyScalar(3), toneMapped: false });
    const y = DAIS + 0.004;
    const t = 0.07;
    for (const [bx, bz, bw, bd] of [
      [x + w / 2, z, w, t],
      [x + w / 2, z + d, w, t],
      [x, z + d / 2, t, d],
      [x + w, z + d / 2, t, d],
    ] as const) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), mat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(bx, y, bz);
      o.add(s);
    }
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, w * 0.22), new THREE.MeshBasicMaterial({ map: word('CAKE', '#ffd27a'), transparent: true, toneMapped: false }));
    lbl.rotation.x = -Math.PI / 2;
    lbl.position.set(x + w / 2, y, z + d / 2);
    o.add(lbl);
    o.userData.mat = mat;
    return o;
  }

  function cake(p: Prop): THREE.Object3D {
    // A wheeled board with a three-tier Devoxx cake, and three candles in the
    // robots' colours.
    const o = new THREE.Group();
    const R0 = m((p.w ?? 34) / 2);
    const board = new THREE.Mesh(new RoundedBoxGeometry(R0 * 1.7, 0.12, R0 * 1.7, 2, 0.04), mats.darkMetal);
    board.position.y = 0.22;
    o.add(board);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), mats.rubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * R0 * 0.7, 0.08, sz * R0 * 0.7);
      const fork = new THREE.Mesh(box(0.04, 0.14, 0.1, V(sx * R0 * 0.7, 0.16, sz * R0 * 0.7)), mats.steel);
      o.add(w, fork);
    }
    const icing = new THREE.MeshStandardMaterial({ color: 0xf6efe4, roughness: 0.45 });
    const drip = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.35 });
    let y = 0.28;
    for (const [r, h] of [
      [R0 * 0.72, 0.42],
      [R0 * 0.52, 0.36],
      [R0 * 0.32, 0.32],
    ]) {
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), icing);
      tier.position.y = y + h / 2;
      tier.castShadow = true;
      o.add(tier);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.01, h * 0.22, 32, 1, true), drip);
      band.position.y = y + h * 0.85;
      o.add(band);
      y += h;
    }
    const flames: THREE.Mesh[] = [];
    ['#ff7a1a', '#39c96b', '#3a86ff'].forEach((c, i) => {
      const a = (i / 3) * Math.PI * 2;
      const cr = R0 * 0.16;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
      candle.position.set(Math.cos(a) * cr, y + 0.11, Math.sin(a) * cr);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.7, 0.25).multiplyScalar(8), toneMapped: false }));
      flame.scale.y = 1.8;
      flame.position.set(candle.position.x, y + 0.27, candle.position.z);
      o.add(candle, flame);
      flames.push(flame);
    });
    o.userData.flames = flames;
    return o;
  }

  function spotlight(p: Prop): THREE.Object3D {
    // A floor PAR can on a yoke, aimed at the stage, with its number on the base.
    const o = new THREE.Group();
    const x = m(p.x);
    const z = m(p.y);
    o.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.06, 20), mats.darkMetal);
    base.position.y = 0.03;
    o.add(base);
    const yoke = new THREE.Group();
    yoke.position.y = 0.2;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.32, 16), mats.darkMetal);
    can.rotation.x = Math.PI / 2;
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), lensMat);
    lens.position.z = 0.165;
    yoke.add(can, lens);
    // Aim: each at its own quarter of the stage, 1.2 m up — four beams on one
    // point made a white-out over the old banner, where the #DEVOXX sign now
    // stands. `lookAt` points +z, and `o` is
    // not in the scene yet, so the target is given in `o`'s own frame.
    const stageAt = V(cx + (x - cx) * 0.35, 1.2, m(r8.y + 45));
    o.add(yoke);
    yoke.lookAt(stageAt.clone().sub(V(x, 0, z)));
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: word(String(p.v ?? '?'), '#ffffff'), transparent: true, toneMapped: false }));
    num.rotation.x = -Math.PI / 2;
    num.position.set(0, 0.065, 0);
    o.add(num);
    // The "next" ring on the floor.
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.1).multiplyScalar(3), transparent: true, toneMapped: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    o.add(ring);
    // The beam itself, a real spot aimed at the stage, off until lit.
    const L = new THREE.SpotLight(0xfff0d8, 0, 30, 0.16, 0.5, 1.3);
    L.position.set(0, 0.3, 0);
    o.add(L, L.target);
    L.target.position.copy(stageAt).sub(V(x, 0, z));
    o.userData = { lens: lensMat, ring, ringMat, light: L };
    return o;
  }

  /* ------------------------------------------------------- the #DEVOXX sign
   *
   * Droid's job since 28 Sep (`src/sim/letters.ts`): the crew stood up #DEV, and
   * the O and both X's lean in the wing until he carries them in. One glyph per
   * letter, keyed by its SLOT — so a letter is the same mesh leaning on the wall,
   * in his hands and standing in the sign — and a ghost of each missing one
   * standing in its own gap, faint until he is carrying it, so the sign reads as
   * #DEVOXX with three letters still to come rather than as #DEV.
   */
  const letterMats = {
    white: new THREE.MeshStandardMaterial({ color: LETTER_WHITE, roughness: 0.38, metalness: 0 }),
    orange: new THREE.MeshStandardMaterial({ color: LETTER_ORANGE, roughness: 0.38, metalness: 0 }),
  };
  const letterObjs = new Map<number, THREE.Group>();
  const gapObjs = new Map<number, { o: THREE.Mesh; mat: THREE.MeshBasicMaterial }>();
  function letterObj(slot: number, ch: string): THREE.Group {
    let o = letterObjs.get(slot);
    if (!o) {
      o = new THREE.Group();
      const mesh = new THREE.Mesh(letterGeometry(ch), slot === SIGN_ORANGE ? letterMats.orange : letterMats.white);
      mesh.name = 'glyph';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      o.add(mesh);
      letterObjs.set(slot, o);
      group.add(o);
    }
    return o;
  }
  function gapObj(p: Prop): { o: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
    const slot = p.v ?? 0;
    let g = gapObjs.get(slot);
    if (!g) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 0.72, 0.2).multiplyScalar(1.6),
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        toneMapped: false,
      });
      const o = new THREE.Mesh(letterGeometry(p.label ?? '#'), mat);
      // Standing where the letter will stand, reading out at the house.
      o.position.set(m(p.x + (p.w ?? 0) / 2), DAIS, m(p.y + (p.h ?? 0) / 2));
      o.rotation.y = yawFromSimHeading(Math.PI / 2);
      g = { o, mat };
      gapObjs.set(slot, g);
      group.add(o);
    }
    return g;
  }
  /** One frame of the sign: every letter where the sim has it, every empty gap waiting. */
  function poseSign(snap: GameSnapshot, t: number, hands?: (kind: RobotKind) => THREE.Vector3 | null): void {
    for (const o of letterObjs.values()) o.visible = false;
    for (const g of gapObjs.values()) g.o.visible = false;
    for (const p of snap.props) {
      if (p.kind === 'letter' || p.kind === 'letter-held') {
        const o = letterObj(p.v ?? 0, p.label ?? '#');
        o.visible = true;
        const mesh = o.getObjectByName('glyph') as THREE.Mesh;
        mesh.rotation.set(0, 0, 0);
        const face = p.face ?? Math.PI / 2;
        o.rotation.set(0, yawFromSimHeading(face), 0);
        if (p.kind === 'letter-held') {
          // In his hands, clear of the carpet, the way he is walking.
          const at = hands?.('droid');
          if (at) o.position.set(at.x, LETTER_HELD_LIFT_M, at.z);
          else o.position.set(m(p.x) + Math.cos(face) * 0.6, LETTER_HELD_LIFT_M, m(p.y) + Math.sin(face) * 0.6);
        } else {
          // In the sign it stands on the dais; in the wing, on the carpet, tipped
          // back against the wall from its bottom edge.
          const inSign = p.state === 'done';
          o.position.set(m(p.x + (p.w ?? 0) / 2), inSign ? DAIS : 0, m(p.y + (p.h ?? 0) / 2));
          if (!inSign) mesh.rotation.x = -LEAN_RAD;
        }
      } else if (p.kind === 'letter-slot') {
        const g = gapObj(p);
        g.o.visible = true;
        g.mat.opacity = p.state === 'active' ? 0.3 + 0.14 * Math.sin(t * 5) : 0.12;
      }
    }
  }

  /* ------------------------------------------------------------------ update */
  function build(p: Prop): THREE.Object3D | null {
    switch (p.kind) {
      case 'stage':
        return stage(p);
      case 'cake-mark':
        return cakeMark(p);
      case 'cake':
        return cake(p);
      case 'spotlight':
        return spotlight(p);
      default:
        return null;
    }
  }
  const keyOf = (p: Prop): string => (p.kind === 'cake' ? 'cake' : `${p.kind}@${Math.round(p.x)},${Math.round(p.y)}`);

  return {
    group,
    colliders,
    reelView: { pos: V(cx, 2.4, z0 + 15), look: V(cx, SCREEN_BOTTOM + SCREEN_H * 0.45, z0) },
    update(snap: GameSnapshot, t: number, _dt: number, hands?: (kind: RobotKind) => THREE.Vector3 | null): void {
      if (!seatsBuilt && snap.props.some((p) => p.kind === 'seatrow')) {
        buildSeatBlocks(snap.props);
        seatsBuilt = true;
      }
      let ready = false;
      poseSign(snap, t, hands);
      for (const p of snap.props) {
        if (p.kind === 'seatrow' || p.kind.startsWith('letter')) continue;
        const k = keyOf(p);
        let o = byKey.get(k);
        if (o === undefined) {
          o = build(p) ?? new THREE.Object3D();
          byKey.set(k, o);
          group.add(o);
        }
        const done = p.state === 'done';
        switch (p.kind) {
          case 'stage': {
            ready = done;
            const mt = o.userData.edge as THREE.MeshBasicMaterial;
            const pulse = done ? 4 + 2 * Math.sin(t * 4) : 5;
            mt.color.setRGB(done ? 0.2 : 1, done ? 1 : 0.45, done ? 0.35 : 0.1).multiplyScalar(pulse);
            break;
          }
          case 'cake-mark': {
            (o.userData.mat as THREE.MeshBasicMaterial).color.setRGB(done ? 0.2 : 1, done ? 1 : 0.8, done ? 0.35 : 0.1).multiplyScalar(done ? 3 : 2 + Math.sin(t * 3));
            break;
          }
          case 'cake': {
            o.position.set(m(p.x), 0, m(p.y));
            for (const [i, f] of (o.userData.flames as THREE.Mesh[]).entries()) f.scale.set(1, 1.6 + 0.3 * Math.sin(t * 13 + i * 2), 1);
            break;
          }
          case 'spotlight': {
            const u = o.userData as { lens: THREE.MeshBasicMaterial; ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; light: THREE.SpotLight };
            u.lens.color.setRGB(1, 0.95, 0.85).multiplyScalar(done ? 14 : 0.06);
            u.light.intensity = done ? 700 : 0;
            u.ring.visible = p.state === 'active';
            u.ringMat.opacity = 0.55 + 0.45 * Math.sin(t * 5);
            break;
          }
        }
      }
      // The house screen: the video while it plays, else the holding slide.
      const reel = snap.reel;
      if (reel) {
        const key = `r|${reel.index}|${reel.card ? reel.card.title : ''}|${reel.alpha.toFixed(2)}`;
        if (key !== scrKey) {
          scrKey = key;
          paintCard(reel.card, reel.alpha);
        }
      } else {
        const crowd = snap.props.find((p) => p.kind === 'crowd');
        const label = ready ? 'Stage ready: all three on stage!' : (crowd?.label ?? '');
        const key = `s|${label}`;
        if (key !== scrKey) {
          scrKey = key;
          paintSlide(label);
        }
      }
    },
  };
}

/** A word on a transparent (or coloured) canvas, for tape, plates and cloth. */
function word(text: string, ink: string, bg: string | null = null, w = 512, h = 160): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  if (bg) {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
  }
  x.fillStyle = ink;
  x.font = `800 ${Math.round(h * 0.72)}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, h * 0.54, w * 0.94);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
