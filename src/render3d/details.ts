/**
 * details.ts — the small stuff that makes a set look lived in.
 *
 * The render pipeline got the light right; what still separated a screenshot
 * from a shipped game was density: every real wall has stickers on it, a fire
 * extinguisher, a camera watching it, cables along the top; every cinema floor
 * has popcorn on it. None of it is gameplay, so none of it is in the sim — and
 * none of it may stand where a robot can walk, because nothing here collides.
 * It therefore lives ON the walls, above robot height, or flat on the floor.
 *
 * Placement reads the sim's own doors and columns (`freeSpans`), so a sticker
 * never lands in a doorway or behind a column.
 */

import * as THREE from 'three';

import { CY0, CY1, F1, floor1Walls, roomDoor, rooms } from '../sim/geometry';
import { m } from '../sim/units';

import type { Materials } from './materials';
import { withReflection } from './materials';
import { mergeStatic, noMerge } from './merge';
import type { PlanarReflection } from './reflector';
import { HEIGHTS, X_END } from './venue';

type Side = -1 | 1;

/** Sim-x intervals of the corridor wall on `side` that nothing else uses. */
export function freeSpans(side: Side, taken: Array<[number, number, Side]> = []): Array<[number, number]> {
  const blocked: Array<[number, number]> = [];
  for (const r of rooms) {
    if (r.x + r.w > X_END || r.side !== side) continue;
    const d = roomDoor(r);
    blocked.push([d.x - 6, d.x + d.w + 6]);
    blocked.push([d.x - 26, d.x - 10]); // the Zaal panel
  }
  // The real corridor columns from the plan (the old guess, "one at each room
  // edge", left an ad screen half behind one), with a margin for their plinths.
  const mid = (CY0 + CY1) / 2;
  for (const c of floor1Walls()) {
    if (c.kind !== 'corridor-column') continue;
    if ((c.y + c.h / 2 < mid ? -1 : 1) !== side) continue;
    blocked.push([c.x - 8, c.x + c.w + 8]);
  }
  if (side > 0) blocked.push([F1.foyer.x - 6, F1.foyer.x + F1.foyer.w + 6]);
  const n = side < 0 ? F1.nicheTop : F1.nicheBot;
  blocked.push([n.x - 8, n.x + n.w + 8]);
  blocked.push([F1.fireX - 30, F1.fireX + 30]);
  blocked.push([X_END - 30, X_END + 40]);
  for (const [a, b, s] of taken) if (s === side) blocked.push([a, b]);
  blocked.sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let x = 8;
  for (const [a, b] of blocked) {
    if (a > x + 6) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (X_END - 30 > x + 6) out.push([x, X_END - 30]);
  return out;
}

let seed = 1234;
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

/* ------------------------------------------------------------- sticker atlas */

const STICKERS = 16;

function stickerAtlas(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S * 4;
  const x = c.getContext('2d')!;
  const g = document.createElement('canvas');
  g.width = S * 4;
  g.height = S * 4;
  const gx = g.getContext('2d')!;
  gx.fillStyle = '#000';
  gx.fillRect(0, 0, g.width, g.height);
  const cell = (i: number, draw: (x: CanvasRenderingContext2D) => void, glow = false): void => {
    const cx = (i % 4) * S;
    const cy = Math.floor(i / 4) * S;
    for (const [ctx, on] of [
      [x, true],
      [gx, glow],
    ] as Array<[CanvasRenderingContext2D, boolean]>) {
      if (!on) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.rect(0, 0, S, S);
      ctx.clip();
      draw(ctx);
      ctx.restore();
    }
  };
  const txt = (ctx: CanvasRenderingContext2D, t: string, y: number, size: number, col: string, font = 'bold', fam = '"Arial Black", Arial, sans-serif'): void => {
    ctx.fillStyle = col;
    ctx.font = `${font} ${size}px ${fam}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, S / 2, y);
  };
  // 0 Devoxx hexagon
  cell(0, (c2) => {
    c2.fillStyle = '#ff7a1a';
    c2.beginPath();
    for (let k = 0; k < 6; k++) c2.lineTo(128 + 110 * Math.cos((k * Math.PI) / 3), 128 + 110 * Math.sin((k * Math.PI) / 3));
    c2.fill();
    txt(c2, 'DEVOXX', 128, 40, '#fff');
  });
  // 1 I <3 JVM
  cell(1, (c2) => {
    c2.fillStyle = '#f2f2f2';
    c2.fillRect(20, 60, 216, 136);
    txt(c2, 'I ♥ JVM', 128, 44, '#d0021b');
  });
  // 2 coffee cup
  cell(2, (c2) => {
    c2.fillStyle = '#e76f00';
    c2.beginPath();
    c2.arc(128, 128, 110, 0, Math.PI * 2);
    c2.fill();
    c2.fillStyle = '#fff';
    c2.fillRect(78, 100, 80, 70);
    c2.strokeStyle = '#fff';
    c2.lineWidth = 10;
    c2.beginPath();
    c2.arc(165, 135, 20, -1.2, 1.2);
    c2.stroke();
  });
  // 3 QR-ish
  cell(3, (c2) => {
    c2.fillStyle = '#fff';
    c2.fillRect(28, 28, 200, 200);
    c2.fillStyle = '#000';
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if (rnd() > 0.5) c2.fillRect(40 + i * 15, 40 + j * 15, 15, 15);
    for (const [a, b] of [
      [40, 40],
      [160, 40],
      [40, 160],
    ])
      c2.fillRect(a, b, 45, 45);
  });
  // 4 "Stephan was here" tag, UV-reactive
  cell(
    4,
    (c2) => {
      c2.save();
      c2.translate(128, 128);
      c2.rotate(-0.2);
      c2.fillStyle = '#39ff14';
      c2.font = 'italic bold 54px "Brush Script MT", "Comic Sans MS", cursive';
      c2.textAlign = 'center';
      c2.fillText('Stephan', 0, -10);
      c2.font = 'italic 30px "Comic Sans MS", cursive';
      c2.fillText('was here', 10, 34);
      c2.restore();
    },
    true,
  );
  // 5 404
  cell(5, (c2) => {
    c2.fillStyle = '#111';
    c2.fillRect(18, 70, 220, 116);
    txt(c2, '404', 118, 70, '#ff2a6d');
    txt(c2, 'SEAT NOT FOUND', 166, 18, '#ddd', 'bold', 'Arial, sans-serif');
  });
  // 6 robot doodle, UV-reactive
  cell(
    6,
    (c2) => {
      c2.strokeStyle = '#05d9e8';
      c2.lineWidth = 8;
      c2.strokeRect(80, 60, 96, 70);
      c2.strokeRect(96, 130, 64, 70);
      c2.beginPath();
      c2.arc(108, 95, 9, 0, 7);
      c2.arc(148, 95, 9, 0, 7);
      c2.moveTo(128, 60);
      c2.lineTo(128, 30);
      c2.stroke();
    },
    true,
  );
  // 7 Kotlin-ish K
  cell(7, (c2) => {
    const gr = c2.createLinearGradient(0, 0, 256, 256);
    gr.addColorStop(0, '#7f52ff');
    gr.addColorStop(1, '#e44857');
    c2.fillStyle = gr;
    c2.beginPath();
    c2.moveTo(40, 40);
    c2.lineTo(216, 40);
    c2.lineTo(128, 128);
    c2.lineTo(216, 216);
    c2.lineTo(40, 216);
    c2.fill();
  });
  // 8 NULL
  cell(8, (c2) => {
    c2.fillStyle = '#fcee0a';
    c2.fillRect(30, 80, 196, 96);
    txt(c2, 'null', 128, 60, '#000', 'bold', 'monospace');
  });
  // 9 arrow tag, UV-reactive
  cell(
    9,
    (c2) => {
      c2.strokeStyle = '#ff2a6d';
      c2.lineWidth = 16;
      c2.lineCap = 'round';
      c2.beginPath();
      c2.moveTo(30, 150);
      c2.quadraticCurveTo(128, 60, 210, 120);
      c2.moveTo(210, 120);
      c2.lineTo(170, 90);
      c2.moveTo(210, 120);
      c2.lineTo(175, 150);
      c2.stroke();
    },
    true,
  );
  // 10 "keynote TBA" flyer
  cell(10, (c2) => {
    c2.fillStyle = '#e9e4d6';
    c2.fillRect(40, 20, 176, 216);
    txt(c2, 'KEYNOTE', 70, 30, '#222');
    txt(c2, 'TBA', 130, 64, '#c81d25');
    txt(c2, 'ask Stephan', 196, 18, '#444', 'italic', 'Georgia, serif');
  });
  // 11 soup sticker
  cell(11, (c2) => {
    c2.fillStyle = '#c81d25';
    c2.beginPath();
    c2.arc(128, 128, 104, 0, 7);
    c2.fill();
    txt(c2, 'SOUP', 112, 46, '#fff');
    txt(c2, 'at 12:30', 160, 24, '#ffd6d6', 'bold', 'Arial, sans-serif');
  });
  // 12 "WET FLOOR"
  cell(12, (c2) => {
    c2.fillStyle = '#f2c200';
    c2.beginPath();
    c2.moveTo(128, 20);
    c2.lineTo(236, 220);
    c2.lineTo(20, 220);
    c2.fill();
    txt(c2, '!', 150, 110, '#111');
  });
  // 13 dripping tag, UV-reactive
  cell(
    13,
    (c2) => {
      c2.fillStyle = '#fcee0a';
      c2.font = 'bold 70px "Impact", sans-serif';
      c2.textAlign = 'center';
      c2.fillText('GC!', 128, 120);
      for (let k = 0; k < 6; k++) c2.fillRect(70 + k * 22, 120, 5, 30 + rnd() * 80);
    },
    true,
  );
  // 14 "No food beyond this point"
  cell(14, (c2) => {
    c2.fillStyle = '#fff';
    c2.beginPath();
    c2.arc(128, 128, 100, 0, 7);
    c2.fill();
    c2.strokeStyle = '#d0021b';
    c2.lineWidth = 18;
    c2.beginPath();
    c2.arc(128, 128, 92, 0, 7);
    c2.moveTo(64, 64);
    c2.lineTo(192, 192);
    c2.stroke();
    txt(c2, '🍿', 128, 70, '#000', '', 'sans-serif');
  });
  // 15 slap tag, UV-reactive
  cell(
    15,
    (c2) => {
      c2.strokeStyle = '#b026ff';
      c2.lineWidth = 12;
      c2.beginPath();
      for (let k = 0; k < 5; k++) {
        c2.moveTo(40 + k * 36, 180);
        c2.lineTo(60 + k * 36, 80);
      }
      c2.stroke();
    },
    true,
  );
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const glow = new THREE.CanvasTexture(g);
  glow.colorSpace = THREE.SRGBColorSpace;
  return { map, glow };
}

/* ------------------------------------------------------------------- build */

export interface Details {
  group: THREE.Group;
  /** Surfaces that sample the floor reflection: hidden while it is rendered. */
  reflectors: THREE.Object3D[];
  update(t: number): void;
}

export function buildDetails(mats: Materials, refl: PlanarReflection, taken: Array<[number, number, Side]>): Details {
  const group = new THREE.Group();
  group.name = 'details';
  const updaters: Array<(t: number) => void> = [];
  const reflectors: THREE.Object3D[] = [];
  seed = 1234;
  const c0 = m(CY0);
  const c1 = m(CY1);

  // Lacquered wall panels between the battens: dark, glossy, clear-coated, so
  // every neon in the corridor streaks across them (the box-projected probe
  // puts each reflection where its emitter really is).
  {
    const lacquer = new THREE.MeshPhysicalMaterial({
      color: 0x0b0c10,
      roughness: 0.32,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.6,
    });
    const quadsP: THREE.BufferGeometry[] = [];
    const doorBlocked = (side: Side, x: number): boolean => {
      for (const r of rooms) {
        if (r.x + r.w > X_END || r.side !== side) continue;
        const d = roomDoor(r);
        if (x > d.x - 8 && x < d.x + d.w + 8) return true;
      }
      const n = side < 0 ? F1.nicheTop : F1.nicheBot;
      if (x > n.x - 8 && x < n.x + n.w + 8) return true;
      if (x > F1.fireX - 12 && x < F1.fireX + 26) return true;
      if (side > 0 && x > F1.foyer.x - 6 && x < F1.foyer.x + F1.foyer.w + 6) return true;
      return x > X_END - 20;
    };
    for (const side of [-1, 1] as Side[]) {
      const z = side < 0 ? c0 + 0.018 : c1 - 0.018;
      for (let x0 = 12; x0 + 30 <= X_END; x0 += 30) {
        const a = x0 + 1;
        const b2 = x0 + 29;
        if (doorBlocked(side, a) || doorBlocked(side, b2) || doorBlocked(side, (a + b2) / 2)) continue;
        const g = new THREE.PlaneGeometry(m(b2 - a), HEIGHTS.cove - 0.75);
        if (side > 0) g.rotateY(Math.PI);
        g.translate(m((a + b2) / 2), 0.3 + (HEIGHTS.cove - 0.75) / 2, z);
        quadsP.push(g);
      }
    }
    if (quadsP.length) {
      const mesh = new THREE.Mesh(mergeAll(quadsP), lacquer);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // Stickers and graffiti on free wall spans: printed ones lit by the room,
  // the tags in UV-reactive paint glowing faintly on their own.
  const { map, glow } = stickerAtlas();
  const stickerMat = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: glow,
    emissive: new THREE.Color(1, 1, 1),
    // Kept low: a glowing tag reads as a puzzle hint (playtest asked what the
    // red arrow was for).
    emissiveIntensity: 0.25,
    roughness: 0.55,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  // The atlas has no alpha: derive it from the drawn colour's luminance-ish.
  stickerMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       diffuseColor.a = smoothstep(.02, .08, max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b));`,
    );
  };
  const quads: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as Side[]) {
    const z = side < 0 ? c0 + 0.035 : c1 - 0.035;
    for (const [a, b] of freeSpans(side, taken)) {
      const n = Math.floor((b - a) / 14);
      for (let k = 0; k < n; k++) {
        let idx = Math.floor(rnd() * STICKERS);
        if (idx === 9) idx = 8; // no arrows: an arrow on a puzzle map is a hint
        const size = 0.18 + rnd() * (idx % 4 === 0 ? 0.6 : 0.25);
        const sx = m(a + 3 + rnd() * (b - a - 6));
        const sy = 0.5 + rnd() * 1.9;
        const g = new THREE.PlaneGeometry(size, size);
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        const u0 = (idx % 4) / 4;
        const v0 = 1 - (Math.floor(idx / 4) + 1) / 4;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 4);
        g.rotateZ((rnd() - 0.5) * 0.5);
        if (side > 0) g.rotateY(Math.PI);
        g.translate(sx, sy, z);
        quads.push(g);
      }
    }
  }
  if (quads.length) {
    const merged = mergeAll(quads);
    const mesh = new THREE.Mesh(merged, stickerMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Fire extinguisher cabinets (red, glass front, a Dutch label).
  const cabGeo = new THREE.BoxGeometry(0.42, 0.72, 0.2);
  const cabMat = new THREE.MeshPhysicalMaterial({ color: 0xa40c0c, roughness: 0.35, clearcoat: 0.6 });
  const ext = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 14);
  const extMat = new THREE.MeshPhysicalMaterial({ color: 0xd11a0e, roughness: 0.25, clearcoat: 1 });
  for (const [x, side] of [
    [95, -1],
    [260, -1],
    [560, 1],
  ] as Array<[number, Side]>) {
    const zf = side < 0 ? c0 + 0.1 : c1 - 0.1;
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(m(x), 1.55, zf);
    const e = new THREE.Mesh(ext, extMat);
    e.position.set(m(x), 1.5, zf + (side < 0 ? 0.05 : -0.05));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.64), mats.glass);
    front.position.set(m(x), 1.55, zf + (side < 0 ? 0.105 : -0.105));
    if (side > 0) front.rotation.y = Math.PI;
    group.add(cab, e, front);
  }

  // CCTV at cove height, every other bay, each with a slow-blinking red LED.
  const camBody = new THREE.BoxGeometry(0.34, 0.14, 0.14);
  const camMat = new THREE.MeshPhysicalMaterial({ color: 0xd8d8d4, roughness: 0.4 });
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0, 0).multiplyScalar(20), toneMapped: false });
  for (const [x, side] of [
    [60, 1],
    [300, -1],
    [520, 1],
  ] as Array<[number, Side]>) {
    const zf = side < 0 ? c0 + 0.3 : c1 - 0.3;
    const cam = new THREE.Group();
    const body = new THREE.Mesh(camBody, camMat);
    body.rotation.z = -0.35;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), mats.darkMetal);
    arm.rotation.x = Math.PI / 2;
    arm.position.z = side < 0 ? -0.15 : 0.15;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), ledMat);
    led.position.set(0.16, -0.05, 0);
    noMerge(led);
    cam.add(body, arm, led);
    cam.position.set(m(x), HEIGHTS.cove - 0.35, zf);
    cam.rotation.y = side < 0 ? -0.6 : 0.6 + Math.PI;
    group.add(cam);
    updaters.push((t) => (led.visible = Math.sin(t * 2 + x) > 0.2));
  }

  // A cable tray along the north cove: a steel channel and three sagging cables.
  {
    const len = m(X_END) - 1;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.28), mats.steel);
    tray.position.set(len / 2 + 0.5, HEIGHTS.cove - 0.5, c0 + 0.4);
    tray.castShadow = true;
    group.add(tray);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.6 });
    for (let k = 0; k < 3; k++) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const x = 0.5 + (len * i) / 60;
        const sag = Math.abs(Math.sin((i / 60) * Math.PI * 9)) * (0.05 + 0.03 * k);
        pts.push(new THREE.Vector3(x, HEIGHTS.cove - 0.46 - sag + k * 0.01, c0 + 0.32 + k * 0.08));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.018 + k * 0.006, 6), cableMat);
      group.add(tube);
    }
    // Brackets.
    for (let x = 1; x < len; x += 3) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.3), mats.darkMetal);
      br.position.set(x, HEIGHTS.cove - 0.35, c0 + 0.2);
      group.add(br);
    }
  }

  // Vent grilles high on the walls.
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.6 });
  for (const side of [-1, 1] as Side[]) {
    for (const [a, b] of freeSpans(side, taken)) {
      if (b - a < 30) continue;
      const x = m((a + b) / 2);
      const z = side < 0 ? c0 + 0.045 : c1 - 0.045;
      const vent = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.05), ventMat);
      vent.add(frame);
      for (let k = 0; k < 7; k++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.025, 0.06), mats.darkMetal);
        slat.position.set(0, -0.18 + k * 0.06, 0.02);
        slat.rotation.x = 0.6;
        vent.add(slat);
      }
      vent.position.set(x, 3.3, z);
      if (side > 0) vent.rotation.y = Math.PI;
      group.add(vent);
    }
  }

  // Floor: popcorn round the kiosk, trodden tickets, and two spills of cola
  // that the floor's reflection turns into black mirrors.
  {
    const k = F1.kiosk;
    const kernels = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.025, 0), new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 0.95, envMapIntensity: 0.2 }), 260);
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 2.2 + Math.pow(rnd(), 2) * 2.2;
      const x = m(k.x + k.w / 2) + Math.cos(a) * r;
      const z = m(k.y + k.h / 2) + Math.sin(a) * r;
      kernels.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.018, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, 0)), new THREE.Vector3(1, 0.8, 1)));
    }
    kernels.receiveShadow = true;
    group.add(kernels);
    const ticketMat = new THREE.MeshStandardMaterial({ color: 0xe8d6c8, roughness: 0.8 });
    const tickets = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.07).rotateX(-Math.PI / 2), ticketMat, 24);
    for (let i = 0; i < 24; i++) {
      const x = m(20 + rnd() * (X_END - 60));
      const z = m(CY0 + 20 + rnd() * (CY1 - CY0 - 40));
      tickets.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.004, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(1, 1, 1)));
    }
    tickets.receiveShadow = true;
    group.add(tickets);
    const puddleMat = new THREE.MeshPhysicalMaterial({ color: 0x050303, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    withReflection(puddleMat, refl, 1.6, 0.004);
    for (const [px, pz, s] of [
      [m(k.x + k.w / 2) + 2.6, m(CY1) - 1.6, 1.3],
      [m(470), m((CY0 + CY1) / 2) - 1.5, 0.9],
    ]) {
      const shape = new THREE.Shape();
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const r = s * (0.7 + 0.3 * Math.sin(a * 3 + px) + 0.15 * Math.sin(a * 7 + pz));
        const vx = Math.cos(a) * r * 1.4;
        const vy = Math.sin(a) * r;
        if (i === 0) shape.moveTo(vx, vy);
        else shape.lineTo(vx, vy);
      }
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      const p = new THREE.Mesh(g, puddleMat);
      p.position.set(px, 0.003, pz);
      p.receiveShadow = true;
      group.add(p);
      reflectors.push(noMerge(p));
    }
    // A cup on its side by the first spill.
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.16, 16), new THREE.MeshPhysicalMaterial({ color: 0xc8102e, roughness: 0.4, clearcoat: 0.5 }));
    cup.rotation.z = Math.PI / 2;
    cup.rotation.y = 0.7;
    cup.position.set(m(k.x + k.w / 2) + 1.4, 0.05, m(CY1) - 1.2);
    group.add(cup);
  }

  // The bar top: a register, a row of glasses, a napkin holder.
  {
    const b = F1.bar;
    const top = 1.16;
    const reg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.35), mats.blackGloss);
    reg.position.set(m(b.x + 10), top + 0.11, m(b.y + b.h / 2));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1).multiplyScalar(2.5), toneMapped: false }));
    screen.position.set(m(b.x + 10), top + 0.3, m(b.y + b.h / 2) + 0.06);
    screen.rotation.x = -0.4;
    group.add(reg, screen);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.25, depthWrite: false, envMapIntensity: 2 });
    for (let i = 0; i < 6; i++) {
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 14, 1, true), glassMat);
      gl.position.set(m(b.x + 30 + i * 5), top + 0.06, m(b.y + b.h / 2) + (i % 2 ? 0.15 : -0.1));
      group.add(gl);
    }
  }

  mergeStatic(group);
  return {
    group,
    reflectors,
    update(t: number): void {
      for (const u of updaters) u(t);
    },
  };
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Plane geometries share one layout; a manual merge avoids pulling in utils here.
  let count = 0;
  for (const g of list) count += (g.index ? g.index.count : g.getAttribute('position').count);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const u = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++, o++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], o * 3);
      nor.set([n.getX(i), n.getY(i), n.getZ(i)], o * 3);
      uv.set([u.getX(i), u.getY(i)], o * 2);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
