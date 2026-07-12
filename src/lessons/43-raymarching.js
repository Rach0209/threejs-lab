// ══════════════════════════════════════════════════════════════
//  레슨 43: Raymarching — SDF로 만드는 3D 세계
//
//  📌 폴리곤 없이 수식만으로 3D 형태를 정의합니다!
//
//  배울 것:
//    - SDF(Signed Distance Function) : 점 → 표면까지의 부호거리
//    - Sphere Tracing              : SDF를 이용한 레이-표면 교차
//    - 기본 도형 SDF               : Sphere, Box, Torus, Capsule,
//                                    Cylinder, Octahedron
//    - SDF 연산                    : Union, Subtraction, Intersection
//    - Smooth Union (smin)         : 경계 없이 녹아드는 혼합
//    - 노멀 계산 (중심 차분)        : 수치 미분으로 법선 추출
//    - 소프트 그림자               : 보조 레이로 명암 계산
//
//  조작:
//    마우스 드래그  — 카메라 회전
//    휠            — 줌
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';

// ─── 버텍스 셰이더 (풀스크린 쿼드) ───────────────────────────
const vertexShader = /* glsl */`
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

// ─── 프래그먼트 셰이더 (레이마칭 전체) ───────────────────────
const fragmentShader = /* glsl */`
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uScene;   // 0=도형, 1=연산, 2=스무스 (float: HLSL int 비교 오류 회피)
uniform float uBlend;

const int   MAX_STEPS = 80;
const float MAX_DIST  = 30.0;
const float SURF_EPS  = 0.002;

// ══════════════════════════════════════════════════════════════
//  ① SDF 기본 도형
//     반환값: 점 p 에서 표면까지의 최소 거리
//     양수 = 외부, 0 = 표면, 음수 = 내부
// ══════════════════════════════════════════════════════════════

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, float R, float r) {
  // R: 도넛 반지름, r: 관 반지름
  return length(vec2(length(p.xz) - R, p.y)) - r;
}

float sdCapsule(vec3 p, float h, float r) {
  // y축 방향 세로 캡슐
  float cy = clamp(p.y, 0.0, h);
  return length(p - vec3(0.0, cy, 0.0)) - r;
}

float sdCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

// ══════════════════════════════════════════════════════════════
//  ② SDF 연산
// ══════════════════════════════════════════════════════════════

float opUnion(float a, float b)     { return min(a, b); }
float opSubtract(float a, float b)  { return max(a, -b); }   // a 에서 b를 뺌
float opIntersect(float a, float b) { return max(a, b); }    // 교집합

// Smooth Union: k가 클수록 경계가 부드럽게 녹아듦
float opSmoothUnion(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ══════════════════════════════════════════════════════════════
//  ③ 씬 정의 — vec2(dist, materialId) 반환
// ══════════════════════════════════════════════════════════════

// ── 씬 0: 6가지 기본 도형 3×2 배치 ──────────────────────────
vec2 mapPrimitives(vec3 p) {
  float best = 99.0;
  float mat  = 0.0;
  float d    = 0.0;

  d = sdSphere(p - vec3(-3.5, 0.0, 1.5), 0.82);
  if (d < best) { best = d; mat = 1.0; }

  d = sdBox(p - vec3(0.0, 0.0, 1.5), vec3(0.62));
  if (d < best) { best = d; mat = 2.0; }

  d = sdTorus(p - vec3(3.5, 0.0, 1.5), 0.58, 0.22);
  if (d < best) { best = d; mat = 3.0; }

  d = sdCapsule(p - vec3(-3.5, -0.55, -1.5), 1.1, 0.27);
  if (d < best) { best = d; mat = 4.0; }

  d = sdCylinder(p - vec3(0.0, 0.0, -1.5), 0.6, 0.4);
  if (d < best) { best = d; mat = 5.0; }

  d = sdOctahedron(p - vec3(3.5, 0.0, -1.5), 0.82);
  if (d < best) { best = d; mat = 6.0; }

  // 바닥
  d = p.y + 1.25;
  if (d < best) { best = d; mat = 0.0; }

  return vec2(best, mat);
}

// ── 씬 1: 3가지 SDF 연산 비교 ────────────────────────────────
vec2 mapOperations(vec3 p) {
  float best = 99.0;
  float mat  = 0.0;
  float d    = 0.0;

  // 왼쪽 — Union (합집합)
  vec3 lp = p - vec3(-3.0, 0.0, 0.0);
  float a0 = sdSphere(lp - vec3(-0.38, 0.0, 0.0), 0.72);
  float b0 = sdBox(lp + vec3(-0.38, 0.0, 0.0), vec3(0.55));
  d = opUnion(a0, b0);
  if (d < best) { best = d; mat = 1.0; }

  // 가운데 — Subtraction (차집합: 박스에서 구를 뺌)
  float a1 = sdBox(p, vec3(0.68));
  float b1 = sdSphere(p, 0.86);
  d = opSubtract(a1, b1);
  if (d < best) { best = d; mat = 2.0; }

  // 오른쪽 — Intersection (교집합)
  vec3 rp = p - vec3(3.0, 0.0, 0.0);
  float a2 = sdSphere(rp, 0.86);
  float b2 = sdBox(rp, vec3(0.65));
  d = opIntersect(a2, b2);
  if (d < best) { best = d; mat = 3.0; }

  // 바닥
  d = p.y + 1.1;
  if (d < best) { best = d; mat = 0.0; }

  return vec2(best, mat);
}

// ── 씬 2: Smooth Union 애니메이션 ────────────────────────────
vec2 mapSmoothBlend(vec3 p) {
  float t = uTime * 0.45;
  float k = uBlend;

  vec3 pa = vec3(sin(t) * 1.4, abs(sin(t * 0.7)) * 0.6, 0.0);
  vec3 pb = vec3(cos(t) * 1.4, 0.1, sin(t) * 0.8);
  vec3 pc = vec3(sin(t * 1.3) * 0.5, cos(t * 0.9) * 0.5, cos(t) * 1.4);

  float a = sdSphere(p - pa, 0.75);
  float b = sdBox(p - pb, vec3(0.58));
  float c = sdTorus(p - pc, 0.62, 0.22);

  float blend = opSmoothUnion(opSmoothUnion(a, b, k), c, k);
  float fl    = p.y + 1.5;

  float best = 0.0;
  float mat  = 0.0;
  if (blend < fl) { best = blend; mat = 7.0; }
  else            { best = fl;    mat = 0.0; }

  return vec2(best, mat);
}

// ── 씬 분기 (float 비교 — HLSL uniform int 오류 회피) ───────
vec2 map(vec3 p) {
  vec2 result = vec2(99.0, 0.0);
  if (uScene < 0.5) {
    result = mapPrimitives(p);
  } else if (uScene < 1.5) {
    result = mapOperations(p);
  } else {
    result = mapSmoothBlend(p);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
//  ④ 보조 계산
// ══════════════════════════════════════════════════════════════

// 중심 차분법으로 노멀 계산 (수치 미분)
vec3 calcNormal(vec3 p) {
  const float e = 0.001;
  return normalize(vec3(
    map(p + vec3(e, 0.0, 0.0)).x - map(p - vec3(e, 0.0, 0.0)).x,
    map(p + vec3(0.0, e, 0.0)).x - map(p - vec3(0.0, e, 0.0)).x,
    map(p + vec3(0.0, 0.0, e)).x - map(p - vec3(0.0, 0.0, e)).x
  ));
}

// 소프트 그림자: 빛 방향으로 보조 레이를 쏴서 차폐 정도 계산
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0;
  float t   = tmin;
  for (int i = 0; i < 16; i++) {
    float d = map(ro + rd * t).x;
    res = min(res, k * d / t);
    t  += clamp(d, 0.03, 0.3);
    if (res < 0.001 || t > tmax) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

// ══════════════════════════════════════════════════════════════
//  ⑤ 재질 (Material ID → 색상)
// ══════════════════════════════════════════════════════════════
vec3 getMaterial(float id, vec3 p) {
  vec3 col = vec3(0.15, 0.18, 0.24); // 기본(바닥)
  if (id < 0.5) {
    float c = mod(floor(p.x) + floor(p.z), 2.0);
    col = mix(vec3(0.11, 0.13, 0.17), vec3(0.20, 0.24, 0.30), c);
  } else if (id < 1.5) {
    col = vec3(0.30, 0.62, 1.00);  // 파랑 (sphere)
  } else if (id < 2.5) {
    col = vec3(1.00, 0.50, 0.22);  // 주황 (box)
  } else if (id < 3.5) {
    col = vec3(0.25, 0.88, 0.42);  // 초록 (torus)
  } else if (id < 4.5) {
    col = vec3(1.00, 0.82, 0.18);  // 노랑 (capsule)
  } else if (id < 5.5) {
    col = vec3(0.68, 0.30, 1.00);  // 보라 (cylinder)
  } else if (id < 6.5) {
    col = vec3(1.00, 0.28, 0.52);  // 핑크 (octahedron)
  } else {
    col = vec3(0.55, 0.82, 1.00);  // 하늘 (smooth blend)
  }
  return col;
}

// ══════════════════════════════════════════════════════════════
//  ⑥ 메인
// ══════════════════════════════════════════════════════════════
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  // ─── 카메라 레이 생성 ─────────────────────────────────────
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamRight * uv.x + uCamUp * uv.y + uCamFwd * 1.5);

  // ─── Sphere Tracing ───────────────────────────────────────
  float t      = 0.1;
  float hitT   = -1.0;
  float hitMat = -1.0;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec2 d = map(ro + rd * t);
    if (d.x < SURF_EPS) {
      hitT   = t;
      hitMat = d.y;
      break;
    }
    t += d.x;
    if (t > MAX_DIST) { break; }
  }

  // ─── 배경 ────────────────────────────────────────────────
  vec3 col = mix(vec3(0.04, 0.06, 0.15), vec3(0.01, 0.02, 0.07),
                 clamp(uv.y * 0.5 + 0.5, 0.0, 1.0));

  if (hitT > 0.0) {
    vec3 pos = ro + rd * hitT;
    vec3 nor = calcNormal(pos);
    vec3 alb = getMaterial(hitMat, pos);

    vec3 sunDir = normalize(vec3(0.75, 1.4, 0.6));

    float sha  = softShadow(pos + nor * 0.005, sunDir, 0.05, 20.0, 6.0);
    float diff = max(dot(nor, sunDir), 0.0);
    float skyL = max(0.5 + 0.5 * nor.y, 0.0);

    // Blinn-Phong Specular
    vec3  hal  = normalize(sunDir - rd);
    float spec = pow(max(dot(nor, hal), 0.0), 48.0) * sha;

    col = alb * (diff * sha * vec3(1.00, 0.95, 0.88) * 2.0
               + skyL * vec3(0.18, 0.26, 0.46))
        + vec3(spec * 0.5);

    // 거리 안개
    col = mix(col, vec3(0.04, 0.05, 0.11), 1.0 - exp(-hitT * 0.06));
  }

  // 감마 보정 (linear → sRGB)
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ──────────────────────────────────────────────────────────────
export function init(renderer) {

  const rmScene  = new THREE.Scene();
  const rmCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const timer = new Timer();
  let animId;

  // ─── 가상 카메라 상태 ─────────────────────────────────────
  let theta = 0.35, phi = 0.92, radius = 8.5;
  let dragging = false, lastX = 0, lastY = 0;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamPos:     { value: new THREE.Vector3() },
    uCamRight:   { value: new THREE.Vector3() },
    uCamUp:      { value: new THREE.Vector3() },
    uCamFwd:     { value: new THREE.Vector3() },
    uScene:      { value: 0.0 },
    uBlend:      { value: 0.6 },
  };

  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  rmScene.add(new THREE.Mesh(geo, mat));

  renderer.shadowMap.enabled = false;

  // 카메라 구면좌표 → 기저 벡터 변환
  function updateCamera() {
    const x = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.cos(theta);

    const pos   = new THREE.Vector3(x, y, z);
    const fwd   = pos.clone().negate().normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up    = new THREE.Vector3().crossVectors(right, fwd).normalize();

    uniforms.uCamPos.value.copy(pos);
    uniforms.uCamRight.value.copy(right);
    uniforms.uCamUp.value.copy(up);
    uniforms.uCamFwd.value.copy(fwd);
  }
  updateCamera();

  // ─── 마우스 컨트롤 ───────────────────────────────────────
  const canvas = renderer.domElement;

  const onDown  = e => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onMove  = e => {
    if (!dragging) return;
    theta += (e.clientX - lastX) * 0.007;
    phi    = Math.max(0.08, Math.min(Math.PI - 0.08, phi + (e.clientY - lastY) * 0.007));
    lastX = e.clientX; lastY = e.clientY;
    updateCamera();
  };
  const onUp    = () => { dragging = false; };
  const onWheel = e => {
    radius = Math.max(2.5, Math.min(22.0, radius + e.deltaY * 0.015));
    updateCamera();
    e.preventDefault();
  };
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup',   onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ─── UI 패널 ─────────────────────────────────────────────
  const MODES = [
    {
      label: 'SDF 도형',
      desc:  'Sphere · Box · Torus · Capsule · Cylinder · Octahedron',
      detail:'각 도형은 수식 하나로 정의됩니다.<br>반환값 0=표면, 양수=외부, 음수=내부.',
    },
    {
      label: 'SDF 연산',
      desc:  'Union · Subtraction · Intersection',
      detail:'두 SDF를 min/max 하나로 합치거나 뺍니다.<br>왼쪽: Union / 가운데: Subtract / 오른쪽: Intersect',
    },
    {
      label: 'Smooth 혼합',
      desc:  'opSmoothUnion(a, b, k)',
      detail:'k가 클수록 경계가 녹아드는 혼합.<br>슬라이더로 k값을 바꿔보세요.',
    },
  ];
  let currentMode = 0;

  const ui = document.createElement('div');
  ui.style.cssText = `
    position:fixed;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
    background:rgba(0,0,0,.82);border:1px solid #334155;border-radius:10px;
    padding:14px 18px;font-family:"Courier New",monospace;color:#94a3b8;
    pointer-events:auto;min-width:300px;max-width:400px;
  `;

  function renderUI() {
    const m = MODES[currentMode];
    ui.innerHTML = `
      <div style="color:#e2e8f0;font-size:14px;font-weight:bold;margin-bottom:4px;">🔮 Raymarching</div>
      <div style="color:#6366f1;font-size:11px;margin-bottom:4px;">${m.desc}</div>
      <div style="color:#64748b;font-size:11px;line-height:1.6;margin-bottom:10px;">${m.detail}</div>
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        ${MODES.map((mo, i) => `
          <button data-i="${i}" style="
            padding:4px 10px;
            background:${i === currentMode ? '#6366f1' : '#1e293b'};
            border:1px solid ${i === currentMode ? '#818cf8' : '#334155'};
            border-radius:6px;
            color:${i === currentMode ? '#fff' : '#94a3b8'};
            font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap;">
            ${mo.label}
          </button>
        `).join('')}
      </div>
      ${currentMode === 2 ? `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:11px;white-space:nowrap;">블렌드 k</span>
          <input id="rm-blend" type="range" min="0.05" max="2.0" step="0.05"
            value="${uniforms.uBlend.value.toFixed(2)}"
            style="flex:1;accent-color:#6366f1;cursor:pointer;">
          <span id="rm-blend-val" style="color:#e2e8f0;font-size:12px;width:34px;">
            ${uniforms.uBlend.value.toFixed(2)}
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

    const range = ui.querySelector('#rm-blend');
    if (range) {
      range.addEventListener('input', () => {
        const v = parseFloat(range.value);
        uniforms.uBlend.value = v;
        ui.querySelector('#rm-blend-val').textContent = v.toFixed(2);
      });
    }
  }

  renderUI();
  document.body.appendChild(ui);

  // ─── 애니메이션 루프 ─────────────────────────────────────
  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    uniforms.uTime.value = timer.getElapsed();
    uniforms.uResolution.value.set(canvas.width, canvas.height);
    renderer.render(rmScene, rmCamera);
  }
  animate();

  const onResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // ─── Cleanup ─────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    canvas.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup',   onUp);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', onResize);
    geo.dispose();
    mat.dispose();
    document.body.removeChild(ui);
  };
}
