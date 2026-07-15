// ══════════════════════════════════════════════════════════════
//  레슨 47: Voronoi — 셀룰러 노이즈
//
//  📌 격자마다 무작위 점을 하나씩 찍고, "가장 가까운 점"만 물으면
//     세포·균열·거품 같은 유기적인 무늬가 저절로 나타납니다!
//
//  배울 것:
//    - Voronoi 다이어그램  : 공간을 "가장 가까운 특징점" 기준으로 분할
//    - F1 / F2 거리         : 가장 가까운 점(F1), 두 번째로 가까운 점(F2)
//    - 셀 경계 검출          : F2 - F1 이 0에 가까울수록 경계선
//    - 3×3 이웃 탐색         : 격자 경계를 넘나드는 점까지 놓치지 않는 법
//    - 셀 색상 해싱          : 셀 좌표 → 해시 → Cosine 팔레트 (레슨46 재사용)
//
//  씬:
//    0 — 기본 Voronoi : 셀마다 다른 색, 검은 경계선
//    1 — 균열 무늬     : 돌/진흙이 갈라진 듯한 크랙 텍스처
//    2 — 애니메이션 세포: 특징점이 움직이며 세포가 꿈틀거림
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
uniform float uScene;
uniform float uDensity;   // 화면에 보이는 셀 개수 배율
uniform float uAnimSpeed; // 특징점 움직임 속도

const float BASE_SCALE = 2.5;

// ══════════════════════════════════════════════════════════════
//  ① 2D Hash — 격자 좌표 → 무작위 벡터 [0,1]²
// ══════════════════════════════════════════════════════════════
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}

float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

// ══════════════════════════════════════════════════════════════
//  ② Voronoi — 3×3 이웃 셀을 탐색해 F1(최근접) / F2(차근접) 거리를 구함
//     반환: vec4(F1거리, F2거리, 최근접 셀좌표.xy)
//
//     한 셀만 보면 안 되는 이유:
//     내가 속한 셀의 특징점보다 "옆 셀"의 특징점이 더 가까울 수 있음
//     (특징점이 셀 안 무작위 위치에 있으므로 경계 근처에서 자주 발생)
//     → 그래서 나·상하좌우·대각선까지 총 9개 셀을 모두 검사
// ══════════════════════════════════════════════════════════════
vec4 voronoi(vec2 p, float time, float animSpeed) {
  vec2 cell = floor(p);
  vec2 frac = fract(p);

  float f1 = 64.0, f2 = 64.0;
  vec2  nearestCell = cell;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 neighbor = vec2(float(i), float(j));
      vec2 featurePoint = hash2(cell + neighbor);

      // animSpeed > 0 이면 특징점이 셀 안에서 원을 그리며 움직임
      featurePoint = 0.5 + 0.5 * sin(time * animSpeed + 6.28318 * featurePoint);

      vec2  diff = neighbor + featurePoint - frac;
      float d    = dot(diff, diff);  // 제곱거리 (sqrt는 마지막에 한 번만)

      if (d < f1) {
        f2 = f1;
        f1 = d;
        nearestCell = cell + neighbor;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }

  return vec4(sqrt(f1), sqrt(f2), nearestCell);
}

// ══════════════════════════════════════════════════════════════
//  ③ Cosine 팔레트 (레슨46과 동일 공식) — 셀마다 다른 색 부여
// ══════════════════════════════════════════════════════════════
vec3 palette(float t) {
  vec3 a = vec3(0.55, 0.50, 0.50);
  vec3 b = vec3(0.45, 0.45, 0.45);
  vec3 c = vec3(1.00, 1.00, 1.00);
  vec3 d = vec3(0.10, 0.40, 0.70);
  return a + b * cos(6.28318 * (c * t + d));
}

// ══════════════════════════════════════════════════════════════
//  ④ 씬별 색칠
// ══════════════════════════════════════════════════════════════

// 씬 0: 기본 Voronoi — 셀마다 팔레트 색 + 검은 경계선
vec3 sceneBasic(vec4 v) {
  float f1 = v.x, f2 = v.y;
  vec2  cellId = v.zw;

  float hue = hash1(cellId);
  vec3  col = palette(hue);

  // 경계선: F2-F1이 작을수록(=두 점의 세력권이 맞닿는 지점) 어둡게
  float border = smoothstep(0.0, 0.06, f2 - f1);
  col *= border;

  return col;
}

// 씬 1: 균열 무늬 — 돌/진흙 바탕 + 갈라진 크랙 라인
vec3 sceneCrack(vec4 v) {
  float f1 = v.x, f2 = v.y;
  vec2  cellId = v.zw;

  // 셀마다 살짝 다른 명도의 돌 색상 (단색 계열)
  float shade = 0.35 + 0.20 * hash1(cellId);
  vec3  stone = vec3(shade * 0.9, shade * 0.85, shade * 0.8);

  // F1 자체로 셀 중심에서 멀어질수록 살짝 어둡게 (셀 형태 입체감)
  stone *= 1.0 - 0.15 * smoothstep(0.0, 0.7, f1);

  // 크랙: 경계 근처를 가늘고 짙은 선으로
  float crack = smoothstep(0.0, 0.035, f2 - f1);
  vec3  col   = mix(vec3(0.02, 0.015, 0.01), stone, crack);

  return col;
}

// 씬 2: 애니메이션 세포 — 팔레트 색 + 부드러운 경계, 코어에 하이라이트
vec3 sceneCell(vec4 v) {
  float f1 = v.x, f2 = v.y;
  vec2  cellId = v.zw;

  float hue = fract(hash1(cellId) * 1.7 + 0.15);
  vec3  col = palette(hue);

  // 세포 내부는 F1이 작을수록(중심에 가까울수록) 밝게 — 핵처럼 보이는 효과
  float core = 1.0 - smoothstep(0.0, 0.28, f1);
  col += core * 0.5;

  // 부드러운 막(경계)
  float membrane = smoothstep(0.0, 0.10, f2 - f1);
  col *= 0.25 + 0.75 * membrane;

  return col;
}

// ══════════════════════════════════════════════════════════════
//  ⑤ 메인
// ══════════════════════════════════════════════════════════════
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec2 p  = (uCenter + uv * (BASE_SCALE / uZoom)) * uDensity;

  float anim = (uScene > 1.5) ? uAnimSpeed : 0.0;
  vec4  v    = voronoi(p, uTime, anim);

  vec3 col;
  if (uScene < 0.5)      col = sceneBasic(v);
  else if (uScene < 1.5) col = sceneCrack(v);
  else                    col = sceneCell(v);

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

  const DEFAULT_CENTER = { x: 0.0, y: 0.0 };
  const DEFAULT_ZOOM   = 1.0;
  const BASE_SCALE_JS  = 2.5;  // 셰이더의 BASE_SCALE과 반드시 동일한 값 유지

  const center = { ...DEFAULT_CENTER };
  let zoom = DEFAULT_ZOOM;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCenter:     { value: new THREE.Vector2(center.x, center.y) },
    uZoom:       { value: zoom },
    uScene:      { value: 0.0 },
    uDensity:    { value: 6.0 },
    uAnimSpeed:  { value: 0.6 },
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

  // ─── 드래그 팬 (레슨46과 동일 패턴) ───────────────────────
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

    const duvx = (dxCss * dprX) / canvas.height;
    const duvy = -(dyCss * dprX) / canvas.height;
    const scale = BASE_SCALE_JS / zoom;

    center.x = dragStartCenter.x - duvx * scale;
    center.y = dragStartCenter.y - duvy * scale;
    syncUniforms();
  };

  const onUp = () => { dragging = false; };

  // ─── 커서 중심 줌 (레슨46과 동일 패턴) ────────────────────
  const onWheel = e => {
    const rect = canvas.getBoundingClientRect();
    const dprX = canvas.width / canvas.clientWidth;
    const px   = (e.clientX - rect.left) * dprX;
    const py   = (e.clientY - rect.top)  * dprX;

    const uvx = (px - 0.5 * canvas.width)  / canvas.height;
    const uvy = -(py - 0.5 * canvas.height) / canvas.height;

    const scaleBefore = BASE_SCALE_JS / zoom;
    const cBeforeX = center.x + uvx * scaleBefore;
    const cBeforeY = center.y + uvy * scaleBefore;

    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    zoom = Math.min(50, Math.max(0.2, zoom * factor));

    const scaleAfter = BASE_SCALE_JS / zoom;
    center.x = cBeforeX - uvx * scaleAfter;
    center.y = cBeforeY - uvy * scaleAfter;

    syncUniforms();
    e.preventDefault();
  };

  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup',   onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ─── UI ──────────────────────────────────────────────────
  const MODES = [
    {
      label: '기본',
      emoji: '🔷',
      desc:  'F1/F2 거리 → 셀 색상 + 경계선',
      detail:'셀마다 무작위 색을 칠하고, F2-F1이 0에 가까운 지점(두 세력권이<br>맞닿는 경계)을 검게 칠해 셀 모양을 드러냅니다.',
    },
    {
      label: '균열',
      emoji: '🪨',
      desc:  '돌/진흙이 갈라진 크랙 텍스처',
      detail:'같은 F2-F1 경계 검출을 가늘고 짙은 크랙 라인으로 표현합니다.<br>사막 진흙 바닥이나 깨진 돌 재질에 흔히 쓰이는 기법입니다.',
    },
    {
      label: '애니메이션 세포',
      emoji: '🦠',
      desc:  '특징점이 시간에 따라 원운동',
      detail:'각 셀의 특징점을 sin으로 움직이면 세포가 꿈틀거리듯<br>보로노이 패턴 자체가 애니메이션됩니다.',
    },
  ];
  let currentMode = 0;

  const ui = document.createElement('div');
  ui.style.cssText = `
    position:fixed;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
    background:rgba(0,0,0,.84);border:1px solid #334155;border-radius:10px;
    padding:14px 18px;font-family:"Courier New",monospace;color:#94a3b8;
    pointer-events:auto;min-width:300px;max-width:420px;
  `;

  function renderUI() {
    const m = MODES[currentMode];
    ui.innerHTML = `
      <div style="color:#e2e8f0;font-size:14px;font-weight:bold;margin-bottom:4px;">
        ${m.emoji} Voronoi — ${m.label}
      </div>
      <div style="color:#6366f1;font-size:11px;margin-bottom:4px;">${m.desc}</div>
      <div style="color:#475569;font-size:11px;line-height:1.6;margin-bottom:10px;">${m.detail}</div>
      <div style="display:flex;gap:6px;margin-bottom:12px;">
        ${MODES.map((mo, i) => `
          <button data-i="${i}" style="
            padding:5px 8px;
            background:${i === currentMode ? '#6366f1' : '#1e293b'};
            border:1px solid ${i === currentMode ? '#818cf8' : '#334155'};
            border-radius:6px;color:${i === currentMode ? '#fff' : '#94a3b8'};
            font-size:11px;cursor:pointer;font-family:inherit;">
            ${mo.emoji} ${mo.label}
          </button>
        `).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-size:11px;white-space:nowrap;">셀 밀도</span>
        <input id="rm-density" type="range" min="2" max="16" step="0.5"
          value="${uniforms.uDensity.value}"
          style="flex:1;accent-color:#6366f1;cursor:pointer;">
        <span id="rm-density-val" style="color:#e2e8f0;font-size:12px;width:28px;">
          ${uniforms.uDensity.value}
        </span>
      </div>
      ${currentMode === 2 ? `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:11px;white-space:nowrap;">움직임 속도</span>
          <input id="rm-anim" type="range" min="0" max="2" step="0.1"
            value="${uniforms.uAnimSpeed.value}"
            style="flex:1;accent-color:#6366f1;cursor:pointer;">
          <span id="rm-anim-val" style="color:#e2e8f0;font-size:12px;width:28px;">
            ${uniforms.uAnimSpeed.value.toFixed(1)}
          </span>
        </div>
      ` : ''}
      <div style="color:#334155;font-size:11px;">드래그: 이동 &nbsp;·&nbsp; 휠: 커서 중심 확대/축소</div>
    `;

    ui.querySelectorAll('button[data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentMode = +btn.dataset.i;
        uniforms.uScene.value = parseFloat(btn.dataset.i);
        renderUI();
      });
    });

    ui.querySelector('#rm-density').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      uniforms.uDensity.value = v;
      ui.querySelector('#rm-density-val').textContent = v.toFixed(1);
    });

    const animRange = ui.querySelector('#rm-anim');
    if (animRange) {
      animRange.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        uniforms.uAnimSpeed.value = v;
        ui.querySelector('#rm-anim-val').textContent = v.toFixed(1);
      });
    }
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
