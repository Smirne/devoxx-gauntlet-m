/**
 * physics-view.ts — `P`: the simulation, drawn.
 *
 * ## Why it exists
 *
 * Twenty of the Robot Games' hundred points are physics realism, and until now
 * every one of them was invisible. A judge watching the game sees three robots
 * moving; they cannot see that Biggy carries seven times Voxxy's mass, that the
 * only reason he gets through the roller door is momentum he had to build down a
 * lane, or that the wall he hits gives him 45% of his closing speed back while the
 * other two get 5%. Michele, 26 Sep 2026: *"Add the physics view."*
 *
 * So `P` draws it: each robot's collision circle at its own frozen radius, its
 * velocity as an arrow to scale, and every contact the solver resolved this frame
 * as a splash on the normal, sized by the impulse actually applied. Beside it, the
 * numbers — mass, radius, speed against that robot's own top speed, momentum — and
 * the frozen constants the whole game is tuned on.
 *
 * ## It computes no physics
 *
 * Not one number here is derived. The arrows come from `Bot.vx/vy`, the circles
 * from `Bot.r`, and the splashes from `GameSnapshot.contacts`, which the solver
 * itself writes (`src/sim/contacts.ts`) — precisely so that this module does not
 * have to re-derive an impulse in drawing code, which is the thing CLAUDE.md
 * forbids and the thing that would make the readout a lie the moment the two
 * drifted apart. A view of the physics that is not the physics is worth nothing to
 * the twenty points it exists for.
 *
 * The only state it owns is presentational: a contact splash is kept for
 * `SPLASH_LIFE` seconds after the frame that made it, because a 16 ms flash is not
 * a thing an eye can see.
 */

import * as THREE from 'three';

import { DEFS, REST_BOT, REST_WALL_BIGGY, REST_WALL_OTHER } from '../sim/constants';
import type { Bot, Contact, GameSnapshot } from '../sim/types';
import { PX_PER_M, m } from '../sim/units';

/* ------------------------------------------------------------------ the drawing */

/** How long a contact splash stays on screen after the frame that made it. */
const SPLASH_LIFE = 0.55;
/** A velocity arrow this long, in metres, means "this robot's own top speed". */
const ARROW_FULL_M = 2.2;
/** An impulse this big draws a full-length splash. Biggy into a wall at speed. */
const J_FULL = 40;
/** Splash length at `J_FULL`, metres. */
const SPLASH_FULL_M = 0.9;
/** Vertices the overlay can draw in one frame. Rings dominate; 4096 is ~8x spare. */
const MAX_VERTS = 4096;
const RING_SEGS = 40;
/** Off the floor, so the lines are not z-fighting the carpet they sit on. */
const LIFT = 0.04;

const COLOUR: Record<string, [number, number, number]> = {
  voxxy: [1, 0.48, 0.1],
  droid: [0.36, 0.86, 0.55],
  biggy: [0.35, 0.55, 1],
};

interface Splash extends Contact {
  age: number;
}

export interface PhysicsOverlay {
  /** Parent this into the scene once. Hidden until `setEnabled(true)`. */
  readonly group: THREE.Object3D;
  setEnabled(on: boolean): void;
  enabled(): boolean;
  /**
   * One frame. `surfaceY` is the renderer's own floor height at a sim point, so
   * the overlay sits on the lobby plate and the stair treads rather than through
   * them — the same question `scene.ts` asks for every body it draws.
   */
  update(snap: GameSnapshot, dt: number, surfaceY: (simX: number, simY: number) => number): void;
  dispose(): void;
}

export function createPhysicsOverlay(): PhysicsOverlay {
  const positions = new Float32Array(MAX_VERTS * 3);
  const colours = new Float32Array(MAX_VERTS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false });
  // Over everything: the point of the view is to see the mechanism through the set.
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 999;
  lines.frustumCulled = false;
  lines.name = 'physics-view';
  lines.visible = false;

  const splashes: Splash[] = [];
  let on = false;
  let n = 0;

  const vertex = (x: number, y: number, z: number, c: readonly number[]): void => {
    if (n >= MAX_VERTS) return;
    positions[n * 3] = x;
    positions[n * 3 + 1] = y;
    positions[n * 3 + 2] = z;
    colours[n * 3] = c[0];
    colours[n * 3 + 1] = c[1];
    colours[n * 3 + 2] = c[2];
    n++;
  };
  /** One segment, in world metres. */
  const seg = (x0: number, y: number, z0: number, x1: number, y1: number, z1: number, c: readonly number[]): void => {
    vertex(x0, y, z0, c);
    vertex(x1, y1, z1, c);
  };

  /**
   * A robot's collision circle, at its own frozen radius.
   *
   * Drawn as two rings a few centimetres apart, because a WebGL line is one pixel
   * wide whatever you ask for, and one pixel at the play camera's distance is not
   * a circle anybody can see against a lit floor.
   */
  const ring = (cx: number, y: number, cz: number, rM: number, c: readonly number[]): void => {
    for (const rr of [rM, rM - 0.035]) {
      for (let i = 0; i < RING_SEGS; i++) {
        const a0 = (i / RING_SEGS) * Math.PI * 2;
        const a1 = ((i + 1) / RING_SEGS) * Math.PI * 2;
        seg(cx + Math.cos(a0) * rr, y, cz + Math.sin(a0) * rr, cx + Math.cos(a1) * rr, y, cz + Math.sin(a1) * rr, c);
      }
    }
  };

  /** An arrow on the floor: shaft plus two barbs. `len` is metres. */
  const arrow = (
    cx: number,
    y: number,
    cz: number,
    ux: number,
    uz: number,
    len: number,
    c: readonly number[],
  ): void => {
    const tx = cx + ux * len;
    const tz = cz + uz * len;
    seg(cx, y, cz, tx, y, tz, c);
    const barb = Math.min(0.22, len * 0.35);
    for (const s of [1, -1]) {
      // The head, rotated 30 degrees off the shaft, drawn back from the tip.
      const a = Math.atan2(uz, ux) + s * 0.5;
      seg(tx, y, tz, tx - Math.cos(a) * barb, y, tz - Math.sin(a) * barb, c);
    }
  };

  return {
    group: lines,
    enabled: () => on,
    setEnabled(next: boolean): void {
      on = next;
      lines.visible = next;
      if (!next) splashes.length = 0;
    },
    update(snap: GameSnapshot, dt: number, surfaceY: (simX: number, simY: number) => number): void {
      if (!on) return;
      // New contacts in, old ones out. The sim's array is this frame's only.
      for (const c of snap.contacts) splashes.push({ ...c, age: 0 });
      for (let i = splashes.length - 1; i >= 0; i--) {
        splashes[i].age += dt;
        if (splashes[i].age > SPLASH_LIFE) splashes.splice(i, 1);
      }

      n = 0;
      for (const b of snap.bots) {
        if (b.mounted) continue;
        const c = COLOUR[b.kind] ?? [1, 1, 1];
        const y = surfaceY(b.x, b.y) + LIFT;
        ring(m(b.x), y, m(b.y), m(b.r), c);
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 0.5) {
          // A floor under the length: a robot creeping still has a direction, and
          // an arrow two pixels long reads as a smudge rather than as a vector.
          const len = Math.max(0.3, (sp / b.max) * ARROW_FULL_M);
          arrow(m(b.x), y, m(b.y), b.vx / sp, b.vy / sp, len, c);
        }
      }
      for (const s of splashes) {
        const fade = 1 - s.age / SPLASH_LIFE;
        // Hot for a hard hit, pale for a nudge — the same scale the panel prints.
        const hit = Math.min(1, s.j / J_FULL);
        const col = [1, 0.95 - hit * 0.7, 0.35 - hit * 0.3].map((v) => v * fade);
        const y = surfaceY(s.x, s.y) + LIFT * 1.5;
        const len = 0.12 + hit * SPLASH_FULL_M;
        arrow(m(s.x), y, m(s.y), s.nx, s.ny, len * fade, col);
        // A cross on the contact point itself: where the bodies actually touched.
        const t = 0.07;
        seg(m(s.x) - t, y, m(s.y) - t, m(s.x) + t, y, m(s.y) + t, col);
        seg(m(s.x) - t, y, m(s.y) + t, m(s.x) + t, y, m(s.y) - t, col);
      }

      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.computeBoundingSphere();
    },
    dispose(): void {
      geo.dispose();
      mat.dispose();
      lines.removeFromParent();
    },
  };
}

/* -------------------------------------------------------------------- the panel */

export interface PhysicsPanel {
  setEnabled(on: boolean): void;
  enabled(): boolean;
  update(snap: GameSnapshot, dt: number): void;
  dispose(): void;
  readonly root: HTMLElement;
}

const CSS = `
.ad-phys {
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 6;
  padding: 10px 12px;
  border: 1px solid #2b3a4d;
  border-radius: 8px;
  background: rgba(8, 11, 16, 0.86);
  color: #cfe3ff;
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre;
  pointer-events: none;
  max-width: 46ch;
}
.ad-phys b { color: #ffd9a6; font-weight: 600; }
.ad-phys i { color: #7f93ab; font-style: normal; }
.ad-phys .ad-phys-hit { color: #ffb066; }
`;

const mps = (px: number): number => px / PX_PER_M;
const pad = (s: string, w: number): string => (s.length >= w ? s : ' '.repeat(w - s.length) + s);
const padR = (s: string, w: number): string => (s.length >= w ? s : s + ' '.repeat(w - s.length));

/**
 * The numbers beside the drawing.
 *
 * Every row is read off the snapshot or off `DEFS`, and the units are the honest
 * ones: metres and metres per second, because `PX_PER_M` is a real conversion
 * (`docs/scale-and-units.md`), and mass RELATIVE to Voxxy, because the sim's masses
 * are ratios and printing "7 kg" would be inventing a number the game does not have.
 */
export function createPhysicsPanel(host: HTMLElement): PhysicsPanel {
  const style = document.createElement('style');
  style.textContent = CSS;
  const root = document.createElement('div');
  root.className = 'ad-phys';
  root.hidden = true;
  host.append(style, root);
  let on = false;
  // Frame time is noisy at 60 Hz; the eye wants the trend, not the jitter.
  let smoothDt = 1 / 60;

  const line = (b: Bot): string => {
    const sp = Math.hypot(b.vx, b.vy);
    const pct = Math.round((sp / b.max) * 100);
    return (
      `${padR(b.name, 6)}${pad((b.mass / DEFS.voxxy.mass).toFixed(0) + '×', 5)}` +
      `${pad(mps(b.r * 2).toFixed(2) + ' m', 8)}${pad(mps(sp).toFixed(2), 6)}` +
      `${pad(String(pct) + '%', 6)}${pad((b.mass * mps(sp)).toFixed(1), 7)}`
    );
  };

  return {
    root,
    enabled: () => on,
    setEnabled(next: boolean): void {
      on = next;
      root.hidden = !next;
    },
    update(snap: GameSnapshot, dt: number): void {
      if (!on) return;
      smoothDt += (dt - smoothDt) * 0.1;
      const rows = snap.bots.filter((b) => !b.mounted).map(line).join('\n');
      const hits = [...snap.contacts]
        .sort((a, b) => b.j - a.j)
        .slice(0, 3)
        .map(
          (c) =>
            `<span class="ad-phys-hit">${padR(String(c.who), 6)}${padR('→ ' + c.kind, 9)}` +
            `closing ${pad(mps(c.rv).toFixed(2), 5)} m/s   j ${pad(c.j.toFixed(1), 6)}</span>`,
        )
        .join('\n');
      root.innerHTML =
        `<b>PHYSICS</b> <i>· live from the sim · P to hide</i>\n` +
        `<i>${padR('body', 6)}${pad('mass', 5)}${pad('width', 8)}${pad('m/s', 6)}${pad('%max', 6)}${pad('p', 7)}</i>\n` +
        `${rows}\n` +
        `<i>contacts this frame: ${snap.contacts.length}</i>` +
        (hits ? `\n${hits}` : '') +
        `\n<i>step ${(smoothDt * 1000).toFixed(1)} ms · restitution: wall ${REST_WALL_BIGGY} Biggy / ` +
        `${REST_WALL_OTHER} others · body ${REST_BOT}</i>\n` +
        `<i>p = mass × speed · mass is relative to Voxxy · no engine, one 2D step</i>`;
    },
    dispose(): void {
      root.remove();
      style.remove();
    },
  };
}
