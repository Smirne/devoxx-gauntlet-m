/**
 * reel.ts — Room 8's house screen, playing the Devoxx opening video.
 *
 * The sim decides what is on the screen and when (`src/sim/reel.ts`: the cards are
 * the run's own numbers, and the clock belongs to chapter 4). This module owns one
 * thing — what a card LOOKS like — and is handed `{ card, alpha }` every frame.
 *
 * It is a canvas texture on a plane standing a few centimetres in front of the
 * auditorium screen `floor1.ts` already builds, rather than a repaint of that
 * screen: the screen is venue geometry, shared by eight rooms, and a chapter's
 * video is not the building. `MeshBasicMaterial` because a cinema screen is the
 * light source in that shot, not a surface waiting to be lit.
 *
 * The type is the venue's own: the room signs and the sponsor stands are painted
 * with the same family (`venue/signage.ts`), and an opening title in the house
 * face is what makes the shot read as Devoxx rather than as a debug overlay.
 */

import * as THREE from 'three';

import { R, roomScreen, screenEdge } from '../sim/geometry';
import type { GameSnapshot, ReelCard } from '../sim/types';
import { m } from '../sim/units';

/** Texture pixels per metre of screen. 15 m of screen at 128 px/m is one 2K map. */
const PX_PER_M_TEX = 128;
/** How far in front of the auditorium screen the video plane stands, metres. */
const PROUD = 0.06;
/** The screen's own height, matching `floor1.ts`'s `slab(roomScreen(r), 0.35, 2.4)`. */
const SCREEN_BASE = 0.35;
const SCREEN_H = 2.4;

const INK: Record<ReelCard['kind'], string> = {
  splash: '#ff7a1a',
  title: '#ff7a1a',
  stat: '#e8e6e1',
  blooper: '#ffd27a',
  credit: '#e8e6e1',
  end: '#ff7a1a',
  slide: '#e8e6e1',
};

export interface ReelScreen {
  /** Parent once; it hides itself when no reel is playing. */
  readonly root: THREE.Object3D;
  /** `floorY` is the storey's own datum — the reel only ever plays upstairs. */
  update(snap: GameSnapshot, floorY: number): void;
  dispose(): void;
}

export function createReelScreen(): ReelScreen {
  const rect = roomScreen(R(8));
  const { inward } = screenEdge(R(8));
  const wM = m(rect.w);

  /*
   * No DOM, no canvas — the same guard `venue/signage.ts` carries, because the
   * whole renderer is built headless by the test suite and by the fidelity probes.
   * Without a texture the plane is still there, still posed, still switched by the
   * sim: it simply shows the screen's own dark instead of the video.
   */
  const canPaint = typeof document !== 'undefined' && typeof document.createElement === 'function';
  const canvas = canPaint ? document.createElement('canvas') : null;
  if (canvas) {
    canvas.width = Math.round(wM * PX_PER_M_TEX);
    canvas.height = Math.round(SCREEN_H * PX_PER_M_TEX);
  }
  const ctx = canvas ? canvas.getContext('2d') : null;
  const tex = canvas ? new THREE.CanvasTexture(canvas) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0x07090d, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, SCREEN_H), mat);
  mesh.name = 'reel-screen';
  mesh.visible = false;
  // The screen faces the seats: `inward` is +1 when they are south of it (+z).
  mesh.rotation.y = inward > 0 ? 0 : Math.PI;

  let lastKey = '';

  const paint = (card: ReelCard | null, alpha: number): void => {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, w, h);
    if (!card || alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.textAlign = 'center';
    // A hairline rule under the title, the way the venue's own signage sets type.
    ctx.fillStyle = INK[card.kind];
    ctx.font = `700 ${Math.round(h * 0.22)}px system-ui, sans-serif`;
    ctx.fillText(card.title, w / 2, h * 0.46, w * 0.9);
    ctx.fillStyle = '#9fb0c4';
    ctx.font = `400 ${Math.round(h * 0.1)}px system-ui, sans-serif`;
    ctx.fillText(card.sub, w / 2, h * 0.66, w * 0.86);
    if (card.kind === 'end') {
      ctx.fillStyle = INK.end;
      ctx.fillRect(w * 0.42, h * 0.53, w * 0.16, Math.max(2, h * 0.012));
    }
    ctx.restore();
  };

  return {
    root: mesh,
    update(snap: GameSnapshot, floorY: number): void {
      const reel = snap.reel;
      mesh.visible = reel !== null;
      if (!reel) {
        lastKey = '';
        return;
      }
      // In FRONT of the screen slab, not inside it: `roomScreen` is a 3 px-deep
      // rect and `floor1.ts` extrudes the whole of it, so the plane has to clear
      // the face that looks at the seats — the first version sat a centimetre
      // inside the screen and the video played inside the wall.
      const face = inward > 0 ? rect.y + rect.h : rect.y;
      mesh.position.set(m(rect.x + rect.w / 2), floorY + SCREEN_BASE + SCREEN_H / 2, m(face) + inward * PROUD);
      // Repaint only when the frame actually differs: the fade is quantised to a
      // hundredth, which is finer than the eye and far cheaper than every frame.
      const key = `${reel.index}|${reel.card ? reel.card.title : ''}|${reel.alpha.toFixed(2)}`;
      if (key === lastKey) return;
      lastKey = key;
      paint(reel.card, reel.alpha);
      if (tex) tex.needsUpdate = true;
    },
    dispose(): void {
      mesh.geometry.dispose();
      mat.dispose();
      tex?.dispose();
      mesh.removeFromParent();
    },
  };
}
