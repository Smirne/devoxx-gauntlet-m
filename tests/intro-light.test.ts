/**
 * THE OPENING'S THREE COMPLAINTS — 24 Sep 2026, Michele, having played it.
 *
 *   > the left crate is half black. Robots are still black.
 *   > In the intro I'll show them fully, even if it's dark. It's their presentation.
 *   > [...] Why not placing the crates on the west wall and using a single
 *   > transition? [...] Transition to the corridor, different camera angle.
 *
 * Three things came out of that, and this file guards the two and a half of them
 * that can be checked without a screen.
 *
 * **1. The half-black crate is not a material bug.** Voxxy's crate is standing
 * INSIDE a corridor column — 3.3 m of `venue/corridorColumn`, `#1b1e24`, no
 * emissive, which in a blacked-out corridor is exactly black. Nothing in
 * `src/render/crates.ts` is wrong; the row's position is. The first two tests
 * below pin that with numbers off the built page
 * (`scratchpad/intro-light/diagnosis-column-magenta.png` is the same frame with
 * every column painted magenta, and it lands precisely on the black half), and
 * the third gives the rule any future row has to satisfy.
 *
 * **2. The presentation light** is a per-rig emissive lift with no
 * `THREE.Light` anywhere near it — the venue's lighting is the sim's visibility
 * polygons and a stray point light would be a second lighting model. What is
 * asserted here is the part a shot cannot prove: that `v = 0` restores every
 * material EXACTLY, that the eyes and visors are left alone, and that the lift
 * goes through a painted panel's own map rather than flat-lighting `mat.color`
 * (Biggy's belly is `#ffffff` plus a canvas texture in a browser, so a lift on
 * the colour paints his gut white — which the first cut of this did).
 *
 * **3. The camera's azimuth override** must be invisible until it is used.
 * `DIORAMA_AZIMUTH_RAD` is baked into the facing and occlusion rules for the
 * Zaal panels, the keypad, the projector-bay ports and the seat and clue sight
 * lines, and those are checked at that one angle in four other test files. So
 * the test here is that an untouched camera is bit-for-bit what it always was,
 * that a shot's angle can be set and then given back, and that the module-level
 * `dioramaToCameraAtDeg` never moves with it.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  DIORAMA_AZIMUTH_RAD,
  OPENING_AZIMUTH_RAD,
  createCamera,
  dioramaToCameraAtDeg,
} from '../src/render/camera';
import { crateFootprints, crateRowFouls } from '../src/render/crates';
import { PRESENT_MAX_GAIN, createRobot, presentationLight } from '../src/render/robots';

/** `MAP_REF_LUM` in `rig.ts`: what a painted panel weighs in at. */
const MAP_REF = 0.25;
import { CY0, CY1, corridorColumns, roomDoor, rooms } from '../src/sim/geometry';
import { T } from '../src/sim/constants';
import type { RobotKind } from '../src/sim/types';
import type { ViewRect } from '../src/sim/types';

const KINDS: RobotKind[] = ['voxxy', 'droid', 'biggy'];

/* ========================================================================== */
/*  1. the half-black crate                                                   */
/* ========================================================================== */

/**
 * Where the row stood when the half-black crate was reported and diagnosed, sim
 * px — `CRATE_ROW` in `src/sim/opening.ts` on 24 Sep 2026.
 *
 * Frozen here on purpose rather than imported. This pair of tests is EVIDENCE:
 * it says what was wrong with that row, and it has to keep saying it after the
 * row is moved, or the reason the row moved is lost with it.
 */
const ROW_AS_DIAGNOSED = { x: 96, y: 307 } as const;

/** Everything in the corridor a crate must not be standing inside. */
function corridorObstacles(): Array<{ x: number; y: number; w: number; h: number; what: string }> {
  const out: Array<{ x: number; y: number; w: number; h: number; what: string }> = [];
  const cols = corridorColumns();
  for (const c of cols.far) out.push({ ...c, what: 'corridor column (far)' });
  for (const c of cols.near) out.push({ ...c, what: 'corridor column (near)' });
  // The auditorium doors: their leaves are 2.1 m of dark panel standing in the
  // wall line, so a crate backed onto one is the same black rectangle again.
  for (const r of rooms) {
    const d = roomDoor(r);
    out.push({ x: d.x, y: d.y, w: d.w, h: d.h, what: `door to ${r.n}` });
  }
  return out;
}

describe('the half-black crate', () => {
  it('is Voxxy\'s crate standing inside a corridor column', () => {
    const fouls = crateRowFouls(ROW_AS_DIAGNOSED.x, ROW_AS_DIAGNOSED.y, corridorColumns().far);
    expect(fouls).toHaveLength(1);
    const [foul] = fouls;
    expect(foul.kind).toBe('voxxy');
    // The column at the west end of the corridor, as the renderer reports it.
    expect(foul.obstacle.x).toBeCloseTo(59, 6);
    expect(foul.obstacle.x + foul.obstacle.w).toBeCloseTo(75, 6);
    expect(foul.obstacle.y).toBeCloseTo(288, 6);
    expect(foul.obstacle.y + foul.obstacle.h).toBeCloseTo(304, 6);
    // 9.1 px of a 17.25 px crate: the half that renders black.
    expect(foul.overlapX).toBeCloseTo(9.1, 1);
    expect(foul.overlapY).toBeCloseTo(10.25, 1);
    const crate = crateFootprints(ROW_AS_DIAGNOSED.x, ROW_AS_DIAGNOSED.y).find((f) => f.kind === 'voxxy');
    expect(foul.overlapX / (crate?.w ?? 1)).toBeGreaterThan(0.5);
  });

  it('is the only crate of the three that fouls anything, which is why only it is black', () => {
    const fouled = new Set(
      crateRowFouls(ROW_AS_DIAGNOSED.x, ROW_AS_DIAGNOSED.y, corridorObstacles()).map((f) => f.kind),
    );
    expect([...fouled]).toEqual(['voxxy']);
  });

  it('cannot be fixed by sliding the row along the north wall', () => {
    /*
     * Worth asserting rather than asserting a replacement x, because it is the
     * reason the answer is Michele's own restaging rather than a nudge: scanning
     * the whole west half of the corridor a pixel at a time, there is no row
     * centre where all three crates clear both the columns and the door leaves.
     * The row is 4.82 m long, the columns leave a 7.5 m gap at 75..169 and a
     * 9.6 m one at 245..365, and each of those gaps has an auditorium door in
     * the middle of it.
     */
    const obstacles = corridorObstacles();
    const clear: number[] = [];
    for (let x = 40; x <= 400; x++) {
      if (crateRowFouls(x, ROW_AS_DIAGNOSED.y, obstacles).length === 0) clear.push(x);
    }
    expect(clear).toEqual([]);
  });

  it('clears everything once the row stands against the WEST wall', () => {
    /*
     * Michele: *"Why not placing the crates on the west wall"*. Turned a quarter
     * turn (`yaw = pi/2`) the faces point east down the corridor, the row runs
     * north-south across it, and the whole thing fits with room to spare. Face
     * line at x = 29 puts Biggy's 1.78 m depth back to x = 6.75, hard against the
     * west wall's inner face at `T`; y = 350 is the corridor's own centre line.
     */
    const face = 29;
    const mid = (CY0 + CY1) / 2;
    expect(mid).toBe(350);
    const yaw = Math.PI / 2;
    expect(crateRowFouls(face, mid, corridorObstacles(), yaw)).toEqual([]);
    for (const f of crateFootprints(face, mid, yaw)) {
      expect(f.x).toBeGreaterThanOrEqual(T);
      expect(f.y).toBeGreaterThanOrEqual(CY0);
      expect(f.y + f.h).toBeLessThanOrEqual(CY1);
      // Quarter-turned, a crate is as deep across the plan as it is wide on the
      // face — the check above is worth nothing if the rotation was dropped.
      expect(f.w).toBeLessThan(f.h);
    }
  });

  it('puts the faces on one line whichever way the row is turned', () => {
    // The spanning word only reads if the three faces are coplanar, so the
    // footprints must all end on the row's own face line.
    for (const f of crateFootprints(96, 307, 0)) expect(f.y + f.h).toBeCloseTo(307, 6);
    for (const f of crateFootprints(29, 350, Math.PI / 2)) expect(f.x + f.w).toBeCloseTo(29, 6);
  });
});

/* ========================================================================== */
/*  2. the presentation light                                                 */
/* ========================================================================== */

interface MatShot {
  mat: THREE.MeshStandardMaterial;
  emissive: number;
  intensity: number;
  emissiveMap: THREE.Texture | null;
}

function shotOf(root: THREE.Object3D): MatShot[] {
  const seen = new Set<THREE.Material>();
  const out: MatShot[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      const mat = raw as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial || seen.has(mat)) continue;
      seen.add(mat);
      out.push({
        mat,
        emissive: mat.emissive.getHex(),
        intensity: mat.emissiveIntensity,
        emissiveMap: mat.emissiveMap,
      });
    }
  });
  return out;
}

const relLum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('the presentation light', () => {
  for (const kind of KINDS) {
    it(`${kind}: v = 0 puts every material back exactly as it was built`, () => {
      const rig = createRobot(kind);
      const before = shotOf(rig.root).map((s) => ({ ...s }));
      presentationLight(rig, 1);
      presentationLight(rig, 0.37);
      presentationLight(rig, 0);
      const after = shotOf(rig.root);
      expect(after).toHaveLength(before.length);
      for (let i = 0; i < before.length; i++) {
        expect(after[i].mat).toBe(before[i].mat);
        expect(after[i].emissive).toBe(before[i].emissive);
        expect(after[i].intensity).toBe(before[i].intensity);
      }
      rig.dispose();
    });

    /*
     * ONE GAIN, NOT A PER-PANEL TARGET.
     *
     * This used to assert that every lifted panel cleared a luminance floor of
     * 0.08, which is what the old `floor + range * sqrt(lum)` formula did — and
     * doing that to every panel is exactly what flattened Droid into a mid grey
     * (Michele: *"Droid and biggy are whitey-grey"*). The replacement is not a
     * weaker assertion, it is the one that actually pins the behaviour we want:
     * the rig reaches the target ON AVERAGE, and every pair of panels keeps the
     * SAME RATIO it was built with, so the robot's own tonal range survives the
     * light instead of being compressed into it.
     */
    it(`${kind}: exposes the whole rig to the target without flattening it`, () => {
      const rig = createRobot(kind);
      const glow = new Set<THREE.Material>(rig.glow);
      const lit: Array<{ base: number; after: number; maxCh: number }> = [];
      const mats: THREE.MeshStandardMaterial[] = [];
      for (const s of shotOf(rig.root)) {
        if (glow.has(s.mat) || (!s.mat.map && relLum(s.mat.color) < 1e-4)) continue;
        mats.push(s.mat);
      }
      const bases = mats.map((m) => (m.map ? MAP_REF : relLum(m.color)));
      presentationLight(rig, 1);
      mats.forEach((m, i) =>
        lit.push({
          base: bases[i],
          after: relLum(m.emissive),
          // A mapped panel's colour is #ffffff and is deliberately not capped.
          maxCh: m.map ? 0 : Math.max(m.color.r, m.color.g, m.color.b),
        }),
      );
      expect(lit.length).toBeGreaterThan(3);

      /*
       * The gain is ONE number, so every panel with headroom shares it exactly.
       *
       * "With headroom" has to be judged on the panel's brightest CHANNEL, not
       * on its luminance: the cap is proportional, so a saturated colour like
       * Droid's amber runs out of room in red long before its luminance gets
       * anywhere near 1. Judging by luminance is what made the first version of
       * this assertion compare a capped panel against an uncapped one.
       */
      const gain = Math.max(...lit.map((e) => e.after / e.base));
      expect(gain, 'a presentation light made the robot darker').toBeGreaterThanOrEqual(1 - 1e-6);
      expect(gain).toBeLessThanOrEqual(PRESENT_MAX_GAIN + 1e-6);
      let shared = 0;
      for (const e of lit) {
        const ratio = e.after / e.base;
        if (e.maxCh * gain <= 1) {
          expect(ratio, 'a panel with headroom did not get the rig gain').toBeCloseTo(gain, 4);
          shared++;
        } else {
          // Capped, but only ever downward, and never below its own colour.
          expect(ratio).toBeLessThanOrEqual(gain + 1e-6);
          expect(ratio).toBeGreaterThanOrEqual(1 - 1e-6);
        }
      }
      expect(shared, 'every panel was capped — the gain was never actually applied').toBeGreaterThan(0);
      rig.dispose();
    });

    it(`${kind}: keeps every panel's hue exactly, which is what greyed them out before`, () => {
      const rig = createRobot(kind);
      const glow = new Set<THREE.Material>(rig.glow);
      const mats = shotOf(rig.root)
        .filter((s) => !glow.has(s.mat) && !s.mat.map && relLum(s.mat.color) >= 1e-4)
        .map((s) => s.mat);
      const hue = (c: THREE.Color): number => {
        const mx = Math.max(c.r, c.g, c.b);
        return mx < 1e-6 ? 0 : (mx - Math.min(c.r, c.g, c.b)) / mx;
      };
      const before = mats.map((m) => hue(m.color));
      presentationLight(rig, 1);
      mats.forEach((m, i) => {
        expect(hue(m.emissive), 'the lift washed a panel toward grey').toBeCloseTo(before[i], 4);
      });
      rig.dispose();
    });

    it(`${kind}: v = 1 lifts every panel and leaves the eyes and visors alone`, () => {
      const rig = createRobot(kind);
      const glow = new Set<THREE.Material>(rig.glow);
      const before = new Map<THREE.Material, number>();
      for (const s of shotOf(rig.root)) before.set(s.mat, s.emissive);
      presentationLight(rig, 1);
      let lifted = 0;
      for (const s of shotOf(rig.root)) {
        if (glow.has(s.mat) || (!s.mat.map && relLum(s.mat.color) < 1e-4)) {
          /*
           * Two kinds are left alone. A glow material is already emissive at up
           * to 1.8 intensity with tone mapping off, and lifting one is how a
           * robot ends up with two white holes in its face. And a material whose
           * own colour is black has nothing to expose — Voxxy's glass highlights
           * are `#000000` plus an emissive, and deliberately not in `rig.glow`.
           */
          expect(s.emissive).toBe(before.get(s.mat));
          continue;
        }
        expect(s.emissive).not.toBe(before.get(s.mat));
        lifted++;
      }
      expect(lifted).toBeGreaterThan(3);
      expect(glow.size).toBeGreaterThan(0);
      rig.dispose();
    });

    it(`${kind}: the lift keeps each panel's own hue rather than washing it grey`, () => {
      const rig = createRobot(kind);
      presentationLight(rig, 1);
      const glow = new Set<THREE.Material>(rig.glow);
      for (const s of shotOf(rig.root)) {
        if (glow.has(s.mat) || s.mat.map) continue;
        const c = s.mat.color;
        const e = s.mat.emissive;
        // Same channel ORDER as the panel it came from: a lift that reordered
        // the channels would be a different colour, whatever its luminance.
        const rank = (x: THREE.Color): string =>
          [
            ['r', x.r],
            ['g', x.g],
            ['b', x.b],
          ]
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .map((p) => p[0])
            .join('');
        if (Math.abs(c.r - c.g) > 0.01 || Math.abs(c.g - c.b) > 0.01) expect(rank(e)).toBe(rank(c));
      }
      rig.dispose();
    });

    it(`${kind}: is monotonic in v, so the opening's clock can ramp it`, () => {
      const rig = createRobot(kind);
      const glow = new Set<THREE.Material>(rig.glow);
      const read = (v: number): number[] => {
        presentationLight(rig, v);
        return shotOf(rig.root)
          .filter((s) => !glow.has(s.mat) && !(!s.mat.map && relLum(s.mat.color) < 1e-4))
          .map((s) => relLum(s.mat.emissive));
      };
      const a = read(0);
      const b = read(0.5);
      const c = read(1);
      for (let i = 0; i < a.length; i++) {
        expect(b[i]).toBeGreaterThan(a[i]);
        expect(c[i]).toBeGreaterThan(b[i]);
      }
      // Clamped at both ends: the clock can overshoot and nothing changes.
      expect(read(-3)).toEqual(a);
      expect(read(4)).toEqual(c);
      rig.dispose();
    });
  }

  it('adds no light of any kind to a rig', () => {
    for (const kind of KINDS) {
      const rig = createRobot(kind);
      presentationLight(rig, 1);
      const lights: string[] = [];
      rig.root.traverse((o) => {
        if ((o as THREE.Light).isLight) lights.push(o.name || o.type);
      });
      expect(lights).toEqual([]);
      rig.dispose();
    }
  });

  it('lifts a PAINTED panel through its own art, not through its base colour', () => {
    /*
     * Biggy's belly and dome carry all of their colour in a canvas texture and
     * sit on `color: '#ffffff'` whenever a canvas exists — so a lift on the
     * colour paints his whole gut flat white. This is the same rule
     * `src/render/crates.ts` follows on its painted faces: the lift goes through
     * the art's own map, so the orange glows orange and the worn-through grey
     * stays grey.
     *
     * Vitest runs in node with no canvas, so `biggy.ts` falls back to a flat
     * `#b26038` with no map and the mapped branch cannot be reached from here.
     * The rule is therefore asserted on a rig with a map forced onto it, which
     * is the same code path the browser takes.
     */
    const rig = createRobot('biggy');
    const painted = new Set<THREE.MeshStandardMaterial>();
    rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial || painted.size > 0 || rig.glow.includes(mat)) return;
      // Stand in for the belly paint: white base, all the colour in the map.
      mat.color.setRGB(1, 1, 1);
      mat.map = new THREE.Texture();
      painted.add(mat);
    });
    expect(painted.size).toBe(1);
    const [mat] = [...painted];
    const unmapped: THREE.MeshStandardMaterial[] = [];
    rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m?.isMeshStandardMaterial && !m.map && !rig.glow.includes(m) && !unmapped.includes(m)) unmapped.push(m);
    });
    presentationLight(rig, 1);
    // The map is what is lit...
    expect(mat.emissiveMap).toBe(mat.map);
    // ...by an exposure above 1, since the hue lives in the texture and the
    // texel is what carries it. A mapped panel is deliberately NOT capped at 1
    // the way an unmapped one is: capping it would drop the rig's own gain on
    // the one panel carrying Biggy's orange, and with no hue of its own there is
    // nothing for a cap to protect.
    //
    // Asserted against the gain the UNMAPPED panels got rather than against a
    // number, because the rig's gain depends on its own palette: forcing a white
    // base onto one panel raises the rig's mean and can take the gain to exactly
    // 1, at which point a bare `> 1` is testing the fixture instead of the code.
    const other = unmapped.find((m) => relLum(m.color) > 1e-3);
    expect(other, 'no unmapped panel left to compare against').toBeDefined();
    const shared = relLum(other!.emissive) / relLum(other!.color);
    expect(mat.emissive.r).toBeCloseTo(shared, 4);
    expect(mat.emissive.r).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(mat.emissive.r).toBeCloseTo(mat.emissive.g, 6);
    expect(mat.emissive.b).toBeCloseTo(mat.emissive.g, 6);
    presentationLight(rig, 0);
    expect(mat.emissive.getHex()).toBe(0x000000);
    rig.dispose();
  });
});

/* ========================================================================== */
/*  3. the camera's azimuth                                                   */
/* ========================================================================== */

const VIEW: ViewRect = { x: 40, y: 280, w: 200, h: 140 };

/** Everything about a camera that a framing can change. */
function camState(cam: THREE.OrthographicCamera): number[] {
  return [
    ...cam.position.toArray(),
    ...cam.quaternion.toArray(),
    ...cam.up.toArray(),
    cam.left,
    cam.right,
    cam.top,
    cam.bottom,
    ...cam.projectionMatrix.elements,
  ];
}

describe('the diorama camera azimuth', () => {
  it('starts on the play azimuth and says so', () => {
    const cam = createCamera(16 / 9);
    expect(cam.azimuth()).toBe(DIORAMA_AZIMUTH_RAD);
  });

  it('frames identically to a camera that has never heard of the override', () => {
    const untouched = createCamera(16 / 9);
    untouched.setChapter(1);
    untouched.frame(VIEW, 16 / 9, 'up');

    const cleared = createCamera(16 / 9);
    cleared.setChapter(1);
    // Explicitly clearing an override nobody set must be a no-op, so a caller
    // can end every shot with `setAzimuth()` and not have to know.
    cleared.setAzimuth();
    cleared.frame(VIEW, 16 / 9, 'up');
    expect(camState(cleared.cam)).toEqual(camState(untouched.cam));
  });

  it('gives the framing back, to the last bit, when the shot is over', () => {
    const cam = createCamera(16 / 9);
    cam.setChapter(1);
    cam.frame(VIEW, 16 / 9, 'up');
    const before = camState(cam.cam);

    cam.setAzimuth(OPENING_AZIMUTH_RAD);
    expect(cam.azimuth()).toBe(OPENING_AZIMUTH_RAD);
    expect(camState(cam.cam)).not.toEqual(before);

    cam.setAzimuth();
    expect(cam.azimuth()).toBe(DIORAMA_AZIMUTH_RAD);
    expect(camState(cam.cam)).toEqual(before);
  });

  it('re-frames the last rect at the new angle rather than waiting for the next frame()', () => {
    // The whole point: the transition out of the opening is a change of ANGLE on
    // a rect the camera already has, not a cut and a re-frame.
    const cam = createCamera(16 / 9);
    cam.setChapter(1);
    cam.frame(VIEW, 16 / 9, 'up');
    cam.setAzimuth(OPENING_AZIMUTH_RAD);
    const swung = camState(cam.cam);
    cam.frame(VIEW, 16 / 9, 'up');
    expect(camState(cam.cam)).toEqual(swung);
  });

  it('turns the diorama: at 90 deg the plan\'s +x runs into the screen', () => {
    const cam = createCamera(16 / 9);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.cam.quaternion);
    // On the play azimuth, screen-right is mostly the plan's +x — that is what
    // makes the rendered map read the same way round as the drawing.
    expect(right.x).toBeGreaterThan(0.9);
    cam.setAzimuth(Math.PI / 2);
    const swung = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.cam.quaternion);
    expect(Math.abs(swung.x)).toBeLessThan(1e-6);
    expect(swung.z).toBeCloseTo(-1, 6);
  });

  it('takes anything that is not a finite angle as "back to the play azimuth"', () => {
    const cam = createCamera(16 / 9);
    for (const bad of [Number.NaN, Infinity, -Infinity, undefined]) {
      cam.setAzimuth(OPENING_AZIMUTH_RAD);
      cam.setAzimuth(bad as number);
      expect(cam.azimuth()).toBe(DIORAMA_AZIMUTH_RAD);
    }
  });

  it('never moves the module-level sight-line vector with it', () => {
    /*
     * `dioramaToCameraAtDeg` is what the set is built against — the Zaal panels'
     * facing and occlusion, the keypad, the projector-bay ports, the seat and
     * clue checks — and four other test files assert against it at the play
     * azimuth. A shot borrowing an angle must not move any of that.
     */
    const cam = createCamera(16 / 9);
    const before = dioramaToCameraAtDeg(30).toArray();
    cam.setAzimuth(OPENING_AZIMUTH_RAD);
    expect(dioramaToCameraAtDeg(30).toArray()).toEqual(before);
    expect(before[0]).toBeCloseTo(Math.sin(DIORAMA_AZIMUTH_RAD) * Math.cos(Math.PI / 6), 12);
  });

  it('stages the opening at 68 deg, well off the play angle and short of square', () => {
    expect(OPENING_AZIMUTH_RAD).toBeCloseTo((68 * Math.PI) / 180, 12);
    // Far enough from the play azimuth that the transition reads as a swing...
    expect(OPENING_AZIMUTH_RAD - DIORAMA_AZIMUTH_RAD).toBeGreaterThan(Math.PI / 4);
    // ...and short of 90, where a row of crates is a flat elevation.
    expect(OPENING_AZIMUTH_RAD).toBeLessThan(Math.PI / 2 - 0.2);
  });
});
