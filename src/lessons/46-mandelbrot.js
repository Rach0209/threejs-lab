// ══════════════════════════════════════════════════════════════
//  레슨 46: Mandelbrot — 2D 프랙탈
//
//  📌 아주 단순한 수식 하나를 반복하면 무한히 복잡한 무늬가 나옵니다!
//
//  배울 것:
//    - 복소수 반복 수식  : z = z² + c
//    - 탈출 시간(Escape Time) 알고리즘 : 발산까지 걸린 반복 횟수로 색칠
//    - Smooth Coloring   : 정수 반복 횟수 대신 연속값을 써서 밴딩(띠) 제거
//    - Cosine 팔레트      : a + b·cos(2π(c·t+d)) 공식으로 색상 순환
//    - 커서 중심 줌        : 마우스가 가리키는 복소수 좌표를 고정한 채 확대
//
//  조작:
//    마우스 드래그  — 화면 이동 (팬)
//    휠            — 커서 위치 기준 확대/축소
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';

const vertexShader = /* glsl */`
void main() { gl_Position = vec4(position, 1.0); }
`;

const fragmentShader = /* glsl */`
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uCenter;
uniform float uZoom;
uniform float uPalette;
uniform float uMaxIter;

const float BASE_SCALE   = 2.5;
const int   MAX_ITER_HARD = 500;   // 컴파일타임 상한 (루프는 반드시 상수 범위)
const float BAILOUT2      = 256.0; // 반지름 16 → smooth coloring 밴딩 감소

// ══════════════════════════════════════════════════════════════
//  ① Mandelbrot 반복
//     z_{n+1} = z_n² + c   (복소수 곱셈은 vec2로 직접 전개)
//     |z| > 4 (여기선 16) 를 넘으면 "발산 확정"으로 보고 탈출
// ══════════════════════════════════════════════════════════════
float mandelbrot(vec2 c) {
  vec2 z = vec2(0.0);

  for (int n = 0; n < MAX_ITER_HARD; n++) {
    // uniform int 대신 float 비교 (HLSL uniform-int 버그 회피 컨벤션 유지)
    if (float(n) >= uMaxIter) return -1.0;  // 반복 한도 도달 → 집합 내부

    // 복소수 제곱: (x+yi)² = (x²-y²) + (2xy)i
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;

    float d2 = dot(z, z);
    if (d2 > BAILOUT2) {
      // Smooth Iteration Count:
      // 정수 n 대신 로그 스케일 보정값을 써서 등고선 밴딩을 없앰
      float smoothN = float(n) - log2(log2(d2)) + 4.0;
      return smoothN;
    }
  }
  return -1.0;
}

// ══════════════════════════════════════════════════════════════
//  ② Cosine 팔레트 — a + b·cos(2π(c·t + d))
//     4개 벡터만으로 부드럽게 순환하는 색상표를 만드는 공식
//     (IQ의 palette 기법 — 레슨 44 대리석/행성에서 쓴 색상보간의 일반형)
// ══════════════════════════════════════════════════════════════
vec3 palette(float t) {
  vec3 a, b, c, d;
  if (uPalette < 0.5) {
    // Classic — 짙은 파랑 ↔ 주황
    a = vec3(0.50, 0.50, 0.50); b = vec3(0.50, 0.50, 0.50);
    c = vec3(1.00, 1.00, 1.00); d = vec3(0.00, 0.10, 0.20);
  } else if (uPalette < 1.5) {
    // Fire — 검정 → 빨강 → 노랑 → 흰색
    a = vec3(0.55, 0.35, 0.20); b = vec3(0.55, 0.40, 0.30);
    c = vec3(1.00, 0.80, 0.50); d = vec3(0.00, 0.15, 0.30);
  } else {
    // Rainbow — 전체 색상환 순환
    a = vec3(0.50, 0.50, 0.50); b = vec3(0.50, 0.50, 0.50);
    c = vec3(1.00, 1.00, 1.00); d = vec3(0.00, 0.33, 0.67);
  }
  return a + b * cos(6.28318 * (c * t + d));
}

// ══════════════════════════════════════════════════════════════
//  ③ 메인
// ══════════════════════════════════════════════════════════════
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec2 c  = uCenter + uv * (BASE_SCALE / uZoom);

  float iter = mandelbrot(c);

  vec3 col;
  if (iter < 0.0) {
    col = vec3(0.0);  // 집합 내부 = 검정
  } else {
    float t = fract(iter * 0.025 + uTime * 0.015);
    col = palette(t);
  }

  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ──────────────────────────────────────────────────────────────
export function init(renderer) {

  const rmScene  = new THREE.Scene();
  const rmCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const timer    = new Timer();
  let animId;

  const DEFAULT_CENTER = { x: -0.5, y: 0.0 };
  const DEFAULT_ZOOM   = 1.0;

  const center = { ...DEFAULT_CENTER };
  let zoom = DEFAULT_ZOOM;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCenter:     { value: new THREE.Vector2(center.x, center.y) },
    uZoom:       { value: zoom },
    uPalette:    { value: 0.0 },
    uMaxIter:    { value: 150.0 },
  };

  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  rmScene.add(new THREE.Mesh(geo, mat));
  renderer.shadowMap.enabled = false;

  const canvas = renderer.domElement;

  function syncUniforms() {
    uniforms.uCenter.value.set(center.x, center.y);
    uniforms.uZoom.value = zoom;
  }

  // 확대할수록 디테일이 필요하므로 최대 반복 횟수를 자동으로 늘림
  function autoMaxIter() {
    const boosted = 150 + Math.log2(Math.max(zoom, 1)) * 22;
    uniforms.uMaxIter.value = Math.min(500, Math.max(80, boosted));
    updateZoomLabel();
  }

  const BASE_SCALE_JS = 2.5;  // 셰이더의 BASE_SCALE과 반드시 동일한 값 유지

  // ─── 드래그 팬 ───────────────────────────────────────────
  let dragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragStartCenter = { x: 0, y: 0 };

  const onDown = e => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartCenter = { ...center };
  };

  const onMove = e => {
    if (!dragging) return;
    const dprX  = canvas.width / canvas.clientWidth;
    const dxCss = e.clientX - dragStartX;
    const dyCss = e.clientY - dragStartY;

    // 화면 픽셀 이동량을 복소평면 좌표 이동량으로 환산
    // (gl_FragCoord는 y가 위로 갈수록 증가 → DOM 좌표계와 y축 반전)
    const duvx = (dxCss * dprX) / canvas.height;
    const duvy = -(dyCss * dprX) / canvas.height;
    const scale = BASE_SCALE_JS / zoom;

    center.x = dragStartCenter.x - duvx * scale;
    center.y = dragStartCenter.y - duvy * scale;
    syncUniforms();
  };

  const onUp = () => { dragging = false; };

  // ─── 커서 중심 줌 ────────────────────────────────────────
  const onWheel = e => {
    const rect  = canvas.getBoundingClientRect();
    const dprX  = canvas.width / canvas.clientWidth;
    const px    = (e.clientX - rect.left) * dprX;
    const py    = (e.clientY - rect.top)  * dprX;

    const uvx = (px - 0.5 * canvas.width)  / canvas.height;
    const uvy = -(py - 0.5 * canvas.height) / canvas.height;

    const scaleBefore = BASE_SCALE_JS / zoom;
    const cBeforeX = center.x + uvx * scaleBefore;
    const cBeforeY = center.y + uvy * scaleBefore;

    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    zoom = Math.min(1e7, Math.max(0.5, zoom * factor));

    const scaleAfter = BASE_SCALE_JS / zoom;
    center.x = cBeforeX - uvx * scaleAfter;
    center.y = cBeforeY - uvy * scaleAfter;

    syncUniforms();
    autoMaxIter();
    e.preventDefault();
  };

  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup',   onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ─── UI ──────────────────────────────────────────────────
  const PALETTES = [
    { label: 'Classic', emoji: '🔵' },
    { label: 'Fire',    emoji: '🔥' },
    { label: 'Rainbow', emoji: '🌈' },
  ];
  let currentPalette = 0;

  const ui = document.createElement('div');
  ui.style.cssText = `
    position:fixed;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
    background:rgba(0,0,0,.84);border:1px solid #334155;border-radius:10px;
    padding:14px 18px;font-family:"Courier New",monospace;color:#94a3b8;
    pointer-events:auto;min-width:300px;max-width:420px;
  `;

  let zoomLabelEl = null;

  function updateZoomLabel() {
    if (!zoomLabelEl) return;
    const zTxt = zoom >= 1000
      ? zoom.toExponential(1) + '×'
      : zoom.toFixed(1) + '×';
    zoomLabelEl.textContent = `줌 ${zTxt} · 반복 ${Math.round(uniforms.uMaxIter.value)}`;
  }

  function renderUI() {
    ui.innerHTML = `
      <div style="color:#e2e8f0;font-size:14px;font-weight:bold;margin-bottom:4px;">
        🌀 Mandelbrot — z = z² + c
      </div>
      <div style="color:#6366f1;font-size:11px;margin-bottom:4px;">
        탈출 시간 알고리즘 + Smooth Coloring
      </div>
      <div style="color:#475569;font-size:11px;line-height:1.6;margin-bottom:10px;">
        c값마다 z=z²+c 를 반복해 발산하는 속도로 색을 칠합니다.<br>
        검정 = 무한히 반복해도 발산하지 않는 "집합 내부".
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        ${PALETTES.map((p, i) => `
          <button data-i="${i}" style="
            padding:5px 10px;
            background:${i === currentPalette ? '#6366f1' : '#1e293b'};
            border:1px solid ${i === currentPalette ? '#818cf8' : '#334155'};
            border-radius:6px;color:${i === currentPalette ? '#fff' : '#94a3b8'};
            font-size:11px;cursor:pointer;font-family:inherit;">
            ${p.emoji} ${p.label}
          </button>
        `).join('')}
        <button id="rm-reset" style="
          padding:5px 10px;background:#1e293b;border:1px solid #334155;
          border-radius:6px;color:#94a3b8;font-size:11px;cursor:pointer;font-family:inherit;">
          ⟲ 리셋
        </button>
      </div>
      <div id="rm-zoom-label" style="color:#e2e8f0;font-size:11px;margin-bottom:6px;"></div>
      <div style="color:#334155;font-size:10px;margin-bottom:2px;">
        float32 정밀도 한계로 10⁶× 이상 확대 시 격자무늬가 나타날 수 있음
      </div>
      <div style="color:#334155;font-size:11px;margin-top:6px;">
        드래그: 이동 &nbsp;·&nbsp; 휠: 커서 중심 확대/축소
      </div>
    `;

    ui.querySelectorAll('button[data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPalette = +btn.dataset.i;
        uniforms.uPalette.value = parseFloat(btn.dataset.i);
        renderUI();
      });
    });

    ui.querySelector('#rm-reset').addEventListener('click', () => {
      center.x = DEFAULT_CENTER.x;
      center.y = DEFAULT_CENTER.y;
      zoom = DEFAULT_ZOOM;
      syncUniforms();
      autoMaxIter();
    });

    zoomLabelEl = ui.querySelector('#rm-zoom-label');
    updateZoomLabel();
  }

  renderUI();
  document.body.appendChild(ui);

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    uniforms.uTime.value = timer.getElapsed();
    uniforms.uResolution.value.set(canvas.width, canvas.height);
    renderer.render(rmScene, rmCamera);
  }
  animate();

  const onResize = () => renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', onResize);

  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    canvas.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', onResize);
    geo.dispose();
    mat.dispose();
    document.body.removeChild(ui);
  };
}
