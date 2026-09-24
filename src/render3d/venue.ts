/**
 * venue.ts — chapter 1's closed cinema section, built at full height.
 *
 * The 2.5D diorama cuts every wall at 2.45 m so a fixed camera can see in. A
 * third-person camera stands INSIDE the building, so here the walls go to the
 * ceiling and the building gets what a diorama never needed: ceilings, lintels
 * over the doors, coves, a sky outside the windows.
 *
 * Layout is not invented here. Every wall, doorway, room, screen, seat block,
 * column, the bar, the kiosk and the fire door come out of `src/sim/geometry.ts`
 * — the same `floor1Walls()` the sim collides against — so a robot bumps into
 * exactly what it can see (CLAUDE.md: the sim is the only source of truth).
 * What this file adds is height, material and light.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

import { T } from '../sim/constants';
import { CY0, CY1, F1, roomDoor, rooms, roomSeating, floor1Walls } from '../sim/geometry';
import type { Rect, RoomDef, Wall } from '../sim/types';
import { m } from '../sim/units';

import type { Materials } from './materials';
import { box, withReflection, worldUV } from './materials';
import type { VolumePoint } from './pipeline';
import { mergeStatic, noMerge } from './merge';
import type { PlanarReflection } from './reflector';
import { adScreen, ledTicker } from './screens';
import { POSTERS, backlitGlass, cityscape, emitter, exitSign, menuBoard, neonText, poster, rainMask, wayfinding, zaalPanel } from './signs';

/** Where chapter 1's geometry stops, sim px: just past the fire door. */
export const X_END = 912;

export const HEIGHTS = Object.freeze({
  room: 7.2,
  corridor: 5.2,
  cove: 3.9,
  foyer: 5.8,
  door: 2.75,
  foyerOpening: 4.3,
});

type Region = 'corridor' | 'foyer' | 'room' | 'void';

function regionAt(sx: number, sy: number): Region {
  if (sx >= 0 && sx <= X_END + 20 && sy >= CY0 && sy <= CY1) return 'corridor';
  for (const n of [F1.nicheTop, F1.nicheBot]) if (sx >= n.x && sx <= n.x + n.w && sy >= n.y && sy <= n.y + n.h) return 'corridor';
  const f = F1.foyer;
  if (sx >= f.x && sx <= f.x + f.w && sy >= f.y && sy <= f.y + f.h) return 'foyer';
  for (const r of rooms) if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return 'room';
  return 'void';
}

/** A room this build draws: the closed section, plus the sealed Devoxx rooms 10 and 3 up to the stairs. */
const inBuild = (r: RoomDef): boolean => r.x + r.w <= X_END;

export interface Venue3D {
  group: THREE.Group;
  /** Floors that reflect: hidden while the reflection is rendered. */
  reflectors: THREE.Object3D[];
  /** Solid geometry for the camera's collision rays. */
  colliders: THREE.Object3D[];
  /** Static emitters the fog should glow around. */
  volumePoints: VolumePoint[];
  /** Static spot lights the fog should scatter (with shadows where they cast). */
  volumeSpots: Array<{ light: THREE.SpotLight; fog: number }>;
  /** Per-frame: flicker, the beacon, the holograms. */
  update(t: number, dt: number): void;
  /**
   * Cinema E's screen, which the chapter makes a mirror: a real planar mirror
   * whose image the world refreshes only while the camera is near the room.
   */
  mirror: { mesh: Reflector; render: (r: THREE.WebGLRenderer, s: THREE.Scene, c: THREE.Camera) => void; room: Rect } | null;
}

/* ---------------------------------------------------------------- builders */

class Buckets {
  private readonly map = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, g: THREE.BufferGeometry): void {
    const l = this.map.get(mat) ?? [];
    l.push(g);
    this.map.set(mat, l);
  }
  build(parent: THREE.Object3D, opts: { cast?: boolean; receive?: boolean; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.map) {
      const geo = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = opts.cast ?? true;
      mesh.receiveShadow = opts.receive ?? true;
      if (opts.name) mesh.name = opts.name;
      parent.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}

/** One quad, world metres, with world-metric UVs. */
function quad(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, tile: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  worldUV(g, tile);
  return g;
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/**
 * A wall slab from the plan, as quads (no top, no bottom), each one given the
 * material of the space it faces. Long faces are classified in 10 px runs,
 * because one plan wall can face a corridor along one stretch and nothing at
 * all along the next — the building's west wall faces the corridor for 10 m
 * and the gap behind the foyer window for the rest, and classifying it once,
 * at its midpoint, stood a 56 m sheet of plaster between the foyer and the city.
 */
function wallSlab(b: Buckets, r: Rect, y0: number, y1: number, pick: (reg: Region) => THREE.Material): void {
  const tile = 2.5;
  const STEP = 10;
  // Along-x faces (normal -z at r.y, +z at r.y + r.h).
  for (const [zS, off, sign] of [
    [r.y, -2, -1],
    [r.y + r.h, 2, 1],
  ] as Array<[number, number, number]>) {
    const z = m(zS);
    runs(r.x, r.x + r.w, (sx) => regionAt(sx, zS + off), (a, c, reg) => {
      const xa = m(a);
      const xc = m(c);
      const q = sign < 0 ? quad(V(xc, y0, z), V(xa, y0, z), V(xa, y1, z), V(xc, y1, z), tile) : quad(V(xa, y0, z), V(xc, y0, z), V(xc, y1, z), V(xa, y1, z), tile);
      b.add(pick(reg), q);
    });
  }
  // Along-z faces (normal -x at r.x, +x at r.x + r.w).
  for (const [xS, off, sign] of [
    [r.x, -2, -1],
    [r.x + r.w, 2, 1],
  ] as Array<[number, number, number]>) {
    const x = m(xS);
    runs(r.y, r.y + r.h, (sz) => regionAt(xS + off, sz), (a, c, reg) => {
      const za = m(a);
      const zc = m(c);
      const q = sign < 0 ? quad(V(x, y0, za), V(x, y0, zc), V(x, y1, zc), V(x, y1, za), tile) : quad(V(x, y0, zc), V(x, y0, za), V(x, y1, za), V(x, y1, zc), tile);
      b.add(pick(reg), q);
    });
  }

  function runs(a0: number, a1: number, at: (s: number) => Region, emit: (a: number, c: number, reg: Region) => void): void {
    let start = a0;
    let cur: Region | null = null;
    for (let s0 = a0; s0 < a1; s0 += STEP) {
      const s1 = Math.min(a1, s0 + STEP);
      const reg = at((s0 + s1) / 2);
      if (reg !== cur) {
        if (cur && cur !== 'void') emit(start, s0, cur);
        cur = reg;
        start = s0;
      }
    }
    if (cur && cur !== 'void') emit(start, a1, cur);
  }
}

/** The foyer's window opening: sim y span of the glazing, and its sill/head heights. */
function foyerWindow(): { sy0: number; sy1: number; y0: number; y1: number } {
  // The north two thirds of the west wall; the south third is the back bar's pier.
  return { sy0: F1.foyer.y + 14, sy1: F1.foyer.y + 128, y0: 0.45, y1: HEIGHTS.foyer - 0.55 };
}

function clipX(r: Rect): Rect | null {
  if (r.x >= X_END) return null;
  return { ...r, w: Math.min(r.x + r.w, X_END) - r.x };
}

/* ------------------------------------------------------------------ build */

export function buildVenue(mats: Materials, refl: PlanarReflection): Venue3D {
  const group = new THREE.Group();
  group.name = 'venue-ch1';
  const reflectors: THREE.Object3D[] = [];
  const colliders: THREE.Object3D[] = [];
  const volumePoints: VolumePoint[] = [];
  const volumeSpots: Array<{ light: THREE.SpotLight; fog: number }> = [];
  const updaters: Array<(t: number, dt: number) => void> = [];
  let mirror: Venue3D['mirror'] = null;

  const walls: Wall[] = floor1Walls();
  const shell = new Buckets();
  const pick = (reg: Region): THREE.Material => (reg === 'room' ? mats.acoustic : mats.plaster);

  /* --------------------------------------------------------------- floors */

  const floorMat = mats.terrazzo;
  withReflection(floorMat, refl, 0.8, 0.035);
  const floorGeo: THREE.BufferGeometry[] = [];
  const addFloor = (r: Rect): void => {
    const g = quad(V(m(r.x), 0, m(r.y + r.h)), V(m(r.x + r.w), 0, m(r.y + r.h)), V(m(r.x + r.w), 0, m(r.y)), V(m(r.x), 0, m(r.y)), 2.4);
    floorGeo.push(g);
  };
  // Terrazzo up to the fire door; beyond it the Devoxx half has the navy
  // carpet the venue photos show (CAPTIONS.md: "dark navy carpet").
  addFloor({ x: 0, y: CY0 - T, w: F1.fireX + 7, h: CY1 - CY0 + 2 * T });
  addFloor({ x: F1.foyer.x - T, y: F1.foyer.y + T, w: F1.foyer.w + 2 * T, h: F1.foyer.h - T });
  const floor = new THREE.Mesh(mergeGeometries(floorGeo)!, floorMat);
  floor.receiveShadow = true;
  floor.name = 'floor-terrazzo';
  noMerge(floor);
  group.add(floor);
  reflectors.push(floor);

  const carpet = new Buckets();
  {
    const x0 = F1.fireX + 7;
    const x1 = X_END + 40;
    carpet.add(mats.carpet, quad(V(m(x0), 0.002, m(CY1 + T)), V(m(x1), 0.002, m(CY1 + T)), V(m(x1), 0.002, m(CY0 - T)), V(m(x0), 0.002, m(CY0 - T)), 2.5));
  }
  for (const r of rooms) {
    if (!r.closed) continue;
    carpet.add(mats.carpetRed, quad(V(m(r.x), 0.002, m(r.y + r.h)), V(m(r.x + r.w), 0.002, m(r.y + r.h)), V(m(r.x + r.w), 0.002, m(r.y)), V(m(r.x), 0.002, m(r.y)), 3));
  }
  carpet.build(group, { cast: false });

  /* ---------------------------------------------------------------- walls */

  const win = foyerWindow();
  for (const w of walls) {
    if (w.hidden || w.low || w.glass || w.kind) continue;
    const r = clipX(w);
    if (!r) continue;
    if (r.x === F1.foyer.x - T && r.y === F1.foyer.y && r.w === T) {
      // The foyer's west wall carries the window: sill, head, and the two piers.
      wallSlab(shell, { ...r, y: r.y, h: win.sy0 - r.y }, 0, HEIGHTS.room, pick);
      wallSlab(shell, { ...r, y: win.sy1, h: r.y + r.h - win.sy1 }, 0, HEIGHTS.room, pick);
      wallSlab(shell, { ...r, y: win.sy0, h: win.sy1 - win.sy0 }, 0, win.y0, pick);
      wallSlab(shell, { ...r, y: win.sy0, h: win.sy1 - win.sy0 }, win.y1, HEIGHTS.room, pick);
      continue;
    }
    // The stair niches' walls run on down the flight.
    const niche = [F1.nicheTop, F1.nicheBot].some((n) => r.x >= n.x - T - 1 && r.x <= n.x + n.w + 1 && r.y >= n.y - T - 1 && r.y <= n.y + n.h + 1);
    wallSlab(shell, r, niche ? -3.6 : 0, HEIGHTS.room, pick);
  }
  for (const n of [F1.nicheTop, F1.nicheBot]) {
    const y = n === F1.nicheTop ? CY0 - T : CY1;
    wallSlab(shell, { x: n.x, y, w: n.w, h: T }, 3.0, HEIGHTS.room, pick);
  }
  // Lintels over every doorway on the corridor, and over the foyer's wide mouth.
  for (const r of rooms) {
    if (!inBuild(r)) continue;
    const d = roomDoor(r);
    const y = r.side < 0 ? CY0 - T : CY1;
    wallSlab(shell, { x: d.x, y, w: d.w, h: T }, HEIGHTS.door, HEIGHTS.room, pick);
  }
  wallSlab(shell, { x: F1.foyer.x, y: CY1, w: F1.foyer.w, h: T }, HEIGHTS.foyerOpening, HEIGHTS.room, pick);
  // The end of the world: a wall just behind the fire door.
  wallSlab(shell, { x: X_END, y: CY0 - T, w: 8, h: CY1 - CY0 + 2 * T }, 0, HEIGHTS.room, () => mats.plaster);

  // Door jamb trims (steel) so the openings read as doors.
  const trims = new Buckets();
  for (const r of rooms) {
    if (!inBuild(r)) continue;
    const d = roomDoor(r);
    const zc = m(r.side < 0 ? CY0 - T / 2 : CY1 + T / 2);
    const depth = m(T) + 0.08;
    for (const x of [d.x, d.x + d.w]) trims.add(mats.darkMetal, box(0.12, HEIGHTS.door, depth, V(m(x), HEIGHTS.door / 2, zc)));
    trims.add(mats.darkMetal, box(m(d.w) + 0.24, 0.14, depth, V(m(d.cx), HEIGHTS.door + 0.07, zc)));
  }
  trims.build(group);

  /* -------------------------------------------------------------- ceilings */

  const ceil = new Buckets();
  const c0 = m(CY0);
  const c1 = m(CY1);
  const xEnd = m(X_END + 8);
  // Corridor: a flat soffit between two curved coves (CAPTIONS.md: "pale curved
  // plaster vaults springing from square dark columns along both sides").
  const coveW = 1.6;
  ceil.add(mats.ceiling, quad(V(0, HEIGHTS.corridor, c0 + coveW), V(xEnd, HEIGHTS.corridor, c0 + coveW), V(xEnd, HEIGHTS.corridor, c1 - coveW), V(0, HEIGHTS.corridor, c1 - coveW), 3));
  const segs = 8;
  for (const side of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI / 2;
      const a1 = ((i + 1) / segs) * Math.PI / 2;
      const rise = HEIGHTS.corridor - HEIGHTS.cove;
      const zAt = (a: number): number => (side < 0 ? c0 + coveW * (1 - Math.cos(a)) : c1 - coveW * (1 - Math.cos(a)));
      const yAt = (a: number): number => HEIGHTS.cove + rise * Math.sin(a);
      const za = zAt(a0);
      const zb = zAt(a1);
      const ya = yAt(a0);
      const yb = yAt(a1);
      // Wound so the normals face down and into the corridor (they were
      // inverted once, and back-face culling made the whole vault vanish).
      if (side < 0) ceil.add(mats.ceiling, quad(V(xEnd, ya, za), V(xEnd, yb, zb), V(0, yb, zb), V(0, ya, za), 3));
      else ceil.add(mats.ceiling, quad(V(0, ya, za), V(0, yb, zb), V(xEnd, yb, zb), V(xEnd, ya, za), 3));
    }
  }
  // Rooms and foyer: flat.
  for (const r of rooms) {
    if (!r.closed) continue;
    ceil.add(mats.acoustic, quad(V(m(r.x), HEIGHTS.room, m(r.y)), V(m(r.x + r.w), HEIGHTS.room, m(r.y)), V(m(r.x + r.w), HEIGHTS.room, m(r.y + r.h)), V(m(r.x), HEIGHTS.room, m(r.y + r.h)), 3));
  }
  const f = F1.foyer;
  ceil.add(mats.ceiling, quad(V(m(f.x), HEIGHTS.foyer, m(f.y)), V(m(f.x + f.w), HEIGHTS.foyer, m(f.y)), V(m(f.x + f.w), HEIGHTS.foyer, m(f.y + f.h)), V(m(f.x), HEIGHTS.foyer, m(f.y + f.h)), 3));
  // Transverse ribs across the corridor at every column line.
  const ribs = new Buckets();
  const colXs = walls.filter((w) => w.kind === 'corridor-column' && w.x < X_END).map((w) => w.x + w.w / 2);
  for (const x of colXs) ribs.add(mats.plaster, box(0.5, 0.45, c1 - c0, V(m(x), HEIGHTS.corridor - 0.2, (c0 + c1) / 2)));
  ribs.build(group);
  const ceilings = ceil.build(group, { cast: true });

  /* ------------------------------------------------------ columns, plinths */

  const cols = new Buckets();
  for (const w of walls) {
    if (w.x >= X_END) continue;
    if (w.kind === 'corridor-column') {
      const cx = m(w.x + w.w / 2);
      const cz = m(w.y + w.h / 2);
      cols.add(mats.darkMetal, box(m(w.w), HEIGHTS.cove + 0.2, m(w.h), V(cx, (HEIGHTS.cove + 0.2) / 2, cz)));
      cols.add(mats.steel, box(m(w.w) + 0.12, 0.12, m(w.h) + 0.12, V(cx, 0.06, cz)));
    }
  }
  const colMeshes = cols.build(group);
  colliders.push(...colMeshes);

  /* ---------------------------------------------------------- the rooms */

  const seatsUph: THREE.Matrix4[] = [];
  for (const r of rooms) {
    if (!r.closed) continue;
    dressRoom(r);
    if (r.n === 'E') continue; // E's rows are the chapter's, see dressSeatRows()
    const s = roomSeating(r);
    if (!s) continue;
    for (const y of s.rows) {
      for (const [x0, x1] of s.blocks) {
        const width = m(x1 - x0);
        if (width < 1.2) continue;
        const n = Math.floor(width / 0.62);
        const pad = (width - n * 0.62) / 2;
        for (let i = 0; i < n; i++) {
          const mm = new THREE.Matrix4().makeRotationY(s.inward > 0 ? 0 : Math.PI);
          mm.setPosition(m(x0) + pad + 0.31 + i * 0.62, 0, m(y));
          seatsUph.push(mm);
        }
      }
    }
  }
  addSeats(group, mats, seatsUph);

  function dressRoom(r: RoomDef): void {
    // Screen on the far wall, with black masking. Room E's is the chapter's mirror.
    const far = r.side < 0 ? m(r.y) : m(r.y + r.h);
    const inward = r.side < 0 ? 1 : -1;
    const sw = m(r.w) * 0.6;
    const sh = sw / 2.39;
    const sy = 1.6 + sh / 2;
    let scr: THREE.Mesh;
    if (r.n === 'E') {
      const refl = new Reflector(new THREE.PlaneGeometry(sw, sh), {
        textureWidth: 1024,
        textureHeight: Math.round(1024 / 2.39),
        clipBias: 0.003,
        color: new THREE.Color(0.85, 0.87, 0.9),
        multisample: 0,
      });
      const render = refl.onBeforeRender.bind(refl) as unknown as (r2: THREE.WebGLRenderer, s2: THREE.Scene, c2: THREE.Camera) => void;
      refl.onBeforeRender = () => {};
      noMerge(refl);
      scr = refl;
      mirror = { mesh: refl, render, room: { x: r.x, y: r.y, w: r.w, h: r.h } };
    } else {
      scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshPhysicalMaterial({ color: 0x9a9da3, roughness: 0.55, metalness: 0 }));
      scr.receiveShadow = true;
    }
    scr.position.set(m(r.x + r.w / 2), sy, far + inward * 0.42);
    scr.rotation.y = inward > 0 ? 0 : Math.PI;
    group.add(scr);
    const mask = new THREE.Mesh(box(sw + 1.2, sh + 1.0, 0.1, V(0, 0, -0.06)), mats.rubber);
    mask.position.copy(scr.position);
    mask.rotation.copy(scr.rotation);
    group.add(mask);
    // Aisle step lights: the only light in a dark auditorium.
    const s = roomSeating(r);
    if (s) {
      const dots: THREE.Vector3[] = [];
      for (const y of s.rows) {
        for (let i = 1; i < s.blocks.length; i++) {
          const ax0 = s.blocks[i - 1][1];
          const ax1 = s.blocks[i][0];
          dots.push(V(m(ax0) + 0.15, 0.08, m(y)), V(m(ax1) - 0.15, 0.08, m(y)));
        }
      }
      addStepLights(group, dots);
    }
    // Wall sconces on standby: a dim amber glow under each shade, the only
    // light a dark auditorium keeps.
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.2).multiplyScalar(5), toneMapped: false });
    for (const x of [r.x + 1.2, r.x + r.w - 1.2]) {
      for (let k = 1; k <= 3; k++) {
        const z = m(r.y + (r.h * k) / 4);
        const sx = m(x) + (x < r.x + r.w / 2 ? 0.1 : -0.1);
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.5, 16, 1, true), mats.steel);
        sc.position.set(sx, 3.6, z);
        group.add(sc);
        const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), glowMat);
        bulb.rotation.x = Math.PI / 2;
        bulb.position.set(sx, 3.36, z);
        group.add(bulb);
        volumePoints.push({ position: V(sx, 3.2, z), color: new THREE.Color(1, 0.5, 0.18).multiplyScalar(0.25), range: 1.8 });
      }
    }
    // Pleated velvet drapes down both side walls.
    for (const side of [-1, 1]) {
      const len = m(r.h) - 1.2;
      const g = new THREE.PlaneGeometry(len, 5.4, Math.ceil(len * 12), 1);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.abs(Math.sin(pos.getX(i) * 9)) * 0.14);
      g.computeVertexNormals();
      const drape = new THREE.Mesh(g, mats.drape);
      drape.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      drape.position.set(side < 0 ? m(r.x) + 0.05 : m(r.x + r.w) - 0.05, 3.9, m(r.y + r.h / 2));
      drape.receiveShadow = true;
      group.add(drape);
    }
    // Fibre-optic star ceiling.
    group.add(starCeiling(r));
  }

  /* ---------------------------------------------------------- the foyer */

  buildFoyer();

  function buildFoyer(): void {
    const bar = F1.bar;
    const bx = m(bar.x + bar.w / 2);
    const bz = m(bar.y + bar.h / 2);
    const bw = m(bar.w);
    const bd = m(bar.h);
    const b = new Buckets();
    b.add(mats.counter, box(bw, 1.1, bd, V(bx, 0.55, bz)));
    b.add(mats.blackGloss, box(bw + 0.2, 0.06, bd + 0.2, V(bx, 1.13, bz)));
    b.add(mats.darkMetal, box(bw - 0.4, 0.12, 0.2, V(bx, 0.06, bz + bd / 2 - 0.08)));
    // Back bar: shelves of bottles against the foyer's west wall.
    // Back bar on the west wall's solid pier, south of the window.
    const shelfX = m(F1.foyer.x) + 0.35;
    const shelfZ = m(F1.foyer.y + 178);
    for (let k = 0; k < 3; k++) b.add(mats.darkMetal, box(0.5, 0.04, 5, V(shelfX, 1.3 + k * 0.55, shelfZ)));
    // Full-height back-bar cabinet round the shelves.
    b.add(mats.darkMetal, box(0.55, 0.12, 5.4, V(shelfX, 3.0, shelfZ)));
    b.add(mats.darkMetal, box(0.55, 3.0, 0.12, V(shelfX, 1.5, shelfZ - 2.64)));
    b.add(mats.darkMetal, box(0.55, 3.0, 0.12, V(shelfX, 1.5, shelfZ + 2.64)));
    const meshes = b.build(group);
    colliders.push(...meshes);
    // LED strip under the bar's lip: magenta, the bar's one colour.
    const strip = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.08, 0.55).multiplyScalar(24), toneMapped: false }));
    strip.position.set(bx, 1.02, bz + bd / 2 + 0.06);
    group.add(strip);
    volumePoints.push({ position: V(bx, 0.9, bz + bd / 2 + 0.3), color: new THREE.Color(1, 0.08, 0.55).multiplyScalar(2.2), range: 4 });
    const barGlow = new THREE.PointLight(0xff1a8c, 60, 8, 2);
    barGlow.position.set(bx, 0.6, bz + bd / 2 + 0.6);
    group.add(barGlow);
    // Bottles: glassy instanced cylinders of mixed heights, packed tight so
    // the shelves read as stock, not as a row of samples.
    const bottleGeo = new THREE.CylinderGeometry(0.04, 0.045, 1, 10);
    bottleGeo.translate(0, 0.5, 0);
    const bottleMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.9 });
    const perShelf = 22;
    const bottles = new THREE.InstancedMesh(bottleGeo, bottleMat, perShelf * 3);
    const tints = [0x1e4a2a, 0x5a2a0a, 0x2a1a0a, 0x9aa8b0, 0x6a1020, 0x3a3a10];
    let bi = 0;
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < perShelf; i++) {
        const hh = 0.24 + ((i * 7 + k * 3) % 5) * 0.035;
        const mm = new THREE.Matrix4()
          .makeTranslation(shelfX + 0.05 * ((i % 2) * 2 - 1), 1.32 + k * 0.55, shelfZ - 2.35 + i * 0.224)
          .multiply(new THREE.Matrix4().makeScale(1, hh, 1));
        bottles.setMatrixAt(bi, mm);
        bottles.setColorAt(bi, new THREE.Color(tints[(i * 5 + k) % tints.length]));
        bi++;
      }
    }
    group.add(bottles);
    // Backlit frosted amber glass behind the bottles: a bright band under each
    // shelf, so every bottle becomes a silhouette with a glowing rim.
    const backlight = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 1.65),
      new THREE.MeshBasicMaterial({ map: backlitGlass(3), color: new THREE.Color(1, 0.42, 0.12).multiplyScalar(2.4), toneMapped: false }),
    );
    backlight.rotation.y = Math.PI / 2;
    backlight.position.set(m(F1.foyer.x) + 0.07, 1.3 + 0.825, shelfZ);
    group.add(backlight);
    const bl = new THREE.PointLight(0xff9040, 30, 6, 2);
    bl.position.set(shelfX + 1.2, 2.0, shelfZ);
    group.add(bl);
    volumePoints.push({ position: bl.position.clone(), color: new THREE.Color(1, 0.55, 0.2).multiplyScalar(0.8), range: 3 });
    // And a second neon on the pier above it, in the corridor's cyan.
    const cocktails = emitter(neonText('cocktails', { w: 1024, h: 256, font: 'italic bold 150px "Brush Script MT", "Segoe Script", cursive' }), 3.6, 0.9, 18, 0x33e6ff);
    cocktails.rotation.y = Math.PI / 2;
    cocktails.position.set(m(F1.foyer.x) + 0.1, 4.1, shelfZ);
    group.add(cocktails);
    const cl = new THREE.PointLight(0x33e6ff, 40, 7, 2);
    cl.position.set(m(F1.foyer.x) + 1.0, 4.1, shelfZ);
    group.add(cl);
    volumePoints.push({ position: cl.position.clone(), color: new THREE.Color(0.2, 0.9, 1).multiplyScalar(1.5), range: 4 });
    // Neon over the bar.
    const neon = emitter(neonText('BAR', { w: 1024, h: 384 }), 3.2, 1.2, 22, 0xff2a8a);
    neon.position.set(bx, 3.6, bz - 0.2);
    group.add(neon);
    volumePoints.push({ position: V(bx, 3.6, bz), color: new THREE.Color(1, 0.12, 0.5).multiplyScalar(5), range: 6 });
    const neonLight = new THREE.PointLight(0xff2a8a, 140, 12, 2);
    neonLight.position.set(bx, 3.4, bz + 0.4);
    group.add(neonLight);
    // Stools.
    for (const s of F1.barStools) {
      const st = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 24), mats.blackGloss);
      seat.position.y = 0.78;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.76, 10), mats.steel);
      pole.position.y = 0.38;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 24), mats.steel);
      foot.position.y = 0.015;
      st.add(seat, pole, foot);
      st.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      st.position.set(m(s.x + s.w / 2), 0, m(s.y + s.h / 2));
      group.add(st);
    }
    // Pendant discs (CAPTIONS.md: "big white pendant disc"), dead but for a thin rim.
    for (const [px, pz] of [
      [F1.foyer.x + 55, F1.foyer.y + 70],
      [F1.foyer.x + 110, F1.foyer.y + 170],
    ]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.1, 48), mats.counter);
      disc.position.set(m(px), HEIGHTS.foyer - 1.4, m(pz));
      group.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.012, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.85, 1).multiplyScalar(6), toneMapped: false }));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(m(px), HEIGHTS.foyer - 1.45, m(pz));
      group.add(rim);
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.35, 4), mats.darkMetal);
      wire.position.set(m(px), HEIGHTS.foyer - 0.7, m(pz));
      group.add(wire);
    }
    buildWindows();
    buildKiosk();
  }

  /** The foyer's west wall is glass: the city at night, through rain. */
  function buildWindows(): void {
    const wx = m(F1.foyer.x - T / 2);
    const z0 = m(win.sy0);
    const z1 = m(win.sy1);
    const { y0, y1 } = win;
    const frame = new Buckets();
    const nM = 6;
    for (let i = 0; i <= nM; i++) {
      const z = z0 + ((z1 - z0) * i) / nM;
      frame.add(mats.darkMetal, box(0.2, y1 - y0, 0.1, V(wx + 0.12, (y0 + y1) / 2, z)));
    }
    frame.add(mats.darkMetal, box(0.22, 0.14, z1 - z0 + 0.1, V(wx + 0.12, y0, (z0 + z1) / 2)));
    frame.add(mats.darkMetal, box(0.22, 0.14, z1 - z0 + 0.1, V(wx + 0.12, y1, (z0 + z1) / 2)));
    frame.add(mats.darkMetal, box(0.22, 0.08, z1 - z0 + 0.1, V(wx + 0.12, (y0 + y1) * 0.55, (z0 + z1) / 2)));
    frame.build(group);
    // Glass with rain: droplets refract (fake) the city behind.
    const rain = rainMask();
    const glassMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { tRain: { value: rain }, time: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tRain; uniform float time; varying vec2 vUv;
        void main(){
          vec2 uv = vUv * vec2(3., 2.);
          float drops = texture2D(tRain, uv).r;
          float runs = texture2D(tRain, uv * vec2(1., .5) + vec2(0., time * .05)).g;
          // Drops darken what is behind them and carry a thin bright rim —
          // water, not snow.
          float rim = smoothstep(.2, .6, drops) - smoothstep(.6, 1., drops);
          float a = .03 + .22 * drops + .12 * runs;
          gl_FragColor = vec4(vec3(.55, .65, .85) * (rim * .35 + runs * .2), a);
        }`,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), glassMat);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(wx + 0.1, (y0 + y1) / 2, (z0 + z1) / 2);
    group.add(glass);
    updaters.push((t) => (glassMat.uniforms.time.value = t));
    // The city, far enough out to parallax.
    const city = emitter(cityscape(), 420, 157, 5, 0xffffff, false);
    city.rotation.y = Math.PI / 2;
    // Far out, horizon a little under the foyer's eye line (it is a first floor).
    // Texture horizon is 62% down the plane; put it ~1 m under the eye line.
    city.position.set(wx - 160, -1 + 157 * (0.62 - 0.5), (z0 + z1) / 2 + 20);
    (city.material as THREE.MeshBasicMaterial).fog = false;
    group.add(city);
    // Street-level glow and the one street lamp whose light falls in through the glass.
    const lamp = new THREE.SpotLight(0x9fc4ff, 900, 40, 0.5, 0.7, 2);
    lamp.position.set(wx - 7, 9, (z0 + z1) / 2 - 3);
    lamp.target.position.set(wx + 7, 0, (z0 + z1) / 2 + 2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.camera.near = 1;
    lamp.shadow.camera.far = 40;
    group.add(lamp, lamp.target);
    volumeSpots.push({ light: lamp, fog: 0.015 });
    // Hide the plaster that would sit between the glass and the city: a black
    // "void" wall stays for the frame's reveal, the view replaces the rest.
  }

  function buildKiosk(): void {
    const k = F1.kiosk;
    const cx = m(k.x + k.w / 2);
    const cz = m(k.y + k.h / 2);
    const kw = m(k.w);
    const kd = m(k.h);
    const H = 2.9;
    const g = new Buckets();
    // Floor plinth, roof, frame posts.
    g.add(mats.blackGloss, box(kw, 0.18, kd, V(cx, H + 0.09, cz)));
    for (const [px, pz] of [
      [k.x, k.y],
      [k.x + k.w, k.y],
      [k.x, k.y + k.h],
      [k.x + k.w, k.y + k.h],
    ]) g.add(mats.steel, box(0.1, H, 0.1, V(m(px), H / 2, m(pz))));
    // Counter inside, along the east glass.
    g.add(mats.counter, box(0.7, 1.0, kd - 0.6, V(cx + kw / 2 - 0.5, 0.5, cz)));
    // Hatch frame on the west side (Voxxy-sized: 0.9 m tall).
    g.add(mats.steel, box(0.12, 0.08, m(24), V(m(k.x), 0.9, m(k.y + 28))));
    const meshes = g.build(group);
    colliders.push(...meshes);
    // Glass walls from the sim's glass slabs.
    for (const w of walls) {
      if (!w.glass || w.kind === 'screen') continue;
      // The sim's glazing is a 6 px (0.48 m) slab so it can stop a robot; the
      // glass itself is one thin pane down the middle of it, with a steel mullion
      // at each end.
      const along = w.w >= w.h;
      const len = m(along ? w.w : w.h);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 0.1), mats.glass);
      pane.position.set(m(w.x + w.w / 2), H / 2, m(w.y + w.h / 2));
      if (!along) pane.rotation.y = Math.PI / 2;
      pane.renderOrder = 2;
      group.add(pane);
      const rail = new THREE.Mesh(along ? box(len, 0.06, 0.08, V(0, 0, 0)) : box(0.08, 0.06, len, V(0, 0, 0)), mats.steel);
      rail.position.set(pane.position.x, 0.03, pane.position.z);
      group.add(rail);
    }
    // The hatch: a hinged flap above a Voxxy-sized gap (the sim's hidden wall).
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, m(24) - 0.1), mats.glass);
    flap.position.set(m(k.x) - 0.2, 1.3, m(k.y + 28));
    flap.rotation.z = -0.5;
    group.add(flap);
    const glassAbove = new THREE.Mesh(new THREE.BoxGeometry(0.02, H - 0.9, m(24)), mats.glass);
    glassAbove.position.set(m(k.x), 0.9 + (H - 0.9) / 2, m(k.y + 28));
    group.add(glassAbove);
    // Popcorn machine: a glass cabinet on a red enamel stand, lit from inside,
    // heaped with popcorn (a bumpy instanced pile, not a light box).
    const pop = new THREE.Group();
    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.78, 0.6), new THREE.MeshPhysicalMaterial({ color: 0xfff2d0, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.2 }));
    cabGlass.position.y = 1.52;
    const redMat = new THREE.MeshPhysicalMaterial({ color: 0xb3120e, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.74, 1.1, 0.62), redMat);
    base.position.y = 0.55;
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.68), redMat);
    hat.position.y = 2.01;
    const kernelMat = new THREE.MeshStandardMaterial({ color: 0xf6e3a8, roughness: 0.8, emissive: new THREE.Color(1, 0.75, 0.35), emissiveIntensity: 0.35 });
    const kernels = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.03, 0), kernelMat, 420);
    for (let i = 0; i < 420; i++) {
      const u = Math.random();
      const v = Math.random();
      const hgt = 0.22 * (1 - Math.pow(Math.abs(u - 0.5) * 2, 2)) * (1 - Math.pow(Math.abs(v - 0.5) * 2, 2));
      kernels.setMatrixAt(i, new THREE.Matrix4().compose(
        new THREE.Vector3((u - 0.5) * 0.66, 1.15 + Math.random() * (0.05 + hgt), (v - 0.5) * 0.54),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0)),
        new THREE.Vector3(1, 0.8 + Math.random() * 0.5, 1),
      ));
    }
    const warmer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.2).multiplyScalar(6), toneMapped: false }));
    warmer.position.y = 1.9;
    pop.add(cabGlass, base, hat, kernels, warmer);
    pop.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    pop.position.set(cx - kw / 2 + 0.7, 0, cz - kd / 2 + 0.7);
    group.add(pop);
    const popLight = new THREE.PointLight(0xffb040, 24, 5, 2);
    popLight.position.set(pop.position.x, 1.75, pop.position.z);
    group.add(popLight);
    // Menu board over the counter: a backlit panel, the kiosk's own sign.
    const menu = emitter(menuBoard(), 2.6, 1.1, 2.4, 0xffffff, false);
    menu.position.set(cx + kw / 2 - 0.12, 2.3, cz);
    menu.rotation.y = -Math.PI / 2;
    group.add(menu);
    volumePoints.push({ position: popLight.position.clone(), color: new THREE.Color(1, 0.65, 0.2).multiplyScalar(1.2), range: 3 });
    // Neon on the roof, and menu screens behind the counter.
    const neon = emitter(neonText('POPCORN', { w: 1024, h: 256 }), 3.6, 0.9, 18, 0xffc21a);
    neon.position.set(cx, H + 0.75, cz + kd / 2 + 0.02);
    group.add(neon);
    const neonBack = neon.clone();
    neonBack.rotation.y = Math.PI;
    neonBack.position.z = cz - kd / 2 - 0.02;
    group.add(neonBack);
    volumePoints.push({ position: V(cx, H + 0.8, cz + kd / 2), color: new THREE.Color(1, 0.7, 0.1).multiplyScalar(4), range: 5 });
    const nl = new THREE.PointLight(0xffb020, 90, 10, 2);
    nl.position.set(cx, H + 0.6, cz + kd / 2 + 0.8);
    group.add(nl);
  }

  /* ---------------------------------------------------- corridor dressing */

  // Orange Zaal panels beside each door (CAPTIONS.md #1), lettered as the sim names the rooms.
  for (const r of rooms) {
    if (!inBuild(r)) continue;
    const d = roomDoor(r);
    const zFace = r.side < 0 ? m(CY0) + 0.03 : m(CY1) - 0.03;
    const panel = emitter(zaalPanel(String(r.n)), 1.1, 2.2, 3.2, 0xffffff, false);
    panel.position.set(m(d.x - 18), 2.3, zFace);
    panel.rotation.y = r.side < 0 ? 0 : Math.PI;
    group.add(panel);
    const pl = new THREE.PointLight(0xff6a10, 30, 7, 2);
    pl.position.set(panel.position.x, 2.2, zFace + (r.side < 0 ? 0.8 : -0.8));
    group.add(pl);
    volumePoints.push({ position: pl.position.clone(), color: new THREE.Color(1, 0.4, 0.08).multiplyScalar(1.1), range: 3.2 });
  }

  // Backlit poster boxes between the doors.
  // Free wall spans only (worked out from the sim's doors, columns and Zaal
  // panels — the first guess put two posters in doorways and one behind a column).
  const posterSpots: Array<[number, number]> = [
    [199, -1],
    [539, -1],
    [330, 1],
    [530, 1],
  ];
  posterSpots.forEach(([x, side], i) => {
    const zFace = side < 0 ? m(CY0) + 0.08 : m(CY1) - 0.08;
    const tx = poster(POSTERS[i % POSTERS.length]);
    const p = emitter(tx, 1.3, 1.95, 2.6, 0xffffff, false);
    p.position.set(m(x), 2.0, zFace + (side < 0 ? 0.02 : -0.02));
    p.rotation.y = side < 0 ? 0 : Math.PI;
    group.add(p);
    const frame = new THREE.Mesh(box(1.5, 2.15, 0.14, V(0, 0, 0)), mats.darkMetal);
    frame.position.set(m(x), 2.0, zFace - (side < 0 ? 0.05 : -0.05));
    group.add(frame);
    if (i % 2 === 0) {
      const pl = new THREE.PointLight(0xffb070, 18, 6, 2);
      pl.position.set(m(x), 2.0, zFace + (side < 0 ? 0.7 : -0.7));
      group.add(pl);
    }
  });

  // A tall animated ad between cinemas B and C: the conference, the keynote
  // speaker still TBA, tomato soup.
  {
    const ad = adScreen(1.7, 3.3);
    ad.position.set(m(369), 2.15, m(CY0) + 0.07);
    group.add(ad);
    updaters.push((t) => (ad.userData.tick as (t: number) => void)(t));
    const frame = new THREE.Mesh(box(1.9, 3.5, 0.12, V(0, 0, 0)), mats.darkMetal);
    frame.position.set(m(369), 2.15, m(CY0) + 0.0);
    group.add(frame);
    const pl = new THREE.PointLight(0xb040ff, 26, 7, 2);
    pl.position.set(m(369), 1.8, m(CY0) + 1.2);
    group.add(pl);
    volumePoints.push({ position: pl.position.clone(), color: new THREE.Color(0.6, 0.3, 1).multiplyScalar(0.8), range: 3 });
  }
  // The dot-matrix sign over the fire shutter says what the chapter wants.
  {
    const tick = ledTicker('SECTION CLOSED  ·  FIRE DOOR SEALED  ·  ENTER THE 4-DIGIT CODE AT THE KEYPAD  ·  DEVOXX ROOMS 3–10 BEYOND', 7.6, 0.55, 0xff3a0a);
    tick.rotation.y = -Math.PI / 2;
    tick.position.set(m(F1.fireX + 7) - 0.37, 4.75, (c0 + c1) / 2);
    group.add(tick);
    updaters.push((t) => (tick.userData.tick as (t: number) => void)(t));
    volumePoints.push({ position: V(m(F1.fireX) - 0.8, 4.6, (c0 + c1) / 2), color: new THREE.Color(1, 0.2, 0.05).multiplyScalar(1.2), range: 5 });
  }

  // Blue wayfinding (CAPTIONS.md): toward the foyer and toward the Devoxx rooms.
  {
    const wf = emitter(wayfinding([['←', 'foyer · bar'], ['→', 'zaal 3–10']]), 1.8, 0.9, 2.2, 0xffffff, false);
    wf.position.set(m(200), 3.4, m(CY1) - 0.04);
    wf.rotation.y = Math.PI;
    group.add(wf);
  }
  // EXIT sign over the foyer mouth.
  for (const [x, z, ry] of [[F1.foyer.x + F1.foyer.w / 2, m(CY1) - 0.06, Math.PI]] as Array<[number, number, number]>) {
    const ex = emitter(exitSign(), 0.9, 0.34, 5, 0xffffff, false);
    ex.position.set(m(x), HEIGHTS.foyerOpening + 0.35, z);
    if (ry === -Math.PI / 2) ex.position.set(m(x) - 0.1, 3.4, z);
    ex.rotation.y = ry;
    group.add(ex);
    volumePoints.push({ position: ex.position.clone(), color: new THREE.Color(0.1, 1, 0.3).multiplyScalar(0.8), range: 2.5 });
  }

  // Holo plinths on the near side: the sim's knee-high column feet project a
  // turning hologram — light passes through it, as the sim says it does.
  for (const w of walls) {
    if (w.kind !== 'corridor-plinth' || w.x >= X_END) continue;
    const cx = m(w.x + w.w / 2);
    const cz = m(w.y + w.h / 2);
    const plinth = new THREE.Mesh(box(m(w.w), 0.75, m(w.h), V(cx, 0.375, cz)), mats.darkMetal);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);
    colliders.push(plinth);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.04, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1).multiplyScalar(10), toneMapped: false }));
    lens.position.set(cx, 0.77, cz);
    group.add(lens);
    const holo = noMerge(hologram());
    holo.position.set(cx, 0.8, cz);
    group.add(holo);
    updaters.push((t) => {
      holo.rotation.y = t * 0.6 + cx;
      (holo.userData.mat as THREE.ShaderMaterial).uniforms.time.value = t;
    });
    volumePoints.push({ position: V(cx, 1.6, cz), color: new THREE.Color(0.15, 0.8, 1).multiplyScalar(0.9), range: 3 });
  }

  /* ------------------------------------------------ cove lines, downlights */

  // Emergency LED lines in both coves: cyan along the north wall, magenta along
  // the south, a segment dead here and there and one that will not settle. They
  // are what draws the corridor's vanishing lines — on the ceiling and, doubled,
  // in the polished floor.
  {
    const segLen = 6;
    let seg = 0;
    for (const side of [-1, 1] as const) {
      const colour = side < 0 ? new THREE.Color(0.12, 0.75, 1) : new THREE.Color(1, 0.12, 0.62);
      const z = side < 0 ? c0 + 0.12 : c1 - 0.12;
      for (let x0 = 0.3; x0 < xEnd - 0.5; x0 += segLen) {
        seg++;
        const dead = seg % 7 === 3;
        const len = Math.min(segLen - 0.15, xEnd - 0.3 - x0);
        const mat = new THREE.MeshBasicMaterial({ color: colour.clone().multiplyScalar(dead ? 0.03 : 16), toneMapped: false });
        const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.035, 0.035), mat);
        strip.position.set(x0 + len / 2, HEIGHTS.cove + 0.02, z);
        group.add(strip);
        if (seg % 5 === 1 && !dead) {
          const base = mat.color.clone();
          updaters.push((t) => {
            const f = Math.sin(t * 31 + x0) * Math.sin(t * 5.3 + x0 * 2);
            mat.color.copy(base).multiplyScalar(f > 0.6 ? 0.1 : 1);
          });
        }
      }
      // Point lights, not RectAreaLights: a 47 m x 0.12 m area light breaks the
      // LTC fit into sparkle noise on every lit surface (seen, 2026-09-23).
      for (let x = 6; x < xEnd; x += 14) {
        const pl = new THREE.PointLight(colour, 16, 9, 2);
        pl.position.set(x, HEIGHTS.cove - 0.25, z + (side < 0 ? 0.5 : -0.5));
        group.add(pl);
      }
      for (let x = 4; x < xEnd; x += 12) {
        volumePoints.push({ position: V(x, HEIGHTS.cove, z), color: colour.clone().multiplyScalar(0.12), range: 1.8 });
      }
    }
  }

  // The few ceiling downlights still on emergency power: pools on the floor and
  // a cone of haze under each.
  {
    const bays = colXs.slice().sort((a, b) => a - b);
    const lit = [1, 3, 5];
    for (const i of lit) {
      if (i + 1 >= bays.length) continue;
      const x = m((bays[i] + bays[i + 1]) / 2);
      const z = (c0 + c1) / 2 + (i % 2 ? -1.2 : 1.2);
      const spot = new THREE.SpotLight(0xdfe8ff, 380, 11, 0.42, 0.55, 2);
      spot.position.set(x, HEIGHTS.corridor - 0.08, z);
      spot.target.position.set(x, 0, z);
      group.add(spot, spot.target);
      volumeSpots.push({ light: spot, fog: 0.2 });
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 1).multiplyScalar(30), toneMapped: false }));
      can.position.set(x, HEIGHTS.corridor - 0.03, z);
      group.add(can);
    }
  }

  /* ------------------------------------------------------- wall detail */

  // Corridor walls: steel skirting, vertical battens every 2.4 m up to the
  // cove, and a warm LED line in the south skirting — the kind of surface
  // detail that gives a dark wall something to catch light on.
  {
    const det = new Buckets();
    const doorSpans = (side: -1 | 1): Array<[number, number]> => {
      const spans: Array<[number, number]> = [];
      for (const r of rooms) if (inBuild(r) && r.side === side) {
        const d = roomDoor(r);
        spans.push([d.x - 4, d.x + d.w + 4]);
      }
      const n = side < 0 ? F1.nicheTop : F1.nicheBot;
      spans.push([n.x - 4, n.x + n.w + 4]);
      if (side > 0) spans.push([F1.foyer.x, F1.foyer.x + F1.foyer.w]);
      return spans;
    };
    const blocked = (x: number, spans: Array<[number, number]>): boolean => spans.some(([a, b]) => x > a && x < b);
    for (const side of [-1, 1] as const) {
      const zf = side < 0 ? c0 : c1;
      const inset = side < 0 ? 1 : -1;
      const spans = doorSpans(side);
      // skirting in runs between openings
      const edges = [...spans.flat(), X_END].sort((a, b) => a - b);
      const cuts: Array<[number, number]> = [];
      let open = false;
      let prev = 0;
      for (const e of edges) {
        if (!open) cuts.push([prev, e]);
        open = !open && e !== X_END;
        prev = e;
      }
      for (const [a, b] of cuts) {
        if (b - a < 4) continue;
        const len = m(b - a);
        det.add(mats.steel, box(len, 0.16, 0.05, V(m((a + b) / 2), 0.08, zf + inset * 0.025)));
        if (side > 0) {
          const led = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.12).multiplyScalar(9), toneMapped: false }));
          led.position.set(m((a + b) / 2), 0.17, zf + inset * 0.05);
          group.add(led);
        }
      }
      for (let x = 12; x < X_END - 4; x += 30) {
        if (blocked(x, spans)) continue;
        det.add(mats.darkMetal, box(0.09, HEIGHTS.cove - 0.2, 0.06, V(m(x), (HEIGHTS.cove - 0.2) / 2 + 0.16, zf + inset * 0.03)));
      }
    }
    det.build(group);
  }

  // The fire door is the goal of the chapter: a cold work light from the
  // ceiling rakes down its corrugations, and a second beacon answers the first.
  {
    const wash = new THREE.SpotLight(0xcfe0ff, 520, 14, 0.55, 0.6, 2);
    wash.position.set(m(F1.fireX) - 4.2, HEIGHTS.corridor - 0.3, (c0 + c1) / 2);
    wash.target.position.set(m(F1.fireX), 1.2, (c0 + c1) / 2);
    wash.castShadow = true;
    wash.shadow.bias = -0.0005;
    group.add(wash, wash.target);
    volumeSpots.push({ light: wash, fog: 0.1 });
    const fix = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), mats.darkMetal);
    fix.position.copy(wash.position);
    group.add(fix);
  }

  /* ------------------------------------------- the secondary staircases */

  // Between 10|9 (north) and 3|4 (south), exactly where the plans put them: a
  // landing off the corridor, then a flight down toward the exhibition hall,
  // amber nosing lights on every tread and a green sign over the mouth.
  for (const [n, dir] of [
    [F1.nicheTop, -1],
    [F1.nicheBot, 1],
  ] as Array<[Rect, number]>) {
    const zEdge = dir > 0 ? m(n.y) : m(n.y + n.h);
    const x0 = m(n.x);
    const x1 = m(n.x + n.w);
    const landing = 2.7;
    const treads = 14;
    const run = 0.3;
    const rise = 0.19;
    const st = new Buckets();
    st.add(mats.carpet, quad(V(x0, 0.004, zEdge + dir * landing), V(x1, 0.004, zEdge + dir * landing), V(x1, 0.004, zEdge), V(x0, 0.004, zEdge), 2.4));
    const noses: THREE.Vector3[] = [];
    for (let i = 0; i < treads; i++) {
      const zA = zEdge + dir * (landing + i * run);
      const yTop = -(i + 1) * rise;
      const zc = zA + (dir * run) / 2;
      st.add(mats.carpet, box(x1 - x0, 0.06, run, V((x0 + x1) / 2, yTop - 0.03, zc), 1.5));
      st.add(mats.darkMetal, box(x1 - x0, rise, 0.04, V((x0 + x1) / 2, yTop + rise / 2, zA), 1.5));
      noses.push(V(x0 + 0.25, yTop + 0.01, zA + dir * 0.03), V(x1 - 0.25, yTop + 0.01, zA + dir * 0.03));
    }
    for (const x of [x0 + 0.12, x1 - 0.12]) {
      const pts = [V(x, 0.95, zEdge + dir * (landing - 0.3)), V(x, 0.95 - treads * rise, zEdge + dir * (landing + treads * run))];
      st.add(mats.steel, new THREE.TubeGeometry(new THREE.LineCurve3(pts[0], pts[1]), 8, 0.025, 8).toNonIndexed());
    }
    st.build(group);
    addStepLights(group, noses);
    const signTex = wayfinding([['↓', 'gelijkvloers'], ['', 'expo · hall']]);
    const sign = emitter(signTex, 1.6, 0.8, 2.4, 0xffffff, false);
    sign.position.set((x0 + x1) / 2, 3.45, (dir > 0 ? m(CY1) : m(CY0)) - dir * 0.06);
    sign.rotation.y = dir > 0 ? Math.PI : 0;
    group.add(sign);
    volumePoints.push({ position: V((x0 + x1) / 2, 2.2, zEdge + dir * 1.2), color: new THREE.Color(1, 0.55, 0.2).multiplyScalar(0.35), range: 3 });
  }

  // The Devoxx half has power: warm downlights down its corridor. Cones point
  // straight down and stop at the floor, so nothing leaks through the shutter
  // while it is shut — and when it rolls up, the light is waiting.
  for (const x of [668, 760, 840]) {
    const spot = new THREE.SpotLight(0xffd7a8, 700, 9, 0.62, 0.5, 2);
    spot.position.set(m(x), HEIGHTS.corridor - 0.1, m((CY0 + CY1) / 2));
    spot.target.position.set(m(x), 0, m((CY0 + CY1) / 2));
    group.add(spot, spot.target);
    volumeSpots.push({ light: spot, fog: 0.06 });
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.7).multiplyScalar(40), toneMapped: false }));
    can.position.set(m(x), HEIGHTS.corridor - 0.03, m((CY0 + CY1) / 2));
    group.add(can);
  }

  // Rooms 10 and 3 are Devoxx rooms and sealed tonight: their doors are shut
  // (the sim never sends anyone in; this only closes the view).
  for (const r of rooms) {
    if (r.closed || !inBuild(r)) continue;
    const d = roomDoor(r);
    const leafZ = m(d.y + d.h / 2);
    const g = new THREE.Group();
    const H = HEIGHTS.door - 0.05;
    for (const sgn of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(m(d.w) / 2 - 0.02, H, 0.09), mats.darkMetal);
      leaf.position.set((sgn * m(d.w)) / 4, H / 2, 0);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, m(d.w) * 0.3, 10), mats.steel);
      bar.rotation.z = Math.PI / 2;
      bar.position.set((sgn * m(d.w)) / 4, 1.05, r.side < 0 ? 0.1 : -0.1);
      g.add(leaf, bar);
    }
    g.position.set(m(d.cx), 0, leafZ);
    group.add(g);
  }

  /* ------------------------------------------------------ emergency power */

  // Red emergency lights at the ceiling line, one per bay, dim and steady.
  const emerg: THREE.Vector3[] = [];
  for (let x = 40; x < X_END; x += 120) {
    emerg.push(V(m(x), HEIGHTS.cove - 0.1, m(CY0) + 0.25), V(m(x + 60), HEIGHTS.cove - 0.1, m(CY1) - 0.25));
  }
  const emGeo = new THREE.BoxGeometry(0.4, 0.1, 0.12);
  const emMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.05, 0.02).multiplyScalar(10), toneMapped: false });
  const em = new THREE.InstancedMesh(emGeo, emMat, emerg.length);
  emerg.forEach((p, i) => em.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  group.add(em);
  for (const p of emerg) volumePoints.push({ position: p, color: new THREE.Color(1, 0.04, 0.02).multiplyScalar(0.35), range: 2.2 });

  /* ------------------------------------------------------ the fire shutter */
  // Built by props3d.ts (it opens); the beacon above it lives here.
  for (const [bz, phase] of [
    [m(CY0) + 1.2, 0],
    [m(CY1) - 1.2, Math.PI],
  ] as Array<[number, number]>) {
    const bx = m(F1.fireX) - 0.4;
    const by = 4.4;
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.25, 20), new THREE.MeshPhysicalMaterial({ color: 0xff2200, emissive: new THREE.Color(1, 0.05, 0), emissiveIntensity: 8, roughness: 0.2, transparent: true, opacity: 0.9 }));
    housing.position.set(bx, by, bz);
    group.add(housing);
    const beacon = new THREE.SpotLight(0xff1400, 260, 22, 0.32, 0.45, 2);
    beacon.position.set(bx, by, bz);
    group.add(beacon, beacon.target);
    volumeSpots.push({ light: beacon, fog: 0.25 });
    updaters.push((t) => {
      const a = t * 3.2 + phase;
      beacon.target.position.set(bx + Math.cos(a) * 6, by - 2.2, bz + Math.sin(a) * 6);
      beacon.target.updateMatrixWorld();
    });
  }

  const flickers: Array<{ mat: THREE.MeshBasicMaterial; base: THREE.Color; seed: number }> = [];
  group.traverse((o) => {
    const mm = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    if (mm && mm.isMeshBasicMaterial && mm.blending === THREE.AdditiveBlending && flickers.length < 3) {
      flickers.push({ mat: mm, base: mm.color.clone(), seed: flickers.length * 7.1 });
    }
  });
  updaters.push((t) => {
    for (const f2 of flickers) {
      const n = Math.sin(t * 23 + f2.seed) * Math.sin(t * 7.3 + f2.seed * 2);
      const off = n > 0.93 ? 0.15 : 1;
      f2.mat.color.copy(f2.base).multiplyScalar(off);
    }
  });

  shell.build(group).forEach((mesh) => colliders.push(mesh));
  colliders.push(...ceilings);
  // Collapse everything static into one mesh per material. The collider list
  // keeps its references: detached meshes still raycast where they were.
  mergeStatic(group);

  return {
    group,
    reflectors,
    colliders,
    volumePoints,
    volumeSpots,
    mirror,
    update(t: number, dt: number): void {
      for (const u of updaters) u(t, dt);
    },
  };
}

/* ------------------------------------------------------------------ seats */

function seatGeometries(): { uph: THREE.BufferGeometry; frame: THREE.BufferGeometry } {
  // Facing -Z: the seat's front is toward -z, backrest at +z.
  const cushion = new THREE.BoxGeometry(0.5, 0.14, 0.48, 2, 1, 2);
  cushion.translate(0, 0.46, -0.04);
  const back = new THREE.BoxGeometry(0.52, 0.72, 0.14, 2, 2, 1);
  back.rotateX(-0.18);
  back.translate(0, 0.86, 0.22);
  const uph = mergeGeometries([cushion, back])!;
  const armL = new THREE.BoxGeometry(0.06, 0.08, 0.5);
  armL.translate(-0.29, 0.66, 0.0);
  const armR = armL.clone();
  armR.translate(0.58, 0, 0);
  const leg = new THREE.BoxGeometry(0.06, 0.6, 0.4);
  leg.translate(-0.29, 0.3, 0.05);
  const leg2 = leg.clone();
  leg2.translate(0.58, 0, 0);
  const shell = new THREE.BoxGeometry(0.54, 0.74, 0.04);
  shell.rotateX(-0.18);
  shell.translate(0, 0.86, 0.31);
  const frame = mergeGeometries([armL, armR, leg, leg2, shell])!;
  return { uph, frame };
}

export function addSeats(parent: THREE.Object3D, mats: Materials, placements: THREE.Matrix4[]): void {
  if (!placements.length) return;
  const { uph, frame } = seatGeometries();
  const a = new THREE.InstancedMesh(uph, mats.velvet, placements.length);
  const b = new THREE.InstancedMesh(frame, mats.darkMetal, placements.length);
  placements.forEach((mm, i) => {
    a.setMatrixAt(i, mm);
    b.setMatrixAt(i, mm);
  });
  for (const im of [a, b]) {
    im.castShadow = true;
    im.receiveShadow = true;
    parent.add(im);
  }
}

function addStepLights(parent: THREE.Object3D, dots: THREE.Vector3[]): void {
  if (!dots.length) return;
  const g = new THREE.BoxGeometry(0.1, 0.04, 0.04);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.15).multiplyScalar(8), toneMapped: false });
  const im = new THREE.InstancedMesh(g, mat, dots.length);
  dots.forEach((p, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  parent.add(im);
}

/* -------------------------------------------------------------- hologram */

function hologram(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, tText: { value: neonText('DEVOXX', { w: 1024, h: 256, tube: 16 }) } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform sampler2D tText; varying vec2 vUv; varying vec3 vP;
      float h(float x){ return fract(sin(x * 91.3) * 43758.5); }
      void main(){
        float scan = .6 + .4 * sin(vP.y * 90. - time * 8.);
        float glitch = step(.97, h(floor(time * 12.) + floor(vP.y * 20.)));
        vec2 uv = vUv + vec2(glitch * .03, 0.);
        float txt = texture2D(tText, uv).r;
        float edge = smoothstep(.5, .0, abs(vUv.y - .5)) * .12;
        float a = (txt * 1.4 + edge) * scan * (.85 + .15 * sin(time * 40.));
        gl_FragColor = vec4(vec3(.25, .85, 1.) * a * 9., a);
      }`,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.5), mat);
  plane.position.y = 1.1;
  g.add(plane);
  // A thin projection beam from the lens up to the image, not a lampshade.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.3, 0.9, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.6, 1).multiplyScalar(0.18), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  beam.position.y = 0.45;
  beam.rotation.x = Math.PI;
  g.add(beam);
  g.userData.mat = mat;
  return g;
}

/* ------------------------------------------------------------- star ceiling */

function starCeiling(r: RoomDef): THREE.Points {
  const n = Math.round((r.w * r.h) / 110);
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = m(r.x + 4 + Math.random() * (r.w - 8));
    pos[i * 3 + 1] = HEIGHTS.room - 0.02;
    pos[i * 3 + 2] = m(r.y + 4 + Math.random() * (r.h - 8));
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `attribute float seed; varying float vS; uniform float time;
      void main(){ vS = seed; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, (1. + 2. * seed) * 14. / -mv.z); }`,
    fragmentShader: /* glsl */ `varying float vS; uniform float time;
      void main(){ vec2 d = gl_PointCoord - .5; float a = smoothstep(.5, 0., length(d));
        float tw = .55 + .45 * sin(time * (1. + vS * 3.) + vS * 40.);
        vec3 c = mix(vec3(1., .85, .6), vec3(.6, .8, 1.), step(.7, vS));
        gl_FragColor = vec4(c * a * tw * 40., a); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.onBeforeRender = (_r, _s, _c) => {
    mat.uniforms.time.value = performance.now() / 1000;
  };
  return pts;
}
