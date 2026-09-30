/**
 * tools/promo/cut.mjs — edits the frames `capture.mjs` shot into the promo:
 * segments, the text cards from `cards.html`, transitions, and the sound.
 *
 *   node tools/promo/cut.mjs <framesDir> <audioDir> <out.mp4> [--url github.com/you/repo]
 *
 *   [--play devoxx-after-dark.vercel.app] [--pocs devoxx-game-pocs.vercel.app]
 *
 * `audioDir` holds the game's own sound, rendered by `tools/render-audio/`:
 *   bed.wav      --seconds 6 --mute music,cues        the building's room tone
 *   opening.wav  --seconds 14                         the opening as the game plays it
 *   score1.wav   --seconds 34 --mute bed,cues         chapter 1's score, from 12.33 s
 *   scoreN.wav   --seconds 12 --opening-score N --mute bed,cues   (N = 2, 3, 4)
 * The opening's frames and opening.wav are both stepped from game time 0, so
 * the crates land on their own sounds.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args.splice(i, 2)[1] : d;
};
/** The links on the cards; the submission's public URLs may still change. */
const LINKS = {
  url: flag('url', 'github.com/Smirne/devoxx-gauntlet-m'),
  play: flag('play', 'devoxx-after-dark.vercel.app'),
  pocs: flag('pocs', 'devoxx-game-pocs.vercel.app'),
};
const MAX = Number(flag('max', '63'));
const [FRAMES, AUDIO, OUTFILE = 'after-dark-trailer.mp4'] = args;
if (!FRAMES || !AUDIO) throw new Error('usage: node tools/promo/cut.mjs <framesDir> <audioDir> <out.mp4> [--url ...]');
const WORK = join(FRAMES, '_cut');
mkdirSync(WORK, { recursive: true });
const FPS = 30;

/*
 * The edit. `from`/`len` are frames of the clip (30 fps). `cards` are laid over
 * the segment, each [card, from s, to s] (to omitted: to the end); `bg` dims and
 * blurs the footage under a full card, `black` puts it on black; `hold` is one frame
 * of the clip held still instead of `from`; `into` is the transition INTO this
 * segment (xfade name, seconds); `act` names the sound under it.
 */
const EDIT = [
  { clip: 'splash', from: 0, len: 76, zoom: 0.0009, cards: [['spoilers', 0.3]], act: 'bed' },
  // The opening, whole: no cuts (Michele, 30 Sep).
  { clip: 'opening', from: 0, len: 366, into: ['fadeblack', 0.5], act: 'opening' },
  // Orange alone first, long enough to see nothing happen; then Droid's green, and the 9.
  { clip: 'light', from: 55, len: 155, cards: [['tagline', 0, 2.5], ['light', 2.7]], into: ['fadeblack', 0.5], act: 'ch1' },
  // Droid tries on his own, right under the panel: the stretch (capture.mjs's STAGED_PATCH).
  { clip: 'lever', from: 14, len: 86, cards: [['lever']], into: ['circleopen', 0.4], act: 'ch1' },
  // Already up on Biggy (Michele, 30 Sep: "fade on Droid already on him"): Biggy
  // creeps straight at the panel, stops dead facing it, Droid reaches up and pulls.
  { clip: 'lever', from: 420, len: 142, cards: [['climb', 0, 2.4]], into: ['fadeblack', 0.4], act: 'ch1' },
  { clip: 'roller', from: 24, len: 94, cards: [['roller']], into: ['wipeleft', 0.35], act: 'ch2' },
  { clip: 'booths', from: 20, len: 72, cards: [['venue']], into: ['pixelize', 0.35], act: 'ch2' },
  // He is on the forecourt from step 1759 (frame 47), in through the doors, and
  // the pat on Voxxy's head at 1923 (frame 211).
  { clip: 'stephan', from: 72, len: 150, cards: [['stephan']], into: ['fadeblack', 0.45], act: 'ch3' },
  { clip: 'gate', from: 14, len: 90, cards: [['gate']], into: ['wiperight', 0.35], act: 'ch3' },
  // The cameo: the backpack first (Michele, 30 Sep: "I'd like to show the backpack"), then both of them.
  { clip: 'cameo', from: 4, len: 118, cards: [['cameo', 1.2]], into: ['fadeblack', 0.4], act: 'ch3' },
  // The last letter in one straight carry, #DEVOXX, and up to the house screen.
  { clip: 'keynote', from: 4, len: 202, cards: [['keynote', 0, 3.6]], into: ['radial', 0.4], act: 'ch4' },
  // How we made it, long enough to read, on black: the house screen fades out into it.
  // Over blurred footage the cards read as shaky, over the screen as cluttered (Michele, 30 Sep).
  { clip: 'keynote', hold: 300, len: 118, cards: [['made1']], black: true, into: ['fade', 0.5], act: 'ch4', sfx: false },
  { clip: 'keynote', hold: 300, len: 110, cards: [['made2']], black: true, into: ['fade', 0.35], act: 'ch4', sfx: false },
  { clip: 'keynote', hold: 300, len: 100, cards: [['made3']], black: true, into: ['fade', 0.35], act: 'ch4', sfx: false },
  { clip: 'end', from: 0, len: 88, cards: [['end']], into: ['fadeblack', 0.5], fadeOut: 0.8, act: 'ch4', sfx: false },
];

/** Where each act's sound comes from: file, first usable second, level (mean dB). */
const ACTS = {
  bed: { file: 'bed.wav', src: 0.3, level: -30 },
  // The track opens on its first beat, as it does in the game; over a second here.
  opening: { file: 'opening.wav', src: 0, level: -19, sync: true, fadeIn: 1.2 },
  ch1: { file: 'score1.wav', src: 12.6, level: -23 },
  ch2: { file: 'score2.wav', src: 1.0, level: -22 },
  ch3: { file: 'score3.wav', src: 1.0, level: -22 },
  ch4: { file: 'score4.wav', src: 1.0, level: -21 },
};

const run = (a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });

/* ------------------------------------------------------------ the cards --- */

const cardNames = [...new Set(EDIT.flatMap((s) => (s.cards ?? []).map((c) => c[0])))];
{
  const { browser, page } = await launch({ width: 1920, height: 1080 });
  for (const c of cardNames) {
    await page.goto(`${pathToFileURL(join(here, 'cards.html')).href}?card=${c}&${new URLSearchParams(LINKS)}`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(WORK, `card-${c}.png`), omitBackground: true });
  }
  await browser.close();
}

/* ------------------------------------------------------------- segments --- */

EDIT.forEach((s, i) => {
  const dur = s.len / FPS;
  const out = join(WORK, `seg${String(i).padStart(2, '0')}.mp4`);
  // `hold`: one frame of the clip, held for the segment's length.
  const inputs =
    s.hold === undefined
      ? ['-framerate', String(FPS), '-start_number', String(s.from), '-i', join(FRAMES, s.clip, '%05d.jpg')]
      : ['-loop', '1', '-framerate', String(FPS), '-t', dur.toFixed(3), '-i', join(FRAMES, s.clip, `${String(s.hold).padStart(5, '0')}.jpg`)];
  let v = `[0:v]scale=1920:1080:flags=lanczos,setsar=1,trim=end_frame=${s.len}`;
  // zoompan crops on whole pixels, so a slow push at 1080p steps a pixel at a time
  // and the wordmark trembles. On four times the pixels the step is a quarter of one.
  if (s.zoom) v += `,scale=7680:4320:flags=lanczos,zoompan=z='1+${s.zoom}*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS}`;
  if (s.bg) v += ',gblur=sigma=14,eq=brightness=-0.08:saturation=0.8';
  // Black under the card: the screen's own words showed through (Michele, 30 Sep).
  if (s.black) v += ',colorchannelmixer=rr=0:gg=0:bb=0';
  if (s.fadeOut) v += `,fade=out:st=${(dur - s.fadeOut).toFixed(3)}:d=${s.fadeOut}`;
  let graph = `${v}[b0];`;
  let prev = '[b0]';
  (s.cards ?? []).forEach(([name, t0 = 0, t1 = dur], k) => {
    const end = Math.min(t1, dur);
    inputs.push('-loop', '1', '-t', dur.toFixed(3), '-i', join(WORK, `card-${name}.png`));
    const inAt = t0 + (s.bg ? 0.15 : 0.3);
    let c = `[${k + 1}:v]format=rgba,fade=in:st=${inAt.toFixed(3)}:d=0.3:alpha=1`;
    if (!(s.fadeOut && end >= dur)) c += `,fade=out:st=${(end - 0.4).toFixed(3)}:d=0.3:alpha=1`;
    graph += `${c}[c${k}];${prev}[c${k}]overlay=0:0:format=auto[b${k + 1}];`;
    prev = `[b${k + 1}]`;
  });
  graph += `${prev}format=yuv420p[v]`;
  run([...inputs, '-filter_complex', graph, '-map', '[v]', '-frames:v', String(s.len), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', out]);
});

/* ---------------------------------------------------------- transitions --- */

const segs = EDIT.map((_, i) => join(WORK, `seg${String(i).padStart(2, '0')}.mp4`));
/** When each segment's first frame is on screen, and when its last one goes. */
const starts = [0];
const ends = [EDIT[0].len / FPS];
let length = EDIT[0].len / FPS;
let chain = '';
let last = '[0:v]';
EDIT.slice(1).forEach((s, k) => {
  const i = k + 1;
  const [kind, d] = s.into ?? ['fade', 0.04];
  const offset = length - d;
  chain += `${last}[${i}:v]xfade=transition=${kind}:duration=${d}:offset=${offset.toFixed(3)}[x${i}];`;
  last = `[x${i}]`;
  starts.push(offset);
  length = offset + s.len / FPS;
  ends.push(length);
});
console.log(`cut: ${length.toFixed(2)} s`);
EDIT.forEach((s, i) => console.log(`  ${starts[i].toFixed(2)}–${ends[i].toFixed(2)} s  ${s.clip} ${s.hold === undefined ? s.from : `hold ${s.hold}`}+${s.len}`));
if (length > MAX + 0.001) throw new Error(`the cut runs ${length.toFixed(2)} s: over the ${MAX} s limit`);
const T = length;

/* ---------------------------------------------------------------- sound --- */

/** Mean (or peak) level of a stretch of a file, dB. */
function meanDb(file, from, len, what = 'mean') {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(from), '-t', String(len), '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const m = new RegExp(`${what}_volume: (-?[\\d.]+) dB`).exec(String(r.stderr));
  if (!m) throw new Error(`no level for ${file}`);
  return Number(m[1]);
}

/*
 * One stretch of sound per act, from the first frame of its first segment to
 * the last of its last, crossfaded into its neighbours. A stretch longer than
 * its source is laid again, the next copy crossfading in over the last.
 */
const XF = 0.8;
const pieces = [];
const actGain = {};
for (const [act, a] of Object.entries(ACTS)) {
  const idx = EDIT.map((s, i) => (s.act === act ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) continue;
  const file = join(AUDIO, a.file);
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  const lastSeg = idx[idx.length - 1];
  const t0 = a.sync ? starts[idx[0]] : Math.max(0, starts[idx[0]] - XF / 2);
  const t1 = Math.min(T, ends[lastSeg] + (lastSeg === EDIT.length - 1 ? 0 : XF / 2));
  const srcLen = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString()) - a.src;
  const gain = a.level - meanDb(file, a.src, Math.min(srcLen, t1 - t0));
  actGain[act] = gain;
  for (let at = t0; at < t1 - 0.05; ) {
    const len = Math.min(srcLen, t1 - at);
    pieces.push({ file, src: a.src, at, len, gain, end: at + len >= T - 0.05, fadeIn: a.fadeIn });
    if (len < srcLen) break;
    at += len - XF;
  }
  console.log(`sound: ${act} ${t0.toFixed(2)}–${t1.toFixed(2)} s, ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`);
}
/*
 * Under each shot, the game's own cues for exactly its frames (`sfx.wav`, shot
 * with it by capture.mjs): Droid's feet, the clue's chime, the lever, the
 * printer. At the score's gain — the game's own balance — unless that puts the
 * loudest of them over SFX_PEAK: a shutter at +15 dB is a limiter, not a sound.
 */
const SFX_PEAK = -6;
EDIT.forEach((s, i) => {
  const file = join(FRAMES, s.clip, 'sfx.wav');
  if (s.sfx === false || !existsSync(file)) return;
  const peak = meanDb(file, s.from / FPS, s.len / FPS, 'max');
  const gain = Math.min(actGain[s.act] ?? 0, SFX_PEAK - peak) + (s.sfxDb ?? 0);
  console.log(`sound: ${s.clip} ${s.from}+${s.len} cues ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`);
  pieces.push({ file, src: s.from / FPS, at: starts[i], len: s.len / FPS, gain, end: false, fadeIn: 0.12, fadeOut: 0.2 });
});
const aIn = segs.length;
let audio = '';
pieces.forEach((p, k) => {
  const fadeIn = p.fadeIn ?? (p.at === 0 ? 1.5 : XF);
  const fadeOut = p.fadeOut ?? (p.end ? 1.6 : XF);
  audio += `[${aIn + k}:a]aresample=48000,atrim=${p.src.toFixed(3)}:${(p.src + p.len).toFixed(3)},asetpts=PTS-STARTPTS,` +
    `volume=${p.gain.toFixed(2)}dB,afade=in:d=${fadeIn},afade=out:st=${(p.len - fadeOut).toFixed(3)}:d=${fadeOut},` +
    `adelay=${Math.round(p.at * 1000)}:all=1,apad[a${k}];`;
});
// `level=0`: left on, alimiter turns the result back up to 0 dBFS after limiting it.
audio += `${pieces.map((_, k) => `[a${k}]`).join('')}amix=inputs=${pieces.length}:normalize=0,atrim=0:${T.toFixed(3)},alimiter=limit=0.8:level=0[a]`;

const outPath = resolve(OUTFILE);
run([...segs.flatMap((f) => ['-i', f]), ...pieces.flatMap((p) => ['-i', p.file]),
  '-filter_complex', `${chain.slice(0, -1).replace(/\[x\d+\]$/, '')}[v];${audio}`,
  '-map', '[v]', '-map', '[a]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', '-t', T.toFixed(3), outPath]);
console.log(outPath);
