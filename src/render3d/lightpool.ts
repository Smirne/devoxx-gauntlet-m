/**
 * lightpool.ts — many point lights, few in the shader.
 *
 * three.js shades forward: every fragment of every lit material loops over
 * every light in the scene, and this scene draws most fragments twice (the
 * floor reflection, then the frame). Thirty-odd neon, poster, Zaal and cove
 * lights along a 50 m corridor are therefore paid for everywhere, although no
 * surface is within reach of more than a handful of them.
 *
 * The pool takes the scene's point lights out and keeps a fixed number of real
 * ones (so the shader never recompiles), handing them each frame to the
 * virtual lights nearest the camera. Each virtual light fades out over a band
 * of distance beyond its own range, so one leaving the set is already dark.
 */

import * as THREE from 'three';

interface Virtual {
  src: THREE.PointLight;
  pos: THREE.Vector3;
}

export class LightPool {
  private readonly virtuals: Virtual[] = [];
  private readonly slots: THREE.PointLight[] = [];
  private readonly taken = new WeakSet<THREE.Light>();
  /** Distance beyond a light's own range where it starts / finishes fading. */
  fadeFrom = 16;
  fadeTo = 26;

  constructor(parent: THREE.Object3D, count: number, exclude: THREE.Light[]) {
    for (const l of exclude) this.taken.add(l);
    for (let i = 0; i < count; i++) {
      const s = new THREE.PointLight(0xffffff, 0, 1, 2);
      this.taken.add(s);
      this.slots.push(s);
      parent.add(s);
    }
  }

  /** Take every point light under `root` not already pooled or excluded. */
  collect(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const found: THREE.PointLight[] = [];
    root.traverse((o) => {
      const l = o as THREE.PointLight;
      if (l.isPointLight && !this.taken.has(l)) found.push(l);
    });
    for (const l of found) {
      this.taken.add(l);
      this.virtuals.push({ src: l, pos: l.getWorldPosition(new THREE.Vector3()) });
      l.parent?.remove(l);
    }
  }

  private readonly scored: Array<{ v: Virtual; d: number }> = [];

  update(eye: THREE.Vector3): void {
    const sc = this.scored;
    sc.length = 0;
    for (const v of this.virtuals) {
      if (!v.src.visible || v.src.intensity <= 0) continue;
      const d = v.pos.distanceTo(eye) - (v.src.distance || 10);
      if (d < this.fadeTo) sc.push({ v, d });
    }
    sc.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const e = sc[i];
      if (!e) {
        s.intensity = 0;
        continue;
      }
      const src = e.v.src;
      const fade = 1 - THREE.MathUtils.smoothstep(e.d, this.fadeFrom, this.fadeTo);
      s.position.copy(e.v.pos);
      s.color.copy(src.color);
      s.intensity = src.intensity * fade;
      s.distance = src.distance;
      s.decay = src.decay;
    }
  }
}
