/**
 * lighting.ts — light, shadow and fog of war.
 *
 * The sim has already done the hard part: `src/sim/lights.ts` casts 48-72 rays
 * per lamp against the walls and hands the renderer an exact visibility polygon
 * per `LightSource` (`docs/lights-and-locks-rules.md`). Nothing in here re-casts
 * anything in three — it **extrudes the polygons the sim computed**, which is why
 * a shadow edge on screen is the same edge the clue logic tests against.
 *
 * What the layer draws, per frame:
 *
 *  1. one **additive floor pool** per `LightSource`, a triangle fan built from
 *     that light's polygon, bright at the lamp and falling off linearly to its
 *     range. Additive is the whole mechanic: orange + green + blue must be
 *     visibly different where they overlap, because that is how a clue reads.
 *  2. a **volumetric-ish wedge** over each pool — the same polygon lifted to the
 *     lamp and faded out toward the rim. A cone for Voxxy and Biggy, a soft dome
 *     for Droid's pool.
 *  3. three real `THREE.SpotLight`s, one per robot, so the robots and the
 *     geometry around them are actually lit and cast shadows. Three shadow
 *     casters, 512² maps, and in the daylight chapter the sun takes the budget
 *     instead.
 *  4. **fog of war**: a low-resolution darkness mask multiplied over the floor.
 *     Unexplored is near-black, explored stays dimly remembered, lit is clear —
 *     the prototype's exact numbers (0.95 / 0.8 darkness, 0.35 remembered).
 *  5. a per-chapter ambient base: chapter 1 near-black, chapter 2 a dark hall
 *     with emergency-exit greens, chapter 3 daylight through the entrance,
 *     chapter 4 a warm auditorium wash with the Room 8 stage lit.
 *
 * Buffers are allocated once and rewritten in place: no geometry, material or
 * texture is constructed inside `update()`. Nothing here holds or mutates game
 * state — it only reads a `GameSnapshot` (CLAUDE.md).
 */

import * as THREE from 'three';

import { DEFS, H, RAYS_CONE, RAYS_MIRROR, RAYS_POOL, W } from '../sim/constants';
import { CY0, CY1, GF, R } from '../sim/geometry';
import type { GameSnapshot, LightSource, RobotKind } from '../sim/types';
import { ROBOT_HEIGHT_M, STOREY_H_M, m } from '../sim/units';

/* ------------------------------------------------------------------ tuning */

const KINDS: readonly RobotKind[] = ['voxxy', 'droid', 'biggy'];

/** Fan capacity: the widest polygon the sim can hand us, plus its apex. */
const MAX_FAN_VERTS = 2 + Math.max(RAYS_CONE, RAYS_POOL, RAYS_MIRROR);
/** Three lamps plus their mirror bounces (three per lamp per mirror), with slack. */
const MAX_LIGHT_MESHES = 24;

/** Floor pools sit just above the floor plate; the wedge rim just above them. */
const FAN_Y = 0.035;
const VOL_RIM_Y = 0.07;
/** The wedge stops just short of the wall the polygon ends on, so it reads soft. */
const RIM_PULL = 0.94;

/**
 * Peak strength of a floor pool at the lamp — the prototype's radial-gradient
 * alphas (`rgba(...,.5)` primary, `.35` for a mirror bounce), kept for parity.
 */
const FAN_PRIMARY = 0.5;
const FAN_BOUNCE = 0.35;
/** The volumetric wedge is a haze, not a second lamp. */
const VOL_CONE = 0.17;
const VOL_POOL = 0.1;
/** How much of the apex value survives at the rim of the wedge. */
const VOL_RIM = 0.1;
/** A mirror bounce leaves the cinema screen at about chest height. */
const MIRROR_APEX_H = 1.6;

/** Where each robot's lamp sits, as a fraction of its modelled height. */
const LAMP_FRACTION: Readonly<Record<RobotKind, number>> = Object.freeze({
  /** Voxxy's headlamp is the visor band. */
  voxxy: 0.78,
  /** Droid's lamp is on top of the domed helmet. */
  droid: 0.93,
  /** Biggy's flood is the visor band under the dome rim. */
  biggy: 0.72,
});

/**
 * Spotlight intensities. Three's lights are physical (intensity / distance^decay),
 * so these are art-direction numbers rather than photometry: a softer-than-inverse-
 * square decay keeps the far end of a 24 m beam alive. Tune here, nowhere else.
 */
const LAMP_INTENSITY: Readonly<Record<RobotKind, number>> = Object.freeze({
  voxxy: 30,
  droid: 22,
  biggy: 34,
});
const LAMP_DECAY = 1.15;
/** Droid's lamp is a pool: a wide spot pointing straight down. */
const POOL_SPOT_ANGLE = 1.35;

/* --------------------------------------------------------------- fog of war */

/** One texel per 10 sim px (0.8 m). 190x70 over the 1900x700 map. */
const FOG_W = 190;
const FOG_H = 70;
const FOG_PX = W / FOG_W;
/** The mask is repainted every frame but uploaded at this rate. */
const FOG_UPLOAD_PERIOD = 1 / 20;
/** The prototype adds `rgba(255,255,255,.06)` per frame at 60 Hz. */
const EXPLORE_RATE = 0.06 * 60;
/** How fast the "lit right now" halo falls back to remembered. */
const HEAT_DECAY = 8;
/** The prototype's `destination-out` alpha for explored area. */
const REMEMBER = 0.35;
/** The prototype keeps a small halo around every robot, lamp or no lamp. */
const BOT_HALO_PX = 34;
const BOT_HALO_PEAK = 0.9;
const FOG_Y = 0.02;
/** Below this the mask is not worth drawing at all. */
const FOG_MIN = 0.01;

/* ---------------------------------------------------------- chapter moods */

interface Mood {
  /** Flat fill, so nothing is ever pure black. */
  ambient: number;
  /** Sky/ground fill, which gives walls and floors different values. */
  hemi: number;
  /** Multiplier on the robots' own spotlights. */
  lampGain: number;
  /** Multiplier on the additive floor pools and their wedges. */
  poolGain: number;
  /** Darkness of the fog mask, 0 = no mask. Prototype: 0.95 night, 0.8 dark hall. */
  fogBase: number;
  /** Daylight through the entrance. */
  sun: number;
  /** Emergency exit greens. */
  exits: number;
  /** Room 8's stage wash. */
  stage: number;
  /** House lights: the corridor and the auditorium. */
  house: number;
  /** Who spends the shadow budget: the robots' lamps, or the sun. */
  robotShadows: boolean;
  /** Ambient/hemisphere colours, sRGB hex. */
  ambientColor: number;
  skyColor: number;
  groundColor: number;
}

const MOODS: Readonly<Record<number, Mood>> = Object.freeze({
  /** 1 · Night. The power is out: the robots' lamps are the only light there is. */
  1: {
    ambient: 0.05,
    hemi: 0.07,
    lampGain: 1,
    poolGain: 1,
    fogBase: 0.95,
    sun: 0,
    exits: 0,
    stage: 0,
    house: 0,
    robotShadows: true,
    ambientColor: 0x0a0e1a,
    skyColor: 0x1a2438,
    groundColor: 0x05060a,
  },
  /** 2 · Expo. The dark empty hall of image-1790032600128: near-black, cold, exit greens. */
  2: {
    ambient: 0.07,
    hemi: 0.09,
    lampGain: 1,
    poolGain: 0.95,
    fogBase: 0.8,
    sun: 0,
    exits: 1,
    stage: 0,
    house: 0,
    robotShadows: true,
    ambientColor: 0x0b1018,
    skyColor: 0x16202e,
    groundColor: 0x07080c,
  },
  /** 3 · Lunch. Daylight floods in through the entrance glazing; the lamps barely read. */
  3: {
    ambient: 0.45,
    hemi: 0.75,
    lampGain: 0.35,
    poolGain: 0.3,
    fogBase: 0,
    sun: 1,
    exits: 0,
    stage: 0,
    house: 0,
    robotShadows: false,
    ambientColor: 0xb9c6d6,
    skyColor: 0xd9e7f6,
    groundColor: 0x6c6a66,
  },
  /** 4 · Keynote. Warm auditorium wash, the stage lit, the corridor still dim. */
  4: {
    ambient: 0.3,
    hemi: 0.28,
    lampGain: 0.7,
    poolGain: 0.55,
    fogBase: 0.25,
    sun: 0,
    exits: 0,
    stage: 1,
    house: 0.8,
    robotShadows: true,
    ambientColor: 0x2a2030,
    skyColor: 0x3d2f33,
    groundColor: 0x140f12,
  },
});

/** Before a chapter starts (`chapter` 0) nothing is on but a faint night wash. */
const MOOD_DEFAULT: Mood = { ...MOODS[1], fogBase: 0 };

/** Cutscenes lift the level out of the dark — the prototype drops the mask entirely. */
const CUT_AMBIENT_BOOST = 3.5;
/** Chapter and phase changes ease rather than pop. */
const MOOD_EASE = 3.2;

/* ------------------------------------------------------------------ helpers */

/** sRGB 0..1 -> linear 0..1. Vertex colours are consumed in the working space. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Exponential approach, frame-rate independent. */
function approach(cur: number, target: number, rate: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

/** A light's colour in linear space, cached: there are only ever three of them. */
const LINEAR_CACHE = new Map<number, [number, number, number]>();
function linearColor(c: readonly [number, number, number]): [number, number, number] {
  const key = (c[0] << 16) | (c[1] << 8) | c[2];
  let got = LINEAR_CACHE.get(key);
  if (!got) {
    got = [srgbToLinear(c[0] / 255), srgbToLinear(c[1] / 255), srgbToLinear(c[2] / 255)];
    LINEAR_CACHE.set(key, got);
  }
  return got;
}

/* ------------------------------------------------------------- the fog grid */

interface FogGrid {
  /** Permanent memory, 0..1, raised while a light covers the texel. */
  explored: Float32Array;
  /** "Lit right now", 0..1, decaying. */
  heat: Float32Array;
  data: Uint8Array;
  tex: THREE.DataTexture;
  dirty: boolean;
}

function makeFogGrid(): FogGrid {
  const n = FOG_W * FOG_H;
  const data = new Uint8Array(n * 4);
  const tex = new THREE.DataTexture(data, FOG_W, FOG_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  // A mask, not a picture: the values multiply the framebuffer as authored, so
  // they must not be treated as sRGB and converted on the way in.
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return { explored: new Float32Array(n), heat: new Float32Array(n), data, tex, dirty: true };
}

/** Scratch for the scanline fill. Single-threaded, so one copy is enough. */
const polyX = new Float64Array(MAX_FAN_VERTS);
const polyY = new Float64Array(MAX_FAN_VERTS);
const crossings = new Float64Array(MAX_FAN_VERTS + 4);

/**
 * Paint one visibility polygon into the fog grid.
 *
 * Even-odd scanline fill in texel space: cost is proportional to the texels the
 * light actually covers (a few hundred), not to the screen — which is what keeps
 * the mask affordable at 60 Hz. Explored memory accumulates at the prototype's
 * rate; `heat` takes the prototype's radial falloff from the lamp.
 */
function paintPoly(grid: FogGrid, light: LightSource, dt: number): void {
  const poly = light.poly;
  const n = Math.min(poly.length, MAX_FAN_VERTS);
  if (n < 3) return;

  let top = Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    polyX[i] = p.x / FOG_PX;
    polyY[i] = p.y / FOG_PX;
    if (polyY[i] < top) top = polyY[i];
    if (polyY[i] > bottom) bottom = polyY[i];
  }

  const row0 = Math.max(0, Math.floor(top));
  const row1 = Math.min(FOG_H - 1, Math.ceil(bottom));
  const gain = EXPLORE_RATE * dt;
  const range = Math.max(1, light.range);

  for (let row = row0; row <= row1; row++) {
    const yc = row + 0.5;
    let c = 0;
    for (let i = 0, j = n - 1; i < n && c < crossings.length; j = i++) {
      const ay = polyY[i];
      const by = polyY[j];
      if (ay > yc !== by > yc) {
        crossings[c++] = polyX[i] + ((yc - ay) / (by - ay)) * (polyX[j] - polyX[i]);
      }
    }
    if (c < 2) continue;
    // Insertion sort: `c` is 2 or 4 for every polygon the sim produces.
    for (let i = 1; i < c; i++) {
      const v = crossings[i];
      let j = i - 1;
      while (j >= 0 && crossings[j] > v) {
        crossings[j + 1] = crossings[j];
        j--;
      }
      crossings[j + 1] = v;
    }
    for (let k = 0; k + 1 < c; k += 2) {
      const from = Math.max(0, Math.ceil(crossings[k] - 0.5));
      const to = Math.min(FOG_W - 1, Math.floor(crossings[k + 1] - 0.5));
      if (to < from) continue;
      const wy = (row + 0.5) * FOG_PX - light.y;
      const base = row * FOG_W;
      for (let tx = from; tx <= to; tx++) {
        const idx = base + tx;
        const e = grid.explored[idx];
        if (e < 1) grid.explored[idx] = Math.min(1, e + gain);
        const wx = (tx + 0.5) * FOG_PX - light.x;
        const d = Math.sqrt(wx * wx + wy * wy);
        if (d < range) {
          const h = 1 - d / range;
          if (h > grid.heat[idx]) grid.heat[idx] = h;
        }
      }
    }
    grid.dirty = true;
  }
}

/** The small halo the prototype keeps around every unmounted robot. */
function paintHalo(grid: FogGrid, x: number, y: number, dt: number): void {
  const r = BOT_HALO_PX / FOG_PX;
  const cx = x / FOG_PX;
  const cy = y / FOG_PX;
  const row0 = Math.max(0, Math.floor(cy - r));
  const row1 = Math.min(FOG_H - 1, Math.ceil(cy + r));
  const col0 = Math.max(0, Math.floor(cx - r));
  const col1 = Math.min(FOG_W - 1, Math.ceil(cx + r));
  const gain = EXPLORE_RATE * dt;
  for (let row = row0; row <= row1; row++) {
    for (let tx = col0; tx <= col1; tx++) {
      const dx = tx + 0.5 - cx;
      const dy = row + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const idx = row * FOG_W + tx;
      const e = grid.explored[idx];
      if (e < 1) grid.explored[idx] = Math.min(1, e + gain);
      const h = BOT_HALO_PEAK * (1 - d / r);
      if (h > grid.heat[idx]) grid.heat[idx] = h;
      grid.dirty = true;
    }
  }
}

/* -------------------------------------------------------------- light meshes */

interface LightMesh {
  fan: THREE.Mesh;
  vol: THREE.Mesh;
  fanPos: THREE.BufferAttribute;
  fanCol: THREE.BufferAttribute;
  volPos: THREE.BufferAttribute;
  volCol: THREE.BufferAttribute;
  fanPosArr: Float32Array;
  fanColArr: Float32Array;
  volPosArr: Float32Array;
  volColArr: Float32Array;
}

/**
 * A fan geometry with room for the widest polygon the sim can produce. Vertex 0
 * is the apex (the lamp), 1..n-1 the polygon rim, and the index buffer is the
 * fan — written once, never rebuilt.
 */
function makeFanGeometry(): {
  geo: THREE.BufferGeometry;
  pos: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
} {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(MAX_FAN_VERTS * 3), 3);
  const col = new THREE.BufferAttribute(new Float32Array(MAX_FAN_VERTS * 3), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  col.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('color', col);
  const idx = new Uint16Array((MAX_FAN_VERTS - 2) * 3);
  for (let i = 1, k = 0; i < MAX_FAN_VERTS - 1; i++) {
    idx[k++] = 0;
    idx[k++] = i;
    idx[k++] = i + 1;
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  return { geo, pos, col };
}

/* ------------------------------------------------------------------- layer */

export interface LightLayer {
  /** Read one frame of sim state and light it. `dt` is seconds. */
  update(snap: GameSnapshot, dt: number): void;
  dispose(): void;
}

export function createLightLayer(scene: THREE.Scene): LightLayer {
  const group = new THREE.Group();
  group.name = 'light-layer';
  scene.add(group);

  /* ----------------------------------------------------- additive geometry */

  const fanMat = new THREE.MeshBasicMaterial({
    name: 'light/pool',
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const volMat = new THREE.MeshBasicMaterial({
    name: 'light/volume',
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const meshes: LightMesh[] = [];

  function growTo(count: number): void {
    while (meshes.length < count) {
      const f = makeFanGeometry();
      const v = makeFanGeometry();
      const fan = new THREE.Mesh(f.geo, fanMat);
      const vol = new THREE.Mesh(v.geo, volMat);
      fan.frustumCulled = false;
      vol.frustumCulled = false;
      fan.renderOrder = 12;
      vol.renderOrder = 13;
      fan.visible = false;
      vol.visible = false;
      group.add(fan, vol);
      meshes.push({
        fan,
        vol,
        fanPos: f.pos,
        fanCol: f.col,
        volPos: v.pos,
        volCol: v.col,
        fanPosArr: f.pos.array as Float32Array,
        fanColArr: f.col.array as Float32Array,
        volPosArr: v.pos.array as Float32Array,
        volColArr: v.col.array as Float32Array,
      });
    }
  }

  /* ----------------------------------------------------------- robot lamps */

  interface Lamp {
    spot: THREE.SpotLight;
    target: THREE.Object3D;
  }
  const lamps = new Map<RobotKind, Lamp>();
  for (const kind of KINDS) {
    const def = DEFS[kind].light;
    const c = linearColor(def.c);
    const spot = new THREE.SpotLight();
    spot.name = `lamp/${kind}`;
    spot.color.setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
    spot.angle = def.type === 'pool' ? POOL_SPOT_ANGLE : Math.min(def.ang ?? 0.5, 1.45);
    spot.penumbra = def.type === 'pool' ? 0.9 : 0.55;
    spot.decay = LAMP_DECAY;
    spot.distance = m(def.range) * (def.type === 'pool' ? 1.7 : 1.1);
    spot.intensity = 0;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.camera.near = 0.35;
    spot.shadow.camera.far = spot.distance + 2;
    spot.shadow.bias = -0.0012;
    spot.shadow.normalBias = 0.035;
    const target = new THREE.Object3D();
    target.name = `lamp/${kind}/target`;
    spot.target = target;
    group.add(spot, target);
    lamps.set(kind, { spot, target });
  }

  /* -------------------------------------------------------- chapter fixtures */

  const ambient = new THREE.AmbientLight(0x0a0e1a, 0);
  const hemi = new THREE.HemisphereLight(0x1a2438, 0x05060a, 0);
  group.add(ambient, hemi);

  /** Chapter 3: daylight through the entrance glazing, from the +x side. */
  const sun = new THREE.DirectionalLight(0xfff0dc, 0);
  const sunTarget = new THREE.Object3D();
  sun.target = sunTarget;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.updateProjectionMatrix();
  group.add(sun, sunTarget);
  /** Offset from the subject to the sun: over the entrance, late-morning height. */
  const SUN_OFFSET = new THREE.Vector3(24, 30, -11);

  /**
   * Chapter 2: the emergency exits. Positions come from the plan geometry — the
   * main entrance, two of the hall's scalloped openings and the technical-room
   * door — so they land on real doorways rather than on typed-in coordinates.
   */
  const exitPoints: Array<{ x: number; y: number }> = [
    { x: GF.entrance.x - 10, y: GF.entrance.y + GF.entrance.h / 2 },
    { x: GF.hall.x + GF.hall.w, y: (GF.openings[0][0] + GF.openings[0][1]) / 2 },
    { x: GF.hall.x + GF.hall.w, y: (GF.openings[2][0] + GF.openings[2][1]) / 2 },
    { x: GF.tech.x + GF.tech.w, y: GF.tech.y + 65 },
  ];
  const exits = exitPoints.map((p, i) => {
    const light = new THREE.PointLight(0x35d17a, 0, m(150), 1.2);
    light.name = `exit-green/${i}`;
    light.position.set(m(p.x), 0, m(p.y));
    group.add(light);
    return light;
  });

  /** Chapter 4: the Room 8 stage, and a thin wash of house light. */
  const room8 = R(8);
  const stageSim = { x: room8.x + room8.w / 2, y: room8.y + 18 };
  const stage = new THREE.SpotLight(0xffd9a0, 0, m(420), 0.85, 0.6, 1.1);
  stage.name = 'stage/room8';
  const stageTarget = new THREE.Object3D();
  stage.target = stageTarget;
  group.add(stage, stageTarget);

  const housePoints: Array<{ x: number; y: number }> = [
    { x: 760, y: (CY0 + CY1) / 2 },
    { x: 1150, y: (CY0 + CY1) / 2 },
    { x: 1540, y: (CY0 + CY1) / 2 },
    { x: room8.x + room8.w / 2, y: room8.y + room8.h - 60 },
  ];
  const house = housePoints.map((p, i) => {
    const light = new THREE.PointLight(0xffc98a, 0, m(340), 1.15);
    light.name = `house/${i}`;
    light.position.set(m(p.x), 0, m(p.y));
    group.add(light);
    return light;
  });

  /* ---------------------------------------------------------------- fog mask */

  const grids: Record<'up' | 'down', FogGrid> = { up: makeFogGrid(), down: makeFogGrid() };
  const fogMat = new THREE.MeshBasicMaterial({
    name: 'light/fog-of-war',
    map: grids.up.tex,
    transparent: true,
    blending: THREE.MultiplyBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const fogGeo = new THREE.PlaneGeometry(m(W), m(H));
  const fogPlane = new THREE.Mesh(fogGeo, fogMat);
  fogPlane.name = 'fog-of-war';
  // +90° about x puts texel row 0 at sim y = 0 and u = 0 at sim x = 0, i.e. the
  // mask is laid out exactly like the plan. The plane then faces down, hence
  // DoubleSide above.
  fogPlane.rotation.x = Math.PI / 2;
  fogPlane.position.set(m(W / 2), FOG_Y, m(H / 2));
  fogPlane.frustumCulled = false;
  fogPlane.renderOrder = 10;
  fogPlane.visible = false;
  group.add(fogPlane);

  let fogClock = 0;
  let composedBase = -1;

  function composeFog(grid: FogGrid, base: number): void {
    const { explored, heat, data } = grid;
    const n = FOG_W * FOG_H;
    for (let i = 0; i < n; i++) {
      // The prototype, in one line: black at `base`, then punched back out by the
      // explored memory (0.35 of it) and fully by whatever is lit right now.
      const alpha = base * (1 - REMEMBER * explored[i]) * (1 - heat[i]);
      const v = (1 - alpha) * 255;
      const o = i * 4;
      // Darkness keeps a cold cast: the venue at night is blue, never grey.
      data[o] = v * 0.92;
      data[o + 1] = v * 0.96;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
    grid.tex.needsUpdate = true;
    grid.dirty = false;
    composedBase = base;
  }

  function clearFog(): void {
    for (const key of ['up', 'down'] as const) {
      const g = grids[key];
      g.explored.fill(0);
      g.heat.fill(0);
      g.dirty = true;
    }
    composedBase = -1;
  }

  /* ---------------------------------------------------------------- state */

  /**
   * `cur` holds the eased scalars; its colour and boolean fields are unused
   * copies that `target` owns. Everything starts dark, so the first chapter
   * fades up instead of snapping on.
   */
  const cur: Mood = {
    ...MOOD_DEFAULT,
    ambient: 0,
    hemi: 0,
    lampGain: 0,
    poolGain: 0,
    fogBase: 0,
    sun: 0,
    exits: 0,
    stage: 0,
    house: 0,
  };
  let target: Mood = MOOD_DEFAULT;
  let chapter = -1;
  let cutNow = false;
  let floorKey: 'up' | 'down' = 'up';
  const scratch = new THREE.Vector3();

  function applyChapter(n: number, cut: boolean): void {
    const mood = MOODS[n] ?? MOOD_DEFAULT;
    target = cut
      ? {
          ...mood,
          // A cutscene shows the route, so the level has to be legible: the
          // prototype simply drops the darkness mask for the duration.
          ambient: mood.ambient * CUT_AMBIENT_BOOST,
          hemi: mood.hemi * CUT_AMBIENT_BOOST,
          fogBase: 0,
        }
      : mood;
    ambient.color.setHex(mood.ambientColor);
    hemi.color.setHex(mood.skyColor);
    hemi.groundColor.setHex(mood.groundColor);
    for (const kind of KINDS) {
      const lamp = lamps.get(kind);
      if (lamp) lamp.spot.castShadow = mood.robotShadows;
    }
    sun.castShadow = !mood.robotShadows && mood.sun > 0;
  }

  function setFloor(key: 'up' | 'down'): void {
    floorKey = key;
    fogMat.map = grids[key].tex;
    fogMat.needsUpdate = true;
    composedBase = -1;
  }

  function update(snap: GameSnapshot, dt: number): void {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    const floorY = snap.floor === 'down' ? -STOREY_H_M : 0;

    // Chapter changes and entering/leaving a cutscene both re-pick the mood.
    const cut = snap.phase === 'cut';
    if (snap.chapter !== chapter) {
      // A new chapter is a new unexplored map.
      if (chapter >= 0) clearFog();
      chapter = snap.chapter;
      cutNow = cut;
      applyChapter(chapter, cut);
    } else if (cut !== cutNow) {
      cutNow = cut;
      applyChapter(chapter, cut);
    }
    if (snap.floor !== floorKey) setFloor(snap.floor);

    // Ease every scalar so a chapter or cutscene boundary is a dissolve, not a cut.
    cur.ambient = approach(cur.ambient, target.ambient, MOOD_EASE, step);
    cur.hemi = approach(cur.hemi, target.hemi, MOOD_EASE, step);
    cur.lampGain = approach(cur.lampGain, target.lampGain, MOOD_EASE, step);
    cur.poolGain = approach(cur.poolGain, target.poolGain, MOOD_EASE, step);
    cur.fogBase = approach(cur.fogBase, target.fogBase, MOOD_EASE, step);
    cur.sun = approach(cur.sun, target.sun, MOOD_EASE, step);
    cur.exits = approach(cur.exits, target.exits, MOOD_EASE, step);
    cur.stage = approach(cur.stage, target.stage, MOOD_EASE, step);
    cur.house = approach(cur.house, target.house, MOOD_EASE, step);

    ambient.intensity = cur.ambient;
    ambient.visible = cur.ambient > 0.002;
    hemi.intensity = cur.hemi;
    hemi.visible = cur.hemi > 0.002;

    /* ------------------------------------------------------- robot lamps */

    const droid = snap.bots.find((b) => b.kind === 'droid');
    const mounted = droid?.mounted === true;
    for (const kind of KINDS) {
      const lamp = lamps.get(kind);
      if (!lamp) continue;
      const src = snap.lights.find((l) => l.primary && l.owner === kind);
      if (!src) {
        lamp.spot.visible = false;
        continue;
      }
      const h = lampHeight(kind, mounted);
      lamp.spot.position.set(m(src.x), floorY + h, m(src.y));
      if (src.type === 'pool') {
        lamp.target.position.set(m(src.x), floorY, m(src.y));
      } else {
        const reach = m(src.range) * 0.7;
        lamp.target.position.set(
          m(src.x) + Math.cos(src.face) * reach,
          floorY + 0.15,
          m(src.y) + Math.sin(src.face) * reach,
        );
      }
      lamp.target.updateMatrixWorld();
      lamp.spot.intensity = LAMP_INTENSITY[kind] * cur.lampGain;
      lamp.spot.visible = lamp.spot.intensity > 0.05;
    }

    /* ------------------------------------------------- chapter fixtures */

    // The exit signs are exhibition-level doorways and the house fittings are
    // cinema-level ones: a fixture never follows the camera to the other storey.
    const onGround = snap.floor === 'down';
    for (const e of exits) {
      e.position.y = floorY + 2.2;
      e.intensity = onGround ? 2.6 * cur.exits : 0;
      e.visible = e.intensity > 0.01;
    }
    for (const hl of house) {
      hl.position.y = floorY + 3.1;
      hl.intensity = onGround ? 0 : 9 * cur.house;
      hl.visible = hl.intensity > 0.02;
    }
    stage.position.set(m(stageSim.x), floorY + 6.2, m(stageSim.y) + 2.2);
    stageTarget.position.set(m(stageSim.x), floorY + 0.6, m(stageSim.y));
    stageTarget.updateMatrixWorld();
    stage.intensity = onGround ? 0 : 220 * cur.stage;
    stage.visible = stage.intensity > 0.05;

    if (cur.sun > 0.01) {
      // Keep the sun's shadow camera over the robots: an 18 m box on a 1024 map
      // is a 3.5 cm texel, which is what makes a robot's shadow read as its own.
      const lead = snap.bots[snap.active] ?? snap.bots[0];
      if (lead) scratch.set(m(lead.x), floorY, m(lead.y));
      else scratch.set(m(W / 2), floorY, m(H / 2));
      sunTarget.position.copy(scratch);
      sunTarget.updateMatrixWorld();
      sun.position.copy(scratch).add(SUN_OFFSET);
      sun.intensity = 2.6 * cur.sun;
      sun.visible = true;
    } else {
      sun.visible = false;
    }

    /* ----------------------------------------------- additive light meshes */

    const count = Math.min(snap.lights.length, MAX_LIGHT_MESHES);
    growTo(count);
    for (let i = 0; i < count; i++) {
      writeLightMesh(meshes[i], snap.lights[i], floorY, cur.poolGain, mounted);
    }
    for (let i = count; i < meshes.length; i++) {
      meshes[i].fan.visible = false;
      meshes[i].vol.visible = false;
    }

    /* ------------------------------------------------------------ fog mask */

    const grid = grids[floorKey];
    if (target.fogBase > 0 && step > 0) {
      // Decay the "lit now" layer everywhere first, then repaint: what the lights
      // cover this frame is then exactly what the mask shows. 13 300 texels is
      // nothing, and it avoids remembering which ones a light touched last frame.
      const k = Math.exp(-HEAT_DECAY * step);
      const heat = grid.heat;
      for (let i = 0; i < heat.length; i++) {
        if (heat[i] > 0) {
          const v = heat[i] * k;
          heat[i] = v < 0.004 ? 0 : v;
          grid.dirty = true;
        }
      }
      for (const light of snap.lights) paintPoly(grid, light, step);
      for (const b of snap.bots) {
        if (!b.mounted) paintHalo(grid, b.x, b.y, step);
      }
    }

    fogClock += step;
    const showFog = cur.fogBase > FOG_MIN;
    if (showFog && (fogClock >= FOG_UPLOAD_PERIOD || composedBase < 0)) {
      if (grid.dirty || Math.abs(cur.fogBase - composedBase) > 0.004) composeFog(grid, cur.fogBase);
      fogClock = 0;
    }
    fogPlane.position.y = floorY + FOG_Y;
    fogPlane.visible = showFog;
  }

  /** Where a lamp sits above its storey's floor, mounting included. */
  function lampHeight(kind: RobotKind, mountedDroid: boolean): number {
    if (kind === 'droid' && mountedDroid) {
      return ROBOT_HEIGHT_M.biggy + ROBOT_HEIGHT_M.droid * LAMP_FRACTION.droid;
    }
    return ROBOT_HEIGHT_M[kind] * LAMP_FRACTION[kind];
  }

  /**
   * Rewrite one light's floor pool and its volumetric wedge from the sim's
   * polygon. Both buffers were allocated at full size once; only their contents
   * and the draw range change.
   */
  function writeLightMesh(
    mesh: LightMesh,
    light: LightSource,
    floorY: number,
    gain: number,
    mountedDroid: boolean,
  ): void {
    const poly = light.poly;
    const n = Math.min(poly.length, MAX_FAN_VERTS);
    if (n < 3 || gain <= 0.004) {
      mesh.fan.visible = false;
      mesh.vol.visible = false;
      return;
    }

    const [cr, cg, cb] = linearColor(light.c);
    const peak = (light.primary ? FAN_PRIMARY : FAN_BOUNCE) * gain;
    const volPeak = (light.type === 'cone' ? VOL_CONE : VOL_POOL) * (light.primary ? 1 : 0.6) * gain;
    const apexY = floorY + (light.primary ? lampHeight(light.owner, mountedDroid) : MIRROR_APEX_H);
    const range = Math.max(1, light.range);
    const sx = m(light.x);
    const sz = m(light.y);

    const fp = mesh.fanPosArr;
    const fc = mesh.fanColArr;
    const vp = mesh.volPosArr;
    const vc = mesh.volColArr;

    // Vertex 0: the lamp itself — the pool's hot spot and the wedge's apex.
    fp[0] = sx;
    fp[1] = floorY + FAN_Y;
    fp[2] = sz;
    fc[0] = cr * peak;
    fc[1] = cg * peak;
    fc[2] = cb * peak;
    vp[0] = sx;
    vp[1] = apexY;
    vp[2] = sz;
    vc[0] = cr * volPeak;
    vc[1] = cg * volPeak;
    vc[2] = cb * volPeak;

    for (let i = 1; i < n; i++) {
      const p = poly[i];
      const o = i * 3;
      const px = m(p.x);
      const pz = m(p.y);
      fp[o] = px;
      fp[o + 1] = floorY + FAN_Y;
      fp[o + 2] = pz;
      // Linear falloff to the lamp's range — the prototype's radial gradient.
      const d = Math.hypot(p.x - light.x, p.y - light.y);
      const s = peak * Math.max(0, 1 - d / range);
      fc[o] = cr * s;
      fc[o + 1] = cg * s;
      fc[o + 2] = cb * s;

      // The wedge stops just short of the occluder, and is nearly black there.
      vp[o] = sx + (px - sx) * RIM_PULL;
      vp[o + 1] = floorY + VOL_RIM_Y;
      vp[o + 2] = sz + (pz - sz) * RIM_PULL;
      const vs = volPeak * VOL_RIM * Math.max(0, 1 - d / range);
      vc[o] = cr * vs;
      vc[o + 1] = cg * vs;
      vc[o + 2] = cb * vs;
    }

    mesh.fanPos.needsUpdate = true;
    mesh.fanCol.needsUpdate = true;
    mesh.volPos.needsUpdate = true;
    mesh.volCol.needsUpdate = true;
    mesh.fan.geometry.setDrawRange(0, (n - 2) * 3);
    mesh.vol.geometry.setDrawRange(0, (n - 2) * 3);
    mesh.fan.visible = peak > 0.004;
    mesh.vol.visible = volPeak > 0.004;
  }

  function dispose(): void {
    for (const mesh of meshes) {
      mesh.fan.geometry.dispose();
      mesh.vol.geometry.dispose();
    }
    meshes.length = 0;
    for (const kind of KINDS) {
      const lamp = lamps.get(kind);
      if (lamp) lamp.spot.shadow.dispose();
    }
    lamps.clear();
    sun.shadow.dispose();
    stage.shadow.dispose();
    fanMat.dispose();
    volMat.dispose();
    fogMat.dispose();
    fogGeo.dispose();
    grids.up.tex.dispose();
    grids.down.tex.dispose();
    group.removeFromParent();
    group.clear();
  }

  // Start blacked out: the first `update()` eases up into the chapter's mood.
  clearFog();
  applyChapter(0, false);

  return { update, dispose };
}
