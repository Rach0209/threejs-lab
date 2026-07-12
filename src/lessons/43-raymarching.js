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
//    - 소프트 그림자·AO             : 보조 레이로 명암 계산
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
uniform int   uScene;
uniform float uBlend;

const int   MAX_STEPS = 120;
const float MAX_DIST  = 40.0;
const float SURF_EPS  = 0.001;

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
  // y축 방향 세로 캡슐, 중심 (0, 0~h, 0)
  p.y -= clamp(p.y, 0.0, h);
  return length(p) - r;
}

float sdCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdOctahedron(vec3 p, float s) {
  // |x|+|y|+|z| = s 를 만족하는 정팔면체
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

// ══════════════════════════════════════════════════════════════
//  ② SDF 연산
// ══════════════════════════════════════════════════════════════

float opUnion(float a, float b)     { return min(a, b); }
float opSubtract(float a, float b)  { return max(a, -b); }  // a 에서 b를 뺌
float opIntersect(float a, float b) { return max(a, b); }   // 교집합

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
  vec2 res = vec2(1e9, -1.0);

  float d;

  // 앞줄 (z = +1.5)
  d = sdSphere(p - vec3(-3.5, 0.0, 1.5), 0.82);
  if (d < res.x) res = vec2(d, 1.0);

  d = sdBox(p - vec3(0.0, 0.0, 1.5), vec3(0.62));
  if (d < res.x) res = vec2(d, 2.0);

  d = sdTorus(p - vec3(3.5, 0.0, 1.5), 0.58, 0.22);
  if (d < res.x) res = vec2(d, 3.0);

  // 뒷줄 (z = -1.5)
  d = sdCapsule(p - vec3(-3.5, -0.55, -1.5), 1.1, 0.27);
  if (d < res.x) res = vec2(d, 4.0);

  d = sdCylinder(p - vec3(0.0, 0.0, -1.5), 0.6, 0.4);
  if (d < res.x) res = vec2(d, 5.0);

  d = sdOctahedron(p - vec3(3.5, 0.0, -1.5), 0.82);
  if (d < res.x) res = vec2(d, 6.0);

  // 바닥 (체커보드 패턴은 getMaterial에서)
  d = p.y + 1.25;
  if (d < res.x) res = vec2(d, 0.0);

  return res;
}

// ── 씬 1: 3가지 SDF 연산 비교 ────────────────────────────────
vec2 mapOperations(vec3 p) {
  vec2 res = vec2(1e9, -1.0);
  float d;

  // 왼쪽 — Union (합집합)
  {
    vec3 lp = p - vec3(-3.0, 0.0, 0.0);
    float a = sdSphere(lp - vec3(-0.38, 0.0, 0.0), 0.72);
    float b = sdBox(lp   + vec3(-0.38, 0.0, 0.0), vec3(0.55));
    d = opUnion(a, b);
    if (d < res.x) res = vec2(d, 1.0);
  }

  // 가운데 — Subtraction (차집합: 박스에서 구를 뺌)
  {
    vec3 cp = p;
    float a = sdBox(cp,    vec3(0.68));
    float b = sdSphere(cp, 0.86);
    d = opSubtract(a, b);
    if (d < res.x) res = vec2(d, 2.0);
  }

  // 오른쪽 — Intersection (교집합)
  {
    vec3 rp = p - vec3(3.0, 0.0, 0.0);
    float a = sdSphere(rp, 0.86);
    float b = sdBox(rp,    vec3(0.65));
    d = opIntersect(a, b);
    if (d < res.x) res = vec2(d, 3.0);
  }

  // 라벨 플레이트 3개
  d = sdBox(p - vec3(-3.0, -1.0, 0.5), vec3(0.9, 0.05, 0.6));
  if (d < res.x) res = vec2(d, 8.0);
  d = sdBox(p - vec3( 0.0, -1.0, 0.5), vec3(0.9, 0.05, 0.6));
  if (d < res.x) res = vec2(d, 9.0);
  d = sdBox(p - vec3( 3.0, -1.0, 0.5), vec3(0.9, 0.05, 0.6));
  if (d < res.x) res = vec2(d, 10.0);

  d = p.y + 1.1;
  if (d < res.x) res = vec2(d, 0.0);

  return res;
}

// ── 씬 2: Smooth Union 애니메이션 ────────────────────────────
vec2 mapSmoothBlend(vec3 p) {
  float t = uTime * 0.45;
  float k = uBlend;

  vec3 pa = vec3(sin(t) * 1.4,        abs(sin(t * 0.7)) * 0.6, 0.0);
  vec3 pb = vec3(cos(t) * 1.4,        0.1,                      sin(t) * 0.8);
  vec3 pc = vec3(sin(t * 1.3) * 0.5,  cos(t * 0.9) * 0.5,      cos(t) * 1.4);

  float a = sdSphere(p - pa, 0.75);
  float b = sdBox(p   - pb, vec3(0.58));
  float c = sdTorus(p - pc, 0.62, 0.22);

  float d = opSmoothUnion(opSmoothUnion(a, b, k), c, k);

  float fl = p.y + 1.5;
  return vec2(min(d, fl), d < fl ? 7.0 : 0.0);
}

// ── 씬 분기 ──────────────────────────────────────────────────
vec2 map(vec3 p) {
  if (uScene == 0) return mapPrimitives(p);
  if (uScene == 1) return mapOperations(p);
  return mapSmoothBlend(p);
}

// ══════════════════════════════════════════════════════════════
//  ④ 보조 계산
// ══════════════════════════════════════════════════════════════

// 중심 차분법으로 노멀 계산 (수치 미분)
vec3 calcNormal(vec3 p) {
  const float e = 0.001;
  return normalize(vec3(
    map(p + vec3(e, 0, 0)).x - map(p - vec3(e, 0, 0)).x,
    map(p + vec3(0, e, 0)).x - map(p - vec3(0, e, 0)).x,
    map(p + vec3(0, 0, e)).x - map(p - vec3(0, 0, e)).x
  ));
}

// 소프트 그림자: 빛 방향으로 보조 레이를 쏴서 차폐 정도 계산
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0, t = tmin;
  for (int i = 0; i < 20; i++) {
    float d = map(ro + rd * t).x;
    res = min(res, k * d / t);
    t  += clamp(d, 0.02, 0.2);
    if (res < 0.001 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

// 앰비언트 오클루전: 노멀 방향으로 조금씩 나가며 주변 차폐 누적
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sc = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.01 + 0.14 * float(i) / 4.0;
    occ += (h - map(p + h * n).x) * sc;
    sc  *= 0.95;
  }
  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

// ══════════════════════════════════════════════════════════════
//  ⑤ 재질 (Material ID → 색상)
// ══════════════════════════════════════════════════════════════
vec3 getMaterial(float id, vec3 p) {
  if (id < 0.5) {
    float c = mod(floor(p.x) + floor(p.z), 2.0);
    return mix(vec3(0.11, 0.13, 0.17), vec3(0.20, 0.24, 0.30), c);
  }
  if (id < 1.5)  return vec3(0.30, 0.62, 1.00);  // 파랑 (sphere)
  if (id < 2.5)  return vec3(1.00, 0.50, 0.22);  // 주황 (box)
  if (id < 3.5)  return vec3(0.25, 0.88, 0.42);  // 초록 (torus)
  if (id < 4.5)  return vec3(1.00, 0.82, 0.18);  // 노랑 (capsule)
  if (id < 5.5)  return vec3(0.68, 0.30, 1.00);  // 보라 (cylinder)
  if (id < 6.5)  return vec3(1.00, 0.28, 0.52);  // 핑크 (octahedron)
  if (id < 7.5)  return vec3(0.55, 0.82, 1.00);  // 하늘 (smooth blend)
  if (id < 8.5)  return vec3(0.18, 0.55, 0.90);  // 플레이트 union
  if (id < 9.5)  return vec3(0.85, 0.35, 0.15);  // 플레이트 subtract
  return                 vec3(0.20, 0.78, 0.35);  // 플레이트 intersect
}

// ══════════════════════════════════════════════════════════════
//  ⑥ 메인
// ══════════════════════════════════════════════════════════════
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  // ─── 카메라 레이 생성 ─────────────────────────────────────
  // 가상 카메라 기저(right/up/fwd)로 픽셀별 레이 방향 계산
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamRight * uv.x + uCamUp * uv.y - uCamFwd * 1.5);

  // ─── Sphere Tracing (레이마칭) ────────────────────────────
  // SDF 값만큼 전진 → 표면에 가까워질수록 스텝이 작아짐
  float t   = 0.1;
  vec2  hit = vec2(-1.0);
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2 d = map(ro + rd * t);
    if (d.x < SURF_EPS) { hit = vec2(t, d.y); break; }
    t += d.x;
    if (t > MAX_DIST) break;
  }

  // ─── 배경 ────────────────────────────────────────────────
  float sky = clamp(uv.y * 0.4 + 0.5, 0.0, 1.0);
  vec3 col  = mix(vec3(0.04, 0.05, 0.13), vec3(0.01, 0.02, 0.07), sky);

  if (hit.x > 0.0) {
    vec3 pos = ro + rd * hit.x;
    vec3 nor = calcNormal(pos);
    vec3 alb = getMaterial(hit.y, pos);

    vec3 sunDir = normalize(vec3(0.75, 1.4, 0.6));

    float sha = softShadow(pos + nor * 0.003, sunDir, 0.02, 20.0, 8.0);
    float ao  = calcAO(pos, nor);

    // Diffuse + Sky (간접광)
    float diff = max(dot(nor, sunDir), 0.0);
    float skyL = max(0.5 + 0.5 * nor.y, 0.0);

    // Blinn-Phong Specular
    vec3  hal  = normalize(sunDir - rd);
    float spec = pow(max(dot(nor, hal), 0.0), 48.0) * sha;

    col = alb * (diff * sha * vec3(1.00, 0.95, 0.88) * 2.2
                + skyL * ao * vec3(0.18, 0.26, 0.46))
        + vec3(spec * 0.55);

    // 거리 안개
    col = mix(col, vec3(0.04, 0.05, 0.11), 1.0 - exp(-hit.x * 0.05));
  }

  // 감마 보정 (linear → sRGB)
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ──────────────────────────────────────────────────────────────
export function init(renderer) {

  // 풀스크린 쿼드 — 레이마칭은 픽셀별로 독립 계산하므로
  // OrthographicCamera + PlaneGeometry(2,2) 조합 사용
  const rmScene  = new THREE.Scene();
  const rmCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const timer = new Timer();
  let animId;

  // ─── 가상 카메라 상태 (레이마칭 셰이더용) ────────────────
  let theta = 0.35, phi = 0.92, radius = 8.5;
  let dragging = false, lastX = 0, lastY = 0;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2() },
    uCamPos:     { value: new THREE.Vector3() },
    uCamRight:   { value: new THREE.Vector3() },
    uCamUp:      { value: new THREE.Vector3() },
    uCamFwd:     { value: new THREE.Vector3() },
    uScene:      { value: 0 },
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
      detail:'각 도형은 수식 하나로 정의됩니다.<br>반환값이 0이면 표면, 음수면 내부입니다.',
    },
    {
      label: 'SDF 연산',
      desc:  'Union · Subtraction · Intersection',
      detail:'두 SDF를 합치거나 뺄 수 있습니다.<br>min/max 연산 하나로 새로운 형태를 만듭니다.',
    },
    {
      label: 'Smooth 혼합',
      desc:  'opSmoothUnion(a, b, k)',
      detail:'k가 클수록 경계가 부드럽게 녹아듭니다.<br>슬라이더로 k값을 바꿔보세요.',
    },
  ];
  let currentMode = 0;

  const ui = document.createElement('div');
  ui.style.cssText = `
    position:fixed;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
    background:rgba(0,0,0,.82);border:1px solid #334155;border-radius:10px;
    padding:14px 18px;font-family:"Courier New",monospace;color:#94a3b8;
    pointer-events:auto;min-width:320px;max-width:420px;
  `;

  function renderUI() {
    const m = MODES[currentMode];
    ui.innerHTML = `
      <div style="color:#e2e8f0;font-size:14px;font-weight:bold;margin-bottom:4px;">🔮 Raymarching</div>
      <div style="color:#6366f1;font-size:11px;margin-bottom:4px;">${m.desc}</div>
      <div style="color:#475569;font-size:11px;line-height:1.6;margin-bottom:10px;">${m.detail}</div>
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
      <div style="color:#1e293b;font-size:11px;">드래그: 회전 &nbsp;·&nbsp; 휠: 줌</div>
    `;

    ui.querySelectorAll('button[data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentMode = +btn.dataset.i;
        uniforms.uScene.value = currentMode;
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
    // gl_FragCoord는 실제 캔버스 픽셀 기준이므로 canvas.width/height 사용
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
