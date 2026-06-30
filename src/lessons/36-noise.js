// ══════════════════════════════════════════════════════════════
//  Module 37: Procedural Noise / 절차적 노이즈
//
//  배울 것:
//    - Value Noise    : 격자 점 보간 — 부드러운 랜덤값
//    - Perlin Noise   : 그라디언트 기반 — 자연스러운 노이즈
//    - FBM (fBm)      : Fractal Brownian Motion — 노이즈 여러 겹 중첩
//                       octave마다 frequency↑, amplitude↓ → 세밀한 디테일 추가
//    - 활용: 지형 높이맵, 구름, 불꽃, 대리석·나무 텍스처, 물
//
//  FBM 공식:
//    result = 0
//    for each octave:
//      result += noise(pos * frequency) * amplitude
//      frequency *= lacunarity   (보통 2.0)
//      amplitude *= gain         (보통 0.5)
//
//  GLSL 노이즈:
//    WebGL에는 내장 노이즈 함수가 없음
//    → 직접 구현하거나 텍스처에 미리 구워서 사용
//    → 이 레슨에서는 GLSL에 직접 구현
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const NOISE_VERT = `
varying vec2 vUv;
varying vec3 vPos;
uniform float uTime;
uniform float uHeight;
uniform int   uOctaves;
uniform float uFrequency;
uniform float uLacunarity;
uniform float uGain;

// ── 해시 함수 (랜덤한 것처럼 보이는 값 생성) ──
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// ── Perlin Noise (그라디언트 노이즈) ──
float perlin(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f); // smoothstep

  float a = dot(hash2(i + vec2(0,0)) * 2.0 - 1.0, f - vec2(0,0));
  float b = dot(hash2(i + vec2(1,0)) * 2.0 - 1.0, f - vec2(1,0));
  float c = dot(hash2(i + vec2(0,1)) * 2.0 - 1.0, f - vec2(0,1));
  float d = dot(hash2(i + vec2(1,1)) * 2.0 - 1.0, f - vec2(1,1));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ── FBM: 노이즈 여러 겹 중첩 ──
float fbm(vec2 p, int octaves, float lacunarity, float gain) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    val  += perlin(p * freq) * amp;
    freq *= lacunarity;
    amp  *= gain;
  }
  return val;
}

void main() {
  vUv = uv;
  vec3 pos = position;

  // UV 기반 FBM → Y 높이에 적용
  float h = fbm(uv * uFrequency + uTime * 0.1, uOctaves, uLacunarity, uGain);
  pos.y += h * uHeight;
  vPos = pos;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const NOISE_FRAG = `
varying vec2 vUv;
varying vec3 vPos;
uniform float uTime;
uniform int   uColorMode;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float perlin(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = dot(hash2(i+vec2(0,0))*2.0-1.0, f-vec2(0,0));
  float b = dot(hash2(i+vec2(1,0))*2.0-1.0, f-vec2(1,0));
  float c = dot(hash2(i+vec2(0,1))*2.0-1.0, f-vec2(0,1));
  float d = dot(hash2(i+vec2(1,1))*2.0-1.0, f-vec2(1,1));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float v=0.0,a=0.5,f=1.0;
  for(int i=0;i<6;i++){v+=perlin(p*f)*a;f*=2.0;a*=0.5;}
  return v;
}

void main() {
  float n = fbm(vUv * 4.0 + uTime * 0.05) * 0.5 + 0.5;
  vec3 col;

  if (uColorMode == 0) {
    // 지형 고도 색상
    if (n < 0.3)       col = mix(vec3(0.05,0.15,0.4), vec3(0.2,0.5,0.8), n/0.3);
    else if (n < 0.5)  col = mix(vec3(0.6,0.5,0.3), vec3(0.4,0.6,0.3), (n-0.3)/0.2);
    else if (n < 0.75) col = mix(vec3(0.4,0.6,0.3), vec3(0.5,0.5,0.5), (n-0.5)/0.25);
    else               col = mix(vec3(0.8,0.8,0.8), vec3(1.0,1.0,1.0), (n-0.75)/0.25);
  } else if (uColorMode == 1) {
    // 불꽃
    col = mix(vec3(0.0,0.0,0.0), vec3(1.0,0.3,0.0), n);
    col = mix(col, vec3(1.0,1.0,0.5), max(0.0, n - 0.5) * 2.0);
  } else if (uColorMode == 2) {
    // 대리석
    float marble = sin(vUv.x * 10.0 + fbm(vUv * 3.0) * 5.0) * 0.5 + 0.5;
    col = mix(vec3(0.9,0.88,0.85), vec3(0.3,0.28,0.3), marble);
  } else {
    // 구름
    float cloud = smoothstep(0.4, 0.7, n);
    col = mix(vec3(0.4,0.6,0.9), vec3(1.0,1.0,1.0), cloud);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export function init(renderer) {
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 6, 10);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // ─── 노이즈 지형 메시 ─────────────────────────────────────
  const geo = new THREE.PlaneGeometry(12, 12, 128, 128);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime:       { value: 0 },
    uHeight:     { value: 2.0 },
    uOctaves:    { value: 4 },
    uFrequency:  { value: 2.0 },
    uLacunarity: { value: 2.0 },
    uGain:       { value: 0.5 },
    uColorMode:  { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader:   NOISE_VERT,
    fragmentShader: NOISE_FRAG,
    uniforms,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'noise-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>Procedural Noise / FBM</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:4px">색상 모드</p>
      <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">
        ${[['지형','0'],['불꽃','1'],['대리석','2'],['구름','3']].map(([l,v]) => `
          <button class="color-mode-btn" data-val="${v}"
            style="flex:1;min-width:56px;padding:5px 4px;border-radius:4px;border:none;cursor:pointer;
            font-size:11px;font-weight:700;background:${v==='0'?'#6366f1':'#334155'};
            color:${v==='0'?'#fff':'#94a3b8'};">${l}</button>
        `).join('')}
      </div>

      <label class="pp-row">
        <span>높이</span>
        <input type="range" id="n-height" min="0" max="5" step="0.1" value="2">
        <span id="n-height-val">2.0</span>
      </label>
      <label class="pp-row">
        <span>옥타브</span>
        <input type="range" id="n-octaves" min="1" max="8" step="1" value="4">
        <span id="n-octaves-val">4</span>
      </label>
      <label class="pp-row">
        <span>주파수</span>
        <input type="range" id="n-freq" min="0.5" max="6" step="0.1" value="2">
        <span id="n-freq-val">2.0</span>
      </label>
      <label class="pp-row">
        <span>Lacunarity</span>
        <input type="range" id="n-lac" min="1" max="4" step="0.1" value="2">
        <span id="n-lac-val">2.0</span>
      </label>
      <label class="pp-row">
        <span>Gain</span>
        <input type="range" id="n-gain" min="0.1" max="0.9" step="0.05" value="0.5">
        <span id="n-gain-val">0.50</span>
      </label>
      <label class="pp-row">
        <span>애니메이션</span>
        <input type="checkbox" id="n-anim" checked>
      </label>
    </div>
  `;
  document.body.appendChild(ui);

  const bind = (id, key, fixed = 1) => {
    document.getElementById(id).addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById(id + '-val').textContent = v.toFixed(fixed);
      uniforms[key].value = key === 'uOctaves' ? parseInt(v) : v;
    });
  };
  bind('n-height', 'uHeight', 1);
  bind('n-octaves', 'uOctaves', 0);
  bind('n-freq', 'uFrequency', 1);
  bind('n-lac', 'uLacunarity', 1);
  bind('n-gain', 'uGain', 2);

  document.querySelectorAll('.color-mode-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.color-mode-btn').forEach(x => {
        x.style.background = '#334155'; x.style.color = '#94a3b8';
      });
      b.style.background = '#6366f1'; b.style.color = '#fff';
      uniforms.uColorMode.value = parseInt(b.dataset.val);
    });
  });

  let animOn = true;
  document.getElementById('n-anim').addEventListener('change', e => { animOn = e.target.checked; });

  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    if (animOn) uniforms.uTime.value = timer.getElapsed();
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    document.body.removeChild(ui);
    geo.dispose(); mat.dispose();
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
