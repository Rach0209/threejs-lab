// ══════════════════════════════════════════════════════════════
//  Module 26: GPGPU (GPU General-Purpose Computing)
//
//  배울 것:
//    - GPGPU 개념  : GPU를 렌더링이 아닌 범용 계산에 사용
//    - ping-pong   : RenderTarget A → 계산 → RenderTarget B,
//                    다음 프레임엔 B → 계산 → A (두 버퍼 교대)
//    - DataTexture : CPU에서 초기 데이터(Float32)를 텍스처로 업로드
//    - 파티클 위치를 텍스처에 저장 → 셰이더에서 읽어 업데이트
//
//  왜 GPU인가?
//    CPU: 파티클 10만 개 × 물리 계산 = 싱글 스레드, 느림
//    GPU: 같은 계산을 픽셀(=파티클)마다 병렬 실행 → 수십 배 빠름
//
//  데이터 흐름:
//    1. 초기 위치 → DataTexture(RGBA Float) → RenderTarget A
//    2. 매 프레임: A 읽어서 새 위치 계산 → B에 기록 (시뮬레이션 셰이더)
//    3. B의 텍스처에서 XY 읽어 파티클 메시 배치 (렌더 셰이더)
//    4. A, B 교환 (ping-pong)
//
//  ⚠ Three.js r185 기준 GPUComputationRenderer 미포함
//    → DataTexture + ping-pong RenderTarget으로 직접 구현
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── 시뮬레이션 셰이더 ───────────────────────────────────────
//  입력: 이전 프레임 위치 텍스처(uPrev), 시간(uTime), 힘(uAttract)
//  출력: 새 위치 (gl_FragColor)
//  각 픽셀 = 파티클 하나의 (x, y, z, speed)
const SIM_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const SIM_FRAG = `
precision highp float;
uniform sampler2D uPrev;   // 이전 위치 텍스처
uniform float     uTime;
uniform float     uAttract; // 중심 인력 세기 (0=없음, 1=강함)
uniform float     uNoise;   // 난류 세기
uniform int       uMode;    // 0=궤도 1=폭발 2=소용돌이
varying vec2      vUv;

// 간단한 난수 (해시 기반)
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 prev = texture2D(uPrev, vUv);
  vec3 pos  = prev.xyz;
  float spd = prev.w;

  vec3 vel = vec3(0.0);

  if (uMode == 0) {
    // 궤도: 중심 인력 + 접선 속도
    vec3  toCenter = -pos;
    float dist     = length(toCenter) + 0.001;
    vel += normalize(toCenter) * uAttract * 0.04;
    // 접선 방향 (Y축 회전)
    vel += vec3(-pos.z, 0.0, pos.x) * 0.012;
  } else if (uMode == 1) {
    // 폭발: 중심에서 바깥으로 퍼짐
    float dist = length(pos) + 0.001;
    vel += normalize(pos) * (1.0 - uAttract) * 0.03;
    // 감속
    pos *= 0.995;
    // 너무 멀어지면 리스폰
    if (dist > 5.0) {
      pos = vec3(
        (rand(vUv + uTime * 0.01) - 0.5) * 0.2,
        (rand(vUv + uTime * 0.02) - 0.5) * 0.2,
        (rand(vUv + uTime * 0.03) - 0.5) * 0.2
      );
    }
  } else {
    // 소용돌이: 나선형
    float angle = atan(pos.z, pos.x);
    float dist  = length(vec2(pos.x, pos.z));
    vel.x += -sin(angle) * 0.03 - pos.x * 0.005;
    vel.z +=  cos(angle) * 0.03 - pos.z * 0.005;
    vel.y += sin(uTime * 0.5 + dist * 2.0) * 0.005;
  }

  // 난류 (저해상도 sin 노이즈)
  vel += vec3(
    sin(pos.y * 3.7 + uTime * 0.7),
    sin(pos.z * 3.1 + uTime * 0.8),
    sin(pos.x * 3.9 + uTime * 0.6)
  ) * uNoise * 0.008;

  pos += vel;

  gl_FragColor = vec4(pos, spd);
}
`;

// ─── 렌더 셰이더 ─────────────────────────────────────────────
//  시뮬레이션 텍스처에서 위치를 읽어 파티클 포인트 배치
const RENDER_VERT = `
uniform sampler2D uPos;   // 시뮬레이션 결과 텍스처
uniform float     uSize;
attribute vec2    aUv;    // 각 파티클의 텍스처 UV (파티클 ID)
attribute float   aIdx;   // 파티클 인덱스 (색상용)
varying float     vIdx;

void main() {
  vIdx = aIdx;
  // 텍스처에서 이 파티클의 위치를 읽음
  vec3 pos = texture2D(uPos, aUv).xyz;
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  // 거리에 따라 크기 조절
  gl_PointSize = uSize * (200.0 / -mvPos.z);
  gl_Position  = projectionMatrix * mvPos;
}
`;

const RENDER_FRAG = `
precision highp float;
uniform vec3  uColorA;
uniform vec3  uColorB;
varying float vIdx;

void main() {
  // 원형 파티클
  vec2 uv = gl_PointCoord - 0.5;
  if (length(uv) > 0.5) discard;
  float soft = 1.0 - length(uv) * 2.0;
  vec3 col = mix(uColorA, uColorB, vIdx);
  gl_FragColor = vec4(col * soft, soft * 0.8);
}
`;

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040810);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 2, 7);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // ─── GPGPU 설정 ───────────────────────────────────────────
  const PARTICLES = 128; // 128×128 = 16,384개 파티클
  const COUNT     = PARTICLES * PARTICLES;

  // 초기 위치 데이터 (구 표면에 랜덤 분포)
  const initData = new Float32Array(COUNT * 4); // RGBA
  for (let i = 0; i < COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 1.5 + Math.random() * 0.5;
    initData[i * 4 + 0] = r * Math.sin(phi) * Math.cos(theta); // x
    initData[i * 4 + 1] = r * Math.sin(phi) * Math.sin(theta); // y
    initData[i * 4 + 2] = r * Math.cos(phi);                   // z
    initData[i * 4 + 3] = Math.random();                        // speed
  }

  // DataTexture: CPU Float32 데이터 → GPU 텍스처
  const initTex = new THREE.DataTexture(
    initData, PARTICLES, PARTICLES,
    THREE.RGBAFormat, THREE.FloatType
  );
  initTex.needsUpdate = true;

  // ping-pong RenderTarget 두 개
  const rtOpts = {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
  };
  const rtA = new THREE.WebGLRenderTarget(PARTICLES, PARTICLES, rtOpts);
  const rtB = new THREE.WebGLRenderTarget(PARTICLES, PARTICLES, rtOpts);

  // 시뮬레이션용 씬 (화면 꽉 채우는 사각형)
  const simScene  = new THREE.Scene();
  const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const simMat = new THREE.ShaderMaterial({
    vertexShader:   SIM_VERT,
    fragmentShader: SIM_FRAG,
    uniforms: {
      uPrev:    { value: initTex },
      uTime:    { value: 0 },
      uAttract: { value: 0.5 },
      uNoise:   { value: 0.3 },
      uMode:    { value: 0 },
    },
  });
  const simMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat);
  simScene.add(simMesh);

  // 초기화: initTex → rtA에 한 번 렌더
  renderer.setRenderTarget(rtA);
  renderer.render(simScene, simCamera);
  renderer.setRenderTarget(null);

  // ─── 파티클 렌더 메시 ────────────────────────────────────
  //  각 파티클에 UV(아이디) 부여 → 셰이더에서 텍스처 샘플링
  const uvs  = new Float32Array(COUNT * 2);
  const idxs = new Float32Array(COUNT);
  for (let i = 0; i < PARTICLES; i++) {
    for (let j = 0; j < PARTICLES; j++) {
      const id = i * PARTICLES + j;
      uvs[id * 2 + 0] = (j + 0.5) / PARTICLES;
      uvs[id * 2 + 1] = (i + 0.5) / PARTICLES;
      idxs[id] = id / COUNT;
    }
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(COUNT * 3), 3));
  particleGeo.setAttribute('aUv',      new THREE.Float32BufferAttribute(uvs, 2));
  particleGeo.setAttribute('aIdx',     new THREE.Float32BufferAttribute(idxs, 1));

  const particleMat = new THREE.ShaderMaterial({
    vertexShader:   RENDER_VERT,
    fragmentShader: RENDER_FRAG,
    uniforms: {
      uPos:    { value: rtA.texture },
      uSize:   { value: 1.5 },
      uColorA: { value: new THREE.Color(0x6366f1) },
      uColorB: { value: new THREE.Color(0xf43f5e) },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });

  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'gpgpu-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;min-width:250px;">
      <p><strong>GPGPU — ${COUNT.toLocaleString()}개 파티클</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">시뮬레이션 모드</p>
      <div style="display:flex;gap:4px;margin-bottom:8px;">
        <button class="mode-btn" data-mode="0" style="flex:1;padding:5px 0;border-radius:4px;
          font-size:11px;font-weight:700;cursor:pointer;border:none;
          background:#6366f1;color:#fff;">궤도</button>
        <button class="mode-btn" data-mode="1" style="flex:1;padding:5px 0;border-radius:4px;
          font-size:11px;font-weight:700;cursor:pointer;border:none;
          background:#334155;color:#94a3b8;">폭발</button>
        <button class="mode-btn" data-mode="2" style="flex:1;padding:5px 0;border-radius:4px;
          font-size:11px;font-weight:700;cursor:pointer;border:none;
          background:#334155;color:#94a3b8;">소용돌이</button>
      </div>

      <label class="pp-row">
        <span>인력</span>
        <input type="range" id="attract" min="0" max="1" step="0.05" value="0.5">
        <span id="attract-val">0.50</span>
      </label>

      <label class="pp-row">
        <span>난류</span>
        <input type="range" id="noise" min="0" max="1" step="0.05" value="0.3">
        <span id="noise-val">0.30</span>
      </label>

      <label class="pp-row">
        <span>크기</span>
        <input type="range" id="psize" min="0.5" max="4" step="0.1" value="1.5">
        <span id="psize-val">1.5</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        위치 데이터를 텍스처(${PARTICLES}×${PARTICLES})에<br>
        저장 → GPU가 매 프레임 병렬 계산<br>
        <span style="color:#6366f1">ping-pong</span>: A→B→A→B 교대 렌더
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  // 모드 버튼
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.style.background = '#334155'; b.style.color = '#94a3b8';
      });
      btn.style.background = '#6366f1'; btn.style.color = '#fff';
      simMat.uniforms.uMode.value = parseInt(btn.dataset.mode);
    });
  });

  document.getElementById('attract').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('attract-val').textContent = v.toFixed(2);
    simMat.uniforms.uAttract.value = v;
  });
  document.getElementById('noise').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('noise-val').textContent = v.toFixed(2);
    simMat.uniforms.uNoise.value = v;
  });
  document.getElementById('psize').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('psize-val').textContent = v.toFixed(1);
    particleMat.uniforms.uSize.value = v;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;
  let pingPong = false; // false=A가 읽기, true=B가 읽기

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const t = timer.getElapsed();

    simMat.uniforms.uTime.value = t;

    // ── ping-pong 시뮬레이션 ─────────────────────────────
    //  현재 읽기 버퍼 → 시뮬레이션 → 쓰기 버퍼
    const readRT  = pingPong ? rtB : rtA;
    const writeRT = pingPong ? rtA : rtB;

    simMat.uniforms.uPrev.value = readRT.texture;  // 이전 위치 읽기
    renderer.setRenderTarget(writeRT);              // 새 위치 쓰기
    renderer.render(simScene, simCamera);

    // 파티클 렌더 셰이더에 새 위치 텍스처 연결
    particleMat.uniforms.uPos.value = writeRT.texture;

    // 메인 씬 렌더
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    pingPong = !pingPong; // 버퍼 교환

    controls.update();
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

    initTex.dispose();
    rtA.dispose(); rtB.dispose();
    simMat.dispose(); simMesh.geometry.dispose();
    particleGeo.dispose(); particleMat.dispose();
    renderer.setRenderTarget(null);
  };
}
