/**
 * textures.ts — every surface texture of the 3D build, baked on the GPU at load.
 *
 * CLAUDE.md forbids external asset files, so nothing here is loaded: each
 * texture set is a fragment shader over a shared noise library, rendered once
 * into a mipmapped render target. A set is three maps that share one `surface()`
 * function so they can never drift apart:
 *
 *   - `map`    albedo, sRGB
 *   - `orm`    R = ambient occlusion, G = roughness, B = metalness (glTF layout,
 *              which is what three's `aoMap` / `roughnessMap` / `metalnessMap`
 *              channels already read)
 *   - `normal` tangent-space normal, from central differences of the height
 *
 * Baking on the GPU instead of in JS matters for load time: a 1024² fbm with six
 * octaves is ~6 M noise evaluations, a second of main-thread JS per map and
 * milliseconds as a shader.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------ noise library */

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
// Tileable value noise: 'per' is the lattice period, so a texture of 'per' cells wraps.
float vnoiseT(vec2 p, vec2 per){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  float a = hash12(mod(i, per)); float b = hash12(mod(i + vec2(1,0), per));
  float c = hash12(mod(i + vec2(0,1), per)); float d = hash12(mod(i + vec2(1,1), per));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbmT(vec2 p, vec2 per, int oct){
  float s = 0., a = .5, n = 0.;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a * vnoiseT(p, per); n += a; p *= 2.; per *= 2.; a *= .5; }
  return s / n;
}
// Tileable cellular noise: distance to nearest and second-nearest feature point.
vec2 cellT(vec2 p, vec2 per){
  vec2 i = floor(p); vec2 f = fract(p); float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(x, y); vec2 o = hash22(mod(i + g, per));
    float d = length(g + o - f);
    if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2);
}
// Id of the nearest cell, for per-chip colour.
float cellIdT(vec2 p, vec2 per){
  vec2 i = floor(p); vec2 f = fract(p); float d1 = 8.; float id = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(x, y); vec2 o = hash22(mod(i + g, per));
    float d = length(g + o - f);
    if (d < d1){ d1 = d; id = hash12(mod(i + g, per) + 7.3); }
  }
  return id;
}
// Scratches: thin random line segments in a tile grid.
float scratchesT(vec2 uv, float cells, float seed){
  float s = 0.;
  for (int k = 0; k < 3; k++){
    vec2 p = uv * cells + float(k) * 17.13 + seed;
    vec2 i = floor(p); vec2 f = fract(p);
    float h = hash12(mod(i, vec2(cells)) + float(k) * 3.7 + seed);
    if (h > .55){
      float ang = hash12(i + 1.7 + seed) * 3.14159;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 c = vec2(.5) + (hash22(i + 2.3) - .5) * .4;
      vec2 d = f - c; float along = dot(d, dir); float across = dot(d, vec2(-dir.y, dir.x));
      float len = .25 + .3 * hash12(i + 5.1);
      s = max(s, (1. - smoothstep(0., .012, abs(across))) * (1. - smoothstep(len * .7, len, abs(along))));
    }
  }
  return s;
}
`;

/* ------------------------------------------------------------------ baking */

export interface TextureSet {
  map: THREE.Texture;
  orm: THREE.Texture;
  normal: THREE.Texture;
}

/**
 * A surface is GLSL that defines
 *
 *   void surface(vec2 uv, out vec3 albedo, out float rough, out float metal, out float ao, out float height)
 *
 * over uv in [0,1), tileable. `height` is in "texels of bump" — the normal pass
 * scales it by `bump`.
 */
export interface SurfaceDef {
  glsl: string;
  size?: number;
  /** Normal strength. */
  bump?: number;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

function frag(body: string, mode: 0 | 1 | 2, bump: number): string {
  return /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 texel;
${NOISE_GLSL}
${body}
void main(){
  vec3 alb; float r, m, ao, h;
  surface(vUv, alb, r, m, ao, h);
  #if ${mode} == 0
    gl_FragColor = vec4(alb, 1.);
  #elif ${mode} == 1
    gl_FragColor = vec4(ao, r, m, 1.);
  #else
    vec3 a2; float r2, m2, ao2, hx, hy;
    surface(fract(vUv + vec2(texel.x, 0.)), a2, r2, m2, ao2, hx);
    surface(fract(vUv + vec2(0., texel.y)), a2, r2, m2, ao2, hy);
    vec3 n = normalize(vec3((h - hx) * ${bump.toFixed(3)}, (h - hy) * ${bump.toFixed(3)}, 1.));
    gl_FragColor = vec4(n * .5 + .5, 1.);
  #endif
}
`;
}

const quadGeo = new THREE.PlaneGeometry(2, 2);
const bakeScene = new THREE.Scene();
const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function bakeOne(renderer: THREE.WebGLRenderer, fs: string, size: number, srgb: boolean): THREE.Texture {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    depthBuffer: false,
  });
  // The shaders write LINEAR values. Tagged sRGB, the albedo target is allocated
  // SRGB8_ALPHA8: the hardware encodes on write and decodes on sampling, so the
  // round trip is linear-in, linear-out with sRGB's precision in the darks —
  // which is where every surface of a venue at night lives. Data maps stay RGBA8.
  rt.texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: fs,
    uniforms: { texel: { value: new THREE.Vector2(1 / size, 1 / size) } },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(quadGeo, mat);
  mesh.frustumCulled = false;
  bakeScene.add(mesh);
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(bakeScene, bakeCam);
  renderer.setRenderTarget(prevRT);
  bakeScene.remove(mesh);
  mat.dispose();
  return rt.texture;
}

export function bakeSurface(renderer: THREE.WebGLRenderer, def: SurfaceDef): TextureSet {
  const size = def.size ?? 1024;
  const bump = def.bump ?? 2;
  return {
    map: bakeOne(renderer, frag(def.glsl, 0, bump), size, true),
    orm: bakeOne(renderer, frag(def.glsl, 1, bump), size, false),
    normal: bakeOne(renderer, frag(def.glsl, 2, bump * size / 256), size, false),
  };
}

/** A single-channel-ish utility texture (lens dirt, hologram noise). */
export function bakeImage(renderer: THREE.WebGLRenderer, body: string, size = 512, srgb = false): THREE.Texture {
  const fs = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 texel;
${NOISE_GLSL}
${body}
void main(){ gl_FragColor = image(vUv); }
`;
  return bakeOne(renderer, fs, size, srgb);
}

/* ------------------------------------------------------------ the surfaces */

/**
 * Polished dark terrazzo — the closed section's corridor and foyer.
 *
 * We have no photograph of the closed section (the venue photos are all of the
 * Devoxx half, which is carpeted), so its floor is a choice: an older, harder
 * cinema floor that can carry reflections, which is where most of the
 * "night city" look of the reference comes from. Chips of white, grey and the
 * venue's orange in charcoal binder, 60 cm slabs with brass divider strips,
 * polished to a mirror in the walked lanes and dulled by grime at the edges.
 */
export const TERRAZZO: SurfaceDef = {
  size: 1024,
  bump: 1.2,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  vec2 per = vec2(64.);
  vec2 c = cellT(uv * 64., per);
  float id = cellIdT(uv * 64., per);
  float chip = smoothstep(.34, .22, c.x);
  vec2 c2 = cellT(uv * 160. + 3.1, vec2(160.));
  float fleck = smoothstep(.18, .08, c2.x) * step(.55, hash12(floor(uv*160.)));
  vec3 binder = vec3(.030, .032, .036);
  vec3 chipCol = id < .5 ? vec3(.30, .31, .32) : id < .75 ? vec3(.62, .62, .60) : id < .9 ? vec3(.08, .08, .09) : vec3(.55, .22, .06);
  alb = mix(binder, chipCol * .8, chip);
  alb = mix(alb, vec3(.8), fleck * .6);
  float cloud = fbmT(uv * 6., vec2(6.), 5);
  alb *= .75 + .5 * cloud;
  // Slab joints: 4x4 slabs per texture, brass strips.
  vec2 g = abs(fract(uv * 4.) - .5);
  float joint = smoothstep(.494, .498, max(g.x, g.y));
  alb = mix(alb, vec3(.35, .24, .09), joint);
  // Polish: glossy with broad dull patches (grime, old wax), plus scratches.
  float dull = smoothstep(.45, .75, fbmT(uv * 3. + 1.7, vec2(3.), 5));
  float scr = scratchesT(uv, 24., 1.);
  rough = .09 + .3 * dull + .25 * scr + .08 * chip;
  rough = mix(rough, .35, joint);
  metal = joint * .9;
  ao = 1. - .5 * joint;
  h = -joint * 1.5 + chip * .15 - scr * .3;
}
`,
};

/** Dark navy corridor carpet (CAPTIONS.md: "dark navy carpet"), for the cinemas. */
export const CARPET: SurfaceDef = {
  size: 512,
  bump: 3.5,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  float fib = vnoiseT(uv * 512., vec2(512.)) * .6 + vnoiseT(uv * 256. + 3., vec2(256.)) * .4;
  // A faint repeating Kinepolis-ish pattern: offset circles.
  vec2 p = fract(uv * 8.) - .5; vec2 q = fract(uv * 8. + .5) - .5;
  float ring = smoothstep(.02, .0, abs(length(p) - .32)) + smoothstep(.02, .0, abs(length(q) - .18));
  float wear = fbmT(uv * 4., vec2(4.), 4);
  alb = vec3(.020, .026, .060) * (.7 + .6 * fib) * (.85 + .3 * wear);
  alb += vec3(.03, .02, .06) * ring;
  rough = .92 + .06 * fib;
  metal = 0.;
  ao = .75 + .25 * fib;
  h = fib;
}
`,
};

/** Burgundy cinema carpet, for inside the auditoriums. */
export const CARPET_RED: SurfaceDef = {
  size: 512,
  bump: 3.5,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  float fib = vnoiseT(uv * 512., vec2(512.)) * .6 + vnoiseT(uv * 256. + 3., vec2(256.)) * .4;
  vec2 g = fract(uv * 16.) - .5;
  float dia = smoothstep(.03, .0, abs(abs(g.x) + abs(g.y) - .35));
  float wear = fbmT(uv * 4., vec2(4.), 4);
  alb = vec3(.10, .015, .02) * (.7 + .6 * fib) * (.8 + .4 * wear) + vec3(.05, .03, .0) * dia;
  rough = .93;
  metal = 0.;
  ao = .8 + .2 * fib;
  h = fib;
}
`,
};

/**
 * Charcoal plaster (CAPTIONS.md: "charcoal walls"), weathered: water stains,
 * drips running down, hand-height grime and a few scuffs from robot shoulders.
 */
export const PLASTER: SurfaceDef = {
  size: 1024,
  bump: 1.5,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  float n = fbmT(uv * 8., vec2(8.), 6);
  float fine = vnoiseT(uv * 300., vec2(300.));
  // Drips: vertical streaks, strongest near the top (uv.y = 1 at the top of a wall panel).
  float col = vnoiseT(vec2(uv.x * 90., 0.), vec2(90., 1.));
  float drip = smoothstep(.55, .9, col) * smoothstep(.2, 1., uv.y + fbmT(uv * vec2(20., 3.), vec2(20., 3.), 3) * .4);
  float stain = smoothstep(.55, .8, fbmT(uv * 3. + 5., vec2(3.), 5));
  alb = vec3(.085, .088, .095) * (.8 + .4 * n);
  alb *= 1. - .35 * drip - .3 * stain;
  alb = mix(alb, alb * vec3(1.1, .95, .8), stain);
  float scr = scratchesT(uv, 12., 4.);
  alb = mix(alb, vec3(.16), scr * .5);
  rough = .78 - .25 * drip + .1 * fine;
  metal = 0.;
  ao = 1.;
  h = n * .6 - scr * .5;
}
`,
};

/** Dark acoustic fabric panels, for the auditorium walls. */
export const ACOUSTIC: SurfaceDef = {
  size: 512,
  bump: 2.5,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  float weave = sin(uv.x * 3.14159 * 512.) * sin(uv.y * 3.14159 * 512.);
  vec2 g = abs(fract(uv * vec2(4., 2.)) - .5);
  float seam = smoothstep(.485, .495, max(g.x, g.y));
  float n = fbmT(uv * 6., vec2(6.), 4);
  alb = vec3(.035, .032, .045) * (.8 + .4 * n) * (1. - .6 * seam);
  rough = .95;
  metal = 0.;
  ao = 1. - .6 * seam;
  h = weave * .1 - seam * 2.;
}
`,
};

/** Brushed, scratched steel — fire door, kiosk frames, handrails, fittings. */
export const STEEL: SurfaceDef = {
  size: 512,
  bump: .8,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  float brush = vnoiseT(vec2(uv.x * 4., uv.y * 400.), vec2(4., 400.));
  float scr = scratchesT(uv, 10., 9.);
  float dirt = smoothstep(.5, .8, fbmT(uv * 4., vec2(4.), 5));
  alb = vec3(.55, .56, .58) * (.85 + .15 * brush) * (1. - .6 * dirt);
  rough = .28 + .15 * brush + .35 * dirt - .1 * scr;
  metal = 1. - .5 * dirt;
  ao = 1.;
  h = brush * .2 - scr * .6;
}
`,
};

/** Painted steel (fire door leaf): red-black enamel with chips down to bare metal. */
export const ENAMEL: SurfaceDef = {
  size: 512,
  bump: 1.2,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  float n = fbmT(uv * 10., vec2(10.), 5);
  float chip = smoothstep(.68, .72, fbmT(uv * 18. + 2., vec2(18.), 5));
  float scr = scratchesT(uv, 14., 3.);
  alb = mix(vec3(.18, .19, .20) * (.8 + .4 * n), vec3(.5, .5, .52), max(chip, scr * .8));
  rough = mix(.35 + .2 * n, .3, chip);
  metal = max(chip, scr);
  ao = 1.;
  h = -chip * .8 - scr * .4 + n * .1;
}
`,
};

/** Red velvet seat upholstery. */
export const VELVET: SurfaceDef = {
  size: 256,
  bump: 2,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  float pile = vnoiseT(uv * 256., vec2(256.));
  float crush = fbmT(uv * 5., vec2(5.), 4);
  alb = vec3(.23, .018, .03) * (.65 + .5 * crush) * (.9 + .2 * pile);
  rough = .7 + .2 * crush;
  metal = 0.;
  ao = 1.;
  h = pile * .3;
}
`,
};

/** Pale plaster for the vaulted corridor ceiling (CAPTIONS.md). */
export const CEILING: SurfaceDef = {
  size: 512,
  bump: 1,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  float n = fbmT(uv * 6., vec2(6.), 5);
  float stain = smoothstep(.6, .8, fbmT(uv * 2. + 9., vec2(2.), 5));
  alb = vec3(.42, .42, .43) * (.85 + .3 * n) * (1. - .45 * stain);
  rough = .9;
  metal = 0.;
  ao = 1.;
  h = n;
}
`,
};

/** Glossy white counter (the foyer bar: "long pale counter"). */
export const COUNTER: SurfaceDef = {
  size: 256,
  bump: .6,
  glsl: /* glsl */ `
void surface(vec2 uv, out vec3 alb, out float rough, out float metal, out float ao, out float h){
  float n = fbmT(uv * 4., vec2(4.), 4);
  float scr = scratchesT(uv, 8., 2.);
  alb = vec3(.72, .71, .69) * (.92 + .08 * n);
  rough = .12 + .15 * n + .3 * scr;
  metal = 0.;
  ao = 1.;
  h = -scr * .4;
}
`,
};

/** Lens dirt: smudges and specks the bloom lights up (composite pass). */
export const LENS_DIRT_GLSL = /* glsl */ `
vec4 image(vec2 uv){
  float s = 0.;
  for (int i = 0; i < 3; i++){
    vec2 c = cellT(uv * (5. + float(i) * 4.) + float(i) * 13.1, vec2(5. + float(i) * 4.));
    s += smoothstep(.25, .0, c.x) * (.35 + .4 * hash12(floor(uv * (5. + float(i) * 4.)) + float(i)));
  }
  float smear = smoothstep(.45, .85, fbmT(uv * 3., vec2(3.), 6));
  float v = clamp(s * .6 + smear * .5, 0., 1.);
  return vec4(vec3(v), 1.);
}
`;
