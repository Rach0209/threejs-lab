// ══════════════════════════════════════════════════════════════
//  Module 8: 수학/과학 시각화 — Feigenbaum 분기도
//
//  배울 것:
//    - 혼돈 이론(Chaos Theory)의 핵심 예시
//    - 로지스틱 맵(Logistic Map): x_{n+1} = r * x_n * (1 - x_n)
//    - Feigenbaum 분기도: r 값에 따른 수렴/분기/혼돈 패턴
//    - 수십만 개 점을 3D로 시각화
//
//  로지스틱 맵이란?
//    개체군 증가 모델: r=성장률, x=현재 개체 비율(0~1)
//    r이 작으면 → 하나의 값으로 수렴 (안정)
//    r이 커지면 → 2개, 4개, 8개... 값 사이 진동 (분기)
//    r > 3.57 → 예측 불가능한 혼돈 (chaos)
//    이 분기 패턴의 비율이 항상 Feigenbaum 상수(≈4.669)로 수렴
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 5, 15);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(6, 0.5, 0);

  const disposables = [];

  // ──────────────────────────────────────────────────────────
  //  Feigenbaum 분기도 계산
  //
  //  r 범위: 2.5 ~ 4.0 (관심 구간)
  //  각 r 값에 대해:
  //    1. 초기값 x=0.5 에서 1000번 반복 (수렴 대기)
  //    2. 이후 200번 반복 결과를 점으로 기록
  // ──────────────────────────────────────────────────────────

  const R_MIN   = 2.5;
  const R_MAX   = 4.0;
  const R_STEPS = 1500;     // r 값을 몇 단계로 나눌지
  const WARMUP  = 500;      // 초기 수렴 대기 횟수
  const SAMPLES = 200;      // 기록할 샘플 수

  const points = [];

  for (let i = 0; i < R_STEPS; i++) {
    const r = R_MIN + (i / R_STEPS) * (R_MAX - R_MIN);

    // 로지스틱 맵 반복: x_{n+1} = r * x_n * (1 - x_n)
    let x = 0.5;
    for (let j = 0; j < WARMUP; j++) {
      x = r * x * (1 - x);
    }

    // 수렴 후 샘플 기록
    for (let j = 0; j < SAMPLES; j++) {
      x = r * x * (1 - x);
      points.push(new THREE.Vector3(
        (r - R_MIN) * 8,  // r → X축 (0~12)
        x * 6 - 0.5,      // x → Y축 (0~6)
        0                 // Z축 (2D 분기도이므로 0)
      ));
    }
  }

  // ── Points로 시각화 ──────────────────────────────────────
  const bifGeo = new THREE.BufferGeometry().setFromPoints(points);

  // 색상: r 값에 따라 파랑→보라→빨강 그라데이션
  const colors = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    const t = p.x / 12; // 0~1 범위
    const c = new THREE.Color();
    c.setHSL(0.7 - t * 0.5, 0.9, 0.5 + t * 0.3);
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  });
  bifGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const bifMat = new THREE.PointsMaterial({
    size: 0.015,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: true,
  });

  const bifPoints = new THREE.Points(bifGeo, bifMat);
  scene.add(bifPoints);
  disposables.push({ geo: bifGeo, mat: bifMat });

  // ── 축 표시 ──────────────────────────────────────────────
  // X축 레이블 (r 값)
  const xLabels = [
    { r: 2.5, text: 'r=2.5\n안정' },
    { r: 3.0, text: 'r=3.0\n첫 분기' },
    { r: 3.449, text: 'r≈3.45\n2→4 분기' },
    { r: 3.57, text: 'r≈3.57\n혼돈 시작' },
    { r: 4.0, text: 'r=4.0\n완전 혼돈' },
  ];

  xLabels.forEach(({ r, text }) => {
    const x = (r - R_MIN) * 8;
    // 수직선
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, -0.8, 0),
      new THREE.Vector3(x, 6.5, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.5 });
    scene.add(new THREE.Line(lineGeo, lineMat));
    disposables.push({ geo: lineGeo, mat: lineMat });

    // 라벨
    const label = makeLabel(text, 0x94a3b8);
    label.position.set(x, -1.4, 0);
    scene.add(label);
    disposables.push({ label });
  });

  // ── Y축 ──────────────────────────────────────────────────
  const yAxisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.3, -0.5, 0),
    new THREE.Vector3(-0.3, 6.5, 0),
  ]);
  const yAxisMat = new THREE.LineBasicMaterial({ color: 0x475569 });
  scene.add(new THREE.Line(yAxisGeo, yAxisMat));
  disposables.push({ geo: yAxisGeo, mat: yAxisMat });

  // ── 제목 ─────────────────────────────────────────────────
  const title = makeLabel('Feigenbaum 분기도\n로지스틱 맵: x = r·x·(1-x)', 0xe2e8f0, true);
  title.position.set(5, 7.5, 0);
  scene.add(title);
  disposables.push({ label: title });

  // ─── 조명 (Points는 빛 반응 안 해서 단순 ambient면 충분) ────
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  // ─── UI ────────────────────────────────────────────────────
  const info = document.createElement('div');
  info.id = 'math-info';
  info.innerHTML = `
    <div class="info-box">
      <p><strong>Feigenbaum 분기도</strong></p>
      <p>점 수: ${points.length.toLocaleString()}개</p>
      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">
        x = r·x·(1-x)<br>
        <br>
        파랑 → 보라 → 빨강<br>
        안정 → 분기 → 혼돈<br>
        <br>
        Feigenbaum 상수 δ ≈ 4.669<br>
        (분기 간격 비율이 항상 수렴)
      </p>
    </div>
  `;
  document.body.appendChild(info);

  // ─── 애니메이션 ────────────────────────────────────────────
  // [deprecated] const clock = new THREE.Clock();
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 살짝 Z 방향으로 부드럽게 흔들려서 입체감 표현
    bifPoints.rotation.x = Math.sin(elapsed * 0.1) * 0.05;

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
    document.body.removeChild(info);
    disposables.forEach(({ geo, mat, label }) => {
      geo?.dispose(); mat?.dispose();
      if (label) {
        scene.remove(label);
        label.material.map?.dispose();
        label.material.dispose();
      }
    });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

function makeLabel(text, color = 0xffffff, large = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = large ? 128 : 96;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(color);
  ctx.fillStyle = `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`;
  ctx.font = `${large ? 'bold ' : ''}${large ? 28 : 22}px sans-serif`;
  ctx.textAlign = 'center';
  text.split('\n').forEach((line, i) => ctx.fillText(line, 256, 30 + i * 30));
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(large ? 4 : 2.5, large ? 1 : 0.7, 1);
  return sprite;
}
