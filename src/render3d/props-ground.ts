/**
 * props-ground.ts — chapter 2's moving parts, drawn from `GameSnapshot.props`.
 *
 * The same contract as `props3d.ts`: each prop is built from its rect the first
 * time the sim publishes it and afterwards only READ — its `state`, `progress`,
 * `v`, `label` and `pts`. The chain the chapter is about (breakers → cabinet →
 * router → password → lights → cable → printer; Biggy's roller door) is all in
 * those fields, so nothing here decides anything.
 *
 * One colour language for every state, the one the 2.5D build uses: dark while
 * `idle`, amber `active` ("something is running here"), green `done`, red
 * `broken`/`shut` where a thing is waiting for a robot.
 */

import * as THREE from 'three';

import { GF } from '../sim/geometry';
import type { Prop } from '../sim/types';
import { m } from '../sim/units';

import type { Materials } from './materials';
import { box } from './materials';
import { poseShutter, rollerShutter } from './shutter';
import { emitter, wayfinding } from './signs';

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** The state palette, linear RGB before intensity. */
const STATE_RGB: Record<string, [number, number, number]> = {
  idle: [0.25, 0.28, 0.32],
  active: [1, 0.55, 0.08],
  done: [0.15, 1, 0.35],
  broken: [1, 0.08, 0.05],
  shut: [1, 0.08, 0.05],
  taut: [1, 0.08, 0.05],
  open: [0.15, 1, 0.35],
};
function stateColour(state: string | undefined, out: THREE.Color, k = 1): THREE.Color {
  const c = STATE_RGB[state ?? 'idle'] ?? STATE_RGB.idle;
  return out.setRGB(c[0] * k, c[1] * k, c[2] * k);
}

function glowMat(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
}

function canvasText(lines: string[], opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string } = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = opts.w ?? 512;
  c.height = opts.h ?? 128;
  const x = c.getContext('2d')!;
  x.fillStyle = opts.bg ?? '#000';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = opts.fg ?? '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const fs = Math.floor(c.height / (lines.length + 0.6));
  x.font = opts.font ?? `bold ${fs}px "Helvetica Neue", Arial, sans-serif`;
  lines.forEach((l, i) => x.fillText(l, c.width / 2, (c.height * (i + 0.8)) / (lines.length + 0.6)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The spray tag on the hall's north wall: Michele's own wording (25 Sep). */
function sprayTag(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1536;
  c.height = 384;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#fff';
  x.fillStyle = '#fff';
  x.lineCap = 'round';
  // The wifi symbol: three arcs and a dot, sprayed.
  const cx = 190;
  const cy = 250;
  for (const [r, w] of [
    [150, 26],
    [100, 24],
    [52, 22],
  ]) {
    x.lineWidth = w;
    x.beginPath();
    x.arc(cx, cy, r, -Math.PI * 0.78, -Math.PI * 0.22);
    x.stroke();
  }
  x.beginPath();
  x.arc(cx, cy, 18, 0, Math.PI * 2);
  x.fill();
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  x.font = 'bold 150px "Marker Felt", "Comic Sans MS", "Trebuchet MS", sans-serif';
  x.shadowColor = '#fff';
  x.shadowBlur = 10;
  x.fillText('DevoxxForever', 370, 170);
  x.font = 'italic 64px "Marker Felt", "Comic Sans MS", "Trebuchet MS", sans-serif';
  x.fillText("(And no, you can't change it)", 400, 300);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface GroundProps {
  build(p: Prop): THREE.Object3D | null;
  update(o: THREE.Object3D, p: Prop, t: number, dt: number): void;
  colliders: THREE.Object3D[];
}

export function createGroundProps(mats: Materials, colliders: THREE.Object3D[]): GroundProps {
  const tmp = new THREE.Color();
  let tagTex: THREE.CanvasTexture | null = null;

  function build(p: Prop): THREE.Object3D | null {
    const pw = p.w ?? 10;
    const ph = p.h ?? 10;
    const cx = m(p.x + pw / 2);
    const cz = m(p.y + ph / 2);
    const w = m(pw);
    const d = m(ph);
    const g = new THREE.Group();
    switch (p.kind) {
      case 'breaker': {
        // A breaker board high on the technical room's wall — too high for
        // anyone but Droid, which is the point of it.
        g.position.set(cx, 0, cz);
        const board = new THREE.Mesh(box(w * 0.9, 1.0, 0.18, V(0, 2.45, -d / 2 + 0.09)), mats.enamel);
        board.castShadow = true;
        g.add(board);
        const handles: THREE.Mesh[] = [];
        for (let i = 0; i < 3; i++) {
          const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.08), mats.darkMetal);
          h.position.set((i - 1) * 0.42, 2.4, -d / 2 + 0.22);
          g.add(h);
          handles.push(h);
        }
        const led = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.05, 0.03), glowMat());
        led.position.set(0, 2.88, -d / 2 + 0.2);
        g.add(led);
        const lamp = new THREE.PointLight(0xffffff, 0, 3.5, 2);
        lamp.position.set(0, 2.5, -d / 2 + 0.7);
        g.add(lamp);
        g.userData = { handles, led, lamp };
        return g;
      }
      case 'rack-lights':
      case 'pilot': {
        // An annunciator strip: dark with no supply, amber, green.
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.08, Math.max(0.06, d * 0.5)), glowMat());
        strip.position.set(cx, p.kind === 'pilot' ? 2.15 : 2.2, cz);
        g.add(strip);
        const lamp = new THREE.PointLight(0xffffff, 0, 5, 2);
        lamp.position.set(cx, 2.1, cz + 0.4);
        g.add(lamp);
        g.userData = { strip, lamp };
        return g;
      }
      case 'rack': {
        // The carcass is a wall (built by ground3d); this is its face: rows of
        // link lights and a coiled patch lead on the shelf.
        const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, 1.7), glowMat());
        face.position.set(cx, 1.05, cz + d / 2 + 0.01);
        g.add(face);
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 128;
        const x = c.getContext('2d')!;
        x.fillStyle = '#000';
        x.fillRect(0, 0, 64, 128);
        for (let r = 0; r < 14; r++) for (let k = 0; k < 6; k++) if ((r * 7 + k * 3) % 4 !== 0) {
          x.fillStyle = '#fff';
          x.fillRect(6 + k * 9, 6 + r * 8.6, 4, 3);
        }
        const tex = new THREE.CanvasTexture(c);
        (face.material as THREE.MeshBasicMaterial).map = tex;
        (face.material as THREE.MeshBasicMaterial).transparent = true;
        (face.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
        g.userData = { face };
        return g;
      }
      case 'printer': {
        // The badge printer on the reception counter.
        g.position.set(cx, 1.05, cz);
        const body = new THREE.Mesh(box(w * 0.9, 0.34, d * 0.9, V(0, 0.17, 0)), mats.enamel);
        body.castShadow = true;
        const slot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.03, 0.05), mats.darkMetal);
        slot.position.set(0, 0.26, d * 0.45);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), glowMat());
        led.position.set(w * 0.35, 0.3, d * 0.45);
        const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.005, 0.14), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 }));
        badge.position.set(0, 0.26, d * 0.45);
        badge.visible = false;
        g.add(body, slot, led, badge);
        g.userData = { led, badge };
        return g;
      }
      case 'lane':
      case 'dropzone': {
        // A lit plate on the floor: the "come here" of this game.
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        plate.rotation.x = -Math.PI / 2;
        plate.position.set(cx, 0.015 + (p.x > 1045 ? 0.5 : 0), cz);
        g.add(plate);
        g.userData = { plate };
        return g;
      }
      case 'sign': {
        // A blue wayfinding panel on a post, in the venue's own signage.
        const label = p.label ?? '';
        const [a, b] = label.includes('·') ? label.split('·').map((s) => s.trim()) : [label, ''];
        const tex = wayfinding(b ? [['', a], ['', b]] : [['', a]]);
        const base = p.x > 1045 ? 0.5 : 0;
        const along = pw >= ph;
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color(1, 1, 1), emissiveMap: tex, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
        panel.position.set(cx, base + 2.3, cz);
        if (!along) panel.rotation.y = Math.PI / 2;
        const post = new THREE.Mesh(box(0.06, 1.9, 0.06, V(cx, base + 0.95, cz)), mats.steel);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(along ? 1.66 : 0.04, 0.05, along ? 0.04 : 1.66), glowMat());
        rim.position.set(cx, base + 2.73, cz);
        g.add(panel, post, rim);
        g.userData = { rim };
        return g;
      }
      case 'cabinet': {
        // The router cabinet: a steel carcass on the technical room's wall with
        // two leaves, hinged at the outer edges, posed from the sim's swing.
        g.position.set(cx, 0, cz);
        const carcass = new THREE.Mesh(box(w, 2.1, d * 0.8, V(0, 1.05, -d * 0.1)), mats.darkMetal);
        carcass.castShadow = true;
        g.add(carcass);
        const leaves: THREE.Object3D[] = [];
        for (const s of [-1, 1]) {
          const pivot = new THREE.Group();
          pivot.position.set((s * w) / 2, 0, d * 0.3 + 0.02);
          const leaf = new THREE.Mesh(box(w / 2 - 0.02, 2.0, 0.04, V((-s * (w / 2 - 0.02)) / 2, 1.05, 0)), mats.enamel);
          leaf.castShadow = true;
          pivot.add(leaf);
          pivot.userData.side = s;
          g.add(pivot);
          leaves.push(pivot);
          colliders.push(leaf);
        }
        g.userData = { leaves };
        return g;
      }
      case 'terminal': {
        // A screen inside the cabinet: the router's link lights, or the
        // authorisation prompt with the password filling in.
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 128;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 0.3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        scr.position.set(cx, 1.3, cz + 0.02);
        g.add(scr);
        g.userData = { canvas: c, tex, scr, drawn: '' };
        return g;
      }
      case 'poster': {
        // The spray tag: DevoxxForever, a wifi symbol, and the joke. Faint
        // until a beam finds it (the sim's `active`), then orange paint.
        tagTex ??= sprayTag();
        const tag = emitter(tagTex, w, w / 4, 0, 0xff7a1a);
        tag.position.set(cx, 2.6, cz + d / 2 + 0.02);
        g.add(tag);
        g.userData = { tag };
        return g;
      }
      case 'cable': {
        g.userData = { mesh: null as THREE.Mesh | null, key: '' };
        return g;
      }
      case 'roller': {
        // Biggy's door: the corrugated shutter that was chapter 1's fire door,
        // kept for this (Michele: "keep the shutter design for chap2").
        const along = pw >= ph;
        const len = m(along ? pw : ph);
        const s = rollerShutter(mats, len, 3.2, 4.1);
        s.position.set(cx, 0, cz);
        if (along) s.rotation.y = Math.PI / 2;
        g.add(s);
        colliders.push(s.userData.curtain as THREE.Object3D);
        g.userData = { shutter: s };
        return g;
      }
      case 'crate': {
        // Pallets of crated Devoxx t-shirts behind the shutter.
        const h = 0.5 * (p.v ?? 1) + 0.15;
        const pallet = new THREE.Mesh(box(w, 0.14, d, V(cx, 0.07, cz)), mats.counter);
        const load = new THREE.Mesh(box(w * 0.92, h, d * 0.92, V(cx, 0.14 + h / 2, cz)), new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.85 }));
        const label = emitter(canvasText(['DEVOXX', 'T-SHIRTS · XL'], { bg: '#000', fg: '#ff7a1a' }), w * 0.7, 0.2, 1.2, 0xffffff);
        label.position.set(cx, 0.14 + h * 0.6, cz + (d * 0.92) / 2 + 0.01);
        pallet.castShadow = load.castShadow = true;
        g.add(pallet, load, label);
        return g;
      }
      case 'gate': {
        // The registration gate at the head of the main stair: a row of glass
        // flap barriers, shut tonight.
        const base = 0.5;
        const n = Math.max(2, Math.round(d / 1.2));
        for (let i = 0; i <= n; i++) {
          const z = m(p.y) + (d * i) / n;
          g.add(new THREE.Mesh(box(0.25, 1.0, 0.16, V(cx, base + 0.5, z)), mats.steel));
          if (i < n) {
            const flap = new THREE.Mesh(box(0.03, 0.6, d / n - 0.3, V(cx, base + 0.7, z + d / n / 2)), mats.glass);
            g.add(flap);
          }
        }
        return g;
      }
      default:
        return null;
    }
  }

  function drawTerminal(o: THREE.Object3D, p: Prop): void {
    const u = o.userData as { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; drawn: string };
    const key = `${p.state}|${p.label}|${(p.v ?? 0).toFixed(2)}`;
    if (u.drawn === key) return;
    u.drawn = key;
    const x = u.canvas.getContext('2d')!;
    x.fillStyle = '#000';
    x.fillRect(0, 0, 512, 128);
    if (p.state === 'idle') {
      u.tex.needsUpdate = true;
      return;
    }
    const col = p.state === 'done' ? '#3cff78' : '#ffa21a';
    x.fillStyle = col;
    x.font = 'bold 30px "Courier New", monospace';
    x.textAlign = 'left';
    x.textBaseline = 'middle';
    const text = (p.label ?? '').replace(/^.*?—\s*/, '').toUpperCase();
    x.fillText(text.slice(0, 30), 14, 40);
    // The fill bar: how much of the password is in (`v`), or the link lights.
    x.strokeStyle = col;
    x.lineWidth = 3;
    x.strokeRect(14, 76, 484, 30);
    x.fillRect(18, 80, 476 * Math.min(1, p.v ?? 0), 22);
    u.tex.needsUpdate = true;
  }

  function update(o: THREE.Object3D, p: Prop, t: number, dt: number): void {
    const ph = p.h ?? 10;
    const u = o.userData;
    void dt;
    switch (p.kind) {
      case 'breaker': {
        const up = p.v ?? 0;
        (u.handles as THREE.Mesh[]).forEach((h, i) => (h.rotation.x = i < up ? -0.9 : 0.5));
        const strike = p.progress ?? 0;
        stateColour(p.state === 'idle' && up > 0 ? 'active' : p.state, tmp, 6 + 20 * strike);
        (u.led.material as THREE.MeshBasicMaterial).color.copy(tmp);
        const L = u.lamp as THREE.PointLight;
        L.color.copy(stateColour(p.state === 'idle' ? 'broken' : p.state, tmp));
        L.intensity = (p.state === 'idle' ? 2 : 8) + 40 * strike;
        break;
      }
      case 'rack-lights':
      case 'pilot': {
        const blink = p.state === 'active' ? 0.6 + 0.4 * Math.sin(t * 4) : 1;
        (u.strip.material as THREE.MeshBasicMaterial).color.copy(stateColour(p.state, tmp, p.state === 'idle' ? 0.4 : 8 * blink));
        const L = u.lamp as THREE.PointLight;
        L.color.copy(stateColour(p.state, tmp));
        L.intensity = p.state === 'idle' ? 0 : 10 * blink;
        break;
      }
      case 'rack': {
        const k = p.state === 'idle' ? 0.2 : 2.5 * (0.7 + 0.3 * Math.sin(t * 9 + Math.sin(t * 3.1) * 2));
        (u.face.material as THREE.MeshBasicMaterial).color.copy(stateColour(p.state === 'idle' ? 'idle' : p.state, tmp, k));
        break;
      }
      case 'printer': {
        (u.led.material as THREE.MeshBasicMaterial).color.copy(stateColour(p.state === 'idle' ? 'broken' : p.state, tmp, 8));
        const badge = u.badge as THREE.Mesh;
        badge.visible = p.state === 'done';
        if (badge.visible) badge.position.z = m(ph) * 0.45 + 0.04 + 0.05 * (0.5 + 0.5 * Math.sin(t * 1.3));
        break;
      }
      case 'lane':
      case 'dropzone': {
        const pulse = p.state === 'done' ? 1 : 0.65 + 0.35 * Math.sin(t * 3);
        (u.plate.material as THREE.MeshBasicMaterial).color.copy(stateColour(p.state, tmp, (p.state === 'idle' ? 0.5 : 1.6) * pulse));
        break;
      }
      case 'sign':
        (u.rim.material as THREE.MeshBasicMaterial).color.copy(stateColour(p.state, tmp, p.state === 'idle' ? 1 : 6));
        break;
      case 'cabinet': {
        const e = THREE.MathUtils.smoothstep(p.progress ?? (p.state === 'open' ? 1 : 0), 0, 1);
        for (const l of u.leaves as THREE.Object3D[]) l.rotation.y = (l.userData.side as number) * e * 1.7;
        break;
      }
      case 'terminal':
        drawTerminal(o, p);
        break;
      case 'poster': {
        const k = p.state === 'done' ? 3 : p.state === 'active' ? 2 : 0.25 + 0.1 * Math.sin(t * 1.5);
        ((u.tag as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setRGB(1, 0.48, 0.1).multiplyScalar(k);
        break;
      }
      case 'cable': {
        const pts = p.pts ?? [];
        const last = pts[pts.length - 1];
        const key = `${pts.length}|${last ? Math.round(last.x / 2) : 0}|${last ? Math.round(last.y / 2) : 0}|${p.state}`;
        if (key === u.key) break;
        u.key = key;
        if (u.mesh) {
          o.remove(u.mesh);
          (u.mesh as THREE.Mesh).geometry.dispose();
          u.mesh = null;
        }
        if (pts.length < 2) break;
        const curve = new THREE.CatmullRomCurve3(pts.map((q) => V(m(q.x), (q.x > 1045 ? 0.5 : 0) + 0.04, m(q.y))));
        const geo = new THREE.TubeGeometry(curve, Math.min(400, pts.length * 4), 0.035, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a4cff, emissive: stateColour(p.state === 'idle' ? 'idle' : p.state, new THREE.Color(), 0.8), roughness: 0.5 });
        u.mesh = new THREE.Mesh(geo, mat);
        o.add(u.mesh);
        break;
      }
      case 'roller':
        poseShutter(u.shutter as THREE.Group, p.progress ?? (p.state === 'broken' ? 1 : 0), 3.2);
        break;
      default:
        break;
    }
  }

  void GF;
  return { build, update, colliders };
}
