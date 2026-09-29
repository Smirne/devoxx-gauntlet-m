/**
 * portrait.ts — one of the game's people, photographed for the film.
 *
 * Michele, 29 Sep 2026, on the ending: *"I'd start with Devoxx After Dark (like
 * in the splash screen), A game by Michele Giacobazzi (pic of my char?)."* The
 * picture is his character — the one at the high table in chapter 3 and in
 * Room 8's second row in chapter 4 (`src/sim/cameos.ts`) — built by the same
 * code that builds him there (`createPeople`), stood up in a studio of its own
 * well away from the venue, and rendered once into a 2D canvas that the house
 * screen paints like any other picture (`keynote3d.ts`, the byline card).
 *
 * It reads the sim's look for the person and nothing else; it decides nothing.
 */

import * as THREE from 'three';

import { CAMEO_LOOKS } from '../sim/cameos';
import type { Person } from '../sim/types';

import { createPeople } from './people3d';

/** How far below the venue the studio stands, m: out of reach of every light in the building. */
const STUDIO_DEPTH = 2000;

/**
 * `name`'s head and shoulders, `w` by `h` px, on a transparent background — or
 * null if there is no such cameo. Costs one small render and one read-back, so
 * call it once and keep the canvas.
 */
export function portraitOf(renderer: THREE.WebGLRenderer, name: string, w = 480, h = 600): HTMLCanvasElement | null {
  const look = CAMEO_LOOKS[name];
  if (!look) return null;

  const scene = new THREE.Scene();
  const studio = new THREE.Group();
  studio.position.y = -STUDIO_DEPTH;
  scene.add(studio);
  // Standing, as at the breakfast table, turned a little off the lens.
  const person: Person = { x: 0, y: 0, r: 4, name, ...look, role: 'staff', face: Math.PI / 2 - 0.32, speed: 0 };
  createPeople(studio).update({ people: [person], plates: [] }, 0);
  // Framed off their own head, which is where the seed put it: Claude is 1.59 m,
  // Michele 1.70 m, and one fixed camera took the top off one or the other.
  studio.updateMatrixWorld(true);
  const head = studio.getObjectByName(`portrait-${name}`) ?? studio.getObjectByName('head');
  const y = head ? head.getWorldPosition(new THREE.Vector3()).y : 1.47 - STUDIO_DEPTH;

  // A key from the front and above, a cool rim behind, and a sky/floor fill.
  const at = new THREE.Vector3(0, y - 0.11, 0);
  const key = new THREE.DirectionalLight(0xffe4c8, 3.4);
  key.position.set(-1.3, y + 0.83, 2.2);
  const rim = new THREE.DirectionalLight(0x9cc2ff, 2.6);
  rim.position.set(1.6, y + 0.53, -1.8);
  const fill = new THREE.DirectionalLight(0xfff4ea, 0.9);
  fill.position.set(1.8, y - 0.27, 2.0);
  for (const L of [key, rim, fill]) {
    L.target.position.copy(at);
    scene.add(L, L.target);
  }
  scene.add(new THREE.HemisphereLight(0xfff1e0, 0x2a2230, 1.1));

  const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 20);
  cam.position.set(0, y - 0.05, 2.05);
  cam.lookAt(at);
  cam.updateMatrixWorld();

  // An sRGB target: the GPU encodes on write, so the shadows keep their steps.
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const px = new Uint8Array(w * h * 4);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadows = renderer.shadowMap.enabled;
  try {
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.enabled = prevShadows;
    rt.dispose();
  }

  // Bottom-up and premultiplied at the edges -> top-down and straight, for a 2D canvas.
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(w, h);
  const out = img.data;
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    const dst = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const a = px[src + x + 3];
      if (a === 0) continue;
      for (let k = 0; k < 3; k++) out[dst + x + k] = Math.min(255, Math.round((px[src + x + k] * 255) / a));
      out[dst + x + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
