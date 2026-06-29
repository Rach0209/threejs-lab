// ══════════════════════════════════════════════════════════════
//  Module 3: 인터랙션 — Raycasting & 키보드
//
//  배울 것:
//    - Raycaster: 마우스 위치에서 광선을 쏴서 오브젝트를 맞추는 기술
//    - 마우스 hover / click 감지
//    - 키보드 입력으로 오브젝트 이동
//    - 선택된 오브젝트 하이라이트
//
//  핵심 개념 — Raycasting:
//    화면의 2D 마우스 좌표를 3D 공간의 광선으로 변환해서
//    어떤 오브젝트와 교차(intersect)하는지 계산합니다.
//    클릭 선택, 마우스오버 감지, 충돌 판정 등에 사용됩니다.
//
//    카메라 → [마우스 방향으로 광선 발사] → 오브젝트 맞으면 감지!
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 5, 12);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const disposables = [];

  // ─── 오브젝트 생성 ────────────────────────────────────────
  //  클릭/호버 대상이 될 큐브들을 격자로 배치
  const objects = [];
  const defaultColor = 0x334155;
  const hoverColor   = 0x6366f1;
  const clickColor   = 0xf59e0b;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
      const mat = new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.4 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((col - 2) * 2.4, 0, (row - 1) * 2.4);
      mesh.castShadow = true;
      mesh.userData = { defaultColor, isSelected: false };
      scene.add(mesh);
      objects.push(mesh);
      disposables.push({ geo, mat });
    }
  }

  // ─── 조명 ─────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(5, 10, 5);
  dirLight.castShadow = true;
  scene.add(ambient, dirLight);
  disposables.push({ light: ambient }, { light: dirLight });

  // 바닥
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  floor.receiveShadow = true;
  scene.add(floor);
  disposables.push({ geo: floorGeo, mat: floorMat });

  // ─── Raycaster 세팅 ───────────────────────────────────────
  //  Raycaster: 광선(Ray)을 생성하고 오브젝트와의 교차를 계산
  const raycaster = new THREE.Raycaster();
  //  NDC(Normalized Device Coordinates): -1 ~ +1 범위의 화면 좌표
  const mouse = new THREE.Vector2();

  let hoveredObj = null;  // 현재 마우스가 올라간 오브젝트
  let selectedObj = null; // 현재 선택된 오브젝트

  // ─── 정보 패널 ────────────────────────────────────────────
  const info = document.createElement('div');
  info.id = 'interaction-info';
  info.innerHTML = `
    <div class="info-box">
      <p><strong>마우스 조작</strong></p>
      <p>🖱️ 호버 → 파란색 하이라이트</p>
      <p>🖱️ 클릭 → 선택 (노란색)</p>
      <p>&nbsp;</p>
      <p><strong>키보드 조작 (선택 후)</strong></p>
      <p>W/S → 앞/뒤 이동</p>
      <p>A/D → 좌/우 이동</p>
      <p>Q/E → 위/아래 이동</p>
      <p>R → 선택 해제</p>
    </div>
    <div class="info-status" id="status-text">오브젝트를 클릭해보세요</div>
  `;
  document.body.appendChild(info);

  const statusEl = info.querySelector('#status-text');

  // ─── 마우스 이동 → hover 감지 ────────────────────────────
  function onMouseMove(event) {
    // 화면 픽셀 좌표 → NDC(-1~1) 좌표로 변환
    // Three.js Raycaster는 NDC 좌표를 사용합니다
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Raycaster에 카메라와 마우스 위치를 설정
    raycaster.setFromCamera(mouse, camera);

    // 광선과 오브젝트 배열의 교차 계산
    // recursive: true → 자식 오브젝트도 검사
    const intersects = raycaster.intersectObjects(objects);

    // 이전 hover 오브젝트 색 복원
    if (hoveredObj && hoveredObj !== selectedObj) {
      hoveredObj.material.color.setHex(defaultColor);
      hoveredObj.material.emissive.setHex(0x000000);
    }

    if (intersects.length > 0) {
      hoveredObj = intersects[0].object; // 가장 가까운 교차 오브젝트
      if (hoveredObj !== selectedObj) {
        hoveredObj.material.color.setHex(hoverColor);
        hoveredObj.material.emissive.setHex(0x1a1a4a);
      }
      renderer.domElement.style.cursor = 'pointer';
    } else {
      hoveredObj = null;
      renderer.domElement.style.cursor = 'default';
    }
  }

  // ─── 마우스 클릭 → 선택 ────────────────────────────────
  function onClick(event) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(objects);

    // 이전 선택 해제
    if (selectedObj) {
      selectedObj.material.color.setHex(defaultColor);
      selectedObj.material.emissive.setHex(0x000000);
      selectedObj = null;
    }

    if (intersects.length > 0) {
      selectedObj = intersects[0].object;
      selectedObj.material.color.setHex(clickColor);
      selectedObj.material.emissive.setHex(0x2a1a00);

      const pos = selectedObj.position;
      statusEl.textContent = `선택됨: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
    } else {
      statusEl.textContent = '오브젝트를 클릭해보세요';
    }
  }

  // ─── 키보드 입력 ──────────────────────────────────────────
  const keys = {};
  function onKeyDown(e) { keys[e.key.toLowerCase()] = true; }
  function onKeyUp(e)   { keys[e.key.toLowerCase()] = false; }

  const MOVE_SPEED = 0.05;

  function handleKeys() {
    if (!selectedObj) return;
    if (keys['w']) selectedObj.position.z -= MOVE_SPEED;
    if (keys['s']) selectedObj.position.z += MOVE_SPEED;
    if (keys['a']) selectedObj.position.x -= MOVE_SPEED;
    if (keys['d']) selectedObj.position.x += MOVE_SPEED;
    if (keys['q']) selectedObj.position.y += MOVE_SPEED;
    if (keys['e']) selectedObj.position.y -= MOVE_SPEED;
    if (keys['r']) {
      if (selectedObj) {
        selectedObj.material.color.setHex(defaultColor);
        selectedObj.material.emissive.setHex(0x000000);
        selectedObj = null;
        statusEl.textContent = '선택 해제됨';
      }
    }
    if (selectedObj) {
      const p = selectedObj.position;
      statusEl.textContent = `선택됨: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
    }
  }

  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ─── 애니메이션 ────────────────────────────────────────────
  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    handleKeys();
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
    renderer.domElement.removeEventListener('mousemove', onMouseMove);
    renderer.domElement.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onResize);
    renderer.domElement.style.cursor = 'default';
    controls.dispose();
    document.body.removeChild(info);
    disposables.forEach(({ geo, mat, light }) => {
      geo?.dispose(); mat?.dispose();
      if (light) scene.remove(light);
    });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
