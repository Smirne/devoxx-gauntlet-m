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
      'Direction, design and every decision that stuck. Put the real venue in front of the model, then ' +
      'played every build and said what was wrong with it: the ladle, ' +
      'the cake, the frozen ending, the robot walking through a table.',
  },
  {
    who: 'Claude \u2014 Opus 5, Opus 5.5 and Sonnet, in Claude Code',
    what:
      'Wrote the simulation, the renderer, the venue, the three robots, the chapter scores and the tests. ' +
      'Proposed a great deal that was rejected, which is the half of this that took the time.',
  },
  {
    who: 'Ronny Shamano',
    what:
      'Music help — “Heroic Motif”, the opening track, made with Suno and given to the game.',
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
 * open \u2014 so those two are what one session could count, marked with a `+`, and
 * labelled with the many sessions they are a floor of. They used to say "one
 * session", which read as if one session built the game; Michele, 29 Sep 2026:
 * *"many session is more honest, if we don't have a count."*
 */
export const CREDIT_STATS: readonly CreditStat[] = [
  {
    n: '3',
    label: 'repositories',
    note:
      'gauntlet-loop-experiment, method and physics \u00b7 devoxx-game-experiments, the prototypes \u00b7 ' +
      'this one, 2.5D and 3D',
  },
  {
    n: '10',
    label: 'gameplay prototypes',
    note:
      'one HTML file each, and ten different games: 02 a Devoxx Robot Olympics, 07 a tomato soup run, ' +
      '10 the real Kinepolis',
  },
  {
    n: '2D → 2.5D → 3D',
    label: 'three renderers, one simulation',
    note:
      'flat canvas prototypes, then an isometric renderer on a headless 2D sim, then a third-person ' +
      'camera on the same sim, unchanged',
  },
  {
    n: '513',
    label: 'commits in 9 days',
    note: '494 of them written by the model, 19 by the human — 22 to 30 September 2026',
  },
  {
    n: '93,052',
    label: 'lines of TypeScript',
    note: '67,911 of game in 95 files, 25,141 of tests in 74 — 952 tests, no physics engine',
  },
  {
    n: '131,485',
    label: 'words of notes',
    note: '94,345 of them the GenAI record: what was built, what a human decided, what was rejected',
  },
  {
    n: '44+',
    label: 'subagents, many sessions',
    note: 'critics, explorers and builders, plus 6 orchestrated workflows \u2014 the ones one session could count',
  },
  {
    n: '4,453+',
    label: 'tool calls, many sessions',
    note: '3,906 of them a shell, 7,245 model turns, 233 messages from Michele \u2014 the ones one session could count',
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
  'The repository counted on 30 September 2026, the sessions\u2019 own records on 29 September. ' +
  'The tool calls and the subagents are what one of many sessions could count: a floor, not a total.';

export const CREDIT_CLOSE = 'C or Esc to close';
