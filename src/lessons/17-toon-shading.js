// ══════════════════════════════════════════════════════════════
//  Module 17: Toon / Cel Shading
//
//  배울 것:
//    - MeshToonMaterial  : Three.js 내장 툰 재질
//    - GradientMap       : 빛의 단계 수를 결정하는 1D 텍스처
//    - 외곽선 기법       : 두꺼운 역방향 메시 (BackSide + scale)
//    - 커스텀 GLSL 툰    : ShaderMaterial로 직접 계단형 음영 구현
//    - OutlinePass       : 후처리로 외곽선 그리기
//
//  Cel Shading이란?
//    일반 렌더링은 빛을 연속적으로 보간 (부드러운 그라데이션).
//    Cel Shading은 빛을 "계단"으로 양자화해 만화·애니메이션 느낌을 냄.
//
//    예: 밝기 0.0~0.3 → 검정, 0.3~0.6 → 회색, 0.6~1.0 → 흰색
//
//  외곽선 기법 비교:
//    A. BackFace 방식: 같은 메시를 뒤집어(BackSide) 살짝 키운 뒤 검정으로 렌더링
//       → 빠르지만 날카로운 모서리에서 끊김
//    B. 후처리(OutlinePass): 깊이/법선 차이를 감지해 엣지 그리기
//       → 품질 좋지만 비용 높음
//    여기서는 A 방식으로 구현 (학습 목적으로 원리가 명확함)
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── GradientMap 생성 헬퍼 ───────────────────────────────────
//
//  MeshToonMaterial은 1D 텍스처(GradientMap)로 밝기를 샘플링.
//  픽셀 수 = 단계 수. NearestFilter 필수 (보간하면 계단이 흐려짐).
//
function makeGradientMap(steps, colors) {
  // colors: ['#1a1a2e', '#4a4a8a', '#e0e0ff'] 형식
  const size = steps;
  const data = new Uint8Array(size * 4);
  colors.forEach((hex, i) => {
    const c = new THREE.Color(hex);
    data[i * 4    ] = Math.round(c.r * 255);
    data[i * 4 + 1] = Math.round(c.g * 255);
    data[i * 4 + 2] = Math.round(c.b * 255);
    data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, size, 1);
  tex.format = THREE.RGBAFormat;
  tex.minFilter = THREE.NearestFilter; // ★ 보간 금지 — 계단 유지
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// ─── 외곽선 메시 생성 (BackFace 방식) ────────────────────────
//
//  원본 Geometry를 복제해 BackSide(뒤집힌 면)로 렌더링.
//  scale을 살짝 키우면 원본 바깥으로 살짝 삐져나와 외곽선처럼 보임.
//
function makeOutline(geometry, outlineSize, color) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide, // 뒤집힌 면만 렌더링
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.scale.setScalar(outlineSize); // 살짝 크게
  return mesh;
}

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfff8f0);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 2, 10);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.5, 0);

  // ─── 조명 ─────────────────────────────────────────────────
  //  툰 셰이딩에서는 조명 방향이 극적으로 드러남
  scene.add(new THREE.AmbientLight(0xfff0e0, 1.5));

  const dirLight = new THREE.DirectionalLight(0xffffff, 4);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  // ─── GradientMap 종류 ─────────────────────────────────────
  const gradientMaps = {
    '2단계': makeGradientMap(2, ['#2a2a3a', '#e8e8ff']),
    '3단계': makeGradientMap(3, ['#1a1a2e', '#5a5a8e', '#e0e0ff']),
    '4단계': makeGradientMap(4, ['#1a1a2e', '#3a3a6e', '#7a7aae', '#e0e0ff']),
    '5단계': makeGradientMap(5, ['#0d0d1a', '#2a2a4a', '#4a4a7a', '#8a8abf', '#e0e0ff']),
  };

  let activeGradient = '3단계';

  // ─── 오브젝트 생성 ────────────────────────────────────────
  const objects = []; // { toonMesh, outlineMesh, geo, toonMat, outlineMat }

  const configs = [
    { geo: new THREE.SphereGeometry(1, 32, 32),           pos: [-3.5, 0, 0], color: 0xff6b6b, label: 'Sphere'   },
    { geo: new THREE.TorusKnotGeometry(0.7, 0.25, 80, 16), pos: [0, 0, 0],   color: 0x6baaff, label: 'TorusKnot'},
    { geo: new THREE.BoxGeometry(1.4, 1.4, 1.4),           pos: [3.5, 0, 0], color: 0x6bff9e, label: 'Box'      },
  ];

  let outlineSize   = 1.06;
  let outlineColor  = 0x111122;

  configs.forEach(({ geo, pos, color, label }) => {
    const toonMat = new THREE.MeshToonMaterial({
      color,
      gradientMap: gradientMaps[activeGradient],
    });

    const toonMesh = new THREE.Mesh(geo, toonMat);
    toonMesh.position.set(...pos);
    scene.add(toonMesh);

    // 외곽선 메시 (같은 geo 공유)
    const outlineMesh = makeOutline(geo, outlineSize, outlineColor);
    outlineMesh.position.set(...pos);
    scene.add(outlineMesh);

    // 라벨
    const sprite = makeLabel(label);
    sprite.position.set(pos[0], pos[1] - 1.6, pos[2]);
    scene.add(sprite);

    objects.push({ toonMesh, outlineMesh, geo, toonMat, outlineMat: outlineMesh.material, sprite });
  });

  // ─── 커스텀 GLSL 툰 셰이더 데모 ──────────────────────────
  //
  //  ShaderMaterial로 직접 빛 계산 + 계단 양자화 구현.
  //  MeshToonMaterial의 내부 동작 원리를 눈으로 확인.
  //
  const customToonMat = new THREE.ShaderMaterial({
    uniforms: {
      uLightDir:  { value: new THREE.Vector3(5, 8, 5).normalize() },
      uBaseColor: { value: new THREE.Color(0xffcc44) },
      uSteps:     { value: 3.0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        // 법선을 월드 공간으로 변환
        vNormal   = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3  uLightDir;
      uniform vec3  uBaseColor;
      uniform float uSteps;

      varying vec3 vNormal;

      void main() {
        // Lambert 내적: 법선과 빛 방향의 코사인 (0~1)
        float NdotL = dot(normalize(vNormal), normalize(uLightDir));
        NdotL = clamp(NdotL, 0.0, 1.0);

        // ★ 핵심: floor(NdotL * steps) / steps 로 계단 양자화
        float stepped = floor(NdotL * uSteps) / uSteps;

        // 최소 밝기 보장 (완전 검정 방지)
        stepped = max(stepped, 0.08);

        gl_FragColor = vec4(uBaseColor * stepped, 1.0);
      }
    `,
    side: THREE.FrontSide,
  });

  const customGeo  = new THREE.SphereGeometry(1, 32, 32);
  const customMesh = new THREE.Mesh(customGeo, customToonMat);
  customMesh.position.set(0, -3.2, 0);
  scene.add(customMesh);

  const customOutline = makeOutline(customGeo, 1.07, 0x111122);
  customOutline.position.copy(customMesh.position);
  scene.add(customOutline);

  const customLabel = makeLabel('Custom GLSL Toon');
  customLabel.position.set(0, -4.8, 0);
  scene.add(customLabel);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'toon-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto; min-width:250px;">
      <p><strong>Toon / Cel Shading</strong></p>
      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">GradientMap 단계 (MeshToonMaterial)</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;" id="grad-btns">
        <button class="toon-btn active" data-grad="2단계">2단계</button>
        <button class="toon-btn" data-grad="3단계">3단계</button>
        <button class="toon-btn" data-grad="4단계">4단계</button>
        <button class="toon-btn" data-grad="5단계">5단계</button>
      </div>

      <label class="pp-row">
        <span>외곽선 두께</span>
        <input type="range" id="outline-size" min="1.01" max="1.15" step="0.005" value="1.06">
        <span id="outline-size-val">1.06</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;margin-bottom:6px">Custom GLSL 단계 수</p>
      <label class="pp-row">
        <span>Steps</span>
        <input type="range" id="glsl-steps" min="1" max="8" step="1" value="3">
        <span id="glsl-steps-val">3</span>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">
        위 3개: MeshToonMaterial<br>
        아래 구체: ShaderMaterial<br>
        (직접 GLSL로 구현)
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  const btnStyle = document.createElement('style');
  btnStyle.id = 'toon-btn-style';
  btnStyle.textContent = `
    .toon-btn {
      padding:4px 10px; border-radius:6px; border:1px solid rgba(99,102,241,0.3);
      background:rgba(99,102,241,0.1); color:#a5b4fc; cursor:pointer;
      font-size:12px; transition:background 0.15s;
    }
    .toon-btn:hover  { background:rgba(99,102,241,0.25); }
    .toon-btn.active { background:rgba(99,102,241,0.35); border-color:#6366f1; color:#e0e7ff; }
  `;
  document.head.appendChild(btnStyle);

  // GradientMap 전환
  document.querySelectorAll('.toon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeGradient = btn.dataset.grad;
      objects.forEach(({ toonMat }) => {
        toonMat.gradientMap = gradientMaps[activeGradient];
        toonMat.needsUpdate = true;
      });
    });
  });

  // 외곽선 두께
  document.getElementById('outline-size').addEventListener('input', e => {
    outlineSize = parseFloat(e.target.value);
    document.getElementById('outline-size-val').textContent = outlineSize.toFixed(3);
    objects.forEach(({ outlineMesh }) => outlineMesh.scale.setScalar(outlineSize));
    customOutline.scale.setScalar(outlineSize);
  });

  // GLSL steps
  document.getElementById('glsl-steps').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('glsl-steps-val').textContent = v.toFixed(0);
    customToonMat.uniforms.uSteps.value = v;
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 오브젝트 천천히 회전
    objects.forEach(({ toonMesh, outlineMesh }, i) => {
      const angle = elapsed * 0.4 + i * Math.PI * 0.5;
      toonMesh.rotation.y    = angle;
      outlineMesh.rotation.y = angle;
      toonMesh.rotation.x    = Math.sin(elapsed * 0.3 + i) * 0.2;
      outlineMesh.rotation.x = toonMesh.rotation.x;
    });

    customMesh.rotation.y    = elapsed * 0.5;
    customOutline.rotation.y = customMesh.rotation.y;
    customMesh.rotation.x    = Math.sin(elapsed * 0.4) * 0.2;
    customOutline.rotation.x = customMesh.rotation.x;

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
    document.body.removeChild(ui);
    document.head.removeChild(btnStyle);

    Object.values(gradientMaps).forEach(t => t.dispose());
    objects.forEach(({ geo, toonMat, outlineMat, sprite }) => {
      geo.dispose();
      toonMat.dispose();
      outlineMat.dispose();
      sprite.material.map?.dispose();
      sprite.material.dispose();
    });
    customGeo.dispose();
    customToonMat.dispose();
    customOutline.material.dispose();

    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#475569';
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 160, 36);
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(2.8, 0.6, 1);
  return sprite;
}
