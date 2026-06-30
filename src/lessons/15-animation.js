// ══════════════════════════════════════════════════════════════
//  Module 15: 애니메이션 시스템
//
//  배울 것:
//    - AnimationMixer    : 오브젝트에 붙어 애니메이션을 재생하는 엔진
//    - AnimationClip     : 하나의 완성된 애니메이션 (이름 + 시간 + 트랙 배열)
//    - KeyframeTrack     : 특정 속성의 시간별 값 기록
//      ├ VectorKeyframeTrack     : position, scale 등 Vector3 속성
//      └ QuaternionKeyframeTrack : rotation (사원수) 속성
//    - AnimationAction   : 클립을 실제 재생하는 핸들 (play/pause/fadeIn/CrossFade)
//    - MorphTargetInfluence : 정점 위치를 보간해 모양 변형
//
//  PropertyBinding 경로 규칙:
//    - 믹서 루트 자신 → '.quaternion'
//    - 루트의 자식    → 'objectName.quaternion'  ← object.name 필드 사용
//    - UUID/인덱스 기반 경로는 지원하지 않음
//
//  피벗(Pivot) 패턴:
//    관절 회전 중심이 될 빈 Object3D를 부모로 두고
//    실제 메시(팔, 다리)를 자식으로 offset 배치.
//    피벗 회전 → 자식 메시 전체가 함께 회전.
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d1a);
  scene.fog = new THREE.Fog(0x0d0d1a, 18, 35);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 3, 10);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 2, 0);
  controls.minDistance = 4;
  controls.maxDistance = 20;

  // ─── 조명 ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x334466, 3));

  const keyLight = new THREE.DirectionalLight(0xffffff, 4);
  keyLight.position.set(5, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  scene.add(new THREE.DirectionalLight(0x4466aa, 1.5).position.set(-4, 3, -2) && keyLight);
  const fillLight = new THREE.DirectionalLight(0x4466aa, 1.5);
  fillLight.position.set(-4, 3, -2);
  scene.add(fillLight);

  // ─── 바닥 ─────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.9 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.GridHelper(20, 20, 0x223355, 0x1a2840));

  // ─── 재질 ─────────────────────────────────────────────────
  const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x4466cc, roughness: 0.3, metalness: 0.6 });
  const headMat  = new THREE.MeshStandardMaterial({ color: 0x5577dd, roughness: 0.3, metalness: 0.6 });
  const limbMat  = new THREE.MeshStandardMaterial({ color: 0x3355bb, roughness: 0.4, metalness: 0.5 });
  const eyeMat   = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 2 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x223399, roughness: 0.5, metalness: 0.7 });

  function mkBox(w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    return m;
  }
  function mkSphere(r, mat) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), mat);
    m.castShadow = true;
    return m;
  }
  function pivot(name) {
    // AnimationMixer는 .name 필드로 오브젝트를 식별
    const obj = new THREE.Object3D();
    obj.name = name;
    return obj;
  }

  // ─── 로봇 계층 구조 ───────────────────────────────────────
  //
  //  robot (Group, 믹서 루트)
  //  ├── torso
  //  ├── head  (name: 'head')
  //  ├── eyeL / eyeR
  //  ├── lShoulder (Object3D, name: 'lShoulder')  ← 왼쪽 어깨 피벗
  //  │   ├── upperArmL
  //  │   ├── elbowJointL
  //  │   └── lElbow (Object3D, name: 'lElbow')    ← 왼쪽 팔꿈치 피벗
  //  │       └── forearmL
  //  ├── rShoulder (name: 'rShoulder')
  //  │   └── ... (대칭)
  //  ├── lHip (name: 'lHip')                      ← 왼쪽 엉덩이 피벗
  //  │   ├── thighL
  //  │   ├── kneeJointL
  //  │   └── lKnee (name: 'lKnee')               ← 왼쪽 무릎 피벗
  //  │       ├── shinL
  //  │       └── footL
  //  └── rHip (name: 'rHip')
  //      └── ...
  //
  const robot = new THREE.Group();
  scene.add(robot);

  // 몸통 & 머리
  const torso = mkBox(1.0, 1.2, 0.6, bodyMat);
  torso.position.y = 2.4;
  robot.add(torso);

  const head = mkBox(0.7, 0.7, 0.6, headMat);
  head.name = 'head'; // idleHeadTrack 에서 'head.quaternion' 으로 접근
  head.position.y = 3.55;
  robot.add(head);

  const eyeL = mkSphere(0.09, eyeMat);
  eyeL.position.set(-0.15, 0.1, 0.31);
  head.add(eyeL); // 눈은 head의 자식 → head 회전 시 같이 움직임

  const eyeR = mkSphere(0.09, eyeMat);
  eyeR.position.set(0.15, 0.1, 0.31);
  head.add(eyeR);

  // ── 왼쪽 팔 ─────────────────────────────────────────────
  //  lShoulder 피벗 위치: 어깨 관절 (robot 기준 좌표)
  //  자식 메시는 피벗 로컬 좌표로 배치
  const lShoulder = pivot('lShoulder');
  lShoulder.position.set(-0.65, 3.0, 0);
  robot.add(lShoulder);

  const upperArmL = mkBox(0.28, 0.7, 0.28, limbMat);
  upperArmL.position.y = -0.65; // 어깨에서 아래로
  lShoulder.add(upperArmL);

  const elbowJointL = mkSphere(0.14, jointMat);
  elbowJointL.position.y = -1.0;
  lShoulder.add(elbowJointL);

  const lElbow = pivot('lElbow');
  lElbow.position.y = -1.0; // 어깨 피벗 기준
  lShoulder.add(lElbow);

  const forearmL = mkBox(0.22, 0.6, 0.22, limbMat);
  forearmL.position.y = -0.3;
  lElbow.add(forearmL);

  // ── 오른쪽 팔 ────────────────────────────────────────────
  const rShoulder = pivot('rShoulder');
  rShoulder.position.set(0.65, 3.0, 0);
  robot.add(rShoulder);

  const upperArmR = mkBox(0.28, 0.7, 0.28, limbMat);
  upperArmR.position.y = -0.65;
  rShoulder.add(upperArmR);

  const elbowJointR = mkSphere(0.14, jointMat);
  elbowJointR.position.y = -1.0;
  rShoulder.add(elbowJointR);

  const rElbow = pivot('rElbow');
  rElbow.position.y = -1.0;
  rShoulder.add(rElbow);

  const forearmR = mkBox(0.22, 0.6, 0.22, limbMat);
  forearmR.position.y = -0.3;
  rElbow.add(forearmR);

  // ── 왼쪽 다리 ────────────────────────────────────────────
  const lHip = pivot('lHip');
  lHip.position.set(-0.3, 1.8, 0);
  robot.add(lHip);

  const thighL = mkBox(0.28, 0.75, 0.28, limbMat);
  thighL.position.y = -0.4;
  lHip.add(thighL);

  const kneeJointL = mkSphere(0.14, jointMat);
  kneeJointL.position.y = -0.8;
  lHip.add(kneeJointL);

  const lKnee = pivot('lKnee');
  lKnee.position.y = -0.8;
  lHip.add(lKnee);

  const shinL = mkBox(0.22, 0.7, 0.22, limbMat);
  shinL.position.y = -0.35;
  lKnee.add(shinL);

  const footL = mkBox(0.3, 0.15, 0.45, limbMat);
  footL.position.set(0, -0.72, 0.08);
  lKnee.add(footL);

  // ── 오른쪽 다리 ──────────────────────────────────────────
  const rHip = pivot('rHip');
  rHip.position.set(0.3, 1.8, 0);
  robot.add(rHip);

  const thighR = mkBox(0.28, 0.75, 0.28, limbMat);
  thighR.position.y = -0.4;
  rHip.add(thighR);

  const kneeJointR = mkSphere(0.14, jointMat);
  kneeJointR.position.y = -0.8;
  rHip.add(kneeJointR);

  const rKnee = pivot('rKnee');
  rKnee.position.y = -0.8;
  rHip.add(rKnee);

  const shinR = mkBox(0.22, 0.7, 0.22, limbMat);
  shinR.position.y = -0.35;
  rKnee.add(shinR);

  const footR = mkBox(0.3, 0.15, 0.45, limbMat);
  footR.position.set(0, -0.72, 0.08);
  rKnee.add(footR);

  // ─── AnimationMixer ───────────────────────────────────────
  //
  //  mixer 루트 = robot.
  //  트랙 경로 예시:
  //    '.'           → robot 자신의 속성
  //    'head'        → robot의 자식 중 name='head' 인 것
  //    'lShoulder'   → robot의 자손 중 name='lShoulder' 인 것
  //  경로 전체: 'objectName.propertyName'
  //
  const mixer = new THREE.AnimationMixer(robot);

  // 오일러 → 사원수 배열 헬퍼
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  function qArr(rx, ry, rz) {
    _q.setFromEuler(_e.set(rx, ry, rz));
    return [_q.x, _q.y, _q.z, _q.w];
  }

  // ── Walk 클립 ─────────────────────────────────────────────
  const W = 0.8; // 보행 사이클 시간(초)

  const walkClip = new THREE.AnimationClip('walk', W, [
    // 왼쪽 어깨
    new THREE.QuaternionKeyframeTrack('lShoulder.quaternion',
      [0, W*0.25, W*0.5, W*0.75, W],
      [...qArr(-0.4,0,0), ...qArr(0,0,0), ...qArr(0.4,0,0), ...qArr(0,0,0), ...qArr(-0.4,0,0)]
    ),
    // 오른쪽 어깨 (반대 위상)
    new THREE.QuaternionKeyframeTrack('rShoulder.quaternion',
      [0, W*0.25, W*0.5, W*0.75, W],
      [...qArr(0.4,0,0), ...qArr(0,0,0), ...qArr(-0.4,0,0), ...qArr(0,0,0), ...qArr(0.4,0,0)]
    ),
    // 팔꿈치 살짝 굽힘
    new THREE.QuaternionKeyframeTrack('lElbow.quaternion',
      [0, W*0.5, W],
      [...qArr(0.3,0,0), ...qArr(0.5,0,0), ...qArr(0.3,0,0)]
    ),
    new THREE.QuaternionKeyframeTrack('rElbow.quaternion',
      [0, W*0.5, W],
      [...qArr(0.5,0,0), ...qArr(0.3,0,0), ...qArr(0.5,0,0)]
    ),
    // 왼쪽 엉덩이
    new THREE.QuaternionKeyframeTrack('lHip.quaternion',
      [0, W*0.5, W],
      [...qArr(0.35,0,0), ...qArr(-0.35,0,0), ...qArr(0.35,0,0)]
    ),
    // 오른쪽 엉덩이 (반대 위상)
    new THREE.QuaternionKeyframeTrack('rHip.quaternion',
      [0, W*0.5, W],
      [...qArr(-0.35,0,0), ...qArr(0.35,0,0), ...qArr(-0.35,0,0)]
    ),
    // 무릎 (착지 시 굽힘)
    new THREE.QuaternionKeyframeTrack('lKnee.quaternion',
      [0, W*0.25, W*0.5, W*0.75, W],
      [...qArr(0,0,0), ...qArr(0.3,0,0), ...qArr(0,0,0), ...qArr(0.3,0,0), ...qArr(0,0,0)]
    ),
    new THREE.QuaternionKeyframeTrack('rKnee.quaternion',
      [0, W*0.25, W*0.5, W*0.75, W],
      [...qArr(0.3,0,0), ...qArr(0,0,0), ...qArr(0.3,0,0), ...qArr(0,0,0), ...qArr(0.3,0,0)]
    ),
    // 몸통 좌우 흔들림 (루트 자신 = '.quaternion')
    new THREE.QuaternionKeyframeTrack('.quaternion',
      [0, W*0.25, W*0.5, W*0.75, W],
      [...qArr(0,0,0.03), ...qArr(0,0,0), ...qArr(0,0,-0.03), ...qArr(0,0,0), ...qArr(0,0,0.03)]
    ),
  ]);

  // ── Idle 클립 ─────────────────────────────────────────────
  const idleClip = new THREE.AnimationClip('idle', 4.0, [
    new THREE.QuaternionKeyframeTrack('.quaternion',
      [0, 2.0, 4.0],
      [...qArr(0,0.03,0), ...qArr(0,-0.03,0), ...qArr(0,0.03,0)]
    ),
    new THREE.QuaternionKeyframeTrack('head.quaternion',
      [0, 2.0, 4.0],
      [...qArr(0,0.15,0), ...qArr(0,-0.15,0), ...qArr(0,0.15,0)]
    ),
  ]);

  // ── Wave 클립 ─────────────────────────────────────────────
  const waveClip = new THREE.AnimationClip('wave', 2.0, [
    new THREE.QuaternionKeyframeTrack('rShoulder.quaternion',
      [0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.0],
      [
        ...qArr(0,0,0),
        ...qArr(-1.3, 0, -0.5),
        ...qArr(-1.3, 0, -0.7),
        ...qArr(-1.3, 0, -0.4),
        ...qArr(-1.3, 0, -0.7),
        ...qArr(-1.3, 0, -0.4),
        ...qArr(0, 0, 0),
      ]
    ),
  ]);

  // ── Action 생성 ──────────────────────────────────────────
  const idleAction = mixer.clipAction(idleClip);
  const walkAction = mixer.clipAction(walkClip);
  const waveAction = mixer.clipAction(waveClip);

  walkAction.loop = THREE.LoopRepeat;
  waveAction.loop = THREE.LoopOnce;
  waveAction.clampWhenFinished = true;

  let currentAction = idleAction;
  idleAction.play();

  // ─── Morph Target 데모 ────────────────────────────────────
  //
  //  같은 정점 수의 "변형 정점 배열"을 morphAttributes.position 에 등록.
  //  morphTargetInfluences[i] = 0.0~1.0 가중치로 기본 ↔ 변형 사이를 보간.
  //
  const morphGeo = new THREE.SphereGeometry(0.8, 32, 32);
  const basePos  = morphGeo.attributes.position.array.slice();
  const vCount   = morphGeo.attributes.position.count;

  // Morph 1: 스파이크 — 정점을 법선 방향으로 랜덤하게 밀어냄
  const spikePos = new Float32Array(vCount * 3);
  const _n = new THREE.Vector3();
  for (let i = 0; i < vCount; i++) {
    _n.set(basePos[i*3], basePos[i*3+1], basePos[i*3+2]).normalize();
    const push = 0.3 + Math.random() * 0.5;
    spikePos[i*3  ] = basePos[i*3  ] + _n.x * push;
    spikePos[i*3+1] = basePos[i*3+1] + _n.y * push;
    spikePos[i*3+2] = basePos[i*3+2] + _n.z * push;
  }

  // Morph 2: 납작 — Y축 압축, XZ 확대
  const flatPos = new Float32Array(vCount * 3);
  for (let i = 0; i < vCount; i++) {
    flatPos[i*3  ] = basePos[i*3  ] * 1.6;
    flatPos[i*3+1] = basePos[i*3+1] * 0.25;
    flatPos[i*3+2] = basePos[i*3+2] * 1.6;
  }

  morphGeo.morphAttributes.position = [
    new THREE.Float32BufferAttribute(spikePos, 3),
    new THREE.Float32BufferAttribute(flatPos,  3),
  ];
  morphGeo.morphTargetsRelative = false;

  const morphMat  = new THREE.MeshStandardMaterial({ color: 0xff6644, roughness: 0.4, metalness: 0.3 });
  const morphMesh = new THREE.Mesh(morphGeo, morphMat);
  morphMesh.morphTargetInfluences = [0, 0];
  morphMesh.castShadow = true;
  morphMesh.position.set(4, 1.5, 0);
  scene.add(morphMesh);

  const labelSprite = makeLabel('Morph Targets');
  labelSprite.position.set(4, 3, 0);
  scene.add(labelSprite);

  // ─── UI 패널 ─────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'anim-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>애니메이션 시스템</strong></p>
      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;margin-bottom:8px">AnimationMixer 클립</p>
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
        <button class="anim-btn active" data-clip="idle">Idle</button>
        <button class="anim-btn" data-clip="walk">Walk</button>
        <button class="anim-btn" data-clip="wave">Wave</button>
      </div>
      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;margin-bottom:8px">Morph Target 영향도 (오른쪽 구체)</p>
      <label class="pp-row">
        <span>Spike</span>
        <input type="range" id="morph-spike" min="0" max="1" step="0.01" value="0">
        <span id="morph-spike-val">0.00</span>
      </label>
      <label class="pp-row">
        <span>Flat</span>
        <input type="range" id="morph-flat" min="0" max="1" step="0.01" value="0">
        <span id="morph-flat-val">0.00</span>
      </label>
      <hr style="border-color:#334155;margin:8px 0">
      <label class="pp-row">
        <span>재생 속도</span>
        <input type="range" id="anim-speed" min="0.1" max="3" step="0.1" value="1">
        <span id="anim-speed-val">1.0</span>
      </label>
    </div>
  `;
  document.body.appendChild(ui);

  const btnStyle = document.createElement('style');
  btnStyle.id = 'anim-btn-style';
  btnStyle.textContent = `
    .anim-btn {
      padding:5px 12px; border-radius:6px; border:1px solid rgba(99,102,241,0.3);
      background:rgba(99,102,241,0.1); color:#a5b4fc; cursor:pointer;
      font-size:12px; transition:background 0.15s;
    }
    .anim-btn:hover  { background:rgba(99,102,241,0.25); }
    .anim-btn.active { background:rgba(99,102,241,0.35); border-color:#6366f1; color:#e0e7ff; }
  `;
  document.head.appendChild(btnStyle);

  // 클립 전환 (crossFadeTo: duration 동안 두 클립 weight 교차)
  const actionMap = { idle: idleAction, walk: walkAction, wave: waveAction };

  function switchClip(name) {
    const next = actionMap[name];
    if (next === currentAction) return;
    next.reset().play();
    currentAction.crossFadeTo(next, 0.4, true);
    currentAction = next;

    if (name === 'wave') {
      mixer.addEventListener('finished', function onDone(e) {
        if (e.action !== waveAction) return;
        mixer.removeEventListener('finished', onDone);
        switchClip('idle');
        document.querySelectorAll('.anim-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.clip === 'idle');
        });
      });
    }
  }

  document.querySelectorAll('.anim-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.anim-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchClip(btn.dataset.clip);
    });
  });

  const bindSlider = (id, valId, cb) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      document.getElementById(valId).textContent = v.toFixed(2);
      cb(v);
    });
  };
  bindSlider('morph-spike', 'morph-spike-val', v => { morphMesh.morphTargetInfluences[0] = v; });
  bindSlider('morph-flat',  'morph-flat-val',  v => { morphMesh.morphTargetInfluences[1] = v; });
  bindSlider('anim-speed',  'anim-speed-val',  v => { mixer.timeScale = v; });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    // ★ mixer.update(delta) — 매 프레임 호출해야 KeyframeTrack 값이 오브젝트에 적용됨
    mixer.update(timer.getDelta());
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ─── 창 크기 대응 ─────────────────────────────────────────
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ─── cleanup ──────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    mixer.stopAllAction();
    mixer.uncacheRoot(robot);
    document.body.removeChild(ui);
    document.head.removeChild(btnStyle);

    [bodyMat, headMat, limbMat, eyeMat, jointMat, morphMat, floorMat].forEach(m => m.dispose());
    morphGeo.dispose();
    floorGeo.dispose();
    scene.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#94a3b8';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 160, 38);
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(2.5, 0.6, 1);
  return sprite;
}
