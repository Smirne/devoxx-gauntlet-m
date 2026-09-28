/**
 * contacts.ts — every contact the solver resolved this frame, as telemetry.
 *
 * ## Why this exists
 *
 * Michele, 26 Sep 2026, agreeing to the physics view: twenty of the hundred points
 * are for physics realism and every bit of it is invisible — a judge watching the
 * game sees robots moving, not the impulse that stopped one. This is the half of
 * that readout the renderer cannot derive without doing the solver's job a second
 * time, which CLAUDE.md forbids: where a body touched something, which way the
 * normal pointed, how fast it was closing and what impulse was actually applied.
 *
 * It is **telemetry, never state**. Nothing in the sim reads it back, no chapter
 * branches on it, and deleting the log mid-run changes nothing about the game. It
 * is written by the three places that resolve a contact — the wall bounce in
 * `stepBot`, `botsCollide`, and `standOff` — and cleared by `game.update` at the
 * top of every frame, so a snapshot always carries the contacts of the frame it
 * belongs to and no others.
 *
 * The cap is there so that a pathological frame (a robot wedged in a corner while
 * a chapter pushes walls under him) cannot grow an array without bound in a build
 * where nobody is looking at it.
 */

import type { Contact } from './types';

/** A frame with more contacts than this is a pile-up; the rest are not drawn. */
const MAX_PER_FRAME = 64;

const log: Contact[] = [];

export function logContact(c: Contact): void {
  if (log.length < MAX_PER_FRAME) log.push(c);
}

/** Called once at the top of `game.update`, and nowhere else. */
export function clearContacts(): void {
  log.length = 0;
}

/** The live array the snapshot publishes. Read only — the sim owns it. */
export function contacts(): readonly Contact[] {
  return log;
}
