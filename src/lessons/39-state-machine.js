// ══════════════════════════════════════════════════════════════
//  레슨 39: 상태 머신 (FSM — Finite State Machine)
//
//  배울 것:
//    - FSM 구조  : State 클래스, StateMachine 클래스로 분리
//    - 전이 규칙 : 허용된 전이만 실행 (잘못된 입력 무시)
//    - onEnter / onUpdate / onExit : 상태 진입·유지·탈출 콜백
//    - 게임 적용 : 캐릭터 상태(Idle/Walk/Run/Jump/Attack/Hurt/Dead)
//    - 시각화    : HUD 다이어그램으로 현재 상태·전이 가능 경로 표시
//
//  FSM이 중요한 이유:
//    복잡한 if/else 분기 대신 상태 객체가 자신의 로직을 책임짐
//    상태 추가·제거가 독립적이라 확장성·유지보수성이 뛰어남
//    게임의 캐릭터 AI, UI 흐름, 애니메이션 시스템 등 어디서나 쓰임
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';

// ────────────────────────────────────────────────────────────
//  FSM 코어: State + StateMachine
// ────────────────────────────────────────────────────────────

class State {
  // name     : 상태 이름 (고유 ID)
  // options  : { color, label, transitions: string[], onEnter, onUpdate, onExit }
  constructor(name, options = {}) {
    this.name        = name;
    this.color       = options.color       ?? 0xffffff;
    this.label       = options.label       ?? name;
    this.transitions = options.transitions ?? []; // 이 상태에서 갈 수 있는 상태 이름 목록
    this._onEnter  = options.onEnter  ?? (() => {});
    this._onUpdate = options.onUpdate ?? (() => {});
    this._onExit   = options.onExit   ?? (() => {});
  }
  onEnter(ctx)         { this._onEnter(ctx); }
  onUpdate(ctx, delta) { this._onUpdate(ctx, delta); }
  onExit(ctx)          { this._onExit(ctx); }
}

class StateMachine {
  constructor() {
    this.states  = {};   // name → State
    this.current = null; // 현재 State 객체
    this.ctx     = {};   // 공유 컨텍스트 (캐릭터 정보 등)
  }

  addState(state) {
    this.states[state.name] = state;
    return this;
  }

  // 초기 상태 설정
  start(name) {
    this.current = this.states[name];
    this.current?.onEnter(this.ctx);
  }

  // 상태 전이 요청 — transitions 목록에 없으면 무시
  transition(name) {
    if (!this.current) return false;
    if (!this.current.transitions.includes(name)) return false;
    const next = this.states[name];
    if (!next) return false;
    this.current.onExit(this.ctx);
    this.current = next;
    this.current.onEnter(this.ctx);
    return true;
  }

  update(delta) {
    this.current?.onUpdate(this.ctx, delta);
  }

  get stateName() { return this.current?.name ?? ''; }
}

// ────────────────────────────────────────────────────────────
//  상태 정의
// ────────────────────────────────────────────────────────────

// 상태별 색상·레이블·허용 전이
const STATE_DEFS = [
  {
    name: 'idle',
    label: 'Idle',
    color: 0x6366f1,
    transitions: ['walk', 'jump', 'attack', 'hurt'],
  },
  {
    name: 'walk',
    label: 'Walk',
    color: 0x10b981,
    transitions: ['idle', 'run', 'jump', 'attack', 'hurt'],
  },
  {
    name: 'run',
    label: 'Run',
    color: 0xf59e0b,
    transitions: ['walk', 'idle', 'jump', 'hurt'],
  },
  {
    name: 'jump',
    label: 'Jump',
    color: 0x06b6d4,
    transitions: ['idle', 'hurt'],
  },
  {
    name: 'attack',
    label: 'Attack',
    color: 0xef4444,
    transitions: ['idle', 'hurt'],
  },
  {
    name: 'hurt',
    label: 'Hurt',
    color: 0xf97316,
    transitions: ['idle', 'dead'],
  },
  {
    name: 'dead',
    label: 'Dead',
    color: 0x475569,
    transitions: ['idle'],  // 부활 가능
  },
];

// ─── init ──────────────────────────────────────────────────
export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 1, 0);

  // ─── 조명 ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x334155, 3));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 10, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFShadowMap;

  // ─── 바닥 ─────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
  );
  floor.rotation.x   = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 격자선
  const grid = new THREE.GridHelper(20, 20, 0x334155, 0x1e293b);
  grid.position.y = 0.001;
  scene.add(grid);

  // ─── 캐릭터 메시 ──────────────────────────────────────────
  const charGroup = new THREE.Group();
  scene.add(charGroup);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.4 });
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.9, 4, 8),
    bodyMat
  );
  body.position.y = 0.85;
  body.castShadow = true;
  charGroup.add(body);

  const headMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.3 });
  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 16),
    headMat
  );
  headMesh.position.y = 1.85;
  headMesh.castShadow = true;
  charGroup.add(headMesh);

  // 눈
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 8);
  [-0.13, 0.13].forEach(x => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 1.88, -0.26);
    charGroup.add(eye);
  });

  // 검 (Attack 상태에서만 보임)
  const swordGroup = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.2, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9, roughness: 0.1 })
  );
  blade.position.y = 0.6;
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8 })
  );
  swordGroup.add(blade);
  swordGroup.add(guard);
  swordGroup.position.set(0.6, 1.2, 0);
  swordGroup.visible = false;
  charGroup.add(swordGroup);

  // 데미지 이펙트 (Hurt 상태)
  const hurtRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.05, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xff6600 })
  );
  hurtRing.position.y = 1.0;
  hurtRing.rotation.x = Math.PI / 2;
  hurtRing.visible = false;
  charGroup.add(hurtRing);

  // ─── FSM 구성 ─────────────────────────────────────────────
  const fsm = new StateMachine();
  fsm.ctx = { charGroup, bodyMat, swordGroup, hurtRing, timer: 0 };

  // 상태 애니메이션 파라미터
  let walkCycle    = 0;   // walk/run 흔들림 위상
  let jumpVelY     = 0;   // jump Y 속도
  let attackPhase  = 0;   // attack 스윙 위상
  let hurtShake    = 0;   // hurt 흔들림 위상
  let deadFallY    = 0;   // dead 쓰러짐 진행도

  STATE_DEFS.forEach(def => {
    fsm.addState(new State(def.name, {
      color: def.color,
      label: def.label,
      transitions: def.transitions,

      onEnter: ctx => {
        bodyMat.color.setHex(def.color);
        swordGroup.visible = false;
        hurtRing.visible   = false;
        charGroup.rotation.z = 0;
        charGroup.rotation.x = 0;
        charGroup.position.y = 0;
        charGroup.position.x = 0;

        if (def.name === 'jump')   { jumpVelY = 6; }
        if (def.name === 'attack') { attackPhase = 0; swordGroup.visible = true; }
        if (def.name === 'hurt')   { hurtShake = 0; hurtRing.visible = true; ctx.timer = 0; }
        if (def.name === 'dead')   { deadFallY = 0; }
      },

      onUpdate: (ctx, delta) => {
        if (def.name === 'idle') {
          // 숨쉬기 애니메이션
          const t = performance.now() * 0.001;
          body.scale.y = 1 + Math.sin(t * 1.5) * 0.03;
          headMesh.position.y = 1.85 + Math.sin(t * 1.5) * 0.015;
        }

        if (def.name === 'walk') {
          walkCycle += delta * 4;
          charGroup.position.x = Math.sin(walkCycle * 0.5) * 1.2;
          body.rotation.z = Math.sin(walkCycle) * 0.08;
          headMesh.position.y = 1.85 + Math.abs(Math.sin(walkCycle)) * 0.05;
        }

        if (def.name === 'run') {
          walkCycle += delta * 8;
          charGroup.position.x = Math.sin(walkCycle * 0.5) * 2;
          body.rotation.z = Math.sin(walkCycle) * 0.18;
          headMesh.position.y = 1.85 + Math.abs(Math.sin(walkCycle)) * 0.1;
          // 앞으로 기울기
          charGroup.rotation.x = 0.15;
        }

        if (def.name === 'jump') {
          jumpVelY -= 15 * delta;
          charGroup.position.y += jumpVelY * delta;
          if (charGroup.position.y <= 0) {
            charGroup.position.y = 0;
            // 착지 → idle로 자동 전이
            fsm.transition('idle');
          }
        }

        if (def.name === 'attack') {
          attackPhase += delta * 5;
          swordGroup.rotation.z = Math.sin(attackPhase) * 1.2;
          swordGroup.rotation.x = Math.sin(attackPhase * 0.7) * 0.4;
          charGroup.rotation.z  = Math.sin(attackPhase) * 0.1;
          // 1사이클 후 idle로 복귀
          if (attackPhase > Math.PI * 2) fsm.transition('idle');
        }

        if (def.name === 'hurt') {
          hurtShake += delta * 20;
          charGroup.position.x = Math.sin(hurtShake) * 0.15;
          hurtRing.rotation.z  = hurtShake;
          hurtRing.scale.setScalar(1 + Math.sin(hurtShake * 2) * 0.2);
          ctx.timer += delta;
          // 0.6초 후 hurt 종료
          if (ctx.timer > 0.6) {
            charGroup.position.x = 0;
            // hp 감소 시뮬 — hurt 3회 쌓이면 dead 아니고 그냥 idle (간단화)
            fsm.transition('idle');
          }
        }

        if (def.name === 'dead') {
          // 앞으로 쓰러짐
          if (charGroup.rotation.x < Math.PI / 2) {
            charGroup.rotation.x += delta * 2;
          }
          // 점점 투명해짐
          const prog = Math.min(charGroup.rotation.x / (Math.PI / 2), 1);
          bodyMat.opacity = 1 - prog * 0.6;
          bodyMat.transparent = true;
        }
      },

      onExit: ctx => {
        body.scale.y = 1;
        headMesh.position.y = 1.85;
        charGroup.rotation.x = 0;
        charGroup.rotation.z = 0;
        charGroup.position.x = 0;
        charGroup.position.y = 0;
        bodyMat.opacity = 1;
        bodyMat.transparent = false;
      },
    }));
  });

  fsm.start('idle');

  // ─── HUD ──────────────────────────────────────────────────
  const hud = document.createElement('div');
  hud.id = 'fsm-hud';
  hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:"Courier New",monospace;';

  // 버튼 (pointer-events: auto)
  const btnDefs = [
    { key: 'Q', label: 'Idle',   state: 'idle'   },
    { key: 'W', label: 'Walk',   state: 'walk'   },
    { key: 'E', label: 'Run',    state: 'run'    },
    { key: 'R', label: 'Jump',   state: 'jump'   },
    { key: 'A', label: 'Attack', state: 'attack' },
    { key: 'S', label: 'Hurt',   state: 'hurt'   },
    { key: 'D', label: 'Dead',   state: 'dead'   },
  ];

  const btnColors = {
    idle:   '#6366f1', walk: '#10b981', run: '#f59e0b',
    jump:   '#06b6d4', attack: '#ef4444', hurt: '#f97316', dead: '#475569',
  };

  hud.innerHTML = `
    <!-- 조작 버튼 패널 -->
    <div id="fsm-ctrl" style="
      position:absolute;
      left:var(--panel-left,280px);
      bottom:20px;
      transition:left .25s ease;
      pointer-events:auto;
      display:flex;flex-direction:column;gap:8px;
    ">
      <div style="
        background:rgba(0,0,0,.7);border:1px solid #334155;
        border-radius:8px;padding:12px 16px;
        color:#94a3b8;font-size:12px;
      ">
        <div style="color:#e2e8f0;font-weight:bold;margin-bottom:8px">상태 전이 입력</div>
        <div id="fsm-btn-list" style="display:flex;flex-wrap:wrap;gap:6px;max-width:260px;"></div>
        <div style="margin-top:10px;color:#64748b;font-size:11px;line-height:1.7;">
          허용된 전이만 실행됩니다.<br>불가 전이는 무시됩니다.
        </div>
      </div>
    </div>

    <!-- 현재 상태 표시 -->
    <div style="
      position:absolute;top:16px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,.7);border:1px solid #334155;
      border-radius:8px;padding:10px 20px;text-align:center;
    ">
      <div style="color:#64748b;font-size:11px;margin-bottom:4px;">현재 상태</div>
      <div id="fsm-state-name" style="font-size:22px;font-weight:bold;color:#6366f1;letter-spacing:1px;">IDLE</div>
    </div>

    <!-- 상태 다이어그램 -->
    <div style="
      position:absolute;right:20px;top:16px;
      background:rgba(0,0,0,.7);border:1px solid #334155;
      border-radius:8px;padding:14px;
      pointer-events:none;
    ">
      <div style="color:#94a3b8;font-size:11px;font-weight:bold;margin-bottom:10px;">상태 다이어그램</div>
      <div id="fsm-diagram" style="display:flex;flex-direction:column;gap:4px;font-size:11px;"></div>
      <div style="margin-top:10px;color:#475569;font-size:10px;line-height:1.7;">
        ■ 현재  ○ 전이 가능<br>· 전이 불가
      </div>
    </div>

    <!-- 로그 -->
    <div style="
      position:absolute;right:20px;bottom:20px;
      background:rgba(0,0,0,.7);border:1px solid #334155;
      border-radius:8px;padding:10px 14px;
      width:220px;
    ">
      <div style="color:#94a3b8;font-size:11px;font-weight:bold;margin-bottom:6px;">전이 로그</div>
      <div id="fsm-log" style="
        display:flex;flex-direction:column;gap:3px;
        font-size:11px;color:#475569;
        max-height:120px;overflow:hidden;
      "></div>
    </div>
  `;
  document.body.appendChild(hud);

  // 버튼 생성
  const btnList = document.getElementById('fsm-btn-list');
  btnDefs.forEach(({ key, label, state }) => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      background:rgba(${hexToRgb(btnColors[state])},.2);
      border:1px solid ${btnColors[state]}44;
      border-radius:6px;padding:6px 10px;
      color:${btnColors[state]};font-size:12px;font-weight:bold;
      cursor:pointer;white-space:nowrap;
      transition:background .15s,opacity .15s;
    `;
    btn.innerHTML = `<span style="color:#64748b;margin-right:4px">[${key}]</span>${label}`;
    btn.dataset.state = state;
    btn.addEventListener('click', () => requestTransition(state));
    btnList.appendChild(btn);
  });

  // 다이어그램 생성
  const diagramEl = document.getElementById('fsm-diagram');
  STATE_DEFS.forEach(def => {
    const row = document.createElement('div');
    row.id = `diag-${def.name}`;
    row.style.cssText = `display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;color:#94a3b8;`;
    row.innerHTML = `
      <span id="diag-dot-${def.name}" style="font-size:14px;color:#334155;">·</span>
      <span style="color:${btnColors[def.name]};min-width:50px;">${def.label}</span>
      <span id="diag-arrow-${def.name}" style="color:#334155;font-size:10px;"></span>
    `;
    diagramEl.appendChild(row);
  });

  const logEl = document.getElementById('fsm-log');
  const stateNameEl = document.getElementById('fsm-state-name');
  let logCount = 0;

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  function addLog(msg, color = '#64748b') {
    const line = document.createElement('div');
    line.style.color = color;
    line.textContent = `${++logCount}. ${msg}`;
    logEl.prepend(line);
    // 최대 6줄 유지
    while (logEl.children.length > 6) logEl.removeChild(logEl.lastChild);
  }

  function updateHUD() {
    const cur = fsm.current;
    if (!cur) return;

    // 상태 이름 표시
    stateNameEl.textContent = cur.label.toUpperCase();
    stateNameEl.style.color = btnColors[cur.name];

    // 다이어그램 업데이트
    STATE_DEFS.forEach(def => {
      const dot   = document.getElementById(`diag-dot-${def.name}`);
      const arrow = document.getElementById(`diag-arrow-${def.name}`);
      const row   = document.getElementById(`diag-${def.name}`);
      const isCurrent    = def.name === cur.name;
      const isReachable  = cur.transitions.includes(def.name);

      if (isCurrent) {
        dot.textContent = '■';
        dot.style.color = btnColors[def.name];
        row.style.background = `rgba(${hexToRgb(btnColors[def.name])},.1)`;
        arrow.textContent = '← 현재';
        arrow.style.color = btnColors[def.name];
      } else if (isReachable) {
        dot.textContent = '○';
        dot.style.color = btnColors[def.name];
        row.style.background = '';
        arrow.textContent = '→ 가능';
        arrow.style.color = '#334155';
      } else {
        dot.textContent = '·';
        dot.style.color = '#334155';
        row.style.background = '';
        arrow.textContent = '';
      }
    });

    // 버튼 활성/비활성
    btnList.querySelectorAll('button').forEach(btn => {
      const s = btn.dataset.state;
      const reachable = cur.transitions.includes(s);
      btn.style.opacity = reachable ? '1' : '0.3';
      btn.style.cursor  = reachable ? 'pointer' : 'not-allowed';
    });
  }

  function requestTransition(name) {
    const from = fsm.stateName;
    const ok   = fsm.transition(name);
    if (ok) {
      addLog(`${from} → ${name}`, btnColors[name]);
      updateHUD();
    } else {
      addLog(`✗ ${from} → ${name} (불가)`, '#ef4444');
    }
  }

  // ─── 키보드 단축키 ────────────────────────────────────────
  const KEY_MAP = {
    KeyQ: 'idle', KeyW: 'walk', KeyE: 'run',  KeyR: 'jump',
    KeyA: 'attack', KeyS: 'hurt', KeyD: 'dead',
  };
  function onKeyDown(e) {
    const state = KEY_MAP[e.code];
    if (state) requestTransition(state);
  }
  window.addEventListener('keydown', onKeyDown);

  // 초기 HUD 세팅
  updateHUD();
  addLog('idle 시작', btnColors['idle']);

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);
    const prevState = fsm.stateName;

    fsm.update(delta);

    // FSM 내부에서 자동 전이가 일어난 경우 HUD 갱신
    if (fsm.stateName !== prevState) {
      addLog(`${prevState} → ${fsm.stateName} (자동)`, btnColors[fsm.stateName]);
      updateHUD();
    }

    renderer.render(scene, camera);
  }

  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ─── Cleanup ──────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    document.body.removeChild(hud);
    renderer.shadowMap.enabled = false;
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}
