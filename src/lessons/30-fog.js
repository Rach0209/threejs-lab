// ══════════════════════════════════════════════════════════════
//  Module 30: Fog / 대기 효과
//
//  배울 것:
//    - THREE.Fog         : 선형 안개 (near~far 사이 선형 증가)
//    - THREE.FogExp2     : 지수 안개 (밀도 기반, 더 자연스러움)
//    - scene.background  : 단색 / 텍스처 / CubeTexture
//    - 하늘 그라데이션   : ShaderMaterial로 고도별 색상 표현
//    - 고도 안개         : GLSL에서 Y 좌표 기반 밀도 조절
//    - 날씨 시스템       : 맑음→흐림→비 분위기 전환
//
//  Fog vs FogExp2:
//    Fog     : near 이전 투명, far 이후 완전 안개
//              → 실내, 터널, 평지 지형에 적합
//    FogExp2 : density 값으로 지수 감쇠
//              → 자연 안개, 수중, 먼지 분위기에 적합
//              공식: opacity = 1 - e^(-(density * distance)²)
//
//  하늘 표현:
//    단순: scene.background = color
//    중급: 하늘 전용 Mesh (SphereGeometry 뒤집어서 카메라 따라다님)
//    고급: CubeMap HDR 환경 맵 (레슨 14 참고)
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── 하늘 돔 셰이더 ──────────────────────────────────────────
//  구 안쪽에서 보이는 그라데이션 하늘
const SKY_VERT = `
varying vec3 vWorldPos;
void main() {
  vWorldPos   = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_FRAG = `
uniform vec3  uSkyTop;    // 상단(천정) 색
uniform vec3  uSkyHorizon;// 지평선 색
uniform vec3  uGroundColor;
uniform float uSunHeight; // 태양 고도 (-1~1)
varying vec3  vWorldPos;

void main() {
  // 정규화된 높이 (-1=아래, 1=위)
  float h = normalize(vWorldPos).y;

  vec3 col;
  if (h > 0.0) {
    // 하늘: 지평선 → 하늘 상단
    col = mix(uSkyHorizon, uSkyTop, pow(h, 0.5));
  } else {
    // 땅: 지평선 → 땅색
    col = mix(uSkyHorizon, uGroundColor, pow(-h, 0.3));
  }

  // 태양 방향 글로우 (지평선 부근)
  float glow = max(0.0, 1.0 - abs(h - uSunHeight * 0.3) * 6.0);
  col += vec3(1.0, 0.6, 0.2) * glow * 0.4 * max(0.0, uSunHeight + 0.3);

  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── 날씨 프리셋 ──────────────────────────────────────────────
const WEATHERS = {
  clear: {
    label: '맑음',
    fogColor:    new THREE.Color(0xc8dff5),
    fogDensity:  0.015,
    skyTop:      new THREE.Color(0x1a6bb5),
    skyHorizon:  new THREE.Color(0x8ec8f0),
    groundColor: new THREE.Color(0x3d5a3e),
    sunHeight:   0.6,
    ambientInt:  2.5,
    dirInt:      3.0,
  },
  cloudy: {
    label: '흐림',
    fogColor:    new THREE.Color(0x9aaab5),
    fogDensity:  0.03,
    skyTop:      new THREE.Color(0x5a6a75),
    skyHorizon:  new THREE.Color(0x9aaab5),
    groundColor: new THREE.Color(0x3a4a3b),
    sunHeight:   0.1,
    ambientInt:  2.0,
    dirInt:      1.2,
  },
  dusk: {
    label: '황혼',
    fogColor:    new THREE.Color(0x8b4a2a),
    fogDensity:  0.025,
    skyTop:      new THREE.Color(0x1a0a2e),
    skyHorizon:  new THREE.Color(0xd4622a),
    groundColor: new THREE.Color(0x1a1008),
    sunHeight:   0.05,
    ambientInt:  1.5,
    dirInt:      2.0,
  },
  night: {
    label: '야간',
    fogColor:    new THREE.Color(0x05080f),
    fogDensity:  0.04,
    skyTop:      new THREE.Color(0x010208),
    skyHorizon:  new THREE.Color(0x0a1020),
    groundColor: new THREE.Color(0x050508),
    sunHeight:   -0.8,
    ambientInt:  0.5,
    dirInt:      0.3,
  },
  rain: {
    label: '비',
    fogColor:    new THREE.Color(0x4a5560),
    fogDensity:  0.06,
    skyTop:      new THREE.Color(0x2a3340),
    skyHorizon:  new THREE.Color(0x4a5560),
    groundColor: new THREE.Color(0x25302a),
    sunHeight:   -0.1,
    ambientInt:  1.2,
    dirInt:      0.8,
  },
};

export function init(renderer) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 300
  );
  camera.position.set(0, 3, 15);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);
  controls.maxDistance = 60;

  // 조명
  const ambient = new THREE.AmbientLight(0xffffff, 2.5);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff5e0, 3.0);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  // ─── 하늘 돔 ───────────────────────────────────────────────
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader:   SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uSkyTop:     { value: new THREE.Color(0x1a6bb5) },
      uSkyHorizon: { value: new THREE.Color(0x8ec8f0) },
      uGroundColor:{ value: new THREE.Color(0x3d5a3e) },
      uSunHeight:  { value: 0.6 },
    },
    side: THREE.BackSide,  // 구 안쪽에서 봄
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);

  // ─── 안개 ──────────────────────────────────────────────────
  //  FogExp2: 밀도 기반 지수 감쇠 — 자연스러운 거리 안개
  scene.fog = new THREE.FogExp2(0xc8dff5, 0.015);

  // ─── 지형 (평지 + 나무들) ──────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3d5a3e, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // 나무 (단순 원기둥 + 원뿔)
  const treeMats = {
    trunk: new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 }),
    leaf:  new THREE.MeshStandardMaterial({ color: 0x2d6a2d, roughness: 0.8 }),
  };
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.5, 6);
  const leafGeo  = new THREE.ConeGeometry(0.7, 2.0, 7);

  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 4 + Math.random() * 40;
    const x     = Math.cos(angle) * dist;
    const z     = Math.sin(angle) * dist;
    const scale = 0.7 + Math.random() * 0.8;

    const trunk = new THREE.Mesh(trunkGeo, treeMats.trunk);
    trunk.position.set(x, 0.75 * scale, z);
    trunk.scale.setScalar(scale);
    scene.add(trunk);

    const leaf = new THREE.Mesh(leafGeo, treeMats.leaf);
    leaf.position.set(x, (1.5 + 1.0) * scale, z);
    leaf.scale.setScalar(scale);
    scene.add(leaf);
  }

  // 건물들 (먼 거리 배치 → 안개 효과 강조)
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0x6b7a8d, roughness: 0.7 });
  [[10,0,20],[-10,0,25],[5,0,35],[-8,0,40],[15,0,50]].forEach(([x,,z]) => {
    const h   = 4 + Math.random() * 8;
    const geo = new THREE.BoxGeometry(2 + Math.random() * 2, h, 2 + Math.random() * 2);
    const mesh = new THREE.Mesh(geo, buildingMat);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
  });

  // ─── 비 파티클 (rain 모드용) ──────────────────────────────
  const RAIN_COUNT = 3000;
  const rainPositions = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainPositions[i * 3]     = (Math.random() - 0.5) * 40;
    rainPositions[i * 3 + 1] = Math.random() * 20;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rainPositions, 3));
  const rainMat  = new THREE.PointsMaterial({
    color: 0x99ccff, size: 0.05, transparent: true, opacity: 0.6,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.visible = false;
  scene.add(rain);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'fog-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>Fog / 대기 효과</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">날씨 프리셋</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
        ${Object.entries(WEATHERS).map(([k, w]) => `
          <button class="weather-btn" data-key="${k}" style="flex:1;padding:5px 4px;border-radius:4px;font-size:11px;font-weight:700;
            cursor:pointer;border:none;background:#334155;color:#94a3b8;">
            ${w.label}
          </button>`).join('')}
      </div>

      <label class="pp-row">
        <span>안개 밀도</span>
        <input type="range" id="fog-density" min="0" max="0.15" step="0.002" value="0.015">
        <span id="fog-density-val">0.015</span>
      </label>

      <label class="pp-row">
        <span>안개 종류</span>
        <select id="fog-type" style="flex:1;background:#1e293b;color:#94a3b8;
          border:1px solid #334155;border-radius:4px;padding:2px 4px;font-size:11px;">
          <option value="exp2">FogExp2 (지수 — 자연)</option>
          <option value="linear">Fog (선형 — 균일)</option>
        </select>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        카메라 앞뒤로 움직이면<br>
        안개로 물체가 사라지는 효과<br>
        <span style="color:#818cf8">FogExp2</span>: 지수 감쇠 (자연스러움)<br>
        <span style="color:#34d399">Fog</span>: near~far 선형 감쇠
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  // 날씨 전환 (부드럽게 lerp)
  let currentWeather = WEATHERS.clear;
  let targetWeather  = WEATHERS.clear;
  let transitionT    = 1;

  function setWeather(key) {
    targetWeather = WEATHERS[key];
    transitionT   = 0;
    rain.visible  = key === 'rain';

    document.querySelectorAll('.weather-btn').forEach(b => {
      b.style.background = b.dataset.key === key ? '#6366f1' : '#334155';
      b.style.color      = b.dataset.key === key ? '#fff'    : '#94a3b8';
    });
  }

  document.querySelectorAll('.weather-btn').forEach(b => {
    b.addEventListener('click', () => setWeather(b.dataset.key));
  });
  setWeather('clear');

  document.getElementById('fog-density').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('fog-density-val').textContent = v.toFixed(3);
    if (scene.fog) scene.fog.density = v;
  });

  document.getElementById('fog-type').addEventListener('change', e => {
    const color = scene.fog ? scene.fog.color.clone() : new THREE.Color(0xc8dff5);
    if (e.target.value === 'exp2') {
      scene.fog = new THREE.FogExp2(color, 0.015);
    } else {
      scene.fog = new THREE.Fog(color, 10, 80);
    }
    document.getElementById('fog-density').style.display =
      e.target.value === 'exp2' ? '' : 'none';
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;
  const _tmpColor = new THREE.Color();

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta   = timer.getDelta();
    const elapsed = timer.getElapsed();

    // 날씨 전환 (0.8초)
    if (transitionT < 1) {
      transitionT = Math.min(1, transitionT + delta / 0.8);
      const eased = transitionT * transitionT * (3 - 2 * transitionT); // smoothstep

      scene.fog.color.lerpColors(currentWeather.fogColor, targetWeather.fogColor, eased);
      if (scene.fog.density !== undefined) {
        scene.fog.density = THREE.MathUtils.lerp(
          currentWeather.fogDensity, targetWeather.fogDensity, eased
        );
        document.getElementById('fog-density').value =
          scene.fog.density.toFixed(3);
        document.getElementById('fog-density-val').textContent =
          scene.fog.density.toFixed(3);
      }

      skyMat.uniforms.uSkyTop.value.lerpColors(
        currentWeather.skyTop, targetWeather.skyTop, eased
      );
      skyMat.uniforms.uSkyHorizon.value.lerpColors(
        currentWeather.skyHorizon, targetWeather.skyHorizon, eased
      );
      skyMat.uniforms.uGroundColor.value.lerpColors(
        currentWeather.groundColor, targetWeather.groundColor, eased
      );
      skyMat.uniforms.uSunHeight.value = THREE.MathUtils.lerp(
        currentWeather.sunHeight, targetWeather.sunHeight, eased
      );
      ambient.intensity = THREE.MathUtils.lerp(
        currentWeather.ambientInt, targetWeather.ambientInt, eased
      );
      sun.intensity = THREE.MathUtils.lerp(
        currentWeather.dirInt, targetWeather.dirInt, eased
      );

      if (transitionT >= 1) currentWeather = targetWeather;
    }

    // 비 파티클 낙하
    if (rain.visible) {
      const pos = rain.geometry.attributes.position.array;
      for (let i = 0; i < RAIN_COUNT; i++) {
        pos[i * 3 + 1] -= 0.3;
        if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 20;
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }

    // 하늘 돔이 카메라 따라다니게
    skyDome.position.copy(camera.position);

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
    scene.fog = null;
    [skyGeo, skyMat, floorGeo, floorMat, trunkGeo, leafGeo,
     treeMats.trunk, treeMats.leaf, buildingMat, rainGeo, rainMat].forEach(o => o?.dispose?.());
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
