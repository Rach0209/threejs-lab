// ══════════════════════════════════════════════════════════════
//  레슨 42: 진짜 P2P 멀티플레이어 (Trystero) + 캐릭터 액션
//
//  📌 다른 브라우저, 다른 컴퓨터에서 들어와도 연결됩니다!
//
//  배울 것:
//    - Trystero       : BitTorrent DHT 기반 진짜 노서버 P2P
//    - selfId         : 각 피어의 고유 ID (Trystero 자동 발급)
//    - makeAction     : action 객체 → .send() / .onMessage = fn
//    - 로비 패턴      : 숨겨진 공용 룸으로 방 목록 공유
//    - 방장 승계      : 남은 피어 중 selfId 정렬 최솟값이 자동 방장
//    - 상태 동기화    : FSM 상태를 move 패킷에 실어 전송
//    - 이벤트 동기화  : 장풍 발사처럼 "순간" 이벤트는 별도 action으로 전송
//
//  조작:
//    WASD   — 이동
//    Space  — 점프
//    F      — 장풍 발사
//    Enter  — 채팅
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Timer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { joinRoom, selfId } from '@trystero-p2p/torrent';

// ─── 상수 ─────────────────────────────────────────────────────
const APP_ID       = 'threejs-lab-42-v1';
const LOBBY_ROOM   = '__lobby__';
const SYNC_MS      = 50;
const ANNOUNCE_MS  = 2000;
const ROOM_TIMEOUT = 6000;
const BUBBLE_SEC   = 4.0;
const JUMP_H       = 2.2;
const JUMP_DUR     = 0.55;
const ATTACK_DUR   = 0.5;
const PROJ_SPEED   = 16;
const PROJ_MAXDIST = 26;

const MY_COLOR = (() => {
  let h = 0;
  for (const c of selfId) h = (h * 31 + c.charCodeAt(0)) & 0xffffff;
  return new THREE.Color().setHSL((Math.abs(h) % 360) / 360, 0.85, 0.6).getHex();
})();

// ─── 유틸 ─────────────────────────────────────────────────────
function hexStr(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

// ─── 이름 태그 Sprite ─────────────────────────────────────────
function makeNameTag(label, colorHex) {
  const cvs = document.createElement('canvas');
  cvs.width = 320; cvs.height = 80;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath(); ctx.roundRect(4, 4, 312, 72, 14); ctx.fill();
  ctx.font = 'bold 32px "Courier New",monospace';
  ctx.fillStyle = hexStr(colorHex);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label.slice(0, 14), 160, 40);
  const tex = new THREE.CanvasTexture(cvs);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 0.45, 1);
  return { sprite, tex, mat };
}

// ─── 말풍선 Sprite ────────────────────────────────────────────
function makeBubble(text, colorHex) {
  const display = text.length > 18 ? text.slice(0, 18) + '…' : text;
  const cvs = document.createElement('canvas');
  cvs.width = 512; cvs.height = 128;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = 'rgba(10,10,20,0.92)';
  ctx.beginPath(); ctx.roundRect(6, 6, 500, 116, 18); ctx.fill();
  ctx.strokeStyle = hexStr(colorHex); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(6, 6, 500, 116, 18); ctx.stroke();
  ctx.font = 'bold 40px "Courier New",monospace';
  ctx.fillStyle = '#f1f5f9';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(display, 256, 62);
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
  body.position.y = 0.78; body.castShadow = true; group.add(body); // [0]
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.3 })
  );
  head.position.y = 1.72; head.castShadow = true; group.add(head); // [1]
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  [-0.12, 0.12].forEach(x => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 1.74, -0.25); group.add(eye); // [2,3]
  });
  scene.add(group);
  return group;
}

// ─── 캐릭터 애니메이션 ────────────────────────────────────────
function applyAnim(group, state, jumpT, attackT) {
  const body = group.children[0];
  if (!body) return;

  if (state === 'jump') {
    const jt = Math.min(jumpT / JUMP_DUR, 1);
    group.position.y = Math.sin(jt * Math.PI) * JUMP_H;
    body.scale.set(1, 1, 1);
    body.rotation.z = 0; body.rotation.x = 0;

  } else if (state === 'attack') {
    const at = Math.min(attackT / ATTACK_DUR, 1);
    // 뒤로 당기다 → 앞으로 밀치다 → 복구 (카메하메하 자세)
    if (at < 0.2) {
      body.rotation.x = -(at / 0.2) * 0.4;       // 뒤로 젖힘
    } else if (at < 0.42) {
      const t = (at - 0.2) / 0.22;
      body.rotation.x = -0.4 + t * 0.7;           // 앞으로 밀치기
    } else {
      const t = (at - 0.42) / 0.58;
      body.rotation.x = 0.3 - t * 0.3;            // 복구
    }
    body.scale.set(1, 1, 1); body.rotation.z = 0;
    group.position.y = THREE.MathUtils.lerp(group.position.y, 0, 0.2);

  } else if (state === 'walk') {
    const wt = performance.now() * 0.007;
    body.rotation.z = Math.sin(wt) * 0.09;
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, 0, 0.2);
    body.scale.set(1, 1, 1);
    group.position.y = Math.abs(Math.sin(wt * 2)) * 0.09;

  } else { // idle
    body.rotation.z *= 0.85;
    body.rotation.x *= 0.85;
    body.scale.x = THREE.MathUtils.lerp(body.scale.x, 1, 0.15);
    body.scale.y = THREE.MathUtils.lerp(body.scale.y, 1, 0.15);
    body.scale.z = THREE.MathUtils.lerp(body.scale.z, 1, 0.15);
    group.position.y = THREE.MathUtils.lerp(group.position.y, 0, 0.2);
  }
}

// ──────────────────────────────────────────────────────────────
export function init(renderer) {

  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f1e);
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 8, 12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.1;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 4; controls.maxDistance = 40;
  controls.enabled = false;

  const timer = new Timer();
  let animId;

  // ─── 내 캐릭터 상태 ───────────────────────────────────────
  let myNick = '';
  let myX = 0, myZ = 0, myRy = 0;
  let myGroup = null, myTagTex = null;
  let myBubble = null;
  const keys = {};

  let charState   = 'idle';
  let jumpTimer   = 0;
  let attackTimer = 0;

  // ─── 장풍 ────────────────────────────────────────────────
  const projectiles = []; // { group, ring1, ring2, glowMat, dir, dist, age }

  function createProjectile(x, z, ry, colorHex) {
    const col   = new THREE.Color(colorHex);
    const white = new THREE.Color(0xffffff);
    const grp   = new THREE.Group();

    // 중심 흰 코어
    grp.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      new THREE.MeshBasicMaterial({ color: white })
    ));
    // 컬러 코어
    grp.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 12, 12),
      new THREE.MeshBasicMaterial({ color: col })
    ));
    // 외부 글로우 (투명)
    const glowMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.35, depthWrite: false,
    });
    grp.add(new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), glowMat));

    // 회전 링 ×2
    const ringGeo = new THREE.TorusGeometry(0.32, 0.045, 6, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    const ring2 = new THREE.Mesh(ringGeo, ringMat.clone());
    ring2.rotation.y = Math.PI / 2;
    grp.add(ring1); grp.add(ring2);

    // 발사 위치: 캐릭터 앞 0.5 유닛, 허리 높이
    grp.position.set(
      x + Math.sin(ry) * 0.5,
      1.0,
      z + Math.cos(ry) * 0.5
    );
    scene.add(grp);

    return {
      group: grp, ring1, ring2, glowMat,
      dir: new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)),
      dist: 0, age: 0,
    };
  }

  function disposeProjectile(p) {
    scene.remove(p.group);
    p.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  // ─── 방 / 네트워크 상태 ───────────────────────────────────
  let lobbyRoom = null, gameRoom = null;
  let _sendRoomInfo = null, _sendMove = null, _sendChat = null, _sendFire = null;
  let announceInterval = null;
  let reAnnounceId    = null;   // 게임룸 내 주기적 재공지 (announce 유실 대비)
  let currentRoomId = null, currentRoomTitle = '';
  let hostId = null;
  let sceneReady = false;
  let txCount = 0, rxCount = 0;
  let _lobbyPruneId = null;

  const remotePlayers = new Map();
  const roomList = new Map();

  // ══════════════════════════════════════════════════════════
  //  DOM: 닉네임 화면
  // ══════════════════════════════════════════════════════════
  const nickScreen = document.createElement('div');
  nickScreen.style.cssText = `
    position:fixed;inset:0;background:rgba(8,10,20,.97);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:18px;z-index:600;font-family:"Courier New",monospace;
  `;
  nickScreen.innerHTML = `
    <div style="color:#e2e8f0;font-size:26px;font-weight:bold;letter-spacing:2px;">🌐 P2P 멀티플레이어</div>
    <div style="color:#475569;font-size:12px;">Trystero — BitTorrent DHT 기반 노서버 P2P</div>
    <div style="height:1px;width:200px;background:#1e293b;"></div>
    <div style="color:#94a3b8;font-size:13px;">닉네임을 설정해주세요</div>
    <input id="nick-input" maxlength="12" placeholder="닉네임 (최대 12자)"
      style="padding:12px 20px;background:#1e293b;border:2px solid #334155;border-radius:10px;
             color:#f1f5f9;font-size:16px;outline:none;width:260px;text-align:center;font-family:inherit;" />
    <button id="nick-btn"
      style="padding:12px 36px;background:#6366f1;border:none;border-radius:10px;
             color:#fff;font-size:15px;cursor:pointer;font-family:inherit;font-weight:bold;">
      로비 입장 →
    </button>
  `;
  document.body.appendChild(nickScreen);

  // ══════════════════════════════════════════════════════════
  //  DOM: 로비 화면
  // ══════════════════════════════════════════════════════════
  const lobbyScreen = document.createElement('div');
  lobbyScreen.style.cssText = `
    position:fixed;inset:0;background:rgba(8,10,20,.96);
    display:none;flex-direction:column;
    z-index:500;font-family:"Courier New",monospace;padding:32px;box-sizing:border-box;
  `;
  lobbyScreen.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div>
        <div style="color:#e2e8f0;font-size:18px;font-weight:bold;">🎮 로비</div>
        <div id="lobby-my-nick" style="color:#6366f1;font-size:12px;margin-top:2px;"></div>
      </div>
      <div style="color:#475569;font-size:11px;">Trystero P2P · 노서버</div>
    </div>
    <div style="display:flex;gap:20px;flex:1;min-height:0;">
      <div style="flex:1;background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:20px;
                  display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div style="color:#94a3b8;font-size:12px;font-weight:bold;">방 목록</div>
          <div style="color:#334155;font-size:11px;">자동 갱신</div>
        </div>
        <div id="room-list-el" style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;"></div>
        <div id="no-rooms-el" style="color:#334155;font-size:13px;text-align:center;margin:auto;">
          아직 방이 없어요<br><br>방을 만들어 친구를 초대하세요!
        </div>
      </div>
      <div style="width:240px;background:#0f172a;border:1px solid #1e293b;border-radius:12px;
                  padding:20px;display:flex;flex-direction:column;gap:12px;">
        <div style="color:#94a3b8;font-size:12px;font-weight:bold;">방 만들기</div>
        <input id="room-title-input" maxlength="20" placeholder="방 제목"
          style="padding:10px 12px;background:#1e293b;border:1px solid #334155;border-radius:8px;
                 color:#f1f5f9;font-size:13px;outline:none;font-family:inherit;" />
        <button id="create-room-btn"
          style="padding:10px;background:#6366f1;border:none;border-radius:8px;
                 color:#fff;font-size:13px;cursor:pointer;font-family:inherit;font-weight:bold;">
          + 방 만들기
        </button>
        <div style="height:1px;background:#1e293b;"></div>
        <div style="color:#334155;font-size:11px;line-height:1.7;">
          방장이 퇴장하면<br>자동으로 승계됩니다.
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(lobbyScreen);

  // ══════════════════════════════════════════════════════════
  //  DOM: 게임 HUD
  // ══════════════════════════════════════════════════════════
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:"Courier New",monospace;display:none;';
  hud.innerHTML = `
    <div style="position:absolute;left:var(--panel-left,280px);top:16px;transition:left .25s ease;
      background:rgba(0,0,0,.75);border:1px solid #334155;border-radius:8px;
      padding:12px 16px;color:#94a3b8;font-size:12px;line-height:2;">
      <div id="hud-room-title" style="color:#e2e8f0;font-weight:bold;margin-bottom:2px;"></div>
      <span style="color:#e2e8f0">WASD</span> — 이동 &nbsp;
      <span style="color:#e2e8f0">Space</span> — 점프<br>
      <span style="color:#e2e8f0">F</span> — 장풍 발사 &nbsp;
      <span style="color:#e2e8f0">Enter</span> — 채팅<br>
      접속 중: <span id="hud-count" style="color:#34d399;">1</span>명
    </div>
    <div style="position:absolute;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
      background:rgba(0,0,0,.75);border:1px solid #334155;border-radius:8px;
      padding:12px 16px;color:#94a3b8;font-size:13px;line-height:1.9;pointer-events:auto;">
      <span id="hud-my-nick" style="font-weight:bold;"></span><br>
      상태: <span id="hud-state" style="color:#fbbf24;">idle</span><br>
      <button id="leave-btn"
        style="margin-top:4px;padding:4px 10px;background:#1e293b;border:1px solid #334155;
               border-radius:6px;color:#94a3b8;font-size:11px;cursor:pointer;font-family:inherit;">
        ← 로비로
      </button>
    </div>
    <div style="position:absolute;right:20px;top:16px;
      background:rgba(0,0,0,.75);border:1px solid #334155;border-radius:8px;
      padding:12px 16px;color:#94a3b8;font-size:13px;line-height:1.9;">
      <div style="color:#e2e8f0;font-weight:bold;margin-bottom:4px;">P2P 네트워크</div>
      TX <span id="hud-tx" style="color:#6366f1;">0</span> msg/s<br>
      RX <span id="hud-rx" style="color:#10b981;">0</span> msg/s
    </div>
    <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:20px;
      background:rgba(0,0,0,.78);border:1px solid #334155;border-radius:8px;
      padding:10px 14px;width:320px;pointer-events:auto;">
      <div style="color:#94a3b8;font-size:11px;font-weight:bold;margin-bottom:6px;">
        채팅 <span style="color:#334155;">· Enter로 입력</span>
      </div>
      <div id="hud-chat" style="display:flex;flex-direction:column;gap:4px;
        font-size:12px;max-height:180px;overflow-y:auto;"></div>
    </div>
  `;
  document.body.appendChild(hud);

  let chatOpen = false;
  const chatInput = document.createElement('input');
  chatInput.type = 'text'; chatInput.maxLength = 40;
  chatInput.placeholder = 'Enter 전송  /  Esc 취소';
  chatInput.style.cssText = `
    position:fixed;bottom:70px;left:50%;transform:translateX(-50%);
    width:380px;display:none;
    background:rgba(8,10,20,.93);border:2px solid #6366f1;border-radius:10px;
    padding:10px 16px;color:#f1f5f9;font-family:"Courier New",monospace;font-size:14px;
    outline:none;z-index:1000;
  `;
  chatInput.addEventListener('keydown', e => {
    e.stopImmediatePropagation();
    if (e.code === 'Enter' && !e.isComposing) {
      sendChat(chatInput.value.trim());
      chatInput.style.display = 'none'; chatInput.blur(); chatOpen = false;
    }
    if (e.code === 'Escape') {
      chatInput.style.display = 'none'; chatInput.blur(); chatOpen = false;
    }
  });
  document.body.appendChild(chatInput);

  // ══════════════════════════════════════════════════════════
  //  닉네임 화면 이벤트
  // ══════════════════════════════════════════════════════════
  const nickInput = nickScreen.querySelector('#nick-input');
  const nickBtn   = nickScreen.querySelector('#nick-btn');

  function onEnterLobby() {
    const nick = nickInput.value.trim();
    if (!nick) { nickInput.style.borderColor = '#ef4444'; nickInput.focus(); return; }
    myNick = nick;
    nickScreen.style.display = 'none';
    lobbyScreen.style.display = 'flex';
    lobbyScreen.querySelector('#lobby-my-nick').textContent = `닉네임: ${myNick}`;
    enterLobby();
  }

  nickBtn.addEventListener('click', onEnterLobby);
  nickInput.addEventListener('keydown', e => { if (e.code === 'Enter') onEnterLobby(); });
  nickInput.addEventListener('focus',   () => { nickInput.style.borderColor = '#6366f1'; });

  // ══════════════════════════════════════════════════════════
  //  로비 입장
  // ══════════════════════════════════════════════════════════
  function enterLobby() {
    if (lobbyRoom) return;
    lobbyRoom = joinRoom({ appId: APP_ID }, LOBBY_ROOM);
    const roomAction = lobbyRoom.makeAction('room');
    _sendRoomInfo = (data) => roomAction.send(data);

    // 새 피어가 로비에 연결되면 즉시 현재 방 정보를 1:1 전송
    // (setInterval 대기 없이 바로 방 목록에 반영됨)
    lobbyRoom.onPeerJoin = (peerId) => {
      if (!announceInterval || !currentRoomId) return;
      roomAction.send(
        { roomId: currentRoomId, title: currentRoomTitle,
          creatorNick: myNick, count: remotePlayers.size + 1, hostId: selfId },
        { target: peerId }
      );
    };

    roomAction.onMessage = data => {
      roomList.set(data.roomId, { ...data, lastSeen: Date.now() });
      renderRoomList();
    };
    _lobbyPruneId = setInterval(() => {
      const now = Date.now(); let changed = false;
      for (const [id, r] of roomList) {
        if (now - r.lastSeen > ROOM_TIMEOUT) { roomList.delete(id); changed = true; }
      }
      if (changed) renderRoomList();
    }, 3000);
  }

  // ══════════════════════════════════════════════════════════
  //  방 목록 렌더링
  // ══════════════════════════════════════════════════════════
  function renderRoomList() {
    const listEl  = lobbyScreen.querySelector('#room-list-el');
    const noRooms = lobbyScreen.querySelector('#no-rooms-el');
    listEl.innerHTML = '';
    if (roomList.size === 0) { noRooms.style.display = 'block'; return; }
    noRooms.style.display = 'none';
    for (const [roomId, r] of roomList) {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:12px;
        background:#1e293b;border-radius:8px;padding:12px 14px;`;
      row.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div style="color:#e2e8f0;font-weight:bold;font-size:14px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.title}</div>
          <div style="color:#475569;font-size:11px;margin-top:2px;">
            개설자: ${r.creatorNick} · ${r.count}명
          </div>
        </div>
        <button style="padding:6px 14px;background:#0ea5e9;border:none;border-radius:6px;
          color:#fff;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0;">입장</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        enterGameRoom(roomId, r.title, r.hostId);
      });
      listEl.appendChild(row);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  방 만들기
  // ══════════════════════════════════════════════════════════
  lobbyScreen.querySelector('#create-room-btn').addEventListener('click', () => {
    const title  = lobbyScreen.querySelector('#room-title-input').value.trim() || `${myNick}의 방`;
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    currentRoomId = roomId; currentRoomTitle = title; hostId = selfId;
    startAnnouncing(title, myNick);
    enterGameRoom(roomId, title, selfId);
  });

  // ══════════════════════════════════════════════════════════
  //  로비에 방 정보 공지
  // ══════════════════════════════════════════════════════════
  function startAnnouncing(title, creatorNick) {
    stopAnnouncing();
    const broadcast = () => {
      if (!_sendRoomInfo) return;
      _sendRoomInfo({ roomId: currentRoomId, title, creatorNick,
                      count: remotePlayers.size + 1, hostId: selfId });
    };
    broadcast();
    announceInterval = setInterval(broadcast, ANNOUNCE_MS);
  }
  function stopAnnouncing() {
    if (announceInterval) { clearInterval(announceInterval); announceInterval = null; }
  }

  // ══════════════════════════════════════════════════════════
  //  게임룸 입장
  // ══════════════════════════════════════════════════════════
  function enterGameRoom(roomId, title, _hostId) {
    lobbyScreen.style.display = 'none';
    hud.style.display = 'block';
    hud.querySelector('#hud-room-title').textContent = `🏠 ${title}`;
    hud.querySelector('#hud-my-nick').textContent    = myNick;
    controls.enabled = true;
    currentRoomId = roomId; currentRoomTitle = title; hostId = _hostId;
    if (!sceneReady) initScene();

    gameRoom = joinRoom({ appId: APP_ID }, roomId);

    const announceAction = gameRoom.makeAction('announce');
    const moveAction     = gameRoom.makeAction('move');
    const chatAction     = gameRoom.makeAction('chat');
    const fireAction     = gameRoom.makeAction('fire');     // 장풍 발사 이벤트
    const hostTakeAction = gameRoom.makeAction('hostTake');

    _sendMove = (data) => moveAction.send(data);
    _sendChat = (data) => chatAction.send(data);
    _sendFire = (data) => fireAction.send(data);

    // 연결 초기에 announce가 유실될 수 있어 주기적으로 재공지
    // 이미 아는 피어는 addRemote 내부에서 중복 무시됨
    if (reAnnounceId) clearInterval(reAnnounceId);
    reAnnounceId = setInterval(() => {
      announceAction.send({ nick: myNick, color: MY_COLOR, x: myX, z: myZ, state: charState });
    }, 4000);

    gameRoom.onPeerJoin = peerId => {
      announceAction.send(
        { nick: myNick, color: MY_COLOR, x: myX, z: myZ, state: charState },
        { target: peerId }
      );
    };

    gameRoom.onPeerLeave = peerId => {
      removeRemote(peerId);
      if (peerId === hostId) checkHostSuccession(hostTakeAction);
    };

    announceAction.onMessage = (data, peerId) => {
      addRemote(peerId, data.nick, data.color, data.x, data.z, data.state);
    };

    moveAction.onMessage = (data, peerId) => {
      const p = remotePlayers.get(peerId);
      if (!p) return;
      p.targetX = data.x; p.targetZ = data.z; p.targetRy = data.ry;
      if (data.state !== p.state) {
        if (data.state === 'jump' && p.state !== 'jump') p.jumpTimer = 0;
        if (data.state !== 'attack') p.attackTimer = 0;
        p.state = data.state;
      }
      rxCount++;
    };

    // 장풍 발사: 이벤트 수신 즉시 그 위치/방향으로 장풍 생성
    fireAction.onMessage = (data) => {
      projectiles.push(createProjectile(data.x, data.z, data.ry, data.color));
      rxCount++;
    };

    chatAction.onMessage = (data, peerId) => {
      const p = remotePlayers.get(peerId);
      if (p) p.bubble = showBubble(p.group, p.bubble, data.text, p.colorHex);
      addChatLog(data.nick, data.color, data.text);
      rxCount++;
    };

    hostTakeAction.onMessage = data => {
      hostId = data.hostId;
      addChatLog(null, null, `👑 ${data.nick} 님이 방장이 되었습니다`);
    };
  }

  // ══════════════════════════════════════════════════════════
  //  방장 승계
  // ══════════════════════════════════════════════════════════
  function checkHostSuccession(hostTakeAction) {
    const allIds = [...Object.keys(gameRoom.getPeers()), selfId].sort();
    if (allIds[0] !== selfId) return;
    hostId = selfId;
    startAnnouncing(currentRoomTitle, myNick);
    hostTakeAction.send({ hostId: selfId, nick: myNick });
    addChatLog(null, null, `👑 방장이 되었습니다`);
  }

  // ══════════════════════════════════════════════════════════
  //  로비로 돌아가기
  // ══════════════════════════════════════════════════════════
  hud.querySelector('#leave-btn').addEventListener('click', leaveGame);

  function leaveGame() {
    stopAnnouncing();
    if (reAnnounceId) { clearInterval(reAnnounceId); reAnnounceId = null; }
    if (gameRoom) { gameRoom.leave(); gameRoom = null; }
    _sendMove = null; _sendChat = null; _sendFire = null;
    removeAllRemotes();
    for (const p of projectiles) disposeProjectile(p);
    projectiles.length = 0;
    myX = 0; myZ = 0; myRy = 0; charState = 'idle';
    if (myGroup) myGroup.position.set(0, 0, 0);
    controls.enabled = false;
    hud.style.display = 'none';
    chatInput.style.display = 'none';
    roomList.clear(); renderRoomList();
    lobbyScreen.style.display = 'flex';
  }

  // ══════════════════════════════════════════════════════════
  //  원격 플레이어 관리
  // ══════════════════════════════════════════════════════════
  function addRemote(peerId, nick, colorHex, x, z, state = 'idle') {
    if (peerId === selfId || remotePlayers.has(peerId)) return;
    const group = makePlayerMesh(colorHex, scene);
    group.position.set(x ?? 0, 0, z ?? 0);
    const { sprite, tex } = makeNameTag(nick, colorHex);
    sprite.position.y = 2.4; group.add(sprite);
    remotePlayers.set(peerId, {
      group, tex, nick, colorHex,
      targetX: x ?? 0, targetZ: z ?? 0, targetRy: 0,
      state, jumpTimer: 0, attackTimer: 0, bubble: null,
    });
    updateHudCount();
    addChatLog(null, null, `🟢 ${nick} 입장`);
  }

  function removeRemote(peerId) {
    const p = remotePlayers.get(peerId);
    if (!p) return;
    if (p.bubble) { p.bubble.tex.dispose(); p.bubble.mat.dispose(); }
    scene.remove(p.group);
    p.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    p.tex.dispose();
    remotePlayers.delete(peerId);
    updateHudCount();
    addChatLog(null, null, `🔴 ${p.nick} 퇴장`);
  }

  function removeAllRemotes() { for (const [id] of remotePlayers) removeRemote(id); }
  function updateHudCount() {
    const el = hud.querySelector('#hud-count');
    if (el) el.textContent = 1 + remotePlayers.size;
  }

  // ══════════════════════════════════════════════════════════
  //  말풍선 / 채팅 로그
  // ══════════════════════════════════════════════════════════
  function showBubble(group, existing, text, colorHex) {
    if (existing) { group.remove(existing.sprite); existing.tex.dispose(); existing.mat.dispose(); }
    const b = makeBubble(text, colorHex);
    b.sprite.position.y = 3.2; group.add(b.sprite);
    return b;
  }

  function addChatLog(nick, colorHex, text) {
    const el = hud.querySelector('#hud-chat');
    if (!el) return;
    const line = document.createElement('div');
    line.style.cssText = 'display:flex;gap:6px;align-items:baseline;word-break:break-all;';
    if (nick) {
      const sp = document.createElement('span');
      sp.textContent = nick;
      sp.style.cssText = `color:${hexStr(colorHex)};font-weight:bold;flex-shrink:0;font-size:11px;`;
      line.appendChild(sp);
    }
    const txt = document.createElement('span');
    txt.textContent = text; txt.style.color = nick ? '#cbd5e1' : '#475569';
    line.appendChild(txt);
    el.appendChild(line);
    while (el.children.length > 30) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  function sendChat(text) {
    if (!text || !_sendChat) return;
    _sendChat({ nick: myNick, color: MY_COLOR, text });
    myBubble = showBubble(myGroup, myBubble, text, MY_COLOR);
    addChatLog(myNick, MY_COLOR, text);
    txCount++;
  }

  // ══════════════════════════════════════════════════════════
  //  키 입력
  // ══════════════════════════════════════════════════════════
  const onKeyDown = e => {
    if (hud.style.display === 'none') return;
    if (chatOpen) return;
    if (e.code === 'Enter') {
      chatOpen = true;
      chatInput.style.display = 'block'; chatInput.value = ''; chatInput.focus(); return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (charState !== 'jump' && charState !== 'attack') {
        charState = 'jump'; jumpTimer = 0;
      }
      return;
    }
    if (e.code === 'KeyF') {
      if (charState !== 'jump' && charState !== 'attack') {
        charState = 'attack'; attackTimer = 0;
        // 장풍 발사 (즉시)
        projectiles.push(createProjectile(myX, myZ, myRy, MY_COLOR));
        if (_sendFire) { _sendFire({ x: myX, z: myZ, ry: myRy, color: MY_COLOR }); txCount++; }
      }
      return;
    }
    keys[e.code] = true;
  };
  const onKeyUp = e => { keys[e.code] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  // ══════════════════════════════════════════════════════════
  //  Three.js 씬 초기화
  // ══════════════════════════════════════════════════════════
  let _floorTex = null;

  function initScene() {
    sceneReady = true;
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 30, 60);

    scene.add(new THREE.AmbientLight(0x334155, 4));
    const sun = new THREE.DirectionalLight(0xfff5e0, 3);
    sun.position.set(15, 30, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
    sun.shadow.camera.right = sun.shadow.camera.top   =  30;
    scene.add(sun);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const fc = document.createElement('canvas'); fc.width = fc.height = 128;
    const fctx = fc.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      fctx.fillStyle = (i + j) % 2 === 0 ? '#1e293b' : '#162032';
      fctx.fillRect(i * 16, j * 16, 16, 16);
    }
    _floorTex = new THREE.CanvasTexture(fc);
    _floorTex.wrapS = _floorTex.wrapT = THREE.RepeatWrapping;
    _floorTex.repeat.set(10, 10);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ map: _floorTex, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(40, 0.1, 40)),
      new THREE.LineBasicMaterial({ color: 0x334155 })
    );
    border.position.y = 0.05; scene.add(border);

    [[8,8],[8,-8],[-8,8],[-8,-8],[14,0],[0,14],[-14,0],[0,-14]].forEach(([x,z]) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x5c3d1e }));
      trunk.position.set(x, 0.8, z); trunk.castShadow = true; scene.add(trunk);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 7),
        new THREE.MeshStandardMaterial({ color: 0x2d5a1e }));
      leaf.position.set(x, 2.7, z); leaf.castShadow = true; scene.add(leaf);
    });

    myGroup = makePlayerMesh(MY_COLOR, scene);
    const nameTag = makeNameTag(`${myNick} ★`, MY_COLOR);
    myTagTex = nameTag.tex;
    nameTag.sprite.position.y = 2.4;
    myGroup.add(nameTag.sprite);
  }

  // ══════════════════════════════════════════════════════════
  //  애니메이션 루프
  // ══════════════════════════════════════════════════════════
  const _fwd = new THREE.Vector3();
  const _rgt = new THREE.Vector3();
  const _mov = new THREE.Vector3();
  const _tgt = new THREE.Vector3();
  let syncTimer = 0, statTimer = 0;
  const elState = hud.querySelector('#hud-state');

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);

    if (sceneReady && hud.style.display !== 'none') {
      // ─── 이동 입력 ──────────────────────────────────────
      const camYaw = Math.atan2(
        camera.position.x - controls.target.x,
        camera.position.z - controls.target.z
      );
      _fwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      _rgt.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
      _mov.set(0, 0, 0);
      if (keys['KeyW'] || keys['ArrowUp'])    _mov.addScaledVector(_fwd,  1);
      if (keys['KeyS'] || keys['ArrowDown'])  _mov.addScaledVector(_fwd, -1);
      if (keys['KeyA'] || keys['ArrowLeft'])  _mov.addScaledVector(_rgt, -1);
      if (keys['KeyD'] || keys['ArrowRight']) _mov.addScaledVector(_rgt,  1);
      const moving = _mov.lengthSq() > 0;

      if (moving) {
        _mov.normalize();
        myX += _mov.x * 6 * delta;
        myZ += _mov.z * 6 * delta;
        myRy = Math.atan2(_mov.x, _mov.z);
      }
      myX = Math.max(-19, Math.min(19, myX));
      myZ = Math.max(-19, Math.min(19, myZ));
      if (myGroup) { myGroup.position.x = myX; myGroup.position.z = myZ; myGroup.rotation.y = myRy + Math.PI; }
      controls.target.lerp(_tgt.set(myX, 1, myZ), 0.05);

      // ─── FSM ─────────────────────────────────────────────
      if (charState === 'jump') {
        jumpTimer += delta;
        if (jumpTimer >= JUMP_DUR) {
          jumpTimer = 0; charState = moving ? 'walk' : 'idle';
          if (myGroup) myGroup.position.y = 0;
        }
      } else if (charState === 'attack') {
        attackTimer += delta;
        if (attackTimer >= ATTACK_DUR) {
          attackTimer = 0;
          if (myGroup) myGroup.children[0].rotation.x = 0;
          charState = moving ? 'walk' : 'idle';
        }
      } else {
        charState = moving ? 'walk' : 'idle';
      }

      if (myGroup) applyAnim(myGroup, charState, jumpTimer, attackTimer);
      if (elState) elState.textContent = charState;

      // ─── 위치 + 상태 전송 ────────────────────────────────
      syncTimer += delta * 1000;
      if (syncTimer >= SYNC_MS && _sendMove) {
        syncTimer -= SYNC_MS;
        _sendMove({ x: myX, z: myZ, ry: myRy + Math.PI, state: charState });
        txCount++;
      }

      // ─── 원격 플레이어 보간 + 애니메이션 ────────────────
      for (const [, p] of remotePlayers) {
        p.group.position.x = THREE.MathUtils.lerp(p.group.position.x, p.targetX, 0.15);
        p.group.position.z = THREE.MathUtils.lerp(p.group.position.z, p.targetZ, 0.15);
        let rd = p.targetRy - p.group.rotation.y;
        if (rd >  Math.PI) rd -= Math.PI * 2;
        if (rd < -Math.PI) rd += Math.PI * 2;
        p.group.rotation.y += rd * 0.15;

        if (p.state === 'jump')   p.jumpTimer   = Math.min((p.jumpTimer   || 0) + delta, JUMP_DUR);
        else                       p.jumpTimer   = 0;
        if (p.state === 'attack') p.attackTimer = Math.min((p.attackTimer || 0) + delta, ATTACK_DUR);
        else                       p.attackTimer = 0;
        applyAnim(p.group, p.state, p.jumpTimer, p.attackTimer);

        if (p.bubble) {
          p.bubble.timer -= delta;
          if (p.bubble.timer <= 0) {
            p.group.remove(p.bubble.sprite);
            p.bubble.tex.dispose(); p.bubble.mat.dispose(); p.bubble = null;
          } else if (p.bubble.timer < 1) p.bubble.mat.opacity = p.bubble.timer;
        }
      }

      // ─── 내 말풍선 ───────────────────────────────────────
      if (myBubble) {
        myBubble.timer -= delta;
        if (myBubble.timer <= 0) {
          myGroup.remove(myBubble.sprite);
          myBubble.tex.dispose(); myBubble.mat.dispose(); myBubble = null;
        } else if (myBubble.timer < 1) myBubble.mat.opacity = myBubble.timer;
      }

      // ─── 장풍 업데이트 ───────────────────────────────────
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.age   += delta;
        p.dist  += PROJ_SPEED * delta;
        p.group.position.x += p.dir.x * PROJ_SPEED * delta;
        p.group.position.z += p.dir.z * PROJ_SPEED * delta;

        // 링 회전
        p.ring1.rotation.z += delta * 11;
        p.ring2.rotation.x += delta * 7;

        // 글로우 펄스
        p.glowMat.opacity = 0.28 + Math.sin(p.age * 22) * 0.12;

        // 거리 끝 부분에서 축소 페이드
        if (p.dist > PROJ_MAXDIST * 0.72) {
          const fade = 1 - (p.dist - PROJ_MAXDIST * 0.72) / (PROJ_MAXDIST * 0.28);
          p.group.scale.setScalar(Math.max(0, fade));
        }

        if (p.dist >= PROJ_MAXDIST) {
          disposeProjectile(p);
          projectiles.splice(i, 1);
        }
      }

      // ─── 통계 HUD ────────────────────────────────────────
      statTimer += delta;
      if (statTimer >= 1) {
        const tx = hud.querySelector('#hud-tx');
        const rx = hud.querySelector('#hud-rx');
        if (tx) tx.textContent = txCount;
        if (rx) rx.textContent = rxCount;
        txCount = 0; rxCount = 0; statTimer = 0;
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // ══════════════════════════════════════════════════════════
  //  Cleanup
  // ══════════════════════════════════════════════════════════
  return function cleanup() {
    cancelAnimationFrame(animId);
    timer.dispose();
    stopAnnouncing();
    if (reAnnounceId)  { clearInterval(reAnnounceId);  reAnnounceId = null; }
    if (_lobbyPruneId) clearInterval(_lobbyPruneId);
    if (gameRoom)  gameRoom.leave();
    if (lobbyRoom) lobbyRoom.leave();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup',   onKeyUp);
    window.removeEventListener('resize',  onResize);
    controls.dispose();
    document.body.removeChild(nickScreen);
    document.body.removeChild(lobbyScreen);
    document.body.removeChild(hud);
    document.body.removeChild(chatInput);
    renderer.shadowMap.enabled = false;
    if (myTagTex)  myTagTex.dispose();
    if (_floorTex) _floorTex.dispose();
    if (myBubble) { myBubble.tex.dispose(); myBubble.mat.dispose(); }
    for (const p of projectiles) disposeProjectile(p);
    projectiles.length = 0;
    removeAllRemotes();
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
