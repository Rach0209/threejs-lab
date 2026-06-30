// ══════════════════════════════════════════════════════════════
//  레슨 네비게이터 UI
//
//  왼쪽에 패널을 만들어서 레슨을 버튼으로 선택할 수 있게 합니다.
//  선택하면 현재 씬을 cleanup 하고 새 레슨을 init 합니다.
// ══════════════════════════════════════════════════════════════

export const LESSONS = [
  {
    id: '01',
    title: 'Geometry 탐색',
    desc: 'Box, Sphere, Cone 등 다양한 3D 도형',
    fileKey: '01-geometry',
    file: () => import('../lessons/01-geometry.js'),
  },
  {
    id: '02',
    title: 'Material 비교',
    desc: 'Basic / Lambert / Phong / Standard / Toon',
    fileKey: '02-materials',
    file: () => import('../lessons/02-materials.js'),
  },
  {
    id: '03',
    title: 'Light 조명 실험실',
    desc: 'Ambient / Directional / Point / Spot / Hemisphere',
    fileKey: '03-lights',
    file: () => import('../lessons/03-lights.js'),
  },
  {
    id: '04',
    title: '태양계 미니 프로젝트',
    desc: '씬 그래프, 공전·자전, 피벗 패턴',
    fileKey: '04-solar-system',
    file: () => import('../lessons/04-solar-system.js'),
  },
  {
    id: '05',
    title: '텍스처와 지구본',
    desc: 'UV 매핑, normalMap, CanvasTexture',
    fileKey: '05-textures',
    file: () => import('../lessons/05-textures.js'),
  },
  {
    id: '06',
    title: '인터랙션 (Raycasting)',
    desc: '마우스 클릭 선택, 키보드 이동',
    fileKey: '06-interaction',
    file: () => import('../lessons/06-interaction.js'),
  },
  {
    id: '07',
    title: 'GLB 모델 임포트',
    desc: 'GLTFLoader, 드래그&드롭, AnimationMixer',
    fileKey: '07-model-loader',
    file: () => import('../lessons/07-model-loader.js'),
  },
  {
    id: '08',
    title: '셰이더 입문 (GLSL)',
    desc: 'Vertex / Fragment 셰이더 직접 작성',
    fileKey: '08-shaders',
    file: () => import('../lessons/08-shaders.js'),
  },
  {
    id: '09',
    title: '물리 엔진 (cannon-es)',
    desc: '중력, 충돌, Three.js ↔ Cannon 동기화',
    fileKey: '09-physics',
    file: () => import('../lessons/09-physics.js'),
  },
  {
    id: '10',
    title: '파티클 시스템',
    desc: '은하수 15,000개 + 부유 파티클',
    fileKey: '10-particles',
    file: () => import('../lessons/10-particles.js'),
  },
  {
    id: '11',
    title: 'Feigenbaum 시각화',
    desc: '혼돈 이론 분기도, 수학 시뮬레이터',
    fileKey: '11-math-viz',
    file: () => import('../lessons/11-math-viz.js'),
  },
  {
    id: '12',
    title: '후처리 효과',
    desc: 'EffectComposer, Bloom, FilmPass',
    fileKey: '12-postprocessing',
    file: () => import('../lessons/12-postprocessing.js'),
  },
  {
    id: '13',
    title: 'InstancedMesh',
    desc: '4,000개를 draw call 1번으로 렌더링',
    fileKey: '13-instancing',
    file: () => import('../lessons/13-instancing.js'),
  },
  {
    id: '14',
    title: 'Environment Map / IBL',
    desc: '이미지 기반 조명, PBR 재질 비교',
    fileKey: '14-environment-map',
    file: () => import('../lessons/14-environment-map.js'),
  },
  {
    id: '15',
    title: '애니메이션 시스템',
    desc: 'AnimationMixer, KeyframeTrack, Morph Targets',
    fileKey: '15-animation',
    file: () => import('../lessons/15-animation.js'),
  },
  {
    id: '16',
    title: '절차적 지형 생성',
    desc: 'Simplex Noise, FBM, vertexColors, 높이맵',
    fileKey: '16-terrain',
    file: () => import('../lessons/16-terrain.js'),
  },
  {
    id: '17',
    title: 'Toon / Cel Shading',
    desc: 'MeshToonMaterial, GradientMap, BackFace 외곽선, GLSL',
    fileKey: '17-toon-shading',
    file: () => import('../lessons/17-toon-shading.js'),
  },
  {
    id: '18',
    title: 'Raycasting 심화',
    desc: '드래그 이동, 오브젝트 배치/삭제, 격자 스냅',
    fileKey: '18-raycasting-advanced',
    file: () => import('../lessons/18-raycasting-advanced.js'),
  },
  {
    id: '19',
    title: 'Reflection & Refraction',
    desc: 'CubeCamera, 실시간 반사, MeshPhysicalMaterial 굴절',
    fileKey: '19-reflection',
    file: () => import('../lessons/19-reflection.js'),
  },
  {
    id: '20',
    title: 'Shadow 심화',
    desc: 'ShadowMap 종류, Bias, Shadow Camera, PCF/VSM',
    fileKey: '20-shadows',
    file: () => import('../lessons/20-shadows.js'),
  },
  {
    id: '21',
    title: 'LOD (Level of Detail)',
    desc: 'THREE.LOD, 거리별 메시 교체, 폴리곤 최적화',
    fileKey: '21-lod',
    file: () => import('../lessons/21-lod.js'),
  },
  {
    id: '22',
    title: 'Sprite / Billboard',
    desc: 'SpriteMaterial, 이름표/체력바, 아틀라스 애니메이션',
    fileKey: '22-sprites',
    file: () => import('../lessons/22-sprites.js'),
  },
  {
    id: '23',
    title: '커스텀 BufferGeometry',
    desc: 'Float32Array, 튜브/뫼비우스/파라메트릭 곡면 직접 구성',
    fileKey: '23-buffer-geometry',
    file: () => import('../lessons/23-buffer-geometry.js'),
  },
  {
    id: '24',
    title: '3D 공간음 (Web Audio)',
    desc: 'AudioListener, PositionalAudio, FFT 시각화',
    fileKey: '24-audio',
    file: () => import('../lessons/24-audio.js'),
  },
  {
    id: '25',
    title: 'RenderTarget / FBO',
    desc: 'CCTV 모니터, 포탈, 미니맵 — 텍스처에 씬 렌더링',
    fileKey: '25-render-target',
    file: () => import('../lessons/25-render-target.js'),
  },
];

const PANEL_WIDTH = 260; // 펼친 상태 패널 너비 (px)
const COLLAPSED_WIDTH = 0;
const TOGGLE_SIZE = 36;
const TOGGLE_MARGIN = 8;

export function createNav(onSelect) {
  // ─── 패널 컨테이너 ──────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'nav-panel';
  panel.innerHTML = `
    <div class="nav-header">
      <span class="nav-logo">⬡</span>
      <span class="nav-title">Web 3D Lab</span>
    </div>
    <div class="nav-body">
      <p class="nav-section-title">MODULES</p>
      <ul id="lesson-list"></ul>
    </div>
  `;
  document.body.appendChild(panel);

  // ─── 토글 버튼 — 패널 바깥에 독립적으로 배치 ─────────────────
  //  패널 안에 두면 패널이 접힐 때 같이 숨어버리므로
  //  body에 직접 붙이고 JS로 위치를 제어합니다.
  const toggle = document.createElement('button');
  toggle.id = 'nav-toggle';
  toggle.title = '패널 열기/닫기';
  toggle.textContent = '☰';
  document.body.appendChild(toggle);

  let collapsed = false;

  function updateTogglePos() {
    // 패널 오른쪽 모서리 바로 옆에 버튼 위치
    const left = collapsed ? TOGGLE_MARGIN : PANEL_WIDTH - TOGGLE_SIZE - TOGGLE_MARGIN;
    toggle.style.left = left + 'px';
  }

  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    updateTogglePos();
  });

  updateTogglePos(); // 초기 위치 설정

  // ─── 레슨 버튼 생성 ─────────────────────────────────────────
  const list = panel.querySelector('#lesson-list');
  LESSONS.forEach((lesson) => {
    const li = document.createElement('li');
    li.className = 'lesson-item';
    li.dataset.id = lesson.id;
    li.innerHTML = `
      <button class="lesson-btn">
        <span class="lesson-id">${lesson.id}</span>
        <span class="lesson-info">
          <strong>${lesson.title}</strong>
          <small>${lesson.desc}</small>
        </span>
      </button>
    `;
    li.querySelector('.lesson-btn').addEventListener('click', () => {
      setActive(lesson.id);
      onSelect(lesson);
    });
    list.appendChild(li);
  });

  // 외부에서 활성 레슨을 지정할 수 있도록 반환
  function setActive(lessonId) {
    panel.querySelectorAll('.lesson-item').forEach(el => el.classList.remove('active'));
    const target = panel.querySelector(`[data-id="${lessonId}"]`);
    if (target) target.classList.add('active');
  }

  return { panel, setActive };
}
