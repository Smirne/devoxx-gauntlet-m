/**
 * THE OPENING VIDEO — Devoxx's, cut from the run you just played.
 *
 * Michele: *"Devoxx usually starts with a video. We could have one recapping the
 * robots adventures.. or bloopers?"*, then *"Movie approved, build it."*
 *
 * The reel is a pure function of the run's own counters, which is the property
 * worth holding on to: every card is something that really happened, a clean run
 * has its own card, and the thing is a fixed length so the ending cannot hang.
 */

import { describe, expect, it } from 'vitest';

import { buildReel, reelAt, reelLength } from '../src/sim/reel';

const perfect = { soup: 100, temp: 92, spare: 40, complaints: 0, keynoteComplaints: 0, oom: 0, cable: 0 };

describe('the opening video', () => {
  it('opens on Devoxx and ends on the running joke', () => {
    const cards = buildReel(perfect, [], 400);
    expect(cards[0].title).toBe('DEVOXX BELGIUM');
    expect(cards[cards.length - 1]).toMatchObject({ title: 'KEYNOTE SPEAKER', sub: 'TBA', kind: 'end' });
  });

  it('has nothing to show for a clean run, and says so', () => {
    const cards = buildReel(perfect, [], 400);
    const bloopers = cards.filter((c) => c.kind === 'blooper');
    expect(bloopers).toHaveLength(1);
    expect(bloopers[0].title).toBe('A flawless night.');
  });

  it('cuts the bloopers from the counters the chapters actually wrote', () => {
    const cards = buildReel(
      { ...perfect, complaints: 2, keynoteComplaints: 1, oom: 1, soup: 60, temp: 44, cable: 1480, spare: 6 },
      ['duck', 'lap'],
      512,
    );
    const titles = cards.map((c) => c.title);
    // Three complaints across two chapters is one line, not two.
    expect(titles).toContain('3 attendees bowled over');
    expect(titles).toContain('OutOfMemoryError');
    expect(titles).toContain('40% of the soup on the floor');
    expect(titles).toContain('1480 px of network cable');
    expect(titles).toContain('512 seconds');
    expect(titles).toContain('2/3 swag');
    // ...and it stays a reel: four bloopers at most, however bad the night was.
    expect(cards.filter((c) => c.kind === 'blooper').length).toBeLessThanOrEqual(4);
  });

  it('is a fixed length, and every second of it is on a card or a cut', () => {
    const cards = buildReel({ ...perfect, complaints: 5, oom: 2 }, ['duck'], 300);
    const len = reelLength(cards);
    expect(len).toBeGreaterThan(10);
    expect(len).toBeLessThan(30);
    // Walked at 30 Hz: the index never goes backwards, every card is shown, and
    // the fade is always a real number between 0 and 1.
    let seen = 0;
    let last = -1;
    for (let t = 0; t < len; t += 1 / 30) {
      const v = reelAt(cards, t);
      expect(v.index).toBeGreaterThanOrEqual(last);
      last = v.index;
      expect(v.alpha).toBeGreaterThanOrEqual(0);
      expect(v.alpha).toBeLessThanOrEqual(1);
      if (v.card && v.alpha > 0.99) seen = Math.max(seen, v.index + 1);
    }
    expect(seen, 'a card never came fully up').toBe(cards.length);
    // Past the end there is nothing to draw.
    expect(reelAt(cards, len + 1).card).toBeNull();
  });
});
