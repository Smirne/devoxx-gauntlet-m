/*
 * shutter.ts — the corrugated roll-up shutter, kept for chapter 2.
 *
 * It was chapter 1's fire door until the sim's door became a pair of swinging
 * leaves that shove what is in their arc (25 Sep). Michele: "Keep the shutter
 * design for chap2", where the store's roller door is Biggy's (`ROLLER_DOOR_SPEED`,
 * posed from `Prop.progress` in `src/render/roller-door.ts` on the 2.5D side).
 * Nothing builds it yet; the 3D build has only chapter 1.
 */

import * as THREE from 'three';

import type { Materials } from './materials';
import { box } from './materials';

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/**
 * A shutter `depth` m wide (it runs along local z), `H` m of curtain under a drum
 * housing that reaches up to `ceiling`. The curtain is `userData.curtain`; pose it
 * with `poseShutter`.
 */
export function rollerShutter(mats: Materials, depth: number, H = 4.3, ceiling = H + 0.9): THREE.Group {
  // Corrugated steel, rolled from a drum housing under the ceiling.
  const g = new THREE.Group();
  const corr = new THREE.PlaneGeometry(depth, H, 1, 160);
  const pos = corr.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getY(i) * 38) * 0.025);
  corr.computeVertexNormals();
  // Painted, not bare: grey enamel over galvanised steel, so the work light
  // shows on it instead of glancing off it.
  const slatMat = mats.enamel.clone();
  slatMat.color = new THREE.Color(0.42, 0.44, 0.46);
  slatMat.clearcoat = 0.3;
  const curtain = new THREE.Group();
  const front = new THREE.Mesh(corr, slatMat);
  front.rotation.y = -Math.PI / 2;
  front.position.set(-0.02, H / 2, 0);
  const back = front.clone();
  back.rotation.y = Math.PI / 2;
  back.position.x = 0.02;
  // Hazard stripes on the bottom rail.
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 32;
  const x = c.getContext('2d')!;
  for (let i = -2; i < 34; i++) {
    x.fillStyle = i % 2 ? '#111' : '#f2c200';
    x.beginPath();
    x.moveTo(i * 16, 32);
    x.lineTo(i * 16 + 16, 32);
    x.lineTo(i * 16 + 32, 0);
    x.lineTo(i * 16 + 16, 0);
    x.fill();
  }
  const stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, depth), [
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5 }),
    mats.darkMetal,
    mats.darkMetal,
    mats.darkMetal,
    mats.darkMetal,
  ]);
  (rail.material as THREE.Material[]).forEach((mm) => mm.needsUpdate);
  rail.position.set(0, 0.11, 0);
  curtain.add(front, back, rail);
  curtain.traverse((o) => {
    (o as THREE.Mesh).castShadow = true;
    (o as THREE.Mesh).receiveShadow = true;
  });
  g.add(curtain);
  g.userData.curtain = curtain;
  const drum = new THREE.Mesh(box(0.9, ceiling - H, depth + 0.4, V(0.1, H + (ceiling - H) / 2, 0)), mats.enamel);
  drum.castShadow = true;
  g.add(drum);
  for (const s of [-1, 1]) {
    const guide = new THREE.Mesh(box(0.3, H, 0.25, V(0, H / 2, (s * depth) / 2)), mats.darkMetal);
    g.add(guide);
  }
  return g;
}

/** Roll the curtain up: `lift` 0 shut .. 1 open — the sim's `progress`, as is. */
export function poseShutter(g: THREE.Group, lift: number, H = 4.3): void {
  const curtain = g.userData.curtain as THREE.Object3D;
  const u = THREE.MathUtils.clamp(lift, 0, 1);
  curtain.position.y = u * (H - 0.2);
  curtain.scale.y = 1 - u * 0.95;
}
