/**
 * ground3d.ts — the ground floor at full height, for chapters 2 and 3.
 *
 * The same rule as `venue.ts`: every solid thing comes out of `src/sim/geometry.ts`
 * (`groundWallsFor`, `groundPlates`, `GF`), so a wall a robot bumps into is a wall
 * on screen, and nothing here collides. What this file adds is only what a wall
 * list cannot say — how tall each kind of thing is, what it is made of, the
 * floors at the sim's own heights (`groundPlates`: the hall at 0, the lobby
 * 0.5 m up, the steps between, the main flight up to the cinema level), a
 * ceiling, and the hall's lights.
 *
 * Built on the first frame of chapter 2 and kept; `world.ts` shows it instead of
 * chapter 1's corridor (both floors share the sim's plan coordinates).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { GF, groundPlates, groundRiseM, groundWallsFor } from '../sim/geometry';
import type { Plate, Wall } from '../sim/types';
import { m } from '../sim/units';

import type { Materials } from './materials';
import { box } from './materials';
import type { VolumePoint } from './pipeline';

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Plan extent of the ground floor, sim px. */
const GX = 1900;
const GZ = 700;
/** The hall's clear height, m: an exhibition shed, not a corridor. */
const HALL_H = 7.2;

export interface Ground3D {
  group: THREE.Group;
  /** Solid geometry for the camera's collision rays. */
  colliders: THREE.Object3D[];
  reflectors: THREE.Object3D[];
  volumePoints: VolumePoint[];
  volumeSpots: Array<{ light: THREE.SpotLight; fog: number }>;
  /** Fog box, world metres. */
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
  /** Where the environment capture is taken from. */
  probe: THREE.Vector3;
  /** The hall's lighting circuit: 0 dark, 1 up (the sim's `breaker` prop reaching `done`). */
  setPower(on: number, t: number, instant?: boolean): void;
  /** Walls that exist in one chapter and not the other (chapter 2's roller door and cabinet are props there, walls after). */
  setChapter(n: number): void;
  update(t: number, dt: number): void;
}

class Buckets {
  private readonly map = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, g: THREE.BufferGeometry): void {
    const l = this.map.get(mat) ?? [];
    l.push(g.index ? g.toNonIndexed() : g);
    this.map.set(mat, l);
  }
  build(parent: THREE.Object3D, cast = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.map) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      parent.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}

/**
 * How tall each kind of ground-floor wall stands, m, and what it is made of.
 *
 * The sim only knows footprints. These are the building's: the perimeter and the
 * concrete wall go to the roof, booth totems are a person and a half, the stair
 * shafts are rooms (Michele: "in devoxx the stairs are not open but look like
 * rooms"), everything `low` is something a robot could see over.
 */
function styleOf(w: Wall, mats: Materials, concrete: THREE.Material): { h: number; mat: THREE.Material } | null {
  if (w.hidden) return null;
  const k = w.kind ?? '';
  if (w.glass) return { h: 4.2, mat: mats.glass };
  switch (k) {
    case 'totem':
      return { h: 2.8, mat: mats.blackGloss };
    case 'crate':
      return { h: 1.1, mat: mats.counter };
    case 'column':
    case 'lobby-column':
      return { h: HALL_H, mat: concrete };
    case 'stairwell':
    case 'stairwell-near':
    case 'stair-foot':
      return { h: 3.6, mat: concrete };
    case 'rack':
      return { h: 2.1, mat: mats.darkMetal };
    case 'store-wall':
    case 'toilets':
    case 'coatroom':
    case 'bof':
      return { h: 3.4, mat: mats.plaster };
    case 'bof-slats':
      return { h: 2.6, mat: mats.acoustic };
    case 'accent-panel':
      return { h: 3.0, mat: mats.enamel };
    case 'mainstair':
      return { h: 1.1, mat: mats.steel };
    default:
      if (w.low) return { h: k.includes('planter') ? 0.8 : k === 'bollard' ? 0.9 : 1.05, mat: k.includes('planter') || k === 'bollard' ? mats.darkMetal : mats.counter };
      return { h: HALL_H, mat: concrete };
  }
}

/** Steps up a sim plate that climbs along one axis, as solid boxes (the sim's slope, drawn stepped). */
function stepsFor(b: Buckets, p: Plate, mat: THREE.Material, n: number): void {
  const lo = p.lo;
  const hi = p.hi ?? p.lo;
  const at = (u: number): number => lo + (hi - lo) * u;
  for (let i = 0; i < n; i++) {
    // Each tread at the height of its higher edge: a stair, not a ramp.
    const h = Math.max(0.02, at(i / n), at((i + 1) / n));
    if (p.axis === 'x') {
      const sw = p.w / n;
      b.add(mat, box(m(sw), h, m(p.h), V(m(p.x + sw * (i + 0.5)), h / 2, m(p.y + p.h / 2))));
    } else {
      const sh = p.h / n;
      b.add(mat, box(m(p.w), h, m(sh), V(m(p.x + p.w / 2), h / 2, m(p.y + sh * (i + 0.5)))));
    }
  }
}

export function buildGround(mats: Materials): Ground3D {
  const group = new THREE.Group();
  group.name = 'ground-floor';
  const colliders: THREE.Object3D[] = [];
  const volumePoints: VolumePoint[] = [];
  const volumeSpots: Array<{ light: THREE.SpotLight; fog: number }> = [];
  const updaters: Array<(t: number, dt: number) => void> = [];

  /* ------------------------------------------------------------- floors */
  const floors = new Buckets();
  const plates = groundPlates();
  const lobby = plates.find((p) => p.kind === 'lobby');
  const lobbyX = lobby ? lobby.x : 1045;
  const lobbyH = lobby ? lobby.lo : 0.5;
  // The hall: one slab, its top at 0.
  floors.add(mats.terrazzo, box(m(lobbyX), 0.1, m(GZ), V(m(lobbyX) / 2, -0.05, m(GZ) / 2), 3));
  // The lobby, raised: a solid block so its edge reads as a step, not a sheet.
  floors.add(mats.carpet, box(m(GX - lobbyX), lobbyH, m(GZ), V(m((GX + lobbyX) / 2), lobbyH / 2 - 0.001, m(GZ) / 2), 3));
  for (const p of plates) {
    if (p.kind === 'lobby') continue;
    if (p.hi === undefined || p.axis === undefined) continue;
    const rise = Math.abs(p.hi - p.lo);
    stepsFor(floors, p, p.kind === 'main-flight' ? mats.steel : mats.terrazzo, Math.max(3, Math.round(rise / 0.17)));
  }
  const floorMeshes = floors.build(group, false);
  colliders.push(...floorMeshes);
  const reflectors: THREE.Object3D[] = [];

  /* ------------------------------------------------------------- walls */
  // Bare concrete: an exhibition shed's walls, and dark enough that a robot's
  // lamp a metre away does not bleach a stair shaft white.
  const concrete = mats.plaster.clone();
  concrete.color = new THREE.Color(0.2, 0.21, 0.22);
  const solid = new Buckets();
  const glassPanes: THREE.Mesh[] = [];
  for (const w of groundWallsFor(2)) {
    const s = styleOf(w, mats, concrete);
    if (!s) continue;
    const base = groundRiseM(w.x + w.w / 2);
    if (w.glass) {
      const along = w.w >= w.h;
      const len = m(along ? w.w : w.h);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, s.h), mats.glass);
      pane.position.set(m(w.x + w.w / 2), base + s.h / 2, m(w.y + w.h / 2));
      if (!along) pane.rotation.y = Math.PI / 2;
      pane.renderOrder = 2;
      group.add(pane);
      glassPanes.push(pane);
      continue;
    }
    solid.add(s.mat, box(m(w.w), s.h, m(w.h), V(m(w.x + w.w / 2), base + s.h / 2, m(w.y + w.h / 2)), 2.5));
  }
  colliders.push(...solid.build(group));
  // What chapter 3 has as plain walls and chapter 2 draws as moving props.
  const later = new THREE.Group();
  group.add(later);
  {
    const two = new Set(groundWallsFor(2).map((w) => `${w.x}:${w.y}:${w.w}:${w.h}`));
    const extra = new Buckets();
    for (const w of groundWallsFor(3)) {
      if (two.has(`${w.x}:${w.y}:${w.w}:${w.h}`)) continue;
      const st = styleOf(w, mats, concrete);
      if (!st || w.glass) continue;
      extra.add(st.mat, box(m(w.w), st.h, m(w.h), V(m(w.x + w.w / 2), groundRiseM(w.x + w.w / 2) + st.h / 2, m(w.y + w.h / 2)), 2.5));
    }
    extra.build(later);
  }
  later.visible = false;

  /* ------------------------------------------------------------- ceiling */
  {
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(m(GX), m(GZ)), mats.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(m(GX) / 2, HALL_H, m(GZ) / 2);
    group.add(ceil);
    colliders.push(ceil);
    // Roof trusses over the hall: an exhibition shed's ceiling is structure.
    const truss = new Buckets();
    for (let x = GF.hall.x + 60; x < GF.hall.x + GF.hall.w; x += 120) {
      truss.add(mats.darkMetal, box(0.35, 0.6, m(GF.hall.h), V(m(x), HALL_H - 0.4, m(GF.hall.y + GF.hall.h / 2)), 2));
    }
    truss.build(group, false);
  }

  /* ------------------------------------------------------------- booths */
  // Each stand: its own floor tile in a sponsor colour, and a name board hung
  // over it, dark until the hall's circuit closes and then lit with the bays.
  const boothBoards: THREE.MeshBasicMaterial[] = [];
  {
    const tiles = new Buckets();
    const PALETTE = [0x2b59c3, 0xe0662b, 0x2fa36b, 0x9b3fc4, 0xd8b12a, 0x1fa3b8];
    const tileMats = PALETTE.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
    GF.booths.forEach((b, i) => {
      tiles.add(tileMats[i % tileMats.length], box(m(b.w), 0.02, m(b.h), V(m(b.x + b.w / 2), 0.012, m(b.y + b.h / 2)), 2));
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 128;
      const x = c.getContext('2d')!;
      x.fillStyle = '#000';
      x.fillRect(0, 0, 512, 128);
      x.fillStyle = '#fff';
      x.font = 'bold 60px "Helvetica Neue", Arial, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(b.name, 256, 66, 490);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, toneMapped: false });
      boothBoards.push(mat);
      const bw = Math.min(m(b.w) * 0.9, 5);
      for (const yaw of [0, Math.PI]) {
        const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / 4), mat);
        board.position.set(m(b.x + b.w / 2), 3.6, m(b.y + b.h / 2) + (yaw === 0 ? 0.03 : -0.03));
        board.rotation.y = yaw;
        group.add(board);
      }
      const frame = new THREE.Mesh(box(bw + 0.1, bw / 4 + 0.1, 0.05, V(m(b.x + b.w / 2), 3.6, m(b.y + b.h / 2))), mats.darkMetal);
      group.add(frame);
      // Hangers to the trusses.
      group.add(new THREE.Mesh(box(0.02, HALL_H - 3.6 - bw / 8, 0.02, V(m(b.x + b.w / 2) - bw / 3, (HALL_H + 3.6 + bw / 8) / 2, m(b.y + b.h / 2))), mats.steel));
      group.add(new THREE.Mesh(box(0.02, HALL_H - 3.6 - bw / 8, 0.02, V(m(b.x + b.w / 2) + bw / 3, (HALL_H + 3.6 + bw / 8) / 2, m(b.y + b.h / 2))), mats.steel));
    });
    tiles.build(group, false);
  }

  /* ------------------------------------------------------------- lights */
  // Emergency: a few green exit signs, always on. The hall itself is dark until
  // the lighting circuit closes (the sim's `breaker` prop reaching `done`).
  const exitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 1, 0.3).multiplyScalar(6), toneMapped: false });
  for (const [x, y] of [
    [GF.hall.x + 8, GF.hall.y + 150],
    [GF.hall.x + 8, GF.hall.y + 450],
    [GF.hall.x + GF.hall.w - 60, GF.hall.y + 8],
    [GF.hall.x + GF.hall.w - 60, GF.hall.y + GF.hall.h - 8],
  ] as Array<[number, number]>) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), exitMat);
    sign.position.set(m(x), 2.6, m(y));
    group.add(sign);
    const gl = new THREE.PointLight(0x30ff70, 10, 6, 2);
    gl.position.set(m(x), 2.3, m(y));
    group.add(gl);
    volumePoints.push({ position: gl.position.clone(), color: new THREE.Color(0.1, 1, 0.3).multiplyScalar(0.5), range: 3 });
  }
  // The hall's working lights: a grid of high bays, switched by intensity (a
  // visibility toggle recompiles every material), and brought up across the
  // hall from the lobby end when the power comes on.
  const bays: Array<{ light: THREE.SpotLight; lamp: THREE.Mesh; at: number }> = [];
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  // Four across the hall, three more over the lobby, two rows of each.
  const bayXs = [GF.hall.x + 130, GF.hall.x + 370, GF.hall.x + 610, GF.hall.x + 850, 1220, 1480, 1740];
  for (const x of bayXs) {
    for (let iz = 0; iz < 2; iz++) {
      const z = GF.hall.y + 150 + iz * 300;
      const light = new THREE.SpotLight(0xfff1dc, 0, 30, 1.1, 0.7, 1.3);
      light.position.set(m(x), HALL_H - 0.6, m(z));
      const ix = bayXs.indexOf(x);
      light.target.position.set(m(x), 0, m(z));
      group.add(light, light.target);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.25, 20), lampMat.clone());
      lamp.position.set(m(x), HALL_H - 0.5, m(z));
      group.add(lamp);
      bays.push({ light, lamp, at: Math.max(0, 1 - x / (GF.hall.x + GF.hall.w)) });
      void ix;
      volumeSpots.push({ light, fog: 0.08 });
    }
  }
  // The general fill a lit hall has from its whole ceiling of fittings: off in
  // the blackout, up with the bays. A hemisphere so floors and walls separate.
  const fill = new THREE.HemisphereLight(0xfff4e6, 0x3a3430, 0);
  group.add(fill);
  let power = 0;
  /** When the circuit closed (world clock), or null while it is open. */
  let poweredAt: number | null = null;

  return {
    group,
    colliders,
    reflectors,
    volumePoints,
    volumeSpots,
    bounds: { min: V(0, -1, 0), max: V(m(GX), HALL_H + 1, m(GZ)) },
    probe: V(m(GF.hall.x + GF.hall.w / 2), 1.8, m(GF.hall.y + GF.hall.h / 2)),
    setChapter(n: number): void {
      later.visible = n >= 3;
    },
    setPower(on: number, t: number, instant = false): void {
      if (on > 0 && power === 0) poweredAt = instant ? t - 60 : t;
      if (on === 0) poweredAt = null;
      power = on;
    },
    update(t: number, dt: number): void {
      for (const u of updaters) u(t, dt);
      for (const b of bays) {
        // Booth by booth: each bay strikes 0.25 s after the one nearer the lobby.
        const k = poweredAt === null ? 0 : THREE.MathUtils.clamp((t - poweredAt - b.at * 2.2) / 0.5, 0, 1);
        const flick = k > 0 && k < 1 ? (Math.sin(t * 60 + b.at * 40) > 0 ? 1 : 0.2) : 1;
        b.light.intensity = 2400 * k * flick;
        (b.lamp.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.95, 0.85).multiplyScalar(8 * k * flick);
      }
      const lit = poweredAt === null ? 0 : THREE.MathUtils.clamp((t - poweredAt - 1.2) / 1.2, 0, 1);
      fill.intensity = 1.1 * lit;
      boothBoards.forEach((mat, i) => mat.color.setScalar(0.08 + 2.2 * lit * (0.92 + 0.08 * Math.sin(t * 2 + i))));
      void dt;
    },
  };
}
