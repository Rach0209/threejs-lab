// ══════════════════════════════════════════════════════════════
//  레슨 51: 파티클 기반 유체 시뮬레이션 (SPH — Smoothed Particle Hydrodynamics)
//
//  📌 09/50번 레슨은 cannon-es가 강체(고체) 물리를 대신 계산해줬지만,
//     유체는 "형태가 없는" 물질이라 딱딱한 바디 충돌로는 흉내낼 수 없습니다.
//     이번엔 라이브러리 없이 SPH 알고리즘을 직접 구현해봅니다.
//
//  배울 것:
//    - SPH 3단계          : 밀도(Poly6 커널) → 압력(상태방정식) →
//                            힘(Spiky 기울기 + 점성 라플라시안). 각 파티클이
//                            "작은 유체 덩어리"처럼 서로 밀고 당기며 유체처럼 움직임
//    - 공간 해시 그리드    : 이웃 탐색을 전수조사(O(n²)) 대신 반경 h 크기 셀에
//                            파티클을 버킷팅해 3×3×3 셀만 검사(대략 O(n))
//    - SoA(Structure of Arrays) : THREE.Vector3 객체 배열 대신 Float32Array
//                            여러 개로 수백 개 파티클을 매 프레임 갱신 — GC 부담 없이 빠름
//    - 점성 하나로 질감 전환 : viscosity 계수만 바꿔도 같은 알고리즘이
//                            물처럼/꿀처럼/기름처럼 완전히 다른 유체로 보임
//    - 고정 서브스텝 적분  : SPH는 힘이 시시각각 크게 변해 매우 작은 dt가
//                            필요함 — accumulator 패턴으로 프레임레이트와
//                            무관하게 안정적으로 여러 번 적분
//    - InstancedMesh 대량 렌더링 : 파티클마다 Mesh를 만들지 않고 인스턴스
//                            하나로 수백 개를 그리기 + per-instance color로 속도 시각화
//
//  🎯 실전 활용 예시:
//    - 게임 속 물/용암/진흙 웅덩이, 액체 리소스(물약 등) 연출
//    - 유체역학 교육/프리뷰 도구
//    - VFX 프로토타이핑 (스플래시, 웅덩이 형성)
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── SPH 물리 상수 ────────────────────────────────────────────
const H  = 0.5;           // 스무딩 반경(smoothing radius) — 이 거리 안의 파티클만 서로 영향
const H2 = H * H;
// 3D SPH 커널 정규화 상수 (Müller et al. 2003)
const POLY6      = 315 / (64 * Math.PI * H ** 9);          // 밀도용
const SPIKY_GRAD = -45 / (Math.PI * H ** 6);                // 압력력(force)용 — 뾰족해서 파티클이 안 뭉침
const VISC_LAP   = 45 / (Math.PI * H ** 6);                  // 점성력용

const MASS          = 1;
// ⚠ REST_DENSITY는 "물의 실제 밀도(1000)"가 아니라 이 커널·스무딩반경·초기
// 파티클 간격 조합이 실제로 만들어내는 밀도값에 맞춰야 한다. Poly6 커널로
// 초기 격자 밀도를 콘솔에서 직접 재보니(같은 파티클 간격 기준) 약 45가
// 나왔음 — REST_DENSITY를 임의로 1000처럼 높게 잡으면 실제 밀도가 항상
// 그보다 훨씬 낮아 pressure = max(0, GAS_CONST*(density-REST_DENSITY))가
// 계속 0에 clamp되어 압력력이 전혀 발생하지 않고, 파티클들이 서로 밀어내는
// 힘 없이 뭉친 채로 덜덜 떨리기만 하는 버그로 나타났다(직접 재현·확인함)
const REST_DENSITY  = 45;
const GAS_CONST     = 40;     // 압력 강성(stiffness) — 클수록 비압축성에 가까워지지만 불안정해짐
const GRAVITY       = -9.8;
const MAX_VEL       = 12;     // 폭주 방지 안전장치 — 명시적 적분(explicit integration)은 힘이 튀면 속도가 발산할 수 있음
const WALL_DAMPING  = 0.4;    // 벽 충돌 시 반사 속도 감쇠 (에너지 손실)

const BOUND_X = 3.2, BOUND_Z = 2.4, BOUND_Y = 9; // 유리 용기 내부 크기
const DT = 1 / 180;           // 물리 서브스텝 하나의 시간 (렌더 프레임과 별개)
const MAX_SUBSTEPS = 4;       // 한 프레임에 최대 이만큼만 — 저사양에서 "죽음의 소용돌이" 방지

const NX = 8, NY = 12, NZ = 6;    // 초기 "댐 브레이크" 블록 격자
const SPACING = 0.28;
const N = NX * NY * NZ;

const VISCOSITY_PRESETS = { water: 6, honey: 45, oil: 18 };
const VISCOSITY_LABEL   = { water: '물 💧', honey: '꿀 🍯', oil: '기름 🛢️' };

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  scene.fog = new THREE.Fog(0x0b1220, 12, 30);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(6, 5.5, 7);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minDistance = 3;
  controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  scene.add(new THREE.AmbientLight(0x6688aa, 1.5));
  const sun = new THREE.DirectionalLight(0xfff5e0, 2.5);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
  sun.shadow.camera.right = sun.shadow.camera.top = 6;
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // ══════════════════════════════════════════════════════════
  //  용기 (바닥 + 와이어프레임 벽)
  // ══════════════════════════════════════════════════════════
  const floorGeo = new THREE.PlaneGeometry(BOUND_X * 2, BOUND_Z * 2);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const boxGeo = new THREE.BoxGeometry(BOUND_X * 2, BOUND_Y, BOUND_Z * 2);
  const edges = new THREE.EdgesGeometry(boxGeo);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 });
  const wireBox = new THREE.LineSegments(edges, wireMat);
  wireBox.position.y = BOUND_Y / 2;
  scene.add(wireBox);
  boxGeo.dispose();

  // ══════════════════════════════════════════════════════════
  //  SPH 파티클 데이터 — Structure of Arrays (Float32Array)
  //  THREE.Vector3 객체 N개 대신 축마다 배열 하나씩 쓰면 매 프레임
  //  N × 이웃수 만큼 반복되는 핫루프에서 객체 생성/GC 부담이 사라짐
  // ══════════════════════════════════════════════════════════
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N);
  const fx = new Float32Array(N), fy = new Float32Array(N), fz = new Float32Array(N);
  const density  = new Float32Array(N);
  const pressure = new Float32Array(N);

  function resetParticles() {
    let idx = 0;
    const startX = -BOUND_X + 0.35;
    const startZ = -((NZ - 1) * SPACING) / 2;
    const startY = 0.3;
    for (let ix = 0; ix < NX; ix++) {
      for (let iy = 0; iy < NY; iy++) {
        for (let iz = 0; iz < NZ; iz++) {
          // 완전히 규칙적인 격자는 초기 힘이 정확히 상쇄돼 시뮬레이션이
          // 뻣뻣하게 굳어버릴 수 있어, 아주 작은 무작위 지터를 섞는다
          px[idx] = startX + ix * SPACING + (Math.random() - 0.5) * 0.01;
          py[idx] = startY + iy * SPACING;
          pz[idx] = startZ + iz * SPACING + (Math.random() - 0.5) * 0.01;
          vx[idx] = vy[idx] = vz[idx] = 0;
          idx++;
        }
      }
    }
  }
  resetParticles();

  // ─── 공간 해시 그리드 — 셀 크기 = H, 이웃은 3×3×3 셀만 검사 ──
  const cell = i => `${Math.floor(px[i] / H)},${Math.floor(py[i] / H)},${Math.floor(pz[i] / H)}`;
  const grid = new Map();
  function buildGrid() {
    grid.clear();
    for (let i = 0; i < N; i++) {
      const key = cell(i);
      let bucket = grid.get(key);
      if (!bucket) { bucket = []; grid.set(key, bucket); }
      bucket.push(i);
    }
  }
  // i가 속한 셀 기준 3×3×3 이웃 셀의 파티클 인덱스를 순회하며 cb(j) 호출
  function forEachNeighborCell(i, cb) {
    const cx = Math.floor(px[i] / H), cy = Math.floor(py[i] / H), cz = Math.floor(pz[i] / H);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (bucket) cb(bucket);
        }
      }
    }
  }

  function computeDensityPressure() {
    for (let i = 0; i < N; i++) {
      let rho = 0;
      forEachNeighborCell(i, bucket => {
        for (let k = 0; k < bucket.length; k++) {
          const j = bucket[k];
          const dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j];
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 < H2) {
            const diff = H2 - r2;
            rho += MASS * POLY6 * diff * diff * diff; // Poly6 커널
          }
        }
      });
      density[i] = rho > 1e-6 ? rho : REST_DENSITY; // 고립 파티클 0-나눗셈 방지
      pressure[i] = Math.max(0, GAS_CONST * (density[i] - REST_DENSITY)); // 이상기체 상태방정식
    }
  }

  function computeForces(viscosity) {
    for (let i = 0; i < N; i++) {
      let fxi = 0, fyi = 0, fzi = 0;
      forEachNeighborCell(i, bucket => {
        for (let k = 0; k < bucket.length; k++) {
          const j = bucket[k];
          if (j === i) continue;
          const dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j];
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 < H2 && r2 > 1e-8) {
            const r = Math.sqrt(r2);
            // 압력력: 두 파티클이 너무 가까워지면 Spiky 기울기가 강하게 밀어냄
            // (Poly6은 r→0에서 기울기가 0이라 뭉침 방지엔 부적합해 별도 커널 사용)
            const pTerm = -MASS * (pressure[i] + pressure[j]) / (2 * density[j])
                        * SPIKY_GRAD * (H - r) * (H - r);
            fxi += pTerm * (dx / r);
            fyi += pTerm * (dy / r);
            fzi += pTerm * (dz / r);
            // 점성력: 이웃과 속도 차이를 줄이는 방향 — 이 계수 하나로 물↔꿀 질감이 바뀜
            const vTerm = viscosity * MASS * VISC_LAP * (H - r) / density[j];
            fxi += vTerm * (vx[j] - vx[i]);
            fyi += vTerm * (vy[j] - vy[i]);
            fzi += vTerm * (vz[j] - vz[i]);
          }
        }
      });
      fyi += density[i] * GRAVITY; // 중력은 유체 덩어리(밀도)에 비례하는 체적력
      fx[i] = fxi; fy[i] = fyi; fz[i] = fzi;
    }
  }

  const WALL_MARGIN = 0.06;
  function integrate() {
    for (let i = 0; i < N; i++) {
      const invRho = 1 / density[i];
      vx[i] += fx[i] * invRho * DT;
      vy[i] += fy[i] * invRho * DT;
      vz[i] += fz[i] * invRho * DT;

      const speed2 = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i];
      if (speed2 > MAX_VEL * MAX_VEL) {
        const s = MAX_VEL / Math.sqrt(speed2);
        vx[i] *= s; vy[i] *= s; vz[i] *= s;
      }

      px[i] += vx[i] * DT;
      py[i] += vy[i] * DT;
      pz[i] += vz[i] * DT;

      if (px[i] < -BOUND_X + WALL_MARGIN) { px[i] = -BOUND_X + WALL_MARGIN; vx[i] *= -WALL_DAMPING; }
      if (px[i] >  BOUND_X - WALL_MARGIN) { px[i] =  BOUND_X - WALL_MARGIN; vx[i] *= -WALL_DAMPING; }
      if (pz[i] < -BOUND_Z + WALL_MARGIN) { pz[i] = -BOUND_Z + WALL_MARGIN; vz[i] *= -WALL_DAMPING; }
      if (pz[i] >  BOUND_Z - WALL_MARGIN) { pz[i] =  BOUND_Z - WALL_MARGIN; vz[i] *= -WALL_DAMPING; }
      if (py[i] < WALL_MARGIN)            { py[i] = WALL_MARGIN;            vy[i] *= -WALL_DAMPING; }
      if (py[i] > BOUND_Y)                { py[i] = BOUND_Y;                vy[i] *= -WALL_DAMPING; }
    }
  }

  function step(viscosity) {
    buildGrid();
    computeDensityPressure();
    computeForces(viscosity);
    integrate();
  }

  // ─── 휘젓기(스플래시) — 클릭 지점 주변 파티클에 방사형 임펄스 ──
  function applyImpulse(worldX, worldZ, radius, strength) {
    const r2 = radius * radius;
    for (let i = 0; i < N; i++) {
      const dx = px[i] - worldX, dz = pz[i] - worldZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < r2) {
        const d = Math.sqrt(d2) || 0.001;
        const falloff = 1 - d / radius;
        vx[i] += (dx / d) * strength * falloff;
        vz[i] += (dz / d) * strength * falloff;
        vy[i] += strength * 0.5 * falloff;
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  렌더링 — InstancedMesh 하나로 N개 파티클
  // ══════════════════════════════════════════════════════════
  const particleGeo = new THREE.SphereGeometry(0.09, 6, 6);
  const particleMat = new THREE.MeshStandardMaterial({
    roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.92,
  });
  const particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, N);
  particleMesh.receiveShadow = true;
  scene.add(particleMesh);

  const dummy = new THREE.Object3D();
  const colorSlow = new THREE.Color(0x1e40af); // 저속 — 짙은 파랑
  const colorFast = new THREE.Color(0xa5f3fc); // 고속 — 밝은 시안 (물보라 느낌)
  const tmpColor = new THREE.Color();
  const COLOR_MAX_SPEED = 4;

  function syncMesh() {
    for (let i = 0; i < N; i++) {
      dummy.position.set(px[i], py[i], pz[i]);
      dummy.updateMatrix();
      particleMesh.setMatrixAt(i, dummy.matrix);

      const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
      tmpColor.copy(colorSlow).lerp(colorFast, Math.min(speed / COLOR_MAX_SPEED, 1));
      particleMesh.setColorAt(i, tmpColor);
    }
    particleMesh.instanceMatrix.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
  }

  // ─── 점성 프리셋 전환 ─────────────────────────────────────
  let viscosityKey = 'water';
  function onKeyDown(e) {
    if (e.code === 'Digit1') viscosityKey = 'water';
    if (e.code === 'Digit2') viscosityKey = 'honey';
    if (e.code === 'Digit3') viscosityKey = 'oil';
    if (e.code === 'KeyR') resetParticles();
  }
  window.addEventListener('keydown', onKeyDown);

  // ─── 클릭으로 휘젓기 (드래그=카메라 회전과 구분) ───────────
  let _mouseMoved = false;
  const onMouseDown = () => { _mouseMoved = false; };
  const onMouseMove = () => { _mouseMoved = true; };
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMove);

  const stirPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1); // y = 1 평면
  const raycaster = new THREE.Raycaster();
  const _mouse = new THREE.Vector2();
  const _hit = new THREE.Vector3();
  function onClick(e) {
    if (_mouseMoved) return;
    _mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    _mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(_mouse, camera);
    if (raycaster.ray.intersectPlane(stirPlane, _hit)) {
      applyImpulse(_hit.x, _hit.z, 1.1, 7);
    }
  }
  renderer.domElement.addEventListener('click', onClick);

  // ─── UI ────────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'sph-fluid-ui';
  ui.style.cssText = `
    position:fixed;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
    background:rgba(0,0,0,.8);border:1px solid #334155;border-radius:10px;
    padding:14px 18px;font-family:"Courier New",monospace;color:#94a3b8;
    pointer-events:none;min-width:280px;
  `;
  ui.innerHTML = `
    <div style="color:#e2e8f0;font-size:14px;font-weight:bold;margin-bottom:6px;">
      💧 SPH 파티클 유체 시뮬레이션
    </div>
    <div style="color:#475569;font-size:11px;line-height:1.6;margin-bottom:8px;">
      ${N}개의 파티클이 서로 밀고 당기며 유체처럼 움직입니다.<br>
      화면을 클릭해 물을 휘저어보세요.
    </div>
    <p style="color:#94a3b8;font-size:12px;line-height:1.9;">
      <span style="color:#e2e8f0">마우스 드래그</span> — 카메라 회전 &nbsp;
      <span style="color:#e2e8f0">클릭</span> — 휘젓기<br>
      <span style="color:#e2e8f0">1 / 2 / 3</span> — 물 / 꿀 / 기름 &nbsp;
      <span style="color:#e2e8f0">R</span> — 리셋
    </p>
    <div style="height:1px;background:#1e293b;margin:8px 0;"></div>
    <p style="color:#64748b;font-size:11px;">
      점성: <span id="sph-visc" style="color:#38bdf8">물 💧</span>
    </p>
  `;
  document.body.appendChild(ui);
  const viscEl = ui.querySelector('#sph-visc');

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
      step(VISCOSITY_PRESETS[viscosityKey]);
      accumulator -= DT;
      n++;
    }

    syncMesh();
    controls.update();
    viscEl.textContent = VISCOSITY_LABEL[viscosityKey];

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

    floorGeo.dispose(); floorMat.dispose();
    edges.dispose(); wireMat.dispose();
    particleGeo.dispose(); particleMat.dispose();

    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
