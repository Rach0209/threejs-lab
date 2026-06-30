// ══════════════════════════════════════════════════════════════
//  Module 29: Decal (데칼)
//
//  배울 것:
//    - DecalGeometry : 기존 메시 표면에 다른 메시를 "프린트"
//    - 동작 원리     : 충돌 지점 + 법선 벡터 → 표면에 딱 붙는 얇은 메시 생성
//    - Raycaster     : 클릭한 표면 위치와 법선 감지
//    - 활용 예시     : 총알 구멍, 페인트 스프레이, 낙서, 스티커, 혈흔
//
//  DecalGeometry 파라미터:
//    mesh     : 데칼을 붙일 대상 메시
//    position : 데칼 중심 위치 (월드 좌표)
//    orientation : 데칼이 바라볼 방향 (Euler) — 법선 방향
//    size     : 데칼 크기 (Vector3)
//
//  주의:
//    - DepthTest/DepthWrite 설정 중요 — z-fighting 방지
//    - polygonOffset으로 표면에서 살짝 띄워야 깜빡임 없음
//    - DecalGeometry는 Three.js examples에 포함됨 (별도 설치 불필요)
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

// ─── 데칼 텍스처 (Canvas API) ────────────────────────────────
function makeBulletHole() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  // 외부 균열
  ctx.strokeStyle = '#1a0a00';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const len   = 20 + Math.random() * 20;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(angle) * 18, 64 + Math.sin(angle) * 18);
    ctx.lineTo(64 + Math.cos(angle) * len, 64 + Math.sin(angle) * len);
    ctx.stroke();
  }
  // 구멍 (검정 원)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 16);
  g.addColorStop(0,   'rgba(0,0,0,1)');
  g.addColorStop(0.6, 'rgba(20,10,5,0.9)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 18, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

function makePaintSplat(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  // 불규칙한 물감 방울
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.random() * 30;
    const r     = 8 + Math.random() * 20;
    ctx.globalAlpha = 0.6 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(angle) * dist, 64 + Math.sin(angle) * dist, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
}

function makeSticker(emoji) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '64px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 68);
  return new THREE.CanvasTexture(c);
}

// ─── 데칼 재질 팩토리 ─────────────────────────────────────────
function makeDecalMat(texture) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,       // z-fighting 방지
    polygonOffset: true,     // 표면에서 살짝 띄움
    polygonOffsetFactor: -4,
  });
}

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 2, 8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);

  scene.add(new THREE.AmbientLight(0x334466, 4));
  const dir = new THREE.DirectionalLight(0xffffff, 3);
  dir.position.set(5, 8, 5);
  scene.add(dir);

  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ─── 데칼을 붙일 대상 메시들 ─────────────────────────────
  const targets = [];

  // 벽 (납작한 박스)
  const wallGeo = new THREE.BoxGeometry(4, 3, 0.3);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
  const wall    = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(-2.5, 1.5, 0);
  scene.add(wall);
  targets.push(wall);

  // 구
  const sphereGeo = new THREE.SphereGeometry(1.2, 64, 64);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 });
  const sphere    = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.set(2.5, 1.2, 0);
  scene.add(sphere);
  targets.push(sphere);

  // ─── 텍스처 준비 ──────────────────────────────────────────
  const texBullet  = makeBulletHole();
  const texPaintR  = makePaintSplat('#ef4444');
  const texPaintB  = makePaintSplat('#6366f1');
  const texStar    = makeSticker('⭐');
  const texHeart   = makeSticker('❤️');
  const allTextures = [texBullet, texPaintR, texPaintB, texStar, texHeart];

  // ─── 데칼 관리 ───────────────────────────────────────────
  const decals = [];

  function spawnDecal(mesh, position, normal, type, size = 0.6) {
    const orient = new THREE.Euler();
    orient.setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), normal
      )
    );
    // 랜덤 회전 (법선 축 기준)
    orient.z = Math.random() * Math.PI * 2;

    const sizeVec = new THREE.Vector3(size, size, size * 2);
    const geo     = new DecalGeometry(mesh, position, orient, sizeVec);

    let tex;
    if (type === 'bullet') tex = texBullet;
    else if (type === 'paintR') tex = texPaintR;
    else if (type === 'paintB') tex = texPaintB;
    else if (type === 'star')   tex = texStar;
    else                        tex = texHeart;

    const mat     = makeDecalMat(tex);
    const decal   = new THREE.Mesh(geo, mat);
    scene.add(decal);
    decals.push(decal);
  }

  // ─── Raycaster 클릭 처리 ──────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const mouse     = new THREE.Vector2();
  let   decalType = 'bullet';

  function onPointerDown(e) {
    // UI 영역 클릭 무시
    if (e.target !== renderer.domElement) return;

    mouse.x = (e.clientX / window.innerWidth)  *  2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * -2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(targets);
    if (!hits.length) return;

    const hit = hits[0];
    // face.normal은 로컬 좌표 → 월드 좌표로 변환
    const normal = hit.face.normal.clone()
      .transformDirection(hit.object.matrixWorld)
      .normalize();

    const size = decalType === 'bullet' ? 0.5 : 0.8;
    spawnDecal(hit.object, hit.point, normal, decalType, size);
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'decal-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;min-width:240px;">
      <p><strong>Decal (데칼)</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">
        벽·구 클릭 → 데칼 부착
      </p>

      <p style="color:#64748b;font-size:11px;margin-bottom:4px">데칼 종류</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
        <button class="decal-btn" data-type="bullet" style="flex:1;padding:5px 4px;
          border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;border:none;
          background:#334155;color:#fff;">🔫 총알</button>
        <button class="decal-btn" data-type="paintR" style="flex:1;padding:5px 4px;
          border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;border:none;
          background:#334155;color:#fff;">🔴 페인트</button>
        <button class="decal-btn" data-type="paintB" style="flex:1;padding:5px 4px;
          border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;border:none;
          background:#334155;color:#fff;">🔵 페인트</button>
        <button class="decal-btn" data-type="star" style="flex:1;padding:5px 4px;
          border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;border:none;
          background:#334155;color:#fff;">⭐ 스티커</button>
        <button class="decal-btn" data-type="heart" style="flex:1;padding:5px 4px;
          border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;border:none;
          background:#334155;color:#fff;">❤️ 스티커</button>
      </div>

      <button id="clear-decals" style="width:100%;padding:6px;border-radius:4px;
        border:1px solid #334155;background:transparent;color:#64748b;
        font-size:11px;cursor:pointer;">🗑 데칼 전부 지우기</button>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        곡면(구)에도 표면에 맞게 변형됨<br>
        polygonOffset으로 z-fighting 방지<br>
        depthWrite:false → 데칼끼리 겹쳐도 OK
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  // 버튼 선택
  function setDecalType(type) {
    decalType = type;
    document.querySelectorAll('.decal-btn').forEach(b => {
      b.style.background = b.dataset.type === type ? '#6366f1' : '#334155';
    });
  }
  document.querySelectorAll('.decal-btn').forEach(b => {
    b.addEventListener('click', () => setDecalType(b.dataset.type));
  });
  setDecalType('bullet');

  document.getElementById('clear-decals').addEventListener('click', () => {
    decals.forEach(d => { d.geometry.dispose(); d.material.dispose(); scene.remove(d); });
    decals.length = 0;
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

  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    document.body.removeChild(ui);
    allTextures.forEach(t => t.dispose());
    decals.forEach(d => { d.geometry.dispose(); d.material.dispose(); });
    [wallGeo, wallMat, sphereGeo, sphereMat, floorGeo, floorMat].forEach(o => o.dispose());
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
