/**
 * cameos.ts — the two people who built this game, standing in it.
 *
 * Michele, 29 Sep 2026, with two photographs and a request: *"I'd like
 * to add a couple character to the game (3D version, 2D optional). They are you
 * and me. For me here's a couple photo's. As a normal attendee, propose some
 * clever phrase. For you, let's find some idea. No logo, but one should be able
 * to understand that's you."*
 *
 * So there are two more people at breakfast in chapter 3, pair-programming at
 * one of the hall's high tables, and two more seats taken in Room 8 for the
 * keynote. Their looks live here, once, and both chapters spread them onto a
 * `Person`; the 3D build draws the close-ups by name
 * (`src/render3d/people3d.ts`), the 2.5D figure shows the shirt and collar —
 * and, on Claude, the screen for a head (`Person.screen`).
 *
 * - **Michele** is a normal attendee, from the photograph at Pena: the buzz cut
 *   and the goatee, the grey hoodie with its worn red stripes over a black tee,
 *   mirrored sunglasses hooked on the collar. The tee's brand wordmark is the
 *   one thing not copied — "nothing that needs permission" (CLAUDE.md) — and its
 *   colourful blocks spell Michele's own standing call instead: *"I vote funny."*
 *   Then, at Michele's asking, khaki shorts and the WellD backpack: WellD is
 *   Michele's own company, so its mark is Michele's to put in
 *   (`src/render3d/welld.ts`) — and one of its stickers is hidden somewhere.
 * - **Claude** is recognisable without a logo, which rules out the mark and the
 *   name set in its type. What is left is what people actually know it by: the
 *   warm terracotta-and-cream palette, a terminal with a blinking cursor for a
 *   face — the only body it really has — and the first thing it says.
 */

import { LANYARD } from './lanyards';
import type { SpeakerLook } from './speakers';

/** Claude's terracotta: the warm clay orange people know it by. */
export const CLAUDE_CLAY = '#d97757';
/** ...and the cream it is always set on. */
export const CLAUDE_CREAM = '#f0eee6';

/**
 * A speaker's look, and two things no speaker look carries: a screen for a head
 * (`Person.screen`), and a SEED of their own.
 *
 * Everybody else's seed is their index in the chapter's list, which is fine for
 * a crowd and wrong for somebody the player is meant to recognise: the body
 * came out 1.57 m at breakfast and 1.48 m and broad at the keynote, two
 * different people with one face. One seed each, used by both chapters, is one
 * body in both rooms (`src/render/people.ts`: height, build and what they
 * carry are the seed's).
 */
export interface CameoLook extends SpeakerLook {
  screen?: boolean;
  seed: number;
}

export const CAMEO_LOOKS: Readonly<Record<string, CameoLook>> = Object.freeze({
  /*
   * Grey hoodie, its red stripes reduced to a red collar band at 30 px.
   *
   * Seed 1271: 1.70 m, the tallest the crowd's range allows, and an athlete's
   * build rather than a wardrobe's. Michele, on the first portrait: *"Make me
   * more beautiful :D"*.
   */
  Michele: { colour: '#8d9095', collar: '#b8323c', lanyard: LANYARD.attendee, seed: 1271 },
  // Seed 1099: 1.59 m, middling, empty-handed — nothing to carry (it says why).
  Claude: { colour: CLAUDE_CLAY, collar: CLAUDE_CREAM, lanyard: LANYARD.attendee, screen: true, seed: 1099 },
});

/**
 * What they say when Voxxy asks. One line each, like everybody else in the hall.
 *
 * Michele's is an attendee's small talk with the author showing through: the
 * physics constants really are frozen, and the one time they were unfrozen it
 * was Michele who did it (GAUNTLET.md). Claude's opens with the phrase every
 * developer who has used it would recognise before they read the name.
 */
export const CAMEO_LINES: Readonly<Record<string, string>> = Object.freeze({
  Michele:
    'Just an attendee, promise. I would make you three faster, but somebody froze the physics constants. …Right. That was me.',
  Claude:
    "You're absolutely right! …Sorry, reflex. I can't carry the soup — I'm made of words. Six thousand lines of them are notes on how Biggy should.",
});

/** Where they sit for the keynote: Room 8's second row, left to right. */
export const SECOND_ROW: readonly string[] = ['Michele', 'Claude'];
