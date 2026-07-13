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
    01-geometry.js       ~ 11-math-viz.js   # 기초 레슨
    12-postprocessing.js ~ 29-decal.js       # 중급 레슨
    30-fog.js            ~ 40-pathfinding.js # 고급 레슨
    41-multiplayer.js                        # WebRTC 멀티플레이어 기초 (Trystero)
    42-p2p-multiplayer.js                    # P2P 멀티플레이어 심화 (로비/방/FSM/장풍)
    43-raymarching.js                        # Raymarching/SDF 입문 (도형6종, 불리언연산, Smooth Union)
    44-sdf-noise.js                          # SDF 절차적 텍스처 (Hash/ValueNoise/FBM, 대리석/용암/행성)
    45-sdf-animation.js                      # SDF 애니메이션 (도메인반복/Twist/Wave/Bend, 메타볼)
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

## Trystero (@trystero-p2p/torrent) API 주의사항 (레슨 41~42)
- `action.onMessage` 핸들러 두 번째 인자는 `{ peerId }` 객체 — **반드시 구조분해**
  ```js
  action.onMessage = (data, { peerId }) => { ... }  // ✅
  action.onMessage = (data, peerId) => { ... }       // ❌ peerId가 object됨
  ```
- `action.send(data, { target: peerId })` — 특정 피어 전송 (options 객체)
- `action.send(data)` — 전체 브로드캐스트
- `room.onPeerJoin = handler` — setter 설정 즉시 기존 연결 피어에 대해 동기 호출됨
- `room.onPeerJoin` / `room.onPeerLeave` 콜백은 string peerId 그대로 받음 (action과 다름)

## 레슨 조작/정보 패널 위치 규칙 (중요)
- 좌측 하단에 뜨는 레슨 조작 패널(`#xxx-ui`)은 `left: var(--panel-left, 280px);`을 사용해야 함
  - 하드코딩된 `left: 280px`을 쓰면 안 됨 — 왼쪽 nav 패널이 접혔을 때 같이 안 따라옴
  - `--panel-left`는 `nav.js`가 nav 패널 펼침/접힘에 따라 `body`에 동적으로 설정 (펼침 280px / 접힘 64px)
  - 인라인 스타일로 패널을 만드는 레슨(예: 38)도 동일하게 `left:var(--panel-left, 280px)` + `transition:left .25s ease` 적용

## 레슨 내 풀스크린 오버레이 규칙 (중요)
- 레슨에서 풀스크린 오버레이(닉네임 입력, 로비 등)를 만들 때 **`inset:0` 금지**
  - nav 패널(z-index:700)과 toggle(z-index:701)이 항상 위에 떠 있어 content가 가려짐
  - 대신: `top:0; right:0; bottom:0; left:var(--panel-left,280px); transition:left .25s ease;`
- 레슨에서 홈(레슨01)으로 돌아갈 때는 아래 커스텀 이벤트 사용:
  ```js
  window.dispatchEvent(new CustomEvent('lesson-nav-home'));
  // main.js가 수신 → currentCleanup() 후 loadLesson(LESSONS[0]) 실행
  ```

## Raymarching 레슨 공통 패턴 (레슨 43~45)
- OrthographicCamera(-1,1,1,-1,0,1) + PlaneGeometry(2,2) 풀스크린 쿼드로 렌더링. THREE 지오메트리 없이 프래그먼트 셰이더가 전부 그림
- 가상 카메라는 구면좌표(theta/phi/radius) → uCamPos/Right/Up/Fwd uniform으로 전달, 레이 방향은 `uCamRight*uv.x + uCamUp*uv.y + uCamFwd*1.5` (⚠️ `+uCamFwd`, 마이너스 붙이면 씬 반대 방향으로 레이 발사됨 — 43 최초 구현 시 실제 발생한 버그)
- **마우스 드래그 방향은 반드시 `OrbitControls`와 일치시킬 것**: `theta -= dx*0.007`, `phi -= dy*0.007` (부호 반대로 하면 레슨마다 좌우/상하 반전이 달라져 사용자가 혼란스러움 — 43~45 최초 구현 시 부호가 반대라 수정한 이력 있음)
- **`uniform int`로 씬 분기 금지** — Windows(HLSL 변환) 환경에서 `uniform int == 상수` 비교가 `X4000: use of potentially uninitialized variable` 경고와 함께 셰이더가 항상 fallback만 반환하는 버그 발생. 반드시 `uniform float` + `if (uScene < 0.5)` 형태의 float 비교 사용
- SDF 큰값 sentinel은 `1e9` 대신 `99.0` 사용 (HLSL 큰값 처리 불안정성 회피)
- `map()` 함수는 씬별 서브함수로 분리하고 `if/else if/else` 체인으로 분기 (초기 구현 때 이른 `return`과 다중 `if` 산발 패턴이 HLSL에서 "uninitialized variable" 경고를 유발했음 — 반드시 `float best; if(...) best=... else if(...) ... else ...; return`처럼 단일 반환 지점 사용)
