// ══════════════════════════════════════════════════════════════
//  Module 31: Water / 물 표면 시뮬레이션
//
//  배울 것:
//    - 물 표면 GLSL   : sin 파형 중첩으로 파도 표현 (Gerstner Wave)
//    - 법선 재계산    : 정점이 움직이면 조명 계산용 법선도 갱신
//    - 반사/굴절 흉내 : envMap + fresnel 효과
//    - Fresnel        : 수면을 얕은 각도로 보면 반사↑, 수직으로 보면 투명↑
//    - Foam(거품)     : 파도 마루(높은 곳)에 흰색 거품 표현
//
//  Gerstner Wave:
//    단순 sin 파도와 달리 x,y,z를 모두 이동 → 더 자연스러운 파도 모양
//    x += A * (D.x) * cos(dot(D,pos)*k + t*w)
//    y += A       * sin(dot(D,pos)*k + t*w)
//    z += A * (D.z) * cos(dot(D,pos)*k + t*w)
//
//  셰이더 접근법:
//    vertex shader : 정점 Y위치를 time에 따라 이동
//    fragment shader: 법선 기반 조명 + fresnel + 컬러 혼합
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── 물 셰이더 ───────────────────────────────────────────────
const WATER_VERT = `
uniform float uTime;
uniform float uWaveHeight;
uniform float uWaveSpeed;
uniform float uWaveFreq;

varying vec3  vWorldPos;
varying vec3  vNormal;
varying float vWaveHeight; // 파도 높이 (거품 계산용)

// Gerstner Wave 함수
vec3 gerstner(vec3 pos, vec2 dir, float amp, float freq, float speed, float steep) {
  float k     = freq;
  float w     = speed;
  float phase = dot(dir, pos.xz) * k + uTime * w;
  float c     = cos(phase), s = sin(phase);
  return vec3(
    steep * amp * dir.x * c,
    amp * s,
    steep * amp * dir.y * c
  );
}

void main() {
  vec3 pos = position;

  // 파도 4개 중첩 (방향·주파수·진폭 다양하게)
  vec3 w1 = gerstner(pos, normalize(vec2(1.0,  0.6)), uWaveHeight * 0.5, uWaveFreq * 1.0, uWaveSpeed * 1.0, 0.8);
  vec3 w2 = gerstner(pos, normalize(vec2(0.4, -1.0)), uWaveHeight * 0.3, uWaveFreq * 1.7, uWaveSpeed * 1.3, 0.5);
  vec3 w3 = gerstner(pos, normalize(vec2(-0.7, 0.8)), uWaveHeight * 0.2, uWaveFreq * 2.3, uWaveSpeed * 0.9, 0.3);
  vec3 w4 = gerstner(pos, normalize(vec2(1.0, -0.3)), uWaveHeight * 0.15, uWaveFreq * 3.1, uWaveSpeed * 1.5, 0.2);

  pos += w1 + w2 + w3 + w4;
  vWaveHeight = pos.y / (uWaveHeight + 0.001);

  // 법선: 파도에 맞게 근사 계산
  float eps = 0.1;
  vec3 px = position + vec3(eps, 0.0, 0.0);
  vec3 pz = position + vec3(0.0, 0.0, eps);
  vec3 dx = gerstner(px, normalize(vec2(1.0, 0.6)),  uWaveHeight*0.5, uWaveFreq*1.0, uWaveSpeed*1.0, 0.8)
           +gerstner(px, normalize(vec2(0.4,-1.0)),  uWaveHeight*0.3, uWaveFreq*1.7, uWaveSpeed*1.3, 0.5);
  vec3 dz = gerstner(pz, normalize(vec2(1.0, 0.6)),  uWaveHeight*0.5, uWaveFreq*1.0, uWaveSpeed*1.0, 0.8)
           +gerstner(pz, normalize(vec2(0.4,-1.0)),  uWaveHeight*0.3, uWaveFreq*1.7, uWaveSpeed*1.3, 0.5);
  vec3 tangentX = normalize((px + dx) - pos);
  vec3 tangentZ = normalize((pz + dz) - pos);
  vNormal = normalize(cross(tangentZ, tangentX));

  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const WATER_FRAG = `
precision highp float;
uniform vec3  uWaterShallow; // 얕은 물 색 (투명한 청록)
uniform vec3  uWaterDeep;    // 깊은 물 색 (진한 남색)
uniform vec3  uSunDir;       // 태양 방향
uniform vec3  uCameraPos;
uniform float uFoamThreshold;

varying vec3  vWorldPos;
varying vec3  vNormal;
varying float vWaveHeight;

void main() {
  vec3  N        = normalize(vNormal);
  vec3  V        = normalize(uCameraPos - vWorldPos);  // 시선 벡터
  vec3  L        = normalize(uSunDir);

  // Fresnel: 수직→투명, 얕은 각도→반사
  float fresnel  = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  // 물 색: 깊이감 (fresnel 낮을수록 깊어 보임)
  vec3 waterCol  = mix(uWaterDeep, uWaterShallow, fresnel * 0.5 + 0.2);

  // 정반사 (Blinn-Phong)
  vec3  H        = normalize(L + V);
  float spec     = pow(max(dot(N, H), 0.0), 128.0) * 2.0;

  // 거품: 파도 마루에 흰색 추가
  float foam     = smoothstep(uFoamThreshold - 0.1, uFoamThreshold + 0.1, vWaveHeight);

  vec3 col = waterCol + vec3(spec) + vec3(foam) * 0.7;

  // 반투명
  float alpha = mix(0.75, 0.95, fresnel) + foam * 0.2;
  gl_FragColor = vec4(col, alpha);
}
`;

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 200
  );
  camera.position.set(0, 5, 14);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI * 0.55;

  // 조명
  scene.add(new THREE.AmbientLight(0x88bbcc, 2));
  const sun = new THREE.DirectionalLight(0xfff5e0, 3);
  sun.position.set(10, 20, 5);
  scene.add(sun);

  // ─── 물 메시 ───────────────────────────────────────────────
  const WATER_SIZE = 40;
  const WATER_SEGS = 128; // 촘촘할수록 파도 부드러움
  const waterGeo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGS, WATER_SEGS);
  waterGeo.rotateX(-Math.PI / 2);

  const waterMat = new THREE.ShaderMaterial({
    vertexShader:   WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {
      uTime:          { value: 0 },
      uWaveHeight:    { value: 0.4 },
      uWaveSpeed:     { value: 1.0 },
      uWaveFreq:      { value: 0.5 },
      uWaterShallow:  { value: new THREE.Color(0x40b0d0) },
      uWaterDeep:     { value: new THREE.Color(0x04366b) },
      uSunDir:        { value: sun.position.clone().normalize() },
      uCameraPos:     { value: camera.position },
      uFoamThreshold: { value: 0.6 },
    },
    transparent: true,
    side: THREE.DoubleSide,
  });

  const water = new THREE.Mesh(waterGeo, waterMat);
  scene.add(water);

  // ─── 섬 / 환경 오브젝트 ────────────────────────────────────
  // 섬 (원뿔 + 원기둥 합친 형태)
  const islandGeo = new THREE.CylinderGeometry(0, 3, 2, 16);
  const islandMat = new THREE.MeshStandardMaterial({ color: 0xc4a35a, roughness: 1 });
  const island    = new THREE.Mesh(islandGeo, islandMat);
  island.position.set(-5, -0.5, -3);
  scene.add(island);

  const islandTopGeo = new THREE.CylinderGeometry(3, 3, 0.5, 16);
  const islandTop    = new THREE.Mesh(islandTopGeo, new THREE.MeshStandardMaterial({ color: 0x5a8a3a, roughness: 0.9 }));
  islandTop.position.set(-5, 0.3, -3);
  scene.add(islandTop);

  // 야자수 (간단 표현)
  const palmTrunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 2.5, 6);
  const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6914 });
  const palmTrunk    = new THREE.Mesh(palmTrunkGeo, palmTrunkMat);
  palmTrunk.position.set(-5, 1.8, -3);
  palmTrunk.rotation.z = 0.15;
  scene.add(palmTrunk);

  const palmLeafGeo = new THREE.SphereGeometry(1.2, 8, 5);
  const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x2d7a1e, roughness: 0.8 });
  const palmLeaf    = new THREE.Mesh(palmLeafGeo, palmLeafMat);
  palmLeaf.scale.set(1, 0.4, 1);
  palmLeaf.position.set(-4.7, 3.2, -2.8);
  scene.add(palmLeaf);

  // 바위들
  [[3,0,2,0.9],[7,0,-1,1.3],[-2,0,5,0.7],[5,0,4,0.5]].forEach(([x,y,z,s]) => {
    const geo  = new THREE.DodecahedronGeometry(s, 0);
    const mat  = new THREE.MeshStandardMaterial({ color: 0x5a5a6a, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y - s * 0.3, z);
    mesh.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(mesh);
  });

  // 부표 (물 위에 떠 있는)
  const buoyGeo = new THREE.SphereGeometry(0.25, 12, 12);
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xff4422 });
  const buoy    = new THREE.Mesh(buoyGeo, buoyMat);
  buoy.position.set(4, 0, 2);
  scene.add(buoy);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'water-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>Water — Gerstner 파도</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <span>파도 높이</span>
        <input type="range" id="wave-h" min="0" max="1.5" step="0.05" value="0.4">
        <span id="wave-h-val">0.40</span>
      </label>
      <label class="pp-row">
        <span>파도 속도</span>
        <input type="range" id="wave-s" min="0" max="3" step="0.1" value="1.0">
        <span id="wave-s-val">1.0</span>
      </label>
      <label class="pp-row">
        <span>파도 주파수</span>
        <input type="range" id="wave-f" min="0.1" max="2" step="0.05" value="0.5">
        <span id="wave-f-val">0.50</span>
      </label>
      <label class="pp-row">
        <span>거품 임계값</span>
        <input type="range" id="foam" min="0.3" max="1" step="0.05" value="0.6">
        <span id="foam-val">0.60</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;margin-bottom:4px">물 색상</p>
      <div style="display:flex;gap:4px;">
        <button class="color-btn" data-shallow="#40b0d0" data-deep="#04366b"
          style="flex:1;padding:4px;border-radius:4px;border:none;cursor:pointer;
          background:linear-gradient(#40b0d0,#04366b);color:#fff;font-size:10px">바다</button>
        <button class="color-btn" data-shallow="#30c090" data-deep="#005040"
          style="flex:1;padding:4px;border-radius:4px;border:none;cursor:pointer;
          background:linear-gradient(#30c090,#005040);color:#fff;font-size:10px">에메랄드</button>
        <button class="color-btn" data-shallow="#667799" data-deep="#223355"
          style="flex:1;padding:4px;border-radius:4px;border:none;cursor:pointer;
          background:linear-gradient(#667799,#223355);color:#fff;font-size:10px">북극해</button>
      </div>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        Gerstner 파도 4개 중첩<br>
        <span style="color:#38bdf8">Fresnel</span>: 얕은 각도→반사↑<br>
        <span style="color:#fff">흰색 부분</span>: 파도 마루 거품
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  const u = waterMat.uniforms;
  document.getElementById('wave-h').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('wave-h-val').textContent = v.toFixed(2);
    u.uWaveHeight.value = v;
  });
  document.getElementById('wave-s').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('wave-s-val').textContent = v.toFixed(1);
    u.uWaveSpeed.value = v;
  });
  document.getElementById('wave-f').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('wave-f-val').textContent = v.toFixed(2);
    u.uWaveFreq.value = v;
  });
  document.getElementById('foam').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('foam-val').textContent = v.toFixed(2);
    u.uFoamThreshold.value = v;
  });

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      u.uWaterShallow.value.set(btn.dataset.shallow);
      u.uWaterDeep.value.set(btn.dataset.deep);
    });
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    u.uTime.value = elapsed;
    u.uCameraPos.value.copy(camera.position);

    // 부표가 파도에 따라 흔들림 (CPU에서 같은 공식 근사)
    buoy.position.y = Math.sin(elapsed * 1.2 + 1.5) * 0.2
                    + Math.sin(elapsed * 0.9 + 0.5) * 0.15
                    + u.uWaveHeight.value * 0.3;
    buoy.rotation.x = Math.sin(elapsed * 0.8) * 0.15;
    buoy.rotation.z = Math.sin(elapsed * 1.1) * 0.12;

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
    waterGeo.dispose(); waterMat.dispose();
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
