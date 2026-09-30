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

import { REEL_PREROLL, buildReel, reelAt, reelLength } from '../src/sim/reel';

const perfect = { soup: 100, temp: 92, spare: 40, complaints: 0, keynoteComplaints: 0, oom: 0, cable: 0 };

describe('the opening video', () => {
  /*
   * Michele, 29 Sep: *"I'd start with Devoxx After Dark (like in the splash
   * screen), A game by Michele Giacobazzi (pic of my char?). Then the bloopers /
   * notes? Or credits in film version?"* The title as the splash draws it, the
   * author, the night, the credits, and the running joke last. Then, 30 Sep:
   * *"my card appears twice. Keep just the second one"* — he is named once, on
   * his credit — and WellD is credited *"With the support of"*, not "Sponsor".
   */
  it('opens on the title, names its author once, and ends on the credits and the running joke', () => {
    const cards = buildReel(perfect, [], 400);
    expect(cards[0]).toMatchObject({ title: 'AFTER DARK', kind: 'splash' });
    expect(cards.filter((c) => `${c.title} ${c.sub}`.includes('Michele Giacobazzi'))).toHaveLength(1);
    expect(cards.find((c) => c.title === 'WellD')?.sub).toBe('With the support of');
    expect(cards[cards.length - 1]).toMatchObject({ title: 'KEYNOTE SPEAKER', sub: 'TBA', kind: 'end' });
    const credits = cards.filter((c) => c.kind === 'credit');
    expect(credits.map((c) => c.title)).toEqual(['Michele Giacobazzi', 'Claude, in Claude Code', 'Ronny Shamano', 'WellD', 'Voxxy, Droid and Biggy']);
    // ...all of them after the night's own cards, and right before the joke.
    const firstCredit = cards.findIndex((c) => c.kind === 'credit');
    expect(cards.slice(firstCredit, -1).every((c) => c.kind === 'credit')).toBe(true);
  });

  it('holds a dark beat before the first card, while the three regroup and the camera goes up', () => {
    const cards = buildReel(perfect, [], 400);
    expect(reelAt(cards, 0).card).toBeNull();
    expect(reelAt(cards, REEL_PREROLL - 0.05).card).toBeNull();
    expect(reelAt(cards, REEL_PREROLL + 1).card?.kind).toBe('splash');
  });

  it('has nothing to show for a clean run, and says so', () => {
    const cards = buildReel(perfect, [], 400);
    const bloopers = cards.filter((c) => c.kind === 'blooper');
    expect(bloopers).toHaveLength(1);
    expect(bloopers[0].title).toBe('A flawless night.');
  });

  /*
   * THE FLAWLESS CARD HAS TO BE REACHABLE BY PLAYING WELL.
   *
   * Michele, 28 Sep: *"What happens if I have no bloopers... not dropping any
   * soup?"* — and it turned out the answer was "you still get one", because the
   * cable card fired on any run at all and chapter 2 cannot be finished without
   * paying cable out. The only player who ever saw "A flawless night." was the one
   * who skipped the entire game, which `defaultScore` fills in as a clean run.
   * Both halves of that are asserted here.
   */
  it('gives the flawless card to a clean run that ran the cable the short way', () => {
    // The signposted route down the right-hand wall: a little over half the reel.
    const cards = buildReel({ ...perfect, cable: 706 }, ['duck'], 612);
    const bloopers = cards.filter((c) => c.kind === 'blooper');
    expect(bloopers).toHaveLength(1);
    expect(bloopers[0].title, 'a tidy cable run counted as a blooper').toBe('A flawless night.');
    expect(cards.map((c) => c.title)).not.toContain('The bloopers');
  });

  it('still calls out a cable dragged round the hall', () => {
    const cards = buildReel({ ...perfect, cable: 1400 }, [], 612);
    expect(cards.map((c) => c.title)).toContain('112 m of network cable');
    expect(cards.map((c) => c.title), 'a 112 m cable run was called flawless').not.toContain('A flawless night.');
  });

  it('says on the video which chapters were skipped, and never calls that flawless', () => {
    // What `defaultScore` writes for a skipped chapter: a clean one.
    const skippedClean = { soup: 100, temp: 100, complaints: 0, keynoteComplaints: 0, spare: 0, cable: 0 };
    const cards = buildReel(skippedClean, [], 34, [1, 2, 3, 4]);
    const titles = cards.map((c) => c.title);
    expect(titles).toContain('4 chapters skipped');
    expect(titles, 'skipping the whole game was called a flawless night').not.toContain('A flawless night.');
    const sub = cards.find((c) => c.title === '4 chapters skipped')?.sub ?? '';
    expect(sub).toContain('Chapters 1, 2, 3, 4');

    // One skipped chapter is singular, and named.
    const one = buildReel({ ...perfect, cable: 690 }, [], 420, [3]);
    expect(one.map((c) => c.title)).toContain('1 chapter skipped');
    expect(one.find((c) => c.title === '1 chapter skipped')?.sub ?? '').toContain('Chapter 3');
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
    expect(titles).toContain('118 m of network cable');
    expect(titles).toContain('512 seconds');
    expect(titles).toContain('2/3 swag');
    // ...and it stays a reel: four bloopers at most, however bad the night was.
    expect(cards.filter((c) => c.kind === 'blooper').length).toBeLessThanOrEqual(4);
  });

  it('is a fixed length, and every second of it is on a card or a cut', () => {
    const cards = buildReel({ ...perfect, complaints: 5, oom: 2 }, ['duck'], 300);
    const len = reelLength(cards);
    expect(len).toBeGreaterThan(10);
    // The title and the credit cards made it a film rather than a
    // clip (29 Sep); the worst case, every blooper slot and the swag, still ends
    // inside three quarters of a minute.
    expect(len).toBeLessThan(45);
    const worst = buildReel({ ...perfect, soup: 40, complaints: 5, oom: 2, cable: 1400, spare: 5, lateT: 30 }, ['duck', 'sticker', 'race'], 300, [2]);
    expect(reelLength(worst)).toBeLessThan(45);
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
