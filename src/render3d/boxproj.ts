/**
 * boxproj.ts — parallax-corrected (box-projected) image-based reflections.
 *
 * The venue's environment map is one cube capture taken in the middle of the
 * corridor. Sampled the ordinary way, every glossy surface reflects that cube
 * as if it were infinitely far away, so a steel column ten metres from the
 * capture point shows the POPCORN neon floating in the wrong place as a soft
 * coloured blob — the screenshot loop found half a dozen of them in one frame.
 *
 * Box projection intersects the reflected ray with the corridor's own box and
 * looks the cube up in the direction of that hit from the capture point, so a
 * reflection lands where the emitter actually is. Outside the box (cinemas,
 * foyer) the capture is simply wrong, so its specular is turned well down
 * there instead of pretending.
 */

import * as THREE from 'three';

export interface ProbeBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
  probe: THREE.Vector3;
}

const PATCHED = new WeakSet<THREE.Material>();

export function applyBoxProjection(root: THREE.Object3D, box: ProbeBox): void {
  const uniforms = {
    bpMin: { value: box.min },
    bpMax: { value: box.max },
    bpProbe: { value: box.probe },
  };
  const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
    'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );',
    /* glsl */ `reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
      {
        vec3 inside = step(bpMin - .05, vBPWorld) * step(vBPWorld, bpMax + .05);
        if (inside.x * inside.y * inside.z > .5) {
          vec3 rbmax = (bpMax - vBPWorld) / reflectVec;
          vec3 rbmin = (bpMin - vBPWorld) / reflectVec;
          vec3 rb = max(rbmax, rbmin);
          float t = min(min(rb.x, rb.y), rb.z);
          reflectVec = normalize(vBPWorld + reflectVec * t - bpProbe);
        } else {
          bpOutside = 1.;
        }
      }`,
  ).replace('return envMapColor.rgb * envMapIntensity;', 'return envMapColor.rgb * envMapIntensity * mix(1., .25, bpOutside);');

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std || !std.isMeshStandardMaterial || PATCHED.has(std)) continue;
      PATCHED.add(std);
      const prev = std.onBeforeCompile;
      const prevKey = std.customProgramCacheKey.bind(std);
      std.onBeforeCompile = (shader, renderer) => {
        prev.call(std, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vBPWorld;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#if defined( USE_ENVMAP ) || defined( USE_SHADOWMAP )\nvBPWorld = worldPosition.xyz;\n#endif');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vBPWorld;\nuniform vec3 bpMin;\nuniform vec3 bpMax;\nuniform vec3 bpProbe;\nfloat bpOutside = 0.;')
          .replace('#include <envmap_physical_pars_fragment>', chunk);
      };
      std.customProgramCacheKey = () => `${prevKey()}|bp`;
      std.needsUpdate = true;
    }
  });
}
