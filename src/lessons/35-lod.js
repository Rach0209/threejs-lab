// ══════════════════════════════════════════════════════════════
//  Module 35: LOD — Level of Detail (거리 기반 디테일 조절)
//
//  배울 것:
//    - THREE.LOD      : 카메라 거리에 따라 다른 메시를 자동 선택
//    - lod.addLevel() : (mesh, distance) — distance 이상이면 해당 메시 사용
//    - 왜 필요한가?
//        폴리곤 수 = 렌더 비용
//        가까운 물체: 디테일 필요 (고폴리)
//        먼 물체: 차이 안 보임 (저폴리로 대체해도 됨)
//        → 같은 품질, 훨씬 낮은 GPU 부담
//
//  LOD 레벨 예시:
//    level 0 (0m~)   : SphereGeometry(1, 64, 64)  — 고폴리
//    level 1 (20m~)  : SphereGeometry(1, 16, 16)  — 중폴리
//    level 2 (50m~)  : SphereGeometry(1, 6, 6)    — 저폴리
//    level 3 (100m~) : SphereGeometry(1, 3, 3)    — 최저폴리
//
//  실제 게임 활용:
//    - 나무 수백 그루: 멀리서는 빌보드(Sprite)로 대체
//    - 캐릭터: 가까이서만 스킨 메시, 멀면 심플 실루엣
//    - 지형: 타일 거리에 따라 분할 수 조절 (Terrain LOD)
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── LOD 오브젝트 생성 헬퍼 ──────────────────────────────────
function makeLODSphere(color) {
  const lod = new THREE.LOD();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });

  // 거리별 레벨 (가까울수록 디테일 높음)
  const levels = [
    { segs: 64, dist: 0   },  // 0~20m   : 고폴리 (8321 정점)
    { segs: 16, dist: 20  },  // 20~50m  : 중폴리 (578 정점)
    { segs: 6,  dist: 50  },  // 50~100m : 저폴리 (98 정점)
    { segs: 3,  dist: 100 },  // 100m~   : 최저폴리 (32 정점)
  ];

  levels.forEach(({ segs, dist }) => {
    const geo  = new THREE.SphereGeometry(1, segs, segs);
    const mesh = new THREE.Mesh(geo, mat.clone());
    lod.addLevel(mesh, dist);
  });

  return lod;
}

function makeLODTree(x, z, scale) {
  const lod = new THREE.LOD();

  // 레벨 0: 실제 3D 나무 (고폴리)
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 1.5, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d1e });
  const trunk    = new THREE.Mesh(trunkGeo, trunkMat);

  const leafGeo  = new THREE.ConeGeometry(0.7, 2, 8);
  const leafMat  = new THREE.MeshStandardMaterial({ color: 0x2d6a2d });
  const leaf     = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.y = 1.75;

  const fullTree = new THREE.Group();
  fullTree.add(trunk, leaf);
  lod.addLevel(fullTree, 0);   // 0~30m

  // 레벨 1: 저폴리 나무 (4각형 기둥 + 피라미드)
  const trunkLowGeo = new THREE.CylinderGeometry(0.1, 0.15, 1.5, 4);
  const trunkLow    = new THREE.Mesh(trunkLowGeo, trunkMat);
  const leafLowGeo  = new THREE.ConeGeometry(0.7, 2, 4);
  const leafLow     = new THREE.Mesh(leafLowGeo, leafMat);
  leafLow.position.y = 1.75;

  const lowTree = new THREE.Group();
  lowTree.add(trunkLow, leafLow);
  lod.addLevel(lowTree, 30);   // 30~70m

  // 레벨 2: 빌보드 스프라이트 (아주 멀면 이미지 한 장으로 대체)
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(28, 32, 8, 32);
  ctx.fillStyle = '#2d6a2d';
  ctx.beginPath();
  ctx.moveTo(32, 0); ctx.lineTo(56, 40); ctx.lineTo(8, 40);
  ctx.fill();
  const spriteTex = new THREE.CanvasTexture(canvas);
  const sprite    = new THREE.Sprite(new THREE.SpriteMaterial({
    map: spriteTex, transparent: true,
  }));
  sprite.scale.set(1.5 * scale, 2.5 * scale, 1);
  sprite.position.y = 1.25 * scale;
  lod.addLevel(sprite, 70);    // 70m~ : 스프라이트

  // 레벨 3: 아무것도 렌더 안 함 (너무 멀면 숨김)
  lod.addLevel(new THREE.Object3D(), 150); // 150m~ : invisible

  lod.position.set(x, 0, z);
  lod.scale.setScalar(scale);
  return lod;
}

export function init(renderer) {
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.006);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 300
  );
  camera.position.set(0, 3, 5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, -20);
  controls.maxPolarAngle = Math.PI * 0.52;

  scene.add(new THREE.AmbientLight(0x88aacc, 2));
  const sun = new THREE.DirectionalLight(0xfff5e0, 3);
  sun.position.set(10, 20, 5);
  scene.add(sun);

  // 바닥
  const floorGeo = new THREE.PlaneGeometry(300, 300);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ─── 데모 1: LOD 구 — 거리 변화 직관적으로 확인 ─────────────
  const lodSpheres = [];
  const colors = [0x6366f1, 0x10b981, 0xf43f5e, 0xfbbf24, 0x38bdf8];
  for (let i = 0; i < 5; i++) {
    const lod = makeLODSphere(colors[i]);
    lod.position.set((i - 2) * 4, 1, 0);
    scene.add(lod);
    lodSpheres.push(lod);
  }

  // ─── 데모 2: LOD 나무 숲 ─────────────────────────────────────
  const trees = [];
  for (let i = 0; i < 200; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 10 + Math.random() * 120;
    const x     = Math.cos(angle) * dist;
    const z     = Math.sin(angle) * dist - 20;
    const scale = 0.7 + Math.random() * 0.8;
    const tree  = makeLODTree(x, z, scale);
    scene.add(tree);
    trees.push(tree);
  }

  // ─── 거리 표시 마커 ──────────────────────────────────────────
  [20, 50, 100, 150].forEach((d, i) => {
    const labels = ['고폴리→중폴리', '중폴리→저폴리', '저폴리→최저', '컬링'];
    const ringGeo = new THREE.RingGeometry(d - 0.2, d + 0.2, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: [0x6366f1, 0xfbbf24, 0xf43f5e, 0x94a3b8][i],
      side: THREE.DoubleSide, transparent: true, opacity: 0.4,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    scene.add(ring);
  });

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'lod-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>LOD — Level of Detail</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <div id="lod-status" style="margin-bottom:8px;">
        <p style="color:#64748b;font-size:11px;margin-bottom:4px">현재 카메라 거리</p>
        <p id="cam-dist" style="color:#34d399;font-size:18px;font-weight:700;margin:0">0m</p>
      </div>

      <div style="font-size:11px;line-height:2;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#6366f1"></span>
          <span style="color:#94a3b8">0~20m : 고폴리 (segs=64)</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#fbbf24"></span>
          <span style="color:#94a3b8">20~50m : 중폴리 (segs=16)</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f43f5e"></span>
          <span style="color:#94a3b8">50~100m : 저폴리 (segs=6)</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#94a3b8"></span>
          <span style="color:#94a3b8">100m~ : 최저폴리 (segs=3)</span>
        </div>
      </div>

      <hr style="border-color:#334155;margin:8px 0">
      <label class="pp-row">
        <span>링 표시</span>
        <input type="checkbox" id="ring-toggle" checked>
      </label>
      <label class="pp-row">
        <span>와이어프레임</span>
        <input type="checkbox" id="wire-toggle">
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        카메라 앞뒤로 이동하며<br>
        구의 폴리곤 수 변화 확인<br>
        나무숲: 멀수록 스프라이트로 전환
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  // 링 오브젝트 참조
  const rings = scene.children.filter(c => c.geometry instanceof THREE.RingGeometry);

  document.getElementById('ring-toggle').addEventListener('change', e => {
    rings.forEach(r => r.visible = e.target.checked);
  });

  document.getElementById('wire-toggle').addEventListener('change', e => {
    lodSpheres.forEach(lod => {
      lod.levels.forEach(({ object }) => {
        object.traverse(child => {
          if (child.isMesh) child.material.wireframe = e.target.checked;
        });
      });
    });
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;
  const _origin = new THREE.Vector3(0, 1, 0);

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();

    // LOD 업데이트 (카메라 기준 자동 레벨 선택)
    lodSpheres.forEach(lod => lod.update(camera));
    trees.forEach(lod => lod.update(camera));

    // 카메라와 첫 번째 구의 거리 표시
    const dist = Math.round(camera.position.distanceTo(_origin));
    document.getElementById('cam-dist').textContent = dist + 'm';

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
    [floorGeo, floorMat].forEach(o => o.dispose());
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
