/**
 * The opening sequence's crates, and the one thing about them that cannot be
 * checked by looking: **the spanning stencil**.
 *
 * `docs/playtest-notes.md`, "Crate stencils — agreed 24 Sep": one shipping
 * stencil spans all three crates, `DEVOXX` with **exactly two letters per crate**
 * so both seams fall between letters and no glyph is ever cut by a gap, and a
 * continuous `ANTWERPEN · T.A.V. STEPHAN` under it. Michele's own words for why
 * it matters — *"the antwerpen sticker could stretch between the 3 crates instead
 * of being repeated?"* — and the notes' own consequence: *"crate order is
 * load-bearing (Voxxy, Droid, Biggy, left to right) and the three faces must be
 * coplanar and evenly gapped, or the word skews."*
 *
 * A word skewing is not something a screenshot catches reliably: a 3 cm drift is
 * two pixels at the intro's framing and a great deal more once somebody re-sizes
 * a crate. So the arithmetic is asserted from `crateLayout()` — the *same*
 * function the canvas draws from, not a copy of its numbers — and the two
 * properties that carry the whole spec are checked directly:
 *
 *   1. every glyph cell is clear of both seams by the full ink margin, and
 *   2. the tracking is constant along the entire word, including **across** the
 *      seams, which is the formal statement of "the word does not skew".
 *
 * The second one is the interesting test. It fails the moment two adjacent crates
 * stop being the same width, which is the failure mode the layout's own header
 * spends a page explaining, and there is no other way to notice it going wrong.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { DEFS } from '../src/sim/constants';
import type { RobotKind } from '../src/sim/types';
import { ROBOT_HEIGHT_M, m } from '../src/sim/units';
import {
  CRATE_GAP,
  CRATE_ORDER,
  INK_MARGIN,
  PALLET_H,
  buildCrates,
  crateLayout,
} from '../src/render/crates';

const layout = crateLayout();
const EPS = 1e-9;

/** Every glyph cell of the spanning word, left to right. */
const cells = layout.crates.flatMap((c) => c.letters);

describe('the three crates, as a row', () => {
  it('stands them left to right in the order that spells the word', () => {
    expect(layout.crates.map((c) => c.kind)).toEqual([...CRATE_ORDER]);
    const xs = layout.crates.map((c) => c.centreX);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it('leaves exactly the same air between each pair of crates', () => {
    for (let i = 0; i < layout.crates.length - 1; i++) {
      const a = layout.crates[i];
      const b = layout.crates[i + 1];
      const gap = b.centreX - b.width / 2 - (a.centreX + a.width / 2);
      expect(gap).toBeCloseTo(CRATE_GAP, 9);
    }
  });

  it('puts a seam in the middle of each of those gaps', () => {
    expect(layout.seams).toHaveLength(2);
    for (let i = 0; i < layout.seams.length; i++) {
      const a = layout.crates[i];
      expect(layout.seams[i]).toBeCloseTo(a.centreX + a.width / 2 + CRATE_GAP / 2, 9);
    }
  });

  it('is centred on its own origin, so the caller places it by one point', () => {
    const left = layout.crates[0].centreX - layout.crates[0].width / 2;
    const right = layout.crates[2].centreX + layout.crates[2].width / 2;
    expect(left + right).toBeCloseTo(0, 9);
    expect(right - left).toBeCloseTo(layout.span, 9);
  });
});

describe('DEVOXX, spanning all three faces', () => {
  it('spells the word, two letters to a crate', () => {
    expect(cells.map((c) => c.char).join('')).toBe(layout.word);
    for (const c of layout.crates) {
      expect(c.letters, `${c.kind} carries two letters`).toHaveLength(2);
      expect(c.letters.every((l) => l.kind === c.kind)).toBe(true);
    }
    expect(layout.crates.map((c) => c.letters.map((l) => l.char).join(''))).toEqual(['DE', 'VO', 'XX']);
  });

  /**
   * THE CHECK THE PIECE EXISTS FOR. Not "roughly clear" — clear by the margin the
   * painter reserves, measured from the cell, which is wider than the drawn glyph.
   */
  it('never lets a seam cut a glyph, on either gap', () => {
    for (const seam of layout.seams) {
      const lo = seam - CRATE_GAP / 2;
      const hi = seam + CRATE_GAP / 2;
      for (const cell of cells) {
        const l = cell.x - cell.cell / 2;
        const r = cell.x + cell.cell / 2;
        // The cell lies wholly left of the gap, or wholly right of it, by a margin.
        const clear = r <= lo - INK_MARGIN + EPS || l >= hi + INK_MARGIN - EPS;
        expect(clear, `"${cell.char}" at ${l.toFixed(3)}..${r.toFixed(3)} vs gap ${lo.toFixed(3)}..${hi.toFixed(3)}`).toBe(
          true,
        );
      }
    }
  });

  it('keeps every glyph inside its own crate face, margin and all', () => {
    for (const c of layout.crates) {
      const lo = c.centreX - c.width / 2;
      const hi = c.centreX + c.width / 2;
      for (const cell of c.letters) {
        expect(cell.x - cell.cell / 2).toBeGreaterThanOrEqual(lo + INK_MARGIN - EPS);
        expect(cell.x + cell.cell / 2).toBeLessThanOrEqual(hi - INK_MARGIN + EPS);
      }
    }
  });

  /**
   * "…or the word skews". Constant tracking *across* the seams is what makes six
   * letters on three separate boxes read as one word, and it is the property that
   * breaks first if two adjacent crates stop being the same width.
   */
  it('tracks every pair of letters identically, seams included', () => {
    const gaps: number[] = [];
    for (let i = 1; i < cells.length; i++) {
      gaps.push(cells[i].x - cells[i].cell / 2 - (cells[i - 1].x + cells[i - 1].cell / 2));
    }
    expect(gaps).toHaveLength(5);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9);
    // And that constant is what the geometry forces it to be: the crate gap plus
    // the two edge margins. Nothing tighter is reachable — see the module header.
    expect(gaps[0]).toBeCloseTo(CRATE_GAP + 2 * INK_MARGIN, 9);
  });

  it('gives every glyph the same cell, so no letter is drawn larger than another', () => {
    for (const cell of cells) expect(cell.cell).toBeCloseTo(layout.cell, 9);
    expect(layout.cell).toBeGreaterThan(0.3);
  });
});

describe('ANTWERPEN · T.A.V. STEPHAN, the continuous second line', () => {
  it('is split across the three faces without dropping or repeating a character', () => {
    expect(layout.crates.map((c) => c.sub).join('')).toBe(layout.subline);
    for (const c of layout.crates) expect(c.sub.length).toBeGreaterThan(0);
  });

  it('splits it in proportion to the faces, so the type stays one size', () => {
    // Characters per metre of ink width, per face: within 20% of each other is the
    // most a reader would ever notice at this size.
    const density = layout.crates.map((c) => c.sub.length / (c.width - 2 * INK_MARGIN));
    const lo = Math.min(...density);
    const hi = Math.max(...density);
    expect(hi / lo).toBeLessThan(1.2);
  });

  it('keeps Stephan whole, on the crate with the room for him', () => {
    expect(layout.crates[2].sub).toContain('STEPHAN');
  });
});

describe('the per-crate corner blocks', () => {
  it('says what Michele approved, on the crate he approved it for', () => {
    const corner = (k: RobotKind): string => layout.crates.find((c) => c.kind === k)?.corner.join(' ') ?? '';
    expect(corner('voxxy')).toContain('FRAGILE');
    expect(corner('voxxy')).toContain('THIS WAY UP');
    expect(corner('droid')).toContain('DO NOT BEND');
    // "keep both bulky and highly fragile on biggy" — both, stacked as one block.
    expect(corner('biggy')).toContain('BULKY');
    expect(corner('biggy')).toContain('HIGHLY FRAGILE');
  });

  it('drops ZAAL 8 — three bands on one face is one too many', () => {
    const all = layout.crates.map((c) => [...c.corner, c.sub].join(' ')).join(' ');
    expect(all).not.toContain('ZAAL');
  });
});

describe('the bands fit on every face', () => {
  it('leaves the big band clear of every crate lid', () => {
    for (const c of layout.crates) {
      expect(layout.band.top, `${c.kind}`).toBeLessThan(c.height - 0.08);
    }
  });

  it('stacks the three bands without overlapping, and in that order', () => {
    const b = layout.band;
    expect(b.top - b.capH).toBeGreaterThan(b.subTop);
    expect(b.subTop - b.subCapH).toBeGreaterThan(b.cornerTop);
    expect(b.cornerTop).toBeGreaterThan(b.cornerBottom);
    expect(b.cornerBottom).toBeGreaterThan(0);
  });
});

describe('a crate fits its robot — which is the whole gag', () => {
  for (const kind of CRATE_ORDER) {
    it(`packs ${kind} with clearance all round`, () => {
      const c = layout.crates.find((o) => o.kind === kind);
      expect(c).toBeDefined();
      const across = 2 * m(DEFS[kind].r);
      const tall = ROBOT_HEIGHT_M[kind];
      const i = (c as NonNullable<typeof c>).interior;
      expect(i.width, 'width').toBeGreaterThan(across + 0.1);
      expect(i.depth, 'depth').toBeGreaterThan(across + 0.05);
      expect(i.height, 'height').toBeGreaterThan(tall + 0.1);
      // ...and is not a warehouse. A crate two robots wide is not a crate.
      expect(i.width).toBeLessThan(across * 2);
    });
  }

  it('makes Biggy\'s the heavy one and Droid\'s the tall one', () => {
    const vol = (k: RobotKind): number => {
      const c = layout.crates.find((o) => o.kind === k) as (typeof layout.crates)[number];
      return c.width * c.depth * c.height;
    };
    const height = (k: RobotKind): number =>
      (layout.crates.find((o) => o.kind === k) as (typeof layout.crates)[number]).height;
    expect(vol('biggy')).toBeGreaterThan(vol('droid'));
    expect(vol('biggy')).toBeGreaterThan(vol('voxxy') * 2);
    expect(height('droid')).toBeGreaterThan(height('biggy'));
    expect(height('voxxy')).toBeLessThan(height('biggy'));
  });
});

describe('the built model', () => {
  it('builds headless, with a named openable panel and a stand anchor per crate', () => {
    const crates = buildCrates({ centre: { x: 4, z: -2 }, baseY: 1.5 });
    try {
      expect(crates.crates).toHaveLength(3);
      for (const c of crates.crates) {
        expect(c.root.name).toBe(`crate-${c.kind}`);
        const panel = c.root.getObjectByName(`crate-panel-${c.kind}`);
        expect(panel, `${c.kind} panel is a named child`).toBeDefined();
        expect(panel).toBe(c.panel);
        expect(c.root.getObjectByName(`crate-stand-${c.kind}`)).toBe(c.anchor);
      }
      // The assembly is placed by one transform, and the anchors follow it.
      crates.root.updateMatrixWorld(true);
      const p = crates.byKind('droid').anchor.getWorldPosition(new THREE.Vector3());
      expect(p.x).toBeCloseTo(4 + layout.crates[1].centreX, 6);
      expect(p.z).toBeCloseTo(-2, 6);
      expect(p.y).toBeCloseTo(1.5 + PALLET_H + 0.05, 6);
    } finally {
      crates.dispose();
    }
  });

  it('opens the front panel by tipping it out and dropping it flat', () => {
    const crates = buildCrates();
    try {
      const c = crates.byKind('voxxy');
      c.setOpen(0);
      expect(c.panel.rotation.x).toBeCloseTo(0, 9);
      expect(c.panel.position.y).toBeCloseTo(PALLET_H, 9);
      c.setOpen(1);
      expect(c.panel.rotation.x).toBeGreaterThan(Math.PI / 2);
      expect(c.panel.position.y).toBeCloseTo(0, 9);
      // Clamped, so a choreography overshooting its own ease cannot fold it back.
      c.setOpen(4);
      expect(c.panel.rotation.x).toBeLessThan(Math.PI);
    } finally {
      crates.dispose();
    }
  });

  it('drives a lamp 0..1 per crate without touching the scene lighting', () => {
    const crates = buildCrates();
    try {
      const lit: number[] = [];
      crates.root.traverse((o) => {
        if (o instanceof THREE.Light) throw new Error('crates.ts must not add lights');
      });
      const glow = crates.byKind('biggy').root.getObjectByName('crate-slits-biggy');
      expect(glow).toBeInstanceOf(THREE.Mesh);
      const mat = (glow as THREE.Mesh).material as THREE.MeshBasicMaterial;
      for (const v of [0, 0.5, 1]) {
        crates.byKind('biggy').setLamp(v);
        lit.push(mat.opacity);
      }
      expect(lit[0]).toBe(0);
      expect(lit[1]).toBeGreaterThan(0);
      expect(lit[2]).toBeGreaterThan(lit[1]);
      expect(lit[2]).toBeLessThanOrEqual(1);
      // Its own robot's colour, off the frozen light definition rather than typed.
      const [r, g, b] = DEFS.biggy.light.c;
      expect(mat.color.r).toBeCloseTo(r / 255, 5);
      expect(mat.color.g).toBeCloseTo(g / 255, 5);
      expect(mat.color.b).toBeCloseTo(b / 255, 5);
    } finally {
      crates.dispose();
    }
  });

  it('stays inside a handful of draw calls', () => {
    const crates = buildCrates();
    try {
      let meshes = 0;
      crates.root.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes++;
      });
      // Six per crate: pallet, body, side slits, panel slab, painted face, cleats,
      // plus the face's glow decal. Everything else is merged.
      expect(meshes).toBeLessThanOrEqual(24);
    } finally {
      crates.dispose();
    }
  });
});
