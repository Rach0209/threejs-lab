// ══════════════════════════════════════════════════════════════
//  레슨 42: 진짜 P2P 멀티플레이어 (Trystero)
//
//  📌 다른 브라우저, 다른 컴퓨터에서 들어와도 연결됩니다!
//     (같은 방 이름을 고르면 됩니다)
//
//  배울 것:
//    - Trystero       : BitTorrent DHT 기반 진짜 노서버 P2P
//    - selfId         : 각 피어의 고유 ID (Trystero 자동 발급)
//    - makeAction     : 타입별 send/receive 쌍 생성
//    - 로비 패턴      : 숨겨진 공용 룸으로 방 목록 공유
//    - 방장 승계      : 남은 피어 중 selfId 정렬 최솟값이 자동 방장
//    - P2P vs 서버    : 완전 노서버, 서버리스 배포(GitHub Pages)와 완벽 호환
//
//  레슨 41(BroadcastChannel)과 비교:
//    - 채널 생성  : new BroadcastChannel(name)  → joinRoom({appId}, name)
//    - 메시지 전송: channel.postMessage(data)    → sendXxx(data)
//    - 메시지 수신: channel.onmessage            → onXxx((data, peerId) => {})
//    - 입장/퇴장  : 수동 join/leave 메시지      → onPeerJoin / onPeerLeave 이벤트
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
const ROOM_TIMEOUT = 6000; // 이 시간 동안 공지 없으면 방 목록에서 제거
const BUBBLE_SEC   = 4.0;
const MY_COLOR     = (() => {
  let h = 0;
  for (const c of selfId) h = (h * 31 + c.charCodeAt(0)) & 0xffffff;
  return new THREE.Color().setHSL((Math.abs(h) % 360) / 360, 0.85, 0.6).getHex();
})();

// ─── 유틸 ─────────────────────────────────────────────────────
function hexColorStr(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}
function colorFromId(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffffff;
  return new THREE.Color().setHSL((Math.abs(h) % 360) / 360, 0.85, 0.6).getHex();
}

// ─── 이름 태그 Sprite ─────────────────────────────────────────
function makeNameTag(label, colorHex) {
  const cvs = document.createElement('canvas');
  cvs.width = 320; cvs.height = 80;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath(); ctx.roundRect(4, 4, 312, 72, 14); ctx.fill();
  ctx.font = 'bold 32px "Courier New",monospace';
  ctx.fillStyle = hexColorStr(colorHex);
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
  ctx.strokeStyle = hexColorStr(colorHex);
  ctx.lineWidth = 4;
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
  body.position.y = 0.78; body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.3 })
  );
  head.position.y = 1.72; head.castShadow = true; group.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  [-0.12, 0.12].forEach(x => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 1.74, -0.25); group.add(eye);
  });
  scene.add(group);
  return group;
}

// ──────────────────────────────────────────────────────────────
export function init(renderer) {

  // ─── Three.js 씬 (항상 렌더링, 게임룸 전엔 빈 배경) ──────
  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f1e);
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 8, 12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.1;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 4; controls.maxDistance = 40;
  controls.enabled = false; // 로비에선 비활성

  const timer = new Timer();
  let animId;

  // ─── 게임 상태 ────────────────────────────────────────────
  let myNick  = '';
  let myX = 0, myZ = 0, myRy = 0;
  let myGroup = null, myTagTex = null;
  let myBubble = null;
  const keys = {};

  // ─── 방 / 네트워크 상태 ──────────────────────────────────
  let lobbyRoom        = null;
  let gameRoom         = null;
  let _sendRoomInfo    = null; // 로비에 방 정보 공지용
  let _sendMove        = null;
  let _sendChat        = null;
  let announceInterval = null;
  let currentRoomId    = null;
  let currentRoomTitle = '';
  let hostId           = null; // 현재 방의 방장 selfId
  let sceneReady       = false;
  let txCount = 0, rxCount = 0;

  const remotePlayers = new Map(); // peerId → { group, nick, colorHex, ... }
  const roomList      = new Map(); // roomId → { title, creatorNick, count, hostId, lastSeen }

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
             color:#f1f5f9;font-size:16px;outline:none;width:260px;text-align:center;
             font-family:inherit;transition:border-color .2s;" />
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
      <!-- 방 목록 -->
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
      <!-- 방 만들기 -->
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
          만든 방은 로비에<br>2초마다 공지됩니다.<br><br>
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
    <!-- 방 정보 + 조작 안내 -->
    <div style="position:absolute;left:var(--panel-left,280px);top:16px;transition:left .25s ease;
      background:rgba(0,0,0,.75);border:1px solid #334155;border-radius:8px;
      padding:12px 16px;color:#94a3b8;font-size:12px;line-height:1.9;">
      <div id="hud-room-title" style="color:#e2e8f0;font-weight:bold;margin-bottom:4px;"></div>
      <span style="color:#e2e8f0">WASD</span> — 이동<br>
      <span style="color:#e2e8f0">Enter</span> — 채팅<br>
      접속 중: <span id="hud-count" style="color:#34d399;">1</span>명
    </div>
    <!-- 내 정보 + 로비 버튼 -->
    <div style="position:absolute;left:var(--panel-left,280px);bottom:20px;transition:left .25s ease;
      background:rgba(0,0,0,.75);border:1px solid #334155;border-radius:8px;
      padding:12px 16px;color:#94a3b8;font-size:13px;line-height:1.9;pointer-events:auto;">
      <span id="hud-my-nick" style="font-weight:bold;"></span><br>
      <button id="leave-btn"
        style="margin-top:6px;padding:4px 10px;background:#1e293b;border:1px solid #334155;
               border-radius:6px;color:#94a3b8;font-size:11px;cursor:pointer;font-family:inherit;">
        ← 로비로
      </button>
    </div>
    <!-- 네트워크 통계 -->
    <div style="position:absolute;right:20px;top:16px;
      background:rgba(0,0,0,.75);border:1px solid #334155;border-radius:8px;
      padding:12px 16px;color:#94a3b8;font-size:13px;line-height:1.9;">
      <div style="color:#e2e8f0;font-weight:bold;margin-bottom:4px;">P2P 네트워크</div>
      TX <span id="hud-tx" style="color:#6366f1;">0</span> msg/s<br>
      RX <span id="hud-rx" style="color:#10b981;">0</span> msg/s<br>
      <span style="color:#334155;font-size:11px;">주기 ${SYNC_MS}ms</span>
    </div>
    <!-- 채팅 로그 -->
    <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:20px;
      background:rgba(0,0,0,.78);border:1px solid #334155;border-radius:8px;
      padding:10px 14px;width:320px;">
      <div style="color:#94a3b8;font-size:11px;font-weight:bold;margin-bottom:6px;">
        채팅 <span style="color:#334155;">· Enter로 입력</span>
      </div>
      <div id="hud-chat" style="display:flex;flex-direction:column;gap:4px;
        font-size:12px;max-height:160px;overflow:hidden;"></div>
    </div>
  `;
  document.body.appendChild(hud);

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
    roomAction.onMessage = data => {
      roomList.set(data.roomId, { ...data, lastSeen: Date.now() });
      renderRoomList();
    };

    // 오래된 방 정기 정리
    const pruneId = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, r] of roomList) {
        if (now - r.lastSeen > ROOM_TIMEOUT) { roomList.delete(id); changed = true; }
      }
      if (changed) renderRoomList();
    }, 3000);

    // cleanup에서 정리할 수 있도록 저장
    _lobbyPruneId = pruneId;
  }

  let _lobbyPruneId = null;

  // ══════════════════════════════════════════════════════════
  //  방 목록 렌더링
  // ══════════════════════════════════════════════════════════
  function renderRoomList() {
    const listEl   = lobbyScreen.querySelector('#room-list-el');
    const noRooms  = lobbyScreen.querySelector('#no-rooms-el');
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
        <button data-rid="${roomId}"
          style="padding:6px 14px;background:#0ea5e9;border:none;border-radius:6px;
                 color:#fff;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0;">
          입장
        </button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        enterGameRoom(roomId, r.title, r.hostId, false);
      });
      listEl.appendChild(row);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  방 만들기
  // ══════════════════════════════════════════════════════════
  lobbyScreen.querySelector('#create-room-btn').addEventListener('click', () => {
    const title = lobbyScreen.querySelector('#room-title-input').value.trim()
                  || `${myNick}의 방`;
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    currentRoomId    = roomId;
    currentRoomTitle = title;
    hostId           = selfId;
    startAnnouncing(title, myNick);
    enterGameRoom(roomId, title, selfId, true);
  });

  // ══════════════════════════════════════════════════════════
  //  로비에 방 정보 공지 (호스트만)
  // ══════════════════════════════════════════════════════════
  function startAnnouncing(title, creatorNick) {
    stopAnnouncing();
    const broadcast = () => {
      if (!_sendRoomInfo) return;
      _sendRoomInfo({
        roomId: currentRoomId, title, creatorNick,
        count: remotePlayers.size + 1, hostId: selfId,
      });
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
  function enterGameRoom(roomId, title, _hostId, asHost) {
    lobbyScreen.style.display = 'none';
    hud.style.display = 'block';
    hud.querySelector('#hud-room-title').textContent = `🏠 ${title}`;
    hud.querySelector('#hud-my-nick').textContent    = myNick;
    controls.enabled = true;

    currentRoomId    = roomId;
    currentRoomTitle = title;
    hostId           = _hostId;

    if (!sceneReady) initScene();

    gameRoom = joinRoom({ appId: APP_ID }, roomId);

    const announceAction  = gameRoom.makeAction('announce');
    const moveAction      = gameRoom.makeAction('move');
    const chatAction      = gameRoom.makeAction('chat');
    const hostTakeAction  = gameRoom.makeAction('hostTake'); // 방장 승계 알림

    _sendMove = (data) => moveAction.send(data);
    _sendChat = (data) => chatAction.send(data);

    // 새 피어 접속 → 내 현재 상태 전송
    gameRoom.onPeerJoin = peerId => {
      announceAction.send({ nick: myNick, color: MY_COLOR, x: myX, z: myZ }, { target: peerId });
    };

    // 피어 퇴장
    gameRoom.onPeerLeave = peerId => {
      removeRemote(peerId);
      if (peerId === hostId) checkHostSuccession(hostTakeAction);
    };

    // 입장 시 내 정보 수신 (다른 플레이어가 보내준 것)
    announceAction.onMessage = (data, peerId) => {
      addRemote(peerId, data.nick, data.color, data.x, data.z);
    };

    // 이동 수신
    moveAction.onMessage = (data, peerId) => {
      const p = remotePlayers.get(peerId);
      if (!p) return;
      p.targetX = data.x; p.targetZ = data.z; p.targetRy = data.ry;
      rxCount++;
    };

    // 채팅 수신
    chatAction.onMessage = (data, peerId) => {
      const p = remotePlayers.get(peerId);
      if (p) p.bubble = showBubble(p.group, p.bubble, data.text, p.colorHex);
      addChatLog(data.nick, data.color, data.text);
      rxCount++;
    };

    // 방장 승계 알림 수신 (새 방장이 선언)
    hostTakeAction.onMessage = data => {
      hostId = data.hostId;
      addChatLog(null, null, `👑 ${data.nick} 님이 방장이 되었습니다`);
    };
  }

  // ══════════════════════════════════════════════════════════
  //  방장 승계
  //  퇴장한 피어가 방장이면, 남은 피어(+ 나) 중 selfId 정렬 최솟값이 새 방장
  //  → 모든 피어가 독립적으로 같은 결론에 도달 (결정적 알고리즘)
  // ══════════════════════════════════════════════════════════
  function checkHostSuccession(hostTakeAction) {
    const allIds = [...Object.keys(gameRoom.getPeers()), selfId].sort();
    if (allIds[0] !== selfId) return; // 내가 최솟값이 아니면 아무것도 안 함
    // 내가 새 방장
    hostId = selfId;
    startAnnouncing(currentRoomTitle, myNick);
    hostTakeAction.send({ hostId: selfId, nick: myNick }); // 다른 피어에게 알림
    addChatLog(null, null, `👑 방장이 되었습니다`);
  }

  // ══════════════════════════════════════════════════════════
  //  로비로 돌아가기
  // ══════════════════════════════════════════════════════════
  hud.querySelector('#leave-btn').addEventListener('click', leaveGame);

  function leaveGame() {
    stopAnnouncing();
    if (gameRoom) { gameRoom.leave(); gameRoom = null; }
    _sendMove = null; _sendChat = null;
    removeAllRemotes();
    myX = 0; myZ = 0; myRy = 0;
    if (myGroup) myGroup.position.set(0, 0, 0);
    controls.enabled = false;
    hud.style.display = 'none';
    chatInput.style.display = 'none';
    roomList.clear();
    renderRoomList();
    lobbyScreen.style.display = 'flex';
  }

  // ══════════════════════════════════════════════════════════
  //  원격 플레이어 관리
  // ══════════════════════════════════════════════════════════
  function addRemote(peerId, nick, colorHex, x, z) {
    if (peerId === selfId || remotePlayers.has(peerId)) return;
    const group = makePlayerMesh(colorHex, scene);
    group.position.set(x ?? 0, 0, z ?? 0);
    const { sprite, tex } = makeNameTag(nick, colorHex);
    sprite.position.y = 2.4; group.add(sprite);
    remotePlayers.set(peerId, {
      group, tex, nick, colorHex,
      targetX: x ?? 0, targetZ: z ?? 0, targetRy: 0,
      bubble: null,
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

  function removeAllRemotes() {
    for (const [id] of remotePlayers) removeRemote(id);
  }

  function updateHudCount() {
    const el = hud.querySelector('#hud-count');
    if (el) el.textContent = 1 + remotePlayers.size;
  }

  // ══════════════════════════════════════════════════════════
  //  말풍선 / 채팅 로그
  // ══════════════════════════════════════════════════════════
  function showBubble(group, existing, text, colorHex) {
    if (existing) {
      group.remove(existing.sprite);
      existing.tex.dispose(); existing.mat.dispose();
    }
    const b = makeBubble(text, colorHex);
    b.sprite.position.y = 3.2;
    group.add(b.sprite);
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
      sp.style.cssText = `color:${hexColorStr(colorHex)};font-weight:bold;flex-shrink:0;font-size:11px;`;
      line.appendChild(sp);
    }
    const txt = document.createElement('span');
    txt.textContent = text;
    txt.style.color = nick ? '#cbd5e1' : '#475569';
    line.appendChild(txt);
    el.prepend(line);
    while (el.children.length > 12) el.removeChild(el.lastChild);
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
    if (hud.style.display === 'none') return; // 게임룸에서만
    if (document.activeElement === chatInput) return;
    if (e.code === 'Enter') {
      chatInput.style.display = 'block';
      chatInput.value = ''; chatInput.focus();
      return;
    }
    keys[e.code] = true;
  };
  const onKeyUp = e => { keys[e.code] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  chatInput.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.code === 'Enter')  { sendChat(chatInput.value.trim()); chatInput.style.display = 'none'; chatInput.blur(); }
    if (e.code === 'Escape') { chatInput.style.display = 'none'; chatInput.blur(); }
  });

  // ══════════════════════════════════════════════════════════
  //  Three.js 씬 초기화 (게임룸 첫 입장 시 한 번만)
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
    border.position.y = 0.05;
    scene.add(border);

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

  function animate() {
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);

    if (sceneReady && hud.style.display !== 'none') {
      // 이동
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

      if (_mov.lengthSq() > 0) {
        _mov.normalize();
        myX += _mov.x * 6 * delta;
        myZ += _mov.z * 6 * delta;
        myRy = Math.atan2(_mov.x, _mov.z);
        myGroup.children[0].rotation.z = Math.sin(performance.now() * 0.008) * 0.08;
      } else {
        if (myGroup) myGroup.children[0].rotation.z *= 0.8;
      }
      myX = Math.max(-19, Math.min(19, myX));
      myZ = Math.max(-19, Math.min(19, myZ));
      if (myGroup) {
        myGroup.position.set(myX, 0, myZ);
        myGroup.rotation.y = myRy + Math.PI;
      }
      controls.target.lerp(_tgt.set(myX, 1, myZ), 0.05);

      // 위치 전송
      syncTimer += delta * 1000;
      if (syncTimer >= SYNC_MS && _sendMove) {
        syncTimer -= SYNC_MS;
        _sendMove({ x: myX, z: myZ, ry: myRy + Math.PI });
        txCount++;
      }

      // 원격 플레이어 보간 + 말풍선
      for (const [, p] of remotePlayers) {
        p.group.position.x = THREE.MathUtils.lerp(p.group.position.x, p.targetX, 0.15);
        p.group.position.z = THREE.MathUtils.lerp(p.group.position.z, p.targetZ, 0.15);
        let rd = p.targetRy - p.group.rotation.y;
        if (rd >  Math.PI) rd -= Math.PI * 2;
        if (rd < -Math.PI) rd += Math.PI * 2;
        p.group.rotation.y += rd * 0.15;
        if (p.bubble) {
          p.bubble.timer -= delta;
          if (p.bubble.timer <= 0) {
            p.group.remove(p.bubble.sprite);
            p.bubble.tex.dispose(); p.bubble.mat.dispose(); p.bubble = null;
          } else if (p.bubble.timer < 1) p.bubble.mat.opacity = p.bubble.timer;
        }
      }

      // 내 말풍선
      if (myBubble) {
        myBubble.timer -= delta;
        if (myBubble.timer <= 0) {
          myGroup.remove(myBubble.sprite);
          myBubble.tex.dispose(); myBubble.mat.dispose(); myBubble = null;
        } else if (myBubble.timer < 1) myBubble.mat.opacity = myBubble.timer;
      }

      // 통계 HUD
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
    if (myTagTex) myTagTex.dispose();
    if (_floorTex) _floorTex.dispose();
    if (myBubble) { myBubble.tex.dispose(); myBubble.mat.dispose(); }
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
