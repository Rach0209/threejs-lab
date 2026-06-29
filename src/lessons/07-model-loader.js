// ══════════════════════════════════════════════════════════════
//  Module 4: GLB 모델 임포트
//
//  배울 것:
//    - GLTFLoader: .glb / .gltf 파일을 로드하는 공식 로더
//    - 드래그&드롭으로 로컬 파일 로드
//    - AnimationMixer: 모델에 포함된 애니메이션 재생
//    - Box3 / 바운딩박스: 모델 크기 자동 맞춤
//
//  GLTF/GLB 포맷:
//    웹 3D의 표준 포맷 (JPEG of 3D 라고 불림)
//    .gltf: JSON + 외부 파일들
//    .glb: 바이너리로 모든 걸 하나로 묶음 (실무에서 주로 사용)
//
//  GLB 파일 구하기:
//    - Sketchfab.com (무료 모델 다수)
//    - Blender에서 내보내기
//    - KhronosGroup GitHub 샘플: github.com/KhronosGroup/glTF-Sample-Models
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.01,
    1000
  );
  camera.position.set(0, 1, 4);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  renderer.shadowMap.enabled = true;

  // ─── 조명 ─────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(3, 8, 5);
  dirLight.castShadow = true;
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0x88aaff, 0.5);
  fillLight.position.set(-5, 2, -3);
  scene.add(fillLight);

  // ─── 바닥 그리드 ──────────────────────────────────────────
  const grid = new THREE.GridHelper(10, 20, 0x334155, 0x1e293b);
  scene.add(grid);

  // ─── 애니메이션 믹서 (모델 내장 애니메이션 재생용) ──────────
  let mixer = null;
  let currentModel = null;

  // ─── GLB 로드 함수 ───────────────────────────────────────
  const loader = new GLTFLoader();

  function loadGLB(file) {
    const url = URL.createObjectURL(file);
    statusEl.textContent = '⏳ 로딩 중...';

    loader.load(
      url,
      // ── 로드 성공 ────────────────────────────────────────
      (gltf) => {
        // 이전 모델 제거
        if (currentModel) {
          scene.remove(currentModel);
          // GLB 모델의 모든 Geometry/Material 해제
          currentModel.traverse((child) => {
            if (child.isMesh) {
              child.geometry?.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material?.dispose();
              }
            }
          });
          currentModel = null;
        }
        if (mixer) { mixer.stopAllAction(); mixer = null; }

        const model = gltf.scene;

        // ── 모델 크기 자동 맞춤 ─────────────────────────────
        //  Box3: 오브젝트를 감싸는 최소 직육면체(바운딩 박스)
        //  모델마다 크기가 천차만별이므로 정규화가 필요함
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim; // 최대 2 유닛 크기로 정규화

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale)); // 중심 맞춤
        model.position.y += size.y * scale * 0.5;        // 바닥에 놓기

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(model);
        currentModel = model;

        // ── 내장 애니메이션 재생 ─────────────────────────────
        //  AnimationMixer: 모델에 포함된 애니메이션 클립을 재생
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach((clip) => {
            mixer.clipAction(clip).play();
          });
          statusEl.textContent = `✅ ${file.name} — 애니메이션 ${gltf.animations.length}개 재생 중`;
        } else {
          statusEl.textContent = `✅ ${file.name} — 로드 완료`;
        }

        URL.revokeObjectURL(url); // 임시 URL 해제
      },
      // ── 로딩 진행 ────────────────────────────────────────
      (progress) => {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        statusEl.textContent = `⏳ 로딩 중... ${pct}%`;
      },
      // ── 오류 ─────────────────────────────────────────────
      (error) => {
        console.error(error);
        statusEl.textContent = '❌ 로드 실패. GLB/GLTF 파일인지 확인해주세요.';
        URL.revokeObjectURL(url);
      }
    );
  }

  // ─── UI: 드롭존 ───────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'loader-ui';
  ui.innerHTML = `
    <div class="drop-zone" id="drop-zone">
      <div class="drop-icon">📦</div>
      <p><strong>GLB / GLTF 파일을 드래그 & 드롭</strong></p>
      <p>또는</p>
      <label class="file-btn">
        파일 선택
        <input type="file" id="file-input" accept=".glb,.gltf" style="display:none">
      </label>
    </div>
    <div class="loader-status" id="loader-status">파일을 드롭하거나 선택하세요</div>
  `;
  document.body.appendChild(ui);

  const statusEl = ui.querySelector('#loader-status');
  const dropZone = ui.querySelector('#drop-zone');
  const fileInput = ui.querySelector('#file-input');

  // 드래그 오버
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

  // 드롭
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadGLB(file);
  });

  // 파일 선택
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadGLB(file);
  });

  // ─── 애니메이션 ───────────────────────────────────────────
  // [deprecated] const clock = new THREE.Clock(); + clock.getDelta()
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = timer.getDelta(); // 이전 프레임과의 시간 차 (초)
    if (mixer) mixer.update(delta); // 매 프레임 애니메이션 시간 진행
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
    if (mixer) mixer.stopAllAction();
    document.body.removeChild(ui);
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
