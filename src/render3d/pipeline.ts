/**
 * pipeline.ts — the HDR frame, pass by pass.
 *
 *   reflection   planar mirror of the scene for the polished floors (reflector.ts)
 *   scene        linear HDR, MSAA, depth texture
 *   GTAO         ground-truth ambient occlusion, half res (three's GTAOPass)
 *   volumetrics  raymarched single scattering through every spot light's shadow
 *                map, half res, temporally accumulated
 *   lit          scene * AO * fog transmittance + in-scatter
 *   bloom        13-tap down / tent up mip chain, plus an anamorphic streak
 *   composite    CA, bloom, lens dirt, exposure, ACES, grade, vignette, grain
 *   FXAA         to the canvas
 *
 * Nothing here knows about the game. The world hands it a scene, a camera and,
 * once a frame, the list of lights the fog should scatter (`setVolumeLights`).
 */

import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

import { PlanarReflection } from './reflector';
import {
  BLOOM_DOWN_FRAG,
  BLOOM_UP_FRAG,
  COMPOSITE_FRAG,
  LIT_FRAG,
  MAX_POINTS,
  MAX_SHADOWED,
  MAX_SPOTS,
  QUAD_VERT,
  STREAK_FRAG,
  VOL_FRAG,
  VOL_RESOLVE_FRAG,
} from './shaders';
import { LENS_DIRT_GLSL, bakeImage } from './textures';

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface Quality {
  name: QualityName;
  /** Cap on devicePixelRatio. */
  pixelRatio: number;
  msaa: number;
  ao: boolean;
  volScale: number;
  volSteps: number;
  reflScale: number;
  bloomLevels: number;
  shadowSize: number;
}

export const QUALITY: Readonly<Record<QualityName, Quality>> = {
  low: { name: 'low', pixelRatio: 1, msaa: 0, ao: false, volScale: 0.25, volSteps: 20, reflScale: 0.25, bloomLevels: 5, shadowSize: 512 },
  medium: { name: 'medium', pixelRatio: 1, msaa: 0, ao: true, volScale: 0.35, volSteps: 28, reflScale: 0.4, bloomLevels: 6, shadowSize: 1024 },
  high: { name: 'high', pixelRatio: 1.5, msaa: 4, ao: true, volScale: 0.5, volSteps: 40, reflScale: 0.5, bloomLevels: 7, shadowSize: 1024 },
  ultra: { name: 'ultra', pixelRatio: 2, msaa: 4, ao: true, volScale: 0.5, volSteps: 64, reflScale: 0.75, bloomLevels: 7, shadowSize: 2048 },
};

/** The look. Public so the debug URL and the photo-mode keys can poke at it. */
export interface Grade {
  exposure: number;
  bloomStrength: number;
  dirtStrength: number;
  streakStrength: number;
  streakTint: THREE.Color;
  ca: number;
  vignette: number;
  grain: number;
  saturation: number;
  contrast: number;
  shadowTint: THREE.Color;
  highlightTint: THREE.Color;
  aoStrength: number;
  volStrength: number;
  /** Fog density per metre at `fogBase`. */
  fogDensity: number;
  fogHeightFalloff: number;
  fogBase: number;
  fogNoise: number;
  fogAnisotropy: number;
  fogAmbient: THREE.Color;
  fogMaxDist: number;
  /** 0 = ACES (Hill fit), 1 = AgX. */
  curve: number;
}

export function defaultGrade(): Grade {
  return {
    exposure: 1.35,
    bloomStrength: 0.035,
    dirtStrength: 0.12,
    streakStrength: 0.05,
    streakTint: new THREE.Color(0.55, 0.7, 1.0),
    ca: 0.0035,
    vignette: 0.55,
    grain: 0.045,
    saturation: 1.15,
    contrast: 1.18,
    shadowTint: new THREE.Color(0.82, 1.0, 1.12),
    highlightTint: new THREE.Color(1.08, 0.97, 0.92),
    aoStrength: 0.9,
    volStrength: 1.0,
    fogDensity: 0.035,
    fogHeightFalloff: 0.18,
    fogBase: 0,
    fogNoise: 0.7,
    fogAnisotropy: 0.55,
    fogAmbient: new THREE.Color(0.0012, 0.0016, 0.0028),
    fogMaxDist: 60,
    curve: 1,
  };
}

export interface VolumePoint {
  position: THREE.Vector3;
  /** Linear colour times intensity. */
  color: THREE.Color;
  range: number;
}

export interface VolumeSpot {
  light: THREE.SpotLight;
  /** Multiplier on the light's own colour * intensity for the fog only. */
  fog: number;
}

function quadMat(frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, unknown> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: frag,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
  });
}

function hdrTarget(w: number, h: number, extra: THREE.RenderTargetOptions = {}): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    ...extra,
  });
}

export class Pipeline {
  readonly quality: Quality;
  readonly grade: Grade = defaultGrade();
  readonly reflection: PlanarReflection;
  /** Objects the reflection pass must hide (the mirrors themselves). */
  reflectors: THREE.Object3D[] = [];

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private width = 4;
  private height = 4;
  private readonly sceneRT: THREE.WebGLRenderTarget;
  private gtao: GTAOPass | null = null;
  private readonly whiteTex: THREE.DataTexture;
  private readonly volRT: THREE.WebGLRenderTarget;
  private volHist: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readonly litRT: THREE.WebGLRenderTarget;
  private readonly mips: THREE.WebGLRenderTarget[] = [];
  private readonly streakA: THREE.WebGLRenderTarget;
  private readonly streakB: THREE.WebGLRenderTarget;
  private readonly ldrRT: THREE.WebGLRenderTarget;
  private readonly dirt: THREE.Texture;

  private readonly volMat: THREE.ShaderMaterial;
  private readonly resolveMat: THREE.ShaderMaterial;
  private readonly litMat: THREE.ShaderMaterial;
  private readonly downMat: THREE.ShaderMaterial;
  private readonly upMat: THREE.ShaderMaterial;
  private readonly streakMat: THREE.ShaderMaterial;
  private readonly compMat: THREE.ShaderMaterial;
  private readonly fxaaMat: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();

  private spots: VolumeSpot[] = [];
  private points: VolumePoint[] = [];
  private readonly prevViewProj = new THREE.Matrix4();
  private frame = 0;
  private time = 0;
  private histValid = false;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: Quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;

    const depthTexture = new THREE.DepthTexture(4, 4);
    depthTexture.type = THREE.FloatType;
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples: quality.msaa,
      depthTexture,
      depthBuffer: true,
    });
    this.whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.whiteTex.needsUpdate = true;
    this.volRT = hdrTarget(4, 4);
    this.volHist = [hdrTarget(4, 4), hdrTarget(4, 4)];
    this.litRT = hdrTarget(4, 4);
    for (let i = 0; i < quality.bloomLevels; i++) this.mips.push(hdrTarget(4, 4));
    this.streakA = hdrTarget(4, 4);
    this.streakB = hdrTarget(4, 4);
    this.ldrRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.reflection = new PlanarReflection(quality.reflScale);
    this.dirt = bakeImage(renderer, LENS_DIRT_GLSL, 512);

    const v3s = (n: number): THREE.Vector3[] => Array.from({ length: n }, () => new THREE.Vector3());
    this.volMat = quadMat(
      VOL_FRAG,
      {
        tDepth: { value: depthTexture },
        projInv: { value: new THREE.Matrix4() },
        viewInv: { value: new THREE.Matrix4() },
        camPos: { value: new THREE.Vector3() },
        time: { value: 0 },
        frameJitter: { value: 0 },
        density: { value: 0 },
        heightFalloff: { value: 0 },
        fogBase: { value: 0 },
        noiseAmt: { value: 0 },
        maxDist: { value: 40 },
        anisotropy: { value: 0.5 },
        ambient: { value: new THREE.Color() },
        boxMin: { value: new THREE.Vector3(-1e4, -1e4, -1e4) },
        boxMax: { value: new THREE.Vector3(1e4, 1e4, 1e4) },
        nSpots: { value: 0 },
        spotPos: { value: v3s(MAX_SPOTS) },
        spotDir: { value: v3s(MAX_SPOTS) },
        spotCol: { value: v3s(MAX_SPOTS) },
        spotCone: { value: Array.from({ length: MAX_SPOTS }, () => new THREE.Vector4()) },
        shadowMat: { value: Array.from({ length: MAX_SHADOWED }, () => new THREE.Matrix4()) },
        shadowBias: { value: new Array(MAX_SHADOWED).fill(0) },
        shadowMap0: { value: null },
        shadowMap1: { value: null },
        shadowMap2: { value: null },
        shadowMap3: { value: null },
        nPoints: { value: 0 },
        ptPos: { value: v3s(MAX_POINTS) },
        ptCol: { value: v3s(MAX_POINTS) },
        ptRange: { value: new Array(MAX_POINTS).fill(1) },
      },
      { VOL_STEPS: quality.volSteps },
    );
    this.resolveMat = quadMat(VOL_RESOLVE_FRAG, {
      tCur: { value: this.volRT.texture },
      tHist: { value: null },
      tDepth: { value: depthTexture },
      projInv: { value: new THREE.Matrix4() },
      viewInv: { value: new THREE.Matrix4() },
      prevViewProj: { value: new THREE.Matrix4() },
      texel: { value: new THREE.Vector2() },
      blend: { value: 0.88 },
    });
    this.litMat = quadMat(LIT_FRAG, {
      tScene: { value: this.sceneRT.texture },
      tAO: { value: this.whiteTex },
      tVol: { value: null },
      tDepth: { value: depthTexture },
      volTexel: { value: new THREE.Vector2() },
      aoStrength: { value: 1 },
      volStrength: { value: 1 },
      near: { value: camera.near },
      far: { value: camera.far },
    });
    this.downMat = quadMat(BLOOM_DOWN_FRAG, {
      tSrc: { value: null },
      srcTexel: { value: new THREE.Vector2() },
      karis: { value: 0 },
      clampMax: { value: 400 },
    });
    this.upMat = quadMat(BLOOM_UP_FRAG, {
      tSrc: { value: null },
      srcTexel: { value: new THREE.Vector2() },
      radius: { value: 1 },
      weight: { value: 1 },
    });
    this.upMat.blending = THREE.AdditiveBlending;
    this.upMat.transparent = true;
    this.streakMat = quadMat(STREAK_FRAG, {
      tSrc: { value: null },
      srcTexel: { value: new THREE.Vector2() },
      stepPx: { value: 1 },
      threshold: { value: 0 },
    });
    this.compMat = quadMat(COMPOSITE_FRAG, {
      tLit: { value: this.litRT.texture },
      tBloom: { value: null },
      tStreak: { value: this.streakA.texture },
      tDirt: { value: this.dirt },
      res: { value: new THREE.Vector2() },
      time: { value: 0 },
      exposure: { value: 1 },
      bloomStrength: { value: 0 },
      dirtStrength: { value: 0 },
      streakStrength: { value: 0 },
      streakTint: { value: new THREE.Color() },
      ca: { value: 0 },
      vignette: { value: 0 },
      grain: { value: 0 },
      saturation: { value: 1 },
      contrast: { value: 1 },
      shadowTint: { value: new THREE.Color() },
      highlightTint: { value: new THREE.Color() },
      fade: { value: 0 },
      curve: { value: 1 },
    });
    this.fxaaMat = new THREE.ShaderMaterial({
      ...FXAAShader,
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      depthTest: false,
      depthWrite: false,
    });

    if (quality.ao) {
      this.gtao = new GTAOPass(scene, camera, 4, 4);
      this.gtao.output = GTAOPass.OUTPUT.Off;
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      // GTAOPass hides only points and lines from its normal/depth pass. Glass,
      // neon planes, holograms and flares are transparent: drawn there, they
      // occlude whatever is seen through them. Hide those too.
      const pass = this.gtao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
      const base = pass._overrideVisibility.bind(pass);
      pass._overrideVisibility = () => {
        base();
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && mesh.visible && !Array.isArray(mesh.material) && mesh.material.transparent) {
            mesh.visible = false;
            pass._visibilityCache.push(mesh);
          }
        });
      };
    }
  }

  setSize(w: number, h: number): void {
    this.width = Math.max(4, Math.floor(w));
    this.height = Math.max(4, Math.floor(h));
    const W = this.width;
    const H = this.height;
    this.sceneRT.setSize(W, H);
    const vw = Math.max(4, Math.round(W * this.quality.volScale));
    const vh = Math.max(4, Math.round(H * this.quality.volScale));
    this.volRT.setSize(vw, vh);
    this.volHist[0].setSize(vw, vh);
    this.volHist[1].setSize(vw, vh);
    this.histValid = false;
    this.litRT.setSize(W, H);
    let mw = W;
    let mh = H;
    for (const m of this.mips) {
      mw = Math.max(2, mw >> 1);
      mh = Math.max(2, mh >> 1);
      m.setSize(mw, mh);
    }
    const s = this.mips[Math.min(2, this.mips.length - 1)];
    this.streakA.setSize(s.width, s.height);
    this.streakB.setSize(s.width, s.height);
    this.ldrRT.setSize(W, H);
    this.reflection.setSize(W, H);
    this.gtao?.setSize(Math.max(4, W >> 1), Math.max(4, H >> 1));
    this.fxaaMat.uniforms.resolution.value.set(1 / W, 1 / H);
  }

  /** The fog's lights for this frame. Spots beyond MAX_SPOTS, and shadows beyond MAX_SHADOWED, are dropped. */
  /** The fog's extent (the building); rays stop marching where they leave it. */
  setFogBox(min: THREE.Vector3, max: THREE.Vector3): void {
    this.volMat.uniforms.boxMin.value.copy(min);
    this.volMat.uniforms.boxMax.value.copy(max);
  }

  setVolumeLights(spots: VolumeSpot[], points: VolumePoint[]): void {
    this.spots = spots;
    this.points = points;
  }

  private blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  private readonly _v = new THREE.Vector3();
  private readonly _t = new THREE.Vector3();
  private readonly _c = new THREE.Color();

  private updateVolumeUniforms(): void {
    const u = this.volMat.uniforms;
    const g = this.grade;
    const cam = this.camera;
    u.projInv.value.copy(cam.projectionMatrixInverse);
    u.viewInv.value.copy(cam.matrixWorld);
    u.camPos.value.setFromMatrixPosition(cam.matrixWorld);
    u.time.value = this.time;
    u.frameJitter.value = (this.frame * 0.61803398875) % 1;
    u.density.value = g.fogDensity;
    u.heightFalloff.value = g.fogHeightFalloff;
    u.fogBase.value = g.fogBase;
    u.noiseAmt.value = g.fogNoise;
    u.maxDist.value = g.fogMaxDist;
    u.anisotropy.value = g.fogAnisotropy;
    u.ambient.value.copy(g.fogAmbient);

    let n = 0;
    let slot = 0;
    const maps = [null, null, null, null] as Array<THREE.Texture | null>;
    for (const s of this.spots) {
      if (n >= MAX_SPOTS) break;
      const L = s.light;
      if (!L.visible || L.intensity <= 0) continue;
      L.getWorldPosition(this._v);
      L.target.getWorldPosition(this._t);
      u.spotPos.value[n].copy(this._v);
      u.spotDir.value[n].subVectors(this._t, this._v).normalize();
      this._c.copy(L.color).multiplyScalar(L.intensity * s.fog);
      u.spotCol.value[n].set(this._c.r, this._c.g, this._c.b);
      let sl = -1;
      const depth = L.shadow.map?.depthTexture ?? null;
      if (L.castShadow && depth && slot < MAX_SHADOWED) {
        sl = slot;
        u.shadowMat.value[slot].copy(L.shadow.matrix);
        u.shadowBias.value[slot] = L.shadow.bias - 0.0005;
        maps[slot] = depth;
        slot++;
      }
      u.spotCone.value[n].set(Math.cos(L.angle), Math.cos(L.angle * (1 - L.penumbra)), L.distance > 0 ? L.distance : 30, sl);
      n++;
    }
    u.nSpots.value = n;
    u.shadowMap0.value = maps[0];
    u.shadowMap1.value = maps[1];
    u.shadowMap2.value = maps[2];
    u.shadowMap3.value = maps[3];

    let p = 0;
    for (const pt of this.points) {
      if (p >= MAX_POINTS) break;
      u.ptPos.value[p].copy(pt.position);
      u.ptCol.value[p].set(pt.color.r, pt.color.g, pt.color.b);
      u.ptRange.value[p] = pt.range;
      p++;
    }
    u.nPoints.value = p;
  }

  render(dt: number): void {
    const r = this.renderer;
    const g = this.grade;
    this.time += dt;
    this.frame++;
    this.camera.updateMatrixWorld();

    // Shadows once per frame, before the reflection (which renders the scene too).
    r.shadowMap.needsUpdate = true;
    r.shadowMap.autoUpdate = false;
    r.autoClear = true;

    // 1. reflection. The first scene render of the frame updates the shadow maps.
    if (this.reflectors.length) this.reflection.update(r, this.scene, this.camera, this.reflectors);

    // 2. scene
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, this.camera);

    // 3. AO
    if (this.gtao) {
      this.gtao.render(r, null as unknown as THREE.WebGLRenderTarget, null as unknown as THREE.WebGLRenderTarget, 0, false);
      this.litMat.uniforms.tAO.value = this.gtao.gtaoMap;
    }

    // 4. volumetrics + temporal resolve
    this.updateVolumeUniforms();
    this.blit(this.volMat, this.volRT);
    const [hPrev, hNext] = this.volHist;
    const ru = this.resolveMat.uniforms;
    ru.tHist.value = hPrev.texture;
    ru.projInv.value.copy(this.camera.projectionMatrixInverse);
    ru.viewInv.value.copy(this.camera.matrixWorld);
    ru.prevViewProj.value.copy(this.prevViewProj);
    ru.texel.value.set(1 / this.volRT.width, 1 / this.volRT.height);
    ru.blend.value = this.histValid ? 0.85 : 0;
    this.blit(this.resolveMat, hNext);
    this.volHist = [hNext, hPrev];
    this.histValid = true;
    this.prevViewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);

    // 5. lit
    const lu = this.litMat.uniforms;
    lu.tVol.value = hNext.texture;
    lu.volTexel.value.set(1 / hNext.width, 1 / hNext.height);
    lu.aoStrength.value = this.gtao ? g.aoStrength : 0;
    lu.volStrength.value = g.volStrength;
    lu.near.value = this.camera.near;
    lu.far.value = this.camera.far;
    this.blit(this.litMat, this.litRT);

    // 6. bloom: down
    const dm = this.downMat.uniforms;
    let src: THREE.WebGLRenderTarget = this.litRT;
    this.mips.forEach((m, i) => {
      dm.tSrc.value = src.texture;
      dm.srcTexel.value.set(1 / src.width, 1 / src.height);
      dm.karis.value = i === 0 ? 1 : 0;
      this.blit(this.downMat, m);
      src = m;
    });
    // streak from mip 2, before the up pass adds the wide levels into it
    const sIdx = Math.min(2, this.mips.length - 1);
    const sm = this.streakMat.uniforms;
    const sSrc = this.mips[sIdx];
    sm.srcTexel.value.set(1 / sSrc.width, 1 / sSrc.height);
    sm.tSrc.value = sSrc.texture;
    sm.stepPx.value = 1.5;
    sm.threshold.value = 1.2;
    this.blit(this.streakMat, this.streakA);
    sm.tSrc.value = this.streakA.texture;
    sm.stepPx.value = 5;
    sm.threshold.value = 0;
    this.blit(this.streakMat, this.streakB);
    sm.tSrc.value = this.streakB.texture;
    sm.stepPx.value = 15;
    this.blit(this.streakMat, this.streakA);

    // bloom: up (additive into the next larger mip)
    const um = this.upMat.uniforms;
    r.autoClear = false;
    for (let i = this.mips.length - 1; i > 0; i--) {
      const s = this.mips[i];
      um.tSrc.value = s.texture;
      um.srcTexel.value.set(1 / s.width, 1 / s.height);
      um.radius.value = 1;
      um.weight.value = 1;
      this.blit(this.upMat, this.mips[i - 1]);
    }
    r.autoClear = true;

    // 7. composite
    const cu = this.compMat.uniforms;
    cu.tBloom.value = this.mips[0].texture;
    cu.res.value.set(this.width, this.height);
    cu.time.value = this.time;
    cu.exposure.value = g.exposure;
    cu.bloomStrength.value = g.bloomStrength;
    cu.dirtStrength.value = g.dirtStrength / this.mips.length;
    cu.streakStrength.value = g.streakStrength;
    cu.streakTint.value.copy(g.streakTint);
    cu.ca.value = g.ca;
    cu.vignette.value = g.vignette;
    cu.grain.value = g.grain;
    cu.saturation.value = g.saturation;
    cu.contrast.value = g.contrast;
    cu.shadowTint.value.copy(g.shadowTint);
    cu.highlightTint.value.copy(g.highlightTint);
    cu.curve.value = g.curve;
    this.blit(this.compMat, this.ldrRT);

    // 8. FXAA to the canvas
    this.fxaaMat.uniforms.tDiffuse.value = this.ldrRT.texture;
    this.blit(this.fxaaMat, null);
  }

  /** Scene depth, for anything else that wants it. */
  get depthTexture(): THREE.DepthTexture | null {
    return this.sceneRT.depthTexture;
  }

  dispose(): void {
    this.sceneRT.dispose();
    this.volRT.dispose();
    this.volHist.forEach((t) => t.dispose());
    this.litRT.dispose();
    this.mips.forEach((t) => t.dispose());
    this.streakA.dispose();
    this.streakB.dispose();
    this.ldrRT.dispose();
    this.reflection.dispose();
    this.gtao?.dispose();
    this.quad.dispose();
  }
}
