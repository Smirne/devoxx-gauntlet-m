/**
 * welld.ts — WellD's mark, drawn rather than pasted.
 *
 * Michele, 29 Sep 2026, with a photograph of a backpack and the logo: *"Add a
 * WellD backpack for me. Hide the welld logo somewhere."* — and then, the same
 * morning: *"sorry, we have a new logo"*. WellD is Michele's own company, and the
 * call to put its mark in the game is Michele's to make (CLAUDE.md's "nothing
 * that needs permission" is about marks nobody here can speak for).
 *
 * The new mark, which this draws: WeLLD in heavy red letters — a W with a flat
 * middle peak, a lowercase e with a flat-bottomed eye, two square Ls — and a D
 * whose counter is a bear's face turned on its side, two ears on the left and
 * two eyes looking out; under it, Dream.Do.Develop in a rounded sans. No asset
 * files in this build, so every letter is a path traced off the logo, in its own
 * coordinates on a 2000-wide sheet (the wordmark is 540 tall, the lockup with the
 * line under it 765); `drawWellD` scales them to whatever it is given.
 *
 * Used twice: on the backpack (`src/render3d/people3d.ts`, Michele's portrait)
 * and on one laptop in the first-floor corridor (`src/render3d/venue.ts`).
 */

/** WellD red. */
export const WELLD_RED = '#e4063b';

/** Height over width: the wordmark alone, and the lockup with Dream.Do.Develop under it. */
export const WELLD_MARK_ASPECT = 540 / 2000;
export const WELLD_LOCKUP_ASPECT = 765 / 2000;

/**
 * Draw the mark with its top-left corner at (x, y), `w` wide, in `colour`.
 * `tagline` adds Dream.Do.Develop under it (then it is `w * WELLD_LOCKUP_ASPECT`
 * tall). The bear's face is a hole: it shows whatever the mark is drawn on.
 */
export function drawWellD(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, o: { colour?: string; tagline?: boolean } = {}): void {
  const k = w / 2000;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = o.colour ?? WELLD_RED;
  const poly = (pts: Array<[number, number]>): void => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fill();
  };
  // W: two outer strokes and a flat-topped middle peak, standing on two feet.
  poly([
    [0, 5],
    [128, 5],
    [205, 375],
    [298, 63],
    [398, 63],
    [493, 375],
    [567, 5],
    [689, 5],
    [553, 532],
    [445, 532],
    [343, 219],
    [244, 532],
    [136, 532],
  ]);
  // e: the bowl, its bar, the lower stroke ending in a slanted cut — and the
  // flat-bottomed eye, a hole.
  ctx.beginPath();
  ctx.moveTo(1018, 363);
  ctx.lineTo(766, 363);
  ctx.bezierCurveTo(775, 410, 820, 437, 873, 437);
  ctx.bezierCurveTo(910, 437, 955, 430, 981, 418);
  ctx.lineTo(996, 508);
  ctx.bezierCurveTo(960, 525, 905, 532, 858, 532);
  ctx.bezierCurveTo(730, 532, 652, 460, 652, 330);
  ctx.bezierCurveTo(652, 200, 730, 120, 842, 120);
  ctx.bezierCurveTo(960, 120, 1020, 200, 1020, 320);
  ctx.closePath();
  ctx.moveTo(766, 287);
  ctx.bezierCurveTo(770, 240, 800, 212, 842, 212);
  ctx.bezierCurveTo(885, 212, 910, 245, 912, 287);
  ctx.closePath();
  ctx.fill('evenodd');
  // L L
  poly([
    [1045, 5],
    [1164, 5],
    [1164, 431],
    [1263, 431],
    [1263, 532],
    [1045, 532],
  ]);
  poly([
    [1292, 5],
    [1410, 5],
    [1410, 431],
    [1509, 431],
    [1509, 532],
    [1292, 532],
  ]);
  // D, its counter a bear's face on its side: ears at top and bottom of the
  // left edge, the round of the head filling the bowl.
  ctx.beginPath();
  ctx.moveTo(1537, 12);
  ctx.bezierCurveTo(1590, 3, 1640, 0, 1697, 0);
  ctx.bezierCurveTo(1880, 0, 2000, 100, 2000, 270);
  ctx.bezierCurveTo(2000, 440, 1880, 540, 1697, 540);
  ctx.bezierCurveTo(1640, 540, 1590, 535, 1537, 525);
  ctx.closePath();
  ctx.moveTo(1716, 100);
  ctx.bezierCurveTo(1810, 95, 1886, 170, 1886, 270);
  ctx.bezierCurveTo(1886, 370, 1810, 445, 1716, 437);
  ctx.bezierCurveTo(1705, 445, 1695, 458, 1680, 458);
  ctx.bezierCurveTo(1660, 458, 1650, 440, 1652, 418);
  ctx.bezierCurveTo(1652, 400, 1660, 390, 1667, 380);
  ctx.bezierCurveTo(1662, 330, 1660, 210, 1667, 155);
  ctx.bezierCurveTo(1658, 145, 1650, 128, 1652, 112);
  ctx.bezierCurveTo(1652, 92, 1665, 80, 1680, 80);
  ctx.bezierCurveTo(1695, 80, 1705, 92, 1716, 100);
  ctx.closePath();
  ctx.fill('evenodd');
  // ...and its eyes.
  for (const [cy, tilt] of [
    [175, 0.5],
    [365, -0.5],
  ]) {
    ctx.beginPath();
    ctx.ellipse(1792, cy, 41, 30, tilt, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.tagline) {
    // Dream.Do.Develop, fitted to the sheet's own span whatever the font.
    const text = 'Dream.Do.Develop';
    ctx.font = 'bold 160px "Ubuntu", "Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.textBaseline = 'alphabetic';
    const span = 1428;
    const m = ctx.measureText(text).width || span;
    ctx.save();
    ctx.translate(290, 732);
    ctx.scale(span / m, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
