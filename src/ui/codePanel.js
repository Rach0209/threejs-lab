// ══════════════════════════════════════════════════════════════
//  우측 소스 코드 패널
//
//  - 현재 레슨의 소스 파일을 불러와 하이라이팅해서 표시
//  - Vite의 ?raw 쿼리: JS 파일을 문자열로 직접 import
//  - highlight.js: 코드 구문 강조
// ══════════════════════════════════════════════════════════════

import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import glsl from 'highlight.js/lib/languages/glsl';
import 'highlight.js/styles/atom-one-dark.css';

// highlight.js에 사용할 언어 등록 (필요한 것만 골라서 bundle 크기 절약)
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('glsl', glsl);

// ── Vite import.meta.glob으로 모든 레슨 파일을 raw 문자열로 미리 로드 ──
//  ?raw : 파일 내용을 실행하지 않고 문자열로 가져옴
//  import: 'default' : default export(문자열) 만 가져옴
//  eager: false : 처음에 로드하지 않고 필요할 때 로드 (lazy)
const rawSources = import.meta.glob('../lessons/*.js', {
  query: '?raw',
  import: 'default',
  eager: false,
});

// 파일명 → raw source 로더 함수 맵
// 예: '01-geometry' → () => import('../lessons/01-geometry.js?raw')
const sourceMap = {};
for (const path in rawSources) {
  // '../lessons/01-geometry.js' → '01-geometry'
  const key = path.replace('../lessons/', '').replace('.js', '');
  sourceMap[key] = rawSources[path];
}

export function createCodePanel() {
  // ─── 패널 DOM 생성 ──────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'code-panel';
  panel.innerHTML = `
    <div class="code-panel-header">
      <span class="code-panel-title">
        <span class="code-icon">{ }</span>
        <span class="code-filename" id="code-filename">소스 코드</span>
      </span>
      <div class="code-header-actions">
        <button id="copy-btn" title="코드 복사">⎘ 복사</button>
      </div>
    </div>
    <div class="code-panel-body">
      <pre id="code-pre"><code id="code-block" class="language-javascript">레슨을 선택하면 소스 코드가 여기 표시됩니다.</code></pre>
    </div>
  `;
  document.body.appendChild(panel);

  // 토글 버튼은 패널 바깥(body)에 독립 배치 — nav와 동일한 패턴
  const toggle = document.createElement('button');
  toggle.id = 'code-toggle';
  toggle.title = '소스 코드 패널 열기/닫기';
  toggle.textContent = '{ }';
  document.body.appendChild(toggle);

  const codeBlock    = panel.querySelector('#code-block');
  const codeFilename = panel.querySelector('#code-filename');
  const copyBtn      = panel.querySelector('#copy-btn');

  const PANEL_WIDTH = 480;

  let collapsed = true; // 기본 닫힘
  panel.classList.add('collapsed');

  function updateToggle() {
    toggle.style.right = collapsed ? '0px' : `${PANEL_WIDTH}px`;
    // 버튼 방향 화살표로 상태 표시: 닫힘=왼쪽 화살표(열기), 열림=오른쪽 화살표(닫기)
    toggle.textContent = collapsed ? '◀' : '▶';
  }
  updateToggle();

  // ─── 토글 버튼 ─────────────────────────────────────────────
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    updateToggle();
  });

  // ─── 복사 버튼 ─────────────────────────────────────────────
  copyBtn.addEventListener('click', async () => {
    const raw = codeBlock.dataset.raw || '';
    if (!raw) return;
    await navigator.clipboard.writeText(raw);
    copyBtn.textContent = '✓ 복사됨';
    setTimeout(() => { copyBtn.textContent = '⎘ 복사'; }, 1500);
  });

  // ─── 소스 로드 함수 ─────────────────────────────────────────
  //  레슨 전환 시 main.js가 이 함수를 호출합니다.
  async function loadSource(lessonId, lessonTitle) {
    codeFilename.textContent = lessonTitle || lessonId;
    codeBlock.textContent = '⏳ 로딩 중...';

    const loader = sourceMap[lessonId];
    if (!loader) {
      codeBlock.textContent = '소스 파일을 찾을 수 없습니다.';
      return;
    }

    // 파일 내용 가져오기 (문자열)
    const source = await loader();

    // 원본 텍스트 저장 (복사용)
    codeBlock.dataset.raw = source;

    // highlight.js 로 구문 강조 적용
    const result = hljs.highlight(source, { language: 'javascript' });
    codeBlock.innerHTML = result.value;

    // 패널 상태(열림/닫힘)는 유지 — 토글 버튼으로만 제어
    // 스크롤 맨 위로
    panel.querySelector('.code-panel-body').scrollTop = 0;
  }

  return { loadSource };
}
