# CLAUDE.md — threejs-lab

## 프로젝트 개요
Three.js + Vanilla JavaScript 기반 3D 그래픽스 학습 도구.
각 레슨은 독립 모듈로, 인터랙티브하게 3D 개념을 체험할 수 있다.

## 기술 스택
- Three.js r185 (WebGL 추상화)
- cannon-es (물리 엔진)
- highlight.js (소스 코드 구문 강조)
- Vite (번들러, base: '/threejs-lab/')
- Vanilla JavaScript (TypeScript 미사용)

## 브랜치 전략
- `main` — 안정 소스. 여기 push 시 GitHub Actions가 자동 빌드 → gh-pages 배포
- `dev` — 개발 브랜치. 새 레슨·기능 작업 후 main으로 merge
- `gh-pages` — 빌드 결과물 전용 (Actions 자동 관리, 직접 수정 금지)

## 배포
- GitHub Pages: https://rach0209.github.io/threejs-lab/
- 배포 트리거: main 브랜치 push
- 워크플로우: .github/workflows/deploy.yml
- 방식: 공식 GitHub Actions Pages 배포 (actions/configure-pages → upload-pages-artifact → deploy-pages)
  - peaceiris/actions-gh-pages 방식 아님 (Pages build_type이 workflow로 설정되어 있어 브랜치 push 방식 동작 안 함)

## 디렉토리 구조
```
src/
  main.js          # 진입점: Renderer 생성, 레슨 전환 로직
  style.css        # 전역 스타일
  ui/
    nav.js         # 왼쪽 레슨 네비게이터 (LESSONS 배열 포함)
    codePanel.js   # 오른쪽 소스 코드 패널 (highlight.js)
  lessons/
    01-geometry.js
    02-materials.js
    03-lights.js
    04-solar-system.js
    05-textures.js
    06-interaction.js
    07-model-loader.js
    08-shaders.js
    09-physics.js
    10-particles.js
    11-math-viz.js
```

## 레슨 구조 규칙
- 각 레슨은 `export function init(renderer)` 하나만 export
- `init()`은 cleanup 함수를 반환해야 함
- cleanup: geometry/material/texture `.dispose()`, 이벤트 리스너 제거, `cancelAnimationFrame`
- `THREE.Clock` 대신 `import { Timer } from 'three'` 사용 (r168+ 권장)
- `THREE.PCFSoftShadowMap` 대신 `THREE.PCFShadowMap` 사용 (r185 deprecated)

## 코드 스타일
- Vanilla JS (TypeScript 미사용)
- 주석은 한국어, 학습 목적이므로 상세하게
- 코드 블록 구분: `// ─── 섹션명 ────` 패턴

## nav.js LESSONS 배열 규칙
각 레슨 항목에는 반드시 `fileKey` 필드 포함 (소스 패널 연동용):
```js
{ id: '01', title: '...', desc: '...', fileKey: '01-geometry', file: () => import(...) }
```
