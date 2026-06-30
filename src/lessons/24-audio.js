// ══════════════════════════════════════════════════════════════
//  Module 24: Audio (3D 공간음)
//
//  배울 것:
//    - AudioListener     : 카메라에 붙는 "귀" — 청취자 위치
//    - Audio             : 전역 배경음 (위치 무관)
//    - PositionalAudio   : 3D 공간에서 위치·거리에 따라 감쇠되는 음원
//    - AudioAnalyser     : FFT로 오디오 주파수 분석 → 시각화
//    - Web Audio API     : Three.js Audio는 Web Audio API 래퍼
//
//  3D 공간음 원리:
//    AudioListener → 카메라에 부착 (청취자 = 플레이어 귀)
//    PositionalAudio → 오브젝트에 부착
//    거리가 멀수록 소리가 작아짐 (refDistance, rolloffFactor)
//    좌우 위치에 따라 좌·우 채널 강도 달라짐 (Panning)
//
//  AudioAnalyser:
//    FFT (Fast Fourier Transform): 시간 신호 → 주파수 스펙트럼 변환
//    getFrequencyData() → 각 주파수 대역의 크기(0~255) 반환
//    → 막대그래프 / 파형 시각화에 활용
//
//  ⚠ 브라우저 정책:
//    Web Audio는 사용자 인터랙션(클릭) 전 재생 불가.
//    → 시작 버튼 클릭 후 AudioContext.resume() 호출 필요.
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080c14);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 4, 10);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);

  scene.add(new THREE.AmbientLight(0x112233, 4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  // 바닥
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d1b2a, roughness: 0.9 });
  const floor    = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  scene.add(new THREE.GridHelper(20, 20, 0x1e3a5f, 0x0d1b2a));

  // ─── AudioListener ────────────────────────────────────────
  //  카메라에 부착 → 카메라가 움직이면 청취 위치도 따라감
  const listener = new THREE.AudioListener();
  camera.add(listener);

  // ─── 음원 오브젝트 ────────────────────────────────────────
  const sources = [];
  const analysers = [];

  const sourceConfigs = [
    { pos: [-4, 1, 0], color: 0x6366f1, freq: 220,  label: '220 Hz\nLow' },
    { pos: [ 0, 1, 0], color: 0x10b981, freq: 440,  label: '440 Hz\nMid' },
    { pos: [ 4, 1, 0], color: 0xf43f5e, freq: 880,  label: '880 Hz\nHigh'},
  ];

  sourceConfigs.forEach(({ pos, color, freq, label }) => {
    // 시각적 구체
    const geo  = new THREE.SphereGeometry(0.5, 32, 32);
    const mat  = new THREE.MeshStandardMaterial({
      color, roughness: 0.3, metalness: 0.5,
      emissive: color, emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    scene.add(mesh);

    // PositionalAudio: 이 오브젝트에서 소리가 남
    const sound = new THREE.PositionalAudio(listener);

    // Web Audio API AudioContext로 발진기(Oscillator) 생성
    //  → 외부 파일 없이 순수 JS로 사운드 합성
    const ctx        = listener.context;
    const oscillator = ctx.createOscillator();
    const gainNode   = ctx.createGain();

    oscillator.type      = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.value  = 0; // 초기엔 무음

    oscillator.connect(gainNode);
    // PannerNode를 통해야 공간음(거리 감쇠·패닝)이 적용됨
    // sound.gain에 연결하면 panner를 우회해버려 공간음이 동작하지 않음
    gainNode.connect(sound.panner);

    // PositionalAudio 공간음 파라미터
    sound.setRefDistance(2);      // 이 거리에서 gain=1
    sound.setRolloffFactor(1.5);  // 거리에 따른 감쇠 속도
    sound.setMaxDistance(15);

    mesh.add(sound); // 메시에 부착 → 메시 위치 = 음원 위치

    // AudioAnalyser: 주파수 스펙트럼 분석 (FFT 크기 32)
    const analyser = new THREE.AudioAnalyser(sound, 32);

    // 라벨 Sprite
    const sprite = makeLabel(label);
    sprite.position.set(0, 1.2, 0);
    mesh.add(sprite);

    sources.push({ mesh, sound, oscillator, gainNode, mat, freq, color });
    analysers.push(analyser);
  });

  // ─── 시각화: 주파수 막대 그래프 ──────────────────────────
  //
  //  AudioAnalyser.getFrequencyData() → Uint8Array (0~255)
  //  각 값을 막대 높이로 매핑해 스펙트럼 시각화
  //
  const BAR_COUNT = 16;
  const barMeshes = [];
  const barGeo    = new THREE.BoxGeometry(0.15, 1, 0.15);

  for (let i = 0; i < BAR_COUNT; i++) {
    const mat  = new THREE.MeshBasicMaterial({ color: 0x6366f1 });
    const mesh = new THREE.Mesh(barGeo, mat);
    const x    = -BAR_COUNT * 0.12 + i * 0.24;
    mesh.position.set(x, 0, -4);
    scene.add(mesh);
    barMeshes.push({ mesh, mat });
  }

  // ─── 오디오 파형 라인 ────────────────────────────────────
  const wavePoints  = Array.from({ length: 64 }, (_, i) =>
    new THREE.Vector3(-4 + i * (8 / 63), 3.5, -4)
  );
  const waveGeo     = new THREE.BufferGeometry().setFromPoints(wavePoints);
  const waveMat     = new THREE.LineBasicMaterial({ color: 0x22d3ee });
  const waveLine    = new THREE.Line(waveGeo, waveMat);
  scene.add(waveLine);

  // ─── UI ───────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'audio-ui';
  ui.innerHTML = `
    <div class="info-box" style="pointer-events:auto; min-width:250px;">
      <p><strong>3D 공간음 (Web Audio API)</strong></p>

      <div id="audio-start-box" style="margin:8px 0;padding:10px;border-radius:8px;
        background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);text-align:center;">
        <p style="font-size:11px;color:#94a3b8;margin-bottom:8px">
          브라우저 정책으로 클릭 후 재생 가능
        </p>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button id="audio-start" style="
            padding:7px 20px;border-radius:6px;
            background:#6366f1;border:none;color:#fff;
            cursor:pointer;font-size:13px;font-weight:600;">
            ▶ 시작
          </button>
          <button id="audio-stop" style="
            padding:7px 20px;border-radius:6px;
            background:#334155;border:none;color:#94a3b8;
            cursor:pointer;font-size:13px;font-weight:600;
            opacity:0.4;pointer-events:none;">
            ■ 정지
          </button>
        </div>
      </div>

      <hr style="border-color:#334155;margin:8px 0">

      <p style="color:#64748b;font-size:11px;margin-bottom:6px">음원 제어</p>
      ${sourceConfigs.map((s, i) => `
        <label class="pp-row">
          <span style="color:#${s.color.toString(16).padStart(6,'0')}">${s.freq}Hz</span>
          <input type="range" class="vol-slider" data-idx="${i}"
            min="0" max="1" step="0.05" value="0">
          <span class="vol-val" data-idx="${i}">0.0</span>
        </label>
      `).join('')}

      <hr style="border-color:#334155;margin:8px 0">
      <label class="pp-row">
        <span>파형</span>
        <select id="wave-type" style="flex:1;background:#1e293b;color:#94a3b8;
          border:1px solid #334155;border-radius:4px;padding:2px 4px;font-size:11px;">
          <option value="sine">Sine (부드러움)</option>
          <option value="square">Square (날카로움)</option>
          <option value="sawtooth">Sawtooth (톱니)</option>
          <option value="triangle">Triangle (삼각형)</option>
        </select>
      </label>

      <hr style="border-color:#334155;margin:8px 0">
      <p style="color:#64748b;font-size:11px;line-height:1.7">
        카메라를 구체 쪽으로 이동하면<br>
        해당 소리가 커짐 (거리 감쇠)<br>
        좌우 이동 시 패닝 효과
      </p>
    </div>
  `;
  document.body.appendChild(ui);

  let audioStarted = false;

  const startBtn = document.getElementById('audio-start');
  const stopBtn  = document.getElementById('audio-stop');

  function setPlaying(playing) {
    if (playing) {
      startBtn.style.background = '#22c55e';
      startBtn.textContent = '▶ 재생 중';
      stopBtn.style.opacity = '1';
      stopBtn.style.pointerEvents = 'auto';
      stopBtn.style.background = '#ef4444';
      stopBtn.style.color = '#fff';
    } else {
      startBtn.style.background = '#6366f1';
      startBtn.textContent = '▶ 시작';
      stopBtn.style.opacity = '0.4';
      stopBtn.style.pointerEvents = 'none';
      stopBtn.style.background = '#334155';
      stopBtn.style.color = '#94a3b8';
    }
  }

  startBtn.addEventListener('click', async () => {
    const ctx = listener.context;
    if (ctx.state === 'suspended') await ctx.resume();

    sources.forEach(({ oscillator }) => {
      try { oscillator.start(); } catch (_) {}
    });

    audioStarted = true;
    setPlaying(true);
  });

  stopBtn.addEventListener('click', () => {
    // gain을 0으로 페이드아웃 (즉시 끊으면 클릭 노이즈 발생)
    const now = listener.context.currentTime;
    sources.forEach(({ gainNode }) => {
      gainNode.gain.setTargetAtTime(0, now, 0.05);
    });
    // 슬라이더도 0으로 리셋
    document.querySelectorAll('.vol-slider').forEach(s => { s.value = 0; });
    document.querySelectorAll('.vol-val').forEach(s => { s.textContent = '0.0'; });
    setPlaying(false);
  });

  // 볼륨 슬라이더
  document.querySelectorAll('.vol-slider').forEach(slider => {
    slider.addEventListener('input', e => {
      const i   = parseInt(e.target.dataset.idx);
      const v   = parseFloat(e.target.value);
      document.querySelector(`.vol-val[data-idx="${i}"]`).textContent = v.toFixed(1);
      if (audioStarted) {
        sources[i].gainNode.gain.setTargetAtTime(v * 0.3, listener.context.currentTime, 0.05);
      }
    });
  });

  // 파형 변경
  document.getElementById('wave-type').addEventListener('change', e => {
    sources.forEach(({ oscillator }) => {
      oscillator.type = e.target.value;
    });
  });

  // ─── 애니메이션 루프 ──────────────────────────────────────
  const timer = new Timer();
  let animId;

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const elapsed = timer.getElapsed();

    // 구체 맥동 (볼륨에 반응)
    sources.forEach(({ mesh, mat, gainNode }, i) => {
      const gain = gainNode.gain.value;
      const pulse = 1 + gain * Math.abs(Math.sin(elapsed * sources[i].freq * 0.01)) * 0.3;
      mesh.scale.setScalar(pulse);
      mat.emissiveIntensity = gain * 2;
    });

    // 주파수 막대 업데이트
    if (audioStarted && analysers.length > 0) {
      const data = analysers[1].getFrequencyData(); // 중간 음원 기준
      const step = Math.floor(data.length / BAR_COUNT);
      barMeshes.forEach(({ mesh, mat }, i) => {
        const val  = (data[i * step] || 0) / 255;
        mesh.scale.y = Math.max(0.05, val * 4);
        mesh.position.y = mesh.scale.y * 0.5;
        const c = new THREE.Color().setHSL(0.6 - val * 0.5, 0.8, 0.4 + val * 0.4);
        mat.color.copy(c);
      });

      // 파형 라인
      const timeData = analysers[1].analyser.frequencyBinCount;
      const waveData = new Uint8Array(timeData);
      analysers[1].analyser.getByteTimeDomainData(waveData);
      const posArr = waveGeo.attributes.position.array;
      for (let i = 0; i < 64; i++) {
        const sample = (waveData[Math.floor(i * waveData.length / 64)] / 128 - 1) * 1.5;
        posArr[i * 3 + 1] = 3.5 + sample;
      }
      waveGeo.attributes.position.needsUpdate = true;
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    window.removeEventListener('resize', onResize);
    controls.dispose();
    document.body.removeChild(ui);

    sources.forEach(({ sound, oscillator, gainNode }) => {
      try { oscillator.stop(); } catch (_) {}
      gainNode.disconnect();
      sound.disconnect();
    });
    camera.remove(listener);

    barGeo.dispose();
    barMeshes.forEach(({ mat }) => mat.dispose());
    waveGeo.dispose(); waveMat.dispose();
    floorGeo.dispose(); floorMat.dispose();
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  };
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#94a3b8';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  text.split('\n').forEach((line, i) => ctx.fillText(line, 100, 26 + i * 26));
  const tex    = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(1.5, 0.6, 1);
  return sprite;
}
