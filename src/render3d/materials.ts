/**
 * materials.ts — the 3D build's material library.
 *
 * Everything is `MeshPhysicalMaterial` over the GPU-baked texture sets in
 * `textures.ts`, rendered linear into an HDR target (no tone mapping here: the
 * pipeline's composite pass owns exposure and the curve).
 *
 * Two shader patches live here:
 *
 *  - `withReflection` adds the planar floor reflection to a material, weighted by
 *    Fresnel and by the material's own per-texel roughness, with the normal map
 *    wobbling the lookup so slab joints and scratches break the mirror up;
 *  - `withGrime` multiplies a world-space noise into the albedo and roughness so
 *    no two metres of wall look alike even though the textures tile.
 */

import * as THREE from 'three';

import type { PlanarReflection } from './reflector';
import {
  ACOUSTIC,
  CARPET,
  CARPET_RED,
  CEILING,
  COUNTER,
  ENAMEL,
  PLASTER,
  STEEL,
  TERRAZZO,
  VELVET,
  bakeSurface,
  type TextureSet,
} from './textures';

/* ----------------------------------------------------------- world-space UV */

const _n = new THREE.Vector3();

/**
 * Replace a geometry's UVs with world-metric ones: one texture repeat per
 * `tile` metres, projected along each vertex normal's dominant axis. `offset`
 * is where the geometry will sit in the world, so neighbouring boxes continue
 * the pattern instead of all starting at the same corner.
 */
export function worldUV(geo: THREE.BufferGeometry, tile: number, offset = new THREE.Vector3()): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x;
    const y = pos.getY(i) + offset.y;
    const z = pos.getZ(i) + offset.z;
    _n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    const ax = Math.abs(_n.x);
    const ay = Math.abs(_n.y);
    const az = Math.abs(_n.z);
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x;
      v = -z * Math.sign(_n.y || 1);
    } else if (ax >= az) {
      u = -z * Math.sign(_n.x);
      v = y;
    } else {
      u = x * Math.sign(_n.z);
      v = y;
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** A box whose UVs are world-metric. Centre at `at`. */
export function box(w: number, h: number, d: number, at: THREE.Vector3, tile = 2): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  worldUV(g, tile, at);
  g.translate(at.x, at.y, at.z);
  return g;
}

/* ------------------------------------------------------------ shader patches */

export const WORLD_NOISE_GLSL = /* glsl */ `
float wHash(vec3 p){ p = fract(p * .1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float wNoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(wHash(i), wHash(i+vec3(1,0,0)), f.x), mix(wHash(i+vec3(0,1,0)), wHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i+vec3(0,0,1)), wHash(i+vec3(1,0,1)), f.x), mix(wHash(i+vec3(0,1,1)), wHash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float wFbm(vec3 p){ return .5 * wNoise(p) + .25 * wNoise(p * 2.03) + .125 * wNoise(p * 4.01) + .0625 * wNoise(p * 8.07); }
`;

interface Patch {
  uniforms: Record<string, THREE.IUniform>;
  vertexHead: string;
  vertexBody: string;
  fragHead: string;
  /** After `roughnessFactor` is final (after roughnessmap_fragment). */
  fragRough: string;
  /** After `diffuseColor` is final (after color_fragment). */
  fragColor: string;
  /** Just before opaque_fragment: may add to `outgoingLight`. */
  fragOut: string;
}

const PATCHES = new WeakMap<THREE.Material, Patch[]>();

function patch(mat: THREE.MeshStandardMaterial, p: Partial<Patch>, key: string): void {
  const list = PATCHES.get(mat) ?? [];
  list.push({ uniforms: {}, vertexHead: '', vertexBody: '', fragHead: '', fragRough: '', fragColor: '', fragOut: '', ...p });
  PATCHES.set(mat, list);
  const all = list;
  mat.customProgramCacheKey = () => all.map((_, i) => `${key}${i}`).join('|') + all.length;
  mat.onBeforeCompile = (shader) => {
    for (const q of all) Object.assign(shader.uniforms, q.uniforms);
    const vh = all.map((q) => q.vertexHead).join('\n');
    const vb = all.map((q) => q.vertexBody).join('\n');
    const fh = all.map((q) => q.fragHead).join('\n');
    const fr = all.map((q) => q.fragRough).join('\n');
    const fc = all.map((q) => q.fragColor).join('\n');
    const fo = all.map((q) => q.fragOut).join('\n');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldP;\n${vh}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n${vb}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldP;\n${WORLD_NOISE_GLSL}\n${fh}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fc}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${fr}`)
      .replace('#include <opaque_fragment>', `${fo}\n#include <opaque_fragment>`);
  };
  mat.needsUpdate = true;
}

/**
 * World-space wear: large blotches darken and roughen, so a 50 m corridor made
 * of one tiling texture still reads as one continuous, used surface.
 */
export function withGrime(mat: THREE.MeshStandardMaterial, amount = 0.5, scale = 0.35): void {
  patch(
    mat,
    {
      uniforms: { grimeAmt: { value: amount }, grimeScale: { value: scale } },
      fragHead: 'uniform float grimeAmt; uniform float grimeScale;',
      fragColor: /* glsl */ `
        float gN = wFbm(vWorldP * grimeScale);
        float gBlot = smoothstep(.45, .8, gN);
        diffuseColor.rgb *= 1. - grimeAmt * (.45 * gBlot + .25 * (gN - .5));
      `,
      fragRough: /* glsl */ `
        roughnessFactor = clamp(roughnessFactor + grimeAmt * .35 * smoothstep(.45, .8, wFbm(vWorldP * grimeScale)), 0., 1.);
      `,
    },
    'grime',
  );
}

/**
 * Add the planar reflection. The weight is Schlick Fresnel for a dielectric
 * (F0 0.04) raised toward 1 by `boost`, times `(1 - roughness)²`; the rough
 * end reads the blurred copy. The env-map specular is switched off on these
 * materials so the floor does not reflect twice.
 */
export function withReflection(mat: THREE.MeshStandardMaterial, refl: PlanarReflection, strength = 1, distort = 0.04): void {
  mat.envMapIntensity = 0;
  patch(
    mat,
    {
      uniforms: {
        tRefl: { value: refl.rt.texture },
        tReflBlur: { value: refl.blurred },
        reflMatrix: { value: refl.textureMatrix },
        reflStrength: { value: strength },
        reflDistort: { value: distort },
      },
      fragHead: 'uniform sampler2D tRefl; uniform sampler2D tReflBlur; uniform mat4 reflMatrix; uniform float reflStrength; uniform float reflDistort;',
      fragOut: /* glsl */ `
        {
          vec4 rc = reflMatrix * vec4(vWorldP, 1.);
          vec2 ruv = rc.xy / rc.w;
          // The normal map's tilt, in world XZ, wobbles the lookup.
          vec3 wn = inverseTransformDirection(normal, viewMatrix);
          ruv += wn.xz * reflDistort;
          vec3 sharp = texture2D(tRefl, ruv).rgb;
          vec3 soft = texture2D(tReflBlur, ruv).rgb;
          float r = roughnessFactor;
          vec3 rcol = mix(sharp, soft, smoothstep(.02, .22, r));
          vec3 V = normalize(cameraPosition - vWorldP);
          float NoV = clamp(dot(wn, V), 0., 1.);
          float F = .04 + .96 * pow(1. - NoV, 5.);
          float w = reflStrength * mix(.18, 1., F) * pow(1. - clamp(r * 1.6, 0., 1.), 2.);
          // Fade at the screen edge of the reflection target, where it has no data.
          vec2 e = smoothstep(vec2(0.), vec2(.04), ruv) * smoothstep(vec2(0.), vec2(.04), 1. - ruv);
          outgoingLight += rcol * w * e.x * e.y * (1. - metalnessFactor * .3);
        }
      `,
    },
    'refl',
  );
}

/* ------------------------------------------------------------ the library */

export interface Materials {
  terrazzo: THREE.MeshPhysicalMaterial;
  carpet: THREE.MeshPhysicalMaterial;
  carpetRed: THREE.MeshPhysicalMaterial;
  plaster: THREE.MeshPhysicalMaterial;
  acoustic: THREE.MeshPhysicalMaterial;
  ceiling: THREE.MeshPhysicalMaterial;
  steel: THREE.MeshPhysicalMaterial;
  enamel: THREE.MeshPhysicalMaterial;
  velvet: THREE.MeshPhysicalMaterial;
  counter: THREE.MeshPhysicalMaterial;
  darkMetal: THREE.MeshPhysicalMaterial;
  blackGloss: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  screen: THREE.MeshPhysicalMaterial;
  rubber: THREE.MeshPhysicalMaterial;
  sets: Record<string, TextureSet>;
}

function fromSet(set: TextureSet, repeat = 1, extra: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  const maps = [set.map, set.orm, set.normal].map((t) => {
    const c = t.clone();
    c.repeat.set(repeat, repeat);
    c.needsUpdate = true;
    return c;
  });
  return new THREE.MeshPhysicalMaterial({
    map: maps[0],
    roughnessMap: maps[1],
    metalnessMap: maps[1],
    normalMap: maps[2],
    roughness: 1,
    metalness: 1,
    ...extra,
  });
}

export function createMaterials(renderer: THREE.WebGLRenderer): Materials {
  const sets = {
    terrazzo: bakeSurface(renderer, TERRAZZO),
    carpet: bakeSurface(renderer, CARPET),
    carpetRed: bakeSurface(renderer, CARPET_RED),
    plaster: bakeSurface(renderer, PLASTER),
    acoustic: bakeSurface(renderer, ACOUSTIC),
    ceiling: bakeSurface(renderer, CEILING),
    steel: bakeSurface(renderer, STEEL),
    enamel: bakeSurface(renderer, ENAMEL),
    velvet: bakeSurface(renderer, VELVET),
    counter: bakeSurface(renderer, COUNTER),
  };
  const m: Materials = {
    // One terrazzo texture repeat = 2.4 m (four 60 cm slabs), set by worldUV tile.
    terrazzo: fromSet(sets.terrazzo, 1, { normalScale: new THREE.Vector2(0.6, 0.6) }),
    carpet: fromSet(sets.carpet, 1),
    carpetRed: fromSet(sets.carpetRed, 1),
    plaster: fromSet(sets.plaster, 1, { normalScale: new THREE.Vector2(0.35, 0.35) }),
    acoustic: fromSet(sets.acoustic, 1),
    ceiling: fromSet(sets.ceiling, 1),
    steel: fromSet(sets.steel, 1),
    enamel: fromSet(sets.enamel, 1, { color: new THREE.Color(0.55, 0.06, 0.05), clearcoat: 0.4, clearcoatRoughness: 0.35 }),
    velvet: fromSet(sets.velvet, 1, { sheen: 1, sheenColor: new THREE.Color(0.8, 0.2, 0.25), sheenRoughness: 0.4 }),
    counter: fromSet(sets.counter, 1, { clearcoat: 1, clearcoatRoughness: 0.08 }),
    darkMetal: new THREE.MeshPhysicalMaterial({ color: 0x15171b, roughness: 0.35, metalness: 0.9 }),
    blackGloss: new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x9fb4c0,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      envMapIntensity: 0.7,
      side: THREE.DoubleSide,
    }),
    screen: new THREE.MeshPhysicalMaterial({ color: 0x6f7276, roughness: 0.18, metalness: 0.85 }),
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.85, metalness: 0 }),
    sets,
  };
  withGrime(m.plaster, 0.6, 0.3);
  withGrime(m.terrazzo, 0.45, 0.22);
  withGrime(m.carpet, 0.4, 0.5);
  withGrime(m.ceiling, 0.5, 0.25);
  return m;
}
