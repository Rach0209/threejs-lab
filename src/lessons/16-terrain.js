// ══════════════════════════════════════════════════════════════
//  Module 16: 절차적 지형 (Procedural Terrain)
//
//  배울 것:
//    - PlaneGeometry 정점 직접 수정 → 높이맵 지형
//    - Simplex-like 노이즈 (순수 JS 구현) → 부드러운 산/계곡
//    - Octave / FBM (Fractional Brownian Motion) → 자연스러운 지형
//    - vertexColors : 높이에 따라 정점 색 부여 (물/모래/풀/바위/눈)
//    - computeVertexNormals() : 수정된 정점에서 법선 재계산
//    - Fog + 환경 조명으로 원근감 표현
//
//  핵심 개념 — FBM (프랙탈 브라운 운동):
//    여러 주파수의 노이즈를 중첩해 자연스러운 지형을 만드는 기법.
//    낮은 주파수(큰 산) + 높은 주파수(작은 돌기)를 합산.
//
//    fbm = Σ(amplitude_i × noise(freq_i × pos))
//          amplitude는 octave마다 절반으로, frequency는 두 배로
//
//  지형 색상 레이어:
//    높이  0% 이하  → 물 (0x3b82f6)
//    높이 10% 이하  → 모래 (0xd4a96a)
//    높이 40% 이하  → 풀 (0x4a7c3f)
//    높이 70% 이하  → 바위 (0x6b6b6b)
//    높이 100%      → 눈 (0xffffff)
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── Simplex 노이즈 (순수 JS 구현) ───────────────────────────
//
//  Ken Perlin의 Simplex Noise — Perlin Noise보다 빠르고
//  고차원에서 방향 아티팩트가 적음.
//  여기선 2D 버전만 사용 (지형 XZ 평면에 적용).
//
const GRAD = [
  [1,1],[-1,1],[1,-1],[-1,-1],
  [1,0],[-1,0],[0,1],[0,-1],
];
const PERM = (() => {
  // 0~255 셔플 테이블 (고정 시드)
  const p = Array.from({length: 256}, (_, i) => i);
  // Fisher-Yates 셔플 (시드 고정)
  let seed = 42;
  function rand() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return [...p, ...p]; // 512 크기로 복제해 범위 초과 방지
})();

function dot2(g, x, y) { return g[0] * x + g[1] * y; }

function simplex2(xin, yin) {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const s  = (xin + yin) * F2;
  const i  = Math.floor(xin + s);
  const j  = Math.floor(yin + s);
  const t  = (i + j) * G2;
  const X0 = i - t, Y0 = j - t;
  const x0 = xin - X0, y0 = yin - Y0;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2*G2, y2 = y0 - 1 + 2*G2;
  const ii = i & 255, jj = j & 255;
  const gi0 = PERM[ii + PERM[jj]] % 8;
  const gi1 = PERM[ii + i1 + PERM[jj + j1]] % 8;
  const gi2 = PERM[ii + 1 + PERM[jj + 1]] % 8;
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0*x0 - y0*y0; if (t0 >= 0) { t0 *= t0; n0 = t0*t0*dot2(GRAD[gi0], x0, y0); }
  let t1 = 0.5 - x1*x1 - y1*y1; if (t1 >= 0) { t1 *= t1; n1 = t1*t1*dot2(GRAD[gi1], x1, y1); }
  let t2 = 0.5 - x2*x2 - y2*y2; if (t2 >= 0) { t2 *= t2; n2 = t2*t2*dot2(GRAD[gi2], x2, y2); }
  return 70 * (n0 + n1 + n2); // -1 ~ 1
}

// FBM: 여러 옥타브(주파수 레이어) 합산
function fbm(x, y, octaves, lacunarity, gain) {
  let val = 0, amp = 0.5, freq = 1, max = 0;
  for (let o = 0; o < octaves; o++) {
    val += simplex2(x * freq, y * freq) * amp;
    max  += amp;
    amp  *= gain;
    freq *= lacunarity;
  }
  return val / max; // -1 ~ 1 정규화
}

// ─── 지형 생성 함수 ──────────────────────────────────────────
function buildTerrain(params) {
  const { segments, size, height, scale, octaves, lacunarity, gain, offsetX, offsetZ } = params;

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2); // XZ 평면으로 회전

  const pos    = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const waterColor = new THREE.Color(0x3b82f6);
  const sandColor  = new THREE.Color(0xd4a96a);
  const grassColor = new THREE.Color(0x4a7c3f);
  const rockColor  = new THREE.Color(0x6b6b6b);
  const snowColor  = new THREE.Color(0xeef2f7);

  let minH = Infinity, maxH = -Infinity;

  // 1패스: 높이 계산
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / size * scale + offsetX;
    const z = pos.getZ(i) / size * scale + offsetZ;
    const h = fbm(x, z, octaves, lacunarity, gain);
    heights[i] = h;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }

  // 2패스: 정규화 + 색상 부여
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    // 0~1 로 정규화
    const t = (heights[i] - minH) / (maxH - minH);
    const y = t * height;
    pos.setY(i, y);

    // 높이 비율로 색상 결정
    if      (t < 0.12) c.copy(waterColor);
    else if (t < 0.22) c.lerpColors(sandColor, sandColor, 1);
    else if (t < 0.50) c.lerpColors(grassColor, grassColor, 1);
    else if (t < 0.75) c.lerpColors(rockColor, rockColor, 1);
    else               c.copy(snowColor);

    // 경계를 부드럽게
    if      (t >= 0.12 && t < 0.22) c.lerpColors(waterColor, sandColor, (t - 0.12) / 0.10);
    else if (t >= 0.22 && t < 0.30) c.lerpColors(sandColor, grassColor, (t - 0.22) / 0.08);
    else if (t >= 0.45 && t < 0.55) c.lerpColors(grassColor, rockColor,  (t - 0.45) / 0.10);
    else if (t >= 0.70 && t < 0.80) c.lerpColors(rockColor,  snowColor,  (t - 0.70) / 0.10);

    colors[i * 3    ] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // 수정된 정점에서 법선 재계산 (조명이 올바르게 적용되도록)
  geo.computeVertexNormals();

  return geo;
}

// ─── 물 표면 (반투명 평면) ───────────────────────────────────
function buildWater(size, waterLevel) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.6,
    metalness: 0.1,
    roughness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = waterLevel;
  return { mesh, geo, mat };
}

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // 하늘색
  scene.fog = new THREE.Fog(0x87ceeb, 40, 90);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 18, 28);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 4, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 5;
  controls.maxDistance = 60;

  // ─── 조명 ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x88aacc, 2.5));

  const sun = new THREE.DirectionalLight(0xfff5e0, 4);
  sun.position.set(20, 30, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 120;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
  sun.shadow.camera.right = sun.shadow.camera.top   =  40;
  scene.add(sun);

  // ─── 지형 파라미터 ────────────────────────────────────────
  let params = {
    segments:   120,  // 격자 해상도 (높을수록 부드럽지만 느림)
    size:       60,   // 지형 크기 (Three.js 단위)
    height:     12,   // 최대 높이
    scale:      3.5,  // 노이즈 샘플링 배율 (클수록 지형이 잘게 쪼개짐)
    octaves:    6,    // FBM 레이어 수 (많을수록 디테일)
    lacunarity: 2.0,  // 옥타브마다 주파수 배율
    gain:       0.5,  // 옥타브마다 진폭 감소 (0.5 = 절반씩)
    offsetX:    0,
    offsetZ:    0,
    waterLevel: 1.6,  // 물 높이
  };

  // 지형 메시
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true, // geometry의 color attribute 사용
    roughness: 0.9,
    metalness: 0.0,
  });

  let terrainGeo  = buildTerrain(params);
  let terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow    = true;
  scene.add(terrainMesh);

  // 물
  let water = buildWater(params.size, params.waterLevel);
  scene.add(water.mesh);

  // 지형 재생성
  function regenerate() {
    scene.remove(terrainMesh);
    terrainGeo.dispose();
    terrainGeo  = buildTerrain(params);
    terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow    = true;
    scene.add(terrainMesh);

    scene.remove(water.mesh);
    water.geo.dispose();
    water.mat.dispose();
    water = buildWater(params.size, params.waterLevel);
    scene.add(water.mesh);
  }

  // ─── UI 패널 ─────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'terrain-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>절차적 지형 생성</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <span>높이</span>
        <input type="range" id="t-height" min="3" max="25" step="0.5" value="12">
        <span id="t-height-val">12.0</span>
      </label>

      <label class="pp-row">
        <span>노이즈 배율</span>
        <input type="range" id="t-scale" min="1" max="8" step="0.1" value="3.5">
        <span id="t-scale-val">3.5</span>
      </label>

      <label class="pp-row">
        <span>옥타브</span>
        <input type="range" id="t-octaves" min="1" max="8" step="1" value="6">
        <span id="t-octaves-val">6</span>
      </label>

      <label class="pp-row">
        <span>Lacunarity</span>
        <input type="range" id="t-lac" min="1.5" max="3" step="0.1" value="2">
        <span id="t-lac-val">2.0</span>
      </label>

      <label class="pp-row">
        <span>Gain (감쇠)</span>
        <input type="range" id="t-gain" min="0.2" max="0.8" step="0.05" value="0.5">
        <span id="t-gain-val">0.50</span>
      </label>

      <label class="pp-row">
        <span>물 높이</span>
        <input type="range" id="t-water" min="0" max="0.5" step="0.01" value="0.13">
        <span id="t-water-val">0.13</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <button id="t-regen" style="
        width:100%; padding:7px; border-radius:6px;
        border:1px solid rgba(99,102,241,0.4);
        background:rgba(99,102,241,0.2); color:#a5b4fc;
        cursor:pointer; font-size:13px;
      ">🗺 지형 재생성</button>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">
        FBM = Σ amplitude × noise(freq × pos)<br>
        옥타브↑ = 디테일 증가<br>
        Gain↑ = 고주파 더 강하게
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  // 슬라이더 즉시 반영 (물 높이만 — 나머지는 재생성 버튼)
  const bind = (id, valId, decimals, cb) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      document.getElementById(valId).textContent = v.toFixed(decimals);
      cb(v);
    });
  };

  bind('t-height',  't-height-val',  1, v => { params.height  = v; });
  bind('t-scale',   't-scale-val',   1, v => { params.scale   = v; });
  bind('t-octaves', 't-octaves-val', 0, v => { params.octaves = v; });
  bind('t-lac',     't-lac-val',     1, v => { params.lacunarity = v; });
  bind('t-gain',    't-gain-val',    2, v => { params.gain    = v; });
  bind('t-water',   't-water-val',   2, v => {
    params.waterLevel = v * params.height;
    water.mesh.position.y = params.waterLevel;
  });

  document.getElementById('t-regen').addEventListener('click', regenerate);

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 물 표면 살짝 일렁임 (Y 오프셋)
    water.mesh.position.y = params.waterLevel + Math.sin(elapsed * 1.5) * 0.04;

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ─── 창 크기 대응 ─────────────────────────────────────────
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ─── cleanup ──────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    document.body.removeChild(ui);
    terrainGeo.dispose();
    terrainMat.dispose();
    water.geo.dispose();
    water.mat.dispose();
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
