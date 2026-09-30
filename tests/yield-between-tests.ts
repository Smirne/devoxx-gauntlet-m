/**
 * Between two tests, let the worker's event loop turn.
 *
 * vitest's worker talks to the main process over an RPC whose calls time out
 * after 60 s, and a reply is only read when the event loop gets round to it.
 * This suite is a physics sim, so its tests are synchronous, and awaiting one
 * after another only ever yields to the microtask queue: a file whose
 * synchronous tests add up to more than a minute never reads the reply, the
 * call "times out" with every test passing, and `pnpm test` exits 1 — which is
 * what `tests/chapters.test.ts` did on 29 Sep (54 tests, 76 s, all green, exit
 * 1). One macrotask after each test lets the replies in.
 */
import { afterEach } from 'vitest';

afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
