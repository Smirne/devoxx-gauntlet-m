/**
 * props-ground.ts — chapter 2's moving parts, drawn from `GameSnapshot.props`.
 *
 * The same contract as `props3d.ts`: each prop is built from its rect the first
 * time the sim publishes it and afterwards only READ — its `state`, `progress`,
 * `v`, `label` and `pts`. The chain the chapter is about (breakers → cabinet →
 * router → password → lights → cable → printer; Biggy's roller door) is all in
 * those fields, so nothing here decides anything.
 *
 * One colour language for every state, the one the 2.5D build uses: dark while
 * `idle`, amber `active` ("something is running here"), green `done`, red
 * `broken`/`shut` where a thing is waiting for a robot.
 */

import * as THREE from 'three';

import { CFP_WALL, GF, WIFI_TAG, groundPlates, groundRiseM, groundWallsFor } from '../sim/geometry';
import { BELT_H, GATE_H, beltU, nastriRun } from '../sim/nastri';
import type { Prop, Wall } from '../sim/types';
import { PX_PER_M, ROBOT_HEIGHT_M, m } from '../sim/units';

import type { Materials } from './materials';
import { box } from './materials';
import { CLICK_U, PORT_LOCAL, counterLip, plugHand, printerPort } from './plug';
import { poseShutter, rollerShutter } from './shutter';
import { cfpBoard, emitter, wayfinding } from './signs';
import { PULL_END, pullAt, reachClock, registerGrip } from './reach3d';

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** The ladle's grip-to-bowl length, metres (`makeLadle`); `world.ts` stands it in a pot by it. */
export const LADLE_REACH = 0.62;

/** The state palette, linear RGB before intensity. */
const STATE_RGB: Record<string, [number, number, number]> = {
  idle: [0.25, 0.28, 0.32],
  active: [1, 0.55, 0.08],
  done: [0.15, 1, 0.35],
  broken: [1, 0.08, 0.05],
  shut: [1, 0.08, 0.05],
  taut: [1, 0.08, 0.05],
  open: [0.15, 1, 0.35],
};
function stateColour(state: string | undefined, out: THREE.Color, k = 1): THREE.Color {
  const c = STATE_RGB[state ?? 'idle'] ?? STATE_RGB.idle;
  return out.setRGB(c[0] * k, c[1] * k, c[2] * k);
}

function glowMat(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
}

/*
 * SIGNS ARE PLANKS ON WALLS — no posts. Michele, 29 Sep, on the technical room's
 * sign, sunk half into the curtain beside its door: *"no more signs with a post,
 * put a plank on the wall or something.. We tried to fix this like 4 time."*
 *
 * The four tries each guessed where the wall was from the sign's own rect. This
 * one asks the walls: every face of every wall the hall draws solid and full
 * height is a candidate, the sim's sign picks the nearest face on its own side
 * (it may stand inside the wall's thickness, which is how the technical room's
 * sign missed its wall every time), and the plank slides along that face until
 * all of it is on solid wall, never across a doorway, and nothing else stands
 * in front of it. A sign out in the open, with no wall in reach, keeps its
 * post (Michele: "you can keep the post sign in other parts of the game, but
 * check that they read correctly").
 */
/** The plank's face, m. */
const PLANK_L = 1.6;
const PLANK_H = 0.8;
/** Centre height of a plank, on a wall or on a post, m. */
const PLANK_Y = 2.3;
/**
 * How far, px, a sign may move to reach its wall, across the face or along it:
 * two metres. Further, and a queue's sign ends up on the far side of the aisle.
 */
const PLANK_REACH = 25;
/**
 * Wall kinds with no face to hang a plank on: short (`totem`, `crate`, `rack`,
 * `bof-slats`), or not drawn as a wall at all in the 3D hall (see `styleOf` in
 * ground3d.ts — the red accent panels, the desk, the facade and the rest).
 */
const NO_FACE = new Set(['totem', 'crate', 'rack', 'bof-slats', 'stair-foot', 'accent-panel', 'mainstair', 'duke', 'high-table', 'fridge', 'desk', 'facade', 'mullion', 'door-leaf']);
const hasFace = (wl: Wall): boolean => !wl.low && !wl.hidden && !wl.glass && !wl.booth && !NO_FACE.has(wl.kind ?? '');

/** Where a sign's plank goes: its centre on the wall face, px, and the face's outward normal. */
export interface PlankMount {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/** The wall face a sign hangs on, or null when there is none within `PLANK_REACH`. */
export function plankMount(p: Prop, walls: readonly Wall[]): PlankMount | null {
  const pw = p.w ?? 10;
  const ph = p.h ?? 10;
  const sx = p.x + pw / 2;
  const sy = p.y + ph / 2;
  // The sim draws a sign thin across the way it faces; a sign set into a wall's
  // thickness, which could face either side, says which with `face`.
  const facesX = pw < ph;
  const want = p.face === undefined ? null : ([Math.round(Math.cos(p.face)), Math.round(Math.sin(p.face))] as const);
  const half = (PLANK_L / 2) * PX_PER_M + 1;
  const solid = walls.filter(hasFace);
  // Anything drawn, short or glass included, can stand in front of a face.
  const blockers = walls.filter((o) => !o.hidden && !o.low && o.kind !== 'accent-panel');
  let best: PlankMount | null = null;
  let bestScore = Infinity;
  for (const wl of solid) {
    for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (want && (want[0] !== nx || want[1] !== ny)) continue;
      const alongX = ny !== 0;
      // The plank reads the way the sim drew the sign, or it is not this face.
      if (alongX === facesX) continue;
      // The face's plane, and the span along it.
      const plane = nx > 0 ? wl.x + wl.w : nx < 0 ? wl.x : ny > 0 ? wl.y + wl.h : wl.y;
      const lo = alongX ? wl.x : wl.y;
      const hi = alongX ? wl.x + wl.w : wl.y + wl.h;
      if (hi - lo < 2 * half) continue;
      // The sign must be on this face's side of the wall's centre line...
      const mid = alongX ? wl.y + wl.h / 2 : wl.x + wl.w / 2;
      const s = alongX ? sy : sx;
      if (!want && (s - mid) * (nx + ny) <= 0) continue;
      // ...no further out than the reach, and no further in than this wall's
      // own thickness: a sign set into the wall is fine, one behind it is not.
      const out = (s - plane) * (nx + ny);
      if (out > PLANK_REACH || out < -(alongX ? wl.h : wl.w) - 1) continue;
      const a0 = alongX ? sx : sy;
      const a = Math.min(Math.max(a0, lo + half), hi - half);
      if (Math.abs(a - a0) > PLANK_REACH) continue;
      // Nothing drawn may stand in the 2 px in front of the plank.
      const fx0 = alongX ? a - half : nx > 0 ? plane : plane - 2;
      const fx1 = alongX ? a + half : nx > 0 ? plane + 2 : plane;
      const fy0 = alongX ? (ny > 0 ? plane : plane - 2) : a - half;
      const fy1 = alongX ? (ny > 0 ? plane + 2 : plane) : a + half;
      if (blockers.some((o) => o !== wl && o.x < fx1 && o.x + o.w > fx0 && o.y < fy1 && o.y + o.h > fy0)) continue;
      const score = Math.max(0, out) + Math.abs(a - a0);
      if (score < bestScore) {
        bestScore = score;
        best = alongX ? { x: a, y: plane, nx, ny } : { x: plane, y: a, nx, ny };
      }
    }
  }
  return best;
}

function canvasText(lines: string[], opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string } = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = opts.w ?? 512;
  c.height = opts.h ?? 128;
  const x = c.getContext('2d')!;
  x.fillStyle = opts.bg ?? '#000';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = opts.fg ?? '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const fs = Math.floor(c.height / (lines.length + 0.6));
  x.font = opts.font ?? `bold ${fs}px "Helvetica Neue", Arial, sans-serif`;
  lines.forEach((l, i) => x.fillText(l, c.width / 2, (c.height * (i + 0.8)) / (lines.length + 0.6)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The spray tag on the hall's north wall: Michele's own wording (25 Sep). */
function sprayTag(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1536;
  c.height = 384;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#fff';
  x.fillStyle = '#fff';
  x.lineCap = 'round';
  // The wifi symbol: three arcs and a dot, sprayed.
  const cx = 190;
  const cy = 250;
  for (const [r, w] of [
    [150, 26],
    [100, 24],
    [52, 22],
  ]) {
    x.lineWidth = w;
    x.beginPath();
    x.arc(cx, cy, r, -Math.PI * 0.78, -Math.PI * 0.22);
    x.stroke();
  }
  x.beginPath();
  x.arc(cx, cy, 18, 0, Math.PI * 2);
  x.fill();
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  x.font = 'bold 150px "Marker Felt", "Comic Sans MS", "Trebuchet MS", sans-serif';
  x.shadowColor = '#fff';
  x.shadowBlur = 10;
  x.fillText('DevoxxForever', 370, 170);
  x.font = 'italic 64px "Marker Felt", "Comic Sans MS", "Trebuchet MS", sans-serif';
  x.fillText("(And no, you can't change it)", 400, 300);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PLATES = groundPlates();
/**
 * The top of whatever is drawn at sim (x, y) on the ground floor, metres: the
 * lobby, or a tread of a flight as `ground3d.ts`'s `stepsFor` draws it (each
 * tread at the height of its higher edge). The cable ran at 0 or 0.5 m and
 * disappeared into the small staircase (Michele, 28 Sep: "at a certain point
 * the cable vanished, while crossing the stairs").
 */
function floorTop(x: number, y: number): number {
  let top = 0;
  for (const p of PLATES) {
    if (p.rot || x < p.x || x > p.x + p.w || y < p.y || y > p.y + p.h) continue;
    const hi = p.hi ?? p.lo;
    if (hi === p.lo) {
      top = Math.max(top, p.lo);
      continue;
    }
    const n = Math.max(3, Math.round(Math.abs(hi - p.lo) / 0.17));
    const u = p.axis === 'y' ? (y - p.y) / p.h : (x - p.x) / p.w;
    const i = Math.min(n - 1, Math.max(0, Math.floor(u * n)));
    const at = (v: number): number => p.lo + (hi - p.lo) * v;
    top = Math.max(top, at(i / n), at((i + 1) / n));
  }
  return top;
}

export interface GroundProps {
  /** A stable identity for props that move (the pot on Biggy, the duck, a beer crate). */
  key?(p: Prop): string | undefined;
  build(p: Prop): THREE.Object3D | null;
  update(o: THREE.Object3D, p: Prop, t: number, dt: number): void;
  colliders: THREE.Object3D[];
}

export function createGroundProps(mats: Materials, colliders: THREE.Object3D[]): GroundProps {
  const tmp = new THREE.Color();
  let tagTex: THREE.CanvasTexture | null = null;

  function build(p: Prop): THREE.Object3D | null {
    const pw = p.w ?? 10;
    const ph = p.h ?? 10;
    const cx = m(p.x + pw / 2);
    const cz = m(p.y + ph / 2);
    const w = m(pw);
    const d = m(ph);
    const g = new THREE.Group();
    switch (p.kind) {
      case 'breaker': {
        // The distribution board, high on the technical room's wall — too high
        // for anyone but Droid, which is the point of it. A grey steel enclosure
        // with its door swung open, rows of DIN breakers, a 400 V warning, the
        // conduits up to the ceiling, and three red main isolators: the three
        // the sim counts, thrown one by one as Droid's hand arrives on each.
        // It was a rusty slab with three blocks on it (Michele: "polish this").
        g.position.set(cx, 0, cz);
        // On the technical room's north wall itself; the sim's rect stands 8 px off it.
        const back = m(GF.tech.y) - cz;
        const grey = new THREE.MeshStandardMaterial({ color: 0x7d8288, roughness: 0.45, metalness: 0.55 });
        const bw = Math.min(w * 0.9, 1.6);
        const Y = 2.45;
        const box0 = new THREE.Mesh(box(bw, 1.2, 0.24, V(0, Y, back + 0.12)), grey);
        box0.castShadow = true;
        g.add(box0);
        // Inside face, a shade darker, and three rows of small breakers.
        g.add(new THREE.Mesh(box(bw - 0.08, 1.12, 0.01, V(0, Y, back + 0.245)), mats.darkMetal));
        const din = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.6 });
        const toggle = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.5 });
        const n = Math.floor((bw - 0.2) / 0.06);
        for (let r = 0; r < 3; r++) {
          const ry = Y + 0.4 - r * 0.2;
          g.add(new THREE.Mesh(box(bw - 0.16, 0.02, 0.03, V(0, ry - 0.07, back + 0.26)), mats.steel));
          for (let i = 0; i < n; i++) {
            const bx = -((n - 1) * 0.06) / 2 + i * 0.06;
            g.add(new THREE.Mesh(box(0.05, 0.12, 0.05, V(bx, ry, back + 0.27)), din));
            g.add(new THREE.Mesh(box(0.018, 0.03, 0.02, V(bx, ry + ((i * 7 + r) % 5 === 0 ? -0.02 : 0.02), back + 0.3)), toggle));
          }
        }
        // The door, swung open about 110° on its left hinge.
        const hinge = new THREE.Group();
        hinge.position.set(-bw / 2, Y, back + 0.24);
        hinge.rotation.y = -1.9;
        const door = new THREE.Mesh(box(bw, 1.2, 0.03, V(bw / 2, 0, 0)), grey);
        door.castShadow = true;
        hinge.add(door);
        const warn = new THREE.Mesh(
          new THREE.PlaneGeometry(0.34, 0.3),
          new THREE.MeshStandardMaterial({ map: canvasText(['\u26A1', '400 V'], { w: 128, h: 112, bg: '#f2c318', fg: '#111' }), roughness: 0.6 }),
        );
        warn.position.set(bw / 2, 0.2, -0.02);
        warn.rotation.y = Math.PI;
        hinge.add(warn);
        g.add(hinge);
        // Conduits up to the ceiling.
        for (const cxo of [-bw * 0.3, 0, bw * 0.3]) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.2, 8), mats.steel);
          c.position.set(cxo, Y + 0.6 + 2.1, back + 0.08);
          g.add(c);
        }
        // The three main isolators: a housing each and a red handle on a pivot.
        const handles: THREE.Object3D[] = [];
        for (let i = 0; i < 3; i++) {
          const hx = (i - 1) * 0.42;
          g.add(new THREE.Mesh(box(0.2, 0.3, 0.1, V(hx, Y - 0.38, back + 0.3)), din));
          const pivot = new THREE.Group();
          pivot.position.set(hx, Y - 0.38, back + 0.36);
          const arm = new THREE.Mesh(box(0.05, 0.26, 0.05, V(0, 0.13, 0)), new THREE.MeshStandardMaterial({ color: 0xc1261c, roughness: 0.4 }));
          const grip = new THREE.Mesh(box(0.14, 0.05, 0.06, V(0, 0.26, 0)), new THREE.MeshStandardMaterial({ color: 0xc1261c, roughness: 0.4 }));
          // Where the palm closes: the middle of the grip. Droid's arm and this
          // handle turn on one clock (reach3d.ts), so the hand goes up with it.
          const gripAt = new THREE.Object3D();
          gripAt.position.y = 0.26;
          pivot.add(arm, grip, gripAt);
          g.add(pivot);
          handles.push(pivot);
          registerGrip(`breaker${i}`, { point: gripAt, throw: 'up', set: (k) => (pivot.rotation.x = Math.PI - k * Math.PI) });
        }
        const led = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.8, 0.04, 0.03), glowMat());
        led.position.set(0, Y + 0.56, back + 0.27);
        g.add(led);
        // The flash when a handle lands.
        const flash = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glowMat());
        flash.visible = false;
        g.add(flash);
        const lamp = new THREE.PointLight(0xffffff, 0, 3.5, 2);
        lamp.position.set(0, Y, back + 0.8);
        g.add(lamp);
        // The room's own light: a fluorescent batten under the ceiling, dead
        // until the supply lands, then striking on the way tubes do.
        const tubeMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
        const tube = new THREE.Mesh(box(1.4, 0.06, 0.1, V(m(GF.tech.x + GF.tech.w / 2) - cx, 3.15, m(GF.tech.y + GF.tech.h / 2) - cz)), tubeMat);
        const tubeLight = new THREE.PointLight(0xdfe8ff, 0, 9, 2);
        tubeLight.position.set(m(GF.tech.x + GF.tech.w / 2) - cx, 2.95, m(GF.tech.y + GF.tech.h / 2) - cz);
        g.add(tube, tubeLight);
        g.userData = { handles, led, lamp, flash, back, tubeMat, tubeLight, onAt: -1 };
        return g;
      }
      case 'rack-lights':
      case 'pilot': {
        // An annunciator strip: dark with no supply, amber, green.
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.08, Math.max(0.06, d * 0.5)), glowMat());
        strip.position.set(cx, p.kind === 'pilot' ? 2.15 : 2.2, cz);
        g.add(strip);
        const lamp = new THREE.PointLight(0xffffff, 0, 5, 2);
        lamp.position.set(cx, 2.1, cz + 0.4);
        g.add(lamp);
        g.userData = { strip, lamp };
        return g;
      }
      case 'rack': {
        // The carcass is a wall (built by ground3d); this is its face: rows of
        // link lights and a coiled patch lead on the shelf.
        const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, 1.7), glowMat());
        face.position.set(cx, 1.05, cz + d / 2 + 0.01);
        g.add(face);
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 128;
        const x = c.getContext('2d')!;
        x.fillStyle = '#000';
        x.fillRect(0, 0, 64, 128);
        for (let r = 0; r < 14; r++) for (let k = 0; k < 6; k++) if ((r * 7 + k * 3) % 4 !== 0) {
          x.fillStyle = '#fff';
          x.fillRect(6 + k * 9, 6 + r * 8.6, 4, 3);
        }
        const tex = new THREE.CanvasTexture(c);
        (face.material as THREE.MeshBasicMaterial).map = tex;
        (face.material as THREE.MeshBasicMaterial).transparent = true;
        (face.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
        // The cable reel in front of it, and a pulsing ring in Voxxy's orange:
        // "the cable starts here, and it is hers to take". Michele, 28 Sep: "the
        // cable rack should be more evident and hint at interaction".
        const reel = new THREE.Group();
        reel.position.set(cx, 0.42, cz + d / 2 + 0.55);
        const flangeMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a3, roughness: 0.8 });
        for (const sx of [-0.22, 0.22]) {
          const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28), flangeMat);
          fl.rotation.z = Math.PI / 2;
          fl.position.set(sx, 0, 0);
          fl.castShadow = true;
          reel.add(fl);
        }
        const coilMat = new THREE.MeshStandardMaterial({ color: 0x1a4cff, emissive: new THREE.Color(0.05, 0.15, 0.6), roughness: 0.45 });
        for (let i = 0; i < 5; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 28), coilMat);
          coil.rotation.y = Math.PI / 2;
          coil.position.set(-0.16 + i * 0.08, 0, 0);
          coil.userData.coil = true;
          reel.add(coil);
        }
        g.add(reel);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.62, 0.72, 40),
          new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(cx, 0.02, cz + d / 2 + 0.55);
        g.add(ring);
        const tag = emitter(canvasText(['CABLE \u00b7 VOXXY'], { w: 256, h: 48, bg: '#000', fg: '#fff', font: 'bold 28px Arial' }), 0.9, 0.17, 0, 0xff7a1a);
        tag.position.set(cx, 2.25, cz + d / 2 + 0.03);
        g.add(tag);
        g.userData = { face, reel, ring, tag };
        return g;
      }
      case 'printer': {
        // The badge printer, ON the reception counter. The desk stands on the
        // lobby, so its top is 1.05 m above the lobby floor, not the hall's; at
        // 1.05 m absolute the old box sat half inside the counter. A card
        // printer, a size up so it reads from the follow camera: a dark body, a
        // hopper of blank cards on its back, a slot in front, an LCD, and a tray
        // where printed badges stack up (Michele: "printer still to be refined").
        g.position.set(cx, groundRiseM(p.x + pw / 2) + 1.05, cz);
        const shell = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.2 });
        const trim = new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: 0.35, metalness: 0.5 });
        const body = new THREE.Mesh(box(0.72, 0.34, 0.55, V(0, 0.17, 0)), shell);
        body.castShadow = true;
        const lid = new THREE.Mesh(box(0.66, 0.06, 0.4, V(0, 0.37, -0.04)), trim);
        lid.castShadow = true;
        const hopper = new THREE.Mesh(box(0.3, 0.2, 0.2, V(0, 0.44, -0.2)), shell);
        const blanks = new THREE.Mesh(box(0.24, 0.12, 0.16, V(0, 0.5, -0.2)), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 }));
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.02), mats.darkMetal);
        slot.position.set(0, 0.2, 0.28);
        const tray = new THREE.Mesh(box(0.34, 0.015, 0.26, V(0, 0.08, 0.4)), trim);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), glowMat());
        led.position.set(0.3, 0.3, 0.28);
        const lcdCanvas = document.createElement('canvas');
        lcdCanvas.width = 128;
        lcdCanvas.height = 40;
        const lcdTex = new THREE.CanvasTexture(lcdCanvas);
        const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.065), new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false }));
        lcd.position.set(-0.2, 0.27, 0.278);
        // The badges: a pool that slides out of the slot and stacks on the tray.
        const card = document.createElement('canvas');
        card.width = 96;
        card.height = 128;
        const cx2 = card.getContext('2d')!;
        cx2.fillStyle = '#f4f1ea';
        cx2.fillRect(0, 0, 96, 128);
        cx2.fillStyle = '#f7931e';
        cx2.fillRect(0, 0, 96, 22);
        cx2.fillStyle = '#1b1b1b';
        cx2.font = 'bold 13px Arial';
        cx2.fillText('DEVOXX', 8, 15);
        cx2.fillRect(28, 40, 40, 40);
        cx2.font = 'bold 11px Arial';
        cx2.fillText('ATTENDEE', 20, 104);
        const cardMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(card), roughness: 0.55 });
        const badges: THREE.Mesh[] = [];
        for (let i = 0; i < 6; i++) {
          const bdg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.004, 0.14), cardMat);
          bdg.visible = false;
          g.add(bdg);
          badges.push(bdg);
        }
        g.add(body, lid, hopper, blanks, slot, tray, led, lcd);
        // The network socket on the east flank, where Voxxy's hand brings the plug
        // (`PORT_LOCAL`), with its own link light that comes on with the click.
        const socket = new THREE.Mesh(box(0.02, 0.055, 0.065, V(PORT_LOCAL.x - 0.012, PORT_LOCAL.y, PORT_LOCAL.z)), mats.darkMetal);
        const linkLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), glowMat());
        linkLed.position.set(PORT_LOCAL.x - 0.012, PORT_LOCAL.y + 0.05, PORT_LOCAL.z);
        const spark = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        spark.position.set(PORT_LOCAL.x + 0.03, PORT_LOCAL.y, PORT_LOCAL.z);
        g.add(socket, linkLed, spark);
        // A banner hung over the reception desk, so the goal of the cable run
        // reads from the hall: REGISTRATION, in Devoxx orange, double-faced.
        const rc = GF.reception;
        const bannerTex = canvasText(['REGISTRATION', 'BADGES'], { w: 512, h: 160, bg: '#f7931e', fg: '#141414' });
        const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, emissive: new THREE.Color(1, 1, 1), emissiveMap: bannerTex, emissiveIntensity: 0.1, side: THREE.DoubleSide });
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), bannerMat);
        const bx = m(rc.x + rc.w / 2) - cx;
        const bz = m(rc.y + rc.h / 2) - cz;
        banner.position.set(bx, 3.3 - (g.position.y - groundRiseM(rc.x + rc.w / 2)), bz);
        g.add(banner);
        for (const sx of [-1.3, 1.3]) {
          const wire = new THREE.Mesh(box(0.01, 3, 0.01, V(bx + sx, banner.position.y + 2, bz)), trim);
          g.add(wire);
        }
        g.userData = { led, linkLed, spark, badges, lcdCanvas, lcdTex, lcdText: '', bannerMat, onlineAt: undefined as number | undefined };
        return g;
      }
      case 'lane':
      case 'dropzone': {
        // A lit plate on the floor: the "come here" of this game.
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        plate.rotation.x = -Math.PI / 2;
        plate.position.set(cx, 0.015 + (p.x > 1045 ? 0.5 : 0), cz);
        g.add(plate);
        g.userData = { plate };
        return g;
      }
      case 'sign': {
        // A blue wayfinding plank in the venue's own signage, flat on the wall
        // the sim's sign stands at (`plankMount`), or on a post out in the open.
        const label = p.label ?? '';
        const [a, b] = label.includes('·') ? label.split('·').map((s) => s.trim()) : [label, ''];
        const tex = wayfinding(b ? [['', a], ['', b]] : [['', a]]);
        const face = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color(1, 1, 1), emissiveMap: tex, emissiveIntensity: 0.6 });
        const rim = new THREE.Mesh(new THREE.BoxGeometry(PLANK_L + 0.06, 0.05, 0.05), glowMat());
        const plank = new THREE.Group();
        const mount = plankMount(p, groundWallsFor(2));
        if (mount) {
          // Its back 2 cm off the face, turned to look out along the face's normal
          // — or on the reception's timber slats, which stand 10 cm proud of the
          // wardrobe wall they hang on (`reception` in ground3d.ts).
          const base = p.x > 1045 ? 0.5 : 0;
          const co = GF.coatroom;
          const rc = GF.reception;
          const onSlats = mount.ny > 0 && Math.abs(mount.y - (co.y + co.h)) < 0.5 && mount.x > rc.x && mount.x < rc.x + rc.w;
          const off = onSlats ? 0.11 : 0.02;
          plank.position.set(m(mount.x) + mount.nx * off, base + PLANK_Y, m(mount.y) + mount.ny * off);
          plank.rotation.y = Math.atan2(mount.nx, mount.ny);
          plank.add(new THREE.Mesh(box(PLANK_L + 0.06, PLANK_H + 0.06, 0.04, V(0, 0, 0.02)), mats.darkMetal));
          const f = new THREE.Mesh(new THREE.PlaneGeometry(PLANK_L, PLANK_H), face);
          f.position.z = 0.041;
          plank.add(f);
          rim.position.set(0, PLANK_H / 2 + 0.06, 0.025);
        } else {
          // Out in the open, with no wall to take it: a panel on a post, two
          // faces back to back so it reads the right way round from either side.
          const base = p.x > 1045 ? 0.5 : 0;
          const pw = p.w ?? 10;
          const ph = p.h ?? 10;
          plank.position.set(cx, base + PLANK_Y, cz);
          if (pw < ph) plank.rotation.y = Math.PI / 2;
          plank.add(new THREE.Mesh(box(PLANK_L + 0.06, PLANK_H + 0.06, 0.03, V(0, 0, 0)), mats.darkMetal));
          for (const yaw of [0, Math.PI]) {
            const f = new THREE.Mesh(new THREE.PlaneGeometry(PLANK_L, PLANK_H), face);
            f.rotation.y = yaw;
            f.position.z = yaw === 0 ? 0.016 : -0.016;
            plank.add(f);
          }
          plank.add(new THREE.Mesh(box(0.06, PLANK_Y - PLANK_H / 2, 0.06, V(0, -(PLANK_Y + PLANK_H / 2) / 2, 0)), mats.steel));
          rim.position.set(0, PLANK_H / 2 + 0.06, 0);
        }
        plank.add(rim);
        g.add(plank);
        g.userData = { rim, face, label };
        return g;
      }
      case 'cabinet': {
        // The router cabinet: a steel carcass on the technical room's wall with
        // two leaves, hinged at the outer edges, posed from the sim's swing.
        // Behind them, what Michele asked for (28 Sep: "the cabinet could contain
        // a rack and a big screen", "an old 56k modem would be appreciated"): a
        // 19-inch rack of blinking link lights, one big screen carrying both the
        // router's status and the password prompt, and a beige 56K modem on a
        // shelf whose front lamps come up with the supply.
        g.position.set(cx, 0, cz);
        const front = d * 0.3;
        const shell = new THREE.Group();
        shell.add(new THREE.Mesh(box(w, 2.1, d * 0.5, V(0, 1.05, -d * 0.25)), mats.darkMetal));
        for (const sx of [-1, 1]) shell.add(new THREE.Mesh(box(0.05, 2.1, front, V((sx * (w - 0.05)) / 2, 1.05, front / 2)), mats.darkMetal));
        shell.add(new THREE.Mesh(box(w, 0.06, front, V(0, 2.07, front / 2)), mats.darkMetal));
        shell.add(new THREE.Mesh(box(w, 0.1, front, V(0, 0.05, front / 2)), mats.darkMetal));
        for (const c of shell.children) c.castShadow = true;
        g.add(shell);
        // The rack, left: rails, eight units, and a strip of link lights each.
        const rackX = -w / 2 + 0.75;
        for (const sx of [-0.52, 0.52]) g.add(new THREE.Mesh(box(0.04, 1.8, 0.04, V(rackX + sx, 1.0, front * 0.6)), mats.steel));
        const leds = document.createElement('canvas');
        leds.width = 64;
        leds.height = 256;
        const ledTex = new THREE.CanvasTexture(leds);
        const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, color: 0x000000, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        for (let i = 0; i < 8; i++) {
          g.add(new THREE.Mesh(box(1.0, 0.17, 0.3, V(rackX, 0.25 + i * 0.2, front * 0.6 - 0.15)), i % 3 === 1 ? mats.steel : mats.blackGloss));
        }
        const ledFace = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), ledMat);
        ledFace.position.set(rackX, 0.95, front * 0.6 + 0.005);
        g.add(ledFace);
        // The big screen.
        const scrCanvas = document.createElement('canvas');
        scrCanvas.width = 768;
        scrCanvas.height = 432;
        const scrTex = new THREE.CanvasTexture(scrCanvas);
        scrTex.colorSpace = THREE.SRGBColorSpace;
        const bezel = new THREE.Mesh(box(2.3, 1.34, 0.06, V(0.1, 1.3, front * 0.55)), mats.blackGloss);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.24), new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false }));
        screen.position.set(0.1, 1.3, front * 0.55 + 0.032);
        g.add(bezel, screen);
        // The modem, right, on a shelf: beige, "56K", eight front lamps.
        const mx = w / 2 - 0.85;
        g.add(new THREE.Mesh(box(1.2, 0.03, front * 0.9, V(mx, 0.9, front * 0.45)), mats.steel));
        const beige = new THREE.MeshStandardMaterial({ color: 0xcfc3a4, roughness: 0.55 });
        const modem = new THREE.Mesh(box(0.62, 0.13, 0.42, V(mx, 0.985, front * 0.45)), beige);
        modem.castShadow = true;
        g.add(modem);
        const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), new THREE.MeshBasicMaterial({ map: canvasText(['56K'], { w: 128, h: 40, bg: '#cfc3a4', fg: '#3a2f22', font: 'bold 30px Arial' }) }));
        badge.position.set(mx - 0.17, 0.99, front * 0.45 + 0.211);
        g.add(badge);
        const lamps: THREE.Mesh[] = [];
        for (let i = 0; i < 8; i++) {
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), glowMat());
          l.position.set(mx - 0.02 + i * 0.038, 0.975, front * 0.45 + 0.212);
          g.add(l);
          lamps.push(l);
        }
        // A patch panel under the shelf, and a coil of phone line to the wall.
        g.add(new THREE.Mesh(box(1.0, 0.1, 0.1, V(mx, 0.6, front * 0.3)), mats.blackGloss));
        const glow = new THREE.PointLight(0xffa21a, 0, 3.5, 2);
        glow.position.set(0.1, 1.3, front + 0.6);
        g.add(glow);
        const leaves: THREE.Object3D[] = [];
        for (const s of [-1, 1]) {
          const pivot = new THREE.Group();
          pivot.position.set((s * w) / 2, 0, front + 0.02);
          const leaf = new THREE.Mesh(box(w / 2 - 0.02, 2.0, 0.04, V((-s * (w / 2 - 0.02)) / 2, 1.05, 0)), mats.enamel);
          leaf.castShadow = true;
          pivot.add(leaf);
          pivot.userData.side = s;
          g.add(pivot);
          leaves.push(pivot);
          colliders.push(leaf);
        }
        g.userData = { leaves, leds, ledTex, ledMat, scrCanvas, scrTex, lamps, glow, drawn: '' };
        return g;
      }
      case 'terminal': {
        // Drawn on the cabinet's one big screen (see 'cabinet'); the two sim
        // terminals are its two halves, the router and the password prompt.
        g.userData = {};
        return g;
      }
      case 'poster': {
        if (p.label?.startsWith('CFP')) {
          // The CFP rejection wall, in a frame on the concrete wall's face.
          const base = groundRiseM(CFP_WALL.x);
          const fx = m(CFP_WALL.x);
          const fz = m(CFP_WALL.y - CFP_WALL.ny * 8);
          const tex = cfpBoard();
          const board = new THREE.Mesh(
            new THREE.PlaneGeometry(2.2, 1.2),
            new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: new THREE.Color(0.3, 0.29, 0.26), emissiveMap: tex }),
          );
          board.rotation.y = Math.atan2(CFP_WALL.nx, CFP_WALL.ny);
          // Clear of the frame's front face (0.02 + 0.025 = 0.045 off the wall):
          // at 0.045 the two were coplanar and the board flickered (Michele, 29 Sep).
          board.position.set(fx + CFP_WALL.nx * 0.06, base + 1.5, fz + CFP_WALL.ny * 0.06);
          const frame = new THREE.Mesh(box(2.3, 1.3, 0.05, V(0, 0, 0)), mats.darkMetal);
          frame.rotation.y = board.rotation.y;
          frame.position.set(fx + CFP_WALL.nx * 0.02, base + 1.5, fz + CFP_WALL.ny * 0.02);
          g.add(frame, board);
          g.userData = {};
          return g;
        }
        // The spray tag: DevoxxForever, a wifi symbol, and the joke. Faint
        // until a beam finds it (the sim's `active`), then orange paint.
        tagTex ??= sprayTag();
        // On a wall that runs along z (a booth's side) the paint faces west or
        // east; on one along x (the hall's top wall) it faces south.
        const side = d > w;
        const len = side ? d : w;
        const tag = emitter(tagTex, len, len / 4, 0, 0xff7a1a);
        if (side) {
          // On the wall itself (`WIFI_TAG` is 8 px out from it), just proud of
          // the stand's print.
          tag.rotation.y = Math.atan2(WIFI_TAG.nx, WIFI_TAG.ny);
          tag.position.set(m(WIFI_TAG.x - WIFI_TAG.nx * 8) + WIFI_TAG.nx * 0.03, 1.4, cz);
        } else tag.position.set(cx, 2.6, cz + d / 2 + 0.02);
        g.add(tag);
        g.userData = { tag };
        return g;
      }
      case 'cable': {
        // The plug on the end of the run: a clear RJ45 body on a blue boot, built
        // along +z so it can be pointed down the lead's last tangent.
        const plug = new THREE.Group();
        const shell = new THREE.Mesh(box(0.034, 0.026, 0.05, V(0, 0, 0.025)), new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.25, metalness: 0.1 }));
        const bootMesh = new THREE.Mesh(box(0.042, 0.034, 0.05, V(0, 0, -0.022)), new THREE.MeshStandardMaterial({ color: 0x1a4cff, roughness: 0.5 }));
        const pins = new THREE.Mesh(box(0.026, 0.004, 0.012, V(0, 0.012, 0.042)), new THREE.MeshStandardMaterial({ color: 0xd4a53a, metalness: 0.8, roughness: 0.3 }));
        plug.add(shell, bootMesh, pins);
        // A size up, so it reads in her hand from the follow camera.
        plug.scale.setScalar(1.5);
        plug.visible = false;
        g.add(plug);
        g.userData = { mesh: null as THREE.Mesh | null, key: '', lead: null as THREE.Mesh | null, leadKey: '', plug };
        return g;
      }
      case 'roller': {
        // Biggy's door: the corrugated shutter that was chapter 1's fire door,
        // kept for this (Michele: "keep the shutter design for chap2").
        const along = pw >= ph;
        const len = m(along ? pw : ph);
        const s = rollerShutter(mats, len, 3.2, 4.1);
        s.position.set(cx, 0, cz);
        if (along) s.rotation.y = Math.PI / 2;
        g.add(s);
        colliders.push(s.userData.curtain as THREE.Object3D);
        g.userData = { shutter: s };
        return g;
      }
      case 'crate': {
        if (p.label?.startsWith('beer')) return buildCh3(p, pw, ph);
        // Pallets of crated Devoxx t-shirts behind the shutter.
        const h = 0.5 * (p.v ?? 1) + 0.15;
        const pallet = new THREE.Mesh(box(w, 0.14, d, V(cx, 0.07, cz)), mats.counter);
        const load = new THREE.Mesh(box(w * 0.92, h, d * 0.92, V(cx, 0.14 + h / 2, cz)), new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.85 }));
        const label = emitter(canvasText(['DEVOXX', 'T-SHIRTS · XL'], { bg: '#000', fg: '#ff7a1a' }), w * 0.7, 0.2, 1.2, 0xffffff);
        label.position.set(cx, 0.14 + h * 0.6, cz + (d * 0.92) / 2 + 0.01);
        pallet.castShadow = load.castShadow = true;
        g.add(pallet, load, label);
        return g;
      }
      case 'gate': {
        // Stephan's line at the foot of the main stair: chrome belt posts and
        // red webbing, from the sim's own run (`nastriRun`), so every post and
        // belt is exactly where its collider is. The belts wind into their posts
        // one after another, outward from Stephan's hand (`beltU`).
        const base = groundRiseM(p.x + pw / 2);
        const run = nastriRun({ x: p.x, y: p.y, w: pw, h: ph }, 0.5);
        const chrome = mats.steel;
        const webbing = new THREE.MeshStandardMaterial({ color: 0xb3191f, roughness: 0.7 });
        for (const q of run.posts) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, GATE_H, 10), chrome);
          post.position.set(m(q.x), base + GATE_H / 2, m(q.y));
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.03, 18), chrome);
          foot.position.set(m(q.x), base + 0.015, m(q.y));
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 10), chrome);
          cap.position.set(m(q.x), base + GATE_H - 0.02, m(q.y));
          g.add(post, foot, cap);
        }
        const belts: Array<{ mesh: THREE.Mesh; rank: number; ax: number; az: number; len: number; dir: THREE.Vector3 }> = [];
        for (const n of run.belts) {
          const ax = m(n.anchor.x);
          const az = m(n.anchor.y);
          const other = n.anchor === n.a ? n.b : n.a;
          const dir = V(m(other.x) - ax, 0, m(other.y) - az);
          const len = dir.length();
          dir.normalize();
          // Built along +x from its anchor, scaled to how much is still out.
          const geo = new THREE.BoxGeometry(1, 0.05, 0.006);
          geo.translate(0.5, 0, 0);
          const mesh = new THREE.Mesh(geo, webbing);
          mesh.position.set(ax, base + BELT_H, az);
          mesh.rotation.y = -Math.atan2(dir.z, dir.x);
          mesh.scale.x = len;
          g.add(mesh);
          belts.push({ mesh, rank: n.rank, ax, az, len, dir });
        }
        g.userData = { belts };
        return g;
      }
      case 'stair-button': {
        // Stephan's release post beside the belt line: a slim dark pillar with a
        // steel cap, a red mushroom button on top and a signal lamp on a stalk
        // that goes green when he has pressed it.
        const base = groundRiseM(p.x + pw / 2);
        const H = 1.1;
        const pillar = new THREE.Mesh(box(0.2, H, 0.2, V(cx, base + H / 2, cz)), mats.darkMetal);
        const capM = new THREE.Mesh(box(0.26, 0.05, 0.26, V(cx, base + H + 0.025, cz)), mats.steel);
        const btnMat = new THREE.MeshStandardMaterial({ color: 0xd8261e, emissive: new THREE.Color(0.5, 0.04, 0.02), roughness: 0.35 });
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.05, 20), btnMat);
        btn.position.set(cx, base + H + 0.075, cz);
        const lampMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), lampMat);
        lamp.position.set(cx, base + H + 0.32, cz);
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), mats.steel);
        stalk.position.set(cx, base + H + 0.17, cz);
        const glow = new THREE.PointLight(0xff2a1a, 0.6, 3, 2);
        glow.position.copy(lamp.position);
        pillar.castShadow = true;
        g.add(pillar, capM, btn, stalk, lamp, glow);
        colliders.push(pillar);
        g.userData = { btn, btnY: btn.position.y, lampMat, glow };
        return g;
      }
      default:
        return buildCh3(p, pw, ph);
    }
  }

  function key(p: Prop): string | undefined {
    switch (p.kind) {
      case 'pot':
      case 'soup':
      case 'duck':
      case 'cable':
      case 'toast':
      case 'ladle':
        return p.kind;
      case 'race-marker':
        return `race:${p.v ?? 0}`;
      case 'crate':
        return p.label?.startsWith('beer') ? `beer:${p.label}` : undefined;
      default:
        return undefined;
    }
  }

  /** A neon word on a dark backing board, for chapter 3's counters. */
  function neonBoard(text: string, w: number, col: string): THREE.Group {
    const g = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 192;
    const x = c.getContext('2d')!;
    x.fillStyle = '#000';
    x.fillRect(0, 0, 1024, 192);
    x.font = 'bold 110px "Arial Black", Impact, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = col;
    x.shadowBlur = 24;
    x.fillStyle = col;
    x.fillText(text, 512, 100, 980);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, w / 5.33 + 0.1, 0.05), mats.darkMetal);
    const face = emitter(tex, w, w / 5.33, 2.4, 0xffffff);
    face.position.z = 0.03;
    g.add(back, face);
    return g;
  }

  const beerMat = new THREE.MeshPhysicalMaterial({ color: 0xc88a1a, roughness: 0.15, emissive: new THREE.Color(0.35, 0.18, 0.02), emissiveIntensity: 0.6 });
  const crateMats = [0x2f5d2f, 0x7a1f1f, 0x1f3f7a, 0x6a4a1a, 0x444444, 0x5a2a6a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));

  /*
   * THE POUR, DRAWN. Michele, 29 Sep 2026: *"the animation when beer is completed
   * can be better."* It was a thread of beer under each tap and four solid gold
   * glasses. Now it is a beat: the bar's pendant lamps come on warm over the
   * counter, the taps light up, each tap pours into a glass standing under it,
   * every glass on the bar fills from the bottom and gets a foam head that rises
   * proud of the rim, and each one glints as it tops out. All of it off ONE sim
   * number — the taps' `v`, the pour clock — plus the counter's `done`.
   */
  const glassShell = new THREE.MeshStandardMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: new THREE.Color(0.35, 0.3, 0.22), roughness: 0.95 });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glintGeo = new THREE.PlaneGeometry(0.16, 0.16);
  /** A soft falloff for light drawn as a surface: radial for a lamp's pool, vertical for a band. */
  function softMask(radial: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const gr = radial ? x.createRadialGradient(64, 64, 0, 64, 64, 64) : x.createLinearGradient(0, 0, 0, 128);
    if (radial) {
      gr.addColorStop(0, '#fff');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.45, '#fff');
      gr.addColorStop(1, 'rgba(255,255,255,0.1)');
    }
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const poolMask = softMask(true);
  const bandMask = softMask(false);
  const GLASS_PROFILES: Array<Array<[number, number]>> = [
    // tulip, goblet, flute, chalice
    [[0.001, 0], [0.028, 0], [0.024, 0.02], [0.05, 0.09], [0.052, 0.14], [0.042, 0.2]],
    [[0.001, 0], [0.035, 0], [0.012, 0.02], [0.012, 0.07], [0.055, 0.1], [0.065, 0.17]],
    [[0.001, 0], [0.026, 0], [0.012, 0.02], [0.012, 0.05], [0.028, 0.08], [0.03, 0.25]],
    [[0.001, 0], [0.034, 0], [0.012, 0.02], [0.012, 0.07], [0.07, 0.1], [0.064, 0.16]],
  ];
  /**
   * One Belgian glass: a clear shell, the beer inside it (scaled up from the
   * bottom by how full it is) and a foam head that sits on the beer and grows
   * proud of the rim at the very end. `fill` 0..1.
   */
  function beerGlass(kind: number): THREE.Group {
    const prof = GLASS_PROFILES[kind % 4];
    const top = prof[prof.length - 1];
    // Where the bowl starts: the beer is only in the bowl, never in the stem.
    const floorY = prof[2][1] + (kind === 0 ? 0 : prof[3][1] - prof[2][1]);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18), glassShell));
    const inner = prof.filter(([, y]) => y >= floorY).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r * 0.9), y - floorY));
    inner.unshift(new THREE.Vector2(0.001, 0));
    const beerGeo = new THREE.LatheGeometry(inner, 18);
    const beer = new THREE.Mesh(beerGeo, pintMat);
    beer.position.y = floorY;
    const foam = new THREE.Mesh(new THREE.SphereGeometry(top[0] * 0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), foamMat);
    foam.scale.y = 0.35;
    const glint = new THREE.Mesh(glintGeo, glintMat.clone());
    glint.position.set(top[0] * 0.6, top[1] * 0.8, top[0]);
    g.add(beer, foam, glint);
    g.userData = { beer, foam, glint, floorY, height: top[1] - floorY };
    return g;
  }
  function fillGlass(glass: THREE.Object3D, fill: number, since: number): void {
    const u = glass.userData as { beer: THREE.Mesh; foam: THREE.Mesh; glint: THREE.Mesh; floorY: number; height: number };
    const f = THREE.MathUtils.clamp(fill, 0, 1);
    u.beer.visible = f > 0.01;
    u.beer.scale.set(1, Math.max(0.01, f), 1);
    // The head: a thin white line on the rising beer, then a proud dome at the top.
    const head = THREE.MathUtils.smoothstep(f, 0.55, 1);
    u.foam.visible = f > 0.05;
    u.foam.position.y = u.floorY + u.height * f;
    u.foam.scale.set(0.9 + 0.1 * head, 0.12 + 0.45 * head, 0.9 + 0.1 * head);
    // A glint as it tops out, for half a second.
    const gl = since >= 0 && since < 0.6 ? Math.sin((since / 0.6) * Math.PI) : 0;
    u.glint.visible = gl > 0.01;
    (u.glint.material as THREE.MeshBasicMaterial).color.setRGB(3 * gl, 2.6 * gl, 1.6 * gl);
    u.glint.rotation.z = since * 3;
  }
  /** Glassware is drawn half as big again: at the follow camera's distance a true 20 cm glass is a pixel. */
  const GLASS_SCALE = 1.5;
  /** Beer in a glass: deep amber that glows a little, so it reads as beer and not as the glass. */
  const pintMat = new THREE.MeshStandardMaterial({ color: 0x6a3202, roughness: 0.45, emissive: new THREE.Color(0.7, 0.28, 0.0), emissiveIntensity: 1 });
  /** The pour clock this frame, off the taps (published before the glassware). */
  let pourNow = 0;
  /** Scene time the pour topped out, -1 while it has not. */
  let pouredAt = -1;

  /**
   * A soup ladle, recognisable at a glance: a long handle with a hook at the grip
   * end, a crook where it drops into a deep round bowl. Caricatured a little —
   * 0.7 m of handle and a 0.1 m bowl — because it has to read in a robot's hand
   * from the follow camera. Built with its GRIP at the origin and the handle
   * running along +z to the bowl, which opens towards +y.
   */
  const ladleMat = new THREE.MeshStandardMaterial({ color: 0xe4e8ee, metalness: 0.85, roughness: 0.22, emissive: new THREE.Color(0.1, 0.1, 0.11), side: THREE.DoubleSide });
  function makeLadle(): THREE.Group {
    const g = new THREE.Group();
    const L = LADLE_REACH;
    const path = new THREE.CatmullRomCurve3([V(0, 0.07, -0.12), V(0, 0.03, -0.07), V(0, 0, 0), V(0, 0, L * 0.85), V(0, -0.03, L), V(0, -0.09, L + 0.03)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 28, 0.013, 6), ladleMat));
    const r = 0.1;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ladleMat);
    bowl.position.set(0, -0.09, L + 0.03 + r);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.009, 6, 22), ladleMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(bowl.position);
    // A black grip sleeve, the part a hand closes on.
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10), mats.darkMetal);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.08;
    g.add(bowl, rim, grip);
    g.traverse((o) => {
      o.castShadow = true;
    });
    return g;
  }

  /*
   * BREAKFAST ON THE COUNTERS. Michele, 29 Sep 2026: *"put on some breakfast,
   * coffee, and a stack of crab sandwiches"*. The catering counters were three
   * bare white blocks and one sandwich. Now: the soup counter carries the
   * breakfast either side of the vat (croissants on trays, a bowl of fruit, jugs
   * and glasses of orange juice), the sandwich counter a pyramid of broodjes krab
   * under their sign, and the coffee counter urns, airpots and stacked cups under
   * a COFFEE board. Procedural and instanced: one draw call per kind of thing.
   * Chapter 3 only — it hangs off the crab prop, so the dark hall of chapter 2
   * has nothing set out.
   */
  function cateringSpread(): THREE.Group {
    const out = new THREE.Group();
    const TOP = 1.05;
    const M4 = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const E = new THREE.Euler();
    const S = new THREE.Vector3();
    const P = new THREE.Vector3();
    const put = (list: THREE.Matrix4[], x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): void => {
      list.push(M4.clone().compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)));
    };
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], colours?: THREE.Color[], shadow = false): void => {
      if (list.length === 0) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      colours?.forEach((c, i) => im.setColorAt(i, c));
      im.castShadow = shadow;
      im.receiveShadow = true;
      out.add(im);
    };
    const rnd = (i: number): number => {
      const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      return h - Math.floor(h);
    };
    const f = GF.food;
    const front = (r: { y: number; h: number }): number => m(r.y + r.h);
    const trays: THREE.Matrix4[] = [];

    /* ---- the soup counter: breakfast either side of the vat */
    const soupZ = front(f.soup) - 0.45;
    const croissants: THREE.Matrix4[] = [];
    for (const [tx, tz] of [
      [m(f.soup.x) + 0.55, soupZ],
      [m(f.soup.x) + 1.35, soupZ - 0.15],
      [m(f.soup.x + f.soup.w) - 0.55, soupZ],
    ]) {
      put(trays, tx, TOP + 0.012, tz, 0, 0.62, 0.024, 0.44);
      for (let i = 0; i < 12; i++) {
        const k = croissants.length;
        put(croissants, tx - 0.22 + (i % 4) * 0.145, TOP + 0.05 + (i >= 8 ? 0.045 : 0), tz - 0.12 + (Math.floor(i / 4) % 3) * 0.12, rnd(k) * Math.PI * 2, 1, 1, 1, -Math.PI / 2);
      }
    }
    const croissant = new THREE.TorusGeometry(0.052, 0.03, 6, 12, Math.PI * 1.25);
    croissant.scale(1, 1, 0.8);
    inst(croissant, new THREE.MeshStandardMaterial({ color: 0xc98032, roughness: 0.55, emissive: new THREE.Color(0.08, 0.035, 0) }), croissants, undefined, true);
    // A bowl of fruit, piled.
    const fx = m(f.soup.x + f.soup.w) - 1.45;
    const bowl = new THREE.Mesh(
      new THREE.LatheGeometry([[0.001, 0], [0.12, 0], [0.24, 0.1], [0.27, 0.13]].map(([r0, y]) => new THREE.Vector2(r0, y)), 20),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.6, side: THREE.DoubleSide }),
    );
    bowl.position.set(fx, TOP, soupZ - 0.05);
    out.add(bowl);
    const fruit: THREE.Matrix4[] = [];
    const fruitCol: THREE.Color[] = [];
    const FRUIT = [0xff8a1a, 0xd8261e, 0x8cc63a, 0xff8a1a, 0xf2d43a];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4;
      const ring = i < 8 ? 0.15 : i < 13 ? 0.08 : 0;
      put(fruit, fx + Math.cos(a) * ring, TOP + 0.1 + (i < 8 ? 0 : i < 13 ? 0.06 : 0.12), soupZ - 0.05 + Math.sin(a) * ring);
      fruitCol.push(new THREE.Color(FRUIT[i % FRUIT.length]));
    }
    inst(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }), fruit, fruitCol);
    // Orange juice: two jugs and a row of poured glasses.
    const juiceMat = new THREE.MeshStandardMaterial({ color: 0xff9a14, roughness: 0.25, emissive: new THREE.Color(0.35, 0.15, 0) });
    const jugs: THREE.Matrix4[] = [];
    const juice: THREE.Matrix4[] = [];
    for (const jx of [m(f.soup.x) + 2.1, m(f.soup.x) + 2.4]) {
      put(jugs, jx, TOP + 0.13, soupZ - 0.3);
      put(juice, jx, TOP + 0.1, soupZ - 0.3, 0, 0.9, 0.75, 0.9);
    }
    for (let i = 0; i < 8; i++) put(juice, m(f.soup.x) + 1.95 + (i % 4) * 0.13, TOP + 0.05, soupZ + 0.05 + Math.floor(i / 4) * 0.13, 0, 0.42, 0.38, 0.42);
    inst(new THREE.CylinderGeometry(0.08, 0.09, 0.26, 14), glassShell, jugs);
    inst(new THREE.CylinderGeometry(0.075, 0.085, 0.26, 14), juiceMat, juice);

    /* ---- the sandwich counter: a pyramid of broodjes krab */
    const cx = m(f.sandwich.x + f.sandwich.w / 2);
    const cz = front(f.sandwich) - 1.0;
    const rolls: THREE.Matrix4[] = [];
    const crab: THREE.Matrix4[] = [];
    // Five long rolls across at the bottom, three deep, a layer less each time up:
    // a pyramid you can read from the queue, pink along the top of every roll.
    const LAYERS = 5;
    put(trays, cx, TOP + 0.012, cz, 0, 1.95, 0.024, 0.5);
    for (let L = 0; L < LAYERS; L++) {
      const n = LAYERS - L;
      for (let i = 0; i < n; i++) {
        for (const row of [-1, 0, 1]) {
          const x = cx + (i - (n - 1) / 2) * 0.37;
          const z = cz + row * 0.125 + (L % 2) * 0.03;
          const y = TOP + 0.055 + L * 0.092;
          const wob = (rnd(L * 13 + i * 3 + row) - 0.5) * 0.1;
          put(rolls, x, y, z, wob, 1, 0.82, 1, 0, Math.PI / 2);
          put(crab, x, y + 0.045, z, wob, 1, 0.6, 1.1, 0, Math.PI / 2);
        }
      }
    }
    // ...and a flat row of them along the front, for the queue.
    for (let i = 0; i < 7; i++) {
      const x = m(f.sandwich.x) + 0.6 + i * 0.36;
      if (Math.abs(x - cx) < 0.7) continue;
      put(trays, x, TOP + 0.012, front(f.sandwich) - 0.4, 0, 0.34, 0.024, 0.3);
      put(rolls, x, TOP + 0.06, front(f.sandwich) - 0.4, Math.PI / 2, 1, 0.82, 1, 0, Math.PI / 2);
      put(crab, x, TOP + 0.1, front(f.sandwich) - 0.4, Math.PI / 2, 1, 0.55, 1, 0, Math.PI / 2);
    }
    inst(new THREE.CapsuleGeometry(0.052, 0.24, 4, 10), new THREE.MeshStandardMaterial({ color: 0xe9c58c, roughness: 0.75, emissive: new THREE.Color(0.06, 0.04, 0.02) }), rolls, undefined, true);
    inst(new THREE.CapsuleGeometry(0.036, 0.21, 3, 8), new THREE.MeshStandardMaterial({ color: 0xff6f78, roughness: 0.7, emissive: new THREE.Color(0.25, 0.05, 0.06) }), crab);

    /* ---- the coffee counter: urns, airpots, cups */
    const kx = m(f.coffee.x);
    const kw = m(f.coffee.w);
    const back = m(f.coffee.y) + 0.5;
    const urns: THREE.Matrix4[] = [];
    const lids: THREE.Matrix4[] = [];
    const taps: THREE.Matrix4[] = [];
    for (let i = 0; i < 3; i++) {
      const x = kx + 0.6 + i * 0.55;
      put(urns, x, TOP + 0.3, back);
      put(lids, x, TOP + 0.64, back);
      put(taps, x, TOP + 0.12, back + 0.17);
    }
    inst(new THREE.CylinderGeometry(0.16, 0.17, 0.6, 18), new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 0.7, roughness: 0.28 }), urns, undefined, true);
    inst(new THREE.ConeGeometry(0.17, 0.1, 18), mats.darkMetal, lids);
    inst(new THREE.BoxGeometry(0.04, 0.05, 0.07), mats.darkMetal, taps);
    const pots: THREE.Matrix4[] = [];
    for (let i = 0; i < 4; i++) put(pots, kx + kw - 0.45 - i * 0.2, TOP + 0.18, back + 0.05);
    inst(new THREE.CylinderGeometry(0.07, 0.07, 0.36, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.3, metalness: 0.4 }), pots, undefined, true);
    const cups: THREE.Matrix4[] = [];
    for (let st = 0; st < 6; st++) {
      const x = kx + 0.45 + (st % 3) * 0.2;
      const z = front(f.coffee) - 0.45 - Math.floor(st / 3) * 0.2;
      for (let k = 0; k < 7; k++) put(cups, x, TOP + 0.045 + k * 0.035, z);
    }
    for (let i = 0; i < 6; i++) put(cups, kx + 1.3 + (i % 3) * 0.16, TOP + 0.045, front(f.coffee) - 0.35 - Math.floor(i / 3) * 0.16);
    // Paper cups, kraft brown: a conference pours coffee into a thousand of them.
    inst(new THREE.CylinderGeometry(0.048, 0.034, 0.09, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.8, side: THREE.DoubleSide }), cups);
    const koffie = neonBoard('COFFEE', 1.1, '#ffd08a');
    koffie.position.set(kx + kw / 2, TOP + 1.05, m(f.coffee.y) + 0.12);
    out.add(koffie);

    inst(new THREE.BoxGeometry(1, 1, 1), mats.darkMetal, trays);
    return out;
  }

  function buildCh3(p: Prop, pw: number, ph: number): THREE.Object3D | null {
    const g = new THREE.Group();
    const w = m(pw);
    const d = m(ph);
    switch (p.kind) {
      case 'soup-station': {
        /*
         * The tomato soup: TWO big pots on the catering counter, and a neon word
         * over them. One is the crowd's and never moves; the other is the one
         * Biggy takes, hidden while it is out (the station reads 'done' from the
         * moment he lifts it, and 'idle' again when a spilled pot is refilled).
         * There used to be one, which stayed on the counter while Biggy walked off
         * with its twin (Michele, 29 Sep: "double pot. Maybe put 2 on the counter,
         * so the crowd does not remain without soup").
         */
        g.position.set(m(p.x + pw / 2), 1.0, m(p.y + ph / 2));
        const soupMat = new THREE.MeshStandardMaterial({ color: 0xb3261e, emissive: new THREE.Color(0.5, 0.08, 0.04), emissiveIntensity: 0.8, roughness: 0.3 });
        const potAt = (x: number): THREE.Group => {
          const one = new THREE.Group();
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.5, 24), mats.steel);
          pot.position.y = 0.25;
          const soup = new THREE.Mesh(new THREE.CircleGeometry(0.39, 24), soupMat);
          soup.rotation.x = -Math.PI / 2;
          soup.position.y = 0.46;
          one.add(pot, soup);
          one.position.x = x;
          return one;
        };
        const takeable = potAt(0.48);
        const board = neonBoard('TOMATO SOUP', 2.2, '#ff3b2f');
        board.position.set(0, 1.9, -0.2);
        g.add(potAt(-0.48), takeable, board);
        g.userData = { takeable };
        return g;
      }
      case 'ladle': {
        /*
         * The high shelf, and the ladle — two things, and only one of them moves.
         *
         * The group is built ONCE (`key` gives it a stable name) at the world
         * origin: the rack is placed from `GF.food.shelf` and never moves again,
         * and `tool` — the ladle alone — is posed every frame by `world.ts`, from
         * the prop's state: on the hook, in Droid's hand, standing in a pot. It was
         * one group placed at the prop's rect, and the rect follows whoever has the
         * ladle — so Droid walked off carrying the whole shelf on his head, and
         * Biggy after him (Michele, 29 Sep: "droid should take the ladle, not the
         * shelf", and "why is biggy taking the shelf with him?").
         */
        const sh = GF.food.shelf;
        const cx = m(sh.x + sh.w / 2);
        const back = m(sh.y);
        const sw = m(sh.w);
        // The rect's front edge, where the rail and the ladle are: the side the hall is on.
        const front = m(sh.y + sh.h);
        const rack = new THREE.Group();
        for (const sx of [-1, 1]) {
          // Two uprights on the wall, a bracket under each end of the slab.
          rack.add(new THREE.Mesh(box(0.05, 2.7, 0.05, V(cx + sx * (sw / 2 - 0.1), 1.35, back + 0.03)), mats.darkMetal));
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.03), mats.darkMetal);
          brace.position.set(cx + sx * (sw / 2 - 0.1), 2.08, back + 0.3);
          brace.rotation.x = -0.72;
          rack.add(brace);
        }
        rack.add(new THREE.Mesh(box(sw, 0.05, front - back, V(cx, 2.35, (back + front) / 2)), mats.steel));
        // The hanging rail along its front lip, and a row of stacked soup bowls on top.
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, sw - 0.1, 8), mats.steel);
        rail.rotation.z = Math.PI / 2;
        rail.position.set(cx, 2.3, front - 0.03);
        rack.add(rail);
        const bowls = new THREE.Mesh(
          new THREE.LatheGeometry([[0.001, 0], [0.07, 0], [0.1, 0.05], [0.11, 0.2]].map(([r0, y]) => new THREE.Vector2(r0, y)), 16),
          new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.4 }),
        );
        for (const k of [-1, 0, 1]) {
          const b = bowls.clone();
          b.position.set(cx + k * 0.42, 2.375, (back + front) / 2);
          rack.add(b);
        }
        const tool = makeLadle();
        tool.position.set(cx, 2.3, front - 0.03);
        const glow = new THREE.PointLight(0xffb05a, 6, 2.5, 2);
        glow.position.set(cx, 2.6, front + 0.4);
        g.add(rack, tool, glow);
        g.userData = { tool, glow, hook: V(cx - 0.35, 2.3, front - 0.03) };
        return g;
      }
      case 'crab': {
        g.position.set(m(p.x + pw / 2), 1.0, m(p.y + ph / 2));
        const bread = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 4, 10), new THREE.MeshStandardMaterial({ color: 0xd9a35a, roughness: 0.8 }));
        bread.rotation.z = Math.PI / 2;
        bread.position.y = 0.08;
        const fill = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.1), new THREE.MeshStandardMaterial({ color: 0xff8a6a, roughness: 0.6 }));
        fill.position.y = 0.1;
        const board = neonBoard('BROODJE KRAB', 1.2, '#ff8a3d');
        board.position.set(0, 0.95, -0.15);
        g.add(bread, fill, board);
        // The rest of breakfast, on all three counters, in world coordinates.
        const spread = cateringSpread();
        spread.position.copy(g.position).multiplyScalar(-1);
        g.add(spread);
        return g;
      }
      case 'bar-counter': {
        // The Finally Block, in centre coordinates per the sim's own note.
        g.position.set(m(p.x), 0, m(p.y));
        const counter = new THREE.Mesh(box(w, 1.1, d, V(0, 0.55, 0)), mats.blackGloss);
        counter.castShadow = true;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.04, 0.04), glowMat());
        strip.position.set(0, 1.08, d / 2 + 0.02);
        const board = neonBoard((p.label ?? 'THE BAR').split('—')[0].trim().toUpperCase(), Math.min(4, w * 0.8), '#ffcc33');
        board.position.set(0, 3.0, 0);
        g.add(counter, strip, board);
        // Three pendant lamps over the counter, dark until the beer is in, and one
        // warm light for the whole bar under them. Built now and only turned up,
        // so the scene's light count never changes mid-chapter.
        const bulbs: THREE.Mesh[] = [];
        const pools: THREE.Mesh[] = [];
        for (const k of [-1, 0, 1]) {
          const x = k * w * 0.32;
          const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.6, 4), mats.darkMetal);
          wire.position.set(x, 3.4, d / 2 - 0.1);
          const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 16, 1, true), mats.darkMetal);
          shade.position.set(x, 2.56, d / 2 - 0.1);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), glowMat());
          bulb.position.set(x, 2.42, d / 2 - 0.1);
          // The pool each lamp throws on the bar top: what reads as "the lights
          // are on" from the follow camera, however the exposure is sitting.
          const poolMat = glintMat.clone();
          poolMat.map = poolMask;
          const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), poolMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(x, 1.105, 0);
          g.add(wire, shade, bulb, pool);
          bulbs.push(bulb);
          pools.push(pool);
        }
        // The back bar: a warm band of light on the wall behind the counter.
        const bandMat = glintMat.clone();
        bandMat.map = bandMask;
        const backbar = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, 1.1), bandMat);
        backbar.position.set(0, 1.75, -d / 2 + 0.02);
        g.add(backbar);
        const warm = new THREE.PointLight(0xffa850, 0, 10, 1.4);
        warm.position.set(m(20), 2.4, d / 2 + 0.8);
        g.add(warm);
        g.userData = { strip, bulbs, pools, backbar, warm };
        return g;
      }
      case 'beer-tap': {
        g.position.set(m(p.x), 1.1, m(p.y));
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.44, 12), mats.steel);
        col.position.y = 0.22;
        const handleMat = new THREE.MeshStandardMaterial({ color: 0xf0c040, emissive: new THREE.Color(0.4, 0.3, 0.05), emissiveIntensity: 0.4 });
        // The handle pivots at the top of the column, so pulling it is a lean.
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.44, 0.02);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), handleMat);
        handle.position.y = 0.09;
        pivot.add(handle);
        // The spout: out over the drip tray, where the glass stands.
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), mats.steel);
        spout.rotation.x = Math.PI / 2;
        spout.position.set(0, 0.4, 0.07);
        // A ring on the column that lights with the tap: the "taps ready" signal.
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 16), glowMat());
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.2;
        const glass = beerGlass(0);
        glass.scale.setScalar(GLASS_SCALE);
        glass.position.set(0, 0.01, 0.13);
        // The pour itself, from the spout down to the beer in the glass.
        const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.007, 1, 6), beerMat);
        stream.visible = false;
        g.add(col, pivot, spout, ring, glass, stream);
        g.userData = { handle: pivot, handleMat, stream, ring, glass };
        return g;
      }
      case 'keg': {
        // Behind the counter: a steel keg with its coupler, three of them.
        g.position.set(m(p.x), 0, m(p.y));
        const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 20), mats.steel);
        keg.position.y = 0.3;
        keg.castShadow = true;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20), mats.steel);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.6;
        const coupler = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 10), mats.darkMetal);
        coupler.position.y = 0.64;
        g.add(keg, rim, coupler);
        return g;
      }
      case 'spill': {
        // Tomato soup on the floor, where the pot slopped. It stays.
        const r0 = m(pw) / 2;
        const shape = new THREE.Shape();
        for (let i = 0; i <= 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const rr = r0 * (0.8 + 0.25 * Math.sin(a * 3 + p.x) * Math.cos(a * 2 + p.y));
          if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        const puddle = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({ color: 0x9e1f14, roughness: 0.15, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }),
        );
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.set(m(p.x), groundRiseM(p.x) + 0.006, m(p.y));
        g.add(puddle);
        return g;
      }
      case 'toast': {
        // The glass Biggy raises when the bar is done: a tulip of Belgian gold.
        const glass = new THREE.Mesh(
          new THREE.LatheGeometry([[0.02, 0], [0.02, 0.06], [0.05, 0.1], [0.04, 0.2]].map(([r0, y]) => new THREE.Vector2(r0, y)), 14),
          beerMat,
        );
        g.add(glass);
        g.userData = { glass };
        return g;
      }
      case 'beer-glass': {
        // Four Belgian shapes by `v`: tulip, goblet, flute, chalice.
        g.position.set(m(p.x), 1.1, m(p.y));
        const glass = beerGlass(p.v ?? 0);
        glass.scale.setScalar(GLASS_SCALE);
        g.add(glass);
        g.userData = { glass };
        return g;
      }
      case 'duck': {
        // The shuffleboard duck: a big rubber duck, centre coordinates.
        g.position.set(m(p.x), 0, m(p.y));
        const yellow = new THREE.MeshStandardMaterial({ color: 0xffd21a, roughness: 0.35 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(w * 0.45, 18, 12), yellow);
        body.scale.set(1, 0.7, 1.25);
        body.position.y = w * 0.32;
        const head = new THREE.Mesh(new THREE.SphereGeometry(w * 0.26, 16, 12), yellow);
        head.position.set(0, w * 0.72, w * 0.3);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(w * 0.08, w * 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xff7a1a }));
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, w * 0.7, w * 0.58);
        g.add(body, head, beak);
        return g;
      }
      case 'duck-target':
      case 'race-marker': {
        g.position.set(m(p.x), 0.02, m(p.y));
        const ring = new THREE.Mesh(new THREE.RingGeometry(w * 0.35, w * 0.5, 32), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        g.add(ring);
        if (p.kind === 'race-marker') {
          const n = emitter(canvasText([String(p.v ?? '')], { w: 128, h: 128 }), w * 0.5, w * 0.5, 2, 0xffffff);
          n.rotation.x = -Math.PI / 2;
          n.position.y = 0.01;
          g.add(n);
        }
        g.userData = { ring };
        return g;
      }
      case 'sticker': {
        g.position.set(m(p.x + pw / 2), 2.4, m(p.y + ph / 2));
        g.add(emitter(canvasText(['DEVOXX', '2026'], { w: 256, h: 160, bg: '#000', fg: '#ff7a1a' }), 0.4, 0.25, 2, 0xffffff));
        return g;
      }
      case 'pot': {
        // The soup, riding on Biggy's lid.
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.36, 20), mats.steel);
        pot.position.y = 0.18;
        g.add(pot);
        return g;
      }
      case 'soup': {
        const surf = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshStandardMaterial({ color: 0xb3261e, emissive: new THREE.Color(0.6, 0.1, 0.05), emissiveIntensity: 0.6 }));
        surf.rotation.x = -Math.PI / 2;
        g.add(surf);
        return g;
      }
      case 'crate': {
        if (!p.label?.startsWith('beer')) return null;
        // A beer crate, centre coordinates, stacked by `v`.
        const i = Array.from(p.label).reduce((a, ch) => a + ch.charCodeAt(0), 0) % crateMats.length;
        const body = new THREE.Mesh(box(w, 0.32, d, V(0, 0.16, 0)), crateMats[i]);
        body.castShadow = true;
        const bottles = new THREE.Mesh(box(w * 0.85, 0.1, d * 0.85, V(0, 0.36, 0)), new THREE.MeshStandardMaterial({ color: 0x3a2208, roughness: 0.2 }));
        g.add(body, bottles);
        return g;
      }
      default:
        return null;
    }
  }

  const _le = new THREE.Vector3();
  const _ll = new THREE.Vector3();
  const _lt = new THREE.Vector3();

  /**
   * The last stretch of a plugged-in cable: from where Voxxy stood, across the
   * floor to the counter's foot, up its face, over the lip and into the printer's
   * socket. While her plug-in beat runs (`plugHand`) it ends in her hand, rebuilt
   * every frame so there is never daylight between fingers and cable; after the
   * click it ends in the socket, built once.
   */
  function drawLead(o: THREE.Object3D, u: Record<string, unknown>, start: THREE.Vector3): void {
    const live = plugHand.live && plugHand.u >= 0 && plugHand.u < CLICK_U;
    const key = live ? 'live' : `seated|${start.x.toFixed(2)}|${start.z.toFixed(2)}`;
    if (!live && key === u.leadKey) return;
    u.leadKey = key;
    const end = live ? _le.copy(plugHand.at) : printerPort(GF.printer, _le);
    counterLip(GF.printer, _ll);
    // 0 while the plug is in front of the counter, 1 once it is over the top.
    const behind = THREE.MathUtils.clamp((_ll.z - end.z) / 0.12 + 0.5, 0, 1);
    const foot = V(end.x + 0.05, start.y, Math.max(end.z, _ll.z) + 0.12);
    const sag = foot.clone().lerp(end, 0.5);
    sag.y -= 0.06;
    const over = V(end.x + 0.06, _ll.y + 0.035, _ll.z - 0.02);
    const bend = sag.lerp(over, behind);
    // The socket faces east, so the lead's last few centimetres come in along -x.
    const into = V(end.x + 0.07, end.y, end.z);
    const curve = new THREE.CatmullRomCurve3([start, foot, bend, into, end.clone()], false, 'centripetal');
    if (u.lead) {
      o.remove(u.lead as THREE.Mesh);
      (u.lead as THREE.Mesh).geometry.dispose();
    }
    const lead = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.035, 6), (u.mat as THREE.Material) ?? undefined);
    o.add(lead);
    u.lead = lead;
    const plug = u.plug as THREE.Object3D;
    curve.getTangentAt(1, _lt);
    plug.position.copy(end).addScaledVector(_lt, -0.075);
    plug.lookAt(_lt.add(plug.position));
    plug.visible = true;
  }

  /** The cable's state this frame, for the rack's reel and ring. */
  let cableState = 'idle';
  /** Cable paid out, sim px — the reel turns by it. */
  let cableLen = 0;
  /** The cabinet's two terminals, as the sim publishes them this frame; the big screen draws both. */
  const cab: { status: Prop | null; prompt: Prop | null; pilot: string } = { status: null, prompt: null, pilot: 'idle' };

  function drawScreen(u: { scrCanvas: HTMLCanvasElement; scrTex: THREE.CanvasTexture; drawn: string }, blink: boolean): void {
    const st = cab.status;
    const pr = cab.prompt;
    const key = `${st?.state}|${st?.label}|${pr?.state}|${pr?.label}|${(pr?.v ?? 0).toFixed(2)}|${blink}`;
    if (u.drawn === key) return;
    u.drawn = key;
    const x = u.scrCanvas.getContext('2d')!;
    x.fillStyle = '#020403';
    x.fillRect(0, 0, 768, 432);
    if (!st || st.state === 'idle') {
      u.scrTex.needsUpdate = true;
      return;
    }
    const online = st.state === 'done';
    const col = online ? '#3cff78' : '#ffa21a';
    x.fillStyle = col;
    x.textBaseline = 'middle';
    x.font = 'bold 30px "Courier New", monospace';
    x.fillText('DEVOXX-NOC  //  UPLINK', 28, 42);
    x.fillRect(28, 66, 712, 3);
    x.font = 'bold 26px "Courier New", monospace';
    x.fillText((st.label ?? '').replace(/^.*?—\s*/, '').toUpperCase().slice(0, 44), 28, 110);
    x.fillText(online ? 'ATDT ... CONNECT 56000/V90' : 'MODEM READY  ATZ  OK', 28, 150);
    x.strokeStyle = col;
    x.lineWidth = 3;
    x.strokeRect(28, 178, 712, 28);
    x.fillRect(32, 182, 704 * Math.min(1, st.v ?? 0), 20);
    // The prompt half.
    x.font = 'bold 34px "Courier New", monospace';
    x.fillText(online ? 'WIFI: ON AIR' : 'AUTHORISATION?', 28, 262);
    x.strokeRect(28, 300, 712, 64);
    const typed = Math.round(Math.min(1, pr?.v ?? 0) * 13);
    x.fillText('*'.repeat(typed) + (blink && !online ? '_' : ''), 44, 334);
    x.font = '22px "Courier New", monospace';
    x.fillStyle = online ? col : '#8a6a3a';
    x.fillText(online ? 'and no, you can\u2019t change it' : 'password: see the wall', 28, 396);
    u.scrTex.needsUpdate = true;
  }

  /** The rack's link lights, redrawn every few frames while powered. */
  function drawLeds(u: { leds: HTMLCanvasElement; ledTex: THREE.CanvasTexture }, t: number, on: boolean): void {
    const x = u.leds.getContext('2d')!;
    x.clearRect(0, 0, 64, 256);
    if (!on) {
      u.ledTex.needsUpdate = true;
      return;
    }
    const f = Math.floor(t * 12);
    for (let r = 0; r < 8; r++) {
      for (let k = 0; k < 6; k++) {
        const h = Math.sin((r * 13 + k * 7) * 12.9898 + f * (0.3 + ((r + k) % 3) * 0.4)) * 43758.5453;
        const lit = h - Math.floor(h) > 0.4;
        if (!lit) continue;
        x.fillStyle = (r + k) % 5 === 0 ? '#ffa21a' : '#3cff78';
        x.fillRect(6 + k * 9, 8 + r * 32, 5, 4);
      }
    }
    u.ledTex.needsUpdate = true;
  }

  function update(o: THREE.Object3D, p: Prop, t: number, dt: number): void {
    const u = o.userData;
    void dt;
    switch (p.kind) {
      case 'soup-station':
        (u.takeable as THREE.Object3D).visible = p.state !== 'done';
        break;
      case 'breaker': {
        const up = p.v ?? 0;
        // Handles already up stay up; the newest one goes up in Droid's hand,
        // on the one clock his arm runs on (reach3d.ts), and flashes as it lands.
        // No reach running (nobody drew one): it is simply up.
        const clock = reachClock(`breaker${up - 1}`);
        const throwK = clock === null ? 1 : pullAt(clock);
        (u.handles as THREE.Object3D[]).forEach((h, i) => {
          const k = i < up - 1 ? 1 : i === up - 1 ? throwK : 0;
          h.rotation.x = Math.PI - k * Math.PI;
        });
        const fl = u.flash as THREE.Mesh;
        const since = clock === null ? 1e9 : clock - PULL_END;
        const spark = since >= 0 && since < 0.23 ? 1 - since / 0.23 : 0;
        fl.visible = spark > 0;
        if (spark > 0) {
          fl.position.set((up - 2) * 0.42, 2.07 + 0.26, (u.back as number) + 0.36);
          (fl.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.85, 0.5).multiplyScalar(30 * spark);
          fl.scale.setScalar(0.6 + spark);
        }
        // The tube: struck when the supply is on (the board's state leaves idle).
        const on = p.state !== 'idle';
        if (on && (u.onAt as number) < 0) u.onAt = t;
        if (!on) u.onAt = -1;
        const ton = on ? t - (u.onAt as number) : -1;
        const tubeK = ton < 0 ? 0 : ton > 1.1 ? 1 : Math.sin(ton * 47) > 0.2 ? 0.9 : 0.05;
        (u.tubeMat as THREE.MeshBasicMaterial).color.setRGB(0.9, 0.95, 1).multiplyScalar(6 * tubeK);
        (u.tubeLight as THREE.PointLight).intensity = 35 * tubeK;
        // The board strikes when the handle lands in his hand, not on the key
        // press 0.75 s before it; with no reach drawn, on the sim's own clock.
        const strike = clock === null ? (p.progress ?? 0) : since >= 0 && since < 0.45 ? 1 - since / 0.45 : 0;
        stateColour(p.state === 'idle' && up > 0 ? 'active' : p.state, tmp, 6 + 20 * strike);
        (u.led.material as THREE.MeshBasicMaterial).color.copy(tmp);
        const L = u.lamp as THREE.PointLight;
        L.color.copy(stateColour(p.state === 'idle' ? 'broken' : p.state, tmp));
        L.intensity = (p.state === 'idle' ? 2 : 8) + 40 * strike;
        break;
      }
      case 'rack-lights':
      case 'pilot': {
        cab.pilot = p.state ?? 'idle';
        const blink = p.state === 'active' ? 0.6 + 0.4 * Math.sin(t * 4) : 1;
        (u.strip.material as THREE.MeshBasicMaterial).color.copy(stateColour(p.state, tmp, p.state === 'idle' ? 0.4 : 8 * blink));
        const L = u.lamp as THREE.PointLight;
        L.color.copy(stateColour(p.state, tmp));
        L.intensity = p.state === 'idle' ? 0 : 10 * blink;
        break;
      }
      case 'rack': {
        const k = p.state === 'idle' ? 0.2 : 2.5 * (0.7 + 0.3 * Math.sin(t * 9 + Math.sin(t * 3.1) * 2));
        (u.face.material as THREE.MeshBasicMaterial).color.copy(stateColour(p.state === 'idle' ? 'idle' : p.state, tmp, k));
        // Waiting on the reel: the cable is on it, and the ring and tag call Voxxy.
        const waiting = cableState === 'idle' || cableState === 'broken';
        // The reel stays, and pays out: it turns with every metre Voxxy draws off
        // it and the coil thins (Michele: "the cable roll should not disappear
        // when Voxxy takes it, but roll").
        const reel = u.reel as THREE.Object3D;
        reel.rotation.x = -m(cableLen) / 0.3;
        const left = 1 - 0.55 * Math.min(1, cableLen / 1480);
        for (const c of reel.children) if (c.userData.coil) c.scale.set(left, left, 1);
        const pulse = waiting ? 0.5 + 0.5 * Math.sin(t * 3.2) : 0;
        ((u.ring as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setRGB(1, 0.48, 0.1).multiplyScalar(waiting ? 0.6 + 2.4 * pulse : 0);
        ((u.tag as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setRGB(1, 0.48, 0.1).multiplyScalar(waiting ? 1.5 + pulse : 0.3);
        break;
      }
      case 'printer': {
        // Dark until the plug clicks home, partway through Voxxy's beat; then the
        // lamps come up with a flash at the socket.
        const pu = plugHand.u;
        const state = pu >= 0 && pu < CLICK_U ? 'idle' : p.state;
        const click = pu >= CLICK_U ? Math.max(0, 1 - (pu - CLICK_U) / 0.14) : 0;
        (u.led.material as THREE.MeshBasicMaterial).color.copy(stateColour(state === 'idle' ? 'broken' : state, tmp, 8 + 30 * click));
        (u.linkLed.material as THREE.MeshBasicMaterial).color.setRGB(0.25, 1, 0.45).multiplyScalar(state === 'idle' ? 0 : 6 + 30 * click);
        (u.spark.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.9, 0.6).multiplyScalar(4 * click);
        (u.spark as THREE.Mesh).scale.setScalar(0.4 + click);
        p = { ...p, state };
        const text = p.state === 'done' ? 'PRINTING' : p.state === 'active' ? 'LINK UP' : 'NO LINK';
        if (text !== u.lcdText) {
          u.lcdText = text;
          const x = (u.lcdCanvas as HTMLCanvasElement).getContext('2d')!;
          x.fillStyle = p.state === 'done' ? '#0f2a12' : '#2a1a05';
          x.fillRect(0, 0, 128, 40);
          x.fillStyle = p.state === 'done' ? '#5cff8a' : p.state === 'active' ? '#ffb347' : '#ff5a4e';
          x.font = 'bold 20px "Courier New", monospace';
          x.textBaseline = 'middle';
          x.fillText(text, 8, 21);
          (u.lcdTex as THREE.CanvasTexture).needsUpdate = true;
        }
        (u.bannerMat as THREE.MeshStandardMaterial).emissiveIntensity = p.state === 'idle' ? 0.15 : 0.55 + (p.state === 'active' ? 0.15 * Math.sin(t * 3) : 0.2);
        if (p.state === 'done' && u.onlineAt === undefined) u.onlineAt = t;
        if (p.state !== 'done') u.onlineAt = undefined;
        // Once online, a badge every 1.1 s: out of the slot, down onto the stack.
        const badges = u.badges as THREE.Mesh[];
        const since = u.onlineAt === undefined ? -1 : t - (u.onlineAt as number);
        const EVERY = 1.1;
        badges.forEach((bdg, i) => {
          const at = since - i * EVERY;
          bdg.visible = at > 0;
          if (!bdg.visible) return;
          const k = Math.min(1, at / 0.6);
          const e = k * k * (3 - 2 * k);
          // Out of the slot, then dropped onto the tray, each one on the last.
          bdg.position.set(0, 0.2 - e * (0.11 - 0.006 * i), 0.29 + e * 0.1);
          bdg.rotation.x = -0.25 * (1 - e);
        });
        break;
      }
      case 'lane':
      case 'dropzone': {
        const pulse = p.state === 'done' ? 1 : 0.65 + 0.35 * Math.sin(t * 3);
        (u.plate.material as THREE.MeshBasicMaterial).color.copy(stateColour(p.state, tmp, (p.state === 'idle' ? 0.5 : 1.6) * pulse));
        break;
      }
      case 'sign': {
        (u.rim.material as THREE.MeshBasicMaterial).color.copy(stateColour(p.state, tmp, p.state === 'idle' ? 1 : 6));
        // A sign whose words change with the game (the bar's "taps ready" only
        // once the beer is in) is repainted when the sim's label changes.
        const label = p.label ?? '';
        if (label !== u.label) {
          u.label = label;
          const [a, b] = label.includes('·') ? label.split('·').map((s) => s.trim()) : [label, ''];
          const face = u.face as THREE.MeshStandardMaterial;
          face.map?.dispose();
          face.map = face.emissiveMap = wayfinding(b ? [['', a], ['', b]] : [['', a]]);
          face.needsUpdate = true;
        }
        break;
      }
      case 'cabinet': {
        const e = THREE.MathUtils.smoothstep(p.progress ?? (p.state === 'open' ? 1 : 0), 0, 1);
        for (const l of u.leaves as THREE.Object3D[]) l.rotation.y = (l.userData.side as number) * e * 1.7;
        const on = cab.pilot !== 'idle';
        const online = cab.pilot === 'done';
        drawScreen(u as never, Math.floor(t * 2) % 2 === 0);
        if (Math.floor(t * 12) !== u.ledFrame) {
          u.ledFrame = Math.floor(t * 12);
          drawLeds(u as never, t, on);
        }
        (u.ledMat as THREE.MeshBasicMaterial).color.setScalar(on ? 3 : 0);
        // The modem's front: MR TR (steady), SD RD (chatter), OH CD AA HS.
        (u.lamps as THREE.Mesh[]).forEach((l, i) => {
          const chatter = Math.sin(t * (17 + i * 5) + i) > 0.2;
          const lit = !on ? false : i < 2 ? true : i < 4 ? chatter : online ? i !== 6 : i === 7 && Math.sin(t * 3) > 0;
          (l.material as THREE.MeshBasicMaterial).color.setRGB(lit ? 6 : 0.05, lit ? (i < 4 ? 0.8 : 1.4) : 0.02, 0);
        });
        (u.glow as THREE.PointLight).color.setHex(online ? 0x3cff78 : 0xffa21a);
        (u.glow as THREE.PointLight).intensity = on ? 6 * (0.3 + 0.7 * e) : 0;
        break;
      }
      case 'terminal':
        // The router's status terminal is the wide one; the prompt the narrow one.
        if ((p.w ?? 0) > 20) cab.status = p;
        else cab.prompt = p;
        break;
      case 'poster': {
        if (!u.tag) break;
        const k = p.state === 'done' ? 3 : p.state === 'active' ? 2 : 0.25 + 0.1 * Math.sin(t * 1.5);
        ((u.tag as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setRGB(1, 0.48, 0.1).multiplyScalar(k);
        break;
      }
      case 'cable': {
        cableState = p.state ?? 'idle';
        cableLen = cableState === 'idle' || cableState === 'broken' ? 0 : (p.v ?? 0);
        // Plugged in, the sim's last point is the socket itself. The floor run
        // stops where Voxxy stood, and the LEAD — floor, up the counter's face,
        // over the lip, into the socket — is drawn on its own, ending at her hand
        // while she carries the plug up and at the socket once it clicks.
        const plugged = p.state === 'done';
        const pts = plugged ? (p.pts ?? []).slice(0, -1) : (p.pts ?? []);
        const last = pts[pts.length - 1];
        const key = `${pts.length}|${last ? Math.round(last.x / 2) : 0}|${last ? Math.round(last.y / 2) : 0}|${p.state}`;
        if (key !== u.key) {
          u.key = key;
          if (u.mesh) {
            o.remove(u.mesh);
            (u.mesh as THREE.Mesh).geometry.dispose();
            u.mesh = null;
          }
          if (pts.length >= 2) {
            // Resampled every ~0.25 m so a tread edge between two recorded points
            // still lifts the cable over it, instead of the curve cutting the step.
            const dense: THREE.Vector3[] = [];
            for (let i = 0; i < pts.length; i++) {
              const a = pts[i];
              const b2 = pts[i + 1];
              const steps = b2 ? Math.max(1, Math.ceil(Math.hypot(b2.x - a.x, b2.y - a.y) / 3)) : 1;
              for (let k = 0; k < steps; k++) {
                const qx = b2 ? a.x + ((b2.x - a.x) * k) / steps : a.x;
                const qy = b2 ? a.y + ((b2.y - a.y) * k) / steps : a.y;
                dense.push(V(m(qx), floorTop(qx, qy) + 0.04, m(qy)));
              }
            }
            const curve = new THREE.CatmullRomCurve3(dense, false, 'catmullrom', 0.1);
            const geo = new THREE.TubeGeometry(curve, Math.min(1600, dense.length * 2), 0.035, 6);
            u.mat ??= new THREE.MeshStandardMaterial({ color: 0x1a4cff, roughness: 0.5 });
            (u.mat as THREE.MeshStandardMaterial).emissive = stateColour(p.state === 'idle' ? 'idle' : p.state, new THREE.Color(), 0.8);
            u.mesh = new THREE.Mesh(geo, u.mat as THREE.MeshStandardMaterial);
            o.add(u.mesh);
          }
        }
        if (plugged && last) drawLead(o, u, V(m(last.x), floorTop(last.x, last.y) + 0.04, m(last.y)));
        else if (u.lead) {
          o.remove(u.lead);
          (u.lead as THREE.Mesh).geometry.dispose();
          u.lead = null;
          (u.plug as THREE.Object3D).visible = false;
          u.leadKey = '';
        }
        break;
      }
      case 'roller':
        poseShutter(u.shutter as THREE.Group, p.progress ?? (p.state === 'broken' ? 1 : 0), 3.2);
        break;
      case 'gate': {
        // Each belt winds back into its post over its own quarter of the swing.
        const u2 = p.progress ?? (p.state === 'open' ? 1 : 0);
        for (const bl of (u.belts ?? []) as Array<{ mesh: THREE.Mesh; rank: number; len: number }>) {
          const k = beltU(u2, bl.rank);
          bl.mesh.scale.x = Math.max(0.001, bl.len * (1 - k * k));
          bl.mesh.visible = k < 1;
        }
        break;
      }
      case 'stair-button': {
        // Down under his finger, and the lamp from red to green on the press.
        const on = p.state === 'done';
        (u.btn as THREE.Object3D).position.y = (u.btnY as number) - 0.03 * Math.min(1, (p.v ?? 0) * 1.5);
        (u.lampMat as THREE.MeshBasicMaterial).color.setRGB(on ? 0.15 : 3, on ? 3.2 : 0.25, on ? 0.5 : 0.15);
        const glow = u.glow as THREE.PointLight;
        glow.color.setRGB(on ? 0.2 : 1, on ? 1 : 0.15, on ? 0.35 : 0.1);
        glow.intensity = on ? 1.6 : 0.5;
        break;
      }
      case 'beer-tap': {
        const pour = p.v ?? 0;
        pourNow = pour;
        if (pour >= 1 && pouredAt < 0) pouredAt = t;
        if (pour < 1) pouredAt = -1;
        const pouring = pour > 0 && pour < 1;
        const ready = p.state === 'done';
        // Pulled forward for the pour, and eased back when it is done.
        const pull = pouring ? Math.min(1, pour * 8) : 0;
        (u.handle as THREE.Object3D).rotation.x = 0.8 * pull;
        (u.handleMat as THREE.MeshStandardMaterial).emissiveIntensity = ready ? 1.6 + 0.4 * Math.sin(t * 4 + p.x) : 0.4;
        (u.ring.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.62, 0.15).multiplyScalar(ready ? 4 + (pouring ? 2 * Math.sin(t * 9) : 0) : 0.15);
        const glass = u.glass as THREE.Object3D;
        // The tap's own glass fills a little ahead of the bar's, it is under the beer.
        const fill = Math.min(1, pour * 1.15);
        fillGlass(glass, fill, pouredAt < 0 ? -1 : t - pouredAt);
        const stream = u.stream as THREE.Mesh;
        stream.visible = pouring && fill < 1;
        if (stream.visible) {
          const topY = 0.39;
          const bottomY = 0.01 + GLASS_SCALE * ((glass.userData.floorY as number) + (glass.userData.height as number) * fill);
          const len = Math.max(0.02, topY - bottomY);
          stream.scale.set(1 + 0.15 * Math.sin(t * 40), len, 1);
          stream.position.set(0, bottomY + len / 2, 0.13);
        }
        break;
      }
      case 'beer-glass': {
        // Every glass on the bar fills with the same pour, staggered along the row.
        const k = p.v ?? 0;
        const fill = p.state === 'done' ? THREE.MathUtils.clamp(pourNow * 1.3 - k * 0.08, 0, 1) : 0;
        const full = fill >= 1 && pouredAt >= 0 ? t - pouredAt - k * 0.12 : -1;
        fillGlass(u.glass as THREE.Object3D, fill, full);
        break;
      }
      case 'ladle':
        // Lit while it is still waiting on the hook; where it IS is world.ts's job.
        (u.glow as THREE.PointLight).intensity = p.state === 'idle' ? 5 + 3 * Math.sin(t * 3) : 0;
        break;
      case 'bar-counter': {
        if (p.state === 'done' && u.doneAt === undefined) u.doneAt = t;
        if (p.state !== 'done') u.doneAt = undefined;
        // The lamps come on one after another over the first second, warm, with
        // a flicker as each one strikes, and stay on.
        const since = u.doneAt === undefined ? -1 : t - (u.doneAt as number);
        (u.bulbs as THREE.Mesh[]).forEach((b, i) => {
          const s0 = since - 0.25 * i;
          const on = s0 < 0 ? 0 : s0 > 0.35 ? 1 : Math.sin(s0 * 60) > 0 ? 0.9 : 0.1;
          (b.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.7, 0.35).multiplyScalar(0.08 + 9 * on);
          const pool = (u.pools as THREE.Mesh[])[i];
          pool.visible = on > 0;
          (pool.material as THREE.MeshBasicMaterial).color.setRGB(0.8, 0.5, 0.2).multiplyScalar(on);
        });
        const up = since < 0 ? 0 : THREE.MathUtils.smoothstep(since, 0, 1.2);
        const bb = u.backbar as THREE.Mesh;
        bb.visible = up > 0;
        (bb.material as THREE.MeshBasicMaterial).color.setRGB(0.9, 0.5, 0.16).multiplyScalar(up);
        (u.warm as THREE.PointLight).intensity = 40 * up;
        const mat = (u.strip as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.color.copy(stateColour(p.state, tmp, p.state === 'idle' ? 0.8 : 3 * (p.state === 'active' ? 0.7 + 0.3 * Math.sin(t * 4) : 1)));
        break;
      }
      case 'duck-target':
      case 'race-marker': {
        const mat = ((u.strip ?? u.ring) as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.color.copy(stateColour(p.state, tmp, p.state === 'idle' ? 0.8 : 3 * (p.state === 'active' ? 0.7 + 0.3 * Math.sin(t * 4) : 1)));
        break;
      }
      case 'pot':
      case 'soup':
        // Carried on Biggy's lid; the sim puts it a little north of his centre.
        o.position.set(m(p.x), ROBOT_HEIGHT_M.biggy + (p.kind === 'soup' ? 0.02 + 0.32 * (p.v ?? 1) : 0), m(p.y + 8));
        break;
      case 'duck':
        o.position.set(m(p.x), 0, m(p.y));
        break;
      case 'crate':
        if (p.label?.startsWith('beer')) {
          const onBiggy = p.state === 'active' || p.state === 'broken';
          const layer = Math.max(0, (p.v ?? 1) - 1);
          o.position.set(m(p.x), (onBiggy ? ROBOT_HEIGHT_M.biggy : 0) + layer * 0.34, m(p.y));
        }
        break;
      default:
        break;
    }
  }

  void GF;
  return { key, build, update, colliders };
}
