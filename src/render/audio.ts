/**
 * audio.ts — every sound in After Dark, synthesised in code.
 *
 * No asset files anywhere (CLAUDE.md): oscillators, one shared white-noise buffer,
 * biquad filters and gain envelopes, through a master gain and a limiter. That is
 * also what lets the three robots *sound* like their physics — Voxxy is a light
 * high tick, Droid a servo whirr with a soft thud, Biggy a sub-bass stomp with a
 * tail, so a player hears which robot is moving without looking at the switcher.
 *
 * Autoplay policy: the `AudioContext` is created on the first real user gesture
 * and never before, so a judge opening the build never sees an autoplay warning in
 * the console. Anything asked for before then is dropped, except the ambient bed,
 * which is remembered and started once the context exists.
 *
 * Budget: a handful of voices at a time (`MAX_VOICES`), one shared noise buffer,
 * one ambient graph. Sources are single-use by spec, so they are created per shot
 * and disconnect themselves on `ended`; everything longer-lived is reused.
 */

import type { RobotKind } from '../sim/types';

export type SoundId =
  /** A job done: clue found, breaker flipped, banner hooked, cable plugged in. */
  | 'chime'
  /** "No" — a robot refusing, a wrong code, an impossible reach. */
  | 'nope'
  /** A door taking a hit that does not break it. `intensity` = how hard. */
  | 'door'
  /** A door that does break: the jammed cinema door, the store's roller door. */
  | 'crash'
  /**
   * A door that opens because it was asked nicely: chapter 1's fire door.
   *
   * The counterpart to `crash`, and deliberately its opposite in shape. `crash` is
   * an impact with debris falling away from it; this starts with the hard snap of
   * a magnetic lock letting go, opens into a long slow breath of air round a heavy
   * leaf, and lands on the leaf meeting its stop about a second later — which is
   * `FIRE_SWING_TIME` in `ch1-night.ts`, because the sim owns that clock.
   */
  | 'door-open'
  /**
   * The store's roller shutter, torn upward by Biggy and jammed in its housing.
   *
   * Not a door opening and not quite a `crash` either: `ROLLER_DOOR_SPEED` is
   * above Biggy's own top speed on purpose, so this only ever happens at the end
   * of a towed run-up. The shape is the hit, then sheet steel hammering up through
   * its guides — five bursts accelerating, one per slat, as `ROLLER_RISE_TIME`
   * runs out in `ch2-expo.ts` — and a dead inharmonic clang as the curtain jams.
   * Nobody is shutting it again, and it should not sound as if they could.
   */
  | 'shutter'
  /**
   * Cinema B's magnetic lock letting go, and one light auditorium door swinging.
   *
   * The counterpart to `door-open`, a size down. The fire door is a night-sealed
   * pair of leaves on a hold-open magnet and takes a second to arrive; this is one
   * door on an electric strike, released from a projector panel at the other end of
   * the room. So: the strike's own buzz-and-clack, the leaf coming off its keeper
   * quickly and lightly, and a soft rubber seal at the stop — `LOCK_SWING_TIME` in
   * `ch1-night.ts`, because the sim owns that clock.
   */
  | 'maglock'
  /**
   * Biggy walking the router cabinet's steel doors open on hinges seized since 2019.
   *
   * Nothing here is a door being let go of. It is a low shoulder-shove, then the
   * long dry scrape of two hinges that do not want to move — the only cue in the
   * game whose middle is louder than its ends — and it finishes on the leaves
   * knocking against their stops one after the other, because there are two of
   * them. `CABINET_SWING_TIME` in `ch2-expo.ts` is the clock.
   */
  | 'cabinet'
  /**
   * The registration gate at the foot of the main staircase, opened for the day.
   *
   * The only door in the game that opens because somebody decided it was time, and
   * it has to sound like that: a hook coming off its eye, a light tubular barrier
   * swinging on one post with the hollow ring a steel tube has, and the clack of it
   * being pinned back against the wall. Nothing gives way and nothing is forced.
   * Under it, the hall: this fires with three thousand people already inside.
   * `GATE_SWING_TIME` in `ch3-breakfast.ts`.
   */
  | 'gate'
  /**
   * Biggy's party trick: he rocks his whole gut a turn and a half.
   *
   * Three apexes (`flairPhase` ~0.17 / 0.5 / 0.83 in `src/sim/bot.ts`), each a low
   * hollow wooden knock, over a sub-bass groan that is the mass of him changing
   * its mind. The cue carries all three itself — the sim owns the clock, and
   * `main.ts` fires this once when the flourish starts.
   */
  | 'roll'
  /**
   * Droid's party trick: both long arms overhead, held, and down.
   *
   * A slow servo whine rising over the first third, a small dry click at the top
   * where the shoulders reach their stop (`flairPhase` ~0.45), and a sigh of air
   * on the settle. The same servo voice as `mount`, stretched — it is the same
   * robot.
   */
  | 'stretch'
  /** One keypad digit. `semitones` gives each digit its own pitch. */
  | 'keypad'
  /** UI tick: switching robot, selecting something. */
  | 'switch'
  /** A light-mix enigma resolving — a digit appears out of the dark. */
  | 'clue'
  /** A breaker lever thrown in the technical room. */
  | 'breaker'
  /**
   * The exhibition hall's switchboard taking load: the last of the three breakers.
   *
   * Michele, 26 Sep 2026: *"the braker activation seems to do nothing, apart from
   * the message."* The design says why the hall does NOT come up here — a supply
   * is not a lit room, and the lighting circuit's contactor stays open until the
   * router authorises it (`ch2-expo.ts`) — so this cue has one job: make a supply
   * arriving feel like something without lighting anything. The contactor pulling
   * in, a relay dropping somewhere over your head, and then the board settling
   * into a hum at 100 Hz, which is twice the Belgian 50 Hz mains and what a
   * transformer core actually does. Nothing in it is bright.
   */
  | 'busbar'
  /**
   * The router negotiating with the world: a 56k handshake, and Michele asked for
   * it by name — *"A 56k like sound for the modem"*.
   *
   * Synthesised like everything else here, which a handshake makes easy because a
   * handshake is tones and shaped noise and nothing else. The beats, in order:
   * DTMF dialling the venue's ancient fallback line, the answering modem's 2100 Hz
   * ANSam tone, the two V.21 channels FSK-ing against each other (980/1180 one
   * way, 1650/1850 the other — the "bee-doo bee-doo"), the scrambled training
   * sequence, and the drop into the connected hiss. Everything inside the
   * 300–3400 Hz telephone band, which is the whole reason a modem sounds like a
   * modem. Two seconds; a real one is thirty and nobody wants that in a puzzle
   * game. `tests/audio-cues.test.ts` asserts the carriers, because nobody in this
   * environment can hear it.
   */
  | 'modem'
  /** Droid climbing onto Biggy: servos, then weight settling. */
  | 'mount'
  /** Chapter transition swell, under the fade to black. */
  | 'transition'
  /** Applause. `intensity` sizes the crowd. */
  | 'applause'
  /** The keynote is saved. */
  | 'victory';

export interface PlayOpts {
  /** Loudness multiplier, default 1. */
  gain?: number;
  /** How hard / how big, 0..1. Doors, crashes and applause use it. */
  intensity?: number;
  /** Pitch offset in semitones — keypad digits, pitched variation. */
  semitones?: number;
  /** Seconds to wait before the sound starts. */
  delay?: number;
}

export interface Audio {
  play(id: SoundId, opts?: PlayOpts): void;
  /** 1..4 for the chapter beds, 0 (or anything else) for silence. */
  setAmbient(chapter: number): void;
  /** One planted foot. `intensity` 0..1 scales with the robot's speed. */
  footstep(kind: RobotKind, intensity?: number): void;
  mute(on: boolean): void;
  dispose(): void;
}

/** Headroom under the limiter; the mix is deliberately quiet under the HUD. */
const MASTER_GAIN = 0.55;
/**
 * Hard cap on simultaneous one-shot voices. Extra requests are dropped, not queued.
 *
 * It was 14, and 14 was a cap on how many things SOUND at once — which is not what
 * it counts. A voice is taken when it is created and given back when it stops, and
 * a cue schedules its whole timeline up front, so a two-second cue holds a slot per
 * voice for two seconds whether or not any of them is sounding yet. `victory`
 * already books eleven of the fourteen for two and a half seconds; land a Biggy
 * footstep (three voices) on top of it and the fifteenth request went silently in
 * the bin. `modem` books sixteen for two seconds and would have been truncated
 * halfway through its own handshake.
 *
 * Twenty-four is still a cap and still cheap — these are sine and sawtooth
 * oscillators and one shared noise buffer — and it leaves the whole of the longest
 * cue plus three robots' footsteps inside the budget.
 */
const MAX_VOICES = 24;
/** Ambient crossfade, seconds. Long enough to feel like a room change, not a cut. */
const BED_FADE = 1.2;
/** Minimum spacing between footsteps of the same robot, seconds. */
const STEP_MIN_GAP = 0.045;

type FilterSpec = { type: BiquadFilterType; f: number; f1?: number; q?: number };

interface Bed {
  chapter: number;
  gain: GainNode;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type ActivatedNavigator = Navigator & { userActivation?: { hasBeenActive?: boolean } };

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const semis = (f: number, s: number | undefined): number => (s ? f * Math.pow(2, s / 12) : f);

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let bed: Bed | null = null;
  /** An ambient asked for before the first gesture, replayed once we have a context. */
  let pendingChapter: number | null = null;
  let muted = false;
  let disposed = false;
  let unlocked = false;
  let voices = 0;
  const lastStep: Record<RobotKind, number> = { voxxy: -1, droid: -1, biggy: -1 };

  const GESTURES: ReadonlyArray<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];

  function onGesture(): void {
    unlocked = true;
    detachGestures();
    ensure();
  }

  function detachGestures(): void {
    if (typeof window === 'undefined') return;
    for (const g of GESTURES) window.removeEventListener(g, onGesture);
  }

  if (typeof window !== 'undefined') {
    for (const g of GESTURES) window.addEventListener(g, onGesture, { passive: true });
    // If the page has already been interacted with (the host built us inside a click
    // handler), we are allowed to start straight away.
    if (typeof navigator !== 'undefined' && (navigator as ActivatedNavigator).userActivation?.hasBeenActive) {
      unlocked = true;
    }
  }

  /** The context, or null while we are still waiting for a gesture. Never throws. */
  function ensure(): AudioContext | null {
    if (disposed || !unlocked || typeof window === 'undefined') return null;
    if (ctx) {
      // Browsers suspend the context when the tab is hidden, and Safari suspends it
      // again after a while; resuming is a no-op when it is already running.
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      return ctx;
    }
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    const c = ctx;
    master = c.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    // A limiter keeps a stomp landing on top of a fanfare from clipping.
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 14;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    master.connect(limiter).connect(c.destination);

    // One noise buffer, shared by every noise voice for the whole session.
    const secs = 2;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * secs), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuf = buf;

    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    if (pendingChapter !== null) {
      const ch = pendingChapter;
      pendingChapter = null;
      setAmbient(ch);
    }
    return c;
  }

  /* ------------------------------------------------------------- voice budget */

  function take(n: number): boolean {
    if (voices + n > MAX_VOICES) return false;
    voices += n;
    return true;
  }

  /** Frees the voice and tears the little graph down when the source stops. */
  function retire(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    src.onended = (): void => {
      voices = Math.max(0, voices - 1);
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already gone */
        }
      }
    };
  }

  function filterOf(c: AudioContext, spec: FilterSpec, t0: number, dur: number): BiquadFilterNode {
    const f = c.createBiquadFilter();
    f.type = spec.type;
    f.frequency.setValueAtTime(Math.max(20, spec.f), t0);
    if (spec.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f1), t0 + dur);
    if (spec.q !== undefined) f.Q.value = spec.q;
    return f;
  }

  /** An attack/decay envelope. Exponential decay, because ears are logarithmic. */
  function envelope(c: AudioContext, t0: number, peak: number, attack: number, dur: number): GainNode {
    const g = c.createGain();
    const p = Math.max(0.0001, peak);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, dur));
    return g;
  }

  interface ToneOpts {
    type: OscillatorType;
    f0: number;
    f1?: number;
    t0: number;
    dur: number;
    peak: number;
    attack?: number;
    filter?: FilterSpec;
    detune?: number;
    /**
     * Frequencies this one voice SWITCHES to, seconds after `t0` — not a glide.
     *
     * Written for `modem`, and it is the difference between a modem and a siren:
     * a V.21 channel is one continuous carrier being keyed between a mark and a
     * space tone, so the pitch changes instantly and the voice never stops. Done
     * as one short tone per segment it would be eight voices, eight attacks and
     * eight decays — a row of beeps. Done here it is one voice that steps, which
     * is both what the hardware does and a quarter of the budget.
     *
     * Ignored by every other cue, and not to be combined with `f1`: a ramp and a
     * step would be two things scheduling the same parameter.
     */
    steps?: ReadonlyArray<{ t: number; f: number }>;
  }

  /** One pitched voice: oscillator -> (filter) -> envelope -> master. */
  function tone(o: ToneOpts): void {
    const c = ensure();
    if (!c || !master || !take(1)) return;
    const osc = c.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(Math.max(10, o.f0), o.t0);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), o.t0 + o.dur);
    if (o.steps) for (const s of o.steps) osc.frequency.setValueAtTime(Math.max(10, s.f), o.t0 + s.t);
    if (o.detune) osc.detune.value = o.detune;
    const env = envelope(c, o.t0, o.peak, o.attack ?? 0.006, o.dur);
    const nodes: AudioNode[] = [osc, env];
    let head: AudioNode = osc;
    if (o.filter) {
      const f = filterOf(c, o.filter, o.t0, o.dur);
      nodes.push(f);
      head.connect(f);
      head = f;
    }
    head.connect(env).connect(master);
    osc.start(o.t0);
    osc.stop(o.t0 + o.dur + 0.05);
    retire(osc, nodes);
  }

  interface NoiseOpts {
    t0: number;
    dur: number;
    peak: number;
    attack?: number;
    filter: FilterSpec;
    /** Playback rate, > 1 brightens the noise, < 1 darkens it. */
    rate?: number;
  }

  /** One noise voice: shared buffer -> filter -> envelope -> master. */
  function noise(o: NoiseOpts): void {
    const c = ensure();
    if (!c || !master || !noiseBuf || !take(1)) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    // Start somewhere random in the buffer so repeated bursts are not identical.
    const offset = Math.random() * (noiseBuf.duration - 0.2);
    if (o.rate) src.playbackRate.value = o.rate;
    const f = filterOf(c, o.filter, o.t0, o.dur);
    const env = envelope(c, o.t0, o.peak, o.attack ?? 0.004, o.dur);
    src.connect(f).connect(env).connect(master);
    src.start(o.t0, offset);
    src.stop(o.t0 + o.dur + 0.05);
    retire(src, [src, f, env]);
  }

  /* ----------------------------------------------------------------- one-shots */

  function playAt(id: SoundId, t0: number, g: number, inten: number, semi: number | undefined): void {
    switch (id) {
      case 'chime': {
        // A small major arpeggio — the sound of something fixed.
        const notes = [880, 1320, 1760];
        for (let i = 0; i < notes.length; i++) {
          tone({
            type: 'triangle',
            f0: semis(notes[i], semi),
            t0: t0 + i * 0.07,
            dur: 0.5 - i * 0.06,
            peak: 0.11 * g,
            attack: 0.004,
            filter: { type: 'lowpass', f: 4200 },
          });
        }
        break;
      }
      case 'nope': {
        // Two short dead buzzes: a robot saying no, not an error beep.
        for (let i = 0; i < 2; i++) {
          tone({
            type: 'square',
            f0: semis(152, semi),
            f1: semis(118, semi),
            t0: t0 + i * 0.16,
            dur: 0.12,
            peak: 0.1 * g,
            attack: 0.005,
            filter: { type: 'lowpass', f: 760, q: 1.2 },
          });
        }
        break;
      }
      case 'door': {
        const i = clamp(inten, 0.15, 1);
        tone({ type: 'sine', f0: 124, f1: 38, t0, dur: 0.34, peak: 0.3 * g * i, attack: 0.003 });
        noise({ t0, dur: 0.26, peak: 0.16 * g * i, filter: { type: 'lowpass', f: 340, q: 0.9 } });
        if (i > 0.5) {
          // Sheet metal still ringing after the hit.
          tone({
            type: 'triangle',
            f0: 312,
            f1: 296,
            t0: t0 + 0.02,
            dur: 0.5,
            peak: 0.05 * g * i,
            filter: { type: 'bandpass', f: 900, q: 8 },
          });
        }
        break;
      }
      case 'crash': {
        // The door gives way: impact, then hardware and debris.
        playAt('door', t0, g, 1, undefined);
        noise({ t0: t0 + 0.02, dur: 0.5, peak: 0.09 * g, attack: 0.006, filter: { type: 'bandpass', f: 1900, q: 0.9 } });
        noise({ t0: t0 + 0.08, dur: 0.9, peak: 0.055 * g, attack: 0.02, filter: { type: 'lowpass', f: 900, f1: 260 } });
        break;
      }
      case 'door-open': {
        // 1. The magnetic lock releases: a dry contact snap over a short thud. It
        //    has to be the first thing you hear, because it is the thing the four
        //    digits actually did.
        noise({ t0, dur: 0.045, peak: 0.2 * g, attack: 0.002, filter: { type: 'highpass', f: 2400 } });
        tone({ type: 'sine', f0: 150, f1: 72, t0: t0 + 0.004, dur: 0.15, peak: 0.19 * g, attack: 0.002 });
        // 2. The leaf swings. Air round a heavy door is a band that opens and
        //    falls as the gap widens, so the filter sweeps down while the envelope
        //    takes a fifth of a second to come up — nothing about this is a hit.
        noise({
          t0: t0 + 0.06,
          dur: 0.86,
          peak: 0.08 * g,
          attack: 0.24,
          filter: { type: 'bandpass', f: 940, f1: 250, q: 1.3 },
        });
        // 3. The hinge, under it: a thin metallic glide, kept quiet and narrow so
        //    it reads as a pin turning in a barrel rather than as a note.
        tone({
          type: 'sawtooth',
          f0: 436,
          f1: 268,
          t0: t0 + 0.1,
          dur: 0.72,
          peak: 0.026 * g,
          attack: 0.2,
          filter: { type: 'bandpass', f: 1500, q: 9 },
        });
        // 4. The leaf reaching its stop, a second in: the full swing has a *shape*,
        //    and a door that only opens never sounds as if it arrived anywhere.
        tone({ type: 'sine', f0: 98, f1: 50, t0: t0 + 0.92, dur: 0.3, peak: 0.12 * g, attack: 0.003 });
        noise({ t0: t0 + 0.92, dur: 0.17, peak: 0.055 * g, filter: { type: 'lowpass', f: 720, q: 0.9 } });
        break;
      }
      case 'shutter': {
        // 1. The hit. Biggy is seven hundred kilos at 5.7 m/s and the curtain is
        //    2 mm of steel: a short dead thud with no ring in it at all.
        tone({ type: 'sine', f0: 104, f1: 34, t0, dur: 0.3, peak: 0.32 * g, attack: 0.002 });
        noise({ t0, dur: 0.2, peak: 0.19 * g, attack: 0.002, filter: { type: 'lowpass', f: 420, q: 0.8 } });
        // 2. The run-up: the slats going through their guides, five bursts over
        //    `ROLLER_RISE_TIME` (0.42 s), tightening and brightening as the curtain
        //    picks up speed. This is the part that says "up", not "open".
        const rungs = 5;
        for (let k = 0; k < rungs; k++) {
          const u = k / (rungs - 1);
          noise({
            t0: t0 + 0.03 + 0.34 * (1 - (1 - u) ** 2.2),
            dur: 0.05,
            peak: (0.13 - 0.05 * u) * g,
            attack: 0.002,
            filter: { type: 'bandpass', f: 1700 + 1500 * u, q: 3.2 },
          });
        }
        // 3. It jams. Two inharmonic partials, detuned against each other so the
        //    clang has no note in it, and a last rattle falling away.
        tone({
          type: 'triangle',
          f0: 393,
          f1: 366,
          t0: t0 + 0.42,
          dur: 0.6,
          peak: 0.075 * g,
          attack: 0.003,
          filter: { type: 'bandpass', f: 1250, q: 7 },
        });
        tone({
          type: 'triangle',
          f0: 571,
          f1: 524,
          t0: t0 + 0.425,
          dur: 0.42,
          peak: 0.045 * g,
          attack: 0.003,
          filter: { type: 'bandpass', f: 2300, q: 9 },
        });
        noise({ t0: t0 + 0.44, dur: 0.7, peak: 0.05 * g, attack: 0.015, filter: { type: 'lowpass', f: 1400, f1: 300 } });
        break;
      }
      case 'maglock': {
        // 1. The electric strike: a short mains-frequency buzz, then the keeper
        //    letting go. The buzz is what says *electric* rather than *mechanical*
        //    — it is the projector panel doing this, from across the room.
        tone({
          type: 'square',
          f0: 100,
          t0,
          dur: 0.09,
          peak: 0.05 * g,
          attack: 0.004,
          filter: { type: 'bandpass', f: 520, q: 4 },
        });
        noise({ t0: t0 + 0.085, dur: 0.035, peak: 0.16 * g, attack: 0.001, filter: { type: 'highpass', f: 2800 } });
        // 2. The leaf, lighter and quicker than the fire door's: a narrower band
        //    of air, sweeping down over `LOCK_SWING_TIME` rather than over a second.
        noise({
          t0: t0 + 0.1,
          dur: 0.6,
          peak: 0.055 * g,
          attack: 0.16,
          filter: { type: 'bandpass', f: 1150, f1: 380, q: 1.6 },
        });
        // 3. The stop: a rubber seal, not a latch. Soft, and it is what tells the
        //    player the door has finished rather than merely started.
        tone({ type: 'sine', f0: 132, f1: 74, t0: t0 + 0.64, dur: 0.22, peak: 0.085 * g, attack: 0.006 });
        noise({ t0: t0 + 0.64, dur: 0.14, peak: 0.035 * g, attack: 0.01, filter: { type: 'lowpass', f: 520, q: 0.8 } });
        break;
      }
      case 'cabinet': {
        // 1. Seven hundred kilos of Biggy putting a shoulder into sheet steel. A
        //    shove, not a hit: it moves, so there is no ring on it.
        tone({ type: 'sine', f0: 88, f1: 44, t0, dur: 0.24, peak: 0.2 * g, attack: 0.02 });
        // 2. The hinges. Two of them, detuned against each other, grinding all the
        //    way round — the middle of this cue is the loudest part of it, which is
        //    what makes it a door being FORCED rather than a door swinging.
        for (let k = 0; k < 2; k++) {
          tone({
            type: 'sawtooth',
            f0: 214 + k * 37,
            f1: 158 + k * 29,
            t0: t0 + 0.08 + k * 0.04,
            dur: 0.92,
            peak: (0.05 - k * 0.014) * g,
            attack: 0.3,
            filter: { type: 'bandpass', f: 1750 + k * 520, q: 11 },
          });
        }
        noise({
          t0: t0 + 0.1,
          dur: 0.9,
          peak: 0.05 * g,
          attack: 0.35,
          filter: { type: 'bandpass', f: 720, f1: 1500, q: 1.1 },
        });
        // 3. Two stops, one per leaf, a breath apart — it is a pair of doors and it
        //    should not arrive as one object. The second is the quieter of the two.
        for (let k = 0; k < 2; k++) {
          const at = t0 + 1.06 + k * 0.11;
          tone({ type: 'triangle', f0: 268 - k * 22, f1: 206, t0: at, dur: 0.26, peak: (0.06 - k * 0.02) * g, attack: 0.002, filter: { type: 'bandpass', f: 900, q: 6 } });
          noise({ t0: at, dur: 0.16, peak: (0.055 - k * 0.018) * g, attack: 0.002, filter: { type: 'lowpass', f: 900, q: 0.9 } });
        }
        break;
      }
      case 'gate': {
        // 1. The hook coming off its eye. Two small bright metal taps, a hand's
        //    width apart — Stephan unhooking a barrier, and nothing heavier.
        for (let k = 0; k < 2; k++) {
          noise({
            t0: t0 + k * 0.075,
            dur: 0.04,
            peak: (0.1 - k * 0.03) * g,
            attack: 0.001,
            filter: { type: 'bandpass', f: 3400 - k * 600, q: 6 },
          });
        }
        // 2. The barrier swinging on its post: a hollow tubular ring that falls as
        //    it goes round, over `GATE_SWING_TIME`, with the bearing turning under
        //    it. Long, unhurried, and the opposite of everything `crash` is.
        tone({
          type: 'triangle',
          f0: 246,
          f1: 196,
          t0: t0 + 0.14,
          dur: 1.25,
          peak: 0.045 * g,
          attack: 0.4,
          filter: { type: 'bandpass', f: 1400, q: 5 },
        });
        tone({
          type: 'sine',
          f0: 61,
          f1: 52,
          t0: t0 + 0.14,
          dur: 1.3,
          peak: 0.07 * g,
          attack: 0.45,
        });
        noise({
          t0: t0 + 0.2,
          dur: 1.1,
          peak: 0.03 * g,
          attack: 0.5,
          filter: { type: 'bandpass', f: 640, f1: 300, q: 1.4 },
        });
        // 3. Pinned back against the wall at the end of the swing: one clack, and
        //    a short tubular ring off it. The stairs are open.
        noise({ t0: t0 + 1.46, dur: 0.06, peak: 0.13 * g, attack: 0.001, filter: { type: 'bandpass', f: 2100, q: 3 } });
        tone({ type: 'triangle', f0: 328, f1: 296, t0: t0 + 1.47, dur: 0.44, peak: 0.05 * g, attack: 0.003, filter: { type: 'bandpass', f: 1250, q: 8 } });
        break;
      }
      case 'roll': {
        /*
         * Biggy rocking: the groan of the mass under three wooden knocks.
         *
         * The apexes are where the shell meets the floor on each side, so they are
         * knocks and not hits — a hollow drum with a body, dropping in pitch as the
         * roll loses energy, the way his own footstep does.
         */
        tone({ type: 'sine', f0: 46, f1: 62, t0, dur: 1.1, peak: 0.12 * g, attack: 0.22 });
        const knocks = [0.17, 0.5, 0.83];
        for (let k = 0; k < knocks.length; k++) {
          const at = t0 + knocks[k] * 1.05;
          tone({
            type: 'triangle',
            f0: 132 - k * 14,
            f1: 78 - k * 8,
            t0: at,
            dur: 0.17,
            peak: (0.15 - k * 0.025) * g,
            attack: 0.003,
            filter: { type: 'lowpass', f: 620, q: 3.4 },
          });
          noise({
            t0: at,
            dur: 0.07,
            peak: (0.05 - k * 0.012) * g,
            attack: 0.002,
            filter: { type: 'bandpass', f: 380, q: 1.6 },
          });
        }
        break;
      }
      case 'stretch': {
        /*
         * Droid stretching: `mount`'s servo, taken slowly and let down again.
         *
         * The whine rises over the first third and holds at the top rather than
         * sliding through it — a robot reaching the end of its travel and staying
         * there is the whole joke — then a dry click as the shoulders hit their
         * stop, and air out of the actuators on the way down.
         */
        tone({
          type: 'sawtooth',
          f0: 108,
          f1: 296,
          t0,
          dur: 0.62,
          peak: 0.05 * g,
          attack: 0.16,
          filter: { type: 'bandpass', f: 820, q: 6 },
        });
        tone({
          type: 'sawtooth',
          f0: 296,
          f1: 288,
          t0: t0 + 0.62,
          dur: 0.34,
          peak: 0.032 * g,
          attack: 0.02,
          filter: { type: 'bandpass', f: 980, q: 7 },
        });
        // The stop, at the top of the reach.
        noise({ t0: t0 + 0.64, dur: 0.03, peak: 0.1 * g, attack: 0.001, filter: { type: 'highpass', f: 3000 } });
        // And the settle: air, then his own weight coming back down on his feet.
        noise({ t0: t0 + 0.98, dur: 0.5, peak: 0.055 * g, attack: 0.09, filter: { type: 'bandpass', f: 1500, f1: 520, q: 0.9 } });
        tone({ type: 'sine', f0: 86, f1: 54, t0: t0 + 1.22, dur: 0.26, peak: 0.1 * g, attack: 0.006 });
        break;
      }
      case 'keypad': {
        tone({
          type: 'square',
          f0: semis(660, semi),
          t0,
          dur: 0.075,
          peak: 0.075 * g,
          attack: 0.002,
          filter: { type: 'lowpass', f: 2300, q: 0.7 },
        });
        break;
      }
      case 'switch': {
        tone({ type: 'sine', f0: semis(520, semi), f1: semis(790, semi), t0, dur: 0.07, peak: 0.06 * g });
        break;
      }
      case 'clue': {
        // Two bright partials plus a breath of air: a digit surfacing out of the dark.
        tone({ type: 'sine', f0: 1318, t0, dur: 0.6, peak: 0.075 * g, attack: 0.01 });
        tone({ type: 'sine', f0: 1975, t0: t0 + 0.06, dur: 0.5, peak: 0.05 * g, attack: 0.01 });
        noise({ t0, dur: 0.35, peak: 0.03 * g, attack: 0.06, filter: { type: 'bandpass', f: 5200, q: 0.8 } });
        break;
      }
      case 'breaker': {
        noise({ t0, dur: 0.035, peak: 0.22 * g, filter: { type: 'highpass', f: 2600 } });
        tone({ type: 'sine', f0: 92, f1: 44, t0: t0 + 0.005, dur: 0.24, peak: 0.24 * g, attack: 0.002 });
        break;
      }
      case 'busbar': {
        /*
         * THE BOARD TAKES LOAD — and the hall stays black, which is the hard part.
         *
         * Everything in here is low. Nothing rings, nothing chimes, nothing
         * brightens: the one thing this cue must not sound like is a room coming
         * on, because the room does not come on (`ch2-expo.ts`, and
         * `tests/ch2-chain.test.ts` guards it). What a switchboard does when the
         * last handle goes up is pull a contactor in, drop a relay somewhere over
         * your head, and then HUM, and the hum is the part that says a supply
         * arrived rather than something got hit.
         */
        // 1. The contactor pulling in. A hard clack with a body under it — this is
        //    a lump of copper being slammed onto a busbar, not a switch clicking.
        noise({ t0, dur: 0.04, peak: 0.16 * g, attack: 0.001, filter: { type: 'highpass', f: 2400 } });
        tone({ type: 'sine', f0: 78, f1: 36, t0: t0 + 0.004, dur: 0.22, peak: 0.26 * g, attack: 0.002 });
        // 2. The board settles into a hum. 100 Hz, because a transformer core hums
        //    at TWICE the mains and Kinepolis is on a 50 Hz supply — with the
        //    second and third harmonics over it, which is what makes it a core and
        //    not a test tone. Slow attack: it arrives over a third of a second,
        //    the way a big machine does.
        tone({ type: 'sine', f0: 100, t0: t0 + 0.05, dur: 1.25, peak: 0.11 * g, attack: 0.38 });
        tone({
          type: 'triangle',
          f0: 200,
          t0: t0 + 0.08,
          dur: 1.15,
          peak: 0.035 * g,
          attack: 0.45,
          filter: { type: 'lowpass', f: 700 },
        });
        tone({ type: 'sine', f0: 300, t0: t0 + 0.1, dur: 1.05, peak: 0.022 * g, attack: 0.5 });
        // 3. A relay dropping somewhere over your head — the chapter's own line.
        //    Brighter and much quieter than the contactor: it is twenty metres
        //    away and up, so it has a transient and no weight at all.
        noise({ t0: t0 + 0.14, dur: 0.035, peak: 0.07 * g, attack: 0.001, filter: { type: 'bandpass', f: 1800, q: 4 } });
        tone({ type: 'sine', f0: 120, f1: 70, t0: t0 + 0.145, dur: 0.1, peak: 0.06 * g, attack: 0.002 });
        // 4. ...and the cabinet's fan, spinning up behind a shut steel door. The
        //    band opens as it gets to speed. This is the noise Michele's own
        //    design promised the player and never made.
        noise({
          t0: t0 + 0.22,
          dur: 1.1,
          peak: 0.05 * g,
          attack: 0.55,
          filter: { type: 'bandpass', f: 260, f1: 900, q: 1 },
        });
        break;
      }
      case 'modem': {
        /*
         * A 56k HANDSHAKE, IN TWO SECONDS. Michele asked for the sound by name.
         *
         * Recognisable beats precise (CLAUDE.md), and the two agree here: the
         * things that make a handshake recognisable are the actual frequencies of
         * the actual protocol, so the shortcut and the honest version are the same
         * sound. What is compressed is only TIME — a real V.90 train is thirty
         * seconds of this.
         *
         * The fiction: it is 2019 hardware in a cabinet nobody has opened since,
         * and the venue's uplink falls back over a line that was old when the
         * cinema was built. The joke and the physics are the same joke.
         */
        // 1. Dialling. Three DTMF digits, each two tones at once off the standard
         //   697/770/941 rows and 1209/1336/1477 columns. Nothing else in the cue
         //   is as instantly placeable as this.
        const dial: ReadonlyArray<readonly [number, number]> = [
          [697, 1209],
          [770, 1336],
          [941, 1477],
        ];
        for (let k = 0; k < dial.length; k++) {
          for (const f of dial[k]) {
            tone({
              type: 'sine',
              f0: f,
              t0: t0 + k * 0.1,
              dur: 0.07,
              peak: 0.045 * g,
              attack: 0.004,
              filter: { type: 'lowpass', f: 3400 },
            });
          }
        }
        // 2. The answer tone: 2100 Hz ANSam, the "beeeee". A second oscillator
        //    three hertz off it beats slowly against the first, which is what the
        //    real thing's phase reversals sound like from a speaker on a desk.
        tone({ type: 'sine', f0: 2100, t0: t0 + 0.36, dur: 0.34, peak: 0.075 * g, attack: 0.012 });
        tone({ type: 'sine', f0: 2103, t0: t0 + 0.37, dur: 0.32, peak: 0.05 * g, attack: 0.012 });
        // 3. The two V.21 channels, keyed against each other — the "bee-doo
        //    bee-doo". One continuous carrier per channel, stepping between its
        //    mark and its space tone (see `ToneOpts.steps`), because that is what
        //    FSK is: eight separate beeps would be a siren.
        const KEYED = 0.05;
        const fsk = (mark: number, space: number, phase: number): ReadonlyArray<{ t: number; f: number }> =>
          Array.from({ length: 8 }, (_, k) => ({ t: k * KEYED, f: (k + phase) % 2 === 0 ? mark : space }));
        tone({
          type: 'sine',
          f0: 980,
          steps: fsk(980, 1180, 0),
          t0: t0 + 0.72,
          dur: 0.4,
          peak: 0.05 * g,
          attack: 0.01,
          filter: { type: 'lowpass', f: 3400 },
        });
        tone({
          type: 'sine',
          f0: 1850,
          steps: fsk(1650, 1850, 1),
          t0: t0 + 0.72,
          dur: 0.4,
          peak: 0.05 * g,
          attack: 0.01,
          filter: { type: 'lowpass', f: 3400 },
        });
        // 4. The scrambled training sequence — the "pshhhkkkkkrrr". It CANNOT be
        //    tones: scrambling is what makes data look like noise, and a modem
        //    training is two modems sending each other noise on purpose. Three
        //    bands: one sweeping up through the voice band, one narrow and hard
        //    over it, and a low growl under both.
        noise({
          t0: t0 + 1.1,
          dur: 0.5,
          peak: 0.08 * g,
          attack: 0.03,
          filter: { type: 'bandpass', f: 800, f1: 2900, q: 0.9 },
        });
        noise({
          t0: t0 + 1.16,
          dur: 0.38,
          peak: 0.055 * g,
          attack: 0.02,
          rate: 1.6,
          filter: { type: 'bandpass', f: 1750, q: 5 },
        });
        noise({ t0: t0 + 1.1, dur: 0.42, peak: 0.04 * g, attack: 0.04, filter: { type: 'bandpass', f: 420, q: 1.2 } });
        // 5. Carrier lock, and the line going quiet. Two quick pips a fourth
        //    apart — still inside the telephone band, because everything is — over
        //    a hiss that thins out and dies. A cue needs an arrival, and this is
        //    a handshake's: the noise stops.
        tone({ type: 'sine', f0: 1760, t0: t0 + 1.62, dur: 0.09, peak: 0.05 * g, attack: 0.005 });
        tone({ type: 'sine', f0: 2349, t0: t0 + 1.71, dur: 0.11, peak: 0.045 * g, attack: 0.005 });
        noise({
          t0: t0 + 1.6,
          dur: 0.36,
          peak: 0.03 * g,
          attack: 0.05,
          filter: { type: 'bandpass', f: 2400, f1: 1100, q: 0.6 },
        });
        break;
      }
      case 'mount': {
        // Servos winding up, then Droid's weight settling on Biggy's shoulders.
        tone({
          type: 'sawtooth',
          f0: 120,
          f1: 380,
          t0,
          dur: 0.55,
          peak: 0.055 * g,
          attack: 0.05,
          filter: { type: 'bandpass', f: 900, q: 6 },
        });
        tone({ type: 'sine', f0: 74, f1: 48, t0: t0 + 0.5, dur: 0.25, peak: 0.14 * g, attack: 0.004 });
        break;
      }
      case 'transition': {
        // A filter sweep rising under the fade, landing on a soft low hit.
        noise({ t0, dur: 1.15, peak: 0.11 * g, attack: 0.85, filter: { type: 'lowpass', f: 220, f1: 3200, q: 1.1 } });
        tone({ type: 'sine', f0: 58, f1: 42, t0, dur: 1.3, peak: 0.13 * g, attack: 0.7 });
        tone({ type: 'sine', f0: 70, f1: 40, t0: t0 + 1.12, dur: 0.6, peak: 0.16 * g, attack: 0.004 });
        break;
      }
      case 'applause': {
        const i = clamp(inten, 0.2, 1);
        noise({ t0, dur: 1.8 * i + 0.6, peak: 0.12 * g * i, attack: 0.22, filter: { type: 'bandpass', f: 1400, q: 0.6 } });
        // A few individual pairs of hands on top of the wash.
        const claps = 4;
        for (let k = 0; k < claps; k++) {
          noise({
            t0: t0 + 0.08 + Math.random() * 0.9,
            dur: 0.05,
            peak: 0.05 * g * i,
            filter: { type: 'highpass', f: 2000 },
          });
        }
        break;
      }
      case 'victory': {
        // Four notes up to the octave, a held chord, then the room applauds.
        const fan = [523.25, 659.25, 783.99, 1046.5];
        for (let k = 0; k < fan.length; k++) {
          tone({
            type: 'triangle',
            f0: fan[k],
            t0: t0 + k * 0.14,
            dur: 0.5,
            peak: 0.12 * g,
            attack: 0.006,
            filter: { type: 'lowpass', f: 5000 },
          });
        }
        tone({ type: 'sine', f0: 130.8, t0: t0 + 0.42, dur: 1.7, peak: 0.08 * g, attack: 0.05 });
        tone({ type: 'sine', f0: 196, t0: t0 + 0.42, dur: 1.5, peak: 0.06 * g, attack: 0.05 });
        playAt('applause', t0 + 0.85, g, 1, undefined);
        break;
      }
      default:
        break;
    }
  }

  function play(id: SoundId, opts?: PlayOpts): void {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + Math.max(0, opts?.delay ?? 0) + 0.005;
    playAt(id, t0, clamp(opts?.gain ?? 1, 0, 2), clamp(opts?.intensity ?? 0.7, 0, 1), opts?.semitones);
  }

  /* ---------------------------------------------------------------- footsteps */

  function footstep(kind: RobotKind, intensity = 0.6): void {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + 0.005;
    if (t0 - lastStep[kind] < STEP_MIN_GAP) return;
    lastStep[kind] = t0;
    const i = clamp(intensity, 0.15, 1);
    switch (kind) {
      case 'voxxy':
        // Light and quick: a plastic tick, barely any body to it.
        noise({ t0, dur: 0.035, peak: 0.055 * i, filter: { type: 'highpass', f: 2300 } });
        tone({ type: 'sine', f0: 1150, f1: 760, t0, dur: 0.045, peak: 0.03 * i });
        break;
      case 'droid':
        // A servo turning over, then a flat foot put down deliberately.
        tone({
          type: 'sawtooth',
          f0: 150,
          f1: 265,
          t0,
          dur: 0.13,
          peak: 0.035 * i,
          attack: 0.02,
          filter: { type: 'bandpass', f: 820, q: 6 },
        });
        tone({ type: 'sine', f0: 96, f1: 58, t0: t0 + 0.07, dur: 0.2, peak: 0.1 * i, attack: 0.004 });
        break;
      case 'biggy':
        // Sub-bass stomp with a tail: seven times the mass, and you hear it.
        tone({ type: 'sine', f0: 86, f1: 30, t0, dur: 0.36, peak: 0.22 * i, attack: 0.003 });
        noise({ t0, dur: 0.12, peak: 0.1 * i, filter: { type: 'lowpass', f: 280, q: 0.8 } });
        noise({ t0: t0 + 0.04, dur: 0.55, peak: 0.045 * i, attack: 0.03, filter: { type: 'lowpass', f: 150 } });
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ ambient */

  function buildBed(c: AudioContext, out: GainNode, chapter: number): Bed {
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.connect(out);
    const b: Bed = { chapter, gain: g, nodes: [g], sources: [] };

    const drone = (type: OscillatorType, f: number, amp: number, detune = 0): void => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const og = c.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start();
      b.sources.push(o);
      b.nodes.push(og);
    };

    const bandNoise = (spec: FilterSpec, amp: number, lfoHz?: number, lfoDepth?: number): void => {
      if (!noiseBuf) return;
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = spec.type;
      f.frequency.value = spec.f;
      if (spec.q !== undefined) f.Q.value = spec.q;
      const ng = c.createGain();
      ng.gain.value = amp;
      src.connect(f).connect(ng).connect(g);
      src.start(0, Math.random() * 1.5);
      b.sources.push(src);
      b.nodes.push(f, ng);
      if (lfoHz && lfoDepth) {
        // Slow swell, so a crowd breathes instead of hissing flat.
        const lfo = c.createOscillator();
        lfo.frequency.value = lfoHz;
        const depth = c.createGain();
        depth.gain.value = lfoDepth;
        lfo.connect(depth).connect(ng.gain);
        lfo.start();
        b.sources.push(lfo);
        b.nodes.push(depth);
      }
    };

    switch (chapter) {
      case 1:
        // Night in the closed cinema section: a ventilation hum you only notice
        // when everything else stops.
        drone('sine', 52, 0.05);
        drone('sine', 78, 0.018, 6);
        bandNoise({ type: 'lowpass', f: 190, q: 0.7 }, 0.05, 0.07, 0.02);
        break;
      case 2:
        // The dark exhibition hall: a big empty room with the power off.
        drone('sine', 41, 0.05);
        drone('sine', 61.5, 0.03, -7);
        bandNoise({ type: 'bandpass', f: 130, q: 0.6 }, 0.04, 0.05, 0.015);
        break;
      case 3:
        // Breakfast: three thousand people and a queue for tomato soup.
        bandNoise({ type: 'bandpass', f: 480, q: 0.8 }, 0.09, 0.17, 0.035);
        bandNoise({ type: 'bandpass', f: 1250, q: 1.1 }, 0.03, 0.23, 0.012);
        drone('sine', 96, 0.015);
        break;
      case 4:
        // Room 8 before the keynote: warm, full, expectant.
        drone('sine', 98, 0.028);
        bandNoise({ type: 'lowpass', f: 420, q: 0.7 }, 0.045, 0.09, 0.012);
        bandNoise({ type: 'bandpass', f: 620, q: 0.9 }, 0.035, 0.13, 0.015);
        break;
      default:
        break;
    }
    return b;
  }

  function fadeOutBed(c: AudioContext, b: Bed, fade: number): void {
    const t = c.currentTime;
    try {
      b.gain.gain.cancelScheduledValues(t);
      b.gain.gain.setValueAtTime(Math.max(0.0001, b.gain.gain.value), t);
      b.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    } catch {
      /* a context that is closing */
    }
    const tearDown = (): void => {
      for (const n of b.nodes) {
        try {
          n.disconnect();
        } catch {
          /* already gone */
        }
      }
    };
    const last = b.sources[b.sources.length - 1];
    for (const s of b.sources) {
      try {
        s.stop(t + fade + 0.05);
      } catch {
        /* already stopped */
      }
    }
    if (last) last.onended = tearDown;
    else tearDown();
  }

  function setAmbient(chapter: number): void {
    if (disposed) return;
    const c = ensure();
    if (!c || !master) {
      // No context yet: remember it and start the bed at the first gesture.
      pendingChapter = chapter;
      return;
    }
    if (bed && bed.chapter === chapter) return;
    if (bed) {
      fadeOutBed(c, bed, BED_FADE);
      bed = null;
    }
    if (chapter < 1 || chapter > 4) return;
    const next = buildBed(c, master, chapter);
    const t = c.currentTime;
    next.gain.gain.setValueAtTime(0.0001, t);
    next.gain.gain.exponentialRampToValueAtTime(1, t + BED_FADE);
    bed = next;
    /*
     * CHAPTER 2 NO LONGER OPENS ON A BREAKER.
     *
     * This used to fire `breaker` half a second into the bed, on the grounds that
     * *"the hall's power coming back is the sound of chapter 2 starting"* — which
     * was harmless while nothing else in the game ever played that cue, and is
     * exactly wrong now that it has a job. `breaker` means ONE HANDLE WENT UP, and
     * the chapter opens with all three of them down: a player who hears it on the
     * title card has been told something that is not true, and has heard the
     * feedback for Droid's job before doing it. The chapter's own opening sound is
     * `transition` from `main.ts`, over the dark hall's bed.
     */
  }

  /* ---------------------------------------------------------------- transport */

  function mute(on: boolean): void {
    muted = on;
    if (!master || !ctx) return;
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(on ? 0 : MASTER_GAIN, t + 0.08);
    } catch {
      master.gain.value = on ? 0 : MASTER_GAIN;
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    detachGestures();
    const c = ctx;
    if (c) {
      if (bed) fadeOutBed(c, bed, 0.05);
      bed = null;
      try {
        master?.disconnect();
      } catch {
        /* already gone */
      }
      void c.close().catch(() => undefined);
    }
    ctx = null;
    master = null;
    noiseBuf = null;
    voices = 0;
  }

  return { play, setAmbient, footstep, mute, dispose };
}
