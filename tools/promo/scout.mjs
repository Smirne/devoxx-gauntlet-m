/**
 * tools/promo/scout.mjs — a contact sheet of the full scripted run, for picking
 * the promo's shots.
 *
 * Same choreography as `tools/playthrough/run.mjs` (the full-run test's legs,
 * driven through the real 3D page), but every frame it keeps is named by the
 * sim STEP it was taken at, so `capture.mjs` can come back to exactly that
 * moment: the run is deterministic for a given seed.
 *
 *   pnpm dev --port 5287 --host 127.0.0.1     # in another shell
 *   node tools/promo/scout.mjs [outDir] [everySeconds]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, SHIM, SEED } from './common.mjs';

const OUT = process.argv[2] ?? 'promo-scout';
const EVERY = Number(process.argv[3] ?? 1);
mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch({ width: 960, height: 540 });
await page.route(/vitest/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: SHIM }));
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5287'}/3d.html?shot=1&q=high&seed=${SEED}&chapter=1`);
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
    a.world.cam.cut();
    for (let i = 0; i < 3; i++) a.world.render(s, 1 / 30);
    frames.push({ n, chapter: s.chapter, label, sel: s.selected, url: a.world.renderer.domElement.toDataURL('image/jpeg', 0.7) });
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
    legs.push([name, t0, n]);
  };
  try {
    leg('1', () => fr.playChapter1(g));
    leg('2', () => fr.playChapter2(g));
    leg('3', () => {
      pilot.playToStairGate(g);
      fr.until(g, 'the walk back up to Room 8', () => g.snapshot().chapter === 4);
    });
    leg('4', () => fr.playChapter4(g));
    leg('reel', () => fr.until(g, 'the end of the opening video', () => g.snapshot().reel === null, 3000));
  } catch (e) {
    return { ok: false, error: String(e && e.message), legs, frames };
  }
  return { ok: true, legs, frames };
}, EVERY);

for (const f of result.frames) {
  writeFileSync(`${OUT}/${String(f.n).padStart(6, '0')}-ch${f.chapter}-${f.sel}.jpg`, Buffer.from(f.url.split(',')[1], 'base64'));
}
writeFileSync(`${OUT}/legs.json`, JSON.stringify({ ok: result.ok, error: result.error, legs: result.legs }, null, 2));
console.log(JSON.stringify({ ok: result.ok, error: result.error, legs: result.legs, frames: result.frames.length }));
await browser.close();
