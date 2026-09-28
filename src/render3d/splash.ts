/**
 * splash.ts — the gate before the opening, dressed.
 *
 * Michele, 28 Sep 2026: *"Splash: could we add the devoxx logo? And the Antwerp
 * view maybe?"* Both are drawn here, in code, like everything else in this game
 * (no asset files): a DEVOXX wordmark lit the way the conference's opening video
 * lights it — white-hot strokes, the D and the XX filled with a gold pixel
 * mosaic — and the skyline of Antwerp at night over the Scheldt, north to the
 * port cranes where Kinepolis stands.
 *
 * It is still the audio gate (see `main3d.ts`): the page cannot make a sound
 * until a key or a click, and the key that dismisses this is swallowed.
 */

const GOLD = '#f5b638';
const HOT = '#fff4dc';

/** Seeded, so the mosaic and the windows are the same every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The six letters as stroke paths in a 100-unit-tall box; returns the advance. */
function letter(x: CanvasRenderingContext2D, ch: string, ox: number): number {
  const p = new Path2D();
  const t = 100;
  switch (ch) {
    case 'D':
      p.moveTo(ox, 0);
      p.lineTo(ox + 52, 0);
      p.arcTo(ox + 88, 0, ox + 88, 36, 34);
      p.lineTo(ox + 88, 64);
      p.arcTo(ox + 88, t, ox + 52, t, 34);
      p.lineTo(ox, t);
      p.closePath();
      x.stroke(p);
      return 104;
    case 'E':
      p.moveTo(ox + 80, 0);
      p.lineTo(ox, 0);
      p.lineTo(ox, t);
      p.lineTo(ox + 80, t);
      p.moveTo(ox, 50);
      p.lineTo(ox + 68, 50);
      x.stroke(p);
      return 96;
    case 'V':
      p.moveTo(ox, 0);
      p.lineTo(ox + 48, t);
      p.lineTo(ox + 96, 0);
      x.stroke(p);
      return 108;
    case 'O':
      p.roundRect(ox, 0, 96, t, 30);
      x.stroke(p);
      return 112;
    case 'X':
      p.moveTo(ox, 0);
      p.lineTo(ox + 90, t);
      p.moveTo(ox + 90, 0);
      p.lineTo(ox, t);
      x.stroke(p);
      return 72;
    default:
      return 60;
  }
}

/** The wordmark, `w` css px wide: hot strokes, a gold mosaic in the D and the XX. */
function wordmark(w: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const word = 'DEVOXX';
  const units = 104 + 96 + 108 + 112 + 72 + 90 + 60;
  const k = w / units;
  const h = Math.round(150 * k);
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const x = c.getContext('2d');
  if (!x) return c;
  const draw = (ctx: CanvasRenderingContext2D, only: (i: number) => boolean): void => {
    ctx.save();
    ctx.scale(k * dpr, k * dpr);
    ctx.translate(10, 30);
    ctx.lineWidth = 17;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    let ox = 0;
    for (let i = 0; i < word.length; i++) {
      if (only(i)) ox += letter(ctx, word[i], ox);
      else ox += letter(document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D, word[i], ox);
    }
    ctx.restore();
  };
  const mosaic = (i: number): boolean => i === 0 || i >= 4;
  // The robots in the mark (Michele: "could we fit some robot element on the
  // logo? the original is just an inspiration"): the O is Voxxy's lens, with her
  // two ears on top of it.
  const voxxy = (): void => {
    x.save();
    x.scale(k * dpr, k * dpr);
    x.translate(10, 30);
    const cx0 = 104 + 96 + 108 + 48;
    x.fillStyle = HOT;
    for (const s0 of [-1, 1]) {
      x.beginPath();
      x.moveTo(cx0 + s0 * 34, 2);
      x.lineTo(cx0 + s0 * 30, -19);
      x.lineTo(cx0 + s0 * 14, 2);
      x.closePath();
      x.fill();
    }
    x.strokeStyle = '#ff7a1a';
    x.lineWidth = 9;
    x.beginPath();
    x.arc(cx0, 50, 22, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#ffd9a0';
    x.beginPath();
    x.arc(cx0, 50, 8, 0, Math.PI * 2);
    x.fill();
    x.restore();
  };

  // The glow is a CSS drop-shadow on the canvas (hudTheme.ts): a canvas
  // shadowBlur came out as a rectangle behind each letter on some GPUs.
  x.strokeStyle = HOT;
  draw(x, (i) => !mosaic(i));
  voxxy();

  // The mosaic letters: a mask, then pixels only where the mask is.
  const m = document.createElement('canvas');
  m.width = c.width;
  m.height = c.height;
  const mx = m.getContext('2d');
  if (mx) {
    mx.strokeStyle = '#fff';
    draw(mx, mosaic);
    const cell = Math.max(3, Math.round(5.5 * k * dpr * 1.6));
    const r = rng(1994);
    x.save();
    const data = mx.getImageData(0, 0, m.width, m.height).data;
    for (let py = 0; py < m.height; py += cell) {
      for (let px = 0; px < m.width; px += cell) {
        const a = data[((py + (cell >> 1)) * m.width + px + (cell >> 1)) * 4 + 3];
        if (!a) continue;
        const v = r();
        // The first X is mostly white, the second mostly gold, as in the video.
        const gold = px > m.width * 0.8 ? v < 0.75 : px > m.width * 0.62 ? v < 0.3 : v < 0.45;
        x.fillStyle = gold ? GOLD : v < 0.85 ? HOT : 'rgba(255,244,220,0.35)';
        const s = cell - Math.max(1, Math.round(cell * 0.18));
        x.fillRect(px, py, s, s);
      }
    }
    x.restore();
  }
  return c;
}

/** Antwerp by night, north to the port, over the Scheldt. */
function skyline(w: number, h: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const x = c.getContext('2d');
  if (!x) return c;
  x.scale(dpr, dpr);
  const r = rng(2026);
  const water = h * 0.78;
  const hu = w / 1000;
  // Horizontal units span the width; heights are scaled so the spire (318)
  // stays inside the canvas whatever its aspect.
  const u = hu;
  const v = Math.min(hu, (water * 0.94) / 320);

  // Sky: a sodium glow low over the city.
  const sky = x.createLinearGradient(0, 0, 0, water);
  sky.addColorStop(0, 'rgba(0,0,0,0)');
  sky.addColorStop(1, 'rgba(120,60,20,0.35)');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, water);

  const shapes: Array<(g: CanvasRenderingContext2D) => void> = [];
  const block = (x0: number, wd: number, ht: number): void => {
    shapes.push((g) => g.rect(x0 * u, water - ht * v, wd * u, ht * v));
  };

  // Low town.
  for (let i = 0; i < 1000; i += 18 + r() * 22) block(i, 16 + r() * 26, 26 + r() * 40);
  // Het Steen, the castle on the quay.
  shapes.push((g) => {
    g.rect(150 * u, water - 58 * v, 70 * u, 58 * v);
    g.rect(180 * u, water - 84 * v, 16 * u, 30 * v);
    g.moveTo(176 * u, water - 84 * v);
    g.lineTo(188 * u, water - 104 * v);
    g.lineTo(200 * u, water - 84 * v);
  });
  // The cathedral: nave, then the one tall lace spire (123 m).
  shapes.push((g) => {
    g.rect(300 * u, water - 90 * v, 110 * u, 90 * v);
    g.rect(318 * u, water - 190 * v, 34 * u, 110 * v);
    g.rect(324 * u, water - 236 * v, 22 * u, 50 * v);
    g.rect(328 * u, water - 268 * v, 14 * u, 34 * v);
    g.moveTo(326 * u, water - 268 * v);
    g.lineTo(335 * u, water - 318 * v);
    g.lineTo(344 * u, water - 268 * v);
    g.rect(372 * u, water - 132 * v, 24 * u, 48 * v);
  });
  // The Boerentoren: art-deco setbacks.
  shapes.push((g) => {
    g.rect(470 * u, water - 150 * v, 46 * u, 150 * v);
    g.rect(478 * u, water - 192 * v, 30 * u, 44 * v);
    g.rect(485 * u, water - 214 * v, 16 * u, 24 * v);
    g.rect(491 * u, water - 236 * v, 4 * u, 24 * v);
  });
  // MAS: stacked, rotated boxes.
  shapes.push((g) => {
    for (let i = 0; i < 6; i++) g.rect((600 + (i % 2) * 12) * u, water - (40 + i * 22) * v, 64 * u, 23 * v);
  });
  // The port: cranes, north, where Kinepolis is.
  for (const cx of [780, 850, 930]) {
    shapes.push((g) => {
      g.rect(cx * u, water - 120 * v, 5 * u, 120 * v);
      g.rect((cx + 30) * u, water - 120 * v, 5 * u, 120 * v);
      g.rect((cx - 30) * u, water - 124 * v, 110 * u, 6 * v);
      g.rect((cx + 12) * u, water - 150 * v, 4 * u, 30 * v);
    });
  }
  x.fillStyle = '#07070a';
  x.beginPath();
  for (const s of shapes) s(x);
  x.fill();

  // Windows and aircraft lamps.
  for (let i = 0; i < 180; i++) {
    const wx = r() * w;
    const wy = water - (6 + r() * 60) * v;
    x.fillStyle = r() < 0.8 ? 'rgba(255,190,110,0.8)' : 'rgba(170,220,255,0.7)';
    x.fillRect(wx, wy, 1.6 * u + 1, 1.6 * u + 1);
  }
  for (const [ax, ay] of [
    [335, 318],
    [493, 236],
    [800, 150],
    [870, 150],
    [950, 150],
  ]) {
    x.fillStyle = '#ff3b2f';
    x.beginPath();
    x.arc(ax * u, water - ay * v, 2.2 * u + 0.6, 0, Math.PI * 2);
    x.fill();
  }

  // The Scheldt: the city upside down, broken into ripples.
  x.save();
  x.globalAlpha = 0.28;
  for (let y = 0; y < h - water; y += 2) {
    const off = Math.sin(y * 0.9) * 3 * u;
    x.drawImage(c, 0, (water - y - 2) * dpr, c.width, 2 * dpr, off, water + y, w, 2);
  }
  x.restore();
  const river = x.createLinearGradient(0, water, 0, h);
  river.addColorStop(0, 'rgba(5,6,10,0.2)');
  river.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = river;
  x.fillRect(0, water, w, h - water);
  return c;
}

/** The splash's contents, into `el`. Returns a stop function for its sparks. */
export function fillSplash(el: HTMLElement): () => void {
  const vw = Math.max(320, window.innerWidth);
  const vh = Math.max(320, window.innerHeight);
  el.innerHTML = '';
  const sparks = document.createElement('canvas');
  sparks.className = 'ad3d-sparks';
  el.appendChild(sparks);
  const city = skyline(vw, Math.round(vh * 0.42));
  city.className = 'ad3d-city';
  el.appendChild(city);
  const mark = wordmark(Math.min(760, vw - 32));
  mark.className = 'ad3d-mark';
  el.appendChild(mark);
  const title = document.createElement('h1');
  title.textContent = 'AFTER DARK';
  el.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'ad3d-sub';
  sub.textContent = 'Kinepolis Antwerp · the night before Devoxx';
  el.appendChild(sub);
  const press = document.createElement('p');
  press.className = 'ad3d-press';
  press.textContent = 'Press any key';
  el.appendChild(press);

  // Gold dust drifting up, as behind the video's logo.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  sparks.width = vw * dpr;
  sparks.height = vh * dpr;
  const sx = sparks.getContext('2d');
  const r = rng(7);
  const dust = Array.from({ length: 90 }, () => ({ x: r() * vw, y: r() * vh, v: 6 + r() * 18, s: 0.6 + r() * 1.8, a: 0.2 + r() * 0.6 }));
  let raf = 0;
  let last = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!sx) return;
    sx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sx.clearRect(0, 0, vw, vh);
    for (const d of dust) {
      d.y -= d.v * dt;
      if (d.y < -4) {
        d.y = vh + 4;
        d.x = r() * vw;
      }
      sx.fillStyle = `rgba(245,182,56,${(d.a * (0.6 + 0.4 * Math.sin(now / 400 + d.x))).toFixed(3)})`;
      sx.fillRect(d.x, d.y, d.s, d.s);
    }
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
