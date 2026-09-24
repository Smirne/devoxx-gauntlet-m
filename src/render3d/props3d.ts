/**
 * props3d.ts — chapter 1's moving parts, drawn from `GameSnapshot.props` and
 * `GameSnapshot.clues`.
 *
 * Each prop is built the first time the sim publishes it and then only READ
 * each frame: a state string, a label, a `progress` clock. The fire shutter
 * rolls up when its state says open, the jammed door falls on its own clock,
 * the keypad's LCD shows what the sim says was typed. No rule lives here.
 */

import * as THREE from 'three';

import { CY0, CY1, floor1Walls } from '../sim/geometry';
import { CLUE_SPOT, clueLitBy } from '../sim/lights';
import { DEFS } from '../sim/constants';
import type { Clue, GameSnapshot, Prop, RobotKind } from '../sim/types';
import { m } from '../sim/units';

import type { Materials } from './materials';
import { box } from './materials';
import type { VolumePoint } from './pipeline';
import { clueStencil, digitMask, emitter, exitSign, haloFrame, lcd, notice, parkStencil } from './signs';
import { HEIGHTS, addSeats } from './venue';

export interface Props3D {
  update(snap: GameSnapshot, t: number, dt: number): void;
  /** Solid things the camera should not pass through (closed doors, the shutter). */
  colliders: THREE.Object3D[];
  /** Emitters that change: found clues. */
  volumePoints: VolumePoint[];
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const MID = (CY0 + CY1) / 2;

function lampColour(kind: RobotKind): THREE.Color {
  const c = DEFS[kind].light.c;
  return new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);
}

/* ------------------------------------------------------------------ sparks */

class Sparks {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly n: number;
  constructor(n = 220) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('life', new THREE.BufferAttribute(this.life, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `attribute float life; varying float vL; void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = life > 0. ? (6. + 10. * life) / -mv.z * 6. : 0.; }`,
      fragmentShader: /* glsl */ `varying float vL; void main(){ vec2 d = gl_PointCoord - .5; float a = smoothstep(.5, .0, length(d)); gl_FragColor = vec4(vec3(1., .55, .18) * 40. * vL * a, a); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }
  burst(at: THREE.Vector3, dir: THREE.Vector3): void {
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = at.x + (Math.random() - 0.5) * 3.2;
      this.pos[i * 3 + 1] = at.y + Math.random() * 2.4;
      this.pos[i * 3 + 2] = at.z;
      this.vel[i * 3] = (Math.random() - 0.5) * 5 + dir.x * 4;
      this.vel[i * 3 + 1] = Math.random() * 4;
      this.vel[i * 3 + 2] = (Math.random() - 0.2) * 5 * Math.sign(dir.z || 1);
      this.life[i] = 0.6 + Math.random() * 0.6;
    }
  }
  update(dt: number): void {
    let alive = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      alive = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      if (this.pos[i * 3 + 1] < 0.02) {
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3 + 1] *= -0.35;
        this.vel[i * 3] *= 0.6;
        this.vel[i * 3 + 2] *= 0.6;
      }
    }
    if (alive) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.life.needsUpdate = true;
    }
  }
}

/* -------------------------------------------------------------------- make */

function doorPair(mats: Materials, width: number): THREE.Group {
  const g = new THREE.Group();
  const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x2a0d10, roughness: 0.55, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0.5, 0.2, 0.2) });
  const H = HEIGHTS.door - 0.05;
  const lw = width / 2 - 0.02;
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(lw, H, 0.09), leafMat);
    slab.position.set(-(s * lw) / 2, H / 2, 0);
    // Tufted buttons: a grid of small studs on both faces.
    const studs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 4), mats.steel, 2 * 5 * 8);
    let k = 0;
    for (const face of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 8; j++) {
          studs.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(-(s * lw) / 2 + (i - 2) * lw * 0.18, 0.35 + j * 0.28, face * 0.05));
        }
      }
    }
    const kick = new THREE.Mesh(new THREE.BoxGeometry(lw - 0.06, 0.3, 0.1), mats.steel);
    kick.position.set(-(s * lw) / 2, 0.17, 0);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, lw * 0.7, 10), mats.steel);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(-(s * lw) / 2, 1.05, 0.1);
    const bar2 = bar.clone();
    bar2.position.z = -0.1;
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 24), mats.blackGloss);
    port.rotation.x = Math.PI / 2;
    port.position.set(-(s * lw) / 2, 1.7, 0);
    leaf.add(slab, studs, kick, bar, bar2, port);
    leaf.traverse((o) => {
      (o as THREE.Mesh).castShadow = true;
      (o as THREE.Mesh).receiveShadow = true;
    });
    // Hinged at the frame, not the middle of the doorway, so it can swing.
    leaf.position.x = s * (width / 2);
    leaf.userData.side = s;
    g.add(leaf);
  }
  return g;
}

function shutter(mats: Materials, depth: number): THREE.Group {
  // A corrugated steel fire shutter across the whole corridor, rolled from a
  // drum housing under the ceiling.
  const g = new THREE.Group();
  const H = 4.3;
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
  const drum = new THREE.Mesh(box(0.9, HEIGHTS.corridor - H, depth + 0.4, V(0.1, H + (HEIGHTS.corridor - H) / 2, 0)), mats.enamel);
  drum.castShadow = true;
  g.add(drum);
  for (const s of [-1, 1]) {
    const guide = new THREE.Mesh(box(0.3, H, 0.25, V(0, H / 2, (s * depth) / 2)), mats.darkMetal);
    g.add(guide);
  }
  return g;
}

export function createProps(parent: THREE.Object3D, mats: Materials): Props3D {
  const byKey = new Map<string, THREE.Object3D>();
  const colliders: THREE.Object3D[] = [];
  const volumePoints: VolumePoint[] = [];
  /** Emitters that exist from the moment their prop is built. */
  const staticPoints: VolumePoint[] = [];
  const sparks = new Sparks();
  parent.add(sparks.points);
  let seatsBuilt = false;
  const lcdTex = lcd();
  let lcdText = '';
  let jamLast = 0;
  const shutterLift = { v: 0 };
  const panelLed = new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false });
  type ClueObj = { root: THREE.Group; digit: THREE.Mesh; leds: THREE.Mesh[]; light: THREE.PointLight; mix: THREE.Color; decal: THREE.Mesh; digitText: string; solved: boolean };
  const clueObjs = new Map<number, ClueObj>();
  const fireLeaves = new Map<string, THREE.Group>();
  const stencil = clueStencil();

  function key(p: Prop): string {
    return `${p.kind}:${Math.round(p.x)}:${Math.round(p.y)}`;
  }

  function build(p: Prop): THREE.Object3D | null {
    switch (p.kind) {
      case 'firedoor': {
        const depth = m(p.h ?? 130);
        const s = shutter(mats, depth);
        s.position.set(m(p.x + (p.w ?? 14) / 2), 0, m(p.y + (p.h ?? 130) / 2));
        colliders.push(s.userData.curtain as THREE.Object3D);
        // The sim's fixed screen either side of the opening ('firescreen'): it
        // seals the corridor wall to wall. Without it the corridor looked open
        // beside the door (playtest: "a passage you can't go through").
        const zMid = m(p.y + (p.h ?? 130) / 2);
        const H = HEIGHTS.corridor;
        for (const [a, b] of [[CY0, p.y], [p.y + (p.h ?? 130), CY1]] as Array<[number, number]>) {
          if (b - a < 1) continue;
          const len = m(b - a);
          const zc = m((a + b) / 2) - zMid;
          const panel = new THREE.Mesh(box(0.3, H, len, V(0, H / 2, zc)), mats.enamel);
          panel.castShadow = true;
          panel.receiveShadow = true;
          const post = new THREE.Mesh(box(0.36, H, 0.14, V(0, H / 2, zc + (a === CY0 ? len / 2 : -len / 2))), mats.steel);
          s.add(panel, post);
          colliders.push(panel);
        }
        return s;
      }
      case 'keypad': {
        const g = new THREE.Group();
        const w = m(p.w ?? 8);
        const d = m(p.h ?? 24);
        const ped = new THREE.Mesh(box(w, 1.05, d, V(0, 0.525, 0)), mats.enamel);
        ped.castShadow = true;
        ped.receiveShadow = true;
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.5), mats.darkMetal);
        face.position.set(-w / 2 - 0.02, 1.35, 0);
        face.rotation.z = 0.25;
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshBasicMaterial({ map: lcdTex.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(3), toneMapped: false }));
        screen.position.set(-w / 2 - 0.05, 1.56, 0);
        screen.rotation.y = -Math.PI / 2;
        screen.rotation.x = 0;
        const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.07, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.9, 1).multiplyScalar(4), toneMapped: false }), 12);
        for (let i = 0; i < 12; i++) keys.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-w / 2 - 0.06, 1.42 - Math.floor(i / 3) * 0.1, -0.1 + (i % 3) * 0.1));
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), panelLed.clone());
        led.position.set(-w / 2 - 0.05, 1.68, 0.18);
        g.add(ped, face, screen, keys, led);
        g.userData.led = led;
        g.position.set(m(p.x + (p.w ?? 8) / 2), 0, m(p.y + (p.h ?? 24) / 2));
        const kl = new THREE.PointLight(0x40e0ff, 12, 3.5, 2);
        kl.position.set(-0.6, 1.5, 0);
        g.add(kl);
        return g;
      }
      case 'projector-panel': {
        const g = new THREE.Group();
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.14), mats.enamel);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), panelLed.clone());
        led.position.set(0.28, 0.2, 0.08);
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), mats.steel);
        lever.position.set(-0.2, 0, 0.1);
        const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 8), mats.steel);
        conduit.position.set(0.3, -2.0, 0.02);
        // The panel has to read as the goal from across the corridor: a
        // pulsing frame round it and a parking ring on the floor below, amber
        // until it is thrown, then green (playtest: "I don't know where I
        // should reach").
        const halo = emitter(haloFrame(), 1.5, 1.2, 6, 0xffa020);
        halo.position.z = 0.09;
        const ring = new THREE.Mesh(
          new THREE.PlaneGeometry(2.6, 2.6),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.12).multiplyScalar(1.4), alphaMap: parkStencil(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        // Arrow toward the wall (north, -z): texture "up" is -z once laid flat.
        ring.position.set(0, -3.35 + 0.013, m(p.y + (p.h ?? 24) / 2) - m(CY0) - 0.08);
        g.add(housing, led, lever, conduit, halo, ring);
        g.userData.led = led;
        g.userData.lever = lever;
        g.userData.halo = halo;
        g.userData.ring = ring;
        // On the corridor face of the column it shares a spot with: flat on
        // the wall it sat inside the column and could not be seen at all.
        let face = CY0;
        for (const w of floor1Walls()) {
          if (w.kind === 'corridor-column' && w.y < CY0 + 40 && w.x < p.x + (p.w ?? 20) && w.x + w.w > p.x) face = Math.max(face, w.y + w.h);
        }
        g.position.set(m(p.x + (p.w ?? 20) / 2), 3.35, m(face) + 0.08);
        ring.position.z = Math.max(1.4, m(p.y + (p.h ?? 24) / 2) - m(face) - 0.08);
        return g;
      }
      case 'alcove': {
        const g = new THREE.Group();
        const ex = emitter(exitSign(), 0.8, 0.3, 5, 0xffffff, false);
        ex.position.set(m(p.x + (p.w ?? 40) / 2), 2.9, m(p.y) - 0.1);
        ex.rotation.y = Math.PI;
        g.add(ex);
        const gl = new THREE.PointLight(0x30ff70, 16, 6, 2);
        gl.position.set(m(p.x + (p.w ?? 40) / 2), 2.4, m(p.y + 20));
        g.add(gl);
        staticPoints.push({ position: gl.position.clone(), color: new THREE.Color(0.1, 1, 0.3).multiplyScalar(0.6), range: 3 });
        return g;
      }
      case 'lock':
      case 'jammed': {
        const d = doorPair(mats, m(p.w ?? 46));
        d.position.set(m(p.x + (p.w ?? 46) / 2), 0, m(p.y + (p.h ?? 6) / 2));
        colliders.push(d);
        return d;
      }
      case 'poster': {
        const top = p.y < MID;
        const n = emitter(notice(p.label ?? ''), 0.6, 0.75, 1, 0xffffff, false);
        (n.material as THREE.MeshBasicMaterial).color.setScalar(0.08);
        // A sheet of paper is lit, not an emitter: swap for a lit material.
        // A faint self-glow (map-driven) keeps it readable in the dark, like
        // paper catching the corridor's spill.
        const map = (n.material as THREE.MeshBasicMaterial).map;
        n.material = new THREE.MeshStandardMaterial({ map, roughness: 0.85, emissive: new THREE.Color(0.35, 0.34, 0.3), emissiveMap: map });
        n.userData.notice = true;
        n.position.set(m(p.x + (p.w ?? 26) / 2) + 0.55, 1.45, top ? m(p.y + 9) + 0.07 : m(p.y + 3) - 0.07);
        n.rotation.y = top ? 0 : Math.PI;
        n.rotation.z = 0.04;
        return n;
      }
      default:
        return null;
    }
  }

  function buildSeats(props: Prop[]): void {
    const placements: THREE.Matrix4[] = [];
    for (const p of props) {
      if (p.kind !== 'seatrow') continue;
      const w = m(p.w ?? 0);
      const n = Math.floor(w / 0.62);
      if (n < 1) continue;
      const pad = (w - n * 0.62) / 2;
      for (let i = 0; i < n; i++) {
        const mm = new THREE.Matrix4().makeRotationY(Math.PI);
        mm.setPosition(m(p.x) + pad + 0.31 + i * 0.62, 0, m(p.y + (p.h ?? 9) / 2));
        placements.push(mm);
      }
    }
    addSeats(parent, mats, placements);
  }

  function clueObj(c: Clue): ClueObj {
    const root = new THREE.Group();
    root.position.set(m(c.x), 0, m(c.y));
    // Sized from the sim's own tolerance: the ring's outer edge is the patch
    // `clueLitBy` tests (CLUE_SPOT), so light on the ring is light that counts.
    // At 1.5 m it was nearly twice that patch, and a lamp could sit on the ring
    // without lighting the clue (playtest: Voxxy "not considered lighting it").
    // The stencil's circle is 110/128 of the texture's half-width.
    const size = (2 * m(CLUE_SPOT)) / (110 / 128);
    // A standby glow, as the 2.5D plates have: unlit, the ring was black on a
    // black floor and a clue could not be found at all ("I lost hint 3").
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.6, alphaMap: stencil, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, emissive: new THREE.Color(0.55, 0.52, 0.45), emissiveIntensity: 0.25 }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = 0.012;
    decal.receiveShadow = true;
    root.add(decal);
    const mix = new THREE.Color(0, 0, 0);
    const leds: THREE.Mesh[] = [];
    c.need.forEach((k, i) => {
      mix.add(lampColour(k));
      const a = (i / c.need.length) * Math.PI * 2 + Math.PI / 4;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: lampColour(k), toneMapped: false }));
      led.position.set(Math.cos(a) * 0.9, 0.06, Math.sin(a) * 0.9);
      led.userData.kind = k;
      root.add(led);
      leds.push(led);
    });
    mix.multiplyScalar(1 / Math.max(...mix.toArray(), 1e-3));
    const digit = emitter(digitMask(String(c.digit), `POSITION ${c.slot}`), 0.9, 1.12, 12, mix);
    digit.position.y = 1.35;
    digit.visible = false;
    root.add(digit);
    // Invisible until the clue is found: an invisible light costs nothing in
    // the forward shader, a zero-intensity one still costs a loop iteration.
    const light = new THREE.PointLight(mix, 30, 5, 2);
    light.visible = false;
    light.position.y = 1.2;
    root.add(light);
    parent.add(root);
    return { root, digit, leds, light, mix, decal, digitText: String(c.digit), solved: false };
  }

  const _cam = new THREE.Vector3();

  return {
    colliders,
    volumePoints,
    update(snap: GameSnapshot, t: number, dt: number): void {
      if (!seatsBuilt && snap.props.some((p) => p.kind === 'seatrow')) {
        buildSeats(snap.props);
        seatsBuilt = true;
      }
      for (const p of snap.props) {
        const k = key(p);
        let o = byKey.get(k);
        if (o === undefined) {
          o = build(p) ?? new THREE.Object3D();
          byKey.set(k, o);
          parent.add(o);
        }
        switch (p.kind) {
          case 'firedoor': {
            const open = p.state === 'open' ? 1 : 0;
            shutterLift.v += (open - shutterLift.v) * Math.min(1, dt * 0.8);
            const curtain = o.userData.curtain as THREE.Object3D;
            curtain.position.y = shutterLift.v * 4.1;
            curtain.scale.y = 1 - shutterLift.v * 0.95;
            break;
          }
          case 'keypad': {
            const label = p.label ?? '____';
            const ok = p.state === 'done';
            if (label + ok !== lcdText) {
              lcdText = label + ok;
              lcdTex.draw(ok ? 'OPEN' : label, ok);
            }
            const led = o.userData.led as THREE.Mesh;
            (led.material as THREE.MeshBasicMaterial).color.setRGB(ok ? 0.1 : 1, ok ? 1 : 0.05, 0.05).multiplyScalar(ok ? 12 : 6 + 6 * (Math.sin(t * 6) > 0 ? 1 : 0));
            break;
          }
          case 'projector-panel': {
            // Green only once Droid's hand is on it: the sim flips at the key
            // press, the reach takes ~0.6 s to get there (playtest: "the hint
            // colour changes too soon, it should wait until contact").
            if (p.state === 'done' && o.userData.doneAt === undefined) o.userData.doneAt = t;
            const done = p.state === 'done' && t - (o.userData.doneAt as number) > 0.6;
            const led = o.userData.led as THREE.Mesh;
            const blink = done ? 1 : Math.sin(t * 5) > 0 ? 1 : 0.15;
            (led.material as THREE.MeshBasicMaterial).color.setRGB(done ? 0.1 : 1, done ? 1 : 0.05, 0.05).multiplyScalar(14 * blink);
            (o.userData.lever as THREE.Object3D).rotation.z = done ? -0.9 : 0;
            const pulse = done ? 0.5 : 0.55 + 0.45 * Math.sin(t * 3);
            const hm = (o.userData.halo as THREE.Mesh).material as THREE.MeshBasicMaterial;
            hm.color.setRGB(done ? 0.15 : 1, done ? 1 : 0.62, done ? 0.35 : 0.12).multiplyScalar(6 * pulse);
            const rm = (o.userData.ring as THREE.Mesh).material as THREE.MeshBasicMaterial;
            rm.color.setRGB(done ? 0.15 : 1, done ? 1 : 0.6, done ? 0.35 : 0.12).multiplyScalar(done ? 0.4 : 0.9 + 0.6 * pulse);
            break;
          }
          case 'lock': {
            // Cinema B's door swings open on the sim's clock once the panel is
            // thrown (it used to stay shut, and you walked through it).
            if (!o.userData.noteTaken) {
              for (const other of byKey.values()) {
                if (!other.userData.notice || Math.hypot(other.position.x - o.position.x, other.position.z - o.position.z) > 2) continue;
                // Taped to whichever leaf it sits on, so it swings with it.
                const leaf = o.children.reduce((best, l) => (Math.abs(l.getWorldPosition(new THREE.Vector3()).x - other.position.x) < Math.abs(best.getWorldPosition(new THREE.Vector3()).x - other.position.x) ? l : best));
                leaf.attach(other);
                o.userData.noteTaken = true;
              }
            }
            const e = THREE.MathUtils.smoothstep(p.progress ?? 0, 0, 1);
            const roomSign = p.y < (CY0 + CY1) / 2 ? -1 : 1;
            for (const leaf of o.children) leaf.rotation.y = (leaf.userData.side as number) * roomSign * e * 1.45;
            if (e > 0.02) {
              const idx = colliders.indexOf(o);
              if (idx >= 0) colliders.splice(idx, 1);
            }
            break;
          }
          case 'jammed': {
            const prog = p.progress ?? 0;
            // The note taped to the door falls with it (it used to stay hanging
            // in mid-air): re-parent it to the leaf, keeping where it is.
            if (!o.userData.noteTaken) {
              for (const other of byKey.values()) {
                if (other.userData.notice && other.parent !== o && Math.hypot(other.position.x - o.position.x, other.position.z - o.position.z) < 2) {
                  o.attach(other);
                  o.userData.noteTaken = true;
                }
              }
            }
            if (prog > 0 && jamLast <= 0) {
              sparks.burst(o.position.clone().setY(0.4), V(0, 0, 1));
            }
            jamLast = prog;
            // Fall into the room (cinema E is south of the corridor: +z), hinged at the foot.
            const e = prog * prog * (3 - 2 * prog);
            o.rotation.x = e * (Math.PI / 2 - 0.04);
            o.position.y = e * 0.05;
            const idx = colliders.indexOf(o);
            if (prog > 0 && idx >= 0) colliders.splice(idx, 1);
            break;
          }
          default:
            break;
        }
      }
      sparks.update(dt);

      // The fire door's open leaves. In the sim the door is a pair of leaves
      // that swing back along the corridor and stay solid there ('fireleaf'
      // walls, pushed when it opens); the 3D door is a roll-up shutter
      // (Michele kept it). So the two spots get a folded-back steel barrier
      // each, hinged at the door end and swinging out as the shutter lifts:
      // something you can see where the sim has something you bump into.
      for (const w of snap.walls) {
        if (w.kind !== 'fireleaf') continue;
        const key = `fireleaf:${Math.round(w.y)}`;
        let g = fireLeaves.get(key);
        if (!g) {
          g = new THREE.Group();
          const len = m(w.w);
          const panel = new THREE.Mesh(box(len, 2.4, Math.max(0.08, m(w.h) * 0.6), V(-len / 2, 1.2, 0)), mats.enamel);
          panel.castShadow = true;
          panel.receiveShadow = true;
          const rail = new THREE.Mesh(box(len, 0.08, m(w.h) * 0.8, V(-len / 2, 1.1, 0)), mats.steel);
          const stripe = new THREE.Mesh(box(len * 0.98, 0.18, m(w.h) * 0.65, V(-len / 2, 0.2, 0)), new THREE.MeshStandardMaterial({ color: 0xe8b400, roughness: 0.5 }));
          g.add(panel, rail, stripe);
          g.position.set(m(w.x + w.w), 0, m(w.y + w.h / 2));
          g.userData.born = t;
          g.scale.x = 0.001;
          parent.add(g);
          colliders.push(panel);
          fireLeaves.set(key, g);
        }
        const k = Math.min(1, (t - (g.userData.born as number)) / 1.1);
        g.scale.x = Math.max(0.001, k * k * (3 - 2 * k));
      }

      // Clues.
      volumePoints.length = 0;
      volumePoints.push(...staticPoints);
      for (const c of snap.clues) {
        let co = clueObjs.get(c.slot);
        if (!co) {
          co = clueObj(c);
          clueObjs.set(c.slot, co);
        }
        for (const led of co.leds) {
          const lit = clueLitBy(snap.lights, led.userData.kind as RobotKind, c);
          const base = lampColour(led.userData.kind as RobotKind);
          (led.material as THREE.MeshBasicMaterial).color.copy(base).multiplyScalar(c.found ? 10 : lit ? 16 : 0.6 + 0.3 * Math.sin(t * 3 + c.slot));
        }
        co.digit.visible = c.found;
        if (!c.found) (co.decal.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.6 + c.slot));
        if (c.found && !co.solved) {
          co.solved = true;
          const dm = co.decal.material as THREE.MeshStandardMaterial;
          dm.alphaMap = clueStencil(co.digitText);
          dm.color.copy(co.mix).lerp(new THREE.Color(1, 1, 1), 0.35);
          dm.emissive.copy(co.mix);
          dm.emissiveIntensity = 1.6;
          dm.needsUpdate = true;
        }
        if (c.found) {
          co.light.visible = true;
          // Billboard around Y toward the camera.
          const cam = (parent as THREE.Scene).userData.camera as THREE.Camera | undefined;
          if (cam) {
            cam.getWorldPosition(_cam);
            co.digit.rotation.y = Math.atan2(_cam.x - co.root.position.x, _cam.z - co.root.position.z);
            // The painted digit on the floor turns to read upright from the
            // camera (it lay sideways from most angles).
            const dx = co.root.position.x - _cam.x;
            const dz = co.root.position.z - _cam.z;
            co.decal.rotation.set(-Math.PI / 2, 0, Math.atan2(-dx, -dz));
          }
          co.digit.position.y = 1.35 + Math.sin(t * 1.5 + c.slot) * 0.05;
          volumePoints.push({ position: co.root.position.clone().setY(1.3), color: co.mix.clone().multiplyScalar(1.2), range: 3.5 });
        }
      }
    },
  };
}
