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

import { CY0, CY1, F1, R } from '../sim/geometry';
import { BREAKFAST, KEYNOTE_RAKE, LAB_DEPTH, LAB_X0, LAB_X1, RAKE_DEPTH, STAGE_RISE } from '../sim/chapters/ch4-keynote';
import { SECOND_ROW } from '../sim/cameos';
import { riseAt } from '../sim/surface';
import { SIGN_ORANGE } from '../sim/letters';
import type { GameSnapshot, Plate, Prop, ReelCard } from '../sim/types';
import { m } from '../sim/units';
import { LEAN_RAD, LETTER_HELD_LIFT_M, LETTER_ORANGE, LETTER_WHITE, letterGeometry } from '../render/letters';
import { yawFromSimHeading } from '../render/robots';

import type { Materials } from './materials';
import { box } from './materials';
import { skyline, wordmark } from './splash';
import { wellDSticker } from './welld';
import { addSeats, HEIGHTS } from './venue';

export interface Keynote3D {
  group: THREE.Group;
  /** For the camera's collision rays. */
  colliders: THREE.Object3D[];
  update(snap: GameSnapshot, t: number, dt: number): void;
  /**
   * The film's shots (`world.ts`). `screenView` fills a camera of that aspect and
   * vertical field of view with the house screen, straight on; `stageView` is the
   * curtain call from the front rows — the stage low in the frame, the screen
   * over it — which the camera pulls back to for the credits and holds behind the
   * final card.
   */
  screenView(aspect: number, fovDeg: number): Shot;
  stageView(): Shot;
}

/** A camera position and the point it looks at. */
export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** The stage dais, m. Low enough that a robot standing on sim floor does not sink out of sight. */
const DAIS = 0.05;
/** The house screen: over the #DEVOXX sign, 16:9. */
const SCREEN_BOTTOM = 3.35;
const SCREEN_W = 6.5;
const SCREEN_H = (SCREEN_W * 9) / 16;

const INK: Record<ReelCard['kind'], string> = { splash: '#ff7a1a', title: '#ff7a1a', stat: '#e8e6e1', blooper: '#ffd27a', credit: '#e8e6e1', end: '#ff7a1a' };
/**
 * The curtain call's camera, m: `back` from the apron towards the house, `h` up
 * off the stage floor, looking at a point `look` up over the apron.
 */
const STAGE_EYE = Object.freeze({ back: 7, h: 3.1, look: 1.9 });
/** Seconds a floor can takes to swing up onto the stage once Voxxy has lit it. */
const SPOT_SWING = 1.1;
/** The screen's brightness at full strength: over 1, so the bloom finds it, and never tone-mapped. */
const SCREEN_GAIN = 1.3;
/** The film's canvas, px (the slide's is 1024 x 576). */
const FILM_W = 1600;
const FILM_H = 900;
/** The HUD's own condensed face (`hudTheme.ts`), so the film is set like the game's title. */
const FILM_FONT = '"Bahnschrift","DIN Alternate","Roboto Condensed","Arial Narrow",sans-serif';
/** The splash title's yellow (`hudTheme.ts`). */
const FILM_YELLOW = '#f3e600';
/** Each robot's lamp, for its name on the film: the candles on the cake. */
const ROBOT_INK: Readonly<Record<string, string>> = { Voxxy: '#ff7a1a', Droid: '#39c96b', Biggy: '#3a86ff' };

/** The fractional part: a seeded scatter with no generator to carry about. */
const frac = (v: number): number => v - Math.floor(v);

/**
 * Letter-spacing on a 2D canvas, px, where the browser has it (it is ignored
 * where it does not). Returns what was set, so centred text can be shifted by
 * half of it: the spacing trails the last letter too.
 */
function spaced(g: CanvasRenderingContext2D, px: number): number {
  const s = g as CanvasRenderingContext2D & { letterSpacing?: string };
  if (s.letterSpacing === undefined) return 0;
  s.letterSpacing = `${px.toFixed(1)}px`;
  return px;
}

/**
 * `photo` photographs one of the game's people by name (`portraitOf`, which
 * needs the renderer): the film shows the two who made the game as their own
 * characters, on their credits.
 * Without it those cards are type only.
 */
export function buildKeynote(mats: Materials, photo?: (name: string) => HTMLCanvasElement | null): Keynote3D {
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
  const rake = KEYNOTE_RAKE.on;
  if (!rake) {
    const floor = new THREE.Mesh(box(x1 - x0, 0.02, z1 - z0, V(cx, -0.008, (z0 + z1) / 2), 3), mats.carpetRed);
    floor.receiveShadow = true;
    group.add(floor);
  }
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

  /* ------------------------------------------- the lab tables and the quote wall */
  // Michele's photograph: a long row of tables in black velvet, a white power
  // trunking down the middle, laptops and bottles, people on both sides — and
  // behind them a white wall of film quotes in raised letters.
  {
    const velvet = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 1 });
    const trunk = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.4 });
    const lap = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.8 });
    const bottle = new THREE.MeshStandardMaterial({ color: 0xcfe6f0, roughness: 0.1, transparent: true, opacity: 0.7 });
    const chair = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.6, metalness: 0.3 });
    const TH = 0.76;
    let welld: THREE.Mesh | null = null;
    const qa = document.createElement('canvas');
    qa.width = 2048;
    qa.height = 512;
    const q = qa.getContext('2d')!;
    q.fillStyle = '#e9e6e2';
    q.fillRect(0, 0, 2048, 512);
    const lines: Array<[string, number, number, number]> = [
      ['"MAKE MY DAY"', 150, 30, 120],
      ['"you talkin\' to me?"  "shaken, not stirred"  "RUN FORREST, RUN!"', 56, 40, 200],
      ['"we\'ll always have Paris"  "I\'LL BE BACK"', 90, 30, 300],
      ['"I\'m the king of the world"  "HASTA LA VISTA, BABY"', 70, 60, 390],
      ['"I\'ll make him an offer he can\'t refuse"  "It\'s showtime, folks"', 52, 30, 470],
    ];
    for (const [t, size, x, y] of lines) {
      q.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
      // Raised letters: a soft shadow down-right, the face a shade lighter.
      q.fillStyle = 'rgba(0,0,0,0.22)';
      q.fillText(t, x + 5, y + 6);
      q.fillStyle = '#f7f5f2';
      q.fillText(t, x, y);
    }
    const qt = new THREE.CanvasTexture(qa);
    qt.colorSpace = THREE.SRGBColorSpace;
    const quoteMat = new THREE.MeshStandardMaterial({ map: qt, roughness: 0.8 });
    const len = m(LAB_X1 - LAB_X0);
    const lx = m((LAB_X0 + LAB_X1) / 2);
    for (const side of [-1, 1]) {
      const wallZ = side < 0 ? m(CY0) + 0.02 : m(CY1) - 0.02;
      const inward = -side;
      const d = m(LAB_DEPTH);
      const tz = wallZ + inward * (d / 2 + 0.3);
      // The quote wall.
      const qw = new THREE.Mesh(new THREE.PlaneGeometry(len, len / 4), quoteMat);
      qw.position.set(lx, 1.2 + len / 8, wallZ + inward * 0.03);
      if (side > 0) qw.rotation.y = Math.PI;
      group.add(qw);
      // The table: a velvet-draped block, the trunking along its middle.
      group.add(new THREE.Mesh(box(len, TH, d * 0.8, V(lx, TH / 2, tz)), velvet));
      group.add(new THREE.Mesh(box(len - 0.2, 0.05, 0.1, V(lx, TH + 0.025, tz)), trunk));
      for (let i = 0; i < Math.floor(len / 0.9); i++) {
        const x = m(LAB_X0) + 0.45 + i * 0.9;
        for (const face of [-1, 1]) {
          if ((i + (face > 0 ? 1 : 0)) % 3 === 0) continue;
          const z = tz + face * d * 0.22;
          const base = new THREE.Mesh(box(0.32, 0.015, 0.22, V(x, TH + 0.01, z)), lap);
          /*
           * The lid is built at its own origin and hinged behind the base, the
           * screen towards whoever sits at it. It was a `box()` — geometry baked
           * at its place in the corridor — turned about the WORLD origin, which
           * swung every lid five metres under the floor or six up into the
           * ceiling, and the tables had bases and no screens.
           */
          const lid = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.012), lap);
          lid.position.set(x, TH + 0.12, z - face * 0.1);
          lid.rotation.x = -face * 0.25;
          group.add(base, lid);
          // A WellD sticker on the back of a few of the wall side's lids: those
          // backs face the corridor, and these are the ones where the room side's
          // seat is empty, so no other lid stands in front of them (Michele: no
          // booth, "but put some sticker also on chap 4").
          const roomSeatEmpty = (i + (inward > 0 ? 1 : 0)) % 3 === 0;
          if (face !== inward && roomSeatEmpty && i % 2 === 0) {
            welld ??= wellDSticker(0.1);
            const st = welld.clone();
            st.position.set(0, 0.02, -face * 0.0075);
            st.rotation.set(0, face > 0 ? Math.PI : 0, (i % 4 === 0 ? 1 : -1) * 0.14);
            lid.add(st);
          }
          if (i % 2 === 0) {
            const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), bottle);
            bt.position.set(x + 0.25, TH + 0.11, z);
            group.add(bt);
          }
          // A folding chair on the room side only (the wall side is against the quotes).
          if (face === inward) {
            const cz = tz + face * (d * 0.4 + 0.3);
            group.add(new THREE.Mesh(box(0.42, 0.04, 0.4, V(x, 0.46, cz)), chair));
            group.add(new THREE.Mesh(box(0.42, 0.42, 0.03, V(x, 0.7, cz + face * 0.2)), chair));
            for (const lxo of [-0.19, 0.19]) group.add(new THREE.Mesh(box(0.025, 0.46, 0.025, V(x + lxo, 0.23, cz)), chair));
          }
        }
      }
    }
  }

  /* ------------------------------------ the speakers' breakfast, at the stairs */
  // Michele, 29 Sep (#21): "Robots should stop at the secondary stairs. Add some
  // tables with breakfast". The sim's `BREAKFAST` is the wall; this is what it is:
  // four clothed tables filling the lane between the two flights' west ends, with
  // urns, croissants, cups and juice on them, the taps and the card turned east,
  // to the Room 8 side the robots come from.
  {
    const cloth = new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.95 });
    const croissant = new THREE.MeshStandardMaterial({ color: 0xc9812f, roughness: 0.55 });
    const china = new THREE.MeshStandardMaterial({ color: 0xf7f6f2, roughness: 0.3 });
    const juice = new THREE.MeshStandardMaterial({ color: 0xf29a1d, roughness: 0.15, transparent: true, opacity: 0.85 });
    const TH = 0.76;
    const bx = m(BREAKFAST.x + BREAKFAST.w / 2);
    const z0 = m(BREAKFAST.y);
    const lane = m(BREAKFAST.h);
    const depth = m(BREAKFAST.w) - 0.08;
    const n = 4;
    const each = lane / n;
    for (let i = 0; i < n; i++) {
      const tz = z0 + each * (i + 0.5);
      const len = each - 0.06;
      // The cloth to the floor, and the table top a touch proud of it.
      group.add(new THREE.Mesh(box(depth, TH - 0.02, len, V(bx, (TH - 0.02) / 2, tz)), cloth));
      group.add(new THREE.Mesh(box(depth + 0.04, 0.03, len + 0.04, V(bx, TH - 0.005, tz)), cloth));
      if (i % 2 === 0) {
        // A coffee urn, tap to the east.
        const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.46, 20), mats.steel);
        urn.position.set(bx - 0.05, TH + 0.23, tz - len * 0.25);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.06, 20), mats.darkMetal);
        lid.position.set(urn.position.x, TH + 0.49, urn.position.z);
        const tap = new THREE.Mesh(box(0.08, 0.04, 0.04, V(urn.position.x + 0.19, TH + 0.12, urn.position.z)), mats.darkMetal);
        group.add(urn, lid, tap);
        // Cups stacked beside it, upside down.
        for (let s = 0; s < 3; s++) {
          for (let c = 0; c < 4; c++) {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.085, 12), china);
            cup.position.set(bx + 0.12 - s * 0.1, TH + 0.045 + c * 0.05, tz - len * 0.02);
            group.add(cup);
          }
        }
      } else {
        // Juice, and a jug of it.
        for (let j = 0; j < 5; j++) {
          const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 10), juice);
          glass.position.set(bx + 0.15, TH + 0.055, tz - len * 0.3 + j * 0.09);
          group.add(glass);
        }
        const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.24, 16), juice);
        jug.position.set(bx - 0.12, TH + 0.12, tz - len * 0.22);
        group.add(jug);
      }
      // A tray of croissants on every table.
      const ty = TH + 0.025;
      const tray = new THREE.Mesh(box(0.42, 0.02, 0.58, V(bx, ty, tz + len * 0.22)), mats.darkMetal);
      group.add(tray);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          const cr = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.028, 8, 12, Math.PI * 1.25), croissant);
          cr.rotation.x = -Math.PI / 2;
          cr.rotation.z = (r * 2 + c) * 0.9;
          cr.scale.set(1, 1, 0.8);
          cr.position.set(bx - 0.1 + c * 0.2, ty + 0.035, tz + len * 0.22 - 0.18 + r * 0.18);
          group.add(cr);
        }
      }
    }
    // The tent card on the middle of the row, to the east.
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.28),
      new THREE.MeshBasicMaterial({ map: word("SPEAKERS' BREAKFAST", '#1a1a1a', '#f4efe2', 1024, 320), toneMapped: false }),
    );
    card.position.set(bx + depth / 2 - 0.02, TH + 0.16, z0 + lane / 2);
    card.rotation.y = Math.PI / 2;
    group.add(card);
    // Warm light over it, so it reads from down the corridor.
    const lamp = new THREE.PointLight(0xffd9a8, 40, 7, 2);
    lamp.position.set(bx + 0.8, 2.4, z0 + lane / 2);
    group.add(lamp);
  }

  /* ------------------------------------------------------------- the screen */
  const scrCanvas = document.createElement('canvas');
  scrCanvas.width = 1024;
  scrCanvas.height = 576;
  const scrCtx = scrCanvas.getContext('2d')!;
  const scrTex = new THREE.CanvasTexture(scrCanvas);
  scrTex.colorSpace = THREE.SRGBColorSpace;
  const scrMat = new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false, color: new THREE.Color(SCREEN_GAIN, SCREEN_GAIN, SCREEN_GAIN) });
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
    scrCtx.fillText('BELGIUM 2026 · OPENING KEYNOTE', w / 2, h * 0.52, w * 0.8);
    scrCtx.fillStyle = '#9fb0c4';
    scrCtx.font = '400 46px system-ui, sans-serif';
    scrCtx.fillText('Speaker: TBA', w / 2, h * 0.64);
    scrCtx.fillStyle = '#ffd27a';
    scrCtx.font = '600 48px system-ui, sans-serif';
    scrCtx.fillText(label, w / 2, h * 0.84, w * 0.66);
    scrCtx.fillStyle = '#ff7a1a';
    scrCtx.fillRect(w * 0.4, h * 0.44, w * 0.2, 4);
    // Duke, waving from the corner — the keynote screen had him in Michele's
    // photograph (28 Sep). BSD-licensed artwork, drawn here in three shapes. In
    // the corner and under the lines, which he used to stand across.
    drawDuke(scrCtx, w * 0.085, h * 0.95, h * 0.36);
    scrTex.needsUpdate = true;
  }

  /*
   * THE FILM. Michele, 29 Sep 2026: *"After the last robot reaches the stage, they
   * should regroup, camera zooms on the screen, and the movie should start ... I'd
   * start with Devoxx After Dark (like in the splash screen), A game by Michele
   * Giacobazzi (pic of my char?). Then the bloopers / notes? Or credits in film
   * version?"*
   *
   * The film has a canvas of its own, half as wide again as the slide's: the
   * camera fills the frame with the screen for it (`world.ts`), and 1024 px of
   * type stretched over a whole window read soft. Each card is painted ONCE, at
   * full strength, and the fades are the screen's own brightness — a card used to
   * be repainted and re-uploaded on every frame of every fade.
   */
  const filmCanvas = document.createElement('canvas');
  filmCanvas.width = FILM_W;
  filmCanvas.height = FILM_H;
  const film = filmCanvas.getContext('2d')!;
  const filmTex = new THREE.CanvasTexture(filmCanvas);
  filmTex.colorSpace = THREE.SRGBColorSpace;
  filmTex.anisotropy = 4;
  /** The splash's own Antwerp and wordmark, drawn for the screen the first time the film needs them. */
  let city: HTMLCanvasElement | null = null;
  let mark: HTMLCanvasElement | null = null;
  /**
   * The two who made it, as their characters (`SECOND_ROW`, the pair in Room 8's
   * second row), photographed when the film starts (`photo`). Michele, 29 Sep
   * 2026, on the byline's picture of him: *"You should be in the credits too."*
   */
  let portraits: ReadonlyMap<string, HTMLCanvasElement> | null = null;
  /** The maker a card names, if it names one: the first word of the credited name. */
  const makerIn = (text: string): HTMLCanvasElement | null => {
    for (const [name, pic] of portraits ?? []) if (new RegExp(`\\b${name}\\b`).test(text)) return pic;
    return null;
  };

  /** A photograph in a frame, with a warm light behind the head. */
  function framed(pic: HTMLCanvasElement, px: number, py: number, pw: number, ph: number): void {
    film.save();
    film.beginPath();
    film.roundRect(px, py, pw, ph, 18);
    film.clip();
    const glow = film.createRadialGradient(px + pw / 2, py + ph * 0.36, 0, px + pw / 2, py + ph * 0.36, pw * 0.8);
    glow.addColorStop(0, '#3a2a1c');
    glow.addColorStop(1, '#12151c');
    film.fillStyle = glow;
    film.fillRect(px, py, pw, ph);
    film.drawImage(pic, px, py, pw, ph);
    film.restore();
    film.strokeStyle = 'rgba(245,182,56,.55)';
    film.lineWidth = 3;
    film.beginPath();
    film.roundRect(px, py, pw, ph, 18);
    film.stroke();
  }
  /** Where a card's photograph goes: the left of the screen, 4:5. */
  const PIC = { x: FILM_W * 0.09, h: FILM_H * 0.74, w: FILM_H * 0.74 * 0.8, y: FILM_H * 0.13 };

  function paintCard(card: ReelCard | null): void {
    const w = FILM_W;
    const h = FILM_H;
    film.save();
    film.fillStyle = '#07090d';
    film.fillRect(0, 0, w, h);
    film.textAlign = 'center';
    film.textBaseline = 'alphabetic';
    if (card?.kind === 'splash') paintSplash(card);
    else if (card?.kind === 'credit') paintCredit(card);
    else if (card) {
      const k = w / 1024;
      film.fillStyle = INK[card.kind];
      film.font = `600 ${Math.round(84 * k)}px ${FILM_FONT}`;
      film.fillText(card.title, w / 2, h * 0.46, w * 0.9);
      film.fillStyle = '#9fb0c4';
      film.font = `400 ${Math.round(38 * k)}px ${FILM_FONT}`;
      film.fillText(card.sub, w / 2, h * 0.64, w * 0.88);
      if (card.kind === 'end') {
        film.fillStyle = INK.end;
        film.fillRect(w * 0.42, h * 0.52, w * 0.16, 5 * k);
      }
    }
    film.restore();
    filmTex.needsUpdate = true;
  }

  /** The title as the splash screen draws it (`splash.ts`): Antwerp, gold dust, the wordmark, AFTER DARK. */
  function paintSplash(card: ReelCard): void {
    const w = FILM_W;
    const h = FILM_H;
    const bg = film.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, w * 0.62);
    bg.addColorStop(0, '#1a0f05');
    bg.addColorStop(1, '#000000');
    film.fillStyle = bg;
    film.fillRect(0, 0, w, h);
    for (let i = 1; i <= 150; i++) {
      const a = 0.2 + 0.6 * frac(i * 0.3183);
      film.fillStyle = `rgba(245,182,56,${a.toFixed(2)})`;
      const s = 1.5 + 2.5 * frac(i * 0.7071);
      film.fillRect(frac(i * 0.754877666) * w, frac(i * 0.569840291) * h * 0.8, s, s);
    }
    city ??= skyline(w, Math.round(h * 0.42), 1);
    film.globalAlpha = 0.95;
    film.drawImage(city, 0, h - city.height);
    film.globalAlpha = 1;
    mark ??= wordmark(Math.round(w * 0.56), 1);
    const markY = h * 0.14;
    film.save();
    film.filter = 'drop-shadow(0 0 8px rgba(255,170,60,.9)) drop-shadow(0 0 28px rgba(255,120,20,.55))';
    film.drawImage(mark, (w - mark.width) / 2, markY);
    film.restore();
    // AFTER DARK, with the splash's glow and its red/cyan split.
    const size = Math.round(h * 0.1);
    const titleY = markY + mark.height + size * 1.2;
    film.font = `600 ${size}px ${FILM_FONT}`;
    const sp = spaced(film, size * 0.3);
    film.fillStyle = 'rgba(255,90,78,.6)';
    film.fillText(card.title, w / 2 + sp / 2 + 4, titleY);
    film.fillStyle = 'rgba(94,246,255,.45)';
    film.fillText(card.title, w / 2 + sp / 2 - 4, titleY);
    film.save();
    film.shadowColor = 'rgba(243,230,0,.45)';
    film.shadowBlur = 36;
    film.fillStyle = FILM_YELLOW;
    film.fillText(card.title, w / 2 + sp / 2, titleY);
    film.restore();
    const subSize = Math.round(h * 0.032);
    film.font = `400 ${subSize}px ${FILM_FONT}`;
    const sp2 = spaced(film, subSize * 0.12);
    film.fillStyle = '#cbb89a';
    film.fillText(card.sub.toUpperCase(), w / 2 + sp2 / 2, titleY + subSize * 2.1, w * 0.9);
    spaced(film, 0);
  }

  /** Whose game it is: his character on the left, the name on the right. */
  /**
   * A line of film credits: the job small and spaced out, the name under it —
   * and for the two who made it, their character beside it.
   */
  function paintCredit(card: ReelCard): void {
    const w = FILM_W;
    const h = FILM_H;
    const pic = makerIn(card.title);
    if (pic) {
      framed(pic, PIC.x, PIC.y, PIC.w, PIC.h);
      const x = PIC.x + PIC.w + w * 0.06;
      const room = w - x - w * 0.06;
      film.textAlign = 'left';
      const role = Math.round(h * 0.034);
      film.font = `500 ${role}px ${FILM_FONT}`;
      spaced(film, role * 0.22);
      film.fillStyle = '#9fb0c4';
      // The job can be long ("the simulation, the venue, ..."): two lines rather than squeezed.
      const lines = wrap(card.sub.toUpperCase(), room);
      lines.forEach((ln, i) => film.fillText(ln, x, h * 0.44 - (lines.length - 1 - i) * role * 1.5, room));
      spaced(film, 0);
      const big = Math.round(h * 0.085);
      film.font = `600 ${big}px ${FILM_FONT}`;
      film.fillStyle = '#f2efe8';
      film.fillText(card.title, x, h * 0.44 + big * 1.35, room);
      return;
    }
    const small = Math.round(h * 0.034);
    film.font = `500 ${small}px ${FILM_FONT}`;
    const sp = spaced(film, small * 0.22);
    film.fillStyle = '#9fb0c4';
    film.fillText(card.sub.toUpperCase(), w / 2 + sp / 2, h * 0.42, w * 0.86);
    spaced(film, 0);
    const big = Math.round(h * 0.085);
    film.font = `600 ${big}px ${FILM_FONT}`;
    film.fillStyle = '#f2efe8';
    if (/\b(Voxxy|Droid|Biggy)\b/.test(card.title)) {
      film.textAlign = 'left';
      const width = film.measureText(card.title).width;
      robotInk(card.title, (w - Math.min(width, w * 0.86)) / 2, h * 0.42 + big * 1.45, big, w * 0.86, '600', '#f2efe8');
    } else {
      film.fillText(card.title, w / 2, h * 0.42 + big * 1.45, w * 0.86);
    }
  }

  /**
   * `text` at the film's current font, as one line if it fits `maxW` and as two
   * otherwise — broken at the space that makes the two most nearly even.
   */
  function wrap(text: string, maxW: number): string[] {
    if (film.measureText(text).width <= maxW) return [text];
    const words = text.split(' ');
    let at = 1;
    let widest = Infinity;
    for (let i = 1; i < words.length; i++) {
      const wd = Math.max(film.measureText(words.slice(0, i).join(' ')).width, film.measureText(words.slice(i).join(' ')).width);
      if (wd < widest) {
        widest = wd;
        at = i;
      }
    }
    return [words.slice(0, at).join(' '), words.slice(at).join(' ')];
  }

  /**
   * `text` from `x` (left-aligned), with each robot's name in its own lamp's
   * colour — the three candles on the cake, the three beams in the dark.
   */
  function robotInk(text: string, x: number, y: number, size: number, maxW: number, weight = '400', ink = '#9fb0c4'): void {
    film.save();
    film.textAlign = 'left';
    film.font = `${weight} ${size}px ${FILM_FONT}`;
    const full = film.measureText(text).width;
    const k = full > maxW ? maxW / full : 1;
    film.translate(x, y);
    film.scale(k, 1);
    let at = 0;
    for (const part of text.split(/\b(Voxxy|Droid|Biggy)\b/)) {
      if (!part) continue;
      film.fillStyle = ROBOT_INK[part] ?? ink;
      film.fillText(part, at, 0);
      at += film.measureText(part).width;
    }
    film.restore();
  }

  /** The middle of the stage's apron, sim px, from the `stage` prop — until it is seen, Room 8's front. */
  const stageMid = { x: r8.x + r8.w / 2, y: r8.y + 44 };

  /** Floor height under a sim point, from the chapter's plates (the rake, when on). */
  let plates: readonly Plate[] = [];
  const hAt = (x: number, y: number): number => riseAt(x, y, plates);

  /*
   * THE RAKE (`KEYNOTE_RAKE`): the cross-aisle behind the seats at corridor
   * level, the rows stepping down to the pit, the stage a platform standing in
   * it — built from the chapter's own plates on the first frame that has them.
   */
  let rakeBuilt = false;
  function buildRake(props: Prop[]): void {
    const rows = props.filter((p) => p.kind === 'seatrow');
    if (!rows.length) return;
    const seatY0 = rows[0].y;
    const seatY1 = rows[0].y + (rows[0].h ?? 0);
    const r8y = r8.y;
    const carpet = mats.carpetRed;
    const riser = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
    // The cross-aisle, corridor level.
    group.add(new THREE.Mesh(box(x1 - x0, 0.2, m(r8.y + r8.h - seatY1), V(cx, -0.1, (m(seatY1) + z1) / 2), 3), carpet));
    // The rows: one slab per tread of the sim's rake plate (`Plate.steps`), each
    // from its tread down to the pit, so what stands on a row stands on it.
    const plate = plates.find((q) => q.kind === 'rake');
    const N = plate?.steps ?? Math.round((seatY1 - seatY0) / 18);
    for (let i = 0; i < N; i++) {
      const ya = seatY0 + ((seatY1 - seatY0) * i) / N;
      const yb = seatY0 + ((seatY1 - seatY0) * (i + 1)) / N;
      const h = -RAKE_DEPTH * (1 - (i + 1) / N);
      const slab = new THREE.Mesh(box(x1 - x0, h + RAKE_DEPTH + 0.02, m(yb - ya), V(cx, (h - RAKE_DEPTH) / 2, m((ya + yb) / 2)), 3), carpet);
      slab.receiveShadow = true;
      group.add(slab);
      // A dark nosing line on each riser, and step lights up both aisles.
      group.add(new THREE.Mesh(box(x1 - x0, 0.03, 0.03, V(cx, h + 0.005, m(ya))), riser));
    }
    // The pit floor, from the stage wall to the first row.
    group.add(new THREE.Mesh(box(x1 - x0, 0.2, m(seatY0 - r8y), V(cx, -RAKE_DEPTH - 0.1, m((r8y + seatY0) / 2)), 3), carpet));
    // The side walls come down into the pit, and so does the drape behind the
    // stage: it stopped at corridor level, and under it the wings looked out
    // at the city (Michele, 29 Sep: "seeing through the room 8 wall").
    for (const wx of [x0 + 0.06, x1 - 0.06]) group.add(new THREE.Mesh(box(0.1, RAKE_DEPTH, z1 - z0, V(wx, -RAKE_DEPTH / 2, (z0 + z1) / 2)), mats.acoustic));
    const pitDrape = new THREE.Mesh(box(x1 - x0 - 0.1, RAKE_DEPTH, 0.12, V(cx, -RAKE_DEPTH / 2, z0 + 0.1)), mats.drape);
    pitDrape.receiveShadow = true;
    group.add(pitDrape);
    // A balcony rail along the front of the cross-aisle, as in the photograph —
    // over the seat blocks only, on posts, so the two aisles stay open. It ran
    // the room's full width, across the aisles the robots walk down (Michele,
    // 29 Sep: "there's this metal thing").
    const railZ = m(seatY1) + 0.05;
    for (const r of rows) {
      const a = m(r.x) + 0.15;
      const b = m(r.x + (r.w ?? 0)) - 0.15;
      if (b - a < 0.5) continue;
      group.add(new THREE.Mesh(box(b - a, 0.05, 0.05, V((a + b) / 2, 1.0, railZ)), mats.steel));
      const posts = Math.max(2, Math.round((b - a) / 1.5) + 1);
      for (let k = 0; k < posts; k++) group.add(new THREE.Mesh(box(0.04, 1.0, 0.04, V(a + ((b - a) * k) / (posts - 1), 0.5, railZ)), mats.steel));
    }
    rakeBuilt = true;
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
          const mm = new THREE.Matrix4().compose(V(m(x), hAt(x, y), m(y) + 0.1), new THREE.Quaternion(), V(0.9, 1, 1));
          at.push(mm);
        }
        dots.push(V(m(p.x) + 0.1, hAt(p.x, y) + 0.06, m(y)), V(m(bx1) - 0.1, hAt(bx1, y) + 0.06, m(y)));
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
    // Raked: a platform STAGE_RISE up out of the pit, its front face black.
    const floorY = rake ? -RAKE_DEPTH : 0;
    const topY = rake ? -RAKE_DEPTH + STAGE_RISE : DAIS;
    const deck = new THREE.Mesh(box(w, topY - floorY, d, V(sx, (topY + floorY) / 2, sz)), mats.blackGloss);
    deck.receiveShadow = true;
    o.add(deck);
    // An LED edge along the front of the stage: orange, green when it is ready.
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.1).multiplyScalar(5), toneMapped: false });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.05), edgeMat);
    edge.position.set(sx, topY, sz + d / 2);
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
    lect.position.set(sx + w / 2 - 0.9, topY - DAIS, m(p.y) + 0.6);
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
    const y = (rake ? -RAKE_DEPTH + STAGE_RISE : DAIS) + 0.004;
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

  function spotlight(p: Prop): THREE.Object3D {
    // A floor PAR can on a yoke, aimed at the stage, with its number on the base.
    const o = new THREE.Group();
    const x = m(p.x);
    const z = m(p.y);
    o.position.set(x, hAt(p.x, p.y), z);
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
    /*
     * AIMED WHEN IT IS LIT, AND SEEN TO BE. Michele, 29 Sep 2026, in the raked
     * room: *"When activated we should roll it and point in the right direction."*
     * Unlit, the can hangs tipped down on its yoke, nose to the carpet, the way a
     * floor can is left when nobody has set it; lit, it swings up and round onto
     * its own quarter of the stage (`update`) — four beams on one point made a
     * white-out over the old banner, where the #DEVOXX sign now stands.
     *
     * The aim is 1.2 m over the STAGE's floor, which with the rake on is the pit
     * floor plus `STAGE_RISE`: it used to be 1.2 m over the can's own base, and a
     * can on a tread three rows up aimed over the three robots' heads.
     *
     * And the can itself pointed the wrong way all along: `lookAt` takes a WORLD
     * point, and it was handed one in `o`'s frame — so every can faced the far
     * corner of the building while its beam, a child of `o`, lit the stage. `o`
     * has no parent yet, so its world frame is its own position; the yoke is aimed
     * at the stage point itself.
     */
    const stageTop = rake ? -RAKE_DEPTH + STAGE_RISE : DAIS;
    const stageAt = V(cx + (x - cx) * 0.35, stageTop + 1.2, m(r8.y + 45));
    const local = stageAt.clone().sub(o.position);
    o.add(yoke);
    yoke.lookAt(stageAt);
    const aim = yoke.quaternion.clone();
    // At rest: the same heading, the nose down on the carpet in front of it.
    const pivot = o.position.clone().add(yoke.position);
    yoke.lookAt(pivot.add(V(local.x, 0, local.z).normalize().multiplyScalar(0.3)).add(V(0, -0.6, 0)));
    const rest = yoke.quaternion.clone();
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
    L.target.position.copy(local);
    o.userData = { lens: lensMat, ring, ringMat, light: L, yoke, rest, aim, litAt: -1 };
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
      o.position.set(m(p.x + (p.w ?? 0) / 2), hAt(p.x + (p.w ?? 0) / 2, p.y + (p.h ?? 0) / 2) + (rake ? 0.004 : DAIS), m(p.y + (p.h ?? 0) / 2));
      o.rotation.y = yawFromSimHeading(Math.PI / 2);
      g = { o, mat };
      gapObjs.set(slot, g);
      group.add(o);
    }
    return g;
  }
  /** One frame of the sign: every letter where the sim has it, every empty gap waiting. */
  function poseSign(snap: GameSnapshot, t: number): void {
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
          /*
           * Where the SIM says it is — out in front of him and never inside a wall
           * (`carryPoint`, src/sim/letters.ts) — and his hands are brought to it
           * (`holdLetter`, reach3d.ts), not it to them. It used to ride wherever
           * the canned carry put his hands, 0.89 m out whatever was there: Michele,
           * 29 Sep, *"letters (and droid's arm) through the wall"*.
           *
           * Lifted clear of the carpet off the floor DROID is standing on (the pit,
           * a tread or the stage, raked), not the floor under the letter, which can
           * be a tread further down the rake than his feet.
           */
          const d = snap.bots.find((b) => b.kind === 'droid');
          const fy = (d ? hAt(d.x, d.y) : hAt(p.x, p.y)) + LETTER_HELD_LIFT_M;
          o.position.set(m(p.x), fy, m(p.y));
        } else {
          // In the sign it stands on the dais; in the wing, on the carpet, tipped
          // back against the wall from its bottom edge.
          const inSign = p.state === 'done';
          const lx = p.x + (p.w ?? 0) / 2;
          const ly = p.y + (p.h ?? 0) / 2;
          // The stage's own height when raked (a plate), the dais when flat.
          o.position.set(m(lx), hAt(lx, ly) + (inSign && !rake ? DAIS : 0), m(ly));
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
      case 'cake': {
        // The camera treats it as an obstacle: it filled the frame in front of
        // Voxxy at the lab tables (critic round, 29 Sep).
        const c = cakeTrolley(p, mats);
        colliders.push(c);
        return c;
      }
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
    screenView(aspect: number, fovDeg: number): Shot {
      // Straight on, the bezel and a margin just inside the frame both ways.
      const half = THREE.MathUtils.degToRad(fovDeg) / 2;
      const d = Math.max(((SCREEN_W + 0.3) * 1.06) / 2 / (Math.tan(half) * aspect), ((SCREEN_H + 0.3) * 1.06) / 2 / Math.tan(half));
      const y = SCREEN_BOTTOM + SCREEN_H / 2;
      return { pos: V(cx, y, z0 + 0.2 + d), look: V(cx, y, z0 + 0.2) };
    },
    stageView(): Shot {
      // From the front rows: the three on the apron low in the frame, the screen
      // over them, the final card (centred, in the HUD) between the two.
      const floor = hAt(stageMid.x, stageMid.y);
      return {
        pos: V(cx, floor + STAGE_EYE.h, m(stageMid.y) + STAGE_EYE.back),
        look: V(cx, floor + STAGE_EYE.look, m(stageMid.y)),
      };
    },
    update(snap: GameSnapshot, t: number, _dt: number): void {
      plates = snap.plates ?? [];
      if (rake && !rakeBuilt) buildRake(snap.props);
      if (!seatsBuilt && snap.props.some((p) => p.kind === 'seatrow')) {
        buildSeatBlocks(snap.props);
        seatsBuilt = true;
      }
      let ready = false;
      poseSign(snap, t);
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
            // Where the three stand for the curtain call: the apron line (ch4-keynote.ts `marks`).
            stageMid.x = p.x + (p.w ?? 0) / 2;
            stageMid.y = p.y + (p.h ?? 0) - 12;
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
            o.position.set(m(p.x), hAt(p.x, p.y), m(p.y));
            for (const [i, f] of (o.userData.flames as THREE.Mesh[]).entries()) f.scale.set(1, 1.6 + 0.3 * Math.sin(t * 13 + i * 2), 1);
            break;
          }
          case 'spotlight': {
            const u = o.userData as {
              lens: THREE.MeshBasicMaterial;
              ring: THREE.Mesh;
              ringMat: THREE.MeshBasicMaterial;
              light: THREE.SpotLight;
              yoke: THREE.Group;
              rest: THREE.Quaternion;
              aim: THREE.Quaternion;
              litAt: number;
            };
            // Lit: the can swings up onto the stage, and the beam comes on as it
            // gets there rather than sweeping the house on the way.
            if (done && u.litAt < 0) u.litAt = t;
            if (!done) u.litAt = -1;
            const k = u.litAt < 0 ? 0 : Math.min(1, (t - u.litAt) / SPOT_SWING);
            u.yoke.quaternion.slerpQuaternions(u.rest, u.aim, 1 - (1 - k) ** 3);
            const beam = THREE.MathUtils.smoothstep(k, 0.7, 1);
            u.lens.color.setRGB(1, 0.95, 0.85).multiplyScalar(done ? 0.06 + 13.94 * beam : 0.06);
            u.light.intensity = 700 * beam;
            u.ring.visible = p.state === 'active';
            u.ringMat.opacity = 0.55 + 0.45 * Math.sin(t * 5);
            break;
          }
        }
      }
      // The house screen: the film while it plays, else the holding slide.
      const reel = snap.reel;
      if (reel) {
        // The photograph is taken in the film's first dark seconds, not on the
        // frame the first credit comes up.
        if (portraits === null) {
          const got = new Map<string, HTMLCanvasElement>();
          for (const name of SECOND_ROW) {
            const pic = photo?.(name);
            if (pic) got.set(name, pic);
          }
          portraits = got;
        }
        const key = `r|${reel.index}|${reel.card ? reel.card.title : ''}`;
        if (key !== scrKey) {
          scrKey = key;
          paintCard(reel.card);
        }
        scrMat.map = filmTex;
        scrMat.color.setScalar(SCREEN_GAIN * (reel.card ? Math.min(1, reel.alpha) : 0));
      } else {
        scrMat.map = scrTex;
        scrMat.color.setScalar(SCREEN_GAIN);
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

/** How thick the trolley's rubber bumper is, m. Its OUTSIDE is the cake's radius. */
const CAKE_BUMPER_M = 0.04;

/**
 * Chapter 4's cake on its trolley: a round wheeled board with a three-tier Devoxx
 * cake on it and three candles in the robots' colours. `userData.flames` are the
 * flames, for `update` to flicker.
 *
 * THE BOARD IS THE SIM'S DISC, EDGE FOR EDGE. Michele, 29 Sep 2026, with a
 * screenshot of Biggy shoving it down the corridor with daylight between them:
 * *"cake is pushed from too far"*. Most of that daylight was the sim — the push
 * reached 1.28 m past touching (`CAKE_TOUCH`, ch4-keynote.ts) — but not all of
 * it. The board was a square 1.7 radii across: its sides stood 2.55 px (20 cm)
 * inside the circle the sim collides with, a gap even on a dead-square push, and
 * its corners 3.2 px outside it, where a robot touching the circle was drawn
 * standing in the board. Round, at the prop's own radius, is the one shape where
 * touching the cake and touching the trolley are the same thing from every side
 * — and a round dolly on four castors is what a cake this size is wheeled in on.
 *
 * The rubber bumper is the edge, with its outside exactly on that radius; the
 * castors are tucked in under the deck, where the old square's corners had them
 * poking out past it. `tests/cake-push.test.ts` measures the built mesh.
 */
export function cakeTrolley(p: Prop, mats: Pick<Materials, 'darkMetal' | 'rubber' | 'steel'>): THREE.Group {
  const o = new THREE.Group();
  const R0 = m((p.w ?? 34) / 2);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(R0 - CAKE_BUMPER_M, R0 - CAKE_BUMPER_M, 0.12, 48), mats.darkMetal);
  deck.position.y = 0.22;
  const bumper = new THREE.Mesh(new THREE.TorusGeometry(R0 - CAKE_BUMPER_M, CAKE_BUMPER_M, 8, 64), mats.rubber);
  bumper.rotation.x = Math.PI / 2;
  bumper.position.y = 0.22;
  o.add(deck, bumper);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const wx = Math.cos(a) * R0 * 0.7;
    const wz = Math.sin(a) * R0 * 0.7;
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), mats.rubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.08, wz);
    const fork = new THREE.Mesh(box(0.04, 0.14, 0.1, V(wx, 0.16, wz)), mats.steel);
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

/** Duke on a canvas: black wedge, white lower half, red nose, one arm waving. `x, y` is his feet. */
function drawDuke(g: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  const w = h * 0.62;
  g.save();
  g.beginPath();
  g.moveTo(x, y - h);
  g.bezierCurveTo(x + w * 0.35, y - h * 0.7, x + w * 0.55, y - h * 0.25, x + w * 0.5, y);
  g.lineTo(x - w * 0.5, y);
  g.bezierCurveTo(x - w * 0.55, y - h * 0.25, x - w * 0.35, y - h * 0.7, x, y - h);
  g.closePath();
  g.fillStyle = '#111214';
  g.fill();
  g.clip();
  g.fillStyle = '#f4f2ee';
  g.fillRect(x - w, y - h * 0.44, w * 2, h * 0.44);
  g.restore();
  g.fillStyle = '#d8231c';
  g.beginPath();
  g.arc(x, y - h * 0.45, h * 0.12, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#111214';
  g.lineWidth = h * 0.06;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x + w * 0.42, y - h * 0.4);
  g.lineTo(x + w * 0.85, y - h * 0.75);
  g.moveTo(x - w * 0.42, y - h * 0.35);
  g.lineTo(x - w * 0.7, y - h * 0.12);
  g.stroke();
  g.fillStyle = '#f4f2ee';
  for (const [hx, hy] of [
    [x + w * 0.85, y - h * 0.75],
    [x - w * 0.7, y - h * 0.12],
  ]) {
    g.beginPath();
    g.arc(hx, hy, h * 0.06, 0, Math.PI * 2);
    g.fill();
  }
}
