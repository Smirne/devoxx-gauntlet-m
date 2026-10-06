/**
 * deck.ts — the stage demo's closing slides, played on Room 8's house screen.
 *
 * Michele, 6 Oct 2026, for his Devoxx talk: the film that ends the game becomes his
 * last slides, turned by hand (arrows). The title as the splash draws it, how the
 * game was found, the gauntlet loop, the credits, then "play it at lunch". No
 * bloopers: the talk is four minutes. Same rule as the film (`reel.ts`) — the sim
 * decides what is on the screen, the renderer paints a card — so the deck is data.
 */

import { FILM_CREDITS, REEL_PREROLL } from './reel';
import type { ReelCard, ReelView } from './types';

/** Where the game lives, for the QR code and the closing slide. */
export const PLAY_URL = 'https://devoxx-after-dark.vercel.app';

/**
 * Dark seconds before the first slide. The film's own (`REEL_PREROLL`) ends while the camera
 * is still easing up to the screen (about a tenth of the move left), which on a title that is
 * fading in reads as a zoom; the deck waits for the camera to land.
 */
export const DECK_PREROLL = REEL_PREROLL + 1.8;

/** Fade-in of a slide after a key, seconds. */
const FADE = 0.4;
/** A slide waits for a key, so its hold is nominal. */
const HELD = 1;

export function buildDeck(): ReelCard[] {
  const credit = (title: string): ReelCard => {
    const c = FILM_CREDITS.find((f) => f.title.startsWith(title));
    if (!c) throw new Error(`no film credit for ${title}`);
    return { ...c, hold: HELD };
  };
  return [
    { title: 'AFTER DARK', sub: 'Devoxx Belgium · Kinepolis Antwerp', hold: HELD, kind: 'splash' },
    {
      title: 'Find the game before you build it',
      sub: 'How I did it',
      hold: HELD,
      kind: 'slide',
      layout: 'flow',
      items: ['Ideas & brainstorm', '12 proofs of concept', 'Gameplay in 2D', '2.5D + 3D in parallel', 'One 3D game'],
    },
    {
      title: 'One prompt. One loop. One benchmark.',
      sub: 'How I did it · The gauntlet loop',
      hold: HELD,
      kind: 'slide',
      layout: 'loop',
      items: [
        'One prompt|The lead agent splits the goal. Each piece gets its own pair: a builder and a blind critic.',
        'One loop|Build, screenshot, compare with the reference, fix the biggest gap. Again.',
        'One benchmark|A concrete reference: Cyberpunk 2077, Machinarium early on. Not “make it professional”.',
        'Loops until the build beats the reference, or you decide it is ready.',
      ],
    },
    credit('Michele'),
    credit('Claude'),
    credit('Voxxy'),
    {
      title: 'Play it at lunch',
      sub: 'Come and find us',
      hold: HELD,
      kind: 'slide',
      layout: 'play',
      items: ['devoxx-after-dark.vercel.app', 'github.com/Smirne/devoxx-gauntlet-m', 'welld.ch'],
      link: PLAY_URL,
    },
  ];
}

/**
 * The deck as the renderer's `ReelView`: dark through the regroup, then slide
 * `index`, `since` seconds after the key that brought it up. `len` is only the
 * film's contract; a deck has no end but the presenter's.
 */
export function deckAt(cards: readonly ReelCard[], index: number, t: number, since: number): ReelView {
  if (t < DECK_PREROLL) return { t, len: Infinity, index: 0, card: null, alpha: 0 };
  return { t, len: Infinity, index, card: cards[index] ?? null, alpha: Math.max(0, Math.min(1, since / FADE)) };
}
