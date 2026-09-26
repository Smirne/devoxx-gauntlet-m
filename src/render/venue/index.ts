/**
 * index.ts — the Kinepolis diorama.
 *
 * `buildVenue()` returns both levels of the venue as one `THREE.Group`, built
 * entirely from `src/sim/geometry.ts`. The cinema level sits at y = 0 and the
 * exhibition level `STOREY_H_M` below it, so a chapter renderer only has to pick
 * which of the two groups is visible and point its fixed orthographic camera at
 * the right `ViewRect`.
 *
 * ## What other pieces need from this module
 *
 * - `roomAnchors` — a `Map` from a room number (3..10), a closed-cinema room
 *   letter ('A'..'E') or a venue-feature key ('hall', 'reception', 'stair-main',
 *   …) to an `Object3D` sitting at that thing's floor centre. Parent a spotlight,
 *   a banner or a camera target to one instead of re-deriving plan coordinates.
 *   Every room anchor carries a child named `door` at its doorway centre.
 * - `simToWorld()` — the one conversion from sim pixels to diorama metres,
 *   storey offset included.
 * - `showOverhead(false)` — hides the vaults, the tensile canopy, the pendants and
 *   the ceiling ribs. The Stage 1 overlay check photographs the venue from
 *   straight above; a canopy over the main staircase would hide the very thing
 *   being measured.
 *
 * Nothing here reads game state. The venue is static geometry; chapter props,
 * robots and lighting are other pieces, and they attach to it.
 */

import * as THREE from 'three';

import { STOREY_H_M, m } from '../../sim/units';
import { buildFloor1 } from './floor1';
import { buildGround } from './ground';
import { createVenuePalette } from './materials';
import { disposeGeometries } from './props';
import { SignPainter, buildSignage } from './signage';

export { createVenuePalette } from './materials';
export type { VenueMaterialName, VenuePalette } from './materials';
/** The sectional-model heights, so props built by other pieces sit at venue scale. */
export {
  BARRIER_H,
  BREAKER_D,
  BREAKER_H,
  BREAKER_Y,
  DOOR_H,
  GLASS_H,
  LOW_H,
  NEAR_CUT_H,
  SHELL_H,
  WALL_H,
  barrierPanelGeometry,
  barrierRun,
  disposeGeometries,
} from './props';
export { zaalPosterX, zaalSignX } from './signage';

export interface Venue {
  /** Parent this into the scene. Its origin is the plan's top-left corner. */
  group: THREE.Group;
  /** The cinema level, at y = 0. */
  floor1: THREE.Group;
  /** The exhibition level, at y = -STOREY_H_M. */
  ground: THREE.Group;
  /** Rooms 3..10, cinema rooms 'A'..'E', and named venue features. */
  roomAnchors: Map<number | string, THREE.Object3D>;
  /** Show or hide everything above head height. See the module header. */
  showOverhead(visible: boolean): void;
  dispose(): void;
}

/**
 * Sim pixels -> diorama metres.
 *
 * The plan's +x becomes world +x and the plan's +y (down the page) becomes world
 * +z, so a camera looking down +Y reproduces `plans/*.png` exactly. `floor` picks
 * the storey, matching `GameSnapshot.floor`.
 */
export function simToWorld(
  simX: number,
  simY: number,
  floor: 'up' | 'down',
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  return out.set(m(simX), floor === 'down' ? -STOREY_H_M : 0, m(simY));
}

export function buildVenue(): Venue {
  const palette = createVenuePalette();
  /*
   * One canvas painter for the whole venue.
   *
   * It used to be private to `buildSignage`, which was fine while lettering was
   * only ever hung on a wall by that module. The twelve sponsor stands print
   * their own back walls, totems and fascias in `ground.ts` (Michele: *"making
   * people and stands real"*), and they must share this cache: it is keyed per
   * distinct sign, and it is the single `dispose()` that releases every texture.
   */
  const painter = new SignPainter();
  const group = new THREE.Group();
  group.name = 'venue';

  const f1 = buildFloor1(palette);
  const gf = buildGround(palette, painter);
  gf.group.position.y = -STOREY_H_M;
  group.add(f1.group);
  group.add(gf.group);

  // Signage is built last: it `attach`es the Zaal panels onto the room anchors,
  // which means the anchors must already sit in their final world transform.
  const signs = buildSignage(palette, f1.anchors, painter);
  f1.group.add(signs.floor1);
  gf.group.add(signs.ground);
  group.updateMatrixWorld(true);

  const roomAnchors = new Map<number | string, THREE.Object3D>([...f1.anchors, ...gf.anchors]);

  return {
    group,
    floor1: f1.group,
    ground: gf.group,
    roomAnchors,
    showOverhead: (visible: boolean): void => {
      f1.overhead.visible = visible;
      gf.overhead.visible = visible;
    },
    dispose: (): void => {
      disposeGeometries(group);
      signs.dispose();
      palette.dispose();
      group.removeFromParent();
      group.clear();
      roomAnchors.clear();
    },
  };
}
