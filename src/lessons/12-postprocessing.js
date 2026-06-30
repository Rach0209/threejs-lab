// ══════════════════════════════════════════════════════════════
//  Module 12: 후처리 효과 (Post-Processing)
//
//  배울 것:
//    - EffectComposer : 후처리 파이프라인 관리자
//    - RenderPass     : 기본 씬 렌더링 (파이프라인의 첫 단계)
//    - UnrealBloomPass: 빛이 번지는 블룸(Bloom) 효과
//    - FilmPass       : 필름 노이즈·스캔라인 효과
//    - OutputPass     : 최종 색공간 변환 (sRGB 출력)
//
//  후처리란?
//    일반 렌더링은 씬 → 화면(canvas)으로 직접 출력합니다.
//    후처리는 씬 → 텍스처(RenderTarget)에 먼저 그린 뒤
//    그 텍스처에 효과(Pass)를 겹겹이 적용한 후 최종 출력합니다.
//
//    [씬 렌더링] → RenderPass → BloomPass → FilmPass → OutputPass → 화면
//
//  핵심 개념:
//    - RenderTarget: GPU 메모리의 텍스처에 렌더링 (화면 대신)
//    - Pass: 텍스처를 받아 효과를 적용하고 다음 Pass에 넘기는 단계
//    - Composer: 여러 Pass를 순서대로 실행하는 파이프라인
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ── 후처리 관련 모듈 (three/examples/jsm/postprocessing) ─────
//  Three.js에 내장된 예제 모듈이라 별도 패키지 설치 불필요
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass }       from 'three/examples/jsm/postprocessing/FilmPass.js';
import { OutputPass }     from 'three/examples/jsm/postprocessing/OutputPass.js';

export function init(renderer) {
  // ─── 씬 / 카메라 ─────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000008);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 2, 7);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.5, 0);

  // ─── 씬 오브젝트 ─────────────────────────────────────────
  //  블룸 효과가 잘 보이도록 발광하는 오브젝트 위주로 구성

  // 중앙 구체 (밝게 빛나는 코어)
  const coreGeo = new THREE.SphereGeometry(0.8, 32, 32);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x88aaff,   // 자체 발광 색상
    emissiveIntensity: 3, // 발광 강도 (1 이상이면 블룸에 반응)
    roughness: 0.2,
    metalness: 0.8,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);

  // 궤도를 도는 발광 링들
  const ringData = [
    { radius: 2.0, color: 0xff4466, speed: 0.6,  tilt: 0.3 },
    { radius: 2.8, color: 0x44aaff, speed: -0.4, tilt: 1.1 },
    { radius: 3.5, color: 0xffaa22, speed: 0.25, tilt: 0.7 },
  ];

  const rings = ringData.map(({ radius, color, tilt }) => {
    const geo = new THREE.TorusGeometry(radius, 0.04, 8, 80);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 2,
      roughness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = tilt;
    scene.add(mesh);
    return mesh;
  });

  // 궤도를 도는 작은 구슬들
  const orbColors = [0xff6688, 0x66ccff, 0xffcc44, 0x88ff88, 0xcc88ff];
  const orbs = orbColors.map((color, i) => {
    const angle = (i / orbColors.length) * Math.PI * 2;
    const orbitR = 1.8 + Math.random() * 1.5;
    const geo = new THREE.SphereGeometry(0.12, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 4,
      roughness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // 초기 각도 저장용
    mesh.userData = { angle, orbitR, speed: 0.3 + Math.random() * 0.5 };
    scene.add(mesh);
    return mesh;
  });

  // 배경 파티클 (별)
  const starCount = 3000;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i++) {
    starPositions[i] = (Math.random() - 0.5) * 60;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, sizeAttenuation: true });
  scene.add(new THREE.Points(starGeo, starMat));

  // ─── 조명 ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x111122, 2));
  const pointLight = new THREE.PointLight(0x8888ff, 30, 10);
  scene.add(pointLight);

  // ─── EffectComposer 설정 ──────────────────────────────────
  //
  //  composer = 후처리 파이프라인 관리자
  //  renderer를 넘겨주면 내부적으로 WebGLRenderTarget을 생성
  //
  const composer = new EffectComposer(renderer);

  // [Pass 1] RenderPass — 씬을 RenderTarget에 그림
  //  일반 renderer.render(scene, camera) 대신 이 Pass가 첫 렌더링을 담당
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // [Pass 2] UnrealBloomPass — Bloom(빛 번짐) 효과
  //  emissiveIntensity나 밝기가 threshold를 넘은 픽셀에만 번짐 적용
  //
  //  파라미터:
  //    resolution : 블룸 처리 해상도 (Vector2)
  //    strength   : 블룸 강도 (0.0~3.0 권장)
  //    radius     : 빛 번짐 반경 (0.0~1.0 권장)
  //    threshold  : 이 밝기 이상인 픽셀에만 적용 (0.0=전체, 1.0=매우 밝은 것만)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.2,  // strength
    0.6,  // radius
    0.2   // threshold
  );
  composer.addPass(bloomPass);

  // [Pass 3] FilmPass — 필름 노이즈 + 스캔라인 효과
  //  실제 카메라/영화 촬영물 느낌 표현
  //
  //  파라미터:
  //    intensity : 노이즈 강도 (0.0~1.0)
  //    grayscale : true면 흑백
  const filmPass = new FilmPass(0.3, false);
  filmPass.enabled = true;
  composer.addPass(filmPass);

  // [Pass 4] OutputPass — 최종 색공간 변환
  //  THREE.SRGBColorSpace 출력을 위해 반드시 마지막에 추가
  //  이것 없으면 색이 어둡게 보일 수 있음
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // ─── UI 컨트롤 패널 ───────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'pp-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>후처리 효과 (Post-Processing)</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <span>Bloom 강도</span>
        <input type="range" id="bloom-strength" min="0" max="3" step="0.05" value="1.2">
        <span id="bloom-strength-val">1.2</span>
      </label>

      <label class="pp-row">
        <span>Bloom 반경</span>
        <input type="range" id="bloom-radius" min="0" max="1" step="0.05" value="0.6">
        <span id="bloom-radius-val">0.6</span>
      </label>

      <label class="pp-row">
        <span>Bloom 임계값</span>
        <input type="range" id="bloom-threshold" min="0" max="1" step="0.05" value="0.2">
        <span id="bloom-threshold-val">0.2</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">

      <label class="pp-row">
        <input type="checkbox" id="bloom-toggle" checked>
        <span>Bloom 켜기/끄기</span>
      </label>

      <label class="pp-row">
        <input type="checkbox" id="film-toggle" checked>
        <span>Film 노이즈 켜기/끄기</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">
        파이프라인:<br>
        RenderPass → BloomPass<br>
        → FilmPass → OutputPass
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  // 슬라이더 이벤트 연결
  const bind = (id, valId, cb) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (valEl) valEl.textContent = v.toFixed(2);
      cb(v);
    });
  };

  bind('bloom-strength',  'bloom-strength-val',  v => { bloomPass.strength  = v; });
  bind('bloom-radius',    'bloom-radius-val',    v => { bloomPass.radius    = v; });
  bind('bloom-threshold', 'bloom-threshold-val', v => { bloomPass.threshold = v; });

  document.getElementById('bloom-toggle').addEventListener('change', e => {
    bloomPass.enabled = e.target.checked;
  });
  document.getElementById('film-toggle').addEventListener('change', e => {
    filmPass.enabled = e.target.checked;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();
    const delta   = timer.getDelta();

    // 코어 천천히 회전
    core.rotation.y = elapsed * 0.3;
    core.rotation.x = elapsed * 0.1;

    // 링 회전 (각자 다른 속도·축)
    rings.forEach((ring, i) => {
      ring.rotation.z += ringData[i].speed * delta;
    });

    // 구슬 궤도 운동
    orbs.forEach(orb => {
      const { angle, orbitR, speed } = orb.userData;
      orb.userData.angle += speed * delta;
      const a = orb.userData.angle;
      orb.position.set(
        Math.cos(a) * orbitR,
        Math.sin(a * 0.7) * 0.8, // 타원 궤도
        Math.sin(a) * orbitR
      );
    });

    // 포인트 라이트 맥동 (코어 안에서 빛이 고동치는 느낌)
    pointLight.intensity = 20 + Math.sin(elapsed * 3) * 10;

    controls.update();

    // ★ 핵심: renderer.render() 대신 composer.render() 사용
    //   composer가 내부적으로 RenderPass → BloomPass → … 순서 실행
    composer.render(delta);
  }
  animate();

  // ─── 창 크기 대응 ─────────────────────────────────────────
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    // composer와 bloomPass도 같이 크기 업데이트 필요
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  }
  window.addEventListener('resize', onResize);

  // ─── cleanup ──────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    document.body.removeChild(ui);

    // composer의 RenderTarget도 GPU 메모리 해제
    composer.dispose();

    // 씬 오브젝트 정리
    coreGeo.dispose(); coreMat.dispose();
    rings.forEach(r  => { r.geometry.dispose(); r.material.dispose(); });
    orbs.forEach(o   => { o.geometry.dispose(); o.material.dispose(); });
    starGeo.dispose(); starMat.dispose();

    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
