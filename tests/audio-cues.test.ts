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
  'shutter',
  'maglock',
  'cabinet',
  'gate',
  'roll',
  'stretch',
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

  /**
   * The shutter goes UP, and it is over in under half a second.
   *
   * `ROLLER_RISE_TIME` is 0.42 s in `ch2-expo.ts` and `src/render/roller-door.ts`
   * poses the curtain against it, so the run-up has to land on the same number:
   * the hit first, bursts through the middle, and the jam at the end. A cue that
   * ran a second would still be talking while the curtain sat dead in its box.
   */
  it('tears the roller door up over about 0.42 s, and jams', () => {
    const { voices, restore } = stubAudio();
    const audio = createAudio();
    audio.play('shutter');

    expect(voices.length, 'the shutter is not built out of several voices').toBeGreaterThanOrEqual(8);
    const t0 = Math.min(...voices.map((v) => v.start));
    // The hit is the first thing, on the frame Biggy goes through.
    expect(voices.some((v) => v.start - t0 < 0.005), 'the impact is not the first thing').toBe(true);
    // The run-up: something sounding through the middle of the rise.
    const rising = voices.filter((v) => v.start - t0 > 0.05 && v.start - t0 < 0.4);
    expect(rising.length, 'nothing sounds while the curtain is rising').toBeGreaterThanOrEqual(3);
    // And the jam, on `ROLLER_RISE_TIME` rather than whenever.
    expect(voices.some((v) => Math.abs(v.start - t0 - 0.42) < 0.06), 'the curtain never arrives').toBe(true);
    const end = Math.max(...voices.map((v) => v.stop));
    expect(end - t0).toBeLessThan(1.3);

    audio.dispose();
    restore();
  });

  /**
   * The three doors that used to open in silence, and each one has to sound like
   * the thing it is: *"a gate and a cabinet door do not sound like a fire door."*
   *
   * They are the same contract `door-open` and `shutter` are under — a beginning
   * and an arrival, landing on the sim's own clock — at three different sizes.
   */
  it("releases cinema B's maglock and lands the leaf inside the swing", () => {
    const { voices, restore } = stubAudio();
    const audio = createAudio();
    audio.play('maglock');
    const t0 = Math.min(...voices.map((v) => v.start));
    const end = Math.max(...voices.map((v) => v.stop));
    // The strike is the first thing: the projector panel did this, from across the
    // room, and the buzz is what says electric rather than mechanical.
    expect(voices.some((v) => v.start - t0 < 0.005), 'the strike is not the first thing').toBe(true);
    // `LOCK_SWING_TIME` is 0.7 s in `ch1-night.ts` — smaller than the fire door's
    // second, which is the whole reason this is a separate cue.
    expect(voices.some((v) => Math.abs(v.start - t0 - 0.7) < 0.12), 'the leaf never arrives').toBe(true);
    expect(end - t0, 'it is still talking long after the door has stopped').toBeLessThan(1.1);

    audio.dispose();
    restore();
  });

  it('grinds the cabinet open, loudest in the middle, and stops twice', () => {
    const { voices, restore } = stubAudio();
    const audio = createAudio();
    audio.play('cabinet');
    const t0 = Math.min(...voices.map((v) => v.start));
    const end = Math.max(...voices.map((v) => v.stop));
    // `CABINET_SWING_TIME` is 1.2 s in `ch2-expo.ts`: the longest of the three
    // swings, because nothing about it is being let go of.
    expect(end - t0).toBeGreaterThan(1.2);
    expect(end - t0).toBeLessThan(1.9);
    // The hinges sound THROUGH the swing — a door being forced, not one arriving.
    const during = voices.filter((v) => v.start - t0 > 0.05 && v.start - t0 < 0.6);
    expect(during.length, 'the cabinet opens in silence between its ends').toBeGreaterThanOrEqual(3);
    // Two leaves, so two stops, a breath apart rather than one object landing.
    const stops = voices.filter((v) => v.start - t0 > 1.0).map((v) => v.start - t0).sort((a, b) => a - b);
    expect(stops.length, 'the pair of doors arrives as one').toBeGreaterThanOrEqual(4);
    expect(stops[stops.length - 1] - stops[0], 'both leaves stop on the same instant').toBeGreaterThan(0.05);

    audio.dispose();
    restore();
  });

  it("opens the stair gate for the day rather than breaking it", () => {
    const { voices, restore } = stubAudio();
    const audio = createAudio();
    audio.play('gate');
    const t0 = Math.min(...voices.map((v) => v.start));
    // `GATE_SWING_TIME` is 1.5 s in `ch3-breakfast.ts`, and it is pinned back
    // against the wall at the end of it.
    expect(voices.some((v) => Math.abs(v.start - t0 - 1.5) < 0.12), 'the barrier never gets there').toBe(true);
    /*
     * And the thing that makes it Stephan rather than Biggy: NOTHING HITS.
     *
     * `crash` and `shutter` both open on a full-weight impact — a quarter- to
     * third-of-a-second body of low sine under the transient — and that shape is
     * what "a door giving way" sounds like. This one opens on a hook coming off an
     * eye, so everything in its first fiftieth of a second is a tap: short enough
     * that it cannot be carrying a weight.
     */
    const opening = voices.filter((v) => v.start - t0 < 0.02);
    expect(opening.length, 'the gate starts with nothing at all').toBeGreaterThan(0);
    for (const v of opening) {
      expect(
        v.stop - v.start,
        'the gate opens on a body blow — it is being smashed, not unhooked',
      ).toBeLessThan(0.12);
    }
    // ...which is exactly what the two doors that ARE hit do, measured the same way.
    for (const hit of ['crash', 'shutter'] as const) {
      const other = stubAudio();
      const a2 = createAudio();
      a2.play(hit);
      const h0 = Math.min(...other.voices.map((v) => v.start));
      expect(
        other.voices.some((v) => v.start - h0 < 0.02 && v.stop - v.start >= 0.12),
        `\`${hit}\` no longer opens on an impact, so this comparison says nothing`,
      ).toBe(true);
      a2.dispose();
      other.restore();
    }

    audio.dispose();
    restore();
  });

  /**
   * The two party tricks Michele asked for: *"Could we add a basic action to each
   * robot on E? Voxxy jumps, Biggy rolls, Droid? Stretches?"* Both are driven off
   * `flairPhase` in `src/sim/bot.ts` — one cue per flourish, fired when it starts —
   * so the cue's own shape has to match the pose the gait is drawing.
   */
  it('knocks three times for Biggy s roll', () => {
    const { voices, restore } = stubAudio();
    const audio = createAudio();
    audio.play('roll');
    const t0 = Math.min(...voices.map((v) => v.start));
    // A turn and a half: three apexes, at roughly 0.17 / 0.5 / 0.83 of the flourish.
    const knocks = voices.filter((v) => v.kind === 'osc' && v.start - t0 > 0.05);
    expect(knocks.length, 'the roll does not have three knocks in it').toBeGreaterThanOrEqual(3);
    const last = Math.max(...voices.map((v) => v.start)) - t0;
    expect(last).toBeGreaterThan(0.6);
    expect(last).toBeLessThan(1.1);
    audio.dispose();
    restore();
  });

  it('holds Droid s stretch at the top and lets it down', () => {
    const { voices, restore } = stubAudio();
    const audio = createAudio();
    audio.play('stretch');
    const t0 = Math.min(...voices.map((v) => v.start));
    // The whine starts immediately, the stop is around the top of the reach, and
    // something happens on the settle — a stretch that only goes up is a wince.
    expect(voices.some((v) => v.start - t0 < 0.005), 'the servo does not start the stretch').toBe(true);
    expect(voices.some((v) => Math.abs(v.start - t0 - 0.64) < 0.12), 'nothing happens at the top').toBe(true);
    expect(voices.some((v) => v.start - t0 > 0.9), 'the stretch never comes back down').toBe(true);
    audio.dispose();
    restore();
  });
});
