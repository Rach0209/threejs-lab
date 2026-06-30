// ══════════════════════════════════════════════════════════════
//  Module 38: Character Controller / 캐릭터 컨트롤러
//
//  배울 것:
//    - WASD 이동      : 키 입력 → velocity 누적 → 위치 업데이트
//    - 점프           : Y velocity에 impulse 추가 → 중력으로 감소
//    - 중력           : 매 프레임 Y velocity -= gravity * delta
//    - 지형 충돌      : Y가 바닥 아래로 내려가면 보정 + velocity=0
//    - 카메라 추적    : lerp로 부드럽게 캐릭터 따라다님
//    - 3인칭 카메라   : 캐릭터 뒤 + 위에서 바라봄
//
//  물리 없이 직접 구현하는 방식:
//    cannon-es 없이 직접 중력·충돌을 계산
//    간단한 게임에는 이 방식이 더 가볍고 제어하기 쉬움
//    복잡한 지형·충돌이 필요하면 물리 엔진 사용 (레슨 09 참고)
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';

const GRAVITY    = -20;
const JUMP_FORCE =  10;
const MOVE_SPEED =  6;
const CAM_OFFSET = new THREE.Vector3(0, 4, 8);

export function init(renderer) {
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.01);

  const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.1, 200
  );

  // 조명
  scene.add(new THREE.AmbientLight(0x88aacc, 2));
  const sun = new THREE.DirectionalLight(0xfff5e0, 3);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
  sun.shadow.camera.right = sun.shadow.camera.top = 40;
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

  // ─── 지형 ──────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(80, 80, 1, 1);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x   = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 플랫폼들
  const platMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.7 });
  const platforms = [];
  [
    [5, 1, -5, 4, 0.5, 4],
    [-6, 2, -8, 3, 0.5, 3],
    [8, 3, -12, 3, 0.5, 4],
    [-4, 4, -16, 5, 0.5, 3],
    [0, 5.5, -22, 4, 0.5, 4],
  ].forEach(([x, y, z, w, h, d]) => {
    const geo  = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, platMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    platforms.push({ mesh, min: new THREE.Vector3(x-w/2, y, z-d/2), max: new THREE.Vector3(x+w/2, y+h/2, z+d/2) });
  });

  // 장식 오브젝트
  [[3,0,3],[-3,0,-2],[6,0,-2]].forEach(([x,,z]) => {
    const geo  = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 6);
    const mat  = new THREE.MeshStandardMaterial({ color: 0x5c3d1e });
    const tree = new THREE.Mesh(geo, mat);
    tree.position.set(x, 0.75, z);
    tree.castShadow = true;
    scene.add(tree);
    const lGeo  = new THREE.ConeGeometry(0.6, 1.8, 7);
    const lMat  = new THREE.MeshStandardMaterial({ color: 0x2d5a1e });
    const leaf  = new THREE.Mesh(lGeo, lMat);
    leaf.position.set(x, 2.4, z);
    leaf.castShadow = true;
    scene.add(leaf);
  });

  // ─── 캐릭터 ────────────────────────────────────────────────
  const charGroup = new THREE.Group();
  scene.add(charGroup);

  // 몸통
  const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.7, 4, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.5 });
  const body    = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.7;
  body.castShadow = true;
  charGroup.add(body);

  // 머리
  const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.5 });
  const head    = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.55;
  head.castShadow = true;
  charGroup.add(head);

  // 눈 (방향 표시)
  const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  [-0.1, 0.1].forEach(x => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 1.58, -0.22);
    charGroup.add(eye);
  });

  charGroup.position.set(0, 0, 0);

  // ─── 상태 ──────────────────────────────────────────────────
  const velocity = new THREE.Vector3();
  const keys     = {};
  let   onGround = false;
  let   groundY  = 0;

  // ─── 카메라 ────────────────────────────────────────────────
  const camTarget = new THREE.Vector3();
  let   camYaw    = 0; // 좌우 회전

  // ─── 키 입력 ───────────────────────────────────────────────
  function onKey(e, down) {
    keys[e.code] = down;
    if (down && e.code === 'Space' && onGround) {
      velocity.y = JUMP_FORCE;
      onGround = false;
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup',   e => onKey(e, false));

  // 마우스 드래그로 카메라 회전
  let isDragging = false, lastX = 0;
  renderer.domElement.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; });
  window.addEventListener('mouseup',   () => { isDragging = false; });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    camYaw -= (e.clientX - lastX) * 0.005;
    lastX = e.clientX;
  });

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'char-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:none;">
      <p><strong>Character Controller</strong></p>
      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#94a3b8;font-size:12px;line-height:2;">
        <span style="color:#e2e8f0">WASD</span> — 이동<br>
        <span style="color:#e2e8f0">Space</span> — 점프<br>
        <span style="color:#e2e8f0">마우스 드래그</span> — 카메라 회전<br>
      </p>
      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">높이: <span id="char-y" style="color:#34d399">0.0</span>m</p>
      <p style="color:#64748b;font-size:11px">상태: <span id="char-state" style="color:#fbbf24">지상</span></p>
    </div>
  `;
  document.body.appendChild(ui);

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;
  const _forward = new THREE.Vector3();
  const _right   = new THREE.Vector3();
  const _move    = new THREE.Vector3();
  const _camPos  = new THREE.Vector3();

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);
    const t     = timer.getElapsed();

    // 이동 방향 (카메라 yaw 기준)
    _forward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
    _right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    _move.set(0, 0, 0);

    if (keys['KeyW'] || keys['ArrowUp'])    _move.addScaledVector(_forward, -1);
    if (keys['KeyS'] || keys['ArrowDown'])  _move.addScaledVector(_forward,  1);
    if (keys['KeyA'] || keys['ArrowLeft'])  _move.addScaledVector(_right,   -1);
    if (keys['KeyD'] || keys['ArrowRight']) _move.addScaledVector(_right,    1);

    if (_move.lengthSq() > 0) {
      _move.normalize();
      velocity.x = _move.x * MOVE_SPEED;
      velocity.z = _move.z * MOVE_SPEED;
      // 캐릭터 회전
      charGroup.rotation.y = Math.atan2(_move.x, _move.z) + Math.PI;
    } else {
      velocity.x *= 0.8;
      velocity.z *= 0.8;
    }

    // 중력
    if (!onGround) velocity.y += GRAVITY * delta;

    // 위치 업데이트
    charGroup.position.x += velocity.x * delta;
    charGroup.position.y += velocity.y * delta;
    charGroup.position.z += velocity.z * delta;

    // 지면 충돌 (기본 바닥 y=0)
    groundY = 0;

    // 플랫폼 충돌
    const px = charGroup.position.x;
    const pz = charGroup.position.z;
    platforms.forEach(({ mesh, min, max }) => {
      if (px > min.x && px < max.x && pz > min.z && pz < max.z) {
        const top = max.y;
        if (charGroup.position.y <= top + 0.05 && charGroup.position.y >= top - 0.5) {
          groundY = Math.max(groundY, top);
        }
      }
    });

    if (charGroup.position.y <= groundY) {
      charGroup.position.y = groundY;
      velocity.y = 0;
      onGround = true;
    } else {
      onGround = charGroup.position.y <= groundY + 0.05;
    }

    // 맵 경계
    charGroup.position.x = Math.max(-38, Math.min(38, charGroup.position.x));
    charGroup.position.z = Math.max(-38, Math.min(38, charGroup.position.z));

    // 낙사 처리
    if (charGroup.position.y < -5) {
      charGroup.position.set(0, 0, 0);
      velocity.set(0, 0, 0);
    }

    // 캐릭터 다리 흔들림 (걷는 느낌)
    if (_move.lengthSq() > 0 && onGround) {
      body.rotation.z = Math.sin(t * 10) * 0.08;
    } else {
      body.rotation.z *= 0.8;
    }

    // 3인칭 카메라
    _camPos.copy(charGroup.position).add(
      CAM_OFFSET.clone().applyEuler(new THREE.Euler(0, camYaw, 0))
    );
    camera.position.lerp(_camPos, 0.1);
    camTarget.copy(charGroup.position).add(new THREE.Vector3(0, 1, 0));
    camera.lookAt(camTarget);

    // UI 업데이트
    document.getElementById('char-y').textContent = charGroup.position.y.toFixed(1);
    document.getElementById('char-state').textContent = onGround ? '지상' : '공중';

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
    window.removeEventListener('keydown', e => onKey(e, true));
    window.removeEventListener('keyup',   e => onKey(e, false));
    window.removeEventListener('resize', onResize);
    document.body.removeChild(ui);
    renderer.shadowMap.enabled = false;
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
