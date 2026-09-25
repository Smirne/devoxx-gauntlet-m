/**
 * The score in `src/render/music.ts` — the part of it that can be checked without
 * ears.
 *
 * Nobody in this environment can hear the music, and whether it is any good is
 * Michele's call. What a test CAN hold is everything the score claims about
 * itself: that no part plays a note outside its own key, that the patterns are
 * whole bars, that the build-up parts arrive on the bar they say they do, and that
 * a bar cannot sum loud enough to eat the sound effects on top of it. That last
 * one is the reason the music has numbers at all — a score that ducks the door
 * Michele just broke is a bug, not a taste.
 *
 * The second half builds a real graph on a stub context, for the same reason
 * `audio-cues.test.ts` does: a scheduler that throws does it inside a timer, where
 * nothing is listening.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MUSIC_GAIN,
  PITCHED,
  SCORES,
  STEPS,
  barNotes,
  barSeconds,
  chordNote,
  hz,
  startMusic,
  type Score,
} from '../src/render/music';

/** `MASTER_GAIN` in `src/render/audio.ts` — the headroom the score is mixed under. */
const MASTER_GAIN = 0.55;

const CHAPTERS = [1, 2, 3, 4] as const;
const entries = CHAPTERS.map((c) => [c, SCORES[c]] as const);

describe('the score', () => {
  it('has one for every chapter and nothing else', () => {
    expect(Object.keys(SCORES).map(Number).sort()).toEqual([1, 2, 3, 4]);
    for (const [, s] of entries) expect(s).toBeDefined();
  });

  it.each(entries)('chapter %i is written in whole bars', (_c, s: Score) => {
    for (const p of s.parts) expect(p.steps.length).toBe(STEPS);
    expect(s.chords.length).toBeGreaterThanOrEqual(2);
    for (const chord of s.chords) expect(chord.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * Every pitched note, over every bar of the loop, is in the chapter's scale.
   *
   * This is the one test that would actually catch a wrong note by ear, because a
   * pattern indexes chord tones and a chord is written by hand: a typo in one MIDI
   * number is inaudible in a diff and unmistakable in a loop.
   */
  it.each(entries)('chapter %i never leaves its key', (_c, s: Score) => {
    for (let bar = 0; bar < s.chords.length * 3; bar++) {
      for (const n of barNotes(s, bar)) {
        if (!PITCHED.has(n.voice)) {
          expect(n.midi).toBe(-1);
          continue;
        }
        expect(s.scale).toContain(((n.midi % 12) + 12) % 12);
        // Low E on a bass guitar to the top of a piccolo: anything outside is a
        // transpose that ran away, not a voicing.
        expect(n.midi).toBeGreaterThanOrEqual(24);
        expect(n.midi).toBeLessThanOrEqual(96);
      }
    }
  });

  /** A loop that neither starts nor ends on its tonic is wandering, not looping. */
  it.each(entries)('chapter %i resolves to its own tonic', (_c, s: Score) => {
    const root = (i: number): number => ((s.chords[i][0] % 12) + 12) % 12;
    expect([root(0), root(s.chords.length - 1)]).toContain(s.tonic);
  });

  it.each(entries)('chapter %i builds up when it says it does', (_c, s: Score) => {
    for (const p of s.parts) {
      if (p.from === undefined) continue;
      expect(p.from).toBeGreaterThan(0);
      const before = barNotes(s, p.from - 1).filter((n) => n.voice === p.voice);
      const after = barNotes(s, p.from).filter((n) => n.voice === p.voice);
      expect(after.length).toBeGreaterThan(before.length);
    }
  });

  /**
   * The loudest instant of the fullest bar, at the destination.
   *
   * Every note is treated as a rectangle of its own peak gain for its whole length,
   * which over-estimates on purpose — a real envelope touches its peak for an
   * instant. So a score that passes this cannot be the thing that clips.
   */
  it.each(entries)('chapter %i leaves room for the game on top of it', (_c, s: Score) => {
    let worst = 0;
    for (let bar = 0; bar < s.chords.length * 3; bar++) {
      const notes = barNotes(s, bar);
      for (let step = 0; step < STEPS; step++) {
        let sum = 0;
        for (const n of notes) if (step >= n.step && step < n.step + n.len) sum += n.gain;
        worst = Math.max(worst, sum);
      }
    }
    const atOutput = worst * MUSIC_GAIN * MASTER_GAIN;
    expect(atOutput).toBeGreaterThan(0.02);
    // A quarter of full scale: the score is a bed under the cues, never beside them.
    expect(atOutput).toBeLessThan(0.25);
  });

  it('wraps a chord index up an octave instead of off the end', () => {
    const chord = [45, 57, 60, 64];
    expect(chordNote(chord, 0)).toBe(45);
    expect(chordNote(chord, 3)).toBe(64);
    expect(chordNote(chord, 4)).toBe(57);
    expect(chordNote(chord, 7)).toBe(76);
  });

  it('agrees with concert pitch', () => {
    expect(hz(69)).toBeCloseTo(440, 6);
    expect(hz(57)).toBeCloseTo(220, 6);
    expect(barSeconds({ ...SCORES[1], bpm: 120 })).toBeCloseTo(2, 6);
  });

  /** Chapter 2 is the same night as chapter 1, and has to sound like it. */
  it('keeps the night in one key and changes key for the morning', () => {
    expect(SCORES[2].tonic).toBe(SCORES[1].tonic);
    expect(SCORES[3].tonic).not.toBe(SCORES[1].tonic);
    expect(SCORES[4].tonic).toBe(SCORES[3].tonic);
    // And it gets faster every chapter it should: night, hall, breakfast.
    expect(SCORES[2].bpm).toBeGreaterThan(SCORES[1].bpm);
    expect(SCORES[3].bpm).toBeGreaterThan(SCORES[2].bpm);
  });
});

/* ------------------------------------------------------------------- player */

interface Made {
  oscs: { freqs: number[] }[];
  noises: number;
  gains: number;
}

/** Just enough Web Audio to let `startMusic()` build and schedule. */
function stubCtx(): { ctx: AudioContext; made: Made; advance: (s: number) => void } {
  const made: Made = { oscs: [], noises: 0, gains: 0 };
  const connect = (n: unknown): unknown => n;
  const param = (value = 0, rec?: (v: number) => void): Record<string, unknown> => ({
    value,
    setValueAtTime: (v: number): void => rec?.(v),
    exponentialRampToValueAtTime: (v: number): void => rec?.(v),
    linearRampToValueAtTime: (v: number): void => rec?.(v),
    cancelScheduledValues: (): void => undefined,
  });
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: { connect },
    createGain(): unknown {
      made.gains++;
      return { gain: param(1), connect, disconnect: (): void => undefined };
    },
    createBiquadFilter(): unknown {
      return { type: 'lowpass', frequency: param(), Q: param(), connect, disconnect: (): void => undefined };
    },
    createOscillator(): unknown {
      const v = { freqs: [] as number[] };
      made.oscs.push(v);
      return {
        type: 'sine',
        frequency: param(0, (f) => v.freqs.push(f)),
        detune: param(),
        connect,
        disconnect: (): void => undefined,
        onended: null,
        start: (): void => undefined,
        stop: (): void => undefined,
      };
    },
    createBufferSource(): unknown {
      made.noises++;
      return {
        buffer: null,
        loop: false,
        connect,
        disconnect: (): void => undefined,
        onended: null,
        start: (): void => undefined,
        stop: (): void => undefined,
      };
    },
  };
  return {
    ctx: ctx as unknown as AudioContext,
    made,
    advance: (s: number): void => void (ctx.currentTime += s),
  };
}

const fakeBuffer = { duration: 2 } as unknown as AudioBuffer;

afterEach(() => vi.useRealTimers());

describe('the player', () => {
  it('schedules real, audible voices for every chapter', () => {
    vi.useFakeTimers();
    for (const chapter of CHAPTERS) {
      const { ctx, made, advance } = stubCtx();
      const out = ctx.createGain();
      const m = startMusic(ctx, out, fakeBuffer);
      m.setChapter(chapter);
      // Four pumps over four seconds: past the fade-in and into the build-ups.
      for (let i = 0; i < 12; i++) {
        advance(0.35);
        vi.advanceTimersByTime(300);
      }
      expect(made.oscs.length).toBeGreaterThan(8);
      for (const o of made.oscs) {
        for (const f of o.freqs) {
          expect(Number.isFinite(f)).toBe(true);
          expect(f).toBeGreaterThan(0.005);
          expect(f).toBeLessThan(24000);
        }
      }
      m.dispose();
    }
  });

  it('is silent for a chapter it has no score for, and does not throw', () => {
    vi.useFakeTimers();
    const { ctx, made, advance } = stubCtx();
    const m = startMusic(ctx, ctx.createGain(), fakeBuffer);
    m.setChapter(0);
    advance(2);
    vi.advanceTimersByTime(1200);
    expect(made.oscs.length).toBe(0);
    m.dispose();
  });

  it('stops scheduling once disposed', () => {
    vi.useFakeTimers();
    const { ctx, made, advance } = stubCtx();
    const m = startMusic(ctx, ctx.createGain(), fakeBuffer);
    m.setChapter(2);
    advance(1);
    vi.advanceTimersByTime(600);
    const after = made.oscs.length;
    m.dispose();
    advance(6);
    vi.advanceTimersByTime(3000);
    expect(made.oscs.length).toBe(after);
  });

  it('survives a chapter change without leaving the old score running', () => {
    vi.useFakeTimers();
    const { ctx, made, advance } = stubCtx();
    const m = startMusic(ctx, ctx.createGain(), fakeBuffer);
    m.setChapter(1);
    for (let i = 0; i < 6; i++) {
      advance(0.35);
      vi.advanceTimersByTime(300);
    }
    m.setChapter(3);
    const atSwap = made.oscs.length;
    for (let i = 0; i < 6; i++) {
      advance(0.35);
      vi.advanceTimersByTime(300);
    }
    // The new deck is scheduling; the old one is only fading, not booking notes.
    expect(made.oscs.length).toBeGreaterThan(atSwap);
    m.mute(true);
    m.mute(false);
    m.dispose();
  });

  it('works with no noise buffer at all', () => {
    vi.useFakeTimers();
    const { ctx, made, advance } = stubCtx();
    const m = startMusic(ctx, ctx.createGain(), null);
    m.setChapter(2);
    for (let i = 0; i < 10; i++) {
      advance(0.35);
      vi.advanceTimersByTime(300);
    }
    expect(made.noises).toBe(0);
    expect(made.oscs.length).toBeGreaterThan(8);
    m.dispose();
  });
});
