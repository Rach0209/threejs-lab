// ══════════════════════════════════════════════════════════════
//  레슨 49: Mandelbulb — 3D 프랙탈 (시리즈 마무리)
//
//  📌 Mandelbrot(46)의 복소수 반복을 3차원 구면좌표로 확장하면,
//     울퉁불퉁한 산호·촉수 같은 유기적 3D 프랙탈이 나타납니다!
//     이 레슨은 43(Raymarching) + 46(반복 수식) + 48(재귀 최적화)의
//     기법을 모두 합칩니다.
//
//  배울 것:
//    - Mandelbulb 공식      : 구면좌표(r, θ, φ)로 z→zⁿ+c를 3D로 일반화
//    - Distance Estimator   : 반복 도함수(dr)로 정확한 SDF 근사 유도
//    - Power(n) 파라미터     : n=8이 가장 유명("전통적" Mandelbulb 모양)
//    - 파워 애니메이션      : n을 시간에 따라 바꾸면 형태가 꿈틀거림
//    - 트위스트 결합        : 45/48의 opTwist를 Mandelbulb에도 적용 가능
//    - 바운딩 조기반환      : 48에서 배운 최적화를 그대로 재사용
//
//  씬:
//    0 — 클래식 Mandelbulb : power 슬라이더로 형태 실험
//    1 — 파워 애니메이션    : power가 시간에 따라 맥동
//    2 — 트위스트 Mandelbulb: 공간을 비틀어 나선형으로 왜곡
//
//  조작:
//    마우스 드래그  — 카메라 회전
//    휠            — 줌
//
//  🎯 실전 활용 예시:
//    - Shadertoy급 아트워크·앨범 커버·전시 영상의 초현실적 3D 오브젝트
//    - 생성예술(generative art) NFT/포스터의 형태 소스
//    - 셰이더 최적화(바운딩볼륨, DE 근사) 실전 학습 사례
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
uniform float uPower;
uniform float uIterations;

const int   MAX_STEPS = 100;
const float MAX_DIST  = 20.0;
const float SURF_EPS  = 0.0008;
const int   MAX_ITER  = 12;   // 컴파일타임 루프 상한

float sdSphere(vec3 p, float r) { return length(p) - r; }

vec3 opTwist(vec3 p, float angle) {
  float c = cos(angle * p.y);
  float s = sin(angle * p.y);
  return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}

// ══════════════════════════════════════════════════════════════
//  ① Mandelbulb Distance Estimator
//
//     원리: Mandelbrot의 z→z²+c를 3D 구면좌표로 일반화.
//     복소수 대신 (r, θ, φ) 구면좌표로 점을 표현하고,
//     "n제곱"을 r→rⁿ, θ→nθ, φ→nφ 로 정의해서 3D판 z→zⁿ+c를 만든다.
//
//     dr(도함수 누적)을 함께 추적하면, 실제 거리를
//     0.5 * log(r) * r / dr 공식으로 근사할 수 있다.
//     (엄밀한 SDF는 아니지만 레이마칭에 충분히 정확한 표준 근사)
// ══════════════════════════════════════════════════════════════
float sdMandelbulb(vec3 pos, float power, float iterCount) {
  // 바운딩 조기반환 (레슨48 최적화 패턴) — Mandelbulb는 반지름 1.2 안에 항상 들어있음
  float bound = sdSphere(pos, 1.2);
  if (bound > 0.01) return bound;

  vec3  z  = pos;
  float dr = 1.0;
  float r  = 0.0;

  for (int i = 0; i < MAX_ITER; i++) {
    if (float(i) >= iterCount) break;

    r = length(z);
    if (r > 2.0) break;  // 발산 확정 → 더 반복해도 의미 없음

    // 직교좌표 → 구면좌표 (r이 0에 매우 가까워지는 예외적 경우 나눗셈 보호)
    float theta = acos(clamp(z.z / max(r, 1e-6), -1.0, 1.0));
    float phi   = atan(z.y, z.x);

    // 도함수(dr) 누적: r^(n-1) * n * dr + 1
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    // rⁿ, nθ, nφ 로 "n제곱" 적용 후 구면좌표 → 직교좌표
    float zr = pow(r, power);
    theta *= power;
    phi   *= power;

    z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
    z += pos;  // +c
  }

  // log(r)는 r→0일 때 -∞로 발산하고 dr→0이면 나눗셈이 불안정해지므로
  // (특히 트위스트로 도메인이 뒤틀릴 때 이런 극단값이 튀는 픽셀로 나타남) 안전하게 클램프
  return 0.5 * log(max(r, 1e-6)) * r / max(dr, 1e-6);
}

// ══════════════════════════════════════════════════════════════
//  ② 씬 정의
// ══════════════════════════════════════════════════════════════
vec2 mapClassic(vec3 p) {
  float d  = sdMandelbulb(p, uPower, uIterations);
  float fl = p.y + 1.5;
  if (d < fl) return vec2(d, 1.0);
  return vec2(fl, 0.0);
}

vec2 mapPowerAnim(vec3 p) {
  // power를 4~10 사이로 천천히 맥동 → 형태가 살아있는 것처럼 변함
  float animPower = 7.0 + sin(uTime * 0.25) * 3.0;
  float d  = sdMandelbulb(p, animPower, min(uIterations, 9.0));
  float fl = p.y + 1.5;
  if (d < fl) return vec2(d, 2.0);
  return vec2(fl, 0.0);
}

vec2 mapTwist(vec3 p) {
  // 트위스트 강도를 완만하게 유지 (강할수록 DE 근사가 깨져 노멀이 불안정해짐)
  vec3 tp = opTwist(p, 0.3 + 0.2 * sin(uTime * 0.2));
  float d  = sdMandelbulb(tp, uPower, min(uIterations, 7.0));  // 트위스트는 왜곡 큼 → 반복 제한
  float fl = p.y + 1.5;
  if (d < fl) return vec2(d, 3.0);
  return vec2(fl, 0.0);
}

vec2 map(vec3 p) {
  vec2 result = vec2(99.0, 0.0);
  if (uScene < 0.5) {
    result = mapClassic(p);
  } else if (uScene < 1.5) {
    result = mapPowerAnim(p);
  } else {
    result = mapTwist(p);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
//  ③ 재질
// ══════════════════════════════════════════════════════════════
vec3 getMaterial(float id, vec3 p) {
  if (id < 0.5) {
    float c = mod(floor(p.x) + floor(p.z), 2.0);
    return mix(vec3(0.10, 0.12, 0.16), vec3(0.20, 0.24, 0.30), c);
  }
  if (id < 1.5) return vec3(0.95, 0.35, 0.55);  // 클래식 — 산호 핑크
  if (id < 2.5) return vec3(0.35, 0.85, 0.65);  // 파워 애니메이션 — 청록
  return vec3(0.60, 0.45, 0.95);                 // 트위스트 — 보라
}

// ══════════════════════════════════════════════════════════════
//  ④ 보조 계산
// ══════════════════════════════════════════════════════════════
vec3 calcNormal(vec3 p) {
  const float e = 0.002;
  vec3 n = vec3(
    map(p + vec3(e,0,0)).x - map(p - vec3(e,0,0)).x,
    map(p + vec3(0,e,0)).x - map(p - vec3(0,e,0)).x,
    map(p + vec3(0,0,e)).x - map(p - vec3(0,0,e)).x
  );
  // Mandelbulb DE는 근사치라 트위스트로 뒤틀린 영역에서 중심차분 6샘플이
  // 우연히 거의 같은 값을 반환해 n이 0벡터에 가까워질 수 있음
  // (normalize(0)은 NaN → 화면에 색이 튀는 픽셀로 나타남) → 최소 길이 보장
  if (dot(n, n) < 1e-8) return vec3(0.0, 1.0, 0.0);
  return normalize(n);
}

float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0, t = tmin;
  for (int i = 0; i < 12; i++) {
    float d = map(ro + rd * t).x;
    res = min(res, k * d / t);
    t  += clamp(d, 0.01, 0.15);
    if (res < 0.001 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sc = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.005 + 0.06 * float(i) / 4.0;
    occ += (h - map(p + h * n).x) * sc;
    sc  *= 0.9;
  }
  return clamp(1.0 - 2.5 * occ, 0.0, 1.0);
}

// ══════════════════════════════════════════════════════════════
//  ⑤ 메인
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
    t += d.x * 0.8;  // Mandelbulb 표면 근처 오버슈트 방지용 보수적 스텝
    if (t > MAX_DIST) break;
  }

  vec3 col = mix(vec3(0.03,0.04,0.10), vec3(0.01,0.01,0.05),
                 clamp(uv.y*0.5+0.5, 0.0, 1.0));

  if (hitT > 0.0) {
    vec3 pos = ro + rd * hitT;
    vec3 nor = calcNormal(pos);
    vec3 alb = getMaterial(hitMat, pos);

    vec3 sunDir = normalize(vec3(0.6, 1.2, 0.8));
    float sha  = softShadow(pos + nor*0.003, sunDir, 0.03, 10.0, 6.0);
    float ao   = calcAO(pos, nor);
    float diff = max(dot(nor, sunDir), 0.0);
    float skyL = max(0.5 + 0.5*nor.y, 0.0);
    vec3  hal  = normalize(sunDir - rd);
    float spec = pow(max(dot(nor, hal), 0.0), 40.0) * sha;

    col = alb * (diff*sha*vec3(1.0,0.96,0.88)*2.0
               + skyL*ao*vec3(0.16,0.24,0.42))
        + vec3(spec*0.35);

    col = mix(col, vec3(0.03,0.04,0.08), 1.0 - exp(-hitT*0.08));
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

  let theta = 0.5, phi = 1.0, radius = 3.2;
  let dragging = false, lastX = 0, lastY = 0;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamPos:     { value: new THREE.Vector3() },
    uCamRight:   { value: new THREE.Vector3() },
    uCamUp:      { value: new THREE.Vector3() },
    uCamFwd:     { value: new THREE.Vector3() },
    uScene:      { value: 0.0 },
    uPower:      { value: 8.0 },
    uIterations: { value: 8.0 },
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
    radius = Math.max(1.3, Math.min(10.0, radius + e.deltaY * 0.006));
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
      label: '클래식',
      emoji: '🪸',
      desc:  'power 슬라이더로 형태 실험 (n=8이 전통적 모양)',
      detail:'구면좌표에서 r→rⁿ, θ→nθ, φ→nφ 로 n제곱을 정의합니다.<br>n을 바꾸면 완전히 다른 프랙탈 형태가 나옵니다.',
      showPower: true,
    },
    {
      label: '파워 애니메이션',
      emoji: '🫀',
      desc:  'power(n)가 시간에 따라 4~10 사이 맥동',
      detail:'n 값 하나만 시간에 따라 바꿔도<br>마치 살아있는 생물처럼 형태가 계속 변합니다.',
      showPower: false,
    },
    {
      label: '트위스트',
      emoji: '🌀',
      desc:  'Mandelbulb + opTwist (레슨45/48 재사용)',
      detail:'Mandelbulb를 계산하기 전에 공간을 비틀면<br>나선형으로 왜곡된 프랙탈이 됩니다.',
      showPower: true,
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
        ${m.emoji} Mandelbulb — ${m.label}
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
      ${m.showPower ? `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:11px;white-space:nowrap;">Power (n)</span>
          <input id="rm-power" type="range" min="2" max="14" step="0.5"
            value="${uniforms.uPower.value}"
            style="flex:1;accent-color:#6366f1;cursor:pointer;">
          <span id="rm-power-val" style="color:#e2e8f0;font-size:12px;width:24px;">
            ${uniforms.uPower.value.toFixed(1)}
          </span>
        </div>
      ` : ''}
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:11px;white-space:nowrap;">반복 횟수</span>
        <input id="rm-iter" type="range" min="2" max="12" step="1"
          value="${uniforms.uIterations.value}"
          style="flex:1;accent-color:#6366f1;cursor:pointer;">
        <span id="rm-iter-val" style="color:#e2e8f0;font-size:12px;width:16px;">
          ${uniforms.uIterations.value}
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
        renderUI();
      });
    });

    const powerRange = ui.querySelector('#rm-power');
    if (powerRange) {
      powerRange.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        uniforms.uPower.value = v;
        ui.querySelector('#rm-power-val').textContent = v.toFixed(1);
      });
    }

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
