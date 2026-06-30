// ══════════════════════════════════════════════════════════════
//  Module 28: CSG — Constructive Solid Geometry (불리언 연산)
//
//  배울 것:
//    - CSG 개념   : 두 메시를 합치거나 빼거나 교차해 새 메시 생성
//    - ADDITION      : A + B (두 메시 합치기)
//    - SUBTRACTION: A - B (A에서 B 모양 구멍 뚫기)
//    - INTERSECTION: A ∩ B (겹치는 부분만 남기기)
//    - three-bvh-csg : BVH(Bounding Volume Hierarchy) 기반 고속 CSG
//
//  활용 사례:
//    - 게임: 폭발로 지형에 구멍 뚫기
//    - 건축 시각화: 벽에 창문/문 구멍
//    - 3D 모델링 툴: 기본 도형 조합으로 복잡한 형태 제작
//    - CAD: 부품 제조 공차 시뮬레이션
//
//  three-bvh-csg 사용법:
//    1. Brush(geometry) 생성 (= CSG 대상 메시)
//    2. Evaluator.evaluate(brushA, brushB, OPERATION) 호출
//    3. 결과 Geometry를 일반 Mesh에 사용
//
//  주의:
//    - CSG 연산은 CPU에서 실행 → 매 프레임 호출 금지
//    - 결과 Geometry는 캐시해서 재사용
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';

const evaluator = new Evaluator();

// ─── CSG 연산 실행 헬퍼 ───────────────────────────────────────
function runCSG(geoA, geoB, operation, matA, matB) {
  const brushA = new Brush(geoA, matA);
  const brushB = new Brush(geoB, matB ?? matA);
  brushA.updateMatrixWorld();
  brushB.updateMatrixWorld();
  return evaluator.evaluate(brushA, brushB, operation);
}

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 3, 14);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);

  scene.add(new THREE.AmbientLight(0x334466, 3));
  const dir = new THREE.DirectionalLight(0xffffff, 3);
  dir.position.set(5, 8, 5);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0x4488ff, 1.5);
  fill.position.set(-5, 3, -3);
  scene.add(fill);

  const floorGeo = new THREE.PlaneGeometry(24, 24);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ── 재질 ──────────────────────────────────────────────────
  const matBlue   = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.3, metalness: 0.4 });
  const matRed    = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.3, metalness: 0.4 });
  const matGreen  = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3, metalness: 0.4 });
  const matGray   = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 });
  const matWire   = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.15 });

  // 결과 메시 목록 (나중에 업데이트용)
  const results   = [];
  const originals = []; // 원본 반투명 표시용

  // ─── 섹션 1: SUBTRACTION (빼기) ──────────────────────────
  //  박스에서 구 모양 구멍 뚫기 → 오목한 형태
  {
    const boxGeo    = new THREE.BoxGeometry(2, 2, 2);
    const sphereGeo = new THREE.SphereGeometry(1.1, 32, 32);

    const result = runCSG(boxGeo, sphereGeo, SUBTRACTION, matBlue, matRed);
    result.position.set(-4.5, 1, 0);
    scene.add(result);
    results.push({ mesh: result, type: 'sub' });

    // 원본 반투명 (참고용)
    const boxWire = new THREE.Mesh(boxGeo, matWire.clone());
    boxWire.position.copy(result.position);
    scene.add(boxWire);
    originals.push(boxWire);

    scene.add(makeLabel('SUBTRACTION\nA - B', -4.5, 2.8));
    scene.add(makeLabel('(박스에서 구 제거)', -4.5, 2.2));
  }

  // ─── 섹션 2: ADDITION (합치기) ───────────────────────────────
  //  박스 + 구 → 이음새 없이 하나의 메시
  {
    const boxGeo    = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const sphereGeo = new THREE.SphereGeometry(1.0, 32, 32);

    // 구를 살짝 위로 오프셋해서 겹치게
    const brushA = new Brush(boxGeo,    matGreen);
    const brushB = new Brush(sphereGeo, matGreen);
    brushA.position.set(0, 1, 0); brushA.updateMatrixWorld();
    brushB.position.set(0, 1.6, 0); brushB.updateMatrixWorld();

    const result = evaluator.evaluate(brushA, brushB, ADDITION);
    result.position.set(0, 0, 0);
    scene.add(result);
    results.push({ mesh: result, type: 'union' });

    scene.add(makeLabel('ADDITION\nA + B', 0, 3.2));
    scene.add(makeLabel('(박스 + 구 합치기)', 0, 2.6));
  }

  // ─── 섹션 3: INTERSECTION (교차) ─────────────────────────
  //  박스와 구의 겹치는 부분만 남기기
  {
    const boxGeo    = new THREE.BoxGeometry(2, 2, 2);
    const sphereGeo = new THREE.SphereGeometry(1.2, 32, 32);

    const result = runCSG(boxGeo, sphereGeo, INTERSECTION, matRed, matRed);
    result.position.set(4.5, 1, 0);
    scene.add(result);
    results.push({ mesh: result, type: 'inter' });

    const boxWire = new THREE.Mesh(boxGeo, matWire.clone());
    boxWire.position.copy(result.position);
    scene.add(boxWire);
    originals.push(boxWire);

    scene.add(makeLabel('INTERSECTION\nA ∩ B', 4.5, 2.8));
    scene.add(makeLabel('(겹치는 부분만)', 4.5, 2.2));
  }

  // ─── 섹션 4: 복합 연산 — 열쇠 구멍 ─────────────────────
  //  실전 예시: 판에 열쇠 구멍 모양 구멍 뚫기
  {
    const plateGeo  = new THREE.BoxGeometry(2.5, 3.5, 0.3);
    const circleGeo = new THREE.CylinderGeometry(0.55, 0.55, 1, 32);
    const slotGeo   = new THREE.BoxGeometry(0.45, 1.2, 1);

    // 원 + 슬롯 = 열쇠 구멍 모양
    const bCircle = new Brush(circleGeo, matGray);
    const bSlot   = new Brush(slotGeo, matGray);
    bCircle.position.set(0, 0.4, 0);  bCircle.updateMatrixWorld();
    bSlot.position.set(0, -0.5, 0);   bSlot.updateMatrixWorld();
    const keyhole = evaluator.evaluate(bCircle, bSlot, ADDITION);

    // 판에서 열쇠 구멍 빼기
    const bPlate   = new Brush(plateGeo, matGray);
    const bKeyhole = new Brush(keyhole.geometry, matGray);
    bPlate.position.set(0, 0, 0);    bPlate.updateMatrixWorld();
    bKeyhole.position.set(0, 0, 0);  bKeyhole.updateMatrixWorld();
    const plate = evaluator.evaluate(bPlate, bKeyhole, SUBTRACTION);

    plate.position.set(0, 1.75, -4);
    plate.rotation.x = -0.2;
    scene.add(plate);
    results.push({ mesh: plate, type: 'keyhole' });

    scene.add(makeLabel('복합 연산\n열쇠 구멍', 0, 4.0, -4));
  }

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'csg-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;min-width:240px;">
      <p><strong>CSG — 불리언 연산</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <span>원본 와이어</span>
        <input type="checkbox" id="wire-toggle" checked>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.8">
        <span style="color:#818cf8">왼쪽</span>: SUBTRACTION — 박스 - 구<br>
        <span style="color:#34d399">중앙</span>: ADDITION — 박스 + 구<br>
        <span style="color:#fb7185">오른쪽</span>: INTERSECTION — 교차<br>
        <span style="color:#94a3b8">뒤쪽</span>: 복합 연산 (열쇠 구멍)<br><br>
        CSG 결과는 일반 Mesh와 동일<br>
        → 재질, 조명, 렌더 모두 그대로 적용
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  document.getElementById('wire-toggle').addEventListener('change', e => {
    originals.forEach(o => { o.visible = e.target.checked; });
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const t = timer.getElapsed();

    // 결과 메시 천천히 회전
    results.forEach(({ mesh }) => {
      mesh.rotation.y = t * 0.3;
    });

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
    [matBlue, matRed, matGreen, matGray, matWire, floorMat, floorGeo].forEach(o => o?.dispose?.());
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

function makeLabel(text, x, y, z = 0) {
  const lines  = text.split('\n');
  const canvas = document.createElement('canvas');
  canvas.width  = 320;
  canvas.height = lines.length > 1 ? 64 : 40;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle  = '#94a3b8';
  ctx.font       = lines.length > 1 ? '17px sans-serif' : '15px sans-serif';
  ctx.textAlign  = 'center';
  lines.forEach((line, i) => ctx.fillText(line, 160, 22 + i * 26));
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(3, lines.length > 1 ? 0.7 : 0.4, 1);
  sprite.position.set(x, y, z);
  return sprite;
}
