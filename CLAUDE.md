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
    46-mandelbrot.js                         # Mandelbrot 2D 프랙탈 (탈출시간, Smooth Coloring, 커서중심 줌)
```

## 레슨 구조 규칙
- 각 레슨은 `export function init(renderer)` 하나만 export
- `init()`은 cleanup 함수를 반환해야 함
- cleanup: geometry/material/texture `.dispose()`, 이벤트 리스너 제거, `cancelAnimationFrame`
- `THREE.Clock` 대신 `import { Timer } from 'three'` 사용 (r168+ 권장)
- `THREE.PCFSoftShadowMap` 대신 `THREE.PCFShadowMap` 사용 (r185 deprecated)
- `makeLabel()` 류 헬퍼로 만든 스프라이트(`CanvasTexture` + `SpriteMaterial`)는 개별 변수로 추적하기 번거로우므로, cleanup 마지막에 `scene.traverse(o => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } })` 같은 catch-all 순회로 일괄 해제할 것 (46레슨 감사에서 8개 레슨이 이 텍스처를 누수하고 있었음 — `material.dispose()`는 `.map` 텍스처를 자동으로 해제하지 않음). 이미 개별 dispose된 geometry/material을 다시 dispose해도 에러 없이 안전하므로 중복 호출 걱정 없이 추가 가능
- 파일 헤더의 "배울 것" 목록 바로 뒤에 `🎯 실전 활용 예시:` 섹션을 반드시 포함 (레슨별 2~4개, 구체적이고 그 레슨 기법에 실제로 들어맞는 사례 — "3D 게임" 같은 두루뭉술한 예시 금지). 사용자가 "이걸 어디에 활용할지 모르겠다"고 요청해서 48레슨 전체에 소급 적용함(2026-07-15). 새 레슨을 만들 때도 처음부터 포함할 것

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

## 2D 프랙탈(Mandelbrot류) 커서 중심 줌 패턴 (레슨 46)
- 셰이더 좌표 매핑: `c = uCenter + uv * (BASE_SCALE / uZoom)` — JS 쪽 팬/줌 계산도 반드시 동일한 `BASE_SCALE` 상수를 써야 함(두 값이 다르면 커서 위치와 확대 중심이 어긋남)
- 마우스 `clientX/Y`는 CSS px, `canvas.width/height`는 device px(= CSS × devicePixelRatio, `renderer.setPixelRatio(window.devicePixelRatio)` 때문). 팬/줌 계산 시 `canvas.width / canvas.clientWidth`로 배율을 구해 CSS px → device px 변환 필수
- `gl_FragCoord.y`는 아래가 0(bottom-up), DOM `clientY`는 위가 0(top-down) — JS에서 uv를 계산할 때 y부호를 반전해야 함(`uvy = -(py - 0.5*height)/height`)
- 커서 중심 줌: 줌 전 커서 아래의 복소좌표(`cBefore`)를 구하고, 줌 후 `center = cBefore - uv*(BASE_SCALE/newZoom)`로 역산해 같은 지점이 커서 아래 유지되도록 함
- float32 정밀도 한계로 10⁶배 이상 확대하면 격자 아티팩트 발생 — UI에 안내 문구로 명시(정밀도 개선하려면 double-float emulation 필요, 별도 레슨 주제)

## 재귀/반복 SDF(프랙탈) 레슨 필수 최적화 (레슨48~)
- Menger Sponge, Sierpinski, Mandelbulb처럼 `map()` 내부에서 자체 반복 루프(3~15회)를 도는 SDF는, 반드시 함수 맨 앞에 값싼 바운딩 볼륨(`sdBox`/`sdSphere`) 거리를 먼저 계산하고 `if (bound > 0.02) return bound;`로 조기 반환할 것
- 이유: raymarch 루프가 최대 80~100스텝을 도는데, 바운딩 없이 매 스텝마다 전체 반복을 계산하면 레이가 프랙탈에서 멀리 떨어진 허공을 지날 때도 비싼 연산을 반복하게 되어 GPU가 감당 못 하고 **첫 프레임에서 조용히 멈춤** (에러 로그·context-lost 이벤트 없이 멈춰서 디버깅이 매우 어려움 — 48 최초 구현 시 실제로 겪은 문제, [[feedback_raymarching_shader]] 4번 참고)
- Menger처럼 `d = max(box, ...)` 형태로 정의되는 SDF는 바운딩 박스 거리가 항상 안전한 하한이라 정확성 훼손 없이 적용 가능. IFS 근사(Sierpinski 등)는 넉넉한 반지름의 sdSphere로 바운딩

## 자동화 브라우저로 애니메이션 검증 시 주의 (디버깅 함정)
- Claude Browser 등 자동화 프리뷰 탭이 `document.hidden === true`(포커스 없는 백그라운드 탭) 상태면 크롬이 `requestAnimationFrame`을 강하게 스로틀링/정지시켜, 코드가 멀쩡해도 애니메이션이 "멈춘 것처럼" 보이고 씬 전환 버튼도 화면에 반영 안 되는 것처럼 보임
- 애니메이션이 안 움직이는 것 같으면 가장 먼저 `document.hidden`을 확인. `true`면 코드 문제가 아님
- 이 상황에서도 로직만은 검증 가능: uniform의 **초기값**을 바꿔서 새로고침 후 최초 1회 렌더(frame 0)의 픽셀만 읽으면 rAF가 멎어 있어도 셰이더 분기가 맞는지 확인할 수 있음
- **`navigate()` 직후 바로 픽셀을 읽으면 리로드 완료 전 프레임을 읽을 위험이 있음** (49 디버깅 중 30분 넘게 "수치 불안정 버그"로 오판했지만 실제로는 타이밍 레이스였음). 신뢰도 높게 검증하려면: (1) `tabs_create()`로 매번 새 탭 (2) `navigate()` 두 번 호출(첫 호출 후 캔버스가 0×0인 경우가 흔함) (3) 클릭과 픽셀읽기를 별도 tool call로 분리. 이상 색이 소수 픽셀에서만 나오면 대개 테스트 타이밍 문제, 패턴 자체가 완전히 다르면 진짜 버그 — 9×9 그리드 샘플링으로 구분할 것
- **물리(cannon-es) 버그는 화면 렌더링과 무관하게 검증 가능**: 레슨에 `window.__dbg = { world, charBody, CANNON }` 같은 임시 훅을 걸고, 콘솔에서 `world.step(1/60)`을 직접 반복 호출하며 `charBody.position`을 매 스텝 로그로 추적하면 rAF가 멎어 있어도 충돌·슬라이딩·접지 판정을 정밀 검증 가능(레슨50에서 실제로 이 방법으로 두 가지 진짜 버그를 찾음). 검증 끝나면 훅을 반드시 제거하고 커밋할 것

## cannon-es 물리 엔진 주의사항 (레슨09, 50)
- **정적 장애물이 여러 개인 씬은 `SAPBroadphase` 대신 `NaiveBroadphase` 사용**할 것. SAPBroadphase는 회전된 Box 등이 섞인 씬에서 일부 충돌 쌍을 감지하지 못해 캐릭터가 특정 벽만 그냥 통과하는 버그가 실제로 발생함(위치별로 증상이 다르게 나타나 디버깅이 까다로움). 바디 수가 적으면(수십 개 이하) `NaiveBroadphase`(O(n²) 전수검사)로 바꿔도 성능 차이 없음 — 최적화보다 정확성을 먼저 챙길 것
- **바닥은 `CANNON.Plane()`(무한 평면) 대신 얇은 `CANNON.Box`를 쓸 것**. `CANNON.Plane()`은 레이캐스트 좌표에 `1e-17` 수준의 극미소 부동소수점 오차만 섞여도 AABB 겹침 판정을 놓쳐 항상 미스가 나는 정밀도 버그가 있음(캐릭터가 바닥에 안착해 `position.y`가 `-0.00004`처럼 미세하게 흔들리는 건 물리 엔진에서 정상인데, 그 상태에서 접지 감지 레이캐스트가 계속 실패해 "공중"으로 오판정됨). 시각적 바닥도 대개 유한한 크기이므로 `CANNON.Box(new CANNON.Vec3(halfW, 0.1, halfD))`로 대체하면 버그도 피하고 실제 크기와도 일치
- 지면 감지 레이캐스트는 캐릭터 자기 자신의 콜라이더에 맞지 않도록 `collisionFilterGroup`으로 캐릭터와 지형을 분리하고, `raycastClosest`의 `collisionFilterMask`로 지형 그룹만 검사할 것
- **캐릭터를 DYNAMIC Body로 만들 때 이동을 velocity 직접 지정으로 제어한다면, 캐릭터-바닥/벽 ContactMaterial의 friction은 "낮게"가 아니라 정확히 `0`으로 설정할 것** (`0.01`도 안 됨!). 마찰이 조금이라도 있으면: (a) 접촉 솔버가 매 프레임 지정한 속도를 도로 깎아먹어 뻑뻑하게 움직이고, (b) 더 심각하게는 — 벽 쪽으로 velocity를 계속 명령하며(방향키를 누른 채) 점프하면, 벽을 뚫지 않으려는 솔버의 큰 법선력 × 마찰계수가 벽면의 수직(Y) 접선 방향으로 작용해 **중력을 완전히 상쇄**해버려 캐릭터가 공중에 붙박여 안 떨어지는 버그가 실제로 발생함(레슨50에서 재현·확인). 정지는 마찰이 아니라 애니메이션 루프에서 수동으로 velocity를 감쇠시켜 처리
- cannon-es의 `Cylinder` shape는 Three.js `CylinderGeometry`와 동일하게 이미 Y축 정렬이라 별도 회전 보정이 필요 없음(오래된 cannon.js는 Z축 기준이라 다름)
