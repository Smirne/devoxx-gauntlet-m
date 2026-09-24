/**
 * THE RUN SHEET, THE METER AND THE NUDGE — `I` and `H`.
 *
 * Michele's standing priority is *"making it playable and finishing all
 * chapters"*, and the two things a stuck player had were the briefing at the top
 * (which says what the chapter is, once) and the progress line at the bottom
 * (which says what is happening, now). Neither answers "what is left" or "what do
 * I do about it".
 *
 * `GameSnapshot.tasks` answers both, so the contract the overlay leans on is
 * asserted here rather than in the overlay: the HUD cannot show a `who` chip a
 * chapter never published, and the escalation cannot offer a step the task has no
 * data for. The ladder itself is `nudgeStep`, lifted out of the DOM closure
 * exactly so it can be checked without one.
 */

import { describe, expect, it } from 'vitest';

import { createGame, type DebugGame, type Task } from '../src/sim';
import { nudgeStep } from '../src/render/hud';

const CHAPTERS = [1, 2, 3, 4] as const;
const tasksOf = (n: number): Task[] =>
  (createGame({ seed: 20260930, chapter: n, cards: false }) as DebugGame).snapshot().tasks;

describe('every chapter publishes a run sheet the overlay can draw', () => {
  for (const n of CHAPTERS) {
    it(`chapter ${n}: a list, with stable ids and something to read on every row`, () => {
      const list = tasksOf(n);
      expect(list.length, 'no run sheet at all').toBeGreaterThan(0);
      const ids = new Set(list.map((t) => t.id));
      expect(ids.size, 'two tasks share an id — the hint count would leak between them').toBe(list.length);
      for (const t of list) {
        expect(t.id, 'a task with no id').not.toBe('');
        expect(t.text.length, `"${t.id}" has nothing to read`).toBeGreaterThan(8);
        // An imperative line, not a sentence with a full stop and not markup.
        expect(t.text, `"${t.id}" carries markup`).not.toMatch(/[<>]/);
      }
    });

    it(`chapter ${n}: nothing is done before the player has touched it`, () => {
      // The meter reads 0 of N on the first frame, or it is lying about the
      // chapter — and the first undone task, which is what H acts on, is row one.
      const list = tasksOf(n);
      expect(list.some((t) => t.done), 'a task was already done at the start').toBe(false);
      expect(list.find((t) => !t.done)?.id).toBe(list[0].id);
    });

    it(`chapter ${n}: a sub-count is complete, or it is not there`, () => {
      for (const t of tasksOf(n)) {
        if (t.of === undefined) continue;
        expect(t.of, `"${t.id}" counts to nothing`).toBeGreaterThan(1);
        expect(t.n ?? 0, `"${t.id}" starts part-done`).toBe(0);
      }
    });

    it(`chapter ${n}: every task can be asked about at least once`, () => {
      // `H` must always say something. A task with no who, no hint and no place
      // still answers — with the truth that there is nothing more to give.
      for (const t of tasksOf(n)) {
        expect(nudgeStep(t, 0, true), `"${t.id}" swallowed the first press`).toBeGreaterThanOrEqual(1);
      }
    });
  }
});

describe('the nudge ladder', () => {
  const full: Task = { id: 'a', text: 'do the thing', done: false, who: 'voxxy', at: { x: 1, y: 2 }, hint: 'try there' };

  it('climbs one step per press and then stops', () => {
    expect(nudgeStep(full, 0, true)).toBe(1);
    expect(nudgeStep(full, 1, true)).toBe(2);
    expect(nudgeStep(full, 2, true)).toBe(3);
    expect(nudgeStep(full, 3, true), 'the ladder kept climbing past the ring').toBe(3);
  });

  it('skips the step a task has no data for, rather than spending a press on nothing', () => {
    const noWho: Task = { ...full, who: undefined };
    expect(nudgeStep(noWho, 0, true), 'first press named a robot that was never published').toBe(2);
    const noHint: Task = { ...full, hint: undefined };
    expect(nudgeStep(noHint, 1, true)).toBe(3);
  });

  it('stops at the line when there is nowhere to point', () => {
    const nowhere: Task = { ...full, at: undefined };
    expect(nudgeStep(nowhere, 1, true)).toBe(2);
    expect(nudgeStep(nowhere, 2, true), 'it offered a ring for a task with no place').toBe(2);
  });

  it('stops at the line when the HUD has no projector, which is the headless case', () => {
    expect(nudgeStep(full, 2, false)).toBe(2);
  });

  it('never climbs past 1 for a task that publishes nothing but its text', () => {
    const bare: Task = { id: 'b', text: 'work it out', done: false };
    expect(nudgeStep(bare, 0, true)).toBe(1);
    expect(nudgeStep(bare, 1, true)).toBe(1);
  });
});
