// ══════════════════════════════════════════════════════════════
//  Module 27: SkinnedMesh / Bone (뼈대 기반 애니메이션)
//
//  배울 것:
//    - Bone        : 뼈대 계층 구조 — 부모 뼈가 움직이면 자식도 따라감
//    - Skeleton    : Bone 배열을 묶어 SkinnedMesh에 연결
//    - SkinnedMesh : 각 정점이 여러 뼈에 가중치로 묶인 메시
//    - skinIndex / skinWeight : 정점마다 영향받는 뼈 인덱스 + 비율
//    - AnimationMixer + KeyframeTrack : 뼈 회전 키프레임 애니메이션
//
//  스키닝(Skinning) 원리:
//    정점 최종 위치 = Σ (뼈[i].transform × 정점위치 × 가중치[i])
//    → 정점이 여러 뼈에 "붙어" 있어 뼈가 움직이면 메시가 자연스럽게 변형
//
//  Bone vs Pivot(Object3D):
//    Pivot  : 메시를 통째로 이동 — 변형 없음
//    Bone   : 메시 내부 정점을 변형 — 피부처럼 구부러짐
//
//  실제 게임 캐릭터:
//    GLB 파일에 Skeleton + Bone 데이터 포함
//    → 이 레슨에서는 직접 Bone을 코드로 생성해 원리 이해
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── 뼈대 + SkinnedMesh 생성 ──────────────────────────────────
//  단순한 팔(cylinder) 형태: 루트 → 상완 → 하완 → 손
function buildArm(segH, radius) {
  const SEGS_Y  = 12;   // 세로 분할 수 (많을수록 구부러짐이 부드러움)
  const SEGS_R  = 10;   // 원형 분할 수

  // ── Geometry ──────────────────────────────────────────────
  const geo = new THREE.CylinderGeometry(radius, radius, segH * 3, SEGS_R, SEGS_Y, true);

  // skinIndex, skinWeight 배열 초기화
  const posArr    = geo.attributes.position;
  const count     = posArr.count;
  const skinIdx   = new Uint16Array(count * 4);   // 정점당 최대 4개 뼈
  const skinWgt   = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const y = posArr.getY(i); // 정점의 Y 좌표 (0 ~ segH*3)
    // Y 위치에 따라 어느 뼈에 묶을지 결정
    // 뼈 0 = 루트(바닥), 뼈 1 = 상완, 뼈 2 = 하완
    const t = (y + segH * 1.5) / (segH * 3); // 0(하단) ~ 1(상단)

    if (t < 0.33) {
      // 하단: 뼈0 100%
      skinIdx[i * 4] = 0; skinWgt[i * 4] = 1;
    } else if (t < 0.5) {
      // 하단↔중단 경계: 뼈0↔뼈1 블렌딩
      const f = (t - 0.33) / 0.17;
      skinIdx[i * 4]     = 0; skinWgt[i * 4]     = 1 - f;
      skinIdx[i * 4 + 1] = 1; skinWgt[i * 4 + 1] = f;
    } else if (t < 0.67) {
      // 중단: 뼈1 100%
      skinIdx[i * 4] = 1; skinWgt[i * 4] = 1;
    } else if (t < 0.83) {
      // 중단↔상단 경계: 뼈1↔뼈2 블렌딩
      const f = (t - 0.67) / 0.16;
      skinIdx[i * 4]     = 1; skinWgt[i * 4]     = 1 - f;
      skinIdx[i * 4 + 1] = 2; skinWgt[i * 4 + 1] = f;
    } else {
      // 상단: 뼈2 100%
      skinIdx[i * 4] = 2; skinWgt[i * 4] = 1;
    }
  }

  geo.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(skinIdx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWgt, 4));

  // ── Bone 계층 ──────────────────────────────────────────────
  //  bone0 (루트, 바닥 중심)
  //    └ bone1 (상완, Y = segH 위)
  //        └ bone2 (하완, Y = segH 위)
  const bone0 = new THREE.Bone(); bone0.name = 'root';
  const bone1 = new THREE.Bone(); bone1.name = 'upper';
  const bone2 = new THREE.Bone(); bone2.name = 'lower';

  bone0.position.y = -segH * 1.5; // 메시 하단에 루트
  bone1.position.y =  segH;        // 상완 관절
  bone2.position.y =  segH;        // 하완 관절

  bone0.add(bone1);
  bone1.add(bone2);

  const skeleton = new THREE.Skeleton([bone0, bone1, bone2]);

  const mat  = new THREE.MeshStandardMaterial({
    color: 0x6366f1, roughness: 0.4, metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(bone0);          // 루트 뼈를 메시에 부착
  mesh.bind(skeleton);      // Skeleton 연결

  return { mesh, bone0, bone1, bone2, skeleton };
}

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 2, 12);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);

  scene.add(new THREE.AmbientLight(0x334466, 4));
  const dir = new THREE.DirectionalLight(0xffffff, 3);
  dir.position.set(5, 8, 5);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0x4466ff, 1.5);
  fill.position.set(-5, 3, -3);
  scene.add(fill);

  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ─── 팔 SkinnedMesh 3개 ────────────────────────────────────
  const SEG_H = 1.2, RADIUS = 0.25;
  const arms  = [];

  const configs = [
    { x: -3.5, color: 0x6366f1, label: 'Manual\n(수동 제어)' },
    { x:  0,   color: 0x10b981, label: 'AnimationMixer\n(키프레임)' },
    { x:  3.5, color: 0xf43f5e, label: 'Procedural\n(절차적)' },
  ];

  configs.forEach(({ x, color, label }) => {
    const { mesh, bone0, bone1, bone2, skeleton } = buildArm(SEG_H, RADIUS);
    mesh.material = new THREE.MeshStandardMaterial({
      color, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide,
    });
    mesh.position.set(x, SEG_H * 1.5, 0);
    scene.add(mesh);

    // SkeletonHelper: 뼈대를 선으로 시각화
    const helper = new THREE.SkeletonHelper(mesh);
    scene.add(helper);

    // 라벨
    const sprite = makeLabel(label);
    sprite.position.set(x, SEG_H * 3 + 0.8, 0);
    scene.add(sprite);

    arms.push({ mesh, bone0, bone1, bone2, skeleton, x });
  });

  // ─── AnimationMixer 설정 (중앙 팔) ───────────────────────
  const [armManual, armMixer, armProcedural] = arms;

  const mixer = new THREE.AnimationMixer(armMixer.mesh);

  // 상완 굽힘 KeyframeTrack
  const upperTrack = new THREE.QuaternionKeyframeTrack(
    'upper.quaternion',
    [0, 1, 2],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray(),
    ]
  );
  const lowerTrack = new THREE.QuaternionKeyframeTrack(
    'lower.quaternion',
    [0, 0.5, 1, 1.5, 2],
    [
      ...new THREE.Quaternion().toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 3)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 3)).toArray(),
      ...new THREE.Quaternion().toArray(),
    ]
  );

  const clip   = new THREE.AnimationClip('bend', 2, [upperTrack, lowerTrack]);
  const action = mixer.clipAction(clip);
  action.play();

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'skin-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>SkinnedMesh / Bone</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#818cf8;font-size:11px;margin-bottom:4px">왼쪽 — 수동 제어</p>
      <label class="pp-row">
        <span>상완 각도</span>
        <input type="range" id="upper-rot" min="-90" max="0" value="0">
        <span id="upper-rot-val">0°</span>
      </label>
      <label class="pp-row">
        <span>하완 각도</span>
        <input type="range" id="lower-rot" min="-90" max="0" value="0">
        <span id="lower-rot-val">0°</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#34d399;font-size:11px;margin-bottom:4px">중앙 — AnimationMixer 자동</p>
      <label class="pp-row">
        <span>재생 속도</span>
        <input type="range" id="mix-speed" min="0.1" max="3" step="0.1" value="1">
        <span id="mix-speed-val">1.0x</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#fb7185;font-size:11px;margin-bottom:4px">오른쪽 — 절차적(sin 파형)</p>
      <label class="pp-row">
        <span>진폭</span>
        <input type="range" id="proc-amp" min="0" max="1" step="0.05" value="0.5">
        <span id="proc-amp-val">0.50</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <label class="pp-row">
        <span>뼈대 헬퍼</span>
        <input type="checkbox" id="helper-toggle" checked>
      </label>
    </div>
  `;
  document.body.appendChild(ui);

  document.getElementById('upper-rot').addEventListener('input', e => {
    const deg = parseInt(e.target.value);
    document.getElementById('upper-rot-val').textContent = deg + '°';
    armManual.bone1.rotation.z = THREE.MathUtils.degToRad(deg);
  });
  document.getElementById('lower-rot').addEventListener('input', e => {
    const deg = parseInt(e.target.value);
    document.getElementById('lower-rot-val').textContent = deg + '°';
    armManual.bone2.rotation.z = THREE.MathUtils.degToRad(deg);
  });
  document.getElementById('mix-speed').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('mix-speed-val').textContent = v.toFixed(1) + 'x';
    action.timeScale = v;
  });

  let procAmp = 0.5;
  document.getElementById('proc-amp').addEventListener('input', e => {
    procAmp = parseFloat(e.target.value);
    document.getElementById('proc-amp-val').textContent = procAmp.toFixed(2);
  });

  // SkeletonHelper 토글 — scene 내 모든 SkeletonHelper
  const helpers = scene.children.filter(c => c instanceof THREE.SkeletonHelper);
  document.getElementById('helper-toggle').addEventListener('change', e => {
    helpers.forEach(h => { h.visible = e.target.checked; });
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta   = timer.getDelta();
    const elapsed = timer.getElapsed();

    // AnimationMixer 업데이트
    mixer.update(delta);

    // 절차적 뼈 회전 (sin 파형)
    armProcedural.bone1.rotation.z = Math.sin(elapsed * 1.5) * Math.PI * 0.4 * procAmp;
    armProcedural.bone2.rotation.z = Math.sin(elapsed * 2.0 + 0.5) * Math.PI * 0.35 * procAmp;

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
    mixer.stopAllAction();
    arms.forEach(({ mesh, skeleton }) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      skeleton.dispose();
    });
    floorGeo.dispose(); floorMat.dispose();
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 300; canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#94a3b8';
  ctx.font = '17px sans-serif';
  ctx.textAlign = 'center';
  text.split('\n').forEach((line, i) => ctx.fillText(line, 150, 24 + i * 28));
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(2.8, 0.75, 1);
  return sprite;
}
