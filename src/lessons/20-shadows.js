// ══════════════════════════════════════════════════════════════
//  Module 20: Shadow 심화
//
//  배울 것:
//    - ShadowMap 종류    : BasicShadowMap / PCF / PCFSoft / VSM
//    - Shadow Bias       : 그림자 아크네(acne) 제거
//    - Shadow Camera     : 범위/near/far 설정으로 품질 제어
//    - mapSize           : 해상도와 성능 트레이드오프
//    - PointLight Shadow : 옴니디렉셔널 큐브 섀도우맵
//    - SpotLight Shadow  : 원뿔형 섀도우맵
//
//  ShadowMap 종류 비교:
//    BasicShadowMap   — 가장 빠름, 계단형 엣지
//    PCFShadowMap     — 주변 샘플 평균, 부드러운 엣지 (기본값)
//    PCFSoftShadowMap — 더 넓은 커널, 더 부드러움 (r185 deprecated)
//    VSMShadowMap     — 분산 기반, 블러 가능, 빛 번짐(light bleed) 주의
//
//  Shadow Acne (그림자 여드름):
//    오브젝트가 자기 자신에게 그림자를 드리우는 오류.
//    → bias 값을 약간 음수로 설정해 해결.
//    bias가 너무 크면 그림자가 오브젝트에서 떠 보임(Peter Panning).
//
//  Shadow Camera:
//    DirectionalLight는 OrthographicCamera로 그림자 계산.
//    left/right/top/bottom으로 범위를 씬에 딱 맞게 줄일수록 품질↑.
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraHelper } from 'three';

export function init(renderer) {
  // ─── 초기 ShadowMap 타입 설정 ─────────────────────────────
  //  renderer.shadowMap.type은 전역 설정 — 변경 시 재질 needsUpdate 필요
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111827);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 8, 14);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);

  // ─── 바닥 + 뒷벽 (그림자 받는 면) ────────────────────────
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const wallGeo  = new THREE.PlaneGeometry(20, 10);
  const recvMat  = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });

  const floor = new THREE.Mesh(floorGeo, recvMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(wallGeo, recvMat.clone());
  wall.position.set(0, 5, -6);
  wall.receiveShadow = true;
  scene.add(wall);

  // ─── 오브젝트들 ───────────────────────────────────────────
  const objects = [];

  const mats = [
    new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.3, metalness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.5, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.6 }),
  ];

  const geos = [
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.SphereGeometry(0.7, 32, 32),
    new THREE.CylinderGeometry(0.5, 0.5, 1.4, 32),
    new THREE.TorusKnotGeometry(0.45, 0.15, 64, 12),
  ];

  geos.forEach((geo, i) => {
    const mesh = new THREE.Mesh(geo, mats[i]);
    mesh.position.set(-4.5 + i * 3, 0.8, 0);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    objects.push(mesh);
  });

  // ─── DirectionalLight + 섀도우 카메라 ────────────────────
  //
  //  DirectionalLight는 평행광 → OrthographicCamera로 섀도우맵 생성.
  //  shadow.camera의 범위를 씬에 맞게 조이면 섀도우 품질이 크게 향상.
  //
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(6, 10, 4);
  dirLight.castShadow = true;

  dirLight.shadow.mapSize.set(1024, 1024); // 섀도우맵 해상도
  dirLight.shadow.camera.near   =  1;
  dirLight.shadow.camera.far    = 25;
  dirLight.shadow.camera.left   = -10;
  dirLight.shadow.camera.right  =  10;
  dirLight.shadow.camera.top    =  10;
  dirLight.shadow.camera.bottom = -10;
  dirLight.shadow.bias          = -0.001; // Acne 방지

  scene.add(dirLight);
  const dirHelper = new THREE.DirectionalLightHelper(dirLight, 1);
  scene.add(dirHelper);

  // 섀도우 카메라 시각화 (기본 숨김)
  const shadowCamHelper = new CameraHelper(dirLight.shadow.camera);
  shadowCamHelper.visible = false;
  scene.add(shadowCamHelper);

  // ─── SpotLight ────────────────────────────────────────────
  const spotLight = new THREE.SpotLight(0x44aaff, 120, 25, Math.PI * 0.4, 0.15);
  spotLight.position.set(-5, 8, 2);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(512, 512);
  spotLight.shadow.bias = -0.002;
  spotLight.visible = false; // 초기 비활성
  scene.add(spotLight);
  scene.add(spotLight.target);
  spotLight.target.position.set(0, 0, 0);

  const spotHelper = new THREE.SpotLightHelper(spotLight);
  spotHelper.visible = false;
  scene.add(spotHelper);

  // ─── PointLight ───────────────────────────────────────────
  //  PointLight 섀도우는 6방향 큐브맵 → 가장 비쌈
  const pointLight = new THREE.PointLight(0xff6644, 30, 15);
  pointLight.position.set(0, 5, 2);
  pointLight.castShadow = true;
  pointLight.shadow.mapSize.set(512, 512);
  pointLight.shadow.bias = -0.005;
  pointLight.visible = false;
  scene.add(pointLight);

  const pointHelper = new THREE.PointLightHelper(pointLight, 0.3);
  pointHelper.visible = false;
  scene.add(pointHelper);

  // 주변광
  scene.add(new THREE.AmbientLight(0x223355, 2));

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'shadow-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>Shadow 심화</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">ShadowMap 타입</p>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="toon-btn active" data-type="PCF">PCF</button>
        <button class="toon-btn" data-type="Basic">Basic</button>
        <button class="toon-btn" data-type="VSM">VSM</button>
      </div>

      <label class="pp-row">
        <span>MapSize</span>
        <select id="map-size" style="flex:1;background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:4px;padding:2px 4px;font-size:11px;">
          <option value="256">256 (빠름)</option>
          <option value="512">512</option>
          <option value="1024" selected>1024 (기본)</option>
          <option value="2048">2048 (선명)</option>
        </select>
      </label>

      <label class="pp-row" style="margin-top:6px;">
        <span>Bias</span>
        <input type="range" id="shadow-bias" min="-0.01" max="0.01" step="0.0005" value="-0.001">
        <span id="shadow-bias-val">-0.001</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;margin-bottom:6px">광원 선택</p>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="toon-btn active" data-light="dir">Directional</button>
        <button class="toon-btn" data-light="spot">Spot</button>
        <button class="toon-btn" data-light="point">Point</button>
      </div>

      <label class="pp-row">
        <input type="checkbox" id="show-cam">
        <span>섀도우 카메라 표시</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        Basic  — 계단형, 빠름<br>
        PCF    — 부드러운 엣지<br>
        VSM    — 블러 가능, 빛 번짐 주의<br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(Bias는 0 고정 필요)<br>
        Bias↓  → Acne 제거<br>
        Bias↑  → Peter Panning 발생
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  const btnStyle = document.createElement('style');
  btnStyle.id = 'shadow-btn-style';
  btnStyle.textContent = `
    .toon-btn {
      padding:4px 8px; border-radius:6px; border:1px solid rgba(99,102,241,0.3);
      background:rgba(99,102,241,0.1); color:#a5b4fc; cursor:pointer;
      font-size:11px; transition:background 0.15s;
    }
    .toon-btn:hover  { background:rgba(99,102,241,0.25); }
    .toon-btn.active { background:rgba(99,102,241,0.35); border-color:#6366f1; color:#e0e7ff; }
  `;
  document.head.appendChild(btnStyle);

  // ShadowMap 타입 전환
  const typeMap = {
    Basic: THREE.BasicShadowMap,
    PCF:   THREE.PCFShadowMap,
    VSM:   THREE.VSMShadowMap,
  };
  const biasSlider  = document.getElementById('shadow-bias');
  const biasValEl   = document.getElementById('shadow-bias-val');

  function applyBias(v) {
    dirLight.shadow.bias   = v;
    spotLight.shadow.bias  = v;
    pointLight.shadow.bias = v;
    biasValEl.textContent  = v.toFixed(4);
  }

  document.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderer.shadowMap.type = typeMap[btn.dataset.type];

      // VSM은 bias를 0으로 고정해야 정상 동작
      // (분산 기반 계산에서 bias가 0이 아니면 전체가 어두워지는 아티팩트 발생)
      if (btn.dataset.type === 'VSM') {
        biasSlider.value    = '0';
        biasSlider.disabled = true;
        biasSlider.style.opacity = '0.4';
        applyBias(0);
      } else {
        biasSlider.disabled = false;
        biasSlider.style.opacity = '1';
        biasSlider.value = '-0.001';
        applyBias(-0.001);
      }

      scene.traverse(obj => { if (obj.material) obj.material.needsUpdate = true; });
    });
  });

  // mapSize 변경 — 세 광원 모두 갱신 (섀도우맵 null 처리로 다음 프레임에 재생성)
  function applyMapSize(size) {
    [dirLight, spotLight, pointLight].forEach(l => {
      l.shadow.mapSize.set(size, size);
      l.shadow.map?.dispose();
      l.shadow.map = null;
    });
  }

  document.getElementById('map-size').addEventListener('change', e => {
    applyMapSize(parseInt(e.target.value));
  });

  // bias
  biasSlider.addEventListener('input', e => {
    applyBias(parseFloat(e.target.value));
  });

  // 광원 전환
  document.querySelectorAll('[data-light]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-light]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.dataset.light;
      dirLight.visible   = t === 'dir';
      spotLight.visible  = t === 'spot';
      pointLight.visible = t === 'point';
      dirHelper.visible   = t === 'dir';
      spotHelper.visible  = t === 'spot';
      pointHelper.visible = t === 'point';
      shadowCamHelper.visible = t === 'dir' && document.getElementById('show-cam').checked;
    });
  });

  // 카메라 헬퍼
  document.getElementById('show-cam').addEventListener('change', e => {
    shadowCamHelper.visible = e.target.checked && dirLight.visible;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    objects.forEach((mesh, i) => {
      mesh.rotation.y = elapsed * (0.4 + i * 0.15);
      mesh.position.y = 0.8 + Math.sin(elapsed * 0.8 + i * 1.2) * 0.3;
    });

    // 포인트 라이트 이동
    if (pointLight.visible) {
      pointLight.position.x = Math.sin(elapsed * 0.8) * 4;
      pointLight.position.z = Math.cos(elapsed * 0.6) * 3;
      pointHelper.update();
    }

    if (shadowCamHelper.visible) shadowCamHelper.update();

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
    document.head.removeChild(btnStyle);
    renderer.shadowMap.type = THREE.PCFShadowMap;
    geos.forEach(g => g.dispose());
    mats.forEach(m => m.dispose());
    floorGeo.dispose(); recvMat.dispose();
    wallGeo.dispose();
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
