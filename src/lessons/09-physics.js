// ══════════════════════════════════════════════════════════════
//  Module 6: 물리 엔진 (cannon-es)
//
//  배울 것:
//    - cannon-es: JavaScript 물리 엔진
//    - World: 물리 세계 (중력, 시간 진행)
//    - Body: 물리적 오브젝트 (질량, 충돌 형태)
//    - Shape: 충돌 판정 형태 (Box, Sphere, Plane)
//    - Three.js Mesh ↔ Cannon Body 동기화 패턴
//
//  핵심 개념:
//    Three.js는 "렌더링"만 담당하고
//    cannon-es는 "물리 계산"만 담당합니다.
//    매 프레임마다 cannon의 계산 결과를
//    Three.js 오브젝트 위치에 복사합니다.
//
//    [cannon Body 위치/회전] → 복사 → [Three.js Mesh 위치/회전]
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

export function init(renderer) {
  // ─── Three.js 세팅 ────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 12, 20);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 3, 0);

  renderer.shadowMap.enabled = true;
  // [deprecated] PCFSoftShadowMap → r185부터 PCFShadowMap으로 통합
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // ─── Cannon.js 물리 세계 ──────────────────────────────────
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0), // 지구 중력 (m/s²)
  });

  // broadphase: 충돌 가능성 있는 쌍을 빠르게 추려내는 알고리즘
  // SAPBroadphase: 많은 오브젝트에 효율적
  world.broadphase = new CANNON.SAPBroadphase(world);

  // 슬리핑: 오랫동안 움직이지 않은 오브젝트를 비활성화 → 성능 향상
  world.allowSleep = true;

  // ─── 공유 재료(Material) 설정 ─────────────────────────────
  //  Cannon의 Material: Three.js Material과 다름!
  //  물리적 특성(마찰, 반발력)을 정의
  const groundMaterial = new CANNON.Material('ground');
  const objectMaterial = new CANNON.Material('object');

  // ContactMaterial: 두 재료가 접촉할 때의 물리 특성
  const contactMaterial = new CANNON.ContactMaterial(groundMaterial, objectMaterial, {
    friction: 0.4,      // 마찰계수 (0=미끄럽, 1=매우 거칠)
    restitution: 0.4,   // 반발계수 (0=충격 흡수, 1=완전 탄성)
  });
  world.addContactMaterial(contactMaterial);

  // ─── 바닥 ─────────────────────────────────────────────────
  // [Three.js] 시각적 바닥
  const floorGeo = new THREE.PlaneGeometry(30, 30);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // [Cannon] 물리 바닥 (Plane은 무한 평면, mass=0 → 고정 오브젝트)
  const floorBody = new CANNON.Body({
    mass: 0, // mass=0: 중력의 영향을 받지 않는 고정 오브젝트
    material: groundMaterial,
    shape: new CANNON.Plane(),
  });
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floorBody);

  // ─── 벽들 ────────────────────────────────────────────────
  const wallPositions = [
    { pos: [0, 5, -15], rot: [0, 0, 0] },
    { pos: [0, 5, 15],  rot: [0, Math.PI, 0] },
    { pos: [-15, 5, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [15, 5, 0],  rot: [0, -Math.PI / 2, 0] },
  ];
  wallPositions.forEach(({ pos, rot }) => {
    const wallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial,
    });
    wallBody.position.set(...pos);
    wallBody.quaternion.setFromEuler(...rot);
    world.addBody(wallBody);
  });

  // ─── 동적 오브젝트 목록 ────────────────────────────────────
  //  { mesh: Three.Mesh, body: CANNON.Body } 쌍으로 관리
  const objects = [];

  // ─── 오브젝트 스폰 함수 ───────────────────────────────────
  const colors = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0x06b6d4];
  let spawnTimer = 0;

  function spawnObject() {
    const isBox = Math.random() > 0.4;
    const size = 0.4 + Math.random() * 0.8;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const x = (Math.random() - 0.5) * 8;
    const z = (Math.random() - 0.5) * 8;

    let mesh, body;

    if (isBox) {
      // ── 박스 ──────────────────────────────────────────────
      // [Three.js] 시각적 박스
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      // [Cannon] 물리 박스
      // mass > 0: 중력의 영향을 받는 동적 오브젝트
      body = new CANNON.Body({
        mass: size * size * size, // 크기에 비례한 질량
        material: objectMaterial,
        shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)),
        linearDamping: 0.1,   // 선형 감쇠 (공기 저항)
        angularDamping: 0.1,  // 회전 감쇠
      });
    } else {
      // ── 구 ────────────────────────────────────────────────
      const geo = new THREE.SphereGeometry(size / 2, 16, 16);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2 });
      mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      scene.add(mesh);

      body = new CANNON.Body({
        mass: size * size,
        material: objectMaterial,
        shape: new CANNON.Sphere(size / 2),
        linearDamping: 0.05,
        angularDamping: 0.05,
      });
    }

    // 높은 곳에서 스폰
    body.position.set(x, 12 + Math.random() * 4, z);
    // 초기 회전 랜덤
    body.quaternion.setFromEuler(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      0
    );
    world.addBody(body);
    objects.push({ mesh, body });

    // 최대 50개 유지 (오래된 것 제거)
    if (objects.length > 50) {
      const old = objects.shift();
      scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
      world.removeBody(old.body);
    }
  }

  // ─── 조명 ─────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 60;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  scene.add(dirLight);

  // ─── UI 안내 ─────────────────────────────────────────────
  const info = document.createElement('div');
  info.id = 'physics-info';
  info.innerHTML = `
    <div class="info-box">
      <p><strong>물리 엔진 (cannon-es)</strong></p>
      <p>⬇️ 중력: 9.82 m/s²</p>
      <p>🎲 오브젝트 자동 스폰 중</p>
      <p>🖱️ 드래그로 시점 변경</p>
      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">
        Three.js: 렌더링<br>
        cannon-es: 물리 계산<br>
        매 프레임 위치 동기화
      </p>
    </div>
  `;
  document.body.appendChild(info);

  // ─── 애니메이션 루프 ──────────────────────────────────────
  // [deprecated] const clock = new THREE.Clock();
  const timer = new Timer();
  const FIXED_TIME_STEP = 1 / 60; // 물리 엔진 고정 시간 간격
  const MAX_SUB_STEPS = 3;        // 렌더 프레임당 최대 물리 스텝 수
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = timer.getDelta(); // 물리 엔진 시간 진행에 사용

    // 물리 세계 시간 진행
    // step(fixedTimeStep, delta, maxSubSteps)
    world.step(FIXED_TIME_STEP, delta, MAX_SUB_STEPS);

    // ── Three.js ↔ Cannon 동기화 ──────────────────────────
    //  이 부분이 물리 엔진 연동의 핵심입니다.
    //  Cannon이 계산한 위치/회전을 Three.js Mesh에 복사
    objects.forEach(({ mesh, body }) => {
      mesh.position.copy(body.position);       // Vec3 → Vector3
      mesh.quaternion.copy(body.quaternion);   // Quaternion 동일
    });

    // 주기적으로 오브젝트 스폰
    spawnTimer += delta;
    if (spawnTimer > 0.5) { spawnObject(); spawnTimer = 0; }

    controls.update();
    renderer.render(scene, camera);
  }
  // Timer는 첫 update() 호출 전까지 내부 시간이 0이므로
  // animate() 를 호출하면서 자동으로 시작됩니다.
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
    document.body.removeChild(info);
    objects.forEach(({ mesh, body }) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      world.removeBody(body);
    });
    floorGeo.dispose(); floorMat.dispose();
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
