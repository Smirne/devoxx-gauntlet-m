/**
 * cues.ts — the game's sound cues, read off the snapshot.
 *
 * Every cue is an EDGE in something the sim publishes (a door's `progress`
 * leaving zero, the keypad's label growing, a clue count rising), so the logic
 * is the same whichever renderer draws the frame. It used to live in
 * `src/main.ts` alone, and the 3D page (`src/main3d.ts`) kept its own copy,
 * which drifted: a day of 2.5D work added the keypad, the maglock, the score
 * and chapter 2's switchboard, and the 3D build played none of them. This is
 * that code verbatim from `main.ts` (25 Sep 2026), made into a factory so each
 * page gets its own edge state. `main.ts` can switch to it with no change in
 * behaviour.
 */

import { flairPhase } from '../sim/bot';
import { SIGN } from '../sim/letters';
import type { GameSnapshot, RobotKind } from '../sim/types';
import { PX_PER_M } from '../sim/units';

import type { Audio } from './audio';
import { STEP_FREQ_BASE, STEP_FREQ_PER_MPS, gaitSpeed } from './robots';

/** Badges the printer runs off once online, and how often — `props-ground.ts` draws the same six. */
const BADGES = 6;
const BADGE_EVERY = 1.1;

/**
 * Which score the frame should be playing: the opening's own (0) while the
 * crates are on screen, the chapter's after it, and nothing on a title card.
 *
 * Not `snap.chapter`. The opening runs ON TOP of chapter 1 (`startOpening()` in
 * `src/sim/game.ts` starts the chapter underneath it), so `snap.chapter` reads 1
 * from the first frame of the crates. The score used to be picked from it, and
 * the opening's own score was never heard once: every intro Michele played was
 * chapter 1's ambient night score, which is exactly what he kept calling "too
 * ambient for the intro" — and two rewrites went into a score nobody could hear.
 */
export function scoreFor(snap: GameSnapshot): number {
  if (snap.opening) return 0;
  return snap.chapter >= 1 ? snap.chapter : -1;
}

/** Build a per-frame cue player bound to one `Audio`. */
export function createCues(audio: Audio): (snap: GameSnapshot, dt: number) => void {
  const stepPhase: Record<RobotKind, number> = { voxxy: 0, droid: 0, biggy: 0 };
  let ambientChapter = -1;
  /** The score last asked for; see `scoreFor`. */
  let score = -2;
  let lastPhase = '';
  /** Last frame's fall progress on chapter 1's jammed door, so the crash plays once. */
  let lastBreak = 0;
  /** The printer's cable, and how far into printing it is. */
  let lastPlugged = false;
  let printT = 0;
  let printed = 0;
  /** Last frame's crate fronts in the opening, so each lands with one boom. */
  const lastCrate: Record<RobotKind, number> = { voxxy: 0, droid: 0, biggy: 0 };
  /** Last frame's swing on chapter 1's fire door, so the opening plays once. */
  let lastFireSwing = 0;
  /** Last frame's rise on chapter 2's roller door, so the shutter plays once. */
  let lastRollerRise = 0;
  /**
   * What chapter 1's keypad was showing last frame.
   *
   * `audio.ts` has carried a written, tuned `keypad` cue — with `semitones`, so the
   * digits are not all one note — since the day it was added, and it had never been
   * played: the one object in the game you type into answered in silence. The prop's
   * `label` is `entered.padEnd(4, '_')`, so the digits are the label with the
   * underscores taken off, and every edge below is a change in THAT string. The sim
   * owns the code and the entry; nothing here decides anything.
   */
  let lastEntered = '';
  /**
   * A whole-tone ladder, one rung per digit, `4` at the base — chapter 1 accepts 4
   * to 9 and nothing else, so those six are the ones that have to be told apart by
   * ear. The others are mapped anyway rather than left to collapse onto one pitch.
   */
  const KEY_SEMIS = [-8, -6, -4, -2, 0, 2, 4, 6, 8, 10];
  /** Last frame's swing on chapter 1's cinema-B door, so the maglock plays once. */
  let lastLockSwing = 0;
  /** Last frame's swing on chapter 2's router cabinet, so the hinges play once. */
  let lastCabinetSwing = 0;
  /** Last frame's swing on chapter 3's registration gate, so the hook plays once. */
  let lastGateSwing = 0;
  /** Handles up on chapter 2's breaker panel, so each one gets its own cue. */
  let lastBreakerV = 0;
  /** The router cabinet's pilot lamp: '' outside chapter 2, then idle/active/done. */
  let lastPilot = '';
  /** Last frame's flourish per robot, so a party trick's cue plays once. */
  const lastFlair: Record<RobotKind, number> = { voxxy: 0, droid: 0, biggy: 0 };
  /**
   * How many clues were solved last frame, and who was being driven, and who was
   * riding — the three edges below.
   *
   * `audio.ts` has carried a written, tuned and **never played** `clue` cue since the
   * day it was added: the sim knew a light-mix enigma had resolved, the marker drew
   * its digit, and the room stayed silent. Michele, 24 Sep 2026: *"Add sound effect
   * when a Hint is solved."* A digit surfacing out of the dark is the single best
   * moment chapter 1 has and it was the one moment with nothing on it.
   *
   * The count, not a per-clue flag, because `snap.clues` is rebuilt every chapter and
   * a chapter change would otherwise fire four cues at once; it is reset below with
   * the ambient bed. Clues are only ever found, never un-found, so a rising count is
   * exactly one clue solved.
   */
  let lastFound = 0;
  /**
   * Letters standing in chapter 4's #DEVOXX sign last frame (`src/sim/letters.ts`).
   * Zero outside chapter 4, so the crew's own #DEV, already up when the chapter
   * opens, arrives from zero and is not mistaken for four letters Droid put in.
   */
  let lastSignUp = 0;
  let lastActive = -1;
  let lastMounted = false;


  function updateAudio(snap: GameSnapshot, dt: number): void {
    // The opening: each crate front hitting the floor.
    if (snap.opening) {
      for (const k of ['voxxy', 'droid', 'biggy'] as const) {
        const open = snap.opening.open[k];
        if (open >= 1 && lastCrate[k] < 1) audio.play('crate', { intensity: k === 'voxxy' ? 0.3 : k === 'droid' ? 0.65 : 1 });
        lastCrate[k] = open;
      }
    }
    // The only thing in the game a robot destroys. `Prop.progress` leaving zero is
    // the sim saying it has just been hit, and `crash` has been written and unplayed
    // in `audio.ts` since it was added.
    const breaking = snap.props.find((p) => p.kind === 'jammed')?.progress ?? 0;
    if (breaking > 0 && lastBreak <= 0) audio.play('crash', { intensity: 1 });
    lastBreak = breaking;

    // The keypad's payoff. `Prop.progress` leaving zero is the sim saying the magnetic
    // lock has just let go, and the cue runs about as long as `FIRE_SWING_TIME`. The
    // chapter deliberately holds the corridor for the swing before the cutscene takes
    // over, so this is heard over the thing it describes rather than under a fade.
    const swinging = snap.props.find((p) => p.kind === 'firedoor')?.progress ?? 0;
    if (swinging > 0 && lastFireSwing <= 0) audio.play('door-open');
    lastFireSwing = swinging;

    // The store's shutter, on the same edge. `shutter` carries its own impact, so the
    // roller break does NOT also play `crash` — that stays on chapter 1's jammed door.
    const rising = snap.props.find((p) => p.kind === 'roller')?.progress ?? 0;
    if (rising > 0 && lastRollerRise <= 0) audio.play('shutter');
    lastRollerRise = rising;

    /*
     * The keypad, one cue per keystroke.
     *
     * Three different things can happen to the entry and they have to sound
     * different, because the player cannot see the object closely while driving:
     * a digit lands (pitched off the digit itself), a digit is taken back, and a
     * wrong code clears the whole entry — which is the only one that must not be
     * mistakable for progress, so it answers low and twice.
     */
    const pad = snap.props.find((p) => p.kind === 'keypad');
    const entered = (pad?.label ?? '').replace(/_/g, '');
    if (entered.length > lastEntered.length) {
      const digit = Number(entered[entered.length - 1]);
      audio.play('keypad', { semitones: KEY_SEMIS[digit] ?? 0 });
    } else if (entered.length < lastEntered.length) {
      /*
       * Backspace, or the whole entry cleared by a wrong code. `state` is still
       * 'idle' either way, so the LENGTH is what tells them apart — and it is 3,
       * not 4: `ch1-night.ts:861` tests the code and clears `entered` inside the
       * same key press, so a wrong fourth digit never reaches a snapshot and the
       * entry goes 3 to 0 in one frame. That is also why a rejected fourth digit
       * has no keystroke cue of its own: the rejection is the answer to it.
       */
      const wrong = entered.length === 0 && lastEntered.length === 3;
      audio.play('keypad', { semitones: -14, gain: 0.9 });
      if (wrong) audio.play('keypad', { semitones: -17, gain: 0.9, delay: 0.11 });
    }
    lastEntered = entered;

    // Cinema B's magnetic lock, released from the projector panel. The prop is
    // published in BOTH states now — it used to stop existing the moment it opened,
    // which made the payoff of the whole mount beat a door that silently ceased to
    // be — so `state === 'open'` is what picks it out of the four cinema doors
    // chapter 1 draws. A, C and D are scenery and never carry a clock.
    const unlocking = snap.props.find((p) => p.kind === 'lock' && p.state === 'open')?.progress ?? 0;
    if (unlocking > 0 && lastLockSwing <= 0) audio.play('maglock');
    lastLockSwing = unlocking;

    // Biggy shouldering the router cabinet open, on hinges seized since 2019. Two
    // leaves, so the cue has two stops in it; it is the one cue whose middle is
    // louder than its ends.
    const shouldering = snap.props.find((p) => p.kind === 'cabinet')?.progress ?? 0;
    if (shouldering > 0 && lastCabinetSwing <= 0) audio.play('cabinet');
    lastCabinetSwing = shouldering;

    /*
     * CHAPTER 2'S SWITCHBOARD.
     *
     * Michele: *"the braker activation seems to do nothing, apart from the
     * message. A 56k like sound for the modem and a light on a cabinet to signal
     * you should go there?"* All three of those are here.
     *
     * The handle count and not the strike, because the strike decays over 0.45 s
     * and two `E` presses can be 100 ms apart — a progress edge would swallow the
     * second cue. A ladder of three, so the board audibly settles as the load
     * comes on.
     */
    const breakerV = snap.props.find((p) => p.kind === 'breaker')?.v ?? 0;
    if (breakerV > lastBreakerV) audio.play('breaker', { semitones: [0, -3, -6][breakerV - 1] ?? 0 });
    lastBreakerV = breakerV;

    /*
     * The cabinet's pilot lamp is the state machine for the other two cues, which
     * is why they ride it rather than the breaker count: the lamp coming up IS the
     * supply landing, and the lamp going green IS the router on the air.
     */
    // The badge printer: a click as the cable goes in, then a badge every
    // BADGE_EVERY while it is online — the same rhythm the 3D build ejects them
    // at (Michele, 28 Sep: "add a sound when the printer is connected, and when
    // it prints a badge").
    const plugged = snap.props.find((p) => p.kind === 'cable')?.state === 'done';
    if (plugged && !lastPlugged) audio.play('plug');
    lastPlugged = plugged;
    const printing = snap.props.find((p) => p.kind === 'printer')?.state === 'done';
    if (printing) {
      printT += dt;
      while (printed < BADGES && printT >= printed * BADGE_EVERY) {
        audio.play('badge');
        printed++;
      }
    } else {
      printT = 0;
      printed = 0;
    }

    const pilot = snap.props.find((p) => p.kind === 'pilot')?.state ?? '';
    // The supply landing — the third handle. Nothing in it is above 300 Hz: the
    // hall is still dark and a bright cue would promise a room the light isn't in.
    if (pilot === 'active' && lastPilot === 'idle') {
      audio.play('busbar');
      audio.play('modem-boot', { delay: 0.7 });
    }
    // The handshake, and the arpeggio landing as its hiss dies.
    if (pilot === 'done' && lastPilot === 'active') {
      audio.play('modem');
      audio.play('chime', { delay: 1.95 });
    }
    lastPilot = pilot;

    // Stephan opening the stairs for the day: a hook off an eye, and nothing hits.
    // The chapter holds the hall for the whole swing before the exit cutscene, so
    // this is heard over the thing it describes rather than under a fade.
    const opening = snap.props.find((p) => p.kind === 'gate')?.progress ?? 0;
    if (opening > 0 && lastGateSwing <= 0) audio.play('gate');
    lastGateSwing = opening;

    /*
     * The party tricks on `E`.
     *
     * `flairPhase` is the sim's own clock (`src/sim/bot.ts`), the same number the rig
     * poses from — so the cue rides the edge of a value the sim already owns and
     * nothing here schedules an animation. Voxxy's hop is not in this list: she lands
     * with a footstep, which is the right sound for a hop and is already playing.
     */
    for (const b of snap.bots) {
      const f = flairPhase(b);
      if (f > 0 && lastFlair[b.kind] <= 0) {
        if (b.kind === 'biggy') audio.play('roll');
        else if (b.kind === 'droid') audio.play('stretch');
      }
      lastFlair[b.kind] = f;
    }

    /*
     * A hint solved: the digit's own cue, and — when it was the LAST one — the
     * "job done" arpeggio a beat later, so the set completing sounds different from
     * the four steps that got there. `chime` had also never been played.
     */
    const found = snap.clues.reduce((n, c) => n + (c.found ? 1 : 0), 0);
    if (found > lastFound) {
      audio.play('clue');
      if (snap.clues.length > 0 && found === snap.clues.length) audio.play('chime', { delay: 0.32 });
    }
    lastFound = found;

    /*
     * The #DEVOXX sign: a letter going into its gap is a digit's cue, and the sign
     * complete is the set's — the same pair as chapter 1's clues, for the same
     * reason. Only a RISE from a sign that was already standing counts, so the
     * chapter opening (0 to the crew's four) and a restart (back down to four) are
     * silent, and each letter Droid sets in is heard exactly once.
     */
    const signUp = snap.chapter === 4 ? snap.props.reduce((n, p) => n + (p.kind === 'letter' && p.state === 'done' ? 1 : 0), 0) : 0;
    if (signUp > lastSignUp && lastSignUp > 0) {
      audio.play('clue');
      if (signUp === SIGN.length) audio.play('chime', { delay: 0.32 });
    }
    lastSignUp = signUp;

    // Two more cues that were written and silent: the switcher, and Droid going up.
    if (snap.active !== lastActive) {
      if (lastActive >= 0) audio.play('switch');
      lastActive = snap.active;
    }
    const mounted = snap.bots.some((b) => b.mounted);
    if (mounted && !lastMounted) audio.play('mount');
    lastMounted = mounted;
    if (snap.chapter !== ambientChapter) {
      ambientChapter = snap.chapter;
      // A fresh chapter brings a fresh set of clues, already at zero found; without
      // this, restarting chapter 1 after solving it would count four solves at once.
      lastFound = snap.clues.reduce((n, c) => n + (c.found ? 1 : 0), 0);
      // Same reason, for every door: a chapter's props arrive shut, and a restart
      // must not carry the previous run's swing across and swallow the next cue.
      // The three older edges had this bug — replay chapter 1 after breaking the
      // jammed door and the crash was silent the second time.
      lastBreak = 0;
      lastFireSwing = 0;
      lastRollerRise = 0;
      lastEntered = '';
      lastLockSwing = 0;
      lastCabinetSwing = 0;
      lastGateSwing = 0;
      lastBreakerV = 0;
      lastPilot = '';
      audio.setAmbient(snap.chapter);
      if (snap.chapter > 1) audio.play('transition');
    }
    // Its own edge, not the chapter's: the opening and chapter 1 share a chapter
    // number and not a score.
    if (scoreFor(snap) !== score) {
      score = scoreFor(snap);
      audio.setMusic(score);
    }
    if (snap.phase !== lastPhase) {
      if (snap.phase === 'done') audio.play('victory');
      lastPhase = snap.phase;
    }
    for (const b of snap.bots) {
      if (b.mounted) continue;
      const v = gaitSpeed(Math.hypot(b.vx, b.vy) / PX_PER_M);
      if (v < 0.12) {
        stepPhase[b.kind] = 0;
        continue;
      }
      const before = stepPhase[b.kind];
      const after = before + (STEP_FREQ_BASE + STEP_FREQ_PER_MPS * v) * dt;
      stepPhase[b.kind] = after % 1;
      if (Math.floor(after * 2) > Math.floor(before * 2)) {
        audio.footstep(b.kind, Math.min(1, v / 2.6));
      }
    }
  }

  return updateAudio;
}
