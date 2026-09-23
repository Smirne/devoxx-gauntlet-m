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
  /** One keypad digit. `semitones` gives each digit its own pitch. */
  | 'keypad'
  /** UI tick: switching robot, selecting something. */
  | 'switch'
  /** A light-mix enigma resolving — a digit appears out of the dark. */
  | 'clue'
  /** A breaker lever thrown in the technical room. */
  | 'breaker'
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
/** Hard cap on simultaneous one-shot voices. Extra requests are dropped, not queued. */
const MAX_VOICES = 14;
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
  }

  /** One pitched voice: oscillator -> (filter) -> envelope -> master. */
  function tone(o: ToneOpts): void {
    const c = ensure();
    if (!c || !master || !take(1)) return;
    const osc = c.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(Math.max(10, o.f0), o.t0);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), o.t0 + o.dur);
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
    // The hall's power coming back is the sound of chapter 2 starting.
    if (chapter === 2) play('breaker', { delay: 0.45, gain: 0.8 });
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
