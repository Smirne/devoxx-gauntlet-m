/**
 * people3d.ts — the crowd, in 3D.
 *
 * The figures are the 2.5D build's own (`src/render/people.ts`, `buildPerson`):
 * head, torso, arms, legs, posed from the person's seed, heading and speed with
 * no state of their own. So this is only a pool — `snap.people` is rebuilt every
 * frame and a person's index is not their identity, which the models do not need
 * — and the floor under each one, from the sim's plates.
 */

import * as THREE from 'three';

import { buildPerson, type PersonModel } from '../render/people';
import { riseAt } from '../sim/surface';
import type { GameSnapshot } from '../sim/types';

/** Clothes by role, when the chapter did not say — the 2.5D build's fallback. */
const ROLE_COLOR: Readonly<Record<string, string>> = {
  visitor: '#6f7c8d',
  queue: '#7b6f8d',
  staff: '#c0392b',
  stephan: '#e0b050',
  speaker: '#4aa3a0',
};

export interface People3D {
  update(snap: GameSnapshot, t: number): void;
}

export function createPeople(parent: THREE.Object3D): People3D {
  const models: PersonModel[] = [];
  return {
    update(snap: GameSnapshot, t: number): void {
      const people = snap.people ?? [];
      const plates = snap.plates ?? [];
      for (let i = 0; i < people.length; i++) {
        let pm = models[i];
        if (!pm) {
          pm = buildPerson();
          pm.root.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          models.push(pm);
          parent.add(pm.root);
        }
        pm.root.visible = true;
        const p = people[i];
        pm.pose({ ...p, colour: p.colour ?? ROLE_COLOR[p.role] ?? ROLE_COLOR.visitor }, riseAt(p.x, p.y, plates), t);
      }
      for (let i = people.length; i < models.length; i++) models[i].root.visible = false;
    },
  };
}
