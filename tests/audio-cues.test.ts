/**
 * Every cue in `src/render/audio.ts` builds a real graph, and the fire door's
 * opening has the shape it claims to have.
 *
 * There was no test over the audio at all, which is fair while a cue is only ever
 * judged by ear — but "no console errors" is one of GAUNTLET.md's own acceptance
 * criteria and a cue that throws does it inside a rAF frame, where nothing is
 * listening. It is also the only way to check a cue at all in this environment:
 * headless Chromium has no audio device, and the sound Michele asked for when the
 * fire door opens would otherwise ship having never once been executed.
 *
 * The stub is deliberately thin: enough Web Audio to let `createAudio()` build its
 * master chain and each voice, and a record of what was created and when. It
 * asserts the SHAPE of a cue — how many voices, over how long — never how it
 * sounds, which is Michele's call and nobody else's.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAudio, type SoundId } from '../src/render/audio';

interface Voice {
  kind: 'osc' | 'noise';
  start: number;
  stop: number;
}

/** A scheduled `AudioParam`: only the calls `audio.ts` actually makes. */
function param(value = 0): Record<string, unknown> {
  return {
    value,
    setValueAtTime: (): void => undefined,
    exponentialRampToValueAtTime: (): void => undefined,
    linearRampToValueAtTime: (): void => undefined,
    cancelScheduledValues: (): void => undefined,
    setTargetAtTime: (): void => undefined,
  };
}

function stubAudio(): { voices: Voice[]; restore: () => void } {
  const voices: Voice[] = [];
  const connect = (n: unknown): unknown => n;

  class Ctx {
    currentTime = 0;
    sampleRate = 48000;
    state = 'running';
    destination = { connect };
    createGain(): unknown {
      return { gain: param(1), connect };
    }
    createDynamicsCompressor(): unknown {
      return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect };
    }
    createBiquadFilter(): unknown {
      return { type: 'lowpass', frequency: param(), Q: param(), connect };
    }
    createOscillator(): unknown {
      const v: Voice = { kind: 'osc', start: 0, stop: 0 };
      const node = {
        type: 'sine',
        frequency: param(),
        detune: param(),
        connect,
        onended: null as null | (() => void),
        start(t: number): void {
          v.start = t;
          voices.push(v);
        },
        stop(t: number): void {
          v.stop = t;
          node.onended?.();
        },
      };
      return node;
    }
    createBufferSource(): unknown {
      const v: Voice = { kind: 'noise', start: 0, stop: 0 };
      const node = {
        buffer: null as unknown,
        loop: false,
        playbackRate: param(1),
        connect,
        onended: null as null | (() => void),
        start(t: number): void {
          v.start = t;
          voices.push(v);
        },
        stop(t: number): void {
          v.stop = t;
          node.onended?.();
        },
      };
      return node;
    }
    createBuffer(_ch: number, len: number): unknown {
      return { duration: len / this.sampleRate, getChannelData: (): Float32Array => new Float32Array(len) };
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }

  vi.stubGlobal('window', {
    AudioContext: Ctx,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  });
  vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
  return { voices, restore: () => vi.unstubAllGlobals() };
}

afterEach(() => vi.unstubAllGlobals());

const IDS: readonly SoundId[] = [
  'chime',
  'nope',
  'door',
  'crash',
  'door-open',
  'keypad',
  'switch',
  'clue',
  'breaker',
  'mount',
  'transition',
  'applause',
  'victory',
];

describe('the synthesised cues', () => {
  it('builds a graph for every sound id, and none of them throws', () => {
    for (const id of IDS) {
      const { voices, restore } = stubAudio();
      const audio = createAudio();
      audio.play(id);
      expect(voices.length, `\`${id}\` scheduled nothing`).toBeGreaterThan(0);
      for (const v of voices) {
        expect(v.stop, `\`${id}\` scheduled a voice that never stops`).toBeGreaterThan(v.start);
      }
      audio.dispose();
      restore();
    }
  });

  it('opens the fire door over about a second, and lands on something', () => {
    const { voices, restore } = stubAudio();
    const audio = createAudio();
    audio.play('door-open');

    // The magnetic lock, the air round the leaf, the hinge, and the stop at the end:
    // a cue with a beginning and an arrival, not a single hit.
    expect(voices.length, 'the opening is not built out of several voices').toBeGreaterThanOrEqual(5);
    const t0 = Math.min(...voices.map((v) => v.start));
    const end = Math.max(...voices.map((v) => v.stop));
    // `FIRE_SWING_TIME` is 1 s in `ch1-night.ts`; the cue has to cover the swing and
    // stop shortly after it, or the door arrives in silence or is still talking.
    expect(end - t0).toBeGreaterThan(1);
    expect(end - t0).toBeLessThan(1.6);
    // Something has to happen at the END — that is the leaf meeting its stop.
    expect(voices.some((v) => v.start - t0 > 0.8), 'nothing is scheduled at the end of the swing').toBe(true);
    // And something right at the start — the lock letting go.
    expect(voices.some((v) => v.start - t0 < 0.02), 'the lock release is not the first thing').toBe(true);

    audio.dispose();
    restore();
  });
});
