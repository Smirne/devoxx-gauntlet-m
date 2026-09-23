/**
 * materials.ts — the venue's colour palette, read off the reference photography.
 *
 * Sources, in order of authority:
 *  - `media/other-images/CAPTIONS.md` — the *corrections* section. It explicitly
 *    overrides guesses: the cinema corridor is **dark navy carpet on charcoal
 *    walls** (not the prototype's red-brown), the main staircase is **blue carpet
 *    split into three runs** under a **white tensile canopy**, Zaal signage is a
 *    **large orange panel with one big white numeral**, the exhibition hall is a
 *    **pale square-column grid** over **mid-gray carpet** (not concrete), and the
 *    catering counter carries a **blue LED rope** with **yellow-orange soup cups**.
 *  - `media/venue-photos/*.jpg` — auditorium blacks, foyer brass, red wall panels.
 *
 * Rules this module exists to enforce (see the piece brief):
 *  - every material is built **once** and shared; nothing constructs a material
 *    inside a loop;
 *  - `src/render` holds no game logic — these are colours, nothing more.
 *
 * A palette is created per `buildVenue()` call and disposed with it, so a scene
 * can be torn down without leaking GPU state and a test can build several venues.
 */

import * as THREE from 'three';

export interface MaterialSpec {
  readonly color: string;
  readonly roughness?: number;
  readonly metalness?: number;
  /** Self-lit surfaces: screens, LED ropes, lamp globes, backlit poster boxes. */
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  /** < 1 turns the material transparent (glazing, tensile fabric). */
  readonly opacity?: number;
  readonly flat?: boolean;
  /** Extruded floor plates and fabric need both faces. */
  readonly doubleSide?: boolean;
}

/**
 * The whole palette. Keys are grouped by where they are used; adding one here is
 * all that is needed to make it available to `floor1.ts`, `ground.ts`,
 * `props.ts` and `signage.ts`.
 */
const SPECS = {
  /* ---------------------------------------------------------- cinema level */
  /** Outer building fabric, seen edge-on from the diorama camera. */
  shell: { color: '#20242b', roughness: 0.95 },
  /** Charcoal corridor walls — image-1790032663823.webp. */
  corridorWall: { color: '#2b3038', roughness: 0.92 },
  /** Dark navy corridor carpet — the CAPTIONS.md correction, not red-brown. */
  corridorCarpet: { color: '#161b2a', roughness: 1 },
  /** Pale plaster vaults springing from the corridor's square columns. */
  corridorVault: { color: '#9aa0a8', roughness: 0.9 },
  /** The square dark columns those vaults spring from. */
  corridorColumn: { color: '#1b1e24', roughness: 0.88 },
  /**
   * The pale cap on the corridor's cut-away near wall. An architectural sectional
   * model paints its cut faces; without it the lowered parapet reads as a wall
   * somebody forgot to finish.
   */
  sectionCut: { color: '#6f757e', roughness: 0.85 },
  /** Orange backlit poster boxes: the corridor's only warm accent. */
  posterGlow: { color: '#6a3212', roughness: 0.6, emissive: '#e2661c', emissiveIntensity: 0.9 },

  /** Auditorium walls go near-black — venue photo 54835146677 (from the back row). */
  audWall: { color: '#0d0f13', roughness: 0.97 },
  audFloor: { color: '#1a1621', roughness: 1 },
  /** Stepped raked floor under the seat blocks. */
  audRake: { color: '#15121c', roughness: 1 },
  audSeat: { color: '#2b2735', roughness: 0.95 },
  /** The screen at the far end: the brightest thing in a dark room. */
  audScreen: { color: '#c9d2dc', roughness: 0.55, emissive: '#7d94ad', emissiveIntensity: 0.45 },

  doorFrame: { color: '#767d87', roughness: 0.55, metalness: 0.45 },
  /** Fire door: painted steel, the one red-flagged object in chapter 1. */
  fireDoor: { color: '#9c3a2c', roughness: 0.6, metalness: 0.25 },
  keypad: { color: '#1a1d22', roughness: 0.5, emissive: '#3fae6b', emissiveIntensity: 0.7 },

  /* ------------------------------------------------------------- foyer/bar */
  foyerFloor: { color: '#241f2b', roughness: 1, doubleSide: true },
  foyerWall: { color: '#2e2733', roughness: 0.92 },
  /** Long pale bar counter — image-1790032659509.webp. */
  barTop: { color: '#cfc7b6', roughness: 0.45 },
  brass: { color: '#b9873c', roughness: 0.3, metalness: 0.85 },
  /** Cream-shaded table lamps and pendant globes. */
  lampWarm: { color: '#3a2c18', roughness: 0.4, emissive: '#ffc878', emissiveIntensity: 1.3 },
  /** Kiosk glazing. Blocks robots, passes light — matching the sim's `glass` flag. */
  glassPane: { color: '#9fd0e8', roughness: 0.08, metalness: 0.1, opacity: 0.32 },

  /* ---------------------------------------------------------------- stairs */
  /** Main staircase blue carpet — image-1790032674926.webp. */
  stairCarpetBlue: { color: '#243c78', roughness: 0.98 },
  /** The lighter nosing stripe on every tread. */
  stairNosing: { color: '#9aa6bb', roughness: 0.6 },
  /** Slim tubular steel handrails. */
  steelRail: { color: '#98a2ad', roughness: 0.35, metalness: 0.8 },
  /** The white tensile "tree" canopy over the main staircase, uplit blue. */
  canopyFabric: { color: '#dfe4ea', roughness: 0.85, opacity: 0.93, doubleSide: true },
  /** Secondary staircase niches: plain concrete steps, no carpet. */
  stairTreadDark: { color: '#3c4048', roughness: 0.95 },

  /* ----------------------------------------------------------- expo ground */
  /** Mid-gray hall carpet — the CAPTIONS.md correction, not concrete. */
  hallFloor: { color: '#3a3d43', roughness: 1 },
  /** Lobby floor, a shade paler than the hall. */
  lobbyFloor: { color: '#4a4b4d', roughness: 0.95 },
  hallWall: { color: '#33363c', roughness: 0.93 },
  /** Pale square column grid and the coffered ceiling ribs. */
  concrete: { color: '#c2bfb8', roughness: 0.9 },
  /** Red accent panels down the hall's side walls. */
  redPanel: { color: '#a8211c', roughness: 0.75 },
  /** Wood-slat walls: reception back wall, BOF rooms. */
  wood: { color: '#7c5b38', roughness: 0.8 },
  whitePanel: { color: '#e4e2dd', roughness: 0.7 },
  blackMetal: { color: '#16181c', roughness: 0.55, metalness: 0.4 },
  /** Biggy-blue structural steel: truss, gate, railings. */
  steelBlue: { color: '#5f7387', roughness: 0.5, metalness: 0.55 },

  /* ------------------------------------------------------------ expo stuff */
  boothWall: { color: '#39485a', roughness: 0.85 },
  /** Cloth-draped half tables. Voxxy is the only one who fits under one. */
  boothCloth: { color: '#3b3550', roughness: 1 },
  /** Sponsor LED walls and booth screens. */
  boothScreen: { color: '#1a2230', roughness: 0.4, emissive: '#2f6ea8', emissiveIntensity: 0.8 },
  counterTop: { color: '#2a2d33', roughness: 0.5 },
  /** Blue LED rope along the catering counter front. */
  ledBlue: { color: '#10305c', roughness: 0.4, emissive: '#3a8fe0', emissiveIntensity: 1.5 },
  /** Rows of yellow-orange soup cups: the tomato-soup beat, already in the venue. */
  soupCup: { color: '#efa63a', roughness: 0.6 },
  chafingSteel: { color: '#aeb4bb', roughness: 0.3, metalness: 0.85 },
  rollerSlat: { color: '#7d8086', roughness: 0.55, metalness: 0.6, flat: true },
  rackMetal: { color: '#202429', roughness: 0.6, metalness: 0.5 },
  /** Patch-panel port LEDs. A switch on standby is the one lit thing in a dark room. */
  rackLed: { color: '#2c3a33', roughness: 0.5, emissive: '#2fd17a', emissiveIntensity: 0.9 },
  /** Breaker panel face, with its little status LED. */
  breakerBox: { color: '#4d5560', roughness: 0.6, metalness: 0.35, emissive: '#d8452f', emissiveIntensity: 0.5 },
  printerWhite: { color: '#d9d7d2', roughness: 0.65 },
  /** The long white reception counter and the wardrobe's hand-in top. */
  counterWhite: { color: '#e6e2d9', roughness: 0.45 },
  /** Coats hanging in the wardrobe: a thin, dark, soft crowd of them. */
  coatFabric: { color: '#39404e', roughness: 1 },
  /** The forecourt outside the entrance glazing: wet night paving. */
  paving: { color: '#23262b', roughness: 1 },
  pendantWhite: { color: '#efefeb', roughness: 0.5, emissive: '#fff0d0', emissiveIntensity: 0.85 },
  /** Entrance and facade glazing, with the autumn dark behind it. */
  glazing: { color: '#2c4258', roughness: 0.06, metalness: 0.2, opacity: 0.4 },
  /** A glazed door LEAF in a door bank: lighter than the facade so a bay reads. */
  doorLeaf: { color: '#3d5c79', roughness: 0.08, metalness: 0.25, opacity: 0.55 },
  /** The aluminium mullions between door leaves, and the door frames. */
  mullion: { color: '#8d939b', roughness: 0.4, metalness: 0.7 },
  /** Dark blue lobby columns — image-1790032582765.webp. */
  lobbyColumn: { color: '#1d2a44', roughness: 0.85 },
  /** Rope-line stanchion posts and their belts. */
  stanchion: { color: '#b3b8bf', roughness: 0.32, metalness: 0.8 },
  stanchionBelt: { color: '#1c4a96', roughness: 0.9 },
  /** Suspended ceiling tiles in the BOF rooms — image-1790032615122.webp. */
  ceilingTile: { color: '#d8d6d0', roughness: 0.9 },
  /** Toilet pictogram panels: Kinepolis blue on white. */
  tiling: { color: '#cfd4d8', roughness: 0.45 },

  /* ---------------------------------------------------------------- accent */
  /** Devoxx orange, the same hue as Voxxy's shell. */
  devoxxOrange: { color: '#f2711c', roughness: 0.6 },
  /** The Zaal numeral panels: a deeper, flatter orange that reads as a block. */
  signOrange: { color: '#e1561c', roughness: 0.75 },
  /** Kinepolis wayfinding blue. */
  signBlue: { color: '#1c4a96', roughness: 0.7 },
  /** Emergency running-man green, lit from its own battery. */
  signGreen: { color: '#35d17a', roughness: 0.6, emissive: '#1f8f4f', emissiveIntensity: 1 },
  signDark: { color: '#1b1e24', roughness: 0.8 },
} as const;

export type VenueMaterialName = keyof typeof SPECS;

export type VenuePalette = Readonly<Record<VenueMaterialName, THREE.MeshStandardMaterial>> & {
  /** Every material in the palette, for the teardown path. */
  readonly all: readonly THREE.MeshStandardMaterial[];
  dispose(): void;
};

/**
 * Build the palette. Call once per venue; hand the result to every builder so a
 * material is never constructed inside a loop.
 */
export function createVenuePalette(): VenuePalette {
  const made: Record<string, THREE.MeshStandardMaterial> = {};
  const all: THREE.MeshStandardMaterial[] = [];

  for (const name of Object.keys(SPECS) as VenueMaterialName[]) {
    const s: MaterialSpec = SPECS[name];
    const mat = new THREE.MeshStandardMaterial({
      name: `venue/${name}`,
      color: new THREE.Color(s.color),
      roughness: s.roughness ?? 0.85,
      metalness: s.metalness ?? 0,
      flatShading: s.flat ?? false,
    });
    if (s.emissive !== undefined) {
      mat.emissive = new THREE.Color(s.emissive);
      mat.emissiveIntensity = s.emissiveIntensity ?? 1;
      // Emitters keep their punch through the tone mapper, like the robots' eyes.
      mat.toneMapped = false;
    }
    if (s.opacity !== undefined && s.opacity < 1) {
      mat.transparent = true;
      mat.opacity = s.opacity;
      mat.depthWrite = false;
    }
    if (s.doubleSide === true) mat.side = THREE.DoubleSide;
    made[name] = mat;
    all.push(mat);
  }

  const palette = made as unknown as {
    -readonly [K in keyof VenuePalette]: VenuePalette[K];
  };
  palette.all = all;
  palette.dispose = (): void => {
    for (const mat of all) mat.dispose();
  };
  return palette as VenuePalette;
}
