// ══════════════════════════════════════════════════════════════
//  Module 32: Post-Processing / 후처리 효과
//
//  배울 것:
//    - EffectComposer : 렌더 결과에 여러 Pass를 순서대로 적용하는 파이프라인
//    - RenderPass     : 씬을 렌더 (항상 첫 번째)
//    - UnrealBloomPass: 발광 오브젝트 주변 빛 번짐 (게임 글로우 효과)
//    - OutputPass     : 최종 감마 보정 출력 (항상 마지막)
//    - ShaderPass     : 직접 GLSL로 만든 커스텀 효과 삽입
//    - SMAAPass       : 안티앨리어싱 (계단 현상 제거)
//
//  파이프라인 흐름:
//    씬 → RenderPass → UnrealBloomPass → ShaderPass(커스텀) → OutputPass → 화면
//
//  핵심 개념:
//    - 각 Pass는 이전 Pass의 결과를 텍스처로 받아 가공 후 다음으로 전달
//    - 결국 레슨 25 RenderTarget의 응용 — "텍스처에 렌더 → 효과 → 출력"
//    - OutputPass 없으면 색이 뿌옇게 날아감 (Linear→sRGB 변환 누락)
//
//  UnrealBloomPass 파라미터:
//    strength  : 빛 세기 (0~3 권장)
//    radius    : 번짐 반경 (0~1)
//    threshold : 이 밝기 이상인 픽셀만 bloom 적용 (0~1)
//      → threshold=0 이면 모든 픽셀에 적용, threshold=1 이면 거의 없음
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass }      from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass }        from 'three/examples/jsm/postprocessing/SMAAPass.js';

// ─── 커스텀 셰이더 패스 ─────────────────────────────────────
//  각 패스는 { uniforms, vertexShader, fragmentShader } 형태
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },   // 이전 Pass 결과 텍스처 (자동 연결)
    uStrength: { value: 0.003 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float     uStrength;
    varying vec2      vUv;
    void main() {
      // RGB 채널을 미세하게 다른 위치에서 샘플 → 색수차(프리즘) 효과
      vec2 offset = (vUv - 0.5) * uStrength;
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

const VignetteShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uStrength:  { value: 0.6 },
    uSoftness:  { value: 0.4 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uSoftness;
    varying vec2 vUv;
    void main() {
      vec4 col  = texture2D(tDiffuse, vUv);
      // 중심~가장자리 거리
      float dist = distance(vUv, vec2(0.5));
      float vig  = smoothstep(0.5, 0.5 - uSoftness, dist * uStrength * 2.0);
      gl_FragColor = vec4(col.rgb * vig, 1.0);
    }
  `,
};

export function init(renderer) {
  renderer.toneMapping          = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure  = 1.0;
  renderer.outputColorSpace     = THREE.SRGBColorSpace;

  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x000510);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 2, 8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // ─── 씬 구성 — bloom이 잘 보이도록 어두운 배경 + 발광 오브젝트 ──
  scene.add(new THREE.AmbientLight(0x111133, 2));
  const pointLight = new THREE.PointLight(0x4466ff, 20, 15);
  pointLight.position.set(0, 3, 0);
  scene.add(pointLight);

  // 발광 구 (emissive → bloom 적용됨)
  const spheres = [];
  const colors  = [0xff4488, 0x44ffaa, 0x4488ff, 0xffcc00, 0xff6600];
  colors.forEach((color, i) => {
    const angle = (i / colors.length) * Math.PI * 2;
    const geo   = new THREE.SphereGeometry(0.35, 32, 32);
    const mat   = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 2.5,
      roughness: 0.2,
      metalness: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(angle) * 3, 0, Math.sin(angle) * 3);
    scene.add(mesh);
    spheres.push(mesh);
  });

  // 중앙 발광 구 (강하게)
  const coreGeo = new THREE.SphereGeometry(0.6, 32, 32);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 5, roughness: 0,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.set(0, 0, 0);
  scene.add(core);

  // 바닥 (반사)
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x050520, roughness: 0.1, metalness: 0.8,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  scene.add(floor);

  // 토러스 (구조물)
  const torusGeo = new THREE.TorusGeometry(3, 0.06, 8, 80);
  const torusMat = new THREE.MeshStandardMaterial({
    color: 0x334466, emissive: 0x223355, emissiveIntensity: 1,
    roughness: 0.3, metalness: 0.9,
  });
  scene.add(new THREE.Mesh(torusGeo, torusMat));
  const torusGeo2 = new THREE.TorusGeometry(3, 0.06, 8, 80);
  const torus2 = new THREE.Mesh(torusGeo2, torusMat.clone());
  torus2.rotation.x = Math.PI / 2;
  scene.add(torus2);

  // ─── EffectComposer 설정 ──────────────────────────────────
  const composer = new EffectComposer(renderer);

  // 1. RenderPass: 씬을 렌더 (항상 첫 번째)
  composer.addPass(new RenderPass(scene, camera));

  // 2. UnrealBloomPass: 발광 효과
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.2,   // strength
    0.4,   // radius
    0.1,   // threshold
  );
  composer.addPass(bloomPass);

  // 3. SMAA: 안티앨리어싱
  const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
  composer.addPass(smaaPass);

  // 4. 색수차 ShaderPass
  const chromaPass = new ShaderPass(ChromaticAberrationShader);
  composer.addPass(chromaPass);

  // 5. 비네팅 ShaderPass
  const vignettePass = new ShaderPass(VignetteShader);
  composer.addPass(vignettePass);

  // 6. OutputPass: 색공간 보정 (항상 마지막)
  composer.addPass(new OutputPass());

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'pp-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto;">
      <p><strong>Post-Processing</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">Bloom</p>
      <label class="pp-row">
        <span>강도</span>
        <input type="range" id="bloom-str" min="0" max="3" step="0.05" value="1.2">
        <span id="bloom-str-val">1.20</span>
      </label>
      <label class="pp-row">
        <span>반경</span>
        <input type="range" id="bloom-rad" min="0" max="1" step="0.02" value="0.4">
        <span id="bloom-rad-val">0.40</span>
      </label>
      <label class="pp-row">
        <span>임계값</span>
        <input type="range" id="bloom-thr" min="0" max="1" step="0.02" value="0.1">
        <span id="bloom-thr-val">0.10</span>
      </label>
      <label class="pp-row">
        <span>Bloom ON</span>
        <input type="checkbox" id="bloom-on" checked>
      </label>

      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">기타 효과</p>
      <label class="pp-row">
        <span>색수차</span>
        <input type="range" id="chroma-str" min="0" max="0.015" step="0.001" value="0.003">
        <span id="chroma-str-val">0.003</span>
      </label>
      <label class="pp-row">
        <span>비네팅</span>
        <input type="range" id="vignette-str" min="0" max="1.5" step="0.05" value="0.6">
        <span id="vignette-str-val">0.60</span>
      </label>
      <label class="pp-row">
        <span>SMAA ON</span>
        <input type="checkbox" id="smaa-on" checked>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        Pass 순서:<br>
        RenderPass → Bloom → SMAA<br>
        → 색수차 → 비네팅 → Output<br>
        <span style="color:#fbbf24">OutputPass 필수</span> — 없으면 색 날아감
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  // Bloom 컨트롤
  document.getElementById('bloom-str').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('bloom-str-val').textContent = v.toFixed(2);
    bloomPass.strength = v;
  });
  document.getElementById('bloom-rad').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('bloom-rad-val').textContent = v.toFixed(2);
    bloomPass.radius = v;
  });
  document.getElementById('bloom-thr').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('bloom-thr-val').textContent = v.toFixed(2);
    bloomPass.threshold = v;
  });
  document.getElementById('bloom-on').addEventListener('change', e => {
    bloomPass.enabled = e.target.checked;
  });
  document.getElementById('chroma-str').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('chroma-str-val').textContent = v.toFixed(3);
    chromaPass.uniforms.uStrength.value = v;
  });
  document.getElementById('vignette-str').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('vignette-str-val').textContent = v.toFixed(2);
    vignettePass.uniforms.uStrength.value = v;
  });
  document.getElementById('smaa-on').addEventListener('change', e => {
    smaaPass.enabled = e.target.checked;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 구들 공전
    spheres.forEach((mesh, i) => {
      const base  = (i / spheres.length) * Math.PI * 2;
      const angle = base + elapsed * 0.4;
      mesh.position.x = Math.cos(angle) * 3;
      mesh.position.z = Math.sin(angle) * 3;
      mesh.position.y = Math.sin(elapsed * 1.2 + i) * 0.4;
    });

    // 중앙 코어 맥동
    const pulse = 1 + Math.sin(elapsed * 3) * 0.3;
    coreMat.emissiveIntensity = 4 * pulse;
    core.scale.setScalar(pulse * 0.7);

    controls.update();
    composer.render(); // renderer.render() 대신 composer.render() 사용!
  }
  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    document.body.removeChild(ui);
    composer.dispose();
    [coreGeo, coreMat, floorGeo, floorMat, torusGeo, torusGeo2].forEach(o => o?.dispose?.());
    spheres.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
