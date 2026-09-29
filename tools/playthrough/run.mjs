/**
 * tools/playthrough/run.mjs — one full run of the game, in the REAL 3D build.
 *
 * `tests/full-run.test.ts` plays chapter 1 to the final card against the headless
 * sim. This drives the same choreography through the running 3D page — its own
 * game, its own renderer — and keeps a frame every `EVERY` seconds of game clock,
 * so the run can be looked at, not just asserted. The test's `expect` is replaced
 * in the page by a small stand-in that throws on a failed check, so a broken run
 * stops with the same message the test would give.
 *
 *   pnpm dev --port 5173            # in another shell
 *   node tools/playthrough/run.mjs [outDir] [everySeconds]
 *
 * Needs Playwright's Chromium (headless, software GL is fine, only slow).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
}
const OUT = process.argv[2] ?? 'playthrough-out';
const EVERY = Number(process.argv[3] ?? 2.5);
const BASE = process.env.BASE ?? 'http://localhost:5173';
mkdirSync(OUT, { recursive: true });

const SHIM = `
const fail = (m) => { throw new Error(m); };
const eq = (a, b) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
export function expect(v, msg) {
  const w = (ok, what) => { if (!ok) fail((msg ? msg + ': ' : '') + what); };
  const m = {
    toBe: (x) => w(Object.is(v, x), 'expected ' + JSON.stringify(v) + ' to be ' + JSON.stringify(x)),
    toEqual: (x) => w(eq(v, x), 'not equal'),
    toBeDefined: () => w(v !== undefined, 'undefined'),
    toBeNull: () => w(v === null, 'not null'),
    toBeTruthy: () => w(!!v, 'falsy'),
    toContain: (x) => w(v != null && v.includes(x), 'does not contain ' + x),
    toBeGreaterThan: (x) => w(v > x, v + ' not > ' + x),
    toBeLessThan: (x) => w(v < x, v + ' not < ' + x),
    toHaveLength: (x) => w(v.length === x, 'length ' + v.length),
  };
  m.not = {
    toBe: (x) => w(!Object.is(v, x), 'is ' + x),
    toBeNull: () => w(v !== null, 'is null'),
    toContain: (x) => w(!(v != null && v.includes(x)), 'contains ' + x),
  };
  return m;
}
export const describe = () => {};
export const it = () => {};
export const test = () => {};
`;

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.route(/vitest/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: SHIM }));
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto(`${BASE}/3d.html?shot=1&q=medium&seed=20260930&chapter=1`);
await page.waitForFunction(() => window.__ad3d && window.__ad3d.ready, null, { timeout: 300000 });

const result = await page.evaluate(async (every) => {
  const a = window.__ad3d;
  const g = a.game;
  const fr = await import('/tests/full-run.test.ts');
  const pilot = await import('/tests/pilot.ts');
  const { DT_MAX } = await import('/src/sim/constants.ts');
  const frames = [];
  let n = 0;
  let label = 'start';
  const shoot = () => {
    const s = g.snapshot();
    // The page only renders at each shot, so the easing follow camera would lag
    // seconds behind: snap it to where it settles in play, then let it settle.
    a.world.cam.cut();
    for (let i = 0; i < 3; i++) a.world.render(s, 1 / 30);
    frames.push({ t: +(n * DT_MAX).toFixed(1), chapter: s.chapter, label, url: a.world.renderer.domElement.toDataURL('image/jpeg', 0.82) });
  };
  const per = Math.round(every / DT_MAX);
  const update = g.update.bind(g);
  g.update = (dt) => {
    update(dt);
    n++;
    if (n % per === 0) shoot();
  };
  const legs = [];
  const leg = (name, run) => {
    label = name;
    const t0 = n;
    run();
    legs.push([name, +((n - t0) * DT_MAX).toFixed(1)]);
    shoot();
  };
  try {
    shoot();
    leg('1 · night', () => fr.playChapter1(g));
    leg('2 · expo', () => fr.playChapter2(g));
    leg('3 · breakfast', () => {
      pilot.playToStairGate(g);
      fr.until(g, 'the walk back up to Room 8', () => g.snapshot().chapter === 4);
    });
    leg('4 · keynote', () => fr.playChapter4(g));
    leg('the opening video', () => fr.until(g, 'the end of the opening video', () => g.snapshot().reel === null, 3000));
  } catch (e) {
    return { ok: false, error: String(e && e.message), legs, frames, errors: a.errors.slice(), card: g.snapshot().card };
  }
  return { ok: true, legs, frames, errors: a.errors.slice(), card: g.snapshot().card, phase: g.snapshot().phase };
}, EVERY);

result.frames.forEach((f, i) => writeFileSync(`${OUT}/${String(i).padStart(3, '0')}-ch${f.chapter}-${f.t}s.jpg`, Buffer.from(f.url.split(',')[1], 'base64')));
const summary = { ok: result.ok, error: result.error, legs: result.legs, frames: result.frames.length, errors: result.errors, phase: result.phase, card: result.card };
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
process.exit(result.ok && result.errors.length === 0 ? 0 : 1);
