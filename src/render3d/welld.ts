/**
 * welld.ts — WellD's mark on the 3D build's canvas textures.
 *
 * Michele, 29 Sep 2026: *"Add a WellD backpack for me. Hide the welld logo
 * somewhere."*, and then *"sorry, we have a new logo"*. WellD is Michele's own
 * company, and the call to put its mark in the game is Michele's to make
 * (CLAUDE.md's "nothing that needs permission" is about marks nobody here can
 * speak for).
 *
 * The mark is NOT drawn here. It was, for a morning — traced glyph by glyph off
 * a picture of the logo — and then the merge brought in the 2.5D line's credits
 * screen, which carries the artwork itself: the vector Michele sent, inlined
 * (`WELLD_LOGO`, `src/render/welld.ts`), on the rule that a hand-traced
 * wordmark is a wrong wordmark. One logo and one red for both builds, so this
 * only paints that artwork into a canvas: all of it, or the wordmark without
 * Dream.Do.Develop under it.
 *
 * Used on the backpack (`src/render3d/people3d.ts`, Michele's portrait) and on
 * one laptop in the first-floor corridor (`src/render3d/venue.ts`).
 */

import { WELLD_LOGO } from '../render/welld';

/** The artwork's own box, and how much of it is the wordmark above the tagline. */
const VIEW_W = 900;
const VIEW_H = 343;
const MARK_H = 250;

/** Height over width: the wordmark alone, and the lockup with Dream.Do.Develop under it. */
export const WELLD_MARK_ASPECT = MARK_H / VIEW_W;
export const WELLD_LOCKUP_ASPECT = VIEW_H / VIEW_W;

/*
 * One decoded image for every canvas that wants it. An SVG drawn into a canvas
 * needs its size on the root element (some browsers refuse `drawImage` on one
 * that only has a viewBox), so the markup gets the viewBox's own size.
 */
let art: HTMLImageElement | null = null;
let ready = false;
const waiting: Array<() => void> = [];

function load(): void {
  if (art) return;
  art = new Image();
  art.onload = (): void => {
    ready = true;
    for (const f of waiting.splice(0)) f();
  };
  art.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(WELLD_LOGO.replace('<svg ', `<svg width="${VIEW_W}" height="${VIEW_H}" `))}`;
}

/**
 * Paint the mark into `ctx` with its top-left corner at (x, y), `w` wide — the
 * whole lockup with `tagline`, else the wordmark alone — then call `painted`,
 * which is where a texture flags itself for upload. The artwork decodes
 * asynchronously, so `painted` always runs later, never inside this call: the
 * caller's texture exists by then even if this was called while building it.
 */
export function paintWellD(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, o: { tagline?: boolean }, painted: () => void): void {
  const sh = o.tagline ? VIEW_H : MARK_H;
  const draw = (): void => {
    ctx.drawImage(art as HTMLImageElement, 0, 0, VIEW_W, sh, x, y, w, (w * sh) / VIEW_W);
    painted();
  };
  load();
  if (ready) queueMicrotask(draw);
  else waiting.push(draw);
}
