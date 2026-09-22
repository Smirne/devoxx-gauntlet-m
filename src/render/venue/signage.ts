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

import { CY0, CY1, F1, GF, R, TALKS, rooms, roomDoor } from '../../sim/geometry';
import { T, W } from '../../sim/constants';
import type { RoomDef } from '../../sim/types';
import { m } from '../../sim/units';
import type { VenuePalette } from './materials';
import { slab } from './props';

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/* ------------------------------------------------------------- the painter */

/**
 * The one place a canvas is ever created. Materials are cached by key, so the
 * eight Zaal panels cost eight textures and asking for one twice costs nothing.
 */
class SignPainter {
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly textures: THREE.Texture[] = [];
  /** False in node and in any environment without a DOM. */
  private readonly canPaint = typeof document !== 'undefined' && typeof document.createElement === 'function';

  material(key: string, wPx: number, hPx: number, fallback: string, paint: Paint): THREE.MeshStandardMaterial {
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
    mat.emissiveIntensity = 0.5;

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

const zaalNumeral =
  (n: number | string): Paint =>
  (ctx, w, h) => {
    ctx.fillStyle = '#e1561c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = String(n);
    fitFont(ctx, label, w * 0.8, Math.round(h * 0.72), 800);
    ctx.fillText(label, w / 2, h * 0.52);
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

/** `uitgang zaal 6/7` + `info`: white on Kinepolis blue, with arrows. */
const wayfinding: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#1c4a96';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = '#ffffff';
  arrow(ctx, w * 0.16, h * 0.32, h * 0.32, true);
  arrow(ctx, w * 0.16, h * 0.72, h * 0.32, true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(h * 0.22)}px ${FONT}`;
  ctx.fillText('uitgang zaal 6/7', w * 0.3, h * 0.32);
  ctx.fillText('info', w * 0.3, h * 0.72);
  ctx.font = `700 ${Math.round(h * 0.3)}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('i', w * 0.94, h * 0.72);
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

const poloSign: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#e1561c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'DEVOXX POLO & BADGE', w * 0.9, Math.round(h * 0.34), 800);
  ctx.fillText('DEVOXX POLO & BADGE', w / 2, h * 0.38);
  ctx.font = `500 ${Math.round(h * 0.2)}px ${FONT}`;
  ctx.fillText('pickup during lunch', w / 2, h * 0.74);
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

/**
 * Corridor-facing geometry for one auditorium's wall: where a flat sign face sits,
 * where the flush-mounted numeral panel's slab sits, and which way both look.
 */
function corridorFace(r: RoomDef): { faceY: number; panelY: number; panelH: number; yaw: number } {
  return r.side < 0
    ? { faceY: CY0 + 0.4, panelY: CY0 - 4, panelH: 4.2, yaw: 0 }
    : { faceY: CY1 - 0.4, panelY: CY1 - 0.2, panelH: 4.2, yaw: Math.PI };
}

/**
 * Build every sign in the venue.
 *
 * Room signage is `attach`ed to the room anchors from `buildFloor1`, which is what
 * those anchors are for: another piece can move or light a room's frontage without
 * re-deriving a single coordinate.
 */
export function buildSignage(p: VenuePalette, roomAnchors: Map<number | string, THREE.Object3D>): SignageBuild {
  const painter = new SignPainter();
  const floor1 = new THREE.Group();
  floor1.name = 'signage-floor1';
  const ground = new THREE.Group();
  ground.name = 'signage-ground';

  for (const r of rooms) {
    const d = roomDoor(r);
    const { faceY, panelY, panelH, yaw } = corridorFace(r);
    const anchor = roomAnchors.get(r.n);
    const host = anchor ?? floor1;

    if (r.closed) {
      const plate = signFace(d.cx + 36, faceY, 1.2, 0.8, 1.5, yaw, painter.material('cinema-plate', 256, 160, '#262a33', cinemaPlate), `cinema-sign-${r.n}`);
      host.attach(plate);
      continue;
    }

    // The large orange numeral panel, beside the entrance: a colour block first,
    // a numeral second, exactly as the corridor reads at Kinepolis.
    const panelX = d.cx + 40;
    const panel = new THREE.Group();
    panel.name = `zaal-sign-${r.n}`;
    // Bigger than the backlit poster box beside it, as at Kinepolis: the numeral
    // panel is the thing that reads as a colour block from down the corridor, and
    // it used to render SMALLER than a plain poster — the reverse of the photo.
    panel.add(slab({ x: panelX - 12, y: panelY, w: 24, h: panelH }, 0.3, 2.7, p.signOrange));
    panel.add(
      signFace(
        panelX,
        faceY,
        1.9,
        2.55,
        1.6,
        yaw,
        painter.material(`zaal-${r.n}`, 256, 352, '#e1561c', zaalNumeral(r.n)),
        `zaal-face-${r.n}`,
      ),
    );
    // Re-origin the group onto the sign point itself, so another piece can read
    // `zaal-sign-7`'s world position and aim a spotlight at it.
    const origin = new THREE.Vector3(m(panelX), 0, m(faceY));
    for (const child of panel.children) child.position.sub(origin);
    panel.position.copy(origin);
    host.attach(panel);

    // The talk strip above the door. Room 8 is the keynote; the speaker is TBA
    // until Devoxx announces one, which is also the joke.
    const title = typeof r.n === 'number' && r.n in TALKS ? TALKS[r.n] : 'KEYNOTE — speaker TBA';
    const strip = signFace(
      d.cx,
      faceY,
      3.2,
      0.55,
      2.14,
      yaw,
      painter.material(`talk-${r.n}`, 768, 132, '#1b1e24', talkStrip(Number(r.n), title)),
      `talk-sign-${r.n}`,
    );
    host.attach(strip);
  }

  // Blue Dutch wayfinding, on both corridor walls just before rooms 6 and 7 —
  // the sign the drone footage actually shows.
  for (const side of [-1, 1] as const) {
    const y = side < 0 ? CY0 + 0.4 : CY1 - 0.4;
    floor1.add(
      signFace(
        1560,
        y,
        2.3,
        1.25,
        1.72,
        side < 0 ? 0 : Math.PI,
        painter.material('wayfinding', 640, 348, '#1c4a96', wayfinding),
        `wayfinding-${side < 0 ? 'top' : 'bottom'}`,
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

  return {
    floor1,
    ground,
    dispose: () => painter.dispose(),
  };
}

/**
 * The corridor x of a Devoxx room's numeral panel, in sim pixels.
 *
 * Exported so a spotlight or a camera framing pass can aim at a sign without
 * re-deriving where signage chose to hang it.
 */
export function zaalSignX(n: number): number {
  return roomDoor(R(n)).cx + 40;
}
