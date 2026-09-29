/**
 * THE CREDITS HAVE TO BE TRUE.
 *
 * Michele, 29 Sep 2026: *"We should work on credits. Mentioning me, you, and some
 * info on the process (4 repository, 10 gameplay POC, transition from 2, to 2.5
 * to 3D, xxxx tokens, xxx agents, xxx loops..)"*.
 *
 * The submission's GenAI section is five points and its entire value is being
 * accurate, so the screen carries no figure that could not be counted. Three of
 * them can be re-counted from inside this repository on every run — the lines of
 * TypeScript, the number of files, and the number of tests — and those are the
 * ones that rot, because the repository keeps growing under them. So they are
 * asserted here rather than trusted.
 *
 * The rest (commits, the ten prototypes, the session's tool calls and tokens)
 * were counted from git and from the session transcript on 29 Sep 2026; the
 * commands are written down in `docs/genai-notes.md` so anybody can re-run them.
 * A test cannot check those from in here, and pretending otherwise would be the
 * same dishonesty the screen is trying to avoid.
 */

import { describe, expect, it } from 'vitest';

import SELF from './credits.test.ts?raw';

import { CREDIT_FOOTNOTE, CREDIT_ROLES, CREDIT_STATS } from '../src/render/credits';
import { WELLD_LOGO, WELLD_RED, WELLD_SITE } from '../src/render/welld';

/*
 * The repository's own source, read through Vite rather than through `node:fs`:
 * this project has no `@types/node` and `tests/clue-plate.test.ts` already reads
 * a source file the same way (`?raw`). `eager` so the counting below is plain
 * synchronous code.
 */
const SRC = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
/*
 * ...and `import.meta.glob` leaves out the module it is written in, so this file
 * is added back by hand. Without it the credits would be one file short of the
 * truth for ever, which is exactly the kind of quiet drift this test exists to
 * catch.
 */
const TESTS: Record<string, string> = {
  ...(import.meta.glob('./**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  './credits.test.ts': SELF,
};

/** How many files, and how many lines in them. */
function count(files: Record<string, string>): { files: number; lines: number } {
  const names = Object.keys(files);
  return { files: names.length, lines: names.reduce((n, k) => n + files[k].split('\n').length, 0) };
}

/** The number out of a stat's note, e.g. "58,179 of game in 84 files" -> [58179, 84]. */
const numbers = (s: string): number[] =>
  [...s.matchAll(/\b(\d[\d,]*)\b/g)].map((m) => Number(m[1].replace(/,/g, '')));

describe('the credits', () => {
  it('names the human, the models and the sponsor', () => {
    const who = CREDIT_ROLES.map((r) => r.who).join(' | ');
    expect(who).toContain('Michele Giacobazzi');
    // Three models over four sessions, not one.
    expect(who).toMatch(/Opus 5.*Opus 5\.5.*Sonnet/);
    expect(who).toContain('WellD');
    // WellD sponsored this; nobody here is on their payroll for it.
    const welld = CREDIT_ROLES.find((r) => r.who === 'WellD');
    expect(welld?.what.toLowerCase(), 'WellD is credited as something other than a sponsor').toContain('sponsor');
    // Everybody gets a line saying what they actually did, not a job title.
    for (const r of CREDIT_ROLES) expect(r.what.length, `${r.who} has no credit`).toBeGreaterThan(40);
  });

  it('carries the WellD mark and the site, and does not recolour either', () => {
    expect(WELLD_SITE).toBe('welld.ch');
    // The real artwork, inlined — not a hand-traced wordmark, and not a fetch.
    // It is the vector Michele sent on 29 Sep 2026, so it is markup, not a raster.
    expect(WELLD_LOGO.startsWith('<svg viewBox="0 0 900 343"')).toBe(true);
    expect(WELLD_LOGO.trimEnd().endsWith('</svg>')).toBe(true);
    expect(WELLD_LOGO).not.toContain('data:image');
    // Small enough that the published build stays one self-contained file.
    expect(WELLD_LOGO.length).toBeLessThan(20000);

    /*
     * THE ONE COLOUR IT IS ALLOWED TO BE. The brand red is declared once and the
     * artwork carries it on the root, where all 18 paths inherit it — so if any
     * path ever grows a fill of its own, or the constant drifts away from the
     * file, this fails rather than quietly shipping a recoloured logo.
     */
    expect(WELLD_RED).toBe('#E50339');
    expect(WELLD_LOGO).toContain(`fill="${WELLD_RED}"`);
    expect(WELLD_LOGO.match(/fill="/g) ?? [], 'a path grew a fill of its own').toHaveLength(1);
    // ...and the old mark's white plate went with it: the new one needs no ground.
    expect(WELLD_LOGO).not.toContain('#fff');
  });

  /**
   * THE THREE FIGURES THAT ROT. Everything else on the screen is a snapshot of a
   * moment; these three are claims about the repository the test is running in.
   */
  it('still tells the truth about the size of this repository', () => {
    const src = count(SRC);
    const tests = count(TESTS);

    const lines = CREDIT_STATS.find((s) => s.label === 'lines of TypeScript');
    expect(lines, 'the credits stopped counting the code').toBeDefined();
    const [srcLines, srcFiles, testLines, testFiles, testCount] = numbers(lines!.note);

    /*
     * Within 2%, not to the line. The repository moves under this every commit,
     * and a screen that has to be re-cut for each one would be re-cut wrong —
     * but 2% of 58,000 is a thousand lines, which is a feature, not a typo.
     */
    const near = (claim: number, real: number, what: string): void => {
      expect(Math.abs(claim - real) / real, `${what}: credits say ${claim}, repo has ${real}`).toBeLessThan(0.02);
    };
    near(srcLines, src.lines, 'src lines');
    near(testLines, tests.lines, 'test lines');
    expect(srcFiles, 'src files').toBe(src.files);
    expect(testFiles, 'test files').toBe(tests.files);
    // ...and the headline is the two added up.
    expect(Number(lines!.n.replace(/,/g, ''))).toBe(srcLines + testLines);

    // The test count is this suite's own size, so it is checked against the one
    // number this file can be sure of: how many `it(` blocks the suite holds.
    const its = Object.entries(TESTS)
      .filter(([k]) => k.endsWith('.test.ts'))
      .reduce((n, [, body]) => n + (body.match(/\bit\(/g) ?? []).length, 0);
    // `it.each` and loops mean the suite runs more cases than it has blocks, so
    // the claim only has to be at least the blocks and in the same league.
    expect(testCount, 'the advertised test count is below the blocks in the suite').toBeGreaterThanOrEqual(its);
    expect(testCount).toBeLessThan(its * 3);
  });

  it('says the process story Michele asked for', () => {
    const all = CREDIT_STATS.map((s) => `${s.n} ${s.label} ${s.note}`).join(' | ');
    expect(all).toContain('repositories');
    expect(all).toContain('prototypes');
    expect(all).toMatch(/2D\s*→\s*2\.5D\s*→\s*3D/);
    expect(all).toContain('subagents');
    expect(all).toContain('tokens');
    // Ten prototypes, and the count is the headline rather than buried.
    const poc = CREDIT_STATS.find((s) => s.label.includes('prototypes'));
    expect(poc?.n).toBe('10');
    // Three repositories, each named AND said what it was for, so nobody has to
    // take either the number or the shape of the work on trust. Michele's own
    // division, 29 Sep: "experiments, methods and physics, rendering (2.5D and 3D)".
    const repos = CREDIT_STATS.find((s) => s.label === 'repositories');
    expect(repos?.n).toBe('3');
    expect(repos?.note).toContain('gauntlet-loop-experiment');
    expect(repos?.note).toContain('devoxx-game-experiments');
    expect(repos?.note, 'the racer repo lost the physics').toContain('physics');
    expect(repos?.note, 'this repo lost the rendering').toMatch(/2\.5D and 3D/);

    // ...and the ten prototypes were not ten drafts of one game. `02-olympics.html`
    // is a different game entirely, and saying so is the difference between a
    // process story and a progress bar.
    expect(poc?.note, 'the prototypes went back to being one idea refined').toContain('Olympics');
  });

  /**
   * ...and it admits what it cannot count. The session figures are what one
   * session could count, and the game was built across several, which makes
   * them a floor. Saying so on the screen costs nothing and is the difference
   * between a statistic and a boast. They were labelled "one session" until
   * Michele, 29 Sep 2026: *"many session is more honest, if we don't have a
   * count."* — "one session" read as if one session had built the game.
   */
  it('marks the per-session figures as a floor over many sessions, on the screen', () => {
    const floors = CREDIT_STATS.filter((s) => s.label.includes('many sessions'));
    expect(floors.length, 'no figure admits it is a floor').toBeGreaterThan(1);
    for (const f of floors) expect(f.n, `${f.label} does not say it is a floor`).toMatch(/\+$/);
    expect(CREDIT_STATS.filter((s) => s.label.includes('one session')), 'a figure went back to being one session').toEqual([]);
    expect(CREDIT_FOOTNOTE).toMatch(/floor, not a total/);
    // ...and the tokens are NOT one of them: that figure is all four sessions,
    // read off the account's own usage records rather than extrapolated.
    const tokens = CREDIT_STATS.find((s) => s.label.startsWith('tokens'));
    expect(tokens?.label, 'the token count went back to being one session').toContain('four sessions');
  });
});
