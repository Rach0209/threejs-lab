// ══════════════════════════════════════════════════════════════
//  레슨 48: SDF 프랙탈 — Menger Sponge / Sierpinski
//
//  📌 레슨45의 "도메인 반복"을 재귀적으로 반복하면 프랙탈이 됩니다!
//     한 번 접은 공간을 계속 접고 또 접으면, 접힌 자기 자신과
//     똑같은 무늬가 스스로의 안에 무한히 나타납니다.
//
//  배울 것:
//    - Menger Sponge  : 정육면체를 3×3×3으로 나눠 중앙 십자를 파내고,
//                        남은 20조각에서 같은 과정을 재귀 반복
//    - Sierpinski IFS  : 4개의 꼭짓점으로 공간을 접어(fold) 넣는
//                        반복함수계(Iterated Function System)
//    - 컴파일타임 루프   : GLSL은 반복 횟수가 고정이어야 하므로
//                        상수 상한 루프 + `if (float(i) >= uIter) break`
//    - 트위스트 프랙탈   : 레슨45의 opTwist를 프랙탈에 적용해 재귀와
//                        도메인 변형을 결합
//
//  씬:
//    0 — Menger Sponge : 반복마다 구멍이 뚫리는 정육면체
//    1 — Sierpinski IFS : 4점 폴딩으로 만드는 사면체 프랙탈
//    2 — 트위스트 Menger : 반복 도중 공간을 비틀어 나선탑처럼 변형
//
//  조작:
//    마우스 드래그  — 카메라 회전
//    휠            — 줌
//
//  🎯 실전 활용 예시:
//    - 건축/제품 디자인의 프랙탈 패턴 구조물 스터디
//    - 게임·아트워크의 초현실적 미로형 오브젝트
//    - 재귀 알고리즘·성능 최적화(바운딩 볼륨) 학습 사례
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
uniform float uIterations;

const int   MAX_STEPS   = 100;
const float MAX_DIST    = 30.0;
const float SURF_EPS    = 0.0015;
const int   MAX_ITER    = 7;   // 컴파일타임 루프 상한 (uIterations로 실제 반복은 줄임)

// ══════════════════════════════════════════════════════════════
//  ① 기본 SDF
// ══════════════════════════════════════════════════════════════
float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

vec3 opTwist(vec3 p, float angle) {
  float c = cos(angle * p.y);
  float s = sin(angle * p.y);
  return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}

// ══════════════════════════════════════════════════════════════
//  ② Menger Sponge — IQ의 압축 공식
//
//     원리: 매 반복마다
//       1) 공간을 2칸 간격으로 mod() 접어서 [-1,1] 범위로 되돌림
//          (opRepeat과 동일한 아이디어 — 레슨45 참고)
//       2) 그 칸 안에서 "3방향 십자" 모양 구멍을 파냄
//       3) 파낸 결과를 이전 단계 거리와 max()로 교차
//          (교집합 = "이전에도 안이었고, 지금 십자에도 안 걸림"만 남김)
//       4) 스케일(s)을 3배 키워서 다음 반복은 더 작은 칸에서 반복
//
//     한 번 반복 = 정육면체 20개(3³-7)만 남기고 나머지를 파내는 것.
//     반복할수록 파인 구멍 안에 또 같은 무늬가 나타남 (자기유사성).
// ══════════════════════════════════════════════════════════════
float sdMenger(vec3 p, float iterCount) {
  float d = sdBox(p, vec3(1.0));
  // ⚠ 성능 핵심: 레이가 프랙탈에서 멀리 떨어져 있을 때(=d가 0.02보다 클 때)는
  // 비싼 재귀 루프를 생략하고 바운딩 박스 거리만 반환한다.
  // sdMenger는 항상 max(box, ...) 형태로 정의되어 box거리 <= 실제거리이므로
  // 이 조기 반환은 안전한 하한(=underestimate)이라 레이마칭 정확성이 깨지지 않는다.
  // 이 최적화가 없으면 매 레이마칭 스텝(최대 100번)마다 재귀 루프를 전부 도느라
  // GPU가 감당 못 해 프레임이 멈추는 현상이 발생한다.
  if (d > 0.02) return d;

  float s = 1.0;

  for (int m = 0; m < MAX_ITER; m++) {
    if (float(m) >= iterCount) break;

    vec3 a = mod(p * s, 2.0) - 1.0;
    s *= 3.0;
    vec3 r = abs(1.0 - 3.0 * abs(a));

    float da = max(r.x, r.y);
    float db = max(r.y, r.z);
    float dc = max(r.z, r.x);
    float c  = (min(da, min(db, dc)) - 1.0) / s;

    d = max(d, c);  // 교집합: 이전 결과에서 십자 부분을 파냄
  }
  return d;
}

// ══════════════════════════════════════════════════════════════
//  ③ Sierpinski IFS — 4점 폴딩
//
//     원리: 정사면체의 4개 꼭짓점(a1~a4) 중 p와 가장 가까운 점을 찾아,
//     그 점을 중심으로 공간을 2배 확대 반사(fold)한다.
//     이 과정을 반복하면 "가장 가까운 꼭짓점 쪽으로 계속 접히는" 패턴이
//     스스로 반복되어 사면체 프랙탈이 만들어진다.
//     (진짜 SDF는 아니고 IFS 압축비로 근사한 "의사거리" — 아주 흔히
//      쓰이는 기법이며 레이마칭 스텝을 약간 보수적으로 줄여서 사용)
// ══════════════════════════════════════════════════════════════
float sdSierpinski(vec3 p, float iterCount) {
  // Menger와 동일한 이유로 조기 탈출: 사면체를 넉넉히 감싸는 구(반지름 1.8)보다
  // 멀리 있으면 폴딩 루프를 생략하고 구 거리를 그대로 반환 (안전한 하한)
  float boundDist = sdSphere(p, 1.8);
  if (boundDist > 0.02) return boundDist;

  const float scale = 2.0;
  vec3 a1 = vec3( 1.0,  1.0,  1.0);
  vec3 a2 = vec3(-1.0, -1.0,  1.0);
  vec3 a3 = vec3( 1.0, -1.0, -1.0);
  vec3 a4 = vec3(-1.0,  1.0, -1.0);

  float totalScale = 1.0;

  for (int i = 0; i < MAX_ITER; i++) {
    if (float(i) >= iterCount) break;

    vec3  c    = a1;
    float dist = length(p - a1);
    float d;

    d = length(p - a2); if (d < dist) { c = a2; dist = d; }
    d = length(p - a3); if (d < dist) { c = a3; dist = d; }
    d = length(p - a4); if (d < dist) { c = a4; dist = d; }

    p = scale * p - c * (scale - 1.0);
    totalScale *= scale;
  }

  // 0.6: IFS 근사 거리가 실제보다 크게 나오는 경향을 보정하는 fudge factor
  return (length(p) - 1.0) * 0.6 / totalScale;
}

// ══════════════════════════════════════════════════════════════
//  ④ 씬 정의
// ══════════════════════════════════════════════════════════════
vec2 mapMenger(vec3 p) {
  float d = sdMenger(p, uIterations);
  float fl = p.y + 1.6;
  if (d < fl) return vec2(d, 1.0);
  return vec2(fl, 0.0);
}

vec2 mapSierpinski(vec3 p) {
  float d = sdSierpinski(p * 0.9, uIterations) / 0.9;
  float fl = p.y + 1.6;
  if (d < fl) return vec2(d, 2.0);
  return vec2(fl, 0.0);
}

vec2 mapTwistMenger(vec3 p) {
  // 높이(y)에 따라 회전각이 커지도록 twist → 위로 갈수록 더 비틀린 나선탑
  vec3 tp = opTwist(p, 0.5 + 0.3 * sin(uTime * 0.3));
  float d = sdMenger(tp, min(uIterations, 4.0));  // 트위스트는 왜곡이 커서 반복은 4로 제한
  float fl = p.y + 1.6;
  if (d < fl) return vec2(d, 3.0);
  return vec2(fl, 0.0);
}

vec2 map(vec3 p) {
  vec2 result = vec2(99.0, 0.0);
  if (uScene < 0.5) {
    result = mapMenger(p);
  } else if (uScene < 1.5) {
    result = mapSierpinski(p);
  } else {
    result = mapTwistMenger(p);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
//  ⑤ 재질
// ══════════════════════════════════════════════════════════════
vec3 getMaterial(float id, vec3 p) {
  if (id < 0.5) {
    float c = mod(floor(p.x) + floor(p.z), 2.0);
    return mix(vec3(0.10, 0.12, 0.16), vec3(0.20, 0.24, 0.30), c);
  }
  if (id < 1.5) return vec3(0.95, 0.55, 0.20);  // Menger — 주황
  if (id < 2.5) return vec3(0.30, 0.75, 0.95);  // Sierpinski — 하늘
  return vec3(0.75, 0.35, 0.95);                 // 트위스트 — 보라
}

// ══════════════════════════════════════════════════════════════
//  ⑥ 보조 계산
// ══════════════════════════════════════════════════════════════
vec3 calcNormal(vec3 p) {
  const float e = 0.0015;
  return normalize(vec3(
    map(p + vec3(e,0,0)).x - map(p - vec3(e,0,0)).x,
    map(p + vec3(0,e,0)).x - map(p - vec3(0,e,0)).x,
    map(p + vec3(0,0,e)).x - map(p - vec3(0,0,e)).x
  ));
}

float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0, t = tmin;
  for (int i = 0; i < 14; i++) {
    float d = map(ro + rd * t).x;
    res = min(res, k * d / t);
    t  += clamp(d, 0.01, 0.2);
    if (res < 0.001 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

// 프랙탈은 갈라진 틈이 많아 AO가 있어야 입체감이 확 살아남
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sc = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.01 + 0.10 * float(i) / 4.0;
    occ += (h - map(p + h * n).x) * sc;
    sc  *= 0.9;
  }
  return clamp(1.0 - 2.5 * occ, 0.0, 1.0);
}

// ══════════════════════════════════════════════════════════════
//  ⑦ 메인
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
    t += d.x * 0.85;  // 프랙탈 표면 근처 오버슈트 방지용 보수적 스텝
    if (t > MAX_DIST) break;
  }

  vec3 col = mix(vec3(0.03,0.04,0.10), vec3(0.01,0.01,0.05),
                 clamp(uv.y*0.5+0.5, 0.0, 1.0));

  if (hitT > 0.0) {
    vec3 pos = ro + rd * hitT;
    vec3 nor = calcNormal(pos);
    vec3 alb = getMaterial(hitMat, pos);

    vec3 sunDir = normalize(vec3(0.6, 1.2, 0.8));
    float sha  = softShadow(pos + nor*0.005, sunDir, 0.05, 14.0, 6.0);
    float ao   = calcAO(pos, nor);
    float diff = max(dot(nor, sunDir), 0.0);
    float skyL = max(0.5 + 0.5*nor.y, 0.0);
    vec3  hal  = normalize(sunDir - rd);
    float spec = pow(max(dot(nor, hal), 0.0), 40.0) * sha;

    col = alb * (diff*sha*vec3(1.0,0.96,0.88)*2.0
               + skyL*ao*vec3(0.16,0.24,0.42))
        + vec3(spec*0.35);

    col = mix(col, vec3(0.03,0.04,0.08), 1.0 - exp(-hitT*0.05));
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

  let theta = 0.5, phi = 1.0, radius = 4.5;
  let dragging = false, lastX = 0, lastY = 0;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamPos:     { value: new THREE.Vector3() },
    uCamRight:   { value: new THREE.Vector3() },
    uCamUp:      { value: new THREE.Vector3() },
    uCamFwd:     { value: new THREE.Vector3() },
    uScene:      { value: 0.0 },
    uIterations: { value: 3.0 },
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
    radius = Math.max(1.8, Math.min(14.0, radius + e.deltaY * 0.008));
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
      label: 'Menger Sponge',
      emoji: '🧊',
      desc:  '3×3×3 분할 → 중앙 십자 파내기 재귀',
      detail:'정육면체를 3등분해서 중앙 십자 모양을 파내고,<br>남은 20조각마다 같은 과정을 반복합니다.',
      maxIter: 5,
    },
    {
      label: 'Sierpinski',
      emoji: '🔺',
      desc:  '4점 폴딩 IFS — 사면체 프랙탈',
      detail:'가장 가까운 꼭짓점 쪽으로 공간을 계속 접으면(fold)<br>사면체 안에 사면체가 무한히 반복됩니다.',
      maxIter: 7,
    },
    {
      label: '트위스트 Menger',
      emoji: '🌀',
      desc:  'Menger + opTwist (레슨45 도메인 변형)',
      detail:'재귀 반복 전에 공간을 비틀어 넣으면<br>구멍 뚫린 나선탑처럼 보입니다.',
      maxIter: 4,
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
        ${m.emoji} SDF 프랙탈 — ${m.label}
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
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:11px;white-space:nowrap;">반복 횟수</span>
        <input id="rm-iter" type="range" min="0" max="${m.maxIter}" step="1"
          value="${Math.min(uniforms.uIterations.value, m.maxIter)}"
          style="flex:1;accent-color:#6366f1;cursor:pointer;">
        <span id="rm-iter-val" style="color:#e2e8f0;font-size:12px;width:16px;">
          ${Math.min(uniforms.uIterations.value, m.maxIter)}
        </span>
      </div>
      <div style="color:#1e3a5f;font-size:10px;margin-bottom:2px;">
        반복↑ = 디테일↑ · 연산량↑ (프레임이 느려지면 낮추세요)
      </div>
      <div style="color:#334155;font-size:11px;margin-top:6px;">드래그: 회전 &nbsp;·&nbsp; 휠: 줌</div>
    `;

    ui.querySelectorAll('button[data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentMode = +btn.dataset.i;
        uniforms.uScene.value = parseFloat(btn.dataset.i);
        // 씬 전환 시 새 씬의 기본 반복 횟수로 리셋 (이전 씬 상한을 넘지 않게)
        uniforms.uIterations.value = Math.min(uniforms.uIterations.value, MODES[currentMode].maxIter);
        renderUI();
      });
    });

    ui.querySelector('#rm-iter').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      uniforms.uIterations.value = v;
      ui.querySelector('#rm-iter-val').textContent = v.toFixed(0);
    });
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
