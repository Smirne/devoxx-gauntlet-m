/**
 * The WellD mark, and the one colour it is allowed to be.
 *
 * Michele asked for the logo and the website on the credits screen. The game
 * ships no external asset files on purpose (`CLAUDE.md`: no external 3D or audio
 * assets; everything else is drawn in code), and a company's logo is the one
 * thing that must NOT be "drawn in code" — a hand-traced wordmark is a wrong
 * wordmark. So it is the real artwork, resampled to the size the panel shows it
 * at (440x220) and quantised to 64 colours, inlined as a data URI: 6 KB, no
 * network, and the published build stays one self-contained file.
 *
 * It keeps its transparent background, and the panel puts it on a white plate,
 * because the tagline is black and would otherwise vanish into a dark screen.
 * Recolouring somebody's logo to suit your palette is not a liberty to take.
 */
export const WELLD_RED = '#c9102e';
export const WELLD_SITE = 'welld.ch';

/** The mark at 440x220, transparent, as a `data:` URI. */
export const WELLD_LOGO =
  'data:image/png;base64,' +
  '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';
