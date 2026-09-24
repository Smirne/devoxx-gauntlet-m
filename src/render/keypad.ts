/**
 * keypad.ts — where chapter 1's fire-door keypad is DRAWN.
 *
 * ## Why this is its own module
 *
 * Michele, with a screenshot of Voxxy lit by her own beam beside the fire door:
 * *"the keypad also needs a shape. Big numbers?"* He was looking at
 * `PROPS.keypad = { h: 1.25, color: 0x2c3340, tl: true }` in `scene.ts`, drawn by
 * the generic `drawProp` as one box — a flat dark slab with nothing on it, which
 * is the single most important interactive object in the chapter and the whole
 * point of the four-digit hunt. It even carried a live label already:
 * `ch1-night.ts` publishes `label: entered.padEnd(4, '_')`, and nothing drew it.
 *
 * So the keypad stops being a table entry, the way the fire door and the roller
 * door did before it. Same contract as `src/render/fire-door.ts`: the sim owns
 * every bit of state — the rect, the digits typed so far, whether the magnetic
 * lock has let go — and this module owns nothing but what those look like.
 *
 * ## Which way it faces, and why that is not a choice
 *
 * `src/render/venue/signage.ts` explains it for the Zaal panels and the same rule
 * governs here: the diorama camera is fixed on the +z side of the plan
 * (`src/render/camera.ts`), so a face is readable exactly when its normal has a
 * positive dot product with `dioramaToCamera()`, and "the player can turn around"
 * is not available to us. At chapter 1's 30 deg pitch that vector is
 * `(0.210, 0.500, 0.840)`: a **+z face is nearly square on, a +x face is 12 deg
 * off grazing, and a -x face is drawn from behind.** The unit's readable front
 * therefore always looks +z, whatever the rect's proportions, and the readout and
 * the keys go on it.
 *
 * ## What it is worth knowing before reading the layout numbers
 *
 * Play zoom in chapter 1 is a 320 x 235 px window (`FOCUS` in `scene.ts`), which
 * measures **about 50 px per metre along the screen's own right**, 44 px/m
 * vertically and 28 px/m along world z. Four digits across a 1.45 m window are
 * therefore ~16 px each and read; the same four across 0.5 m would be 5 px and
 * would not. That is the whole reason the readout takes the full width of the
 * unit and the key grid is allowed to be small — Michele's *"big numbers"*, taken
 * literally, and `docs/scale-and-units.md`'s rule that a metre is a metre.
 *
 * ## The shape the published rect gives us
 *
 * The rect `ch1-night.ts` publishes today is `{ x: F1.fireX - 8, y: CY0 + 8,
 * w: 8, h: 24 }` — 0.64 m of width and **1.92 m of depth**, standing along the
 * fire door's own face. Measured in the running build (magenta-prop probe,
 * chapter 1, play zoom, 1600x987), that leaves **760 visible pixels**: the unit
 * runs away from the camera rather than across it, and the fire screen beside it
 * is 2.45 m tall, which at this pitch hides everything within 0.5 m of the door
 * below 2.45 m. Turning the same 1.92 m to run ALONG the corridor instead — the
 * patch handed up with this round — gives the same collider area a front the
 * camera can see. This module is written to read the rect rather than to assume
 * either, so it is correct before and after: `unitFront` below is whichever of
 * the rect's two dimensions faces the camera.
 */

import * as THREE from 'three';

import type { Prop } from '../sim/types';
import { m } from '../sim/units';
import { SignPainter, type Paint } from './venue/signage';

/* ------------------------------------------------------------------ layout */

/** The dark recessed foot the unit stands on: its shadow gap off the floor. */
const PLINTH_H = 0.12;
/** The mounting plate's top, metres. It stands a little above the housing. */
const PLATE_TOP = 1.72;
/** The housing's band on the plate. Keys land inside Voxxy's 1.15 m reach. */
const CASE_Y0 = 0.55;
const CASE_Y1 = 1.58;
/** The plate's own thickness, and how far it is held off the wall behind it. */
const PLATE_D = 0.2;
const PLATE_GAP = 0.05;
/** How far the housing stands proud of the plate. */
const CASE_D = 0.26;
/** Margin between the housing and the ends of the plate. */
const CASE_INSET = 0.1;

/** The readout window: the part that has to read at play zoom. */
const READ_H = 0.3;
const READ_TOP = 1.44;
/** Fraction of the unit's width the readout is allowed, and its ceiling. */
const READ_W_FRAC = 0.76;
const READ_W_MAX = 1.45;

/** The key field, which is allowed to be small — see the module header. */
const KEYS_H = 0.4;
const KEYS_Y0 = 0.66;
const KEYS_W_FRAC = 0.44;
const KEYS_W_MAX = 0.66;

/** The status lamp beside the keys. */
const LAMP_R = 0.045;

/**
 * The unit's overall height, metres — what `tests/prop-geometry.ts` records for
 * this kind, and therefore what the collider sweep measures it as.
 *
 * It is taller than the 1.25 m the `PROPS` table used to claim, and that costs
 * nothing: the sweep's question is which floor cells a drawn solid stands in, and
 * the footprint is the sim's own rect either way. What the extra height buys is
 * the readout at 1.14..1.44 m — above Voxxy's 1.15 m head rather than behind it.
 */
export const KEYPAD_TOP_M = PLATE_TOP;

/* ------------------------------------------------------------------- art */

const AMBER = '#ffae2e';
const AMBER_DIM = 'rgba(255,174,46,0.13)';
const GREEN = '#54e08a';
const GREEN_DIM = 'rgba(84,224,138,0.15)';

/**
 * One seven-segment cell.
 *
 * Seven segments rather than a font, and not for nostalgia: at play zoom a digit
 * cell is about 16 x 26 px, and a 2 px bar glyph survives that where a 700-weight
 * Helvetica numeral turns to porridge. The unlit segments are drawn as ghosts, so
 * an empty slot still reads as a slot waiting for a digit rather than as a hole —
 * which is exactly what `label` says when it pads with '_'.
 */
const SEGMENTS: Readonly<Record<string, string>> = Object.freeze({
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'afgbcd',
});

const digitCell =
  (ch: string, done: boolean): Paint =>
  (ctx, w, h) => {
    ctx.fillStyle = '#080a0d';
    ctx.fillRect(0, 0, w, h);
    // A glass window is never dead flat: a shallow vertical wash sells the recess.
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, 'rgba(255,255,255,0.07)');
    wash.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    const on = SEGMENTS[ch] ?? '';
    const pad = w * 0.2;
    const x0 = pad;
    const x1 = w - pad;
    const y0 = h * 0.16;
    const y1 = h * 0.5;
    const y2 = h * 0.84;
    const t = Math.max(3, w * 0.15);

    const bar = (x: number, y: number, len: number, vertical: boolean, lit: boolean): void => {
      ctx.fillStyle = lit ? (done ? GREEN : AMBER) : done ? GREEN_DIM : AMBER_DIM;
      if (vertical) ctx.fillRect(x - t / 2, y, t, len);
      else ctx.fillRect(x, y - t / 2, len, t);
    };
    const wSeg = x1 - x0;
    const hSeg = y1 - y0;
    bar(x0, y0, wSeg, false, on.includes('a'));
    bar(x1, y0, hSeg, true, on.includes('b'));
    bar(x1, y1, hSeg, true, on.includes('c'));
    bar(x0, y2, wSeg, false, on.includes('d'));
    bar(x0, y1, hSeg, true, on.includes('e'));
    bar(x0, y0, hSeg, true, on.includes('f'));
    bar(x0, y1, wSeg, false, on.includes('g'));
  };

/**
 * The 3x4 key grid, painted rather than modelled.
 *
 * Twelve key caps at this zoom are 9 x 5 px each; as geometry they are noise, and
 * as paint with their own bevel highlight they read as keys. "Readable at the
 * game's zoom beats accurate in close-up" is the standing call, and this is the
 * place it applies hardest.
 *
 * The top row and the bottom corners are drawn DEAD, and that is documentation
 * rather than decoration. `ch1-night.ts` takes 4 to 9 and nothing else — 1, 2 and
 * 3 select a robot everywhere in this game, which is the bug Michele filed twice
 * (*"I don't seem to be able to activate it. imanaged with biggy"*) and the reason
 * the code generator will not use them. A pad whose 1-2-3 row is visibly out of
 * service says that before the player has to be told.
 */
const keyGrid: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#14171c';
  ctx.fillRect(0, 0, w, h);

  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['⌫', '0', '↵'],
  ];
  const live = new Set(['4', '5', '6', '7', '8', '9', '⌫']);
  const padX = w * 0.06;
  const padY = h * 0.05;
  const cw = (w - padX * 2) / 3;
  const chh = (h - padY * 2) / 4;
  const gap = Math.max(2, cw * 0.09);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 3; c++) {
      const label = rows[r][c];
      const dead = !live.has(label);
      const x = padX + c * cw + gap / 2;
      const y = padY + r * chh + gap / 2;
      const kw = cw - gap;
      const kh = chh - gap;
      ctx.fillStyle = dead ? '#1b1f26' : '#39414d';
      ctx.fillRect(x, y, kw, kh);
      // A painted bevel: light along the top and left, shadow along the bottom.
      ctx.fillStyle = dead ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.16)';
      ctx.fillRect(x, y, kw, Math.max(2, kh * 0.13));
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x, y + kh - Math.max(2, kh * 0.13), kw, Math.max(2, kh * 0.13));
      ctx.fillStyle = dead ? 'rgba(220,226,236,0.22)' : '#e8ecf3';
      ctx.font = `700 ${Math.round(kh * 0.52)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      ctx.fillText(label, x + kw / 2, y + kh * 0.54);
    }
  }
};

/** The engraved strip under the readout. Dutch, because the building is. */
const padLabel: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#1b1f26';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#8f98a6';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(h * 0.52)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillText('NOODDEUR · CODE', w * 0.05, h * 0.5);
};

/* ----------------------------------------------------------------- the model */

export interface KeypadModel {
  /** Parent this into the scene once; `pose` moves it. */
  root: THREE.Group;
  /**
   * Put the unit where this frame's prop says it is, and show what it says.
   * `base` is the floor height under the prop, in metres.
   */
  pose(p: Prop, base: number): void;
  dispose(): void;
}

/** Where the unit's readable front sits, and how wide it is, from the sim rect. */
function unitFront(p: Prop): { cx: number; frontZ: number; width: number; depth: number } {
  const w = m(p.w ?? 8);
  const d = m(p.h ?? 8);
  return { cx: m(p.x ?? 0) + w / 2, frontZ: m(p.y ?? 0) + d, width: w, depth: d };
}

const box = (mat: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/**
 * Build the keypad once. Pose it every frame from the chapter's own prop.
 *
 * It owns its canvas painter rather than borrowing the venue's, because it is a
 * chapter prop and the venue is torn down on its own schedule; `dispose()` here
 * releases every texture it baked.
 */
export function buildKeypad(): KeypadModel {
  const painter = new SignPainter();
  const root = new THREE.Group();
  root.name = 'keypad-live';

  const shell = new THREE.MeshStandardMaterial({ name: 'keypad/shell', color: 0x39414d, roughness: 0.55, metalness: 0.3 });
  const plate = new THREE.MeshStandardMaterial({ name: 'keypad/plate', color: 0x232830, roughness: 0.7, metalness: 0.15 });
  const foot = new THREE.MeshStandardMaterial({ name: 'keypad/foot', color: 0x0b0d11, roughness: 1 });
  const trim = new THREE.MeshStandardMaterial({ name: 'keypad/trim', color: 0xa7aeb9, roughness: 0.32, metalness: 0.75 });
  const lampMat = new THREE.MeshStandardMaterial({ name: 'keypad/lamp', color: 0x2a2f38, roughness: 0.4 });
  lampMat.emissive = new THREE.Color(0xd8452f);
  lampMat.emissiveIntensity = 1.4;
  lampMat.toneMapped = false;
  /*
   * A STANDBY GLOW ON THE BEZEL, for the reason `PROPS['projector-panel']` and
   * `PROPS.terminal` carry one in `scene.ts`: the thing the player is looking FOR
   * is by definition still idle, and chapter 1 is a blackout. Measured in the
   * running build, an unlit housing in that corridor is a silhouette until a robot
   * happens to point a lamp at it — Michele has filed *"there should be something
   * visible"* against exactly this failure twice, on two other props. The lock is
   * powered (it is a MAGNETIC lock; that is the whole fiction), so its own trim
   * having current in it is the honest reading as well as the findable one.
   */
  trim.emissive = new THREE.Color(0x4a3a18);
  trim.emissiveIntensity = 0.6;
  trim.toneMapped = false;
  shell.emissive = new THREE.Color(0x12171e);
  shell.emissiveIntensity = 1;
  const owned: THREE.Material[] = [shell, plate, foot, trim, lampMat];

  const plinth = box(foot);
  const backPlate = box(plate);
  const housing = box(shell);
  /** The hood over the housing's face: the bevel that stops it being a box. */
  const hood = box(trim);
  /** The recessed window the digits sit in, and the trim frame round it. */
  const readFrame = box(trim);
  const readWell = box(foot);
  const keyFrame = box(trim);
  const keyField = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plate);
  const labelPlate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plate);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), lampMat);
  lamp.rotation.x = Math.PI / 2;

  /** Four digit cells. Each one's material is swapped for the character it shows. */
  const cells: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const cell = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plate);
    cell.name = `keypad-digit-${i}`;
    cells.push(cell);
  }

  root.add(plinth, backPlate, housing, hood, readFrame, readWell, keyFrame, keyField, labelPlate, lamp, ...cells);

  const cellMat = (ch: string, done: boolean): THREE.Material =>
    painter.material(`pad-cell-${ch}-${done ? 'g' : 'a'}`, 96, 152, '#0a0d11', digitCell(ch, done), 1.35);

  function pose(p: Prop, base: number): void {
    const u = unitFront(p);
    const w = u.width;
    const d = u.depth;
    // The housing sits at the FRONT of the footprint and the plate behind it, so
    // a rect that is deeper than it is wide reads as a unit on a plinth rather
    // than as a metre and a half of cabinet running away from the lens.
    const plateD = Math.min(PLATE_D, d * 0.45);
    const caseD = Math.min(CASE_D, Math.max(0.12, d - plateD));
    const backZ = u.frontZ - d + PLATE_GAP;
    const caseFrontZ = u.frontZ - 0.01;
    const caseBackZ = caseFrontZ - caseD;

    const place = (mesh: THREE.Mesh, cx: number, y0: number, y1: number, z0: number, z1: number, wide: number): void => {
      mesh.scale.set(Math.max(wide, 0.01), Math.max(y1 - y0, 0.01), Math.max(z1 - z0, 0.005));
      mesh.position.set(cx, base + (y0 + y1) / 2, (z0 + z1) / 2);
    };

    place(plinth, u.cx, 0, PLINTH_H, u.frontZ - d, u.frontZ, w);
    place(backPlate, u.cx, PLINTH_H, PLATE_TOP, backZ, backZ + plateD, w);

    const caseW = Math.max(w - CASE_INSET * 2, w * 0.55);
    place(housing, u.cx, CASE_Y0, CASE_Y1, caseBackZ, caseFrontZ, caseW);
    // The hood: a shallow stainless cap standing proud of the face, so the top of
    // the unit is an edge rather than a lid.
    place(hood, u.cx, CASE_Y1, CASE_Y1 + 0.06, caseBackZ, caseFrontZ + 0.035, caseW + 0.05);

    // --- the readout, which gets the space
    const readW = Math.min(caseW * READ_W_FRAC, READ_W_MAX);
    place(readFrame, u.cx, READ_TOP - READ_H - 0.035, READ_TOP + 0.035, caseFrontZ - 0.02, caseFrontZ + 0.015, readW + 0.07);
    place(readWell, u.cx, READ_TOP - READ_H, READ_TOP, caseFrontZ - 0.01, caseFrontZ + 0.012, readW);

    const cellW = readW / 4;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      cell.scale.set(cellW * 0.82, READ_H * 0.8, 1);
      cell.position.set(u.cx - readW / 2 + cellW * (i + 0.5), base + READ_TOP - READ_H / 2, caseFrontZ + 0.02);
    }

    // --- the keys, which are allowed to be small
    const keysW = Math.min(caseW * KEYS_W_FRAC, KEYS_W_MAX);
    const keysCx = u.cx - caseW / 2 + keysW / 2 + caseW * 0.06;
    place(keyFrame, keysCx, KEYS_Y0 - 0.03, KEYS_Y0 + KEYS_H + 0.03, caseFrontZ - 0.02, caseFrontZ + 0.01, keysW + 0.06);
    keyField.scale.set(keysW, KEYS_H, 1);
    keyField.position.set(keysCx, base + KEYS_Y0 + KEYS_H / 2, caseFrontZ + 0.018);

    // --- the engraved strip and the lamp
    const stripW = Math.min(caseW * 0.34, 0.52);
    labelPlate.scale.set(stripW, 0.1, 1);
    labelPlate.position.set(u.cx + caseW / 2 - stripW / 2 - caseW * 0.06, base + KEYS_Y0 + KEYS_H - 0.08, caseFrontZ + 0.016);

    /*
     * The lamp sits just east of the keys, NOT out at the housing's far end.
     * Measured: the fire screen beside this unit is 2.45 m tall and at chapter
     * 1's 30 deg pitch a sight line clears it only `2.45 - 2.39d` metres up,
     * `d` being the distance west of the door — so the last third of the face is
     * in the door's own shadow, and a status lamp parked there never changes
     * colour where anyone can see it.
     */
    lamp.scale.set(LAMP_R, LAMP_R, 0.03);
    lamp.position.set(keysCx + keysW / 2 + LAMP_R * 2.2, base + KEYS_Y0 + KEYS_H * 0.5, caseFrontZ + 0.02);

    // --- what it says
    const done = p.state === 'done';
    const label = (p.label ?? '____').padEnd(4, '_').slice(0, 4);
    for (let i = 0; i < cells.length; i++) cells[i].material = cellMat(label[i], done);
    keyField.material = painter.material('pad-keys', 288, 384, '#14171c', keyGrid, 0.16);
    labelPlate.material = painter.material('pad-label', 256, 48, '#1b1f26', padLabel, 0.2);
    // Red while the lock is holding, green once it has let go: the one thing in
    // the frame that says the four digits were the right four.
    lampMat.emissive.setHex(done ? 0x35d17a : 0xd8452f);
  }

  return {
    root,
    pose,
    dispose(): void {
      painter.dispose();
      for (const mat of owned) mat.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      root.removeFromParent();
      root.clear();
    },
  };
}
