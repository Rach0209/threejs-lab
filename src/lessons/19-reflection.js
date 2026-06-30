// ══════════════════════════════════════════════════════════════
//  Module 19: Reflection & Refraction (반사 & 굴절)
//
//  배울 것:
//    - CubeCamera       : 오브젝트 주변 6방향을 실시간 촬영해 큐브맵 생성
//    - CubeRenderTarget : CubeCamera 출력을 저장하는 GPU 텍스처
//    - envMap           : 재질에 환경맵 적용 (반사/굴절 소스)
//    - refractionRatio  : 0 = 반사, 1 = 완전 굴절 (스넬의 법칙 근사)
//    - MeshPhysicalMaterial : transmission으로 실제 유리 굴절 표현
//    - reflectivity / metalness 조합
//
//  반사 vs 굴절:
//    반사(Reflection): 빛이 표면에서 튕겨나옴 → 거울, 금속
//    굴절(Refraction): 빛이 재질을 통과하며 꺾임 → 유리, 물, 다이아몬드
//
//  CubeCamera 원리:
//    매 프레임(또는 일정 주기) 오브젝트 위치에서
//    앞/뒤/위/아래/좌/우 6방향을 렌더링 → CubeRenderTarget에 저장.
//    이 큐브맵을 envMap으로 설정하면 주변 환경이 반사됨.
//    → 성능 주의: 매 프레임 씬을 6번 추가 렌더링
//
//  IOR (Index of Refraction, 굴절률):
//    공기 = 1.0, 물 = 1.33, 유리 = 1.5, 다이아몬드 = 2.4
//    Three.js MeshPhysicalMaterial.ior 파라미터로 설정.
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 3, 9);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  // ─── 조명 ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x334466, 2));

  const lights = [
    { color: 0xff4466, pos: [4, 3, 2],   intensity: 30 },
    { color: 0x44aaff, pos: [-4, 2, -2], intensity: 25 },
    { color: 0xffcc44, pos: [0, 5, -4],  intensity: 20 },
  ];
  const pointLights = lights.map(({ color, pos, intensity }) => {
    const l = new THREE.PointLight(color, intensity, 20);
    l.position.set(...pos);
    scene.add(l);
    // 빛 위치 표시용 작은 구
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.08),
      new THREE.MeshBasicMaterial({ color })
    );
    marker.position.copy(l.position);
    scene.add(marker);
    return l;
  });

  // ─── 환경 오브젝트 (반사에 찍힐 씬) ──────────────────────
  //
  //  CubeCamera는 주변 씬을 촬영하므로
  //  반사 구체 외에 눈에 띄는 오브젝트들이 많아야 반사 효과가 잘 보임.
  //
  const envObjects = [];

  // 회전하는 발광 큐브들
  const cubeColors = [0xff4466, 0x44aaff, 0xffcc44, 0x44ffaa, 0xcc44ff];
  cubeColors.forEach((color, i) => {
    const angle  = (i / cubeColors.length) * Math.PI * 2;
    const radius = 4.5;
    const geo    = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const mat    = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    mesh.userData.angle = angle;
    mesh.userData.radius = radius;
    scene.add(mesh);
    envObjects.push(mesh);
  });

  // 바닥 평면
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  scene.add(floor);

  // ─── CubeCamera + CubeRenderTarget ────────────────────────
  //
  //  CubeRenderTarget: 6면 큐브맵 텍스처를 저장하는 렌더 타깃.
  //    resolution: 해상도 (높을수록 선명, 낮을수록 빠름)
  //    generateMipmaps / minFilter: 흐릿한 반사(IBL 스타일)에 필요
  //
  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });

  //  CubeCamera: 6방향 렌더링 카메라.
  //    near/far: 반사에 포함될 거리 범위
  //
  const cubeCamera = new THREE.CubeCamera(0.1, 50, cubeRenderTarget);
  scene.add(cubeCamera);

  // ─── 반사 구체 (Mirror Ball) ──────────────────────────────
  //
  //  envMap = cubeRenderTarget.texture → CubeCamera가 찍은 걸 반사
  //  metalness = 1, roughness = 0 → 완전 금속 거울
  //
  const mirrorGeo = new THREE.SphereGeometry(1, 64, 64);
  const mirrorMat = new THREE.MeshStandardMaterial({
    envMap: cubeRenderTarget.texture,
    metalness: 1.0,
    roughness: 0.0,
    color: 0xffffff,
  });
  const mirrorSphere = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirrorSphere.position.set(-2, 0, 0);
  scene.add(mirrorSphere);

  // ─── 굴절 구체 (Glass Ball) ───────────────────────────────
  //
  //  MeshPhysicalMaterial:
  //    transmission = 1.0 → 완전 투명 (실제 유리 굴절)
  //    ior           : 굴절률 (유리 ≈ 1.5)
  //    thickness     : 재질 두께 (굴절 강도에 영향)
  //    roughness = 0 → 선명한 굴절
  //
  const glassGeo  = new THREE.SphereGeometry(1, 64, 64);
  const glassMat  = new THREE.MeshPhysicalMaterial({
    transmission: 1.0,
    ior:          1.5,
    thickness:    2.0,
    roughness:    0.0,
    metalness:    0.0,
    color:        0xffffff,
    envMap:       cubeRenderTarget.texture,
    envMapIntensity: 1.0,
  });
  const glassSphere = new THREE.Mesh(glassGeo, glassMat);
  glassSphere.position.set(2, 0, 0);
  scene.add(glassSphere);

  // ─── 거친 금속 구체 (Roughness 비교) ─────────────────────
  const roughGeo = new THREE.SphereGeometry(0.55, 32, 32);
  const roughMat = new THREE.MeshStandardMaterial({
    envMap: cubeRenderTarget.texture,
    metalness: 1.0,
    roughness: 0.5,
    color: 0xaaaaff,
  });
  const roughSphere = new THREE.Mesh(roughGeo, roughMat);
  roughSphere.position.set(0, 1.8, 0);
  scene.add(roughSphere);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'reflect-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>Reflection & Refraction</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">왼쪽: 반사 구체 (Mirror)</p>
      <label class="pp-row">
        <span>Roughness</span>
        <input type="range" id="mirror-rough" min="0" max="1" step="0.01" value="0">
        <span id="mirror-rough-val">0.00</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;margin-bottom:6px">오른쪽: 유리 구체 (Glass)</p>
      <label class="pp-row">
        <span>IOR</span>
        <input type="range" id="glass-ior" min="1" max="2.4" step="0.05" value="1.5">
        <span id="glass-ior-val">1.50</span>
      </label>
      <label class="pp-row">
        <span>Thickness</span>
        <input type="range" id="glass-thick" min="0" max="5" step="0.1" value="2">
        <span id="glass-thick-val">2.0</span>
      </label>
      <label class="pp-row">
        <span>Roughness</span>
        <input type="range" id="glass-rough" min="0" max="0.5" step="0.01" value="0">
        <span id="glass-rough-val">0.00</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <label class="pp-row">
        <input type="checkbox" id="cube-update" checked>
        <span>실시간 반사 갱신</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        IOR: 공기=1.0 / 물=1.33<br>
        유리=1.5 / 다이아몬드=2.4
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  let realtimeUpdate = true;

  const bind = (id, valId, dec, cb) => {
    document.getElementById(id).addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById(valId).textContent = v.toFixed(dec);
      cb(v);
    });
  };

  bind('mirror-rough', 'mirror-rough-val', 2, v => { mirrorMat.roughness = v; mirrorMat.needsUpdate = true; });
  bind('glass-ior',    'glass-ior-val',    2, v => { glassMat.ior        = v; glassMat.needsUpdate  = true; });
  bind('glass-thick',  'glass-thick-val',  1, v => { glassMat.thickness  = v; glassMat.needsUpdate  = true; });
  bind('glass-rough',  'glass-rough-val',  2, v => { glassMat.roughness  = v; glassMat.needsUpdate  = true; });

  document.getElementById('cube-update').addEventListener('change', e => {
    realtimeUpdate = e.target.checked;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 주변 큐브 공전
    envObjects.forEach((mesh, i) => {
      const speed = 0.3 + i * 0.04;
      const angle = mesh.userData.angle + elapsed * speed;
      const r     = mesh.userData.radius;
      mesh.position.x = Math.cos(angle) * r;
      mesh.position.z = Math.sin(angle) * r;
      mesh.rotation.x = elapsed * 0.5;
      mesh.rotation.y = elapsed * 0.7;
    });

    // 조명 맥동
    pointLights.forEach((l, i) => {
      l.intensity = lights[i].intensity + Math.sin(elapsed * 2 + i * 2) * 8;
    });

    // ★ CubeCamera 업데이트:
    //    반사 구체를 숨기고 → 주변 씬을 6방향 촬영 → 다시 보이게
    //    (자기 자신이 반사에 찍히는 무한 루프 방지)
    if (realtimeUpdate) {
      mirrorSphere.visible = false;
      glassSphere.visible  = false;
      roughSphere.visible  = false;
      cubeCamera.position.set(0, 0, 0);
      cubeCamera.update(renderer, scene);
      mirrorSphere.visible = true;
      glassSphere.visible  = true;
      roughSphere.visible  = true;
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
    cubeRenderTarget.dispose();
    mirrorGeo.dispose(); mirrorMat.dispose();
    glassGeo.dispose();  glassMat.dispose();
    roughGeo.dispose();  roughMat.dispose();
    floorGeo.dispose();  floorMat.dispose();
    envObjects.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
