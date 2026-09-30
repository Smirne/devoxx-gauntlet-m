/**
 * tools/promo/common.mjs — what the promo's scripts share: a Chromium on the
 * real GPU (headless, but not software GL — the promo is shot at `high`), the
 * vitest stand-in the playthrough uses so the tests' choreographies run in the
 * page, and the seed every shot is taken with.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    // Not a dependency of the game: point PLAYWRIGHT at any install of it.
    if (process.env.PLAYWRIGHT) return import(process.env.PLAYWRIGHT);
    throw new Error('playwright not found: npm i -g playwright, or set PLAYWRIGHT=/path/to/playwright/index.mjs');
  }
}

export const SEED = 20260930;

export async function launch(viewport) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  return { browser, page };
}

export const SHIM = `
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
