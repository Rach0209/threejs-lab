// ══════════════════════════════════════════════════════════════
//  레슨 45: SDF 애니메이션 — 도형 변형·반복·메타볼
//
//  📌 SDF 좌표계 자체를 비틀면 도형이 변형됩니다!
//
//  배울 것:
//    - 도메인 반복 (Repetition)  : mod()로 공간을 타일링 → 무한 복제
//    - Twist                    : y축 기준 좌표를 회전 → 나선 비틀기
//    - Bend                     : 공간을 굽히기
//    - Wave Deform              : sin 파동으로 표면 출렁이기
//    - Metaball                 : Smooth Union 여러 개 → 점액 효과
//
//  씬:
//    0 — 도메인 반복  : 구·박스가 무한히 격자로 반복
//    1 — 도형 변형    : Twist / Bend / Wave 실시간 애니메이션
//    2 — 메타볼       : 여러 구가 만나면 녹아서 합쳐짐
//
//  조작:
//    마우스 드래그  — 카메라 회전
//    휠            — 줌
//
//  🎯 실전 활용 예시:
//    - 액체 금속/슬라임 같은 유기적 캐릭터·로고 애니메이션
//    - 무한히 반복되는 건축/구조물(파이프, 격자탑) 절차적 생성
//    - 브랜드 인트로의 형태가 녹아 변형되는 모션 그래픽
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
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uScene;
uniform float uDeform;   // 변형 강도 슬라이더 (0~1)

const int   MAX_STEPS = 80;
const float MAX_DIST  = 30.0;
const float SURF_EPS  = 0.002;

// ══════════════════════════════════════════════════════════════
//  ① 기본 SDF
// ══════════════════════════════════════════════════════════════

float sdSphere(vec3 p, float r)   { return length(p) - r; }
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}
float sdTorus(vec3 p, float R, float r) {
  return length(vec2(length(p.xz)-R, p.y)) - r;
}
float sdCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz),p.y)) - vec2(r,h);
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float opSmoothUnion(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

// ══════════════════════════════════════════════════════════════
//  ② 도메인 연산자 (Domain Operators)
//     — 도형을 바꾸는 게 아니라 좌표계를 바꿈!
// ══════════════════════════════════════════════════════════════

// 도메인 반복: 공간을 cell 크기로 타일링
// 결과: 하나의 SDF가 무한히 복제됨
vec3 opRepeat(vec3 p, vec3 cell) {
  return mod(p + 0.5 * cell, cell) - 0.5 * cell;
}

// Twist: y축을 중심으로 xz 평면을 회전
// angle = 단위 높이당 회전 라디안
vec3 opTwist(vec3 p, float angle) {
  float c = cos(angle * p.y);
  float s = sin(angle * p.y);
  return vec3(c*p.x - s*p.z, p.y, s*p.x + c*p.z);
}

// Bend: x축을 기준으로 공간을 구부림
// k = 굽힘 강도
vec3 opBend(vec3 p, float k) {
  float c = cos(k * p.x);
  float s = sin(k * p.x);
  mat2  m = mat2(c, -s, s, c);
  return vec3(m * p.xy, p.z);
}

// Wave: 표면에 sin 파동 추가 (반환값은 변위량)
float opWave(vec3 p, float freq, float amp) {
  return sin(p.x * freq) * sin(p.z * freq) * amp;
}

// ══════════════════════════════════════════════════════════════
//  ③ 씬 정의
// ══════════════════════════════════════════════════════════════

// ── 씬 0: 도메인 반복 ────────────────────────────────────────
vec2 mapRepeat(vec3 p) {
  float best = 99.0; float mat = 0.0; float d = 0.0;

  // 구 무한 반복 (격자 간격 3.0)
  vec3 rp = opRepeat(p, vec3(3.0, 3.0, 3.0));
  d = sdSphere(rp, 0.75);
  if (d < best) { best = d; mat = 1.0; }

  // 바닥은 반복하지 않음 (한 면만)
  d = p.y + 2.0;
  if (d < best) { best = d; mat = 0.0; }

  return vec2(best, mat);
}

// ── 씬 1: 도형 변형 ─────────────────────────────────────────
// 하나의 박스를 세 가지 방식으로 변형
vec2 mapDeform(vec3 p) {
  float best = 99.0; float mat = 0.0; float d = 0.0;
  float t = uTime;
  float strength = uDeform;

  // 왼쪽 — Twist (박스를 비틀기)
  {
    vec3 tp = p - vec3(-3.2, 0.0, 0.0);
    float angle = sin(t * 0.6) * 2.5 * strength;
    vec3 wp = opTwist(tp, angle);
    d = sdBox(wp, vec3(0.55, 1.1, 0.55));
    if (d < best) { best = d; mat = 2.0; }
  }

  // 가운데 — Wave (토러스 표면 출렁이기)
  {
    vec3 cp = p;
    float wave = opWave(cp, 3.5 + sin(t*0.3)*1.5, 0.18 * strength);
    d = sdTorus(cp, 0.9, 0.25) + wave;
    if (d < best) { best = d; mat = 3.0; }
  }

  // 오른쪽 — Bend (실린더 구부리기)
  {
    vec3 rp = p - vec3(3.2, 0.0, 0.0);
    float k = sin(t * 0.5) * 0.6 * strength;
    vec3 bp = opBend(rp, k);
    d = sdCylinder(bp, 0.9, 0.3);
    if (d < best) { best = d; mat = 4.0; }
  }

  d = p.y + 1.2;
  if (d < best) { best = d; mat = 0.0; }

  return vec2(best, mat);
}

// ── 씬 2: 메타볼 ────────────────────────────────────────────
// Smooth Union으로 여러 구를 합치면
// 가까워질수록 녹아서 연결되는 점액 효과
vec2 mapMetaball(vec3 p) {
  float t   = uTime * 0.5;
  float k   = 0.4 + uDeform * 0.8;  // 블렌드 반경

  // 5개 구가 원형 궤도를 돌며 서로 만남
  vec3 p0 = vec3(sin(t*1.0)*1.4, cos(t*0.7)*0.6,  cos(t*0.9)*1.0);
  vec3 p1 = vec3(cos(t*0.8)*1.2, sin(t*1.1)*0.8,  sin(t*0.6)*1.3);
  vec3 p2 = vec3(sin(t*1.3)*0.9, cos(t*0.5)*1.0,  cos(t*1.2)*0.8);
  vec3 p3 = vec3(cos(t*0.6)*1.5, sin(t*0.9)*0.5, -sin(t*1.1)*0.9);
  vec3 p4 = vec3(sin(t*0.9)*0.7, cos(t*1.3)*0.9,  sin(t*0.8)*1.5);

  float d0 = sdSphere(p - p0, 0.55);
  float d1 = sdSphere(p - p1, 0.50);
  float d2 = sdSphere(p - p2, 0.48);
  float d3 = sdSphere(p - p3, 0.52);
  float d4 = sdSphere(p - p4, 0.45);

  // 순서대로 smooth union
  float blob = opSmoothUnion(d0, d1, k);
  blob       = opSmoothUnion(blob, d2, k);
  blob       = opSmoothUnion(blob, d3, k);
  blob       = opSmoothUnion(blob, d4, k);

  float fl = p.y + 1.8;
  float best = 0.0; float mat = 0.0;
  if (blob < fl) { best = blob; mat = 5.0; }
  else           { best = fl;   mat = 0.0; }

  return vec2(best, mat);
}

// ── 분기 ─────────────────────────────────────────────────────
vec2 map(vec3 p) {
  vec2 result = vec2(99.0, 0.0);
  if (uScene < 0.5) {
    result = mapRepeat(p);
  } else if (uScene < 1.5) {
    result = mapDeform(p);
  } else {
    result = mapMetaball(p);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
//  ④ 재질
// ══════════════════════════════════════════════════════════════

vec3 getMaterial(float id, vec3 p, float t) {
  if (id < 0.5) {
    // 바닥 체커
    float c = mod(floor(p.x) + floor(p.z), 2.0);
    return mix(vec3(0.10,0.12,0.16), vec3(0.22,0.26,0.32), c);
  }
  if (id < 1.5) return vec3(0.30, 0.62, 1.00);  // 파랑 (반복 구)
  if (id < 2.5) return vec3(1.00, 0.50, 0.22);  // 주황 (twist)
  if (id < 3.5) return vec3(0.25, 0.88, 0.42);  // 초록 (wave)
  if (id < 4.5) return vec3(0.68, 0.30, 1.00);  // 보라 (bend)
  // 메타볼: 시간에 따라 색이 흐름
  float hue = fract(t * 0.1);
  vec3 a = vec3(0.5), b = vec3(0.5);
  vec3 c2 = vec3(1.0), d2 = vec3(0.00, 0.33, 0.67);
  return a + b * cos(6.283 * (c2 * hue + d2));
}

// ══════════════════════════════════════════════════════════════
//  ⑤ 보조 계산
// ══════════════════════════════════════════════════════════════

vec3 calcNormal(vec3 p) {
  const float e = 0.001;
  return normalize(vec3(
    map(p+vec3(e,0,0)).x - map(p-vec3(e,0,0)).x,
    map(p+vec3(0,e,0)).x - map(p-vec3(0,e,0)).x,
    map(p+vec3(0,0,e)).x - map(p-vec3(0,0,e)).x
  ));
}

float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0, t = tmin;
  for (int i = 0; i < 12; i++) {
    float d = map(ro + rd * t).x;
    res = min(res, k * d / t);
    t  += clamp(d, 0.04, 0.3);
    if (res < 0.001 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ══════════════════════════════════════════════════════════════
//  ⑥ 메인
// ══════════════════════════════════════════════════════════════

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamRight * uv.x + uCamUp * uv.y + uCamFwd * 1.5);

  float t      = 0.1;
  float hitT   = -1.0;
  float hitMat = -1.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2 d = map(ro + rd * t);
    if (d.x < SURF_EPS) { hitT = t; hitMat = d.y; break; }
    t += d.x;
    if (t > MAX_DIST) break;
  }

  vec3 col = mix(vec3(0.03,0.04,0.10), vec3(0.01,0.01,0.05),
                 clamp(uv.y*0.5+0.5, 0.0, 1.0));

  if (hitT > 0.0) {
    vec3 pos = ro + rd * hitT;
    vec3 nor = calcNormal(pos);
    vec3 alb = getMaterial(hitMat, pos, uTime);

    vec3 sunDir = normalize(vec3(0.6, 1.2, 0.8));
    float sha   = softShadow(pos + nor*0.005, sunDir, 0.05, 16.0, 6.0);
    float diff  = max(dot(nor, sunDir), 0.0);
    float skyL  = max(0.5 + 0.5*nor.y, 0.0);
    vec3  hal   = normalize(sunDir - rd);
    float spec  = pow(max(dot(nor, hal), 0.0), 48.0) * sha;

    col = alb * (diff*sha*vec3(1.0,0.96,0.88)*2.0
                + skyL*vec3(0.16,0.24,0.42))
        + vec3(spec*0.4);

    col = mix(col, vec3(0.03,0.04,0.08), 1.0 - exp(-hitT*0.05));
  }

  col = pow(clamp(col,0.0,1.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ──────────────────────────────────────────────────────────────
export function init(renderer) {

  const rmScene  = new THREE.Scene();
  const rmCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const timer    = new Timer();
  let animId;

  let theta = 0.32, phi = 0.88, radius = 8.0;
  let dragging = false, lastX = 0, lastY = 0;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamPos:     { value: new THREE.Vector3() },
    uCamRight:   { value: new THREE.Vector3() },
    uCamUp:      { value: new THREE.Vector3() },
    uCamFwd:     { value: new THREE.Vector3() },
    uScene:      { value: 0.0 },
    uDeform:     { value: 0.7 },
  };

  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  rmScene.add(new THREE.Mesh(geo, mat));
  renderer.shadowMap.enabled = false;

  function updateCamera() {
    const x = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.cos(theta);
    const pos   = new THREE.Vector3(x, y, z);
    const fwd   = pos.clone().negate().normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize();
    const up    = new THREE.Vector3().crossVectors(right, fwd).normalize();
    uniforms.uCamPos.value.copy(pos);
    uniforms.uCamRight.value.copy(right);
    uniforms.uCamUp.value.copy(up);
    uniforms.uCamFwd.value.copy(fwd);
  }
  updateCamera();

  const canvas = renderer.domElement;
  const onDown  = e => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onMove  = e => {
    if (!dragging) return;
    theta -= (e.clientX - lastX) * 0.007;
    phi    = Math.max(0.08, Math.min(Math.PI - 0.08, phi - (e.clientY - lastY) * 0.007));
    lastX = e.clientX; lastY = e.clientY;
    updateCamera();
  };
  const onUp    = () => { dragging = false; };
  const onWheel = e => {
    radius = Math.max(2.5, Math.min(20.0, radius + e.deltaY * 0.015));
    updateCamera();
    e.preventDefault();
  };
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ─── UI ──────────────────────────────────────────────────
  const MODES = [
    {
      label: '도메인 반복',
      emoji: '♾️',
      desc:  'opRepeat(p, cell) — mod()로 공간 타일링',
      detail:'하나의 SDF를 mod()로 감싸면 무한 복제됩니다.<br>SDF 계산은 단 한 번만, 결과가 무한히 반복됩니다.',
      slider: false,
    },
    {
      label: '도형 변형',
      emoji: '🌀',
      desc:  'Twist · Wave · Bend — 좌표를 비틀기',
      detail:'SDF에 넣기 전 좌표 p를 변환합니다.<br>슬라이더로 변형 강도를 조절하세요.',
      slider: true,
      sliderLabel: '변형 강도',
    },
    {
      label: '메타볼',
      emoji: '🫧',
      desc:  'Smooth Union × 5 — 녹아서 합쳐지는 구',
      detail:'구 5개에 opSmoothUnion을 연속 적용합니다.<br>슬라이더로 블렌드 반경 k를 조절하세요.',
      slider: true,
      sliderLabel: '블렌드 k',
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
        ${m.emoji} SDF 애니메이션 — ${m.label}
      </div>
      <div style="color:#6366f1;font-size:11px;margin-bottom:4px;">${m.desc}</div>
      <div style="color:#475569;font-size:11px;line-height:1.6;margin-bottom:10px;">${m.detail}</div>
      <div style="display:flex;gap:6px;margin-bottom:${m.slider ? '12px' : '8px'};">
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
      ${m.slider ? `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:11px;white-space:nowrap;">${m.sliderLabel}</span>
          <input id="rm-deform" type="range" min="0" max="1" step="0.05"
            value="${uniforms.uDeform.value.toFixed(2)}"
            style="flex:1;accent-color:#6366f1;cursor:pointer;">
          <span id="rm-deform-val" style="color:#e2e8f0;font-size:12px;width:30px;">
            ${uniforms.uDeform.value.toFixed(2)}
          </span>
        </div>
      ` : ''}
      <div style="color:#334155;font-size:11px;">드래그: 회전 &nbsp;·&nbsp; 휠: 줌</div>
    `;

    ui.querySelectorAll('button[data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentMode = +btn.dataset.i;
        uniforms.uScene.value = parseFloat(btn.dataset.i);
        renderUI();
      });
    });

    const range = ui.querySelector('#rm-deform');
    if (range) {
      range.addEventListener('input', () => {
        const v = parseFloat(range.value);
        uniforms.uDeform.value = v;
        ui.querySelector('#rm-deform-val').textContent = v.toFixed(2);
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
