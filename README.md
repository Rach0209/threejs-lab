# threejs-lab

Three.js + WebGL 기반 3D 그래픽스 학습 프로젝트.
각 레슨을 인터랙티브하게 체험하며 3D 개념을 직접 확인할 수 있습니다.

🌐 **Live Demo**: [rach0209.github.io/threejs-lab](https://rach0209.github.io/threejs-lab/)

---

## 레슨 목록

| # | 주제 | 핵심 개념 |
|---|------|----------|
| 01 | Geometry 탐색 | Box, Sphere, Cone 등 기본 도형 |
| 02 | Material 비교 | Basic / Lambert / Phong / Standard / Toon |
| 03 | Light 조명 실험실 | Ambient / Directional / Point / Spot / Hemisphere |
| 04 | 태양계 미니 프로젝트 | 씬 그래프, 공전·자전, 피벗 패턴 |
| 05 | 텍스처와 지구본 | UV 매핑, normalMap, CanvasTexture |
| 06 | 인터랙션 (Raycasting) | 마우스 클릭 선택, 키보드 이동 |
| 07 | GLB 모델 임포트 | GLTFLoader, 드래그&드롭, AnimationMixer |
| 08 | 셰이더 입문 (GLSL) | Vertex / Fragment 셰이더 직접 작성 |
| 09 | 물리 엔진 (cannon-es) | 중력, 충돌, Three.js ↔ Cannon 동기화 |
| 10 | 파티클 시스템 | 은하수 15,000개 + 부유 파티클 |
| 11 | Feigenbaum 시각화 | 혼돈 이론 분기도, 수학 시뮬레이터 |

---

## 브랜치 전략

| 브랜치 | 역할 |
|--------|------|
| `main` | 안정된 소스 코드. `dev`에서 검증 후 merge. |
| `dev` | 개발 작업 브랜치. 새 레슨·기능은 여기서 작업. |
| `gh-pages` | 빌드 결과물 전용. GitHub Actions이 자동 관리 (직접 수정 X). |

`dev` → `main` merge 시 GitHub Actions이 자동으로 빌드하여 `gh-pages`에 배포합니다.

---

## 기술 스택

- **Three.js** r185 — WebGL 3D 렌더링
- **cannon-es** — JavaScript 물리 엔진
- **highlight.js** — 소스 코드 구문 강조
- **Vite** — 번들러

---

## 로컬 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```
