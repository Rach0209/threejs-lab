// ══════════════════════════════════════════════════════════════
//  레슨 53: 차량 물리 — RaycastVehicle
//
//  📌 50번(캐릭터)은 캡슐 하나가 벽을 슬라이딩하는 정도였지만, 자동차는
//     바퀴 4개가 각각 서스펜션을 갖고 지면을 누르며, 조향·가속·제동이
//     맞물려 돌아가야 합니다. cannon-es는 이걸 직접 강체 4개 + 힌지로
//     짜지 않아도 되게, 바퀴를 "레이캐스트"로 흉내내는 전용 클래스
//     (RaycastVehicle)를 제공합니다.
//
//  배울 것:
//    - RaycastVehicle 구조   : 차체(chassisBody)는 평범한 DYNAMIC Box
//                              바디. 바퀴는 실제 강체가 아니라 차체
//                              바닥에서 아래로 레이를 쏴서 지면까지의
//                              거리로 서스펜션 압축량을 계산하는 방식
//                              (그래서 "레이캐스트" 비클)
//    - 서스펜션 파라미터      : stiffness(뻣뻣함)·damping(감쇠)·
//                              restLength(자연 길이)·maxTravel(최대
//                              압축량) 조합으로 승차감이 완전히 달라짐
//    - 조향 vs 구동           : setSteeringValue()는 앞바퀴 방향만 틀고,
//                              applyEngineForce()는 뒷바퀴에 힘을 줘서
//                              민다 — 앞바퀴 굴림(FWD)/뒷바퀴 굴림(RWD)
//                              /사륜(AWD)을 바퀴 인덱스만으로 선택 가능
//    - frictionSlip           : 바퀴 하나당 "타이어 그립" 값 — 낮추면
//                              코너에서 미끄러지는(드리프트) 아케이드
//                              느낌, 높이면 착 붙는 느낌
//    - 차체 ↔ 다른 바디 충돌  : 바퀴는 레이캐스트지만 차체 자체는 진짜
//                              DYNAMIC Body라서 장애물과 정상적으로
//                              충돌·튕겨나감 (50번의 캐릭터와 동일 원리)
//
//  🎯 실전 활용 예시:
//    - 웹 기반 레이싱/드라이빙 게임의 차량 컨트롤러
//    - 건축 워크스루의 차량 이동 데모
//    - 물류/시뮬레이션 툴의 차량 경로 시각화
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import * as CANNON from 'cannon-es';

const MAX_ENGINE_FORCE = 1400;
const MAX_BRAKE_FORCE  = 60;
const MAX_STEER        = 0.55;
const STEER_LERP       = 0.12; // 조향각이 순간이동하지 않고 부드럽게 따라오게

const GROUP_WORLD   = 1;
const GROUP_VEHICLE = 2;

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb8d8);
  scene.fog = new THREE.FogExp2(0x8fb8d8, 0.01);

  const camera = new THREE.PerspectiveCamera(
    65, window.innerWidth / window.innerHeight, 0.1, 300
  );

  scene.add(new THREE.AmbientLight(0x99aacc, 2));
  const sun = new THREE.DirectionalLight(0xfff5e0, 3);
  sun.position.set(25, 35, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -35;
  sun.shadow.camera.right = sun.shadow.camera.top = 35;
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // ══════════════════════════════════════════════════════════
  //  물리 세계
  // ══════════════════════════════════════════════════════════
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -10, 0) });
  world.broadphase = new CANNON.NaiveBroadphase(); // SAPBroadphase 충돌누락 버그 회피(레슨50 참고)
  world.solver.iterations = 12; // 바퀴 4개 + 서스펜션 접촉이 많아 기본치보다 넉넉히

  const groundMat = new CANNON.Material('ground');
  const wheelMat  = new CANNON.Material('wheel');
  const bodyMat   = new CANNON.Material('body');
  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, wheelMat, {
    friction: 0.3, restitution: 0,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, bodyMat, {
    friction: 0.4, restitution: 0.1,
  }));

  const colliders = []; // { mesh, geo, mat, body } — cleanup에서 일괄 처리

  // ─── 바닥 (얇은 Box — CANNON.Plane 레이캐스트 정밀도 버그 회피) ──
  const floorGeo = new THREE.PlaneGeometry(120, 120);
  const floorThreeMat = new THREE.MeshStandardMaterial({ color: 0x4d7a4d, roughness: 0.95 });
  const floorMesh = new THREE.Mesh(floorGeo, floorThreeMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const floorBody = new CANNON.Body({
    mass: 0, material: groundMat, collisionFilterGroup: GROUP_WORLD,
    shape: new CANNON.Box(new CANNON.Vec3(60, 0.1, 60)),
  });
  floorBody.position.set(0, -0.1, 0);
  floorBody.updateAABB(); // STATIC 바디는 position 확정 후 반드시 수동 갱신 (레슨50 참고)
  world.addBody(floorBody);

  // ─── 경계 벽 ────────────────────────────────────────────────
  function addWall(x, z, w, d, h, rotY = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
      mass: 0, material: groundMat, collisionFilterGroup: GROUP_WORLD,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    });
    body.position.set(x, h / 2, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotY);
    body.updateAABB();
    world.addBody(body);

    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    colliders.push({ mesh, geo, mat, body });
  }
  const ARENA = 55;
  addWall(0, -ARENA, ARENA * 2, 1, 1.4);
  addWall(0,  ARENA, ARENA * 2, 1, 1.4);
  addWall(-ARENA, 0, 1, ARENA * 2, 1.4, Math.PI / 2);
  addWall( ARENA, 0, 1, ARENA * 2, 1.4, Math.PI / 2);

  // ─── 점프대(경사로) ────────────────────────────────────────
  function addRamp(x, z, rotY, angleDeg) {
    const w = 6, len = 8, thick = 0.4;
    const geo = new THREE.BoxGeometry(w, thick, len);
    const mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
      mass: 0, material: groundMat, collisionFilterGroup: GROUP_WORLD,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, thick / 2, len / 2)),
    });
    const angle = THREE.MathUtils.degToRad(angleDeg);
    const qYaw = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotY);
    const qTilt = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -angle);
    body.quaternion.copy(qYaw.mult(qTilt));
    body.position.set(x, Math.sin(angle) * len / 2 * 0.55, z);
    body.updateAABB();
    world.addBody(body);

    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    colliders.push({ mesh, geo, mat, body });
  }
  addRamp(15, -20, 0, 14);
  addRamp(-18, 10, Math.PI * 0.5, 12);

  // ─── 굴러다니는 드럼통(DYNAMIC 장애물) ─────────────────────
  const barrelBodies = [];
  function addBarrel(x, z) {
    const r = 0.6, h = 1.1;
    const geo = new THREE.CylinderGeometry(r, r, h, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5, metalness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
      mass: 25, material: bodyMat, collisionFilterGroup: GROUP_WORLD,
      shape: new CANNON.Cylinder(r, r, h, 12),
      linearDamping: 0.3, angularDamping: 0.4,
    });
    body.position.set(x, h / 2, z);
    world.addBody(body);
    colliders.push({ mesh, geo, mat, body });
    barrelBodies.push(body);
  }
  for (let i = 0; i < 6; i++) {
    addBarrel(-6 + i * 2.4, 0);
  }

  // ══════════════════════════════════════════════════════════
  //  차량 — 차체(DYNAMIC Box) + RaycastVehicle 바퀴 4개
  // ══════════════════════════════════════════════════════════
  const CHASSIS_HALF = new CANNON.Vec3(0.85, 0.4, 1.9);
  const chassisBody = new CANNON.Body({
    mass: 160,
    material: bodyMat,
    collisionFilterGroup: GROUP_VEHICLE,
    collisionFilterMask: GROUP_WORLD, // 다른 차량은 없으므로 세계 지형/장애물만 충돌
  });
  chassisBody.addShape(new CANNON.Box(CHASSIS_HALF));
  chassisBody.position.set(0, 2, 30);

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexRightAxis: 0,   // x
    indexForwardAxis: 2, // z — Three.js와 동일한 축 관례라 렌더링 시 별도 보정 불필요
    indexUpAxis: 1,       // y
  });

  const WHEEL_RADIUS = 0.36;
  const wheelOptions = {
    radius: WHEEL_RADIUS,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 32,
    suspensionRestLength: 0.32,
    frictionSlip: 2.2,           // 낮출수록 잘 미끄러짐(드리프트), 높일수록 착 붙음
    dampingRelaxation: 2.4,
    dampingCompression: 4.5,
    maxSuspensionForce: 100000,
    rollInfluence: 0.02,
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    chassisConnectionPointLocal: new CANNON.Vec3(1, 0, 1),
    maxSuspensionTravel: 0.28,
    customSlidingRotationalSpeed: -32,
    useCustomSlidingRotationalSpeed: true,
  };

  const WHEEL_X = 0.78, WHEEL_FRONT_Z = 1.5, WHEEL_REAR_Z = -1.45, WHEEL_Y = -0.05;
  const wheelConnections = [
    new CANNON.Vec3(-WHEEL_X, WHEEL_Y,  WHEEL_FRONT_Z), // 0: 앞왼
    new CANNON.Vec3( WHEEL_X, WHEEL_Y,  WHEEL_FRONT_Z), // 1: 앞오
    new CANNON.Vec3(-WHEEL_X, WHEEL_Y,  WHEEL_REAR_Z),  // 2: 뒤왼
    new CANNON.Vec3( WHEEL_X, WHEEL_Y,  WHEEL_REAR_Z),  // 3: 뒤오
  ];
  wheelConnections.forEach(pt => {
    vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: pt });
  });
  vehicle.addToWorld(world);

  const FRONT_WHEELS = [0, 1];
  const REAR_WHEELS  = [2, 3];
  const ALL_WHEELS   = [0, 1, 2, 3];

  // ─── 차체/바퀴 메시 ────────────────────────────────────────
  const chassisGeo = new THREE.BoxGeometry(CHASSIS_HALF.x * 2, CHASSIS_HALF.y * 2, CHASSIS_HALF.z * 2);
  const chassisThreeMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4, metalness: 0.3 });
  const chassisMesh = new THREE.Mesh(chassisGeo, chassisThreeMat);
  chassisMesh.castShadow = true; chassisMesh.receiveShadow = true;
  scene.add(chassisMesh);

  const cabinGeo = new THREE.BoxGeometry(CHASSIS_HALF.x * 1.5, CHASSIS_HALF.y * 1.3, CHASSIS_HALF.z * 1.0);
  const cabinMesh = new THREE.Mesh(cabinGeo, chassisThreeMat);
  cabinMesh.position.set(0, CHASSIS_HALF.y * 1.5, -0.15);
  cabinMesh.castShadow = true;
  chassisMesh.add(cabinMesh);

  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 20);
  wheelGeo.rotateZ(Math.PI / 2); // 실린더 기본 축(Y)을 바퀴 축(X)에 맞춤
  const wheelThreeMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.9 });
  const wheelMeshes = ALL_WHEELS.map(() => {
    const m = new THREE.Mesh(wheelGeo, wheelThreeMat);
    m.castShadow = true;
    scene.add(m);
    return m;
  });

  // ─── 입력 ──────────────────────────────────────────────────
  const keys = {};
  const onKeyDown = e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') resetVehicle();
  };
  const onKeyUp = e => { keys[e.code] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function resetVehicle() {
    chassisBody.position.set(0, 2, 30);
    chassisBody.quaternion.set(0, 0, 0, 1);
    chassisBody.velocity.set(0, 0, 0);
    chassisBody.angularVelocity.set(0, 0, 0);
    ALL_WHEELS.forEach(i => {
      vehicle.setSteeringValue(0, i);
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    });
  }

  // ─── UI ────────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'vehicle-ui';
  ui.style.cssText = `
    position:fixed;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
    background:rgba(0,0,0,.8);border:1px solid #334155;border-radius:10px;
    padding:14px 18px;font-family:"Courier New",monospace;color:#94a3b8;
    pointer-events:none;min-width:280px;
  `;
  ui.innerHTML = `
    <div style="color:#e2e8f0;font-size:14px;font-weight:bold;margin-bottom:6px;">
      🚗 차량 물리 — RaycastVehicle
    </div>
    <div style="color:#475569;font-size:11px;line-height:1.6;margin-bottom:8px;">
      점프대에서 뛰어보고, 드럼통을 들이받아보세요.<br>
      뒤집히면 R로 리셋.
    </div>
    <p style="color:#94a3b8;font-size:12px;line-height:1.9;">
      <span style="color:#e2e8f0">W / S</span> — 가속 / 후진 &nbsp;
      <span style="color:#e2e8f0">A / D</span> — 조향<br>
      <span style="color:#e2e8f0">Space</span> — 브레이크 &nbsp;
      <span style="color:#e2e8f0">R</span> — 리셋
    </p>
    <div style="height:1px;background:#1e293b;margin:8px 0;"></div>
    <p style="color:#64748b;font-size:11px;">
      속도: <span id="veh-speed" style="color:#fbbf24">0</span> km/h
    </p>
  `;
  document.body.appendChild(ui);
  const speedEl = ui.querySelector('#veh-speed');

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;
  let steerValue = 0;
  const _camPos = new THREE.Vector3();
  const _camTarget = new THREE.Vector3();
  const _fwd = new THREE.Vector3();

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);

    // 조향 — 순간 전환이 아니라 목표값으로 부드럽게 보간(아케이드 조작감)
    const steerInput = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
    steerValue += (steerInput * MAX_STEER - steerValue) * STEER_LERP;
    FRONT_WHEELS.forEach(i => vehicle.setSteeringValue(steerValue, i));

    // 가속/후진 — 뒷바퀴굴림(RWD)
    let engineForce = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    engineForce = -MAX_ENGINE_FORCE;
    if (keys['KeyS'] || keys['ArrowDown'])  engineForce =  MAX_ENGINE_FORCE * 0.7;
    REAR_WHEELS.forEach(i => vehicle.applyEngineForce(engineForce, i));

    const braking = keys['Space'] ? MAX_BRAKE_FORCE : 0;
    ALL_WHEELS.forEach(i => vehicle.setBrake(braking, i));

    world.step(1 / 60, delta, 5);

    // 물리 → Three.js 동기화
    chassisMesh.position.copy(chassisBody.position);
    chassisMesh.quaternion.copy(chassisBody.quaternion);
    ALL_WHEELS.forEach(i => {
      vehicle.updateWheelTransform(i);
      const t = vehicle.wheelInfos[i].worldTransform;
      wheelMeshes[i].position.copy(t.position);
      wheelMeshes[i].quaternion.copy(t.quaternion);
    });
    colliders.forEach(({ mesh, body }) => {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    });

    // 3인칭 추격 카메라 — 차체 진행 방향을 그대로 따라감
    _fwd.set(0, 0, 1).applyQuaternion(chassisMesh.quaternion);
    _camPos.copy(chassisMesh.position)
      .addScaledVector(_fwd, 7)
      .add(new THREE.Vector3(0, 3.2, 0));
    camera.position.lerp(_camPos, 0.08);
    _camTarget.copy(chassisMesh.position).add(new THREE.Vector3(0, 0.8, 0));
    camera.lookAt(_camTarget);

    speedEl.textContent = Math.abs(vehicle.currentVehicleSpeedKmHour | 0);

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
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onResize);
    document.body.removeChild(ui);
    renderer.shadowMap.enabled = false;

    vehicle.removeFromWorld(world);
    world.removeBody(chassisBody);
    world.removeBody(floorBody);
    colliders.forEach(({ body }) => { if (body) world.removeBody(body); });

    floorGeo.dispose(); floorThreeMat.dispose();
    chassisGeo.dispose(); cabinGeo.dispose(); chassisThreeMat.dispose();
    wheelGeo.dispose(); wheelThreeMat.dispose();
    colliders.forEach(({ geo, mat }) => { geo.dispose(); mat.dispose(); });

    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
