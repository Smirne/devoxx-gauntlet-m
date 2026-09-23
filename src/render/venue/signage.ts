/**
 * signage.ts — the venue's lettering, drawn procedurally onto canvas textures.
 *
 * Numbered Zaal signage is an explicit Stage 1 pass condition, and
 * `media/other-images/CAPTIONS.md` is precise about what it looks like:
 *
 *   "Zaal signage is a large orange panel with one big white numeral, set beside
 *    the auditorium entrance and reading as a colour block from down the
 *    corridor — not a small sign. Secondary wayfinding is a separate blue sign
 *    with white text and arrows, in Dutch (`uitgang zaal 6/7`, `info`)."
 *
 * So the numeral panel goes *beside* the door, as at Kinepolis, and the talk title
 * goes on a strip *above* it. Room numbers and talk titles both come from
 * `src/sim/geometry.ts` (`rooms`, `TALKS`) — never from a list typed here.
 *
 * ## Why every corridor sign faces +z
 *
 * The diorama camera is **fixed** (`src/render/camera.ts`): it stands on the +z
 * side of the plan and looks toward -z. A sign is readable only when its face
 * normal has a positive dot product with `dioramaToCamera()`, and "the player can
 * turn around" is not available to us.
 *
 * For rooms 10, 9, 8 and 7 that is free: their frontage is the corridor's far
 * wall, which faces the camera anyway. For rooms 3, 4, 5 and 6 the corridor
 * frontage faces *away*, and four numeral panels hung on it were, quite
 * literally, never once visible in play. They are therefore mounted on the
 * camera-facing return of the same panel — the sectional-model convention that
 * already cuts the near corridor wall down to a parapet (`NEAR_CUT_H`), so the
 * numeral sits in the band between that parapet and the room's own back row,
 * where nothing stands in front of it.
 *
 * The band each panel may occupy is not a taste judgement: `FAR_Y1` is bounded by
 * the corridor vault's springing line and `NEAR_Y0` by the rake of the room
 * behind it, and `tests/venue.smoke.test.ts` raycasts every panel at every
 * chapter pitch to prove both.
 *
 * ## Headless safety
 *
 * `tests/venue.smoke.test.ts` runs in node, where there is no `document`. Every
 * canvas is created through the one shared painter below, which falls back to a
 * flat coloured material when there is no DOM, so the geometry — and therefore the
 * "signage exists for all 8 Devoxx rooms" check — still builds. Textures are
 * created once per distinct sign, cached by key, and released in `dispose()`:
 * nothing here allocates a canvas per frame.
 */

import * as THREE from 'three';

import { CY0, CY1, DOOR, F1, GF, R, TALKS, rooms, roomDoor } from '../../sim/geometry';
import { T, W } from '../../sim/constants';
import type { RoomDef } from '../../sim/types';
import { PX_PER_M, m } from '../../sim/units';
import type { VenuePalette } from './materials';
import { slab } from './props';

export type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/* ------------------------------------------------------------- the painter */

/**
 * The one place a canvas is ever created. Materials are cached by key, so the
 * eight Zaal panels cost eight textures and asking for one twice costs nothing.
 */
export class SignPainter {
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly textures: THREE.Texture[] = [];
  /** False in node and in any environment without a DOM. */
  private readonly canPaint = typeof document !== 'undefined' && typeof document.createElement === 'function';

  /**
   * `glow` is the emissive intensity the baked art is re-used at.
   *
   * Half is right for a corridor lightbox. The sponsor panels take much less:
   * twelve of them at 0.5 lit chapter 2's blacked-out hall like a shop window,
   * and CAPTIONS.md is explicit that the dark hall is "near-black with red accent
   * panels and track spots". A stand on standby glows; it does not illuminate.
   */
  material(key: string, wPx: number, hPx: number, fallback: string, paint: Paint, glow = 0.5): THREE.MeshStandardMaterial {
    const hit = this.cache.get(key);
    if (hit) return hit;

    const mat = new THREE.MeshStandardMaterial({
      name: `sign/${key}`,
      color: new THREE.Color(this.canPaint ? '#ffffff' : fallback),
      roughness: 0.75,
      metalness: 0,
    });
    // Signs in a dark venue are lightboxes: the same art drives colour and glow.
    mat.emissive = new THREE.Color(this.canPaint ? '#ffffff' : fallback);
    mat.emissiveIntensity = glow;

    const tex = this.canPaint ? this.bake(wPx, hPx, paint) : null;
    if (tex) {
      mat.map = tex;
      mat.emissiveMap = tex;
      this.textures.push(tex);
    }
    this.cache.set(key, mat);
    return mat;
  }

  private bake(wPx: number, hPx: number, paint: Paint): THREE.Texture | null {
    const canvas = document.createElement('canvas');
    canvas.width = wPx;
    canvas.height = hPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    paint(ctx, wPx, hPx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const mat of this.cache.values()) mat.dispose();
    this.textures.length = 0;
    this.cache.clear();
  }
}

/* --------------------------------------------------------------- text tools */

/** Shrink a font until the text fits `maxW`. Returns the size actually used. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, weight = 700): number {
  let size = start;
  for (; size > 8; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  ctx.font = `${weight} ${size}px ${FONT}`;
  return size;
}

/** Greedy word wrap at the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A left- or right-pointing arrow block, as on the Kinepolis wayfinding signs. */
function arrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, down: boolean): void {
  const s = size / 2;
  ctx.beginPath();
  if (down) {
    ctx.moveTo(cx - s * 0.45, cy - s);
    ctx.lineTo(cx + s * 0.45, cy - s);
    ctx.lineTo(cx + s * 0.45, cy + s * 0.1);
    ctx.lineTo(cx + s, cy + s * 0.1);
    ctx.lineTo(cx, cy + s);
    ctx.lineTo(cx - s, cy + s * 0.1);
    ctx.lineTo(cx - s * 0.45, cy + s * 0.1);
  } else {
    ctx.moveTo(cx - s, cy);
    ctx.lineTo(cx - s * 0.1, cy - s);
    ctx.lineTo(cx - s * 0.1, cy - s * 0.45);
    ctx.lineTo(cx + s, cy - s * 0.45);
    ctx.lineTo(cx + s, cy + s * 0.45);
    ctx.lineTo(cx - s * 0.1, cy + s * 0.45);
    ctx.lineTo(cx - s * 0.1, cy + s);
  }
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------ sign painters */

/**
 * The big white numeral on its orange ground — `image-1790032674926.webp`.
 *
 * The numeral is drawn to fill the panel: at Kinepolis this is a colour block
 * with a figure on it that you read from the far end of the corridor, not a door
 * plate. The small `zaal` caplet under it is the only other ink.
 */
const zaalNumeral =
  (n: number | string): Paint =>
  (ctx, w, h) => {
    ctx.fillStyle = '#e1561c';
    ctx.fillRect(0, 0, w, h);
    // A slightly hotter top edge: these panels are backlit boxes, not paint.
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, 'rgba(255,255,255,0.10)');
    wash.addColorStop(0.55, 'rgba(255,255,255,0)');
    wash.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = String(n);
    // 78% of the panel height, centred a touch high so the `zaal` caplet fits
    // under it without crowding the figure.
    fitFont(ctx, label, w * 0.84, Math.round(h * 0.78), 800);
    ctx.fillText(label, w / 2, h * 0.46);

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = `600 ${Math.round(h * 0.075)}px ${FONT}`;
    ctx.fillText('zaal', w / 2, h * 0.925);
  };

const talkStrip =
  (n: number, title: string): Paint =>
  (ctx, w, h) => {
    ctx.fillStyle = '#1b1e24';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e1561c';
    ctx.fillRect(0, 0, 14, h);
    ctx.fillStyle = '#9aa0ab';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `600 ${Math.round(h * 0.2)}px ${FONT}`;
    ctx.fillText(`ZAAL ${n}`, 34, h * 0.12);
    ctx.fillStyle = '#e8e6e1';
    fitFont(ctx, title, w - 60, Math.round(h * 0.3), 700);
    const lines = wrap(ctx, title, w - 60).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, 34, h * 0.4 + i * h * 0.3));
  };

/**
 * `uitgang zaal 6/7` + `info`: white on Kinepolis blue, with arrows —
 * `image-1790032663823.webp`, and `uitgang zaal 6/7` is the string CAPTIONS.md
 * names, so it is the one that must survive to the screen.
 *
 * Both rows are sized off the *row* height rather than the panel height, and the
 * long row is shrunk to fit its column: the sign used to be laid out as if only
 * the short row existed.
 */
const wayfinding: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#1c4a96';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(14, h * 0.5);
  ctx.lineTo(w - 14, h * 0.5);
  ctx.stroke();

  const rows: Array<[string, number]> = [
    ['uitgang zaal 6/7', h * 0.28],
    ['info', h * 0.76],
  ];
  const textX = w * 0.27;
  const textW = w * 0.62;
  // One size for both rows, taken from the longest: on the real sign `info` is
  // not twice the size of `uitgang zaal 6/7`, and it looked it when each row was
  // fitted on its own.
  const longest = rows.reduce((a, b) => (a[0].length >= b[0].length ? a : b))[0];
  const size = fitFont(ctx, longest, textW, Math.round(h * 0.26), 500);
  for (const [text, cy] of rows) {
    ctx.fillStyle = '#ffffff';
    arrow(ctx, w * 0.145, cy, h * 0.3, true);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${size}px ${FONT}`;
    ctx.fillText(text, textX, cy);
  }
  ctx.font = `700 ${Math.round(h * 0.28)}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('i', w * 0.93, h * 0.76);
};

const cinemaPlate: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#262a33';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#6b7280';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'cinema', w * 0.8, Math.round(h * 0.4), 600);
  ctx.fillText('cinema', w / 2, h * 0.42);
  ctx.font = `400 ${Math.round(h * 0.16)}px ${FONT}`;
  ctx.fillText('closed tonight', w / 2, h * 0.72);
};

const entranceSign: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1c4a96';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'KINEPOLIS EVENT CENTER', w * 0.9, Math.round(h * 0.42), 800);
  ctx.fillText('KINEPOLIS EVENT CENTER', w / 2, h * 0.42);
  ctx.fillStyle = '#e1561c';
  ctx.font = `600 ${Math.round(h * 0.2)}px ${FONT}`;
  ctx.fillText('DEVOXX  ·  doors open 08:00', w / 2, h * 0.78);
};

/** The tomato-soup beat, straight off the real catering counter. */
const cateringBoard: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#20242b';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(232,230,225,0.10)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `300 ${Math.round(h * 0.5)}px ${FONT}`;
  ctx.fillText('share · celebrate · passion', w - 20, h * 0.5);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e1561c';
  ctx.font = `800 ${Math.round(h * 0.3)}px ${FONT}`;
  ctx.fillText('TOMATO SOUP', 24, h * 0.28);
  ctx.fillStyle = '#e8e6e1';
  ctx.font = `500 ${Math.round(h * 0.18)}px ${FONT}`;
  ctx.fillText('broodjes  ·  koffie  ·  the queue starts here', 24, h * 0.62);
  ctx.fillStyle = '#9aa0ab';
  ctx.font = `400 ${Math.round(h * 0.15)}px ${FONT}`;
  ctx.fillText('one ladle per robot, please', 24, h * 0.85);
};

const wifiNotice: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#1c4a96';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(h * 0.22)}px ${FONT}`;
  ctx.fillText('wifi', w / 2, h * 0.24);
  fitFont(ctx, 'DevoxxForever', w * 0.86, Math.round(h * 0.38), 800);
  ctx.fillText('DevoxxForever', w / 2, h * 0.56);
  ctx.font = `400 ${Math.round(h * 0.16)}px ${FONT}`;
  ctx.fillText('no password. no excuses.', w / 2, h * 0.84);
};

const barSign: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#1b1e24';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffc878';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'OutOfMemoryError', w * 0.88, Math.round(h * 0.4), 800);
  ctx.fillText('OutOfMemoryError', w / 2, h * 0.4);
  ctx.fillStyle = '#e8e6e1';
  ctx.font = `400 ${Math.round(h * 0.2)}px ${FONT}`;
  ctx.fillText('a heavy blonde · on tap', w / 2, h * 0.76);
};

/**
 * The wayfinding plate on the hall side of the steps — the one thing in chapter 2
 * that says the lobby is over there and how you get to it.
 *
 * Michele: *"I don't get how to enter the reception."* There IS a way in and only
 * one: the stepped threshold in the hall's right-hand wall (`GF.openings`, world y
 * 285..568). Nothing named it. Every other door in this building has a sign over
 * it; this one, the one the cable errand ends beyond, had emergency greens and
 * concrete.
 */
const receptionSign: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#1c4a96';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.fillStyle = '#ffffff';
  arrow(ctx, w * 0.12, h * 0.5, h * 0.44, false);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const size = fitFont(ctx, 'RECEPTION', w * 0.6, Math.round(h * 0.42), 700);
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillText('RECEPTION', w * 0.24, h * 0.36);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `400 ${Math.round(h * 0.22)}px ${FONT}`;
  ctx.fillText('badges  ·  wardrobe  ·  up the steps', w * 0.24, h * 0.72);
};

const poloSign: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#e1561c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'DEVOXX POLO & BADGE', w * 0.9, Math.round(h * 0.34), 800);
  ctx.fillText('DEVOXX POLO & BADGE', w / 2, h * 0.38);
  ctx.font = `500 ${Math.round(h * 0.2)}px ${FONT}`;
  ctx.fillText('pickup at breakfast', w / 2, h * 0.74);
};

/* ------------------------------------------------------------------ placing */

/**
 * A sign face. `yaw` is the plane's rotation about +Y; a `PlaneGeometry` faces +z,
 * so yaw 0 looks toward +z (down the plan), PI toward -z and -PI/2 toward -x.
 */
function signFace(
  simX: number,
  simY: number,
  wM: number,
  hM: number,
  centreY: number,
  yaw: number,
  mat: THREE.Material,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), mat);
  mesh.position.set(m(simX), centreY, m(simY));
  mesh.rotation.y = yaw;
  mesh.name = name;
  return mesh;
}

export interface SignageBuild {
  /** Signs that belong to the cinema level (parented onto the room anchors). */
  floor1: THREE.Group;
  /** Signs that belong to the exhibition level. */
  ground: THREE.Group;
  dispose(): void;
}

/* --------------------------------------------------- where a panel may stand */

/** Sim px from the doorway centre to the numeral panel's centre. */
const SIGN_OFFSET_PX = 42;
/** Numeral panel width, metres. Wider than the poster box beside it, on purpose. */
const ZAAL_W_M = 2.1;
/**
 * The far wall's panel band.
 *
 * The top is set by the corridor vault: `floor1.ts` springs it just above the
 * wall head and rakes it up steeply, so a sight line leaving the panel's top edge
 * toward the camera passes under it at every chapter pitch. Anything taller than
 * `FAR_Y1` gets its head sliced off, which is exactly what used to happen — the
 * numerals on 8, 9 and 10 lost their top third to the soffit.
 */
const FAR_Y0 = 0.3;
const FAR_Y1 = 2.6;
/**
 * The near wall's panel band.
 *
 * The bottom is set by the rake of the room the panel stands in: the back row is
 * the highest seating in the house and it sits right behind the entrance. Above
 * `NEAR_Y0` the panel is in clear air all the way to the camera.
 */
const NEAR_Y0 = 1.3;
const NEAR_Y1 = 3.5;
/** How far the panel body is let into the wall / stands proud of it, sim px. */
const BODY_BACK_PX = 7;
const BODY_PROUD_PX = 0.5;

/**
 * Corridor-facing geometry for one auditorium's frontage.
 *
 * Every field is in sim px except the two panel heights, and every face this
 * returns looks toward +z — see the module header for why that is not optional.
 */
interface Frontage {
  /** Sim y of the readable face plane. */
  faceY: number;
  /** The numeral panel's body slab, as a sim-y span. */
  bodyY: number;
  bodyH: number;
  /** The band the numeral face occupies, world metres. */
  y0: number;
  y1: number;
  /** Centre height of the talk strip. */
  stripY: number;
}

function corridorFace(r: RoomDef): Frontage {
  return r.side < 0
    ? {
        faceY: CY0 + BODY_PROUD_PX + 0.4,
        bodyY: CY0 - BODY_BACK_PX,
        bodyH: BODY_BACK_PX + BODY_PROUD_PX,
        y0: FAR_Y0,
        y1: FAR_Y1,
        stripY: 2.14,
      }
    : {
        // The camera-facing return of the panel, one wall thickness past the
        // corridor's near face — see the module header.
        faceY: CY1 + BODY_BACK_PX + 0.4,
        bodyY: CY1 - BODY_PROUD_PX,
        bodyH: BODY_BACK_PX + BODY_PROUD_PX,
        y0: NEAR_Y0,
        y1: NEAR_Y1,
        stripY: 1.6,
      };
}

/**
 * Which side of its doorway a room's numeral panel hangs on: +1 is further along
 * the corridor, -1 is back toward the fire door.
 *
 * Room 7's door opens straight onto the main staircase head, and a panel 42 px
 * further along sat *inside* the stair opening with the tensile canopy cones in
 * front of it — roughly 95% hidden. Which is a joke, because room 7's numeral
 * beside that staircase is the single most recognisable image the venue has.
 */
function zaalSignSide(r: RoomDef): 1 | -1 {
  const s = F1.mainStair;
  const ahead = roomDoor(r).cx + SIGN_OFFSET_PX + (ZAAL_W_M * PX_PER_M) / 2;
  return ahead > s.x - 12 ? -1 : 1;
}

/** Where the backlit poster box goes: always the other side of the door. */
export function zaalPosterX(n: number): number {
  const r = R(n);
  return roomDoor(r).cx - zaalSignSide(r) * (DOOR / 2 + 20);
}

/**
 * Build every sign in the venue.
 *
 * Room signage is `attach`ed to the room anchors from `buildFloor1`, which is what
 * those anchors are for: another piece can move or light a room's frontage without
 * re-deriving a single coordinate.
 */
export function buildSignage(
  p: VenuePalette,
  roomAnchors: Map<number | string, THREE.Object3D>,
  /**
   * The shared canvas painter. `buildGround` prints the twelve sponsor stands
   * from the same cache and the same `dispose()`, so passing one in is what stops
   * the venue owning two texture pools — see `index.ts`.
   */
  painter: SignPainter,
): SignageBuild {
  const floor1 = new THREE.Group();
  floor1.name = 'signage-floor1';
  const ground = new THREE.Group();
  ground.name = 'signage-ground';

  for (const r of rooms) {
    const d = roomDoor(r);
    const f = corridorFace(r);
    const anchor = roomAnchors.get(r.n);
    const host = anchor ?? floor1;

    if (r.closed) {
      const plate = signFace(d.cx + 36, f.faceY, 1.2, 0.8, Math.max(1.5, f.y0 + 0.4), 0, painter.material('cinema-plate', 256, 160, '#262a33', cinemaPlate), `cinema-sign-${r.n}`);
      host.attach(plate);
      continue;
    }

    // The large orange numeral panel, beside the entrance: a colour block first,
    // a numeral second, exactly as the corridor reads at Kinepolis.
    const panelX = d.cx + zaalSignSide(r) * SIGN_OFFSET_PX;
    const panelH = f.y1 - f.y0;
    const panel = new THREE.Group();
    panel.name = `zaal-sign-${r.n}`;
    // The body is a solid orange block, wider and taller than the backlit poster
    // box across the door from it. At Kinepolis the numeral panel is the dominant
    // colour mass on the wall; ours used to lose that contest to a blank poster.
    const bodyPx = ZAAL_W_M * PX_PER_M + 4;
    panel.add(
      slab({ x: panelX - bodyPx / 2, y: f.bodyY, w: bodyPx, h: f.bodyH }, 0, f.y1 + 0.12, p.signOrange),
    );
    panel.add(
      signFace(
        panelX,
        f.faceY,
        ZAAL_W_M,
        panelH,
        (f.y0 + f.y1) / 2,
        0,
        painter.material(
          `zaal-${r.n}`,
          320,
          Math.round((320 * panelH) / ZAAL_W_M),
          '#e1561c',
          zaalNumeral(r.n),
        ),
        `zaal-face-${r.n}`,
      ),
    );
    // Re-origin the group onto the sign point itself, so another piece can read
    // `zaal-sign-7`'s world position and aim a spotlight at it.
    const origin = new THREE.Vector3(m(panelX), 0, m(f.faceY));
    for (const child of panel.children) child.position.sub(origin);
    panel.position.copy(origin);
    host.attach(panel);

    // The talk strip beside the door. Room 8 is the keynote; the speaker is TBA
    // until Devoxx announces one, which is also the joke.
    const title = typeof r.n === 'number' && r.n in TALKS ? TALKS[r.n] : 'KEYNOTE — speaker TBA';
    const strip = signFace(
      d.cx,
      f.faceY,
      3.2,
      0.55,
      f.stripY,
      0,
      painter.material(`talk-${r.n}`, 768, 132, '#1b1e24', talkStrip(Number(r.n), title)),
      `talk-sign-${r.n}`,
    );
    host.attach(strip);
  }

  // Blue Dutch wayfinding on the corridor's approach to rooms 6 and 7 — the sign
  // the drone footage actually shows, and the one CAPTIONS.md names by its text.
  //
  // One on each side of the corridor, both on the camera-facing plane their side
  // offers: the copy of it hung on the near wall's corridor face was turned away
  // from the only camera the game has, so `uitgang zaal 6/7` was never on screen.
  for (const side of [-1, 1] as const) {
    const near = side > 0;
    floor1.add(
      signFace(
        // Clear of the corridor columns, which stand on the room party walls: the
        // far copy used to sit right behind the 5|6 column.
        1500,
        near ? CY1 + BODY_BACK_PX + 0.4 : CY0 + BODY_PROUD_PX + 0.4,
        2.4,
        1.45,
        near ? 2.55 : 1.9,
        0,
        painter.material('wayfinding', 640, 387, '#1c4a96', wayfinding),
        `wayfinding-${near ? 'bottom' : 'top'}`,
      ),
    );
  }

  // The foyer bar, and the one beer joke the brief asks for.
  const f = F1.foyer;
  floor1.add(
    signFace(
      f.x + 55,
      f.y + f.h - 1,
      2.4,
      0.62,
      1.85,
      Math.PI,
      painter.material('bar', 640, 165, '#1b1e24', barSign),
      'bar-sign',
    ),
  );

  /* ------------------------------------------------------------- ground floor */

  ground.add(
    signFace(
      W - T - 3,
      GF.entrance.y + GF.entrance.h / 2,
      3.2,
      0.86,
      2.55,
      -Math.PI / 2,
      painter.material('entrance', 1024, 276, '#f4f4f2', entranceSign),
      'entrance-sign',
    ),
  );

  const court = GF.food.court;
  ground.add(
    signFace(
      court.x + court.w / 2,
      court.y + 0.4,
      4.6,
      1.15,
      1.72,
      0,
      painter.material('catering', 1024, 256, '#20242b', cateringBoard),
      'catering-board',
    ),
  );

  ground.add(
    signFace(
      GF.reception.x + 42,
      GF.reception.y - 17,
      1.7,
      0.58,
      1.95,
      0,
      painter.material('wifi', 512, 175, '#1c4a96', wifiNotice),
      'wifi-sign',
    ),
  );

  /*
   * "RECEPTION >" over the steps, on the south face of the concrete that closes
   * the hall's right edge above them.
   *
   * That face is the one the diorama camera looks at (yaw 0, +z), and it stands
   * directly over the head of the threshold — so from anywhere in the hall the
   * sign and the way through are the same object. The concrete block runs to
   * `GF.openings[0][0]`, which is the top step, so the plate is hung just inside
   * its own footprint rather than floating in the doorway.
   */
  ground.add(
    signFace(
      GF.concreteWall.x + GF.concreteWall.w / 2,
      GF.concreteWall.y + GF.concreteWall.h + 1,
      3.0,
      0.8,
      2.35,
      0,
      painter.material('reception-way', 768, 205, '#1c4a96', receptionSign),
      'reception-wayfinding',
    ),
  );

  ground.add(
    signFace(
      GF.store.x - T - 2,
      GF.store.y + GF.store.h / 2,
      2.6,
      0.7,
      2.05,
      -Math.PI / 2,
      painter.material('polo', 768, 207, '#e1561c', poloSign),
      'polo-sign',
    ),
  );

  return { floor1, ground, dispose: () => painter.dispose() };
}

/**
 * The corridor x of a Devoxx room's numeral panel, in sim pixels.
 *
 * Exported so a spotlight or a camera framing pass can aim at a sign without
 * re-deriving where signage chose to hang it.
 */
export function zaalSignX(n: number): number {
  const r = R(n);
  return roomDoor(r).cx + zaalSignSide(r) * SIGN_OFFSET_PX;
}

/* ======================================================= sponsor stand art ==

 * Michele, tonight: *"Polishing the graphic, making people and stands real etc."*
 *
 * Before this the twelve sponsors existed only as `SPONSORS` in
 * `src/sim/geometry.ts` — the names were in the sim, used for the "why am I
 * blocked" lines, and they were on screen nowhere at all. A trade-show floor with
 * no sponsor names on it is not a trade-show floor, it is twelve boxes.
 *
 * `media/other-images/image-1790032637969.webp` and `-650288.webp` are the brief:
 * what you read from across that hall is a **big flat panel of one brand colour
 * with the name on it**, plus a slim lit totem out in the lane. Everything else —
 * the counters, the white tub chairs, the black metal high tables — is furniture
 * you only resolve up close.
 *
 * The art lives here rather than in `ground.ts` because this module is where the
 * venue's lettering is drawn, and it already owns the one canvas painter and its
 * texture cache. `ground.ts` says where a panel hangs; this says what is on it.
 */

/** One sponsor's identity: the brand colour, what it is legible in, and the gag. */
export interface BoothScheme {
  /** The panel ground. */
  readonly brand: string;
  /** Text on `brand`. */
  readonly ink: string;
  /** Strapline under the name. Devoxx-flavoured, nothing that needs permission. */
  readonly strap: string;
}

/**
 * Twelve schemes, in `SPONSORS` order — which is `row * 4 + col`, so a booth's
 * scheme is a pure function of its plan position and a screenshot is reproducible.
 * That is the whole of the "deterministic per booth" requirement: no RNG here.
 */
export const BOOTH_SCHEMES: readonly BoothScheme[] = Object.freeze([
  { brand: '#2f6ae0', ink: '#ffffff', strap: 'boils your cluster dry' },
  { brand: '#6f4a2d', ink: '#f3e2c7', strap: 'since 1995 · still serializable' },
  { brand: '#14798b', ink: '#ffffff', strap: 'your money, eventually consistent' },
  { brand: '#f2bf18', ink: '#2a2413', strap: 'tell it your bug · it never blinks' },
  { brand: '#141a14', ink: '#d8b64a', strap: 'COBOL support since before you' },
  { brand: '#3b3f4a', ink: '#dfe3ea', strap: 'one deployable · one' },
  { brand: '#1b3a6b', ink: '#ffffff', strap: 'we cover what you did not check' },
  { brand: '#2f7fd0', ink: '#ffffff', strap: 'your flight will resolve shortly' },
  { brand: '#c4507f', ink: '#ffffff', strap: 'everything is a crumb, then a loaf' },
  { brand: '#e0328c', ink: '#ffffff', strap: 'laptop real estate · free' },
  { brand: '#b81f28', ink: '#ffffff', strap: '/^(a+)+$/ — do not run this' },
  { brand: '#4a2c18', ink: '#f0d9b8', strap: 'the queue starts here' },
]);

/** A backlit-panel wash: hotter along the top edge, shadowed at the bottom. */
function lightbox(ctx: CanvasRenderingContext2D, w: number, h: number, ground: string): void {
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, 'rgba(255,255,255,0.14)');
  wash.addColorStop(0.5, 'rgba(255,255,255,0)');
  wash.addColorStop(1, 'rgba(0,0,0,0.20)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
}

/**
 * The big branded back wall of a built stand: the sponsor's name across it, the
 * gag under the name, and a Devoxx caplet in the corner.
 *
 * The name is sized to the PANEL, not to a font list — `Sticker Mine` and
 * `NullPointer Insurance` are the same height on the wall, which is what a real
 * stand build does and what makes twelve of them read as one hall.
 */
export const sponsorPanel =
  (name: string, s: BoothScheme): Paint =>
  (ctx, w, h) => {
    lightbox(ctx, w, h, s.brand);

    // A soft brand-lighter blob behind the name: every one of these walls in the
    // drone footage has some graphic on it, and a flat field reads as a painted
    // board rather than as a printed one.
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = s.ink;
    ctx.beginPath();
    ctx.ellipse(w * 0.82, h * 0.30, w * 0.26, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = s.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const size = fitFont(ctx, name, w * 0.86, Math.round(h * 0.26), 800);
    ctx.fillText(name, w * 0.07, h * 0.42);

    ctx.globalAlpha = 0.82;
    ctx.font = `500 ${Math.round(size * 0.34)}px ${FONT}`;
    ctx.fillText(s.strap, w * 0.07, h * 0.62);
    ctx.globalAlpha = 1;

    // The rule and the Devoxx caplet: the mark every stand at the show carries.
    ctx.fillStyle = s.ink;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(w * 0.07, h * 0.74, w * 0.86, Math.max(2, h * 0.006));
    ctx.globalAlpha = 1;
    ctx.font = `700 ${Math.round(h * 0.075)}px ${FONT}`;
    ctx.fillText('DEVOXX BELGIUM', w * 0.07, h * 0.84);
  };

/**
 * The slim lit pylon standing in the lane beside a built stand.
 *
 * `image-1790032607096.webp` is full of these: a two-metre portrait lightbox is
 * what you actually read at head height in a crowded hall, because the back walls
 * are behind people. It is `boothTotem()` in the sim and has been a collider since
 * the "this cube is walk-through" round; all that changes here is that it now says
 * whose it is.
 */
export const sponsorTotem =
  (name: string, s: BoothScheme): Paint =>
  (ctx, w, h) => {
    lightbox(ctx, w, h, s.brand);
    ctx.fillStyle = s.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, name, w * 0.86, Math.round(h * 0.12), 800);
    const lines = wrap(ctx, name, w * 0.86).slice(0, 3);
    const step = h * 0.115;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.34 + (i - (lines.length - 1) / 2) * step));
    ctx.globalAlpha = 0.3;
    ctx.fillRect(w * 0.22, h * 0.52, w * 0.56, Math.max(2, h * 0.004));
    ctx.globalAlpha = 1;
    ctx.font = `600 ${Math.round(h * 0.045)}px ${FONT}`;
    ctx.fillText('DEVOXX', w / 2, h * 0.6);
  };

/**
 * The printed valance across the front of a draped half table.
 *
 * Small type, read from the lane, and it carries the strapline rather than the
 * name: the name is already on the roll-up banner standing on the same table, and
 * saying it twice at two scales is what a stand builder charges you extra for.
 */
export const sponsorSkirt =
  (s: BoothScheme): Paint =>
  (ctx, w, h) => {
    lightbox(ctx, w, h, s.brand);
    ctx.fillStyle = s.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, s.strap, w * 0.8, Math.round(h * 0.44), 600);
    ctx.fillText(s.strap, w / 2, h * 0.52);
  };
