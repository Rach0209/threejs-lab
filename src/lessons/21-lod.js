// ══════════════════════════════════════════════════════════════
//  Module 21: LOD (Level of Detail)
//
//  배울 것:
//    - THREE.LOD        : 카메라 거리에 따라 자동으로 메시를 교체
//    - LOD.addLevel()   : 거리 임계값마다 다른 Geometry 등록
//    - 성능 최적화      : 먼 오브젝트는 폴리곤 수를 줄여 GPU 절약
//    - 폴리곤 수 시각화 : wireframe으로 디테일 차이 확인
//
//  LOD란?
//    같은 오브젝트를 거리에 따라 다른 해상도 메시로 교체하는 기법.
//    멀리 있으면 저해상도(적은 폴리곤), 가까이 오면 고해상도.
//
//    예) 구체:
//      0m~8m   : 64×64 세그먼트 (고품질)
//      8m~20m  : 16×16 세그먼트 (중간)
//      20m~50m : 4×4  세그먼트 (저품질)
//      50m~    : 안 보임 (완전 제거)
//
//  활용:
//    - 게임 오픈월드: 멀리 있는 나무/건물 폴리곤 절감
//    - 대규모 씬: 수천 개 오브젝트를 LOD로 성능 유지
//    - Three.js LOD는 카메라 위치를 기준으로 자동 계산
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// 거리별 세그먼트 수 (구체)
const SPHERE_LEVELS = [
  { distance:  0, segments: 64, label: 'High (64×64)',   color: 0x6366f1 },
  { distance:  8, segments: 16, label: 'Mid  (16×16)',   color: 0x10b981 },
  { distance: 20, segments:  6, label: 'Low  (6×6)',     color: 0xf59e0b },
  { distance: 40, segments:  3, label: 'Tiny (3×3)',     color: 0xf43f5e },
];

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);
  scene.fog = new THREE.Fog(0x0f172a, 40, 80);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 4, 6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, -10);

  // ─── 조명 ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x334466, 3));
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(5, 10, 5);
  scene.add(sun);

  // ─── 바닥 ─────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(60, 200);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -50;
  scene.add(floor);
  scene.add(new THREE.GridHelper(200, 40, 0x334155, 0x1e293b));

  // ─── LOD 오브젝트 배열 생성 ───────────────────────────────
  //
  //  THREE.LOD:
  //    addLevel(mesh, distance) — 해당 거리 이상일 때 이 mesh 사용
  //    거리가 가까운 순서대로 등록 (distance 0부터)
  //    update(camera) — 매 프레임 카메라 거리 계산 후 자동 교체
  //    (OrbitControls + enableDamping 사용 시 자동으로 동작)
  //
  const lodObjects = [];
  let showWireframe = false;

  function buildLODSphere(position) {
    const lod = new THREE.LOD();

    SPHERE_LEVELS.forEach(({ distance, segments, color }) => {
      const geo  = new THREE.SphereGeometry(1, segments, segments);
      const mat  = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.3,
        wireframe: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      lod.addLevel(mesh, distance);
    });

    lod.position.copy(position);
    scene.add(lod);
    lodObjects.push(lod);
    return lod;
  }

  // 격자로 LOD 구체 배치
  const COLS = 5, ROWS = 8;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      buildLODSphere(new THREE.Vector3(
        (col - (COLS - 1) / 2) * 5,
        1,
        -row * 8 - 2
      ));
    }
  }

  // ─── 단독 LOD 비교 데모 (화면 옆) ─────────────────────────
  //  같은 LOD 단계를 고정해서 나란히 보여주는 비교 구체들
  const compareMeshes = SPHERE_LEVELS.map(({ segments, color, label }, i) => {
    const geo  = new THREE.SphereGeometry(0.8, segments, segments);
    const mat  = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(-12 + i * 4, 1, 0);
    scene.add(mesh);

    // 라벨
    const sprite = makeLabel(`${segments}×${segments}`);
    sprite.position.set(-12 + i * 4, 2.8, 0);
    scene.add(sprite);

    return { mesh, mat, geo };
  });

  // ─── LOD 현재 레벨 표시 ───────────────────────────────────
  const levelIndicators = [];
  SPHERE_LEVELS.forEach(({ color, label }, i) => {
    const sprite = makeColorDot(color);
    sprite.position.set(-12 + i * 4, -0.4, 0);
    sprite.scale.set(0.5, 0.5, 1);
    scene.add(sprite);
  });

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'lod-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto; min-width:250px;">
      <p><strong>LOD (Level of Detail)</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:8px">
        카메라를 앞뒤로 이동하면<br>구체 색이 바뀌며 LOD 전환됨
      </p>

      <div style="margin-bottom:8px;">
        ${SPHERE_LEVELS.map(({ color, label, distance }) => `
          <div style="display:flex;align-items:center;gap:6px;margin:4px 0;font-size:11px;">
            <div style="width:10px;height:10px;border-radius:50%;background:#${color.toString(16).padStart(6,'0')};flex-shrink:0"></div>
            <span style="color:#94a3b8">${label}</span>
            <span style="color:#475569;margin-left:auto">${distance}m+</span>
          </div>
        `).join('')}
      </div>

      <hr style="border-color:#334155;margin:8px 0">
      <label class="pp-row">
        <input type="checkbox" id="wireframe-toggle">
        <span>Wireframe 표시</span>
      </label>

      <label class="pp-row" style="margin-top:6px;">
        <span>카메라 속도</span>
        <input type="range" id="cam-speed" min="0.1" max="3" step="0.1" value="1">
        <span id="cam-speed-val">1.0</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p id="lod-stats" style="color:#6366f1;font-size:11px;text-align:center;">
        현재 LOD: —
      </p>
      <p style="color:#64748b;font-size:11px;margin-top:4px">
        총 오브젝트: ${COLS * ROWS}개<br>
        왼쪽 4구체: 고정 LOD 비교
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  document.getElementById('wireframe-toggle').addEventListener('change', e => {
    showWireframe = e.target.checked;
    lodObjects.forEach(lod => {
      lod.levels.forEach(({ object }) => {
        object.material.wireframe = showWireframe;
      });
    });
    compareMeshes.forEach(({ mat }) => { mat.wireframe = showWireframe; });
  });

  let camSpeed = 1;
  document.getElementById('cam-speed').addEventListener('input', e => {
    camSpeed = parseFloat(e.target.value);
    document.getElementById('cam-speed-val').textContent = camSpeed.toFixed(1);
  });

  // ─── 자동 전진 (LOD 변화 감상용) ─────────────────────────
  let autoMove  = true;
  let moveDir   = -1; // -1 = 앞으로, 1 = 뒤로
  let moveZ     = 6;  // 현재 카메라 Z

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = timer.getDelta();

    if (autoMove) {
      moveZ += moveDir * camSpeed * delta * 8;
      if (moveZ < -55) moveDir =  1;
      if (moveZ >   6) moveDir = -1;
      camera.position.z = moveZ;
      controls.target.z = moveZ - 12;
    }

    // LOD.update()는 OrbitControls 없을 때 수동 호출 필요
    // OrbitControls.update() 후 Three.js가 자동으로 처리
    controls.update();

    // 현재 레벨 표시 (첫 번째 LOD 기준)
    if (lodObjects.length > 0) {
      const firstLod = lodObjects[Math.floor(lodObjects.length / 2)];
      const dist = camera.position.distanceTo(firstLod.position);
      let currentLabel = SPHERE_LEVELS[SPHERE_LEVELS.length - 1].label;
      for (let i = SPHERE_LEVELS.length - 1; i >= 0; i--) {
        if (dist >= SPHERE_LEVELS[i].distance) {
          currentLabel = SPHERE_LEVELS[i].label;
          break;
        }
      }
      document.getElementById('lod-stats').textContent =
        `중앙 오브젝트까지: ${dist.toFixed(1)}m → ${currentLabel}`;
    }

    renderer.render(scene, camera);
  }
  animate();

  // 마우스 드래그 시 자동 이동 중지
  renderer.domElement.addEventListener('mousedown', () => { autoMove = false; });

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
    renderer.domElement.removeEventListener('mousedown', () => { autoMove = false; });
    controls.dispose();
    document.body.removeChild(ui);
    floorGeo.dispose(); floorMat.dispose();
    lodObjects.forEach(lod => {
      lod.levels.forEach(({ object }) => {
        object.geometry.dispose();
        object.material.dispose();
      });
    });
    compareMeshes.forEach(({ geo, mat }) => { geo.dispose(); mat.dispose(); });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#94a3b8';
  ctx.font = '20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 100, 30);
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(2, 0.6, 1);
  return sprite;
}

function makeColorDot(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(color);
  ctx.fillStyle = `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`;
  ctx.beginPath();
  ctx.arc(16, 16, 12, 0, Math.PI * 2);
  ctx.fill();
  const tex    = new THREE.CanvasTexture(canvas);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
}
