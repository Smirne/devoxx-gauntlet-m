import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { HeadProbe } from '../src/render3d/headprobe';

/**
 * The head probe must answer exactly what a raycast against the whole head
 * answered — it replaced one (`src/render3d/headprobe.ts`), and every feature on
 * every portrait is seated by it. So this builds a head the way the portraits do
 * (a unit sphere, narrowed, the jaw lengthened, a nose pushed out, hair grown
 * out above a hairline) and puts the same rays to both.
 */
function sculpted(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 72, 54);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const h = Math.sin(Math.round(x * 30) * 127.1 + Math.round(y * 30) * 311.7 + Math.round(z * 30) * 74.7) * 43758.5453;
    const n = h - Math.floor(h);
    const hair = y > 0.35 - 0.2 * z ? 0.06 * (0.75 + 0.5 * n) : 0;
    x *= 0.88;
    if (y < 0) y *= 1.2;
    if (z > 0.5) z += 0.25 * Math.exp(-((x / 0.12) ** 2)) * Math.exp(-(((y + 0.1) / 0.17) ** 2));
    const r = 1 + hair;
    pos.setXYZ(i, x * r, y * r, z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A deterministic stream, so a failure names the same ray every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the head probe', () => {
  const geo = sculpted();
  const probe = new HeadProbe(geo);
  const mesh = new THREE.Mesh(geo);
  const ray = new THREE.Raycaster();

  it('finds the face at (x, y) exactly where a raycast along -z does', () => {
    const r = rng(1);
    let hits = 0;
    for (let k = 0; k < 3000; k++) {
      const x = (r() * 2 - 1) * 1.15;
      const y = (r() * 2 - 1) * 1.3;
      ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
      const want = ray.intersectObject(mesh, false)[0];
      const got = probe.depth(x, y);
      if (!want) {
        expect(got, `(${x}, ${y}) should miss`).toBeNull();
        continue;
      }
      hits++;
      expect(got, `(${x}, ${y}) should hit`).not.toBeNull();
      expect(Math.abs((got as number) - want.point.z), `(${x}, ${y})`).toBeLessThan(1e-9);
    }
    expect(hits, 'the test rays should mostly land on the head').toBeGreaterThan(1500);
  });

  it('finds where a ray aimed at the centre meets the head, exactly as the raycaster does', () => {
    const r = rng(2);
    const out = new THREE.Vector3();
    for (let k = 0; k < 3000; k++) {
      // Every direction, the poles and the seam at ±π included.
      const y = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - y * y);
      const dir = new THREE.Vector3(Math.cos(a) * s, y, Math.sin(a) * s);
      ray.set(dir.clone().multiplyScalar(3), dir.clone().negate());
      const want = ray.intersectObject(mesh, false)[0];
      const got = probe.radial(dir, out);
      expect(!!got, `direction ${dir.toArray()}`).toBe(!!want);
      if (want && got) expect(got.distanceTo(want.point), `direction ${dir.toArray()}`).toBeLessThan(1e-9);
    }
  });

  it('answers the directions a spiral of hair spikes asks, the crown and the poles included', () => {
    // The portraits' own pattern (`spikes` in people3d.ts): a Fibonacci spiral down from the top.
    const out = new THREE.Vector3();
    const tries = 1040;
    for (let k = 0; k < tries; k++) {
      const y = 1 - (k / tries) * 0.95;
      const s = Math.sqrt(Math.max(0, 1 - y * y));
      const a = k * 2.399963;
      const dir = new THREE.Vector3(Math.cos(a) * s, y, Math.sin(a) * s);
      ray.set(dir.clone().multiplyScalar(3), dir.clone().negate());
      const want = ray.intersectObject(mesh, false)[0];
      const got = probe.radial(dir, out);
      expect(!!got).toBe(!!want);
      if (want && got) expect(got.distanceTo(want.point)).toBeLessThan(1e-9);
    }
  });
});
