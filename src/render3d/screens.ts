/**
 * screens.ts — the moving pictures: a dot-matrix LED ticker and an animated
 * advertising panel. Both are shaders over a canvas-drawn source, animated by
 * a `time` uniform the venue advances; no video or image files.
 */

import * as THREE from 'three';

function textStrip(text: string, h = 64): { tex: THREE.CanvasTexture; aspect: number } {
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  x.font = `bold ${Math.round(h * 0.8)}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  const w = Math.ceil(x.measureText(text).width + h * 2);
  c.width = w;
  c.height = h;
  x.fillStyle = '#000';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#fff';
  x.font = `bold ${Math.round(h * 0.8)}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  x.textBaseline = 'middle';
  x.fillText(text, h, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { tex: t, aspect: w / h };
}

/**
 * A scrolling dot-matrix sign, `w` x `h` metres. The text is sampled at dot
 * centres, so it reads as individual LEDs up close and as a line of light from
 * down the corridor.
 */
export function ledTicker(text: string, w: number, h: number, colour: THREE.ColorRepresentation, rows = 14): THREE.Mesh {
  const { tex, aspect } = textStrip(`${text}   ·   `);
  const cols = Math.round((rows * w) / h);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tText: { value: tex },
      time: { value: 0 },
      grid: { value: new THREE.Vector2(cols, rows) },
      span: { value: cols / rows / aspect },
      colour: { value: new THREE.Color(colour) },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tText; uniform float time; uniform vec2 grid; uniform float span; uniform vec3 colour; varying vec2 vUv;
      void main(){
        vec2 cell = floor(vUv * grid);
        vec2 f = fract(vUv * grid) - .5;
        vec2 src = (cell + .5) / grid;
        float u = src.x * span + time * .07;
        float on = step(.5, texture2D(tText, vec2(u, src.y)).r);
        float dot = smoothstep(.45, .25, length(f));
        vec3 c = colour * (on * 22. + .12) * dot;
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData.tick = (t: number): void => {
    mat.uniforms.time.value = t;
  };
  return mesh;
}

/**
 * A big animated ad: the Devoxx dates over a slow colour sweep, a scan band,
 * and a glitch that tears a few rows sideways every few seconds. Backlit, so it
 * also throws its colour on the floor in front of it (the caller adds the light).
 */
export function adScreen(w: number, h: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, 512, 1024);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.font = 'bold 120px "Impact", "Arial Black", sans-serif';
  x.fillText('DEVOXX', 256, 250);
  x.font = 'bold 54px "Arial Narrow", Arial, sans-serif';
  x.fillText('BELGIUM · ANTWERP', 256, 330);
  x.font = 'bold 170px "Impact", "Arial Black", sans-serif';
  x.fillText('2026', 256, 540);
  x.font = 'bold 46px "Arial Narrow", Arial, sans-serif';
  x.fillText('KEYNOTE SPEAKER:', 256, 690);
  x.font = 'bold 110px "Impact", "Arial Black", sans-serif';
  x.fillText('TBA', 256, 810);
  x.font = '30px "Arial Narrow", Arial, sans-serif';
  x.fillText('tomato soup included', 256, 930);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tText: { value: tex }, time: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tText; uniform float time; varying vec2 vUv;
      float h(float n){ return fract(sin(n * 91.7) * 43758.5); }
      void main(){
        vec2 uv = vUv;
        float gt = floor(time * 8.);
        float burst = step(.93, h(floor(time * .7)));
        float row = floor(uv.y * 40.);
        uv.x += burst * (h(row + gt) - .5) * .08 * step(.6, h(row * 3.1 + gt));
        vec3 bg = .5 + .5 * cos(6.2831 * (vec3(.0, .33, .67) + uv.y * .6 + time * .05));
        bg = mix(vec3(.9, .1, .5), vec3(.05, .7, 1.), bg.g) * (.25 + .2 * uv.y);
        float txt = texture2D(tText, uv).r;
        float txtR = texture2D(tText, uv + vec2(.004 * burst, 0.)).r;
        vec3 col = bg + vec3(txtR, txt, txt) * 1.4;
        col += .25 * smoothstep(.02, 0., abs(fract(uv.y * .5 - time * .12) - .5));
        gl_FragColor = vec4(col * 6., 1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData.tick = (t: number): void => {
    mat.uniforms.time.value = t;
  };
  return mesh;
}
