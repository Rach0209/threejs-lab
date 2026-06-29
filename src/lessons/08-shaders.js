// ══════════════════════════════════════════════════════════════
//  Module 5: 셰이더 입문 (GLSL)
//
//  배울 것:
//    - Vertex Shader: 꼭짓점의 위치를 결정
//    - Fragment Shader: 픽셀의 색상을 결정
//    - Uniform: JS에서 셰이더로 값을 전달하는 변수
//    - ShaderMaterial: 직접 작성한 셰이더를 사용하는 재질
//
//  GLSL(OpenGL Shading Language):
//    GPU에서 실행되는 C 유사 언어
//    CPU(JS)에서는 수백만 픽셀을 하나씩 처리하지만
//    GPU는 수천 개 코어로 병렬 처리 → 매우 빠름
//
//  셰이더의 2단계 파이프라인:
//    1. Vertex Shader   → 각 꼭짓점의 3D 위치 계산
//    2. Fragment Shader → 각 픽셀의 색상 계산
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ──────────────────────────────────────────────────────────────
//  GLSL 코드 (백틱 문자열로 JS에 작성)
//
//  [예제 1] 물결치는 구
// ──────────────────────────────────────────────────────────────

const waveVertexShader = /* glsl */ `
  // uniform: JS에서 매 프레임 값을 업데이트할 수 있는 변수
  uniform float uTime;      // 경과 시간
  uniform float uFrequency; // 파동 주파수
  uniform float uAmplitude; // 파동 진폭

  // varying: vertex shader → fragment shader로 값을 전달
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vNormal = normal;
    vUv = uv;

    // 꼭짓점 위치를 사인파로 변형
    vec3 pos = position;
    // normal 방향으로 sin 파형만큼 튀어나오게 함
    float wave = sin(pos.x * uFrequency + uTime)
               * sin(pos.y * uFrequency + uTime)
               * uAmplitude;
    pos += normal * wave;

    // gl_Position: 반드시 설정해야 하는 출력값 (클립 공간 좌표)
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waveFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    // 법선 벡터를 색상으로 매핑 (0~1 범위로 변환)
    vec3 normalColor = vNormal * 0.5 + 0.5;

    // 시간에 따라 변하는 색상 (sin 파형으로 0~1 사이 진동)
    float r = sin(uTime * 0.5 + vUv.x * 3.14) * 0.5 + 0.5;
    float g = sin(uTime * 0.7 + vUv.y * 3.14) * 0.5 + 0.5;
    float b = sin(uTime * 0.9) * 0.5 + 0.5;

    // mix(a, b, t): a와 b를 t 비율로 섞음
    vec3 color = mix(normalColor, vec3(r, g, b), 0.5);

    // gl_FragColor: 이 픽셀의 최종 색상 (RGBA)
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ──────────────────────────────────────────────────────────────
//  [예제 2] 홀로그램 링 셰이더
// ──────────────────────────────────────────────────────────────

const holoVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vPosition;
  varying vec3 vNormal;

  void main() {
    vPosition = position;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const holoFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vPosition;
  varying vec3 vNormal;

  void main() {
    // 수평 스캔라인 효과
    float scanline = sin(vPosition.y * 40.0 + uTime * 3.0) * 0.5 + 0.5;

    // 엣지 글로우: 카메라에서 볼 때 경계 부분이 밝아짐
    // 뷰 방향과 법선의 내적이 1에 가까울수록 정면, 0에 가까울수록 엣지
    // gl_FragCoord 방향 벡터 대신 simple edge 계산
    float edge = pow(1.0 - abs(vNormal.z), 2.0);

    // 홀로그램 청록색
    vec3 holoColor = vec3(0.0, 1.0, 0.9);
    float alpha = (scanline * 0.4 + edge * 0.8) * 0.85;

    gl_FragColor = vec4(holoColor, alpha);
  }
`;

// ──────────────────────────────────────────────────────────────
//  [예제 3] 배경 그라데이션 셰이더 (PlaneGeometry 전체)
// ──────────────────────────────────────────────────────────────

const bgVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const bgFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec3 colorA = vec3(0.05, 0.0, 0.15);
    vec3 colorB = vec3(0.0, 0.1, 0.3);

    // 노이즈 없이 단순 UV 기반 그라데이션
    float t = vUv.y + sin(vUv.x * 3.0 + uTime * 0.3) * 0.1;
    vec3 col = mix(colorA, colorB, t);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function init(renderer) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // [deprecated] const clock = new THREE.Clock();
  const timer = new Timer();
  const disposables = [];

  // ─── 배경 플레인 (그라데이션 셰이더) ────────────────────────
  const bgGeo = new THREE.PlaneGeometry(30, 20);
  const bgMat = new THREE.ShaderMaterial({
    vertexShader: bgVertexShader,
    fragmentShader: bgFragmentShader,
    uniforms: { uTime: { value: 0 } },
  });
  const bgMesh = new THREE.Mesh(bgGeo, bgMat);
  bgMesh.position.z = -5;
  scene.add(bgMesh);
  disposables.push({ geo: bgGeo, mat: bgMat });

  // ─── 물결 구 ─────────────────────────────────────────────
  const sphereGeo = new THREE.SphereGeometry(1.8, 128, 128); // 고밀도 폴리곤
  const waveMat = new THREE.ShaderMaterial({
    vertexShader: waveVertexShader,
    fragmentShader: waveFragmentShader,
    uniforms: {
      uTime:      { value: 0 },
      uFrequency: { value: 3.0 },
      uAmplitude: { value: 0.15 },
    },
    side: THREE.DoubleSide,
  });
  const sphere = new THREE.Mesh(sphereGeo, waveMat);
  sphere.position.x = -2.5;
  scene.add(sphere);
  disposables.push({ geo: sphereGeo, mat: waveMat });

  // ─── 홀로그램 토러스 ─────────────────────────────────────
  const torusGeo = new THREE.TorusKnotGeometry(1.2, 0.4, 100, 16);
  const holoMat = new THREE.ShaderMaterial({
    vertexShader: holoVertexShader,
    fragmentShader: holoFragmentShader,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false, // 반투명 오브젝트는 depth write 끔
  });
  const torus = new THREE.Mesh(torusGeo, holoMat);
  torus.position.x = 2.5;
  scene.add(torus);
  disposables.push({ geo: torusGeo, mat: holoMat });

  // 홀로그램 와이어프레임 (겹쳐서 더 그럴싸하게)
  const wireGeo = new THREE.WireframeGeometry(torusGeo);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x00ffee, opacity: 0.15, transparent: true });
  const wire = new THREE.LineSegments(wireGeo, wireMat);
  torus.add(wire);
  disposables.push({ geo: wireGeo, mat: wireMat });

  // ─── 설명 패널 ────────────────────────────────────────────
  const info = document.createElement('div');
  info.id = 'shader-info';
  info.innerHTML = `
    <div class="info-box">
      <p><strong>셰이더 예제</strong></p>
      <p>🌊 왼쪽: Vertex Shader로 물결 변형</p>
      <p>💠 오른쪽: Fragment Shader로 홀로그램</p>
      <p>🎨 배경: UV 기반 그라데이션</p>
      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">
        Vertex: 꼭짓점 위치 계산<br>
        Fragment: 픽셀 색상 계산<br>
        Uniform: JS→GPU 실시간 값 전달
      </p>
    </div>
  `;
  document.body.appendChild(info);

  // ─── 애니메이션 ────────────────────────────────────────────
  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // uniform 값을 매 프레임 업데이트
    waveMat.uniforms.uTime.value = elapsed;
    holoMat.uniforms.uTime.value = elapsed;
    bgMat.uniforms.uTime.value = elapsed;

    sphere.rotation.y = elapsed * 0.2;
    torus.rotation.y = elapsed * 0.5;
    torus.rotation.x = elapsed * 0.3;

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
    disposables.forEach(({ geo, mat }) => { geo?.dispose(); mat?.dispose(); });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
