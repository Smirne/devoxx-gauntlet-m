/**
 * The #DEVOXX letters, drawn — one extruded glyph per letter, shared by the 2.5D
 * diorama (`scene.ts`) and the 3D build (`src/render3d/keynote3d.ts`).
 *
 * No font file and no asset (CLAUDE.md): every glyph is a few straight edges and
 * elliptical arcs in a `THREE.Shape`, cut after the letters standing on Room 8's
 * stage in `media/venue-photos/54836008506_68c9fc5562_k.jpg` — a heavy geometric
 * sans, the hash leaning forward, the O a fat ring, the last X Devoxx orange.
 *
 * The sizes are the sim's (`src/sim/letters.ts`): the glyph is cut to the
 * footprint that stands on the letter's collider, so the picture and the physics
 * cannot disagree about where a letter is. Where it stands, which way it faces and
 * whose hands it is in are all the sim's; this file only knows what a D looks like.
 */

import * as THREE from 'three';

import { LETTER_D, LETTER_H_M, LETTER_W, SIGN_ORANGE } from '../sim/letters';
import { m } from '../sim/units';

/**
 * How high the letter in Droid's hands rides: its bottom edge, metres off the floor.
 *
 * Clear of the carpet and of the robot band (`tests/colliders.test.ts` counts
 * anything under 0.6 m as standing in the way), and low enough that its top, at
 * 1.72 m, is still under the eyes of a 2.1 m Droid — who is the one of the three
 * that can see over it, which is the whole reason it is his job.
 */
export const LETTER_HELD_LIFT_M = 0.62;

/** Painted white, a little warm under the house lights. */
export const LETTER_WHITE = 0xf1efe9;
/** Devoxx orange — the brand orange the 3D build's registration signs already use. */
export const LETTER_ORANGE = 0xf7931e;

/** The colour of the letter in slot `slot`. */
export const letterColor = (slot: number): number => (slot === SIGN_ORANGE ? LETTER_ORANGE : LETTER_WHITE);

/**
 * How far a letter leaning on a wall is tipped back into it, radians (about 4 degrees).
 * Its footprint stands 8 cm off the wall, and 4 degrees over 1.1 m puts its top edge
 * on the wall rather than through it.
 */
export const LEAN_RAD = 0.07;

const W = m(LETTER_W);
const H = LETTER_H_M;
/** The bevel eats into the depth from both faces, so the cut depth is the rest. */
const BEVEL_T = 0.014;
const BEVEL_S = 0.01;
const DEPTH = m(LETTER_D) - 2 * BEVEL_T;
/** Stroke weight of the bold letters, metres. */
const T = 0.2;

type Pt = readonly [number, number];

/** A closed straight-edged outline; the caller lists it counter-clockwise. */
function poly(pts: readonly Pt[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

function holePoly(pts: readonly Pt[]): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

/**
 * The outline of one glyph, in metres: x across 0..W, y up 0..H.
 *
 * Outer contours counter-clockwise, holes clockwise, which is what
 * `ExtrudeGeometry` expects of a shape that is not going to be second-guessed.
 */
function glyph(ch: string): THREE.Shape {
  switch (ch) {
    case 'E': {
      const mid = H / 2;
      return poly([
        [0, 0],
        [W, 0],
        [W, T],
        [T, T],
        [T, mid - T / 2],
        [W * 0.86, mid - T / 2],
        [W * 0.86, mid + T / 2],
        [T, mid + T / 2],
        [T, H - T],
        [W, H - T],
        [W, H],
        [0, H],
      ]);
    }
    case 'D': {
      // A stem and a half-ellipse bowl, the counter an ellipse inset by one stroke.
      const cx = W * 0.4;
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(cx, 0);
      s.absellipse(cx, H / 2, W - cx, H / 2, -Math.PI / 2, Math.PI / 2, false, 0);
      s.lineTo(0, H);
      s.closePath();
      const hole = new THREE.Path();
      hole.moveTo(T, T);
      hole.lineTo(T, H - T);
      hole.lineTo(cx, H - T);
      hole.absellipse(cx, H / 2, W - cx - T, H / 2 - T, Math.PI / 2, -Math.PI / 2, true, 0);
      hole.closePath();
      s.holes.push(hole);
      return s;
    }
    case 'O': {
      const s = new THREE.Shape();
      s.absellipse(W / 2, H / 2, W / 2, H / 2, 0, Math.PI * 2, false, 0);
      const hole = new THREE.Path();
      hole.absellipse(W / 2, H / 2, W / 2 - T * 1.05, H / 2 - T, 0, Math.PI * 2, true, 0);
      s.holes.push(hole);
      return s;
    }
    case 'V': {
      // The inner edges run parallel to the outer ones, so both arms are one weight.
      const foot = 0.15;
      const top = 0.25;
      const slope = H / (W / 2 - foot);
      const yIn = H - slope * (W / 2 - top);
      return poly([
        [W / 2 - foot, 0],
        [W / 2 + foot, 0],
        [W, H],
        [W - top, H],
        [W / 2, yIn],
        [top, H],
        [0, H],
      ]);
    }
    case 'X': {
      // Two bars crossing. The crotches are where their inner edges meet.
      const end = 0.25;
      const yLow = (H * (W / 2 - end)) / (W - end);
      const xL = (W - end) / 2;
      return poly([
        [0, 0],
        [end, 0],
        [W / 2, yLow],
        [W - end, 0],
        [W, 0],
        [W - xL, H / 2],
        [W, H],
        [W - end, H],
        [W / 2, H - yLow],
        [end, H],
        [0, H],
        [xL, H / 2],
      ]);
    }
    case '#': {
      // Four bars as one outline with the middle square cut out, then sheared so
      // the uprights lean forward the way a hashtag's do.
      const t = 0.17;
      const a1 = 0.14;
      const a2 = a1 + t;
      const b2 = W - 0.14;
      const b1 = b2 - t;
      const c1 = H * 0.3;
      const c2 = c1 + t;
      const d2 = H * 0.72;
      const d1 = d2 - t;
      const lean = 0.16;
      const sh = ([x, y]: Pt): Pt => [x + (y - H / 2) * lean * 0.5, y];
      const s = poly(
        (
          [
            [a1, 0],
            [a2, 0],
            [a2, c1],
            [b1, c1],
            [b1, 0],
            [b2, 0],
            [b2, c1],
            [W, c1],
            [W, c2],
            [b2, c2],
            [b2, d1],
            [W, d1],
            [W, d2],
            [b2, d2],
            [b2, H],
            [b1, H],
            [b1, d2],
            [a2, d2],
            [a2, H],
            [a1, H],
            [a1, d2],
            [0, d2],
            [0, d1],
            [a1, d1],
            [a1, c2],
            [0, c2],
            [0, c1],
            [a1, c1],
          ] as Pt[]
        ).map(sh),
      );
      s.holes.push(holePoly(([[a2, c2], [a2, d1], [b1, d1], [b1, c2]] as Pt[]).map(sh)));
      return s;
    }
    default:
      return poly([
        [0, 0],
        [W, 0],
        [W, H],
        [0, H],
      ]);
  }
}

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * The glyph as a solid: `W` wide and centred on x, standing on y = 0, `LETTER_D`
 * deep and centred on z, its FRONT — the side that reads — facing +z.
 *
 * So a letter is placed at the middle of its footprint on the floor and turned
 * with `yawFromSimHeading(face)`, exactly like a robot. Built once per glyph and
 * shared by every letter that uses it (both X's are one geometry).
 */
export function letterGeometry(ch: string): THREE.BufferGeometry {
  const hit = cache.get(ch);
  if (hit) return hit;
  const g = new THREE.ExtrudeGeometry(glyph(ch), {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL_T,
    bevelSize: BEVEL_S,
    bevelSegments: 2,
    curveSegments: 24,
  });
  // x centred, sitting on the floor, the extrusion (and both bevels) centred on z.
  g.translate(-W / 2, BEVEL_S, -DEPTH / 2);
  g.computeVertexNormals();
  cache.set(ch, g);
  return g;
}
