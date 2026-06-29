// ══════════════════════════════════════════════════════════════
//  Module 1-4: Light 종류와 효과 — 조명 실험실
//
//  배울 것:
//    - AmbientLight      : 방향 없는 전체 환경광
//    - DirectionalLight  : 방향 있는 평행광 (태양)
//    - PointLight        : 전구처럼 사방으로 퍼지는 빛
//    - SpotLight         : 원뿔 형태의 집중 조명
//    - HemisphereLight   : 하늘/땅 색을 각각 지정하는 환경광
//
//  핵심 개념:
//    - 빛의 intensity(강도)와 color(색)
//    - castShadow / receiveShadow
//    - Light Helper: 빛의 위치와 방향을 시각화
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 8, 18);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 1, 0);

  renderer.shadowMap.enabled = true;
  // [deprecated] THREE.PCFSoftShadowMap → r185에서 PCFShadowMap으로 통합
  renderer.shadowMap.type = THREE.PCFShadowMap; // 부드러운 그림자 (기본값)

  // ─── 5가지 조명 구역 설정 ───────────────────────────────────
  //  각 조명을 X축 방향으로 나란히 배치해서 나란히 비교합니다.

  const sections = [
    { name: 'Ambient',     sub: '전체 균일 조명\n그림자 없음',   x: -16 },
    { name: 'Directional', sub: '태양광 (평행)\n그림자 생성',     x: -8  },
    { name: 'Point',       sub: '전구 (구형 방사)\n거리에 따라 감쇠', x: 0  },
    { name: 'Spot',        sub: '집중 조명 (원뿔)\n각도·거리 조절', x: 8  },
    { name: 'Hemisphere',  sub: '하늘+땅 2색\n자연스러운 환경광', x: 16 },
  ];

  const disposables = []; // cleanup 대상 모음

  sections.forEach(({ name, sub, x }) => {

    // ── 각 구역에 동일한 오브젝트 배치 ──────────────────────────
    //  같은 오브젝트에 빛만 다르게 적용해야 차이가 명확히 보임

    // 구
    const sphereGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6, metalness: 0.1 });
    const sphere = new THREE.Mesh(sphereGeo, mat);
    sphere.position.set(x, 1.5, 0);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    scene.add(sphere);
    disposables.push({ geo: sphereGeo, mat });

    // 바닥 판
    const floorGeo = new THREE.PlaneGeometry(6, 8);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0, 0);
    floor.receiveShadow = true;
    scene.add(floor);
    disposables.push({ geo: floorGeo, mat: floorMat });

    // 뒷벽
    const wallGeo = new THREE.PlaneGeometry(6, 5);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(x, 2.5, -3.5);
    wall.receiveShadow = true;
    scene.add(wall);
    disposables.push({ geo: wallGeo, mat: wallMat });

    // 라벨
    const label = makeLabel(name, sub);
    label.position.set(x, -0.4, 0);
    scene.add(label);
    disposables.push({ label });

    // ── 조명 추가 ───────────────────────────────────────────
    addLightForSection(scene, name, x, disposables);
  });

  // ─── 애니메이션 ────────────────────────────────────────────
  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
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
    window.removeEventListener('resize', onResize);
    controls.dispose();
    renderer.shadowMap.enabled = false;

    disposables.forEach(({ geo, mat, label, light, helper }) => {
      if (geo) geo.dispose();
      if (mat) mat.dispose();
      if (label) {
        scene.remove(label);
        label.material.map?.dispose();
        label.material.dispose();
      }
      if (light) scene.remove(light);
      if (helper) scene.remove(helper);
    });
    // scene 전체 정리
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

// ──────────────────────────────────────────────────────────────
//  조명 생성 — 구역별로 다른 빛 추가
// ──────────────────────────────────────────────────────────────
function addLightForSection(scene, name, x, disposables) {
  let light, helper;

  switch (name) {
    case 'Ambient': {
      // AmbientLight: 방향 없음, 그림자 없음
      // 씬 전체를 균일하게 밝힘 → 단독 사용 시 입체감 없이 평면적으로 보임
      // 보통 다른 Light와 함께 "어두운 면을 살짝 밝히는" 보조 역할로 사용
      //
      // ⚠️ 구조적 한계:
      //   AmbientLight는 위치/방향 개념이 없어 씬 전체에 영향을 줍니다.
      //   따라서 이 빛은 옆 구역들도 약간 밝힙니다.
      //   완전히 격리하려면 구역마다 별도 Scene + RenderTarget이 필요합니다.
      //   (현재는 학습 편의상 하나의 씬을 공유합니다)
      light = new THREE.AmbientLight(0xffffff, 2.0);
      break;
    }

    case 'Directional': {
      // DirectionalLight: 특정 방향으로 오는 평행광
      // position → target 방향으로 빛이 날아옴 (거리는 감쇠 없음)
      // 태양처럼 멀리서 오는 빛 표현에 적합
      light = new THREE.DirectionalLight(0xffd700, 2.5);
      light.position.set(x + 2, 6, 3);
      light.target.position.set(x, 0, 0);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      scene.add(light.target);

      // DirectionalLightHelper: 빛의 방향을 화살표로 시각화
      helper = new THREE.DirectionalLightHelper(light, 1, 0xffd700);
      scene.add(helper);
      break;
    }

    case 'Point': {
      // PointLight: 한 점에서 사방으로 빛을 발산 (전구)
      // distance: 빛이 닿는 최대 거리 (0=무한)
      // decay: 거리에 따른 감쇠율 (2=물리적으로 정확)
      light = new THREE.PointLight(0xff6633, 5, 12, 2);
      light.position.set(x, 4, 1);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);

      // PointLightHelper: 전구 위치를 구로 표시
      helper = new THREE.PointLightHelper(light, 0.3, 0xff6633);
      scene.add(helper);
      break;
    }

    case 'Spot': {
      // SpotLight: 원뿔 형태의 집중 조명 (무대 조명, 손전등)
      // angle: 원뿔의 반각 (Math.PI/6 = 30도)
      // penumbra: 원뿔 가장자리의 부드러움 (0=날카로움, 1=매우 부드러움)
      // decay: 거리 감쇠
      light = new THREE.SpotLight(0x44aaff, 8, 15, Math.PI / 6, 0.4, 2);
      light.position.set(x, 7, 2);
      light.target.position.set(x, 0, 0);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      scene.add(light.target);

      // SpotLightHelper: 원뿔 형태를 선으로 시각화
      helper = new THREE.SpotLightHelper(light, 0x44aaff);
      scene.add(helper);
      break;
    }

    case 'Hemisphere': {
      // HemisphereLight: 하늘색과 땅색을 각각 지정
      // → 위에서 skyColor, 아래(반사)에서 groundColor
      // 실외 씬의 자연스러운 환경광 표현에 많이 사용
      light = new THREE.HemisphereLight(
        0x87ceeb, // skyColor: 하늘 (하늘색)
        0x8b6914, // groundColor: 땅 (흙색)
        2.5
      );
      light.position.set(x, 5, 0);

      // HemisphereLightHelper: 반구 형태 시각화
      helper = new THREE.HemisphereLightHelper(light, 1);
      scene.add(helper);
      break;
    }
  }

  if (light) {
    scene.add(light);
    disposables.push({ light, helper });
  }
}

// ─── 라벨 헬퍼 ────────────────────────────────────────────────
function makeLabel(title, subtitle) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 128, 40);
  ctx.fillStyle = '#64748b';
  ctx.font = '20px sans-serif';
  subtitle.split('\n').forEach((line, i) => ctx.fillText(line, 128, 68 + i * 24));
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(3.5, 1.75, 1);
  return sprite;
}
