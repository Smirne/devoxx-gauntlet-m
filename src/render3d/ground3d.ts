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

import { DUKE, GF, LOBBY_RISE_M, MAIN_STAIR_TOP_M, WIFI_TAG, groundPlates, groundRiseM, groundWallsFor, stairDoors, stairMidLanding, stairRamps } from '../sim/geometry';
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
    case 'totem':
      return { h: 2.8, mat: mats.blackGloss };
    case 'crate':
      return { h: 1.1, mat: mats.counter };
    case 'column':
    case 'lobby-column':
      return { h: HALL_H, mat: concrete };
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
    case 'accent-panel':
      return { h: 3.0, mat: mats.enamel };
    // The main flight's sides are drawn by `mainStairSides`, off the photos.
    case 'mainstair':
    // Duke is his own model (duke.ts); the entrance's frames and doors are `facade`.
    case 'duke':
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
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(L, DH), mats.glass);
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
  {
    // Duke, on his sim footprint, facing the doors.
    const duke = buildDuke();
    duke.root.position.set(m(DUKE.x), groundRiseM(DUKE.x), m(DUKE.y));
    duke.root.rotation.y = Math.PI / 2;
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
  {
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
        const H = 2.6;
        solid2.add(mats.darkMetal, box(bw - 0.04, H, bd - 0.04, V(cx, H / 2, cz), 2));
        const tex = boothGraphic(b.name, sch.brand, sch.ink, sch.strap);
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: new THREE.Color(1, 1, 1), emissiveMap: tex, emissiveIntensity: 0.05 });
        panels.push(mat);
        // Four printed faces; not the one the spray tag is painted on.
        const faces: Array<[number, number, number, number]> = [
          [cx, cz + bd / 2 + 0.005, 0, bw],
          [cx, cz - bd / 2 - 0.005, Math.PI, bw],
          [cx + bw / 2 + 0.005, cz, Math.PI / 2, bd],
          [cx - bw / 2 - 0.005, cz, -Math.PI / 2, bd],
        ];
        for (const [fx, fz, yaw, len] of faces) {
          if (Math.abs(fx - m(tagFace.x)) < 0.05 && Math.abs(fz - m(tagFace.y)) < bd) continue;
          const f = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.1, H - 0.5), mat);
          f.position.set(fx, 1.2, fz);
          f.rotation.y = yaw;
          group.add(f);
        }
        // The header: a strip of light round the top edge, in the brand colour.
        const strip = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
        strips.push({ mat: strip, base: new THREE.Color(sch.brand) });
        group.add(new THREE.Mesh(box(bw + 0.02, 0.12, bd + 0.02, V(cx, H - 0.1, cz)), strip));
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
      for (const b of bays) {
        // Booth by booth: each bay strikes 0.25 s after the one nearer the lobby.
        const k = poweredAt === null ? 0 : THREE.MathUtils.clamp((t - poweredAt - b.at * 2.2) / 0.5, 0, 1);
        const flick = k > 0 && k < 1 ? (Math.sin(t * 60 + b.at * 40) > 0 ? 1 : 0.2) : 1;
        b.light.intensity = 2400 * k * flick;
        (b.lamp.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.95, 0.85).multiplyScalar(6 * k * flick);
        b.ring.color.setRGB(1, 0.45, 0.12).multiplyScalar(5 * k * flick);
      }
      const lit = poweredAt === null ? 0 : THREE.MathUtils.clamp((t - poweredAt - 1.2) / 1.2, 0, 1);
      fill.intensity = (morning ? 2.4 : 1.1) * lit;
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
