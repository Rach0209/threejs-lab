// ══════════════════════════════════════════════════════════════
//  Module 22: Sprite / Billboard
//
//  배울 것:
//    - THREE.Sprite      : 항상 카메라를 향하는 2D 평면 오브젝트
//    - SpriteMaterial    : Sprite 전용 재질 (map, color, opacity)
//    - Billboard 패턴    : HUD, 이름표, 체력바, 아이콘 등에 활용
//    - CanvasTexture     : JS Canvas API로 동적 텍스처 생성
//    - sizeAttenuation   : false → 거리와 무관하게 일정 크기 유지
//    - 아틀라스(Atlas)   : 한 텍스처에 여러 프레임 → 스프라이트 애니메이션
//
//  Sprite vs Mesh:
//    Mesh   — 3D 공간에 고정, 카메라 각도에 따라 변형됨
//    Sprite — 항상 카메라 정면을 향해 자동 회전 (빌보드)
//
//  활용 사례:
//    - 게임 체력바 / 이름표 (항상 플레이어 앞에 보임)
//    - 파티클 이펙트 (폭발, 연기, 불꽃)
//    - 미니맵 아이콘, 웨이포인트 마커
//    - 멀리 있는 나무·건물을 Sprite로 대체 (LOD 극단적 단계)
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── Canvas로 텍스처 생성 헬퍼들 ─────────────────────────────

function makeCircleTexture(color, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0,   color);
  grad.addColorStop(0.5, color);
  grad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeIconTexture(emoji, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = `${size * 0.65}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2);
  return new THREE.CanvasTexture(canvas);
}

function makeBarTexture(ratio, fg = '#22c55e', bg = '#1e293b', size = 256) {
  // ratio: 0.0 ~ 1.0 (체력 비율)
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size / 4;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, size, size / 4, 4);
  ctx.fill();
  if (ratio > 0) {
    ctx.fillStyle = fg;
    ctx.roundRect(2, 2, (size - 4) * ratio, size / 4 - 4, 3);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function makeLabelTexture(text, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size / 3;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.roundRect(0, 0, size, size / 3, 8);
  ctx.fill();
  ctx.fillStyle = '#f1f5f9';
  ctx.font = `bold ${size * 0.22}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 6);
  return new THREE.CanvasTexture(canvas);
}

// ─── 스프라이트 애니메이션 아틀라스 ──────────────────────────
//  한 텍스처에 여러 프레임을 배치하고 offset/repeat으로 특정 프레임 표시
function makeAtlasTexture(cols, rows, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cellW = size / cols, cellH = size / rows;
  const colors = ['#f43f5e','#f59e0b','#10b981','#6366f1','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      ctx.fillStyle = colors[idx % colors.length];
      ctx.beginPath();
      const cx = c * cellW + cellW / 2, cy = r * cellH + cellH / 2;
      const radius = Math.min(cellW, cellH) * 0.4 * (0.5 + 0.5 * Math.sin(idx));
      ctx.arc(cx, cy, Math.max(radius, cellW * 0.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${cellH * 0.3}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(idx.toString(), cx, cy);
    }
  }
  return new THREE.CanvasTexture(canvas);
}

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 3, 12);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);

  scene.add(new THREE.AmbientLight(0x334466, 3));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  // 바닥
  const floorGeo = new THREE.PlaneGeometry(30, 30);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const textures = []; // cleanup용

  // ─── 섹션 1: 기본 Sprite 빌보드 ──────────────────────────
  //
  //  Sprite는 별도 Geometry 없이 SpriteMaterial만으로 생성.
  //  카메라가 어디 있어도 항상 정면을 향함.
  //
  const circleColors = ['#f43f5e','#f59e0b','#10b981','#6366f1','#8b5cf6'];
  circleColors.forEach((color, i) => {
    const tex  = makeCircleTexture(color);
    textures.push(tex);
    const mat  = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(-5 + i * 2.5, 2.5, -4);
    sprite.scale.set(1.2, 1.2, 1);
    scene.add(sprite);
  });

  // ─── 섹션 2: 이모지 아이콘 ───────────────────────────────
  const emojis = ['🔥','⚡','💎','🎯','🚀'];
  emojis.forEach((emoji, i) => {
    const tex    = makeIconTexture(emoji);
    textures.push(tex);
    const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(-5 + i * 2.5, 2.5, -2);
    sprite.scale.set(1.0, 1.0, 1);
    scene.add(sprite);
  });

  // ─── 섹션 3: 3D 오브젝트 + 이름표 + 체력바 ──────────────
  //
  //  게임에서 흔히 쓰는 패턴:
  //  3D 메시 위에 Sprite로 이름표와 체력바 부착
  //
  const characters = [
    { name: 'Knight',   hp: 0.9,  color: 0x6366f1, pos: [-3, 0, 0] },
    { name: 'Archer',   hp: 0.45, color: 0x10b981, pos: [ 0, 0, 0] },
    { name: 'Mage',     hp: 0.15, color: 0xf43f5e, pos: [ 3, 0, 0] },
  ];

  const hpBars = [];

  characters.forEach(({ name, hp, color, pos }) => {
    // 3D 캐릭터 (간단한 캡슐 표현)
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16);
    const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const mat     = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });

    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.set(...pos);
    body.position.y = 0.5;
    scene.add(body);

    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(pos[0], 1.3, pos[2]);
    scene.add(head);

    // 이름표 Sprite
    const labelTex = makeLabelTexture(name);
    textures.push(labelTex);
    const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
    const label    = new THREE.Sprite(labelMat);
    label.position.set(pos[0], 2.1, pos[2]);
    label.scale.set(2.0, 0.6, 1);
    scene.add(label);

    // 체력바 Sprite
    const hpColor = hp > 0.6 ? '#22c55e' : hp > 0.3 ? '#f59e0b' : '#ef4444';
    const barTex  = makeBarTexture(hp, hpColor);
    textures.push(barTex);
    const barMat  = new THREE.SpriteMaterial({ map: barTex, transparent: true });
    const bar     = new THREE.Sprite(barMat);
    bar.position.set(pos[0], 1.75, pos[2]);
    bar.scale.set(1.8, 0.25, 1);
    scene.add(bar);

    hpBars.push({ bar, barMat, barTex, hp: hp, name });
  });

  // ─── 섹션 4: 아틀라스 스프라이트 애니메이션 ─────────────
  //
  //  texture.offset + texture.repeat으로 아틀라스의 특정 프레임 선택.
  //  매 프레임 offset을 이동해 애니메이션 효과.
  //
  const ATLAS_COLS = 4, ATLAS_ROWS = 2;
  const atlasTex = makeAtlasTexture(ATLAS_COLS, ATLAS_ROWS);
  textures.push(atlasTex);

  // repeat: 한 프레임 크기 (전체 텍스처의 1/cols, 1/rows)
  atlasTex.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);

  const atlasMat    = new THREE.SpriteMaterial({ map: atlasTex, transparent: true });
  const atlasSprite = new THREE.Sprite(atlasMat);
  atlasSprite.position.set(5.5, 2, 0);
  atlasSprite.scale.set(2.5, 1.5, 1);
  scene.add(atlasSprite);

  // 아틀라스 라벨
  const atlasLabel = makeLabel('Atlas Animation');
  atlasLabel.position.set(5.5, 3.3, 0);
  scene.add(atlasLabel);
  textures.push(atlasLabel.material.map);

  // ─── sizeAttenuation 비교 ────────────────────────────────
  //  sizeAttenuation: false → 거리에 무관하게 화면 크기 일정 (HUD 마커)
  const markerTex = makeIconTexture('📍');
  textures.push(markerTex);

  const worldMarker = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: markerTex, transparent: true, sizeAttenuation: true })
  );
  worldMarker.position.set(-6, 1, 0);
  worldMarker.scale.set(1, 1, 1);
  scene.add(worldMarker);

  const hudMarker = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: markerTex, transparent: true, sizeAttenuation: false })
  );
  hudMarker.position.set(-4, 1, 0);
  hudMarker.scale.set(0.06, 0.06, 1); // sizeAttenuation:false는 화면 픽셀 기준
  scene.add(hudMarker);

  // 비교 라벨
  ['sizeAttenuation\ntrue', 'sizeAttenuation\nfalse'].forEach((t, i) => {
    const s = makeLabel(t.replace('\n', ' '));
    s.position.set(-6 + i * 2, 2.2, 0);
    scene.add(s);
    textures.push(s.material.map);
  });

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'sprite-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto; min-width:240px;">
      <p><strong>Sprite / Billboard</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:8px">
        카메라 회전해도 모든 Sprite가<br>항상 정면을 향하는지 확인
      </p>

      <label class="pp-row">
        <span>애니메이션 FPS</span>
        <input type="range" id="atlas-fps" min="1" max="24" step="1" value="8">
        <span id="atlas-fps-val">8</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.8">
        맨 위 행: 원형 Sprite<br>
        둘째 행: 이모지 Sprite<br>
        중앙: 이름표+체력바 패턴<br>
        우측: 아틀라스 애니메이션<br>
        좌측: sizeAttenuation 비교
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  let atlasFps = 8;
  document.getElementById('atlas-fps').addEventListener('input', e => {
    atlasFps = parseInt(e.target.value);
    document.getElementById('atlas-fps-val').textContent = atlasFps;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 아틀라스 프레임 전환
    const totalFrames = ATLAS_COLS * ATLAS_ROWS;
    const frame = Math.floor(elapsed * atlasFps) % totalFrames;
    const col   = frame % ATLAS_COLS;
    const row   = ATLAS_ROWS - 1 - Math.floor(frame / ATLAS_COLS); // UV Y 반전
    atlasTex.offset.set(col / ATLAS_COLS, row / ATLAS_ROWS);
    atlasTex.needsUpdate = true;

    // 체력바 맥동 (Mage HP 깜빡임)
    hpBars.forEach(({ bar }, i) => {
      if (i === 2) bar.material.opacity = 0.6 + 0.4 * Math.abs(Math.sin(elapsed * 3));
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
    textures.forEach(t => t?.dispose());
    floorGeo.dispose(); floorMat.dispose();
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 280; canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#64748b';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 140, 28);
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(2.5, 0.5, 1);
  return sprite;
}
