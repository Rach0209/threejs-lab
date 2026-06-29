// ══════════════════════════════════════════════════════════════
//  Module 7: 파티클 시스템
//
//  배울 것:
//    - BufferGeometry + Points: 수만 개의 점을 효율적으로 렌더링
//    - BufferAttribute: GPU에 넘기는 꼭짓점 데이터 배열
//    - PointsMaterial: 점의 크기/색/투명도 설정
//    - 파티클 애니메이션: 매 프레임 position 배열 직접 수정
//
//  핵심 개념:
//    Mesh는 오브젝트 하나에 하나의 Geometry를 씁니다.
//    수만 개를 각각 Mesh로 만들면 draw call이 수만 번 → 매우 느림.
//    Points는 수만 개의 점을 하나의 draw call로 처리합니다.
//
//  BufferGeometry 구조:
//    Float32Array 배열 → BufferAttribute → BufferGeometry
//    예: [x0,y0,z0, x1,y1,z1, ...] 3개씩 하나의 꼭짓점
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;

  // [deprecated] const clock = new THREE.Clock();
  const timer = new Timer();
  const disposables = [];

  // ──────────────────────────────────────────────────────────
  //  [예제 1] 은하수 형태 파티클
  // ──────────────────────────────────────────────────────────

  const GALAXY_COUNT = 15000;

  // Float32Array: 일반 JS 배열보다 메모리가 작고 GPU 전송에 최적화
  const galaxyPositions = new Float32Array(GALAXY_COUNT * 3); // x,y,z
  const galaxyColors    = new Float32Array(GALAXY_COUNT * 3); // r,g,b

  const colorInner = new THREE.Color(0xff8800); // 중심 색 (주황)
  const colorOuter = new THREE.Color(0x0044ff); // 외곽 색 (파랑)

  for (let i = 0; i < GALAXY_COUNT; i++) {
    const i3 = i * 3;

    // 나선형 분포
    const radius   = Math.random() * 5;
    const spinAngle = radius * 2;          // 반지름에 따른 나선 비틀림
    const branchAngle = (i % 3) * (Math.PI * 2 / 3); // 3개의 나선 팔

    // 가우시안 분포 느낌의 랜덤 오프셋
    const randomX = (Math.random() - 0.5) * 0.4 * (1 - radius / 5);
    const randomY = (Math.random() - 0.5) * 0.15;
    const randomZ = (Math.random() - 0.5) * 0.4 * (1 - radius / 5);

    galaxyPositions[i3]     = Math.cos(branchAngle + spinAngle) * radius + randomX;
    galaxyPositions[i3 + 1] = randomY;
    galaxyPositions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

    // 중심에서 멀수록 외곽 색으로 혼합
    const mixedColor = colorInner.clone().lerp(colorOuter, radius / 5);
    galaxyColors[i3]     = mixedColor.r;
    galaxyColors[i3 + 1] = mixedColor.g;
    galaxyColors[i3 + 2] = mixedColor.b;
  }

  const galaxyGeo = new THREE.BufferGeometry();
  // setAttribute: 이름, BufferAttribute(데이터배열, 요소당 값 수)
  galaxyGeo.setAttribute('position', new THREE.BufferAttribute(galaxyPositions, 3));
  galaxyGeo.setAttribute('color',    new THREE.BufferAttribute(galaxyColors, 3));

  const galaxyMat = new THREE.PointsMaterial({
    size: 0.03,
    sizeAttenuation: true, // 거리에 따른 크기 감쇠 (원근감)
    vertexColors: true,    // 각 꼭짓점의 color 속성 사용
    transparent: true,
    opacity: 0.85,
  });

  const galaxy = new THREE.Points(galaxyGeo, galaxyMat);
  scene.add(galaxy);
  disposables.push({ geo: galaxyGeo, mat: galaxyMat });

  // ──────────────────────────────────────────────────────────
  //  [예제 2] 부유하는 파티클 (애니메이션)
  //  매 프레임 position 배열을 직접 수정해서 움직임 표현
  // ──────────────────────────────────────────────────────────

  const FLOAT_COUNT = 2000;
  const floatPositions  = new Float32Array(FLOAT_COUNT * 3);
  const floatVelocities = new Float32Array(FLOAT_COUNT * 3); // 속도 저장

  for (let i = 0; i < FLOAT_COUNT; i++) {
    const i3 = i * 3;
    floatPositions[i3]     = (Math.random() - 0.5) * 12;
    floatPositions[i3 + 1] = (Math.random() - 0.5) * 8;
    floatPositions[i3 + 2] = (Math.random() - 0.5) * 12;

    floatVelocities[i3]     = (Math.random() - 0.5) * 0.01;
    floatVelocities[i3 + 1] = Math.random() * 0.005 + 0.002; // 위로 떠오름
    floatVelocities[i3 + 2] = (Math.random() - 0.5) * 0.01;
  }

  const floatGeo = new THREE.BufferGeometry();
  floatGeo.setAttribute('position', new THREE.BufferAttribute(floatPositions, 3));

  const floatMat = new THREE.PointsMaterial({
    size: 0.06,
    color: 0x88ccff,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  });

  const floatParticles = new THREE.Points(floatGeo, floatMat);
  scene.add(floatParticles);
  disposables.push({ geo: floatGeo, mat: floatMat });

  // ─── UI ────────────────────────────────────────────────────
  const info = document.createElement('div');
  info.id = 'particle-info';
  info.innerHTML = `
    <div class="info-box">
      <p><strong>파티클 시스템</strong></p>
      <p>🌌 은하수: ${GALAXY_COUNT.toLocaleString()}개</p>
      <p>✨ 부유 파티클: ${FLOAT_COUNT.toLocaleString()}개</p>
      <p>총 ${(GALAXY_COUNT + FLOAT_COUNT).toLocaleString()}개를 하나의 draw call</p>
      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px">
        Points = 수만 개를 단일 draw call<br>
        BufferAttribute = GPU 직접 전송<br>
        vertexColors = 꼭짓점별 색상
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

    // 은하수 천천히 회전
    galaxy.rotation.y = elapsed * 0.05;

    // 부유 파티클 위치 업데이트
    const posArr = floatGeo.attributes.position.array;
    for (let i = 0; i < FLOAT_COUNT; i++) {
      const i3 = i * 3;
      posArr[i3]     += floatVelocities[i3];
      posArr[i3 + 1] += floatVelocities[i3 + 1];
      posArr[i3 + 2] += floatVelocities[i3 + 2];

      // 범위 벗어나면 반대쪽에서 재등장
      if (posArr[i3 + 1] > 4) { posArr[i3 + 1] = -4; }
    }
    // needsUpdate: true → Three.js에게 "배열이 바뀌었으니 GPU에 다시 올려"
    floatGeo.attributes.position.needsUpdate = true;

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
