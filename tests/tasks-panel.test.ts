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
import { hintLines, markLevel, nudgeStep } from '../src/render/hud';

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

    it(`chapter ${n}: a task that names robots names ALL of them`, () => {
      // "light the orange + green mix" needs Voxxy AND Droid, and `who` used to
      // be `need[0]`, so the hint named one of the two — a wrong answer rather
      // than half an answer. Michele: *"some task need multiple robots"*.
      for (const t of tasksOf(n)) {
        if (t.who === undefined) continue;
        expect(t.who.length, `"${t.id}" published an empty crew`).toBeGreaterThan(0);
        expect(new Set(t.who).size, `"${t.id}" names a robot twice`).toBe(t.who.length);
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
  const full: Task = { id: 'a', text: 'do the thing', done: false, who: ['voxxy'], at: { x: 1, y: 2 }, hint: 'try there' };

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

/**
 * A task with a gate in front of it gets a rung for the gate.
 *
 * Michele, 25 Sep 2026: *"there might be also intermediate challenges (eg: open
 * the door for clue 3 with Droid and Biggy). They might need a clue too?"* — so
 * `Task.hint` takes a list and `H` walks it before it offers the ring.
 */
describe('a ladder with more than one line on it', () => {
  const two: Task = {
    id: 'c',
    text: 'light the green + blue mix',
    done: false,
    who: ['droid', 'biggy'],
    at: { x: 1, y: 2 },
    hint: ['the door first', 'then the mix'],
  };

  it('gives each line its own press, and puts the ring after all of them', () => {
    expect(markLevel(two)).toBe(4);
    expect(nudgeStep(two, 0, true)).toBe(1);
    expect(nudgeStep(two, 1, true)).toBe(2);
    expect(nudgeStep(two, 2, true)).toBe(3);
    expect(nudgeStep(two, 3, true)).toBe(4);
    expect(nudgeStep(two, 4, true), 'the ladder kept climbing past the ring').toBe(4);
  });

  it('stops after the last line when there is nowhere to point', () => {
    const nowhere: Task = { ...two, at: undefined };
    expect(nudgeStep(nowhere, 2, true)).toBe(3);
    expect(nudgeStep(nowhere, 3, true), 'it offered a ring for a task with no place').toBe(3);
  });

  it('reads a single string as a ladder of one, which is what every other task is', () => {
    expect(hintLines({ ...two, hint: 'just the one' })).toEqual(['just the one']);
    expect(hintLines({ ...two, hint: undefined })).toEqual([]);
    expect(markLevel({ ...two, hint: undefined }), 'the ring moved off rung 3').toBe(3);
  });
});

/**
 * ...and chapter 1 actually publishes those gates, on the two clues that have one.
 *
 * The middle cinema is behind a magnetic lock (Droid off Biggy's shoulders) and
 * cinema E is behind a jammed leaf (Biggy at a run). Both are a whole puzzle in
 * front of the puzzle, and the line about them has to go before the line about
 * the light mix — a player standing at a locked door does not need to be told
 * which two lamps to mix once they are inside.
 */
describe('chapter 1 hints at the door before it hints at the mix', () => {
  const ch1 = (): Task[] => tasksOf(1);

  it('puts the gate first on the two clues that are behind one', () => {
    const by = new Map(ch1().map((t) => [t.id, t]));
    for (const [id, want] of [
      ['clue3', /lock|release|shoulders|up/i],
      ['clue4', /jam|weight|speed/i],
    ] as const) {
      const lines = hintLines(by.get(id) as Task);
      expect(lines.length, `${id} has no gate line`).toBeGreaterThan(1);
      expect(lines[0], `${id}'s first line is not about the door`).toMatch(want);
      expect(lines[0], `${id}'s gate line hands over the digit`).not.toMatch(/\d/);
    }
  });

  it('leaves the clues that are simply in an open room on one line', () => {
    for (const id of ['clue1', 'clue2']) {
      const t = ch1().find((o) => o.id === id) as Task;
      expect(hintLines(t), `${id} invented a gate`).toHaveLength(1);
    }
  });
});
