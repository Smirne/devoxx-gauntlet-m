/**
 * lanyards.ts — the badge ribbon everybody at Devoxx is wearing, and what its
 * colour means.
 *
 * Michele, 26 Sep 2026, from the list of cheap extras: *"Let's try 5 6 7 too"* —
 * number 6 was **lanyard colours mean something**. They do at the real conference
 * (crew, speaker, attendee are different ribbons and everyone learns to read them
 * by the first coffee break), and a hall full of identical grey figures is exactly
 * the kind of detail that costs one string and buys a sense of place.
 *
 * It lives in the sim and not in the renderer because it is a FACT ABOUT A PERSON
 * — the reason the keynote speaker can be picked out of three thousand people is
 * the ribbon round their neck, and chapter 3's whole middle act is finding them.
 * The renderer is handed the colour on the `Person` and paints it (CLAUDE.md).
 */

/** The three ribbons, plus the one the conference chair wears. */
export const LANYARD: Readonly<Record<string, string>> = Object.freeze({
  /** Grey-blue: three thousand of these. */
  attendee: '#8fa3bd',
  /** Devoxx red: the crew behind a counter, and the volunteers on the doors. */
  crew: '#c0392b',
  /** Teal: about two hundred of these — every speaker in the building. */
  speaker: '#28a3a0',
  /**
   * The keynote's own ribbon: MULTICOLOUR, one of a kind.
   *
   * Michele, 28 Sep 2026: *"I think they should have speakers badge, and the
   * keynote another color, maybe multicolor?"* — the famous faces on the hall
   * floor are speakers and wear teal like every other speaker, and the one
   * person chapter 3 is looking for wears a ribbon nobody else does. This hex is
   * the ribbon's key (and its average, for anything that paints one flat
   * colour); a renderer that sees it paints a rainbow.
   */
  keynote: '#c8409a',
  /** Devoxx orange, one per conference. */
  chair: '#e08a1e',
});

/**
 * The ribbon for a `Person.role`, or `undefined` for somebody not wearing one.
 *
 * Unknown roles get the attendee ribbon rather than nothing: a new kind of person
 * in the hall is an attendee until somebody says otherwise, and a figure with no
 * badge at all reads as a mistake.
 */
export function lanyardFor(role: string): string | undefined {
  if (role === 'staff') return LANYARD.crew;
  if (role === 'speaker') return LANYARD.speaker;
  if (role === 'stephan') return LANYARD.chair;
  return LANYARD.attendee;
}
