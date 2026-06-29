// ══════════════════════════════════════════════════════════════
//  Module 2: 텍스처와 지구본
//
//  배울 것:
//    - TextureLoader: 이미지를 GPU 텍스처로 로딩
//    - UV 매핑: 2D 이미지를 3D 표면에 어떻게 펼치는가
//    - map / normalMap / roughnessMap: 텍스처의 역할 종류
//    - CanvasTexture: Canvas로 직접 텍스처 생성 (이미지 없이)
//    - envMap: 환경 반사 텍스처
//
//  이 레슨은 외부 이미지 없이 Canvas로 텍스처를 직접 생성합니다.
//  → 실제 프로젝트에서는 TextureLoader로 PNG/JPG를 로드합니다.
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000010);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;        // 자동 회전 (천천히)
  controls.autoRotateSpeed = 0.5;

  const disposables = [];

  // ──────────────────────────────────────────────────────────
  //  텍스처 종류 설명
  //
  //  map (diffuse map):
  //    기본 색상. 우리가 "텍스처"라고 부르는 가장 기본적인 것
  //
  //  normalMap:
  //    표면 법선(Normal)을 RGB로 인코딩한 이미지
  //    실제 폴리곤을 늘리지 않고 울퉁불퉁한 느낌을 표현
  //    R=X방향 법선, G=Y방향 법선, B=Z방향 법선
  //
  //  roughnessMap:
  //    픽셀별 거칠기를 흑백으로 표현
  //    흰색=거칠, 검정=매끄러움
  //
  //  emissiveMap:
  //    스스로 빛나는 부분의 마스크 (도시 불빛 등)
  // ──────────────────────────────────────────────────────────

  // ─── Canvas로 지구 텍스처 생성 ────────────────────────────
  //  실제 지구 텍스처 이미지 대신 Canvas API로 간단하게 그림
  const earthTexture = makeEarthTexture();
  const earthNormal = makeNormalTexture();
  const earthEmissive = makeEmissiveTexture(); // 도시 불빛 효과
  disposables.push({ tex: earthTexture }, { tex: earthNormal }, { tex: earthEmissive });

  // ─── 지구 ─────────────────────────────────────────────────
  const earthGeo = new THREE.SphereGeometry(2, 64, 64);
  const earthMat = new THREE.MeshStandardMaterial({
    map: earthTexture,           // 기본 색상 텍스처
    normalMap: earthNormal,      // 표면 요철 표현
    normalScale: new THREE.Vector2(0.5, 0.5), // 노멀 강도
    roughness: 0.8,
    metalness: 0.1,
    emissiveMap: earthEmissive,  // 밤에 빛나는 도시 불빛
    emissive: new THREE.Color(0xffaa44),
    emissiveIntensity: 0.6,
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  earth.rotation.z = 0.41; // 지구 자전축 기울기 (23.5도)
  scene.add(earth);
  disposables.push({ geo: earthGeo, mat: earthMat });

  // ─── 대기권 (글로우 효과) ─────────────────────────────────
  //  지구보다 살짝 큰 반투명 구로 대기권 표현
  //  side: THREE.BackSide → 안쪽 면을 렌더링 (반대로 뒤집어 씌움)
  const atmosGeo = new THREE.SphereGeometry(2.08, 64, 64);
  const atmosMat = new THREE.MeshStandardMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
  });
  const atmos = new THREE.Mesh(atmosGeo, atmosMat);
  scene.add(atmos);
  disposables.push({ geo: atmosGeo, mat: atmosMat });

  // ─── 달 ───────────────────────────────────────────────────
  const moonTex = makeMoonTexture();
  disposables.push({ tex: moonTex });

  const moonGeo = new THREE.SphereGeometry(0.5, 32, 32);
  const moonMat = new THREE.MeshStandardMaterial({
    map: moonTex,
    roughness: 1,
    metalness: 0,
  });
  const moonPivot = new THREE.Object3D();
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.position.x = 3.5;
  moonPivot.add(moon);
  scene.add(moonPivot);
  disposables.push({ geo: moonGeo, mat: moonMat });

  // ─── 별 배경 ─────────────────────────────────────────────
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(4000 * 3);
  for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 300;
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 });
  scene.add(new THREE.Points(starGeo, starMat));
  disposables.push({ geo: starGeo, mat: starMat });

  // ─── 조명 ─────────────────────────────────────────────────
  // 태양광 방향 (지구에서 볼 때 오른쪽에서 비춤)
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  sunLight.position.set(10, 2, 5);
  scene.add(sunLight);
  const ambient = new THREE.AmbientLight(0x111133, 0.3);
  scene.add(ambient);
  disposables.push({ light: sunLight }, { light: ambient });

  // ─── 애니메이션 ────────────────────────────────────────────
  // [deprecated] const clock = new THREE.Clock();
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();
    earth.rotation.y = elapsed * 0.2;
    moonPivot.rotation.y = elapsed * 0.5;
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
    disposables.forEach(({ geo, mat, tex, light }) => {
      geo?.dispose(); mat?.dispose(); tex?.dispose();
      if (light) scene.remove(light);
    });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

// ──────────────────────────────────────────────────────────────
//  Canvas 텍스처 생성 헬퍼들
// ──────────────────────────────────────────────────────────────

function makeEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // 바다 (그라데이션)
  const sea = ctx.createLinearGradient(0, 0, 0, 512);
  sea.addColorStop(0, '#0a3060');
  sea.addColorStop(0.5, '#1a5fa0');
  sea.addColorStop(1, '#0a3060');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, 1024, 512);

  // 간략한 대륙 형태 (녹색 덩어리들)
  ctx.fillStyle = '#2d6a2d';
  const continents = [
    [120, 100, 200, 150], [350, 80, 160, 120], [500, 120, 180, 200],
    [700, 90, 140, 130],  [80, 300, 120, 100], [600, 320, 200, 120],
    [820, 280, 160, 140], [440, 360, 100, 80],
  ];
  continents.forEach(([x, y, w, h]) => {
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // 극지방 (흰색)
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(0, 0, 1024, 30);
  ctx.fillRect(0, 482, 1024, 30);

  return new THREE.CanvasTexture(canvas);
}

function makeNormalTexture() {
  // 노멀맵: 푸른빛 도는 이미지 (R=0.5, G=0.5, B=1 = 평평한 표면)
  // 여기서는 간단히 노이즈를 추가해 약간 울퉁불퉁한 느낌
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(256, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random() * 20;
    img.data[i]     = 128 + n; // R
    img.data[i + 1] = 128 + n; // G
    img.data[i + 2] = 255;     // B (항상 1 방향)
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function makeEmissiveTexture() {
  // 밤에 보이는 도시 불빛 마스크 (대륙 위에 노란 점들)
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = 'rgba(255, 180, 50, 0.9)';
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 1024;
    const y = 40 + Math.random() * 430;
    const r = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function makeMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#888';
  ctx.fillRect(0, 0, 256, 128);
  // 크레이터 표현
  ctx.fillStyle = '#666';
  [[40,30,12],[120,60,18],[200,40,10],[80,90,8],[170,80,15]].forEach(([x,y,r]) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  });
  return new THREE.CanvasTexture(canvas);
}
