/**
 * shaders.ts — the full-screen passes of the HDR pipeline (`pipeline.ts`).
 *
 * Every pass here reads and writes LINEAR HDR until `COMPOSITE`, which is the
 * only place exposure, the tone curve, the grade and the sRGB encode happen.
 */

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

/* =============================================================== volumetrics
 *
 * Single-scattering raymarch through a height fog, lit by every spot light in
 * the scene through ITS OWN SHADOW MAP — so a robot's lamp throws a beam you can
 * see, the beam stops at the wall the sim says it stops at, and the seat backs,
 * the columns and the other robots cut shafts out of it. Unshadowed point lights
 * (neon, signage) add a soft halo of haze around themselves.
 *
 * Integration is Hillaire's energy-conserving form (SIGGRAPH 2015): per step,
 * in-scatter S over a segment of extinction e contributes S * (1 - exp(-e dt)) / e.
 * Steps are jittered per pixel with interleaved gradient noise and per frame by
 * a golden-ratio sequence; `VOL_RESOLVE` accumulates the frames.
 */
export const MAX_SPOTS = 12;
export const MAX_SHADOWED = 4;
export const MAX_POINTS = 16;

export const VOL_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DShadow;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform mat4 projInv;
uniform mat4 viewInv;
uniform vec3 camPos;
uniform float time;
uniform float frameJitter;
uniform float density;
uniform float heightFalloff;
uniform float fogBase;
uniform float noiseAmt;
uniform float maxDist;
uniform float anisotropy;
uniform vec3 ambient;
uniform vec3 boxMin;
uniform vec3 boxMax;

uniform int nSpots;
uniform vec3 spotPos[${MAX_SPOTS}];
uniform vec3 spotDir[${MAX_SPOTS}];
uniform vec3 spotCol[${MAX_SPOTS}];
uniform vec4 spotCone[${MAX_SPOTS}]; // cosOuter, cosInner, range, shadow slot (-1 none)
uniform mat4 shadowMat[${MAX_SHADOWED}];
uniform float shadowBias[${MAX_SHADOWED}];
uniform sampler2DShadow shadowMap0;
uniform sampler2DShadow shadowMap1;
uniform sampler2DShadow shadowMap2;
uniform sampler2DShadow shadowMap3;

uniform int nPoints;
uniform vec3 ptPos[${MAX_POINTS}];
uniform vec3 ptCol[${MAX_POINTS}];
uniform float ptRange[${MAX_POINTS}];

float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
float h3(vec3 p){ p = fract(p * .1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float n3(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float hg(float c, float g){ float g2 = g*g; return (1. - g2) / (12.566 * pow(max(1. + g2 - 2.*g*c, 1e-4), 1.5)); }

float shadowAt(int slot, vec3 p){
  vec4 sc = shadowMat[slot] * vec4(p, 1.);
  if (sc.w <= 0.) return 1.;
  sc.xyz /= sc.w;
  if (sc.x < 0. || sc.x > 1. || sc.y < 0. || sc.y > 1. || sc.z > 1.) return 1.;
  vec3 q = vec3(sc.xy, sc.z + shadowBias[slot]);
  if (slot == 0) return textureLod(shadowMap0, q, 0.);
  if (slot == 1) return textureLod(shadowMap1, q, 0.);
  if (slot == 2) return textureLod(shadowMap2, q, 0.);
  return textureLod(shadowMap3, q, 0.);
}

void main(){
  float d = texture2D(tDepth, vUv).x;
  vec4 ndc = vec4(vUv * 2. - 1., d * 2. - 1., 1.);
  vec4 vp = projInv * ndc; vp /= vp.w;
  vec3 wp = (viewInv * vp).xyz;
  vec3 rd = wp - camPos;
  float tEnd = length(rd);
  rd /= tEnd;
  tEnd = min(tEnd, maxDist);
  // Fog lives indoors: stop the march where the ray leaves the building, so the
  // street outside the foyer glass is clear night air, not lit haze.
  {
    vec3 inv = 1. / (rd + vec3(1e-6));
    vec3 t0 = (boxMin - camPos) * inv;
    vec3 t1 = (boxMax - camPos) * inv;
    vec3 tf = max(t0, t1);
    float tExit = min(min(tf.x, tf.y), tf.z);
    tEnd = min(tEnd, max(tExit, 0.));
  }

  float j = fract(ign(gl_FragCoord.xy) + frameJitter);
  float dt = tEnd / float(VOL_STEPS);
  vec3 acc = vec3(0.);
  float trans = 1.;
  for (int s = 0; s < VOL_STEPS; s++){
    float t = (float(s) + j) * dt;
    vec3 p = camPos + rd * t;
    float hgt = max(p.y - fogBase, 0.);
    float nz = n3(p * .45 + vec3(time * .03, -time * .015, time * .02)) * .65 + n3(p * 1.3 - vec3(0., time * .05, 0.)) * .35;
    float dens = density * exp(-hgt * heightFalloff) * mix(1., .25 + 1.5 * nz, noiseAmt);
    vec3 L = ambient;
    for (int i = 0; i < ${MAX_SPOTS}; i++){
      if (i >= nSpots) break;
      vec3 dl = p - spotPos[i];
      float dist = length(dl);
      vec3 l = dl / max(dist, 1e-3);
      vec4 cone = spotCone[i];
      float cd = dot(l, spotDir[i]);
      if (cd < cone.x || dist > cone.z) continue;
      float spot = smoothstep(cone.x, cone.y, cd);
      float fall = pow(clamp(1. - pow(dist / cone.z, 4.), 0., 1.), 2.) / (dist * dist + .35);
      float vis = cone.w >= 0. ? shadowAt(int(cone.w + .5), p) : 1.;
      L += spotCol[i] * spot * fall * vis * mix(.0796, hg(dot(l, -rd), anisotropy), .6);
    }
    for (int i = 0; i < ${MAX_POINTS}; i++){
      if (i >= nPoints) break;
      vec3 dl = p - ptPos[i];
      float dist2 = dot(dl, dl);
      float r = ptRange[i];
      if (dist2 > r * r) continue;
      float fall = pow(clamp(1. - dist2 / (r * r), 0., 1.), 2.) / (dist2 + .5);
      L += ptCol[i] * fall * .0796;
    }
    float ext = max(dens, 1e-5);
    float tr = exp(-ext * dt);
    acc += trans * L * dens * (1. - tr) / ext;
    trans *= tr;
  }
  gl_FragColor = vec4(acc, trans);
}
`;

/**
 * Temporal accumulation for the volumetrics: reproject last frame's result with
 * last frame's view-projection, clamp it to this frame's 3x3 neighbourhood (so a
 * lamp that swings away does not leave a ghost), and blend.
 */
export const VOL_RESOLVE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tCur;
uniform sampler2D tHist;
uniform sampler2D tDepth;
uniform mat4 projInv;
uniform mat4 viewInv;
uniform mat4 prevViewProj;
uniform vec2 texel;
uniform float blend;
void main(){
  vec4 cur = texture2D(tCur, vUv);
  vec4 mn = cur, mx = cur;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec4 s = texture2D(tCur, vUv + vec2(x, y) * texel);
    mn = min(mn, s); mx = max(mx, s);
  }
  float d = texture2D(tDepth, vUv).x;
  vec4 vp = projInv * vec4(vUv * 2. - 1., d * 2. - 1., 1.); vp /= vp.w;
  vec3 wp = (viewInv * vp).xyz;
  vec4 pp = prevViewProj * vec4(wp, 1.);
  vec2 puv = pp.xy / pp.w * .5 + .5;
  vec4 hist = texture2D(tHist, puv);
  hist = clamp(hist, mn, mx);
  float ok = step(0., puv.x) * step(puv.x, 1.) * step(0., puv.y) * step(puv.y, 1.);
  gl_FragColor = mix(cur, hist, blend * ok);
}
`;

/* ====================================================================== lit
 *
 * Scene * AO, attenuated by the fog's transmittance, plus the in-scattered
 * light. The AO is kept off very bright pixels (emitters must not be darkened
 * by the occlusion of the wall they are mounted on). The volumetric buffer is
 * half resolution; a depth-aware 4-tap upsample stops the haze bleeding a
 * bright halo onto a dark silhouette in front of it.
 */
export const LIT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tAO;
uniform sampler2D tVol;
uniform sampler2D tDepth;
uniform vec2 volTexel;
uniform float aoStrength;
uniform float volStrength;
uniform float near;
uniform float far;
float lin(float d){ float z = d * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  float ao = texture2D(tAO, vUv).r;
  float lum = dot(c, vec3(.2126, .7152, .0722));
  c *= mix(1., ao, aoStrength * (1. - smoothstep(.6, 3., lum)));
  // Bilateral upsample of the half-res volumetrics.
  float zc = lin(texture2D(tDepth, vUv).x);
  vec4 acc = vec4(0.); float wsum = 0.;
  for (int y = 0; y <= 1; y++) for (int x = 0; x <= 1; x++){
    vec2 o = (vec2(x, y) - .5) * volTexel;
    float zs = lin(texture2D(tDepth, vUv + o * 2.).x);
    float w = 1. / (1e-3 + abs(zs - zc) / max(zc, .1));
    acc += texture2D(tVol, vUv + o) * w; wsum += w;
  }
  vec4 v = acc / wsum;
  c = c * mix(1., v.a, volStrength) + v.rgb * volStrength;
  gl_FragColor = vec4(c, 1.);
}
`;

/* ==================================================================== bloom
 *
 * Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare"
 * (2014): a 13-tap downsample chain (Karis-averaged on the first step so one
 * hot pixel cannot flicker a whole halo) and a 3x3 tent upsample accumulated
 * back up the chain. No threshold: everything blooms a little, emitters a lot,
 * which is what makes neon read as neon.
 */
export const BLOOM_DOWN_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 srcTexel;
uniform float karis;
uniform float clampMax;
vec3 s(vec2 o){ return min(texture2D(tSrc, vUv + o * srcTexel).rgb, vec3(clampMax)); }
float kw(vec3 c){ return 1. / (1. + dot(c, vec3(.2126, .7152, .0722))); }
void main(){
  vec3 a = s(vec2(-2., 2.)), b = s(vec2(0., 2.)), c = s(vec2(2., 2.));
  vec3 d = s(vec2(-2., 0.)), e = s(vec2(0., 0.)), f = s(vec2(2., 0.));
  vec3 g = s(vec2(-2., -2.)), h = s(vec2(0., -2.)), i = s(vec2(2., -2.));
  vec3 j = s(vec2(-1., 1.)), k = s(vec2(1., 1.)), l = s(vec2(-1., -1.)), m = s(vec2(1., -1.));
  vec3 o;
  if (karis > .5){
    vec3 g0 = (j + k + l + m) * .25, g1 = (a + b + d + e) * .25, g2 = (b + c + e + f) * .25, g3 = (d + e + g + h) * .25, g4 = (e + f + h + i) * .25;
    float w0 = kw(g0) * .5, w1 = kw(g1) * .125, w2 = kw(g2) * .125, w3 = kw(g3) * .125, w4 = kw(g4) * .125;
    o = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  } else {
    o = e * .125 + (a + c + g + i) * .03125 + (b + d + f + h) * .0625 + (j + k + l + m) * .125;
  }
  gl_FragColor = vec4(max(o, vec3(0.)), 1.);
}
`;

export const BLOOM_UP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 srcTexel;
uniform float radius;
uniform float weight;
void main(){
  vec2 t = srcTexel * radius;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.;
  c += (texture2D(tSrc, vUv + vec2(-t.x, 0.)).rgb + texture2D(tSrc, vUv + vec2(t.x, 0.)).rgb + texture2D(tSrc, vUv + vec2(0., -t.y)).rgb + texture2D(tSrc, vUv + vec2(0., t.y)).rgb) * 2.;
  c += texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb;
  gl_FragColor = vec4(c / 16. * weight, 1.);
}
`;

/**
 * Anamorphic streak: a soft-thresholded copy of a small bloom mip smeared
 * horizontally by a few passes of a wide, sparse kernel. Only the brightest
 * things (lamps, neon cores) get one.
 */
export const STREAK_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 srcTexel;
uniform float stepPx;
uniform float threshold;
void main(){
  vec3 acc = vec3(0.); float ws = 0.;
  for (int i = -6; i <= 6; i++){
    float w = exp(-float(i * i) / 18.);
    vec3 c = texture2D(tSrc, vUv + vec2(float(i) * stepPx * srcTexel.x, 0.)).rgb;
    if (threshold > 0.){ float l = dot(c, vec3(.2126, .7152, .0722)); c *= smoothstep(threshold, threshold * 3., l); }
    acc += c * w; ws += w;
  }
  gl_FragColor = vec4(acc / ws, 1.);
}
`;

/* ================================================================ composite
 *
 * Chromatic aberration (radial, before the curve, so it fringes in HDR the way a
 * lens does), bloom + lens dirt + streak, exposure, the ACES fit (Hill), a
 * night-city grade (teal in the shadows, warm-magenta in the highlights, a
 * little extra saturation), vignette, and film grain applied after the encode
 * so it sits on the image like grain rather than like noise in the light.
 */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tLit;
uniform sampler2D tBloom;
uniform sampler2D tStreak;
uniform sampler2D tDirt;
uniform vec2 res;
uniform float time;
uniform float exposure;
uniform float bloomStrength;
uniform float dirtStrength;
uniform float streakStrength;
uniform vec3 streakTint;
uniform float ca;
uniform float vignette;
uniform float grain;
uniform float saturation;
uniform float contrast;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float fade;
uniform float curve;
uniform sampler2D tDof;
uniform sampler2D tDepth;
uniform float dofAmount;
uniform float dofFocus;
uniform float dofRange;
uniform float near;
uniform float far;

const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){ return clamp(ACESOut * rrt(ACESIn * c), 0., 1.); }
const mat3 LIN_REC2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const mat3 LIN_SRGB_TO_REC2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
vec3 agxContrast(vec3 x){ vec3 x2 = x * x; vec3 x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
// AgX (Blender / Filament), as three ships it: keeps saturated orange orange
// where the ACES fit skews it toward red.
vec3 agx(vec3 c){
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  c = inset * (LIN_SRGB_TO_REC2020 * c);
  c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.499999, 0., 1.);
  c = outset * agxContrast(c);
  c = pow(max(c, vec3(0.)), vec3(2.2));
  return clamp(LIN_REC2020_TO_SRGB * c, 0., 1.);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main(){
  vec2 dc = vUv - .5;
  float r2 = dot(dc, dc);
  vec2 off = dc * ca * r2 * 4.;
  vec3 col = vec3(texture2D(tLit, vUv - off).r, texture2D(tLit, vUv).g, texture2D(tLit, vUv + off).b);
  // Depth of field (title dolly, photo mode): blend toward a blurred copy by
  // how far the pixel is from the focus plane.
  if (dofAmount > 0.) {
    float z = texture2D(tDepth, vUv).x * 2. - 1.;
    float lin = 2. * near * far / (far + near - z * (far - near));
    float coc = clamp(abs(lin - dofFocus) / dofRange, 0., 1.) * dofAmount;
    col = mix(col, texture2D(tDof, vUv).rgb, smoothstep(0., 1., coc));
  }
  vec3 bl = vec3(texture2D(tBloom, vUv - off * 2.).r, texture2D(tBloom, vUv).g, texture2D(tBloom, vUv + off * 2.).b);
  float dirt = texture2D(tDirt, vUv).r;
  col = mix(col, bl, bloomStrength) + bl * dirt * dirtStrength;
  col += texture2D(tStreak, vUv).rgb * streakTint * streakStrength;
  col *= exposure;

  // Grade in linear before the curve: split-tone by luminance.
  float l = dot(col, vec3(.2126, .7152, .0722));
  float sh = 1. - smoothstep(0., .18, l);
  float hi = smoothstep(.25, 2., l);
  col *= mix(vec3(1.), shadowTint, sh);
  col *= mix(vec3(1.), highlightTint, hi);

  col = curve > .5 ? agx(col) : aces(col);
  // Saturation and contrast after the curve, around mid-grey.
  float g = dot(col, vec3(.2126, .7152, .0722));
  col = max(mix(vec3(g), col, saturation), 0.);
  col = clamp((col - .18) * contrast + .18, 0., 1.);
  col = toSRGB(col);

  float v = smoothstep(.95, .25, length(dc * vec2(res.x / res.y, 1.) * .9));
  col *= mix(1., v, vignette);
  float n = hash(vUv * res + fract(time * 7.13) * 91.7) - .5;
  col += n * grain * (1. - .6 * dot(col, vec3(.333)));
  // Dither away the banding in the deep gradients of the haze.
  col += (hash(vUv * res + 3.7) - .5) / 255.;
  col *= 1. - fade;
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}
`;
