// ══════════════════════════════════════════════════════════════
//  Module 33: Environment Map / IBL (이미지 기반 조명)
//
//  배울 것:
//    - CubeRenderTarget   : 씬을 6방향으로 렌더 → 큐브맵 생성
//    - CubeCamera         : 6면 큐브맵을 찍는 카메라
//    - scene.environment  : 씬 전체 PBR 조명 소스로 사용
//    - envMap / envMapIntensity : 재질별 반사 강도 제어
//    - 반사(Reflection)   : 금속 재질 — 환경이 표면에 비침
//    - 굴절(Refraction)   : 유리 재질 — 환경이 표면을 통해 휘어 보임
//
//  IBL이란?
//    전통 조명: PointLight, DirectionalLight 등 광원 개수 제한
//    IBL: 주변 환경 자체를 조명으로 사용 → 모든 방향에서 빛이 옴
//    → PBR 재질(MeshStandardMaterial)과 함께 써야 의미있음
//
//  CubeCamera 동작 원리:
//    1. 매 프레임 구 오브젝트를 숨김
//    2. CubeCamera가 그 위치에서 6방향 렌더
//    3. 결과를 CubeRenderTarget에 저장
//    4. 구 오브젝트 다시 보여줌
//    5. 구의 envMap에 CubeRenderTarget.texture 연결
//    → 실시간으로 주변 환경이 구 표면에 반사됨
//
//  ProceduralEnv (코드로 생성한 환경):
//    실제 프로젝트에서는 .hdr/.exr 파일 로드
//    이 레슨에서는 직접 코드로 환경을 만들어 원리를 이해
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace    = THREE.SRGBColorSpace;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 1.5, 7);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.5, 0);

  // ─── 조명 (약하게 — 환경맵이 주 광원) ───────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const sun = new THREE.DirectionalLight(0xfff5e0, 2);
  sun.position.set(5, 10, 5);
  scene.add(sun);

  // ─── 환경 씬 구성 (반사에 찍힐 주변 환경) ────────────────
  //  하늘 돔
  const skyGeo = new THREE.SphereGeometry(40, 32, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    color: 0x88ccff,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);

  // 바닥
  const floorGeo = new THREE.PlaneGeometry(30, 30);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a4a, roughness: 0.8, metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  scene.add(floor);

  // 주변 오브젝트 (반사에 찍힐 것들)
  const boxColors  = [0xff4444, 0x44ff88, 0x4488ff, 0xffcc00, 0xff44cc, 0x44ffff];
  const envObjects = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const r     = 4;
    const geo   = new THREE.BoxGeometry(0.8, 0.8 + Math.random() * 1.5, 0.8);
    const mat   = new THREE.MeshStandardMaterial({
      color: boxColors[i], roughness: 0.4, metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    scene.add(mesh);
    envObjects.push(mesh);
  }

  // ─── CubeCamera + CubeRenderTarget ───────────────────────
  //  해상도 256: 너무 크면 매 프레임 렌더 비용 증가
  const cubeRT     = new THREE.WebGLCubeRenderTarget(256, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 50, cubeRT);
  scene.add(cubeCamera);

  // 환경맵을 씬 전체 조명으로도 사용
  scene.environment = cubeRT.texture;

  // ─── 쇼케이스 오브젝트들 ─────────────────────────────────
  //  1. 완전 반사 구 (크롬볼)
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 1.0, roughness: 0.0,
    envMap: cubeRT.texture, envMapIntensity: 1.0,
  });
  const chromeSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 64, 64), chromeMat
  );
  chromeSphere.position.set(-2.5, 0, 0);
  scene.add(chromeSphere);

  //  2. 반금속 구 (거친 금속)
  const roughMetalMat = new THREE.MeshStandardMaterial({
    color: 0xd4a020, metalness: 0.9, roughness: 0.4,
    envMap: cubeRT.texture, envMapIntensity: 1.0,
  });
  const roughSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 64, 64), roughMetalMat
  );
  roughSphere.position.set(0, 0, 0);
  scene.add(roughSphere);

  //  3. 유리 구 (굴절)
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0,
    transmission: 1.0,    // 투과율 (1 = 완전 투명)
    thickness: 1.5,       // 굴절 두께
    ior: 1.5,             // 굴절률 (유리 = 1.5, 물 = 1.33, 다이아 = 2.4)
    envMap: cubeRT.texture,
    envMapIntensity: 0.5,
  });
  const glassSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 64, 64), glassMat
  );
  glassSphere.position.set(2.5, 0, 0);
  scene.add(glassSphere);

  //  4. 다양한 roughness 비교 (작은 구 5개)
  const roughnessSpheres = [];
  for (let i = 0; i < 5; i++) {
    const r   = i / 4;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa, metalness: 1.0, roughness: r,
      envMap: cubeRT.texture, envMapIntensity: 1.0,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 32), mat);
    mesh.position.set(-2 + i, -0.55, 2.5);
    scene.add(mesh);
    roughnessSpheres.push(mesh);
  }

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'envmap-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>Environment Map / IBL</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <span>반사 강도</span>
        <input type="range" id="env-int" min="0" max="3" step="0.05" value="1">
        <span id="env-int-val">1.00</span>
      </label>
      <label class="pp-row">
        <span>크롬 roughness</span>
        <input type="range" id="chrome-rough" min="0" max="1" step="0.01" value="0">
        <span id="chrome-rough-val">0.00</span>
      </label>
      <label class="pp-row">
        <span>유리 IOR</span>
        <input type="range" id="glass-ior" min="1" max="2.5" step="0.05" value="1.5">
        <span id="glass-ior-val">1.50</span>
      </label>
      <label class="pp-row">
        <span>유리 투과율</span>
        <input type="range" id="glass-trans" min="0" max="1" step="0.02" value="1">
        <span id="glass-trans-val">1.00</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <label class="pp-row">
        <span>실시간 반사</span>
        <input type="checkbox" id="realtime-on" checked>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.8">
        <span style="color:#94a3b8">왼쪽</span>: 크롬 (metalness=1, rough=0)<br>
        <span style="color:#fbbf24">중앙</span>: 금 (metalness=0.9, rough=0.4)<br>
        <span style="color:#7dd3fc">오른쪽</span>: 유리 (transmission, IOR)<br>
        아래 5개: roughness 0→1 비교<br><br>
        <span style="color:#818cf8">IOR</span>: 물=1.33 / 유리=1.5<br>
        다이아몬드=2.4
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  document.getElementById('env-int').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('env-int-val').textContent = v.toFixed(2);
    [chromeMat, roughMetalMat, glassMat, ...roughnessSpheres.map(s => s.material)].forEach(m => {
      m.envMapIntensity = v;
    });
  });
  document.getElementById('chrome-rough').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('chrome-rough-val').textContent = v.toFixed(2);
    chromeMat.roughness = v;
  });
  document.getElementById('glass-ior').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('glass-ior-val').textContent = v.toFixed(2);
    glassMat.ior = v;
  });
  document.getElementById('glass-trans').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('glass-trans-val').textContent = v.toFixed(2);
    glassMat.transmission = v;
  });

  let realtimeOn = true;
  document.getElementById('realtime-on').addEventListener('change', e => {
    realtimeOn = e.target.checked;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 주변 오브젝트 천천히 공전
    envObjects.forEach((mesh, i) => {
      const base  = (i / envObjects.length) * Math.PI * 2;
      const angle = base + elapsed * 0.2;
      mesh.position.x = Math.cos(angle) * 4;
      mesh.position.z = Math.sin(angle) * 4;
      mesh.rotation.y = elapsed * 0.5;
    });

    // CubeCamera 업데이트 — 실시간 반사 계산
    if (realtimeOn) {
      // 반사 구들을 잠시 숨겨서 자기 자신이 찍히지 않게
      chromeSphere.visible = false;
      roughSphere.visible  = false;
      glassSphere.visible  = false;
      roughnessSpheres.forEach(s => s.visible = false);

      cubeCamera.position.copy(chromeSphere.position);
      cubeCamera.update(renderer, scene);

      chromeSphere.visible = true;
      roughSphere.visible  = true;
      glassSphere.visible  = true;
      roughnessSpheres.forEach(s => s.visible = true);
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
    scene.environment = null;
    cubeRT.dispose();
    [skyGeo, skyMat, floorGeo, floorMat,
     chromeMat, roughMetalMat, glassMat].forEach(o => o?.dispose?.());
    envObjects.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
    roughnessSpheres.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
