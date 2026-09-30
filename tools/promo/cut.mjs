/**
 * tools/promo/cut.mjs — edits the frames `capture.mjs` shot into the 30-second
 * promo: segments, the text cards from `cards.html`, transitions, and the music.
 *
 *   node tools/promo/cut.mjs <framesDir> <audioDir> <out.mp4>
 *
 * `audioDir` holds score2.wav and score4.wav, the game's own chapter scores,
 * rendered by `tools/render-audio/render.mjs --opening-score N --mute bed,cues`.
 * The first twelve seconds are the opening's track, straight from
 * `src/render/opening-track.mp3`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const [FRAMES, AUDIO, OUTFILE = 'after-dark-promo.mp4'] = process.argv.slice(2);
if (!FRAMES || !AUDIO) throw new Error('usage: node tools/promo/cut.mjs <framesDir> <audioDir> <out.mp4>');
const WORK = join(FRAMES, '_cut');
mkdirSync(WORK, { recursive: true });
const FPS = 30;

/*
 * The edit. `from`/`len` are frames of the clip (30 fps); `card` is laid over
 * the whole segment, fading in and out; `bg` dims and blurs the footage under a
 * full card; `into` is the transition INTO this segment (xfade name, seconds).
 */
const EDIT = [
  { clip: 'splash', from: 0, len: 96, zoom: 0.0009 },
  { clip: 'opening', from: 62, len: 72, into: ['fadeblack', 0.5] },
  { clip: 'opening', from: 198, len: 42, into: ['smoothleft', 0.3] },
  { clip: 'opening', from: 246, len: 44, into: ['smoothleft', 0.3] },
  { clip: 'corridor', from: 0, len: 72, card: 'tagline', into: ['circleopen', 0.45] },
  { clip: 'beam', from: 20, len: 54, card: 'light', into: ['wipeleft', 0.3] },
  { clip: 'droid-biggy', from: 44, len: 48, card: 'robots', into: ['slideup', 0.3] },
  { clip: 'booths', from: 34, len: 44, into: ['pixelize', 0.35] },
  { clip: 'doors', from: 70, len: 58, card: 'venue', into: ['wiperight', 0.3] },
  { clip: 'stairs', from: 40, len: 42, into: ['radial', 0.35] },
  { clip: 'room8', from: 0, len: 44, card: 'keynote', into: ['smoothright', 0.3] },
  { clip: 'stage', from: 70, len: 52, into: ['zoomin', 0.3] },
  { clip: 'sign', from: 0, len: 52, into: ['dissolve', 0.3] },
  { clip: 'crowd', from: 0, len: 72, card: 'made1', bg: true, into: ['fadeblack', 0.4] },
  { clip: 'push', from: 0, len: 72, card: 'made2', bg: true, into: ['fade', 0.35] },
  { clip: 'cake', from: 0, len: 72, card: 'made3', bg: true, into: ['fade', 0.35] },
  { clip: 'end', from: 0, len: 104, card: 'end', into: ['fadeblack', 0.5], fadeOut: 0.8 },
];

const run = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

/* ------------------------------------------------------------ the cards --- */

const cards = [...new Set(EDIT.map((s) => s.card).filter(Boolean))];
{
  const { browser, page } = await launch({ width: 1920, height: 1080 });
  for (const c of cards) {
    await page.goto(`${pathToFileURL(join(here, 'cards.html')).href}?card=${c}`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(WORK, `card-${c}.png`), omitBackground: true });
  }
  await browser.close();
}

/* ------------------------------------------------------------- segments --- */

EDIT.forEach((s, i) => {
  const dur = s.len / FPS;
  const out = join(WORK, `seg${String(i).padStart(2, '0')}.mp4`);
  const input = ['-framerate', String(FPS), '-start_number', String(s.from), '-i', join(FRAMES, s.clip, '%05d.jpg')];
  let v = `[0:v]scale=1920:1080:flags=lanczos,setsar=1,trim=end_frame=${s.len}`;
  if (s.zoom) v += `,zoompan=z='1+${s.zoom}*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS}`;
  if (s.bg) v += ',gblur=sigma=14,eq=brightness=-0.08:saturation=0.8';
  if (s.fadeOut) v += `,fade=out:st=${(dur - s.fadeOut).toFixed(3)}:d=${s.fadeOut}`;
  let graph;
  const extra = [];
  if (s.card) {
    extra.push('-loop', '1', '-t', dur.toFixed(3), '-i', join(WORK, `card-${s.card}.png`));
    const inAt = s.bg ? 0.15 : 0.3;
    let c = `[1:v]format=rgba,fade=in:st=${inAt}:d=0.3:alpha=1`;
    if (!s.fadeOut) c += `,fade=out:st=${(dur - 0.4).toFixed(3)}:d=0.3:alpha=1`;
    graph = `${v}[b];${c}[c];[b][c]overlay=0:0:format=auto,format=yuv420p[v]`;
  } else {
    graph = `${v},format=yuv420p[v]`;
  }
  run([...input, ...extra, '-filter_complex', graph, '-map', '[v]', '-frames:v', String(s.len), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', out]);
});

/* ---------------------------------------------------------- transitions --- */

const segs = EDIT.map((_, i) => join(WORK, `seg${String(i).padStart(2, '0')}.mp4`));
let length = EDIT[0].len / FPS;
let chain = '';
let last = '[0:v]';
EDIT.slice(1).forEach((s, k) => {
  const i = k + 1;
  const [kind, d] = s.into ?? ['fade', 0.04];
  const offset = length - d;
  const label = `[x${i}]`;
  chain += `${last}[${i}:v]xfade=transition=${kind}:duration=${d}:offset=${offset.toFixed(3)}${label};`;
  last = label;
  length = offset + s.len / FPS;
});
console.log(`cut: ${length.toFixed(2)} s`);
if (length > 30.001) throw new Error(`the cut runs ${length.toFixed(2)} s: over the 30 s limit`);

/* ---------------------------------------------------------------- music --- */

/*
 * The opening's track under the splash and the opening, then the expo's score
 * (100 bpm, the one that climbs) under the montage, then the keynote's (C
 * major, the room settling) under "how we made it" and the end card.
 */
const track = join(repo, 'src/render/opening-track.mp3');
const s2 = join(AUDIO, 'score2.wav');
const s4 = join(AUDIO, 'score4.wav');
for (const f of [track, s2, s4]) if (!existsSync(f)) throw new Error(`missing ${f}`);
const T = length;
const aStart2 = 11.6;
const aStart4 = Math.max(aStart2 + 6, T - 10.5);
/*
 * Fixed gains, not loudnorm: the rendered scores sit about 18 dB under the
 * track, and loudnorm's dynamic mode pumps on clips this short. Each score
 * starts with a second of its own fade-in, which is trimmed off.
 */
const SCORE_GAIN = '17dB';
const len2 = aStart4 - aStart2 + 1;
const len4 = T - aStart4;
const audio =
  `[${segs.length}:a]aresample=48000,afade=out:st=11.4:d=1.4,apad[a0];` +
  `[${segs.length + 1}:a]aresample=48000,atrim=1:${(1 + len2).toFixed(2)},asetpts=PTS-STARTPTS,volume=${SCORE_GAIN},afade=in:d=0.6,afade=out:st=${(len2 - 1).toFixed(2)}:d=1,adelay=${Math.round(aStart2 * 1000)}:all=1,apad[a1];` +
  `[${segs.length + 2}:a]aresample=48000,atrim=1:${(1 + len4).toFixed(2)},asetpts=PTS-STARTPTS,volume=${SCORE_GAIN},afade=in:d=0.8,afade=out:st=${(len4 - 1.6).toFixed(2)}:d=1.6,adelay=${Math.round(aStart4 * 1000)}:all=1,apad[a2];` +
  `[a0][a1][a2]amix=inputs=3:normalize=0,atrim=0:${T.toFixed(3)},alimiter=limit=0.8[a]`;

const inputs = segs.flatMap((f) => ['-i', f]);
const outPath = resolve(OUTFILE);
run([...inputs, '-i', track, '-i', s2, '-i', s4, '-filter_complex', `${chain.slice(0, -1).replace(/\[x\d+\]$/, '')}[v];${audio}`,
  '-map', '[v]', '-map', '[a]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', '-t', T.toFixed(3), outPath]);
console.log(outPath);
