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

/**
 * The layer a pooled spot light is moved to. No camera renders it, so three
 * stops counting the light — while it stays where it was built, in its group,
 * under its parents' visibility and transforms, animated by whoever owns it.
 */
export const POOLED_LAYER = 31;

interface Virtual {
  src: THREE.PointLight;
  pos: THREE.Vector3;
  /**
   * The group it was taken out of. Its visibility is the light's: both floors
   * stand at y = 0 over the same plan, so a light that forgot its floor lit
   * the other one — upstairs neons glowed in the exhibition hall (29 Sep).
   */
  home: THREE.Object3D | null;
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
      this.virtuals.push({ src: l, pos: l.getWorldPosition(new THREE.Vector3()), home: l.parent });
      l.parent?.remove(l);
    }
  }

  private readonly scored: Array<{ v: Virtual; d: number }> = [];

  update(eye: THREE.Vector3): void {
    const sc = this.scored;
    sc.length = 0;
    for (const v of this.virtuals) {
      if (!v.src.visible || v.src.intensity <= 0 || (v.home && !shown(v.home))) continue;
      const d = v.pos.distanceTo(eye) - (v.src.distance || 10);
      if (d < this.fadeTo) sc.push({ v, d });
    }
    sc.sort((a, b) => a.d - b.d);
    // Past the pool's size a light is dropped; fade toward that cut so the
    // light that loses its slot is already dark (a hard cut popped visibly).
    const n = this.slots.length;
    const cut = sc.length > n ? sc[n].d : Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const e = sc[i];
      if (!e) {
        s.intensity = 0;
        continue;
      }
      const src = e.v.src;
      const fade = (1 - THREE.MathUtils.smoothstep(e.d, this.fadeFrom, this.fadeTo)) * (1 - THREE.MathUtils.smoothstep(e.d, cut - 5, cut));
      s.position.copy(e.v.pos);
      s.color.copy(src.color);
      s.intensity = src.intensity * fade;
      s.distance = src.distance;
      s.decay = src.decay;
    }
  }
}

/** Shown: the object and every parent visible. */
function shown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * SPOT LIGHTS, THE SAME WAY — but the ones that matter to the view.
 *
 * Every spot light in the scene was a pass of the forward shader's light loop
 * for every lit fragment, in the reflection and the frame: 24 on the first
 * floor, 36 with Room 8 dressed for the keynote, most of them tens of metres
 * away or switched off (the mirror bounces, the crate lights, the stage beams
 * before they are lit). Measured 29 Sep, after players reported the 3D build
 * "very slow, in some cases unusable": 41-55 lights in every lit shader.
 *
 * The pool leaves the sources where they are and moves them to `POOLED_LAYER`,
 * out of three's count, and keeps a fixed number of real, unshadowed spots,
 * handed each frame to the sources that can light something on screen: lit,
 * shown, with a range that reaches into the camera's frustum or its mirror in
 * the floor (the reflection pass sees that), nearest first. A light's influence
 * ends at its range, so one whose range misses the view adds nothing to the
 * frame, and one entering the view does so at the zero edge of its falloff —
 * no pop. The cut at the pool's size fades like the point pool's.
 *
 * Shadow-casting spots are not pooled: the robots' lamps, the foyer's street
 * lamp and the fire door's wash keep their own lights and shadow maps.
 */
export class SpotPool {
  private readonly sources: THREE.SpotLight[] = [];
  private readonly slots: THREE.SpotLight[] = [];
  private readonly taken = new WeakSet<THREE.Light>();
  /** Distance beyond a light's own range where it starts / finishes fading. */
  fadeFrom = 16;
  fadeTo = 26;
  private readonly scored: Array<{ l: THREE.SpotLight; d: number }> = [];
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Sphere();

  constructor(parent: THREE.Object3D, count: number) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.SpotLight(0xffffff, 0, 1, 0.5, 0, 2);
      s.name = `spot-pool-${i}`;
      this.taken.add(s);
      this.slots.push(s);
      parent.add(s, s.target);
    }
  }

  /** How many sources the pool is serving. */
  get size(): number {
    return this.sources.length;
  }

  /** Take every spot light under `root` that casts no shadow and is not pooled yet. */
  collect(root: THREE.Object3D): void {
    root.traverse((o) => {
      const l = o as THREE.SpotLight;
      if (!l.isSpotLight || l.castShadow || this.taken.has(l)) return;
      this.taken.add(l);
      l.layers.set(POOLED_LAYER);
      this.sources.push(l);
    });
  }

  /**
   * Hand the slots out for a view from `eye`. `view` is the camera's frustum
   * (null for a capture that sees all round, like the environment probe), and
   * `mirrorY` the height of the floor whose reflection is drawn — null when none
   * is this frame.
   */
  update(eye: THREE.Vector3, view: THREE.Frustum | null, mirrorY: number | null = 0): void {
    const sc = this.scored;
    sc.length = 0;
    const p = this._p;
    const s = this._s;
    for (const l of this.sources) {
      if (l.intensity <= 0 || !shown(l)) continue;
      l.updateWorldMatrix(true, false);
      p.setFromMatrixPosition(l.matrixWorld);
      const range = l.distance || 30;
      const d = p.distanceTo(eye) - range;
      if (d >= this.fadeTo) continue;
      if (view) {
        s.set(p, range);
        if (!view.intersectsSphere(s)) {
          if (mirrorY === null) continue;
          s.center.y = 2 * mirrorY - s.center.y;
          if (!view.intersectsSphere(s)) continue;
        }
      }
      sc.push({ l, d });
    }
    sc.sort((a, b) => a.d - b.d);
    const n = this.slots.length;
    const cut = sc.length > n ? sc[n].d : Infinity;
    for (let i = 0; i < n; i++) {
      const slot = this.slots[i];
      const e = sc[i];
      if (!e) {
        slot.intensity = 0;
        continue;
      }
      const src = e.l;
      const fade = (1 - THREE.MathUtils.smoothstep(e.d, this.fadeFrom, this.fadeTo)) * (1 - THREE.MathUtils.smoothstep(e.d, cut - 5, cut));
      slot.position.setFromMatrixPosition(src.matrixWorld);
      src.target.updateWorldMatrix(true, false);
      slot.target.position.setFromMatrixPosition(src.target.matrixWorld);
      slot.color.copy(src.color);
      slot.intensity = src.intensity * fade;
      slot.distance = src.distance;
      slot.angle = src.angle;
      slot.penumbra = src.penumbra;
      slot.decay = src.decay;
    }
  }
}

/**
 * EVERY HEMISPHERE LIGHT, AS ONE.
 *
 * The night fill is the scene's; the exhibition hall and Room 8 each add their
 * own. Three counts them into every shader, so walking from one floor to the
 * other changed the count and recompiled every material. Hemisphere light is
 * linear — sky and ground colours times intensity, mixed by the normal — and
 * all of these point straight up, so the sum of the ones shown is one light:
 * the sources move to `POOLED_LAYER` and this sets a single real one from them
 * each frame.
 */
export class HemiMerge {
  readonly light = new THREE.HemisphereLight(0x000000, 0x000000, 1);
  private readonly sources: THREE.HemisphereLight[] = [];

  constructor(parent: THREE.Object3D) {
    this.light.name = 'hemi-merge';
    parent.add(this.light);
  }

  /** Take every hemisphere light under `root` not taken yet. */
  collect(root: THREE.Object3D): void {
    root.traverse((o) => {
      const h = o as THREE.HemisphereLight;
      if (!h.isHemisphereLight || h === this.light || this.sources.includes(h)) return;
      h.layers.set(POOLED_LAYER);
      this.sources.push(h);
    });
  }

  update(): void {
    const sky = this.light.color.setRGB(0, 0, 0);
    const ground = this.light.groundColor.setRGB(0, 0, 0);
    for (const h of this.sources) {
      if (h.intensity <= 0 || !shown(h)) continue;
      sky.r += h.color.r * h.intensity;
      sky.g += h.color.g * h.intensity;
      sky.b += h.color.b * h.intensity;
      ground.r += h.groundColor.r * h.intensity;
      ground.g += h.groundColor.g * h.intensity;
      ground.b += h.groundColor.b * h.intensity;
    }
  }
}
