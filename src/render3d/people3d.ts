/**
 * people3d.ts — the crowd, in 3D.
 *
 * The figures are the 2.5D build's own (`src/render/people.ts`, `buildPerson`):
 * head, torso, arms, legs, posed from the person's seed, heading and speed with
 * no state of their own. So this is only a pool — `snap.people` is rebuilt every
 * frame and a person's index is not their identity, which the models do not need
 * — and the floor under each one, from the sim's plates.
 */

import * as THREE from 'three';

import { buildPerson, type PersonModel } from '../render/people';
import { riseAt } from '../sim/surface';
import type { GameSnapshot } from '../sim/types';

/** Clothes by role, when the chapter did not say — the 2.5D build's fallback. */
const ROLE_COLOR: Readonly<Record<string, string>> = {
  visitor: '#6f7c8d',
  queue: '#7b6f8d',
  staff: '#c0392b',
  stephan: '#e0b050',
  speaker: '#4aa3a0',
};

/*
 * STEPHAN, UP CLOSE.
 *
 * The shared figure (`buildPerson`) draws him for the 2.5D build's far camera:
 * glasses as a dark bar, the mic as a pale line, the collar as one orange band.
 * The 3D camera gets close enough to see a face, so the details come from the
 * photographs Michele sent (28 Sep 2026): amber tortoiseshell rectangular frames,
 * short salt-and-pepper hair fuller on top, grey stubble, a skin-coloured headset
 * boom along his left cheek, and the Devoxx Belgium polo — olive, the collar
 * tipped orange / grey / white / grey, orange piping inside the neck, three dark
 * buttons and DEVOXX embroidered in white on his left chest. First name, a
 * caricature, and nothing that needs permission, as CLAUDE.md has it.
 */
interface Portrait {
  group: THREE.Group;
  hair: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
}

function chestLogo(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, 256, 64);
  x.fillStyle = '#f4f1ea';
  x.font = 'bold 44px "Helvetica Neue", Arial, sans-serif';
  x.textBaseline = 'middle';
  x.fillText('DEVOXX', 8, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundRectRing(w: number, h: number, t: number): THREE.ExtrudeGeometry {
  const r = Math.min(w, h) * 0.22;
  const outer = new THREE.Shape();
  outer.moveTo(-w / 2 + r, -h / 2);
  outer.lineTo(w / 2 - r, -h / 2);
  outer.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  outer.lineTo(w / 2, h / 2 - r);
  outer.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  outer.lineTo(-w / 2 + r, h / 2);
  outer.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  outer.lineTo(-w / 2, -h / 2 + r);
  outer.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const iw = w - 2 * t;
  const ih = h - 2 * t;
  const hole = new THREE.Path();
  hole.moveTo(-iw / 2, -ih / 2);
  hole.lineTo(iw / 2, -ih / 2);
  hole.lineTo(iw / 2, ih / 2);
  hole.lineTo(-iw / 2, ih / 2);
  hole.lineTo(-iw / 2, -ih / 2);
  outer.holes.push(hole);
  return new THREE.ExtrudeGeometry(outer, { depth: t * 0.5, bevelEnabled: false });
}

/** Built once per pooled figure, the first time it is Stephan, sized off that pose. */
function buildPortrait(head: THREE.Mesh, torso: THREE.Mesh): Portrait {
  const g = new THREE.Group();
  const R = head.scale.x / 2;
  const hy = head.position.y;
  const H = hy + R;
  const shoulder = H - 2.35 * R;
  const halfW = torso.scale.x / 2;
  const front = torso.scale.z / 2;
  const std = (c: string, rough = 0.6): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: rough });
  const amber = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b8742c'), roughness: 0.35, metalness: 0.05 });
  // Glasses: two rounded rectangles, a bridge, and temples back to the ears.
  const lens = roundRectRing(R * 0.66, R * 0.4, R * 0.07);
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(lens, amber);
    f.position.set(sx * R * 0.36, hy + R * 0.06, R * 0.93);
    g.add(f);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(R * 0.05, R * 0.06, R * 0.95), amber);
    temple.position.set(sx * R * 0.72, hy + R * 0.1, R * 0.45);
    temple.rotation.y = sx * -0.25;
    g.add(temple);
    // Eyes, behind the lenses.
    const eye = new THREE.Mesh(new THREE.SphereGeometry(R * 0.075, 8, 6), std('#1c1916', 0.4));
    eye.position.set(sx * R * 0.34, hy + R * 0.05, R * 0.9);
    g.add(eye);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(R * 0.14, R * 0.05, R * 0.04), amber);
  bridge.position.set(0, hy + R * 0.14, R * 0.98);
  g.add(bridge);
  // Stubble over the jaw, and the big grin.
  const stubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 20, 10, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.64, Math.PI * 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#6a625a'), roughness: 1, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  stubble.scale.setScalar(R * 2.03);
  stubble.position.set(0, hy, 0);
  g.add(stubble);
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std('#3a1d18', 0.8));
  mouth.scale.set(R * 0.42, R * 0.2, R * 0.12);
  mouth.position.set(0, hy - R * 0.38, R * 0.9);
  g.add(mouth);
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(R * 0.3, R * 0.05, R * 0.04), std('#f1ece2', 0.5));
  teeth.position.set(0, hy - R * 0.36, R * 0.93);
  g.add(teeth);
  // The headset: an ear pad, a boom along his left cheek (as in the photo), the
  // mic at the corner of the mouth. The figure faces +z, so his left is +x.
  const skinish = std('#dcc9b4', 0.5);
  const boomPath = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(R * 0.98, hy - R * 0.05, R * 0.05),
    new THREE.Vector3(R * 0.95, hy - R * 0.45, R * 0.65),
    new THREE.Vector3(R * 0.42, hy - R * 0.42, R * 0.95),
  );
  g.add(new THREE.Mesh(new THREE.TubeGeometry(boomPath, 12, R * 0.035, 6), skinish));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(R * 0.09, 10, 8), std('#e9dfd1', 0.5));
  tip.position.copy(boomPath.getPoint(1));
  g.add(tip);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(R * 0.12, 10, 8), skinish);
  pad.position.set(R * 0.98, hy - R * 0.02, R * 0.02);
  g.add(pad);
  // The collar: tipped orange / grey / white / grey, and orange piping inside.
  const olive = std('#4a4c40', 0.85);
  const bands: Array<[string, number]> = [
    ['#e8a01c', 0.0],
    ['#6b6d62', 0.012],
    ['#f2efe9', 0.024],
    ['#6b6d62', 0.036],
  ];
  for (const [col, dy] of bands) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(halfW * 1.25, H * 0.011, front * 2 + 0.01), std(col, 0.7));
    band.position.set(0, shoulder + H * (0.004 + dy), 0);
    g.add(band);
  }
  const collarTop = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.62, H * 0.05, 14, 1, true), olive);
  collarTop.position.set(0, shoulder + H * 0.07, 0);
  g.add(collarTop);
  const piping = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, R * 0.03, 6, 16), std('#e8a01c', 0.6));
  piping.rotation.x = Math.PI / 2;
  piping.position.set(0, shoulder + H * 0.095, 0);
  g.add(piping);
  // Placket buttons, and DEVOXX on his left chest.
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(H * 0.006, 6, 4), std('#2a2622', 0.4));
    b.position.set(0, shoulder - H * (0.025 + i * 0.03), front + 0.003);
    g.add(b);
  }
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 0.8, halfW * 0.2),
    new THREE.MeshStandardMaterial({ map: chestLogo(), transparent: true, roughness: 0.8 }),
  );
  logo.position.set(halfW * 0.5, shoulder - H * 0.1, front + 0.004);
  g.add(logo);
  const hair = std('#8d8983', 0.95);
  const skin = std('#d9a07c', 0.8);
  return { group: g, hair, skin };
}

export interface People3D {
  update(snap: GameSnapshot, t: number): void;
}

export function createPeople(parent: THREE.Object3D): People3D {
  const models: PersonModel[] = [];
  const portraits = new Map<PersonModel, Portrait>();
  return {
    update(snap: GameSnapshot, t: number): void {
      const people = snap.people ?? [];
      const plates = snap.plates ?? [];
      for (let i = 0; i < people.length; i++) {
        let pm = models[i];
        if (!pm) {
          pm = buildPerson();
          pm.root.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          models.push(pm);
          parent.add(pm.root);
        }
        pm.root.visible = true;
        const p = people[i];
        pm.pose({ ...p, colour: p.colour ?? ROLE_COLOR[p.role] ?? ROLE_COLOR.visitor }, riseAt(p.x, p.y, plates), t);
        const yaw = pm.root.children[0] as THREE.Group;
        let pt = portraits.get(pm);
        if (p.role === 'stephan') {
          const head = yaw.getObjectByName('head') as THREE.Mesh;
          const torso = yaw.getObjectByName('torso') as THREE.Mesh;
          if (!pt) {
            pt = buildPortrait(head, torso);
            yaw.add(pt.group);
            portraits.set(pm, pt);
          }
          pt.group.visible = true;
          // The far-camera stand-ins give way to the close-up versions.
          for (const n of ['glasses', 'mic', 'collar']) (yaw.getObjectByName(n) as THREE.Object3D).visible = false;
          const hair = yaw.getObjectByName('hair') as THREE.Mesh;
          const R = head.scale.x / 2;
          hair.material = pt.hair;
          head.material = pt.skin;
          // Short at the sides, fuller on top.
          hair.scale.set(R * 1.98, R * 1.25, R * 1.98);
          hair.position.y = head.position.y + R * 0.5;
        } else if (pt) pt.group.visible = false;
      }
      for (let i = people.length; i < models.length; i++) models[i].root.visible = false;
    },
  };
}
