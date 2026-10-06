/**
 * deck-paint.ts — what the stage deck's slides look like (`src/sim/deck.ts`).
 *
 * Painted onto the house screen's film canvas in the game's own type and colours:
 * Michele's talk slides redrawn as part of the game instead of pasted into it, so
 * they stay sharp on a 1600 px screen and read as the same world as the title.
 */

import type { ReelCard } from '../sim/types';
import { qrMatrix } from './qr';

const ORANGE = '#ff7a1a';
const YELLOW = '#f3e600';
const PAPER = '#f2efe8';
const MUTED = '#9fb0c4';
const DISC = '#14181f';

export interface DeckPen {
  g: CanvasRenderingContext2D;
  w: number;
  h: number;
  font: string;
  /** Letter-spacing helper from the film (returns what it set). */
  spaced(px: number): number;
  /** The WellD mark at (x, y), `w` wide. */
  logo(x: number, y: number, w: number): void;
}

/** `text` broken into lines no wider than `maxW` at the pen's current font. */
function lines(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxW) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function backdrop(p: DeckPen): void {
  const { g, w, h } = p;
  const bg = g.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, w * 0.9);
  bg.addColorStop(0, '#1a0f08');
  bg.addColorStop(1, '#07090d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
}

/** The small spaced kicker over the title, and the title itself, left-aligned. */
function heading(p: DeckPen, kicker: string, title: string, titleSize = 0.085): void {
  const { g, w, h } = p;
  g.textAlign = 'left';
  const k = Math.round(h * 0.03);
  g.font = `500 ${k}px ${p.font}`;
  p.spaced(k * 0.28);
  g.fillStyle = ORANGE;
  g.fillText(kicker.toUpperCase(), w * 0.07, h * 0.13);
  p.spaced(0);
  const t = Math.round(h * titleSize);
  g.font = `600 ${t}px ${p.font}`;
  g.fillStyle = PAPER;
  g.fillText(title, w * 0.07, h * 0.13 + t * 1.35, w * 0.86);
}

/** Five stages, left to right, each a disc, joined by arrows; the last one is the game. */
function flow(p: DeckPen, card: ReelCard): void {
  const { g, w, h } = p;
  backdrop(p);
  heading(p, card.sub, card.title);
  const items = card.items ?? [];
  const r = Math.min(w * 0.086, h * 0.17);
  const cy = h * 0.62;
  const x0 = w * 0.07 + r;
  const x1 = w * 0.93 - r;
  items.forEach((label, i) => {
    const cx = x0 + ((x1 - x0) * i) / Math.max(1, items.length - 1);
    const last = i === items.length - 1;
    g.save();
    g.shadowColor = last ? 'rgba(243,230,0,.45)' : 'rgba(255,122,26,.25)';
    g.shadowBlur = 30;
    g.fillStyle = DISC;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.lineWidth = 4;
    g.strokeStyle = last ? YELLOW : ORANGE;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    // The number, small, above the words.
    g.textAlign = 'center';
    g.fillStyle = last ? YELLOW : ORANGE;
    g.font = `600 ${Math.round(h * 0.034)}px ${p.font}`;
    g.fillText(String(i + 1), cx, cy - r * 0.42);
    const size = Math.round(h * 0.04);
    g.font = `600 ${size}px ${p.font}`;
    g.fillStyle = PAPER;
    const ls = lines(g, label.toUpperCase(), r * 1.6);
    ls.forEach((ln, j) => g.fillText(ln, cx, cy + r * 0.1 + (j - (ls.length - 1) / 2) * size * 1.25 + size * 0.5));
    if (i < items.length - 1) {
      const gap = (x1 - x0) / (items.length - 1);
      const ax = cx + r + gap * 0.07;
      const bx = cx + gap - r - gap * 0.07;
      g.strokeStyle = MUTED;
      g.lineWidth = 3;
      g.setLineDash([12, 10]);
      g.beginPath();
      g.moveTo(ax, cy);
      g.lineTo(bx, cy);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(bx - 14, cy - 11);
      g.lineTo(bx, cy);
      g.lineTo(bx - 14, cy + 11);
      g.stroke();
    }
  });
}

/** The three icons of the gauntlet slide: a prompt, a loop, a target. */
function icon(p: DeckPen, kind: number, cx: number, cy: number, r: number): void {
  const { g } = p;
  g.save();
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.strokeStyle = ORANGE;
  if (kind === 0) {
    // ">_"
    g.beginPath();
    g.moveTo(cx - r * 0.7, cy - r * 0.45);
    g.lineTo(cx - r * 0.1, cy);
    g.lineTo(cx - r * 0.7, cy + r * 0.45);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + r * 0.05, cy + r * 0.55);
    g.lineTo(cx + r * 0.75, cy + r * 0.55);
    g.stroke();
  } else if (kind === 1) {
    // A loop: an almost-full ring, clockwise, with an arrowhead at its end.
    const a1 = Math.PI * 1.5;
    g.beginPath();
    g.arc(cx, cy, r * 0.75, -Math.PI * 0.35, a1);
    g.stroke();
    const ex = cx + Math.cos(a1) * r * 0.75;
    const ey = cy + Math.sin(a1) * r * 0.75;
    const tx = -Math.sin(a1);
    const ty = Math.cos(a1);
    const nx = Math.cos(a1);
    const ny = Math.sin(a1);
    const q = r * 0.34;
    g.beginPath();
    g.moveTo(ex - tx * q + nx * q * 0.8, ey - ty * q + ny * q * 0.8);
    g.lineTo(ex + tx * q * 0.3, ey + ty * q * 0.3);
    g.lineTo(ex - tx * q - nx * q * 0.8, ey - ty * q - ny * q * 0.8);
    g.stroke();
  } else {
    for (const k of [0.8, 0.5, 0.2]) {
      g.beginPath();
      g.arc(cx, cy, r * k, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();
}

/** One prompt, one loop, one benchmark: three columns, an icon over each. */
function loop(p: DeckPen, card: ReelCard): void {
  const { g, w, h } = p;
  backdrop(p);
  heading(p, card.sub, card.title, 0.075);
  const cols = (card.items ?? []).filter((s) => s.includes('|'));
  const foot = (card.items ?? []).find((s) => !s.includes('|'));
  const colW = (w * 0.86) / 3;
  cols.forEach((col, i) => {
    const [head, body] = col.split('|');
    const left = w * 0.07 + i * colW;
    icon(p, i, left + colW * 0.14, h * 0.45, h * 0.075);
    g.textAlign = 'left';
    g.font = `600 ${Math.round(h * 0.058)}px ${p.font}`;
    g.fillStyle = i === 2 ? YELLOW : PAPER;
    g.fillText(head, left, h * 0.61, colW * 0.88);
    const size = Math.round(h * 0.034);
    g.font = `400 ${size}px ${p.font}`;
    g.fillStyle = MUTED;
    lines(g, body, colW * 0.88).forEach((ln, j) => g.fillText(ln, left, h * 0.61 + size * 1.8 + j * size * 1.35));
  });
  if (foot) {
    g.textAlign = 'left';
    g.font = `500 ${Math.round(h * 0.03)}px ${p.font}`;
    g.fillStyle = ORANGE;
    g.fillText(foot, w * 0.07, h * 0.94, w * 0.86);
  }
}

/** The way out: where to play it, and a QR code to get there. */
function play(p: DeckPen, card: ReelCard): void {
  const { g, w, h } = p;
  backdrop(p);
  heading(p, card.sub, card.title, 0.12);
  const links = card.items ?? [];
  g.textAlign = 'left';
  const size = Math.round(h * 0.05);
  links.slice(0, 2).forEach((l, i) => {
    g.font = `${i === 0 ? 600 : 500} ${i === 0 ? size : Math.round(size * 0.82)}px ${p.font}`;
    g.fillStyle = i === 0 ? YELLOW : PAPER;
    g.fillText(l, w * 0.07, h * 0.5 + i * size * 1.6, w * 0.5);
  });
  p.logo(w * 0.07, h * 0.76, w * 0.17);
  const site = links[2];
  if (site) {
    g.font = `500 ${Math.round(h * 0.038)}px ${p.font}`;
    g.fillStyle = MUTED;
    g.fillText(site, w * 0.07 + w * 0.2, h * 0.76 + h * 0.065);
  }
  // The QR, dark on white with its quiet zone, where a phone in row 12 can read it.
  if (card.link) {
    const m = qrMatrix(card.link);
    const quiet = 4;
    const cell = Math.floor((h * 0.62) / (m.length + 2 * quiet));
    const side = cell * (m.length + 2 * quiet);
    const qx = w * 0.93 - side;
    const qy = h * 0.2;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(qx, qy, side, side, 16);
    g.fill();
    g.fillStyle = '#07090d';
    m.forEach((row, y) => row.forEach((dark, x) => dark && g.fillRect(qx + (x + quiet) * cell, qy + (y + quiet) * cell, cell, cell)));
  }
}

/** Paint a `slide` card full-frame. */
export function paintDeckSlide(p: DeckPen, card: ReelCard): void {
  p.g.save();
  p.g.textBaseline = 'alphabetic';
  if (card.layout === 'flow') flow(p, card);
  else if (card.layout === 'loop') loop(p, card);
  else play(p, card);
  p.g.restore();
}
