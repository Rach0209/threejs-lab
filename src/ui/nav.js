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
