import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /*
     * Scratch files are not the suite.
     *
     * Agents and I both write throwaway probes into `tests/` so they can run
     * under vitest, and one of them once shipped: a measurement scratch file
     * matching the glob ran in `pnpm test` and printed debug output in front of
     * whoever cloned the repo. Anything prefixed `_`, `zz` or `probe` is working
     * material — ignored here, and ignored by git.
     *
     * The patterns lost their hyphens on 24 Sep. They were `zz-*` and `probe-*`,
     * and an agent this session wrote `tests/zzscratch.test.ts`: not ignored by
     * git, not excluded here, and therefore a scratch file that RAN in the suite
     * and was one `git add -A` from shipping. A convention that depends on
     * remembering a hyphen is not a convention.
     */
    exclude: ['tests/_*.test.ts', 'tests/zz*.test.ts', 'tests/probe*.test.ts', 'node_modules/**', 'dist*/**'],
    /*
     * 30 s, not vitest's 5.
     *
     * This suite is a physics sim, not a set of unit tests: the chapter
     * choreographies step thousands of frames through a full wall list, chapter
     * 3 walks a 36-body crowd, and the clue sweeps rebuild a visibility-polygon
     * set per pose. On an idle machine the slowest of them is about 4 s — under
     * the default with nothing to spare.
     *
     * That margin is not real. Run the suite while a build or another agent is
     * working beside it and half a dozen tests cross 5 s and go red having
     * computed exactly the right answer. It has now happened twice, and both
     * times the first reading was "something regressed" — a timeout is the worst
     * kind of red, because it is indistinguishable from a broken gate until you
     * read the message.
     *
     * A per-test timeout is the wrong cure: it has to be remembered by whoever
     * writes the next slow test, and it was not. This is the floor for all of
     * them. A test that genuinely hangs still fails.
     *
     * 30 s was not enough either, and the reason is the gauntlet loop itself.
     * Measured 24 Sep with four builder agents running their own suites and two
     * headless browsers on the same box, at load average 60: the chapter-3 crowd
     * choreography takes **13.1 s alone and 38.9 s under that load**, and went
     * falsely red three times in one evening. The cost is real simulation — 5,600
     * frames of a 36-body crowd, and a split measurement puts 3.6 s of every 2,000
     * frames in the sim step and 1.0 s in `snapshot()` — so there is nothing to
     * optimise away without simulating less, which would weaken the test.
     *
     * So the budget absorbs the load instead: 90 s is about 2.5x the worst
     * contended reading and 7x the honest one. It is the same number another
     * agent reached independently for the aisle walk the same night. A timeout is
     * still the worst kind of red — indistinguishable from a broken gate until you
     * read the message — and the only thing that makes it useful is being wrong
     * only when something is genuinely stuck.
     */
    testTimeout: 90000,
    hookTimeout: 90000,
    reporters: ['default'],
  },
});
