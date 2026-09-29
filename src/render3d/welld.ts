/**
 * welld.ts — WellD's mark, drawn rather than pasted.
 *
 * Michele, 29 Sep 2026, with a photograph of a backpack and the logo: *"Add a
 * WellD backpack for me. Hide the welld logo somewhere."* WellD is Michele's
 * own company, and the call to put its mark in the game is Michele's to make
 * (CLAUDE.md's "nothing that needs permission" is about marks nobody here can
 * speak for). No asset files in this build, so it is drawn the way the logo is
 * built: a red block with two rounded corners, and `wellD` in one white stroke
 * weight — the w two joined U's, the e a ring cut open on the right with its bar
 * on the diagonal, two l's, and a D. Coordinates are the logo's own, on a
 * 2000 x 770 block; `drawWellD` scales them to whatever it is given.
 *
 * Used twice: on the backpack (`src/render3d/people3d.ts`, Michele's portrait)
 * and on one laptop in the first-floor corridor (`src/render3d/venue.ts`).
 */

/** WellD red. */
export const WELLD_RED = '#c41230';

/** The block's aspect: 2000 wide, 770 tall. */
export const WELLD_ASPECT = 770 / 2000;

/** Draw the mark with its top-left corner at (x, y), `w` wide. */
export function drawWellD(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const k = w / 2000;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  // The block: square top-right and bottom-left, the other two corners rounded.
  ctx.fillStyle = WELLD_RED;
  ctx.beginPath();
  ctx.moveTo(0, 770);
  ctx.lineTo(0, 300);
  ctx.bezierCurveTo(0, 95, 95, 0, 300, 0);
  ctx.lineTo(2000, 0);
  ctx.lineTo(2000, 470);
  ctx.bezierCurveTo(2000, 675, 1905, 770, 1700, 770);
  ctx.closePath();
  ctx.fill();
  // The letters: one white stroke, square-ended.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 47;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  const path = (draw: () => void): void => {
    ctx.beginPath();
    draw();
    ctx.stroke();
  };
  // w: two U's sharing the middle stem.
  path(() => {
    ctx.moveTo(239, 277);
    ctx.lineTo(239, 520);
    ctx.arc(342.75, 520, 103.75, Math.PI, 0, true);
    ctx.lineTo(446.5, 277);
  });
  path(() => {
    ctx.moveTo(446.5, 520);
    ctx.arc(549.75, 520, 103.25, Math.PI, 0, true);
    ctx.lineTo(653, 277);
  });
  // e: the ring from its cut on the right, round the bottom and over the top to
  // where the bar meets it, and the bar down to the inside of the ring.
  path(() => {
    ctx.arc(921, 458, 165.5, 0, Math.PI * 2 - 0.6);
    // Into the ring's own stroke, so the bar's end is buried in it, not butted.
    ctx.lineTo(784, 540);
  });
  // l l
  path(() => {
    ctx.moveTo(1199, 112);
    ctx.lineTo(1199, 640);
    ctx.moveTo(1321.5, 112);
    ctx.lineTo(1321.5, 640);
  });
  // D
  path(() => {
    ctx.moveTo(1437.5, 112);
    ctx.lineTo(1437.5, 640);
    ctx.moveTo(1414, 135.5);
    ctx.lineTo(1530, 135.5);
    ctx.arc(1530, 376.25, 240.75, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(1414, 617);
  });
  ctx.restore();
}
