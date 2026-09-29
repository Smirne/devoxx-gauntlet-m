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
  it('names the human, the model and the company', () => {
    const who = CREDIT_ROLES.map((r) => r.who).join(' | ');
    expect(who).toContain('Michele Giacobazzi');
    expect(who).toContain('Claude');
    expect(who).toContain('WellD');
    // Everybody gets a line saying what they actually did, not a job title.
    for (const r of CREDIT_ROLES) expect(r.what.length, `${r.who} has no credit`).toBeGreaterThan(40);
  });

  it('carries the WellD mark and the site, and does not recolour either', () => {
    expect(WELLD_SITE).toBe('welld.ch');
    // The real artwork, inlined — not a hand-traced wordmark, and not a fetch.
    expect(WELLD_LOGO.startsWith('data:image/png;base64,')).toBe(true);
    // Small enough that the published build stays one self-contained file.
    expect(WELLD_LOGO.length).toBeLessThan(20000);
    // The brand red, off the artwork itself (201, 16, 46).
    expect(WELLD_RED.toLowerCase()).toBe('#c9102e');
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
  });

  /**
   * ...and it admits what it cannot count. The session figures are one session's
   * and the game was built across several, which makes them a floor. Saying so on
   * the screen costs nothing and is the difference between a statistic and a
   * boast.
   */
  it('marks the per-session figures as one session, on the screen', () => {
    const perSession = CREDIT_STATS.filter((s) => s.label.includes('one session'));
    expect(perSession.length, 'no figure is scoped to the session it came from').toBeGreaterThan(1);
    expect(CREDIT_FOOTNOTE.toLowerCase()).toContain('one session of several');
    expect(CREDIT_FOOTNOTE).toMatch(/floor, not a total/);
  });
});
