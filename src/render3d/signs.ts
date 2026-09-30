/**
 * signs.ts — everything with words or pictures on it, drawn with Canvas 2D at
 * load (no image files, CLAUDE.md): neon tubes, the venue's orange Zaal panels,
 * blue Dutch wayfinding, EXIT signs, backlit posters, taped notices, the city
 * outside the foyer glass.
 *
 * Emitters are MeshBasicMaterials whose colour goes above 1: the pipeline is
 * linear HDR, so a neon tube at 18x white is what makes the bloom treat it as a
 * light rather than as a bright bit of paint.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  return [c, ctx];
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** A flat emitter plane, `w` x `h` metres, facing +Z. */
export function emitter(map: THREE.Texture, w: number, h: number, intensity: number, color: THREE.ColorRepresentation = 0xffffff, additive = true): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map,
    color: new THREE.Color(color).multiplyScalar(intensity),
    transparent: additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !additive,
    toneMapped: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/* -------------------------------------------------------------------- neon */

/**
 * Neon lettering: a tube stroke with a hot white core. Returned as a white-on-
 * black mask; the caller tints it with the material colour, so the same bake
 * serves any colour.
 */
export function neonText(text: string, opts: { font?: string; w?: number; h?: number; tube?: number; flickerGap?: number } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 1024;
  const h = opts.h ?? 256;
  const [c, x] = canvas(w, h);
  x.fillStyle = '#000';
  x.fillRect(0, 0, w, h);
  x.font = opts.font ?? `bold ${Math.round(h * 0.62)}px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineCap = 'round';
  const tube = opts.tube ?? h * 0.05;
  // Soft outer glow baked in (the bloom adds the big halo).
  // Kept dim: at emitter intensity it still clears the bloom threshold, and a
  // brighter halo swallowed the letters into one blown smear.
  x.shadowColor = 'rgba(255,255,255,0.45)';
  x.shadowBlur = tube * 3;
  x.strokeStyle = 'rgba(255,255,255,0.16)';
  x.lineWidth = tube * 2.2;
  x.strokeText(text, w / 2, h / 2);
  x.shadowBlur = 0;
  // The tube, then its hot core: the core is what reads as the letter.
  x.strokeStyle = 'rgba(255,255,255,0.55)';
  x.lineWidth = tube;
  x.strokeText(text, w / 2, h / 2);
  x.strokeStyle = '#ffffff';
  x.lineWidth = tube * 0.45;
  x.strokeText(text, w / 2, h / 2);
  return tex(c, false);
}

/**
 * Frosted backlit glass behind a back bar: one bright band per shelf that
 * falls off toward the shelf above, streaks of frost, darker at the rim.
 */
export function backlitGlass(shelves: number): THREE.CanvasTexture {
  const [c, x] = canvas(512, 256);
  x.fillStyle = '#000';
  x.fillRect(0, 0, 512, 256);
  const band = 256 / shelves;
  for (let k = 0; k < shelves; k++) {
    const y0 = 256 - (k + 1) * band;
    const g = x.createLinearGradient(0, y0 + band, 0, y0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0.08)');
    x.fillStyle = g;
    x.fillRect(0, y0 + 3, 512, band - 6);
  }
  // Frost streaks and a vignette toward the cabinet's ends.
  for (let i = 0; i < 180; i++) {
    x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
    x.fillRect(Math.random() * 512, 0, 1 + Math.random() * 3, 256);
  }
  const v = x.createLinearGradient(0, 0, 512, 0);
  v.addColorStop(0, 'rgba(0,0,0,0.7)');
  v.addColorStop(0.18, 'rgba(0,0,0,0)');
  v.addColorStop(0.82, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.7)');
  x.fillStyle = v;
  x.fillRect(0, 0, 512, 256);
  return tex(c, false);
}

/* ------------------------------------------------------------- venue signs */

/** The venue's orange panel with one big white letter (CAPTIONS.md #1). */
export function zaalPanel(letter: string): THREE.CanvasTexture {
  const [c, x] = canvas(256, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#ff7a1a');
  g.addColorStop(1, '#e35a0a');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 512);
  x.fillStyle = '#fff';
  x.font = `bold ${letter.length > 1 ? 190 : 300}px "Helvetica Neue", Arial, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(letter, 128, 250);
  x.font = 'bold 34px "Helvetica Neue", Arial, sans-serif';
  x.fillText('ZAAL', 128, 450);
  return tex(c);
}

/** Blue Dutch wayfinding (CAPTIONS.md #1): white text, white arrows. */
export function wayfinding(lines: Array<[string, string]>): THREE.CanvasTexture {
  const [c, x] = canvas(512, 256);
  x.fillStyle = '#13348c';
  x.fillRect(0, 0, 512, 256);
  x.strokeStyle = 'rgba(255,255,255,0.25)';
  x.lineWidth = 4;
  x.strokeRect(8, 8, 496, 240);
  x.fillStyle = '#fff';
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  const font = (px: number): string => `bold ${px}px "Helvetica Neue", Arial, sans-serif`;
  // No arrow, no gutter for one.
  const left = lines.some(([arrow]) => arrow) ? 110 : 34;
  const room = 512 - left - 30;
  /*
   * ONE SIZE FOR THE WHOLE PANEL, the largest at which every label fits across
   * it — wrapped onto as many lines as it needs — and the lines fit down it.
   * A long label used to shrink on its one line to 24 px and then run off the
   * edge anyway (Michele, 29 Sep, on the beer pallet's sign: "unreadable ...
   * chars should not be so small, split on more lines").
   */
  let px = 54;
  let rows: Array<[string, string]> = [];
  for (; px >= 30; px -= 2) {
    x.font = font(px);
    rows = [];
    let fits = true;
    for (const [arrow, label] of lines) {
      const out: string[] = [];
      let cur = '';
      for (const word of label.split(/\s+/).filter(Boolean)) {
        const t = cur ? `${cur} ${word}` : word;
        if (x.measureText(t).width <= room) cur = t;
        else {
          if (cur) out.push(cur);
          cur = word;
          if (x.measureText(word).width > room) fits = false;
        }
      }
      if (cur) out.push(cur);
      out.forEach((l, k) => rows.push([k === 0 ? arrow : '', l]));
    }
    if (fits && rows.length * px * 1.2 <= 220) break;
  }
  // Two lines keep the panel's old spacing; more close up to the type.
  const lh = rows.length <= 2 ? 110 : px * 1.2;
  const top = 128 - ((rows.length - 1) * lh) / 2;
  rows.forEach(([arrow, label], i) => {
    const y = top + i * lh;
    if (arrow) {
      x.font = font(54);
      x.fillText(arrow, 30, y);
    }
    x.font = font(px);
    x.fillText(label, left, y);
  });
  return tex(c);
}

/** Green EXIT / UITGANG box with the running man. */
export function exitSign(): THREE.CanvasTexture {
  const [c, x] = canvas(512, 192);
  x.fillStyle = '#0a8f3a';
  x.fillRect(0, 0, 512, 192);
  x.fillStyle = '#eafff0';
  x.font = 'bold 84px "Helvetica Neue", Arial, sans-serif';
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillText('UITGANG', 170, 98);
  // Running man, in blocks.
  x.save();
  x.translate(80, 96);
  x.fillRect(-10, -58, 26, 26);
  x.rotate(0.35);
  x.fillRect(-12, -30, 22, 52);
  x.restore();
  x.fillRect(58, 110, 16, 58);
  x.fillRect(92, 100, 16, 50);
  x.fillRect(40, 60, 70, 14);
  return tex(c);
}

/** Warm backlit poster: a Devoxx-flavoured parody one-sheet. */
export interface PosterSpec {
  title: string;
  tagline: string;
  hue: number;
  glyph: 'beer' | 'bin' | 'monolith' | 'mic' | 'null' | 'robot';
}

function glyph(x: Ctx, kind: PosterSpec['glyph'], cx: number, cy: number, s: number, col: string): void {
  x.save();
  x.translate(cx, cy);
  x.fillStyle = col;
  x.strokeStyle = col;
  x.lineWidth = s * 0.05;
  switch (kind) {
    case 'beer': {
      x.fillRect(-s * 0.3, -s * 0.35, s * 0.6, s * 0.8);
      x.strokeRect(s * 0.3, -s * 0.2, s * 0.2, s * 0.4);
      x.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        x.beginPath();
        x.arc(-s * 0.3 + i * s * 0.15, -s * 0.38, s * 0.12, 0, Math.PI * 2);
        x.fill();
      }
      break;
    }
    case 'bin': {
      x.beginPath();
      x.moveTo(-s * 0.3, -s * 0.3);
      x.lineTo(s * 0.3, -s * 0.3);
      x.lineTo(s * 0.22, s * 0.45);
      x.lineTo(-s * 0.22, s * 0.45);
      x.closePath();
      x.fill();
      x.fillRect(-s * 0.38, -s * 0.42, s * 0.76, s * 0.08);
      break;
    }
    case 'monolith': {
      x.fillRect(-s * 0.14, -s * 0.5, s * 0.28, s * 0.95);
      x.globalAlpha = 0.4;
      x.beginPath();
      x.arc(0, -s * 0.55, s * 0.5, 0, Math.PI * 2);
      x.fill();
      break;
    }
    case 'mic': {
      x.beginPath();
      x.arc(0, -s * 0.2, s * 0.2, 0, Math.PI * 2);
      x.fill();
      x.fillRect(-s * 0.04, 0, s * 0.08, s * 0.4);
      x.fillRect(-s * 0.2, s * 0.4, s * 0.4, s * 0.06);
      break;
    }
    case 'null': {
      x.font = `bold ${s * 0.7}px monospace`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('∅', 0, 0);
      break;
    }
    case 'robot': {
      x.beginPath();
      x.ellipse(0, -s * 0.25, s * 0.32, s * 0.24, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#111';
      x.fillRect(-s * 0.24, -s * 0.32, s * 0.48, s * 0.12);
      x.fillStyle = col;
      x.beginPath();
      x.ellipse(0, s * 0.2, s * 0.22, s * 0.28, 0, 0, Math.PI * 2);
      x.fill();
      break;
    }
  }
  x.restore();
}

export function poster(p: PosterSpec): THREE.CanvasTexture {
  const [c, x] = canvas(512, 768);
  const g = x.createLinearGradient(0, 0, 0, 768);
  g.addColorStop(0, `hsl(${p.hue},70%,14%)`);
  g.addColorStop(0.55, `hsl(${p.hue + 20},80%,32%)`);
  g.addColorStop(1, `hsl(${p.hue + 40},90%,10%)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 768);
  // Light burst behind the glyph.
  const rg = x.createRadialGradient(256, 330, 10, 256, 330, 300);
  rg.addColorStop(0, `hsla(${p.hue + 30},100%,75%,0.9)`);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = rg;
  x.fillRect(0, 0, 512, 768);
  glyph(x, p.glyph, 256, 330, 300, `hsl(${p.hue + 180},20%,8%)`);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.font = 'bold 64px "Impact", "Haettenschweiler", "Arial Black", sans-serif';
  const words = p.title.split(' ');
  let line = '';
  let y = 600;
  const lines: string[] = [];
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 13) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  lines.push(line.trim());
  y = 690 - lines.length * 62;
  for (const l of lines) {
    x.fillText(l.toUpperCase(), 256, y);
    y += 62;
  }
  x.font = 'italic 24px Georgia, serif';
  x.fillStyle = 'rgba(255,255,255,0.8)';
  x.fillText(p.tagline, 256, 60);
  x.font = '16px Arial, sans-serif';
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.fillText('NOW SHOWING · DEVOXX BELGIUM · ANTWERP', 256, 740);
  return tex(c);
}

export const POSTERS: PosterSpec[] = [
  { title: 'OutOfMemory Error', tagline: 'One more beer. The heap said no.', hue: 30, glyph: 'beer' },
  { title: 'The Garbage Collector', tagline: 'It stops the world. Again.', hue: 200, glyph: 'bin' },
  { title: 'Return of the Monolith', tagline: 'Microservices were just a phase.', hue: 270, glyph: 'monolith' },
  { title: 'Keynote: TBA', tagline: 'The speaker is… to be announced.', hue: 340, glyph: 'mic' },
  { title: 'Null Pointer', tagline: 'Nothing is what it seems.', hue: 160, glyph: 'null' },
  { title: 'After Dark', tagline: 'Three robots. One night. No lights.', hue: 18, glyph: 'robot' },
];

/**
 * OLD DEVOXX POSTERS, for the walls of the pickup store (Michele, 29 Sep: *"adorn
 * the walls with old devoxx posters"*). Past editions as a store room keeps
 * them: taped up, yellowing, the older the paler. Every design is invented here
 * — no real edition's artwork is copied — and the years and the one fact they
 * carry are the public history: JavaPolis became Devoxx in 2008, in the same
 * Antwerp cinema.
 */
export interface VintageSpec {
  year: string;
  name: string;
  line: string;
  style: 'halftone' | 'block' | 'grid' | 'circles' | 'stripes' | 'type';
  bg: string;
  ink: string;
  accent: string;
  /** 0 new … 1 twenty years on a store-room wall. */
  age: number;
}

export const OLD_DEVOXX: readonly VintageSpec[] = [
  { year: '2005', name: 'JAVAPOLIS', line: 'Antwerp · Metropolis · bring a laptop', style: 'halftone', bg: '#1d2b53', ink: '#ffd23f', accent: '#ff6b35', age: 0.9 },
  { year: '2008', name: 'DEVOXX', line: 'Same cinema. New name.', style: 'block', bg: '#f37021', ink: '#141414', accent: '#fff4e6', age: 0.7 },
  { year: '2012', name: 'DEVOXX', line: 'The soup queue opens at 7:45', style: 'grid', bg: '#0b0b12', ink: '#39ff88', accent: '#ff7a1a', age: 0.55 },
  { year: '2016', name: 'DEVOXX', line: 'Pick a room. Any room.', style: 'circles', bg: '#f1ebe0', ink: '#1a1a1a', accent: '#f37021', age: 0.4 },
  { year: '2019', name: 'DEVOXX', line: 'OutOfMemoryError: beer', style: 'stripes', bg: '#4b1d6b', ink: '#ffffff', accent: '#ffb000', age: 0.25 },
  { year: '2022', name: 'DEVOXX', line: 'Keynote speaker: TBA', style: 'type', bg: '#e8e4dc', ink: '#f37021', accent: '#1a1a1a', age: 0.12 },
];

export function vintagePoster(p: VintageSpec): THREE.CanvasTexture {
  const W = 512;
  const H = 724;
  const [c, x] = canvas(W, H);
  const heavy = '"Impact", "Haettenschweiler", "Arial Black", "Helvetica Neue", sans-serif';
  const plain = '"Helvetica Neue", Arial, sans-serif';
  x.fillStyle = p.bg;
  x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  switch (p.style) {
    case 'halftone': {
      // A dot screen falling off from the top right, and a steaming cup.
      x.fillStyle = p.accent;
      for (let gy = 0; gy < H * 0.62; gy += 22) {
        for (let gx = 0; gx < W; gx += 22) {
          const d = Math.hypot(W - gx, gy) / (W * 1.1);
          const r = Math.max(0, 9 * (1 - d));
          if (r > 0.6) {
            x.beginPath();
            x.arc(gx + ((gy / 22) % 2) * 11, gy, r, 0, Math.PI * 2);
            x.fill();
          }
        }
      }
      x.fillStyle = p.ink;
      x.fillRect(176, 250, 150, 130);
      x.beginPath();
      x.ellipse(251, 380, 75, 22, 0, 0, Math.PI);
      x.fill();
      x.lineWidth = 16;
      x.strokeStyle = p.ink;
      x.beginPath();
      x.arc(334, 312, 30, -Math.PI / 2, Math.PI / 2);
      x.stroke();
      x.lineWidth = 7;
      for (const sx of [212, 251, 290]) {
        x.beginPath();
        x.moveTo(sx, 236);
        x.bezierCurveTo(sx - 18, 206, sx + 18, 186, sx, 150);
        x.stroke();
      }
      x.font = `bold 92px ${heavy}`;
      x.fillText(p.name, W / 2, 520);
      x.fillStyle = p.accent;
      x.font = `bold 120px ${heavy}`;
      x.fillText(p.year, W / 2, 640);
      break;
    }
    case 'block': {
      // The year too big for the sheet, cropped by its edge.
      x.fillStyle = p.ink;
      x.font = `bold 330px ${heavy}`;
      x.textAlign = 'left';
      x.fillText(p.year.slice(0, 2), -20, 300);
      x.fillText(p.year.slice(2), 150, 590);
      x.textAlign = 'center';
      x.fillStyle = p.accent;
      x.fillRect(0, 610, W, 6);
      x.font = `bold 78px ${heavy}`;
      x.fillText(p.name, W / 2, 690);
      break;
    }
    case 'grid': {
      // A neon floor running to a horizon, the name above it in outline.
      x.strokeStyle = p.ink;
      x.lineWidth = 2;
      const hy = 430;
      for (let i = -12; i <= 12; i++) {
        x.beginPath();
        x.moveTo(W / 2 + i * 14, hy);
        x.lineTo(W / 2 + i * 90, H);
        x.stroke();
      }
      for (let k = 0; k < 9; k++) {
        const y = hy + (H - hy) * Math.pow(k / 8, 1.8);
        x.beginPath();
        x.moveTo(0, y);
        x.lineTo(W, y);
        x.stroke();
      }
      const sun = x.createLinearGradient(0, 190, 0, hy);
      sun.addColorStop(0, p.accent);
      sun.addColorStop(1, '#7a1a4a');
      x.fillStyle = sun;
      x.beginPath();
      x.arc(W / 2, hy, 150, Math.PI, 0);
      x.fill();
      x.lineWidth = 4;
      x.font = `bold 104px ${heavy}`;
      x.strokeText(p.name, W / 2, 150);
      x.fillStyle = p.accent;
      x.font = `bold 60px ${heavy}`;
      x.fillText(p.year, W / 2, 230);
      break;
    }
    case 'circles': {
      // Three overlapping discs, a poster of its decade.
      x.globalAlpha = 0.92;
      x.fillStyle = p.accent;
      x.beginPath();
      x.arc(190, 250, 150, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = p.ink;
      x.beginPath();
      x.arc(340, 330, 110, 0, Math.PI * 2);
      x.fill();
      x.globalAlpha = 0.8;
      x.fillStyle = '#d9c9a8';
      x.beginPath();
      x.arc(260, 420, 70, 0, Math.PI * 2);
      x.fill();
      x.globalAlpha = 1;
      x.fillStyle = p.ink;
      x.textAlign = 'left';
      x.font = `bold 96px ${heavy}`;
      x.fillText(p.name, 36, 610);
      x.fillStyle = p.accent;
      x.font = `bold 64px ${heavy}`;
      x.fillText(p.year, 38, 680);
      x.textAlign = 'center';
      break;
    }
    case 'stripes': {
      // Diagonal stripes and a pint glass.
      x.save();
      x.translate(W / 2, H / 2);
      x.rotate(-0.5);
      x.fillStyle = p.accent;
      for (let i = -12; i < 12; i++) x.fillRect(i * 64, -H, 26, H * 2);
      x.restore();
      x.fillStyle = p.bg;
      x.fillRect(40, 420, W - 80, 250);
      x.fillStyle = p.ink;
      x.beginPath();
      x.moveTo(196, 150);
      x.lineTo(316, 150);
      x.lineTo(300, 390);
      x.lineTo(212, 390);
      x.closePath();
      x.fill();
      x.fillStyle = p.accent;
      x.fillRect(206, 196, 100, 176);
      x.font = `bold 96px ${heavy}`;
      x.fillStyle = p.ink;
      x.fillText(p.name, W / 2, 530);
      x.fillStyle = p.accent;
      x.font = `bold 72px ${heavy}`;
      x.fillText(p.year, W / 2, 610);
      break;
    }
    case 'type': {
      // Nothing but type, the way a recent one might be.
      x.fillStyle = p.ink;
      x.textAlign = 'left';
      x.font = `bold 150px ${heavy}`;
      x.fillText('DEV', 30, 250);
      x.fillText('OXX', 30, 400);
      x.fillStyle = p.accent;
      x.font = `bold 90px ${heavy}`;
      x.fillText(p.year, 34, 520);
      x.textAlign = 'center';
      break;
    }
  }
  // The small print, on every one of them.
  x.font = `bold 22px ${plain}`;
  x.fillStyle = p.style === 'circles' || p.style === 'type' ? p.accent : p.ink;
  x.globalAlpha = 0.9;
  x.fillText(p.line, W / 2, p.style === 'block' || p.style === 'halftone' ? H - 60 + 34 : H - 30);
  x.globalAlpha = 1;
  // Age: a yellow cast, the colours bleaching, foxing spots, and the folds.
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = `rgba(236, 214, 160, ${0.55 * p.age})`;
  x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  x.fillStyle = `rgba(245, 236, 214, ${0.28 * p.age})`;
  x.fillRect(0, 0, W, H);
  let seed = Math.round(Number(p.year) * 7 + 3);
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90 * p.age; i++) {
    x.fillStyle = `rgba(120, 84, 40, ${0.08 + 0.12 * rnd()})`;
    x.beginPath();
    x.arc(rnd() * W, rnd() * H, 1 + rnd() * 5, 0, Math.PI * 2);
    x.fill();
  }
  x.strokeStyle = `rgba(255, 255, 255, ${0.25 * p.age})`;
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(W / 2, 0);
  x.lineTo(W / 2 + 3, H);
  x.moveTo(0, H / 2);
  x.lineTo(W, H / 2 - 2);
  x.stroke();
  // Tape at the corners.
  x.fillStyle = 'rgba(232, 222, 190, 0.78)';
  for (const [tx, ty, a] of [[18, 16, -0.6], [W - 18, 16, 0.6], [18, H - 16, 0.6], [W - 18, H - 16, -0.6]] as const) {
    x.save();
    x.translate(tx, ty);
    x.rotate(a);
    x.fillRect(-34, -11, 68, 22);
    x.restore();
  }
  return tex(c);
}

/**
 * DEVOXX MOVIE NIGHT (Michele, 29 Sep: *"There's a movie night each year so we
 * could have a poster for that"*). A cinema marquee: a bulb-framed board, the
 * letters on a white letter board the way a cinema changes its bill, and the
 * film still TBA, like the keynote speaker. For a backlit frame (1.3 x 1.95 m).
 */
export function movieNightPoster(): THREE.CanvasTexture {
  const W = 512;
  const H = 768;
  const [c, x] = canvas(W, H);
  const heavy = '"Impact", "Haettenschweiler", "Arial Black", sans-serif';
  const plain = '"Helvetica Neue", Arial, sans-serif';
  // Velvet red, darker at the edges: the curtain before the film.
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#3a0508');
  g.addColorStop(0.5, '#7a0d14');
  g.addColorStop(1, '#3a0508');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,0.22)';
  for (let i = 0; i < W; i += 32) x.fillRect(i, 0, 12, H);
  // The marquee: black board, a frame of bulbs.
  x.fillStyle = '#0d0d10';
  x.fillRect(40, 60, W - 80, 330);
  for (let i = 0; i <= 14; i++) {
    for (const [bx, by] of [[40 + (i * (W - 80)) / 14, 60], [40 + (i * (W - 80)) / 14, 390]] as const) {
      const rg = x.createRadialGradient(bx, by, 1, bx, by, 13);
      rg.addColorStop(0, '#fffbe0');
      rg.addColorStop(0.4, '#ffcf4a');
      rg.addColorStop(1, 'rgba(255,160,40,0)');
      x.fillStyle = rg;
      x.beginPath();
      x.arc(bx, by, 13, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.textAlign = 'center';
  x.fillStyle = '#ff7a1a';
  x.font = `bold 44px ${heavy}`;
  x.fillText('DEVOXX', W / 2, 130);
  x.fillStyle = '#ffffff';
  x.font = `bold 92px ${heavy}`;
  x.fillText('MOVIE', W / 2, 240);
  x.fillText('NIGHT', W / 2, 340);
  // The letter board, with the bill in loose black letters.
  x.fillStyle = '#f4f1e8';
  x.fillRect(60, 430, W - 120, 150);
  x.strokeStyle = 'rgba(0,0,0,0.12)';
  x.lineWidth = 2;
  for (const y of [480, 530]) {
    x.beginPath();
    x.moveTo(60, y);
    x.lineTo(W - 60, y);
    x.stroke();
  }
  x.fillStyle = '#111111';
  x.font = `bold 40px ${plain}`;
  x.fillText('TONIGHT · ROOM 8', W / 2, 472);
  x.fillText('FILM: TBA', W / 2, 522);
  x.font = `bold 30px ${plain}`;
  x.fillText('POPCORN: YES', W / 2, 568);
  // A striped popcorn box.
  x.save();
  x.translate(W / 2, 690);
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(-50, -60);
  x.lineTo(50, -60);
  x.lineTo(38, 50);
  x.lineTo(-38, 50);
  x.closePath();
  x.fill();
  x.fillStyle = '#d4141c';
  for (const sx of [-34, -8, 18]) {
    x.beginPath();
    x.moveTo(sx, -60);
    x.lineTo(sx + 14, -60);
    x.lineTo(sx + 11, 50);
    x.lineTo(sx - 2, 50);
    x.closePath();
    x.fill();
  }
  x.fillStyle = '#fff3c4';
  for (const [px, py, pr] of [[-36, -66, 16], [-12, -76, 18], [14, -72, 17], [36, -64, 15], [0, -88, 14]] as const) {
    x.beginPath();
    x.arc(px, py, pr, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();
  x.font = `16px ${plain}`;
  x.fillStyle = 'rgba(255,255,255,0.6)';
  x.fillText('AFTER THE LAST TALK · KINEPOLIS ANTWERPEN', W / 2, 752);
  return tex(c);
}

/** Chalk on slate, for the bar: the party after the conference (Michele: "hints to a party at Beer Central?"). */
export function beerCentralChalkboard(): THREE.CanvasTexture {
  const W = 512;
  const H = 384;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#6b4a2b';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#1f2522';
  x.fillRect(16, 16, W - 32, H - 32);
  // Old chalk, wiped: a haze of what was written here last week.
  x.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 6; i++) x.fillRect(40 + i * 60, 60 + ((i * 37) % 200), 180, 26);
  const chalk = '"Chalkboard SE", "Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';
  x.textAlign = 'center';
  x.fillStyle = '#f2f0e6';
  x.font = `32px ${chalk}`;
  x.fillText('after the last talk', W / 2, 80);
  x.fillStyle = '#ffd24a';
  x.font = `bold 62px ${chalk}`;
  x.fillText('BEER CENTRAL', W / 2, 170);
  x.fillStyle = '#f2f0e6';
  x.font = `28px ${chalk}`;
  x.fillText('by Antwerpen-Centraal', W / 2, 222);
  x.fillText('first round: whoever broke the build', W / 2, 300);
  // An arrow and a pint, in chalk.
  x.strokeStyle = '#f2f0e6';
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(70, 250);
  x.lineTo(150, 250);
  x.moveTo(132, 236);
  x.lineTo(150, 250);
  x.lineTo(132, 264);
  x.stroke();
  x.beginPath();
  x.moveTo(400, 236);
  x.lineTo(446, 236);
  x.lineTo(440, 290);
  x.lineTo(406, 290);
  x.closePath();
  x.stroke();
  return tex(c);
}

/** A flyer taped to a drinks fridge: the same party, in print. */
export function beerCentralFlyer(): THREE.CanvasTexture {
  const W = 256;
  const H = 362;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#ffd24a';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#1a1a1a';
  x.fillRect(0, 0, W, 90);
  x.textAlign = 'center';
  x.fillStyle = '#ffd24a';
  x.font = 'bold 30px "Impact", "Arial Black", sans-serif';
  x.fillText('AFTER DEVOXX?', W / 2, 58);
  x.fillStyle = '#1a1a1a';
  x.font = 'bold 40px "Impact", "Arial Black", sans-serif';
  x.fillText('BEER', W / 2, 160);
  x.fillText('CENTRAL', W / 2, 206);
  x.font = '17px "Helvetica Neue", Arial, sans-serif';
  x.fillText('by Antwerpen-Centraal', W / 2, 250);
  x.fillText('everyone ends up there', W / 2, 276);
  x.font = 'italic 14px Georgia, serif';
  x.fillText('(you did not hear it from Stephan)', W / 2, 330);
  // Tape.
  x.fillStyle = 'rgba(240, 236, 220, 0.8)';
  x.fillRect(W / 2 - 40, 0, 80, 18);
  return tex(c);
}

/** A sheet of paper taped to a door, the chapter's joke in marker pen. */
export function notice(text: string): THREE.CanvasTexture {
  const [c, x] = canvas(256, 320);
  x.fillStyle = '#e9e4d6';
  x.fillRect(0, 0, 256, 320);
  x.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 12; i++) x.fillRect(0, 30 + i * 24, 256, 1);
  x.fillStyle = '#1b1b1b';
  x.font = 'bold 34px "Comic Sans MS", "Marker Felt", cursive';
  x.textAlign = 'center';
  const words = text.replace(/"/g, '').split(' ');
  let line = '';
  let y = 70;
  for (const w of words) {
    if ((line + ' ' + w).length > 12) {
      x.fillText(line.trim(), 128, y);
      y += 42;
      line = w;
    } else line += ' ' + w;
  }
  x.fillText(line.trim(), 128, y);
  // Tape.
  x.fillStyle = 'rgba(220,210,150,0.7)';
  x.fillRect(90, 0, 76, 20);
  return tex(c);
}

/** The keypad's little LCD: the digits typed so far. Redrawn when they change. */
export function lcd(): { texture: THREE.CanvasTexture; draw(text: string, ok: boolean): void } {
  const [c, x] = canvas(256, 96);
  const t = tex(c);
  return {
    texture: t,
    draw(text: string, ok: boolean): void {
      x.fillStyle = ok ? '#062a12' : '#120606';
      x.fillRect(0, 0, 256, 96);
      x.fillStyle = ok ? '#4dff88' : '#ff4d3a';
      x.font = 'bold 64px "Courier New", monospace';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(text.split('').join(' '), 128, 50);
      t.needsUpdate = true;
    },
  };
}

/** A big digit for a solved clue, painted as a glowing mask. */
export function digitMask(d: string, sub: string): THREE.CanvasTexture {
  const [c, x] = canvas(256, 320);
  x.fillStyle = '#000';
  x.fillRect(0, 0, 256, 320);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 230px "Helvetica Neue", Arial, sans-serif';
  x.fillText(d, 128, 140);
  x.font = 'bold 30px "Helvetica Neue", Arial, sans-serif';
  x.fillText(sub, 128, 290);
  return tex(c, false);
}

/** A glowing frame round a wall target (the projector panel): mask only. */
export function haloFrame(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 200);
  x.fillStyle = '#000';
  x.fillRect(0, 0, 256, 200);
  x.shadowColor = '#fff';
  x.shadowBlur = 18;
  x.strokeStyle = '#fff';
  x.lineWidth = 8;
  x.strokeRect(22, 22, 212, 156);
  x.shadowBlur = 0;
  // Corner brackets, heavier: the "this is the thing" read.
  x.lineWidth = 14;
  for (const [cx, cy, sx, sy] of [[14, 14, 1, 1], [242, 14, -1, 1], [14, 186, 1, -1], [242, 186, -1, -1]]) {
    x.beginPath();
    x.moveTo(cx, cy + sy * 40);
    x.lineTo(cx, cy);
    x.lineTo(cx + sx * 40, cy);
    x.stroke();
  }
  return tex(c, false);
}

/** Floor marker: where Biggy parks so Droid, on top, reaches a wall target. */
export function parkStencil(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 256);
  x.clearRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 10;
  x.setLineDash([30, 14]);
  x.beginPath();
  x.arc(128, 128, 112, 0, Math.PI * 2);
  x.stroke();
  x.setLineDash([]);
  // An arrow toward the wall (up in texture space).
  x.fillStyle = 'rgba(255,255,255,0.95)';
  x.beginPath();
  x.moveTo(128, 40);
  x.lineTo(178, 110);
  x.lineTo(146, 110);
  x.lineTo(146, 190);
  x.lineTo(110, 190);
  x.lineTo(110, 110);
  x.lineTo(78, 110);
  x.closePath();
  x.fill();
  return tex(c);
}

/** A stencilled question mark: the unsolved clue, visible under any lamp. */
export function clueStencil(digit?: string): THREE.CanvasTexture {
  const [c, x] = canvas(256, 256);
  x.clearRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.9)';
  // Solved: the ring closes and the digit is left painted on the floor, as
  // the 2.5D build does — a floating number alone was easy to miss.
  x.lineWidth = digit ? 14 : 10;
  if (!digit) x.setLineDash([22, 12]);
  x.beginPath();
  x.arc(128, 128, 110, 0, Math.PI * 2);
  x.stroke();
  x.setLineDash([]);
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.font = 'bold 150px "Helvetica Neue", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(digit ?? '?', 128, 136);
  return tex(c);
}

/**
 * The night outside the foyer glass: Antwerp, north of the centre, where the
 * venue actually is — the cathedral spire floodlit gold on the skyline, the
 * port cranes with their red aviation lights, the Havenhuis' glass diamond,
 * and the Ring's light trails down below. Seen through rain and haze, slightly
 * soft, it is the one place the night-city palette is literally a city — and
 * it is this city.
 */
export function cityscape(): THREE.CanvasTexture {
  const W = 4096;
  const H = 1536;
  const [c, x] = canvas(W, H);
  const HZ = H * 0.62; // horizon
  const sky = x.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, '#010207');
  sky.addColorStop(0.6, '#060818');
  sky.addColorStop(0.88, '#1d0f26');
  sky.addColorStop(1, '#3a1a28');
  x.fillStyle = sky;
  x.fillRect(0, 0, W, HZ);
  let seed = 11;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Low clouds catching the city glow.
  for (let i = 0; i < 40; i++) {
    const cx = rnd() * W;
    const cy = HZ * (0.25 + rnd() * 0.45);
    const r = 200 + rnd() * 500;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(90,50,80,0.05)');
    g.addColorStop(1, 'rgba(90,50,80,0)');
    x.fillStyle = g;
    x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  // Far rooftops: low, dense, few lights.
  const block = (x0: number, w: number, h: number, shade: number, density: number, base: number): void => {
    x.fillStyle = `rgb(${shade},${shade},${shade + 6})`;
    x.fillRect(x0, base - h, w, h + 4);
    for (let wy = base - h + 6; wy < base - 4; wy += 9) {
      for (let wx = x0 + 3; wx < x0 + w - 4; wx += 7) {
        if (rnd() > density) continue;
        const warm = rnd() > 0.3;
        x.fillStyle = warm ? `rgba(255,${160 + rnd() * 70},${80 + rnd() * 60},${0.35 + rnd() * 0.5})` : `rgba(${150 + rnd() * 60},${200 + rnd() * 55},255,${0.3 + rnd() * 0.5})`;
        x.fillRect(wx, wy, 3, 4);
      }
    }
  };
  for (let bx = 0; bx < W; ) {
    const w = 40 + rnd() * 120;
    block(bx, w, 20 + rnd() * 70, 9, 0.08, HZ);
    bx += w;
  }
  // The cathedral spire (Onze-Lieve-Vrouwekathedraal), floodlit.
  {
    const sx = W * 0.3;
    const base = HZ;
    const grad = x.createLinearGradient(0, base - 520, 0, base);
    grad.addColorStop(0, '#ffd89a');
    grad.addColorStop(1, '#a8642a');
    x.fillStyle = grad;
    x.beginPath();
    x.moveTo(sx - 46, base);
    x.lineTo(sx - 46, base - 240);
    x.lineTo(sx - 30, base - 250);
    x.lineTo(sx - 30, base - 360);
    x.lineTo(sx - 18, base - 370);
    x.lineTo(sx - 14, base - 450);
    x.lineTo(sx, base - 540);
    x.lineTo(sx + 14, base - 450);
    x.lineTo(sx + 18, base - 370);
    x.lineTo(sx + 30, base - 360);
    x.lineTo(sx + 30, base - 250);
    x.lineTo(sx + 46, base - 240);
    x.lineTo(sx + 46, base);
    x.fill();
    x.fillStyle = 'rgba(60,30,10,0.6)';
    for (let k = 0; k < 7; k++) x.fillRect(sx - 36 + k * 11, base - 230, 4, 60);
    for (let k = 0; k < 4; k++) x.fillRect(sx - 22 + k * 13, base - 350, 4, 40);
    const glow = x.createRadialGradient(sx, base - 300, 0, sx, base - 300, 420);
    glow.addColorStop(0, 'rgba(255,190,110,0.18)');
    glow.addColorStop(1, 'rgba(255,190,110,0)');
    x.fillStyle = glow;
    x.fillRect(sx - 420, base - 720, 840, 840);
    // The nave below it.
    x.fillStyle = '#6b3f1c';
    x.fillRect(sx + 46, base - 130, 260, 130);
  }
  // Havenhuis (Zaha Hadid's Port House), from Michele's night photo: a long
  // faceted glass ship, bow pointing west, lit white from inside behind a
  // triangular diagrid, carried on a white concrete pedestal over the old
  // brick fire station with its slate roof and rows of lit windows.
  {
    const hx = W * 0.665;
    const base = HZ;
    // Drawn at full size about its foot, then scaled: both landmarks are a
    // couple of kilometres off, and at full size they filled the window.
    x.save();
    x.translate(hx * 0.52, base * 0.52);
    x.scale(0.48, 0.48);
    // The fire station.
    const fx0 = hx - 170;
    const fx1 = hx + 240;
    const fTop = base - 150;
    x.fillStyle = '#3a2620';
    x.fillRect(fx0, fTop, fx1 - fx0, 150);
    x.fillStyle = '#1a1a20';
    x.beginPath();
    x.moveTo(fx0 - 6, fTop);
    x.lineTo(fx0 + 20, fTop - 38);
    x.lineTo(fx1 - 20, fTop - 38);
    x.lineTo(fx1 + 6, fTop);
    x.fill();
    for (let d = fx0 + 30; d < fx1 - 30; d += 34) {
      x.fillStyle = 'rgba(255,220,160,0.35)';
      x.fillRect(d, fTop - 26, 8, 10);
    }
    for (let row = 0; row < 3; row++) {
      for (let wx = fx0 + 12; wx < fx1 - 12; wx += 14) {
        x.fillStyle = rnd() > 0.25 ? `rgba(255,${225 + rnd() * 30},${190 + rnd() * 40},${0.55 + rnd() * 0.4})` : 'rgba(30,20,20,0.9)';
        x.fillRect(wx, fTop + 18 + row * 38, 6, row === 2 ? 22 : 16);
      }
    }
    // Pedestal: a slanted white leg and the bridge that carries the ship.
    const ped = x.createLinearGradient(hx - 120, base, hx - 20, base - 240);
    ped.addColorStop(0, '#f2f4f2');
    ped.addColorStop(1, '#9aa4a8');
    x.fillStyle = ped;
    x.beginPath();
    x.moveTo(hx - 150, base - 250);
    x.lineTo(hx - 20, base - 250);
    x.lineTo(hx - 70, base);
    x.lineTo(hx - 105, base);
    x.closePath();
    x.fill();
    x.beginPath();
    x.moveTo(hx - 190, base - 262);
    x.lineTo(hx + 60, base - 262);
    x.lineTo(hx + 40, base - 228);
    x.lineTo(hx - 150, base - 222);
    x.closePath();
    x.fill();
    // The ship.
    const ship: Array<[number, number]> = [[-420, -400], [-200, -392], [60, -378], [250, -350], [310, -300], [270, -246], [60, -238], [-160, -250], [-320, -300]];
    x.save();
    x.beginPath();
    ship.forEach(([px, py], i) => (i ? x.lineTo(hx + px, base + py) : x.moveTo(hx + px, base + py)));
    x.closePath();
    const sg = x.createLinearGradient(0, base - 392, 0, base - 250);
    sg.addColorStop(0, '#f4fbff');
    sg.addColorStop(1, '#8fb2c0');
    x.fillStyle = sg;
    x.fill();
    x.clip();
    // Diagrid: rows of triangles, some glazing dark, most lit.
    const cell = 18;
    for (let ry = base - 400; ry < base - 240; ry += cell) {
      for (let rx = hx - 430; rx < hx + 310; rx += cell) {
        for (const up of [0, 1]) {
          const lit = rnd();
          x.fillStyle = lit > 0.82 ? 'rgba(20,34,48,0.75)' : lit > 0.45 ? 'rgba(255,255,255,0.55)' : 'rgba(170,215,235,0.35)';
          x.beginPath();
          if (up) {
            x.moveTo(rx, ry + cell);
            x.lineTo(rx + cell / 2, ry);
            x.lineTo(rx + cell, ry + cell);
          } else {
            x.moveTo(rx + cell / 2, ry);
            x.lineTo(rx + cell * 1.5, ry);
            x.lineTo(rx + cell, ry + cell);
          }
          x.fill();
        }
      }
    }
    x.strokeStyle = 'rgba(235,245,250,0.9)';
    x.lineWidth = 1.5;
    for (let k = -40; k < 60; k++) {
      x.beginPath();
      x.moveTo(hx - 440 + k * cell, base - 240);
      x.lineTo(hx - 440 + k * cell + 160 * 0.577, base - 400);
      x.moveTo(hx - 440 + k * cell, base - 240);
      x.lineTo(hx - 440 + k * cell - 160 * 0.577, base - 400);
      x.stroke();
    }
    // Floor plates show as brighter bands through the glass.
    for (let f = 0; f < 5; f++) {
      x.fillStyle = 'rgba(255,255,255,0.25)';
      x.fillRect(hx - 430, base - 372 + f * 24, 740, 3);
    }
    x.restore();
    const halo = x.createRadialGradient(hx - 60, base - 320, 0, hx - 60, base - 320, 520);
    halo.addColorStop(0, 'rgba(200,235,255,0.16)');
    halo.addColorStop(1, 'rgba(200,235,255,0)');
    x.fillStyle = halo;
    x.fillRect(hx - 600, base - 860, 1100, 1000);
    x.restore();
  }
  // MAS (Museum aan de Stroom): stacked boxes of red Indian sandstone, each
  // turned a quarter on the one below, with a wavy glass gallery wrapping the
  // corner between them, lit warm from inside.
  {
    const mx = W * 0.735;
    const base = HZ;
    x.save();
    x.translate(mx * 0.58, base * 0.58);
    x.scale(0.42, 0.42);
    const w = 170;
    const lvl = 5;
    const boxH = 62;
    const glassH = 26;
    let y = base;
    for (let k = 0; k < lvl; k++) {
      // Stone box.
      const top = y - boxH;
      const stone = x.createLinearGradient(0, top, 0, y);
      stone.addColorStop(0, '#5e2016');
      stone.addColorStop(1, '#8a3222');
      x.fillStyle = stone;
      x.fillRect(mx - w / 2, top, w, boxH);
      for (let i = 0; i < 90; i++) {
        x.fillStyle = `rgba(${rnd() > 0.5 ? '30,8,4' : '160,70,50'},${0.15 + rnd() * 0.2})`;
        x.fillRect(mx - w / 2 + rnd() * w, top + rnd() * boxH, 2 + rnd() * 5, 1 + rnd() * 2);
      }
      // A few narrow slit windows in the stone.
      for (let i = 0; i < 3; i++) {
        x.fillStyle = 'rgba(255,200,140,0.5)';
        x.fillRect(mx - w / 2 + 20 + rnd() * (w - 40), top + 12 + rnd() * 30, 3, 10);
      }
      y = top;
      if (k === lvl - 1) break;
      // Glass gallery: the full width on one side, the stone overhanging on the other.
      const gTop = y - glassH;
      const left = k % 2 === 0;
      const gx0 = left ? mx - w / 2 - 6 : mx - w / 2 + w * 0.35;
      const gw = w * 0.65 + 6;
      const gl = x.createLinearGradient(0, gTop, 0, y);
      gl.addColorStop(0, '#fff4dc');
      gl.addColorStop(1, '#c9e4f0');
      x.fillStyle = '#2a0f0a';
      x.fillRect(mx - w / 2, gTop, w, glassH);
      x.fillStyle = gl;
      x.fillRect(gx0, gTop + 2, gw, glassH - 4);
      x.strokeStyle = 'rgba(80,120,140,0.6)';
      x.lineWidth = 1;
      for (let i = 0; i < gw; i += 7) {
        x.beginPath();
        x.moveTo(gx0 + i, gTop + 2);
        x.lineTo(gx0 + i + 2 * Math.sin(i * 0.4), y - 2);
        x.stroke();
      }
      const gg = x.createRadialGradient(gx0 + gw / 2, gTop + glassH / 2, 0, gx0 + gw / 2, gTop + glassH / 2, 140);
      gg.addColorStop(0, 'rgba(255,230,190,0.18)');
      gg.addColorStop(1, 'rgba(255,230,190,0)');
      x.fillStyle = gg;
      x.fillRect(gx0 - 140, gTop - 140, gw + 280, 300);
      y = gTop;
    }
    // Roof terrace glass.
    x.fillStyle = 'rgba(210,235,245,0.8)';
    x.fillRect(mx - w / 2 + 8, y - 10, w - 16, 10);
    x.restore();
  }
  // Port cranes, far right, with red aviation lights.
  for (let k = 0; k < 6; k++) {
    const cx = W * (0.8 + k * 0.034);
    const base = HZ;
    const h = 220 + rnd() * 120;
    x.strokeStyle = '#1a1c24';
    x.lineWidth = 10;
    x.beginPath();
    x.moveTo(cx, base);
    x.lineTo(cx, base - h);
    x.lineTo(cx - 140, base - h + 10);
    x.moveTo(cx, base - h);
    x.lineTo(cx + 60, base - h + 30);
    x.stroke();
    x.fillStyle = '#ff2a1a';
    x.shadowColor = '#ff2a1a';
    x.shadowBlur = 18;
    x.beginPath();
    x.arc(cx, base - h - 6, 5, 0, Math.PI * 2);
    x.arc(cx - 140, base - h + 6, 4, 0, Math.PI * 2);
    x.fill();
    x.shadowBlur = 0;
  }
  // Mid-rise towers with rooftop signs.
  for (let bx = 60; bx < W; ) {
    const w = 60 + rnd() * 110;
    const h = 60 + rnd() * 200;
    const clear = (c: number, half: number): boolean => bx + w < c - half || bx > c + half;
    if (clear(W * 0.3, 60) && clear(W * 0.665 - 40, 200) && clear(W * 0.735, 45)) {
      block(bx, w, h, 13, 0.18, HZ + 10);
      if (rnd() > 0.78) {
        const hue = [320, 190, 45, 12][Math.floor(rnd() * 4)];
        x.fillStyle = `hsl(${hue},100%,62%)`;
        x.shadowColor = `hsl(${hue},100%,60%)`;
        x.shadowBlur = 20;
        x.fillRect(bx + w * 0.12, HZ + 10 - h - 18, w * 0.76, 9);
        x.shadowBlur = 0;
      }
    }
    bx += w + 30 + rnd() * 90;
  }
  // Ground: the Ring, in long exposure.
  const gnd = x.createLinearGradient(0, HZ, 0, H);
  gnd.addColorStop(0, '#0d0a12');
  gnd.addColorStop(1, '#040306');
  x.fillStyle = gnd;
  x.fillRect(0, HZ + 12, W, H - HZ);
  for (let lane = 0; lane < 8; lane++) {
    const y = HZ + 120 + lane * 22 + (lane > 3 ? 40 : 0);
    const red = lane < 4;
    x.strokeStyle = red ? 'rgba(255,40,30,0.75)' : 'rgba(255,240,220,0.8)';
    x.lineWidth = 2 + (lane % 3);
    x.shadowColor = x.strokeStyle;
    x.shadowBlur = 10;
    for (let k = 0; k < 6; k++) {
      const a = rnd() * W;
      x.beginPath();
      x.moveTo(a, y + rnd() * 6);
      x.lineTo(a + 300 + rnd() * 900, y + rnd() * 6);
      x.stroke();
    }
    x.shadowBlur = 0;
  }
  // Street lamps and bokeh.
  for (let i = 0; i < 260; i++) {
    const hue = [30, 38, 190, 320, 50][Math.floor(rnd() * 5)];
    const r = 8 + rnd() * 34;
    const px = rnd() * W;
    const py = HZ + 40 + rnd() * (H - HZ - 60);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `hsla(${hue},100%,70%,${0.35 + rnd() * 0.4})`);
    g.addColorStop(1, `hsla(${hue},100%,50%,0)`);
    x.fillStyle = g;
    x.fillRect(px - r, py - r, 2 * r, 2 * r);
  }
  // Haze over the horizon: the city's own light in the rain.
  const hz = x.createLinearGradient(0, HZ - 200, 0, HZ + 120);
  hz.addColorStop(0, 'rgba(120,70,110,0)');
  hz.addColorStop(0.6, 'rgba(120,70,110,0.28)');
  hz.addColorStop(1, 'rgba(120,70,110,0)');
  x.fillStyle = hz;
  x.fillRect(0, HZ - 200, W, 320);
  return tex(c);
}

/** Rain on glass: droplets and runs as a normal-ish mask (R = drop, G = trail). */
export function rainMask(): THREE.CanvasTexture {
  const [c, x] = canvas(512, 512);
  x.fillStyle = '#000';
  x.fillRect(0, 0, 512, 512);
  let seed = 3;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 900; i++) {
    const px = rnd() * 512;
    const py = rnd() * 512;
    const r = 0.8 + rnd() * 3.2;
    x.fillStyle = `rgba(255,0,0,${0.4 + rnd() * 0.6})`;
    x.beginPath();
    x.ellipse(px, py, r, r * 1.2, 0, 0, Math.PI * 2);
    x.fill();
  }
  for (let i = 0; i < 70; i++) {
    const px = rnd() * 512;
    const len = 30 + rnd() * 160;
    const py = rnd() * 512;
    x.strokeStyle = `rgba(0,255,0,${0.3 + rnd() * 0.5})`;
    x.lineWidth = 1 + rnd() * 2;
    x.beginPath();
    x.moveTo(px, py);
    x.bezierCurveTo(px + rnd() * 6 - 3, py + len * 0.3, px + rnd() * 8 - 4, py + len * 0.6, px + rnd() * 6 - 3, py + len);
    x.stroke();
  }
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The kiosk's backlit menu: prices in euro, one Devoxx joke. */
export function menuBoard(): THREE.CanvasTexture {
  const [c, x] = canvas(768, 320);
  const g = x.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, '#1a0a02');
  g.addColorStop(1, '#070302');
  x.fillStyle = g;
  x.fillRect(0, 0, 768, 320);
  x.fillStyle = '#ffb02e';
  x.font = 'bold 44px "Impact", "Arial Black", sans-serif';
  x.fillText('SNACKS', 28, 58);
  x.fillStyle = '#ff4a2e';
  x.fillRect(28, 72, 712, 4);
  const items: Array<[string, string]> = [
    ['Popcorn — salted / sweet', '€ 6.50'],
    ['Nachos + cheese', '€ 7.00'],
    ['Cola (no refills after 23:00)', '€ 4.20'],
    ['Tomato soup (Devoxx only)', 'free'],
    ['OutOfMemoryError beer', 'sold out'],
  ];
  x.font = '30px "Arial Narrow", Arial, sans-serif';
  items.forEach(([n, p], i) => {
    x.fillStyle = '#f7e9d0';
    x.textAlign = 'left';
    x.fillText(n, 32, 122 + i * 42);
    x.textAlign = 'right';
    x.fillStyle = i === 4 ? '#ff4a2e' : '#ffd07a';
    x.fillText(p, 736, 122 + i * 42);
  });
  return tex(c);
}

/* ------------------------------------------------------------ solid digit */

/** 5x7 pixel digits, top row first. */
const PIXEL_DIGITS: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

/**
 * A found clue's digit as a solid: pixel blocks, extruded, centred on the
 * origin, `h` tall. It spins in the scene, so it reads from any side of the
 * ring — the flat billboard it replaced was edge-on or out of frame from a
 * close, steep camera (Michele, 28 Sep: "make it 3d and slowly rotating").
 */
export function solidDigit(d: string, h: number, color: THREE.ColorRepresentation, intensity: number): THREE.Mesh {
  const rows = PIXEL_DIGITS[d] ?? PIXEL_DIGITS['0'];
  const px = h / rows.length;
  const parts: THREE.BufferGeometry[] = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '1') continue;
      const g = new THREE.BoxGeometry(px * 0.92, px * 0.92, px * 1.4);
      g.translate((c - (row.length - 1) / 2) * px, ((rows.length - 1) / 2 - r) * px, 0);
      parts.push(g);
    }
  });
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  // Faces full bright, sides dimmer: unlit emissive blocks would otherwise
  // melt into one flat shape and the depth would not read.
  const n = geo.getAttribute('normal');
  const shade = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const k = Math.abs(n.getZ(i)) > 0.5 ? 1 : Math.abs(n.getY(i)) > 0.5 ? 0.55 : 0.38;
    shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), vertexColors: true, toneMapped: false, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  return mesh;
}


/**
 * The CFP rejection wall: a corkboard of six pinned slips, each stamped REJECTED.
 * Drawn from the same six titles the sim reads out (`CFP_SLIPS`, ch2-expo.ts).
 */
export function cfpBoard(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  c.width = 512;
  c.height = 280;
  x.fillStyle = '#9a7040';
  x.fillRect(0, 0, 512, 280);
  for (let i = 0; i < 600; i++) {
    x.fillStyle = `rgba(60,35,10,${(0.1 + ((i * 37) % 10) / 40).toFixed(2)})`;
    x.fillRect((i * 97) % 512, (i * 61) % 280, 2, 2);
  }
  x.fillStyle = '#f4f1ea';
  x.font = 'bold 26px Arial';
  x.textAlign = 'center';
  x.fillText('CFP · DEVOXX · 2026', 256, 34);
  const titles = ['Microservices: A Love Story', 'I Rewrote It In Rust', 'Kubernetes For Cats', 'Why Your Tests Lie', 'Blockchain For Catering', 'Deep Dive: Tomato Soup'];
  titles.forEach((t, i) => {
    const sx = 20 + (i % 3) * 164;
    const sy = 56 + Math.floor(i / 3) * 106;
    x.save();
    x.translate(sx + 72, sy + 44);
    x.rotate(((i * 7) % 5 - 2) * 0.04);
    x.fillStyle = '#fbfaf5';
    x.fillRect(-72, -44, 144, 88);
    x.fillStyle = '#222';
    x.font = 'bold 13px Arial';
    x.fillText(t, 0, -18, 136);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 3; k++) x.fillRect(-56, -4 + k * 9, 112, 2);
    x.strokeStyle = '#c8261c';
    x.fillStyle = '#c8261c';
    x.lineWidth = 3;
    x.rotate(-0.25);
    x.strokeRect(-46, 8, 92, 24);
    x.font = 'bold 15px Arial';
    x.fillText('REJECTED', 0, 26);
    x.restore();
    x.fillStyle = '#d93a2b';
    x.beginPath();
    x.arc(sx + 72, sy + 4, 5, 0, Math.PI * 2);
    x.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
