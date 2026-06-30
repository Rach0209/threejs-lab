// ══════════════════════════════════════════════════════════════
//  Module 23: 커스텀 Geometry (BufferGeometry)
//
//  배울 것:
//    - BufferGeometry   : 정점 데이터를 Float32Array로 직접 관리
//    - BufferAttribute  : position / normal / uv / color 속성 등록
//    - index            : 정점 공유로 메모리 절약
//    - computeVertexNormals() : 인덱스 기반 법선 자동 계산
//    - 절차적 메시      : 수학 함수로 튜브 / 뫼비우스 띠 / 파라메트릭 곡면
//
//  BufferGeometry 구조:
//    position  : [x0,y0,z0, x1,y1,z1, ...]  — 정점 좌표
//    normal    : [nx,ny,nz, ...]             — 법선 벡터 (조명 계산용)
//    uv        : [u0,v0, u1,v1, ...]         — 텍스처 좌표
//    index     : [0,1,2, 0,2,3, ...]         — 삼각형 정의 (정점 인덱스)
//
//  indexed vs non-indexed:
//    non-indexed: 삼각형마다 정점 3개 → 공유 불가, 메모리 많음
//    indexed    : 정점 공유 가능 → 메모리 절약, 법선 스무딩 가능
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── 1. 파라메트릭 튜브 ───────────────────────────────────────
//  경로 함수 f(t) → Vector3 를 따라 단면(원)을 이어붙인 튜브
function buildTube(pathFn, segments, radialSegs, radius) {
  const positions = [];
  const normals   = [];
  const uvs       = [];
  const indices   = [];

  // 각 경로 포인트에서 단면(원)의 정점 생성
  for (let i = 0; i <= segments; i++) {
    const t    = i / segments;
    const pos  = pathFn(t);

    // 접선 벡터 (경로 방향)
    const posN = pathFn(Math.min(t + 0.001, 1));
    const tang = new THREE.Vector3().subVectors(posN, pos).normalize();

    // 접선과 수직인 로컬 좌표계 (Frenet frame 근사)
    const up    = new THREE.Vector3(0, 1, 0);
    const binorm = new THREE.Vector3().crossVectors(tang, up).normalize();
    const norm   = new THREE.Vector3().crossVectors(binorm, tang).normalize();

    for (let j = 0; j <= radialSegs; j++) {
      const angle = (j / radialSegs) * Math.PI * 2;
      const cos   = Math.cos(angle), sin = Math.sin(angle);

      // 단면 원의 정점 = 경로 위치 + 반지름 방향
      const vx = pos.x + radius * (cos * norm.x + sin * binorm.x);
      const vy = pos.y + radius * (cos * norm.y + sin * binorm.y);
      const vz = pos.z + radius * (cos * norm.z + sin * binorm.z);

      positions.push(vx, vy, vz);
      normals.push(cos * norm.x + sin * binorm.x,
                   cos * norm.y + sin * binorm.y,
                   cos * norm.z + sin * binorm.z);
      uvs.push(t, j / radialSegs);
    }
  }

  // 인덱스: 사각형 → 삼각형 2개
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * (radialSegs + 1) + j;
      const b = a + radialSegs + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// ─── 2. 뫼비우스 띠 ──────────────────────────────────────────
//  한 면만 있는 위상 도형 — UV가 한 바퀴 돌면 위아래가 뒤집힘
function buildMobius(segments, widthSegs, width) {
  const positions = [], normals = [], uvs = [], indices = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const t = u * Math.PI * 2; // 0 ~ 2π

    // 중심 경로: 원
    const cx = Math.cos(t), cy = Math.sin(t);

    for (let j = 0; j <= widthSegs; j++) {
      const v = j / widthSegs - 0.5; // -0.5 ~ 0.5
      // 뫼비우스 변환: 한 바퀴마다 t/2씩 회전
      const twist = t / 2;
      const dx = v * Math.cos(twist);
      const dy = v * Math.sin(twist);

      positions.push(
        (1 + dx) * cx - dy * (-Math.sin(t)),
        (1 + dx) * cy - dy * Math.cos(t),
        dy * 1
      );
      uvs.push(u, v + 0.5);
      // 법선은 computeVertexNormals로 대체
      normals.push(0, 0, 1);
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < widthSegs; j++) {
      const a = i * (widthSegs + 1) + j;
      const b = a + widthSegs + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals(); // ★ 인덱스 기반 법선 재계산
  return geo;
}

// ─── 3. 파라메트릭 곡면 (토러스 직접 구현) ───────────────────
//  f(u, v) → Vector3 함수로 정의되는 임의의 곡면
function buildParametric(fn, uSegs, vSegs) {
  const positions = [], normals = [], uvs = [], indices = [];

  for (let i = 0; i <= uSegs; i++) {
    for (let j = 0; j <= vSegs; j++) {
      const u = i / uSegs, v = j / vSegs;
      const p = fn(u, v);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
      normals.push(0, 1, 0); // 임시
    }
  }

  for (let i = 0; i < uSegs; i++) {
    for (let j = 0; j < vSegs; j++) {
      const a = i * (vSegs + 1) + j;
      const b = a + vSegs + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
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

  scene.add(new THREE.AmbientLight(0x334466, 3));
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);
  scene.add(new THREE.DirectionalLight(0x4466ff, 1.5).position.set(-5, 3, -3) && dirLight);
  const fillLight = new THREE.DirectionalLight(0x4466ff, 1.5);
  fillLight.position.set(-5, 3, -3);
  scene.add(fillLight);

  // ─── 튜브 (나선형 경로) ──────────────────────────────────
  const helixPath = (t) => new THREE.Vector3(
    Math.cos(t * Math.PI * 4) * 1.2,
    t * 4 - 2,
    Math.sin(t * Math.PI * 4) * 1.2
  );

  const tubeGeo = buildTube(helixPath, 120, 12, 0.18);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0x6366f1, roughness: 0.3, metalness: 0.5,
    side: THREE.DoubleSide,
  });
  const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
  tubeMesh.position.set(-5, 0, 0);
  scene.add(tubeMesh);

  // ─── 뫼비우스 띠 ─────────────────────────────────────────
  const mobiusGeo = buildMobius(120, 12, 0.8);
  const mobiusMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e, roughness: 0.2, metalness: 0.6,
    side: THREE.DoubleSide,
  });
  const mobiusMesh = new THREE.Mesh(mobiusGeo, mobiusMat);
  mobiusMesh.position.set(0, 0, 0);
  mobiusMesh.scale.setScalar(1.2);
  scene.add(mobiusMesh);

  // ─── 파라메트릭 곡면 (보이의 곡면 근사) ──────────────────
  //  Boy's Surface: 자기교차하는 사영평면의 3D 매립
  const boySurface = (u, v) => {
    const uu = u * Math.PI * 2;
    const vv = v * Math.PI;
    const cos_u = Math.cos(uu), sin_u = Math.sin(uu);
    const cos_v = Math.cos(vv), sin_v = Math.sin(vv);
    // 단순 트레포일 곡면으로 대체
    const r = 1 + 0.4 * Math.cos(3 * uu);
    return new THREE.Vector3(
      r * sin_v * cos_u,
      r * sin_v * sin_u,
      r * cos_v + 0.3 * Math.sin(2 * vv) * Math.cos(3 * uu)
    );
  };

  const paramGeo  = buildParametric(boySurface, 80, 40);
  const paramMat  = new THREE.MeshStandardMaterial({
    color: 0x10b981, roughness: 0.2, metalness: 0.5,
    side: THREE.DoubleSide,
  });
  const paramMesh = new THREE.Mesh(paramGeo, paramMat);
  paramMesh.position.set(5, 0, 0);
  paramMesh.scale.setScalar(1.5);
  scene.add(paramMesh);

  // ─── 와이어프레임 오버레이 ────────────────────────────────
  const wireMats = [tubeMat, mobiusMat, paramMat].map(mat => {
    const wm = new THREE.MeshBasicMaterial({
      color: 0xffffff, wireframe: true, transparent: true, opacity: 0.0,
    });
    return wm;
  });

  const wireFrames = [
    new THREE.Mesh(tubeGeo,   wireMats[0]),
    new THREE.Mesh(mobiusGeo, wireMats[1]),
    new THREE.Mesh(paramGeo,  wireMats[2]),
  ];
  wireFrames[0].position.copy(tubeMesh.position);
  wireFrames[1].position.copy(mobiusMesh.position);
  wireFrames[1].scale.copy(mobiusMesh.scale);
  wireFrames[2].position.copy(paramMesh.position);
  wireFrames[2].scale.copy(paramMesh.scale);
  wireFrames.forEach(w => scene.add(w));

  // 라벨
  [['나선형 튜브', -5], ['뫼비우스 띠', 0], ['파라메트릭 곡면', 5]].forEach(([text, x]) => {
    const s = makeLabel(text);
    s.position.set(x, -2.8, 0);
    scene.add(s);
  });

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'bufgeo-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto; min-width:240px;">
      <p><strong>커스텀 BufferGeometry</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <span>Wireframe</span>
        <input type="range" id="wire-opacity" min="0" max="1" step="0.05" value="0">
        <span id="wire-opacity-val">0.0</span>
      </label>

      <label class="pp-row" style="margin-top:4px;">
        <span>튜브 반지름</span>
        <input type="range" id="tube-radius" min="0.05" max="0.5" step="0.01" value="0.18">
        <span id="tube-radius-val">0.18</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        <span style="color:#818cf8">왼쪽</span>: 경로 함수 → 튜브<br>
        <span style="color:#fb7185">중앙</span>: 뫼비우스 띠<br>
        &nbsp;&nbsp;&nbsp;(한 면만 있는 도형)<br>
        <span style="color:#34d399">오른쪽</span>: 파라메트릭 곡면<br><br>
        모두 Float32Array +<br>
        BufferAttribute 로 직접 구성
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  document.getElementById('wire-opacity').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('wire-opacity-val').textContent = v.toFixed(2);
    wireMats.forEach(m => { m.opacity = v; });
  });

  document.getElementById('tube-radius').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('tube-radius-val').textContent = v.toFixed(2);
    // 튜브 재생성
    const newGeo = buildTube(helixPath, 120, 12, v);
    tubeMesh.geometry.dispose();
    tubeMesh.geometry = newGeo;
    wireFrames[0].geometry.dispose();
    wireFrames[0].geometry = newGeo;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    tubeMesh.rotation.y   = elapsed * 0.3;
    wireFrames[0].rotation.y = tubeMesh.rotation.y;

    mobiusMesh.rotation.y = elapsed * 0.4;
    mobiusMesh.rotation.x = Math.sin(elapsed * 0.3) * 0.2;
    wireFrames[1].rotation.copy(mobiusMesh.rotation);

    paramMesh.rotation.y  = elapsed * 0.35;
    paramMesh.rotation.x  = elapsed * 0.2;
    wireFrames[2].rotation.copy(paramMesh.rotation);

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
    [tubeGeo, mobiusGeo, paramGeo].forEach(g => g.dispose());
    [tubeMat, mobiusMat, paramMat, ...wireMats].forEach(m => m.dispose());
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 300; canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#64748b';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 150, 28);
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(2.8, 0.55, 1);
  return sprite;
}
