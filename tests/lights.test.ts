/**
 * Light acceptance tests — the rules in `docs/lights-and-locks-rules.md`, as numbers.
 *
 * The sim only ever answers "does this colour reach this point", which is what a
 * clue and the fog-of-war need; everything about how it *looks* belongs to
 * `src/render`. So these tests are about shadows, glass, the pool's full circle,
 * the mirror bounce and the all-colours-at-once rule.
 */

import { describe, expect, it } from 'vitest';

import { mkBot } from '../src/sim/bot';
import { DEFS, MIRROR_ANG, MOUNT_POOL_SCALE, RAYS_POOL, T } from '../src/sim/constants';
import { buildLights, castPoly, clueLit, litBy, pointInPoly, rayRect } from '../src/sim/lights';
import type { Bot, Clue, LightSource, Mirror, Vec2, Wall } from '../src/sim/types';

/** A robot standing still, looking along `face`. */
function lamp(kind: Bot['kind'], x: number, y: number, face = 0): Bot {
  const b = mkBot(kind, x, y);
  b.face = face;
  return b;
}

const NO_WALLS: Wall[] = [];
const NO_MIRRORS: Mirror[] = [];

describe('shadows', () => {
  const beyond: Vec2 = { x: 250, y: 100 };
  const slab = (extra: Partial<Wall>): Wall[] => [{ x: 200, y: 0, w: T, h: 200, ...extra }];

  it('a solid wall casts a shadow', () => {
    const lights = buildLights([lamp('voxxy', 100, 100)], slab({}), NO_MIRRORS);
    expect(litBy(lights, 'voxxy', beyond)).toBe(false);
    // ...and the near side of the same wall is lit.
    expect(litBy(lights, 'voxxy', { x: 180, y: 100 })).toBe(true);
  });

  it('a glass wall blocks robots but passes light', () => {
    const lights = buildLights([lamp('voxxy', 100, 100)], slab({ glass: true }), NO_MIRRORS);
    expect(litBy(lights, 'voxxy', beyond)).toBe(true);
  });

  it('a low wall — seat rows, tables, desks — passes light too', () => {
    const lights = buildLights([lamp('voxxy', 100, 100)], slab({ low: true }), NO_MIRRORS);
    expect(litBy(lights, 'voxxy', beyond)).toBe(true);
  });

  it('castPoly stops at the first occluder and ignores the see-through ones', () => {
    const solid = castPoly(100, 100, 0, 0, 280, slab({}), 1);
    expect(solid[0].x).toBeCloseTo(200, 6); // stopped at the near face

    const glass = castPoly(100, 100, 0, 0, 280, slab({ glass: true }), 1);
    expect(glass[0].x).toBeCloseTo(380, 6); // ran the full range
  });

  it('rayRect: hit, miss, parallel and inside', () => {
    const r = { x: 200, y: 0, w: T, h: 200 };
    expect(rayRect(100, 100, 1, 0, r)).toBeCloseTo(100, 6);
    expect(rayRect(100, 100, -1, 0, r)).toBe(Infinity); // pointing away
    expect(rayRect(100, 300, 1, 0, r)).toBe(Infinity); // passes under it
    expect(rayRect(100, 100, 0, 1, r)).toBe(Infinity); // parallel, outside the slab
    expect(rayRect(202, 100, 1, 0, r)).toBe(0); // starting inside
  });

  it('a robot in a sealed room lights the room and nothing outside it', () => {
    const walls: Wall[] = [
      { x: 100 - T, y: 100 - T, w: T, h: 200 + 2 * T },
      { x: 300, y: 100 - T, w: T, h: 200 + 2 * T },
      { x: 100, y: 100 - T, w: 200, h: T },
      { x: 100, y: 300, w: 200, h: T },
    ];
    const lights = buildLights([lamp('droid', 200, 200)], walls, NO_MIRRORS);
    expect(litBy(lights, 'droid', { x: 240, y: 200 })).toBe(true);
    expect(litBy(lights, 'droid', { x: 320, y: 200 })).toBe(false);
    expect(litBy(lights, 'droid', { x: 200, y: 330 })).toBe(false);
  });
});

describe('the lamps themselves', () => {
  it('a pool light is a full circle', () => {
    const lights = buildLights([lamp('droid', 400, 400)], NO_WALLS, NO_MIRRORS);
    expect(lights).toHaveLength(1);
    const pool = lights[0];
    expect(pool.type).toBe('pool');
    expect(pool.full).toBe(true);
    expect(pool.poly).toHaveLength(RAYS_POOL + 2); // centre + the closed fan
    const range = DEFS.droid.light.range;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const inside = { x: 400 + Math.cos(a) * range * 0.8, y: 400 + Math.sin(a) * range * 0.8 };
      const outside = { x: 400 + Math.cos(a) * range * 1.2, y: 400 + Math.sin(a) * range * 1.2 };
      expect(litBy(lights, 'droid', inside)).toBe(true);
      expect(litBy(lights, 'droid', outside)).toBe(false);
    }
  });

  it('a cone points where its robot last moved, and is dark behind', () => {
    const lights = buildLights([lamp('voxxy', 400, 400, Math.PI / 2)], NO_WALLS, NO_MIRRORS);
    expect(lights[0].type).toBe('cone');
    expect(litBy(lights, 'voxxy', { x: 400, y: 560 })).toBe(true); // ahead
    expect(litBy(lights, 'voxxy', { x: 400, y: 240 })).toBe(false); // behind
    expect(litBy(lights, 'voxxy', { x: 560, y: 400 })).toBe(false); // off to the side
  });

  it("Biggy's flood is wider and longer than Voxxy's beam", () => {
    const off = { x: 400 + Math.cos(0.8) * 260, y: 400 + Math.sin(0.8) * 260 };
    const far = { x: 400 + 290, y: 400 };
    const voxxy = buildLights([lamp('voxxy', 400, 400)], NO_WALLS, NO_MIRRORS);
    const biggy = buildLights([lamp('biggy', 400, 400)], NO_WALLS, NO_MIRRORS);
    expect(litBy(voxxy, 'voxxy', off)).toBe(false);
    expect(litBy(biggy, 'biggy', off)).toBe(true);
    expect(litBy(voxxy, 'voxxy', far)).toBe(false);
    expect(litBy(biggy, 'biggy', far)).toBe(true);
  });

  it('a mounted Droid rides on Biggy and his pool widens x1.6', () => {
    const droid = lamp('droid', 40, 40);
    const biggy = lamp('biggy', 600, 300);
    droid.mounted = true;
    const lights = buildLights([droid, biggy], NO_WALLS, NO_MIRRORS);
    const pool = lights.find((l) => l.owner === 'droid') as LightSource;
    expect(pool.x).toBe(600);
    expect(pool.y).toBe(300);
    expect(pool.range).toBeCloseTo(DEFS.droid.light.range * MOUNT_POOL_SCALE, 6);
    // The extra height is what reaches the clue the dismounted Droid cannot.
    const edge = { x: 600 + DEFS.droid.light.range * 1.3, y: 300 };
    expect(litBy(lights, 'droid', edge)).toBe(true);
    droid.mounted = false;
    droid.x = 600;
    droid.y = 300;
    expect(litBy(buildLights([droid, biggy], NO_WALLS, NO_MIRRORS), 'droid', edge)).toBe(false);
  });
});

describe('the cinema screen is a mirror', () => {
  const screen: Mirror[] = [{ x0: 100, x1: 300, y: 300, ny: -1 }];

  it('a robot shining at the screen makes at least one secondary source', () => {
    const lights = buildLights([lamp('voxxy', 200, 200, Math.PI / 2)], NO_WALLS, screen);
    const bounces = lights.filter((l) => !l.primary);
    expect(bounces.length).toBeGreaterThanOrEqual(1);
    for (const b of bounces) {
      expect(b.owner).toBe('voxxy');
      expect(b.type).toBe('cone');
      expect(b.ang).toBe(MIRROR_ANG);
      expect(b.c).toEqual(DEFS.voxxy.light.c); // the bounce keeps its colour
      expect(b.y).toBe(296); // seated just off the reflective face
      expect(Math.sin(b.face)).toBeLessThan(0); // thrown back up the room
    }
  });

  it('a robot facing away from the screen makes none', () => {
    const lights = buildLights([lamp('voxxy', 200, 200, -Math.PI / 2)], NO_WALLS, screen);
    expect(lights.filter((l) => !l.primary)).toHaveLength(0);
  });

  it('the bounce lights a corner the direct beam cannot reach', () => {
    const corner = { x: 150, y: 250 };
    const bot = lamp('voxxy', 200, 200, Math.PI / 2);
    expect(litBy(buildLights([bot], NO_WALLS, NO_MIRRORS), 'voxxy', corner)).toBe(false);
    expect(litBy(buildLights([bot], NO_WALLS, screen), 'voxxy', corner)).toBe(true);
  });

  it('a bounce never out-reaches its source and never dies below the floor', () => {
    const lights = buildLights([lamp('voxxy', 200, 200, Math.PI / 2)], NO_WALLS, screen);
    const src = lights[0];
    for (const b of lights.filter((l) => !l.primary)) {
      expect(b.range).toBeLessThanOrEqual(src.range);
      expect(b.range).toBeGreaterThanOrEqual(90);
    }
  });
});

describe('clues need every colour at once', () => {
  const clue = (need: Clue['need']): Clue => ({ x: 400, y: 400, need, digit: 7, slot: 1, found: false, label: 'test' });

  it('one colour short is no clue at all', () => {
    const voxxy = lamp('voxxy', 400, 300, Math.PI / 2); // beam down onto the clue
    const droid = lamp('droid', 420, 420); // pool over the clue
    const far = lamp('droid', 1200, 600); // ...and the same robot, elsewhere

    const both = buildLights([voxxy, droid], NO_WALLS, NO_MIRRORS);
    const onlyOrange = buildLights([voxxy, far], NO_WALLS, NO_MIRRORS);

    expect(clueLit(both, clue(['voxxy', 'droid']))).toBe(true);
    expect(clueLit(onlyOrange, clue(['voxxy', 'droid']))).toBe(false);
    // The orange half is still there — it is the *mix* that is missing.
    expect(litBy(onlyOrange, 'voxxy', { x: 400, y: 400 })).toBe(true);
    expect(litBy(onlyOrange, 'droid', { x: 400, y: 400 })).toBe(false);
  });

  it('a three-colour clue needs all three robots', () => {
    const voxxy = lamp('voxxy', 400, 300, Math.PI / 2);
    const droid = lamp('droid', 420, 420);
    const biggy = lamp('biggy', 300, 400, 0);
    const all = clue(['voxxy', 'droid', 'biggy']);
    expect(clueLit(buildLights([voxxy, droid], NO_WALLS, NO_MIRRORS), all)).toBe(false);
    expect(clueLit(buildLights([voxxy, biggy], NO_WALLS, NO_MIRRORS), all)).toBe(false);
    expect(clueLit(buildLights([droid, biggy], NO_WALLS, NO_MIRRORS), all)).toBe(false);
    expect(clueLit(buildLights([voxxy, droid, biggy], NO_WALLS, NO_MIRRORS), all)).toBe(true);
  });

  it('a wall between a robot and the clue breaks the mix', () => {
    const voxxy = lamp('voxxy', 400, 300, Math.PI / 2);
    const droid = lamp('droid', 420, 420);
    const blind: Wall[] = [{ x: 340, y: 360, w: 120, h: T }];
    expect(clueLit(buildLights([voxxy, droid], blind, NO_MIRRORS), clue(['voxxy', 'droid']))).toBe(false);
  });
});

describe('pointInPoly', () => {
  const square: Vec2[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('inside, outside and well away', () => {
    expect(pointInPoly({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPoly({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPoly({ x: -1, y: -1 }, square)).toBe(false);
  });
});
