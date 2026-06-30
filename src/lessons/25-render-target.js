// ══════════════════════════════════════════════════════════════
//  Module 25: RenderTarget / FBO (Framebuffer Object)
//
//  배울 것:
//    - WebGLRenderTarget  : 화면 대신 텍스처에 씬을 렌더링
//    - FBO 패턴           : render to texture → 그 텍스처를 다른 메시에 사용
//    - 보안 카메라 효과   : 별도 카메라로 씬을 찍어 TV 모니터에 표시
//    - 포탈 효과          : 포탈 면에 다른 시점의 씬을 렌더링
//    - 후처리 기반 원리   : EffectComposer도 내부적으로 RenderTarget 사용
//
//  FBO 개념:
//    일반 렌더링: scene → GPU → 화면(canvas)
//    FBO 렌더링: scene → GPU → 텍스처(RenderTarget) → 다른 메시의 map으로 사용
//
//  활용 사례:
//    - 보안 카메라 / CCTV 모니터 UI
//    - 포탈 / 웜홀 (다른 공간을 들여다보는 창)
//    - 거울 (MeshBasicMaterial.map = renderTarget.texture)
//    - 후처리 효과 (Bloom, DOF 등)
//    - 미니맵 (탑뷰 카메라 → 코너 UI)
//
//  주의:
//    매 프레임 RenderTarget 렌더링이 추가되므로 draw call 2배.
//    크기는 필요한 만큼만 (512·1024 등).
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  // ─── 메인 씬 (플레이어가 보는 공간) ─────────────────────
  const mainScene  = new THREE.Scene();
  mainScene.background = new THREE.Color(0x0f172a);
  mainScene.fog = new THREE.Fog(0x0f172a, 15, 40);

  const mainCamera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 100
  );
  mainCamera.position.set(0, 3, 10);

  const controls = new OrbitControls(mainCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);

  // 메인 씬 조명
  mainScene.add(new THREE.AmbientLight(0x223344, 4));
  const mainDir = new THREE.DirectionalLight(0xffffff, 2);
  mainDir.position.set(5, 8, 5);
  mainDir.castShadow = true;
  mainScene.add(mainDir);

  // 바닥 (메인 씬)
  const floorGeo = new THREE.PlaneGeometry(30, 30);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  mainScene.add(floor);
  mainScene.add(new THREE.GridHelper(30, 30, 0x1e3a5f, 0x0d1b2a));

  // ─── 움직이는 오브젝트들 (메인 씬 콘텐츠) ───────────────
  const objects = [];
  const colors  = [0x6366f1, 0xf43f5e, 0x10b981, 0xf59e0b, 0x8b5cf6];

  for (let i = 0; i < 5; i++) {
    const geo  = i % 2 === 0
      ? new THREE.BoxGeometry(0.8, 0.8, 0.8)
      : new THREE.SphereGeometry(0.45, 16, 16);
    const mat  = new THREE.MeshStandardMaterial({
      color: colors[i], roughness: 0.3, metalness: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(-4 + i * 2, 0.5, 0);
    mesh.castShadow = true;
    mainScene.add(mesh);
    objects.push({ mesh, speed: 0.5 + i * 0.3, radius: 1.5 + i * 0.3 });
  }

  // ═══════════════════════════════════════════════════════════
  //  섹션 1: 보안 카메라 (CCTV)
  //  별도 카메라 → RenderTarget → 모니터 메시의 texture
  // ═══════════════════════════════════════════════════════════

  // 감시 카메라 (천장에서 내려다봄)
  const cctvCamera = new THREE.PerspectiveCamera(80, 1, 0.1, 30);
  cctvCamera.position.set(0, 8, 0);
  cctvCamera.lookAt(0, 0, 0);
  mainScene.add(cctvCamera);

  // 카메라 모양 (시각적 표현)
  const camBodyGeo = new THREE.BoxGeometry(0.4, 0.25, 0.6);
  const camMat     = new THREE.MeshStandardMaterial({ color: 0x334155 });
  const camBody    = new THREE.Mesh(camBodyGeo, camMat);
  camBody.position.copy(cctvCamera.position);
  mainScene.add(camBody);

  // CameraHelper: 카메라 절두체(시야각·near·far)를 선으로 시각화
  const cctvHelper = new THREE.CameraHelper(cctvCamera);
  mainScene.add(cctvHelper);

  // CCTV RenderTarget (512×512)
  const cctvTarget = new THREE.WebGLRenderTarget(512, 512, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  // 모니터 메시 — cctvTarget.texture를 map으로 사용
  const monitorGeo = new THREE.PlaneGeometry(3.2, 3.2);
  const monitorMat = new THREE.MeshBasicMaterial({ map: cctvTarget.texture });
  const monitor    = new THREE.Mesh(monitorGeo, monitorMat);
  monitor.position.set(-4, 2.5, -5);
  monitor.rotation.y = 0.3;
  mainScene.add(monitor);

  // 모니터 프레임
  const frameGeo = new THREE.BoxGeometry(3.6, 3.6, 0.1);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
  const frame    = new THREE.Mesh(frameGeo, frameMat);
  frame.position.copy(monitor.position);
  frame.position.z -= 0.06;
  frame.rotation.copy(monitor.rotation);
  mainScene.add(frame);

  // CCTV 라벨
  const cctvLabel = makeLabel('CCTV Monitor\n(RenderTarget)');
  cctvLabel.position.set(-4, 4.5, -5);
  mainScene.add(cctvLabel);

  // ═══════════════════════════════════════════════════════════
  //  섹션 2: 포탈 (다른 씬을 들여다보는 창)
  //  별도 씬 + 카메라 → RenderTarget → 포탈 면
  // ═══════════════════════════════════════════════════════════

  // 포탈 너머의 별도 씬
  const portalScene  = new THREE.Scene();
  portalScene.background = new THREE.Color(0x1a0533);
  portalScene.fog = new THREE.Fog(0x1a0533, 5, 20);

  portalScene.add(new THREE.AmbientLight(0x6600cc, 3));
  const portalLight = new THREE.PointLight(0xaa44ff, 5, 10);
  portalLight.position.set(0, 3, 0);
  portalScene.add(portalLight);

  const portalFloorMat = new THREE.MeshStandardMaterial({ color: 0x2d0a4e, roughness: 0.8 });
  const portalFloor    = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), portalFloorMat);
  portalFloor.rotation.x = -Math.PI / 2;
  portalScene.add(portalFloor);

  // 포탈 씬 안의 오브젝트들
  const portalObjects = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const geo   = new THREE.OctahedronGeometry(0.4, 0);
    const mat   = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.75 + i * 0.03, 1, 0.5),
      emissive: new THREE.Color().setHSL(0.75 + i * 0.03, 1, 0.3),
      roughness: 0.1, metalness: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(angle) * 2.5, 1, Math.sin(angle) * 2.5);
    portalScene.add(mesh);
    portalObjects.push({ mesh, angle, speed: 0.8 + i * 0.1 });
  }

  // 포탈 카메라
  const portalCamera = new THREE.PerspectiveCamera(70, 1, 0.1, 30);
  portalCamera.position.set(0, 2, 4);
  portalCamera.lookAt(0, 1, 0);

  // 포탈 RenderTarget (512×512)
  const portalTarget = new THREE.WebGLRenderTarget(512, 512, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  // 포탈 면 — 둥근 원형 포탈
  const portalGeo = new THREE.CircleGeometry(1.5, 64);
  const portalMat = new THREE.MeshBasicMaterial({ map: portalTarget.texture });
  const portalMesh = new THREE.Mesh(portalGeo, portalMat);
  portalMesh.position.set(4, 2, -5);
  mainScene.add(portalMesh);

  // 포탈 테두리 (발광 링)
  const ringGeo  = new THREE.TorusGeometry(1.5, 0.08, 16, 64);
  const ringMat  = new THREE.MeshBasicMaterial({ color: 0xaa44ff });
  const ring     = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(portalMesh.position);
  mainScene.add(ring);

  const portalLabel = makeLabel('Portal\n(다른 씬 RenderTarget)');
  portalLabel.position.set(4, 4.0, -5);
  mainScene.add(portalLabel);

  // ═══════════════════════════════════════════════════════════
  //  섹션 3: 미니맵 (탑뷰 카메라 → 화면 우하단)
  //  클릭한 위치로 메인 카메라 이동 기능 포함
  // ═══════════════════════════════════════════════════════════
  const minimapCamera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 30);
  minimapCamera.position.set(0, 15, 0);
  minimapCamera.lookAt(0, 0, 0);
  mainScene.add(minimapCamera);

  // 미니맵에서 플레이어(메인카메라) 위치를 나타내는 화살표 마커
  const markerGeo = new THREE.ConeGeometry(0.3, 0.8, 8);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const marker    = new THREE.Mesh(markerGeo, markerMat);
  marker.rotation.x = -Math.PI / 2; // 위에서 봤을 때 앞을 가리키도록
  mainScene.add(marker);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'rt-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>RenderTarget / FBO</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <span>CCTV 회전</span>
        <input type="checkbox" id="cctv-rotate" checked>
      </label>

      <label class="pp-row" style="margin-top:4px;">
        <span>포탈 카메라 회전</span>
        <input type="checkbox" id="portal-rotate" checked>
      </label>

      <label class="pp-row" style="margin-top:4px;">
        <span>미니맵 표시</span>
        <input type="checkbox" id="minimap-show" checked>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.8">
        <span style="color:#94a3b8">좌측 모니터</span>: CCTV<br>
        <span style="color:#c084fc">우측 포탈</span>: 별세계<br>
        <span style="color:#38bdf8">우하단</span>: 미니맵 (클릭 가능)
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  let cctvRotate   = true;
  let portalRotate = true;
  let minimapShow  = true;

  document.getElementById('cctv-rotate').addEventListener('change',   e => { cctvRotate   = e.target.checked; });
  document.getElementById('portal-rotate').addEventListener('change', e => { portalRotate = e.target.checked; });
  document.getElementById('minimap-show').addEventListener('change',  e => {
    minimapShow = e.target.checked;
    minimapOverlay.style.display = minimapShow ? 'block' : 'none';
  });

  // ─── 미니맵 크기 ──────────────────────────────────────────
  const MINI_SIZE = 180;

  // ─── 미니맵 오버레이 (버튼) ───────────────────────────────
  //  canvas 위에 position:fixed로 미니맵과 같은 위치에 배치
  const minimapOverlay = document.createElement('div');
  minimapOverlay.style.cssText = `
    position: fixed;
    right: 10px;
    bottom: ${MINI_SIZE + 10}px;
    width: ${MINI_SIZE}px;
    display: flex;
    gap: 4px;
    z-index: 200;
    pointer-events: auto;
  `;
  minimapOverlay.innerHTML = `
    <button id="mm-teleport" style="flex:1;padding:4px 0;border-radius:4px;font-size:10px;
      font-weight:700;cursor:pointer;border:none;
      background:#38bdf8;color:#0f172a;">📷 시점이동</button>
    <button id="mm-waypoint" style="flex:1;padding:4px 0;border-radius:4px;font-size:10px;
      font-weight:700;cursor:pointer;border:none;
      background:#334155;color:#94a3b8;">📍 웨이포인트</button>
  `;
  document.body.appendChild(minimapOverlay);

  let minimapMode = 'teleport'; // 'teleport' | 'waypoint'
  const btnTeleport = document.getElementById('mm-teleport');
  const btnWaypoint = document.getElementById('mm-waypoint');

  function setMinimapMode(mode) {
    minimapMode = mode;
    btnTeleport.style.background = mode === 'teleport' ? '#38bdf8' : '#334155';
    btnTeleport.style.color      = mode === 'teleport' ? '#0f172a' : '#94a3b8';
    btnWaypoint.style.background = mode === 'waypoint' ? '#f59e0b' : '#334155';
    btnWaypoint.style.color      = mode === 'waypoint' ? '#0f172a' : '#94a3b8';
  }
  btnTeleport.addEventListener('click', () => setMinimapMode('teleport'));
  btnWaypoint.addEventListener('click', () => setMinimapMode('waypoint'));

  // ─── 웨이포인트 핀 관리 ───────────────────────────────────
  const waypointPins = [];
  const pinGeo = new THREE.CylinderGeometry(0, 0.2, 0.8, 6);
  const pinMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

  function addWaypoint(wx, wz) {
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(wx, 0.4, wz);
    mainScene.add(pin);
    waypointPins.push(pin);
  }

  // ─── 미니맵 클릭 핸들러 ───────────────────────────────────
  //  WebGL viewport Y=0 → 화면 아래 / clientY Y=0 → 화면 위
  //  setViewport(W-MINI-10, 10, ...) → CSS top = H - 10 - MINI_SIZE
  function onCanvasClick(e) {
    if (!minimapShow) return;
    const W = window.innerWidth, H = window.innerHeight;
    const px = e.clientX, py = e.clientY;

    const cssLeft = W - MINI_SIZE - 10;
    const cssTop  = H - MINI_SIZE - 10;

    if (px < cssLeft || px > cssLeft + MINI_SIZE) return;
    if (py < cssTop  || py > cssTop  + MINI_SIZE) return;

    const normX  = (px - cssLeft) / MINI_SIZE;
    const normY  = (py - cssTop)  / MINI_SIZE;
    const worldX = (normX * 2 - 1) * 8;
    const worldZ = (normY * 2 - 1) * 8;

    if (minimapMode === 'teleport') {
      const targetY = mainCamera.position.y;
      mainCamera.position.set(worldX, targetY, worldZ + 5);
      controls.target.set(worldX, 0, worldZ);
      controls.update();
    } else {
      addWaypoint(worldX, worldZ);
    }
  }
  renderer.domElement.addEventListener('click', onCanvasClick);

  // 미니맵 위에서 드래그 시 OrbitControls 비활성화
  //  mousedown → 미니맵 영역이면 controls.enabled = false
  //  mouseup   → 항상 복구
  function isInMinimap(e) {
    if (!minimapShow) return false;
    const W = window.innerWidth, H = window.innerHeight;
    const cssLeft = W - MINI_SIZE - 10;
    const cssTop  = H - MINI_SIZE - 10;
    return e.clientX >= cssLeft && e.clientX <= cssLeft + MINI_SIZE &&
           e.clientY >= cssTop  && e.clientY <= cssTop  + MINI_SIZE;
  }
  function onMouseDown(e) { if (isInMinimap(e)) controls.enabled = false; }
  function onMouseUp()    { controls.enabled = true; }
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  // ─── 렌더링 루프 ──────────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const t = timer.getElapsed();

    // 오브젝트 움직임
    objects.forEach(({ mesh, speed, radius }, i) => {
      const angle = t * speed + i * (Math.PI * 2 / objects.length);
      mesh.position.x = Math.cos(angle) * radius;
      mesh.position.z = Math.sin(angle) * radius;
      mesh.rotation.y = t * speed;
    });

    // 포탈 씬 내부 오브젝트 회전
    portalObjects.forEach(({ mesh, speed }, i) => {
      mesh.rotation.y = t * speed;
      mesh.position.y = 1 + Math.sin(t * speed * 0.7 + i) * 0.3;
    });

    // CCTV 카메라 회전 (좌우 스윕)
    if (cctvRotate) {
      cctvCamera.position.x = Math.sin(t * 0.4) * 4;
      cctvCamera.lookAt(0, 0, 0);
      camBody.position.copy(cctvCamera.position);
    }
    // CameraHelper는 카메라 행렬이 바뀔 때마다 수동 업데이트 필요
    cctvHelper.update();

    // 미니맵 마커: 메인 카메라 XZ 위치 추적
    marker.position.set(mainCamera.position.x, 0.5, mainCamera.position.z);
    // 카메라가 바라보는 방향으로 마커 회전
    marker.rotation.z = -Math.atan2(
      mainCamera.getWorldDirection(new THREE.Vector3()).x,
      mainCamera.getWorldDirection(new THREE.Vector3()).z
    );

    // 포탈 카메라 원형 이동
    if (portalRotate) {
      portalCamera.position.x = Math.cos(t * 0.5) * 4;
      portalCamera.position.z = Math.sin(t * 0.5) * 4;
      portalCamera.lookAt(0, 1, 0);
    }

    // ── RenderTarget 렌더링 (화면에 출력하기 전에 먼저) ────
    //
    //  중요: renderer.setRenderTarget(target) 후 렌더하면
    //  결과가 화면이 아닌 target 텍스처에 저장됨.
    //  null로 돌려놔야 메인 화면으로 복귀.

    // 1. CCTV → cctvTarget 텍스처에 렌더
    renderer.setRenderTarget(cctvTarget);
    renderer.render(mainScene, cctvCamera);

    // 2. 포탈 씬 → portalTarget 텍스처에 렌더
    renderer.setRenderTarget(portalTarget);
    renderer.render(portalScene, portalCamera);

    // 3. 메인 씬 → 화면(null)에 렌더
    renderer.setRenderTarget(null);
    renderer.render(mainScene, mainCamera);

    // 4. 미니맵: setViewport로 화면 우하단에 탑뷰 직접 렌더
    if (minimapShow) {
      const W = window.innerWidth, H = window.innerHeight;
      renderer.setScissorTest(true);
      renderer.setScissor(W - MINI_SIZE - 10, 10, MINI_SIZE, MINI_SIZE);
      renderer.setViewport(W - MINI_SIZE - 10, 10, MINI_SIZE, MINI_SIZE);
      renderer.render(mainScene, minimapCamera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
    }

    controls.update();
  }
  animate();

  function onResize() {
    mainCamera.aspect = window.innerWidth / window.innerHeight;
    mainCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    document.body.removeChild(ui);

    // RenderTarget 해제 필수
    cctvTarget.dispose();
    portalTarget.dispose();

    renderer.domElement.removeEventListener('click', onCanvasClick);
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    document.body.removeChild(minimapOverlay);
    waypointPins.forEach(p => { p.geometry.dispose(); mainScene.remove(p); });
    pinGeo.dispose(); pinMat.dispose();
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);

    [floorGeo, floorMat, monitorGeo, monitorMat, frameGeo, frameMat,
     camBodyGeo, camMat, portalGeo, portalMat, ringGeo, ringMat,
     markerGeo, markerMat,
     portalFloor.geometry, portalFloorMat].forEach(o => o?.dispose?.());

    mainScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    portalScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  };
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#94a3b8';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  text.split('\n').forEach((line, i) => ctx.fillText(line, 160, 24 + i * 28));
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(3, 0.75, 1);
  return sprite;
}
