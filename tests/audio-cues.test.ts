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
  /**
   * Every frequency this oscillator is set to, in the order it is set — the pitch
   * it starts on, anything it ramps to, and every step inside it. Empty for noise,
   * which has no pitch.
   *
   * Michele asked for a 56k handshake, which is a specific set of frequencies and
   * not a vibe: without this the test could only count voices, and a cue that put
   * the answer tone at 400 Hz would pass. See `the modem` below.
   */
  freqs: number[];
  /**
   * The loudest this voice's own envelope is asked to reach.
   *
   * `envelope()` ramps to `peak` and back down, so the largest value the gain is
   * ramped to IS the peak. It is what lets the test say "nothing clips" with a
   * number rather than a hope.
   */
  peak: number;
}

/** A scheduled `AudioParam`: only the calls `audio.ts` actually makes. */
function param(value = 0, rec?: (v: number) => void): Record<string, unknown> {
  const note = (v: number): void => {
    if (rec && Number.isFinite(v)) rec(v);
  };
  return {
    value,
    setValueAtTime: (v: number): void => note(v),
    exponentialRampToValueAtTime: (v: number): void => note(v),
    linearRampToValueAtTime: (v: number): void => note(v),
    cancelScheduledValues: (): void => undefined,
    setTargetAtTime: (v: number): void => note(v),
  };
}

function stubAudio(): { voices: Voice[]; restore: () => void } {
  const voices: Voice[] = [];
  const connect = (n: unknown): unknown => n;
  /**
   * The voice whose envelope has not been created yet.
   *
   * `tone()` creates its oscillator and then its envelope gain; `noise()` creates
   * the buffer source, a filter, then its envelope gain. So the FIRST gain made
   * after a source is that source's envelope, and that is how a peak is attached
   * to a voice without the stub having to model the graph. The master gain is
   * created in `ensure()`, before any source exists, so it is never mistaken for
   * one.
   */
  let pending: Voice | null = null;

  class Ctx {
    currentTime = 0;
    sampleRate = 48000;
    state = 'running';
    destination = { connect };
    createGain(): unknown {
      const v = pending;
      pending = null;
      return { gain: param(1, v ? (x): void => void (v.peak = Math.max(v.peak, x)) : undefined), connect };
    }
    createDynamicsCompressor(): unknown {
      return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect };
    }
    createBiquadFilter(): unknown {
      return { type: 'lowpass', frequency: param(), Q: param(), connect };
    }
    createOscillator(): unknown {
      const v: Voice = { kind: 'osc', start: 0, stop: 0, freqs: [], peak: 0 };
      pending = v;
      const node = {
        type: 'sine',
        frequency: param(0, (f) => v.freqs.push(f)),
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
      const v: Voice = { kind: 'noise', start: 0, stop: 0, freqs: [], peak: 0 };
      pending = v;
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

/** `MASTER_GAIN` in `src/render/audio.ts` — the headroom every cue is mixed under. */
const MASTER_GAIN = 0.55;

/**
 * The loudest the whole cue can be, at the destination, before the limiter.
 *
 * Each voice is treated as a rectangle of its own envelope peak from start to
 * stop, which is a deliberate OVER-estimate: a real envelope only touches its
 * peak for an instant and is below it everywhere else. So a cue that passes this
 * cannot clip, and one that fails it might not — which is the right way round for
 * a bound nobody can hear in this environment.
 */
function loudest(voices: readonly Voice[]): number {
  if (voices.length === 0) return 0;
  const end = Math.max(...voices.map((v) => v.stop));
  let worst = 0;
  for (let t = 0; t <= end; t += 0.001) {
    let sum = 0;
    for (const v of voices) if (t >= v.start && t < v.stop) sum += v.peak;
    if (sum > worst) worst = sum;
  }
  return worst * MASTER_GAIN;
}

/** Every pitch any oscillator in the cue is set to, rounded to the nearest hertz. */
const pitches = (voices: readonly Voice[]): number[] => voices.flatMap((v) => v.freqs).map((f) => Math.round(f));
/** Is `f` among them, within `tol` Hz? */
const hasTone = (voices: readonly Voice[], f: number, tol = 3): boolean =>
  pitches(voices).some((p) => Math.abs(p - f) <= tol);

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
  'busbar',
  'modem',
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

  /**
   * THE SWITCHBOARD TAKING LOAD — Michele, 26 Sep 2026: *"the braker activation
   * seems to do nothing, apart from the message."*
   *
   * The last handle is the one that closes the supply, and the chapter's own
   * narration has always said what that sounds like: *"a thump you feel through
   * the floor"*, *"a relay drops somewhere over your head"*. What it must NOT
   * sound like is a room lighting up, because the room does not light up — the
   * whole chain rests on that (`tests/ch2-chain.test.ts`), and a bright cue is a
   * promise a dark hall then breaks.
   */
  it('lands the supply low, and hums at twice the mains', () => {
    const { voices, restore } = stubAudio();
    const audio = createAudio();
    audio.play('busbar');
    const t0 = Math.min(...voices.map((v) => v.start));
    const end = Math.max(...voices.map((v) => v.stop));

    // The contactor pulling in is the first thing, and it is a hit: something with
    // a body under it, not a tap. (The stair gate is the opposite case and is
    // measured the same way, two tests up.)
    expect(voices.some((v) => v.start - t0 < 0.01), 'nothing happens when the handle goes up').toBe(true);
    expect(
      voices.some((v) => v.start - t0 < 0.02 && v.stop - v.start >= 0.12),
      'the board takes seven hundred amps and it sounds like a pen click',
    ).toBe(true);

    /*
     * ...and then the board HUMS, which is the half of this that says a supply
     * arrived rather than something being hit. A transformer core hums at twice
     * the mains frequency — 100 Hz on a Belgian 50 Hz supply, not 50 — and it has
     * to hold long enough to be a room changing rather than a note.
     */
    expect(hasTone(voices, 100), 'the board does not hum at twice the 50 Hz mains').toBe(true);
    const hum = voices.filter((v) => v.freqs.some((f) => Math.abs(f - 100) <= 3));
    expect(Math.max(...hum.map((v) => v.stop - v.start)), 'the hum is a blip, not a room').toBeGreaterThan(1);

    // Nothing in it is a lamp or a chime: a supply arriving is a low sound, and
    // the hall is still black when it finishes.
    for (const f of pitches(voices)) {
      expect(f, 'something bright is in the supply cue — the hall does NOT light up here').toBeLessThan(700);
    }
    expect(end - t0, 'the board is still talking long after the handle went up').toBeLessThan(1.8);
    expect(loudest(voices), 'the supply cue clips').toBeLessThan(1);

    audio.dispose();
    restore();
  });

  /**
   * THE MODEM — Michele, 26 Sep 2026: *"A 56k like sound for the modem"*.
   *
   * It belongs to the router coming ONLINE, not to the breakers: the supply is
   * `busbar` above, and this is the thing on the end of the wire finally agreeing
   * with the thing at the other end. Synthesised like everything else in
   * `audio.ts` — no asset files, ever (CLAUDE.md) — which a 56k handshake makes
   * easy, because a handshake is literally tones and shaped noise.
   *
   * The frequencies are not decoration. A real V.8/V.21 exchange is:
   *
   *   - DTMF dialling, two tones at a time off the 697/770/852/941 rows and the
   *     1209/1336/1477 columns;
   *   - the answering modem's **2100 Hz** ANSam tone, the "beeeee" everybody can
   *     hum;
   *   - the two V.21 channels FSK-ing against each other — 980/1180 originate,
   *     1650/1850 answer — which is the "bee-doo bee-doo";
   *   - a scrambled training sequence, which is noise;
   *   - and the connected hiss.
   *
   * All of it inside the 300–3400 Hz telephone band, because that is the whole
   * reason a modem sounds like a modem: it is a sound built to survive a phone
   * line. That band is the assertion — a cue with the answer tone at 400 Hz would
   * be a beep, and this test is the only way anybody here can tell the difference.
   */
  it('handshakes like a 56k modem, inside the telephone band', () => {
    const { voices, restore } = stubAudio();
    const audio = createAudio();
    audio.play('modem');
    const t0 = Math.min(...voices.map((v) => v.start));
    const end = Math.max(...voices.map((v) => v.stop));

    // A real handshake is thirty seconds. Nobody wants thirty seconds of it in a
    // puzzle game, and a cue shorter than a second cannot get through the beats.
    expect(end - t0, 'the handshake is over before it is recognisable').toBeGreaterThan(1.5);
    expect(end - t0, 'a real handshake is thirty seconds; this is a game').toBeLessThan(2.3);

    // The carriers, where a 56k handshake's carriers are.
    expect(hasTone(voices, 2100), 'no 2100 Hz answer tone — the one everybody can hum').toBe(true);
    for (const f of [980, 1180]) {
      expect(hasTone(voices, f), `the originating V.21 channel is missing ${f} Hz`).toBe(true);
    }
    for (const f of [1650, 1850]) {
      expect(hasTone(voices, f), `the answering V.21 channel is missing ${f} Hz`).toBe(true);
    }
    // ...and it dials first: two tones at once off the DTMF grid.
    expect(
      [697, 770, 852, 941].filter((f) => hasTone(voices, f)).length,
      'nothing dials — no DTMF row tones',
    ).toBeGreaterThanOrEqual(2);
    expect(
      [1209, 1336, 1477, 1633].filter((f) => hasTone(voices, f)).length,
      'nothing dials — no DTMF column tones',
    ).toBeGreaterThanOrEqual(2);

    // The telephone band. Everything pitched lives in it, or it is not a modem.
    for (const f of pitches(voices)) {
      expect(f, 'a pitch outside the 300–3400 Hz telephone band').toBeGreaterThanOrEqual(300);
      expect(f, 'a pitch outside the 300–3400 Hz telephone band').toBeLessThanOrEqual(3400);
    }

    // The shape: dialling at the front, the carriers in the middle, the scrambled
    // training sequence as NOISE (it cannot be tones — that is what scrambling is),
    // and something still sounding at the end, which is the line going quiet.
    expect(voices.some((v) => v.start - t0 < 0.02), 'it does not start on the dial').toBe(true);
    const training = voices.filter((v) => v.kind === 'noise' && v.start - t0 > 0.9 && v.start - t0 < 1.6);
    expect(training.length, 'there is no scrambled training sequence, only tones').toBeGreaterThanOrEqual(2);
    expect(voices.some((v) => v.start - t0 > 1.5), 'the handshake never connects').toBe(true);

    expect(loudest(voices), 'the handshake clips').toBeLessThan(1);

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
