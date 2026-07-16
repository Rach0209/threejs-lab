// ══════════════════════════════════════════════════════════════
//  레슨 50: 고급 물리 — 캐릭터 컨트롤러 충돌 (cannon-es)
//
//  📌 레슨37에서 캐릭터가 벽·나무를 그냥 통과해버리던 문제,
//     이번엔 진짜 물리 엔진으로 해결합니다!
//
//  레슨37 vs 레슨50:
//    37 — 물리 엔진 없이 직접 계산. y축(바닥 착지)만 처리,
//         옆으로는 벽이든 나무든 뚫고 지나감
//    50 — cannon-es DYNAMIC Body로 캐릭터를 만들어서
//         충돌 반응(벽 밀어내기, 슬라이딩)을 물리 엔진이 대신 계산
//
//  배울 것:
//    - DYNAMIC Body 캐릭터   : mass>0 이지만 fixedRotation으로 안 넘어지게 고정
//    - 진짜 캡슐 콜라이더    : Cylinder + Sphere 2개를 합친 Compound Shape
//    - 벽 슬라이딩           : 별도 로직 없이 물리 엔진의 접촉 솔버가 자동 처리
//                              (각도로 부딪히면 벽을 따라 자연스럽게 미끄러짐)
//    - Raycast 지면 감지     : 매 프레임 아래로 광선을 쏴서 접지 여부 판정
//    - velocity 직접 제어    : 힘(force) 대신 속도(velocity)를 매 프레임 지정해
//                              WASD 조작감을 즉각적으로 만드는 실전 기법
//    - ContactMaterial 튜닝  : 마찰을 낮춰야 벽에 "쩍 붙지" 않고 매끄럽게 슬라이딩
//
//  🎯 실전 활용 예시:
//    - 웹 기반 3D 어드벤처/액션 게임의 진짜 게임형 캐릭터 이동
//    - 건축 워크스루에서 가구·벽에 자연스럽게 막히는 아바타
//    - VR/체험형 콘텐츠의 물리 기반 충돌 캐릭터
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import * as CANNON from 'cannon-es';

const MOVE_SPEED  = 5;
const JUMP_SPEED  = 7;
const CAM_OFFSET  = new THREE.Vector3(0, 4, 8);
const CHAR_RADIUS = 0.35;
const CHAR_HEIGHT = 0.7; // 원기둥 부분 높이 (양 끝 반구 별도)

// 지면 감지 레이캐스트가 캐릭터 자기 자신의 콜라이더에 맞지 않도록
// 충돌 그룹을 분리 (지형/장애물 = GROUP_WORLD, 캐릭터 = GROUP_CHAR)
const GROUP_WORLD = 1;
const GROUP_CHAR  = 2;

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);

  const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.1, 200
  );

  scene.add(new THREE.AmbientLight(0x88aacc, 2));
  const sun = new THREE.DirectionalLight(0xfff5e0, 3);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
  sun.shadow.camera.right = sun.shadow.camera.top = 30;
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFShadowMap;

  // ══════════════════════════════════════════════════════════
  //  물리 세계
  // ══════════════════════════════════════════════════════════
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
  // ⚠ SAPBroadphase는 정적 장애물이 여러 개(특히 회전된 Box) 섞인 씬에서
  // 일부 충돌 쌍을 누락시켜 캐릭터가 벽을 그냥 통과해버리는 버그가 실제로
  // 발생했다(직접 world.step()을 반복 호출해 재현·확인함). 바디 수가 적은
  // (수십 개 이하) 씬에서는 NaiveBroadphase(모든 쌍을 전수 검사)가 더 느리지
  // 않으면서 훨씬 안정적이다 — "최적화보다 정확성"을 먼저 챙길 것
  world.broadphase = new CANNON.NaiveBroadphase();
  world.allowSleep = false; // 캐릭터는 계속 조작되므로 sleep 방지

  const groundMat = new CANNON.Material('ground');
  const wallMat   = new CANNON.Material('wall');
  const charMat   = new CANNON.Material('character');

  // 캐릭터-바닥/벽 마찰은 반드시 정확히 0으로 둔다 (0.01처럼 "거의 0"도 안 됨!).
  // ⚠ 이동을 마찰이 아니라 velocity 직접 지정으로 제어하기 때문에, 벽 쪽으로
  // 방향키를 누른 채 점프하면 솔버가 "벽을 뚫지 않으려고" 매 프레임 큰 법선력을
  // 걸게 되고, 그 법선력 × 마찰계수(친구값)가 벽면의 수직(Y) 접선 방향으로도
  // 작용해서 중력을 완전히 상쇄해버린다 — 벽에 붙은 채 점프하면 안 떨어지고
  // 공중에 붕 뜬 채로 고정되는 버그로 실제 재현됨 (0.01에서도 발생, 0에서만 해결).
  // 정지는 아래 애니메이션 루프의 수동 감쇠(velocity *= 0.85)가 담당하므로
  // 마찰이 그 역할을 대신할 필요가 애초에 없다.
  world.addContactMaterial(new CANNON.ContactMaterial(charMat, groundMat, {
    friction: 0, restitution: 0,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(charMat, wallMat, {
    friction: 0, restitution: 0,
  }));

  // ─── 바닥 ────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(60, 60);
  const floorThreeMat = new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.9 });
  const floor = new THREE.Mesh(floorGeo, floorThreeMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ⚠ CANNON.Plane()(수학적으로 무한한 평면)은 레이캐스트 좌표에 아주 미세한
  // (예: 1e-17 수준) 부동소수점 오차가 섞이면 AABB 겹침 판정을 놓쳐서 레이가
  // 항상 빗나가는 정밀도 버그가 있었다(직접 재현·확인함). 캐릭터가 바닥에
  // 안착한 뒤 y가 정확히 0이 아니라 -0.00004 같은 미세한 값으로 떠는 건
  // 물리 엔진에서 지극히 정상인데, 그 상태에서 접지 판정이 항상 실패해버림.
  // 화면상 바닥도 60×60 유한 크기이니 얇은 Box로 바꾸면 버그도 피하고 더 정확함
  const floorBody = new CANNON.Body({
    mass: 0, material: groundMat,
    shape: new CANNON.Box(new CANNON.Vec3(30, 0.1, 30)),
  });
  floorBody.position.set(0, -0.1, 0);
  world.addBody(floorBody);

  // ─── 벽 / 나무 장애물 (충돌 콜라이더 포함) ───────────────
  //  Three.js 메시와 cannon 콜라이더를 쌍으로 관리
  const colliders = []; // { mesh, geo[], mat[] } cleanup용

  function addWall(x, z, w, d, h = 2, rotY = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
      mass: 0, material: wallMat,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    });
    body.position.set(x, h / 2, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotY);
    world.addBody(body);

    colliders.push({ mesh, geo, mat, body });
  }

  function addTree(x, z) {
    // 몸통(트렁크)만 충돌 처리 — 나뭇잎은 장식용, 통과 가능하게 둠
    // (게임에서 흔한 최적화: 밀도 낮은 잎사귀까지 충돌시키면 답답함)
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.3, 2.2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1.1, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const leafGeo = new THREE.ConeGeometry(1.1, 2.4, 8);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.9 });
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x, 3.0, z);
    leaf.castShadow = true;
    scene.add(leaf);

    // cannon-es의 Cylinder는 Three.js CylinderGeometry와 동일하게
    // 처음부터 Y축 방향으로 정렬돼 있어 별도 회전 보정이 필요 없음
    // (오래된 cannon.js 튜토리얼들은 Z축 기준이라 회전 보정 코드가 있는데,
    //  cannon-es는 이미 Y축으로 수정된 버전이므로 그대로 쓰면 됨)
    const trunkBody = new CANNON.Body({
      mass: 0, material: wallMat,
      shape: new CANNON.Cylinder(0.3, 0.35, 2.2, 8),
    });
    trunkBody.position.set(x, 1.1, z);
    world.addBody(trunkBody);

    colliders.push({ mesh: trunk, geo: trunkGeo, mat: trunkMat, body: trunkBody });
    colliders.push({ mesh: leaf, geo: leafGeo, mat: leafMat, body: null });
  }

  // 바깥 경계 벽 4개
  addWall(0, -22, 44, 1, 3);
  addWall(0, 22, 44, 1, 3);
  addWall(-22, 0, 1, 44, 3);
  addWall(22, 0, 1, 44, 3);

  // 지그재그 내부 벽 — 비스듬히 부딪혀서 슬라이딩을 체감할 수 있도록 배치
  addWall(-6, -4, 8, 1, 2.2, Math.PI * 0.15);
  addWall(5, 2, 9, 1, 2.2, -Math.PI * 0.12);
  addWall(-3, 10, 7, 1, 2.2, Math.PI * 0.22);

  // 나무 군락
  [[8, -10], [10, -7], [-9, 6], [-11, 9], [-8, -12], [12, 8]].forEach(([x, z]) => addTree(x, z));

  // ══════════════════════════════════════════════════════════
  //  캐릭터 — DYNAMIC Body + 진짜 캡슐(Cylinder+Sphere×2) 콜라이더
  // ══════════════════════════════════════════════════════════
  const charGroup = new THREE.Group();
  scene.add(charGroup);

  const bodyGeo = new THREE.CapsuleGeometry(CHAR_RADIUS, CHAR_HEIGHT, 4, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.5 });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = CHAR_HEIGHT / 2 + CHAR_RADIUS;
  bodyMesh.castShadow = true;
  charGroup.add(bodyMesh);

  const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.5 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = CHAR_HEIGHT + CHAR_RADIUS * 2 + 0.15;
  head.castShadow = true;
  charGroup.add(head);

  // ─── 캡슐 물리 콜라이더 ────────────────────────────────────
  //  캡슐 = 원기둥(몸통) + 반구 2개(위/아래 끝) 를 합친 Compound Shape.
  //  cannon-es에는 "Capsule"이라는 전용 shape가 없어서 직접 조립한다.
  //  addShape(shape, offset)로 여러 shape를 하나의 Body에 붙일 수 있음.
  const charBody = new CANNON.Body({
    mass: 5,
    material: charMat,
    // linearDamping은 x/y/z 속도 전체에 걸리므로 너무 크게 잡으면 점프 궤적(y)까지
    // 둔해진다. 여기선 낮게(0.1)만 주고, 좌우 감속은 아래 애니메이션 루프에서
    // x/z만 따로 감쇠시켜 "멈출 때만 빠르게, 점프는 자연스럽게" 를 동시에 달성
    linearDamping: 0.1,
    fixedRotation: true,  // ⚠ 핵심: 회전을 고정해 캐릭터가 넘어지지 않게 함
    angularDamping: 1.0,  // fixedRotation과 함께 회전 관성도 완전히 죽임
    collisionFilterGroup: GROUP_CHAR,
    // mask는 기본값(-1=전체)을 유지 → 지형/벽과의 실제 물리 충돌은 그대로 발생.
    // 그룹만 분리해서 "레이캐스트가 나 자신을 맞히는" 것만 걸러낸다
  });
  charBody.addShape(
    new CANNON.Cylinder(CHAR_RADIUS, CHAR_RADIUS, CHAR_HEIGHT, 8),
    new CANNON.Vec3(0, CHAR_HEIGHT / 2 + CHAR_RADIUS, 0)
  );
  charBody.addShape(new CANNON.Sphere(CHAR_RADIUS), new CANNON.Vec3(0, CHAR_RADIUS, 0));
  charBody.addShape(new CANNON.Sphere(CHAR_RADIUS), new CANNON.Vec3(0, CHAR_HEIGHT + CHAR_RADIUS, 0));
  charBody.position.set(0, 3, 0);
  world.addBody(charBody);

  // ─── 상태 ──────────────────────────────────────────────────
  const keys = {};
  let onGround = false;
  let camYaw = 0;

  // 지면 감지용 광선 — charBody.position은 캡슐 맨 아래(발끝) 기준점이라
  // 여기서 바로 아래로 쏘면 레이 시작점이 지면과 거의 겹쳐서(부동소수점
  // 오차로) 맞았다/안맞았다가 프레임마다 뒤집히는 깜빡임이 생긴다.
  // → 발끝보다 확실히 위(캡슐 중간 높이)에서 시작해서 발끝 살짝 아래까지 쏜다
  const GROUND_RAY_TOP = CHAR_RADIUS + CHAR_HEIGHT / 2; // 캡슐 중간 높이
  const rayFrom = new CANNON.Vec3();
  const rayTo   = new CANNON.Vec3();
  const rayResult = new CANNON.RaycastResult();

  function checkGround() {
    rayFrom.set(charBody.position.x, charBody.position.y + GROUND_RAY_TOP, charBody.position.z);
    rayTo.set(charBody.position.x, charBody.position.y - 0.05, charBody.position.z);
    rayResult.reset();
    // collisionFilterMask: GROUP_WORLD → 캐릭터 자기 자신(GROUP_CHAR)은 제외하고
    // 지형/벽만 검사 (레이 시작점이 자기 캡슐 내부에 있어도 자기 자신에 안 맞음)
    world.raycastClosest(rayFrom, rayTo, { collisionFilterMask: GROUP_WORLD }, rayResult);
    return rayResult.hasHit;
  }

  // ─── 입력 ──────────────────────────────────────────────────
  function onKey(e, down) {
    keys[e.code] = down;
    if (down && e.code === 'Space' && onGround) {
      charBody.velocity.y = JUMP_SPEED;
      e.preventDefault();
    }
  }
  const onKeyDown = e => onKey(e, true);
  const onKeyUp   = e => onKey(e, false);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let isDragging = false, lastX = 0;
  const onMouseDown = e => { isDragging = true; lastX = e.clientX; };
  const onMouseUp   = () => { isDragging = false; };
  const onMouseMove = e => {
    if (!isDragging) return;
    camYaw -= (e.clientX - lastX) * 0.005;
    lastX = e.clientX;
  };
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);

  // ─── UI ────────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'phys-char-ui';
  ui.style.cssText = `
    position:fixed;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
    background:rgba(0,0,0,.8);border:1px solid #334155;border-radius:10px;
    padding:14px 18px;font-family:"Courier New",monospace;color:#94a3b8;
    pointer-events:none;min-width:280px;
  `;
  ui.innerHTML = `
    <div style="color:#e2e8f0;font-size:14px;font-weight:bold;margin-bottom:6px;">
      🧱 물리 기반 캐릭터 컨트롤러
    </div>
    <div style="color:#475569;font-size:11px;line-height:1.6;margin-bottom:8px;">
      벽/나무에 비스듬히 부딪혀보세요 — 뚫지 않고<br>
      표면을 따라 자연스럽게 미끄러집니다 (37번과 비교!)
    </div>
    <p style="color:#94a3b8;font-size:12px;line-height:1.9;">
      <span style="color:#e2e8f0">WASD</span> — 이동 &nbsp;
      <span style="color:#e2e8f0">Space</span> — 점프<br>
      <span style="color:#e2e8f0">마우스 드래그</span> — 카메라 회전
    </p>
    <div style="height:1px;background:#1e293b;margin:8px 0;"></div>
    <p style="color:#64748b;font-size:11px;">
      상태: <span id="pc-state" style="color:#fbbf24">공중</span>
    </p>
  `;
  document.body.appendChild(ui);

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;
  const _forward = new THREE.Vector3();
  const _right   = new THREE.Vector3();
  const _move    = new THREE.Vector3();
  const _camPos  = new THREE.Vector3();
  const camTarget = new THREE.Vector3();

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();

    onGround = checkGround();

    // 이동 방향 (카메라 yaw 기준) — 레슨37과 동일한 방식
    _forward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
    _right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    _move.set(0, 0, 0);
    if (keys['KeyW'] || keys['ArrowUp'])    _move.addScaledVector(_forward, -1);
    if (keys['KeyS'] || keys['ArrowDown'])  _move.addScaledVector(_forward,  1);
    if (keys['KeyA'] || keys['ArrowLeft'])  _move.addScaledVector(_right,   -1);
    if (keys['KeyD'] || keys['ArrowRight']) _move.addScaledVector(_right,    1);

    if (_move.lengthSq() > 0) {
      _move.normalize();
      // ⚠ 힘(applyForce)이 아니라 속도(velocity)를 직접 지정한다.
      // 힘을 쓰면 가속/감속이 느껴서 조작감이 둔해지고, 질량에 따라 튜닝도 번거로움.
      // velocity를 매 프레임 덮어쓰면 즉각적인 게임형 조작감이 나옴
      // (y velocity는 중력·점프를 위해 건드리지 않고 그대로 둠)
      charBody.velocity.x = _move.x * MOVE_SPEED;
      charBody.velocity.z = _move.z * MOVE_SPEED;
      charGroup.rotation.y = Math.atan2(_move.x, _move.z) + Math.PI;
    } else {
      // 입력이 없으면 수평 속도를 직접 감쇠 (linearDamping은 y축 낙하 속도까지
      // 늦춰버려 점프 궤적이 둔해지므로, x/z만 별도로 감속시킴)
      charBody.velocity.x *= 0.85;
      charBody.velocity.z *= 0.85;
    }

    world.step(1 / 60, delta, 3);

    // 물리 결과 → Three.js 동기화 (fixedRotation이라 회전은 복사 안 함)
    charGroup.position.copy(charBody.position);

    // 걷는 느낌
    if (_move.lengthSq() > 0 && onGround) {
      bodyMesh.rotation.z = Math.sin(t * 10) * 0.08;
    } else {
      bodyMesh.rotation.z *= 0.8;
    }

    // 낙사 리스폰
    if (charBody.position.y < -8) {
      charBody.position.set(0, 3, 0);
      charBody.velocity.set(0, 0, 0);
    }

    // 3인칭 카메라
    _camPos.copy(charGroup.position).add(
      CAM_OFFSET.clone().applyEuler(new THREE.Euler(0, camYaw, 0))
    );
    camera.position.lerp(_camPos, 0.1);
    camTarget.copy(charGroup.position).add(new THREE.Vector3(0, 1, 0));
    camera.lookAt(camTarget);

    document.getElementById('pc-state').textContent = onGround ? '지상' : '공중';

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
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', onResize);
    document.body.removeChild(ui);
    renderer.shadowMap.enabled = false;

    world.removeBody(charBody);
    world.removeBody(floorBody);
    colliders.forEach(({ body }) => { if (body) world.removeBody(body); });

    floorGeo.dispose(); floorThreeMat.dispose();
    bodyGeo.dispose(); bodyMat.dispose();
    headGeo.dispose(); headMat.dispose();
    colliders.forEach(({ geo, mat }) => { geo.dispose(); mat.dispose(); });

    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
