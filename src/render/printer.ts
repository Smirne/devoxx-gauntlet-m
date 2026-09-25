/**
 * printer.ts — the badge printer at reception, as a thing you can recognise.
 *
 * ## Why this is its own module
 *
 * Michele, 25 Sep 2026, with a screenshot of the reception counter: *"printer
 * should be recognizable and glowing as a hint"*. He was looking at
 * `PROPS.printer = { h: 0.95, color: 0xb9bec6 }` drawn by the generic
 * `drawProp` — a pale grey cuboid 1.6 m by 0.8 m standing on the counter. It is
 * where the cable run ENDS and the errand the whole chapter is named after, and
 * it was a box.
 *
 * Same contract as `src/render/keypad.ts` and `src/render/release-panel.ts`: the
 * sim owns the rect and `Prop.state`, this module owns nothing but what those
 * look like, and no game logic lives here (CLAUDE.md).
 *
 * ## What it is, in fiction
 *
 * A conference badge printer on a reception counter: a body with a raked control
 * face, a card hopper standing up at the back, a feed slot across the front with
 * a **badge half-ejected from it** — the one detail that makes a grey box read as
 * a printer at a glance — a small screen, a status lamp, and a lanyard spool
 * beside it. Devoxx red on the card, because the thing coming out of it is the
 * badge the chapter is about.
 *
 * ## Which way it faces
 *
 * The rule every hand-modelled prop in this repo follows: the diorama camera is
 * fixed on the +z side of the plan (`src/render/camera.ts`), so the readable
 * front looks +z and every control goes on it. The rect's own depth is what the
 * body sits in; the badge and the lamp stand proud of its front face, which is
 * `p.y + p.h`.
 *
 * ## The three states, and what each one means
 *
 * The sim publishes them (`ch2-expo.ts`): `idle` before the cable is in, `active`
 * once it is plugged and waiting on the router, `done` when it is printing. The
 * screen and the lamp carry all three, and a printer with no supply is DARK —
 * the same rule the cabinet's pilot lamp is built on, because a lamp lit on a
 * dead machine is a lie the player learns not to trust.
 */

import * as THREE from 'three';

import type { Prop } from '../sim/types';
import { m } from '../sim/units';

export interface PrinterModel {
  /** Parent this into the scene once; `pose` moves it. */
  root: THREE.Group;
  /** Put it where this frame's prop says, and show what it says. `base` is the floor under it, metres. */
  pose(p: Prop, base: number): void;
  dispose(): void;
}

/** How high the counter it stands on is, metres — the reception desk's own top. */
const COUNTER_H = 1.02;
/** Body size, metres. Modest: it is a desktop machine, not a copier. */
const BODY_W = 0.62;
const BODY_D = 0.44;
const BODY_H = 0.34;

const box = (w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export function buildPrinter(): PrinterModel {
  const root = new THREE.Group();
  root.name = 'badge-printer';

  const owned: THREE.Material[] = [];
  const mat = (name: string, color: number, rough: number, metal = 0): THREE.MeshStandardMaterial => {
    const mm = new THREE.MeshStandardMaterial({ name: `printer/${name}`, color, roughness: rough, metalness: metal });
    owned.push(mm);
    return mm;
  };

  const shell = mat('shell', 0xd8dce2, 0.55);
  const dark = mat('dark', 0x23272e, 0.7);
  const trim = mat('trim', 0x9aa2ad, 0.35, 0.6);
  const card = mat('card', 0xe8e6e1, 0.85);
  const devoxx = mat('devoxx', 0xd6472c, 0.8);
  const lanyard = mat('lanyard', 0x1b1f26, 0.9);

  /*
   * A trace of self-light on the shell, the convention every findable object in
   * this game follows (`keypad.ts`, the crates, the sponsor standby strips): in a
   * blacked-out hall an unlit housing is a silhouette, and the thing the player
   * is looking FOR is by definition still idle.
   */
  shell.emissive = new THREE.Color(0x1a1e24);
  shell.emissiveIntensity = 1;
  shell.toneMapped = false;

  const screenMat = mat('screen', 0x0d1116, 0.35);
  screenMat.emissive = new THREE.Color(0x6b4406);
  screenMat.emissiveIntensity = 0;
  screenMat.toneMapped = false;
  const lampMat = mat('lamp', 0x14181d, 0.35);
  lampMat.emissive = new THREE.Color(0xff8a1a);
  lampMat.emissiveIntensity = 0;
  lampMat.toneMapped = false;

  // Body, with the raked control face cut in by standing a second, shorter block
  // on the back half — two boxes read as a stepped machine, one box reads as a box.
  const body = box(BODY_W, BODY_H, BODY_D, shell);
  body.position.set(0, BODY_H / 2, 0);
  root.add(body);

  const hopper = box(BODY_W * 0.74, BODY_H * 0.62, BODY_D * 0.3, shell);
  hopper.position.set(0, BODY_H + (BODY_H * 0.62) / 2 - 0.01, -BODY_D * 0.28);
  root.add(hopper);
  // The stack of blank cards in it, standing proud of the hopper's mouth.
  const blanks = box(BODY_W * 0.5, BODY_H * 0.3, 0.012, card);
  blanks.position.set(0, BODY_H + BODY_H * 0.52, -BODY_D * 0.28 + BODY_D * 0.16);
  root.add(blanks);

  // The feed slot across the front: a dark recess, and a badge coming out of it.
  const slot = box(BODY_W * 0.66, 0.035, 0.03, dark);
  slot.position.set(0, BODY_H * 0.34, BODY_D / 2);
  root.add(slot);

  const badge = new THREE.Group();
  badge.name = 'badge-printer-card';
  const badgeCard = box(0.2, 0.13, 0.006, card);
  badgeCard.rotation.x = -0.32;
  badge.add(badgeCard);
  // The red band across the top of a Devoxx badge, which is what makes the little
  // white rectangle read as a conference badge and not as a sheet of paper.
  const band = box(0.2, 0.035, 0.008, devoxx);
  band.position.set(0, 0.046, 0.002);
  band.rotation.x = -0.32;
  badge.add(band);
  badge.position.set(0, BODY_H * 0.34 + 0.055, BODY_D / 2 + 0.055);
  root.add(badge);

  // The screen on the raked face, and the status lamp beside it.
  const screen = box(0.16, 0.07, 0.012, screenMat);
  screen.position.set(-BODY_W * 0.26, BODY_H * 0.72, BODY_D / 2 - 0.02);
  screen.rotation.x = -0.5;
  root.add(screen);

  const lamp = box(0.035, 0.022, 0.012, lampMat);
  lamp.position.set(BODY_W * 0.3, BODY_H * 0.74, BODY_D / 2 - 0.02);
  lamp.rotation.x = -0.5;
  root.add(lamp);

  // A lanyard spool on the counter beside it: reception dressing, and the second
  // thing every attendee is handed.
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 18), lanyard);
  spool.rotation.z = Math.PI / 2;
  spool.position.set(BODY_W * 0.72, 0.075, BODY_D * 0.1);
  spool.castShadow = true;
  root.add(spool);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), trim);
  hub.rotation.z = Math.PI / 2;
  hub.position.copy(spool.position);
  root.add(hub);

  return {
    root,
    pose(p: Prop, base: number): void {
      const w = m(p.w ?? 20);
      const d = m(p.h ?? 10);
      // Centred on the rect, standing on the counter top rather than on the floor:
      // the sim's rect is the footprint ON the desk (`GF.printer`, and Michele's
      // *"The printer might be on the reception counter"*).
      root.position.set(m(p.x ?? 0) + w / 2, base + COUNTER_H, m(p.y ?? 0) + d / 2);

      const done = p.state === 'done';
      const live = done || p.state === 'active';
      /*
       * Dark until there is something behind it. `active` is the cable in and the
       * router still to come — amber, the same "something is running" amber the
       * cabinet's pilot uses — and `done` is green and steady, with the screen
       * bright enough to find across a dark hall, which is what "glowing as a
       * hint" has to mean at this distance.
       */
      screenMat.emissive.setHex(done ? 0x2f9d5f : 0x6b4406);
      screenMat.emissiveIntensity = done ? 2.4 : live ? 1.2 : 0.12;
      lampMat.emissive.setHex(done ? 0x2f9d5f : 0xff8a1a);
      lampMat.emissiveIntensity = done ? 2.6 : live ? 1.6 : 0;
      // The badge only hangs out of the slot once it is actually printing one.
      badge.visible = done;
    },
    dispose(): void {
      for (const mm of owned) mm.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      root.removeFromParent();
      root.clear();
    },
  };
}
