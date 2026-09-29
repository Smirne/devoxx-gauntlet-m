/**
 * music.ts — the score of After Dark, written as data and played by oscillators.
 *
 * Michele asked for music. CLAUDE.md forbids external audio files, so there is no
 * track to load: there is a four-bar score per chapter, and a look-ahead scheduler
 * that turns it into notes on the same `AudioContext` the sound effects use.
 *
 * ONE EXCEPTION, and it is his: the opening plays a real track, "Heroic Motif"
 * by Ronny Shamano, AI-generated and given to the game (29 Sep 2026: *"this is
 * good. open MR"*). It is cut to the crates and inlined into the bundle, so the
 * published page stays one file — see `OPENING_TRACK` below. The synthesised
 * opening score stays as the fallback wherever the track cannot be decoded.
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

import { FLICKER_TIME, LEAD, PANEL_DELAY, PANEL_EACH, SLOT, STRIKES, WALK_AT } from '../sim/opening';

import OPENING_TRACK_URL from './opening-track.mp3?inline';

/* ============================================================ the score ===== */

/**
 * The instruments. The pitched ones take a MIDI note — from the bar's chord, or
 * written out when a part is `absolute`; the rest are drums and effects, have no
 * pitch, and exist only where a score wants a pulse or a sweep.
 */
export type VoiceName =
  | 'pad'
  | 'bell'
  | 'pluck'
  | 'bass'
  | 'guitar'
  | 'chug'
  | 'lead'
  | 'tom'
  | 'dive'
  | 'kick'
  | 'thump'
  | 'hat'
  | 'openhat'
  | 'shaker'
  | 'rim'
  | 'snare'
  | 'clap'
  | 'crash'
  | 'riser'
  | 'swell';

/** Which voices take a MIDI note. Everything else is a drum and carries `midi: -1`. */
export const PITCHED: ReadonlySet<VoiceName> = new Set<VoiceName>(['pad', 'bell', 'pluck', 'bass', 'guitar', 'chug', 'lead', 'tom', 'dive']);

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
  /** Linear gain, before the music bus: the part's gain times the step's `vel`. */
  readonly gain: number;
  /** Which of the score's parts it came from, by index. */
  readonly part: number;
  readonly pan?: number;
  readonly wet?: number;
  readonly late?: number;
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
  /** Bar it leaves on, counted the same way. A part without one plays to the end. */
  readonly until?: number;
  /**
   * `steps` holds MIDI notes rather than chord tones: a riff or a melody that
   * changes chord inside the bar, which a chord per bar cannot say.
   */
  readonly absolute?: boolean;
  /** Per-step lengths in sixteenths, where one differs from `len` (`-1` keeps `len`). */
  readonly lens?: readonly number[];
  /** Per-step loudness, times `gain`: accents, ghost notes, a roll that builds. */
  readonly vel?: readonly number[];
  /** Stereo position, -1 left .. 1 right. */
  readonly pan?: number;
  /** Its share of the score's room (`Score.space`), 0..1. */
  readonly wet?: number;
  /** Seconds late: the second guitar of a double-tracked pair is never quite on the first. */
  readonly late?: number;
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
  /**
   * Seconds from the cue to bar 0, when the score has to land on a clock of the
   * scene's (the opening's first robot). Otherwise it starts after the crossfade.
   */
  readonly lead?: number;
  /** How many bars it lasts, for a score that plays once and stops instead of looping. */
  readonly bars?: number;
  /** Seconds of reverb tail: a room, generated, for the parts that send to it. */
  readonly space?: number;
  /**
   * Silences, in seconds from the cue: the whole score cuts out and comes back,
   * as if its power went. The opening's are the emergency light's own strikes.
   */
  readonly gates?: ReadonlyArray<readonly [number, number]>;
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
 * A riff or a melody, one `[step, midi, sixteenths, vel?]` per note, laid out as
 * the arrays a part is made of. For `absolute` parts.
 */
function line(notes: ReadonlyArray<readonly [number, number, number, number?]>): { steps: number[]; lens: number[]; vel: number[] } {
  const steps = rests();
  const lens = rests();
  const vel = new Array<number>(STEPS).fill(1);
  for (const [s, midi, len, v] of notes) {
    steps[s] = midi;
    lens[s] = len;
    vel[s] = v ?? 1;
  }
  return { steps, lens, vel };
}

/**
 * Hits with their own loudness, `[step, vel]` each: accents, ghost notes, a roll
 * that builds. `value` is what each step holds — any hit for a drum, the chord
 * tone for a pitched part.
 */
function hits(list: ReadonlyArray<readonly [number, number]>, value = 1): { steps: number[]; vel: number[] } {
  const steps = rests();
  const vel = new Array<number>(STEPS).fill(1);
  for (const [s, v] of list) {
    steps[s] = value;
    vel[s] = v;
  }
  return { steps, vel };
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

/* ------------------------------------------------------ the opening's clock
 *
 * Every number the opening's score is placed by comes out of `src/sim/opening.ts`,
 * so the band and the picture cannot drift apart: move a crate's beat and the bar
 * lines move with it. `tests/music.test.ts` asserts the landings.
 */
/** Bar 0 starts one bar before Voxxy's crate lands, so every crate lands on a downbeat. */
export const OPEN_LEAD = LEAD + PANEL_DELAY + PANEL_EACH - SLOT;
/** The opening's bars, by who is on screen. Bar 0 is the title. */
const VOXXY = 1;
const DROID = 2;
const BIGGY = 3;
/** The bar the walk starts on and the emergency light starts to go: the one after Biggy's. */
export const WALK_BAR = Math.round((WALK_AT - OPEN_LEAD) / SLOT);
/** The sixteenth of that bar on which the light dies, and the band's power with it. */
export const DEATH_STEP = Math.round(
  (WALK_AT + STRIKES[STRIKES.length - 1][0] * FLICKER_TIME - OPEN_LEAD - WALK_BAR * SLOT) / (SLOT / STEPS),
);

/** G mixolydian: G major with an F natural, the flat seventh a rock riff leans on. */
const G_MIXOLYDIAN: readonly number[] = [7, 9, 11, 0, 2, 4, 5];
/** Power-chord roots, G2 and F2 — where a guitar's low string plays them. */
const G2 = 43;
const F2 = 41;

/** One guitar part twice, left and right, the right one a hair late: a double-tracked wall. */
function doubled(p: Part): Part[] {
  return [
    { ...p, pan: -0.8 },
    { ...p, pan: 0.8, late: 0.013 },
  ];
}

/**
 * The opening — three crates, three robots, and the drop.
 *
 * Michele asked for impact twice ("rock guitar, stomping, energy!"), and on 28 Sep
 * handed over what he meant: the last minute of the track under the Devoxx
 * Belgium 2026 ticket trailer, *"the part from 2.30, vocal excluded"*. That file is
 * not in this repo and cannot be (no audio assets, and it is not ours to put under
 * MIT), so this is the same kind of music written from scratch, from what an
 * analysis of the file measured: 96 bpm in four; G mixolydian, a G major with an F
 * natural, the riff leaning on the flat seventh (G, F, G); a sub bass on low G; a
 * wall of distorted guitars; the snare on 2 and 4 over a pushed kick; and the shape
 * of that minute — a bar of driving kick, a bar where the kick drops out under a
 * sixteenth-note snare roll, then everything on one downbeat. No note of its
 * melody is used: the hook here is ours.
 *
 * One bar per robot (`SLOT` is a bar), and the crates are the downbeats:
 *
 *  - TITLE: a boom under the title card, the room swelling, toms into...
 *  - VOXXY: her crate. The groove arrives light and quick: sixteenth hats, chugs.
 *  - DROID: his crate, on F. Driving kick, then the kick drops out, the snare
 *    rolls and a riser climbs.
 *  - BIGGY: his crate is the drop. The guitars open up, the sub, the hook.
 *  - WALK: home on G as the emergency light starts to go, and the band goes with
 *    it: `gates` are the light's own strikes, so the music cuts out exactly when
 *    the tube does, and on the strike it does not come back from the band loses
 *    its power, a tape-stop dive. Then the room, dark, and chapter 1's night.
 *
 * The crate booms stay cues (`crate` in `audio.ts`), fired by the panels landing,
 * and the score leaves its kick off those three downbeats: the crate is the kick.
 */
const OPENING: Score = {
  bpm: 240 / SLOT,
  lead: OPEN_LEAD,
  tonic: 7,
  scale: G_MIXOLYDIAN,
  chords: [
    [43, 50, 55, 59, 62], // G
    [43, 50, 55, 59, 62], // G
    [41, 48, 53, 57, 60], // F
    [43, 50, 55, 59, 62], // G
    [43, 50, 55, 59, 62], // G
  ],
  bars: WALK_BAR + 1,
  space: 2.2,
  gates: STRIKES.slice(0, -1).map(([a, b]) => [WALK_AT + a * FLICKER_TIME, WALK_AT + b * FLICKER_TIME] as const),
  parts: [
    // TITLE. A boom under the card, the room coming up, and a fill into the first crate.
    { voice: 'thump', gain: 0.34, steps: on([0], 1), len: 1, until: VOXXY, wet: 0.6 },
    { voice: 'bass', gain: 0.14, steps: on([0], 0), len: STEPS, shift: -12, until: VOXXY },
    { voice: 'swell', gain: 0.13, steps: on([0], 1), len: STEPS, until: VOXXY },
    { voice: 'pad', gain: 0.06, steps: on([0], 2), len: STEPS, until: VOXXY, pan: -0.5, wet: 0.5 },
    { voice: 'pad', gain: 0.06, steps: on([0], 4), len: STEPS, until: VOXXY, pan: 0.5, wet: 0.5 },
    { voice: 'tom', gain: 0.26, absolute: true, ...line([[12, 50, 1, 0.75], [13, 50, 1, 0.85], [14, 47, 1, 0.92], [15, 43, 1, 1]]), len: 1, until: VOXXY, wet: 0.3 },

    // A crash on every crate. The walk's downbeat has its own, below.
    { voice: 'crash', gain: 0.09, steps: on([0], 1), len: 1, from: VOXXY, until: WALK_BAR, wet: 0.3 },

    // VOXXY, small and swift: sixteenth hats, palm-muted eighths, the kick off the one.
    { voice: 'thump', gain: 0.42, steps: on([2, 8, 10], 1), len: 1, from: VOXXY, until: DROID },
    { voice: 'snare', gain: 0.28, steps: on([4, 12], 1), len: 1, from: VOXXY, until: DROID, wet: 0.25 },
    {
      voice: 'hat',
      gain: 0.07,
      ...hits([[0, 1], [1, 0.45], [2, 0.7], [3, 0.45], [4, 1], [5, 0.45], [6, 0.7], [7, 0.45], [8, 1], [9, 0.45], [10, 0.7], [11, 0.45], [12, 1], [13, 0.45], [14, 0.7], [15, 0.6]]),
      len: 1,
      from: VOXXY,
      until: DROID,
    },
    ...doubled({ voice: 'guitar', gain: 0.1, steps: on([0], 0), len: 4, from: VOXXY, until: DROID }),
    ...doubled({ voice: 'chug', gain: 0.17, ...hits([[4, 1], [6, 0.8], [8, 1], [10, 0.8], [12, 1], [14, 0.85]], 0), len: 1, from: VOXXY, until: DROID }),
    { voice: 'bass', gain: 0.22, steps: on([0, 2, 4, 6, 8, 10, 12, 14], 0), len: 2, shift: -12, from: VOXXY, until: DROID },

    // DROID, on F: eighth kicks, then the kick drops out under a snare roll and a riser.
    { voice: 'thump', gain: 0.44, steps: on([2, 6, 7], 1), len: 1, from: DROID, until: BIGGY },
    { voice: 'snare', gain: 0.28, steps: on([4], 1), len: 1, from: DROID, until: BIGGY, wet: 0.25 },
    { voice: 'snare', gain: 0.3, ...hits([[8, 0.45], [9, 0.5], [10, 0.56], [11, 0.63], [12, 0.71], [13, 0.8], [14, 0.9], [15, 1]]), len: 1, from: DROID, until: BIGGY, wet: 0.2 },
    { voice: 'hat', gain: 0.055, steps: on([0, 2, 4, 6], 1), len: 1, from: DROID, until: BIGGY },
    { voice: 'riser', gain: 0.16, steps: on([4], 1), len: 12, from: DROID, until: BIGGY },
    { voice: 'swell', gain: 0.1, steps: on([8], 1), len: 8, from: DROID, until: BIGGY },
    ...doubled({ voice: 'guitar', gain: 0.1, steps: on([0], 0), len: 14, from: DROID, until: BIGGY }),
    ...doubled({ voice: 'chug', gain: 0.13, ...hits([[8, 0.6], [9, 0.65], [10, 0.7], [11, 0.76], [12, 0.84], [13, 0.92]], 0), len: 1, from: DROID, until: BIGGY }),
    { voice: 'bass', gain: 0.22, ...hits([[0, 1], [2, 1], [4, 1], [6, 1], [8, 0.75], [9, 0.8], [10, 0.85], [11, 0.9], [12, 0.95], [13, 1]], 0), len: 1, shift: -12, from: DROID, until: BIGGY },

    // BIGGY, the drop. His crate is the downbeat; everything else lands with it.
    { voice: 'thump', gain: 0.46, steps: on([2, 8, 10, 15], 1), len: 1, from: BIGGY, until: WALK_BAR },
    { voice: 'snare', gain: 0.28, ...hits([[4, 1], [7, 0.28], [12, 1], [14, 0.32]]), len: 1, from: BIGGY, until: WALK_BAR, wet: 0.3 },
    { voice: 'openhat', gain: 0.06, ...hits([[0, 1], [2, 0.6], [4, 0.9], [6, 0.6], [8, 1], [10, 0.6], [12, 0.9], [14, 0.6]]), len: 1, from: BIGGY, until: WALK_BAR },
    ...doubled({ voice: 'guitar', gain: 0.13, absolute: true, ...line([[0, G2, 6], [6, G2, 2], [8, G2, 4], [12, G2, 2], [14, F2, 2]]), len: 2, from: BIGGY, until: WALK_BAR }),
    { voice: 'bass', gain: 0.26, absolute: true, ...line([[0, 31, 2], [2, 31, 2], [4, 31, 2], [6, 31, 2], [8, 31, 2], [10, 31, 2], [12, 31, 2], [14, 29, 2]]), len: 2, from: BIGGY, until: WALK_BAR },
    // The hook, doubled an octave down: rising to the sixth, falling back, and the
    // flat seventh as the push into the walk's G.
    { voice: 'lead', gain: 0.075, absolute: true, ...line([[0, 74, 3], [3, 71, 1], [4, 74, 2], [6, 76, 2], [8, 74, 3], [11, 71, 1], [12, 69, 2], [14, 77, 2]]), len: 2, from: BIGGY, until: WALK_BAR, wet: 0.35 },
    { voice: 'lead', gain: 0.035, absolute: true, ...line([[0, 62, 3], [3, 59, 1], [4, 62, 2], [6, 64, 2], [8, 62, 3], [11, 59, 1], [12, 57, 2], [14, 65, 2]]), len: 2, from: BIGGY, until: WALK_BAR, pan: 0.25, wet: 0.35 },
    { voice: 'pad', gain: 0.03, steps: on([0], 3), len: 14, from: BIGGY, until: WALK_BAR, pan: -0.5, wet: 0.5 },
    { voice: 'pad', gain: 0.03, steps: on([0], 4), len: 14, from: BIGGY, until: WALK_BAR, pan: 0.5, wet: 0.5 },

    // WALK. Home on G; the gates chop it with the tube, and at DEATH_STEP the power goes.
    { voice: 'thump', gain: 0.46, steps: on([0, 2], 1), len: 1, from: WALK_BAR },
    { voice: 'crash', gain: 0.12, steps: on([0], 1), len: 1, from: WALK_BAR, wet: 0.45 },
    { voice: 'snare', gain: 0.28, steps: on([4], 1), len: 1, from: WALK_BAR, wet: 0.3 },
    { voice: 'openhat', gain: 0.06, steps: on([0, 2, 4], 1), len: 1, from: WALK_BAR },
    ...doubled({ voice: 'guitar', gain: 0.13, absolute: true, ...line([[0, G2, DEATH_STEP]]), len: DEATH_STEP, from: WALK_BAR }),
    { voice: 'bass', gain: 0.26, absolute: true, ...line([[0, 31, 2], [2, 31, 2], [4, 31, 2]]), len: 2, from: WALK_BAR },
    { voice: 'lead', gain: 0.075, absolute: true, ...line([[0, 79, DEATH_STEP]]), len: DEATH_STEP, from: WALK_BAR, wet: 0.35 },
    { voice: 'lead', gain: 0.035, absolute: true, ...line([[0, 67, DEATH_STEP]]), len: DEATH_STEP, from: WALK_BAR, pan: 0.25, wet: 0.35 },
    { voice: 'dive', gain: 0.22, absolute: true, ...line([[DEATH_STEP, G2, 6]]), len: 6, from: WALK_BAR, wet: 0.3 },
  ],
};

/* ------------------------------------------------------ the opening's track
 *
 * "Heroic Motif", Ronny Shamano — a 24 s AI-generated track, cut to the opening
 * rather than the opening re-timed to it (it runs at 150 bpm, the crates at 96):
 *
 *  - it starts on its own build, under the title;
 *  - its full band comes in on Voxxy's crate, which is the one landing it is
 *    placed by (`OPENING_TRACK_BAND`);
 *  - 12.78 s of its middle are cut out at the join after Biggy's crate — exactly
 *    eight bars, the lag at which the track repeats itself most closely, so the
 *    join does not jump — and it plays its own last bars;
 *  - its last chord is time-stretched into a held tone and faded over 3 s, into
 *    the dark: the file stops at full level, and Michele's word for that was
 *    *"a bit abrupt"*.
 *
 * All of that is baked into `opening-track.mp3`; this file only knows when it
 * starts and how loud it is.
 */
/** Seconds into the file where the full band comes in. */
export const OPENING_TRACK_BAND = 2.2;
/** Seconds from the opening's cue to the file's first sample: the band lands with Voxxy's crate. */
export const OPENING_TRACK_AT = LEAD + PANEL_DELAY + PANEL_EACH - OPENING_TRACK_BAND;
/**
 * The file's level under `MUSIC_GAIN`, so it sits where the synth score did —
 * matched by rendering both through the game's own graph (tools/render-audio).
 */
const OPENING_TRACK_GAIN = 1.8;
/** The track, as a data URL: inlined, so `tools/inline-build.mjs` has no file to fold. */
const OPENING_TRACK: string = OPENING_TRACK_URL;

/** Settles once the last `startMusic` has the track decoded, or has given up on it. */
let trackDecoded: Promise<unknown> = Promise.resolve();
/**
 * For `tools/render-audio`, whose offline render outruns any real decode: it waits
 * on this before rendering, so the file it writes is what a player hears.
 */
export const openingTrackReady = (): Promise<unknown> => trackDecoded;

/** The score for each chapter, and the opening as chapter 0. The outro is silence. */
export const SCORES: Readonly<Record<number, Score>> = { 0: OPENING, 1: NIGHT, 2: HALL, 3: BREAKFAST, 4: KEYNOTE };

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
  if (score.bars !== undefined && bar >= score.bars) return [];
  const chord = score.chords[bar % score.chords.length];
  const out: Note[] = [];
  score.parts.forEach((p, part) => {
    if (p.from !== undefined && bar < p.from) return;
    if (p.until !== undefined && bar >= p.until) return;
    for (let step = 0; step < p.steps.length && step < STEPS; step++) {
      const v = p.steps[step];
      if (v < 0) continue;
      const midi = PITCHED.has(p.voice) ? (p.absolute ? v : chordNote(chord, v)) + (p.shift ?? 0) : -1;
      const len = p.lens && p.lens[step] > 0 ? p.lens[step] : p.len;
      out.push({ voice: p.voice, step, len, midi, gain: p.gain * (p.vel?.[step] ?? 1), part, pan: p.pan, wet: p.wet, late: p.late });
    }
  });
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
/** How fast a `gates` cut closes and opens, seconds: quick, but not a click. */
const GATE_RAMP = 0.004;

export interface Music {
  /** 0 for the opening's score, 1..4 for a chapter's; anything else fades to silence. */
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
    /** The fader. Fades and the mute ride this and nothing else. */
    readonly gain: GainNode;
    readonly score: Score;
    /** The score's room, when it has one (`Score.space`); parts send to it by `wet`. */
    readonly verb: AudioNode | null;
    /** What the deck owns besides its notes — the room, the gate — torn down with it. */
    readonly nodes: AudioNode[];
    /** Bars played since this deck started. Build-up parts (`from`) count from here. */
    bar: number;
    /** When the next unscheduled bar starts, in context time. */
    nextBar: number;
    /**
     * A deck that plays the opening's track instead of the score: context time
     * its first sample is due. The pump schedules no notes on it.
     */
    trackAt?: number;
  }

  let deck: Deck | null = null;
  /** Decks on their way out, kept until their fade has finished. */
  const fading: Deck[] = [];
  /** Where the voice builders connect. Set by `pump()` before it schedules anything. */
  let dest: GainNode | null = null;
  /** The playing deck's room, for the same span as `dest`. */
  let send: AudioNode | null = null;
  /** The note being built: its place in the stereo field and its share of the room. */
  let route = { pan: 0, wet: 0 };
  // A context without a panner or a convolver (the tests' stub) plays the score in
  // mono and dry rather than not at all.
  const canPan = typeof ctx.createStereoPanner === 'function';
  const canRoom = typeof ctx.createConvolver === 'function' && typeof ctx.createBuffer === 'function';
  let chapter = -1;
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

  function unplug(d: Deck): void {
    for (const n of [d.gain, ...d.nodes]) {
      try {
        // The opening's track would otherwise play on, unheard, to its end.
        const src = n as Partial<AudioScheduledSourceNode>;
        if (typeof src.stop === 'function') src.stop();
      } catch {
        /* never started, or already stopped */
      }
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
  }

  function drop(d: Deck): void {
    ramp(d.gain, 0, FADE);
    fading.push(d);
    setTimeout(() => {
      const i = fading.indexOf(d);
      if (i >= 0) fading.splice(i, 1);
      unplug(d);
    }, (FADE + 0.4) * 1000);
  }

  /**
   * The room a score with `space` plays in, generated once: stereo noise decaying
   * to -60 dB over `secs`, darkening as it goes, after 12 ms of pre-delay. Seeded,
   * so the room is the same room every run.
   */
  let roomBuf: AudioBuffer | null = null;
  function room(secs: number): AudioBuffer {
    if (roomBuf && Math.abs(roomBuf.duration - secs) < 0.01) return roomBuf;
    const rate = ctx.sampleRate;
    const n = Math.max(1, Math.floor(secs * rate));
    const b = ctx.createBuffer(2, n, rate);
    let seed = 0x2545f491;
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = seed / 2147483648 - 1;
        const u = i / n;
        lp += (0.6 - 0.45 * u) * (white - lp);
        d[i] = i < rate * 0.012 ? 0 : lp * Math.exp(-6.9 * u);
      }
    }
    roomBuf = b;
    return b;
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

  /**
   * An envelope that HOLDS: up in `attack`, sagging to `sustain` of the peak over
   * the note, and let go in the last `release`. A held power chord is a wall, not a
   * pluck, and `env`'s decay from the first instant made every one of them a pluck.
   */
  function held(t: number, peak: number, attack: number, dur: number, sustain: number, release: number): GainNode {
    const g = ctx.createGain();
    const end = t + Math.max(dur, attack + release + 0.01);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.linearRampToValueAtTime(peak * sustain, end - release);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    return g;
  }

  /**
   * Connect a voice's last node to the deck: through a panner when the note has a
   * place, and a share of it into the room when it has one. Returns what it made,
   * for `retire` to tear down with the rest of the voice.
   */
  function sink(n: AudioNode): AudioNode[] {
    const made: AudioNode[] = [];
    if (!dest) return made;
    let head: AudioNode = n;
    if (route.pan !== 0 && canPan) {
      const p = ctx.createStereoPanner();
      p.pan.value = route.pan;
      n.connect(p);
      head = p;
      made.push(p);
    }
    head.connect(dest);
    if (route.wet > 0 && send) {
      const w = ctx.createGain();
      w.gain.value = route.wet;
      head.connect(w).connect(send);
      made.push(w);
    }
    return made;
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
    lp.connect(g);
    const a = osc('sawtooth', f, t, dur, -7);
    const b = osc('sawtooth', f, t, dur, 7);
    a.connect(lp);
    b.connect(lp);
    retire(a, [a, b, lp, g, ...sink(g)]);
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
    carrier.connect(g);
    retire(carrier, [carrier, mod, index, g, ...sink(g)]);
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
    lp.connect(g);
    const o = osc('triangle', f, t, dur);
    o.connect(lp);
    retire(o, [o, lp, g, ...sink(g)]);
  }

  /** Sine for the weight, a quiet saw for the edge, both under a low filter. */
  function bass(f: number, t: number, dur: number, gain: number): void {
    if (!dest) return;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(320, t);
    const g = env(t, gain, 0.008, dur);
    lp.connect(g);
    const a = osc('sine', f, t, dur);
    const b = osc('sawtooth', f, t, dur, 4);
    const bg = ctx.createGain();
    bg.gain.value = 0.28;
    a.connect(lp);
    b.connect(bg).connect(lp);
    retire(a, [a, b, bg, lp, g, ...sink(g)]);
  }

  /** A sine dropped an octave and a half in 90 ms, which is every kick drum ever made. */
  function kick(t: number, gain: number): void {
    if (!dest) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    const g = env(t, gain, 0.002, 0.22);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.22);
    retire(o, [o, g, ...sink(g)]);
  }

  /**
   * The opening's kick: a rock kit's, not a room settling. The beater's click on
   * top, and a thump that drops from 150 Hz to its low note and stays there long
   * enough to be felt.
   */
  function thump(t: number, gain: number): void {
    if (!dest) return;
    const o = osc('sine', 150, t, 0.42);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.4);
    const g = env(t, gain, 0.002, 0.42);
    o.connect(g);
    retire(o, [o, g, ...sink(g)]);
    noiseHit(t, gain * 0.3, 3500, 0.9, 0.014);
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
    src.connect(f).connect(g);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur);
    retire(src, [src, f, g, ...sink(g)]);
  }

  /** A short pitched click with a noise edge — a rimshot, the backbeat's whole job. */
  function rim(t: number, gain: number): void {
    if (!dest) return;
    const o = osc('triangle', 380, t, 0.06);
    const g = env(t, gain, 0.001, 0.06);
    o.connect(g);
    retire(o, [o, g, ...sink(g)]);
    noiseHit(t, gain * 0.5, 2400, 1.4, 0.04);
  }

  /** A tom: a sine that falls a fifth onto its note, and a stick on the head. */
  function tom(f: number, t: number, gain: number): void {
    if (!dest) return;
    const o = osc('sine', f * 1.5, t, 0.5);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g = env(t, gain, 0.002, 0.5);
    o.connect(g);
    retire(o, [o, g, ...sink(g)]);
    noiseHit(t, gain * 0.3, 2000, 0.8, 0.03);
  }

  /**
   * The distortion curve, built once: a tanh drive hard enough that a saw power
   * chord comes out as an amp, not a synth.
   */
  let drive: Float32Array | null = null;
  function driveCurve(): Float32Array {
    if (drive) return drive;
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * 9) / Math.tanh(9);
    }
    drive = c;
    return c;
  }

  /** The amp: the drive curve, oversampled so a hard clip does not alias into a whistle. */
  function amp(): WaveShaperNode {
    const sh = ctx.createWaveShaper();
    sh.curve = driveCurve() as Float32Array<ArrayBuffer>;
    sh.oversample = '4x';
    return sh;
  }

  function filter(type: BiquadFilterType, f: number, t: number, q = 0.7, db = 0): BiquadFilterNode {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.setValueAtTime(f, t);
    b.Q.value = q;
    if (db !== 0) b.gain.setValueAtTime(db, t);
    return b;
  }

  /**
   * A power chord through an amp: root, fifth and octave as detuned saws, into the
   * drive, then a speaker cabinet — the mids scooped, nothing much above 4 kHz.
   * `muted` is the palm-muted chug: short, darker, and what a riff is made of. An
   * open chord HOLDS (`held`): the wall under the drop is sustained, not plucked.
   */
  function guitar(f: number, t: number, dur: number, gain: number, muted = false): void {
    if (!dest) return;
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const sh = amp();
    const hp = filter('highpass', 130, t);
    const scoop = filter('peaking', 700, t, 0.8, -8);
    const lp = filter('lowpass', muted ? 1800 : 4200, t, 0.8);
    const len = muted ? Math.min(dur, 0.2) : dur;
    const g = muted ? env(t, gain, 0.004, len) : held(t, gain, 0.004, len, 0.75, 0.05);
    pre.connect(sh).connect(hp).connect(scoop).connect(lp).connect(g);
    const voices: OscillatorNode[] = [];
    for (const [r, det] of [
      [1, -8],
      [1, 8],
      [1.5, -5],
      [1.5, 5],
      [2, 0],
    ] as const) {
      const o = osc('sawtooth', f * r, t, len, det);
      o.connect(pre);
      voices.push(o);
    }
    retire(voices[0], [...voices, pre, sh, hp, scoop, lp, g, ...sink(g)]);
  }

  /**
   * A lead guitar: two saws a few cents apart through a hotter amp than the
   * rhythm's, the mids pushed instead of scooped, and vibrato arriving once the
   * note has settled, the way a player leans into a held note.
   */
  function lead(f: number, t: number, dur: number, gain: number): void {
    if (!dest) return;
    const pre = ctx.createGain();
    pre.gain.value = 0.9;
    const sh = amp();
    const hp = filter('highpass', 220, t);
    const push = filter('peaking', 1700, t, 1, 3);
    const lp = filter('lowpass', 4600, t);
    const g = held(t, gain, 0.008, dur, 0.8, 0.08);
    pre.connect(sh).connect(hp).connect(push).connect(lp).connect(g);
    const a = osc('sawtooth', f, t, dur, -6);
    const b = osc('sawtooth', f, t, dur, 6);
    const lfo = osc('sine', 5.5, t, dur);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(0, t + Math.min(0.18, dur * 0.4));
    depth.gain.linearRampToValueAtTime(20, t + Math.min(0.45, dur));
    lfo.connect(depth);
    depth.connect(a.detune);
    depth.connect(b.detune);
    a.connect(pre);
    b.connect(pre);
    retire(a, [a, b, lfo, depth, pre, sh, hp, push, lp, g, ...sink(g)]);
  }

  /**
   * The power going: the band's last chord with the tape slowing under it. The
   * pitch falls in a straight line towards nothing — a tape stopping is speed
   * falling linearly, and that is what makes it sound like one — while the amp's
   * top end closes and a clean sub an octave down falls with it.
   */
  function dive(f: number, t: number, dur: number, gain: number): void {
    if (!dest) return;
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const sh = amp();
    const lp = filter('lowpass', 3800, t, 0.9);
    lp.frequency.exponentialRampToValueAtTime(140, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.setValueAtTime(gain, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    pre.connect(sh).connect(lp).connect(g);
    const voices: OscillatorNode[] = [];
    for (const [r, det] of [
      [1, -8],
      [1, 8],
      [1.5, 0],
      [2, 0],
    ] as const) {
      const o = osc('sawtooth', f * r, t, dur, det);
      o.frequency.linearRampToValueAtTime(Math.max(8, f * r * 0.04), t + dur);
      o.connect(pre);
      voices.push(o);
    }
    const sub = osc('sine', f / 2, t, dur);
    sub.frequency.linearRampToValueAtTime(8, t + dur);
    const sg = ctx.createGain();
    sg.gain.value = 0.9;
    sub.connect(sg).connect(g);
    retire(voices[0], [...voices, sub, sg, pre, sh, lp, g, ...sink(g)]);
  }

  /** Hands: three noise bursts a few milliseconds apart, the way a crowd claps. */
  function clap(t: number, gain: number): void {
    for (const [dt, k] of [
      [0, 0.7],
      [0.011, 0.8],
      [0.023, 1],
    ] as const) noiseHit(t + dt, gain * k, 1300, 1.2, dt === 0.023 ? 0.14 : 0.03);
  }

  /** A cymbal's inharmonic partials: the ratios every drum machine's metal is built on. */
  const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

  /** Six square waves at those ratios, highpassed, over bright noise: a crash with metal in it. */
  function crash(t: number, gain: number): void {
    if (!dest) return;
    const hp = filter('highpass', 5600, t);
    const g = env(t, gain * 0.5, 0.002, 1.7);
    hp.connect(g);
    const voices = METAL.map((r) => {
      const o = osc('square', r * 2.2, t, 1.7);
      o.connect(hp);
      return o;
    });
    retire(voices[0], [...voices, hp, g, ...sink(g)]);
    noiseHit(t, gain, 7200, 0.5, 1.6);
  }

  /** The opening's snare: a tuned shell under a wide crack of wires, and a sizzle on top. */
  function snare(t: number, gain: number): void {
    if (!dest) return;
    const o = osc('triangle', 220, t, 0.14);
    o.frequency.exponentialRampToValueAtTime(165, t + 0.06);
    const g = env(t, gain * 0.55, 0.001, 0.14);
    o.connect(g);
    retire(o, [o, g, ...sink(g)]);
    noiseHit(t, gain, 2300, 0.6, 0.22);
    noiseHit(t, gain * 0.35, 6800, 0.9, 0.1);
  }

  /** Noise through a narrow band sweeping up and getting louder: the climb into a drop. */
  function riser(t: number, dur: number, gain: number): void {
    if (!noise || !dest) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = filter('bandpass', 400, t, 2.5);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.03, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.03);
    retire(src, [src, f, g, ...sink(g)]);
  }

  /** A cymbal played backwards: bright noise rising out of nothing, cut dead on the downbeat. */
  function swell(t: number, dur: number, gain: number): void {
    if (!noise || !dest) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = filter('highpass', 3200, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.02, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur - 0.01);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.01);
    retire(src, [src, f, g, ...sink(g)]);
  }

  function playNote(n: Note, t: number, stepSecs: number): void {
    const dur = Math.max(0.05, n.len * stepSecs);
    route = { pan: n.pan ?? 0, wet: n.wet ?? 0 };
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
      case 'guitar':
        guitar(hz(n.midi), t, dur, n.gain);
        break;
      case 'chug':
        guitar(hz(n.midi), t, dur, n.gain, true);
        break;
      case 'lead':
        lead(hz(n.midi), t, dur, n.gain);
        break;
      case 'tom':
        tom(hz(n.midi), t, n.gain);
        break;
      case 'dive':
        dive(hz(n.midi), t, dur, n.gain);
        break;
      case 'kick':
        kick(t, n.gain);
        break;
      case 'thump':
        thump(t, n.gain);
        break;
      case 'hat':
        noiseHit(t, n.gain, 7600, 2.2, 0.035);
        break;
      case 'openhat':
        noiseHit(t, n.gain, 8800, 0.7, 0.25);
        break;
      case 'shaker':
        noiseHit(t, n.gain, 5200, 0.9, 0.075);
        break;
      case 'rim':
        rim(t, n.gain);
        break;
      case 'snare':
        snare(t, n.gain);
        break;
      case 'clap':
        clap(t, n.gain);
        break;
      case 'crash':
        crash(t, n.gain);
        break;
      case 'riser':
        riser(t, dur, n.gain);
        break;
      case 'swell':
        swell(t, dur, n.gain);
        break;
      default:
        break;
    }
    route = { pan: 0, wet: 0 };
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
    if (disposed || !deck || deck.trackAt !== undefined) return;
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;
    if (deck.nextBar < now) deck.nextBar = now + 0.05;
    const barLen = barSeconds(deck.score);
    const stepSecs = barLen / STEPS;
    dest = deck.gain;
    send = deck.verb;
    // The guard is for a context whose clock jumped (a laptop waking up): schedule
    // a couple of bars and let the next pump catch up, rather than a thousand.
    let guard = 0;
    while (deck.nextBar < now + LOOKAHEAD && guard++ < 8) {
      if (deck.score.bars !== undefined && deck.bar >= deck.score.bars) break;
      for (const n of barNotes(deck.score, deck.bar)) playNote(n, deck.nextBar + n.step * stepSecs + (n.late ?? 0), stepSecs);
      deck.bar++;
      deck.nextBar += barLen;
    }
    dest = null;
    send = null;
  }

  /*
   * THE OPENING'S TRACK, decoded once, as soon as there is a context to decode
   * on. `null` while it is on its way; `false` when it cannot be had — a context
   * without `decodeAudioData` (the tests' stub) or a codec that refuses the file
   * — and the opening then plays its synthesised score, as it always has.
   */
  let track: AudioBuffer | null | false = typeof ctx.decodeAudioData === 'function' ? null : false;
  if (track === null) {
    trackDecoded = fetch(OPENING_TRACK)
      .then((r) => r.arrayBuffer())
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buf) => {
        track = buf;
        if (deck?.trackAt !== undefined) playTrack(deck, buf);
      })
      .catch(() => {
        track = false;
        // The track was asked for and will never come: the score takes the opening.
        if (deck?.trackAt !== undefined && chapter === 0) {
          chapter = -1;
          setChapter(0);
        }
      });
  }

  /**
   * Start the track on its deck, on the opening's clock. If decoding finished
   * after the cue, it starts where it should already be rather than late, so the
   * band still lands on Voxxy's crate.
   */
  function playTrack(d: Deck, buf: AudioBuffer): void {
    if (d.trackAt === undefined || disposed) return;
    const now = ctx.currentTime;
    const offset = Math.max(0, now - d.trackAt);
    if (offset >= buf.duration) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const level = ctx.createGain();
    level.gain.value = OPENING_TRACK_GAIN;
    src.connect(level).connect(d.gain);
    d.nodes.push(src, level);
    src.start(Math.max(now, d.trackAt), offset);
  }

  function setChapter(next: number): void {
    if (disposed || next === chapter) return;
    chapter = next;
    if (deck) {
      drop(deck);
      deck = null;
    }
    if (next === 0 && track !== false) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(out);
      deck = { gain, score: OPENING, verb: null, nodes: [], bar: 0, nextBar: Infinity, trackAt: ctx.currentTime + OPENING_TRACK_AT };
      ramp(gain, muted ? 0 : MUSIC_GAIN, 0.05);
      if (track) playTrack(deck, track);
      return;
    }
    const score = SCORES[next] ?? null;
    if (!score) return;
    const t0 = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const nodes: AudioNode[] = [];
    // The gate: the score's power, cut and restored on its own clock. On its own
    // node, so a fade or a mute on the fader cannot cancel it.
    let tail: AudioNode = gain;
    if (score.gates?.length) {
      const gate = ctx.createGain();
      for (const [a, b] of score.gates) {
        gate.gain.setValueAtTime(1, t0 + a);
        gate.gain.linearRampToValueAtTime(0, t0 + a + GATE_RAMP);
        gate.gain.setValueAtTime(0, t0 + b);
        gate.gain.linearRampToValueAtTime(1, t0 + b + GATE_RAMP);
      }
      gain.connect(gate);
      tail = gate;
      nodes.push(gate);
    }
    tail.connect(out);
    let verb: ConvolverNode | null = null;
    if (score.space && canRoom) {
      verb = ctx.createConvolver();
      verb.buffer = room(score.space);
      verb.connect(gain);
      nodes.push(verb);
    }
    // Start after the outgoing deck has mostly gone, so two keys never overlap.
    deck = { gain, score, verb, nodes, bar: 0, nextBar: t0 + (score.lead ?? FADE * 0.6) };
    // A score on the scene's clock starts from its own silence and must not fade in
    // under its first bar: the opening's title boom is 0.35 s after the cue.
    ramp(gain, muted ? 0 : MUSIC_GAIN, score.lead !== undefined ? 0.05 : FADE);
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
    for (const d of [...fading, ...(deck ? [deck] : [])]) unplug(d);
    deck = null;
    fading.length = 0;
  }

  timer = setInterval(pump, PUMP_MS);
  return { setChapter, mute, dispose };
}
