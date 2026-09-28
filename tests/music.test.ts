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

import type { Audio } from '../src/render/audio';
import { createCues, scoreFor } from '../src/render/cues';
import {
  MUSIC_GAIN,
  PITCHED,
  SCORES,
  STEPS,
  WALK_BAR,
  barNotes,
  barSeconds,
  chordNote,
  hz,
  startMusic,
  type Score,
} from '../src/render/music';
import { createGame } from '../src/sim/game';
import { LEAD, OVER_AT, PANEL_DELAY, PANEL_EACH, SLOT, STRIKES, WALK_AT, emergencyAt } from '../src/sim/opening';
import type { GameSnapshot } from '../src/sim/types';

/** `MASTER_GAIN` in `src/render/audio.ts` — the headroom the score is mixed under. */
const MASTER_GAIN = 0.55;

/** 0 is the opening cinematic — scored since 28 Sep 2026 ("there should be music also in the animation"). */
const CHAPTERS = [0, 1, 2, 3, 4] as const;
const entries = CHAPTERS.map((c) => [c, SCORES[c]] as const);

describe('the score', () => {
  it('has one for every chapter and nothing else', () => {
    expect(Object.keys(SCORES).map(Number).sort()).toEqual([0, 1, 2, 3, 4]);
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

  /**
   * Per part, not per voice. It compared the voice's note count either side of
   * `from`, which a part that joins while another of the same voice leaves (the
   * opening changes drum pattern every bar) fails for being right, and an empty
   * part passes whenever the voice happened to grow. Now: the part itself is
   * silent the bar before it joins and plays on the bar it joins, and the same the
   * other way round when it leaves.
   */
  it.each(entries)('chapter %i builds up (and thins out) when it says it does', (_c, s: Score) => {
    s.parts.forEach((p, i) => {
      const mine = (bar: number): number => barNotes(s, bar).filter((n) => n.part === i).length;
      if (p.from !== undefined) {
        expect(p.from).toBeGreaterThan(0);
        expect(mine(p.from - 1), `part ${i} (${p.voice}) before it joins`).toBe(0);
        expect(mine(p.from), `part ${i} (${p.voice}) on the bar it joins`).toBeGreaterThan(0);
      }
      if (p.until !== undefined) {
        expect(p.until).toBeGreaterThan(p.from ?? 0);
        expect(mine(p.until - 1), `part ${i} (${p.voice}) on its last bar`).toBeGreaterThan(0);
        expect(mine(p.until), `part ${i} (${p.voice}) after it leaves`).toBe(0);
      }
    });
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

/**
 * The opening's score is cut to the opening's picture.
 *
 * Every number here is read from `src/sim/opening.ts`, which owns the clock: the
 * score places itself by the same constants, and these hold the two together when
 * somebody retimes a crate. Michele, 28 Sep: *"It should fit also with crate
 * opening and current sounds (but you can also adapt the animation timing to the
 * music)"* — both happened, and this is what keeps them fitted.
 */
describe('the opening, scored to its picture', () => {
  const s = SCORES[0];
  const bar = barSeconds(s);
  /** Seconds from the cue (the opening's first frame) to bar `k` of the score. */
  const barAt = (k: number): number => (s.lead ?? 0) + k * bar;

  it('is one bar per robot, at the reference track s 96 bpm', () => {
    expect(bar).toBeCloseTo(SLOT, 9);
    expect(s.bpm).toBeCloseTo(96, 9);
  });

  it('lands every crate front on a downbeat', () => {
    for (let i = 0; i < 3; i++) expect(barAt(i + 1), `crate ${i + 1}`).toBeCloseTo(LEAD + i * SLOT + PANEL_DELAY + PANEL_EACH, 9);
  });

  it('leaves those three downbeats to the crates: the crate boom is the kick', () => {
    for (const k of [1, 2, 3]) {
      const kicks = barNotes(s, k).filter((n) => (n.voice === 'thump' || n.voice === 'kick') && n.step === 0);
      expect(kicks, `bar ${k}`).toEqual([]);
    }
  });

  it('starts the walk, and the emergency light going, on the next downbeat', () => {
    expect(WALK_BAR).toBe(4);
    expect(barAt(WALK_BAR)).toBeCloseTo(WALK_AT, 9);
  });

  it('cuts out only while the light is out, and comes back with it', () => {
    const gates = s.gates ?? [];
    expect(gates.length).toBe(STRIKES.length - 1);
    for (const [a, b] of gates) {
      for (let t = a + 0.002; t < b - 0.002; t += 0.005) expect(emergencyAt(t), `cut at ${t.toFixed(3)} s with the light on`).toBe(0);
      expect(emergencyAt(b + 0.002), 'the light came back and the band did not').toBeGreaterThan(0);
    }
  });

  it('loses its power on the strike the light does not come back from', () => {
    const notes = barNotes(s, WALK_BAR);
    const dive = notes.filter((n) => n.voice === 'dive');
    expect(dive.length).toBe(1);
    const at = barAt(WALK_BAR) + (dive[0].step * bar) / STEPS;
    expect(emergencyAt(at - 0.01), 'the band died before the light did').toBeGreaterThan(0);
    for (let t = at + 0.001; t < OVER_AT; t += 0.01) expect(emergencyAt(t), `light back at ${t.toFixed(2)} s`).toBe(0);
    // Nothing the band holds outlasts the power, and the dive is over in the dark.
    for (const n of notes) if (n.voice !== 'dive' && PITCHED.has(n.voice)) expect(n.step + n.len, n.voice).toBeLessThanOrEqual(dive[0].step);
    expect(at + (dive[0].len * bar) / STEPS).toBeLessThanOrEqual(OVER_AT + 1e-9);
  });

  it('plays once: nothing after the walk s bar', () => {
    for (let k = WALK_BAR + 1; k < WALK_BAR + 6; k++) expect(barNotes(s, k)).toEqual([]);
  });
});

/**
 * Which score the frame asks for.
 *
 * The opening runs on top of chapter 1, so `snap.chapter` reads 1 under the crates,
 * and the score used to be picked from it: the opening's own score was written
 * twice and never heard once. This walks a real game through its opening.
 */
describe('which score the game asks for', () => {
  it('scores the opening with its own score, and hands over when chapter 1 takes over', () => {
    const asked: { t: number; score: number }[] = [];
    let t = 0;
    const audio: Audio = {
      play: () => undefined,
      setAmbient: () => undefined,
      footstep: () => undefined,
      mute: () => undefined,
      muteMusic: () => undefined,
      dispose: () => undefined,
      setMusic: (score: number) => void asked.push({ t, score }),
    };
    const game = createGame({ seed: 1, cards: true });
    const cues = createCues(audio);
    const dt = 1 / 60;
    while (t < OVER_AT + 0.5) {
      game.update(dt);
      t += dt;
      cues(game.snapshot(), dt);
    }
    expect(asked.map((a) => a.score)).toEqual([0, 1]);
    expect(asked[0].t).toBeLessThan(0.05);
    expect(asked[1].t).toBeCloseTo(OVER_AT, 1);
  });

  it('asks for nothing on a title card', () => {
    expect(scoreFor({ chapter: 0, opening: null } as unknown as GameSnapshot)).toBe(-1);
    expect(scoreFor({ chapter: 3, opening: null } as unknown as GameSnapshot)).toBe(3);
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
      return { type: 'lowpass', frequency: param(), Q: param(), gain: param(), connect, disconnect: (): void => undefined };
    },
    createStereoPanner(): unknown {
      return { pan: param(), connect, disconnect: (): void => undefined };
    },
    createConvolver(): unknown {
      return { buffer: null, normalize: true, connect, disconnect: (): void => undefined };
    },
    createBuffer(channels: number, length: number, sampleRate: number): unknown {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { duration: length / sampleRate, numberOfChannels: channels, getChannelData: (c: number): Float32Array => data[c] };
    },
    createWaveShaper(): unknown {
      return { curve: null, oversample: 'none', connect, disconnect: (): void => undefined };
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
    // 0 used to be the unscored one; the opening has a score now.
    m.setChapter(9);
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
