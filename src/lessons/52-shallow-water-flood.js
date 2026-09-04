// ══════════════════════════════════════════════════════════════
//  레슨 52: 지형 홍수 시뮬레이션 — 얕은 물 방정식 (Shallow Water Equations)
//
//  📌 51번(SPH)은 물 한 방울 한 방울을 파티클로 표현했지만, 그 방식으로
//     수 km 규모의 진짜 홍수 지형을 실시간으로 계산하는 건 불가능합니다.
//     그래서 실제 치수(治水) 엔지니어링(HEC-RAS 등)은 다른 방법을 씁니다:
//     지형을 격자로 나누고, 칸마다 "물 높이(h)" 딱 하나만 추적하는
//     얕은 물 방정식(SWE)입니다. 수직 방향은 정수압으로 가정해 통째로
//     소거하기 때문에, 3D 유체보다 훨씬 가볍게 넓은 지형을 다룰 수 있습니다.
//
//  51번(SPH) vs 52번(SWE) — 같은 "물"이지만 완전히 다른 접근:
//    51 — 개별 입자 수백 개, 3D 위치·속도를 각각 추적 (국소적 디테일↑)
//    52 — 지형 격자 수천 칸, 칸마다 물 높이 하나만 추적 (광역 확산↑)
//
//  배울 것:
//    - Virtual Pipes 기법  : 인접한 격자 칸을 "가상의 파이프"로 연결해,
//                            두 칸의 수면 높이차(=수압차)만큼 물을 흘려보냄
//                            (Kass & Miller 1990, Mei et al. 2007 — 게임/
//                            실시간 지형 침식 시뮬레이션에서 널리 쓰는 방법)
//    - 질량 보존 안전장치  : 한 칸이 가진 물보다 더 많이 못 내보내게 유량을
//                            정규화 — SPH의 velocity clamp와는 다른 방식의
//                            안정화지만 "폭주 방지"라는 목적은 동일
//    - 지형=경계 조건       : 장애물(건물)을 위해 별도 충돌 바디를 만들
//                            필요가 없음 — 그냥 지형을 그 자리만 높게
//                            만들면 수면 높이차 계산 자체가 알아서 피해가게 함
//    - 댐 붕괴(dam-break)   : 저장된 물을 막고 있던 지형을 순간적으로 낮추면
//                            바로 그 높이차가 흐름으로 이어짐 — 별도의
//                            "방류 이벤트" 코드 없이 지형 수정만으로 충분
//    - 이중 heightmap 메시  : 지형(고정) + 물(매 프레임 갱신) 두 장을
//                            겹쳐 그려서 "지형 위에 물이 찬" 모습을 표현
//    - 커스텀 BufferGeometry: 격자 인덱스와 정점 인덱스를 1:1로 맞춰 직접
//                            구성해야 물리 배열 ↔ 메시 정점이 정확히 대응됨
//
//  🎯 실전 활용 예시:
//    - 실제 치수 엔지니어링의 홍수/댐 붕괴 범람 예측(대규모 버전)
//    - 게임/영화의 실시간 지형 침식·강물·해안 침수 연출
//    - 도시 계획에서 제방·배수로 배치의 효과 시각화
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── 격자 설정 ────────────────────────────────────────────────
const R    = 80;              // 격자 한 변의 칸 수 (총 R*R칸)
const SIZE = 20;               // 지형 한 변의 월드 크기
const CELL = SIZE / (R - 1);

// ─── 지형 생성 파라미터 ───────────────────────────────────────
const BASE_ELEV    = 3;
const HILL_AMP      = 1.3;
const VALLEY_DEPTH  = 2.4;
const VALLEY_SIGMA  = 1.8;
const DAM_X         = -SIZE * 0.18;
const DAM_HEIGHT    = 3.2;
const DAM_SIGMA     = 0.5;
const BREACH_HALF_W = 2.0;     // 붕괴 시 뚫리는 폭(밸리 중심 기준 z)
const RESERVOIR_LV  = 2.3;     // 댐 상류에 미리 채워두는 저수위
const PLINTH_HEIGHT = 0.3;     // 건물 대지는 살짝만 높여 — 너무 높으면 홍수가 안 닿음
// 밸리 중심선(valleyCenterZ)에서 0.3 이내에 배치 — 콘솔에서 직접 수심 프로파일을
// 재보니 중심선에서 조금만 벗어나도(0.5~0.8) 수심이 거의 0으로 급감해서,
// 실제로 침수되는 걸 보려면 이 정도로 가까이 붙여야 함
const BUILDINGS = [
  { x: -2.0, z: -0.284, r: 1.1 },
  { x: -1.0, z: -0.598, r: 1.0 },
  { x:  1.0, z:  0.598, r: 1.2 },
  { x:  2.5, z:  0.419, r: 0.9 },
];

// ─── SWE(Virtual Pipes) 시뮬레이션 파라미터 ───────────────────
const FLOW_ACCEL   = 30;       // 클수록 물이 빠르게 흐름
const FLOW_DAMPING = 0.98;     // 매 스텝 유량 감쇠(마찰) — 없으면 계속 출렁임
const MAX_FLUX     = 8;        // 폭주 방지 안전 클램프
const RAIN_RATE    = 0.15;     // 비가 올 때 초당 수심 증가량
const DT = 1 / 60;
const MAX_SUBSTEPS = 3;

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1a14);
  scene.fog = new THREE.Fog(0x0e1a14, 18, 40);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(14, 11, 14);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minDistance = 5;
  controls.maxDistance = 35;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  scene.add(new THREE.AmbientLight(0x6688aa, 1.6));
  const sun = new THREE.DirectionalLight(0xfff5e0, 2.2);
  sun.position.set(10, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -14;
  sun.shadow.camera.right = sun.shadow.camera.top = 14;
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // ══════════════════════════════════════════════════════════
  //  지형 생성 — 값 노이즈(Value Noise) FBM로 언덕, 가우시안으로
  //  구불구불한 골짜기·댐 능선·건물 대지를 깎고 쌓음
  // ══════════════════════════════════════════════════════════
  function hash(x, z) {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function valueNoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z) {
    let sum = 0, amp = 0.5, freq = 1;
    for (let o = 0; o < 4; o++) {
      sum += amp * valueNoise(x * freq, z * freq);
      freq *= 2; amp *= 0.5;
    }
    return sum;
  }
  function gauss(d, sigma) { return Math.exp(-(d * d) / (2 * sigma * sigma)); }
  // 골짜기가 x를 따라 완만하게 구불거리는 중심선
  function valleyCenterZ(x) { return Math.sin(x * 0.2) * 1.5; }

  const N = R * R;
  const terrainBase = new Float32Array(N); // 리셋 기준(레벨 쌓기 이전) 원본 지형
  const terrain     = new Float32Array(N); // 실제 시뮬레이션에 쓰는 지형(제방/붕괴로 변함)
  const damBump     = new Float32Array(N); // 댐 능선만의 높이 기여분(붕괴 시 이 값만 뺌)
  const plinthMask  = new Float32Array(N); // 건물 대지 여부(색칠용)
  const water       = new Float32Array(N);
  const fL = new Float32Array(N), fR = new Float32Array(N);
  const fT = new Float32Array(N), fB = new Float32Array(N);

  function worldX(ix) { return -SIZE / 2 + ix * CELL; }
  function worldZ(iz) { return -SIZE / 2 + iz * CELL; }

  function generateTerrain() {
    for (let iz = 0; iz < R; iz++) {
      const z = worldZ(iz);
      for (let ix = 0; ix < R; ix++) {
        const x = worldX(ix);
        const idx = iz * R + ix;

        const hills = fbm(x * 0.15 + 10, z * 0.15 + 10) * HILL_AMP;
        const vc = valleyCenterZ(x);
        const trench = VALLEY_DEPTH * gauss(z - vc, VALLEY_SIGMA);
        let h = BASE_ELEV + hills - trench;

        const dam = DAM_HEIGHT * gauss(x - DAM_X, DAM_SIGMA);
        damBump[idx] = dam;
        h += dam;

        let plinth = 0;
        for (const b of BUILDINGS) {
          const d = Math.hypot(x - b.x, z - b.z);
          plinth = Math.max(plinth, PLINTH_HEIGHT * gauss(Math.max(0, d - b.r * 0.4), b.r * 0.5));
        }
        plinthMask[idx] = plinth;
        h += plinth;

        terrainBase[idx] = h;
      }
    }
    terrain.set(terrainBase);
  }
  generateTerrain();

  function resetSim() {
    terrain.set(terrainBase);
    water.fill(0);
    fL.fill(0); fR.fill(0); fT.fill(0); fB.fill(0);

    // 댐 상류(x < DAM_X)에 저수위까지 물을 미리 채워 저수지를 만든다
    for (let iz = 0; iz < R; iz++) {
      for (let ix = 0; ix < R; ix++) {
        const x = worldX(ix);
        if (x >= DAM_X) continue;
        const idx = iz * R + ix;
        const depth = RESERVOIR_LV - terrain[idx];
        if (depth > 0) water[idx] = depth;
      }
    }
    damBroken = false;
  }

  function breakDam() {
    if (damBroken) return;
    damBroken = true;
    for (let iz = 0; iz < R; iz++) {
      const z = worldZ(iz);
      const vc = valleyCenterZ(DAM_X);
      if (Math.abs(z - vc) > BREACH_HALF_W) continue;
      for (let ix = 0; ix < R; ix++) {
        const x = worldX(ix);
        if (Math.abs(x - DAM_X) > DAM_SIGMA * 3) continue;
        const idx = iz * R + ix;
        terrain[idx] = terrainBase[idx] - damBump[idx]; // 댐 기여분만 제거 = 붕괴 부분만 뚫림
      }
    }
  }

  let damBroken = false;
  let rainOn = false;
  resetSim();

  // ══════════════════════════════════════════════════════════
  //  SWE 스텝 — Virtual Pipes (Mei et al. 2007 방식)
  // ══════════════════════════════════════════════════════════
  function simStep(dt) {
    // 1) 높이차(수압차)만큼 4방향 유량을 가속 — 각 칸이 자신의 유출량만 계산
    for (let iz = 0; iz < R; iz++) {
      for (let ix = 0; ix < R; ix++) {
        const idx = iz * R + ix;
        const H = terrain[idx] + water[idx];

        if (ix > 0) {
          const n = idx - 1;
          const dH = H - (terrain[n] + water[n]);
          const f = fL[idx] * FLOW_DAMPING + dt * FLOW_ACCEL * dH / CELL;
          fL[idx] = f > 0 ? Math.min(f, MAX_FLUX) : 0;
        } else fL[idx] = 0;

        if (ix < R - 1) {
          const n = idx + 1;
          const dH = H - (terrain[n] + water[n]);
          const f = fR[idx] * FLOW_DAMPING + dt * FLOW_ACCEL * dH / CELL;
          fR[idx] = f > 0 ? Math.min(f, MAX_FLUX) : 0;
        } else fR[idx] = 0;

        if (iz > 0) {
          const n = idx - R;
          const dH = H - (terrain[n] + water[n]);
          const f = fT[idx] * FLOW_DAMPING + dt * FLOW_ACCEL * dH / CELL;
          fT[idx] = f > 0 ? Math.min(f, MAX_FLUX) : 0;
        } else fT[idx] = 0;

        if (iz < R - 1) {
          const n = idx + R;
          const dH = H - (terrain[n] + water[n]);
          const f = fB[idx] * FLOW_DAMPING + dt * FLOW_ACCEL * dH / CELL;
          fB[idx] = f > 0 ? Math.min(f, MAX_FLUX) : 0;
        } else fB[idx] = 0;
      }
    }

    // 2) 자기 칸이 가진 물보다 더 못 나가게 4방향 유량을 함께 정규화
    //    (이게 없으면 얕은 칸에서 water가 음수로 내려가며 시뮬레이션이 터짐)
    for (let idx = 0; idx < N; idx++) {
      const totalOut = fL[idx] + fR[idx] + fT[idx] + fB[idx];
      if (totalOut > 0 && totalOut * dt > water[idx]) {
        const k = water[idx] / (totalOut * dt);
        fL[idx] *= k; fR[idx] *= k; fT[idx] *= k; fB[idx] *= k;
      }
    }

    // 3) 수심 갱신 — 자기 유출은 빼고, 이웃이 나를 향해 흘려보낸 유입을 더함
    for (let iz = 0; iz < R; iz++) {
      for (let ix = 0; ix < R; ix++) {
        const idx = iz * R + ix;
        let dw = -(fL[idx] + fR[idx] + fT[idx] + fB[idx]);
        if (ix > 0)     dw += fR[idx - 1];
        if (ix < R - 1) dw += fL[idx + 1];
        if (iz > 0)     dw += fB[idx - R];
        if (iz < R - 1) dw += fT[idx + R];
        water[idx] = Math.max(0, water[idx] + dw * dt);
      }
    }

    if (rainOn) {
      for (let idx = 0; idx < N; idx++) water[idx] += RAIN_RATE * dt;
    }
  }

  // ─── 제방 쌓기(클릭) ───────────────────────────────────────
  function raiseLevee(cx, cz) {
    const RADIUS = 1.1, AMOUNT = 0.5, MAX_ADD = 3;
    for (let iz = 0; iz < R; iz++) {
      const z = worldZ(iz);
      if (Math.abs(z - cz) > RADIUS) continue;
      for (let ix = 0; ix < R; ix++) {
        const x = worldX(ix);
        const d = Math.hypot(x - cx, z - cz);
        if (d > RADIUS) continue;
        const idx = iz * R + ix;
        const added = terrain[idx] - terrainBase[idx];
        if (added >= MAX_ADD) continue;
        const falloff = 1 - d / RADIUS;
        terrain[idx] = Math.min(terrainBase[idx] + MAX_ADD, terrain[idx] + AMOUNT * falloff);
      }
    }
    syncTerrainMesh();
  }

  // ══════════════════════════════════════════════════════════
  //  지형 메시 — 커스텀 BufferGeometry (격자 인덱스 = 정점 인덱스)
  // ══════════════════════════════════════════════════════════
  function buildGridGeometry() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(N * 3);
    const colors    = new Float32Array(N * 3);
    for (let iz = 0; iz < R; iz++) {
      for (let ix = 0; ix < R; ix++) {
        const idx = iz * R + ix;
        positions[idx * 3 + 0] = worldX(ix);
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = worldZ(iz);
      }
    }
    const indices = new Uint32Array((R - 1) * (R - 1) * 6);
    let p = 0;
    for (let iz = 0; iz < R - 1; iz++) {
      for (let ix = 0; ix < R - 1; ix++) {
        const a = iz * R + ix, b = a + 1, c = a + R, d = c + 1;
        indices[p++] = a; indices[p++] = c; indices[p++] = b;
        indices[p++] = b; indices[p++] = c; indices[p++] = d;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }

  const terrainGeo = buildGridGeometry();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);

  const grassColor = new THREE.Color(0x3f6212);
  const rockColor  = new THREE.Color(0x8a8378);
  const pavedColor = new THREE.Color(0x57534e);
  const _c = new THREE.Color();
  function syncTerrainMesh() {
    const pos = terrainGeo.attributes.position;
    const col = terrainGeo.attributes.color;
    for (let idx = 0; idx < N; idx++) {
      pos.array[idx * 3 + 1] = terrain[idx];
      const t = THREE.MathUtils.clamp((terrain[idx] - 1) / 4, 0, 1);
      _c.copy(grassColor).lerp(rockColor, t);
      if (plinthMask[idx] > 0.3) _c.lerp(pavedColor, Math.min(plinthMask[idx], 1));
      col.array[idx * 3 + 0] = _c.r; col.array[idx * 3 + 1] = _c.g; col.array[idx * 3 + 2] = _c.b;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    terrainGeo.computeVertexNormals();
  }
  syncTerrainMesh();

  // ─── 물 메시 — 매 프레임 수심에 맞춰 갱신 ───────────────────
  const waterGeo = buildGridGeometry();
  const waterMat = new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.62, roughness: 0.15, metalness: 0.05,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  scene.add(waterMesh);

  const shallowColor = new THREE.Color(0x60a5fa);
  const deepColor    = new THREE.Color(0x1e3a8a);
  const WATER_Y_BIAS = 0.01; // 젖은 칸이 지형과 정확히 겹쳐 z-fighting 나는 것 방지
  const COLOR_MAX_DEPTH = 2.5;
  const WET_EPS = 0.015;      // 이보다 얕으면 "물 없음"으로 취급
  const HIDE_DEPTH = 4;       // 마른 칸의 정점을 지형 아래로 파묻어 물 표면을 숨김
  // ⚠ 표준 머티리얼은 정점별 투명도(alpha)를 못 줘서, opacity를 낮춰도 마른 칸까지
  // 옅은 파란 막이 지형 전체를 뒤덮어 "다 물에 잠긴 것처럼" 보이는 문제가 있었다.
  // 그래서 물이 사실상 없는 칸은 정점을 지형보다 한참 아래로 내려버려 화면에서
  // 아예 안 보이게 하는 방식으로 우회함 — 젖은 칸만 수면 메시가 떠오르는 효과
  function syncWaterMesh() {
    const pos = waterGeo.attributes.position;
    const col = waterGeo.attributes.color;
    for (let idx = 0; idx < N; idx++) {
      const w = water[idx];
      pos.array[idx * 3 + 1] = w > WET_EPS ? terrain[idx] + w + WATER_Y_BIAS : terrain[idx] - HIDE_DEPTH;
      _c.copy(shallowColor).lerp(deepColor, Math.min(w / COLOR_MAX_DEPTH, 1));
      col.array[idx * 3 + 0] = _c.r; col.array[idx * 3 + 1] = _c.g; col.array[idx * 3 + 2] = _c.b;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    waterGeo.computeVertexNormals();
  }

  // ─── 건물 (장식용 — 실제 차단은 지형의 대지 높이가 담당) ─────
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.7 });
  const buildingMeshes = BUILDINGS.map(b => {
    const mesh = new THREE.Mesh(buildingGeo, buildingMat);
    const ix = Math.round((b.x + SIZE / 2) / CELL), iz = Math.round((b.z + SIZE / 2) / CELL);
    const groundY = terrainBase[THREE.MathUtils.clamp(iz, 0, R - 1) * R + THREE.MathUtils.clamp(ix, 0, R - 1)];
    const w = b.r * 1.3, h = 1.6, d = b.r * 1.3;
    mesh.scale.set(w, h, d);
    mesh.position.set(b.x, groundY + h / 2 - 0.2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  });

  // ─── 클릭으로 제방 쌓기 (드래그=카메라 회전과 구분) ──────────
  let _mouseMoved = false;
  const onMouseDown = () => { _mouseMoved = false; };
  const onMouseMove = () => { _mouseMoved = true; };
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMove);

  const raycaster = new THREE.Raycaster();
  const _mouse = new THREE.Vector2();
  function onClick(e) {
    if (_mouseMoved) return;
    _mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    _mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(_mouse, camera);
    const hit = raycaster.intersectObject(terrainMesh)[0];
    if (hit) raiseLevee(hit.point.x, hit.point.z);
  }
  renderer.domElement.addEventListener('click', onClick);

  // ─── 키보드 ────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.code === 'Space') { e.preventDefault(); breakDam(); }
    if (e.code === 'KeyR') { resetSim(); syncTerrainMesh(); }
    if (e.code === 'KeyP') { rainOn = !rainOn; }
  }
  window.addEventListener('keydown', onKeyDown);

  // ─── UI ────────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'swe-flood-ui';
  ui.style.cssText = `
    position:fixed;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
    background:rgba(0,0,0,.8);border:1px solid #334155;border-radius:10px;
    padding:14px 18px;font-family:"Courier New",monospace;color:#94a3b8;
    pointer-events:none;min-width:290px;
  `;
  ui.innerHTML = `
    <div style="color:#e2e8f0;font-size:14px;font-weight:bold;margin-bottom:6px;">
      🌊 지형 홍수 시뮬레이션 (얕은 물 방정식)
    </div>
    <div style="color:#475569;font-size:11px;line-height:1.6;margin-bottom:8px;">
      왼쪽 저수지가 댐 뒤에 저장돼 있습니다.<br>
      Space로 댐을 무너뜨려 하류 건물을 침수시켜보세요.
    </div>
    <p style="color:#94a3b8;font-size:12px;line-height:1.9;">
      <span style="color:#e2e8f0">마우스 드래그</span> — 카메라 회전 &nbsp;
      <span style="color:#e2e8f0">클릭</span> — 제방 쌓기<br>
      <span style="color:#e2e8f0">Space</span> — 댐 붕괴 &nbsp;
      <span style="color:#e2e8f0">P</span> — 비 토글 &nbsp;
      <span style="color:#e2e8f0">R</span> — 리셋
    </p>
    <div style="height:1px;background:#1e293b;margin:8px 0;"></div>
    <p style="color:#64748b;font-size:11px;">
      댐: <span id="swe-dam" style="color:#34d399">온전</span> &nbsp;
      비: <span id="swe-rain" style="color:#64748b">없음</span>
    </p>
  `;
  document.body.appendChild(ui);
  const damEl  = ui.querySelector('#swe-dam');
  const rainEl = ui.querySelector('#swe-rain');

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;
  let accumulator = 0;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);

    accumulator += delta;
    let n = 0;
    while (accumulator >= DT && n < MAX_SUBSTEPS) {
      simStep(DT);
      accumulator -= DT;
      n++;
    }

    syncWaterMesh();
    controls.update();

    damEl.textContent = damBroken ? '붕괴됨 🚨' : '온전';
    damEl.style.color = damBroken ? '#f87171' : '#34d399';
    rainEl.textContent = rainOn ? '내리는 중 🌧️' : '없음';
    rainEl.style.color = rainOn ? '#38bdf8' : '#64748b';

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
    controls.dispose();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    renderer.domElement.removeEventListener('mousemove', onMouseMove);
    renderer.domElement.removeEventListener('click', onClick);
    document.body.removeChild(ui);
    renderer.shadowMap.enabled = false;

    terrainGeo.dispose(); terrainMat.dispose();
    waterGeo.dispose(); waterMat.dispose();
    buildingGeo.dispose(); buildingMat.dispose();

    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
