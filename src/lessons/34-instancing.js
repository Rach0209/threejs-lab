// ══════════════════════════════════════════════════════════════
//  Module 34: InstancedMesh / 인스턴싱
//
//  배울 것:
//    - InstancedMesh   : 동일 지오메트리+재질을 N개 복사 — 드로우콜 1번
//    - setMatrixAt()   : 각 인스턴스의 위치/회전/크기를 Matrix4로 지정
//    - setColorAt()    : 인스턴스별 색상 설정 (선택)
//    - instanceMatrix  : 인스턴스 변환 행렬 버퍼 (GPU에 직접 전달)
//    - needsUpdate     : 매 프레임 변경 시 true 설정 필수
//
//  왜 중요한가?
//    일반 Mesh 1000개 = 드로우콜 1000번 → GPU가 매번 상태 전환 → 느림
//    InstancedMesh   = 드로우콜 1번  → 행렬 배열만 GPU에 전달  → 빠름
//    실제 게임에서 나무·풀·파티클·군중·건물 등에 필수
//
//  Matrix4 구성:
//    const m = new THREE.Matrix4()
//    m.compose(position, quaternion, scale)
//    → position(Vector3) + quaternion(회전) + scale(Vector3)를 한 행렬로
//
//  주의:
//    - 생성 시 최대 인스턴스 수를 정해야 함 (나중에 늘릴 수 없음)
//    - 변경 후 instanceMatrix.needsUpdate = true 필수
//    - setColorAt 쓰려면 instanceColor도 needsUpdate = true
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f1a);
  scene.fog = new THREE.FogExp2(0x0a0f1a, 0.018);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 200
  );
  camera.position.set(0, 15, 35);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x112244, 3));
  const sun = new THREE.DirectionalLight(0xfff0dd, 4);
  sun.position.set(10, 20, 10);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x4488ff, 1.5);
  fill.position.set(-10, 5, -10);
  scene.add(fill);

  // 바닥
  const floorGeo = new THREE.PlaneGeometry(100, 100);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ─── 재사용 객체 (매 프레임 GC 방지) ─────────────────────
  const _dummy  = new THREE.Object3D();
  const _color  = new THREE.Color();
  const _vec    = new THREE.Vector3();

  // ══════════════════════════════════════════════════════════
  //  데모 1: 숲 (나무 1000그루)
  // ══════════════════════════════════════════════════════════
  const TREE_COUNT = 1000;

  // 기둥 인스턴스
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.2, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 });
  const trunkIM  = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);

  // 잎 인스턴스
  const leafGeo  = new THREE.ConeGeometry(0.5, 1.5, 6);
  const leafMat  = new THREE.MeshStandardMaterial({ color: 0x2d6a2d, roughness: 0.8 });
  const leafIM   = new THREE.InstancedMesh(leafGeo, leafMat, TREE_COUNT);
  leafIM.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(TREE_COUNT * 3), 3
  );

  const treeData = []; // { x, z, scale, phase }

  for (let i = 0; i < TREE_COUNT; i++) {
    // 원형 숲 (가운데 비워둠)
    const angle = Math.random() * Math.PI * 2;
    const dist  = 5 + Math.random() * 35;
    const x     = Math.cos(angle) * dist;
    const z     = Math.sin(angle) * dist;
    const s     = 0.6 + Math.random() * 0.8;
    const phase = Math.random() * Math.PI * 2;
    treeData.push({ x, z, scale: s, phase });

    // 기둥
    _dummy.position.set(x, 0.6 * s, z);
    _dummy.scale.set(s, s, s);
    _dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    _dummy.updateMatrix();
    trunkIM.setMatrixAt(i, _dummy.matrix);

    // 잎 — 잎마다 살짝 다른 초록
    _dummy.position.set(x, (1.2 + 0.75) * s, z);
    _dummy.scale.set(s, s, s);
    _dummy.updateMatrix();
    leafIM.setMatrixAt(i, _dummy.matrix);

    const g = 0.5 + Math.random() * 0.4;
    _color.setRGB(0.1 + Math.random() * 0.1, g, 0.1 + Math.random() * 0.1);
    leafIM.setColorAt(i, _color);
  }

  trunkIM.instanceMatrix.needsUpdate = true;
  leafIM.instanceMatrix.needsUpdate  = true;
  leafIM.instanceColor.needsUpdate   = true;
  scene.add(trunkIM, leafIM);

  // ══════════════════════════════════════════════════════════
  //  데모 2: 파티클 큐브 (애니메이션)
  // ══════════════════════════════════════════════════════════
  const CUBE_COUNT = 2000;
  const cubeGeo    = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  const cubeMat    = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.3 });
  const cubeIM     = new THREE.InstancedMesh(cubeGeo, cubeMat, CUBE_COUNT);
  cubeIM.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(CUBE_COUNT * 3), 3
  );

  const cubeData = [];
  for (let i = 0; i < CUBE_COUNT; i++) {
    // 구 표면에 균등 배치 (피보나치 스피어)
    const phi   = Math.acos(1 - 2 * (i + 0.5) / CUBE_COUNT);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r     = 6;
    cubeData.push({
      phi, theta,
      speed: 0.3 + Math.random() * 0.5,
      offset: Math.random() * Math.PI * 2,
    });

    _color.setHSL(i / CUBE_COUNT, 0.8, 0.6);
    cubeIM.setColorAt(i, _color);
  }
  cubeIM.instanceColor.needsUpdate = true;
  cubeIM.visible = false; // 처음엔 숨김
  scene.add(cubeIM);

  // ══════════════════════════════════════════════════════════
  //  데모 3: 그리드 아트 (5000개)
  // ══════════════════════════════════════════════════════════
  const GRID_COUNT = 50 * 50;
  const pillarGeo  = new THREE.BoxGeometry(0.4, 1, 0.4);
  const pillarMat  = new THREE.MeshStandardMaterial({ metalness: 0.7, roughness: 0.2 });
  const pillarIM   = new THREE.InstancedMesh(pillarGeo, pillarMat, GRID_COUNT);
  pillarIM.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(GRID_COUNT * 3), 3
  );

  const pillarData = [];
  for (let row = 0; row < 50; row++) {
    for (let col = 0; col < 50; col++) {
      const i     = row * 50 + col;
      const x     = (col - 25) * 0.8;
      const z     = (row - 25) * 0.8;
      const phase = (row + col) * 0.3;
      pillarData.push({ x, z, phase });

      _dummy.position.set(x, 0, z);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      pillarIM.setMatrixAt(i, _dummy.matrix);
      _color.setHSL((row + col) / 100, 0.7, 0.5);
      pillarIM.setColorAt(i, _color);
    }
  }
  pillarIM.instanceMatrix.needsUpdate = true;
  pillarIM.instanceColor.needsUpdate  = true;
  pillarIM.visible = false;
  scene.add(pillarIM);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'inst-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>InstancedMesh</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">데모 선택</p>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
        <button class="demo-btn" data-demo="forest"
          style="padding:6px;border-radius:4px;border:none;cursor:pointer;
          font-size:11px;font-weight:700;background:#6366f1;color:#fff;">
          🌲 숲 (나무 1,000그루)
        </button>
        <button class="demo-btn" data-demo="sphere"
          style="padding:6px;border-radius:4px;border:none;cursor:pointer;
          font-size:11px;font-weight:700;background:#334155;color:#94a3b8;">
          🔵 파티클 구 (큐브 2,000개)
        </button>
        <button class="demo-btn" data-demo="grid"
          style="padding:6px;border-radius:4px;border:none;cursor:pointer;
          font-size:11px;font-weight:700;background:#334155;color:#94a3b8;">
          🟪 그리드 아트 (2,500개)
        </button>
      </div>

      <div id="inst-info" style="color:#64748b;font-size:11px;line-height:1.7">
        드로우콜: <span id="dc-count" style="color:#34d399;font-weight:700">2</span>번<br>
        인스턴스: <span id="inst-count" style="color:#fbbf24;font-weight:700">1,000</span>개
      </div>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        일반 Mesh였다면<br>
        <span id="normal-dc" style="color:#f87171">1,000번</span> 드로우콜 필요<br><br>
        InstancedMesh =<br>
        행렬 배열 1번 전달로 해결
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  let currentDemo = 'forest';

  function setDemo(demo) {
    currentDemo = demo;
    trunkIM.visible  = demo === 'forest';
    leafIM.visible   = demo === 'forest';
    cubeIM.visible   = demo === 'sphere';
    pillarIM.visible = demo === 'grid';

    const info = {
      forest: { dc: 2,    inst: '1,000',  norm: '1,000' },
      sphere: { dc: 1,    inst: '2,000',  norm: '2,000' },
      grid:   { dc: 1,    inst: '2,500',  norm: '2,500' },
    }[demo];

    document.getElementById('dc-count').textContent   = info.dc;
    document.getElementById('inst-count').textContent = info.inst;
    document.getElementById('normal-dc').textContent  = info.norm + '번';

    document.querySelectorAll('.demo-btn').forEach(b => {
      b.style.background = b.dataset.demo === demo ? '#6366f1' : '#334155';
      b.style.color      = b.dataset.demo === demo ? '#fff'    : '#94a3b8';
    });

    // 카메라 위치 조정
    if (demo === 'forest') {
      camera.position.set(0, 15, 35);
      controls.target.set(0, 0, 0);
    } else if (demo === 'sphere') {
      camera.position.set(0, 8, 18);
      controls.target.set(0, 0, 0);
    } else {
      camera.position.set(0, 20, 30);
      controls.target.set(0, 3, 0);
    }
  }

  document.querySelectorAll('.demo-btn').forEach(b => {
    b.addEventListener('click', () => setDemo(b.dataset.demo));
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    if (currentDemo === 'sphere') {
      // 큐브들이 구 표면을 흘러다님
      for (let i = 0; i < CUBE_COUNT; i++) {
        const { phi, theta, speed, offset } = cubeData[i];
        const t   = elapsed * speed + offset;
        const r   = 6 + Math.sin(t * 2) * 0.5;
        const th  = theta + elapsed * 0.15;
        _dummy.position.set(
          r * Math.sin(phi) * Math.cos(th),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(th),
        );
        _dummy.rotation.set(t, t * 0.7, 0);
        _dummy.scale.setScalar(0.7 + Math.sin(t * 3) * 0.3);
        _dummy.updateMatrix();
        cubeIM.setMatrixAt(i, _dummy.matrix);
      }
      cubeIM.instanceMatrix.needsUpdate = true;

    } else if (currentDemo === 'grid') {
      // 파도처럼 높이가 변하는 그리드
      for (let i = 0; i < pillarData.length; i++) {
        const { x, z, phase } = pillarData[i];
        const h = 0.5 + (Math.sin(elapsed * 1.5 + phase) * 0.5 + 0.5) * 4;
        _dummy.position.set(x, h * 0.5, z);
        _dummy.scale.set(1, h, 1);
        _dummy.updateMatrix();
        pillarIM.setMatrixAt(i, _dummy.matrix);

        _color.setHSL(((elapsed * 0.1 + phase / (Math.PI * 2)) % 1), 0.7, 0.5);
        pillarIM.setColorAt(i, _color);
      }
      pillarIM.instanceMatrix.needsUpdate = true;
      pillarIM.instanceColor.needsUpdate  = true;
    }

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
    [trunkGeo, trunkMat, leafGeo, leafMat,
     cubeGeo, cubeMat, pillarGeo, pillarMat,
     floorGeo, floorMat].forEach(o => o?.dispose?.());
    [trunkIM, leafIM, cubeIM, pillarIM].forEach(m => m.dispose());
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
