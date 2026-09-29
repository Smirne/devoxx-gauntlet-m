/**
 * harness.ts — the opening's sound, rendered offline in a real browser.
 *
 * Nobody building this game can hear it, so the soundtrack is checked the way the
 * pictures are: rendered deterministically, measured, and handed to Michele as a
 * file. This page runs the real sim (`createGame`), the real cue player
 * (`createCues`) and the real `audio.ts` + `music.ts` graph on an
 * `OfflineAudioContext` that stops at every frame, so the game steps the way
 * `main3d.ts` steps it (sim, snapshot, cues) at exactly that audio time.
 *
 * Two things in the audio code assume a live context, and they are the only
 * things faked here:
 *  - `ctx.state`. An offline context reads 'suspended' at every frame stop, and
 *    the music's pump skips a suspended context. The proxy says 'running'.
 *  - timers. The pump runs on `setInterval` and faded decks are torn down by
 *    `setTimeout`. Both run on the render's own clock, so a slow machine renders
 *    the same file as a fast one.
 *
 * Driven by `render.mjs`, which serves this page and saves what it returns.
 */

import { createAudio, type Audio } from '../../src/render/audio';
import { createCues } from '../../src/render/cues';
import { openingTrackReady } from '../../src/render/music';
import { DT_MAX } from '../../src/sim/constants';
import { createGame } from '../../src/sim/game';
import { OVER_AT } from '../../src/sim/opening';

export interface RenderOpts {
  /** Seconds of audio. Default: the whole opening and four seconds of chapter 1. */
  seconds?: number;
  /** How often the game steps, per second; the page's own rAF runs at about 60. */
  fps?: number;
  sampleRate?: number;
  /**
   * Play this score while the opening runs, whatever the cues ask for. Leave it
   * out to hear exactly what the game plays.
   */
  openingScore?: number;
  /** Layers to leave out, to hear or measure the others on their own. */
  mute?: ReadonlyArray<'bed' | 'music' | 'cues'>;
  seed?: number;
}

export interface RenderResult {
  /** 16-bit stereo WAV, base64. */
  wav: string;
  peak: number;
  rms: number;
  seconds: number;
  /** When the score changed, in audio time: what the render actually played. */
  log: string[];
}

/* ---------------------------------------------------------------- the clock */

interface Timer {
  at: number;
  every: number;
  fn: () => void;
}

const timers = new Map<number, Timer>();
let nextId = 1;
let clock = 0;

/** Every timer on the page now runs on `clock`, which only `runTimers` moves. */
function installTimers(): void {
  const w = window as unknown as Record<string, unknown>;
  w.setInterval = (fn: () => void, ms = 0): number => {
    const every = Math.max(1, ms) / 1000;
    timers.set(nextId, { at: clock + every, every, fn });
    return nextId++;
  };
  w.setTimeout = (fn: () => void, ms = 0): number => {
    timers.set(nextId, { at: clock + Math.max(0, ms) / 1000, every: 0, fn });
    return nextId++;
  };
  w.clearInterval = (id: number): void => void timers.delete(id);
  w.clearTimeout = (id: number): void => void timers.delete(id);
}

/** Fire everything due by `until`, earliest first. */
function runTimers(until: number): void {
  for (let guard = 0; guard < 100000; guard++) {
    let due: [number, Timer] | null = null;
    for (const e of timers) if (e[1].at <= until && (!due || e[1].at < due[1].at)) due = e;
    if (!due) break;
    const [id, tm] = due;
    clock = tm.at;
    if (tm.every > 0) tm.at += tm.every;
    else timers.delete(id);
    tm.fn();
  }
  clock = until;
}

/* -------------------------------------------------------------- the context */

/**
 * A constructor that hands back the offline context, seen through a proxy that
 * is always 'running'. `audio.ts` builds its context with `new AudioContext()`,
 * and a constructor that returns an object returns that object.
 */
function offlineConstructor(off: OfflineAudioContext): unknown {
  const live = new Proxy(off, {
    get(target, prop): unknown {
      if (prop === 'state') return 'running';
      if (prop === 'resume' || prop === 'close') return (): Promise<void> => Promise.resolve();
      const v: unknown = Reflect.get(target, prop, target);
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(target, prop, value): boolean {
      return Reflect.set(target, prop, value, target);
    },
  });
  return function OfflineAsLive(): unknown {
    return live;
  };
}

/* -------------------------------------------------------------------- WAV */

function encodeWav(buf: AudioBuffer): { b64: string; peak: number; rms: number } {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = chans[c][i];
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
      out.setInt16(44 + (i * ch + c) * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
    }
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), peak, rms: Math.sqrt(sum / Math.max(1, n * ch)) };
}

/* ------------------------------------------------------------------ render */

async function renderOpening(opts: RenderOpts = {}): Promise<RenderResult> {
  const fps = opts.fps ?? 60;
  const sampleRate = opts.sampleRate ?? 48000;
  const seconds = opts.seconds ?? OVER_AT + 4;
  const off = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * sampleRate), sampleRate });
  (window as unknown as { AudioContext: unknown }).AudioContext = offlineConstructor(off);
  installTimers();

  // The 3D page's own game: the opening, cards on (`main3d.ts`).
  const game = createGame({ seed: opts.seed ?? 1, cards: true });
  const audio = createAudio();
  // The cues ask for a score through this; the frame decides what is played.
  let asked = -1;
  const mute = new Set(opts.mute ?? []);
  const heard: Audio = {
    ...audio,
    setMusic: (ch: number): void => void (asked = ch),
    setAmbient: mute.has('bed') ? (): void => undefined : audio.setAmbient,
    play: mute.has('cues') ? (): void => undefined : audio.play,
    footstep: mute.has('cues') ? (): void => undefined : audio.footstep,
  };
  const cues = createCues(heard);
  // The page's gate: a key is what lets a browser make sound at all.
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  // The opening's track decodes in real time and this render does not wait for
  // real time; a player's decode is done long before the band is due.
  await openingTrackReady();

  const log: string[] = [];
  let playing = -2;
  const dt = 1 / fps;
  function frame(): void {
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(DT_MAX, left);
      game.update(h);
      left -= h;
    }
    const snap = game.snapshot();
    cues(snap, dt);
    const want = mute.has('music') ? -1 : opts.openingScore !== undefined && snap.opening ? opts.openingScore : asked;
    if (want !== playing) {
      log.push(`${off.currentTime.toFixed(3)} s: score ${want}${snap.opening ? ' (opening running)' : ''}`);
      audio.setMusic(want);
      playing = want;
    }
  }

  for (let i = 1; i * dt < seconds - 0.02; i++) {
    void off.suspend(i * dt).then(() => {
      runTimers(off.currentTime);
      frame();
      return off.resume();
    });
  }
  frame();
  const buf = await off.startRendering();
  const { b64, peak, rms } = encodeWav(buf);
  return { wav: b64, peak, rms, seconds, log };
}

(window as unknown as { renderOpening: typeof renderOpening }).renderOpening = renderOpening;
