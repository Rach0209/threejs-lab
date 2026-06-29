// ══════════════════════════════════════════════════════════════
//  Module 1-3: Material 종류와 차이
//
//  배울 것:
//    - MeshBasicMaterial    : 빛 무시. 항상 같은 색
//    - MeshLambertMaterial  : 확산광(diffuse)만 계산. 가볍고 빠름
//    - MeshPhongMaterial    : 하이라이트(specular) 추가. 반짝임 표현
//    - MeshStandardMaterial : PBR 재질. roughness / metalness 로 사실적 표현
//    - MeshPhysicalMaterial : Standard 확장판. 유리·코팅 등 고급 표현
//    - MeshToonMaterial     : 만화풍(셀 셰이딩)
//
//  핵심 개념:
//    PBR(Physically Based Rendering): 빛의 물리 법칙을 시뮬레이션해서
//    현실과 비슷하게 보이게 하는 렌더링 방식
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111827);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 2, 12);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // ──────────────────────────────────────────────────────────
  //  Material 목록
  //
  //  구(Sphere)를 6개 나란히 놓고 재질만 바꿔서 차이를 비교합니다.
  //  같은 조명 아래서 재질이 어떻게 다르게 반응하는지 확인하세요.
  // ──────────────────────────────────────────────────────────

  const materials = [
    {
      name: 'Basic',
      sub: '빛 무시\n항상 동일한 색',
      // MeshBasicMaterial: 조명 계산을 아예 안 함
      // → 빛이 없어도 보임. UI, 아이콘, 디버깅용으로 많이 씀
      mat: new THREE.MeshBasicMaterial({ color: 0x6366f1 }),
    },
    {
      name: 'Lambert',
      sub: '확산광만 계산\n무광 표면',
      // MeshLambertMaterial: 빛의 방향에 따라 밝기가 달라짐
      // 하이라이트(반짝임) 없음. 나뭇잎·천·흙 같은 무광 재질에 적합
      // WebGL 1세대 방식. 빠르지만 덜 사실적
      mat: new THREE.MeshLambertMaterial({ color: 0x10b981 }),
    },
    {
      name: 'Phong',
      sub: '하이라이트 추가\n플라스틱 느낌',
      // MeshPhongMaterial: Lambert + 정반사(specular highlight) 추가
      // shininess: 높을수록 하이라이트가 작고 강렬함 (광택도)
      // 플라스틱·도자기 느낌에 적합
      mat: new THREE.MeshPhongMaterial({
        color: 0xf59e0b,
        shininess: 100,        // 광택도 (기본값 30)
        specular: 0xffffff,    // 하이라이트 색상
      }),
    },
    {
      name: 'Standard',
      sub: 'PBR 재질\nroughness+metalness',
      // MeshStandardMaterial: 현재 Three.js 기본 권장 재질
      // roughness: 0=거울 / 1=완전 무광
      // metalness: 0=비금속 / 1=금속
      mat: new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        roughness: 0.2,
        metalness: 0.8,
      }),
    },
    {
      name: 'Physical',
      sub: 'PBR 고급판\n유리·코팅 표현',
      // MeshPhysicalMaterial: Standard의 확장판
      // clearcoat: 코팅층 (자동차 도색처럼 반짝이는 위층)
      // clearcoatRoughness: 코팅층 거칠기
      mat: new THREE.MeshPhysicalMaterial({
        color: 0xec4899,
        roughness: 0.1,
        metalness: 0.0,
        clearcoat: 1.0,           // 코팅층 강도 (0~1)
        clearcoatRoughness: 0.1,  // 코팅층 거칠기
      }),
    },
    {
      name: 'Toon',
      sub: '만화풍\n셀 셰이딩',
      // MeshToonMaterial: 빛을 계단식으로 표현 → 만화·애니 스타일
      // gradientMap으로 계단 수를 조절할 수 있음
      mat: new THREE.MeshToonMaterial({ color: 0xf97316 }),
    },
  ];

  // ─── 공유 Geometry ─────────────────────────────────────────
  //  Geometry는 모든 구에서 공유합니다.
  //  (같은 뼈대에 옷(재질)만 다르게 입히는 개념)
  //  widthSegments/heightSegments: 높을수록 부드러운 구, 폴리곤 수 증가
  const sharedGeo = new THREE.SphereGeometry(1, 64, 64);

  const meshes = [];
  const spacing = 2.8;
  const totalWidth = (materials.length - 1) * spacing;

  materials.forEach((item, i) => {
    const mesh = new THREE.Mesh(sharedGeo, item.mat);
    mesh.position.x = i * spacing - totalWidth / 2;
    mesh.castShadow = true;
    scene.add(mesh);
    meshes.push(mesh);

    // ── 이름 라벨 (스프라이트) ──────────────────────────────
    //  3D 공간에 텍스트를 붙이는 간단한 방법: Canvas → Texture → Sprite
    const label = makeLabel(item.name, item.sub);
    label.position.set(mesh.position.x, -1.8, 0);
    scene.add(label);
    meshes.push(label); // cleanup 대상에 포함
  });

  // ─── 조명 ──────────────────────────────────────────────────
  //  재질 차이를 잘 보여주려면 조명이 중요합니다.
  //  여러 방향의 빛을 써서 입체감을 줍니다.

  // 전체 환경광 (너무 밝으면 차이가 안 보임 → 약하게)
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  // 주 광원: 오른쪽 위에서 비춤
  const mainLight = new THREE.DirectionalLight(0xffffff, 2.0);
  mainLight.position.set(5, 8, 5);
  mainLight.castShadow = true;
  scene.add(mainLight);

  // 보조 광원: 왼쪽에서 파란빛 (재질의 반사 특성을 더 잘 보여줌)
  const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5);
  fillLight.position.set(-5, 2, -3);
  scene.add(fillLight);

  // ─── 바닥 ──────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(30, 10);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 1 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ─── 애니메이션 ────────────────────────────────────────────
  // [deprecated] const clock = new THREE.Clock();
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 빛을 천천히 회전시켜서 각 재질이 빛에 어떻게 반응하는지 보여줌
    mainLight.position.x = Math.sin(elapsed * 0.5) * 8;
    mainLight.position.z = Math.cos(elapsed * 0.5) * 8;

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

    // 공유 Geometry는 한 번만 dispose
    sharedGeo.dispose();
    floorGeo.dispose();
    floorMat.dispose();

    // 각 재질 및 라벨 dispose
    materials.forEach(({ mat }) => mat.dispose());
    meshes.forEach((obj) => {
      scene.remove(obj);
      // Sprite(라벨)의 경우 material.map(텍스처)도 해제 필요
      if (obj.isSprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
    scene.remove(floor);
    scene.remove(ambient);
    scene.remove(mainLight);
    scene.remove(fillLight);
  };
}

// ──────────────────────────────────────────────────────────────
//  라벨 생성 헬퍼
//
//  Canvas에 텍스트를 그린 뒤 Texture로 변환하고,
//  항상 카메라를 바라보는 Sprite에 붙입니다.
//  → 3D 공간의 간단한 텍스트 표시에 많이 쓰이는 패턴
// ──────────────────────────────────────────────────────────────
function makeLabel(title, subtitle) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // 배경 (반투명)
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 256, 128);

  // 제목
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 128, 48);

  // 부제목 (줄바꿈 처리)
  ctx.fillStyle = '#94a3b8';
  ctx.font = '22px sans-serif';
  subtitle.split('\n').forEach((line, i) => {
    ctx.fillText(line, 128, 80 + i * 26);
  });

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3, 1.5, 1); // 스프라이트 크기 (월드 단위)
  return sprite;
}
