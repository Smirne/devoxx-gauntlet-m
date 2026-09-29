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

import { DRINK_FRIDGES, DUKE, GF, HIGH_TABLES, LOBBY_RISE_M, MAIN_STAIR_TOP_M, WIFI_TAG, groundPlates, groundRiseM, groundWallsFor, stairDoors, stairMidLanding, stairRamps } from '../sim/geometry';
import { DOOR_H, stairFlight } from '../render/venue/props';
import type { Plate, Wall } from '../sim/types';
import { m } from '../sim/units';

import type { Materials } from './materials';
import { box } from './materials';
import { exitSign } from './signs';
import { buildDuke } from './duke';
import { BOOTH_SCHEMES } from '../render/venue/signage';
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
  /** Where the robot being driven is, world metres: a table over it turns see-through. */
  setFocus(x: number, z: number): void;
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
    // A slim sign post in front of each stand: a person high, not a pillar
    // hiding the open stand behind it.
    case 'totem':
      return { h: 1.9, mat: mats.blackGloss };
    case 'crate':
      return { h: 1.1, mat: mats.counter };
    // White square columns, as in every photograph of the hall.
    case 'column':
    case 'lobby-column':
      return { h: HALL_H, mat: columnMat(mats) };
    // The shafts go to the roof: the flight inside climbs out of sight.
    case 'stairwell':
    case 'stairwell-near':
      return { h: HALL_H, mat: moquette(mats) };
    // The foot of the flight is the flight itself, drawn by `shafts` — as a wall
    // it stood a blank slab where the stairs should go up (Michele, 28 Sep).
    case 'stair-foot':
      return null;
    case 'rack':
      return { h: 2.1, mat: mats.darkMetal };
    case 'store-wall':
    case 'toilets':
    case 'coatroom':
    case 'bof':
      return { h: 3.4, mat: mats.plaster };
    case 'bof-slats':
      return { h: 2.6, mat: mats.acoustic };
    // The red enamel panels are gone from the 3D hall (Michele, 29 Sep: "i don't
    // like those panels"): the curtain runs unbroken. The sim keeps them as 2 px
    // slabs flush on the wall, so nothing a robot can touch has changed.
    case 'accent-panel':
      return null;
    // The main flight's sides are drawn by `mainStairSides`, off the photos.
    case 'mainstair':
    // Duke is his own model (duke.ts); the entrance's frames and doors are `facade`.
    case 'duke':
    case 'high-table':
    case 'fridge':
    // The reception desk is built by `reception`, from Michele's photographs.
    case 'desk':
    case 'facade':
    case 'mullion':
    case 'door-leaf':
      return null;
    default:
      if (w.low) return { h: k.includes('planter') ? 0.8 : k === 'bollard' ? 0.9 : 1.05, mat: k.includes('planter') || k === 'bollard' ? mats.darkMetal : mats.counter };
      return { h: HALL_H, mat: concrete };
  }
}

/** A sponsor pod's print: brand ground, the name big, the strapline under it. */
function boothGraphic(name: string, brand: string, ink: string, strap: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = brand;
  x.fillRect(0, 0, 512, 256);
  const wash = x.createLinearGradient(0, 0, 0, 256);
  wash.addColorStop(0, 'rgba(255,255,255,0.16)');
  wash.addColorStop(1, 'rgba(0,0,0,0.22)');
  x.fillStyle = wash;
  x.fillRect(0, 0, 512, 256);
  x.fillStyle = ink;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 54px "Helvetica Neue", Arial, sans-serif';
  x.fillText(name, 256, 104, 480);
  x.font = '26px "Helvetica Neue", Arial, sans-serif';
  x.globalAlpha = 0.85;
  x.fillText(strap, 256, 164, 470);
  x.globalAlpha = 0.5;
  x.fillRect(96, 204, 320, 3);
  x.font = 'bold 18px Arial';
  x.fillText('DEVOXX BELGIUM', 256, 228);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A soft pool of light painted onto a surface: a radial gradient, additive,
 * no depth write. The dark hall's small lights — an exit sign's green on the
 * curtain under it, a fridge's cold white on the carpet in front — cost a
 * decal each instead of a real light each (Michele approved all three dark-hall
 * touches, 28 Sep).
 */
const glowTex = ((): THREE.CanvasTexture | null => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
function glowDecal(color: THREE.ColorRepresentation, strength: number, w: number, h: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(strength), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = 3;
  return mesh;
}

let columnMatCache: THREE.Material | null = null;
function columnMat(mats: Materials): THREE.Material {
  if (!columnMatCache) {
    const c = mats.plaster.clone();
    c.color = new THREE.Color(0.78, 0.78, 0.76);
    columnMatCache = c;
  }
  return columnMatCache;
}

/**
 * The hall's walls are hung with grey curtains, floor to ceiling (Michele's
 * expo photographs, 28 Sep): a warm grey with the vertical folds drawn into a
 * tiling texture, so a flat wall reads as drapery under a lamp.
 */
function curtainMat(): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 256; i++) {
    const f = 0.62 + 0.3 * Math.sin((i / 256) * Math.PI * 2 * 6) + 0.08 * Math.sin((i / 256) * Math.PI * 2 * 17);
    const v = Math.round(110 * f + 40);
    x.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    x.fillRect(i, 0, 1, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
}

/**
 * The stairwells are lined in black moquette (Michele, 28 Sep: "stairs wall
 * might be black moquette"). Matt and nearly black, so a robot's lamp on it is a
 * dim smudge, not the bright halo concrete threw back.
 */
let moquetteMat: THREE.Material | null = null;
function moquette(mats: Materials): THREE.Material {
  if (!moquetteMat) {
    const c = mats.carpet.clone();
    c.color = new THREE.Color(0.025, 0.025, 0.03);
    c.roughness = 1;
    c.clearcoat = 0;
    c.sheen = 0.4;
    c.sheenColor = new THREE.Color(0.06, 0.06, 0.08);
    moquetteMat = c;
  }
  return moquetteMat;
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

/**
 * Inside the two secondary stair shafts: the flight, and both doorways.
 *
 * The same staircase the 2.5D build draws (`staircases` in
 * `src/render/venue/ground.ts`), from the same sim rects: two ramps climbing
 * east with the half-landing between them, the climb split by run so the
 * landing is level, up to `MAIN_STAIR_TOP_M`, where a slab of the floor above
 * swallows it. Each doorway gets a lintel, two leaves stood open against its
 * jambs, and a green exit plate. Returns what the camera must not pass through.
 */
function shafts(group: THREE.Group, mats: Materials, concrete: THREE.Material): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const rise = MAIN_STAIR_TOP_M;
  const dress = new Buckets();
  const exitPlate = new THREE.MeshBasicMaterial({ map: exitSign(), color: new THREE.Color(1, 1, 1).multiplyScalar(2.5), toneMapped: false });
  for (const s of GF.stairs) {
    const rect = { x: s.x, y: s.y, w: s.w, h: s.h };
    const [lower, upper] = stairRamps(rect);
    const mid = stairMidLanding(rect);
    const midY = (rise * lower.w) / (lower.w + upper.w);
    const flight = new THREE.Group();
    flight.position.y = midY;
    for (const [r, y0, y1] of [
      [lower, 0, -midY],
      [upper, rise - midY, 0],
    ] as const) {
      flight.add(
        stairFlight({
          rect: r,
          topY: y0,
          bottomY: y1,
          dir: '-x',
          steps: Math.max(3, Math.round((r.w / (lower.w + upper.w)) * 26)),
          tread: mats.terrazzo,
          nosing: mats.steel,
          runs: 2,
          rail: mats.steel,
        }),
      );
    }
    group.add(flight);
    out.push(flight);
    // The half-landing, and the floor above over the top of the upper ramp.
    dress.add(mats.terrazzo, box(m(mid.w), 0.2, m(mid.h), V(m(mid.x + mid.w / 2), midY - 0.1, m(mid.y + mid.h / 2))));
    const over = upper.w * 0.55;
    dress.add(concrete, box(m(over), 0.4, m(upper.h), V(m(upper.x + upper.w - over / 2), rise + 2.1, m(upper.y + upper.h / 2))));
    for (const [d, out1] of stairDoors(rect).map((d, i) => [d, i === 0 ? -1 : 1] as const)) {
      // Lintel over the opening, up to the roof.
      dress.add(concrete, box(m(d.w), HALL_H - DOOR_H, m(d.h), V(m(d.x + d.w / 2), DOOR_H + (HALL_H - DOOR_H) / 2, m(d.y + d.h / 2))));
      // Two leaves folded right back, flat against the wall either side of the
      // opening. Standing square to it they were in the way (Michele, 28 Sep).
      const face = m(out1 < 0 ? d.y : d.y + d.h);
      // Both on the east side: west of the opening there is only 0.6 m of wall
      // before the shaft's corner. One folds out, one folds in.
      const inner = m(out1 < 0 ? d.y + d.h : d.y);
      dress.add(mats.darkMetal, box(m(14), DOOR_H - 0.05, 0.05, V(m(d.x + d.w + 7.5), DOOR_H / 2, face + out1 * 0.04)));
      dress.add(mats.darkMetal, box(m(14), DOOR_H - 0.05, 0.05, V(m(d.x + d.w + 7.5), DOOR_H / 2, inner - out1 * 0.04)));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), exitPlate);
      sign.position.set(m(d.x + d.w / 2), DOOR_H + 0.25, m(out1 < 0 ? d.y : d.y + d.h) + out1 * 0.03);
      if (out1 < 0) sign.rotation.y = Math.PI;
      group.add(sign);
      // Its green, washed down the wall under it.
      const wash = glowDecal(0x2bdc6a, 0.55, 2.4, 2.6);
      wash.position.set(sign.position.x, DOOR_H + 0.1, sign.position.z + out1 * 0.01);
      wash.rotation.y = sign.rotation.y;
      group.add(wash);
    }
  }
  out.push(...dress.build(group));
  return out;
}

/**
 * THE ENTRANCE — Michele's photograph of it (28 Sep): a wall of glass doors in
 * slim white frames, a transom over them, green running-man signs above the
 * bays, and daylight and trees through the glass.
 *
 * The sim's walls are the footprint (`facade` glazing, `mullion` reveals,
 * `door-leaf` open leaves); this draws them as that, plus the frame grid, the
 * spandrel above the glass, and what is outside: a backdrop across the
 * forecourt's far edge, bright in the morning and a dim street at night.
 */
let outsideMorning = false;
export function setOutsideMorning(on: boolean): void {
  outsideMorning = on;
}
function facade(group: THREE.Group, mats: Materials, updaters: Array<(t: number, dt: number) => void>): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const frame = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.35, metalness: 0.4 });
  // The open leaves get a visible tint: clear glass left only their frames,
  // which read as skewed wire (critic round, 29 Sep).
  const leafGlass = new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const b = new Buckets();
  const GLASS_H = 4.2;
  const TRANSOM = 2.7;
  const walls = groundWallsFor(2);
  const base = LOBBY_RISE_M;
  for (const w of walls) {
    if (w.kind === 'facade') {
      const x = m(w.x + w.w / 2);
      const za = m(w.y);
      const zb = m(w.y + w.h);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(zb - za, GLASS_H), mats.glass);
      pane.rotation.y = Math.PI / 2;
      pane.position.set(x, base + GLASS_H / 2, (za + zb) / 2);
      pane.renderOrder = 2;
      group.add(pane);
      out.push(pane);
      // Mullions every 1.5 m, rails at the floor, the transom and the head.
      for (let z = za; z <= zb + 0.01; z += (zb - za) / Math.max(1, Math.round((zb - za) / 1.5))) b.add(frame, box(0.1, GLASS_H, 0.08, V(x, base + GLASS_H / 2, z)));
      for (const y of [0.05, TRANSOM, GLASS_H]) b.add(frame, box(0.1, 0.08, zb - za, V(x, base + y, (za + zb) / 2)));
    } else if (w.kind === 'mullion') {
      // The reveal between two door bays: a glazed side screen in a slim white
      // frame (a solid white slab read as a fin standing in the doorway).
      const cx = m(w.x + w.w / 2);
      const cz = m(w.y + w.h / 2);
      const L = m(w.w);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(L, TRANSOM), mats.glass);
      pane.position.set(cx, base + TRANSOM / 2, cz);
      pane.renderOrder = 2;
      group.add(pane);
      for (const y of [0.04, TRANSOM, GLASS_H]) b.add(frame, box(L, 0.08, 0.08, V(cx, base + y, cz)));
      for (const s of [-1, 1]) b.add(frame, box(0.08, GLASS_H, 0.08, V(cx + (s * L) / 2, base + GLASS_H / 2, cz)));
    } else if (w.kind === 'door-leaf') {
      // A glass leaf, standing open, in its white frame.
      const cx = m(w.x + w.w / 2);
      const cz = m(w.y + w.h / 2);
      const L = m(Math.max(w.w, w.h));
      const along = w.w >= w.h;
      const DH = TRANSOM - 0.1;
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(L, DH), leafGlass);
      leaf.position.set(cx, base + DH / 2, cz);
      if (!along) leaf.rotation.y = Math.PI / 2;
      leaf.renderOrder = 2;
      group.add(leaf);
      const fw = along ? L : 0.06;
      const fd = along ? 0.06 : L;
      for (const y of [0.04, DH]) b.add(frame, box(fw, 0.08, fd, V(cx, base + y, cz)));
      for (const s of [-1, 1]) b.add(frame, box(along ? 0.06 : 0.06, DH, along ? 0.06 : 0.06, V(cx + (along ? (s * L) / 2 : 0), base + DH / 2, cz + (along ? 0 : (s * L) / 2))));
      // The push bar.
      b.add(mats.steel, box(along ? L * 0.8 : 0.04, 0.04, along ? 0.04 : L * 0.8, V(cx, base + 1.05, cz)));
    }
  }
  // Across the entrance gap: a transom over the open bays, and the exit signs.
  const e = GF.entrance;
  const ex = m(e.x + e.w / 2);
  const tr = new THREE.Mesh(new THREE.PlaneGeometry(m(e.h), GLASS_H - TRANSOM), mats.glass);
  tr.rotation.y = Math.PI / 2;
  tr.position.set(ex, base + (GLASS_H + TRANSOM) / 2, m(e.y + e.h / 2));
  group.add(tr);
  for (const y of [TRANSOM, GLASS_H]) b.add(frame, box(0.12, 0.1, m(e.h), V(ex, base + y, m(e.y + e.h / 2))));
  const signMat = new THREE.MeshBasicMaterial({ map: exitSign(), toneMapped: false, color: new THREE.Color(2, 2, 2) });
  for (const f of [0.2, 0.5, 0.8]) {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), signMat);
    sg.position.set(ex - 0.12, base + TRANSOM + 0.35, m(e.y + e.h * f));
    sg.rotation.y = -Math.PI / 2;
    group.add(sg);
    b.add(mats.darkMetal, box(0.08, 0.28, 0.68, V(ex - 0.08, base + TRANSOM + 0.35, m(e.y + e.h * f))));
  }
  // The spandrel over the glass, up to the roof.
  b.add(mats.darkMetal, box(0.2, HALL_H - GLASS_H - base, m(GZ), V(m(e.x + e.w / 2), base + GLASS_H + (HALL_H - GLASS_H - base) / 2, m(GZ) / 2)));
  out.push(...b.build(group));

  // OUTSIDE: sky and trees on a backdrop at the forecourt's far edge.
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const x = c.getContext('2d')!;
  const sky = x.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#dfe8ee');
  sky.addColorStop(1, '#f5f5f0');
  x.fillStyle = sky;
  x.fillRect(0, 0, 1024, 256);
  // Trees: soft grey-green blobs along the bottom, as the photo's blurred ones.
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 90; i++) {
    const tx = rnd() * 1024;
    const ty = 120 + rnd() * 100;
    const r = 18 + rnd() * 40;
    x.fillStyle = `rgba(${90 + rnd() * 40 | 0},${110 + rnd() * 40 | 0},${90 + rnd() * 30 | 0},0.35)`;
    x.beginPath();
    x.arc(tx, ty, r, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#b9bbb5';
  x.fillRect(0, 226, 1024, 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const outMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(m(GZ), 14), outMat);
  back.position.set(m(GX) - 0.5, 6, m(GZ) / 2);
  back.rotation.y = -Math.PI / 2;
  group.add(back);
  updaters.push(() => {
    // Morning: bright daylight through the glass. Night: a dim blue street.
    if (outsideMorning) outMat.color.setRGB(1.6, 1.6, 1.6);
    else outMat.color.setRGB(0.05, 0.07, 0.12);
  });
  return out;
}

/**
 * The main staircase from the side — Michele's photograph (28 Sep): a white
 * stepped side panel, the underside of the flight showing as a sawtooth, and a
 * glass balustrade in steel posts with a handrail following the pitch.
 */
function mainStairSides(group: THREE.Group, mats: Materials): THREE.Object3D[] {
  const ms = GF.mainStair;
  const out: THREE.Object3D[] = [];
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e7e2, roughness: 0.7 });
  const xTop = m(ms.x);
  const xFoot = m(ms.x + ms.w);
  const hTop = MAIN_STAIR_TOP_M;
  const hFoot = LOBBY_RISE_M;
  const n = Math.max(3, Math.round((hTop - hFoot) / 0.17));
  const T = 0.48;
  const b = new Buckets();
  for (const side of [ms.y, ms.y + ms.h]) {
    const shape = new THREE.Shape();
    shape.moveTo(xFoot, 0);
    shape.lineTo(xTop, 0);
    shape.lineTo(xTop, hTop);
    for (let k = 0; k < n; k++) {
      const xa = xTop + ((xFoot - xTop) * k) / n;
      const xb = xTop + ((xFoot - xTop) * (k + 1)) / n;
      const h = hTop - ((hTop - hFoot) * k) / n;
      const h2 = hTop - ((hTop - hFoot) * (k + 1)) / n;
      shape.lineTo(xa, h);
      shape.lineTo(xb, h);
      shape.lineTo(xb, h2);
    }
    shape.lineTo(xFoot, 0);
    // A thin panel just OUTSIDE the flight's footprint: laid over the treads'
    // own side faces it z-fought them into stripes.
    const PT = 0.05;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: PT, bevelEnabled: false });
    const z = side === ms.y ? m(side) - PT - 0.01 : m(side) + 0.01;
    geo.translate(0, 0, z);
    b.add(white, geo);
    const L = Math.hypot(xFoot - xTop, hTop - hFoot);
    const ang = Math.atan2(hTop - hFoot, xFoot - xTop);
    // Glass balustrade on the flight's edge: a parallelogram of glass, a steel
    // handrail 1 m above the nosings, posts every ~1.2 m.
    const zr = side === ms.y ? m(side) + T / 2 : m(side) - T / 2;
    const gpos = new Float32Array([xTop, hTop, zr, xFoot, hFoot, zr, xFoot, hFoot + 1, zr, xTop, hTop + 1, zr]);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
    gg.setIndex([0, 1, 2, 0, 2, 3]);
    gg.computeVertexNormals();
    const glass = new THREE.Mesh(gg, mats.glass);
    glass.renderOrder = 2;
    group.add(glass);
    const rail = new THREE.CylinderGeometry(0.03, 0.03, L, 10);
    rail.rotateZ(Math.PI / 2 - ang);
    rail.translate((xTop + xFoot) / 2, (hTop + hFoot) / 2 + 1.02, zr);
    b.add(mats.steel, rail);
    const posts = Math.round(L / 1.2);
    for (let i = 0; i <= posts; i++) {
      const px = xTop + ((xFoot - xTop) * i) / posts;
      const py = hTop + ((hFoot - hTop) * i) / posts;
      b.add(mats.steel, box(0.04, 1.02, 0.04, V(px, py + 0.51, zr)));
    }
  }
  // The top end: white, floor to the landing.
  b.add(white, box(m(6), hTop, m(ms.h), V(xTop + m(3), hTop / 2, m(ms.y + ms.h / 2))));
  out.push(...b.build(group));
  return out;
}

/**
 * The hall's high tables and drinks fridges, off Michele's photographs (28 Sep):
 * slim black square frames with a dark top and a potted succulent, and
 * glass-door fridges with a red header, lit inside, rows of bottles behind the
 * glass. Footprints are the sim's (`HIGH_TABLES`, `DRINK_FRIDGES`).
 */
function hallFurniture(group: THREE.Group, mats: Materials): THREE.Object3D[] {
  const b = new Buckets();
  const black = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.4 });
  const top = new THREE.MeshStandardMaterial({ color: 0x262422, roughness: 0.7 });
  const pot = new THREE.MeshStandardMaterial({ color: 0xc9a53a, roughness: 0.35, metalness: 0.6 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.8 });
  const TH = 1.1;
  const R = 0.02;
  for (const t of HIGH_TABLES) {
    const cx = m(t.x + t.w / 2);
    const cz = m(t.y + t.h / 2);
    const s = m(t.w) / 2;
    // The frame: four legs, a square at the foot and one under the top.
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) b.add(black, box(R * 2, TH, R * 2, V(cx + dx * s, TH / 2, cz + dz * s)));
    for (const y of [0.02, TH - 0.03]) {
      b.add(black, box(s * 2, R * 2, R * 2, V(cx, y, cz - s)));
      b.add(black, box(s * 2, R * 2, R * 2, V(cx, y, cz + s)));
      b.add(black, box(R * 2, R * 2, s * 2, V(cx - s, y, cz)));
      b.add(black, box(R * 2, R * 2, s * 2, V(cx + s, y, cz)));
    }
    b.add(top, box(s * 2 + 0.02, 0.03, s * 2 + 0.02, V(cx, TH, cz)));
    b.add(pot, box(0.1, 0.09, 0.1, V(cx + 0.08, TH + 0.06, cz)));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const g = new THREE.ConeGeometry(0.025, 0.14, 4);
      g.rotateZ(0.5 * Math.cos(a));
      g.rotateX(0.5 * Math.sin(a));
      g.translate(cx + 0.08 + Math.cos(a) * 0.02, TH + 0.16, cz + Math.sin(a) * 0.02);
      b.add(leaf, g);
    }
    b.add(black, box(0.12, 0.015, 0.08, V(cx - 0.1, TH + 0.02, cz - 0.05)));
  }
  // Fridges: a pair per footprint, glass doors facing the aisle (north, -z).
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 320;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, '#2a1a3a');
  g.addColorStop(1, '#11162a');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 320);
  for (let shelf = 0; shelf < 5; shelf++) {
    const y = 40 + shelf * 56;
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.fillRect(6, y + 44, 116, 3);
    for (let i = 0; i < 6; i++) {
      x.fillStyle = ['#d8322a', '#e8e0d0', '#3aa0d8', '#f2b233'][(i + shelf) % 4];
      x.fillRect(10 + i * 19, y + 8, 12, 36);
      x.fillRect(13 + i * 19, y + 2, 6, 8);
    }
  }
  const doorTex = new THREE.CanvasTexture(c);
  doorTex.colorSpace = THREE.SRGBColorSpace;
  const door = new THREE.MeshBasicMaterial({ map: doorTex, color: new THREE.Color(1.3, 1.3, 1.3), toneMapped: false });
  const h = document.createElement('canvas');
  h.width = 256;
  h.height = 64;
  const hx = h.getContext('2d')!;
  hx.fillStyle = '#d31f26';
  hx.fillRect(0, 0, 256, 64);
  hx.fillStyle = '#fff';
  hx.font = 'italic bold 34px Georgia, serif';
  hx.textAlign = 'center';
  hx.textBaseline = 'middle';
  hx.fillText('Ice Cold', 128, 34);
  const headTex = new THREE.CanvasTexture(h);
  headTex.colorSpace = THREE.SRGBColorSpace;
  const head = new THREE.MeshBasicMaterial({ map: headTex, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false });
  const FH = 2.0;
  for (const f of DRINK_FRIDGES) {
    // Lit all night, as real ones are: a cold pool on the carpet in front.
    const pool = glowDecal(0xbfd4ff, 0.5, m(f.w) + 1.6, 2.2);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(m(f.x + f.w / 2), 0.012, m(f.y) - 0.9);
    group.add(pool);
    const fl = new THREE.PointLight(0xcfe0ff, 2.5, 5, 1.8);
    fl.position.set(m(f.x + f.w / 2), 1.2, m(f.y) - 0.5);
    group.add(fl);
    const w = m(f.w) / 2;
    const d = m(f.h);
    for (const k of [0, 1]) {
      const cx = m(f.x) + w * (k + 0.5);
      const cz = m(f.y + f.h / 2);
      b.add(mats.darkMetal, box(w - 0.02, FH, d, V(cx, FH / 2, cz)));
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, FH - 0.45), door);
      front.position.set(cx, (FH - 0.35) / 2 + 0.05, cz - d / 2 - 0.005);
      front.rotation.y = Math.PI;
      group.add(front);
      const hd = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, 0.24), head);
      hd.position.set(cx, FH - 0.16, cz - d / 2 - 0.006);
      hd.rotation.y = Math.PI;
      group.add(hd);
    }
  }
  return b.build(group);
}

/**
 * RECEPTION, from Michele's photographs of it (28 Sep, "the reception,
 * finally!"): a monolithic white counter, square-edged, with a warm LED line
 * under its top's overhang; behind it a wall of vertical timber slats with two
 * screens ("Pick up your Devoxx polo during lunch"); a glowing orange soffit
 * over the desk; white drum-shade lamps on the counter; and over the lane from
 * the doors, a big white ring pendant lit underneath. The counter runs are the
 * sim's `desk` walls; the slat wall stands on the wardrobe's south face.
 */
/** Reception's lit things, switched with the hall's power: material, full colour. */
const receptionGlows: Array<{ mat: THREE.MeshBasicMaterial; base: THREE.Color }> = [];
let receptionLight: THREE.PointLight | null = null;
function glowing(mat: THREE.MeshBasicMaterial): THREE.MeshBasicMaterial {
  receptionGlows.push({ mat, base: mat.color.clone() });
  return mat;
}
function reception(group: THREE.Group, mats: Materials): THREE.Object3D[] {
  const b = new Buckets();
  const white = new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: 0.35 });
  const led = glowing(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.7, 0.4).multiplyScalar(3), toneMapped: false }));
  const rise = LOBBY_RISE_M;
  const CH = 1.1;
  for (const w of groundWallsFor(2)) {
    if (w.kind !== 'desk') continue;
    const cx = m(w.x + w.w / 2);
    const cz = m(w.y + w.h / 2);
    b.add(white, box(m(w.w), CH - 0.06, m(w.h), V(cx, rise + (CH - 0.06) / 2, cz)));
    // The top, overhanging 6 cm all round; the LED line tucked under it.
    b.add(white, box(m(w.w) + 0.12, 0.06, m(w.h) + 0.12, V(cx, rise + CH - 0.03, cz)));
    b.add(led, box(m(w.w) + 0.02, 0.02, m(w.h) + 0.02, V(cx, rise + CH - 0.075, cz)));
  }
  const rc = GF.reception;
  const co = GF.coatroom;
  // The timber-slat wall, facing the desk from the wardrobe's south face.
  const wz = m(co.y + co.h) + 0.02;
  const x0 = m(rc.x) + 0.2;
  const x1 = m(rc.x + rc.w) - 0.2;
  const WH = 3.0;
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
  b.add(dark, box(x1 - x0, WH, 0.04, V((x0 + x1) / 2, rise + WH / 2, wz + 0.02)));
  for (let x = x0 + 0.04; x < x1; x += 0.09) b.add(wood, box(0.045, WH, 0.04, V(x, rise + WH / 2, wz + 0.06)));
  // Two screens on the slats.
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const x = c.getContext('2d')!;
  x.fillStyle = '#d8d6d2';
  x.fillRect(0, 0, 512, 288);
  x.fillStyle = '#2b2b2e';
  for (const px of [150, 250]) {
    x.beginPath();
    x.arc(px, 90, 42, 0, Math.PI * 2);
    x.fill();
    x.fillRect(px - 60, 128, 120, 160);
  }
  x.fillStyle = '#111';
  x.font = 'bold 40px Arial, sans-serif';
  x.textAlign = 'center';
  x.fillText('Pick up your', 330, 110);
  x.fillText('Devoxx polo during', 330, 160);
  x.fillText('lunch', 330, 210);
  x.font = '22px Arial, sans-serif';
  x.fillText('Exhibition hall', 330, 250);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = glowing(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.2, 1.2, 1.2), toneMapped: false }));
  for (const f of [0.3, 0.72]) {
    const sx = x0 + (x1 - x0) * f;
    b.add(mats.darkMetal, box(1.36, 0.8, 0.06, V(sx, rise + 1.95, wz + 0.11)));
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.72), screenMat);
    s.position.set(sx, rise + 1.95, wz + 0.145);
    group.add(s);
  }
  // The orange soffit over the desk: a bulkhead, glowing underneath.
  const soffitY = rise + 3.3;
  b.add(white, box(m(rc.w) + 0.4, 0.5, m(rc.h) + 0.4, V(m(rc.x + rc.w / 2), soffitY + 0.25, m(rc.y + rc.h / 2))));
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(m(rc.w) + 0.2, m(rc.h) + 0.2),
    glowing(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.15).multiplyScalar(2.2), toneMapped: false })),
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.set(m(rc.x + rc.w / 2), soffitY - 0.005, m(rc.y + rc.h / 2));
  group.add(glow);
  const warm = new THREE.PointLight(0xff9a5a, 18, 9, 1.6);
  warm.position.set(m(rc.x + rc.w / 2), soffitY - 0.4, m(rc.y + rc.h / 2));
  group.add(warm);
  receptionLight = warm;
  // Two drum lamps on the counter ends.
  const shade = glowing(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.92, 0.78).multiplyScalar(2.5), toneMapped: false }));
  for (const [lx, lz] of [
    [m(rc.x) + 0.3, m(rc.y) + 0.4],
    [m(rc.x + rc.w) - 0.5, m(rc.y + rc.h) - 0.3],
  ]) {
    b.add(mats.steel, box(0.03, 0.5, 0.03, V(lx, rise + CH + 0.25, lz)));
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.26, 20, 1, true), shade);
    sh.position.set(lx, rise + CH + 0.58, lz);
    group.add(sh);
  }
  // The ring pendant over the lane from the doors.
  const ringY = rise + 3.4;
  const px = m(GF.entrance.x) - 2.2;
  const pz = m(GF.entrance.y + GF.entrance.h / 2);
  b.add(white, new THREE.CylinderGeometry(1.1, 1.1, 0.28, 48, 1, true).translate(px, ringY, pz));
  const under = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.08, 48), glowing(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.88).multiplyScalar(3), toneMapped: false, side: THREE.DoubleSide })));
  under.rotation.x = Math.PI / 2;
  under.position.set(px, ringY - 0.12, pz);
  group.add(under);
  b.add(mats.darkMetal, box(0.02, HALL_H - ringY, 0.02, V(px, (HALL_H + ringY) / 2, pz)));
  return b.build(group);
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
  // Light grey carpet, as the photographs show it (it was dark terrazzo).
  const hallCarpet = (() => {
    // A soft tile of speckled grey loop pile, faintly checked the way the
    // photographs' carpet tiles are.
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const x = c.getContext('2d')!;
    let seed = 3;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const [ox, oy, tone] of [
      [0, 0, 104],
      [128, 0, 98],
      [0, 128, 98],
      [128, 128, 104],
    ]) {
      x.fillStyle = `rgb(${tone},${tone - 3},${tone - 8})`;
      x.fillRect(ox, oy, 128, 128);
    }
    for (let i = 0; i < 9000; i++) {
      const v = 75 + rnd() * 60;
      x.fillStyle = `rgba(${v | 0},${(v - 4) | 0},${(v - 10) | 0},0.5)`;
      x.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  })();
  floors.add(hallCarpet, box(m(lobbyX), 0.1, m(GZ), V(m(lobbyX) / 2, -0.05, m(GZ) / 2), 3));
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
  // ...now grey curtains, floor to ceiling, off the photographs (28 Sep): the
  // walls a robot's lamp meets are drapery, which takes a lamp as a soft wash.
  const concrete = curtainMat();
  const solid = new Buckets();
  const glassPanes: THREE.Mesh[] = [];
  for (const w of groundWallsFor(2)) {
    // Booths are built as stands below, not as extruded footprints.
    if (w.booth) continue;
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
  colliders.push(...shafts(group, mats, concrete));
  colliders.push(...facade(group, mats, updaters));
  colliders.push(...mainStairSides(group, mats));
  colliders.push(...hallFurniture(group, mats));
  colliders.push(...reception(group, mats));
  {
    // Duke, on his sim footprint, facing the doors.
    const duke = buildDuke();
    duke.root.position.set(m(DUKE.x), groundRiseM(DUKE.x), m(DUKE.y));
    // Half-turned: towards the doors and towards the lane the robots walk,
    // so his nose is what both see first (critic round, 29 Sep).
    duke.root.rotation.y = Math.PI / 4;
    group.add(duke.root);
    // A display spot on him, as a sponsor would light an inflatable: black
    // vinyl in a dark lobby otherwise vanishes and leaves a white bell.
    const spot = new THREE.SpotLight(0xfff2e0, 420, 12, 0.45, 0.5, 1.4);
    spot.position.set(m(DUKE.x) + 3, groundRiseM(DUKE.x) + 5.5, m(DUKE.y) + 1.5);
    spot.target.position.set(m(DUKE.x), groundRiseM(DUKE.x) + 1.6, m(DUKE.y));
    group.add(spot, spot.target);
    updaters.push((t) => duke.update(t));
  }
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
    // Black, as the photographs have it: services are what you see up there.
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.95 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(m(GX), m(GZ)), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(m(GX) / 2, HALL_H, m(GZ) / 2);
    group.add(ceil);
    colliders.push(ceil);
    // Roof trusses over the hall — aluminium box truss, four chords laced with
    // diagonals, as in Michele's photo of the Devoxx sign (28 Sep) — and the
    // silver spiral ducts running the length of the shed under them.
    const truss = new Buckets();
    const chordGeo = (len: number, x: number, y: number, z0: number): THREE.BufferGeometry => {
      const g = new THREE.CylinderGeometry(0.025, 0.025, len, 6);
      g.rotateX(Math.PI / 2);
      g.translate(x, y, z0 + len / 2);
      return g;
    };
    const strut = (a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry => {
      const d = b.clone().sub(a);
      const g = new THREE.CylinderGeometry(0.012, 0.012, d.length(), 4);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      return g;
    };
    const TW = 0.42;
    const ty = HALL_H - 0.9;
    const z0 = m(GF.hall.y);
    const len = m(GF.hall.h);
    for (let x = GF.hall.x + 60; x < GF.hall.x + GF.hall.w; x += 120) {
      const cx = m(x);
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) truss.add(mats.steel, chordGeo(len, cx + (dx * TW) / 2, ty + (dy * TW) / 2, z0));
      for (let z = z0, k = 0; z < z0 + len - 0.5; z += 0.5, k++) {
        const za = z;
        const zb = z + 0.5;
        const up = k % 2 === 0;
        for (const dx of [-1, 1]) {
          truss.add(mats.steel, strut(V(cx + (dx * TW) / 2, ty + (up ? -1 : 1) * TW / 2, za), V(cx + (dx * TW) / 2, ty + (up ? 1 : -1) * TW / 2, zb)));
        }
        truss.add(mats.steel, strut(V(cx + (up ? -1 : 1) * TW / 2, ty - TW / 2, za), V(cx + (up ? 1 : -1) * TW / 2, ty - TW / 2, zb)));
      }
    }
    truss.build(group, false);
    // Spiral ducts: two runs along the hall and over the lobby, seams every
    // 1.5 m, with a drop and a round diffuser every 12 m.
    const ducts = new Buckets();
    const ductMat = mats.steel;
    const DR = 0.42;
    const dy = HALL_H - 1.9;
    for (const zPx of [GF.hall.y + 225, GF.hall.y + 525]) {
      const z = m(zPx);
      const x0 = m(GF.hall.x + 10);
      const x1 = m(1460);
      const run = new THREE.CylinderGeometry(DR, DR, x1 - x0, 20, 1, true);
      run.rotateZ(Math.PI / 2);
      run.translate((x0 + x1) / 2, dy, z);
      ducts.add(ductMat, run);
      for (let x = x0 + 0.75; x < x1; x += 1.5) {
        const seam = new THREE.CylinderGeometry(DR + 0.02, DR + 0.02, 0.05, 20, 1, true);
        seam.rotateZ(Math.PI / 2);
        seam.translate(x, dy, z);
        ducts.add(ductMat, seam);
      }
      for (let x = x0 + 6; x < x1 - 2; x += 12) {
        const drop = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 14, 1, true);
        drop.translate(x, dy - DR - 0.45, z);
        ducts.add(ductMat, drop);
        const diff = new THREE.CylinderGeometry(0.34, 0.22, 0.12, 18);
        diff.translate(x, dy - DR - 0.95, z);
        ducts.add(mats.darkMetal, diff);
      }
      // Hangers up to the roof.
      for (let x = x0 + 3; x < x1; x += 6) ducts.add(mats.darkMetal, box(0.02, HALL_H - dy - DR, 0.02, V(x, (HALL_H + dy + DR) / 2, z)));
    }
    ducts.build(group, false);
  }

  /* ------------------------------------------------------------- booths */
  // Each stand: its own floor tile in a sponsor colour, and a name board hung
  // over it, dark until the hall's circuit closes and then lit with the bays.
  const boothBoards: THREE.MeshBasicMaterial[] = [];
  {
    const tiles = new Buckets();
    const PALETTE = [0x2b59c3, 0xe0662b, 0x2fa36b, 0x9b3fc4, 0xd8b12a, 0x1fa3b8];
    /*
     * Stand carpet, not plastic: the polish survey (28 Sep) found the tiles
     * read as flat saturated slabs. They are the hall's own baked carpet, tinted
     * the sponsor's colour and pulled toward grey, on a thin aluminium edge
     * trim — the ramp strip every rented stand floor has.
     */
    const tileMats = PALETTE.map((c) => {
      const mt = mats.carpet.clone();
      mt.color = new THREE.Color(c).lerp(new THREE.Color(0x6a6a6a), 0.15).multiplyScalar(1.5);
      mt.clearcoat = 0;
      mt.roughness = 1;
      return mt;
    });
    GF.booths.forEach((b, i) => {
      tiles.add(tileMats[i % tileMats.length], box(m(b.w), 0.03, m(b.h), V(m(b.x + b.w / 2), 0.017, m(b.y + b.h / 2)), 2));
      tiles.add(mats.steel, box(m(b.w) + 0.08, 0.018, m(b.h) + 0.08, V(m(b.x + b.w / 2), 0.009, m(b.y + b.h / 2))));
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
      // A built stand wears its name as a fascia on top of its back wall (the
      // critic round, 29 Sep: boards hung mid-air read as floating text); a
      // table stand keeps a board hung from the trusses over it.
      const built = !b.table;
      const by = built ? 2.6 + bw / 8 + 0.02 : 3.6;
      const bz = built ? m(b.y) + 0.05 : m(b.y + b.h / 2);
      for (const yaw of [0, Math.PI]) {
        const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / 4), mat);
        board.position.set(m(b.x + b.w / 2), by, bz + (yaw === 0 ? 0.03 : -0.03));
        board.rotation.y = yaw;
        group.add(board);
      }
      group.add(new THREE.Mesh(box(bw + 0.1, bw / 4 + 0.1, 0.05, V(m(b.x + b.w / 2), by, bz)), mats.darkMetal));
      if (!built) {
        // Hangers to the trusses.
        group.add(new THREE.Mesh(box(0.02, HALL_H - 3.6 - bw / 8, 0.02, V(m(b.x + b.w / 2) - bw / 3, (HALL_H + 3.6 + bw / 8) / 2, bz)), mats.steel));
        group.add(new THREE.Mesh(box(0.02, HALL_H - 3.6 - bw / 8, 0.02, V(m(b.x + b.w / 2) + bw / 3, (HALL_H + 3.6 + bw / 8) / 2, bz)), mats.steel));
      }
    });
    tiles.build(group, false);
  }

  /* ------------------------------------------------------------- stands */
  /*
   * Michele, 28 Sep: "stands are unfinished, it should be clear when you're
   * passing under them". A built booth was its footprint extruded to the roof in
   * concrete; a half table was a solid 1.05 m box that Voxxy (1.15 m) drove
   * through. Now:
   *
   *  - a BUILT booth is a 2.6 m sponsor pod, printed on every side in its
   *    scheme (`BOOTH_SCHEMES`, the 2.5D build's), with a lit header strip and a
   *    dark roof. Solid, as the sim has it.
   *  - a HALF TABLE is a high sponsor table: a top at 1.3 m on four legs, a short
   *    cloth valance in the brand colour, a laptop and a bowl of stickers on it.
   *    Open underneath, so Voxxy visibly goes under; and while the robot being
   *    driven is under one, its top fades so the camera can see her.
   */
  const panels: THREE.MeshStandardMaterial[] = [];
  const strips: Array<{ mat: THREE.MeshBasicMaterial; base: THREE.Color }> = [];
  const tables: Array<{ rect: { x: number; y: number; w: number; h: number }; mats: THREE.MeshStandardMaterial[]; fade: number }> = [];
  let focusX = -1e9;
  let focusZ = -1e9;
  const beltGroup = new THREE.Group();
  group.add(beltGroup);
  {
    const belts = new Buckets();
    const solid2 = new Buckets();
    const TABLE_TOP = 1.3;
    const legMat = mats.steel;
    const tagFace = { x: WIFI_TAG.x - WIFI_TAG.nx * 8, y: WIFI_TAG.y - WIFI_TAG.ny * 8 };
    GF.booths.forEach((b, i) => {
      const sch = BOOTH_SCHEMES[i % BOOTH_SCHEMES.length];
      const cx = m(b.x + b.w / 2);
      const cz = m(b.y + b.h / 2);
      const bw = m(b.w);
      const bd = m(b.h);
      if (!b.table) {
        /*
         * AN OPEN STAND, off Michele's booth photographs (28 Sep): a raised floor
         * with a white edge, a printed back wall and two printed side walls, arm
         * spotlights on top, and the inside furnished — high table and stools, a
         * screen, a plant, and each sponsor's crowd-puller (a claw machine, a
         * little humanoid robot, a racing seat). The sim still has the whole
         * footprint solid — it is where the keynote speaker hides — so a belt
         * barrier runs across the open front: the stand is closed for the night,
         * and a robot stopped at its edge is stopped by something you can see.
         */
        const H = 2.6;
        const T = 0.1;
        const x0 = cx - bw / 2;
        const x1 = cx + bw / 2;
        const z0 = cz - bd / 2; // back (north)
        const z1 = cz + bd / 2; // open front (south)
        const tex = boothGraphic(b.name, sch.brand, sch.ink, sch.strap);
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: new THREE.Color(1, 1, 1), emissiveMap: tex, emissiveIntensity: 0.05 });
        panels.push(mat);
        const brandMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(sch.brand), roughness: 0.7 });
        // The raised floor, carpeted in the brand's colour, edged in white.
        const floorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(sch.brand).lerp(new THREE.Color(0x555555), 0.35), roughness: 1 });
        group.add(new THREE.Mesh(box(bw, 0.08, bd, V(cx, 0.04, cz)), floorMat));
        group.add(new THREE.Mesh(box(bw + 0.02, 0.085, 0.05, V(cx, 0.042, z1)), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 })));
        // The three walls: solid, dark cores; printed inside and out.
        solid2.add(mats.darkMetal, box(bw, H, T, V(cx, H / 2, z0 + T / 2), 2));
        solid2.add(mats.darkMetal, box(T, H, bd, V(x0 + T / 2, H / 2, cz), 2));
        solid2.add(mats.darkMetal, box(T, H, bd, V(x1 - T / 2, H / 2, cz), 2));
        const faces: Array<[number, number, number, number]> = [
          [cx, z0 + T + 0.005, 0, bw - 2 * T], // back wall, inside
          [cx, z0 - 0.005, Math.PI, bw], // back wall, outside
          [x0 + T + 0.005, cz, Math.PI / 2, bd - T], // west wall, inside
          [x1 - T - 0.005, cz, -Math.PI / 2, bd - T], // east wall, inside
          [x0 - 0.005, cz, -Math.PI / 2, bd], // west wall, outside
          [x1 + 0.005, cz, Math.PI / 2, bd], // east wall, outside
        ];
        for (const [fx, fz, yaw, len] of faces) {
          if (Math.abs(fx - m(tagFace.x)) < 0.2 && Math.abs(fz - m(tagFace.y)) < bd) continue;
          const f = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.1, H - 0.5), mat);
          f.position.set(fx, 1.35, fz);
          f.rotation.y = yaw;
          group.add(f);
        }
        // The header: a strip of light along the top of the back wall.
        const strip = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
        strips.push({ mat: strip, base: new THREE.Color(sch.brand) });
        group.add(new THREE.Mesh(box(bw + 0.02, 0.1, T + 0.04, V(cx, H - 0.05, z0 + T / 2)), strip));
        // Arm spotlights along the top of the back wall, leaning in over the stand.
        for (let k = 0; k < 3; k++) {
          const ax = x0 + (bw * (k + 0.5)) / 3;
          const arm = new THREE.Mesh(box(0.03, 0.03, 0.7, V(ax, H + 0.15, z0 + 0.3)), mats.steel);
          arm.rotation.x = -0.45;
          group.add(arm);
          group.add(new THREE.Mesh(box(0.14, 0.05, 0.1, V(ax, H + 0.28, z0 + 0.62)), mats.steel));
        }
        // A screen on the back wall.
        const scr = new THREE.MeshBasicMaterial({ color: new THREE.Color(sch.brand).multiplyScalar(0.6), toneMapped: false });
        strips.push({ mat: scr, base: new THREE.Color(sch.brand).multiplyScalar(0.25) });
        group.add(new THREE.Mesh(box(1.1, 0.65, 0.05, V(cx - bw * 0.22, 1.75, z0 + T + 0.03)), mats.darkMetal));
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.57), scr);
        screen.position.set(cx - bw * 0.22, 1.75, z0 + T + 0.06);
        group.add(screen);
        // A high table and stools, and a plant in the corner.
        const blk = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.5, metalness: 0.3 });
        const tx = cx - bw * 0.18;
        const tz = cz + bd * 0.05;
        solid2.add(blk, box(0.7, 0.03, 0.7, V(tx, 1.08, tz)));
        solid2.add(blk, box(0.06, 1.06, 0.06, V(tx, 0.55, tz)));
        for (const [sx, sz] of [
          [-0.55, 0.1],
          [0.55, 0.1],
          [0, 0.55],
        ]) {
          solid2.add(new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.5 }) as unknown as THREE.Material, box(0.34, 0.06, 0.34, V(tx + sx, 0.78, tz + sz)));
          solid2.add(blk, box(0.04, 0.75, 0.04, V(tx + sx, 0.42, tz + sz)));
        }
        group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 14), mats.darkMetal).translateX(x1 - T - 0.35).translateY(0.28).translateZ(z0 + T + 0.35));
        for (let k = 0; k < 7; k++) {
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.8, 4), new THREE.MeshStandardMaterial({ color: 0x3f7a34, roughness: 0.8 }));
          leaf.position.set(x1 - T - 0.35 + Math.cos(k) * 0.08, 0.85, z0 + T + 0.35 + Math.sin(k) * 0.08);
          leaf.rotation.set(Math.sin(k * 2.1) * 0.5, 0, Math.cos(k * 1.7) * 0.5);
          group.add(leaf);
        }
        // The crowd-puller, one per stand in turn.
        const fx = cx + bw * 0.25;
        const fz = cz;
        const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.35 });
        switch (i % 4) {
          case 0: {
            // A claw machine: white cabinet, glass box of prizes, brand header.
            solid2.add(white, box(0.8, 0.9, 0.8, V(fx, 0.53, fz)));
            solid2.add(mats.glass, box(0.76, 0.8, 0.76, V(fx, 1.38, fz)));
            solid2.add(brandMat, box(0.82, 0.25, 0.82, V(fx, 1.9, fz)));
            for (let k = 0; k < 14; k++) {
              const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((k * 0.13) % 1, 0.7, 0.55), roughness: 0.4 }));
              ball.position.set(fx - 0.25 + (k % 5) * 0.12, 1.05 + Math.floor(k / 5) * 0.07, fz - 0.2 + ((k * 7) % 4) * 0.12);
              group.add(ball);
            }
            break;
          }
          case 1: {
            // A little white humanoid robot with a tablet on its chest.
            const r = new THREE.Group();
            r.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.5, 16), white).translateY(0.25));
            r.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.45, 16), white).translateY(0.72));
            r.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), white).translateY(1.08));
            r.add(new THREE.Mesh(box(0.18, 0.13, 0.02, V(0, 0.78, 0.15)), mats.blackGloss));
            for (const ex of [-0.05, 0.05]) r.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mats.blackGloss).translateX(ex).translateY(1.1).translateZ(0.13));
            r.position.set(fx, 0.08, fz + 0.4);
            group.add(r);
            break;
          }
          case 2: {
            // A racing-sim rig: black bucket seat, wheel, a screen on a stand.
            solid2.add(blk, box(0.6, 0.1, 1.3, V(fx, 0.2, fz)));
            solid2.add(blk, box(0.5, 0.5, 0.12, V(fx, 0.55, fz + 0.45)));
            solid2.add(blk, box(0.5, 0.1, 0.45, V(fx, 0.33, fz + 0.25)));
            const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 20), blk);
            wheel.position.set(fx, 0.7, fz - 0.3);
            group.add(wheel);
            solid2.add(mats.darkMetal, box(0.9, 0.52, 0.05, V(fx, 1.25, fz - 0.62)));
            break;
          }
          default: {
            // A counter in the brand colour with a stack of swag on it.
            solid2.add(brandMat, box(1.0, 1.0, 0.5, V(fx, 0.58, fz)));
            solid2.add(white, box(1.04, 0.04, 0.54, V(fx, 1.1, fz)));
            for (let k = 0; k < 5; k++) solid2.add(blk, box(0.12, 0.08, 0.12, V(fx - 0.3 + k * 0.15, 1.16, fz)));
          }
        }
        // The belt barrier across the open front: posts and a red belt.
        const belt = new THREE.MeshStandardMaterial({ color: 0xb22222, roughness: 0.6 });
        const posts = Math.max(2, Math.round(bw / 1.6) + 1);
        // Only while the hall is shut (chapter 2): in chapter 3 the stands are
        // open for business (Michele, 29 Sep) and the belts are gone.
        for (let k = 0; k < posts; k++) {
          const px = x0 + 0.15 + ((bw - 0.3) * k) / (posts - 1);
          belts.add(mats.steel, box(0.05, 0.95, 0.05, V(px, 0.48, z1 + 0.1)));
          belts.add(mats.steel, new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16).translate(px, 0.015, z1 + 0.1));
        }
        belts.add(belt, box(bw - 0.3, 0.05, 0.01, V(cx, 0.9, z1 + 0.1)));
        return;
      }
      // A high table.
      const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(sch.brand), roughness: 0.9, transparent: true, opacity: 1 });
      // Warm grey laminate, matt: a white gloss top under a high bay burnt out to
      // a glowing slab (survey, 28 Sep).
      const top = new THREE.MeshStandardMaterial({ color: 0x625d57, roughness: 0.85, transparent: true, opacity: 1 });
      const tableMats = [cloth, top];
      const g = new THREE.Group();
      g.add(new THREE.Mesh(box(bw, 0.05, bd, V(cx, TABLE_TOP, cz)), top));
      for (const [vx, vz, lw, ld] of [
        [cx, cz + bd / 2, bw, 0.02],
        [cx, cz - bd / 2, bw, 0.02],
        [cx + bw / 2, cz, 0.02, bd],
        [cx - bw / 2, cz, 0.02, bd],
      ]) {
        g.add(new THREE.Mesh(box(lw, 0.25, ld, V(vx, TABLE_TOP - 0.13, vz)), cloth));
        // A steel rim round the top that does not fade: with the top see-through
        // it is what still says "a table, and she is under it".
        g.add(new THREE.Mesh(box(Math.max(lw, 0.04), 0.04, Math.max(ld, 0.04), V(vx, TABLE_TOP + 0.02, vz)), legMat));
      }
      for (const [lx, lz] of [
        [cx - bw / 2 + 0.1, cz - bd / 2 + 0.1],
        [cx + bw / 2 - 0.1, cz - bd / 2 + 0.1],
        [cx - bw / 2 + 0.1, cz + bd / 2 - 0.1],
        [cx + bw / 2 - 0.1, cz + bd / 2 - 0.1],
      ]) g.add(new THREE.Mesh(box(0.05, TABLE_TOP - 0.03, 0.05, V(lx, (TABLE_TOP - 0.03) / 2, lz)), legMat));
      // On top: a laptop and a bowl of stickers.
      const lap = new THREE.Mesh(box(0.34, 0.02, 0.24, V(cx - bw * 0.2, TABLE_TOP + 0.035, cz)), mats.darkMetal);
      const lid = new THREE.Mesh(box(0.34, 0.22, 0.015, V(cx - bw * 0.2, TABLE_TOP + 0.14, cz - 0.12)), mats.darkMetal);
      lid.rotation.x = -0.25;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.07, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color(sch.brand), roughness: 0.4 }));
      bowl.position.set(cx + bw * 0.22, TABLE_TOP + 0.06, cz);
      g.add(lap, lid, bowl);
      group.add(g);
      tables.push({ rect: { x: b.x, y: b.y, w: b.w, h: b.h }, mats: tableMats, fade: 1 });
    });
    colliders.push(...solid2.build(group));
    belts.build(beltGroup);
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
  const bays: Array<{ light: THREE.SpotLight; lamp: THREE.Mesh; ring: THREE.MeshBasicMaterial; at: number }> = [];
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  // Four across the hall, two more over the lobby, two rows of each — all
  // INSIDE the glass: the lobby's used to run on to x 1480 and 1740, into the
  // facade and out over the forecourt (backlog, 28 Sep).
  const bayXs = [GF.hall.x + 130, GF.hall.x + 370, GF.hall.x + 610, GF.hall.x + 850, 1180, 1390];
  for (const x of bayXs) {
    for (let iz = 0; iz < 2; iz++) {
      const z = GF.hall.y + 150 + iz * 300;
      const light = new THREE.SpotLight(0xfff1dc, 0, 30, 1.1, 0.7, 1.3);
      light.position.set(m(x), HALL_H - 0.6, m(z));
      const ix = bayXs.indexOf(x);
      light.target.position.set(m(x), 0, m(z));
      group.add(light, light.target);
      // A big disc pendant, as in the photographs: a dark shade, a glowing
      // face underneath, and a warm orange ring round its rim.
      const PY = HALL_H - 1.5;
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.1, 32), mats.darkMetal);
      shade.position.set(m(x), PY + 0.05, m(z));
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.02, 32), lampMat.clone());
      lamp.position.set(m(x), PY - 0.01, m(z));
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.03, 8, 40), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(m(x), PY, m(z));
      const cable = new THREE.Mesh(box(0.015, HALL_H - PY, 0.015, V(m(x), (HALL_H + PY) / 2, m(z))), mats.darkMetal);
      group.add(shade, lamp, ring, cable);
      light.position.y = PY - 0.1;
      bays.push({ light, lamp, ring: ringMat, at: Math.max(0, 1 - x / (GF.hall.x + GF.hall.w)) });
      void ix;
      volumeSpots.push({ light, fog: 0.08 });
    }
  }
  // The general fill a lit hall has from its whole ceiling of fittings: off in
  // the blackout, up with the bays. A hemisphere so floors and walls separate.
  const fill = new THREE.HemisphereLight(0xfff4e6, 0x3a3430, 0);
  group.add(fill);
  let power = 0;
  /*
   * HEADLIGHTS. Every half minute or so a car turns in off the road and its
   * lights sweep through the entrance glass, across the lobby and into the
   * hall — only while the building is dark (chapter 2 before the breaker). A
   * spot outside the facade, travelling along it and swinging in, with its
   * beam in the fog.
   */
  const car = new THREE.SpotLight(0xfff1d8, 0, 60, 0.3, 0.5, 1.2);
  car.position.set(m(GF.entrance.x) + 12, 0.8, m(GF.entrance.y));
  car.target.position.set(m(GF.entrance.x) - 20, 0.6, m(GF.entrance.y));
  group.add(car, car.target);
  volumeSpots.push({ light: car, fog: 0.18 });
  let nextCar = 9;
  let carT = -1;
  /**
   * Chapter 3 is the morning: doors open, daylight through the glass, the
   * whole hall bright. It rendered as chapter 2's hall with the power on —
   * dim between the bays (the survey's "hall renders dark", 28 Sep).
   */
  let morning = false;
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
      morning = n >= 3;
      beltGroup.visible = n < 3;
      setOutsideMorning(n >= 3);
    },
    setPower(on: number, t: number, instant = false): void {
      if (on > 0 && power === 0) poweredAt = instant ? t - 60 : t;
      if (on === 0) poweredAt = null;
      power = on;
    },
    setFocus(x: number, z: number): void {
      focusX = x;
      focusZ = z;
    },
    update(t: number, dt: number): void {
      for (const u of updaters) u(t, dt);
      {
        const dark = poweredAt === null && !morning;
        if (carT < 0 && t > nextCar && dark) carT = 0;
        if (carT >= 0) {
          carT += dt;
          const u = carT / 4.5;
          if (u >= 1 || !dark) {
            carT = -1;
            nextCar = t + 22 + ((t * 7.13) % 1) * 16;
            car.intensity = 0;
          } else {
            // Along the forecourt, north to south, turning in towards the doors.
            const z = m(40) + (m(GZ) - m(80)) * u;
            car.position.set(m(GF.entrance.x) + 14 - 6 * Math.sin(u * Math.PI), 0.8, z);
            const swing = Math.sin(u * Math.PI);
            car.target.position.set(m(GF.entrance.x) - 25 * swing - 2, 0.5, z + 18 * (1 - swing));
            car.intensity = 900 * Math.min(1, Math.sin(u * Math.PI) * 2.2);
          }
        }
      }
      for (const b of bays) {
        // Booth by booth: each bay strikes 0.25 s after the one nearer the lobby.
        const k = poweredAt === null ? 0 : THREE.MathUtils.clamp((t - poweredAt - b.at * 2.2) / 0.5, 0, 1);
        const flick = k > 0 && k < 1 ? (Math.sin(t * 60 + b.at * 40) > 0 ? 1 : 0.2) : 1;
        // Morning is daylight plus the fittings, so the bays drop back and the even
        // fill below carries the hall: at 1700 each bay burnt a white pool round
        // whoever stood under it (Michele, 29 Sep: "chap 3 lighting seems a bit too much").
        b.light.intensity = (morning ? 750 : 1700) * k * flick;
        (b.lamp.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.95, 0.85).multiplyScalar(6 * k * flick);
        b.ring.color.setRGB(1, 0.45, 0.12).multiplyScalar(5 * k * flick);
      }
      const lit = poweredAt === null ? 0 : THREE.MathUtils.clamp((t - poweredAt - 1.2) / 1.2, 0, 1);
      fill.intensity = (morning ? 2.1 : 1.1) * lit;
      // Reception is on the same circuit: dark until the breaker, lit after.
      for (const g of receptionGlows) g.mat.color.copy(g.base).multiplyScalar(0.02 + 0.98 * lit);
      if (receptionLight) receptionLight.intensity = 18 * lit;
      if (morning) fill.color.setRGB(1, 0.98, 0.95);
      boothBoards.forEach((mat, i) => mat.color.setScalar(0.08 + 2.2 * lit * (0.92 + 0.08 * Math.sin(t * 2 + i))));
      // The pods' print catches the hall lights; their header strips light up with it.
      for (const mat of panels) mat.emissiveIntensity = 0.05 + 0.35 * lit;
      for (const st of strips) st.mat.color.copy(st.base).multiplyScalar(0.2 + 4 * lit);
      // A table over the robot being driven fades so she can be seen under it.
      for (const tb of tables) {
        const under = focusX > m(tb.rect.x) - 0.2 && focusX < m(tb.rect.x + tb.rect.w) + 0.2 && focusZ > m(tb.rect.y) - 0.2 && focusZ < m(tb.rect.y + tb.rect.h) + 0.2;
        tb.fade += ((under ? 0.15 : 1) - tb.fade) * Math.min(1, dt * 8);
        for (const mt of tb.mats) {
          mt.opacity = tb.fade;
          mt.depthWrite = tb.fade > 0.95;
        }
      }
    },
  };
}
