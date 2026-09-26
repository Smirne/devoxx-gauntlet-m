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
import { ROBOT_HEIGHT_M, m } from '../sim/units';

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
  /** A stable identity for props that move (the pot on Biggy, the duck, a beer crate). */
  key?(p: Prop): string | undefined;
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
        // Two faces back to back, each reading the right way round: a sign in
        // the middle of a hall is approached from either side.
        const panel = new THREE.Group();
        const face = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color(1, 1, 1), emissiveMap: tex, emissiveIntensity: 0.6 });
        for (const yaw of [0, Math.PI]) {
          const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), face);
          f.rotation.y = yaw;
          f.position.z = yaw === 0 ? 0.01 : -0.01;
          panel.add(f);
        }
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
        if (p.label?.startsWith('beer')) return buildCh3(p, pw, ph);
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
        const flaps: THREE.Mesh[] = [];
        g.userData = { flaps };
        for (let i = 0; i <= n; i++) {
          const z = m(p.y) + (d * i) / n;
          g.add(new THREE.Mesh(box(0.25, 1.0, 0.16, V(cx, base + 0.5, z)), mats.steel));
          if (i < n) {
            const flap = new THREE.Mesh(box(0.03, 0.6, d / n - 0.3, V(0, 0, 0)), mats.glass);
            flap.position.set(cx, base + 0.7, z + d / n / 2);
            g.add(flap);
            flaps.push(flap);
          }
        }
        return g;
      }
      default:
        return buildCh3(p, pw, ph);
    }
  }

  function key(p: Prop): string | undefined {
    switch (p.kind) {
      case 'pot':
      case 'soup':
      case 'duck':
      case 'cable':
        return p.kind;
      case 'race-marker':
        return `race:${p.v ?? 0}`;
      case 'crate':
        return p.label?.startsWith('beer') ? `beer:${p.label}` : undefined;
      default:
        return undefined;
    }
  }

  /** A neon word on a dark backing board, for chapter 3's counters. */
  function neonBoard(text: string, w: number, col: string): THREE.Group {
    const g = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 192;
    const x = c.getContext('2d')!;
    x.fillStyle = '#000';
    x.fillRect(0, 0, 1024, 192);
    x.font = 'bold 110px "Arial Black", Impact, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = col;
    x.shadowBlur = 24;
    x.fillStyle = col;
    x.fillText(text, 512, 100, 980);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, w / 5.33 + 0.1, 0.05), mats.darkMetal);
    const face = emitter(tex, w, w / 5.33, 2.4, 0xffffff);
    face.position.z = 0.03;
    g.add(back, face);
    return g;
  }

  const beerMat = new THREE.MeshPhysicalMaterial({ color: 0xc88a1a, roughness: 0.15, emissive: new THREE.Color(0.35, 0.18, 0.02), emissiveIntensity: 0.6 });
  const crateMats = [0x2f5d2f, 0x7a1f1f, 0x1f3f7a, 0x6a4a1a, 0x444444, 0x5a2a6a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));

  function buildCh3(p: Prop, pw: number, ph: number): THREE.Object3D | null {
    const g = new THREE.Group();
    const w = m(pw);
    const d = m(ph);
    switch (p.kind) {
      case 'soup-station': {
        // The tomato soup: a big pot on the catering counter and a neon word over it.
        g.position.set(m(p.x + pw / 2), 1.0, m(p.y + ph / 2));
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.5, 24), mats.steel);
        pot.position.y = 0.25;
        const soup = new THREE.Mesh(new THREE.CircleGeometry(0.39, 24), new THREE.MeshStandardMaterial({ color: 0xb3261e, emissive: new THREE.Color(0.5, 0.08, 0.04), emissiveIntensity: 0.8, roughness: 0.3 }));
        soup.rotation.x = -Math.PI / 2;
        soup.position.y = 0.46;
        const board = neonBoard('TOMATO SOUP', 2.2, '#ff3b2f');
        board.position.set(0, 1.9, -0.2);
        g.add(pot, soup, board);
        return g;
      }
      case 'ladle': {
        // The high shelf, and the ladle on it until Droid takes it down.
        g.position.set(m(p.x + pw / 2), 0, m(p.y + ph / 2));
        const shelf = new THREE.Mesh(box(w, 0.05, d * 0.8, V(0, 2.35, 0)), mats.steel);
        const ladle = new THREE.Group();
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.steel);
        bowl.position.set(0, 2.47, 0);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), mats.steel);
        handle.rotation.z = 1.1;
        handle.position.set(0.22, 2.55, 0);
        ladle.add(bowl, handle);
        const glow = new THREE.PointLight(0xffb05a, 6, 2.5, 2);
        glow.position.set(0, 2.7, 0.4);
        g.add(shelf, ladle, glow);
        g.userData = { ladle, glow };
        return g;
      }
      case 'crab': {
        g.position.set(m(p.x + pw / 2), 1.0, m(p.y + ph / 2));
        const bread = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 4, 10), new THREE.MeshStandardMaterial({ color: 0xd9a35a, roughness: 0.8 }));
        bread.rotation.z = Math.PI / 2;
        bread.position.y = 0.08;
        const fill = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.1), new THREE.MeshStandardMaterial({ color: 0xff8a6a, roughness: 0.6 }));
        fill.position.y = 0.1;
        const board = neonBoard('BROODJE KRAB', 1.2, '#ff8a3d');
        board.position.set(0, 0.7, -0.15);
        g.add(bread, fill, board);
        return g;
      }
      case 'bar-counter': {
        // The Finally Block, in centre coordinates per the sim's own note.
        g.position.set(m(p.x), 0, m(p.y));
        const counter = new THREE.Mesh(box(w, 1.1, d, V(0, 0.55, 0)), mats.blackGloss);
        counter.castShadow = true;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.04, 0.04), glowMat());
        strip.position.set(0, 1.08, d / 2 + 0.02);
        const board = neonBoard((p.label ?? 'THE BAR').split('—')[0].trim().toUpperCase(), Math.min(4, w * 0.8), '#ffcc33');
        board.position.set(0, 3.0, 0);
        g.add(counter, strip, board);
        g.userData = { strip };
        return g;
      }
      case 'beer-tap': {
        g.position.set(m(p.x), 1.1, m(p.y));
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.35, 12), mats.steel);
        col.position.y = 0.17;
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: 0xf0c040, emissive: new THREE.Color(0.4, 0.3, 0.05), emissiveIntensity: 1 }));
        handle.position.set(0, 0.42, 0.03);
        g.add(col, handle);
        return g;
      }
      case 'beer-glass': {
        // Four Belgian shapes by `v`: tulip, goblet, flute, chalice.
        g.position.set(m(p.x), 1.1, m(p.y));
        const k = (p.v ?? 0) % 4;
        const prof: Array<[number, number]> =
          k === 0 ? [[0.02, 0], [0.02, 0.06], [0.05, 0.1], [0.04, 0.2]] : k === 1 ? [[0.03, 0], [0.01, 0.08], [0.06, 0.12], [0.06, 0.18]] : k === 2 ? [[0.02, 0], [0.025, 0.25]] : [[0.03, 0], [0.01, 0.07], [0.07, 0.1], [0.06, 0.16]];
        g.add(new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14), beerMat));
        return g;
      }
      case 'duck': {
        // The shuffleboard duck: a big rubber duck, centre coordinates.
        g.position.set(m(p.x), 0, m(p.y));
        const yellow = new THREE.MeshStandardMaterial({ color: 0xffd21a, roughness: 0.35 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(w * 0.45, 18, 12), yellow);
        body.scale.set(1, 0.7, 1.25);
        body.position.y = w * 0.32;
        const head = new THREE.Mesh(new THREE.SphereGeometry(w * 0.26, 16, 12), yellow);
        head.position.set(0, w * 0.72, w * 0.3);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(w * 0.08, w * 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xff7a1a }));
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, w * 0.7, w * 0.58);
        g.add(body, head, beak);
        return g;
      }
      case 'duck-target':
      case 'race-marker': {
        g.position.set(m(p.x), 0.02, m(p.y));
        const ring = new THREE.Mesh(new THREE.RingGeometry(w * 0.35, w * 0.5, 32), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        g.add(ring);
        if (p.kind === 'race-marker') {
          const n = emitter(canvasText([String(p.v ?? '')], { w: 128, h: 128 }), w * 0.5, w * 0.5, 2, 0xffffff);
          n.rotation.x = -Math.PI / 2;
          n.position.y = 0.01;
          g.add(n);
        }
        g.userData = { ring };
        return g;
      }
      case 'sticker': {
        g.position.set(m(p.x + pw / 2), 2.4, m(p.y + ph / 2));
        g.add(emitter(canvasText(['DEVOXX', '2026'], { w: 256, h: 160, bg: '#000', fg: '#ff7a1a' }), 0.4, 0.25, 2, 0xffffff));
        return g;
      }
      case 'pot': {
        // The soup, riding on Biggy's lid.
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.36, 20), mats.steel);
        pot.position.y = 0.18;
        g.add(pot);
        return g;
      }
      case 'soup': {
        const surf = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshStandardMaterial({ color: 0xb3261e, emissive: new THREE.Color(0.6, 0.1, 0.05), emissiveIntensity: 0.6 }));
        surf.rotation.x = -Math.PI / 2;
        g.add(surf);
        return g;
      }
      case 'crate': {
        if (!p.label?.startsWith('beer')) return null;
        // A beer crate, centre coordinates, stacked by `v`.
        const i = Array.from(p.label).reduce((a, ch) => a + ch.charCodeAt(0), 0) % crateMats.length;
        const body = new THREE.Mesh(box(w, 0.32, d, V(0, 0.16, 0)), crateMats[i]);
        body.castShadow = true;
        const bottles = new THREE.Mesh(box(w * 0.85, 0.1, d * 0.85, V(0, 0.36, 0)), new THREE.MeshStandardMaterial({ color: 0x3a2208, roughness: 0.2 }));
        g.add(body, bottles);
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
      case 'gate': {
        // Stephan's gate: the glass flaps fold away as the sim swings it open.
        const e = THREE.MathUtils.smoothstep(p.progress ?? (p.state === 'open' ? 1 : 0), 0, 1);
        for (const f of (u.flaps ?? []) as THREE.Mesh[]) f.scale.z = Math.max(0.02, 1 - e);
        break;
      }
      case 'ladle':
        (u.ladle as THREE.Object3D).visible = p.state !== 'done';
        (u.glow as THREE.PointLight).intensity = p.state === 'done' ? 0 : 5 + 3 * Math.sin(t * 3);
        break;
      case 'bar-counter':
      case 'duck-target':
      case 'race-marker': {
        const mat = ((u.strip ?? u.ring) as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.color.copy(stateColour(p.state, tmp, p.state === 'idle' ? 0.8 : 3 * (p.state === 'active' ? 0.7 + 0.3 * Math.sin(t * 4) : 1)));
        break;
      }
      case 'pot':
      case 'soup':
        // Carried on Biggy's lid; the sim puts it a little north of his centre.
        o.position.set(m(p.x), ROBOT_HEIGHT_M.biggy + (p.kind === 'soup' ? 0.02 + 0.32 * (p.v ?? 1) : 0), m(p.y + 8));
        break;
      case 'duck':
        o.position.set(m(p.x), 0, m(p.y));
        break;
      case 'crate':
        if (p.label?.startsWith('beer')) {
          const onBiggy = p.state === 'active' || p.state === 'broken';
          const layer = Math.max(0, (p.v ?? 1) - 1);
          o.position.set(m(p.x), (onBiggy ? ROBOT_HEIGHT_M.biggy : 0) + layer * 0.34, m(p.y));
        }
        break;
      default:
        break;
    }
  }

  void GF;
  return { key, build, update, colliders };
}
