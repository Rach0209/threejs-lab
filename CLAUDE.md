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
- `main` — 안정 소스. push 시 GitHub Actions가 자동 빌드 → GitHub Pages 배포
- `dev` — 개발 브랜치. 모든 작업은 여기서 커밋. 로컬 확인 후 사용자 승인 받고 main merge
- ~~`gh-pages`~~ — 삭제됨. 공식 Actions 배포 방식으로 전환해 불필요

## 작업 규칙 (Claude 준수 사항)
1. 모든 작업은 `dev` 브랜치에서 커밋
2. 로컬 동작·버그 확인 후 사용자에게 main 배포 승인을 받고 push
3. 변경사항이 테스트 완료되어 main에 배포됐을 때 CLAUDE.md와 memory 업데이트

## 배포
- GitHub Pages: https://rach0209.github.io/threejs-lab/
- 배포 트리거: `main` 브랜치 push
- 워크플로우: `.github/workflows/deploy.yml`
- 방식: 공식 GitHub Actions Pages 배포
  - `actions/configure-pages` → `actions/upload-pages-artifact` → `actions/deploy-pages`
  - peaceiris 브랜치 push 방식 아님 (Pages build_type: workflow 설정과 충돌)
- Node.js 버전: 24 (runner 기준)
- Node.js 20 deprecated 경고: 액션 패키지 내부 번들 문제로 우리가 고칠 수 없음, 무시해도 됨

## 디렉토리 구조
```
src/
  main.js          # 진입점: Renderer 생성, 레슨 전환 로직
  style.css        # 전역 스타일 (highlight.js 테마 @import 포함)
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

## 코드 패널 (codePanel.js) 주의사항
- highlight.js CSS는 `codePanel.js`에서 import하지 않고 `style.css` 상단 `@import`로 관리
  - JS에서 import하면 Vite 빌드 시 style.css보다 나중에 주입돼 cascade 충돌 발생
- 하이라이팅은 `hljs.highlight()` 대신 `hljs.highlightElement()` 사용
  - `highlight()`는 innerHTML만 교체하고 `<code>`에 `.hljs` 클래스를 붙이지 않음
  - `.hljs` 클래스가 없으면 atom-one-dark 테마의 기본 텍스트 색상이 적용되지 않아 검정으로 보임
- 패널 너비: 기본 480px, 드래그 리사이즈로 최대 50vw까지 조절 가능

## nav.js LESSONS 배열 규칙
각 레슨 항목에는 반드시 `fileKey` 필드 포함 (소스 패널 연동용):
```js
{ id: '01', title: '...', desc: '...', fileKey: '01-geometry', file: () => import(...) }
```
