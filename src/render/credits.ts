/**
 * WHO MADE THIS, AND HOW — the credits screen, on `C`.
 *
 * Michele, 29 Sep 2026: *"We should work on credits. Mentioning me, you, and some
 * info on the process (4 repository, 10 gameplay POC, transition from 2, to 2.5
 * to 3D, xxxx tokens, xxx agents, xxx loops..). Should contain the welld Logo and
 * website."*
 *
 * **Every number here was measured, not remembered.** The submission's own GenAI
 * section is five points and its whole value is being true, so a figure that
 * could not be counted off the repository or off a session transcript is not on
 * this screen. Where a count is only what this one session can see, it says so.
 * The commands behind them are in `docs/genai-notes.md`, under the session of
 * 29 Sep, so anybody can re-run them and get the same figures.
 *
 * The panel is pure data here and markup in `hud.ts`, the same split the run
 * sheet uses: nothing in this file knows what a `<div>` is.
 */

/** A line of the process story: a number, what it counts, and the detail under it. */
export interface CreditStat {
  readonly n: string;
  readonly label: string;
  readonly note: string;
}

/** A person, a machine, or a company, and what they did. */
export interface CreditRole {
  readonly who: string;
  readonly what: string;
}

export const CREDIT_TITLE = 'After Dark';
export const CREDIT_SUB = 'Devoxx Belgium 2026 · Robot Games';

export const CREDIT_ROLES: readonly CreditRole[] = [
  {
    who: 'Michele Giacobazzi',
    what:
      'Direction, design and every decision that stuck. Found the venue, chose the night shift, ' +
      'played every build and said what was wrong with it — the ladle, the cake, the frozen ending, ' +
      'the robot walking through a table.',
  },
  {
    who: 'Claude Opus 5, in Claude Code',
    what:
      'Wrote the simulation, the renderer, the venue, the three robots, the music and the tests. ' +
      'Proposed a great deal that was rejected, which is the half of this that took the time.',
  },
  {
    who: 'WellD',
    what: 'Where the two of us work, and who paid for the nights.',
  },
];

/**
 * The process, in figures.
 *
 * `4 repositories` is Michele's count of the whole effort; three are nameable
 * here (`gauntlet-loop-experiment`, the method; `devoxx-game-experiments`, the
 * ten prototypes; `devoxx-gauntlet-m`, this game) and the fourth is his.
 */
export const CREDIT_STATS: readonly CreditStat[] = [
  {
    n: '4',
    label: 'repositories',
    note: 'the method, the prototypes, this game, and the one before all of them',
  },
  {
    n: '10',
    label: 'gameplay prototypes',
    note: 'one HTML file each, 01 playground to 10 the real Kinepolis — nine of them thrown away',
  },
  {
    n: '2D → 2.5D → 3D',
    label: 'three engines, one simulation',
    note:
      'the prototypes were flat canvas; then an isometric renderer reading a headless 2D sim; ' +
      'then a third-person camera reading the same sim, unchanged',
  },
  {
    n: '296',
    label: 'commits in 7 days',
    note: '294 of them written by the model, 2 by the human — 22 to 29 September 2026',
  },
  {
    n: '80,213',
    label: 'lines of TypeScript',
    note: '58,635 of game in 86 files, 21,578 of tests in 64 — 821 tests, no physics engine',
  },
  {
    n: '108,625',
    label: 'words of notes',
    note: '72,287 of them the GenAI record: what was built, what a human decided, what was rejected',
  },
  {
    n: '44',
    label: 'subagents',
    note: 'critics, explorers and builders spawned inside one session, plus 6 orchestrated workflows',
  },
  {
    n: '4,453',
    label: 'tool calls, one session',
    note: '3,906 of them a shell — 7,245 model turns answering 233 messages from Michele',
  },
  {
    n: '2.15 B',
    label: 'tokens, one session',
    note: '6.2 million of them written by the model; the rest is context, read again every turn',
  },
];

/**
 * The line under the numbers. It is the honest caveat, and it belongs on the
 * screen rather than in a footnote nobody opens: the per-session figures are one
 * session's, and this game was built across several.
 */
export const CREDIT_FOOTNOTE =
  'Counted off the repository and this session’s own transcript on 29 September 2026. ' +
  'The session figures are one session of several, so they are a floor, not a total.';

export const CREDIT_CLOSE = 'C or Esc to close';
