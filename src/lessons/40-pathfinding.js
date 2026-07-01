// ══════════════════════════════════════════════════════════════
//  레슨 40: 경로탐색 — A* (A-Star) 알고리즘
//
//  배울 것:
//    - A* 알고리즘 : f(n) = g(n) + h(n)
//        g(n) = 시작점에서 n까지 실제 이동 비용
//        h(n) = n에서 목표까지 추정 비용 (휴리스틱 — Manhattan / Euclidean)
//    - 8방향 이동  : 대각선 비용 √2 ≈ 1.414
//    - 오픈 셋     : 탐색 예정 노드 (파란색)
//    - 클로즈드 셋 : 이미 탐색한 노드 (회색)
//    - 경로 복원   : 목표에서 parent 포인터를 역추적
//    - InstancedMesh : 그리드 타일 324개를 드로우콜 1번으로
//
//  조작:
//    Left Click   — 장애물 토글 (경로 자동 재계산)
//    Shift+Click  — 시작점 이동
//    Ctrl+Click   — 목표점 이동
//    V            — A* 단계별 시각화 재생
//    R            — 장애물 초기화
//    Enter        — 에이전트 경로 재출발
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── 그리드 설정 ──────────────────────────────────────────────
const GW   = 18;  // 열 수
const GH   = 18;  // 행 수
const CELL = 1.3; // 셀 크기 (world units)

// 셀 상태 상수
const EMPTY    = 0;
const OBSTACLE = 1;
const START    = 2;
const GOAL     = 3;
const OPEN     = 4;   // A* 오픈 셋 시각화용
const CLOSED   = 5;   // A* 클로즈드 셋 시각화용
const PATH     = 6;   // 최종 경로

// 셀 색상
const C = {
  [EMPTY]:    new THREE.Color(0x0f172a),
  [OBSTACLE]: new THREE.Color(0x475569),
  [START]:    new THREE.Color(0x22c55e),
  [GOAL]:     new THREE.Color(0xef4444),
  [OPEN]:     new THREE.Color(0x3b82f6),
  [CLOSED]:   new THREE.Color(0x334155),
  [PATH]:     new THREE.Color(0xfbbf24),
};

// ─── A* 알고리즘 ──────────────────────────────────────────────
//  steps: 각 단계에서 { open: Set<key>, closed: Set<key> } 스냅샷
//  반환:  { path: [{r,c}], steps: [{open,closed}] }
function astar(grid, startR, startC, goalR, goalC) {
  const key  = (r, c) => r * GW + c;
  // Manhattan 휴리스틱 (과소 평가 → admissible)
  const h    = (r, c) => Math.abs(r - goalR) + Math.abs(c - goalC);

  // 노드: { r, c, g, f, parent }
  const openMap    = new Map(); // key → node
  const closedSet  = new Set();
  const steps      = [];        // 시각화 단계 기록

  openMap.set(key(startR, startC), { r: startR, c: startC, g: 0, f: h(startR, startC), parent: null });

  while (openMap.size > 0) {
    // 오픈 셋에서 f값이 가장 낮은 노드 선택
    let current = null;
    for (const node of openMap.values()) {
      if (!current || node.f < current.f) current = node;
    }

    // 단계 스냅샷 저장
    steps.push({ open: new Set(openMap.keys()), closed: new Set(closedSet) });

    // 목표 도달 → 경로 복원
    if (current.r === goalR && current.c === goalC) {
      const path = [];
      let n = current;
      while (n) { path.unshift({ r: n.r, c: n.c }); n = n.parent; }
      return { path, steps };
    }

    openMap.delete(key(current.r, current.c));
    closedSet.add(key(current.r, current.c));

    // 8방향 이웃 탐색
    const DIRS = [
      [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],       // 상하좌우 비용 1
      [-1,-1, 1.414], [-1, 1, 1.414], [1,-1, 1.414], [1, 1, 1.414], // 대각선 비용 √2
    ];

    for (const [dr, dc, cost] of DIRS) {
      const nr = current.r + dr;
      const nc = current.c + dc;
      if (nr < 0 || nr >= GH || nc < 0 || nc >= GW) continue;
      if (grid[nr][nc] === OBSTACLE) continue;

      // 대각선 이동 시 코너 컷 방지: 양 옆이 막혀 있으면 대각선 불가
      if (dr !== 0 && dc !== 0) {
        if (grid[current.r][nc] === OBSTACLE || grid[nr][current.c] === OBSTACLE) continue;
      }

      const k = key(nr, nc);
      if (closedSet.has(k)) continue;

      const g = current.g + cost;
      const existing = openMap.get(k);
      if (existing && existing.g <= g) continue;

      openMap.set(k, { r: nr, c: nc, g, f: g + h(nr, nc), parent: current });
    }
  }

  return { path: [], steps }; // 경로 없음
}

// ─── init ─────────────────────────────────────────────────────
export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);

  // ─── 카메라: 비스듬한 RTS 시점 ───────────────────────────
  const cx = (GW * CELL) / 2; // 그리드 중심 X
  const cz = (GH * CELL) / 2; // 그리드 중심 Z
  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 200
  );
  camera.position.set(cx, 32, cz + 24);
  camera.lookAt(cx, 0, cz);

  // OrbitControls — 마우스 드래그 회전, 스크롤 줌
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(cx, 0, cz);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.1;
  controls.minDistance    = 10;
  controls.maxDistance    = 70;
  controls.maxPolarAngle  = Math.PI / 2 - 0.02; // 지하로 안 들어가게
  controls.update();

  // ─── 조명 ────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x1e293b, 8));
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -20;
  dirLight.shadow.camera.right = dirLight.shadow.camera.top   =  20;
  scene.add(dirLight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFShadowMap;

  // ─── 그리드 상태 ─────────────────────────────────────────
  const grid = Array.from({ length: GH }, () => Array(GW).fill(EMPTY));
  let startR = 2, startC = 2;
  let goalR  = GH - 3, goalC = GW - 3;

  // 초기 장애물 (L자 + 세로벽 + 몇 개 단독)
  const initObs = [
    [5,4],[5,5],[5,6],[5,7],[5,8],[5,9],[5,10],
    [6,10],[7,10],[8,10],[9,10],
    [9,4],[9,5],[9,6],[9,7],[9,8],[9,9],
    [13,5],[13,6],[13,7],[13,8],[13,9],[13,10],[13,11],
    [3,13],[4,13],[5,13],[6,13],[7,13],
    [11,13],[12,13],[13,13],[14,13],
  ];
  initObs.forEach(([r, c]) => { grid[r][c] = OBSTACLE; });
  grid[startR][startC] = START;
  grid[goalR][goalC]   = GOAL;

  // ─── 타일 InstancedMesh ───────────────────────────────────
  //  GW × GH 개의 타일을 하나의 InstancedMesh로 (드로우콜 1번)
  //  PlaneGeometry + 오브젝트 rotation 대신 얇은 BoxGeometry 사용:
  //  오브젝트 회전을 주면 인스턴스 로컬 좌표계도 같이 회전해서
  //  makeTranslation(c, 0, r)의 z축이 뒤집히는 버그가 생김
  const tileGeo = new THREE.BoxGeometry(CELL - 0.08, 0.04, CELL - 0.08);
  const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const tileInst = new THREE.InstancedMesh(tileGeo, tileMat, GW * GH);
  tileInst.receiveShadow = true;

  // 타일 위치 초기화 — XZ 평면에 올바르게 배치
  const _m = new THREE.Matrix4();
  for (let r = 0; r < GH; r++) {
    for (let c = 0; c < GW; c++) {
      _m.makeTranslation(c * CELL + CELL / 2, -0.02, r * CELL + CELL / 2);
      tileInst.setMatrixAt(r * GW + c, _m);
    }
  }
  tileInst.instanceMatrix.needsUpdate = true;
  scene.add(tileInst);

  // ─── 장애물 박스 메시 관리 ───────────────────────────────
  //  장애물 셀마다 독립적인 BoxGeometry 메시를 추가/제거
  const obsGeo = new THREE.BoxGeometry(CELL - 0.08, CELL * 0.9, CELL - 0.08);
  const obsMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
  const obsMeshMap = new Map(); // `${r},${c}` → Mesh

  function addObsMesh(r, c) {
    const k = `${r},${c}`;
    if (obsMeshMap.has(k)) return;
    const mesh = new THREE.Mesh(obsGeo, obsMat);
    mesh.position.set(c * CELL + CELL / 2, CELL * 0.45, r * CELL + CELL / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    obsMeshMap.set(k, mesh);
  }
  function removeObsMesh(r, c) {
    const k = `${r},${c}`;
    const mesh = obsMeshMap.get(k);
    if (mesh) { scene.remove(mesh); obsMeshMap.delete(k); }
  }

  // 초기 장애물 박스 생성
  initObs.forEach(([r, c]) => addObsMesh(r, c));

  // ─── 특별 마커: 시작·목표·에이전트 ─────────────────────
  function makeMarker(color, y = 0.35, radius = 0.28) {
    const mat  = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.3 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16), mat);
    mesh.position.y = y;
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const startMarker = makeMarker(0x22c55e, 0.35);
  const goalMarker  = makeMarker(0xef4444, 0.35);
  const agentMesh   = makeMarker(0xa855f7, 0.45, 0.32);

  function setMarkerPos(mesh, r, c) {
    mesh.position.x = c * CELL + CELL / 2;
    mesh.position.z = r * CELL + CELL / 2;
  }
  setMarkerPos(startMarker, startR, startC);
  setMarkerPos(goalMarker,  goalR,  goalC);
  setMarkerPos(agentMesh,   startR, startC);

  // ─── A* 결과 상태 ─────────────────────────────────────────
  let pathResult  = { path: [], steps: [] };
  let vizMode     = false;   // 단계별 시각화 진행 중
  let vizStep     = 0;       // 현재 시각화 스텝
  let vizTimer    = 0;       // 다음 스텝까지 누적 시간
  const VIZ_SPEED = 0.04;    // 스텝 간격 (초)

  // 에이전트 이동 상태
  let agentPathIdx = 0;       // 현재 향하는 경로 노드 인덱스
  let agentMoving  = false;
  const AGENT_SPEED = 6.0;    // units/sec
  const _agentTarget = new THREE.Vector3();

  function runAndDisplay() {
    pathResult = astar(grid, startR, startC, goalR, goalC);
    vizMode  = false;
    vizStep  = 0;
    applyViz(pathResult.path, new Set(), new Set());
  }

  // 타일에 색상 적용
  function applyViz(path, openSet, closedSet) {
    const pathSet = new Set(path.map(n => n.r * GW + n.c));

    for (let r = 0; r < GH; r++) {
      for (let c = 0; c < GW; c++) {
        const idx = r * GW + c;
        const k   = idx;
        const state = grid[r][c];

        let color;
        if (state === OBSTACLE) { color = C[EMPTY]; } // 박스로 덮이므로 타일은 어둡게
        else if (state === START)  { color = C[START]; }
        else if (state === GOAL)   { color = C[GOAL]; }
        else if (pathSet.has(k))   { color = C[PATH]; }
        else if (openSet.has(k))   { color = C[OPEN]; }
        else if (closedSet.has(k)) { color = C[CLOSED]; }
        else                       { color = C[EMPTY]; }

        tileInst.setColorAt(idx, color);
      }
    }
    tileInst.instanceColor.needsUpdate = true;
  }

  // ─── 장애물 토글 ─────────────────────────────────────────
  function toggleObstacle(r, c) {
    if ((r === startR && c === startC) || (r === goalR && c === goalC)) return;
    if (grid[r][c] === OBSTACLE) {
      grid[r][c] = EMPTY;
      removeObsMesh(r, c);
    } else {
      grid[r][c] = OBSTACLE;
      addObsMesh(r, c);
    }
    resetAgent();
    runAndDisplay();
  }

  function setStart(r, c) {
    if (grid[r][c] === OBSTACLE || (r === goalR && c === goalC)) return;
    grid[startR][startC] = EMPTY;
    startR = r; startC = c;
    grid[r][c] = START;
    setMarkerPos(startMarker, r, c);
    resetAgent();
    runAndDisplay();
  }

  function setGoal(r, c) {
    if (grid[r][c] === OBSTACLE || (r === startR && c === startC)) return;
    grid[goalR][goalC] = EMPTY;
    goalR = r; goalC = c;
    grid[r][c] = GOAL;
    setMarkerPos(goalMarker, r, c);
    resetAgent();
    runAndDisplay();
  }

  function resetAgent() {
    agentMoving  = false;
    agentPathIdx = 0;
    setMarkerPos(agentMesh, startR, startC);
    agentMesh.position.y = 0.45;
  }

  function startAgent() {
    if (pathResult.path.length < 2) return;
    agentMoving  = true;
    agentPathIdx = 1;
    setMarkerPos(agentMesh, startR, startC);
  }

  // 초기 경로 계산
  runAndDisplay();

  // ─── Raycasting — 그리드 바닥 평면과 교차 ───────────────
  const gridPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster  = new THREE.Raycaster();
  const _ray       = new THREE.Vector3();
  const _mouse     = new THREE.Vector2();

  function getCellFromClick(e) {
    _mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    _mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(_mouse, camera);
    raycaster.ray.intersectPlane(gridPlane, _ray);
    const c = Math.floor(_ray.x / CELL);
    const r = Math.floor(_ray.z / CELL);
    if (r < 0 || r >= GH || c < 0 || c >= GW) return null;
    return { r, c };
  }

  // 드래그(OrbitControls)와 클릭을 구분 — 마우스가 조금이라도 움직이면 드래그로 판단
  let _mouseMoved = false;
  const onMouseDown = () => { _mouseMoved = false; };
  const onMouseMove = () => { _mouseMoved = true; };
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMove);

  function onClick(e) {
    if (_mouseMoved) return;          // 드래그였으면 무시
    const cell = getCellFromClick(e);
    if (!cell) return;
    if (e.shiftKey)     setStart(cell.r, cell.c);
    else if (e.ctrlKey) setGoal(cell.r, cell.c);
    else                toggleObstacle(cell.r, cell.c);
  }
  renderer.domElement.addEventListener('click', onClick);

  // ─── 키보드 ──────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.code === 'KeyV') {
      // A* 단계별 시각화 시작
      vizMode  = true;
      vizStep  = 0;
      vizTimer = 0;
      agentMoving = false;
    }
    if (e.code === 'KeyR') {
      // 장애물 전체 초기화
      for (let r = 0; r < GH; r++) {
        for (let c = 0; c < GW; c++) {
          if (grid[r][c] === OBSTACLE) {
            grid[r][c] = EMPTY;
            removeObsMesh(r, c);
          }
        }
      }
      resetAgent();
      runAndDisplay();
    }
    if (e.code === 'Enter') {
      if (vizMode) { vizMode = false; runAndDisplay(); }
      startAgent();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // ─── HUD ─────────────────────────────────────────────────
  const hud = document.createElement('div');
  hud.id = 'pf-hud';
  hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:"Courier New",monospace;';
  hud.innerHTML = `
    <!-- 조작 안내 -->
    <div style="
      position:absolute;left:var(--panel-left,280px);top:16px;
      transition:left .25s ease;
      background:rgba(0,0,0,.7);border:1px solid #334155;
      border-radius:8px;padding:12px 16px;
      color:#94a3b8;font-size:12px;line-height:1.9;
    ">
      <div style="color:#e2e8f0;font-weight:bold;margin-bottom:6px;">경로탐색 A*</div>
      <span style="color:#e2e8f0">Left Click</span> — 장애물 토글<br>
      <span style="color:#e2e8f0">Shift+Click</span> — 시작점 이동<br>
      <span style="color:#e2e8f0">Ctrl+Click</span> — 목표점 이동<br>
      <span style="color:#94a3b8">드래그</span> — 카메라 회전<br>
      <span style="color:#94a3b8">스크롤</span> — 줌<br>
      <span style="color:#fbbf24">V</span> — A* 단계별 시각화<br>
      <span style="color:#fbbf24">Enter</span> — 에이전트 출발<br>
      <span style="color:#fbbf24">R</span> — 장애물 초기화
    </div>

    <!-- 범례 -->
    <div style="
      position:absolute;left:var(--panel-left,280px);bottom:20px;
      transition:left .25s ease;
      background:rgba(0,0,0,.7);border:1px solid #334155;
      border-radius:8px;padding:12px 16px;
      color:#94a3b8;font-size:12px;line-height:2;
    ">
      <div style="color:#e2e8f0;font-weight:bold;margin-bottom:4px;">범례</div>
      <span style="color:#22c55e">■</span> 시작
      <span style="color:#ef4444">■</span> 목표<br>
      <span style="color:#fbbf24">■</span> 경로
      <span style="color:#3b82f6">■</span> 탐색 중(Open)<br>
      <span style="color:#334155">■</span> 탐색 완료(Closed)
    </div>

    <!-- 통계 -->
    <div style="
      position:absolute;right:20px;top:16px;
      background:rgba(0,0,0,.7);border:1px solid #334155;
      border-radius:8px;padding:12px 16px;
      color:#94a3b8;font-size:13px;line-height:1.9;
    ">
      <div style="color:#e2e8f0;font-weight:bold;margin-bottom:4px;">A* 결과</div>
      경로 길이: <span id="pf-pathlen" style="color:#fbbf24">-</span><br>
      탐색 노드: <span id="pf-nodes"   style="color:#3b82f6">-</span><br>
      단계 수:   <span id="pf-steps"   style="color:#94a3b8">-</span><br>
      <div id="pf-status" style="margin-top:6px;color:#f97316;font-size:11px;"></div>
    </div>
  `;
  document.body.appendChild(hud);

  const elPathLen = document.getElementById('pf-pathlen');
  const elNodes   = document.getElementById('pf-nodes');
  const elSteps   = document.getElementById('pf-steps');
  const elStatus  = document.getElementById('pf-status');

  function updateStats() {
    elPathLen.textContent = pathResult.path.length > 0 ? pathResult.path.length : '경로 없음';
    elNodes.textContent   = pathResult.steps.length > 0
      ? pathResult.steps[pathResult.steps.length - 1].closed.size : '-';
    elSteps.textContent   = pathResult.steps.length;
    elStatus.textContent  = vizMode ? `시각화 ${vizStep + 1} / ${pathResult.steps.length}` : '';
  }

  // 초기 통계
  updateStats();

  // ─── 애니메이션 루프 ─────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);
    const elapsed = timer.getElapsed();

    // 마커 살짝 띄우기 (hover 효과)
    startMarker.position.y = 0.35 + Math.sin(elapsed * 2.0) * 0.06;
    goalMarker.position.y  = 0.35 + Math.sin(elapsed * 2.0 + 1) * 0.06;

    // ─── A* 단계별 시각화 ───────────────────────────────────
    if (vizMode && pathResult.steps.length > 0) {
      vizTimer += delta;
      if (vizTimer >= VIZ_SPEED) {
        vizTimer -= VIZ_SPEED;
        const step = pathResult.steps[Math.min(vizStep, pathResult.steps.length - 1)];
        const isLastStep = vizStep >= pathResult.steps.length - 1;
        applyViz(
          isLastStep ? pathResult.path : [],
          step.open,
          step.closed
        );
        updateStats();
        if (isLastStep) vizMode = false;
        else vizStep++;
      }
    }

    // ─── 에이전트 이동 ──────────────────────────────────────
    if (agentMoving && pathResult.path.length > 1) {
      const target = pathResult.path[agentPathIdx];
      if (!target) { agentMoving = false; }
      else {
        _agentTarget.set(
          target.c * CELL + CELL / 2,
          0.45,
          target.r * CELL + CELL / 2
        );
        const dist = agentMesh.position.distanceTo(_agentTarget);
        const step = AGENT_SPEED * delta;
        if (dist <= step) {
          agentMesh.position.copy(_agentTarget);
          agentPathIdx++;
          if (agentPathIdx >= pathResult.path.length) {
            agentMoving = false;
            // 목표 도달 — 바운스 효과
            agentMesh.position.y = 0.45;
          }
        } else {
          agentMesh.position.lerp(_agentTarget, step / dist);
        }
      }
    }

    // 에이전트 점프 애니메이션 (이동 중)
    if (agentMoving) {
      agentMesh.position.y = 0.45 + Math.abs(Math.sin(elapsed * 12)) * 0.18;
    }

    controls.update(); // damping 적용
    renderer.render(scene, camera);
  }

  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ─── Cleanup ─────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    controls.dispose();
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    renderer.domElement.removeEventListener('mousemove', onMouseMove);
    renderer.domElement.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    document.body.removeChild(hud);
    renderer.shadowMap.enabled = false;
    obsGeo.dispose();
    obsMat.dispose();
    tileGeo.dispose();
    tileMat.dispose();
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
