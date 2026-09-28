/**
 * merge.ts — fewer draw calls.
 *
 * Every mesh is drawn up to six times a frame here (up to four shadow maps,
 * the floor reflection, the AO normal pass, the main pass), so a scene built
 * the readable way — a sconce is a cylinder and a disc, a vent is eight slats —
 * is thousands of draws. These helpers collapse what never moves.
 *
 * Anything that must stay its own object is flagged `userData.noMerge`: things
 * that animate, the reflecting floors (the reflection pass hides them by
 * object), and anything the code keeps a reference to and mutates.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const NO_MERGE = 'noMerge';

export function noMerge<T extends THREE.Object3D>(o: T): T {
  o.userData[NO_MERGE] = true;
  return o;
}

function keyOf(mesh: THREE.Mesh): string {
  const g = mesh.geometry;
  const mat = mesh.material as THREE.Material;
  return [mat.uuid, Object.keys(g.attributes).sort().join(','), mesh.castShadow, mesh.receiveShadow, mesh.renderOrder].join('|');
}

/** Static merge of a subtree into one mesh per material, in `root`'s space. */
export function mergeStatic(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { meshes: THREE.Mesh[]; geos: THREE.BufferGeometry[] }>();
  const visit = (o: THREE.Object3D): void => {
    if (o.userData[NO_MERGE]) return;
    const mesh = o as THREE.Mesh;
    const plain = mesh.isMesh && !(mesh as unknown as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material) && !mesh.onBeforeRender.toString().includes('uniforms');
    if (plain && o.children.length === 0) {
      const k = keyOf(mesh);
      const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      const entry = groups.get(k) ?? { meshes: [], geos: [] };
      entry.meshes.push(mesh);
      entry.geos.push(g);
      groups.set(k, entry);
      return;
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  let removed = 0;
  for (const { meshes, geos } of groups.values()) {
    if (meshes.length < 2) continue;
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const src = meshes[0];
    const out = new THREE.Mesh(merged, src.material);
    out.castShadow = src.castShadow;
    out.receiveShadow = src.receiveShadow;
    out.renderOrder = src.renderOrder;
    root.add(out);
    for (const m of meshes) {
      m.parent?.remove(m);
      removed++;
    }
  }
  return removed;
}

/**
 * Merge a rig per anchor: every mesh between an anchor (a bone, a named part,
 * the root) and the next anchor down becomes part of one mesh per material
 * parented to that anchor, so it still moves with it.
 */
export function mergeUnderAnchors(root: THREE.Object3D, anchors: Set<THREE.Object3D>): void {
  root.updateMatrixWorld(true);
  const all: THREE.Object3D[] = [];
  root.traverse((o) => all.push(o));
  const hasAnchorBelow = (o: THREE.Object3D): boolean => {
    let found = false;
    o.traverse((c) => {
      if (c !== o && anchors.has(c)) found = true;
    });
    return found;
  };
  for (const a of all) {
    if (!anchors.has(a) && a !== root) continue;
    const inv = new THREE.Matrix4().copy(a.matrixWorld).invert();
    const groups = new Map<string, { meshes: THREE.Mesh[]; geos: THREE.BufferGeometry[] }>();
    const tops: THREE.Object3D[] = [];
    const visit = (o: THREE.Object3D, top: boolean): void => {
      if (anchors.has(o) || o.userData[NO_MERGE]) return;
      if (hasAnchorBelow(o)) {
        // A transform that carries an anchor: its own mesh (if any) cannot go,
        // but its other children can.
        for (const c of o.children) visit(c, true);
        return;
      }
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) {
        const k = keyOf(mesh);
        const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
        const e = groups.get(k) ?? { meshes: [], geos: [] };
        e.meshes.push(mesh);
        e.geos.push(g);
        groups.set(k, e);
      }
      if (top) tops.push(o);
      for (const c of o.children) visit(c, false);
    };
    for (const c of a.children) visit(c, true);
    const mergedAll: Array<{ geos: THREE.BufferGeometry[]; src: THREE.Mesh }> = [];
    let ok = true;
    for (const { meshes, geos } of groups.values()) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) {
        ok = false;
        break;
      }
      mergedAll.push({ geos: [merged], src: meshes[0] });
    }
    if (!ok || tops.length < 2) continue;
    for (const t of tops) t.parent?.remove(t);
    for (const { geos, src } of mergedAll) {
      const out = new THREE.Mesh(geos[0], src.material);
      out.castShadow = src.castShadow;
      out.receiveShadow = src.receiveShadow;
      a.add(out);
    }
  }
}
