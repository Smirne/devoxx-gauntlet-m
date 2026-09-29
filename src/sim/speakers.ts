/**
 * speakers.ts — the speakers the player meets by name, and what they look like.
 *
 * Michele sent a photograph of each on 28 Sep 2026 (Mario, Venkat, Josh, Lize,
 * Aurélie): first names and a caricature, the rule Stephan and Celestino follow
 * (CLAUDE.md, "nothing that needs permission"). They stand on the hall floor in
 * chapter 3 and sit in Room 8's front row for the keynote in chapter 4, so their
 * looks live here, once, and both chapters spread them onto a `Person`. The
 * renderers only need `name` to draw the portrait; the rest is what the 2.5D
 * figure shows from its distance (shirt, collar, glasses, mic, bare feet).
 */

import { LANYARD } from './lanyards';

export interface SpeakerLook {
  colour: string;
  collar?: string;
  glasses?: boolean;
  mic?: boolean;
  barefoot?: boolean;
  lanyard: string;
}

export const SPEAKER_LOOKS: Readonly<Record<string, SpeakerLook>> = Object.freeze({
  Mario: { colour: '#1c1c20', collar: '#8a1f28', glasses: true, lanyard: LANYARD.speaker },
  Venkat: { colour: '#56585b', collar: '#3a3b3d', glasses: true, mic: true, barefoot: true, lanyard: LANYARD.speaker },
  Josh: { colour: '#c9c8c4', glasses: true, lanyard: LANYARD.speaker },
  Lize: { colour: '#b3202e', mic: true, lanyard: LANYARD.speaker },
  'Aurélie': { colour: '#1e2a44', glasses: true, lanyard: LANYARD.speaker },
});

/**
 * The keynote speaker, still TBA: teal hoodie and cap, the multicolour ribbon,
 * and the disguise (`Person.disguise`). Chapter 3 hides them behind a booth and
 * chapter 4 puts them on the stage, and both spread this, so the person the
 * player walked to Stephan is the person who walks on.
 *
 * Teal worn head to foot is what Michele asked for when he could not find them
 * (*"therse should also be something recognizable about thim"*): nothing else in
 * the hall wears the hoodie, and the ribbon is the only multicolour one.
 */
export const KEYNOTE_LOOK = Object.freeze({
  colour: '#1f9e9b',
  hat: true,
  lanyard: LANYARD.keynote,
  disguise: Object.freeze({ lining: '#e8a01c', badge: Object.freeze(['KEYNOTE', '?']) }),
});

/** Front-row order in Room 8, left to right as the audience sees them. */
export const FRONT_ROW: readonly string[] = ['Aurélie', 'Josh', 'Venkat', 'Mario', 'Lize'];
