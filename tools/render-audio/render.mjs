#!/usr/bin/env node
/**
 * render.mjs — render the opening's soundtrack to a WAV, and to an MP3 when
 * ffmpeg is about.
 *
 *   node tools/render-audio/render.mjs [--out DIR] [--name FILE] [--seconds S]
 *                                      [--opening-score N] [--mute bed,music,cues] [--seed N]
 *
 * Serves the repo with Vite, opens `tools/render-audio/` in headless Chromium and
 * calls `renderOpening()` there: the real game and the real audio code on an
 * OfflineAudioContext (see `harness.ts`). The same commit renders the same file
 * on any machine, apart from the noise buffer, which is random by design.
 *
 * `--opening-score N` plays score N under the opening whatever the cues ask for,
 * which is how a score is auditioned before the game is wired to it.
 *
 * Needs Playwright with a Chromium. It is not a dependency of the game, so this
 * looks for it locally first and then in the global node_modules.
 */

import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

async function playwright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return import(pathToFileURL(join(root, 'playwright', 'index.mjs')).href);
  }
}

const out = resolve(arg('out', join(repo, 'dist-audio')));
const name = arg('name', 'opening');
const opts = {};
if (arg('seconds')) opts.seconds = Number(arg('seconds'));
if (arg('opening-score')) opts.openingScore = Number(arg('opening-score'));
if (arg('seed')) opts.seed = Number(arg('seed'));
// --mute bed,cues renders the score alone; --mute music,cues the room tone alone.
if (arg('mute')) opts.mute = arg('mute').split(',');

const server = await createServer({ root: repo, logLevel: 'error', server: { host: '127.0.0.1', port: 5199 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const { chromium } = await playwright();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${base}tools/render-audio/index.html`);
  await page.waitForFunction(() => 'renderOpening' in window, null, { timeout: 60000 });
  const res = await page.evaluate((o) => window.renderOpening(o), opts);
  mkdirSync(out, { recursive: true });
  const wav = join(out, `${name}.wav`);
  writeFileSync(wav, Buffer.from(res.wav, 'base64'));
  console.log(`${wav}: ${res.seconds.toFixed(2)} s, peak ${res.peak.toFixed(3)}, rms ${res.rms.toFixed(4)}`);
  for (const l of res.log) console.log(`  ${l}`);
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '2', join(out, `${name}.mp3`)]);
    console.log(`${join(out, `${name}.mp3`)}`);
  } catch {
    console.log('(no ffmpeg: WAV only)');
  }
  if (errors.length) {
    console.error('page errors:');
    for (const e of errors) console.error(`  ${e}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
