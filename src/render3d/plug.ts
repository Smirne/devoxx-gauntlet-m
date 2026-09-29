/**
 * plug.ts — the one place chapter 2's plug-in beat is described in 3D.
 *
 * Michele, 29 Sep 2026: *"could Voxxy connect it to the printer with an animation
 * when she reaches here?"* The sim runs the clock (`PLUG_TIME` in
 * `src/sim/chapters/ch2-expo.ts`, published as the cable prop's `progress`) and
 * holds her on the pad; the renderer draws the rest. Two renderers take part —
 * `robots3d.ts` poses her hand onto the port, `props-ground.ts` draws the cable's
 * end and the printer waking — so the port, the click and the hand they share
 * live here, and neither imports the other.
 */

import * as THREE from 'three';

import { groundRiseM } from '../sim/geometry';
import type { Prop } from '../sim/types';
import { m } from '../sim/units';

/**
 * The network socket on the printer's east flank, printer-local metres: the body
 * is 0.72 x 0.34 x 0.55 m standing on the counter, and the socket sits low on the
 * side, near the front corner, where a hand coming up over the counter lip meets it.
 */
export const PORT_LOCAL = new THREE.Vector3(0.375, 0.13, 0.19);

/** The counter top under the printer, above the lobby floor (`printer` in props-ground). */
export const PRINTER_BASE = 1.05;

/** Where in the beat (0..1 of the cable prop's `progress`) the plug seats and clicks. */
export const CLICK_U = 0.58;

/** The socket, world metres, from the printer prop. */
export function printerPort(p: Pick<Prop, 'x' | 'y' | 'w' | 'h'>, out: THREE.Vector3): THREE.Vector3 {
  const w = p.w ?? 10;
  const h = p.h ?? 10;
  return out.set(m(p.x + w / 2) + PORT_LOCAL.x, groundRiseM(p.x + w / 2) + PRINTER_BASE + PORT_LOCAL.y, m(p.y + h / 2) + PORT_LOCAL.z);
}

/**
 * The counter's front lip under the printer, world metres: the top is 1.1 m over
 * the lobby and overhangs the front by 6 cm (`reception` in ground3d.ts).
 */
export function counterLip(p: Pick<Prop, 'x' | 'y' | 'w' | 'h'>, out: THREE.Vector3): THREE.Vector3 {
  const w = p.w ?? 10;
  return out.set(m(p.x + w / 2), groundRiseM(p.x + w / 2) + 1.1, m(p.y + (p.h ?? 10)) + 0.06);
}

/**
 * Where Voxxy's hand holds the plug this frame, written by `updateRobots` and read
 * by the cable, which ends there. `live` is false outside the beat; `u` is the
 * beat's clock (-1 outside it), for the printer, which is drawn before the cable.
 */
export const plugHand = { at: new THREE.Vector3(), live: false, u: -1 };
