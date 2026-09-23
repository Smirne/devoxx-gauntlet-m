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
     * whoever cloned the repo. Anything prefixed `_` or `zz-` is working
     * material — ignored here, and ignored by git.
     */
    exclude: ['tests/_*.test.ts', 'tests/zz-*.test.ts', 'tests/probe-*.test.ts', 'node_modules/**', 'dist*/**'],
    reporters: ['default'],
  },
});
