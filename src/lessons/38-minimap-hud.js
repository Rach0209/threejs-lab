// ══════════════════════════════════════════════════════════════
//  레슨 38: 미니맵 / HUD
//
//  배울 것:
//    - OrthographicCamera  : 위에서 내려다보는 직교 투영 카메라
//    - Viewport + Scissor  : 같은 캔버스에 두 번 렌더해 미니맵 그리기
//    - HUD (DOM 오버레이)  : 좌표·나침반·FPS 를 CSS로 표시
//    - 미니맵 마커         : 씬 오브젝트로 캐릭터 방향 아이콘 구현
//    - 목표 달성 시스템    : 거리 체크로 인터랙션 구현
//
//  핵심 기법 — setViewport + setScissor:
//    renderer.setViewport(x, y, w, h)   → 렌더 영역 지정
//    renderer.setScissor(x, y, w, h)    → 클리핑 영역 지정 (밖 픽셀 보호)
//    renderer.setScissorTest(true/false) → 클리핑 ON/OFF
//    render() 를 두 번 호출해 메인 뷰 + 미니맵을 같은 캔버스에 그린다
//
//  OrthographicCamera(left, right, top, bottom, near, far):
//    원근 왜곡 없이 평행 투영 → 전략 게임 맵, 미니맵에 적합
//    PerspectiveCamera 와 달리 fov 대신 뷰 범위(±units)로 설정
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';

const GRAVITY    = -20;
const JUMP_FORCE =  10;
const MOVE_SPEED =  7;
const CAM_OFFSET = new THREE.Vector3(0, 5, 10);
const MAP_PX     = 180;  // 미니맵 CSS 크기 (px)

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  // ─── 메인 카메라 (원근 투영) ───────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.1, 200
  );

  // ─── 미니맵 카메라 (직교 투영) ────────────────────────────
  //  직교 투영은 거리에 관계없이 크기가 같음 → 지도 표현에 최적
  //  뷰 범위 ±MAP_VIEW 단위를 한 눈에 봄
  const MAP_VIEW = 25;
  const minimapCam = new THREE.OrthographicCamera(
    -MAP_VIEW, MAP_VIEW, MAP_VIEW, -MAP_VIEW, 1, 200
  );
  minimapCam.position.set(0, 80, 0);
  minimapCam.lookAt(0, 0, 0);
  // up 벡터를 -Z로 설정 → 미니맵에서 위쪽 = 북쪽(-Z방향)
  minimapCam.up.set(0, 0, -1);

  // ─── 조명 ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x88aacc, 2));
  const sun = new THREE.DirectionalLight(0xfff5e0, 3);
  sun.position.set(20, 40, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left   = sun.shadow.camera.bottom = -50;
  sun.shadow.camera.right  = sun.shadow.camera.top    = 50;
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFShadowMap;

  // ─── 지형: 체크무늬 캔버스 텍스처 ────────────────────────
  //  체크무늬 → 이동할 때 속도감이 시각적으로 잘 느껴짐
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 128;
  const cx = cvs.getContext('2d');
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      cx.fillStyle = (i + j) % 2 === 0 ? '#3d7a2a' : '#336622';
      cx.fillRect(i * 16, j * 16, 16, 16);
    }
  }
  const floorTex = new THREE.CanvasTexture(cvs);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(12, 12);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })
  );
  floor.rotation.x   = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ─── 건물(장애물) ─────────────────────────────────────────
  //  다양한 색상 → 미니맵에서 구분 가능, 실제 게임의 빌딩 역할
  const buildingConfigs = [
    { pos: [10, -8],   size: [4, 7, 4],  color: 0x3b82f6 },
    { pos: [-12, -5],  size: [5, 5, 3],  color: 0xa855f7 },
    { pos: [5,  10],   size: [3, 9, 3],  color: 0x10b981 },
    { pos: [-8, 12],   size: [6, 4, 4],  color: 0xf59e0b },
    { pos: [15,  5],   size: [3, 6, 6],  color: 0x06b6d4 },
    { pos: [-15,-12],  size: [4, 8, 4],  color: 0xf97316 },
    { pos: [0,  -15],  size: [8, 3, 3],  color: 0x6366f1 },
    { pos: [12, -18],  size: [3, 6, 3],  color: 0xec4899 },
    { pos: [-5,  -20], size: [5, 5, 5],  color: 0x84cc16 },
    { pos: [20,  -10], size: [3, 4, 5],  color: 0xfbbf24 },
  ];

  buildingConfigs.forEach(({ pos, size, color }) => {
    const [x, z] = pos;
    const [w, h, d] = size;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
    );
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // ─── 목표 지점: 빨간 기둥 ─────────────────────────────────
  //  미니맵에서 빨간 점으로 보임 → 위치 파악 후 찾아가는 목표
  const GOAL_POSITIONS = [
    [18, -18], [-18, -18], [18, 18], [-18, 18], [0, -22]
  ];
  const goals = GOAL_POSITIONS.map(([x, z]) => {
    const group = new THREE.Group();
    // 기둥
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 9, 8),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x661111 })
    );
    pole.position.y = 4.5;
    group.add(pole);
    // 꼭대기 깃발
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.9, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x880000 })
    );
    flag.position.set(0.7, 9.3, 0);
    group.add(flag);
    group.position.set(x, 0, z);
    group.castShadow = true;
    scene.add(group);
    return { x, z, reached: false, group };
  });

  // ─── 캐릭터 ───────────────────────────────────────────────
  const charGroup = new THREE.Group();
  scene.add(charGroup);

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.8, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.5 })
  );
  body.position.y = 0.75;
  body.castShadow = true;
  charGroup.add(body);

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.4 })
  );
  headMesh.position.y = 1.7;
  headMesh.castShadow = true;
  charGroup.add(headMesh);

  // 눈 (앞 방향 표시)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  [-0.12, 0.12].forEach(ox => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ox, 1.72, -0.26);
    charGroup.add(eye);
  });

  // ─── 미니맵 마커: 방향 화살표 ────────────────────────────
  //  삼각 콘을 캐릭터 위에 눕혀서 방향을 표시
  //  일반 카메라(낮은 시점)에서는 거의 안 보이고
  //  미니맵 카메라(위에서)에서 선명하게 보임
  const arrowMarker = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 1.5, 3),
    new THREE.MeshBasicMaterial({ color: 0xffff00 })
  );
  arrowMarker.position.y = 3.8;     // 머리 위 높이
  arrowMarker.rotation.x = Math.PI / 2;  // 콘을 눕혀 앞을 가리키게
  charGroup.add(arrowMarker);  // charGroup에 붙어서 캐릭터와 같이 회전

  // ─── 상태 ─────────────────────────────────────────────────
  const velocity = new THREE.Vector3();
  const keys     = {};
  let onGround   = false;
  let camYaw     = 0;     // 카메라 좌우 회전각 (라디안)
  let followMode = true;  // true: 캐릭터 추적, false: 전체 맵
  let goalsReached = 0;

  const _forward = new THREE.Vector3();
  const _right   = new THREE.Vector3();
  const _move    = new THREE.Vector3();
  const _camPos  = new THREE.Vector3();

  // ─── 키 이벤트 ────────────────────────────────────────────
  function onKeyDown(e) {
    keys[e.code] = true;
    if (e.code === 'Space' && onGround) {
      velocity.y = JUMP_FORCE;
      onGround   = false;
      e.preventDefault();
    }
    // M키: 미니맵 추적 모드 전환
    if (e.code === 'KeyM') followMode = !followMode;
  }
  function onKeyUp(e) { keys[e.code] = false; }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  // 마우스 드래그 → 카메라 좌우 회전
  let dragging = false, lastMouseX = 0;
  const onMouseDown = e => { dragging = true;  lastMouseX = e.clientX; };
  const onMouseUp   = ()  => { dragging = false; };
  const onMouseMove = e  => {
    if (!dragging) return;
    camYaw -= (e.clientX - lastMouseX) * 0.005;
    lastMouseX = e.clientX;
  };
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup',   onMouseUp);
  window.addEventListener('mousemove', onMouseMove);

  // ─── HUD DOM 생성 ─────────────────────────────────────────
  const hud = document.createElement('div');
  hud.id = 'hud-38';
  hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:"Courier New",monospace;';
  hud.innerHTML = `
    <!-- 조작 안내 -->
    <div style="
      position:absolute;left:var(--panel-left, 280px);top:16px;
      transition:left .25s ease;
      background:rgba(0,0,0,.6);border:1px solid #334155;
      border-radius:8px;padding:10px 14px;
      color:#94a3b8;font-size:12px;line-height:1.9;
    ">
      <div style="color:#e2e8f0;font-weight:bold;margin-bottom:4px">미니맵 / HUD</div>
      <span style="color:#e2e8f0">WASD</span> — 이동<br>
      <span style="color:#e2e8f0">Space</span> — 점프<br>
      <span style="color:#e2e8f0">마우스 드래그</span> — 카메라 회전<br>
      <span style="color:#fbbf24">M</span> — 미니맵 모드 전환<br>
      <span style="color:#ef4444">빨간 기둥</span>에 가까이 가면 목표 달성
    </div>

    <!-- 상단 중앙: 나침반 -->
    <div style="
      position:absolute;top:16px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,.6);border:1px solid #334155;
      border-radius:50%;width:84px;height:84px;
      display:flex;align-items:center;justify-content:center;
    ">
      <div style="position:relative;width:68px;height:68px;
                  border-radius:50%;border:2px solid #475569;">
        <span style="position:absolute;top:2px;left:50%;transform:translateX(-50%);
                     color:#ef4444;font-size:11px;font-weight:bold;">N</span>
        <span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);
                     color:#64748b;font-size:10px;">S</span>
        <span style="position:absolute;left:3px;top:50%;transform:translateY(-50%);
                     color:#64748b;font-size:10px;">W</span>
        <span style="position:absolute;right:3px;top:50%;transform:translateY(-50%);
                     color:#64748b;font-size:10px;">E</span>
        <!-- 나침반 바늘: 빨간 쪽이 플레이어가 바라보는 방향 -->
        <div id="compass-needle" style="
          position:absolute;top:50%;left:50%;
          width:3px;height:26px;
          background:linear-gradient(to bottom,#ef4444 50%,#475569 50%);
          transform-origin:50% 100%;
          transform:translateX(-50%) translateY(-100%) rotate(0deg);
          border-radius:2px 2px 0 0;
        "></div>
      </div>
    </div>

    <!-- 우측 상단: FPS + 목표 카운트 -->
    <div style="
      position:absolute;right:${MAP_PX + 16}px;top:16px;
      background:rgba(0,0,0,.6);border:1px solid #334155;
      border-radius:8px;padding:10px 14px;
      color:#94a3b8;font-size:13px;line-height:1.9;
    ">
      FPS <span id="hud-fps" style="color:#34d399;min-width:28px;display:inline-block">--</span><br>
      목표 <span id="hud-goals" style="color:#fbbf24">0</span> / ${GOAL_POSITIONS.length}
    </div>

    <!-- 좌측 하단: XYZ 좌표 -->
    <div style="
      position:absolute;left:var(--panel-left, 280px);bottom:16px;
      transition:left .25s ease;
      background:rgba(0,0,0,.6);border:1px solid #334155;
      border-radius:8px;padding:10px 14px;
      color:#94a3b8;font-size:13px;line-height:1.9;
    ">
      <div style="color:#e2e8f0;font-weight:bold;margin-bottom:4px">위치</div>
      X <span id="hud-x" style="color:#34d399;min-width:44px;display:inline-block"> 0.0</span><br>
      Z <span id="hud-z" style="color:#34d399;min-width:44px;display:inline-block"> 0.0</span><br>
      Y <span id="hud-y" style="color:#fbbf24;min-width:44px;display:inline-block"> 0.0</span>
    </div>

    <!-- 미니맵 테두리 + 레이블 (Three.js 뷰포트 위에 CSS만) -->
    <div style="
      position:absolute;right:0;bottom:0;
      width:${MAP_PX}px;height:${MAP_PX}px;
      border-top:2px solid #334155;border-left:2px solid #334155;
      border-radius:8px 0 0 0;box-sizing:border-box;
    ">
      <div id="hud-map-label" style="
        position:absolute;top:6px;left:8px;
        color:#94a3b8;font-size:11px;font-weight:bold;
        text-shadow:0 0 6px #000,0 0 2px #000;
      ">미니맵 [M]</div>
    </div>
  `;
  document.body.appendChild(hud);

  const hudX      = document.getElementById('hud-x');
  const hudY      = document.getElementById('hud-y');
  const hudZ      = document.getElementById('hud-z');
  const hudFps    = document.getElementById('hud-fps');
  const hudGoals  = document.getElementById('hud-goals');
  const hudLabel  = document.getElementById('hud-map-label');
  const needle    = document.getElementById('compass-needle');

  // ─── 나침반 각도 계산 ─────────────────────────────────────
  //  camYaw=0 → 캐릭터가 -Z(북쪽)를 바라봄 → 바늘 0°(위)
  //  마우스 오른쪽 드래그 → camYaw 감소 → 동쪽을 바라봄 → 바늘 90°(오른쪽)
  //  CSS 회전: -camYaw * (180/π) 도
  function updateCompass() {
    const deg = -camYaw * (180 / Math.PI);
    needle.style.transform = `translateX(-50%) translateY(-100%) rotate(${deg}deg)`;
  }

  // ─── FPS 카운터 ───────────────────────────────────────────
  let fpsFrames = 0, fpsDelta = 0;

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);

    // FPS 집계 (0.5초마다 갱신)
    fpsFrames++;
    fpsDelta += delta;
    if (fpsDelta >= 0.5) {
      hudFps.textContent = Math.round(fpsFrames / fpsDelta);
      fpsFrames = 0; fpsDelta = 0;
    }

    // ─── 캐릭터 이동 ────────────────────────────────────────
    // camYaw 기준 전·후·좌·우 방향 벡터 계산
    _forward.set(Math.sin(camYaw), 0, Math.cos(camYaw));
    _right.set(Math.cos(camYaw),   0, -Math.sin(camYaw));
    _move.set(0, 0, 0);

    if (keys['KeyW'] || keys['ArrowUp'])    _move.addScaledVector(_forward, -1);
    if (keys['KeyS'] || keys['ArrowDown'])  _move.addScaledVector(_forward,  1);
    if (keys['KeyA'] || keys['ArrowLeft'])  _move.addScaledVector(_right,   -1);
    if (keys['KeyD'] || keys['ArrowRight']) _move.addScaledVector(_right,    1);

    if (_move.lengthSq() > 0) {
      _move.normalize();
      velocity.x = _move.x * MOVE_SPEED;
      velocity.z = _move.z * MOVE_SPEED;
      // 이동 방향으로 캐릭터 회전 (미니맵 화살표도 같이 회전됨)
      charGroup.rotation.y = Math.atan2(_move.x, _move.z) + Math.PI;
    } else {
      velocity.x *= 0.8;
      velocity.z *= 0.8;
    }

    // 중력
    if (!onGround) velocity.y += GRAVITY * delta;

    charGroup.position.x += velocity.x * delta;
    charGroup.position.y += velocity.y * delta;
    charGroup.position.z += velocity.z * delta;

    // 지면 충돌
    if (charGroup.position.y <= 0) {
      charGroup.position.y = 0;
      velocity.y = 0;
      onGround   = true;
    } else {
      onGround = false;
    }

    // 맵 경계 클램프
    charGroup.position.x = Math.max(-38, Math.min(38, charGroup.position.x));
    charGroup.position.z = Math.max(-38, Math.min(38, charGroup.position.z));

    // 목표 달성 체크 (거리 2.5 이내)
    goals.forEach(goal => {
      if (goal.reached) return;
      const dx = charGroup.position.x - goal.x;
      const dz = charGroup.position.z - goal.z;
      if (dx * dx + dz * dz < 6.25) {
        goal.reached = true;
        goalsReached++;
        hudGoals.textContent = goalsReached;
        // 달성한 목표 기둥을 초록색으로 변경
        goal.group.traverse(c => {
          if (c.isMesh && c.material.color) {
            c.material = c.material.clone();
            c.material.color.set(0x00ff88);
            c.material.emissive.set(0x006633);
          }
        });
      }
    });

    // ─── 3인칭 카메라 ───────────────────────────────────────
    _camPos.copy(charGroup.position).add(
      CAM_OFFSET.clone().applyEuler(new THREE.Euler(0, camYaw, 0))
    );
    camera.position.lerp(_camPos, 0.1);
    camera.lookAt(
      charGroup.position.x,
      charGroup.position.y + 1,
      charGroup.position.z
    );

    // ─── 미니맵 카메라 업데이트 ─────────────────────────────
    //  M키로 추적 모드 ↔ 전체 맵 모드 전환
    if (followMode) {
      // 캐릭터 중심 추적: 반경 ±20
      const cx = charGroup.position.x;
      const cz = charGroup.position.z;
      minimapCam.position.set(cx, 80, cz);
      minimapCam.lookAt(cx, 0, cz);
      const v = 20;
      minimapCam.left   = -v; minimapCam.right = v;
      minimapCam.top    =  v; minimapCam.bottom = -v;
      hudLabel.textContent = '미니맵 [M] — 추적';
    } else {
      // 전체 맵 보기: 반경 ±MAP_VIEW
      minimapCam.position.set(0, 80, 0);
      minimapCam.lookAt(0, 0, 0);
      minimapCam.left   = -MAP_VIEW; minimapCam.right = MAP_VIEW;
      minimapCam.top    =  MAP_VIEW; minimapCam.bottom = -MAP_VIEW;
      hudLabel.textContent = '미니맵 [M] — 전체';
    }
    minimapCam.updateProjectionMatrix();

    // ─── HUD 텍스트 업데이트 ────────────────────────────────
    const p = charGroup.position;
    hudX.textContent = p.x.toFixed(1).padStart(5);
    hudZ.textContent = p.z.toFixed(1).padStart(5);
    hudY.textContent = p.y.toFixed(1).padStart(5);
    updateCompass();

    // ─── 렌더링: 두 번 render()로 메인뷰 + 미니맵 ──────────
    const W = renderer.domElement.width;
    const H = renderer.domElement.height;

    // (1) 메인 뷰 — 전체 캔버스
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    // (2) 미니맵 뷰포트 — 우측 하단 코너
    //  WebGL y=0이 하단이므로 bottom=0 으로 맞춤
    //  setScissor로 이 영역 밖 픽셀을 보호 (메인 뷰 덮어쓰기 방지)
    const MS = Math.round(MAP_PX * window.devicePixelRatio);
    renderer.setScissorTest(true);
    renderer.setViewport(W - MS, 0, MS, MS);
    renderer.setScissor(W - MS, 0, MS, MS);
    // 미니맵 렌더 시 씬 fog 임시 제거 (위에서 보면 멀어서 fog에 덮힘)
    const savedFog = scene.fog;
    scene.fog = null;
    renderer.render(scene, minimapCam);
    scene.fog = savedFog;
    renderer.setScissorTest(false);
  }

  animate();

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ─── Cleanup ──────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup',   onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   onMouseUp);
    window.removeEventListener('resize',    onResize);
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    document.body.removeChild(hud);
    renderer.shadowMap.enabled = false;
    // 뷰포트·시저를 기본값으로 복원
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
    floorTex.dispose();
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
