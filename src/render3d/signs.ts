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
  x.shadowColor = 'rgba(255,255,255,0.8)';
  x.shadowBlur = tube * 2.5;
  x.strokeStyle = 'rgba(255,255,255,0.55)';
  x.lineWidth = tube * 1.6;
  x.strokeText(text, w / 2, h / 2);
  x.shadowBlur = 0;
  x.strokeStyle = '#ffffff';
  x.lineWidth = tube * 0.55;
  x.strokeText(text, w / 2, h / 2);
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
  x.font = 'bold 54px "Helvetica Neue", Arial, sans-serif';
  x.textBaseline = 'middle';
  lines.forEach(([arrow, label], i) => {
    const y = 70 + i * 110;
    x.textAlign = 'left';
    x.fillText(arrow, 30, y);
    x.fillText(label, 110, y);
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

/** A sheet of paper taped to a door, the chapter's joke in marker pen. */
export function notice(text: string): THREE.CanvasTexture {
  const [c, x] = canvas(256, 320);
  x.fillStyle = '#e9e4d6';
  x.fillRect(0, 0, 256, 320);
  x.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 12; i++) x.fillRect(0, 30 + i * 24, 256, 1);
  x.fillStyle = '#1b1b1b';
  x.font = 'bold 26px "Comic Sans MS", "Marker Felt", cursive';
  x.textAlign = 'center';
  const words = text.replace(/"/g, '').split(' ');
  let line = '';
  let y = 70;
  for (const w of words) {
    if ((line + ' ' + w).length > 15) {
      x.fillText(line.trim(), 128, y);
      y += 34;
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

/** A stencilled question mark: the unsolved clue, visible under any lamp. */
export function clueStencil(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 256);
  x.clearRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.9)';
  x.lineWidth = 10;
  x.setLineDash([22, 12]);
  x.beginPath();
  x.arc(128, 128, 110, 0, Math.PI * 2);
  x.stroke();
  x.setLineDash([]);
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.font = 'bold 150px "Helvetica Neue", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('?', 128, 136);
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
  // Havenhuis: a faceted glass diamond on an old stone block.
  {
    const hx = W * 0.62;
    const base = HZ;
    x.fillStyle = '#2a2c34';
    x.fillRect(hx - 90, base - 120, 180, 120);
    const pts: Array<[number, number]> = [[-150, -120], [-60, -230], [90, -250], [170, -150], [120, -120]];
    x.beginPath();
    x.moveTo(hx + pts[0][0], base + pts[0][1]);
    for (const [px, py] of pts.slice(1)) x.lineTo(hx + px, base + py);
    x.closePath();
    const dg = x.createLinearGradient(hx - 150, base - 250, hx + 170, base - 120);
    dg.addColorStop(0, '#7fd8ff');
    dg.addColorStop(1, '#2a6aa8');
    x.fillStyle = dg;
    x.fill();
    x.strokeStyle = 'rgba(210,245,255,0.8)';
    x.lineWidth = 2;
    for (let k = 0; k < 9; k++) {
      x.beginPath();
      x.moveTo(hx - 150 + k * 36, base - 120);
      x.lineTo(hx - 60 + k * 26, base - 235);
      x.stroke();
    }
  }
  // Port cranes, far right, with red aviation lights.
  for (let k = 0; k < 6; k++) {
    const cx = W * (0.74 + k * 0.042);
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
    if (Math.abs(bx - W * 0.3) > 120 && Math.abs(bx - W * 0.62) > 200) {
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
