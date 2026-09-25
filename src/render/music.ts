/**
 * music.ts — the score of After Dark, written as data and played by oscillators.
 *
 * Michele asked for music. CLAUDE.md forbids external audio files, so there is no
 * track to load: there is a four-bar score per chapter, and a look-ahead scheduler
 * that turns it into notes on the same `AudioContext` the sound effects use.
 *
 * The split matters more than the synthesis. Everything above `startMusic()` is
 * pure data and pure functions — chords, patterns, `barNotes()` — so the score can
 * be asserted in a test that has no Web Audio at all: that every pitched note is
 * in the chapter's key, that the loudest bar stays inside its budget, that the
 * build-up parts arrive when they claim to. Everything below it is graph plumbing
 * and is judged by ear, which is Michele's job and nobody else's.
 *
 * Why a score at all, when the ambient beds in `audio.ts` already give each
 * chapter a room tone: a bed says *where* you are, and the game needed something
 * that says *how it is going*. Chapter 2's drums do not exist in the first two
 * bars and arrive with the third; chapter 1 has no drums at all, because at three
 * in the morning in a closed cinema nothing keeps time. The music is the only
 * thing in the build that is allowed to be a mood rather than a fact.
 *
 * Budget: at most a few dozen short voices a bar, each one disconnecting itself on
 * `ended`. The whole thing hangs off a single gain node, so muting it is one ramp
 * and disposing of it is one disconnect.
 */

/* ============================================================ the score ===== */

/**
 * The instruments. The first four are pitched and read the bar's chord; the last
 * four are drums, have no pitch, and exist only where a chapter wants a pulse.
 */
export type VoiceName = 'pad' | 'bell' | 'pluck' | 'bass' | 'kick' | 'hat' | 'shaker' | 'rim';

/** Which voices take a MIDI note. Everything else is a drum and carries `midi: -1`. */
export const PITCHED: ReadonlySet<VoiceName> = new Set<VoiceName>(['pad', 'bell', 'pluck', 'bass']);

/** Sixteenths in a bar. Four-four throughout: this is a puzzle game, not a prog record. */
export const STEPS = 16;

/** One note, resolved out of a part and a bar. Times are in steps, not seconds. */
export interface Note {
  readonly voice: VoiceName;
  /** 0..STEPS-1, the sixteenth it lands on. */
  readonly step: number;
  /** How many sixteenths it lasts. */
  readonly len: number;
  /** MIDI note number, or -1 for a drum. */
  readonly midi: number;
  /** Linear gain, before the music bus. */
  readonly gain: number;
}

/**
 * One instrument's pattern over a bar.
 *
 * `steps` is the whole part: one entry per sixteenth, `-1` for a rest. For a
 * pitched voice the number is an index into the bar's chord — past the end of the
 * chord it wraps and climbs an octave, which is how an arpeggio gets its reach
 * without the pattern having to know which chord it will be played over. For a
 * drum any value `>= 0` is a hit.
 */
export interface Part {
  readonly voice: VoiceName;
  readonly gain: number;
  readonly steps: readonly number[];
  readonly len: number;
  /** Semitones added after the chord lookup — an octave down for a bass line. */
  readonly shift?: number;
  /** Bar (counted from the start of the chapter, not modulo the loop) this part joins on. */
  readonly from?: number;
}

export interface Score {
  readonly bpm: number;
  /** Pitch class of the key's tonic, 0 = C. Only the tests read it. */
  readonly tonic: number;
  /** The pitch classes the score is allowed to use — its scale. */
  readonly scale: readonly number[];
  /** One chord per bar, low note first, as MIDI numbers. The loop is this long. */
  readonly chords: readonly (readonly number[])[];
  readonly parts: readonly Part[];
}

/** A natural minor scale from A, and a major scale from C — the only two in the game. */
const A_MINOR: readonly number[] = [9, 11, 0, 2, 4, 5, 7];
const C_MAJOR: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

/** Sixteen rests, the base every pattern is written over. */
const rests = (): number[] => new Array<number>(STEPS).fill(-1);

/** `on([0, 8], 2)` — a pattern that plays chord tone 2 on the downbeat and the "3". */
function on(hits: readonly number[], value: number): number[] {
  const p = rests();
  for (const h of hits) p[h % STEPS] = value;
  return p;
}

/** `seq([0, 2, 4, 2])` laid out every `every` sixteenths from `start`. */
function seq(values: readonly number[], every: number, start = 0): number[] {
  const p = rests();
  for (let i = 0; i < values.length; i++) {
    const s = start + i * every;
    if (s < STEPS) p[s] = values[i];
  }
  return p;
}

/**
 * Chapter 1 — the closed cinema section, three in the morning.
 *
 * A minor, 68 bpm, and no percussion anywhere: the one chapter with nothing
 * keeping time. A pad holds the chord, a bell drops four notes a bar and leaves
 * gaps you can hear the ventilation in, and the bass moves once. The progression
 * never resolves to a bright chord — it goes Am9, Fmaj7, Dm7, Esus — so the loop
 * comes round without ever sounding finished, which is the whole of chapter 1.
 */
const NIGHT: Score = {
  bpm: 68,
  tonic: 9,
  scale: A_MINOR,
  chords: [
    [45, 57, 60, 64, 71], // Am9
    [41, 57, 60, 65, 72], // Fmaj7
    [38, 57, 62, 65, 69], // Dm7
    [40, 59, 64, 67, 71], // Esus4
  ],
  parts: [
    { voice: 'pad', gain: 0.1, steps: on([0], 1), len: 15 },
    { voice: 'pad', gain: 0.085, steps: on([0], 3), len: 15 },
    { voice: 'bass', gain: 0.16, steps: on([0, 10], 0), len: 6, shift: -12 },
    { voice: 'bell', gain: 0.1, steps: seq([2, 4, 3, 5], 3, 2), len: 4 },
    { voice: 'bell', gain: 0.055, steps: on([14], 6), len: 2, from: 4 },
  ],
};

/**
 * Chapter 2 — the dark exhibition hall, bringing the power back.
 *
 * Same key as chapter 1, because it is the same night; everything else changes.
 * 100 bpm, a sixteenth bass pulse, and a progression that climbs (Am, C, F, G)
 * instead of circling. The drums are not in the first loop at all: `from: 2`
 * brings the kick in on the third bar and `from: 4` the hats, so the music comes
 * up the way the building does.
 */
const HALL: Score = {
  bpm: 100,
  tonic: 9,
  scale: A_MINOR,
  chords: [
    [45, 57, 60, 64], // Am
    [48, 55, 60, 64], // C
    [41, 57, 60, 65], // F
    [43, 59, 62, 67], // G
  ],
  parts: [
    { voice: 'pad', gain: 0.07, steps: on([0], 2), len: 15 },
    { voice: 'bass', gain: 0.15, steps: on([0, 3, 6, 8, 11, 14], 0), len: 2, shift: -12 },
    { voice: 'pluck', gain: 0.095, steps: seq([2, 3, 4, 3, 5, 4], 2, 2), len: 2 },
    { voice: 'pluck', gain: 0.06, steps: on([7, 15], 6), len: 2, from: 4 },
    { voice: 'kick', gain: 0.5, steps: on([0, 6, 10], 1), len: 1, from: 2 },
    { voice: 'hat', gain: 0.12, steps: on([2, 4, 6, 8, 10, 12, 14], 1), len: 1, from: 4 },
    { voice: 'rim', gain: 0.16, steps: on([4, 12], 1), len: 1, from: 6 },
  ],
};

/**
 * Chapter 3 — breakfast, three thousand people, a queue for tomato soup.
 *
 * The first daylight in the game, so the first major key: C, 112 bpm, a shaker
 * instead of hats and sevenths on everything so it swings rather than marches.
 * Cmaj7, Am7, Dm7, G7 is the most ordinary progression there is, which is the
 * point — this chapter is the one where nothing is broken yet.
 */
const BREAKFAST: Score = {
  bpm: 112,
  tonic: 0,
  scale: C_MAJOR,
  chords: [
    [36, 55, 60, 64, 71], // Cmaj7
    [45, 57, 60, 64, 67], // Am7
    [38, 57, 60, 62, 65], // Dm7
    [43, 59, 62, 65, 67], // G7
  ],
  parts: [
    { voice: 'pad', gain: 0.055, steps: on([0], 2), len: 15 },
    { voice: 'bass', gain: 0.14, steps: on([0, 6, 8, 14], 0), len: 3, shift: -12 },
    { voice: 'pluck', gain: 0.085, steps: seq([2, 4, 3, 5, 4, 6], 2, 0), len: 2 },
    { voice: 'bell', gain: 0.06, steps: on([11], 5), len: 3 },
    { voice: 'shaker', gain: 0.1, steps: on([0, 3, 4, 7, 8, 11, 12, 15], 1), len: 1 },
    { voice: 'kick', gain: 0.34, steps: on([0, 8], 1), len: 1, from: 1 },
    { voice: 'rim', gain: 0.14, steps: on([4, 12], 1), len: 1, from: 1 },
  ],
};

/**
 * Chapter 4 — room 8, five minutes before the keynote.
 *
 * C major and 84 bpm: slower than breakfast and much bigger. F, G, Am, C — the
 * one progression in the game that lands on its tonic, because this is the one
 * chapter that is allowed to arrive somewhere. A bell carries a melody over the
 * top instead of decorating, and the kick is on the downbeats only, which at this
 * tempo reads as a room settling rather than a beat.
 */
const KEYNOTE: Score = {
  bpm: 84,
  tonic: 0,
  scale: C_MAJOR,
  chords: [
    [41, 57, 60, 65, 72], // F
    [43, 59, 62, 67, 74], // G
    [45, 57, 60, 64, 72], // Am
    [36, 55, 60, 64, 72], // C
  ],
  parts: [
    { voice: 'pad', gain: 0.1, steps: on([0], 1), len: 15 },
    { voice: 'pad', gain: 0.075, steps: on([0], 4), len: 15 },
    { voice: 'bass', gain: 0.16, steps: on([0, 8], 0), len: 7, shift: -12 },
    { voice: 'bell', gain: 0.1, steps: seq([4, 3, 5, 4], 4, 0), len: 4 },
    { voice: 'pluck', gain: 0.05, steps: on([6, 14], 6), len: 2, from: 2 },
    { voice: 'kick', gain: 0.4, steps: on([0, 8], 1), len: 1, from: 2 },
    { voice: 'shaker', gain: 0.06, steps: on([2, 6, 10, 14], 1), len: 1, from: 4 },
  ],
};

/** The score for each chapter. Anything else — the title card, the outro — is silence. */
export const SCORES: Readonly<Record<number, Score>> = { 1: NIGHT, 2: HALL, 3: BREAKFAST, 4: KEYNOTE };

/** Seconds in one bar of `s`. Four beats, four sixteenths each. */
export const barSeconds = (s: Score): number => (60 / s.bpm) * 4;

/**
 * The chord tone at index `i`, climbing an octave every time it runs off the top.
 *
 * This is what lets one pattern sit over four different chords: `4` means "the
 * fifth note of whatever this bar is", and a chord with four notes in it answers
 * that an octave up rather than out of range.
 */
export function chordNote(chord: readonly number[], i: number): number {
  const n = chord.length;
  const wrap = ((i % n) + n) % n;
  return chord[wrap] + 12 * Math.floor(i / n);
}

/** Every note in bar `bar` of `score`, counted from the start of the chapter. */
export function barNotes(score: Score, bar: number): Note[] {
  const chord = score.chords[bar % score.chords.length];
  const out: Note[] = [];
  for (const p of score.parts) {
    if (p.from !== undefined && bar < p.from) continue;
    for (let step = 0; step < p.steps.length && step < STEPS; step++) {
      const v = p.steps[step];
      if (v < 0) continue;
      const midi = PITCHED.has(p.voice) ? chordNote(chord, v) + (p.shift ?? 0) : -1;
      out.push({ voice: p.voice, step, len: p.len, midi, gain: p.gain });
    }
  }
  return out;
}

/** MIDI to hertz, A4 = 440 = MIDI 69. */
export const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/* ============================================================ the player ==== */

/** How loud the whole score is under the master gain. Music sits below everything. */
export const MUSIC_GAIN = 0.34;
/** Crossfade when the chapter changes, seconds. */
const FADE = 1.4;
/**
 * How far ahead notes are scheduled, and how often the pump runs.
 *
 * The lookahead is long on purpose. A hidden tab has its timers clamped to about
 * one second, so a 0.2 s lookahead — which is what every Web Audio tutorial uses —
 * drops the beat the moment a judge tabs away to read the README and comes back.
 * Scheduling two bars' worth means the music survives the clamp; nothing is
 * scheduled that a fade cannot cover, because the fade rides the bus, not the notes.
 */
const LOOKAHEAD = 1.9;
const PUMP_MS = 300;

export interface Music {
  /** 1..4 for a chapter's score; anything else fades to silence. */
  setChapter(chapter: number): void;
  mute(on: boolean): void;
  dispose(): void;
}

/**
 * Start the music on an existing context.
 *
 * `out` is the caller's master gain, so the music goes through the same limiter as
 * everything else; `noise` is the shared buffer `audio.ts` already built, because
 * a second one would be a second megabyte for the same white noise.
 */
export function startMusic(ctx: AudioContext, out: AudioNode, noise: AudioBuffer | null): Music {
  /**
   * One score, playing, with its own fader.
   *
   * A chapter change cannot simply swap the score on a shared bus: notes are
   * scheduled up to `LOOKAHEAD` seconds ahead, so the old chapter still has most
   * of two bars booked when the new one starts, and they would collide in two
   * different keys. Giving each score its own gain node means the old one fades
   * out with everything it had already scheduled still attached to it — the same
   * trick `fadeOutBed()` plays in `audio.ts` — and the new one fades up beside it.
   */
  interface Deck {
    readonly gain: GainNode;
    readonly score: Score;
    /** Bars played since this deck started. Build-up parts (`from`) count from here. */
    bar: number;
    /** When the next unscheduled bar starts, in context time. */
    nextBar: number;
  }

  let deck: Deck | null = null;
  /** Decks on their way out, kept until their fade has finished. */
  const fading: GainNode[] = [];
  /** Where the voice builders connect. Set by `pump()` before it schedules anything. */
  let dest: GainNode | null = null;
  let chapter = 0;
  let muted = false;
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** Ramp a fader. Exponential, so a fade sounds like one; never to a true zero. */
  function ramp(g: GainNode, to: number, secs: number): void {
    const t = ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), t + secs);
    } catch {
      g.gain.value = to;
    }
  }

  function drop(g: GainNode): void {
    ramp(g, 0, FADE);
    fading.push(g);
    setTimeout(() => {
      const i = fading.indexOf(g);
      if (i >= 0) fading.splice(i, 1);
      try {
        g.disconnect();
      } catch {
        /* already gone */
      }
    }, (FADE + 0.4) * 1000);
  }

  /* ------------------------------------------------------------------ voices */

  /**
   * An envelope on its own gain node, returned ready to be connected.
   *
   * Attack is linear and release exponential, which is how a struck thing behaves
   * and — more usefully here — never rings after its slot: every voice is stopped
   * at `t + dur`, so a long release would be cut rather than heard.
   */
  function env(t: number, peak: number, attack: number, dur: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  /** Disconnect the little graph once the source has stopped. */
  function retire(src: AudioScheduledSourceNode, nodes: readonly AudioNode[]): void {
    src.onended = (): void => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already gone */
        }
      }
    };
  }

  function osc(type: OscillatorType, f: number, t: number, dur: number, detune = 0): OscillatorNode {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.start(t);
    o.stop(t + dur);
    return o;
  }

  /** Two detuned saws under a lowpass — the chord you hear without listening to it. */
  function pad(f: number, t: number, dur: number, gain: number): void {
    if (!dest) return;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.Q.value = 0.6;
    const g = env(t, gain, dur * 0.45, dur);
    lp.connect(g).connect(dest);
    const a = osc('sawtooth', f, t, dur, -7);
    const b = osc('sawtooth', f, t, dur, 7);
    a.connect(lp);
    b.connect(lp);
    retire(a, [a, b, lp, g]);
  }

  /**
   * A two-operator FM bell: a sine carrier whose frequency is wobbled by another
   * sine an octave up, with the wobble dying faster than the note does.
   *
   * That decaying index is the whole trick — a bell is bright for an instant and a
   * pure tone afterwards, and one gain envelope on the modulator gets you there
   * without a wavetable or a sample.
   */
  function bell(f: number, t: number, dur: number, gain: number): void {
    if (!dest) return;
    const carrier = osc('sine', f, t, dur);
    const mod = osc('sine', f * 2, t, dur);
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 2.4, t);
    index.gain.exponentialRampToValueAtTime(0.01, t + Math.min(dur, 0.5));
    mod.connect(index).connect(carrier.frequency);
    const g = env(t, gain, 0.004, dur);
    carrier.connect(g).connect(dest);
    retire(carrier, [carrier, mod, index, g]);
  }

  /** A triangle under a lowpass that closes as it decays: a string being let go of. */
  function pluck(f: number, t: number, dur: number, gain: number): void {
    if (!dest) return;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(7000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(180, f * 1.4), t + dur);
    lp.Q.value = 1.1;
    const g = env(t, gain, 0.003, dur);
    lp.connect(g).connect(dest);
    const o = osc('triangle', f, t, dur);
    o.connect(lp);
    retire(o, [o, lp, g]);
  }

  /** Sine for the weight, a quiet saw for the edge, both under a low filter. */
  function bass(f: number, t: number, dur: number, gain: number): void {
    if (!dest) return;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(320, t);
    const g = env(t, gain, 0.008, dur);
    lp.connect(g).connect(dest);
    const a = osc('sine', f, t, dur);
    const b = osc('sawtooth', f, t, dur, 4);
    const bg = ctx.createGain();
    bg.gain.value = 0.28;
    a.connect(lp);
    b.connect(bg).connect(lp);
    retire(a, [a, b, bg, lp, g]);
  }

  /** A sine dropped an octave and a half in 90 ms, which is every kick drum ever made. */
  function kick(t: number, gain: number): void {
    if (!dest) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    const g = env(t, gain, 0.002, 0.22);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.22);
    retire(o, [o, g]);
  }

  /** Filtered noise: `band` sets the colour, `dur` says hat (short) or shaker (longer). */
  function noiseHit(t: number, gain: number, band: number, q: number, dur: number): void {
    if (!noise || !dest) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(band, t);
    f.Q.value = q;
    const g = env(t, gain, 0.001, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur);
    retire(src, [src, f, g]);
  }

  /** A short pitched click with a noise edge — a rimshot, the backbeat's whole job. */
  function rim(t: number, gain: number): void {
    if (!dest) return;
    const o = osc('triangle', 380, t, 0.06);
    const g = env(t, gain, 0.001, 0.06);
    o.connect(g).connect(dest);
    retire(o, [o, g]);
    noiseHit(t, gain * 0.5, 2400, 1.4, 0.04);
  }

  function playNote(n: Note, t: number, stepSecs: number): void {
    const dur = Math.max(0.05, n.len * stepSecs);
    switch (n.voice) {
      case 'pad':
        pad(hz(n.midi), t, dur, n.gain);
        break;
      case 'bell':
        bell(hz(n.midi), t, dur, n.gain);
        break;
      case 'pluck':
        pluck(hz(n.midi), t, Math.min(dur, 0.55), n.gain);
        break;
      case 'bass':
        bass(hz(n.midi), t, dur, n.gain);
        break;
      case 'kick':
        kick(t, n.gain);
        break;
      case 'hat':
        noiseHit(t, n.gain, 7600, 2.2, 0.035);
        break;
      case 'shaker':
        noiseHit(t, n.gain, 5200, 0.9, 0.075);
        break;
      case 'rim':
        rim(t, n.gain);
        break;
      default:
        break;
    }
  }

  /* --------------------------------------------------------------- scheduler */

  /**
   * Schedule every bar that starts inside the lookahead window.
   *
   * It runs on a timer rather than the render loop on purpose: `requestAnimationFrame`
   * does not fire at all in a hidden tab, and the music would stop dead instead of
   * carrying on behind the page.
   */
  function pump(): void {
    if (disposed || !deck) return;
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;
    if (deck.nextBar < now) deck.nextBar = now + 0.05;
    const barLen = barSeconds(deck.score);
    const stepSecs = barLen / STEPS;
    dest = deck.gain;
    // The guard is for a context whose clock jumped (a laptop waking up): schedule
    // a couple of bars and let the next pump catch up, rather than a thousand.
    let guard = 0;
    while (deck.nextBar < now + LOOKAHEAD && guard++ < 8) {
      for (const n of barNotes(deck.score, deck.bar)) playNote(n, deck.nextBar + n.step * stepSecs, stepSecs);
      deck.bar++;
      deck.nextBar += barLen;
    }
    dest = null;
  }

  function setChapter(next: number): void {
    if (disposed || next === chapter) return;
    chapter = next;
    if (deck) {
      drop(deck.gain);
      deck = null;
    }
    const score = SCORES[next] ?? null;
    if (!score) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(out);
    // Start after the outgoing deck has mostly gone, so two keys never overlap.
    deck = { gain, score, bar: 0, nextBar: ctx.currentTime + FADE * 0.6 };
    ramp(gain, muted ? 0 : MUSIC_GAIN, FADE);
    pump();
  }

  /**
   * `N` in `main.ts`. The scheduler keeps running under a mute on purpose: the bar
   * clock stays where the game is, so turning the music back on drops you into the
   * chapter where it would have been rather than restarting its build-up.
   */
  function mute(on: boolean): void {
    muted = on;
    if (disposed || !deck) return;
    ramp(deck.gain, on ? 0 : MUSIC_GAIN, 0.25);
  }

  function dispose(): void {
    disposed = true;
    if (timer !== null) clearInterval(timer);
    timer = null;
    const all = [...fading, ...(deck ? [deck.gain] : [])];
    deck = null;
    fading.length = 0;
    for (const g of all) {
      try {
        g.disconnect();
      } catch {
        /* already gone */
      }
    }
  }

  timer = setInterval(pump, PUMP_MS);
  return { setChapter, mute, dispose };
}
