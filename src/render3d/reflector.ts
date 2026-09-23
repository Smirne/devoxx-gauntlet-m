/**
 * reflector.ts — the polished floor's mirror image.
 *
 * Every floor of chapter 1 is at y = 0, so one reflection plane serves the whole
 * storey: a mirrored camera (Lengyel's oblique near plane clips everything under
 * the floor) renders the scene into a half-resolution HDR target, which is then
 * blurred into a quarter-resolution copy. Floor materials sample both through
 * `textureMatrix` and blend by their own roughness — see `withReflection()` in
 * `materials.ts` — so a waxed lane is a mirror and a grimy corner a smear.
 *
 * This is what screen-space reflections cannot do: things behind the camera and
 * off screen (a neon sign over the player's shoulder) still reflect.
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 dir;
varying vec2 vUv;
void main(){
  // 9-tap Gaussian via linear sampling (5 fetches).
  vec3 c = texture2D(tSrc, vUv).rgb * .2270270270;
  vec2 o1 = dir * 1.3846153846, o2 = dir * 3.2307692308;
  c += texture2D(tSrc, vUv + o1).rgb * .3162162162;
  c += texture2D(tSrc, vUv - o1).rgb * .3162162162;
  c += texture2D(tSrc, vUv + o2).rgb * .0702702703;
  c += texture2D(tSrc, vUv - o2).rgb * .0702702703;
  gl_FragColor = vec4(c, 1.);
}
`;
const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

export class PlanarReflection {
  readonly rt: THREE.WebGLRenderTarget;
  readonly blurA: THREE.WebGLRenderTarget;
  readonly blurB: THREE.WebGLRenderTarget;
  /** World -> reflection texture uv (xy/w). Shared by every floor material. */
  readonly textureMatrix = new THREE.Matrix4();
  readonly camera = new THREE.PerspectiveCamera();
  /** Floor height, metres. */
  planeY = 0;
  /** Resolution relative to the canvas. */
  scale: number;

  private readonly blurMat: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(scale = 0.5) {
    this.scale = scale;
    const opts = { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = new THREE.WebGLRenderTarget(4, 4, opts);
    this.blurA = new THREE.WebGLRenderTarget(4, 4, { ...opts, depthBuffer: false });
    this.blurB = new THREE.WebGLRenderTarget(4, 4, { ...opts, depthBuffer: false });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.blurMat);
  }

  setSize(w: number, h: number): void {
    const rw = Math.max(4, Math.round(w * this.scale));
    const rh = Math.max(4, Math.round(h * this.scale));
    this.rt.setSize(rw, rh);
    this.blurA.setSize(Math.max(4, rw >> 1), Math.max(4, rh >> 1));
    this.blurB.setSize(Math.max(4, rw >> 1), Math.max(4, rh >> 1));
  }

  private readonly _n = new THREE.Vector3(0, 1, 0);
  private readonly _p = new THREE.Vector3();
  private readonly _cam = new THREE.Vector3();
  private readonly _view = new THREE.Vector3();
  private readonly _look = new THREE.Vector3();
  private readonly _target = new THREE.Vector3();
  private readonly _rot = new THREE.Matrix4();
  private readonly _plane = new THREE.Plane();
  private readonly _clip = new THREE.Vector4();
  private readonly _q = new THREE.Vector4();

  /**
   * Render the mirror image. `hide` are the reflecting surfaces themselves (a
   * floor must not reflect itself), hidden for the duration.
   */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, hide: THREE.Object3D[]): void {
    const { _n: normal, _p: planePos, _cam: camPos, _view: view, _look: look, _target: target, _rot: rot } = this;
    planePos.set(0, this.planeY, 0);
    camPos.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y < this.planeY) return;

    view.subVectors(planePos, camPos).reflect(normal).negate().add(planePos);
    // Keep the virtual camera exactly under the real one.
    view.x = camPos.x;
    view.z = camPos.z;
    view.y = 2 * this.planeY - camPos.y;

    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(planePos, look).reflect(normal).negate().add(planePos);
    target.set(look.x, 2 * this.planeY - look.y, look.z);

    const rc = this.camera;
    rc.position.copy(view);
    rc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    rc.lookAt(target);
    rc.near = camera.near;
    rc.far = camera.far;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    rc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);

    // Oblique near plane = the floor.
    this._plane.setFromNormalAndCoplanarPoint(normal, planePos).applyMatrix4(rc.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = rc.projectionMatrix.elements;
    const q = this._q;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1 + pm[10]) / pm[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x;
    pm[6] = clip.y;
    pm[10] = clip.z + 1 - 0.003;
    pm[14] = clip.w;

    const vis = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, rc);
    hide.forEach((o, i) => (o.visible = vis[i]));

    // Blur: rt -> blurA (h) -> blurB (v) -> blurA (h, wider) -> blurB (v, wider)
    const bw = this.blurA.width;
    const bh = this.blurA.height;
    const pass = (src: THREE.Texture, dst: THREE.WebGLRenderTarget, dx: number, dy: number): void => {
      this.blurMat.uniforms.tSrc.value = src;
      this.blurMat.uniforms.dir.value.set(dx / bw, dy / bh);
      renderer.setRenderTarget(dst);
      this.quad.render(renderer);
    };
    pass(this.rt.texture, this.blurA, 1, 0);
    pass(this.blurA.texture, this.blurB, 0, 1);
    pass(this.blurB.texture, this.blurA, 2.5, 0);
    pass(this.blurA.texture, this.blurB, 0, 2.5);
    renderer.setRenderTarget(prev);
  }

  /** The blurred reflection. */
  get blurred(): THREE.Texture {
    return this.blurB.texture;
  }

  dispose(): void {
    this.rt.dispose();
    this.blurA.dispose();
    this.blurB.dispose();
    this.blurMat.dispose();
    this.quad.dispose();
  }
}
