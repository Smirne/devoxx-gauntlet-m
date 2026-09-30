/**
 * tools/promo/capture.mjs — shoots the promo's footage, frame by frame, from the
 * real 3D build at 1920×1080, `q=high`.
 *
 *   splash   the press-any-key gate (DEVOXX over Antwerp), in real time
 *   opening  the crates and the three introductions, stepped at 30 fps, HUD on
 *   run      windows of the full scripted run (see SHOTS), stepped at the sim's
 *            own DT_MAX, one rendered frame per sim step
 *
 * Nothing is posed: every gameplay frame is the tests' choreography (the same
 * one `tools/playthrough/run.mjs` films), and the step numbers in SHOTS come
 * from `scout.mjs`'s contact sheet for the same seed.
 *
 *   pnpm dev --port 5287 --host 127.0.0.1     # in another shell
 *   node tools/promo/capture.mjs <outDir> [splash|opening|run ...]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, SHIM, SEED } from './common.mjs';

const OUT = process.argv[2] ?? 'promo-frames';
const which = process.argv.slice(3);
const want = (k) => which.length === 0 || which.includes(k);
const BASE = process.env.BASE ?? 'http://127.0.0.1:5287';
const VIEW = { width: 1920, height: 1080 };

/** [clip, first step, last step] — sim steps of the full run at SEED. */
export const SHOTS = [
  ['corridor', 0, 200],
  ['beam', 250, 350],
  ['droid-biggy', 560, 650],
  ['booths', 790, 900],
  ['doors', 1760, 1960],
  ['crowd', 2480, 2580],
  ['stairs', 2990, 3130],
  ['cake', 3620, 3700],
  ['room8', 4000, 4090],
  ['stage', 4400, 4560],
  ['push', 5290, 5380],
  ['sign', 5990, 6080],
];

/** The page's own chrome that a trailer does not need: key help, skip button. */
const TIDY = '.ad3d-help, .ad-skip { display: none !important; }';

const save = (dir, i, dataUrl) => writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(dataUrl.split(',')[1], 'base64'));

/** Real time: shoot as fast as the page allows, keep the frame nearest each 1/30 s. */
async function realTime(page, dir, seconds) {
  mkdirSync(dir, { recursive: true });
  const shots = [];
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000 + 200) shots.push({ t: Date.now() - t0, buf: await page.screenshot({ type: 'jpeg', quality: 92 }) });
  let k = 0;
  for (let i = 0; i < seconds * 30; i++) {
    const t = (i * 1000) / 30;
    while (k + 1 < shots.length && Math.abs(shots[k + 1].t - t) <= Math.abs(shots[k].t - t)) k++;
    writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, shots[k].buf);
  }
  return shots.length;
}

if (want('splash')) {
  const { browser, page } = await launch(VIEW);
  await page.goto(`${BASE}/3d.html?q=high&seed=${SEED}`);
  await page.waitForFunction(() => window.__ad3d && window.__ad3d.ready, null, { timeout: 300000 });
  await page.addStyleTag({ content: TIDY });
  await page.waitForTimeout(2500);
  console.log('splash', await realTime(page, `${OUT}/splash`, 4), 'screenshots');
  // The end card: the same sky and wordmark, without the gate's prompt.
  await page.addStyleTag({ content: '.ad3d-press, .ad3d-sub { visibility: hidden !important; }' });
  console.log('end', await realTime(page, `${OUT}/end`, 4), 'screenshots');
  await browser.close();
}

if (want('opening')) {
  const dir = `${OUT}/opening`;
  mkdirSync(dir, { recursive: true });
  const { browser, page } = await launch(VIEW);
  await page.goto(`${BASE}/3d.html?shot=1&cards=1&hud=1&q=high&seed=${SEED}`);
  await page.waitForFunction(() => window.__ad3d && window.__ad3d.ready, null, { timeout: 300000 });
  await page.addStyleTag({ content: TIDY });
  let i = 0;
  for (; i < 30 * 40; i++) {
    const going = await page.evaluate(() => {
      window.__ad3d.step(1, 1 / 30);
      return !!window.__ad3d.game.snapshot().opening;
    });
    await page.screenshot({ path: `${dir}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (!going) break;
  }
  console.log('opening', i, 'frames');
  await browser.close();
}

if (want('run')) {
  const { browser, page } = await launch(VIEW);
  for (const [clip] of SHOTS) mkdirSync(`${OUT}/${clip}`, { recursive: true });
  let written = 0;
  await page.exposeBinding('__promoSave', (_src, clip, i, url) => {
    save(`${OUT}/${clip}`, i, url);
    written++;
  });
  await page.route(/vitest/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: SHIM }));
  await page.goto(`${BASE}/3d.html?shot=1&q=high&seed=${SEED}&chapter=1`);
  await page.waitForFunction(() => window.__ad3d && window.__ad3d.ready, null, { timeout: 300000 });
  const res = await page.evaluate(async (shots) => {
    const a = window.__ad3d;
    const g = a.game;
    const fr = await import('/tests/full-run.test.ts');
    const pilot = await import('/tests/pilot.ts');
    const { DT_MAX } = await import('/src/sim/constants.ts');
    /** Frames rendered, uncaptured, before a window opens: the follow camera eases in. */
    const LEAD = 45;
    let n = 0;
    const update = g.update.bind(g);
    g.update = (dt) => {
      update(dt);
      n++;
      for (const [clip, s0, s1] of shots) {
        if (n === s0 - LEAD || (s0 < LEAD && n === 1)) a.world.cam.cut();
        if (n >= s0 - LEAD && n <= s1) {
          a.world.render(g.snapshot(), DT_MAX);
          if (n >= s0) window.__promoSave(clip, n - s0, a.world.renderer.domElement.toDataURL('image/jpeg', 0.92));
        }
      }
    };
    const last = Math.max(...shots.map((s) => s[2]));
    try {
      fr.playChapter1(g);
      if (n < last) fr.playChapter2(g);
      if (n < last) {
        pilot.playToStairGate(g);
        fr.until(g, 'the walk back up to Room 8', () => g.snapshot().chapter === 4);
      }
      if (n < last) fr.playChapter4(g);
      if (n < last) fr.until(g, 'the last shot', () => n >= last || g.snapshot().reel === null, 3000);
    } catch (e) {
      return { ok: false, error: String(e && e.message), n };
    }
    return { ok: true, n };
  }, SHOTS);
  // Let the last bindings land.
  await page.waitForTimeout(2000);
  console.log('run', JSON.stringify(res), written, 'frames');
  await browser.close();
}
