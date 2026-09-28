/**
 * reel.ts — the Devoxx opening video, cut from the run you just played.
 *
 * ## What it is
 *
 * Michele, 26 Sep 2026: *"Devoxx usually starts with a video. We could have one
 * recapping the robots adventures.. or bloopers?"* — then *"Movie approved, build
 * it."*
 *
 * So the game ends the way the conference starts: the three robots reach the stage
 * in Room 8, the house screen behind them wakes up, and the opening video plays —
 * and the video is the BLOOPER reel of the night that has just happened. Every
 * card on it is a number this run actually produced: the attendees somebody bowled
 * over, the heap error the sixth crate threw, how cold the soup was when it landed,
 * how much cable Voxxy dragged across the hall.
 *
 * ## Why the cards are built here and not in the renderer
 *
 * Because they are *the run*, and the run belongs to the sim (CLAUDE.md). This
 * module is a pure function of `score`, `swag` and the clock — no clock of its own,
 * no randomness, no DOM — so a test can play a chapter and read the reel it would
 * produce, and the renderer is handed one card and an alpha and draws exactly that.
 *
 * A perfect run is the one case worth designing for: with nothing broken the reel
 * has nothing to show, which is funnier than any blooper, so it says so and stops.
 */

import type { ReelCard, ReelView } from './types';

/** Fade in and out at each end of a card, seconds. */
const FADE = 0.4;
/** Black between cards — the beat that makes it read as a cut and not a crossfade. */
const GAP = 0.22;
/** At most this many blooper cards, so the reel stays a reel and not a report. */
const MAX_BLOOPERS = 4;

const s = (n: number): string => (n === 1 ? '' : 's');

/**
 * The cards, in order, from the run's own counters.
 *
 * `score` is the flat bag every chapter writes into (`ChapterCtx.score`) and
 * `swag` the three collectables; `total` is the run's length in seconds.
 */
export function buildReel(score: Record<string, number>, swag: readonly string[], total: number): ReelCard[] {
  const n = (k: string): number => Math.max(0, Math.round(score[k] ?? 0));
  const complaints = n('complaints') + n('keynoteComplaints');
  const soup = n('soup');
  const temp = n('temp');
  const oom = n('oom');
  const cable = n('cable');
  const spare = n('spare');

  const bloopers: ReelCard[] = [];
  const add = (title: string, sub: string): void => {
    if (bloopers.length < MAX_BLOOPERS) bloopers.push({ title, sub, hold: 2.5, kind: 'blooper' });
  };

  // Ordered by how much they say about the night, not by size.
  if (complaints > 0) {
    add(`${complaints} attendee${s(complaints)} bowled over`, 'No robot has been charged.');
  }
  if (oom > 0) {
    add('OutOfMemoryError', `Thrown ${oom} time${s(oom)} at the beer stack. Biggy regrets nothing.`);
  }
  if (soup > 0 && soup < 100) {
    add(`${100 - soup}% of the soup on the floor`, `The rest went out at ${temp}°.`);
  } else if (temp > 0 && temp < 60) {
    add(`Tomato soup, ${temp}°`, 'Served at the speed of a robot who is not in a hurry.');
  }
  if (cable > 0) {
    add(`${cable} px of network cable`, 'Dragged the length of the hall by the smallest robot in it.');
  }
  if (spare > 0 && spare < 20) {
    add(`Stage ready with ${spare}s to spare`, 'Nobody in that room needs to know.');
  }

  const cards: ReelCard[] = [
    { title: 'DEVOXX BELGIUM', sub: 'Kinepolis Antwerpen · the opening video', hold: 2.6, kind: 'title' },
    { title: 'AFTER DARK', sub: 'One night shift. Three robots. Four chapters.', hold: 2.4, kind: 'title' },
    { title: `${Math.round(total)} seconds`, sub: 'From lights-out to the keynote.', hold: 2.2, kind: 'stat' },
  ];
  if (bloopers.length === 0) {
    cards.push({ title: 'A flawless night.', sub: 'Suspicious.', hold: 2.8, kind: 'blooper' });
  } else {
    cards.push({ title: 'The bloopers', sub: 'Every number below really happened.', hold: 1.8, kind: 'title' });
    cards.push(...bloopers);
  }
  if (swag.length > 0) {
    cards.push({
      title: `${swag.length}/3 swag`,
      sub: swag.join(' · '),
      hold: 2.2,
      kind: 'stat',
    });
  }
  cards.push({ title: 'KEYNOTE SPEAKER', sub: 'TBA', hold: 3, kind: 'end' });
  return cards;
}

/** How long the whole reel runs, seconds. */
export const reelLength = (cards: readonly ReelCard[]): number =>
  cards.reduce((a, c) => a + c.hold + GAP, 0);

/**
 * Which card is on screen at `t`, and how far up it is faded.
 *
 * Returns `card: null` during the black beat between two cards, which is a state
 * the renderer draws (a dark screen) rather than a gap it has to invent.
 */
export function reelAt(cards: readonly ReelCard[], t: number): ReelView {
  const len = reelLength(cards);
  let at = t;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (at < c.hold) {
      const alpha = Math.min(1, Math.min(at, c.hold - at) / FADE);
      return { t, len, index: i, card: c, alpha: Math.max(0, alpha) };
    }
    at -= c.hold + GAP;
    if (at < 0) return { t, len, index: i, card: null, alpha: 0 };
  }
  return { t, len, index: cards.length, card: null, alpha: 0 };
}
