import { it } from 'vitest';
import * as THREE from 'three';
import { createRobot, measureBounds } from '../src/render/robots';
const size = (o: THREE.Object3D) => measureBounds(o).getSize(new THREE.Vector3());
it('measure', () => {
  for (const k of ['voxxy', 'droid', 'biggy'] as const) {
    const rig = createRobot(k);
    const s = size(rig.root);
    console.log(k, 'w', s.x.toFixed(3), 'h', s.y.toFixed(3), 'd', s.z.toFixed(3), 'h/w', (s.y / s.x).toFixed(3));
    if (k === 'biggy') {
      const belly = size(rig.parts.bellyShell).x;
      const dome = size(rig.parts.headShell).x;
      console.log('  belly', belly.toFixed(3), 'dome', dome.toFixed(3), 'belly/h', (belly / s.y).toFixed(3), 'dome/belly', (dome / belly).toFixed(3));
    }
    if (k === 'voxxy') {
      const head = measureBounds(rig.parts.headShell);
      const torso = measureBounds(rig.parts.torsoShell);
      console.log('  head w', (head.max.x - head.min.x).toFixed(3), 'bottom', head.min.y.toFixed(3),
        'torso top', torso.max.y.toFixed(3), 'neck', (head.min.y - torso.max.y).toFixed(4),
        'neck/headw', ((head.min.y - torso.max.y) / (head.max.x - head.min.x)).toFixed(4));
      // arm widest point along its length
      const fore = rig.bones.forearmL;
      rig.root.updateMatrixWorld(true);
      const sh = new THREE.Vector3().setFromMatrixPosition(rig.bones.shoulderL.matrixWorld);
      const hd = new THREE.Vector3().setFromMatrixPosition(rig.bones.handL.matrixWorld);
      console.log('  arm len', sh.distanceTo(hd).toFixed(3));
      let best = 0, bestT = 0;
      for (const bone of [rig.bones.upperArmL, fore]) {
        for (const c of bone.children) {
          if (!(c instanceof THREE.Mesh)) continue;
          const pos = c.geometry.getAttribute('position');
          const v = new THREE.Vector3();
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld);
            const t = v.clone().sub(sh).dot(hd.clone().sub(sh).normalize());
            const r = v.distanceTo(sh.clone().add(hd.clone().sub(sh).normalize().multiplyScalar(t)));
            if (r > best) { best = r; bestT = t / sh.distanceTo(hd); }
          }
        }
      }
      console.log('  arm widest r', best.toFixed(4), 'at frac', bestT.toFixed(3));
    }
    rig.dispose();
  }
});
