/*
 * Fold `dist/assets/*` back into `dist/index.html`, so the page is one file.
 *
 * WHY THIS EXISTS. `GAUNTLET.md` says to publish `dist/index.html` to the
 * artifact, and that instruction is only true if the file is self-contained.
 * It was not: Vite emits the bundle beside it, and a publish of the page alone
 * left the artifact serving a NEW index.html against the PREVIOUS version's
 * JS — which 404s, so the game simply did not start. That is exactly what
 * happened on version 28, and the console said so in one line:
 * `Failed to load resource: 404 — index-CYf9neTo.js`.
 *
 * Making the file genuinely self-contained is better than documenting the
 * footgun, because the instruction everybody already follows becomes correct.
 * No plugin: this is twenty lines and one more dependency is one more thing to
 * break offline.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2];
// Which page to fold: index.html (the 2.5D game) unless told otherwise — the 3D
// build publishes 3d.html the same way.
const pageName = process.argv[3] ?? 'index.html';
if (!dist) throw new Error('usage: node tools/inline-build.mjs <dist dir> [page.html]');

const page = join(dist, pageName);
let html = readFileSync(page, 'utf8');
const used = [];

/*
 * A bundle that contains the literal text `</script>` would close the tag it is
 * being inlined into, so the closing bracket is escaped. `<\/` is not valid
 * JavaScript at statement level but IS valid inside the string and regex
 * literals where the sequence can actually occur, which is the only place a
 * bundler can emit it.
 */
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

// A modulepreload hint for a chunk means the page imports a second file: the
// page was built alongside another one (see vite.config.ts, PAGE=...).
if (/rel="modulepreload"/.test(html)) {
  throw new Error(`${pageName} imports a shared chunk; build it on its own with PAGE=main or PAGE=3d`);
}
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"><\/script>/g, (_m, src) => {
  used.push(src);
  return `<script type="module">${safe(readFileSync(join(dist, src), 'utf8'))}</script>`;
});
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)">/g, (_m, href) => {
  used.push(href);
  return `<style>${readFileSync(join(dist, href), 'utf8')}</style>`;
});

if (used.length === 0) throw new Error('nothing was inlined — has the Vite output shape changed?');
if (/src="\.\/assets|href="\.\/assets/.test(html)) {
  throw new Error(`${pageName} still references an asset after inlining`);
}

writeFileSync(page, html);
for (const f of used) rmSync(join(dist, f));
console.log(`inlined:  ${used.join(' ')}`);
