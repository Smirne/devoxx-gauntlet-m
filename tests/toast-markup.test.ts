/**
 * The markup the chapters write into their lines.
 *
 * Michele, 25 Sep 2026: *"There's some html code in toast, not rendered."* Two
 * things have to hold for that never to happen again, and only one of them is in
 * the HUD (`pushLine` sets `innerHTML`, like every other line the sim writes):
 *
 *   1. the tags a chapter uses are ones the overlay is willing to render, and
 *   2. they are BALANCED — an unclosed `<b>` bolds the rest of the run.
 *
 * The check is on the sources rather than on a played game, because a line that
 * only appears when a cable goes tight in chapter 2 is exactly the one nobody
 * would have looked at. `?raw` is Vite's, not `node:fs`: this repo has no
 * `@types/node` (see `tests/cutscene-pace.test.ts`).
 */

import { describe, expect, it } from 'vitest';

import CH1_SRC from '../src/sim/chapters/ch1-night.ts?raw';
import CH2_SRC from '../src/sim/chapters/ch2-expo.ts?raw';
import CH3_SRC from '../src/sim/chapters/ch3-breakfast.ts?raw';
import CH4_SRC from '../src/sim/chapters/ch4-keynote.ts?raw';
import GAME_SRC from '../src/sim/game.ts?raw';

const SOURCES: ReadonlyArray<readonly [string, string]> = [
  ['ch1-night.ts', CH1_SRC],
  ['ch2-expo.ts', CH2_SRC],
  ['ch3-breakfast.ts', CH3_SRC],
  ['ch4-keynote.ts', CH4_SRC],
  ['game.ts', GAME_SRC],
];

/** What the overlay renders: emphasis, a break, and a span for the long cards. */
const ALLOWED = /^<\/?(b|i|br|small|span)(\s[^<>]*)?\/?>$/;

/** Tags inside a comment are prose about the code, not a line the player sees. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * The tags inside STRING LITERALS, which is the only place a `<` is markup.
 *
 * Scanning the whole file instead reads `Map<Wall, number>` as an unclosed tag —
 * TypeScript's own angle brackets outnumber the chapters' by a wide margin.
 */
function tagsInStrings(src: string): string[] {
  const strings = src.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
  // Stitched back into one blob rather than scanned literal by literal: a long
  // line is written as a `+` chain and a tag can straddle the join — chapter 3's
  // stack-trace `<span style="...">` is split over three of them, and per-literal
  // scanning read it as a stray `</span>`.
  const blob = strings.map((lit) => lit.slice(1, -1)).join('');
  return blob.match(/<\/?[a-zA-Z][^<>]*>/g) ?? [];
}

describe('every line a chapter writes', () => {
  for (const [name, raw] of SOURCES) {
    const src = stripComments(raw);
    const tags = tagsInStrings(src);

    it(`${name}: uses only tags the overlay renders`, () => {
      const odd = [...new Set(tags.filter((t) => !ALLOWED.test(t)))];
      expect(odd, `${name} writes markup the HUD will not render:\n  ${odd.join('\n  ')}`).toEqual([]);
    });

    it(`${name}: closes everything it opens`, () => {
      for (const tag of ['b', 'i', 'span'] as const) {
        const open = tags.filter((t) => new RegExp(`^<${tag}(\\s|>|/)`, 'i').test(t)).length;
        const shut = tags.filter((t) => new RegExp(`^</${tag}\\s*>$`, 'i').test(t)).length;
        expect(shut, `${name}: ${open} <${tag}> against ${shut} </${tag}> — one of them runs to the end of the line`).toBe(open);
      }
    });
  }
});
