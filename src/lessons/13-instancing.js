// ══════════════════════════════════════════════════════════════
//  Module 13: InstancedMesh (인스턴싱)
//
//  배울 것:
//    - InstancedMesh : 동일한 Geometry+Material을 N개 복사해
//                      단 하나의 draw call로 렌더링
//    - Matrix4       : 각 인스턴스의 위치·회전·크기를 담는 4×4 행렬
//    - setMatrixAt() : 인스턴스별 변환 행렬 설정
//    - setColorAt()  : 인스턴스별 색상 설정
//    - instanceMatrix.needsUpdate : 매 프레임 갱신 신호
//
//  왜 중요한가?
//    일반 Mesh를 1,000개 만들면 → draw call 1,000번 → GPU가 바쁨
//    InstancedMesh 1개로 1,000개 → draw call 1번   → 매우 빠름
//
//    게임에서 나무, 풀, 총알, 군중, 파티클 등 대량 오브젝트에 필수.
//
//  핵심 패턴:
//    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
//    const matrix = new THREE.Matrix4();
//    const dummy  = new THREE.Object3D(); // 행렬 계산 도우미
//
//    dummy.position.set(x, y, z);
//    dummy.rotation.set(rx, ry, rz);
//    dummy.scale.set(sx, sy, sz);
//    dummy.updateMatrix();               // Object3D → Matrix4 계산
//    mesh.setMatrixAt(i, dummy.matrix);  // i번째 인스턴스에 적용
//    mesh.instanceMatrix.needsUpdate = true; // GPU에 업로드
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const COUNT = 4000; // 인스턴스 수
const GRID  = Math.ceil(Math.sqrt(COUNT)); // 격자 크기 (≈63)
const GAP   = 1.6;  // 인스턴스 간격

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);
  scene.fog = new THREE.FogExp2(0x0a0a14, 0.018); // 원근감 안개

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 28, 55);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 2, 0);
  controls.maxPolarAngle = Math.PI * 0.55;

  // ─── InstancedMesh 생성 ───────────────────────────────────
  //
  //  하나의 Geometry + Material → 4,000개 복사본
  //  GPU에는 정점 데이터가 딱 1벌만 올라가고,
  //  인스턴스별 변환 행렬(instanceMatrix)만 추가로 전달됨
  //
  const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.4,
    metalness: 0.3,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // ── 인스턴스별 초기 색상 설정 ────────────────────────────
  //  setColorAt(i, color) 로 각 인스턴스에 다른 색 부여
  const color  = new THREE.Color();
  const offset = (GRID - 1) * GAP * 0.5; // 격자 중심 보정

  for (let i = 0; i < COUNT; i++) {
    const col = i % GRID;
    const row = Math.floor(i / GRID);

    // HSL 그라데이션: 위치에 따라 색이 변함
    const t = i / COUNT;
    color.setHSL(t * 0.8 + 0.1, 0.7, 0.5);
    mesh.setColorAt(i, color);

    // 초기 위치: XZ 평면에 격자 배치
    // (애니메이션에서 매 프레임 업데이트할 것이지만 한 번 초기화)
    const dummy = new THREE.Object3D();
    dummy.position.set(col * GAP - offset, 0, row * GAP - offset);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  // 색상을 GPU에 업로드 (한 번만 — 이후엔 바꾸지 않음)
  mesh.instanceColor.needsUpdate = true;

  // ─── 조명 ─────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x223355, 3);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 4);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 150;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
  sun.shadow.camera.right = sun.shadow.camera.top  = 60;
  scene.add(sun);

  // ─── 바닥 ─────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(200, 200);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x111120, roughness: 0.9 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  floor.receiveShadow = true;
  scene.add(floor);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'inst-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>InstancedMesh</strong></p>
      <p id="inst-count">인스턴스: ${COUNT.toLocaleString()}개</p>
      <p id="inst-drawcall" style="color:#6366f1;">Draw call: <strong>1회</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <span>파형 속도</span>
        <input type="range" id="wave-speed" min="0.2" max="4" step="0.1" value="1.2">
        <span id="wave-speed-val">1.2</span>
      </label>

      <label class="pp-row">
        <span>파형 높이</span>
        <input type="range" id="wave-height" min="0.5" max="8" step="0.1" value="3">
        <span id="wave-height-val">3.0</span>
      </label>

      <label class="pp-row">
        <span>파형 빈도</span>
        <input type="range" id="wave-freq" min="0.05" max="0.5" step="0.01" value="0.18">
        <span id="wave-freq-val">0.18</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">
        일반 Mesh ${COUNT.toLocaleString()}개<br>
        → draw call ${COUNT.toLocaleString()}회<br><br>
        InstancedMesh 1개<br>
        → draw call <strong style="color:#6366f1">1회</strong>
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  // 슬라이더 바인딩
  let waveSpeed  = 1.2;
  let waveHeight = 3.0;
  let waveFreq   = 0.18;

  const bindSlider = (id, valId, cb) => {
    const el  = document.getElementById(id);
    const val = document.getElementById(valId);
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      val.textContent = v.toFixed(2);
      cb(v);
    });
  };
  bindSlider('wave-speed',  'wave-speed-val',  v => { waveSpeed  = v; });
  bindSlider('wave-height', 'wave-height-val', v => { waveHeight = v; });
  bindSlider('wave-freq',   'wave-freq-val',   v => { waveFreq   = v; });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer  = new Timer();
  const dummy  = new THREE.Object3D(); // 행렬 계산용 임시 오브젝트
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // ── 매 프레임 모든 인스턴스의 행렬 갱신 ─────────────────
    //
    //  dummy.Object3D를 변환하고 updateMatrix()로 Matrix4 계산,
    //  그 결과를 setMatrixAt()으로 복사하는 패턴이 표준입니다.
    //
    const offset = (GRID - 1) * GAP * 0.5;

    for (let i = 0; i < COUNT; i++) {
      const col = i % GRID;
      const row = Math.floor(i / GRID);

      const x = col * GAP - offset;
      const z = row * GAP - offset;

      // 2D 사인파: 위치(x,z)와 시간(elapsed)에 따라 Y값 출렁임
      const dist = Math.sqrt(x * x + z * z);
      const y = Math.sin(dist * waveFreq - elapsed * waveSpeed) * waveHeight;

      // 큐브가 파도에 따라 살짝 기울어지도록 회전 추가
      dummy.position.set(x, y, z);
      dummy.rotation.x = Math.sin(dist * waveFreq * 0.5 - elapsed * waveSpeed) * 0.3;
      dummy.rotation.z = Math.cos(dist * waveFreq * 0.5 - elapsed * waveSpeed) * 0.3;

      // Y 높이에 따라 스케일도 살짝 변화 (높을수록 커짐)
      const s = 0.7 + (y / waveHeight + 1) * 0.2;
      dummy.scale.setScalar(s);

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    // ★ 행렬이 바뀌었음을 GPU에 알림 (이게 없으면 화면이 안 바뀜)
    mesh.instanceMatrix.needsUpdate = true;

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
    geo.dispose();
    mat.dispose();
    floorGeo.dispose();
    floorMat.dispose();
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
