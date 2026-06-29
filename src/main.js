// ══════════════════════════════════════════════════════════════
//  main.js — 진입점
//
//  역할:
//    1. Three.js Renderer 생성 (모든 레슨이 공유)
//    2. 왼쪽 레슨 네비게이터 UI 생성
//    3. 오른쪽 소스 코드 패널 생성
//    4. 레슨 전환 로직 (cleanup → init → 소스 패널 갱신)
// ══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { createNav, LESSONS } from './ui/nav.js';
import { createCodePanel } from './ui/codePanel.js';
import './style.css';

// ─── Renderer (전역 공유) ──────────────────────────────────────
//  렌더러는 레슨마다 새로 만들면 비효율적이므로 한 번만 만들고 공유합니다.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// ─── UI 생성 ──────────────────────────────────────────────────
const { setActive } = createNav(loadLesson);
const { loadSource } = createCodePanel();

// ─── 현재 레슨의 cleanup 함수 보관 ────────────────────────────
let currentCleanup = null;

// ─── 레슨 전환 함수 ────────────────────────────────────────────
async function loadLesson(lesson) {
  // 이전 레슨 정리
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  // 왼쪽 메뉴 활성화 표시
  setActive(lesson.id);

  // 3D 씬 로드
  const module = await lesson.file();
  currentCleanup = module.init(renderer);

  // 소스 코드 패널 갱신 (패널 열림/닫힘 상태는 건드리지 않음)
  if (lesson.fileKey) {
    loadSource(lesson.fileKey, `${lesson.id}-${lesson.fileKey}.js`);
  }
}

// ─── 앱 시작: 첫 번째 레슨 자동 로드 ─────────────────────────
loadLesson(LESSONS[0]);
