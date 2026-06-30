// ══════════════════════════════════════════════════════════════
//  Module 14: Environment Map / IBL (이미지 기반 조명)
//
//  배울 것:
//    - PMREMGenerator  : HDR 환경 텍스처를 PBR용으로 변환
//    - RoomEnvironment : Three.js 내장 스튜디오 환경맵
//    - scene.environment : 씬 전체에 환경광으로 적용
//    - scene.background  : 배경으로도 사용 가능
//    - envMapIntensity   : 재질별 환경맵 반사 강도 조절
//
//  IBL(Image Based Lighting)이란?
//    HDR 사진(360° 파노라마)으로 만든 큐브맵을 광원으로 사용.
//    전통적인 PointLight/DirectionalLight와 달리
//    "주변 세계에서 오는 빛" 전체를 표현할 수 있어
//    사실적인 금속·유리·플라스틱 재질 표현에 필수.
//
//  PBR + IBL 조합:
//    MeshStandardMaterial의 metalness/roughness 파라미터가
//    환경맵과 결합돼야 비로소 실사에 가까운 결과가 나옴.
//
//  렌더링 파이프라인:
//    HDR 이미지 → PMREMGenerator → Prefiltered Mipmap →
//    specular/diffuse 분리 → shader에서 roughness로 샘플링
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function init(renderer) {
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 7);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate      = true;
  controls.autoRotateSpeed = 0.6;

  // ─── PMREMGenerator + RoomEnvironment ────────────────────
  //
  //  PMREMGenerator: HDR 환경 텍스처를 PBR 셰이더가 사용할 수 있도록
  //  밉맵(Prefiltered Mipmap) 형태로 전처리하는 도구.
  //  roughness 값에 따라 다른 밉맵 레벨을 샘플링해 흐릿한 반사를 표현.
  //
  const pmrem = new THREE.PMREMGenerator(renderer);

  //  RoomEnvironment: Three.js 내장 스튜디오 환경
  //  실제 프로젝트에서는 .hdr / .exr 파일을 RGBELoader로 로드
  const envTexture = pmrem.fromScene(new RoomEnvironment()).texture;
  pmrem.dispose(); // 전처리 완료 후 Generator는 즉시 해제

  //  scene.environment = 모든 PBR 재질에 자동으로 환경광 적용
  scene.environment = envTexture;

  //  scene.background = 배경도 환경맵으로 (주석 해제하면 활성화)
  // scene.background = envTexture;
  scene.background = new THREE.Color(0x111118);

  // ─── 재질별 비교 구체 ────────────────────────────────────
  //
  //  같은 환경맵 아래 metalness / roughness 조합에 따라
  //  얼마나 다르게 보이는지 비교
  //
  const sphereGeo = new THREE.SphereGeometry(0.7, 64, 64);

  // [metalness, roughness, color, label]
  const configs = [
    [1.0, 0.0,  0xffffff, '금속\n매끄러움'],
    [1.0, 0.5,  0xffffff, '금속\n거칠음'],
    [1.0, 1.0,  0xffffff, '금속\n매우거침'],
    [0.0, 0.0,  0xffffff, '비금속\n매끄러움'],
    [0.0, 0.5,  0x4488ff, '비금속\n거칠음'],
    [0.0, 1.0,  0xff6644, '비금속\n매우거침'],
  ];

  const spheres = [];
  const spacing = 2.0;
  const startX  = -(configs.length - 1) * spacing * 0.5;

  configs.forEach(([metalness, roughness, color, label], i) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      // envMapIntensity: 환경맵 반사 강도 (기본 1.0)
      envMapIntensity: 1.0,
    });
    const sphere = new THREE.Mesh(sphereGeo, mat);
    sphere.position.x = startX + i * spacing;
    scene.add(sphere);
    spheres.push({ mesh: sphere, mat });

    // 라벨 스프라이트
    const sprite = makeLabel(label);
    sprite.position.set(startX + i * spacing, -1.1, 0);
    scene.add(sprite);
  });

  // ─── 반사 확인용 평면 ─────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(20, 4);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x222230,
    metalness: 0.5,
    roughness: 0.3,
    envMapIntensity: 1.0,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.0;
  scene.add(floor);

  // ─── 보조 조명 (환경맵만으론 그림자가 없으므로) ───────────
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // ─── UI 패널 ─────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'env-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto; min-width:230px;">
      <p><strong>Environment Map / IBL</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <span>환경맵 강도</span>
        <input type="range" id="env-intensity" min="0" max="3" step="0.05" value="1">
        <span id="env-intensity-val">1.00</span>
      </label>

      <label class="pp-row">
        <input type="checkbox" id="env-bg-toggle">
        <span>배경도 환경맵 사용</span>
      </label>

      <label class="pp-row">
        <input type="checkbox" id="env-rotate" checked>
        <span>자동 회전</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">
        왼쪽 → 오른쪽<br>
        metalness: 1.0 (금속)<br>
        roughness: 0.0 ~ 1.0<br><br>
        오른쪽 3개: 비금속<br>
        roughness만 변화
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  // 슬라이더 — 모든 구체의 envMapIntensity 동시 변경
  const intensityEl  = document.getElementById('env-intensity');
  const intensityVal = document.getElementById('env-intensity-val');
  intensityEl.addEventListener('input', () => {
    const v = parseFloat(intensityEl.value);
    intensityVal.textContent = v.toFixed(2);
    spheres.forEach(({ mat }) => { mat.envMapIntensity = v; });
    floorMat.envMapIntensity = v;
  });

  // 배경 토글
  document.getElementById('env-bg-toggle').addEventListener('change', e => {
    scene.background = e.target.checked ? envTexture : new THREE.Color(0x111118);
  });

  // 자동 회전 토글
  document.getElementById('env-rotate').addEventListener('change', e => {
    controls.autoRotate = e.target.checked;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
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

  // ─── cleanup ──────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    document.body.removeChild(ui);
    envTexture.dispose();
    sphereGeo.dispose();
    floorGeo.dispose();
    floorMat.dispose();
    spheres.forEach(({ mat }) => mat.dispose());
    // 씬에 추가된 스프라이트 라벨 정리
    scene.children
      .filter(o => o.isSprite)
      .forEach(s => { s.material.map?.dispose(); s.material.dispose(); });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

// ─── 라벨 헬퍼 ────────────────────────────────────────────────
function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#94a3b8';
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  text.split('\n').forEach((line, i) => ctx.fillText(line, 128, 28 + i * 28));
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(2, 0.75, 1);
  return sprite;
}
