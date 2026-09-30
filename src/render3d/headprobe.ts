/**
 * headprobe.ts — where a ray meets a sculpted head, without testing every triangle.
 *
 * The portraits (`people3d.ts`) seat their features on the face — eyes, brows,
 * glasses, the mouth, a beard band, a headset's boom — each asking "how far
 * forward is the face at (x, y)?", and grow hair spikes where a ray from
 * outside meets the crown. Every question was a raycast against the whole head:
 * 7,800 triangles a ray, and a smile alone asks five hundred times. Chapter 3
 * sculpted its cast on its first frame and spent 3.2 s of main thread doing it
 * (29 Sep, the chapter-start profile) — the game stopping as the chapter began,
 * which is what players reported as a slowdown "especially on chapter start".
 *
 * So the triangles are sorted once into buckets by where a ray can meet them,
 * and a ray tests only its own bucket: the same triangles it could hit, the same
 * test (three's `Ray.intersectTriangle`, front faces only, as `Mesh.raycast`
 * does for a front-sided mesh) and the nearest hit. The same answers, not
 * approximately — `tests/headprobe.test.ts` holds them to the raycaster's.
 *
 *  - `depth(x, y)`: rays along −z, from in front of the face. A ray at (x, y)
 *    can only meet a triangle whose x/y footprint contains (x, y), so the
 *    buckets are a grid over the footprint.
 *  - `radial(dir)`: rays aimed at the head's centre from outside it. The point
 *    such a ray meets lies in direction `dir` from the centre, so it can only
 *    be on a triangle that spans that direction: the buckets are a grid of
 *    latitude and longitude, each triangle entered over its span (padded for
 *    the bulge of its edges, all the way round near a pole).
 */

import * as THREE from 'three';

/** Cells across the face's footprint, each way. */
const GRID = 48;
/** Latitude bands and longitude sectors for the radial buckets. */
const LAT = 24;
const LON = 48;
/** Padding round a triangle's angular span, rad: its edges are great-circle arcs and bulge past its corners. */
const PAD = 0.05;
/** Within this of a pole every longitude is close: a triangle there goes in the whole band. */
const POLAR = 1.35;

export class HeadProbe {
  private readonly pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  private readonly tri: Uint32Array;
  private readonly x0: number;
  private readonly y0: number;
  private readonly cw: number;
  private readonly ch: number;
  private readonly cells: number[][];
  /** Built the first time a radial ray is asked for: only the spiky heads ask. */
  private bins: number[][] | null = null;
  private readonly ray = new THREE.Ray();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly hit = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry) {
    this.pos = geo.getAttribute('position');
    const index = geo.getIndex();
    const count = index ? index.count : this.pos.count;
    this.tri = new Uint32Array(count);
    for (let i = 0; i < count; i++) this.tri[i] = index ? index.getX(i) : i;
    geo.computeBoundingBox();
    const bb = geo.boundingBox as THREE.Box3;
    this.x0 = bb.min.x;
    this.y0 = bb.min.y;
    this.cw = Math.max(1e-9, (bb.max.x - bb.min.x) / GRID);
    this.ch = Math.max(1e-9, (bb.max.y - bb.min.y) / GRID);
    this.cells = Array.from({ length: GRID * GRID }, () => []);
    const { a, b, c } = this;
    for (let t = 0; t * 3 < count; t++) {
      this.corners(t);
      const i0 = this.col(Math.min(a.x, b.x, c.x));
      const i1 = this.col(Math.max(a.x, b.x, c.x));
      const j0 = this.row(Math.min(a.y, b.y, c.y));
      const j1 = this.row(Math.max(a.y, b.y, c.y));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cells[j * GRID + i].push(t);
    }
  }

  /**
   * The face's depth at (x, y): the z of the first surface met by a ray from
   * (x, y, 3) along −z, or null where it meets none.
   */
  depth(x: number, y: number): number | null {
    const i = Math.floor((x - this.x0) / this.cw);
    const j = Math.floor((y - this.y0) / this.ch);
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return null;
    this.ray.origin.set(x, y, 3);
    this.ray.direction.set(0, 0, -1);
    const at = this.nearest(this.cells[j * GRID + i]);
    return at ? at.z : null;
  }

  /**
   * Where a ray from `3 * dir` towards the centre (`dir` a unit vector) first
   * meets the head, or null. The point is written into `out`.
   */
  radial(dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null {
    this.ray.origin.copy(dir).multiplyScalar(3);
    this.ray.direction.copy(dir).negate();
    const at = this.nearest(this.angular()[this.bin(latOf(dir.x, dir.y, dir.z), lonOf(dir.x, dir.z))]);
    return at ? out.copy(at) : null;
  }

  private angular(): number[][] {
    if (this.bins) return this.bins;
    const bins: number[][] = Array.from({ length: LAT * LON }, () => []);
    for (let t = 0; t * 3 < this.tri.length; t++) {
      this.corners(t);
      this.enterAngular(t, bins);
    }
    this.bins = bins;
    return bins;
  }

  private nearest(list: number[]): THREE.Vector3 | null {
    const { a, b, c, hit, ray } = this;
    let best = Infinity;
    let bx = 0;
    let by = 0;
    let bz = 0;
    for (const t of list) {
      this.corners(t);
      if (ray.intersectTriangle(a, b, c, true, hit) === null) continue;
      const d = ray.origin.distanceTo(hit);
      if (d < best) {
        best = d;
        bx = hit.x;
        by = hit.y;
        bz = hit.z;
      }
    }
    return best === Infinity ? null : hit.set(bx, by, bz);
  }

  private corners(t: number): void {
    const { pos, tri } = this;
    this.a.fromBufferAttribute(pos, tri[t * 3]);
    this.b.fromBufferAttribute(pos, tri[t * 3 + 1]);
    this.c.fromBufferAttribute(pos, tri[t * 3 + 2]);
  }

  private col(x: number): number {
    return Math.min(GRID - 1, Math.max(0, Math.floor((x - this.x0) / this.cw)));
  }

  private row(y: number): number {
    return Math.min(GRID - 1, Math.max(0, Math.floor((y - this.y0) / this.ch)));
  }

  /** Enter triangle `t` (its corners already in a, b, c) in every radial bin its padded span covers. */
  private enterAngular(t: number, bins: number[][]): void {
    const vs = [this.a, this.b, this.c];
    const lats = vs.map((v) => latOf(v.x, v.y, v.z));
    let lons = vs.map((v) => lonOf(v.x, v.z));
    const latLo = Math.min(...lats) - PAD;
    const latHi = Math.max(...lats) + PAD;
    const j0 = Math.max(0, Math.floor(((latLo + Math.PI / 2) / Math.PI) * LAT));
    const j1 = Math.min(LAT - 1, Math.floor(((latHi + Math.PI / 2) / Math.PI) * LAT));
    const polar = latHi > POLAR || latLo < -POLAR || vs.some((v) => Math.hypot(v.x, v.z) < 1e-6);
    let i0 = 0;
    let i1 = LON - 1;
    if (!polar) {
      // Across the seam at ±π: count the negative side a turn on.
      if (Math.max(...lons) - Math.min(...lons) > Math.PI) lons = lons.map((l) => (l < 0 ? l + 2 * Math.PI : l));
      const widen = PAD / Math.max(0.2, Math.cos(Math.max(Math.abs(latLo), Math.abs(latHi))));
      i0 = Math.floor(((Math.min(...lons) - widen + Math.PI) / (2 * Math.PI)) * LON);
      i1 = Math.floor(((Math.max(...lons) + widen + Math.PI) / (2 * Math.PI)) * LON);
      if (i1 - i0 >= LON - 1) {
        i0 = 0;
        i1 = LON - 1;
      }
    }
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * LON + (((i % LON) + LON) % LON);
        const list = bins[k];
        if (list[list.length - 1] !== t) list.push(t);
      }
    }
  }

  private bin(lat: number, lon: number): number {
    const j = Math.min(LAT - 1, Math.max(0, Math.floor(((lat + Math.PI / 2) / Math.PI) * LAT)));
    const i = Math.min(LON - 1, Math.max(0, Math.floor(((lon + Math.PI) / (2 * Math.PI)) * LON)));
    return j * LON + i;
  }
}

function latOf(x: number, y: number, z: number): number {
  const r = Math.hypot(x, y, z);
  return r < 1e-12 ? 0 : Math.asin(Math.max(-1, Math.min(1, y / r)));
}

function lonOf(x: number, z: number): number {
  return Math.atan2(z, x);
}
