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
      'Direction, design and every decision that stuck. Put the real venue in front of the model \u2014 ' +
      'the plans, the photographs \u2014 then played every build and said what was wrong with it: the ladle, ' +
      'the cake, the frozen ending, the robot walking through a table. The renders are right because he ' +
      'kept describing what they got wrong.',
  },
  {
    who: 'Claude \u2014 Opus 5, Opus 5.5 and Sonnet, in Claude Code',
    what:
      'Wrote the simulation, the renderer, the venue, the three robots, the music and the tests. ' +
      'Proposed a great deal that was rejected, which is the half of this that took the time.',
  },
  {
    who: 'WellD',
    what: 'Sponsor \u2014 the tokens, the time, the encouragement, and a playthrough whenever one was needed.',
  },
];

/**
 * The process, in figures.
 *
 * The token count is the real one: `list_sessions` reports each session's usage,
 * so the four that built this game add up rather than being extrapolated from the
 * one whose transcript is readable from in here. The tool calls and the subagents
 * cannot be had the same way \u2014 they live in transcripts this container cannot
 * open \u2014 so those two say which session they came from and the footnote calls
 * them a floor.
 */
export const CREDIT_STATS: readonly CreditStat[] = [
  {
    n: '3',
    label: 'repositories',
    note:
      'gauntlet-loop-experiment, the method and the physics \u00b7 devoxx-game-experiments, the prototypes \u00b7 '
      + 'this game, the rendering in 2.5D and 3D',
  },
  {
    n: '10',
    label: 'gameplay prototypes',
    note:
      'one HTML file each, 01 a playground to 10 the real Kinepolis \u2014 and not one idea refined: '
      + '02 was a Devoxx Robot Olympics, 07 a tomato soup run',
  },
  {
    n: '2D → 2.5D → 3D',
    label: 'three engines, one simulation',
    note:
      'the prototypes were flat canvas; then an isometric renderer reading a headless 2D sim; ' +
      'then a third-person camera reading the same sim, unchanged',
  },
  {
    n: '338',
    label: 'commits in 7 days',
    note: '336 of them written by the model, 2 by the human — 22 to 29 September 2026',
  },
  {
    n: '84,759',
    label: 'lines of TypeScript',
    note: '62,459 of game in 90 files, 22,300 of tests in 67 — 857 tests, no physics engine',
  },
  {
    n: '118,754',
    label: 'words of notes',
    note: '81,707 of them the GenAI record: what was built, what a human decided, what was rejected',
  },
  {
    n: '44',
    label: 'subagents, one session',
    note: 'critics, explorers and builders, plus 6 orchestrated workflows \u2014 counted in this session alone',
  },
  {
    n: '4,453',
    label: 'tool calls, one session',
    note: '3,906 of them a shell — 7,245 model turns answering 233 messages from Michele',
  },
  {
    n: '17.5 B',
    label: 'tokens, four sessions',
    note: '62.3 million of them written by the model; the rest is context, read again every turn',
  },
];

/**
 * The line under the numbers. It is the honest caveat, and it belongs on the
 * screen rather than in a footnote nobody opens: the per-session figures are one
 * session's, and this game was built across several.
 */
export const CREDIT_FOOTNOTE =
  'Counted off the repository and off the sessions\u2019 own records on 29 September 2026. The tokens are ' +
  'the whole of the four sessions that built this; the tool calls and the subagents are one session\u2019s, ' +
  'so those two are a floor, not a total.';

export const CREDIT_CLOSE = 'C or Esc to close';
