/**
 * Light — visibility polygons, ported verbatim in behaviour from the prototype
 * `reference/poc/10-after-dark-kinepolis.html` (`rayRect`, `castPoly`,
 * `pointInPoly`, `buildLights`, `litBy`).
 *
 * The rules, from `docs/lights-and-locks-rules.md`:
 *  - every lamp is a fan of rays cast against the walls, so shadows are real;
 *  - solid walls occlude, `glass` and `low` walls block robots but pass light;
 *  - a pool lamp covers the full circle, a cone lamp points where its robot moved;
 *  - the cinema screen is a mirror: a lit point on it becomes a secondary source.
 *
 * Colours are additive in the renderer; the sim only ever answers the boolean
 * question "is this point inside that colour's polygon", which is what a clue needs.
 */

import { MIRROR_ANG, MIRROR_MIN_RANGE, MIRROR_SAMPLES, MOUNT_POOL_SCALE, RAYS_CONE, RAYS_MIRROR, RAYS_POOL } from './constants';
import type { Bot, Clue, LightSource, Mirror, Rect, RobotKind, Vec2, Wall } from './types';
import { dist } from './bot';

/**
 * A reflection point must be comfortably inside the source's reach, not clinging to
 * the last pixel of it, or the bounce flickers as the robot walks.
 */
const MIRROR_EDGE_MARGIN = 10;
/**
 * How far a robot's own colour spills around its feet, sim px.
 *
 * Sized against the robots themselves rather than picked by eye: 24 px is 1.9 m,
 * a little over Biggy's own width and about three times Voxxy's. Close enough to
 * read as "the light this thing gives off just by being here", far enough that
 * standing next to a clue is standing ON it.
 */
export const SKIRT_RANGE = 24;

/**
 * Rays in the skirt's visibility polygon.
 *
 * A quarter of `RAYS_POOL`, and not for tidiness: the first cut cast a full
 * 72-ray fan per robot per frame on top of every existing lamp, which timed out
 * two chapter tests outright. It would have cost the same on a judge's laptop.
 *
 * 18 is enough because the skirt is 24 px: at that radius the gap between rays
 * is under 9 px, so a wall cannot hide inside one. It still has to be cast at
 * all — a robot pressed against a wall would otherwise spill its colour into the
 * room on the other side, and in chapter 1 that room is where the clues are.
 */
export const SKIRT_RAYS = 18;

/** The sample is tested this far off the mirror's reflective face, to stay off the wall line. */
const MIRROR_PROBE = 3;
/** The secondary source is seated this far off the face, so its own fan is not clipped by it. */
const MIRROR_OFFSET = 4;

/**
 * Ray vs axis-aligned rectangle (slab test). Returns the distance along
 * `(dx, dy)` — which must be a unit vector — or Infinity if the ray misses.
 * A ray that starts inside the rectangle returns 0.
 */
export function rayRect(px: number, py: number, dx: number, dy: number, r: Rect): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  const slabs: Array<[number, number, number, number]> = [
    [px, dx, r.x, r.x + r.w],
    [py, dy, r.y, r.y + r.h],
  ];
  for (const [p, d, lo, hi] of slabs) {
    if (Math.abs(d) < 1e-9) {
      // Parallel to this slab: either always inside it, or never.
      if (p < lo || p > hi) return Infinity;
    } else {
      let t1 = (lo - p) / d;
      let t2 = (hi - p) / d;
      if (t1 > t2) {
        const s = t1;
        t1 = t2;
        t2 = s;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmax < 0 ? Infinity : tmin > 0 ? tmin : 0;
}

/**
 * The visibility polygon of a fan of `n + 1` rays from `(px, py)` spanning
 * `a0..a1`, clipped to `range` and to the first occluder along each ray.
 *
 * Glass and low walls are filtered out here: that single line is the whole
 * "glass passes light" rule.
 */
export function castPoly(
  px: number,
  py: number,
  a0: number,
  a1: number,
  range: number,
  walls: Wall[],
  n: number,
): Vec2[] {
  const pts: Vec2[] = [];
  /*
   * Occluders, culled to the lamp's own reach.
   *
   * `!w.glass && !w.low` is the whole "glass passes light" rule and has been here
   * since the port. The range test is new, and `docs/playtest-notes.md` called it
   * before it was needed: `buildLights` is lights x rays x walls, it had already
   * gone 0.9 -> 2.63 ms per cast over two rounds of additions, and the note says
   * *"if a third change lands on that path it is worth range-culling walls inside
   * buildLights before adding to it"*. The third change is the collider sweep —
   * seat blocks, corridor columns, booth totems, the entrance frames — which
   * roughly doubles the wall list on both floors.
   *
   * It cannot change a single polygon: every ray is clipped at `range` to begin
   * with, and a rect entirely outside the square of half-width `range` about the
   * lamp is entirely further away than `range` in the max norm, so further than
   * `range` in Euclid too.
   */
  const occl = walls.filter(
    (w) =>
      !w.glass &&
      !w.low &&
      px + range > w.x &&
      px - range < w.x + w.w &&
      py + range > w.y &&
      py - range < w.y + w.h,
  );
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let t = range;
    for (const w of occl) {
      const tt = rayRect(px, py, dx, dy, w);
      if (tt < t) t = tt;
    }
    pts.push({ x: px + dx * t, y: py + dy * t });
  }
  return pts;
}

/** Even-odd ray-crossing test. */
export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/**
 * Every light in the scene for this frame: one primary source per robot, plus the
 * secondary cones its light throws off any mirror it happens to be pointing at.
 *
 * A mounted Droid's lamp rides Biggy's position and widens by `MOUNT_POOL_SCALE` —
 * the lamp is simply higher up.
 */
export function buildLights(bots: Bot[], walls: Wall[], mirrors: Mirror[]): LightSource[] {
  const lights: LightSource[] = [];
  for (const b of bots) {
    const L = b.light;
    let sx = b.x;
    let sy = b.y;
    if (b.mounted) {
      const carrier = bots.find((o) => o.kind === 'biggy');
      if (carrier) {
        sx = carrier.x;
        sy = carrier.y;
      }
    }
    const range = L.range * (b.mounted ? MOUNT_POOL_SCALE : 1);
    // Cone lamps always carry a half-angle in DEFS; 0 would be a degenerate lamp.
    const ang = L.ang ?? 0;
    const src: LightSource =
      L.type === 'pool'
        ? {
            x: sx,
            y: sy,
            face: b.face,
            c: L.c,
            type: 'pool',
            ang: L.ang,
            range,
            owner: b.kind,
            primary: true,
            poly: [{ x: sx, y: sy }, ...castPoly(sx, sy, 0, Math.PI * 2, range, walls, RAYS_POOL)],
            full: true,
          }
        : {
            x: sx,
            y: sy,
            face: b.face,
            c: L.c,
            type: 'cone',
            ang: L.ang,
            range,
            owner: b.kind,
            primary: true,
            poly: [
              { x: sx, y: sy },
              ...castPoly(sx, sy, b.face - ang, b.face + ang, range, walls, RAYS_CONE),
            ],
          };
    lights.push(src);

    /*
     * A small pool of the robot's own colour, right around its feet.
     *
     * Michele, playing chapter 1: *"Sometime it's hard to light up the clues,
     * even if the robots are next. What if we spread a bit of light around the
     * character so it's simpler?"* He is describing a real unfairness. Voxxy and
     * Biggy both carry CONES, so a robot standing on a clue is not lighting it —
     * its lamp is pointed past it — and the player is left nudging a heading by
     * degrees to satisfy something they are already standing on.
     *
     * Every lamp therefore has a skirt: isotropic, short, and in the same colour.
     * It does not weaken the puzzle, because it only reaches about a robot's own
     * length — you still have to bring the RIGHT robots to the RIGHT spot, which
     * is the whole mechanic. What it removes is the aiming pixel-hunt once they
     * are there.
     *
     * Not applied to a mounted robot: Droid on Biggy's shoulders is a metre and a
     * half up, and a skirt at his feet would be lighting the inside of Biggy.
     */
    if (!b.mounted) {
      const skirt = SKIRT_RANGE;
      lights.push({
        x: sx,
        y: sy,
        face: b.face,
        c: L.c,
        type: 'pool',
        range: skirt,
        owner: b.kind,
        // `primary` separates what a ROBOT emits from what a MIRROR re-emits —
        // `lights.filter(l => !l.primary)` is how the bounce tests find bounces.
        // The skirt comes off the robot, so it is primary; marking it otherwise
        // made every robot look like it was bouncing off a screen that was not
        // there.
        primary: true,
        /*
         * Labelled, so the renderer can tell a spill at a robot's own feet from a
         * beam thrown across a room. Nothing in this file branches on it and
         * nothing in the clue rule can see it: the polygon below is the same
         * polygon it always was.
         *
         * It is needed because the skirt was drawn exactly like every other lamp
         * — a full-strength additive floor pool AND a volumetric wedge whose apex
         * is the robot's own lamp. At a 24 px range that wedge is a tent pitched
         * over the robot's own body, and the pool's hot centre lands on the patch
         * of floor the robot is standing on, which is where a solved clue writes
         * its digit. Measured on the build Michele played: the digit's contrast
         * against the floor inside its own ring fell from 65 to 16 of 255, and
         * the share of clipped pixels around two robots went 6.4% -> 28.4%.
         */
        skirt: true,
        poly: [{ x: sx, y: sy }, ...castPoly(sx, sy, 0, Math.PI * 2, skirt, walls, SKIRT_RAYS)],
        full: true,
      });
    }

    // The cinema screen bounces light: sample the segment, keep the points this
    // source actually reaches, and re-emit from the nearest, the median and the
    // farthest of them — enough spread to read as a reflection, cheap enough to
    // rebuild every frame.
    for (const m of mirrors) {
      const cands: Array<{ s: Vec2; d: number }> = [];
      for (let k = 0; k <= MIRROR_SAMPLES; k++) {
        const s: Vec2 = { x: m.x0 + ((m.x1 - m.x0) * k) / MIRROR_SAMPLES, y: m.y };
        const d = dist(src, s);
        if (d < src.range - MIRROR_EDGE_MARGIN && pointInPoly({ x: s.x, y: s.y + m.ny * MIRROR_PROBE }, src.poly)) {
          cands.push({ s, d });
        }
      }
      if (!cands.length) continue;
      cands.sort((p, q) => p.d - q.d);
      const centre = cands[Math.floor(cands.length / 2)];
      for (const cnd of [cands[0], centre, cands[cands.length - 1]]) {
        if (!cnd) continue;
        const s = cnd.s;
        const dx = s.x - src.x;
        const dy = s.y - src.y;
        // Reflection about a horizontal mirror: keep dx, flip dy.
        const rd = Math.atan2(-dy, dx);
        const mx = s.x;
        const my = s.y + m.ny * MIRROR_OFFSET;
        const mrange = Math.max(MIRROR_MIN_RANGE, src.range - cnd.d);
        lights.push({
          x: mx,
          y: my,
          face: rd,
          c: src.c,
          type: 'cone',
          ang: MIRROR_ANG,
          range: mrange,
          owner: src.owner,
          primary: false,
          poly: [
            { x: mx, y: my },
            ...castPoly(mx, my, rd - MIRROR_ANG, rd + MIRROR_ANG, mrange, walls, RAYS_MIRROR),
          ],
        });
      }
    }
  }
  return lights;
}

/** Is `p` reached by any of `kind`'s lights — its own lamp or one of its bounces? */
export const litBy = (lights: LightSource[], kind: RobotKind, p: Vec2): boolean =>
  lights.some((L) => L.owner === kind && pointInPoly(p, L.poly) && dist(L, p) < L.range);

/**
 * How big a clue is, sim px. A clue is a scuffed patch of floor, not a point.
 *
 * It used to be tested as a single coordinate, which made the hardest clue in
 * chapter 1 a needle: a pose sweep found Biggy could light the cinema-E alcove
 * from 36 of ~106,000 position-and-facing combinations, against 1008 and 595 for
 * the other two clues that need him. That one is lit by a MIRROR BOUNCE off the
 * cinema screen — he cannot fit down the aisle — and a bounce has a narrow
 * geometric window that no amount of spill around his feet widens. Michele found
 * it the only way you can: "I had trouble solving the last room... needed
 * different tries before finding the number."
 *
 * 5 px is 0.4 m, smaller than any robot. It does not make a clue findable from
 * somewhere you would not think to stand; it stops a solution failing because
 * the beam's edge fell a handspan short of a mathematical point.
 *
 * The default, and the 2.5D build's. A build can pass its own through
 * `GameOptions.clueSpot`: the 3D build uses 10 px (0.8 m) — Michele, playing it,
 * "I would be more generous with the light / hint match" — because aiming a lamp
 * from behind the robot, with the floor foreshortened, is harder than from above.
 * In 2.5D, 5 "works well" (Michele, 25 Sep), so the two stay different.
 */
export const CLUE_SPOT = 5;

/** The centre and four cardinal points of a clue's patch. */
const clueSamples = (c: Vec2, spot: number): Vec2[] => [
  c,
  { x: c.x + spot, y: c.y },
  { x: c.x - spot, y: c.y },
  { x: c.x, y: c.y + spot },
  { x: c.x, y: c.y - spot },
];

/**
 * A clue reveals its digit only while *every* colour it needs reaches it at the
 * same time — the whole point of the mechanic: one robot can never solve one alone.
 *
 * "Reaches it" means reaches its patch, not its centre — see `CLUE_SPOT`. Every
 * colour must still reach; the disc makes each one fair, not optional.
 */
/**
 * Does ONE colour reach a clue's patch?
 *
 * Exported because anything asking "can this robot light that clue" — the
 * chapter, a test, a reachability probe — has to ask it the same way `clueLit`
 * does. The first probe of this asked `litBy(lights, kind, clue)` against the
 * clue's centre point and so measured the behaviour that had just been replaced,
 * reporting no change from a change that had landed.
 */
export const clueLitBy = (lights: LightSource[], kind: RobotKind, clue: Vec2, spot = CLUE_SPOT): boolean =>
  clueSamples(clue, spot).some((s) => litBy(lights, kind, s));

export const clueLit = (lights: LightSource[], clue: Clue, spot = CLUE_SPOT): boolean =>
  clue.need.every((k) => clueLitBy(lights, k, clue, spot));
