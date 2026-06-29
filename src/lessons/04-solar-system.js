// ══════════════════════════════════════════════════════════════
//  Module 1-5: 태양계 미니 프로젝트 (Module 1 종합)
//
//  배울 것:
//    - Object3D: 부모-자식 계층 구조 (씬 그래프)
//    - 공전과 자전: 피벗(pivot) 오브젝트 패턴
//    - EmissiveMaterial: 스스로 빛나는 재질 (태양)
//    - 궤도 라인: LineLoop 으로 원 그리기
//
//  핵심 개념 — 씬 그래프 (Scene Graph):
//    Three.js 에서 오브젝트는 부모-자식 관계를 가집니다.
//    자식은 부모의 좌표계를 기준으로 움직입니다.
//
//    태양(고정)
//      └── 지구 피벗(공전 중) ← 이걸 회전시키면 지구가 태양 주위를 돎
//            └── 지구(자전 중)
//                  └── 달 피벗(공전 중)
//                        └── 달
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000008);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 30, 60);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  renderer.shadowMap.enabled = true;

  const disposables = [];

  // ─── 별 배경 ────────────────────────────────────────────────
  //  수천 개의 점(Points)으로 별 배경 구현
  //  BufferGeometry: 꼭짓점 데이터를 배열로 직접 다루는 방식
  //  → 대량의 점/선/면을 효율적으로 처리할 때 사용
  const starCount = 3000;
  const starPositions = new Float32Array(starCount * 3); // x,y,z × 3000
  for (let i = 0; i < starCount * 3; i++) {
    starPositions[i] = (Math.random() - 0.5) * 800;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, sizeAttenuation: true });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  disposables.push({ geo: starGeo, mat: starMat });

  // ─── 태양 ────────────────────────────────────────────────────
  //  MeshStandardMaterial의 emissive 속성:
  //  빛을 받지 않아도 스스로 빛나는 색. emissiveIntensity로 강도 조절
  const sunGeo = new THREE.SphereGeometry(4, 32, 32);
  const sunMat = new THREE.MeshStandardMaterial({
    color: 0xffdd00,
    emissive: 0xff8800,      // 자체 발광 색
    emissiveIntensity: 0.8,  // 발광 강도
    roughness: 1,
    metalness: 0,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.castShadow = false;
  scene.add(sun);
  disposables.push({ geo: sunGeo, mat: sunMat });

  // 태양이 내뿜는 빛 (PointLight)
  const sunLight = new THREE.PointLight(0xffffff, 2, 300, 0.5);
  scene.add(sunLight);
  disposables.push({ light: sunLight });

  // ─── 행성 데이터 ────────────────────────────────────────────
  const planetData = [
    { name: '수성', radius: 0.6, distance: 10, speed: 4.0,  color: 0xaaaaaa, tilt: 0 },
    { name: '금성', radius: 1.0, distance: 15, speed: 1.6,  color: 0xe8cda0, tilt: 0 },
    { name: '지구', radius: 1.1, distance: 22, speed: 1.0,  color: 0x2266cc, tilt: 0.41,
      moon: { radius: 0.3, distance: 3, speed: 13.4, color: 0xaaaaaa } },
    { name: '화성', radius: 0.7, distance: 30, speed: 0.53, color: 0xcc4400, tilt: 0 },
    { name: '목성', radius: 2.5, distance: 44, speed: 0.08, color: 0xc88b3a, tilt: 0 },
    { name: '토성', radius: 2.0, distance: 58, speed: 0.03, color: 0xe4d191, tilt: 0.46, ring: true },
  ];

  const planets = []; // 애니메이션에서 쓸 데이터

  planetData.forEach(({ name, radius, distance, speed, color, tilt, moon, ring }) => {

    // ── 피벗(Pivot) 패턴 ────────────────────────────────────
    //  공전을 구현하는 핵심 패턴:
    //  빈 Object3D(피벗)를 원점에 놓고 그 자식으로 행성을 붙임
    //  피벗을 Y축으로 회전시키면 → 행성이 원점(태양) 주위를 공전
    const pivot = new THREE.Object3D();
    scene.add(pivot);

    const planetGeo = new THREE.SphereGeometry(radius, 32, 32);
    const planetMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.x = distance; // 태양에서의 거리
    planet.rotation.z = tilt;     // 자전축 기울기
    planet.castShadow = true;
    planet.receiveShadow = true;
    pivot.add(planet);
    disposables.push({ geo: planetGeo, mat: planetMat });

    // 궤도 라인 (원)
    const orbitLine = makeOrbitLine(distance);
    scene.add(orbitLine);
    disposables.push({ orbitLine });

    // 토성 링
    if (ring) {
      const ringGeo = new THREE.RingGeometry(radius * 1.4, radius * 2.4, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xd4bc7c,
        side: THREE.DoubleSide,  // 앞뒤 모두 렌더링
        transparent: true,
        opacity: 0.7,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2.5;
      planet.add(ringMesh); // 행성의 자식으로 → 행성과 함께 공전
      disposables.push({ geo: ringGeo, mat: ringMat });
    }

    // 위성(달)
    let moonPivot = null;
    if (moon) {
      moonPivot = new THREE.Object3D();
      planet.add(moonPivot); // 지구의 자식 → 지구와 함께 공전

      const moonGeo = new THREE.SphereGeometry(moon.radius, 16, 16);
      const moonMat = new THREE.MeshStandardMaterial({ color: moon.color, roughness: 0.9 });
      const moonMesh = new THREE.Mesh(moonGeo, moonMat);
      moonMesh.position.x = moon.distance;
      moonPivot.add(moonMesh);
      disposables.push({ geo: moonGeo, mat: moonMat });
    }

    planets.push({ pivot, planet, moonPivot, speed, moonSpeed: moon?.speed ?? 0 });
  });

  // 약한 환경광 (완전 어둡지 않게)
  const ambientLight = new THREE.AmbientLight(0x111133, 0.5);
  scene.add(ambientLight);
  disposables.push({ light: ambientLight });

  // ─── 애니메이션 ────────────────────────────────────────────
  // [deprecated] const clock = new THREE.Clock();
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 태양 자전
    sun.rotation.y = elapsed * 0.2;

    // 행성 공전(피벗 회전) + 자전
    planets.forEach(({ pivot, planet, moonPivot, speed, moonSpeed }) => {
      pivot.rotation.y = elapsed * speed * 0.3;
      planet.rotation.y = elapsed * 0.5;
      if (moonPivot) moonPivot.rotation.y = elapsed * moonSpeed * 0.3;
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

  // ─── cleanup ──────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    disposables.forEach(({ geo, mat, light, orbitLine }) => {
      if (geo) geo.dispose();
      if (mat) mat.dispose();
      if (light) scene.remove(light);
      if (orbitLine) {
        scene.remove(orbitLine);
        orbitLine.geometry.dispose();
        orbitLine.material.dispose();
      }
    });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

// ─── 궤도 원 생성 ─────────────────────────────────────────────
//  LineLoop: 마지막 점과 첫 점을 자동으로 연결해서 닫힌 선을 만듦
function makeOrbitLine(radius) {
  const segments = 128;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.5 });
  return new THREE.LineLoop(geo, mat);
}
