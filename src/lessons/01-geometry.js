// ══════════════════════════════════════════════════════════════
//  Module 1-2: Geometry 탐색 — 도형 전시장
//
//  배울 것:
//    - Scene / Camera / Renderer 의 역할
//    - 다양한 Geometry 종류
//    - Mesh = Geometry + Material
//    - AmbientLight / DirectionalLight 기초
//    - requestAnimationFrame 애니메이션 루프
//    - Math.sin() 으로 반복 운동 만들기
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';  // r168+ 에서 THREE.Clock 대체
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// init()과 cleanup()을 export 합니다.
// main.js 에서 레슨을 전환할 때 이 함수들을 호출합니다.
export function init(renderer) {

  // ─── Scene ─────────────────────────────────────────────────
  //  모든 오브젝트가 존재하는 "세계"
  //  add() 로 오브젝트를 넣고, remove() 로 꺼냅니다.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  // ─── Camera ────────────────────────────────────────────────
  //  PerspectiveCamera: 사람 눈처럼 원근감 있는 카메라
  //  fov(60)  : 시야각. 클수록 광각(더 넓게 보임)
  //  near/far : 이 범위 밖의 오브젝트는 렌더링 안 됨
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 6, 14);

  // ─── OrbitControls ─────────────────────────────────────────
  //  마우스로 씬을 조작할 수 있게 해주는 헬퍼
  //  좌클릭 드래그 → 회전 / 휠 → 줌 / 우클릭 드래그 → 패닝
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;   // 관성 효과
  controls.dampingFactor = 0.05;

  // ─── 도형 목록 ─────────────────────────────────────────────
  //  [Geometry, 색상HEX, 이름]
  //  Geometry: 형태의 뼈대 (꼭짓점 위치, 면 구성 정보)
  const shapes = [
    [new THREE.BoxGeometry(1.5, 1.5, 1.5),           0xe74c3c, 'Box\n직육면체'],
    [new THREE.SphereGeometry(0.9, 32, 32),           0x3498db, 'Sphere\n구'],
    [new THREE.ConeGeometry(0.9, 1.8, 32),            0x2ecc71, 'Cone\n원뿔'],
    [new THREE.CylinderGeometry(0.6, 0.6, 1.8, 32),  0xf39c12, 'Cylinder\n원기둥'],
    [new THREE.TorusGeometry(0.7, 0.3, 16, 60),       0x9b59b6, 'Torus\n도넛'],
    [new THREE.TorusKnotGeometry(0.6, 0.2, 100, 16),  0x1abc9c, 'TorusKnot\n꼬인 도넛'],
    [new THREE.OctahedronGeometry(1.0),               0xe67e22, 'Octahedron\n8면체'],
    [new THREE.IcosahedronGeometry(1.0),              0xe91e63, 'Icosahedron\n20면체'],
  ];

  const cols = 4;
  const spacingX = 4;
  const spacingZ = 4;
  const meshes = []; // 나중에 cleanup 시 메모리 해제에 사용

  shapes.forEach(([geometry, color, name], index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    // ── Material ───────────────────────────────────────────
    //  MeshStandardMaterial: PBR(물리 기반 렌더링) 재질
    //  → 빛을 받아야 보임. 빛 없으면 새까매짐
    //  roughness: 0=반짝이는 표면 / 1=무광 표면
    //  metalness: 0=비금속 / 1=금속 느낌
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.2,
    });

    // ── Mesh = Geometry + Material ─────────────────────────
    //  실제 씬에 놓이는 오브젝트
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = col * spacingX - (cols - 1) * spacingX / 2;
    mesh.position.z = row * spacingZ - spacingZ / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.name = name;

    scene.add(mesh);
    meshes.push({ mesh, geometry, material });
  });

  // ─── 바닥 ──────────────────────────────────────────────────
  //  PlaneGeometry는 기본적으로 XY 평면 → 눕히려면 X축으로 -90도 회전
  const floorGeo = new THREE.PlaneGeometry(30, 30);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x16213e, roughness: 0.9 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2; // Math.PI = 180도. /2 = 90도
  floor.position.y = -1.2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ─── 조명 ──────────────────────────────────────────────────
  //  AmbientLight: 방향 없이 씬 전체를 균일하게 밝힘 (그림자 없음)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  //  DirectionalLight: 방향이 있는 빛 (태양광과 유사)
  //  그림자를 만들 수 있음
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(8, 15, 8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;  // 그림자 해상도
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);

  // ─── 축 헬퍼 ───────────────────────────────────────────────
  //  X=빨강, Y=초록, Z=파랑
  scene.add(new THREE.AxesHelper(3));

  // ─── 애니메이션 루프 ────────────────────────────────────────
  //  requestAnimationFrame: 브라우저가 다음 프레임을 그릴 준비됐을 때
  //  animate() 를 호출 → 보통 초당 60회 (60fps)

  // THREE.Timer (r168+): THREE.Clock 의 공식 대체제
  // 차이점:
  //   Clock  → getElapsedTime() / getDelta() 를 호출할 때마다 내부 시간 갱신
  //   Timer  → update() 를 먼저 호출해서 시간을 확정한 뒤 읽어야 함
  //            → 한 프레임에 여러 번 getDelta() 호출해도 일관된 값 반환
  //
  // [deprecated - 사용하지 말 것]
  // const clock = new THREE.Clock();
  // const elapsed = clock.getElapsedTime();
  const timer = new Timer();
  let animId; // cancelAnimationFrame 으로 루프를 멈추기 위해 ID 저장

  function animate() {
    animId = requestAnimationFrame(animate);

    timer.update();                     // 반드시 프레임 시작 시 호출
    const elapsed = timer.getElapsed(); // 경과 시간(초)

    // 각 도형을 살짝씩 다른 위상으로 위아래 둥실둥실
    // Math.sin(x): -1 ~ 1 사이를 반복하는 파형 함수
    meshes.forEach(({ mesh }) => {
      mesh.rotation.y = elapsed * 0.5;
      mesh.position.y = Math.sin(elapsed + mesh.position.x * 0.5) * 0.3;
    });

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

  // ─── cleanup 반환 ──────────────────────────────────────────
  //  레슨을 떠날 때 main.js 가 이 함수를 호출합니다.
  //  GPU 메모리 누수를 막기 위해 반드시 dispose() 해야 합니다!
  return function cleanup() {
    cancelAnimationFrame(animId);          // 애니메이션 루프 정지
    timer.dispose();                       // Timer 내부 리소스 정리
    window.removeEventListener('resize', onResize);

    // Geometry 와 Material 은 GPU 메모리를 점유합니다.
    // scene.remove() 만으로는 GPU 메모리가 해제되지 않습니다!
    meshes.forEach(({ mesh, geometry, material }) => {
      scene.remove(mesh);
      geometry.dispose();   // GPU 에서 Geometry 메모리 해제
      material.dispose();   // GPU 에서 Material 메모리 해제
    });
    scene.remove(floor);
    floorGeo.dispose();
    floorMat.dispose();

    controls.dispose();     // 이벤트 리스너 정리
  };
}
