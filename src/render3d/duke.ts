/**
 * duke.ts — Duke, the Java mascot, as a three-metre inflatable in the lobby.
 *
 * Michele, 28 Sep 2026, with a photograph of Duke filling the keynote screen:
 * *"the java character. Should appear somewhere."* Duke's artwork was released
 * by Sun under a BSD licence, so he is a mascot this game can draw freely.
 *
 * The shape everybody knows: a rounded black wedge that comes to a soft point,
 * a white lower half, and a big round red nose where the two meet — plus two
 * stubby arms, one of them waving. Inflatable, so he sways a little on his
 * tether. His footprint is the sim's (`DUKE` in src/sim/geometry.ts); this only
 * draws him on it.
 */

import * as THREE from 'three';

export interface Duke3D {
  root: THREE.Group;
  update(t: number): void;
}

/** Height of the whole balloon, m. */
const HEIGHT = 2.9;

export function buildDuke(): Duke3D {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // The wedge: a lathe from a wide rounded base to a soft point, flattened
  // front-to-back, black above the waterline and white below it.
  const pts: THREE.Vector2[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    // Width: full at the bottom, bellied at a third, tapering to a rounded tip.
    // A rounded wedge, not a cone: full through the body, domed at the top.
    const r = u < 0.08 ? 0.55 + (u / 0.08) * 0.28 : 0.83 * Math.pow(Math.max(0, 1 - Math.pow((u - 0.08) / 0.92, 2.2)), 0.55);
    pts.push(new THREE.Vector2(Math.max(0.02, r), u * HEIGHT));
  }
  const geo = new THREE.LatheGeometry(pts, 36);
  geo.scale(1, 1, 0.72);
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const black = new THREE.Color('#1a1b1f');
  const white = new THREE.Color('#f4f2ee');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // The white face-and-belly on the front, rising a little toward the nose.
    const line = HEIGHT * (0.42 + 0.06 * Math.max(0, z));
    c.copy(y < line ? white : black);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // Glossy vinyl.
  const skin = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const shell = new THREE.Mesh(geo, skin);
  shell.castShadow = true;
  shell.receiveShadow = true;
  body.add(shell);

  // The nose: big, round, red, at the black/white line on the front.
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 28, 20),
    new THREE.MeshPhysicalMaterial({ color: 0xd8231c, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }),
  );
  nose.position.set(0, HEIGHT * 0.46, 0.5);
  nose.castShadow = true;
  body.add(nose);

  // Arms: stubby black tubes, the right one up and waving.
  const armMat = new THREE.MeshPhysicalMaterial({ color: 0x111214, roughness: 0.35, clearcoat: 0.6 });
  const arms: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.72, HEIGHT * 0.36, 0.05);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.55, 6, 12), armMat);
    arm.position.y = 0.36;
    arm.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0xf4f2ee, roughness: 0.35, clearcoat: 0.6 }));
    hand.position.y = 0.72;
    pivot.add(arm, hand);
    pivot.rotation.z = sx * (sx > 0 ? -0.5 : -2.2);
    body.add(pivot);
    arms.push(pivot);
  }

  // The blower base he stands on, and a tether line.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.14, 28), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6 }));
  base.position.y = 0.07;
  base.receiveShadow = true;
  root.add(base);

  return {
    root,
    update(t: number): void {
      // A balloon's sway: slow, and a slower lean.
      body.rotation.z = Math.sin(t * 0.9) * 0.025;
      body.rotation.x = Math.sin(t * 0.63 + 1) * 0.02;
      // The wave.
      arms[1].rotation.z = -(0.5 + 0.35 * Math.sin(t * 3.2));
    },
  };
}
