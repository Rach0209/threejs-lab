// ══════════════════════════════════════════════════════════════
//  Module 18: Raycasting 심화 — 드래그 & 씬 에디터
//
//  배울 것:
//    - Raycaster + Plane : 마우스 드래그로 3D 오브젝트 이동
//    - TransformPlane    : 드래그 기준 평면을 카메라 방향으로 설정
//    - 오브젝트 생성/삭제 : 클릭으로 씬에 추가·우클릭으로 제거
//    - 스냅(Snap)        : 격자에 정렬해 배치
//    - 호버 하이라이트   : 마우스 오버 시 외곽 강조
//    - 선택 상태 관리    : 여러 오브젝트 중 하나만 활성
//
//  Raycasting 드래그 패턴:
//    1. mousedown → ray로 오브젝트 교차 확인 → 선택
//    2. 드래그 평면 설정 (카메라를 바라보는 수직 평면)
//    3. mousemove → ray와 드래그 평면 교차점 계산 → 위치 갱신
//    4. mouseup   → 선택 해제
//
//  좌표 변환:
//    마우스 픽셀 좌표 → NDC(-1~1) → Raycaster → 3D 월드 좌표
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// 배치 가능한 오브젝트 프리셋
const PRESETS = [
  { name: '큐브',       geo: () => new THREE.BoxGeometry(1, 1, 1),                 color: 0x6366f1 },
  { name: '구체',       geo: () => new THREE.SphereGeometry(0.55, 24, 24),          color: 0xf43f5e },
  { name: '원기둥',     geo: () => new THREE.CylinderGeometry(0.4, 0.4, 1, 24),     color: 0x10b981 },
  { name: '원뿔',       geo: () => new THREE.ConeGeometry(0.5, 1.2, 24),            color: 0xf59e0b },
  { name: 'TorusKnot', geo: () => new THREE.TorusKnotGeometry(0.35, 0.12, 64, 12), color: 0x8b5cf6 },
];

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111827);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 8, 12);

  // OrbitControls — 드래그 중에는 비활성화
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.mouseButtons = {
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.ROTATE, // 우클릭 = 회전 (left는 드래그에 사용)
  };

  // ─── 씬 구성 ──────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x334466, 3));

  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(8, 12, 6);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);

  // 바닥 그리드
  const gridHelper = new THREE.GridHelper(20, 20, 0x334155, 0x1e293b);
  scene.add(gridHelper);

  // 바닥 평면 (클릭 배치용 Raycasting 타깃)
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ─── 상태 관리 ────────────────────────────────────────────
  const placedObjects = [];   // 배치된 오브젝트 목록
  let   selectedObj   = null; // 현재 드래그 중인 오브젝트
  let   hoveredObj    = null; // 호버 중인 오브젝트
  let   activePreset  = 0;    // 선택된 프리셋 인덱스
  let   snapEnabled   = true; // 격자 스냅
  let   isDragging    = false;

  // 하이라이트용 재질 (원본 저장 후 교체 방식)
  const highlightMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.3,
    roughness: 0.3,
  });

  // ─── Raycaster ────────────────────────────────────────────
  const raycaster  = new THREE.Raycaster();
  const pointer    = new THREE.Vector2();

  // 드래그 평면: 카메라 앞을 바라보는 수직 평면
  // 드래그 시작 시 선택된 오브젝트 높이에 맞게 설정
  const dragPlane  = new THREE.Plane();
  const dragOffset = new THREE.Vector3(); // 클릭 지점 - 오브젝트 중심 오프셋
  const _hit       = new THREE.Vector3();
  const _camDir    = new THREE.Vector3();

  function updatePointer(e) {
    pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  // 격자 스냅 (0.5 단위)
  function snap(v) {
    return snapEnabled ? Math.round(v * 2) / 2 : v;
  }

  // ─── 오브젝트 생성 ────────────────────────────────────────
  function spawnObject(position) {
    const preset  = PRESETS[activePreset];
    const geo     = preset.geo();
    const mat     = new THREE.MeshStandardMaterial({
      color: preset.color,
      roughness: 0.4,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.y = 0.5; // 바닥 위
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.userData.originalMat  = mat;
    mesh.userData.presetIndex  = activePreset;
    scene.add(mesh);
    placedObjects.push(mesh);
    updateCount();
    return mesh;
  }

  // ─── 오브젝트 삭제 ────────────────────────────────────────
  function removeObject(mesh) {
    const idx = placedObjects.indexOf(mesh);
    if (idx === -1) return;
    placedObjects.splice(idx, 1);
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    if (hoveredObj === mesh) hoveredObj = null;
    if (selectedObj === mesh) selectedObj = null;
    updateCount();
  }

  // ─── 호버 처리 ────────────────────────────────────────────
  function setHover(mesh) {
    if (hoveredObj === mesh) return;
    // 이전 호버 복원
    if (hoveredObj && hoveredObj !== selectedObj) {
      hoveredObj.material = hoveredObj.userData.originalMat;
    }
    hoveredObj = mesh;
    if (hoveredObj && hoveredObj !== selectedObj) {
      hoveredObj.material = highlightMat;
    }
  }

  // ─── 마우스 이벤트 ────────────────────────────────────────
  function onMouseMove(e) {
    updatePointer(e);
    raycaster.setFromCamera(pointer, camera);

    if (selectedObj && isDragging) {
      // 드래그 평면과 교차점 계산
      if (raycaster.ray.intersectPlane(dragPlane, _hit)) {
        const x = snap(_hit.x - dragOffset.x);
        const z = snap(_hit.z - dragOffset.z);
        selectedObj.position.x = x;
        selectedObj.position.z = z;
      }
      return;
    }

    // 호버 감지 (바닥 제외)
    const hits = raycaster.intersectObjects(placedObjects);
    setHover(hits.length > 0 ? hits[0].object : null);
    renderer.domElement.style.cursor = hoveredObj ? 'grab' : 'crosshair';
  }

  function onMouseDown(e) {
    if (e.button === 2) return; // 우클릭은 OrbitControls에 위임

    updatePointer(e);
    raycaster.setFromCamera(pointer, camera);

    // 기존 오브젝트 클릭 → 드래그 시작
    const hits = raycaster.intersectObjects(placedObjects);
    if (hits.length > 0) {
      e.preventDefault();
      isDragging  = true;
      selectedObj = hits[0].object;
      controls.enabled = false; // 드래그 중 OrbitControls 비활성

      // 드래그 평면: 오브젝트 높이에서 카메라를 향하는 수직 평면
      camera.getWorldDirection(_camDir);
      dragPlane.setFromNormalAndCoplanarPoint(
        _camDir.negate(),
        selectedObj.position
      );

      // 오프셋: 클릭한 지점과 오브젝트 중심의 차이
      raycaster.ray.intersectPlane(dragPlane, _hit);
      dragOffset.subVectors(_hit, selectedObj.position);
      dragOffset.y = 0;

      renderer.domElement.style.cursor = 'grabbing';
      return;
    }

    // 바닥 클릭 → 오브젝트 배치
    const floorHits = raycaster.intersectObject(floor);
    if (floorHits.length > 0) {
      const pt = floorHits[0].point;
      spawnObject(new THREE.Vector3(snap(pt.x), 0, snap(pt.z)));
    }
  }

  function onMouseUp(e) {
    if (selectedObj) {
      selectedObj = null;
      isDragging  = false;
      controls.enabled = true;
      renderer.domElement.style.cursor = hoveredObj ? 'grab' : 'crosshair';
    }
  }

  function onContextMenu(e) {
    e.preventDefault();
    updatePointer(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(placedObjects);
    if (hits.length > 0) removeObject(hits[0].object);
  }

  renderer.domElement.addEventListener('mousemove',    onMouseMove);
  renderer.domElement.addEventListener('mousedown',    onMouseDown);
  renderer.domElement.addEventListener('mouseup',      onMouseUp);
  renderer.domElement.addEventListener('contextmenu',  onContextMenu);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'raycast-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto; min-width:240px;">
      <p><strong>Raycasting 심화 — 씬 에디터</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">배치할 오브젝트</p>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;" id="preset-btns">
        ${PRESETS.map((p, i) => `<button class="toon-btn${i===0?' active':''}" data-idx="${i}">${p.name}</button>`).join('')}
      </div>

      <label class="pp-row" style="margin-bottom:10px;">
        <input type="checkbox" id="snap-toggle" checked>
        <span>격자 스냅 (0.5 단위)</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <button id="clear-all" style="
        width:100%; padding:6px; border-radius:6px;
        border:1px solid rgba(244,63,94,0.4);
        background:rgba(244,63,94,0.15); color:#fda4af;
        cursor:pointer; font-size:12px;
      ">전체 삭제</button>

      <hr style="border-color:#334155;margin:8px 0">
      <p id="obj-count" style="color:#6366f1;font-size:12px;text-align:center;">오브젝트: 0개</p>
      <p style="color:#64748b;font-size:11px;margin-top:6px;">
        좌클릭 바닥: 배치<br>
        좌클릭+드래그: 이동<br>
        우클릭: 삭제<br>
        우클릭+드래그: 시점 회전<br>
        스크롤: 줌
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  const btnStyle = document.createElement('style');
  btnStyle.id = 'raycast-btn-style';
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

  document.querySelectorAll('#preset-btns .toon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#preset-btns .toon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activePreset = parseInt(btn.dataset.idx);
    });
  });

  document.getElementById('snap-toggle').addEventListener('change', e => {
    snapEnabled = e.target.checked;
  });

  document.getElementById('clear-all').addEventListener('click', () => {
    [...placedObjects].forEach(m => removeObject(m));
  });

  function updateCount() {
    document.getElementById('obj-count').textContent = `오브젝트: ${placedObjects.length}개`;
  }

  renderer.domElement.style.cursor = 'crosshair';

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
    renderer.domElement.removeEventListener('mousemove',   onMouseMove);
    renderer.domElement.removeEventListener('mousedown',   onMouseDown);
    renderer.domElement.removeEventListener('mouseup',     onMouseUp);
    renderer.domElement.removeEventListener('contextmenu', onContextMenu);
    controls.dispose();
    document.body.removeChild(ui);
    document.head.removeChild(btnStyle);
    renderer.domElement.style.cursor = '';

    highlightMat.dispose();
    floorGeo.dispose();
    floorMat.dispose();
    placedObjects.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
