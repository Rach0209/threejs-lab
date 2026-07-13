// ══════════════════════════════════════════════════════════════
//  레슨 44: SDF 텍스처 & 절차적 노이즈
//
//  📌 수식으로 만든 도형에 수식으로 텍스처를 입힙니다!
//
//  배울 것:
//    - Hash 함수           : 규칙적인 숫자 → 의사난수(pseudo-random)
//    - Value Noise         : 격자점 해시를 보간 → 부드러운 잡음
//    - FBM                 : Noise를 여러 주파수로 겹쳐 디테일 추가
//    - 도메인 워핑          : 좌표 자체를 노이즈로 비틀기
//    - 절차적 색상 매핑     : 0~1 값 → 그라디언트 색상
//
//  씬:
//    0 — 대리석  : sin(x + FBM) → 결무늬
//    1 — 용암    : FBM 도메인 워핑 → 열 색상 그라디언트
//    2 — 행성    : FBM 고도 → 해양/육지/산/설원 색상대
//
//  조작:
//    마우스 드래그  — 카메라 회전
//    휠            — 줌
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';

const vertexShader = /* glsl */`
void main() {
  gl_Position = vec4(position, 1.0);
}
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
uniform float uOctaves;  // FBM 옥타브 수 (1~6)

const int   MAX_STEPS = 80;
const float MAX_DIST  = 30.0;
const float SURF_EPS  = 0.002;

// ══════════════════════════════════════════════════════════════
//  ① 노이즈 빌딩 블록
// ══════════════════════════════════════════════════════════════

// Hash: 벡터 → 의사 난수 [0, 1]
// sin을 이용한 간단한 해시 (모바일 호환)
float hash(vec3 p) {
  p = fract(p * vec3(127.1, 311.7, 74.7));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

// Value Noise: 3D 격자점에서 보간
// smoothstep으로 부드럽게 연결
float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);  // smoothstep

  return mix(
    mix(
      mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), u.x),
      mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x),
      u.y
    ),
    mix(
      mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x),
      mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x),
      u.y
    ),
    u.z
  );
}

// FBM (Fractional Brownian Motion)
// 같은 Noise를 주파수↑ 진폭↓ 로 여러 번 쌓기
// → 거친 자연 패턴 (구름, 지형, 대리석 결)
float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  float total = 0.0;

  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value     += valueNoise(p * frequency) * amplitude;
    total     += amplitude;
    amplitude *= 0.5;    // 진폭 절반
    frequency *= 2.0;    // 주파수 2배
  }
  return value / total;  // 0~1 정규화
}

// ══════════════════════════════════════════════════════════════
//  ② 씬 SDF
// ══════════════════════════════════════════════════════════════

float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}
float sdTorus(vec3 p, float R, float r) {
  return length(vec2(length(p.xz)-R, p.y)) - r;
}
float sdCapsule(vec3 p, float h, float r) {
  float cy = clamp(p.y, 0.0, h);
  return length(p - vec3(0.0, cy, 0.0)) - r;
}

// 씬 0: 구 + 박스 + 토러스 (대리석)
vec2 mapMarble(vec3 p) {
  float best = 99.0; float mat = 0.0; float d = 0.0;
  d = sdSphere(p - vec3(-2.2, 0.2, 0.0), 1.05);
  if (d < best) { best = d; mat = 1.0; }
  d = sdBox(p - vec3(1.8, 0.0, -0.5), vec3(0.85));
  if (d < best) { best = d; mat = 2.0; }
  d = sdTorus(p - vec3(0.0, 0.0, 1.2), 0.7, 0.28);
  if (d < best) { best = d; mat = 3.0; }
  d = p.y + 1.1;
  if (d < best) { best = d; mat = 0.0; }
  return vec2(best, mat);
}

// 씬 1: 구 + 캡슐 (용암)
vec2 mapLava(vec3 p) {
  float best = 99.0; float mat = 0.0; float d = 0.0;
  d = sdSphere(p - vec3(-1.5, 0.2, 0.0), 1.1);
  if (d < best) { best = d; mat = 4.0; }
  d = sdCapsule(p - vec3(1.5, -0.5, 0.0), 1.4, 0.45);
  if (d < best) { best = d; mat = 5.0; }
  d = p.y + 1.1;
  if (d < best) { best = d; mat = 0.0; }
  return vec2(best, mat);
}

// 씬 2: 큰 구 하나 (행성)
vec2 mapPlanet(vec3 p) {
  float d = sdSphere(p, 1.6);
  return vec2(d, 6.0);
}

vec2 map(vec3 p) {
  vec2 result = vec2(99.0, 0.0);
  if (uScene < 0.5) {
    result = mapMarble(p);
  } else if (uScene < 1.5) {
    result = mapLava(p);
  } else {
    result = mapPlanet(p);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
//  ③ 절차적 텍스처 (Material)
// ══════════════════════════════════════════════════════════════

// ── 대리석 텍스처 ──────────────────────────────────────────
// 아이디어: sin(x + fbm) → 가늘고 긴 결무늬
// fbm이 x좌표를 비틀어 결이 흘러가는 느낌
vec3 marbleColor(vec3 p) {
  int oct = int(uOctaves);
  // FBM으로 좌표를 살짝 비틈 (도메인 워핑 예고)
  float warp = fbm(p * 1.2 + vec3(0.3, 1.7, 0.5), oct);
  // sin 패턴에 warp를 섞어 결 생성
  float veins = sin(p.x * 3.5 + warp * 5.0) * 0.5 + 0.5;
  veins = pow(veins, 2.0);  // 결 선명하게

  // 흰 대리석 기본, 결 부분은 짙은 회색
  vec3 col = mix(
    vec3(0.92, 0.90, 0.86),  // 흰 베이스
    vec3(0.18, 0.16, 0.20),  // 짙은 결
    veins
  );
  // 미세 노이즈로 현실감 추가
  float grain = valueNoise(p * 8.0) * 0.04;
  return col + grain;
}

// ── 바닥 체커보드 ──────────────────────────────────────────
vec3 floorColor(vec3 p) {
  float c = mod(floor(p.x) + floor(p.z), 2.0);
  return mix(vec3(0.10, 0.12, 0.16), vec3(0.22, 0.26, 0.32), c);
}

// ── 용암 텍스처 ────────────────────────────────────────────
// 아이디어: 도메인 워핑 2단계 → 용암 흐름 느낌
// q = fbm(p)  →  r = fbm(p + q)  →  color(r)
vec3 lavaColor(vec3 p, float t) {
  int oct = int(uOctaves);
  // 1단계 워핑: 시간에 따라 흐름
  vec3 q = vec3(
    fbm(p + vec3(0.0, 0.0, t * 0.15), oct),
    fbm(p + vec3(5.2, 1.3, t * 0.12), oct),
    0.0
  );
  // 2단계 워핑: q로 다시 한번 비틀기
  float r = fbm(p + 4.0 * q + vec3(t * 0.08), oct);

  // 0~1 → 용암 색상 (검정→빨강→주황→노랑→흰)
  vec3 col = vec3(0.0);
  if (r < 0.3) {
    col = mix(vec3(0.02, 0.01, 0.02), vec3(0.55, 0.05, 0.02), r / 0.3);
  } else if (r < 0.6) {
    col = mix(vec3(0.55, 0.05, 0.02), vec3(1.00, 0.42, 0.02), (r-0.3)/0.3);
  } else if (r < 0.8) {
    col = mix(vec3(1.00, 0.42, 0.02), vec3(1.00, 0.88, 0.20), (r-0.6)/0.2);
  } else {
    col = mix(vec3(1.00, 0.88, 0.20), vec3(1.00, 1.00, 0.95), (r-0.8)/0.2);
  }
  return col;
}

// ── 행성 텍스처 ────────────────────────────────────────────
// 아이디어: FBM 값 = 고도 → 구간별 색상 (바다/육지/산/설원)
vec3 planetColor(vec3 p, float t) {
  int oct = int(uOctaves);
  // 행성은 구 위 노말 방향이 곧 UV
  vec3 n = normalize(p);
  // 느리게 회전하는 대륙
  float angle = t * 0.08;
  float cs = cos(angle), sn = sin(angle);
  vec3 rp = vec3(cs*n.x - sn*n.z, n.y, sn*n.x + cs*n.z);

  float elev = fbm(rp * 2.2 + vec3(3.5, 1.2, 0.8), oct);

  // 고도 구간 → 색상
  vec3 col = vec3(0.0);
  if (elev < 0.38) {
    // 심해: 짙은 파랑
    float f = elev / 0.38;
    col = mix(vec3(0.02, 0.05, 0.18), vec3(0.06, 0.28, 0.55), f);
  } else if (elev < 0.48) {
    // 얕은 바다: 밝은 청록
    float f = (elev-0.38)/0.10;
    col = mix(vec3(0.06, 0.28, 0.55), vec3(0.18, 0.62, 0.75), f);
  } else if (elev < 0.52) {
    // 해변: 노란 모래
    col = vec3(0.78, 0.72, 0.45);
  } else if (elev < 0.68) {
    // 육지/초원: 초록
    float f = (elev-0.52)/0.16;
    col = mix(vec3(0.22, 0.52, 0.18), vec3(0.30, 0.42, 0.22), f);
  } else if (elev < 0.80) {
    // 산: 갈색/회색
    float f = (elev-0.68)/0.12;
    col = mix(vec3(0.45, 0.38, 0.28), vec3(0.62, 0.58, 0.55), f);
  } else {
    // 설원: 흰색
    float f = clamp((elev-0.80)/0.10, 0.0, 1.0);
    col = mix(vec3(0.62, 0.58, 0.55), vec3(0.92, 0.95, 0.98), f);
  }

  // 극지방 얼음캡
  float polar = abs(n.y);
  if (polar > 0.72) {
    float f = clamp((polar - 0.72) / 0.12, 0.0, 1.0);
    col = mix(col, vec3(0.88, 0.92, 0.98), f);
  }

  return col;
}

// ══════════════════════════════════════════════════════════════
//  ④ 보조 계산 (노멀, 그림자)
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
  for (int i = 0; i < 14; i++) {
    float d = map(ro + rd * t).x;
    res = min(res, k * d / t);
    t  += clamp(d, 0.04, 0.3);
    if (res < 0.001 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ══════════════════════════════════════════════════════════════
//  ⑤ 메인
// ══════════════════════════════════════════════════════════════
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamRight * uv.x + uCamUp * uv.y + uCamFwd * 1.5);

  // ─── Sphere Tracing ───────────────────────────────────────
  float t      = 0.1;
  float hitT   = -1.0;
  float hitMat = -1.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2 d = map(ro + rd * t);
    if (d.x < SURF_EPS) { hitT = t; hitMat = d.y; break; }
    t += d.x;
    if (t > MAX_DIST) break;
  }

  // ─── 배경 ────────────────────────────────────────────────
  vec3 col = mix(vec3(0.03, 0.04, 0.10), vec3(0.01, 0.01, 0.05),
                 clamp(uv.y * 0.5 + 0.5, 0.0, 1.0));

  if (hitT > 0.0) {
    vec3 pos = ro + rd * hitT;
    vec3 nor = calcNormal(pos);
    vec3 sunDir = normalize(vec3(0.6, 1.2, 0.8));

    // ─── 절차적 텍스처 선택 ──────────────────────────────
    vec3 alb = vec3(0.5);

    if (hitMat < 0.5) {
      // 바닥
      alb = floorColor(pos);
    } else if (uScene < 0.5) {
      // 대리석 씬
      alb = marbleColor(pos);
    } else if (uScene < 1.5) {
      // 용암 씬 — 용암 표면은 스스로 빛나므로 조명 절반만
      alb = lavaColor(pos, uTime);
    } else {
      // 행성 씬
      alb = planetColor(pos, uTime);
    }

    float sha  = softShadow(pos + nor * 0.005, sunDir, 0.05, 20.0, 6.0);
    float diff = max(dot(nor, sunDir), 0.0);
    float skyL = max(0.5 + 0.5 * nor.y, 0.0);
    vec3  hal  = normalize(sunDir - rd);
    float spec = pow(max(dot(nor, hal), 0.0), 48.0) * sha;

    // 용암은 자체 발광 효과 (조명 영향 줄임)
    float selfEmit = 0.0;
    if (uScene > 0.5 && uScene < 1.5 && hitMat > 3.5) selfEmit = 0.5;

    col = alb * (diff * sha * vec3(1.0, 0.96, 0.88) * (2.0 - selfEmit)
               + skyL * vec3(0.16, 0.24, 0.42))
        + vec3(spec * 0.4)
        + alb * selfEmit;

    // 거리 안개
    col = mix(col, vec3(0.03, 0.04, 0.08), 1.0 - exp(-hitT * 0.05));
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

  let theta = 0.32, phi = 0.88, radius = 7.0;
  let dragging = false, lastX = 0, lastY = 0;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamPos:     { value: new THREE.Vector3() },
    uCamRight:   { value: new THREE.Vector3() },
    uCamUp:      { value: new THREE.Vector3() },
    uCamFwd:     { value: new THREE.Vector3() },
    uScene:      { value: 0.0 },
    uOctaves:    { value: 4.0 },
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
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
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
    radius = Math.max(2.5, Math.min(18.0, radius + e.deltaY * 0.015));
    updateCamera();
    e.preventDefault();
  };
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup',   onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ─── UI ──────────────────────────────────────────────────
  const MODES = [
    {
      label:  '대리석',
      emoji:  '🪨',
      desc:   'sin(x + FBM) → 결무늬',
      detail: 'FBM으로 x좌표를 비틀면 sin 패턴이 흘러가며 대리석 결이 됩니다.',
    },
    {
      label:  '용암',
      emoji:  '🌋',
      desc:   '도메인 워핑 2단계 → 열 그라디언트',
      detail: 'FBM(p) → q, FBM(p+q) → r 순으로 2번 비틀어<br>녹아 흐르는 용암 패턴을 만듭니다.',
    },
    {
      label:  '행성',
      emoji:  '🌍',
      desc:   'FBM 고도 → 해양/육지/산/설원',
      detail: 'FBM 반환값을 고도로 해석해 색상 구간을 나누면<br>사실적인 행성 표면이 됩니다.',
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
        ${m.emoji} SDF 텍스처 — ${m.label}
      </div>
      <div style="color:#6366f1;font-size:11px;margin-bottom:4px;">${m.desc}</div>
      <div style="color:#475569;font-size:11px;line-height:1.6;margin-bottom:10px;">${m.detail}</div>
      <div style="display:flex;gap:6px;margin-bottom:12px;">
        ${MODES.map((mo, i) => `
          <button data-i="${i}" style="
            padding:5px 10px;
            background:${i === currentMode ? '#6366f1' : '#1e293b'};
            border:1px solid ${i === currentMode ? '#818cf8' : '#334155'};
            border-radius:6px;color:${i === currentMode ? '#fff' : '#94a3b8'};
            font-size:11px;cursor:pointer;font-family:inherit;">
            ${mo.emoji} ${mo.label}
          </button>
        `).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:11px;white-space:nowrap;">FBM 옥타브</span>
        <input id="rm-oct" type="range" min="1" max="6" step="1"
          value="${uniforms.uOctaves.value}"
          style="flex:1;accent-color:#6366f1;cursor:pointer;">
        <span id="rm-oct-val" style="color:#e2e8f0;font-size:12px;width:14px;">
          ${uniforms.uOctaves.value}
        </span>
      </div>
      <div style="color:#1e3a5f;font-size:10px;margin-bottom:2px;">
        옥타브↑ = 디테일↑, 연산↑
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

    const range = ui.querySelector('#rm-oct');
    if (range) {
      range.addEventListener('input', () => {
        const v = parseFloat(range.value);
        uniforms.uOctaves.value = v;
        ui.querySelector('#rm-oct-val').textContent = v.toFixed(0);
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
    window.removeEventListener('mouseup',   onUp);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', onResize);
    geo.dispose();
    mat.dispose();
    document.body.removeChild(ui);
  };
}
