/**
 * THE SPONSOR STANDS — twelve names, twelve stands, and no new aisle furniture.
 *
 * Michele asked for the hall to read as a Devoxx exhibition floor: *"Polishing
 * the graphic, making people and stands real etc."* The three things that has to
 * mean, and that a screenshot cannot be trusted to keep saying, are:
 *
 *  1. every one of the twelve sponsors in `SPONSORS` has its name on something
 *     the renderer built — before this round the names existed only in the sim,
 *     spoken by the "why am I blocked" lines, and were on screen nowhere;
 *  2. the stands are deterministic — brand and furniture come from the booth's
 *     own `col`/`row`, never from an RNG, so two builds are the same build and a
 *     before/after screenshot pair means something;
 *  3. nothing a stand adds stands in a walking lane. `tests/colliders.test.ts`
 *     proves that in general by sweeping the whole venue; this proves the
 *     specific promise the booth builder made, which is that its meshes stay
 *     inside the booth rect, the totem rect or the crate rect — the three
 *     footprints `src/sim/geometry.ts` already gives colliders — unless they are
 *     carpet.
 *
 * Point 3 is the one worth having separately: the general sweep only complains
 * when a robot can *reach* the cell, so a booth that grew a leg into a lane the
 * chapter happens to fence off would pass it and still be wrong.
 */

import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GF, SPONSORS, boothCrate, boothTotem } from '../src/sim/geometry';
import type { Rect } from '../src/sim/types';
import { PX_PER_M } from '../src/sim/units';
import { buildVenue, type Venue } from '../src/render/venue/index';

let venue: Venue;
beforeAll(() => {
  venue = buildVenue();
  venue.group.updateMatrixWorld(true);
});
afterAll(() => {
  venue.dispose();
});

/** Every named object under the booths group, whatever its depth. */
function boothNames(): string[] {
  const out: string[] = [];
  const booths = venue.group.getObjectByName('booths');
  booths?.traverse((o) => {
    if (o.name !== '') out.push(o.name);
  });
  return out;
}

describe('the sponsor stands', () => {
  it('builds a stand for each of the twelve sponsors, at its own plan position', () => {
    const names = new Set(boothNames());
    const missing: string[] = [];
    for (const bo of GF.booths) {
      const key = `${bo.col}-${bo.row}`;
      // A built stand carries its brand wall; a half table carries its cloth.
      const has = bo.table
        ? names.has(`booth-cloth-${key}`) && names.has(`booth-banner-${key}`)
        : names.has(`booth-screen-${key}`) && names.has(`booth-totem-${key}`);
      if (!has) missing.push(`${bo.name} (${key}, ${bo.table ? 'table' : 'built'})`);
    }
    expect(missing, `sponsors with nothing on screen carrying their name: ${missing.join(', ')}`).toEqual([]);
    expect(GF.booths.length).toBe(SPONSORS.length);
  });

  it('gives every stand its carpet tile and the white taped edge round it', () => {
    for (const name of ['booth-carpet', 'booth-carpet-edge']) {
      expect(venue.group.getObjectByName(name), `missing ${name}`).toBeDefined();
    }
  });

  it('draws two builds identically — the brand comes from col/row, never from an RNG', () => {
    const second = buildVenue();
    second.group.updateMatrixWorld(true);
    const nameOf = (v: Venue): string[] => {
      const out: string[] = [];
      v.group.getObjectByName('booths')?.traverse((o) => {
        if (o.name !== '') out.push(`${o.name}@${o.position.toArray().map((n) => n.toFixed(4)).join(',')}`);
      });
      return out.sort();
    };
    expect(nameOf(second)).toEqual(nameOf(venue));
    second.dispose();
  });

  it('keeps every stand mesh inside a footprint the sim already collides', () => {
    /** The rects `groundWalls()` gives the booth field, in sim px. */
    const allowed: Rect[] = [];
    for (const bo of GF.booths) {
      allowed.push({ x: bo.x, y: bo.y, w: bo.w, h: bo.h });
      const t = boothTotem(bo);
      if (t) allowed.push(t);
      const c = boothCrate(bo);
      if (c) allowed.push(c);
    }
    /** Carpet is exempt: it is flat, and the sweep's own floor cut is 0.15 m. */
    const FLAT_TOP = 0.15;

    const box = new THREE.Box3();
    const tmp = new THREE.Matrix4();
    const strays: string[] = [];
    const check = (mat: THREE.Matrix4, geo: THREE.BufferGeometry, name: string): void => {
      if (!geo.boundingBox) geo.computeBoundingBox();
      const local = geo.boundingBox;
      if (!local) return;
      box.copy(local).applyMatrix4(mat);
      // The venue group puts the exhibition level a storey down; the stands are
      // all at base 0 on their own floor, so measure against the group's origin.
      const floor = venue.ground.position.y;
      if (box.max.y - floor <= FLAT_TOP) return;
      const r: Rect = {
        x: box.min.x * PX_PER_M,
        y: box.min.z * PX_PER_M,
        w: (box.max.x - box.min.x) * PX_PER_M,
        h: (box.max.z - box.min.z) * PX_PER_M,
      };
      // 1 px of slack: panels are held a fraction proud of their wall on purpose,
      // to stop two coplanar faces flickering.
      const pad = 1;
      const fits = allowed.some(
        (a) => r.x >= a.x - pad && r.y >= a.y - pad && r.x + r.w <= a.x + a.w + pad && r.y + r.h <= a.y + a.h + pad,
      );
      if (!fits) strays.push(`${name} at ${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.w.toFixed(0)}x${r.h.toFixed(0)} px`);
    };

    venue.group.getObjectByName('booths')?.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o instanceof THREE.InstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, tmp);
          tmp.premultiply(o.matrixWorld);
          check(tmp, o.geometry, `${o.name}#${i}`);
        }
      } else check(o.matrixWorld, o.geometry, o.name);
    });

    expect(
      strays,
      `stand furniture standing in a walking lane, with no collider under it:\n  ${strays.join('\n  ')}`,
    ).toEqual([]);
  });

  it('lays no sponsor carpet up the small staircase', () => {
    // Michele: "staircase should be clear of booths in general". Column 3 of the
    // booth grid already overlaps `GF.smallStairs` by 28 px — that is a fix in
    // `src/sim/geometry.ts` and not this file's to make — but the carpet tile the
    // stands added is clamped off it, so at least the overlap does not grow.
    const carpet = venue.group.getObjectByName('booth-carpet');
    expect(carpet).toBeInstanceOf(THREE.Mesh);
    const geo = (carpet as THREE.Mesh).geometry;
    geo.computeBoundingBox();
    const east = (geo.boundingBox as THREE.Box3).max.x * PX_PER_M;
    expect(east).toBeLessThanOrEqual(GF.smallStairs.x + 0.01);
  });
});
