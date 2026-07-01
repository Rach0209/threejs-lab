// ══════════════════════════════════════════════════════════════
//  레슨 41: 멀티플레이어 기초 (채팅 포함)
//
//  📌 새 탭에서 이 레슨을 한 번 더 열면 바로 멀티플레이어 체험!
//     한쪽에서 WASD로 이동하면 다른 탭에 실시간 반영됩니다.
//
//  배울 것:
//    - 메시지 프로토콜  : { type, id, ...payload } 구조 설계
//    - 위치 동기화      : 20Hz 주기로 상태 전송 (50ms 인터벌)
//    - 보간 (Lerp)      : 패킷 사이 끊김 없는 이동 처리
//    - 입장/퇴장 핸드셰이크: join → announce → leave
//    - 채팅 메시지      : type:'chat', 말풍선 Sprite + 채팅 로그
//    - 이름 태그        : CanvasTexture Sprite로 플레이어 ID 표시
//    - 타임아웃 처리    : 일정 시간 응답 없으면 플레이어 제거
//
//  BroadcastChannel vs WebSocket:
//    BroadcastChannel — 같은 브라우저의 탭들만 통신, 서버 불필요
//    WebSocket        — 서버를 통해 전 세계 클라이언트와 통신
//    메시지 구조·이벤트 패턴은 동일 → 이 레슨에서 개념을 완전히 이해!
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CHANNEL_NAME = 'threejs-lab-mp-41';
const SYNC_MS      = 50;
const TIMEOUT_MS   = 3000;
const BUBBLE_SEC   = 4.0; // 말풍선 표시 시간

// ─── 유틸 ─────────────────────────────────────────────────────
function genId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}
function idToColor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffffff;
  return new THREE.Color().setHSL((Math.abs(h) % 360) / 360, 0.85, 0.6).getHex();
}

// ─── 이름 태그 Sprite ─────────────────────────────────────────
function makeNameTag(label, colorHex) {
  const cvs = document.createElement('canvas');
  cvs.width = 256; cvs.height = 72;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 248, 64, 14);
  ctx.fill();
  ctx.font = 'bold 30px "Courier New",monospace';
  ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 36);
  const tex = new THREE.CanvasTexture(cvs);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.45, 1);
  return { sprite, tex, mat };
}

// ─── 말풍선 Sprite ────────────────────────────────────────────
function makeBubble(text, colorHex) {
  const maxLen = 18;
  const display = text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  const cvs = document.createElement('canvas');
  cvs.width = 512; cvs.height = 128;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = 'rgba(10,10,20,0.92)';
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 104, 18);
  ctx.fill();
  ctx.strokeStyle = '#' + colorHex.toString(16).padStart(6, '0');
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 104, 18);
  ctx.stroke();
  ctx.font = 'bold 38px "Courier New",monospace';
  ctx.fillStyle = '#f1f5f9';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(display, 256, 58);
  const tex = new THREE.CanvasTexture(cvs);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.8, 1);
  return { sprite, tex, mat, timer: BUBBLE_SEC };
}

// ─── 플레이어 메시 ────────────────────────────────────────────
function makePlayerMesh(colorHex, scene) {
  const color = new THREE.Color(colorHex);
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 0.8, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
  );
  body.position.y = 0.78;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.3 })
  );
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  [-0.12, 0.12].forEach(x => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 1.74, -0.25);
    group.add(eye);
  });
  scene.add(group);
  return group;
}

// ──────────────────────────────────────────────────────────────
export function init(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);
  scene.fog = new THREE.Fog(0x0f172a, 30, 60);

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 8, 12);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 4;
  controls.maxDistance = 40;

  // ─── 조명 ────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x334155, 4));
  const sun = new THREE.DirectionalLight(0xfff5e0, 3);
  sun.position.set(15, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
  sun.shadow.camera.right = sun.shadow.camera.top   =  30;
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFShadowMap;

  // ─── 바닥 ────────────────────────────────────────────────
  const floorCvs = document.createElement('canvas');
  floorCvs.width = floorCvs.height = 128;
  const fctx = floorCvs.getContext('2d');
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    fctx.fillStyle = (i + j) % 2 === 0 ? '#1e293b' : '#162032';
    fctx.fillRect(i * 16, j * 16, 16, 16);
  }
  const floorTex = new THREE.CanvasTexture(floorCvs);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(10, 10);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(40, 0.1, 40)),
    new THREE.LineBasicMaterial({ color: 0x334155 })
  );
  border.position.y = 0.05;
  scene.add(border);

  [[8,8],[8,-8],[-8,8],[-8,-8],[14,0],[0,14],[-14,0],[0,-14]].forEach(([x,z]) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 1.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x5c3d1e })
    );
    trunk.position.set(x, 0.8, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 2.2, 7),
      new THREE.MeshStandardMaterial({ color: 0x2d5a1e })
    );
    leaf.position.set(x, 2.7, z);
    leaf.castShadow = true;
    scene.add(leaf);
  });

  // ─── 내 플레이어 ─────────────────────────────────────────
  const MY_ID    = genId();
  const MY_COLOR = idToColor(MY_ID);

  const myGroup = makePlayerMesh(MY_COLOR, scene);
  const { sprite: myTag, tex: myTagTex } = makeNameTag(`${MY_ID} (나)`, MY_COLOR);
  myTag.position.y = 2.4;
  myGroup.add(myTag);

  let myX = 0, myZ = 0, myRy = 0;
  let myBubble = null; // 현재 내 말풍선

  const keys = {};
  const SPEED = 6;

  // ─── 말풍선 표시 ─────────────────────────────────────────
  function showBubble(group, existing, text, colorHex, yPos = 3.2) {
    if (existing) {
      group.remove(existing.sprite);
      existing.tex.dispose();
      existing.mat.dispose();
    }
    const b = makeBubble(text, colorHex);
    b.sprite.position.y = yPos;
    group.add(b.sprite);
    return b;
  }

  // ─── 원격 플레이어 ───────────────────────────────────────
  // id → { group, tex, targetX, targetZ, targetRy, lastSeen, bubble }
  const remotePlayers = new Map();

  function addRemote(id, colorHex, x, z) {
    if (id === MY_ID || remotePlayers.has(id)) return;
    const group = makePlayerMesh(colorHex, scene);
    group.position.set(x, 0, z);
    const { sprite, tex } = makeNameTag(id, colorHex);
    sprite.position.y = 2.4;
    group.add(sprite);
    remotePlayers.set(id, {
      group, tex, colorHex,
      targetX: x, targetZ: z, targetRy: 0,
      lastSeen: performance.now(),
      bubble: null,
    });
    updatePlayerCount();
    addChatLog(null, null, `🟢 ${id} 입장`);
  }

  function removeRemote(id) {
    const p = remotePlayers.get(id);
    if (!p) return;
    if (p.bubble) { p.bubble.tex.dispose(); p.bubble.mat.dispose(); }
    scene.remove(p.group);
    p.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    p.tex.dispose();
    remotePlayers.delete(id);
    updatePlayerCount();
    addChatLog(null, null, `🔴 ${id} 퇴장`);
  }

  function updateRemote(id, x, z, ry) {
    const p = remotePlayers.get(id);
    if (!p) return;
    p.targetX = x; p.targetZ = z; p.targetRy = ry;
    p.lastSeen = performance.now();
  }

  // ─── BroadcastChannel ────────────────────────────────────
  const channel = new BroadcastChannel(CHANNEL_NAME);
  let txCount = 0, rxCount = 0, statTimer = 0;

  channel.onmessage = ({ data: msg }) => {
    if (msg.id === MY_ID) return;
    rxCount++;
    switch (msg.type) {
      case 'join':
        addRemote(msg.id, msg.color, msg.x ?? 0, msg.z ?? 0);
        channel.postMessage({ type: 'announce', id: MY_ID, color: MY_COLOR, x: myX, z: myZ });
        break;
      case 'announce':
        addRemote(msg.id, msg.color, msg.x ?? 0, msg.z ?? 0);
        break;
      case 'move':
        updateRemote(msg.id, msg.x, msg.z, msg.ry);
        break;
      case 'chat': {
        const p = remotePlayers.get(msg.id);
        if (p) p.bubble = showBubble(p.group, p.bubble, msg.text, p.colorHex);
        addChatLog(msg.id, msg.color, msg.text);
        break;
      }
      case 'leave':
        removeRemote(msg.id);
        break;
    }
  };

  const onUnload = () => channel.postMessage({ type: 'leave', id: MY_ID });
  window.addEventListener('beforeunload', onUnload);
  channel.postMessage({ type: 'join', id: MY_ID, color: MY_COLOR, x: myX, z: myZ });

  // ─── 채팅 전송 ───────────────────────────────────────────
  function sendChat(text) {
    if (!text) return;
    channel.postMessage({ type: 'chat', id: MY_ID, color: MY_COLOR, text });
    myBubble = showBubble(myGroup, myBubble, text, MY_COLOR);
    addChatLog(MY_ID, MY_COLOR, text);
    txCount++;
  }

  // ─── 채팅 입력창 DOM ────────────────────────────────────
  let chatOpen = false;
  const chatInput = document.createElement('input');
  chatInput.type = 'text';
  chatInput.maxLength = 40;
  chatInput.placeholder = 'Enter 전송 / Esc 취소';
  chatInput.style.cssText = `
    position:fixed;bottom:70px;left:50%;transform:translateX(-50%);
    width:clamp(300px,30vw,560px);display:none;
    background:rgba(10,10,20,.92);
    border:2px solid #6366f1;border-radius:10px;
    padding:10px 16px;
    color:#f1f5f9;font-family:"Courier New",monospace;font-size:14px;
    outline:none;z-index:1000;
  `;
  chatInput.addEventListener('keydown', e => {
    e.stopImmediatePropagation();
    if (e.code === 'Enter' && !e.isComposing) {
      sendChat(chatInput.value.trim());
      chatInput.style.display = 'none';
      chatInput.blur();
      chatOpen = false;
    }
    if (e.code === 'Escape') {
      chatInput.style.display = 'none';
      chatInput.blur();
      chatOpen = false;
    }
  });
  document.body.appendChild(chatInput);

  // ─── 키 입력 ─────────────────────────────────────────────
  const onKeyDown = e => {
    if (chatOpen) return;
    if (e.code === 'Enter') {
      chatOpen = true;
      chatInput.style.display = 'block';
      chatInput.value = '';
      chatInput.focus();
      return;
    }
    keys[e.code] = true;
  };
  const onKeyUp = e => { keys[e.code] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  // ─── HUD ─────────────────────────────────────────────────
  const hud = document.createElement('div');
  hud.id = 'mp-hud';
  hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:"Courier New",monospace;';
  hud.innerHTML = `
    <!-- 조작 안내 -->
    <div style="
      position:absolute;left:var(--panel-left,280px);top:16px;
      transition:left .25s ease;
      background:rgba(0,0,0,.7);border:1px solid #334155;
      border-radius:8px;padding:12px 16px;
      color:#94a3b8;font-size:12px;line-height:1.9;
    ">
      <div style="color:#e2e8f0;font-weight:bold;margin-bottom:6px;">멀티플레이어</div>
      <span style="color:#fbbf24">📌 새 탭에서 이 레슨을 다시 열면<br>&nbsp;&nbsp;&nbsp;멀티플레이어 체험!</span><br><br>
      <span style="color:#e2e8f0">WASD</span> — 이동<br>
      <span style="color:#e2e8f0">Enter</span> — 채팅 입력<br>
      <span style="color:#94a3b8">드래그</span> — 카메라 회전
    </div>

    <!-- 내 정보 -->
    <div style="
      position:absolute;left:var(--panel-left,280px);bottom:20px;
      transition:left .25s ease;
      background:rgba(0,0,0,.7);border:1px solid #334155;
      border-radius:8px;padding:12px 16px;
      color:#94a3b8;font-size:13px;line-height:1.9;
    ">
      ID: <span style="color:#${MY_COLOR.toString(16).padStart(6,'0')};font-weight:bold;">${MY_ID}</span><br>
      접속자: <span id="mp-count" style="color:#34d399">1</span>명
    </div>

    <!-- 네트워크 통계 -->
    <div style="
      position:absolute;right:20px;top:16px;
      background:rgba(0,0,0,.7);border:1px solid #334155;
      border-radius:8px;padding:12px 16px;
      color:#94a3b8;font-size:13px;line-height:1.9;
    ">
      <div style="color:#e2e8f0;font-weight:bold;margin-bottom:4px;">네트워크</div>
      TX <span id="mp-tx" style="color:#6366f1">0</span> msg/s<br>
      RX <span id="mp-rx" style="color:#10b981">0</span> msg/s<br>
      주기 <span style="color:#fbbf24">${SYNC_MS}ms</span>
    </div>

    <!-- 채팅 로그 -->
    <div style="
      position:absolute;left:50%;transform:translateX(-50%);bottom:20px;
      background:rgba(0,0,0,.75);border:1px solid #334155;
      border-radius:8px;padding:10px 14px;width:clamp(300px,30vw,560px);
      pointer-events:auto;
    ">
      <div style="color:#94a3b8;font-size:11px;font-weight:bold;margin-bottom:6px;">채팅 · Enter로 입력</div>
      <div id="mp-chat" style="
        display:flex;flex-direction:column;gap:4px;
        font-size:12px;max-height:180px;overflow-y:auto;
      "></div>
    </div>
  `;
  document.body.appendChild(hud);

  const elCount  = document.getElementById('mp-count');
  const elTx     = document.getElementById('mp-tx');
  const elRx     = document.getElementById('mp-rx');
  const elChat   = document.getElementById('mp-chat');

  function updatePlayerCount() {
    elCount.textContent = 1 + remotePlayers.size;
  }

  function addChatLog(id, colorHex, text) {
    const line = document.createElement('div');
    line.style.cssText = 'display:flex;gap:6px;align-items:baseline;word-break:break-all;';
    if (id) {
      const idSpan = document.createElement('span');
      idSpan.textContent = id;
      idSpan.style.cssText = `color:#${colorHex.toString(16).padStart(6,'0')};font-weight:bold;flex-shrink:0;font-size:11px;`;
      line.appendChild(idSpan);
    }
    const txtSpan = document.createElement('span');
    txtSpan.textContent = text;
    txtSpan.style.color = id ? '#cbd5e1' : '#475569';
    line.appendChild(txtSpan);
    elChat.appendChild(line);
    while (elChat.children.length > 30) elChat.removeChild(elChat.firstChild);
    elChat.scrollTop = elChat.scrollHeight;
  }

  // ─── 애니메이션 루프 ─────────────────────────────────────
  const timer = new Timer();
  let animId, syncTimer = 0;
  const _forward = new THREE.Vector3();
  const _right   = new THREE.Vector3();
  const _move    = new THREE.Vector3();
  const _target  = new THREE.Vector3();

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);

    // 이동
    const camYaw = Math.atan2(
      camera.position.x - controls.target.x,
      camera.position.z - controls.target.z
    );
    _forward.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    _right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    _move.set(0, 0, 0);

    if (keys['KeyW'] || keys['ArrowUp'])    _move.addScaledVector(_forward,  1);
    if (keys['KeyS'] || keys['ArrowDown'])  _move.addScaledVector(_forward, -1);
    if (keys['KeyA'] || keys['ArrowLeft'])  _move.addScaledVector(_right,   -1);
    if (keys['KeyD'] || keys['ArrowRight']) _move.addScaledVector(_right,    1);

    if (_move.lengthSq() > 0) {
      _move.normalize();
      myX += _move.x * SPEED * delta;
      myZ += _move.z * SPEED * delta;
      myRy = Math.atan2(_move.x, _move.z);
      myGroup.children[0].rotation.z = Math.sin(performance.now() * 0.008) * 0.08;
    } else {
      myGroup.children[0].rotation.z *= 0.8;
    }
    myX = Math.max(-19, Math.min(19, myX));
    myZ = Math.max(-19, Math.min(19, myZ));
    myGroup.position.set(myX, 0, myZ);
    myGroup.rotation.y = myRy + Math.PI;
    controls.target.lerp(_target.set(myX, 1, myZ), 0.05);

    // 위치 전송
    syncTimer += delta * 1000;
    if (syncTimer >= SYNC_MS) {
      syncTimer -= SYNC_MS;
      channel.postMessage({ type: 'move', id: MY_ID, x: myX, z: myZ, ry: myRy + Math.PI });
      txCount++;
    }

    // 원격 플레이어 보간 + 타임아웃 + 말풍선 페이드
    const now = performance.now();
    for (const [id, p] of remotePlayers) {
      p.group.position.x = THREE.MathUtils.lerp(p.group.position.x, p.targetX, 0.15);
      p.group.position.z = THREE.MathUtils.lerp(p.group.position.z, p.targetZ, 0.15);
      let rDiff = p.targetRy - p.group.rotation.y;
      if (rDiff >  Math.PI) rDiff -= Math.PI * 2;
      if (rDiff < -Math.PI) rDiff += Math.PI * 2;
      p.group.rotation.y += rDiff * 0.15;
      if (now - p.lastSeen > TIMEOUT_MS) removeRemote(id);

      // 원격 말풍선 페이드
      if (p.bubble) {
        p.bubble.timer -= delta;
        if (p.bubble.timer <= 0) {
          p.group.remove(p.bubble.sprite);
          p.bubble.tex.dispose(); p.bubble.mat.dispose();
          p.bubble = null;
        } else if (p.bubble.timer < 1.0) {
          p.bubble.mat.opacity = p.bubble.timer;
        }
      }
    }

    // 내 말풍선 페이드
    if (myBubble) {
      myBubble.timer -= delta;
      if (myBubble.timer <= 0) {
        myGroup.remove(myBubble.sprite);
        myBubble.tex.dispose(); myBubble.mat.dispose();
        myBubble = null;
      } else if (myBubble.timer < 1.0) {
        myBubble.mat.opacity = myBubble.timer;
      }
    }

    // 통계
    statTimer += delta;
    if (statTimer >= 1) {
      elTx.textContent = txCount; elRx.textContent = rxCount;
      txCount = 0; rxCount = 0; statTimer = 0;
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

  // ─── Cleanup ─────────────────────────────────────────────
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    channel.postMessage({ type: 'leave', id: MY_ID });
    channel.close();
    window.removeEventListener('beforeunload', onUnload);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup',   onKeyUp);
    window.removeEventListener('resize',  onResize);
    controls.dispose();
    document.body.removeChild(hud);
    document.body.removeChild(chatInput);
    renderer.shadowMap.enabled = false;
    myTagTex.dispose();
    floorTex.dispose();
    if (myBubble) { myBubble.tex.dispose(); myBubble.mat.dispose(); }
    for (const [id] of remotePlayers) removeRemote(id);
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
