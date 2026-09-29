/**
 * The named people's portraits in the 3D build — `src/render3d/people3d.ts`.
 *
 * The figures are pooled by their index in `snap.people`, and chapter 3 lists
 * the crowd first, so every visitor who walks in moves Stephan and the named
 * crew one figure along. The portrait used to be torn down and sculpted again on
 * the new figure — ~3,900 rays against a 72 x 54 head and fresh canvas textures,
 * none of it disposed — every 0.55 s while the hall filled: the chapter 3
 * slowdown of 29 Sep. What this holds: a portrait is built once per person and
 * moves with them, and nobody is ever drawn twice.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { createPeople } from '../src/render3d/people3d';
import type { GameSnapshot, Person } from '../src/sim/types';

/*
 * The portraits paint their badges and prints on a 2D canvas. Headless there is
 * none, so the canvas is a stand-in that answers every call with itself (and a
 * width, for `measureText`): what is drawn does not matter here, only what is
 * built.
 */
const fake: object = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 'canvas' : k === 'then' ? undefined : k === 'width' || k === 'height' ? 64 : fake),
  apply: () => fake,
  set: () => true,
});
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => fake });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const visitor = (seed: number): Person => ({ x: 100 + seed * 20, y: 200, r: 5, role: 'visitor', colour: '#8c9bb9', seed });
const stephan: Person = { x: 300, y: 260, r: 6, role: 'stephan', name: 'Stephan', colour: '#3f4a2c', seed: 910 };
const celestino: Person = { x: 340, y: 260, r: 6, role: 'staff', name: 'Celestino', colour: '#d9c3a5', seed: 900 };

const frame = (people: Person[]): GameSnapshot => ({ people, plates: [] }) as unknown as GameSnapshot;

function portraitsIn(root: THREE.Object3D): Map<string, THREE.Object3D[]> {
  const out = new Map<string, THREE.Object3D[]>();
  root.traverse((o) => {
    if (!o.name.startsWith('portrait-')) return;
    const l = out.get(o.name) ?? [];
    l.push(o);
    out.set(o.name, l);
  });
  return out;
}

/** The pooled figure (its root) a portrait is drawn on. */
function figureOf(o: THREE.Object3D, root: THREE.Object3D): THREE.Object3D {
  let p = o;
  while (p.parent && p.parent !== root) p = p.parent;
  return p;
}

describe('named people in the 3D crowd', () => {
  it('keeps each portrait as the crowd grows in front of them, instead of sculpting it again', () => {
    const root = new THREE.Group();
    const people = createPeople(root);
    people.update(frame([visitor(1), stephan, celestino]), 0);
    const first = portraitsIn(root);
    expect(first.get('portrait-Stephan')).toHaveLength(1);
    expect(first.get('portrait-Celestino')).toHaveLength(1);
    const head = first.get('portrait-Stephan')?.[0];

    // Three more visitors arrive, one per frame: both named people move along.
    let crowd = [visitor(1)];
    for (const seed of [2, 3, 4]) {
      crowd = [...crowd, visitor(seed)];
      people.update(frame([...crowd, stephan, celestino]), seed * 0.55);
      const now = portraitsIn(root);
      expect(now.get('portrait-Stephan')).toHaveLength(1);
      expect(now.get('portrait-Celestino')).toHaveLength(1);
      // The same head, not a new one...
      expect(now.get('portrait-Stephan')?.[0]).toBe(head);
    }
    // ...on the figure now drawing him, which is visible.
    const on = figureOf(head as THREE.Object3D, root);
    expect(root.children.indexOf(on)).toBe(crowd.length);
    expect(on.visible).toBe(true);
  });

  it('moves a portrait back down when somebody in front leaves', () => {
    const root = new THREE.Group();
    const people = createPeople(root);
    people.update(frame([visitor(1), visitor(2), stephan]), 0);
    const head = portraitsIn(root).get('portrait-Stephan')?.[0] as THREE.Object3D;
    people.update(frame([visitor(2), stephan]), 0.5);
    const now = portraitsIn(root).get('portrait-Stephan');
    expect(now).toHaveLength(1);
    expect(now?.[0]).toBe(head);
    expect(root.children.indexOf(figureOf(head, root))).toBe(1);
  });

  it('gives the figure it leaves its own clothes back', () => {
    const root = new THREE.Group();
    const people = createPeople(root);
    people.update(frame([visitor(1), stephan]), 0);
    people.update(frame([visitor(1), visitor(2), stephan]), 0.5);
    // Figure 1 was Stephan and is a visitor now: no sculpted head on it, its
    // own head showing, and nothing of his left hanging on its limbs.
    const fig = root.children[1];
    const names: string[] = [];
    fig.traverse((o) => names.push(o.name));
    expect(names.some((n) => n.startsWith('portrait-'))).toBe(false);
    expect(fig.getObjectByName('head')?.visible).toBe(true);
    expect(names).not.toContain('sleeve');
  });

  it('still draws two people who share a name as two people', () => {
    const root = new THREE.Group();
    const people = createPeople(root);
    const twin: Person = { ...celestino, x: 380, seed: 901 };
    people.update(frame([celestino, twin]), 0);
    expect(portraitsIn(root).get('portrait-Celestino')).toHaveLength(2);
    people.update(frame([visitor(1), celestino, twin]), 0.5);
    expect(portraitsIn(root).get('portrait-Celestino')).toHaveLength(2);
  });
});
